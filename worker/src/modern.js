// The Betrayal — Modern. Everyone plays on their own phone: the server runs the game, deals the roles, collects every
// answer, vote and night choice, moves on by itself when everyone has answered or a clock runs out, and sends each phone
// only what that player may see. The room's creator is the director (the host): a player whose phone also moves the
// evening on (Trials, breaks, the Reckoning, dawn) and is shown no more secrets than anyone else's.
//
// Everything here is pure: (state, input, now) → state. The Durable Object (index.js) stores the state, calls tick()
// on every request so clocks move on, and answers each phone with viewFor().
import { QUIZ_E, QUIZ_M, QUIZ_H, LIKELY, ESTIMATE, MEMSETS, CHARADES, SONGS, SNAPSYM, PICTIONARY, COLORS } from "./content.gen.js";

// the default prize: chocolate coins, one for every 100 points the winners take from the Purse (coinsOf)
export const PRIZE0 = "chocolate coins";
const coinsOf = (prize, won) => (prize === PRIZE0 ? Math.floor(won / 100) : null);
export const MINP = 8, MAXP = 24, NAMEMAX = 14;
const CHSYM = ["moon", "sun", "blade", "crown", "shield", "table", "chalice", "scroll", "hourglass", "scales", "raven", "ghost", "key", "skull", "candle", "eye", "handshake"];
const TOKCH = "abcdefghjkmnpqrstuvwxyz23456789";
export const newTok = () => { const b = new Uint8Array(24); if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < 24; i++) b[i] = Math.floor(Math.random() * 256); return Array.from(b, (x) => TOKCH[x % 31]).join(""); };
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const shuffle = (a, rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fifty = (n) => Math.round(n / 50) * 50;
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
export const forswornFor = (n) => (n <= 7 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : n <= 22 ? 4 : 5);
const exilesAt = (a) => (a > 16 ? 2 : 1);
const killsAt = (a) => Math.max(0, Math.min(a >= 20 ? 3 : a >= 12 ? 2 : 1, a - 5));
export function roundsFor(n) { let a = n, r = 1; while (a > 5) { a -= Math.min(exilesAt(a), a - 5); if (a > 5) a -= killsAt(a); r++; } return r; }

// ---------------------------------------------------------------------------------------------------------------
// The Trials, as they are played on phones. kind: how the phones take part. prize: whether the winner takes Sanctuary.
export const TRIALS = {
  quiz: { title: "Rapid Quiz", prize: true, rules: "Eight questions, easy to brutal. Type your answer before the clock runs out. A point for every right answer, and one more for the fastest." },
  estimate: { title: "Closest Guess", prize: true, rules: "Five questions with a number for an answer. Guess on your phone. The closest takes two points, the next closest one." },
  hilo: { title: "Higher or Lower", prize: true, rules: "Six numbers. Is the true answer higher or lower? A point for every right call." },
  likely: { title: "Most Likely To", prize: false, rules: "Five prompts. Vote for the person each one fits best. Everyone sees the verdict. No Sanctuary here: just a reputation." },
  countdown: { title: "Longest Word", prize: true, rules: "Twelve letters, three rounds. Type the longest real word you can make from them. The longest wins the round." },
  memory: { title: "Memory Wall", prize: true, rules: "Twelve words appear for twenty seconds, then vanish. Type every one you remember. A point for each." },
  change: { title: "What Changed?", prize: true, rules: "Study the grid. It disappears, then comes back with something different. Tap what changed. The first right answer scores double." },
  snap: { title: "Snap", prize: true, rules: "A symbol changes every few seconds. When it matches the one before, tap SNAP. First right tap scores; a wrong tap loses a point." },
  rps: { title: "Rock Paper Scissors Royale", prize: true, rules: "Paired off at random, rock, paper or scissors on your phone. Lose and you're out. The last one standing wins." },
  oneleg: { title: "One Leg", prize: true, rules: "Everyone up, standing on one leg. Put a foot down and tap “I’m out” on your phone. Last one standing wins." },
  statue: { title: "The Statue", prize: true, ghosts: true, rules: "The living freeze. The Ghosts may do anything, short of touching, to make them move or laugh. Move and tap “I’m out”. Last statue standing wins." },
  charades: { title: "Screen Charades", prize: true, actor: 60, bank: "charades", rules: "One player at a time gets a secret word on their phone and acts it out, no words. When someone guesses it, the actor taps who. A point each to actor and guesser." },
  hum: { title: "Hum It", prize: true, actor: 30, bank: "songs", rules: "One player at a time gets a secret song on their phone and hums it. When someone names it, the hummer taps who. A point each." },
  draw: { title: "Pictionary", prize: true, actor: 60, bank: "draw", rules: "One player at a time gets a secret word and draws it (paper, a chalkboard, the air). When someone guesses, the artist taps who. A point each." },
  truths: { title: "Two Truths and a Lie", prize: true, rules: "Three players take a turn: say three things about yourself, one of them a lie. Everyone else votes for the lie on their phone. A point for every right vote, and one to the teller for every fool." },
};
export const trialKeys = (s) => Object.keys(TRIALS).filter((k) => !TRIALS[k].ghosts || ghosts(s).length);
// what the Forsworn may say to each other at night: set phrases only, so nothing typed can leak
export const WHISPERS = ["Agreed", "Not that one", "I’m under suspicion", "Vote with me tomorrow", "Stay quiet tomorrow", "Someone’s onto us"];
const WORDS = 140; // the most a last word may run to
const TEMPT = { title: "The Temptation", prize: false, rules: "One word, in secret: PURSE, for the table, or SELF, for yourself. Exactly one SELF takes Sanctuary and the Purse grows. Nobody: the Purse grows double. Two or more: nobody gets it, and the Purse shrinks." };

// ---------------------------------------------------------------------------------------------------------------
const alive = (s) => s.players.filter((p) => p.alive && !p.left);
const ghosts = (s) => s.players.filter((p) => !p.alive && !p.left);
const P = (s, id) => s.players.find((p) => p.id === id);
const forsworn = (s) => alive(s).filter((p) => p.role === "f");
// a test game (a master-code room, with bots): every countdown is at most ten seconds
const T = (s, ms) => (s.test ? Math.min(ms, 10000) : ms);
const say = (s, line, now) => { s.log = [{ t: now, m: clip(line, 300) }, ...(s.log || [])].slice(0, 300); };

export function newGame(now, rnd, opts) {
  return {
    mode: "modern", v: 1, gid: Math.floor(rnd() * 1e9).toString(36), ver: 1, created: now, phase: "lobby", round: 0, final: false,
    opts: { shield: "secret", prize: PRIZE0, prizes: [], title: "The Betrayal", potCap: 2000, talk: 240, twists: true, courses: false, ...(opts || {}) },
    director: null, players: [], pot: 0, plan: [], planAt: 0, steps: [], stepAt: 0, total: 0, cast: null, crown: null, confess: null, peeked: [], done: {}, trial: null, brk: null, vote: null, reveal: null, night: null, dawn: null,
    trust: null, unmask: null, honour: null, result: null, stats: { wins: {}, against: {}, calls: {}, firstBlood: null, votes: [] }, log: [],
  };
}

// a phone joins with its name; the first to join a game made from a booking is the director
export function join(s, name, now, rnd, bot) {
  name = clip(String(name || "").replace(/\s+/g, " ").trim(), NAMEMAX);
  if (!name) return { error: "Type your name." };
  const same = s.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (same) return { error: "Someone here is already called " + same.name + ". Add an initial." };
  if (s.phase !== "lobby") return { error: "This game has already started. Ask the host to let you back in." };
  if (s.players.length >= MAXP) return { error: "This Table is full (" + MAXP + " players)." };
  const id = "p" + (s.players.length + 1) + Math.floor(rnd() * 1e6).toString(36), tok = newTok();
  s.players.push({ id, tok, name, color: COLORS[s.players.length % COLORS.length], role: null, alive: true, left: false, optIn: null, acked: false, shield: null, joined: now, ...(bot ? { bot: true } : {}) });
  if (!s.director) s.director = id;
  say(s, name + " joined", now);
  return { id, tok };
}

const BOTNAMES = ["Agnes", "Barnaby", "Cressida", "Digby", "Elspeth", "Fergus", "Gwendolyn", "Horace", "Isolde", "Jasper", "Kit", "Lavinia", "Mortimer", "Nell", "Oswald", "Perpetua", "Quentin", "Rosalind", "Silas", "Tabitha", "Ulric", "Violet", "Wilfred"];
export function addBots(s, upto, now, rnd) {
  for (const n of BOTNAMES) { if (s.players.length >= Math.min(MAXP, upto)) break; if (!s.players.some((p) => p.name === n)) join(s, n, now, rnd, true); }
}
// The bots of a test game: they swear, look at their role, vote, choose at night and trust, a moment after the phase
// opens (on the next request). The Forsworn among them vote for the Loyal and choose the Loyal at night.
function botsMove(s, now, rnd) {
  const B = s.players.filter((p) => p.bot && !p.left); if (!B.length) return false;
  let ch = false; const A = alive(s), mine = (p) => B.includes(p);
  const any = (list) => (list.length ? list[Math.floor(rnd() * list.length)] : null);
  if (s.phase === "oath") { for (const p of B) if (!p.optIn) { p.optIn = "any"; ch = true; } if (s.players.every((p) => p.left || p.optIn)) { deal(s, now, rnd); ch = true; } }
  if (s.phase === "roles") for (const p of B) if (!p.acked) { p.acked = true; ch = true; }
  const it = s.trial && s.trial.item;
  if (it && it.stage === "open" && it.k === "tempt") for (const p of A.filter(mine)) if (!(p.id in it.inputs)) { it.inputs[p.id] = { v: rnd() < 0.15 ? "self" : "purse", t: now }; ch = true; }
  if (s.phase === "vote") {
    const v = s.vote;
    for (const p of A.filter(mine)) if (!(p.id in v.ballots)) {
      const c = A.filter((q) => q.id !== p.id && q.id !== v.immune && (!v.revote || v.revote.includes(q.id)));
      const tg = p.role === "f" ? any(c.filter((q) => q.role !== "f")) || any(c) : any(c);
      if (tg) { v.ballots[p.id] = tg.id; ch = true; }
    }
  }
  if (s.phase === "night") {
    const n = s.night;
    for (const p of A.filter(mine)) {
      if (p.role === "f" && ![].concat(n.picks[p.id] || []).length) { const t = shuffle(A.filter((q) => q.role !== "f"), rnd).slice(0, n.kills).map((q) => q.id); if (t.length) { n.picks[p.id] = t; ch = true; } }
      if (p.role !== "f" && !n.slept[p.id]) { n.slept[p.id] = true; ch = true; }
    }
  }
  if (s.phase === "trust" && !s.trust.result) for (const p of A.filter(mine)) if (!s.trust.votes[p.id]) { s.trust.votes[p.id] = rnd() < 0.75 ? "trust" : "doubt"; ch = true; }
  if (s.phase === "honour") for (const p of A.filter((q) => mine(q) && q.role === "f")) if (!s.honour.choices[p.id]) { s.honour.choices[p.id] = rnd() < 0.5 ? "honour" : "betray"; ch = true; }
  return ch;
}

// ---------------------------------------------------------------------------------------------------------------
// Answers are marked leniently: case, punctuation, "the", small slips, and numbers written either way.
const NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const norm = (v) => String(v || "").toLowerCase().replace(/\b[a-z]+\b/g, (w) => (NUMW.includes(w) ? String(NUMW.indexOf(w)) : w)).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
function lev(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
export function marks(given, answer) {
  const g = norm(given), a = norm(answer); if (!g) return false;
  if (g === a) return true;
  const gn = parseFloat(g.replace(/ /g, "")), an = parseFloat(String(answer).replace(/[^0-9.]/g, ""));
  if (!isNaN(an) && /^[0-9 .]+$/.test(g)) return gn === an;
  if (g.length >= 5 && a.includes(" ") && (a.endsWith(" " + g) || a.startsWith(g + " "))) return true;
  if (a.length >= 4 && (g.includes(a) || (g.length >= 4 && a.includes(g) && g.length >= a.length * 0.6))) return true;
  return lev(g, a) <= (a.length >= 10 ? 2 : a.length >= 5 ? 1 : 0);
}
const letters12 = (rnd) => { const V = "AAAAEEEEEIIIIOOOUU", C = "BBCCDDDFGGHHJKLLLMMNNNNPPQRRRRRSSSSTTTTVWXYZ", a = []; let vn = 0; while (a.length < 12) { const v = vn < 4 || (a.length > 7 && vn < 5 && rnd() < .4); a.push(pick(v ? V : C, rnd)); if (v) vn++; } return shuffle(a, rnd).join(""); };
const fits = (w, letters) => { const c = {}; for (const ch of letters.toLowerCase()) c[ch] = (c[ch] || 0) + 1; for (const ch of w) { if (!c[ch]) return false; c[ch]--; } return true; };

// ---------------------------------------------------------------------------------------------------------------
// Items: a Trial is a run of items (a question, a turn, a bout). Each is open (answers come in) until everyone has
// answered or its clock runs out, then shows its result for a moment, then the next one starts by itself.
const OPEN = { text: 20, number: 25, hilo: 15, vote: 25, word: 45, recall: 45, cell: 20, rps: 15, tempt: 30, truths: 25 };
function makeItem(s, t, now, rnd) {
  const n = t.i, A = alive(s), used = (s.used = s.used || {});
  const fresh = (bank, key) => { const u = (used[key] = used[key] || []), pool = bank.map((_, i) => i).filter((i) => !u.includes(i)); const i = pool.length ? pick(pool, rnd) : Math.floor(rnd() * bank.length); u.push(i); return bank[i]; };
  const base = { stage: "open", inputs: {}, opened: now };
  switch (t.key) {
    case "quiz": { if (n >= 8) return null; const q = fresh(n < 3 ? QUIZ_E : n < 6 ? QUIZ_M : QUIZ_H, n < 3 ? "qe" : n < 6 ? "qm" : "qh"); return { ...base, k: "text", q: q[0], a: String(q[1]), part: n < 3 ? "easy" : n < 6 ? "medium" : "brutal", end: now + OPEN.text * 1000 }; }
    case "estimate": { if (n >= 5) return null; const q = fresh(ESTIMATE, "est"); return { ...base, k: "number", q: q[0], a: +q[1], end: now + OPEN.number * 1000 }; }
    case "hilo": { if (n >= 6) return null; const q = fresh(ESTIMATE, "est"), a = +q[1], ref = Math.max(1, Math.round(a * (0.55 + rnd() * 0.9))); return { ...base, k: "hilo", q: q[0], ref: ref === a ? a + 1 : ref, a, end: now + OPEN.hilo * 1000 }; }
    case "likely": { if (n >= 5) return null; return { ...base, k: "vote", q: "Most likely to " + String(fresh(LIKELY, "lk")).replace(/^most likely to /i, ""), end: now + OPEN.vote * 1000 }; }
    case "countdown": { if (n >= 3) return null; return { ...base, k: "word", letters: letters12(rnd), end: now + OPEN.word * 1000 }; }
    case "memory": { if (n >= 2) return null; const set = shuffle(fresh(MEMSETS, "mem"), rnd).slice(0, 12); return { ...base, k: "recall", stage: "study", words: set, end: now + 20000 }; }
    case "change": { if (n >= 4) return null; const grid = shuffle(CHSYM, rnd).slice(0, 12); return { ...base, k: "cell", stage: "study", grid, end: now + 12000 }; }
    case "snap": { if (n >= 1) return null; const seq = []; let last = -1; for (let i = 0; i < 24; i++) { let v; if (i > 0 && rnd() < 0.22) v = last; else { do v = Math.floor(rnd() * SNAPSYM.length); while (v === last); } seq.push(v); last = v; } return { ...base, k: "snap", seq, step: 3000, start: now + 3000, end: now + 3000 + 24 * 3000, taps: [], syms: SNAPSYM }; }
    case "rps": { const inn = (t.left || A.map((p) => p.id)).filter((id) => A.some((p) => p.id === id)); if (inn.length <= 1) return null; const order = shuffle(inn, rnd), pairs = []; for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i], order[i + 1]]); return { ...base, k: "rps", pairs, bye: order.length % 2 ? order[order.length - 1] : null, end: now + OPEN.rps * 1000 }; }
    case "oneleg": case "statue": { if (n >= 1) return null; return { ...base, k: "survive", out: [], end: now + 10 * 60000 }; }
    case "charades": case "hum": case "draw": {
      const turns = Math.min(A.length, 6); if (n >= turns) return null;
      const order = (t.order || (t.order = shuffle(A.map((p) => p.id), rnd))).filter((id) => A.some((p) => p.id === id)), actor = order[n % order.length], d = TRIALS[t.key];
      const bank = d.bank === "songs" ? SONGS : d.bank === "draw" ? PICTIONARY : CHARADES;
      return { ...base, k: "actor", actor, word: String(fresh(bank, d.bank)), skips: 0, end: now + d.actor * 1000 };
    }
    case "truths": { const turns = Math.min(3, A.length); if (n >= turns) return null; const order = t.order || (t.order = shuffle(A.map((p) => p.id), rnd)), teller = order.slice(n).find((id) => A.some((p) => p.id === id)); if (!teller) return null; return { ...base, k: "truths", stage: "prep", teller, lie: null, end: now + 90000 }; }
    case "tempt": { if (n >= 1) return null; return { ...base, k: "tempt", end: now + OPEN.tempt * 1000 }; }
  }
  return null;
}
function makeItemT(s, t, now, rnd) { const it = makeItem(s, t, now, rnd); if (it && it.end) it.end = now + T(s, it.end - now); return it; }
// who still owes an answer to this item
function owed(s, it) {
  const A = alive(s).map((p) => p.id);
  if (it.k === "rps") return it.pairs.flat().filter((id) => !(id in it.inputs));
  if (it.k === "actor" || it.k === "survive" || it.k === "snap") return [];
  if (it.k === "truths") return it.stage === "open" ? A.filter((id) => id !== it.teller && !(id in it.inputs)) : [];
  return A.filter((id) => !(id in it.inputs));
}
// an item's result: points to add, and what everyone sees
function score(s, t, it, ctx) {
  const pts = {}, add = (id, n) => { pts[id] = (pts[id] || 0) + n; }, A = alive(s);
  const wrongF = (id) => { const p = P(s, id); if (p && p.role === "f") t.wrongF = (t.wrongF || 0) + 1; };
  const res = {};
  if (it.k === "text") {
    const right = Object.entries(it.inputs).filter(([id, x]) => (it.ok || []).includes(id) || marks(x.v, it.a)).sort((a, b) => a[1].t - b[1].t);
    right.forEach(([id], i) => add(id, i === 0 ? 2 : 1)); res.right = right.map(([id]) => id); res.first = right[0] ? right[0][0] : null;
    for (const [id, x] of Object.entries(it.inputs)) if (!res.right.includes(id) && String(x.v).trim()) wrongF(id);
  } else if (it.k === "number") {
    const g = Object.entries(it.inputs).filter(([, x]) => x.v !== "" && !isNaN(+x.v)).map(([id, x]) => [id, Math.abs(+x.v - it.a), +x.v]).sort((a, b) => a[1] - b[1]);
    if (g[0]) g.filter((x) => x[1] === g[0][1]).forEach(([id]) => add(id, 2)); const second = g.find((x) => x[1] > (g[0] || [0, 0])[1]); if (second) g.filter((x) => x[1] === second[1]).forEach(([id]) => add(id, 1));
    res.closest = g.filter((x) => g[0] && x[1] === g[0][1]).map((x) => x[0]); res.guesses = g.map(([id, , v]) => [id, v]);
  } else if (it.k === "hilo") {
    const truth = it.a > it.ref ? "higher" : "lower"; res.truth = truth; res.right = Object.entries(it.inputs).filter(([, x]) => x.v === truth).map(([id]) => id); res.right.forEach((id) => add(id, 1));
  } else if (it.k === "vote") {
    const c = {}; for (const x of Object.values(it.inputs)) if (P(s, x.v)) c[x.v] = (c[x.v] || 0) + 1;
    res.counts = Object.entries(c).sort((a, b) => b[1] - a[1]); res.top = res.counts.length ? res.counts.filter((x) => x[1] === res.counts[0][1]).map((x) => x[0]) : [];
    if (res.top.length === 1) (s.stats.likely = s.stats.likely || {})[res.top[0]] = it.q;
  } else if (it.k === "word") {
    const ok = Object.entries(it.inputs).map(([id, x]) => [id, String(x.v || "").toLowerCase().replace(/[^a-z]/g, "")]).filter(([, w]) => w.length >= 3 && fits(w, it.letters) && (!ctx.dict || ctx.dict.has(w)));
    const best = Math.max(0, ...ok.map(([, w]) => w.length)); ok.forEach(([id, w]) => add(id, w.length === best ? 2 : w.length >= 6 ? 1 : 0));
    res.words = Object.entries(it.inputs).map(([id, x]) => [id, String(x.v || "").toUpperCase(), ok.some((o) => o[0] === id)]); res.best = best;
  } else if (it.k === "recall") {
    const W = it.words.map((w) => norm(w)); res.counts = {};
    for (const [id, x] of Object.entries(it.inputs)) { const got = new Set(String(x.v || "").split(/[\n,;]+/).map(norm).filter((g) => W.some((w) => marks(g, w))).map((g) => W.find((w) => marks(g, w)))); res.counts[id] = got.size; add(id, got.size); }
  } else if (it.k === "cell") {
    const right = Object.entries(it.inputs).filter(([, x]) => it.changed.includes(+x.v)).sort((a, b) => a[1].t - b[1].t);
    right.forEach(([id], i) => add(id, i === 0 ? 2 : 1)); res.right = right.map(([id]) => id);
    for (const [id, x] of Object.entries(it.inputs)) if (!it.changed.includes(+x.v)) wrongF(id);
  } else if (it.k === "snap") {
    const hits = {}; // a tap counts on the symbol showing when it landed; the first right tap on each snap scores
    for (const tp of it.taps.sort((a, b) => a.t - b.t)) {
      const i = Math.floor((tp.t - it.start) / it.step), ok = i > 0 && i < it.seq.length && it.seq[i] === it.seq[i - 1];
      if (ok && !(i in hits)) { hits[i] = tp.id; add(tp.id, 1); } else if (!ok) { add(tp.id, -1); wrongF(tp.id); }
    }
    res.hits = Object.values(hits);
  } else if (it.k === "rps") {
    const beats = { rock: "scissors", paper: "rock", scissors: "paper" }, next = it.bye ? [it.bye] : []; res.bouts = [];
    for (const [a, b] of it.pairs) {
      const x = (it.inputs[a] || {}).v || pick(["rock", "paper", "scissors"], ctx.rnd), y = (it.inputs[b] || {}).v || pick(["rock", "paper", "scissors"], ctx.rnd);
      const w = x === y ? null : beats[x] === y ? a : b; res.bouts.push([a, x, b, y, w]);
      if (w) next.push(w); else next.push(a, b);
    }
    t.left = next; if (next.length === 1) add(next[0], 1);
  } else if (it.k === "survive") {
    const still = A.map((p) => p.id).filter((id) => !it.out.includes(id)); still.forEach((id) => add(id, 1)); res.still = still;
  } else if (it.k === "actor") {
    const g = it.guess; if (g && g !== "none" && P(s, g)) { add(g, 1); add(it.actor, 1); } res.word = it.word; res.guess = g || "none"; res.actor = it.actor;
  } else if (it.k === "truths") {
    const right = Object.entries(it.inputs).filter(([, x]) => +x.v === it.lie).map(([id]) => id), fooled = Object.keys(it.inputs).length - right.length;
    right.forEach((id) => add(id, 1)); add(it.teller, fooled); res.lie = it.lie; res.right = right; res.teller = it.teller; res.fooled = fooled;
  } else if (it.k === "tempt") {
    const self = Object.entries(it.inputs).filter(([, x]) => x.v === "self").map(([id]) => id); res.self = self.length; res.who = self.length === 1 ? self[0] : null;
  }
  for (const [id, n] of Object.entries(pts)) t.scores[id] = Math.max(0, (t.scores[id] || 0) + n);
  res.pts = pts; return res;
}

