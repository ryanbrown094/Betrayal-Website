# Chaos monkey: plays whole games by tapping the real host UI at random (with undo, menu jumps, players leaving),
# checking invariants after every tap. Then replays a sample of the states it reached on the TV (720p, 1080p and 4:3) and checks for overflow.
# Usage: python3 qa/chaos.py [games] [seconds-budget]
import sys, json, subprocess, time, os
from playwright.sync_api import sync_playwright
GAMES = int(sys.argv[1]) if len(sys.argv) > 1 else 50
BUDGET = int(sys.argv[2]) if len(sys.argv) > 2 else 900
PORT = 8715
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", "worker/public"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MONKEY = r"""
async ({games, budget}) => {
  const t0 = performance.now(), R = Math.random, pick = a => a[Math.floor(R() * a.length)];
  window.confirm = () => true; window.alert = () => {}; window.prompt = (q, d) => R() < 0.2 ? null : "Zed" + Math.floor(R() * 99);
  const _st = window.setTimeout; window.setTimeout = (f, ms, ...a) => _st(f, Math.min(ms || 0, 3), ...a);
  const POOL = ["Annie","Ryan","Tom","Sophie","Marcus","Priya","Jess","Oliver","Hannah","Dev","Claire-Louise","Bartholomew","Zoë","Mo","D'Arcy","Lee <b>","José","Wilhelmina","Al","Kit","Nadia","Ffion","Olu","Grace","Hamish","Ines","Jun","Keeley","Luca","Mairead","Niamh","Osric","Pip","Quentin","Rosa","Siobhan","Tariq","Uma","Vik","Wren"];
  const PHASES = ["lobby","intro","night0","day","mission","shield","mingle","table","reveal","night","morning","endvote","final2","final"];
  const LEGAL = {lobby:["intro"],intro:["night0"],night0:["day"],day:["mission"],mission:["shield","day"],shield:["day","mingle","table","mission","endvote"],mingle:["table","mission","day","endvote"],table:["reveal"],reveal:["night","endvote","final2","final","day","table"],night:["morning"],morning:["day","final","final2","mingle"],endvote:["final","table","final2"],final2:["final"],final:[]};
  const fails = [], stats = {games: 0, steps: 0, finals: {cloaks: 0, candles: 0}, phases: {}, missions: {}, stuck: 0, undo: 0, left: 0, jumps: 0, modes: {}, final2: 0, ghostRounds: 0, witnesses: 0, quests: 0}, samples = {};
  const fail = (msg, ctx) => { if (fails.length < 25) fails.push({msg, ...ctx, phase: state && state.phase, mission: state && state.mission && (state.mission.key + "/" + state.mission.stage)}) };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 };
  let ghostSeen = {}, trail = [], roundAlive = {};
  function check(label, loose) {
    const s = state; if (!s) return;
    if (!PHASES.includes(s.phase)) fail("unknown phase " + s.phase, {label});
    const ru = rulesIn(s);
    if (!ru.ghosts && Object.keys(s.ghosts || {}).length) fail("a Ghost verdict with Ghosts off", {label});
    if (!ru.blade && s.champion) fail("a blade with blades off", {label});
    if (s.mission && s.mission.stage !== "rules" && ((!ru.champion && s.mission.dag === "with") || (!ru.blade && s.mission.dag !== "none") || (ru.shield === "off" && s.mission.key !== "dilemma" && s.mission.win !== "none"))) fail("mission prize against the plan", {label, win: s.mission.win, dag: s.mission.dag});
    if (!ru.witness && s.witness) fail("a Witness with the Witness off", {label});
    if (s.phase === "night" && s.night && !modeOn(s, s.night.mode)) fail("night mode switched off in the plan: " + s.night.mode, {label});
    if (ru.kill === "murder" && /poison(?!ed apple)/i.test(document.querySelector("#host .bodywrap") ? document.querySelector("#host .bodywrap").innerText : "")) fail("host says poison in a murder game", {label, at: (document.querySelector("#host .bodywrap").innerText.match(/.{0,40}poison.{0,40}/i) || [""])[0]});
    if (s.players.some(p => !p.alive && p.shield)) fail("dead player holds a shield", {label});
    // a quarter of the table at most, counted against the most players alive at any point this round
    const aliveN = s.players.filter(p => p.alive).length, ra = roundAlive[s.round] = Math.max(roundAlive[s.round] || 0, aliveN);
    if (s.players.filter(p => p.alive && p.shield).length > Math.max(1, Math.floor(ra / 4))) fail("more shields than a quarter of the table", {label, held: s.players.filter(p => p.alive && p.shield).length, ra});
    if (s.players.some(p => p.shield && !["public", "secret"].includes(p.shield))) fail("unknown shield kind", {label});
    if (/Silent — no script/.test(document.body.innerText)) fail("silent shield option still offered", {label});
    if (!Number.isInteger(s.pot) || s.pot < 0) fail("bad pot " + s.pot, {label});
    if (new Set(s.usedQuiz || []).size !== (s.usedQuiz || []).length && (s.usedQuiz || []).length <= 30) fail("quiz repeat", {label});
    if (s.mission && s.mission.qs && new Set(s.mission.qs.map(q => q.id)).size !== s.mission.qs.length) fail("quiz repeat inside a mission", {label});
    if (s.mission && s.mission.secIds && s.mission.secIds.length > s.mission.secMax) fail("mission secret shields over cap", {label});
    if (s.champion && (s.champion.round > s.round || !s.players.some(p => p.id === s.champion.id))) fail("stale or unknown Champion", {label});
    if (s.table && s.table.exiled && s.phase === "reveal" && (s.table.immune || []).includes(s.table.exiled)) fail("exiled a player who showed a shield", {label});
    if (s.phase === "table" && s.table) {
      const t = s.table, w = bladeLive(s), want = {};
      for (const [vtr, tg] of Object.entries(t.ballots || {})) { if (!s.players.find(p => p.id === vtr && p.alive)) fail("ballot from a non-voter", {label}); if ((t.immune || []).includes(tg)) fail("ballot against an immune player", {label}); if (t.revote && tg !== "blank" && !t.revote.includes(tg)) fail("revote ballot for someone who wasn't tied", {label}); if (tg !== "blank") want[tg] = (want[tg] || 0) + (vtr === w && t.stage === "exile" ? 2 : 1) }
      if (JSON.stringify(Object.entries(want).sort()) !== JSON.stringify(Object.entries(t.votes || {}).filter(e => e[1]).sort())) fail("tally doesn't match the boards", {label, want, votes: t.votes});
    }
    if (s.mission && s.mission.key === "hilo" && s.mission.standing && s.mission.standing.some(id => !s.players.find(p => p.id === id && p.alive))) fail("a dead player still standing in Higher or Lower", {label});
    if (s.mission && s.mission.win === "public" && s.mission.room < 1) fail("public shield promised with no room", {label});
    const ht = document.body.innerText; if (/undefined|NaN|\[object|null/.test(ht.replace(/annulled/g, ""))) fail("host text: " + (ht.match(/.{0,40}(undefined|NaN|\[object|null).{0,40}/) || [""])[0], {label});
    if (document.documentElement.scrollWidth > innerWidth + 1) fail("host horizontal overflow " + document.documentElement.scrollWidth, {label});
    let pv, v;
    try { pv = publicView(JSON.parse(JSON.stringify(s))); v = tvView(pv); const d = document.createElement("div"); d.innerHTML = v.html + railHTML(pv, v.rail); const tt = d.textContent; if (rulesIn(s).kill === "murder" && /poison(?!ed apple)/i.test(tt)) fail("TV says poison in a murder game", {label, at: (tt.match(/.{0,40}poison.{0,40}/i) || [""])[0]}); if (/undefined|NaN|\[object|null/.test(tt)) fail("tv text: " + (tt.match(/.{0,40}(undefined|NaN|\[object|null).{0,40}/) || [""])[0], {label}); }
    catch (e) { fail("tv render threw: " + e.message + " @ " + (e.stack || "").split("\n")[1], {label}); }
    if (pv) {
      const js = JSON.stringify(pv);
      if (pv.hostPin || pv.prev || pv.log || pv.voteLog || pv.roundSnap) fail("public view leaks pin/prev/log/vote history/round snapshot", {label});
      if (s.phase !== "final") for (const p of pv.players) { const real = s.players.find(q => q.id === p.id); if (p.role && !real.revealed) fail("public view leaks role of " + p.name, {label}) }
      if (pv.players.some(p => p.shield === "secret" || p.shield === "witness" || p.shield === "silent")) fail("public view leaks a secret shield", {label});
      if (pv.shieldCard && ["secIds", "secNames", "witnessId", "witnessName"].some(k => k in pv.shieldCard)) fail("public view names a secret shield or the Witness", {label});
      if (pv.mission && ["secIds", "secMax", "winId", "shieldQ", "room", "witnessId", "mystery", "mysteryDone"].some(k => k in pv.mission)) fail("public view leaks mission shield data", {label});
      if (s.phase === "morning" && !s.morning.revealed && s.morning.kind === "murder" && (js.includes('"kind":"murder"') || pv.players.find(p => p.id === s.morning.victimId).alive !== true)) fail("public view leaks the murder before dawn", {label});
      if (pv.night && pv.night.questOpts) fail("public view leaks quest options", {label});
      if (s.phase !== "final" && ("prize" in pv || (s.prize && js.includes(s.prize)))) fail("the prize is on the wire before the end", {label});
      if (pv.mission && s.mission) { const m = pv.mission, sm = s.mission;
        if ("before" in m) fail("public view leaks the What Changed original", {label});
        if (Array.isArray(m.qs) && m.qs.some((x, i) => x && (i !== sm.qi || (!sm.shouter && !sm.showA && x.q && x.q[1])))) fail("public view leaks quiz answers", {label});
        if (Array.isArray(m.sd) && m.sd.length > 1) fail("public view leaks the sudden-death list", {label});
        if ("changed" in m && !sm.showA) fail("public view leaks what changed", {label});
        if ("picks" in m && !sm.result) fail("public view leaks the Dilemma picks", {label}); }
      if (pv.night && s.night && s.night.mode !== "murder" && !s.night.confirmed && pv.night.mode !== "murder") fail("public view leaks the kind of night", {label});
      if (v && s.phase && !samples[v.key + "|" + (v.norail ? 1 : 0)] && Object.keys(samples).length < 500) samples[v.key + "|" + (v.norail ? 1 : 0)] = JSON.parse(js);
    }
    if (s.phase === "final") {
      const lt = s.players.filter(p => p.alive && p.role === "cloak").length;
      if (s.winner !== (lt ? "cloaks" : "candles")) fail("winner inconsistent", {label});
      if (!s.prizeTo) fail("no prize recipient", {label});
      if (!s.players.every(p => p.revealed)) fail("not all revealed at the end", {label});
    }
    for (const g in (s.ghosts || {})) { const gp = s.players.find(q => q.id === g); if (gp && gp.role === "cloak") fail("a Cloak Ghost gave a verdict", {label}) }
    if (!loose) for (const g in (s.ghosts || {})) { if (ghostSeen[g] && ghostSeen[g] !== s.ghosts[g].pick) fail("ghost verdict overwritten", {label}); }
    ghostSeen = {}; for (const g in (s.ghosts || {})) ghostSeen[g] = s.ghosts[g].pick;
    if (s.night && s.phase === "night") stats.modes[s.night.mode] = (stats.modes[s.night.mode] || 0) + 1;
  }
  for (let g = 0; g < games && performance.now() - t0 < budget * 1000; g++) {
    if (state) { newGame(); await new Promise(r => _st(r, 0)) } roundAlive = {};
    renderHost();
    const n = R() < .6 ? 8 + Math.floor(R() * 9) : 17 + Math.floor(R() * 8), names = [...POOL].sort(() => R() - .5).slice(0, n);
    document.querySelector("#names").value = names.join(R() < .5 ? "\n" : ", "); document.querySelector("#pinset").value = "1";
    document.querySelector("#cloaks").value = R() < .3 ? 1 + Math.floor(R() * maxCloaks(n)) : ""; // setup refuses as many Forsworn as Loyal
    if (R() < .3) document.querySelector("#unit").value = pick(["£", "pts", "gold"]);
    // a random game plan: every setup switch gets exercised
    Object.assign(setupDraft, { rounds: pick([0, 0, 2, 3, 4, 6]), perRound: pick([0, 1, 2]), dinnerAfter: pick([0, 1, 2]), mingle: R() < .6, kill: pick(["murder", "poison"]), ghosts: R() < .7,
      convert: R() < .7, bargain: R() < .6, quests: R() < .7, shield: pick(["mix", "public", "secret", "off"]), blade: R() < .7, champion: R() < .6, witness: R() < .7, dilemma: R() < .7,
      pool: R() < .4 ? [...MISSIONS.filter(m => !m.addon && m.key !== "custom").map(m => m.key)].sort(() => R() - .5).slice(0, 3 + Math.floor(R() * 6)) : null });
    holdEndAt = 0; [...document.querySelectorAll("#host button")].find(b => /Start game/.test(b.textContent)).click();
    if (!state) { fail("game did not start", {}); continue }
    stats.games++; ghostSeen = {}; trail = [];
    let steps = 0, lastPhase = state.phase;
    while (state && steps++ < 4000) {
      if (steps % 25 === 0) await new Promise(r => _st(r, 0));
      if (state.phase === "final" && R() < .5) break;
      const sheets = [...document.querySelectorAll("#host .sheet")], scope = sheets.length ? sheets[sheets.length - 1] : document.querySelector("#host");
      let btns = [...scope.querySelectorAll("button:not([disabled])")].filter(visible);
      if (!btns.length) { stats.stuck++; fail("no enabled buttons", {trail: trail.slice(-6)}); break }
      const inMenu = sheets.length && /^Menu/.test(scope.textContent);
      const w = b => { const t = b.textContent.trim();
        if (/New game|wipe/i.test(t)) return 0;
        if (inMenu) return /^Close/.test(t) ? 5 : /End game now/.test(t) ? .15 : 1;
        if (t === "Menu") return .12; if (t === "Undo") return .25; if (t === "−" || t === "+") return .35;
        if (b.closest(".foot")) return b.classList.contains("primary") || b.classList.contains("danger") ? 9 : 2;
        if (/Finish mission/.test(t)) return state.mission && ["quiz","countdown","estimate","likely"].includes(state.mission.key) ? .5 : 1.6;
        if (/full script|Unpick|Clear votes|Clear all/.test(t)) return .2; if (/^Done$|^Cancel$/.test(t)) return 4; return 1 };
      const ws = btns.map(w), tot = ws.reduce((a, b) => a + b, 0); if (!tot) { stats.stuck++; fail("only forbidden buttons", {trail: trail.slice(-6)}); break }
      let r = R() * tot, b = btns[0]; for (let i = 0; i < btns.length; i++) { r -= ws[i]; if (r <= 0) { b = btns[i]; break } }
      const label = b.textContent.trim().slice(0, 40);
      if (R() < .15) { const pts = document.querySelector("#pts"); if (pts) pts.value = pick(["0", "50", "-75", "120.5", "", "250"]) }
      if (R() < .1) { const ins = [...document.querySelectorAll('#host .vote input')]; if (ins.length) { const i = pick(ins); i.value = pick(["3", "12", "-2", "40", "x"]); i.dispatchEvent(new Event("change")) } }
      if (R() < .3 && state.mission && state.mission.key === "custom") { const mt = document.querySelector("#mt"); if (mt) { mt.value = "Blind <i>taste</i> test"; document.querySelector("#mtm").value = pick(["0", "60", "abc"]) } }
      const before = state.phase; trail.push(before + ":" + label);
      holdEndAt = 0; // a reveal swallows taps for 700 ms (real time); the monkey taps far faster than a host
      try { b.click() } catch (e) { fail("click threw: " + e.message, {label, trail: trail.slice(-6)}); break }
      stats.steps++;
      if (!state) break;
      const loose = label === "Undo" || inMenu || /left|Who left/.test(scope.textContent.slice(0, 20));
      if (label === "Undo") stats.undo++; if (inMenu && !/^Close/.test(label)) stats.jumps++; if (/Who left/.test(scope.textContent.slice(0, 12))) stats.left++;
      if (state.phase !== before && !loose && !(LEGAL[before] || []).includes(state.phase) && !/End game now|End the game|^Rewind/.test(label)) fail("illegal transition " + before + " → " + state.phase, {label});
      if (state.phase !== before) { stats.phases[state.phase] = (stats.phases[state.phase] || 0) + 1; if (state.phase === "final2") stats.final2++ }
      if (state.mission && state.phase === "mission" && before !== "mission") stats.missions[state.mission.key] = (stats.missions[state.mission.key] || 0) + 1;
      if (state.final2 && state.final2.ghostRound && label.startsWith("Ghosts")) stats.ghostRounds++;
      if (state.witness && label.includes("Witness ceremony")) stats.witnesses++;
      if (label.startsWith("Begin the night") && state.quest) stats.quests++;
      check(label, loose);
      if (fails.length >= 25) break;
    }
    if (state && state.phase === "final") stats.finals[state.winner]++;
    else if (state && steps >= 4000) { const ph = {}; trail.slice(-600).forEach(t => { const k = t.split(":")[0]; ph[k] = (ph[k] || 0) + 1 }); stats.stuck++; fail("game did not finish in 4000 taps", {trail: trail.slice(-8), alive: aliveOf(state).length, round: state.round, finalRound: state.finalRound, last600: ph, undos: trail.slice(-600).filter(t => t.endsWith(":Undo")).length}) }
    if (fails.length >= 25) break;
  }
  return {fails, stats, samples, secs: Math.round((performance.now() - t0) / 1000)};
}
"""
OVER = r"""(st) => { window.__noCards = true; state = st; lastKey = null; lastPhase = st.phase; renderTV();
  const out = [], sg = document.querySelector('#stage'), tv = document.querySelector('#tv'), sr = sg.getBoundingClientRect();
  for (const el of sg.querySelectorAll('*')) { if (el.closest('svg') && el.nodeName !== 'svg') continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (getComputedStyle(el).position === 'absolute' && el.closest('.rt,.ring,.rolecard')) continue;
    if (r.top < sr.top - 2 || r.bottom > sr.bottom + 2 || r.left < -1 || r.right > innerWidth + 1) { out.push((el.className || el.nodeName) + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' stage ' + Math.round(sr.top) + '..' + Math.round(sr.bottom)); break } }
  const rt = sg.querySelector('.rt'); if (rt) for (const el of rt.querySelectorAll('.nm,.chairseal')) { const r = el.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) { out.push('round table off-screen: ' + el.textContent); break } }
  if (document.documentElement.scrollHeight > innerHeight + 1) out.push('page scrolls vertically');
  return out }"""
FREEZE = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}"
ok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://localhost:{PORT}/play.html#host"); pg.wait_for_timeout(1200)
    pg.add_style_tag(content=FREEZE)
    res = pg.evaluate(MONKEY, {"games": GAMES, "budget": BUDGET})
    print(json.dumps(res["stats"])); print("seconds:", res["secs"], "| page errors:", errs[:5])
    for f in res["fails"]: print("FAIL", json.dumps(f)); ok = False
    if errs: ok = False
    # replay sampled states on the TV at 720p and 1080p
    for (w, h) in [(1280, 720), (1920, 1080), (1024, 768)]:
        tctx = b.new_context(viewport={"width": w, "height": h}); tv = tctx.new_page(); terr = []
        tv.on("pageerror", lambda e: terr.append(str(e)))
        tv.goto(f"http://localhost:{PORT}/play.html"); tv.wait_for_timeout(1200); tv.add_style_tag(content=FREEZE)
        bad = 0
        for key, st in res["samples"].items():
            o = tv.evaluate(OVER, st)
            if o:
                bad += 1; ok = False
                if bad <= 12: print(f"TV {w}x{h} OVERFLOW [{key}]", o)
                if bad <= 4: tv.screenshot(path=f"qa/shots/overflow_{w}_{bad}.png")
        print(f"TV {w}x{h}: {len(res['samples'])} distinct screens replayed, {bad} overflowing, page errors: {terr[:3]}")
        if terr: ok = False
    b.close()
srv.terminate()
print("RESULT:", "CLEAN" if ok else "PROBLEMS")
sys.exit(0 if ok else 1)
