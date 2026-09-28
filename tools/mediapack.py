# Builds the media pack: social images, palette files, the brand guidelines PDF, the home page's web images, and
# dist/Cloak-and-Candle-Media-Pack.zip. Needs media/logos (tools/brand.py) and media/screenshots (qa/media.py) first.
# Run from the repo root: python3 tools/mediapack.py
import os, json, shutil, zipfile
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath("."); M = os.path.join(ROOT, "media")
FONTS = open("src/fonts.css").read().replace("url(/fonts/", "url(file://" + ROOT + "/worker/public/fonts/")
for d in ("social", "palette", "web"): os.makedirs(os.path.join(M, d), exist_ok=True)

PALETTE = [("Ink", "#09070A"), ("Plum", "#130D14"), ("Velvet", "#251428"), ("Aubergine", "#341B37"), ("Ivory", "#E8D0C8"), ("Parchment", "#AFA198"), ("Smoke", "#877E78"),
           ("Blush", "#F4C9B7"), ("Rose-gold", "#E6A58C"), ("Copper", "#AE6249"), ("Deep copper", "#763C29"), ("Wine", "#C22961"), ("Oxblood", "#7A1439"), ("Verdigris", "#5FA88F"), ("Night steel", "#8FA3B8")]
json.dump({n: h for n, h in PALETTE}, open(f"{M}/palette/cloak-and-candle-palette.json", "w"), indent=2)
open(f"{M}/palette/cloak-and-candle-palette.css", "w").write(":root {\n" + "".join(f"  --candle-{n.lower().replace(' ', '-')}: {h};\n" for n, h in PALETTE) + "}\n")
open(f"{M}/palette/cloak-and-candle-palette.gpl", "w").write("GIMP Palette\nName: Cloak & Candle\nColumns: 5\n#\n" + "".join(f"{int(h[1:3],16):3d} {int(h[3:5],16):3d} {int(h[5:7],16):3d}\t{n}\n" for n, h in PALETTE))

