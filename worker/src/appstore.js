// The App Store. The iPhone app (ryanbrown094/Betrayal-App) sells the Night Pass and the Host Pass (tiers.js) with Apple's
// in-app purchase; the app sends each purchase's signed transaction to /api/appstore/claim, and the Registry gives it a
// code from the app's pool, one per purchase (one per subscription for a Host Pass). Nothing the phone sends is trusted: the transaction is looked up with Apple's App
// Store Server API, which answers for the purchase, its product and app, and any refund.
// Settings: APPSTORE_BUNDLE_ID, APPSTORE_NIGHT_PRODUCT and APPSTORE_HOST_PRODUCT (vars, with defaults below),
// APPSTORE_ISSUER_ID and APPSTORE_KEY_ID (vars: App Store Connect → Users and Access → Integrations → In-App Purchase),
// APPSTORE_PRIVATE_KEY (secret: that key's .p8 file). APPSTORE_LOCAL=1 (development only, never production) also takes
// purchases made with Xcode's StoreKit testing, which Apple has never seen, on the phone's word.
const HOSTS = { Production: "https://api.storekit.itunes.apple.com", Sandbox: "https://api.storekit-sandbox.itunes.apple.com" };

export const bundleOf = (env) => env.APPSTORE_BUNDLE_ID || "uk.co.thebetrayal.app";
export const productsOf = (env) => ({ night: env.APPSTORE_NIGHT_PRODUCT || "uk.co.thebetrayal.app.night", host: env.APPSTORE_HOST_PRODUCT || "uk.co.thebetrayal.app.host" });
export const configured = (env) => !!(env.APPSTORE_ISSUER_ID && env.APPSTORE_KEY_ID && env.APPSTORE_PRIVATE_KEY);
export const local = (env) => env.APPSTORE_LOCAL === "1";

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4));
// a JWS's payload, read without checking its signature (used only to find which transaction to ask Apple about)
export function peek(jws) {
  try { const part = String(jws || "").split(".")[1]; return part ? JSON.parse(new TextDecoder().decode(Uint8Array.from(fromB64url(part), (c) => c.charCodeAt(0)))) : null; } catch { return null; }
}

// the App Store Server API's bearer token: ES256, signed with the In-App Purchase key, good for twenty minutes
let keyCache = null;
async function token(env) {
  if (!keyCache || keyCache.pem !== env.APPSTORE_PRIVATE_KEY) {
    const der = Uint8Array.from(fromB64url(String(env.APPSTORE_PRIVATE_KEY).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    keyCache = { pem: env.APPSTORE_PRIVATE_KEY, key: await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]) };
  }
  const now = Math.floor(Date.now() / 1000), enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: "ES256", kid: env.APPSTORE_KEY_ID, typ: "JWT" }), body = enc({ iss: env.APPSTORE_ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1", bid: bundleOf(env) });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyCache.key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}

// a GET from the App Store Server API: production first, then the sandbox (TestFlight and sandbox testers), as Apple
// advises when a transaction's environment isn't known. Production also says 401 to every call until the app's first
// release, so the sandbox is asked then too (TestFlight, and App Review's own purchases). Returns {status, json, env}.
async function apple(env, path) {
  const auth = "Bearer " + (await token(env));
  let last = null;
  for (const [name, host] of Object.entries(HOSTS)) {
    const r = await fetch(host + path, { headers: { Authorization: auth } });
    const json = await r.json().catch(() => ({}));
    last = { status: r.status, json, env: name };
    if (r.status !== 404 && r.status !== 401) return last;
  }
  return last;
}

// One purchase, as Apple knows it. `jws` is what the app's StoreKit gave it (Transaction.jwsRepresentation).
// Returns {txn} (the decoded transaction) or {error, status}.
export async function purchase(env, jws) {
  const claimed = peek(jws);
  if (!claimed || !/^\d{1,30}$/.test(String(claimed.transactionId || ""))) return { error: "That isn’t an App Store purchase.", status: 400 };
  let txn;
  if (claimed.environment === "Xcode") {
    if (!local(env)) return { error: "Purchases from Xcode’s StoreKit testing only work on a development server.", status: 403 };
    txn = claimed;
  } else {
    if (!configured(env)) return { error: "In-app purchases aren’t set up on the server yet.", status: 503 };
    let r;
    try { r = await apple(env, "/inApps/v1/transactions/" + claimed.transactionId); } catch (e) { return { error: "We couldn’t reach the App Store to check the purchase. Try again in a moment.", status: 502, why: String((e && e.message) || e) }; }
    if (r.status === 404) return { error: "The App Store doesn’t know that purchase.", status: 404, unknown: true };
    if (r.status !== 200 || !r.json.signedTransactionInfo) return { error: "We couldn’t check the purchase with the App Store. Try again in a moment.", status: 502, why: "App Store said " + r.status + ": " + JSON.stringify(r.json).slice(0, 200) };
    txn = peek(r.json.signedTransactionInfo); // fetched from Apple over TLS, so its word is Apple's
    if (!txn) return { error: "The App Store’s answer couldn’t be read.", status: 502 };
  }
  const P = productsOf(env);
  if (txn.bundleId !== bundleOf(env)) return { error: "That purchase was made in another app.", status: 400 };
  if (txn.productId !== P.night && txn.productId !== P.host) return { error: "That isn’t a Night Pass or a Host Pass.", status: 400 };
  return { txn: { ...txn, kind: txn.productId === P.host ? "host" : "night" } };
}

// Is a Host Pass's subscription paid up? Apple's statuses: 1 active, 2 expired, 3 billing retry, 4 grace period, 5 revoked.
// Returns {active, status, expires} or null when Apple can't be asked.
export async function subscription(env, orig, txn) {
  if (txn && txn.environment === "Xcode") return local(env) ? { active: !txn.revocationDate && (!txn.expiresDate || txn.expiresDate > Date.now()), status: "xcode", expires: txn.expiresDate || null } : null;
  if (!configured(env)) return null;
  let r;
  try { r = await apple(env, "/inApps/v1/subscriptions/" + orig); } catch { return null; }
  if (r.status !== 200) return null;
  const last = (r.json.data || []).flatMap((g) => g.lastTransactions || []).find((x) => String(x.originalTransactionId) === String(orig));
  if (!last) return { active: false, status: "unknown", expires: null };
  const info = peek(last.signedTransactionInfo) || {};
  return { active: last.status === 1 || last.status === 4, status: ({ 1: "active", 2: "expired", 3: "billing retry", 4: "grace period", 5: "revoked" })[last.status] || String(last.status), expires: info.expiresDate || null };
}

// what an App Store Server Notification (V2) is about: read without its signature, because it only ever prompts a fresh
// look at Apple's own records (purchase() and subscription()), never a change on its word
export function notice(body) {
  const n = peek(body && body.signedPayload);
  if (!n || !n.data) return null;
  const t = peek(n.data.signedTransactionInfo) || {};
  return { type: n.notificationType, subtype: n.subtype || null, uuid: n.notificationUUID || null, transactionId: t.transactionId || null, orig: t.originalTransactionId || null, productId: t.productId || null, jws: n.data.signedTransactionInfo || null, environment: n.data.environment || null };
}

export const priceOf = (txn) => (typeof txn.price === "number" && txn.currency ? (txn.price / 1000).toFixed(2) + " " + txn.currency : null);
