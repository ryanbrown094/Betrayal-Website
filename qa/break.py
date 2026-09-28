# Break it: 100+ adversarial sims. Part 1 plays targeted games in the host page (story, every mission and shield choice,
# leavers in every phase, undo storms, rewinds, random games with a twist) and checks invariants after every tap, then
# replays every TV screen it reached at 1280x720 and 3840x2160. Part 2 attacks the sync and the hands: two phones at once,
# lost replies, offline taps, wipes, a wifi login page, rate limits, a new version mid-setup, holds cancelled every way.
# Own servers: static :8718 (part 1), node qa/server.mjs :8717 (part 2). Usage: python3 qa/break.py [part1|part2]
import sys, json, subprocess, time, os, urllib.request, random
from playwright.sync_api import sync_playwright
ONLY = sys.argv[1] if len(sys.argv) > 1 else ""
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
LIB = open(os.path.join(HERE, "break.js")).read()
API, STATIC = 8717, 8718
results = []  # (name, [fails])
def record(name, fails):
    results.append((name, fails))
    print(("PASS " if not fails else "FAIL ") + name + ("" if not fails else "  -> " + json.dumps(fails)[:600]), flush=True)

OVER = r"""(st) => { window.__noCards = true; state = st; lastKey = null; lastPhase = st.phase; renderTV();
  const out = [], sg = document.querySelector('#stage'), sr = sg.getBoundingClientRect();
  for (const el of sg.querySelectorAll('*')) { if (el.closest('svg') && el.nodeName !== 'svg') continue; const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (getComputedStyle(el).position === 'absolute' && el.closest('.rt,.ring,.rolecard')) continue;
    if (r.top < sr.top - 2 || r.bottom > sr.bottom + 2 || r.left < -1 || r.right > innerWidth + 1) { out.push((el.className || el.nodeName) + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' stage ' + Math.round(sr.top) + '..' + Math.round(sr.bottom)); break } }
  const rt = sg.querySelector('.rt'); if (rt) for (const el of rt.querySelectorAll('.nm,.chairseal')) { const r = el.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) { out.push('round table off-screen: ' + el.textContent); break } }
  if (document.documentElement.scrollHeight > innerHeight + 1) out.push('page scrolls vertically');
  const t = document.body.innerText; if (/undefined|NaN|\[object/.test(t)) out.push('tv text: ' + (t.match(/.{0,30}(undefined|NaN|\[object).{0,30}/) || [''])[0]);
  return out }"""
FREEZE = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}"

def part1(b):
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(STATIC), "--directory", os.path.join(ROOT, "worker/public")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    NAP(1)
    try:
        ctx = b.new_context(viewport={"width": 440, "height": 956})
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        # act() swallows a tap the state has moved past; in the sims every tap is on a fresh render, so one is a bug
        pg.on("console", lambda m: errs.append(m.text[:300]) if "stale tap ignored" in m.text else None)
        pg.goto(f"http://localhost:{STATIC}/play.html#host"); pg.wait_for_timeout(1200); pg.add_style_tag(content=FREEZE)
        pg.evaluate(LIB)
        n = pg.evaluate("()=>__B.count()")
        for i in range(n):
            e0 = len(errs)
            try: r = pg.evaluate(f"()=>__B.run({i})")
            except Exception as ex:
                record(f"story #{i}", [{"msg": "harness: " + str(ex)[:300]}]); pg.goto(f"http://localhost:{STATIC}/play.html#host"); pg.wait_for_timeout(1000); pg.evaluate(LIB); continue
            f = r["fails"] + [{"msg": "page error: " + x} for x in errs[e0:]]
            record(r["name"], f)
        samples = pg.evaluate("()=>__B.samples")
        # every TV screen reached, on the 720p preview and the 4K TV
        for w, h in ((1280, 720), (1440, 900), (3840, 2160)):  # 16:9, a MacBook mirrored (16:10), a 4K TV
            tv = b.new_page(viewport={"width": w, "height": h}); terr = []
            tv.on("pageerror", lambda e: terr.append(str(e)))
            tv.goto(f"http://localhost:{STATIC}/play.html"); tv.wait_for_timeout(1200); tv.add_style_tag(content=FREEZE)
            for size in ("large", "standard"):  # the TV text switch in the host's Menu
                bad = []
                for k, st in samples.items():
                    out = tv.evaluate(OVER, {**st, "tvText": size})
                    if out: bad.append({"view": k, "out": out[:2], "st": st})
                if bad:  # keep the failing states for a closer look
                    os.makedirs(os.path.join(HERE, "shots"), exist_ok=True)
                    json.dump([x.pop("st") for x in bad[:6]], open(os.path.join(HERE, "shots", f"break_fail_{w}x{h}_{size}.json"), "w"))
                    for x in bad: x.pop("st", None)
                record(f"every TV screen reached ({len(samples)}) fits {w}x{h}, {size} text", bad[:8] + [{"msg": "tv error: " + x} for x in terr[:3]])
            tv.close()
        ctx.close()
    finally:
        srv.kill()