// ---------------------------------------------------------------------------------------------------------------
// The flow. tick() moves every clock on; act() takes one player's input. Both return true when something changed.
function offerOf(s) { const left = Math.max(0, s.opts.potCap - s.pot); const roundsLeft = Math.max(1, roundsFor(alive(s).length) - (s.final ? 0 : 0)); return Math.min(left, Math.max(50, fifty(left / (roundsLeft * 1.2)))); }
// The evening plans itself: each day is a short list of steps (a course, a Trial or two, the Reckoning) and the host's
// phone only says "next". The twists come once a game each, on rounds picked from the table's size: the Casting Vote
// about halfway (its Trial gives the Casting Vote instead of Sanctuary, and the Temptation follows it), the Crown on the
// last round before the final, and the Confessor in the final when five remain with one Forsworn among them.
const BREAKS = { interval: [10, "The Interval"], starter: [15, "The Starter"], main: [25, "The Main Course"], dessert: [15, "Dessert"] };
const SPECIAL = {
  cast: "The winner takes the Casting Vote instead of Sanctuary: if a Reckoning ties, their vote decides it. Once.",
  crown: "The winner takes the Crown: Sanctuary tonight, and once, at a Reckoning, they may lay it down to be safe from that exile.",
  confess: "The winner takes a special prize. What it is stays secret.",
};
function planDay(s) {
  const nf = Math.max(1, s.total - 1), r = s.round, tw = s.opts.twists, steps = [];
  const castR = nf >= 3 ? Math.max(2, Math.floor(nf / 2)) : 1, crownR = nf >= 2 ? nf : 0, mainR = Math.max(3, Math.ceil((nf + 1) / 2) + 1);
  if (s.opts.courses) {
    if (s.final && !s.done.dessert) steps.push({ k: "break", v: "dessert" });
    else if (!s.final && r === 2 && !s.done.starter) steps.push({ k: "break", v: "starter" });
    else if (!s.final && r === mainR && !s.done.main) steps.push({ k: "break", v: "main" });
  }
  if (r === 1 && !s.final && !s.done.likely) steps.push({ k: "trial", key: "likely", once: "likely" });
  if (s.final) {
    if (!s.done.finalTrial) steps.push({ k: "trial", special: tw && alive(s).length === 5 && !s.confess ? "confess" : null, once: "finalTrial" });
  } else if (r === castR && !s.done.tempt) {
    steps.push({ k: "trial", special: tw && !s.cast ? "cast" : null }, ...(tw ? [{ k: "tempt" }] : []));
  } else {
    steps.push({ k: "trial", special: tw && r === crownR && !s.crown ? "crown" : null });
  }
  steps.push({ k: "reckon" });
  for (const st of steps) if (st.k === "trial" && !st.key) st.key = nextTrialKey(s, Math.random); // named now, so "next" can say which
  s.steps = steps; s.stepAt = 0;
}
const stepLabel = (s, st) => !st ? null : st.k === "break" ? BREAKS[st.v][1] + " · " + BREAKS[st.v][0] + " min" : st.k === "tempt" ? TEMPT.title : st.k === "reckon" ? "The Reckoning" : st.key ? TRIALS[st.key].title : "A Trial";
function nextTrialKey(s, rnd) {
  const ok = trialKeys(s).filter((k) => k !== "likely"), used = (s.usedTrials = s.usedTrials || []);
  let pool = s.plan.filter((k) => ok.includes(k) && !used.includes(k));
  if (!pool.length) { s.usedTrials = []; pool = s.plan.filter((k) => ok.includes(k)); }
  const k = pool[0] || pick(ok, rnd); s.usedTrials.push(k); return k;
}
function runStep(s, now, rnd) {
  const st = s.steps[s.stepAt]; if (!st) return false;
  s.stepAt++;
  if (st.once) s.done[st.once] = true;
  if (st.k === "break") { s.done[st.v] = true; startBreak(s, st.v, now); }
  else if (st.k === "tempt") startTrial(s, "tempt", now, rnd);
  else if (st.k === "reckon") openReckoning(s, now);
  else startTrial(s, st.key || nextTrialKey(s, rnd), now, rnd, st.special);
  return true;
}
function startBreak(s, v, now) { const B = BREAKS[v]; s.phase = "break"; s.brk = { kind: v, name: B[1], end: now + T(s, B[0] * 60000), dur: T(s, B[0] * 60000) }; say(s, B[1], now); }
function toDay(s) { s.phase = "day"; s.trial = null; s.brk = null; }
function startTrial(s, key, now, rnd, special) {
  const d = key === "tempt" ? TEMPT : TRIALS[key];
  s.phase = "trial"; s.brk = null; s.roundTrials = (s.roundTrials || 0) + 1;
  s.trial = { key, title: d.title, rules: d.rules + (special && d.prize ? " " + SPECIAL[special] : ""), prize: d.prize, special: d.prize ? special || null : null, stage: "intro", introEnd: now + T(s, 12000), i: 0, item: null, scores: {}, wrongF: 0, offer: key === "tempt" ? Math.max(100, fifty(offerOf(s) / 2)) : offerOf(s), results: [] };
  if (key === "tempt") s.done.tempt = true;
  say(s, "Trial: " + d.title, now);
}
function nextItem(s, now, rnd) {
  const t = s.trial; const it = makeItemT(s, t, now, rnd);
  if (!it) return finishTrial(s, now, rnd);
  t.item = it; t.stage = "play";
}
function finishTrial(s, now, rnd) {
  const t = s.trial; t.stage = "done"; t.item = null;
  const A = alive(s), tot = Object.values(t.scores).reduce((a, b) => a + b, 0), items = Math.max(1, t.i);
  if (t.key === "tempt") {
    const r = t.results[0]; t.points = !r ? 0 : r.self === 1 ? t.offer : r.self === 0 ? t.offer * 2 : -t.offer; if (!r) { t.winners = []; }
    if (r && r.who) { const p = P(s, r.who); p.shield = { round: s.round, secret: false }; t.winners = [r.who]; }
  } else {
    // the table's success fills the Purse; each wrong answer from a Forsworn takes 50 back, up to half the Trial's offer
    t.points = Math.max(0, fifty(t.offer * Math.min(1, tot / Math.max(1, A.length * items * 0.6)))) - Math.min(fifty(t.offer / 2), 50 * (t.wrongF || 0));
    const live = Object.keys(t.scores).filter((id) => P(s, id) && P(s, id).alive), best = Math.max(0, ...live.map((id) => t.scores[id])); let w = best > 0 ? live.filter((id) => t.scores[id] === best) : [];
    if (w.length > 1) { w = [pick(w, rnd)]; t.byLot = true; } // one Sanctuary a Trial: a tie is settled by lot
    t.winners = w;
    if (t.special && w.length) {
      const p = P(s, w[0]);
      if (t.special === "cast") s.cast = { id: p.id, used: false, round: s.round };
      if (t.special === "crown") { s.crown = { id: p.id, used: false, round: s.round }; p.shield = { round: s.round, secret: true }; }
      if (t.special === "confess") { const F = forsworn(s).filter((f) => f.id !== p.id); s.confess = { id: p.id, of: F.length ? pick(F, rnd).id : null }; }
      t.gave = t.special; say(s, { cast: "The Casting Vote", crown: "The Crown", confess: "The Confessor" }[t.special] + " to " + p.name, now);
    } else if (t.prize && w.length && !s.final) {
      const holders = alive(s).filter((p) => p.shield && p.shield.round === s.round).length;
      if (holders < Math.max(1, Math.floor(A.length / 4))) { const p = P(s, w[0]); if (p.role !== "f" || s.opts.shield === "public") p.shield = { round: s.round, secret: s.opts.shield !== "public" }; t.sanct = w[0]; }
    }
    for (const id of w) s.stats.wins[id] = (s.stats.wins[id] || 0) + 1;
  }
  const before = s.pot; s.pot = Math.max(0, Math.min(s.opts.potCap, s.pot + t.points)); t.points = s.pot - before;
  say(s, t.title + " done: " + (t.winners && t.winners.length ? P(s, t.winners[0]).name + " won" : "no winner") + ", Purse " + (t.points >= 0 ? "+" : "") + t.points, now);
}
function openReckoning(s, now) {
  s.phase = "talk"; s.trial = null; s.brk = null;
  s.vote = { stage: "talk", talkEnd: now + T(s, s.opts.talk * 1000), ballots: {}, calls: {}, revote: null, second: !!(s.vote && s.vote.firstDone && s.vote.round === s.round), round: s.round, secret: s.final };
  say(s, "The Reckoning", now);
}
function openVote(s, now) { s.phase = "vote"; s.vote.stage = "vote"; s.vote.voteEnd = now + T(s, 120000); }
function closeVote(s, now, rnd) {
  const v = s.vote, c = {};
  for (const [voter, tg] of Object.entries(v.ballots)) if (tg !== v.immune && P(s, tg) && P(s, tg).alive && P(s, voter) && P(s, voter).alive) c[tg] = (c[tg] || 0) + 1;
  const ranked = Object.entries(c).sort((a, b) => b[1] - a[1]), top = ranked.length ? ranked[0][1] : 0; let tied = ranked.filter((x) => x[1] === top).map((x) => x[0]);
  v.counts = ranked;
  if (!ranked.length) { v.none = true; tied.length = 0; }
  // the Casting Vote: a tie its holder voted in is settled by their vote (the table sees that it was used, never by whom)
  const cv = s.cast && !s.cast.used && P(s, s.cast.id) && P(s, s.cast.id).alive ? v.ballots[s.cast.id] : null;
  if (tied.length > 1 && cv && tied.includes(cv)) { s.cast.used = true; tied = [cv]; v.cast = true; say(s, "The Casting Vote settled the tie", now); }
  if (tied.length > 1 && !v.revote) { v.revote = tied; v.ballots = {}; v.stage = "vote"; v.voteEnd = now + T(s, 90000); v.tie = true; say(s, "A tie: a revote between " + tied.map((id) => P(s, id).name).join(" and "), now); return; }
  const rv = (v.revote || []).filter((id) => P(s, id) && P(s, id).alive), pool = (rv.length ? rv : alive(s).map((p) => p.id)).filter((id) => id !== v.immune);
  if (!tied.length && !pool.length) { v.stage = "done"; return startUnmask(s, now); }
  const out = tied.length ? (tied.length > 1 ? pick(tied, rnd) : tied[0]) : pick(pool, rnd); // a second tie, or no votes at all, is settled by lot
  const p = P(s, out); p.alive = false; p.shield = null; p.exiled = s.round;
  for (const [voter, tg] of Object.entries(v.ballots)) { (s.stats.against[tg] = s.stats.against[tg] || []).push(voter); }
  s.stats.votes.push({ round: s.round, ballots: { ...v.ballots }, out, role: p.role });
  const called = Object.entries(v.calls).filter(([, tg]) => tg === out).map(([g]) => g); for (const g of called) s.stats.calls[g] = (s.stats.calls[g] || 0) + 1;
  s.phase = "reveal"; s.reveal = { id: out, at: now, roleAt: s.final ? null : now + 5000, byLot: tied.length > 1 || !ranked.length, cast: !!v.cast, called, counts: ranked, secret: s.final };
  v.firstDone = true; v.stage = "done";
  say(s, "Exiled: " + p.name + " (" + (p.role === "f" ? "Forsworn" : "Loyal") + ")", now);
}
function afterReveal(s, now) {
  const A = alive(s);
  if (!forsworn(s).length && !s.final) return goFinal(s, now);
  if (s.final) { if (A.length <= 2) return startUnmask(s, now); if (A.length <= 4) return startTrust(s, now); return openReckoning(s, now); }
  if (s.vote && !s.vote.second && A.length + 1 > 16 && exilesAt(A.length + 1) === 2 && A.length > 5) { openReckoning(s, now); s.vote.second = true; return; }
  if (A.length <= 5) return goFinal(s, now);
  startNight(s, now);
}
function goFinal(s, now) { s.trial = null; s.brk = null; s.vote = null; s.final = true; s.round++; s.phase = "day"; s.roundTrials = 0; s.night = null; s.dawn = null; s.reveal = null; for (const p of s.players) p.shield = null; planDay(s); say(s, "The final", now); }
function startNight(s, now) {
  s.phase = "night"; s.reveal = null; const a = alive(s).length;
  s.night = { picks: {}, slept: {}, kills: killsAt(a), end: now + T(s, 120000) };
  say(s, "Night falls", now);
}
function resolveNight(s, now, rnd) {
  const n = s.night, c = {}, F = forsworn(s);
  for (const f of F) for (const tg of [].concat(n.picks[f.id] || [])) if (P(s, tg) && P(s, tg).alive && P(s, tg).role !== "f") c[tg] = (c[tg] || 0) + 1;
  let order = Object.entries(c).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const loyal = alive(s).filter((p) => p.role !== "f").map((p) => p.id);
  while (order.length < n.kills && loyal.length > order.length) { const r = pick(loyal.filter((id) => !order.includes(id)), rnd); order.push(r); } // Forsworn who chose nobody: the house chooses
  const targets = order.slice(0, n.kills), victims = [], saved = [];
  for (const id of targets) { const p = P(s, id); if (p.shield && p.shield.round === s.round) saved.push(id); else victims.push(id); }
  for (const id of victims) { const p = P(s, id); p.dying = true; if (!s.stats.firstBlood) s.stats.firstBlood = id; }
  s.phase = "dawn"; s.dawn = { victims, saved: saved.length, revealed: false, at: now };
  say(s, "Night: " + (victims.length ? victims.map((id) => P(s, id).name).join(", ") + " poisoned" : "nobody poisoned") + (saved.length ? " (Sanctuary held)" : ""), now);
}
function revealDawn(s, now) {
  const d = s.dawn; d.revealed = true; d.lastEnd = d.victims.length ? now + T(s, 30000 * d.victims.length) : null;
  for (const id of d.victims) { const p = P(s, id); p.alive = false; p.dying = false; p.died = s.round; }
}
function nextRound(s, now) {
  s.round++; s.phase = "day"; s.roundTrials = 0; s.dawn = null; s.night = null; s.reveal = null; s.vote = null;
  for (const p of s.players) if (p.shield && p.shield.round < s.round) p.shield = null;
  if (alive(s).length <= 5 || !forsworn(s).length) { s.final = true; say(s, "The final", now); }
  planDay(s);
}
function startTrust(s, now) { s.phase = "trust"; s.trust = { votes: {}, end: now + T(s, 120000) }; }
function startUnmask(s, now) { s.phase = "unmask"; s.unmask = { order: alive(s).map((p) => p.id), shown: 0, next: now + 3000 }; }
function finishGame(s, now) {
  const F = forsworn(s), win = F.length ? "forsworn" : "loyal";
  if (F.length >= 2 && !s.honour) { s.phase = "honour"; s.honour = { choices: {}, end: now + T(s, 90000) }; return; }
  // the Loyal take the Purse they built; the Forsworn take what it fell short, so every point they sabotaged is theirs
  const won = win === "forsworn" ? Math.max(0, s.opts.potCap - s.pot) : s.pot;
  const tiers = (s.opts.prizes || []).filter((x) => x.what && won >= x.at * s.opts.potCap), prize = tiers.length ? tiers[tiers.length - 1].what : s.opts.prize;
  let to = win === "forsworn" ? F.map((p) => p.id) : alive(s).map((p) => p.id), how = null;
  if (s.honour) {
    const b = Object.entries(s.honour.choices).filter(([, v]) => v === "betray").map(([id]) => id);
    if (b.length === 1) { to = b; how = "betrayed"; } else if (b.length > 1) { to = []; how = "nobody"; } else how = "honoured";
  }
  s.phase = "end"; s.result = { winner: win, prize, tier: tiers.length ? tiers[tiers.length - 1].at : 0, to, how, pot: s.pot, won, coins: coinsOf(prize, won), cap: s.opts.potCap, awards: awardsOf(s), peeked: (s.peeked || []).map((x) => x.round) };
  say(s, (win === "forsworn" ? "The Forsworn win" : "The Loyal win") + " · prize: " + prize, now);
}
function awardsOf(s) {
  const out = [], taken = new Set(), give = (title, id, why) => { if (id && !taken.has(id) && P(s, id)) { taken.add(id); out.push({ title, id, name: P(s, id).name, why }); } };
  const hitF = {}, hitL = {}; for (const v of s.stats.votes) for (const [voter, tg] of Object.entries(v.ballots)) { const p = P(s, tg); if (!p) continue; (p.role === "f" ? hitF : hitL)[voter] = ((p.role === "f" ? hitF : hitL)[voter] || 0) + 1; }
  const best = (o) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1]); return e.length && (e.length < 2 || e[0][1] > e[1][1]) ? e[0] : null; };
  let b = best(hitF); if (b) give("The Sharpest Eye", b[0], "voted for a Forsworn " + b[1] + (b[1] === 1 ? " time" : " times"));
  const F = s.players.filter((p) => p.role === "f"); const dec = F.map((p) => [p.id, (s.stats.against[p.id] || []).length]).sort((a, c) => a[1] - c[1])[0]; if (dec) give("The Grand Deceiver", dec[0], dec[1] ? "drew only " + dec[1] + (dec[1] === 1 ? " vote" : " votes") + " all night" : "drew no votes all night");
  b = best(s.stats.wins); if (b) give("Trial Machine", b[0], "won " + b[1] + (b[1] === 1 ? " Trial" : " Trials"));
  b = best(Object.fromEntries(Object.entries(s.stats.against).map(([k, v]) => [k, v.length]))); if (b) give("The Lightning Rod", b[0], "drew " + b[1] + (b[1] === 1 ? " vote" : " votes"));
  if (s.stats.firstBlood) give("First Blood", s.stats.firstBlood, "the first to be poisoned");
  b = best(s.stats.calls); if (b) give("The Ghost Who Saw", b[0], "called " + b[1] + (b[1] === 1 ? " exile" : " exiles") + " from beyond the table");
  b = best(hitL); if (b) give("Barking Up the Wrong Tree", b[0], "voted for the Loyal " + b[1] + (b[1] === 1 ? " time" : " times"));
  return out.slice(0, 6);
}

