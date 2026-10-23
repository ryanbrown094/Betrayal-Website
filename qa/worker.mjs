// The real Worker class (worker/src/index.js), driven directly with an in-memory storage: PIN limits, games kept across deploys,
// stale-build writes, the settings rule. Usage: node qa/worker.mjs
import worker, { GameState, Registry } from "../worker/src/index.js";
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
console.log("RESULT:", ok ? "CLEAN" : "PROBLEMS"); process.exit(ok ? 0 : 1);
