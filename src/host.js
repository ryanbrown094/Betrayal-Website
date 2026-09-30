/* ===================== HOST PHONE ===================== */
let logOpen = false, seatOpen = false, ballotEdit = null, setupDraft = null, setupMsg = "", bankOpen = false, bankTab = "QUIZ_E", bankQ = "", menuOpen = false, swapOpen = false, planOpen = false, leftPicker = false, renamePicker = false, spoil = false, spoilT = null, fullScript = false, pinMsg = "", ask = null, renameId = null;
// every destructive tap gets an in-app confirmation instead of a browser dialog
function confirmSheet(title, note, label, fn, cls) { ask = { title, note, label, fn, cls: cls || "danger" }; renderHost() }
function askGo() { const a = ask; ask = null; if (a) a.fn() }
// the TV narrator: with it on, every line to read has a ▶ TV button that has the TV speak it instead
const narrOn = () => !!(state && rulesIn(state).narrator && typeof REPLAY !== "undefined" && !REPLAY);
const tvRead = t => narrOn() && t ? `<button class="tvread" data-t="${esc(t)}" onclick="narrate(this)" aria-label="Read this line on the TV">▶ TV</button>` : "";
const say = text => `<div class="say"><span class="mn">Say</span><div class="ln">${tvRead(text)}${esc(text)}</div></div>`;
// a stage direction: a private reminder, in italics and brackets, under the line it belongs to (html: already escaped)
const dir = (html, cls) => `<p class="dir${cls ? " " + cls : ""}">${html}</p>`;
const pbtn = (p, cls, fn, tag) => `<button class="${cls || ""}" onclick="${fn}">${ART.seal(p)}<span class="nm">${esc(p.name)}</span><span class="tagx">${tag || ""}</span></button>`;
const nextBtn = (label, fn, cls) => `<button class="${cls || "primary"}" onclick="${fn}">${label}</button>`;
const holdBtn = (label, kind, id, cls) => `<button class="${cls || "primary"} hold ${(state && ((kind === "reveal" && state.table && state.table.roll) || (kind === "seal" && state.final2 && state.final2.roll))) ? "holding" : ""}" onpointerdown="holdStart('${kind}','${id || ""}',event)" onclick="holdClick('${kind}','${id || ""}')" oncontextmenu="return false">${label}<small>${(state && ((kind === "reveal" && state.table && state.table.roll) || (kind === "seal" && state.final2 && state.final2.roll))) ? "drumroll on the TV, let go to reveal" : "hold for the drumroll, let go to reveal"}</small></button>`;
const backBtn = fn => `<button class="ghost back" onclick="${fn}" aria-label="Back one line">Back</button>`;
const until = t => new Date(t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const hstamp = () => `<div class="hstamp">${ROOM ? "Table " + ROOM + (roomInfo ? (roomExpired ? " · this Table has closed" : " · open until " + until(roomInfo.expires)) : "") + " · " : ""}${APPV} · ${BUILD ? BUILD.slice(-6) : "local"}${remote ? "" : db ? " · artifact storage" : " · this browser only"} · <button class="linkish" onclick="openReport()">Report a problem</button></div>`;
const elapsed = s => s.startedAt ? (x => Math.floor(x / 60) + "h" + String(Math.floor(x % 60)).padStart(2, "0"))((now() - s.startedAt) / 60000) : "";

const PHASE_NAME = { lobby: "Welcome", intro: "Titles", night0: "The Oath", day: "Day", mission: "Trial", shield: "Prizes", mingle: "Interval", table: "Reckoning", reveal: "Reckoning", night: "Night", morning: "Dawn", endvote: "Trust or Doubt", final: "Unmasking", final2: "Final two" };
function renderHost() {
  if (state && state.phase === "final") try { localStorage.setItem("candle-played", "1") } catch (e) {} // a game played to the end: the next one recommends the twists
  const app = $("#app");
  if (connecting) { patch(app, `<div id="host"><div class="pinwrap"><h2>Connecting to the house…</h2><p class="note">If this doesn’t clear in a few seconds, check the phone is online.</p></div>${hstamp()}</div>`); return }
  if (roomMissing) { patch(app, `<div id="host"><div class="pinwrap"><h2>No game at this code</h2><p class="note">Table codes are six letters and numbers. Start again from the home page with your booking code: entering it again brings back the same Table.</p><button class="primary" onclick="location.href='/'">Go to the home page</button></div>${hstamp()}</div>`); return }
  if (roomExpired && !state) { patch(app, `<div id="host"><div class="pinwrap"><h2>This Table has closed</h2><p class="note">Each booking runs one party for ${esc(String(48))} hours. Buy another to play again.</p><button class="primary" onclick="location.href='/'">Book another Table</button></div>${hstamp()}</div>`); return }
  if (!state || !authed) {
    if (serverHasGame || (state && !authed)) { patch(app, `<div id="host"><div class="pinwrap"><h2>Enter the Keeper PIN</h2><input id="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="Keeper PIN" onkeydown="if(event.key==='Enter')checkPin()"><button class="primary" onclick="checkPin()">Unlock</button><p class="note">${esc(pinMsg || (limitedNow ? "Too many wrong PINs have been tried. Wait a minute, then enter it." : "A game is in progress. The PIN was set when it was created."))}</p></div>${hstamp()}</div>`); return }
    patch(app, `<div id="host">${setupForm()}${hstamp()}${bankOpen ? bankSheet() : ""}${toastMsg ? `<div class="toast" role="status">${esc(toastMsg)}</div>` : ""}</div>`); return;
  }
  if (state.v !== SCHEMA) { patch(app, `<div id="host"><div class="pinwrap"><h2>A game from an older version is saved here</h2><p class="note">It can’t be continued in ${APPV}. Wipe it to set up a new game.</p><button class="danger" onclick="confirmNew()">Wipe the old game</button></div>${hstamp()}</div>`); return }
  const s = state, fin = isFinal(s);
  if (setupDraft && serverHasGame && authed) { setupDraft = null; try { sessionStorage.removeItem("candle-draft") } catch (e) {} } // the game exists now
  const bar = `<div class="bar"><div class="l1"><span class="ph">${fin ? "Final round" : "Round " + s.round} · ${PHASE_NAME[s.phase] || s.phase}${s.startedAt ? " · " + elapsed(s) : ""}</span><span class="pot num">${money(s.pot)}</span><button onclick="undo()" ${canUndo() ? "" : "disabled"}>Undo</button><button onclick="menuOpen=true;renderHost()">Menu</button></div>${syncErr ? '<div class="nosync" role="status">Not synced. It retries by itself, so keep going.</div>' : offline() ? '<div class="nosync" role="status">Offline. Every change is kept on this phone.</div>' : ""}${secretLine()}</div>`;
  let body = "", foot = "";
  switch (s.phase) {
    case "lobby":
      body = `<h2>Everyone seated?</h2>${say(SAY.lobbyWait)}<div class="row"><button class="${s.tvRules ? "sel" : ""}" onclick="act(s=>{s.tvRules=!s.tvRules})">${s.tvRules ? "Rules on the TV. Back to the names" : "Show the rules on the TV"}</button></div>${dir("On the TV, tap <b>Enable sound</b> once before you start: browsers insist on a tap. Next rolls the titles, then the blindfold script where you tap the Forsworn on the shoulder.")}`;
      foot = nextBtn("Roll the titles", "act(s=>{s.phase='intro';s.tvRules=false;s.startedAt=s.startedAt||now()},'Titles rolling')"); break;
    case "intro":
      body = `<h2>Titles rolling on the TV</h2>${dir("About " + (5 + s.players.length) + " seconds: the crest, the name, then a candle lit for each guest. Begin when the last one is burning.")}${say(SAY.lobby)}`;
      foot = nextBtn("Choose the Forsworn", "act(s=>{s.phase='night0';s.night={step:0}},'The Oath started')"); break;
    case "night0": {
      const sc = NIGHT0_(H()), st = s.night.step;
      body = `<h2>The Oath</h2>` + stepList(sc, st) + secretPanel();

      foot = (st > 0 ? backBtn("act(s=>{s.night.step--})") : "") + (st < sc.length - 1 ? nextBtn("Next line", "act(s=>{s.night.step++})") : nextBtn("Start round 1", "act(s=>{s.phase='day';s.night=null;snapRound(s)},'Roles assigned')")); break;
    }
    case "day": {
      const nx = nextPlanned(s), nd = MISSIONS.find(m => m.key === nx) || MISSIONS[0], want = perRoundOf(s), k = (s.roundMissions || 0) + 1;
      body = `<h2>${fin ? "The final round" : "Round " + s.round}</h2>${say(fin && s.fiveMission && s.roundMissions > 0 ? SAY.lastMission : (s.roundMissions || 0) > 0 ? SAY.secondMission(s.round) : fin ? SAY.final : SAY.day(s.round))}${advicePanel()}<div class="next"><span class="mn">Next${want > 1 && k <= want ? `<small>${k} of ${want}</small>` : ""}</span><div class="ln"><b class="tt">${esc(nd.title)}</b><span>${esc(defRules(nd))}</span></div></div><div class="row"><button class="ghost slim" onclick="swapOpen=!swapOpen;renderHost()">${swapOpen ? "Keep the plan" : "Swap it"}</button></div>`;
      foot = nextBtn("Start " + esc(nd.title), "swapOpen=false;pickMission('" + nx + "')");
      if (!swapOpen) break;
      body += `<h3>Pick another Trial</h3><div class="mlist">${MISSIONS.map(m => { const noRoom = m.key === "dilemma" && (shieldRoom(s) === 0 || !!(s.done || {}).dilemma); return `<button class="${(s.done || {})[m.key] ? "dim" : ""}" onclick="swapOpen=false;pickMission('${m.key}')" ${noRoom ? "disabled" : ""}>${esc(m.title)}<em>${esc(m.when)} · ${m.kind === "screen" ? "on screen" : "up from the table"}${(s.done || {})[m.key] ? " · played ×" + s.done[m.key] : ""}${noRoom ? " · no Sanctuary left to give" + (fin ? " in the final" : "") : ""}${m.key === "statue" && !ghostsOf(s).length ? " · no Ghosts yet" : ""}</em><small>${esc(defRules(m))}</small></button>` }).join("")}</div>`; break;
    }
    case "mission": { const r = missionHost(s); body = r.body; foot = r.foot; break }
    case "shield": {
      const c = s.shieldCard, g = ghostsOf(s).length > 0, cer = c.mode === "witness" ? WITNESSNOW_(H(), g, c) : CEREMONY_(H(), g, c);
      if ((c.mode === "secret" || c.mode === "witness") && c.step < cer.length) {
        const taps = c.mode === "witness" ? (c.fake ? `At line 2, tap <b>${esc(c.witnessName)}</b>. They’re the Forsworn, so the ceremony is for show.<br>At line 4, walk the table and tap nobody, at the same pace, so nobody hears a difference.` : `At line 2, tap <b>${esc(c.witnessName)}</b>: they won it.<br>At line 4, tap <b>${esc(c.metName)}</b>, the Forsworn they meet.`) : cer.map((l, i) => l.tap ? `At line ${i + 1}, for ${l.tap === "champion" ? "the Crown" : l.tap === "shield" ? "Sanctuary" : "the Casting Vote"}, tap <b>${esc(l.tap === "champion" ? c.warName : l.tap === "blade" ? c.dagName : andList(c.secNames))}</b>` : "").filter(Boolean).join("<br>");
        body = `<h2>${c.mode === "witness" ? "The special prize" : "Secret ceremony"}</h2><div class="secret">${taps}</div>` + stepList(cer, c.step);
        foot = (c.step > 0 ? backBtn("act(s=>{s.shieldCard.step--})") : "") + nextBtn(c.step < cer.length - 1 ? "Next line" : "Show the card", "act(s=>{s.shieldCard.step++})");
      } else {
        const noSh = c.mode === "none", held = s.players.filter(p => p.shield && p.alive), pub = c.pubNames || [], tvb = [];
        if (c.mode === "witness") tvb.push("“the special prize has been claimed”. " + esc(c.witnessName) + (c.fake ? " is a Forsworn, so nothing happens" : " is the Confessor, and can’t be poisoned"));
        if (pub.length) tvb.push(esc(pub.join(", ")) + (c.champion ? " named tonight’s Crown, with Sanctuary and the Casting Vote" : " shown with Sanctuary"));
        if (c.championName && !c.champion) tvb.push(esc(c.championName) + " named with the Casting Vote");
        if (c.secWar) tvb.push("“the Crown was chosen in secret” (" + esc(c.warName) + ")");
        if (c.secCount) tvb.push("“" + (c.secCount > 1 ? c.secCount + " Sanctuaries" : "Sanctuary") + " claimed in secret” (" + esc(andList(c.secNames)) + ")");
        if (c.secDag) tvb.push("“the Casting Vote was claimed in secret” (" + esc(c.dagName) + ")");
        if (!tvb.length) tvb.push("“the Trial is over”");
        body = `<h2>${c.mode === "witness" ? "Confessor chosen" : noSh && !c.championName ? "No Sanctuary from this Trial" : "Prizes given"}</h2>${noSh && held.length ? dir("Still holding Sanctuary from earlier: " + esc(held.map(p => p.name).join(", ")) + ".") : ""}${c.champion ? say(SAY.championFull(c.championName)) : pub.length ? say(SAY.shieldPublic(andList(pub))) : say(c.mode === "secret" || c.mode === "witness" ? SAY.afterCeremony : SAY.missionDone(s.round))}${c.championName && !c.champion ? say(SAY.blade(c.championName)) : ""}${(c.wasted || []).length ? dir(esc(andList(c.wasted)) + " won a mystery round as a Forsworn, so there is no Sanctuary and no ceremony for it. Say nothing.") : ""}${dir("On the TV: " + tvb.join("; ") + ".")}${dilemmaOffer(s, noSh && !c.addon, "Play the Temptation now, or after the Interval.")}`;
        // the plan picks what comes next; the others stay one tap away
        const more = (s.roundMissions || 0) < perRoundOf(s), questOn = s.quest && !s.quest.resolved, mingle = rulesIn(s).mingle || questOn;
        const nx = MISSIONS.find(m => m.key === nextPlanned(s)) || {};
        const alt = [more ? "" : `<button onclick="act(s=>{s.phase='day';s.mission=null},'Extra Trial')">Another Trial first</button>`, !more && mingle ? `<button onclick="openTable()">Skip the Interval</button>` : !more ? `<button onclick="startBreak('mingle')">Interval · 10 min</button>` : `<button onclick="${mingle ? "startBreak('mingle')" : "openTable()"}">${mingle ? "Interval first" : "Straight to the Reckoning"}</button>`, s.dinnerDone || rulesIn(s).dinnerAfter ? "" : `<button onclick="startBreak('dinner')">Dinner · 25 min</button>`].filter(Boolean).join("");
        body += `<div class="then"><span class="mn">Then</span><div class="ln">${more ? "Another Trial this round: " + esc(nx.title || "the next in the plan") + "." : mingle ? (questOn ? "An Errand is in play, so an Interval before the Reckoning." : "A ten-minute Interval, then the Reckoning.") : "Straight to the Reckoning."}</div></div><div class="row wrap">${alt}</div>`;
        foot = more ? nextBtn("Next Trial: " + esc(nx.title || ""), "act(s=>{s.phase='day';s.mission=null},'Second Trial')") : mingle ? nextBtn("Interval · 10 min", "startBreak('mingle')") : nextBtn("To the Reckoning", "openTable()");
      }
      break;
    }
    case "mingle": {
      const g = s.mingle, din = g.kind === "dinner", stp = din ? 300000 : 120000, adv = advice().lvl === "final" && !s.finalRound, cs = g.course && COURSES.find(c => c.k === g.course);
      body = `<h2>${cs ? cs.name : din ? "Dinner" : "Interval"}</h2>${say(cs ? SAY.course(g.course, Math.round(g.dur / 60000)) : din ? SAY.dinner(Math.round(g.dur / 60000)) : SAY.mingle(Math.round(g.dur / 60000), s.round))}<div class="row"><button onclick="act(s=>{s.mingle.dur=Math.max(120000,s.mingle.dur-${stp});if(s.mingle.end)s.mingle.end-=${stp}})">−${stp / 60000} min</button><button class="${g.end ? "" : "primary"}" onclick="act(s=>{s.mingle.end=now()+s.mingle.dur})" ${g.end ? "disabled" : ""}>${g.end ? "Running on TV" : "Start " + Math.round(g.dur / 60000) + " min"}</button><button onclick="act(s=>{s.mingle.dur+=${stp};if(s.mingle.end)s.mingle.end+=${stp}})">+${stp / 60000} min</button></div>${questBox(s, "Forsworn Errand in play:")}${g.then === "round" ? "" : dilemmaOffer(s, true, "Play The Temptation before the table so one is in play.")}`;
      foot = g.then === "round" ? nextBtn((cs ? cs.name.replace(/^The /, "") : "Dinner") + "’s done. Round " + (s.round + 1) + (adv ? ", the final" : ""), adv ? "nextRound(true)" : "nextRound()") : nextBtn("Another Trial", "act(s=>{s.phase='day';s.mingle=null;s.mission=null},'Trial after the " + (din ? "dinner" : "Interval") + "')", "ghost") + nextBtn("Reckoning", "openTable()"); break;
    }
    case "table": { const r = tableHost(s); body = r.body; foot = r.foot; break }
    case "reveal": {
      const p = P(s.table.exiled), st = s.table.step;
      // the first Ghost is made here, so this is where the table hears what Ghosts may and may not do
      const lore = st === 1 && !fin && !s.ghostIntroDone && ghostsOf(s).length > 0 && !endCheck() && alive().length > 2;
      body = `<h2>${esc(p.name)} exiled</h2>${st === 0 ? (banter(s, "margin") ? say(banter(s, "margin")) : "") + say(fin ? SAY.revealFinal(p.name, s.round) : SAY.reveal(p.name, s.round)) : ""}${st === 1 && !fin && banter(s, "role") ? say(banter(s, "role")) : ""}${st === 0 && s.table.bladeKill ? dir("The Casting Vote decided this one: the boards were tied, and it broke the tie against " + esc(p.name) + ". The TV shows the Casting Vote.") : ""}${st === 2 ? `<h3>The ghost lore</h3>` + say(SAY.ghostIntro(p.name)) + dir("The TV shows the Ghosts’ rules while you speak.") : `<div class="secret">Their role: <b>${p.role === "cloak" ? "Forsworn" : "Loyal"}</b>. ${fin ? "No reveal in the final: they leave without a word." : st === 0 ? "Let them answer out loud, then reveal it on the TV." : "Shown on the TV."}</div>`}${(st === 1 && !lore) || st === 2 ? ghostPanel(s) : ""}${st >= 1 && !lore ? advicePanel() : ""}`;
      const callers = st === 1 && !s.table.second ? ghostsOf(s).filter(g => g.id !== p.id) : [], called = (s.calls || {})[callKey(s)] || [];
      if (callers.length) body += `<h3>The Ghosts’ call</h3><p class="note">Which Ghosts chalked ${esc(p.name)}? Tap each one who called it, and the TV names them.</p><div class="plist">${callers.map(g => pbtn(g, called.includes(g.id) ? "sel" : "", "ghostCall('" + g.id + "')", called.includes(g.id) ? "✓" : "")).join("")}</div>`;
      if (st === 0) foot = fin ? nextBtn("They’ve left the table", "revealRole()") : nextBtn("Show it on the TV", "revealRole()");
      else if (lore) foot = nextBtn(esc(p.name) + " becomes the first Ghost", "act(s=>{s.table.step=2;s.ghostIntroDone=true},'Ghost lore')");
      // in the final the table votes even when no Forsworn is left: they don't know that, and the vote is the drama
      // the end game always starts with four left: they vote Trust or Doubt, whoever is left
      else foot = alive().length <= 2 ? nextBtn("The final two", "openFinal2()", "danger") : alive().length <= 4 ? nextBtn("Trust or Doubt, " + numWord(alive().length) + " left", "openEndvote()", "danger") : fin && alive().length === 5 && !s.fiveMission ? nextBtn("Five left: one more Trial, then the last vote", "fiveMission()", "danger")
 : fin ? nextBtn("Another vote, " + numWord(alive().length - 4) + " more before the end game", "openTable('Final: another vote')", "danger") : !cloaks().length ? nextBtn("No Forsworn left: the final round", "nextRound(true)", "danger") : alive().length <= 5 && s.players.length > 5 ? nextBtn("No night at five: the final round", "nextRound(true)", "danger") : secondVoteDue(s) ? nextBtn("The second vote: boards up again", "secondVote()", "danger") : nextBtn("Into the night", "startNight()");
      break;
    }
    case "endvote": {
      const v = s.endvote, A = alive(), done = A.filter(p => v.votes[p.id]).length;
      body = `<h2>Trust or Doubt?</h2>${v.order && v.revealed >= v.order.length && v.result !== "end" ? say(SAY.endvoteExile(v.count || 1)) : say(SAY.endvote)}` + (v.order ? dir(`Revealing on the TV: ${v.revealed} of ${v.order.length}.`) : `${dir("Hand the phone round. " + done + " of " + A.length + " voted.")}<div class="plist">${A.map(p => pbtn(p, v.votes[p.id] ? "dim" : "", "handoff={kind:'endvote',id:'" + p.id + "'};renderHost()", v.votes[p.id] ? "✓" : "")).join("")}</div>`);
      foot = v.order ? (v.revealed < v.order.length ? nextBtn("Reveal next vote", "act(s=>{s.endvote.revealed++})") : v.result === "end" ? nextBtn("The final ceremony", "startCeremony()", "danger") : nextBtn("Another Reckoning", "openTable('Final: extra Reckoning')")) : `<button class="${done === A.length ? "primary" : "ghost"}" onclick="startEndReveal()" ${done === A.length ? "" : "disabled"}>${done === A.length ? "All voted. Reveal on the TV" : "Waiting for " + (A.length - done) + " more"}</button>`;
      break;
    }
    case "final2": { const r = final2Host(s); body = r.body; foot = r.foot; break }
    case "night": body = nightHost(s); foot = nightFoot(s); break;
    case "morning": {
      const ghosts = ghostsOf(s), m = s.morning;
      if (!m.revealed) { body = `<h2>Dawn</h2>${say(SAY.dawnAsk(s.round))}<div class="secret">${m.kind === "murder" ? "<b>" + esc(m.name) + "</b> " + (m.many ? "were" : "was") + " poisoned. Wait for " + (m.many ? "each of them" : "them") + " to stand and announce it, then reveal." : "Nobody was poisoned. Let the silence sit, then reveal."}</div>`; foot = nextBtn(m.kind === "murder" ? "They’ve announced it. Reveal on the TV" : "Reveal: nobody died", "act(s=>{s.morning.revealed=true})"); break }
      const adv = advice().lvl === "final" && !s.finalRound, course = !endCheck() && courseDue(s), dinnerNow = course || (!s.dinnerDone && !endCheck() && rulesIn(s).dinnerAfter && rulesIn(s).dinnerAfter <= s.round);
      body = `<h2>Morning</h2>${say(m.kind === "murder" ? (m.many ? SAY.morningMany(m.name, s.round, m.saved) : SAY.morningPoison(m.name, s.round)) : m.kind === "shield" ? SAY.morningShield(s.round) : SAY.morningQuiet(s.round))}${m.convert ? dir("Last night’s " + (m.refused ? "refusal" : "conversion") + " stays secret: this line is the same as any quiet night.") : ""}${m.kind === "murder" && !m.lastDone ? `<div class="row"><button onclick="act(s=>{s.morning.lastEnd=now()+30000*((s.morning.victimIds||[1]).length);s.morning.lastDone=true})">Last words, ${m.many ? (m.victimIds.length * 30) + " s (30 s each)" : "30 s"} on the TV</button></div>` : ""}${ghosts.length && !s.ghostIntroDone ? `<h3>The ghost lore</h3>` + say(SAY.ghostIntro(((s.voteLog || []).map(x => P(x.exiled)).find(p => p && !p.alive && !p.left) || (m.kind === "murder" && P(m.victimId)) || ghosts[0]).name)) + `<div class="row"><button onclick="act(s=>{s.ghostIntroDone=true})">Ghost lore said</button></div>` : ""}${ghostPanel(s)}${advicePanel()}${dinnerNow ? dir(`Dinner, by your plan. Serve it now, between rounds ${s.round} and ${s.round + 1}. The TV runs a timer, and the next round starts when you’re done.`) : ""}`;
      foot = (dinnerNow ? nextBtn("Not yet", adv ? "nextRound(true)" : "nextRound()", "ghost") + nextBtn(course ? course.name + " now · " + course.dur / 60000 + " min" : "Dinner now · 25 min", "startBreak('dinner','round')") : nextBtn(adv ? "Next round, as the final" : "Next round", adv ? "nextRound(true)" : "nextRound()")); break;
    }
    case "final":
      body = `<h2>${s.winner === "cloaks" ? "The Forsworn win" : "The Loyal win"}</h2>${say(s.winner === "cloaks" ? SAY.endCloaks(s.players.filter(p => p.alive && p.role === "cloak").length) : SAY.endCandle)}${prizeHost(s)}`;
      const aw = s.awards || [], k = s.awardShown || 0;
      if (s.finalStep === 1) { const a = aw[k - 1]; body += `<h3>The awards <small>${k} of ${aw.length} on the TV</small></h3>${!aw.length ? say("No awards tonight. Nobody stood out, which at this table is an achievement.") : !k ? say("And before anyone leaves, the awards. " + cap1(numWord(aw.length)) + " of them.") : say(a.title + ". " + andList(a.names) + ", who " + a.why + ".")}${aw[k] ? `<div class="then"><span class="mn">Then</span><div class="ln">${esc(aw[k].title)}: ${esc(andList(aw[k].names))}</div></div>` : ""}` }
      foot = (s.finalStep === 1 ? backBtn(k ? "act(s=>{s.awardShown=Math.max(0,(s.awardShown||0)-1)})" : "act(s=>{s.finalStep=0})") + (k < aw.length ? (k && k < aw.length - 1 ? nextBtn("Show the rest", "act(s=>{s.awardShown=" + aw.length + "},'Awards: the rest at once')", "ghost") : "") + nextBtn(k ? "Next award" : "The first award", "act(s=>{s.awardShown=(s.awardShown||0)+1},'Award " + (k + 1) + "')") : "") : nextBtn("The awards", "act(s=>{s.finalStep=1;s.awardShown=0},'Awards')")) + nextBtn("New game", "confirmNew()", s.finalStep === 1 && k >= aw.length ? "danger" : "ghost"); break;
  }
  const M = (label, fn, cls, val) => `<button class="mrow ${cls || ""}" onclick="menuOpen=false;${fn}"><span>${label}</span><i>${val || "›"}</i></button>`;
  const menu = menuOpen ? `<div class="sheet"><div class="sheethead"><h2>Menu</h2><button onclick="menuOpen=false;renderHost()">Close</button></div>${M("Your game plan", "planOpen=true;renderHost()")}${M("The TV reads the lines", "menuOpen=false;toggleNarr()", "", rulesIn(s).narrator ? "On" : "Off")}${M("Report a problem", "menuOpen=false;renderHost();openReport()")}<h3>Jump to</h3>${M("Pick a Trial", "act(s=>{s.phase='day';s.mission=null},'Jumped to Trial pick')")}${M("The Reckoning", "openTable('Jumped to Reckoning')")}${M("The night", "startNight()")}${M("The next round", "nextRound()")}${s.roundSnap && s.roundSnap.round === s.round && !["final2", "final"].includes(s.phase) ? M("Rewind to the start of round " + s.round, "confirmSheet('Rewind to the start of round " + s.round + "?', 'Every Trial, vote and night since this round began is undone. Undo brings it all back.', 'Rewind', rewindRound)") : ""}${M(s.finalRound ? "Cancel the final round" : (s.phase === "day" && !(s.roundMissions || 0) ? "Make this round the final" : "Make the next round the final"), s.finalRound ? "act(s=>{s.finalRound=null},'Final round cancelled')" : "declareFinal()")}<h3>Players</h3>${s.phase === "final" ? "" : M("A player has left the party", "leftPicker=true;renderHost()")}${M("Rename a player", "renamePicker=true;renderHost()")}${M("Seating order", "seatOpen=true;renderHost()")}<h3>The TV</h3>${M("Black screen, for emergencies", "act(s=>{s.tvBlack=!s.tvBlack})", "", s.tvBlack ? "On" : "Off")}${M("Pause card", "act(s=>{s.tvPause=!s.tvPause})", "", s.tvPause ? "On" : "Off")}${M("Replay the last sound", "act(s=>{s.replaySfx=now()})")}${M("Text size", "act(s=>{s.tvText=s.tvText==='standard'?'large':'standard'},'TV text size')", "", s.tvText === "standard" ? "Standard" : "Large")}<h3>The game</h3>${M("Forsworn Errands", "act(s=>{s.questsOn=s.questsOn===false;if(s.rules)s.rules.quests=s.questsOn})", "", s.questsOn === false ? "Off" : "On")}${M("Wrong shouts cost the Purse", "act(s=>{s.wrongRule=s.wrongRule==='all'?'cloaks':'all'},'Wrong-shout rule changed')", "", s.wrongRule === "all" ? "Everyone’s" : "Forsworn’s only")}${M("Question bank", "openBank()", "", "Switch items off")}${s.phase === "final2" || s.phase === "final" ? "" : M("End the game now", "confirmSheet('End the game now?', 'The TV goes to the final ceremony. Nothing is revealed until you turn each seal.', 'End the game', startCeremony)")}${M("New game", "confirmNew()", "danger", "Wipe")}</div>` : "";
  if (renameId && !P(renameId)) renameId = null; // a sheet left open from a game that has since been wiped
  const ren = renamePicker ? (renameId ? `<div class="sheet mid"><h2>Rename ${esc(P(renameId).name)}</h2><input id="rn" value="${esc(P(renameId).name)}" maxlength="${NAMEMAX}" autocomplete="off" aria-label="New name" onkeydown="if(event.key==='Enter')renameGo()"><div class="row"><button onclick="renamePicker=false;renameId=null;renderHost()">Cancel</button><button class="primary" onclick="renameGo()">Save name</button></div></div>` : `<div class="sheet"><h2>Rename who?</h2><div class="plist">${s.players.map(p => pbtn(p, "", "renameId='" + p.id + "';renderHost()")).join("")}</div><button onclick="renamePicker=false;renderHost()">Cancel</button></div>`) : "";
  const left = leftPicker ? `<div class="sheet"><h2>Who left?</h2><p class="note">They come out of the game, and the roles and counts update.</p><div class="plist">${alive().map(p => pbtn(p, "", "leftAsk('" + p.id + "')", p.role === "cloak" ? "F" : "")).join("")}</div><button onclick="leftPicker=false;renderHost()">Cancel</button></div>` : "";
  const upcoming = (s.plan || []).slice(s.planAt || 0, (s.planAt || 0) + 6).map(k => (MISSIONS.find(m => m.key === k) || {}).title).filter(Boolean);
  const plan = planOpen ? `<div class="sheet"><div class="sheethead"><h2>Your game plan</h2><button onclick="planOpen=false;renderHost()">Close</button></div><p class="note">Set before the game. The plan picks each Trial, its prizes, the night and the breaks, and anything can still be changed on the screen where it happens.</p><div class="planbox">${planLines(rulesIn(s), seated(s).length).map(l => `<p>${esc(l)}</p>`).join("")}</div>${upcoming.length ? `<h3>Coming up</h3><p class="note">${esc(upcoming.join(" → "))}</p>` : ""}</div>` : "";
  const sheet = ask ? `<div class="sheet mid"><h2>${esc(ask.title)}</h2>${ask.note ? `<p class="note">${esc(ask.note)}</p>` : ""}<div class="row"><button onclick="ask=null;renderHost()">Cancel</button><button class="${ask.cls}" onclick="askGo()">${esc(ask.label)}</button></div></div>` : "";
  patch(app, `<div id="host">${bar}<div class="bodywrap" data-k="${s.phase}">${body}</div>${logOpen ? `<h3>The log</h3><div class="log">${(s.log || []).map(l => `<div>${esc(l)}</div>`).join("")}</div><div class="row"><button class="ghost slim" onclick="logOpen=false;renderHost()">Hide the log</button></div>` : `<div class="row"><button class="ghost slim" onclick="logOpen=true;renderHost()">Show the log (${plural((s.log || []).length, "line")})</button></div>`}${hstamp()}<div class="foot">${foot}</div>${handoffScreen(s)}${bankOpen ? bankSheet() : ""}${seatSheet(s)}${ren}${left}${menu}${plan}${sheet}${toastMsg ? `<div class="toast" role="status">${esc(toastMsg)}</div>` : ""}</div>`);
}
async function checkPin() { const el = $("#pin"), v = el ? el.value : ""; if (!v) return; const ok = await tryPin(v); if (ok !== true) { pinMsg = typeof ok === "string" ? ok : "Wrong PIN. Try again."; if (el) el.value = ""; renderHost() } else pinMsg = "" }
function confirmNew() { menuOpen = false; confirmSheet("Wipe this game and start over?", "Everything from tonight is deleted on the TV and the phone. There is no undo.", "Wipe the game", () => { setupDraft = null; try { sessionStorage.removeItem("candle-draft") } catch (e) {} renamePicker = leftPicker = false; renameId = null; handoff = null; newGame() }) }
function leftAsk(id) { const p = P(id); leftPicker = false; if (!p) return renderHost(); confirmSheet(p.name + " has left the party?", "They come out of the game for good. Undo brings them back.", "Remove " + p.name, () => playerLeft(id)) }
function renameGo() { const el = $("#rn"), id = renameId; renamePicker = false; renameId = null; if (el && el.value.trim() && id) renamePlayer(id, el.value); renderHost() }
function showSpoil() { spoil = true; clearTimeout(spoilT); spoilT = setTimeout(() => { spoil = false; renderHost() }, 8000); renderHost() }
function secretLine() {
  const t = cloaks(), f = candles(), shs = state.players.filter(p => p.shield && p.alive), witness = state.witness && !state.witness.used && P(state.witness.id);
  const names = state.players.filter(p => p.role === "cloak").map(p => p.name + (p.alive ? "" : " ✝")).join(", ");
  return `<div class="spoil${spoil ? " on" : ""}" role="button" tabindex="0" aria-label="Show the spoilers for eight seconds" onclick="showSpoil()" onkeydown="if(event.key==='Enter'||event.key===' ')showSpoil()"><b>Spoilers</b>${spoil ? `Forsworn: ${esc(names)}${shs.length ? " · ⛨ " + esc(shs.map(p => p.name).join(", ")) : ""}${witness ? " · Confessor: " + esc(witness.name) : ""}${championOf(state) ? " · ⚔ " + esc(P(championOf(state)).name) : ""}${state.cloakMisses ? " · Forsworn misses " + state.cloakMisses : ""}` : `<span>tap to show · ${plural(t.length, "Forsworn")} v ${plural(f.length, "Loyal")}</span>`}</div>`;
}
function secretPanel() {
  const t = cloaks(), f = candles(), shs = state.players.filter(p => p.shield && p.alive);
  return `<div class="secret">Never aloud.<br><b>Forsworn:</b> ${esc(state.players.filter(p => p.role === "cloak").map(p => p.name + (p.alive ? "" : " ✝")).join(", "))}<br><b>Alive:</b> ${plural(t.length, "Forsworn")}, ${f.length} Loyal${shs.length ? `<br><b>Sanctuary:</b> ${esc(shs.map(p => p.name + " (" + p.shield + ")").join(", "))}` : ""}</div>`;
}
function dilemmaOffer(s, cond, line) {
  if (!cond || !rulesIn(s).dilemma || isFinal(s) || s.players.some(p => p.alive && p.shield) || !dilemmaFree(s)) return "";
  return dir("Nobody holds Sanctuary tonight. " + esc(line)) + `<div class="row"><button onclick="pickMission('dilemma')">Play the Temptation now</button></div>`;
}
function questBox(s, label) { const q = s.quest; return q && !q.resolved ? `<div class="secret"><b>${esc(label)}</b> ${esc(q.text.replace(/\{F\}/g, "‹a Loyal player›"))}<div class="row"><button onclick="questResolve(true)">They did it</button><button onclick="questResolve(false)">They failed (Purse −${money(50)})</button></div></div>` : "" }
function advicePanel() {
  const a = advice(), pc = pace();
  const pt = pc ? ` ${Math.floor(pc.el / 60)}h${String(Math.floor(pc.el % 60)).padStart(2, "0")} gone of ${pc.target / 60}h, about ${Math.round(pc.perRound)} minutes a round, ${pc.label}${pc.diff > 25 ? ": one Trial a round from here." : pc.diff < -30 ? ": add a Trial this round." : "."}` : "";
  return dir(esc(a.text) + esc(pt), a.lvl === "end" ? "end" : "") + (a.lvl === "final" && !state.finalRound && state.phase === "day" ? `<div class="row"><button onclick="declareFinal()">${(state.roundMissions || 0) ? "Make the next round the final" : "Make this round the final"}</button></div>` : "");
}
// the prize is named here and on the TV's last screen, nowhere earlier; two or more winners play it off
function prizeHost(s) {
  if (!s.prizeTo) return `<p class="note">The TV shows every role.</p>`;
  const r = s.rps, w = r && r.winner && P(r.winner);
  const pot = (s.prizeIds || []).length && wonPot(s) ? say(SAY.potSplit(money(wonPot(s)), (s.prizeIds || []).map(id => P(id)).filter(Boolean).map(p => p.name), money(s.potEach || 0))) : "";
  if (!r && coinsOf(s) === 0 && s.winner === "cloaks") return say("And now, the prize. The Loyal filled the Purse to the brim, so there is nothing left for the Forsworn to take. " + s.prizeTo + " win the glory, and only the glory.") + pot + dir("Nothing to hand over. The TV shows the Purse and every role.");
  if (!r) return say(SAY.prize(prizeName(s), s.prizeTo)) + pot + dir("Hand it over. The TV shows the prize, the Purse and every role.");
  const names = andList(r.ids.map(id => P(id)).filter(Boolean).map(p => p.name));
  return pot + say(SAY.prizeRps(prizeOf(s), names)) + (w ? say(SAY.prizeHome(w.name, prizeOf(s))) + dir("On the TV now. Wrong name? Undo.")
    : `<h3>Rock, paper, scissors: who won?</h3><p class="note">Pair them off, knockout, until one is left. Tap the winner and the TV announces them.</p><div class="plist">${r.ids.map(id => P(id)).filter(Boolean).map(p => pbtn(p, "", "rpsWin('" + p.id + "')")).join("")}</div>`);
}
function ghostPanel(s) {
  const ghosts = ghostsOf(s); if (!ghosts.length) return "";
  // Ghosts who died Forsworn know their partners: they don't judge
  const g = s.ghosts || {}, judges = ghosts.filter(gh => gh.role !== "cloak"), pending = judges.filter(gh => !g[gh.id]), anyDone = judges.some(gh => g[gh.id]);
  return `<h3>The Ghosts’ verdict</h3>${pending.length ? say(anyDone ? SAY.ghostsAgain : SAY.ghosts) : ""}${ghosts.map(gh => `<div class="vote"><span>${ART.seal(gh)}${esc(gh.name)}</span>${gh.role === "cloak" ? `<b style="color:var(--mist);padding-right:4px">Forsworn, no verdict</b>` : g[gh.id] ? `<b style="color:var(--mist);padding-right:4px">locked</b>` : `<button class="wide" onclick="handoff={kind:'ghost',id:'${gh.id}'};renderHost()">Hand over the phone</button>`}</div>`).join("")}${dir("One verdict per Ghost, ever, scored at the end.")}`;
}
function handoffScreen(s) {
  if (!handoff) return "";
  if (handoff.kind === "return") return `<div class="sheet mid"><h2>Thank you. Hand the phone back to ${esc(H())}</h2><button class="primary hold" onpointerdown="backStart(event)" onclick="backClick(event)" oncontextmenu="return false">${esc(H())}: I have it<small>press and hold</small></button></div>`;
  const p = P(handoff.id); if (!p) { handoff = null; return "" }
  // an undo (or the other phone) can move the game out from under a handed-over phone
  const need = { take: "final2", endvote: "endvote" }[handoff.kind];
  if ((need && (s.phase !== need || !s[need])) || (handoff.kind === "ghost" && p.alive)) { handoff = null; return "" }
  if (handoff.kind === "ghost") return `<div class="sheet" style="text-align:center"><h2>${esc(p.name)}, who is a Forsworn?</h2><p class="note">Your one verdict as a Ghost. It locks, and nobody else sees it.</p><div class="plist">${alive().map(q => pbtn(q, "", "ghostGuess('" + p.id + "','" + q.id + "')")).join("")}</div><button onclick="handoff=null;renderHost()">Cancel</button></div>`;
  if (handoff.kind === "endvote") return `<div class="sheet mid"><h2>${esc(p.name)}</h2><p class="note">Your vote, in secret. TRUST if every Forsworn is gone. DOUBT for one more Reckoning.</p><div class="row big"><button class="good" onclick="castVote('${p.id}','end')">TRUST</button><button class="danger" onclick="castVote('${p.id}','exile')">DOUBT</button></div><button class="ghost hold" onpointerdown="backStart(event)" onclick="backClick(event)" oncontextmenu="return false">Not ${esc(p.name)}? Give it back to ${esc(H())}<small>press and hold</small></button></div>`;
  if (handoff.kind === "take") return `<div class="sheet mid"><h2>${esc(p.name)}</h2><p class="note">In secret: HONOUR, or BETRAY. All honour: you split the Purse, and play rock, paper, scissors for the prize. One betrays: they take the Purse and the prize. Two or more betray: nobody here gets either.</p><div class="row big"><button class="good" onclick="castTake('${p.id}','share')">HONOUR</button><button class="danger" onclick="castTake('${p.id}','take')">BETRAY</button></div><button class="ghost hold" onpointerdown="backStart(event)" onclick="backClick(event)" oncontextmenu="return false">Not ${esc(p.name)}? Give it back to ${esc(H())}<small>press and hold</small></button></div>`;
  return "";
}
// back to the host: held for most of a second, so a guest's stray tap can't open the host screen
let backT = null, backAt = 0;
function backStart(e) { clearTimeout(backT); const b = e && e.currentTarget; if (b) b.classList.add("holding"); backT = setTimeout(() => { backT = null; backAt = holdEndAt = Date.now(); handoff = null; renderHost() }, 700); const stop = () => { clearTimeout(backT); if (b) b.classList.remove("holding"); document.removeEventListener("pointerup", stop); document.removeEventListener("pointercancel", stop) }; document.addEventListener("pointerup", stop); document.addEventListener("pointercancel", stop) }
// a plain click only counts where there are no pointer events, or from a script (the test harness), never a real tap
function backClick(e) { if (!window.PointerEvent || (e && !e.isTrusted)) { handoff = null; renderHost() } }
const fil = t => String(t).replace(/\{F\}/g, "‹a Loyal player›");
// the script, one line at a time: a spoken line has "Say" in the margin (and who it's to), a silent one is all stage direction
function stepList(script, step) {
  const line = (raw, cls) => {
    const l = norm(raw), text = esc(l.say || l.tv), tv = dir("TV: " + esc(fil(l.tv)), "tv");
    if (l.silent) return `<div class="step ${cls} sil"><span class="mn"></span>${dir(text)}${tv}</div>`;
    const to = l.who === H() ? "" : `<span class="to">To ${l.who === "Everyone" ? "the table" : l.who === "Forsworn" ? "the Forsworn" : esc(l.who)}:</span>`;
    return `<div class="step ${cls}"><span class="mn">Say</span><div class="ln">${to}${cls === "cur" ? tvRead(l.say || l.tv) : ""}${text}</div>${tv}</div>`;
  };
  step = Math.min(step, script.length - 1);
  const nx = script[step + 1] && norm(script[step + 1]);
  return `<p class="cue">Line ${step + 1} of ${script.length}</p>${line(script[step], "cur")}${nx ? `<div class="then"><span class="mn">Then</span><div class="ln">${esc(fil(nx.tv))}</div></div>` : ""}<div class="row"><button class="ghost slim" onclick="fullScript=!fullScript;renderHost()">${fullScript ? "Hide the full script" : "Show the full script"}</button></div>${fullScript ? script.map((r, i) => line(r, i === step ? "cur" : "")).join("") : ""}`;
}

/* ---- the question bank: master switches for every game ---- */
function openBank() { bankOpen = true; bankQ = ""; if (remote) bankLoad(); renderHost() }
function bankSummary() { const off = BANKDEFS.reduce((a, d) => a + (bankOff[d.key] || []).length, 0), all = BANKDEFS.reduce((a, d) => a + d.items().length, 0); return off ? plural(off, "item") + " switched off" : "all " + all + " items on" }
function bankSheet() {
  const d = BANKDEFS.find(b => b.key === bankTab) || BANKDEFS[0], items = d.items(), off = bankOff[d.key] || [], q = bankQ.trim().toLowerCase();
  const show = it => /^QUIZ/.test(d.key) ? [it[0], it[1]] : d.key === "ESTIMATE" ? [it[0], Number(it[1]).toLocaleString("en-GB")] : d.key === "MEMSETS" ? [it.join(" · "), ""] : d.key === "QUESTS" ? [it.replace(/\{F\}/g, "‹a Loyal player›").replace(/\{T\}/g, "‹a Forsworn›"), ""] : [String(it), ""];
  const rows = items.map((it, i) => ({ i, t: show(it) })).filter(r => !q || (r.t[0] + " " + r.t[1]).toLowerCase().includes(q));
  const tabs = BANKDEFS.map(b => `<button class="slim ${b.key === d.key ? "sel" : ""}" onclick="bankTab='${b.key}';bankQ='';renderHost();document.querySelector('#host .sheet.bank').scrollTop=0">${esc(b.label)}<span class="cnt num">${b.items().length - (bankOff[b.key] || []).length}/${b.items().length}</span></button>`).join("");
  const where = remote ? "on the server" : db ? "with this artifact" : "on this device";
  return `<div class="sheet bank" data-k="bank"><h2>Question bank</h2><p class="note">Tap an item to switch it off. It is never drawn again, in this game or any later one, until you switch it back on. Saved ${where}${bankErr ? ", <b>but not yet: retrying</b>" : ""}.</p><div class="banktabs">${tabs}</div><input id="bankq" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search ${esc(d.label)}" value="${esc(bankQ)}" oninput="bankQ=this.value;renderHost()" aria-label="Search ${esc(d.label)}"><div class="bankbar"><span class="note">${items.length - off.length} of ${items.length} on${q ? " · " + rows.length + " shown" : ""} · at least ${d.min} must stay on</span>${off.length ? `<button class="ghost slim" onclick="bankAllOn('${d.key}')">Switch all on</button>` : ""}</div><div class="banklist">${rows.map(r => { const o = off.includes(r.i); return `<button class="bankrow ${o ? "off" : ""}" data-k="${d.key}-${r.i}" onclick="bankToggle('${d.key}',${r.i})" aria-pressed="${o ? "false" : "true"}"><span class="tick" aria-hidden="true">${o ? "" : "✓"}</span><span class="bt">${esc(r.t[0])}${r.t[1] ? `<small>${esc(r.t[1])}</small>` : ""}</span><span class="st">${o ? "off" : "on"}</span></button>` }).join("") || `<p class="note">Nothing matches “${esc(bankQ)}”.</p>`}</div><div class="foot"><button class="primary" onclick="bankOpen=false;renderHost()">Done</button></div></div>`;
}

/* ---- setup: one decision a page, each explained in full, then one page to check it all before the game starts ---- */
// Every choice has a recommendation worked out from the choices before it. Until the host picks something themselves
// (d.touched), a page follows its recommendation, so changing the table size or the evening's length re-plans the rest.
const SETUP0 = () => ({ names: "", cloaks: "", title: "The Betrayal", host: "", keeper: "me", me: "", unit: "pts", potCap: "2000", wrong: "cloaks", prize: "", prize2: "", prize3: "", hours: "4", pin: "",
  rounds: 0, perRound: 0, dinnerAfter: 1, courses: false, mingle: true, narrator: false, pool: null, ghosts: true, convert: true, bargain: true, quests: true,
  shield: "mix", blade: true, champion: true, witness: true, dilemma: true, step: "welcome", touched: [], back: null });
// A first game is Classic: the twists stay off until a game has been played to the end on this phone ("your second night").
const seasoned = () => { try { return localStorage.getItem("candle-played") === "1" } catch (e) { return false } };
const namesOf = d => d.names.split(/\n|,/).map(x => x.trim()).filter(Boolean);
const poolAll = () => MISSIONS.filter(m => !m.addon && m.key !== "custom").map(m => m.key);
const draftPool = d => Array.isArray(d.pool) ? d.pool : poolAll();
const tableOf = d => Math.max(MINP, Math.min(MAXP, namesOf(d).length || 12));
// the round-by-round shape of a plan: who is at the table at each round's start, how many are exiled, how many die that night
function simPlan(n, R) {
  const out = []; let a = n;
  for (let r = 1; r < R && a > 5; r++) {
    const t = roundTarget({ round: r, rules: { rounds: R }, players: Array.from({ length: a }, (_, i) => ({ id: "p" + i, alive: true })) });
    out.push(t); a -= t.exiles + t.kills;
  }
  return out;
}
// a rough length for the evening, in minutes: welcome and roles, each round (missions, mingle, the Reckoning, the night),
// dinner, then the final. Only ever shown as "about".
function estMins(d, n, over) {
  d = Object.assign({}, d, over || {}); n = n || tableOf(d);
  const R = +d.rounds || autoRounds(n), per = +d.perRound || (R <= 3 ? 2 : 1);
  let t = 20;
  for (const r of simPlan(n, R)) t += per * 12 + (d.mingle ? 10 : 0) + 8 + Math.round(r.start * 0.25) * r.exiles + 6;
  if (d.courses && R >= 4) t += 55; else if (+d.dinnerAfter) t += 30;
  return t + 45;
}
const HOURS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7];
const aboutH = t => { let h = Math.floor(t / 60), q = Math.round((t % 60) / 15); if (q === 4) { h++; q = 0 } return "about " + (h ? h + (["", "¼", "½", "¾"][q]) + (h === 1 && !q ? " hour" : " hours") : (q * 15) + " minutes") };
function recRounds(d, n) {
  const [lo, hi] = roundsRange(n), want = (+d.hours || 4) * 60; let best = lo, gap = 1e9;
  for (let R = lo; R <= hi; R++) { const g = Math.abs(estMins(d, n, { rounds: R }) - want); if (g < gap - 5) { best = R; gap = g } }
  return best;
}
// the recommendation for each choice, in the order the pages ask them
const RECS = [
  ["cloaks", (d, n) => String(defaults(n).t)],
  ["hours", (d, n) => { const lo = roundsRange(n)[0], t = estMins(d, n, { rounds: lo, mingle: true, courses: false, dinnerAfter: 0, perRound: 0 }) / 60; return HOURS.filter(h => h >= 2.5).reduce((a, h) => Math.abs(h - t) < Math.abs(a - t) ? h : a, 4) + "" }],
  ["mingle", d => +d.hours >= 3],
  ["courses", () => false], // dinner is the host's choice: the game never assumes a meal
  ["dinnerAfter", () => 0],
  ["rounds", (d, n) => recRounds(d, n)],
  ["perRound", d => +d.hours <= 2.5 ? 1 : 0],
  ["ghosts", () => true],
  ["shield", () => seasoned() ? "mix" : "public"],
  ["blade", () => seasoned()],
  ["champion", d => seasoned() && d.shield !== "off"],
  ["dilemma", d => seasoned() && d.shield !== "off"],
  ["witness", () => seasoned()],
  ["convert", () => seasoned()],
  ["bargain", () => seasoned()],
  ["quests", d => seasoned() && !!d.mingle],
  ["narrator", () => false],
  ["wrong", () => "cloaks"]
];
function settle(d) {
  const n = tableOf(d), t = new Set(d.touched || []);
  for (const [k, f] of RECS) if (!t.has(k)) d[k] = f(d, n);
  const [lo, hi] = roundsRange(n); d.rounds = Math.max(lo, Math.min(hi, +d.rounds || lo));
  if (d.courses && d.rounds < 4) d.courses = false;
  d.dinnerAfter = d.courses ? 0 : Math.min(+d.dinnerAfter || 0, d.rounds - 1);
  if (+d.cloaks > maxCloaks(n)) d.cloaks = String(maxCloaks(n));
  if (d.shield === "off") { d.champion = false; d.dilemma = false }
  return d;
}
const recOf = (d, k) => { const r = RECS.find(x => x[0] === k); return r ? r[1](d, tableOf(d)) : undefined };
const blades = d => { const s = { rules: { rounds: +d.rounds || 3 }, players: [] }; return { blade: onceRound(s, "blade"), champion: onceRound(s, "champion") } };
function saveDraft() { try { sessionStorage.setItem("candle-draft", JSON.stringify(setupDraft)) } catch (e) {} } // survives a reload for a new version
function draft() {
  const g = (id, k) => { const el = $("#" + id); if (el) setupDraft[k] = el.value };
  setupDraft = Object.assign(SETUP0(), setupDraft || {});
  g("names", "names"); g("title", "title"); g("hostn", "host"); g("unit", "unit"); g("potCap", "potCap"); g("prize", "prize"); g("prize2", "prize2"); g("prize3", "prize3"); g("mename", "me"); g("pinset", "pin");
  saveDraft();
  const c = $("#count"); if (c) c.innerHTML = countLine(setupDraft);
}
function countLine(d) {
  const n = namesOf(d).length;
  if (!n) return "No names yet.";
  if (n < MINP) return `<b>${n}</b> so far. The game needs at least ${MINP}.`;
  if (n > MAXP) return `<b>${n}</b>, which is ${n - MAXP} too many. The game takes ${MAXP} at most.`;
  return `<b>${n} players.</b> ${n <= 9 ? "A small, intense table where every vote matters." : n <= 16 ? "A good size for the game." : "A big table: bigger rounds, two exiles a Reckoning while more than sixteen are left, and an evening of five hours or more. It plays best with sixteen or fewer."}`;
}
function wDinner(v) { draft(); const d = setupDraft; if (v === "c") { d.courses = true; d.dinnerAfter = 0 } else { d.courses = false; d.dinnerAfter = v } d.touched = [...new Set([...d.touched, "courses", "dinnerAfter"])]; saveDraft(); renderHost() }
function wSet(k, v) { draft(); const d = setupDraft; d[k] = v; if (!d.touched.includes(k)) d.touched = [...d.touched, k]; saveDraft(); renderHost() }
function poolD(k) { draft(); const p = draftPool(setupDraft).slice(), i = p.indexOf(k); if (i >= 0) p.splice(i, 1); else p.push(k); setupDraft.pool = p.length === poolAll().length ? null : p; saveDraft(); renderHost() }
function poolPreset(which) { draft(); setupDraft.pool = which === "all" ? null : MISSIONS.filter(m => !m.addon && m.key !== "custom" && m.kind === "screen").map(m => m.key); saveDraft(); renderHost() }
// what each mission needs from the room
const NEEDS = { likely: "chalkboards", quiz: "nothing, players shout", countdown: "chalkboards", estimate: "chalkboards", memory: "chalkboards", snap: "nothing, players shout", rps: "room for everyone to stand and pair up", oneleg: "room for everyone to stand", charades: "blindfolds", hum: "blindfolds", statue: "room to stand, and Ghosts", truths: "nothing", draw: "blindfolds and one chalkboard", hilo: "room for everyone to stand", change: "nothing, players shout" };

