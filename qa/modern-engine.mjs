// Modern's rules engine on its own (no server, no browser): whole games played by simulated phones, every Trial,
// the Oath, ties, nights, Sanctuary, the final, Honour or Betray, and what each phone may see. node qa/modern-engine.mjs
import { newGame, join, act, tick, viewFor, TRIALS, marks, forswornFor, addBots, BASE_TRIALS, SOLO_OFF, trialKeys } from "../worker/src/modern.js";
import { QUIZ_E, QUIZ_M, QUIZ_H, LIKELY, ESTIMATE, CHARADES } from "../worker/src/content.gen.js";
let fails = 0; const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (!cond && extra !== undefined ? " — " + JSON.stringify(extra).slice(0, 300) : "")); if (!cond) fails++; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dict = { has: (w) => w.length >= 3 };
const ctx = { rnd, dict };
const NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev", "Kate", "Liam", "Maya", "Noah", "Olga", "Pete", "Quin", "Rosa", "Sam", "Tara", "Uma", "Vic", "Wes", "Xena"];

function setup(n, opts, optins) {
  let now = 1e12; const s = newGame(now, rnd, opts), ids = [];
  for (let i = 0; i < n; i++) ids.push(join(s, NAMES[i], now, rnd).id);
  return { s, ids, now, dir: ids[0] };
}
function run(g, ms, step = 500) { for (let t = 0; t < ms; t += step) { g.now += step; tick(g.s, g.now, ctx); } }
const A = (g, pid, a) => act(g.s, pid, a, g.now, ctx);
const alive = (s) => s.players.filter((p) => p.alive);
// every phone answers whatever is open, the Forsworn answering a little worse
function answerAll(g) {
  const s = g.s, it = s.trial && s.trial.item; if (!it || it.stage !== "open") return;
  for (const p of alive(s)) {
    const f = p.role === "f", r = rnd();
    if (it.k === "text") A(g, p.id, { a: "ans", v: r < (f ? .3 : .6) ? it.a : "no idea" });
    if (it.k === "number") A(g, p.id, { a: "ans", v: String(Math.round(it.a * (0.5 + r))) });
    if (it.k === "hilo") A(g, p.id, { a: "ans", v: r < .5 ? "higher" : "lower" });
    if (it.k === "vote") A(g, p.id, { a: "ans", v: alive(s)[Math.floor(r * alive(s).length)].id });
    if (it.k === "word") A(g, p.id, { a: "ans", v: it.letters.slice(0, 3 + Math.floor(r * 4)) });
    if (it.k === "recall") A(g, p.id, { a: "ans", v: (it.words || []).slice(0, Math.floor(r * 12)).join(", ") });
    if (it.k === "cell") A(g, p.id, { a: "ans", v: String(Math.floor(r * 12)) });
    if (it.k === "rps") A(g, p.id, { a: "ans", v: ["rock", "paper", "scissors"][Math.floor(r * 3)] });
    if (it.k === "tempt") A(g, p.id, { a: "ans", v: r < .2 ? "self" : "purse" });
    if (it.k === "truths" && p.id !== it.teller) A(g, p.id, { a: "ans", v: 1 + Math.floor(r * 3) });
  }
  if (it.k === "actor") A(g, it.actor, { a: "guess", v: rnd() < .8 ? alive(s).find((p) => p.id !== it.actor).id : "none" });
  if (it.k === "survive") for (const p of alive(s).slice(1)) A(g, p.id, { a: "out" });
  if (it.k === "snap") { for (let k = 0; k < 30; k++) { g.now += 900; tick(s, g.now, ctx); if (!s.trial.item || s.trial.item.k !== "snap" || s.trial.item.stage !== "open") break; A(g, alive(s)[k % alive(s).length].id, { a: "ans" }); } }
}
// the rules engine picks the Trials; to test one by name, it's put at the front of today's plan
function setStep(g, st) { g.s.steps = [st, { k: "reckon" }]; g.s.stepAt = 0; }
function finishCurrentTrial(g) {
  let guard = 0;
  while (g.s.phase === "trial" && g.s.trial.stage !== "done" && guard++ < 2000) {
    if (g.s.trial.stage === "intro") A(g, g.dir, { a: "cont" }); // the host starts it
    const it = g.s.trial.item;
    if (it && it.k === "truths" && it.stage === "prep") { A(g, it.teller, { a: "lie", v: 2 }); A(g, it.teller, { a: "told" }); }
    answerAll(g); g.now += 1000; tick(g.s, g.now, ctx);
  }
  return guard >= 2000 ? { error: "trial stuck" } : null;
}
function playTrial(g, key) { setStep(g, key === "tempt" ? { k: "tempt" } : { k: "trial", key }); const r = A(g, g.dir, { a: "next" }); return r || finishCurrentTrial(g); }
function vote(g, pickFor) {
  const s = g.s; if (s.phase === "talk") A(g, g.dir, { a: "tool", v: "voteNow" });
  for (const p of s.players) if (!p.left) A(g, p.id, { a: "ballot", v: pickFor(p).id });
  run(g, 1000);
  if (s.phase === "vote") { for (const p of alive(s)) A(g, p.id, { a: "ballot", v: s.vote.revote[0] === p.id ? s.vote.revote[1] : s.vote.revote[0] }); run(g, 1000); }
}
function night(g) {
  const s = g.s; for (const p of alive(s)) { if (p.role === "f") { const t = alive(s).filter((q) => q.role !== "f"); for (let i = 0; i < s.night.kills; i++) A(g, p.id, { a: "pick", v: t[i].id }); } else A(g, p.id, { a: "sleep" }); }
  run(g, 1000);
}
function begin(n, opts) { const g = setup(n, opts); A(g, g.dir, { a: "start" }); A(g, g.dir, { a: "tool", v: "deal" }); A(g, g.dir, { a: "tool", v: "begin" }); tick(g.s, g.now, ctx); return g; }

