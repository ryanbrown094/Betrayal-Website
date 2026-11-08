// The real Worker class (worker/src/index.js), driven directly with an in-memory storage: PIN limits, games kept across deploys,
// stale-build writes, the settings rule; and the morning's IndexNow call. Usage: node qa/worker.mjs
import worker, { GameState, Registry } from "../worker/src/index.js";
import { indexNow, INDEXNOW_KEY, INDEXNOW_AT } from "../worker/src/indexnow.js";
import { readFileSync, existsSync } from "node:fs";
import { shownPass } from "../worker/src/codes.js";
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra))); ok = ok && !!cond };
// in-memory storage with what the room uses; a Table exists only once the Registry has opened it (/_init), so each
// test room is opened the same way first (on storage it shares with an earlier room, that's a no-op)
const store = (mem) => ({ async get(k) { return mem.get(k) }, async put(k, v) { if (typeof k === "object") for (const [a, b] of Object.entries(k)) mem.set(a, b); else mem.set(k, v) }, async delete(k) { for (const x of [].concat(k)) mem.delete(x) },
  async list({ prefix = "", reverse, limit } = {}) { let e = [...mem].filter(([k]) => k.startsWith(prefix)).sort((a, b) => a[0] < b[0] ? -1 : 1); if (reverse) e.reverse(); if (limit) e = e.slice(0, limit); return new Map(e) },
  async setAlarm() {}, async deleteAll() { mem.clear() } });
