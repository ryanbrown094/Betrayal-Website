import { publicView } from "./public-view.js";
import { writeVerdict, tagOf, addWiped } from "./rules.js";
import { newRoom, newPass, isRoom, isPass, passKey } from "./codes.js";

// Cloak & Candle's server. Every party is its own room: a Durable Object (GameState) keyed by a six-character room code,
// holding that party's one game. Rooms are made by redeeming a party pass, which lives in the Registry (one Durable
// Object for the whole service). A pass makes one room, good for PASS_HOURS (default 48) from redemption; the room is
// deleted KEEP_DAYS (default 7) after that. Settings are Worker vars and secrets — see wrangler.toml and README.

const json = (body, status, extra) =>
  new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(extra || {}) } });
const text = (t, status) => new Response(t, { status, headers: { "Cache-Control": "no-store" } });
const hours = (env) => Math.max(0.0001, +(env.PASS_HOURS || 48));
const keepMs = (env) => Math.max(0.00001, +(env.KEEP_DAYS || 7)) * 86400000;

// ---------------------------------------------------------------------------------------------------------------
// One party's game. Writes need the host PIN (the first PUT sets it). Reads without the PIN get the redacted TV view.
export class GameState {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env || {};
    this.strikes = new Map(); // wrong-PIN attempts per address, so a guest can't guess the PIN by brute force
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
  async alarm() { await this.storage.deleteAll(); }

