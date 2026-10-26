// Every screen of a Modern evening, as the server would send it: a whole game played by the real rules engine
// (worker/src/modern.js), with a phone's view and the TV's view saved at each moment. The app's Debug build shows them
// (-demo NAME, -demo-all) for the screenshots in .github/workflows/ios-native.yml, and ios/ci/decode.swift checks that
// the app's model reads every one. Run from the repo root:
//   node ios/tools/fixtures.mjs > ios/TheBetrayal/Debug/Fixtures.json
import { newGame, join, act, tick, viewFor } from "../../worker/src/modern.js";

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ctx = { rnd, dict: { has: (w) => ["rate", "tears", "stare", "seat", "east", "rates", "aster"].includes(w) || w.length < 7 } };
let now = 1.8e12;
const CODE = "K7Q2XM";
const NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Nadia", "Bartholomew"];
const s = newGame(now, rnd, { courses: true, twists: true });
const ids = NAMES.map((n) => join(s, n, now, rnd).id);
const [dir, ryan, tom, sophie, marcus, priya, jess, oliver, nadia, barty] = ids;
const out = {};
const a = (pid, x) => { const r = act(s, pid, x, now, ctx); if (r && r.error) throw new Error(JSON.stringify(x) + " by " + pid + ": " + r.error); return r; };
const t = (ms) => { now += ms || 0; tick(s, now, ctx); };
const P = (id) => s.players.find((p) => p.id === id);
const alive = () => s.players.filter((p) => p.alive && !p.left).map((p) => p.id);
// a moment, as one phone sees it and as the TV sees it
const snap = (name, pid, extra) => { if (out[name]) throw new Error("twice: " + name); out[name] = { code: CODE, phone: pid ? viewFor(s, pid, now) : null, tv: viewFor(s, null, now), ...(extra || {}) }; };
// a side trip: play something out, keep its pictures, and put the game back as it was
const side = (fn) => { const keep = structuredClone(s), keepNow = now, keepSeed = seed; fn(); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, keep); now = keepNow; seed = keepSeed; };
const trial = (key, special) => { s.steps = [{ k: "trial", key, special: special || null }, { k: "reckon" }]; s.stepAt = 0; a(dir, { a: "next" }); };
const toItems = () => t(12500);

// ---- before the game
snap("lobby-host", dir);
snap("lobby-guest", ryan);
side(() => { a(dir, { a: "opts", opts: { shield: "public", twists: false, prize: "A bottle of wine", prizes: [{ at: 0.5, what: "Two bottles" }, { at: 1, what: "Dinner out" }] } }); snap("lobby-host-set", dir); });

// ---- the Oath and the roles: Tom and Priya volunteer, so they are dealt Forsworn
a(dir, { a: "start" });
snap("oath", ryan);
a(ryan, { a: "optin", v: "no" });
snap("oath-sworn", ryan);
for (const id of ids) if (!P(id).optIn) a(id, { a: "optin", v: id === tom || id === priya ? "yes" : "no" });
if (P(tom).role !== "f" || P(priya).role !== "f") throw new Error("the deal went another way");
snap("roles-veil", ryan);
snap("roles-loyal", ryan, { peek: true });
snap("roles-forsworn", tom, { peek: true });
a(ryan, { a: "ack" });
snap("roles-acked", ryan);
for (const id of ids) if (!P(id).acked) a(id, { a: "ack" });
t();

// ---- round one
snap("day-host", dir);
snap("day-guest", ryan);
snap("day-host-tools", dir, { tools: true });
side(() => { s.rejoin = []; snap("day-host-rejoin", dir, { rejoin: [{ id: "r1", name: "Oliver" }] }); });
snap("peek", dir, { tools: true, peekList: s.players.filter((p) => !p.left).map((p) => ({ name: p.name, role: p.role, alive: p.alive })) });
side(() => { a(dir, { a: "pause" }); snap("paused-host", dir); snap("paused-guest", ryan); });
side(() => { a(dir, { a: "break", v: "interval" }); t(61000); snap("break-host", dir); snap("break-guest", ryan); });

