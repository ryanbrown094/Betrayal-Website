/* ===================== DIAGNOSTICS: the trail, errors, "Report a problem", replay ===================== */
// Each browser keeps a short trail of what happened on it (taps, screens, sync trouble, errors) and sends it to the room
// every few seconds, so a game can be debugged from /admin. Nothing typed is recorded, only button labels. A report adds
// a snapshot of the screen (the page's HTML, without its scripts) and the trail, and keeps the room for its replay.
// /play.html#replay-tv and #replay-host show a recorded state instead of a live game: /admin drives them with replayShow().
const REPLAY = /^#replay/.test(location.hash);
const DEVICE = (() => { try { let d = localStorage.getItem("bt-device"); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("bt-device", d) } return d } catch (e) { return "t" + Math.random().toString(36).slice(2, 9) } })();
const crumbs = [], evQ = []; let evT = null, lastView = null, reportBox = null;
function crumb(k, m, extra) {
  if (REPLAY) return;
  const e = { t: Date.now(), k, m: String(m == null ? "" : m).slice(0, 400), ...(extra || {}) };
  crumbs.push(e); if (crumbs.length > 300) crumbs.shift();
  evQ.push(e); if (evQ.length > 500) evQ.shift();
  if (k === "error") flushEv(); else if (!evT) evT = setTimeout(flushEv, 15000);
}
function flushEv(beacon) {
  clearTimeout(evT); evT = null;
  if (!ROOM || !evQ.length || !/^https?:$/.test(location.protocol)) return;
  const body = JSON.stringify({ device: DEVICE, host: isHost, build: BUILD, events: evQ.splice(0, 80) }); // well under the server's 32 KB a batch
  if (evQ.length) evT = setTimeout(flushEv, 1000);
  if (beacon && navigator.sendBeacon) { navigator.sendBeacon(API + "/events", new Blob([body], { type: "application/json" })); return }
  fetch(API + "/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}
if (!REPLAY) {
  crumb("open", (isHost ? "host" : "TV") + " · " + innerWidth + "×" + innerHeight + " @" + (devicePixelRatio || 1) + " · " + navigator.userAgent);
  window.addEventListener("error", e => crumb("error", e.message || "error", { stack: e.error && e.error.stack ? String(e.error.stack) : "", src: (e.filename || "") + ":" + (e.lineno || 0) + ":" + (e.colno || 0) }));
  window.addEventListener("unhandledrejection", e => { const r = e.reason; crumb("error", "Unhandled promise: " + (r && r.message || r), { stack: r && r.stack ? String(r.stack) : "" }) });
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("button,a,summary,[role=button]"); if (b && !(reportBox && reportBox.contains(b))) crumb("tap", (b.getAttribute("aria-label") || b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90)) }, true);
  addEventListener("pagehide", () => flushEv(true));
  document.addEventListener("visibilitychange", () => { crumb("vis", document.visibilityState); if (document.visibilityState === "hidden") flushEv(true) });
  addEventListener("online", () => crumb("net", "online")); addEventListener("offline", () => crumb("net", "offline"));
  listeners.push(s => { const v = s ? s.phase + (s.mission ? " · " + s.mission.key + " " + s.mission.stage : "") + " · round " + s.round + " · v" + (s.ver || 0) : "no game"; if (v !== lastView) { lastView = v; crumb("view", v) } });
}

