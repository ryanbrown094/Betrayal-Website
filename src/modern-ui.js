/* ===================== The Betrayal — Modern: every phone, the director, and the optional TV =====================
   The server runs the game (worker/src/modern.js). This page joins, polls what this phone may see, and sends taps.
   /join                 enter the Table code and your name
   /m/CODE               a player's phone (#create: the host sets up the game from the home page)
   /t/CODE  or  #tv      the TV: codes, questions, answers, the Reckoning — never a secret */
const PATH = location.pathname, CODE = ((PATH.match(/^\/[mt]\/([A-Za-z0-9]{6})/) || [])[1] || "").toUpperCase();
const TOKKEY = "bt-m-" + CODE, REQKEY = "bt-mreq-" + CODE;
const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch (e) {} } };
let lastKey = "", tok = CODE ? store.get(TOKKEY) : null, V = null, off = 0, last = "", busy = false, toast = "", toastT = 0, rejoin = [], online = true, pollT = 0;
let screen = !CODE ? "join" : location.hash === "#create" ? "create" : location.hash === "#tv" || (PATH.startsWith("/t/") && !tok && innerWidth >= 700) ? "tv" : PATH.startsWith("/t/") && !tok ? "choose" : tok ? "play" : "join";
const $ = (s) => document.querySelector(s), app = () => $(screen === "tv" ? "#tvapp" : "#app");
const now = () => Date.now() + off;
const P = (id) => (V && V.players.find((p) => p.id === id)) || { name: "?", color: "#ae6249" };
const N = (id) => esc(P(id).name);
const seal = (id) => ART.seal(P(id));
const alive = () => V.players.filter((p) => p.alive);
const ico = (n) => ART.icon(n);
const plural = (n, w, ws) => n + " " + (n === 1 ? w : ws || w + "s");
const clock = (end, from) => `<span class="clock" data-end="${end}"></span>` + (from ? `<div class="bar"><i data-from="${from}" data-end="${end}"></i></div>` : "");
const btn = (label, a, v, cls, extra) => `<button class="btn ${cls || ""}" data-a="${a}"${v != null ? ` data-v="${esc(v)}"` : ""}${extra || ""}>${label}</button>`;
const KILL = () => (V.kill === "murder" ? "murdered" : "poisoned");

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
  const html = screen === "tv" ? tvScreen() : phone();
  if (html === last) return clocks();
  const keep = {}; root.querySelectorAll("input[id],textarea[id],select[id]").forEach((x) => (keep[x.id] = x.value));
  const focus = document.activeElement && document.activeElement.id, sel = focus && document.activeElement.selectionStart;
  root.innerHTML = html; last = html;
  // a new screen fades in; the same screen with a new count or clock doesn't
  const k = root.querySelector("[data-k]"), key = screen + (k ? k.dataset.k : "");
  if (k && key !== lastKey) k.classList.add("fade"); lastKey = key;
  for (const [id, v] of Object.entries(keep)) { const x = document.getElementById(id); if (x && v) x.value = v; }
  if (focus) { const x = document.getElementById(focus); if (x) { x.focus(); try { x.setSelectionRange(sel, sel); } catch (e) {} } }
  else { const a = root.querySelector("[autofocus]"); if (a && matchMedia("(pointer:fine)").matches) a.focus(); }
  document.body.classList.toggle("night", !!V && V.phase === "night");
  clocks();
}
function clocks() {
  const t = now();
  document.querySelectorAll("[data-end].clock").forEach((c) => { const s = Math.max(0, Math.ceil((+c.dataset.end - t) / 1000)); c.textContent = s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : s + "s"; c.classList.toggle("low", s <= 5); });
  document.querySelectorAll("i[data-from]").forEach((b) => { const a = +b.dataset.from, e = +b.dataset.end; b.style.width = Math.max(0, Math.min(100, (100 * (e - t)) / Math.max(1, e - a))) + "%"; });
}
setInterval(() => { const it = V && V.trial && V.trial.item; if (it && it.k === "snap" && it.stage === "open") draw(); else clocks(); }, 200);