# ---------------------------------------------------------------- part 2: sync, network, PIN, holds
srvp = None
def server():
    global srvp
    if srvp: srvp.kill(); srvp.wait()
    srvp = subprocess.Popen(["node", "qa/server.mjs", str(API)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try: urllib.request.urlopen(f"http://localhost:{API}/api/settings", timeout=1); return
        except Exception: NAP(0.1)
URL = f"http://localhost:{API}/"
PIN = "4821"; NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver"]
def server_state(pin=PIN):
    req = urllib.request.Request(URL + "api/state", headers={"X-Pin": pin})
    return json.loads(urllib.request.urlopen(req, timeout=3).read())
LIVE = []
def NAP(secs):
    pages = [p for p in LIVE if not p.pg.is_closed()]
    if pages: pages[-1].pg.wait_for_timeout(int(secs * 1000))
    else: time.sleep(secs)
class Phone:
    def __init__(self, b, host=True, init=None, vp=(440, 956)):
        LIVE.append(self)
        self.ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, has_touch=False)
        if init: self.ctx.add_init_script(init)
        self.pg = self.ctx.new_page(); self.errs = []; self.toasts = []
        self.pg.on("pageerror", lambda e: self.errs.append(str(e)))
        self.pg.goto(URL + ("#host" if host else "")); self.pg.wait_for_timeout(1300)
        # remember every toast shown
        if host: self.pg.evaluate("()=>{const t0=toast;window.__toasts=[];toast=(m,ms)=>{__toasts.push(m);t0(m,ms)}}")
    def ev(self, js, arg=None): return self.pg.evaluate(js, arg) if arg is not None else self.pg.evaluate(js)
    def st(self): return self.ev("()=>state && {ver:state.ver,vid:state.vid,gid:state.gid,phase:state.phase,pot:state.pot,title:state.brand&&state.brand.title,host:state.brand&&state.brand.host}")
    def toasts_(self): return self.ev("()=>window.__toasts||[]")
    def start(self, names=NAMES, pin=PIN):
        self.pg.fill("#names", "\n".join(names)); self.pg.fill("#pinset", pin); self.pg.click("text=Start game"); self.pg.wait_for_timeout(900)
    def unlock(self, pin=PIN):
        self.pg.fill("#pin", pin); self.pg.click("text=Unlock"); self.pg.wait_for_timeout(900)
    def close(self): self.ctx.close()
def nap(ph, secs): ph.pg.wait_for_timeout(int(secs * 1000))  # lets route handlers run, unlike time.sleep
def conv(phones, wait=2500):
    """every phone ends on the server's version"""
    nap(phones[0], wait / 1000)
    sv = server_state(); out = []
    for i, p in enumerate(phones):
        s = p.st()
        if not sv.get("state") and s: out.append(f"phone {i} still holds a game the server doesn't")
        elif sv.get("state") and (not s or s["vid"] != sv["state"]["vid"]): out.append(f"phone {i} on {s and s['vid']} but server on {sv['state']['vid']}")
    return out, sv.get("state")
ADV = "()=>{const b=[...document.querySelectorAll('#host .foot button')].find(x=>!x.disabled&&/primary|danger/.test(x.className));if(b)b.click()}"

def part2(b):
    SC = []
    def sc(name):
        def deco(fn): SC.append((name, fn)); return fn
        return deco

    def race(delay_ms):
        def fn():
            A = Phone(b); A.start(); B = Phone(b); B.unlock(); NAP(1.5)
            A.ev("()=>act(s=>{s.brand.title='From A'})")
            if delay_ms: NAP(delay_ms / 1000)
            B.ev("()=>act(s=>{s.brand.host='From B'})")
            f, sv = conv([A, B], 3000)
            both = sv and sv["brand"]["title"] == "From A" and sv["brand"]["host"] == "From B"
            told = [t for t in A.toasts_() + B.toasts_() if "Another phone moved first" in t]
            if not both and len(told) != 1: f.append(f"a change was lost without a word (title={sv and sv['brand']['title']}, host={sv and sv['brand']['host']}, toasts={told})")
            if delay_ms >= 1500 and not both: f.append("taps 1.5 s apart should both land")
            f += A.errs + B.errs; A.close(); B.close(); return f
        return fn
    for d in (0, 40, 150, 400, 900, 1600): sc(f"two phones tap {d} ms apart: both land, or the loser is told")(race(d))

    @sc("a burst of 25 taps on one phone: every one reaches the server")
    def _():
        A = Phone(b); A.start(); NAP(1)
        A.ev("()=>{for(let i=0;i<25;i++)act(s=>{s.pot+=1})}")
        f, sv = conv([A], 2500)
        if not sv or sv["pot"] != 25: f.append(f"server pot {sv and sv['pot']} not 25")
        if A.toasts_(): f.append("toasts: " + str(A.toasts_()))
        f += A.errs; A.close(); return f

    @sc("two phones, 40 taps, random gaps: everyone converges, nothing lost silently")
    def _():
        A = Phone(b); A.start(); B = Phone(b); B.unlock(); T1 = Phone(b, host=False, vp=(1280, 720)); NAP(1.2)
        rnd = random.Random(7); taps = []
        for ph in (A, B): ph.ev("()=>{const t0=toast;window.__tt=[];toast=(m,ms)=>{__tt.push(Date.now());t0(m,ms)}}")
        for i in range(40):
            ph = A if i % 2 else B
            t = ph.ev(f"()=>{{act(s=>{{s.qa=(s.qa||[]).concat(['t{i}'])}});return Date.now()}}"); taps.append((f"t{i}", ph, t))
            NAP(rnd.choice([0, 0.05, 0.2, 0.5, 1.1]))
        f, sv = conv([A, B], 3500)
        got = set(sv.get("qa") or [])
        for tid, ph, t in taps:
            if tid not in got and not [x for x in ph.ev("()=>__tt") if x >= t]: f.append(f"tap {tid} vanished and its phone was never told")
        if len(got) < 20: f.append(f"only {len(got)} of 40 taps landed")
        tvv = T1.ev("()=>state&&state.vid")
        if tvv != sv["vid"]: f.append("TV not on the latest version")
        f += A.errs + B.errs + T1.errs; A.close(); B.close(); T1.close(); return f

    @sc("a lost reply (the save arrived, the answer didn't): no false alarm, the next tap still lands")
    def _():
        A = Phone(b); A.start(); NAP(1)
        hit = {"n": 0}
        def h(route):
            if route.request.method == "PUT" and hit["n"] == 0:
                hit["n"] += 1; route.fetch(); route.abort()
            else: route.continue_()
        A.pg.route("**/api/state", h)
        A.ev("()=>act(s=>{s.pot+=5})"); NAP(2); A.ev("()=>act(s=>{s.pot+=1})")
        f, sv = conv([A], 2500)
        if sv["pot"] != 6: f.append(f"pot {sv['pot']} not 6")
        if A.toasts_(): f.append("false alarm: " + str(A.toasts_()))
        f += A.errs; A.close(); return f

    @sc("a lost reply with another tap queued behind it")
    def _():
        A = Phone(b); A.start(); NAP(1)
        hit = {"n": 0}
        def h(route):
            if route.request.method == "PUT" and hit["n"] == 0:
                hit["n"] += 1; route.fetch(); route.abort()
            else: route.continue_()
        A.pg.route("**/api/state", h)
        A.ev("()=>{act(s=>{s.pot+=5});setTimeout(()=>act(s=>{s.pot+=1}),100)}")
        f, sv = conv([A], 3500)
        if sv["pot"] != 6: f.append(f"pot {sv['pot']} not 6")
        if A.toasts_(): f.append("false alarm: " + str(A.toasts_()))
        f += A.errs; A.close(); return f

    def offline_taps(n, other):
        def fn():
            A = Phone(b); A.start(); B = Phone(b); B.unlock() if other else None; NAP(1.2)
            A.pg.route("**/api/state", lambda r: r.abort())
            for i in range(n): A.ev("()=>act(s=>{s.pot+=1})"); NAP(0.3)
            if other: B.ev("()=>act(s=>{s.brand.title='B moved'})"); NAP(0.8)
            A.pg.unroute("**/api/state"); f, sv = conv([A] + ([B] if other else []), 8000)
            told = [t for t in A.toasts_() if "Another phone" in t]
            if other and not (told or sv["pot"] == n): f.append("A's offline taps were dropped without a word")
            if other and sv["brand"]["title"] != "B moved": f.append("B's change was overwritten by A's stale copy")
            if not other and sv["pot"] != n: f.append(f"offline taps lost: pot {sv['pot']} not {n}")
            if not other and told: f.append("false 'another phone' alarm")
            f += A.errs; A.close(); B.close(); return f
        return fn
    sc("five taps while offline, then back: all of them reach the server")(offline_taps(5, False))
    sc("one tap while offline (the save that fails with a newer one waiting)")(offline_taps(2, False))
    sc("taps while offline and another phone moves meanwhile: no silent overwrite")(offline_taps(3, True))

    @sc("offline taps on the phone that didn't start the game (its base came from the server)")
    def _():
        A = Phone(b); A.start(); B = Phone(b); B.unlock(); NAP(1.5); A.close()
        B.pg.route("**/api/state", lambda r: r.abort())
        for i in range(4): B.ev("()=>act(s=>{s.pot+=1})"); NAP(0.4)
        B.pg.unroute("**/api/state"); f, sv = conv([B], 8000)
        if sv["pot"] != 4: f.append(f"pot {sv['pot']} not 4")
        if [t for t in B.toasts_() if "Another phone" in t]: f.append("false 'another phone' alarm")
        f += B.errs; B.close(); return f

    @sc("a game wiped on one phone can't be brought back by an offline phone")
    def _():
        A = Phone(b); A.start(); B = Phone(b); B.unlock(); NAP(1.2)
        B.pg.route("**/api/state", lambda r: r.abort()); B.ev("()=>act(s=>{s.pot+=3})"); NAP(0.5)
        A.ev("()=>{confirmNew();askGo()}"); NAP(1)
        B.pg.unroute("**/api/state"); NAP(7)
        f = []
        sv = server_state()
        if sv.get("state"): f.append("the wiped game came back")
        if B.st(): f.append("the offline phone still shows the old game")
        if not [t for t in B.toasts_() if "wiped" in t]: f.append("the offline phone wasn't told: " + str(B.toasts_()))
        if not B.ev("()=>!!document.querySelector('#names')"): f.append("the offline phone isn't back at setup")
        f += A.errs + B.errs; A.close(); B.close(); return f

    @sc("a wipe on one phone clears the other phone and the TV")
    def _():
        A = Phone(b); A.start(); B = Phone(b); B.unlock(); T1 = Phone(b, host=False, vp=(1280, 720)); NAP(1.2)
        A.ev("()=>{confirmNew();askGo()}"); NAP(3)
        f = []
        if B.st() or T1.ev("()=>!!state"): f.append("still showing the wiped game")
        if server_state().get("state"): f.append("server still has it")
        f += A.errs + B.errs + T1.errs; A.close(); B.close(); T1.close(); return f

    @sc("a wifi login page answering the poll: the phone says offline and keeps the game")
    def _():
        A = Phone(b); A.start(); NAP(1)
        A.pg.route("**/api/state", lambda r: r.fulfill(status=200, content_type="text/html", body="<html><body>Sign in to Hotel WiFi</body></html>") if r.request.method == "GET" else r.continue_())
        NAP(6.5)
        f = []
        if not A.ev("()=>offline()"): f.append("the login page counted as the server")
        if not A.st(): f.append("the game vanished")
        if not A.ev("()=>/offline|connection|reconnect/i.test(document.body.innerText)"): f.append("no offline notice on the phone")
        A.pg.unroute("**/api/state"); NAP(2.5)
        if A.ev("()=>offline()"): f.append("didn't recover")
        f += A.errs; A.close(); return f

    @sc("a wifi login page on the TV: it keeps the last screen")
    def _():
        A = Phone(b); A.start(); T1 = Phone(b, host=False, vp=(1280, 720)); NAP(1.5)
        T1.pg.route("**/api/state", lambda r: r.fulfill(status=200, content_type="text/html", body="<html>login</html>"))
        NAP(3); f = []
        if not T1.ev("()=>!!state"): f.append("TV dropped the game")
        f += A.errs + T1.errs; A.close(); T1.close(); return f

    @sc("rate-limited (429) before unlocking: no setup form offering to start over")
    def _():
        A = Phone(b); A.start(); NAP(0.8)
        # a phone with an out-of-date PIN on a network where guests have been guessing: its polls come back 429
        C = Phone(b, init="try{localStorage.setItem('cloaks-pin','9999')}catch(e){}")
        C.pg.route("**/api/state", lambda r: r.fulfill(status=429, body="Too many wrong PINs") if r.request.method == "GET" and r.request.headers.get("x-pin") else r.continue_())
        C.pg.reload(); C.pg.wait_for_timeout(3000)
        f = []
        if C.ev("()=>!!document.querySelector('#names')"): f.append("setup form shown while a game exists")
        f += A.errs + C.errs; A.close(); C.close(); return f

    @sc("a new version goes live mid-setup: the page reloads and the typed names survive")
    def _():
        A = Phone(b); hit = {"n": 0}
        def h(route):
            if route.request.method == "PUT" and hit["n"] == 0: hit["n"] += 1; route.fulfill(status=426, body="A new version is live")
            else: route.continue_()
        A.pg.route("**/api/state", h)
        A.pg.fill("#names", "\n".join(NAMES)); A.pg.fill("#pinset", PIN); A.pg.click("text=Start game"); A.pg.wait_for_timeout(2500)
        f = []
        v = A.ev("()=>{const n=document.querySelector('#names');return n?n.value:null}")
        if v is not None and "Annie" not in v: f.append("names lost after the reload: " + repr(v))
        if v is None and not A.st(): f.append("neither the form nor a game after the reload")
        f += A.errs; A.close(); return f

    @sc("a flaky server (a third of saves fail): 30 taps all land in the end")
    def _():
        A = Phone(b); A.start(); NAP(1); rnd = random.Random(3)
        def h(route):
            if route.request.method == "PUT" and rnd.random() < 0.33: route.fulfill(status=503, body="busy")
            else: route.continue_()
        A.pg.route("**/api/state", h)
        for i in range(30): A.ev("()=>act(s=>{s.pot+=1})"); NAP(rnd.choice([0, 0.1, 0.4]))
        f, sv = conv([A], 9000)
        if sv["pot"] != 30: f.append(f"pot {sv['pot']} not 30")
        if A.toasts_(): f.append("toasts: " + str(A.toasts_()))
        f += A.errs; A.close(); return f

    @sc("a slow network (700 ms each way): 15 taps, no false alarms")
    def _():
        A = Phone(b); A.start(); NAP(1)
        def h(route): time.sleep(0.7); route.continue_()
        A.pg.route("**/api/state", h)
        for i in range(15): A.ev("()=>act(s=>{s.pot+=1})"); NAP(0.15)
        f, sv = conv([A], 9000)
        if sv["pot"] != 15: f.append(f"pot {sv['pot']} not 15")
        if A.toasts_(): f.append("toasts: " + str(A.toasts_()))
        f += A.errs; A.close(); return f

    @sc("the TV polls with a tag: tiny 'same' replies when nothing changes, full ones when it does")
    def _():
        A = Phone(b); A.start(); T1 = Phone(b, host=False, vp=(1280, 720)); bodies = []
        T1.pg.on("response", lambda r: bodies.append(r) if "/api/state" in r.url else None)
        NAP(3); A.ev("()=>act(s=>{s.pot+=1})"); NAP(2.5)
        f = []; same = full = 0; leak = False
        for r in bodies:
            try: j = r.json()
            except Exception: continue
            if j.get("same"): same += 1
            elif j.get("state"): full += 1; leak = leak or "hostPin" in json.dumps(j)
        if not same: f.append("no 'same' replies")
        if not full: f.append("no full reply after a change")
        if leak: f.append("the TV was sent the PIN")
        if T1.ev("()=>state.pot") != 1: f.append("TV missed the change")
        f += A.errs + T1.errs; A.close(); T1.close(); return f

    @sc("the TV is never sent a hidden role, the PIN, the log, or an answer (a whole mission and night)")
    def _():
        A = Phone(b); A.start(); T1 = Phone(b, host=False, vp=(1280, 720)); seen = []
        T1.pg.on("response", lambda r: seen.append(r) if "/api/state" in r.url else None)
        A.ev("()=>{act(s=>{s.phase='day'});pickMission('quiz');startMission();startMission()}"); NAP(1.5)
        A.ev("()=>{act(s=>{s.phase='day';s.mission=null});pickMission('change');startMission();startMission()}"); NAP(1.5)
        A.ev("()=>{act(s=>{s.phase='day';s.mission=null});startNight();act(s=>{s.night.mode='convert'})}"); NAP(1.5)
        f = []
        for r in seen:
            try: j = r.json()
            except Exception: continue
            s = j.get("state")
            if not s: continue
            if "hostPin" in s or "log" in s or "prev" in s: f.append("PIN/log/prev on the wire")
            if any(p.get("role") for p in s["players"] if not p.get("revealed")): f.append("a hidden role on the wire")
            m = s.get("mission") or {}
            if "before" in m: f.append("What Changed original on the wire")
            for i, q in enumerate(m.get("qs") or []):
                if q and (i != m.get("qi") or (q["q"][1] and not m.get("shouter") and not m.get("showA"))): f.append("a quiz answer on the wire")
            if s.get("night") and s["night"].get("mode") == "convert": f.append("the kind of night on the wire before it starts")
        f = sorted(set(f)); f += A.errs + T1.errs; A.close(); T1.close(); return f

    @sc("a wrong PIN, then the right one with stray spaces")
    def _():
        A = Phone(b); A.start(); B = Phone(b); f = []
        B.unlock("0000")
        if not B.ev("()=>/Wrong PIN/.test(document.body.innerText)"): f.append("no wrong-PIN message")
        B.unlock("  " + PIN + " ")
        if not B.st(): f.append("the right PIN with spaces didn't unlock")
        f += A.errs + B.errs; A.close(); B.close(); return f

    @sc("nine wrong PINs: 'wait a minute', not a setup form")
    def _():
        A = Phone(b); A.start(); B = Phone(b); f = []
        for i in range(9): B.unlock(str(1000 + i))
        t = B.ev("()=>document.body.innerText")
        if "Too many" not in t and "wait" not in t.lower(): f.append("no rate-limit message: " + t[:200])
        if B.ev("()=>!!document.querySelector('#names')"): f.append("setup form shown")
        f += A.errs + B.errs; A.close(); B.close(); return f

    @sc("a browser that refuses storage (private mode): host still runs the game")
    def _():
        init = "(()=>{const bad={get(){throw new Error('SecurityError')}};try{Object.defineProperty(window,'localStorage',bad);Object.defineProperty(window,'sessionStorage',bad)}catch(e){}})()"
        A = Phone(b, init=init); A.start(); NAP(2.5); f = []
        if not A.st(): f.append("no game started")
        A.ev("()=>act(s=>{s.pot+=2})"); NAP(1.5)
        sv = server_state()
        if not sv.get("state") or sv["state"]["pot"] != 2: f.append("taps not saved")
        if not A.ev("()=>authed"): f.append("lost the host PIN")
        f += A.errs; A.close(); return f

    @sc("a PIN with a euro sign or emoji is refused at setup, inline")
    def _():
        A = Phone(b); A.pg.fill("#names", "\n".join(NAMES)); A.pg.fill("#pinset", "12€4"); A.pg.click("text=Start game"); A.pg.wait_for_timeout(800)
        f = []
        if A.st(): f.append("game started with an unsendable PIN")
        if not A.ev("()=>/plain keyboard symbols/.test(document.body.innerText)"): f.append("no inline message")
        A.pg.fill("#pinset", "🔑42"); A.pg.click("text=Start game"); A.pg.wait_for_timeout(600)
        if A.st(): f.append("game started with an emoji PIN")
        f += A.errs; A.close(); return f

    @sc("a PIN typed with spaces at setup is trimmed, and unlocks without them")
    def _():
        A = Phone(b); A.start(pin="  " + PIN + "  "); B = Phone(b); B.unlock(PIN); f = []
        if not B.st(): f.append("the trimmed PIN doesn't unlock")
        f += A.errs + B.errs; A.close(); B.close(); return f

    @sc("a phone reloaded mid-game comes back in, no PIN prompt")
    def _():
        A = Phone(b); A.start(); NAP(1); A.pg.reload(); A.pg.wait_for_timeout(2000); f = []
        if not A.st(): f.append("not back in the game")
        f += A.errs; A.close(); return f

    @sc("a TV that drops off for 8 s catches up")
    def _():
        A = Phone(b); A.start(); T1 = Phone(b, host=False, vp=(1280, 720)); NAP(1)
        T1.pg.route("**/api/state", lambda r: r.abort())
        for i in range(3): A.ev("()=>act(s=>{s.pot+=1})"); NAP(0.3)
        NAP(7); T1.pg.unroute("**/api/state"); f, sv = conv([A], 2500)
        if T1.ev("()=>state && state.vid") != sv["vid"]: f.append("TV didn't catch up")
        f += A.errs + T1.errs; A.close(); T1.close(); return f

    # ---- holds, with a real mouse (pointer events)
    # the exile reveal is a plain tap now; the final ceremony's seals keep the hold-for-drumroll
    def to_reveal(A):
        A.ev("()=>{startCeremony()}")
        A.pg.wait_for_timeout(600)
        return A.pg.locator("#host .foot button.hold").bounding_box()
    def hold_case(action):
        def fn():
            A = Phone(b); A.start(); T1 = Phone(b, host=False, vp=(1280, 720)); bb = to_reveal(A); f = []
            if not bb: return ["no hold button"]
            x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
            A.pg.mouse.move(x, y); A.pg.mouse.down(); A.pg.wait_for_timeout(700)
            if not A.ev("()=>!!(state.final2 && state.final2.roll)"): f.append("the hold didn't start the drums")
            f += action(A, x, y)
            f += A.errs + T1.errs; A.close(); T1.close(); return f
        return fn
    def rel(A, x, y):
        A.pg.mouse.up(); A.pg.wait_for_timeout(500)
        return [] if A.ev("()=>(state.final2.shown||[]).length===1 && !state.final2.roll") else ["release didn't reveal"]
    def cancel(A, x, y):
        A.ev("()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}))"); A.pg.wait_for_timeout(400)
        out = [] if A.ev("()=>(state.final2.shown||[]).length===0 && !state.final2.roll") else ["pointercancel revealed or left the drums rolling"]
        A.pg.mouse.up(); A.pg.wait_for_timeout(400)
        if A.ev("()=>(state.final2.shown||[]).length!==0"): out.append("the release after a cancel revealed anyway")
        return out
    def other_finger(A, x, y):
        A.ev("()=>document.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}))"); A.pg.wait_for_timeout(300)
        out = [] if A.ev("()=>(state.final2.shown||[]).length===0 && !!state.final2.roll") else ["another finger lifting ended the hold"]
        return out + rel(A, x, y)
    def blur(A, x, y):
        A.ev("()=>window.dispatchEvent(new Event('blur'))"); A.pg.wait_for_timeout(400)
        out = [] if A.ev("()=>(state.final2.shown||[]).length===0 && !state.final2.roll") else ["switching away didn't cancel the hold"]
        A.pg.mouse.up(); A.pg.wait_for_timeout(300); return out
    def hidden(A, x, y):
        A.ev("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))}"); A.pg.wait_for_timeout(400)
        out = [] if A.ev("()=>(state.final2.shown||[]).length===0 && !state.final2.roll") else ["locking the phone didn't cancel the hold"]
        A.ev("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false})}"); A.pg.mouse.up(); A.pg.wait_for_timeout(300); return out
    def timeout(A, x, y):
        A.pg.wait_for_timeout(15500)
        out = [] if A.ev("()=>(state.final2.shown||[]).length===0 && !state.final2.roll") else ["a 15 s hold didn't stop the drums"]
        A.pg.mouse.up(); A.pg.wait_for_timeout(400)  # the finger never left the button: letting go still reveals
        if A.ev("()=>(state.final2.shown||[]).length!==1"): out.append("letting go after a long hold didn't reveal")
        return out
    def swallow(A, x, y):
        A.pg.mouse.up(); A.pg.wait_for_timeout(120)
        log0 = A.ev("()=>state.log.length")
        A.pg.mouse.click(x, y); A.pg.wait_for_timeout(300)  # a second tap right away lands on the next button
        out = [] if A.ev("()=>state.log.length") == log0 and A.ev("()=>(state.final2.shown||[]).length===1") else ["a tap straight after the reveal hit the next button"]
        A.pg.wait_for_timeout(800); return out
    def stale_tap(A, x, y):
        # the stuck-hold bug: pointer lost off-screen, then a later tap anywhere must not reveal
        A.ev("()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}))"); A.pg.mouse.up(); A.pg.wait_for_timeout(1000)
        A.pg.mouse.click(10, 10); A.pg.wait_for_timeout(400)
        return [] if A.ev("()=>(state.final2.shown||[]).length===0") else ["a later tap elsewhere finished a dead hold"]
    for nm, fn in (("hold a seal, let go: it turns", rel), ("hold, the touch is cancelled: no reveal, drums stop", cancel), ("hold, a second finger lifts: the hold carries on", other_finger),
                   ("hold, switch app: cancelled", blur), ("hold, lock the phone: cancelled", hidden), ("hold for 16 s: the drums stop at 15 s, letting go still reveals", timeout),
                   ("the tap after a reveal doesn't hit the next button", swallow), ("a dead hold isn't finished by a later tap elsewhere", stale_tap)):
        sc(nm)(hold_case(fn))

    @sc("a seal turned from the keyboard (Enter); a second Enter straight after doesn't turn the next")
    def _():
        A = Phone(b); A.start(); to_reveal(A); A.pg.wait_for_timeout(900); A.pg.focus("#host .foot button.hold"); A.pg.keyboard.press("Enter"); A.pg.wait_for_timeout(250); A.pg.keyboard.press("Enter"); A.pg.wait_for_timeout(500)
        f = [] if A.ev("()=>state.phase==='final2' && (state.final2.shown||[]).length===1") else ["Enter didn't turn the seal, or the second Enter turned another: " + str(A.ev("()=>[state.phase, (state.final2.shown||[]).length]"))]
        f += A.errs; A.close(); return f

    @sc("hand the phone back: a quick tap doesn't, a proper hold does")
    def _():
        A = Phone(b); A.start()
        A.ev("()=>{act(s=>{s.phase='endvote';s.endvote={votes:{},order:null,revealed:0,count:null,result:null}});handoff={kind:'endvote',id:aliveOf(state)[0].id};renderHost()}"); A.pg.wait_for_timeout(300)
        A.pg.click("#host .sheet button.good"); A.pg.wait_for_timeout(300)
        bb = A.pg.locator("#host .sheet button.hold").bounding_box(); f = []
        if not bb: return ["no hand-back button"]
        x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        A.pg.mouse.click(x, y); A.pg.wait_for_timeout(300)
        if not A.ev("()=>!!handoff"): f.append("a quick tap handed the phone back")
        A.pg.mouse.move(x, y); A.pg.mouse.down(); A.pg.wait_for_timeout(900); A.pg.mouse.up(); A.pg.wait_for_timeout(300)
        if A.ev("()=>!!handoff"): f.append("a proper hold didn't hand it back")
        f += A.errs; A.close(); return f

    @sc("the survivors' seals in the final: hold one, only that one opens")
    def _():
        A = Phone(b); A.start(); f = []
        A.ev("()=>{startCeremony()}"); A.pg.wait_for_timeout(600)
        btn = A.pg.locator("#host button.hold").first
        if not btn.count(): return ["no seal to hold: " + A.ev("()=>document.querySelector('#host').innerText.slice(0,200)")]
        bb = btn.bounding_box(); x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        A.pg.mouse.move(x, y); A.pg.mouse.down(); A.pg.wait_for_timeout(800); A.pg.mouse.up(); A.pg.wait_for_timeout(500)
        n = A.ev("()=>(state.final2.shown||[]).length")
        if n != 1: f.append(f"{n} seals opened")
        f += A.errs; A.close(); return f

    for name, fn in SC:
        if ONLY and ONLY not in ("part2",) and ONLY not in name: continue
        server()
        try: f = fn()
        except Exception as ex: f = ["harness: " + str(ex)[:300]]
        record(name, f)

with sync_playwright() as p:
    b = p.chromium.launch()
    try:
        if ONLY in ("", "part1"): part1(b)
        if ONLY != "part1": part2(b)
    finally:
        b.close()
        if srvp: srvp.kill()
bad = [r for r in results if r[1]]
print(f"SIMS: {len(results)}  FAILED: {len(bad)}")
print("RESULT:", "CLEAN" if not bad else "PROBLEMS"); sys.exit(0 if not bad else 1)
