// The feedback survey, with Stripe, the mail binding and the Durable Objects stubbed: the admin sends it from a booking
// code; the page reads it, answers it once for a one-use 30% code (or stops feedback emails); the owner hears of each
// answer; the admin lists them; the morning summary counts them. node qa/survey.mjs
import worker, { Registry } from "../worker/src/index.js";
import { passKey } from "../worker/src/codes.js";
import { register } from "node:module";
// the Workers runtime's cloudflare:email, stubbed for Node, so the owner's alert emails can be read back
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, next) { return s === "cloudflare:email" ? { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export class EmailMessage { constructor(from, to, raw) { Object.assign(this, { from, to, raw }) } }") } : next(s, c) }'));
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 400))); ok = ok && !!cond; };
const store = () => { const m = new Map(); return { get: async (k) => m.get(k), put: async (k, v) => { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v); }, delete: async (k) => { for (const x of [].concat(k)) m.delete(x); },
  list: async ({ prefix, reverse, limit, start }) => { let e = [...m].filter(([k]) => k.startsWith(prefix) && (!start || k >= start)).sort((a, b) => (a[0] < b[0] ? -1 : 1)); if (reverse) e.reverse(); if (limit) e = e.slice(0, limit); return new Map(e); } }; };
// the MAIL binding: emails to customers in `sent`, the owner's alerts (raw MIME) in `alerts`
const sent = [], alerts = []; let mailFail = false;
const MAIL = { send: async (m) => { if (mailFail) throw new Error("refused"); (m.raw ? alerts : sent).push(m); return { messageId: "m" + (sent.length + alerts.length) }; } };
const GAME = { idFromName: (n) => n, get: () => ({ fetch: async () => new Response("{}") }) };
const REGISTRY = { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(new Request(u, i)) }) };
const reg = new Registry({ storage: store() }, { GAME, MAIL, REGISTRY, SITE_HOST: "thebetrayal.co.uk", ALERT_TO: "info@thebetrayal.co.uk", STRIPE_SECRET_KEY: "sk_test_x" });
const env = { ADMIN_TOKEN: "adm", GAME, REGISTRY, STRIPE_SECRET_KEY: "sk_test_x" };

