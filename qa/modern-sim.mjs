// Modern's real engine (worker/src/modern.js) played to the end many times by simulated people at a human pace, to
// measure how the game plays: its length, who wins, the rounds, the Ghosts' idle time, the waits on one person, ties
// and the Purse. Nothing here changes the engine; it only drives it, as the phones and the host would.
//   node qa/modern-sim.mjs [games per size, default 400] [sizes, default 8,10,12,16,20,24] [skill: low|mid|high] [pace]
// Each size prints one line of JSON: minutes (10th, 50th, 90th percentile), the Forsworn's win rate, rounds, the share
// of player-time spent as a Ghost, waits on one person by phase, ties and lots, the Purse and its prize tiers, the
// Temptation's outcomes. About a second per twenty games of 24.
//
// The pacing model (every time is a median; each person's draw is lognormal around it):
//   the host taps on 12 s after a step ends, reads a Trial's rules for 40 s, looks at a result for 15 s, waits 20 s
//   after an exile's role is shown and 8 s after the last words at dawn; a player answers a quiz question in 9 s, a
//   guess in 12 s, Higher or Lower in 6 s, a vote in 18 s, a word in 20 s, the night in 12 s (the Forsworn agree in
//   30 s, and 10 s more for each extra Forsworn); 3% of the answers never come (a phone face down, a top-up), so that
//   question runs to its clock; the talk runs to its clock.
// The table's judgement (the win rates depend on it; compare them across sizes, not as absolutes): everyone looks a
// little shifty (a fixed impression, sd 0.6) and the Forsworn a little more (by SKILL: 0.5, 0.9 or 1.3); each Loyal
// player votes for whoever looks worst to them (the table's view plus their own, sd 0.8); the Forsworn vote with the
// table's favourite unless it's one of their own (then for the Loyal player the table likes least, bussing an ally
// three times in ten); an exiled Forsworn's reveal shows up who voted elsewhere; the Forsworn poison the Loyal the
// table trusts most; a Loyal survivor trusts in the final only when nobody looks shifty enough.
// ENGINE=path runs a copy of the engine instead (to try a change before making it)
const { newGame, join, act, tick, roundsFor, forswornFor } = await import(process.env.ENGINE || "../worker/src/modern.js");

