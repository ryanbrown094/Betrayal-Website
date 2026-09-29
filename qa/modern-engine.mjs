// Modern's rules engine on its own (no server, no browser): whole games played by simulated phones, every Trial,
// the Oath, ties, nights, Sanctuary, the final, Honour or Betray, and what each phone may see. node qa/modern-engine.mjs
import { newGame, join, act, tick, viewFor, TRIALS, marks, forswornFor } from "../worker/src/modern.js";
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
function playTrial(g, key) {
  const r = A(g, g.dir, { a: "trial", v: key }); if (r) return r;
  let guard = 0;
  while (g.s.phase === "trial" && g.s.trial.stage !== "done" && guard++ < 2000) {
    const it = g.s.trial.item;
    if (it && it.k === "truths" && it.stage === "prep") { A(g, it.teller, { a: "lie", v: 2 }); A(g, it.teller, { a: "told" }); }
    answerAll(g); g.now += 1000; tick(g.s, g.now, ctx);
  }
  return guard >= 2000 ? { error: "trial stuck: " + key } : null;
}
function reckoning(g, vote, fw) {
  A(g, g.dir, { a: "reckon" }); A(g, g.dir, { a: "voteNow" });
  const s = g.s; for (const p of s.players) { const tg = vote ? vote(p) : alive(s).find((q) => q.id !== p.id && q.role === (fw ? "l" : "f")) || alive(s).find((q) => q.id !== p.id); A(g, p.id, { a: "ballot", v: tg.id }); }
  run(g, 1000);
  if (s.phase === "vote") { for (const p of alive(s)) A(g, p.id, { a: "ballot", v: s.vote.revote[0] === p.id ? s.vote.revote[1] : s.vote.revote[0] }); run(g, 1000); }
  run(g, 6000); A(g, g.dir, { a: "cont" });
}
function night(g) {
  const s = g.s; for (const p of alive(s)) { if (p.role === "f") { const t = alive(s).filter((q) => q.role !== "f"); for (let i = 0; i < s.night.kills; i++) A(g, p.id, { a: "pick", v: t[i].id }); } else A(g, p.id, { a: "sleep" }); }
  run(g, 1000);
}

