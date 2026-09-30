# Shields set up front (public/secret, 25% cap), mission settings, the linear host, ghost lore, dinner, the final vote, the ceremony guard, setup errors, random draws, the skip button, the question bank. Own clean server on :8716.
# Usage: python3 qa/review.py
import subprocess, time, sys, json, re
from playwright.sync_api import sync_playwright
ROOT = "."
srv = subprocess.Popen(["node", "qa/server.mjs", "8716"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = "http://localhost:8716/"
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]
ok = True
def check(name, cond, extra=None):
    global ok
    print(("PASS " if cond else "FAIL ") + name + ("" if cond or extra is None else "  -> " + json.dumps(extra)[:300]))
    ok = ok and bool(cond)

with sync_playwright() as p:
    b = p.chromium.launch()
    host = b.new_page(viewport={"width": 390, "height": 844}); errs = []
    host.on("pageerror", lambda e: errs.append(str(e)))
    dialogs = []; host.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    host.goto(URL + "#host"); host.wait_for_timeout(1500)
    tv = b.new_page(viewport={"width": 1280, "height": 720}); tv.on("pageerror", lambda e: errs.append("tv: " + str(e)))
    tv.goto(URL); tv.wait_for_timeout(1500); tv.evaluate("()=>{window.__noCards=true}")
    sync = lambda: (host.wait_for_timeout(700), tv.wait_for_timeout(1400))

    # setup validation: no browser dialog, inline message instead
    host.fill("#names", "Annie\nRyan\nTom"); host.fill("#pinset", "4321"); host.click("text=Start game"); host.wait_for_timeout(300)
    check("too few players: inline message, no browser dialog", not dialogs and "Need at least 4 players" in host.inner_text("#host"))
    host.fill("#names", "Annie\nRyan\nTom\nannie"); host.click("text=Start game"); host.wait_for_timeout(300)
    check("duplicate names caught inline", not dialogs and "share a name" in host.inner_text("#host"))
    check("target length defaults to 4 hours", host.input_value("#hours") == "4")
    host.fill("#names", "\n".join(NAMES)); host.fill("#cloaks", "2"); host.click("text=Start game"); host.wait_for_timeout(800)
    check("valid setup starts the game", host.evaluate("()=>state && state.phase==='lobby' && state.hours===4"))

    # shields: the winner's shield is set before the mission (public or secret); the silent option is gone
    host.evaluate("()=>{act(s=>{s.phase='day';s.startedAt=now()});pickMission('snap');startMission();startMission();act(s=>{s.mission.scores={};finishPlay(s)});endMission()}"); sync()
    check("no shield: the TV card says the mission is over", "The mission is over" in tv.inner_text("#stage"), tv.inner_text("#stage"))
    host.evaluate("()=>{act(s=>{s.phase='day'});pickMission('oneleg');renderHost()}")
    rules_host = host.inner_text("#host")
    check("before a mission the host picks the prize — winner (public) or none; no hidden rounds in a mission without rounds", all(t in rules_host for t in ["Winner · public", "No shield", "Confirm — prize on TV"]) and "Hidden · 1 round" not in rules_host and "Tap ceremony" not in rules_host, rules_host[:500])
    sync(); tv_brief = tv.inner_text("#stage")
    check("while the host decides, the TV shows only the brief, labelled round and mission", "shield" not in tv_brief.lower() and re.search(r"round \d+ · mission \d+", tv_brief.lower()), tv_brief)
    host.evaluate("()=>{mWin('public');startMission()}"); sync(); tvp = tv.inner_text("#stage")
    check("confirming puts the prize on the TV before the mission starts", host.evaluate("()=>state.mission.stage==='prize'") and "named for all to see" in tvp and "the prize" in tvp.lower(), tvp)
    host.evaluate("()=>{startMission();act(s=>{s.mission.scores={[s.players[3].id]:3,[s.players[5].id]:1};finishPlay(s)});renderHost()}")
    done_host = host.inner_text("#host")
    check("the done screen has no shield-mode buttons left to choose", "Tap ceremony" not in done_host and "Show shield on TV" in done_host, done_host[-500:])
    host.evaluate("()=>endMission()"); sync()
    check("public winner's shield: named on the TV and on the candle rail", "Sophie" in tv.inner_text("#stage") and "holds the shield" in tv.inner_text("#stage") and tv.evaluate("()=>state.players[3].shield==='public'"))
    check("the public view carries no secret shield names", tv.evaluate("()=>!('secIds' in state.shieldCard) && !('secNames' in state.shieldCard) && !('witnessName' in state.shieldCard)"))
    check("setShieldMode and the silent mode are gone from the code", host.evaluate("()=>typeof setShieldMode==='undefined' && !/silent/.test(JSON.stringify(state.shieldCard))"))

    # night: the Forsworn pick the shielded player; dawn says the shield held
    host.evaluate("()=>{openTable();}"); host.evaluate("()=>{exile(state.players.find(p=>p.role==='candle'&&p.id!==state.players[3].id).id);askGo();revealRole();act(s=>{s.table.step=2;s.ghostIntroDone=true});startNight();beginNight();act(s=>{s.night.victimId=s.players[3].id});finishNight();act(s=>{s.morning.revealed=true})}"); sync()
    check("shielded morning uses the shield line", host.evaluate("()=>state.morning.kind==='shield' && !('silent' in state.morning)") and "it met a shield" in host.inner_text("#host"))
    check("TV at dawn: the shield held", "The shield held" in tv.inner_text("#stage"))

    # dinner from dawn leads into the next round, then is gone
    check("dawn offers dinner", "Dinner now" in host.inner_text("#host"))
    host.click("text=Dinner now"); sync()
    check("dinner phase on phone and TV", host.evaluate("()=>state.phase==='mingle' && state.mingle.kind==='dinner' && state.mingle.then==='round' && state.dinnerDone") and "Dinner" in tv.inner_text("#stage"))
    check("dinner script uses the real duration", "Dinner. Twenty-five minutes." in host.inner_text("#host"))
    host.click("text=+5 min"); host.wait_for_timeout(300)
    check("dinner adjusts in 5-minute steps", host.evaluate("()=>state.mingle.dur===1800000") and "Dinner. Thirty minutes." in host.inner_text("#host"))
    r0 = host.evaluate("()=>state.round")
    host.click("text=Dinner’s done"); sync()
    check("after dinner the next round starts", host.evaluate("()=>state.phase==='day'") and host.evaluate("()=>state.round") == r0 + 1)
    host.evaluate("()=>{pickMission('snap');startMission();startMission();act(s=>finishPlay(s));endMission()}"); host.wait_for_timeout(300)
    check("no second dinner offered once served", "Dinner · 25 min" not in host.inner_text("#host"))

    # final round with no Forsworn left: the table still votes
    host.evaluate("()=>{act(s=>{s.players.forEach(p=>{if(p.role==='cloak'){p.alive=false}});s.finalRound=s.round;s.phase='day'});openTable();exile(aliveOf(state)[0].id);askGo();revealRole()}"); host.wait_for_timeout(400)
    foot = host.inner_text("#host .foot")
    check("final round, no Cloaks left: End-game vote is offered first", "End-game vote" in foot and "Skip the vote" in foot, foot)
    host.click("#host .foot >> text=End-game vote"); host.wait_for_timeout(300)
    check("the vote opens", host.evaluate("()=>state.phase==='endvote'"))

    # the ceremony cannot be restarted from inside it
    host.evaluate("()=>{startCeremony();revealSurvivor(aliveOf(state)[0].id)}"); host.wait_for_timeout(300)
    n1 = host.evaluate("()=>state.final2.shown.length")
    host.evaluate("()=>{startCeremony();finishGame()}"); host.wait_for_timeout(300)
    check("startCeremony/finishGame mid-ceremony keep the turned seals", host.evaluate("()=>state.phase==='final2' && state.final2.shown.length") == n1 == 1)
    host.evaluate("()=>{menuOpen=true;renderHost()}")
    check("menu hides End game now during the ceremony", "End game now" not in host.inner_text("#host .sheet"))
    host.evaluate("()=>{menuOpen=false;renderHost()}")

    # draws are fully random: no memory between games, no repeats within one, quiz levels mixed
    RANDOM = r"""() => {
      const cfg = {names:['Annie','Ryan','Tom','Sophie','Marcus','Priya'],cloaks:1,title:'T',host:'H',potUnit:'pts',potPer:100,prize:'p',hours:4,pin:'4321'};
      const firsts = new Set(), orders = new Set(); let repeats = 0, tiered = 0, games = 12;
      for (let g = 0; g < games; g++) {
        newGame(); startGame(cfg); act(s => { s.phase = 'day' });
        pickMission('quiz'); startMission();startMission(); const a = state.mission.qs.map(x => x.id);
        act(s => { s.phase = 'day'; s.mission = null }); pickMission('quiz'); startMission();startMission(); const b = state.mission.qs.map(x => x.id);
        if (new Set([...a, ...b]).size !== 60) repeats++;
        const lv = a.map(id => id[0]).join(''); if (lv === 'E'.repeat(10) + 'M'.repeat(10) + 'H'.repeat(10)) tiered++;
        firsts.add(a.slice().sort().join()); orders.add(a.slice(0, 10).join());
      }
      return { repeats, tiered, distinctGames: firsts.size, orders: orders.size, games, seenKey: localStorage.getItem('cloaks-seen') };
    }"""
    v = host.evaluate(RANDOM)
    check("two quizzes in one game never repeat a question", v["repeats"] == 0, v)
    check("the quiz runs 10 easy, then 10 medium, then 10 hard — shuffled inside each part", v["tiered"] == v["games"] and v["orders"] == v["games"], v)
    check("each new game draws its own random set (no cross-game memory)", v["distinctGames"] == v["games"] and v["seenKey"] is None, v)

    # Hum It / charades: skip a word the actor doesn't know
    sk = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null});pickMission('hum');startMission();startMission();const a=aliveOf(state)[2].id;
      act(s=>{const m=s.mission;m.actorId=a;m.showA=true});renderHost();const w0=itemOf(state.mission),btn=[...document.querySelectorAll('#host button')].find(b=>/Skip —/.test(b.textContent));
      if(!btn)return {btn:false};btn.click();const m=state.mission;return {btn:true,label:btn.textContent,changed:itemOf(m)!==w0,actor:m.actorId===a,shown:m.showA===true,scores:Object.keys(m.scores).length}}""")
    check("Hum It has a skip button that deals the same actor a new song, unscored", sk.get("btn") and sk["changed"] and sk["actor"] and sk["shown"] and sk["scores"] == 0 and "doesn’t know it" in sk["label"], sk)
    sync()
    check("the TV shows the new song to the actor straight away", host.evaluate("()=>itemOf(state.mission)") in tv.inner_text("#stage"))

    # the question bank: master switches, saved on the server, outliving every game
    settings = lambda: host.evaluate("async()=>(await (await fetch('/api/settings',{cache:'no-store'})).json()).settings")
    host.evaluate("()=>{menuOpen=true;renderHost()}")
    host.click("#host .sheet >> text=Question bank"); host.wait_for_timeout(300)
    sheet = host.inner_text("#host .sheet.bank")
    check("menu opens the question bank with every bank listed", all(t in sheet for t in ["Quiz · easy", "Closest Guess", "Hum It", "Side-quests", "150 of 150 on"]), sheet[:300])
    first_q = host.evaluate("()=>QUIZ_E[0][0]")
    host.click("#host .bankrow >> nth=0"); host.wait_for_timeout(900)
    check("tapping an item switches it off and saves it on the server", (settings() or {}).get("off", {}).get("QUIZ_E") == [0] and "149 of 150 on" in host.inner_text("#host .sheet.bank"))
    host.fill("#bankq", first_q[:18]); host.wait_for_timeout(200)
    check("search narrows the list", host.evaluate("()=>document.querySelectorAll('#host .bankrow').length") >= 1 and host.evaluate("()=>document.querySelectorAll('#host .bankrow').length") < 10)
    host.fill("#bankq", ""); host.wait_for_timeout(200)
    host.evaluate("()=>{for(let i=10;i<150;i++)bankToggle('QUIZ_E',i)}"); host.wait_for_timeout(900)
    check("a bank can't go below its minimum", host.evaluate("()=>QUIZ_E.length-bankOff.QUIZ_E.length") == 10 and "Keep at least 10" in host.inner_text("#host"))
    on_e = host.evaluate("()=>{const off=bankOff.QUIZ_E;return [...Array(QUIZ_E.length).keys()].filter(i=>!off.includes(i)).map(i=>'E'+i)}")
    host.evaluate("()=>{for(let i=12;i<ESTIMATE.length;i++)bankToggle('ESTIMATE',i)}"); host.wait_for_timeout(900)
    draw = host.evaluate("""()=>{bankOpen=false;act(s=>{s.phase='day';s.mission=null;s.players.forEach(p=>p.shield=null)});pickMission('quiz');startMission();startMission();const q=state.mission.qs.filter(x=>x.id[0]==='E').map(x=>x.id);
      act(s=>{s.phase='day';s.mission=null});pickMission('estimate');startMission();startMission();const e=state.mission.order.slice();
      act(s=>{s.phase='day';s.mission=null;s.players.forEach(p=>p.shield=null)});pickMission('countdown');mWin('secret',2);const room=state.mission.room;startMission();startMission();const my=state.mission.mystery.slice();
      return {q,e,my,room,total:state.mission&&state.mission.total}}""")
    check("the quiz only draws switched-on questions", len(draw["q"]) == 10 and set(draw["q"]) <= set(on_e), draw["q"])
    check("Closest Guess only draws switched-on items", set(draw["e"]) <= set(range(12)) and len(draw["e"]) == 12, draw["e"])
    check("hidden shields sit in different rounds, never the first, no more than tonight's room allows", len(draw["my"]) == min(2, draw["room"]) and len(set(draw["my"])) == len(draw["my"]) and all(2 <= x <= draw["total"] for x in draw["my"]), draw)
    host.evaluate("()=>newGame()"); host.wait_for_timeout(900)
    s_after = settings() or {}
    check("wiping the game keeps the bank switches", len(s_after.get("off", {}).get("QUIZ_E", [])) == 140 and len(s_after["off"].get("ESTIMATE", [])) == 68, {k: len(v) for k, v in s_after.get("off", {}).items()})
    host.reload(); host.wait_for_timeout(1800)
    check("a fresh page load reads the switches back", host.evaluate("()=>(bankOff.QUIZ_E||[]).length") == 140 and "switched off" in host.inner_text("#host"))
    host.click("text=Question bank —"); host.wait_for_timeout(300)
    check("the bank opens from the setup screen too", "Question bank" in host.inner_text("#host .sheet.bank"))
    host.click("#host .sheet.bank >> text=Switch all on"); host.wait_for_timeout(900)
    check("switch all on clears a bank", "QUIZ_E" not in (settings() or {}).get("off", {}))
    host.evaluate("()=>{bankOpen=false;renderHost()}")
    host.evaluate("(n)=>startGame({names:n,cloaks:1,title:'T',host:'H',potUnit:'pts',potPer:100,prize:'p',hours:4,pin:'4321'})", NAMES[:5]); host.wait_for_timeout(900)
    codes = host.evaluate("""async()=>{const put=pin=>fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-Pin':pin},body:JSON.stringify({settings:{off:{LIKELY:[1]}}})}).then(r=>r.status);return [await put('0000'),await put('4321')]}""")
    check("during a game only the host PIN can change the bank", codes == [403, 200], codes)
    check("TV never needs the switches (public state carries none)", tv.evaluate("()=>!('bankOff' in (state||{}))"))

    # ---- final-review regressions ----
    fresh = lambda n=8, extra="": host.evaluate("(n)=>{newGame();startGame({names:n,cloaks:2,title:'T',host:'H',potUnit:'pts',potPer:100,prize:'p',hours:4,pin:'4321'});act(s=>{s.phase='day'" + extra + "})}", NAMES[:n])
    host.evaluate("()=>{newGame()}"); host.wait_for_timeout(500)
    su = host.evaluate("""()=>{const t=[defaults(4).t,defaults(5).t,defaults(11).t,maxCloaks(5)];
      document.querySelector('#names').value='A\\nB\\nC\\nD\\nE';document.querySelector('#cloaks').value='3';document.querySelector('#pinset').value='1';submitSetup();const m1=setupMsg,t1=toastMsg;
      document.querySelector('#cloaks').value='';document.querySelector('#names').value='Annie\\nBartholomew Fotheringay\\nC\\nD';submitSetup();const m2=setupMsg;
      document.querySelector('#names').value='Annie\\nRyan\\nTom\\nSophie';document.querySelector('#potPer').value='0';submitSetup();return {t,m1,t1,m2,started:!!state,tr:state&&state.players.filter(p=>p.role==='cloak').length,pot:state&&state.potPer}}""")
    check("never as many Cloaks as Candle: 4→1, 5→1, 11→3 suggested; 5 with 3 refused", su["t"] == [1, 1, 3, 2] and "At most 2" in su["m1"] and su["t1"] == su["m1"], su)
    check("names over 16 characters are refused with a visible message", "too long" in su["m2"], su)
    check("a 4-player game starts with 1 Cloak, and a pot of 0 per mission is allowed", su["started"] and su["tr"] == 1 and su["pot"] == 0, su)
    fresh()
    sd = host.evaluate("""()=>{pickMission('quiz');mWin('secret',1);startMission();startMission();const A=aliveOf(state);act(s=>{const m=s.mission;m.secIds=[A[0].id];m.scores={[A[2].id]:14,[A[3].id]:14};finishPlay(s)});
      renderHost();const h=document.querySelector('#host').innerText;return {sdBtn:/sudden death/i.test(h),joint:/Nothing rides on the win/.test(h),sec:state.mission.secIds}}""")
    check("a tie at the top with no prize on the win: no tie-break, hidden shields untouched", not sd["sdBtn"] and sd["joint"] and len(sd["sec"]) == 1, sd)
    sd2 = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null});pickMission('snap');mWin('public');startMission();startMission();const A=aliveOf(state);act(s=>{s.mission.scores={[A[2].id]:4,[A[3].id]:4};finishPlay(s)});
      renderHost();return /sudden death/i.test(document.querySelector('#host').innerText)}""")
    check("…but with a public shield on the win, the tie-break is offered", sd2)
    fin = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null;s.finalRound=s.round});const room=shieldRoom(state);renderHost();
      const dil=[...document.querySelectorAll('#host .mlist button')].find(b=>/Dilemma/.test(b.textContent));
      pickMission('snap');renderHost();const witness=/Witness/.test(document.querySelector('#host').innerText),pub=/Winner · public/.test(document.querySelector('#host').innerText);
      act(s=>{s.phase='day';s.mission=null});pickMission('countdown');mWin('secret',2);startMission();startMission();return {room,dil:dil&&dil.disabled,witness,pub,my:state.mission.mystery,secMax:state.mission.secMax}}""")
    check("final round: no shields, no Witness, no Dilemma, no hidden rounds", fin["room"] == 0 and fin["dil"] is True and not fin["witness"] and not fin["pub"] and fin["my"] == [] and fin["secMax"] == 0, fin)
    fresh()
    pv = host.evaluate("""()=>{const P=()=>publicView(JSON.parse(JSON.stringify(state))).night;startNight();
      const q=state.night.questOpts.find(o=>o.target)||state.night.questOpts[0];questPick(q.i);act(s=>{s.night.mode='convert'});const pre=P();
      beginNight();const qs=state.night.questStep;act(s=>{s.night.step=qs});const at=P();act(s=>{s.night.step=qs+1});const post=P();
      act(s=>{s.night.targetId=s.players.find(p=>p.role==='candle').id;s.night.targetName='X';s.night.answer='no';s.night.step=s.night.endStep});const end=P();
      return {preQuest:pre.quest,preTarget:pre.questTarget,preMode:pre.mode,atQuest:at.quest===state.night.quest,postQuest:post.quest,endTarget:end.targetId,endName:end.targetName,endAnswer:end.answer}}""")
    check("before the night starts the public view hides the quest, its Cloak and the kind of night", pv["preQuest"] == "…" and pv["preTarget"] is None and pv["preMode"] == "murder", pv)
    check("the quest shows only on its own line", pv["atQuest"] and pv["postQuest"] == "…", pv)
    check("on the last line (blindfolds off) the target's name is gone again", pv["endTarget"] is None and pv["endName"] is None and pv["endAnswer"] == "no", pv)
    fresh(10)
    lv = host.evaluate("""()=>{startNight();beginNight();const v=state.players.find(p=>p.role==='candle');act(s=>{s.night.victimId=v.id;s.night.step=6});
      const other=aliveOf(state).find(p=>p.role==='candle'&&p.id!==v.id);playerLeft(other.id);return {step:state.night.step,victim:state.night.victimId===v.id}}""")
    check("a guest who isn't part of tonight leaving doesn't restart the night", lv["step"] == 6 and lv["victim"], lv)
    fresh(10)
    se = host.evaluate("""()=>{const f=state.players.find(p=>p.role==='candle');act(s=>{s.witness={id:f.id,used:false}});startNight();beginNight();
      const both=nightScript(state.night,state).findIndex(l=>norm(l).who==='Both');act(s=>{s.night.step=both+1});const tid=state.night.witnessCloakId;playerLeft(tid);return {used:state.witness.used,met:state.witness.metId===tid}}""")
    check("if the Witness's Cloak leaves after the meeting, the Witness is spent", se["used"] and se["met"], se)
    xs = host.evaluate("""()=>{newGame();startGame({names:['A1','B2','C3','D4'],cloaks:1,title:'T',host:'H',potUnit:'<img src=x onerror=window.__x=1>',potPer:100,prize:'p',hours:4,pin:'4321'});
      const seal=ART.seal({name:'Z',color:'red;x" onload="window.__y=1'});return {money:moneyOf(state,5),seal:/onload/.test(seal)}}""")
    sync()
    check("a pot unit can't inject markup; a seal colour can't inject attributes", "<" not in xs["money"] and not xs["seal"] and tv.evaluate("()=>window.__x===undefined") and host.evaluate("()=>window.__x===undefined"), xs)
    host.evaluate("()=>{newGame()}"); host.wait_for_timeout(600)

    # connection edge cases, with the network faked
    ctx2 = b.new_context(viewport={"width": 1280, "height": 720}); t2 = ctx2.new_page(); fails = {"n": 0}
    def first503(route):
        if fails["n"] < 2: fails["n"] += 1; route.fulfill(status=503, body="busy")
        else: route.continue_()
    t2.route("**/api/state", first503); t2.goto(URL); t2.wait_for_timeout(6500)
    check("a TV whose first request gets a server error keeps trying and connects", t2.evaluate("()=>remote===true && !connecting"), t2.evaluate("()=>({remote,connecting})"))
    t2.unroute("**/api/state"); t2.route("**/api/state", lambda r: r.fulfill(status=503, body="down")); t2.wait_for_timeout(6500)
    check("server errors show the TV's reconnecting badge", t2.evaluate("()=>document.querySelector('#net').className==='on'"))
    ctx2.close()
    fresh()
    lost = {"n": 0}
    def drop_first_reply(route):
        if route.request.method == "PUT" and lost["n"] == 0:
            lost["n"] = 1; route.fetch(); route.abort()
        else: route.continue_()
    host.route("**/api/state", drop_first_reply)
    host.evaluate("()=>{act(s=>{s.pot=100})}"); host.wait_for_timeout(150); host.evaluate("()=>{act(s=>{s.pot=250})}"); host.wait_for_timeout(4000)
    srv_pot = host.evaluate("async()=>(await (await fetch('/api/state',{headers:{'X-Pin':'4321'}})).json()).state.pot")
    check("a save whose reply is lost isn't treated as another phone; the next tap still lands", srv_pot == 250 and host.evaluate("()=>state.pot") == 250 and "Another phone" not in (host.evaluate("()=>toastMsg||''")), {"server": srv_pot})
    host.unroute("**/api/state")
    blocked = {"on": True}
    host.route("**/api/state", lambda r: r.abort() if (r.request.method == "DELETE" and blocked["on"]) else r.continue_())
    host.evaluate("()=>{newGame()}"); host.wait_for_timeout(2500)
    still = host.evaluate("async()=>!!(await (await fetch('/api/state')).json()).state")
    blocked["on"] = False; host.wait_for_timeout(7000)
    gone = host.evaluate("async()=>(await (await fetch('/api/state')).json()).state===null")
    check("a wipe made while offline is retried until the server has it", still and gone, {"stillBefore": still, "goneAfter": gone})
    host.unroute("**/api/state")

    # the TV at 4K: ceremony words fit their cards, names aren't cut, reading widths apply
    k4 = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=2); t4 = k4.new_page(); t4.on("pageerror", lambda e: errs.append("tv4k: " + str(e)))
    t4.goto(URL); t4.wait_for_timeout(1500); t4.evaluate("()=>{window.__noCards=true}")
    LONG = ["Bartholomew", "Claire-Louise", "Wilhelmina", "Maximilian Fox", "Anastasia May", "Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah"]
    host.evaluate("(n)=>{newGame();startGame({names:n,cloaks:3,title:'T',host:'H',potUnit:'pts',potPer:100,prize:'p',hours:4,pin:'4321'});startCeremony();aliveOf(state).forEach(p=>revealSurvivor(p.id))}", LONG); host.wait_for_timeout(700); t4.wait_for_timeout(1600)
    geo = t4.evaluate("""()=>{const cards=[...document.querySelectorAll('#stage .vcard')],bad=[];cards.forEach(c=>{const r=c.getBoundingClientRect();c.querySelectorAll('.vword,.vn').forEach(e=>{const q=e.getBoundingClientRect();if(q.left<r.left-1||q.right>r.right+1||e.scrollWidth>e.clientWidth+1)bad.push(e.textContent)})});
      const sg=document.querySelector('#stage').getBoundingClientRect(),out=cards.some(c=>{const r=c.getBoundingClientRect();return r.bottom>sg.bottom+2||r.top<sg.top-2});return {n:cards.length,bad,out}}""")
    check("4K ceremony, 14 survivors: every word and name fits its card, nothing leaves the stage", geo["n"] == 14 and not geo["bad"] and not geo["out"], geo)
    host.evaluate("()=>{finishGame();act(s=>{s.phase='final';s.winner='candles';s.prizeTo='x';s.players.forEach(p=>p.revealed=true)})}"); t4.wait_for_timeout(1800)
    rolls = t4.evaluate("()=>[...document.querySelectorAll('#stage .rolls b')].filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent)")
    check("the final roll-call never cuts a name", not rolls, rolls)
    host.evaluate("()=>{newGame();startGame({names:['Annie','Ryan','Tom','Sophie'],cloaks:1,title:'T',host:'H',potUnit:'pts',potPer:100,prize:'p',hours:4,pin:'4321'});act(s=>{s.phase='day'});pickMission('snap')}"); t4.wait_for_timeout(1600)
    mw = t4.evaluate("()=>{const r=document.querySelector('#stage .rules');return r?getComputedStyle(r).maxWidth:null}")
    check("rules text keeps its reading width on a wide screen", mw not in (None, "100%", "none"), mw)
    k4.close()
    host.evaluate("()=>{newGame()}"); host.wait_for_timeout(500)

    # ---- settings before a mission, the 25% shield cap, tiered quiz, countdown clock, the linear host, ghost lore ----
    fresh = lambda n=8, extra="": host.evaluate("(n)=>{newGame();startGame({names:n,cloaks:2,title:'T',host:'H',potUnit:'pts',potPer:100,prize:'p',hours:4,pin:'4321'});act(s=>{s.phase='day'" + extra + "})}", (NAMES + ["Hannah", "Dev", "Ben", "Zoe", "Kit", "Max"])[:n])
    fresh(14)
    cap = host.evaluate("""()=>{const c=[shieldCap(state)];act(s=>{s.players.slice(0,7).forEach(p=>p.alive=false)});c.push(shieldCap(state));act(s=>{s.players.forEach(p=>p.alive=true)});
      act(s=>{s.players[0].shield='public';s.players[1].shield='secret'});c.push(shieldRoom(state));act(s=>{s.players[2].shield='secret'});c.push(shieldRoom(state));act(s=>{s.players.forEach(p=>p.shield=null)});return c}""")
    check("shield cap is a quarter of the living table (at least one): 14→3, 7→1; room shrinks as shields are held", cap == [3, 1, 1, 0], cap)
    q = host.evaluate("""()=>{pickMission('quiz');mSet('per',-5);mWin('secret',2);renderHost();const h=document.querySelector('#host').innerText,m=state.mission,r=m.rules,pz=prizeOf_(m).tv.join(' ');startMission();startMission();
      const ids=state.mission.qs.map(x=>x.id[0]).join('');return {h,rules:r,pz,total:state.mission.total,ids,my:state.mission.mystery,secMax:state.mission.secMax,win:state.mission.win}}""")
    check("quiz settings: questions per part set the length, but the TV's brief never shows the count", q["total"] == 15 and q["ids"] == "E" * 5 + "M" * 5 + "H" * 5 and "Three parts: easy, then medium, then brutal" in q["rules"] and not any(w in q["rules"].lower() for w in ["fifteen", "thirty", "15", "30"]), q)
    check("hidden shields: the brief says nothing, the prize card says two are hidden, never which rounds", "shield" not in q["rules"].lower() and "Two shields are hidden" in q["pz"] and len(q["my"]) == 2 and q["secMax"] == 2, q)
    check("host rules screen asks for the settings and the prize up front", "Questions in each part" in q["h"] and "Winner · public" in q["h"] and "Hidden · 2 rounds" in q["h"], q["h"][:500])
    tvq = (sync(), tv.inner_text("#stage"))[1]
    check("TV shows the quiz part, level and question number", "Part one · Easy" in tvq and "Question 1 of 5" in tvq, tvq[:200])
    host.evaluate("()=>act(s=>{s.mission.qi=7;s.mission.qn=8})"); sync()
    check("…and moves to part two, medium", "Part two · Medium" in tv.inner_text("#stage") and "Question 3 of 5" in tv.inner_text("#stage"))
    both = host.evaluate("""()=>{const A=aliveOf(state),f=A.filter(p=>p.role==='candle'),t=A.find(p=>p.role==='cloak'),m=state.mission,[r1,r2]=m.mystery;
      act(s=>{s.mission.qi=r1-1;s.mission.qn=r1;s.mission.shouter=f[1].id});quizJudge(true);act(s=>{s.mission.qi=r2-1;s.mission.qn=r2;s.mission.shouter=t.id;s.mission.showA=false});quizJudge(true);
      act(s=>{s.mission.scores[f[0].id]=9});act(s=>finishPlay(s));renderHost();const h=document.querySelector('#host').innerText;endMission();const c=state.shieldCard;
      return {h,mode:c.mode,sec:c.secCount,secNames:c.secNames,wasted:c.wasted,f1:state.players.find(p=>p.id===f[1].id).shield,t:state.players.find(p=>p.id===t.id).shield,tname:t.name,f1name:f[1].name}}""")
    check("a mystery round's winner takes a secret shield in the ceremony", both["mode"] == "secret" and both["sec"] == 1 and both["secNames"] == [both["f1name"]] and both["f1"] == "secret", both)
    check("a Cloak who wins a mystery round gets no shield and no ceremony tap — the host is told", both["t"] is None and both["wasted"] == [both["tname"]] and "is a Cloak" in both["h"], both)
    host.evaluate("()=>act(s=>{s.shieldCard.step=3})"); sync()
    tvs = tv.inner_text("#stage")
    check("TV card: 'the shield has been claimed', never the name", "has been claimed" in tvs and both["f1name"] not in tvs, tvs)
    room = host.evaluate("""()=>{act(s=>{s.phase='day';s.players.forEach(p=>p.shield=null)});act(s=>{s.players.filter(p=>p.alive).slice(0,shieldCap(s)-1).forEach(p=>p.shield='public')});pickMission('quiz');renderHost();const a={room:state.mission.room,h1:document.querySelector('#host').innerText};mWin('secret',2);a.secN=state.mission.secN;
      act(s=>{s.phase='day';s.mission=null});act(s=>{s.players.find(p=>p.alive&&!p.shield).shield='secret'});pickMission('estimate');a.room2=state.mission.room;a.win2=state.mission.win;renderHost();a.h=document.querySelector('#host').innerText;return a}""")
    check("with one shield left only one hidden round is offered", room["room"] == 1 and "Hidden · 2 rounds" not in room["h1"] and "Hidden · 1 round" in room["h1"] and room["secN"] == 1, room)
    check("at the cap a mission offers no shield at all", room["room2"] == 0 and room["win2"] == "none" and "No shield from this mission" in room["h"], room)
    fresh(8)
    cd = host.evaluate("""()=>{pickMission('countdown');mSet('timer',3);const r=state.mission.rules;renderHost();const h=document.querySelector('#host').innerText;startMission();startMission();const m=state.mission,t1=m.timerEnd-now();
      awardWord(null);const t2=state.mission.timerEnd-now();return {r,h,t1,t2,dur:state.mission.timerDur,say:SAY.countdown(10)}}""")
    check("countdown: plain rounds of letters — no code words any more", "code word" not in (cd["r"] + cd["h"] + cd["say"]).lower(), cd)
    check("countdown: the clock starts with the letters, every round, at the chosen length", 40000 < cd["t1"] <= 45000 and 40000 < cd["t2"] <= 45000 and cd["dur"] == 45000, cd)
    pref = host.evaluate("()=>{act(s=>{s.phase='day';s.mission=null});pickMission('likely');mSet('total',-5);act(s=>{s.phase='day';s.mission=null});pickMission('likely');return {total:state.mission.total,rules:state.mission.rules}}")
    check("mission settings are remembered for the next time", pref["total"] == 5 and "five" not in pref["rules"].lower(), pref)
    fresh(8)
    lin = host.evaluate("""()=>{const txt=()=>document.querySelector('#host').innerText;openTable();renderHost();const talk=txt();act(s=>{s.table.stage='votes'});renderHost();const votes=txt();
      act(s=>{s.table.votes[s.players[1].id]=3;s.table.stage='exile'});renderHost();const ban=txt();
      const v=state.players.find(p=>p.role==='candle');exile(v.id);askGo();revealRole();renderHost();const rev=txt(),foot=document.querySelector('#host .foot').innerText;
      return {talk,votes,ban,rev,foot}}""")
    check("Reckoning, step by step: talk has no vote counter or exile list", "Table talk" in lin["talk"] and "votes counted" not in lin["talk"] and "Most votes" not in lin["talk"] and "Talk’s over" in lin["talk"], lin["talk"][:300])
    check("…the boards come next, then the exile with the leader picked out", "The boards" in lin["votes"] and "The exile" in lin["ban"] and "Most votes" in lin["ban"], lin["ban"][:300])
    check("first exile: the host is led into the ghost lore", "becomes the first Ghost" in lin["foot"], lin["foot"])
    host.evaluate("()=>{const b=[...document.querySelectorAll('#host .foot button')].find(x=>/first Ghost/.test(x.textContent));b.click()}"); sync()
    gl = host.inner_text("#host")
    check("ghost lore says Ghosts blindfold when the players do", "when the living put their blindfolds on, so do the Ghosts" in gl and host.evaluate("()=>state.ghostIntroDone===true"), gl[:400])
    check("TV shows the Ghosts' rules, blindfolds included", "The Ghosts" in tv.inner_text("#stage") and "so do the Ghosts" in tv.inner_text("#stage"), tv.inner_text("#stage")[:300])
    nt = host.evaluate("""()=>{startNight();beginNight();const txt=()=>document.querySelector('#host').innerText,sc=nightScript(state.night,state);renderHost();const l0=txt();
      const pk=sc.findIndex(l=>norm(l).pick);act(s=>{s.night.step=pk});renderHost();const lp=txt();act(s=>{s.night.victimId=s.players.find(p=>p.alive&&p.role==='candle').id;s.night.step=sc.length-1});renderHost();const le=txt();
      return {first:norm(sc[0]).tv,l0,lp,le}}""")
    check("night: blindfolds on for the Ghosts too", "Ghosts too" in nt["first"], nt["first"])
    check("night: the victim picker appears only on the pointing lines", "victim — tap as they point" not in nt["l0"].lower() and "victim — tap as they point" in nt["lp"].lower() and "victim — tap as they point" not in nt["le"].lower() and "Victim:" in nt["le"], {k: v[:200] for k, v in nt.items()})
    ch = host.evaluate("""()=>{finishNight();act(s=>{s.phase='day';s.morning=null});pickMission('hum');startMission();startMission();const txt=()=>document.querySelector('#host').innerText,out=[];renderHost();out.push(txt());
      act(s=>{s.mission.actorId=aliveOf(s)[1].id});renderHost();out.push(txt());act(s=>{s.mission.showA=true});renderHost();out.push(txt());
      act(s=>{const m=s.mission;m.timerDur=m.timer*1000;m.timerEnd=now()+m.timerDur});renderHost();out.push(txt());return out}""")
    check("Hum It, one step at a time: performer → show → clock → who guessed", "1 · Who’s the hummer?" in ch[0] and "guessed" not in ch[0].lower().split("scores")[0] and "2 · Show" in ch[1] and "3 ·" in ch[2] and "Blindfolds off — start 30 s" in ch[2] and "4 · Who guessed it?" in ch[3], [c[:160] for c in ch])
    font = host.evaluate("()=>getComputedStyle(document.querySelector('#host h2')).fontFamily+' | '+getComputedStyle(document.querySelector('#host')).fontFamily")
    check("host type is plain system sans, not the castle display face", "Grenze" not in font and "apple-system" in font, font)
    dl = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null;s.players.forEach(p=>p.shield=null)});pickMission('dilemma');startMission();startMission();const p=aliveOf(state)[2];act(s=>{s.mission.picks=[p.id]});resolveDilemma();act(s=>finishPlay(s));endMission();return {mode:state.shieldCard.mode,pub:state.shieldCard.pubNames,sh:state.players.find(x=>x.id===p.id).shield,name:p.name}}""")
    check("the Dilemma's lone SHIELD is public (the TV already named them)", dl["mode"] == "public" and dl["pub"] == [dl["name"]] and dl["sh"] == "public", dl)
    host.evaluate("()=>{newGame()}"); host.wait_for_timeout(500)

    # ---- every board recorded, the Champion, shields shown at the table, banter, drumroll, new missions, seats, undo ----
    fresh(8)
    wr = host.evaluate("""()=>{pickMission('estimate');renderHost();const h=document.querySelector('#host').innerText;mWin('public');mChampion();const pz=prizeOf_(state.mission).tv.join(' ');startMission();startMission();const A=aliveOf(state);
      act(s=>{s.mission.scores={[A[2].id]:5,[A[3].id]:1};finishPlay(s)});const win=state.mission.winId===A[2].id;endMission();renderHost();const hs=document.querySelector('#host').innerText;
      const w=state.champion;act(s=>{s.shieldCard.step=3});return {h,pz,hs,win,w:w&&w.id===A[2].id,champion:state.shieldCard.champion,name:A[2].name}}""")
    sync(); tvw = tv.inner_text("#stage")
    wr.update(host.evaluate("""()=>{const A=aliveOf(state);act(s=>{s.phase='day'});pickMission('snap');renderHost();const h2=document.querySelector('#host').innerText;act(s=>{s.phase='day';s.mission=null});
      return {shield:state.players.find(p=>p.id===A[2].id).shield,h2}}"""))
    check("the blade is offered before a mission; with the public shield the prize card names the Champion", "Also give the winner the blade?" in wr["h"] and "Champion — shield and blade" in wr["pz"], wr)
    check("the Champion takes the public shield and the blade, and is told they may lay both down", wr["win"] and wr["w"] and wr["champion"] and wr["shield"] == "public" and "lay both down" in wr["hs"], wr)
    check("one blade a round", "already holds tonight’s blade — one a round" in wr["h2"], wr["h2"][:400])
    check("TV card names tonight's Champion", wr["name"] in tvw and "Champion" in tvw, tvw[:300])
    bal = host.evaluate("""()=>{openTable();const A=aliveOf(state),w=state.champion.id;act(s=>{s.table.stage='votes'});const order=[];
      for(const p of A){const nv=nextVoter(state);order.push(nv.id);castBallot(nv.id, nv.id===A[0].id?A[1].id:A[0].id)}
      const v=state.table.votes;renderHost();const foot=document.querySelector('#host .foot').innerText;return {seatOrder:JSON.stringify(order)===JSON.stringify(A.map(p=>p.id)),v0:v[A[0].id],v1:v[A[1].id],n:A.length,wOn0:w!==A[0].id,foot,last:state.table.last===A[A.length-1].id}}""")
    check("boards are taken in seat order and the Champion's counts twice", bal["seatOrder"] and bal["v0"] == bal["n"] - 1 + (1 if bal["wOn0"] else 0) and bal["v1"] == 1 and bal["last"], bal)
    check("the exile opens once every board is in", "All boards in" in bal["foot"], bal["foot"])
    sync(); tvb = tv.inner_text("#stage")
    check("TV shows who voted for whom as each board comes in", "votes for" in tvb and "Champion" in tvb, tvb[:300])
    host.evaluate("()=>{const A=aliveOf(state);castBallot(A[3].id,'blank')}")
    check("a blank board is recorded and counts for nobody", host.evaluate("()=>state.table.ballots[aliveOf(state)[3].id]==='blank' && Object.values(state.table.votes).reduce((a,b)=>a+b,0)===aliveOf(state).length-1+(state.champion.id===aliveOf(state)[3].id?0:1)"))
    host.evaluate("()=>{clearBallots();act(s=>{s.table.stage='talk'})}")
    sh = host.evaluate("""()=>{const A=aliveOf(state),w=state.champion.id,other=A.find(p=>p.shield===null&&p.id!==w);act(s=>{s.players.find(p=>p.id===other.id).shield='secret'});renderHost();
      const t0=document.querySelector('#host').innerText,plainBtn=/show their shield/i.test(t0),remind=/lay down your shield and your blade/.test(t0),wBtn=[...document.querySelectorAll('#host button')].some(b=>/lays down shield and blade/.test(b.textContent));
      championImmunity();act(s=>{s.table.stage='votes'});castBallot(A.find(p=>p.id!==w).id,w);const refused=!state.table.ballots[A.find(p=>p.id!==w).id];
      act(s=>{s.table.stage='exile'});renderHost();const inList=[...document.querySelectorAll('#host .plist button')].some(b=>b.textContent.includes(state.players.find(p=>p.id===w).name));
      return {plainBtn,remind,wBtn,immune:state.table.immune.includes(w),shield:state.players.find(p=>p.id===w).shield,blade:championOf(state),refused,inList}}""")
    check("only the Champion may buy immunity — a plain shield can't be shown — and the host reminds them at the table", not sh["plainBtn"] and sh["remind"] and sh["wBtn"], sh)
    check("the Champion lays down shield and blade: immune from this vote, both gone", sh["immune"] and sh["shield"] is None and sh["blade"] is None and sh["refused"] and not sh["inList"], sh)
    sync()
    check("TV marks what the Champion laid down", "laid down shield and blade" in tv.inner_text("#stage"), tv.inner_text("#stage")[:300])
    bt = host.evaluate("""()=>{act(s=>{s.table.stage='votes';s.table.immune=[]});const A=aliveOf(state),f=A.find(p=>p.role==='candle'&&!p.shield);for(const p of A){castBallot(p.id,p.id===f.id?A.find(q=>q.id!==f.id).id:f.id)}
      act(s=>{s.table.stage='exile'});exile(f.id);askGo();renderHost();const t0=document.querySelector('#host').innerText;const hold=!!document.querySelector('#host .foot button.hold'),foot=document.querySelector('#host .foot').innerText;return {m:state.table.margin,t0,hold,foot}}""")
    check("a near-unanimous vote reads as clear; the host gets a line about the margin", bt["m"] in ("clear", "unanimous") and any(x in bt["t0"] for x in ["made up its mind", "No great mystery", "Unanimous", "Every board"]), bt)
    check("the exiled player says it themselves, so the reveal is one tap — no drumroll", not bt["hold"] and "They’ve said it" in bt["foot"], bt)
    host.evaluate("()=>{[...document.querySelectorAll('#host .foot button')].find(b=>/said it/.test(b.textContent)).click()}"); sync(); tv.wait_for_timeout(2600)
    check("the tap shows the role; a Candle gets the gold rays", host.evaluate("()=>state.table.step===1 && !state.table.roll") and tv.evaluate("()=>!!document.querySelector('#stage .rolecard .rays')"))
    lg = host.inner_text("#host")
    check("after the reveal, a line about what the table found", any(x in lg for x in ["Innocent, and gone", "didn't have to lift a finger", "in a row"]), lg[:500])
    host.evaluate("()=>{act(s=>{s.phase='reveal';s.table.step=0;s.table.exiled=s.players.find(p=>p.role==='cloak').id;s.players.find(p=>p.role==='cloak').alive=false;s.voteLog.push({round:s.round,ballots:{},exiled:s.table.exiled,role:'cloak'})})}")
    host.evaluate("()=>revealRole()"); sync(); tv.wait_for_timeout(3400)
    check("a Cloak reveal: the seal cracks and the red wash runs long", tv.evaluate("()=>!!document.querySelector('#stage .rolecard .crack') && /redlong/.test(document.querySelector('#flash').className)"), tv.evaluate("()=>({card:!!document.querySelector('#stage .rolecard'),crack:!!document.querySelector('#stage .crack'),flash:document.querySelector('#flash').className,txt:document.querySelector('#stage').innerText.slice(0,120)})"))
    check("vote history and the round snapshot never reach the TV", tv.evaluate("()=>!('voteLog' in state) && !('roundSnap' in state)"))
    # new missions
    fresh(8)
    tr = host.evaluate("""()=>{pickMission('truths');startMission();startMission();const A=aliveOf(state);truthsPick(A[1].id);truthsGo('think');const t1=state.mission.timerEnd>now();truthsGo('tell');truthsRight(A[2].id);truthsRight(A[3].id);truthsScore();
      const sc=state.mission.scores;return {t1,g2:sc[A[2].id],g3:sc[A[3].id],teller:sc[A[1].id],qn:state.mission.qn,last:state.mission.lastResult}}""")
    check("Two Truths: right guesses score one, the teller scores for everyone fooled", tr["t1"] and tr["g2"] == 1 and tr["g3"] == 1 and tr["teller"] == 5 and tr["qn"] == 2, tr)
    dr = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null});pickMission('draw');const r=state.mission.rules;startMission();startMission();const A=aliveOf(state);act(s=>{s.mission.actorId=A[0].id;s.mission.showA=true});const w=itemOf(state.mission);
      return {r,inBank:PICTIONARY.includes(w),w,timer:state.mission.timer}}""")
    check("Pictionary deals from its own bank on the charades flow", dr["inBank"] and dr["timer"] == 60 and "against the clock" in dr["r"], dr)
    sync()
    check("TV shows the artist the picture to draw", dr["w"] in tv.inner_text("#stage") and "draw" in tv.inner_text("#stage").lower())
    hl = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null});pickMission('hilo');mSet('total',-2);startMission();startMission();const m0=state.mission,A=aliveOf(state),refs=[];
      for(let i=0;i<300;i++){const a=ESTIMATE[i%ESTIMATE.length][1],r=hiloRef(a);refs.push(r!==a && r>=0 && (!(a>=1000&&a<=2100) || Math.abs(r-a)<=41))}
      act(s=>{s.mission.showA=true});A.slice(0,5).forEach(p=>hiloOut(p.id));hiloNext();const st1=state.mission.standing.length;
      act(s=>{s.mission.showA=true});state.mission.standing.slice(0,2).forEach(id=>hiloOut(id));hiloNext();
      const won=state.mission.won&&state.mission.won.name,roundAt=state.mission.qn;return {total:m0.total,st1,okRefs:refs.every(Boolean),won,roundAt,n:A.length}}""")
    sync(); tvh = tv.inner_text("#stage")
    check("Higher or Lower: the round's winner stays on the TV until the host moves on", hl["won"] and hl["won"] in tvh and "wins round" in tvh and hl["roundAt"] == 1, {"hl": hl, "tv": tvh[:200]})
    hl2 = host.evaluate("()=>{const w=state.mission.won.name;hiloRound();return {round:state.mission.qn,standing:state.mission.standing.length,n:aliveOf(state).length,winner:Object.entries(state.mission.scores).some(e=>e[1]===1)}}")
    check("Higher or Lower: the wrong sit, last one standing wins the round, then everyone stands again", hl["total"] == 2 and hl["st1"] == hl["n"] - 5 and hl2["winner"] and hl2["round"] == 2 and hl2["standing"] == hl2["n"] and hl["okRefs"], {"hl": hl, "hl2": hl2})
    host.evaluate("()=>act(s=>{s.mission.showA=true})"); sync()
    check("TV shows the call and the answer", "higher or lower than" in tv.inner_text("#stage").lower() and ("HIGHER" in tv.inner_text("#stage").upper()))
    ch = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null});pickMission('change');startMission();startMission();const out=[];
      for(let r=0;r<6;r++){changeStudy();changeBlind();const m=state.mission,diff=m.grid.map((x,i)=>x!==m.before[i]?i:-1).filter(i=>i>=0);out.push({diff,changed:m.changed.slice().sort((a,b)=>a-b),kind:m.changed.length});changeLook();changeAward(aliveOf(state)[0].id);changeNext()}
      return {out,stage:state.mission.stage,score:state.mission.scores[aliveOf(state)[0].id]}}""")
    okc = all(sorted(o["diff"]) == o["changed"] for o in ch["out"]) and [o["kind"] for o in ch["out"]] == [1, 1, 1, 2, 2, 2]
    check("What Changed? swaps one symbol in the first half, two trade places in the second, and the host sees exactly what moved", okc and ch["stage"] == "done" and ch["score"] == 6, ch)
    wc = host.evaluate("""()=>{act(s=>{s.phase='day';s.mission=null});pickMission('change');startMission();startMission();changeStudy();changeBlind();return {hold:state.mission.holdEnd-now()}}""")
    sync(); t_hold = tv.inner_text("#stage")
    check("What Changed? no blindfolds: a ten-second countdown on the TV instead", 9000 < wc["hold"] <= 10000 and "Something is changing" in t_hold and "Blindfolds" not in t_hold, t_hold[:200])
    tv.wait_for_timeout(10500)
    check("…then the changed grid appears by itself", tv.evaluate("()=>!!document.querySelector('#stage .chgrid')") and "first to shout" in tv.inner_text("#stage").lower(), tv.inner_text("#stage")[:200])
    wc2 = host.evaluate("()=>({brief:MISSIONS.find(m=>m.key==='change').rules,host:document.querySelector('#host').innerText})")
    check("…and nothing in What Changed? mentions blindfolds — not the brief, the TV or the host", "blindfold" not in (wc2["brief"] + wc2["host"] + tv.inner_text("#stage")).lower(), wc2["brief"])
    # seats, undo, rewind
    fresh(8)
    se = host.evaluate("""()=>{const a=state.players.map(p=>p.id);moveSeat(a[2],-1);const b=state.players.map(p=>p.id);openTable();act(s=>{s.table.stage='votes'});return {moved:b[1]===a[2]&&b[2]===a[1],first:nextVoter(state).id===b[0]}}""")
    check("seating order can be changed, and the boards follow it", se["moved"] and se["first"], se)
    ud = host.evaluate("""()=>{act(s=>{s.phase='day';s.table=null});const pot0=state.pot;for(let i=1;i<=10;i++)act(s=>{s.pot+=10});for(let i=0;i<10;i++)undo();return {pot0,pot:state.pot}}""")
    check("ten undos step back ten taps (deeper than the four that sync)", ud["pot"] == ud["pot0"], ud)
    rw = host.evaluate("""()=>{nextRound();const r=state.round,pot=state.pot;pickMission('snap');startMission();startMission();act(s=>{s.mission.scores={};finishPlay(s)});endMission();openTable();
      const can=(menuOpen=true,renderHost(),/Rewind to the start of round/.test(document.querySelector('#host .sheet').innerText));menuOpen=false;rewindRound();
      const back={phase:state.phase,round:state.round,pot:state.pot,mission:state.mission,log:/Rewound/.test(state.log[0])};undo();return {r,pot,can,back,after:state.phase}}""")
    check("rewind to the start of the round: back to that morning, log kept, and undo returns", rw["can"] and rw["back"]["phase"] == "day" and rw["back"]["round"] == rw["r"] and rw["back"]["pot"] == rw["pot"] and rw["back"]["mission"] is None and rw["back"]["log"] and rw["after"] == "table", rw)
    host.evaluate("()=>{newGame()}"); host.wait_for_timeout(500)

    # ---- rules without the Witness or the host's numbers, a mission after a break, tie revotes, the drumroll name ----
    fresh(8)
    rn = host.evaluate("""()=>{const out={};for(const d of MISSIONS){if(!MSET[d.key])continue;pickMission(d.key);const r0=state.mission.rules;for(const [f] of MSET[d.key]){mSet(f,1);mSet(f,1)}out[d.key]={same:state.mission.rules===r0,digits:/[0-9]/.test(r0.replace('1, 2 or 3',''))};act(s=>{s.phase='day';s.mission=null})}return out}""")
    check("ticking a mission's numbers up never changes the rules on the TV, and they show no numbers", all(v["same"] and not v["digits"] for v in rn.values()), rn)
    host.evaluate("()=>act(s=>{s.phase='lobby';s.tvRules=true})"); sync()
    check("the rules on the TV no longer mention the Witness", "Witness" not in tv.inner_text("#stage") and "Ghosts" in tv.inner_text("#stage"), tv.inner_text("#stage")[:200])
    mg = host.evaluate("()=>{act(s=>{s.tvRules=false;s.phase='day'});startBreak('mingle');renderHost();const f=document.querySelector('#host .foot').innerText;[...document.querySelectorAll('#host .foot button')].find(b=>/Another mission/.test(b.textContent)).click();return {f,phase:state.phase,mingle:state.mingle}}")
    check("after a mingle, another mission is offered next to the Reckoning", "Another mission" in mg["f"] and "Reckoning" in mg["f"] and mg["phase"] == "day" and mg["mingle"] is None, mg)
    dn = host.evaluate("()=>{startBreak('dinner');renderHost();return document.querySelector('#host .foot').innerText}")
    check("…and after dinner too", "Another mission" in dn, dn)
    rv = host.evaluate("""()=>{openTable();const A=aliveOf(state);act(s=>{s.table.stage='votes'});A.forEach((p,i)=>castBallot(p.id,i%2?A[0].id:A[1].id));
      act(s=>{s.table.stage='exile'});renderHost();const btn=[...document.querySelectorAll('#host button')].find(b=>/^Revote between/.test(b.textContent));if(!btn)return {btn:false};btn.click();
      const t=state.table;castBallot(A[2].id,A[3].id);const refused=!t.ballots||!state.table.ballots[A[2].id];renderHost();
      const grid=[...document.querySelectorAll('#host .plist button')].map(b=>b.querySelector('.nm')&&b.querySelector('.nm').textContent).filter(Boolean);
      return {btn:true,label:btn.textContent,revote:state.table.revote,stage:state.table.stage,refused,grid,a0:A[0].name,a1:A[1].name,ballots:Object.keys(state.table.ballots).length}}""")
    check("a tie offers a revote between the tied players only", rv.get("btn") and rv["stage"] == "votes" and len(rv["revote"]) == 2 and rv["refused"] and sorted(rv["grid"]) in (sorted([rv["a0"], rv["a1"]]), [rv["a0"]], [rv["a1"]]) and rv["ballots"] == 0, rv)
    sync()
    check("TV: 'A tie. Vote again.' with only the tied names", "Vote again" in tv.inner_text("#stage") and rv["a0"] in tv.inner_text("#stage"), tv.inner_text("#stage")[:200])
    host.evaluate("()=>{const A=aliveOf(state);act(s=>{s.table.stage='exile'});exile(A[0].id);askGo()}"); sync(); tv.wait_for_timeout(2400)
    lay = tv.evaluate("()=>[...document.querySelectorAll('#stage .typed span')].map(e=>getComputedStyle(e).opacity+'|'+e.getAnimations().length)")
    check("the exiled name's letters finish their animation (no per-letter layers left to box the glow)", lay and all(x.split("|")[1] == "0" and x.split("|")[0] == "1" for x in lay), lay)
    host.evaluate("()=>holdEnd(true)")

    # the floor mist: no hard vertical edges where its repeating tiles meet (a blob crossing a tile edge was cut off there)
    import io
    from PIL import Image
    mp = b.new_page(viewport={"width": 1920, "height": 1080}); mp.goto(URL); mp.wait_for_timeout(1500)
    mp.add_style_tag(content="#fx,#grain,#vig,#top,#stage,#rail,.win,.shaft,#sun,#birds,.stone,.stamp,#soundbtn{visibility:hidden!important} #set .wall{background:#000!important}")
    jumps = []
    for t in [0, 13, 41, 77, 101]:
        mp.evaluate("(t)=>document.querySelectorAll('#mist i').forEach(el=>el.getAnimations().forEach(a=>{a.pause();a.currentTime=t*1000}))", t); mp.wait_for_timeout(200)
        im = Image.open(io.BytesIO(mp.screenshot())).convert("L"); w, h = im.size; px = im.load()
        col = [sum(px[x, y] for y in range(h - 260, h)) / 260 for x in range(w)]
        jumps.append(round(max(abs(col[i + 1] - col[i]) for i in range(w - 1)), 2))
    mp.close()
    check("the floor mist has no hard vertical edges", max(jumps) < 0.8, jumps)

    # ---- the count, the final at five, the awards, the turned Forsworn, variation ----
    fresh(8)
    nd = host.evaluate("""()=>{openTable();act(s=>{s.table.stage='votes'});const A=aliveOf(state),a=A[6],b=A[7];
      castBallot(A[0].id,a.id);castBallot(A[1].id,b.id);castBallot(A[2].id,a.id);castBallot(A[3].id,b.id);renderHost();const h=document.querySelector('#host').innerText;
      return {nudge:tableNudge(state),h,box:!!document.querySelector('#host .say.nudge'),dots:state.table.showDots}}""")
    check("the tally stays off the TV by default; a dead-level count gives the host a line to say", nd["dots"] is False and nd["nudge"] and nd["box"] and not re.search(r"\d", nd["nudge"]), nd)
    f5 = host.evaluate("""()=>{act(s=>{s.phase='morning';s.morning={kind:'quiet',revealed:true};s.table=null;s.finalRound=null;s.players.slice(0,3).forEach(p=>p.alive=false)});nextRound();return {fin:isFinal(state),alive:aliveOf(state).length,log:state.log[0]}}""")
    check("five left at the start of a round: it is the final, automatically", f5["fin"] and f5["alive"] == 5 and "five or fewer" in f5["log"], f5)
    sm = host.evaluate("""()=>{act(s=>{s.phase='day'});pickMission('likely');const st=state.mission.stage;startMission();return {skip:st==='rules'&&state.mission.stage==='play'}}""")
    check("Most Likely To has no prize to set, so it starts straight from the brief", sm["skip"], sm)
    aw = host.evaluate("""()=>{newGame();startGame({names:['Annie','Ryan','Tom','Sophie','Marcus','Priya','Jess','Oliver'],cloaks:2,title:'T',host:'H',potUnit:'pts',potPer:100,prize:'p',hours:4,pin:'4321'});
      act(s=>{s.players.forEach((p,i)=>p.role=i<2?'cloak':'candle');s.phase='day'});const P=state.players;
      act(s=>{s.voteLog=[{round:1,ballots:{[P[2].id]:P[0].id,[P[3].id]:P[0].id,[P[4].id]:P[5].id,[P[5].id]:P[4].id},exiled:P[0].id,role:'cloak'},{round:2,ballots:{[P[2].id]:P[1].id,[P[4].id]:P[3].id,[P[5].id]:P[3].id},exiled:P[3].id,role:'candle'}];
        s.players[0].alive=false;s.players[3].alive=false;s.players[6].role='cloak';s.players[6].converted={round:1,mode:'convert'};s.players[7].refused=[{round:2,mode:'convert'}];s.stats={wins:{[P[4].id]:2},shields:{},murders:[{id:P[5].id,round:1}]};s.players[5].alive=false});
      startCeremony();aliveOf(state).forEach(p=>revealSurvivor(p.id));act(s=>{s.final2.order=aliveOf(s).filter(p=>p.role==='cloak').map(p=>p.id);s.final2.revealed=s.final2.order.length;s.final2.order.forEach(id=>s.final2.votes[id]='share')});finishGame();
      const a=state.awards;return {phase:state.phase,a:a.map(x=>x.title+':'+x.names.join('+')),n:P[6].name,refn:P[7].name}}""")
    sync(); tvf = tv.inner_text("#stage")
    check("the end roll marks a converted Cloak, and a Candle who refused", "converted, round 1" in tvf and "refused the Cloaks" in tvf, tvf[:600])
    check("end-of-game awards come from the record", any(x.startswith("The Sharpest Eye:") for x in aw["a"]) and any(x.startswith("Mission Machine:") for x in aw["a"]) and any(x.startswith("Couldn’t Be Bought:") for x in aw["a"]) and any(x.startswith("First Blood:") for x in aw["a"]), aw)
    host.evaluate("()=>act(s=>{s.finalStep=1})"); sync(); tva = tv.inner_text("#stage")
    check("the host calls the awards and the TV shows them", "The Awards" in tva and "Sharpest Eye" in tva and "awards" in host.inner_text("#host").lower(), tva[:300])
    vary = host.evaluate("()=>({t:[1,2,3].map(r=>SAY.table(r)),m:[1,2].map(r=>SAY.morningPoison('X',r)),n:[1,2].map(r=>{const s2=JSON.parse(JSON.stringify(state));s2.round=r;s2.phase='night';return nightScript({mode:'murder',step:0},s2)[0].say})})")
    check("key lines change from round to round", len(set(vary["t"])) == 3 and len(set(vary["m"])) == 2 and len(set(vary["n"])) == 2, vary)
    card = tv.evaluate("()=>PHASECARDS.night0({})[3]")
    check("'The Cloaks Are Chosen' holds for over five seconds before fading into the night", card and card >= 5000, card)

    # full screen for a laptop cast to the TV: a button (beside "Enable sound" until the sound is on), the F key, a double-click
    fs = b.new_page(viewport={"width": 1280, "height": 720}); fs.on("pageerror", lambda e: errs.append("fs: " + str(e)))
    fs.goto(URL); fs.wait_for_timeout(1500)
    c0 = fs.evaluate("()=>document.querySelector('#fsbtn').className")
    check("TV: a Full screen button, next to Enable sound before the sound is on", fs.is_visible("#fsbtn") and c0 == "withsound", c0)
    fs.click("#fsbtn"); fs.wait_for_timeout(500)
    on = fs.evaluate("()=>!!document.fullscreenElement"); c1 = fs.evaluate("()=>document.querySelector('#fsbtn').className")
    check("the button takes the TV full screen and then hides", on and c1 == "off", {"full": on, "cls": c1})
    fs.keyboard.press("f"); fs.wait_for_timeout(500)
    check("F leaves full screen, and the button comes back", not fs.evaluate("()=>!!document.fullscreenElement") and fs.is_visible("#fsbtn"))
    def fs_is(want):  # a full-screen switch takes a moment, longer on a busy machine
        for _ in range(30):
            if fs.evaluate("()=>!!document.fullscreenElement") == want: return True
            fs.wait_for_timeout(100)
        return False
    fs.keyboard.press("F"); f2 = fs_is(True)
    fs.dblclick("#stage"); f3 = fs_is(False)
    check("F enters full screen too, and a double-click toggles it", f2 and f3, {"F": f2, "dblclick": f3})
    fs.close()
    # larger TV text by default; the host's Menu switches it back to standard and again
    fresh()
    tv.wait_for_timeout(1500); big0 = tv.evaluate("()=>document.querySelector('#tv').classList.contains('big')")
    host.evaluate("()=>{menuOpen=true;renderHost()}"); lab = host.evaluate("()=>[...document.querySelectorAll('#host .sheet button')].map(b=>b.textContent).find(t=>/TV text/.test(t))")
    host.evaluate("()=>{[...document.querySelectorAll('#host .sheet button')].find(b=>/TV text/.test(b.textContent)).click()}"); host.wait_for_timeout(700); tv.wait_for_timeout(1500)
    big1 = tv.evaluate("()=>document.querySelector('#tv').classList.contains('big')"); fsz = tv.evaluate("()=>getComputedStyle(document.querySelector('.eyebrow')||document.body).fontSize")
    check("TV text is large in a new game; the Menu switch puts it back to standard", big0 and lab == "TV text: large — back to standard" and not big1 and host.evaluate("()=>state.tvText") == "standard", {"big0": big0, "lab": lab, "big1": big1})
    host.evaluate("()=>act(s=>{s.tvText='large'})"); tv.wait_for_timeout(1500)
    check("…and back to large", tv.evaluate("()=>document.querySelector('#tv').classList.contains('big')"))

    check("no page errors", not errs, errs[:3])
    b.close()
srv.terminate()
print("RESULT:", "CLEAN" if ok else "PROBLEMS"); sys.exit(0 if ok else 1)
