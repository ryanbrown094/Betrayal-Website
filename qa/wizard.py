# The setup wizard on a phone: the five questions and their checks, the recommendations (a Classic first game, a Short
# game, dinner in courses, the twists on a second night), a friend keeping and the handover, every Customise page in turn
# (no page errors, nothing wider than the screen), Change from the summary, and the game it starts. Screenshots of every page go to qa/shots/wizard/. Own static server on :8724 (local storage mode).
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
        # the five questions: the checks that stop Next
        h.click("text=Let’s start"); h.wait_for_timeout(80)
        check("welcome → names", step() == "names")
        h.fill("#names", "\n".join(NAMES[:5])); nxt(); h.wait_for_timeout(80)
        check("five names: Next stays put and says why", step() == "names" and "at least 8" in E("()=>setupMsg"))
        h.fill("#names", "\n".join(NAMES[:8] + ["annie"])); nxt(); h.wait_for_timeout(80)
        check("a repeated name: stays put", step() == "names" and "same name" in E("()=>setupMsg"))
        h.fill("#names", "\n".join(NAMES)); nxt(); h.wait_for_timeout(80)
        check("twelve names → how long", step() == "hours" and "Short game" in h.inner_text("#host"))
        big = "()=>{const keep=setupDraft.names;setupDraft.names=Array.from({length:24},(_,i)=>'P'+i).join('\\n');wDinner(1);const out=[];for(const hr of ['2.5','4','7']){wSet('hours',hr);out.push(setupDraft.rounds)}setupDraft.names=keep;setupDraft.touched=setupDraft.touched.filter(k=>!['hours','courses','dinnerAfter'].includes(k));settle(setupDraft);renderHost();return out}"
        r25, r4, r5 = E(big)
        check("24 players, one dinner break: the recommended rounds follow the evening's length", r25 <= r4 <= r5 and r25 < r5, [r25, r4, r5])
        check("12 players, 2½ hours: the Interval is recommended off to save time", E("()=>{wSet('hours','2.5');const m=setupDraft.mingle;wSet('hours','4');return m===false&&setupDraft.mingle===true}"))
        short = E("()=>{wSet('hours','2');const d=setupDraft,o={per:d.perRound,m:d.mingle,din:d.dinnerAfter,c:d.courses};wSet('hours','4');return o}")
        check("the Short game: one Trial a round, no Interval, no dinner", short == {"per": 1, "m": False, "din": 0, "c": False}, short)
        check("4 hours for 12: no dinner break is assumed (it's the host's choice)", E("()=>setupDraft.courses===false&&setupDraft.dinnerAfter===0&&setupDraft.rounds>=4"))
        check("a first game is Classic: every twist off, Sanctuary won openly", E("()=>{const d=setupDraft;return d.shield==='public'&&![d.blade,d.champion,d.dilemma,d.witness,d.convert,d.bargain,d.quests].some(Boolean)}"))
        nxt(); h.wait_for_timeout(60); check("how long → how they kill", step() == "kill")
        nxt(); h.wait_for_timeout(60); check("→ the prize", step() == "prize")
        h.fill("#prize", "a bottle of wine"); h.fill("#prize3", "a night out"); nxt(); h.wait_for_timeout(60)
        check("→ who keeps: you, by default", step() == "keeper" and E("()=>setupDraft.keeper") == "me")
        h.click("text=A friend will keep"); h.wait_for_timeout(60); nxt(); h.wait_for_timeout(60)
        check("what was typed on one page never lands in a box on the next (the prize isn't the Keeper's name)", E("()=>setupDraft.host") == "")
        check("a friend keeps, with no names: stays put", step() == "keeper" and "Keeper’s name" in E("()=>setupMsg"))
        h.fill("#hostn", "Sam"); h.fill("#mename", "Rory"); nxt(); h.wait_for_timeout(60)
        check("the host isn't in the players: says so", step() == "keeper" and "isn’t in the players" in E("()=>setupMsg"))
        h.fill("#mename", "annie"); nxt(); h.wait_for_timeout(60)
        check("…in the players (any case): on to the PIN", step() == "pin")
        nxt(); h.wait_for_timeout(60); check("no PIN: stays on the PIN page", step() == "pin" and "PIN" in E("()=>setupMsg"))
        h.fill("#pinset", "12a4"); nxt(); h.wait_for_timeout(60); check("letters in the PIN: refused (the unlock pad is numbers only)", step() == "pin" and "4 to 8 digits" in E("()=>setupMsg"))
        h.fill("#pinset", "1234"); nxt(); h.wait_for_timeout(80)
        body = h.inner_text("#host")
        check("→ the summary, eight pages in: ready to hand over", step() == "review" and "8 of 8" in body.lower() and "Hand over to Sam" in body and "First game?" in body, body[:300])
        h.click("text=Back"); h.wait_for_timeout(60); check("Back goes back and keeps the PIN", step() == "pin" and h.input_value("#pinset") == "1234"); nxt(); h.wait_for_timeout(60)
        # every other choice, page by page, with a screenshot each
        h.click("text=Go through every choice"); h.wait_for_timeout(60)
        seen = []
        for i in range(40):
            s = step(); seen.append(s)
            h.screenshot(path=os.path.join(OUT, f"{i:02d}-{s}.png"), full_page=True)
            check(f"page {s}: nothing wider than the phone", not wide())
            if s == "review": break
            h.click(".foot button.primary"); h.wait_for_timeout(60)
        check("Customise visits every other page, then the summary", seen == ["cloaks", "rounds", "perRound", "dinner", "mingle", "narrator", "ghosts", "pool", "shield", "blade", "champion", "dilemma", "witness", "convert", "bargain", "quests", "pot", "wrong", "title", "review"], seen)
        # choices shape later pages
        E("()=>wGo('shield',true)"); E("()=>wSet('shield','off')"); nxt(); h.wait_for_timeout(60)
        check("Change from the summary, then Done, comes back to the summary", step() == "review")
        steps = E("()=>wizSteps(setupDraft).map(w=>w.id)")
        check("no Sanctuaries: the Crown and Temptation pages go, and both are off", "champion" not in steps and "dilemma" not in steps and not E("()=>setupDraft.champion||setupDraft.dilemma"))
        E("()=>wSet('shield','mix')")
        check("a second night (a game played to the end on this phone): the twists are recommended", E("()=>{localStorage.setItem('candle-played','1');settle(setupDraft);const d=setupDraft;return d.blade&&d.champion&&d.dilemma&&d.witness&&d.convert&&d.bargain&&d.quests}"))
        E("()=>{wSet('mingle',false)}"); check("no Interval: Errands now recommended off", E("()=>setupDraft.quests===false"))
        E("()=>{wSet('ghosts',false);wGo('pool')}"); check("no Ghosts: the Statue can't be switched on", h.locator(".mpool button[disabled]").count() == 1)
        E("()=>{wSet('ghosts',true);wSet('mingle',true)}")
        E("()=>wGo('dinner')"); h.wait_for_timeout(60)
        check("the dinner page: no dinner break, recommended and selected, with three courses on offer", "Three courses" in h.inner_text("#host") and h.locator(".wopt.sel", has_text="No dinner break").count() == 1 and "(we’d pick this)" in h.locator(".wopt.sel").inner_text().lower()
, [h.locator(".wopt.sel").all_inner_texts()])
        E("()=>wDinner('c')"); h.wait_for_timeout(60)
        check("…and three courses can be chosen", h.locator(".wopt.sel", has_text="Three courses").count() == 1)
        E("()=>wGo('review')"); h.wait_for_timeout(60); h.screenshot(path=os.path.join(OUT, "review.png"), full_page=True)
        h.click("text=Hand over to Sam"); h.wait_for_timeout(80)
        check("hand over: a page for the Keeper, with the PIN to change", step() == "handover" and "Over to you, Sam" in h.inner_text("#host") and h.input_value("#pinset") == "1234")
        h.screenshot(path=os.path.join(OUT, "handover.png"), full_page=True)
        h.fill("#pinset", "8642"); nxt(); h.wait_for_timeout(400)
        st = E("()=>state&&{n:state.players.length,t:state.players.filter(p=>p.role==='cloak').length,rules:state.rules,pin:state.hostPin,host:state.brand.host,prizes:state.prizes,prize:state.prize}")
        check("Start game: twelve players, three Forsworn, the plan as chosen, the Keeper's PIN", bool(st) and st["n"] == 12 and st["t"] == 3 and st["pin"] == "8642" and st["host"] == "Sam" and st["rules"]["rounds"] == 5 and st["rules"]["shield"] == "mix" and st["rules"]["courses"] and st["prize"] == "a bottle of wine" and st["prizes"] == [{"at": 1, "what": "a night out"}], [st, errs, E("()=>[setupMsg,setupDraft&&setupDraft.step]")])
        # an old draft on the quick-path page lands on the summary
        E(reset); h.wait_for_timeout(80)
        E(f"()=>{{setupDraft=Object.assign(SETUP0(),{{names:{NAMES!r}.join('\\n'),pin:'9999',step:'fast'}});renderHost()}}"); h.wait_for_timeout(60)
        check("an old quick-path draft lands on the summary", step() == "review")
        E("()=>{setupDraft.pin='';renderHost()}"); nxt(); h.wait_for_timeout(100)
        check("Start with a missing PIN goes to the PIN page", step() == "pin" and not E("()=>!!state"))
        h.fill("#pinset", "9999"); nxt(); h.wait_for_timeout(100); nxt(); h.wait_for_timeout(300)
        check("…and then starts", E("()=>!!state&&state.players.length===12"))
        for n in (8, 16, 24):
            E(reset); h.wait_for_timeout(60)
            names = [f"P{i}" for i in range(n)]
            E(f"()=>{{setupDraft=Object.assign(SETUP0(),{{names:{names!r}.join('\\n'),pin:'1111',step:'rounds'}});renderHost()}}"); h.wait_for_timeout(60)
            check(f"{n} players: the rounds page fits the phone", not wide())
            h.screenshot(path=os.path.join(OUT, f"rounds-{n}.png"), full_page=True)
        check("no page errors", not errs, errs)
        b.close()
finally:
    srv.terminate()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
