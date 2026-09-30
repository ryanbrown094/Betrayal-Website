/* ===================== The Betrayal, Modern: every phone, the director, and the optional TV =====================
   The server runs the game (worker/src/modern.js). This page joins, polls what this phone may see, and sends taps.
   /join                 enter the Table code and your name
   /m/CODE               a player's phone (#create: the host sets up the game from the home page)
   /t/CODE  or  #tv      the TV: codes, questions, answers, the Reckoning, and never a secret */
let PATH = location.pathname, CODE = ((PATH.match(/^\/[mt]\/([A-Za-z0-9]{6})/) || [])[1] || "").toUpperCase();
const TOKKEY = "bt-m-" + CODE, REQKEY = "bt-mreq-" + CODE;
const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (e) {} } };
let SITE = location.host, tools = 0, peekList = null, narr = false, saidKey = "", saidBits = [], replaying = false, lastKey = "", tok = CODE ? store.get(TOKKEY) : null, V = null, off = 0, last = "", busy = false, toast = "", toastT = 0, rejoin = [], online = true, pollT = 0;
const TESTGAME = location.hash === "#create-bots" || (() => { try { return sessionStorage.getItem("bt-test-" + CODE) === "1"; } catch (e) { return false; } })();
let screen = /^#replay-/.test(location.hash) ? "replay" : !CODE ? "join" : /^#create/.test(location.hash) ? "create" : location.hash === "#tv" || (PATH.startsWith("/t/") && !tok && innerWidth >= 700) ? "tv" : PATH.startsWith("/t/") && !tok ? "choose" : tok ? "play" : "join";
const isTV = () => screen === "tv" || (screen === "replay" && location.hash === "#replay-tv");
const $ = (s) => document.querySelector(s), app = () => $(isTV() ? "#tvapp" : "#app");
const now = () => Date.now() + off;
const tnow = () => (V && V.paused ? V.paused : now()); // the game's clock, which stands still while the host has paused
const P = (id) => (V && V.players.find((p) => p.id === id)) || { name: "?", color: "#ae6249" };
const N = (id) => esc(P(id).name);
const seal = (id) => ART.seal(P(id));
const alive = () => V.players.filter((p) => p.alive);
const ico = (n) => ART.icon(n);
const andList = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const plural = (n, w, ws) => n + " " + (n === 1 ? w : ws || w + "s");
// the prize at the end: with the default prize, the Purse in chocolate coins (one per 100 points, worked out by the server)
const prizeText = (r) => (r.coins == null ? r.prize : r.coins ? plural(r.coins, "chocolate coin") : "No chocolate coins");
const clock = (end, from) => `<span class="clock" data-end="${end}"></span>` + (from ? `<div class="bar"><i data-from="${from}" data-end="${end}"></i></div>` : "");
const btn = (label, a, v, cls, extra) => `<button class="btn ${cls || ""}" data-a="${a}"${v != null ? ` data-v="${esc(v)}"` : ""}${extra || ""}>${label}</button>`;

