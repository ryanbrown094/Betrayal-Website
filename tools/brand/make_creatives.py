"""Render The Betrayal's ads, social images and print card with the brand fonts (needs playwright with Chromium, and segno).

    python3 tools/brand/make_creatives.py

Reads the fonts from worker/public/fonts and the logos from media/logos. Writes:
    media/launch/ads/0N-…-feed-1080x1350.png and -story-1080x1920.png   four Meta ads, two sizes each
    media/social/og-card.png (1200 × 630), square.png (1080 × 1080), story.png (1080 × 1920)
    media/social/avatar.png (1080 × 1080)   the secondary mark, the cracked seal, for profile pictures
    media/launch/print/host-your-own-card-A6.png and .pdf   the "You survived" table card with its QR code

Type follows the brand rule: Grenze Gotisch only in the wordmark (the outlined logo files), headings in IM Fell DW Pica
(its italic for spoken lines), body in Alegreya Sans, eyebrows in Alegreya Sans SC.
"""
import pathlib, tempfile, segno
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = ROOT / 'worker' / 'public' / 'fonts'
LOGOS = ROOT / 'media' / 'logos'
ADS = ROOT / 'media' / 'launch' / 'ads'
SOCIAL = ROOT / 'media' / 'social'
PRINT = ROOT / 'media' / 'launch' / 'print'
for d in (ADS, SOCIAL, PRINT):
    d.mkdir(parents=True, exist_ok=True)
SITE = 'thebetrayal.co.uk'
MARK = (LOGOS / 'the-betrayal-mark-rosegold.svg').read_text()
STACK = (LOGOS / 'the-betrayal-lockup-stacked-rosegold.svg').read_text()
SEAL = (LOGOS / 'the-betrayal-seal.svg').as_uri()

def f(n):
    return (FONTS / n).as_uri()

CSS = f"""
@font-face{{font-family:Grenze;src:url({f('GrenzeGotisch-n300_900-latin.woff2')});font-weight:300 900}}
@font-face{{font-family:Fell;src:url({f('IMFellDWPica-n400-latin.woff2')})}}
@font-face{{font-family:Fell;font-style:italic;src:url({f('IMFellDWPica-i400-latin.woff2')})}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n500-latin.woff2')});font-weight:500}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n700-latin.woff2')});font-weight:700}}
@font-face{{font-family:SansSC;src:url({f('AlegreyaSansSC-n700-latin.woff2')});font-weight:700}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{background:#09070A}}
.c{{position:relative;overflow:hidden;color:#E8D0C8;
   background:radial-gradient(ellipse 80% 55% at 50% 30%,#341B37 0%,#251428 30%,#130D14 62%,#09070A 100%);
   display:flex;flex-direction:column;align-items:center;text-align:center}}
.svgbox svg{{width:100%;height:auto;display:block}}
.eyebrow{{font-family:SansSC;font-weight:700;letter-spacing:.3em;text-transform:lowercase;color:#E6A58C}}
.h{{font-family:Fell;font-weight:400;line-height:1.02;letter-spacing:-.01em;
   background:linear-gradient(172deg,#F4C9B7 0%,#E6A58C 38%,#AE6249 78%,#763C29 100%);
   -webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.08em}}
.say{{font-family:Fell;font-style:italic;color:#E8D0C8;line-height:1.32;text-wrap:balance}}
.body{{font-family:Sans;font-weight:500;color:#E8D0C8;line-height:1.35}}
.foot{{font-family:Sans;font-weight:700;color:#AFA198;letter-spacing:.02em}}
.foot b{{color:#E6A58C;font-weight:700}}
.rule{{height:1px;background:linear-gradient(90deg,transparent,#AE6249,transparent)}}
ul.need{{list-style:none;font-family:Sans;font-weight:500;color:#E8D0C8}}
ul.need li{{padding:.42em 0;border-bottom:1px solid rgba(175,161,152,.18)}}
ul.need li:last-child{{border:0}}
.card{{border:1px solid rgba(230,165,140,.45);border-radius:18px;background:rgba(19,13,20,.72);
   box-shadow:0 30px 90px rgba(0,0,0,.55),0 0 60px rgba(230,165,140,.08);text-align:left}}
.label{{font-family:SansSC;font-weight:700;letter-spacing:.22em;text-transform:lowercase;color:#E6A58C}}
"""

