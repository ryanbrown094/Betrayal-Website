/* ===================== CORE: store, helpers, actions, rules ===================== */
const APPV = "1.2", SCHEMA = 12;
const KEY = "candle-v1";
const isHost = location.hash === "#host" || /[?&]host\b/.test(location.search);
const BUILD = (document.querySelector('meta[name="build"]') || {}).content || "";
// Each party plays in its own room: the TV at /g/CODE, the host at /g/CODE#host. Without a room (the standalone file,
// the local test server) the page talks to /api or runs on this browser alone.
const ROOM = ((location.pathname.match(/^\/g\/([A-Za-z0-9]{6})\/?$/) || [])[1] || "").toUpperCase() || null;
const API = ROOM ? "/api/g/" + ROOM : "/api";
let roomInfo = null, roomMissing = false, roomExpired = false;
const roomUrl = host => location.origin + "/g/" + ROOM + (host ? "#host" : "");

let db = null, remote = false, lastJson = "", state = null, listeners = [], skew = 0;
let lastTag = "", limitedNow = false;
let authed = false, serverHasGame = false, pending = 0, syncErr = false, connecting = true, lastPollOk = 0, toastMsg = null, toastT = null;

const now = () => Date.now() + skew;
function syncClock(r) {
  const d = r.headers.get("date"); if (!d) return;
  const sv = Date.parse(d); if (!sv) return;
  const diff = sv + 500 - Date.now();
  if (Math.abs(diff - skew) > 1500) skew = diff;
}
// The PIN lives in localStorage so a phone that locks, or a tab Safari quietly discards, comes back into the game without a prompt.
// A copy in memory keeps the host in when the browser refuses storage altogether.
let memPin = "";
const getPin = () => { try { return localStorage.getItem("candle-pin") || sessionStorage.getItem("candle-pin") || memPin } catch (e) { return memPin } };
const setPin = v => { memPin = v; try { localStorage.setItem("candle-pin", v); sessionStorage.setItem("candle-pin", v) } catch (e) {} };
const clearPin = () => { memPin = ""; try { localStorage.removeItem("candle-pin"); sessionStorage.removeItem("candle-pin") } catch (e) {} };
const pinHeader = () => ({ "Content-Type": "application/json", "X-Pin": getPin() || (state && state.hostPin) || "", "X-Build": BUILD });
function toast(msg, ms) { toastMsg = msg; clearTimeout(toastT); toastT = setTimeout(() => { toastMsg = null; emit() }, ms || 3500); emit() }
const offline = () => remote && lastPollOk && Date.now() - lastPollOk > 4500;

async function poll() {
  try {
    const pinUsed = getPin(), hdr = {};
    if (isHost) hdr["X-Pin"] = pinUsed;
    if (lastTag) hdr["X-Have"] = lastTag; // unchanged since last time: the reply is a few bytes, not the whole game
    const r = await fetch(API + "/state", { cache: "no-store", headers: hdr });
    if (isHost && r.status === 429 && !state) { if (!limitedNow) { limitedNow = true; serverHasGame = true; emit() } return }
    if (!r.ok) { if (offline()) emit(); return }
    // only a real answer from the game server counts: a wifi login page or a proxy's error page is not one
    if (!(r.headers.get("content-type") || "").includes("json")) { if (offline()) emit(); return }
    const j = await r.text(); let body; try { body = JSON.parse(j) } catch (e) { if (offline()) emit(); return }
    syncClock(r); limitedNow = false;
    if (body.room) { const was = roomExpired; roomInfo = body.room; roomExpired = !!body.room.expired; if (was !== roomExpired) emit() }
    const wasOff = offline(); lastPollOk = Date.now(); if (wasOff) emit();
    if (body.same) return;
    if (pending > 0 || saveQ.length || pinUsed !== getPin()) return; // unsent saves first: the flush settles any clash
    if (j === lastJson) return;
    const inc = body.state;
    if (isHost) {
      serverHasGame = !!inc;
      if (inc && !body.auth) { if (pinUsed) clearPin(); authed = false; lastJson = j; lastTag = body.tag || ""; state = null; emit(); return }
      authed = !!inc;
    }
    if (inc && state && inc.gid === state.gid && (inc.ver || 0) < (state.ver || 0)) return;
    if (!inc || !state || inc.gid !== state.gid || (inc.ver || 0) > (state.ver || 0)) hist = [];
    lastJson = j; lastTag = body.tag || ""; state = inc; emit();
  } catch (e) { if (offline()) emit() }
}

