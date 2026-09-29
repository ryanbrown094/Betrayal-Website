// Room codes and party-pass codes. No 0/O, 1/I/L: they're read off a TV and typed on a phone.
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const pick = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => ALPHA[x % ALPHA.length]).join(""); };
export const newRoom = () => pick(6);
export const newPass = () => "CNDL-" + pick(4) + "-" + pick(4);
export const isRoom = (c) => typeof c === "string" && new RegExp("^[" + ALPHA + "]{6}$").test(c);
// Codes are shown as OATH-XXXX-XXXX (The Betrayal); the first ones went out as CNDL-XXXX-XXXX (Cloak & Candle). Either
// prefix, or none, finds the same code: the random part has no O or L, so neither prefix can be part of it.
// Stored records keep their CNDL- key, so passes sold before the change need no migration.
export const normPass = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(CNDL|OATH)/, "");
export const isPass = (c) => new RegExp("^[" + ALPHA + "]{8}$").test(normPass(c));
export const passKey = (c) => "CNDL-" + normPass(c).slice(0, 4) + "-" + normPass(c).slice(4);
export const shownPass = (c) => c ? "OATH-" + normPass(c).slice(0, 4) + "-" + normPass(c).slice(4) : c;
