// Stripe, with Stripe's API and the Durable Objects stubbed: the checkout (consent, pending pass, the session's
// parameters), the claim from the thank-you page, the signed webhook (paid, expired, refunded) and what a pending,
// paid, expired or refunded pass may do. node qa/claim.mjs
import worker, { Registry } from "../worker/src/index.js";
import { passKey } from "../worker/src/codes.js";
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 400))); ok = ok && !!cond };
const store = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v) }, delete: async k => { for (const x of [].concat(k)) m.delete(x) },
  list: async ({ prefix, reverse, limit }) => { let e = [...m].filter(([k]) => k.startsWith(prefix)).sort((a, b) => a[0] < b[0] ? -1 : 1); if (reverse) e.reverse(); if (limit) e = e.slice(0, limit); return new Map(e) } } };
const closed = []; const GAME = { idFromName: n => n, get: id => ({ fetch: async (u) => { if (String(u).endsWith("/_close")) closed.push(id); return new Response("{}") } }) };
const reg = new Registry({ storage: store() }, { GAME });
const base = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_ID: "price_123", STRIPE_SUB_PRICE_ID: "price_sub", STRIPE_WEBHOOK_SECRET: "whsec_test", ADMIN_TOKEN: "adm", GAME, REGISTRY: { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(new Request(u, i)) }) } };

// the stubbed Stripe: sessions made, sessions read back
const made = [], sessions = {}, invoices = {}, pis = {}; let failCreate = false, refuseDiscount = false;
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
console.log(ok ? "RESULT: CLEAN" : "RESULT: FAILED"); process.exit(ok ? 0 : 1);
