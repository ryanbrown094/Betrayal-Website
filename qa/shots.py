# Screenshots of the main TV screens and the host setup, for eyeballing the look (brand, palette, layout).
# node qa/server.mjs 8714 &  then  python3 qa/shots.py [out-dir] [base-url]
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else "qa/shots"
URL = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8714/"
os.makedirs(OUT, exist_ok=True)
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    host = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
    errs = []; host.on("pageerror", lambda e: errs.append(str(e)))
    host.goto(URL + "#host"); host.wait_for_timeout(1500)
    host.evaluate("()=>{try{newGame()}catch(e){}}"); host.wait_for_timeout(800)
    host.screenshot(path=f"{OUT}/host-setup.png", full_page=True)
    host.fill("#names", "\n".join(NAMES)); host.evaluate("()=>{setupDraft.open=['who','eve','mis','night','roles','pot'];renderHost()}"); host.wait_for_timeout(300)
    host.screenshot(path=f"{OUT}/host-setup-open.png", full_page=True)
    host.evaluate("(n)=>startGame({names:n,cloaks:2,title:'',host:'Sam',potUnit:'£',potCap:2000,prize:'a bottle of fizz',hours:4,pin:'1'})", NAMES)
    host.wait_for_timeout(1200)
    tv = b.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    tv.goto(URL); tv.wait_for_timeout(2500)
    def shot(name, js=None, wait=5200):
        if js: host.evaluate(js)
        tv.wait_for_timeout(wait); tv.screenshot(path=f"{OUT}/tv-{name}.png")
    shot("lobby", None, 3500)
    host.screenshot(path=f"{OUT}/host-lobby.png")
    shot("intro", "()=>act(s=>{s.phase='intro';s.startedAt=now()})", 9000)
    shot("rules", "()=>act(s=>{s.phase='lobby';s.tvRules=true})", 3000)
    shot("day", "()=>act(s=>{s.tvRules=false;s.phase='day';s.night=null})", 6000)
    host.screenshot(path=f"{OUT}/host-day.png", full_page=True)
    shot("brief", "()=>pickMission('quiz')")
    host.screenshot(path=f"{OUT}/host-brief.png", full_page=True)
    shot("prize", "()=>act(s=>{s.mission.stage='prize'})", 3000)
    shot("table", "()=>openTable()")
    shot("night", "()=>startNight()")
    shot("final", "()=>act(s=>{s.phase='final';s.winner='candles';s.finalStep=0;s.prizeTo='Annie and Ryan';s.prizeIds=[s.players[0].id,s.players[1].id];s.potEach=500;s.pot=1000})", 6000)
    b.close()
print("shots in", OUT, "errors:", errs)
