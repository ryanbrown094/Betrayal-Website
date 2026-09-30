"""The Instagram launch pack: a profile picture, the first feed posts (a single post, then a carousel of how a night works),
three stories, and a PDF guide with the order to post them in and the words to post with each.

    python3 tools/brand/make_crest.py        (once, for the crest)
    python3 tools/brand/make_instagram.py

Images are laid out at Instagram's 1080 width and saved at 1440 (its largest), using the Modern tour's screenshots
(media/web/tour-modern-*.jpg, which never show the secret twists). Writes media/social/instagram/ and
dist/The-Betrayal-Instagram.zip.
"""
import pathlib, shutil, tempfile, zipfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = ROOT / 'worker' / 'public' / 'fonts'
LOGOS = ROOT / 'media' / 'logos'
SHOTS = ROOT / 'media' / 'web'
OUT = ROOT / 'media' / 'social' / 'instagram'
ZIP = ROOT / 'dist' / 'The-Betrayal-Instagram.zip'
SITE = 'thebetrayal.co.uk'
CREST = (LOGOS / 'the-betrayal-crest.svg').as_uri()
WORD = (LOGOS / 'the-betrayal-wordmark-rosegold.svg').as_uri()
SCALE = 1440 / 1080

def f(n):
    return (FONTS / n).as_uri()

def shot(name):
    return (SHOTS / f'tour-modern-{name}.jpg').as_uri()

CSS = f"""
@font-face{{font-family:Fell;src:url({f('IMFellDWPica-n400-latin.woff2')})}}
@font-face{{font-family:Fell;font-style:italic;src:url({f('IMFellDWPica-i400-latin.woff2')})}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n500-latin.woff2')});font-weight:500}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n700-latin.woff2')});font-weight:700}}
@font-face{{font-family:SansSC;src:url({f('AlegreyaSansSC-n700-latin.woff2')});font-weight:700}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{background:#09070A}}
.c{{position:relative;overflow:hidden;color:#E8D0C8;display:flex;flex-direction:column;align-items:center;text-align:center;
   background:radial-gradient(ellipse 85% 50% at 50% 26%,#341B37 0%,#251428 32%,#130D14 64%,#09070A 100%)}}
.c::after{{content:"";position:absolute;inset:18px;border:1px solid rgba(230,165,140,.22);pointer-events:none}}
.eyebrow{{font-family:SansSC;font-weight:700;letter-spacing:.28em;text-transform:lowercase;color:#E6A58C}}
.h{{font-family:Fell;line-height:1.04;letter-spacing:-.01em;text-wrap:balance;
   background:linear-gradient(172deg,#F4C9B7 0%,#E6A58C 40%,#AE6249 80%,#763C29 100%);
   -webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.08em}}
.say{{font-family:Fell;font-style:italic;color:#E8D0C8;line-height:1.3;text-wrap:balance}}
.body{{font-family:Sans;font-weight:500;color:#D9C2BA;line-height:1.38;text-wrap:pretty}}
.body b{{color:#F4C9B7;font-weight:700}}
.foot{{font-family:Sans;font-weight:700;color:#AFA198;letter-spacing:.02em}} .foot b{{color:#E6A58C}}
.rule{{height:1px;background:linear-gradient(90deg,transparent,#AE6249,transparent)}}
.phone{{background:#150d16;border:1px solid rgba(230,165,140,.45);box-shadow:0 30px 80px rgba(0,0,0,.65),0 0 0 6px #0c080d inset;overflow:hidden}}
.phone .scr{{overflow:hidden}} .phone img{{width:100%;display:block}}
.tv{{background:#0c080d;border:1px solid rgba(230,165,140,.4);border-radius:14px;padding:10px;box-shadow:0 34px 90px rgba(0,0,0,.7)}}
.tv img{{width:100%;display:block;border-radius:6px}}
.num{{position:absolute;top:44px;right:52px;font-family:Sans;font-weight:700;font-size:26px;color:#877E78;letter-spacing:.08em}}
.facts{{display:flex;gap:0;font-family:Sans;font-weight:700;color:#E8D0C8}}
.facts span{{padding:0 26px;border-left:1px solid rgba(230,165,140,.45)}} .facts span:first-child{{border:0}}
.step{{display:grid;grid-template-columns:96px 1fr;gap:28px;align-items:center;text-align:left}}
.step .n{{font-family:Fell;font-size:88px;line-height:1;color:#E6A58C;text-align:center}}
"""

