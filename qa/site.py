# The public site on the real Worker: every page at four widths without sideways scrolling or console errors, the nav,
# the home page's code boxes on a phone, the buy page's consent and Pay button, and the rules page read once.
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: [--var STRIPE_EGG_PROMO:promo_x] &
#   python3 qa/site.py http://127.0.0.1:8790/
import sys
from playwright.sync_api import sync_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/")
PAGES = ["/", "/buy", "/rules", "/tour", "/traitors-at-home", "/party-games-for-large-groups", "/contact", "/terms", "/privacy", "/refunds", "/cookies", "/seal"]
INDEXED = [u for u in PAGES if u != "/seal"]
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
    # the broken seal: the QR code in the home page's picture leads to /seal, which remembers 10% off for the buy page
    sp = b.new_context(viewport={"width": 390, "height": 844}).new_page(); sp.goto(URL + "/seal"); sp.wait_for_timeout(700)
    on = sp.evaluate("fetch('/api/egg').then(r=>r.json()).then(j=>j.on)")
    check("seal: the page names the reward, or says it isn't open", ("10% off" in sp.inner_text("main")) if on else ("isn’t open yet" in sp.inner_text("main")))
    if on:
        sp.click("#claim"); sp.wait_for_url("**/buy"); sp.wait_for_timeout(900)
        check("seal → buy: one party at £9, crossed out from £10, with the seal named", "£9" in sp.inner_text("#p1") and "£9" in sp.inner_text("#pay") and sp.is_visible("#eggnote"))
        sp.check("input[value=sub]"); sp.wait_for_timeout(100)
        check("…a Regular pays the usual £20, and the note says the seal is for one party", "£20 a month" in sp.inner_text("#pay") and "Regular plan" in sp.inner_text("#eggnote"))
    # search and AI answer engines: every indexable page has its own title and description, one h1, the canonical
    # address it is served at, and JSON-LD that parses; FAQ and HowTo JSON-LD must match the words on the page
    sp = b.new_context(viewport={"width": 1280, "height": 900}).new_page(); titles, descs = set(), set()
    for u in INDEXED:
        r = sp.goto(URL + u); sp.wait_for_timeout(150)
        m = sp.evaluate("""()=>({t: document.title, d: (document.querySelector('meta[name=description]')||{}).content||'', c: (document.querySelector('link[rel=canonical]')||{}).href||'',
          h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, og: !!document.querySelector('meta[property="og:image"]'),
          ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>s.textContent), text: document.body.textContent.replace(/\\s+/g,' ')})""")
        check(f"seo {u}: 200, a title of 60 or fewer and a description of 155 or fewer", r.status == 200 and 10 < len(m["t"]) <= 60 and 50 < len(m["d"]) <= 155, (r.status, m["t"], len(m["d"])))
        titles.add(m["t"]); descs.add(m["d"])
        check(f"seo {u}: canonical, one h1, en-GB, an OG image", m["c"] == "https://thebetrayal.co.uk" + u and m["h1"] == 1 and m["lang"] == "en-GB" and m["og"], (m["c"], m["h1"], m["lang"]))
        import json as _j
        try: ld = [_j.loads(x) for x in m["ld"]]; ok = bool(ld) or u == "/"
        except Exception as e: ld, ok = [], False
        check(f"seo {u}: JSON-LD parses", ok and ld, m["ld"][:1])
        items = [g for x in ld for g in (x.get("@graph") or [x])]
        types = {t for g in items for t in ([g["@type"]] if isinstance(g["@type"], str) else g["@type"])}
        if u != "/": check(f"seo {u}: a breadcrumb", "BreadcrumbList" in types, types)
        missing = []
        for g in items:
            if g["@type"] == "FAQPage":
                for q in g["mainEntity"]:
                    if q["name"] not in m["text"] or q["acceptedAnswer"]["text"] not in m["text"]: missing.append(q["name"])
            if g["@type"] == "HowTo":
                for st in g["step"]:
                    if st["text"] not in m["text"]: missing.append(st["name"])
        check(f"seo {u}: FAQ and HowTo JSON-LD say exactly what the page says", not missing, missing)
        if u == "/": check("seo /: Organization, WebSite, Product with both prices in GBP, FAQPage", {"Organization", "WebSite", "Product", "FAQPage"} <= types and sorted(o["price"] for g in items if g.get("offers") for o in g["offers"]) == ["10.00", "20.00"], types)
        if u == "/traitors-at-home": check("seo /traitors-at-home: HowTo and FAQPage, and it says it isn't affiliated", {"HowTo", "FAQPage"} <= types and "not affiliated with" in m["text"])
    check("seo: every page has its own title and description", len(titles) == len(INDEXED) and len(descs) == len(INDEXED))
    home = sp.goto(URL + "/"); ht = sp.content()
    check("seo: The Traitors is only a question on the home page, never its title", "Is it like The Traitors?" in ht and "Traitors" not in sp.title())
    import urllib.request as _u, urllib.error as _ue
    def get(path):
        class NoRedir(_u.HTTPRedirectHandler):
            def redirect_request(self, *a, **k): return None
        try: r = _u.build_opener(NoRedir).open(URL + path); return r.status, r.read().decode(), r.headers
        except _ue.HTTPError as e: return e.code, "", e.headers
    st, body, _ = get("/llms.txt"); check("geo: /llms.txt is served and names the price and players", st == 200 and "£10" in body and "8 to 24" in body, st)
    st, body, _ = get("/llms-full.txt"); check("geo: /llms-full.txt is served with the rules and guides", st == 200 and "Source: https://thebetrayal.co.uk/traitors-at-home" in body, st)
    st, body, _ = get("/robots.txt"); check("geo: robots.txt keeps the private paths out and blocks no AI crawler from the site", st == 200 and "Disallow: /admin" in body and "Disallow: /api/" in body and "GPTBot" in body and "\nDisallow: /\n" not in body, st)
    st, body, _ = get("/sitemap.xml"); check("seo: the sitemap lists every indexable page with a date, and not /seal", st == 200 and all(f"<loc>https://thebetrayal.co.uk{u}</loc><lastmod>" in body for u in INDEXED) and "/seal" not in body, st)
    st, _, h = get("/rules.html"); check("seo: /rules.html redirects to /rules", st == 301 and h.get("Location", "").endswith("/rules"), (st, h.get("Location")))
    st, _, h = get("/seal"); check("seo: /seal is noindex", "noindex" in (h.get("X-Robots-Tag") or ""), h.get("X-Robots-Tag"))
    sp.close()
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
