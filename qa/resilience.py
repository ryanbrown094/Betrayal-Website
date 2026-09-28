# Resilience: two hosts colliding, connections dropping on each screen, PIN persistence and lockout, night masking, rate limit.
import json, sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8714/"
PIN = "7351"; NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess"]
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra) if extra and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def page(w, h, hash="", ctx=None):
        ctx = ctx or b.new_context(viewport={"width": w, "height": h}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: (errs.append("DIALOG " + d.message), d.accept())); pg.goto(URL + hash); pg.wait_for_timeout(1200); return pg
    api = b.new_context().request
    api.delete(URL + "api/state", headers={"X-Pin": PIN})
    host = page(390, 844, "#host")
    host.evaluate("(a)=>{setupDraft=Object.assign(SETUP0(),{names:a[0],pin:a[1]},a[2]||{});setupDraft.touched=Object.keys(a[2]||{});submitSetup()}", ["\n".join(NAMES), PIN]); host.wait_for_timeout(1500)
    host.evaluate("()=>act(s=>{s.players.forEach((p,i)=>p.role=[1,4].includes(i)?'cloak':'candle');s.phase='day';s.startedAt=now()})"); host.wait_for_timeout(1500)
    # 1 · PIN survives a reload (localStorage)
    host.reload(); host.wait_for_timeout(2500)
    check("host phone reload keeps the PIN and the game", "pick a mission" in host.inner_text("body"))
    # 2 · second host with a stale PIN in storage is shown the gate and does NOT lock itself out
    h2 = page(390, 844, "#host")
    h2.evaluate("()=>localStorage.setItem('cloaks-pin','0000')"); h2.reload(); h2.wait_for_timeout(4500)
    check("stale stored PIN clears itself instead of polling forever", h2.evaluate("()=>localStorage.getItem('cloaks-pin')") in (None, ""))
    h2.fill("#pin", PIN); h2.click("text=Unlock"); h2.wait_for_timeout(2500)
    check("right PIN still unlocks after a stale one (no lockout)", "pick a mission" in h2.inner_text("body"), h2.inner_text("body")[:120])
    # 3 · both phones act from the same version: one wins, the other is refreshed with a toast, states converge
    host.wait_for_timeout(1500)
    v0 = host.evaluate("()=>state.ver")
    host.evaluate("()=>act(s=>{s.pot=111},'A')"); h2.evaluate("()=>act(s=>{s.pot=222},'B')"); host.wait_for_timeout(3000)
    server = api.get(URL + "api/state").json()["state"]
    check("a version conflict is refused by the server (one of the two pots won)", server["pot"] in (111, 222) and server["ver"] == v0 + 1, (server["pot"], server["ver"], v0))
    check("both phones converge on the server's state", host.evaluate("()=>state.pot") == server["pot"] and h2.evaluate("()=>state.pot") == server["pot"], (host.evaluate("()=>state.pot"), h2.evaluate("()=>state.pot")))
    loser = h2 if server["pot"] == 111 else host
    check("the losing phone saw a toast", "moved first" in loser.evaluate("()=>document.body.innerText") or loser.evaluate("()=>(state.log||[]).length>0"))
    # 4 · host loses the connection mid-game: NOT SYNCED appears, then the state is pushed again by itself once the link is back
    host.route("**/api/state", lambda r: r.abort()); host.evaluate("()=>act(s=>{s.pot=555},'offline tap')"); host.wait_for_timeout(3500)
    check("dropped connection shows NOT SYNCED on the phone", "NOT SYNCED" in host.inner_text("body"))
    host.unroute("**/api/state"); host.wait_for_timeout(8000)
    check("state re-syncs by itself after the link returns (no extra tap)", api.get(URL + "api/state").json()["state"]["pot"] == 555 and "NOT SYNCED" not in host.inner_text("body"), api.get(URL + "api/state").json()["state"]["pot"])
    # 5 · TV loses the connection: reconnecting badge, then clears
    tv = page(1280, 720); tv.evaluate("()=>{window.__noCards=true}")
    tv.route("**/api/state", lambda r: r.abort()); tv.wait_for_timeout(7000)
    check("TV shows a reconnecting badge after a few failed polls", tv.evaluate("()=>document.querySelector('#net').classList.contains('on')"))
    tv.unroute("**/api/state"); tv.wait_for_timeout(2500)
    check("badge clears when polls succeed again", not tv.evaluate("()=>document.querySelector('#net').classList.contains('on')"))
    # 6 · the night's victim is not on the wire until the line that shows it
    host.evaluate("()=>{openTable();exile(state.players[6].id);askGo();revealRole();startNight();beginNight();act(s=>{s.night.victimId=s.players[2].id;s.night.step=3})}"); host.wait_for_timeout(2500)
    pub = api.get(URL + "api/state").json()["state"]["night"]
    check("victim hidden from the public view before the murder line", pub["victimId"] is None and pub["revealStep"] > 3, pub)
    host.evaluate("()=>act(s=>{s.night.step=s.night.revealStep})"); host.wait_for_timeout(2500)
    pub = api.get(URL + "api/state").json()["state"]["night"]
    check("victim visible once the murder line is reached", pub["victimId"] == host.evaluate("()=>state.players[2].id"))
    check("TV shows the poisoned line with the name", "Tom" in tv.inner_text("#stage") and "poisoned" in tv.inner_text("#stage"))
    # 7 · brute force: nine wrong PINs from one address are rate-limited (the DO keys on CF-Connecting-IP; locally everyone is '?')
    codes = [api.get(URL + "api/state", headers={"X-Pin": str(1000 + i)}).status for i in range(9)]
    check("wrong-PIN guessing gets a 429", 429 in codes, codes)
    check("no page errors, no native dialogs", not errs, errs[:3])
    api.delete(URL + "api/state", headers={"X-Pin": PIN})
    b.close()
print("RESULT:", "CLEAN" if not fails else "FAILED: " + ", ".join(fails)); sys.exit(1 if fails else 0)