def phone(src, w, h=None):
    h = h or round(w * 1688 / 780)
    r, p = round(w * .13), round(w * .035)
    return (f'<div class=phone style="width:{w}px;border-radius:{r}px;padding:{p}px">'
            f'<div class=scr style="height:{h - 2 * p}px;border-radius:{r - p}px"><img src="{src}"></div></div>')

def tv(src, w):
    return f'<div class=tv style="width:{w}px"><img src="{src}"></div>'

def duo(tvsrc, phsrc, W=940, tvw=860, phw=250, phh=520):
    # the TV with a phone in front of it, bottom right
    tvh = round((tvw - 22) * 720 / 1280) + 22
    H = max(tvh + 90, phh + 40)
    return (f'<div style="position:relative;width:{W}px;height:{H}px">'
            f'<div style="position:absolute;left:0;top:0">{tv(tvsrc, tvw)}</div>'
            f'<div style="position:absolute;right:0;bottom:0">{phone(phsrc, phw, phh)}</div></div>')

def pair(a, b, w=330, h=620, gap=44):
    return f'<div style="display:flex;gap:{gap}px;align-items:flex-start">{phone(a, w, h)}<div style="margin-top:60px">{phone(b, w, h)}</div></div>'

def crest(w):
    return f'<img src="{CREST}" style="width:{w}px;display:block">'

def word(w):
    return f'<img src="{WORD}" style="width:{w}px;display:block">'

def candle(lit, h):
    w = h * .42
    flame = ('<ellipse cx="30" cy="22" rx="30" ry="30" fill="url(#gl)"/><path d="M30 6c6 9 9 15 9 21a9 9 0 0 1-18 0c0-6 3-12 9-21z" fill="#F6C98A"/>'
             '<path d="M30 16c3 5 4.5 8 4.5 11a4.5 4.5 0 0 1-9 0c0-3 1.5-6 4.5-11z" fill="#FFF3D6"/>') if lit else \
            '<path d="M30 40c-4-6 3-9-1-15" fill="none" stroke="#877E78" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'
    return (f'<svg viewBox="0 0 60 150" width="{w:.0f}" height="{h}"><defs><radialGradient id="gl"><stop offset="0" stop-color="#F6C98A" stop-opacity=".55"/>'
            f'<stop offset="1" stop-color="#F6C98A" stop-opacity="0"/></radialGradient></defs>{flame}'
            f'<rect x="18" y="45" width="24" height="92" rx="3" fill="{"#EADBD2" if lit else "#4a4046"}"/><rect x="12" y="135" width="36" height="8" rx="2" fill="#AE6249"/></svg>')

def candles(n, out, h, gap):
    return '<div style="display:flex;align-items:flex-end">' + ''.join(f'<div style="margin:0 {gap / 2}px">{candle(i not in out, h)}</div>' for i in range(n)) + '</div>'

FOOT = f'<b>Book a Table, £10</b> &nbsp;·&nbsp; {SITE}'
W, H, SH = 1080, 1350, 1920

# ---- feed post 1: the launch post ----
def post1(h=1350):
    q = h < 1200
    return f"""<div class=c style="width:{W}px;height:{h}px;padding:{'50px 60px 44px' if q else '70px 70px 60px'}">
      {crest(100 if q else 150)}<div style="height:{12 if q else 18}px"></div>{word(360 if q else 470)}
      <div class=say style="font-size:{36 if q else 44}px;margin-top:{16 if q else 26}px">Everyone swore an oath. Not everyone meant it.</div>
      <div style="height:{24 if q else 40}px"></div>{duo(shot('tv-reveal'), shot('phone-role'), W=800, tvw=680, phw=200, phh=390) if q else duo(shot('tv-reveal'), shot('phone-role'), tvw=800, phh=480)}
      <div class=body style="font-size:{25 if q else 29}px;margin-top:{22 if q else 40}px;max-width:900px">A party game where a few of your friends are secretly <b>Forsworn</b>, and the rest of the table has one evening to find them.</div>
      <div style="flex:1"></div>
      <div class=facts style="font-size:{24 if q else 27}px">{''.join(f'<span>{x}</span>' for x in ('8 to 24 players', 'A phone each, no app', 'About 3 hours'))}</div>
      <div class=rule style="width:620px;margin:{18 if q else 26}px 0 {16 if q else 22}px"></div><div class=foot style="font-size:{25 if q else 28}px">{FOOT}</div></div>"""