// ---------------------------------------------------------------------------------------------------------------
// before the game: join, create, choose
const brand = (m) => `<div class="brand">${ART.crest()}<div class="t">The Betrayal</div><div class="m">${m || "modern"}</div></div>`;
function joinScreen() {
  return `${brand()}<div class="card fade"><h2>Join a game</h2><p class="sub">Everyone plays on their own phone. Your role, your votes and your secrets stay on this screen.</p>
  <div class="stack">${CODE ? `<p>Table <b class="num">${CODE}</b></p>` : `<div><label class="l" for="code">Table code</label><input class="f code" id="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" enterkeyhint="next"></div>`}
  <div><label class="l" for="name">Your name</label><input class="f" id="name" maxlength="14" autocomplete="given-name" placeholder="As the table knows you" enterkeyhint="go"${CODE ? " autofocus" : ""}></div>
  ${btn("Join", "join", null, "big")}</div>${msg()}</div>`;
}
function createScreen() {
  return `${brand()}<div class="card fade"><div class="eyebrow">your table · ${CODE}</div><h2>You’re the host, and you play too</h2>
  <p class="sub">Your phone runs the evening: you start each Trial, call the breaks and the Reckoning. Everything else runs itself, and you never see anyone’s role.</p>
  <label class="l" for="name">Your name</label><input class="f" id="name" maxlength="14" autocomplete="given-name" autofocus enterkeyhint="go">
  <div style="height:12px"></div>${btn("Open the Table", "create", null, "big")}${msg()}</div>`;
}
function chooseScreen() {
  return `${brand()}<div class="card fade"><h2>Table ${CODE}</h2><p class="sub">This Table is playing Modern: everyone plays on their own phone.</p><div class="stack">${btn("Join as a player", "goplay", null, "big")}${btn("Use this screen as the TV", "gotv", null, "ghost")}</div></div>`;
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
  const me = V.me, body = phase(me);
  return `<div class="top"><span class="me">${seal(me.id)}${esc(me.name)}${me.director ? " · host" : ""}</span><span class="pot num">${V.phase === "lobby" || V.phase === "oath" ? "Table " + CODE : "Purse " + V.pot}</span></div>
  ${rejoinCard()}${!me.alive && !["lobby", "oath", "roles", "end", "dawn"].includes(V.phase) ? `<div class="banner ghost">You’re a Ghost. You still watch, cheer and call it at the Reckoning, but you no longer vote or play.</div>` : ""}
  ${me.shield ? `<div class="banner sanct">${ico("shield")} You hold Sanctuary this round: nobody can take you tonight. Keep it to yourself.</div>` : ""}
  ${toast ? `<div class="banner" role="status">${esc(toast.replace(/^!/, ""))}</div>` : ""}
  <div data-k="${V.phase}.${V.trial ? V.trial.stage + V.trial.i + (V.trial.item ? V.trial.item.stage : "") : ""}">${body}</div>${online ? "" : `<div class="live">Reconnecting…</div>`}`;
}
function rejoinCard() {
  if (!V.me.director || !rejoin.length) return "";
  return rejoin.map((r) => `<div class="card hot"><p><b>${esc(r.name)}</b> is asking to come back in on a new phone. Only let them in if it’s really them.</p><div class="row">${btn("Let them in", "letin", r.id, "sm")}${btn("No", "keepout", r.id, "ghost sm")}</div></div>`).join("");
}
const dirCard = (inner, head) => (V.me.director ? `<div class="card dir"><div class="eyebrow">${head || "host"}</div>${inner}</div>` : "");
const waitHost = () => (V.me.director ? "" : `<p class="sub center">Waiting for ${esc(V.director ? V.director.name : "the host")}…</p>`);
function people(list, mark) { return `<ul class="people">${list.map((p) => `<li class="${p.alive ? "" : "dead"} ${mark && mark(p) ? "ok" : ""}">${ART.seal(p)}<b>${esc(p.name)}</b></li>`).join("")}</ul>`; }

