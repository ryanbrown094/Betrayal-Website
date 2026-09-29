"""Build The Betrayal brand guidelines (A4 landscape PDF) from HTML with the brand fonts (needs playwright with Chromium).

    python3 tools/brand/make_guidelines.py

Reads the fonts from worker/public/fonts, the logos from media/logos, the palette from media/palette and the ads and
social images from media/launch/ads and media/social (run make_creatives.py first so page 12 shows the current ones).
Writes media/The-Betrayal-Brand-Guidelines.pdf.
"""
import pathlib, json, tempfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MEDIA = ROOT / 'media'
FONTS = ROOT / 'worker' / 'public' / 'fonts'
L = MEDIA / 'logos'
PAL = json.loads((MEDIA / 'palette' / 'the-betrayal-palette.json').read_text())
RGB = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def f(n): return (FONTS / n).as_uri()
def svg(n): return (L / n).read_text()
def img(p): return (MEDIA / p).as_uri()

CMYK = {'Ink': '75 75 65 90', 'Plum': '70 75 60 85', 'Velvet': '70 85 50 70', 'Aubergine': '65 90 45 55', 'Ivory': '7 18 17 0',
        'Parchment': '32 34 38 3', 'Smoke': '48 45 48 15', 'Rose-gold': '5 40 42 0', 'Copper': '22 68 72 10',
        'Deep copper': '30 75 85 35', 'Wine': '15 95 40 5', 'Oxblood': '25 100 55 35', 'Verdigris': '62 10 50 5', 'Night steel': '45 25 15 5'}

# Type follows the brand rule: Grenze Gotisch only in the wordmark (the outlined logo files) and its own specimen;
# headings in IM Fell DW Pica (its italic for spoken lines); body in Alegreya Sans; eyebrows and labels in Alegreya Sans SC.
CSS = f"""
@page{{size:297mm 210mm;margin:0}}
@font-face{{font-family:Grenze;src:url({f('GrenzeGotisch-n300_900-latin.woff2')});font-weight:300 900}}
@font-face{{font-family:Fell;src:url({f('IMFellDWPica-n400-latin.woff2')})}}
@font-face{{font-family:Fell;font-style:italic;src:url({f('IMFellDWPica-i400-latin.woff2')})}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n400-latin.woff2')});font-weight:400}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n500-latin.woff2')});font-weight:500}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n700-latin.woff2')});font-weight:700}}
@font-face{{font-family:SansSC;src:url({f('AlegreyaSansSC-n700-latin.woff2')});font-weight:700}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#09070A;color:#E8D0C8;font-family:Sans;font-size:10.5pt;line-height:1.45}}
.page{{width:297mm;height:210mm;position:relative;overflow:hidden;page-break-after:always;padding:16mm 18mm 18mm;
  background:radial-gradient(ellipse 90% 60% at 30% 0%,#251428 0%,#130D14 45%,#09070A 100%)}}
.eb{{font-family:SansSC;font-weight:700;letter-spacing:.3em;text-transform:lowercase;color:#E6A58C;font-size:8pt}}
h1{{font-family:Fell;font-weight:400;font-size:30pt;line-height:1.1;margin:3mm 0 5mm;color:#E6A58C}}
.lead{{font-family:Sans;font-weight:400;font-size:12.5pt;line-height:1.45;color:#E8D0C8;max-width:175mm}}
.foot{{position:absolute;left:18mm;right:18mm;bottom:9mm;display:flex;justify-content:space-between;font-family:SansSC;font-weight:700;
  letter-spacing:.25em;text-transform:lowercase;font-size:6.5pt;color:#877E78}}
.box{{border:1px solid rgba(230,165,140,.3);border-radius:4mm;background:rgba(19,13,20,.6);padding:5mm}}
.box h3{{font-family:SansSC;font-weight:700;letter-spacing:.22em;text-transform:lowercase;color:#E6A58C;font-size:8pt;margin-bottom:2mm}}
.box p{{color:#AFA198;font-size:10.5pt}}
.cols{{display:grid;gap:6mm}}
ul.l{{list-style:none}} ul.l li{{padding:1.3mm 0 1.3mm 4mm;position:relative;color:#E8D0C8;font-size:10.5pt}}
ul.l li:before{{content:'';position:absolute;left:0;top:3.2mm;width:1.6mm;height:1.6mm;background:#E6A58C;transform:rotate(45deg)}}
ul.l b{{color:#F4C9B7}}
.lab{{font-family:SansSC;font-weight:700;letter-spacing:.22em;text-transform:lowercase;color:#E6A58C;font-size:8pt;margin:0 0 2mm}}
.cap{{color:#AFA198;font-size:8.5pt;margin-top:2mm}}
.tile{{border-radius:3mm;display:flex;align-items:center;justify-content:center;border:1px solid rgba(230,165,140,.18)}}
.tile svg{{width:78%;height:auto}}
.tile img{{height:78%;width:auto;display:block}}
table{{border-collapse:collapse;width:100%}}
td,th{{text-align:left;padding:1.2mm 2mm;border-bottom:1px solid rgba(175,161,152,.16);font-size:9.4pt;vertical-align:top}}
th{{font-family:SansSC;font-weight:700;letter-spacing:.2em;text-transform:lowercase;color:#E6A58C;font-size:7.5pt}}
td.t{{font-family:Fell;font-size:11.5pt;color:#F4C9B7;white-space:nowrap}}
.q{{font-family:Fell;font-style:italic;font-size:14pt;color:#E8D0C8;padding:2mm 0 2mm 4mm;border-left:2px solid #AE6249;margin-bottom:3mm}}
"""