/* the pages, in order. show: whether the page applies, given the choices so far. check: what stops Next. */
const wopt = (d, k, v, title, text) => { const on = d[k] === v, rec = recOf(d, k) === v; return `<button class="wopt ${on ? "sel" : ""}" aria-pressed="${on}" onclick="wSet('${k}',${JSON.stringify(v).replace(/"/g, "'")})"><span class="wt">${title}${rec ? ` <em>(we’d pick this)</em>` : ""}</span><span class="wd">${text}</span></button>` };
const why = (head, body) => `<div class="why"><b>${head}</b>${body}</div>`;
const P_ = t => `<p class="wp">${t}</p>`;
function timeline(d, n, mark) {
  const R = +d.rounds, plan = simPlan(n, R), b = blades(d), rows = [];
  plan.forEach((r, i) => {
    const bits = [plural(r.exiles, "exile"), r.kills ? plural(r.kills, "victim") + " in the night" : "no poisoning that night"];
    const extra = [d.blade && b.blade === i + 1 ? "the Casting Vote" : null, d.champion && b.champion === i + 1 ? "the Crown" : null].filter(Boolean);
    rows.push(`<li><b>Round ${i + 1}</b>: ${r.start} at the table · ${bits.join(" · ")}${extra.length ? ` · <i>${andList(extra)} on offer</i>` : ""}</li>`);
    const ci = d.courses ? courseRounds(R).indexOf(i + 1) : -1;
    if (ci >= 0) rows.push(`<li class="din"><b>${COURSES[ci].name}</b>, ${COURSES[ci].dur / 60000} minutes</li>`);
    else if (!d.courses && +d.dinnerAfter === i + 1) rows.push(`<li class="din"><b>Dinner</b>, ${mark === "dinner" ? "here" : "a 25-minute break"}</li>`);
  });
  rows.push(`<li class="fin"><b>Round ${R}, the final</b>: 5 at the table · one exile in secret leaves 4 · then the vote to end it</li>`);
  return `<ol class="tline">${rows.join("")}</ol>`;
}
const WIZ = [
  { id: "welcome", core: true, sec: "Welcome", title: () => "Let’s plan your game", body: d => `
${P_("Four questions, then you’re ready: who’s playing, how long you have, the prize, and who keeps the game.")}
${P_("Everything else is planned for you from your answers, and the last page shows the whole game so you can change any of it. Nothing reaches the TV until you press <b>Start game</b>.")}
${ROOM ? `<div class="roombox"><b>Your Table: ${esc(ROOM)}</b>On the laptop you’ll show on the TV, open <b>${esc(location.host)}/t/${esc(ROOM)}</b>. Keep this phone on <b>${esc(location.host)}/t/${esc(ROOM)}#keeper</b> and bookmark it.${roomInfo ? "<br>Your Table is open until " + esc(until(roomInfo.expires)) + "." : ""}</div>` : ""}
${why("Before your guests arrive", `<ul><li>The TV showing the Table link above, from a laptop plugged in or cast to it. Turn the volume up: the game has music and sound effects.</li><li>This phone charged, with auto-lock set long or off. You’ll be tapping it all evening.</li><li>A small chalkboard and chalk (or a whiteboard and pen) for every guest. They write names on it to vote, and answers in the Trials.</li><li>A blindfold for every guest. Sleep masks are perfect. The Forsworn are chosen, and do their work, while everyone else can’t see.</li><li>A prize. Something worth lying to your friends for.</li></ul>`)}
${why("What the Keeper does", "The Keeper runs the game like a presenter and doesn’t play: the phone shows them who the Forsworn are from the start, and gives them every line to read out, one tap at a time. The TV shows everyone else what they need to see. Want to play yourself? A friend can keep: that’s question four.")}` },
  { id: "names", core: true, sec: "The table", title: () => "Who’s playing?", check: d => { const names = namesOf(d), long = names.find(x => x.length > NAMEMAX); return names.length < MINP ? "The game needs at least " + MINP + " players." : names.length > MAXP ? MAXP + " players at most." : long ? "“" + long + "” is too long for the TV. Use " + NAMEMAX + " characters at most." : new Set(names.map(x => x.toLowerCase())).size !== names.length ? "Two players have the same name. Add an initial so they’re different." : "" }, body: d => `
${P_("Type every player’s name, one per line, <b>in the order they’re sitting, going clockwise round the table</b>. Leave out the Keeper: they don’t play. If a friend is keeping so that you can play, put yourself in, in your seat.")}
<label for="names">Players (${MINP} to ${MAXP})</label><textarea id="names" rows="10" oninput="draft()" placeholder="Annie&#10;Ben&#10;Chloe&#10;…">${esc(d.names)}</textarea>
<p class="note" id="count">${countLine(d)}</p>
${why("Why seating order matters", "The TV shows everyone’s candle in this order, and at every vote the chalkboards are turned one at a time in this order. When the order matches the table, everyone can follow who wrote what.")}
${why("Names", "Keep them short: first names or nicknames up to " + NAMEMAX + " characters. Every name must be different, so two Sams become Sam B and Sam K. If someone’s spelling is wrong on the night, you can fix it from the Menu. If someone has to go home early, the Menu takes them out of the game.")}` },
  { id: "hours", core: true, sec: "The evening", title: () => "How long is your evening?", body: d => { const n = tableOf(d); return `
${P_("Tell us roughly how long you want the game to last, from sitting down to the final reveal. We use it to plan the rounds, the Trials and when to eat.")}
<div class="wopts">${[["2", "Short game · " + aboutH(estMins(d, n, { rounds: roundsRange(n)[0], perRound: 1, mingle: false, dinnerAfter: 0, courses: false })), "One Trial a round, no Interval and no dinner break: the quickest the game can run for " + n + " players. Best for a weeknight, or eating before you play."], ["2.5", "2½ hours", "Short and sharp. Fewer rounds, so more players leave each round. Best for a weeknight."], ["3", "3 hours", "A full game, quick pace."], ["3.5", "3½ hours", "Room to breathe, and time to talk."], ["4", "4 hours", "The classic evening: long Reckonings, and room for dinner if you’re eating."], ["4.5", "4½ hours", "A long night, with slower rounds and more Trials. Good for 18 or more players."], ["5", "5 hours", "The full feast. Plenty of Trials, and a long, slow build to the end."], ["6", "6 hours", "A big table’s evening: twenty or more players need more rounds to reach the final."], ["7", "7 hours", "An all-nighter for a big table, every round at an easy pace."]].map(([v, t, x]) => wopt(d, "hours", v, t, x)).join("")}</div>
${why("This isn’t a hard stop", `Nothing cuts the game off. While you play, the phone keeps an eye on the clock. When Trials are set “by the clock” (you’ll see that later), it adds a second Trial to a round when you’re ahead of time and skips it when you’re behind. `)}
${why("For " + n + " players", "With our recommended settings, a game for " + n + " takes " + aboutH(estMins(settle(Object.assign({}, d, { touched: [] })), n)) + ". Bigger tables need more rounds to reach the final, so they run longer.")}` } },
  { id: "prize", core: true, sec: "The prize", title: () => "What’s the prize?", body: d => `
${P_("The prize goes to the winners at the end: the Loyal if they exiled every Forsworn, or the Forsworn if they survived. Choose something people will scheme for.")}
${P_("The Purse goes with it. The Loyal take what they built. The Forsworn take what it <b>fell short</b> of its target, so every point they sabotage is theirs.")}
<label for="prize">The prize</label><input id="prize" value="${esc(d.prize)}" placeholder="${esc(PRIZE0)}" oninput="draft()">
<h3>make the Purse matter <small>(optional)</small></h3>
${P_("The Trials fill a shared <b>Purse</b>. Give the table something to fill it for: a better prize if it ends at least half full, the best if it’s full. If the Forsworn win, it works the other way: half empty wins them the better prize, empty the best. The table hears only that the Purse decides the prize, never what the prizes are.")}
<label for="prize2">A better prize, if the Purse is half full</label><input id="prize2" value="${esc(d.prize2)}" placeholder="e.g. the posh chocolates, not the usual ones" oninput="draft()">
<label for="prize3">The best prize, if the Purse is full</label><input id="prize3" value="${esc(d.prize3)}" placeholder="e.g. a night out, paid for by the losers" oninput="draft()">
${why("It stays secret", "Nothing names the prize, not the TV and not your script, until the game is won. Tell your guests yourself if you want them to know. If two or more people win, the game has them play rock, paper, scissors for it.")}
${why("If you leave it blank", "The game uses " + PRIZE0 + ": every 100 points in the Purse is one chocolate coin, so a Purse of 1500 wins 15 coins.")}` },
  { id: "keeper", core: true, sec: "The Keeper", title: () => "Who’s keeping tonight?", check: d => { if (d.keeper !== "friend") return ""; const me = d.me.trim().toLowerCase(), k = d.host.trim().toLowerCase(), names = namesOf(d).map(x => x.toLowerCase()); return !k ? "Type your Keeper’s name." : !me ? "Type your own name, as it is in the players." : !names.includes(me) ? "“" + d.me.trim() + "” isn’t in the players yet. Go back and add yourself, in your seat." : names.includes(k) ? d.host.trim() + " is in the players, but the Keeper can’t play. Take them out on the players page." : "" }, body: d => `
${P_("The <b>Keeper</b> runs the game like a presenter. They know who the Forsworn are from the start, so they don’t play.")}
<div class="wopts">${wopt(d, "keeper", "me", "I’ll keep", "You run the game from this phone: every line to read and every secret, one tap at a time. The easiest way, and a lot of fun in its own right.")}${wopt(d, "keeper", "friend", "A friend will keep, and I’ll play", "You plan the game now, then hand this phone to your Keeper before anyone sits down. They press Start, so the roles are dealt on their watch and you never see them.")}</div>
${d.keeper === "friend" ? `<label for="hostn">Your Keeper’s name</label><input id="hostn" value="${esc(d.host)}" placeholder="e.g. Sam" oninput="draft()" autocomplete="off"><label for="mename">Your name, as it is in the players</label><input id="mename" value="${esc(d.me)}" oninput="draft()" autocomplete="off">` : `<label for="hostn">Your name <small>(optional)</small></label><input id="hostn" value="${esc(d.host)}" placeholder="e.g. Sam" oninput="draft()" autocomplete="off">`}
${why("Their name on the night", "The TV and the script mention the Keeper by name. For example, when a player can’t act out a word, the TV tells them to ask the Keeper to skip it. Leave it blank and the game says “the Keeper”.")}` },
  { id: "pin", core: true, sec: "The Keeper", title: () => "Choose a Keeper PIN", check: d => !d.pin.trim() ? "Choose a PIN. It keeps the Forsworn’s names off anyone else’s phone." : !/^\d{4,8}$/.test(d.pin.trim()) ? "Use 4 to 8 digits. The unlock screen shows a number pad, so letters couldn’t be typed there." : "", body: d => `
${P_("The PIN guards this screen, which shows who the Forsworn are and controls the game.")}
<label for="pinset">Keeper PIN</label><input id="pinset" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" value="${esc(d.pin)}" oninput="draft()" placeholder="4 to 8 digits, e.g. 4821">
${why("When you’ll need it", "If this phone’s battery dies, or you switch to another phone, open the Keeper link on the new phone and type the PIN. The game carries on exactly where you left off. Without the PIN, nobody else can open the Keeper screen, even with the link.")}
${d.keeper === "friend" ? why("Handing over", "Your Keeper sees this PIN when you hand the phone over, and can change it then.") : ""}
${why("Pick something private", "Not your bank PIN, and not something your guests would guess. Anyone who has it can see every secret in the game. Write it down somewhere your guests won’t see.")}` },
  { id: "review", core: true, sec: "Ready", title: d => d.keeper === "friend" ? "Your game is ready to hand over" : "Your game is ready", body: d => { const n = tableOf(d), names = namesOf(d), sh = { mix: "Sanctuaries: mixed, some public and some hidden", public: "Sanctuaries: won openly", secret: "Sanctuaries: hidden wherever possible", off: "No Sanctuaries" }[d.shield], pool = draftPool(d).filter(k => k !== "statue" || d.ghosts);
    const line = (id, head, text) => `<button class="rv" onclick="wGo('${id}',true)"><span><b>${head}</b>${text}</span><span class="ch">Change</span></button>`;
    const tw = [d.blade, d.champion, d.dilemma, d.witness, d.convert, d.bargain, d.quests, d.shield === "mix" || d.shield === "secret"].filter(Boolean).length, pz = [d.prize2, d.prize3].filter(x => x.trim()).length;
    return `${P_("Here’s your whole game, planned from your answers. Tap any line to change it. When it’s right, " + (d.keeper === "friend" ? "hand the phone to " + esc(d.host.trim() || "your Keeper") + ": they press <b>Start game</b>, and the roles are dealt at random." : "press <b>Start game</b>: the roles are dealt at random, and the TV is ready for your guests."))}
${!seasoned() && !tw ? `<p class="aside">First game? We’ve kept the twists off, so everyone learns the game itself: the Trials, Sanctuary, the Reckoning, the night and the Ghosts. Switch any twist on below, or save them for your second night.</p>` : seasoned() && tw ? `<p class="aside">You’ve played before, so the twists are on. Tap any of them to see what it does.</p>`
 : ""}
<div class="row"><button class="slim" onclick="wGo('${moreSteps(d)[0].id}')">Go through every choice, page by page</button></div>
<h3>the table</h3>${line("names", names.length + " players", esc(names.join(", ")))}${line("keeper", d.keeper === "friend" ? "Kept by " + esc(d.host.trim() || "a friend") : "You keep", d.keeper === "friend" ? esc(d.me.trim()) + " plays" : esc(d.host.trim() ? d.host.trim() + " · doesn’t play" : "you run it and don’t play"))}${line("pin", "Keeper PIN", "set (" + d.pin.trim().length + " digits)")}${line("cloaks", plural(+d.cloaks, "Forsworn"), +d.cloaks === defaults(n).t ? "recommended for " + n : "we suggest " + defaults(n).t + " for " + n)}
<h3>the evening</h3>${line("hours", +d.hours === 2 ? "Short game" : d.hours + " hours", "the target length · " + aboutH(estMins(d, n)))}${line("rounds", d.rounds + " rounds", "the last is the final")}${line("perRound", ["Trials by the clock", "One Trial a round", "Two Trials a round"][+d.perRound], "")}${line("dinner", d.courses ? "Dinner in three courses" : +d.dinnerAfter ? "Dinner after round " + d.dinnerAfter : "No dinner break", d.courses ? "starter, main course and dessert, between the rounds" : "")}${line("mingle", d.mingle ? "An Interval before each vote" : "No Interval", d.mingle ? "10 minutes" : "")}${line("narrator", d.narrator ? "The TV reads the lines" : "The Keeper reads the lines", "")}
<h3>the night and the Trials</h3>${line("ghosts", d.ghosts ? "Ghosts on" : "No Ghosts", d.ghosts ? "the dead stay in the game" : "the dead are out")}${line("pool", pool.length + " of " + poolAll().length + " Trials", pool.length === poolAll().length ? "all of them" : esc(andList(pool.map(k => (MISSIONS.find(m => m.key === k) || {}).title))))}
<h3>powers and twists</h3>${line("shield", sh, "the only power every round")}${line("blade", d.blade ? "The Casting Vote: once, round " + blades(d).blade : "No Casting Vote", d.blade ? "breaks a tie" : "")}${d.shield !== "off" ? line("champion", d.champion ? "The Crown: once, round " + blades(d).champion : "No Crown", "") + line("dilemma", d.dilemma ? "The Temptation: once, if nobody holds Sanctuary" : "No Temptation", "") : ""}${line("witness", d.witness ? "The Confessor: in the final, if one Forsworn is left" : "No Confessor", "")}${line("convert", d.convert ? "One Whisper" : "No Whisper", "")}${line("bargain", d.bargain ? "One Last Offer" : "No Last Offer", "")}${line("quests", d.quests ? "Errands for the Forsworn" : "No Errands", "")}
<h3>the Purse and prize</h3>${line("prize", "Prize", esc(d.prize.trim() || PRIZE0) + (d.prize.trim() && d.prize.trim() !== PRIZE0 ? "" : ", one for every 100 points") + (pz ? " · " + (pz === 2 ? "two better prizes" : "a better prize") + " for a fuller Purse" : ""))}${line("pot", "Purse target " + moneyOf({ potUnit: d.unit || "pts" }, d.potCap || 2000), "")}${line("wrong", d.wrong === "all" ? "Everyone’s wrong answers cost the Purse" : "Only the Forsworn’s wrong answers cost the Purse", "")}${line("title", "TV title", esc(d.title.trim() || "The Betrayal"))}
${why("How the evening runs", timeline(d, n))}` } },
  { id: "cloaks", sec: "The table", title: () => "How many Forsworn?", body: d => { const n = tableOf(d), rec = defaults(n).t, opts = [...new Set([rec - 1, rec, rec + 1])].filter(x => x >= 1 && x <= maxCloaks(n)); return `
${P_(`The Forsworn are the secret poisoners. They’re chosen at random when the game starts, they learn who each other are, and every night they choose who to poison. Everyone else is one of the <b>Loyal</b>, and the Loyal win by exiling every Forsworn before the end.`)}
<div class="wopts">${opts.map(c => wopt(d, "cloaks", String(c), plural(c, "Forsworn") + " among " + n, c === rec ? `About one player in ${Math.round(n / c)}. The balance we’ve tested most for ${n} players: the Forsworn have allies, and the Loyal have a fair chance of finding them.` : c < rec ? `About one in ${Math.round(n / c)}. Easier for the Loyal: ${c === 1 ? "a single Forsworn is on their own all game, with nobody to plot with, and one good guess ends it early." : "fewer Forsworn, fewer allies, and each exile is more likely to hit."}` : `About one in ${Math.round(n / c)}. Harder for the Loyal: more suspects, more votes pulling the wrong way, and a real chance the Forsworn take the table.`)).join("")}</div>
${why("Nobody finds out how many Forsworn there are", "Not even the players: the TV never says. People only find out as the Forsworn are exiled and revealed.")}` } },
  { id: "rounds", sec: "The evening", title: () => "How many rounds?", body: d => { const n = tableOf(d), [lo, hi] = roundsRange(n), vals = []; for (let r = lo; r <= hi; r++) vals.push(r); return `
${P_("A <b>round</b> is one Trial (or two), then the <b>Reckoning</b>, where everyone votes someone out. That player is <b>exiled</b> and their role is revealed. Then comes the <b>night</b>, when the Forsworn kill. The last round is <b>the final</b>.")}
${P_(`Whatever you choose, the final starts with <b>five players left</b>. The game works out how many leave each round to get there. With fewer rounds, more players leave each round. With more rounds, it’s gentler and longer. For ${n} players you can play ${lo === hi ? "exactly " + lo : lo + " to " + hi} rounds.`)}
<div class="wopts">${vals.map(R => { const pl = simPlan(n, R), path = [n, ...pl.map(r => r.start - r.exiles - r.kills)].join(" → "); return wopt(d, "rounds", R, R + " rounds · " + aboutH(estMins(d, n, { rounds: R })), `Players left after each round: ${path}. ${lo === hi ? "The only length that works for " + n + " players, so there’s nothing to choose here: this page shows you how the evening will unfold." : R === lo ? "Every round at full stretch: the most drama per round, the shortest game." : R === hi ? "One exile and one victim a round: the slowest, most thoughtful game." : "In between."}`) }).join("")}</div>
${why("Your rounds, one by one", timeline(d, n))}
${why("What’s a victim?", "Each night the Forsworn choose who to poison. At a bigger table they choose two or three, so the game still reaches five in time. A player holding Sanctuary can’t be killed.")}` } },
  { id: "perRound", sec: "The evening", title: () => "Trials each round", body: d => { const n = tableOf(d); return `
${P_("Trials are the party games: quizzes, guessing games, charades and more. Every Trial fills the Purse, and most hand out <b>Sanctuary</b>. Each Trial takes about ten to fifteen minutes. Winning isn’t the only point: people watch who seems to be playing badly on purpose.")}
<div class="wopts">${wopt(d, "perRound", 0, "By the clock · " + aboutH(estMins(d, n, { perRound: 0 })), "One Trial a round, and a second when the evening is running ahead of time. The phone tells you which. It’s the easiest way to finish on time.")}${wopt(d, "perRound", 1, "One a round · " + aboutH(estMins(d, n, { perRound: 1 })), "A faster game. More time talking and voting, less time playing.")}${wopt(d, "perRound", 2, "Two a round · " + aboutH(estMins(d, n, { perRound: 2 })), "A longer game with a bigger Purse and more Sanctuaries. More chances to spot who’s sabotaging.")}</div>
${why("Times are estimates", `They cover the whole evening for ${n} players and ${+d.rounds} rounds, including dinner if you have it. Groups that talk a lot at the Reckoning run longer.`)}` } },
  { id: "dinner", sec: "The evening", title: () => "Are you eating as you play?", body: d => { const n = tableOf(d), R = +d.rounds, at = courseRounds(R), opts = [[0, "No dinner break", "Drinks and snacks, or eating before or after. The game won’t stop for food."]]; for (let r = 1; r < R; r++) opts.push([r, "After round " + r, r === 1 ? "Early: the first victim is still fresh news, and everyone eats with their first suspicions." : r === R - 1 ? "Late: just before the final. People who’ve been exiled get to eat with the survivors, but a hungry table can drag." : "Mid-game: " + (R - 1 - r) + " round" + (R - 1 - r === 1 ? "" : "s") + " left before the final. Enough has happened to argue about over food."]); return `
${P_("Dinner pauses the game: nobody is exiled or poisoned while you eat, and the TV shows a timer you can stretch on the night. It isn’t dead time. Food is where suspicions grow, alliances form and the Forsworn work hardest to seem friendly.")}
<div class="wopts">${R >= 4 ? `<button class="wopt ${d.courses ? "sel" : ""}" aria-pressed="${!!d.courses}" onclick="wDinner('c')"><span class="wt">Three courses, between the rounds${recOf(d, "courses") ? " <em>(we’d pick this)</em>" : ""}</span><span class="wd">The starter after round ${at[0]} (15 minutes), the main course after round ${at[1]} (25), and dessert after round ${at[2]}, just before the final (15). The evening is built around the meal.</span></button>` : ""}${opts.map(([v, t, x]) => { const on = !d.courses && +d.dinnerAfter === v; return `<button class="wopt ${on ? "sel" : ""}" aria-pressed="${on}" onclick="wDinner(${v})"><span class="wt">${v ? t + " · one 25-minute break" : t}${!recOf(d, "courses") && recOf(d, "dinnerAfter") === v ? " <em>(we’d pick this)</em>" : ""}</span><span class="wd">${x}</span></button>` }).join("")}</div>
${d.courses || +d.dinnerAfter ? why("Where dinner falls", timeline(d, n, "dinner")) : ""}
${why("On the night", "When a course is due, the phone offers two buttons: serve it <b>now</b>, or <b>Not yet</b> if the food isn’t ready. With Not yet, it comes up again at the next morning.")}` } },
  { id: "mingle", sec: "The evening", title: () => "An Interval before each vote?", body: d => `
${P_("After a round’s Trials and before the Reckoning, everyone can get up from the table for <b>ten minutes</b>. They talk in corners, compare notes, make deals and point fingers. The TV shows a countdown.")}
<div class="wopts">${wopt(d, "mingle", true, "Yes, an Interval before each Reckoning", "Adds about ten minutes to every round. It’s where most of the game happens: private chats, accusations, and Forsworn steering the vote. The Forsworn’s Errands (later) happen here too.")}${wopt(d, "mingle", false, "No, go straight to the vote", "A quicker game that stays at the table. Good for a short evening, a small room, or a group that talks plenty while seated. You can still start an Interval on the night if the table needs one.")}</div>` },
  { id: "narrator", sec: "The evening", title: () => "Should the TV read your lines?", body: d => `
${P_("Every step of the game comes with a line for the Keeper to read aloud. The TV can read them instead, in a spoken voice, when the Keeper taps <b>▶ TV</b> beside a line.")}
<div class="wopts">${wopt(d, "narrator", false, "No, the Keeper reads them", "The best atmosphere: a real voice, with its own timing and a straight face. Nothing to set up.")}${wopt(d, "narrator", true, "Yes, the TV reads them", "Handy for a Keeper who’s busy with the food, or would rather not perform. Each line gets a <b>▶ TV</b> button, and the Menu switches it on or off during the game.")}</div>
${why("The voice", "It’s the voice built into the TV’s browser, so it varies from one device to another. Most laptops have a good British English voice. Turn the volume up, and try it in the lobby before your guests arrive.")}` },
  { id: "ghosts", sec: "The night", title: () => "Do the dead stay in the game?", body: d => `
${P_("Players leave the game when they’re exiled or poisoned. This choice decides whether they’re still part of it.")}
<div class="wopts">${wopt(d, "ghosts", true, "Yes: they become Ghosts", "The dead stay at the party. They watch, they can’t vote or talk at the table, and they wear blindfolds with everyone else. Each Ghost who died Loyal names who they think is a Forsworn, once and in secret. At the end, the Ghosts who guessed right can steal the prize if the living get greedy. Some Trials use the Ghosts too. Nobody spends the evening bored.")}${wopt(d, "ghosts", false, "No: once you’re out, you’re out", "Simpler. Choose this if people will leave early or go home, or if you don’t want to manage a second group. The Statue Trial is switched off, because it needs Ghosts.")}</div>` },
  { id: "pool", sec: "Trials", title: () => "Which Trials can your room play?", check: d => !draftPool(d).filter(k => k !== "statue" || d.ghosts).length ? "Switch at least one Trial on." : "", body: d => { const pool = draftPool(d); return `
${P_("Switch off anything that won’t work in your space or with your guests. The game plays the rest in a random order, and never repeats one until it has used them all. Most Likely To always comes first as an icebreaker. The blindfold games come later, when the Ghosts can join in. On the night, you can swap any Trial for another.")}
<div class="row wrap"><button class="slim" onclick="poolPreset('all')">Switch all on</button><button class="slim" onclick="poolPreset('screen')">Only games played at the table</button></div>
<div class="mpool">${MISSIONS.filter(m => !m.addon && m.key !== "custom").map(m => { const on = pool.includes(m.key), off = m.key === "statue" && !d.ghosts; return `<button class="wopt ${on && !off ? "sel" : ""}" aria-pressed="${on && !off}" onclick="poolD('${m.key}')" ${off ? "disabled" : ""}><span class="tk" aria-hidden="true">${on && !off ? "✓" : ""}</span><span class="wt">${esc(m.title)}</span><span class="wd">${esc(defRules(m))}</span><span class="wn">Needs: ${esc(NEEDS[m.key] || "nothing")}${off ? " · off because Ghosts are off" : ""}</span></button>` }).join("")}</div>
<p class="note">${pool.filter(k => k !== "statue" || d.ghosts).length} of ${poolAll().length} switched on.</p>` } },
  { id: "shield", sec: "Powers", title: () => "Sanctuaries", body: d => { const n = tableOf(d); return `
${P_("A <b>Sanctuary</b> protects the player holding it from that night’s poison. Sanctuaries are the prize in most Trials, and the only prize that comes round every round. They last one night. At most a quarter of the table (" + Math.max(1, Math.floor(n / 4)) + " of " + n + ") can hold one at the same time.")}
<div class="wopts">${wopt(d, "shield", "mix", "Mixed: some public, some hidden", "In games played in rounds (the quiz, Closest Guess, Longest Word and others), one secret round hides Sanctuary. Whoever wins that round gets it without anyone knowing, and you tap them on the shoulder later under blindfold. In other games, the overall winner gets it in front of everyone. The best of both.")}${wopt(d, "shield", "public", "Always public", "The Trial winner gets Sanctuary and the TV names them. Simple to follow. The Forsworn know who is safe and choose someone else.")}${wopt(d, "shield", "secret", "Hidden wherever possible", "More paranoia: nobody knows who is safe. If the Forsworn poison someone and Sanctuary holds, the table only learns that nobody died.")}${wopt(d, "shield", "off", "No Sanctuaries", "Every night someone is poisoned, no matter what. The Trials only fill the Purse, and the Crown and the Temptation are switched off because they need Sanctuaries.")}</div>
${why("Why hide Sanctuary?", "A hidden Sanctuary lets a player bluff: nobody knows they’re safe. And when a poisoning fails, nobody knows why. If a Forsworn wins a hidden Sanctuary it does nothing, because Forsworn can’t be killed. Nobody is told.")}` } },
  { id: "blade", sec: "Powers", title: () => "The Casting Vote", body: d => { const b = blades(d); return `
${P_("The <b>Casting Vote</b> breaks a tie at one Reckoning. Every board counts once as it turns. If the last board leaves two or more players level at the top, and the Casting Vote’s holder chalked one of them, that one is exiled. It’s on offer <b>once in the whole game</b>, in a Trial in round " + b.blade + " of " + d.rounds + ". If nobody wins it, the next Trial offers it again.")}
<div class="wopts">${wopt(d, "blade", true, "Yes, one Casting Vote in the game", "A tie is where the table is most divided, and one board decides it. If it’s won in secret, the TV shows which way it broke the tie, but never whose it was. That gives the table something new to argue about.")}${wopt(d, "blade", false, "No Casting Vote", "Every vote counts once, all game, and a tie always goes to a revote. Simpler to explain.")}</div>` } },
  { id: "champion", sec: "Powers", show: d => d.shield !== "off", title: () => "The Crown", body: d => { const b = blades(d); return `
${P_("The <b>Crown</b> holds Sanctuary and the Casting Vote together, for one round. They can’t be poisoned that night, and if the Reckoning ties, their board decides it. They also have a way out: before the first board is turned at the Reckoning, the Crown can <b>lay both down</b>. Then nobody can vote them out that round, but they lose Sanctuary for the night and the tie-break with it.")}
${P_("There is <b>one Crown in the whole game</b>, won in a Trial in round " + b.champion + " of " + d.rounds + ", late enough to matter. It can be won openly or in a secret round.")}
<div class="wopts">${wopt(d, "champion", true, "Yes, one Crown", "One big moment in the second half. The table has to decide whether to target the Crown, and the Crown has to decide whether to save themselves or keep the power.")}${wopt(d, "champion", false, "No Crown", "Sanctuaries and the Casting Vote stay separate. One less thing to explain.")}</div>` } },
  { id: "dilemma", sec: "Powers", show: d => d.shield !== "off", title: () => "The Temptation", body: d => `
${P_("The <b>Temptation</b> is a quick bonus game, offered <b>once in the whole game</b>, after a Trial, at a moment when nobody at the table holds Sanctuary. Each player secretly writes <b>PURSE</b> (for the table) or <b>SELF</b> (for themselves) on their chalkboard, face down.")}
${P_("If exactly one person writes SELF, they get Sanctuary (in public) and the Purse grows. If nobody does, the Purse grows by double. If two or more reach for it, nobody gets Sanctuary and the Purse <b>loses</b> points. It tests greed and trust: who takes Sanctuary for themselves?")}
<div class="wopts">${wopt(d, "dilemma", true, "Yes, offer it once", "The phone suggests it at the right moment. You can still skip it on the night.")}${wopt(d, "dilemma", false, "No Temptation", "The game never offers it.")}</div>` },
  { id: "witness", sec: "Powers", title: () => "The Confessor", body: d => `
${P_("The <b>Confessor</b> can only appear in the final, and only if <b>exactly one Forsworn is among the last five</b>. The Trial played with five left then offers “a special prize”, and the TV doesn’t say what it is. While everyone else is blindfolded, the winner and the last Forsworn take their blindfolds off and look at each other for thirty seconds. A Loyal player Confessor now <b>knows who the Forsworn is</b>, and the Forsworn can’t poison them. Then the Confessor has to convince the others at the last votes.")}
<div class="wopts">${wopt(d, "witness", true, "Yes, if the final allows it", "A dramatic twist when the end is close. If the conditions never happen (two or more Forsworn in the final), nothing changes.")}${wopt(d, "witness", false, "No Confessor", "The final plays with no special prize.")}</div>
${why("If a Forsworn wins it", "The ceremony still happens for show, so nobody can tell. The Forsworn just meets nobody.")}` },
  { id: "convert", sec: "Twists", title: () => "Whisper", body: d => `
${P_("When the Forsworn are down to <b>one</b> and there are still four or more Loyal players, a lone Forsworn can’t win by poisoning alone. On that night the Forsworn can recruit instead of kill: they choose a Loyal player and <b>invite them to become a Forsworn</b>.")}
${P_("The invited player decides in secret. If they accept, they become a Forsworn and now work with the other. If they refuse, they stay Loyal, and the Forsworn knows who turned them down. Either way, the table only hears that nobody died that night. It happens <b>at most once a game</b>.")}
<div class="wopts">${wopt(d, "convert", true, "Yes, allow one Whisper", "Stops the game fizzling out once most of the Forsworn have been exiled. The phone sets it up for you when the time comes.")}${wopt(d, "convert", false, "No Whispers", "Roles never change. A lone Forsworn has to survive on their own.")}</div>` },
  { id: "bargain", sec: "Twists", title: () => "The Last Offer", body: d => `
${P_(d.convert ? "The <b>Last Offer</b> is the harsher version. It comes on a later night if a Forsworn is on their own again, usually because the Whisper was refused. The Forsworn chooses a Loyal player and gives them a choice: <b>join or die</b>." : "The <b>Last Offer</b> is a harsher recruitment. When the Forsworn are down to one and four or more Loyal players are left, the Forsworn chooses a Loyal player and gives them a choice: <b>join or die</b>.")}
${P_("If they accept, they become a Forsworn. If they refuse, they die on the spot, unless they hold Sanctuary. It happens <b>at most once a game</b>.")}
<div class="wopts">${wopt(d, "bargain", true, "Yes, allow one Last Offer", d.convert ? "A second chance for a lone Forsworn, and one of the hardest decisions of the night for the player who’s asked." : "Gives a lone Forsworn a fighting chance.")}${wopt(d, "bargain", false, "No Last Offer", d.convert ? "Only the gentler Whisper can happen." : "A lone Forsworn is on their own until the end.")}</div>` },
  { id: "quests", sec: "Twists", title: () => "Forsworn Errands", body: d => `
${P_("Each night the Forsworn can get a <b>secret Errand</b> to complete at the next break. For example: “Get Annie to say the word ‘castle’ out loud,” or “Swap seats with Ben before the Reckoning and make it look like Ben’s idea.”")}
${P_("A completed Errand counts for the Forsworn at the end. A failed one costs the Purse " + moneyOf({ potUnit: d.unit || "pts" }, 50) + ". Errands give the Forsworn something to do beyond acting innocent, and the Loyal something odd to spot.")}
<div class="wopts">${wopt(d, "quests", true, "Yes, an Errand each night", d.mingle ? "They happen during the Interval, so the Forsworn have time to pull them off." : "You chose no Interval, so the Forsworn will have to do them during Trials and dinner. That’s harder, but possible.")}${wopt(d, "quests", false, "No Errands", "The Forsworn just have to blend in. A little simpler to run.")}</div>` },
  { id: "pot", sec: "The Purse and prize", check: d => !(+d.potCap > 0) ? "Set a Purse target." : "", title: () => "The Purse", body: d => `
${P_("Trials fill a shared <b>Purse</b>. At the end, the winners split it: the Loyal take what they built, the Forsworn what it fell short of its target. It’s a score for the evening, and you can make it real money if your group wants to. The Purse stops growing once it reaches its target, so it fills steadily across the game.")}
<div class="row"><div><label for="unit">Written as</label><input id="unit" value="${esc(d.unit)}" oninput="draft()" placeholder="pts"></div><div><label for="potCap">Target</label><input id="potCap" type="number" inputmode="numeric" value="${esc(d.potCap || "2000")}" oninput="draft()"></div></div>
${why("Points or money?", "Leave it as <b>pts</b> for a score, or type <b>£</b> if everyone has chipped in and the Purse is real, for example £20 each. The target is then the total you’ve collected.")}
${why("Wrong answers cost the Purse", "In the shouting games, a wrong answer costs the Purse. That’s the next page.")}` },
  { id: "wrong", sec: "The Purse and prize", title: () => "Who pays for wrong answers?", body: d => `
${P_("In the Rapid Quiz, Snap and What Changed?, players shout out answers. Each wrong shout costs the Purse " + moneyOf({ potUnit: d.unit || "pts" }, 50) + ". The room hears the total at the end of the Trial, never who got it wrong.")}
<div class="wopts">${wopt(d, "wrong", "cloaks", "Only the Forsworn’s wrong answers", "A Loyal player can guess freely. When the Purse loses points, the table knows a Forsworn shouted wrong, maybe on purpose, and starts wondering who.")}${wopt(d, "wrong", "all", "Everyone’s, and the Forsworn’s cost double", "Everyone has to be careful. The Purse is harder to fill, and a big loss is harder to pin on anyone.")}</div>` },
  { id: "title", sec: "The Purse and prize", title: () => "A name for your night", body: d => `
${P_("This title appears at the top of the TV all evening. Keep “The Betrayal”, or make it yours: “Poison at Number 42”, “Sophie’s 40th”, “The Christmas Forsworn”.")}
<label for="title">Title on the TV</label><input id="title" value="${esc(d.title)}" oninput="draft()">
${why("Question bank", "The quiz, charades, songs and other games draw from a bank of " + BANKDEFS.reduce((a, b) => a + b.items().length, 0) + " questions and prompts. If some won’t suit your group (too hard, too British, a song nobody knows), you can switch them off here. This is optional. " + bankSummary() + ".<div class=\"row\"><button class=\"slim\" onclick=\"openBank()\">Open the question bank</button></div>")}` },
];
const wizSteps = d => WIZ.filter(w => !w.show || w.show(d));
// the five questions and the Ready page, then "Customise": every other choice, each with its own page
const coreSteps = d => wizSteps(d).filter(w => w.core), moreSteps = d => wizSteps(d).filter(w => !w.core);
function wNext() {
  draft(); const d = settle(setupDraft), w = wizSteps(d).find(x => x.id === d.step);
  const err = w && w.check ? w.check(d) : ""; setupMsg = err;
  if (err) { toast(err, 5000); renderHost(); return }
  const list = w && !w.core ? moreSteps(d) : coreSteps(d), i = list.findIndex(x => x.id === d.step);
  d.step = d.back === "review" || !list[i + 1] ? "review" : list[i + 1].id; d.back = null; saveDraft(); renderHost(); window.scrollTo(0, 0);
}
function wBack() {
  draft(); const d = setupDraft, w = wizSteps(d).find(x => x.id === d.step), list = w && !w.core ? moreSteps(d) : coreSteps(d), i = list.findIndex(x => x.id === d.step); setupMsg = "";
  d.step = d.back === "review" || d.step === "handover" ? "review" : i > 0 ? list[i - 1].id : w && !w.core ? "review" : list[0].id; d.back = null; saveDraft(); renderHost(); window.scrollTo(0, 0);
}
function wGo(id, fromReview) { draft(); setupMsg = ""; setupDraft.step = id; setupDraft.back = fromReview ? "review" : null; saveDraft(); renderHost(); window.scrollTo(0, 0) }
// every page's check, in order; the first that fails is where the Keeper is sent
function wCheck(d) { for (const w of wizSteps(d)) { const err = w.check && w.check(d); if (err) { setupMsg = err; d.step = w.id; d.back = "review"; toast(err, 5000); saveDraft(); renderHost(); return false } } return true }
// a friend keeps: the host plans it, then hands the phone over; the Keeper presses Start, so the host never sees the roles
function wHand() { draft(); const d = settle(setupDraft); if (!wCheck(d)) return; d.step = "handover"; setupMsg = ""; saveDraft(); renderHost(); window.scrollTo(0, 0) }
function handoverForm(d) {
  const k = esc(d.host.trim() || "your Keeper");
  return `<div class="wiz"><div class="wbar"><span>Hand over</span><span class="num">ready</span></div><div class="wprog"><i style="width:100%"></i></div>
<h2>Over to you, ${k}</h2>${P_("Hand this phone to " + k + " now, and don’t look at it again tonight: once the game starts, it shows who the Forsworn are.")}
${P_(k + ": when the guests are seated, press <b>Start game</b>. The roles are dealt at that moment, on your watch. Then follow the phone: it gives you every line to read.")}
<label for="pinset">Keeper PIN</label><input id="pinset" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" value="${esc(d.pin)}" oninput="draft()">
${why("The PIN", "It opens the Keeper’s screen on another phone if this one dies. " + k + ", change it now if you like, so only you know it.")}
${setupMsg ? `<div class="secret" role="alert">${esc(setupMsg)}</div>` : ""}</div>
<div class="foot"><button class="ghost" onclick="wBack()">Back</button><button class="primary" onclick="submitSetup()">Start game</button></div>`;
}
function setupForm() {
  if (!setupDraft) try { setupDraft = JSON.parse(sessionStorage.getItem("candle-draft") || "null") } catch (e) {}
  const d = setupDraft = settle(Object.assign(SETUP0(), setupDraft || {})), n = tableOf(d), steps = wizSteps(d);
  if (d.step === "handover") return d.keeper === "friend" ? handoverForm(d) : (d.step = "review", setupForm());
  let w = steps.find(x => x.id === d.step); if (!w) { w = steps[0]; d.step = w.id }
  const core = !!w.core, list = core ? coreSteps(d) : moreSteps(d), i = list.findIndex(x => x.id === w.id), last = w.id === "review", friend = d.keeper === "friend";
  return `<div class="wiz"><div class="wbar"><span>${esc(w.sec)}</span><span class="num">${core ? "" : "Customise · "}${i + 1} of ${list.length}</span></div><div class="wprog"><i style="width:${Math.round((i + 1) / list.length * 100)}%"></i></div>
${syncErr ? `<div class="secret">Still clearing the last game from the server. This retries by itself once the phone is back online.</div>` : ""}
<h2>${w.title(d, n)}</h2>${w.body(d, n)}
${setupMsg ? `<div class="secret" role="alert">${esc(setupMsg)}</div>` : ""}</div>
<div class="foot">${!core || i ? `<button class="ghost" onclick="wBack()">Back</button>` : ""}${last ? (friend ? `<button class="primary" onclick="wHand()">Hand over to ${esc(d.host.trim() || "your Keeper")}</button>` : `<button class="primary" onclick="submitSetup()">Start game</button>`) : `<button class="primary" onclick="wNext()">${d.back === "review" ? "Done" : core && !i ? "Let’s start" : !core && !list[i + 1] ? "Back to the summary" : "Next"}</button>`}</div>`;
}
function submitSetup() {
  draft(); const d = settle(setupDraft), names = namesOf(d);
  if (!wCheck(d)) return;
  const tn = Math.round(+d.cloaks), pc = Math.round(+d.potCap), pool = draftPool(d).filter(k => k !== "statue" || d.ghosts);
  const tr = Math.max(1, Math.min(tn || defaults(names.length).t, maxCloaks(names.length)));
  const rules = { rounds: +d.rounds || 0, perRound: +d.perRound || 0, dinnerAfter: d.courses ? 0 : +d.dinnerAfter || 0, courses: !!d.courses && +d.rounds >= 4, narrator: !!d.narrator, mingle: !!d.mingle, pool: Array.isArray(d.pool) ? pool : null, ghosts: !!d.ghosts, convert: !!d.convert, bargain: !!d.bargain, quests: !!d.quests, shield: d.shield, blade: !!d.blade, champion: !!d.champion, witness: !!d.witness, dilemma: !!d.dilemma };
  const prizes = [{ at: 0.5, what: d.prize2.trim() }, { at: 1, what: d.prize3.trim() }].filter(x => x.what);
  setupMsg = "";
  startGame({ names, cloaks: tr, title: d.title.trim(), host: d.host.trim(), potUnit: d.unit.replace(/[<>&"'`]/g, "").trim() || "pts", potCap: pc > 0 ? Math.max(100, Math.round(pc / 50) * 50) : 2000, wrongRule: d.wrong === "all" ? "all" : "cloaks", prize: d.prize.trim() || PRIZE0, prizes, hours: +d.hours || 4, pin: d.pin.trim(), rules });
}
// what the plan comes to, in plain words: the Menu's "Your game plan" during the game
function planLines(d, n) {
  const r = d.rounds || autoRounds(n || 8), per = +d.perRound === 1 ? "one Trial a round" : +d.perRound === 2 ? "two Trials a round" : "one or two Trials a round, by the clock";
  const pool = draftPool(d), sh = { mix: "hidden in round-by-round Trials, public in the rest", public: "won openly by the winner", secret: "hidden wherever a Trial allows", off: "no Sanctuaries" }[d.shield];
  const b = blades(Object.assign({}, d, { rounds: r }));
  const roles = [d.blade ? "the Casting Vote once (from round " + b.blade + ")" : null, d.champion ? "the Crown once (from round " + b.champion + ")" : null, d.witness ? "the Confessor in the final (if one Forsworn is left)" : null, d.dilemma ? "the Temptation once, when nobody holds Sanctuary" : null].filter(Boolean);
  return [
    r + " rounds, the last of them the final; " + per + ".",
    (d.courses ? "Dinner in three courses (starter, main course and dessert), between the rounds" : +d.dinnerAfter ? "Dinner after round " + d.dinnerAfter : "No dinner break") + (d.mingle ? "; a 10-minute Interval before each Reckoning." : "; straight from Trials to the Reckoning."),
    (pool.length === poolAll().length ? "Every Trial in the pool" : pool.length + " of " + poolAll().length + " Trials in the pool (" + andList(pool.map(k => (MISSIONS.find(m => m.key === k) || {}).title)) + ")") + ", dealt in a fresh order.",
    "Poison: the victim is told in the night, announces it at dawn, then leaves the table. " + (d.ghosts ? "The dead become Ghosts and judge from beyond the table." : "No Ghosts: the dead are out.") + " " + ([d.convert ? "Whisper" : null, d.bargain ? "Last Offer" : null].filter(Boolean).length ? cap1(andList([d.convert ? "a Whisper" : null, d.bargain ? "a Last Offer" : null].filter(Boolean))) + " (once each) when one Forsworn is left against four or more." : "Never a Whisper or a Last Offer.") + (d.quests ? " An Errand for the Forsworn each night." : ""),
    "Sanctuaries: " + sh + ". " + (roles.length ? cap1(andList(roles)) + "." : "No other powers.")
  ];
}