/* ---- Report a problem ---- */
async function gzB64(str) {
  if (!window.CompressionStream) return "";
  const cs = new CompressionStream("gzip"), w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close();
  const u = new Uint8Array(await new Response(cs.readable).arrayBuffer()); let b = ""; for (let i = 0; i < u.length; i += 32768) b += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
  return btoa(b);
}
// the screen as it is now: the page's HTML and styles without its scripts, with where it was scrolled to
function snapshot() {
  const d = document.documentElement.cloneNode(true);
  d.querySelectorAll("script,#report").forEach(x => x.remove());
  d.querySelectorAll("input,textarea").forEach(x => { if (x.type === "password" || x.id === "pin" || x.id === "pinset") x.setAttribute("value", "••••"); else if (x.value !== undefined) x.setAttribute("value", x.value) });
  const meta = { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, x: scrollX, y: scrollY, host: isHost, at: Date.now() };
  return "<!doctype html>" + d.outerHTML.replace("<head>", '<head><base href="' + location.origin + '/"><meta name="snapshot" content=\'' + JSON.stringify(meta) + '\'>');
}
async function openReport() {
  if (reportBox) return;
  crumb("report", "opened the report form");
  let snap = ""; try { snap = snapshot() } catch (e) { crumb("error", "snapshot failed: " + e.message) }
  const box = reportBox = document.createElement("div"); box.id = "report"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "rp-h");
  box.innerHTML = `<form class="rp"><h2 id="rp-h">Report a problem</h2><p>Tell us what went wrong. We’ll get a snapshot of this screen and a record of what happened in this game, so you don’t need to describe everything.</p>
<label for="rp-what">What happened?</label><textarea id="rp-what" rows="4" placeholder="e.g. The TV froze on the votes after I tapped Reveal…"></textarea>
<label for="rp-exp">What did you expect to happen? <small>(optional)</small></label><textarea id="rp-exp" rows="2"></textarea>
<label for="rp-mail">Your email, if you’d like a reply <small>(optional)</small></label><input id="rp-mail" type="email" autocomplete="email" spellcheck="false">
<label class="rp-chk"><input id="rp-snap" type="checkbox" checked> Include a snapshot of this screen${isHost ? " (it can show who the Forsworn are, and only we will see it)" : ""}</label>
<p class="rp-msg" id="rp-msg" role="status"></p><div class="rp-row"><button type="button" class="rp-cancel">Cancel</button><button type="submit" class="rp-send">Send report</button></div></form>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); reportBox = null };
  box.querySelector(".rp-cancel").onclick = close;
  box.addEventListener("keydown", e => { if (e.key === "Escape") close(); e.stopPropagation() });
  setTimeout(() => { const t = box.querySelector("#rp-what"); if (t) t.focus() }, 50);
  box.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const msg = box.querySelector("#rp-msg"), what = box.querySelector("#rp-what").value.trim(), send = box.querySelector(".rp-send");
    if (!what) { msg.textContent = "Tell us what went wrong first."; box.querySelector("#rp-what").focus(); return }
    send.disabled = true; msg.textContent = "Sending…"; flushEv();
    try {
      const body = { room: ROOM, device: DEVICE, host: isHost, build: BUILD + " " + APPV, ua: navigator.userAgent, url: location.pathname + (isHost ? "#keeper" : ""), what, expected: box.querySelector("#rp-exp").value.trim(), email: box.querySelector("#rp-mail").value.trim(),
        phase: lastView || "", ver: state ? state.ver || 0 : 0, screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }, crumbs: crumbs.slice(-200), snap: box.querySelector("#rp-snap").checked && snap ? await gzB64(snap) : "" };
      const r = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "It didn’t send (" + r.status + ")");
      crumb("report", "sent " + j.id);
      box.querySelector("form").innerHTML = `<h2>Thank you</h2><p>Your report is in. Its reference is <b>${esc(j.id)}</b>, in case you write to us about it. If you left your email, we’ll reply within 24 hours.</p><div class="rp-row"><button type="button" class="rp-send">Back to the game</button></div>`;
      box.querySelector(".rp-send").onclick = close;
    } catch (err) { send.disabled = false; msg.textContent = (err.message || "It didn’t send") + ". Check the connection and try again." }
  };
}

/* ---- replay: /admin shows a recorded state in this page ---- */
if (REPLAY) window.replayShow = s => {
  connecting = false; roomMissing = false; roomExpired = false; window.__noCards = true;
  state = s ? (isHost ? s : publicView(s)) : null; authed = !!s; serverHasGame = !!s; remote = false;
  if (!isHost && typeof lastKey !== "undefined") lastKey = null;
  emit();
};
