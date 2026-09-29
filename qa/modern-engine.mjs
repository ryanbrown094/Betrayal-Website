// Modern's rules engine on its own (no server, no browser): whole games played by simulated phones, every Trial,
// the Oath, ties, nights, Sanctuary, the final, Honour or Betray, and what each phone may see. node qa/modern-engine.mjs
import { newGame, join, act, tick, viewFor, TRIALS, marks, forswornFor, addBots } from "../worker/src/modern.js";
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

// 1. the lobby, the Oath, the deal
{
  const g = setup(5); check("five players can't start", !!A(g, g.dir, { a: "start" }).error);
  join(g.s, "Priya", g.now, rnd); check("a duplicate name is refused", !!join(g.s, "priya", g.now, rnd).error);
  check("only the director starts", !!A(g, g.ids[1], { a: "start" }).error && A(g, g.dir, { a: "start" }) === null && g.s.phase === "oath");
  check("nobody can join once started", !!join(g.s, "Late", g.now, rnd).error);
  const ids = g.s.players.map((p) => p.id);
  A(g, ids[0], { a: "optin", v: "no" }); A(g, ids[1], { a: "optin", v: "yes" }); A(g, ids[2], { a: "optin", v: "no" }); A(g, ids[3], { a: "optin", v: "no" }); A(g, ids[4], { a: "optin", v: "no" });
  check("the Oath waits for everyone", g.s.phase === "oath" && viewFor(g.s, null, g.now).players.filter((p) => p.optedIn).length === 5);
  A(g, ids[5], { a: "optin", v: "any" });
  check("…then deals: the volunteer is Forsworn", g.s.phase === "roles" && g.s.players[1].role === "f" && g.s.players.filter((p) => p.role === "f").length === forswornFor(6));
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
    const h = begin(n), days = []; let r = 0;
    while (r++ < 12 && !h.s.final) { days.push(h.s.steps.map((x) => x.k === "break" ? x.v : x.k === "trial" ? (x.key || "T") + (x.special ? "+" + x.special : "") : x.k).join(",")); h.s.round++; if (h.s.round >= h.s.total) h.s.final = true; h.s.steps = []; h.s.stepAt = 0; for (const p of h.s.players) p.shield = null; tick(h.s, h.now, ctx); act(h.s, h.dir, { a: "next" }, h.now, ctx); h.s.phase = "day"; h.s.trial = null; h.s.brk = null; }
    const all = days.join(" | ");
    check(`${n} players: the evening's plan has the courses, the Temptation, the Casting Vote and the Crown (${all})`, /starter/.test(all) && /tempt/.test(all) && /\+cast/.test(all) && (n < 10 || /\+crown/.test(all)), all);
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
  vote(g, (p) => p.id === holder ? x : p.id === x.id ? y : p.id === y.id ? x : alive(g.s).indexOf(p) % 2 ? x : y);
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
for (const [n, fw] of [[6, 0], [8, 1], [12, 0], [17, 1], [24, 0], [10, 1]]) {
  const g = setup(n); A(g, g.dir, { a: "start" }); for (const id of g.ids) A(g, id, { a: "optin", v: "any" }); for (const id of g.ids) A(g, id, { a: "ack" }); tick(g.s, g.now, ctx);
  let guard = 0, sawNight = false; const target = (p) => alive(g.s).find((q) => q.id !== p.id && q.role === (fw ? "l" : "f")) || alive(g.s).find((q) => q.id !== p.id);
  while (g.s.phase !== "end" && guard++ < 200) {
    const s = g.s;
    if (s.phase === "day") { A(g, g.dir, { a: "next" }); continue; }
    if (s.phase === "break") { A(g, g.dir, { a: "brkEnd" }); continue; }
    if (s.phase === "trial") { finishCurrentTrial(g); A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "talk" || s.phase === "vote") { vote(g, target); continue; }
    if (s.phase === "night") { sawNight = true; const v = viewFor(s, s.players.find((p) => p.role === "f" && p.alive).id, g.now); check(`${n}p night ${s.round}: a Forsworn phone sees targets and allies`, v.me.targets && v.me.targets.length && Array.isArray(v.me.allies)); night(g); continue; }
    if (s.phase === "dawn") { const vic = s.dawn.victims; if (vic.length) check(`${n}p dawn: the victim is told first, in secret`, viewFor(s, vic[0], g.now).me.victim && !viewFor(s, null, g.now).dawn.victims); A(g, g.dir, { a: "cont" }); A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "reveal") { run(g, 6000); A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "trust") { for (const p of alive(s)) A(g, p.id, { a: "trust", v: fw || p.role === "f" ? "trust" : rnd() < .5 ? "trust" : "doubt" }); run(g, 8000); continue; }
    if (s.phase === "unmask" || s.phase === "honour") { if (s.phase === "honour") for (const p of alive(s).filter((p) => p.role === "f")) A(g, p.id, { a: "honour", v: "betray" }); run(g, 5000); continue; }
    run(g, 2000);
  }
  const r = g.s.result;
  if (fw) check(`${n} players: the Forsworn can win, and Honour or Betray settles it (${r && r.how})`, r && r.winner === "forsworn" && (g.s.players.filter((p) => p.role === "f" && p.alive).length < 2 || r.how === "betrayed" || r.how === "nobody"));
  check(`${n} players: a whole game ends (${r && r.winner}, ${g.s.round} rounds, ${r && r.awards.length} awards, Purse ${g.s.pot})`, g.s.phase === "end" && r && r.awards.length <= 6 && (n < 8 || sawNight), { phase: g.s.phase, guard });
  check(`${n} players: the courses were served`, n < 8 || (g.s.done.starter && g.s.done.dessert));
  const v = viewFor(g.s, g.ids[2], g.now); check(`${n} players: at the end every role is shown`, v.players.every((p) => p.role));
  const ag = A(g, g.dir, { a: "again" }); check(`${n} players: again? the same players, new roles`, ag === null && g.s.phase === "lobby" && g.s.players.length === n && g.s.players.every((p) => !p.role));
}
// 7. a test game: one person against bots; Trials score at random, every clock is ten seconds at most
for (const n of [8, 16]) {
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
    else if (s.phase === "trust") { clk(s.trust.end); if (I.alive) A(g, me, { a: "trust", v: "trust" }); run(g, 8000, 1000); }
    else if (s.phase === "honour") { if (I.alive && I.role === "f") A(g, me, { a: "honour", v: "honour" }); run(g, 2000, 1000); }
    else run(g, 2000, 1000);
  }
  check(`test game, ${n} players: finishes with only the host tapping (${s.result && s.result.winner}, ${s.round} rounds)`, s.phase === "end", [s.phase, guard]);
  check(`…no countdown longer than ten seconds (longest ${Math.round(maxClock / 1000)}s)`, maxClock <= 10000);
  check("…Trials scored at random", s.stats && Object.keys(s.stats.wins).length > 0);
}
check("quiz marking: 'six' = 6, a small slip, a surname", marks("six", "6") && marks("canbera", "Canberra") && marks("da vinci", "Leonardo da Vinci") && !marks("paris", "Rome") && !marks("", "x"));
console.log("RESULT: " + (fails ? "FAILED " + fails : "CLEAN")); process.exit(fails ? 1 : 0);