const GAMES = +(process.argv[2] || 400), SIZES = (process.argv[3] || "8,10,12,16,20,24").split(",").map(Number);
const SKILL = { low: 0.5, mid: 0.9, high: 1.3 }[process.argv[4] || "mid"] ?? +process.argv[4];
// PACE stretches the host's pauses (not the engine's clocks): 1 is the model below, 2 a chattier, slower table
const PACE = +(process.argv[5] || 1);
const P = {
  hostTap: 12, intro: 40, tempIntro: 30, done: 15, revealWait: 20, dawnWait: 10, afterWords: 8, trustCont: 10,
  oath: 20, roles: 15, miss: 0.03, voteMiss: 0.02,
  med: { text: 9, number: 12, hilo: 6, vote: 18, likely: 10, word: 20, recall: 25, cell: 6, rps: 5, tempt: 12, truths: 8, trust: 15, honour: 20, sleep: 12 },
  actor: { charades: 25, hum: 15, draw: 30 }, unguessed: 0.15, oneleg: 45, statue: 40, tell: 45,
  fNight: 30, fNightEach: 10, repSd: 0.6, privSd: 0.8, roundSd: 0.4, tellF: SKILL, bus: 0.3, trustThr: 1.4,
  tSelfL: 0.15, tSelfF: 0.5, honour: 0.6,
};
function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let R = Math.random;
const gauss = () => { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
const logn = (med, sd = 0.5) => med * Math.exp(sd * gauss());
const pickOf = (a) => a[Math.floor(R() * a.length)];
const NAMES = Array.from({ length: 24 }, (_, i) => "P" + (i + 1));

export function play(n, seed, opts) {
  R = rng(seed); Math.random = R; // (planDay names its Trials with Math.random)
  const T0 = 1.8e12; let now = T0;
  const s = newGame(now, R, opts || {}), ctx = { rnd: R, dict: { has: (w) => w.length >= 3 } };
  for (let i = 0; i < n; i++) join(s, NAMES[i], now, R);
  const dir = s.director, A = () => s.players.filter((p) => p.alive && !p.left), F = () => A().filter((p) => p.role === "f");
  const me = (id) => s.players.find((p) => p.id === id);
  const go = (pid, a) => act(s, pid, a, now, ctx);
  const agenda = []; const at = (dt, fn) => agenda.push({ t: now + Math.max(200, dt * 1000), fn });
  const host = (dt, fn) => at(dt * PACE, fn); // the host's pauses, which a chattier table stretches
  const seen = new Set();
  // the table's impressions
  const rep = {}, ev = {}; let roundNoise = {}, noiseRound = -1;
  const pub = (id) => { if (noiseRound !== s.round) { noiseRound = s.round; roundNoise = {}; for (const p of s.players) roundNoise[p.id] = gauss() * P.roundSd; } return rep[id] + (ev[id] || 0) + roundNoise[id] + (me(id).role === "f" ? P.tellF : 0) + (s.confess && s.confess.of === id && me(s.confess.id).role === "l" ? 0.6 : 0); };
  const sees = (i, j) => pub(j) + gauss() * P.privSd + (s.confess && s.confess.id === i && s.confess.of === j ? 5 : 0);
  const voteFor = (voter, cands) => {
    cands = cands.filter((c) => c !== voter); if (!cands.length) return null;
    if (me(voter).role === "f") {
      const lead = cands.slice().sort((a, b) => pub(b) - pub(a))[0];
      if (me(lead).role === "l" || R() < P.bus) return lead;
      const L = cands.filter((c) => me(c).role === "l"); return L.length ? L.sort((a, b) => pub(b) - pub(a))[0] : lead;
    }
    return cands.map((c) => [c, sees(voter, c)]).sort((a, b) => b[1] - a[1])[0][0];
  };
  // what we measure
  const m = { n, ghostMs: 0, playerMs: 0, firstOutAt: null, waitOne: 0, waitHost: 0, phase: {}, ties: 0, lots: 0, noVotes: 0, castUsed: 0, secondTieGhost: 0, secondTieGhostEven: 0,
    saves: 0, trials: 0, lotsFinal: 0, lotF: 0, waitBy: {}, statueMs: 0, keys: [], tempt: null, allFGoneAt: null, fParityAt: null, finalReck: 0, trustRounds: 0, trustEnd: false, sanctF: 0, exiledF: 0, exiledL: 0 };
  act(s, dir, { a: "start" }, now, ctx);
  for (const p of s.players) rep[p.id] = gauss() * P.repSd;
  let epoch = 0, lastPhase = null, guard = 0;
  while (s.phase !== "end" && now < T0 + 6 * 3600e3 && guard++ < 200000) {
    if (s.phase !== lastPhase) { epoch++; lastPhase = s.phase; }
    const t = s.trial, it = t && t.item, v = s.vote;
    const key = [epoch, s.phase, t ? t.stage : "", t ? t.i : "", it ? it.stage : "", v ? (v.revote ? "r" : "") + (v.stage || "") : "", s.dawn ? s.dawn.revealed : "", s.trust ? !!s.trust.result : "", s.reveal ? !!s.reveal.shown : ""].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      const live = A().map((p) => p.id);
      if (s.phase === "oath") { for (const p of s.players) if (R() > P.miss) { const id = p.id; at(logn(P.oath), () => go(id, { a: "optin", v: pickOf(["yes", "no", "any", "any"]) })); } at(120, () => s.phase === "oath" && go(dir, { a: "tool", v: "deal" })); }
      else if (s.phase === "roles") { for (const p of s.players) if (R() > P.miss) { const id = p.id; at(logn(P.roles), () => go(id, { a: "ack" })); } at(90, () => s.phase === "roles" && go(dir, { a: "tool", v: "begin" })); }
      else if (s.phase === "day") host(logn(P.hostTap, 0.4), () => s.phase === "day" && go(dir, { a: "next" }));
      else if (s.phase === "trial" && t.stage === "intro") { m.trials++; m.keys.push(t.key); host(logn(t.key === "tempt" ? P.tempIntro : P.intro, 0.3), () => t.stage === "intro" && go(dir, { a: "cont" })); }
      else if (s.phase === "trial" && t.stage === "done") {
        if (t.key === "tempt") m.tempt = t.results[0] ? (t.results[0].self === 1 ? "one" : t.results[0].self === 0 ? "none" : "many") : "none";
        if (t.sanct && me(t.sanct).role === "f") m.sanctF++;
        host(logn(P.done, 0.4), () => t.stage === "done" && s.phase === "trial" && go(dir, { a: "cont" }));
      }
      else if (s.phase === "trial" && it && it.stage === "open") answers(it, live);
      else if (s.phase === "trial" && it && it.stage === "prep") { const tl = it.teller; at(5, () => go(tl, { a: "lie", v: 1 + Math.floor(R() * 3) })); at(logn(P.tell, 0.4), () => go(tl, { a: "told" })); }
      else if (s.phase === "talk") {
        if (s.crown && !s.crown.used && me(s.crown.id).alive) { const c = s.crown.id, worst = live.slice().sort((a, b) => pub(b) - pub(a)).slice(0, 2); if (worst.includes(c)) at(30, () => go(c, { a: "crown" })); }
        if (s.final) m.finalReck++;
      }
      else if (s.phase === "vote") {
        if (v.revote) m.ties++;
        const cands = (v.revote || live).filter((id) => id !== v.immune && me(id).alive);
        for (const id of live) if (R() > P.voteMiss) { const tg = voteFor(id, cands); if (tg) at(logn(P.med.vote), () => s.phase === "vote" && go(id, { a: "ballot", v: tg })); }
        for (const g of s.players.filter((p) => !p.alive && !p.left)) if (R() < 0.7) { const tg = voteFor(g.id, cands); if (tg) at(logn(P.med.vote), () => s.phase === "vote" && go(g.id, { a: "ballot", v: tg })); }
      }
      else if (s.phase === "reveal") {
        const r = s.reveal, p = me(r.id);
        if (!m.firstOutAt) m.firstOutAt = now;
        if (r.byLot) { m.lots++; if (s.vote && s.vote.none) m.noVotes++; if (r.secret) m.lotsFinal++; if (p.role === "f") m.lotF++;
          // would the Ghosts' calls have settled it? (the tied pair, by the calls made in the revote)
          const tied = (r.counts || []).filter((x) => x[1] === (r.counts[0] || [0, 0])[1]).map((x) => x[0]);
          if (tied.length > 1 && s.vote) { const c = {}; for (const tg of Object.values(s.vote.calls)) if (tied.includes(tg)) c[tg] = (c[tg] || 0) + 1; const vals = tied.map((id) => c[id] || 0).sort((a, b) => b - a); if (vals[0] > (vals[1] || 0)) m.secondTieGhost++; else m.secondTieGhostEven++; }
        }
        if (r.cast) m.castUsed++;
        if (p.role === "f") m.exiledF++; else m.exiledL++;
        // an exiled Forsworn's reveal shows up who voted elsewhere
        const last = s.stats.votes[s.stats.votes.length - 1];
        if (!r.secret && last && last.out === r.id) for (const [voter, tg] of Object.entries(last.ballots)) { if (!me(voter).alive) continue; if (p.role === "f") ev[voter] = (ev[voter] || 0) + (tg === r.id ? -0.2 : 0.15); else if (tg === r.id) ev[voter] = (ev[voter] || 0) + 0.1; }
        if (r.secret) host(logn(P.revealWait, 0.4), () => s.phase === "reveal" && go(dir, { a: "cont" }));
        else at((r.roleAt - now) / 1000 + PACE * logn(P.revealWait, 0.4), () => s.phase === "reveal" && go(dir, { a: "cont" }));
      }
      else if (s.phase === "night") {
        const n = s.night, Fs = F(), L = A().filter((p) => p.role === "l").map((p) => p.id);
        const want = L.map((id) => [id, -pub(id) + gauss()]).sort((a, b) => b[1] - a[1]).slice(0, n.kills).map((x) => x[0]);
        const agree = logn(P.fNight + P.fNightEach * Math.max(0, Fs.length - 1), 0.4);
        for (const f of Fs) if (R() > P.miss) { const id = f.id; at(agree * (0.8 + R() * 0.2), () => { if (s.phase !== "night") return; for (const tg of want) if (![].concat(s.night.picks[id] || []).includes(tg)) go(id, { a: "pick", v: tg }); }); }
        for (const id of L) if (R() > P.miss) at(logn(P.med.sleep), () => s.phase === "night" && go(id, { a: "sleep" }));
      }
      else if (s.phase === "dawn" && !s.dawn.revealed) { m.saves += s.dawn.saved; if (s.dawn.victims.length && !m.firstOutAt) m.firstOutAt = now; host(logn(P.dawnWait, 0.4), () => s.phase === "dawn" && go(dir, { a: "cont" })); }
      else if (s.phase === "dawn" && s.dawn.revealed) at(((s.dawn.lastEnd || now) - now) / 1000 + PACE * logn(P.afterWords, 0.4), () => s.phase === "dawn" && go(dir, { a: "cont" }));
      else if (s.phase === "trust" && !s.trust.result) { m.trustRounds++; for (const id of live) if (R() > P.miss) { const f = me(id).role === "f"; const worst = Math.max(...live.filter((x) => x !== id).map((x) => sees(id, x))); const vv = f || worst < P.trustThr ? "trust" : "doubt"; at(logn(P.med.trust), () => s.phase === "trust" && go(id, { a: "trust", v: vv })); } }
      else if (s.phase === "trust" && s.trust.result) { if (s.trust.result === "trust") m.trustEnd = true; host(logn(P.trustCont, 0.4), () => s.phase === "trust" && go(dir, { a: "cont" })); }
      else if (s.phase === "honour") for (const f of F()) { const id = f.id, c = R() < P.honour ? "honour" : "betray"; at(logn(P.med.honour), () => s.phase === "honour" && go(id, { a: "honour", v: c })); }
    }
    // the one-person waits, and the host's
    const w = waitingOn();
    agenda.sort((a, b) => a.t - b.t);
    const next = Math.min(agenda.length ? agenda[0].t : Infinity, now + 1000);
    const dt = Math.max(0, next - now);
    m.phase[s.phase] = (m.phase[s.phase] || 0) + dt;
    const g = s.players.filter((p) => !p.alive && !p.left).length; m.ghostMs += g * dt; m.playerMs += s.players.length * dt;
    if (w === 1) { m.waitOne += dt; m.waitBy[s.phase] = (m.waitBy[s.phase] || 0) + dt; } else if (w === "host") m.waitHost += dt;
    if (s.phase === "trial" && s.trial && s.trial.key === "statue" && s.trial.stage === "play") m.statueMs += dt;
    now = Math.max(now, next);
    while (agenda.length && agenda[0].t <= now) agenda.shift().fn();
    tick(s, now, ctx);
    const dealt = !["lobby", "oath", "end"].includes(s.phase);
    if (dealt && m.allFGoneAt === null && !F().length) m.allFGoneAt = { at: now, final: s.final };
    if (dealt && m.fParityAt === null && F().length && F().length * 2 >= A().length && !s.final) m.fParityAt = now;
  }
  const end = now;
  m.minutes = (end - T0) / 60000; m.rounds = s.round; m.winner = s.result ? s.result.winner : "stuck"; m.pot = s.pot; m.cap = s.opts.potCap; m.how = s.result && s.result.how;
  m.ghostShare = m.ghostMs / Math.max(1, m.playerMs);
  m.ghostMinEach = m.ghostMs / 60000 / n; m.firstOutMin = m.firstOutAt ? (end - m.firstOutAt) / 60000 : 0;
  m.decidedEarlyMin = m.allFGoneAt && !m.allFGoneAt.final ? (end - m.allFGoneAt.at) / 60000 : 0; m.decidedEarly = !!(m.allFGoneAt && !m.allFGoneAt.final);
  m.parity = m.fParityAt !== null; m.finalAlive = null; m.total = s.total;
  return m;

  function answers(it, live) {
    const f = (id) => me(id).role === "f", cue = (k) => logn(P.med[k] || 10);
    const send = (id, dt, v) => at(dt, () => { const x = s.trial && s.trial.item; if (x === it && it.stage === "open") go(id, { a: "ans", v }); });
    const each = (fn, k) => { for (const id of live) if (R() > P.miss) send(id, cue(k), fn(id)); };
    if (it.k === "text") each((id) => (R() < ({ easy: 0.75, medium: 0.5, brutal: 0.2 }[it.part]) * (f(id) ? 0.6 : 1) ? it.a : "no idea"), "text");
    else if (it.k === "number") each(() => String(Math.round(it.a * logn(1, 0.35))), "number");
    else if (it.k === "hilo") each((id) => (R() < (f(id) ? 0.45 : 0.6)) === it.a > it.ref ? "higher" : "lower", "hilo");
    else if (it.k === "vote") each((id) => pickOf(live.filter((x) => x !== id)), "likely");
    else if (it.k === "word") each((id) => [...it.letters].slice(0, (f(id) ? 4 : 5) + Math.floor(R() * 3)).join("").toLowerCase(), "word");
    else if (it.k === "recall") each((id) => it.words.filter(() => R() < (f(id) ? 0.4 : 0.5)).join(", "), "recall");
    else if (it.k === "cell") each((id) => String(R() < (f(id) ? 0.4 : 0.55) ? it.changed[0] : Math.floor(R() * 12)), "cell");
    else if (it.k === "tempt") each((id) => (R() < (f(id) ? P.tSelfF : P.tSelfL) ? "self" : "purse"), "tempt");
    else if (it.k === "truths") { for (const id of live) if (id !== it.teller && R() > P.miss) send(id, cue("truths"), 1 + Math.floor(R() * 3)); }
    else if (it.k === "rps") { for (const id of it.pairs.flat()) if (R() > P.miss) send(id, cue("rps"), pickOf(["rock", "paper", "scissors"])); }
    else if (it.k === "actor") { if (R() > P.unguessed) { const a = it.actor, gs = pickOf(live.filter((x) => x !== a)); at(logn(P.actor[s.trial.key] || 25, 0.5), () => { const x = s.trial && s.trial.item; if (x === it && it.stage === "open") go(a, { a: "guess", v: gs }); }); } }
    else if (it.k === "survive") { const med = s.trial.key === "statue" ? P.statue : P.oneleg; for (const id of live) at(logn(med, 0.6), () => { const x = s.trial && s.trial.item; if (x === it && it.stage === "open") go(id, { a: "out" }); }); }
    else if (it.k === "snap") { for (let i = 1; i < it.seq.length; i++) if (it.seq[i] === it.seq[i - 1]) for (const id of live) if (R() < 0.5) { const tm = (it.start + i * it.step - now) / 1000 + Math.min(2.5, logn(0.8, 0.4)); at(tm, () => go(id, { a: "ans" })); } }
  }
  // who the table is waiting for: 1 when everyone but one has answered (the slowest phone holds the room), "host" when
  // only the host's tap moves it on
  function waitingOn() {
    const t = s.trial, it = t && t.item, live = A();
    const owe = (list, done) => { const left = list.filter((p) => !done(p)).length; return left === 1 && list.length > 1 ? 1 : 0; };
    if (s.phase === "oath") return owe(s.players.filter((p) => !p.left), (p) => p.optIn);
    if (s.phase === "roles") return owe(s.players.filter((p) => !p.left), (p) => p.acked);
    if (s.phase === "vote") return owe(live, (p) => p.id in s.vote.ballots);
    if (s.phase === "trust" && !s.trust.result) return owe(live, (p) => s.trust.votes[p.id]);
    if (s.phase === "night") { const n = s.night, need = live.filter((p) => p.role === "f" ? [].concat(n.picks[p.id] || []).length < n.kills : !n.slept[p.id]).length; return need === 1 ? 1 : 0; }
    if (s.phase === "trial" && it && it.stage === "open" && ["text", "number", "hilo", "vote", "word", "recall", "cell", "tempt", "truths", "rps"].includes(it.k)) {
      const who = it.k === "rps" ? it.pairs.flat() : it.k === "truths" ? live.map((p) => p.id).filter((id) => id !== it.teller) : live.map((p) => p.id);
      const left = who.filter((id) => !(id in it.inputs)).length; return left === 1 && who.length > 1 ? 1 : 0;
    }
    if (s.phase === "day" || (s.phase === "trial" && t && (t.stage === "intro" || t.stage === "done")) || (s.phase === "reveal" && (s.reveal.shown || s.reveal.secret)) || (s.phase === "dawn" && (!s.dawn.revealed || !s.dawn.lastEnd || now >= s.dawn.lastEnd)) || (s.phase === "trust" && s.trust.result)) return "host";
    return 0;
  }
}

