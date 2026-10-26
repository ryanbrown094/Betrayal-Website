// The App Store, with Apple's App Store Server API and the Durable Objects stubbed: a purchase from the iPhone app becomes
// a code from the app's pool (once, however often it's claimed), a Host Pass's code follows its subscription, refunds
// cancel an unused Night Pass, and nothing the phone says is believed without asking Apple. node qa/appstore.mjs
import worker, { Registry } from "../worker/src/index.js";
import { passKey } from "../worker/src/codes.js";
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent('export async function resolve(s, c, next) { return s === "cloudflare:email" ? { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent("export class EmailMessage { constructor(from, to, raw) { Object.assign(this, { from, to, raw }) } }") } : next(s, c) }'));
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 400))); ok = ok && !!cond };
const store = () => { const m = new Map(); return { get: async (k) => m.get(k), put: async (k, v) => { if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v) }, delete: async (k) => { for (const x of [].concat(k)) m.delete(x) },
  list: async ({ prefix, reverse, limit }) => { let e = [...m].filter(([k]) => k.startsWith(prefix)).sort((a, b) => (a[0] < b[0] ? -1 : 1)); if (reverse) e.reverse(); if (limit) e = e.slice(0, limit); return new Map(e) } } };
const GAME = { idFromName: (n) => n, get: () => ({ fetch: async () => new Response("{}") }) };
const alerts = []; const MAIL = { send: async (m) => { alerts.push(m); return { messageId: "m" } } };
// an alert email as text: its subject, and its body (sent base64)
const mailText = (m) => { const raw = String(m.raw || ""), [head, body] = raw.split("\r\n\r\n"); return head + "\n" + Buffer.from(String(body || "").replace(/\s+/g, ""), "base64").toString("utf8"); };
const reg = new Registry({ storage: store() }, { GAME, MAIL, SITE_HOST: "thebetrayal.co.uk", ALERT_TO: "info@thebetrayal.co.uk" });

// an In-App Purchase key, as App Store Connect gives one (a .p8: PKCS #8, P-256)
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pem = "-----BEGIN PRIVATE KEY-----\n" + Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64").replace(/(.{64})/g, "$1\n") + "\n-----END PRIVATE KEY-----";
const env0 = { GAME, REGISTRY: { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(new Request(u, i)) }) }, APPSTORE_ISSUER_ID: "issuer-1", APPSTORE_KEY_ID: "KEY123", APPSTORE_PRIVATE_KEY: pem };
let env = env0;
reg.env = { ...reg.env, ...env0 };

// a JWS as Apple and StoreKit write them (the signature isn't read: only Apple's own answers are believed)
const b64u = (s) => Buffer.from(s).toString("base64url");
const jws = (o) => b64u(JSON.stringify({ alg: "ES256", x5c: [] })) + "." + b64u(JSON.stringify(o)) + ".sig";
const T = (id, o) => ({ transactionId: String(id), originalTransactionId: String((o && o.orig) || id), bundleId: "uk.co.thebetrayal.app", productId: "uk.co.thebetrayal.app.night", type: "Consumable", purchaseDate: Date.now(), environment: "Production", storefront: "GBR", price: 9990, currency: "GBP", ...(o || {}) });

