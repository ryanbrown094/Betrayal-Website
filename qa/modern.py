# Modern on the real Worker, with eight phones and a TV: the home page's Classic/Modern choice, joining by code and name,
# the host's settings, the Oath, secret roles, every Trial's phone screen, a whole Rapid Quiz answered on phones, the
# Reckoning, a night chosen on the Forsworn's phones, dawn, a lost phone let back in, and the TV never showing a secret.
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: --var MASTER_PASS:MASTERTEST &
#   python3 qa/modern.py http://127.0.0.1:8790/
import sys, re, time
from playwright.sync_api import sync_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/")
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]
fails = []
import os; SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots"); os.makedirs(SHOTS, exist_ok=True)
def shot(pg, name): pg.screenshot(path=os.path.join(SHOTS, "modern-" + name + ".png"))
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""), flush=True)
    if not cond: fails.append(name)
def until(fn, secs=20, step=0.25):
    end = time.time() + secs
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(step)
    return None
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def page(w=390, h=844):
        pg = b.new_context(viewport={"width": w, "height": h}).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errs.append(m.text))
        return pg
    host = page()
    host.goto(URL + "/"); host.fill("#pass", "MASTERTEST"); host.click("#go")
    check("home: after the booking code, a choice of Classic or Modern", until(lambda: host.locator(".mode").count() == 2))
    shot(host, "00-choice"); host.click(".mode:has-text('Modern')")
    until(lambda: "/m/" in host.url and host.locator("#name").count())
    code = re.search(r"/m/([A-Z0-9]{6})", host.url).group(1)
    host.fill("#name", NAMES[0]); host.click("[data-a=create]")
    check("the host opens the Table and lands in the lobby as host", until(lambda: "You’re in" in host.inner_text("#app") and "host" in host.inner_text(".top")))
    check("the lobby says where friends join", "/join" in host.inner_text("#app") and code in host.inner_text("#app"))
    tv = page(1280, 720); tv.goto(URL + "/t/" + code)
    check("the TV at /t/CODE shows the join code", until(lambda: code in tv.inner_text("#tvapp") and "/join" in tv.inner_text("#tvapp")))
    phones = [host]
    for i, n in enumerate(NAMES[1:]):
        pg = page(320 if i == 0 else 390)
        pg.goto(URL + "/join"); pg.fill("#code", code.lower()); pg.fill("#name", n); pg.click("[data-a=join]")
        phones.append(pg)
    check("seven friends join at /join with the code and a name", until(lambda: all("You’re in" in q.inner_text("#app") for q in phones[1:]), 25))
    dup = b.new_context(viewport={"width": 390, "height": 844}).new_page(); dup.goto(URL + "/m/" + code); dup.fill("#name", "ryan"); dup.click("[data-a=join]")
    check("a name already taken is refused", until(lambda: "already called Ryan" in dup.inner_text("#app")))
    dup.context.close()
    check("the TV lists all eight", until(lambda: all(n in tv.inner_text("#tvapp") for n in NAMES)))
    check("only the host sees the settings and Start", phones[1].locator("[data-a=start]").count() == 0 and host.locator("[data-a=start]").is_enabled())
    host.click("[data-a=opt][data-v=murder]")
    check("the host's setting reaches the lobby", until(lambda: "Murdered players find out" in host.inner_text("#app")))
    shot(host, "01-lobby-host"); shot(phones[2], "02-lobby-player"); shot(tv, "tv-01-lobby")
    host.on("dialog", lambda d: d.accept())
    host.click("[data-a=start]")
    check("the Oath on every phone", until(lambda: all("Would you like to be Forsworn?" in q.inner_text("#app") for q in phones)))
    shot(phones[1], "03-oath"); phones[3].click("[data-a=optin][data-v=yes]")
    for q in phones[:3] + phones[4:]: q.click("[data-a=optin][data-v=no]")
    check("roles are dealt once everyone has sworn", until(lambda: all("Hold your phone close" in q.inner_text("#app") for q in phones)))
    check("the TV says to look, and shows no role", until(lambda: "Look at your role" in tv.inner_text("#tvapp"), 4) and "forsworn" not in tv.inner_text("#tvapp").lower().replace("be forsworn", ""))
    roles = {}
    for i, q in enumerate(phones):
        q.click(".veil"); t = q.inner_text("#app"); roles[i] = "f" if "Forsworn\n" in t or "\nForsworn" in t else "l"
    F = [i for i in roles if roles[i] == "f"]
    check("8 players: two Forsworn, the volunteer among them", len(F) == 2 and 3 in F, roles)
    L = [i for i in roles if roles[i] == "l" and i != 0]
    check("the Forsworn phone explains the night", "choose who dies on your phone" in phones[3].inner_text("#app"))
    shot(phones[F[0]], "04-role-forsworn"); shot(phones[L[0]], "05-role-loyal")
    for q in phones: q.click("[data-a=ack]")
    check("day one once everyone has seen their role", until(lambda: "A new day" in host.inner_text("#app") and "Next Trial" in host.inner_text("#app")))
    check("only the host has the controls", until(lambda: phones[1].locator("[data-a=reckon]").count() == 0 and "Waiting for Annie" in phones[1].inner_text("#app"), 5))

    # every Trial's phone screen, briefly (the rules engine plays them all through in qa/modern-engine.mjs)
    EXPECT = {"estimate": "input[type=number]", "hilo": "[data-a=ans][data-v=higher]", "likely": ".pick button", "countdown": ".letters", "memory": ".words",
              "change": ".cells", "snap": "text=SNAP", "rps": "[data-a=ans][data-v=rock], p.q", "oneleg": "[data-a=out]", "charades": "p.q, .card.hot",
              "hum": "p.q, .card.hot", "draw": "p.q, .card.hot", "truths": "p.q"}
    for key, sel in EXPECT.items():
        host.select_option("#pickt", key)
        until(lambda: host.locator("[data-a=skip]").count()); host.click("[data-a=skip]")
        ok = until(lambda: all(q.locator(sel).count() > 0 for q in phones[1:3]), 15)
        time.sleep(.3); shot(phones[2], "trial-" + key)
        check(f"{key}: the phones show it", ok, phones[1].inner_text("#app")[:200])
        if key == "snap":
            tvok = until(lambda: tv.locator(".tvsnap svg").count() > 0, 8); check("snap: the TV shows the symbol", tvok)
        host.click("[data-a=endTrial]")
        check(f"{key}: ends with a result", until(lambda: "the result" in host.inner_text("#app")), host.inner_text("#app")[:200])
        host.click("[data-a=cont]"); until(lambda: host.locator("#pickt").count())

    # a whole Rapid Quiz, answered on phones
    host.select_option("#pickt", "quiz"); until(lambda: host.locator("[data-a=skip]").count()); host.click("[data-a=skip]")
    seen = set()
    for qn in range(8):
        until(lambda: phones[1].locator("input.f").count() > 0, 25)
        q = until(lambda: tv.locator("h2").inner_text(), 5); seen.add(q)
        if qn == 0: shot(phones[2], "06-quiz-q"); shot(host, "06-quiz-q-host"); shot(tv, "tv-02-quiz-q")
        for i, pg in enumerate(phones):
            try:
                pg.locator("input.f").fill("no idea" if i % 2 else "a guess"); pg.locator("[data-a=ansf]").click()
            except Exception: pass
        until(lambda: "Right:" in phones[1].inner_text("#app"), 10)
        if qn == 0:
            shot(phones[2], "06-quiz-reveal"); shot(tv, "tv-02-quiz-reveal")
            check("quiz: each phone locks its answer in, then the answer shows", "Right:" in phones[1].inner_text("#app"))
            check("…and the TV shows the answer", until(lambda: "Right:" in tv.inner_text("#tvapp"), 4))
            check("…and the host can accept a near miss", until(lambda: host.locator("text=Mark a near miss right").count() == 1, 4))
    check("quiz: eight questions, one after another, by themselves", until(lambda: "the result" in host.inner_text("#app"), 30) and len(seen) >= 6, len(seen))
    check("quiz: the Forsworn's wrong answers cost the Purse", "and the Purse paid for them" in host.inner_text("#app"))
    shot(host, "07-trial-result"); shot(tv, "tv-03-trial-result"); host.click("[data-a=cont]")
    until(lambda: host.locator("[data-a=reckon]").count()); shot(host, "08-day-host")

    # the Reckoning
    until(lambda: host.locator("[data-a=reckon]").count()); host.click("[data-a=reckon]")
    check("the Reckoning: a talk timer on every phone", until(lambda: all("Talk. Accuse. Defend." in q.inner_text("#app") for q in phones)))
    host.click("[data-a=voteNow]")
    until(lambda: all(q.locator("[data-a=ballot]").count() for q in phones))
    ti = L[-1]; target = NAMES[ti]
    for i, q in enumerate(phones):
        q.click(f"[data-a=ballot]:has-text('{target if i != ti else NAMES[L[0]]}')")
    shot(phones[1], "09-vote"); check("the vote closes itself once all are in, and names the exiled", until(lambda: f"{target} is exiled" in tv.inner_text("#tvapp")))
    check("…then shows their role", until(lambda: "Loyal" in tv.inner_text("#tvapp"), 10))
    shot(tv, "tv-04-reveal"); check("the exiled phone becomes a Ghost", until(lambda: "You’re a Ghost" in phones[ti].inner_text("#app")))
    host.click("[data-a=cont]")

    # the night
    check("night: the Forsworn chooses on their phone", until(lambda: "Choose who is murdered tonight" in phones[3].inner_text("#app")))
    check("…the Loyal tap too, so nobody can tell", until(lambda: "Who do you suspect most?" in phones[L[0]].inner_text("#app"), 5), [phones[L[0]].inner_text("#app")[:300], tv.inner_text("#tvapp")[:200]])
    check("…and the TV says heads down", until(lambda: "Heads down" in tv.inner_text("#tvapp"), 4))
    vi = L[0]; victim = NAMES[vi]
    for f in F:
        until(lambda: phones[f].locator(f"[data-a=pick]:has-text('{victim}')").count(), 10); phones[f].click(f"[data-a=pick]:has-text('{victim}')")
    shot(phones[F[0]], "10-night-forsworn"); check("…and sees the other Forsworn's choice", until(lambda: victim in phones[F[0]].inner_text(".card.hot")))
    for i, q in enumerate(phones):
        if i not in F and i != ti:
            if not until(lambda: q.locator("[data-a=sleep]").count(), 10): print("phone", i, "has no sleep:", q.inner_text("#app")[:300])
            else: q.click("[data-a=sleep] >> nth=0")
    check("dawn comes by itself once all have tapped; the victim learns first, in secret", until(lambda: "You were murdered" in phones[vi].inner_text("#app")) and victim not in tv.inner_text("#tvapp"))
    shot(phones[vi], "11-victim"); host.click("[data-a=cont]")
    check("the host reveals the night on every screen", until(lambda: f"{victim} is dead" in tv.inner_text("#tvapp") and f"{victim} is dead" in phones[1].inner_text("#app")))
    host.click("[data-a=cont]")
    check("round two", until(lambda: "round 2" in host.inner_text("#app").lower()))

    # a lost phone asks back in; the host lets them in
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}); lost = ctx2.new_page(); lost.on("pageerror", lambda e: errs.append(str(e)))
    li = [i for i in L if i not in (ti, vi)][0]
    lost.goto(URL + "/m/" + code); lost.fill("#name", NAMES[li]); lost.click("[data-a=join]")
    check("a lost phone asks by name", until(lambda: "Asking the host" in lost.inner_text("#app")))
    check("…the host is asked", until(lambda: "asking to come back in" in host.inner_text("#app")))
    host.click("[data-a=letin]")
    check("…and once let in, it's that player again", until(lambda: NAMES[li] in lost.inner_text(".top")))

    check("the TV shows no Forsworn while they're hidden", "forsworn" not in tv.inner_text("#tvapp").lower())
    wide = [i for i, q in enumerate(phones) if q.evaluate("document.documentElement.scrollWidth") > q.viewport_size["width"]]
    check("no phone scrolls sideways (320px included)", not wide, wide)
    check("no page errors", not errs, errs[:5])
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