// ---------------------------------------------------------------------------------------------------------------
async function api(path, body) {
  const r = await fetch("/api/g/" + (CODE || body.code) + "/" + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(tok ? { "X-Tok": tok } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = await r.json().catch(() => ({ error: "The server didn’t answer properly." }));
  return { ok: r.ok, status: r.status, j };
}
function take(j) {
  if (j.now) off = j.now - Date.now();
  if (j.view) { V = j.view; off = V.now - Date.now(); }
  if (j.rejoin) rejoin = j.rejoin; else if (j.view) rejoin = [];
  if (j.peek) peekList = j.peek;
}
async function poll() {
  clearTimeout(pollT);
  if (screen === "play" || screen === "tv" || screen === "wait") {
    try {
      if (screen === "wait") {
        const r = await api("m/join", { req: store.get(REQKEY) });
        if (r.j.tok) { tok = r.j.tok; store.set(TOKKEY, tok); store.set(REQKEY, null); screen = "play"; }
        else if (r.j.gone) { store.set(REQKEY, null); screen = "join"; say(r.j.error, true); }
      } else {
        const r = await api("m?v=" + (V ? V.ver : "") + "&me=" + (V && V.me ? V.me.id : ""));
        if (r.j.none) { if (r.j.classic) return (location.href = "/t/" + CODE); V = null; screen = screen === "tv" ? "tv" : "nogame"; }
        else take(r.j);
      }
      online = true;
    } catch (e) { online = false; }
    draw();
  }
  const it = V && V.trial && V.trial.item, fast = it && it.k === "snap" && it.stage === "open";
  pollT = setTimeout(poll, fast ? 350 : document.hidden ? 4000 : 1200);
}
async function send(a) {
  if (busy) return; busy = true; document.body.classList.add("busy");
  try {
    const r = await api("m/act", a);
    if (r.j.lost) { tok = null; store.set(TOKKEY, null); screen = "join"; say("This phone lost its place. Type your name to ask the host to let you back in.", true); }
    else { take(r.j); if (r.j.error) say(r.j.error, true); }
  } catch (e) { say("Can’t reach the game. Check you’re online.", true); }
  busy = false; document.body.classList.remove("busy"); draw();
}
function say(t, err) { toast = t ? (err ? "!" : "") + t : ""; clearTimeout(toastT); if (t) toastT = setTimeout(() => { toast = ""; draw(); }, 5000); draw(); }

// ---------------------------------------------------------------------------------------------------------------
// drawing: the screen is rebuilt only when it changes, keeping whatever is being typed and where
function draw() {
  const root = app(); if (!root) return;
  const html = isTV() ? tvScreen() : phone();
  if (html === last) return clocks();
  const keep = {}; root.querySelectorAll("input[id],textarea[id],select[id]").forEach((x) => (keep[x.id] = x.value));
  const focus = document.activeElement && document.activeElement.id, sel = focus && document.activeElement.selectionStart;
  root.innerHTML = html; last = html;
  // a new screen fades in; the same screen with a new count or clock doesn't
  const k = root.querySelector("[data-k]"), key = screen + (k ? k.dataset.k : "");
  if (k && key !== lastKey) { k.classList.add("fade"); if (key && lastKey) cue(); } lastKey = key;
  if (isTV() && narr) speak();
  for (const [id, v] of Object.entries(keep)) { const x = document.getElementById(id); if (x && v) x.value = v; }
  if (focus) { const x = document.getElementById(focus); if (x) { x.focus(); try { x.setSelectionRange(sel, sel); } catch (e) {} } }
  else { const a = root.querySelector("[autofocus]"); if (a && matchMedia("(pointer:fine)").matches) a.focus(); }
  document.body.classList.toggle("night", !!V && V.phase === "night");
  clocks(); buzzNew();
}
// ---------------------------------------------------------------------------------------------------------------
// a phone put down on the table: it stays awake, and buzzes (where the phone can) when something needs its player
let wake = null, buzzed = "", buzzEnd = "";
async function keepAwake() { try { if (navigator.wakeLock && !wake && !document.hidden) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch (e) {} }
document.addEventListener("pointerdown", keepAwake);
const vib = (p) => { try { if (navigator.vibrate && screen === "play" && !isTV()) navigator.vibrate(p); } catch (e) {} };
function needsMe() {
  if (!V || !V.me || V.paused || V.me.left) return "";
  const me = V.me, t = V.trial, it = t && t.item;
  if (V.phase === "roles" && !me.acked) return "roles";
  if (me.victim) return "victim";
  if (!me.alive) return "";
  if (t && t.stage === "intro") return "trial" + V.round + t.key;
  if (it && it.stage === "prep" && it.k === "truths" && it.teller === me.id) return "turn" + t.i;
  if (it && it.stage === "open" && it.k === "actor" && it.actor === me.id) return "turn" + t.i;
  if (V.phase === "vote") return "vote" + V.round + (V.vote.second ? "b" : "") + (V.vote.tie ? "t" : "");
  if (V.phase === "night") return "night" + V.round;
  if (V.phase === "trust") return "trust" + V.round;
  if (V.phase === "honour" && me.role === "f") return "honour";
  return "";
}
function buzzNew() { const k = needsMe(); if (k && k !== buzzed) { if (buzzed || k !== "roles") vib([70, 50, 70]); buzzed = k; } }
// when this phone still owes an answer: the clock it has to beat
function owedEnd() {
  if (!V || !V.me || !V.me.alive || V.paused) return 0;
  const me = V.me, it = V.trial && V.trial.item;
  if (it && it.stage === "open" && it.mine == null && (["text", "number", "hilo", "vote", "word", "recall", "cell", "tempt"].includes(it.k) || (it.k === "rps" && it.vs) || (it.k === "truths" && it.teller !== me.id))) return it.end;
  if (V.phase === "vote" && !V.vote.mine) return V.vote.voteEnd;
  if (V.phase === "night" && V.night && !V.night.done) return V.night.end;
  return 0;
}
function buzzLate() { const e = owedEnd(); if (!e) return; const r = Math.ceil((e - now()) / 1000); if (r > 0 && r <= 10 && buzzEnd !== String(e)) { buzzEnd = String(e); vib(160); } }
function clocks() {
  const t = tnow();
  document.querySelectorAll("[data-end].clock").forEach((c) => { const s = Math.max(0, Math.ceil((+c.dataset.end - t) / 1000)); c.textContent = s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : s + "s"; c.classList.toggle("low", s <= 5); });
  document.querySelectorAll("i[data-from]").forEach((b) => { const a = +b.dataset.from, e = +b.dataset.end; b.style.width = Math.max(0, Math.min(100, (100 * (e - t)) / Math.max(1, e - a))) + "%"; });
}
setInterval(() => { const it = V && V.trial && V.trial.item; if (it && it.k === "snap" && it.stage === "open") draw(); else clocks(); tickSound(); buzzLate(); if (typeof AC !== "undefined" && AC && V) MUSIC.setScene(sceneOf()); }, 200);

// ---------------------------------------------------------------------------------------------------------------
// before the game: join, create, choose
const brand = (m) => `<div class="brand">${ART.crest()}<div class="t">The Betrayal</div><div class="m">${m || "modern"}</div></div>`;
function joinScreen() {
  return `${brand()}<div class="card fade"><h2>Join a game</h2><p class="sub">Everyone plays on their own phone, and your role never leaves this screen.</p>
  <div class="stack">${CODE ? `<p>Table <b class="num">${CODE}</b></p>` : `<div><label class="l" for="code">Table code</label><input class="f code" id="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" enterkeyhint="next"></div>`}
  <div><label class="l" for="name">Your name</label><input class="f" id="name" maxlength="14" autocomplete="given-name" placeholder="As the table knows you" enterkeyhint="go"${CODE ? " autofocus" : ""}></div>
  ${btn("Join", "join", null, "big")}</div>${msg()}</div>`;
}
function createScreen() {
  if (TESTGAME) return `${brand("test game")}<div class="card fade"><h2>A test game against bots</h2>
  <p class="sub">Table ${CODE}. You host, and the bots swear, vote, choose at night and trust by themselves. Trials give everyone a random score, and every countdown is ten seconds.</p>
  <label class="l" for="name">Your name</label><input class="f" id="name" maxlength="14" autocomplete="given-name" autofocus enterkeyhint="go">
  <div style="height:10px"></div><label class="l" for="nbots">Players, you included</label><select class="f" id="nbots">${Array.from({ length: 17 }, (_, i) => i + 8).map((n) => `<option${n === 8 ? " selected" : ""}>${n}</option>`).join("")}</select>
  <div style="height:12px"></div>${btn("Start the test game", "create", null, "big")}${msg()}</div>`;
  return `${brand()}<div class="card fade"><h2>You’re the host</h2>
  <p class="sub">Table ${CODE}. You start each Trial and call the breaks and the Reckoning from your phone. The rest runs itself, and you never see anyone’s role.</p>
  <label class="l" for="name">Your name</label><input class="f" id="name" maxlength="14" autocomplete="given-name" autofocus enterkeyhint="go">
  <div style="height:12px"></div>${btn("Open the Table", "create", null, "big")}${msg()}</div>`;
}
function chooseScreen() {
  return `${brand()}<div class="card fade"><h2>Table ${CODE}</h2><p class="sub">This Table is playing Modern, so everyone plays on their own phone.</p><div class="stack">${btn("Join as a player", "goplay", null, "big")}${btn("Use this screen as the TV", "gotv", null, "ghost")}</div></div>`;
}
const msg = () => `<p class="msg${toast[0] === "!" ? " err" : ""}" role="status">${esc(toast.replace(/^!/, ""))}</p>`;

// ---------------------------------------------------------------------------------------------------------------
// a player's phone
function phone() {
  if (screen === "join") return joinScreen();
  if (screen === "create") return createScreen();
  if (screen === "choose") return chooseScreen();
  if (screen === "wait") return `${brand()}<div class="card fade center"><h2>Asking the host…</h2><p class="sub">The game has started. The host’s phone will ask them to let you back in.</p></div>`;
  if (screen === "nogame") return `${brand()}<div class="card fade center"><h2>Not open yet</h2><p class="sub">Table ${CODE} hasn’t been set up. The host opens it first, then you can join.</p></div>`;
  if (!V || !V.me) return `${brand()}<p class="center sub">Connecting…</p>`;
  const me = V.me;
  if (me.left) return `${brand()}<div class="card fade center"><h2>You’ve left the game</h2><p class="sub">The host has taken you out of this one. Thanks for playing, and keep what you know to yourself.</p></div>`;
  if (screen === "replay") return phone0(me, phase(me));
  if (peekList) return topBar(me) + peekScreen();
  if (tools && me.director) return topBar(me) + toolScreen(me);
  return phone0(me, phase(me));
}
const topBar = (me) => `<div class="top"><span class="me">${seal(me.id)}<span class="nm">${esc(me.name)}</span>${me.director ? `<i class="hosttag">host</i>` : ""}</span><span class="row" style="flex:none;gap:12px"><span class="pot num">${["lobby", "oath", "roles"].includes(V.phase) ? "Table " + CODE : "Purse " + V.pot}</span>${me.director && screen !== "replay" && !V.paused && !["lobby", "end"].includes(V.phase) ? `<button class="btn ghost sm tbtn" data-a="pause" aria-label="Pause the game"><span class="pz" aria-hidden="true"><i></i><i></i></span><span class="lbl">Pause</span></button>` : ""}${me.director && screen !== "replay" ? `<button class="btn ghost sm tbtn" data-a="tools" aria-label="Host tools">${tools ? "Close" : "Tools"}</button>` : ""}</span></div>`;
function phone0(me, body) {
  return `${topBar(me)}
  ${rejoinCard()}${!me.alive && !["lobby", "oath", "roles", "end", "dawn", "reveal"].includes(V.phase) && !(V.trial && V.trial.key === "statue") ? `<div class="banner ghost">${ico("ghost")}<span>You’re a Ghost. You still watch, cheer and call it at the Reckoning, but you don’t vote or play.</span></div>` : ""}
  ${holdings(me)}
  ${toast ? `<div class="banner" role="status"><span>${esc(toast.replace(/^!/, ""))}</span></div>` : ""}
  <div data-k="${V.phase}.${V.trial ? V.trial.stage + V.trial.i + (V.trial.item ? V.trial.item.stage : "") : ""}">${body}</div>${online ? "" : `<div class="live">Reconnecting…</div>`}${pauseBox(me)}`;
}
// what this player holds, as small chips (tap for the full wording); left off the Trial result, which announces a win itself
function holdings(me) {
  if (V.phase === "trial" && V.trial && V.trial.stage === "done") return "";
  const c = [];
  if (me.shield) c.push(["sanct", "shield", "Sanctuary tonight", "Nobody can take you tonight. Keep it to yourself."]);
  if (me.cast) c.push(["", "scales", "The Casting Vote", "If a Reckoning ties and you voted for one of them, your vote decides it. Once. Nobody knows it’s you."]);
  if (me.crown && !["talk", "vote"].includes(V.phase)) c.push(["", "crown", "The Crown", "Once, at a Reckoning, lay it down to be safe from that exile."]);
  if (me.confess) c.push(["ghost", "eye", me.confess === "self" ? "The Confessor: nobody else" : "A Forsworn: " + esc(me.confess), me.confess === "self" ? "The Confessor’s prize: no other Forsworn is left at the table. It’s just you." : "The Confessor’s prize: " + esc(me.confess) + " is Forsworn. Only you know."]);
  return c.length ? `<div class="chips">${c.map(([cls, i, t, why]) => `<details class="chip ${cls}"><summary>${ico(i)}<span>${t}</span></summary><p>${why}</p></details>`).join("")}</div>` : "";
}
function rejoinCard() {
  if (!V.me.director || !rejoin.length) return "";
  return rejoin.map((r) => `<div class="card hot"><p><b>${esc(r.name)}</b> is asking to come back in on a new phone. Only let them in if it’s really them.</p><div class="row">${btn("Let them in", "letin", r.id, "sm")}${btn("No", "keepout", r.id, "ghost sm")}</div></div>`).join("");
}
// the host stopped the clocks: everything waits, and nothing can be answered, until they carry on
const pauseBox = (me) => (!V.paused ? "" : `<div class="pausebox" role="dialog" aria-label="Paused"><div><h1>The game is paused</h1><p class="sub">${me && me.director ? "Every clock has stopped. Carry on when the table is ready." : "The clocks have stopped. " + esc(V.director ? V.director.name : "The host") + " will carry on in a moment."}</p>${me && me.director && screen !== "replay" ? btn("Carry on", "pause", "off", "big") + `<div style="height:10px"></div>` + btn("Host tools", "tools", null, "ghost sm") : ""}</div></div>`);
const dirCard = (inner) => (V.me.director ? `<div class="card dir">${inner}</div>` : "");
const LINES = ["Watch who talks the most.", "Someone here swore the Oath and didn’t mean it.", "A quiet player is a careful player.", "Nobody here is as calm as they look.", "Who looked away just then?"];
const waitHost = () => (V.me.director ? "" : `<div class="waiting">${ART.crest()}<p>Waiting for ${esc(V.director ? V.director.name : "the host")}</p><em>${LINES[(V.round + V.phase.length) % LINES.length]}</em></div>`);
function people(list, mark) { return `<ul class="people">${list.map((p) => `<li class="${p.alive ? "" : "dead"} ${mark ? (mark(p) ? "ok" : "wait") : ""}">${ART.seal(p)}<b>${esc(p.name)}</b>${mark && mark(p) ? "<i>✓</i>" : ""}${p.bot ? `<span class="small">bot</span>` : ""}</li>`).join("")}</ul>`; }
const tally = (mark, w) => { const n = V.players.filter(mark).length; return `<p class="small" style="margin-top:10px">${n} of ${V.players.length} ${w}</p>`; };

function phase(me) {
  switch (V.phase) {
    case "lobby": return lobby(me);
    case "oath": return me.optIn ? `<h2>Sworn</h2><p class="sub">Waiting for everyone to take the Oath.</p>${people(V.players, (p) => p.optedIn)}${tally((p) => p.optedIn, "sworn")}${V.me.director ? `<p class="small">Someone stuck? Tools can deal the roles now.</p>` : ""}`
      : `<div class="eyebrow">the oath</div><h2>Would you like to be Forsworn?</h2><p class="sub">The Forsworn lie all evening, choose who dies each night and try to steal the prize. Nobody sees your answer. The game uses it when it deals the roles, but it can’t always give everyone what they asked for.</p>
        <div class="stack">${btn("Yes, make me Forsworn", "optin", "yes")}${btn("I’d rather be Loyal", "optin", "no", "ghost")}${btn("Either way", "optin", "any", "dark")}</div>`;
    case "roles": return roleCard(me);
    case "day": return day(me);
    case "trial": return trial(me);
    case "break": return `<div class="eyebrow">a break</div><h1>${esc(V.brk.name)}</h1><p class="bigclock">${clock(V.brk.end)}</p><p class="sub">Eat, drink and plot quietly.</p>${dirCard(`<div class="row">${btn("+5 minutes", "brkMore", null, "dark sm")}${btn("End the break", "brkEnd", null, "sm")}</div>`)}`;
    case "talk": return `<div class="eyebrow">the reckoning${V.vote.second ? " · the second exile" : ""}</div><h1>Make your accusations</h1><p class="bigclock">${clock(V.vote.talkEnd)}</p><p class="sub">Voting opens on every phone when the time is up.</p>${crownCard(me)}`;
    case "vote": return vote(me);
    case "reveal": return reveal(me);
    case "night": return night(me);
    case "dawn": return dawn(me);
    case "trust": return trust(me);
    case "unmask": return `<div class="eyebrow">the unmasking</div><h1>Who were they?</h1>${unmaskList()}`;
    case "honour": return honour(me);
    case "end": return end(me);
  }
  return "";
}
function lobby(me) {
  const n = V.players.length, url = SITE + "/join";
  let h = `<h2>You’re in</h2><p class="sub">Friends join at <b>${esc(url)}</b> with the code <b class="num">${CODE}</b>.</p>${people(V.players)}<p class="small" style="margin-top:10px">${plural(n, "player")} · 8 to 24 can play</p>`;
  if (!me.director) return h + waitHost();
  const o = V.opts || {};
  if (V.test) h += `<div class="banner">Test game: the bots play themselves, Trials score at random, and every countdown is ten seconds.</div><div class="row" style="margin-bottom:14px">${btn("Add a bot", "bots", String(n + 1), "dark sm")}</div>`;
  const two = (k, a, b) => `<div class="grid2">${[a, b].map(([v, t]) => `<button class="btn ${o[k] === v ? "on" : "dark"} sm" data-a="opt" data-k="${k}" data-v="${v}">${t}</button>`).join("")}</div>`; // v may be true/false
  h += `<div class="card dir"><h2 class="sec">Before you start</h2>
  <label class="l">Sanctuary</label>${two("shield", ["secret", "Secret"], ["public", "Public"])}
  <p class="small">${o.shield === "public" ? "Everyone sees who won Sanctuary." : "Only the winner knows they hold Sanctuary. (A Forsworn winner gets nothing, and learns so.)"}</p>
  <label class="l" for="prize">The prize</label><input class="f" id="prize" maxlength="80" value="${esc(o.prize || "")}" data-opt="prize">${o.coins ? `<p class="small">Every 100 points in the Purse is one chocolate coin.</p>` : ""}
  <details class="more"${(o.prizes || []).length ? " open" : ""}><summary>Better prizes for a fuller Purse</summary><p class="small">Optional. If the Forsworn win it works the other way: half empty wins them the better prize, empty the best. Nobody sees these until the end.</p>
  <label class="l" for="tier1">At a half-full Purse</label><input class="f" id="tier1" maxlength="80" placeholder="e.g. champagne" value="${esc(((o.prizes || []).find((x) => x.at === 0.5) || {}).what || "")}" data-tier="1">
  <div style="height:8px"></div><label class="l" for="tier2">At a full Purse</label><input class="f" id="tier2" maxlength="80" placeholder="e.g. dinner out" value="${esc(((o.prizes || []).find((x) => x.at === 1) || {}).what || "")}" data-tier="1"></details>
  <label class="l" style="margin-top:12px">Twists</label>${two("twists", [true, "On"], [false, "Off"])}
  <p class="small">${o.twists ? "Once each: the Casting Vote, the Crown, and the Confessor in the final." : "No twists: Sanctuary and the Temptation only."}</p>
  <label class="l">Eating as you play?</label>${two("courses", [true, "Yes, in courses"], [false, "No"])}
  <p class="small">${o.courses ? "Dinner in courses: a starter, a main and dessert are served between the rounds." : "No meal breaks. Turn this on to serve dinner in courses between the rounds. You can always call a short break."}</p>
  <div style="height:12px"></div>${btn(n < 8 ? `Waiting for ${8 - n} more` : `Start with ${n} players`, "start", null, "big", n < 8 ? " disabled" : "")}
  <p class="small center">For the TV, if you want one, open <b>${esc(SITE)}/t/${CODE}</b> on a laptop and cast it.</p></div>`;
  return h;
}
let peek = false;
function roleCard(me) {
  if (me.acked) return `<div class="done">${ico("handshake")}<div>Role seen. Waiting for everyone else…</div></div><div style="height:12px"></div>${people(V.players, (p) => p.acked)}${tally((p) => p.acked, "ready")}`;
  if (!peek) return `<div class="veil" data-a="peek"><div><div class="eyebrow">your role</div><h2>Hold your phone close</h2><p class="sub">Tap here when nobody can see your screen.</p></div></div>`;
  const f = me.role === "f";
  return `<div class="card role ${f ? "f" : "l"}"><div class="sigil">${ART.bigSeal(f ? "t" : "good", f ? "blade" : "candle")}</div><h1>${f ? "Forsworn" : "Loyal"}</h1>
  <p class="sub">${f ? "You took the Oath and never meant it. Each night, choose who dies on your phone. Blend in, vote with the table, and reach the end unmasked to steal the prize, and every point the Purse falls short of its target. So sabotage the Trials, quietly." : "You are true to the table. Win Trials to fill the Purse (if you win, it’s yours; if the Forsworn win, they take whatever it falls short), find the Forsworn, and exile them at the Reckoning before they pick you off."}</p>
  ${f ? (me.allies && me.allies.length ? `<p>Your fellow Forsworn: <b>${me.allies.map((a) => esc(a.name)).join(", ")}</b></p>` : `<p>You are the only Forsworn. Trust nobody.</p>`) : ""}
  ${btn("Got it. Hide my role", "ack")}</div>`;
}
function day(me) {
  let h = `${V.final ? "" : `<div class="eyebrow">round ${V.round}</div>`}<h1>${V.final ? "The final" : V.roundTrials ? "Back at the table" : "A new day"}</h1>
  <p class="sub">${V.final ? "Five or fewer remain. An exile’s role stays hidden until the end. When the table trusts everyone left, it ends." : "Talk among yourselves, and watch each other."}</p>${people(V.players)}`;
  h += `<p class="small" style="margin-top:12px">Next: <b>${esc(V.next || "")}</b>${V.tiers ? " · the Purse decides the prize" : ""}</p>`;
  if (!me.director) return h + waitHost();
  return h + `<div class="card dir"><div class="stack">${btn("Begin: " + esc(V.next || "next"), "next", null, "big")}${btn("A short break first · 10 min", "break", "interval", "ghost sm")}</div></div>`;
}
// ---- the host's tools: for when something goes wrong. Each asks first; the roles ask three times, and everyone is told
// at the end that the host looked.
function toolScreen(me) {
  const it = V.trial && V.trial.item, t = V.trial, list = [];
  const add = (label, v, why, cls) => list.push(`<div class="tool"><div><b>${label}</b><br><span class="small">${why}</span></div>${btn("Do it", "tool", v, "dark sm" + (cls ? " " + cls : ""))}</div>`);
  if (V.phase === "oath") add("Deal the roles now", "deal", "For anyone who hasn’t answered the Oath: they’re dealt in as “either way”.");
  if (V.phase === "roles") add("Begin the game", "begin", "As if everyone had tapped “Got it”.");
  if (V.phase === "day" && me.canSkip) add("Skip “" + esc(V.next) + "”", "skipStep", "Leave it out and go to the next step.");
  if (t && t.stage === "intro") add("Start the Trial now", "skip", "Skip the rest of the introduction.");
  if (it && ["open", "study", "prep", "blank"].includes(it.stage)) add("Close this question now", "skip", "Whatever has been answered counts.");
  if (t && t.stage !== "done") add("End this Trial now", "endTrial", "It’s scored as it stands.");
  if (V.phase === "talk") add("Open the vote now", "voteNow", "Cut the talking short.");
  if (V.phase === "vote") add("Close the vote now", "closeVote", "Counts the votes in; nobody else can vote.");
  if (V.phase === "night") add("End the night now", "dawnNow", "Anyone who hasn’t chosen is chosen for.");
  const others = V.players.filter((p) => p.id !== me.id);
  const people2 = (a) => `<div class="pick ${pickCls()}">${others.map((p) => `<button data-a="tool" data-v="${a}" data-who="${p.id}">${ART.seal(p)}<span class="nm">${esc(p.name)}</span></button>`).join("")}</div>`;
  return `<h2>Host tools</h2><p class="sub">For when something goes wrong. Nothing here shows you anyone’s role, except the last one.</p>
  <div class="stack">${list.join("") || `<p class="small">Nothing to fix at this moment.</p>`}</div>
  <details class="more"><summary>Take someone out of the game</summary><p class="small">If someone is ill or has to go home. They leave for good, and nobody is told their role. If nobody Forsworn is left, the final begins.</p>${people2("remove")}</details>
  <details class="more"><summary>Make someone else the host</summary><p class="small">Their phone gets these controls, and yours loses them.</p>${people2("host")}</details>
  <details class="more"><summary>Music on this phone</summary><p class="small">If there’s no TV, this phone can play the music and sounds.</p>${btn(typeof AC !== "undefined" && AC ? (muted ? "Sound on" : "Sound off") : "Play music here", "sound", null, "dark sm")}</details>
  <div class="card" style="margin-top:18px;border-color:#6a2733"><p class="small"><b style="color:var(--blood2)">The last resort.</b> Only if the game can’t carry on otherwise, say a phone died and nobody remembers who was Forsworn.</p>${btn("Show me the roles…", "peek1", null, "ghost sm")}</div>`;
}
function peekScreen() {
  return `<h2>Everyone’s role</h2><p class="sub">Put this away as soon as you can. Everyone will be told at the end that you looked.</p>
  <ul class="score">${peekList.map((p) => `<li>${esc(p.name)}${p.alive ? "" : " (out)"}<span class="n" style="color:${p.role === "f" ? "var(--blood2)" : "#bfe0d3"}">${p.role === "f" ? "Forsworn" : "Loyal"}</span></li>`).join("")}</ul>
  <div style="height:14px"></div>${btn("Hide them", "unpeek", null, "big")}`;
}
// ---- the Trials
function trial(me) {
  const t = V.trial, it = t.item;
  if (t.stage === "intro") return `<div class="eyebrow">trial${t.special === "cast" ? " · the Casting Vote to the winner" : t.special === "crown" ? " · the Crown to the winner" : t.special === "secret" ? " · a special prize" : t.prize ? " · Sanctuary to the winner" : ""}</div><h1>${esc(t.title)}</h1><p>${esc(t.rules)}</p>
    ${me.role === "f" && t.key !== "tempt" && t.key !== "likely" ? `<div class="banner">Forsworn: every wrong answer costs the Purse 50, and if you win you take every point it falls short, so sabotage quietly.</div>` : ""}
    <p class="sub">Starts in ${clock(t.introEnd)}</p>`;
  if (t.stage === "done") return trialDone(me);
  if (!it) return "";
  const head = `<div class="ihead"><div class="eyebrow">${esc(t.title)} · ${it.part ? esc(it.part) + " · " : ""}${it.stage === "reveal" ? t.i : t.i + 1}</div>${it.stage === "open" || it.stage === "study" || it.stage === "prep" ? clock(it.end) : ""}</div>${["open", "study", "prep", "blank"].includes(it.stage) && it.end && it.from ? `<div class="bar sticky"><i data-from="${it.from}" data-end="${it.end}"></i></div>` : ""}`;
  const watching = !me.alive && !(it.k === "survive" && t.key === "statue");
  if (!me.alive && it.k === "survive" && t.key === "statue" && it.stage === "open") return head + `<p class="q">You’re a Ghost, so haunt them.</p><p class="sub">Make the statues move or laugh, anything short of touching. Still standing: ${esc(andList(alive().filter((p) => !it.out.includes(p.id)).map((p) => p.name)))}.</p>`;
  return head + (it.stage === "reveal" ? itemReveal(me, it) : watching ? tvItem(it, true) : itemPlay(me, it));
}
function sent(v) { return `<div class="done">${ico("handshake")}<div>Locked in${v != null && v !== "" ? `: <b>${esc(v)}</b>` : ""}.<br><span class="small">${it().answered} of ${it().of || "?"} in</span></div></div>`; }
const it = () => V.trial.item;
const form = (id, type, ph, label, extra) => `<div class="row"><input class="f" id="${id}" type="${type}" ${type === "number" ? 'inputmode="decimal"' : ""} placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" autofocus${extra || ""}></div><div style="height:10px"></div>${btn(label || "Send", "ansf", id, "big")}`;
function itemPlay(me, x) {
  switch (x.k) {
    case "text": return `<p class="q">${esc(x.q)}</p>` + (x.mine != null ? sent(x.mine) : form("a" + V.trial.i, "text", "Your answer", "Send"));
    case "number": return `<p class="q">${esc(x.q)}</p>` + (x.mine != null ? sent(x.mine) : form("a" + V.trial.i, "number", "A number", "Guess"));
    case "hilo": return `<p class="q">${esc(x.q)}</p><p>Is it higher or lower than <b class="ans num">${x.ref}</b>?</p>` + (x.mine ? sent(x.mine) : `<div class="grid2">${btn("Higher", "ans", "higher", "big")}${btn("Lower", "ans", "lower", "big")}</div>`);
    case "vote": return `<p class="q">${esc(x.q)}</p>` + (x.mine ? sent(P(x.mine).name) : `<div class="pick ${pickCls()}">${alive().map((p) => `<button data-a="ans" data-v="${p.id}">${ART.seal(p)}<span class="nm">${esc(p.name)}</span></button>`).join("")}</div>`);
    case "word": return `<p class="sub">The longest real word from these letters. You can change it until time’s up.</p><div class="letters">${[...x.letters].map((c) => `<span>${c}</span>`).join("")}</div>` + (x.mine ? `<div class="done">${ico("scroll")}<div>Your word: <b>${esc(String(x.mine).toUpperCase())}</b></div></div><div style="height:10px"></div>` : "") + form("w" + V.trial.i, "text", "Your word", x.mine ? "Change it" : "Send", '');
    case "recall":
      if (x.stage === "study") return `<p class="sub">Remember these. They vanish in a moment.</p><div class="words">${x.words.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`;
      return `<p class="sub">Type every word you remember, separated by commas or new lines. You can send again to add more.</p><textarea class="f" id="r${V.trial.i}" autofocus autocapitalize="off" spellcheck="false">${esc(x.mine || "")}</textarea><div style="height:10px"></div>${btn(x.mine ? "Update my list" : "Send my list", "ansf", "r" + V.trial.i, "big")}`;
    case "cell":
      if (x.stage === "study") return `<p class="sub">Study the grid.</p>${cells(x.grid)}`;
      if (x.stage === "blank") return `<p class="sub">Something is changing…</p><div class="cells blank">${"<span></span>".repeat(12)}</div>`;
      return `<p class="sub">Tap what changed. The first right answer scores double.</p>` + (x.mine != null ? cells(x.grid, null, +x.mine) + sent() : cells(x.grid, true));
    case "snap": {
      const i = Math.floor((tnow() - x.start) / x.step), sym = i < 0 ? null : x.syms[x.seq[Math.min(i, x.seq.length - 1)]];
      const prev = i > 0 ? x.syms[x.seq[Math.min(i - 1, x.seq.length - 1)]] : null;
      return `<div class="snapsym">${sym ? ico(sym) : `<p class="sub">Get ready… ${clock(x.start)}</p>`}</div>${prev ? `<p class="small center snapprev">before: ${ico(prev)}</p>` : ""}${btn("SNAP", "ans", null, "big blood snapbtn")}<p class="small center">Tap only when the symbol matches the one before. A wrong tap loses a point.${x.myTaps ? " Your snaps: " + x.myTaps + "." : ""}</p>`;
    }
    case "rps":
      if (x.vs) return `<p class="q">You vs <b>${N(x.vs)}</b></p>` + (x.mine ? sent(x.mine) : `<div class="grid3">${["rock", "paper", "scissors"].map((v) => btn(v[0].toUpperCase() + v.slice(1), "ans", v, "big")).join("")}</div>`);
      return x.bye === me.id ? `<p class="q">You have a bye this bout.</p><p class="sub">Sit this one out.</p>` : `<p class="q">You’re out.</p><p class="sub">Watch the rest battle it out.</p>`;
    case "survive": {
      const out = x.out.includes(me.id);
      return `<p class="q">${V.trial.key === "statue" ? "Freeze." : "On one leg."}</p><p class="sub">${out ? "You’re out. Watch the rest." : "Last one standing wins. If you’re out, tap it honestly."}</p>${out ? "" : btn("I’m out", "out", null, "big blood")}
        <p class="small">Still in: ${alive().filter((p) => !x.out.includes(p.id)).map((p) => esc(p.name)).join(", ")}</p>
        ${V.me.director ? `<details class="more"><summary>Mark someone out</summary><div class="pick ${pickCls()}">${alive().filter((p) => !x.out.includes(p.id)).map((p) => `<button data-a="out" data-who="${p.id}">${ART.seal(p)}<span class="nm">${esc(p.name)}</span></button>`).join("")}</div></details>` : ""}`;
    }
    case "actor":
      if (x.actor !== me.id) return `<p class="q">${N(x.actor)} is up.</p><p class="sub">${V.trial.key === "hum" ? "Name that song." : "Shout your guess."} When someone gets it, ${N(x.actor)} taps who.</p>`;
      return `<div class="card hot center"><div class="eyebrow">yours, secretly</div><p class="ans">${esc(x.word)}</p></div><p class="sub">${V.trial.key === "hum" ? "Hum it. No words." : V.trial.key === "draw" ? "Draw it. No letters or numbers." : "Act it out. No words, no sounds."} Who got it?</p>
        <div class="pick ${pickCls()}">${alive().filter((p) => p.id !== me.id).map((p) => `<button data-a="guess" data-v="${p.id}">${ART.seal(p)}<span class="nm">${esc(p.name)}</span></button>`).join("")}</div><div style="height:10px"></div>
        <div class="row">${btn("Nobody got it", "guess", "none", "ghost sm")}${x.skips < 2 ? btn("A different one", "reword", null, "dark sm") : ""}</div>`;
    case "truths":
      if (x.teller === me.id) {
        if (x.stage === "prep") return `<p class="q">Your turn: two truths and a lie.</p><p class="sub">Choose which one will be the lie, tell all three to the table, then tap “All told”.</p><div class="grid3">${[1, 2, 3].map((n) => btn("No. " + n, "lie", n, x.lie === n ? "on" : "dark")).join("")}</div><div style="height:10px"></div>${btn("All told. Open the vote", "told", null, "big", x.lie ? "" : " disabled")}${x.lie ? "" : `<p class="small center">Choose which one is the lie first.</p>`}`;
        return `<p class="q">The table is voting on your lie.</p><p class="sub">${x.answered} of ${x.of} voted.</p>`;
      }
      if (x.stage === "prep") return `<p class="q">${N(x.teller)} is telling you three things.</p><p class="sub">Listen closely. One is a lie.</p>`;
      return `<p class="q">Which was ${N(x.teller)}’s lie?</p>` + (x.mine ? sent("No. " + x.mine) : `<div class="grid3">${[1, 2, 3].map((n) => btn("No. " + n, "ans", n, "big")).join("")}</div>`);
    case "tempt":
      return `<p class="q">PURSE or SELF?</p><p class="sub">Exactly one SELF: they take Sanctuary and the Purse grows by ${V.trial.offer}. Nobody: it grows by ${V.trial.offer * 2}. Two or more: nobody gets it, and the Purse loses ${V.trial.offer}.</p>` + (x.mine ? sent(x.mine.toUpperCase()) : `<div class="grid2">${btn("PURSE", "ans", "purse", "big verd")}${btn("SELF", "ans", "self", "big blood")}</div>`);
  }
  return "";
}
function cells(grid, tap, mine, hit) { return `<div class="cells">${grid.map((c, i) => (tap ? `<button data-a="ans" data-v="${i}" aria-label="${c}">${ico(c)}</button>` : `<span class="${hit && hit.includes(i) ? "hit" : ""} ${mine === i ? "mine" : ""}">${ico(c)}</span>`)).join("")}</div>`; }
function itemReveal(me, x) {
  const r = x.res || {}, pts = r.pts || {}, mine = pts[me.id];
  const said = x.mine != null && x.mine !== "" ? " You said “" + esc(String(x.mine).slice(0, 40)) + "”." : "";
  const you = !me.alive ? "" : mine > 0 ? `<p class="you good">+${mine} for you</p>` : mine < 0 ? `<p class="you bad">${mine} for you</p>` : ["text", "number", "hilo", "cell", "word", "recall"].includes(x.k) ? `<p class="you">${x.mine != null ? "Not this time." + said : "You didn’t answer in time."}</p>` : "";
  const names = (ids) => (ids && ids.length ? ids.map((id) => esc(P(id).name)).join(", ") : "nobody");
  switch (x.k) {
    case "text": return `<p class="q">${esc(x.q)}</p><p class="ans">${esc(x.a)}</p><p>Right: ${names(r.right)}${r.first ? ` · fastest ${N(r.first)}` : ""}</p>${you}` +
      (V.me.director && x.wrong && x.wrong.length ? `<details class="more"><summary>Mark a near miss right</summary>${x.wrong.filter(([, v]) => String(v).trim()).map(([id, v]) => `<div class="row" style="margin:6px 0"><span>${N(id)}: “${esc(v)}”</span>${btn("Accept", "accept", id, "ghost sm")}</div>`).join("") || `<p class="small">No wrong answers to accept.</p>`}</details>` : "");
    case "number": return `<p class="q">${esc(x.q)}</p><p class="ans num">${x.a}</p><p>Closest: ${names(r.closest)}</p>${you}`;
    case "hilo": return `<p class="q">${esc(x.q)}</p><p class="ans num">${x.a}</p><p>${r.truth === "higher" ? "Higher" : "Lower"} than ${x.ref}. Right: ${names(r.right)}</p>${you}`;
    case "vote": return `<p class="q">${esc(x.q)}</p><p class="ans">${names(r.top)}</p><p class="sub">${(r.counts || []).map(([id, n]) => N(id) + " " + n).join(" · ")}</p>`;
    case "word": return `<div class="letters">${[...x.letters].map((c) => `<span>${c}</span>`).join("")}</div><ul class="score">${(r.words || []).sort((a, b) => b[1].length - a[1].length).map(([id, w, ok]) => `<li>${seal(id)}${N(id)}<span class="n">${esc(w)}${ok ? "" : " ✗"}</span></li>`).join("")}</ul>${you}`;
    case "recall": return `<div class="words">${(x.words || []).map((w) => `<span>${esc(w)}</span>`).join("")}</div><div style="height:10px"></div>${you}`;
    case "cell": return `<p class="sub">This changed:</p>${cells(x.grid, false, x.mine != null ? +x.mine : null, x.changed)}<p>Right: ${names(r.right)}</p>${you}`;
    case "snap": return `<p class="q">Snap!</p><p>Snaps caught: ${names(r.hits)}</p>${you}`;
    case "rps": { const mb = (r.bouts || []).find((q) => q[0] === me.id || q[2] === me.id);
      return `<ul class="score rps">${(r.bouts || []).map(([a, x1, b, y, w]) => `<li><span>${N(a)} <i>${x1}</i></span><span class="v">v</span><span><i>${y}</i> ${N(b)}</span><em>${w ? N(w) + " goes through" : "Draw · both go through"}</em></li>`).join("")}</ul>${mb ? `<p class="you ${!mb[4] || mb[4] === me.id ? "good" : "bad"}">${!mb[4] ? "A draw, so you go through." : mb[4] === me.id ? "You go through." : "You’re out."}</p>` : ""}`; }
    case "survive": return `<p class="q">Last standing: ${names(r.still)}</p>`;
    case "actor": return `<p class="sub">${N(r.actor)}’s was</p><p class="ans">${esc(r.word)}</p><p>${r.guess && r.guess !== "none" ? N(r.guess) + " got it" : "Nobody got it"}</p>${you}`;
    case "truths": return `<p class="q">${N(r.teller)}’s lie was No. ${r.lie}</p><p>Right: ${names(r.right)} · fooled ${r.fooled}</p>${you}`;
    case "tempt": return `<p class="q">${r.self === 1 ? "One SELF." : r.self ? r.self + " SELFs." : "Nobody chose SELF."}</p><p class="sub">${r.self === 1 ? "They take Sanctuary tonight, and the Purse grows." : r.self ? "Too greedy. Nobody gets Sanctuary, and the Purse shrinks." : "The table held, so the Purse grows double."}</p>`;
  }
  return "";
}
const temptHead = (t) => (!t.last || !t.last.self ? "The table held" : t.last.self === 1 ? "Someone took it" : "Greed cost the table");
function trialDone(me) {
  const t = V.trial, sc = Object.entries(t.scores || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const w = t.winners && t.winners[0];
  let h = `<div class="eyebrow">${esc(t.title)} · the result</div><h1>${t.key === "tempt" ? temptHead(t) : t.special === "cast" ? "The Casting Vote is taken" : w ? esc(P(w).name) + " wins" : "No winner"}</h1>${t.special === "cast" ? `<p class="sub">Whoever won holds it now. Only they know.</p>` : ""}${w && t.byLot && t.key !== "tempt" ? `<p class="small">A tie at the top, settled by lot.</p>` : ""}
  <p class="ans num">${t.points >= 0 ? "+" + t.points : "−" + -t.points} <span class="small">to the Purse</span></p>${purse(V.pot)}${t.wrongF ? `<p class="small">The Forsworn gave ${plural(t.wrongF, "wrong answer")}, and the Purse paid for them.</p>` : ""}`;
  if (t.sanctPublic) h += `<div class="banner sanct">${N(t.sanctPublic)} takes Sanctuary for tonight.</div>`;
  if (me.wonSanct === "yes") h += `<div class="banner sanct">${ico("shield")}<span>You won Sanctuary. Nobody can take you tonight. ${t.sanctPublic ? "" : "Only you know."}</span></div>`;
  if (me.wonSanct === "wasted") h += `<div class="banner"><span>You won, but Sanctuary protects only the Loyal. Nobody else knows.</span></div>`;
  if (t.gave) h += `<div class="banner">${ico("crown")}<span>${t.gave === me.id ? "You take the Crown: Sanctuary tonight, and once, at a Reckoning, you can lay it down to be safe from that exile." : N(t.gave) + " takes the Crown."}</span></div>`;
  if (me.gave === "cast") h += `<div class="banner">${ico("scales")}<span>You won the Casting Vote. If a Reckoning ties and you voted for one of them, your vote decides it. Only you know.</span></div>`;
  if (me.gave === "confess") h += `<div class="banner ghost">${ico("eye")}<span>You won the Confessor’s prize: ${me.confess === "self" ? "no other Forsworn is left at the table." : "<b>" + esc(me.confess || "") + "</b> is Forsworn. Keep it to yourself."}</span></div>`;
  if (sc.length && t.key !== "tempt" && t.key !== "likely") h += `<ul class="score">${sc.map(([id, n]) => `<li class="${id === me.id ? "me" : ""}">${seal(id)}${N(id)}<span class="n">${n}</span></li>`).join("")}</ul>`;
  return h + dirCard(btn("Back to the table", "cont")) + waitHost();
}
// ---- the Reckoning
function vote(me) {
  const v = V.vote, cands = alive().filter((p) => p.id !== me.id && p.id !== v.immune && (!v.revote || v.revote.includes(p.id))).sort((a, b) => a.name.localeCompare(b.name));
  const head = `<div class="eyebrow">the reckoning${v.tie ? " · a tie: vote again" : ""}</div><h1>${me.alive ? "Who do you exile?" : "Call it, Ghost"}</h1>
  <p class="sub">${v.revote ? "A tie between " + esc(andList(v.revote.map((id) => P(id).name))) + ". " : ""}${me.alive ? "Your vote is secret until the count." : "Ghosts don’t vote, but if you call it right the table will know."} ${v.voted} of ${v.of} voted.</p>${v.voteEnd ? `<div class="ihead"><span class="small">Closes in</span>${clock(v.voteEnd)}</div>` : ""}${crownCard(me)}`;
  if (v.mine) return head + `<div class="done">${ico("scales")}<div>${me.alive ? "You voted" : "You called"} <b>${N(v.mine)}</b>.<br><span class="small">You can change it until everyone’s in.</span></div></div><div style="height:12px"></div>` + pickList(cands, "ballot", v.mine);
  return head + pickList(cands, "ballot");
}
function crownCard(me) {
  const v = V.vote;
  if (v.immune) return `<div class="banner">${ico("crown")}<span>${v.immune === me.id ? "You laid down the Crown, so nobody can exile you this Reckoning." : N(v.immune) + " laid down the Crown, and is safe from this exile."}</span></div>`;
  return me.crown ? `<div class="card hot"><p>${ico("crown")} You wear the Crown. Lay it down now and nobody can exile you this Reckoning. Once only.</p>${btn("Lay down the Crown", "crown", null, "dark")}</div>` : "";
}
// a table with long names gets one column of buttons, so no name is broken mid-word
const pickCls = () => (V.players.some((p) => p.name.length > 11) ? "one" : "");
const pickList = (list, a, on, badge) => `<div class="pick ${pickCls()}">${list.map((p) => `<button data-a="${a}" data-v="${p.id}" class="${on === p.id || (Array.isArray(on) && on.includes(p.id)) ? "on" : ""}">${ART.seal(p)}<span class="nm">${esc(p.name)}</span>${badge ? badge(p) : ""}</button>`).join("")}</div>`;
function reveal(me) {
  const r = V.reveal;
  let h = `<h1>${esc(r.name)} is exiled</h1><p class="sub">${(r.counts || []).map(([id, n]) => N(id) + " " + n).join(" · ")}</p>${r.cast ? `<p class="small">A tie, settled by the Casting Vote.</p>` : r.byLot ? `<p class="small">A tie, settled by lot.</p>` : ""}`;
  if (r.secret) h += `<p>In the final, the exiled go without a word.</p>`;
  else if (!r.role) h += `<div class="verdict wait">${ART.bigSeal("steel", "scales")}<div>They were… ${clock(r.roleAt)}</div></div>`;
  else h += `<div class="verdict ${r.role === "f" ? "f" : "l"}">${ART.bigSeal(r.role === "f" ? "t" : "good", r.role === "f" ? "blade" : "candle")}<div>${r.role === "f" ? "Forsworn" : "Loyal"}</div></div>${r.called && r.called.length ? `<p class="small center">The Ghosts who called it: ${esc(andList(r.called))}</p>` : ""}`;
  if (r.words) h += lastWords(r.name, r.words);
  if (me.id === r.id) h += `<div class="banner ghost">${ico("ghost")}<span>You’re a Ghost now. Stay at the table.</span></div>` + wordsForm(me);
  return h + (r.role || r.secret ? dirCard(btn("Continue", "cont")) : "");
}
const lastWords = (name, w) => `<blockquote class="lastw say">“${esc(w)}”<cite>${esc(name)}’s last words</cite></blockquote>`;
const wordsForm = (me) => (me.words == null ? "" : me.words ? "" : `<div class="card"><label class="l" for="lw">Your last words, for the whole table (optional, 140 characters)</label><input class="f" id="lw" maxlength="140" autocomplete="off" enterkeyhint="send" placeholder="One line for the table"><div style="height:10px"></div>${btn("Say it", "wordsf", "lw", "dark")}</div>`);
// each victim in turn: what the table once voted them most likely to do
const epitaphs = (d) => (d.victims || []).map((n) => { const q = (d.likely || []).find((x) => x[0] === n); return q ? `<p class="epitaph say">The table voted ${esc(n)} ${esc(q[1].replace(/^most/i, "most"))}. Now we’ll never find out.</p>` : ""; }).join("");
const nb = (n) => esc(n).replace(/ /g, "&nbsp;"); // a name never breaks across lines
function night(me) {
  const n = V.night;
  let h = `<div class="eyebrow">the night</div><h1>Heads down</h1><p class="sub">Everyone taps someone now, so nobody can tell who is choosing. Keep your screen hidden.</p>`;
  if (!me.alive) return `<div class="eyebrow">the night</div><h1>Heads down</h1><p class="sub">The Forsworn are choosing. Ghosts, watch in silence.</p>`;
  if (me.role === "f") {
    const votes = {}; for (const ps of Object.values(me.picks || {})) for (const nm of ps) votes[nm] = (votes[nm] || 0) + 1;
    h += `<div class="card hot"><p>${n.kills > 1 ? "Choose " + n.kills + ". The " + n.kills + " chosen most by the Forsworn are poisoned." : "Choose who is poisoned tonight. The one chosen most goes."}${me.sanct && me.sanct.length ? ` <b>${esc(andList(me.sanct))}</b> ${me.sanct.length > 1 ? "hold" : "holds"} Sanctuary.` : ""}</p>
    ${Object.entries(me.picks || {}).filter(([nm]) => nm !== me.name).map(([nm, ps]) => `<p class="small">${esc(nm)}: ${ps.length ? esc(andList(ps)) : "not yet"}</p>`).join("")}<p class="small">${(me.mine || []).length} of ${n.kills} chosen</p></div>`;
    const wh = me.whispers ? `<details class="more whisp"${me.whispers.length ? " open" : ""}><summary>Whisper to the Forsworn${me.whispers.length ? " · " + me.whispers.length : ""}</summary>${me.whispers.length ? `<ul class="whispers">${me.whispers.map(([n, m]) => `<li><b>${esc(n)}</b> ${esc(m)}</li>`).join("")}</ul>` : `<p class="small">Only the Forsworn see these.</p>`}<div class="wh">${(me.whisperSay || []).map((m, i) => btn(esc(m), "whisper", i, "dark sm")).join("")}</div></details>` : "";
    return h + pickList(me.targets.map(P), "pick", me.mine, (p) => (votes[p.name] ? `<b class="tag">${votes[p.name]}</b>` : "") + ((me.sanct || []).includes(p.name) ? `<b class="tag sanct">Sanctuary</b>` : "")) + (me.mine && me.mine.length >= n.kills ? `<p class="small center" style="margin-top:10px">Chosen. You can change it until everyone’s done.</p>` : "") + wh;
  }
  h += `<p>Who do you suspect most? Nothing happens to them; tapping only keeps the night secret.</p>`;
  return h + (n.done ? `<div class="done">${ico("moon")}<div>Done. Heads down until dawn.</div></div>` : pickList(alive().filter((p) => p.id !== me.id), "sleep"));
}
function dawn(me) {
  const d = V.dawn;
  if (!d.revealed) {
    if (me.victim) return `<div class="card hot center"><h1>You were poisoned</h1><p class="sub">Say nothing yet. When the host reveals the night, you get your last words.</p></div>` + dirCard(btn("Reveal the night", "cont"));
    return `<div class="eyebrow">dawn</div><h1>Heads up</h1><p class="sub">Who made it through the night?</p>` + dirCard(btn("Reveal the night", "cont")) + waitHost();
  }
  const v = d.victims || [];
  if (v.includes(me.name) && d.lastEnd) return `<div class="card hot center"><h1>Your last words</h1><p class="sub">Stand up, tell the table you were poisoned, and say what you like. Then you’re a Ghost.</p><p class="bigclock">${clock(d.lastEnd)}</p></div>` + dirCard(btn("On to the next round", "cont"));
  return `<div class="eyebrow">dawn</div><h1>${v.length ? andList(v.map(nb)) + (v.length > 1 ? " are" : " is") + " dead" : "Nobody died"}</h1>
  <p class="sub">${v.length ? "Poisoned in the night. Last words" + (d.lastEnd ? ": " + clock(d.lastEnd) : ".") : d.saved ? "Sanctuary held. The Forsworn struck, and failed." : "The night passed quietly."}</p>${v.includes(me.name) ? `<div class="banner ghost">${ico("ghost")}<span>You were poisoned. You’re a Ghost now.</span></div>` : ""}${epitaphs(d)}` + dirCard(btn("On to the next round", "cont")) + waitHost();
}
function trust(me) {
  const t = V.trust;
  if (t.result) return `<h1>${t.result === "trust" ? "The table trusts" : "Doubt"}</h1><p class="sub">${t.result === "trust" ? "Everyone chose Trust. The masks come off." : plural(t.count, "player") + " doubted. Another Reckoning."}</p>`;
  if (!me.alive) return `<div class="eyebrow">trust or doubt</div><h1>The survivors decide</h1><p class="sub">${t.voted} of ${t.of} have chosen.</p>`;
  return `<h1>Do you trust everyone left?</h1><p class="sub">If every survivor chooses Trust, the game ends and the masks come off. One Doubt, and there’s another Reckoning. No answer in time counts as Doubt.</p>${t.end ? `<p>${clock(t.end)}</p>` : ""}` +
    (t.mine ? `<div class="done">${ico("handshake")}<div>You chose <b>${t.mine.toUpperCase()}</b>.<br><span class="small">${t.voted} of ${t.of} in.</span></div></div>` : `<div class="grid2">${btn("Trust", "trust", "trust", "big verd")}${btn("Doubt", "trust", "doubt", "big blood")}</div>`);
}
function unmaskList() { const u = V.unmask; return `<ul class="score">${u.order.map((id, i) => `<li>${seal(id)}${N(id)}<span class="n" style="${i < u.shown ? "color:" + (P(id).role === "f" ? "var(--blood2)" : "#9ed3c0") : ""}">${i < u.shown ? (P(id).role === "f" ? "Forsworn" : "Loyal") : "…"}</span></li>`).join("")}</ul>`; }
function honour(me) {
  const h = V.honour;
  if (me.role !== "f" || !me.alive) return `<div class="eyebrow">the last betrayal</div><h1>The Forsworn decide</h1><p class="sub">They reached the end together. Now each chooses, in secret: share the prize, or betray the others for all of it.</p>`;
  return `<div class="eyebrow">the last betrayal</div><h1>Honour or betray?</h1><p class="sub">If every Forsworn honours, you share the prize. One betrayer takes it all. Two or more betrayers, and nobody gets it. If you don’t choose in time, you honour.</p>${h.end ? `<p>${clock(h.end)}</p>` : ""}` +
    (h.mine ? `<div class="done">${ico("blade")}<div>You chose <b>${h.mine.toUpperCase()}</b>.</div></div>` : `<div class="grid2">${btn("Honour", "honour", "honour", "big verd")}${btn("Betray", "honour", "betray", "big blood")}</div>`);
}
function end(me) {
  const r = V.result, fw = r.winner === "forsworn";
  return `<h1 class="disp">${fw ? "The Forsworn win" : "The Loyal win"}</h1>
  <p class="sub">${r.how === "betrayed" ? andList(r.to.map(esc)) + " betrayed the others at the last, and takes it all." : r.how === "nobody" ? "Too many betrayed, so nobody takes the prize." : r.to.length ? "The prize goes to " + andList(r.to.map(esc)) + "." : ""}</p>
  <div class="card center prize"><div class="eyebrow">the prize${r.tier ? " · " + (fw ? (r.pot <= 0 ? "an empty" : "a half-empty") : r.pot >= r.cap ? "a full" : "a half-full") + " Purse" : ""}</div><p class="ans">${esc(prizeText(r))}</p><p class="small">${fw ? "The Loyal built " + r.pot + " of " + r.cap + ", so the Forsworn take the " + r.won + " it fell short." : "The Purse: " + r.pot + " of " + r.cap + "."}${r.coins != null ? " One coin for every 100 points." : ""}</p></div>
  ${me.won ? `<div class="banner sanct">${ico("crown")}<span>You won.</span></div>` : ""}
  ${r.peeked && r.peeked.length ? `<p class="small">The host opened the roles in round ${r.peeked.join(", ")} (Tools, for when something went wrong).</p>` : ""}
  <h2 class="sec">Who was who</h2><ul class="roster">${V.players.slice().sort((a, b) => (a.role === "f" ? 0 : 1) - (b.role === "f" ? 0 : 1)).map((p) => `<li class="${p.role === "f" ? "f" : "l"}">${ART.seal(p)}<span>${esc(p.name)}${p.alive ? "" : ` <i>out</i>`}</span><em>${p.role === "f" ? "Forsworn" : "Loyal"}</em></li>`).join("")}</ul>
  ${r.awards && r.awards.length ? `<h2 class="sec">The awards</h2><ul class="score awards">${r.awards.map((a) => `<li>${seal(a.id)}<div><b>${esc(a.title)}</b><br><span class="small">${esc(a.name)} ${esc(a.why)}</span></div></li>`).join("")}</ul>` : ""}
  ${dirCard(btn("Play again with the same people", "again", null, "dark"))}`;
}

// ---------------------------------------------------------------------------------------------------------------
// the TV: never a secret
function tvScreen() {
  if (!V) return `<div class="tvmain">${brand("modern")}<p class="sub">${screen === "tv" && CODE ? "Table " + CODE + " isn’t set up yet." : "Connecting…"}</p></div>`;
  const url = esc(SITE) + "/join";
  const top = (V.test ? `<div class="tvtop" style="justify-content:center;color:var(--blood2)">test game · bots</div>` : "") + `<div class="tvtop"><span>${esc(V.title || "The Betrayal")} · ${V.final ? "the final" : V.round ? "round " + V.round : "table " + CODE}</span><span class="pot num">${V.phase === "lobby" ? "" : "Purse " + V.pot}</span></div>`;
  const btns = screen === "replay" ? "" : `<div class="tvbtns">${btn(typeof AC !== "undefined" && AC && !muted ? "Mute" : "Turn on sound", "sndtv", null, "ghost sm")}${"speechSynthesis" in window ? btn(narr ? "Narrator: on" : "Narrator: off", "narr", null, "ghost sm") : ""}</div>`;
  return top + btns + pauseBox(null) + `<div class="tvmain" data-k="${V.phase}.${V.trial ? V.trial.stage + V.trial.i + (V.trial.item ? V.trial.item.stage : "") : ""}">${tvBody(url)}</div>`;
}
function tvPeople(mark, roles, cls) { return `<div class="tvpeople ${V.players.length > 16 ? "many" : ""} ${cls || ""}">${V.players.map((p) => `<div class="p ${p.alive ? "" : "dead"} ${mark && mark(p) ? "ok" : ""} ${roles && p.role === "f" ? "f" : ""}">${ART.seal(p)}<span>${esc(p.name)}</span>${roles && p.role ? `<em class="${p.role === "f" ? "" : "l"}">${p.role === "f" ? "forsworn" : "loyal"}</em>` : ""}</div>`).join("")}</div>`; }
// the Purse as a meter, with the prize tiers marked
const purse = (pot) => `<div class="meter" role="img" aria-label="Purse ${pot} of ${V.potCap}"><i style="width:${Math.min(100, (100 * pot) / Math.max(1, V.potCap))}%"></i>${V.tiers ? `<b style="left:50%"></b>` : ""}<span>${pot} / ${V.potCap}</span></div>`;
function tvBody(url) {
  switch (V.phase) {
    case "lobby": return `<div class="tvcode">${qr()}<div><div class="c num">${CODE}</div><div class="u">Scan, or go to <b>${url}</b></div></div></div>${tvPeople()}<p class="tvcount">${plural(V.players.length, "player")} · 8 to 24</p>`;
    case "oath": return `<div class="eyebrow">the oath</div><h1>Swear on your phones</h1><p class="sub">Would you like to be Forsworn? Nobody sees your answer.</p>${tvPeople((p) => p.optedIn)}`;
    case "roles": return `<h1>Look at your role</h1><p class="sub">Hold your phone close. Tell no one.</p>${tvPeople((p) => p.acked)}`;
    case "day": return `<h1>${V.final ? "The final" : "Day " + V.round}</h1>${purse(V.pot)}${tvPeople(null, true)}<p class="tvcount">next: ${esc(V.next || "")}${V.tiers ? " · the Purse decides the prize" : ""}</p>`;
    case "break": return `<div class="eyebrow">a break</div><h1>${esc(V.brk.name)}</h1><p>${clock(V.brk.end)}</p>`;
    case "trial": {
      const t = V.trial, x = t.item;
      if (t.stage === "intro") return `<div class="eyebrow">trial${t.special === "cast" ? " · the Casting Vote to the winner" : t.special === "crown" ? " · the Crown to the winner" : t.special === "secret" ? " · a special prize" : t.prize ? " · Sanctuary to the winner" : ""}</div><h1 class="disp">${esc(t.title)}</h1><p class="sub">${esc(t.rules)}</p><p>${clock(t.introEnd)}</p>`;
      if (t.stage === "done") { const w = t.winners && t.winners[0], sc = Object.entries(t.scores || {}).sort((a, b) => (b[0] === w) - (a[0] === w) || b[1] - a[1]).slice(0, 10); return `<div class="eyebrow">${esc(t.title)}</div><h1>${t.key === "tempt" ? temptHead(t) : t.special === "cast" ? "The Casting Vote is taken" : w ? esc(P(w).name) + " wins" : "No winner"}</h1>${w && t.byLot && t.key !== "tempt" ? `<p class="tvcount">a tie at the top, settled by lot</p>` : ""}<p class="ans num">${t.points >= 0 ? "+" + t.points : "−" + -t.points} to the Purse</p>${purse(V.pot)}${t.gave ? `<p class="sub">${N(t.gave)} takes the Crown.</p>` : t.special === "cast" ? `<p class="sub">Whoever won holds it. Only they know.</p>` : t.special === "secret" && w ? `<p class="sub">The special prize is on their phone.</p>` : t.sanctPublic ? `<p class="sub">${N(t.sanctPublic)} takes Sanctuary.</p>` : t.prize && w ? `<p class="sub">Did they take Sanctuary? Only they know.</p>` : ""}${sc.length && !["tempt", "likely"].includes(t.key) ? `<ul class="tvscore">${sc.map(([id, n]) => `<li class="${id === w ? "win" : ""}">${seal(id)}${N(id)}<b>${n}</b></li>`).join("")}</ul>` : ""}`; }
      return x ? `<div class="eyebrow">${esc(t.title)} · ${x.stage === "reveal" ? t.i : t.i + 1}</div>` + (x.stage === "reveal" ? tvReveal(x) : tvItem(x)) : "";
    }
    case "talk": return `<div class="eyebrow">the reckoning</div><h1>Make your accusations</h1><p>${clock(V.vote.talkEnd)}</p>${tvPeople()}`;
    case "vote": return `<div class="eyebrow">the reckoning${V.vote.tie ? " · a tie" : ""}</div><h1>${V.vote.tie ? "Vote again" : "Vote on your phones"}</h1>${V.vote.revote ? `<p class="sub">Between ${esc(andList(V.vote.revote.map((id) => P(id).name)))}</p>` : ""}<p class="tvcount">${V.vote.voted} of ${V.vote.of} voted · ${clock(V.vote.voteEnd)}</p>${V.vote.immune ? `<p class="sub">${N(V.vote.immune)} laid down the Crown, and is safe from this exile.</p>` : ""}${tvPeople(V.vote.revote ? (p) => V.vote.revote.includes(p.id) : null)}`;
    case "reveal": { const r = V.reveal; return `<h1>${esc(r.name)} is exiled</h1><p class="sub">${(r.counts || []).map(([id, n]) => N(id) + " " + n).join(" · ")}${r.cast ? " · settled by the Casting Vote" : ""}</p>${r.secret ? `<p class="sub">In the final, the exiled go without a word.</p>` : r.role ? `<div class="verdict ${r.role === "f" ? "f" : "l"}">${ART.bigSeal(r.role === "f" ? "t" : "good", r.role === "f" ? "blade" : "candle")}<div>${r.role === "f" ? "Forsworn" : "Loyal"}</div></div>${r.called && r.called.length ? `<p class="sub">Called from beyond by ${esc(andList(r.called))}</p>` : ""}${r.words ? lastWords(r.name, r.words) : ""}` : `<div class="verdict wait">${ART.bigSeal("steel", "scales")}<div>They were…</div></div>`}`; }
    case "night": return `<div class="eyebrow">the night</div><h1>Heads down</h1><p class="sub">Everyone, tap your phone. The Forsworn are choosing.</p>`;
    case "dawn": { const d = V.dawn; return d.revealed ? `<div class="eyebrow">dawn</div><h1>${d.victims.length ? andList(d.victims.map(nb)) + (d.victims.length > 1 ? " are" : " is") + " dead" : "Nobody died"}</h1>${d.lastEnd ? `<p class="sub">Last words ${clock(d.lastEnd)}</p>` : d.saved ? `<p class="sub">Sanctuary held.</p>` : ""}${epitaphs(d) || tvPeople()}` : `<div class="eyebrow">dawn</div><h1>Heads up</h1><p class="sub">Who made it through the night?</p>`; }
    case "trust": return `<h1>${V.trust.result ? (V.trust.result === "trust" ? "The table trusts" : "Doubt") : "Do you trust everyone left?"}</h1><p class="tvcount">${V.trust.result ? "" : V.trust.voted + " of " + V.trust.of + " chosen" + (V.trust.end ? " · " + clock(V.trust.end) : "")}</p>`;
    case "unmask": { const keep = V.players; V.players = V.unmask.order.map(P); const h = `<div class="eyebrow">the unmasking</div><h1>Who were they?</h1>${tvPeople(null, true)}`; V.players = keep; return h; }
    case "honour": return `<div class="eyebrow">the last betrayal</div><h1>Honour or betray?</h1><p class="sub">The Forsworn choose, in secret.</p><p class="tvcount">${V.honour.made} of ${V.honour.of} chosen${V.honour.end ? " · " + clock(V.honour.end) : ""}</p>`;
    case "end": { const r = V.result, fw = r.winner === "forsworn";
      return `<div class="endgrid"><div class="endl"><h1 class="disp ${fw ? "blood" : ""}">${fw ? "The Forsworn win" : "The Loyal win"}</h1><div class="prizecard"><span>the prize</span><h2>${esc(prizeText(r))}</h2><p class="sub">${r.to.length ? "To " + esc(andList(r.to)) : "Nobody takes it"}${fw ? ", with the " + r.won + " the Purse fell short" : ", with the Purse of " + r.pot}</p></div>${r.peeked && r.peeked.length ? `<p class="tvcount">the host opened the roles in round ${r.peeked.join(", ")}</p>` : ""}</div>
      <div class="endr">${tvPeople(null, true, "end")}${r.awards && r.awards.length ? `<ul class="tvawards">${r.awards.slice(0, V.players.length > 16 ? 2 : 4).map((a) => `<li>${seal(a.id)}<span><b>${esc(a.title)}</b>${esc(a.name)} ${esc(a.why)}</span></li>`).join("")}</ul>` : ""}</div></div>`; }
  }
  return "";
}
let QRTO = ""; // a replay may point the QR code elsewhere: the marketing pictures' leads to the broken seal (/seal)
const joinURL = () => QRTO || (SITE === location.host ? location.origin : "https://" + SITE) + "/m/" + CODE;
function qr() { try { return `<div class="qrbox">${QR.svg(joinURL(), "#150b17", "#efe0d4")}</div>`; } catch (e) { return ""; } }
// the narrator: the TV reads each new screen's heading aloud (the browser's own voice; the button is the tap it needs)
function speak() {
  const m = document.querySelector("#tvapp .tvmain"); if (!m || !("speechSynthesis" in window)) return;
  const tx = (x) => x.textContent.trim().replace(/\s+/g, " "), key = m.dataset.k || "";
  const bits = [...m.querySelectorAll(".eyebrow, h1, h2, .sub, .ans")].map(tx).filter(Boolean).slice(0, 4).concat([...m.querySelectorAll(".say")].map(tx));
  const fresh = key === saidKey ? bits.filter((b) => !saidBits.includes(b)) : bits, text = fresh.join(". ");
  saidKey = key; saidBits = bits; if (!text) return;
  try { if (fresh === bits) speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text), v = speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang)); if (v) u.voice = v; u.rate = 0.95; speechSynthesis.speak(u); } catch (e) {}
}
// music follows the scene; a few moments get a sound (on the TV, or the host's phone when there's no TV)
const sceneOf = () => !V ? "lobby" : ({ lobby: "lobby", oath: "lobby", roles: "lobby", day: "day", trial: "mission", break: "mingle", talk: "table", vote: "table", reveal: "table", trust: "table", night: "night", dawn: "morning", unmask: "final", honour: "final", end: "final" })[V.phase] || "day";
let lastPh = "", beat = "";
function cue() {
  if (typeof AC === "undefined" || !AC || !V) return;
  MUSIC.setScene(sceneOf());
  const it = V.trial && V.trial.item, key = V.phase + (V.trial ? V.trial.stage + (it ? it.stage : "") : "") + (V.reveal && V.reveal.role ? "r" : "") + (V.dawn && V.dawn.revealed ? "d" : "");
  if (key === lastPh) return; lastPh = key;
  if (V.phase === "trial" && V.trial.stage === "intro") sfx("drum");
  else if (it && it.stage === "reveal") sfx("chime");
  else if (V.phase === "trial" && V.trial.stage === "done") sfx("gold");
  else if (V.phase === "talk" || V.phase === "vote") sfx("beat");
  else if (V.phase === "reveal") sfx(V.reveal.role ? "reveal" : "seal");
  else if (V.phase === "night") sfx("snuff");
  else if (V.phase === "dawn" && V.dawn.revealed) { sfx("dawn"); if (V.dawn.victims && V.dawn.victims.length) setTimeout(() => sfx("poison"), 1200); }
  else if (V.phase === "end") sfx("win");
}
function tickSound() {
  if (typeof AC === "undefined" || !AC) return;
  const c = document.querySelector(".clock[data-end]"); if (!c) return;
  if (V && V.paused) return;
  const r = Math.ceil((+c.dataset.end - now()) / 1000), k = c.dataset.end + ":" + r;
  if (r > 0 && r <= 5 && k !== beat) { beat = k; sfx("alarm", r); } else if (r === 0 && beat !== c.dataset.end) { beat = c.dataset.end; sfx("chime"); }
}
// the question as everyone sees it (the TV, and a Ghost's phone)
function tvItem(x, small) {
  const cnt = x.of ? (small ? `<p class="tvcount">${x.answered} of ${x.of} answered</p>` : tvPeople((p) => (x.who || []).includes(p.id), false, "answered")) : "", c = x.end && x.stage !== "reveal" ? `<p>${clock(x.end)}</p>${!small && x.from ? `<div class="bar tvbar"><i data-from="${x.from}" data-end="${x.end}"></i></div>` : ""}` : "";
  switch (x.k) {
    case "text": case "number": case "vote": return `<h2 class="${small ? "q" : ""}">${esc(x.q)}</h2>${c}${cnt}`;
    case "hilo": return `<h2>${esc(x.q)}</h2><p class="ans num">Higher or lower than ${x.ref}?</p>${c}${cnt}`;
    case "word": return `<div class="${small ? "letters" : "tvletters"}">${[...x.letters].map((l) => `<span>${l}</span>`).join("")}</div>${c}${cnt}`;
    case "recall": return x.stage === "study" ? `<div class="${small ? "words" : "tvwords"}">${x.words.map((w) => `<span>${esc(w)}</span>`).join("")}</div>${c}` : `<h2>Type every word you remember</h2>${c}${cnt}`;
    case "cell": return x.grid ? (small ? cells(x.grid) : `<div class="tvgrid">${x.grid.map((g) => `<span>${ico(g)}</span>`).join("")}</div>`) + c : `<h2>Something is changing…</h2>`;
    case "snap": { const i = Math.floor((tnow() - x.start) / x.step), sym = i < 0 ? null : x.syms[x.seq[Math.min(i, x.seq.length - 1)]]; return `<div class="${small ? "snapsym" : "tvsnap"}">${sym ? ico(sym) : "<h2>Get ready</h2>"}</div>`; }
    case "rps": return `<h2>Rock, paper, scissors</h2><div class="tvpairs">${x.pairs.map(([a, b]) => `<span>${N(a)} <i>v</i> ${N(b)}</span>`).join("")}${x.bye ? `<span>bye: ${N(x.bye)}</span>` : ""}</div>${c}<p class="tvcount">${x.answered} of ${x.of} chosen</p>`;
    case "survive": return `<h2>Still standing</h2><p class="sub">${alive().filter((p) => !x.out.includes(p.id)).map((p) => esc(p.name)).join(", ")}</p>`;
    case "actor": return `<h2>${N(x.actor)} is up</h2>${c}`;
    case "truths": return `<h2>${N(x.teller)}: two truths and a lie</h2>${x.stage === "open" ? `<p class="sub">Vote on your phones: No. 1, 2 or 3?</p>${cnt}` : ""}${c}`;
    case "tempt": return `<h2>PURSE or SELF?</h2><p class="sub">Choose on your phones, in secret.</p>${c}${cnt}`;
  }
  return "";
}
function tvReveal(x) {
  const r = x.res || {}, names = (ids) => (ids && ids.length ? ids.map((id) => esc(P(id).name)).join(", ") : "nobody");
  switch (x.k) {
    case "text": return `<h2>${esc(x.q)}</h2><p class="ans">${esc(x.a)}</p><p class="sub">Right: ${names(r.right)}</p>`;
    case "number": case "hilo": return `<h2>${esc(x.q)}</h2><p class="ans num">${x.a}</p><p class="sub">${x.k === "number" ? "Closest" : "Right"}: ${names(x.k === "number" ? r.closest : r.right)}</p>`;
    case "vote": return `<h2>${esc(x.q)}</h2><p class="ans">${names(r.top)}</p>`;
    case "word": { const best = (r.words || []).filter((w) => w[2]).sort((a, b) => b[1].length - a[1].length)[0]; return `<div class="tvletters">${[...x.letters].map((l) => `<span>${l}</span>`).join("")}</div><p class="ans">${best ? esc(best[1]) : "No real words"}</p><p class="sub">${best ? N(best[0]) : ""}</p>`; }
    case "recall": return `<div class="tvwords">${(x.words || []).map((w) => `<span>${esc(w)}</span>`).join("")}</div>`;
    case "cell": return `<div class="tvgrid">${x.grid.map((g, i) => `<span class="${(x.changed || []).includes(i) ? "hit" : ""}">${ico(g)}</span>`).join("")}</div><p class="sub">Right: ${names(r.right)}</p>`;
    case "snap": return `<h2>Snap!</h2><p class="sub">${names(r.hits)}</p>`;
    case "rps": return `<h2>${(r.bouts || []).map(([a, , b, , w]) => (w ? N(w) + " beats " + N(w === a ? b : a) : N(a) + " and " + N(b) + " draw")).join(" · ")}</h2>`;
    case "survive": return `<h2>Last standing: ${names(r.still)}</h2>`;
    case "actor": return `<p class="ans">${esc(r.word)}</p><p class="sub">${r.guess && r.guess !== "none" ? N(r.guess) + " got it" : "Nobody got it"}</p>`;
    case "truths": return `<h2>The lie was No. ${r.lie}</h2><p class="sub">Right: ${names(r.right)} · ${N(r.teller)} fooled ${r.fooled}</p>`;
    case "tempt": return `<h2>${r.self === 1 ? "One SELF" : r.self ? r.self + " SELFs" : "Nobody chose SELF"}</h2><p class="sub">${r.self === 1 ? "They take Sanctuary, and the Purse grows." : r.self ? "Too greedy. Nobody gets Sanctuary, and the Purse shrinks." : "The table held, so the Purse grows double."}</p>`;
  }
  return "";
}

// ---------------------------------------------------------------------------------------------------------------
// taps
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
  const a = b.dataset.a, v = b.dataset.v;
  if (a === "peek") { peek = true; return draw(); }
  if (a === "tools") { tools = tools ? 0 : 1; peekList = null; return draw(); }
  if (a === "unpeek") { peekList = null; tools = 0; return draw(); }
  if (a === "sound") { if (typeof AC !== "undefined" && AC) toggleMute(); else enableSound(); last = ""; return draw(); }
  if (a === "sndtv") { if (AC) toggleMute(); else enableSound(); last = ""; return draw(); }
  if (a === "narr") { narr = !narr; saidKey = ""; saidBits = []; try { speechSynthesis.cancel(); } catch (e) {} if (narr) speak(); last = ""; return draw(); }
  if (a === "peek1") {
    if (!confirm("Show you every player’s role? This spoils the game for you, and should only be used if the game can’t carry on otherwise.")) return;
    if (!confirm("Everyone will be told at the end of the game that the host looked at the roles. Carry on?")) return;
    const typed = prompt("Last check. Type SHOW THE ROLES to see them."); if (typed == null) return;
    return send({ a: "tool", v: "roles", sure: typed.trim().toUpperCase() });
  }
  if (a === "tool") {
    const who = b.dataset.who, nm = who ? P(who).name : "";
    const ask = { remove: "Take " + nm + " out of the game? They can’t come back.", host: "Make " + nm + " the host? Your phone loses these controls.", endTrial: "End this Trial now?", closeVote: "Close the vote now?", dawnNow: "End the night now?", deal: "Deal the roles now?", skipStep: "Skip this step?" }[v];
    if (ask && !confirm(ask)) return;
    tools = 0; return send({ a: "tool", v, who });
  }
  if (a === "crown" && !confirm("Lay down the Crown? Nobody can exile you this Reckoning, and it’s gone for good.")) return;
  if (a === "goplay") { location.href = "/m/" + CODE; return; }
  if (a === "gotv") { screen = "tv"; boot(); return; }
  if (a === "join") return doJoin();
  if (a === "create") return doCreate();
  if (a === "opt") return send({ a: "opts", opts: { [b.dataset.k]: v === "true" ? true : v === "false" ? false : v } });
  if (a === "letin" || a === "keepout") { rejoin = rejoin.filter((r) => r.id !== v); return send({ a, v }); }
  if (a === "wordsf") { const x = document.getElementById(v); if (!x || !x.value.trim()) return say("Type something first.", true); const val = x.value.trim(); x.value = ""; return send({ a: "words", v: val }); }
  if (a === "pause" && v !== "off" && !confirm("Pause the game? Every clock stops until you carry on.")) return;
  if (a === "ansf") { const x = document.getElementById(v); if (!x || !x.value.trim()) return say("Type an answer first.", true); const val = x.value.trim(); x.value = ""; return send({ a: "ans", v: val }); }
  if (a === "out") return send({ a, who: b.dataset.who });
  if (a === "ack") peek = false;
  if (a === "start" && !confirm("Start the game? Nobody else can join after this.")) return;
  if (a === "again" && !confirm("Start a new game with the same players?")) return;
  if (a === "sleep") return send({ a: "sleep" });
  send(v != null ? { a, v } : { a });
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return; const t = e.target; if (!t.id) return;
  if (t.id === "name" || t.id === "code") { e.preventDefault(); return screen === "create" ? doCreate() : doJoin(); }
  if (t.tagName === "INPUT") { const b = document.querySelector(`[data-a="ansf"][data-v="${t.id}"],[data-a="wordsf"][data-v="${t.id}"]`); if (b) { e.preventDefault(); b.click(); } }
});
document.addEventListener("change", (e) => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.opt) send({ a: "opts", opts: { [t.dataset.opt]: t.value } });
  if (t.dataset.tier) { const a = ($("#tier1") || {}).value || "", b = ($("#tier2") || {}).value || ""; send({ a: "opts", opts: { prizes: [a.trim() && { at: 0.5, what: a.trim() }, b.trim() && { at: 1, what: b.trim() }].filter(Boolean) } }); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) { poll(); keepAwake(); } });

