# Reviewer's audit: phone widths, TV sizes, player counts, tap targets, contrast, tiny text, overflow, dialogs.
import json, sys, subprocess, time, re
from playwright.sync_api import sync_playwright
PORT = 8718
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", "worker/public"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = f"http://localhost:{PORT}/play.html"
FREEZE = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}"
NAMES14 = ["Annie", "Ryan", "Bartholomew", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev", "Claire-Louise", "Ben", "Zoë", "José"]

# host screens to visit (state builders run on the host page)
HOST_STATES = [
  ("setup", "newGame()"),
  ("lobby", "startGame({names:NAMES,cloaks:3,title:'The Betrayal',host:'Sam',potUnit:'pts',potPer:100,prize:'a bottle of wine',hours:4.5,pin:'1'})"),
  ("day", "act(s=>{s.phase='day';s.startedAt=now()})"),
  ("quiz_rules", "pickMission('quiz');mWin('public')"),
  ("quiz_play", "startMission();startMission()"),
  ("quiz_locked", "act(s=>{s.mission.shouter=state.players[2].id})"),
  ("quiz_done", "act(s=>finishPlay(s))"),
  ("shield_card", "act(s=>{s.mission.secIds=[state.players[2].id]});endMission();act(s=>{s.shieldCard.step=3})"),
  ("countdown", "act(s=>{s.phase='day'});pickMission('countdown');startMission();startMission()"),
  ("charades", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('charades');startMission();startMission()"),
  ("memory", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('memory');startMission();startMission()"),
  ("truths", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('truths');startMission();startMission();truthsPick(state.players[2].id);truthsGo('tell')"),
  ("hilo", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('hilo');startMission();startMission();act(s=>{s.mission.showA=true})"),
  ("change", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('change');startMission();startMission();changeStudy();changeBlind();changeLook()"),
  ("custom_rules", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('custom')"),
  ("mingle", "startMission();startMission();act(s=>finishPlay(s));endMission();act(s=>{s.phase='mingle';s.mingle={end:null,dur:600000,kind:'mingle'}})"),
  ("table", "openTable()"),
  ("table_votes", "act(s=>{s.table.stage='votes'});const A=aliveOf(state);A.slice(0,5).forEach((p,i)=>castBallot(p.id,A[(i+1)%A.length].id))"),
  ("table_exile", "act(s=>{s.table.stage='exile'})"),
  ("seats", "seatOpen=true;renderHost()"),
  ("reveal", "seatOpen=false;exile(state.players[1].id);askGo()"),
  ("reveal_lore", "revealRole();act(s=>{s.table.step=2})"),
  ("night_pick", "startNight()"),
  ("night_script", "beginNight();act(s=>{s.night.step=3})"),
  ("morning", "act(s=>{s.night.victimId=s.players[0].id});finishNight();act(s=>{s.morning.revealed=true})"),
  ("ghost_handoff", "handoff={kind:'ghost',id:state.players[0].id};renderHost()"),
  ("menu", "handoff=null;menuOpen=true;renderHost()"),
  ("bank", "menuOpen=false;openBank();bankToggle('QUIZ_E',1);bankTab='QUIZ_E';renderHost()"),
  ("bank_quests", "bankTab='QUESTS';renderHost()"),
  ("endvote", "bankOpen=false;menuOpen=false;act(s=>{s.finalRound=s.round});openEndvote()"),
  ("endvote_hand", "handoff={kind:'endvote',id:state.players[3].id};renderHost()"),
  ("ceremony", "handoff=null;startCeremony();revealSurvivor(aliveOf(state)[0].id)"),
  ("final", "aliveOf(state).forEach(p=>revealSurvivor(p.id));act(s=>{s.phase='final';s.winner='candles';s.prizeTo='the Candles';s.players.forEach(p=>p.revealed=true)})"),
]
TV_SIZES = [(1024, 768), (1366, 768), (1440, 900), (1920, 1080), (2560, 1080), (3840, 2160)]
TV_STATES = [
  ("lobby", "act(s=>{s.phase='lobby'})"), ("rules", "act(s=>{s.tvRules=true})"), ("day", "act(s=>{s.tvRules=false;s.phase='day';s.startedAt=now()})"),
  ("quiz", "pickMission('quiz');startMission();startMission();act(s=>{s.mission.shouter=s.players[1].id;s.mission.showA=true})"),
  ("memory", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('memory');startMission();startMission();act(s=>{s.mission.timerEnd=now()+45000;s.mission.timerDur=45000})"),
  ("change", "act(s=>{s.mission.timerEnd=null;finishPlay(s)});endMission();act(s=>{s.phase='day'});pickMission('change');startMission();startMission();changeStudy();changeBlind();changeLook();changeAward(aliveOf(state)[0].id)"),
  ("hilo", "act(s=>finishPlay(s));endMission();act(s=>{s.phase='day'});pickMission('hilo');startMission();startMission();act(s=>{s.mission.showA=true})"),
  ("table", "act(s=>finishPlay(s));endMission();openTable();act(s=>{s.champion={id:s.players[0].id,round:s.round};s.players[3].shield='secret';s.table.stage='votes'});const A=aliveOf(state);A.slice(0,5).forEach((p,i)=>castBallot(p.id,A[(i+4)%A.length].id))"),
  ("reveal", "exile(state.players[1].id);askGo();revealRole()"),
  ("endvote", "act(s=>{s.finalRound=s.round});openEndvote();act(s=>{const A=aliveOf(s);A.forEach((p,i)=>s.endvote.votes[p.id]=i%4?'end':'exile')});startEndReveal();act(s=>{s.endvote.revealed=s.endvote.order.length})"),
  ("ceremony", "startCeremony();aliveOf(state).slice(0,2).forEach(p=>revealSurvivor(p.id))"),
  ("final", "act(s=>{s.phase='final';s.winner='candles';s.prizeTo='the Candles';s.players.forEach(p=>p.revealed=true)})"),
]
CHECK_HOST = r"""() => {
  const out = {w: document.documentElement.scrollWidth, small: [], tiny: [], dialogs: 0};
  for (const b of document.querySelectorAll('#host button, #host input, #host textarea, #host .spoil')) {
    const r = b.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.height < 44 || r.width < 44) out.small.push((b.textContent || b.id || b.className).trim().slice(0, 24) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  const walker = document.createTreeWalker(document.querySelector('#host'), NodeFilter.SHOW_TEXT);
  let n; const seen = new Set();
  while ((n = walker.nextNode())) { const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement, fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12 && !seen.has(el)) { seen.add(el); out.tiny.push(t.slice(0, 20) + ' ' + fs + 'px ' + el.className) } }
  return out }"""
CHECK_TV = r"""() => { const out = [], sg = document.querySelector('#stage'), tv = document.querySelector('#tv'), sr = (() => { const b = sg.getBoundingClientRect(), k = parseFloat(sg.style.scale) || 1, cy = (b.top + b.bottom) / 2; return { top: cy - b.height / k / 2, bottom: cy + b.height / k / 2, left: b.left, right: b.right } })(); // the stage's area, unscaled (src/tv.js fitStage)
  for (const el of sg.querySelectorAll('*')) { if (el.closest('svg') && el.nodeName !== 'svg') continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (getComputedStyle(el).position === 'absolute' && el.closest('.rt,.ring,.rolecard')) continue;
    if (r.top < sr.top - 2 || r.bottom > sr.bottom + 2 || r.left < -1 || r.right > innerWidth + 1) { out.push('stage overflow: ' + (el.className || el.nodeName) + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' vs ' + Math.round(sr.top) + '..' + Math.round(sr.bottom)); break } }
  const row = document.querySelector('#rail .row'); if (row && !tv.classList.contains('norail')) { const seats = [...row.querySelectorAll('.seat')]; const rr = row.getBoundingClientRect(); if (seats.length) { const w = seats.reduce((a, s) => a + s.getBoundingClientRect().width, 0); if (w > rr.width + 1) out.push('rail too wide ' + Math.round(w) + '>' + Math.round(rr.width)) }
    for (const p of row.querySelectorAll('.plaque')) if (p.scrollWidth > p.clientWidth + 1) out.push('plaque clipped: ' + p.textContent) }
  const rt = sg.querySelector('.rt'); if (rt) for (const el of rt.querySelectorAll('.nm,.chairseal')) { const r = el.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) { out.push('round table off-screen: ' + el.textContent); break } }
  // overlapping name plaques around the table
  if (rt) { const nm = [...rt.querySelectorAll('.nm')].map(e => e.getBoundingClientRect()); for (let i = 0; i < nm.length; i++) for (let j = i + 1; j < nm.length; j++) { const a = nm[i], b = nm[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) { out.push('table names overlap'); i = nm.length; break } } }
  if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls');
  return out.slice(0, 4) }"""
def lum(h):
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def contrast(a, b): la, lb = lum(a), lum(b); return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

findings = []
# the palette as it is now, read from src/style.css (text tokens on the two page backgrounds, and the button colours)
CSS = open("src/style.css").read(); ROOT = CSS[CSS.index(":root {"):]; TOK = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", ROOT[:ROOT.index("}")]))
BG1, BG2 = TOK["soot"], TOK["peat"]
BTN = re.search(r"#host button\.primary, #host button\.danger, #host button\.good \{[^}]*?color: (#[0-9a-fA-F]{6})", CSS).group(1)
print(f"== contrast (on {BG1} / {BG2}) ==")
for name, *lim in [("tallow",), ("tallow2",), ("mist",), ("brass",), ("brass2",), ("blood2",), ("blood", 3.0), ("steel",), ("verd",)]:
    # blood only ever colours big display headlines (h1, with a glow): large text needs 3:1, everything else 4.5:1
    need = lim[0] if lim else 4.5; hexv = TOK[name]
    c1, c2 = contrast(hexv, BG1), contrast(hexv, BG2); print(f"  {name:8s} {hexv}  {c1:4.1f}:1  {c2:4.1f}:1" + ("   <-- below " + str(need) if min(c1, c2) < need else ""))
    if min(c1, c2) < need: findings.append(f"contrast {name} {min(c1,c2):.1f}:1")
# the host's buttons are 19px bold, which counts as large text: 3:1
for name in ("brass", "ox", "verd2"):
    c = contrast(BTN, TOK[name]); print(f"  button text {BTN} on {name} {TOK[name]}: {c:.1f}:1" + ("   <-- below 3" if c < 3 else ""))
    if c < 3: findings.append(f"contrast button on {name} {c:.1f}:1")

with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    print("== host phone ==")
    # phones, the iPhone 17 Pro Max (440×956 @3x), iPad Pro 11" upright (834×1210 @2x) and on its side (1210×834)
    for W, Hh, dpr in ((320, 700, 2), (360, 700, 3), (390, 844, 3), (430, 932, 3), (440, 956, 3), (834, 1210, 2), (1210, 834, 2)):
        ctx = b.new_context(viewport={"width": W, "height": Hh}, device_scale_factor=dpr, is_mobile=W < 700, has_touch=True); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        dialogs = []; pg.on("dialog", lambda d: (dialogs.append(d.type + ": " + d.message[:40]), d.accept()))
        pg.goto(URL + "#host"); pg.wait_for_timeout(700); pg.add_style_tag(content=FREEZE)
        pg.evaluate("(n)=>{window.NAMES=n;try{localStorage.clear();sessionStorage.clear()}catch(e){}}", NAMES14[:12])
        for name, js in HOST_STATES:
            try: pg.evaluate("()=>{" + js + "}")
            except Exception as e: findings.append(f"host {W} {name}: JS threw {str(e)[:80]}"); continue
            pg.wait_for_timeout(60)
            r = pg.evaluate(CHECK_HOST)
            if r["w"] > W: findings.append(f"host {W}px {name}: horizontal overflow {r['w']}px")
            if r["small"] and W in (390, 440, 834): findings.append(f"host {name}: tap targets under 44px: {r['small'][:4]}")
            if r["tiny"] and W in (390, 440, 834): findings.append(f"host {name}: text under 12px: {r['tiny'][:3]}")
            # footer wrapping
            fh = pg.evaluate("()=>{const f=document.querySelector('#host .foot');return f?f.getBoundingClientRect().height:0}")
            if fh > 150: findings.append(f"host {W}px {name}: footer is {int(fh)}px tall (buttons wrapping)")
        if dialogs: findings.append(f"host {W}px: native dialogs used: {sorted(set(dialogs))}")
        ctx.close()
    print("== TV sizes × player counts ==")
    for n in (4, 8, 14):
        for (W, H) in TV_SIZES:
            ctx = b.new_context(viewport={"width": W, "height": H}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append("TV " + str(e))); pg.on("dialog", lambda d: d.accept())
            pg.goto(URL + "#host"); pg.wait_for_timeout(600)
            pg.evaluate("(n)=>{try{localStorage.clear()}catch(e){};startGame({names:n,cloaks:n.length>=11?3:n.length<=5?1:2,title:'The Betrayal',host:'Sam',potUnit:'pts',potPer:100,prize:'a bottle of wine',hours:4.5,pin:'1'})}", NAMES14[:n])
            tv = ctx.new_page(); tv.on("pageerror", lambda e: errs.append("TV " + str(e))); tv.goto(URL); tv.wait_for_timeout(700); tv.add_style_tag(content=FREEZE); tv.evaluate("()=>{window.__noCards=true}")
            for name, js in TV_STATES:
                pg.evaluate("()=>{" + js + "}"); tv.evaluate("()=>{state=JSON.parse(localStorage.getItem(KEY));renderTV()}"); tv.wait_for_timeout(40)
                o = tv.evaluate(CHECK_TV)
                if o: findings.append(f"TV {W}x{H} {n}p {name}: {o}")
            ctx.close()
    b.close()
srv.terminate()
print("== findings ==")
for f in findings: print(" -", f)
print("page errors:", errs[:5]); print(len(findings), "findings")
