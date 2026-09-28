/* ===================== TV ===================== */
// Patch the live DOM towards new markup. Untouched nodes keep their running animations;
// only nodes that are genuinely new play their entrance. data-k forces a swap when identity changes.
function morph(from, to) {
  if (from.nodeType === 1) {
    for (const a of [...from.attributes]) if (!to.hasAttribute(a.name) && !(a.name === "open" && from.nodeName === "DETAILS")) from.removeAttribute(a.name); // a fold the host opened stays open
    for (const a of [...to.attributes]) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
  const tc = [...to.childNodes];
  for (let i = 0; i < tc.length; i++) {
    const t = tc[i], f = from.childNodes[i];
    if (!f) { from.appendChild(t); continue }
    if (f.nodeType !== t.nodeType || f.nodeName !== t.nodeName || (f.nodeType === 1 && f.getAttribute("data-k") !== t.getAttribute("data-k"))) { from.replaceChild(t, f); continue }
    if (f.nodeType !== 1) { if (f.nodeValue !== t.nodeValue) f.nodeValue = t.nodeValue; continue }
    morph(f, t);
  }
  while (from.childNodes.length > tc.length) from.removeChild(from.lastChild);
}
function patch(el, html, replace) {
  if (replace) { el.innerHTML = html; return }
  const t = document.createElement(el.nodeName); t.innerHTML = html;
  for (const a of [...el.attributes]) t.setAttribute(a.name, a.value);
  morph(el, t);
}

const PHASECARDS = {
  day: s => ["Round " + s.round, isFinal(s) ? "The final round · chalkboards ready" : "A new day · chalkboards ready", "sun"],
  mission: s => s.mission && s.mission.key === "dilemma" ? ["The Dilemma", "Round " + s.round, "scales"] : ["Mission " + Math.max(1, s.roundMissions || 1), "Round " + s.round + " · earn the pot", "scroll"],
  mingle: s => s.mingle && s.mingle.kind === "dinner" ? ["Dinner", "Eat, drink · watch who sits where", "chalice"] : ["Mingle", "Up from the table · talk, accuse, lie", "chalice"],
  table: s => s.table && s.table.second ? ["The Second Vote", "The house demands another", "table"] : ["The Reckoning", "Take your seats · chalk a name", "table"],
  reveal: () => ["Exile", "The table has spoken", "blade"],
  night: () => ["Night Falls", "The candles burn low", "moon"],
  morning: () => ["Dawn", "Count the candles", "sun"],
  final: () => ["The End", "Every cloak comes off", "crown"],
  final2: () => ["The Final", "The last chairs", "hourglass"],
  shield: s => s.shieldCard && (s.shieldCard.mode === "witness" || s.shieldCard.mode === "none") ? ["Mission Complete", "", "scroll"] : ["The Shield", "", "shield"],
  night0: () => ["The Cloak Is Given", "Blindfolds ready", "moon", 5600], // held long enough to read, then a slow fade into the night
  endvote: () => ["End or Exile?", "In secret, on the phone", "scales"]
};
const RULES_TV = h => [
  ["Cloaks", killOf() === "murder" ? "hide among you. Each night they murder " + (state && aliveOf(state).length >= 12 ? "two or more Candles, who leave" : "one Candle, who leaves") + " the table in silence while you sit blindfolded." : "hide among you. Each night they poison " + (state && aliveOf(state).length >= 12 ? "two or more Candles — who announce it at dawn" + (ghostsOn() ? " and become Ghosts." : ", then leave the table.") : "one Candle — who announces it at dawn" + (ghostsOn() ? " and becomes a Ghost." : ", then leaves the table."))],
  ["The Candles", "must find them. Each Reckoning, chalk a name — whoever gets the most votes is exiled and reveals their role." + (state && aliveOf(state).length > 16 ? " While more than sixteen sit at the table, every Reckoning exiles two." : "")],
  ["Missions", "grow the pot. Some hide a shield: a shield holder cannot be poisoned that night."],
  ["Blindfolds", "on when " + h + " says. If you feel a tap, do what the screen says. Never speak."],
  ["The end:", "a Cloak still standing takes the prize. Exile them all and the Candles win it. What it is stays secret until it’s won."],
  ghostsOn() ? ["The dead", "— their candles out — become Ghosts. They watch, judge and perform; never vote. Blindfolds on when yours are."] : ["The dead", "— their candles out — leave the table. No voting, no whispering, no hints from the side."],
  ["Between missions", "you mingle. The Cloaks may be carrying a secret task. Watch who is trying too hard."],
  ["At the end", "with four left, you vote END or EXILE. Only a unanimous END stops the game."]
];

const digits = str => `<span class="digits">${String(str).split("").map(c => `<span class="${c === ":" ? "c" : ""}">${c}</span>`).join("")}</span>`;
function ring(end, dur, cls) {
  const r = Math.max(0, (end - now()) / 1000), k = dur ? Math.max(0, Math.min(1, r * 1000 / dur)) : 0;
  return `<div class="ring ${cls || ""} ${r <= 15 ? "low" : ""}" data-end="${end}" data-dur="${dur || 0}"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="45"/><circle class="dash" cx="50" cy="50" r="40.5"/><circle class="fg" cx="50" cy="50" r="45" style="stroke-dashoffset:${(283 * (1 - k)).toFixed(1)}"/></svg><div class="time">${digits(mmss(r))}</div></div>`;
}
const typed = name => `<span class="typed">${[...name].map((c, i) => `<span style="--i:${i}">${c === " " ? "&nbsp;" : esc(c)}</span>`).join("")}</span>`;
const hsize = (t, a, b) => t.length > b ? "sm" : t.length > a ? "md" : "";

/* ---------- the candle rail ---------- */
const deadAt = {}; let railBooted = false;
function railHTML(s, o) {
  o = o || {}; const A = seated(s), t = performance.now();
  // room per seat in px; when a name would not fit at full size, plaques alternate between two rows and may use the neighbour's width
  const vh = innerHeight / 100, seatW = Math.min(14 * vh, (innerWidth - 34 * vh) / Math.max(1, A.length)), base = s.tvText === "standard" ? 1.95 : 2.3;
  const need = n => 2.4 * vh + n.length * 0.8 * base * vh; // plaque width at full size: small caps plus letter-spacing
  const crowded = A.some(p => need(p.name) > seatW * 1.15);
  // a staggered plaque may borrow its neighbours' width, but only up to the edge of their seals
  const room = crowded ? Math.min(seatW * 1.9, 2 * seatW - 6 * vh) : seatW * 1.15;
  const seats = A.map((p, i) => {
    const lit = p.alive || o.hot === p.id;
    if (!lit && !(p.id in deadAt)) deadAt[p.id] = railBooted ? t : -1e9;
    if (lit) delete deadAt[p.id];
    const st = o.unlit ? "unlit" : o.lighting ? "lighting" : lit ? "lit" : "out";
    const h = (6.4 + ((i * 37) % 11) / 11 * 2.6).toFixed(2), fd = (-((i * 53) % 29) / 10).toFixed(1);
    let badge = "";
    if (lit && o.scores) { const n = o.scores[p.id] || 0; badge = `<div class="badge ${n ? "" : "zero"}" data-k="b${n}">${n}</div>` }
    if (lit && o.tally && o.tally[p.id]) badge = `<div class="badge chalk" data-k="t${o.tally[p.id]}">${o.tally[p.id]}</div>`;
    const smoke = !lit && !o.unlit && t - deadAt[p.id] < 4000 ? '<div class="smoke"></div>' : "";
    return `<div class="seat ${st} ${o.hot === p.id ? "hot" : ""} ${o.only && !o.only.includes(p.id) ? "dim" : ""}" data-k="${p.id}" style="--h:${h}vh;--fd:${fd}s;--ld:${(3.4 + i * 0.9).toFixed(1)}s">${badge}<div class="candle"><div class="halo"></div><div class="wax"></div><div class="cup"></div><div class="flame">${ART.flame()}</div>${smoke}</div>${p.alive && p.shield === "public" ? `<div class="shieldmark">${ART.icon("shield")}</div>` : ""}${p.alive && p.id === championOf(s) ? `<div class="shieldmark warmark">${ART.icon("blade")}</div>` : ""}${ART.seal(p, lit ? "" : "cracked")}<div class="plaque" style="--len:${Math.max(6, p.name.length)};--fit:${room / Math.max(1, need(p.name)) >= 1 ? base : Math.max(1.25, base * room / need(p.name)).toFixed(2)}vh">${esc(p.name)}</div></div>`;
  }).join("");
  return `<div class="apron"></div><div class="row ${crowded ? "stagger" : ""}">${seats}</div>`;
}

/* ---------- the Reckoning, from above ---------- */
function roundTable(s, o) {
  o = o || {}; const A = seated(s), n = A.length, votes = o.votes || {}, max = Math.max(0, ...A.map(p => votes[p.id] || 0));
  const leaders = A.filter(p => p.alive && max > 0 && (votes[p.id] || 0) === max);
  const places = A.map((p, i) => {
    const a = i / n * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), sn = Math.sin(a), R = 37, v = p.alive ? (votes[p.id] || 0) : 0;
    const pos = (r, extraY) => `left:${(c * r).toFixed(2)}vh;top:${(sn * r + (extraY || 0)).toFixed(2)}vh`;
    // names above the seal on the top arc (clear of the vote counts), shrunk to the gap between neighbours on the
    // top and bottom arcs, and allowed a second line at the sides, where a long name would reach the text column
    const side = Math.abs(sn) < 0.5, gap = 2 * Math.PI * R * 0.84 / Math.max(1, n), fs = side ? 2 : Math.max(1.35, Math.min(2, (gap * 1.1 - 2) / (p.name.length * 0.75)));
    return `<div class="place ${p.alive ? "" : "out"} ${(o.immune || []).includes(p.id) ? "safe" : ""} ${o.only && p.alive && !o.only.includes(p.id) ? "faded" : ""} ${leaders.length === 1 && leaders[0].id === p.id ? "lead" : ""}" data-k="${p.id}" style="--fd:${(-((i * 53) % 29) / 10).toFixed(1)}s">
<div class="pool" style="${pos(R * 0.47)}"></div><div class="chairseal" style="${pos(R * 0.84)}">${ART.seal(p, p.alive ? "" : "cracked")}</div>${(o.immune || []).includes(p.id) ? `<div class="rtmark safe ${sn < -0.5 ? "low" : ""}" style="${pos(R * 0.84)}">${ART.icon("shield")}</div>` : p.alive && p.id === o.champion ? `<div class="rtmark war ${sn < -0.5 ? "low" : ""}" style="${pos(R * 0.84)}">${ART.icon("blade")}</div>` : ""}
<div class="nm ${side ? "side" : ""}" style="${pos(R * 0.84, sn < -0.5 ? -5.7 : 5.7)};transform:translate(${(-50 + c * 36).toFixed(0)}%,-50%);font-size:${fs.toFixed(2)}vh">${esc(p.name)}</div>${v ? `<div class="votes" data-k="v${v}" style="${pos(R * 0.61)}">${v}</div>` : ""}</div>`;
  }).join("");
  return `<div class="rt"><div class="disc"></div><div class="inlay">${ART.inlay()}</div><div class="mid">${o.centre || `<div class="crest">${ART.crest()}</div>`}</div>${places}</div>`;
}

