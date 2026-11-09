# The host on another phone or browser (the Google app's, then Safari's), on the real Worker: entering the booking code
# again brings them back as the host once the old phone has gone quiet; while it's still open, the new one says so and
# keeps trying by itself. A Table waits for its game: its 48 hours haven't begun in the lobby.
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: --var MASTER_PASS:MASTERTEST &
#   ADMIN_TOKEN=dev python3 qa/host-back.py http://127.0.0.1:8790/
import json, os, sys, time
from playwright.sync_api import sync_playwright
U = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/") + "/"
ADMIN = os.environ.get("ADMIN_TOKEN", "dev"); fails = []
def check(n, c, x=""):
    print(("PASS " if c else "FAIL ") + n + ("" if c else " — " + str(x)[:400]), flush=True)
    if not c: fails.append(n)
def until(fn, secs=20):
    end = time.time() + secs
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.25)
with sync_playwright() as p:
    b = p.chromium.launch(); api = p.request.new_context(); H = {"Authorization": "Bearer " + ADMIN, "Content-Type": "application/json"}
    code = api.post(U + "api/admin/passes", headers=H, data=json.dumps({"count": 1, "note": "host-back", "email": "jo@example.com"})).json()["passes"][0]
    def host(ctx, first):
        pg = ctx.new_page(); pg.goto(U); pg.fill("#pass", code); pg.click("#go")
        if first: until(lambda: pg.locator(".mode").count() >= 2); pg.click(".mode:has-text('Modern')")
        else: until(lambda: "/m/" in pg.url)
        until(lambda: pg.locator("#name").count()); pg.fill("#name", "Jo"); pg.keyboard.press("Enter"); return pg
    a = b.new_context(viewport={"width": 393, "height": 657}); pa = host(a, True)
    check("the booking code opens a Table and Jo is the host, in the lobby", until(lambda: "You’re in" in pa.inner_text("#app") and "Tools" in pa.inner_text("#app")), pa.inner_text("#app")[:200])
    room = pa.url.rstrip("/").split("/")[-1]; info = api.get(U + "api/admin/roominfo?room=" + room, headers=H).json()
    check("the Table waits for its game: 48 hours to come, none begun", info["room"].get("startHours") == 48 and not info["room"].get("started"), info)
    c = b.new_context(viewport={"width": 393, "height": 657}); pc = host(c, False)
    check("the code again in another browser, the first still open: it says so", until(lambda: "still open on another phone" in pc.inner_text("#app")), pc.inner_text("#app")[:300])
    a.close()
    check("…the first closed: the second keeps trying by itself, and Jo is back in as the host", until(lambda: "You’re in" in pc.inner_text("#app") and "Tools" in pc.inner_text("#app"), 90), pc.inner_text("#app")[:300])
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