def foot(n):
    return f'<div class=foot><span>the betrayal · brand guidelines</span><span>{n}</span></div>'

pages = []
pages.append(f"""<div class=page style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div style="width:150mm">{svg('the-betrayal-lockup-stacked-rosegold.svg').replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>
  <div class=lead style="margin-top:12mm;max-width:190mm">Brand guidelines: the name, the marks, the colours, the type and the voice of a dinner-party game of loyalty and lies.</div>
  <div class=foot><span>the betrayal · brand guidelines</span><span>version 2.1 · september 2026</span></div></div>""")

pages.append(f"""<div class=page><div class=eb>01 · the brand</div><h1>Candlelit. Theatrical. Mischievous.</h1>
  <div class=lead>The Betrayal is a hosted party game for one room and one evening. Everyone plays on their own phone. It opens with the Oath: every guest swears loyalty to the table, and a few of them are lying. Its world is a long table, a candle burning for every guest, and a hood that hides whoever broke their word. Everything we make should feel like that room: warm, dim, a little dangerous, and very well dressed.</div>
  <div class=cols style="grid-template-columns:repeat(4,1fr);margin-top:9mm">
   <div class=box><h3>candlelit</h3><p>Dark grounds, warm light. We glow; we never glare. Rose-gold is the candle flame of the brand. The hood is the dark around it.</p></div>
   <div class=box><h3>theatrical</h3><p>Every screen is a scene. Big type, slow reveals, a pause before the name. The narrator tells a story; it never runs a quiz show.</p></div>
   <div class=box><h3>mischievous</h3><p>We enjoy the lie. We wink at the Forsworn and tease the Loyal. Never mean, never crude.</p></div>
   <div class=box><h3>premium</h3><p>One idea per screen, generous space, careful words. It should feel like the good napkins came out.</p></div></div>
  <div class=cols style="grid-template-columns:1fr 1fr;margin-top:9mm">
   <div><div class=lab>what we are</div><ul class=l><li><b>Our own world.</b> An original game with its own look, sound and words.</li><li><b>For hosts.</b> The host plays too: we make the evening run itself.</li><li><b>For one room.</b> Faces across a table, a secret on every phone. The TV is the stage, not the game.</li></ul></div>
   <div><div class=lab>what we are not</div><ul class=l><li><b>Not a TV tie-in.</b> We never name, quote, imitate or allude to a television programme, its presenters, its castle, its music or its words.</li><li><b>Not another company’s Betrayal.</b> We never borrow the vocabulary or look of other games that use the word.</li><li><b>Not horror.</b> No gore, no jump-scares. A drop of wine-red, not blood spatter.</li><li><b>Not a gadget.</b> No apps to install, no accounts: scan a code, type a name, play.</li></ul></div></div>
  {foot(2)}</div>""")

