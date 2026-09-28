// The Stripe claim path, with Stripe and the Durable Objects stubbed: paid → one pass per session; unpaid → 402.
// node qa/claim.mjs
import worker, { Registry } from "../worker/src/index.js";
const store = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { m.set(k, v) }, list: async ({ prefix }) => new Map([...m].filter(([k]) => k.startsWith(prefix))) } };
const reg = new Registry({ storage: store() }, {});
const env = { STRIPE_SECRET_KEY: "sk_test_x", REGISTRY: { idFromName: () => 1, get: () => ({ fetch: (u, i) => reg.fetch(new Request(u, i)) }) } };
let paid = "paid";
globalThis.fetch = async u => new Response(JSON.stringify({ payment_status: paid, customer_details: { email: "a@b.c" } }), { status: String(u).includes("api.stripe.com") ? 200 : 404 });
const claim = async id => { const r = await worker.fetch(new Request("https://x/api/claim?session_id=" + id), env); return [r.status, await r.json()] };
const a = await claim("cs_test_1234567890"), b = await claim("cs_test_1234567890"), c = await claim("cs_test_abcdefghij");
paid = "unpaid"; const d = await claim("cs_test_zzzzzzzzzz");
const e = await claim("bogus");
const ok = a[0] === 200 && /^CNDL-/.test(a[1].pass) && b[1].pass === a[1].pass && c[1].pass !== a[1].pass && d[0] === 402 && e[0] === 400;
console.log(JSON.stringify({ a, b, c, d, e }));
console.log(ok ? "RESULT: CLEAN" : "RESULT: FAILED"); process.exit(ok ? 0 : 1);
