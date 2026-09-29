# Builds dist/The-Betrayal-Marketing-Pack.zip: everything a marketing pack needs, in one folder. The game's rules
# and numbers are taken from the built game itself (worker/public/play.html), so they always match what customers play.
# Run ./build.sh first. python3 tools/marketing-pack.py
import os, sys, csv, json, shutil, subprocess, time, zipfile, html, re
from html.parser import HTMLParser
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
NAME = "The-Betrayal-Marketing-Pack"; OUT = os.path.join("dist", NAME)
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
P = lambda *a: os.path.join(OUT, *a)
def cp(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)

# 1. the written guides (sources in media/copy)
for f, dst in [("media/copy/README-pack.md", "README.md"), ("media/copy/game-guide.md", "01-game/game-guide-INTERNAL.md"), ("media/copy/setup-guide.md", "01-game/setup-guide.md"),
               ("media/copy/glossary.md", "01-game/glossary-and-naming.md"), ("media/copy/press-kit.md", "03-copy/press-kit.md")]:
    cp(f, P(dst))

# 2. numbers and lists straight from the game
PORT = 8729
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", "worker/public"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); pg.goto(f"http://localhost:{PORT}/play.html#host"); pg.wait_for_timeout(1200)
        data = pg.evaluate("""() => {
          const table = [];
          for (let n = MINP; n <= MAXP; n++) {
            const names = Array.from({length: n}, (_, i) => 'P' + i).join('\\n'), d = settle(Object.assign(SETUP0(), { names })), [lo, hi] = roundsRange(n);
            const shape = R => [n, ...simPlan(n, R).map(r => r.start - r.exiles - r.kills)].join(' > ');
            const b = blades(d);
            table.push({ players: n, forsworn: defaults(n).t, most_forsworn: maxCloaks(n), fewest_rounds: lo, most_rounds: hi, recommended_rounds: d.rounds,
              players_left_each_round_fewest: shape(lo), players_left_each_round_most: shape(hi), recommended_hours: d.hours, estimated_length: aboutH(estMins(d, n)),
              casting_vote_round_when_on: b.blade, crown_round_when_on: b.champion, max_sanctuaries_at_once: Math.max(1, Math.floor(n / 4)) });
          }
          const missions = MISSIONS.filter(m => m.key !== 'custom').map(m => ({ key: m.key, title: m.title, kind: m.addon ? 'add-on' : m.kind === 'screen' ? 'at the table' : 'up on your feet', needs: NEEDS[m.key] || 'nothing', when: m.when, carries_a_prize: m.hasShield ? 'yes' : 'no', hidden_rounds: ROUNDED.includes(m.key) ? 'yes' : 'no', rules: m.addon ? m.rules : defRules(m) }));
          const banks = BANKDEFS.map(d => ({ bank: d.label, key: d.key, items: d.items().length }));
          const pick = (a, n) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / n)) === 0).slice(0, n);
          const samples = { quiz_easy: pick(QUIZ_E, 12), quiz_medium: pick(QUIZ_M, 12), quiz_brutal: pick(QUIZ_H, 12), closest_guess: pick(ESTIMATE, 12), most_likely_to: pick(LIKELY, 15), charades: pick(CHARADES, 15), hum_it: pick(SONGS, 15), pictionary: pick(PICTIONARY, 15), memory_wall: MEMSETS.slice(0, 3), side_quests: pick(QUESTS, 10) };
          return { table, missions, banks, samples, version: APPV, build: BUILD };
        }""")
        b.close()
finally:
    srv.terminate()