// 1. the lobby, the Oath, the deal
{
  const g = setup(5); check("five players can't start", !!A(g, g.dir, { a: "start" }).error);
  g.s.players.push(); join(g.s, "Priya", g.now, rnd); check("a duplicate name is refused", !!join(g.s, "priya", g.now, rnd).error);
  check("only the director starts", !!A(g, g.ids[1], { a: "start" }).error && A(g, g.dir, { a: "start" }) === null && g.s.phase === "oath");
  check("nobody can join once started", !!join(g.s, "Late", g.now, rnd).error);
  const ids = g.s.players.map((p) => p.id);
  A(g, ids[0], { a: "optin", v: "no" }); A(g, ids[1], { a: "optin", v: "yes" }); A(g, ids[2], { a: "optin", v: "no" }); A(g, ids[3], { a: "optin", v: "no" }); A(g, ids[4], { a: "optin", v: "no" });
  check("the Oath waits for everyone", g.s.phase === "oath" && viewFor(g.s, null, g.now).players.filter((p) => p.optedIn).length === 5);
  A(g, ids[5], { a: "optin", v: "any" });
  check("…then deals: the volunteer is Forsworn", g.s.phase === "roles" && g.s.players[1].role === "f" && g.s.players.filter((p) => p.role === "f").length === forswornFor(6));
  const v0 = viewFor(g.s, ids[0], g.now), v1 = viewFor(g.s, ids[1], g.now), tv = viewFor(g.s, null, g.now);
  check("each phone sees only its own role", v0.me.role === "l" && v1.me.role === "f" && v0.players.every((p) => p.role === null) && tv.players.every((p) => p.role === null) && !tv.me);
  check("no token leaks into any view", !JSON.stringify(tv).includes(g.s.players[0].tok) && !JSON.stringify(v1).includes(g.s.players[0].tok));
  for (const id of ids) A(g, id, { a: "ack" }); tick(g.s, g.now, ctx);
  check("everyone seen their role: day one", g.s.phase === "day" && g.s.round === 1);
}
// 2. every Trial, played to the end, with a winner, a Purse change, and Sanctuary for a Loyal winner
{
  const g = setup(10); A(g, g.dir, { a: "start" }); A(g, g.dir, { a: "deal" }); A(g, g.dir, { a: "begin" }); tick(g.s, g.now, ctx);
  for (const key of Object.keys(TRIALS).filter((k) => k !== "statue")) {
    const pot = g.s.pot, err = playTrial(g, key), t = g.s.trial;
    check(`${key}: plays through to its result`, !err && t && t.stage === "done", err);
    const v = viewFor(g.s, g.ids[3], g.now);
    check(`${key}: the result shows (points ${t.points}, winner ${t.winners && t.winners.map((id) => g.s.players.find((p) => p.id === id).name)})`, v.trial.stage === "done" && typeof v.trial.points === "number" && g.s.pot >= 0);
    if (TRIALS[key].prize && t.winners.length && t.sanct) { const w = g.s.players.find((p) => p.id === t.sanct); check(`${key}: Sanctuary goes to the winner, told only on their phone`, (w.role === "f" ? viewFor(g.s, w.id, g.now).me.wonSanct === "wasted" : viewFor(g.s, w.id, g.now).me.shield) && !viewFor(g.s, g.ids.find((id) => id !== w.id), g.now).players.find((p) => p.id === w.id).shield); }
    A(g, g.dir, { a: "cont" }); for (const p of g.s.players) p.shield = null;
    check(`${key}: back to the day`, g.s.phase === "day");
  }
  const s0 = g.s; s0.players[9].alive = false; const err = playTrial(g, "statue"); check("statue: plays with a Ghost at the table", !err && s0.trial.stage === "done"); A(g, g.dir, { a: "cont" });
  for (const p of g.s.players) p.shield = null;
  check("the Temptation: once", A(g, g.dir, { a: "trial", v: "tempt" }) === null);
  let guard = 0; while (g.s.trial.stage !== "done" && guard++ < 100) { answerAll(g); run(g, 1000); }
  check("…PURSE or SELF resolves", g.s.trial.stage === "done" && typeof g.s.trial.points === "number"); A(g, g.dir, { a: "cont" });
  check("…and never twice", !!A(g, g.dir, { a: "trial", v: "tempt" }).error);
  check("courses: once each, and a break comes back by itself", A(g, g.dir, { a: "break", v: "starter" }) === null && g.s.phase === "break" && (run(g, 15 * 60000 + 1000, 5000), g.s.phase === "day") && !!A(g, g.dir, { a: "break", v: "starter" }).error);
}
// 3. grading
check("quiz marking: 'six' = 6, a small slip, a surname", marks("six", "6") && marks("canbera", "Canberra") && marks("da vinci", "Leonardo da Vinci") && !marks("paris", "Rome") && !marks("", "x"));
// 4. whole games: until someone wins
for (const [n, fw] of [[6, 0], [8, 1], [12, 0], [17, 1], [24, 0], [10, 1]]) {
  const g = setup(n); A(g, g.dir, { a: "start" }); for (const id of g.ids) A(g, id, { a: "optin", v: "any" }); for (const id of g.ids) A(g, id, { a: "ack" }); tick(g.s, g.now, ctx);
  let guard = 0, deaths = 0, sawNight = false, tie = false;
  while (g.s.phase !== "end" && guard++ < 60) {
    const s = g.s;
    if (s.phase === "day") { if (!s.final) { playTrial(g); A(g, g.dir, { a: "cont" }); } reckoning(g, guard === 2 ? (p) => alive(s)[p.id === alive(s)[0].id ? 1 : 0] : null, fw); if (guard === 2) tie = true; continue; }
    if (s.phase === "night") { sawNight = true; const v = viewFor(s, s.players.find((p) => p.role === "f" && p.alive).id, g.now); check(`${n}p night ${s.round}: a Forsworn phone sees targets and allies`, v.me.targets && v.me.targets.length && Array.isArray(v.me.allies)); night(g); continue; }
    if (s.phase === "dawn") { const vic = s.dawn.victims; if (vic.length) check(`${n}p dawn: the victim is told first, in secret`, viewFor(s, vic[0], g.now).me.victim && !viewFor(s, null, g.now).dawn.victims); A(g, g.dir, { a: "cont" }); deaths += vic.length; A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "reveal") { run(g, 6000); A(g, g.dir, { a: "cont" }); continue; }
    if (s.phase === "trust") { for (const p of alive(s)) A(g, p.id, { a: "trust", v: fw || p.role === "f" ? "trust" : rnd() < .5 ? "trust" : "doubt" }); run(g, 8000); continue; }
    if (s.phase === "unmask" || s.phase === "honour") { if (s.phase === "honour") for (const p of alive(s).filter((p) => p.role === "f")) A(g, p.id, { a: "honour", v: "betray" }); run(g, 5000); continue; }
    if (["talk", "vote"].includes(s.phase)) { A(g, g.dir, { a: "voteNow" }); for (const p of alive(s)) A(g, p.id, { a: "ballot", v: alive(s).find((q) => q.id !== p.id && q.role === (fw ? "l" : "f")) ? alive(s).find((q) => q.id !== p.id && q.role === (fw ? "l" : "f")).id : alive(s).find((q) => q.id !== p.id).id }); run(g, 2000); continue; }
    run(g, 2000);
  }
  const r = g.s.result;
  if (fw) check(`${n} players: the Forsworn can win, and Honour or Betray settles it (${r && r.how})`, r && r.winner === "forsworn" && (g.s.players.filter((p) => p.role === "f" && p.alive).length < 2 || r.how === "betrayed" || r.how === "nobody"));
  check(`${n} players: a whole game ends (${r && r.winner}, ${g.s.round} rounds, prize to ${r && r.to.length}, ${r && r.awards.length} awards)`, g.s.phase === "end" && r && r.awards.length <= 6 && (n < 8 || sawNight), { phase: g.s.phase, guard });
  const v = viewFor(g.s, g.ids[2], g.now); check(`${n} players: at the end every role is shown`, v.players.every((p) => p.role));
  const ag = A(g, g.dir, { a: "again" }); check(`${n} players: again? the same players, new roles`, ag === null && g.s.phase === "lobby" && g.s.players.length === n && g.s.players.every((p) => !p.role), [ag, g.s.players.length, g.s.players.map((p) => p.role)]);
}
console.log("RESULT: " + (fails ? "FAILED " + fails : "CLEAN")); process.exit(fails ? 1 : 0);