function phase(me) {
  switch (V.phase) {
    case "lobby": return lobby(me);
    case "oath": return me.optIn ? `<h2>Sworn</h2><p class="sub">Waiting for everyone to take the Oath.</p>${people(V.players, (p) => p.optedIn)}${dirCard(`<p class="small">Everyone who has answered is lit. Stragglers can be dealt in as either way.</p>${btn("Deal the roles now", "deal", null, "dark")}`)}`
      : `<div class="eyebrow">the oath</div><h2>Would you like to be Forsworn?</h2><p class="sub">The Forsworn are the traitors: they lie all night, choose who dies, and try to steal the prize. Nobody sees your answer. The game uses it when it deals the roles, but it can’t always give everyone what they asked for.</p>
        <div class="stack">${btn("Yes, make me Forsworn", "optin", "yes")}${btn("I’d rather be Loyal", "optin", "no", "ghost")}${btn("Either way", "optin", "any", "dark")}</div>`;
    case "roles": return roleCard(me);
    case "day": return day(me);
    case "trial": return trial(me);
    case "break": return `<div class="eyebrow">a break</div><h1>${esc(V.brk.name)}</h1><p class="sub">Eat, drink, and talk. Plot quietly.</p><p>${clock(V.brk.end)}</p>${dirCard(`<div class="row">${btn("+5 minutes", "brkMore", null, "dark sm")}${btn("End the break", "brkEnd", null, "sm")}</div>`)}`;
    case "talk": return `<div class="eyebrow">the reckoning${V.vote.second ? " · the second exile" : ""}</div><h1>Talk. Accuse. Defend.</h1><p class="sub">Voting opens on every phone when the time is up.</p><p>${clock(V.vote.talkEnd)}</p>${dirCard(btn("Open the vote now", "voteNow"))}`;
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
  const n = V.players.length, url = location.host + "/join";
  let h = `<div class="eyebrow">table ${CODE}</div><h2>You’re in</h2><p class="sub">Friends join at <b>${esc(url)}</b> with the code <b class="num">${CODE}</b>.</p>${people(V.players)}<p class="small" style="margin-top:10px">${plural(n, "player")} · 6 to 24 can play</p>`;
  if (!me.director) return h + waitHost();
  const o = V.opts || {};
  const two = (k, a, b) => `<div class="grid2">${[a, b].map(([v, t]) => `<button class="btn ${o[k] === v ? "on" : "dark"} sm" data-a="opt" data-k="${k}" data-v="${v}">${t}</button>`).join("")}</div>`;
  h += `<div class="card dir"><div class="eyebrow">host · before you start</div>
  <label class="l">How do the Forsworn kill?</label>${two("kill", ["poison", "Poison"], ["murder", "Murder"])}
  <p class="small">${o.kill === "murder" ? "Murdered players find out on their phone, and leave the table at dawn." : "Poisoned players find out on their phone, and get last words at dawn."}</p>
  <label class="l">Sanctuary</label>${two("shield", ["secret", "Secret"], ["public", "Public"])}
  <p class="small">${o.shield === "public" ? "Everyone sees who won Sanctuary." : "Only the winner knows they hold Sanctuary. (A Forsworn winner gets nothing, and learns so.)"}</p>
  <label class="l" for="prize">The prize</label><input class="f" id="prize" maxlength="80" value="${esc(o.prize || "")}" data-opt="prize">
  <details class="more"><summary>Remove a player</summary>${V.players.filter((p) => p.id !== me.id).map((p) => `<div class="row" style="margin:6px 0"><span>${esc(p.name)}</span>${btn("Remove", "kick", p.id, "ghost sm")}</div>`).join("")}</details>
  <div style="height:12px"></div>${btn(n < 6 ? `Waiting for ${6 - n} more` : `Start with ${n} players`, "start", null, "big", n < 6 ? " disabled" : "")}
  <p class="small center">Want it on the TV? Open <b>${esc(location.host)}/t/${CODE}</b> on a laptop and cast it. It’s optional.</p></div>`;
  return h;
}
let peek = false;
function roleCard(me) {
  if (me.acked) return `<div class="done">${ico("handshake")} Role seen. Waiting for everyone else…</div><div style="height:12px"></div>${people(V.players, (p) => p.acked)}${dirCard(btn("Everyone’s seen theirs: begin", "begin", null, "dark"))}`;
  if (!peek) return `<div class="veil" data-a="peek"><div><div class="eyebrow">your role</div><h2>Hold your phone close</h2><p class="sub">Tap here when nobody can see your screen.</p></div></div>`;
  const f = me.role === "f";
  return `<div class="card role ${f ? "f" : "l"}"><div class="sigil">${ART.bigSeal(f ? "t" : "good", f ? "blade" : "candle")}</div><div class="eyebrow">you are</div><h1>${f ? "Forsworn" : "Loyal"}</h1>
  <p class="sub">${f ? "You took the Oath and never meant it. Each night, choose who dies on your phone. Blend in, vote with the table, and reach the end unmasked to steal the prize." : "You are true to the table. Win Trials to fill the Purse, find the Forsworn, and exile them at the Reckoning before they pick you off."}</p>
  ${f ? (me.allies && me.allies.length ? `<p>Your fellow Forsworn: <b>${me.allies.map((a) => esc(a.name)).join(", ")}</b></p>` : `<p>You are the only Forsworn. Trust nobody.</p>`) : ""}
  ${btn("Got it — hide my role", "ack")}</div>`;
}
function day(me) {
  let h = `<div class="eyebrow">${V.final ? "the final" : "round " + V.round}</div><h1>${V.final ? "The final" : V.roundTrials ? "Back at the table" : "A new day"}</h1>
  <p class="sub">${V.final ? "Five or fewer remain. Exiles are no longer revealed. When the table trusts everyone left, it ends." : "Talk, plot, and watch each other."}</p>${people(V.players)}`;
  if (!me.director) return h + `<div style="height:14px"></div>` + waitHost();
  const t = me.trials || [];
  const brk = [["interval", "The Interval · 10 min"], ["starter", "The Starter · 15 min"], ["main", "The Main Course · 25 min"], ["dessert", "Dessert · 15 min"]].filter(([k]) => k === "interval" || !V.done[k]);
  h += `<div class="card dir"><div class="eyebrow">host · what next?</div><p class="small">${V.roundTrials ? "Another Trial, a break, or call the Reckoning." : "Most rounds start with a Trial, then the Reckoning. Breaks whenever you like."}</p>
  <div class="stack">${btn(ico("scales") + (V.final ? " A last Trial" : " Next Trial"), "trial", "")}
  <select class="f" id="pickt" aria-label="Choose a Trial"><option value="">…or choose one</option>${t.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("")}</select>
  ${me.canTempt && !V.final ? btn("The Temptation (once)", "trial", "tempt", "dark") : ""}
  ${btn(ico("table") + " The Reckoning", "reckon", null, V.roundTrials ? "" : "ghost")}
  <details class="more"><summary>A break</summary><div class="stack">${brk.map(([k, n]) => btn(n, "break", k, "dark sm")).join("")}</div></details></div></div>`;
  return h;
}
// ---- the Trials
function trial(me) {
  const t = V.trial, it = t.item;
  if (t.stage === "intro") return `<div class="eyebrow">trial${t.prize ? " · Sanctuary to the winner" : ""}</div><h1>${esc(t.title)}</h1><p>${esc(t.rules)}</p>
    ${me.role === "f" && t.key !== "tempt" && t.key !== "likely" ? `<div class="banner">Forsworn: every wrong answer you give costs the Purse 50. Sabotage, quietly.</div>` : ""}
    <p class="sub">Starts in ${clock(t.introEnd)}</p>${dirCard(`<div class="row">${btn("Start now", "skip", null, "sm")}${btn("Stop this Trial", "endTrial", null, "ghost sm")}</div>`)}`;
  if (t.stage === "done") return trialDone(me);
  if (!it) return "";
  const head = `<div class="ihead"><div class="eyebrow">${esc(t.title)} · ${it.part ? esc(it.part) + " · " : ""}${it.stage === "reveal" ? t.i : t.i + 1}</div>${it.stage === "open" || it.stage === "study" || it.stage === "prep" ? clock(it.end) : ""}</div>`;
  const ctl = dirCard(`<div class="row">${it.stage === "open" ? btn("Close this one", "skip", null, "dark sm") : ""}${btn("End the Trial", "endTrial", null, "ghost sm")}</div>`);
  const watching = !me.alive && !(it.k === "survive" && t.key === "statue");
  return head + (it.stage === "reveal" ? itemReveal(me, it) : watching ? tvItem(it, true) : itemPlay(me, it)) + ctl;
}
function sent(v) { return `<div class="done">${ico("handshake")}<div>Locked in${v != null && v !== "" ? `: <b>${esc(v)}</b>` : ""}.<br><span class="small">${it().answered} of ${it().of || "?"} in</span></div></div>`; }
const it = () => V.trial.item;
const form = (id, type, ph, label, extra) => `<div class="row"><input class="f" id="${id}" type="${type}" ${type === "number" ? 'inputmode="decimal"' : ""} placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" autofocus${extra || ""}></div><div style="height:10px"></div>${btn(label || "Send", "ansf", id, "big")}`;
function itemPlay(me, x) {
  switch (x.k) {
    case "text": return `<p class="q">${esc(x.q)}</p>` + (x.mine != null ? sent(x.mine) : form("a" + V.trial.i, "text", "Your answer", "Send"));
    case "number": return `<p class="q">${esc(x.q)}</p>` + (x.mine != null ? sent(x.mine) : form("a" + V.trial.i, "number", "A number", "Guess"));
    case "hilo": return `<p class="q">${esc(x.q)}</p><p>Is it higher or lower than <b class="ans num">${x.ref}</b>?</p>` + (x.mine ? sent(x.mine) : `<div class="grid2">${btn("Higher", "ans", "higher", "big")}${btn("Lower", "ans", "lower", "big")}</div>`);
    case "vote": return `<p class="q">${esc(x.q)}</p>` + (x.mine ? sent(P(x.mine).name) : `<div class="pick">${alive().map((p) => `<button data-a="ans" data-v="${p.id}">${ART.seal(p)}${esc(p.name)}</button>`).join("")}</div>`);
    case "word": return `<p class="sub">The longest real word from these letters. You can change it until time’s up.</p><div class="letters">${[...x.letters].map((c) => `<span>${c}</span>`).join("")}</div>` + (x.mine ? `<div class="done">${ico("scroll")}<div>Your word: <b>${esc(String(x.mine).toUpperCase())}</b></div></div><div style="height:10px"></div>` : "") + form("w" + V.trial.i, "text", "Your word", x.mine ? "Change it" : "Send", '');
    case "recall":
      if (x.stage === "study") return `<p class="sub">Remember these. They vanish in a moment.</p><div class="words">${x.words.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`;
      return `<p class="sub">Type every word you remember, separated by commas or new lines. You can send again to add more.</p><textarea class="f" id="r${V.trial.i}" autofocus autocapitalize="off" spellcheck="false">${esc(x.mine || "")}</textarea><div style="height:10px"></div>${btn(x.mine ? "Update my list" : "Send my list", "ansf", "r" + V.trial.i, "big")}`;
    case "cell":
      if (x.stage === "study") return `<p class="sub">Study the grid.</p>${cells(x.grid)}`;
      if (x.stage === "blank") return `<p class="sub">Something is changing…</p><div class="cells blank">${"<span></span>".repeat(12)}</div>`;
      return `<p class="sub">What changed? Tap it. First right answer scores double.</p>` + (x.mine != null ? cells(x.grid, null, +x.mine) + sent() : cells(x.grid, true));
    case "snap": {
      const i = Math.floor((now() - x.start) / x.step), sym = i < 0 ? null : x.syms[x.seq[Math.min(i, x.seq.length - 1)]];
      return `<div class="snapsym">${sym ? ico(sym) : `<p class="sub">Get ready… ${clock(x.start)}</p>`}</div>${btn("SNAP", "ans", null, "big blood")}<p class="small center">Tap only when the symbol matches the one before. A wrong tap loses a point.</p>`;
    }
    case "rps":
      if (x.vs) return `<p class="q">You vs <b>${N(x.vs)}</b></p>` + (x.mine ? sent(x.mine) : `<div class="grid3">${["rock", "paper", "scissors"].map((v) => btn(v[0].toUpperCase() + v.slice(1), "ans", v, "big")).join("")}</div>`);
      return x.bye === me.id ? `<p class="q">You have a bye this bout.</p><p class="sub">Watch and wait.</p>` : `<p class="q">You’re out.</p><p class="sub">Watch the rest battle it out.</p>`;
    case "survive": {
      const out = x.out.includes(me.id);
      return `<p class="q">${V.trial.key === "statue" ? "Freeze." : "On one leg."}</p><p class="sub">${out ? "You’re out. Watch the rest." : "Last one standing wins. Out? Tap it, honestly."}</p>${out ? "" : btn("I’m out", "out", null, "big blood")}
        <p class="small">Still in: ${alive().filter((p) => !x.out.includes(p.id)).map((p) => esc(p.name)).join(", ")}</p>
        ${V.me.director ? `<details class="more"><summary>Mark someone out</summary><div class="pick">${alive().filter((p) => !x.out.includes(p.id)).map((p) => `<button data-a="out" data-who="${p.id}">${ART.seal(p)}${esc(p.name)}</button>`).join("")}</div></details>` : ""}`;
    }
    case "actor":
      if (x.actor !== me.id) return `<p class="q">${N(x.actor)} is up.</p><p class="sub">${V.trial.key === "hum" ? "Name that song." : "Shout your guess."} When someone gets it, ${N(x.actor)} taps who.</p>`;
      return `<div class="card hot center"><div class="eyebrow">yours, secretly</div><p class="ans">${esc(x.word)}</p></div><p class="sub">${V.trial.key === "hum" ? "Hum it. No words." : V.trial.key === "draw" ? "Draw it. No letters or numbers." : "Act it out. No words, no sounds."} Who got it?</p>
        <div class="pick">${alive().filter((p) => p.id !== me.id).map((p) => `<button data-a="guess" data-v="${p.id}">${ART.seal(p)}${esc(p.name)}</button>`).join("")}</div><div style="height:10px"></div>
        <div class="row">${btn("Nobody got it", "guess", "none", "ghost sm")}${x.skips < 2 ? btn("A different one", "reword", null, "dark sm") : ""}</div>`;
    case "truths":
      if (x.teller === me.id) {
        if (x.stage === "prep") return `<p class="q">Your turn: two truths and a lie.</p><p class="sub">Choose which one will be the lie, tell all three to the table, then tap “Told them”.</p><div class="grid3">${[1, 2, 3].map((n) => btn("No. " + n, "lie", n, x.lie === n ? "on" : "dark")).join("")}</div><div style="height:10px"></div>${btn("Told them — vote now", "told", null, "big", x.lie ? "" : " disabled")}`;
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
  const you = mine ? `<p class="center" style="color:var(--verd)">+${mine} for you</p>` : mine < 0 ? `<p class="center" style="color:var(--blood2)">${mine} for you</p>` : "";
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
    case "rps": return `<ul class="score">${(r.bouts || []).map(([a, x1, b, y, w]) => `<li>${N(a)} <i>${x1}</i> v <i>${y}</i> ${N(b)}<span class="n">${w ? N(w) : "draw: both on"}</span></li>`).join("")}</ul>`;
    case "survive": return `<p class="q">Last standing: ${names(r.still)}</p>`;
    case "actor": return `<p class="sub">${N(r.actor)}’s was</p><p class="ans">${esc(r.word)}</p><p>${r.guess && r.guess !== "none" ? N(r.guess) + " got it" : "Nobody got it"}</p>${you}`;
    case "truths": return `<p class="q">${N(r.teller)}’s lie was No. ${r.lie}</p><p>Right: ${names(r.right)} · fooled ${r.fooled}</p>${you}`;
    case "tempt": return `<p class="q">${r.self === 1 ? "One SELF." : r.self ? r.self + " SELFs." : "Nobody chose SELF."}</p>`;
  }
  return "";
}
function trialDone(me) {
  const t = V.trial, sc = Object.entries(t.scores || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const w = t.winners && t.winners[0];
  let h = `<div class="eyebrow">${esc(t.title)} · the result</div><h1>${t.key === "tempt" ? (t.last && t.last.self === 1 ? "Someone took it" : "The table held") : w ? esc(P(w).name) + " wins" : "No winner"}</h1>
  <p class="ans num">${t.points >= 0 ? "+" : ""}${t.points} <span class="small">to the Purse</span></p>${t.wrongF ? `<p class="small">The Forsworn gave ${plural(t.wrongF, "wrong answer")}, and the Purse paid for them.</p>` : ""}`;
  if (t.sanctPublic) h += `<div class="banner sanct">${N(t.sanctPublic)} takes Sanctuary for tonight.</div>`;
  if (me.wonSanct === "yes") h += `<div class="banner sanct">${ico("shield")} You won Sanctuary. Nobody can take you tonight. ${t.sanctPublic ? "" : "Only you know."}</div>`;
  if (me.wonSanct === "wasted") h += `<div class="banner">You won, but Sanctuary protects only the Loyal. Nobody else knows.</div>`;
  if (sc.length && t.key !== "tempt" && t.key !== "likely") h += `<ul class="score">${sc.map(([id, n]) => `<li class="${id === me.id ? "me" : ""}">${seal(id)}${N(id)}<span class="n">${n}</span></li>`).join("")}</ul>`;
  return h + dirCard(btn("Back to the table", "cont")) + waitHost();
}
// ---- the Reckoning
function vote(me) {
  const v = V.vote, cands = alive().filter((p) => p.id !== me.id && (!v.revote || v.revote.includes(p.id)));
  const head = `<div class="eyebrow">the reckoning${v.tie ? " · a tie: vote again" : ""}</div><h1>${me.alive ? "Who do you exile?" : "Call it, Ghost"}</h1>
  <p class="sub">${me.alive ? "Your vote is secret until the count." : "Ghosts don’t vote, but if you call it right the table will know."} ${v.voted} of ${v.of} voted.</p>`;
  if (v.mine) return head + `<div class="done">${ico("scales")}<div>${me.alive ? "You voted" : "You called"} <b>${N(v.mine)}</b>.<br><span class="small">You can change it until everyone’s in.</span></div></div><div style="height:12px"></div>` + pickList(cands, "ballot", v.mine) + dirCard(btn("Close the vote now", "closeVote", null, "dark"));
  return head + pickList(cands, "ballot") + dirCard(btn("Close the vote now", "closeVote", null, "dark"));
}
const pickList = (list, a, on) => `<div class="pick">${list.map((p) => `<button data-a="${a}" data-v="${p.id}" class="${on === p.id || (Array.isArray(on) && on.includes(p.id)) ? "on" : ""}">${ART.seal(p)}${esc(p.name)}</button>`).join("")}</div>`;
function reveal(me) {
  const r = V.reveal;
  let h = `<div class="eyebrow">the reckoning${r.byLot ? " · settled by lot" : ""}</div><h1>${esc(r.name)} is exiled</h1><p class="sub">${(r.counts || []).map(([id, n]) => N(id) + " " + n).join(" · ")}</p>`;
  if (r.secret) h += `<p>In the final, the exiled go without a word.</p>`;
  else if (!r.role) h += `<p class="sub">They were… ${clock(r.roleAt)}</p>`;
  else h += `<h2 style="color:${r.role === "f" ? "var(--blood2)" : "#bfe0d3"}">${r.role === "f" ? "Forsworn" : "Loyal"}</h2>${r.called && r.called.length ? `<p class="small">The Ghosts who called it: ${r.called.map(esc).join(", ")}</p>` : ""}`;
  if (me.id === r.id) h += `<div class="banner ghost">You’re a Ghost now. Stay at the table.</div>`;
  return h + (r.role || r.secret ? dirCard(btn("Continue", "cont")) : "");
}
function night(me) {
  const n = V.night;
  let h = `<div class="eyebrow">the night</div><h1>Heads down</h1><p class="sub">Everyone taps someone now, so nobody can tell who is choosing. Keep your screen hidden.</p>`;
  if (!me.alive) return `<div class="eyebrow">the night</div><h1>Heads down</h1><p class="sub">The Forsworn are choosing. Ghosts, watch in silence.</p>` + dirCard(btn("Go to dawn now", "dawnNow", null, "dark"));
  if (me.role === "f") {
    h += `<div class="card hot"><div class="eyebrow">tonight</div><p>Choose ${n.kills > 1 ? n.kills + " to be " : "who is "}${KILL()} tonight. The one chosen most goes.${me.sanct && me.sanct.length ? ` <b>${me.sanct.map(esc).join(", ")}</b> ${me.sanct.length > 1 ? "hold" : "holds"} Sanctuary.` : ""}</p>
    ${Object.entries(me.picks || {}).filter(([nm]) => nm !== me.name).map(([nm, ps]) => `<p class="small">${esc(nm)}: ${ps.length ? ps.map(esc).join(", ") : "not yet"}</p>`).join("")}</div>`;
    return h + pickList(me.targets.map(P), "pick", me.mine) + (me.mine && me.mine.length >= n.kills ? `<p class="small center" style="margin-top:10px">Chosen. You can change it until everyone’s done.</p>` : "") + dirCard(btn("Go to dawn now", "dawnNow", null, "dark"));
  }
  h += `<div class="card"><p>Who do you suspect most? (Nothing happens to them: it just keeps the night secret.)</p></div>`;
  return h + (n.done ? `<div class="done">${ico("moon")} Done. Heads down until dawn.</div>` : pickList(alive().filter((p) => p.id !== me.id), "sleep")) + dirCard(btn("Go to dawn now", "dawnNow", null, "dark"));
}
function dawn(me) {
  const d = V.dawn;
  if (!d.revealed) {
    if (me.victim) return `<div class="card hot center"><div class="eyebrow">the night</div><h1>You were ${me.victim === "murder" ? "murdered" : "poisoned"}</h1><p class="sub">${me.victim === "murder" ? "Say nothing. When the host reveals the night, leave the table quietly." : "Say nothing yet. When the host reveals the night, you get your last words."}</p></div>` + dirCard(btn("Reveal the night", "cont"));
    return `<div class="eyebrow">dawn</div><h1>Heads up</h1><p class="sub">Who made it through the night?</p>` + dirCard(btn("Reveal the night", "cont")) + waitHost();
  }
  const v = d.victims || [];
  return `<div class="eyebrow">dawn</div><h1>${v.length ? v.map(esc).join(" and ") + (v.length > 1 ? " are" : " is") + " dead" : "Nobody died"}</h1>
  <p class="sub">${v.length ? (V.kill === "murder" ? "Murdered in the night." : "Poisoned in the night. Last words" + (d.lastEnd ? ": " + clock(d.lastEnd) : ".")) : d.saved ? "Sanctuary held. The Forsworn struck, and failed." : "The night passed quietly."}</p>` + dirCard(btn("On to the next round", "cont")) + waitHost();
}
function trust(me) {
  const t = V.trust;
  if (t.result) return `<div class="eyebrow">trust or doubt</div><h1>${t.result === "trust" ? "The table trusts" : "Doubt"}</h1><p class="sub">${t.result === "trust" ? "Everyone chose Trust. The masks come off." : plural(t.count, "player") + " doubted. Another Reckoning."}</p>`;
  if (!me.alive) return `<div class="eyebrow">trust or doubt</div><h1>The survivors decide</h1><p class="sub">${t.voted} of ${t.of} have chosen.</p>`;
  return `<div class="eyebrow">trust or doubt</div><h1>Do you trust everyone left?</h1><p class="sub">If every survivor chooses Trust, the game ends and the masks come off. One Doubt, and there’s another Reckoning.</p>` +
    (t.mine ? `<div class="done">${ico("handshake")} You chose <b>${t.mine.toUpperCase()}</b>. ${t.voted} of ${t.of} in.</div>` : `<div class="grid2">${btn("Trust", "trust", "trust", "big verd")}${btn("Doubt", "trust", "doubt", "big blood")}</div>`);
}
function unmaskList() { const u = V.unmask; return `<ul class="score">${u.order.map((id, i) => `<li>${seal(id)}${N(id)}<span class="n">${i < u.shown ? (P(id).role === "f" ? "Forsworn" : "Loyal") : "…"}</span></li>`).join("")}</ul>`; }
function honour(me) {
  const h = V.honour;
  if (me.role !== "f" || !me.alive) return `<div class="eyebrow">the last betrayal</div><h1>The Forsworn decide</h1><p class="sub">They reached the end together. Now each chooses, in secret: share the prize, or betray the others for all of it.</p>`;
  return `<div class="eyebrow">the last betrayal</div><h1>Honour or betray?</h1><p class="sub">If every Forsworn honours, you share the prize. One betrayer takes it all. Two or more betrayers, and nobody gets it.</p>` +
    (h.mine ? `<div class="done">${ico("blade")} You chose <b>${h.mine.toUpperCase()}</b>.</div>` : `<div class="grid2">${btn("Honour", "honour", "honour", "big verd")}${btn("Betray", "honour", "betray", "big blood")}</div>`);
}
function end(me) {
  const r = V.result, fw = r.winner === "forsworn";
  return `<div class="eyebrow">the end</div><h1 class="disp">${fw ? "The Forsworn win" : "The Loyal win"}</h1>
  <p class="sub">${r.how === "betrayed" ? "Betrayed at the last: " + r.to.map(esc).join("") + " takes it all." : r.how === "nobody" ? "Too many betrayers: nobody takes the prize." : r.to.length ? "The prize goes to " + r.to.map(esc).join(", ") + "." : ""}</p>
  <div class="card center"><div class="eyebrow">the prize${r.tier ? " · a " + (r.tier >= 1 ? "full" : "half-full") + " Purse" : ""}</div><p class="ans">${esc(r.prize)}</p><p class="small">Purse ${r.pot}</p></div>
  ${me.won ? `<div class="banner sanct">You won.</div>` : ""}
  ${people(V.players.map((p) => ({ ...p, name: p.name + " · " + (p.role === "f" ? "Forsworn" : "Loyal") })))}
  ${r.awards && r.awards.length ? `<div style="height:14px"></div><div class="eyebrow">the awards</div><ul class="score">${r.awards.map((a) => `<li>${seal(a.id)}<div><b>${esc(a.title)}</b><br><span class="small">${esc(a.name)} ${esc(a.why)}</span></div></li>`).join("")}</ul>` : ""}
  ${dirCard(btn("Play again with the same people", "again", null, "dark"))}`;
}

// ---------------------------------------------------------------------------------------------------------------
// the TV: never a secret
function tvScreen() {
  if (!V) return `<div class="tvmain">${brand("modern")}<p class="sub">${screen === "tv" && CODE ? "Table " + CODE + " isn’t set up yet." : "Connecting…"}</p></div>`;
  const url = esc(location.host) + "/join";
  const top = `<div class="tvtop"><span>${esc(V.title || "The Betrayal")} · ${V.final ? "the final" : V.round ? "round " + V.round : "table " + CODE}</span><span class="pot num">${V.phase === "lobby" ? "" : "Purse " + V.pot}</span></div>`;
  return top + `<div class="tvmain" data-k="${V.phase}.${V.trial ? V.trial.stage + V.trial.i + (V.trial.item ? V.trial.item.stage : "") : ""}">${tvBody(url)}</div>`;
}
function tvPeople(mark, roles) { return `<div class="tvpeople">${V.players.map((p) => `<div class="p ${p.alive ? "" : "dead"} ${mark && mark(p) ? "ok" : ""}">${ART.seal(p)}<span>${esc(p.name)}</span>${roles && p.role ? `<em class="${p.role === "f" ? "" : "l"}">${p.role === "f" ? "forsworn" : "loyal"}</em>` : ""}</div>`).join("")}</div>`; }
function tvBody(url) {
  switch (V.phase) {
    case "lobby": return `<div class="eyebrow">join on your phone</div><div class="tvcode"><div class="u">Go to<br><b>${url}</b></div><div class="c num">${CODE}</div></div>${tvPeople()}<p class="tvcount">${plural(V.players.length, "player")} · 6 to 24</p>`;
    case "oath": return `<div class="eyebrow">the oath</div><h1>Swear on your phones</h1><p class="sub">Would you like to be Forsworn? Nobody sees your answer.</p>${tvPeople((p) => p.optedIn)}`;
    case "roles": return `<div class="eyebrow">the deal</div><h1>Look at your role</h1><p class="sub">Hold your phone close. Tell no one.</p>${tvPeople((p) => p.acked)}`;
    case "day": return `<div class="eyebrow">${V.final ? "the final" : "round " + V.round}</div><h1>${V.final ? "The final" : "Day " + V.round}</h1>${tvPeople(null, true)}`;
    case "break": return `<div class="eyebrow">a break</div><h1>${esc(V.brk.name)}</h1><p>${clock(V.brk.end)}</p>`;
    case "trial": {
      const t = V.trial, x = t.item;
      if (t.stage === "intro") return `<div class="eyebrow">trial${t.prize ? " · Sanctuary to the winner" : ""}</div><h1 class="disp">${esc(t.title)}</h1><p class="sub">${esc(t.rules)}</p><p>${clock(t.introEnd)}</p>`;
      if (t.stage === "done") { const sc = Object.entries(t.scores || {}).sort((a, b) => b[1] - a[1]).slice(0, 10), w = t.winners && t.winners[0]; return `<div class="eyebrow">${esc(t.title)}</div><h1>${w && t.key !== "tempt" ? esc(P(w).name) + " wins" : t.key === "tempt" ? "The Temptation" : "No winner"}</h1><p class="ans num">${t.points >= 0 ? "+" : ""}${t.points} to the Purse</p>${t.sanctPublic ? `<p class="sub">${N(t.sanctPublic)} takes Sanctuary.</p>` : t.prize && w ? `<p class="sub">Did they take Sanctuary? Only they know.</p>` : ""}${sc.length && !["tempt", "likely"].includes(t.key) ? `<ul class="tvscore">${sc.map(([id, n]) => `<li>${seal(id)}${N(id)}<b>${n}</b></li>`).join("")}</ul>` : ""}`; }
      return x ? `<div class="eyebrow">${esc(t.title)} · ${x.stage === "reveal" ? t.i : t.i + 1}</div>` + (x.stage === "reveal" ? tvReveal(x) : tvItem(x)) : "";
    }
    case "talk": return `<div class="eyebrow">the reckoning</div><h1>Talk. Accuse. Defend. Deflect.</h1><p>${clock(V.vote.talkEnd)}</p>${tvPeople()}`;
    case "vote": return `<div class="eyebrow">the reckoning${V.vote.tie ? " · a tie" : ""}</div><h1>${V.vote.tie ? "Vote again" : "Vote on your phones"}</h1><p class="tvcount">${V.vote.voted} of ${V.vote.of} voted</p>${tvPeople()}`;
    case "reveal": { const r = V.reveal; return `<div class="eyebrow">the reckoning</div><h1>${esc(r.name)} is exiled</h1><p class="sub">${(r.counts || []).map(([id, n]) => N(id) + " " + n).join(" · ")}</p>${r.secret ? `<p class="sub">In the final, the exiled go without a word.</p>` : r.role ? `<h2 style="color:${r.role === "f" ? "var(--blood2)" : "#bfe0d3"}">${r.role === "f" ? "Forsworn" : "Loyal"}</h2>${r.called && r.called.length ? `<p class="sub">Called from beyond by ${r.called.map(esc).join(", ")}</p>` : ""}` : `<p class="sub">They were…</p>`}`; }
    case "night": return `<div class="eyebrow">the night</div><h1>Heads down</h1><p class="sub">Everyone: tap your phone. The Forsworn are choosing.</p>`;
    case "dawn": { const d = V.dawn; return d.revealed ? `<div class="eyebrow">dawn</div><h1>${d.victims.length ? d.victims.map(esc).join(" and ") + (d.victims.length > 1 ? " are" : " is") + " dead" : "Nobody died"}</h1>${d.lastEnd ? `<p class="sub">Last words ${clock(d.lastEnd)}</p>` : d.saved ? `<p class="sub">Sanctuary held.</p>` : ""}${tvPeople()}` : `<div class="eyebrow">dawn</div><h1>Heads up</h1><p class="sub">Who made it through the night?</p>`; }
    case "trust": return `<div class="eyebrow">trust or doubt</div><h1>${V.trust.result ? (V.trust.result === "trust" ? "The table trusts" : "Doubt") : "Do you trust everyone left?"}</h1><p class="tvcount">${V.trust.result ? "" : V.trust.voted + " of " + V.trust.of + " chosen"}</p>`;
    case "unmask": return `<div class="eyebrow">the unmasking</div><h1>Who were they?</h1>${tvPeople(null, true)}`;
    case "honour": return `<div class="eyebrow">the last betrayal</div><h1>Honour or betray?</h1><p class="sub">The Forsworn choose, in secret.</p>`;
    case "end": { const r = V.result; return `<div class="eyebrow">the end</div><h1 class="disp">${r.winner === "forsworn" ? "The Forsworn win" : "The Loyal win"}</h1><h2>${esc(r.prize)}</h2><p class="sub">${r.to.length ? "to " + r.to.map(esc).join(", ") : "nobody takes it"}</p>${tvPeople(null, true)}${r.awards && r.awards.length ? `<ul class="tvscore">${r.awards.map((a) => `<li>${seal(a.id)}<span><b style="color:var(--brass2)">${esc(a.title)}</b> ${esc(a.name)}</span></li>`).join("")}</ul>` : ""}`; }
  }
  return "";
}
// the question as everyone sees it (the TV, and a Ghost's phone)
function tvItem(x, small) {
  const cnt = x.of ? `<p class="tvcount">${x.answered} of ${x.of} answered</p>` : "", c = x.end && x.stage !== "reveal" ? `<p>${clock(x.end)}</p>` : "";
  switch (x.k) {
    case "text": case "number": case "vote": return `<h2 class="${small ? "q" : ""}">${esc(x.q)}</h2>${c}${cnt}`;
    case "hilo": return `<h2>${esc(x.q)}</h2><p class="ans num">Higher or lower than ${x.ref}?</p>${c}${cnt}`;
    case "word": return `<div class="${small ? "letters" : "tvletters"}">${[...x.letters].map((l) => `<span>${l}</span>`).join("")}</div>${c}${cnt}`;
    case "recall": return x.stage === "study" ? `<div class="${small ? "words" : "tvwords"}">${x.words.map((w) => `<span>${esc(w)}</span>`).join("")}</div>${c}` : `<h2>Type every word you remember</h2>${c}${cnt}`;
    case "cell": return x.grid ? (small ? cells(x.grid) : `<div class="tvgrid">${x.grid.map((g) => `<span>${ico(g)}</span>`).join("")}</div>`) + c : `<h2>Something is changing…</h2>`;
    case "snap": { const i = Math.floor((now() - x.start) / x.step), sym = i < 0 ? null : x.syms[x.seq[Math.min(i, x.seq.length - 1)]]; return `<div class="${small ? "snapsym" : "tvsnap"}">${sym ? ico(sym) : "<h2>Get ready</h2>"}</div>`; }
    case "rps": return `<h2>Rock, paper, scissors</h2><p class="sub">${x.pairs.map(([a, b]) => N(a) + " v " + N(b)).join(" · ")}${x.bye ? " · bye: " + N(x.bye) : ""}</p>${c}`;
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
    case "tempt": return `<h2>${r.self === 1 ? "One SELF" : r.self ? r.self + " SELFs" : "Nobody chose SELF"}</h2>`;
  }
  return "";
}

// ---------------------------------------------------------------------------------------------------------------
// taps
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
  const a = b.dataset.a, v = b.dataset.v;
  if (a === "peek") { peek = true; return draw(); }
  if (a === "goplay") { location.href = "/m/" + CODE; return; }
  if (a === "gotv") { screen = "tv"; boot(); return; }
  if (a === "join") return doJoin();
  if (a === "create") return doCreate();
  if (a === "opt") return send({ a: "opts", opts: { [b.dataset.k]: v } });
  if (a === "letin" || a === "keepout") { rejoin = rejoin.filter((r) => r.id !== v); return send({ a, v }); }
  if (a === "ansf") { const x = document.getElementById(v); if (!x || !x.value.trim()) return say("Type an answer first.", true); const val = x.value.trim(); x.value = ""; return send({ a: "ans", v: val }); }
  if (a === "out") return send({ a, who: b.dataset.who });
  if (a === "ack") peek = false;
  if (a === "start" && !confirm("Start the game? Nobody else can join after this.")) return;
  if (a === "reckon" && !V.roundTrials && !V.final && !confirm("Call the Reckoning without a Trial this round?")) return;
  if (a === "again" && !confirm("Start a new game with the same players?")) return;
  if (a === "sleep") return send({ a: "sleep" });
  send(v != null ? { a, v } : { a });
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return; const t = e.target; if (!t.id) return;
  if (t.id === "name" || t.id === "code") { e.preventDefault(); return screen === "create" ? doCreate() : doJoin(); }
  if (t.tagName === "INPUT") { const b = document.querySelector(`[data-a="ansf"][data-v="${t.id}"]`); if (b) { e.preventDefault(); b.click(); } }
});
document.addEventListener("change", (e) => { const t = e.target; if (t.dataset && t.dataset.opt) send({ a: "opts", opts: { [t.dataset.opt]: t.value } }); if (t.id === "pickt" && t.value) send({ a: "trial", v: t.value }); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

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
    const r = await api("m/create", { name, pass });
    if (r.j.tok) { tok = r.j.tok; store.set(TOKKEY, tok); take(r.j); screen = "play"; toast = ""; history.replaceState(null, "", "/m/" + CODE); draw(); return poll(); }
    if (r.j.mode === "modern") { history.replaceState(null, "", "/m/" + CODE); screen = tok ? "play" : "join"; draw(); return tok ? poll() : say(r.j.error, true); }
    say(r.j.error || "That didn’t work.", true);
  } catch (e) { say("Can’t reach the server. Check you’re online.", true); }
}
function boot() {
  document.body.innerHTML = (screen === "tv" ? `<div id="tvapp"></div>` : `<div id="app"></div>`) + ART.defs();
  document.body.classList.toggle("tv", screen === "tv");
  if (screen === "join" && CODE) { try { const n = sessionStorage.getItem("bt-name"); if (n) { sessionStorage.removeItem("bt-name"); draw(); $("#name").value = n; return doJoin(); } } catch (e) {} }
  if (screen === "wait" || (CODE && store.get(REQKEY) && !tok)) screen = "wait";
  draw(); poll();
}
boot();
