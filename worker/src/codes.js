// Room codes and party-pass codes. No 0/O, 1/I/L: they're read off a TV and typed on a phone.
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const pick = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => ALPHA[x % ALPHA.length]).join(""); };
export const newRoom = () => pick(6);
export const newPass = () => "CNDL-" + pick(4) + "-" + pick(4);
export const isRoom = (c) => typeof c === "string" && new RegExp("^[" + ALPHA + "]{6}$").test(c);
export const normPass = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CNDL/, "");
export const isPass = (c) => new RegExp("^[" + ALPHA + "]{8}$").test(normPass(c));
export const passKey = (c) => "CNDL-" + normPass(c).slice(0, 4) + "-" + normPass(c).slice(4);