// every Trial, from the phones that matter
side(() => { trial("quiz"); snap("trial-intro-forsworn", tom); snap("trial-intro-loyal", ryan); });
side(() => {
  trial("quiz"); toItems(); snap("quiz-open", ryan);
  const q = s.trial.item; a(ryan, { a: "ans", v: q.a }); snap("quiz-sent", ryan);
  alive().forEach((id, i) => { if (id !== ryan) a(id, { a: "ans", v: i % 3 ? q.a : "no idea" }); });
  t(100); snap("quiz-reveal-host", dir); snap("quiz-reveal-guest", sophie);
  t(5100); snap("quiz-second", ryan);
  a(dir, { a: "tool", v: "endTrial" }); snap("trial-done", ryan); snap("trial-done-host", dir);
  const w = s.trial.winners[0]; snap("trial-done-winner", w);
});
side(() => { trial("estimate"); toItems(); snap("estimate-open", ryan); alive().forEach((id, i) => a(id, { a: "ans", v: String(100 + i * 37) })); t(100); snap("estimate-reveal", ryan); });
side(() => { trial("hilo"); toItems(); snap("hilo-open", ryan); alive().forEach((id, i) => a(id, { a: "ans", v: i % 2 ? "higher" : "lower" })); t(100); snap("hilo-reveal", ryan); });
side(() => { trial("likely"); toItems(); snap("likely-open", ryan); alive().forEach((id, i) => a(id, { a: "ans", v: [marcus, jess, marcus][i % 3] })); t(100); snap("likely-reveal", ryan); });
side(() => {
  trial("countdown"); toItems(); snap("word-open", ryan); a(ryan, { a: "ans", v: "rate" }); snap("word-mine", ryan);
  alive().forEach((id, i) => { if (id !== ryan) a(id, { a: "ans", v: ["seat", "tears", "xyzzy", "stare"][i % 4] }); }); t(46000); snap("word-reveal", ryan);
});
side(() => { trial("memory"); toItems(); snap("memory-study", ryan); t(20100); snap("memory-open", ryan); alive().forEach((id) => a(id, { a: "ans", v: s.trial.item.words.slice(0, 5).join(", ") })); t(100); snap("memory-reveal", ryan); });
side(() => {
  trial("change"); toItems(); snap("change-study", ryan); t(12100); snap("change-blank", ryan); t(4100); snap("change-open", ryan);
  const c = s.trial.item.changed[0]; a(ryan, { a: "ans", v: String(c) }); snap("change-sent", ryan);
  alive().forEach((id, i) => { if (id !== ryan) a(id, { a: "ans", v: String(i % 12) }); }); t(100); snap("change-reveal", ryan);
});
side(() => { trial("snap"); toItems(); t(3000 + 3000 * 3 + 500); snap("snap-open", ryan); a(ryan, { a: "ans" }); t(3000 * 21); snap("snap-reveal", ryan); });
side(() => { trial("rps"); toItems(); const pr = s.trial.item.pairs[0]; snap("rps-open", pr[0]); snap("rps-bye", s.trial.item.bye || pr[1]); a(pr[0], { a: "ans", v: "rock" }); snap("rps-sent", pr[0]); t(15100); snap("rps-reveal", pr[0]); });
side(() => { trial("oneleg"); toItems(); a(oliver, { a: "out" }); snap("oneleg-open-host", dir); snap("oneleg-out", oliver); });
side(() => {
  trial("charades"); toItems(); const ac = s.trial.item.actor, other = alive().find((id) => id !== ac);
  snap("charades-actor", ac); snap("charades-guesser", other); a(ac, { a: "guess", v: other }); t(100); snap("charades-reveal", other);
});
side(() => { trial("hum"); toItems(); snap("hum-actor", s.trial.item.actor); });
side(() => {
  trial("truths"); toItems(); const te = s.trial.item.teller, other = alive().find((id) => id !== te);
  snap("truths-prep-teller", te); a(te, { a: "lie", v: 2 }); snap("truths-prep-chosen", te); snap("truths-prep-listener", other);
  a(te, { a: "told" }); snap("truths-open", other); snap("truths-open-teller", te);
  alive().forEach((id, i) => { if (id !== te) a(id, { a: "ans", v: 1 + (i % 3) }); }); t(100); snap("truths-reveal", other);
});
side(() => { trial("quiz", "cast"); snap("cast-intro", ryan); toItems(); a(sophie, { a: "ans", v: s.trial.item.a }); a(dir, { a: "tool", v: "endTrial" }); const w = s.trial.winners[0]; snap("cast-done-winner", w); snap("cast-done", w === ryan ? sophie : ryan); });
side(() => { trial("quiz", "crown"); toItems(); a(sophie, { a: "ans", v: s.trial.item.a }); a(dir, { a: "tool", v: "endTrial" }); const w = s.trial.winners[0]; snap("crown-done-winner", w); snap("crown-done", w === ryan ? sophie : ryan); });
side(() => {
  s.steps = [{ k: "tempt" }, { k: "reckon" }]; s.stepAt = 0; a(dir, { a: "next" }); toItems(); snap("tempt-open", ryan); a(ryan, { a: "ans", v: "self" }); snap("tempt-sent", ryan);
  alive().forEach((id) => { if (id !== ryan) a(id, { a: "ans", v: "purse" }); }); t(100); snap("tempt-reveal", ryan); t(5100); snap("tempt-done", ryan);
});

