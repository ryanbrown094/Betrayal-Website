// Stripe, with Stripe's API and the Durable Objects stubbed: the checkout (consent, pending pass, the session's
// parameters), the claim from the thank-you page, the signed webhook (paid, expired, refunded) and what a pending,
// paid, expired or refunded pass may do. node qa/claim.mjs
import worker, { Registry } from "../worker/src/index.js";
import { emailHash } from "../worker/src/email-hash.js";
import { createHash } from "node:crypto";
import { passKey } from "../worker/src/codes.js";
import { register } from "node:module";
// the Workers runtime's cloudflare:email, stubbed for Node, so the owner's alert emails can be read back
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, next) { return s === "cloudflare:email" ? { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export class EmailMessage { constructor(from, to, raw) { Object.assign(this, { from, to, raw }) } }") } : next(s, c) }'));
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 400))); ok = ok && !!cond };
const store = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v) }, delete: async k => { for (const x of [].concat(k)) m.delete(x) },
  list: async ({ prefix, reverse, limit }) => { let e = [...m].filter(([k]) => k.startsWith(prefix)).sort((a, b) => a[0] < b[0] ? -1 : 1); if (reverse) e.reverse(); if (limit) e = e.slice(0, limit); return new Map(e) } } };
const closed = [], extended = []; let gameGone = false;
const GAME = { idFromName: n => n, get: id => ({ fetch: async (u, init) => { if (String(u).endsWith("/_close")) closed.push(id); if (String(u).endsWith("/_extend")) { if (gameGone) return new Response("{}", { status: 404 }); extended.push([id, JSON.parse(init.body).expires]) } return new Response("{}") } }) };
// the MAIL binding, stubbed: what it was asked to send, and a switch to make it refuse
// (booking emails to buyers in `sent`; the owner's alerts, raw MIME, in `alerts`)
const sent = [], alerts = []; let mailFail = false; const MAIL = { send: async m => { if (mailFail) throw new Error("refused"); (m.raw ? alerts : sent).push(m); return { messageId: "m" + (sent.length + alerts.length) } } };
const reg = new Registry({ storage: store() }, { GAME, MAIL, SITE_HOST: "thebetrayal.co.uk", ALERT_TO: "info@thebetrayal.co.uk" });
const base = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_ID: "price_123", STRIPE_SUB_PRICE_ID: "price_sub", STRIPE_WEBHOOK_SECRET: "whsec_test", ADMIN_TOKEN: "adm", GAME, REGISTRY: { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(new Request(u, i)) }) } };