pages.append(f"""<div class=page><div class=eb>02 · the mark</div><h1>The one in the hood</h1>
  <div style="display:grid;grid-template-columns:95mm 1fr;gap:14mm;align-items:center">
   <div style="width:85mm">{svg('the-betrayal-mark-rosegold.svg').replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>
   <div><div class=lead style="font-size:12pt">A hooded figure stands inside a lozenge, and where its face should be there is only a candle flame. It is the whole game in one picture: someone at the table has broken their oath and hides under the hood, and the candle is what gives them away. With the wordmark, it is the primary signature, and it is unchanged.</div>
    <div class=lab style="margin-top:8mm">anatomy</div><ul class=l>
     <li><b>The lozenge:</b> a double diamond frame, the outer line at full weight and the inner at half. It sets the mark apart from crests and coats of arms.</li>
     <li><b>The hood:</b> a pointed hood falling to a straight hem, with two folds and a clasp at the throat. Never add hands, feet or a face.</li>
     <li><b>The flame:</b> a filled teardrop inside the hood’s opening. It is the only solid shape in the mark.</li>
     <li><b>The pins:</b> two short rails and studs at the side points, like a brooch or a seal.</li></ul>
    <div class=lab style="margin-top:6mm">the wordmark</div><p style="color:#AFA198;font-size:9.5pt">“The Betrayal” set in Grenze Gotisch SemiBold (600) and converted to outlines. “The” is part of the name. Always use the supplied artwork; never retype it.</p></div></div>
  {foot(3)}</div>""")

def tile(file, bg, h='38mm', w='100%'):
    return f'<div class=tile style="background:{bg};height:{h};width:{w}">{svg(file)}</div>'

def seal_tile(file, bg, h='38mm', size='78%'):
    return f'<div class=tile style="background:{bg};height:{h}"><img src="{img("logos/" + file)}" style="height:{size}"></div>'

pages.append(f"""<div class=page><div class=eb>03 · lockups</div><h1>Three ways to sign</h1>
  <div class=cols style="grid-template-columns:2.2fr 1.2fr .8fr">
   <div>{tile('the-betrayal-lockup-horizontal-rosegold.svg', '#130D14', '48mm')}<div class=cap><b style="color:#E8D0C8">Horizontal:</b> the default. Web headers, the TV top bar, email, merchandise.</div></div>
   <div>{tile('the-betrayal-lockup-stacked-rosegold.svg', '#130D14', '48mm')}<div class=cap><b style="color:#E8D0C8">Stacked:</b> covers, posters, packaging, social squares, the TV title card.</div></div>
   <div>{tile('the-betrayal-mark-rosegold.svg', '#130D14', '48mm').replace('width:78%', 'width:45%')}<div class=cap><b style="color:#E8D0C8">Mark alone:</b> only inside a layout that already says the name, such as an ad or a card. Icons, avatars and stickers use the seal (page 5).</div></div></div>
  <div class=lab style="margin-top:9mm">colourways</div>
  <div class=cols style="grid-template-columns:repeat(4,1fr)">
   <div>{tile('the-betrayal-lockup-horizontal-rosegold.svg', '#09070A', '26mm')}<div class=cap><b style="color:#E8D0C8">Rose-gold</b> on Ink or Plum. The hero.</div></div>
   <div>{tile('the-betrayal-lockup-horizontal-ivory.svg', '#251428', '26mm')}<div class=cap><b style="color:#E8D0C8">Ivory</b> on Velvet, photography or busy dark grounds.</div></div>
   <div>{tile('the-betrayal-lockup-horizontal-ink.svg', '#AFA198', '26mm')}<div class=cap><b style="color:#E8D0C8">Ink</b> on Parchment and any light ground.</div></div>
   <div>{tile('the-betrayal-lockup-horizontal-ink.svg', '#AE6249', '26mm')}<div class=cap><b style="color:#E8D0C8">Ink</b> on Copper. Single-colour print uses Black or White.</div></div></div>
  {foot(4)}</div>""")

