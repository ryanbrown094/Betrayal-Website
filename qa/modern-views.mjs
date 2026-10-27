// What a phone and the TV are sent for each Trial's first question, from the rules engine: qa/modern.py renders them
// through the page's replay mode to check every Trial's screen. node qa/modern-views.mjs > views.json
import { newGame, join, act, tick, viewFor, TRIALS } from "../worker/src/modern.js";
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ctx = { rnd, dict: null };
const out = {};
for (const key of Object.keys(TRIALS)) {
  let now = 1e12; const s = newGame(now, rnd, { courses: false }), ids = [];
  for (const n of ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]) ids.push(join(s, n, now, rnd).id);
  act(s, ids[0], { a: "start" }, now, ctx); act(s, ids[0], { a: "tool", v: "deal" }, now, ctx); act(s, ids[0], { a: "tool", v: "begin" }, now, ctx); tick(s, now, ctx);
  if (key === "statue") s.players[7].alive = false;
  s.steps = [{ k: "trial", key }, { k: "reckon" }]; s.stepAt = 0; act(s, ids[0], { a: "next" }, now, ctx);
  act(s, ids[0], { a: "cont" }, now, ctx); now += 1000; tick(s, now, ctx); // the host starts it
  const it = s.trial.item, actor = it.actor || it.teller;
  if (it.k === "snap") now = it.start + 1000;
  const who = actor && actor !== ids[1] ? ids[1] : ids[2];
  out[key] = { player: { host: viewFor(s, who, now), tv: viewFor(s, null, now) }, actor: actor ? { host: viewFor(s, actor, now), tv: viewFor(s, null, now) } : null };
}
process.stdout.write(JSON.stringify(out));
