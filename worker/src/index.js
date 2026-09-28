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

  async mint(count, note, source) {
    const out = [];
    for (let i = 0; i < count; i++) {
      let p; do p = newPass(); while (await this.storage.get("pass:" + p));
      await this.storage.put("pass:" + p, { created: Date.now(), note: String(note || "").slice(0, 120), source: source || "admin" });
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
    if (url.pathname === "/mint") return json({ passes: await this.mint(Math.max(1, Math.min(200, +b.count || 1)), b.note, "admin") });
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
    // a paid checkout, claimed from the thank-you page: one pass per checkout session, however often it's reloaded
    if (url.pathname === "/claim") {
      const k = "claim:" + b.session, have = await this.storage.get(k);
      if (have) return json({ pass: have });
      const [p] = await this.mint(1, b.email || "", "stripe:" + b.session);
      await this.storage.put(k, p); return json({ pass: p });
    }
    if (url.pathname === "/open") { // development only (OPEN_ACCESS): a room without a pass
      const expires = Date.now() + hours(env) * 3600000;
      return json({ room: await this.room(env, expires, null), expires });
    }
    if (url.pathname === "/redeem") {
      if (this.tooMany(ip)) return json({ error: "Too many wrong codes — try again in an hour." }, 429);
      if (!isPass(b.pass)) { this.failed(ip); return json({ error: "That isn’t a party pass code. It looks like CNDL-XXXX-XXXX." }, 400); }
      const k = "pass:" + passKey(b.pass), v = await this.storage.get(k);
      if (!v) { this.failed(ip); return json({ error: "We don’t recognise that pass. Check it against your receipt." }, 404); }
      if (v.revoked) return json({ error: "That pass has been cancelled." }, 410);
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
const admin = (req, env) => same((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), env.ADMIN_TOKEN);

// Stripe: a Payment Link or Checkout whose success URL is https://<domain>/claim?session_id={CHECKOUT_SESSION_ID}.
// The page asks us for its pass; we check with Stripe that the session is paid, then mint (once per session).
async function stripeSession(env, id) {
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY } });
  if (!r.ok) return null;
  return r.json();
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
      const ip = req.headers.get("CF-Connecting-IP") || "?";
      return registry(env).fetch("https://registry/redeem", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ pass: b.pass }) });
    }
    if (p === "/api/claim" && req.method === "GET") {
      const id = url.searchParams.get("session_id") || "";
      if (!env.STRIPE_SECRET_KEY) return json({ error: "Payments aren’t set up yet." }, 503);
      if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return json({ error: "That isn’t a checkout session." }, 400);
      const s = await stripeSession(env, id);
      if (!s || s.payment_status !== "paid") return json({ error: "We can’t see a completed payment for this checkout yet. Refresh in a moment." }, 402);
      return call(env, "/claim", { session: id, email: (s.customer_details && s.customer_details.email) || "" });
    }
    if (p.startsWith("/api/admin/")) {
      if (!env.ADMIN_TOKEN || !admin(req, env)) return json({ error: "Not allowed" }, 401);
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
    // Only reached for paths that are not static assets (Cloudflare serves those first; see public/_headers).
    return env.ASSETS.fetch(req);
  },
};
