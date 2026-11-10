# Modern's moments (src/modern.css "the moments", modern-ui.js moments()): what moves, and that it's safe. Plays the
# engine's moments (qa/motion-views.mjs) through the page's replay mode on a phone (390 and 320 wide) and the TV:
#   - only transform and opacity ever animate;
#   - a role turns over the same way for Forsworn and Loyal (a glance at a neighbour's phone gives nothing away), and a
#     poisoned player's phone shows no Ghost's chill before the table is told;
#   - a redraw carries a moment on from where it was instead of starting it again, and what goes on and on keeps its beat;
#   - the Purse counts up to its new sum; nothing scrolls sideways at 320 while things move;
#   - with prefers-reduced-motion (Playwright's reduced_motion="reduce"), nothing animates at all, every moment shows as
#     it ends, and the Purse jumps.
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: --var MASTER_PASS:MASTERTEST &
#   python3 qa/motion.py http://127.0.0.1:8790/
import sys, os, json, subprocess
from playwright.sync_api import sync_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = json.loads(subprocess.check_output(["node", os.path.join(ROOT, "qa", "motion-views.mjs")]))
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""), flush=True)
    if not cond: fails.append(name)
# every animated property on the page that isn't transform or opacity
OTHER = """() => document.getAnimations().flatMap(a => a.transitionProperty ? [a.transitionProperty]
  : a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))))
  .filter(p => p !== 'transform' && p !== 'opacity')"""
# what moves, as a glance would see it: each animation's name and timing, and what it moves
SHAPE = """() => document.getAnimations().map(a => { const e = a.effect, t = e.getTiming(), el = e.target;
  return [a.animationName || a.transitionProperty, t.duration, t.delay, el.tagName].join(' '); }).sort()"""
