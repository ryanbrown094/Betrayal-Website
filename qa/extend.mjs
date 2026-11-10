// More time (extend.html), with the mail binding and the Durable Objects stubbed: the hourly schedule emails the buyer
// once, a day after their Table opened, if its game isn't over; the link's page adds 24 hours once, or asks us for
// longer with a reason and a date (a report in /admin, and an email to us); the admin's Extend still works.
// node qa/extend.mjs
import worker, { Registry } from "../worker/src/index.js";
import { passKey } from "../worker/src/codes.js";
import { reminderEmail } from "../worker/src/survey-mail.js";
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, next) { return s === "cloudflare:email" ? { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export class EmailMessage { constructor(from, to, raw) { Object.assign(this, { from, to, raw }) } }") } : next(s, c) }'));
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 400))); ok = ok && !!cond; };
const store = () => { const m = new Map(); return { get: async (k) => m.get(k), put: async (k, v) => { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v); }, delete: async (k) => { for (const x of [].concat(k)) m.delete(x); },
  list: async ({ prefix, reverse, limit, start }) => { let e = [...m].filter(([k]) => k.startsWith(prefix) && (!start || k >= start)).sort((a, b) => (a[0] < b[0] ? -1 : 1)); if (reverse) e.reverse(); if (limit) e = e.slice(0, limit); return new Map(e); } }; };
