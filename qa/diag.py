# Diagnostics end to end on the real Worker: a game is recorded save by save, the TV and phone send their trail and
# errors, "Report a problem" files a report with a snapshot and keeps the room, and /admin shows all of it (rooms with
# config, log, replay and device events; reports with the snapshot; the error log; Stripe events).
#   npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var SITE_PASSWORD: --var BUILD:$(cat worker/public/build.txt) &
#   python3 qa/diag.py http://127.0.0.1:8790/
import os, sys, json, urllib.request
from playwright.sync_api import sync_playwright
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/").rstrip("/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots", "diag"); os.makedirs(OUT, exist_ok=True)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra)[:300] if extra and not cond else ""))
    if not cond: fails.append(name)
def api(path, body=None):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None, headers={"Authorization": "Bearer dev", "Content-Type": "application/json"}, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req) as r: return json.loads(r.read())
NAMES = ["Annie", "Ryan", "Tom", "Sophie", "Marcus", "Priya", "Jess", "Oliver", "Hannah", "Dev"]
code = api("/api/admin/room", {})["room"]
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    host = b.new_context(viewport={"width": 390, "height": 844}).new_page(); host.on("pageerror", lambda e: errs.append(str(e)))
    tv = b.new_context(viewport={"width": 1280, "height": 720}).new_page()
    host.goto(URL + "/g/" + code + "#host"); tv.goto(URL + "/g/" + code); host.wait_for_timeout(1500)
    host.evaluate("(a)=>{setupDraft=Object.assign(SETUP0(),{names:a,pin:'4321'});submitSetup()}", "\n".join(NAMES)); host.wait_for_timeout(1500)
    host.evaluate("()=>{act(s=>{s.phase='day'},'Day');pickMission('quiz')}"); host.wait_for_timeout(1200)
    host.click("text=Adjust this Trial"); host.wait_for_timeout(300)
    host.evaluate("()=>setTimeout(()=>{throw new Error('diag test boom')},0)"); host.wait_for_timeout(300)
    tv.evaluate("()=>setTimeout(()=>{throw new Error('tv test boom')},0)"); tv.wait_for_timeout(300)
    host.evaluate("()=>flushEv()"); tv.evaluate("()=>flushEv()"); host.wait_for_timeout(800)
    # the phone's report
    host.click("#host .hstamp button.linkish"); host.wait_for_timeout(400)
    check("Report a problem opens a form over the game", host.locator("#report textarea#rp-what").count() == 1)
    host.click("#report .rp-send"); host.wait_for_timeout(200)
    check("…it won't send empty", "Tell us" in host.inner_text("#rp-msg"))
    host.fill("#rp-what", "The quiz brief looked wrong"); host.fill("#rp-mail", "host@example.com"); host.click("#report .rp-send"); host.wait_for_timeout(1500)
    ref = host.inner_text("#report")
    check("…and sends, with a reference", "Your report is in" in ref and "R-" in ref, ref)
    host.click("#report .rp-send"); host.wait_for_timeout(200)
    check("…then closes back to the game", host.locator("#report").count() == 0)
    # the TV has its own button
    tv.click("#repbtn"); tv.wait_for_timeout(300); tv.fill("#rp-what", "Candles flicker oddly"); tv.click("#report .rp-send"); tv.wait_for_timeout(1500)
    check("the TV can report too", "Your report is in" in tv.inner_text("#report"))

    reps = api("/api/admin/reports")["reports"]
    mine = [r for r in reps if r["room"] == code]
    check("both reports are listed, linked to the room", len(mine) == 2 and {r["host"] for r in mine} == {True, False}, mine)
    hr = [r for r in mine if r["host"]][0]
    full = api("/api/admin/report?id=" + hr["id"])
    check("the phone's report has the form, the email, a snapshot and its trail of taps", full["what"] == "The quiz brief looked wrong" and full["email"] == "host@example.com" and len(full["snap"]) > 1000 and any(c["k"] == "tap" and "Adjust this Trial" in c["m"] for c in full["crumbs"]), {k: full[k] for k in ("what", "email")})
    check("…and points at the save it was made at", full["rec"] >= 3, full["rec"])
    room = api(f"/api/admin/room/{code}/room")
    check("the room: full config, players and roles, the PIN-protected state", room["state"]["rules"]["rounds"] == 4 and len(room["state"]["players"]) == 10 and sum(1 for x in room["state"]["players"] if x["role"] == "cloak") == 2, room["state"]["rules"])
    check("…kept 90 days because of the reports", room["meta"].get("keepUntil", 0) > room["meta"]["expires"] and len(room["meta"].get("reports", [])) == 2, room["meta"])
    recs = api(f"/api/admin/room/{code}/recs")["recs"]
    check("every save is recorded, with its log line", len(recs) >= 3 and recs[0]["kind"] == "start" and "Game created" in recs[0]["line"] and any("Trial: Rapid Quiz" in (r["line"] or "") for r in recs), [(r["kind"], r["line"]) for r in recs][:5])
    st = api(f"/api/admin/room/{code}/rec?n=" + str(recs[-1]["n"]))
    check("a recorded save opens as the whole game", st.get("phase") == "mission" and st["mission"]["key"] == "quiz")
    evs = api(f"/api/admin/room/{code}/events")["events"]
    check("both devices sent their trail: screens, taps, errors", any(e["k"] == "view" and not e["host"] for e in evs) and any(e["k"] == "tap" and e["host"] for e in evs) and any(e["k"] == "error" and "tv test boom" in e["m"] for e in evs), len(evs))
    er = api("/api/admin/errors")["errors"]
    check("the master error log has both browsers' errors and the reports", any("diag test boom" in (e.get("msg") or "") and e.get("room") == code for e in er) and any("tv test boom" in (e.get("msg") or "") for e in er) and sum(1 for e in er if e.get("src") == "report" and e.get("room") == code) == 2, [e.get("msg") for e in er][:6])
    bad = urllib.request.Request(URL + "/api/report", data=b'{"what":""}', headers={"Content-Type": "application/json"}, method="POST")
    try: urllib.request.urlopen(bad); code400 = 200
    except urllib.error.HTTPError as e: code400 = e.code
    check("an empty report is refused", code400 == 400)

    # /admin: sign in, then each tab
    a = b.new_context(viewport={"width": 1280, "height": 900}).new_page(); a.on("pageerror", lambda e: errs.append("admin: " + str(e)))
    a.goto(URL + "/admin"); a.wait_for_timeout(800); a.fill("#lu", "ryanab94.admin"); a.fill("#lp", "testpw"); a.click("#lf button"); a.wait_for_timeout(1200)
    check("admin: the open reports are counted on the tab", a.inner_text("#repcnt").strip() not in ("", "0"))
    a.click(".tabs [data-t=rooms]"); a.wait_for_timeout(800); a.click(f"#rrows tr:has-text('{code}')"); a.wait_for_timeout(3500)
    a.click("details.devs > summary"); a.wait_for_timeout(300); body = a.inner_text("#roomview")
    check("admin room: config, players with roles, what happened, replay and device events (folded until opened)", all(x in body for x in ("Game plan (setup)", "Annie", "cloak", "What happened", "Replay", "What the devices saw", "tv test boom")), body[:200])
    tvt = a.frame_locator(".tvbox iframe").locator("#stage").inner_text(); pht = a.frame_locator(".phbox iframe").locator("#host").inner_text()
    check("admin replay: the TV and the phone show the recorded game", "Rapid Quiz" in tvt and "Rapid Quiz" in pht, [tvt[:80], pht[:80]])
    a.screenshot(path=os.path.join(OUT, "room.png"), full_page=True)
    a.locator(".scrub input[type=range]").evaluate("(r)=>{r.value=1;r.dispatchEvent(new Event('input'))}"); a.wait_for_timeout(1500)
    check("admin replay: back to the start shows the lobby", "Rapid Quiz" not in a.frame_locator(".phbox iframe").locator("#host").inner_text())
    a.click(".tabs [data-t=reports]"); a.wait_for_timeout(800); a.click(f"#reprows tr:has-text('{hr['id']}')"); a.wait_for_timeout(2500)
    snap = a.frame_locator(".snapbox iframe").locator("body").inner_text()
    check("admin report: the snapshot shows their screen", "Rapid Quiz" in snap, snap[:120])
    a.screenshot(path=os.path.join(OUT, "report.png"), full_page=True)
    a.click("text=Replay the game at this moment"); a.wait_for_timeout(3000)
    check("admin report → replay at that moment", not a.locator("#roomview").is_hidden() and "Rapid Quiz" in a.frame_locator(".phbox iframe").locator("#host").inner_text())
    a.click(".tabs [data-t=errors]"); a.wait_for_timeout(800)
    check("admin errors tab lists them", "diag test boom" in a.inner_text("#erows")); a.screenshot(path=os.path.join(OUT, "errors.png"), full_page=True)
    a.click(".tabs [data-t=stripe]"); a.wait_for_timeout(600)
    check("admin Stripe tab loads", a.inner_text("#hmsg") != "")
    a.click(".tabs [data-t=reports]"); a.click(f"#reprows tr:has-text('{hr['id']}')"); a.wait_for_timeout(1500); a.click("text=Mark resolved"); a.wait_for_timeout(1200)
    check("a report can be marked resolved", api("/api/admin/report?id=" + hr["id"])["status"] == "resolved")
    check("no page errors (other than the two thrown on purpose)", not [e for e in errs if "test boom" not in e], errs)
    b.close()
print("RESULT: " + ("CLEAN" if not fails else "FAILED " + str(len(fails))))
sys.exit(1 if fails else 0)
