// The moments qa/motion.py plays through the page's replay mode, from the rules engine: a role for each side, a quiz's
// last answer and its result (the Purse grows), an exile before and after the role and with last words, the night, dawn,
// the final's Unmasking and the end. node qa/motion-views.mjs > views.json
import { newGame, join, act, tick, viewFor } from "../worker/src/modern.js";
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ctx = { rnd, dict: null };
let now = 1e12;
const s = newGame(now, rnd, { courses: false, twists: false }), ids = [];
for (const n of ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]) ids.push(join(s, n, now, rnd).id);
const dir = ids[0], out = {};
const a = (pid, x) => { const r = act(s, pid, x, now, ctx); if (r && r.error) throw new Error(JSON.stringify(x) + ": " + r.error); };
const t = (ms) => { now += ms || 0; tick(s, now, ctx); };
const alive = () => s.players.filter((p) => p.alive && !p.left).map((p) => p.id);
const snap = (key, pid) => (out[key] = { code: "K7Q2XM", site: "thebetrayal.co.uk", host: viewFor(s, pid, now), tv: viewFor(s, null, now) });
a(dir, { a: "start" }); snap("oath", ids[1]); ids.forEach((id, i) => a(id, { a: "optin", v: i === 3 ? "yes" : "any" }));
const F = s.players.filter((p) => p.role === "f").map((p) => p.id), L = ids.filter((id) => !F.includes(id));
snap("role-f", F[0]); snap("role-l", L[1]);
ids.forEach((id) => a(id, { a: "ack" })); t();
s.steps = [{ k: "trial", key: "quiz" }, { k: "reckon" }]; s.stepAt = 0; a(dir, { a: "next" }); a(dir, { a: "cont" }); t(1000);
const q = s.trial.item; alive().forEach((id, i) => a(id, { a: "ans", v: i % 3 ? q.a : "no idea" })); t(1000);
snap("quiz-answer", L[1]);
a(dir, { a: "tool", v: "endTrial" }); snap("quiz-done", L[1]); a(dir, { a: "cont" });
s.steps = [{ k: "reckon" }]; s.stepAt = 0; a(dir, { a: "next" }); t(20000); a(dir, { a: "tool", v: "voteNow" });
const target = L[2];
alive().forEach((id) => a(id, { a: "ballot", v: id === target ? L[3] : target })); t();
snap("reveal-wait", L[1]); t(6000); snap("reveal-role", L[1]);
a(target, { a: "words", v: "Watch the quiet one." }); snap("reveal-words", L[1]);
a(dir, { a: "cont" }); snap("night", L[1]);
const victim = L.find((id) => id !== dir && id !== L[1] && id !== target);
F.forEach((f) => a(f, { a: "pick", v: victim })); alive().forEach((id) => { if (!F.includes(id)) a(id, { a: "sleep" }); }); t();
snap("dawn-victim", victim); a(dir, { a: "cont" }); snap("dawn", L[1]); a(dir, { a: "cont" });
s.pot = 1500;
for (const p of s.players) if (p.alive && (p.role === "f" || ![dir, L[1], L[3], L[4]].includes(p.id))) { p.alive = false; p.exiled = s.round; }
s.final = true; s.phase = "trust"; s.trust = { votes: {}, end: now + 120000 }; s.trial = null; s.vote = null; s.night = null; s.dawn = null;
alive().forEach((id) => a(id, { a: "trust", v: "trust" })); t(); a(dir, { a: "cont" }); t(7000); t(3500);
snap("unmask", L[1]);
for (let i = 0; i < 12 && s.phase === "unmask"; i++) t(3500);
snap("end", L[1]);
if (s.phase !== "end") throw new Error("the evening didn't end: " + s.phase);
process.stdout.write(JSON.stringify(out));