pages.append(f"""<div class=page><div class=eb>04 · the secondary mark</div><h1>The broken oath</h1>
  <div style="display:grid;grid-template-columns:78mm 1fr;gap:12mm;align-items:start">
   <div>{seal_tile('the-betrayal-seal.svg', '#09070A', '78mm', '80%')}<div class=cap><b style="color:#E8D0C8">Full colour:</b> wine wax, a candle embossed, a rose crack. On Ink, Plum or Velvet.</div></div>
   <div><div class=lead style="font-size:12pt">A wax seal with a candle pressed into it, cracked straight through: the oath someone broke. It is the seal the TV shows when a Forsworn is revealed, and the brand’s second signature. The primary lockup is unchanged and still signs everything that needs the name.</div>
    <div class=cols style="grid-template-columns:1fr 1fr;gap:8mm;margin-top:6mm">
     <div><div class=lab>where it goes</div><ul class=l><li><b>The favicon and app icon</b> (already in use)</li><li><b>Social avatars:</b> the profile picture on every channel</li><li><b>Stickers</b></li><li><b>Packaging seals</b></li></ul></div>
     <div><div class=lab>rules</div><ul class=l><li>It never replaces the primary lockup. Where the name needs saying, sign with the lockup.</li><li>Use the supplied files. Never redraw the wax, the candle or the crack, and never add a letter or a word.</li><li>For print, embossing and small sizes, use a one-colour version.</li></ul></div></div>
    <div class=cols style="grid-template-columns:repeat(3,1fr);gap:5mm;margin-top:5mm">
     <div>{seal_tile('the-betrayal-seal-mono-rose.svg', '#130D14', '26mm')}<div class=cap><b style="color:#E8D0C8">Rose</b> on dark grounds.</div></div>
     <div>{seal_tile('the-betrayal-seal-mono-ivory.svg', '#251428', '26mm')}<div class=cap><b style="color:#E8D0C8">Ivory</b> on photography and busy dark grounds.</div></div>
     <div>{seal_tile('the-betrayal-seal-mono-ink.svg', '#AFA198', '26mm')}<div class=cap><b style="color:#E8D0C8">Ink</b> on Parchment and any light ground.</div></div></div></div></div>
  {foot(5)}</div>""")

pages.append(f"""<div class=page><div class=eb>05 · space, size, misuse</div><h1>Give it room to breathe</h1>
  <div class=cols style="grid-template-columns:1fr 1fr;gap:14mm">
   <div><div class=lab>clear space</div><p style="color:#E8D0C8">Keep a margin of at least X on every side, where X is the height of the flame (about one sixth of the mark’s height). Nothing enters it: no type, no edges, no other logos.</p>
    <div class=lab style="margin-top:7mm">minimum sizes</div><ul class=l><li><b>Mark:</b> 8 mm / 24 px tall. Any smaller and the fine inner line fills in.</li><li><b>Horizontal lockup:</b> 34 mm / 130 px wide.</li><li><b>Stacked lockup:</b> 24 mm / 95 px wide.</li></ul>
    <div class=lab style="margin-top:7mm">files</div><p style="color:#E8D0C8">Every lockup and colourway is supplied as SVG (outlined, so no fonts are needed) and as transparent PNG at 2400 px, in <i>02-brand/logos</i>. The seal is there too: SVG and a 1024 px PNG in full colour, and SVG in rose, ivory and ink.</p></div>
   <div><div class=lab>never</div><ul class=l>
     <li>Stretch or squash it.</li><li>Turn it gold, or any colour outside the colourways.</li><li>Add shadows, bevels or outlines.</li><li>Set it on a clashing or busy ground.</li><li>Rotate it.</li>
     <li>Retype it, drop “The”, or write “Betrayal” alone.</li><li>Use the seal in place of the lockup.</li><li>Pair it with a TV programme’s name or logo, or with another game’s name.</li><li>Put either mark near religious symbols (see the Oath, page 9).</li></ul></div></div>
  {foot(6)}</div>""")

sw = ''.join(f"""<div><div style="height:22mm;border-radius:2.5mm;background:{h};border:1px solid rgba(230,165,140,.18)"></div>
  <div style="font-weight:700;margin-top:1.8mm;font-size:9pt">{n}</div><div class=cap style="margin:0;font-size:7.5pt">{h}<br>RGB {' '.join(map(str, RGB(h)))}<br>CMYK {CMYK[n]}</div></div>""" for n, h in PAL.items() if n in CMYK)