// the stubbed App Store Server API: what it knows, and every call made to it
const apple = { Production: {}, Sandbox: {} }, subs = {}, calls = [];
let appleDown = false, unreleased = false;
globalThis.fetch = async (u, init) => {
  u = String(u);
  const m = u.match(/^https:\/\/api\.storekit(-sandbox)?\.itunes\.apple\.com\/inApps\/v1\/(transactions|subscriptions)\/(\d+)$/);
  if (!m) return new Response("{}", { status: 404 });
  const auth = (init && init.headers && init.headers.Authorization) || "", [h, p, s] = auth.replace(/^Bearer /, "").split(".");
  const verified = !!(h && p && s) && (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(h + "." + p)));
  calls.push({ host: m[1] ? "Sandbox" : "Production", what: m[2], id: m[3], verified, head: JSON.parse(Buffer.from(h || "", "base64url").toString() || "{}"), claims: JSON.parse(Buffer.from(p || "", "base64url").toString() || "{}") });
  if (appleDown) return new Response("{}", { status: 500 });
  if (unreleased && !m[1]) return new Response(JSON.stringify({ errorCode: 401 }), { status: 401 });
  if (!verified) return new Response("{}", { status: 401 });
  const where = apple[m[1] ? "Sandbox" : "Production"];
  if (m[2] === "transactions") return where[m[3]] ? new Response(JSON.stringify({ signedTransactionInfo: jws(where[m[3]]) })) : new Response(JSON.stringify({ errorCode: 4040010 }), { status: 404 });
  const st = subs[m[3]];
  if (!st || !where[m[3]]) return new Response(JSON.stringify({ errorCode: 4040010 }), { status: 404 });
  return new Response(JSON.stringify({ data: [{ subscriptionGroupIdentifier: "g1", lastTransactions: [{ originalTransactionId: m[3], status: st.status, signedTransactionInfo: jws({ ...where[m[3]], expiresDate: st.expires }) }] }] }));
};
const W = (path, init) => worker.fetch(new Request("https://thebetrayal.co.uk" + path, init), env);
const J = async (r) => [r.status, await r.json().catch(() => ({}))];
const claim = (o, ip) => W("/api/appstore/claim", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip || "203.0.113.1" }, body: JSON.stringify({ jws: typeof o === "string" ? o : jws(o) }) }).then(J);
const redeem = (pass, fresh) => W("/api/games", { method: "POST", body: JSON.stringify({ pass, fresh, app: true }) }).then(J);
const passOf = async (p) => reg.storage.get("pass:" + passKey(p));
const notify = (type, t) => W("/api/appstore/notify", { method: "POST", body: JSON.stringify({ signedPayload: jws({ notificationType: type, notificationUUID: "n-" + type, data: { environment: "Production", signedTransactionInfo: jws(t) } }) }) }).then(J);

// a Night Pass, bought in the app
apple.Production["1001"] = T(1001);
const [s1, c1] = await claim(T(1001));
check("a Night Pass bought in the app becomes a code", s1 === 200 && /^OATH-/.test(c1.pass) && c1.sub === false, [s1, c1]);
const call1 = calls[calls.length - 1];
check("the purchase is looked up with Apple, by its transaction", call1 && call1.what === "transactions" && call1.id === "1001" && call1.host === "Production");
check("the App Store Server API token is ES256, signed with the In-App Purchase key", call1 && call1.verified && call1.head.alg === "ES256" && call1.head.kid === "KEY123");
check("its claims: issuer, audience, bundle, twenty minutes", call1 && call1.claims.iss === "issuer-1" && call1.claims.aud === "appstoreconnect-v1" && call1.claims.bid === "uk.co.thebetrayal.app" && call1.claims.exp - call1.claims.iat === 1200);
const r1 = await passOf(c1.pass);
check("its record: from the App Store, paid, with Apple's references and price", r1 && r1.source === "appstore" && r1.paid && r1.apple.txn === "1001" && r1.apple.price === "9.99 GBP" && r1.kind === "night" && r1.pool === "app", r1);
check("the owner hears of the sale", alerts.some((m) => String(m.raw || "").includes("Sale (App Store): a Night Pass, 9.99 GBP")));
const [, c1b] = await claim(T(1001));
check("claimed again (a lost reply, a restore): the same code", c1b.pass === c1.pass);
const [rs1, rj1] = await redeem(c1.pass);
check("the code opens a Table", rs1 === 200 && /^[A-Z0-9]{6}$/.test(rj1.room), [rs1, rj1]);