const vcard = (p, shown, good, fresh, words) => `<div class="vcard ${shown ? (good ? "good" : "bad") : ""}" data-k="${p.id}">${ART.seal(p)}<div class="vn">${esc(p.name)}</div>${shown ? `<div class="vseal ${fresh ? "stamped" : ""}">${ART.bigSeal(good ? "good" : "t", good ? words.gi : "blade")}</div>` : '<div class="vseal blank"></div>'}<div class="vword">${shown ? (good ? words.g : words.b) : "?"}</div></div>`;
const vcards = (ps, revealed, votes, goodVal, words) => `<div class="votecards ${ps.length <= 4 ? "few" : ps.length > 8 ? "many" : ps.length > 5 ? "mid" : ""}">${ps.map((p, i) => vcard(p, i < revealed, votes[p.id] === goodVal, i === revealed - 1, words)).join("")}</div>`;

function nightSlide(script, step) {
  const e = norm(script[Math.min(step, script.length - 1)]), len = (e.tv || "").length;
  return `<div class="nightwho fx-fade" data-k="w${step}">${esc(e.who)}</div><div class="nighttext ${len <= 50 ? "short" : len <= 110 ? "mid" : len > 200 ? "long" : ""} fx-rise" data-k="t${step}${len}">${esc(e.tv)}</div>`;
}
function ghostVerdictTV(s) {
  const gs = ghostScores(s); if (!gs.length) return "";
  const w = gs.filter(x => x.hits);
  return `<div class="sub small">The Ghosts’ verdict — ${gs.map(x => esc(x.p.name) + " named " + esc(x.pickName) + (x.hits ? " ✓" : " ✗")).join(" · ")}${w.length ? `<br><b>${esc(w.map(x => x.p.name).join(" and "))}</b> saw a Cloak from beyond the table.` : ""}</div>`;
}