pages.append(f"""<div class=page><div class=eb>06 · colour</div><h1>Plum ink and rose-gold</h1>
  <p style="color:#AFA198;max-width:230mm;font-size:9.5pt">Dark, warm plum grounds carry almost everything. Rose-gold is our light: titles, key lines, the one button that matters. Wine-red is kept for the moment someone dies or a Forsworn is revealed. Verdigris and Night steel are working colours for the Keeper’s phone (safe, private) and never lead. Roughly: Ink and Plum 62%, Ivory 20%, Rose-gold 12%, everything else 6%.</p>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4mm;margin-top:6mm">{sw}</div>
  <p class=cap style="margin-top:5mm">The rose-gold gradient runs Blush #F4C9B7 → Rose-gold #E6A58C → Copper #AE6249 → Deep copper #763C29, top to bottom at a slight angle. Use it for display type and the hero logo only. CMYK values are starting points: proof on the stock before a print run.</p>
  {foot(7)}</div>""")

pages.append(f"""<div class=page><div class=eb>07 · typography</div><h1>Four voices, one table</h1>
  <div class=cols style="grid-template-columns:1.35fr 1fr;gap:14mm">
   <div>
    <div style="font-family:Grenze;font-weight:600;font-size:34pt;line-height:1.05;color:#F4C9B7">Forsworn</div><div class=cap style="margin-bottom:5mm">GRENZE GOTISCH · SEMIBOLD 600 · ONLY THE WORDMARK AND THE BIG TV MOMENTS, SUCH AS THE REVEAL CARD</div>
    <div style="font-family:Fell;font-size:24pt;line-height:1.1;color:#E6A58C">The Reckoning</div><div class=cap style="margin-bottom:4mm">IM FELL DW PICA · REGULAR · HEADINGS</div>
    <div style="font-family:Fell;font-style:italic;font-size:16pt;line-height:1.3">Everyone here swore an oath tonight. Not everyone meant it.</div><div class=cap style="margin-bottom:5mm">IM FELL DW PICA · ITALIC · SPOKEN LINES AND PULL QUOTES</div>
    <div style="font-family:SansSC;font-weight:700;letter-spacing:.3em;font-size:11pt;color:#E6A58C;text-transform:lowercase">round two · trial one · sanctuary</div><div class=cap style="margin-bottom:5mm">ALEGREYA SANS SC · BOLD 700, TRACKED +300 · EYEBROWS AND LABELS</div>
    <div style="font-size:12pt">Everything a Keeper needs to read at a glance: settings, notes, the private context, buttons. Clear before clever.</div><div class=cap>ALEGREYA SANS · 400 / 500 / 700 · BODY AND INTERFACE</div></div>
   <div><div class=lab>rules</div><ul class=l>
     <li><b>Blackletter is rare.</b> Grenze Gotisch appears only in the wordmark (always the supplied artwork) and the big TV moments. Never for headings, paragraphs or buttons, and never all caps.</li>
     <li><b>Headings in IM Fell DW Pica.</b> Roman for headings; its italic carries spoken lines and pull quotes.</li>
     <li><b>Body and interface in Alegreya Sans:</b> paragraphs, lists, captions, buttons, settings.</li>
     <li><b>Eyebrows in Alegreya Sans SC,</b> always tracked, +200 to +400.</li>
     <li><b>Blackletter needs space</b> where it does appear: at least 1.5× its cap height above and below; minimum 18 pt in print, 32 px on screen.</li></ul>
    <div class=lab style="margin-top:6mm">licences</div><p style="color:#AFA198;font-size:9pt">All four families are released under the SIL Open Font License 1.1: free for commercial use, embedding and print. Keep a copy of the licence with any font files you share.</p></div></div>
  {foot(8)}</div>""")

pages.append(f"""<div class=page><div class=eb>08 · the world</div><h1>Oaths, candles and seals</h1>
  <div class=cols style="grid-template-columns:1fr 1fr;gap:14mm">
   <div><div class=lab>motifs</div><ul class=l>
     <li><b>The Oath</b> is where every night begins. Heads down, hands flat on the table, one promise to the room.</li>
     <li><b>Candles</b> are the guests: one each, lit as they sit down. A snuffed candle is a death, and it’s the only place we show one.</li>
     <li><b>Wax seals</b> stand for people: one colour each, initial pressed in blackletter. A Forsworn’s seal cracks at the Unmasking, and that cracked seal is the secondary mark: the broken oath.</li>
     <li><b>The hood</b> belongs to the Forsworn. Never draw it as a person with a face: a hood, a fold, a shadow at the edge of the light.</li>
     <li><b>Lancet windows</b> frame the TV; their glass changes with the hour (dawn rose, day amber, night steel).</li>
     <li><b>Mist and dust</b> are slow and low. Nothing flashes except a reveal.</li></ul></div>
   <div><div class=lab>the oath</div>
    <p style="color:#E8D0C8">The Oath is the opening: every guest swears the oath of loyalty to the table, and a secret on their phone makes a few of them Forsworn (in Classic, blindfolded, it’s the Keeper’s tap on the shoulder). It’s the brand’s most theatrical moment. Treat it with care:</p>
    <ul class=l style="margin-top:3mm"><li>Capital O for the scene (“the Oath”), lower case for the promise itself (“everyone swore an oath”).</li><li>Keep it theatrical, not religious: no crosses, altars, priests or holy books.</li><li>Show it with hands on a table, phones face down and candlelight.</li></ul>
    <div class=q style="margin-top:6mm">“Lay your hands on the table. Swear to the people beside you that you will be loyal until the last candle goes out.”</div></div></div>
  {foot(9)}</div>""")