const sent = [], alerts = []; let mailFail = false;
const MAIL = { send: async (m) => { if (mailFail) throw new Error("refused"); (m.raw ? alerts : sent).push(m); return { messageId: "m" + (sent.length + alerts.length) }; } };
// each room's game: whether it has ended, and the closing times the Registry gives it
const done = new Set(), gone = new Set(), extended = [], sums = {};
const GAME = { idFromName: (n) => n, get: (n) => ({ fetch: async (u, i) => {
  const code = String(n).slice(5), p = new URL(u).pathname;
  if (p === "/_done") return new Response(JSON.stringify({ done: done.has(code) }));
  if (p === "/_admin/summary") return new Response(JSON.stringify(sums[code] || {}));
  if (p === "/_extend") { if (gone.has(code)) return new Response("{}", { status: 404 }); extended.push({ code, expires: JSON.parse(i.body).expires }); return new Response(JSON.stringify({ ok: true })); }
  return new Response("{}");
} }) };
const REGISTRY = { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(new Request(u, i)) }) };
const reg = new Registry({ storage: store() }, { GAME, MAIL, REGISTRY, SITE_HOST: "thebetrayal.co.uk", ALERT_TO: "info@thebetrayal.co.uk" });
const env = { ADMIN_TOKEN: "adm", GAME, REGISTRY, MAIL, ALERT_TO: "info@thebetrayal.co.uk" };
const W = (path, init) => worker.fetch(new Request("https://thebetrayal.co.uk" + path, init), env);
const J = async (r) => [r.status, await r.json().catch(() => ({}))];
const A = (path, body) => W("/api/admin/" + path, { method: "POST", headers: { Authorization: "Bearer adm", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(J);
const get = (t) => W("/api/extend?t=" + encodeURIComponent(t)).then(J);
const post = (b) => W("/api/extend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(J);
const run = async () => (await reg.fetch(new Request("https://registry/remind-run", { method: "POST", body: "{}" }))).json();
const decoded = (raw) => Buffer.from(raw.split("\r\n\r\n").slice(1).join("").replace(/\s/g, ""), "base64").toString("utf8");
const H = 3600000, now = Date.now();
const pass = async (code, v) => { await reg.storage.put("pass:" + passKey(code), { created: now - 30 * H, source: "stripe", paid: now - 30 * H, ...v }); return passKey(code); };
const room = async (code, v) => reg.storage.put("room:" + code, { created: now - 25 * H, expires: now + 23 * H, ...v });
const tokenOf = (m) => (m.text.match(/\/extend\?t=([a-z2-9]{24})/) || [])[1];

// the Tables: one a day old with its game going on, and the ones that get no email
const K1 = await pass("OATH-ABCD-EFGH", { email: "buyer@example.com", room: "AAAAAA" }); await room("AAAAAA", { pass: K1 });
const K2 = await pass("OATH-BCDE-FGHJ", { email: "young@example.com", room: "BBBBBB" }); await room("BBBBBB", { pass: K2, created: now - 23 * H, expires: now + 25 * H });
await room("CCCCCC", { pass: "MASTER" });
const K4 = await pass("OATH-CDEF-GHJK", { email: "won@example.com", room: "DDDDDD" }); await room("DDDDDD", { pass: K4 }); done.add("DDDDDD");
const K5 = await pass("OATH-DEFG-HJKM", { room: "EEEEEE" }); await room("EEEEEE", { pass: K5 });
const K6 = await pass("OATH-EFGH-JKMN", { email: "regular@example.com", kind: "sub", room: "GGGGGG" }); await room("FFFFFF", { pass: K6 }); await room("GGGGGG", { pass: K6, created: now - 2 * H, expires: now + 46 * H });
const K7 = await pass("OATH-FGHJ-KMNP", { email: "late@example.com", room: "HHHHHH" }); await room("HHHHHH", { pass: K7, created: now - 47.8 * H, expires: now + 0.2 * H });
const K8 = await pass("OATH-GHJK-MNPQ", { email: "gone@example.com", room: "JJJJJJ" }); await room("JJJJJJ", { pass: K8, created: now - 60 * H, expires: now - 12 * H });
// a website Table: waiting for its game for days (none), and one whose game started 25 hours ago, opened a week before
const KW = await pass("OATH-WXYZ-2345", { email: "waiting@example.com", room: "WWWWWW" }); await room("WWWWWW", { pass: KW, created: now - 3 * 24 * H, expires: now + 27 * 24 * H, startHours: 48 });
const KS = await pass("OATH-XYZ2-3456", { email: "started@example.com", room: "SSSSSS" }); await room("SSSSSS", { pass: KS, created: now - 6 * 24 * H, started: now - 25 * H, expires: now + 23 * H });

let r = await run();
check("the hourly run: an email to each buyer whose 48 hours began a day ago with the game going on (from opening, for an older Table; from the game's start, for a newer one)", r.sent === 2 && sent.length === 2 && sent[0].to === "buyer@example.com" && sent[1].to === "started@example.com", [r, sent.map((m) => m.to)]);
check("…none for a Table still waiting for its game", !sent.some((m) => m.to === "waiting@example.com"));
check("…none for a Table under a day old, a test Table, a finished game, a booking with no address, a Regular's older Table, one about to close or one closed",
  !sent.some((m) => /young|won|regular|late|gone/.test(m.to)) && r.skipped === 3, r);
const m1 = sent[0], t1 = tokenOf(m1);
check("…it says when the Table closes and links to /extend with a token", /^Your Table closes at \d\d:\d\d on \w+day \d+ \w+$/.test(m1.subject) && !!t1 && m1.html.includes("/extend?t=" + t1) && m1.html.includes("AAAAAA") && /isn't over yet/.test(m1.text), [m1.subject, m1.text.slice(0, 200)]);
check("…from the bookings address, replies to us", m1.from.email === "bookings@thebetrayal.co.uk" && m1.replyTo === "info@thebetrayal.co.uk");
r = await run();
check("…and the next hour sends nothing again", r.sent === 0 && sent.length === 2, r);
check("…the finished game and the address-less booking are noted, so they aren't asked about every hour", (await reg.storage.get("room:DDDDDD")).remindSkip === "finished" && (await reg.storage.get("room:EEEEEE")).remindSkip === "no email" && (await reg.storage.get("room:FFFFFF")).remindSkip === "newer Table");

// a refused email: logged, tried the next hour, given up after three
const K9 = await pass("OATH-HJKM-NPQR", { email: "retry@example.com", room: "KKKKKK" }); await room("KKKKKK", { pass: K9 });
mailFail = true; const r1 = await run(), r2 = await run(), r3 = await run(); mailFail = false; const r4 = await run();
const errs = (await (await reg.fetch(new Request("https://registry/errs", { method: "POST", body: "{}" }))).json()).errors.filter((e) => /day-old reminder/.test(e.msg));
check("a refused email is logged and tried again the next hour, three times, then given up", r1.failed === 1 && r2.failed === 1 && r3.failed === 1 && r4.sent === 0 && errs.length === 3 && (await reg.storage.get("room:KKKKKK")).remindSkip === "mail failed", [r1, r2, r3, r4, errs.length]);

// the schedule: the hourly cron runs it, the morning's doesn't
const K10 = await pass("OATH-JKMN-PQRS", { email: "cron@example.com", room: "LLLLLL" }); await room("LLLLLL", { pass: K10 });
let waits = []; await worker.scheduled({ cron: "0 7 * * *" }, { ...env, ASSETS: { fetch: async () => new Response("") } }, { waitUntil: (w) => waits.push(w) }); await Promise.all(waits);
check("the morning's schedule doesn't send them", !sent.some((m) => m.to === "cron@example.com"));
waits = []; await worker.scheduled({ cron: "0 * * * *" }, env, { waitUntil: (w) => waits.push(w) }); await Promise.all(waits);
check("…the hourly one does", sent.filter((m) => m.to === "cron@example.com").length === 1);

// the page's link
let [s, j] = await get(t1);
check("the link: the Table, when it closes, open, nothing added or asked yet", s === 200 && j.room === "AAAAAA" && j.expires === now + 23 * H && j.open === true && !j.added && !j.asked, [s, j]);
check("…a made-up token, or none, isn't a link", (await get("abcdefghjkmnpqrstuvwxyz2"))[0] === 404 && (await get(""))[0] === 404 && (await post({ t: "x", add: true }))[0] === 404);
[s, j] = await post({ t: t1, add: true });
const rm = await reg.storage.get("room:AAAAAA"), pv = await reg.storage.get("pass:" + K1);
check("Add 24 hours: the Table closes a day later, in the Registry, on the booking and in the game itself", s === 200 && j.expires === now + 47 * H && rm.expires === j.expires && pv.expires === j.expires && extended.at(-1).code === "AAAAAA" && extended.at(-1).expires === j.expires && rm.extended === 24 && !!rm.selfExtended, [s, j, rm]);
[s, j] = await post({ t: t1, add: true });
check("…once only", s === 409 && /already added/.test(j.error) && j.expires === now + 47 * H && (await reg.storage.get("room:AAAAAA")).expires === now + 47 * H, [s, j]);
check("…and the link now says so", (await get(t1))[1].added > 0);

// a closed Table reopens for 24 hours from now; a deleted one can't
const t10 = tokenOf(sent.find((m) => m.to === "cron@example.com"));
await reg.storage.put("room:LLLLLL", { ...(await reg.storage.get("room:LLLLLL")), expires: now - H });
[s, j] = await post({ t: t10, add: true });
check("a Table that has closed reopens for 24 hours from now", s === 200 && j.expires >= now + 24 * H - 5000 && j.expires <= Date.now() + 24 * H, [s, j]);
const K11 = await pass("OATH-KMNP-QRST", { email: "deleted@example.com", room: "MMMMMM" }); await room("MMMMMM", { pass: K11 }); await run();
const t11 = tokenOf(sent.find((m) => m.to === "deleted@example.com")); gone.add("MMMMMM");
[s, j] = await post({ t: t11, add: true });
check("…one whose game has been deleted can't, and its free day isn't used up", s === 410 && !(await reg.storage.get("ext:" + t11)).added, [s, j]);
// a Regular who has opened a newer Table since the email
const K12 = await pass("OATH-MNPQ-RSTV", { email: "moved@example.com", kind: "sub", room: "NNNNNN" }); await room("NNNNNN", { pass: K12 }); await run();
const t12 = tokenOf(sent.find((m) => m.to === "moved@example.com"));
await reg.storage.put("pass:" + K12, { ...(await reg.storage.get("pass:" + K12)), room: "PPPPPP" });
[s, j] = await post({ t: t12, add: true });
check("a Regular's older Table isn't reopened once they've started a newer one", s === 409 && /newer Table/.test(j.error), [s, j]);

// asking for longer
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10), in10 = ymd(Date.now() + 10 * 86400000);
[s, j] = await post({ t: t1, until: in10, reason: "  " });
check("asking for longer: a reason is needed", s === 400 && j.field === "reason", [s, j]);
for (const [d, why] of [[ymd(Date.now()), "today"], [ymd(Date.now() - 86400000), "yesterday"], [ymd(Date.now() + 91 * 86400000), "91 days ahead"], ["2026-02-30x", "not a date"], ["", "none"]]) {
  [s, j] = await post({ t: t1, until: d, reason: "Half the party were ill" });
  check("…and a date from tomorrow to 90 days ahead (not " + why + ")", s === 400 && j.field === "until", [d, s, j]);
}
const a0 = alerts.length;
[s, j] = await post({ t: t1, until: in10, reason: "Half the party were ill, so we're finishing next weekend." });
const reps = (await (await reg.fetch(new Request("https://registry/reports", { method: "POST", body: "{}" }))).json()).reports, rep = reps.find((x) => x.kind === "extension");
check("…which comes to us as an open report for that Table, from their address, with their reason and date", s === 200 && j.until === in10 && rep && rep.status === "open" && rep.room === "AAAAAA" && rep.email === "buyer@example.com" && rep.what.includes("Half the party were ill") && rep.url === "/extend", [s, j, rep]);
const al = decoded(alerts[a0].raw);
check("…and as an email to us that they can be answered from", alerts.length === a0 + 1 && /Reply-To: buyer@example\.com/.test(alerts[a0].raw) && al.includes("Half the party were ill") && al.includes("AAAAAA") && al.includes("OATH-ABCD-EFGH") && al.includes("Extend this Table"), al.slice(0, 300));
check("…and the link now says it's been asked", (await get(t1))[1].asked.until === in10);
for (let i = 0; i < 4; i++) await post({ t: t1, until: in10, reason: "again " + i });
[s, j] = await post({ t: t1, until: in10, reason: "and again" });
check("…five times at most", s === 429, [s, j]);

// the admin's Give it on the request: open to the end of that day, UK time; they're emailed; the report is resolved
const reqRep = (await (await reg.fetch(new Request("https://registry/reports", { method: "POST", body: "{}" }))).json()).reports.find((x) => x.kind === "extension" && x.status === "open");
const sentBefore = sent.length;
[s, j] = await A("ext-give", { id: reqRep.id });
const endOfDay = (() => { const off = +new Date(in10 + "T12:00:00Z").toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }) - 12; return Date.parse(in10 + "T23:59:00Z") - off * 3600000; })();
const given = sent[sentBefore], rgv = await reg.storage.get("room:AAAAAA"), repAfter = await reg.storage.get("rep:" + reqRep.id);
check("Give it: the Table is open until 23:59 UK time on the day they asked for, in the game too", s === 200 && Math.abs(j.expires - endOfDay) < 1000 && rgv.expires === j.expires && extended.at(-1).expires === j.expires && (await reg.storage.get("pass:" + K1)).expires === j.expires, [s, j, endOfDay]);
check("…they're emailed when it now closes", j.mailed === true && given && given.to === "buyer@example.com" && /^More time: your Table is open until 23:59 on \w+day \d+ \w+$/.test(given.subject) && given.text.includes("AAAAAA"), given && given.subject);
check("…and the report is resolved, with a note; the room page shows it given", repAfter.status === "resolved" && /Given .* open until the end of/.test(repAfter.adminNote) && (await (await W("/api/admin/roominfo?room=AAAAAA", { headers: { Authorization: "Bearer adm" } })).json()).ext.asked.given > 0, repAfter);
[s, j] = await A("ext-give", { id: reqRep.id });
check("…a second Give it is refused: it's already open until then", s === 409 && /already open/.test(j.error), [s, j]);
check("…and Give it on an ordinary problem report is refused", (await A("ext-give", { id: "R-NOPE00" }))[0] === 404);

// the admin's Extend, by booking code or by the Table's code, after the change
[s, j] = await A("extend", { pass: "OATH-BCDE-FGHJ", hours: 5 });
check("the admin's Extend still works by booking code", s === 200 && j.room === "BBBBBB" && j.expires === now + 30 * H && (await reg.storage.get("pass:" + K2)).expires === j.expires, [s, j]);
[s, j] = await A("extend", { room: "CCCCCC", hours: 1 });
check("…and by the Table's code (a test Table)", s === 200 && j.expires === now + 24 * H, [s, j]);

// the admin's room page: the Registry's side of a Table, and what's kept once its game is deleted
const info = async (room) => W("/api/admin/roominfo?room=" + room, { headers: { Authorization: "Bearer adm" } }).then(J);
[s, j] = await info("AAAAAA");
check("room info: the buyer's address, the reminder, the free 24 hours and the request, no token", s === 200 && j.email === "buyer@example.com" && j.room.reminded > 0 && j.ext.added > 0 && j.ext.asked.until === in10 && j.ext.asked.report && !JSON.stringify(j).includes(t1) && j.room.pass === "OATH-ABCD-EFGH", [s, j]);
await reg.fetch(new Request("https://registry/room-summary", { method: "POST", body: JSON.stringify({ room: "AAAAAA", summary: { mode: "modern", players: 9, rounds: 4, done: true, winner: "loyal", joinOnly: 2, devices: 12 } }) }));
[s, j] = await info("AAAAAA");
check("…and once its game is deleted, its summary and when", j.room.summary.players === 9 && j.room.summary.winner === "loyal" && j.room.deleted > 0, j.room);
check("…for the admin only, and only for a real Table", (await W("/api/admin/roominfo?room=AAAAAA")).status === 401 && (await info("ZZZZZZ"))[0] === 404);

// the morning summary: Tables opened in the last two days still waiting for their game, and phones that left the join page
await room("QQQQQQ", { pass: K1, created: now - 3 * H, expires: now + 29 * 24 * H, startHours: 48 }); sums.QQQQQQ = { players: 2, joinOnly: 2, devices: 4 };
await room("RRRRRR", { pass: K1, created: now - 1 * H, expires: now + 30 * 24 * H, startHours: 48 }); sums.RRRRRR = { players: 1, joinOnly: 1 };
await room("TTTTTT", { pass: "MASTER", created: now - 5 * H, expires: now + 43 * H }); sums.TTTTTT = { joinOnly: 5 };
const dg = await (await reg.fetch(new Request("https://registry/digest", { method: "POST", body: "{}" }))).json();
const waitLine = (dg.body.match(/^Opened but not started yet: .*$/m) || [""])[0];
check("morning summary: a Table opened over two hours ago and still waiting for its game, with its lobby and join-page leavers", /QQQQQQ \(opened \w+ \d\d:\d\d, 2 in the lobby, 2 left the join page without joining\)/.test(waitLine) && !/RRRRRR|TTTTTT/.test(waitLine), waitLine);
check("…and phones that left the join page across new Tables (not test rooms)", /Join page, never joined: 3 phones, at Tables opened in the last two days/.test(dg.body), dg.body);

// errors: the admin mutes a kind of error (numbers aside); it's left out of the morning count, and can be unmuted
const logE = (msg) => reg.fetch(new Request("https://registry/err", { method: "POST", body: JSON.stringify({ src: "server", where: "IndexNow", msg }) }));
await logE("IndexNow refused 6 pages: 429"); await logE("IndexNow refused 1 pages: 429"); await logE("Something else broke");
let ej2 = await (await W("/api/admin/errors", { headers: { Authorization: "Bearer adm" } })).json();
check("errors: the list says which kinds are muted (none yet)", Array.isArray(ej2.muted) && ej2.muted.length === 0);
[s, j] = await A("err-mute", { key: "IndexNow refused # pages: #" });
const dg2 = await (await reg.fetch(new Request("https://registry/digest", { method: "POST", body: "{}" }))).json();
check("…muting one kind leaves every error like it out of the morning count and its most common", s === 200 && j.muted.includes("IndexNow refused # pages: #") && /muted\)/.test(dg2.body) && !/IndexNow refused/.test(dg2.body) && /Something else broke/.test(dg2.body), dg2.body.split("\n").find((l) => l.startsWith("Errors")));
[s, j] = await A("err-mute", { key: "IndexNow refused # pages: #", on: false });
check("…and unmuting brings it back", s === 200 && !j.muted.length && /IndexNow refused/.test((await (await reg.fetch(new Request("https://registry/digest", { method: "POST", body: "{}" }))).json()).body));

// contact-form spam: kept in Reports as spam, never emailed; real messages (and in-game reports) still come through
{
  const send = (b) => W("/api/report", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100." + Math.floor(Math.random() * 250) }, body: JSON.stringify({ url: "/contact", device: "contact form", email: "someone@example.com", ...b }) }).then(J);
  const repOf = async (id) => reg.storage.get("rep:" + id), a0 = alerts.length;
  const pitch = "Hi,\n\nWe checked your website and noticed that its visibility on Google and Bing appears to be lower than it should be. It looks like some important SEO (Search Engine Optimization) steps may still be incomplete.\n\nIf you'd like, I can quickly explain what we found and how it can be fixed. Just reply with your phone number and a convenient time to call.";
  const [s1, j1] = await send({ what: pitch, filled: 45000 }), r1 = await repOf(j1.id);
  check("spam: the SEO pitch is kept as spam, not emailed, and the sender still gets a reference", s1 === 200 && /^R-/.test(j1.id) && r1.status === "spam" && /sales pitch/.test(r1.spam) && alerts.length === a0, [s1, j1, r1 && r1.spam]);
  const [, j2] = await send({ what: "Do you do group discounts?", hp: "http://spam.example", filled: 40000 });
  const [, j3] = await send({ what: "Do you do group discounts?", filled: 1200 });
  check("…as is a message with the hidden field filled in, or sent a second after the page opened", (await repOf(j2.id)).status === "spam" && /hidden field/.test((await repOf(j2.id)).spam) && (await repOf(j3.id)).status === "spam" && /1\.2 seconds/.test((await repOf(j3.id)).spam) && alerts.length === a0);
  const [, j4] = await send({ what: "I found you on Google and booked for Saturday, but I've lost my code. Can you resend it?", filled: 60000 });
  const [, j5] = await send({ what: "Your website design is lovely. Does it work for 30 people?" });
  check("…a real message still comes through and is emailed (Google mentioned, a compliment on the site, or from a page from before the check)", (await repOf(j4.id)).status === "open" && (await repOf(j5.id)).status === "open" && alerts.length === a0 + 2, [alerts.length - a0]);
  const [, j6] = await W("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ what: "The SEO question in the quiz had the wrong answer", device: "abc", host: true }) }).then(J);
  check("…an in-game problem report is never checked for spam", (await repOf(j6.id)).status === "open");
  const dg3 = await (await reg.fetch(new Request("https://registry/digest", { method: "POST", body: "{}" }))).json();
  check("…the morning summary counts spam apart", /\(and 3 spam caught: Reports, Show Spam\)/.test(dg3.body), dg3.body.split("\n").find((l) => l.startsWith("Problem")));
  await A("report", { id: j4.id, status: "spam" }); const sp = (await repOf(j4.id)).status; await A("report", { id: j4.id, status: "open" });
  check("…and the admin can mark a message spam, or not spam", sp === "spam" && (await repOf(j4.id)).status === "open");
}

// the email's closing time, in UK time
const e = reminderEmail({ token: "abcdefghjkmnpqrstuvwxyz2", host: "thebetrayal.co.uk", room: "33M56V", expires: Date.parse("2026-07-10T09:05:00Z") });
check("the email gives the closing time in UK time (summer)", e.subject === "Your Table closes at 10:05 on Friday 10 July", e.subject);

console.log("RESULT: " + (ok ? "CLEAN" : "FAILED"));
process.exit(ok ? 0 : 1);