// "round 2 · mission 1": which mission of the round this is
const missionLabel = s => "round " + s.round + " · " + (s.mission && s.mission.key === "dilemma" ? "the dilemma" : "mission " + Math.max(1, s.roundMissions || 1));
function missionTV(s, v) {
  const m = s.mission, label = missionLabel(s), head = `<div class="eyebrow">${label}</div><h1 class="gold md">${esc(m.title)}</h1>`;
  v.rail = { scores: m.scores };
  const n = m.qn, tot = m.total;
  // the brief while the host sets the prize; the prize on its own card once they confirm it
  if (m.stage === "rules") { v.key += "rules"; v.rail = {}; v.html = `<div class="eyebrow fx-fade">${label}</div><h1 class="gold fx-title">${esc(m.title)}</h1><div class="rule"></div><div class="rules fx-rise" style="--d:.5s">${m.key === "custom" ? "Listen to " + esc(hostOf(s)) + " for the rules." : esc(m.rules)}</div>`; return }
  if (m.stage === "prize") {
    const pl = prizeOf_(m, isFinal(s), s), none = m.win === "none" && m.dag === "none" && !m.witnessOffer;
    v.key += "prize" + m.win + (m.secN || 0) + m.dag + (m.witnessOffer ? "s" : ""); v.rail = {}; v.sfx = none ? "drum" : "gold";
    v.html = `<div class="eyebrow fx-fade">${label} · the prize</div><h1 class="gold md fx-title">${esc(m.title)}</h1><div class="prizes">${pl.items.map((it, i) => `<div class="prz fx-rise" style="--d:${(0.4 + i * 0.8).toFixed(1)}s"><div class="przico">${ART.icon(it.ico)}${it.head.startsWith("The Champion") ? ART.icon("shield") : ""}</div><div><b>${esc(it.head)}</b><span>${esc(it.text)}</span></div></div>`).join("")}</div><div class="sub fx-rise" style="--d:${(0.6 + pl.items.length * 0.8).toFixed(1)}s">${esc(pl.pot)}</div>`; return;
  }
  if (m.stage === "done") {
    if (m.sd && !m.sdOver) { v.key += "sd" + m.sd[0]; v.sfx = "drum"; v.html = head + `<div class="eyebrow steel">sudden death</div><div class="sub">${esc((m.sdNames || []).join(" v "))}. First to shout — locked in.</div><div class="q fx-rise">${esc(m.sd[0])}</div>`; return }
    const r = aliveOf(s).slice().sort((a, b) => (m.scores[b.id] || 0) - (m.scores[a.id] || 0)).filter(p => (m.scores[p.id] || 0) > 0).slice(0, 3);
    v.key += "done"; v.sfx = "gold";
    v.html = `<div class="eyebrow fx-fade">${esc(m.title)}</div><h1 class="gold fx-title">Mission complete</h1>${r.length ? `<div class="leader fx-rise" style="--d:.6s">${r.map(p => `<div class="who">${ART.seal(p)}<span>${esc(p.name)}</span><b>${m.scores[p.id]}</b></div>`).join("")}</div>` : ""}`; return;
  }
  if (m.key === "quiz") {
    const q = m.qs[m.qi].q, sh = m.shouter ? P2(s, m.shouter) : null;
    v.key += "q" + n + (m.showA ? "a" : "") + (m.shouter || ""); v.sfx = m.showA ? (m.lastRight ? "gold" : "drum") : null; v.quiet = true;
    const per = m.per || 10, part = Math.floor((n - 1) / per), inPart = (n - 1) % per + 1;
    v.html = head + `<div class="quizpart num" data-k="p${part}"><span class="pt">Part ${["one", "two", "three"][part] || part + 1} · ${["Easy", "Medium", "Brutal"][part] || ""}</span><span class="pq">Question ${inPart} of ${per}</span></div><div class="q fx-rise" data-k="q${n}">${esc(q[0])}</div>${m.showA ? `<div class="a gold fx-flip${String(q[1]).length > 26 ? " long" : ""}" data-k="a${n}">${esc(q[1])}</div>` : ""}${m.showA ? (sh ? `<div class="sub ${m.lastRight ? "" : "wrong"}">${esc(sh.name)} — ${m.lastRight ? "correct" : "wrong"}</div>` : `<div class="sub small">Nobody.</div>`) : sh ? `<div class="sub"><b>${esc(sh.name)}</b> locked in.</div>` : `<div class="sub small">First to shout is locked in.</div>`}`; return;
  }
  if (m.key === "estimate") { const q = itemOf(m); v.key += "e" + n + (m.showA ? "a" : ""); v.sfx = m.showA ? "drum" : null; v.quiet = true; v.html = head + `<div class="sub small num">Round ${n} of ${tot}</div><div class="q fx-rise" data-k="q${n}">${esc(q[0])}</div>${m.showA ? `<div class="a gold fx-flip num">${Number(q[1]).toLocaleString("en-GB")}</div>` : `<div class="sub small">Chalk a number. Boards face down.</div>`}`; return }
  if (m.key === "likely") {
    const w = m.showA ? topOf(s, m.tally) : null; v.key += "l" + n + (m.showA ? "a" : ""); v.sfx = m.showA ? "drum" : null; v.quiet = true; v.rail = { scores: m.scores, tally: m.tally };
    v.html = head + `<div class="sub small num">${n} of ${tot}</div><div class="q fx-rise" data-k="q${n}">${esc(itemOf(m))}</div>${m.showA ? `<div class="a gold fx-flip">${w ? esc(w.name) : "No verdict"}</div>` : `<div class="sub small">Chalk a name. Boards face down.</div>`}`; return;
  }
  if (m.key === "memory") {
    const set = itemOf(m), open = m.timerEnd && now() < m.timerEnd, grid = `<div class="memgrid">${set.map((w, i) => `<div style="--i:${i}">${esc(w)}</div>`).join("")}</div>`;
    v.key += open ? "wall" : m.showA ? "ans" : "write"; v.norail = open || m.showA; v.until = open ? m.timerEnd : null;
    v.html = open ? `<div class="eyebrow">memory wall · <span class="memtime num" data-end="${m.timerEnd}">${mmss((m.timerEnd - now()) / 1000)}</span></div>` + grid : m.showA ? `<div class="eyebrow">memory wall · the answers</div>` + grid : head + `<h1 class="fx-rise">Chalk everything you remember</h1>`; return;
  }
  if (m.key === "dilemma") {
    v.key += "d" + (m.result ? "r" : ""); v.sfx = m.result ? (m.result.kind === "many" ? "sting" : m.result.kind === "one" ? "gold" : "drum") : null; v.rail = {};
    v.html = head + (m.result ? `<h1 class="${m.result.kind === "one" ? "gold" : m.result.kind === "none" ? "" : "blood"} fx-slam">${m.result.kind === "one" ? esc(m.result.name) + " takes the shield" : m.result.kind === "none" ? "Nobody dared" : m.result.count + " reached for the shield"}</h1><div class="sub">${m.result.kind === "one" ? "The pot grows by " + moneyOf(s, m.stake) + "." : m.result.kind === "none" ? "The pot grows by " + moneyOf(s, m.stake * 2) + "." : "No shield. The pot loses " + moneyOf(s, m.stake) + "."}</div>` : `<div class="rules">${esc(m.rules)}</div><div class="tag">Stake · ${moneyOf(s, m.stake)}</div><div class="sub small">Chalk your word. Board face down. Wait for ${esc(hostOf(s))}.</div>`); return;
  }
  if (m.key === "charades" || m.key === "hum" || m.key === "draw") {
    const a = m.actorId ? P2(s, m.actorId) : null, word = itemOf(m), hum = m.key === "hum", drw = m.key === "draw";
    if (!a) { v.key += "pick"; v.html = head + `<div class="rules">${esc(m.rules)}</div>`; return }
    if (m.showA && !m.timerEnd && !m.wordOn) { v.key += "blind" + m.qi + a.id; v.sfx = "chime"; v.night = true; v.html = `<div class="nightwho">Everyone except ${esc(a.name)}</div><div class="nighttext short">Blindfolds on.</div><div class="rule"></div><div class="sub">${esc(a.name)}, keep yours off. The ${drw ? "picture" : hum ? "song" : "scene"} appears when every blindfold is on.</div>`; return }
    if (m.showA && !m.timerEnd) { v.key += "word" + m.qi; v.night = true; v.html = `<div class="nightwho">Everyone except ${esc(a.name)}</div><div class="nighttext short">Blindfolds on.</div><div class="rule"></div><div class="sub">${esc(a.name)}, ${drw ? "draw" : "your " + (hum ? "song" : "scene") + " is"}</div><div class="a gold fx-rise">${esc(word)}</div><div class="sub small">Don’t know it? Ask ${esc(hostOf(s))} to skip.</div>`; return }
    if (hum && m.bfOff && !m.timerEnd) { v.key += "bf" + m.qi + a.id; v.html = head + `<div class="sub">Blindfolds off. <b>${esc(a.name)}</b> hums when ${esc(hostOf(s))} starts the clock.</div><div class="sub small">Listen. Shout the song.</div>`; return }
    if (m.timerEnd) { v.key += "go" + m.qi; v.html = head + `<div class="sub">${hum ? "" : "Blindfolds off. "}<b>${esc(a.name)}</b> is ${hum ? "humming" : drw ? "drawing" : "acting"}. Guess!</div>${ring(m.timerEnd, m.timer * 1000, hum ? "sm hide5" : "sm")}`; return }
    v.key += "ready" + m.qi + a.id; v.html = head + `<div class="sub">Up next</div><h1 class="fx-rise">${esc(a.name)}</h1><div class="sub small">Everyone else: blindfolds ready.</div>`; return;
  }
  if (m.key === "hilo") {
    // the round's winner stays up until the host moves on
    if (m.won) { v.key += "hw" + m.won.n; v.sfx = "gold"; v.burst = m.won.name ? "gold" : null; v.rail = { scores: m.scores }; v.html = head + `<div class="sub small num">Round ${m.won.n} of ${tot}</div>${m.won.name ? `<h1 class="gold fx-slam ${hsize(m.won.name, 12, 18)}">${esc(m.won.name)}</h1><div class="sub fx-rise" style="--d:.6s">wins round ${numWord(m.won.n)}. Last one standing.</div>` : `<h1 class="fx-title">Round ${numWord(m.won.n)} is over</h1>`}${m.qn < tot ? `<div class="sub small fx-rise" style="--d:1.2s">Everyone stands for round ${numWord(m.won.n + 1)}.</div>` : ""}`; return }
    const q = itemOf(m), hi = q[1] > m.ref, st = (m.standing || []).length;
    v.key += "h" + n + "_" + m.qi + (m.showA ? "a" : ""); v.sfx = m.showA ? "drum" : null; v.quiet = true; v.rail = { scores: m.scores, only: m.standing };
    v.html = head + `<div class="sub small num">Round ${n} of ${tot} · ${plural(st, "player")} standing</div><div class="q fx-rise" data-k="q${m.qi}">${esc(q[0])}</div><div class="hilo fx-rise" data-k="r${m.qi}" style="--d:.4s"><span>higher or lower than</span><b class="num">${Number(m.ref).toLocaleString("en-GB")}</b></div>${m.showA ? `<div class="a gold fx-flip num" data-k="a${m.qi}">${Number(q[1]).toLocaleString("en-GB")} <em class="hl">${hi ? "higher" : "lower"}</em></div>` : `<div class="sub small">Thumbs up for higher, down for lower — on three.</div>`}`; return;
  }
  if (m.key === "truths") {
    const t = m.tellerId ? P2(s, m.tellerId) : null, last = m.lastResult;
    if (!t) { v.key += "tp" + n; v.html = head + `<div class="rules">${esc(m.rules)}</div>${last ? `<div class="sub fx-rise">${esc(last.name)} fooled ${last.fooled ? (last.fooled === 1 ? "one of you" : numWord(last.fooled) + " of you") : "nobody"}.</div>` : ""}`; return }
    v.key += "t" + n + t.id + m.tstage + (m.timerEnd ? "c" : ""); v.sfx = m.tstage === "tell" ? "chime" : null;
    v.html = head + `<div class="sub small num">Turn ${n} of ${tot}</div><h1 class="fx-rise ${hsize(t.name, 12, 18)}">${esc(t.name)}</h1><div class="sub">${m.tstage === "tell" ? "Three statements. Two true, one a lie. Chalk 1, 2 or 3." : "Two truths and a lie. Thinking…"}</div>${m.tstage === "think" && m.timerEnd ? ring(m.timerEnd, m.timerDur || m.timer * 1000, "sm") : ""}`; return;
  }
  if (m.key === "change") {
    const cells = g => `<div class="chgrid">${g.map((x, i) => `<div class="${m.showA && (m.changed || []).includes(i) ? "hit" : ""}" style="--i:${i}">${ART.icon(x)}</div>`).join("")}</div>`;
    // no blindfolds: ten seconds of countdown, then the changed grid appears by itself
    const holding = m.cstage === "blind" && m.holdEnd && now() < m.holdEnd;
    v.key += "c" + n + (holding ? "hold" : m.cstage === "blind" ? "look" : m.cstage || "") + (m.showA ? "a" : ""); v.quiet = true;
    if (!m.cstage) { v.html = head + `<div class="sub small num">Round ${n} of ${tot}</div><div class="rules">${esc(m.rules)}</div>`; return }
    if (holding) { v.norail = true; v.until = m.holdEnd; v.html = `<div class="eyebrow">what changed? · round ${n} of ${tot}</div><h1 class="md fx-title">Something is changing…</h1>${ring(m.holdEnd, 10000, "sm")}<div class="sub small">Eyes back on the screen when the ring runs out.</div>`; return }
    v.norail = true; v.sfx = m.showA ? "gold" : m.cstage === "look" || m.cstage === "blind" ? "drum" : null;
    v.html = `<div class="eyebrow">what changed? · round ${n} of ${tot}${m.cstage === "study" ? "" : " · first to shout"}</div>` + cells(m.grid || []) + (m.cstage === "study" && m.timerEnd ? ring(m.timerEnd, m.timerDur || m.timer * 1000, "sm") : m.showA ? `<div class="sub fx-rise">${m.spotter ? "<b>" + esc(m.spotter) + "</b> spotted it." : "Nobody spotted it."}</div>` : `<div class="sub small">What changed?</div>`); return;
  }
  if (m.key === "snap") {
    if (!m.seqStart) { v.key += "snapwait"; v.html = head + `<div class="rules">${esc(m.rules)}</div><div class="snaplist">${SNAPSYM.map(x => ART.icon(x)).join("")}</div>`; return }
    const i = Math.floor((now() - m.seqStart) / 5000);
    if (i >= m.seq.length) { v.key += "snapdone"; v.sfx = "chime"; v.html = head + `<h1 class="fx-rise">Done</h1>`; return }
    v.key += "snap" + m.seqStart; v.snap = { seq: m.seq, start: m.seqStart };
    v.html = `<div class="eyebrow">snap · <span class="snapcount">${i < 0 ? "ready" : (i + 1) + " / " + m.seq.length}</span></div><div class="bigico" id="snapico">${i < 0 ? "" : ART.icon(SNAPSYM[m.seq[i]])}</div>`; return;
  }
  if (m.key === "countdown") {
    v.key += "c" + n + (m.timerEnd ? "t" : ""); v.quiet = true;
    v.html = head + `<div class="sub small num">Round ${n} of ${tot}</div><div class="letters" data-k="L${n}">${(m.letters || "").split("").map((c, i) => `<span style="--i:${i}">${c}</span>`).join("")}</div>${m.timerEnd ? ring(m.timerEnd, m.timerDur || 30000, "sm") : `<div class="sub small">Chalkboards ready.</div>`}`; return;
  }
  v.key += m.timerEnd ? "t" : "w";
  v.html = head + (m.timerEnd ? ring(m.timerEnd, m.timerDur || m.timer * 1000) : `<div class="rules">${esc(m.rules)}</div>`);
}

