// In-page half of qa/break.py: invariants, a driver that taps the real host UI, and the story/mission/twist scenarios.
// Loaded into the host page (local mode) with page.evaluate; each scenario is run by index from Python.
(() => {
  const B = window.__B = {};
  const R = Math.random, pick = a => a[Math.floor(R() * a.length)];
  const _st = window.setTimeout;
  window.setTimeout = (f, ms, ...a) => _st(f, Math.min(ms || 0, 3), ...a); // timers run at once: holds, toasts, hand-backs
  window.confirm = () => true; window.alert = () => {}; window.prompt = () => "Zed";
  const POOL = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev", "Claire-Louise", "Bartholomew", "Zoë", "Mo", "D'Arcy", "Lee <b>", "José", "Wilhelmina"];
  const PHASES = ["lobby", "intro", "night0", "day", "mission", "shield", "mingle", "table", "reveal", "night", "morning", "endvote", "final2", "final"];
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 };
  let cur = "", roundAlive = {}, ghostSeen = {};
  B.fails = []; B.samples = {};
  const fail = (msg, ctx) => { if (B.fails.filter(f => f.sc === cur).length < 6) B.fails.push({ sc: cur, msg, ...(ctx || {}), phase: state && state.phase, mission: state && state.mission && state.mission.key + "/" + state.mission.stage }) };
  B.expect = (cond, msg, ctx) => { if (!cond) fail(msg, ctx); return !!cond };
  const tvText = s => { const pv = publicView(JSON.parse(JSON.stringify(s))), v = tvView(pv), d = document.createElement("div"); d.innerHTML = v.html + railHTML(pv, v.rail); return { pv, v, text: d.textContent, html: v.html } };
  B.tvText = tvText;

  // every tap: the rules that must hold whatever the host does
  B.inv = function (label, loose) {
    const s = state; if (!s) return;
    if (!PHASES.includes(s.phase)) fail("unknown phase " + s.phase, { label });
    if (s.players.some(p => !p.alive && p.shield)) fail("dead player holds a shield", { label });
    const aliveN = s.players.filter(p => p.alive).length, ra = roundAlive[s.round] = Math.max(roundAlive[s.round] || 0, aliveN);
    if (s.players.filter(p => p.alive && p.shield).length > Math.max(1, Math.floor(ra / 4))) fail("more shields than a quarter of the table", { label });
    if (!Number.isInteger(s.pot) || s.pot < 0) fail("bad pot " + s.pot, { label });
    if (s.champion && (s.champion.round > s.round || !s.players.some(p => p.id === s.champion.id))) fail("stale or unknown Champion", { label });
    if (s.mission && s.mission.secIds && s.mission.secIds.length > s.mission.secMax) fail("mission secret shields over cap", { label });
    if (s.phase === "table" && s.table) {
      const t = s.table, w = bladeLive(s), want = {};
      for (const [vtr, tg] of Object.entries(t.ballots || {})) {
        if (!s.players.find(p => p.id === vtr && p.alive)) fail("ballot from a non-voter", { label });
        if (tg !== "blank" && !s.players.find(p => p.id === tg && p.alive)) fail("ballot against someone not at the table", { label });
        if ((t.immune || []).includes(tg)) fail("ballot against an immune player", { label });
        if (t.revote && tg !== "blank" && !t.revote.includes(tg)) fail("revote ballot for someone who wasn't tied", { label });
        if (tg !== "blank") want[tg] = (want[tg] || 0) + (vtr === w && t.stage === "exile" ? 2 : 1);
      }
      if (JSON.stringify(Object.entries(want).sort()) !== JSON.stringify(Object.entries(t.votes || {}).filter(e => e[1]).sort())) fail("tally doesn't match the boards", { label, want, votes: t.votes });
    }
    if (s.mission && s.mission.key === "hilo" && s.mission.standing && s.mission.standing.some(id => !s.players.find(p => p.id === id && p.alive))) fail("a dead player still standing in Higher or Lower", { label });
    for (const g in (s.ghosts || {})) { const gp = s.players.find(q => q.id === g); if (gp && gp.role === "cloak") fail("a Cloak Ghost gave a verdict", { label }) }
    if (!loose) for (const g in (s.ghosts || {})) if (ghostSeen[g] && ghostSeen[g] !== s.ghosts[g].pick) fail("ghost verdict overwritten", { label });
    ghostSeen = {}; for (const g in (s.ghosts || {})) ghostSeen[g] = s.ghosts[g].pick;
    const ht = document.querySelector("#host") ? document.querySelector("#host").innerText : "";
    if (/undefined|NaN|\[object|null/.test(ht.replace(/annulled/g, ""))) fail("host text: " + (ht.match(/.{0,40}(undefined|NaN|\[object|null).{0,40}/) || [""])[0], { label });
    if (document.documentElement.scrollWidth > innerWidth + 1) fail("host horizontal overflow", { label });
    let t;
    try { t = tvText(s) } catch (e) { fail("tv render threw: " + e.message, { label }); return }
    const { pv, v, text } = t;
    if (/undefined|NaN|\[object|null/.test(text)) fail("tv text: " + (text.match(/.{0,40}(undefined|NaN|\[object|null).{0,40}/) || [""])[0], { label });
    if (pv.hostPin || pv.prev || pv.log || pv.voteLog || pv.roundSnap || pv.quest || pv.witness) fail("public view leaks pin/prev/log/history/quest/witness", { label });
    if (s.phase !== "final") for (const p of pv.players) { const real = s.players.find(q => q.id === p.id); if (p.role && !real.revealed) fail("public view leaks a role", { label }) }
    if (pv.players.some(p => p.shield && p.shield !== "public")) fail("public view leaks a secret shield", { label });
    if (pv.mission && s.mission) {
      const m = pv.mission, sm = s.mission;
      if (["before", "secIds", "winId", "witnessId", "mystery", "mysteryDone"].some(k => k in m)) fail("public view leaks mission secrets", { label });
      if (Array.isArray(m.qs) && m.qs.some((x, i) => x && (i !== sm.qi || (!sm.shouter && !sm.showA && x.q && x.q[1])))) fail("public view leaks quiz answers", { label });
      if (Array.isArray(m.sd) && m.sd.length > 1) fail("public view leaks the sudden-death list", { label });
      if ("changed" in m && !sm.showA) fail("public view leaks what changed", { label });
      if ("picks" in m && !sm.result) fail("public view leaks the Dilemma picks", { label });
    }
    if (pv.night && s.night) {
      if (pv.night.questOpts) fail("public view leaks quest options", { label });
      if (!s.night.confirmed && pv.night.mode !== "murder") fail("public view leaks the kind of night", { label });
    }
    if (s.phase === "morning" && !s.morning.revealed) {
      if (s.morning.kind === "murder" && pv.players.find(p => p.id === s.morning.victimId).alive !== true) fail("the TV knows the victim before dawn", { label });
      if (s.morning.victimId && text.includes(s.players.find(p => p.id === s.morning.victimId).name + " was")) fail("the TV names the victim before dawn", { label });
    }
    if (s.phase !== "final" && s.morning && s.morning.convert && /convert|refus|joined|accepted/i.test(text)) fail("the TV gives away a conversion", { label, text: text.slice(0, 200) });
    // the prize is a surprise: never on the TV, the wire or the host's screen until the game is won
    if (s.prize && s.phase !== "final") {
      if (text.includes(s.prize)) fail("the TV names the prize before the end", { label });
      if (ht.includes(s.prize)) fail("the host screen names the prize before the end", { label });
      if ("prize" in pv) fail("the prize is on the wire before the end", { label });
    }
    if (s.phase === "final") {
      if (s.prize && !s.finalStep && !text.includes(s.prize)) fail("the final screen doesn't name the prize", { label });
      if (s.finalStep === 1 && !/The Awards/.test(text)) fail("the awards step doesn't show the awards", { label });
      if (s.awards && (s.awards.length > 12 || (s.awards.length > 1 && ![2, 4, 6, 8, 12].includes(s.awards.length)))) fail("awards don't fill a grid", { label, n: s.awards.length });
      if (s.awards) { const nm = s.awards.flatMap(a => a.names); if (new Set(nm).size !== nm.length) fail("someone won two awards", { label, nm }) }
      if (s.finalStep === 1 && (s.awards || []).slice(0, s.awardShown || 0).some(a => !(a.names || []).length || !text.includes(a.names[0]))) fail("an award names nobody, or the TV leaves the name off", { label, awards: s.awards });
      if (((s.prizeIds || []).length >= 2) !== !!s.rps) fail("play-off doesn't match the number of winners", { label, ids: s.prizeIds, rps: s.rps });
      const lt = s.players.filter(p => p.alive && p.role === "cloak").length;
      if (s.winner !== (lt ? "cloaks" : "candles")) fail("winner inconsistent", { label });
      if (!s.players.every(p => p.revealed)) fail("not all revealed at the end", { label });
    }
    const key = v.key + "|" + (v.norail ? 1 : 0) + "|" + s.players.length;
    if (!B.samples[key] && Object.keys(B.samples).length < 400) B.samples[key] = JSON.parse(JSON.stringify(pv));
  };

  B.scope = () => { const sheets = [...document.querySelectorAll("#host .sheet")]; return sheets.length ? sheets[sheets.length - 1] : document.querySelector("#host") };
  B.buttons = () => [...B.scope().querySelectorAll("button:not([disabled])")].filter(vis);
  B.tap = (re, label) => { const b = B.buttons().find(b => re.test(b.textContent.trim())); if (!b) return false; holdEndAt = 0; b.click(); B.inv(label || String(re)); return true };
  B.has = re => B.buttons().some(b => re.test(b.textContent.trim()));
  B.menu = re => { B.tap(/^Menu$/); const ok = B.tap(re, "menu " + re); if (!ok) B.tap(/^Close/); return ok };
  // tap at random, forward-leaning, until `until()` holds; no undo, menu or wipe unless asked
  B.drive = async (until, max, opt) => {
    opt = opt || {}; max = max || 2500;
    for (let i = 0; i < max; i++) {
      if (!state) return false;
      if (until()) return true;
      if (i % 30 === 0) await new Promise(r => _st(r, 0));
      const sc = B.scope(), inMenu = /^Menu/.test(sc.textContent) && sc.classList.contains("sheet");
      const btns = B.buttons(); if (!btns.length) { fail("no enabled buttons", {}); return false }
      const w = b => { const t = b.textContent.trim();
        if (/New game|wipe|Wipe/i.test(t)) return 0;
        if (inMenu) return /^Close/.test(t) ? 1 : 0;
        if (t === "Menu") return 0; if (t === "Undo") return opt.undo || 0; if (t === "−" || t === "+") return .3;
        if (opt.avoid && opt.avoid.test(t)) return 0;
        if (b.closest(".foot")) return b.classList.contains("primary") || b.classList.contains("danger") ? 9 : 2;
        if (/Finish mission/.test(t)) return state.mission && ["quiz", "countdown", "estimate", "likely"].includes(state.mission.key) ? .5 : 1.6;
        if (/full script|Unpick|Clear votes|Clear all|Show the log|Hide the log|Question bank/.test(t)) return .1; if (/^Done$|^Cancel$/.test(t)) return 4; return 1 };
      const ws = btns.map(w), tot = ws.reduce((a, b) => a + b, 0); if (!tot) { fail("only forbidden buttons", { btns: btns.map(b => b.textContent.trim().slice(0, 30)) }); return false }
      let r = R() * tot, b = btns[0]; for (let k = 0; k < btns.length; k++) { r -= ws[k]; if (r <= 0) { b = btns[k]; break } }
      const label = b.textContent.trim().slice(0, 40);
      if (R() < .1) { const pts = document.querySelector("#pts"); if (pts) pts.value = pick(["0", "50", "120", ""]) }
      holdEndAt = 0; // taps here are far apart in a real game; the swallow window after a reveal is tested in part 2
      try { b.click() } catch (e) { fail("click threw: " + e.message, { label }); return false }
      B.inv(label, label === "Undo");
      if (opt.each) opt.each(label);
    }
    return until();
  };
  B.toPhase = (ph, max, opt) => B.drive(() => state && (Array.isArray(ph) ? ph.includes(state.phase) : state.phase === ph), max, opt);
  B.finish = async (max) => { const ok = await B.drive(() => state && state.phase === "final", max || 4000); if (!ok) fail("game did not reach the end", { round: state && state.round, alive: state && aliveOf(state).length }); return ok };

  B.fresh = (n, T, names) => {
    if (state) newGame(); handoff = null; roundAlive = {}; ghostSeen = {};
    renderHost();
    names = names || [...POOL].sort(() => R() - .5).slice(0, n);
    document.querySelector("#names").value = names.join("\n"); document.querySelector("#pinset").value = "1";
    document.querySelector("#cloaks").value = T ? String(T) : "";
    holdEndAt = 0; [...document.querySelectorAll("#host button")].find(b => /Start game/.test(b.textContent)).click();
    if (!state) { fail("game did not start", { alert: (document.querySelector("#host [role=alert]") || {}).textContent }); return false }
    return true;
  };
  // fix the roles: the first k seats are the Cloaks
  B.roles = k => act(s => { s.players.forEach((p, i) => p.role = i < k ? "cloak" : "candle") });
  B.T = () => aliveOf(state).filter(p => p.role === "cloak");
  B.F = () => aliveOf(state).filter(p => p.role === "candle");
  // straight to a Reckoning from wherever the day is
  B.toTable = () => { handoff = null; if (state.phase !== "table") openTable("test"); if (state.table.stage === "talk") act(s => { s.table.stage = "votes" }) };
  // every board, in seat order, for these targets (a function of the voter)
  B.boards = fn => { for (const p of aliveOf(state)) { if (p.id in (state.table.ballots || {})) continue; const t = fn(p); castBallot(p.id, t) } B.inv("boards"); B.tap(/^All boards in/, "to the exile") };
  const ix = (A, p) => A.findIndex(q => q.id === p.id);
  B.exile = id => { exile(id); B.tap(/^Exile /, "confirm exile") };
  B.night = (mode, victim, answer) => {
    if (state.phase !== "night") startNight();
    act(s => { s.night.mode = mode; s.night.answer = null });
    beginNight();
    const sc = () => nightScript(state.night, state);
    for (let i = 0; i < 60 && state.phase === "night"; i++) {
      const l = norm(sc()[Math.min(state.night.step, sc().length - 1)] || {});
      if (l.pick) { if (mode === "murder") act(s => { s.night.victimId = victim }); else act(s => { s.night.targetId = victim; s.night.targetName = P2(s, victim).name; s.night.answer = null }) }
      if (l.answer) act(s => { s.night.answer = answer });
      B.inv("night line " + state.night.step);
      if (state.night.step < sc().length - 1) act(s => { s.night.step++ }); else finishNight();
    }
    B.inv("to dawn");
  };

  const MKEYS = MISSIONS.map(m => m.key);
  const S = B.SC = [];
  const sc = (name, fn) => S.push({ name, fn });

  /* ---------------- the story, host and guest ---------------- */
  sc("convert accepted: dawn reads exactly like a quiet night on the TV", async () => {
    B.fresh(8, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[0];
    B.toTable(); B.boards(p => p.id === B.F()[1].id ? B.F()[2].id : B.F()[1].id); B.exile(B.F()[1].id); holdClick("reveal"); B.inv("reveal");
    startNight(); B.night("convert", f.id, "yes");
    const convertTV = tvText(state).html; act(s => { s.morning.revealed = true }); const after = tvText(state).html;
    B.expect(P(f.id).role === "cloak", "the convert turned");
    B.expect(state.morning.kind === "quiet" && state.morning.convert, "morning is quiet with the convert flag", state.morning);
    const s2 = JSON.parse(JSON.stringify(state)); s2.morning = { kind: "quiet", revealed: true, lastEnd: null, lastDone: false };
    const quietTV = tvView(publicView(s2)).html;
    B.expect(after.replace(/\d+/g, "") === quietTV.replace(/\d+/g, ""), "TV after dawn identical to a quiet night");
    B.expect(/stays secret/.test(document.querySelector("#host").innerText) || (renderHost(), /stays secret/.test(document.querySelector("#host").innerText)), "host told the conversion stays secret");
    B.expect(!/convert/i.test(convertTV), "TV holding card says nothing of a conversion");
  });
  sc("convert refused: nothing changes, quiet morning, host note says refusal", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[0];
    startNight(); B.night("convert", f.id, "no"); act(s => { s.morning.revealed = true }); renderHost();
    B.expect(P(f.id).role === "candle" && P(f.id).alive, "refuser stays a Candle and alive");
    B.expect(state.morning.kind === "quiet" && state.morning.refused, "quiet morning, refused flag");
    B.expect(/refusal stays secret/.test(document.querySelector("#host").innerText), "host note mentions the refusal");
  });
  sc("bargain refused: the refuser dies and dawn announces a murder", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[0];
    startNight(); B.night("bargain", f.id, "no");
    B.expect(!P(f.id).alive && state.morning.kind === "murder" && state.morning.victimId === f.id, "refuser murdered", state.morning);
    const pre = tvText(state); B.expect(pre.pv.players.find(p => p.id === f.id).alive === true, "still alive on the TV before dawn");
  });
  sc("bargain refused by a shield holder: a failed murder, not a death", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[0];
    act(s => { P2(s, f.id).shield = "secret" }); startNight(); B.night("bargain", f.id, "no");
    B.expect(P(f.id).alive && state.morning.kind === "shield", "shield saved them", state.morning);
  });
  sc("bargain accepted: joins the Cloaks, quiet morning", async () => {
    B.fresh(10, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[0];
    startNight(); B.night("bargain", f.id, "yes");
    B.expect(P(f.id).role === "cloak" && state.morning.kind === "quiet", "joined quietly");
  });
  sc("poisoning a secret-shield holder: the TV never names them, the morning says a shield worked", async () => {
    B.fresh(8, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[2];
    act(s => { P2(s, f.id).shield = "secret" }); startNight(); act(s => { s.night.mode = "murder" }); beginNight();
    let named = false;
    for (let i = 0; i < 40 && state.phase === "night"; i++) {
      const scr = nightScript(state.night, state), l = norm(scr[Math.min(state.night.step, scr.length - 1)] || {});
      if (l.pick) act(s => { s.night.victimId = f.id });
      const t = tvText(state); if (t.text.includes(f.name) && !t.v.norail && /shield/i.test(t.text)) named = true;
      if (state.night.step < scr.length - 1) act(s => { s.night.step++ }); else finishNight();
    }
    B.expect(state.morning.kind === "shield" && P(f.id).alive, "a failed murder", state.morning);
    act(s => { s.morning.revealed = true }); const t = tvText(state).text;
    B.expect(!t.includes(f.name + " held") && !named, "the shield holder is never named on the TV");
  });
  sc("the last Cloak exiled mid-game: the host is steered to end it, the Candles win", async () => {
    B.fresh(8, 1); B.roles(1); await B.toPhase("day"); const t0 = B.T()[0];
    B.toTable(); B.boards(p => p.id === t0.id ? B.F()[0].id : t0.id); B.exile(t0.id); holdClick("reveal"); renderHost();
    B.expect(/End-game vote|final ceremony/i.test(document.querySelector("#host .foot").innerText), "the foot offers the end", document.querySelector("#host .foot").innerText);
    B.expect(!B.has(/Into the night/), "no night with no Cloaks");
    await B.finish(); B.expect(state.winner === "candles", "Candles win");
  });
  sc("Cloaks reach parity at four: End or Exile decides it", async () => {
    B.fresh(5, 2); B.roles(2); await B.toPhase("day");
    B.toTable(); const f = B.F(); B.boards(p => p.id === f[0].id ? f[1].id : f[0].id); B.exile(f[0].id); holdClick("reveal"); renderHost();
    B.expect(endCheck(), "2 v 2 is the end");
    B.expect(/End or Exile — four left/.test(document.querySelector("#host .foot").innerText), "four left: End or Exile, even at 2 v 2", document.querySelector("#host .foot").innerText);
    await B.finish(); B.expect(state.phase === "final" && !!state.winner, "the vote decides it, and the game ends");
  });
  sc("an exiled Cloak becomes a Ghost with no verdict; a Candle Ghost gets one, once", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const t0 = B.T()[0], f0 = B.F()[0];
    B.toTable(); B.boards(p => p.id === t0.id ? f0.id : t0.id); B.exile(t0.id); holdClick("reveal");
    act(s => { P2(s, f0.id).alive = false }); act(s => { s.phase = "morning"; s.morning = { kind: "quiet", revealed: true } }); renderHost();
    const ht = document.querySelector("#host").innerText;
    B.expect(/Cloak — no verdict/.test(ht), "the Cloak Ghost shows 'no verdict'");
    ghostGuess(t0.id, f0.id); B.expect(!(state.ghosts || {})[t0.id], "a Cloak Ghost's verdict is refused");
    ghostGuess(f0.id, B.T()[0].id); ghostGuess(f0.id, B.F()[1].id);
    B.expect(state.ghosts[f0.id].pick === B.T()[0].id, "one verdict, locked");
  });
  sc("the quest's named Candle is never tonight's victim (40 nights)", async () => {
    B.fresh(8, 2); B.roles(2); await B.toPhase("day"); let bad = 0, n = 0;
    for (let k = 0; k < 40; k++) {
      startNight(); const o = (state.night.questOpts || []).find(x => /\{F\}/.test(x.text)); if (!o) continue; questPick(o.i);
      const v = pick(B.F()); act(s => { s.night.mode = "murder" }); beginNight(); act(s => { s.night.victimId = v.id });
      const qs = state.night.questStep; if (typeof qs !== "number" || qs < 0) { act(s => { s.phase = "day"; s.night = null }); continue }
      act(s => { s.night.step = qs }); n++;
      if (state.night.quest && state.night.quest.includes(v.name)) bad++;
      if (/\{F\}/.test(state.night.quest || "")) bad++;
      act(s => { s.phase = "day"; s.night = null });
    }
    B.expect(n > 5 && !bad, "the quest never names the victim or keeps a placeholder", { n, bad });
  });
  sc("a poison side-quest is dropped on a convert night", async () => {
    B.fresh(8, 2); B.roles(2); await B.toPhase("day"); let seen = 0;
    for (let k = 0; k < 30 && !seen; k++) {
      startNight(); const o = (state.night.questOpts || []).find(x => x.poison); if (!o) { act(s => { s.phase = "day"; s.night = null }); continue }
      questPick(o.i); act(s => { s.night.mode = "convert" }); beginNight(); seen++;
      B.expect(!state.night.quest && !state.quest, "no poison quest on a convert night", { q: state.night.quest });
    }
    B.expect(seen, "a poison quest came up to test");
  });
  sc("a tie goes to a revote between the tied only; a second tie can go to everyone", async () => {
    B.fresh(8, 2); B.roles(2); await B.toPhase("day"); B.toTable();
    const A = aliveOf(state), a = A[2], b = A[3];
    B.boards(p => p.id === a.id ? b.id : p.id === b.id ? a.id : (ix(A, p) % 2 ? a.id : b.id)); renderHost();
    B.expect(B.has(/^Revote between/), "revote between the tied offered");
    B.tap(/^Revote between/); B.expect(JSON.stringify(state.table.revote.sort()) === JSON.stringify([a.id, b.id].sort()), "only the tied are on the ballot");
    castBallot(A[0].id, A[5].id); B.expect(!(A[0].id in state.table.ballots), "a ballot for someone not tied is refused");
    B.boards(p => p.id === a.id ? b.id : p.id === b.id ? a.id : (ix(A, p) % 2 ? a.id : b.id)); renderHost();
    B.expect(B.has(/^Revote — everyone/) || B.has(/^Revote between/), "a way forward after a second tie", B.buttons().map(x => x.textContent.trim().slice(0, 30)));
    B.expect(document.querySelectorAll("#host .plist button").length >= 2, "the host can still exile one of the tied");
  });
  sc("every board blank: no exile forced, a clear way forward", async () => {
    B.fresh(7, 2); B.roles(2); await B.toPhase("day"); B.toTable(); B.boards(() => "blank"); renderHost();
    B.expect(!Object.keys(state.table.votes || {}).length, "no votes counted");
    B.expect(B.has(/Revote|Clear all/), "revote offered", B.buttons().map(x => x.textContent.trim().slice(0, 30)));
    B.expect(/Not one name was chalked/.test(document.querySelector("#host").innerText), "the host is told nobody was named");
    B.inv("all blank");
  });
  sc("the Champion's board counts twice and decides a split", async () => {
    B.fresh(8, 2); B.roles(2); await B.toPhase("day"); const A = aliveOf(state);
    act(s => { s.champion = { id: A[0].id, round: s.round } }); B.toTable();
    B.boards(p => p.id === A[0].id ? A[4].id : (ix(A, p) % 2 ? A[4].id : A[5].id));
    B.expect(state.table.votes[A[4].id] === state.table.votes[A[5].id] + 1 || state.table.votes[A[4].id] > state.table.votes[A[5].id], "the Champion's two count", state.table.votes);
  });
  sc("a voter who leaves mid-vote: their board comes off, the count follows", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); B.toTable(); const A = aliveOf(state);
    castBallot(A[0].id, A[5].id); castBallot(A[1].id, A[5].id); playerLeft(A[0].id); B.inv("left mid-vote");
    B.expect(!(A[0].id in state.table.ballots) && state.table.votes[A[5].id] === 1, "the leaver's board is gone", state.table);
  });
  sc("the player everyone voted for leaves: votes against them vanish", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); B.toTable(); const A = aliveOf(state);
    castBallot(A[0].id, A[5].id); castBallot(A[1].id, A[5].id); castBallot(A[2].id, A[6].id); playerLeft(A[5].id); B.inv("target left");
    B.expect(!Object.values(state.table.ballots).includes(A[5].id), "no ballot names a player who left", state.table.ballots);
    B.expect(nextVoter(state) && nextVoter(state).id === A[0].id, "those voters vote again", nextVoter(state));
  });
  sc("the Champion leaves: the double board goes with them", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const A = aliveOf(state);
    act(s => { s.champion = { id: A[0].id, round: s.round } }); B.toTable(); castBallot(A[0].id, A[4].id); playerLeft(A[0].id); B.inv("champion left");
    B.expect(!championOf(state) && !(state.table.votes || {})[A[4].id], "no Champion, no double vote", state.table);
  });
  sc("a shield holder leaves: the shield goes with them", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const A = aliveOf(state);
    act(s => { P2(s, A[3].id).shield = "public" }); playerLeft(A[3].id); B.inv("shield left");
    B.expect(!P(A[3].id).shield, "shield gone");
  });
  sc("the only Cloak leaves: the host is told to call the final", async () => {
    B.fresh(7, 1); B.roles(1); await B.toPhase("day"); playerLeft(B.T()[0].id); renderHost();
    B.expect(advice().lvl === "final" && /No Cloaks left/.test(advice().text) && /final/.test(advice().text), "advice: no Cloaks left, call the final", advice());
    await B.finish(); B.expect(state.winner === "candles", "Candles win");
  });
  sc("a Candle leaves and hands the Cloaks parity", async () => {
    B.fresh(5, 2); B.roles(2); await B.toPhase("day"); playerLeft(B.F()[0].id); renderHost();
    B.expect(endCheck() && advice().lvl === "final" && /outnumber/.test(advice().text), "parity: call the final advised", advice());
    B.tap(/End game now|final ceremony/i) || startCeremony(); await B.finish(); B.expect(state.winner === "cloaks", "Cloaks win");
  });
  sc("the poisoned player leaves before dawn", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[0];
    startNight(); act(s => { s.night.mode = "murder" }); beginNight(); act(s => { s.night.victimId = f.id });
    playerLeft(f.id); B.inv("victim left mid-night");
    for (let i = 0; i < 40 && state.phase === "night"; i++) { const scr = nightScript(state.night, state); if (state.night.step < scr.length - 1) act(s => { s.night.step++ }); else { B.tap(/To dawn|Pick/); if (state.phase === "night") finishNight() } }
    B.inv("dawn after leaver"); renderHost();
    B.expect(state.phase === "morning", "the night still ends", state.phase);
    B.expect(!(state.morning.kind === "murder" && state.morning.victimId === f.id), "a player who left isn't announced as murdered", state.morning);
  });
  sc("the convert target leaves before answering", async () => {
    B.fresh(9, 2); B.roles(2); await B.toPhase("day"); const f = B.F()[0];
    startNight(); act(s => { s.night.mode = "convert" }); beginNight(); act(s => { s.night.targetId = f.id; s.night.targetName = f.name });
    playerLeft(f.id); B.inv("target left mid-night"); renderHost();
    B.expect(B.buttons().length > 0, "night still has a way on");
    await B.drive(() => state.phase === "morning", 200); B.expect(state.phase === "morning", "the night still ends");
  });
  sc("rename mid-game to an HTML-ish, accented, max-length name: escaped everywhere", async () => {
    B.fresh(8, 2); await B.toPhase("day"); const p = aliveOf(state)[0];
    renamePlayer(p.id, "<i>Zoë</i>&'\"x"); B.inv("rename"); const t = tvText(state);
    B.expect(!/<i>Zoë/.test(t.html) || /&lt;i&gt;/.test(t.html), "TV escapes the name");
    B.expect(!document.querySelector("#host i") || !/Zoë/.test(document.querySelector("#host i").textContent), "host escapes the name");
  });
  sc("seating changed mid-vote: the next board follows the new order", async () => {
    B.fresh(8, 2); await B.toPhase("day"); B.toTable(); const A = aliveOf(state);
    castBallot(A[0].id, A[3].id); moveSeat(A[5].id, -4); B.inv("move seat");
    const nv = nextVoter(state); B.expect(nv && nv.id === aliveOf(state).find(p => !(p.id in state.table.ballots)).id, "next voter is the first un-voted in the new order");
  });
  sc("the Champion lays down shield and blade: votes against them are refused; a plain shield can't be shown", async () => {
    B.fresh(8, 2); await B.toPhase("day"); const A = aliveOf(state);
    act(s => { P2(s, A[2].id).shield = "public"; P2(s, A[4].id).shield = "secret"; s.champion = { id: A[2].id, round: s.round } }); handoff = null; openTable("t"); renderHost();
    B.expect(!/show their shield/i.test(document.querySelector("#host").innerText), "no way to show a plain shield");
    championImmunity(); act(s => { s.table.stage = "votes" }); castBallot(A[0].id, A[2].id); castBallot(A[1].id, A[2].id); B.inv("champion laid down");
    B.expect(!Object.values(state.table.ballots).includes(A[2].id) && !P(A[2].id).shield && !championOf(state), "immune; shield and blade spent", state.table);
    B.expect(/laid down shield and blade/.test(tvText(state).text), "the TV marks it");
  });
  sc("four players, one Cloak: a whole game to the end", async () => { B.fresh(4); B.expect(B.T().length === 1, "one Cloak at 4"); await B.finish() });
  sc("five players get one Cloak by default", async () => { B.fresh(5); B.expect(B.T().length === 1, "one Cloak at 5", B.T().length); await B.finish() });
  sc("fourteen players, three Cloaks: a whole game to the end", async () => { B.fresh(14, 0, POOL.slice(0, 14)); B.expect(B.T().length === 3, "three Cloaks at 14"); await B.finish() });
  sc("fourteen long names: a whole game", async () => { B.fresh(14, 0, ["Wilhelminaaaaaa", "Bartholomewwwww", "Claire-Louiseee", "Maximilianussss", "Anastasiaaaaaaa", "Christopherrrrr", "Konstantinossss", "Evangelineeeeee", "Jacquelineeeeee", "Montgomeryyyyyy", "Persephoneeeeee", "Theodoraaaaaaaa", "Alexandraaaaaaa", "Sebastiannnnnnn"]); await B.finish() });
  sc("undo storm at the Reckoning: thirty undos never break the state", async () => {
    B.fresh(8, 2); await B.toPhase("table"); B.boards(p => aliveOf(state).find(q => q.id !== p.id).id);
    for (let i = 0; i < 30; i++) { if (canUndo()) undo(); B.inv("undo " + i, true) }
    await B.finish();
  });
  sc("undo storm in the night", async () => { B.fresh(9, 2); await B.toPhase("night"); for (let i = 0; i < 12; i++) { await B.drive(() => false, 3); } for (let i = 0; i < 25; i++) { if (canUndo()) undo(); B.inv("undo", true) } await B.finish() });
  sc("undo storm at dawn", async () => { B.fresh(8, 2); await B.toPhase("morning"); for (let i = 0; i < 25; i++) { if (canUndo()) undo(); B.inv("undo", true) } await B.finish() });
  sc("undo storm in the final ceremony", async () => { B.fresh(6, 2); await B.toPhase("final2", 4000); for (let i = 0; i < 3; i++) await B.drive(() => false, 2); for (let i = 0; i < 25; i++) { if (canUndo()) undo(); B.inv("undo", true) } await B.finish() });
  sc("undo then redo-by-tapping through a mission", async () => { B.fresh(8, 2); await B.toPhase("mission"); for (let k = 0; k < 6; k++) { await B.drive(() => false, 4); if (canUndo()) undo(); B.inv("undo", true) } await B.finish() });
  sc("rewind the round from the night: back to the morning's state, and undo brings it back", async () => {
    B.fresh(9, 2); await B.toPhase("day"); await B.toPhase("night"); const r = state.round, alive0 = state.roundSnap && state.roundSnap.round === r;
    if (!alive0) { B.expect(true, ""); await B.finish(); return }
    rewindRound(); B.inv("rewind", true); B.expect(state.round === r && ["day", "morning"].includes(state.phase), "back to the start of round " + r, state.phase);
    undo(); B.inv("undo rewind", true); B.expect(state.phase === "night", "undo returns to the night", state.phase);
    await B.finish();
  });
  sc("rewind from the Reckoning mid-boards", async () => {
    B.fresh(9, 2); await B.toPhase("day"); await B.toPhase("table"); castBallot(aliveOf(state)[0].id, aliveOf(state)[1].id);
    if (state.roundSnap && state.roundSnap.round === state.round) { B.tap(/^Menu$/); const ok = B.tap(/^Rewind/); if (ok) B.tap(/^Rewind$/); B.inv("rewind", true) }
    await B.finish();
  });
  sc("End game now from the Menu mid-mission", async () => { B.fresh(8, 2); await B.toPhase("mission"); B.menu(/End game now/); B.tap(/End the game/); B.inv("end now", true); B.expect(state.phase === "final2", "to the ceremony", state.phase); await B.finish() });
  sc("End game now from the Menu mid-night", async () => { B.fresh(8, 2); await B.toPhase("night"); B.menu(/End game now/); B.tap(/End the game/); B.inv("end now", true); await B.finish() });
  sc("jump to the Reckoning from the Menu with a mission half-played", async () => { B.fresh(8, 2); await B.toPhase("mission"); await B.drive(() => false, 5); B.menu(/Reckoning/); B.inv("jump", true); B.expect(state.phase === "table" && !state.mission, "clean jump", state.phase); await B.finish() });
  sc("skip to the next round from the Menu mid-vote", async () => { B.fresh(8, 2); await B.toPhase("table"); castBallot(aliveOf(state)[0].id, aliveOf(state)[1].id); B.menu(/Skip to next round/); B.inv("skip", true); B.expect(state.phase === "day" && !state.table || state.phase === "day", "next round", state.phase); await B.finish() });
  sc("make this round the final, then cancel it, then make it again", async () => { B.fresh(8, 2); await B.toPhase("day"); declareFinal(); act(s => { s.finalRound = null }); declareFinal(); B.inv("final toggles"); await B.finish() });
  sc("a player leaves during the final ceremony", async () => { B.fresh(7, 2); await B.toPhase("final2", 4000); const A = aliveOf(state); if (A.length > 2) { playerLeft(A[A.length - 1].id); B.inv("left in final2", true) } await B.finish() });
  sc("a player leaves during the end-game vote", async () => {
    B.fresh(7, 2); const ok = await B.toPhase(["endvote", "final"], 5000); if (state.phase === "endvote") { playerLeft(aliveOf(state)[0].id); B.inv("left in endvote", true); renderHost(); B.expect(B.buttons().length, "still a way on") } await B.finish();
  });
  sc("a player leaves during the reveal, before the hold", async () => { B.fresh(8, 2); await B.toPhase("reveal"); if (state.table.step === 0) { const other = aliveOf(state)[0]; playerLeft(other.id); B.inv("left in reveal", true) } await B.finish() });
  sc("a player leaves during a mingle", async () => { B.fresh(8, 2); await B.toPhase("day"); startBreak("mingle"); playerLeft(aliveOf(state)[1].id); B.inv("left in mingle", true); await B.finish() });
  sc("a player leaves in the lobby", async () => { B.fresh(8, 2); playerLeft(aliveOf(state)[0].id); B.inv("left in lobby", true); await B.finish() });
  sc("a player leaves during night zero", async () => { B.fresh(8, 2); await B.toPhase("night0"); playerLeft(B.T()[0].id); B.inv("cloak left in night0", true); await B.finish() });
  sc("half the table leaves in one round", async () => { B.fresh(12, 3); await B.toPhase("day"); for (let i = 0; i < 6; i++) { const A = aliveOf(state); playerLeft(A[A.length - 1].id); B.inv("mass exit", true) } await B.finish() });
  sc("the TV is blacked out and paused mid-reveal, then restored", async () => { B.fresh(8, 2); await B.toPhase("reveal"); act(s => { s.tvBlack = true }); B.inv("black"); act(s => { s.tvPause = true; s.tvBlack = false }); B.inv("pause"); act(s => { s.tvPause = false }); await B.finish() });
  sc("side-quests switched off: nights run with no quest offer", async () => { B.fresh(8, 2); act(s => { s.questsOn = false }); await B.toPhase("night"); B.expect(!(state.night.questOpts || []).length, "no quest options"); await B.finish() });
  sc("dinner served from dawn leads into the next round, and isn't offered twice", async () => { B.fresh(9, 2); B.roles(2); await B.toPhase("day"); startNight(); B.night("murder", B.F()[0].id); act(s => { s.morning.revealed = true }); renderHost(); B.tap(/^Dinner now/); B.expect(state.phase === "mingle" && state.mingle.then === "round", "dinner then round"); await B.toPhase("day"); startNight(); B.night("murder", B.F()[0].id); act(s => { s.morning.revealed = true }); renderHost(); B.expect(!B.has(/Dinner/), "no second dinner"); await B.finish() });
  sc("a quest the Cloaks fail docks the pot, never below zero", async () => { B.fresh(8, 2); act(s => { s.pot = 10; s.quest = { text: "x", resolved: false } }); questResolve(false); B.expect(state.pot === 0, "pot floors at 0", state.pot) });
  sc("the Candles win with several standing: the prize is named, they play it off, the winner takes it home", async () => {
    B.fresh(8, 1); B.roles(1); await B.toPhase("day"); const t0 = B.T()[0];
    B.toTable(); B.boards(p => p.id === t0.id ? B.F()[0].id : t0.id); B.exile(t0.id); holdClick("reveal"); startCeremony();
    await B.finish(); renderHost();
    const A = aliveOf(state), t = tvText(state).text, ht = document.querySelector("#host").innerText;
    B.expect(state.winner === "candles" && state.rps && state.rps.ids.length === A.length, "a play-off between every Candle left", state.rps);
    B.expect(t.includes(state.prize) && /rock, paper, scissors/.test(t), "TV names the prize and calls the play-off", t.slice(0, 300));
    B.expect(ht.includes(state.prize) && /rock, paper, scissors/i.test(ht), "host reads the prize and the play-off");
    B.tap(new RegExp("^" + A[2].name.replace(/[^\w]/g, ".") + "$|" + A[2].name.replace(/[^\w]/g, ".")));
    B.expect(state.rps.winner === A[2].id, "tapping the winner records them", state.rps);
    const t2 = tvText(state); B.expect(t2.text.includes(A[2].name) && /takes home/.test(t2.text) && t2.text.includes(state.prize), "TV: the winner takes it home", t2.text.slice(0, 200));
    B.expect(/takes home/.test(document.querySelector("#host").innerText), "host reads who takes it home");
  });
  sc("one Cloak left at the end: no play-off, the prize is theirs", async () => {
    B.fresh(5, 1); B.roles(1); await B.toPhase("day");
    act(s => { s.players.filter(p => p.role === "candle").slice(0, 3).forEach(p => p.alive = false) }); startCeremony();
    await B.finish();
    B.expect(state.winner === "cloaks" && !state.rps && (state.prizeIds || []).length === 1, "one winner, no play-off", { rps: state.rps, ids: state.prizeIds });
  });
  sc("two Cloaks both share: they play it off", async () => {
    B.fresh(6, 2); B.roles(2); await B.toPhase("day");
    act(s => { s.players.filter(p => p.role === "candle").slice(0, 3).forEach(p => p.alive = false) }); startCeremony();
    await B.drive(() => state.phase === "final", 3000, { avoid: /^TAKE$/ });
    B.expect(state.phase === "final" && state.rps && state.rps.ids.length === 2, "a play-off between the two Cloaks", { rps: state.rps, to: state.prizeTo });
  });
  sc("share or take: everyone shares", async () => { B.fresh(6, 2); await B.toPhase("final2", 4000); await B.drive(() => state.phase === "final", 3000, { avoid: /^TAKE$/ }); B.expect(state.phase === "final", "reached the end") });
  sc("share or take: everyone takes", async () => { B.fresh(6, 2); await B.toPhase("final2", 4000); await B.drive(() => state.phase === "final", 3000, { avoid: /^SHARE$/ }); B.expect(state.phase === "final", "reached the end") });

  /* ---------------- every mission, every shield choice ---------------- */
  const playMission = async (key, win, champion) => {
    B.fresh(9, 2); await B.toPhase("day"); if (key === "dilemma") act(s => s.players.forEach(p => p.shield = null));
    handoff = null; pickMission(key); renderHost();
    if (win) { const lab = { secret: /^Hidden · 1 (round|question)$/, secret2: /^Hidden · 2 (rounds|questions)$/, public: /^Overall winner · public$/, none: /^No shield$/ }[win]; B.tap(lab) }
    if (champion) { mDag(state.mission.win === "none" ? "public" : "with"); renderHost() }
    const want = state.mission.win, war = state.mission.dag !== "none", m0 = { secN: state.mission.secN }, before = state.players.filter(p => p.shield).map(p => p.id + p.shield);
    let rules = tvText(state).text;
    B.expect(!/\b\d+\s+(questions|prompts|rounds)\b/i.test(rules), "no editable counts on the TV rules", rules.slice(0, 200));
    B.expect(!/Witness/.test(rules), "no Witness in the TV rules");
    const ok = await B.drive(() => !state.mission || !["mission", "shield"].includes(state.phase), 1500, { avoid: /Pick another|Another mission first|^Hidden · |^Overall winner · public$|^No blade$|^Champion —|^No shield$|Witness/ });
    B.expect(ok, "the mission finishes", { key });
    const got = state.players.filter(p => p.shield && !before.includes(p.id + p.shield));
    if (key !== "dilemma") {
      if (want === "none") B.expect(!got.length, "no shield given when none was offered", got.map(p => p.shield));
      if (want === "secret") B.expect(got.every(p => p.shield === "secret" && (p.role === "candle" || (state.champion && state.champion.id === p.id))), "hidden shields are secret, and only a Candle's (or the hidden Champion's)", got.map(p => p.shield + "/" + p.role));
      if (want === "secret") B.expect(got.length <= (m0.secN || 1), "no more hidden shields than were promised", { got: got.length, n: m0.secN });
      if (want === "public") B.expect(got.every(p => p.shield === "public"), "a named shield is public", got.map(p => p.shield));
    }
    if (war) B.expect(!state.champion || state.champion.round === state.round, "the Champion is this round's");
    await B.drive(() => state.phase === "table" || state.phase === "night", 400);
  };
  for (const key of MKEYS) {
    const def = MISSIONS.find(m => m.key === key);
    if (key === "dilemma") { sc("mission dilemma, played to the end", () => playMission("dilemma")); continue }
    if (ROUNDED.includes(key)) { sc("mission " + key + ", one hidden round + blade", () => playMission(key, "secret", true)); sc("mission " + key + ", two hidden rounds", () => playMission(key, "secret2")); sc("mission " + key + ", public shield + blade (Champion)", () => playMission(key, "public", true)); sc("mission " + key + ", no shield", () => playMission(key, "none")); continue }
    if (def.hasShield) { sc("mission " + key + ", public shield + blade (Champion)", () => playMission(key, "public", true)); sc("mission " + key + ", no shield", () => playMission(key, "none")); }
    else sc("mission " + key + ", played to the end", () => playMission(key, null, true));
  }
  sc("two missions in a row after a mingle, then dinner, then another mission", async () => {
    B.fresh(9, 2); await B.toPhase("day"); pickMission("snap"); await B.drive(() => ["shield", "day", "mingle", "table"].includes(state.phase) && !state.mission || state.phase === "shield", 800);
    await B.drive(() => state.phase !== "mission" && state.phase !== "shield", 300); startBreak("mingle"); renderHost();
    B.expect(B.has(/Another mission/), "another mission offered after a mingle", B.buttons().map(b => b.textContent.trim().slice(0, 30)));
    B.tap(/Another mission/); B.expect(state.phase === "day", "back to the pick"); pickMission("oneleg"); await B.drive(() => state.phase !== "mission" && state.phase !== "shield", 800);
    await B.finish();
  });

  /* ---------------- random games with a twist at a random moment ---------------- */
  const TW = {
    leave: () => { const A = aliveOf(state); if (A.length > 3) playerLeft(pick(A).id) },
    undo5: () => { for (let i = 0; i < 5; i++) if (canUndo()) undo() },
    rename: () => renamePlayer(pick(state.players).id, pick(["Zoë", "Al", "<b>x</b>", "Wilhelminaaaaaa"])),
    seat: () => moveSeat(pick(state.players).id, pick([-3, -1, 1, 3])),
    final: () => declareFinal(),
    table: () => { handoff = null; openTable("twist") },
    night: () => { handoff = null; startNight() },
    next: () => { handoff = null; nextRound() },
  };
  const TK = Object.keys(TW);
  for (let g = 0; g < 24; g++) {
    const tw = TK[g % TK.length], n = 4 + (g * 5) % 11;
    sc(`random game #${g + 1}: ${n} players, twist '${tw}' at a random tap`, async () => {
      const at = 5 + Math.floor(R() * 150); let taps = 0;
      B.fresh(n);
      await B.drive(() => state.phase === "final", 4000, { undo: .1, each: () => { if (++taps === at && !["final2", "final"].includes(state.phase)) { try { TW[tw]() } catch (e) { fail("twist threw: " + e.message) } B.inv("twist " + tw, true) } } });
      B.expect(state.phase === "final", "finished after the twist", { tw, at, phase: state.phase });
    });
  }

  B.run = async i => {
    const s = S[i]; cur = s.name; const before = B.fails.length;
    try { await s.fn() } catch (e) { fail("threw: " + e.message + " @ " + (e.stack || "").split("\n")[1]) }
    handoff = null; ask = null; menuOpen = false; leftPicker = false;
    return { name: s.name, fails: B.fails.slice(before) };
  };
  B.count = () => S.length;
})();