SEALS = ['#d9b44a', '#8fb3d9', '#e0895a', '#7fbf94', '#b48fd0', '#e46a8c', '#5fb3a8', '#c9c35e', '#7aa6e0', '#e6a0c0']

def candle(lit=True, h=150):
    w = h * .42
    flame = ('<ellipse cx="30" cy="22" rx="30" ry="30" fill="url(#glow)"/>'
             '<path d="M30 6c6 9 9 15 9 21a9 9 0 0 1-18 0c0-6 3-12 9-21z" fill="#F6C98A"/>'
             '<path d="M30 16c3 5 4.5 8 4.5 11a4.5 4.5 0 0 1-9 0c0-3 1.5-6 4.5-11z" fill="#FFF3D6"/>') if lit else \
            '<path d="M30 40c-4-6 3-9-1-15" fill="none" stroke="#877E78" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'
    wax = '#EADBD2' if lit else '#4a4046'
    return (f'<svg viewBox="0 0 60 150" width="{w:.0f}" height="{h}"><defs><radialGradient id="glow">'
            '<stop offset="0" stop-color="#F6C98A" stop-opacity=".55"/><stop offset="1" stop-color="#F6C98A" stop-opacity="0"/></radialGradient></defs>'
            f'{flame}<line x1="30" y1="38" x2="30" y2="46" stroke="#2a2024" stroke-width="2"/>'
            f'<rect x="18" y="45" width="24" height="92" rx="3" fill="{wax}"/>'
            '<rect x="12" y="135" width="36" height="8" rx="2" fill="#AE6249"/></svg>')

def candles(n=10, out=(3, 6), h=150, gap=34):
    items = ''.join(f'<div style="margin:0 {gap/2}px">{candle(i not in out, h)}</div>' for i in range(n))
    return f'<div style="display:flex;align-items:flex-end;justify-content:center">{items}</div>'

def seal(letter, col, size=120, count=None):
    # a guest's seal as the TV draws it at the Reckoning (the initial is pressed in blackletter, as on the TV)
    badge = (f'<div style="position:absolute;right:-10px;top:-6px;background:#7A1439;color:#F4C9B7;font-family:Sans;font-weight:700;'
             f'font-size:{size*.3:.0f}px;line-height:1;padding:{size*.07:.0f}px {size*.13:.0f}px;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.5)">{count}</div>'
             if count else '')
    return (f'<div style="position:relative;width:{size}px;height:{size}px">'
            f'<svg viewBox="0 0 100 100" width="{size}" height="{size}">'
            f'<path d="M50 4c8 0 11 5 18 7s13 1 17 8-1 12 1 19 8 10 6 18-9 8-12 14-2 13-9 17-11-2-18 0-10 8-18 8-11-6-17-9-13-2-16-9 2-12 0-19-8-11-5-18 9-8 13-13 6-11 13-14 12-3 13-8z" fill="{col}"/>'
            f'<circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="3"/>'
            f'<text x="50" y="63" text-anchor="middle" font-family="Grenze" font-weight="600" font-size="38" fill="rgba(30,18,28,.62)">{letter}</text></svg>{badge}</div>')

FOOT = f'Best with 8–16 players &nbsp;·&nbsp; <b>Book a Table, £15</b> &nbsp;·&nbsp; {SITE}'

def pad(tall):
    return f"padding:{250 if tall else 90}px 70px {340 if tall else 70}px"

def oath(w, h):
    tall = h > 1500
    return f"""<div class=c style="width:{w}px;height:{h}px;{pad(tall)}">
      <div class=svgbox style="width:{110 if tall else 96}px">{MARK}</div>
      <div class=eyebrow style="font-size:26px;margin-top:28px">a dinner-party game</div>
      <div class=h style="font-size:{124 if tall else 112}px;margin-top:{40 if tall else 26}px">Everyone swore<br>an oath.</div>
      <div class=say style="font-size:{64 if tall else 56}px;margin-top:{34 if tall else 20}px;color:#F4C9B7">Not everyone meant it.</div>
      <div style="flex:1"></div>
      <div style="margin-bottom:{70 if tall else 44}px">{candles(9, (2, 6), 150 if tall else 128, 30 if tall else 26)}</div>
      <div class=rule style="width:640px;margin-bottom:26px"></div>
      <div class=foot style="font-size:30px">{FOOT}</div></div>"""