public = [('The Betrayal', 'the product'), ('the Forsworn', 'the hidden killers'), ('the Loyal', 'everyone else'),
          ('Ghosts', 'players who are out'), ('the host', 'opens the Table and plays too'), ('the Keeper', 'runs a Classic game and doesn’t play'), ('the Oath', 'the opening promise'),
          ('Trials', 'the party games'), ('the Reckoning', 'the vote; the loser is exiled'), ('Sanctuary', 'safe from tonight’s kill'),
          ('the Purse', 'the shared winnings; it decides the prize'), ('the Unmasking', 'the final reveal'),
          ('a Table', '£10, one party · Book a Table'), ('a booking code', 'what the buyer is sent: OATH-XXXX-XXXX'),
          ('a Regular', '£20 a month · Become a Regular'), ('the Table code', 'six characters the TV joins with')]
ingame = [('the Casting Vote', 'breaks a tie at one Reckoning'), ('the Crown', 'Sanctuary and the Casting Vote together'),
          ('the Temptation', 'everyone chalks PURSE or SELF'), ('the Whisper', 'a lone Forsworn invites a Loyal to join'),
          ('the Last Offer', 'join or die'), ('Errands', 'the Forsworn’s secret tasks'),
          ('Trust or Doubt', 'the last secret vote'), ('Honour or Betray', 'the survivors’ last choice')]
was = [('an Invitation', 'a Table'), ('a Standing Invitation', 'a Regular'), ('the Sacrament', 'the Oath'),
       ('the Casting Vote counts twice', 'it breaks a tie'), ('PURSE or SANCTUARY', 'PURSE or SELF')]
def tbl(rs, head):
    return f'<table><tr><th>{head}</th><th>what it is</th></tr>' + ''.join(f'<tr><td class=t>{a}</td><td>{b}</td></tr>' for a, b in rs) + '</table>'
pages.append(f"""<div class=page><div class=eb>09 · the words</div><h1>Two tiers of words</h1>
  <div class=cols style="grid-template-columns:1fr 1fr;gap:10mm">
   <div><div class=lab>public: ads, press, posts, outreach</div>{tbl(public, 'say')}</div>
   <div><div class=lab>in-game: in public, “twists the TV explains when they happen”</div>{tbl(ingame, 'the game says')}
    <p class=cap style="margin-top:2mm">One more in-game role is never named in public at all.</p>
    <div class=lab style="margin-top:5mm">was → now, 29 september 2026</div>
    <table>{''.join(f'<tr><td style="color:#877E78">{a}</td><td style="color:#F4C9B7">{b}</td></tr>' for a, b in was)}</table></div></div>
  <p class=cap style="margin-top:3mm">Plain words, lower case: exile, night, dawn, dinner, poison, murder, oath, seal, candle, blindfold, chalkboard; and the Interval. The full lists, awards included, are in <i>01-game/glossary-and-naming.md</i>.</p>
  {foot(10)}</div>""")

