# Renders the crest as the home-screen and browser icons (worker/public/icon-180.png, icon-512.png).
# Run after changing ART.crest(): python3 tools/icons.py
import subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8719", "--directory", "worker/public"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 512, "height": 512})
    pg.goto("http://localhost:8719/play.html"); pg.wait_for_timeout(800)
    pg.evaluate("""() => { document.body.innerHTML = '<div id="ic" style="position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(circle at 50% 38%,#251428,#09070a 72%)"><div style="width:62%;height:72%;color:#e6a58c;filter:drop-shadow(0 0 18px rgba(233,130,100,.35))">' + ART.crest() + '</div></div>';
      document.querySelector('#ic svg').style.cssText = 'width:100%;height:100%' }""")
    pg.wait_for_timeout(300)
    for size in (512, 180):
        pg.set_viewport_size({"width": size, "height": size}); pg.wait_for_timeout(150)
        pg.screenshot(path=f"worker/public/icon-{size}.png")
    b.close()
srv.terminate()
print("icons written")