/* ---- missions ---- */
// the host's private flag on a mystery round: its winner takes a hidden shield
const mysteryNote = (m, n, what) => { const it = mysteryAt(m, n); return it.length ? `<div class="secret"><b>${it.some(x => /Casting Vote|Crown/.test(x)) ? "⚔" : "⛨"} The mystery round.</b> Whoever ${what} takes ${esc(andList(it))}, in secret. Say nothing: the room must not know which round it is.</div>` : "" };
const scoreRows = m => alive().map(p => `<div class="vote"><span>${ART.seal(p)}${esc(p.name)}</span><button onclick="bump('${p.id}',-1)" aria-label="${esc(p.name)}: one point less">−</button><b class="n num">${m.scores[p.id] || 0}</b><button onclick="bump('${p.id}',1)" aria-label="${esc(p.name)}: one point more">+</button></div>`).join("");
function missionHost(s) {
  const m = s.mission; let ctl = "", foot = "";
  const gold = t => `<b class="kv">${esc(String(t))}</b>`;
  if (m.stage === "rules") {
    const fin = isFinal(state), cap = shieldCap(state), held = shieldsHeld(state);
    const stepper = ([f, label, lo, hi]) => `<div class="vote setrow"><span>${esc(label)}</span><button onclick="mSet('${f}',-1)" ${m[f] <= lo ? "disabled" : ""} aria-label="${esc(label)}: fewer">−</button><b class="n num" aria-live="polite">${m[f]}</b><button onclick="mSet('${f}',1)" ${m[f] >= hi ? "disabled" : ""} aria-label="${esc(label)}: more">+</button></div>`;
    const sets = (MSET[m.key] || []).map(stepper).join("") + (m.key === "custom" ? `<label for="mt">Title</label><input id="mt" value="${esc(m.title)}"><label for="mr">Rules</label><textarea id="mr" rows="3">${esc(m.rules)}</textarea><label for="mtm">Timer (seconds, 0 = none)</label><input id="mtm" type="number" inputmode="numeric" value="${m.timer || 120}">` : "");
    const room = `Tonight: ${held} of ${cap} Sanctuaries held (a quarter of the table at most), room for ${m.room}.`;
    let sh = "";
    const cur = m.witnessOffer ? "" : m.win === "secret" ? "secret" + (m.secN || 1) : m.win, rounded = ROUNDED.includes(m.key);
    const opt = (sel, label, fn) => `<button class="${sel ? "sel" : ""}" aria-pressed="${sel}" onclick="${fn}">${label}</button>`;
    if (m.key === "dilemma") sh = `<p class="note">Stake is fixed at ${money(m.stake)}: one SELF adds ${money(m.stake)} and that player’s Sanctuary is announced on TV; nobody adds ${money(m.stake * 2)}; two or more removes ${money(m.stake)}.</p>`;
    else if (m.hasShield && !m.room) sh = `<p class="note">${fin ? "No Sanctuaries in the final: there is no night left to survive." : "No Sanctuary from this Trial. " + room}</p>`;
    else if (m.hasShield) {
      const u = mystOf(m), opts = [["none", "No Sanctuary", "mWin('none')"], ["public", "Overall winner · public", "mWin('public')"]].concat(rounded ? [["secret1", "Hidden · 1 " + u.unit, "mWin('secret',1)"]].concat(m.room >= 2 ? [["secret2", "Hidden · 2 " + u.units, "mWin('secret',2)"]] : []) : []);
      sh = `<p class="ask">⛨ Sanctuary <small>(safe from tonight’s poisoning)</small></p><div class="row wrap">${opts.map(([k, l, fn]) => opt(cur === k, l, fn)).join("")}</div><p class="note">${rounded ? "Hidden: one " + u.unit + " only you know about. Whoever " + u.how + " takes it in secret, not the Trial’s winner, and you tap them at the end." : "Hidden prizes need a Trial played in rounds."} ${room}</p>`;
    }
    const witness = m.hasShield && m.key !== "dilemma" && witnessOk(state) ? `<div class="row"><button class="${m.witnessOffer ? "sel" : ""}" aria-pressed="${!!m.witnessOffer}" onclick="mWitness()">${m.witnessOffer ? "Confessor on offer instead of Sanctuary (the TV says “a special prize”)" : "Offer the Confessor instead (TV: “a special prize”)"}</button></div>` : "";
    const wo = championOf(state);
    let war = "";
    if (bladeOk(state, m)) {
      const d = [["none", "No Casting Vote"]];
      const wOn = champFree(state), bOn = bladeFree(state);
      if (m.win === "public") { if (wOn) d.push(["with", "Crown: the winner takes both"]) } else if (bOn) d.push(["public", "Overall winner · public"]);
      if (m.win === "secret" && wOn) d.push(["with", "Crown: a hidden " + mystOf(m).unit + " takes both"]);
      if (rounded && bOn) d.push(["secret", "Hidden · its own " + mystOf(m).unit]);
      war = `<p class="ask">⚔ Casting Vote <small>(breaks a tie at tonight’s table)</small></p><div class="row wrap">${d.map(([k, l]) => opt(m.dag === k, l, "mDag('" + k + "')")).join("")}</div><p class="note">Sanctuary and Casting Vote in one pair of hands make the <b>Crown</b>: only whoever wears the Crown may lay both down at the Reckoning to be safe from that exile. The Casting Vote works by itself, hidden or not. If the boards tie and its holder chalked one of the tied, it breaks the tie once every board is in, and the TV shows which way it fell, never whose it was.</p>`;
    } else if (wo && !["dilemma", "likely"].includes(m.key)) war = `<p class="note">⚔ ${esc(P(wo).name)} already holds the Casting Vote this round.</p>`;
    const summary = m.key === "dilemma" || m.key === "likely" ? "" : `<div class="secret"><b>This Trial:</b> ${esc(prizeSummary(m))} ${esc(m.stake ? "Up to " + money(m.stake) + " for the Purse." : "The Purse is full.")}</div>`;
    const read = m.key === "dilemma" ? SAY.dilemma(money(m.stake), money(m.stake * 2)) : m.key === "countdown" ? SAY.countdown(m.total) : m.key === "quiz" ? SAY.quiz(m.per) : m.rules;
    const two = hasPrizeStep(m);
    const change = m.key === "dilemma" ? sh : (m.hasShield && (sh || witness)) || war ? `<details class="adv" data-k="adv-prize-${m.mid}"><summary>Change the prizes</summary>${m.hasShield ? sh + witness : ""}${war}</details>` : "";
    ctl = `${say(read)}${dir(two ? "The TV shows the brief" + (m.key === "custom" ? " once you confirm" : "") + ", and the prize when you confirm it." : "The TV shows the rules.")}${summary}${change}${sets ? `<details class="adv" data-k="adv-set-${m.mid}" ${m.key === "custom" ? "open" : ""}><summary>Adjust this Trial</summary>${sets}</details>` : ""}
<div class="foot"><button class="ghost" onclick="act(s=>{s.done[s.mission.key]=Math.max(0,(s.done[s.mission.key]||1)-1);if(s.mission.key==='dilemma')delete s.done.dilemma_r;else s.roundMissions=Math.max(0,(s.roundMissions||1)-1);s.phase='day';s.mission=null},'Trial cancelled')">Pick another</button><button class="primary" onclick="startMission()">${two ? "Show the prize" : "Start the Trial"}</button></div>`;
  }
  else if (m.stage === "prize") {
    const pl = prizeOf_(m, isFinal(state));
    ctl = `${dir("The prize is on the TV now.")}${say(pl.say)}<div class="secret"><b>This Trial:</b> ${esc(prizeSummary(m))}</div>${m.win === "secret" || m.dag === "secret" ? dir("The mystery rounds are drawn when you start, and only your screen shows them.") : ""}<div class="foot">${backBtn("act(s=>{s.mission.stage='rules'})")}<button class="primary" onclick="startMission()">Start the Trial</button></div>`;
  }
  else if (m.stage === "done") {
    const ranked = alive().slice().sort((a, b) => (m.scores[b.id] || 0) - (m.scores[a.id] || 0)), top = ranked[0] && (m.scores[ranked[0].id] || 0) > 0 ? ranked[0] : null;
    const tied = top ? ranked.filter(p => (m.scores[p.id] || 0) === m.scores[top.id]) : [], tie = tied.length > 1 && !m.sdOver && prizeRides(m), joint = tied.length > 1 && !prizeRides(m) && m.key !== "dilemma";
    const secs = (m.secIds || []).map(id => P(id)).filter(p => p && p.alive), win = m.winId && P(m.winId);
    let sh = "";
    const wl = !prizeRides(m) ? "" : championPrize(m) && m.win === "public" ? "the Crown, Sanctuary and Casting Vote ⚔⛨" : [m.win === "public" ? "Sanctuary ⛨" : "", m.dag === "public" ? "the Casting Vote ⚔" : ""].filter(Boolean).join(" + ");
    if (m.witnessOffer && !state.witness) sh = `<h3>The Confessor, the special prize</h3><p class="note">Tap whoever won it. A Loyal player meets the Forsworn face to face in the ceremony, straight away and before the final table, and can’t be poisoned. If the Forsworn won it, tap them anyway: the ceremony runs exactly the same, and nothing comes of it.</p><div class="plist">${alive().map(p => pbtn(p, m.witnessId === p.id ? "sel" : "", "witnessPick('" + p.id + "')", p.role === "cloak" ? "F" : "👁")).join("")}</div>`;
    if (m.key === "dilemma") sh = `<p class="note">${win ? esc(win.name) + " takes Sanctuary, announced on the TV." : "No Sanctuary from the Temptation."}</p>`;
    else if (wl) sh += `<h3>The winner takes ${wl}</h3><p class="note">${win && m.autoPicked ? "Picked from the scores. Tap to change, or tap again for nobody." : "Tap the winner, or nobody."}</p><div class="plist">${alive().map(p => pbtn(p, m.winId === p.id ? "sel" : "", "shieldPick('" + p.id + "')", (m.scores[p.id] || 0) + "")).join("")}</div>`;
    if (m.win === "secret" && m.secMax > 0) {
      const war = championPrize(m) ? P(m.warId) : null, tr = secs.filter(p => p.role === "cloak" && p.id !== m.warId);
      sh += `<h3>Hidden ${championPrize(m) ? "Crown and Sanctuaries" : "Sanctuaries"} <small>mystery round${(m.mystery || []).length > 1 ? "s" : ""} ${esc(andList((m.mystery || []).map(String)))}</small></h3><p class="note">${championPrize(m) ? (war ? "The Crown (round " + m.mystery[0] + "): <b>" + esc(war.name) + "</b>. " : "Nobody won the Crown’s round. ") : ""}${secs.filter(p => p.id !== m.warId).length ? "Sanctuary: <b>" + esc(secs.filter(p => p.id !== m.warId).map(p => p.name).join(", ")) + "</b>." : championPrize(m) && (m.mystery || []).length < 2 ? "" : "No Sanctuary won."}${(m.mystery || []).some(n => !(m.mysteryDone || []).includes(n)) ? " The Trial ended before every mystery round was played." : ""} They’re tapped in the ceremony; the TV never says who.${tr.length ? " <b>" + esc(andList(tr.map(p => p.name))) + " is a Forsworn</b>, so no Sanctuary and no tap for them." : ""} Adjust only if a round was misjudged.</p><div class="plist">${alive().map(p => pbtn(p, m.secIds.includes(p.id) ? "sel" : "", "giveShield('" + p.id + "')", p.id === m.warId ? "⚔⛨" : "⛨")).join("")}</div>${championPrize(m) ? `<p class="note">The Crown. Tap to change it:</p><div class="plist">${alive().map(p => pbtn(p, m.warId === p.id ? "sel" : "", "giveChampion('" + p.id + "')", "⚔")).join("")}</div>` : ""}`;
    }
    if (m.dag === "secret") { const d = P(m.dagId); sh += `<h3>Hidden Casting Vote <small>mystery round ${m.dagRound || "?"}</small></h3><p class="note">${d ? "Won by <b>" + esc(d.name) + "</b>" + (d.role === "cloak" ? " (a Forsworn, who keeps it)" : "") + ". Tapped in the ceremony; it counts automatically at the table, and the TV never says whose it was." : (m.mysteryDone || []).includes(m.dagRound) || m.dagDone ? "Nobody won it." : "Its round wasn’t played."} Adjust only if the round was misjudged.</p><div class="plist">${alive().map(p => pbtn(p, m.dagId === p.id ? "sel" : "", "giveBlade('" + p.id + "')", "⚔")).join("")}</div>` }
    if (!m.hasShield) sh = `<p class="note">No Sanctuary from this Trial.</p>`;
    else if (!sh) sh = `<p class="note">No Sanctuary from this Trial.</p>`;
    const nsec = (m.win === "secret" ? secs.filter(p => p.role !== "cloak" || p.id === m.warId).length : 0) + (m.dag === "secret" && m.dagId && !championOf(state) ? 1 : 0), npub = prizeRides(m) && win;
    const wr = Object.entries(m.wrongs || {}).filter(e => e[1] > 0).map(([id, n]) => { const p = P(id); return p ? esc(p.name) + (n > 1 ? " ×" + n : "") + (p.role === "cloak" ? " (Forsworn)" : "") : "" }).filter(Boolean);
    const potNote = m.key === "dilemma" ? "" : `<p class="note">On offer: ${money(m.stake || 0)}.${wr.length ? " Wrong shouts: " + wr.join(", ") + ", costing " + money(m.pen || 0) + (state.wrongRule === "all" ? " (a Forsworn’s double)." : " (Forsworn’s only).") : " No wrong shouts cost it."} The TV shows the total only.</p>`;
    ctl = `<h3>Scores</h3>${ranked.map(p => `<div class="vote"><span>${ART.seal(p)}${esc(p.name)}</span><b class="n num">${m.scores[p.id] || 0}</b></div>`).join("")}
${joint ? `<p class="note">Joint top: ${esc(andList(tied.map(p => p.name)))}. Nothing rides on the win, so no tie-break.</p>` : ""}${tie ? `<div class="secret"><b>Tie at the top:</b> ${esc(tied.map(p => p.name).join(", "))}. ${m.sd ? `Only they may answer. Q: ${esc(m.sd[0])} A: <b>${esc(String(m.sd[1]))}</b>. First to shout, right or wrong. Tap the winner:<div class="plist">${tied.map(p => pbtn(p, "", "shieldPick('" + p.id + "')")).join("")}</div>` : `<div class="row"><button class="primary" onclick="suddenDeath()">Run sudden death on the TV</button></div>`}</div>` : ""}
${sh}
${potNote}<label for="pts">Points for the Purse</label><input id="pts" type="number" inputmode="numeric" step="50" value="${m.points}"><p class="note">The Purse moves in fifties: anything else is rounded.</p>
<div class="foot"><button class="primary" onclick="endMission()" ${tie && m.sd ? "disabled" : ""}>${tie && m.sd ? "Settle the tie first" : m.witnessOffer && m.witnessId ? "Start the Confessor ceremony" : nsec ? "Start the secret ceremony" : npub ? (championPrize(m) && m.win === "public" ? "Show the Crown on the TV" : m.win === "public" ? "Show Sanctuary on the TV" : "Show the Casting Vote on the TV") : "Continue"}</button></div>`;
  }
  else {
    const grid = (fn, tagFn) => `<div class="plist">${alive().map(p => pbtn(p, "", fn(p), tagFn ? tagFn(p) : "")).join("")}</div>`;
    const doneBtn = `<div class="row"><button onclick="act(s=>finishPlay(s))">Finish Trial</button></div>`;
    if (m.key === "quiz") {
      const q = m.qs[m.qi].q, sh = m.shouter ? P(m.shouter) : null, per = m.per || 10, part = Math.floor((m.qn - 1) / per) + 1;
      ctl = `<p class="step-head">Part ${part} of 3 · ${["Easy", "Medium", "Brutal"][part - 1] || ""} · question ${(m.qn - 1) % per + 1} of ${per}</p>${mysteryNote(m, m.qn, "gets this right")}<p class="note">Q: ${esc(q[0])}<br>A: ${gold(q[1])}</p>${m.showA ? `<p class="note">${sh ? esc(sh.name) + (m.lastRight ? " correct" : " wrong") : "Nobody"}. Next in a moment…</p><div class="row"><button onclick="quizNext()">Next now</button></div>` : sh ? `<div class="row"><button class="good" onclick="quizJudge(true)">${esc(sh.name)}: correct</button><button class="danger" onclick="quizJudge(false)">${esc(sh.name)}: wrong</button></div><div class="row"><button class="ghost slim" onclick="act(s=>{s.mission.shouter=null})">Unpick</button></div>` : `<p class="note">Tap the first to shout.</p>` + grid(p => `act(s=>{s.mission.shouter='${p.id}'})`) + `<div class="row"><button onclick="quizJudge(null)">Nobody. Reveal and move on</button></div>`}<h3>scores</h3>${scoreRows(m)}${doneBtn}`;
    }
    else if (m.key === "estimate") { const q = itemOf(m); ctl = `<p class="step-head">Round ${m.qn} of ${m.total}</p>${mysteryNote(m, m.qn, "is closest")}<p class="note">Q: ${esc(q[0])}<br>A: ${gold(Number(q[1]).toLocaleString("en-GB"))}</p>${m.showA ? `<h3>Tap the closest <small>it scores and moves on</small></h3>${grid(p => `award('${p.id}')`)}<div class="row"><button onclick="award(null)">Nobody, next</button></div>` : `<p class="note">Boards up, then reveal.</p><div class="row"><button class="primary" onclick="act(s=>{s.mission.showA=true})">Reveal the answer on the TV</button></div>`}<h3>scores</h3>${scoreRows(m)}${doneBtn}` }
    else if (m.key === "likely") { ctl = `<p class="step-head">Prompt ${m.qn} of ${m.total}</p><p class="note">“${esc(itemOf(m))}”. Boards up: tap + next to each name as it is chalked.</p>${alive().map(p => `<div class="vote"><span>${ART.seal(p)}${esc(p.name)}</span><button onclick="act(s=>{const t=s.mission.tally;t['${p.id}']=Math.max(0,(t['${p.id}']||0)-1)})">−</button><b class="n num">${m.tally[p.id] || 0}</b><button onclick="act(s=>{const t=s.mission.tally;t['${p.id}']=(t['${p.id}']||0)+1})">+</button></div>`).join("")}<div class="row">${m.showA ? `<button class="primary" onclick="likelyNext()">${m.qn >= m.total ? "Finish" : "Next prompt"}</button>` : `<button class="primary" onclick="act(s=>{s.mission.showA=true})">Reveal the verdict</button>`}</div>${doneBtn}` }
    else if (m.key === "memory") {
      const shown = m.timerEnd || m.showA;
      ctl = !shown ? `<p class="note">Chalkboards face down. The wall shows for ${m.timer} s.</p><div class="row"><button class="primary" onclick="act(s=>{const m=s.mission;m.timerDur=m.timer*1000;m.timerEnd=now()+m.timerDur;m.showA=false})">Show the wall for ${m.timer} s</button></div>` : `<div class="row"><button class="${m.showA ? "" : "primary"}" onclick="act(s=>{s.mission.timerEnd=null;s.mission.showA=true})" ${m.showA ? "disabled" : ""}>Show the answers</button><button class="ghost" onclick="act(s=>{const m=s.mission;m.timerDur=m.timer*1000;m.timerEnd=now()+m.timerDur;m.showA=false})">Show the wall again</button></div><h3>correct per player (type)</h3>${alive().map(p => `<div class="vote"><span>${ART.seal(p)}${esc(p.name)}</span><input type="number" inputmode="numeric" min="0" max="25" aria-label="${esc(p.name)} correct" value="${m.scores[p.id] || 0}" onchange="const v=Math.max(0,Math.min(25,Math.round(+this.value||0)));act(s=>{s.mission.scores['${p.id}']=v})"></div>`).join("")}${doneBtn}`;
    }
    else if (m.key === "dilemma") { ctl = m.result ? `<p class="note">${m.result.kind === "one" ? esc(m.result.name) + " takes Sanctuary." : m.result.kind === "none" ? "Nobody wrote SELF." : m.result.count + " wrote SELF, so no Sanctuary."}</p><div class="foot"><button class="primary" onclick="act(s=>finishPlay(s))">Continue</button></div>` : `<p class="note">Turn the boards. Tap everyone who wrote SELF, then resolve.</p><div class="plist">${alive().map(p => pbtn(p, m.picks.includes(p.id) ? "sel" : "", "togglePick('" + p.id + "')")).join("")}</div><div class="foot"><button class="primary" onclick="resolveDilemma()">Resolve: ${m.picks.length} wrote SELF</button></div>` }
    else if (m.key === "charades" || m.key === "hum" || m.key === "draw") {
      // one step at a time: pick the performer, show them the word, run the clock, then who guessed
      const word = itemOf(m), ghosts = ghostsOf(s), hum = m.key === "hum", drw = m.key === "draw", a = m.actorId ? P(m.actorId) : null, noun = hum ? "song" : drw ? "picture" : "scene", role = hum ? "hummer" : drw ? "artist" : "actor";
      const pickA = id => `act(s=>{const m=s.mission;m.actorId='${id}';m.showA=false;m.wordOn=false;m.bfOff=false;m.timerEnd=null})`;
      const skip = `<button onclick="skipWord()">${a ? esc(a.name) + " doesn’t" : "They don’t"} know it. New ${noun}</button>`;
      if (!a) ctl = `<p class="step-head">1 · Who’s the ${role}?</p><p class="note">A Ghost, if you have one.</p>${ghosts.length ? `<div class="plist">${ghosts.map(p => pbtn(p, "", pickA(p.id), "ghost")).join("")}</div>` : ""}<div class="plist">${alive().map(p => pbtn(p, "", pickA(p.id))).join("")}</div>`;
      else if (!m.showA && !m.timerEnd) ctl = `<p class="step-head">2 · Blindfolds on</p><p class="note">The TV tells everyone except ${esc(a.name)}: blindfolds on. Nothing else shows yet. ${cap1(noun)}: ${gold(word)}</p><div class="row"><button class="primary" onclick="act(s=>{s.mission.showA=true;s.mission.wordOn=false;s.mission.timerEnd=null})">Blindfolds on, everyone but ${esc(a.name)}</button></div><div class="row"><button class="ghost" onclick="act(s=>{s.mission.actorId=null})">Different ${role}</button></div>`;
      else if (!m.wordOn && !m.timerEnd) ctl = `<p class="step-head">3 · Show ${esc(a.name)} the ${noun}</p><p class="note">Check every blindfold is on. Then the ${noun} goes up for ${esc(a.name)} alone. ${cap1(noun)}: ${gold(word)}</p><div class="row"><button class="primary" onclick="act(s=>{s.mission.wordOn=true})">Blindfolds are on. Show ${esc(a.name)}</button></div><div class="row"><button class="ghost" onclick="act(s=>{s.mission.showA=false})">Back</button></div>`;
      else if (!m.timerEnd && hum && m.bfOff) ctl = `<p class="step-head">5 · Start the clock</p><p class="note">Blindfolds are off. Song: ${gold(word)}. The music goes quiet for the ${m.timer} s and the TV shows the clock only for the last five.</p><div class="row"><button class="primary" onclick="act(s=>{const m=s.mission;m.timerDur=m.timer*1000;m.timerEnd=now()+m.timerDur})">Start ${m.timer} s: ${esc(a.name)} hums</button></div><div class="row">${skip}</div>`;
      else if (!m.timerEnd && hum) ctl = `<p class="step-head">4 · ${esc(a.name)} is reading it</p><p class="note">Song: ${gold(word)}. When they nod, blindfolds off, then start the clock.</p><div class="row"><button class="primary" onclick="act(s=>{s.mission.bfOff=true})">Blindfolds off</button></div><div class="row">${skip}</div>`;
      else if (!m.timerEnd) ctl = `<p class="step-head">4 · ${esc(a.name)} is reading it</p><p class="note">${cap1(noun)}: ${gold(word)}. When they nod: blindfolds off, clock on.${drw ? " Chalk and board in hand." : ""}</p><div class="row"><button class="primary" onclick="act(s=>{const m=s.mission;m.timerDur=m.timer*1000;m.timerEnd=now()+m.timerDur})">Blindfolds off, start ${m.timer} s</button></div><div class="row">${skip}</div>`;
      else ctl = `<p class="step-head">5 · Who guessed it?</p><p class="note">${cap1(noun)}: ${gold(word)}. Guesser and ${role} both score.</p>${grid(p => `guessed('${p.id}')`, p => p.id === a.id ? role : "")}<div class="row"><button onclick="act(s=>{const m=s.mission;nextItem(s);m.actorId=null;m.showA=false;m.wordOn=false;m.bfOff=false;m.timerEnd=null})">Nobody got it. Next ${role}</button></div><div class="row">${skip}</div>`;
      ctl += `<h3>scores</h3>${scoreRows(m)}${doneBtn}`;
    }
    else if (m.key === "hilo") {
      const q = itemOf(m), st = m.standing.map(id => P(id)).filter(Boolean), hi = q[1] > m.ref;
      if (m.won) {
        ctl = `<p class="step-head">Round ${m.won.n} of ${m.total} · won</p><p class="note">${m.won.name ? "<b>" + esc(m.won.name) + "</b> wins round " + m.won.n + ", on the TV now." : "Round " + m.won.n + " is over."}</p><h3>round wins</h3>${scoreRows(m)}${doneBtn}`;
        foot = `<button class="primary" onclick="hiloRound()">${m.qn >= m.total ? "Finish the Trial" : "Round " + (m.qn + 1) + ": everyone stands"}</button>`;
        return { body: `<h2>${esc(m.title)}</h2>${ctl}`, foot };
      }
      ctl = `<p class="step-head">Round ${m.qn} of ${m.total} · ${st.length} standing</p>${mysteryNote(m, m.qn, "is last one standing")}<p class="note">Q: ${esc(q[0])}<br>Higher or lower than ${gold(Number(m.ref).toLocaleString("en-GB"))}? Answer: ${gold(Number(q[1]).toLocaleString("en-GB"))}, <b>${hi ? "HIGHER" : "LOWER"}</b></p>${m.showA ? `<h3>Tap everyone who got it wrong <small>they sit</small></h3><div class="plist">${st.map(p => pbtn(p, m.out.includes(p.id) ? "sel" : "", "hiloOut('" + p.id + "')", m.out.includes(p.id) ? "out" : "")).join("")}</div><p class="note">${m.out.length && m.out.length === st.length ? "All wrong, so nobody sits this time." : st.length - m.out.length === 1 ? "That leaves one: they win the round." : ""}</p>` : `<p class="note">“Thumbs up for higher, down for lower… three, two, one.”</p><div class="row"><button class="primary" onclick="act(s=>{s.mission.showA=true})">Reveal the answer on the TV</button></div>`}<h3>round wins</h3>${scoreRows(m)}${doneBtn}`;
      foot = m.showA ? `<button class="primary" onclick="hiloNext()">${st.length - m.out.length <= 1 && m.out.length < st.length ? "Round won. Show the winner" : "Next question"}</button>` : "";
    }
    else if (m.key === "truths") {
      const t = m.tellerId ? P(m.tellerId) : null, pool = [...alive(), ...ghostsOf(s)].filter(p => !m.done2.includes(p.id)), last = m.lastResult;
      if (!t) ctl = `<p class="step-head">Turn ${m.qn} of ${m.total} · who’s up?</p>${last ? `<p class="note">${esc(last.name)} fooled ${plural(last.fooled, "player")}; ${last.right} saw through it.</p>` : ""}<div class="row"><button class="primary" onclick="truthsPick(null)">Pick someone at random</button></div><div class="plist">${pool.map(p => pbtn(p, "", "truthsPick('" + p.id + "')", p.alive ? "" : "ghost")).join("")}</div>`;
      else if (m.tstage === "think") ctl = `<p class="step-head">Turn ${m.qn} of ${m.total} · ${esc(t.name)}</p><p class="note">${esc(t.name)} thinks of two truths and a lie${m.timerEnd ? " while the clock runs" : ""}. Everyone gets their chalk ready.</p><div class="row">${m.timerEnd ? "" : `<button onclick="truthsGo('think')">Give them ${m.timer} s to think</button>`}<button class="primary" onclick="truthsGo('tell')">They’re ready: three statements</button></div><div class="row"><button class="ghost" onclick="act(s=>{s.mission.tellerId=null;s.mission.tstage=null;s.mission.timerEnd=null})">Someone else</button></div>`;
      else ctl = `<p class="step-head">Turn ${m.qn} of ${m.total} · ${esc(t.name)}</p><p class="note">Three statements, then everyone chalks 1, 2 or 3. Boards up, then ${esc(t.name)} reveals the lie.</p><h3>tap everyone who spotted the lie</h3><div class="plist">${alive().filter(p => p.id !== t.id).map(p => pbtn(p, m.right.includes(p.id) ? "sel" : "", "truthsRight('" + p.id + "')", m.right.includes(p.id) ? "✓" : "")).join("")}</div>`;
      ctl += `<h3>scores</h3>${scoreRows(m)}${doneBtn}`;
      if (t && m.tstage === "tell") foot = `<button class="primary" onclick="truthsScore()">Score it: ${m.right.length} right, ${Math.max(0, alive().filter(p => p.id !== t.id).length - m.right.length)} fooled</button>`;
    }
    else if (m.key === "change") {
      const at = i => `${i + 1} (${m.before ? m.before[i] : ""} → ${m.grid ? m.grid[i] : ""})`;
      const mys = mysteryNote(m, m.qn, "spots it first");
      if (!m.cstage) ctl = `<p class="step-head">Round ${m.qn} of ${m.total}</p>${mys}<p class="note">${m.qn <= Math.ceil(m.total / 2) ? "This round one symbol is swapped for a new one." : "This round two symbols trade places."}</p><div class="row"><button class="primary" onclick="changeStudy()">Show the grid, ${m.timer} s to study</button></div>`;
      else if (m.cstage === "study") ctl = `<p class="step-head">Round ${m.qn} of ${m.total} · studying</p>${mys}<p class="note">When the clock runs out the grid hides by itself: the TV counts down ten seconds, then shows the changed grid. Nothing to tap.</p><div class="row"><button class="ghost" onclick="changeBlind()">Hide it now</button></div>`;
      else ctl = `<p class="step-head">Round ${m.qn} of ${m.total} · ${m.cstage === "blind" ? "ten-second countdown, then" : ""} first to shout</p>${mys}<p class="note">Changed: ${m.changed.map(at).join(" and ")}. Positions count left to right, top row first.${m.cstage === "blind" ? " The new grid appears when the TV’s countdown ends." : ""}</p>${m.cstage === "blind" && !m.showA ? `<div class="row"><button class="ghost" onclick="changeLook()">Show the new grid now</button></div>` : ""}${m.showA ? `<p class="note">${m.spotter ? esc(m.spotter) + " spotted it." : "Nobody spotted it."} The TV shows the change.</p>` : `<h3>who spotted it?</h3>${grid(p => `changeAward('${p.id}')`)}<div class="row"><button onclick="changeAward(null)">Nobody. Show the change</button></div><h3>Wrong shouts <small>tap each one</small></h3>${grid(p => `changeWrong('${p.id}')`, p => (m.wrongs || {})[p.id] ? "✗" + (m.wrongs[p.id] > 1 ? m.wrongs[p.id] : "") : "")}<p class="note">${state.wrongRule === "all" ? "Every wrong shout costs the Purse; a Forsworn’s double." : "A Forsworn’s wrong shout costs the Purse; a Loyal player’s costs nothing."} The TV shows only the total at the end.</p>`}`;
      ctl += `<h3>scores</h3>${scoreRows(m)}${doneBtn}`;
      if (m.showA) foot = nextBtn(m.qn >= m.total ? "Finish" : "Next round", "changeNext()");
    }
    else if (m.key === "snap") { ctl = `<p class="note">${m.total} symbols, one every 5 seconds. Tap + for a correct SNAP, − for a false one (${state.wrongRule === "all" ? "every false SNAP costs the Purse, a Forsworn’s double" : "a Forsworn’s false SNAP costs the Purse"}).</p><div class="row"><button class="primary" onclick="act(s=>{s.mission.seq=snapSeq(s.mission.total);s.mission.seqStart=now()+5000})">${m.seqStart ? "Restart sequence" : "Start sequence"}</button>${m.seqStart ? `<button onclick="act(s=>{s.mission.seqStart=null})">Stop</button>` : ""}</div>${scoreRows(m)}${doneBtn}` }
    else if (m.key === "countdown") {
      const best = bestWords(m.letters); if (!DICT && !dictFail && !dictP) loadDict().then(() => { if (isHost) renderHost() });
      ctl = `<p class="step-head">Round ${m.qn} of ${m.total}</p><div class="lettersrow">${esc(m.letters)}</div>${mysteryNote(m, m.qn, "has the longest word")}<p class="note">The ${m.timer} s clock started with the letters. Longest possible: ${best ? (best.length ? best.map(w => w.toUpperCase() + " (" + w.length + ")").join(", ") : "nothing over two letters") : dictFail ? "no dictionary, so judge by ear" : "loading dictionary…"}</p><div class="row"><button class="ghost" onclick="act(s=>{const m=s.mission;m.timerDur=m.timer*1000;m.timerEnd=now()+m.timerDur})">Restart clock</button><button class="ghost" onclick="act(s=>{s.mission.timerEnd=null})">Stop clock</button></div><h3>Round winner <small>the longest word, who deals the next round</small></h3>${grid(p => `awardWord('${p.id}')`)}<div class="row"><button onclick="awardWord(null)">No winner, next round</button></div><h3>round wins so far</h3>${scoreRows(m)}${doneBtn}`;
    }
    else { const run = m.timerEnd && m.timerEnd > now(); ctl = `<div class="row"><button class="${run ? "" : "primary"}" onclick="act(s=>{const m=s.mission;m.timerDur=m.timer*1000;m.timerEnd=now()+m.timerDur})" ${m.timer ? "" : "disabled"}>${run ? "Running on the TV. Restart" : m.timer ? "Start " + mmss(m.timer) + " timer" : "No timer"}</button><button onclick="act(s=>{s.mission.timerEnd=null})">Stop</button></div><div class="row"><button onclick="act(s=>{s.mission.timer=Math.max(10,s.mission.timer-30)})">−30 s</button><button onclick="act(s=>{s.mission.timer+=30})">+30 s</button></div><h3>points (3 / 2 / 1 for places, or tap the winner once)</h3>${scoreRows(m)}${doneBtn}` }
  }
  return { body: `<h2>${esc(m.title)}</h2>${ctl}`, foot };
}

