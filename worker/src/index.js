import { publicView } from "./public-view.js";
import { writeVerdict, tagOf, addWiped } from "./rules.js";
import { newRoom, newPass, isRoom, isPass, passKey, shownPass, newToken, newThanks } from "./codes.js";
import * as M from "./modern.js";
import { sendBooking } from "./booking-mail.js";
import * as AS from "./appstore.js";
import * as T from "./tiers.js";
import { surveyEmail, thanksEmail, sendFeedbackMail } from "./survey-mail.js";

// The Betrayal's server. Every party is its own room (a Table, to players): a Durable Object (GameState) keyed by a six-character room code,
// holding that party's one game. Rooms are made by redeeming a booking code ("pass" in the code and in storage), which
// lives in the Registry (one Durable Object for the whole service). A room is good for PASS_HOURS (default 48) from
// redemption and is deleted KEEP_DAYS (default 7) after that. Settings are Worker vars and secrets: see wrangler.toml and README.

const json = (body, status, extra) =>
  new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(extra || {}) } });
const text = (t, status) => new Response(t, { status, headers: { "Cache-Control": "no-store" } });
const hours = (env) => Math.max(0.0001, +(env.PASS_HOURS || 48));
const keepMs = (env) => Math.max(0.00001, +(env.KEEP_DAYS || 7)) * 86400000;
const pad = (n) => String(n).padStart(9, "0");
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
// time-ordered keys: the newest sort last
const gbp = (pence) => "£" + (pence / 100).toFixed(2);
// One at a time per key. A Durable Object answers one request at a time only until it awaits something other than its
// own storage (another object, a compression stream), so a check-then-act across such an await queues here.
async function queued(locks, key, fn) {
  const prev = locks.get(key) || Promise.resolve(), run = prev.then(fn, fn), tail = run.catch(() => {});
  locks.set(key, tail);
  try { return await run; } finally { if (locks.get(key) === tail) locks.delete(key); }
}
const tkey = (pre) => pre + String(Date.now()).padStart(15, "0") + Math.random().toString(36).slice(2, 6);
async function gzip(str) { const cs = new CompressionStream("gzip"), w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
async function gunzip(bytes) { const ds = new DecompressionStream("gzip"), w = ds.writable.getWriter(); w.write(bytes); w.close(); return new Response(ds.readable).text(); }
// the master error log (in the Registry): server exceptions, errors from players' browsers, refused webhooks, issue reports
const logErr = (env, e) => env && env.REGISTRY ? env.REGISTRY.get(env.REGISTRY.idFromName("registry")).fetch("https://registry/err", { method: "POST", body: JSON.stringify(e) }).catch(() => {}) : null;
// An email to ALERT_TO when someone writes in or reports a problem, with Reply-To set to them. Needs the MAIL send_email
// binding (wrangler.toml), Email Routing on the domain, and ALERT_TO verified as a destination address; otherwise it does
// nothing. Failures go to the error log, never to the customer.
const b64 = (s) => { const u = new TextEncoder().encode(s); let o = ""; for (let i = 0; i < u.length; i += 8192) o += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(o); };
async function alertMail(env, subject, body, replyTo) {
  if (!env || !env.MAIL || !env.ALERT_TO) return;
  try {
    const { EmailMessage } = await import("cloudflare:email");
    const host = env.SITE_HOST || "thebetrayal.co.uk", from = env.ALERT_FROM || "alerts@" + host, line = (x) => String(x).replace(/[\r\n]+/g, " ").slice(0, 200);
    const subj = line(subject), mime = [
      `From: The Betrayal <${from}>`, `To: ${env.ALERT_TO}`,
      ...(replyTo && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(replyTo) ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${/^[\x20-\x7e]*$/.test(subj) ? subj : "=?UTF-8?B?" + b64(subj) + "?="}`,
      `Message-ID: <${crypto.randomUUID()}@${host}>`, `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "",
      b64(body).replace(/.{76}/g, "$&\r\n")].join("\r\n");
    await env.MAIL.send(new EmailMessage(from, env.ALERT_TO, mime));
  } catch (e) { logErr(env, { src: "mail", msg: clip(e && e.message || e, 300) }); }
}
// Every save of a room's game is recorded (compressed) so a game can be replayed screen by screen from /admin; up to this
// many a room. Players' browsers also send a trail of what they tapped and any errors (EVMAX batches a room).
const RECMAX = 20000, EVMAX = 6000; // a room's batches of device logs: the app's phones and TVs log every game, a dozen at a time

// ---------------------------------------------------------------------------------------------------------------
// One party's game. Writes need the host PIN (the first PUT sets it). Reads without the PIN get the redacted TV view.
export class GameState {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env || {};
    this.strikes = new Map(); // wrong-PIN attempts per address, so a guest can't guess the PIN by brute force
    this.locks = new Map(); // see queued()
  }

  // Eight wrong PINs from one address inside a minute and that address waits a minute; thirty from everywhere
  // together and every wrong guess waits. IPv6 addresses count per /64. A correct PIN is never counted.
  limited(ip) {
    const nowT = Date.now(), fresh = (a) => a.filter((t) => nowT - t < 60000);
    const key = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
    const rec = fresh(this.strikes.get(key) || []); rec.push(nowT); this.strikes.set(key, rec);
    this.wrong = fresh(this.wrong || []); this.wrong.push(nowT);
    if (this.strikes.size > 500) for (const [k, v] of this.strikes) if (!fresh(v).length) this.strikes.delete(k);
    return rec.length > 8 || this.wrong.length > 30;
  }

  // a room past KEEP_DAYS after its pass ran out is deleted, game, switches and all
  // (a room with an issue report is kept until keepUntil, so its recording can still be replayed)
  async alarm() {
    const m = await this.storage.get("meta");
    if (m && m.keepUntil && m.keepUntil > Date.now()) return this.storage.setAlarm(m.keepUntil);
    await this.storage.deleteAll();
  }

  // one saved version of the game (or a wipe): a short line for the timeline, and the whole state, compressed
  async record(st, kind) {
    try {
      const n = ((await this.storage.get("recN")) || 0) + 1; if (n > RECMAX) return;
      const line = st && Array.isArray(st.log) ? st.log[0] : ""; // the game log is newest first
      const e = { recN: n, ["recl:" + pad(n)]: { t: Date.now(), kind, line: clip(line, 240), phase: st ? st.phase : null, round: st ? st.round : null, ver: st ? st.ver || 0 : null, gid: st ? st.gid : null } };
      if (st) e["recs:" + pad(n)] = await gzip(JSON.stringify(st));
      await this.storage.put(e);
    } catch (err) { logErr(this.env, { src: "server", where: "record", msg: err.message, stack: clip(err.stack, 1500) }); }
  }

  async fetch(req) {
    try { return await this.handle(req); }
    catch (err) { logErr(this.env, { src: "server", where: "room " + new URL(req.url).pathname, msg: err.message, stack: clip(err.stack, 1500) }); return json({ error: "Something went wrong on our side." }, 500); }
  }

  async handle(req) {
    const url = new URL(req.url), path = url.pathname;
    // made by the Registry when a pass is redeemed; never reachable from outside (the router only forwards /api/…)
    if (path === "/_init" && req.method === "POST") {
      const b = await req.json();
      if (!(await this.storage.get("meta"))) {
        await this.storage.put("meta", { room: b.room, expires: b.expires, pass: b.pass || null, created: Date.now(), ...(b.tier ? { tier: b.tier } : {}), ...(b.practice ? { practice: true } : {}) });
        await this.storage.setAlarm(b.expires + keepMs(this.env));
      }
      return json({ ok: true });
    }
    const meta = await this.storage.get("meta");
    if (!meta) return json({ error: "No game with that code" }, 404);
    // made by the Registry when a subscriber starts a new game: this room goes read-only now
    if (path === "/_close" && req.method === "POST") {
      if (Date.now() < meta.expires) { meta.expires = Date.now(); await this.storage.put("meta", meta); await this.storage.setAlarm(meta.expires + keepMs(this.env)); }
      return json({ ok: true });
    }
    // made by the Registry when the admin extends a Table: it closes later (and reopens if it had closed)
    if (path === "/_extend" && req.method === "POST") {
      const e = +((await req.json().catch(() => ({}))).expires) || 0;
      if (e > Date.now()) { meta.expires = e; await this.storage.put("meta", meta); await this.storage.setAlarm(Math.max(e + keepMs(this.env), meta.keepUntil || 0)); }
      return json({ ok: true, expires: meta.expires });
    }
    // an issue report was filed: keep the room (and its recording) at least this long
    if (path === "/_keep" && req.method === "POST") {
      const b = await req.json().catch(() => ({})), until = Math.min(Date.now() + 120 * 86400000, +b.until || 0);
      meta.keepUntil = Math.max(meta.keepUntil || 0, until); meta.reports = [...(meta.reports || []), clip(b.id, 20)].slice(-50);
      await this.storage.put("meta", meta); await this.storage.setAlarm(Math.max(meta.expires + keepMs(this.env), meta.keepUntil));
      return json({ ok: true, rec: (await this.storage.get("recN")) || 0 });
    }
    // the admin page's views of a room (the router only forwards these from /api/admin/…)
    if (path === "/_admin/room") {
      const [st, settings, recN, evN, modern] = await Promise.all(["state", "settings", "recN", "evN", "modern"].map((k) => this.storage.get(k)));
      return json({ meta, state: st ?? null, modern: modern ?? null, settings: settings ?? null, recN: recN || 0, evN: evN || 0 });
    }
    if (path === "/_admin/recs") {
      const rows = []; for (const [k, v] of await this.storage.list({ prefix: "recl:" })) rows.push({ n: +k.slice(5), ...v });
      return json({ recs: rows });
    }
    if (path === "/_admin/rec") {
      const n = Math.max(1, Math.floor(+url.searchParams.get("n") || 1)), gz = await this.storage.get("recs:" + pad(n));
      if (!gz) return json({ error: "No recording at that point" }, 404);
      return new Response(await gunzip(gz), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (path === "/_admin/events") {
      const rows = []; for (const [, v] of await this.storage.list({ prefix: "ev:" })) for (const e of v.list || []) rows.push({ ...e, device: v.device, host: v.host, build: v.build, ...(v.app ? { app: true, role: v.role } : {}) });
      return json({ events: rows });
    }
    const expired = Date.now() > meta.expires;
    const room = { code: meta.room, expires: meta.expires, expired, ...(meta.tier ? { tier: T.tierView(meta.tier, this.env) } : {}) };
    // what a player's browser or phone saw: taps, screens, sync trouble, errors (the app adds ads, offers, purchases and
    // crashes, and says it's the app and whether it's the host's phone, a player's or a TV). Anyone in the room may send
    // (the TV has no PIN); each batch is small and a room keeps EVMAX batches at most.
    if (path === "/api/events" && req.method === "POST") {
      const raw = await req.text(); if (raw.length > 32768) return text("Too large", 413);
      let b; try { b = JSON.parse(raw); } catch { return text("Bad JSON", 400); }
      const n = ((await this.storage.get("evN")) || 0) + 1; if (n > EVMAX) return json({ ok: true, full: true });
      const list = (Array.isArray(b.events) ? b.events : []).slice(0, 300).map((e) => ({ t: +e.t || Date.now(), k: clip(e.k, 12), m: clip(e.m, 400), ...(e.stack ? { stack: clip(e.stack, 1500) } : {}), ...(e.src ? { src: clip(e.src, 200) } : {}) }));
      const who = { device: clip(b.device, 16), host: !!b.host, build: clip(b.build, 20), ua: clip(req.headers.get("User-Agent"), 200), ...(b.app ? { app: true, role: clip(b.role, 8) } : {}) };
      await this.storage.put({ evN: n, ["ev:" + pad(n)]: { at: Date.now(), ...who, list } });
      const errs = list.filter((x) => x.k === "error" || x.k === "crash").slice(0, 10), hr = Math.floor(Date.now() / 3600000);
      if (errs.length) { // to the master log at most 30 an hour a room, so nobody with a room code can flood it
        const c = (await this.storage.get("errc")) || {}, used = c.h === hr ? c.n : 0, send = errs.slice(0, Math.max(0, 30 - used));
        if (send.length) await this.storage.put("errc", { h: hr, n: used + send.length });
        for (const e of send) logErr(this.env, { src: who.app ? (e.k === "crash" ? "app crash" : "app") : "browser", room: meta.room, ...who, msg: e.m, stack: e.stack, where: e.src, at: e.t });
      }
      return json({ ok: true });
    }

    // asked by the Registry when a Night Pass's window closes: did a game here reach its first round?
    if (path === "/_played") { const m = await this.storage.get("modern"); return json({ played: !!(m && m.round >= 1) }); }
    if (path === "/_mode") return json({ mode: (await this.storage.get("modern")) ? "modern" : (await this.storage.get("state")) ? "classic" : null });
    if (path.startsWith("/api/m")) return this.modern(req, url, path, meta, room, expired);

    const current = (await this.storage.get("state")) ?? null;
    const pin = req.headers.get("X-Pin") || "";
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const authed = !!current && current.hostPin === pin;

    if (current && pin && !authed && this.limited(ip)) return text("Too many wrong PINs. Try again in a minute.", 429);
    // a page still running the previous build must reload before it writes (reads are fine)
    const clientBuild = req.headers.get("X-Build");
    const oldBuild = this.env.BUILD && clientBuild && clientBuild !== this.env.BUILD;
    const readOnly = () => json({ error: "This Table has closed, and the game is now read-only.", expired: true, room }, 423);

    // The question bank's on/off switches outlive any one game in this room (a wipe keeps them).
    if (path === "/api/settings") {
      if (req.method === "GET") return json({ settings: (await this.storage.get("settings")) ?? null });
      if (req.method !== "PUT") return text("Method not allowed", 405);
      if (oldBuild) return text("A new version is live. Reload the page.", 426);
      if (expired) return readOnly();
      if (current && !authed) return text("Wrong Keeper PIN", 403);
      let body;
      try { body = await req.json(); } catch { return text("Bad JSON", 400); }
      const off = {}, src = body && body.settings && body.settings.off;
      if (src && typeof src === "object") for (const [k, v] of Object.entries(src)) {
        if (/^[A-Z_]{2,20}$/.test(k) && Array.isArray(v)) off[k] = [...new Set(v.filter((n) => Number.isInteger(n) && n >= 0 && n < 5000))];
      }
      const settings = { v: 1, off };
      await this.storage.put("settings", settings);
      return json({ settings });
    }

    if (req.method === "GET") {
      const tag = tagOf(current, authed) + (expired ? ".x" : "");
      if (req.headers.get("X-Have") === tag) return json({ same: true, tag });
      return json(authed ? { state: current, auth: true, tag, room } : { state: publicView(current), auth: false, tag, room });
    }
    if (oldBuild) return text("A new version is live. Reload the page.", 426);
    if (expired) return readOnly();
    if (current && !authed) return text("Wrong Keeper PIN", 403);

    if (req.method === "DELETE") {
      if (current && current.gid) await this.storage.put("wiped", addWiped(await this.storage.get("wiped"), current.gid));
      await this.storage.delete("state"); await this.record(null, "wipe");
      return json({ state: null, auth: true });
    }
    if (req.method === "PUT") {
      let body;
      try { body = await req.json(); } catch { return text("Bad JSON", 400); }
      if (!body || typeof body.state !== "object" || body.state === null) return text("Expected {state}", 400);
      if (JSON.stringify(body.state).length > 900000) return text("Game too large", 413);
      // two host phones, a stale phone, a wiped game: see rules.js
      if (!current && (await this.storage.get("modern"))) return text("This Table is playing Modern", 409);
      const no = writeVerdict(current, body.state, current ? null : await this.storage.get("wiped"));
      if (no) return no.body ? json(no.body, no.status) : text(no.text, no.status);
      await this.storage.put("state", body.state); await this.record(body.state, current ? "save" : "start");
      return json({ state: body.state, auth: true });
    }
    return text("Method not allowed", 405);
  }
  // Modern (see modern.js): the game runs here. Every request first moves the clocks on (tick), then answers with what
  // that phone may see. A phone proves who it is with the token it was given when it joined (X-Tok).
  async modern(req, url, path, meta, room, expired) {
    const ctx = { rnd: Math.random, dict: null };
    let s = this.mstate || (this.mstate = (await this.storage.get("modern")) ?? null);
    // the Longest Word dictionary, loaded the first time a word round is open (before any read-modify-write below)
    if (s && s.trial && s.trial.item && s.trial.item.k === "word" && !this.dictTried && this.env.ASSETS) {
      this.dictTried = true; // once per room instance: a failed load leaves words unchecked rather than refetching on every poll
      try { const r = await this.env.ASSETS.fetch("https://assets/words.txt"); if (r.ok) { const set = new Set((await r.text()).split(/\r?\n/)); this.dict = { has: (w) => set.has(w) }; } } catch { this.dict = null; }
      s = this.mstate = (await this.storage.get("modern")) ?? null;
    }
    ctx.dict = this.dict;
    const now = Date.now(), save = async () => {
      this.mstate = s; await this.storage.put("modern", s);
      // recorded for the admin replay: a new screen at once, and otherwise at most every 15 seconds
      const it = s.trial && s.trial.item, key = [s.phase, s.round, s.trial && s.trial.stage, s.trial && s.trial.i, it && it.stage, s.log[0] && s.log[0].t].join("|");
      if (key !== this.mkey || now - (this.mrecAt || 0) > 15000) {
        this.mkey = key; this.mrecAt = now;
        await this.record({ mode: "modern", code: meta.room, log: s.log.slice(0, 1).map((x) => x.m), phase: s.phase, round: s.round, ver: s.ver, gid: s.gid, state: s, tv: M.viewFor(s, null, now), host: s.director ? M.viewFor(s, s.director, now) : null }, "modern");
      }
    };
    const tok = req.headers.get("X-Tok") || "", me = s && tok ? s.players.find((p) => p.tok === tok) : null;
    if (me) me.seen = now; // (in memory: a phone still polling can't be taken over by a rejoin)
    if (+(req.headers.get("Content-Length") || 0) > 65536) return json({ error: "Too large" }, 413);
    const body = req.method === "POST" ? (await req.json().catch(() => null)) || {} : {};
    // who may let a phone back in: the host, always; and while the host's own phone has been quiet for half a minute
    // (dead, lost, left in another room), anyone still at the table may let the host back in, or the game would wait
    // for ever on the one phone that could
    const hostQuiet = () => { const d = s && s.players.find((p) => p.id === s.director); return !!d && !(d.seen && now - d.seen < 30000); };
    const mayLetIn = (r) => !!me && !me.left && (s.director === me.id || (r.pid === s.director && r.pid !== me.id && hostQuiet()));
    // so those phones always get the requests to come back in, and none is lost between screens
    const pending = () => { const l = me && s && s.rejoin ? s.rejoin.filter((x) => !x.tok && mayLetIn(x)) : []; return l.length ? { rejoin: l.map((x) => ({ id: x.id, name: (s.players.find((p) => p.id === x.pid) || {}).name })) } : {}; };
    const view = (extra) => json({ view: viewOf(s, me, now), room, ...pending(), ...(extra || {}) });
    const viewOf = (st, p, t) => M.viewFor(st, p ? p.id : null, t);

    if (path === "/api/m/create" && req.method === "POST") return queued(this.locks, "create", async () => {
        s = this.mstate || (this.mstate = (await this.storage.get("modern")) ?? null); // one set-up at a time, each on the game as the last left it
        if (expired) return json({ error: "This Table has closed.", room }, 423);
        const booked = meta.pass && meta.pass !== "MASTER"; // a room from the master code or open access has no booking to prove
        if (booked && passKey(String(body.pass || "")) !== meta.pass) return json({ error: "Only the person who booked this Table can set it up." }, 403);
        if (!String(body.name || "").replace(/\s+/g, " ").trim()) return json({ error: "Type your name." }, 400);
        if (await this.storage.get("state")) return json({ error: "This Table is already playing Classic." }, 409);
        if (!s) {
          s = M.newGame(now, Math.random, meta.tier ? { content: T.tierView(meta.tier).content } : {}); // an app game's tier (tiers.js) decides its Trials
          // testing rooms (the master code) may fix the order of the Trials, so a test can play a known one
          if (meta.pass === "MASTER" && Array.isArray(body.plan)) s.plan = body.plan.filter((k) => M.TRIALS[k]).slice(0, 20);
          // and play a test game against bots, with every clock at ten seconds
          if (meta.pass === "MASTER" && body.test) s.test = true;
          // the app's practice game: one person and the bots, who play everything, Trials included (modern.js botsAnswer)
          if (meta.practice) s.practice = true;
          await save();
        }
        if (s.director) return json({ error: "This Table’s Modern game has already been set up. Join it with the room code.", mode: "modern" }, 409);
        const j = M.join(s, body.name, now, Math.random); if (j.error) return json(j, 400);
        if (s.test || s.practice) M.addBots(s, Math.max(M.MINP, Math.min(s.practice ? 16 : M.MAXP, +body.bots || (s.practice ? 10 : 8))), now, Math.random);
        s.ver++; await save(); return json({ tok: j.tok, view: viewOf(s, { id: j.id }, now), room });
    });
    if (!s || (!s.director && path !== "/api/m")) return json({ none: true, classic: !!(await this.storage.get("state")), room });
    // a rules bug must never lock the room: log it and carry on answering
    try { if (M.tick(s, now, ctx)) await save(); } catch (e) { logErr(this.env, { src: "server", room: meta.room, where: "modern tick", msg: e.message, stack: clip(e.stack, 1500) }); }
    // an app game that got going (tiers.js): counted once, with its tier and size, for the app's conversion figure
    if (meta.tier && !meta.practice && !meta.counted && s.round >= 1) {
      meta.counted = true; await this.storage.put("meta", meta);
      await registry(this.env).fetch("https://registry/stat", { method: "POST", body: JSON.stringify({ e: "round_started." + meta.tier + (s.players.filter((p) => !p.left).length >= 6 ? ".6" : "") }) }).catch(() => null);
    }

    if (path === "/api/m/join" && req.method === "POST") {
      if (expired) return json({ error: "This Table has closed.", room }, 423);
      // a phone that lost its place asks by name; the director lets it back in, and it collects a fresh token
      if (body.req) { const r = (s.rejoin || []).find((x) => x.id === body.req); if (!r) return json({ error: "The host turned that request down.", gone: true }, 404); if (!r.tok) return json({ waiting: true }); s.rejoin = s.rejoin.filter((x) => x !== r); await save(); return json({ tok: r.tok }); }
      if (s.phase !== "lobby") {
        const name = String(body.name || "").trim().toLowerCase(), p = s.players.find((x) => x.name.toLowerCase() === name && !x.left);
        if (!p) return json({ error: "This game has already started, and nobody here is called that." }, 409);
        s.rejoin = (s.rejoin || []).filter((x) => x.pid !== p.id).concat([{ id: Math.random().toString(36).slice(2, 10), pid: p.id, t: now }]).slice(-10); s.ver++; await save();
        return json({ req: s.rejoin[s.rejoin.length - 1].id, waiting: true });
      }
      const j = M.join(s, body.name, now, Math.random); if (j.error) return json(j, 400);
      s.ver++; await save(); return json({ tok: j.tok, view: viewOf(s, { id: j.id }, now), room });
    }
    if (path === "/api/m/upgrade" && req.method === "POST") {
      if (expired) return json({ error: "This Table has closed.", room }, 423);
      if (!me || s.director !== me.id) return json({ error: "Only the host can do that." }, 403);
      if (meta.tier !== "free") return json({ error: "This game is already ad-free." }, 409);
      if (meta.practice) return json({ error: "A practice game can’t use a pass: keep it for a real night." }, 409);
      const r = await registry(this.env).fetch("https://registry/attach", { method: "POST", headers: { "CF-Connecting-IP": req.headers.get("CF-Connecting-IP") || "?" }, body: JSON.stringify({ pass: body.pass, room: meta.room, expires: meta.expires }) });
      const out = await r.json().catch(() => ({ error: "That didn’t work. Try again." }));
      if (!r.ok) return json(out, r.status);
      meta.tier = T.higher(meta.tier, out.tier); await this.storage.put("meta", meta);
      s.opts.content = T.tierView(meta.tier).content; // every Trial and the full banks, from the next one on
      s.ver++; await save(); // every phone and the TV see the new tier with their next poll
      return view({ room: { ...room, tier: T.tierView(meta.tier) } });
    }
    if (path === "/api/m/act" && req.method === "POST") {
      if (expired) return json({ error: "This Table has closed.", room }, 423);
      if (!me) return json({ error: "This phone isn’t in the game.", lost: true }, 403);
      if (body.a === "letin" || body.a === "keepout") {
        const r = (s.rejoin || []).find((x) => x.id === body.v); if (!r) return view();
        if (!mayLetIn(r)) return json({ error: "Only the host can do that." }, 403);
        if (body.a === "letin") {
          const p = s.players.find((x) => x.id === r.pid);
          if (p.seen && now - p.seen < 20000) return json({ error: p.name + "’s phone is still connected, so it can’t be let in on another. Try again once it has gone quiet.", view: viewOf(s, me, now), ...pending() }, 409);
          p.tok = M.newTok(); r.tok = p.tok; s.log = [{ t: now, m: p.name + " came back on a new phone" }, ...(s.log || [])].slice(0, 300);
        }
        else s.rejoin = s.rejoin.filter((x) => x !== r);
        s.ver++; await save(); return view();
      }
      const r = M.act(s, me.id, body, now, ctx);
      if (r && r.error) return json({ ...r, view: viewOf(s, me, now) }, 409);
      M.tick(s, now, ctx); await save(); return view(r && r.peek ? { peek: r.peek } : null);
    }
    if (path === "/api/m" && req.method === "GET") {
      const it = s.trial && s.trial.item, live = it && it.k === "snap" && it.stage === "open";
      if (!live && url.searchParams.get("v") === String(s.ver) && url.searchParams.get("me") === (me ? me.id : "")) return json({ same: true, now, ...pending() });
      return view();
    }
    return text("Not found", 404);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Booking codes (passes): minted by the admin or by a paid Stripe checkout. A one-party code opens one room; a
// Regular's (subscription) code opens a new room whenever they like, one at a time.
export class Registry {
  constructor(state, env) { this.storage = state.storage; this.env = env || {}; this.fails = new Map(); this.frees = new Map(); this.evts = new Map(); this.writes = 0; this.locks = new Map(); }

  // A paid booking's code goes to the buyer by email, once. `mailing` holds the send while it's in flight (the webhook
  // and the thank-you page can arrive together); a failed send is logged and tried again on the next claim. `to`
  // overrides the address (the admin's "email it again"). Returns whether the code has been emailed.
  async mailCode(key, to) {
    const k = "pass:" + key, v = await this.storage.get(k);
    if (!v || v.revoked || v.pending) return false;
    if (v.mailed && !to) return true;
    const addr = String(to || v.email || v.note || "").trim().slice(0, 200);
    if (!this.env.MAIL || !/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(addr)) return false;
    if (v.mailing && Date.now() - v.mailing < 120000) return false;
    await this.storage.put(k, { ...v, mailing: Date.now() });
    try {
      await sendBooking(this.env, addr, shownPass(key), v.kind === "sub");
      await this.storage.put(k, { ...(await this.storage.get(k)), mailing: null, mailed: Date.now(), mailedTo: addr });
      return true;
    } catch (e) {
      await this.storage.put(k, { ...(await this.storage.get(k)), mailing: null });
      logErr(this.env, { src: "mail", msg: "The booking email didn’t send: " + clip((e && e.message) || e, 240), pass: shownPass(key) });
      return false;
    }
  }

  // the owner hears of each sale, refund, cancelled Regular and refused renewal (ALERT_TO), once per event: the webhook
  // and the thank-you page, and Stripe's retries, only reach here after the state has already changed
  async notify(subject, lines) { await alertMail(this.env, subject, lines.filter(Boolean).join("\n") + "\n\nhttps://" + (this.env.SITE_HOST || "thebetrayal.co.uk") + "/admin"); }

  // the logs keep their newest `max` entries: every fiftieth write trims the oldest
  async trim(prefix, max) {
    if (++this.writes % 50) return;
    const keys = [...(await this.storage.list({ prefix })).keys()];
    for (let i = 0; i < keys.length - max; i += 128) await this.storage.delete(keys.slice(i, Math.min(i + 128, keys.length - max)));
  }
  async newest(prefix, limit) {
    const rows = []; for (const [k, v] of await this.storage.list({ prefix, reverse: true, limit })) rows.push({ key: k.slice(prefix.length), ...v });
    return rows;
  }

  // twenty wrong codes an hour from one address, then it waits: pass codes can't be guessed by brute force
  tooMany(ip) {
    const t = Date.now(), rec = (this.fails.get(ip) || []).filter((x) => t - x < 3600000);
    this.fails.set(ip, rec); if (this.fails.size > 2000) this.fails.clear();
    return rec.length >= 20;
  }
  failed(ip) { const rec = this.fails.get(ip) || []; rec.push(Date.now()); this.fails.set(ip, rec); }

  async mint(count, note, source, kind, email, pool) {
    const out = [], app = pool === "app";
    if (app && kind !== "night" && kind !== "host") throw new Error("An app code is a Night Pass or a Host Pass");
    for (let i = 0; i < count; i++) {
      let p; do p = newPass(); while (await this.storage.get("pass:" + p));
      // a free unlimited code (from the admin page) works like a subscription that never lapses, until it's cancelled;
      // an app code (tiers.js) is a Night Pass, or a Host Pass that never lapses
      const sub = app ? kind === "host" : kind === "sub";
      await this.storage.put("pass:" + p, { created: Date.now(), note: String(note || "").slice(0, 120), source: source || "admin", ...(email ? { email } : {}), ...(app ? { pool: "app", kind } : {}), ...(sub ? { kind: app ? "host" : "sub", subActive: true, subStatus: "free" } : {}) });
      out.push(p);
    }
    return out;
  }

  async room(env, expires, pass, tier, practice) {
    let code; do code = newRoom(); while (await this.storage.get("room:" + code));
    await this.storage.put("room:" + code, { pass, expires, created: Date.now(), ...(tier ? { tier } : {}), ...(practice ? { practice: true } : {}) });
    await env.GAME.get(env.GAME.idFromName("room:" + code)).fetch("https://game/_init", { method: "POST", body: JSON.stringify({ room: code, expires, pass, ...(tier ? { tier } : {}), ...(practice ? { practice: true } : {}) }) });
    if (tier) await this.stat((practice ? "practice_created." : "room_created.") + tier);
    return code;
  }

  // The app's analytics (tiers.js): a count a day of each event, nothing about who. Events from the server itself
  // (rooms opened, games that got going, passes used and returned, purchases) and from the app (ads and offers).
  async stat(e, n = 1) {
    const k = "stat:" + new Date(Date.now()).toISOString().slice(0, 10), v = (await this.storage.get(k)) || {};
    v[e] = (v[e] || 0) + n; await this.storage.put(k, v);
  }

  // A Night Pass's 24 hours start the first time it's used. When they're over, the night comes back if no game in it
  // reached its first round (a lobby that never started isn't a night). Returns {v} (saved), or {res} to refuse with.
  async nightWindow(env, k, v) {
    const now = Date.now();
    if (v.activeUntil && now >= v.activeUntil) {
      if (await this.played(env, v.rooms)) return { res: json({ error: "That ad-free night has been used.", kind: "night" }, 410) };
      v = { ...v, activeUntil: null, rooms: [], room: null, expires: null, returned: (v.returned || 0) + 1 };
      await this.stat("night_pass_refunded");
    }
    if (!v.activeUntil) { v = { ...v, activeUntil: now + T.NIGHT_MS, activated: now, rooms: v.rooms || [] }; await this.stat("night_pass_activated"); }
    await this.storage.put(k, v);
    return { v };
  }

  async played(env, rooms) {
    for (const r of rooms || []) {
      const g = await env.GAME.get(env.GAME.idFromName("room:" + r)).fetch("https://game/_played").catch(() => null);
      if (!g || !g.ok || (await g.json()).played) return true; // can't ask: count it as played
    }
    return false;
  }

  // a subscription's code (the website's Regular, the app's Host Pass): Apple, for one bought in the app, says whether
  // it's paid up (asked again after ten minutes, or at once if it had lapsed). Returns {v}, or {res} to refuse with.
  async subActive(env, k, v) {
    if (v.apple && (!v.subActive || Date.now() - (v.subChecked || 0) > 600000)) {
      const st = await AS.subscription(env, v.apple.orig, v.apple.env === "Xcode" ? { environment: "Xcode", expiresDate: v.subExpires } : null);
      if (st) { v = { ...v, subActive: st.active, subStatus: st.status, subExpires: st.expires, subChecked: Date.now() }; await this.storage.put(k, v); }
    }
    const what = v.kind === "host" ? "Host Pass" : "Regular plan";
    if (!v.subActive && v.apple) return { res: json({ error: "Your " + what + " isn’t active" + (v.subStatus === "billing retry" ? ": Apple couldn’t take the last payment." : ".") + " Renew it in the app, under Manage subscription.", sub: true }, 402) };
    if (!v.subActive) return { res: json({ error: "Your subscription isn’t active" + (v.subStatus === "past_due" ? ": the last payment didn’t go through." : ".") + " Use “Manage subscription” to sort it out.", sub: true }, 402) };
    return { v };
  }

  async fetch(req) {
    const url = new URL(req.url), env = this.env, b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    if (url.pathname === "/mint") {
      const email = String(b.email || "").trim().slice(0, 200);
      if (email && !/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(email)) return json({ error: "That isn’t an email address." }, 400);
      if (b.pool === "app" && b.kind !== "night" && b.kind !== "host") return json({ error: "An app code is a Night Pass (kind night) or a Host Pass (kind host)." }, 400);
      return json({ passes: (await this.mint(Math.max(1, Math.min(200, +b.count || 1)), b.note, "admin", b.kind, email, b.pool)).map(shownPass) });
    }
    // admin sign-in: wrong passwords count with wrong pass codes (twenty an hour per address)
    if (url.pathname === "/signin-check") return this.tooMany(ip) ? json({ error: "Too many attempts. Try again in an hour." }, 429) : json({ ok: true });
    if (url.pathname === "/signin-failed") { this.failed(ip); return json({ ok: true }); }
    // the master error log, the Stripe webhook log, issue reports
    if (url.pathname === "/err") {
      const e = { t: Date.now() }; for (const [k, v] of Object.entries(b || {})) if (typeof v !== "object" || v === null) e[clip(k, 20)] = typeof v === "string" ? clip(v, k === "stack" ? 1500 : 400) : v;
      await this.storage.put(tkey("err:"), e); await this.trim("err:", 3000); return json({ ok: true });
    }
    if (url.pathname === "/errs") return json({ errors: await this.newest("err:", 1000) });
    // the morning summary (the Worker's daily schedule): the last 24 hours, for the owner's inbox
    if (url.pathname === "/digest") {
      const since = Date.now() - 86400000, sales = [], refunds = [], ended = [], failed = []; let regulars = 0, games = 0, tests = 0;
      for (const [k, v] of await this.storage.list({ prefix: "pass:" })) {
        if (v.kind === "sub" && v.subActive) regulars++;
        if (v.paid > since) sales.push(v); if (v.refunded > since) refunds.push(v); if (v.subEnded > since) ended.push([k, v]); if (v.failed > since) failed.push([k, v]);
      }
      for (const [, v] of await this.storage.list({ prefix: "room:" })) if (v.created > since) { if (v.pass === "MASTER") tests++; else games++; }
      const reps = [...(await this.storage.list({ prefix: "rep:" })).values()], open = reps.filter((r) => r.status === "open").length, newReps = reps.filter((r) => r.t > since);
      const errs = [...(await this.storage.list({ prefix: "err:", start: "err:" + String(since).padStart(15, "0") })).values()].filter((e) => e.src !== "report"), seen = new Map();
      for (const e of errs) { const m = clip(e.msg || e.where || "?", 120); seen.set(m, (seen.get(m) || 0) + 1); }
      const money = (list, f) => list.reduce((a, v) => a + (+f(v) || 0), 0), tables = sales.filter((v) => v.kind !== "sub").length, subs = sales.length - tables;
      const svs = [...(await this.storage.list({ prefix: "survey:" })).values()], svSent = svs.filter((x) => x.sent > since).length, svIn = svs.filter((x) => x.answered > since);
      const lines = [
        "In the last 24 hours:",
        "Sales: " + (sales.length ? sales.length + " (" + [tables && tables + (tables === 1 ? " Table" : " Tables"), subs && subs + (subs === 1 ? " new Regular" : " new Regulars")].filter(Boolean).join(", ") + "), " + gbp(money(sales, (v) => v.amount)) : "none"),
        refunds.length ? "Refunds: " + refunds.length + ", " + gbp(money(refunds, (v) => v.refundedAmount)) : null,
        ended.length ? "Regulars who cancelled: " + ended.map(([k]) => shownPass(k.slice(5))).join(", ") : null,
        failed.length ? "Payments refused: " + failed.length + " (" + failed.map(([k, v]) => shownPass(k.slice(5)) + ": " + (v.failWhy || "refused")).join("; ") + ")" : null,
        "Tables opened: " + games + (tests ? " (and " + tests + " test " + (tests === 1 ? "room" : "rooms") + ")" : ""),
        "Problem reports and messages: " + newReps.length + " new, " + open + " open",
        svSent || svIn.length ? "Feedback: " + svSent + (svSent === 1 ? " survey" : " surveys") + " sent, " + svIn.length + " answered" + (svIn.length ? " (" + (svIn.reduce((a, x) => a + x.answers.overall, 0) / svIn.length).toFixed(1) + " out of 5 on average)" : "") : null,
        "Errors: " + (errs.length ? errs.length + ". Most common: " + [...seen].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => m + (n > 1 ? " (×" + n + ")" : "")).join(" · ") : "none"),
        "", "Regulars now: " + regulars];
      const subject = "The Betrayal, last 24 hours: " + (sales.length ? sales.length + (sales.length === 1 ? " sale" : " sales") + " (" + gbp(money(sales, (v) => v.amount)) + ")" : "no sales") + ", " + games + (games === 1 ? " Table" : " Tables") + ", " + errs.length + (errs.length === 1 ? " error" : " errors");
      return json({ subject, body: lines.filter((x) => x !== null).join("\n") });
    }
    if (url.pathname === "/hook") { await this.storage.put(tkey("hook:"), { t: Date.now(), ...b }); await this.trim("hook:", 1000); return json({ ok: true }); }
    if (url.pathname === "/hooks") return json({ hooks: await this.newest("hook:", 500) });
    if (url.pathname === "/report") {
      const rec = (this.reps = (this.reps || new Map())).get(ip) || [], t = Date.now(), fresh = rec.filter((x) => t - x < 3600000);
      if (fresh.length >= 10) return json({ error: "Too many reports from here. Try again in an hour, or email info@thebetrayal.co.uk." }, 429);
      fresh.push(t); this.reps.set(ip, fresh); if (this.reps.size > 2000) this.reps.clear();
      let id; do id = "R-" + Math.random().toString(36).slice(2, 8).toUpperCase(); while (await this.storage.get("rep:" + id));
      const snap = typeof b.snap === "string" && b.snap.length <= 4000000 ? b.snap : "", parts = Math.ceil(snap.length / 100000);
      for (let i = 0; i < parts; i++) await this.storage.put("repx:" + id + ":" + i, snap.slice(i * 100000, (i + 1) * 100000));
      const f = (k, n) => clip(b[k], n);
      await this.storage.put("rep:" + id, { id, t: Date.now(), status: "open", room: f("room", 6) || null, rec: +b.rec || 0, device: f("device", 16), host: !!b.host, build: f("build", 20), ua: f("ua", 300), url: f("url", 200),
        what: f("what", 4000), expected: f("expected", 2000), email: f("email", 200), phase: f("phase", 80), ver: +b.ver || 0, screen: b.screen && typeof b.screen === "object" ? { w: +b.screen.w || 0, h: +b.screen.h || 0, dpr: +b.screen.dpr || 1 } : null,
        crumbs: Array.isArray(b.crumbs) ? b.crumbs.slice(-200).map((c) => ({ t: +c.t || 0, k: clip(c.k, 12), m: clip(c.m, 400) })) : [], snapParts: parts });
      return json({ id });
    }
    if (url.pathname === "/reports") return json({ reports: (await this.newest("rep:", 500)).map(({ crumbs, ...r }) => r).sort((a, c) => c.t - a.t) });
    if (url.pathname === "/report-get") {
      const id = clip(b.id, 12), r = await this.storage.get("rep:" + id); if (!r) return json({ error: "No such report" }, 404);
      let snap = ""; for (let i = 0; i < (r.snapParts || 0); i++) snap += (await this.storage.get("repx:" + id + ":" + i)) || "";
      return json({ ...r, snap });
    }
    if (url.pathname === "/report-status") {
      const r = await this.storage.get("rep:" + clip(b.id, 12)); if (!r) return json({ error: "No such report" }, 404);
      await this.storage.put("rep:" + r.id, { ...r, status: b.status === "resolved" ? "resolved" : "open", adminNote: clip(b.note ?? r.adminNote, 2000) }); return json({ ok: true });
    }
    // every room ever opened, with the pass that opened it
    if (url.pathname === "/rooms") {
      const passes = new Map(); for (const [k, v] of await this.storage.list({ prefix: "pass:" })) passes.set(k.slice(5), v);
      const rows = []; for (const [k, v] of await this.storage.list({ prefix: "room:" })) { const pv = v.pass && passes.get(v.pass); rows.push({ room: k.slice(5), ...v, pass: v.pass && v.pass !== "MASTER" ? shownPass(v.pass) : v.pass, note: pv ? pv.note || "" : "", email: pv ? pv.email || (/@/.test(pv.note || "") ? String(pv.note).trim() : "") : "", kind: pv ? pv.kind || "one" : v.pass === "MASTER" ? "master" : "" }); }
      return json({ rooms: rows.sort((a, c) => (c.expires || 0) - (a.expires || 0)) });
    }
    // a checkout nobody paid for or tried to pay for isn't a pass yet: it's left out (and cleared after two days)
    if (url.pathname === "/list") {
      const rows = [], old = [], t = Date.now();
      for (const [k, v] of await this.storage.list({ prefix: "pass:" })) {
        if (v.source === "stripe" && !v.paid && !v.failed) { if (t - v.created > 48 * 3600000) old.push(k); continue; }
        rows.push({ pass: shownPass(k.slice(5)), ...v });
      }
      for (let i = 0; i < old.length; i += 128) await this.storage.delete(old.slice(i, i + 128));
      return json({ passes: rows.sort((a, c) => c.created - a.created) });
    }
    // the admin's "extend": a Table stays open `hours` longer (counted from now if it has already closed). Found by its
    // booking code (its current Table) or by the Table's own code.
    if (url.pathname === "/extend") {
      const h = Math.round(+b.hours || 0);
      if (!(h >= 1 && h <= 720)) return json({ error: "Extend by 1 to 720 hours." }, 400);
      let key = b.pass && isPass(b.pass) ? passKey(b.pass) : null, v = key && (await this.storage.get("pass:" + key));
      let code = v ? v.room : String(b.room || "").toUpperCase();
      if (b.pass && !v) return json({ error: "No such pass" }, 404);
      if (!code) return json({ error: "This code hasn’t opened a Table yet. Its 48 hours start when it’s first used." }, 409);
      const r = await this.storage.get("room:" + code);
      if (!r) return json({ error: "No Table with that code." }, 404);
      if (!key && r.pass && r.pass !== "MASTER") { key = r.pass; v = await this.storage.get("pass:" + key); }
      const expires = Math.max(Date.now(), r.expires || 0) + h * 3600000;
      const g = await this.env.GAME.get(this.env.GAME.idFromName("room:" + code)).fetch("https://game/_extend", { method: "POST", body: JSON.stringify({ expires }) });
      if (!g.ok) return json({ error: "That Table’s game has been deleted, so it can’t be reopened." }, 410);
      await this.storage.put("room:" + code, { ...r, expires, extended: (r.extended || 0) + h });
      if (v && v.room === code) await this.storage.put("pass:" + key, { ...v, expires });
      return json({ ok: true, room: code, expires });
    }
    if (url.pathname === "/resend") { // the admin's "email it again", to the buyer or to another address
      const key = passKey(b.pass || ""), v = key && (await this.storage.get("pass:" + key));
      if (!v) return json({ error: "No such pass" }, 404);
      if (v.revoked) return json({ error: "That code is cancelled." }, 409);
      const to = String(b.to || "").trim() || String(v.email || (/@/.test(String(v.note || "")) ? v.note : "")).trim();
      if (!to) return json({ error: "There’s no email address on this code. Type one in." }, 400);
      if (!this.env.MAIL) return json({ error: "Email isn’t set up (no MAIL binding)." }, 503);
      return (await this.mailCode(key, to)) ? json({ ok: true, to }) : json({ error: "It didn’t send. The error log says why." }, 502);
    }
    // the admin's "Set email": the address this code's booking emails go to (empty clears it)
    if (url.pathname === "/setemail") {
      const key = passKey(b.pass || ""), v = key && (await this.storage.get("pass:" + key));
      if (!v) return json({ error: "No such pass" }, 404);
      const email = String(b.email || "").trim().slice(0, 200);
      if (email && !/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(email)) return json({ error: "That isn’t an email address." }, 400);
      await this.storage.put("pass:" + key, { ...v, email: email || undefined });
      return json({ ok: true, pass: shownPass(key), email });
    }
    // Feedback. The admin sends a buyer the survey ("Survey" on their booking code); answering it earns a one-use 30% code
    // for one Table. Each survey is survey:<token> (its link's token); an address that asked to stop (by the link, or by
    // ticking "Don't email me a feedback survey" when booking) is svoff:<address>, and that booking is noMail.
    if (url.pathname === "/survey-send") {
      const key = passKey(b.pass || ""), v = key && (await this.storage.get("pass:" + key));
      if (!v) return json({ error: "No such pass" }, 404);
      if (v.revoked || v.pending) return json({ error: v.revoked ? "That code is cancelled." : "That code hasn’t been paid for." }, 409);
      if (v.noMail) return json({ error: "They asked not to get feedback emails when they booked." }, 409);
      const to = (String(b.to || "").trim() || String(v.email || (/@/.test(String(v.note || "")) ? v.note : "")).trim()).slice(0, 200);
      if (!to) return json({ error: "There’s no email address on this code. Type one in." }, 400);
      if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(to)) return json({ error: "That isn’t an email address." }, 400);
      if (!this.env.MAIL) return json({ error: "Email isn’t set up (no MAIL binding)." }, 503);
      if (await this.storage.get("svoff:" + to.toLowerCase())) return json({ error: to + " asked not to get feedback emails." }, 409);
      const old = v.survey && (await this.storage.get("survey:" + v.survey));
      if (old && old.answered) return json({ error: "They’ve already answered" + (old.code ? " (their code is " + old.code + ")" : "") + "." }, 409);
      const token = old ? old.token : newToken(), sent = Date.now();
      try { await sendFeedbackMail(this.env, to, surveyEmail({ token, host: this.env.SITE_HOST || "thebetrayal.co.uk" })); }
      catch (e) { logErr(this.env, { src: "mail", msg: "The survey email didn’t send: " + clip((e && e.message) || e, 240), pass: shownPass(key) }); return json({ error: "It didn’t send. The error log says why." }, 502); }
      await this.storage.put({ ["survey:" + token]: { ...(old || { token, pass: key, room: v.room || null }), email: to, sent, sends: ((old && old.sends) || 0) + 1 },
        ["pass:" + key]: { ...(await this.storage.get("pass:" + key)), survey: token, surveyed: sent } });
      return json({ ok: true, to });
    }
    if (url.pathname === "/surveys") {
      const rows = [...(await this.storage.list({ prefix: "survey:" })).values()].map(({ token, ...x }) => ({ ...x, pass: shownPass(x.pass) }));
      return json({ surveys: rows.sort((a, c) => (c.answered || c.sent) - (a.answered || a.sent)) });
    }
    if (url.pathname === "/survey-get") {
      const s = surveyOf(b) && (await this.storage.get(surveyOf(b)));
      if (!s) return json({ error: "That survey link isn’t valid." }, 404);
      return json({ ok: true, answered: !!s.answered, code: s.code || null, until: s.until || null, mailed: !!s.mailed, stopped: !!s.stopped });
    }
    if (url.pathname === "/survey-stop") {
      const s = surveyOf(b) && (await this.storage.get(surveyOf(b)));
      if (!s) return json({ error: "That survey link isn’t valid." }, 404);
      await this.storage.put({ [surveyOf(b)]: { ...s, stopped: Date.now() }, ["svoff:" + s.email.toLowerCase()]: { t: Date.now(), pass: s.pass } });
      return json({ ok: true });
    }
    // an answer, once: two taps on Send make one code (Stripe is awaited inside, so the check-then-act queues)
    if (url.pathname === "/survey-answer") return queued(this.locks, "survey", async () => {
      const s = surveyOf(b) && (await this.storage.get(surveyOf(b)));
      if (!s) return json({ error: "That survey link isn’t valid." }, 404);
      if (s.answered) return json({ ok: true, code: s.code || null, until: s.until || null, mailed: !!s.mailed });
      const a = surveyAnswers(b.answers); if (a.error) return json({ error: a.error }, 400);
      // the reward, made as the admin's Discount codes are: a Stripe coupon (30%, once) with a one-use promotion code on it
      // for one party, good for 180 days; a clash with an existing code tries another
      let code = null, why = "";
      const until = Date.now() + 180 * 86400000, md = { by: "survey", percent: "30", plans: "one", pass: shownPass(s.pass) };
      if (!this.env.STRIPE_SECRET_KEY) why = "Stripe isn’t set up (no STRIPE_SECRET_KEY)";
      else try {
        const cp = await stripePost(this.env, "coupons", { percent_off: 30, duration: "once", name: "Survey thanks (30% off)", metadata: md }, PROMO_VERSION);
        for (let i = 0; i < 3 && !code; i++) {
          const c = newThanks();
          try { await stripePost(this.env, "promotion_codes", { promotion: { type: "coupon", coupon: cp.id }, code: c, max_redemptions: 1, expires_at: Math.floor(until / 1000), metadata: md }, PROMO_VERSION); code = c; }
          catch (e) { why = clip(e.message, 200); }
        }
      } catch (e) { why = clip(e.message, 200); }
      const rec = { ...s, answered: Date.now(), answers: a, code, until: code ? until : null, ...(code ? {} : { codeErr: why }) };
      await this.storage.put(surveyOf(b), rec);
      const pv = await this.storage.get("pass:" + s.pass); if (pv) await this.storage.put("pass:" + s.pass, { ...pv, surveyAnswered: rec.answered });
      if (code) {
        try { await sendFeedbackMail(this.env, s.email, thanksEmail({ code, until, host: this.env.SITE_HOST || "thebetrayal.co.uk" })); rec.mailed = Date.now(); await this.storage.put(surveyOf(b), rec); }
        catch (e) { logErr(this.env, { src: "mail", msg: "The survey’s 30% code didn’t send: " + clip((e && e.message) || e, 240), pass: shownPass(s.pass) }); }
      }
      else logErr(this.env, { src: "stripe", msg: "No 30% code for a survey answer: " + why, pass: shownPass(s.pass) });
      await this.notify("Feedback from " + shownPass(s.pass) + ": " + a.overall + "/5, " + a.recommend + "/10 to recommend", [
        "Overall: " + a.overall + " out of 5", "Would recommend: " + a.recommend + " out of 10", "Getting going: " + a.setup, "Length: " + a.length, "Would host again: " + a.again,
        a.comment ? "\nAnything else:\n" + a.comment : null, a.quote ? "\nHappy to be quoted" + (a.name ? ", as " + a.name : "") + "." : null,
        "\nFrom " + s.email + (s.room ? " (Table " + s.room + ")" : "") + ".",
        code ? "Their 30% code: " + code : "Their 30% code couldn’t be made (" + why + "): make one in Discount codes and email it to them."]);
      return json({ ok: true, code, until: rec.until, mailed: !!rec.mailed });
    });
    // the admin's "Delete": a cancelled or refunded code is removed from the list (Stripe keeps its own record of the sale)
    if (url.pathname === "/delete") {
      const key = passKey(b.pass || ""), v = key && (await this.storage.get("pass:" + key));
      if (!v) return json({ error: "No such pass" }, 404);
      if (!v.revoked) return json({ error: "Only a cancelled or refunded code can be deleted. Cancel it first." }, 409);
      await this.storage.delete("pass:" + key);
      if (v.session && (await this.storage.get("claim:" + v.session)) === key) await this.storage.delete("claim:" + v.session);
      if (v.pi && (await this.storage.get("pi:" + v.pi)) === key) await this.storage.delete("pi:" + v.pi);
      return json({ ok: true, pass: shownPass(key) });
    }
    if (url.pathname === "/revoke") {
      const k = "pass:" + passKey(b.pass), v = await this.storage.get(k);
      if (!v) return json({ error: "No such pass" }, 404);
      await this.storage.put(k, { ...v, revoked: Date.now() }); return json({ ok: true });
    }
    // a checkout about to start: its pass exists from now, pending until the payment clears, so the pass can ride on
    // Stripe's invoice. Ten checkouts an hour per address, so nobody can fill the registry with pending passes.
    if (url.pathname === "/pending") {
      const t = Date.now(), k = "co:" + ip, rec = ((await this.storage.get(k)) || []).filter((x) => t - x < 3600000);
      if (rec.length >= 10) return json({ error: "Too many checkouts from here. Try again in an hour." }, 429);
      await this.storage.put(k, rec.concat([t]));
      let p; do p = newPass(); while (await this.storage.get("pass:" + p));
      await this.storage.put("pass:" + p, { created: t, note: "", source: "stripe", pending: true, kind: b.kind === "sub" ? "sub" : "one", from: clip(b.from, 160) || "direct", land: clip(b.land, 80) || null, ...(b.noMail === true ? { noMail: true } : {}) });
      return json({ pass: shownPass(p) });
    }
    if (url.pathname === "/pending-session") { // the checkout session that will pay for a pending pass
      const k = "pass:" + passKey(b.pass), v = await this.storage.get(k); if (!v) return json({ error: "No such pass" }, 404);
      await this.storage.put(k, { ...v, session: b.session }); return json({ ok: true });
    }
    // a paid checkout, from the thank-you page or the webhook: activates its pass (a Payment Link checkout, with no pass
    // of its own, gets one minted). One pass per checkout session, however often it's claimed.
    if (url.pathname === "/claim") {
      const k = "claim:" + b.session, have = await this.storage.get(k);
      if (have) return json({ pass: shownPass(have), sub: ((await this.storage.get("pass:" + have)) || {}).kind === "sub", emailed: await this.mailCode(have) });
      let p = b.pass && passKey(b.pass), v = p && (await this.storage.get("pass:" + p));
      const amount = typeof b.amount === "number" ? b.amount : null; // in pence
      if (v) await this.storage.put("pass:" + p, { ...v, pending: false, revoked: v.pending ? undefined : v.revoked, paid: Date.now(), amount, note: String(b.email || "").slice(0, 120), session: b.session, pi: b.pi || null, ...(b.disc ? { disc: String(b.disc).slice(0, 40) } : {}),
        ...(v.kind === "sub" ? { subId: b.sub || v.subId || null, customer: b.customer || v.customer || null, subActive: true, subStatus: "active" } : {}) });
      else [p] = await this.mint(1, b.email || "", "stripe:" + b.session);
      if (v && v.noMail && b.email) await this.storage.put("svoff:" + String(b.email).trim().toLowerCase(), { t: Date.now(), pass: p, at: "checkout" });
      await this.storage.put(k, p); if (b.pi) await this.storage.put("pi:" + b.pi, p);
      const sub = !!(v && v.kind === "sub");
      await this.notify("Sale: " + (sub ? "a Regular" : "a Table") + (amount !== null ? ", " + gbp(amount) + (sub ? " a month" : "") : ""), [
        "Booking code: " + shownPass(p), "Email: " + (b.email || "none given"), v && v.from ? "Came from: " + v.from : null, b.disc ? "Discount code: " + b.disc : null]);
      return json({ pass: shownPass(p), sub, emailed: await this.mailCode(p) });
    }
    // a payment that was tried and refused: noted on its pass (a checkout's, or a subscription's renewal)
    if (url.pathname === "/fail") {
      let p = b.pass && isPass(b.pass) && passKey(b.pass);
      if (!p && b.sub) for (const [k, v] of await this.storage.list({ prefix: "pass:" })) if (v.subId === b.sub) { p = k.slice(5); break; }
      const k = p && "pass:" + p, v = k && (await this.storage.get(k));
      if (!v) return json({ ok: true, pass: null });
      await this.storage.put(k, { ...v, failed: Date.now(), failWhy: clip(b.why, 200) || "payment refused", fails: (v.fails || 0) + 1 });
      if (v.kind === "sub" && !v.pending) await this.notify("A Regular’s payment failed: " + shownPass(p), ["Why: " + (clip(b.why, 200) || "payment refused"), "Email: " + (v.note || "unknown"),
        "Until it’s paid, the code can’t open a new Table. Stripe retries it as your billing settings say."]);
      return json({ ok: true, pass: shownPass(p), failed: true });
    }
    // a checkout that ended unpaid: if a payment was tried and refused, its pass stays (cancelled) so the admin sees it;
    // if nobody tried to pay, it's forgotten
    if (url.pathname === "/cancel") {
      const k = "pass:" + passKey(b.pass), v = await this.storage.get(k);
      if (!v || !v.pending || v.revoked) return json({ ok: true });
      if (b.tried && !v.failed) v.failed = Date.now(), v.failWhy = clip(b.tried, 200), v.fails = 1;
      if (v.failed) await this.storage.put(k, { ...v, revoked: Date.now(), note: "checkout " + (b.why || "ended") });
      else await this.storage.delete(k);
      return json({ ok: true, kept: !!v.failed });
    }
    // a refund: the pass is cancelled if it hasn't opened a room yet (a party already played keeps its room)
    // (found by its payment, or by the pass or subscription Stripe says it paid for). A subscription's refund is only
    // noted: whether the code keeps working follows the subscription's own status.
    if (url.pathname === "/refund") {
      let p = (b.pi && (await this.storage.get("pi:" + b.pi))) || (b.pass && isPass(b.pass) && passKey(b.pass)) || null;
      if (!p && b.sub) for (const [k, v] of await this.storage.list({ prefix: "pass:" })) if (v.subId === b.sub) { p = k.slice(5); break; }
      const k = p && "pass:" + p, v = k && (await this.storage.get(k));
      if (!v) return json({ ok: true, pass: null });
      if (b.pi) await this.storage.put("pi:" + b.pi, p);
      const cancel = v.kind !== "sub" && !v.room && !v.revoked, amt = +b.amount || 0, fresh = !v.refunded || amt > (v.refundedAmount || 0);
      await this.storage.put(k, { ...v, ...(cancel ? { revoked: Date.now() } : {}), refunded: Date.now(), refundedAmount: Math.max(amt, v.refundedAmount || 0) || null });
      if (fresh) await this.notify("Refund: " + (amt ? gbp(amt) + " on " : "") + shownPass(p), [
        (v.kind === "sub" ? "A Regular" : "A Table") + (cancel ? ". It hadn’t been played, so its code is now cancelled." : v.room ? ". It had already opened a Table, which stays open." : "."), "Email: " + (v.note || "unknown")]);
      return json({ ok: true, pass: shownPass(p), cancelled: cancel });
    }
    // an App Store purchase (appstore.js), already checked with Apple: one code per Night Pass bought, one per
    // subscription for a Host Pass, however often the phone claims it (after a lost reply, a restore or a new phone).
    // They're the app's codes (pool "app", tiers.js).
    if (url.pathname === "/apple-claim") {
      const t = b.txn || {}, sub = b.kind === "host", ak = "apple:" + (sub ? "orig:" + t.originalTransactionId : "txn:" + t.transactionId), st = b.status || null;
      return queued(this.locks, ak, async () => {
        const have = await this.storage.get(ak);
        if (have) {
          const k = "pass:" + have, v = await this.storage.get(k);
          if (v && sub && st) await this.storage.put(k, { ...v, subActive: st.active, subStatus: st.status, subExpires: st.expires, subChecked: Date.now() });
          if (v && v.revoked) return json({ error: "That purchase was refunded, so its booking code is cancelled." }, 410);
          return json({ pass: shownPass(have), sub });
        }
        if (t.revocationDate) return json({ error: "That purchase was refunded." }, 410);
        let p; do p = newPass(); while (await this.storage.get("pass:" + p));
        const price = AS.priceOf(t);
        await this.storage.put("pass:" + p, { created: Date.now(), note: "", source: "appstore", pool: "app", kind: sub ? "host" : "night", paid: Date.now(),
          apple: { txn: String(t.transactionId), orig: String(t.originalTransactionId), env: t.environment || null, storefront: t.storefront || null, price },
          ...(sub ? { subActive: st ? st.active : true, subStatus: st ? st.status : "active", subExpires: (st && st.expires) || t.expiresDate || null, subChecked: Date.now() } : {}) });
        await this.storage.put(ak, p);
        await this.stat("purchase_completed." + (sub ? "host" : "night"));
        await this.notify("Sale (App Store): " + (sub ? "a Host Pass" : "a Night Pass") + (price ? ", " + price : ""), ["Code: " + shownPass(p),
          t.environment && t.environment !== "Production" ? "A test purchase (" + t.environment + "): no money changed hands." : null]);
        return json({ pass: shownPass(p), sub });
      });
    }
    // an App Store refund: as with Stripe's, a Night Pass is cancelled if its night hasn't started
    if (url.pathname === "/apple-refund") {
      const p = await this.storage.get("apple:txn:" + b.transactionId), k = p && "pass:" + p, v = k && (await this.storage.get(k));
      if (!v) return json({ ok: true, pass: null });
      const cancel = v.kind !== "host" && !v.activeUntil && !v.room && !v.revoked;
      await this.storage.put(k, { ...v, ...(cancel ? { revoked: Date.now() } : {}), refunded: v.refunded || Date.now() });
      if (!v.refunded) await this.notify("Refund (App Store): " + shownPass(p), [cancel ? "It hadn’t been played, so its code is now cancelled." : v.room ? "It had already opened a Table, which stays open." : null]);
      return json({ ok: true, pass: shownPass(p), cancelled: cancel });
    }
    // a Host Pass: its subscription's state, as Apple gives it
    if (url.pathname === "/apple-sub") {
      const p = await this.storage.get("apple:orig:" + b.orig), k = p && "pass:" + p, v = k && (await this.storage.get(k)), st = b.status;
      if (!v || !st) return json({ ok: true, pass: null });
      await this.storage.put(k, { ...v, subActive: st.active, subStatus: st.status, subExpires: st.expires, subChecked: Date.now() });
      if (v.subActive && !st.active) await this.notify("A Host Pass (App Store) lapsed: " + shownPass(p), ["Apple says: " + st.status]);
      if (v.subStatus !== st.status) await this.stat("host_pass_status." + String(st.status).replace(/\W+/g, "_"));
      return json({ ok: true, pass: shownPass(p), active: st.active });
    }
    if (url.pathname === "/open") { // a room without a pass: MASTER_PASS (testing) or OPEN_ACCESS (development)
      const expires = Date.now() + hours(env) * 3600000, tier = b.tier in T.RANK && b.tier !== "full" ? b.tier : null; // the app's tiers, for testing them
      return json({ room: await this.room(env, expires, b.master ? "MASTER" : null, tier), expires, ...(b.master ? { test: true } : {}), ...(tier ? { tier } : {}) });
    }
    if (url.pathname === "/stat") { await this.stat(String(b.e || "").slice(0, 60)); return json({ ok: true }); }
    // the app's own events (ads and offers): a few names only, at most three hundred an hour from one address
    if (url.pathname === "/event") {
      const t = Date.now(), rec = (this.evts.get(ip) || []).filter((x) => t - x < 3600000);
      if (rec.length >= 300) return json({ error: "Too many" }, 429);
      rec.push(t); this.evts.set(ip, rec); if (this.evts.size > 5000) this.evts.clear();
      const name = APP_EVENTS.includes(b.e) ? b.e : null, tag = (x) => String(x || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
      if (!name) return json({ error: "Unknown event" }, 400);
      await this.stat([name, tag(b.placement), tag(b.product || b.reason)].filter(Boolean).join("."));
      return json({ ok: true });
    }
    // the admin's view of the app's figures: each day's counts, and each week's host conversion (games at a pass's tier
    // that reached their first round with six or more, of all the app's games that did)
    if (url.pathname === "/app-stats") {
      const days = Math.max(1, Math.min(120, +b.days || 28)), out = [], weeks = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), counts = (await this.storage.get("stat:" + d)) || {};
        out.push({ day: d, counts });
        const w = weekOf(d), wk = (weeks[w] = weeks[w] || { week: w, games6: 0, paid6: 0 });
        for (const t of ["free", "night", "host"]) { const n = counts["round_started." + t + ".6"] || 0; wk.games6 += n; if (t !== "free") wk.paid6 += n; }
      }
      return json({ days: out, conversion: Object.values(weeks).map((w) => ({ ...w, rate: w.games6 ? Math.round((1000 * w.paid6) / w.games6) / 10 : null })) });
    }
    // the app's free games (tiers.js) and its practice games (one person against the bots): no code, so at most twenty
    // of each a day from one address (high enough for people behind one address, such as Apple's reviewers)
    if (url.pathname === "/free") {
      const practice = b.practice === true, key = (practice ? "p:" : "") + ip, t = Date.now(), rec = (this.frees.get(key) || []).filter((x) => t - x < 86400000);
      if (rec.length >= 20) return json({ error: practice ? "That’s all the practice games for today. Try again tomorrow." : "That’s a lot of free games from here today. Try again tomorrow, or use a pass." }, 429);
      rec.push(t); this.frees.set(key, rec); if (this.frees.size > 5000) this.frees.clear();
      const expires = t + hours(env) * 3600000;
      return json({ room: await this.room(env, expires, null, "free", practice), expires, tier: "free", ...(practice ? { practice: true } : {}) });
    }
    // the host of a free game in the app uses a pass on it (GameState's /api/m/upgrade): the game takes the pass's tier
    if (url.pathname === "/attach") {
      if (this.tooMany(ip)) return json({ error: "Too many wrong codes. Try again in an hour." }, 429);
      if (!isPass(b.pass)) { this.failed(ip); return json({ error: "That isn’t a booking code. It looks like OATH-XXXX-XXXX." }, 400); }
      return queued(this.locks, passKey(b.pass), async () => {
        const k = "pass:" + passKey(b.pass);
        let v = await this.storage.get(k);
        if (!v) { this.failed(ip); return json({ error: "We don’t recognise that code." }, 404); }
        if (v.revoked) return json({ error: "That pass has been cancelled." }, 410);
        if (v.pool !== "app" || (v.kind !== "night" && v.kind !== "host")) return json({ error: "That code isn’t a pass bought in the app." }, 403);
        const ok = v.kind === "night" ? await this.nightWindow(env, k, v) : await this.subActive(env, k, v);
        if (ok.res) return ok.res;
        v = ok.v;
        await this.storage.put(k, { ...v, room: b.room, expires: b.expires, games: (v.games || 0) + 1, ...(v.kind === "night" ? { rooms: [...(v.rooms || []), b.room] } : {}) });
        return json({ tier: T.tierFor(v), kind: v.kind, ...(v.activeUntil ? { until: v.activeUntil } : {}) });
      });
    }
    // what the app's codes on a phone can do now (its list of codes): wrong codes count as wrong guesses
    if (url.pathname === "/status") {
      if (this.tooMany(ip)) return json({ error: "Too many wrong codes. Try again in an hour." }, 429);
      const out = [];
      for (const c of (Array.isArray(b.passes) ? b.passes : []).slice(0, 50)) {
        if (!isPass(c)) continue;
        const v = await this.storage.get("pass:" + passKey(c));
        if (!v) { this.failed(ip); continue; }
        if (v.pool !== "app") continue;
        const st = T.statusOf(v, Date.now());
        if (st.state === "ended" && !(await this.played(env, v.rooms))) Object.assign(st, { state: "ready", until: null }); // it comes back when next used
        out.push({ pass: shownPass(c), ...st });
      }
      return json({ codes: out });
    }
    // a subscription changed (renewed, failed, cancelled): its code opens games only while it's active or trialing
    if (url.pathname === "/substatus") {
      const k = "pass:" + passKey(b.pass || ""), v = b.pass && (await this.storage.get(k));
      if (!v || v.kind !== "sub") return json({ ok: true, pass: null });
      const on = ["active", "trialing"].includes(b.status), ended = b.status === "canceled" && v.subStatus !== "canceled";
      await this.storage.put(k, { ...v, subId: b.sub || v.subId, customer: b.customer || v.customer, subActive: on && !v.pending, subStatus: b.status, ...(ended ? { subEnded: Date.now() } : {}) });
      if (ended && !v.pending) await this.notify("A Regular cancelled: " + shownPass(b.pass), ["Email: " + (v.note || "unknown"), v.paid ? "A Regular since " + new Date(v.paid).toUTCString().slice(5, 16) : null]);
      return json({ ok: true, pass: v && shownPass(b.pass), active: on });
    }
    // the Stripe customer behind a subscription code, for the billing portal (wrong codes count as failed guesses)
    if (url.pathname === "/customer") {
      if (this.tooMany(ip)) return json({ error: "Too many wrong codes. Try again in an hour." }, 429);
      const v = isPass(b.pass) && (await this.storage.get("pass:" + passKey(b.pass)));
      if (!v || v.kind !== "sub" || !v.customer) { this.failed(ip); return json({ error: "That isn’t a Regular’s booking code we recognise." }, 404); }
      return json({ customer: v.customer });
    }
    if (url.pathname === "/redeem") {
      if (this.tooMany(ip)) return json({ error: "Too many wrong codes. Try again in an hour." }, 429);
      if (!isPass(b.pass)) { this.failed(ip); return json({ error: "That isn’t a booking code. It looks like OATH-XXXX-XXXX." }, 400); }
      // one redemption of a code at a time: two taps at once (or two tabs) get the same room, not one each
      return queued(this.locks, passKey(b.pass), async () => {
        const k = "pass:" + passKey(b.pass);
        let v = await this.storage.get(k);
        if (!v) { this.failed(ip); return json({ error: "We don’t recognise that booking code. Check it against your receipt." }, 404); }
        if (v.revoked) return json({ error: "That booking has been cancelled." }, 410);
        if (v.pending) return json({ error: "That booking is waiting for its payment to clear. Try again in a minute." }, 402);
        // the app's codes and the website's are separate pools (tiers.js)
        if (b.app && v.pool !== "app") return json({ error: "That booking code is for the website, so it opens Tables there. In the app, start a free game or use a pass bought in the app." }, 403);
        if (!b.app && v.pool === "app") return json({ error: "That code is for The Betrayal app. Open it there." }, 403);
        // a subscription code (the website's Regular, the app's Host Pass), or a Night Pass in its 24 hours: a new game
        // whenever they like, one at a time. Entering it again brings the current game back; asking for a fresh one
        // closes that room and opens another.
        if (v.kind === "sub" || v.kind === "host" || v.kind === "night") {
          // a Night Pass's game outlives its 24 hours (a Table is open for PASS_HOURS): its host can always get back to it
          if (v.kind === "night" && !b.fresh && v.room && Date.now() < v.expires) return json({ room: v.room, expires: v.expires, again: true, sub: false, kind: "night", tier: "night", until: v.activeUntil });
          const ok = v.kind === "night" ? await this.nightWindow(env, k, v) : await this.subActive(env, k, v);
          if (ok.res) return ok.res;
          v = ok.v;
          const tier = T.tierFor(v), sub = v.kind !== "night", extra = { sub, ...(v.pool === "app" ? { kind: v.kind, tier, ...(v.activeUntil ? { until: v.activeUntil } : {}) } : {}) };
          const live = v.room && Date.now() < v.expires;
          if (live && !b.fresh) return json({ room: v.room, expires: v.expires, again: true, ...extra });
          if (live) await env.GAME.get(env.GAME.idFromName("room:" + v.room)).fetch("https://game/_close", { method: "POST", body: "{}" });
          const expires = Date.now() + hours(env) * 3600000, room = await this.room(env, expires, passKey(b.pass), v.pool === "app" ? tier : null);
          await this.storage.put(k, { ...v, room, expires, redeemed: Date.now(), games: (v.games || 0) + 1, ...(v.kind === "night" ? { rooms: [...(v.rooms || []), room] } : {}) });
          return json({ room, expires, ...extra });
        }
        // redeemed already: the same room comes back (a host who lost the link), until it runs out
        if (v.room) return Date.now() < v.expires ? json({ room: v.room, expires: v.expires, again: true }) : json({ error: "That booking has been used, and its game has ended." }, 410);
        const expires = Date.now() + hours(env) * 3600000;
        const room = await this.room(env, expires, passKey(b.pass));
        await this.storage.put(k, { ...v, room, expires, redeemed: Date.now() });
        return json({ room, expires });
      });
    }
    return text("Not found", 404);
  }
}

// the app's events (the Registry's /event), and the Monday that starts a day's week, for the weekly figure
const APP_EVENTS = ["ad_requested", "ad_shown", "ad_failed", "upsell_shown", "upsell_clicked", "purchase_started"];
const weekOf = (day) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------------------------------------------------------
const registry = (env) => env.REGISTRY.get(env.REGISTRY.idFromName("registry"));
const call = (env, path, body) => registry(env).fetch("https://registry" + path, { method: "POST", body: JSON.stringify(body || {}) });
// constant-time compare, so the admin token can't be found a character at a time
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const bearer = (req, env) => !!env.ADMIN_TOKEN && same((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), env.ADMIN_TOKEN);
// The /admin page signs in with ADMIN_USER (var) and ADMIN_PASSWORD (secret) and gets a 12-hour session cookie: the
// expiry, signed with the password, so changing the password signs every session out.
// The cookie names (cc_admin, cc_gate) and the gate's hash prefix keep their cc_ and cloak-and-candle forms: changing
// them would sign every admin and every gate visitor out.
const ADMIN_COOKIE = "cc_admin", ADMIN_HOURS = 12;
async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const sessionFor = async (env, exp) => exp + "." + (await hmacHex(env.ADMIN_PASSWORD, "admin:" + env.ADMIN_USER + ":" + exp));
async function adminSession(req, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return false;
  const c = cookieOf(req, ADMIN_COOKIE), exp = +(c.split(".")[0] || 0);
  return !!exp && Date.now() < exp && same(c, await sessionFor(env, exp));
}
const admin = async (req, env) => bearer(req, env) || (await adminSession(req, env));

// Stripe: a Payment Link or Checkout whose success URL is https://<domain>/claim?session_id={CHECKOUT_SESSION_ID}.
// The page asks us for its pass; we check with Stripe that the session is paid, then mint (once per session).
async function stripeSession(env, id) {
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY } });
  if (!r.ok) return null;
  return r.json();
}
// Stripe's API takes form encoding, nested keys in brackets: {a: {b: [1]}} → a[b][0]=1
const form = (o, pre, out = []) => { for (const [k, v] of Object.entries(o)) { const key = pre ? pre + "[" + k + "]" : k; if (v && typeof v === "object") form(v, key, out); else if (v !== undefined && v !== null) out.push(encodeURIComponent(key) + "=" + encodeURIComponent(v)); } return out.join("&"); };
// Managed Payments (Stripe is the seller of record and handles tax) needs this API version on the Checkout Session call
const MANAGED_PAYMENTS_VERSION = "2026-02-25.preview";
// Discount codes are Stripe promotion codes; pinned to the version whose shape this code speaks (a promotion code names
// its coupon in promotion[coupon])
const PROMO_VERSION = "2025-09-30.clover";
// A feedback survey's answers (site/pages/survey.html), checked: the five questions are required, the box and the quote
// are not
const SURVEY = { setup: ["Very easy", "Easy", "A bit fiddly", "Difficult"], length: ["Too short", "About right", "Too long"], again: ["Yes", "Maybe", "No"] };
function surveyAnswers(x) {
  x = x && typeof x === "object" ? x : {};
  const overall = +x.overall, recommend = +x.recommend;
  if (!(Number.isInteger(overall) && overall >= 1 && overall <= 5)) return { error: "Choose how the game was, from 1 to 5." };
  if (!(Number.isInteger(recommend) && recommend >= 0 && recommend <= 10)) return { error: "Choose how likely you are to recommend it, from 0 to 10." };
  for (const k of ["setup", "length", "again"]) if (!SURVEY[k].includes(x[k])) return { error: "Answer all five questions." };
  return { overall, recommend, setup: x.setup, length: x.length, again: x.again, comment: clip(String(x.comment || "").trim(), 2000), quote: x.quote === true, name: clip(String(x.name || "").trim(), 40) };
}
const surveyOf = (b) => /^[a-z2-9]{24}$/.test(String(b.t || "")) ? "survey:" + b.t : null;
// A checkout counts as paid when Stripe took the money, or when a discount made it free (no_payment_required)
const settled = (s) => !!s && (s.payment_status === "paid" || s.payment_status === "no_payment_required");
async function stripePost(env, path, params, version) {
  const headers = { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded", ...(version ? { "Stripe-Version": version } : {}) };
  const r = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers, body: form(params) });
  const j = await r.json().catch(() => ({})); return r.ok ? j : Promise.reject(new Error((j.error && j.error.message) || "Stripe error " + r.status));
}
// A webhook is genuine when Stripe-Signature carries an HMAC-SHA256 of "timestamp.body" under the endpoint's signing
// secret (STRIPE_WEBHOOK_SECRET), and the timestamp is within five minutes.
async function stripeVerified(req, env, body) {
  const h = req.headers.get("Stripe-Signature") || "", t = (h.match(/(?:^|,)t=(\d+)/) || [])[1], sigs = [...h.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map((m) => m[1]);
  if (!env.STRIPE_WEBHOOK_SECRET || !t || !sigs.length || Math.abs(Date.now() / 1000 - +t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => same(s, mac));
}
const piOf = (x) => (x && typeof x === "object" ? x.id : x) || null;
// where a buyer came from, as the buy page sends it (the site's "bt-src": utm_ tags, an ad click id, the referring site):
// one short line for the admin and Stripe, e.g. "instagram · bio", "google ads · traitors game at home" (utm_term, from a
// Google Ads final URL suffix of utm_term={keyword}), "google.com", or "direct"
function sourceOf(x) {
  const t = (k) => String((x && x[k]) || "").toLowerCase().replace(/[^a-z0-9 ._\/-]/g, "").slice(0, 40).trim();
  const head = t("src") || t("click") || t("ref"), line = [head, t("med"), t("camp"), t("term")].filter(Boolean).join(" · ");
  const extra = t("src") && t("ref") && t("ref") !== t("src") ? " (via " + t("ref") + ")" : "";
  return { from: (line || "direct") + extra, land: String((x && x.land) || "").replace(/[^A-Za-z0-9\/_.-]/g, "").slice(0, 80) };
}
async function stripeGet(env, path, version) {
  const r = await fetch("https://api.stripe.com/v1/" + path, { headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, ...(version ? { "Stripe-Version": version } : {}) } });
  const j = await r.json().catch(() => ({})); return r.ok ? j : Promise.reject(new Error((j.error && j.error.message) || "Stripe error " + r.status));
}
// A discount code, as the admin and the checkout see it, from a Stripe promotion code. "plans" (in its metadata, set when
// it's made here) is "one" (a Table only) or "both" (the Regular's first month too); a code made in Stripe's dashboard
// counts as "one".
function discountOf(x) {
  const c = (x.promotion && typeof x.promotion.coupon === "object" && x.promotion.coupon) || (typeof x.coupon === "object" && x.coupon) || {}, md = x.metadata || {};
  const percent = typeof c.percent_off === "number" ? c.percent_off : +md.percent || null;
  return { id: x.id, code: x.code, active: !!x.active, percent, amountOff: typeof c.amount_off === "number" ? c.amount_off / 100 : null, plans: md.plans === "both" ? "both" : "one",
    used: x.times_redeemed || 0, max: x.max_redemptions || null, expires: x.expires_at ? x.expires_at * 1000 : null, created: x.created ? x.created * 1000 : null, here: md.by === "admin" };
}
const discountLive = (d) => d.active && (!d.expires || d.expires > Date.now()) && (!d.max || d.used < d.max);
// A refund, from whichever event carried it. The pass is found by the payment we noted at checkout; failing that, Stripe
// is asked which checkout (and so which pass) the payment belonged to, or which subscription the invoice was for.
async function refundFor(env, x) {
  let r = await (await call(env, "/refund", x)).json();
  if (r.pass || !env.STRIPE_SECRET_KEY) return { ...r, via: "payment" };
  const tries = [], get = (path) => stripeGet(env, path).catch((e) => { tries.push(path.split("?")[0].split("/")[0] + ": " + e.message); return null; });
  if (x.charge && (!x.pi || !x.invoice)) { const ch = await get("charges/" + encodeURIComponent(x.charge)); if (ch) { x.pi = x.pi || piOf(ch.payment_intent); x.invoice = x.invoice || piOf(ch.invoice); } }
  if (x.pi) {
    const ss = await get("checkout/sessions?limit=1&payment_intent=" + encodeURIComponent(x.pi)), cs = ss && ss.data && ss.data[0];
    if (cs) { r = await (await call(env, "/refund", { ...x, pass: cs.metadata && cs.metadata.pass, sub: piOf(cs.subscription) })).json(); if (r.pass) return { ...r, via: "checkout session" }; }
  }
  if (x.invoice) {
    const inv = await get("invoices/" + encodeURIComponent(x.invoice));
    const sub = inv && (piOf(inv.subscription) || piOf(inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription));
    if (sub) { r = await (await call(env, "/refund", { ...x, sub })).json(); if (r.pass) return { ...r, via: "invoice" }; }
  }
  return { pass: null, error: "No pass found for this payment" + (tries.length ? " (" + tries.join("; ") + ")" : "") };
}

// A card refused at checkout. Its pass is found through the checkout session that made the payment (a subscription's
// first payment arrives as invoice.payment_failed instead).
const declined = (e) => (e && (e.message || e.decline_code || e.code)) || "payment refused";
async function failFor(env, o) {
  let pass = o.metadata && o.metadata.pass;
  if (!pass && o.id && env.STRIPE_SECRET_KEY) {
    const ss = await stripeGet(env, "checkout/sessions?limit=1&payment_intent=" + encodeURIComponent(o.id)).catch(() => null), cs = ss && ss.data && ss.data[0];
    pass = cs && cs.metadata && cs.metadata.pass;
  }
  if (!pass) return { pass: null, note: "not a checkout of ours" };
  return (await call(env, "/fail", { pass, why: declined(o.last_payment_error) })).json();
}
// When a checkout expires, was a payment tried? Its payment (if it got that far) remembers the last refusal.
async function triedFor(env, pi) {
  if (!pi || !env.STRIPE_SECRET_KEY) return null;
  const x = await stripeGet(env, "payment_intents/" + encodeURIComponent(pi)).catch(() => null);
  return x && x.last_payment_error ? declined(x.last_payment_error) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Pre-launch password gate. With SITE_PASSWORD set, every request — pages, assets, API — needs the gate cookie; without
// it the visitor gets a small password page. Remove SITE_PASSWORD (wrangler.toml [vars]) to open the site to the public.
const GATE_COOKIE = "cc_gate";
async function gateToken(pw) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("cloak-and-candle-gate:" + pw));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const cookieOf = (req, name) => { const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? m[1] : ""; };
const gatePage = (next, wrong) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>The Betrayal</title>
<style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(90vw 60vh at 50% 0,#2a1630,transparent 70%),#09070a;color:#e8d0c8;font:18px/1.4 system-ui,sans-serif}
form{width:min(340px,86vw);text-align:center}svg{width:84px;height:98px;color:#e6a58c;margin:0 auto 14px;display:block}h1{font:600 30px/1.1 Georgia,serif;margin:0 0 6px}p{color:#afa198;font-size:15px;margin:0 0 18px}
input{width:100%;box-sizing:border-box;min-height:52px;padding:12px 14px;border-radius:10px;border:1px solid rgba(230,165,140,.45);background:#100b11;color:#e8d0c8;font-size:18px}
button{margin-top:10px;width:100%;min-height:52px;border-radius:10px;border:1px solid #e6a58c;background:linear-gradient(180deg,#eaac93,#b5664b 55%,#8a4731);color:#150b17;font-weight:700;font-size:17px}.err{color:#ff9dbf;margin-top:10px;font-size:15px}</style></head>
<body><form method="post" action="/__gate"><svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M60 5l55 65-55 65L5 70z"/><path d="M60 16l44 54-44 54-44-54z" stroke-width="1"/><path d="M60 29C51 35 44.5 44 44 56c-.3 6 1.5 8-.5 14-2.5 8-1.5 17-3.5 26h40c-2-9-1-18-3.5-26-2-6-.2-8-.5-14-.5-12-7-21-16-27z"/><path d="M60 48c3 4.4 4.6 7.2 4.6 9.5a4.6 4.6 0 0 1-9.2 0c0-2.3 1.6-5.1 4.6-9.5z" fill="currentColor" fill-opacity=".35"/></svg>
<h1>The Betrayal</h1><p>Coming soon. Enter the password to continue.</p><input type="password" name="password" autocomplete="current-password" aria-label="Password" autofocus required>
<input type="hidden" name="next" value="${String(next).replace(/[&<>"']/g, "")}"><button>Enter</button>${wrong ? '<div class="err" role="alert">That’s not it.</div>' : ""}</form></body></html>`,
  { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
async function gate(req, env) {
  if (!env.SITE_PASSWORD) return null;
  if (new URL(req.url).pathname.startsWith("/api/admin/")) return null; // has its own token
  if (new URL(req.url).pathname === "/api/stripe/webhook") return null; // Stripe has no cookie; it signs every call instead
  if (new URL(req.url).pathname === "/api/appstore/notify") return null; // nor has Apple; each notice only prompts a look at Apple's own records
  const want = await gateToken(env.SITE_PASSWORD), url = new URL(req.url);
  if (url.pathname === "/__gate" && req.method === "POST") {
    const form = await req.formData().catch(() => null), pw = form ? String(form.get("password") || "") : "";
    let next = form ? String(form.get("next") || "/") : "/"; if (!next.startsWith("/") || next.startsWith("//")) next = "/";
    if (!same(pw, env.SITE_PASSWORD)) return gatePage(next, true);
    return new Response(null, { status: 303, headers: { Location: next, "Set-Cookie": `${GATE_COOKIE}=${want}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`, "Cache-Control": "no-store" } });
  }
  if (same(cookieOf(req, GATE_COOKIE), want)) return null;
  if (url.pathname.startsWith("/api/")) return json({ error: "Password required" }, 401);
  return gatePage(url.pathname + url.search, false);
}

export default {
  // every morning (wrangler.toml [triggers]): the last 24 hours' sales, Tables, reports and errors, by email to ALERT_TO
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => { const d = await (await call(env, "/digest")).json(); await alertMail(env, d.subject, d.body + "\n\nhttps://" + (env.SITE_HOST || "thebetrayal.co.uk") + "/admin"); })()
      .catch((e) => logErr(env, { src: "server", where: "morning summary", msg: clip(e && e.message || e, 300) })));
  },
  async fetch(req, env) {
    try { return await route(req, env); }
    catch (err) { logErr(env, { src: "server", where: req.method + " " + new URL(req.url).pathname, msg: err.message, stack: clip(err.stack, 1500) }); return json({ error: "Something went wrong on our side." }, 500); }
  },
};
async function route(req, env) {
    // The domain: SITE_HOST is the one address. www. and the domains in OLD_HOSTS (cloakandcandle.co.uk) send every page
    // there, with /g/ addresses sent to /t/; the API answers on every domain, so a Stripe webhook or an open Table
    // pointed at one of them keeps working.
    const u0 = new URL(req.url), home = env.SITE_HOST;
    if (home && u0.hostname !== home) {
      const old = String(env.OLD_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
      if (u0.hostname === "www." + home || (old.includes(u0.hostname) && !u0.pathname.startsWith("/api/")))
        return Response.redirect("https://" + home + u0.pathname.replace(/^\/g\//, "/t/") + u0.search, 301);
    }
    const locked = await gate(req, env); if (locked) return locked;
    const url = new URL(req.url), p = url.pathname;
    const g = p.match(/^\/api\/g\/([A-Za-z0-9]{6})\/(state|settings|events|m|m\/create|m\/join|m\/act|m\/upgrade)$/);
    if (g) {
      const code = g[1].toUpperCase(); if (!isRoom(code)) return json({ error: "No game with that code" }, 404);
      const inner = new URL(req.url); inner.pathname = "/api/" + g[2];
      // too big for a Modern request: refused here, before it's streamed to the room (refused there unread, the stream
      // could break and become a 500)
      if (g[2].startsWith("m") && +(req.headers.get("Content-Length") || 0) > 65536) return json({ error: "Too large" }, 413);
      return env.GAME.get(env.GAME.idFromName("room:" + code)).fetch(new Request(inner, req));
    }
    // the feedback survey's page (/survey?t=…): read its survey, answer it, or stop feedback emails to its address
    if (p === "/api/survey" && req.method === "GET") return call(env, "/survey-get", { t: url.searchParams.get("t") });
    if (p === "/api/survey" && req.method === "POST") { const b = await req.json().catch(() => ({})); return call(env, b.stop ? "/survey-stop" : "/survey-answer", { t: b.t, answers: b.answers }); }
    // "Report a problem": the form, a snapshot of the screen, the trail of taps. The room is kept 90 days for its replay.
    if (p === "/api/report" && req.method === "POST") {
      const raw = await req.text(); if (raw.length > 4500000) return json({ error: "That report is too large to send." }, 413);
      let b; try { b = JSON.parse(raw); } catch { return json({ error: "Bad JSON" }, 400); }
      if (!clip(b.what, 4000).trim()) return json({ error: "Tell us what went wrong." }, 400);
      const code = isRoom(String(b.room || "").toUpperCase()) ? String(b.room).toUpperCase() : null;
      let rec = 0; const id0 = Math.random().toString(36).slice(2, 8);
      if (code) { const k = await env.GAME.get(env.GAME.idFromName("room:" + code)).fetch("https://game/_keep", { method: "POST", body: JSON.stringify({ id: id0, until: Date.now() + 90 * 86400000 }) }); if (k.ok) rec = (await k.json()).rec || 0; }
      const rr = await registry(env).fetch("https://registry/report", { method: "POST", headers: { "CF-Connecting-IP": req.headers.get("CF-Connecting-IP") || "?" }, body: JSON.stringify({ ...b, room: code, rec }) });
      const r = await rr.json(); if (!rr.ok) return json(r, rr.status);
      logErr(env, { src: "report", room: code, report: r.id, msg: clip(b.what, 300), device: clip(b.device, 16), host: !!b.host });
      const contact = clip(b.url, 200) === "/contact", mail = clip(b.email, 200).trim(), site = "https://" + (env.SITE_HOST || "thebetrayal.co.uk");
      await alertMail(env, (contact ? "Message " : "Problem report ") + r.id + ": " + clip(b.what, 60).trim(),
        [contact ? "A message from the contact page." : "A problem reported from " + (b.host ? "the host's phone" : clip(b.device, 16) || "a device") + (code ? " in room " + code : "") + ".",
          "", "From: " + (mail || "(no email given)"), "", clip(b.what, 4000).trim(), ...(clip(b.expected, 2000).trim() ? ["", "Expected: " + clip(b.expected, 2000).trim()] : []),
          "", "Reference " + r.id + ". Reply to this email to answer them" + (mail ? "" : " (they left no address)") + ".", "Open it on " + site + "/admin (Reports)."].join("\n"), mail);
      return json({ id: r.id });
    }
    if (p === "/api/games" && req.method === "POST") {
      const b = await req.json().catch(() => ({})), app = b.app === true, ip = req.headers.get("CF-Connecting-IP") || "?";
      // the iPhone app (tiers.js): no code is a free game
      if (app && !b.pass) return registry(env).fetch("https://registry/free", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ practice: b.practice === true }) });
      if (env.OPEN_ACCESS === "1" && !b.pass) return call(env, "/open");
      // the master passcode (Worker secret MASTER_PASS) opens a fresh room every time, for testing; in the app, at any tier
      const up = (v) => String(v || "").trim().toUpperCase();
      if (env.MASTER_PASS && same(up(b.pass), up(env.MASTER_PASS))) return call(env, "/open", { master: true, ...(app ? { tier: b.tier } : {}) });
      return registry(env).fetch("https://registry/redeem", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ pass: b.pass, fresh: b.fresh === true, ...(app ? { app } : {}) }) });
    }
    // the app's events (ads and offers), counted by day with nothing about who sent them
    if (p === "/api/app/event" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      return registry(env).fetch("https://registry/event", { method: "POST", headers: { "CF-Connecting-IP": req.headers.get("CF-Connecting-IP") || "?" }, body: JSON.stringify(b) });
    }
    // the app's list of codes: what each can do now (tiers.js)
    if (p === "/api/app/codes" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      return registry(env).fetch("https://registry/status", { method: "POST", headers: { "CF-Connecting-IP": req.headers.get("CF-Connecting-IP") || "?" }, body: JSON.stringify({ passes: b.passes }) });
    }
    // Buy: the /buy page posts both ticks here; we open a pending pass and a Checkout Session for it, and send the buyer
    // to Stripe. Settings: STRIPE_SECRET_KEY (secret), STRIPE_PRICE_ID (var: the one-party Table's Price), STRIPE_SUB_PRICE_ID
    // (var: the Regular's monthly Price).
    // the broken seal: the QR code in the home page's picture leads to /seal, which gives 10% off one party: Stripe's
    // promotion code STRIPE_EGG_PROMO (promo_…, the code QR10), applied for the buyer. Unset, the seal offers nothing.
    if (p === "/api/egg") return json({ on: !!env.STRIPE_EGG_PROMO });
    if (p === "/api/checkout" && req.method === "POST") {
      const b = await req.json().catch(() => ({})), sub = b.plan === "sub", code = String(b.discount || "").trim().toUpperCase();
      const egg = !sub && !code && b.egg === true && !!env.STRIPE_EGG_PROMO;
      const price = sub ? env.STRIPE_SUB_PRICE_ID : env.STRIPE_PRICE_ID;
      if (!env.STRIPE_SECRET_KEY || !price) return json({ error: "Tables go on sale soon. Payments aren’t open yet." }, 503);
      if (b.terms !== true || b.supply !== true) return json({ error: "Tick both boxes to continue." }, 400);
      // a discount code the buyer typed (one made in the admin, or any live Stripe promotion code): checked before a
      // pending code is made, and applied through discounts; if Stripe then refuses it, the buyer is told
      let disc = null;
      if (code) {
        const bad = (m) => json({ error: m, field: "discount" }, 400);
        if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return bad("That discount code isn’t right. Check it and try again, or clear it.");
        let found; try { found = await stripeGet(env, "promotion_codes?active=true&limit=1&code=" + encodeURIComponent(code) + "&expand[]=data.promotion.coupon", PROMO_VERSION); }
        catch (e) { logErr(env, { src: "stripe", where: "discount", msg: "Stripe wouldn’t look up a discount code: " + e.message }); return json({ error: "We couldn’t check that discount code. Try again in a moment." }, 502); }
        const x = found && found.data && found.data[0]; disc = x && discountOf(x);
        if (!disc || !discountLive(disc)) return bad(disc && disc.max && disc.used >= disc.max ? "That discount code has been used up." : disc && disc.expires && disc.expires <= Date.now() ? "That discount code has expired." : "That discount code isn’t right. Check it and try again, or clear it.");
        if (sub && disc.plans !== "both") return bad("That discount code is for booking one party, not the Regular plan.");
      }
      const ip = req.headers.get("CF-Connecting-IP") || "?";
      const from = sourceOf(b.src);
      const pr = await registry(env).fetch("https://registry/pending", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ kind: sub ? "sub" : "one", ...from, ...(b.nomail === true ? { noMail: true } : {}) }) }), pj = await pr.json();
      if (!pr.ok) return json(pj, pr.status);
      const pass = pj.pass, at = new Date().toISOString();
      try {
        const common = {
          line_items: [{ price, quantity: 1 }], success_url: url.origin + "/claim?session_id={CHECKOUT_SESSION_ID}", cancel_url: url.origin + "/buy",
          client_reference_id: pass, managed_payments: { enabled: "true" }, metadata: { pass, plan: sub ? "sub" : "one", ...(egg ? { egg: "10% off" } : {}), ...(disc ? { discount: disc.code } : {}), source: from.from, landing: from.land || "", consent_terms: at, consent_supply: at, ...(b.nomail === true ? { feedback_emails: "no" } : {}) },
        };
        // Stripe Managed Payments (Stripe is the seller of record and handles tax): managed_payments[enabled] and the preview
        // API version, and nothing it refuses (invoice details, extra descriptions) — just what the game needs: the pass in
        // the metadata (and, for a subscription, the subscription's metadata, which its webhooks bring back).
        const params = sub ? { ...common, mode: "subscription", subscription_data: { metadata: { pass } } } : { ...common, mode: "payment" };
        if (disc) params.discounts = [{ promotion_code: disc.id }];
        let cs;
        if (egg) {
          // the seal's discount; if Stripe won't take it, the sale still goes ahead at the full price (shown on Stripe's page
          // before paying), and the admin's error log says why
          try { cs = await stripePost(env, "checkout/sessions", { ...params, discounts: [{ promotion_code: env.STRIPE_EGG_PROMO }] }, MANAGED_PAYMENTS_VERSION); }
          catch (e) { logErr(env, { src: "stripe", where: "checkout", msg: "Stripe refused the broken seal's promotion code, so this buyer was charged full price: " + e.message }); delete params.metadata.egg; }
        }
        if (!cs) cs = await stripePost(env, "checkout/sessions", params, MANAGED_PAYMENTS_VERSION);
        await call(env, "/pending-session", { pass, session: cs.id });
        return json({ url: cs.url });
      } catch (e) {
        await call(env, "/cancel", { pass, why: "could not start" });
        console.error("Stripe checkout refused:", e.message); // Workers → Logs, the admin's error log, and under the Pay button
        logErr(env, { src: "stripe", where: "checkout", msg: "Stripe wouldn’t start a checkout: " + e.message });
        return json({ error: "We couldn’t start the checkout. Try again in a moment.", detail: "Stripe said: " + e.message }, 502);
      }
    }
    // Stripe's webhook (endpoint https://<domain>/api/stripe/webhook): activates passes when payment clears, cancels
    // them when a checkout expires or is refunded before use. Secret: STRIPE_WEBHOOK_SECRET.
    if (p === "/api/stripe/webhook" && req.method === "POST") {
      const body = await req.text();
      if (!(await stripeVerified(req, env, body))) { logErr(env, { src: "stripe", where: "webhook", msg: env.STRIPE_WEBHOOK_SECRET ? "A webhook call failed its signature check" : "STRIPE_WEBHOOK_SECRET isn’t set, so webhooks are refused" }); return json({ error: "Bad signature" }, 400); }
      let ev; try { ev = JSON.parse(body); } catch { return json({ error: "Bad JSON" }, 400); }
      const o = (ev.data && ev.data.object) || {}, pass = o.metadata && o.metadata.pass;
      let result = "ignored";
      if ((ev.type === "checkout.session.completed" && settled(o)) || ev.type === "checkout.session.async_payment_succeeded")
        result = await (await call(env, "/claim", { session: o.id, email: (o.customer_details && o.customer_details.email) || "", pass, pi: piOf(o.payment_intent), sub: piOf(o.subscription), customer: piOf(o.customer), disc: o.metadata && o.metadata.discount, amount: o.amount_total })).json();
      else if ((ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.created" || ev.type === "customer.subscription.deleted") && pass)
        result = await (await call(env, "/substatus", { pass, sub: o.id, customer: piOf(o.customer), status: ev.type === "customer.subscription.deleted" ? "canceled" : o.status })).json();
      else if (ev.type === "checkout.session.async_payment_failed" && pass) {
        await call(env, "/fail", { pass, why: "the bank payment didn’t go through" });
        result = await (await call(env, "/cancel", { pass, why: "payment failed" })).json();
      } else if (ev.type === "checkout.session.expired" && pass) result = await (await call(env, "/cancel", { pass, why: "expired", tried: await triedFor(env, piOf(o.payment_intent)) })).json();
      else if (ev.type === "payment_intent.payment_failed") result = await failFor(env, o);
      else if (ev.type === "invoice.payment_failed") {
        const sd = (o.parent && o.parent.subscription_details) || o.subscription_details || {};
        result = await (await call(env, "/fail", { pass: sd.metadata && sd.metadata.pass, sub: piOf(sd.subscription) || piOf(o.subscription), why: "subscription payment failed" + (o.attempt_count > 1 ? " (attempt " + o.attempt_count + ")" : "") })).json();
      }
      else if (ev.type === "charge.refunded" && o.amount_refunded > 0) result = await refundFor(env, { pi: piOf(o.payment_intent), charge: o.id, invoice: piOf(o.invoice), amount: o.amount_refunded });
      else if ((ev.type === "refund.created" || ev.type === "refund.updated" || ev.type === "charge.refund.updated") && ["succeeded", "pending"].includes(o.status))
        result = await refundFor(env, { pi: piOf(o.payment_intent), charge: piOf(o.charge), amount: o.amount });
      await call(env, "/hook", { type: ev.type, id: ev.id, obj: o.id || null, live: !!ev.livemode, pass: (result && result.pass) || pass || null, result: typeof result === "string" ? result : clip(JSON.stringify(result), 300) });
      if (result && result.error) logErr(env, { src: "stripe", where: ev.type, msg: result.error, obj: o.id || "" });
      return json({ received: true });
    }
    // The iPhone app's purchases (appstore.js): a purchase, checked with Apple, becomes a booking code. Unknown purchases
    // count as wrong guesses, as wrong booking codes do.
    if (p === "/api/appstore/claim" && req.method === "POST") {
      const ip = req.headers.get("CF-Connecting-IP") || "?", hdr = { "CF-Connecting-IP": ip };
      const g = await registry(env).fetch("https://registry/signin-check", { method: "POST", headers: hdr, body: "{}" });
      if (!g.ok) return json(await g.json(), g.status);
      const b = await req.json().catch(() => ({}));
      const r = await AS.purchase(env, b.jws);
      if (r.error) {
        if (r.unknown || r.status === 400) await registry(env).fetch("https://registry/signin-failed", { method: "POST", headers: hdr, body: "{}" });
        if (r.why) logErr(env, { src: "appstore", where: "claim", msg: r.error + " " + clip(r.why, 300) });
        return json({ error: r.error }, r.status);
      }
      const status = r.txn.kind === "host" ? await AS.subscription(env, r.txn.originalTransactionId, r.txn) : null;
      return call(env, "/apple-claim", { txn: r.txn, kind: r.txn.kind, status });
    }
    // App Store Server Notifications, version 2 (App Store Connect → the app → App Information → Production and Sandbox
    // Server URL: https://<domain>/api/appstore/notify). A refund cancels an unplayed Table's code; a Regular's renewal,
    // lapse or refund updates its code. Each notice only prompts a fresh look at Apple's own records.
    if (p === "/api/appstore/notify" && req.method === "POST") {
      const n = AS.notice(await req.json().catch(() => null));
      if (!n) return json({ error: "Bad notification" }, 400);
      const P = AS.productsOf(env);
      let result = "ignored";
      if (n.productId === P.night && n.jws && ["REFUND", "REVOKE"].includes(n.type)) {
        const r = await AS.purchase(env, n.jws);
        result = r.txn && r.txn.revocationDate ? await (await call(env, "/apple-refund", { transactionId: r.txn.transactionId })).json() : r.error || "Apple shows no refund";
      } else if (n.productId === P.host && n.orig) {
        const st = await AS.subscription(env, n.orig, null);
        result = st ? await (await call(env, "/apple-sub", { orig: n.orig, status: st })).json() : "Apple couldn’t be asked";
      }
      await call(env, "/hook", { type: "appstore " + n.type + (n.subtype ? "/" + n.subtype : ""), id: n.uuid, obj: n.transactionId, live: n.environment === "Production", pass: (result && result.pass) || null, result: typeof result === "string" ? result : clip(JSON.stringify(result), 300) });
      return json({ received: true });
    }
    // Subscribers manage their card or cancel in Stripe's billing portal, reached with their code.
    if (p === "/api/portal" && req.method === "POST") {
      if (!env.STRIPE_SECRET_KEY) return json({ error: "Payments aren’t set up yet." }, 503);
      const b = await req.json().catch(() => ({})), ip = req.headers.get("CF-Connecting-IP") || "?";
      const r = await registry(env).fetch("https://registry/customer", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ pass: b.pass }) }), j = await r.json();
      if (!r.ok) return json(j, r.status);
      try { const ps = await stripePost(env, "billing_portal/sessions", { customer: j.customer, return_url: url.origin + "/" }); return json({ url: ps.url }); }
      catch (e) { console.error("Stripe portal refused:", e.message); return json({ error: "We couldn’t open the subscription page. Try again in a moment.", detail: "Stripe said: " + e.message }, 502); }
    }
    if (p === "/api/claim" && req.method === "GET") {
      const id = url.searchParams.get("session_id") || "";
      if (!env.STRIPE_SECRET_KEY) return json({ error: "Payments aren’t set up yet." }, 503);
      if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return json({ error: "That isn’t a checkout session." }, 400);
      const s = await stripeSession(env, id);
      if (!settled(s)) return json({ error: "We can’t see a completed payment for this checkout yet. Refresh in a moment." }, 402);
      const cr = await call(env, "/claim", { session: id, email: (s.customer_details && s.customer_details.email) || "", pass: s.metadata && s.metadata.pass, pi: piOf(s.payment_intent), sub: piOf(s.subscription), customer: piOf(s.customer), disc: s.metadata && s.metadata.discount, amount: s.amount_total });
      if (!cr.ok) return cr;
      return json({ ...(await cr.json()), value: typeof s.amount_total === "number" ? s.amount_total / 100 : null }); // what was paid, for the ad conversion
    }
    if (p === "/api/admin/login" && req.method === "POST") {
      if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return json({ error: "The admin sign-in isn’t set up." }, 503);
      const ip = req.headers.get("CF-Connecting-IP") || "?", hdr = { "CF-Connecting-IP": ip };
      const gate2 = await registry(env).fetch("https://registry/signin-check", { method: "POST", headers: hdr, body: "{}" });
      if (!gate2.ok) return json(await gate2.json(), gate2.status);
      const b = await req.json().catch(() => ({}));
      if (!(same(String(b.user || "").trim().toLowerCase(), String(env.ADMIN_USER).toLowerCase()) & same(String(b.password || ""), env.ADMIN_PASSWORD))) {
        await registry(env).fetch("https://registry/signin-failed", { method: "POST", headers: hdr, body: "{}" });
        return json({ error: "That username and password don’t match." }, 401);
      }
      const exp = Date.now() + ADMIN_HOURS * 3600000;
      return json({ ok: true, until: exp }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=${await sessionFor(env, exp)}; Path=/; Max-Age=${ADMIN_HOURS * 3600}; HttpOnly; Secure; SameSite=Strict` });
    }
    if (p === "/api/admin/logout" && req.method === "POST") return json({ ok: true }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
    if (p.startsWith("/api/admin/")) {
      if (!(await admin(req, env))) return json({ error: "Not allowed" }, 401);
      // a signed-in browser may only act from this site's own pages
      const origin = req.headers.get("Origin");
      if (req.method !== "GET" && !bearer(req, env) && origin && origin !== url.origin) return json({ error: "Not allowed" }, 403);
      if (p === "/api/admin/me") return json({ ok: true, user: env.ADMIN_USER || "token" });
      if (p === "/api/admin/room" && req.method === "POST") return call(env, "/open", { master: true });
      if (p === "/api/admin/passes" && req.method === "POST") return call(env, "/mint", await req.json().catch(() => ({})));
      if (p === "/api/admin/passes" && req.method === "GET") return registry(env).fetch("https://registry/list");
      if (p === "/api/admin/app-stats" && req.method === "GET") return call(env, "/app-stats", { days: +url.searchParams.get("days") || 28 });
      if (p === "/api/admin/revoke" && req.method === "POST") return call(env, "/revoke", await req.json().catch(() => ({})));
      if (p === "/api/admin/resend" && req.method === "POST") return call(env, "/resend", await req.json().catch(() => ({})));
      if (p === "/api/admin/survey" && req.method === "POST") return call(env, "/survey-send", await req.json().catch(() => ({})));
      if (p === "/api/admin/surveys") return registry(env).fetch("https://registry/surveys");
      if (p === "/api/admin/extend" && req.method === "POST") return call(env, "/extend", await req.json().catch(() => ({})));
      if (p === "/api/admin/setemail" && req.method === "POST") return call(env, "/setemail", await req.json().catch(() => ({})));
      if (p === "/api/admin/delete" && req.method === "POST") return call(env, "/delete", await req.json().catch(() => ({})));
      if (p.startsWith("/api/admin/discounts")) {
        if (!env.STRIPE_SECRET_KEY) return json({ error: "Stripe isn’t set up, so there are no discount codes." }, 503);
        try {
          if (req.method === "GET") return json({ discounts: ((await stripeGet(env, "promotion_codes?limit=100&expand[]=data.promotion.coupon", PROMO_VERSION)).data || []).map(discountOf) });
          const b = await req.json().catch(() => ({}));
          if (p === "/api/admin/discounts/off") { if (!/^promo_\w+$/.test(String(b.id || ""))) return json({ error: "No such discount code." }, 400); return json(discountOf(await stripePost(env, "promotion_codes/" + b.id, { active: "false" }, PROMO_VERSION))); }
          const code = String(b.code || "").trim().toUpperCase(), pct = Number(b.percent), max = b.max ? Number(b.max) : null, exp = b.expires ? Date.parse(b.expires + "T23:59:59Z") : null;
          if (!/^[A-Z0-9]{3,20}$/.test(code)) return json({ error: "A code is 3 to 20 letters and numbers, like TESTFREE or SPRING20." }, 400);
          if (!Number.isInteger(pct) || pct < 1 || pct > 100) return json({ error: "The discount is a whole percentage from 1 to 100." }, 400);
          if (max !== null && (!Number.isInteger(max) || max < 1 || max > 100000)) return json({ error: "Uses must be a whole number, or blank for no limit." }, 400);
          if (exp !== null && !(exp > Date.now())) return json({ error: "The end date must be in the future." }, 400);
          const plans = b.plans === "both" ? "both" : "one", md = { by: "admin", percent: String(pct), plans };
          const cp = await stripePost(env, "coupons", { percent_off: pct, duration: "once", name: code + " (" + pct + "% off)", metadata: md }, PROMO_VERSION);
          const pc = await stripePost(env, "promotion_codes", { promotion: { type: "coupon", coupon: cp.id }, code, ...(max ? { max_redemptions: max } : {}), ...(exp ? { expires_at: Math.floor(exp / 1000) } : {}), metadata: md }, PROMO_VERSION);
          return json({ ...discountOf(pc), percent: pct });
        } catch (e) { return json({ error: "Stripe said: " + e.message }, 502); }
      }
      if (p === "/api/admin/rooms") return registry(env).fetch("https://registry/rooms");
      if (p === "/api/admin/errors") return registry(env).fetch("https://registry/errs");
      if (p === "/api/admin/hooks") return registry(env).fetch("https://registry/hooks");
      if (p === "/api/admin/reports") return registry(env).fetch("https://registry/reports");
      if (p === "/api/admin/report" && req.method === "GET") return call(env, "/report-get", { id: url.searchParams.get("id") });
      if (p === "/api/admin/report" && req.method === "POST") return call(env, "/report-status", await req.json().catch(() => ({})));
      const ar = p.match(/^\/api\/admin\/room\/([A-Za-z0-9]{6})\/(room|recs|rec|events)$/);
      if (ar) { const inner = new URL("https://game/_admin/" + ar[2]); inner.search = url.search; return env.GAME.get(env.GAME.idFromName("room:" + ar[1].toUpperCase())).fetch(inner); }
      return json({ error: "Not found" }, 404);
    }
    if (p.startsWith("/api/")) return json({ error: "Not found" }, 404);
    // a Table: the game page (TV at /t/CODE, Keeper at /t/CODE#keeper; /g/CODE serves the same page). A Modern
    // Table's /t/CODE is its TV, and /m/CODE is where its phones play; /join is Modern's "enter the code" page.
    if (/^\/[gtm]\/[A-Za-z0-9]{6}\/?$/.test(p)) {
      const code = p.slice(3, 9).toUpperCase();
      if (p.slice(3, 9) !== code) return Response.redirect(url.origin + p.slice(0, 3) + code + url.search + url.hash, 301);
      let modern = p[1] === "m";
      if (!modern && isRoom(code)) { const r = await env.GAME.get(env.GAME.idFromName("room:" + code)).fetch("https://game/_mode"); modern = r.ok && (await r.json()).mode === "modern"; }
      return env.ASSETS.fetch(new Request(url.origin + (modern ? "/modern.html" : "/play.html"), req));
    }
    if (p === "/join" || p === "/join/") return env.ASSETS.fetch(new Request(url.origin + "/modern.html", req));
    if (p === "/") return env.ASSETS.fetch(new Request(url.origin + "/index.html", req));
    if (p === "/claim") return env.ASSETS.fetch(new Request(url.origin + "/index.html", req));
    // one address per page: /rules.html (and /index.html) redirect to /rules (and /), the canonical URLs
    const dup = p.match(/^\/(index|terms|privacy|app-privacy|cookies|refunds|contact|buy|rules|tour|traitors-at-home|party-games-for-large-groups)\.html$/);
    if (dup) return Response.redirect(url.origin + (dup[1] === "index" ? "/" : "/" + dup[1]) + url.search, 301);
    // every page in site/pages (build.sh) needs its name here too: html_handling is "none" (wrangler.toml)
    const page = p.match(/^\/(terms|privacy|app-privacy|cookies|refunds|contact|buy|admin|rules|tour|seal|survey|traitors-at-home|party-games-for-large-groups)\/?$/);
    if (page) {
      const r = await env.ASSETS.fetch(new Request(url.origin + "/" + page[1] + ".html", req));
      if (page[1] !== "admin" && page[1] !== "seal" && page[1] !== "survey") return r;
      const h = new Headers(r.headers); h.set("X-Robots-Tag", "noindex, nofollow"); h.set("Cache-Control", "no-store"); if (page[1] === "admin") h.set("X-Frame-Options", "DENY");
      if (page[1] === "survey") h.set("Referrer-Policy", "no-referrer"); // its address carries the survey's token
      return new Response(r.body, { status: r.status, headers: h });
    }
    // Only reached for paths that are not static assets (Cloudflare serves those first; see public/_headers).
    const r = await env.ASSETS.fetch(req);
    if (r.status !== 404 || (req.method !== "GET" && req.method !== "HEAD")) return r;
    const nf = await env.ASSETS.fetch(new Request(url.origin + "/404.html"));
    return new Response(req.method === "HEAD" ? null : nf.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