# ---- feed post 2: the carousel ----
def slide(n, total, eyebrow, title, text, visual, h=1350):
    q = h < 1200
    return f"""<div class=c style="width:{W}px;height:{h}px;padding:{'54px 64px 44px' if q else '70px 70px 60px'}">
      <div class=num>{n} / {total}</div>
      <div class=eyebrow style="font-size:{22 if q else 24}px;margin-top:6px">{eyebrow}</div>
      <div class=h style="font-size:{70 if q else 86}px;margin-top:{10 if q else 14}px">{title}</div>
      <div class=body style="font-size:{27 if q else 31}px;margin-top:{12 if q else 18}px;max-width:900px">{text}</div>
      <div style="flex:1"></div>{visual}<div style="flex:1"></div>
      <div class=foot style="font-size:24px;color:#877E78">{'Swipe for more &nbsp;→' if n < total else SITE}</div></div>"""

def V(q, t, p):
    return duo(shot(t), shot(p), W=840, tvw=760, phw=210, phh=420) if q else duo(shot(t), shot(p))

STEPS = [
    ('everyone joins', 'Scan the code', 'Guests scan the QR code on the TV, or go to <b>thebetrayal.co.uk/join</b> and type the Table code. No app and no accounts, just a name.',
     lambda q: V(q, 'tv-lobby', 'phone-join')),
    ('the oath', 'A secret for every phone', 'Each phone asks, privately, whether you’d like to be <b>Forsworn</b>. Then the roles arrive. A few of you are Forsworn; everyone else is <b>Loyal</b>.',
     lambda q: pair(shot('phone-oath'), shot('phone-role'), 250, 440, 36) if q else pair(shot('phone-oath'), shot('phone-role'))),
    ('the trials', 'Play for the Purse', 'Quizzes, word games, charades and more, timed and scored on your phones. Every win fills the <b>Purse</b>. The Forsworn lose on purpose, quietly.',
     lambda q: V(q, 'tv-quiz', 'phone-quiz')),
    ('the reckoning', 'Argue it out', 'Accuse whoever you like, then vote in secret on your phone. The exiled player’s role is shown to the whole table.',
     lambda q: V(q, 'tv-vote', 'phone-vote')),
    ('night and dawn', 'Heads down', 'Everyone taps a name, so nobody can tell who’s choosing. Only the Forsworn’s choice counts. By morning, someone is gone.',
     lambda q: V(q, 'tv-dawn', 'phone-night-loyal')),
    ('the end', 'The masks come off', 'When the last few trust each other, every role is shown. The Loyal win the Purse, or the Forsworn take what it fell short.',
     lambda q: V(q, 'tv-end', 'phone-end')),
]

