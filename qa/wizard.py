# The setup wizard on a phone: every page in turn (no page errors, nothing wider than the screen, one Next each), the
# checks that stop Next, the recommendations following earlier choices, the quick path, Change from the summary, and the
# game it starts. Screenshots of every page go to qa/shots/wizard/. Own static server on :8724 (local storage mode).
# python3 qa/wizard.py
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8724
OUT = os.path.join(ROOT, "qa/shots/wizard"); os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "worker/public")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""))
    if not cond: fails.append(name)
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev", "Claire-Louise", "Bartholomew"]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        h = b.new_context(viewport={"width": 390, "height": 844}).new_page(); h.on("pageerror", lambda e: errs.append(str(e)))
        h.goto(f"http://localhost:{PORT}/play.html#host"); h.wait_for_timeout(1200)
        E = h.evaluate
        reset = "()=>{try{localStorage.clear();sessionStorage.clear()}catch(e){};state=null;hist=[];setupDraft=null;setupMsg='';renderHost()}"
        E(reset); h.wait_for_timeout(100)
        step = lambda: E("()=>setupDraft.step")
        nxt = lambda: (h.click(".foot button.primary"), h.wait_for_timeout(40))
        wide = lambda: E("()=>document.documentElement.scrollWidth>innerWidth+1")
        # the checks that stop Next
        h.click("text=Let’s start"); h.wait_for_timeout(80)
        check("welcome → names", step() == "names")
        h.fill("#names", "\n".join(NAMES[:5])); nxt(); h.wait_for_timeout(80)
        check("five names: Next stays put and says why", step() == "names" and "at least 8" in E("()=>setupMsg"))
        h.fill("#names", "\n".join(NAMES[:8] + ["annie"])); nxt(); h.wait_for_timeout(80)
        check("a repeated name: stays put", step() == "names" and "same name" in E("()=>setupMsg"))
        h.fill("#names", "\n".join(NAMES)); nxt(); h.wait_for_timeout(80)
        check("twelve names → host", step() == "host")
        nxt(); nxt(); h.wait_for_timeout(80)
        check("no PIN: stays on the PIN page", step() == "pin" and "PIN" in E("()=>setupMsg"))
        h.fill("#pinset", "1234"); nxt(); h.wait_for_timeout(80)
        check("PIN → Cloaks, 3 recommended for 12", step() == "cloaks" and E("()=>setupDraft.cloaks") == "3" and h.locator(".wopt.sel em").count() == 1)
        # every page, on the long path, with a screenshot each
        h.click("text=Back"); h.wait_for_timeout(60); check("Back goes back and keeps the PIN", step() == "pin" and h.input_value("#pinset") == "1234"); nxt()
        nxt(); h.wait_for_timeout(60)  # hours
        big = "()=>{const keep=setupDraft.names;setupDraft.names=Array.from({length:24},(_,i)=>'P'+i).join('\\n');const out=[];for(const hr of ['2.5','4','7']){wSet('hours',hr);out.push(setupDraft.rounds)}setupDraft.names=keep;setupDraft.touched=setupDraft.touched.filter(k=>k!=='hours');settle(setupDraft);renderHost();return out}"
        r25, r4, r5 = E(big)
        check("24 players: the recommended rounds follow the evening's length", r25 <= r4 <= r5 and r25 < r5, [r25, r4, r5])
        check("12 players, 2½ hours: the mingle is recommended off to save time", E("()=>{wSet('hours','2.5');const m=setupDraft.mingle;wSet('hours','4');return m===false&&setupDraft.mingle===true}"))
        nxt(); h.wait_for_timeout(60); check("hours → the choice of path", step() == "fast")
        h.click("text=Take me through each choice"); h.wait_for_timeout(60)
        seen = []
        for i in range(40):
            s = step(); seen.append(s)
            h.screenshot(path=os.path.join(OUT, f"{i:02d}-{s}.png"), full_page=True)
            check(f"page {s}: nothing wider than the phone", not wide())
            if s == "review": break
            h.click(".foot button.primary"); h.wait_for_timeout(60)
        check("the long path visits every page", seen == ["rounds", "perRound", "dinner", "mingle", "kill", "ghosts", "pool", "shield", "blade", "champion", "dilemma", "witness", "convert", "bargain", "quests", "pot", "wrong", "prize", "title", "review"], seen)
        # choices shape later pages
        E("()=>wGo('shield',true)"); E("()=>wSet('shield','off')"); nxt(); h.wait_for_timeout(60)
        check("Change from the summary, then Done, comes back to the summary", step() == "review")
        steps = E("()=>wizSteps(setupDraft).map(w=>w.id)")
        check("no shields: the Champion and Dilemma pages go, and both are off", "champion" not in steps and "dilemma" not in steps and not E("()=>setupDraft.champion||setupDraft.dilemma"))
        E("()=>wSet('shield','mix')"); check("shields back: the Champion and Dilemma come back on (never touched)", E("()=>setupDraft.champion&&setupDraft.dilemma"))
        E("()=>{wSet('mingle',false)}"); check("no mingle: side-quests now recommended off", E("()=>setupDraft.quests===false"))
        E("()=>{wSet('ghosts',false);wGo('pool')}"); check("no Ghosts: the Statue can't be switched on", h.locator(".mpool button[disabled]").count() == 1)
        E("()=>{wSet('ghosts',true);wSet('mingle',true)}")
        E("()=>wGo('review')"); h.wait_for_timeout(60); h.screenshot(path=os.path.join(OUT, "review.png"), full_page=True)
        nxt(); h.wait_for_timeout(400)
        st = E("()=>state&&{n:state.players.length,t:state.players.filter(p=>p.role==='cloak').length,rules:state.rules,pin:state.hostPin}")
        check("Start game: twelve players, three Cloaks, the plan as chosen", bool(st) and st["n"] == 12 and st["t"] == 3 and st["pin"] == "1234" and st["rules"]["rounds"] == 5 and st["rules"]["shield"] == "mix" and st["rules"]["champion"], [st, errs, E("()=>[setupMsg,setupDraft&&setupDraft.step]")])
        # the quick path
        E(reset); h.wait_for_timeout(80)
        E(f"()=>{{setupDraft=Object.assign(SETUP0(),{{names:{NAMES!r}.join('\\n'),pin:'9',step:'fast'}});renderHost()}}"); h.wait_for_timeout(60)
        h.click("text=Use the recommended settings"); h.wait_for_timeout(60)
        check("the quick path lands on the summary", step() == "review")
        E("()=>{setupDraft.pin='';renderHost()}"); nxt(); h.wait_for_timeout(100)
        check("Start with a missing PIN goes to the PIN page", step() == "pin" and not E("()=>!!state"))
        h.fill("#pinset", "9"); nxt(); nxt(); h.wait_for_timeout(300)
        check("…and then starts", E("()=>!!state&&state.players.length===12"))
        for n in (8, 16, 24):
            E(reset); h.wait_for_timeout(60)
            names = [f"P{i}" for i in range(n)]
            E(f"()=>{{setupDraft=Object.assign(SETUP0(),{{names:{names!r}.join('\\n'),pin:'1',step:'rounds'}});renderHost()}}"); h.wait_for_timeout(60)
            check(f"{n} players: the rounds page fits the phone", not wide())
            h.screenshot(path=os.path.join(OUT, f"rounds-{n}.png"), full_page=True)
        check("no page errors", not errs, errs)
        b.close()
finally:
    srv.terminate()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