// a pause stops every clock: on resume, each deadline (and each answer's time) moves on by as long as the pause lasted
function shiftClocks(s, d) {
  const mv = (o, ...ks) => { if (o) for (const k of ks) if (typeof o[k] === "number") o[k] += d; };
  const t = s.trial, it = t && t.item;
  mv(t, "introEnd"); mv(it, "end", "from", "revealEnd", "start", "opened");
  if (it) { for (const x of Object.values(it.inputs || {})) mv(x, "t"); for (const x of it.taps || []) mv(x, "t"); }
  mv(s.brk, "end"); mv(s.vote, "talkEnd", "voteEnd"); mv(s.reveal, "roleAt", "at"); mv(s.night, "end"); mv(s.dawn, "lastEnd", "at");
  mv(s.trust, "end", "at"); mv(s.unmask, "next"); mv(s.honour, "end");
}
// someone the host took out of the game: if no Forsworn is left, the hunt is over and the final begins
function afterLeaving(s, now, rnd, id) {
  const it = s.trial && s.trial.item;
  if (it && (it.actor === id || it.teller === id) && ["open", "prep"].includes(it.stage)) { it.end = now; if (it.k === "truths") it.lie = it.lie || 1; }
  if (s.phase === "oath" && s.players.every((p) => p.left || p.optIn)) return deal(s, now, rnd);
  // (a dawn or an exile already under way plays out, and the next round sees there's nobody left to hunt)
  if (["lobby", "oath", "roles", "reveal", "dawn", "unmask", "honour", "end"].includes(s.phase) || s.final || forsworn(s).length) return;
  goFinal(s, now);
}