function tvView(s) {
  const v = { key: s.phase, html: "", night: false, sfx: null, sfxDelay: 0, scene: "day", rail: {}, norail: false, flash: null, burst: null, waves: null, quiet: false, snap: null, until: null };
  const host = esc(hostOf(s)), A = aliveOf(s);
  switch (s.phase) {
    case "lobby":
      v.scene = "lobby"; v.rail = { unlit: true };
      if (s.tvRules) { v.key += "r"; v.norail = true; v.html = `<div class="eyebrow fx-fade">how tonight works</div><h1 class="gold md fx-title">The Rules</h1><div class="rulelist">${RULES_TV(hostOf(s)).map((r, i) => `<div style="--i:${i}"><b>${esc(r[0])}</b> ${esc(r[1])}</div>`).join("")}</div>`; break }
      v.html = `<div class="eyebrow fx-fade">welcome to the table</div><h1 class="wordmark gold fx-title ${titleOf(s).length > 16 ? "long" : ""}">${esc(titleOf(s))}</h1><div class="rule"></div><div class="sub fx-rise" style="--d:.8s">${seated(s).length} guests. One table. Trust no one.</div>${AC ? "" : `<div class="hint">${host}: tap “Enable sound” and “Full screen” (or press F), top left, before you begin.</div>`}`; break;
    case "intro": {
      const n = seated(s).length; v.key += "i"; v.scene = "lobby"; v.rail = { lighting: true }; v.intro = n;
      v.html = `<div class="crestbig crest">${ART.crest(true)}</div><div class="eyebrow fx-fade" style="--d:1.6s">a dinner with</div><h1 class="wordmark gold fx-title ${titleOf(s).length > 16 ? "long" : ""}" style="--d:2s">${esc(titleOf(s))}</h1><div class="sub fx-fade" style="--d:${(3.8 + n * 0.9).toFixed(1)}s">${n} of you. Some of you are lying.</div>`; break;
    }
    case "night0": { const sc = NIGHT0_(hostOf(s)), st = s.night ? s.night.step : 0; v.night = true; v.scene = "night"; v.key += st; v.sfx = st === sc.length - 1 ? "chime" : null; v.html = nightSlide(sc, st); break }
    case "day":
      v.html = `<div class="eyebrow fx-fade">round ${s.round}${isFinal(s) ? " — the final" : ""}</div><h1 class="fx-title">${isFinal(s) ? "The last day at the house" : "A new day at the house"}</h1><div class="rule"></div><div class="sub fx-rise" style="--d:.7s">${(s.roundMissions || 0) ? "Another mission. Nobody sits down yet." : "Chalkboards ready. The pot only grows if you work together."}</div>`; break;
    case "mission": v.scene = "mission"; missionTV(s, v); if (v.night) v.scene = "night"; break;
    case "shield": {
      const c = s.shieldCard, g = ghostsOf(s).length > 0, cer = c.mode === "witness" ? WITNESSNOW_(hostOf(s), g, c) : CEREMONY_(hostOf(s), g, c);
      if ((c.mode === "secret" || c.mode === "witness") && c.step < cer.length) { v.night = true; v.scene = "night"; v.key += c.step + c.mode; v.sfx = c.step === cer.length - 1 ? "chime" : null; v.html = nightSlide(cer, c.step); break }
      const none = c.mode === "none" && !c.championName, pub = c.pubNames || [], sec = c.secCount || 0, wn = c.championName;
      v.key += "card"; v.sfx = none ? "drum" : "gold"; v.burst = none ? null : "gold";
      const pot = `<div class="sub fx-rise" style="--d:.9s">${c.points >= 0 ? moneyOf(s, c.points) + " added to" : moneyOf(s, -c.points) + " taken from"} the pot.${c.pen ? " Wrong shouts cost it " + moneyOf(s, c.pen) + "." : ""}</div>`;
      // what was won in secret: said, never by whom
      const hidden = [c.secWar ? ["blade", "The Champion was chosen in secret — shield and blade"] : null, sec ? ["shield", sec > 1 ? sec + " shields were claimed in secret" : "A shield was claimed in secret"] : null, c.secDag ? ["blade", "The blade was claimed in secret"] : null].filter(Boolean);
      const tags = hidden.map((h, i) => `<div class="tag fx-rise" style="--d:${(1.4 + i * 0.5).toFixed(1)}s">${ART.icon(h[0])} ${esc(h[1])}</div>`).join("");
      const dagTag = wn && !c.champion && pub.length ? `<div class="tag fx-rise" style="--d:1.2s">${ART.icon("blade")} ${esc(wn)} holds the blade — their vote counts twice tonight</div>` : "";
      v.html = `<div class="eyebrow fx-fade">${c.mode === "witness" ? "the special prize" : none ? "mission complete" : c.champion ? "the champion" : pub.length ? "the shield" : wn ? "the blade" : "the prizes"}</div>` + (c.mode === "witness" ? `<h1 class="gold fx-title">The special prize has been claimed</h1><div class="sub">Somebody at this table knows more than they did a minute ago.</div>`
        : none ? `<h1 class="md fx-title">The mission is over</h1><div class="sub">${c.earlier ? "A shield from earlier still stands." : "Back to the table."}</div>`
          : c.champion ? `<h1 class="gold fx-title ${hsize(wn, 14, 24)}">${esc(wn)}</h1><div class="sub">is tonight’s Champion. A shield — the Cloaks cannot poison them tonight. And the blade — at the Reckoning their vote counts twice. Only a Champion may lay both down to be safe from the exile.</div>`
            : pub.length ? `<h1 class="gold fx-title ${hsize(pub.join(" & "), 14, 24)}">${esc(pub.join(" & "))}</h1><div class="sub">${pub.length > 1 ? "hold shields and cannot be poisoned tonight." : "holds the shield and cannot be poisoned tonight."}</div>${dagTag}`
              : wn ? `<h1 class="gold fx-title ${hsize(wn, 14, 24)}">${esc(wn)}</h1><div class="sub">holds the blade. At tonight’s Reckoning, their vote counts twice.</div>${c.earlier ? `<div class="sub small">A shield from earlier still stands.</div>` : ""}`
                : `<h1 class="gold fx-title">${hidden.length > 1 ? "Claimed in secret" : c.secWar ? "The Champion walks among you" : c.secDag ? "The blade has been claimed" : sec > 1 ? "Shields have been claimed" : "The shield has been claimed"}</h1><div class="sub">${hidden.length > 1 || sec > 1 ? "The holders know. Nobody else does." : c.secDag && !c.secWar ? "It counts automatically: when every board is in, the table sees where it fell — never whose it was." : "Its holder knows. Nobody else does."}</div>`) + (c.mode === "witness" || none ? "" : c.champion || pub.length || wn ? tags : hidden.length > 1 ? tags : "") + pot; break;
    }
    case "mingle": {
      const g = s.mingle, din = g.kind === "dinner"; v.scene = "mingle"; v.key += g.kind + (g.end ? "t" : "");
      v.html = `<div class="eyebrow fx-fade">${din ? "dinner is served" : "between missions"}</div><h1 class="gold md fx-title">${din ? "Dinner" : "Mingle"}</h1><div class="sub">${din ? "Eat. Drink. Watch who sits next to whom. Back when the ring runs out." : "Up from the table. Talk. Accuse. Lie. Back when the ring runs out."}</div>${g.end ? ring(g.end, g.dur, "sm") : `<div class="sub small">Waiting for ${host}…</div>`}`; break;
    }
    case "table": {
      const t = s.table, talk = t.stage === "talk", rv = !talk && t.revote ? t.revote.map(id => P2(s, id)).filter(Boolean) : [], w = championOf(s), wp = w && P2(s, w), imm = (t.immune || []).map(id => P2(s, id)).filter(Boolean);
      const lv = t.last && P2(s, t.last), lt = lv && t.ballots && t.ballots[t.last], ltp = lt && lt !== "blank" && P2(s, lt), tieNow = t.stage === "exile" ? tiedOf(s) : [];
      v.scene = "table"; v.norail = true; v.key += talk ? "talk" + (t.talkEnd ? "t" : "") : (t.stage || "") + (t.stage === "exile" && t.blade ? "d" : ""); v.votes = Object.values(t.votes || {}).reduce((a, b) => a + b, 0);
      const armed = wp && wp.shield === "public", dgTo = t.stage === "exile" && t.blade && P2(s, t.blade.to), dgBy = dgTo && t.blade.by && P2(s, t.blade.by);
      if (dgTo) v.sfx = "sting";
      const dagBallot = dgTo ? `<div class="ballot blade fx-rise" data-k="df${dgTo.id}">${ART.icon("blade")}<span>the blade fell on</span><b>${esc(dgTo.name)}</b></div>` : "";
      const tags = (wp ? `<div class="tag rtag" data-k="w${w}">${ART.icon("blade")} ${esc(wp.name)} ${armed ? "is the Champion — shield and blade" : "holds the blade"} — the blade votes too, once every board is in</div>` : "") + (imm.length ? `<div class="tag rtag safe" data-k="i${imm.length}">${ART.icon("shield")} ${esc(imm.map(p => p.name).join(" & "))} laid down shield and blade — safe from this vote</div>` : "");
      const ballot = !talk && lv ? `<div class="ballot fx-rise" data-k="b${t.last}${lt}"><span>${esc(lv.name)} votes for</span><b>${ltp ? esc(ltp.name) : "nobody"}</b></div>` : "";
      v.html = `<div class="rtwrap"><div class="rtcopy"><div class="eyebrow fx-fade">the reckoning${isFinal(s) ? " — the final exile" : t.second ? " — the second vote" : t.exiles === 2 ? " — the first of two votes" : ""}</div><h1 class="fx-title" data-k="${talk ? "a" : tieNow.length > 1 ? "t" + rv.length : rv.length ? "r" : "b"}">${talk ? "Talk." : tieNow.length > 1 ? (rv.length ? "Still tied." : "A tie.") : rv.length ? "A tie. Vote again." : "Who do you exile?"}</h1><div class="rule" style="margin:0"></div>${tieNow.length > 1 ? dagBallot + `<div class="sub">Between ${esc(andList(tieNow.map(id => P2(s, id).name)))}.</div>` : dagBallot || ballot || `<div class="sub">${talk ? "Accuse. Defend. Deflect. When the talking stops, the chalk comes out." : rv.length ? "Only " + esc(rv.map(p => p.name).join(" or ")) + ". Boards up, one at a time." : "Chalk a name. Boards up, one at a time. Then explain your vote to their face."}</div>`}${tags}</div>${roundTable(s, { votes: talk ? null : t.showDots ? t.votes : null, immune: t.immune, champion: w, only: rv.length ? t.revote : null, centre: talk && t.talkEnd ? ring(t.talkEnd, t.talkDur, "sm") : null })}</div>`; break;
    }
    case "reveal": {
      const p = P2(s, s.table.exiled), st = s.table.step; v.scene = "table"; v.key += st + p.id;
      const stab = s.table.bladeKill ? `<div class="stab" aria-hidden="true"><div class="knife">${ART.icon("blade")}</div><div class="drop"></div><div class="splat"></div></div>` : "";
      if (st === 0) { v.sfx = s.table.bladeKill ? "sting" : "reveal"; v.sfxDelay = s.table.bladeKill ? 700 : 0; v.key += s.table.bladeKill ? "stab" : ""; v.rail = { hot: p.id }; v.html = `<div class="eyebrow fx-fade ${s.table.roll ? "rollwait" : ""}">${s.table.bladeKill ? "the blade decided it" : ({ unanimous: "the table has decided — unanimously", close: "the table has decided — by a single vote", tie: "the table was split — and still it decided" })[s.table.margin] || "the table has decided"}</div>${stab}<h1 class="blood xl ${s.table.roll ? "rolling" : ""}">${typed(p.name)}</h1><div class="sub fx-fade" style="--d:${(p.name.length * 0.095 + 0.6).toFixed(2)}s">${s.table.roll && !isFinal(s) ? "Candle… or Cloak?" : "You are exiled from the house."}</div>` }
      else if (st === 2) { v.sfx = "chime"; v.key += "g"; v.norail = s.players.length > 16; v.html = `<div class="eyebrow fx-fade">a word about the dead</div><h1 class="gold md fx-title">The Ghosts</h1><div class="sub fx-rise" style="--d:.5s">${esc(p.name)} is the first.</div><div class="rulelist ghostrules">${[["They stay.", "At the party, beside the table, watching everything."], ["They judge.", "Each Ghost names one Cloak, once. It counts at the end."], ["They perform", "in missions, when " + esc(hostOf(s)) + " calls on them."], ["They never", "vote, whisper or warn the living."], ["Blindfolds:", "when the living put theirs on, so do the Ghosts. Every time."]].map((r, i) => `<div style="--i:${i}"><b>${r[0]}</b> ${r[1]}</div>`).join("")}</div>` }
      else if (isFinal(s) || !p.revealed) { v.sfx = "drum"; v.html = `<div class="eyebrow fx-fade">exiled</div><h1 class="blood xl fx-title">${esc(p.name)}</h1><div class="sub">Leaves the house. Candle or Cloak? You won't know until the end.</div>` }
      else { const tr = p.role === "cloak"; v.sfx = tr ? "sting" : "gold"; v.sfxDelay = tr ? 700 : 1600; v.fxDelay = 1600; v.flash = tr ? "redlong" : "goldsoft"; v.burst = tr ? "red" : "gold"; v.norail = false; v.html = `<div class="eyebrow fx-fade">${esc(p.name)} was a…</div><div class="rolecard ${tr ? "rc-t" : "rc-f"}">${tr ? "" : `<div class="rays"></div>`}<div class="inner"><div class="face back"><div class="crest">${ART.crest()}</div></div><div class="face front ${tr ? "t" : "f"}"><div class="bigseal">${ART.bigSeal(tr ? "t" : "f", tr ? "blade" : "shield")}${tr ? `<svg class="crack" viewBox="0 0 100 100"><path d="M52 4 L47 22 L56 34 L44 50 L55 63 L46 78 L51 96"/><path d="M47 22 L33 28 M56 34 L70 30 M44 50 L28 56 M55 63 L72 70"/></svg>` : ""}</div><div class="word ${tr ? "" : "gold"}">${tr ? "Cloak" : "Candle"}</div><div class="who">${esc(p.name)}</div></div></div></div>`; v.tight = true }
      break;
    }
    case "night": {
      const n = s.night; v.night = true; v.scene = "night"; if (!n) break;
      if (!n.confirmed) { v.key += "hold"; v.html = `<div class="nightwho fx-fade">night ${s.round}</div><div class="nighttext short fx-title">Night falls on the house.</div><div class="sub">Blindfolds ready. Wait for ${host}.</div>`; break }
      const sc = nightScript(n, s), st = Math.min(n.step, sc.length - 1), ln = norm(sc[st] || {});
      v.key += st + n.mode + (n.answer || "") + (n.quest ? "q" : ""); v.sfx = /Dawn is coming/.test(ln.tv || "") ? "chime" : null; v.burst = v.sfx ? "gold" : null; v.html = nightSlide(sc, st); break;
    }
    case "morning": {
      const m = s.morning; v.scene = "morning"; v.key += m.revealed ? "r" : ""; // last words add their ring in place
      if (!m.revealed) { v.sfx = "dawn"; v.burst = "dust"; v.html = `<div class="eyebrow fx-fade">dawn</div><h1 class="gold fx-title">Did everyone sleep well?</h1><div class="rule"></div><div class="sub fx-rise" style="--d:1s">${killOf(s) === "murder" ? "Look around the table. Is every chair still full?" : "Every chair is full. But is everyone alive?"}</div>`; break }
      if (m.kind === "murder") { v.sfx = m.lastEnd ? null : "poison"; v.burst = m.lastEnd ? null : "red"; v.html = `<div class="eyebrow">dawn</div><h1 class="xl bleed" data-k="nm">${esc(m.name)}</h1><div class="sub fx-fade" style="--d:1.6s">${m.many ? "were" : "was"} poisoned in the night.${m.lastEnd ? " Last words." : m.many ? " Their candles have gone out." : " Their candle has gone out."}</div>${m.lastEnd ? ring(m.lastEnd, 30000 * (m.victimIds || [1]).length, "sm") : ""}` }
      else { v.sfx = "gold"; v.html = `<div class="eyebrow fx-fade">dawn</div><h1 class="${m.kind === "shield" ? "gold" : ""} fx-title">Nobody was poisoned</h1><div class="sub fx-rise" style="--d:.9s">${m.kind === "shield" ? "The shield held." : "A quiet night. Or was it?"}</div>` }
      break;
    }
    case "endvote": {
      const e = s.endvote, cast = Object.keys(e.votes || {}).length; v.scene = "table"; v.key += e.order ? "r" + e.revealed : "";
      if (!e.order) { v.quiet = true; v.html = `<div class="eyebrow fx-fade">the final</div><h1 class="gold fx-title">End or Exile?</h1><div class="sub">In secret, on ${host}’s phone. END if every Cloak is gone. EXILE if one still sits among you. Only a unanimous END stops the game.</div><div class="tag num">${cast} of ${A.length} have voted</div>`; break }
      const ord = e.order.map(id => P2(s, id)).filter(Boolean), last = e.order[e.revealed - 1], done = e.revealed >= e.order.length;
      v.sfx = done ? (e.result === "end" ? "gold" : "sting") : last ? (e.votes[last] === "end" ? "seal" : "drum") : null; v.norail = ord.length > 6; v.quiet = true;
      v.html = `<div class="eyebrow">the final</div><h1 class="md ${done ? (e.result === "end" ? "gold" : "blood") : ""}" data-k="h${done}">${done ? (e.result === "end" ? "Unanimous. The game ends." : e.count + " chose to exile.") : "End or Exile?"}</h1>${vcards(ord, e.revealed, e.votes, "end", { g: "END", b: "EXILE", gi: "crown" })}`; break;
    }
    case "final2": {
      const f = s.final2, tids = f.cloakIds || [], ts = tids.map(id => P2(s, id)).filter(Boolean), nT = ts.length, g = f.ghostRound;
      v.scene = "final"; v.key += (f.showRoles ? "s" : "") + (f.order ? "r" + f.revealed : "") + (g ? "g" + (g.revealed || 0) + (g.order ? "o" : "") : "");
      const shown = f.shown || [], surv = A, allShown = surv.every(p => shown.includes(p.id)), lastId = shown[shown.length - 1], lastP = lastId && P2(s, lastId);
      v.key += "c" + shown.length; v.norail = surv.length > 6; // a big table needs the whole screen for its seals, as the end vote does
      // seals turned one at a time by the host; the winner line appears with the last seal
      const rollId = f.roll && !shown.includes(f.roll.id) ? f.roll.id : null;
      const rcard = p => { const r = shown.includes(p.id), tr = r && p.role === "cloak", fresh = p.id === lastId; return `<div class="vcard ${r ? (tr ? "bad" : "good") : ""} ${p.id === rollId ? "rolling" : ""}" data-k="${p.id}">${ART.seal(p)}<div class="vn">${esc(p.name)}</div>${r ? `<div class="vseal ${fresh ? "stamped" : ""}">${ART.bigSeal(tr ? "t" : "f", tr ? "blade" : "shield")}</div>` : '<div class="vseal blank"></div>'}<div class="vword">${r ? (tr ? "CLOAK" : "CANDLE") : "?"}</div></div>` };
      const grid = `<div class="votecards ${surv.length <= 4 ? "few" : surv.length > 8 ? "many" : surv.length > 5 ? "mid" : ""}">${surv.map(rcard).join("")}</div>`;
      if (!allShown) {
        v.sfx = lastP ? (lastP.role === "cloak" ? "sting" : "gold") : null; v.flash = lastP && lastP.role === "cloak" ? "red" : null; v.burst = lastP ? (lastP.role === "cloak" ? "red" : "gold") : null; v.quiet = true;
        v.html = `<div class="eyebrow fx-fade">the final ${surv.length === 2 ? "two" : surv.length}</div><h1 class="md fx-title" data-k="h${shown.length}">${shown.length ? esc(lastP.name) + " was " + (lastP.role === "cloak" ? "a Cloak" : "a Candle") : "Nothing left to chalk"}</h1>${grid}`; break;
      }
      if (nT >= 2 && !f.order) { v.sfx = "sting"; v.flash = "red"; v.burst = "red"; v.rail = { only: tids }; v.html = `<div class="eyebrow fx-fade">the end</div><h1 class="blood fx-slam">The Cloaks win</h1>${grid}<div class="sub fx-rise" style="--d:1s">${esc(ts.map(p => p.name).join(" and "))} — Cloaks to the last. One question left. Share it, or take it.</div>`; break }
      if (nT < 2) { v.sfx = nT ? "sting" : "win"; v.flash = nT ? "red" : "gold"; v.burst = nT ? "red" : "gold"; v.rail = nT ? { only: tids } : {}; v.html = `<div class="eyebrow fx-fade">the end</div><h1 class="${nT ? "blood" : "gold"} fx-slam">${nT ? "The Cloaks win" : "The Candles win"}</h1>${grid}<div class="sub fx-rise" style="--d:1s">${nT ? esc(ts[0].name) + " — a Cloak to the last. The prize is theirs." : "Every Cloak is gone. The prize belongs to the Candles."}</div>`; break }
      if (nT >= 2 && f.order) {
        const ord = f.order.map(id => P2(s, id)).filter(Boolean), done = f.revealed >= ord.length, st = done ? ord.filter(p => f.votes[p.id] === "take") : [];
        v.sfx = done ? (st.length === 1 ? "sting" : st.length === 0 ? "gold" : "drum") : f.revealed ? "seal" : null; v.rail = { only: tids }; v.quiet = true;
        let verdict = ""; if (done) verdict = st.length === 0 ? "They share: the pot split between them — and rock, paper, scissors for the prize." : st.length === 1 ? esc(st[0].name) + " takes it all — the pot and the prize." : "They grabbed at each other. The prize goes to the dead — if the dead saw clearly.";
        let ghosts = "";
        if (g) {
          const gp = (g.order || g.ids).map(id => P2(s, id)).filter(Boolean);
          if (!g.order) ghosts = `<div class="sub">The Ghosts who named a Cloak: <b>${esc(gp.map(p => p.name).join(" and "))}</b>. Now they share or take.</div>`;
          else { const gd = g.revealed >= gp.length, gst = gd ? gp.filter(p => g.votes[p.id] === "take") : []; v.sfx = gd ? (gst.length === 1 ? "sting" : gst.length === 0 ? "gold" : "drum") : g.revealed ? "seal" : null; ghosts = vcards(gp, g.revealed, g.votes, "share", { g: "SHARE", b: "TAKE", gi: "handshake" }) + (gd ? `<div class="sub">${gst.length === 0 ? "The Ghosts share: the pot split, and rock, paper, scissors for the prize." : gst.length === 1 ? esc(gst[0].name) + " takes it all." : "The dead grabbed from the dead. " + host + " keeps the prize."}</div>` : "") }
        } else if (done && st.length >= 2) { const hits = f.ghostHits || []; ghosts = `<div class="sub">${hits.length === 1 ? "<b>" + esc(hits[0]) + "</b> named a Cloak from beyond the table. The prize is theirs." : hits.length === 0 ? "No Ghost saw a Cloak. " + host + " keeps the prize." : ""}</div>` }
        v.norail = !!(g && g.order);
        v.html = `<div class="eyebrow">the cloaks</div><h1 class="blood md">Share or Take</h1>${g && g.order ? "" : vcards(ord, f.revealed, f.votes, "share", { g: "SHARE", b: "TAKE", gi: "handshake" })}${verdict ? `<div class="sub fx-rise">${verdict}</div>` : ""}${ghosts}`; break;
      }
      v.html = `<div class="eyebrow fx-fade">the final ${A.length === 2 ? "two" : A.length}</div><h1 class="gold fx-title ${hsize(A.map(p => p.name).join(" & "), 14, 26)}">${esc(A.map(p => p.name).join(" & "))}</h1><div class="sub">Nothing left to say. Nothing left to chalk.</div>`; break;
    }
    case "final": {
      // the pot rides on the prize line's last sentence, so the 14-player roll still fits
      const potSplitTV = s => { const ids = (s.prizeIds || []).map(id => P2(s, id)).filter(Boolean); return ids.length && s.pot ? (ids.length > 1 ? " The pot splits " + numWord(ids.length) + " ways: " + moneyOf(s, s.potEach || 0) + " each." : " With the pot: " + moneyOf(s, s.pot) + ".") : "" };
      const w = s.winner, tr = w === "cloaks", ps = s.players, cols = ps.length <= 4 ? ps.length : 4; // four across even for 14, so long names get room
      // the awards, once the host calls them
      if (s.finalStep === 1) {
        const aw = s.awards || [], k = Math.min(s.awardShown || 0, aw.length); v.scene = "final"; v.norail = true; v.key += "aw" + k; v.sfx = k ? "gold" : "drum"; v.burst = k ? "gold" : null;
        v.html = `<div class="eyebrow fx-fade">before you go</div><h1 class="gold md fx-title">The Awards</h1>${aw.length ? `<div class="awards c${aw.length <= 4 ? 2 : aw.length === 6 ? 3 : 4} ${aw.length > 8 ? "dense" : aw.length > 4 ? "mid" : ""}">${aw.map((a, i) => i < k ? `<div class="award ${i === k - 1 ? "fresh fx-rise" : ""}" ${i === k - 1 ? 'style="--d:.2s"' : ""}><div class="aico">${ART.icon(a.icon)}</div><div class="at">${esc(a.title)}</div><b>${esc(andList(a.names))}</b><small>${esc(a.why)}</small></div>` : `<div class="award sealed"><div class="aico">${ART.icon("scroll")}</div><div class="at">${cap1(numWord(i + 1))}</div></div>`).join("")}</div>${k ? "" : `<div class="sub fx-rise" style="--d:.6s">${cap1(numWord(aw.length))}, one at a time.</div>`}` : `<div class="sub">No clear winners tonight — everyone was equally suspicious.</div>`}`; break;
      }
      // how each Cloak became one: from the start, converted, or by bargain; and who refused
      const many = ps.length > 10, huge = ps.length > 16, how = p => p.role === "cloak" ? (p.converted ? (p.converted.mode === "bargain" ? (many ? "Cloak · bargain, rd " : "Cloak · by bargain, round ") + p.converted.round : (many ? "Cloak · converted, rd " : "Cloak · converted, round ") + p.converted.round) : "Cloak") : "Candle" + ((p.refused || []).length ? (many ? " · refused" : " · refused the Cloaks") : "");
      v.scene = "final"; v.norail = true; v.tight = true; v.sfx = tr ? "sting" : "win"; v.flash = tr ? "red" : "gold"; v.waves = tr ? "red" : "gold";
      const r = s.rps, rw = r && r.winner ? P2(s, r.winner) : null, prz = esc(prizeOf(s));
      if (rw) { v.key += "·" + rw.id; v.sfx = "win"; v.flash = "gold"; v.waves = "gold" }
      const prizeLine = rw ? `<div class="prizeline fx-rise" style="--d:.6s"><span>takes home</span><b>${prz}</b></div>`
        : `<div class="prizeline fx-rise" style="--d:1.4s"><span>the prize</span><b>${prz}</b>${r ? `<em>Only one of it. ${r.ids.length <= 3 ? esc(andList(r.ids.map(id => P2(s, id)).filter(Boolean).map(p => p.name))) : cap1(numWord(r.ids.length)) + " winners"} — rock, paper, scissors for it.${esc(potSplitTV(s))}</em>` : s.prizeTo ? `<em>It goes to ${esc(s.prizeTo)}.${esc(potSplitTV(s))}</em>` : ""}</div>`;
      v.html = rw ? `<div class="eyebrow fx-fade">the prize</div><h1 class="gold fx-slam ${hsize(rw.name, 10, 16)}">${esc(rw.name)}</h1>${prizeLine}` : `<div class="eyebrow fx-fade">the end</div><h1 class="${tr ? "blood" : "gold"} fx-slam">${tr ? "The Cloaks win" : "The Candles win"}</h1>${many ? "" : `<div class="sub fx-rise" style="--d:.8s">${tr ? "The Candles built a pot of " + moneyOf(s, s.pot) + " — and the Cloaks take it." : "Every Cloak is gone. Pot: " + moneyOf(s, s.pot) + "."}</div>`}${prizeLine}${rw || many ? "" : ghostVerdictTV(s)}${!rw && ps.length <= 12 && (s.cloakMisses || (s.questTally && (s.questTally.done || s.questTally.failed))) ? `<div class="sub small">${[s.cloakMisses ? `Cloaks shouted <b>${s.cloakMisses}</b> wrong answer${s.cloakMisses === 1 ? "" : "s"} all night.` : "", s.questTally && (s.questTally.done || s.questTally.failed) ? `Side-quests: ${s.questTally.done} completed, ${s.questTally.failed} failed — in plain sight.` : ""].filter(Boolean).join(" ")}</div>` : ""}<div class="rolls ${huge ? "huge" : ps.length > 10 ? "many" : ""}" style="grid-template-columns:repeat(${huge ? 6 : cols},minmax(0,1fr))">${ps.map((p, i) => `<div class="${p.role === "cloak" ? "t" : "f"}" style="--d:${(1.5 + i * Math.min(0.7, 20 / ps.length)).toFixed(1)}s">${ART.seal(p)}<span><b>${esc(p.name)}</b><small>${how(p)}${p.left ? " · left" : p.alive ? "" : " · out"}</small></span></div>`).join("")}</div>`; break;
    }
  }
  if (v.html) v.html = kw(v.html, s); // murder or poison, as the host chose
  return v;
}