async function doJoin() {
  const name = ($("#name") || {}).value || "", code = CODE || String(($("#code") || {}).value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) return say("Table codes are six letters and numbers.", true);
  if (!name.trim()) return say("Type your name.", true);
  if (!CODE) { try { sessionStorage.setItem("bt-name", name.trim()); } catch (e) {} location.href = "/m/" + code; return; }
  say("Joining…");
  try {
    const r = await api("m/join", { name });
    if (r.j.none) { if (r.j.classic) { location.href = "/t/" + CODE; return; } return say("This Table hasn’t been set up yet. The host opens it first.", true); }
    if (r.j.tok) { tok = r.j.tok; store.set(TOKKEY, tok); take(r.j); screen = "play"; toast = ""; draw(); return poll(); }
    if (r.j.req) { store.set(REQKEY, r.j.req); screen = "wait"; toast = ""; draw(); return poll(); }
    say(r.status === 404 ? "There’s no Table with that code." : r.j.error || "That didn’t work.", true);
  } catch (e) { say("Can’t reach the game. Check you’re online.", true); }
}
async function doCreate() {
  const name = ($("#name") || {}).value || ""; if (!name.trim()) return say("Type your name.", true);
  let pass = ""; try { pass = sessionStorage.getItem("bt-pass-" + CODE) || ""; } catch (e) {}
  say("Opening…");
  try {
    const r = await api("m/create", TESTGAME ? { name, pass, test: true, bots: +(($("#nbots") || {}).value || 8) } : { name, pass });
    if (r.j.tok) { tok = r.j.tok; store.set(TOKKEY, tok); take(r.j); screen = "play"; toast = ""; history.replaceState(null, "", "/m/" + CODE); draw(); return poll(); }
    if (r.j.mode === "modern") { history.replaceState(null, "", "/m/" + CODE); screen = tok ? "play" : "join"; draw(); return tok ? poll() : say(r.j.error, true); }
    say(r.j.error || "That didn’t work.", true);
  } catch (e) { say("Can’t reach the server. Check you’re online.", true); }
}
// the admin's replay: the page is shown a recorded moment instead of polling
window.replayShow = (rec) => { if (rec && rec.code) CODE = rec.code; if (rec && rec.site) SITE = rec.site; QRTO = (rec && rec.qr) || ""; V = rec ? (location.hash === "#replay-tv" ? rec.tv : rec.host) : null; if (V && V.now) off = V.now - Date.now(); last = ""; draw(); };
function boot() {
  document.body.innerHTML = (isTV() ? `<div id="tvapp"></div>` : `<div id="app"></div>`) + ART.defs();
  document.body.classList.toggle("tv", isTV());
  keepAwake();
  if (screen === "replay") return draw();
  if (screen === "join" && CODE) { try { const n = sessionStorage.getItem("bt-name"); if (n) { sessionStorage.removeItem("bt-name"); draw(); $("#name").value = n; return doJoin(); } } catch (e) {} }
  if (screen === "wait" || (CODE && store.get(REQKEY) && !tok)) screen = "wait";
  draw(); poll();
}
boot();
