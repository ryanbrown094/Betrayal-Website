# A Modern test game against bots, as the owner plays it: the master code on the home page, "Play against bots", then
# one phone taps through a whole game (the bots swear, vote, choose at night and trust by themselves; Trials score at
# random; every countdown is ten seconds). Also: the admin's test room offers Modern.
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: --var MASTER_PASS:MASTERTEST &
#   python3 qa/modern-bots.py http://127.0.0.1:8790/
import sys, time
from playwright.sync_api import sync_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/")
fails = []
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
    me = b.new_context(viewport={"width": 390, "height": 844}).new_page()
    me.on("pageerror", lambda e: errs.append(str(e))); me.on("dialog", lambda d: d.accept())
    me.goto(URL + "/"); me.fill("#pass", "MASTERTEST"); me.click("#go")
    check("the master code offers a Modern test against bots", until(lambda: me.locator(".mode:has-text('Modern test')").count() == 1))
    me.click(".mode:has-text('Modern test')")
    check("…which asks your name and how many players", until(lambda: "A test game against bots" in me.inner_text("#app")))
    me.fill("#name", "Ryan"); me.click("[data-a=create]")
    check("the lobby fills with seven bots", until(lambda: me.inner_text("#app").count("bot") >= 7 and "Test game" in me.inner_text("#app")))
    me.click("[data-a=start]")
    start = time.time(); seen = set(); stuck = 0; last = ""
    ORDER = ["[data-a=optin][data-v=any]", ".veil", "[data-a=ack]", "[data-a=ans][data-v=purse]", "[data-a=trust][data-v=trust]", "[data-a=honour][data-v=honour]",
             "[data-a=ballot]:not(.on)", "[data-a=pick]:not(.on)", "[data-a=sleep]", "[data-a=next]", "[data-a=cont]"]
    while time.time() - start < 600:
        t = me.inner_text("#app")
        if "The Loyal win" in t or "The Forsworn win" in t: break
        ph = me.evaluate("V && V.phase"); seen.add(ph)
        for sel in ORDER:
            loc = me.locator(sel)
            if loc.count():
                if sel.startswith("[data-a=ballot]") and me.evaluate("V.vote && V.vote.mine"): continue
                if sel.startswith("[data-a=pick]") and me.evaluate("V.me.mine && V.me.mine.length >= V.night.kills"): continue
                try: loc.first.click(timeout=2000)
                except Exception: pass
                break
        stuck = stuck + 1 if t == last else 0; last = t
        time.sleep(0.6)
    t = me.inner_text("#app"); took = int(time.time() - start)
    check(f"a whole test game ends by itself around one phone ({took}s)", "The Loyal win" in t or "The Forsworn win" in t, [me.evaluate("V && V.phase"), t[:200]])
    check("…through the Oath, a Trial, the Reckoning, the night and dawn", {"oath", "trial", "vote", "night", "dawn"} <= seen, seen)
    check("no page errors", not errs, errs[:5])

    # the admin's test room: Classic or Modern
    ad = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
    ad.goto(URL + "/admin"); ad.wait_for_timeout(800); ad.fill("#lu", "ryanab94.admin"); ad.fill("#lp", "testpw"); ad.click("#lf button"); ad.wait_for_timeout(1200)
    ad.click("#room"); ad.wait_for_timeout(1500)
    check("admin: a test room offers Modern against bots as well as Classic", "Modern against bots" in ad.inner_text("#rmsg") and "Keeper phone" in ad.inner_text("#rmsg"), ad.inner_text("#rmsg"))
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
