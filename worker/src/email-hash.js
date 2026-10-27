// Google Ads enhanced conversions: a buyer's checkout email, normalised as Google asks (trimmed, lower case, and for
// gmail.com and googlemail.com without the full stops before the @) and hashed (SHA-256, lower-case hex). /api/claim
// gives it to the thank-you page, which passes it to Google only after a yes to advertising cookies (HANDOVER §6.4c).
// Nothing keeps it: it's worked out from the Stripe session each time.
export async function emailHash(email) {
  const e = String(email || "").trim().toLowerCase(), at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  let local = e.slice(0, at); const domain = e.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") local = local.replace(/\./g, "");
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(local + "@" + domain)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