RUNNING = "() => document.getAnimations().filter(a => a.playState === 'running').length"
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def page(dev, w, h, motion=True):
        c = b.new_context(viewport={"width": w, "height": h}, reduced_motion="no-preference" if motion else "reduce"); pg = c.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL + "/modern.html#replay-" + dev); pg.wait_for_timeout(500)
        return pg
    show = lambda pg, k: pg.evaluate("v => replayShow(v)", V[k])

    # ---- with motion
    ph = page("host", 390, 844)
    shapes = {}
    for k in ("role-f", "role-l"):
        ph.reload(); ph.wait_for_timeout(300); show(ph, k); ph.click(".veil")
        check(f"{k}: the role's seal turns over (.fx-in, running)", ph.locator(".card.role.fx-in").count() == 1 and ph.evaluate(RUNNING) > 0)
        check(f"{k}: only transform and opacity animate", not ph.evaluate(OTHER), ph.evaluate(OTHER))
        shapes[k] = sorted(set(ph.evaluate(SHAPE)))  # the kinds of motion (a Forsworn's card has one more line, which rises like the rest)
    check("the turn is the same for Forsworn and Loyal (nothing to see from the next seat)", shapes["role-f"] == shapes["role-l"], [shapes["role-f"], shapes["role-l"]])
    ph.wait_for_timeout(300); ph.evaluate("() => { last = ''; draw(); }")
    ct = ph.evaluate("() => document.querySelector('.card.role .sigil svg').getAnimations()[0].currentTime")
    check("a redraw mid-turn carries it on rather than starting again", ct is not None and ct >= 250, ct)
    ph.wait_for_timeout(4200); ph.evaluate("() => { last = ''; draw(); }")
    check("…and once it has played, a redraw shows it as it ended (no .fx-in)", ph.locator(".card.role.fx-in").count() == 0)
    show(ph, "quiz-answer"); ph.wait_for_timeout(400); show(ph, "quiz-done")
    first = ph.inner_text(".meter span")
    ph.wait_for_timeout(2200)
    check("the Purse counts up to its new sum (meter and top bar)", first == "0 / 2000" and ph.inner_text(".meter span") == "500 / 2000" and ph.inner_text(".top .pot") == "Purse 500", [first, ph.inner_text(".meter span")])
    check("…the meter fills by transform", "scaleX" in ph.evaluate("() => document.querySelector('.meter i').style.transform"))
    show(ph, "reveal-wait"); ph.wait_for_timeout(300)
    rv = V["reveal-wait"]["host"]; said = " · ".join(next(q["name"] for q in rv["players"] if q["id"] == i) + " " + str(n) for i, n in rv["reveal"]["counts"])
    check("the exile: the votes come in one at a time (the same words)", ph.locator(".tallies.fx-in > span").count() == len(rv["reveal"]["counts"]) and ph.inner_text(".tallies") == said, [ph.inner_text(".tallies"), said])
    ph.evaluate("() => { last = ''; draw(); }")
    check("…and the waiting seal keeps its beat across a redraw", ph.evaluate("() => document.querySelector('.verdict.wait svg').getAnimations()[0].startTime") == 0)
    ph.wait_for_timeout(300); show(ph, "reveal-role")
    check("…then the seal turns to the role", ph.locator(".verdict.fx-in").count() == 1 and not ph.evaluate(OTHER), ph.evaluate(OTHER))
    ph.wait_for_timeout(500); show(ph, "reveal-words")
    ct = ph.evaluate("() => document.querySelector('.verdict svg').getAnimations()[0].currentTime")
    check("…and last words arriving don't stamp it again", ct is not None and ct >= 450, ct)
    show(ph, "night"); ph.wait_for_timeout(100)
    check("night falls: the sky darkens by opacity", ph.evaluate("() => document.body.classList.contains('night') && document.querySelector('.fx-night').getAnimations().length > 0") and not ph.evaluate(OTHER), ph.evaluate(OTHER))
    show(ph, "dawn-victim"); ph.wait_for_timeout(100)
    check("the poisoned learn first, and their phone shows no Ghost's chill before the table is told", "You were poisoned" in ph.inner_text("#app") and not ph.evaluate("document.body.classList.contains('ghostly')"))
    show(ph, "dawn"); ph.wait_for_timeout(100)
    check("dawn breaks: the night lifts and the light rises", ph.evaluate("() => document.body.classList.contains('dawn') && !document.body.classList.contains('night')") and not ph.evaluate(OTHER), ph.evaluate(OTHER))
    show(ph, "unmask"); ph.wait_for_timeout(200); show(ph, "end"); ph.wait_for_timeout(600)
    check("the winners: their light and embers", ph.evaluate("() => document.body.classList.contains('won') && document.querySelector('.fx-embers i').getAnimations().length > 0") and not ph.evaluate(OTHER), ph.evaluate(OTHER))
    ph.context.close()

    # ---- a tap the game hasn't heard yet: a secret choice shows it on every option alike, never only the one chosen
    sc = page("host", 390, 844)
    show(sc, "oath"); sc.evaluate("() => { window.fetch = () => new Promise(() => {}); }")  # the game never answers
    sc.click("[data-a=optin][data-v=yes]"); sc.wait_for_timeout(100)
    lit = sc.evaluate("() => [...document.querySelectorAll('[data-a=optin]')].map((b) => b.classList.contains('pressing'))")
    check("the Oath: a tap shows it's heard on every option alike, never which was chosen", lit == [True, True, True], lit)
    sc.context.close()

    # ---- 320 wide: nothing scrolls sideways while things move
    sm = page("host", 320, 640); wide = []
    for k, tap in (("role-f", True), ("reveal-role", False), ("end", False)):
        sm.reload(); sm.wait_for_timeout(300); show(sm, k)
        if tap: sm.click(".veil")
        for _ in range(12):
            if sm.evaluate("document.documentElement.scrollWidth") > 320: wide.append(k)
            sm.wait_for_timeout(100)
    check("320px: no sideways scroll at any point of a moment", not wide, sorted(set(wide)))
    sm.context.close()

    # ---- the TV
    tv = page("tv", 1280, 720)
    show(tv, "reveal-wait"); tv.wait_for_timeout(400); show(tv, "reveal-role"); tv.wait_for_timeout(100)
    check("TV: the exile's seal turns to the role, transform and opacity only", tv.locator(".verdict.fx-in").count() == 1 and not tv.evaluate(OTHER), tv.evaluate(OTHER))
    show(tv, "unmask"); tv.wait_for_timeout(300); show(tv, "end"); tv.wait_for_timeout(600)
    check("TV: the end's light and embers", tv.evaluate("() => document.body.classList.contains('won') && document.querySelectorAll('.fx-embers i').length === 18") and tv.evaluate(RUNNING) > 0 and not tv.evaluate(OTHER), tv.evaluate(OTHER))
    tv.context.close()

    # ---- reduced motion: nothing moves, everything shows as it ends
    for dev, w, h, steps in (("host", 390, 844, ["role-f", "quiz-answer", "quiz-done", "reveal-wait", "reveal-role", "night", "dawn", "unmask", "end"]), ("tv", 1280, 720, ["quiz-answer", "quiz-done", "reveal-wait", "reveal-role", "night", "dawn", "unmask", "end"])):
        rm = page(dev, w, h, motion=False); moving = []
        for k in steps:
            show(rm, k)
            if k == "role-f": rm.click(".veil")
            rm.wait_for_timeout(150)
            if rm.evaluate("document.getAnimations().length"): moving.append(k)
            if k == "quiz-done":
                check(f"reduced motion ({dev}): the Purse jumps to its sum", rm.inner_text(".meter span") == "500 / 2000", rm.inner_text(".meter span"))
            if k == "night":
                check(f"reduced motion ({dev}): night falls at once", rm.evaluate("getComputedStyle(document.querySelector('.fx-night')).opacity") == "1")
        hidden = rm.evaluate("() => [...document.querySelectorAll('.fx-in')].filter(e => getComputedStyle(e).opacity !== '1').length")
        check(f"reduced motion ({dev}): nothing animates through a whole evening's moments", not moving, moving)
        check(f"reduced motion ({dev}): every moment shows as it ends, nothing left hidden", hidden == 0 and rm.evaluate("getComputedStyle(document.querySelector('.fx-embers')).display") == "none", hidden)
        rm.context.close()
    check("no page errors", not errs, errs[:5])
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