const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pct = (a, f) => Math.round((100 * a.filter(f).length) / Math.max(1, a.length));
export function summary(n, G) {
  const mins = G.map((g) => g.minutes);
  return {
    n, games: G.length, forsworn: forswornFor(n), plannedRounds: roundsFor(n),
    min_p10: Math.round(q(mins, 0.1)), min_med: Math.round(q(mins, 0.5)), min_p90: Math.round(q(mins, 0.9)),
    forswornWin: pct(G, (g) => g.winner === "forsworn"), stuck: G.filter((g) => g.winner === "stuck").length,
    rounds_med: q(G.map((g) => g.rounds), 0.5), rounds_max: Math.max(...G.map((g) => g.rounds)),
    ghostShare: Math.round(100 * mean(G.map((g) => g.ghostShare))), ghostMinEach: Math.round(mean(G.map((g) => g.ghostMinEach))), firstOutMin: Math.round(mean(G.map((g) => g.firstOutMin))),
    waitOneMin: +mean(G.map((g) => g.waitOne / 60000)).toFixed(1), waitHostMin: +mean(G.map((g) => g.waitHost / 60000)).toFixed(1),
    talkMin: +mean(G.map((g) => (g.phase.talk || 0) / 60000)).toFixed(1), voteMin: +mean(G.map((g) => (g.phase.vote || 0) / 60000)).toFixed(1), trialMin: +mean(G.map((g) => (g.phase.trial || 0) / 60000)).toFixed(1), nightMin: +mean(G.map((g) => (g.phase.night || 0) / 60000)).toFixed(1),
    trials: +mean(G.map((g) => g.trials)).toFixed(1),
    tiesPerGame: +mean(G.map((g) => g.ties)).toFixed(2), lotsPerGame: +mean(G.map((g) => g.lots)).toFixed(2), lotGames: pct(G, (g) => g.lots > 0),
    lotGhostCouldSettle: G.reduce((a, g) => a + g.secondTieGhost, 0), lotGhostEven: G.reduce((a, g) => a + g.secondTieGhostEven, 0),
    castUsed: pct(G, (g) => g.castUsed > 0), savesPerGame: +mean(G.map((g) => g.saves)).toFixed(2), sanctWastedOnF: +mean(G.map((g) => g.sanctF)).toFixed(2),
    decidedEarly: pct(G, (g) => g.decidedEarly), decidedEarlyMin: +mean(G.filter((g) => g.decidedEarly).map((g) => g.decidedEarlyMin)).toFixed(1), parity: pct(G, (g) => g.parity),
    statue: pct(G, (g) => g.keys.includes("statue")), waitBy: Object.fromEntries(["oath", "roles", "trial", "vote", "night", "trust"].map((k) => [k, +mean(G.map((g) => (g.waitBy[k] || 0) / 60000)).toFixed(1)])),
    lotsFinal: G.reduce((a, g) => a + g.lotsFinal, 0), lotF: G.reduce((a, g) => a + g.lotF, 0), lotsAll: G.reduce((a, g) => a + g.lots, 0),
    loyalFull: pct(G.filter((g) => g.winner === "loyal"), (g) => g.pot >= g.cap), loyalHalf: pct(G.filter((g) => g.winner === "loyal"), (g) => g.pot >= g.cap / 2),
    fHalf: pct(G.filter((g) => g.winner === "forsworn"), (g) => g.cap - g.pot >= g.cap / 2), fWon: q(G.filter((g) => g.winner === "forsworn").map((g) => g.cap - g.pot), 0.5),
    potWhenF: q(G.filter((g) => g.winner === "forsworn").map((g) => g.pot), 0.5), potWhenL: q(G.filter((g) => g.winner === "loyal").map((g) => g.pot), 0.5),
    trustEnd: pct(G, (g) => g.trustEnd), finalReck: +mean(G.map((g) => g.finalReck)).toFixed(1),
    potMed: q(G.map((g) => g.pot), 0.5), potP10: q(G.map((g) => g.pot), 0.1), potP90: q(G.map((g) => g.pot), 0.9),
    tempt: ["one", "none", "many"].map((k) => k + " " + pct(G, (g) => g.tempt === k)).join(" / "),
    betray: pct(G.filter((g) => g.how), (g) => g.how === "betrayed" || g.how === "nobody") + "% of " + G.filter((g) => g.how).length,
  };
}

if (import.meta.url === "file://" + process.argv[1]) {
  for (const n of SIZES) { const G = []; for (let k = 0; k < GAMES; k++) G.push(play(n, 1000 * n + k)); console.log(JSON.stringify(summary(n, G))); }
}
