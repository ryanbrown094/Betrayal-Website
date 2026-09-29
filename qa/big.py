# Big tables: 8 to 24 players, the second vote above sixteen, many-victim nights, and every TV screen of a 24-player game
# at 720p, 1080p and 4:3. Own static server on :8722 (local storage mode).
# python3 qa/big.py
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8722
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "worker/public")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""))
    if not cond: fails.append(name)
FIRST = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev", "Claire-Louise", "Bartholomew", "Zoë", "Mo", "D'Arcy", "José", "Wilhelmina", "Al", "Kit", "Nadia",
         "Ffion", "Olu", "Grace", "Hamish", "Ines", "Jun", "Keeley", "Luca", "Mairead", "Niamh", "Osric", "Pip", "Quentin", "Rosa", "Siobhan", "Tariq", "Uma", "Vik", "Wren", "Xander", "Yusuf"]
FREEZE = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}"
OVER = r"""(st) => { window.__noCards = true; state = st; lastKey = null; lastPhase = st.phase; renderTV();
  const out = [], sg = document.querySelector('#stage'), sr = sg.getBoundingClientRect();
  for (const el of sg.querySelectorAll('*')) { if (el.closest('svg') && el.nodeName !== 'svg') continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (getComputedStyle(el).position === 'absolute' && el.closest('.rt,.ring,.rolecard')) continue;
    if (r.top < sr.top - 2 || r.bottom > sr.bottom + 2 || r.left < -1 || r.right > innerWidth + 1) { out.push((el.className || el.nodeName) + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' stage ' + Math.round(sr.top) + '..' + Math.round(sr.bottom)); break } }
  const rt = sg.querySelector('.rt'); if (rt) for (const el of rt.querySelectorAll('.nm,.chairseal')) { const r = el.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) { out.push('table seat off-screen: ' + el.textContent); break } }
  if (document.documentElement.scrollHeight > innerHeight + 1) out.push('page scrolls vertically');
  return out }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        h = b.new_context(viewport={"width": 390, "height": 844}).new_page(); h.on("pageerror", lambda e: errs.append(str(e)))
        h.goto(f"http://localhost:{PORT}/play.html#host"); h.wait_for_timeout(1200); h.add_style_tag(content=FREEZE)
        E = h.evaluate
        def setup(n):
            E("()=>{try{localStorage.clear();sessionStorage.clear()}catch(e){};state=null;hist=[];setupDraft=null;renderHost()}"); h.wait_for_timeout(100)
            h.evaluate("(a)=>{setupDraft=Object.assign(SETUP0(),{names:a[0],pin:a[1]},a[2]||{});setupDraft.touched=Object.keys(a[2]||{});submitSetup()}", ["\n".join(FIRST[:n]), "1111"]); h.wait_for_timeout(250)
            return E("()=>state?state.players.length:0")
        check("7 players are refused", setup(7) == 0 and "at least 8" in h.inner_text("#host"))
        check("25 players are refused", setup(25) == 0 and "24 players at most" in h.inner_text("#host"))
        check("8 players start", setup(8) == 8)
        check("24 players start, with 5 Cloaks by default", setup(24) == 24 and E("()=>defaults(24).t") == 5)
        E("()=>{try{localStorage.clear();sessionStorage.clear()}catch(e){};state=null;hist=[];setupDraft=null;renderHost()}"); h.wait_for_timeout(100)
        h.evaluate("(a)=>{setupDraft=Object.assign(SETUP0(),{names:a,pin:'1111',step:'rounds'});renderHost()}", "\n".join(FIRST[:24])); h.wait_for_timeout(150)
        lo, hi = E("()=>roundsRange(24)")
        check("24 players: the rounds page offers the fewest to the most", f"can play {lo} to {hi} rounds" in h.inner_text("#host") and (lo, hi) == (8, 11) and h.locator(".wopt").count() == hi - lo + 1, (lo, hi))
        E("()=>wSet('rounds',11)"); check("picking the most sticks", E("()=>setupDraft.rounds") == hi)
        E("()=>wSet('rounds',30)"); check("…and nothing past it", E("()=>setupDraft.rounds") == hi)
        setup(24)
        check("round plan: 8 rounds at 24, 7 at 20, 5 at 14, 3 at 8", E("()=>[autoRounds(24),autoRounds(20),autoRounds(14),autoRounds(8)]") == [8, 7, 5, 3], E("()=>[autoRounds(24),autoRounds(20),autoRounds(14),autoRounds(8)]"))
        samples = {}
        def snap(tag): samples[tag] = E("()=>JSON.parse(JSON.stringify(state))")
        E("()=>act(s=>{s.players.forEach((p,i)=>p.role=i<5?'cloak':'candle');s.phase='day';s.startedAt=Date.now()})"); snap("day40")
        # the Reckoning at 24: two votes
        E("()=>act(s=>{s.round=3})"); E("()=>openTable()"); snap("table-talk40")  # a round that has to run at full stretch
        check("24 at the Reckoning, behind schedule: two votes, three victims planned", E("()=>state.table.exiles") == 2 and E("()=>state.rt.kills") == 3, E("()=>state.rt"))
        E("()=>{const A=aliveOf(state);act(s=>{s.table.stage='votes'});for(const p of A)castBallot(p.id,p.id===A[10].id?A[11].id:A[10].id)}"); snap("table-votes40")
        E("()=>{toExile()}"); snap("table-exile40")
        E("()=>{exile(aliveOf(state)[10].id);askGo()}"); snap("reveal0-40")
        E("()=>revealRole()"); snap("reveal1-40"); E("()=>act(s=>{s.table.step=2;s.ghostIntroDone=true})"); snap("reveal2-40")
        check("after the first reveal the host is offered the second vote", "The second vote" in h.inner_text("#host"), h.inner_text("#host")[-400:])
        E("()=>secondVote()"); snap("table-second")
        check("second vote: a fresh table, the first exile gone", E("()=>state.phase==='table'&&state.table.second&&!Object.keys(state.table.ballots).length&&aliveOf(state).length===23"))
        E("()=>act(s=>{s.champion={id:s.players[20].id,round:s.round,secret:false}})")
        check("the blade doesn't vote in the second vote", E("()=>championOf(state)===null"))
        E("()=>{const A=aliveOf(state);act(s=>{s.table.stage='votes'});for(const p of A)castBallot(p.id,p.id===A[12].id?A[13].id:A[12].id);toExile();exile(A[12].id);askGo();revealRole()}")
        check("no third vote: straight into the night", "Into the night" in h.inner_text("#host") and "The second vote" not in h.inner_text("#host"))
        # night at 22 alive: three victims, one pass each
        E("()=>startNight()"); snap("night-hold")
        check("22 alive: three victims tonight", E("()=>killsOf(state.night)") == 3)
        E("()=>act(s=>{s.night.mode='murder'})"); E("()=>beginNight()")
        C = E("()=>candles().map(p=>p.id)")
        E("(id)=>act(s=>{P2(s,id).shield='public'})", C[2])
        for i in range(3):
            steps = E("()=>nightScript(state.night,state).length")
            E("(id)=>act(s=>{s.night.victimId=id})", C[i])
            for st in range(steps): E("(st)=>act(s=>{s.night.step=st})", st); snap(f"night-p{i}-s{st}")
            pv = E("()=>publicView(state).night")
            check(f"pass {i + 1}: the public view never names earlier victims", all(x == "·" for x in pv["victims"]) and len(pv["victims"]) == i, pv["victims"])
            if i < 2:
                check(f"pass {i + 1}: the host is offered the next victim", "Next victim" in h.inner_text("#host"))
                E("()=>nextVictim()")
                E("()=>act(s=>{s.night.step=nightScript(s.night,s).findIndex(l=>norm(l).pick)})")
                offered = E("()=>[...document.querySelectorAll('#host .plist button')].map(b=>b.getAttribute('onclick')||'').join(' ')")
                check(f"pass {i + 2}: the picker leaves out tonight's earlier victims", "victimId" in offered and not any(c in offered for c in C[:i + 1]), offered[:200])
        check("last pass ends at dawn", "To dawn" in h.inner_text("#host"))
        E("()=>finishNight()"); snap("morning0")
        m = E("()=>state.morning")
        check("two die, the shielded one lives", m["kind"] == "murder" and m["many"] and len(m["victimIds"]) == 2 and m["saved"] and E("()=>aliveOf(state).length") == 20, m)
        E("()=>act(s=>{s.morning.revealed=true})"); snap("morning1")
        check("dawn TV names both", all(E("(id)=>P(id).name", c) in E("()=>tvView(state).html") for c in [C[0], C[1]]))
        E("()=>act(s=>{s.morning.lastEnd=now()+60000;s.morning.lastDone=true})"); snap("morning-last")
        # never below five: a night with six alive takes one
        E("()=>act(s=>{s.players.forEach((p,i)=>{p.alive=i<6;p.role=i<2?'cloak':'candle'});s.phase='day';s.round=5})")
        check("six alive: one victim", E("()=>nightKills(state)") == 1)
        check("thresholds: 12→2, 20→3, 24→3, 11→1, 16 one vote, 17 two", E("()=>[killsAt(12),killsAt(20),killsAt(24),killsAt(11),exilesAt(16),exilesAt(17)]") == [2, 3, 3, 1, 1, 2])
        # the final opens with too many (a shield held, say): silent votes until five, one more mission, the last vote, then End or Exile
        E("()=>act(s=>{s.players.forEach((p,i)=>{p.alive=i<6;p.role=i<2?'cloak':'candle';p.shield=null});s.round=7;s.finalRound=7;s.phase='day'})")
        E("()=>{openTable();const A=aliveOf(state);act(s=>{s.table.stage='votes'});for(const p of A)castBallot(p.id,p.id===A[5].id?A[4].id:A[5].id);toExile();exile(A[5].id);askGo();revealRole()}")
        foot = h.inner_text("#host")
        check("final with six: after the first silent exile, one more mission at five (where the Witness is won), not End or Exile", "Five left — one more Trial" in foot and "Trust or Doubt —" not in foot, foot[-300:])
        check("…and the exiled role stays hidden", not E("()=>state.players[5].revealed"))
        E("()=>{fiveMission();openTable('Final: the last vote');const A=aliveOf(state);act(s=>{s.table.stage='votes'});for(const p of A)castBallot(p.id,p.id===A[4].id?A[3].id:A[4].id);toExile();exile(A[4].id);askGo();revealRole()}")
        check("at four: End or Exile", "Trust or Doubt — four left" in h.inner_text("#host"))
        # parity mid-game no longer ends it: the game plays on to the final
        E("()=>act(s=>{s.players.forEach((p,i)=>{p.alive=i<8;p.role=i<4?'cloak':'candle'});s.round=2;s.finalRound=null;s.phase='day'})")
        E("()=>{openTable();const A=aliveOf(state);act(s=>{s.table.stage='votes'});for(const p of A)castBallot(p.id,p.id===A[7].id?A[6].id:A[7].id);toExile();exile(A[7].id);askGo();revealRole();act(s=>{s.table.step=2;s.ghostIntroDone=true})}")
        foot = h.inner_text("#host")
        check("Cloaks at parity mid-game: into the night, no early ceremony", "Into the night" in foot and "final ceremony" not in foot, foot[-300:])
        # every screen of a 24-player game on the TV
        for tag, extra in [("final40", "act(s=>{s.players.forEach(p=>{p.alive=true;p.revealed=true});s.phase='final';s.winner='cloaks';s.prizeTo='x'})"), ("lobby40", "act(s=>{s.players.forEach(p=>{p.alive=true;p.revealed=false});s.phase='lobby'})"),
                           ("intro40", "act(s=>{s.phase='intro'})"), ("mission40", "act(s=>{s.phase='day'});pickMission('likely')"), ("rps40", "act(s=>{s.phase='day'});pickMission('rps');startMission();startMission()"),
                           ("hilo40", "act(s=>{s.phase='day'});pickMission('hilo');startMission();startMission()"), ("quiz40", "act(s=>{s.phase='day'});pickMission('quiz');startMission();startMission()")]:
            try: E("()=>{" + extra + "}"); snap(tag)
            except Exception as e: check("scenario " + tag, False, e)
        check("no page errors on the host", not errs, errs[:3])
        for (w, hh) in [(1280, 720), (1920, 1080), (1024, 768)]:
            tv = b.new_context(viewport={"width": w, "height": hh}).new_page(); terr = []
            tv.on("pageerror", lambda e: terr.append(str(e))); tv.goto(f"http://localhost:{PORT}/play.html"); tv.wait_for_timeout(1000); tv.add_style_tag(content=FREEZE)
            bad = []
            for tag, st in samples.items():
                o = tv.evaluate(OVER, st)
                if o:
                    bad.append((tag, o))
                    if len(bad) <= 3: os.makedirs(os.path.join(ROOT, "qa/shots"), exist_ok=True); tv.screenshot(path=os.path.join(ROOT, f"qa/shots/big_{w}_{tag}.png"))
            check(f"TV {w}x{hh}: {len(samples)} screens of a 24-player game fit", not bad and not terr, (bad[:6], terr[:2]))
finally:
    srv.terminate()
print("RESULT:", "CLEAN" if not fails else "PROBLEMS")
sys.exit(1 if fails else 0)