BASE = f"""<!doctype html><meta charset=utf-8><style>{FONTS}
*{{box-sizing:border-box}} body{{margin:0;background:#09070a;color:#e8d0c8;font-family:'Alegreya Sans',sans-serif}}
.gold{{background:linear-gradient(176deg,#f4c9b7 8%,#e6a58c 40%,#ae6249 70%,#763c29);-webkit-background-clip:text;background-clip:text;color:transparent}}
.ey{{font:700 22px/1 'Alegreya Sans SC';letter-spacing:.34em;text-transform:uppercase;color:#e6a58c}}
.tag{{font:italic 400 34px/1.3 'IM Fell DW Pica';color:#afa198}}
</style>"""
def logo(name): return "file://" + M + "/logos/" + name + ".svg"
def shot(name): return "file://" + M + "/screenshots/" + name
SOCIAL = {
  "og-card": (1200, 630, f"""<div style="position:relative;width:1200px;height:630px;overflow:hidden;background:radial-gradient(900px 500px at 78% 30%,#2a1630,transparent 70%),#09070a">
    <img src="{shot('tv-07-table.jpg')}" style="position:absolute;right:-260px;top:40px;width:1000px;opacity:.55;-webkit-mask-image:linear-gradient(90deg,transparent,#000 45%);mask-image:linear-gradient(90deg,transparent,#000 45%)">
    <div style="position:absolute;left:72px;top:150px;width:560px"><div class="ey">a dinner-party game</div><img src="{logo('cloak-and-candle-lockup-horizontal-rosegold')}" style="width:520px;margin:26px 0 22px"><div class="tag">Every guest gets a candle.<br>Somebody is wearing a cloak.</div></div></div>"""),
  "square": (1080, 1080, f"""<div style="position:relative;width:1080px;height:1080px;overflow:hidden;background:radial-gradient(800px 600px at 50% 20%,#2a1630,transparent 70%),#09070a;text-align:center">
    <img src="{logo('cloak-and-candle-lockup-stacked-rosegold')}" style="width:560px;margin:120px auto 36px;display:block"><div class="tag" style="font-size:40px;padding:0 120px">One of you is wearing the cloak.</div>
    <img src="{shot('tv-12-murdered.jpg')}" style="position:absolute;left:90px;bottom:-40px;width:900px;border-radius:18px;opacity:.9;-webkit-mask-image:linear-gradient(transparent,#000 40%);mask-image:linear-gradient(transparent,#000 40%)"></div>"""),
  "story": (1080, 1920, f"""<div style="position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(900px 900px at 50% 10%,#2a1630,transparent 70%),#09070a;text-align:center">
    <div class="ey" style="margin-top:220px">a dinner-party game</div><img src="{logo('cloak-and-candle-lockup-stacked-rosegold')}" style="width:640px;margin:50px auto 40px;display:block">
    <div class="tag" style="font-size:46px;padding:0 120px">Trust no one. Not even the host who poured your wine.</div>
    <img src="{shot('tv-09-banished.jpg')}" style="position:absolute;left:-240px;bottom:180px;width:1560px;opacity:.85;-webkit-mask-image:radial-gradient(closest-side,#000 55%,transparent);mask-image:radial-gradient(closest-side,#000 55%,transparent)">
    <div class="ey" style="position:absolute;left:0;right:0;bottom:150px;color:#e8d0c8">4–14 players · your TV · one phone</div></div>"""),
  "palette": (1600, 900, "<div style='padding:70px;display:grid;grid-template-columns:repeat(5,1fr);gap:24px'>" + "".join(f"<div><div style='height:150px;border-radius:14px;background:{h};border:1px solid rgba(255,255,255,.08)'></div><div style='margin-top:10px;font:700 22px Alegreya Sans'>{n}</div><div style='font:400 18px Alegreya Sans;color:#877e78'>{h}</div></div>" for n, h in PALETTE) + "</div>"),
}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for name, (w, h, html) in SOCIAL.items():
        tmp = f"{M}/src/_{name}.html"; open(tmp, "w").write(BASE + f"<body style='width:{w}px;height:{h}px'>" + html)
        pg.set_viewport_size({"width": w, "height": h}); pg.goto("file://" + tmp); pg.wait_for_timeout(900)
        pg.screenshot(path=f"{M}/{'palette' if name == 'palette' else 'social'}/{'cloak-and-candle-palette' if name == 'palette' else name}.png"); os.remove(tmp)
    # the brand guidelines
    g = open(f"{M}/src/guidelines.html").read().replace("/*__FONTS__*/", FONTS)
    tmp = f"{M}/src/_guidelines.html"; open(tmp, "w").write(g)
    pg.goto("file://" + tmp); pg.wait_for_timeout(1500)
    pg.pdf(path=f"{M}/Cloak-and-Candle-Brand-Guidelines.pdf", width="297mm", height="210mm", print_background=True, prefer_css_page_size=True); os.remove(tmp)
    b.close()

# web images for the home page (worker/public/media via build.sh)
Image.open(f"{M}/screenshots/tv-07-table.jpg").convert("RGB").resize((1600, 900), Image.LANCZOS).save(f"{M}/web/tv-table.jpg", quality=84, optimize=True, progressive=True)
shutil.copy(f"{M}/social/og-card.png", f"{M}/web/og-card.png")

# the zip
os.makedirs("dist", exist_ok=True); z = "dist/Cloak-and-Candle-Media-Pack.zip"
with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.write(f"{M}/README.md", "Cloak-and-Candle-Media-Pack/README.md")
    zf.write(f"{M}/Cloak-and-Candle-Brand-Guidelines.pdf", "Cloak-and-Candle-Media-Pack/Cloak-and-Candle-Brand-Guidelines.pdf")
    for d in ("logos", "screenshots", "social", "palette", "copy"):
        for f in sorted(os.listdir(f"{M}/{d}")): zf.write(f"{M}/{d}/{f}", f"Cloak-and-Candle-Media-Pack/{d}/{f}")
    for f in sorted(os.listdir("worker/public/fonts")): zf.write(f"worker/public/fonts/{f}", f"Cloak-and-Candle-Media-Pack/fonts/{f}")
print("media pack:", z, os.path.getsize(z) // 1024, "KB")