export function tick(s, now, ctx) {
  if (s.paused) return false;
  const rnd = ctx.rnd; let ch = false; const mark = () => { ch = true; };
  if (s.test && botsMove(s, now, rnd)) mark();
  if (s.test && s.phase === "trial" && s.trial && s.trial.key !== "tempt" && s.trial.stage === "intro" && now >= s.trial.introEnd) {
    // a test game doesn't play the Trials: everyone gets a random score
    const t = s.trial; for (const p of alive(s)) t.scores[p.id] = Math.floor(rnd() * 6); t.i = 5; t.wrongF = Math.floor(rnd() * 3);
    t.item = null; finishTrial(s, now, rnd); mark();
  }
  if (s.phase === "roles" && s.players.every((p) => p.left || p.acked)) { s.phase = "day"; s.round = 1; planDay(s); mark(); }
  if (s.phase === "trial" && s.trial) {
    const t = s.trial;
    if (t.stage === "intro" && now >= t.introEnd) { nextItem(s, now, rnd); mark(); }
    const it = t.item;
    if (t.stage === "play" && it) {
      if (it.stage === "study" && now >= it.end) {
        if (it.k === "recall") { it.stage = "open"; it.from = now; it.end = now + T(s, OPEN.recall * 1000); }
        else if (it.k === "cell") { it.stage = "blank"; it.from = now; it.end = now + 4000; }
        mark();
      } else if (it.stage === "blank" && now >= it.end) {
        const g = it.grid.slice(); if (t.i % 2 === 0) { const i = Math.floor(rnd() * 12), spare = CHSYM.filter((x) => !g.includes(x)); g[i] = pick(spare, rnd); it.changed = [i]; } else { const i = Math.floor(rnd() * 12); let j; do j = Math.floor(rnd() * 12); while (j === i); [g[i], g[j]] = [g[j], g[i]]; it.changed = [i, j]; }
        it.before = it.grid; it.grid = g; it.stage = "open"; it.from = now; it.end = now + T(s, OPEN.cell * 1000); mark();
      } else if (it.stage === "open" && (now >= it.end || (!["actor", "survive", "snap"].includes(it.k) && !owed(s, it).length && Object.keys(it.inputs).length) || (it.k === "survive" && alive(s).filter((p) => !it.out.includes(p.id)).length <= 1))) {
        it.res = score(s, t, it, ctx); it.stage = "reveal"; it.revealEnd = now + (it.k === "actor" ? 4000 : it.k === "survive" ? 6000 : 5000); t.results.push(it.res); t.i++; mark();
      } else if (it.stage === "reveal" && now >= it.revealEnd) { nextItem(s, now, rnd); mark(); }
      if (it.k === "truths" && it.stage === "prep" && now >= it.end) { it.lie = it.lie || 1 + Math.floor(rnd() * 3); it.stage = "open"; it.from = now; it.end = now + T(s, OPEN.truths * 1000); mark(); }
    }
  }
  if (s.phase === "break" && s.brk && s.brk.end && now >= s.brk.end) { toDay(s); mark(); }
  if (s.phase === "talk" && now >= s.vote.talkEnd) { openVote(s, now); mark(); }
  if (s.phase === "vote") { const A = alive(s); if (A.every((p) => p.id in s.vote.ballots) || now >= s.vote.voteEnd) { closeVote(s, now, rnd); mark(); } }
  if (s.phase === "reveal" && s.reveal && s.reveal.roleAt && now >= s.reveal.roleAt && !s.reveal.shown) { s.reveal.shown = true; P(s, s.reveal.id).revealed = true; mark(); }
  if (s.phase === "night") {
    const n = s.night, A = alive(s), F = forsworn(s);
    const fDone = F.every((f) => [].concat(n.picks[f.id] || []).length >= Math.min(n.kills, A.length - F.length)), lDone = A.filter((p) => p.role !== "f").every((p) => n.slept[p.id]);
    if ((fDone && lDone) || now >= n.end) { resolveNight(s, now, rnd); mark(); }
  }
  if (s.phase === "trust") {
    const A = alive(s), v = s.trust;
    if (!v.result && (A.every((p) => v.votes[p.id]) || now >= v.end)) { v.result = A.every((p) => v.votes[p.id] === "trust") ? "trust" : "doubt"; v.count = A.filter((p) => v.votes[p.id] !== "trust").length; v.at = now; mark(); }
    else if (v.result && now >= v.at + 6000) { if (v.result === "trust") startUnmask(s, now); else openReckoning(s, now); mark(); }
  }
  if (s.phase === "unmask" && now >= s.unmask.next) {
    const u = s.unmask; if (u.shown < u.order.length) { P(s, u.order[u.shown]).revealed = true; u.shown++; u.next = now + 3200; } else finishGame(s, now); mark();
  }
  if (s.phase === "honour") { const F = forsworn(s), h = s.honour; if (F.every((p) => h.choices[p.id]) || now >= h.end) { for (const p of F) h.choices[p.id] = h.choices[p.id] || "honour"; finishGame(s, now); mark(); } }
  if (ch) s.ver++;
  return ch;
}

