/* ===================== BOOT ===================== */
document.body.insertAdjacentHTML("afterbegin", ART.defs());
let lastHostPhase = null;
listeners.push(() => {
  if (!isHost) return renderTV();
  renderHost();
  const ph = state && authed ? state.phase + (state.mission ? state.mission.stage : "") : "-";
  if (ph !== lastHostPhase) { lastHostPhase = ph; window.scrollTo(0, 0) }
});
window.addEventListener("hashchange", () => location.reload());
if (isHost) renderHost(); else renderTV();
if (!REPLAY) store.init();
// A new build reloads the page — but the TV waits for a calm phase, so a ceremony is never interrupted.
let newBuild = false;
const calm = () => !state || ["lobby", "day", "mingle", "morning", "final"].includes(state.phase);
// The phone waits too while a guest holds it for a secret vote, a sheet is open, or someone is typing (a reload would lose the setup draft).
const hostIdle = () => !handoff && !ask && !menuOpen && !(setupDraft && setupDraft.names.trim() && !(state && authed)) && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.nodeName));
if (BUILD && !REPLAY) setInterval(async () => { try { const r = await fetch("/build.txt", { cache: "no-store" }); if (r.ok) { const b = (await r.text()).trim(); if (/^\d{14}$/.test(b) && b !== BUILD) newBuild = true } } catch (e) {} if (newBuild && (isHost ? hostIdle() : calm())) location.reload() }, 60000);
document.title = isHost ? "Host · Cloak & Candle" : "Cloak & Candle";
// keep the elapsed clock and pace advice fresh without disturbing typing or a guest holding the phone
if (isHost) setInterval(() => { const a = document.activeElement; if (state && authed && !handoff && !(a && /INPUT|TEXTAREA/.test(a.nodeName))) renderHost() }, 30000);
// What Changed?: when the study clock runs out, the grid hides by itself — the TV counts ten seconds, then shows the new one
if (isHost) setInterval(() => { const m = state && authed && state.phase === "mission" && state.mission; if (m && m.key === "change" && m.cstage === "study" && m.timerEnd && now() >= m.timerEnd && !handoff) changeBlind() }, 500);
// neither screen should fall asleep mid-ceremony
let wake = null;
async function keepAwake() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null }) } } catch (e) {} }
document.addEventListener("pointerdown", keepAwake);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { keepAwake(); if (AC && AC.state === "suspended") AC.resume() } });