const mk = async (build, mem = new Map()) => { const DO = new GameState({ storage: store(mem) }, { BUILD: build }); await DO.fetch(new Request("http://x/_init", { method: "POST", body: JSON.stringify({ room: "TESTRM", expires: Date.now() + 48 * 3600e3 }) })); return { mem, DO } };
const req = (DO, method, path, headers, body) => DO.fetch(new Request("http://x" + path, { method, headers: { "Content-Type": "application/json", ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined }));
const nap0 = () => new Promise((r) => setTimeout(r, 10));
const PIN = "4821", game = { hostPin: PIN, gid: "g", ver: 1, v: 8, phase: "lobby", players: [] };

// PIN guessing
{
  const { DO } = await mk("1"); await req(DO, "PUT", "/api/state", { "X-Build": "1" }, { state: game });
  const guess = async (pin, ip) => (await req(DO, "GET", "/api/state", { "X-Pin": pin, "CF-Connecting-IP": ip })).status;
  const one = []; for (let i = 0; i < 10; i++) one.push(await guess(String(i).padStart(4, "0"), "203.0.113.5"));
  check("one address is stopped after 8 wrong PINs", one.slice(0, 8).every(s => s === 200) && one.slice(8).every(s => s === 429), one);
  let found = null, n = 0;
  for (let i = 0; i < 400 && !found; i++) { const r = await req(DO, "GET", "/api/state", { "X-Pin": String(i).padStart(4, "0"), "CF-Connecting-IP": "2001:db8:1:2::" + Math.floor(i / 8).toString(16) }); if (r.status === 429) n++; else if ((await r.json()).auth) found = i }
  check("hopping addresses inside one IPv6 /64 doesn't reset the limit", n > 380, { n429: n });
  const { DO: D2 } = await mk("1"); await req(D2, "PUT", "/api/state", { "X-Build": "1" }, { state: game });
  const many = []; for (let i = 0; i < 40; i++) many.push((await req(D2, "GET", "/api/state", { "X-Pin": "0000", "CF-Connecting-IP": "198.51.100." + i })).status);
  check("wrong PINs from many addresses hit the overall limit", many.slice(0, 30).every(s => s === 200) && many.slice(30).every(s => s === 429), many);
  const host = await req(D2, "GET", "/api/state", { "X-Pin": PIN, "CF-Connecting-IP": "198.51.100.77" });
  check("the host's correct PIN still works while guessers are blocked", host.status === 200 && (await host.json()).auth === true);
}
// deploys don't wipe games (HANDOVER §6.1): the game survives, and only pages on the old build are turned away
{
  const { mem, DO } = await mk("A");
  await req(DO, "PUT", "/api/state", { "X-Build": "A" }, { state: game });
  await req(DO, "PUT", "/api/settings", { "X-Build": "A", "X-Pin": PIN }, { settings: { off: { LIKELY: [1] } } });
  const { DO: B } = await mk("B", mem);
  const after = await (await req(B, "GET", "/api/state")).json(), set = await (await req(B, "GET", "/api/settings")).json();
  check("a new build keeps the saved game", after.state && after.state.gid === "g", after);
  check("…and keeps the question-bank switches", JSON.stringify(set.settings.off) === '{"LIKELY":[1]}', set);
  check("a page on the old build can't write its game back", (await req(B, "PUT", "/api/state", { "X-Build": "A" }, { state: game })).status === 426);
  check("a page on the new build carries the game on", (await req(B, "PUT", "/api/state", { "X-Build": "B", "X-Pin": PIN }, { state: { ...game, ver: 2 } })).status === 200);
  check("settings need the PIN during a game", (await req(B, "PUT", "/api/settings", { "X-Build": "B", "X-Pin": "0000" }, { settings: { off: {} } })).status === 403);
}
// two phones, stale phones, wiped games, the poll tag
{
  const { DO } = await mk("1"); const H = { "X-Build": "1", "X-Pin": PIN };
  const put = async st => { const r = await req(DO, "PUT", "/api/state", H, { state: st }); return { status: r.status, body: r.status === 200 || r.status === 409 || r.status === 410 ? await r.json() : null } };
  const v1 = { ...game, gid: "G", ver: 1, vid: "a" };
  check("a new game is saved", (await put(v1)).status === 200);
  check("the next save, made from the saved one, is taken", (await put({ ...v1, ver: 2, vid: "b", pvid: "a" })).status === 200);
  const lost = await put({ ...v1, ver: 3, vid: "c", pvid: "a" });
  check("a save made from an older copy is refused (409) and sent the newer game", lost.status === 409 && lost.body.state.vid === "b", lost);
  check("a stale phone's higher version number doesn't beat a save it never saw", (await put({ ...v1, ver: 99, vid: "d", pvid: "a" })).status === 409);
  check("a save from another game is refused, whatever its version", (await put({ ...v1, gid: "OTHER", ver: 50, vid: "e", pvid: "b" })).status === 409);
  check("an old-style save with no parent id still needs a higher version", (await put({ ...v1, ver: 2, vid: "f" })).status === 409 && (await put({ ...v1, ver: 3, vid: "f" })).status === 200);
  const t1 = await (await req(DO, "GET", "/api/state", { "X-Pin": PIN })).json();
  const same = await (await req(DO, "GET", "/api/state", { "X-Pin": PIN, "X-Have": t1.tag })).json();
  check("the poll answers 'same' when nothing changed", same.same === true && !same.state, same);
  const pub = await (await req(DO, "GET", "/api/state", { "X-Have": t1.tag })).json();
  check("the TV's tag is not the host's tag (no full state leaks through 'same')", !pub.same && pub.auth === false && pub.state && !pub.state.hostPin, pub);
  await req(DO, "DELETE", "/api/state", H);
  const back = await put({ ...v1, ver: 10, vid: "g", pvid: "f" });
  check("a phone that missed the wipe can't bring the wiped game back (410)", back.status === 410 && back.body.gone === true, back);
  check("…but a brand-new game can start", (await put({ ...game, gid: "NEW", ver: 1, vid: "h" })).status === 200);
  const { mem, DO: A } = await mk("A"); await req(A, "PUT", "/api/state", { "X-Build": "A" }, { state: { ...game, gid: "OLD", vid: "x" } });
  const { DO: B } = await mk("B", mem);
  check("after a deploy, the game's next save is taken (nothing was wiped)", (await req(B, "PUT", "/api/state", { "X-Build": "B", "X-Pin": PIN }, { state: { ...game, gid: "OLD", ver: 5, vid: "y", pvid: "x" } })).status === 200);
}
// requests at the same moment (the stress test's finds): a Durable Object only runs one request at a time until it awaits
// something other than its storage, such as another object
{
  const nap = (ms) => new Promise((r) => setTimeout(r, ms)), opened = [];
  const GAME = { idFromName: (n) => n, get: (id) => ({ fetch: async () => { opened.push(id); await nap(20); return new Response("{}") } }) };
  const reg = new Registry({ storage: store(new Map()) }, { GAME, PASS_HOURS: "48" });
  const [key] = await reg.mint(1, "", "test"), code = shownPass(key);
  const redeem = (i) => reg.fetch(new Request("https://registry/redeem", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113." + i }, body: JSON.stringify({ pass: code }) })).then((r) => r.json());
  const got = await Promise.all([...Array(10)].map((_, i) => redeem(i)));
  check("one booking code redeemed ten times at once opens one Table, and all ten get it", new Set(got.map((g) => g.room)).size === 1 && opened.length === 1 && got.filter((g) => g.again).length === 9, { rooms: [...new Set(got.map((g) => g.room))], opened: opened.length });
}
{
  const mem = new Map(), DO = new GameState({ storage: store(mem) }, {});
  await DO.fetch(new Request("http://x/_init", { method: "POST", body: JSON.stringify({ room: "TESTRM", expires: Date.now() + 3600000, pass: "MASTER" }) }));
  const res = await Promise.all(["Ann", "Ben", "Cat", "Dan", "Eve", "Fay"].map((name) => req(DO, "POST", "/api/m/create", {}, { name })));
  const st = mem.get("modern");
  check("six set-ups of one Modern Table at once: one host, the rest told it's set up", res.filter((r) => r.status === 200).length === 1 && res.filter((r) => r.status === 409).length === 5 && st.players.length === 1 && st.director === st.players[0].id, { codes: res.map((r) => r.status), players: st.players.length });
}
{
  const calls = []; const env = { GAME: { idFromName: (n) => n, get: () => ({ fetch: async () => { calls.push(1); return new Response("{}") } }) } };
  const r = await worker.fetch(new Request("http://x/api/g/TESTRM/m/act", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "70000" }, body: "x".repeat(70000) }), env);
  check("an oversized Modern request is refused with 413 before it reaches the Table", r.status === 413 && calls.length === 0, { status: r.status, calls: calls.length });
}
{
  const logged = [], REGISTRY = { idFromName: () => 1, get: () => ({ fetch: async (u, init) => { if (String(u).endsWith("/err")) logged.push(JSON.parse(init.body)); return new Response("{}") } }) };
  const mem = new Map(), DO = new GameState({ storage: store(mem) }, { REGISTRY });
  await DO.fetch(new Request("http://x/_init", { method: "POST", body: JSON.stringify({ room: "TESTRM", expires: Date.now() + 3600000, pass: "MASTER" }) }));
  for (let i = 0; i < 6; i++) await req(DO, "POST", "/api/events", {}, { device: "tv" + i, events: [...Array(10)].map((_, j) => ({ k: "error", m: "boom " + i + "." + j })) });
  await nap0();
  check("a room's devices put at most 30 errors an hour in the master log (the rest stay in the room's trail)", logged.length === 30 && mem.get("evN") === 6, { logged: logged.length, batches: mem.get("evN") });
}
// IndexNow: the pages dated since the last morning that got through, up to yesterday's, with the key its file holds; a
// refusal tries the next endpoint, and a morning turned away everywhere is made up the next
{
  const xml = '<url><loc>https://thebetrayal.co.uk/</loc><lastmod>2026-10-26</lastmod></url>\n<url><loc>https://thebetrayal.co.uk/rules</loc><lastmod>2026-10-27</lastmod></url>\n<url><loc>https://thebetrayal.co.uk/tour</loc><lastmod>2026-10-26</lastmod></url>\n<url><loc>https://thebetrayal.co.uk/faq</loc><lastmod>2026-10-01</lastmod></url>';
  const env = { SITE_HOST: "thebetrayal.co.uk", ASSETS: { fetch: async () => new Response(xml) } }, real = globalThis.fetch; let calls = [], reply = () => 200;
  globalThis.fetch = async (u, init) => { calls.push({ u: String(u), body: JSON.parse(init.body) }); const s = reply(String(u)); if (s instanceof Error) throw s; return new Response("", { status: s, headers: s === 429 ? { "Retry-After": "3600" } : {} }); };
  const urls = () => JSON.stringify(calls[0].body.urlList), at = Date.parse("2026-10-27T07:00:00Z");
  let r = await indexNow(env, at, "2026-10-25"), c = calls[0];
  check("IndexNow: the pages dated after the last good day up to yesterday, sent once", r.sent === 2 && r.through === "2026-10-26" && calls.length === 1 && c.u === INDEXNOW_AT[0] && urls() === JSON.stringify(["https://thebetrayal.co.uk/", "https://thebetrayal.co.uk/tour"]), calls);
  check("…with the host, the key and where its file is", c.body.host === "thebetrayal.co.uk" && c.body.key === INDEXNOW_KEY && c.body.keyLocation === "https://thebetrayal.co.uk/" + INDEXNOW_KEY + ".txt");
  const file = new URL("../worker/public/" + INDEXNOW_KEY + ".txt", import.meta.url);
  check("…and that file is published, holding the key", existsSync(file) && readFileSync(file, "utf8").trim() === INDEXNOW_KEY);
  calls = []; r = await indexNow(env, Date.parse("2026-10-30T07:00:00Z"), "2026-10-28");
  check("a morning with nothing new sends nothing, and moves the day on", r.sent === 0 && r.through === "2026-10-29" && calls.length === 0);
  check("today's pages wait for tomorrow", (await indexNow(env, Date.parse("2026-10-26T07:00:00Z"), "2026-10-24")).sent === 0 && calls.length === 0);
  calls = []; r = await indexNow(env, Date.parse("2026-10-29T07:00:00Z"), "2026-10-25");
  check("after a morning turned away, the next sends what it missed as well", r.sent === 3 && JSON.stringify(calls[0].body.urlList) === JSON.stringify(["https://thebetrayal.co.uk/", "https://thebetrayal.co.uk/rules", "https://thebetrayal.co.uk/tour"]), calls);
  calls = []; r = await indexNow(env, Date.parse("2026-10-27T07:00:00Z"), null);
  check("with no last good day, it goes back 14 days (not further)", r.sent === 2 && !urls().includes("/faq"), calls);
  check("another site's address (a staging host) sends nothing", (await indexNow({ ...env, SITE_HOST: "staging.example" }, at, "2026-10-25")).sent === 0);
  calls = []; reply = (u) => (u === INDEXNOW_AT[0] ? 429 : 200); r = await indexNow(env, at, "2026-10-25");
  check("a 429 from one endpoint tries the next, which takes them", r.sent === 2 && r.via === "www.bing.com" && calls.length === 2 && calls[1].u === INDEXNOW_AT[1], calls.map((x) => x.u));
  calls = []; reply = (u) => (u === INDEXNOW_AT[2] ? new Error("network down") : 429); let err = null; try { await indexNow(env, at, "2026-10-25"); } catch (e) { err = e.message; }
  check("refused everywhere is an error naming each (the morning job logs it and keeps the last good day)", calls.length === 3 && /2 pages: api\.indexnow\.org 429 \(retry after 3600\), www\.bing\.com 429 \(retry after 3600\), yandex\.com network down/.test(err || ""), err);
  globalThis.fetch = real;
}
// Modern's lobby: a phone that lost its place (a closed tab, the QR code's own browser) carries on under its own name once
// the old phone has been quiet 20 seconds and it says it's them; otherwise the name stays taken
{
  const { DO } = await mk("1"), real = Date.now; let skew = 0; Date.now = () => real() + skew;
  const post = async (path, body, tok) => { const r = await req(DO, "POST", "/api/m/" + path, tok ? { "X-Tok": tok } : null, body); return [r.status, await r.json()]; };
  const [, host] = await post("create", { name: "Ann" }), [, sam] = await post("join", { name: "Sam" });
  const [s1, now1] = await post("join", { name: "sam" });
  check("Modern lobby: a name whose phone is still there is taken, with no offer to carry on as them", s1 === 400 && /Add an initial/.test(now1.error) && !now1.reclaim, now1);
  skew = 25000; await req(DO, "GET", "/api/m", { "X-Tok": host.tok }); // the host's phone keeps polling
  const [s2, offer] = await post("join", { name: "Sam" }), [s3, hostName] = await post("join", { name: "Ann" });
  check("…once Sam's phone has been quiet 20 seconds, a new phone asking for Sam is offered the place; not the host's, still polling", s2 === 400 && offer.reclaim === "Sam" && s3 === 400 && !hostName.reclaim, [offer, hostName]);
  const [s4, took] = await post("join", { name: "Sam", reclaim: true }), old = await (await req(DO, "GET", "/api/m", { "X-Tok": sam.tok })).json();
  check("…and takes it when it says it's them: still one Sam, on the new phone, and the old phone has lost its place", s4 === 200 && !!took.tok && took.tok !== sam.tok && took.view.me.name === "Sam" && took.view.players.length === 2 && !old.view.me, [s4, took.error]);
  Date.now = real;
}
// the host is told whose phone has been quiet a minute (it would hold every clock), in every reply, "nothing new" too;
// nobody else is told, and not before the room has been awake a minute (it hasn't heard from the phones yet)
{
  const { mem, DO } = await mk("1"), real = Date.now; let skew = 0; Date.now = () => real() + skew;
  const post = async (path, body) => (await req(DO, "POST", "/api/m/" + path, null, body)).json();
  const get = async (D, tok, q) => (await req(D, "GET", "/api/m" + (q || ""), { "X-Tok": tok })).json();
  const host = await post("create", { name: "Ann" }), bo = await post("join", { name: "Bo" }), cy = await post("join", { name: "Cy" });
  skew = 61000; await get(DO, cy.tok); // Cy's phone is still polling; Bo's hasn't asked since it joined
  const full = await get(DO, host.tok), same = await get(DO, host.tok, "?v=" + full.view.ver + "&me=" + full.view.me.id), cys = await get(DO, cy.tok);
  check("Modern: the host is told Bo's phone has been quiet a minute, in a full reply and a 'nothing new' one; not Cy's, and nobody else is told", JSON.stringify(full.away) === JSON.stringify([bo.view.me.id]) && same.same === true && JSON.stringify(same.away) === JSON.stringify([bo.view.me.id]) && !cys.away, [full.away, same, cys.away]);
  const { DO: woke } = await mk("1", mem);
  check("…but not from a room that has just woken", !(await get(woke, host.tok)).away);
  Date.now = real;
}
console.log("RESULT:", ok ? "CLEAN" : "PROBLEMS"); process.exit(ok ? 0 : 1);
