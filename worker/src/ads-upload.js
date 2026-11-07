// Google Ads conversions sent from the server (HANDOVER §6.4c). A paid booking whose buyer came from an advert and said
// yes to advertising cookies goes to the conversion action ADS_UPLOAD_ACTION ("Purchase (server)", Import from clicks)
// through Google's Data Manager API, so the sale counts whether or not the thank-you page's tag could: ad blockers,
// Safari's limits on cookies and a closed tab don't lose it. The Worker signs in as a Google Cloud service account
// (GOOGLE_DM_KEY, its JSON key, a Worker secret) that is a user of the Google Ads account.

// an ad click's id, as Google puts it on the landing page's address: gclid, or gbraid / wbraid on iPhones
const ID = /^[A-Za-z0-9._-]{10,300}$/;
export function clickOf(x) {
  if (!x || typeof x !== "object") return null;
  const c = {}; for (const k of ["gclid", "gbraid", "wbraid"]) if (typeof x[k] === "string" && ID.test(x[k])) c[k] = x[k];
  return Object.keys(c).length ? c : null;
}

export const uploadReady = (env) => !!(env.GOOGLE_DM_KEY && env.ADS_CUSTOMER_ID && env.ADS_UPLOAD_ACTION);

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let cached = null;
// an hour's access token for the service account: a JWT signed with its key, swapped at Google's token endpoint
export async function googleToken(env, now = Date.now()) {
  if (cached && cached.key === env.GOOGLE_DM_KEY && cached.until > now + 60000) return cached.token;
  let k; try { k = JSON.parse(env.GOOGLE_DM_KEY); } catch (e) { throw new Error("GOOGLE_DM_KEY isn't a service account's JSON key"); }
  if (!k.client_email || !k.private_key) throw new Error("GOOGLE_DM_KEY has no client_email or private_key");
  const der = Uint8Array.from(atob(k.private_key.replace(/-----[A-Z ]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const iat = Math.floor(now / 1000), part = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = part({ alg: "RS256", typ: "JWT" }) + "." + part({ iss: k.client_email, scope: "https://www.googleapis.com/auth/datamanager", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 });
  const jwt = unsigned + "." + b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google refused the service account's sign-in: " + (j.error_description || j.error || "HTTP " + r.status));
  cached = { key: env.GOOGLE_DM_KEY, token: j.access_token, until: now + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

// one request for every waiting sale: each with its click id, what was paid and the checkout session as the
// transaction id (Google keeps the first event with a given one, so a sale sent twice counts once)
export function ingestBody(env, jobs, validateOnly) {
  const cid = String(env.ADS_CUSTOMER_ID).replace(/\D/g, ""), login = String(env.ADS_LOGIN_ID || "").replace(/\D/g, "") || cid;
  return {
    destinations: [{ operatingAccount: { accountType: "GOOGLE_ADS", accountId: cid }, loginAccount: { accountType: "GOOGLE_ADS", accountId: login }, productDestinationId: String(env.ADS_UPLOAD_ACTION) }],
    encoding: "HEX",
    // only buyers who said yes are ever sent; the banner never grants personalised advertising
    consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" },
    events: jobs.map((j) => ({ adIdentifiers: j.click, ...(typeof j.value === "number" ? { conversionValue: j.value, currency: "GBP" } : {}), eventTimestamp: new Date(j.at).toISOString(), transactionId: j.txn, eventSource: "WEB" })),
    validateOnly: !!validateOnly,
  };
}

export async function ingest(env, jobs, validateOnly) {
  const r = await fetch("https://datamanager.googleapis.com/v1/events:ingest", { method: "POST",
    headers: { Authorization: "Bearer " + (await googleToken(env)), "Content-Type": "application/json" }, body: JSON.stringify(ingestBody(env, jobs, validateOnly)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google's Data Manager refused it: " + ((j.error && j.error.message) || "HTTP " + r.status));
  return { requestId: j.requestId || null, warnings: j.fieldWarnings || [] };
}