const store = {
  async init() {
    try { db = await window.claude.use("db") } catch (e) { db = null }
    if (db) {
      connecting = false;
      db.doc("game/state").onSnapshot(s => { state = s.exists ? s.data() : null; localAuth(); emit() }, e => { console.error(e); db = null; store.init() });
      if (isHost) bankLoad();
      return;
    }
    // A served page keeps trying the server rather than quietly running a game the TV would never see.
    const served = /^https?:$/.test(location.protocol);
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(API + "/state", { cache: "no-store" });
        if (ROOM && r.status === 404) { roomMissing = true; connecting = false; emit(); return }
        if (r.ok && (r.headers.get("content-type") || "").includes("json")) { remote = true; connecting = false; lastPollOk = Date.now(); if (isHost) bankLoad(); await poll(); setInterval(poll, 1000); setInterval(resync, 5000); return }
        // a server error (a deploy settling, a Worker hiccup) is retried; only a page with no API at all runs locally
        if (!(served && r.status >= 500)) break;
        if (attempt === 1) emit(); await new Promise(z => setTimeout(z, 2000)); continue;
      } catch (e) { if (!served) break; if (attempt === 1) emit(); await new Promise(z => setTimeout(z, 2000)) }
    }
    connecting = false;
    try { state = JSON.parse(localStorage.getItem(KEY) || "null") } catch (e) { state = null }
    window.addEventListener("storage", e => { if (e.key === KEY) { try { state = JSON.parse(e.newValue || "null") } catch (x) {} localAuth(); emit() } });
    localAuth(); if (isHost) bankLoad(); emit();
  },
  async save(s) {
    const pin = pinHeader();
    if (s) { s.ver = ((state && state.ver) || 0) + 1; s.pvid = state && state.gid === s.gid ? state.vid || null : null; s.vid = Math.random().toString(36).slice(2, 10) }
    state = s; if (!s) { authed = false; serverHasGame = false } else authed = true;
    emit();
    if (db) { try { const d = db.doc("game/state"); if (s) await d.set(s); else await d.delete() } catch (e) { console.error(e) } }
    else if (remote) {
      // latest wins: a burst of taps collapses into one PUT, but a wipe is never skipped
      const last = saveQ[saveQ.length - 1];
      if (s && last && last.s && last.s.gid === s.gid) { s.pvid = last.s.pvid; saveQ[saveQ.length - 1] = { s, pin } } else saveQ.push({ s, pin });
      if (s) { lineage.set(s.vid, s.pvid); if (lineage.size > 200) lineage.delete(lineage.keys().next().value) }
      await flushSaves();
    }
    else { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch (e) {} }
  }
};
// Without a server the full state is local anyway: the PIN only keeps guests out of the host screen.
function localAuth() { if (!remote) { authed = !!state && getPin() === state.hostPin; serverHasGame = !!state } }
async function tryPin(v) {
  v = String(v || "").trim();
  if (remote) {
    try {
      const r = await fetch(API + "/state", { cache: "no-store", headers: { "X-Pin": v } });
      if (r.status === 429) return "Too many wrong PINs — wait a minute.";
      const body = await r.json();
      if (body.auth) { setPin(v); authed = true; lastJson = ""; lastTag = ""; limitedNow = false; state = body.state; emit(); return true }
    } catch (e) { return "Can’t reach the server." }
    return false;
  }
  const raw = state || (() => { try { return JSON.parse(localStorage.getItem(KEY) || "null") } catch (e) { return null } })();
  if (raw && raw.hostPin === v) { setPin(v); authed = true; state = raw; emit(); return true }
  return false;
}
// lineage: each save this phone made → the version it was made from, so a 409 can tell "the server is only behind us"
// (a lost reply, a save dropped while offline) from "another phone moved"
const saveQ = [], lineage = new Map(); let flushing = null;
const behindUs = (s, vid) => { let v = s.pvid; for (let k = 0; v && k < 200; k++) { if (v === vid) return true; v = lineage.get(v) } return false };
function flushSaves() {
  if (flushing) return flushing;
  pending++;
  flushing = (async () => {
    while (saveQ.length) {
      const item = saveQ.shift(), { s, pin } = item;
      let done = false, body;
      for (let i = 0; i < 3 && !done; i++) {
        body = s ? JSON.stringify({ state: s }) : undefined;
        try {
          const r = await fetch(API + "/state", { method: s ? "PUT" : "DELETE", headers: pin, body });
          if (r.status === 426) { location.reload(); return } // a new version went live: load it (the deploy started a fresh game)
          if (r.status === 423) { syncErr = false; saveQ.length = 0; roomExpired = true; toast("This party pass has expired — the game can be viewed but not changed.", 6000); done = true; break }
          if (r.status === 403) { syncErr = false; toast("Wrong host PIN — that change was not saved."); done = true; break }
          // this game was wiped or replaced on another phone: it can't come back from here
          if (r.status === 410) { syncErr = false; saveQ.length = 0; hist = []; state = null; authed = false; serverHasGame = false; lastJson = ""; lastTag = ""; toast("That game was wiped on another phone."); done = true; break }
          if (r.status === 409) {
            const j = await r.text(); let inc = null; try { inc = JSON.parse(j).state } catch (e) {}
            // our own earlier save arrived but its reply was lost: that's a success, not another phone
            if (inc && body && JSON.stringify(inc) === body.slice(9, -1)) { lastJson = j; syncErr = false; done = true; break }
            // the server holds a version this save already builds on (a save dropped while offline, a lost reply): nobody
            // else has moved since, so this newer save follows on from it
            if (inc && s && inc.gid === s.gid && inc.vid && behindUs(s, inc.vid) && (item.rebased || 0) < 3) {
              item.rebased = (item.rebased || 0) + 1; s.pvid = inc.vid; s.ver = Math.max(s.ver || 0, (inc.ver || 0) + 1); lineage.set(s.vid, s.pvid); i--; continue;
            }
            // another phone moved first: take the server's version and say so
            if (inc) { lastJson = j; lastTag = ""; state = inc; saveQ.length = 0; hist = [] }
            syncErr = false; toast("Another phone moved first — your screen has been refreshed."); done = true; break;
          }
          if (r.ok) { lastJson = await r.text(); syncErr = false; done = true; break }
        } catch (e) {}
        if (i < 2) await new Promise(z => setTimeout(z, 600));
      }
      if (!done) {
        // still offline: keep it (a wipe always; a save unless a newer one is already waiting) and let resync retry
        if (!s || !saveQ.some(q => q.s)) saveQ.unshift(item);
        syncErr = true; break;
      }
    }
  })().finally(() => { pending--; flushing = null; emit() });
  return flushing;
}
// After a dropped connection, push the phone's state again until the server has it.
function resync() { if (syncErr && !flushing && isHost) { if (saveQ.length) flushSaves(); else if (state && authed) { saveQ.push({ s: state, pin: pinHeader() }); flushSaves() } } if (bankErr) bankSave() }
function emit() { listeners.forEach(f => f(state)) }

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const P2 = (s, id) => s.players.find(p => p.id === id);
const P = id => P2(state, id);
const aliveOf = s => s.players.filter(p => p.alive);
const alive = () => aliveOf(state);
const cloaks = () => alive().filter(p => p.role === "cloak");
const candles = () => alive().filter(p => p.role === "candle");
// with Ghosts off, the dead simply leave: nobody watches, judges or plays on from beyond the table
const ghostsOf = s => s.rules && s.rules.ghosts === false ? [] : s.players.filter(p => !p.alive && !p.left);
const seated = s => s.players.filter(p => !p.left);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a };
const clone = o => JSON.parse(JSON.stringify(o));
const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") };
const hostOf = s => (s && s.brand && s.brand.host) || "the host";
const titleOf = s => (s && s.brand && s.brand.title) || "Cloak & Candle";
const H = () => hostOf(state), T = () => titleOf(state);
const moneyOf = (s, v) => { const u = String((s && s.potUnit) || "pts").replace(/[<>&"'`]/g, ""); return /^[£$€]$/.test(u) ? u + v : v + " " + u };
const money = v => moneyOf(state, v);
const PRIZE0 = "a bottle of champagne"; // the default prize; the host sets their own at setup
const prizeOf = s => (s && s.prize) || PRIZE0;
const isFinal = s => !!s && s.finalRound === s.round;

/* ---------- the game plan: every choice the host makes before the game, then the game follows it ---------- */
// rounds: 0 = decided by the table size (the final starts once five or fewer are left), or a fixed number (the last is the final)
// perRound: missions a round (1, 2, or 0 = by the clock). dinnerAfter: the round dinner follows (0 = no dinner break).
// kill: "poison" (the victim announces it at dawn, then leaves) or "murder" (the victim leaves the table in the night, under blindfold)
// shield: "mix" (hidden in round-based missions, public otherwise) | "public" | "secret" | "off"
const RULES0 = {
  rounds: 0, perRound: 0, dinnerAfter: 1, mingle: true, pool: null,
  kill: "poison", ghosts: true, convert: true, bargain: true, quests: true,
  shield: "mix", blade: true, champion: true, witness: true, dilemma: true
};
const rulesIn = s => Object.assign({}, RULES0, (s && s.rules) || {});
const killOf = s => rulesIn(s || state).kill === "murder" ? "murder" : "poison";
const ghostsOn = s => rulesIn(s || state).ghosts !== false;
// Every line written for poison reads for murder too, once its words are swapped. The one bank item that says poison
// (Pictionary's poisoned apple) is left alone.
function kw(t, s) {
  if (t == null || killOf(s || state) !== "murder") return t;
  return String(t).replace(/\bpoisonings\b/g, "murders").replace(/\bpoisoning\b/g, "murder").replace(/\bPoisoning\b/g, "Murder").replace(/\bpoisoned\b(?! apple)/g, "murdered").replace(/\bPoisoned\b/g, "Murdered").replace(/\bpoison\b/g, "murder").replace(/\bPoison\b/g, "Murder");
}
const kwLines = (a, s) => a.map(l => { const x = norm(l); return { ...x, tv: kw(x.tv, s), say: kw(x.say, s) } });
// The end game always starts with four: the final round opens with five, its Reckoning takes one more without a reveal,
// then End or Exile. To get there, every round before the final is sized to what's left: its exiles (one, or two while
// more than sixteen sit at the table) and its night's victims (up to two from 12 alive, three from 20), never below five.
const exilesAt = a => a > 16 ? 2 : 1;
const killsAt = a => Math.max(1, Math.min(a >= 20 ? 3 : a >= 12 ? 2 : 1, a - 5));
// the most one round can take from a table of a
const capacityAt = a => { const ex = Math.min(exilesAt(a), a - 5); return a - ex > 5 ? ex + killsAt(a - ex) : ex };
// rounds (the final included): fewest = every round at capacity, most = one exile and one victim a round
function roundsFrom(a) { let r = 1; while (a > 5) { a -= capacityAt(a); r++ } return r }
const roundsMax = n => 1 + Math.ceil(Math.max(0, n - 5) / 2);
const roundsRange = n => [roundsFrom(n), Math.max(roundsFrom(n), roundsMax(n))];
const autoRounds = n => roundsFrom(n);
const plannedRounds = s => rulesIn(s).rounds || autoRounds(seated(s).length);
// This round's share of what's left, spread over the rounds left before the final: how many exiles, then how many victims.
function roundTarget(s) {
  const a = aliveOf(s).length, need = Math.max(0, a - 5), k = Math.max(1, plannedRounds(s) - s.round);
  // an even share, raised until the rounds after this one can still finish the job at full stretch
  let e = Math.max(Math.min(2, need), Math.ceil(need / k));
  while (e < capacityAt(a) && roundsFrom(a - e) - 1 > k - 1) e++;
  e = Math.min(e, capacityAt(a));
  const exiles = e - 1 > killsAt(a - 1) && exilesAt(a) === 2 ? 2 : 1;
  return { round: s.round, start: a, exiles, kills: Math.max(0, e - exiles) };
}
// missions the pool allows for this table: the Statue needs Ghosts; the Dilemma is only ever an add-on
const poolOf = r => (Array.isArray(r.pool) && r.pool.length ? r.pool : MISSIONS.filter(m => !m.addon && m.key !== "custom").map(m => m.key))
  .filter(k => MISSIONS.some(m => m.key === k && !m.addon) && (k !== "statue" || r.ghosts !== false));
// The running order: the icebreaker first, the Ghost games once there are Ghosts, the rest shuffled, no repeats until the pool is used.
function planMissions(r, slots) {
  const pool = poolOf(r), late = ["statue", "charades", "hum", "draw"], out = [];
  while (out.length < slots && pool.length) {
    const first = !out.length && pool.includes("likely") ? ["likely"] : [];
    const rest = shuffle(pool.filter(k => !first.includes(k))), early = rest.filter(k => !late.includes(k)), lateOnes = rest.filter(k => late.includes(k));
    // late games go after the first two missions, so the first Ghosts exist when they come round
    const run = [...first, ...early.slice(0, Math.max(0, 2 - first.length)), ...shuffle([...early.slice(Math.max(0, 2 - first.length)), ...lateOnes])];
    out.push(...run);
  }
  return out.slice(0, slots);
}
// how many missions this round should have: fixed by the plan, or by the clock (two while the evening is running short)
function perRoundOf(s) {
  const r = rulesIn(s); if (r.perRound) return r.perRound;
  const pc = typeof pace === "function" && s === state ? pace() : null;
  if (pc && pc.diff > 25) return 1;
  if (pc && pc.diff < -30) return 2;
  return plannedRounds(s) <= 3 ? 2 : 1;
}
// the next planned mission not yet played (skipped ones stay skipped); a swap on the day screen replaces it
function nextPlanned(s) {
  const p = s.plan || [], i = s.planAt || 0;
  const ok = k => k && (k !== "statue" || ghostsOf(s).length > 0);
  for (let j = i; j < p.length; j++) if (ok(p[j])) return p[j];
  const pool = poolOf(rulesIn(s)).filter(ok), done = s.done || {};
  return pool.sort((a, b) => (done[a] || 0) - (done[b] || 0))[0] || "quiz";
}
// the prizes a mission carries, set from the plan (the host can still change them on the brief screen)
function autoPrize(s, m) {
  const r = rulesIn(s), rounded = ROUNDED.includes(m.key);
  m.witnessOffer = false;
  if (!m.hasShield || m.key === "dilemma") { m.win = m.hasShield ? m.win : "none"; m.dag = "none"; return }
  if (r.witness && witnessOk(s)) { m.witnessOffer = true; m.win = "none"; m.dag = "none"; return }
  m.win = r.shield === "off" ? "none" : r.shield === "public" ? "public" : r.shield === "secret" ? (rounded ? "secret" : "public") : rounded ? "secret" : "public";
  m.secN = 1;
  // one blade a round, on the first mission that can carry it; with the Champion on, every other round it rides with the shield
  let dag = "none";
  if (r.blade && !championOf(s)) {
    if (r.champion && m.win !== "none" && s.round % 2 === 0) dag = "with";
    else if (m.win === "none") dag = rounded ? "secret" : "public";
    else if (rounded) dag = "secret";
  }
  if (!r.champion && dag === "with") dag = "none";
  m.dag = dag;
}
const clock = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const andList = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
// Cloaks by table size: 8–10 get 2, 11–15 get 3, 16–22 get 4, 23–24 get 5 (1 below eight, for old tests)
function defaults(n) { return { t: n <= 6 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : n <= 22 ? 4 : 5 } }
const MINP = 8, MAXP = 24;
const maxCloaks = n => Math.max(1, Math.floor((n - 1) / 2));
// names longer than this crowd the candle rail and the Reckoning on the TV
const NAMEMAX = 16;

/* ---------- act / undo ---------- */
// Undo: four steps travel with the game (so a second phone can undo too); this phone also keeps its own deeper trail.
// The start-of-round snapshot rides only on the live state, never down the undo chain.
let hist = [];
const HISTMAX = 30;
const bare = o => { const c = clone(o); delete c.prev; return c };
function act(fn, logline) {
  if (!state) return;
  const before = state.phase;
  hist.push(bare(state)); if (hist.length > HISTMAX) hist.shift();
  const prev = clone(state); delete prev.roundSnap; let d = prev, k = 0;
  while (d && d.prev) { if (++k >= 4) { delete d.prev; break } d = d.prev }
  const s = clone(state); s.prev = prev;
  // a tap on a button the state has already moved past (undo, a second host phone): drop it and redraw
  let extra; try { extra = fn(s) } catch (e) { hist.pop(); console.warn("stale tap ignored:", e); emit(); return }
  if (s.phase === "night" && s.night && s.night.confirmed) nightMarks(s);
  if (s.phase !== before) { s.stamps = (s.stamps || []).slice(-60); s.stamps.push({ p: s.phase, t: now() }) }
  const line = (extra && extra.log) || logline;
  if (line) s.log = [clock() + " " + line, ...(s.log || [])].slice(0, 80);
  store.save(s);
}
function undo() {
  if (!state) return;
  const h = hist.pop();
  if (h && h.gid === state.gid) {
    // rebuild a short synced chain from the older entries, so the other phone can still step back from here
    let p = null; for (const x of hist.filter(x => x.gid === state.gid).slice(-4)) { const c = bare(x); delete c.roundSnap; c.prev = p; p = c }
    h.prev = p; return store.save(h);
  }
  hist = [];
  if (!state.prev) return;
  const p = clone(state.prev);
  if (!p.roundSnap && state.roundSnap && state.roundSnap.round === p.round) p.roundSnap = state.roundSnap;
  store.save(p);
}
const canUndo = () => !!(state && (state.prev || hist.some(h => h.gid === state.gid)));
// the round as it stood when it began: one tap back to there, missions, votes and night undone
function snapRound(s) { const c = clone(s); delete c.prev; delete c.roundSnap; s.roundSnap = c }
function rewindRound() {
  act(s => {
    const snap = s.roundSnap; if (!snap || snap.round !== s.round) return;
    const log = s.log, keep = clone(snap);
    for (const k of Object.keys(s)) if (k !== "prev") delete s[k];
    Object.assign(s, keep, { roundSnap: clone(snap), log });
    return { log: "Rewound to the start of round " + s.round };
  });
}
// The public view hides who the night is about until the line that shows them, shows the side-quest only on its own
// line, and hides names again on the last line (blindfolds off). These markers tell it where those lines are.
function nightMarks(s) {
  const n = s.night, sc = nightScript(n, s);
  n.revealStep = Math.max(0, sc.findIndex(l => { const x = norm(l); return x.murdered || x.answer }));
  n.questStep = sc.findIndex(l => norm(l).quest);
  n.endStep = sc.length - 1;
  if (n.questStep >= 0 && n.step >= n.questStep) resolveQuest(s);
}

/* ---------- setup ---------- */
function startGame(cfg) {
  const players = cfg.names.map((n, i) => ({
    id: "p" + i + "_" + (n.replace(/[^a-z0-9]/gi, "").toLowerCase() || "x"), name: n, role: "candle",
    alive: true, left: false, shield: null, revealed: false, color: COLORS[i % COLORS.length]
  }));
  shuffle(players.slice()).slice(0, cfg.cloaks).forEach(p => p.role = "cloak");
  setPin(cfg.pin);
  const rules = cleanRules(cfg.rules); if (rules.rounds) { const [lo, hi] = roundsRange(players.length); rules.rounds = Math.max(lo, Math.min(hi, rules.rounds)) }
  const rounds = rules.rounds || autoRounds(players.length);
  store.save({
    v: SCHEMA, gid: Math.random().toString(36).slice(2, 10), prize: cfg.prize, hours: cfg.hours || 4, startedAt: null, stamps: [], questsOn: rules.quests,
    rules, plan: planMissions(rules, rounds * 2 + 6), planAt: 0,
    brand: { title: cfg.title || "Cloak & Candle", host: cfg.host || "the host" },
    phase: "lobby", round: 1, finalRound: rules.rounds === 1 ? 1 : null, roundMissions: 0,
    usedQuiz: [], usedWords: [], usedQuests: [], used: {}, done: {}, ghosts: {}, players,
    pot: 0, potUnit: cfg.potUnit, potCap: cfg.potCap || 2000, wrongRule: cfg.wrongRule === "all" ? "all" : "cloaks", missionsPlayed: 0, hostPin: cfg.pin,
    log: [clock() + " Game created: " + players.length + " players, " + cfg.cloaks + " cloaks"],
    tvRules: false, tvBlack: false, tvPause: false, replaySfx: 0, tvText: "large",
    night: null, mission: null, table: null, morning: null, shieldCard: null, mingle: null, endvote: null, final2: null,
    witness: null, champion: null, voteLog: [], quest: null, questTally: { done: 0, failed: 0 }, ghostIntroDone: false, prefs: {}, cloakMisses: 0, winner: null, prizeTo: null
  });
}
function cleanRules(r) {
  r = Object.assign({}, RULES0, r || {}); const o = {};
  const int = (v, lo, hi, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d };
  o.rounds = int(r.rounds, 0, 12, 0); o.perRound = int(r.perRound, 0, 2, 0); o.dinnerAfter = int(r.dinnerAfter, 0, 12, 1); o.mingle = r.mingle !== false;
  const keys = MISSIONS.filter(m => !m.addon).map(m => m.key); o.pool = Array.isArray(r.pool) ? r.pool.filter(k => keys.includes(k)) : null; if (o.pool && !o.pool.length) o.pool = null;
  o.kill = r.kill === "murder" ? "murder" : "poison"; o.ghosts = r.ghosts !== false; o.convert = r.convert !== false; o.bargain = r.bargain !== false; o.quests = r.quests !== false;
  o.shield = ["mix", "public", "secret", "off"].includes(r.shield) ? r.shield : "mix"; o.blade = r.blade !== false; o.champion = r.champion !== false && o.blade && o.shield !== "off"; o.witness = r.witness !== false; o.dilemma = r.dilemma !== false && o.shield !== "off";
  return o;
}
function newGame() { store.save(null) }
const newTable = () => ({ stage: "talk", votes: {}, ballots: {}, last: null, immune: [], revote: null, showDots: false, exiled: null, step: 0, talkEnd: null, talkDur: null, roll: null, margin: null });
function openTable(log) {
  if (state && isFinal(state) && state.phase !== "endvote" && aliveOf(state).length <= 4) return openEndvote();
  act(s => {
    s.phase = "table"; s.mission = null; s.mingle = null; s.table = newTable();
    if (!isFinal(s)) { if (!s.rt || s.rt.round !== s.round) s.rt = roundTarget(s); if (s.rt.exiles === 2) s.table.exiles = 2 }
  }, log || "Reckoning opened");
}
// A big table (more than sixteen at the Reckoning) exiles twice: after the first reveal the boards go up again. The blade
// has already fallen, so the second vote counts every board once and nobody may buy immunity.
const secondVoteDue = s => !!s.table && s.table.exiles === 2 && !s.table.second && !isFinal(s) && aliveOf(s).length > 5;
function secondVote() {
  act(s => { if (!secondVoteDue(s)) return; const first = s.table.exiled; s.phase = "table"; s.table = { ...newTable(), exiles: 2, second: true, firstExiled: first }; return { log: "The second vote" } });
}

/* ---------- missions ---------- */
const BANKS = { likely: () => LIKELY, estimate: () => ESTIMATE, hilo: () => ESTIMATE, charades: () => CHARADES, hum: () => SONGS, draw: () => PICTIONARY, memory: () => MEMSETS };
// Higher or Lower asks Closest Guess questions: one list of what has been used, so the two never repeat each other
const USEDKEY = { hilo: "estimate" };
// Draw order for a bank: random, but nothing repeats within a game until the switched-on items run out.
function drawOrder(s, key) {
  const n = BANKS[key]().length; s.used = s.used || {}; const seen = s.used[USEDKEY[key] || key] || [];
  const all = eligible(BANKKEY[key], n);
  return [...shuffle(all.filter(i => !seen.includes(i))), ...shuffle(all.filter(i => seen.includes(i)))];
}
function markUsed(s) {
  const m = s.mission; if (!m || !m.order) return;
  const i = m.order[m.qi % m.order.length]; s.used = s.used || {};
  const uk = USEDKEY[m.key] || m.key, u = s.used[uk] = s.used[uk] || []; if (!u.includes(i)) u.push(i);
}
const itemOf = m => BANKS[m.key]()[m.order[m.qi % m.order.length]];

/* ---------- the question bank: master on/off switches, kept apart from any one game ---------- */
// Switched-off items are never drawn, in this game or any later one. They live on the server (a wipe keeps them),
// in the artifact's storage, or on this device when there is neither. Items are known by their place in the bank.
const BANKDEFS = [
  { key: "QUIZ_E", label: "Quiz · easy", items: () => QUIZ_E, min: 10 },
  { key: "QUIZ_M", label: "Quiz · medium", items: () => QUIZ_M, min: 10 },
  { key: "QUIZ_H", label: "Quiz · hard", items: () => QUIZ_H, min: 10 },
  { key: "ESTIMATE", label: "Closest Guess", items: () => ESTIMATE, min: 12 },
  { key: "LIKELY", label: "Most Likely To", items: () => LIKELY, min: 10 },
  { key: "CHARADES", label: "Charades", items: () => CHARADES, min: 10 },
  { key: "SONGS", label: "Hum It", items: () => SONGS, min: 10 },
  { key: "PICTIONARY", label: "Pictionary", items: () => PICTIONARY, min: 10 },
  { key: "MEMSETS", label: "Memory walls", items: () => MEMSETS, min: 1 },
  { key: "CODEWORDS", label: "Longest Word words", items: () => CODEWORDS, min: 2 },
  { key: "QUESTS", label: "Side-quests", items: () => QUESTS, min: 10 }];
const BANKKEY = { likely: "LIKELY", estimate: "ESTIMATE", hilo: "ESTIMATE", charades: "CHARADES", hum: "SONGS", draw: "PICTIONARY", memory: "MEMSETS" };
const SETTINGS_KEY = "candle-settings";
let bankOff = {}, bankErr = false, bankT = null;
const isOff = (bank, i) => !!(bankOff[bank] && bankOff[bank].includes(i));
// what a draw may use: the switched-on items (or everything, if a bank somehow ended up with none on)
function eligible(bank, n) { const all = [...Array(n).keys()], on = all.filter(i => !isOff(bank, i)); return on.length ? on : all }
const cleanOff = o => { const out = {}; if (o && typeof o === "object") for (const d of BANKDEFS) if (Array.isArray(o[d.key])) { const v = [...new Set(o[d.key].filter(i => Number.isInteger(i) && i >= 0 && i < d.items().length))]; if (v.length) out[d.key] = v.sort((a, b) => a - b) } return out };
async function bankLoad() {
  if (db) { try { db.doc("game/settings").onSnapshot(x => { bankOff = cleanOff(x.exists && x.data() && x.data().off); emit() }, e => console.error(e)) } catch (e) {} return }
  if (remote) { try { const r = await fetch(API + "/settings", { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (!bankT) { bankOff = cleanOff(j.settings && j.settings.off); emit() } } } catch (e) {} return }
  try { bankOff = cleanOff((JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}).off) } catch (e) { bankOff = {} }
}
// taps collapse into one save; a failed save is retried every few seconds with the state resync
function bankSave() {
  clearTimeout(bankT);
  bankT = setTimeout(async () => {
    const settings = { v: 1, off: bankOff };
    try {
      if (db) await db.doc("game/settings").set(settings);
      else if (remote) {
        const r = await fetch(API + "/settings", { method: "PUT", headers: pinHeader(), body: JSON.stringify({ settings }) });
        if (r.status === 426) { location.reload(); return }
        if (r.status === 403) { bankErr = false; bankT = null; toast("Wrong host PIN — the bank was not saved."); return }
        if (!r.ok) throw new Error("save failed");
      } else localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      bankErr = false;
    } catch (e) { if (!bankErr) toast("Couldn’t save the bank — it will keep trying."); bankErr = true }
    bankT = null; emit();
  }, 400);
}
function bankToggle(key, i) {
  const d = BANKDEFS.find(b => b.key === key); if (!d || !Number.isInteger(i) || i < 0 || i >= d.items().length) return;
  const off = (bankOff[key] || []).slice(), at = off.indexOf(i);
  if (at >= 0) off.splice(at, 1);
  else { if (d.items().length - off.length <= d.min) { toast("Keep at least " + d.min + " switched on in " + d.label + "."); return } off.push(i); off.sort((a, b) => a - b) }
  if (off.length) bankOff[key] = off; else delete bankOff[key];
  emit(); bankSave();
}
function bankAllOn(key) { delete bankOff[key]; emit(); bankSave() }

// Shields: a quarter of the living table at most (always room for one) on any night, and none in the final round,
// which has no night left to protect anyone from. Every mission draws on the same allowance.
const shieldCap = s => Math.max(1, Math.floor(aliveOf(s).length / 4));
const shieldsHeld = s => s.players.filter(p => p.alive && p.shield).length;
function shieldRoom(s) { return isFinal(s) ? 0 : Math.max(0, shieldCap(s) - shieldsHeld(s)) }
// Missions played in counted rounds can hide secret shields in one or two "mystery rounds": win that round and a
// shield is yours, and only the host knows which round it was. Every mission with a shield can instead give the overall
// winner a public one. Never both in one mission.
const ROUNDED = ["quiz", "countdown", "estimate", "hilo", "change"];
// What the host can set before a mission starts: [field, label, min, max, step, default]
const MSET = {
  quiz: [["per", "Questions in each part (easy, medium, brutal)", 5, 10, 1, 10]],
  likely: [["total", "Prompts", 3, 15, 1, 10]],
  countdown: [["total", "Rounds", 4, 12, 1, 10], ["timer", "Seconds per round", 20, 60, 5, 30]],
  estimate: [["total", "Rounds", 4, 15, 1, 12]],
  memory: [["timer", "Seconds to study the wall", 30, 90, 15, 45]],
  snap: [["total", "Symbols", 10, 30, 5, 20]],
  charades: [["timer", "Seconds per mime", 30, 120, 15, 45]],
  hum: [["timer", "Seconds per song", 15, 90, 15, 30]],
  draw: [["timer", "Seconds per drawing", 30, 120, 15, 60]],
  truths: [["total", "Turns (one player each)", 3, 10, 1, 5], ["timer", "Seconds to think", 15, 60, 15, 30]],
  hilo: [["total", "Rounds (about 3 min each)", 1, 6, 1, 4]],
  change: [["total", "Rounds", 3, 10, 1, 6], ["timer", "Seconds to study", 10, 40, 5, 20]],
  statue: [["timer", "Seconds", 60, 300, 30, 120]],
  oneleg: [["timer", "Seconds", 30, 180, 15, 90]]
};
const NUMW = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENW = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const numWord = n => n < 20 ? NUMW[n] : n < 100 ? TENW[Math.floor(n / 10)] + (n % 10 ? "-" + NUMW[n % 10] : "") : String(n);
const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
function durWord(sec) {
  const m = Math.floor(sec / 60), r = sec % 60;
  if (sec < 100) return numWord(sec) + " seconds";
  if (!r) return numWord(m) + " minutes";
  if (r === 30) return numWord(m) + " and a half minutes";
  return numWord(m) + (m === 1 ? " minute" : " minutes") + " and " + numWord(r) + " seconds";
}
// The brief as read out and shown on the TV, with the host's settings written in. The prize is not in it: the TV
// shows the brief while the host decides the prize, then the prize on its own card once confirmed (prizeOf_).
function rulesOf(m) {
  const def = MISSIONS.find(x => x.key === m.key) || {};
  if (m.key === "custom") return m.rules;
  if (m.key === "dilemma") return String(def.rules || "").replace(/\{P2\}/g, m.stake ? money(m.stake * 2) : "double the points").replace(/\{P\}/g, m.stake ? money(m.stake) : "the mission's points");
  return String(def.rules || "").replace(/\{N\}/g, cap1(numWord(m.total))).replace(/\{n\}/g, numWord(m.total)).replace(/\{T\}/g, cap1(durWord(m.timer))).replace(/\{t\}/g, durWord(m.timer));
}
// Missions with no prize to set (Most Likely To, the Dilemma) go straight from the brief to the game.
const hasPrizeStep = m => !!m && m.key !== "dilemma" && m.key !== "likely";
// A mission's prizes. Each is won openly by the overall winner, or in secret in a mystery round (missions played in rounds only):
//   m.win  the shield — "none" | "public" (the overall winner, named on TV) | "secret" (m.secN mystery rounds, one or two)
//   m.dag  the blade — "none" | "public" (the overall winner) | "secret" (a mystery round of its own)
//          | "with" (it goes with the shield: one person holds both — the Champion — openly or in secret, as the shield is)
// One blade a round. Only a Champion may lay both down at the Reckoning to be safe from that exile.
const WRONGABLE = ["quiz", "snap", "change"];
// how a mystery round is won, mission by mission
const MYST = {
  quiz: { unit: "question", units: "questions", how: "answers it correctly", howN: "answer that one correctly" },
  estimate: { unit: "question", units: "questions", how: "is closest on it", howN: "be the closest on that one" },
  countdown: { unit: "round", units: "rounds", how: "has the longest word in it", howN: "have the longest word in that round" },
  hilo: { unit: "round", units: "rounds", how: "is last one standing in it", howN: "be the last one standing in that round" },
  change: { unit: "round", units: "rounds", how: "spots the change first", howN: "be first to spot the change in that round" }
};
const mystOf = m => MYST[m && m.key] || { unit: "round", units: "rounds", how: "wins it", howN: "win that one" };
const bladeOk = (s, m) => !!m && rulesIn(s).blade && !["dilemma", "likely"].includes(m.key) && !championOf(s) && !m.witnessOffer;
const championPrize = m => !!m && m.dag === "with" && m.win !== "none";
// the overall winner takes something named on the TV, so a tie at the top is worth settling
const prizeRides = m => !!m && m.key !== "dilemma" && !m.witnessOffer && (m.win === "public" || m.dag === "public" || (m.dag === "with" && m.win === "public"));
// one plain line for the host: who takes what, and how
function prizeSummary(m) {
  if (m.witnessOffer) return "The winner takes the Witness (the TV says “a special prize”).";
  const n = m.secN || 1, bits = [];
  const u = mystOf(m);
  if (championPrize(m)) bits.push(m.win === "public" ? "The overall winner becomes the Champion — shield and blade — named on TV." : "One hidden " + u.unit + ": whoever " + u.how + " becomes the Champion — shield and blade — in secret." + (n > 1 ? " A second hidden " + u.unit + " gives a shield on its own." : ""));
  else {
    if (m.win === "public") bits.push("The overall winner takes a shield, named on TV.");
    if (m.win === "secret") bits.push(n > 1 ? "Two hidden " + u.units + ": whoever " + u.how + " takes a shield, in secret." : "One hidden " + u.unit + ": whoever " + u.how + " takes a shield, in secret.");
    if (m.dag === "public") bits.push("The overall winner takes the blade, named on TV.");
    if (m.dag === "secret") bits.push("Another hidden " + u.unit + ": whoever " + u.how + " takes the blade, in secret.");
  }
  return bits.join(" ") || "No shield, no blade — the pot only.";
}
// The prize card: what the TV shows (one labelled line per prize, then the pot) and what the host reads out.
function prizeOf_(m, fin, s) {
  s = s || state;
  const items = [], say = [], n = m.secN || 1, two = n > 1, u = mystOf(m);
  const SH = "Whoever holds a shield cannot be poisoned tonight.", DG = "At tonight’s Reckoning, the blade’s vote counts twice.";
  if (m.witnessOffer) { items.push({ ico: "eye", head: "A special prize", text: "The winner takes it. What it is stays secret." }); say.push("The winner of this one takes a special prize. What it is, I won't tell you — not yet.") }
  else if (championPrize(m) && m.win === "public") {
    items.push({ ico: "blade", head: "The Champion", text: "The overall winner takes the shield and the blade together — named for all to see. " + SH + " " + DG + " And only a Champion may lay both down at the Reckoning to be safe from the exile." });
    say.push("The overall winner becomes tonight's Champion. That means two things. A shield: the Cloaks cannot poison you tonight. And the blade: at the Reckoning your vote counts twice. Only a Champion may lay both down at the table, before the first board, to be safe from the exile. And everyone will know who it is.");
  } else if (championPrize(m)) {
    items.push({ ico: "blade", head: "The Champion — hidden", text: "One " + u.unit + " of this mission — nobody will say which — makes the Champion. " + cap1(u.howN) + " and you hold the shield and the blade together, in secret. It isn't for winning the mission." });
    say.push("Listen carefully. Hidden in this mission is the Champion. One " + u.unit + " — I won't say which. " + cap1(u.howN) + ", and you hold a shield and the blade, in secret. Not for winning the mission: for that one " + u.unit + ". The shield: the Cloaks cannot poison you tonight. The blade: at the Reckoning your vote counts twice — when the last board is in, the table sees where it fell, never whose it was. And only the Champion may lay both down at the table to be safe from the exile.");
    if (two) { items.push({ ico: "shield", head: "And a shield — hidden", text: "Another " + u.unit + " hides a shield on its own: " + u.howN + " and it's yours. " + SH }); say.push("And another " + u.unit + " hides a second shield, on its own.") }
    if (m.dag === "public") { items.push({ ico: "blade", head: "Blade", text: "The overall winner takes it — named for all to see. " + DG }); say.push("And the overall winner takes the blade.") }
  } else {
    if (m.win === "public") { items.push({ ico: "shield", head: "Shield", text: "The overall winner takes it — named for all to see. " + SH }); say.push("The overall winner takes a shield — and everyone will know who holds it. The Cloaks cannot poison you tonight.") }
    if (m.win === "secret") { items.push({ ico: "shield", head: two ? "Two shields — hidden" : "Shield — hidden", text: (two ? "Two " + u.units + " of this mission each hide a shield" : "One " + u.unit + " of this mission hides a shield") + " — nobody will say which. " + cap1(u.howN) + " and " + (two ? "one" : "it") + " is yours, in secret. It isn't for winning the mission. " + SH }); say.push("Listen carefully. Hidden in this mission " + (two ? "are two shields, each in one " + u.unit : "is a shield, in one " + u.unit) + ". " + cap1(u.howN) + " and " + (two ? "one" : "it") + " is yours — not for winning the mission, for that one " + u.unit + ". I won't tell you which " + (two ? u.units + " they are" : u.unit + " it is") + ", and I won't tell anyone who won " + (two ? "them" : "it") + ". The Cloaks cannot poison a shield.") }
    if (m.dag === "public") { items.push({ ico: "blade", head: "Blade", text: "The overall winner takes it — named for all to see. " + DG }); say.push((m.win === "secret" ? "And the overall winner" : "The overall winner") + " takes the blade: at tonight's Reckoning, their vote counts twice.") }
    if (m.dag === "secret") { items.push({ ico: "blade", head: "Blade — hidden", text: (m.win === "secret" ? "A different " : "One ") + u.unit + " hides the blade. " + cap1(u.howN) + " and it's yours, in secret: your vote counts twice at tonight's Reckoning. The table sees where it fell — never whose." }); say.push((m.win === "secret" ? "And a different " : m.win === "public" ? "And one " : "One ") + u.unit + " hides the blade. " + cap1(u.howN) + ", and at tonight's Reckoning your vote counts twice. When the last board is in, everyone sees where the blade fell — never whose it was.") }
    if (!items.length) { items.push({ ico: "scroll", head: fin ? "No shields in the final" : "No shield, no blade", text: fin ? "There is no night left to survive. Play for the pot." : "Play for the pot — and for your reputation." }); say.push(fin ? "No shields now. There is no night left to survive." : "No shield and no blade in this one. You are playing for the pot — and for your reputation.") }
  }
  const off = m.stake || 0, all = s && s.wrongRule === "all", wr = WRONGABLE.includes(m.key);
  const pot = off > 0 ? "Up to " + moneyOf(s, off) + " for the pot." + (wr ? (all ? " Every wrong shout costs it — a Cloak’s, double." : " A Cloak’s wrong shout costs it.") : "") : "The pot is full." + (wr ? " Wrong shouts can still cost it." : "");
  say.push(off > 0 ? "Up to " + moneyOf(s, off) + " goes in the pot." + (wr ? (all ? " Every wrong shout costs it — and a Cloak's costs double." : " And a Cloak's wrong shout costs it.") : "") : "The pot is already full.");
  items.forEach(i => { i.text = kw(i.text, s) });
  return { items, pot, tv: items.map(i => i.head + ": " + i.text).concat([pot]), say: kw(say.join(" "), s) };
}
// the rules as the mission list shows them: default settings, no shield promises
function defRules(def) {
  const m = { key: def.key, total: def.total || 0, timer: 0, per: 10, win: "none", secN: 0, secMax: 0, rules: def.rules };
  for (const [f, , , , , d] of MSET[def.key] || []) m[f] = d;
  if (def.key === "quiz") m.total = m.per * 3;
  return rulesOf(m);
}
// Room left tonight decides what this mission may give; the blade and the Champion are squared with it.
function mShields(s, m) {
  m.room = shieldRoom(s);
  const rounded = ROUNDED.includes(m.key);
  if (m.key === "dilemma") { m.win = m.room ? "public" : "none"; m.dag = "none"; m.secN = m.secMax = 0; return }
  if (!m.hasShield || !m.room || m.witnessOffer || rulesIn(s).shield === "off") m.win = "none";
  if (m.win === "secret" && !rounded) m.win = "public";
  if (m.dag === "secret" && !rounded) m.dag = "public";
  if (m.dag === "public" && m.win === "public") m.dag = rulesIn(s).champion ? "with" : "none";
  if (m.dag === "with" && !rulesIn(s).champion) m.dag = "none";
  if (m.dag === "with" && m.win === "none") m.dag = "public";
  if (!m.dag || !bladeOk(s, m)) m.dag = "none";
  m.secN = m.win === "secret" ? Math.max(1, Math.min(m.secN || 1, 2, m.room)) : 0; m.secMax = m.secN;
}
// Points on offer for a mission: what is left to reach the pot target, shared over the missions likely still to come.
function missionsLeft(s) {
  const a = aliveOf(s).length, rounds = isFinal(s) ? 1 : roundsFrom(a);
  const played = s.missionsPlayed || 0, per = played ? Math.max(1, Math.min(2.5, played / Math.max(1, s.round - 1 + ((s.roundMissions || 0) ? 1 : 0)))) : 1.3;
  return Math.max(1, Math.round(rounds * per - (s.roundMissions || 0)));
}
function offerOf(s) {
  const cap = s.potCap || 2000, left = Math.max(0, cap - (s.pot || 0)); if (!left) return 0;
  const raw = left / missionsLeft(s);
  return Math.min(left, Math.max(100, Math.round(raw / 50) * 50));
}
// A wrong shout is noted against the shouter. At the end of the mission it costs the pot — a Cloak's always, a
// Candle's only when the table plays "everyone pays" — and the room hears the total, never whose.
function wrongShout(s, m, id) {
  const p = id && P2(s, id); if (!m || !p) return; m.wrongs = m.wrongs || {}; m.wrongs[id] = (m.wrongs[id] || 0) + 1; if (p.role === "cloak") s.cloakMisses = (s.cloakMisses || 0) + 1;
  s.stats = s.stats || {}; s.stats.wrongs = s.stats.wrongs || {}; s.stats.wrongs[id] = (s.stats.wrongs[id] || 0) + 1;
}
// 50 a wrong shout: a Cloak's always; with "everyone pays", a Candle's 50 and a Cloak's 100
function penaltyOf(s, m) {
  let t = 0, f = 0;
  for (const [id, n] of Object.entries(m.wrongs || {})) { const p = P2(s, id); if (p && p.role === "cloak") t += n; else if (p) f += n }
  return Math.min(s.wrongRule === "all" ? (t * 2 + f) * 50 : t * 50, Math.max(100, 2 * (m.stake || 0)));
}
const fifty = v => Math.round((+v || 0) / 50) * 50;
function pickMission(key) {
  const def = MISSIONS.find(x => x.key === key);
  act(s => {
    const offer = key === "dilemma" ? Math.max(100, offerOf(s)) : offerOf(s);
    s.phase = "mission"; s.mingle = null; s.done = s.done || {}; s.done[key] = (s.done[key] || 0) + 1;
    if (key === "dilemma") s.done.dilemma_r = s.round; else s.roundMissions = (s.roundMissions || 0) + 1;
    const pref = (s.prefs || {})[key] || {};
    const m = s.mission = {
      mid: Math.random().toString(36).slice(2, 8), key, title: def.title, rules: def.rules, hasShield: !!def.hasShield, witnessOffer: false,
      kind: def.kind, stage: "rules", timer: 0, timerEnd: null, timerDur: null, qi: 0, qn: 1, total: def.total || 0, per: 10, showA: false,
      scores: {}, picks: [], stake: offer, result: null, shouter: null, lastRight: false, tally: {}, witnessId: null,
      win: ROUNDED.includes(key) ? "secret" : "public", secN: 1, dag: "none", winId: null, secIds: [], secMax: 0, room: 0, mystery: [], mysteryDone: [],
      dagRound: null, dagId: null, dagDone: false, warId: null, wrongs: {}, pen: 0,
      points: offer, actorId: null, seq: null, seqStart: null,
      letters: null, sd: null, sdNames: null, sdOver: false, autoPicked: false, order: null
    };
    for (const [f, , lo, hi, , d] of MSET[key] || []) m[f] = Math.max(lo, Math.min(hi, Math.round(+pref[f] || d)));
    if (key === "quiz") m.total = m.per * 3;
    if (s.rules) autoPrize(s, m); // the plan decides the prizes; the host can still change them on the brief
    else {
      if (["none", "public", "secret"].includes(pref.win) && m.hasShield) { m.win = pref.win; m.secN = pref.secN || 1 }
      if (["none", "public", "secret", "with"].includes(pref.dag)) m.dag = pref.dag;
    }
    mShields(s, m); m.rules = rulesOf(m);
    // the running order moves on; a mission swapped in from later in the plan comes out of it, so it isn't played twice
    if (s.plan && key !== "dilemma") { const at = s.planAt || 0, i = s.plan.indexOf(key, at); if (i === at) s.planAt = at + 1; else if (i > at) s.plan.splice(i, 1) }
  }, "Mission: " + def.title);
}
// the host's settings on the rules screen; remembered for the next time this mission comes round
function mSet(f, d) {
  act(s => {
    const m = s.mission; if (!m || m.stage !== "rules") return;
    const row = (MSET[m.key] || []).find(r => r[0] === f); if (!row) return;
    const [, , lo, hi, st] = row; m[f] = Math.max(lo, Math.min(hi, m[f] + d * st));
    if (m.key === "quiz") m.total = m.per * 3;
    s.prefs = s.prefs || {}; const p = s.prefs[m.key] = s.prefs[m.key] || {}; p[f] = m[f];
    m.rules = rulesOf(m);
  });
}
function mWin(w, n) {
  act(s => {
    const m = s.mission; if (!m || m.stage !== "rules" || !m.hasShield || m.key === "dilemma") return;
    if (w === "secret" && !ROUNDED.includes(m.key)) return;
    m.win = w; if (w === "secret") m.secN = n || 1; if (w !== "none") m.witnessOffer = false;
    mShields(s, m); m.rules = rulesOf(m);
    s.prefs = s.prefs || {}; const pr = s.prefs[m.key] = s.prefs[m.key] || {}; pr.win = m.win; if (m.win === "secret") pr.secN = m.secN; pr.dag = m.dag;
  });
}
// the blade's setting: none, the overall winner's, a hidden round's, or with the shield (the Champion)
function mDag(d) {
  act(s => {
    const m = s.mission; if (!m || m.stage !== "rules" || !bladeOk(s, m)) return;
    if (d === "secret" && !ROUNDED.includes(m.key)) return;
    m.dag = d; mShields(s, m); m.rules = rulesOf(m);
    s.prefs = s.prefs || {}; const pr = s.prefs[m.key] = s.prefs[m.key] || {}; pr.dag = m.dag;
  });
}
function mWitness() { act(s => { const m = s.mission; if (!m || m.stage !== "rules") return; m.witnessOffer = !m.witnessOffer; if (m.witnessOffer) { m.win = "none"; m.dag = "none" } mShields(s, m); m.rules = rulesOf(m) }) }
function quizBuild(s, m) {
  s.usedQuiz = s.usedQuiz || [];
  const pick = (bank, tag) => {
    const ok = eligible("QUIZ_" + tag, bank.length).map(i => tag + i);
    let free = ok.filter(id => !s.usedQuiz.includes(id));
    if (free.length < m.per) { s.usedQuiz = s.usedQuiz.filter(id => !id.startsWith(tag)); free = ok }
    return shuffle(free).slice(0, m.per);
  };
  // easy, then medium, then brutal: random inside each part
  const parts = [pick(QUIZ_E, "E"), pick(QUIZ_M, "M"), pick(QUIZ_H, "H")], ids = parts.flat(); s.usedQuiz.push(...ids);
  m.qs = ids.map(id => ({ id, q: (id[0] === "E" ? QUIZ_E : id[0] === "M" ? QUIZ_M : QUIZ_H)[+id.slice(1)] }));
  m.total = m.qs.length; m.per = parts[0].length || m.per;
}
// the mystery rounds: never the first round when there is a choice, never announced
function pickMystery(m) {
  const nS = m.win === "secret" ? m.secN || 1 : 0, nD = m.dag === "secret" ? 1 : 0, need = nS + nD;
  if (!need) return { sh: [], dag: null };
  const all = [...Array(Math.max(0, m.total)).keys()].map(i => i + 1), pool = shuffle(all.length > need ? all.slice(1) : all);
  const sh = pool.slice(0, nS).sort((a, b) => a - b);
  // too few rounds for a round each: the blade shares one (its winner then holds both)
  return { sh, dag: nD ? (pool[nS] || pool[0] || null) : null };
}
// what a round hides, for the host's private banner: "a secret shield", "the Champion", "the blade"…
function mysteryAt(m, n) {
  if (!m) return [];
  const out = [];
  if (m.win === "secret" && (m.mystery || []).includes(n)) out.push(m.dag === "with" && n === m.mystery[0] ? "the Champion — shield and blade" : "a shield");
  if (m.dag === "secret" && m.dagRound === n) out.push("the blade");
  return out;
}
// A mission round has been won (or nobody won it). A mystery round's winner takes what it hid, said nowhere but the log.
function roundWon(s, m, n, id) {
  if (!m) return null;
  const logs = [], p = id && P2(s, id), who = p && p.alive ? p : null, done = m.mysteryDone || (m.mysteryDone = []);
  if (m.win === "secret" && (m.mystery || []).includes(n) && !done.includes(n)) {
    done.push(n);
    const war = m.dag === "with" && n === m.mystery[0];
    if (!who) logs.push("Mystery round " + n + ": nobody won it — " + (war ? "the Champion's shield and blade go" : "that shield goes") + " unclaimed");
    else if (m.secIds.includes(who.id)) logs.push("Mystery round " + n + ": " + who.name + " again — one shield each, so this one goes unclaimed");
    else { if (m.secIds.length < m.secMax) m.secIds.push(who.id); if (war) m.warId = who.id; logs.push("Mystery round " + n + ": " + who.name + (war ? " is the Champion — shield and blade, in secret" : " wins a secret shield")) }
  }
  if (m.dag === "secret" && m.dagRound === n && !m.dagDone) {
    m.dagDone = true;
    if (who) { m.dagId = who.id; logs.push("Mystery round " + n + ": " + who.name + " wins the blade, in secret") } else logs.push("Mystery round " + n + ": nobody won it — the blade goes unclaimed");
  }
  return logs.join(" · ") || null;
}
function letters12(base) {
  const V = "AAAAEEEEEIIIIOOOUU", C = "BBCCDDDFGGHHJKLLLMMNNNNPPQRRRRRSSSSTTTTVWXYZ";
  const a = (base || "").split(""); let vn = a.filter(ch => "AEIOU".includes(ch)).length;
  while (a.length < 12) { const wantV = vn < 4, src = wantV ? V : C; a.push(src[Math.floor(Math.random() * src.length)]); if (wantV) vn++ }
  return shuffle(a).join("");
}
// Each round deals and starts its clock at once: the letters and the ring appear together.
function dealWord(s) {
  const m = s.mission; m.letters = letters12("");
  m.timerDur = m.timer * 1000; m.timerEnd = now() + m.timerDur;
}
let DICT = null, dictP = null, dictFail = false;
function loadDict() {
  if (dictP) return dictP;
  dictP = (async () => {
    try { const r = await fetch("/words.txt", { cache: "force-cache" }); if (r.ok && !(r.headers.get("content-type") || "").includes("html")) DICT = (await r.text()).split("\n").filter(Boolean); else dictFail = true }
    catch (e) { dictFail = true }
    return DICT;
  })();
  return dictP;
}
let bestCache = { letters: "", out: null };
function bestWords(letters) {
  if (!DICT) return null;
  if (bestCache.letters === letters) return bestCache.out;
  const cnt = {}; for (const ch of letters.toLowerCase()) cnt[ch] = (cnt[ch] || 0) + 1;
  const out = [];
  for (const w of DICT) {
    if (w.length < 3 || w.length > 12) continue;
    const c = { ...cnt }; let ok = true;
    for (const ch of w) { if (!c[ch]) { ok = false; break } c[ch]-- }
    if (ok) out.push(w);
  }
  out.sort((a, b) => b.length - a.length || a.localeCompare(b));
  bestCache = { letters, out: out.slice(0, 6) };
  return bestCache.out;
}
function snapSeq(n) {
  const seq = []; let last = -1;
  for (let i = 0; i < (n || 20); i++) {
    let v; if (i > 0 && Math.random() < 0.2) v = last; else { do { v = Math.floor(Math.random() * SNAPSYM.length) } while (v === last) }
    seq.push(v); last = v;
  }
  return seq;
}
// Every route into the "done" stage comes through here. Skill missions pre-select a clear winner for the shield.
function finishPlay(s) {
  const m = s.mission; m.stage = "done"; m.timerEnd = null; m.seqStart = null; m.showA = false; m.won = null;
  if (m.key !== "dilemma") { m.pen = penaltyOf(s, m); m.points = Math.max(-(m.stake || 0), (m.stake || 0) - m.pen) }
  if (prizeRides(m) && !m.autoPicked) {
    const r = aliveOf(s).slice().sort((a, b) => (m.scores[b.id] || 0) - (m.scores[a.id] || 0));
    const top = r[0] && (m.scores[r[0].id] || 0) > 0 ? r[0] : null;
    const tie = top && r.filter(p => (m.scores[p.id] || 0) === m.scores[top.id]).length > 1;
    if (top && !tie) { m.winId = top.id; m.autoPicked = true }
  }
  return { log: "Mission finished" };
}
// From the brief, the host's "confirm" puts the prize on the TV; from the prize card, the game begins.
function startMission() {
  const t = $("#mt"), r = $("#mr"), tm = $("#mtm");
  act(s => {
    const m = s.mission; if (!m || (m.stage !== "rules" && m.stage !== "prize")) return;
    mShields(s, m);
    if (m.stage === "rules" && m.key === "custom") { m.title = (t && t.value.trim()) || m.title; m.rules = (r && r.value.trim()) || m.rules; m.timer = Math.max(0, Math.round(+(tm && tm.value) || 0)) }
    else if (m.key !== "custom") m.rules = rulesOf(m);
    if (m.stage === "rules" && hasPrizeStep(m)) { m.stage = "prize"; const pl = prizeOf_(m, isFinal(s)); return { log: "Prize: " + pl.tv.join(" ") } }
    if (m.key === "quiz") quizBuild(s, m);
    const my = pickMystery(m); m.mystery = my.sh; m.dagRound = my.dag; m.mysteryDone = []; m.dagDone = false; m.dagId = null; m.warId = null;
    if (BANKS[m.key]) { m.order = drawOrder(s, m.key); markUsed(s) }
    m.stage = "play";
    if (m.key === "countdown") dealWord(s);
    if (m.key === "hilo") { m.standing = aliveOf(s).map(p => p.id); m.out = []; m.ref = hiloRef(itemOf(m)[1]) }
    if (m.key === "truths") { m.tellerId = null; m.done2 = []; m.right = []; m.tstage = null; m.lastResult = null }
    if (m.key === "change") { m.cstage = null; m.grid = null; m.before = null; m.changed = null }
  });
}
function bump(id, d) { act(s => { const m = s.mission, sc = m.scores; sc[id] = Math.max(0, (sc[id] || 0) + d); if (m.key === "snap" && d < 0) wrongShout(s, m, id) }) }
function nextItem(s) { const m = s.mission; m.qi++; markUsed(s) }
// Charades / Hum It: the actor doesn't know it. Same actor, a fresh one, shown to them at once; nobody scores.
function skipWord() { act(s => { const m = s.mission; if (!m || !m.actorId || !["charades", "hum", "draw"].includes(m.key)) return; nextItem(s); m.wordOn = m.showA && !m.timerEnd && !m.bfOff; m.bfOff = false; m.showA = true; m.timerEnd = null }) }
function guessed(id) {
  act(s => {
    const m = s.mission; m.scores[id] = (m.scores[id] || 0) + 1;
    const a = m.actorId && P2(s, m.actorId);
    if (a && a.id !== id && a.alive) m.scores[a.id] = (m.scores[a.id] || 0) + 1;
    nextItem(s); m.actorId = null; m.showA = false; m.wordOn = false; m.bfOff = false; m.timerEnd = null;
  });
}
function topOf(s, t) {
  const e = Object.entries(t || {}).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!e.length) return null; if (e[1] && e[1][1] === e[0][1]) return null;
  return P2(s, e[0][0]) || null;
}
function likelyNext() {
  act(s => {
    const m = s.mission, w = topOf(s, m.tally);
    if (w) m.scores[w.id] = (m.scores[w.id] || 0) + 1;
    m.tally = {}; m.showA = false;
    if (m.qn >= m.total) return finishPlay(s);
    nextItem(s); m.qn++;
  });
}
let quizTimer = null;
function quizJudge(right) {
  clearTimeout(quizTimer);
  act(s => {
    const m = s.mission; m.showA = true; m.lastRight = !!right;
    const sh = m.shouter && P2(s, m.shouter);
    if (right === false && sh) wrongShout(s, m, sh.id);
    if (right && sh) m.scores[sh.id] = (m.scores[sh.id] || 0) + 1;
    const log = roundWon(s, m, m.qn, right && sh ? sh.id : null);
    if (right === null) m.shouter = null;
    return log ? { log } : undefined;
  });
  const mid = state.mission.mid, qn = state.mission.qn;
  quizTimer = setTimeout(() => { const m = state && state.mission; if (m && m.mid === mid && m.stage === "play" && m.qn === qn && m.showA) quizNext() }, 4000);
}
function quizNext() {
  clearTimeout(quizTimer);
  act(s => {
    const m = s.mission; if (!m || m.key !== "quiz" || m.stage !== "play") return;
    m.shouter = null; m.showA = false; m.lastRight = false;
    if (m.qn >= m.total) return finishPlay(s);
    m.qi++; m.qn++;
  });
}
function award(id) {
  act(s => {
    const m = s.mission; if (id) m.scores[id] = (m.scores[id] || 0) + 1;
    m.showA = false; const log = roundWon(s, m, m.qn, id);
    if (m.qn >= m.total) { finishPlay(s); return log ? { log } : undefined }
    nextItem(s); m.qn++; return log ? { log } : undefined;
  });
}
function awardWord(id) {
  act(s => {
    const m = s.mission; if (id) m.scores[id] = (m.scores[id] || 0) + 1;
    const log = roundWon(s, m, m.qn, id);
    if (m.qn >= m.total) { finishPlay(s); return log ? { log } : undefined }
    m.qn++; dealWord(s); return log ? { log } : undefined;
  });
}
// the secret shields won in a mission's mystery rounds, for the host to correct if a round was misjudged
function giveShield(id) {
  act(s => {
    const m = s.mission, i = m.secIds.indexOf(id);
    if (i >= 0) { m.secIds.splice(i, 1); if (m.warId === id) m.warId = null; return }
    if (m.secIds.length < m.secMax) { m.secIds.push(id); return { log: "Secret shield: " + P2(s, id).name } }
  });
}
// the hidden blade's and the secret Champion's winners, for the same corrections
function giveBlade(id) { act(s => { const m = s.mission; if (!m || m.dag !== "secret") return; m.dagId = m.dagId === id ? null : id; m.dagDone = true }) }
function giveChampion(id) {
  act(s => {
    const m = s.mission; if (!m || !championPrize(m) || m.win !== "secret") return;
    if (m.warId === id) { m.warId = null; return }
    m.warId = id; if (!m.secIds.includes(id)) { if (m.secIds.length >= m.secMax) m.secIds.shift(); m.secIds.unshift(id) }
    return { log: "Secret Champion: " + P2(s, id).name };
  });
}
function togglePick(id) { act(s => { const p = s.mission.picks, i = p.indexOf(id); i >= 0 ? p.splice(i, 1) : p.push(id) }) }
function resolveDilemma() {
  act(s => {
    const m = s.mission, c = m.picks.length;
    if (c === 1) { const p = P2(s, m.picks[0]); m.result = { kind: "one", name: p.name }; if (m.win === "public") m.winId = p.id; m.scores[p.id] = 1; m.points = m.stake; return { log: "Dilemma: " + p.name + " alone wrote SHIELD" } }
    if (c === 0) { m.result = { kind: "none" }; m.points = m.stake * 2; return { log: "Dilemma: nobody wrote SHIELD" } }
    m.result = { kind: "many", count: c }; m.points = -m.stake; return { log: "Dilemma: " + c + " wrote SHIELD, pot loses " + m.stake };
  });
}
function suddenDeath() {
  act(s => {
    const m = s.mission; s.usedQuiz = s.usedQuiz || [];
    const ok = eligible("QUIZ_H", QUIZ_H.length).map(i => "H" + i);
    let free = ok.filter(id => !s.usedQuiz.includes(id)); if (!free.length) free = ok;
    const id = free[Math.floor(Math.random() * free.length)]; s.usedQuiz.push(id); m.sd = QUIZ_H[+id.slice(1)]; m.sdOver = false;
    const r = aliveOf(s).sort((a, b) => (m.scores[b.id] || 0) - (m.scores[a.id] || 0)), topv = m.scores[r[0].id] || 0;
    m.sdNames = r.filter(p => (m.scores[p.id] || 0) === topv).map(p => p.name);
    return { log: "Sudden death" };
  });
}
const ptsInput = () => { const el = $("#pts"); return el ? Math.round(+el.value || 0) : null };
function shieldPick(id) {
  const pts = ptsInput();
  act(s => {
    const m = s.mission; if (pts !== null) m.points = pts;
    if (m.sd && !m.sdOver) {
      m.scores[id] = (m.scores[id] || 0) + 1; m.sdOver = true; m.autoPicked = true;
      if (prizeRides(m)) m.winId = id;
      return { log: "Sudden death won by " + P2(s, id).name };
    }
    m.winId = m.winId === id ? null : id; m.autoPicked = true;
  });
}
// the Witness is on offer only with five left and a single Cloak, before the final table: whoever it is meets them then
const witnessOk = s => !!s && rulesIn(s).witness && !s.witness && aliveOf(s).length === 5 && aliveOf(s).filter(p => p.role === "cloak").length === 1;
function witnessPick(id) { const pts = ptsInput(); act(s => { const m = s.mission; if (pts !== null) m.points = pts; m.witnessId = m.witnessId === id ? null : id }) }
/* ---------- Higher or Lower: stand, call it, sit when wrong ---------- */
// a number to call against: near enough to argue about, never the answer itself; years move by years, not by a factor
function hiloRef(ans) {
  const R = Math.random, yr = Number.isInteger(ans) && ans >= 1000 && ans <= 2100;
  let v = yr ? ans + (R() < .5 ? -1 : 1) * (3 + Math.floor(R() * 38)) : ans * (R() < .5 ? .55 + R() * .3 : 1.2 + R() * .6);
  if (!yr && v >= 20) { const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1); v = Math.round(v / mag) * mag } else v = Math.round(v);
  if (v === ans) v = ans + (yr || ans < 20 ? 1 : Math.max(1, Math.round(ans * .1)));
  return Math.max(0, v);
}
function hiloOut(id) { act(s => { const m = s.mission; if (!m || m.key !== "hilo" || !m.showA || !m.standing.includes(id)) return; const i = m.out.indexOf(id); i >= 0 ? m.out.splice(i, 1) : m.out.push(id) }) }
function hiloNext() {
  act(s => {
    const m = s.mission; if (!m || m.key !== "hilo" || m.won) return;
    const left = m.standing.filter(id => !m.out.includes(id) && P2(s, id) && P2(s, id).alive);
    let log = null;
    if (left.length) m.standing = left; // if every one of them was wrong, nobody sits
    m.out = []; m.showA = false;
    if (m.standing.length <= 1) {
      const w = m.standing[0] && P2(s, m.standing[0]);
      if (w) { m.scores[w.id] = (m.scores[w.id] || 0) + 1; log = "Higher or Lower: " + w.name + " wins round " + m.qn }
      const ml = roundWon(s, m, m.qn, w && w.id); if (ml) log = (log ? log + " · " : "") + ml;
      m.won = { id: w ? w.id : null, name: w ? w.name : null, n: m.qn }; // on the TV until the host moves on
      return log ? { log } : undefined;
    }
    nextItem(s); m.ref = hiloRef(itemOf(m)[1]);
    return log ? { log } : undefined;
  });
}
function hiloRound() {
  act(s => {
    const m = s.mission; if (!m || m.key !== "hilo" || !m.won) return;
    m.won = null; if (m.qn >= m.total) return finishPlay(s);
    m.qn++; m.standing = aliveOf(s).map(p => p.id); m.out = []; m.showA = false; nextItem(s); m.ref = hiloRef(itemOf(m)[1]);
  });
}
/* ---------- Two Truths and a Lie ---------- */
function truthsPick(id) { act(s => { const m = s.mission; if (!m || m.key !== "truths") return; if (!id) { const pool = [...aliveOf(s), ...ghostsOf(s)].filter(p => !m.done2.includes(p.id)); const a = pool.length ? pool : aliveOf(s); id = a[Math.floor(Math.random() * a.length)].id } m.tellerId = id; m.tstage = "think"; m.right = []; m.timerEnd = null }) }
function truthsGo(stage) { act(s => { const m = s.mission; if (!m || !m.tellerId) return; m.tstage = stage; if (stage === "think") { m.timerDur = m.timer * 1000; m.timerEnd = now() + m.timerDur } else m.timerEnd = null }) }
function truthsRight(id) { act(s => { const m = s.mission, i = m.right.indexOf(id); i >= 0 ? m.right.splice(i, 1) : m.right.push(id) }) }
function truthsScore() {
  act(s => {
    const m = s.mission, t = P2(s, m.tellerId); if (!t) return;
    const guessers = aliveOf(s).filter(p => p.id !== t.id), right = m.right.filter(id => guessers.some(p => p.id === id)), fooled = guessers.length - right.length;
    right.forEach(id => m.scores[id] = (m.scores[id] || 0) + 1);
    if (t.alive && fooled > 0) m.scores[t.id] = (m.scores[t.id] || 0) + fooled;
    m.lastResult = { name: t.name, right: right.length, fooled }; m.done2.push(t.id);
    m.tellerId = null; m.tstage = null; m.right = []; m.timerEnd = null;
    if (m.qn >= m.total) return finishPlay(s);
    m.qn++;
    return { log: t.name + " fooled " + fooled };
  });
}
/* ---------- What Changed? twelve symbols, one change ---------- */
const CHSYM = ["moon", "sun", "blade", "crown", "shield", "table", "chalice", "scroll", "hourglass", "scales", "raven", "ghost", "key", "skull", "candle", "eye", "handshake"];
function changeStudy() { act(s => { const m = s.mission; m.grid = shuffle(CHSYM.slice()).slice(0, 12); m.before = null; m.changed = null; m.showA = false; m.cstage = "study"; m.timerDur = m.timer * 1000; m.timerEnd = now() + m.timerDur }) }
// first half: one symbol swapped for one that wasn't there; second half: two symbols trade places
function changeBlind() {
  act(s => {
    const m = s.mission; if (!m || m.key !== "change" || !m.grid || m.cstage !== "study") return; m.before = m.grid.slice(); m.timerEnd = null; m.cstage = "blind"; m.holdEnd = now() + 10000;
    if (m.qn <= Math.ceil(m.total / 2)) { const i = Math.floor(Math.random() * 12), spare = CHSYM.filter(x => !m.grid.includes(x)); m.grid[i] = spare[Math.floor(Math.random() * spare.length)]; m.changed = [i] }
    else { const i = Math.floor(Math.random() * 12); let j; do { j = Math.floor(Math.random() * 12) } while (j === i); [m.grid[i], m.grid[j]] = [m.grid[j], m.grid[i]]; m.changed = [i, j] }
  });
}
function changeLook() { act(s => { s.mission.cstage = "look" }) }
function changeWrong(id) { act(s => { const m = s.mission; if (!m || m.key !== "change" || m.showA || !m.cstage || m.cstage === "study") return; wrongShout(s, m, id); return { log: "Wrong shout: " + P2(s, id).name } }) }
function changeAward(id) {
  act(s => {
    const m = s.mission; if (m.showA) return;
    if (id) m.scores[id] = (m.scores[id] || 0) + 1;
    m.showA = true; m.cstage = "look"; m.spotter = id ? P2(s, id).name : null;
    const log = roundWon(s, m, m.qn, id); return log ? { log } : undefined;
  });
}
function changeNext() { act(s => { const m = s.mission; m.showA = false; m.spotter = null; m.cstage = null; m.grid = null; m.before = null; m.changed = null; m.holdEnd = null; if (m.qn >= m.total) return finishPlay(s); m.qn++ }) }

// The winner's public shield goes first, then the mystery rounds' secret ones, never past tonight's allowance (the
// Champion always gets theirs). Someone who already holds a shield keeps it: a public win makes it public. A mystery-round
// winner who already holds a secret one is still tapped in the ceremony, so nobody can work anything out from who wasn't.
// The blade goes to the overall winner, a mystery round's winner, or the Champion; one a round.
function endMission() {
  const pts = ptsInput();
  act(s => {
    const m = s.mission, cap = s.potCap || 2000, points = fifty(pts !== null ? pts : m.points);
    const ok = id => !!(id && P2(s, id) && P2(s, id).alive);
    const witness = m.witnessOffer && ok(m.witnessId) ? m.witnessId : null, winner = !witness && ok(m.winId) ? m.winId : null;
    const warId = m.dag === "with" && m.win === "secret" && ok(m.warId) ? m.warId : null;
    let blade = null, dagSecret = false;
    if (!witness && !championOf(s)) {
      if (m.dag === "public" || (m.dag === "with" && m.win === "public")) blade = winner;
      else if (m.dag === "secret" && ok(m.dagId)) { blade = m.dagId; dagSecret = true }
      else if (warId) { blade = warId; dagSecret = true }
    }
    const addon = !!(MISSIONS.find(x => x.key === m.key) || {}).addon;
    let room = shieldRoom(s); const pub = [], sec = [], again = [], wasted = [];
    const pubShield = m.win === "public" ? winner : null;
    if (pubShield && (room > 0 || P2(s, pubShield).shield)) { pub.push(pubShield); if (!P2(s, pubShield).shield) room-- }
    for (const id of m.win === "secret" ? m.secIds || [] : []) {
      if (!ok(id) || pub.includes(id) || sec.includes(id)) continue;
      // a Cloak can't be poisoned: a hidden shield they win is spent, with no ceremony — unless it makes them the Champion
      if (P2(s, id).role === "cloak" && id !== warId) { wasted.push(id); continue }
      if (P2(s, id).shield) { if (P2(s, id).shield === "secret" && !again.includes(id)) again.push(id); continue }
      if (room <= 0 && id !== warId) continue;
      sec.push(id); room--;
    }
    s.pot = Math.max(0, Math.min(cap, Math.round(s.pot + points)));
    if (!addon) s.missionsPlayed = (s.missionsPlayed || 0) + 1;
    s.stats = s.stats || {}; const st = s.stats, inc = (k, id) => { st[k] = st[k] || {}; st[k][id] = (st[k][id] || 0) + 1 };
    const tops = aliveOf(s).filter(p => (m.scores[p.id] || 0) > 0).sort((a, b) => m.scores[b.id] - m.scores[a.id]);
    if (tops[0] && !(tops[1] && m.scores[tops[1].id] === m.scores[tops[0].id])) inc("wins", tops[0].id);
    [...pub, ...sec].forEach(id => inc("shields", id));
    st.score = st.score || {}; for (const [id, n] of Object.entries(m.scores || {})) if (n > 0) st.score[id] = (st.score[id] || 0) + n;
    pub.forEach(id => P2(s, id).shield = "public"); sec.forEach(id => P2(s, id).shield = "secret");
    // a Candle Witness meets the Cloak now, before the final table; a Cloak who won it gets the same ceremony, and nothing
    let met = null; if (witness) { const tsA = aliveOf(s).filter(p => p.role === "cloak" && p.id !== witness), fake = P2(s, witness).role === "cloak"; met = fake || !tsA.length ? null : tsA[Math.floor(Math.random() * tsA.length)].id; s.witness = { id: witness, used: true, metId: met, fake: fake || !met, round: s.round } }
    if (blade) s.champion = { id: blade, round: s.round, secret: dagSecret, used: false };
    const nm = id => P2(s, id).name;
    // who is tapped in the ceremony, and for what: the secret Champion, plain secret shields, a secret blade
    const tapWar = warId && blade === warId ? warId : null, tapDag = dagSecret && blade !== warId ? blade : null;
    const tapSh = [...sec, ...again].filter(id => id !== tapWar);
    const champion = !!blade && !dagSecret && pub.includes(blade);
    const mode = witness ? "witness" : tapSh.length || tapWar || tapDag ? "secret" : pub.length ? "public" : "none";
    const earlier = s.players.some(p => p.alive && p.shield && !pub.includes(p.id) && !sec.includes(p.id));
    s.shieldCard = {
      points, offer: m.stake || 0, pen: m.key === "dilemma" ? 0 : m.pen || 0, mode, step: 0, addon, earlier, pubIds: pub, pubNames: pub.map(nm),
      secCount: tapSh.length, secIds: tapSh, secNames: tapSh.map(nm), secWar: !!tapWar, warName: tapWar ? nm(tapWar) : null, secDag: !!tapDag, dagName: tapDag ? nm(tapDag) : null,
      witnessId: witness, witnessName: witness ? nm(witness) : null, metName: met ? nm(met) : null, fake: !!(witness && !met), championName: blade && !dagSecret ? nm(blade) : null, champion, wasted: wasted.map(nm)
    };
    s.phase = "shield"; s.mission = null;
    const bits = [...pub.map(id => nm(id) + " (public)"), ...tapSh.map(id => nm(id) + " (secret)")];
    return { log: "Mission done: " + (points >= 0 ? "+" : "") + points + (m.pen ? " (wrong shouts −" + m.pen + ")" : "") + (witness ? ", Witness " + nm(witness) + (met ? " (meets " + nm(met) + " now)" : " (a Cloak — the ceremony is for show)") : bits.length ? ", shield " + bits.join(", ") : ", no shield") + (wasted.length ? " (mystery round won by Cloak " + wasted.map(nm).join(", ") + " — no shield, no ceremony)" : "") + (tapWar ? ", secret Champion " + nm(tapWar) : champion ? ", Champion (shield + blade) " + nm(blade) : blade ? ", blade " + nm(blade) + (dagSecret ? " (secret)" : "") : "") };
  });
}

/* ---------- the Reckoning: every board recorded, the Champion's twice ---------- */
const championOf = s => !(s.table && s.table.second && (s.phase === "table" || s.phase === "reveal")) && s.champion && s.champion.round === s.round && P2(s, s.champion.id) && P2(s, s.champion.id).alive ? s.champion.id : null;
// The blade always counts twice, but the room sees it only at the end: every board counts one as it turns, and once
// the last is in, the blade's second vote lands on whoever its holder chalked (a secret holder is never named).
const bladeLive = s => championOf(s);
function tally(s) {
  const t = s.table, w = championOf(s), v = {};
  for (const [voter, target] of Object.entries(t.ballots || {})) if (target !== "blank" && P2(s, target)) v[target] = (v[target] || 0) + 1;
  const dt = w && t.stage === "exile" && (t.ballots || {})[w];
  t.blade = dt && dt !== "blank" && P2(s, dt) ? { to: dt, by: s.champion.secret ? null : w } : null;
  if (t.blade) v[dt] = (v[dt] || 0) + 1;
  t.votes = v;
}
function toExile() { act(s => { const t = s.table; if (!t) return; t.stage = "exile"; tally(s); if (t.blade) return { log: "The blade falls on " + P2(s, t.blade.to).name + " (+1)" } }) }
function toVotes() { act(s => { const t = s.table; if (!t) return; t.stage = "votes"; tally(s) }) }
// the next board to record, going round the table in seat order
function nextVoter(s) { const t = s.table; return aliveOf(s).find(p => !(p.id in (t.ballots || {}))) || null }
function castBallot(voter, target) {
  act(s => {
    const t = s.table, v = P2(s, voter); if (!t || !v || !v.alive) return;
    if (target !== "blank" && ((t.immune || []).includes(target) || target === voter || !P2(s, target) || !P2(s, target).alive || (t.revote && !t.revote.includes(target)))) return;
    t.ballots = t.ballots || {}; t.ballots[voter] = target; t.last = voter; tally(s);
    return { log: v.name + " chalked " + (target === "blank" ? "nothing" : P2(s, target).name) + (voter === championOf(s) ? " (the blade — its second vote lands when every board is in)" : "") };
  });
}
function clearBallot(voter) { act(s => { const t = s.table; if (!t || !t.ballots) return; delete t.ballots[voter]; if (t.last === voter) t.last = null; tally(s) }) }
// A tie goes back to the boards between the tied players only; everyone else is off the ballot this time.
function tiedOf(s) { const t = s.table, v = t.votes || {}, c = aliveOf(s).filter(p => !(t.immune || []).includes(p.id)), max = Math.max(0, ...c.map(p => v[p.id] || 0)); return max ? c.filter(p => (v[p.id] || 0) === max).map(p => p.id) : [] }
function revoteTied() { act(s => { const tied = tiedOf(s); if (tied.length < 2) return; const t = s.table; t.revote = tied; t.ballots = {}; t.last = null; t.stage = "votes"; tally(s); return { log: "Revote: " + tied.map(id => P2(s, id).name).join(" v ") } }) }
function revoteAll() { act(s => { const t = s.table; t.revote = null; t.ballots = {}; t.last = null; t.stage = "votes"; tally(s) }, "Revote — everyone") }
function clearBallots() { act(s => { s.table.ballots = {}; s.table.last = null; tally(s) }, "Votes cleared — revote") }
// Only the Champion — blade and shield — may buy immunity, before the first board: both are laid down, so their vote
// counts once and nothing protects them tonight.
const championArmed = s => { const w = championOf(s), p = w && P2(s, w); return p && p.shield ? w : null };
function championImmunity() {
  act(s => {
    const t = s.table, id = championArmed(s), p = id && P2(s, id); if (!t || !p || t.stage === "exile" || Object.keys(t.ballots || {}).length) return;
    p.shield = null; s.champion = null; t.immune = t.immune || []; if (!t.immune.includes(id)) t.immune.push(id); t.laid = id;
    for (const k in t.ballots || {}) if (t.ballots[k] === id) delete t.ballots[k];
    tally(s);
    return { log: p.name + " laid down shield and blade — immune from this vote, unprotected tonight" };
  });
}
function exile(id) {
  const p0 = P(id); if (!p0 || (state.table && (state.table.immune || []).includes(id))) return;
  confirmSheet("Exile " + p0.name + "?", "The TV announces it straight away. Undo brings them back if a board was misread.", "Exile " + p0.name, () => act(s => {
    const p = P2(s, id), t = s.table, v = t.votes || {}, n = Object.values(t.ballots || {}).filter(x => x !== "blank").length;
    const mine = v[id] || 0, others = Object.entries(v).filter(e => e[0] !== id).map(e => e[1]), second = others.length ? Math.max(...others) : 0;
    // how the table got here, for the host's lines and the TV's eyebrow
    t.margin = !n ? null : !others.length && n >= 3 ? "unanimous" : mine > second ? (mine - second <= 1 ? "close" : "clear") : "tie";
    // the blade decided it: its extra vote was on them, and without it they wouldn't have had the most
    const dg = bladeLive(s); t.bladeKill = !!(dg && (t.ballots || {})[dg] === id && mine - 1 <= second);
    if (t.bladeKill) { s.stats = s.stats || {}; s.stats.bladeKills = s.stats.bladeKills || {}; s.stats.bladeKills[dg] = (s.stats.bladeKills[dg] || 0) + 1 }
    s.voteLog = (s.voteLog || []).concat([{ round: s.round, ballots: { ...(t.ballots || {}) }, champion: championOf(s), exiled: id, role: p.role }]).slice(-20);
    p.alive = false; p.shield = null; s.mission = null; t.exiled = id; t.step = 0; t.talkEnd = null; t.roll = null; s.phase = "reveal";
    if (t.bladeKill) return { log: "Exiled: " + p0.name + " (" + p0.role + ") — the blade decided it" };
  }, "Exiled: " + p0.name + " (" + p0.role + ")"));
}
// A running count for the host to say when it matters: dead level, one in it, or already beyond reach.
function tableNudge(s) {
  const t = s.table; if (!t || t.stage !== "votes") return null;
  const A = aliveOf(s), w = championOf(s), bal = t.ballots || {}, left = A.filter(p => !(p.id in bal)), nIn = A.length - left.length;
  const remaining = left.length + (w ? 1 : 0), v = t.votes || {};
  const ranked = A.filter(p => v[p.id]).sort((a, b) => v[b.id] - v[a.id]);
  if (nIn < 3 || !left.length || !ranked.length) return null;
  const top = ranked[0], sec = ranked[1], a = v[top.id], b = sec ? v[sec.id] : 0, gap = a - b, k = nIn % 3, bd = numWord(left.length) + (left.length === 1 ? " board" : " boards");
  const nb = x => numWord(x) + (x === 1 ? " vote" : " votes");
  if (sec && gap === 0) return ["A count. " + cap1(nb(a)) + " for " + top.name + ", " + nb(b) + " for " + sec.name + ". " + cap1(bd) + " to go — the next one could seal it.", "Level. " + top.name + " and " + sec.name + ", " + numWord(a) + " apiece. " + cap1(bd) + " left. Whoever turns next may decide it.", "Let's take stock: " + top.name + " " + numWord(a) + ", " + sec.name + " " + numWord(b) + ". Dead level, with " + bd + " still face down."][k];
  if (sec && gap === 1) return ["A count. " + top.name + " " + numWord(a) + ", " + sec.name + " " + numWord(b) + ". One vote in it, and " + bd + " to come.", "It's close. " + top.name + " on " + numWord(a) + ", " + sec.name + " one behind. " + cap1(bd) + " left.", "One vote between them: " + top.name + " " + numWord(a) + ", " + sec.name + " " + numWord(b) + ". Nobody breathe."][k];
  if (gap > remaining && a >= 3) return ["That's " + nb(a) + " for " + top.name + ". There are not enough boards left to save them.", top.name + " has " + numWord(a) + ". Whatever the last " + bd + " say, it's decided."][k % 2];
  return null;
}
function revealRole() { act(s => { s.table.step = 1; s.table.roll = null; if (!isFinal(s)) P2(s, s.table.exiled).revealed = true }) }
function endCheck() { const t = cloaks().length, f = candles().length; return t === 0 || t >= f }

/* ---------- night ---------- */
function questOptions(s) {
  s.usedQuests = s.usedQuests || [];
  const ok = eligible("QUESTS", QUESTS.length);
  let free = ok.filter(i => !s.usedQuests.includes(i)); if (free.length < 10) free = ok;
  const F = s.players.filter(p => p.alive && p.role === "candle"), Tr = s.players.filter(p => p.alive && p.role === "cloak");
  return shuffle(free).slice(0, 10).map(i => {
    const t = Tr.length ? Tr[Math.floor(Math.random() * Tr.length)].name : "", targeted = /\{T\}/.test(QUESTS[i]);
    const text = QUESTS[i].replace(/^\{T\}:\s*/, "").replace(/\{T\}/g, t);
    return { i, text, target: targeted ? t : null, poison: /poisoned player/i.test(QUESTS[i]) };
  });
}
function questPick(i) { act(s => { const o = s.night.questOpts.find(x => x.i === i); if (!o) return; s.night.quest = o.text; s.night.questTarget = o.target }) }
function questResolve(ok) {
  act(s => {
    if (!s.quest || s.quest.resolved) return;
    s.quest.resolved = true; s.quest.ok = ok; s.questTally = s.questTally || { done: 0, failed: 0 };
    if (ok) s.questTally.done++; else { s.questTally.failed++; s.pot = Math.max(0, s.pot - 50) }
    return { log: "Side-quest " + (ok ? "completed" : "failed — pot −50") };
  });
}
// A big table loses more than one a night, so an evening still reaches the final (see roundsFrom). Only a kill night has
// more than one; each victim is its own pass of the script.
const nightKills = s => { const a = aliveOf(s).length, rt = s.rt && s.rt.round === s.round ? s.rt : null; return Math.max(1, Math.min(rt ? rt.kills || 1 : killsAt(a), killsAt(a), a - 5)) };
const killsOf = n => n && n.mode === "murder" ? n.kills || 1 : 1;
function nextVictim() {
  act(s => {
    const n = s.night; if (!n || n.mode !== "murder" || !n.victimId || (n.pass || 0) >= killsOf(n) - 1) return;
    n.victims = (n.victims || []).concat([n.victimId]); n.victimId = null; n.pass = (n.pass || 0) + 1; n.step = 0;
    return { log: "Night: victim " + n.pass + " of " + killsOf(n) + " chosen" };
  });
}
function startNight() {
  if (state && !isFinal(state) && state.players.length > 5 && aliveOf(state).length <= 5) { toast("Five left: no night. The final round is next — its Reckoning takes five to four."); return nextRound(true) }
  act(s => {
    s.phase = "night"; s.mission = null; s.mingle = null;
    s.night = {
      mode: autoMode(s), step: 0, targetId: null, targetName: null, answer: null, victimId: null, kills: nightKills(s), pass: 0, victims: [],
      quest: null, questTarget: null, questOpts: s.questsOn === false ? [] : questOptions(s), confirmed: false
    };
    s.quest = null;
    // the plan hands the Cloaks a side-quest every night it's on; the host can change it or take it away
    const qo = (s.night.questOpts || []).find(o => !o.poison || s.night.mode === "murder"); if (qo) { s.night.quest = qo.text; s.night.questTarget = qo.target }
    return { log: "Night " + s.round + " started" };
  });
}
// What the night should be, by the plan: a lone Cloak facing four or more Candles gets one Conversion, then (if refused) one
// Bargain; every other night is a kill. Only the kinds switched on at setup are offered.
function autoMode(s) {
  const r = rulesIn(s), a = aliveOf(s), t = a.filter(p => p.role === "cloak").length, f = a.length - t;
  const tries = s.players.flatMap(p => [...(p.converted ? [p.converted] : []), ...(p.refused || [])]);
  if (t !== 1 || f < 4) return "murder";
  if (!tries.some(x => x.mode === "convert") && r.convert) return "convert";
  if (!tries.some(x => x.mode === "bargain") && r.bargain) return "bargain";
  return "murder";
}
const modeOn = (s, k) => k === "murder" || !!rulesIn(s)[k];
const modeLabel = (k, s) => k === "murder" ? (killOf(s) === "murder" ? "Murder" : "Poison") : MODES[k].label;
// the Candles a quest names is chosen when the Cloaks read it: never tonight's victim or target
function resolveQuest(s) {
  const n = s.night; if (!n || !n.quest || !/\{F\}/.test(n.quest)) return;
  const avoid = [n.victimId, n.targetId, ...(n.victims || [])], F = s.players.filter(p => p.alive && p.role === "candle" && !avoid.includes(p.id)), f = F.length ? F[Math.floor(Math.random() * F.length)].name : "a Candle";
  n.quest = n.quest.replace(/\{F\}/g, f); if (s.quest) s.quest.text = n.quest;
}
function beginNight() {
  act(s => {
    const n = s.night; n.confirmed = true; n.step = 0;
    if (n.quest && n.mode !== "murder") { const o = (n.questOpts || []).find(x => x.text === n.quest); if (o && o.poison) { n.quest = null; n.questTarget = null } } // no poisoning tonight
    if (n.quest) { const o = (n.questOpts || []).find(x => x.text === n.quest); s.usedQuests = s.usedQuests || []; if (o && !s.usedQuests.includes(o.i)) s.usedQuests.push(o.i); s.quest = { text: n.quest, target: n.questTarget, resolved: false } }
    return { log: "Night: " + MODES[n.mode].label + (n.quest ? " + quest" : "") };
  });
}
function finishNight() {
  act(s => {
    const n = s.night; let m, log;
    if (n.mode === "murder") {
      const vs = [...(n.victims || []), n.victimId].map(id => id && P2(s, id)).filter(v => v && v.alive), dead = [], logs = [];
      for (const v of vs) {
        if (s.players.length > 5 && aliveOf(s).length <= 5) { logs.push(v.name + " spared: five left"); continue } // someone left mid-night
        if (v.shield || (s.witness && s.witness.id === v.id && !s.witness.fake)) { logs.push("Murder failed: " + v.name + (v.shield ? " shielded" : " is the Witness")); s.stats = s.stats || {}; s.stats.saved = (s.stats.saved || []).concat([{ id: v.id, round: s.round }]) }
        else { v.alive = false; dead.push(v); logs.push("Murdered: " + v.name) }
      }
      if (!vs.length) { m = { kind: "quiet" }; log = "Night ended with no victim picked" }
      else if (!dead.length) { m = { kind: "shield" }; log = logs.join(" · ") }
      else { m = { kind: "murder", name: andList(dead.map(v => v.name)), victimId: dead[0].id, victimIds: dead.map(v => v.id), many: dead.length > 1, saved: vs.length > dead.length }; log = logs.join(" · ") }
    } else {
      const t = n.targetId && P2(s, n.targetId);
      if (!t || !t.alive || !n.answer) { m = { kind: "quiet" }; log = "Night ended with no answer recorded" }
      else if (n.answer === "yes") {
        t.role = "cloak"; t.converted = { round: s.round, mode: n.mode }; m = { kind: "convert" }; log = t.name + " accepted " + n.mode + " — now a cloak";
        if (s.witness && s.witness.id === t.id && !s.witness.used) { s.witness.used = true; log += " (Witness voided: they turned)" }
      }
      else if (n.mode === "bargain") {
        t.refused = (t.refused || []).concat([{ round: s.round, mode: n.mode }]);
        if (t.shield || (s.witness && s.witness.id === t.id && !s.witness.fake)) { m = { kind: "shield" }; log = t.name + " refused bargain but was shielded"; s.stats = s.stats || {}; s.stats.saved = (s.stats.saved || []).concat([{ id: t.id, round: s.round }]) }
        else { t.alive = false; m = { kind: "murder", name: t.name, victimId: t.id }; log = t.name + " refused bargain — murdered" }
      }
      else { t.refused = (t.refused || []).concat([{ round: s.round, mode: n.mode }]); m = { kind: "convert", refused: true }; log = t.name + " refused " + n.mode }
    }
    if (m.kind === "convert") { m.kind = "quiet"; m.convert = true } // the host's log has it; the room hears nothing
    if (m.kind === "murder") { s.stats = s.stats || {}; s.stats.murders = (s.stats.murders || []).concat((m.victimIds || [m.victimId]).map(id => ({ id, round: s.round }))) }
    m.revealed = false; m.lastEnd = null; m.lastDone = false;
    s.morning = m; s.phase = "morning"; s.night = null;
    return { log };
  });
}

/* ---------- rounds, advice ---------- */
function nextRound(final) {
  act(s => {
    if (ghostsOf(s).length) s.ghostIntroDone = true;
    s.round++; if (final) s.finalRound = s.round; s.roundMissions = 0;
    // five left (in a game that started bigger) and it's the final: one last table with no confessions, then End or Exile
    let auto = false; if (!s.finalRound && s.players.length > 5 && aliveOf(s).length <= 5) { s.finalRound = s.round; auto = true }
    const planned = rulesIn(s).rounds; if (!s.finalRound && planned && s.round >= planned) s.finalRound = s.round;
    s.phase = "day"; s.morning = null; s.mission = null; s.mingle = null; s.night = null;
    s.players.forEach(p => p.shield = null); s.champion = null; snapRound(s);
    return { log: "Round " + s.round + (isFinal(s) ? (auto ? " (final — five or fewer left)" : " (final)") : "") + " begins" };
  });
}
// Dinner is one sitting: once served, the option goes away. Served from dawn, it leads straight into the next round.
function startBreak(kind, then) { act(s => { const din = kind === "dinner"; s.phase = "mingle"; s.mingle = { end: null, dur: din ? 1500000 : 600000, kind, then: then || null }; if (din) s.dinnerDone = true }, kind === "dinner" ? "Dinner break" : "Mingle") }
function declareFinal() { act(s => { s.finalRound = (s.phase === "day" && !(s.roundMissions || 0)) ? s.round : s.round + 1; return { log: "Final round: round " + s.finalRound } }) }
function pace() {
  const s = state; if (!s.startedAt || s.round < 2) return null;
  const el = (now() - s.startedAt) / 60000, target = (s.hours || 4) * 60, rounds = Math.max(1, s.round - 1), perRound = s.round > 1 ? el / rounds : 55;
  const a = alive().length, left = isFinal(s) ? 1 : roundsFrom(a), eta = el + left * perRound, diff = eta - target;
  return { el, target, perRound, left, eta, diff, label: Math.abs(diff) < 20 ? "on pace" : diff > 0 ? "running " + Math.round(diff) + " min long" : Math.round(-diff) + " min short" };
}
function advice() {
  const t = cloaks().length, f = candles().length, a = t + f;
  const which = state.phase === "day" && !(state.roundMissions || 0) ? "this" : "the next", callIt = state.finalRound && state.finalRound > state.round ? " The next round is already the final." : " Make " + which + " round the final: one mission, then the Reckoning votes until four are left, then End or Exile.";
  if (t === 0) return isFinal(state) ? { lvl: "end", text: "No Cloaks left, but the table doesn’t know it. Run End or Exile: a unanimous END and the Candles win; every EXILE costs them another Candle." } : { lvl: "final", text: "No Cloaks left, but the table doesn’t know it." + callIt };
  if (t >= f) return isFinal(state) ? { lvl: "end", text: "Cloaks equal or outnumber the Candles (" + t + " v " + f + "), but the table doesn’t know it. Run End or Exile: a unanimous END and the Cloaks win." } : { lvl: "final", text: "Cloaks equal or outnumber the Candles (" + t + " v " + f + "), but the table doesn’t know it." + callIt };
  if (isFinal(state)) return { lvl: "final", text: "Final round in play: one mission, then the Reckoning votes — no reveals — until four are left. Then End or Exile: the vote decides when it ends." };
  if (state.finalRound && state.finalRound > state.round) return { lvl: "final", text: "Next round is the final. Finish this round normally." };
  if (a <= 4) return { lvl: "final", text: a + " left (" + plural(t, "Cloak") + "). Make " + which + " round the final: one mission, then the Reckoning votes until four are left, then End or Exile." };
  const rk = ["convert", "bargain"].filter(k => modeOn(state, k)).map(k => MODES[k].label);
  if (t === 1 && f >= 4 && rk.length) return { lvl: "convert", text: "One Cloak left against " + f + ". Your plan allows " + (rk.length > 1 ? "a Conversion, then a Bargain" : rk[0] === "Conversion" ? "a Conversion" : "a Bargain") + " — the phone sets the night for it, or the endgame dies early." };
  if (a <= 6) return { lvl: "soon", text: a + " left, " + t + " Cloaks. One more normal round, then call the final. Two missions this round if the night is young." };
  const left = Math.max(1, roundsFrom(a) - 1);
  return { lvl: "ok", text: a + " at the table, " + t + " Cloaks. Poison tonight. About " + plural(left, "round") + " before the final" + (left <= 3 ? " — run two missions per round to fill the evening." : ".") };
}

/* ---------- ghosts ---------- */
function ghostScores(s) {
  const g = s.ghosts || {};
  return Object.keys(g).map(gid => { const p = P2(s, g[gid].pick), gh = P2(s, gid); return gh && gh.role !== "cloak" ? { p: gh, hits: p && p.role === "cloak" ? 1 : 0, pickName: p ? p.name : "?" } : null }).filter(Boolean).sort((a, b) => b.hits - a.hits);
}
let handoff = null;
function ghostGuess(gid, pid) { if (!pid || (P(gid) && P(gid).role === "cloak")) return; handoff = { kind: "return" }; act(s => { s.ghosts = s.ghosts || {}; if (s.ghosts[gid]) return; s.ghosts[gid] = { pick: pid, round: s.round }; return { log: "Ghost " + P2(s, gid).name + " gave a verdict" } }) }

/* ---------- endgame ---------- */
// From here on nobody's role is shown until the ceremony: the end game is the final, whenever it began.
function openEndvote() { act(s => { s.phase = "endvote"; s.mission = null; s.mingle = null; if (!isFinal(s)) s.finalRound = s.round; s.endvote = { votes: {}, order: null, revealed: 0, count: null, result: null } }, "End-game vote") }
function castVote(pid, v) { handoff = { kind: "return" }; act(s => { s.endvote.votes[pid] = v }) }
function startEndReveal() {
  act(s => {
    const v = s.endvote, A = aliveOf(s), ends = A.filter(p => v.votes[p.id] === "end"), bans = A.filter(p => v.votes[p.id] !== "end");
    bans.forEach(p => v.votes[p.id] = "exile");
    v.order = [...shuffle(ends).map(p => p.id), ...shuffle(bans).map(p => p.id)]; v.revealed = 0; v.count = bans.length; v.result = bans.length ? "exile" : "end";
    return { log: "End-game vote: " + (bans.length ? bans.length + " exile" : "unanimous end") };
  });
}
// The ceremony: every survivor's seal is turned by the host, one at a time, in whatever order they choose.
// Nothing about roles reaches the TV until the host taps a name.
const newFinal2 = () => ({ votes: {}, revealed: 0, order: null, showRoles: false, cloakIds: null, ghostHits: null, ghostRound: null, shown: [] });
function ceremonyDone(s) { const f = s.final2; return !!f && aliveOf(s).every(p => (f.shown || []).includes(p.id)) }
// Opening the ceremony again would un-turn seals the room has already seen, so from inside it this does nothing.
function startCeremony(log) { if (state && (state.phase === "final2" || state.phase === "final")) return; act(s => { s.phase = "final2"; s.final2 = newFinal2(); s.mission = null; s.table = null; s.night = null; s.mingle = null; return { log: log || "The final ceremony" } }) }
const openFinal2 = () => startCeremony("Final two");
// Hold to drum: while the host's finger is down the TV rolls the drums; letting go turns the card.
let holding = null, holdEndAt = 0, holdTimer = null;
function holdStart(kind, id, ev) {
  if (holding || Date.now() - holdEndAt < 700) return; // a quick second tap after a seal turns lands on the next seal: not a new hold
  holding = { kind, id, pid: ev && ev.pointerId !== undefined ? ev.pointerId : null };
  clearTimeout(holdTimer); holdTimer = setTimeout(() => holdEnd(true), 15000); // the drums stop at 15 s on the TV too
  act(s => { if (kind === "seal" && s.final2) s.final2.roll = { id, t: now() }; else if (kind === "reveal" && s.table) s.table.roll = now() });
}
function holdEnd(cancel, ev) {
  const h = holding; if (!h) return;
  if (ev && h.pid !== null && ev.pointerId !== undefined && ev.pointerId !== h.pid) return; // another finger: not this hold
  holding = null; clearTimeout(holdTimer); holdEndAt = Date.now();
  if (cancel) return act(s => { if (s.table) s.table.roll = null; if (s.final2) s.final2.roll = null });
  if (h.kind === "seal") revealSurvivor(h.id); else revealRole();
}
// a plain click (keyboard, or a tap the pointer events missed) still reveals, once
// (a second Enter, like a second tap, is swallowed for a moment rather than pressing whatever button comes next)
const holdClick = (kind, id) => { if (Date.now() - holdEndAt < 900 || holding) return; holdEndAt = Date.now(); kind === "seal" ? revealSurvivor(id) : revealRole() };
// Letting go redraws the screen under the finger: the click that follows the release must not land on whatever
// button is there now (the next seal, "the first Ghost"), so clicks are swallowed for a moment after a hold ends.
if (typeof document !== "undefined") {
  document.addEventListener("pointerup", e => holdEnd(false, e)); document.addEventListener("pointercancel", e => holdEnd(true, e));
  // a phone locked or switched away mid-hold: drop the hold rather than let a later tap finish it
  document.addEventListener("visibilitychange", () => { if (document.hidden) holdEnd(true) }); window.addEventListener("blur", () => holdEnd(true));
  document.addEventListener("click", e => { if (Date.now() - holdEndAt < 700) { e.stopPropagation(); e.preventDefault() } }, true);
}
function revealSurvivor(id) {
  act(s => {
    const f = s.final2, p = P2(s, id); if (!f) return; f.roll = null; f.shown = f.shown || []; if (!p || !p.alive || f.shown.includes(id)) return;
    p.revealed = true; f.shown.push(id);
    if (ceremonyDone(s)) { const ts = aliveOf(s).filter(q => q.role === "cloak"); f.showRoles = true; f.cloakIds = ts.map(q => q.id) }
    return { log: "Revealed: " + p.name + " (" + p.role + ")" };
  });
}
function castTake(pid, v) { handoff = { kind: "return" }; act(s => { const f = s.final2, g = f.ghostRound; if (g && !g.order && g.ids.includes(pid)) g.votes[pid] = v; else f.votes[pid] = v }) }
function startTakeReveal() {
  act(s => {
    const f = s.final2, ts = aliveOf(s).filter(p => p.role === "cloak");
    ts.forEach(p => { if (!f.votes[p.id]) f.votes[p.id] = "share" });
    f.order = shuffle(ts.map(p => p.id)); f.revealed = 0;
    f.ghostHits = ghostScores(s).filter(x => x.hits).map(x => x.p.name);
    return { log: "Share or take: revealing" };
  });
}
// End-of-game awards, straight from the record: votes, missions, shields, the night. Only awards with a clear winner
// (two at most) are given, six at most, in this order.
// Up to twelve awards, one per person, from the night's record. Each goes to the best-placed player who hasn't already
// had one. The count is trimmed to fill a grid — 2, 4, 6, 8 or 12 — and the list is revealed smallest to biggest.
function awardsOf(s) {
  const Q = id => P2(s, id), log = s.voteLog || [], st = s.stats || {}, out = [], taken = new Set();
  const cloakAt = (p, r) => !!p && p.role === "cloak" && (!p.converted || p.converted.round < r);
  const add = (o, k) => { o[k] = (o[k] || 0) + 1 }, hitT = {}, hitF = {}, against = {}, king = {}, lone = {}, stab = {};
  for (const v of log) {
    const cnt = {}; for (const tg of Object.values(v.ballots || {})) if (tg !== "blank") cnt[tg] = (cnt[tg] || 0) + 1;
    for (const [voter, tg] of Object.entries(v.ballots || {})) {
      const t = tg !== "blank" && Q(tg), vo = Q(voter); if (!t || !vo) continue;
      add(against, tg); if (tg === v.exiled) add(king, voter); if (cnt[tg] === 1) add(lone, voter);
      // a Cloak's board says nothing about their eye — unless it names another Cloak
      if (cloakAt(vo, v.round)) { if (cloakAt(t, v.round)) add(stab, voter); continue }
      if (cloakAt(t, v.round)) add(hitT, voter); else add(hitF, voter);
    }
  }
  const free = p => !!p && !taken.has(p.id);
  const best = (o, min, ok) => {
    const e = Object.entries(o || {}).filter(([id, n]) => n >= min && free(Q(id)) && (!ok || ok(Q(id)))); if (!e.length) return null;
    const top = Math.max(...e.map(x => x[1])), w = e.filter(x => x[1] === top).map(x => Q(x[0]));
    return w.length <= 2 ? { ps: w, n: top } : null;
  };
  const give = (title, icon, ps, why) => { ps = (ps || []).filter(free); if (!ps.length || out.some(a => a.title === title)) return; ps.forEach(p => taken.add(p.id)); out.push({ title, icon, names: ps.map(p => p.name), why }) };
  const times = n => n === 1 ? "once" : n === 2 ? "twice" : numWord(n) + " times", rd = r => "round " + numWord(r);
  let b = best(hitT, 1, p => p.role === "candle"); if (b) give("The Sharpest Eye", "eye", b.ps, "chalked a Cloak’s name " + times(b.n));
  const ts = s.players.filter(p => p.role === "cloak"), tAlive = ts.filter(p => p.alive && free(p));
  if (tAlive.length) { const low = Math.min(...tAlive.map(p => against[p.id] || 0)), w = tAlive.filter(p => (against[p.id] || 0) === low); if (w.length <= 2) give("The Grand Deceiver", "blade", w, low ? "reached the end with only " + (low === 1 ? "one vote" : numWord(low) + " votes") + " against them" : "reached the end without a single vote against them") }
  else if (ts.length) { const lastR = p => { const e = log.filter(v => v.exiled === p.id); return e.length ? e[e.length - 1].round : 0 }, cand = ts.filter(free), top = cand.length ? Math.max(...cand.map(lastR)) : 0; if (top > 1) { const w = cand.filter(p => lastR(p) === top); if (w.length <= 2) give("The Grand Deceiver", "blade", w, "fooled the table until " + rd(top)) } }
  b = best(st.bladeKills, 1); if (b) give("The Deciding Blade", "blade", b.ps, "whose blade decided an exile");
  const turned = s.players.filter(p => p.role === "cloak" && p.converted && free(p)); if (turned.length && turned.length <= 2) give("The Turncoat", "handshake", turned, turned.length === 1 ? (turned[0].converted.mode === "bargain" ? "chose the Cloaks over the poison in " : "joined the Cloaks in ") + rd(turned[0].converted.round) : "switched sides in the night");
  const refused = s.players.filter(p => (p.refused || []).length && p.role === "candle" && free(p)); if (refused.length && refused.length <= 2) give("Couldn’t Be Bought", "shield", refused, "said no to the Cloaks" + (refused.length === 1 ? " in " + rd(refused[0].refused[0].round) : ""));
  const witnesses = ghostScores(s).filter(x => x.hits && free(x.p)); if (witnesses.length && witnesses.length <= 2) give("The Ghost Who Saw", "ghost", witnesses.map(x => x.p), witnesses.length === 1 ? "named " + witnesses[0].pickName + " from beyond the table" : "named a Cloak from beyond the table");
  const sr = s.witness && s.witness.metId && !s.witness.fake && Q(s.witness.id); if (sr) give("The Prophet", "eye", [sr], "met " + (Q(s.witness.metId) ? Q(s.witness.metId).name : "a Cloak") + " face to face in the dark");
  b = best(stab, 1); if (b) give("The Backstabber", "blade", b.ps, "chalked a fellow Cloak’s name " + times(b.n));
  const sv = (st.saved || []).map(x => Q(x.id)).find(free); if (sv) give("The Narrow Escape", "shield", [sv], "the poison came for them — and a shield said no");
  const fb = (st.murders || [])[0]; if (fb && Q(fb.id)) give("First Blood", "chalice", [Q(fb.id)], "the Cloaks’ very first choice");
  const mt = log.find(v => v.role === "candle" && free(Q(v.exiled))); if (mt) give("The Martyr", "table", [Q(mt.exiled)], "exiled in " + rd(mt.round) + " — Candle all along");
  b = best(st.wins, 1); if (b) give("Mission Machine", "crown", b.ps, "won " + (b.n === 1 ? "a mission" : numWord(b.n) + " missions"));
  b = best(king, 2); if (b) give("The Kingmaker", "crown", b.ps, "chalked the name that went " + times(b.n));
  b = best(against, 2); if (b) give("The Lightning Rod", "table", b.ps, numWord(b.n) + " boards bore their name");
  b = best(st.wrongs, 1); if (b) give("The Wild Card", "hourglass", b.ps, "shouted " + (b.n === 1 ? "a wrong answer" : numWord(b.n) + " wrong answers") + " with total confidence");
  b = best(hitF, 2, p => p.role === "candle"); if (b) give("Barking Up the Wrong Tree", "raven", b.ps, "chalked an innocent name " + times(b.n));
  b = best(st.shields, 2); if (b) give("The Shield Bearer", "shield", b.ps, "held " + numWord(b.n) + " shields");
  b = best(st.score, 1); if (b) give("The Point Hoarder", "scales", b.ps, "scored " + numWord(b.n) + " mission points all night");
  b = best(lone, 2); if (b) give("The Lone Wolf", "raven", b.ps, "the only board with that name, " + times(b.n));
  const alive = s.players.filter(p => p.alive && !p.left && free(p));
  if (alive.length) { const low = Math.min(...alive.map(p => against[p.id] || 0)), w = alive.filter(p => (against[p.id] || 0) === low); if (w.length <= 2) give("The Untouchable", "shield", w, low ? "reached the end with only " + (low === 1 ? "one board" : numWord(low) + " boards") + " against them" : "reached the end without their name ever chalked") }
  const lastF = s.players.filter(p => p.alive && p.role === "candle" && free(p)); if (s.winner === "cloaks" && lastF.length && lastF.length <= 2) give("Last Candle Burning", "candle", lastF, "still at the table when the Cloaks won");
  const n = [12, 8, 6, 4, 2].find(k => k <= out.length) || out.length;
  return out.slice(0, n).reverse();
}
function rpsWin(id) { act(s => { const r = s.rps; if (!r || !r.ids.includes(id)) return; r.winner = id; return { log: "Rock, paper, scissors: " + P2(s, id).name + " takes the prize home" } }) }
function startGhostRound() { act(s => { s.final2.ghostRound = { ids: ghostScores(s).filter(x => x.hits).map(x => x.p.id), votes: {}, order: null, revealed: 0 } }, "Ghosts' share or take") }
function startGhostReveal() { act(s => { const g = s.final2.ghostRound; g.ids.forEach(id => { if (!g.votes[id]) g.votes[id] = "share" }); g.order = shuffle(g.ids.slice()); g.revealed = 0 }) }
function finishGame() {
  // From anywhere but a finished ceremony, "end the game" only opens the ceremony: the host reveals, nothing is shown by itself.
  if (!(state.phase === "final2" && ceremonyDone(state))) return startCeremony();
  const lt = cloaks();
  if (lt.length >= 2 && !(state.final2.order && state.final2.revealed >= state.final2.order.length)) return startCeremony();
  act(s => {
    const lt = aliveOf(s).filter(p => p.role === "cloak");
    s.phase = "final"; s.winner = lt.length ? "cloaks" : "candles"; s.players.forEach(p => p.revealed = true); s.prizeTo = null;
    // prizeIds: who won it. There is one prize: two or more winners play rock, paper, scissors for it (s.rps)
    const to = (ids, label) => { s.prizeIds = ids; s.prizeTo = label || andList(ids.map(id => P2(s, id).name)); s.potEach = ids.length ? Math.floor((s.pot || 0) / ids.length) : 0 };
    if (lt.length >= 2) {
      const f = s.final2, st = lt.filter(p => f.votes[p.id] === "take");
      if (st.length === 1) to([st[0].id]);
      else if (st.length === 0) to(lt.map(p => p.id));
      else {
        const g = f.ghostRound, gs = ghostScores(s).filter(x => x.hits);
        if (g && g.order) { const gst = g.ids.filter(id => g.votes[id] === "take"); if (gst.length === 1) to([gst[0]], P2(s, gst[0]).name + " — a Ghost"); else if (gst.length === 0) to(g.ids.slice(), andList(g.ids.map(id => P2(s, id).name)) + " — the Ghosts"); else to([], hostOf(s) + " — the Ghosts grabbed at each other") }
        else if (gs.length === 1) to([gs[0].p.id], gs[0].p.name + " — a Ghost who named a Cloak");
        else if (gs.length >= 2) to(gs.map(x => x.p.id), andList(gs.map(x => x.p.name)) + " — the Ghosts who named a Cloak");
        else to([], hostOf(s) + " — nobody earned it");
      }
    }
    else if (lt.length === 1) to([lt[0].id]);
    else { const A = aliveOf(s); to(A.map(p => p.id), A.length ? "the Candles: " + andList(A.map(p => p.name)) : hostOf(s) + " — nobody left standing") }
    s.rps = s.prizeIds.length >= 2 ? { ids: s.prizeIds.slice(), winner: null } : null;
    s.awards = awardsOf(s); s.finalStep = 0; s.awardShown = 0; // worked out here, from the full record (the TV never sees the vote history)
    return { log: "Game over — " + s.winner + " win" };
  });
}

/* ---------- housekeeping ---------- */
// seats follow the table clockwise; the TV's Reckoning and candle rail use this order
function moveSeat(id, d) { act(s => { const a = s.players, i = a.findIndex(p => p.id === id); let j = i + d; while (j >= 0 && j < a.length && a[j].left) j += d; if (i < 0 || j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]] }) }
function renamePlayer(id, nn) {
  if (!nn || !nn.trim()) return;
  // two players with one name would be indistinguishable on the TV, in the votes and the awards
  const clash = state && state.players.find(p => p.id !== id && p.name.toLowerCase() === nn.trim().slice(0, NAMEMAX).toLowerCase());
  if (clash) { toast("Someone is already called " + clash.name + " — pick another name."); return }
  act(s => {
    const p = P2(s, id), old = p.name; p.name = nn.trim().slice(0, NAMEMAX);
    if (s.morning && s.morning.victimId === id) s.morning.name = p.name;
    if (s.night && s.night.targetId === id) s.night.targetName = p.name;
    return { log: old + " renamed to " + p.name };
  });
}
function playerLeft(id) {
  act(s => {
    const p = P2(s, id); p.alive = false; p.left = true; p.shield = null;
    const m = s.mission;
    if (m) { m.secIds = (m.secIds || []).filter(x => x !== id); if (m.winId === id) m.winId = null; if (m.standing) m.standing = m.standing.filter(x => x !== id); if (m.out) m.out = m.out.filter(x => x !== id); if (m.right) m.right = m.right.filter(x => x !== id); if (m.tellerId === id) { m.tellerId = null; m.tstage = null; m.timerEnd = null } m.picks = (m.picks || []).filter(x => x !== id); if (m.witnessId === id) m.witnessId = null; if (m.actorId === id) m.actorId = null; if (m.shouter === id) m.shouter = null }
    if (s.witness && s.witness.id === id) s.witness.used = true;
    const n = s.night;
    if (n) {
      const involved = n.victimId === id || n.targetId === id;
      if (n.victimId === id) n.victimId = null;
      if ((n.victims || []).includes(id)) n.victims = n.victims.filter(x => x !== id);
      if (n.targetId === id) { n.targetId = null; n.targetName = null; n.answer = null }
      n.step = involved ? 0 : Math.min(n.step || 0, nightScript(n, s).length - 1);
    }
    if (s.table) { const t = s.table; if (t.revote) { t.revote = t.revote.filter(x => x !== id); if (t.revote.length < 2) t.revote = null } if (t.ballots) { delete t.ballots[id]; for (const k in t.ballots) if (t.ballots[k] === id) delete t.ballots[k] } if (t.immune) t.immune = t.immune.filter(x => x !== id); if (t.last === id) t.last = null; tally(s) }
    if (s.champion && s.champion.id === id) s.champion = null;
    if (s.endvote) { delete s.endvote.votes[id]; if (s.endvote.order) { s.endvote = { votes: {}, order: null, revealed: 0, count: null, result: null } } }
    if (s.final2) { const f = newFinal2(); f.shown = aliveOf(s).filter(q => q.revealed && (s.final2.shown || []).includes(q.id)).map(q => q.id); s.final2 = f; if (ceremonyDone(s)) { const ts = aliveOf(s).filter(q => q.role === "cloak"); f.showRoles = true; f.cloakIds = ts.map(q => q.id) } }
    return { log: p.name + " left the party (" + p.role + ")" };
  });
}
