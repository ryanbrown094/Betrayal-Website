// Local stand-in for the Worker: same API contract, same redaction, static files from worker/public.
// Rooms live in memory: /api/g/CODE/state for a room, and /api/state for a default room so the older harnesses
// (which open the game at /) keep working. POST /api/games makes a room with no pass (like OPEN_ACCESS).
// The home page is at /home here (at / on the real Worker). For the real thing locally use `npx wrangler dev` (README).
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { publicView } from "../worker/src/public-view.js";
import { writeVerdict, tagOf, addWiped } from "../worker/src/rules.js";
const root = path.resolve("worker/public"); const rooms = new Map();
const roomOf = code => { if (!rooms.has(code)) rooms.set(code, { current: null, strikes: [], settings: null, wiped: [] }); return rooms.get(code) };
roomOf("MAIN");
const types = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (b, st) => { res.writeHead(st || 200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(b)) };
  if (url.pathname === "/api/games" && req.method === "POST") { const code = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01OIL]/g, "X"); roomOf(code); return json({ room: code, expires: Date.now() + 48 * 3600000 }) }
  let m = url.pathname.match(/^\/api\/g\/([A-Z0-9]{6})\/(state|settings)$/), room, what;
  if (m) { if (!rooms.has(m[1])) return json({ error: "No game with that code" }, 404); room = rooms.get(m[1]); what = m[2] }
  else if (url.pathname === "/api/state" || url.pathname === "/api/settings") { room = rooms.get("MAIN"); what = url.pathname.slice(5) }
  if (room && what === "settings") {
    const pin = req.headers["x-pin"] || "", authed = !!room.current && room.current.hostPin === pin;
    if (req.method === "GET") return json({ settings: room.settings });
    if (req.method !== "PUT") { res.writeHead(405); return res.end() }
    if (room.current && !authed) { res.writeHead(403); return res.end("Wrong host PIN") }
    let b = ""; for await (const c of req) b += c; const src = (JSON.parse(b).settings || {}).off || {}, off = {};
    for (const [k, v] of Object.entries(src)) if (/^[A-Z_]{2,20}$/.test(k) && Array.isArray(v)) off[k] = [...new Set(v.filter(n => Number.isInteger(n) && n >= 0 && n < 5000))];
    room.settings = { v: 1, off }; return json({ settings: room.settings });
  }
  if (room && what === "state") {
    const pin = req.headers["x-pin"] || "", authed = !!room.current && room.current.hostPin === pin;
    if (room.current && pin && !authed) { room.strikes = room.strikes.filter(t => Date.now() - t < 60000); room.strikes.push(Date.now()); if (room.strikes.length > 8) { res.writeHead(429); return res.end("Too many wrong PINs") } }
    if (req.method === "GET") { const tag = tagOf(room.current, authed); if (req.headers["x-have"] === tag) return json({ same: true, tag }); return json(authed ? { state: room.current, auth: true, tag } : { state: publicView(room.current), auth: false, tag }) }
    if (room.current && !authed) { res.writeHead(403); return res.end("Wrong host PIN") }
    if (req.method === "DELETE") { if (room.current) room.wiped = addWiped(room.wiped, room.current.gid); room.current = null; return json({ state: null, auth: true }) }
    if (req.method === "PUT") {
      let b = ""; for await (const c of req) b += c; let body; try { body = JSON.parse(b) } catch (e) { res.writeHead(400); return res.end("Bad JSON") }
      const no = writeVerdict(room.current, body && body.state, room.wiped);
      if (no) { res.writeHead(no.status, { "Content-Type": no.body ? "application/json" : "text/plain" }); return res.end(no.body ? JSON.stringify(no.body) : no.text) }
      room.current = body.state; return json({ state: room.current, auth: true });
    }
    res.writeHead(405); return res.end();
  }
  const page = url.pathname === "/" || /^\/g\/[A-Z0-9]{6}\/?$/.test(url.pathname) ? "play.html" : url.pathname === "/home" ? "index.html" : url.pathname;
  let p = path.join(root, page);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("not found") }
  res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" }); fs.createReadStream(p).pipe(res);
}).listen(+process.argv[2] || 8714, () => console.log("listening"));
