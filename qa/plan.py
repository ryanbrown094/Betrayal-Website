# The game plan: every setup choice is honoured once the game runs. Own static server on :8721 (local storage mode).
# python3 qa/plan.py
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8721
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "worker/public")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""))
    if not cond: fails.append(name)
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev"]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        ctx = b.new_context(viewport={"width": 390, "height": 844}); h = ctx.new_page(); h.on("pageerror", lambda e: errs.append(str(e)))
        h.goto(f"http://localhost:{PORT}/play.html#host"); h.wait_for_timeout(1200)
        E = h.evaluate; body = lambda: h.inner_text("#host")
        def game(rules, n=10):
            E("()=>{try{localStorage.clear()}catch(e){};state=null;hist=[]}")
            E("(a)=>startGame({names:a[0],cloaks:2,title:'',host:'Sam',potUnit:'£',potCap:2000,prize:'x',hours:4,pin:'1',rules:a[1]})", [NAMES[:n], rules])
            E("()=>act(s=>{s.players.forEach((p,i)=>p.role=[0,1].includes(i)?'cloak':'candle');s.phase='day'})"); h.wait_for_timeout(150)
        # setup screen: the accordion writes the plan into the game
        h.fill("#names", "\n".join(NAMES)); h.fill("#pinset", "1")
        E("()=>{setD('kill','murder');setD('ghosts',false);setD('blade',false);stepD('rounds',3,0,10);setD('perRound',2);poolD('quiz');poolD('statue')}")
        check("turning the blade off turns the Champion off too", E("()=>setupDraft.champion===false"))
        h.click("text=Start game"); h.wait_for_timeout(300)
        r = E("()=>state.rules")
        check("setup choices land in the game's rules", r["kill"] == "murder" and r["ghosts"] is False and r["blade"] is False and r["champion"] is False and r["rounds"] == 3 and r["perRound"] == 2 and "quiz" not in r["pool"], r)
        check("the plan only deals missions from the pool, and never the Statue without Ghosts", E("()=>state.plan.length>0 && state.plan.every(k=>state.rules.pool.includes(k)) && !state.plan.includes('statue')"), E("()=>state.plan"))
        # murder, no Ghosts
        game({"kill": "murder", "ghosts": False})
        E("()=>{act(s=>{s.phase='table';s.table=newTable()});exile(state.players[9].id);if(ask)askGo();revealRole()}")
        check("no Ghost lore or verdicts without Ghosts", "ghost" not in body().lower(), body()[:300])
        E("()=>{startNight();act(s=>{s.night.mode='murder'});beginNight();act(s=>{s.night.victimId=s.players[5].id})}")
        sc = E("()=>nightScript(state.night,state).map(l=>norm(l).tv).join(' | ')")
        check("murder night: the victim is told to leave the table now, and there are no Ghosts to join", "leave the table now" in sc and "thank you for playing" in sc and "Ghost" not in sc, sc)
        check("murder night never says poison", "poison" not in sc.lower() and "poison" not in body().lower())
        E("()=>{act(s=>{s.night.step=nightScript(s.night,s).length-1});finishNight()}")
        check("dawn, murder: the host is told about the empty chair", "empty chair" in body(), body()[:400])
        E("()=>act(s=>{s.morning.revealed=true})")
        check("no last words for the murdered — they've already gone", "Last words" not in body())
        # poison, Ghosts on: last words
        game({"kill": "poison", "ghosts": True})
        E("()=>{startNight();act(s=>{s.night.mode='murder';s.night.victimId=s.players[5].id});beginNight();act(s=>{s.night.step=nightScript(s.night,s).length-1});finishNight();act(s=>{s.morning.revealed=true})}")
        check("poison: announced at dawn, with last words", "Last words" in body() and "poison" in body().lower())
        # rounds and missions per round
        game({"rounds": 3, "perRound": 2})
        E("()=>{pickMission(nextPlanned(state));startMission();startMission();act(s=>finishPlay(s));endMission();act(s=>{if(s.shieldCard)s.shieldCard.step=9})}")
        check("two missions a round: after the first, the plan says another", "Next mission" in h.inner_text(".foot"), h.inner_text(".foot"))
        E("()=>{nextRound();nextRound()}")
        check("a fixed three rounds makes round 3 the final", E("()=>state.round===3 && state.finalRound===3"))
        # prizes by the plan
        game({"shield": "off", "blade": False})
        E("()=>pickMission('quiz')")
        check("shields off, blade off: the mission carries neither", E("()=>state.mission.win==='none' && state.mission.dag==='none'"), E("()=>[state.mission.win,state.mission.dag]"))
        game({"shield": "public", "blade": True, "champion": True})
        E("()=>{act(s=>{s.round=2});pickMission('charades')}")
        check("Champion round: a public shield and the blade ride together", E("()=>state.mission.win==='public' && state.mission.dag==='with'"), E("()=>[state.mission.win,state.mission.dag]"))
        game({"shield": "mix", "blade": True})
        E("()=>pickMission('quiz')")
        check("mixed shields: a round-by-round mission hides its shield, and a blade", E("()=>state.mission.win==='secret' && state.mission.dag==='secret'"), E("()=>[state.mission.win,state.mission.dag]"))
        game({"witness": False})
        E("()=>{act(s=>{s.players.forEach((p,i)=>{p.alive=i<5;p.role=i===0?'cloak':'candle'})});pickMission('quiz')}")
        check("Witness off: never offered, even at five with one Cloak", E("()=>!state.mission.witnessOffer") and "Witness" not in body())
        # the night, by the plan
        game({"convert": False, "bargain": True})
        E("()=>{act(s=>{s.players[1].role='candle'});startNight()}")
        check("convert off: a lone Cloak gets the Bargain instead", E("()=>state.night.mode") == "bargain")
        check("…and only the kinds switched on are offered", not E("()=>[...document.querySelectorAll('#host button')].some(b=>b.textContent.trim()==='Conversion')") and E("()=>[...document.querySelectorAll('#host button')].some(b=>b.textContent.trim()==='Bargain')"))
        game({"quests": True})
        E("()=>startNight()")
        check("side-quests on: one is already chosen for tonight", E("()=>!!state.night.quest"))
        # dinner by the plan
        game({"dinnerAfter": 2})
        E("()=>{startNight();act(s=>{s.night.mode='murder';s.night.victimId=s.players[5].id});beginNight();act(s=>{s.night.step=nightScript(s.night,s).length-1});finishNight();act(s=>{s.morning.revealed=true})}")
        check("dinner after round 2: not offered after round 1", "Dinner now" not in h.inner_text(".foot"))
        E("()=>{nextRound();startNight();act(s=>{s.night.mode='murder';s.night.victimId=s.players[6].id});beginNight();act(s=>{s.night.step=nightScript(s.night,s).length-1});finishNight();act(s=>{s.morning.revealed=true})}")
        check("…and served after round 2", "Dinner now" in h.inner_text(".foot"), h.inner_text(".foot"))
        # the TV in a murder game
        game({"kill": "murder"})
        tv = ctx.new_page(); tv.set_viewport_size({"width": 1920, "height": 1080}); tv.goto(f"http://localhost:{PORT}/play.html"); tv.wait_for_timeout(1500)
        t = tv.evaluate("()=>{const s=publicView(state);s.tvRules=true;s.phase='lobby';const d=document.createElement('div');d.innerHTML=tvView(s).html;return d.textContent}")
        check("TV rules card: murder, no poison", "murder" in t and "poison" not in t.lower(), t)
        check("no page errors", not errs, errs[:3])
        b.close()
finally:
    srv.terminate()
print("RESULT:", "CLEAN" if not fails else "PROBLEMS " + str(len(fails))); sys.exit(1 if fails else 0)
