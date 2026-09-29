// What the TV (and anyone without the host PIN) is allowed to see.
// Shared by the Worker (unauthenticated GET) and the page (TV applies it in every storage mode,
// so the TV renders identically whether or not a server did the redaction first).
export function publicView(s) {
  if (!s || typeof s !== "object") return s;
  const o = { ...s };
  for (const k of ["prev", "log", "hostPin", "stamps", "witness", "quest", "used", "usedQuiz", "usedWords", "usedQuests", "voteLog", "roundSnap"]) delete o[k];
  const over = s.phase === "final";
  if (!over) { delete o.cloakMisses; delete o.questTally; delete o.ghosts; delete o.prize; delete o.prizes; delete o.stats; }
  if (!over && s.prizes && s.prizes.length) o.tiers = s.prizes.map((x) => x.at); // the room knows a fuller Purse wins more, never what

  // A poisoned player sits at the table, alive to everyone else, until dawn reveals it.
  const hidden = s.phase === "morning" && s.morning && !s.morning.revealed && s.morning.kind === "murder" ? s.morning.victimId : null;
  o.players = (s.players || []).map((p) => {
    const q = { ...p };
    if (!p.revealed && !over) q.role = null;
    if (!over) { delete q.converted; delete q.refused; } // who was turned, or tried, is told at the very end
    if (p.shield !== "public") q.shield = null;
    if (hidden && p.id === hidden) q.alive = true;
    return q;
  });
  if (s.morning && !s.morning.revealed) o.morning = { revealed: false };
  // a blade won in secret stays secret until its holder reveals it at the table (or lays it down with the shield)
  if (s.champion && s.champion.secret && !s.champion.used) o.champion = null;

  if (s.mission) {
    const m = { ...s.mission };
    for (const k of ["secIds", "secMax", "room", "winId", "witnessId", "autoPicked", "best", "before", "mystery", "mysteryDone", "dagRound", "dagId", "dagDone", "warId", "wrongs", "pen"]) delete m[k];
    // answers stay off the wire until the room is shown them: only the current quiz question travels, its answer only
    // once the host has called it right or wrong; the sudden-death answer never; what changed and who wrote SHIELD
    // only once revealed
    if (Array.isArray(m.qs)) m.qs = m.qs.map((x, i) => i !== m.qi || !x ? null : m.showA ? x : { id: x.id, q: [x.q[0], ""] });
    if (Array.isArray(m.sd)) m.sd = [m.sd[0]];
    if (!m.showA) delete m.changed;
    if (!m.result) delete m.picks;
    o.mission = m;
  }
  // the room hears how many secret shields were claimed, never by whom; the Witness stays nameless too
  if (s.shieldCard) { const c = { ...s.shieldCard }; for (const k of ["secIds", "secNames", "witnessId", "witnessName", "metName", "wasted", "warName", "dagName"]) delete c[k]; o.shieldCard = c; }
  if (s.night) {
    const n = { ...s.night };
    delete n.questOpts;
    n.victims = (n.victims || []).map(() => "·"); // earlier victims of a many-victim night: how many, never who
    n.witnessId = n.witnessId ? "·" : null;
    n.witnessCloakId = n.witnessCloakId ? "·" : null;
    const step = n.step || 0;
    // tonight's kind of night is for the Cloaks' eyes, on its own line
    if (!n.confirmed) n.mode = "murder";
    // who the Cloaks chose stays off the wire until the line that shows it to them…
    if (!n.confirmed || typeof n.revealStep !== "number" || step < n.revealStep) { n.victimId = null; n.targetId = null; n.targetName = null; n.answer = null }
    // a shielded victim is never tapped, so their line on the TV stays dark: say so once the line is reached
    const vid = s.night.mode === "murder" ? s.night.victimId : s.night.targetId, vp = vid && (s.players || []).find((p) => p.id === vid);
    if (vp && vp.shield && n.confirmed && typeof n.revealStep === "number" && step >= n.revealStep) n.shielded = true;
    // …and goes again on the last line, when every blindfold is off (answer stays: it shapes the script's length)
    if (typeof n.endStep === "number" && step >= n.endStep) { n.victimId = null; n.targetId = null; n.targetName = null }
    // the side-quest, and the Cloak it may name, only on its own line
    if (n.quest && !(n.confirmed && step === n.questStep)) { n.quest = "…"; n.questTarget = null }
    o.night = n;
  }
  const mask = (votes, order, revealed) => {
    const shown = new Set((order || []).slice(0, revealed || 0));
    const out = {};
    for (const id of Object.keys(votes || {})) out[id] = shown.has(id) ? votes[id] : "·";
    return out;
  };
  if (s.endvote) {
    const v = { ...s.endvote, votes: mask(s.endvote.votes, s.endvote.order, s.endvote.revealed) };
    if (!(v.order && v.revealed >= v.order.length)) { v.result = null; v.count = null; }
    o.endvote = v;
  }
  if (s.final2) {
    const f = { ...s.final2, votes: mask(s.final2.votes, s.final2.order, s.final2.revealed) };
    if (!(f.order && f.revealed >= f.order.length)) { f.takes = null; f.ghostHits = null; }
    if (f.ghostRound) {
      const g = { ...f.ghostRound, votes: mask(f.ghostRound.votes, f.ghostRound.order, f.ghostRound.revealed) };
      if (!(g.order && g.revealed >= g.order.length)) g.takes = null;
      f.ghostRound = g;
    }
    o.final2 = f;
  }
  return o;
}
