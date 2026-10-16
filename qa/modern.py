# Modern on the real Worker, with eight phones and a TV: the home page's Classic/Modern choice, joining by code and name,
# the host's settings (prize tiers, twists, courses), the Oath, secret roles, a whole Rapid Quiz answered on phones that
# gives the Casting Vote, the Temptation, the Reckoning, a night chosen on the Forsworn's phones, dawn, the next round's
# course, the host's tools (and the roles behind three confirmations), a lost phone let back in, the TV's QR code,
# narrator and sound, and every Trial's screen (rendered from the rules engine through the replay mode).
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: --var MASTER_PASS:MASTERTEST &
#   python3 qa/modern.py http://127.0.0.1:8790/
import sys, re, time, os, json, subprocess
from playwright.sync_api import sync_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]
fails = []
SHOTS = os.path.join(ROOT, "qa", "shots"); os.makedirs(SHOTS, exist_ok=True)
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
ANSWERS = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", "import { QUIZ_E, QUIZ_M, QUIZ_H } from './worker/src/content.gen.js'; console.log(JSON.stringify(Object.fromEntries([...QUIZ_E, ...QUIZ_M, ...QUIZ_H].map(([q, a]) => [q, String(a)]))))"], cwd=ROOT))
VIEWS = json.loads(subprocess.check_output(["node", os.path.join(ROOT, "qa", "modern-views.mjs")]))
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def page(w=390, h=844):
        c = b.new_context(viewport={"width": w, "height": h}); pg = c.new_page()
        c.route("https://www.googletagmanager.com/**", lambda r: r.fulfill(status=200, content_type="text/javascript", body=""))  # Google's tag on the home page
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errs.append(m.text))
        return pg

    # every Trial's screen, on a phone (and the actor's), from the engine's views
    rp = page(320, 640); rp.goto(URL + "/modern.html#replay-host"); rp.wait_for_timeout(500)
    EXPECT = {"quiz": "input.f", "estimate": "input[type=number]", "hilo": "[data-a=ans][data-v=higher]", "likely": ".pick button", "countdown": ".letters", "memory": ".words",
              "change": ".cells", "snap": "text=SNAP", "rps": "[data-a=ans][data-v=rock], p.q", "oneleg": "[data-a=out]", "statue": "[data-a=out]", "charades": "p.q", "hum": "p.q", "draw": "p.q", "truths": "p.q"}
    for key, sel in EXPECT.items():
        rp.evaluate("v => replayShow(v)", VIEWS[key]["player"]); rp.wait_for_timeout(80)
        ok = rp.locator(sel).count() > 0 and rp.evaluate("document.documentElement.scrollWidth") <= 320
        check(f"{key}: a phone shows it (320px, no sideways scroll)", ok, rp.inner_text("#app")[:160]); shot(rp, "trial-" + key)
        if VIEWS[key]["actor"]:
            rp.evaluate("v => replayShow(v)", VIEWS[key]["actor"]); rp.wait_for_timeout(80)
            check(f"{key}: the one on the spot gets their private screen", rp.locator(".card.hot, [data-a=lie]").count() > 0, rp.inner_text("#app")[:160])
    rt = page(1280, 720); rt.goto(URL + "/modern.html#replay-tv"); rt.wait_for_timeout(500)
    wide = []
    for key in EXPECT:
        rt.evaluate("v => replayShow(v)", VIEWS[key]["player"]); rt.wait_for_timeout(60)
        if rt.evaluate("document.querySelector('#tvapp').scrollHeight > innerHeight + 2 || document.documentElement.scrollWidth > innerWidth"): wide.append(key)
    check("every Trial fits the TV at 720p", not wide, wide)
    rp.context.close(); rt.context.close()

    # a real game
    host = page()
    host.goto(URL + "/"); host.fill("#pass", "MASTERTEST"); host.click("#go")
    check("home: after the booking code, a choice of Classic or Modern (and, for the master code, a test against bots)", until(lambda: host.locator(".mode").count() == 3))
    code = until(lambda: re.search(r"/g/([A-Z0-9]{6})/m", host.evaluate("performance.getEntriesByType('resource').map(e=>e.name).join(' ')")).group(1))
    host.click(".mode:has-text('Modern')")
    check("Modern: the host is asked their name", until(lambda: "You’re the host" in host.inner_text("#app")))
    # the test fixes the Trials' order (master-code rooms only): the quiz first
    r = host.evaluate("async c => (await fetch('/api/g/' + c + '/m/create', {method:'POST', body: JSON.stringify({name:'Annie', plan:['quiz','hilo','estimate','countdown']})})).json()", code)
    host.evaluate("([c, t]) => localStorage.setItem('bt-m-' + c, t)", [code, r["tok"]]); host.goto(URL + "/m/" + code)
    check("the host lands in the lobby as host", until(lambda: "You’re in" in host.inner_text("#app") and "host" in host.inner_text(".top").lower()))
    tv = page(1280, 720); tv.goto(URL + "/t/" + code)
    check("the TV at /t/CODE shows the code and a QR code", until(lambda: code in tv.inner_text("#tvapp") and tv.locator(".qrbox svg path").count() == 1))
    phones = [host]
    for i, n in enumerate(NAMES[1:]):
        pg = page(320 if i == 0 else 390)
        pg.goto(URL + "/join"); pg.fill("#code", code.lower()); pg.fill("#name", n); pg.click("[data-a=join]")
        phones.append(pg)
    check("seven friends join at /join", until(lambda: all("You’re in" in q.inner_text("#app") for q in phones[1:]), 25))
    check("the TV lists all eight", until(lambda: all(n in tv.inner_text("#tvapp") for n in NAMES)))
    check("no kill choice in the lobby (poison is the only kill), and the default prize explains its chocolate coins", host.locator("[data-a=opt][data-k=kill]").count() == 0 and host.input_value("#prize") == "chocolate coins" and "Every 100 points in the Purse is one chocolate coin" in host.inner_text("#app"))
    host.click("summary:has-text('Better prizes')"); host.fill("#tier1", "champagne"); host.locator("#tier1").dispatch_event("change")
    check("the host's settings: a better prize for a half-full Purse", until(lambda: host.input_value("#tier1") == "champagne"))
    check("twists on and dinner off by default", "Once each: the Casting Vote, the Temptation, the Crown" in host.inner_text("#app") and "No meal breaks" in host.inner_text("#app"))
    host.click("[data-a=opt][data-k=courses][data-v=true]")
    check("…and the host can switch dinner in courses on", until(lambda: "Dinner in courses: a starter" in host.inner_text("#app")))
    shot(host, "01-lobby-host"); shot(tv, "tv-01-lobby")
    def dialogs(d):
        if d.type == "prompt": d.accept("SHOW THE ROLES")
        else: d.accept()
    host.on("dialog", dialogs)
    host.click("[data-a=start]")
    check("the Oath on every phone", until(lambda: all("Would you like to be Forsworn?" in q.inner_text("#app") for q in phones)))
    phones[3].click("[data-a=optin][data-v=yes]")
    for q in phones[:3] + phones[4:]: q.click("[data-a=optin][data-v=no]")
    check("roles are dealt once everyone has sworn", until(lambda: all("Hold your phone close" in q.inner_text("#app") for q in phones)))
    roles = {}
    for i, q in enumerate(phones):
        q.click(".veil"); t = q.inner_text("#app"); roles[i] = "f" if "\nForsworn" in t or "Forsworn\n" in t else "l"
    F = [i for i in roles if roles[i] == "f"]; L = [i for i in roles if roles[i] == "l" and i != 0]
    check("8 players: two Forsworn, the volunteer among them", len(F) == 2 and 3 in F, roles)
    for q in phones: q.click("[data-a=ack]")
    check("day one: the host has one button, Begin, and the plan's next step", until(lambda: host.locator("[data-a=next]").count() == 1 and "Next:" in host.inner_text("#app")))
    check("…no choosing Trials, no Temptation, no Reckoning button", host.locator("#pickt, [data-a=trial], [data-a=reckon]").count() == 0)
    check("…and players see what's next too", until(lambda: "Next:" in phones[1].inner_text("#app") and "Waiting for Annie" in phones[1].inner_text("#app"), 5))
    shot(host, "08-day-host")

    check("day one opens with Most Likely To, the icebreaker", "Most Likely To" in host.inner_text("#app"))
    host.click("[data-a=tools]"); host.click("[data-a=tool][data-v=skipStep]")
    check("…which the host can skip from Tools", until(lambda: "Most Likely To" not in host.inner_text("#app") and host.locator("[data-a=next]").count() == 1))

    # the Trial with the Casting Vote: a whole quiz on phones
    host.click("[data-a=next]")
    check("the quiz's introduction names the Casting Vote as its prize", until(lambda: "Casting Vote" in phones[1].inner_text("#app")))
    host.click("[data-a=tools]"); check("Tools: start the Trial now", until(lambda: host.locator("[data-a=tool][data-v=skip]").count() == 1)); host.click("[data-a=tool][data-v=skip]")
    seen = set()
    for qn in range(8):
        until(lambda: phones[1].locator("input.f").count() > 0, 25)
        q = until(lambda: phones[1].locator("p.q").inner_text(), 5); seen.add(q)
        for i, pg in enumerate(phones):   # Ryan knows every answer; the rest guess
            try: pg.locator("input.f").fill(ANSWERS.get(q, "?") if i == 1 else "a guess"); pg.locator("[data-a=ansf]").click()
            except Exception: pass
        until(lambda: "Right:" in phones[1].inner_text("#app"), 10)
        if qn == 0:
            check("quiz: each phone locks its answer, then the answer shows on phones and TV", "Right:" in phones[1].inner_text("#app") and until(lambda: "Right:" in tv.inner_text("#tvapp"), 4))
            check("…and the host can still accept a near miss", until(lambda: host.locator("text=Mark a near miss right").count() == 1, 4))
            shot(phones[2], "06-quiz-reveal"); shot(tv, "tv-02-quiz-reveal")
    check("quiz: eight questions, one after another, by themselves", until(lambda: "the result" in host.inner_text("#app"), 30) and len(seen) >= 6, len(seen))
    check("the winner (Ryan, who knew every answer) alone is told they hold the Casting Vote", until(lambda: "You won the Casting Vote" in phones[1].inner_text("#app"), 5) and sum("You won the Casting Vote" in q.inner_text("#app") for q in phones) == 1)
    check("…and nobody else, the TV included, is told who won it", until(lambda: "The Casting Vote is taken" in tv.inner_text("#tvapp"), 4) and "Ryan wins" not in tv.inner_text("#tvapp") and "Ryan wins" not in phones[2].inner_text("#app"))
    shot(host, "07-trial-result"); host.click("[data-a=cont]")

    # the Temptation, straight after
    until(lambda: host.locator("[data-a=next]").count()); check("next: the Temptation", "The Temptation" in host.inner_text("#app")); host.click("[data-a=next]")
    until(lambda: all(q.locator("[data-a=ans][data-v=purse]").count() for q in phones), 25)
    for q in phones: q.click("[data-a=ans][data-v=purse]")
    check("the Temptation: all PURSE doubles the offer", until(lambda: "The table held" in host.inner_text("#app"), 15))
    host.click("[data-a=cont]")

    # the Reckoning
    until(lambda: host.locator("[data-a=next]").count()); check("next: the Reckoning", "The Reckoning" in host.inner_text("#app")); host.click("[data-a=next]")
    check("the Reckoning: a talk timer on every phone", until(lambda: all("Make your accusations" in q.inner_text("#app") for q in phones)))
    host.click("[data-a=pause]")
    check("Pause: every phone and the TV say so", until(lambda: all("The game is paused" in q.inner_text("#app") for q in phones[1:]) and "The game is paused" in tv.inner_text("#tvapp")))
    c0 = phones[1].inner_text(".clock"); time.sleep(2.5)
    check("…and the clocks stand still", phones[1].inner_text(".clock") == c0, c0)
    host.click("[data-a=pause][data-v=off]")
    check("Carry on: the game comes back", until(lambda: "The game is paused" not in phones[1].inner_text("#app") and "The game is paused" not in tv.inner_text("#tvapp")))
    host.click("[data-a=tools]"); host.click("[data-a=tool][data-v=voteNow]")
    until(lambda: all(q.locator("[data-a=ballot]").count() for q in phones))
    ti = L[-1]; target = NAMES[ti]
    for i, q in enumerate(phones): q.click(f"[data-a=ballot]:has-text('{target if i != ti else NAMES[L[0]]}')")
    check("the vote closes itself once all are in", until(lambda: f"{target} is exiled" in tv.inner_text("#tvapp")))
    check("…then shows their role", until(lambda: "Loyal" in tv.inner_text("#tvapp"), 10))
    phones[ti].fill("#lw", "I was Loyal, you fools"); phones[ti].click("[data-a=wordsf]")
    check("last words: the exiled types a line, and the TV shows it", until(lambda: "I was Loyal, you fools" in tv.inner_text("#tvapp") and "I was Loyal, you fools" in phones[1].inner_text("#app")))
    host.click("[data-a=cont]")

    # the night
    check("night: the Forsworn choose on their phones", until(lambda: "Choose who is poisoned tonight" in phones[F[0]].inner_text("#app")))
    check("…the host has no dawn button (it's in Tools)", host.locator("[data-a=dawnNow]").count() == 0)
    phones[F[0]].click("details.whisp summary"); phones[F[0]].click("[data-a=whisper]:has-text('Vote with me tomorrow')")
    check("…and whisper to each other, which nobody else sees", until(lambda: "Vote with me tomorrow" in phones[F[1]].inner_text("#app")) and "Vote with me" not in phones[L[0]].inner_text("#app") and "Vote with me" not in tv.inner_text("#tvapp"))
    vi = L[0]; victim = NAMES[vi]
    for f in F: until(lambda: phones[f].locator(f"[data-a=pick]:has-text('{victim}')").count(), 10); phones[f].click(f"[data-a=pick]:has-text('{victim}')")
    for i, q in enumerate(phones):
        if i not in F and i != ti:
            if until(lambda: q.locator("[data-a=sleep]").count(), 10): q.click("[data-a=sleep] >> nth=0")
    check("dawn: the victim learns first, in secret", until(lambda: "You were poisoned" in phones[vi].inner_text("#app")) and victim not in tv.inner_text("#tvapp"))
    host.click("[data-a=cont]"); check("the host reveals the night", until(lambda: f"{victim} was poisoned" in tv.inner_text("#tvapp")))
    host.click("[data-a=cont]")
    check("round two opens with the Starter", until(lambda: "The Starter" in host.inner_text("#app")))

    # the tools: skip a step, someone leaves, the roles behind three confirmations
    host.click("[data-a=tools]"); until(lambda: host.locator("[data-a=tool][data-v=skipStep]").count())
    host.click("[data-a=tool][data-v=skipStep]"); check("Tools: skip the Starter", until(lambda: "The Starter" not in host.inner_text("#app") and "Next:" in host.inner_text("#app")))
    host.click("[data-a=tools]"); host.click("summary:has-text('Take someone out')")
    gone = [i for i in L if i not in (ti, vi)][-1]
    host.click(f"[data-a=tool][data-v=remove]:has-text('{NAMES[gone]}')")
    check("Tools: someone who left is taken out, without a word about their role", until(lambda: NAMES[gone] not in tv.inner_text("#tvapp")) and tv.inner_text("#tvapp").lower().count("loyal") == 1)
    check("…and their phone says they've left", until(lambda: "You’ve left the game" in phones[gone].inner_text("#app")))
    host.click("[data-a=tools]"); shot(host, "12-tools")
    check("Tools: no role shown on the tools screen", "Forsworn" not in host.inner_text("#app").replace("who was Forsworn", ""))
    host.click("[data-a=peek1]")
    check("…the roles after three confirmations", until(lambda: "Everyone’s role" in host.inner_text("#app") and host.inner_text("#app").count("Forsworn") >= 2))
    host.click("[data-a=unpeek]"); check("…and hidden again", until(lambda: "Everyone’s role" not in host.inner_text("#app")))

    # a lost phone asks back in
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}); lost = ctx2.new_page(); lost.on("pageerror", lambda e: errs.append(str(e)))
    li = [i for i in L if i not in (ti, vi, gone)][0]
    lost.goto(URL + "/m/" + code); lost.fill("#name", NAMES[li]); lost.click("[data-a=join]")
    check("a lost phone asks by name", until(lambda: "asking to come back in" in host.inner_text("#app")))
    host.click("[data-a=letin]")
    check("…but while their own phone is still connected, it can't be taken over", until(lambda: "still connected" in host.inner_text("#app"), 5))
    errs[:] = [e for e in errs if "409" not in e]  # the refusal above is a 409, as it should be
    phones[li].context.close(); time.sleep(21)  # the phone is really lost now
    until(lambda: host.locator("[data-a=letin]").count(), 10); host.click("[data-a=letin]")
    check("…once it's gone quiet, the host lets them in, and it's that player again", until(lambda: NAMES[li] in lost.inner_text(".top")))

    # the TV's narrator and sound
    tv.evaluate("() => { window.__said = []; Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], cancel() {}, speak(u) { __said.push(u.text) } } }); window.SpeechSynthesisUtterance = function (t) { this.text = t } }")
    tv.click("[data-a=narr]"); check("TV: the narrator reads the screen", until(lambda: tv.evaluate("__said.length") >= 1 and "Day" in tv.evaluate("__said[0]"), 5), tv.evaluate("__said"))
    tv.click("[data-a=sndtv]"); check("TV: sound starts with a tap", until(lambda: tv.evaluate("typeof AC !== 'undefined' && !!AC"), 5))

    # /admin: the Modern room, every role, the log, and the replay on a TV and the host's phone
    ad = b.new_context(viewport={"width": 1280, "height": 900}).new_page(); ad.on("pageerror", lambda e: errs.append("admin: " + str(e))); ad.goto(URL + "/admin"); ad.wait_for_timeout(800); ad.fill("#lu", "ryanab94.admin"); ad.fill("#lp", "testpw"); ad.click("#lf button"); ad.wait_for_timeout(1200)
    ad.click(".tabs [data-t=rooms]"); ad.wait_for_timeout(800); ad.click(f"#rrows tr:has-text('{code}')"); ad.wait_for_timeout(3500)
    body = ad.inner_text("#roomview")
    check("admin: the Modern room, its Forsworn, the host's look at the roles, and the log", all(x in body for x in ("The game (Modern)", "Forsworn", "yes, round 2", "left the party", "Casting Vote to Ryan")), body[:300])
    rtv = ad.frame_locator(".tvbox iframe").locator("#tvapp").inner_text(); rph = ad.frame_locator(".phbox iframe").locator("#app").inner_text()
    check("admin replay: the TV and the host's phone show the recorded game", len(rtv) > 20 and "Annie" in rph, [rtv[:80], rph[:80]])
    ad.locator(".scrub input[type=range]").evaluate("(r)=>{r.value=1;r.dispatchEvent(new Event('input'))}"); ad.wait_for_timeout(1500)
    check("admin replay: back to the start shows the lobby", code in ad.frame_locator(".tvbox iframe").locator("#tvapp").inner_text())
    shot(ad, "admin-room")

    wide = [i for i, q in enumerate(phones) if not q.is_closed() and q.evaluate("document.documentElement.scrollWidth") > q.viewport_size["width"]]
    check("no phone scrolls sideways (320px included)", not wide, wide)
    check("no page errors", not errs, errs[:5])
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