// the stubbed Stripe: sessions made, sessions read back
const made = [], sessions = {}, invoices = {}, pis = {}; let failCreate = false, refuseDiscount = false;
// discount codes: Stripe's coupons and promotion codes, and every call made for them
const coupons = {}, promos = [], promoCalls = [];
globalThis.fetch = async (u, init) => {
  u = String(u);
  if (u === "https://api.stripe.com/v1/checkout/sessions" && init && init.method === "POST") {
    if (failCreate || (refuseDiscount && new URLSearchParams(init.body).has("discounts[0][promotion_code]"))) return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 });
    const q = new URLSearchParams(init.body), id = "cs_test_" + String(made.length).padStart(12, "0");
    made.push({ q, auth: init.headers.Authorization, version: init.headers["Stripe-Version"] });
    const sub = q.get("mode") === "subscription";
    sessions[id] = { id, mode: q.get("mode"), payment_status: "unpaid", metadata: { pass: q.get("metadata[pass]") }, customer_details: { email: "buyer@example.com" }, payment_intent: sub ? null : "pi_" + made.length, subscription: sub ? "sub_" + made.length : null, customer: "cus_" + made.length };
    return new Response(JSON.stringify({ id, url: "https://checkout.stripe.com/c/pay/" + id }));
  }
  if (u === "https://api.stripe.com/v1/billing_portal/sessions") return new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/" + new URLSearchParams(init.body).get("customer") }));
  const m = u.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(cs_\w+)$/);
  if (m) return sessions[m[1]] ? new Response(JSON.stringify(sessions[m[1]])) : new Response("{}", { status: 404 });
  const bypi = u.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\?limit=1&payment_intent=(\w+)$/);
  if (bypi) return new Response(JSON.stringify({ data: Object.values(sessions).filter(x => x.payment_intent === bypi[1]) }));
  const pim = u.match(/^https:\/\/api\.stripe\.com\/v1\/payment_intents\/(\w+)$/);
  if (pim) return new Response(JSON.stringify(pis[pim[1]] || { id: pim[1], status: "canceled", last_payment_error: null }));
  const ver = init && init.headers && init.headers["Stripe-Version"];
  if (u === "https://api.stripe.com/v1/coupons" && init && init.method === "POST") {
    const q = new URLSearchParams(init.body), id = "co_" + (Object.keys(coupons).length + 1); promoCalls.push({ path: "coupons", q, version: ver });
    coupons[id] = { id, percent_off: +q.get("percent_off"), duration: q.get("duration") }; return new Response(JSON.stringify(coupons[id]));
  }
  if (u === "https://api.stripe.com/v1/promotion_codes" && init && init.method === "POST") {
    const q = new URLSearchParams(init.body), c = coupons[q.get("promotion[coupon]")]; promoCalls.push({ path: "promotion_codes", q, version: ver });
    if (!c || q.get("promotion[type]") !== "coupon" || promos.some(x => x.code === q.get("code"))) return new Response(JSON.stringify({ error: { message: "An active promotion code with `code: " + q.get("code") + "` already exists." } }), { status: 400 });
    const md = {}; for (const [k, v] of q) { const mm = k.match(/^metadata\[(\w+)\]$/); if (mm) md[mm[1]] = v }
    const p = { id: "promo_" + (promos.length + 1), code: q.get("code"), active: true, times_redeemed: 0, max_redemptions: q.get("max_redemptions") ? +q.get("max_redemptions") : null, expires_at: q.get("expires_at") ? +q.get("expires_at") : null, metadata: md, created: Math.floor(Date.now() / 1000), promotion: { type: "coupon", coupon: c.id } };
    promos.push(p); return new Response(JSON.stringify(p));
  }
  const pu = u.match(/^https:\/\/api\.stripe\.com\/v1\/promotion_codes\/(promo_\w+)$/);
  if (pu && init && init.method === "POST") { const p = promos.find(x => x.id === pu[1]); if (!p) return new Response("{}", { status: 404 }); p.active = new URLSearchParams(init.body).get("active") !== "false"; return new Response(JSON.stringify(p)) }
  if (u.startsWith("https://api.stripe.com/v1/promotion_codes?")) {
    const q = new URLSearchParams(u.split("?")[1]); promoCalls.push({ path: "list", q, version: ver });
    let list = promos.map(p => ({ ...p, promotion: { type: "coupon", coupon: q.getAll("expand[]").includes("data.promotion.coupon") ? coupons[p.promotion.coupon] : p.promotion.coupon } }));
    if (q.get("active") === "true") list = list.filter(p => p.active); if (q.get("code")) list = list.filter(p => p.code.toUpperCase() === q.get("code").toUpperCase());
    return new Response(JSON.stringify({ data: list.slice(0, +q.get("limit") || 10) }));
  }
  const inv = u.match(/^https:\/\/api\.stripe\.com\/v1\/invoices\/(\w+)$/);
  if (inv && invoices[inv[1]]) return new Response(JSON.stringify(invoices[inv[1]]));
  return new Response("{}", { status: 404 });
};
const W = (path, init, env) => worker.fetch(new Request("https://cloakandcandle.co.uk" + path, init), env || base);
const J = async r => [r.status, await r.json().catch(() => ({}))];
const checkout = (body, env, ip) => W("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip || "203.0.113.1" }, body: JSON.stringify(body) }, env).then(J);
const redeem = (pass, fresh) => W("/api/games", { method: "POST", body: JSON.stringify({ pass, fresh }) }).then(J);
const claim = id => W("/api/claim?session_id=" + id, {}).then(J);
// codes are shown as OATH-…; the records keep their CNDL- keys
const passOf = async p => (await reg.storage.get("pass:" + passKey(p)));
async function hook(ev, secret, t) {
  const body = JSON.stringify(ev); t = t || Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret || "whsec_test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + body)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return W("/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": "t=" + t + ",v1=" + sig }, body }).then(J);
}

// checkout
check("no price configured: 503", (await checkout({ terms: true, supply: true }, { ...base, STRIPE_PRICE_ID: "" }))[0] === 503);
check("without both ticks: 400", (await checkout({ terms: true }))[0] === 400 && (await checkout({ supply: true }))[0] === 400);
const [s1, c1] = await checkout({ terms: true, supply: true });
const q = made[0] && made[0].q, pass1 = q && q.get("metadata[pass]");
check("checkout: sends the buyer to Stripe", s1 === 200 && /^https:\/\/checkout\.stripe\.com\//.test(c1.url), [s1, c1]);
check("the session: one party pass at the configured price, payment mode, secret key", q.get("mode") === "payment" && q.get("line_items[0][price]") === "price_123" && q.get("line_items[0][quantity]") === "1" && made[0].auth === "Bearer sk_test_x");
check("the session: Managed Payments on, with its API version, and no promotion codes", q.get("managed_payments[enabled]") === "true" && made[0].version === "2026-02-25.preview" && !q.has("allow_promotion_codes"), [made[0].version, q.get("managed_payments[enabled]")]);
check("the session: success and cancel URLs", q.get("success_url") === "https://cloakandcandle.co.uk/claim?session_id={CHECKOUT_SESSION_ID}" && q.get("cancel_url") === "https://cloakandcandle.co.uk/buy", [q.get("success_url"), q.get("cancel_url")]);
check("the session: the pass and the consent timestamps in its metadata, and nothing Managed Payments refuses", /^OATH-/.test(pass1) && q.get("metadata[pass]") === pass1 && !!q.get("metadata[consent_supply]") && ![...q.keys()].some(k => /^(invoice_creation|payment_intent_data|subscription_data\[description)/.test(k)), [...q.keys()]);
check("the pass exists, pending, linked to its session", (await passOf(pass1)).pending === true && (await passOf(pass1)).session === "cs_test_000000000000");
check("a pending pass can't open a room", (await redeem(pass1))[0] === 402);
failCreate = true; const bad = await checkout({ terms: true, supply: true }, base, "203.0.113.9"); failCreate = false;
const allPasses = async () => [...(await reg.storage.list({ prefix: "pass:" })).values()];
check("Stripe refuses: 502 with Stripe's reason, and that pending pass is dropped", bad[0] === 502 && bad[1].detail === "Stripe said: nope" && (await allPasses()).length === 1, (await allPasses()).length);
const flood = []; for (let i = 0; i < 12; i++) flood.push((await checkout({ terms: true, supply: true }, base, "198.51.100.7"))[0]);
check("ten checkouts an hour per address", flood.slice(0, 10).every(x => x === 200) && flood.slice(10).every(x => x === 429), flood);

// claim from the thank-you page
check("unpaid: 402", (await claim("cs_test_000000000000"))[0] === 402);
sessions.cs_test_000000000000.payment_status = "paid";
const [cs, cj] = await claim("cs_test_000000000000"), again = await claim("cs_test_000000000000");
check("paid: the claim returns the same pass the invoice carries, every time", cs === 200 && cj.pass === pass1 && again[1].pass === pass1, [cs, cj, again]);
check("…and the pass is active", (await passOf(pass1)).pending === false && (await passOf(pass1)).note === "buyer@example.com");
// enhanced conversions: the thank-you page gets the checkout email hashed (SHA-256 hex of the normalised address), never the address
const sha = (x) => createHash("sha256").update(x).digest("hex");
check("the claim gives the thank-you page the buyer's email hashed, and not the address", cj.emailHash === sha("buyer@example.com") && !JSON.stringify(cj).includes("buyer@example.com"), cj);
check("…normalised as Google asks: trimmed, lower case, no full stops before a Gmail address's @", (await emailHash("  Jane.Doe@Gmail.com ")) === sha("janedoe@gmail.com") && (await emailHash("Jane.Doe@GoogleMail.com")) === sha("janedoe@googlemail.com"));
check("…other addresses keep their full stops", (await emailHash("jane.doe@example.com")) === sha("jane.doe@example.com"));
check("…and anything that isn't an address has no hash", (await emailHash("")) === null && (await emailHash(null)) === null && (await emailHash("not-an-email")) === null && (await emailHash("x@")) === null);
check("an active pass opens a room", (await redeem(pass1))[0] === 200);
check("the same code typed with the old CNDL- prefix, or none, finds the same Table", (await redeem("CNDL-" + pass1.slice(5)))[1].room === (await redeem(pass1.slice(5)))[1].room);
check("not a session id: 400", (await claim("bogus"))[0] === 400);

// the webhook
const [, c2] = await checkout({ terms: true, supply: true }, base, "203.0.113.2"), id2 = c2.url.split("/").pop(), pass2 = sessions[id2].metadata.pass;
check("webhook: a bad signature is refused", (await hook({ type: "checkout.session.completed", data: { object: { ...sessions[id2], payment_status: "paid" } } }, "whsec_wrong"))[0] === 400);
check("webhook: an old timestamp is refused", (await hook({ type: "checkout.session.completed", data: { object: { ...sessions[id2], payment_status: "paid" } } }, null, Math.floor(Date.now() / 1000) - 900))[0] === 400);
check("webhook: completed but unpaid (bank transfer pending) leaves it pending", (await hook({ type: "checkout.session.completed", data: { object: sessions[id2] } }))[0] === 200 && (await passOf(pass2)).pending === true);
await hook({ type: "checkout.session.async_payment_succeeded", data: { object: { ...sessions[id2], payment_status: "paid" } } });
check("webhook: the payment clears → the pass is active, before anyone visits the thank-you page", (await passOf(pass2)).pending === false);
sessions[id2].payment_status = "paid"; check("the thank-you page then gets the same pass", (await claim(id2))[1].pass === pass2);
const [, c3] = await checkout({ terms: true, supply: true }, base, "203.0.113.3"), id3 = c3.url.split("/").pop(), pass3 = sessions[id3].metadata.pass;
await hook({ type: "checkout.session.expired", data: { object: sessions[id3] } });
check("webhook: an expired checkout nobody tried to pay is forgotten", !(await passOf(pass3)) && (await redeem(pass3))[0] === 404);
const listed = async () => (await W("/api/admin/passes", { headers: { Authorization: "Bearer adm" } }).then(J))[1].passes.map(x => x.pass);
const [, c6] = await checkout({ terms: true, supply: true }, base, "203.0.113.6"), id6 = c6.url.split("/").pop(), pass6 = sessions[id6].metadata.pass;
check("admin: a checkout in progress isn't listed", !(await listed()).includes(pass6) && (await listed()).includes(pass1));
check("webhook: a refused card at checkout is noted on its pass (found through its session)", (await hook({ type: "payment_intent.payment_failed", data: { object: { id: sessions[id6].payment_intent, object: "payment_intent", metadata: {}, last_payment_error: { message: "Your card was declined.", decline_code: "insufficient_funds" } } } }))[0] === 200 && (await passOf(pass6)).failWhy === "Your card was declined.");
check("admin: …and now it is listed, still unusable", (await listed()).includes(pass6) && (await redeem(pass6))[0] === 402);
await hook({ type: "checkout.session.expired", data: { object: sessions[id6] } });
check("webhook: when that checkout expires, the failed attempt stays listed, cancelled", (await listed()).includes(pass6) && !!(await passOf(pass6)).revoked && (await redeem(pass6))[0] === 410);
const [, c7] = await checkout({ terms: true, supply: true }, base, "203.0.113.7"), id7 = c7.url.split("/").pop(), pass7 = sessions[id7].metadata.pass;
pis[sessions[id7].payment_intent] = { id: sessions[id7].payment_intent, status: "canceled", last_payment_error: { message: "Your card has expired." } };
await hook({ type: "checkout.session.expired", data: { object: sessions[id7] } });
check("webhook: an expiry after a refusal we never heard about is still kept, with Stripe's reason", (await listed()).includes(pass7) && (await passOf(pass7)).failWhy === "Your card has expired.");
const [, c8] = await checkout({ terms: true, supply: true }, base, "203.0.113.8"), id8 = c8.url.split("/").pop(), pass8 = sessions[id8].metadata.pass;
await hook({ type: "checkout.session.async_payment_failed", data: { object: sessions[id8] } });
check("webhook: a bank payment that fails is kept and cancelled", (await listed()).includes(pass8) && !!(await passOf(pass8)).revoked && /bank/.test((await passOf(pass8)).failWhy));
check("webhook: a refused payment that isn't ours changes nothing", (await hook({ type: "payment_intent.payment_failed", data: { object: { id: "pi_other", metadata: {}, last_payment_error: { message: "x" } } } }))[0] === 200);
const [, c9] = await checkout({ terms: true, supply: true }, base, "203.0.113.10"), pass9 = sessions[c9.url.split("/").pop()].metadata.pass;
await reg.storage.put("pass:" + passKey(pass9), { ...(await passOf(pass9)), created: Date.now() - 49 * 3600000 }); await listed();
check("admin: an abandoned checkout the webhook never closed is cleared after two days", !(await passOf(pass9)));
await hook({ type: "charge.refunded", data: { object: { id: "ch_2", object: "charge", amount: 1500, amount_refunded: 1500, refunded: true, payment_intent: sessions[id2].payment_intent } } });
check("webhook: refunded before use → the pass is cancelled", !!(await passOf(pass2)).revoked && (await redeem(pass2))[0] === 410);
await hook({ type: "charge.refunded", data: { object: { id: "ch_1", object: "charge", amount: 1500, amount_refunded: 1500, refunded: true, payment_intent: sessions.cs_test_000000000000.payment_intent } } });
check("webhook: refunded after the party → the room stays, the refund is noted", !(await passOf(pass1)).revoked && !!(await passOf(pass1)).refunded && (await redeem(pass1))[0] === 200);
check("webhook: a partial refund of an unknown payment is logged, and changes nothing", (await hook({ type: "charge.refunded", data: { object: { id: "ch_9", amount: 1500, amount_refunded: 500, refunded: false, payment_intent: "pi_unknown" } } }))[0] === 200);
// a pass whose payment we never noted (the Managed Payments case): Stripe is asked which checkout the payment belonged to
const [, c5] = await checkout({ terms: true, supply: true }, base, "203.0.113.5"), id5 = c5.url.split("/").pop(), pass5 = sessions[id5].metadata.pass;
sessions[id5].payment_status = "paid"; const pi5 = sessions[id5].payment_intent; sessions[id5].payment_intent = null; await claim(id5); sessions[id5].payment_intent = pi5;
check("(a claim without the payment noted)", !(await reg.storage.get("pi:" + pi5)) && !(await passOf(pass5)).pending);
await hook({ type: "refund.created", data: { object: { id: "re_5", object: "refund", status: "succeeded", amount: 1500, payment_intent: pi5, charge: "ch_5" } } });
check("webhook: refund.created, payment unknown → found through its checkout session, pass cancelled", !!(await passOf(pass5)).revoked && !!(await passOf(pass5)).refunded && (await redeem(pass5))[0] === 410);
const hooks = (await W("/api/admin/hooks", { headers: { Authorization: "Bearer adm" } }).then(J))[1].hooks;
check("every webhook is logged with what it did (the refund names its pass)", hooks.length >= 5 && hooks[0].type === "refund.created" && hooks[0].pass === pass5 && hooks.some(h => h.type === "charge.refunded" && /No pass found/.test(h.result)), hooks.slice(0, 2));
const errs = (await W("/api/admin/errors", { headers: { Authorization: "Bearer adm" } }).then(J))[1].errors;
check("…and a refund we can't match goes in the error log", errs.some(e => e.src === "stripe" && /No pass found/.test(e.msg)), errs.slice(0, 2));
const gated = { ...base, SITE_PASSWORD: "candlelight" };
const gh = await (async () => { const body = JSON.stringify({ type: "customer.created", data: { object: {} } }), t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec_test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + body)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return W("/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": "t=" + t + ",v1=" + sig }, body }, gated) })();
check("the site password doesn't block Stripe's webhook (it's signed instead)", gh.status === 200, gh.status);
check("…but still guards the rest of the API", (await W("/api/games", { method: "POST", body: "{}" }, gated)).status === 401);
check("webhook: other events are acknowledged and ignored", (await hook({ type: "customer.created", data: { object: {} } }))[0] === 200);
check("no webhook secret configured: every webhook refused", (await W("/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": "t=1,v1=00" }, body: "{}" }, { ...base, STRIPE_WEBHOOK_SECRET: "" })).status === 400);

