// A whole Modern evening from the rules engine, for tools/modern-shots.py to photograph for the tour page and the
// home page. Twists are off, so no secret prize (Casting Vote, Crown, Confessor), no Temptation and no final Honour or
// Betray appears: the tour shows how an evening goes without spoiling what the table discovers for itself.
// Prints {views: {key: {code, site, qr, host, tv}}, shots: [[file, key, "phone"|"tv", extra JS]]}.
import { newGame, join, act, tick, viewFor } from "../worker/src/modern.js";
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ctx = { rnd, dict: null };
let now = 1e12;
const s = newGame(now, rnd, { courses: false, twists: false }), ids = [];
for (const n of ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]) ids.push(join(s, n, now, rnd).id);
const dir = ids[0], views = {}, shots = [];
const a = (pid, x) => { const r = act(s, pid, x, now, ctx); if (r && r.error) throw new Error(JSON.stringify(x) + ": " + r.error); };
const t = (ms) => { now += ms || 0; tick(s, now, ctx); };
const alive = () => s.players.filter((p) => p.alive && !p.left).map((p) => p.id);
const role = (id) => s.players.find((p) => p.id === id).role;
// a moment, as one phone sees it and as the TV sees it
const snap = (key, pid) => (views[key] = { code: "K7Q2XM", site: "thebetrayal.co.uk", qr: "https://thebetrayal.co.uk/seal", host: viewFor(s, pid, now), tv: viewFor(s, null, now) });
const phone = (file, key, extra) => shots.push([file, key, "phone", extra || ""]);
const tv = (file, key) => shots.push([file, key, "tv", ""]);

// before anyone arrives: the host opens the Table on their phone, and guests join at /join
snap("start", dir); phone("tour-modern-phone-open.jpg", "start", "screen='create';last='';draw()");
phone("tour-modern-phone-join.jpg", "start", "screen='join';CODE='';last='';draw()");
snap("lobby", dir); phone("tour-modern-phone-lobby.jpg", "lobby"); tv("tour-modern-tv-lobby.jpg", "lobby");

// the Oath, then the roles
a(dir, { a: "start" }); a(ids[1], { a: "optin", v: "any" }); a(ids[2], { a: "optin", v: "no" });
snap("oath", ids[3]); phone("tour-modern-phone-oath.jpg", "oath"); tv("tour-modern-tv-oath.jpg", "oath");
ids.forEach((id, i) => { if (i > 2) a(id, { a: "optin", v: i === 3 ? "yes" : "any" }); });
a(dir, { a: "optin", v: "no" });
const F = s.players.filter((p) => p.role === "f").map((p) => p.id), L = ids.filter((id) => !F.includes(id));
snap("role", F[0]); phone("tour-modern-phone-role.jpg", "role", "peek=true;last='';draw()");
snap("role-l", L[1]); phone("tour-modern-phone-role-loyal.jpg", "role-l", "peek=true;last='';draw()");
ids.forEach((id) => a(id, { a: "ack" })); t();

// a day: the host's phone says what's next; the TV shows the table and the Purse
snap("day", dir); phone("tour-modern-phone-day.jpg", "day"); tv("tour-modern-tv-day.jpg", "day");

// a Trial from start to finish: the quiz
s.steps = [{ k: "trial", key: "quiz" }, { k: "reckon" }]; s.stepAt = 0; a(dir, { a: "next" });
snap("quiz-intro", L[1]); tv("tour-modern-tv-intro.jpg", "quiz-intro");
t(13000); snap("quiz", L[1]); phone("tour-modern-phone-quiz.jpg", "quiz"); tv("tour-modern-tv-quiz.jpg", "quiz");
const q = s.trial.item;
alive().forEach((id, i) => a(id, { a: "ans", v: i % 3 ? q.a : "no idea" }));
t(1000); snap("quiz-answer", L[1]); tv("tour-modern-tv-answer.jpg", "quiz-answer");
a(dir, { a: "tool", v: "endTrial" }); snap("quiz-done", L[1]); phone("tour-modern-phone-result.jpg", "quiz-done"); tv("tour-modern-tv-result.jpg", "quiz-done");
a(dir, { a: "cont" });

