# The public site on the real Worker: every page at four widths without sideways scrolling or console errors, the nav,
# the home page's code boxes on a phone, the buy page's consent and Pay button, and the rules page read once.
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: &
#   python3 qa/site.py http://127.0.0.1:8790/
import sys
from playwright.sync_api import sync_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/")
PAGES = ["/", "/buy", "/rules", "/tour", "/contact", "/terms", "/privacy", "/refunds", "/cookies"]
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(320, 640), (390, 844), (768, 1024), (1440, 900)]:
        pg = b.new_context(viewport={"width": w, "height": h}).new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        wide = []
        for u in PAGES:
            pg.goto(URL + u); pg.wait_for_timeout(300)
            if pg.evaluate("document.documentElement.scrollWidth") > w: wide.append(u)
        check(f"{w}px: no page scrolls sideways", not wide, wide)
        check(f"{w}px: no console errors", not errs, errs)
        pg.close()
    pg = b.new_context(viewport={"width": 390, "height": 844}).new_page()
    pg.goto(URL + "/"); pg.wait_for_timeout(400)
    fit = pg.evaluate("()=>{const i=document.querySelector('#pass'),c=document.createElement('canvas').getContext('2d'),s=getComputedStyle(i);c.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;return i.clientWidth-28>=c.measureText('XXXX-XXXX-XXXX').width+14*parseFloat(s.letterSpacing||0)}")
    check("home, phone: the whole Invitation code fits its box", fit)
    order = pg.evaluate("()=>[...document.querySelectorAll('main h2')].map(x=>x.textContent)")
    check("home: the pitch and the price come before the code boxes", order.index("Open your Table") > order.index("One code. The whole evening."), order)
    pg.click("text=manage your subscription"); pg.wait_for_timeout(200)
    check("home: Manage subscription without a code asks for it", "Enter your Regular’s booking code" in pg.inner_text("#passmsg"))
    pg.goto(URL + "/rules"); pg.wait_for_timeout(300)
    check("rules: the Oath is described once", pg.inner_text("main").count("The night begins with the Oath") == 1)
    check("nav: the page you're on is marked", pg.locator("nav.top a[aria-current=page]").inner_text() == "How to play")
    pg.goto(URL + "/buy"); pg.wait_for_timeout(300)
    check("buy: the Pay button names the price", "£10" in pg.inner_text("#pay"))
    pg.click("#pay"); pg.wait_for_timeout(200)
    check("buy: Pay without the ticks says why and goes to the first box", "Tick both boxes" in pg.inner_text("#paymsg") and pg.evaluate("document.activeElement.id") == "c1" and pg.get_attribute("#c1", "aria-invalid") == "true")
    pg.check("#c1"); pg.click("#pay"); pg.wait_for_timeout(200)
    check("…then the second", pg.evaluate("document.activeElement.id") == "c2" and pg.get_attribute("#c1", "aria-invalid") is None)
    pg.check("#sub-plan") if pg.locator("#sub-plan").count() else pg.click("label.plan:has(input[value=sub])"); pg.wait_for_timeout(100)
    check("buy: the subscription's button says monthly, and its consent is fresh", "£20 a month" in pg.inner_text("#pay") and not pg.is_checked("#c2"))
    check("buy: no leftover 'pass' or 'room' in the customer's words", not any(w in pg.inner_text("main").lower() for w in (" pass ", " room")), pg.inner_text("main")[:200])
    pg.check("#c2"); pg.click("#pay"); pg.wait_for_timeout(1500)
    check("buy: with both ticks it asks the server (payments are off locally, so it explains)", pg.inner_text("#paymsg") != "" and "Tick" not in pg.inner_text("#paymsg"), pg.inner_text("#paymsg"))
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