def keeper(w, h):
    tall = h > 1500
    return f"""<div class=c style="width:{w}px;height:{h}px;{pad(tall)}">
      <div class=eyebrow style="font-size:26px">for the host</div>
      <div class=h style="font-size:{112 if tall else 100}px;margin-top:20px">Your phone<br>runs the game.</div>
      <div class=say style="font-size:{40 if tall else 36}px;margin-top:26px;max-width:900px">Five questions to set up.<br>Every line to read. You just tap Next.</div>
      <div style="flex:1"></div>
      <div class=card style="width:{880 if tall else 820}px;padding:{46 if tall else 38}px 50px">
        <div class=label style="font-size:22px">say this</div>
        <div class=say style="font-size:{46 if tall else 40}px;margin-top:16px;border-left:3px solid #E6A58C;padding-left:26px">“Blindfolds on. Hands flat on the table. If you feel my hand on your shoulder, you are Forsworn.”</div>
        <div class=label style="font-size:22px;margin-top:30px;color:#8FA3B8">private · only you see this</div>
        <div class=body style="font-size:{30 if tall else 27}px;color:#AFA198;margin-top:10px">12 at the Table · 3 Forsworn · poison tonight</div></div>
      <div style="flex:1"></div>
      <div class=body style="font-size:{32 if tall else 29}px;margin-bottom:{44 if tall else 30}px;color:#E8D0C8">Rather play? Hand the phone to a friend to keep.</div>
      <div class=rule style="width:640px;margin-bottom:26px"></div>
      <div class=foot style="font-size:30px">{FOOT}</div></div>"""

def price(w, h):
    tall = h > 1500
    return f"""<div class=c style="width:{w}px;height:{h}px;{pad(tall)}">
      {'<div style="flex:1"></div>' if tall else ''}
      <div class=svgbox style="width:96px">{MARK}</div>
      <div class=h style="font-size:{124 if tall else 118}px;margin-top:26px;white-space:nowrap">Under £2 a guest.</div>
      <div class=say style="font-size:{40 if tall else 36}px;margin-top:22px">£15 books a Table for a party of eight or more.</div>
      <div class=eyebrow style="font-size:26px;margin-top:{80 if tall else 56}px">what you need</div>
      <ul class=need style="font-size:{42 if tall else 37}px;margin-top:18px;width:820px">
        <li>A TV and a laptop</li><li>The host’s phone</li>
        <li>A blindfold and a chalkboard each</li>
        <li>A prize worth betraying a friend for</li></ul>
      <div style="flex:1"></div>
      <div class=rule style="width:640px;margin-bottom:26px"></div>
      <div class=foot style="font-size:30px">No app &nbsp;·&nbsp; no accounts &nbsp;·&nbsp; <b>{SITE}</b></div></div>"""

def exile(w, h):
    tall = h > 1500
    names = 'ARTSMPJOHD'
    s = 140 if tall else 128
    ring = ''.join(seal(names[i], SEALS[i], s, count={2: 5, 5: 3, 8: 2}.get(i)) for i in range(10))
    return f"""<div class=c style="width:{w}px;height:{h}px;{pad(tall)}">
      <div class=eyebrow style="font-size:26px">the reckoning</div>
      <div class=h style="font-size:{118 if tall else 104}px;margin-top:20px">Who do you exile?</div>
      <div style="flex:1"></div>
      <div style="display:grid;grid-template-columns:repeat(5,{s}px);gap:{56 if tall else 40}px {40 if tall else 34}px">{ring}</div>
      <div style="flex:1"></div>
      <div class=say style="font-size:{40 if tall else 36}px;max-width:920px">Chalk a name. Turn the boards one by one.<br>Watch your friends’ faces as the count climbs.</div>
      <div style="height:{60 if tall else 40}px"></div>
      <div class=rule style="width:640px;margin-bottom:26px"></div>
      <div class=foot style="font-size:30px">{FOOT}</div></div>"""

def card(w, h):
    qr = segno.make(f'https://{SITE}/?utm_source=card&utm_medium=print', error='m')
    svg = qr.svg_inline(dark='#09070A', light='#E8D0C8', scale=10, border=2)
    return f"""<div class=c style="width:{w}px;height:{h}px;padding:130px 110px 110px">
      <div class=svgbox style="width:120px">{MARK}</div>
      <div class=h style="font-size:118px;margin-top:40px">You survived.</div>
      <div class=say style="font-size:50px;margin-top:30px">Or you didn’t.<br>Either way, it’s your turn to host.</div>
      <div style="width:470px;height:470px;margin-top:80px;padding:34px;border:2px solid rgba(230,165,140,.7);border-radius:18px;background:#E8D0C8">
        <div style="width:100%;height:100%">{svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></div>
      <div class=foot style="font-size:40px;margin-top:44px;color:#E8D0C8">{SITE}</div>
      <div style="flex:1"></div>
      <div class=foot style="font-size:34px"><b>Book a Table, £15</b> &nbsp;·&nbsp; best with 8–16 &nbsp;·&nbsp; no app</div></div>"""