def carousel(h=1350):
    q = h < 1200
    total = len(STEPS) + 2
    cover = f"""<div class=c style="width:{W}px;height:{h}px;padding:{'70px 70px 0' if q else '110px 70px 0'}">
      <div class=num>1 / {total}</div>{crest(190 if q else 260)}
      <div class=eyebrow style="font-size:{24 if q else 26}px;margin-top:{26 if q else 40}px">a party game for 8 to 24</div>
      <div class=h style="font-size:{84 if q else 98}px;margin-top:{12 if q else 18}px">How a night of<br>The Betrayal works</div>
      <div class=say style="font-size:{34 if q else 38}px;margin-top:{16 if q else 24}px">From the first scan to the last reveal.</div>
      <div class=foot style="font-size:{24 if q else 26}px;margin-top:{22 if q else 34}px;color:#877E78">Swipe &nbsp;→</div>
      <div style="flex:1"></div><div style="margin-bottom:-6px">{candles(9, (5,), 100 if q else 130, 32)}</div>
      <div style="width:calc(100% + 140px);height:36px;background:linear-gradient(#251428,#130D14);border-top:2px solid #763C29"></div></div>"""
    slides = [cover] + [slide(i + 2, total, e, t, x, v(q), h) for i, (e, t, x, v) in enumerate(STEPS)]
    slides.append(f"""<div class=c style="width:{W}px;height:{h}px;padding:{'70px 80px 50px' if q else '120px 80px 70px'}">
      <div class=num>{total} / {total}</div>{crest(130 if q else 200)}
      <div class=h style="font-size:{88 if q else 104}px;margin-top:{24 if q else 40}px">Book a Table</div>
      <div class=say style="font-size:{38 if q else 44}px;margin-top:10px">£10 for one party of 8 to 24</div>
      <div class=body style="font-size:{27 if q else 31}px;margin-top:{26 if q else 40}px;max-width:820px;text-align:left">
        <p style="margin-bottom:16px">Open it whenever you’re ready: it lasts 48 hours from the moment you start.</p>
        <p style="margin-bottom:16px">Everyone plays on their own phone. A TV is optional and puts on the show.</p>
        <p>Hosting often? Become a Regular for £20 a month and open a new Table whenever you like.</p></div>
      <div style="flex:1"></div>{word(330 if q else 420)}
      <div class=foot style="font-size:{30 if q else 34}px;margin-top:{14 if q else 22}px;color:#E8D0C8">{SITE}</div>
      <div class=foot style="font-size:24px;margin-top:10px;color:#877E78">link in bio</div></div>""")
    return slides

# ---- stories ----
def story1():
    return f"""<div class=c style="width:{W}px;height:{SH}px;padding:230px 70px 330px">
      {crest(250)}<div style="height:24px"></div>{word(560)}
      <div class=eyebrow style="font-size:26px;margin-top:30px">the party game of loyalty and lies</div>
      <div class=say style="font-size:52px;margin-top:34px">Everyone swore an oath.<br>Not everyone meant it.</div>
      <div style="flex:1"></div>{duo(shot('tv-lobby'), shot('phone-role'), W=940, tvw=860, phw=270, phh=560)}<div style="flex:1"></div>
      <div class=facts style="font-size:28px">{''.join(f'<span>{x}</span>' for x in ('8 to 24 players', 'A phone each', 'No app'))}</div></div>"""

def story2():
    rows = [('1', 'phone-join', 'Scan the code on the TV and type your name.'),
            ('2', 'phone-role', 'Swear the Oath. Your secret role arrives on your phone.'),
            ('3', 'phone-vote', 'Play the Trials, vote at the Reckoning, and try to survive the night.')]
    items = ''.join(f"""<div class=step style="grid-template-columns:90px 190px 1fr;margin:0 0 34px"><div class=n>{n}</div>{phone(shot(s), 190, 330)}
        <div class=body style="font-size:36px;color:#E8D0C8">{t}</div></div>""" for n, s, t in rows)
    return f"""<div class=c style="width:{W}px;height:{SH}px;padding:250px 80px 330px">
      <div class=eyebrow style="font-size:26px">how it works</div>
      <div class=h style="font-size:104px;margin-top:14px">Three steps to<br>trust nobody</div>
      <div style="flex:1"></div><div style="width:100%">{items}</div><div style="flex:1"></div>
      <div class=foot style="font-size:30px">{FOOT}</div></div>"""

def story3():
    return f"""<div class=c style="width:{W}px;height:{SH}px;padding:250px 80px 330px">
      {crest(300)}
      <div class=h style="font-size:118px;margin-top:50px">Book a Table</div>
      <div class=say style="font-size:50px;margin-top:10px">£10 for one party of 8 to 24</div>
      <div class=body style="font-size:34px;margin-top:40px;max-width:820px">Everyone plays on their own phone. Open it when you’re ready; it lasts 48 hours from the start.</div>
      <div style="flex:1"></div>
      <div class=foot style="font-size:40px;color:#E8D0C8">{SITE}</div>
      <div style="height:200px"></div>{candles(8, (2,), 150, 34)}</div>"""

