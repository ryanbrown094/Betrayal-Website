// Room codes and booking codes. No 0/O, 1/I/L: they're read off a TV and typed on a phone.
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const pick = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => ALPHA[x % ALPHA.length]).join(""); };
export const newRoom = () => pick(6);
export const newPass = () => "CNDL-" + pick(4) + "-" + pick(4);
export const isRoom = (c) => typeof c === "string" && new RegExp("^[" + ALPHA + "]{6}$").test(c);
// Booking codes are shown as OATH-XXXX-XXXX and stored under a CNDL-XXXX-XXXX key. A code typed with either prefix, or
// none, finds the same record (the random part has no O or L, so neither prefix can be part of it), so codes sent out
// with the CNDL- prefix still work.
export const normPass = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(CNDL|OATH)/, "");
export const isPass = (c) => new RegExp("^[" + ALPHA + "]{8}$").test(normPass(c));
export const passKey = (c) => "CNDL-" + normPass(c).slice(0, 4) + "-" + normPass(c).slice(4);
export const shownPass = (c) => c ? "OATH-" + normPass(c).slice(0, 4) + "-" + normPass(c).slice(4) : c;