/* ---------- mount + render ---------- */
let tvBuilt = false, lastKey = null, lastPhase = null, lastSfxName = null, lastReplay = 0, lastPot = null, lastVotes = 0, lastBeat = null, lastSnap = null, lastDead = null;
let cardUntil = 0, cardTimer = null, introTimers = [], sfxTimer = null, fxTimer = null, waveTimer = null, potRaf = null;
function tvBuild() {
  $("#app").innerHTML = `<div id="tv" class="scene-lobby"><div id="set"><div class="wall"></div><div class="stone" style="background-image:${ART.stone()}"></div><div class="win l">${ART.window("l")}</div><div class="win r">${ART.window("r")}</div><div class="shaft l"></div><div class="shaft r"></div><div id="sun"></div><div id="birds">${[0, 1, 2, 3, 4].map(i => `<i style="--i:${i}"><svg viewBox="0 0 40 16"><g><path d="M0 9 Q10 0 20 9 Q30 0 40 9 Q30 4 20 12 Q10 4 0 9Z"/></g></svg></i>`).join("")}</div><div id="dim"></div><canvas id="fx"></canvas><div id="mist"><i></i><i></i></div></div><div id="vig"></div><div id="veil"></div><div id="moon"></div><div id="top"></div><div id="stage"></div><div id="rail"></div><div id="grain" style="background-image:${ART.grain()}"></div><div id="flash"></div><div id="card"></div><div id="over"></div><button id="soundbtn"></button><button id="fsbtn" aria-label="Full screen (or press F)">Full screen<small>or press F</small></button><div id="net">reconnecting…</div><div class="stamp">${APPV} · ${BUILD ? BUILD.slice(-6) : "local"}</div></div>`;
  $("#soundbtn").onclick = () => AC ? toggleMute() : enableSound();
  // full screen: the button, the F key, or a double-click anywhere (a browser only allows it from a click or a key)
  $("#fsbtn").onclick = e => { e.stopPropagation(); toggleFull() };
  document.addEventListener("keydown", e => { if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) toggleFull() });
  document.addEventListener("dblclick", () => toggleFull());
  ["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, fsState)); fsState();
  let cursorT = null; document.addEventListener("mousemove", () => { document.body.classList.remove("nocursor"); clearTimeout(cursorT); cursorT = setTimeout(() => document.body.classList.add("nocursor"), 3000) });
  tvBuilt = true; FX.start(); setInterval(tvTick, 200);
}
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsOk = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function toggleFull() {
  try {
    const d = document.documentElement, r = fsEl() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
    if (r && r.catch) r.catch(() => {});
  } catch (e) {}
}
function fsState() { const b = $("#fsbtn"); if (b) b.className = fsEl() || !fsOk() ? "off" : AC ? "" : "withsound" }
function tvRefresh(force) { if (force) lastKey = lastKey === null ? null : lastKey + "!"; renderTV() }
function showCard(s) {
  const def = PHASECARDS[s.phase]; if (!def || window.__noCards) return false;
  const c = def(s), el = $("#card");
  el.className = ""; void el.offsetWidth;
  const dur = Math.max(c[3] || 0, 4000); // three seconds in full view at least (5%–80%); the next screen builds underneath as it fades
  el.innerHTML = `<div class="pci">${ART.icon(c[2])}</div><div class="pct gold">${esc(c[0])}</div><div class="rule"></div>${c[1] ? `<div class="pcs">${esc(c[1])}</div>` : ""}`;
  el.style.setProperty("--cd", dur / 1000 + "s"); el.className = "on"; sfx("drum");
  clearTimeout(cardTimer); cardTimer = setTimeout(() => { el.className = "" }, dur);
  return dur;
}
function renderTV() {
  if (!tvBuilt) tvBuild();
  const tv = $("#tv"), sb = $("#soundbtn");
  sb.textContent = AC ? (muted ? "off" : "♪") : "Enable sound"; sb.title = AC ? (muted ? "Sound is off — tap to unmute" : "Sound is on — tap to mute") : "Browsers only allow sound after a tap"; sb.className = AC ? "" : "ask";
  const net = $("#net"); if (net) net.className = offline() ? "on" : "";
  if (!state || state.v !== SCHEMA) {
    tv.className = "scene-lobby norail big"; fsState(); lastKey = "none"; lastPhase = null; lastPot = null;
    patch($("#top"), ""); patch($("#rail"), "");
    if (connecting) { patch($("#stage"), `<div class="crestbig crest">${ART.crest(true)}</div>`, false); return }
    if (roomMissing) { patch($("#stage"), `<div class="crestbig crest">${ART.crest()}</div><h1 class="gold md">No game at this code</h1><div class="sub">Check the room code — it’s six letters and numbers, shown on the host’s phone.</div>`, false); return }
    const join = ROOM ? `<div class="roomjoin fx-rise" style="--d:2.2s"><span>room</span><b class="num">${esc(ROOM)}</b><em>Host: open <u>${esc(location.host)}/g/${esc(ROOM)}#host</u> on your phone</em></div>` : "";
    patch($("#stage"), `<div class="crestbig crest">${ART.crest(true)}</div><div class="eyebrow fx-fade" style="--d:1.2s">a dinner with</div><h1 class="wordmark gold fx-title" style="--d:1.6s">Cloak &amp; Candle</h1><div class="rule"></div><div class="sub">${roomExpired ? "This party pass has expired." : "Waiting for the host to open the doors…"}</div>${join}`, false);
    if (AC) MUSIC.setScene("lobby"); return;
  }
  const s = publicView(state);
  // a phase change plays its title card first; the new screen builds underneath as the card lifts
  if (lastPhase !== null && s.phase !== lastPhase && performance.now() >= cardUntil) { const cd = showCard(s); if (cd) { try { tv.classList.toggle("norail", !!tvView(s).norail) } catch (e) {} const under = Math.round(cd * 0.8); cardUntil = performance.now() + under; lastPhase = s.phase; setTimeout(renderTV, under); overlays(s); return } }
  if (performance.now() < cardUntil) { overlays(s); return }
  lastPhase = s.phase;
  const v = tvView(s), changed = v.key !== lastKey, seatedN = seated(s).length || 1;
  tv.className = `scene-${v.scene} ${v.night ? "night" : ""} ${v.norail ? "norail" : ""} ${s.tvText === "standard" ? "" : "big"}`; fsState();
  tv.style.setProperty("--light", (0.35 + 0.65 * aliveOf(s).length / seatedN).toFixed(2));
  patch($("#top"), `<span>${s.phase === "lobby" || s.phase === "intro" ? "welcome" : "round " + s.round}${isFinal(s) && s.phase !== "lobby" ? ` · <span class="fin">the final</span>` : ""}</span><span class="brandline"><span class="crest" style="width:3.4vh;height:4vh">${ART.crest()}</span>${esc(titleOf(s))}</span><span class="potbox"><span>pot</span><b class="num" id="potv">${moneyOf(s, lastPot === null ? s.pot : lastPot)}</b></span>`);
  patch($("#stage"), v.html, changed);
  $("#stage").style.gap = v.tight ? "1vh" : "";
  const rail = $("#rail"); patch(rail, v.night ? rail.innerHTML : railHTML(s, v.rail)); railBooted = true;
  overlays(s);
  // a candle going out
  const dead = seated(s).filter(p => !p.alive && v.rail.hot !== p.id).length;
  if (lastDead !== null && dead > lastDead && !v.norail && !v.night) setTimeout(() => sfx("snuff"), 350);
  lastDead = dead;
  if (changed) {
    clearTimeout(sfxTimer); clearTimeout(fxTimer); clearInterval(waveTimer); introTimers.forEach(clearTimeout); introTimers = [];
    const fireS = () => { if (v.sfx) { lastSfxName = v.sfx; sfx(v.sfx) } };
    const fireF = () => { if (v.flash) { const f = $("#flash"); f.className = ""; void f.offsetWidth; f.className = v.flash; if (/^red/.test(v.flash)) { const st = $("#stage"); st.classList.remove("shake"); void st.offsetWidth; st.classList.add("shake"); setTimeout(() => st.classList.remove("shake"), 900) } } if (v.burst) FX.burst(v.burst) };
    if (v.sfxDelay) sfxTimer = setTimeout(fireS, v.sfxDelay); else fireS();
    if (v.fxDelay || v.sfxDelay) fxTimer = setTimeout(fireF, v.fxDelay || v.sfxDelay); else fireF();
    if (v.waves) { let k = 0; waveTimer = setInterval(() => { FX.burst(v.waves, 50); if (++k > 8) clearInterval(waveTimer) }, 400) }
    if (v.intro) for (let i = 0; i < v.intro; i++) introTimers.push(setTimeout(() => { sfx("ignite"); if (i % 3 === 0) sfx("beat") }, (3.4 + i * 0.9) * 1000));
    lastBeat = null; lastSnap = null;
  }
  if (s.phase === "table") { if (v.votes > lastVotes && !changed) sfx("vote"); lastVotes = v.votes || 0 } else lastVotes = 0;
  const rolling = (s.phase === "reveal" && s.table && !s.table.step && !!s.table.roll && now() - s.table.roll < 15000) || (s.phase === "final2" && s.final2 && !!s.final2.roll && !(s.final2.shown || []).includes(s.final2.roll.id) && now() - s.final2.roll.t < 15000);
  if (rolling) ROLL.start(); else ROLL.stop();
  lastKey = v.key;
  hushCheck(s);
  if (AC) MUSIC.setScene(v.night ? "night" : ({ mission: "mission", table: "table", reveal: "table", endvote: "table", final2: "table", morning: "morning", final: "final", mingle: "mingle", lobby: "lobby", intro: "lobby" })[s.phase] || "day");
  if (s.replaySfx && s.replaySfx !== lastReplay) { const first = lastReplay === 0 && !changed; lastReplay = s.replaySfx; if (!first && lastSfxName) sfx(lastSfxName) }
  // pot counts up or down instead of jumping
  if (lastPot !== null && lastPot !== s.pot) {
    const from = lastPot, to = s.pot, t0 = performance.now(); cancelAnimationFrame(potRaf);
    const tw = () => { const el = $("#potv"), k = Math.min(1, (performance.now() - t0) / 1400), e = 1 - Math.pow(1 - k, 3); if (el) el.textContent = moneyOf(s, Math.round((from + (to - from) * e) / 50) * 50); if (k < 1) potRaf = requestAnimationFrame(tw) };
    tw(); if (to > from) sfx("tick");
  }
  lastPot = s.pot;
}
function overlays(s) {
  const o = $("#over");
  if (s.tvBlack) { o.className = "on"; o.innerHTML = "" }
  else if (s.tvPause) { o.className = "on"; o.innerHTML = `<div class="crestbig crest">${ART.crest()}</div><div class="eyebrow">one moment</div><h1 class="gold md">${esc(titleOf(s))}</h1>` }
  else if (o.className) { o.className = ""; o.innerHTML = "" }
}
// Hum It: no music under the humming
let hushed = false;
function hushCheck(s) { const m = s && s.phase === "mission" && s.mission, on = !!(m && m.key === "hum" && m.timerEnd && now() < m.timerEnd); if (on !== hushed) { hushed = on; if (typeof hush === "function") hush(on) } }
// one clock for every moving thing on screen: rings, alarms, the memory wall, the Snap deck
function tvTick() {
  if (!state || state.v !== SCHEMA) return;
  if (hushed) hushCheck(state);
  const tvEl = $("#tv"); if (tvEl) tvEl.classList.toggle("hurry", [...document.querySelectorAll("#tv .ring[data-end], #tv .memtime[data-end]")].some(el => { const r = (+el.dataset.end - now()) / 1000; return r > 0 && r <= 15 }));
  document.querySelectorAll("#tv .ring[data-end]").forEach(el => {
    const end = +el.dataset.end, dur = +el.dataset.dur, r = (end - now()) / 1000, time = el.querySelector(".time"), fg = el.querySelector(".fg"), txt = mmss(r);
    if (time && time.textContent !== txt) time.innerHTML = digits(txt);
    el.classList.toggle("low", r <= 15);
    if (fg && dur) fg.style.strokeDashoffset = (283 * (1 - Math.max(0, Math.min(1, r * 1000 / dur)))).toFixed(1);
    const sec = Math.ceil(r), h5 = el.classList.contains("hide5");
    if (h5) el.classList.toggle("shown", r <= 5);
    if (r <= (h5 ? 5 : 15) && r > 0 && sec !== lastBeat) { lastBeat = sec; sfx("alarm", sec) }
    if (r <= 0 && lastBeat !== "done" + end) { lastBeat = "done" + end; sfx("chime") }
  });
  const mt = $("#tv .memtime"); if (mt) { const r = (+mt.dataset.end - now()) / 1000, sec = Math.ceil(r); mt.textContent = mmss(r); if (r <= 15 && r > 0 && sec !== lastBeat) { lastBeat = sec; sfx("alarm", sec) } if (r <= 0) { sfx("chime"); renderTV() } }
  const m = state.mission;
  if (state.phase === "mission" && m && m.key === "change" && m.cstage === "blind" && m.holdEnd && now() >= m.holdEnd && lastKey && lastKey.endsWith("hold")) renderTV();
  if (state.phase === "mission" && m && m.key === "snap" && m.seqStart && m.stage === "play") {
    const i = Math.floor((now() - m.seqStart) / 5000);
    if (i !== lastSnap) {
      lastSnap = i; const big = $("#snapico"), cnt = $("#tv .snapcount");
      if (i >= m.seq.length) { renderTV(); return }
      if (big && i >= 0) { big.innerHTML = ART.icon(SNAPSYM[m.seq[i]], "fx-flip"); sfx("tick") }
      if (cnt) cnt.textContent = i < 0 ? "ready" : (i + 1) + " / " + m.seq.length;
    }
  }
}