// the real round one: the plan's first step is Most Likely To; then on to the Reckoning
s.steps = [{ k: "reckon" }]; s.stepAt = 0;
s.cast = { id: sophie, used: false, round: 1 }; s.crown = { id: marcus, used: false, round: 1 };
a(dir, { a: "next" });
snap("talk", ryan); snap("talk-crown", marcus);
side(() => { a(marcus, { a: "crown" }); snap("talk-crown-laid", ryan); });
t(240100);
snap("vote", ryan); snap("vote-ghost-less", sophie);
a(ryan, { a: "ballot", v: oliver }); snap("vote-mine", ryan);
side(() => { // a tie, and the revote between the tied
  s.cast = null;
  const n = { [oliver]: 1, [nadia]: 0 };
  for (const id of alive()) if (id !== ryan) { let v = n[oliver] <= n[nadia] ? oliver : nadia; if (v === id) v = v === oliver ? nadia : oliver; n[v]++; a(id, { a: "ballot", v }); }
  t(100); if (s.phase === "vote" && s.vote.tie) snap("vote-tie", ryan);
});
for (const id of alive()) if (id !== ryan && id !== oliver) a(id, { a: "ballot", v: oliver });
a(oliver, { a: "ballot", v: nadia });
t(100);
snap("reveal-wait", ryan); snap("reveal-wait-exiled", oliver);
t(5100);
snap("reveal-exiled", oliver);
a(oliver, { a: "words", v: "I was Loyal to the last. Watch Tom." });
snap("reveal-words", ryan); snap("reveal-words-host", dir);
a(dir, { a: "cont" });

// ---- the first night
snap("night-loyal", ryan);
snap("night-forsworn", tom);
snap("night-ghost", oliver);
a(tom, { a: "pick", v: jess }); a(tom, { a: "whisper", v: 0 }); a(priya, { a: "whisper", v: 3 });
snap("night-forsworn-picked", priya);
a(ryan, { a: "sleep" }); snap("night-slept", ryan);
for (const id of alive()) { const p = P(id); if (p.role === "f") a(id, { a: "pick", v: jess }); else if (id !== ryan) a(id, { a: "sleep" }); }
t(100);
snap("dawn-host", dir); snap("dawn-victim", jess); snap("dawn-guest", ryan);
s.stats.likely = { [jess]: "Most likely to start a cult" };
a(dir, { a: "cont" });
snap("dawn-revealed", ryan); snap("dawn-victim-words", jess); snap("dawn-ghost", jess === ryan ? sophie : oliver);
side(() => { t(31000); snap("dawn-after", ryan); });
a(dir, { a: "cont" });

// ---- a Ghost at the Statue, and a Ghost's view of a question
side(() => { trial("statue"); toItems(); snap("statue-ghost", oliver); snap("statue-living", ryan); });
side(() => { trial("quiz"); toItems(); snap("quiz-ghost", oliver); });

// ---- on to the final: the host takes people out so the table reaches five, with both Forsworn still in
for (const id of [nadia, barty, marcus]) a(dir, { a: "tool", v: "remove", who: id });
snap("left", nadia);
s.round = 4; s.final = true; s.steps = [{ k: "reckon" }]; s.stepAt = 0; s.crown = null; s.cast = null;
s.confess = { id: ryan, of: tom };
snap("final-day", ryan);
a(dir, { a: "next" }); t(240100);
snap("final-vote", ryan);
for (const id of alive()) a(id, { a: "ballot", v: id === sophie ? dir : sophie });
t(100);
snap("final-reveal", ryan);
a(dir, { a: "cont" });
snap("trust", ryan);
a(ryan, { a: "trust", v: "trust" }); snap("trust-mine", ryan);
for (const id of alive()) if (id !== ryan) a(id, { a: "trust", v: "trust" });
t(100); snap("trust-result", ryan);
t(6100); t(3100); t(3300);
snap("unmask", ryan);
for (let i = 0; i < 6; i++) t(3300);
snap("honour-forsworn", tom); snap("honour-loyal", ryan);
a(tom, { a: "honour", v: "betray" }); snap("honour-sent", tom);
a(priya, { a: "honour", v: "honour" }); t(100);
snap("end-host", dir); snap("end-winner", tom); snap("end-loser", ryan);

process.stdout.write(JSON.stringify(out));
process.stderr.write(Object.keys(out).length + " moments\n");
