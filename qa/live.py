# Real-time capture of the animated beats (title cards on, sound on) to check choreography and the audio code paths.
import os
from playwright.sync_api import sync_playwright
URL="http://localhost:8714/"; OUT="qa/shots/live"; os.makedirs(OUT,exist_ok=True)
NAMES=["Annie","Ryan","Tom","Sophie","Marcus","Priya","Jess","Oliver","Hannah","Dev"]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); errs=[]
    host=b.new_context(viewport={"width":390,"height":844}).new_page(); host.on("dialog",lambda d:d.accept()); host.on("pageerror",lambda e:errs.append("HOST "+str(e)))
    host.goto(URL+"#host"); host.wait_for_timeout(700); host.request.delete(URL+"api/state",headers={"X-Pin":"1234"}); host.reload(); host.wait_for_timeout(800)
    host.evaluate("(names)=>{startGame({names,cloaks:2,title:'Cloak & Candle',host:'Sam',potUnit:'pts',potPer:100,prize:'a bottle of wine',hours:4.5,pin:'1234'})}",NAMES)
    host.evaluate("()=>act(s=>{s.players.forEach((p,i)=>p.role=[1,4].includes(i)?'cloak':'candle')})")
    tv=b.new_context(viewport={"width":1280,"height":720}).new_page(); tv.on("pageerror",lambda e:errs.append("TV "+str(e))); tv.on("console",lambda m: m.type in("error","warning") and errs.append("TVC "+m.text))
    tv.goto(URL); tv.wait_for_timeout(1500); tv.click("#soundbtn",force=True); tv.wait_for_timeout(500)
    def seq(name,js,times):
        host.evaluate("()=>{"+js+"}"); t=0
        for i,at in enumerate(times):
            tv.wait_for_timeout(int((at-t)*1000)); t=at; tv.screenshot(path=f"{OUT}/{name}_{i}_{at}s.png")
    seq("intro","act(s=>{s.phase='intro';s.startedAt=now()})",[1.5,3.2,6.5,11,14.5])
    seq("night0","act(s=>{s.phase='night0';s.night={step:0}})",[1.0,3.5])
    seq("day","act(s=>{s.phase='day';s.night=null})",[1.0,3.5])
    seq("table","openTable();",[3.2])
    seq("votes","vote(state.players[1].id,1);vote(state.players[1].id,1);vote(state.players[3].id,1)",[1.6])
    seq("exile","exile(state.players[1].id);askGo()",[0.9,2.6,3.6,5.0])
    seq("role","revealRole()",[1.4,1.9,2.4,3.4,5])
    seq("night","startNight()",[1.0,3.2])
    seq("morning","beginNight();act(s=>{s.night.victimId=s.players[0].id});finishNight()",[1.0,3.5])
    seq("murder","act(s=>{s.morning.revealed=true})",[1.6,2.4,4.2])
    print("audio state:",tv.evaluate("()=>AC&&AC.state"),"scene:",tv.evaluate("()=>MUSIC.scene"))
    print("errors:",errs[:8])
    b.close()