def og(w, h):
    return f"""<div class=c style="width:{w}px;height:{h}px;padding:70px 80px;justify-content:center">
      <div class=svgbox style="width:720px">{STACK}</div>
      <div class=say style="font-size:44px;margin-top:40px">Everyone swore an oath. Not everyone meant it.</div></div>"""

def square(w, h):
    return f"""<div class=c style="width:{w}px;height:{h}px;padding:120px 80px 0">
      <div class=svgbox style="width:700px">{STACK}</div>
      <div class=say style="font-size:48px;margin-top:50px">Everyone swore an oath.<br>Not everyone meant it.</div>
      <div style="flex:1"></div>
      <div style="margin-bottom:-6px">{candles(9, (3,), 140, 32)}</div>
      <div style="width:calc(100% + 160px);height:40px;background:linear-gradient(#251428,#130D14);border-top:2px solid #763C29"></div></div>"""

def story(w, h):
    return f"""<div class=c style="width:{w}px;height:{h}px;padding:300px 80px 0">
      <div class=svgbox style="width:760px">{STACK}</div>
      <div class=eyebrow style="font-size:28px;margin-top:60px">the dinner-party game of loyalty and lies</div>
      <div class=say style="font-size:56px;margin-top:50px">Everyone swore an oath.<br>Not everyone meant it.</div>
      <div class=foot style="font-size:34px;margin-top:60px">{FOOT}</div>
      <div style="flex:1"></div>
      <div style="margin-bottom:-6px">{candles(8, (5,), 180, 30)}</div>
      <div style="width:calc(100% + 160px);height:60px;background:linear-gradient(#251428,#130D14);border-top:2px solid #763C29"></div></div>"""

def avatar(w, h):
    # the secondary mark for profile pictures: sized to sit inside the circle every platform crops to
    return f"""<div class=c style="width:{w}px;height:{h}px;justify-content:center;
      background:radial-gradient(circle at 50% 46%,#341B37 0%,#251428 34%,#130D14 62%,#09070A 100%)">
      <img src="{SEAL}" style="width:{w * .66:.0f}px;height:{w * .66:.0f}px;display:block;margin-left:{w * .02:.0f}px"></div>"""

with tempfile.TemporaryDirectory() as td:
    tmp = pathlib.Path(td) / 'render.html'

    def shoot(page, html, path, **kw):
        tmp.write_text(f'<!doctype html><meta charset=utf-8><style>{CSS}</style>{html}', encoding='utf-8')
        page.goto(tmp.as_uri(), wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.screenshot(path=str(path), **kw)

    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, fn in [('01-everyone-swore-an-oath', oath), ('02-your-phone-runs-the-game', keeper),
                         ('03-under-2-a-guest', price), ('04-who-do-you-exile', exile)]:
            for label, (w, h) in {'feed-1080x1350': (1080, 1350), 'story-1080x1920': (1080, 1920)}.items():
                pg = b.new_page(viewport={'width': w, 'height': h})
                shoot(pg, fn(w, h), ADS / f'{name}-{label}.png'); pg.close()
        for name, fn, (w, h) in [('og-card', og, (1200, 630)), ('square', square, (1080, 1080)),
                                 ('story', story, (1080, 1920)), ('avatar', avatar, (1080, 1080))]:
            pg = b.new_page(viewport={'width': w, 'height': h})
            shoot(pg, fn(w, h), SOCIAL / f'{name}.png'); pg.close()
        pg = b.new_page(viewport={'width': 1240, 'height': 1748})
        shoot(pg, card(1240, 1748), PRINT / 'host-your-own-card-A6.png')
        pg.pdf(path=str(PRINT / 'host-your-own-card-A6.pdf'), width='105mm', height='148mm',
               print_background=True, page_ranges='1', scale=105 / 1240 * 96 / 25.4)
        pg.close(); b.close()
print('done')
