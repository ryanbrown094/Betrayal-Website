# The evening's shape and the new moments, in the page (local storage mode, own static server on :8726):
# dinner in three courses, prizes that follow the Purse, the Ghosts' call at each Reckoning, the awards kept to six,
# the TV narrator (speech stubbed), the Casting Vote as a tie-break, the Temptation's PURSE or SELF, and the booking-code
# wording. python3 qa/flow.py
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8726
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "worker/public")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""))
    if not cond: fails.append(name)
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev"]
TV = "()=>{const v=tvView(publicView(state));const d=document.createElement('div');d.innerHTML=v.html;return d.textContent}"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        h = b.new_context(viewport={"width": 390, "height": 844}).new_page(); h.on("pageerror", lambda e: errs.append(str(e)))
        h.goto(f"http://localhost:{PORT}/play.html#host"); h.wait_for_timeout(1000)
        E = h.evaluate
        start = lambda rules, extra="": E("(a)=>{try{localStorage.clear()}catch(e){};startGame(Object.assign({names:a[0],cloaks:2,title:'',host:'Sam',potUnit:'pts',potCap:2000,prize:'a bottle of wine',hours:4,pin:'1111',rules:a[1]},a[2]||{}));act(s=>{s.players.forEach((p,i)=>p.role=i<2?'cloak':'candle')})}", [NAMES, rules, extra or None])

        # dinner in three courses: 10 players, 4 rounds → the starter after round 1, the main after 2, dessert after 3
        start({"rounds": 4, "courses": True})
        check("courses: the rules keep them, and no single dinner", E("()=>state.rules.courses===true&&state.rules.dinnerAfter===0"))
        seen = []
        for r in (1, 2, 3):
            E(f"()=>act(s=>{{s.round={r};s.phase='morning';s.morning={{kind:'quiet',revealed:true}};s.mingle=null}})")
            foot = h.inner_text("#host .foot")
            seen.append(foot.replace("\n", " | "))
            E("()=>startBreak('dinner','round')")
            m = E("()=>({c:state.mingle.course,d:state.mingle.dur})"); tv = E(TV)
            check(f"after round {r}: the {m['c']} is offered and served, and the TV says so", m["c"] == ["starter", "main", "dessert"][r - 1] and m["d"] == [900000, 1500000, 900000][r - 1] and ["The Starter", "The Main Course", "Dessert"][r - 1] in tv, [foot, m, tv[:80]])
        check("…each offered by name on the phone", "The Starter now · 15 min" in seen[0] and "The Main Course now · 25 min" in seen[1] and "Dessert now · 15 min" in seen[2], seen)
        E("()=>act(s=>{s.round=3;s.phase='morning';s.morning={kind:'quiet',revealed:true};s.mingle=null})")
        check("…and never twice", "now ·" not in h.inner_text("#host .foot"))

        # prizes that follow the Purse
        start({"rounds": 4}, {"prizes": [{"at": 0.5, "what": "champagne"}, {"at": 1, "what": "a night out"}]})
        pv = E("()=>{act(s=>{s.pot=1100});const v=publicView(state);return {prizes:'prizes' in v,prize:'prize' in v,tiers:v.tiers}}")
        check("tiers: before the end the TV knows only that there are tiers, never the prizes", not pv["prizes"] and not pv["prize"] and pv["tiers"] == [0.5, 1], pv)
        check("tiers: the TV's morning says a fuller Purse wins a better prize", "fuller the Purse, the better the prize" in E("()=>{act(s=>{s.phase='day';s.roundMissions=0});const v=tvView(publicView(state));return v.html}"))
        got = E("()=>{const out=[];for(const pot of [500,1100,2000]){act(s=>{s.pot=pot});out.push(prizeOf(state))}return out}")
        check("tiers: 500 → the prize, 1100 → the better one, 2000 → the best", got == ["a bottle of wine", "champagne", "a night out"], got)
        E("()=>act(s=>{s.pot=1100;s.phase='final';s.winner='candles';s.finalStep=0;s.players.forEach(p=>p.revealed=true)})")
        tv = E(TV)
        check("tiers: the final names the tier and the prize", "a half-full Purse: the better prize" in tv and "champagne" in tv, tv[:300])
        start({"rounds": 4})
        E("()=>act(s=>{s.pot=1100;s.phase='final';s.winner='candles';s.finalStep=0;s.players.forEach(p=>p.revealed=true)})")
        tv = E(TV); check("no tiers: the final just says the prize", "the prize" in tv and "Purse: the" not in tv and "didn’t reach" not in tv, tv[:200])

        # the Ghosts' call
        start({"rounds": 4})
        E("()=>{act(s=>{s.players[9].alive=false;s.phase='day'});openTable()}")
        check("Ghosts at the table: the talk line asks them to chalk too", "Ghosts: you chalk too" in h.inner_text("#host"))
        E("()=>{act(s=>{s.table.stage='votes'});const A=aliveOf(state);for(const p of A)castBallot(p.id,p.id===A[3].id?A[4].id:A[3].id);toExile();exile(aliveOf(state)[3].id);askGo();revealRole()}")
        body = h.inner_text("#host")
        check("after the reveal: the Keeper can tap the Ghosts who called it", "the Ghosts’ call" in body.lower() or "ghosts’ call" in body.lower(), body[:300])
        E("()=>ghostCall(state.players[9].id)")
        tv = E(TV)
        check("…and the TV names them", "called it from beyond" in tv and "Dev" in tv, tv[-160:])
        E("()=>ghostCall(state.players[9].id)"); check("…a second tap takes it back", "called it from beyond" not in E(TV))
        E("()=>ghostCall(state.players[9].id)")
        check("the Ghosts' calls count towards The Ghost Who Saw", E("()=>ghostScores(state).find(x=>x.p.id===state.players[9].id).calls") == 1)

        # the awards: six at most, and the rest at once
        n = E("()=>{act(s=>{s.phase='final';s.winner='candles';s.players.forEach(p=>p.revealed=true)});act(s=>{s.awards=awardsOf(s);s.finalStep=1;s.awardShown=1});return state.awards.length}")
        check("the awards: six at most", 0 < n <= 6, n)
        if n > 2:
            check("…with 'Show the rest' once they've started", "Show the rest" in h.inner_text("#host .foot"))
            E("()=>{const b=[...document.querySelectorAll('#host .foot button')].find(x=>/Show the rest/.test(x.textContent));b.click()}")
            check("…which shows them all", E("()=>state.awardShown===state.awards.length"))

        # the TV narrator
        start({"rounds": 4, "narrator": True})
        E("()=>act(s=>{s.phase='day'})")
        check("narrator on: every line to read has a ▶ TV button", h.locator("#host .say .tvread").count() >= 1)
        E("()=>{window.__said=[];Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'Daniel',lang:'en-GB'}],cancel(){},speak(u){__said.push(u.text)}}});window.SpeechSynthesisUtterance=function(t){this.text=t};narrTV(state)}")
        before = E("()=>hist.length")
        h.click("#host .say .tvread"); h.wait_for_timeout(200)
        said = E("()=>{narrTV(state);narrTV(state);return __said}")
        line = E("()=>document.querySelector('#host .say').textContent.replace('▶ TV','')")
        check("▶ TV: the TV speaks that line, once", len(said) == 1 and said[0] in line, [said, line[:80]])
        check("…and it isn't a step Undo would take back", E("()=>hist.length") == before)
        E("()=>{undo();narrTV(state)}"); check("…nor does Undo make the TV say anything again", E("()=>__said.length") == 1)
        E("()=>toggleNarr()"); check("the Menu switches the narrator off", h.locator("#host .say .tvread").count() == 0 and not E("()=>rulesIn(state).narrator"))

        # the Temptation and the Casting Vote wording
        start({"rounds": 4})
        E("()=>{act(s=>{s.phase='day';s.mission=null;s.players.forEach(p=>p.shield=null)});pickMission('dilemma')}")
        rules = E("()=>state.mission.rules")
        check("the Temptation: PURSE or SELF", "PURSE or SELF" in rules and "SANCTUARY" not in rules, rules)
        check("the setup explains the Casting Vote as a tie-break", "breaks a tie" in E("()=>{setupDraft=Object.assign(SETUP0(),{names:'"+"\\n".join(NAMES)+"'});return WIZ.find(w=>w.id==='blade').body(settle(setupDraft))}"))
        check("no page errors", not errs, errs)
        b.close()
finally:
    srv.terminate()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
