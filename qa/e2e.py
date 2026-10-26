# End-to-end through the API: PIN gate, redaction, two-screen sync, the Witness ceremony, the Ghosts' share-or-take, wipe + fresh game.
import json, sys, os
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8714/"
# Against the real Worker (wrangler dev, staging): set ADMIN_TOKEN and the test mints two passes and plays in its own room.
ADMIN = os.environ.get("ADMIN_TOKEN")
# Behind the pre-launch password gate: set SITE_PASSWORD and every browser and API call carries the gate cookie.
import hashlib
from urllib.parse import urlparse
GATE = os.environ.get("SITE_PASSWORD")
GATE_HDR = {"Cookie": "cc_gate=" + hashlib.sha256(("cloak-and-candle-gate:" + GATE).encode()).hexdigest()} if GATE else {}
PIN = "4821"
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra) if extra and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); errs = []
    def page(w, h, hash=""):
        pg = b.new_context(viewport={"width": w, "height": h}, extra_http_headers=GATE_HDR).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept()); pg.goto(PAGE + hash); pg.wait_for_timeout(1500); return pg
    api = b.new_context(extra_http_headers=GATE_HDR).request
    PAGE, APIU = URL, URL + "api/"
    if ADMIN:
        passes = api.post(URL + "api/admin/passes", headers={"Authorization": "Bearer " + ADMIN}, data=json.dumps({"count": 2, "note": "e2e"})).json()["passes"]
        check("admin mints passes; without the token it's refused", len(passes) == 2 and api.post(URL + "api/admin/passes", data="{}").status == 401)
        room = api.post(URL + "api/games", data=json.dumps({"pass": passes[0]})).json()["room"]
        again = api.post(URL + "api/games", data=json.dumps({"pass": passes[0].lower().replace("-", "")})).json()
        check("a pass redeemed twice gives back the same room", again.get("room") == room and again.get("again"))
        room2 = api.post(URL + "api/games", data=json.dumps({"pass": passes[1]})).json()["room"]
        check("a second pass gets a different room", room2 != room)
        check("an unknown pass is refused", api.post(URL + "api/games", data=json.dumps({"pass": "CNDL-ZZZZ-ZZZZ"})).status == 404)
        check("an unknown room is 404", api.get(URL + "api/g/ZZZZZ9/state").status == 404)
        MASTER = os.environ.get("MASTER_PASS")
        if MASTER:
            m1, m2 = (api.post(URL + "api/games", data=json.dumps({"pass": " " + MASTER.lower() + " "})).json() for _ in range(2))
            check("the master passcode opens a fresh room every time", m1.get("room") and m2.get("room") and m1["room"] != m2["room"], (m1, m2))
        PAGE, APIU = URL + "g/" + room, URL + "api/g/" + room + "/"
    def sync(*pages):  # wait until every screen has caught up with the host's latest save
        for _ in range(80):
            v = host.evaluate("()=>state?state.ver:0")
            if all(pg.evaluate("()=>state?state.ver:0") == v for pg in pages) and host.evaluate("()=>pending") == 0: return
            host.wait_for_timeout(250)
    # clean slate (only works if we know the PIN of whatever is there; a fresh deployment has nothing)
    api.delete(APIU + "state", headers={"X-Pin": PIN})
    check("empty server returns null state", api.get(APIU + "state").json()["state"] is None)
    host = page(390, 844, "#host")
    host.evaluate("(a)=>{setupDraft=Object.assign(SETUP0(),{names:a[0],pin:a[1]},a[2]||{});setupDraft.touched=Object.keys(a[2]||{});submitSetup()}", ["\n".join(NAMES), PIN, {"cloaks": "2"}]); host.wait_for_timeout(600); sync()
    pub = api.get(APIU + "state").json()
    check("public GET is unauthenticated view", pub["auth"] is False and pub["state"] is not None)
    check("public view hides the PIN, the log and undo history", all(k not in pub["state"] for k in ("hostPin", "log", "prev")))
    check("public view hides every role", all(pl["role"] is None for pl in pub["state"]["players"]))
    full = api.get(APIU + "state", headers={"X-Pin": PIN}).json()
    check("PIN holder gets the full state", full["auth"] is True and full["state"]["hostPin"] == PIN and sum(pl["role"] == "cloak" for pl in full["state"]["players"]) == 2)
    check("write with a wrong PIN is refused", api.put(APIU + "state", headers={"X-Pin": "0000", "Content-Type": "application/json"}, data=json.dumps({"state": {"hostPin": "0000"}})).status in (403, 429))
    rd = api.delete(APIU + "state", headers={"X-Pin": "0000"}); check("delete with a wrong PIN is refused", rd.status in (403, 429), (rd.status, rd.text()[:120]))
    # a second phone: PIN gate
    h2 = page(390, 844, "#host")
    check("second host sees the PIN gate, not the game", h2.locator("#pin").count() == 1 and "Spoilers" not in h2.inner_text("body"))
    h2.fill("#pin", "1111"); h2.click("text=Unlock"); h2.wait_for_timeout(900)
    check("wrong PIN stays locked", h2.locator("#pin").count() == 1 and ("Wrong PIN" in h2.inner_text("body") or "Too many" in h2.inner_text("body")))
    h2.fill("#pin", PIN); h2.click("text=Unlock"); h2.wait_for_timeout(2500)
    if "Too many" in h2.inner_text("body"): h2.wait_for_timeout(61000); h2.fill("#pin", PIN); h2.click("text=Unlock"); h2.wait_for_timeout(2500)
    check("right PIN unlocks the host screen", "Spoilers" in h2.inner_text("body"))
    tv = page(1280, 720); tv.evaluate("()=>{window.__noCards=true}")
    check("TV shows the lobby with every guest", all(n in tv.inner_text("#rail") for n in NAMES))
    check("TV page never receives roles or the PIN", tv.evaluate("()=>!state.hostPin && !state.prev && state.players.every(p=>p.role===null)"))
    # drive on from phone 1, watch phone 2 and the TV follow
    host.evaluate("()=>act(s=>{s.players.forEach((p,i)=>p.role=[1,4].includes(i)?'cloak':'candle');s.phase='day';s.startedAt=now()})")
    sync(tv, h2)
    check("TV follows the host within a poll", "A new day at the house" in tv.inner_text("#stage"))
    check("second phone follows too", "swap it" in h2.inner_text("body").lower()
)
    # the Witness: offered, won, met straight away in the ceremony; the TV never learns who; then a night
    host.evaluate("()=>{pickMission('rps');act(s=>{s.mission.witnessOffer=true});startMission();startMission();act(s=>{finishPlay(s)});witnessPick(state.players[0].id);endMission()}"); sync(tv, h2)
    check("the Witness meets the Cloak at once, in the ceremony", host.evaluate("()=>state.witness.used===true && !!state.witness.metId && state.shieldCard.mode==='witness'"))
    check("TV never learns who the Witness or their Cloak is", tv.evaluate("()=>!state.witness && !('witnessName' in state.shieldCard) && !('metName' in state.shieldCard)"))
    host.evaluate("()=>{act(s=>{s.shieldCard.step=3});openTable();exile(state.players[7].id);askGo();revealRole();startNight();beginNight()}")
    n_host = host.evaluate("()=>nightScript(state.night,state).length"); sync(tv, h2)
    n_tv = tv.evaluate("()=>nightScript(publicView(state).night,publicView(state)).length")
    check("no Witness lines at night any more — the meeting already happened", not host.evaluate("()=>nightScript(state.night,state).some(l=>norm(l).tap==='witness')"))
    check("TV and phone agree on the script length", n_host == n_tv, (n_host, n_tv))
    host.evaluate("()=>{act(s=>{s.night.victimId=s.players[2].id});finishNight()}"); sync(tv, h2)
    check("before dawn the TV still shows the victim alive", tv.evaluate("()=>state.players[2].alive===true && !state.morning.kind"))
    host.evaluate("()=>act(s=>{s.morning.revealed=true})"); sync(tv, h2)
    check("after the reveal the TV shows the poisoning", tv.evaluate("()=>state.players[2].alive===false") and "Tom" in tv.inner_text("#stage"))
    # ghosts judge: Tom and Oliver both name a Forsworn; then both Forsworn take -> Ghosts' own round
    host.evaluate("()=>{ghostGuess(state.players[2].id,state.players[1].id);ghostGuess(state.players[7].id,state.players[4].id);handoff=null;renderHost()}")
    before = host.evaluate("()=>state.ghosts[state.players[2].id].pick")
    host.evaluate("()=>{ghostGuess(state.players[2].id,state.players[0].id);handoff=null}")
    check("a Ghost's verdict cannot be overwritten", host.evaluate("()=>state.ghosts[state.players[2].id].pick") == before)
    host.evaluate("()=>{finishGame()}"); sync(tv, h2)
    check("ending the game opens the ceremony with nothing revealed", host.evaluate("()=>state.phase==='final2' && !state.final2.showRoles && state.final2.shown.length===0") and tv.evaluate("()=>state.players.filter(p=>p.alive).every(p=>p.role===null)"))
    host.evaluate("()=>{revealSurvivor(aliveOf(state)[0].id)}"); sync(tv, h2)
    check("one seal turned shows one role on the TV, the rest stay hidden", tv.evaluate("()=>state.players.filter(p=>p.alive&&p.role).length===1"))
    host.evaluate("()=>{aliveOf(state).forEach(p=>revealSurvivor(p.id))}"); sync(tv, h2)
    check("every seal turned: two living Cloaks route to share-or-take", host.evaluate("()=>state.phase==='final2' && state.final2.showRoles && state.final2.cloakIds.length===2"))
    host.evaluate("()=>{state.final2.cloakIds.forEach(id=>castTake(id,'take'));handoff=null;startTakeReveal();act(s=>{s.final2.revealed=2});startGhostRound()}")
    check("ghost round holds exactly the Ghosts who were right", host.evaluate("()=>JSON.stringify(state.final2.ghostRound.ids.sort())===JSON.stringify([state.players[2].id,state.players[7].id].sort())"))
    host.evaluate("()=>{castTake(state.players[2].id,'take');castTake(state.players[7].id,'share');handoff=null;startGhostReveal();act(s=>{s.final2.ghostRound.revealed=1})}"); sync(tv, h2)
    check("TV sees only the revealed ghost vote", tv.evaluate("()=>Object.values(state.final2.ghostRound.votes).filter(v=>v!=='·').length===1"))
    host.evaluate("()=>{act(s=>{s.final2.ghostRound.revealed=2});finishGame()}"); sync(tv, h2); tv.wait_for_timeout(400)
    check("prize goes to the Ghost who stole", host.evaluate("()=>state.phase==='final' && state.winner==='cloaks' && state.prizeTo") == "Tom, a Ghost"
, host.evaluate("()=>state.prizeTo"))
    check("TV final shows every role", tv.evaluate("()=>state.players.every(p=>p.role)") and "The Forsworn win" in tv.inner_text("#stage"))
    # undo, then wipe and immediately start again: the TV must not cling to the old game's higher version
    host.evaluate("()=>undo()"); sync(tv, h2)
    check("undo steps the TV back", tv.evaluate("()=>state.phase") == "final2")
    host.evaluate("(n)=>{newGame();startGame({names:n,cloaks:2,title:'Second Sitting',host:'Ryan',potUnit:'£',potPer:50,prize:'the good whisky',hours:3,pin:'" + PIN + "'})}", NAMES[:6]); sync(tv); tv.wait_for_timeout(1500)
    check("fresh game replaces the old one on the TV", "Second Sitting" in tv.inner_text("#stage") and tv.evaluate("()=>state.players.length") == 6, tv.inner_text("#stage")[:80])
    if ADMIN:
        check("the other room is untouched by this game", api.get(URL + "api/g/" + room2 + "/state").json()["state"] is None)
        tv2 = b.new_context(viewport={"width": 1280, "height": 720}, extra_http_headers=GATE_HDR).new_page(); tv2.goto(URL + "g/" + room2); tv2.wait_for_timeout(3000)
        check("a fresh room's TV shows its code and the host link", room2 in tv2.inner_text("#stage") and "#keeper" in tv2.inner_text("#stage"), tv2.inner_text("#stage")[:120])
    if ADMIN:
        # the feedback survey: sent from a booking code, answered on a phone, listed in the admin, stopped by its link
        H = {"Authorization": "Bearer " + ADMIN}
        sp = api.post(URL + "api/admin/passes", headers=H, data=json.dumps({"count": 2, "note": "e2e survey", "email": "host@example.com"})).json()["passes"]
        sent = api.post(URL + "api/admin/survey", headers=H, data=json.dumps({"pass": sp[0]}))
        check("the admin sends a booking code's buyer the feedback survey", sent.status == 200 and sent.json().get("to") == "host@example.com", sent.text()[:200])
        tok = [x for x in api.get(URL + "api/admin/passes", headers=H).json()["passes"] if x["pass"] == sp[0]][0].get("survey", "")
        sv = b.new_context(viewport={"width": 390, "height": 844}, extra_http_headers=GATE_HDR, is_mobile=True, has_touch=True).new_page(); sv.on("pageerror", lambda e: errs.append(str(e)))
        sv.goto(URL + "survey?t=" + tok); sv.wait_for_selector("#sv:not([hidden])", timeout=8000)
        check("the survey page opens on a phone, and its token leaves the address bar", sv.url.endswith("/survey") and sv.is_visible("#svsend"), sv.url)
        sv.click("#svsend"); check("…it asks for all five answers", "all five" in sv.inner_text("#svmsg"))
        for n, v in [("overall", "5"), ("recommend", "10"), ("setup", "Very easy"), ("length", "About right"), ("again", "Yes")]: sv.click(f'input[name="{n}"][value="{v}"]', force=True)
        check("…and lets the warning go once answered", sv.inner_text("#svmsg") == "")
        sv.fill("#comment", "Best party game we've played."); sv.click("#svsend"); sv.wait_for_selector("#done:not([hidden])", timeout=8000)
        got = sv.is_visible("#gotcode")
        check("…then thanks them with their code" + ("" if got else " (no Stripe key here, so the code is promised by email)"), (got and sv.inner_text("#code").startswith("THANKS")) or (not got and sv.is_visible("#nocode")))
        fb = api.get(URL + "api/admin/surveys", headers=H).json()["surveys"]
        check("the answer is in the admin's Feedback list", any(x.get("pass") == sp[0] and (x.get("answers") or {}).get("recommend") == 10 for x in fb))
        sv.goto(URL + "survey?t=" + tok + "&stop=1"); sv.wait_for_selector("#off:not([hidden])", timeout=8000)
        stopped = api.post(URL + "api/admin/survey", headers=H, data=json.dumps({"pass": sp[1]}))
        check("its stop link stops feedback emails to that address", stopped.status == 409 and "asked not to" in stopped.text(), stopped.text()[:200])
    check("no page errors on any screen", not errs, errs[:3])
    api.delete(APIU + "state", headers={"X-Pin": PIN})
    b.close()
print("RESULT:", "CLEAN" if not fails else "FAILED: " + ", ".join(fails)); sys.exit(1 if fails else 0)