def avatar():
    return f"""<div class=c style="width:{W}px;height:{W}px;justify-content:center;
      background:radial-gradient(circle at 50% 50%,#3a1d3c 0%,#251428 36%,#130D14 64%,#09070A 100%)">
      <img src="{CREST}" style="height:{W * .86:.0f}px;display:block"></div>"""

# ---- the guide ----
TAGS = '#partygames #gamesnight #socialdeduction #murdermysteryparty #partyideas #whodunnit #hostingideas #birthdayideas #mafiagame #werewolfgame #henpartyideas #christmaspartyideas'
CAP1 = f"""Everyone at the table swears an oath. A few of them don’t mean it.

The Betrayal is a party game for 8 to 24 people, played on your own phones. Each of you gets a secret role. A few of you are Forsworn, quietly working against everyone else, and the rest of the table has one evening to find them.

Book a Table for £10 at {SITE} (link in bio).

{TAGS}"""
CAP2 = f"""How a night of The Betrayal works, from the first scan to the last reveal. Swipe through.

Everyone plays on their own phone and the game runs itself, so all you need is your friends and a prize worth lying for.

Save this for your next party. {SITE} (link in bio)

{TAGS}"""
GUIDE = [
    ('Before you post: set up the profile', [
        ('Profile picture', '<code>profile-picture.png</code>. Instagram crops it to a circle; the crest is sized to fit.'),
        ('Name', 'The Betrayal'),
        ('Username', '@thebetrayal if it’s free, otherwise @thebetrayalgame or @thebetrayal.game'),
        ('Category', 'Games/Toys (or Board Game)'),
        ('Bio', 'The party game of loyalty and lies 🕯️<br>8 to 24 players, played on your phones<br>A few of you are secretly Forsworn<br>Book a Table ↓'),
        ('Website', SITE)]),
    ('Feed post 1: the launch post', [
        ('Image', '<code>post-1.png</code> (one image), from <code>1-feed-4x5</code> or <code>1-feed-1x1</code>'),
        ('Caption', CAP1.replace('\n', '<br>')),
        ('Alt text', 'The Betrayal crest above a TV showing an exile being revealed, and a phone showing a secret Forsworn role card.'),
        ('When', 'First, on launch day. An evening post (around 7 to 9pm) does best for party content.')]),
    ('Feed post 2: how a night works (carousel)', [
        ('Images', '<code>post-2-slide-1.png</code> to <code>post-2-slide-8.png</code>, in number order, as one post, all from the same folder'),
        ('Caption', CAP2.replace('\n', '<br>')),
        ('Alt text', 'Eight slides walking through a game of The Betrayal, with real screens from the TV and the phones: joining, the Oath, the Trials, the Reckoning, night, the end, and the price.'),
        ('When', 'A day or two after post 1. Pin both posts to the top of your profile (tap ⋯ on the post, then Pin to your profile).')]),
    ('Hashtags', [
        ('Use', 'Each caption already ends with twelve. Keep the first five first: if Instagram limits how many you can add, keep those.'),
        ('By season', 'Swap in #halloweenparty (October), #christmasparty and #officechristmasparty (November and December), #newyearseve (late December).'),
        ('By occasion', '#henparty #stagdo #birthdayparty #housewarming #uniparty #familygamesnight'),
        ('Avoid', 'Other brands’ names, above all TV shows such as The Traitors, and other games’ trade marks (Among Us, Cluedo). The Betrayal isn’t connected to any of them, and the tags invite takedowns.')]),
    ('Stories, in order', [
        ('Story 1', '<code>2-stories/story-1.png</code>. Add a poll sticker in the space below the picture: “Could you lie to your friends all night?” Yes / Absolutely not.'),
        ('Story 2', '<code>2-stories/story-2.png</code>. No stickers needed.'),
        ('Story 3', f'<code>2-stories/story-3.png</code>. Add a link sticker to https://{SITE} in the space between the web address and the candles.'),
        ('Keep them', 'After 24 hours, save all three to a Highlight called “How it works” so new visitors can find them.')]),
]

