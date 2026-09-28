// The /admin sign-in and API, with the Durable Objects stubbed: username and password, the signed session cookie,
// tampering, the attempt limit, the old Bearer token, cross-site requests, creating/listing/cancelling passes and free
// unlimited codes, the test room. node qa/admin.mjs
import worker, { Registry } from "../worker/src/index.js";
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 300))); ok = ok && !!cond };
const store = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { m.set(k, v) }, list: async ({ prefix }) => new Map([...m].filter(([k]) => k.startsWith(prefix))) } };
const GAME = { idFromName: n => n, get: () => ({ fetch: async () => new Response("{}") }) };
const reg = new Registry({ storage: store() }, { GAME });
const env = { ADMIN_USER: "ryanab94.admin", ADMIN_PASSWORD: "right-horse-battery", ADMIN_TOKEN: "tok", GAME, REGISTRY: { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(new Request(u, i)) }) } };
const W = (path, init, e) => worker.fetch(new Request("https://cloakandcandle.co.uk" + path, init), e || env);
const post = (path, body, headers, e) => W(path, { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.5", ...(headers || {}) }, body: JSON.stringify(body || {}) }, e);
const J = async r => [r.status, await r.json().catch(() => ({})), r.headers.get("Set-Cookie")];

check("not signed in: 401", (await W("/api/admin/passes")).status === 401);
check("not set up: sign-in refused", (await J(await post("/api/admin/login", { user: "ryanab94.admin", password: "x" }, {}, { ...env, ADMIN_PASSWORD: "" })))[0] === 503);
check("wrong password: 401, no cookie", await J(await post("/api/admin/login", { user: "ryanab94.admin", password: "nope" })).then(([s, , c]) => s === 401 && !c));
check("wrong username: 401", (await J(await post("/api/admin/login", { user: "someone", password: "right-horse-battery" })))[0] === 401);
const [ls, , setc] = await J(await post("/api/admin/login", { user: " RyanAB94.admin ", password: "right-horse-battery" }));
const cookie = setc && setc.split(";")[0];
check("right username (any case) and password: signed in with a secure, HttpOnly, SameSite=Strict cookie", ls === 200 && /HttpOnly/.test(setc) && /Secure/.test(setc) && /SameSite=Strict/.test(setc) && /Max-Age=43200/.test(setc), setc);
const C = { Cookie: cookie };
check("the cookie opens the admin API", (await W("/api/admin/me", { headers: C })).status === 200);
const [, made] = await J(await post("/api/admin/passes", { count: 3, note: "friends", kind: "one" }, C));
const [, free] = await J(await post("/api/admin/passes", { count: 1, note: "mum", kind: "sub" }, C));
check("creates one-party passes and a free unlimited code", made.passes.length === 3 && free.passes.length === 1);
const [, list] = await J(await W("/api/admin/passes", { headers: C }));
const fp = list.passes.find(p => p.pass === free.passes[0]);
check("the list has them all, the free code marked unlimited and active", list.passes.length === 4 && fp.kind === "sub" && fp.subActive && fp.subStatus === "free");
const g1 = await J(await post("/api/games", { pass: free.passes[0] })), g2 = await J(await post("/api/games", { pass: free.passes[0], fresh: true }));
check("a free unlimited code opens game after game", g1[0] === 200 && g2[0] === 200 && g1[1].room !== g2[1].room, [g1, g2]);
await post("/api/admin/revoke", { pass: made.passes[0] }, C);
check("cancelling a pass stops it", (await J(await post("/api/games", { pass: made.passes[0] })))[0] === 410);
const room = await J(await post("/api/admin/room", {}, C));
check("test room: a fresh room code", room[0] === 200 && /^[A-Z0-9]{6}$/.test(room[1].room), room);
check("a request from another site is refused", (await post("/api/admin/passes", { count: 1 }, { ...C, Origin: "https://evil.example" })).status === 403);
check("…from this site it's fine", (await post("/api/admin/passes", { count: 1 }, { ...C, Origin: "https://cloakandcandle.co.uk" })).status === 200);
const [exp, sig] = cookie.split("=")[1].split(".");
check("a tampered cookie is refused", (await W("/api/admin/me", { headers: { Cookie: "cc_admin=" + (+exp + 9e9) + "." + sig } })).status === 401);
check("an expired cookie is refused", (await W("/api/admin/me", { headers: { Cookie: "cc_admin=" + (Date.now() - 1000) + "." + sig } })).status === 401);
check("changing the password signs the session out", (await W("/api/admin/me", { headers: C }, { ...env, ADMIN_PASSWORD: "new-one" })).status === 401);
check("the Bearer token still works for tools/passes.sh", (await W("/api/admin/passes", { headers: { Authorization: "Bearer tok" } })).status === 200);
const lo = await J(await post("/api/admin/logout", {}, C));
check("sign out clears the cookie", lo[0] === 200 && /Max-Age=0/.test(lo[2]));
const tries = []; for (let i = 0; i < 22; i++) tries.push((await J(await post("/api/admin/login", { user: "ryanab94.admin", password: "guess" + i }, { "CF-Connecting-IP": "198.51.100.9" })))[0]);
const after = (await J(await post("/api/admin/login", { user: "ryanab94.admin", password: "right-horse-battery" }, { "CF-Connecting-IP": "198.51.100.9" })))[0];
check("twenty wrong passwords from one address, then it waits an hour (even the right one)", tries.slice(0, 20).every(s => s === 401) && tries.slice(20).every(s => s === 429) && after === 429, tries);
check("…other addresses are unaffected", (await J(await post("/api/admin/login", { user: "ryanab94.admin", password: "right-horse-battery" }, { "CF-Connecting-IP": "198.51.100.10" })))[0] === 200);

// the domain move: pages on the old domain and on www. go to thebetrayal.co.uk (/g/ becomes /t/); the API answers everywhere
const hosts = { ...env, SITE_HOST: "thebetrayal.co.uk", OLD_HOSTS: "cloakandcandle.co.uk,www.cloakandcandle.co.uk", ASSETS: { fetch: async () => new Response("page") } };
const at = (u, init) => worker.fetch(new Request(u, init), hosts);
const r1 = await at("https://cloakandcandle.co.uk/g/ABC234?x=1"), r2 = await at("https://www.thebetrayal.co.uk/rules"), r3 = await at("https://cloakandcandle.co.uk/api/admin/me", { headers: { Authorization: "Bearer tok" } }), r4 = await at("https://thebetrayal.co.uk/t/ABC234");
check("old domain: a Table link moves to the new domain's /t/", r1.status === 301 && r1.headers.get("Location") === "https://thebetrayal.co.uk/t/ABC234?x=1", r1.headers.get("Location"));
check("www. goes to the bare domain", r2.status === 301 && r2.headers.get("Location") === "https://thebetrayal.co.uk/rules");
check("the API still answers on the old domain (Stripe's webhook, open Tables)", r3.status === 200);
check("the new domain serves /t/CODE", r4.status === 200 && (await r4.text()) === "page");
console.log(ok ? "RESULT: CLEAN" : "RESULT: FAILED"); process.exit(ok ? 0 : 1);