check("dinner is optional: courses are off unless the host switches them on", newGame(1, rnd, {}).opts.courses === false && !begin(8).s.steps.some((x) => x.k === "break"));
// 1. the lobby, the Oath, the deal
{
  const g = setup(7); check("seven players can't start", !!A(g, g.dir, { a: "start" }).error);
  join(g.s, "Oliver", g.now, rnd); check("a duplicate name is refused", !!join(g.s, "oliver", g.now, rnd).error);
  check("only the director starts", !!A(g, g.ids[1], { a: "start" }).error && A(g, g.dir, { a: "start" }) === null && g.s.phase === "oath");
  check("nobody can join once started", !!join(g.s, "Late", g.now, rnd).error);
  const ids = g.s.players.map((p) => p.id);
  A(g, ids[0], { a: "optin", v: "no" }); A(g, ids[1], { a: "optin", v: "yes" }); A(g, ids[2], { a: "optin", v: "no" }); A(g, ids[3], { a: "optin", v: "no" }); A(g, ids[4], { a: "optin", v: "no" });
  check("the Oath waits for everyone", g.s.phase === "oath" && viewFor(g.s, null, g.now).players.filter((p) => p.optedIn).length === 5);
  A(g, ids[5], { a: "optin", v: "no" }); A(g, ids[6], { a: "optin", v: "no" }); A(g, ids[7], { a: "optin", v: "any" });
  check("…then deals: the volunteer is Forsworn", g.s.phase === "roles" && g.s.players[1].role === "f" && g.s.players.filter((p) => p.role === "f").length === forswornFor(8));
  const v0 = viewFor(g.s, ids[0], g.now), v1 = viewFor(g.s, ids[1], g.now), tv = viewFor(g.s, null, g.now);
  check("each phone sees only its own role (the host's included)", v0.me.role === "l" && v1.me.role === "f" && v0.players.every((p) => p.role === null) && tv.players.every((p) => p.role === null) && !tv.me);
  check("no token leaks into any view", !JSON.stringify(tv).includes(g.s.players[0].tok) && !JSON.stringify(v1).includes(g.s.players[0].tok));
  for (const id of ids) A(g, id, { a: "ack" }); tick(g.s, g.now, ctx);
  check("everyone seen their role: day one, with a plan", g.s.phase === "day" && g.s.round === 1 && g.s.steps.length >= 2 && viewFor(g.s, ids[0], g.now).next);
}
// 2. the host only moves the evening on: no choosing Trials, no Temptation, no Reckoning out of turn
{
  const g = begin(10);
  for (const a of [{ a: "trial", v: "quiz" }, { a: "trial", v: "tempt" }, { a: "reckon" }, { a: "break", v: "starter" }, { a: "voteNow" }, { a: "dawnNow" }, { a: "skip" }, { a: "endTrial" }])
    check(`the host can't ${JSON.stringify(a)}`, !!A(g, g.dir, a).error);
  check("…a player can't press next", !!A(g, g.ids[1], { a: "next" }).error);
  check("…nor use the host's tools", !!A(g, g.ids[1], { a: "tool", v: "roles", sure: "SHOW THE ROLES" }).error);
  const plan = g.s.steps.map((x) => x.k + (x.key ? ":" + x.key : "") + (x.special ? ":" + x.special : "")).join(" ");
  check("round one: a warm-up, a Trial, then the Reckoning, in order (" + plan + ")", g.s.steps[0].key === "likely" && g.s.steps[g.s.steps.length - 1].k === "reckon");
  let seen = []; while (g.s.phase === "day" || g.s.phase === "trial") { if (g.s.phase === "day") { A(g, g.dir, { a: "next" }); seen.push(g.s.phase === "trial" ? g.s.trial.key : g.s.phase); } if (g.s.phase === "trial") { finishCurrentTrial(g); A(g, g.dir, { a: "cont" }); } }
  check("…next, next, next walks the plan (" + seen.join(", ") + ")", seen[0] === "likely" && seen[seen.length - 1] === "talk");
  check("a short break is still the host's to call", (() => { const h = begin(8); return A(h, h.dir, { a: "break", v: "interval" }) === null && h.s.phase === "break" && A(h, h.dir, { a: "brkEnd" }) === null && h.s.phase === "day"; })());
  // the plans for tables of every size, with courses and twists
  for (const n of [8, 12, 16, 24]) {
    const h = begin(n, { courses: true }), days = []; let r = 0;
    while (r++ < 12 && !h.s.final) { days.push(h.s.steps.map((x) => x.k === "break" ? x.v : x.k === "trial" ? (x.key || "T") + (x.special ? "+" + x.special : "") : x.k).join(",")); h.s.round++; if (h.s.round >= h.s.total) h.s.final = true; h.s.steps = []; h.s.stepAt = 0; for (const p of h.s.players) p.shield = null; tick(h.s, h.now, ctx); act(h.s, h.dir, { a: "next" }, h.now, ctx); h.s.phase = "day"; h.s.trial = null; h.s.brk = null; }
    const all = days.join(" | ");
    check(`${n} players: the evening's plan has the courses, the Temptation, the Casting Vote and the Crown (${all})`, /starter/.test(all) && /tempt/.test(all) && /\+cast/.test(all) && (n < 10 || /\+crown/.test(all)), all);
  }
  { // twists off: no Temptation, no Casting Vote, no Crown
    const h = begin(12, { twists: false }), days = []; let r = 0;
    while (r++ < 12 && !h.s.final) { days.push(h.s.steps.map((x) => x.k === "break" ? x.v : x.k === "trial" ? (x.key || "T") + (x.special ? "+" + x.special : "") : x.k).join(",")); h.s.round++; if (h.s.round >= h.s.total) h.s.final = true; h.s.steps = []; h.s.stepAt = 0; for (const p of h.s.players) p.shield = null; tick(h.s, h.now, ctx); act(h.s, h.dir, { a: "next" }, h.now, ctx); h.s.phase = "day"; h.s.trial = null; h.s.brk = null; }
    const all = days.join(" | ");
    check(`twists off: no Temptation, Casting Vote or Crown in the plan (${all})`, !/tempt|\+cast|\+crown|\+confess/.test(all), all);
  }
}
// 3. every Trial, played to the end, with a winner, a Purse change, and Sanctuary for a Loyal winner
{
  const g = begin(10);
  for (const key of Object.keys(TRIALS).filter((k) => k !== "statue")) {
    const err = playTrial(g, key), t = g.s.trial;
    check(`${key}: plays through to its result`, !err && t && t.stage === "done", err);
    const v = viewFor(g.s, g.ids[3], g.now);
    check(`${key}: the result shows (points ${t.points})`, v.trial.stage === "done" && typeof v.trial.points === "number" && g.s.pot >= 0);
    if (TRIALS[key].prize && t.winners.length && t.sanct) { const w = g.s.players.find((p) => p.id === t.sanct); check(`${key}: Sanctuary goes to the winner, told only on their phone`, (w.role === "f" ? viewFor(g.s, w.id, g.now).me.wonSanct === "wasted" : viewFor(g.s, w.id, g.now).me.shield) && !viewFor(g.s, g.ids.find((id) => id !== w.id), g.now).players.find((p) => p.id === w.id).shield); }
    A(g, g.dir, { a: "cont" }); for (const p of g.s.players) p.shield = null;
    check(`${key}: back to the day`, g.s.phase === "day");
  }
  g.s.players[9].alive = false; const err = playTrial(g, "statue"); check("statue: plays with a Ghost at the table", !err && g.s.trial.stage === "done"); A(g, g.dir, { a: "cont" });
  for (const p of g.s.players) p.shield = null;
  playTrial(g, "tempt"); check("the Temptation: PURSE or SELF resolves", g.s.trial.stage === "done" && typeof g.s.trial.points === "number"); A(g, g.dir, { a: "cont" });
}
// 4. the twists
{
  // the Casting Vote: its Trial gives it instead of Sanctuary, told only to the winner; it settles a tie
  const g = begin(10); setStep(g, { k: "trial", key: "quiz", special: "cast" }); A(g, g.dir, { a: "next" });
  check("a Casting Vote Trial says so in its rules", /Casting Vote/.test(g.s.trial.rules)); finishCurrentTrial(g);
  const holder = g.s.cast && g.s.cast.id;
  check("the Casting Vote goes to the winner, not Sanctuary", holder && g.s.trial.winners[0] === holder && !g.s.trial.sanct);
  check("…only their phone knows", viewFor(g.s, holder, g.now).me.cast === true && !JSON.stringify(viewFor(g.s, g.ids.find((id) => id !== holder), g.now)).includes('"cast":true') && !viewFor(g.s, null, g.now).trial.gave);
  A(g, g.dir, { a: "cont" }); setStep(g, { k: "reckon" }); A(g, g.dir, { a: "next" });
  const others = alive(g.s).filter((p) => p.id !== holder), [x, y] = others;
  // a 4-4 tie between x and y (holder votes x): the Casting Vote exiles x without a revote
  const rest = alive(g.s).filter((p) => ![holder, x.id, y.id].includes(p.id)), half = Math.ceil(rest.length / 2) + (rest.length % 2 ? 0 : 1);
  vote(g, (p) => p.id === holder ? x : p.id === x.id ? y : p.id === y.id ? x : rest.indexOf(p) < half ? y : x); // x: holder + y + the rest's second part; y: x + the first part — level
  check("a tie the holder voted in is settled by the Casting Vote, and everyone sees it was", g.s.phase === "reveal" && g.s.reveal.id === x.id && viewFor(g.s, null, g.now).reveal.cast && g.s.cast.used, [g.s.phase, g.s.vote && g.s.vote.counts]);
  check("…never whose", !JSON.stringify(viewFor(g.s, null, g.now).reveal).includes(holder));

  // the Crown: named on the TV, Sanctuary tonight, and laid down once to be safe from an exile
  const h = begin(10); setStep(h, { k: "trial", key: "hilo", special: "crown" }); A(h, h.dir, { a: "next" }); finishCurrentTrial(h);
  const king = h.s.crown && h.s.crown.id;
  check("the Crown goes to the winner, is named, and carries Sanctuary", king && viewFor(h.s, null, h.now).trial.gave === king && h.s.players.find((p) => p.id === king).shield);
  A(h, h.dir, { a: "cont" }); setStep(h, { k: "reckon" }); A(h, h.dir, { a: "next" }); A(h, h.dir, { a: "tool", v: "voteNow" });
  for (const p of h.s.players) if (p.id !== king) A(h, p.id, { a: "ballot", v: king });
  check("the Crown's phone offers it", viewFor(h.s, king, h.now).me.crown === true);
  check("laying it down voids the votes against them", A(h, king, { a: "crown" }) === null && h.s.vote.immune === king && !Object.values(h.s.vote.ballots).includes(king));
  check("…and nobody can vote for them now", !!A(h, h.ids.find((id) => id !== king), { a: "ballot", v: king }).error);
  check("…and it's once only", !!A(h, king, { a: "crown" }).error);
  vote(h, (p) => alive(h.s).find((q) => q.id !== p.id && q.id !== king));
  check("…the exile falls elsewhere", h.s.phase === "reveal" && h.s.reveal.id !== king);

  // the Confessor: at five with one Forsworn left, the final's Trial names that Forsworn to a Loyal winner
  const c = begin(8); const F = c.s.players.filter((p) => p.role === "f"), L = c.s.players.filter((p) => p.role === "l");
  F[1].alive = false; L[0].alive = false; L[1].alive = false; c.s.final = true; c.s.round = 3; c.s.phase = "day"; c.s.steps = []; c.s.done.dessert = true; tick(c.s, c.now, ctx); A(c, c.dir, { a: "next" });
  check("the final: five left, one Forsworn: its Trial carries the Confessor", c.s.trial && c.s.trial.special === "confess" && /special prize/.test(c.s.trial.rules), c.s.trial);
  for (const [id] of Object.entries(c.s.trial.scores)) delete c.s.trial.scores[id];
  const cw = alive(c.s).find((p) => p.role === "l"); c.s.trial.scores[cw.id] = 5; A(c, c.dir, { a: "tool", v: "endTrial" });
  check("…a Loyal winner learns the Forsworn's name, privately", viewFor(c.s, cw.id, c.now).me.confess === F[0].name && !viewFor(c.s, F[0].id, c.now).me.confess && !JSON.stringify(viewFor(c.s, null, c.now)).includes('"confess"'));
  // …but not with no Forsworn left to name (a final reached by exiling every one of them), and no Sanctuary in the final
  const c2 = begin(8); const F2 = c2.s.players.filter((p) => p.role === "f"), L2 = c2.s.players.filter((p) => p.role === "l");
  F2.forEach((p) => (p.alive = false)); L2[0].alive = false; c2.s.final = true; c2.s.round = 3; c2.s.phase = "day"; c2.s.steps = []; c2.s.done.dessert = true; tick(c2.s, c2.now, ctx); A(c2, c2.dir, { a: "next" });
  check("the final: five left, no Forsworn: no Confessor", alive(c2.s).length === 5 && c2.s.trial && c2.s.trial.special !== "confess", c2.s.trial && c2.s.trial.special);
  check("…and the final's Trial doesn't promise Sanctuary, to the phones or the TV", viewFor(c2.s, null, c2.now).trial.prize === false && viewFor(c2.s, c2.dir, c2.now).trial.prize === false);

  // twists off
  const o = begin(12, { twists: false }); const all = []; for (let r = 1; r < o.s.total; r++) { o.s.round = r; o.s.steps = []; o.s.phase = "day"; o.s.trial = null; A(o, o.dir, { a: "next" }); all.push(JSON.stringify(o.s.steps)); }
  check("twists off: no Casting Vote, Crown or Confessor", !/cast|crown|confess/.test(all.join()), all.join());
}
// 5. the host's tools
{
  const g = begin(10);
  check("showing the roles needs the phrase", !!A(g, g.dir, { a: "tool", v: "roles" }).error && !!A(g, g.dir, { a: "tool", v: "roles", sure: "yes" }).error && !g.s.peeked.length);
  const r = A(g, g.dir, { a: "tool", v: "roles", sure: "SHOW THE ROLES" });
  check("…then shows them to the host, once, and it is noted", r && Array.isArray(r.peek) && r.peek.length === 10 && r.peek.filter((x) => x.role === "f").length === forswornFor(10) && g.s.peeked.length === 1);
  check("…but never puts them in the host's view", viewFor(g.s, g.dir, g.now).players.every((p) => p.role === null));
  const gone = g.s.players[4];
  check("remove a player who has left: gone from the table", A(g, g.dir, { a: "tool", v: "remove", who: gone.id }) === null && !viewFor(g.s, null, g.now).players.some((p) => p.id === gone.id));
  check("hand the host role to someone else", A(g, g.dir, { a: "tool", v: "host", who: g.ids[2] }) === null && g.s.director === g.ids[2] && !!A(g, g.ids[0], { a: "next" }).error);
  g.dir = g.ids[2];
  A(g, g.dir, { a: "next" }); check("skip a stuck question", g.s.phase === "trial" && A(g, g.dir, { a: "tool", v: "skip" }) === null);
  check("end a Trial early", A(g, g.dir, { a: "tool", v: "endTrial" }) === null && g.s.trial.stage === "done");
}
// 6. whole games: until someone wins
for (const [n, fw] of [[9, 0], [8, 1], [13, 0], [17, 1], [24, 0], [11, 1]]) {
  const g = setup(n, { courses: n % 2 === 1 }); A(g, g.dir, { a: "start" }); for (const id of g.ids) A(g, id, { a: "optin", v: "any" }); for (const id of g.ids) A(g, id, { a: "ack" }); tick(g.s, g.now, ctx);
  let guard = 0, sawNight = false, sawTrust = false; const target = (p) => alive(g.s).find((q) => q.id !== p.id && q.role === (fw ? "l" : "f")) || alive(g.s).find((q) => q.id !== p.id);
  while (g.s.phase !== "end" && guard++ < 200) {
    const s = g.s;
    if (s.phase === "day") { A(g, g.dir, { a: "next" }); continue; }
    if (s.phase === "break") { A(g, g.dir, { a: "brkEnd" }); continue; }
    if (s.phase === "trial") { finishCurrentTrial(g); A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "talk" || s.phase === "vote") { vote(g, target); continue; }
    if (s.phase === "night") { sawNight = true; const v = viewFor(s, s.players.find((p) => p.role === "f" && p.alive).id, g.now); check(`${n}p night ${s.round}: a Forsworn phone sees targets and allies`, v.me.targets && v.me.targets.length && Array.isArray(v.me.allies)); night(g); continue; }
    if (s.phase === "dawn") { const vic = s.dawn.victims; if (vic.length) check(`${n}p dawn: the victim is told first, in secret`, viewFor(s, vic[0], g.now).me.victim && !viewFor(s, null, g.now).dawn.victims); A(g, g.dir, { a: "cont" }); A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "reveal") { run(g, 6000); A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "trust") {
      for (const p of alive(s)) A(g, p.id, { a: "trust", v: fw || p.role === "f" ? "trust" : rnd() < .5 ? "trust" : "doubt" }); run(g, 8000);
      if (!sawTrust && s.trust.result) { sawTrust = true; check(`${n}p Trust or Doubt: the result waits for the host`, s.phase === "trust"); }
      A(g, g.dir, { a: "cont" }); continue;
    }
    if (s.phase === "unmask" || s.phase === "honour") { if (s.phase === "honour") for (const p of alive(s).filter((p) => p.role === "f")) A(g, p.id, { a: "honour", v: "betray" }); run(g, 5000); continue; }
    run(g, 2000);
  }
  const r = g.s.result;
  if (fw) check(`${n} players: the Forsworn can win, and Honour or Betray settles it (${r && r.how})`, r && r.winner === "forsworn" && (g.s.players.filter((p) => p.role === "f" && p.alive).length < 2 || r.how === "betrayed" || r.how === "nobody"));
  check(`${n} players: a whole game ends (${r && r.winner}, ${g.s.round} rounds, ${r && r.awards.length} awards, Purse ${g.s.pot})`, g.s.phase === "end" && r && r.awards.length <= 6 && (n < 8 || sawNight), { phase: g.s.phase, guard });
  check(`${n} players: ${g.s.opts.courses ? "dinner in courses was served" : "no courses, as chosen"}`, g.s.opts.courses ? g.s.done.starter && g.s.done.dessert : !g.s.done.starter && !g.s.done.main && !g.s.done.dessert);
  check(`${n} players: the prize is chocolate coins, one for every 100 points won (${r && r.coins} for ${r && r.won})`, r && r.prize === "chocolate coins" && r.coins === Math.floor(r.won / 100));
  const v = viewFor(g.s, g.ids[2], g.now); check(`${n} players: at the end every role is shown`, v.players.every((p) => p.role));
  const ag = A(g, g.dir, { a: "again" }); check(`${n} players: again? the same players, new roles`, ag === null && g.s.phase === "lobby" && g.s.players.length === n && g.s.players.every((p) => !p.role));
}
{ // the prize in the lobby: chocolate coins by default, and the lobby explains them; a prize the host types has no coins
  const g = setup(8), o = () => viewFor(g.s, g.dir, g.now).opts;
  check("lobby: no kill option, and the default prize is chocolate coins", o().kill === undefined && o().prize === "chocolate coins" && o().coins === true && viewFor(g.s, g.ids[1], g.now).opts.coins === undefined);
  A(g, g.dir, { a: "opts", opts: { prize: "a bottle of wine", kill: "murder" } });
  check("…a prize of the host's own: no coins, and a kill option is ignored", o().prize === "a bottle of wine" && o().coins === false && g.s.opts.kill === undefined);
  A(g, g.dir, { a: "opts", opts: { prize: "  " } }); check("…cleared, it goes back to chocolate coins", o().prize === "chocolate coins" && o().coins === true);
}
// 7. a test game: one person against bots; Trials score at random, every clock is ten seconds at most
for (const n of [9, 16]) {
  let now = 1e12; const s = newGame(now, rnd, {}); s.test = true; const me = join(s, "Ryan", now, rnd).id; addBots(s, n, now, rnd);
  const g = { s, now, dir: me, ids: s.players.map((p) => p.id) };
  check(`test game: ${n - 1} bots join`, s.players.length === n && s.players.filter((p) => p.bot).length === n - 1);
  A(g, me, { a: "start" }); A(g, me, { a: "optin", v: "any" }); run(g, 1000);
  check("…the bots swear and the roles are dealt", s.phase === "roles");
  A(g, me, { a: "ack" }); run(g, 1000);
  let guard = 0, maxClock = 0; const clk = (end) => { if (end) maxClock = Math.max(maxClock, end - g.now); };
  while (s.phase !== "end" && guard++ < 400) {
    const I = s.players.find((p) => p.id === me);
    if (s.phase === "day") A(g, me, { a: "next" });
    else if (s.phase === "break") { clk(s.brk.end); run(g, 11000, 1000); }
    else if (s.phase === "trial") { clk(s.trial.introEnd); if (s.trial.item) clk(s.trial.item.end); if (s.trial.item && s.trial.item.k === "tempt" && I.alive) A(g, me, { a: "ans", v: "purse" }); if (s.trial.stage === "done") A(g, me, { a: "cont" }); else run(g, 1000); }
    else if (s.phase === "talk") { clk(s.vote.talkEnd); run(g, 11000, 1000); }
    else if (s.phase === "vote") { clk(s.vote.voteEnd); if (I.alive) A(g, me, { a: "ballot", v: alive(s).find((q) => q.id !== me && (!s.vote.revote || s.vote.revote.includes(q.id))).id }); run(g, 1000); }
    else if (s.phase === "reveal") { run(g, 6000, 1000); A(g, me, { a: "cont" }); }
    else if (s.phase === "night") { clk(s.night.end); if (I.alive) A(g, me, I.role === "f" ? { a: "pick", v: alive(s).find((q) => q.role !== "f").id } : { a: "sleep" }); run(g, 1000); }
    else if (s.phase === "dawn") { A(g, me, { a: "cont" }); if (s.dawn && s.dawn.lastEnd) clk(s.dawn.lastEnd); A(g, me, { a: "cont" }); }
    else if (s.phase === "trust") { clk(s.trust.end); if (I.alive) A(g, me, { a: "trust", v: "trust" }); run(g, 8000, 1000); if (s.trust && s.trust.result) A(g, me, { a: "cont" }); }
    else if (s.phase === "honour") { if (I.alive && I.role === "f") A(g, me, { a: "honour", v: "honour" }); run(g, 2000, 1000); }
    else run(g, 2000, 1000);
  }
  check(`test game, ${n} players: finishes with only the host tapping (${s.result && s.result.winner}, ${s.round} rounds)`, s.phase === "end", [s.phase, guard]);
  check(`…no countdown longer than ten seconds (longest ${Math.round(maxClock / 1000)}s)`, maxClock <= 10000);
  check("…Trials scored at random", s.stats && Object.keys(s.stats.wins).length > 0);
}
// 8. the host pauses; last words; the Forsworn whisper; the dawn remembers Most Likely To; someone is taken out
const roles = (g, fs) => g.s.players.forEach((p, i) => (p.role = fs.includes(i) ? "f" : "l"));
const exile = (g, i) => { if (g.s.phase === "day") { setStep(g, { k: "reckon" }); A(g, g.dir, { a: "next" }); } const X = g.s.players[i]; vote(g, (p) => (p === X ? g.s.players.find((q) => q !== X && q.alive) : X)); return X; };
{
  const g = begin(10), s = g.s;
  setStep(g, { k: "trial", key: "quiz" }); A(g, g.dir, { a: "next" }); A(g, g.dir, { a: "cont" }); const end0 = s.trial.item.end;
  check("pause: only the host can", !!A(g, g.ids[1], { a: "pause" }).error && A(g, g.dir, { a: "pause" }) === null && !!s.paused);
  run(g, 60000);
  check("…every clock stands still", s.trial.stage === "play" && s.trial.item.stage === "open" && viewFor(s, g.ids[1], g.now).paused === s.paused.at);
  check("…and nothing can be answered or moved on", !!A(g, g.ids[1], { a: "ans", v: "x" }).error && !!A(g, g.dir, { a: "next" }).error);
  A(g, g.dir, { a: "pause", v: "off" });
  check("carry on: every deadline moves on by the pause", !s.paused && s.trial.item.end === end0 + 60000);
  check("…and the game plays on", !finishCurrentTrial(g) && s.trial.stage === "done");
  check("Most Likely To: the table's verdict is kept for the dawn", playTrial((A(g, g.dir, { a: "cont" }), g), "likely") === null && Object.values(s.stats.likely || {}).every((q) => /^Most likely to /.test(q)) && Object.keys(s.stats.likely || {}).length > 0, s.stats.likely);
}
{
  const g = begin(10, { kill: "murder" }), s = g.s; roles(g, [3, 4]); A(g, g.dir, { a: "cont" }); // an older room saved with kill "murder" plays as poison
  const X = exile(g, 6);
  check("last words: the exiled may type one line", s.phase === "reveal" && viewFor(s, X.id, g.now).me.words === "" && viewFor(s, g.ids[1], g.now).me.words === undefined);
  check("…nobody else may", !!A(g, g.ids[1], { a: "words", v: "not me" }).error);
  check("…once, and the table sees it", A(g, X.id, { a: "words", v: "  I was   Loyal, you fools " }) === null && !!A(g, X.id, { a: "words", v: "again" }).error && viewFor(s, null, g.now).reveal.words === "I was Loyal, you fools");
  run(g, 6000); A(g, g.dir, { a: "cont" });
  check("night: the Forsworn may whisper set phrases", s.phase === "night" && A(g, s.players[3].id, { a: "whisper", v: 3 }) === null && !!A(g, s.players[3].id, { a: "whisper", v: 99 }).error);
  check("…the Loyal may not, and never see them", !!A(g, g.ids[1], { a: "whisper", v: 0 }).error && viewFor(s, g.ids[1], g.now).me.whispers === undefined && !JSON.stringify(viewFor(s, null, g.now)).includes("Vote with me"));
  check("…the other Forsworn sees it", JSON.stringify(viewFor(s, s.players[4].id, g.now).me.whispers) === JSON.stringify([["Annie" === s.players[3].name ? "Annie" : s.players[3].name, "Vote with me tomorrow"]]));
  const V1 = s.players[7]; s.stats.likely = { [V1.id]: "Most likely to cry at a wedding" };
  for (const p of alive(s)) A(g, p.id, p.role === "f" ? { a: "pick", v: V1.id } : { a: "sleep" }); run(g, 1000);
  check("dawn: the poisoned can't speak before the night is revealed, and learn it on their phone", s.phase === "dawn" && !!A(g, V1.id, { a: "words", v: "x" }).error && viewFor(s, V1.id, g.now).me.victim === true);
  A(g, g.dir, { a: "cont" });
  const dv = viewFor(s, null, g.now).dawn;
  check("…then the table's verdict on them is read out", JSON.stringify(dv.likely) === JSON.stringify([[V1.name, "Most likely to cry at a wedding"]]));
  check("…and an old kill \"murder\" plays as poison: spoken last words on a clock, none typed", !!dv.lastEnd && !!A(g, V1.id, { a: "words", v: "Tell my cat" }).error && viewFor(s, null, g.now).dawn.words === undefined && viewFor(s, null, g.now).kill === undefined);
}
{
  const g = begin(10), s = g.s; roles(g, [3, 4]); A(g, g.dir, { a: "cont" });
  const X = exile(g, 6); run(g, 6000); A(g, g.dir, { a: "cont" });
  for (const p of alive(s)) A(g, p.id, p.role === "f" ? { a: "pick", v: s.players[7].id } : { a: "sleep" }); run(g, 1000); A(g, g.dir, { a: "cont" });
  check("poison: last words are spoken, not typed", s.phase === "dawn" && !!A(g, s.players[7].id, { a: "words", v: "x" }).error);
  check("…and the exiled can't come back to type", !!A(g, X.id, { a: "words", v: "late" }).error);
}
{
  const g = begin(10), s = g.s; roles(g, [3, 4]);
  check("take someone out: only the host", !!A(g, g.ids[1], { a: "tool", v: "remove", who: g.ids[2] }).error);
  A(g, g.dir, { a: "tool", v: "remove", who: s.players[3].id });
  check("…they're gone from every screen, and their phone says so", !viewFor(s, null, g.now).players.some((p) => p.id === s.players[3].id) && viewFor(s, s.players[3].id, g.now).me.left === true && !!A(g, s.players[3].id, { a: "sleep" }).error);
  check("…a Forsworn still at the table: the game goes on", s.phase === "day" && !s.final);
  A(g, g.dir, { a: "tool", v: "remove", who: s.players[4].id });
  check("…no Forsworn left: straight to the final", s.final && s.phase === "day");
}
{
  const g = begin(10), s = g.s; roles(g, [3, 4]); A(g, g.dir, { a: "cont" });
  exile(g, 6); run(g, 6000); A(g, g.dir, { a: "cont" });
  const before = alive(s).length;
  A(g, g.dir, { a: "tool", v: "remove", who: s.players[3].id }); A(g, g.dir, { a: "tool", v: "remove", who: s.players[4].id });
  check("…at night too: nobody dies, and the final begins", s.final && s.phase === "day" && alive(s).length === before - 2 && !s.players.some((p) => p.dying));
}
{
  const g = setup(9); A(g, g.dir, { a: "start" }); for (const id of g.ids.slice(0, 8)) A(g, id, { a: "optin", v: "any" });
  A(g, g.dir, { a: "tool", v: "remove", who: g.ids[8] });
  check("…at the Oath: once the rest have sworn, the roles are dealt", g.s.phase === "roles" && g.s.players.filter((p) => p.role === "f").length === forswornFor(8));
}
// 9. the QA sweep's fixes: Most Likely To at every size, removals mid-Trial and mid-revote, tools while paused
check("every table opens with Most Likely To (8 and 9 players included)", [8, 9, 10, 12, 16].every((n) => begin(n).s.steps[0].key === "likely"));
{
  const g = begin(10), s = g.s; roles(g, [3, 4]); A(g, g.dir, { a: "cont" });
  setStep(g, { k: "reckon" }); A(g, g.dir, { a: "next" }); A(g, g.dir, { a: "tool", v: "voteNow" });
  const [x, y] = [s.players[6], s.players[7]]; for (const p of s.players) A(g, p.id, { a: "ballot", v: p === x ? y.id : p === y ? x.id : s.players.indexOf(p) % 2 ? x.id : y.id }); run(g, 1000);
  const tied = s.vote && s.vote.revote && s.vote.revote.length === 2;
  if (tied) { A(g, g.dir, { a: "tool", v: "remove", who: s.vote.revote[0] }); A(g, g.dir, { a: "tool", v: "remove", who: s.vote.revote[1] }); A(g, g.dir, { a: "tool", v: "closeVote" }); }
  check("a revote whose candidates were both taken out exiles someone else, and the game goes on", tied && s.phase === "reveal" && !s.final, [s.phase, tied]);
}
{
  const g = begin(10), s = g.s; setStep(g, { k: "trial", key: "rps" }); A(g, g.dir, { a: "next" }); A(g, g.dir, { a: "cont" }); run(g, 1000);
  const gone = s.trial.item.pairs[0][0]; A(g, g.dir, { a: "tool", v: "remove", who: gone });
  check("someone taken out mid-Trial drops out of it, and the Trial still has a winner", !finishCurrentTrial(g) && !(s.trial.results.slice(1).some((r) => JSON.stringify(r).includes(gone))) && (s.trial.winners || []).length === 1 && s.trial.winners[0] !== gone, s.trial.winners);
}
{
  const g = begin(10), s = g.s; setStep(g, { k: "reckon" }); A(g, g.dir, { a: "next" });
  A(g, g.dir, { a: "pause" }); g.now += 300000; A(g, g.dir, { a: "tool", v: "voteNow" }); g.now += 5000; A(g, g.dir, { a: "pause", v: "off" });
  check("a host tool used while paused acts from the moment of the pause", s.phase === "vote" && s.vote.voteEnd - g.now === 120000, s.vote.voteEnd - g.now);
}
// 10. the app's free games (opts.content "base", worker/src/tiers.js): eight Trials and the first half of each question
// bank, all evening; a pass unlocks the rest; the website's games are as they were
{
  const BANKS = { qe: QUIZ_E, qm: QUIZ_M, qh: QUIZ_H, lk: LIKELY, est: ESTIMATE, charades: CHARADES };
  const playWhole = (n, opts) => {
    const g = setup(n, opts); A(g, g.dir, { a: "start" }); for (const id of g.ids) A(g, id, { a: "optin", v: "any" }); for (const id of g.ids) A(g, id, { a: "ack" }); tick(g.s, g.now, ctx);
    const keys = new Set(); let guard = 0;
    const target = (p) => alive(g.s).find((q) => q.id !== p.id);
    while (g.s.phase !== "end" && guard++ < 200) {
      const s = g.s;
      if (s.phase === "day") { A(g, g.dir, { a: "next" }); continue; }
      if (s.phase === "break") { A(g, g.dir, { a: "brkEnd" }); continue; }
      if (s.phase === "trial") { if (s.trial.key !== "tempt") keys.add(s.trial.key); finishCurrentTrial(g); A(g, g.dir, { a: "cont" }); continue; }
      if (s.phase === "talk" || s.phase === "vote") { vote(g, target); continue; }
      if (s.phase === "night") { night(g); continue; }
      if (s.phase === "dawn") { A(g, g.dir, { a: "cont" }); A(g, g.dir, { a: "cont" }); continue; }
      if (s.phase === "reveal") { run(g, 6000); A(g, g.dir, { a: "cont" }); continue; }
      if (s.phase === "trust") { for (const p of alive(s)) A(g, p.id, { a: "trust", v: "trust" }); run(g, 8000); A(g, g.dir, { a: "cont" }); continue; }
      if (s.phase === "unmask" || s.phase === "honour") { run(g, 5000); continue; }
      run(g, 2000);
    }
    return { g, keys };
  };
  const free = [10, 16, 24].map((n) => playWhole(n, { content: "base" }));
  check("free games: every Trial played is one of the eight", free.every(({ keys }) => [...keys].every((k) => BASE_TRIALS.includes(k))), free.map(({ keys }) => [...keys]));
  check("…and whole games still end", free.every(({ g }) => g.s.phase === "end"));
  check("…every question from the first half of its bank", free.every(({ g }) => Object.entries(g.s.used || {}).every(([k, u]) => !BANKS[k] || u.every((i) => i < Math.ceil(BANKS[k].length / 2)))), free.map(({ g }) => g.s.used));
  const web = [16, 24].map((n) => playWhole(n, {}));
  check("the website's games still play the other Trials", web.some(({ keys }) => [...keys].some((k) => !BASE_TRIALS.includes(k))), web.map(({ keys }) => [...keys]));
  const g = setup(10, { content: "base" });
  check("a free game's phones are told what a pass would add", (viewFor(g.s, g.dir, g.now).locked || []).length === Object.keys(TRIALS).length - BASE_TRIALS.length && !viewFor(setup(10, {}).s, null, g.now).locked);
  g.s.opts.content = "all";
  check("a pass on a free game unlocks every Trial", trialKeys(g.s).length === Object.keys(TRIALS).length - 1 && !viewFor(g.s, g.dir, g.now).locked); // The Statue waits for Ghosts
}
// 11. the app's practice game: one person and the bots, who play everything, Trials included, at its free tier
{
  let now = 1e12; const s = newGame(now, rnd, { content: "base" }); s.practice = true;
  const me = join(s, "Robin", now, rnd).id; addBots(s, 10, now, rnd);
  const g = { s, now, dir: me, ids: s.players.map((p) => p.id) };
  A(g, me, { a: "start" }); A(g, me, { a: "optin", v: "any" }); run(g, 2000); A(g, me, { a: "ack" }); run(g, 2000);
  const keys = new Set(), mine = () => alive(s).some((p) => p.id === me);
  let botAnswers = 0, items = 0, guard = 0, seen = null;
  while (s.phase !== "end" && guard++ < 4000) {
    if (s.phase === "day") { A(g, me, { a: "next" }); continue; }
    if (s.phase === "break") { A(g, me, { a: "brkEnd" }); continue; }
    if (s.phase === "trial") {
      const t = s.trial, it = t.item;
      if (t.key !== "tempt") keys.add(t.key);
      if (it && it.stage === "open") {
        if (seen !== it) { seen = it; items++; }
        if (mine() && !(me in it.inputs) && ["text", "number", "hilo", "vote", "word", "recall", "cell"].includes(it.k)) A(g, me, { a: "ans", v: it.k === "vote" ? alive(s).find((p) => p.id !== me).id : it.k === "hilo" ? "higher" : it.k === "cell" ? "3" : it.k === "number" ? "100" : "a" });
        if (it.k === "rps" && (it.pairs || []).flat().includes(me) && !(me in it.inputs)) A(g, me, { a: "ans", v: "rock" });
        if (it.k === "snap" && rnd() < 0.2) A(g, me, { a: "ans" });
        botAnswers += Object.keys(it.inputs).filter((id) => id !== me).length;
      }
      if (t.stage === "done" || t.stage === "intro") A(g, me, { a: "cont" });
      run(g, 1000); continue;
    }
    if (s.phase === "talk") { A(g, me, { a: "tool", v: "voteNow" }); run(g, 1000); continue; }
    if (s.phase === "vote") { if (mine() && !(me in s.vote.ballots)) { const c = alive(s).filter((q) => q.id !== me && q.id !== s.vote.immune && (!s.vote.revote || s.vote.revote.includes(q.id))); if (c.length) A(g, me, { a: "ballot", v: c[0].id }); } run(g, 1000); continue; }
    if (s.phase === "night") { if (mine()) { const p = s.players.find((q) => q.id === me); if (p.role === "f") { const t = alive(s).filter((q) => q.role !== "f"); for (let i = 0; i < s.night.kills; i++) A(g, me, { a: "pick", v: t[i].id }); } else A(g, me, { a: "sleep" }); } run(g, 1000); continue; }
    if (s.phase === "dawn") { A(g, me, { a: "cont" }); A(g, me, { a: "cont" }); run(g, 1000); continue; }
    if (s.phase === "reveal") { run(g, 6000); A(g, me, { a: "cont" }); continue; }
    if (s.phase === "trust") { if (mine()) A(g, me, { a: "trust", v: "trust" }); run(g, 8000); A(g, me, { a: "cont" }); continue; }
    run(g, 2000);
  }
  check(`a practice game (one person, nine bots) plays to the end (${s.result && s.result.winner}, ${s.round} rounds)`, s.phase === "end", { phase: s.phase, guard });
  check("…its Trials are played, not skipped: the bots answer the questions", items > 10 && botAnswers > items * 3, { items, botAnswers });
  check("…and only the Trials one person can play, at the free tier", [...keys].every((k) => BASE_TRIALS.includes(k) && !SOLO_OFF.includes(k)), [...keys]);
  check("…the phones are told it's a practice game", viewFor(s, me, g.now).practice === true && !viewFor(setup(10, {}).s, null, g.now).practice);
  const pr = newGame(1e12, rnd, { content: "base" }); pr.practice = true; const solo = join(pr, "Solo", 1e12, rnd).id; pr.director = solo; addBots(pr, 10, 1e12, rnd);
  for (let i = 0; i < 12; i++) act(pr, solo, { a: "bots", v: String(pr.players.length + 1) }, 1e12, ctx);
  check("…and in its lobby, Add a bot stops at sixteen, as the app's practice set-up does", pr.players.length === 16, pr.players.length);
}
// 11. the host moves the evening on: a Trial starts when the host says, the Reckoning talks thirty seconds a player,
// fifteen quiz questions, a minute more on the clock, and the end of the game whenever the host calls it
{
  const g = begin(10), s = g.s; roles(g, [3, 4]); A(g, g.dir, { a: "cont" });
  setStep(g, { k: "trial", key: "quiz" }); A(g, g.dir, { a: "next" }); run(g, 60000);
  check("a Trial waits for the host: no countdown, and a minute on it's still the introduction", s.trial.stage === "intro" && s.trial.introEnd === null && viewFor(s, null, g.now).trial.introEnd === null);
  check("…only the host starts it", !!A(g, g.ids[1], { a: "cont" }).error && A(g, g.dir, { a: "cont" }) === null && s.trial.stage === "play" && s.trial.item.stage === "open");
  const parts = []; let guard = 0;
  while (s.trial.stage !== "done" && guard++ < 3000) { const it = s.trial.item; if (it && it.stage === "open" && parts.length === s.trial.i) parts.push(it.part); answerAll(g); g.now += 1000; tick(s, g.now, ctx); }
  const count = (p) => parts.filter((x) => x === p).length;
  check(`Rapid Quiz: fifteen questions, five easy, five medium, five brutal (${parts.length}: ${count("easy")}/${count("medium")}/${count("brutal")})`, s.trial.i === 15 && count("easy") === 5 && count("medium") === 5 && count("brutal") === 5 && parts.slice(0, 5).every((p) => p === "easy") && parts.slice(10).every((p) => p === "brutal"));
  A(g, g.dir, { a: "cont" }); setStep(g, { k: "reckon" }); A(g, g.dir, { a: "next" });
  check(`the Reckoning: thirty seconds of talk for each of the ${alive(s).length} players still in`, s.phase === "talk" && s.vote.talkEnd - g.now === 30000 * alive(s).length);
  const t0 = s.vote.talkEnd;
  check("a minute more: only the host", !!A(g, g.ids[1], { a: "tool", v: "more" }).error && A(g, g.dir, { a: "tool", v: "more" }) === null && s.vote.talkEnd === t0 + 60000);
  A(g, g.dir, { a: "tool", v: "voteNow" }); const v0 = s.vote.voteEnd; A(g, g.dir, { a: "tool", v: "more" });
  check("…on the vote's clock too", s.phase === "vote" && s.vote.voteEnd === v0 + 60000);
  const X = s.players[6]; vote(g, (p) => (p === X ? s.players.find((q) => q !== X && q.alive) : X)); run(g, 6000);
  check("…and none when no clock is running (an exile's reveal)", s.phase === "reveal" && !!A(g, g.dir, { a: "tool", v: "more" }).error);
  check("end the game: only the host, and not from the lobby", !!A(g, g.ids[1], { a: "tool", v: "end" }).error && !!A(setup(8), setup(8).dir, { a: "tool", v: "end" }).error);
  A(g, g.dir, { a: "pause" }); const r = A(g, g.dir, { a: "tool", v: "end" });
  const v = viewFor(s, g.ids[5], g.now);
  check(`…from the middle of the game, paused: every role shown, scored as it stands (${s.result && s.result.winner})`, r === null && s.phase === "end" && !s.paused && s.result.early === true && s.result.winner === "forsworn" && !s.honour && v.result.early === true && v.players.every((p) => p.role) && !v.reveal);
  check("…and play again from there", A(g, g.dir, { a: "again" }) === null && s.phase === "lobby");
}
{ // a game saved before talkEach (its opts said talk: 240, the whole time) talks thirty seconds a player, not two hours
  const g = begin(10), s = g.s; delete s.opts.talkEach; s.opts.talk = 240; roles(g, [3, 4]); A(g, g.dir, { a: "cont" });
  setStep(g, { k: "reckon" }); A(g, g.dir, { a: "next" });
  check("a game from before: thirty seconds a player", s.vote.talkEnd - g.now === 30000 * alive(s).length);
}
check("quiz marking: 'six' = 6, a small slip, a surname", marks("six", "6") && marks("canbera", "Canberra") && marks("da vinci", "Leonardo da Vinci") && !marks("paris", "Rome") && !marks("", "x"));
console.log("RESULT: " + (fails ? "FAILED " + fails : "CLEAN")); process.exit(fails ? 1 : 0);