// what the phone says isn't believed
const [s2] = await claim(T(1001, { productId: "uk.co.thebetrayal.app.night", transactionId: "1001", price: 1 }));
check("the phone's own copy of a known purchase changes nothing (Apple's record is used)", s2 === 200 && (await passOf(c1.pass)).apple.price === "9.99 GBP");
const [s3, c3] = await claim(T(9999));
check("a purchase Apple doesn't know is refused", s3 === 404 && /doesn’t know/.test(c3.error), [s3, c3]);
check("…after asking the production App Store, then the sandbox", calls.slice(-2).map((c) => c.host).join() === "Production,Sandbox");
apple.Production["1002"] = T(1002, { bundleId: "com.someone.else" });
check("a purchase from another app is refused", (await claim(T(1002)))[0] === 400);
apple.Production["1003"] = T(1003, { productId: "uk.co.thebetrayal.app.gems" });
check("a product that isn't a Night Pass or a Host Pass is refused", (await claim(T(1003)))[0] === 400);
check("something that isn't a transaction is refused", (await claim("not.a.jws"))[0] === 400 && (await claim({ transactionId: "../../x" }))[0] === 400);
apple.Production["1004"] = T(1004, { revocationDate: Date.now() });
check("a refunded purchase gets no code", (await claim(T(1004)))[0] === 410);

// TestFlight and sandbox testers: found in the sandbox
apple.Sandbox["2001"] = T(2001, { environment: "Sandbox" });
const [s4, c4] = await claim(T(2001, { environment: "Sandbox" }));
check("a sandbox purchase (TestFlight) is found in the sandbox", s4 === 200 && (await passOf(c4.pass)).apple.env === "Sandbox", [s4, c4]);
check("…and the owner is told it was a test", alerts.some((m) => mailText(m).includes("A test purchase (Sandbox)")));
// before the app's first release Apple's production API says 401 to everything: the sandbox is still asked
unreleased = true;
apple.Sandbox["2002"] = T(2002, { environment: "Sandbox" });
const [s4b, c4b] = await claim(T(2002, { environment: "Sandbox" }));
check("before the app's first release (production says 401), a sandbox purchase is still found", s4b === 200 && /^OATH-/.test(c4b.pass) && calls.slice(-2).map((c) => c.host).join() === "Production,Sandbox", [s4b, c4b]);
unreleased = false;

// Xcode's StoreKit testing: only on a development server
const x = T(3001, { environment: "Xcode" });
check("an Xcode test purchase is refused by a real server", (await claim(x))[0] === 403);
env = { ...env0, APPSTORE_LOCAL: "1" }; reg.env = { ...reg.env, APPSTORE_LOCAL: "1" };
const [s5, c5] = await claim(x);
check("…and taken by a development one (APPSTORE_LOCAL=1), without asking Apple", s5 === 200 && /^OATH-/.test(c5.pass) && !calls.some((c) => c.id === "3001"), [s5, c5]);
env = env0; reg.env = { ...reg.env, APPSTORE_LOCAL: undefined };