def wcsv(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
wcsv(P("01-game", "table-sizes.csv"), data["table"])
wcsv(P("01-game", "trials.csv"), data["missions"])
# Modern's Trials, as they are played on phones, straight from the Modern engine (worker/src/modern.js)
modern = json.loads(subprocess.check_output(["node", "--input-type=module", "-e",
    "import { TRIALS } from './worker/src/modern.js'; console.log(JSON.stringify(TRIALS))"], cwd=ROOT))
TEMPT = "One word, in secret, on your phone: PURSE, for the table, or SELF, for yourself. Exactly one SELF takes Sanctuary and the Purse grows. Nobody: the Purse grows double. Two or more: nobody gets it, and the Purse shrinks."
wcsv(P("01-game", "trials-modern.csv"), [{ "key": k, "title": t["title"], "carries_sanctuary": "yes" if t.get("prize") else "no", "needs_ghosts": "yes" if t.get("ghosts") else "no", "rules": t["rules"] } for k, t in modern.items()]
     + [{ "key": "tempt", "title": "The Temptation (once a game)", "carries_sanctuary": "yes", "needs_ghosts": "no", "rules": TEMPT }])
with open(P("01-game", "question-banks.md"), "w", encoding="utf-8") as f:
    total = sum(x["items"] for x in data["banks"])
    f.write("# Question banks\n\nEvery game draws from these, and nothing repeats within a game. Hosts can switch off any item that won’t suit their group.\n\n| bank | items |\n|---|---|\n")
    for x in data["banks"]: f.write(f"| {x['bank']} | {x['items']:,} |\n")
    f.write(f"| **total** | **{total:,}** |\n\n## Samples\n\nSpread evenly through each bank. Quiz and Closest Guess answers are included: don’t print them where players will see them.\n")
    s = data["samples"]
    for k, label in [("quiz_easy", "Rapid Quiz, easy"), ("quiz_medium", "Rapid Quiz, medium"), ("quiz_brutal", "Rapid Quiz, brutal"), ("closest_guess", "Closest Guess / Higher or Lower")]:
        f.write(f"\n### {label}\n\n" + "".join(f"- {q} — *{a}*\n" for q, a in s[k]))
    for k, label in [("most_likely_to", "Most Likely To"), ("charades", "Screen Charades"), ("hum_it", "Hum It"), ("pictionary", "Chalkboard Pictionary"), ("side_quests", "Forsworn Errands ({F} is a Loyal player’s name)")]:
        f.write(f"\n### {label}\n\n" + "".join(f"- {q}\n" for q in s[k]))
    f.write("\n### Memory Wall (three of the sets)\n\n" + "".join("- " + ", ".join(m) + "\n" for m in s["memory_wall"]))

# 3. the public website's words, as plain text (home page, rules, tour, FAQ)
class Text(HTMLParser):
    def __init__(self): super().__init__(); self.out = []; self.skip = 0
    def handle_starttag(self, t, a):
        if t in ("script", "style", "svg"): self.skip += 1
        if t in ("h1", "h2"): self.out.append("\n\n## " if t == "h2" else "\n\n# ")
        elif t == "h3": self.out.append("\n\n### ")
        elif t in ("p", "div", "section", "summary", "figcaption", "dt"): self.out.append("\n\n")
        elif t in ("li", "dd"): self.out.append("\n- ")
        elif t == "br": self.out.append("\n")
        elif t in ("a", "button"): self.out.append(" ")
    def handle_endtag(self, t):
        if t in ("script", "style", "svg"): self.skip -= 1
    def handle_data(self, d):
        if not self.skip: self.out.append(re.sub(r"\s+", " ", d))
def text_of(path, start=None):
    h = Text(); src = open(path, encoding="utf-8").read()
    if start: src = src[src.index(start):]
    h.feed(src); t = "".join(h.out); t = re.sub(r"\n[ \t]+", "\n", t); t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()
with open(P("03-copy", "website-copy.md"), "w", encoding="utf-8") as f:
    f.write("# The website's words\n\nTaken from the live pages (thebetrayal.co.uk). Reuse freely; keep facts in step with `01-game/`.\n\n---\n\n# Home page\n\n")
    home = text_of("site/index.html", "<body>"); cut = home.index("## Open your Table")
    f.write(home[:cut].rsplit("\n", 2)[0] + "\n\n" + text_of("site/index.html", '<div class="eyebrow">what you need</div>'))
    for name, title in [("rules", "How to play (/rules): player-safe, no spoilers"), ("tour", "A night of The Betrayal (/tour): screenshot captions")]:
        f.write(f"\n\n---\n\n# {title}\n\n" + text_of(f"site/pages/{name}.html"))

# 4. brand, screens, social
cp("media/The-Betrayal-Brand-Guidelines.pdf", P("02-brand", "The-Betrayal-Brand-Guidelines.pdf"))
cp("media/logos", P("02-brand", "logos")); cp("media/palette", P("02-brand", "palette"))
for f in os.listdir("worker/public/fonts"): cp(os.path.join("worker/public/fonts", f), P("02-brand", "fonts", "web", f))
cp("media/copy/fonts.md", P("02-brand", "fonts", "README.md")); cp("media/copy/OFL.txt", P("02-brand", "fonts", "OFL.txt"))
for f in ("icon-180.png", "icon-512.png"): cp(os.path.join("worker/public", f), P("02-brand", "app-icons", f))
# Modern first (everyone on their own phone), then Classic (the Keeper's phone and the TV)
for f in sorted(os.listdir("media/web")):
    if f.startswith("tour-modern-"): cp(os.path.join("media/web", f), P("04-screenshots", "modern", f[len("tour-modern-"):]))
for f in sorted(os.listdir("media/screenshots")):
    cp(os.path.join("media/screenshots", f), P("04-screenshots", "classic", "tv" if f.startswith("tv-") else "phone", f))
for f in sorted(os.listdir("media/web")):
    if f.startswith("tour-") and not f.startswith("tour-modern-"): cp(os.path.join("media/web", f), P("04-screenshots", "classic", "web-sized", f[5:]))
cp("media/social", P("05-social"))
cp("media/web/hero-modern.jpg", P("05-social", "hero-modern.jpg"))
cp("media/web/tv-table.jpg", P("05-social", "classic-tv-table.jpg"))
cp("media/launch", P("06-launch")); cp("media/copy/NEXT-STEPS.md", P("NEXT-STEPS.md"))

with open(P("VERSION.txt"), "w") as f: f.write(f"The Betrayal {data['version']} · build {data['build']} · made {time.strftime('%d %B %Y')}\n")
zp = os.path.join("dist", NAME + ".zip")
if os.path.exists(zp): os.remove(zp)
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
    for dp, _, fs in os.walk(OUT):
        for f in sorted(fs): full = os.path.join(dp, f); z.write(full, os.path.relpath(full, "dist"))
print(zp, round(os.path.getsize(zp) / 1e6, 1), "MB")