/* ---- the Reckoning: talk, then every board in seat order, then the exile ---- */
// the name goes into the sheet from the state, never through an onclick string, where an apostrophe in a name would break it
function askLay() { const id = championArmed(state), p = id && P(id); if (p) confirmSheet(p.name + " lays down Sanctuary and Casting Vote?", "Nobody may chalk their name at this table. Their vote counts once, and nothing protects them tonight. Undo brings it back.", "Lay them down", championImmunity, "primary") }
function tableHost(s) {
  const t = s.table, stage = t.stage || "votes", A = alive(), v = t.votes || {}, imm = t.immune || [], ballots = t.ballots || {}, w = championOf(s), wp = w ? P(w) : null;
  const nIn = A.filter(p => p.id in ballots).length, wa = championArmed(s), wap = wa && P(wa);
  // only the Crown (Sanctuary and the Casting Vote) may lay both down, and only before the first board
  const layBtn = wap && stage !== "exile" && !nIn ? `<div class="row"><button onclick="askLay()">⚔ ${esc(wap.name)} lays down Sanctuary and the Casting Vote, to be safe from this vote</button></div>` : "";
  const laid = t.laid && P(t.laid), sec = !!(wp && s.champion && s.champion.secret), dg = t.blade && P(t.blade.to);
  const notes = (wp ? `<p class="note">⚔ ${wa ? "Crown" : "Casting Vote"}${sec ? ", won in secret" : ""}: <b>${esc(wp.name)}</b>. Their board counts one as it turns, like everyone’s. If the boards tie and they chalked one of the tied, the Casting Vote breaks the tie once every board is in, and the TV shows which way it fell${sec ? ", never whose it was. Don’t give them away" : ""}.${wa ? " They hold Sanctuary too." : ""}</p>${dg ? `<p class="note">⚔ The boards tied, and the Casting Vote broke it: <b>${esc(dg.name)}</b> +1, counted below.</p>` : ""}` : "") + (laid ? say(SAY.championLaid(laid.name, s.round)) + `<p class="note">⛨ Can’t be voted for at this table: <b>${esc(laid.name)}</b>. Sanctuary and the Casting Vote are gone: no tie-break for them, and nothing protects them tonight.</p>` : "");
  if (stage === "talk") {
    const dflt = (t.second ? 6 : Math.min(A.length, 16)) * 30000, dur = t.talkDur || dflt;
    const talk = t.talkEnd ? `<div class="row"><button onclick="act(s=>{s.table.talkEnd=null})">Stop the talk timer</button></div>` : `<div class="row"><button onclick="act(s=>{s.table.talkDur=Math.max(30000,(s.table.talkDur||${dflt})-30000)})">−30 s</button><button class="primary" onclick="act(s=>{s.table.talkDur=s.table.talkDur||${dflt};s.table.talkEnd=now()+s.table.talkDur})">Start ${mmss(dur / 1000)} talk</button><button onclick="act(s=>{s.table.talkDur=(s.table.talkDur||${dflt})+30000})">+30 s</button></div>`;
    return { body: `<h2>Reckoning${t.second ? ", the second vote" : ""}</h2><p class="step-head">1 · Table talk</p>${t.second ? `<p class="dir"><b>The second vote.</b> ${A.length + 1} sat down tonight, more than sixteen, so the house takes two. ${esc((P(t.firstExiled) || {}).name || "The first")} is gone, and the boards go up again. The Casting Vote belonged to the first vote: in this one, a tie goes to a revote.</p>` : t.exiles === 2 ? `<p class="dir"><b>Two votes tonight.</b> More than sixteen at the table, so after this exile and its reveal the boards go up again.</p>` : ""}
${questBox(s, "Forsworn Errand still open:")}${say(SAY.talk(s.round) + (wap ? (sec ? SAY.talkChampionSecret : SAY.talkChampion(wap.name)) : wp ? (sec ? SAY.talkBladeSecret : SAY.talkBlade(wp.name)) : "") + (ghostsOf(s).length && !t.second ? SAY.ghostCall : ""))}${talk}${notes}${layBtn}`, foot: nextBtn("Talk’s over. Chalk a name", "act(s=>{s.table.stage='votes';s.table.talkEnd=null})") };
  }
  if (stage === "votes") {
    if (ballotEdit && !(P(ballotEdit) && P(ballotEdit).alive)) ballotEdit = null;
    const rv = (t.revote || []).map(id => P(id)).filter(Boolean), rvNames = rv.map(p => p.name).join(" and ");
    const cur = ballotEdit ? P(ballotEdit) : nextVoter(s), targets = cur ? A.filter(p => p.id !== cur.id && !imm.includes(p.id) && (!t.revote || t.revote.includes(p.id))) : [];
    const entry = cur ? `<p class="ask">${esc(cur.name)}${cur.id === w ? " ⚔ (the Casting Vote: it breaks a tie, if there is one, once every board is in)" : ""} chalked…</p><div class="plist">${targets.map(p => pbtn(p, ballots[cur.id] === p.id ? "sel" : "", "ballotEdit=null;castBallot('" + cur.id + "','" + p.id + "')", v[p.id] ? String(v[p.id]) : "")).join("")}</div><div class="row"><button class="ghost" onclick="ballotEdit=null;castBallot('${cur.id}','blank')">Blank or spoilt board</button>${ballotEdit ? `<button class="ghost" onclick="ballotEdit=null;renderHost()">Cancel change</button>` : ""}</div>` : `<p class="note">Every board is in.</p>`;
    const ranked = A.filter(p => v[p.id]).sort((a, b) => v[b.id] - v[a.id]);
    const tallyRows = ranked.map(p => `<div class="vote"><span>${ART.seal(p)}${esc(p.name)}</span><b class="n num">${v[p.id]}</b></div>`).join("") || `<p class="note">No votes yet.</p>`;
    const done = A.filter(p => p.id in ballots).map(p => { const tg = ballots[p.id], tp = tg !== "blank" && P(tg); return `<div class="vote"><span>${ART.seal(p)}${esc(p.name)} → ${tp ? esc(tp.name) : "blank"}${p.id === w ? " ⚔" : ""}</span><button class="wide" onclick="ballotEdit='${p.id}';renderHost()">Change</button></div>` }).join("");
    const nudge = !rv.length || nIn ? tableNudge(s) : null;
    return { body: `<h2>Reckoning</h2><p class="step-head">${rv.length ? "Revote between " + esc(rvNames) : "2 · The boards"}, ${nIn} of ${A.length} in</p>${nIn ? "" : say(rv.length ? SAY.revote(rvNames) : SAY.table(s.round))}${notes}${layBtn}${nudge ? `<div class="say nudge">${esc(nudge)}</div>` : ""}${entry}<h3>tally</h3>${tallyRows}<div class="row"><button class="${t.showDots ? "sel" : ""}" onclick="act(s=>{s.table.showDots=!s.table.showDots})">${t.showDots ? "Tally shown on TV" : "Show tally on TV"}</button>${nIn ? `<button onclick="ballotEdit=null;clearBallots()">Clear all and revote</button>` : ""}</div>${done ? `<h3>boards so far</h3>${done}` : ""}`,
      foot: backBtn("act(s=>{s.table.stage='talk'})") + `<button class="primary" onclick="ballotEdit=null;toExile()" ${nIn === A.length ? "" : "disabled"}>${nIn === A.length ? "All boards in. The exile" : (A.length - nIn) + " still to record"}</button>` };
  }
  const cand = A.filter(p => !imm.includes(p.id)), max = Math.max(0, ...cand.map(p => v[p.id] || 0)), lead = cand.filter(p => (v[p.id] || 0) === max && max > 0);
  return { body: `<h2>Reckoning</h2><p class="step-head">3 · The exile</p>${lead.length > 1 && t.revote ? say(SAY.stillTied(andList(lead.map(p => p.name)))) + dir("Still tied after the revote. When the rest agree a name, or you decide, tap it below.")
 : ""}${lead.length > 1 ? `<div class="secret"><b>Tie:</b> ${esc(andList(lead.map(p => p.name)))} on ${max}. Revote between them, or pick one below.<div class="row"><button class="primary" onclick="ballotEdit=null;revoteTied()">Revote between ${esc(lead.map(p => p.name).join(" and "))}</button></div></div>` : lead.length ? `<p class="note">Most votes: <b>${esc(lead[0].name)}</b> (${max}).</p>` : `<p class="note">Not one name was chalked. Revote, or tap a name if the table agrees on one.</p>`}<div class="plist">${cand.map(p => pbtn(p, lead.length === 1 && lead[0].id === p.id ? "sel" : "", "exile('" + p.id + "')", (p.role === "cloak" ? "F · " : "") + (v[p.id] || 0))).join("")}</div>`, foot: backBtn("toVotes()") + `<button class="ghost" onclick="ballotEdit=null;revoteAll()">Everyone revotes</button>` };
}
function seatSheet(s) {
  if (!seatOpen) return "";
  const ps = seated(s);
  return `<div class="sheet"><div class="sheethead"><h2>Seating order</h2><button class="primary slim" onclick="seatOpen=false;renderHost()">Done</button></div><p class="note">Clockwise round the table. The TV’s Reckoning and candles follow this order, and votes are taken in it.</p>${ps.map((p, i) => `<div class="vote"><span>${ART.seal(p)}${i + 1}. ${esc(p.name)}${p.alive ? "" : " ✝"}</span><button onclick="moveSeat('${p.id}',-1)" ${i ? "" : "disabled"} aria-label="Move up">↑</button><button onclick="moveSeat('${p.id}',1)" ${i < ps.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button></div>`).join("")}<button class="primary" onclick="seatOpen=false;renderHost()">Done</button></div>`;
}


/* ---- night ---- */
function nightHost(s) {
  const n = s.night, script = nightScript(n, s), step = Math.min(n.step, script.length - 1);
  if (!n.confirmed) {
    return `<h2>Night ${s.round}</h2>${dir("The TV shows a holding card. Nothing starts until you begin.")}${advicePanel()}<h3>Tonight, by your plan</h3>${Object.keys(MODES).filter(k => modeOn(s, k)).length > 1 ? `<div class="row">${Object.keys(MODES).filter(k => modeOn(s, k) || n.mode === k).map(k => `<button class="${n.mode === k ? "sel" : ""}" onclick="act(s=>{s.night.mode='${k}';s.night.answer=null})">${modeLabel(k, s)}</button>`).join("")}</div>` : ""}<p class="wp"><b>${modeLabel(n.mode, s)}.</b> ${esc(MODES[n.mode].desc)}</p>${killsOf(n) > 1 ? dir(`<b>${cap1(numWord(killsOf(n)))} victims tonight.</b> With ${alive().length} at the table the Forsworn point once for each, one pass at a time, so the evening still reaches the final.`) : ""}${(n.questOpts || []).length ? `<h3>Errand</h3><p class="note">One is chosen for tonight. Tap another to change it. ‹a Loyal player› is named when they read it, and it is never tonight’s victim.</p><div class="mlist">${n.questOpts.filter(o => !o.poison || n.mode === "murder").map(o => `<button class="${n.quest === o.text ? "sel" : ""}" onclick="questPick(${o.i})">${o.target ? `<em>${esc(o.target)} only</em>` : ""}<small style="font-size:15.5px;color:var(--tallow)">${esc(o.text.replace(/\{F\}/g, "‹a Loyal player›"))}</small></button>`).join("")}</div>${n.quest ? `<div class="row"><button onclick="act(s=>{s.night.quest=null;s.night.questTarget=null})">No Errand tonight</button></div>` : ""}` : ""}`;
  }
  // each control appears on the line it belongs to: the picker while they point, the answer while they nod or shake
  const cur = norm(script[step] || {}); let pick = "", tapNote = "";
  const chosen = n.mode === "murder" ? n.victimId : n.targetId, cp = chosen ? P(chosen) : null;
  if (cur.pick && n.mode === "murder") pick = `<h3>${killsOf(n) > 1 ? "Victim " + ((n.pass || 0) + 1) + " of " + killsOf(n) : "The victim"} <small>tap as they point</small></h3><div class="plist">${candles().filter(p => !(n.victims || []).includes(p.id)).map(p => pbtn(p, n.victimId === p.id ? "sel" : "", "act(s=>{s.night.victimId='" + p.id + "'})", p.shield ? "⛨" : "")).join("")}</div>`;
  else if (cur.pick) pick = `<h3>The target <small>tap as they point</small></h3><div class="plist">${candles().map(p => pbtn(p, n.targetId === p.id ? "sel" : "", "act(s=>{s.night.targetId='" + p.id + "';s.night.targetName=P2(s,'" + p.id + "').name;s.night.answer=null})", p.shield ? "⛨" : "")).join("")}</div>`;
  else if (cur.answer) pick = `<h3>their answer</h3><div class="row"><button class="${n.answer === "yes" ? "sel" : ""}" onclick="act(s=>{s.night.answer='yes'})" ${n.targetId ? "" : "disabled"}>Nodded: joins</button><button class="${n.answer === "no" ? "sel" : ""}" onclick="act(s=>{s.night.answer='no'})" ${n.targetId ? "" : "disabled"}>Shook: refused</button></div>`;
  else if (cp) pick = `<p class="note">${n.mode === "murder" ? "Victim" : "Target"}: <b>${esc(cp.name)}</b>${cp.shield ? " ⛨" : ""}${n.mode !== "murder" && n.answer ? " · " + (n.answer === "yes" ? "accepted" : "refused") : ""}. Go back to the pointing line to change it.</p>`;
  const vid = n.mode === "murder" ? n.victimId : n.targetId, vp = vid ? P(vid) : null;
  if (cur.tap === "victim") tapNote = `<div class="secret">${!vp ? "<b>Nobody picked yet.</b>" : vp.shield ? "<b>DO NOT TAP.</b> " + esc(vp.name) + " holds Sanctuary. Walk the full circle at the same pace, pause behind two or three people, tap nobody." : "<b>Tap " + esc(vp.name) + " now.</b> They read the screen, then blindfold back on. Walk the full circle either side of them."}</div>`;
  if (cur.tap === "target") tapNote = `<div class="secret">${n.targetId && P(n.targetId) ? "<b>Tap " + esc(P(n.targetId).name) + " now.</b> They read the screen." : "Pick the target first."}</div>`;
  if (cur.poisoned) tapNote = `<div class="secret">${vp && vp.shield ? "They hold Sanctuary, so nobody was tapped. Wait ten seconds so the room hears nothing, then next." : "They read it and blindfold up again. Nobody leaves until dawn."}</div>`;
  if (cur.tap === "cloaks") tapNote = `<div class="secret"><b>Tap every Forsworn now:</b> ${esc(cloaks().filter(p => p.id !== n.targetId).map(p => p.name).join(", "))}.</div>`;
  if (cur.answer) tapNote = `<div class="secret"><b>Watch them.</b> Nod = accepted, shake = refused. Record below.</div>`;
  return `<h2>Night ${s.round}: ${modeLabel(n.mode, s)}${killsOf(n) > 1 ? " · " + ((n.pass || 0) + 1) + "/" + killsOf(n) : ""}</h2>${(n.victims || []).length ? `<p class="note">Already chosen tonight: ${esc(n.victims.map(id => P(id) ? P(id).name + (P(id).shield ? " ⛨" : "") : "?").join(", "))}.</p>` : ""}${stepList(script, step)}${tapNote}${pick}`;
}
function nightFoot(s) {
  const n = s.night, script = nightScript(n, s), step = Math.min(n.step, script.length - 1), cur = norm(script[step] || {}), nxt = norm(script[step + 1] || {});
  if (!n.confirmed) return `<button class="primary" onclick="beginNight()">Begin the night: ${modeLabel(n.mode, s)}</button>`;
  const back = step > 0 ? backBtn("act(s=>{s.night.step=Math.max(0," + (step - 1) + ")})") : "";
  let block = "";
  if (nxt.tap === "victim" && !(n.mode === "murder" ? n.victimId : n.targetId)) block = "Pick the victim first";
  if (cur.pick && !(n.mode === "murder" ? n.victimId : n.targetId)) block = n.mode === "murder" ? "Pick the victim first" : "Pick the target first";
  if (nxt.tap === "target" && !n.targetId) block = "Pick the target first";
  if (cur.answer && !n.answer) block = "Record their answer first";
  if (nxt.pending) block = "Record their answer first";
  if (step < script.length - 1) return back + `<button class="primary" onclick="act(s=>{s.night.step=${step + 1}})" ${block ? "disabled" : ""}>${block || "Next line"}</button>`;
  const ready = n.mode === "murder" ? !!n.victimId : !!(n.targetId && n.answer);
  if (n.mode === "murder" && (n.pass || 0) < killsOf(n) - 1) return back + `<button class="primary" onclick="nextVictim()" ${ready ? "" : "disabled"}>${ready ? "Next victim, " + numWord((n.pass || 0) + 2) + " of " + numWord(killsOf(n)) : "Pick the victim first"}</button>`;
  return back + `<button class="primary" onclick="finishNight()" ${ready ? "" : "disabled"}>${ready ? "To dawn" : "Pick the outcome first"}</button>`;
}

/* ---- the final two / honour or betray ---- */
function final2Host(s) {
  if (!s.final2.shown) { setTimeout(() => { if (state.final2 && !state.final2.shown) act(x => { const f = x.final2; f.shown = []; f.showRoles = false; f.cloakIds = null; aliveOf(x).forEach(p => p.revealed = false) }, "Ceremony reset, seals hidden again") }, 0); return { body: "", foot: "" } }
  const f = s.final2, A = alive(), ts = A.filter(p => p.role === "cloak"), nT = ts.length, shown = f.shown || []; let body = "", foot = "";
  const left = A.filter(p => !shown.includes(p.id));
  if (left.length) {
    // the reveal: the host turns each seal, in any order; the TV shows nothing until a name is tapped
    const nxt = left[0];
    body = `<h2>The final ${A.length === 2 ? "two" : A.length}</h2>${shown.length ? "" : say(A.length === 2 ? SAY.final2 : SAY.ceremony(A.length))}${say(SAY.ceremonyReveal)}<div class="secret">${nT ? plural(nT, "Forsworn") + " still at the table: " + esc(ts.map(p => p.name).join(", ")) + ". The Forsworn win once every seal is turned." : "No Forsworn left. The Loyal win once every seal is turned."} Nothing shows on the TV until you tap a name.</div><h3>Turn a seal <small>hold a name for the drumroll, let go to reveal</small></h3><div class="plist">${left.map(p => `<button class="hold" onpointerdown="holdStart('seal','${p.id}',event)" onclick="holdClick('seal','${p.id}')" oncontextmenu="return false">${ART.seal(p)}<span class="nm">${esc(p.name)}</span><span class="tagx">${p.role === "cloak" ? "F" : ""}</span></button>`).join("")}</div>${shown.length ? `<p class="note">Turned: ${esc(shown.map(id => P(id).name + " (" + (P(id).role === "cloak" ? "Forsworn" : "Loyal") + ")").join(", "))}.</p>` : ""}`;
    foot = holdBtn("Turn " + esc(nxt.name) + "’s seal", "seal", nxt.id, "danger");
    return { body, foot };
  }
  if (nT >= 2 && !f.order) { const done = ts.filter(p => f.votes[p.id]).length; body = `<h2>Honour or Betray</h2>${say(SAY.final2Cloaks)}<p class="note">Hand the phone to each Forsworn in turn. ${done}/${nT} voted.</p><div class="plist">${ts.map(p => pbtn(p, f.votes[p.id] ? "dim" : "", "handoff={kind:'take',id:'" + p.id + "'};renderHost()", f.votes[p.id] ? "✓" : "")).join("")}</div>`; foot = `<button class="primary" onclick="startTakeReveal()" ${done === nT ? "" : "disabled"}>${done === nT ? "All voted. Reveal on the TV" : "Waiting for " + (nT - done) + " more"}</button>` }
  else if (nT >= 2) {
    const all = f.revealed >= f.order.length, st = ts.filter(p => f.votes[p.id] === "take"), g = f.ghostRound;
    body = `<h2>Honour or Betray</h2><p class="note">Revealing ${Math.min(f.revealed, f.order.length)}/${f.order.length}.</p>`;
    if (!all) foot = nextBtn("Reveal next", "act(s=>{s.final2.revealed++})");
    else if (st.length >= 2 && !g) {
      const gs = ghostScores(s).filter(x => x.hits);
      if (gs.length >= 2) { body += `<p class="note">They all stole. ${gs.length} Ghosts named a Forsworn: ${esc(gs.map(x => x.p.name).join(", "))}. They now honour or betray between them.</p>`; foot = nextBtn("Ghosts’ honour or betray", "startGhostRound()") }
      else { body += `<p class="note">${gs.length === 1 ? esc(gs[0].p.name) + " named a Forsworn from beyond the table, so the prize is theirs." : "No Ghost named a Forsworn. You keep the prize."}</p>`; foot = nextBtn("Show every role", "finishGame()", "danger") }
    }
    else if (g) {
      const done = g.ids.filter(id => g.votes[id]).length;
      if (!g.order) { body += `<h3>ghosts’ honour or betray</h3>${say(SAY.ghostTake(andList(g.ids.map(id => P(id).name))))}<p class="note">Hand the phone to each Ghost. ${done}/${g.ids.length} voted.</p><div class="plist">${g.ids.map(id => pbtn(P(id), g.votes[id] ? "dim" : "", "handoff={kind:'take',id:'" + id + "'};renderHost()", g.votes[id] ? "✓" : "")).join("")}</div>`; foot = `<button class="primary" onclick="startGhostReveal()" ${done === g.ids.length ? "" : "disabled"}>${done === g.ids.length ? "All voted. Reveal on the TV" : "Waiting for " + (g.ids.length - done) + " more"}</button>` }
      else foot = g.revealed < g.order.length ? nextBtn("Reveal next", "act(s=>{s.final2.ghostRound.revealed++})") : nextBtn("Show every role", "finishGame()", "danger");
    }
    else foot = nextBtn("Show every role", "finishGame()", "danger");
  }
  else { body = `<h2>${nT ? "The Forsworn win" : "The Loyal win"}</h2>${say(SAY.allSealsTurned)}${dir("Next the TV shows who takes the prize and every role, and you read the ending.")}
`; foot = nextBtn("Show every role", "finishGame()", "danger") }
  return { body, foot };
}