// a Payment Link checkout (no pass of its own) still mints one on claim
sessions.cs_test_paymentlink1 = { id: "cs_test_paymentlink1", payment_status: "paid", metadata: {}, customer_details: { email: "x@y.z" } };
const pl = await claim("cs_test_paymentlink1");
check("a checkout without a pending pass mints one when paid", pl[0] === 200 && /^OATH-/.test(pl[1].pass) && (await passOf(pl[1].pass)).source === "stripe:cs_test_paymentlink1");

// the monthly subscription: one code, a new game whenever they like, one at a time, only while it's paid
check("subscription not on sale: 503", (await checkout({ plan: "sub", terms: true, supply: true }, { ...base, STRIPE_SUB_PRICE_ID: "" }, "203.0.113.20"))[0] === 503);
const [ss, sc] = await checkout({ plan: "sub", terms: true, supply: true }, base, "203.0.113.21"), sid = sc.url.split("/").pop(), sq = made[made.length - 1].q, spass = sessions[sid].metadata.pass;
check("subscription checkout: subscription mode, the monthly price, the code in the subscription's metadata, nothing else extra", ss === 200 && sq.get("mode") === "subscription" && sq.get("line_items[0][price]") === "price_sub" && sq.get("subscription_data[metadata][pass]") === spass && ![...sq.keys()].some(k => /^(invoice_creation|payment_intent_data|subscription_data\[description)/.test(k)));
check("the one-off checkout is still payment mode at £10's price", made[0].q.get("mode") === "payment" && made[0].q.get("line_items[0][price]") === "price_123");
check("a pending subscription code opens nothing", (await redeem(spass))[0] === 402);
await hook({ type: "checkout.session.completed", data: { object: { ...sessions[sid], payment_status: "paid" } } });
const sp = await passOf(spass);
check("paid: the code is active, tied to its subscription and customer", sp.kind === "sub" && sp.subActive === true && sp.subId === sessions[sid].subscription && sp.customer === sessions[sid].customer, sp);
sessions[sid].payment_status = "paid"; const scl = await claim(sid);
check("the thank-you page gets the same code, marked as a subscription", scl[1].pass === spass && scl[1].sub === true, scl);
const g1 = await redeem(spass), g1b = await redeem(spass), g2 = await redeem(spass, true), g2b = await redeem(spass);
check("entering it again brings the current game back", g1[0] === 200 && g1b[1].room === g1[1].room && g1b[1].again && g1b[1].sub);
check("a fresh game: a new room, and the old one is closed", g2[0] === 200 && g2[1].room !== g1[1].room && closed.includes("room:" + g1[1].room) && g2b[1].room === g2[1].room);
check("…and it counts the games", (await passOf(spass)).games === 2);
await hook({ type: "customer.subscription.updated", data: { object: { id: sessions[sid].subscription, customer: sessions[sid].customer, status: "past_due", metadata: { pass: spass } } } });
await hook({ type: "invoice.payment_failed", data: { object: { id: "in_f", attempt_count: 2, parent: { subscription_details: { subscription: sessions[sid].subscription, metadata: { pass: spass } } } } } });
check("webhook: a renewal refused is noted on the code, which stays listed as a subscription", (await passOf(spass)).failWhy === "subscription payment failed (attempt 2)" && (await passOf(spass)).paid && (await listed()).includes(spass));
const lapsed = await redeem(spass);
check("payment failed (past_due): no games, and the message says why", lapsed[0] === 402 && /didn’t go through/.test(lapsed[1].error), lapsed);
await hook({ type: "customer.subscription.updated", data: { object: { id: sessions[sid].subscription, customer: sessions[sid].customer, status: "active", metadata: { pass: spass } } } });
check("paid again: games again", (await redeem(spass))[0] === 200);
await hook({ type: "customer.subscription.deleted", data: { object: { id: sessions[sid].subscription, customer: sessions[sid].customer, status: "canceled", metadata: { pass: spass } } } });
check("cancelled: no more games", (await redeem(spass))[0] === 402 && (await passOf(spass)).subStatus === "canceled");
invoices.in_1 = { id: "in_1", parent: { subscription_details: { subscription: sessions[sid].subscription } } };
await hook({ type: "charge.refunded", data: { object: { id: "ch_s", amount: 2000, amount_refunded: 2000, refunded: true, payment_intent: "pi_subinv", invoice: "in_1" } } });
check("a subscription payment refunded: found through its invoice, noted on the code", !!(await passOf(spass)).refunded && (await passOf(spass)).refundedAmount === 2000);
const portal = await W("/api/portal", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.22" }, body: JSON.stringify({ pass: spass }) }).then(J);
check("Manage subscription: the billing portal for that code's customer", portal[0] === 200 && portal[1].url === "https://billing.stripe.com/p/session/" + sessions[sid].customer, portal);
check("…a one-off pass has no portal", (await W("/api/portal", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.23" }, body: JSON.stringify({ pass: pass1 }) }).then(J))[0] === 404);
check("a one-off pass still opens only its one game", (await redeem(pass1, true))[1].room === (await redeem(pass1))[1].room);

// the broken seal: 10% off one party, by a promotion code applied for the buyer
{
  const EGG = { ...base, STRIPE_EGG_PROMO: "promo_egg" }, at = made.length;
  check("the seal: /api/egg says whether the discount is on", (await W("/api/egg", {}, EGG).then(J))[1].on === true && (await W("/api/egg", {}).then(J))[1].on === false);
  await checkout({ terms: true, supply: true, egg: true }, EGG, "203.0.113.91");
  check("…a buyer who found it gets the promotion code, and the session says so", made[at] && made[at].q.get("line_items[0][price]") === "price_123" && made[at].q.get("discounts[0][promotion_code]") === "promo_egg" && made[at].q.get("metadata[egg]") === "10% off" && !made[at].q.has("allow_promotion_codes"));
  await checkout({ terms: true, supply: true, egg: true }, base, "203.0.113.92");
  check("…with no promotion code set, the usual price", made[at + 1] && made[at + 1].q.get("line_items[0][price]") === "price_123" && !made[at + 1].q.has("discounts[0][promotion_code]") && !made[at + 1].q.has("metadata[egg]"));
  await checkout({ plan: "sub", terms: true, supply: true, egg: true }, EGG, "203.0.113.93");
  check("…and it's for one party only: a Regular pays the usual subscription", made[at + 2] && made[at + 2].q.get("line_items[0][price]") === "price_sub" && !made[at + 2].q.has("discounts[0][promotion_code]"));
  refuseDiscount = true; const n0 = made.length; const [st] = await checkout({ terms: true, supply: true, egg: true }, EGG, "203.0.113.94"); refuseDiscount = false;
  check("…if Stripe refuses the code, the sale still opens at full price", st === 200 && made.length === n0 + 1 && !made[n0].q.has("discounts[0][promotion_code]") && !made[n0].q.has("metadata[egg]"));
  const pg = await W("/seal", {}, { ...EGG, ASSETS: { fetch: (r) => new Response("<h1>The broken seal</h1>", { headers: { "Content-Type": "text/html" } }) } });
  check("…the /seal page is served, and kept out of search engines", pg.status === 200 && /noindex/.test(pg.headers.get("X-Robots-Tag") || ""));
}
// the booking email: sent once per paid booking, to the buyer, and again from the admin on request
{
  const n0 = sent.length;
  check("booking email: the first purchase's code was emailed to the buyer, once, though it was claimed twice", sent.filter(m => m.html.includes(pass1)).length === 1);
  const m = sent.find(m => m.html.includes(pass1));
  check("…from bookings@, replies to info@, with the code in the HTML and the text", m && m.from.email === "bookings@thebetrayal.co.uk" && m.replyTo === "info@thebetrayal.co.uk" && m.to === "buyer@example.com" && m.text.includes(pass1) && /Your Table is booked/.test(m.subject), m && { from: m.from, to: m.to, subject: m.subject });
  check("…and its button opens the home page with the code filled in", m && m.html.includes("https://thebetrayal.co.uk/?code=" + encodeURIComponent(pass1) + "#start"));
  check("…the thank-you page is told it was emailed", (await claim("cs_test_000000000000"))[1].emailed === true && sent.length === n0);
  const [, cx] = await checkout({ terms: true, supply: true }, base, "192.0.2.50"), idx = Object.keys(sessions).pop(), passx = sessions[idx].metadata.pass;
  sessions[idx].payment_status = "paid"; mailFail = true;
  const [hs] = await hook({ type: "checkout.session.completed", data: { object: { ...sessions[idx] } } });
  check("booking email: if sending fails, the payment still clears and nothing is marked sent", hs === 200 && (await passOf(passx)).pending === false && !(await passOf(passx)).mailed && sent.length === n0);
  mailFail = false; const [, cy] = await claim(idx);
  check("…and the next claim (the thank-you page) sends it", cy.emailed === true && sent.length === n0 + 1 && !!(await passOf(passx)).mailed);
  const A = (path, body) => W("/api/admin/" + path, { method: "POST", headers: { Authorization: "Bearer adm", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(J);
  const [rs, rj] = await A("resend", { pass: passx, to: "friend@example.org" });
  check("admin: \"Email\" sends the code again, to another address if given", rs === 200 && rj.to === "friend@example.org" && sent.length === n0 + 2 && sent[sent.length - 1].to === "friend@example.org" && (await passOf(passx)).mailedTo === "friend@example.org", [rs, rj]);
  check("admin: a cancelled code isn't emailed", (await A("resend", { pass: pass2 }))[0] === 409 && sent.length === n0 + 2);
}
// the admin's "extend": a Table stays open longer, on its booking code, in the Registry's list and in the Table itself
{
  const A = (path, body) => W("/api/admin/" + path, { method: "POST", headers: { Authorization: "Bearer adm", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(J);
  const before = await passOf(pass1), room = before.room, t0 = Date.now();
  const [es, ej] = await A("extend", { pass: pass1, hours: 24 }), after = await passOf(pass1), rr = await reg.storage.get("room:" + room);
  const want = Math.max(t0, before.expires) + 24 * 3600000;
  check("extend: a code's Table gets 24 more hours, on the code, in the list of Tables and in the Table itself", es === 200 && ej.room === room && Math.abs(after.expires - want) < 2000 && rr.expires === after.expires && rr.extended === 24 && extended.some(([id, e]) => id === "room:" + room && e === after.expires), [es, ej]);
  const [rs2, rj2] = await A("extend", { room, hours: 2 });
  check("extend: by the Table's own code too, and its booking code follows", rs2 === 200 && (await passOf(pass1)).expires === rj2.expires && rj2.expires - after.expires === 2 * 3600000, [rs2, rj2]);
  const [, cz] = await checkout({ terms: true, supply: true }, base, "192.0.2.77"), idz = Object.keys(sessions).pop(); sessions[idz].payment_status = "paid"; await claim(idz);
  check("extend: a code that hasn't opened a Table yet is refused, with why", (await A("extend", { pass: sessions[idz].metadata.pass, hours: 24 }))[0] === 409);
  check("extend: 0 hours, or more than 30 days, is refused", (await A("extend", { pass: pass1, hours: 0 }))[0] === 400 && (await A("extend", { pass: pass1, hours: 721 }))[0] === 400);
  gameGone = true; const gone = await A("extend", { room, hours: 1 }); gameGone = false;
  check("extend: a Table whose game was deleted can't be reopened", gone[0] === 410 && (await passOf(pass1)).expires === rj2.expires);
  check("extend: only for the admin", (await W("/api/admin/extend", { method: "POST", body: JSON.stringify({ pass: pass1, hours: 5 }) })).status === 401);
}
// the admin's "Set email" and "Delete"
{
  const A = (path, body) => W("/api/admin/" + path, { method: "POST", headers: { Authorization: "Bearer adm", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(J);
  check("set email: not an address is refused", (await A("setemail", { pass: pass1, email: "not-an-email" }))[0] === 400);
  const [ss] = await A("setemail", { pass: pass1, email: "owner@example.com" }), n = sent.length;
  const [rs] = await A("resend", { pass: pass1 });
  check("set email: the code keeps the address, and \"Email\" with no address typed sends there", ss === 200 && (await passOf(pass1)).email === "owner@example.com" && rs === 200 && sent.length === n + 1 && sent[sent.length - 1].to === "owner@example.com");
  check("delete: a code still in use can't be deleted", (await A("delete", { pass: pass1 }))[0] === 409 && !!(await passOf(pass1)));
  const [ds] = await A("delete", { pass: pass2 });
  check("delete: a refunded (cancelled) code is removed from the list", ds === 200 && !(await passOf(pass2)) && !(await listed()).includes(pass2));
  check("delete: and it's gone for good", (await A("delete", { pass: pass2 }))[0] === 404);
  const [ms, mj] = await A("passes", { count: 1, kind: "sub", email: "me@example.com" });
  check("create: a code made with an email address keeps it", ms === 200 && (await passOf(mj.passes[0])).email === "me@example.com" && (await passOf(mj.passes[0])).kind === "sub", [ms, mj]);
  check("create: a bad email address is refused", (await A("passes", { count: 1, email: "nope" }))[0] === 400);
}
// where a buyer came from: the buy page sends the site's "bt-src"; it's kept on the booking and on the Stripe payment
{
  const buy = async (src, ip) => { const n = made.length; await checkout({ terms: true, supply: true, src }, base, ip); const q = made[n].q; return { q, pass: q.get("metadata[pass]") } };
  const a = await buy({ src: "Instagram", med: "bio", camp: "oct", ref: "l.instagram.com", land: "/" }, "192.0.2.91");
  check("source: utm tags become one line on the Stripe payment and the booking", a.q.get("metadata[source]") === "instagram · bio · oct (via l.instagram.com)" && (await passOf(a.pass)).from === "instagram · bio · oct (via l.instagram.com)" && a.q.get("metadata[landing]") === "/", [a.q.get("metadata[source]"), (await passOf(a.pass)).from]);
  const b = await buy({ click: "google ads", land: "/rules" }, "192.0.2.92"), c = await buy({ ref: "reddit.com" }, "192.0.2.93"), d = await buy(null, "192.0.2.94");
  const k = await buy({ click: "google ads", term: "Traitors game at home", land: "/traitors-at-home" }, "192.0.2.96");
  check("source: a Google Ads keyword (utm_term) rides along", (await passOf(k.pass)).from === "google ads · traitors game at home" && k.q.get("metadata[source]") === "google ads · traitors game at home", (await passOf(k.pass)).from);
  check("source: an ad click, a referring site, or direct", (await passOf(b.pass)).from === "google ads" && (await passOf(c.pass)).from === "reddit.com" && (await passOf(d.pass)).from === "direct");
  const e = await buy({ src: "<script>alert(1)</script>" + "x".repeat(200), land: "/<b>" }, "192.0.2.95");
  check("source: only plain characters, and short", /^[a-z0-9 ._\/()·-]+$/.test((await passOf(e.pass)).from) && (await passOf(e.pass)).from.length <= 60 && (await passOf(e.pass)).land === "/b", (await passOf(e.pass)));
}
// discount codes: made in the admin (Stripe promotion codes), typed on the buy page, and a free (100% off) checkout
{
  const A = (path, body) => W("/api/admin/" + path, body === undefined ? { headers: { Authorization: "Bearer adm" } } : { method: "POST", headers: { Authorization: "Bearer adm", "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(J);
  check("discounts: only for the admin", (await W("/api/admin/discounts", {})).status === 401 && (await W("/api/admin/discounts", { method: "POST", body: "{}" })).status === 401);
  const bad = [{ code: "x", percent: 50 }, { code: "GOOD1", percent: 101 }, { code: "GOOD1", percent: 0 }, { code: "GOOD1", percent: 12.5 }, { code: "GOOD1", percent: 50, max: -1 }, { code: "GOOD1", percent: 50, expires: "2020-01-01" }];
  check("discounts: a bad code, percentage, use count or last day is refused, and nothing is made", (await Promise.all(bad.map(b => A("discounts", b)))).every(([st]) => st === 400) && !promoCalls.length);
  const [fs, fj] = await A("discounts", { code: "testfree", percent: 100, max: 5 });
  const cc = promoCalls.find(x => x.path === "coupons"), pc = promoCalls.find(x => x.path === "promotion_codes");
  check("discounts: made as a 100%, once-only coupon and an upper-case promotion code, on the pinned API version", fs === 200 && fj.code === "TESTFREE" && fj.percent === 100 && fj.max === 5 && cc.q.get("percent_off") === "100" && cc.q.get("duration") === "once" && pc.q.get("promotion[type]") === "coupon" && pc.q.get("promotion[coupon]") === "co_1" && pc.q.get("code") === "TESTFREE" && pc.q.get("max_redemptions") === "5" && cc.version === "2025-09-30.clover" && pc.version === "2025-09-30.clover", [fs, fj]);
  const [ls, lj] = await A("discounts");
  check("discounts: listed with their percentage, what they're for and their uses", ls === 200 && lj.discounts.length === 1 && lj.discounts[0].percent === 100 && lj.discounts[0].plans === "one" && lj.discounts[0].used === 0 && lj.discounts[0].max === 5 && lj.discounts[0].active, lj);
  check("discounts: the same code twice is refused (Stripe says why)", (await A("discounts", { code: "TESTFREE", percent: 50 }))[0] === 502);
  const last = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [bs2, bj2] = await A("discounts", { code: "BOTH50", percent: 50, plans: "both", expires: last });
  check("discounts: a last day ends at the end of that day", bs2 === 200 && promos[1].expires_at === Date.parse(last + "T23:59:59Z") / 1000 && bj2.plans === "both", [bs2, bj2]);

  const n0 = made.length;
  const [us, uj] = await checkout({ terms: true, supply: true, discount: "nope99" }, base, "192.0.2.101");
  check("checkout: an unknown discount code is refused before anything is made", us === 400 && uj.field === "discount" && made.length === n0, [us, uj]);
  check("checkout: a one-party code can't discount the Regular", (await checkout({ terms: true, supply: true, plan: "sub", discount: "TESTFREE" }, base, "192.0.2.102"))[0] === 400 && made.length === n0);
  const [gs, gj] = await checkout({ terms: true, supply: true, discount: " testfree ", egg: true }, { ...base, STRIPE_EGG_PROMO: "promo_egg" }, "192.0.2.103");
  const gq = made[n0] && made[n0].q, gpass = gq && gq.get("metadata[pass]");
  check("checkout: a typed code goes to Stripe as the session's discount (not the seal's as well), and is noted", gs === 200 && gq.get("discounts[0][promotion_code]") === "promo_1" && !gq.has("discounts[1][promotion_code]") && gq.get("metadata[discount]") === "TESTFREE" && !gq.get("metadata[egg]"), [gs, gj, gq && [...gq]]);
  const [hs] = await checkout({ terms: true, supply: true, plan: "sub", discount: "both50" }, base, "192.0.2.104");
  check("checkout: a party-and-Regular code works on the Regular", hs === 200 && made[n0 + 1].q.get("discounts[0][promotion_code]") === "promo_2");
  // the free checkout comes back: Stripe needed no payment
  const gid = "cs_test_" + String(n0).padStart(12, "0");
  Object.assign(sessions[gid], { payment_status: "no_payment_required", amount_total: 0, payment_intent: null, metadata: { pass: gpass, discount: "TESTFREE" } });
  const [cs2, cj2] = await claim(gid);
  check("claim: a free (100% off) checkout gives its booking code, worth £0 to the ad conversion", cs2 === 200 && cj2.pass === gpass && cj2.value === 0 && !(await passOf(gpass)).pending, [cs2, cj2]);
  check("claim: the booking notes the discount code, and it works", (await passOf(gpass)).disc === "TESTFREE" && (await redeem(gpass))[0] === 200);
  const [ws] = await checkout({ terms: true, supply: true, discount: "TESTFREE" }, base, "192.0.2.105"), wq = made[made.length - 1].q, wpass = wq.get("metadata[pass]");
  const [hs2] = await hook({ type: "checkout.session.completed", id: "evt_free", data: { object: { id: "cs_free_webhook_1", payment_status: "no_payment_required", amount_total: 0, payment_intent: null, customer_details: { email: "free@example.com" }, metadata: { pass: wpass, discount: "TESTFREE" } } } });
  check("webhook: a free checkout activates its code too", ws === 200 && hs2 === 200 && !(await passOf(wpass)).pending && (await passOf(wpass)).disc === "TESTFREE");
  promos[0].times_redeemed = 5;
  const [xs, xj] = await checkout({ terms: true, supply: true, discount: "TESTFREE" }, base, "192.0.2.106");
  check("checkout: a used-up code says so", xs === 400 && /used up/.test(xj.error), [xs, xj]);
  promos[0].times_redeemed = 0; promos[0].expires_at = Math.floor(Date.now() / 1000) - 60;
  check("checkout: an ended code says so", /expired/.test((await checkout({ terms: true, supply: true, discount: "TESTFREE" }, base, "192.0.2.107"))[1].error));
  const [os, oj] = await A("discounts/off", { id: "promo_2" });
  check("discounts: switched off, it stops working", os === 200 && oj.active === false && !promos[1].active && (await checkout({ terms: true, supply: true, discount: "BOTH50" }, base, "192.0.2.108"))[0] === 400);
  refuseDiscount = true; promos[0].expires_at = null;
  const nr = made.length, [rs3, rj3] = await checkout({ terms: true, supply: true, discount: "TESTFREE" }, base, "192.0.2.109");
  check("checkout: if Stripe refuses a typed code, the buyer is told (not charged full price)", rs3 === 502 && made.length === nr, [rs3, rj3]);
  refuseDiscount = false;
}
// the owner's emails (ALERT_TO): one for each sale, refund, cancelled Regular and refused renewal, however many events
// carry it, and the morning summary
{
  const read = m => { const [head, body] = m.raw.split("\r\n\r\n"), h = Object.fromEntries(head.split("\r\n").map(l => [l.slice(0, l.indexOf(":")).toLowerCase(), l.slice(l.indexOf(":") + 2)]));
    return { to: h.to, subject: h.subject.replace(/^=\?UTF-8\?B\?(.*)\?=$/, (_, x) => Buffer.from(x, "base64").toString()), body: Buffer.from(body.replace(/\r\n/g, ""), "base64").toString() } };
  const mails = () => alerts.map(read), about = (start, code) => mails().filter(m => m.subject.startsWith(start) && (!code || (m.subject + m.body).includes(code)));
  check("owner: one sale email per booking, though the thank-you page and the webhook both claimed it", about("Sale: a Table", pass1).length === 1 && about("Sale: a Table", pass2).length === 1 && mails().every(m => m.to === "info@thebetrayal.co.uk"), mails().map(m => m.subject));
  check("…naming the code, the buyer and where they came from", about("Sale: a Table", pass1)[0].body.includes("Email: buyer@example.com") && /Came from: /.test(about("Sale: a Table", pass1)[0].body));
  check("…a Regular's says so, and a free (100% off) one says £0.00 and its code", about("Sale: a Regular", spass).length === 1 && about("Sale: a Table, £0.00").length === 2 && about("Sale: a Table, £0.00").every(m => m.body.includes("Discount code: TESTFREE")), mails().map(m => m.subject));
  const r0 = about("Refund").length;
  await hook({ type: "refund.updated", data: { object: { id: "re_5", object: "refund", status: "succeeded", amount: 1500, payment_intent: pi5, charge: "ch_5" } } });
  await hook({ type: "charge.refunded", data: { object: { id: "ch_2", object: "charge", amount: 1500, amount_refunded: 1500, refunded: true, payment_intent: sessions[id2].payment_intent } } });
  check("owner: one refund email per refund, though Stripe sends several events for it", about("Refund: £15.00", pass2).length === 1 && about("Refund: £15.00", pass5).length === 1 && about("Refund").length === r0, mails().filter(m => m.subject.startsWith("Refund")).map(m => m.subject));
  await hook({ type: "charge.refunded", data: { object: { id: "ch_2", object: "charge", amount: 1500, amount_refunded: 1500, refunded: true, payment_intent: sessions[id2].payment_intent } } });
  check("…and an unplayed Table's says its code is cancelled", /code is now cancelled/.test(about("Refund: £15.00", pass2)[0].body));
  const c0 = about("A Regular cancelled").length;
  await hook({ type: "customer.subscription.deleted", data: { object: { id: sessions[sid].subscription, customer: sessions[sid].customer, status: "canceled", metadata: { pass: spass } } } });
  check("owner: a Regular cancelling is one email", about("A Regular cancelled", spass).length === 1 && c0 === 1);
  check("owner: a Regular's refused renewal is emailed; a card refused at checkout isn't (it's in the admin)", about("A Regular’s payment failed", spass).length === 1 && !about("A Regular’s payment failed", pass6).length);
  const d = await (await reg.fetch(new Request("https://registry/digest", { method: "POST", body: "{}" }))).json();
  check("the morning summary counts the last 24 hours", /^The Betrayal, last 24 hours: \d+ sales \(£[\d.]+\), \d+ Tables?, \d+ errors?$/.test(d.subject) && /Sales: \d+ \(\d+ Tables, 1 new Regular\)/.test(d.body) && /Refunds: \d+, £/.test(d.body) && /Regulars who cancelled: /.test(d.body) && /Payments refused: /.test(d.body), d);
  const waits = [], n = alerts.length;
  // (the same morning job tells IndexNow of yesterday's pages: none here, in an empty sitemap)
  await worker.scheduled({ cron: "0 7 * * *" }, { ...base, MAIL, ALERT_TO: "info@thebetrayal.co.uk", ASSETS: { fetch: async () => new Response("") } }, { waitUntil: w => waits.push(w) }); await Promise.all(waits);
  check("…and the daily schedule emails it", alerts.length === n + 1 && read(alerts[n]).subject === d.subject && read(alerts[n]).body.startsWith(d.body), alerts.length - n);
}
// "Don't email me a feedback survey", ticked when booking: kept on the booking and in Stripe's metadata, and once it's
// paid its address is opted out of feedback emails
{
  const [ns, nj] = await checkout({ terms: true, supply: true, nomail: true }, base, "192.0.2.200"), nid = nj.url.split("/").pop(), nq = made[made.length - 1].q, npass = nq.get("metadata[pass]");
  check("opting out at checkout: noted on the booking and in Stripe's metadata", ns === 200 && (await passOf(npass)).noMail === true && nq.get("metadata[feedback_emails]") === "no", [ns, nj]);
  check("…and nothing is noted without the tick", !(await passOf(pass1)).noMail && !made[0].q.has("metadata[feedback_emails]"));
  sessions[nid].customer_details.email = "Quiet@Example.com"; sessions[nid].payment_status = "paid";
  const [cs2] = await claim(nid), svoff = await reg.storage.get("svoff:quiet@example.com");
  check("…once paid, its address is opted out", cs2 === 200 && !!svoff && svoff.at === "checkout" && (await passOf(npass)).noMail === true, svoff);
  check("…which a booking without the tick isn't", !(await reg.storage.get("svoff:buyer@example.com")));
}
// a checkout with no email on it: no hash
{
  const [, ej] = await checkout({ terms: true, supply: true }, base, "192.0.2.201"), eid = ej.url.split("/").pop();
  sessions[eid].customer_details = { email: null }; sessions[eid].payment_status = "paid";
  const [es, ec] = await claim(eid);
  check("a checkout with no email address claims with no hash", es === 200 && ec.emailHash === null && !!ec.pass, ec);
}
console.log(ok ? "RESULT: CLEAN" : "RESULT: FAILED"); process.exit(ok ? 0 : 1);
