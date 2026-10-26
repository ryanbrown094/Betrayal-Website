// The iPhone app's tiers (worker/src/tiers.js), on the real Worker, Registry and rooms with in-memory storage: the app's
// codes are a pool of their own, free games, the Night Pass's 24 hours (and its night coming back when no game in it got
// going), the Host Pass, a host making a live free game ad-free, the codes list, and the website's rooms unchanged.
// node qa/app-tiers.mjs
import worker, { GameState, Registry } from "../worker/src/index.js";
import * as T from "../worker/src/tiers.js";
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, next) { return s === "cloudflare:email" ? { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export class EmailMessage { constructor(f, t, r) { Object.assign(this, { from: f, to: t, raw: r }) } }") } : next(s, c) }'));
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 400))); ok = ok && !!cond };
const store = () => { const m = new Map(); return { m, get: async (k) => m.get(k), put: async (k, v) => { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v) }, delete: async (k) => m.delete(k),
  list: async ({ prefix = "" } = {}) => new Map([...m].filter(([k]) => k.startsWith(prefix))), setAlarm: async () => {}, deleteAll: async () => m.clear() } };

// the clock, so a Night Pass's 24 hours can pass
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;

// every room a real GameState, the Registry a real Registry, wired as Cloudflare wires them
const rooms = new Map(), env = { MASTER_PASS: "MASTERTEST", ADMIN_TOKEN: "adm", PASS_HOURS: "48", KEEP_DAYS: "7", MAIL: { send: async () => ({}) }, ALERT_TO: "x@y.z", SITE_HOST: "thebetrayal.co.uk" };
const roomDO = (id) => { if (!rooms.has(id)) { const st = store(); rooms.set(id, { st, DO: new GameState({ storage: st }, env) }); } return rooms.get(id); };
env.GAME = { idFromName: (n) => n, get: (id) => ({ fetch: (u, i) => roomDO(id).DO.fetch(u instanceof Request ? u : new Request(u, i)) }) };
const reg = new Registry({ storage: store() }, env);
env.REGISTRY = { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(u instanceof Request ? u : new Request(u, i)) }) };