/* ---------- particles: dust in the light, embers off the candles, bursts on the big beats ---------- */
const FX = {
  c: null, x: null, ps: [], last: 0, w: 0, h: 0, u: 1,
  start() {
    this.c = $("#fx"); if (!this.c) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return; // no drifting dust, no bursts
    this.x = this.c.getContext("2d");
    // drawn at the screen's real resolution (a 4K TV gets a 4K canvas, never more); u keeps every size and speed
    // the same share of the screen as the original half-resolution tuning
    const fit = () => { const k = Math.min(devicePixelRatio || 1, 2160 / Math.max(1, innerHeight), 2); this.w = this.c.width = Math.round(innerWidth * k); this.h = this.c.height = Math.round(innerHeight * k); this.u = k * 2 }; fit(); addEventListener("resize", fit);
    for (let i = 0; i < 46; i++) this.ps.push(this.mote(true));
    const loop = t => { requestAnimationFrame(loop); if (t - this.last < 33) return; const dt = Math.min(0.1, (t - this.last) / 1000); this.last = t; this.step(dt) };
    requestAnimationFrame(loop);
  },
  mote(anywhere) { const u = this.u; return { k: "mote", x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : this.h + 4 * u, vx: (Math.random() - .5) * 4 * u, vy: -(2 + Math.random() * 5) * u, r: (.4 + Math.random() * 1.1) * u, a: .08 + Math.random() * .22, ph: Math.random() * 6.3, life: 1e9 } },
  burst(kind, n) {
    if (!this.x) return;
    if (kind === "dust") { for (let i = 0; i < 40; i++) { const p = this.mote(true); p.a *= 2; p.vy *= 2.2; this.ps.push(Object.assign(p, { life: 5, k: "spark", col: "240,207,130", g: 0 })) } return }
    const col = kind === "red" ? "214,52,66" : "244,208,120", u = this.u; n = n || 110;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = (20 + Math.random() * 130) * u; this.ps.push({ k: "spark", col, x: this.w / 2 + (Math.random() - .5) * this.w * .3, y: this.h * .46, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30 * u, r: (.6 + Math.random() * 1.8) * u, a: .9, life: 1.6 + Math.random() * 1.6, g: 26 * u }) }
  },
  step(dt) {
    const x = this.x, night = $("#tv") && $("#tv").classList.contains("night"); x.clearRect(0, 0, this.w, this.h); x.globalCompositeOperation = "lighter";
    const u = this.u;
    if (Math.random() < 0.05 && !night) this.ps.push({ k: "spark", col: "255,170,80", x: this.w * (.12 + Math.random() * .76), y: this.h * .8, vx: (Math.random() - .5) * 8 * u, vy: (-14 - Math.random() * 18) * u, r: (.5 + Math.random() * .7) * u, a: .7, life: 2.4 + Math.random() * 2, g: -2 * u });
    this.ps = this.ps.filter(p => {
      p.life -= dt; if (p.life <= 0) return false;
      if (p.k === "mote") { p.ph += dt; p.x += (p.vx + Math.sin(p.ph) * 3 * u) * dt; p.y += p.vy * dt; if (p.y < -4 * u) Object.assign(p, this.mote(false)); if (night) return true; x.fillStyle = `rgba(255,226,170,${p.a})` }
      else { p.vy += (p.g || 0) * dt; p.vx *= .985; p.x += p.vx * dt; p.y += p.vy * dt; x.fillStyle = `rgba(${p.col},${Math.max(0, Math.min(p.a, p.life * .7))})` }
      x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill(); return true;
    });
    if (this.ps.length > 900) this.ps.splice(0, this.ps.length - 900);
  }
};