  async fetch(req) {
    const path = new URL(req.url).pathname;
    // made by the Registry when a pass is redeemed; never reachable from outside (the router only forwards /api/…)
    if (path === "/_init" && req.method === "POST") {
      const b = await req.json();
      if (!(await this.storage.get("meta"))) {
        await this.storage.put("meta", { room: b.room, expires: b.expires, pass: b.pass || null, created: Date.now() });
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
    const expired = Date.now() > meta.expires;
    const room = { code: meta.room, expires: meta.expires, expired };

    const current = (await this.storage.get("state")) ?? null;
    const pin = req.headers.get("X-Pin") || "";
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const authed = !!current && current.hostPin === pin;

    if (current && pin && !authed && this.limited(ip)) return text("Too many wrong PINs — try again in a minute", 429);
    // a page still running the previous build must reload before it writes (reads are fine)
    const clientBuild = req.headers.get("X-Build");
    const oldBuild = this.env.BUILD && clientBuild && clientBuild !== this.env.BUILD;
    const readOnly = () => json({ error: "This party pass has expired — the game is now read-only.", expired: true, room }, 423);

    // The question bank's on/off switches outlive any one game in this room (a wipe keeps them).
    if (path === "/api/settings") {
      if (req.method === "GET") return json({ settings: (await this.storage.get("settings")) ?? null });
      if (req.method !== "PUT") return text("Method not allowed", 405);
      if (oldBuild) return text("A new version is live — reload", 426);
      if (expired) return readOnly();
      if (current && !authed) return text("Wrong host PIN", 403);
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
    if (oldBuild) return text("A new version is live — reload", 426);
    if (expired) return readOnly();
    if (current && !authed) return text("Wrong host PIN", 403);

    if (req.method === "DELETE") {
      if (current && current.gid) await this.storage.put("wiped", addWiped(await this.storage.get("wiped"), current.gid));
      await this.storage.delete("state");
      return json({ state: null, auth: true });
    }
    if (req.method === "PUT") {
      let body;
      try { body = await req.json(); } catch { return text("Bad JSON", 400); }
      if (!body || typeof body.state !== "object" || body.state === null) return text("Expected {state}", 400);
      if (JSON.stringify(body.state).length > 900000) return text("Game too large", 413);
      // two host phones, a stale phone, a wiped game: see rules.js
      const no = writeVerdict(current, body.state, current ? null : await this.storage.get("wiped"));
      if (no) return no.body ? json(no.body, no.status) : text(no.text, no.status);
      await this.storage.put("state", body.state);
      return json({ state: body.state, auth: true });
    }
    return text("Method not allowed", 405);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Party passes: minted by the admin (or by a paid Stripe checkout), redeemed once for a room.
export class Registry {
  constructor(state, env) { this.storage = state.storage; this.env = env || {}; this.fails = new Map(); }

  // twenty wrong codes an hour from one address, then it waits: pass codes can't be guessed by brute force
  tooMany(ip) {
    const t = Date.now(), rec = (this.fails.get(ip) || []).filter((x) => t - x < 3600000);
    this.fails.set(ip, rec); if (this.fails.size > 2000) this.fails.clear();
    return rec.length >= 20;
  }
  failed(ip) { const rec = this.fails.get(ip) || []; rec.push(Date.now()); this.fails.set(ip, rec); }

  async mint(count, note, source, kind) {
    const out = [];
    for (let i = 0; i < count; i++) {
      let p; do p = newPass(); while (await this.storage.get("pass:" + p));
      // a free unlimited code (from the admin page) works like a subscription that never lapses, until it's cancelled
      await this.storage.put("pass:" + p, { created: Date.now(), note: String(note || "").slice(0, 120), source: source || "admin", ...(kind === "sub" ? { kind: "sub", subActive: true, subStatus: "free" } : {}) });
      out.push(p);
    }
    return out;
  }

  async room(env, expires, pass) {
    let code; do code = newRoom(); while (await this.storage.get("room:" + code));
    await this.storage.put("room:" + code, { pass, expires });
    await env.GAME.get(env.GAME.idFromName("room:" + code)).fetch("https://game/_init", { method: "POST", body: JSON.stringify({ room: code, expires, pass }) });
    return code;
  }

  async fetch(req) {
    const url = new URL(req.url), env = this.env, b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    if (url.pathname === "/mint") return json({ passes: await this.mint(Math.max(1, Math.min(200, +b.count || 1)), b.note, "admin", b.kind) });
    // admin sign-in: wrong passwords count with wrong pass codes (twenty an hour per address)
    if (url.pathname === "/signin-check") return this.tooMany(ip) ? json({ error: "Too many attempts — try again in an hour." }, 429) : json({ ok: true });
    if (url.pathname === "/signin-failed") { this.failed(ip); return json({ ok: true }); }
    if (url.pathname === "/list") {
      const rows = [];
      for (const [k, v] of await this.storage.list({ prefix: "pass:" })) rows.push({ pass: k.slice(5), ...v });
      return json({ passes: rows.sort((a, c) => c.created - a.created) });
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
      if (rec.length >= 10) return json({ error: "Too many checkouts from here — try again in an hour." }, 429);
      await this.storage.put(k, rec.concat([t]));
      let p; do p = newPass(); while (await this.storage.get("pass:" + p));
      await this.storage.put("pass:" + p, { created: t, note: "", source: "stripe", pending: true, kind: b.kind === "sub" ? "sub" : "one" });
      return json({ pass: p });
    }
    if (url.pathname === "/pending-session") { // the checkout session that will pay for a pending pass
      const k = "pass:" + passKey(b.pass), v = await this.storage.get(k); if (!v) return json({ error: "No such pass" }, 404);
      await this.storage.put(k, { ...v, session: b.session }); return json({ ok: true });
    }
    // a paid checkout, from the thank-you page or the webhook: activates its pass (a Payment Link checkout, with no pass
    // of its own, gets one minted). One pass per checkout session, however often it's claimed.
    if (url.pathname === "/claim") {
      const k = "claim:" + b.session, have = await this.storage.get(k);
      if (have) return json({ pass: have, sub: ((await this.storage.get("pass:" + have)) || {}).kind === "sub" });
      let p = b.pass && passKey(b.pass), v = p && (await this.storage.get("pass:" + p));
      if (v) await this.storage.put("pass:" + p, { ...v, pending: false, revoked: v.pending ? undefined : v.revoked, paid: Date.now(), note: String(b.email || "").slice(0, 120), session: b.session, pi: b.pi || null,
        ...(v.kind === "sub" ? { subId: b.sub || v.subId || null, customer: b.customer || v.customer || null, subActive: true, subStatus: "active" } : {}) });
      else [p] = await this.mint(1, b.email || "", "stripe:" + b.session);
      await this.storage.put(k, p); if (b.pi) await this.storage.put("pi:" + b.pi, p);
      return json({ pass: p, sub: !!(v && v.kind === "sub") });
    }
    // a checkout that expired or failed: its pending pass is cancelled
    if (url.pathname === "/cancel") {
      const k = "pass:" + passKey(b.pass), v = await this.storage.get(k);
      if (v && v.pending && !v.revoked) await this.storage.put(k, { ...v, revoked: Date.now(), note: "checkout " + (b.why || "ended") });
      return json({ ok: true });
    }
    // a refund: the pass is cancelled if it hasn't opened a room yet (a party already played keeps its room)
    if (url.pathname === "/refund") {
      const p = await this.storage.get("pi:" + b.pi); if (!p) return json({ ok: true, pass: null });
      const k = "pass:" + p, v = await this.storage.get(k);
      if (v && !v.room && !v.revoked) await this.storage.put(k, { ...v, revoked: Date.now(), refunded: Date.now() });
      else if (v) await this.storage.put(k, { ...v, refunded: Date.now() });
      return json({ ok: true, pass: p, cancelled: !!(v && !v.room) });
    }
    if (url.pathname === "/open") { // a room without a pass: MASTER_PASS (testing) or OPEN_ACCESS (development)
      const expires = Date.now() + hours(env) * 3600000;
      return json({ room: await this.room(env, expires, b.master ? "MASTER" : null), expires });
    }
    // a subscription changed (renewed, failed, cancelled): its code opens games only while it's active or trialing
    if (url.pathname === "/substatus") {
      const k = "pass:" + passKey(b.pass || ""), v = b.pass && (await this.storage.get(k));
      if (!v || v.kind !== "sub") return json({ ok: true, pass: null });
      const on = ["active", "trialing"].includes(b.status);
      await this.storage.put(k, { ...v, subId: b.sub || v.subId, customer: b.customer || v.customer, subActive: on && !v.pending, subStatus: b.status });
      return json({ ok: true, pass: v && passKey(b.pass), active: on });
    }
    // the Stripe customer behind a subscription code, for the billing portal (wrong codes count as failed guesses)
    if (url.pathname === "/customer") {
      if (this.tooMany(ip)) return json({ error: "Too many wrong codes — try again in an hour." }, 429);
      const v = isPass(b.pass) && (await this.storage.get("pass:" + passKey(b.pass)));
      if (!v || v.kind !== "sub" || !v.customer) { this.failed(ip); return json({ error: "That isn’t a subscription code we recognise." }, 404); }
      return json({ customer: v.customer });
    }
    if (url.pathname === "/redeem") {
      if (this.tooMany(ip)) return json({ error: "Too many wrong codes — try again in an hour." }, 429);
      if (!isPass(b.pass)) { this.failed(ip); return json({ error: "That isn’t a party pass code. It looks like CNDL-XXXX-XXXX." }, 400); }
      const k = "pass:" + passKey(b.pass), v = await this.storage.get(k);
      if (!v) { this.failed(ip); return json({ error: "We don’t recognise that pass. Check it against your receipt." }, 404); }
      if (v.revoked) return json({ error: "That pass has been cancelled." }, 410);
      if (v.pending) return json({ error: "That pass is waiting for its payment to clear. Try again in a minute." }, 402);
      // a subscription code: a new game whenever they like, one at a time. Entering it again brings the current game
      // back; asking for a fresh one closes that room and opens another.
      if (v.kind === "sub") {
        if (!v.subActive) return json({ error: "Your subscription isn’t active" + (v.subStatus === "past_due" ? " — the last payment didn’t go through." : ".") + " Use “Manage subscription” to sort it out.", sub: true }, 402);
        const live = v.room && Date.now() < v.expires;
        if (live && !b.fresh) return json({ room: v.room, expires: v.expires, again: true, sub: true });
        if (live) await env.GAME.get(env.GAME.idFromName("room:" + v.room)).fetch("https://game/_close", { method: "POST", body: "{}" });
        const expires = Date.now() + hours(env) * 3600000, room = await this.room(env, expires, passKey(b.pass));
        await this.storage.put(k, { ...v, room, expires, redeemed: Date.now(), games: (v.games || 0) + 1 });
        return json({ room, expires, sub: true });
      }
      // redeemed already: the same room comes back (a host who lost the link), until it runs out
      if (v.room) return Date.now() < v.expires ? json({ room: v.room, expires: v.expires, again: true }) : json({ error: "That pass has been used, and its game has ended." }, 410);
      const expires = Date.now() + hours(env) * 3600000;
      const room = await this.room(env, expires, passKey(b.pass));
      await this.storage.put(k, { ...v, room, expires, redeemed: Date.now() });
      return json({ room, expires });
    }
    return text("Not found", 404);
  }
}

// ---------------------------------------------------------------------------------------------------------------
const registry = (env) => env.REGISTRY.get(env.REGISTRY.idFromName("registry"));
const call = (env, path, body) => registry(env).fetch("https://registry" + path, { method: "POST", body: JSON.stringify(body || {}) });
// constant-time compare, so the admin token can't be found a character at a time
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const bearer = (req, env) => !!env.ADMIN_TOKEN && same((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), env.ADMIN_TOKEN);
// The /admin page signs in with ADMIN_USER (var) and ADMIN_PASSWORD (secret) and gets a 12-hour session cookie: the
// expiry, signed with the password, so changing the password signs every session out.
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
async function stripePost(env, path, params) {
  const r = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body: form(params) });
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

// ---------------------------------------------------------------------------------------------------------------
// Pre-launch password gate. With SITE_PASSWORD set, every request — pages, assets, API — needs the gate cookie; without
// it the visitor gets a small password page. Remove SITE_PASSWORD (wrangler.toml [vars]) to open the site to the public.
const GATE_COOKIE = "cc_gate";
async function gateToken(pw) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("cloak-and-candle-gate:" + pw));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const cookieOf = (req, name) => { const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? m[1] : ""; };
const gatePage = (next, wrong) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Cloak &amp; Candle</title>
<style>html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(90vw 60vh at 50% 0,#2a1630,transparent 70%),#09070a;color:#e8d0c8;font:18px/1.4 system-ui,sans-serif}
form{width:min(340px,86vw);text-align:center}svg{width:84px;height:98px;color:#e6a58c;margin:0 auto 14px;display:block}h1{font:600 30px/1.1 Georgia,serif;margin:0 0 6px}p{color:#afa198;font-size:15px;margin:0 0 18px}
input{width:100%;box-sizing:border-box;min-height:52px;padding:12px 14px;border-radius:10px;border:1px solid rgba(230,165,140,.45);background:#100b11;color:#e8d0c8;font-size:18px}
button{margin-top:10px;width:100%;min-height:52px;border-radius:10px;border:1px solid #e6a58c;background:linear-gradient(180deg,#eaac93,#b5664b 55%,#8a4731);color:#150b17;font-weight:700;font-size:17px}.err{color:#ff9dbf;margin-top:10px;font-size:15px}</style></head>
<body><form method="post" action="/__gate"><svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M60 5l55 65-55 65L5 70z"/><path d="M60 16l44 54-44 54-44-54z" stroke-width="1"/><path d="M60 29C51 35 44.5 44 44 56c-.3 6 1.5 8-.5 14-2.5 8-1.5 17-3.5 26h40c-2-9-1-18-3.5-26-2-6-.2-8-.5-14-.5-12-7-21-16-27z"/><path d="M60 48c3 4.4 4.6 7.2 4.6 9.5a4.6 4.6 0 0 1-9.2 0c0-2.3 1.6-5.1 4.6-9.5z" fill="currentColor" fill-opacity=".35"/></svg>
<h1>Cloak &amp; Candle</h1><p>Coming soon. Enter the password to continue.</p><input type="password" name="password" autocomplete="current-password" aria-label="Password" autofocus required>
<input type="hidden" name="next" value="${String(next).replace(/[&<>"']/g, "")}"><button>Enter</button>${wrong ? '<div class="err" role="alert">That’s not it.</div>' : ""}</form></body></html>`,
  { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
async function gate(req, env) {
  if (!env.SITE_PASSWORD) return null;
  if (new URL(req.url).pathname.startsWith("/api/admin/")) return null; // has its own token
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
  async fetch(req, env) {
    const locked = await gate(req, env); if (locked) return locked;
    const url = new URL(req.url), p = url.pathname;
    const g = p.match(/^\/api\/g\/([A-Za-z0-9]{6})\/(state|settings)$/);
    if (g) {
      const code = g[1].toUpperCase(); if (!isRoom(code)) return json({ error: "No game with that code" }, 404);
      const inner = new URL(req.url); inner.pathname = "/api/" + g[2];
      return env.GAME.get(env.GAME.idFromName("room:" + code)).fetch(new Request(inner, req));
    }
    if (p === "/api/games" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (env.OPEN_ACCESS === "1" && !b.pass) return call(env, "/open");
      // the master passcode (Worker secret MASTER_PASS) opens a fresh room every time, for testing
      const up = (v) => String(v || "").trim().toUpperCase();
      if (env.MASTER_PASS && same(up(b.pass), up(env.MASTER_PASS))) return call(env, "/open", { master: true });
      const ip = req.headers.get("CF-Connecting-IP") || "?";
      return registry(env).fetch("https://registry/redeem", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ pass: b.pass, fresh: b.fresh === true }) });
    }
    // Buy: the /buy page posts both ticks here; we open a pending pass and a Checkout Session for it, and send the buyer
    // to Stripe. Settings: STRIPE_SECRET_KEY (secret), STRIPE_PRICE_ID (var: the party pass's Price).
    if (p === "/api/checkout" && req.method === "POST") {
      const b = await req.json().catch(() => ({})), sub = b.plan === "sub", price = sub ? env.STRIPE_SUB_PRICE_ID : env.STRIPE_PRICE_ID;
      if (!env.STRIPE_SECRET_KEY || !price) return json({ error: "Party passes go on sale soon. Payments aren’t open yet." }, 503);
      if (b.terms !== true || b.supply !== true) return json({ error: "Tick both boxes to continue." }, 400);
      const ip = req.headers.get("CF-Connecting-IP") || "?";
      const pr = await registry(env).fetch("https://registry/pending", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ kind: sub ? "sub" : "one" }) }), pj = await pr.json();
      if (!pr.ok) return json(pj, pr.status);
      const pass = pj.pass, at = new Date().toISOString();
      try {
        const common = {
          line_items: [{ price, quantity: 1 }], success_url: url.origin + "/claim?session_id={CHECKOUT_SESSION_ID}", cancel_url: url.origin + "/buy",
          client_reference_id: pass, allow_promotion_codes: "true", metadata: { pass, plan: sub ? "sub" : "one", consent_terms: at, consent_supply: at },
        };
        const cs = await stripePost(env, "checkout/sessions", sub ? {
          ...common, mode: "subscription",
          // the code rides on the subscription (its description is shown to the customer) and its metadata
          subscription_data: { description: "Cloak & Candle unlimited — your code: " + pass + ". Enter it at " + url.host + " to start a game.", metadata: { pass } },
        } : {
          ...common, mode: "payment",
          payment_intent_data: { description: "Cloak & Candle party pass " + pass, metadata: { pass } },
          // a paid invoice, emailed by Stripe, carries the pass code: the buyer has it even if they close the tab
          invoice_creation: { enabled: "true", invoice_data: { description: "Your party pass: " + pass + ". Enter it at " + url.host + " to open your room — it stays open for 48 hours from then.", custom_fields: [{ name: "Party pass", value: pass }], metadata: { pass } } },
        });
        await call(env, "/pending-session", { pass, session: cs.id });
        return json({ url: cs.url });
      } catch (e) {
        await call(env, "/cancel", { pass, why: "could not start" });
        console.error("Stripe checkout refused:", e.message); // Workers → Logs; also shown under the Pay button
        return json({ error: "We couldn’t start the checkout. Try again in a moment.", detail: "Stripe said: " + e.message }, 502);
      }
    }
    // Stripe's webhook (endpoint https://<domain>/api/stripe/webhook): activates passes when payment clears, cancels
    // them when a checkout expires or is refunded before use. Secret: STRIPE_WEBHOOK_SECRET.
    if (p === "/api/stripe/webhook" && req.method === "POST") {
      const body = await req.text();
      if (!(await stripeVerified(req, env, body))) return json({ error: "Bad signature" }, 400);
      let ev; try { ev = JSON.parse(body); } catch { return json({ error: "Bad JSON" }, 400); }
      const o = (ev.data && ev.data.object) || {}, pass = o.metadata && o.metadata.pass;
      if ((ev.type === "checkout.session.completed" && o.payment_status === "paid") || ev.type === "checkout.session.async_payment_succeeded")
        await call(env, "/claim", { session: o.id, email: (o.customer_details && o.customer_details.email) || "", pass, pi: piOf(o.payment_intent), sub: piOf(o.subscription), customer: piOf(o.customer) });
      else if ((ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.created" || ev.type === "customer.subscription.deleted") && pass)
        await call(env, "/substatus", { pass, sub: o.id, customer: piOf(o.customer), status: ev.type === "customer.subscription.deleted" ? "canceled" : o.status });
      else if ((ev.type === "checkout.session.expired" || ev.type === "checkout.session.async_payment_failed") && pass) await call(env, "/cancel", { pass, why: ev.type.split(".").pop() });
      else if (ev.type === "charge.refunded" && o.refunded) await call(env, "/refund", { pi: piOf(o.payment_intent) });
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
      if (!s || s.payment_status !== "paid") return json({ error: "We can’t see a completed payment for this checkout yet. Refresh in a moment." }, 402);
      return call(env, "/claim", { session: id, email: (s.customer_details && s.customer_details.email) || "", pass: s.metadata && s.metadata.pass, pi: piOf(s.payment_intent), sub: piOf(s.subscription), customer: piOf(s.customer) });
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
      if (p === "/api/admin/revoke" && req.method === "POST") return call(env, "/revoke", await req.json().catch(() => ({})));
      return json({ error: "Not found" }, 404);
    }
    if (p.startsWith("/api/")) return json({ error: "Not found" }, 404);
    // a room: the game page (TV at /g/CODE, host at /g/CODE#host)
    if (/^\/g\/[A-Za-z0-9]{6}\/?$/.test(p)) {
      const code = p.slice(3, 9).toUpperCase();
      if (p.slice(3, 9) !== code) return Response.redirect(url.origin + "/g/" + code + url.search + url.hash, 301);
      return env.ASSETS.fetch(new Request(url.origin + "/play.html", req));
    }
    if (p === "/") return env.ASSETS.fetch(new Request(url.origin + "/index.html", req));
    if (p === "/claim") return env.ASSETS.fetch(new Request(url.origin + "/index.html", req));
    const page = p.match(/^\/(terms|privacy|cookies|refunds|contact|buy|admin)\/?$/);
    if (page) {
      const r = await env.ASSETS.fetch(new Request(url.origin + "/" + page[1] + ".html", req));
      if (page[1] !== "admin") return r;
      const h = new Headers(r.headers); h.set("X-Robots-Tag", "noindex, nofollow"); h.set("Cache-Control", "no-store"); h.set("X-Frame-Options", "DENY");
      return new Response(r.body, { status: r.status, headers: h });
    }
    // Only reached for paths that are not static assets (Cloudflare serves those first; see public/_headers).
    return env.ASSETS.fetch(req);
  },
};
