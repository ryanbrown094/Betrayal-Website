# Every item in every content bank, put on the TV one at a time: nothing may overflow the stage or print undefined.
# Also checks the banks themselves (no duplicates, estimates are numbers, code words well-formed, 25 distinct words per memory wall).
# Usage: python3 qa/banks.py
import sys, json, subprocess, time
from playwright.sync_api import sync_playwright
PORT = 8717
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", "worker/public"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
FREEZE = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}"
SETUP = r"""() => { window.__noCards = true; try { localStorage.clear() } catch (e) {}
  startGame({names:["Annie","Bartholomew","Claire-Louise","Dev","Hannah","Jess","Marcus","Oliver","Priya","Ryan","Sophie","Wilhelmina"],cloaks:3,title:'The Betrayal',host:'Sam',potUnit:'pts',potPer:100,prize:'a bottle of wine',hours:4,pin:'1'});
  act(s=>{s.phase='day'}); }"""
SHEET = r"""() => {
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, ""), out = [];
  const dup = (name, arr) => { const seen = new Set(); arr.forEach(x => { const k = norm(x); if (seen.has(k)) out.push(name + " duplicate: " + x); seen.add(k) }) };
  dup("quiz", [...QUIZ_E, ...QUIZ_M, ...QUIZ_H].map(q => q[0])); dup("estimate", ESTIMATE.map(q => q[0]));
  for (const [n, a] of Object.entries({LIKELY, CHARADES, SONGS, PICTIONARY, CODEWORDS, QUESTS})) dup(n, a);
  ESTIMATE.forEach(q => { if (typeof q[1] !== "number" || !isFinite(q[1])) out.push("estimate not a number: " + q[0]) });
  [...QUIZ_E, ...QUIZ_M, ...QUIZ_H].forEach(q => { if (!q[0] || !q[1]) out.push("quiz item missing text: " + JSON.stringify(q)) });
  MEMSETS.forEach((m, i) => { if (m.length !== 25 || new Set(m).size !== 25) out.push("memory set " + i + " is not 25 distinct items") });
  CODEWORDS.forEach(w => { if (!/^[A-Z]{3,12}$/.test(w)) out.push("bad code word " + w) });
  QUESTS.forEach(q => { if (/\{(?!F\}|T\})/.test(q)) out.push("quest has an unknown placeholder: " + q) });
  return { out, sizes: { QUIZ_E: QUIZ_E.length, QUIZ_M: QUIZ_M.length, QUIZ_H: QUIZ_H.length, ESTIMATE: ESTIMATE.length, LIKELY: LIKELY.length, CHARADES: CHARADES.length, SONGS: SONGS.length, PICTIONARY: PICTIONARY.length, MEMSETS: MEMSETS.length, CODEWORDS: CODEWORDS.length, QUESTS: QUESTS.length } };
}"""
# builds each screen from the real game functions, then measures it like the chaos replay does
SWEEP = r"""(kind) => {
  const bad = [], P0 = () => state.players[1].id;
  const measure = label => {
    lastKey = null; lastPhase = state.phase; renderTV();
    const sg = document.querySelector('#stage'), sr = sg.getBoundingClientRect(), txt = sg.textContent;
    if (/undefined|NaN|\[object|null/.test(txt)) { bad.push(label + ': prints ' + txt.slice(0, 80)); return }
    for (const el of sg.querySelectorAll('*')) { if (el.closest('svg') && el.nodeName !== 'svg') continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (getComputedStyle(el).position === 'absolute' && el.closest('.rt,.ring,.rolecard')) continue;
      if (r.top < sr.top - 2 || r.bottom > sr.bottom + 2 || r.left < -1 || r.right > innerWidth + 1) { bad.push(label + ': ' + (el.className || el.nodeName) + ' overflows'); return } }
    if (document.documentElement.scrollHeight > innerHeight + 1) bad.push(label + ': page scrolls');
  };
  const mission = key => { act(s => { s.phase = 'day'; s.mission = null }); pickMission(key); startMission();startMission() };
  if (kind === 'quiz') { mission('quiz'); for (const [t, bank] of [['E', QUIZ_E], ['M', QUIZ_M], ['H', QUIZ_H]]) bank.forEach((q, i) => { state.mission.qs = [{ id: t + i, q }]; state.mission.qi = 0; state.mission.shouter = P0(); state.mission.showA = true; state.mission.lastRight = true; measure('quiz ' + t + i + ' ' + q[0].slice(0, 40)) }) }
  if (kind === 'estimate') { mission('estimate'); ESTIMATE.forEach((q, i) => { state.mission.order = [i]; state.mission.qi = 0; state.mission.showA = true; measure('estimate ' + i + ' ' + q[0].slice(0, 40)) }) }
  if (kind === 'likely') { mission('likely'); LIKELY.forEach((q, i) => { state.mission.order = [i]; state.mission.qi = 0; state.mission.tally = { [P0()]: 3 }; state.mission.showA = true; measure('likely ' + i + ' ' + q.slice(0, 40)) }) }
  if (kind === 'hilo') { mission('hilo'); ESTIMATE.forEach((q, i) => { state.mission.order = [i]; state.mission.qi = 0; state.mission.ref = hiloRef(q[1]); state.mission.showA = true; measure('hilo ' + i + ' ' + q[0].slice(0, 40)) }) }
  for (const [key, bank] of [['charades', CHARADES], ['hum', SONGS], ['draw', PICTIONARY]]) if (kind === key) { mission(key); bank.forEach((w, i) => { state.mission.order = [i]; state.mission.qi = 0; state.mission.actorId = state.players[state.players.length - 1].id; state.mission.showA = true; state.mission.timerEnd = null; measure(key + ' ' + i + ' ' + w) }) }
  if (kind === 'memory') { mission('memory'); MEMSETS.forEach((m, i) => { state.mission.order = [i]; state.mission.qi = 0; state.mission.timerEnd = null; state.mission.showA = true; measure('memory set ' + i) }) }
  if (kind === 'countdown') { mission('countdown'); CODEWORDS.forEach(w => { state.mission.letters = letters12(w); state.mission.timerEnd = null; measure('countdown ' + w) }) }
  if (kind === 'quests') { act(s => { s.phase = 'day'; s.mission = null }); startNight(); QUESTS.forEach((q, i) => { const n = state.night; n.mode = 'murder'; n.confirmed = true; n.quest = q.replace(/\{F\}/g, 'Claire-Louise').replace(/\{T\}/g, 'Bartholomew'); n.questTarget = /\{T\}/.test(q) ? 'Bartholomew' : null; const sc = nightScript(n, state); n.step = sc.findIndex(l => norm(l).who === 'Forsworn' && /next break/.test(norm(l).tv)); n.revealStep = 99; measure('quest ' + i + ' ' + q.slice(0, 40)) }) }
  return bad;
}"""
ok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    for (w, h) in [(1024, 768), (1280, 720), (1920, 1080)]:
        pg = b.new_page(viewport={"width": w, "height": h}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://localhost:{PORT}/play.html"); pg.wait_for_timeout(1500); pg.add_style_tag(content=FREEZE)
        pg.evaluate(SETUP)
        if (w, h) == (1024, 768):
            sh = pg.evaluate(SHEET); print("bank sizes:", json.dumps(sh["sizes"]))
            for o in sh["out"]: print("BANK", o); ok = False
        total = []
        for kind in ["quiz", "estimate", "hilo", "likely", "charades", "hum", "draw", "memory", "countdown", "quests"]:
            bad = pg.evaluate(SWEEP, kind); total += bad
        for o in total[:15]: print(f"TV {w}x{h}", o)
        print(f"TV {w}x{h}: {len(total)} problems, page errors: {errs[:3]}")
        if total or errs: ok = False
        pg.close()
    b.close()
srv.terminate()
print("RESULT:", "CLEAN" if ok else "PROBLEMS"); sys.exit(0 if ok else 1)