def guide_html():
    secs = ''.join(f'<h2>{t}</h2><table>' + ''.join(f'<tr><th>{k}</th><td>{v}</td></tr>' for k, v in rows) + '</table>' for t, rows in GUIDE)
    return f"""<style>
      @page{{size:A4;margin:16mm 16mm 18mm}}
      html,body{{background:#fff}} body{{color:#1b1119;font:10.5pt/1.5 Sans}}
      h1{{font:26pt/1.1 Fell;color:#763C29;margin:6mm 0 2mm}} h2{{font:15pt/1.2 Fell;color:#1b1119;margin:9mm 0 3mm;border-bottom:1px solid #e6a58c;padding-bottom:2mm}}
      .lede{{color:#5a4a50;font-size:11pt}} table{{width:100%;border-collapse:collapse}}
      th{{width:34mm;text-align:left;vertical-align:top;padding:2.2mm 4mm 2.2mm 0;font-weight:700;color:#AE6249}}
      td{{padding:2.2mm 0;vertical-align:top;border-bottom:1px solid #f0e2dc}} code{{font:9.5pt/1 monospace;background:#f6ece8;padding:.4mm 1.2mm;border-radius:1mm}}
      .order{{margin:4mm 0;padding:4mm 5mm;background:#faf3f0;border-left:3px solid #e6a58c}}</style>
      <img src="{(LOGOS / 'the-betrayal-lockup-horizontal-ink.svg').as_uri()}" style="height:13mm">
      <h1>Instagram launch pack</h1>
      <p class=lede>What to post, in what order, and the words to go with each. Every image is in this folder at Instagram’s full size (1440 pixels wide).</p>
      <div class=order><b>Sizes:</b> every feed image comes in two shapes. <code>1-feed-4x5</code> is portrait and takes up more of the screen, so use it unless you prefer square. <code>1-feed-1x1</code> is square. Pick one shape per post: a carousel must use the same shape for every slide. Stories are 9:16, the full phone screen.</div>
      <div class=order><b>The order:</b> set up the profile → feed post 1 → stories 1, 2, 3 on the same day → feed post 2 a day or two later.</div>
      {secs}"""

def render():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / '2-stories').mkdir(parents=True)
    jobs = [(OUT / 'profile-picture.png', avatar(), W, W)]
    for d, h in (('1-feed-4x5', H), ('1-feed-1x1', W)):
        (OUT / d).mkdir()
        jobs += [(OUT / d / 'post-1.png', post1(h), W, h)]
        jobs += [(OUT / d / f'post-2-slide-{i + 1}.png', s, W, h) for i, s in enumerate(carousel(h))]
    jobs += [(OUT / '2-stories' / f'story-{i + 1}.png', fn(), W, SH) for i, fn in enumerate((story1, story2, story3))]
    with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
        tmp = pathlib.Path(td) / 'r.html'; b = p.chromium.launch()
        def load(pg, html):
            tmp.write_text(f'<!doctype html><meta charset=utf-8><style>{CSS}</style>{html}', encoding='utf-8')
            pg.goto(tmp.as_uri(), wait_until='networkidle'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(150)
        for path, html, w, h in jobs:
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=SCALE)
            load(pg, html); pg.screenshot(path=str(path)); pg.close(); print(path.relative_to(ROOT))
        pg = b.new_page(); load(pg, guide_html())
        pg.pdf(path=str(OUT / 'The-Betrayal-Instagram-Guide.pdf'), format='A4', print_background=True); pg.close(); b.close()
    shutil.copy(LOGOS / 'the-betrayal-crest.png', OUT / 'crest-3000px.png')
    ZIP.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
        for fp in sorted(OUT.rglob('*')):
            if fp.is_file():
                z.write(fp, pathlib.Path('The-Betrayal-Instagram') / fp.relative_to(OUT))
    print(ZIP.relative_to(ROOT), ZIP.stat().st_size // 1024, 'KB')

if __name__ == '__main__':
    render()
