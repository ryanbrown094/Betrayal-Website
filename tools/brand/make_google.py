"""Logo images for Google Ads: the crest and wordmark on the brand's plum, at every shape Google asks for.

    python3 tools/brand/make_crest.py     (once, for the crest)
    python3 tools/brand/make_google.py

Writes media/social/google/: 1.91:1 (1200x628), 1:1 (1200x1200), 4:5 (960x1200), 9:16 (1080x1920) and the 4:1
landscape logo (1200x300), plus dist/The-Betrayal-Google-Logos.zip.
"""
import pathlib, tempfile, zipfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = ROOT / 'worker' / 'public' / 'fonts'
LOGOS = ROOT / 'media' / 'logos'
OUT = ROOT / 'media' / 'social' / 'google'
ZIP = ROOT / 'dist' / 'The-Betrayal-Google-Logos.zip'
CREST = (LOGOS / 'the-betrayal-crest.svg').as_uri()
WORD = (LOGOS / 'the-betrayal-wordmark-rosegold.svg').as_uri()

CSS = f"""
@font-face{{font-family:SansSC;src:url({(FONTS / 'AlegreyaSansSC-n700-latin.woff2').as_uri()});font-weight:700}}
@font-face{{font-family:Fell;font-style:italic;src:url({(FONTS / 'IMFellDWPica-i400-latin.woff2').as_uri()})}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#09070A}}
.c{{display:flex;align-items:center;justify-content:center;overflow:hidden;
   background:radial-gradient(ellipse 75% 70% at 50% 45%,#3a1d3c 0%,#251428 36%,#130D14 66%,#09070A 100%)}}
.col{{flex-direction:column;text-align:center}}
.eb{{font-family:SansSC;font-weight:700;letter-spacing:.26em;text-transform:lowercase;color:#E6A58C}}
.say{{font-family:Fell;font-style:italic;color:#E8D0C8}}
img{{display:block}}
"""

def crest(h): return f'<img src="{CREST}" style="height:{h}px">'
def word(w): return f'<img src="{WORD}" style="width:{w}px">'

JOBS = {
    'the-betrayal-1.91x1-1200x628.png': (1200, 628, f"""<div class=c style="width:1200px;height:628px;gap:56px;padding:0 70px">
        {crest(470)}<div style="display:flex;flex-direction:column;align-items:flex-start;gap:26px">{word(600)}
        <div class=eb style="font-size:25px">the party game of loyalty and lies</div>
        <div class=say style="font-size:34px">Everyone swore an oath. Not everyone meant it.</div></div></div>"""),
    'the-betrayal-1x1-1200x1200.png': (1200, 1200, f"""<div class="c col" style="width:1200px;height:1200px;gap:46px">
        {crest(600)}{word(760)}</div>"""),
    'the-betrayal-4x5-960x1200.png': (960, 1200, f"""<div class="c col" style="width:960px;height:1200px;gap:40px">
        {crest(560)}{word(700)}<div class=eb style="font-size:26px">the party game of loyalty and lies</div></div>"""),
    'the-betrayal-9x16-1080x1920.png': (1080, 1920, f"""<div class="c col" style="width:1080px;height:1920px;gap:54px">
        {crest(760)}{word(820)}<div class=eb style="font-size:30px">the party game of loyalty and lies</div>
        <div class=say style="font-size:46px;margin-top:10px">Everyone swore an oath.<br>Not everyone meant it.</div></div>"""),
    'the-betrayal-4x1-1200x300.png': (1200, 300, f"""<div class=c style="width:1200px;height:300px;gap:40px">
        {crest(240)}{word(640)}</div>"""),
}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
        b = p.chromium.launch(); tmp = pathlib.Path(td) / 'g.html'
        for name, (w, h, html) in JOBS.items():
            pg = b.new_page(viewport={'width': w, 'height': h})
            tmp.write_text(f'<!doctype html><meta charset=utf-8><style>{CSS}</style>{html}', encoding='utf-8')
            pg.goto(tmp.as_uri(), wait_until='networkidle'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(200)
            pg.screenshot(path=str(OUT / name)); pg.close(); print(name)
        b.close()
    ZIP.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT.glob('*.png')):
            z.write(f, f'The-Betrayal-Google-Logos/{f.name}')
    print(ZIP.relative_to(ROOT), ZIP.stat().st_size // 1024, 'KB')