pages.append(f"""<div class=page><div class=eb>10 · voice</div><h1>The voice at the head of the table</h1>
  <div class=lead style="font-size:12pt">We speak like a host who has been waiting all evening to say this: second person, present tense, a little wicked, never wordy. Short sentences. A pause before the name.</div>
  <div class=cols style="grid-template-columns:1.2fr 1fr;gap:14mm;margin-top:7mm">
   <div><div class=lab>sounds like us</div>
    <div class=q>“Heads down. Hands flat on the table. If I hear a single word, you will answer for it at dawn.”</div>
    <div class=q>“Look at your phone. If it says Forsworn, don’t let your face say it too.”</div>
    <div class=q>“Look at the screen: there is a candle burning for every one of you.”</div>
    <div class=q>“Every Forsworn has been unmasked. The Loyal have won.”</div></div>
   <div><div class=lab>do</div><ul class=l><li>Address the room directly: you, your table, tonight.</li><li>Use British English and plain words: name who you exile, not submit a vote; the Interval, not a break-out.</li><li>Ask for the sale plainly: <b>Book a Table</b>, or <b>Become a Regular</b>.</li><li>Say the length honestly: best with 8 to 16. A big table or a long night is a fact, not a selling point.</li><li>Keep secrets in the copy too. Never hint who holds a role.</li></ul>
    <div class=lab style="margin-top:5mm">don’t</div><ul class=l><li>Name, quote or allude to any TV programme, presenter, catchphrase, castle or theme tune.</li><li>Borrow another Betrayal game’s words or look.</li><li>Write gore or cruelty. Murder is a tap on the shoulder, not a crime scene.</li><li>Use tech words in front of guests: app, sync, user, click.</li></ul></div></div>
  {foot(11)}</div>""")

def ad(p, w): return f'<img src="{img(p)}" style="width:{w};border-radius:2mm;border:1px solid rgba(230,165,140,.25);display:block">'
pages.append(f"""<div class=page><div class=eb>11 · in use</div><h1>How it comes together</h1>
  <div style="display:grid;grid-template-columns:repeat(4,1fr) 1.15fr;gap:5mm;align-items:start">
   <div>{ad('launch/ads/01-everyone-swore-an-oath-feed-1080x1350.png','100%')}<div class=cap>Feed ad, 1080 × 1350</div></div>
   <div>{ad('launch/ads/02-your-phone-runs-the-game-feed-1080x1350.png','100%')}<div class=cap>For the host</div></div>
   <div>{ad('launch/ads/03-under-2-a-guest-feed-1080x1350.png','100%')}<div class=cap>Price and what you need</div></div>
   <div>{ad('launch/ads/04-who-do-you-exile-feed-1080x1350.png','100%')}<div class=cap>The Reckoning, drawn in seals</div></div>
   <div>{ad('social/og-card.png','100%')}<div class=cap>Link preview, 1200 × 630</div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm">
      <div>{ad('social/square.png','100%')}<div class=cap>Social square</div></div>
      <div>{ad('social/avatar.png','100%').replace('border-radius:2mm', 'border-radius:50%')}<div class=cap>Avatar: the seal</div></div></div></div></div>
  <p class=cap style="margin-top:4mm">Headlines are set in IM Fell DW Pica; the blackletter appears only in the wordmark. These are drawn from the brand, not from game screens: wherever the product itself is shown, add real TV and phone screenshots, because real screens beat mock-ups.</p>
  {foot(12)}</div>""")

pages.append(f"""<div class=page style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div style="width:24mm">{svg('the-betrayal-mark-rosegold.svg').replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>
  <div class=lead style="margin-top:8mm">Questions about the brand, or artwork we haven’t supplied?</div>
  <div style="margin-top:3mm;font-weight:700;color:#E6A58C">thebetrayal.co.uk/contact</div>
  <p class=cap style="margin-top:14mm;max-width:200mm">The Betrayal is an independent party game. It is not affiliated with, endorsed by or connected to any television programme, broadcaster or other game. Fonts: Grenze Gotisch, IM Fell DW Pica, Alegreya Sans and Alegreya Sans SC, SIL Open Font License 1.1.</p>
  <div class=foot><span>the betrayal · brand guidelines</span><span>version 2.1</span></div></div>""")

html = f'<!doctype html><meta charset=utf-8><style>{CSS}</style>' + ''.join(pages)
out = MEDIA / 'The-Betrayal-Brand-Guidelines.pdf'
with tempfile.TemporaryDirectory() as td:
    tmp = pathlib.Path(td) / 'guidelines.html'
    tmp.write_text(html, encoding='utf-8')
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        pg.goto(tmp.as_uri(), wait_until='networkidle'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(300)
        pg.pdf(path=str(out), width='297mm', height='210mm', print_background=True, prefer_css_page_size=True)
        b.close()
print('pages:', len(pages), out)
