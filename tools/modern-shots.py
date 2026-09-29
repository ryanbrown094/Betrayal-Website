# Screenshots of Modern for the site's tour page: a phone at 780 wide (390 at 2x) and the TV at 1280x720, as JPEGs in
# media/web/ (build.sh copies them to worker/public/media/). Rendered through the page's replay mode from real engine
# views (tools/modern-shots.mjs). Needs the built page: ./build.sh first.  python3 tools/modern-shots.py
import os, json, subprocess, sys, time, io
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, "media", "web"); PORT = 8751
V = json.loads(subprocess.check_output(["node", os.path.join(ROOT, "tools", "modern-shots.mjs")]))
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", os.path.join(ROOT, "worker", "public")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
def save(png, name, size):
    im = Image.open(io.BytesIO(png)).convert("RGB").resize(size, Image.LANCZOS); p = os.path.join(OUT, name)
    im.save(p, "JPEG", quality=80, optimize=True, progressive=True); print(name, os.path.getsize(p) // 1024, "KB")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
        ph.goto(f"http://localhost:{PORT}/modern.html#replay-host"); ph.wait_for_timeout(700)
        for k, extra in [("lobby", ""), ("role", "peek=true;last='';draw()"), ("quiz", ""), ("vote", ""), ("night", "")]:
            ph.evaluate("v => replayShow(v)", V[k]); ph.wait_for_timeout(150)
            if extra: ph.evaluate("() => {" + extra + "}"); ph.wait_for_timeout(150)
            ph.wait_for_timeout(450); save(ph.screenshot(), "tour-modern-phone-" + k + ".jpg", (780, 1688))
        tv = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
        tv.goto(f"http://localhost:{PORT}/modern.html#replay-tv"); tv.wait_for_timeout(700)
        for k in ["lobby", "quiz", "reveal"]:
            tv.evaluate("v => replayShow(v)", V[k]); tv.wait_for_timeout(600); save(tv.screenshot(), "tour-modern-tv-" + k + ".jpg", (1280, 720))
        b.close()
finally:
    srv.terminate()
