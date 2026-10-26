# A whole Modern game against bots on a local Worker, with the host played from here and the app showing the host's
# phone: the CI photographs the simulator at each new screen. The bots and the ten-second clocks of a test game
# (worker/src/modern.js, the master passcode's room) do the rest.
#   python3 ios/ci/drive.py http://127.0.0.1:8790 MASTERTEST --launch "CMD {room} {tok}" --shot "CMD {name}"
import argparse, json, random, subprocess, sys, time, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("base"); ap.add_argument("master")
ap.add_argument("--launch", default="", help="command to open the app as this host; {room} and {tok} are filled in")
ap.add_argument("--shot", default="", help="command to photograph the app; {name} is filled in")
ap.add_argument("--players", type=int, default=10)
ap.add_argument("--limit", type=float, default=900, help="seconds before giving up")
ap.add_argument("--rounds", type=int, default=0, help="stop once this many rounds are over (0: play to the end)")
a = ap.parse_args()

def call(path, body=None, tok=None):
    req = urllib.request.Request(a.base + path, method="POST" if body is not None else "GET", data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"X-Tok": tok} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return json.loads(e.read() or b"{}")

room = call("/api/games", {"pass": a.master})["room"]
made = call(f"/api/g/{room}/m/create", {"name": "Ryan", "pass": "", "test": True, "bots": a.players})
tok = made["tok"]
print("room", room, "host token", tok[:6] + "…", flush=True)
if a.launch: subprocess.run(a.launch.format(room=room, tok=tok), shell=True, check=True)
time.sleep(6)

def act(x):
    r = call(f"/api/g/{room}/m/act", x, tok)
    if r.get("error"): print("  refused", x, "→", r["error"], flush=True)
    return r.get("view")

seen, n, start, last = set(), 0, time.time(), None
while time.time() - start < a.limit:
    v = call(f"/api/g/{room}/m", tok=tok).get("view")
    if not v: time.sleep(1); continue
    me, ph, t = v["me"], v["phase"], v.get("trial") or {}
    it = t.get("item") or {}
    key = ph + "." + str(t.get("stage", "")) + str(t.get("i", "")) + str(it.get("stage", "")) + str(v.get("round"))
    if key != last:
        last = key; n += 1
        name = f"e2e-{n:02d}-{ph}" + (f"-{t.get('key')}-{t.get('stage')}" if t else "")
        time.sleep(2.5) # the app polls every 1.2 s
        if a.shot and key not in seen: subprocess.run(a.shot.format(name=name), shell=True)
        seen.add(key)
        print(f"{time.time() - start:6.1f}s  {name}  purse {v['pot']}", flush=True)
    if a.rounds and v.get("round", 0) > a.rounds:
        print("stopping after round", a.rounds, flush=True); sys.exit(0)
    others = [p for p in v["players"] if p["alive"] and p["id"] != me["id"]]
    if ph == "lobby": act({"a": "start"})
    elif ph == "oath" and not me.get("optIn"): act({"a": "optin", "v": "any"})
    elif ph == "roles" and not me.get("acked"): act({"a": "ack"})
    elif ph == "day": act({"a": "next"})
    elif ph == "trial":
        if t.get("stage") == "done": act({"a": "cont"})
        elif it.get("k") == "tempt" and it.get("stage") == "open" and me["alive"] and it.get("mine") is None: act({"a": "ans", "v": "purse"})
        elif it and it.get("stage") == "open": act({"a": "tool", "v": "skip"})
    elif ph == "break": act({"a": "brkEnd"})
    elif ph == "talk": act({"a": "tool", "v": "voteNow"})
    elif ph == "vote" and not v["vote"].get("mine") and others:
        cands = [p for p in others if p["id"] != v["vote"].get("immune") and (not v["vote"].get("revote") or p["id"] in v["vote"]["revote"])]
        if cands: act({"a": "ballot", "v": random.choice(cands)["id"]})
    elif ph == "reveal" and (v["reveal"].get("role") or v["reveal"].get("secret")): act({"a": "cont"})
    elif ph == "night" and me["alive"] and not v["night"].get("done"):
        if me.get("role") == "f": act({"a": "pick", "v": random.choice(me.get("targets") or [others[0]["id"]])})
        else: act({"a": "sleep"})
    elif ph == "dawn": act({"a": "cont"})
    elif ph == "trust" and me["alive"] and not v["trust"].get("mine") and not v["trust"].get("result"): act({"a": "trust", "v": "trust"})
    elif ph == "honour" and me.get("role") == "f" and me["alive"] and not v["honour"].get("mine"): act({"a": "honour", "v": "honour"})
    elif ph == "end":
        print("the end:", v["result"]["winner"], "win · prize", v["result"]["prize"], flush=True)
        if a.shot: time.sleep(2.5); subprocess.run(a.shot.format(name=f"e2e-{n + 1:02d}-end-final"), shell=True)
        sys.exit(0)
    time.sleep(1.5)
print("gave up at", last, file=sys.stderr); sys.exit(1)
