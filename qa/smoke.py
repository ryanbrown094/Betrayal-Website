# First smoke test: create a game from the host phone through the real setup form, watch the TV pick it up.
from playwright.sync_api import sync_playwright
import sys
URL="http://localhost:8714/"
NAMES=["Annie","Ryan","Tom","Sophie","Marcus","Priya","Jess","Oliver","Hannah","Dev","Claire","Ben"]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    errs=[]
    hc=b.new_context(viewport={"width":390,"height":844},device_scale_factor=2)
    host=hc.new_page(); host.on("pageerror",lambda e:errs.append("HOST "+str(e))); host.on("console",lambda m: m.type=="error" and errs.append("HOSTC "+m.text))
    host.on("dialog",lambda d:d.accept())
    host.goto(URL+"#host"); host.wait_for_timeout(1200)
    host.request.delete(URL+"api/state",headers={"X-Pin":"1234"})
    host.reload(); host.wait_for_timeout(1200)
    host.fill("#names","\n".join(NAMES)); host.fill("#pinset","1234")
    host.screenshot(path="qa/shots/h_setup.png",full_page=True)
    host.click("text=Start game"); host.wait_for_timeout(800)
    host.screenshot(path="qa/shots/h_lobby.png",full_page=True)
    tc=b.new_context(viewport={"width":1280,"height":720})
    tv=tc.new_page(); tv.on("pageerror",lambda e:errs.append("TV "+str(e))); tv.on("console",lambda m: m.type=="error" and errs.append("TVC "+m.text))
    tv.goto(URL); tv.wait_for_timeout(3500)
    tv.screenshot(path="qa/shots/tv_lobby.png")
    print("errors:",errs)
    b.close()