// one input from one phone. Returns {error} to show that phone, or nothing.
export function act(s, pid, a, now, ctx) {
  const me = P(s, pid); if (!me || me.left) return { error: "You’re not in this game." };
  const dir = s.director === pid, rnd = ctx.rnd, it = s.trial && s.trial.item, v = a && a.v;
  const done = () => { s.ver++; return null; };
  const need = (ok, msg) => (ok ? null : { error: msg || "That can’t be done right now." });
  if (s.paused && !["pause", "tool", "words"].includes(a && a.a)) return need(false, "The game is paused.");
  switch (a && a.a) {
    // --- the lobby and the oath
    case "opts": { if (!dir || s.phase !== "lobby") return need(false); const o = a.opts || {}; if (["secret", "public"].includes(o.shield)) s.opts.shield = o.shield; if (typeof o.prize === "string") s.opts.prize = clip(o.prize.trim(), 80) || PRIZE0; if (Array.isArray(o.prizes)) s.opts.prizes = o.prizes.filter((x) => x && x.what).slice(0, 2).map((x) => ({ at: +x.at === 1 ? 1 : 0.5, what: clip(x.what, 80) })); if (typeof o.title === "string") s.opts.title = clip(o.title.trim(), 40) || "The Betrayal"; if (typeof o.twists === "boolean") s.opts.twists = o.twists; if (typeof o.courses === "boolean") s.opts.courses = o.courses; return done(); }
    case "bots": { if (!dir || !s.test || s.phase !== "lobby") return need(false); addBots(s, Math.max(s.players.length + 1, +v || 8), now, rnd); return done(); }
    case "start": {
      if (!dir || s.phase !== "lobby") return need(false);
      if (s.players.length < MINP) return { error: "The game needs at least " + MINP + " players. " + s.players.length + " have joined." };
      s.phase = "oath"; s.started = now; if (!s.plan.length) s.plan = shuffle(Object.keys(TRIALS), rnd); say(s, "The Oath: " + s.players.length + " players", now); return done();
    }
    case "optin": { if (s.phase !== "oath" || !["yes", "no", "any"].includes(v)) return need(false); me.optIn = v; if (s.players.every((p) => p.left || p.optIn)) deal(s, now, rnd); return done(); }
    case "ack": { if (s.phase !== "roles") return need(false); me.acked = true; return done(); }
    // --- the host moves the evening on: the next step of the plan, a short break, and on after each result
    case "next": { if (!dir || s.phase !== "day") return need(false); if (!runStep(s, now, rnd)) { planDay(s); runStep(s, now, rnd); } return done(); }
    case "break": { if (!dir || s.phase !== "day" || v !== "interval") return need(false); startBreak(s, "interval", now); return done(); }
    case "brkEnd": { if (!dir || s.phase !== "break") return need(false); toDay(s); return done(); }
    case "pause": {
      if (!dir || ["lobby", "end"].includes(s.phase)) return need(false);
      if (v === "off") { if (!s.paused) return need(false); shiftClocks(s, now - s.paused.at); s.paused = null; say(s, "Resumed", now); return done(); }
      if (s.paused) return need(false); s.paused = { at: now }; say(s, "Paused", now); return done();
    }
    case "brkMore": { if (!dir || s.phase !== "break") return need(false); s.brk.end += 5 * 60000; s.brk.dur += 5 * 60000; return done(); }
    case "cont": {
      if (!dir) return need(false);
      if (s.phase === "trial" && s.trial && s.trial.stage === "done") { toDay(s); return done(); }
      if (s.phase === "reveal" && (s.reveal.shown || s.reveal.secret)) { afterReveal(s, now); return done(); }
      if (s.phase === "dawn" && !s.dawn.revealed) { revealDawn(s, now); return done(); }
      if (s.phase === "dawn" && s.dawn.revealed) { nextRound(s, now); return done(); }
      return need(false);
    }
    // --- the host's tools, for when something goes wrong: none of them shows a role, except "roles", which the host's
    // phone asks about three times, and which everyone is told about at the end
    case "tool": return tool(s, pid, a, now, ctx, done, need);
    case "out": { if (!it || it.k !== "survive" || it.stage !== "open") return need(false); const who = dir && a.who && P(s, a.who) ? a.who : pid; if (P(s, who) && P(s, who).alive && !it.out.includes(who)) it.out.push(who); return done(); }
    // --- answers
    case "ans": {
      if (!it || it.stage !== "open" || !me.alive) return need(false, "Too late. That one has closed.");
      if (["text", "number", "hilo", "vote", "word", "recall", "cell", "tempt"].includes(it.k)) { if (pid in it.inputs && it.k !== "recall" && it.k !== "word") return need(false, "You’ve already answered."); it.inputs[pid] = { v: clip(v, it.k === "recall" ? 600 : 80), t: now }; return done(); }
      if (it.k === "rps") { if (!it.pairs.flat().includes(pid) || pid in it.inputs || !["rock", "paper", "scissors"].includes(v)) return need(false); it.inputs[pid] = { v, t: now }; return done(); }
      if (it.k === "snap") { if (now < it.start) return need(false); if (it.taps.filter((x) => x.id === pid && now - x.t < 600).length) return null; it.taps.push({ id: pid, t: now }); return done(); }
      if (it.k === "truths") { if (pid === it.teller || pid in it.inputs || ![1, 2, 3].includes(+v)) return need(false); it.inputs[pid] = { v: +v, t: now }; return done(); }
      return need(false);
    }
    case "accept": { if (!dir || !s.trial || s.trial.stage === "done" || !s.trial.results.length || !P(s, v) || !P(s, v).alive) return need(false); const last = s.trial.results[s.trial.results.length - 1]; if (!last.right || last.right.includes(v) || !P(s, v)) return need(false); last.right.push(v); s.trial.scores[v] = (s.trial.scores[v] || 0) + 1; return done(); }
    case "guess": { if (!it || it.k !== "actor" || it.stage !== "open" || (pid !== it.actor && !dir)) return need(false); if (v !== "none" && (!P(s, v) || v === it.actor)) return need(false); it.guess = v; it.end = now; return done(); }
    case "reword": { if (!it || it.k !== "actor" || pid !== it.actor || it.skips >= 2) return need(false); const d = TRIALS[s.trial.key], bank = d.bank === "songs" ? SONGS : d.bank === "draw" ? PICTIONARY : CHARADES; it.word = String(pick(bank, rnd)); it.skips++; return done(); }
    case "lie": { if (!it || it.k !== "truths" || pid !== it.teller || it.stage !== "prep" || ![1, 2, 3].includes(+v)) return need(false); it.lie = +v; return done(); }
    case "told": { if (!it || it.k !== "truths" || (pid !== it.teller && !dir) || it.stage !== "prep" || !it.lie) return need(false, "Choose which one is the lie first."); it.stage = "open"; it.from = now; it.end = now + T(s, OPEN.truths * 1000); return done(); }
    // --- the Reckoning, the night, the end
    case "ballot": { if (s.phase !== "vote") return need(false); const tg = P(s, v); if (!tg || !tg.alive || v === pid || v === s.vote.immune || (s.vote.revote && !s.vote.revote.includes(v))) return need(false); if (me.alive) s.vote.ballots[pid] = v; else s.vote.calls[pid] = v; return done(); }
    case "pick": { if (s.phase !== "night" || !me.alive || me.role !== "f") return need(false); const tg = P(s, v); if (!tg || !tg.alive || tg.role === "f") return need(false); const n = s.night, cur = [].concat(n.picks[pid] || []); n.picks[pid] = n.kills > 1 ? (cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat([v]).slice(-n.kills)) : [v]; return done(); }
    case "whisper": {
      if (s.phase !== "night" || !me.alive || me.role !== "f" || forsworn(s).length < 2 || !WHISPERS[+v]) return need(false);
      const w = (s.night.wh = s.night.wh || []); if (w.filter((x) => x.f === pid).length >= 8) return need(false, "That’s enough whispering for one night.");
      w.push({ f: pid, m: +v, t: now }); return done();
    }
    case "words": {
      const text = clip(String(v || "").replace(/\s+/g, " ").trim(), WORDS); if (!text) return need(false, "Type something first.");
      if (s.phase === "reveal" && s.reveal && s.reveal.id === pid && !s.reveal.secret && !s.reveal.words) { s.reveal.words = text; say(s, me.name + "’s last words", now); return done(); }
      return need(false);
    }
    case "sleep": { if (s.phase !== "night" || !me.alive) return need(false); s.night.slept[pid] = true; return done(); }
    case "crown": {
      if (!["talk", "vote"].includes(s.phase) || !s.crown || s.crown.used || s.crown.id !== pid || !me.alive || s.vote.immune) return need(false);
      s.crown.used = true; s.vote.immune = pid; for (const [k, tg] of Object.entries(s.vote.ballots)) if (tg === pid) delete s.vote.ballots[k];
      if (s.vote.revote) s.vote.revote = s.vote.revote.filter((id) => id !== pid);
      say(s, me.name + " laid down the Crown", now);
      if (s.phase === "vote" && s.vote.revote && s.vote.revote.length <= 1) closeVote(s, now, rnd);
      return done();
    }
    case "trust": { if (s.phase !== "trust" || !me.alive || s.trust.result || !["trust", "doubt"].includes(v)) return need(false); s.trust.votes[pid] = v; return done(); }
    case "honour": { if (s.phase !== "honour" || !me.alive || me.role !== "f" || !["honour", "betray"].includes(v)) return need(false); s.honour.choices[pid] = v; return done(); }
    case "again": { if (!dir || s.phase !== "end") return need(false); const keep = s.players.filter((p) => !p.left).map((p) => ({ ...p, role: null, alive: true, optIn: null, acked: false, shield: null, revealed: false, exiled: null, died: null, dying: false })); const g = newGame(now, rnd, s.opts); if (s.test) g.test = true; g.plan = s.plan; g.players = keep; g.director = s.director; g.ver = s.ver + 1; Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, g); return null; }
  }
  return need(false);
}
function tool(s, pid, a, now, ctx, done, need) {
  if (s.director !== pid) return need(false, "Only the host can do that.");
  if (s.paused) now = s.paused.at; // its clocks then move on with everyone else's when the game carries on
  const rnd = ctx.rnd, t = s.trial, it = t && t.item, who = a.who && P(s, a.who);
  switch (a.v) {
    case "skip": if (t && t.stage === "intro") { nextItem(s, now, rnd); return done(); } if (it && ["open", "study", "prep", "blank"].includes(it.stage)) { it.end = now; if (it.k === "truths" && it.stage === "prep") it.lie = it.lie || 1; return done(); } return need(false);
    case "endTrial": if (!t || t.stage === "done") return need(false); if (it && it.stage === "open") { it.res = score(s, t, it, ctx); t.results.push(it.res); t.i++; } finishTrial(s, now, rnd); return done();
    case "voteNow": if (s.phase !== "talk") return need(false); openVote(s, now); return done();
    case "closeVote": if (s.phase !== "vote") return need(false); closeVote(s, now, rnd); return done();
    case "dawnNow": if (s.phase !== "night") return need(false); resolveNight(s, now, rnd); return done();
    case "deal": if (s.phase !== "oath") return need(false); deal(s, now, rnd); return done();
    case "begin": if (s.phase !== "roles") return need(false); for (const p of s.players) p.acked = true; return done();
    case "skipStep": if (s.phase !== "day" || !s.steps[s.stepAt] || s.steps[s.stepAt].k === "reckon") return need(false); s.stepAt++; return done();
    case "host": if (!who || who.left || who.bot || who.id === pid) return need(false); s.director = who.id; say(s, who.name + " is now the host", now); return done();
    case "remove":
      if (!who || who.id === pid || who.left) return need(false);
      if (s.phase === "lobby") { s.players = s.players.filter((p) => p.id !== who.id); return done(); }
      who.left = true; who.alive = false; who.shield = null; who.dying = false; say(s, who.name + " left the game", now);
      if (s.cast && s.cast.id === who.id) s.cast.used = true;
      if (s.crown && s.crown.id === who.id) s.crown.used = true;
      afterLeaving(s, now, rnd, who.id); return done();
    case "roles":
      if (a.sure !== "SHOW THE ROLES" || !s.players.some((p) => p.role)) return need(false, "Type SHOW THE ROLES to confirm.");
      s.peeked = (s.peeked || []).concat([{ t: now, round: s.round }]).slice(-20); say(s, "The host opened the roles", now); s.ver++;
      return { peek: s.players.filter((p) => !p.left).map((p) => ({ name: p.name, role: p.role, alive: p.alive })) };
  }
  return need(false);
}
// The Oath: volunteers first, then the "either way"s, then whoever must.
function deal(s, now, rnd) {
  const live = s.players.filter((p) => !p.left), n = live.length, k = forswornFor(n);
  const yes = shuffle(live.filter((p) => p.optIn === "yes"), rnd), any = shuffle(live.filter((p) => !p.optIn || p.optIn === "any"), rnd), no = shuffle(live.filter((p) => p.optIn === "no"), rnd);
  const chosen = [...yes, ...any, ...no].slice(0, k).map((p) => p.id);
  for (const p of s.players) { p.role = !p.left && chosen.includes(p.id) ? "f" : "l"; p.acked = false; }
  s.phase = "roles"; s.total = roundsFor(n); say(s, "Roles dealt: " + k + " Forsworn", now);
}

