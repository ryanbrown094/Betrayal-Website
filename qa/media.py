# Screenshots for the media pack and the home page: the TV at 1920x1080 and the host phone at 390x844 (@3x).
# node qa/server.mjs 8714 &  then  python3 qa/media.py [out-dir]
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else "media/screenshots"
URL = "http://localhost:8714/"
os.makedirs(OUT, exist_ok=True)
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev"]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    host = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3).new_page()
    errs = []; host.on("pageerror", lambda e: errs.append(str(e)))
    host.goto(URL + "#host"); host.wait_for_timeout(1500)
    host.evaluate("()=>{try{if(state){setPin(state.hostPin||'1');newGame()}}catch(e){}}"); host.wait_for_timeout(800)
    host.reload(); host.wait_for_timeout(1500)
    H = lambda js: host.evaluate(js)
    hs = lambda n: host.screenshot(path=f"{OUT}/phone-{n}.png")
    host.evaluate("(a)=>{setupDraft=Object.assign(SETUP0(),{names:a,pin:'1234',host:'Sam'});renderHost()}", "\n".join(NAMES)); host.wait_for_timeout(300)
    for i, step in enumerate(["welcome", "cloaks", "rounds", "shield", "review"]):
        H("()=>wGo('" + step + "')"); host.evaluate("()=>window.scrollTo(0,0)"); host.wait_for_timeout(250); hs(f"0{i}-setup-{step}")
    H("()=>startGame({names:" + str(NAMES) + ",cloaks:2,title:'',host:'Sam',potUnit:'£',potCap:2000,prize:'a bottle of champagne',hours:4,pin:'1234',rules:{kill:'murder'}})")
    H("()=>act(s=>{s.players.forEach((p,i)=>p.role=[2,6].includes(i)?'cloak':'candle');s.plan=['quiz','countdown','charades','hilo','truths','change','memory','draw','estimate'];s.planAt=0})")
    host.wait_for_timeout(800)
    tv = b.new_context(viewport={"width": 1920, "height": 1080}).new_page(); tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.goto(URL); tv.wait_for_timeout(2500); tv.add_style_tag(content="#soundbtn,#fsbtn,#net,#repbtn{display:none!important}")
    def shot(name, js=None, wait=5200):
        if js: H(js)
        tv.wait_for_timeout(wait); tv.screenshot(path=f"{OUT}/tv-{name}.jpg", type="jpeg", quality=90)
    shot("01-intro", "()=>act(s=>{s.phase='intro';s.startedAt=now()})", 17000)
    shot("02-rules", "()=>act(s=>{s.phase='lobby';s.tvRules=true})", 3500)
    H("()=>act(s=>{s.tvRules=false;s.phase='day';s.night=null})"); tv.wait_for_timeout(1500); host.wait_for_timeout(300); hs("05-day")
    shot("03-round-card", None, 300)
    H("()=>pickMission(nextPlanned(state))"); host.wait_for_timeout(400); hs("06-brief")
    shot("04-brief", None, 5500)
    shot("05-prize", "()=>act(s=>{s.mission.stage='prize'})", 3000)
    H("()=>{startMission()}"); tv.wait_for_timeout(1500)
    shot("06-quiz", "()=>{act(s=>{s.pot=450})}", 2500)
    H("()=>act(s=>{s.mission=null;s.phase='table';s.table=newTable()})"); tv.wait_for_timeout(5200)
    shot("07-table", None, 200)
    H("()=>{const P=state.players;act(s=>{s.table.stage='votes'});[[0,2],[1,2],[3,6],[4,2],[5,3],[7,2],[8,6],[9,2],[2,3],[6,3]].forEach(([a,c])=>castBallot(P[a].id,P[c].id));act(s=>{s.table.showDots=true})}")
    shot("08-votes", None, 3500)
    H("()=>{toExile();exile(state.players[2].id);if(typeof askGo==='function'&&ask)askGo()}"); tv.wait_for_timeout(5200)
    shot("09-exiled", "()=>revealRole()", 6500)
    H("()=>{startNight();act(s=>{s.night.mode='murder'});beginNight()}"); tv.wait_for_timeout(5500)
    H("()=>act(s=>{s.night.victimId=s.players[4].id;s.night.step=nightScript(s.night,s).findIndex(l=>norm(l).pick)})"); tv.wait_for_timeout(2500)
    shot("10-night", None, 200)
    H("()=>{act(s=>{s.night.step=nightScript(s.night,s).length-1});finishNight()}"); tv.wait_for_timeout(5500)
    shot("11-dawn", None, 200)
    shot("12-murdered", "()=>act(s=>{s.morning.revealed=true})", 4500)
    H("()=>act(s=>{s.phase='final';s.round=5;s.finalRound=5;s.winner='candles';s.finalStep=0;s.players.forEach((p,i)=>{p.revealed=true;p.alive=[0,1,8].includes(i)});s.prizeTo='Annie, Ryan and Hannah';s.prizeIds=[s.players[0].id,s.players[1].id,s.players[8].id];s.potEach=600;s.pot=1800;s.awards=awardsOf(s)})")
    shot("13-final", None, 14000)
    shot("14-awards", "()=>act(s=>{s.finalStep=1;s.awardShown=(s.awards||[]).length})", 5000)
    b.close()
print("media in", OUT, "errors:", errs)