// a few of the other Trials, as they look on a phone
const trialShot = (key, file, pick) => {
  const keep = structuredClone(s), keepNow = now;
  s.steps = [{ k: "trial", key }, { k: "reckon" }]; s.stepAt = 0; a(dir, { a: "next" }); t(13000);
  if (key === "change") t(12000 + 4500); // the grid is back, with something changed
  const it = s.trial.item, who = pick(it);
  snap("trial-" + key, who); phone(file, "trial-" + key);
  for (const k of Object.keys(s)) delete s[k]; Object.assign(s, keep); now = keepNow;
};
trialShot("likely", "tour-modern-phone-likely.jpg", () => L[1]);
trialShot("countdown", "tour-modern-phone-word.jpg", () => L[1]);
trialShot("change", "tour-modern-phone-change.jpg", () => L[1]);
trialShot("charades", "tour-modern-phone-charades.jpg", (it) => it.actor);
trialShot("rps", "tour-modern-phone-rps.jpg", (it) => it.pairs[0][0]);
trialShot("truths", "tour-modern-phone-truths.jpg", (it) => alive().find((id) => id !== it.teller));

// a break (the host can pause, too)
a(dir, { a: "break", v: "interval" }); t(4000); snap("break", L[1]); phone("tour-modern-phone-break.jpg", "break");
a(dir, { a: "brkEnd" });
a(dir, { a: "pause" }); snap("pause", L[1]); phone("tour-modern-phone-pause.jpg", "pause"); a(dir, { a: "pause", v: "off" });

// the Reckoning: talk, vote, the reveal and last words
s.steps = [{ k: "reckon" }]; s.stepAt = 0; a(dir, { a: "next" }); t(20000);
snap("talk", L[1]); phone("tour-modern-phone-talk.jpg", "talk"); tv("tour-modern-tv-talk.jpg", "talk");
a(dir, { a: "tool", v: "voteNow" });
const target = L[2];
alive().slice(0, 5).forEach((id) => a(id, { a: "ballot", v: id === target ? L[3] : target }));
snap("vote", L[1]); phone("tour-modern-phone-vote.jpg", "vote"); tv("tour-modern-tv-vote.jpg", "vote");
alive().forEach((id) => a(id, { a: "ballot", v: id === target ? L[3] : target })); t();
t(6000); snap("exiled", target); phone("tour-modern-phone-words.jpg", "exiled");
a(target, { a: "words", v: "I was Loyal, and you’ll be sorry. Watch the quiet one." });
snap("reveal", L[1]); tv("tour-modern-tv-reveal.jpg", "reveal");
a(dir, { a: "cont" });

// night: everyone taps a name, so nobody can tell who is choosing
const victim = L.find((id) => id !== dir && id !== L[1] && id !== target && s.players.find((p) => p.id === id).alive);
F.forEach((f) => a(f, { a: "pick", v: victim }));
snap("night", F[0]); phone("tour-modern-phone-night.jpg", "night");
snap("night-l", L[1]); phone("tour-modern-phone-night-loyal.jpg", "night-l"); tv("tour-modern-tv-night.jpg", "night-l");
s.stats.likely = { [victim]: "Most likely to cry at a wedding" };
alive().forEach((id) => { if (role(id) !== "f") a(id, { a: "sleep" }); }); t();
snap("victim", victim); phone("tour-modern-phone-victim.jpg", "victim");
a(dir, { a: "cont" });
snap("dawn", L[1]); tv("tour-modern-tv-dawn.jpg", "dawn");
a(dir, { a: "cont" });

// the final, straight on: every Forsworn found, four left who must decide whether to trust each other
for (const p of s.players) if (p.alive && (p.role === "f" || ![dir, L[1], L[3], L[4]].includes(p.id))) { p.alive = false; p.exiled = s.round; }
s.final = true; s.phase = "trust"; s.trust = { votes: {}, end: now + 120000 }; s.trial = null; s.vote = null; s.night = null; s.dawn = null;
snap("trust", L[1]); phone("tour-modern-phone-trust.jpg", "trust");
alive().forEach((id) => a(id, { a: "trust", v: "trust" })); t(); t(7000); t(3500); t(3500);
snap("unmask", L[1]); tv("tour-modern-tv-unmask.jpg", "unmask");
for (let i = 0; i < 12 && s.phase === "unmask"; i++) t(3500);
snap("end", L[1]); phone("tour-modern-phone-end.jpg", "end"); tv("tour-modern-tv-end.jpg", "end");
if (s.phase !== "end") throw new Error("the evening didn't end: " + s.phase);
process.stdout.write(JSON.stringify({ views, shots }));