// ---------------------------------------------------------------------------------------------------------------
// What one phone may see. pid null: the TV (or anyone without a token).
export function viewFor(s, pid, now) {
  const me = pid ? P(s, pid) : null, over = s.phase === "end";
  const role = (p) => (over || p.revealed ? p.role : null);
  const o = {
    mode: "modern", test: !!s.test, ver: s.ver, now, phase: s.phase, round: s.round, final: s.final, pot: s.pot, potCap: s.opts.potCap, title: s.opts.title,
    tiers: (s.opts.prizes || []).length > 0, director: s.director ? { id: s.director, name: (P(s, s.director) || {}).name } : null,
    players: s.players.filter((p) => !p.left).map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot || undefined, alive: p.alive || !!p.dying, role: role(p), shield: p.shield && !p.shield.secret && p.shield.round === s.round ? true : false, optedIn: s.phase === "oath" ? !!p.optIn : undefined, acked: s.phase === "roles" ? !!p.acked : undefined })),
    paused: s.paused ? s.paused.at : null, brk: s.brk, done: { tempt: !!s.done.tempt, starter: !!s.done.starter, main: !!s.done.main, dessert: !!s.done.dessert }, roundTrials: s.roundTrials || 0,
  };
  if (s.phase === "lobby") o.opts = { shield: s.opts.shield, twists: s.opts.twists, courses: s.opts.courses, prize: me && s.director === pid ? s.opts.prize : undefined, coins: me && s.director === pid ? s.opts.prize === PRIZE0 : undefined, prizes: me && s.director === pid ? s.opts.prizes : undefined, title: s.opts.title };
  if (s.phase === "day") o.next = stepLabel(s, s.steps[s.stepAt]) || "The Reckoning";
  if (s.trial) {
    const t = s.trial, it = t.item;
    o.trial = { key: t.key, title: t.title, rules: t.rules, stage: t.stage, introEnd: t.introEnd, i: t.i, prize: t.prize, offer: t.offer, scores: t.stage === "done" && t.special !== "cast" ? t.scores : undefined, winners: t.stage === "done" && t.special !== "cast" ? t.winners : undefined, points: t.stage === "done" ? t.points : undefined, sanctPublic: t.stage === "done" && t.sanct && s.opts.shield === "public" ? t.sanct : undefined, wrongF: t.stage === "done" ? t.wrongF || 0 : undefined, special: t.special === "confess" ? "secret" : t.special, byLot: t.stage === "done" ? !!t.byLot : undefined, gave: t.stage === "done" && t.gave === "crown" ? t.winners[0] : undefined };
    if (it) {
      const x = { k: it.k, stage: it.stage, end: it.end, from: it.from || it.opened, who: Object.keys(it.inputs), revealEnd: it.revealEnd, q: it.q, part: it.part, ref: it.ref, letters: it.letters, answered: Object.keys(it.inputs).length, of: owedCount(s, it) };
      if (it.k === "recall" && it.stage === "study") x.words = it.words;
      if (it.k === "cell") { x.grid = it.stage === "blank" ? null : it.grid; if (it.stage === "reveal") { x.changed = it.changed; x.before = it.before; } }
      if (it.k === "snap") { x.seq = it.seq.slice(0, Math.max(0, Math.min(it.seq.length, Math.floor(((s.paused ? s.paused.at : now) - it.start) / it.step) + 1))); x.start = it.start; x.step = it.step; x.syms = it.syms; x.len = it.seq.length; }
      if (it.k === "rps") { x.pairs = it.pairs; x.bye = it.bye; }
      if (it.k === "survive") x.out = it.out;
      if (it.k === "actor") x.actor = it.actor;
      if (it.k === "truths") { x.teller = it.teller; x.ready = !!it.lie; }
      if (it.stage === "reveal") { x.a = it.a; x.res = it.res; if (it.k === "recall") x.words = it.words; }
      if (me && pid in it.inputs) x.mine = it.inputs[pid].v;
      if (me && it.k === "snap") x.myTaps = it.taps.filter((q) => q.id === pid).length;
      if (me && it.k === "actor" && it.actor === pid) x.word = it.word, x.skips = it.skips;
      if (me && it.k === "truths" && it.teller === pid) x.lie = it.lie;
      if (me && it.k === "rps") { const pr = it.pairs.find((q) => q.includes(pid)); x.vs = pr ? pr.find((id) => id !== pid) : null; }
      if (s.director === pid && it.stage === "reveal" && it.k === "text") x.wrong = Object.entries(it.inputs).filter(([id]) => !(it.res.right || []).includes(id)).map(([id, y]) => [id, y.v]);
      o.trial.item = x;
    }
    if (t.stage === "done" && t.results.length) o.trial.last = t.results[t.results.length - 1];
  }
  if (s.vote && ["talk", "vote"].includes(s.phase)) o.vote = { stage: s.vote.stage, talkEnd: s.vote.talkEnd, voteEnd: s.vote.voteEnd, revote: s.vote.revote, tie: !!s.vote.tie, voted: Object.keys(s.vote.ballots).length, of: alive(s).length, second: !!s.vote.second, mine: me ? s.vote.ballots[pid] || s.vote.calls[pid] || null : null, secret: s.vote.secret, immune: s.vote.immune || null };
  if (s.reveal && s.phase === "reveal") { const p = P(s, s.reveal.id); o.reveal = { id: p.id, name: p.name, counts: s.reveal.counts, byLot: s.reveal.byLot, cast: s.reveal.cast, roleAt: s.reveal.roleAt, role: s.reveal.shown ? p.role : null, called: s.reveal.shown || s.reveal.secret ? s.reveal.called.map((g) => (P(s, g) || {}).name) : [], secret: s.reveal.secret, words: s.reveal.words || null }; }
  if (s.phase === "night") o.night = { end: s.night.end, kills: s.night.kills, done: me ? (me.role === "f" ? [].concat(s.night.picks[pid] || []).length >= s.night.kills : !!s.night.slept[pid]) : undefined };
  if (s.phase === "dawn") {
    const d = s.dawn, lk = s.stats.likely || {};
    o.dawn = { revealed: d.revealed, victims: d.revealed ? d.victims.map((id) => P(s, id).name) : null, saved: d.revealed ? d.saved : null, lastEnd: d.lastEnd };
    // the table's own verdict on the dead, from Most Likely To
    if (d.revealed) { o.dawn.likely = d.victims.filter((id) => lk[id]).map((id) => [P(s, id).name, lk[id]]); }
  }
  if (s.trust && s.phase === "trust") o.trust = { end: s.trust.end, voted: Object.keys(s.trust.votes).length, of: alive(s).length, result: s.trust.result, count: s.trust.count, mine: me ? s.trust.votes[pid] || null : null };
  if (s.unmask && s.phase === "unmask") o.unmask = { order: s.unmask.order, shown: s.unmask.shown };
  if (s.honour && s.phase === "honour") o.honour = { end: s.honour.end, made: Object.keys(s.honour.choices).length, of: forsworn(s).length, mine: me ? s.honour.choices[pid] || null : null };
  if (over) o.result = { ...s.result, to: s.result.to.map((id) => P(s, id).name), honour: s.honour ? Object.entries(s.honour.choices).map(([id, c]) => [P(s, id).name, c]) : null };
  if (me) {
    o.me = { id: me.id, name: me.name, left: me.left || undefined, alive: me.alive && !me.dying, director: s.director === pid, role: s.phase === "lobby" || s.phase === "oath" ? null : me.role, optIn: me.optIn, acked: me.acked, shield: me.shield && me.shield.round === s.round && me.role !== "f" ? true : false };
    if (me.role === "f" && !["lobby", "oath"].includes(s.phase)) o.me.allies = s.players.filter((p) => p.role === "f" && p.id !== pid).map((p) => ({ name: p.name, alive: p.alive }));
    if (s.phase === "night" && me.alive) {
      if (me.role === "f") { o.me.targets = alive(s).filter((p) => p.role !== "f").map((p) => p.id); o.me.picks = Object.fromEntries(forsworn(s).map((f) => [f.name, [].concat(s.night.picks[f.id] || []).map((id) => P(s, id).name)])); o.me.mine = [].concat(s.night.picks[pid] || []); o.me.sanct = alive(s).filter((p) => p.shield && !p.shield.secret && p.shield.round === s.round).map((p) => p.name); }
    }
    if (s.phase === "dawn" && !s.dawn.revealed && s.dawn.victims.includes(pid)) o.me.victim = true;
    if (s.phase === "reveal" && s.reveal.id === pid && !s.reveal.secret) o.me.words = s.reveal.words || "";
    if (s.phase === "night" && me.alive && me.role === "f" && forsworn(s).length > 1) { o.me.whispers = (s.night.wh || []).slice(-12).map((x) => [x.f === pid ? "You" : P(s, x.f).name, WHISPERS[x.m]]); o.me.whisperSay = WHISPERS; }
    if (s.trial && s.trial.stage === "done" && s.trial.sanct === pid) o.me.wonSanct = me.role === "f" ? "wasted" : "yes";
    if (s.phase === "end") o.me.won = s.result.to.includes(pid);
    if (s.cast && s.cast.id === pid && !s.cast.used && me.alive) o.me.cast = true;
    if (s.crown && s.crown.id === pid && !s.crown.used && me.alive) o.me.crown = true;
    if (s.confess && s.confess.id === pid) o.me.confess = s.confess.of ? P(s, s.confess.of).name : "self";
    if (s.trial && s.trial.stage === "done" && s.trial.gave && s.trial.winners[0] === pid) o.me.gave = s.trial.gave;
    if (s.director === pid && s.phase === "day") o.me.canSkip = !!s.steps[s.stepAt] && s.steps[s.stepAt].k !== "reckon";
  }
  return o;
}
const owedCount = (s, it) => (it.k === "rps" ? it.pairs.flat().length : it.k === "truths" ? alive(s).length - 1 : ["actor", "survive", "snap"].includes(it.k) ? 0 : alive(s).length);