// not set up: a clear answer, not a crash
env = { GAME, REGISTRY: env0.REGISTRY };
const [s6, c6] = await claim(T(1001));
check("with no In-App Purchase key on the server, purchases wait (503)", s6 === 503 && /aren’t set up/.test(c6.error), [s6, c6]);
env = env0;
appleDown = true;
const [s7] = await claim(T(1005));
check("with the App Store unreachable, the phone is told to try again (502)", s7 === 502);
appleDown = false;
// a key Apple doesn't know: refused in both places, never mistaken for an unknown purchase
const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
env = { ...env0, APPSTORE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n" + Buffer.from(await crypto.subtle.exportKey("pkcs8", other.privateKey)).toString("base64") + "\n-----END PRIVATE KEY-----" };
const [s7b, c7b] = await claim(T(1001));
check("with a wrong key, the phone is told to try again (502)", s7b === 502 && /couldn’t check/.test(c7b.error) && calls.slice(-2).map((c) => c.host).join() === "Production,Sandbox", [s7b, c7b]);
env = env0;

// a Host Pass, bought in the app
apple.Production["5001"] = T(5001, { productId: "uk.co.thebetrayal.app.host", type: "Auto-Renewable Subscription", expiresDate: Date.now() + 30 * 86400000, price: 19990 });
subs["5001"] = { status: 1, expires: Date.now() + 30 * 86400000 };
const [s8, c8] = await claim(T(5001, { productId: "uk.co.thebetrayal.app.host" }));
check("a Host Pass bought in the app becomes a Host Pass's code", s8 === 200 && c8.sub === true && (await passOf(c8.pass)).kind === "host" && (await passOf(c8.pass)).subActive === true, [s8, c8]);
apple.Production["5002"] = T(5002, { orig: 5001, productId: "uk.co.thebetrayal.app.host", type: "Auto-Renewable Subscription", transactionReason: "RENEWAL" });
const [, c8b] = await claim(T(5002, { orig: 5001 }));
check("a renewal (a new transaction, the same subscription) gives back the same code", c8b.pass === c8.pass, c8b);
const [rs8, rj8] = await redeem(c8.pass);
check("the Host Pass's code opens a Table", rs8 === 200 && rj8.sub === true && rj8.room, [rs8, rj8]);
subs["5001"] = { status: 2, expires: Date.now() - 1000 };
await reg.storage.put("pass:" + passKey(c8.pass), { ...(await passOf(c8.pass)), subChecked: 0 });
const [rs9, rj9] = await redeem(c8.pass, true);
check("lapsed with Apple: the code can't open a new Table (402), and says how to renew", rs9 === 402 && /Renew it in the app/.test(rj9.error), [rs9, rj9]);
subs["5001"] = { status: 4, expires: Date.now() + 86400000 };
const [rs10] = await redeem(c8.pass, true);
check("in Apple's grace period it works again, checked at once", rs10 === 200);
subs["5001"] = { status: 3, expires: Date.now() - 1000 };
const [, nj] = await notify("DID_FAIL_TO_RENEW", T(5001, { productId: "uk.co.thebetrayal.app.host" }));
const after = await passOf(c8.pass);
check("Apple's notice of a failed renewal updates the code from Apple's record", nj.received && after.subActive === false && after.subStatus === "billing retry", after);
check("…and the owner hears it lapsed", alerts.some((m) => String(m.raw || "").includes("A Host Pass (App Store) lapsed")));

// refunds
apple.Production["1006"] = T(1006);
const [, c11] = await claim(T(1006));
apple.Production["1006"] = T(1006, { revocationDate: Date.now() });
await notify("REFUND", T(1006));
check("Apple's refund notice cancels an unused Night Pass", (await passOf(c11.pass)).revoked && (await redeem(c11.pass))[0] === 410);
check("…and claiming it again says it was refunded", (await claim(T(1006)))[0] === 410);
await notify("REFUND", T(1001));
check("a refund notice that Apple's record doesn't bear out changes nothing", !(await passOf(c1.pass)).revoked);
apple.Production["1001"] = T(1001, { revocationDate: Date.now() });
await notify("REFUND", T(1001));
check("a refunded Night Pass that was already used keeps its room", !(await passOf(c1.pass)).revoked && (await passOf(c1.pass)).refunded);
check("a forged notice is never acted on without Apple (bad body: 400)", (await W("/api/appstore/notify", { method: "POST", body: "{}" }).then(J))[0] === 400);

// guessing
const flood = []; for (let i = 0; i < 22; i++) flood.push((await claim(T(80000 + i), "198.51.100.9"))[0]);
check("guessing purchases is limited like guessing codes (429 after twenty)", flood.slice(0, 20).every((s) => s === 404) && flood.slice(20).every((s) => s === 429), flood);

console.log(ok ? "\nall passed" : "\nFAILURES");
process.exit(ok ? 0 : 1);