// Stripe: coupons and promotion codes, each call kept; switches to refuse, or to clash once on a code
const coupons = [], promos = []; let stripeDown = false, clash = 0;
globalThis.fetch = async (u, init) => {
  u = String(u); const q = new URLSearchParams((init && init.body) || ""), ver = init && init.headers && init.headers["Stripe-Version"];
  if (stripeDown) return new Response(JSON.stringify({ error: { message: "Stripe is down" } }), { status: 500 });
  if (u === "https://api.stripe.com/v1/coupons") { const c = { id: "co_" + (coupons.length + 1), q, ver }; coupons.push(c); return new Response(JSON.stringify({ id: c.id })); }
  if (u === "https://api.stripe.com/v1/promotion_codes") {
    if (clash > 0) { clash--; return new Response(JSON.stringify({ error: { message: "An active promotion code with that code already exists." } }), { status: 400 }); }
    promos.push({ q, ver }); return new Response(JSON.stringify({ id: "promo_" + promos.length, code: q.get("code") }));
  }
  return new Response("{}", { status: 404 });
};
const W = (path, init) => worker.fetch(new Request("https://thebetrayal.co.uk" + path, init), env);
const J = async (r) => [r.status, await r.json().catch(() => ({}))];
const A = (path, body) => W("/api/admin/" + path, body === undefined ? { headers: { Authorization: "Bearer adm" } } : { method: "POST", headers: { Authorization: "Bearer adm", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(J);
const get = (t) => W("/api/survey?t=" + encodeURIComponent(t)).then(J);
const answer = (t, answers) => W("/api/survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t, answers }) }).then(J);
const good = { overall: 5, recommend: 9, setup: "Easy", length: "About right", again: "Yes", comment: "Loved the night. The quiz was brilliant.", quote: true, name: "Sam" };
const pass = async (code, v) => { await reg.storage.put("pass:" + passKey(code), { created: Date.now(), source: "stripe", paid: Date.now(), ...v }); return code; };
const tokenOf = (m) => (m.text.match(/\/survey\?t=([a-z2-9]{24})/) || [])[1];
const decoded = (raw) => Buffer.from(raw.split("\r\n\r\n").slice(1).join("").replace(/\s/g, ""), "base64").toString("utf8");

const P1 = await pass("OATH-ABCD-EFGH", { email: "buyer@example.com", room: "QWERTY" });
await pass("OATH-BCDE-FGHJ", {});
await pass("OATH-CDEF-GHJK", { email: "pending@example.com", pending: true, paid: null });

// sending, from the admin only
check("the admin's survey route needs the admin", (await W("/api/admin/survey", { method: "POST", body: "{}" }).then(J))[0] === 401);
check("an unknown code is refused", (await A("survey", { pass: "OATH-ZZZZ-ZZZZ" }))[0] === 404);
let r = await A("survey", { pass: "OATH-BCDE-FGHJ" });
check("a code with no email address asks for one", r[0] === 400 && /no email address/.test(r[1].error), r);
check("…and an address that isn't one is refused", (await A("survey", { pass: "OATH-BCDE-FGHJ", to: "not-an-email" }))[0] === 400);
check("an unpaid code can't be surveyed", (await A("survey", { pass: "OATH-CDEF-GHJK" }))[0] === 409);
r = await A("survey", { pass: P1 });
const m1 = sent.at(-1), t1 = tokenOf(m1);
check("Survey emails the buyer", r[0] === 200 && r[1].to === "buyer@example.com" && sent.length === 1 && m1.to === "buyer@example.com" && /How was your game/.test(m1.subject), [r, m1 && m1.subject]);
check("…from the bookings address, replies to us", m1.from.email === "bookings@thebetrayal.co.uk" && m1.replyTo === "info@thebetrayal.co.uk", m1.from);
check("…with a link to its survey, and one to stop feedback emails", !!t1 && m1.html.includes("/survey?t=" + t1) && m1.text.includes("/survey?t=" + t1 + "&stop=1") && /30% off your next Table/.test(m1.html), m1.text);
let pv = await reg.storage.get("pass:" + passKey(P1));
check("…and the booking code remembers it", pv.survey === t1 && pv.surveyed > 0);
r = await A("survey", { pass: P1, to: "other@example.com" });
check("sending again reuses the same link (to any address)", r[0] === 200 && tokenOf(sent.at(-1)) === t1 && sent.at(-1).to === "other@example.com" && (await reg.storage.get("survey:" + t1)).sends === 2);
mailFail = true; r = await A("survey", { pass: P1 }); mailFail = false;
check("a refused send says so", r[0] === 502 && /didn’t send/.test(r[1].error), r);

// the page: reading, checking, answering
check("a link with a malformed token isn't valid", (await get("ABC"))[0] === 404 && (await get("abcdefghjkmnpqrstuvwxyz2"))[0] === 404);
r = await get(t1);
check("the page reads its survey: not answered yet, and nothing private", r[0] === 200 && r[1].answered === false && !JSON.stringify(r[1]).includes("@"), r);
check("the five questions are required", (await answer(t1, { overall: 5 }))[0] === 400 && (await answer(t1, { ...good, overall: 6 }))[0] === 400 && (await answer(t1, { ...good, setup: "Meh" }))[0] === 400);
check("…and nothing was made for a refused answer", coupons.length === 0 && promos.length === 0);
const alertsBefore = alerts.length;
r = await answer(t1, good);
const code = r[1].code, until = r[1].until;
check("answering gives a THANKS code", r[0] === 200 && /^THANKS[A-Z2-9]{6}$/.test(code || ""), r);
check("…good for about six months", Math.abs(until - (Date.now() + 180 * 86400000)) < 60000, until);
const cp = coupons[0], pc = promos[0];
check("…made in Stripe as the admin makes codes: a 30% coupon, once", coupons.length === 1 && cp.q.get("percent_off") === "30" && cp.q.get("duration") === "once" && cp.q.get("metadata[by]") === "survey" && cp.ver === "2025-09-30.clover", cp && Object.fromEntries(cp.q));
check("…with a one-use promotion code, for one party, that runs out", promos.length === 1 && pc.q.get("code") === code && pc.q.get("max_redemptions") === "1" && +pc.q.get("expires_at") === Math.floor(until / 1000) && pc.q.get("metadata[plans]") === "one" && pc.q.get("promotion[coupon]") === cp.id, pc && Object.fromEntries(pc.q));
const m2 = sent.at(-1);
check("…and emailed to them, with a link that fills it in", m2.to === "other@example.com" && /30% off/.test(m2.subject) && m2.html.includes(code) && m2.text.includes("/buy?discount=" + code), m2.subject);
check("…and the page is told it went", r[1].mailed === true);
const al = alerts.slice(alertsBefore).map((x) => decoded(x.raw)).join("\n");
check("the owner hears of the answer, the comment and the code", alerts.length === alertsBefore + 1 && /Loved the night/.test(al) && al.includes(code) && /Happy to be quoted, as Sam/.test(al) && /OATH-ABCD-EFGH/.test(alerts.at(-1).raw + al), al.slice(0, 300));
r = await answer(t1, { ...good, overall: 1 });
check("answering twice gives the same code and makes nothing new", r[0] === 200 && r[1].code === code && coupons.length === 1 && promos.length === 1 && (await reg.storage.get("survey:" + t1)).answers.overall === 5);
check("the page then shows the code it earned", (await get(t1))[1].code === code && (await get(t1))[1].answered === true);
check("the booking code knows it was answered", (await reg.storage.get("pass:" + passKey(P1))).surveyAnswered > 0);
r = await A("survey", { pass: P1 });
check("an answered survey isn't sent again", r[0] === 409 && r[1].error.includes(code), r);

// two taps on Send at once: one code
const P2 = await pass("OATH-DEFG-HJKM", { email: "two@example.com" });
await A("survey", { pass: P2 }); const t2 = tokenOf(sent.at(-1));
const both = await Promise.all([answer(t2, good), answer(t2, good)]);
check("two answers at once make one code", both[0][1].code && both[0][1].code === both[1][1].code && promos.length === 2 && coupons.length === 2, both.map((x) => x[1]));

// a clash with an existing code tries another; Stripe down still keeps the answer
const P3 = await pass("OATH-EFGH-JKMN", { email: "three@example.com" });
await A("survey", { pass: P3 }); const t3 = tokenOf(sent.at(-1));
clash = 1; r = await answer(t3, good);
check("a code that already exists is swapped for another", r[0] === 200 && /^THANKS/.test(r[1].code) && coupons.length === 3 && promos.length === 3, r);
const P4 = await pass("OATH-FGHJ-KMNP", { email: "four@example.com" });
await A("survey", { pass: P4 }); const t4 = tokenOf(sent.at(-1));
stripeDown = true; r = await answer(t4, good); stripeDown = false;
const s4 = await reg.storage.get("survey:" + t4), al4 = decoded(alerts.at(-1).raw);
check("with Stripe down the answer is kept, without a code", r[0] === 200 && r[1].code === null && s4.answered > 0 && /Stripe is down/.test(s4.codeErr || ""), [r, s4.codeErr]);
const P6 = await pass("OATH-HJKM-NPQR", { email: "six@example.com" });
await A("survey", { pass: P6 }); const t6 = tokenOf(sent.at(-1));
mailFail = true; r = await answer(t6, good); mailFail = false;
check("if their code's email doesn't send, the page isn't told it did", r[0] === 200 && /^THANKS/.test(r[1].code) && r[1].mailed === false && (await get(t6))[1].mailed === false, r);
check("…and the owner is told to make one by hand", /couldn’t be made/.test(al4) && /Discount codes/.test(al4), al4.slice(-200));
const errs = [...(await reg.storage.list({ prefix: "err:" })).values()];
check("…and it's in the error log", errs.some((e) => /No 30% code/.test(e.msg)), errs.map((e) => e.msg));

// stopping feedback emails
const P5 = await pass("OATH-GHJK-MNPQ", { email: "Stop@Example.com" });
await A("survey", { pass: P5 }); const t5 = tokenOf(sent.at(-1));
r = await W("/api/survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: t5, stop: true }) }).then(J);
check("the stop link stops feedback emails to that address", r[0] === 200 && !!(await reg.storage.get("svoff:stop@example.com")));
r = await A("survey", { pass: P5 });
check("…so the admin can't send it there again", r[0] === 409 && /asked not to/.test(r[1].error), r);
check("…in any case of the address", (await A("survey", { pass: P5, to: "STOP@example.com" }))[0] === 409);

// the admin's list and the morning summary
r = await A("surveys");
const rows = r[1].surveys || [], row1 = rows.find((x) => x.code === code);
check("the admin lists every survey, latest activity first", r[0] === 200 && rows.length === 6 && rows.every((x, i) => !i || (rows[i - 1].answered || rows[i - 1].sent) >= (x.answered || x.sent)), rows.map((x) => x.pass));
check("…with the answers and the code, shown as OATH-, and no link token", row1 && row1.pass === "OATH-ABCD-EFGH" && row1.answers.comment.startsWith("Loved") && !rows.some((x) => "token" in x), row1);
check("the admin list needs the admin", (await W("/api/admin/surveys").then(J))[0] === 401);
const d = await (await reg.fetch(new Request("https://registry/digest", { method: "POST", body: "{}" }))).json();
check("the morning summary counts feedback sent and answered", /Feedback: 6 surveys sent, 5 answered \(5\.0 out of 5 on average\)/.test(d.body), d.body);

console.log(ok ? "RESULT: CLEAN" : "RESULT: FAILED");
process.exit(ok ? 0 : 1);