const W = (path, body, headers) => worker.fetch(new Request("https://thebetrayal.co.uk" + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9", ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined }), env);
const J = async (r) => [r.status, await r.json().catch(() => ({}))];
const games = (body, ip) => W("/api/games", body, ip ? { "CF-Connecting-IP": ip } : null).then(J);
const mint = async (kind, pool) => (await J(await W("/api/admin/passes", { count: 1, kind, ...(pool ? { pool } : {}) }, { Authorization: "Bearer adm" })))[1].passes[0];
const poll = (room, tok) => W("/api/g/" + room + "/m", null, tok ? { "X-Tok": tok } : null).then(J);
const create = (room, name, pass) => W("/api/g/" + room + "/m/create", { name, ...(pass ? { pass } : {}) }).then(J);
const joinAs = (room, name) => W("/api/g/" + room + "/m/join", { name }).then(J);
const upgrade = (room, tok, pass) => W("/api/g/" + room + "/m/upgrade", { pass }, tok ? { "X-Tok": tok } : null).then(J);
const codes = (passes) => W("/api/app/codes", { passes }).then(J);
// a game that got going: its first round reached (as the engine marks it once everyone has seen their role)
const playRound = async (room) => { const r = roomDO("room:" + room); const s = await r.st.get("modern"); await r.st.put("modern", { ...(s || {}), round: 1 }); r.DO.mstate = null; };

// --- the rules, on their own
check("tiers: no code is free, the website's codes are full, the app's are what they are", T.tierFor(null) === "free" && T.tierFor({}) === "full" && T.tierFor({ kind: "sub" }) === "full" && T.tierFor({ pool: "app", kind: "night" }) === "night" && T.tierFor({ pool: "app", kind: "host" }) === "host");
check("tiers never go down", T.higher("host", "night") === "host" && T.higher("free", "night") === "night" && T.higher("night", "free") === "night");
const fv = T.tierView("free", {}), nv = T.tierView("night", {});
check("what the phones read: free has ads and the base Trials, a pass none and everything", fv.tier === "free" && !fv.adFree && fv.content === "base" && nv.adFree && nv.content === "all" && !nv.ads && T.tierView("host", {}).content === "all");
check("a free game's ads: on, with their limits, unless ADS_ENABLED is 0", fv.ads.enabled && fv.ads.interstitialMinGapSec === 240 && fv.ads.interstitialMaxPerRoom === 4 && fv.ads.bannerEnabled && !T.tierView("free", { ADS_ENABLED: "0" }).ads.enabled);

// --- the website, as it was
const web = await mint();
const [ws, wj] = await games({ pass: web });
check("a website code still opens a Table on the website", ws === 200 && wj.room && !wj.tier, [ws, wj]);
const [, wcr] = await create(wj.room, "Ann", web);
const [, wpoll] = await poll(wj.room, wcr.tok);
check("…and its room says nothing about tiers (the website's responses are as they were)", wpoll.view && wpoll.room && !("tier" in wpoll.room), wpoll.room);
const [wa] = await games({ pass: web, app: true });
check("a website code is refused in the app (its own pool)", wa === 403);

// --- free games
const [fs, fj] = await games({ app: true });
check("the app with no code gets a free game", fs === 200 && fj.room && fj.tier === "free", [fs, fj]);
const [, fcr] = await create(fj.room, "Ann");
check("…its host sets it up", fcr.tok, fcr);
const [, fpoll] = await poll(fj.room, fcr.tok);
check("…and every poll says it's free: ads, the base Trials", fpoll.room.tier && fpoll.room.tier.tier === "free" && fpoll.room.tier.adFree === false && fpoll.room.tier.content === "base", fpoll.room);
const many = []; for (let i = 0; i < 11; i++) many.push((await games({ app: true }, "198.51.100.7"))[0]);
check("at most ten free games a day from one address", many.slice(0, 10).every((x) => x === 200) && many[10] === 429, many);

// --- the master passcode, for testing the app's tiers
const [ms, mj] = await games({ pass: "MASTERTEST", app: true, tier: "free" });
check("the master passcode opens a test game at the tier asked for", ms === 200 && mj.test && mj.tier === "free", [ms, mj]);

// --- the Night Pass
const night = await mint("night", "app");
const [nw] = await games({ pass: night });
check("an app code is refused on the website", nw === 403);
const [n1s, n1] = await games({ pass: night, app: true });
const day = 24 * 3600000;
check("a Night Pass opens an ad-free game, and its 24 hours start", n1s === 200 && n1.tier === "night" && n1.kind === "night" && Math.abs(n1.until - (Date.now() + day)) < 5000, [n1s, n1]);
const [, ncr] = await create(n1.room, "Ann", night);
const [, npoll] = await poll(n1.room, ncr.tok);
check("…every poll says ad-free and everything unlocked", npoll.room.tier.adFree === true && npoll.room.tier.content === "all", npoll.room);
const [, n1b] = await games({ pass: night, app: true });
check("entering it again brings the same game back", n1b.room === n1.room && n1b.again, n1b);
const [, n2] = await games({ pass: night, app: true, fresh: true });
check("…or a new one, inside the 24 hours", n2.room && n2.room !== n1.room && n2.tier === "night", n2);
await new Promise((r) => setTimeout(r, 5)); // a room counts as closed from the millisecond after
const closed = await poll(n1.room); check("…which closes the one before", closed[1].room.expired === true, closed);
skew += day + 60000;
const [, n2b] = await games({ pass: night, app: true });
check("after the 24 hours its game, still open, comes back", n2b.room === n2.room && n2b.again, n2b);
const [, st1] = await codes([night]);
check("the codes list says an unplayed night will come back", st1.codes[0].state === "ready", st1);
const [, n3] = await games({ pass: night, app: true, fresh: true });
check("no game in it got going, so the night comes back: a new 24 hours", n3.room && n3.until > Date.now() + day - 5000, n3);
await playRound(n3.room);
skew += day + 60000;
const [, st2] = await codes([night]);
check("once a game in it got going, the list says the night is over", st2.codes[0].state === "ended", st2);
const [n4s, n4] = await games({ pass: night, app: true, fresh: true });
check("…and it opens no new game", n4s === 410, [n4s, n4]);

// --- the Host Pass
const host = await mint("host", "app");
const [h1s, h1] = await games({ pass: host, app: true });
check("a Host Pass opens a host-tier game", h1s === 200 && h1.tier === "host" && h1.sub === true, [h1s, h1]);
const [, st3] = await codes([host, night, web, "OATH-ZZZZ-ZZZZ"]);
check("the codes list: the Host Pass active, the website's and unknown codes left out", st3.codes.length === 2 && st3.codes[0].kind === "host" && st3.codes[0].state === "active", st3);

// --- making a live free game ad-free
const [, f2] = await games({ app: true }, "192.0.2.1");
const [, f2c] = await create(f2.room, "Ann");
const [, f2j] = await joinAs(f2.room, "Bob");
check("a free game's lobby lists the Trials a pass would add", (await poll(f2.room, f2c.tok))[1].view.locked.length === 7);
const night2 = await mint("night", "app");
check("only the host can use a pass on the game", (await upgrade(f2.room, f2j.tok, night2))[0] === 403);
check("a website code can't", (await upgrade(f2.room, f2c.tok, web))[0] === 403);
check("an unknown code can't", (await upgrade(f2.room, f2c.tok, "OATH-ZZZZ-ZZZZ"))[0] === 404);
const [us, uj] = await upgrade(f2.room, f2c.tok, night2);
check("the host's Night Pass makes the game ad-free at once", us === 200 && uj.room.tier.tier === "night" && uj.room.tier.adFree === true, [us, uj && uj.room]);
const [, bobPoll] = await poll(f2.room, f2j.tok);
check("…every other phone sees it with its next poll", bobPoll.room.tier.adFree === true && bobPoll.room.tier.content === "all", bobPoll.room);
check("…and every Trial is unlocked", !bobPoll.view.locked && (await roomDO("room:" + f2.room).st.get("modern")).opts.content === "all");
check("a Night Pass game plays everything from the start", npoll.view && !npoll.view.locked && (await roomDO("room:" + n1.room).st.get("modern")).opts.content === "all");
check("…and the pass's 24 hours have started, on this game", (await games({ pass: night2, app: true }))[1].room === f2.room);
check("using a pass again on an ad-free game is refused", (await upgrade(f2.room, f2c.tok, host))[0] === 409);

// --- practice games: one person and the bots
const [ps, pj] = await games({ app: true, practice: true }, "198.51.100.30");
check("the app's practice game: a free game, marked practice", ps === 200 && pj.tier === "free" && pj.practice === true, [ps, pj]);
const [, pc] = await create(pj.room, "Robin");
check("…set up with nine bots and the person playing", pc.view && pc.view.players.length === 10 && pc.view.practice === true && pc.view.locked.length >= 7, pc.view && { n: pc.view.players.length, practice: pc.view.practice });
await playRound(pj.room); await poll(pj.room, pc.tok);
const prac = []; for (let i = 0; i < 5; i++) prac.push((await games({ app: true, practice: true }, "198.51.100.30"))[0]);
check("at most five practice games a day from one address", prac.slice(0, 4).every((x) => x === 200) && prac[4] === 429, prac);
check("…counted apart from free games", (await games({ app: true }, "198.51.100.30"))[0] === 200);

// --- the app's figures: counts a day, and the weekly host conversion
const six = async (pass, ip) => {
  const [, g] = await games({ app: true, ...(pass ? { pass } : {}) }, ip);
  const [, c] = await create(g.room, "Host", pass);
  for (const n of ["Bo", "Cy", "Di", "Ed", "Flo"]) await joinAs(g.room, n);
  await playRound(g.room); await poll(g.room, c.tok); await poll(g.room, c.tok);
  return g.room;
};
await six(null, "192.0.2.60");
await six(await mint("night", "app"), "192.0.2.61");
check("the app's ad and offer events are counted", (await W("/api/app/event", { e: "ad_shown", placement: "P2" }).then(J))[0] === 200 && (await W("/api/app/event", { e: "upsell_clicked", placement: "U1", product: "night" }).then(J))[0] === 200);
check("…and nothing else is", (await W("/api/app/event", { e: "whatever" }).then(J))[0] === 400);
const [ss, sj] = await J(await W("/api/admin/app-stats?days=3", null, { Authorization: "Bearer adm" }));
const today = sj.days && sj.days[sj.days.length - 1].counts;
check("the admin sees today's counts", ss === 200 && today["round_started.free.6"] === 1 && today["round_started.night.6"] === 1 && today["ad_shown.P2"] === 1 && today["upsell_clicked.U1.night"] === 1 && today["room_created.free"] >= 1 && today["night_pass_activated"] >= 1, today);
const wk = sj.conversion && sj.conversion[sj.conversion.length - 1];
check("…and the week's host conversion: paid games of six or more, of all that got going", wk && wk.games6 === 2 && wk.paid6 === 1 && wk.rate === 50, sj.conversion);
check("…a game is counted once, however often it's polled, and practice games not at all", today["round_started.free.6"] === 1 && today["practice_created.free"] >= 1);
check("the figures need the admin's token", (await W("/api/admin/app-stats"))?.status === 401 || (await W("/api/admin/app-stats")).status === 403);

console.log(ok ? "\nall passed" : "\nFAILED");
process.exit(ok ? 0 : 1);
