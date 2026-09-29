"""Build The Betrayal brand guidelines (A4 landscape PDF) from HTML with the brand fonts."""
import pathlib, json
from playwright.sync_api import sync_playwright

PACK = pathlib.Path(__file__).resolve().parents[1]
B = PACK / '01-brand'
FONTS = B / 'fonts' / 'web'
L = B / 'logos'
PAL = json.loads((B / 'palette' / 'the-betrayal-palette.json').read_text())
RGB = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def f(n): return (FONTS / n).as_uri()
def svg(n): return (L / n).read_text()
def img(p): return (PACK / p).as_uri()

CMYK = {'Ink': '75 75 65 90', 'Plum': '70 75 60 85', 'Velvet': '70 85 50 70', 'Aubergine': '65 90 45 55', 'Ivory': '7 18 17 0',
        'Parchment': '32 34 38 3', 'Smoke': '48 45 48 15', 'Rose-gold': '5 40 42 0', 'Copper': '22 68 72 10',
        'Deep copper': '30 75 85 35', 'Wine': '15 95 40 5', 'Oxblood': '25 100 55 35', 'Verdigris': '62 10 50 5', 'Night steel': '45 25 15 5'}

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
h1{{font-family:Grenze;font-weight:600;font-size:30pt;line-height:1.1;margin:3mm 0 5mm;color:#E6A58C}}
.lead{{font-family:Fell;font-style:italic;font-size:13pt;line-height:1.4;color:#E8D0C8;max-width:175mm}}
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
table{{border-collapse:collapse;width:100%}}
td,th{{text-align:left;padding:1.35mm 2mm;border-bottom:1px solid rgba(175,161,152,.16);font-size:9.6pt;vertical-align:top}}
th{{font-family:SansSC;font-weight:700;letter-spacing:.2em;text-transform:lowercase;color:#E6A58C;font-size:7.5pt}}
td.t{{font-family:Grenze;font-weight:600;font-size:11.5pt;color:#F4C9B7;white-space:nowrap}}
td.o{{color:#877E78}}
.q{{font-family:Fell;font-style:italic;font-size:14pt;color:#E8D0C8;padding:2mm 0 2mm 4mm;border-left:2px solid #AE6249;margin-bottom:3mm}}
"""

def foot(n):
    return f'<div class=foot><span>the betrayal · brand guidelines</span><span>{n}</span></div>'

pages = []
pages.append(f"""<div class=page style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div style="width:150mm">{svg('the-betrayal-lockup-stacked-rosegold.svg').replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>
  <div class=lead style="margin-top:12mm;max-width:190mm">Brand guidelines: the name, the mark, the colours, the type and the voice of a dinner-party game of loyalty and lies.</div>
  <div class=foot><span>the betrayal · brand guidelines</span><span>version 2.0 · september 2026</span></div></div>""")

pages.append(f"""<div class=page><div class=eb>01 · the brand</div><h1>Candlelit. Theatrical. Mischievous.</h1>
  <div class=lead>The Betrayal is a hosted party game for one room and one evening. It opens with an oath: every guest, blindfolded, swears loyalty to the table, and a few of them are lying. Its world is a long table, a candle burning for every guest, and a hood that hides whoever broke their word. Everything we make should feel like that room: warm, dim, a little dangerous, and very well dressed.</div>
  <div class=cols style="grid-template-columns:repeat(4,1fr);margin-top:9mm">
   <div class=box><h3>candlelit</h3><p>Dark grounds, warm light. We glow; we never glare. Rose-gold is the candle flame of the brand. The hood is the dark around it.</p></div>
   <div class=box><h3>theatrical</h3><p>Every screen is a scene. Big type, slow reveals, a pause before the name. The Keeper is a narrator, not a quizmaster.</p></div>
   <div class=box><h3>mischievous</h3><p>We enjoy the lie. We wink at the Forsworn and tease the Loyal. Never mean, never crude.</p></div>
   <div class=box><h3>premium</h3><p>One idea per screen, generous space, careful words. It should feel like the good napkins came out.</p></div></div>
  <div class=cols style="grid-template-columns:1fr 1fr;margin-top:9mm">
   <div><div class=lab>what we are</div><ul class=l><li><b>Our own world.</b> An original game with its own look, sound and words.</li><li><b>For hosts.</b> The Keeper is the hero: we make them look effortless.</li><li><b>For one room.</b> Faces, blindfolds, chalk. The TV is the stage, not the game.</li></ul></div>
   <div><div class=lab>what we are not</div><ul class=l><li><b>Not a TV tie-in.</b> We never name, quote, imitate or allude to a television programme, its presenters, its castle, its music or its words.</li><li><b>Not another company's Betrayal.</b> We never borrow the vocabulary or look of other games that use the word.</li><li><b>Not horror.</b> No gore, no jump-scares. A drop of wine-red, not blood spatter.</li><li><b>Not a gadget.</b> No apps to install, no accounts, no guests on their phones.</li></ul></div></div>
  {foot(2)}</div>""")

pages.append(f"""<div class=page><div class=eb>02 · the mark</div><h1>The one in the hood</h1>
  <div style="display:grid;grid-template-columns:95mm 1fr;gap:14mm;align-items:center">
   <div style="width:85mm">{svg('the-betrayal-mark-rosegold.svg').replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>
   <div><div class=lead style="font-size:12pt">A hooded figure stands inside a lozenge, and where its face should be there is only a candle flame. It is the whole game in one picture: someone at the table has broken their oath and hides under the hood, and the candle is what gives them away.</div>
    <div class=lab style="margin-top:8mm">anatomy</div><ul class=l>
     <li><b>The lozenge:</b> a double diamond frame, the outer line at full weight and the inner at half. It sets the mark apart from shields and crests.</li>
     <li><b>The hood:</b> a pointed hood falling to a straight hem, with two folds and a clasp at the throat. Never add hands, feet or a face.</li>
     <li><b>The flame:</b> a filled teardrop inside the hood's opening. It is the only solid shape in the mark.</li>
     <li><b>The pins:</b> two short rails and studs at the side points, like a brooch or a seal.</li></ul>
    <div class=lab style="margin-top:6mm">the wordmark</div><p style="color:#AFA198;font-size:9.5pt">"The Betrayal" set in Grenze Gotisch SemiBold (600) and converted to outlines. "The" is part of the name. Always use the supplied artwork; never retype it.</p></div></div>
  {foot(3)}</div>""")

def tile(file, bg, h='38mm', w='100%'):
    return f'<div class=tile style="background:{bg};height:{h};width:{w}">{svg(file)}</div>'

pages.append(f"""<div class=page><div class=eb>03 · lockups</div><h1>Three ways to sign</h1>
  <div class=cols style="grid-template-columns:2.2fr 1.2fr .8fr">
   <div>{tile('the-betrayal-lockup-horizontal-rosegold.svg', '#130D14', '48mm')}<div class=cap><b style="color:#E8D0C8">Horizontal:</b> the default. Web headers, the TV top bar, email, merchandise.</div></div>
   <div>{tile('the-betrayal-lockup-stacked-rosegold.svg', '#130D14', '48mm')}<div class=cap><b style="color:#E8D0C8">Stacked:</b> covers, posters, packaging, social squares, the TV title card.</div></div>
   <div>{tile('the-betrayal-mark-rosegold.svg', '#130D14', '48mm').replace('width:78%', 'width:45%')}<div class=cap><b style="color:#E8D0C8">Mark alone:</b> app icons, favicons, stickers, wax seals. Only where the name is already said.</div></div></div>
  <div class=lab style="margin-top:9mm">colourways</div>
  <div class=cols style="grid-template-columns:repeat(4,1fr)">
   <div>{tile('the-betrayal-lockup-horizontal-rosegold.svg', '#09070A', '26mm')}<div class=cap><b style="color:#E8D0C8">Rose-gold</b> on Ink or Plum. The hero.</div></div>
   <div>{tile('the-betrayal-lockup-horizontal-ivory.svg', '#251428', '26mm')}<div class=cap><b style="color:#E8D0C8">Ivory</b> on Velvet, photography or busy dark grounds.</div></div>
   <div>{tile('the-betrayal-lockup-horizontal-ink.svg', '#AFA198', '26mm')}<div class=cap><b style="color:#E8D0C8">Ink</b> on Parchment and any light ground.</div></div>
   <div>{tile('the-betrayal-lockup-horizontal-ink.svg', '#AE6249', '26mm')}<div class=cap><b style="color:#E8D0C8">Ink</b> on Copper. Single-colour print uses Black or White.</div></div></div>
  {foot(4)}</div>""")

pages.append(f"""<div class=page><div class=eb>04 · space, size, misuse</div><h1>Give it room to breathe</h1>
  <div class=cols style="grid-template-columns:1fr 1fr;gap:14mm">
   <div><div class=lab>clear space</div><p style="color:#E8D0C8">Keep a margin of at least X on every side, where X is the height of the flame (about one sixth of the mark's height). Nothing enters it: no type, no edges, no other logos.</p>
    <div class=lab style="margin-top:7mm">minimum sizes</div><ul class=l><li><b>Mark:</b> 8 mm / 24 px tall. Any smaller and the fine inner line fills in.</li><li><b>Horizontal lockup:</b> 34 mm / 130 px wide.</li><li><b>Stacked lockup:</b> 24 mm / 95 px wide.</li></ul>
    <div class=lab style="margin-top:7mm">files</div><p style="color:#E8D0C8">Every lockup and colourway is supplied as SVG (outlined, so no fonts are needed) and as transparent PNG at 2400 px, in <i>01-brand/logos</i>.</p></div>
   <div><div class=lab>never</div><ul class=l>
     <li>Stretch or squash it.</li><li>Turn it gold, or any colour outside the colourways.</li><li>Add shadows, bevels or outlines.</li><li>Set it on a clashing or busy ground.</li><li>Rotate it.</li>
     <li>Retype it, drop "The", or write "Betrayal" alone.</li><li>Pair it with a TV programme's name or logo, or with another game's name.</li><li>Put the mark near religious symbols (see the Sacrament, page 8).</li></ul></div></div>
  {foot(5)}</div>""")

sw = ''.join(f"""<div><div style="height:22mm;border-radius:2.5mm;background:{h};border:1px solid rgba(230,165,140,.18)"></div>
  <div style="font-weight:700;margin-top:1.8mm;font-size:9pt">{n}</div><div class=cap style="margin:0;font-size:7.5pt">{h}<br>RGB {' '.join(map(str, RGB(h)))}<br>CMYK {CMYK[n]}</div></div>""" for n, h in PAL.items() if n in CMYK)
pages.append(f"""<div class=page><div class=eb>05 · colour</div><h1>Plum ink and rose-gold</h1>
  <p style="color:#AFA198;max-width:230mm;font-size:9.5pt">Dark, warm plum grounds carry almost everything. Rose-gold is our light: titles, key lines, the one button that matters. Wine-red is kept for the moment someone dies or a Forsworn is revealed. Verdigris and Night steel are working colours for the Keeper's phone (safe, private) and never lead. Roughly: Ink and Plum 62%, Ivory 20%, Rose-gold 12%, everything else 6%.</p>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4mm;margin-top:6mm">{sw}</div>
  <p class=cap style="margin-top:5mm">The rose-gold gradient runs Blush #F4C9B7 → Rose-gold #E6A58C → Copper #AE6249 → Deep copper #763C29, top to bottom at a slight angle. Use it for display type and the hero logo only. CMYK values are starting points: proof on the stock before a print run.</p>
  {foot(6)}</div>""")

pages.append(f"""<div class=page><div class=eb>06 · typography</div><h1>Four voices, one table</h1>
  <div class=cols style="grid-template-columns:1.35fr 1fr;gap:14mm">
   <div>
    <div style="font-family:Grenze;font-weight:600;font-size:34pt;line-height:1.05;color:#F4C9B7">The Reckoning</div><div class=cap style="margin-bottom:6mm">GRENZE GOTISCH · SEMIBOLD 600 · DISPLAY: TITLES, NAMES, THE BIG REVEAL</div>
    <div style="font-family:Fell;font-style:italic;font-size:17pt;line-height:1.3">Everyone here swore an oath tonight. Not everyone meant it.</div><div class=cap style="margin-bottom:6mm">IM FELL DW PICA · REGULAR &amp; ITALIC · NARRATIVE: THE LINES THE ROOM READS</div>
    <div style="font-family:SansSC;font-weight:700;letter-spacing:.3em;font-size:11pt;color:#E6A58C;text-transform:lowercase">round two · trial one · sanctuary</div><div class=cap style="margin-bottom:6mm">ALEGREYA SANS SC · BOLD 700, TRACKED +300 · LABELS, EYEBROWS, NAME PLAQUES</div>
    <div style="font-size:12pt">Everything a Keeper needs to read at a glance: settings, notes, the private context, buttons. Clear before clever.</div><div class=cap>ALEGREYA SANS · 400 / 500 / 700 · INTERFACE AND BODY COPY</div></div>
   <div><div class=lab>rules</div><ul class=l>
     <li><b>One display line per screen.</b> Grenze Gotisch is for headlines and names: never a paragraph, never all caps.</li>
     <li><b>Blackletter needs space.</b> At least 1.5× its cap height above and below; minimum 18 pt in print, 32 px on screen.</li>
     <li><b>Italic tells the story.</b> IM Fell Italic is the narrator: short, spoken lines.</li>
     <li><b>Caps are always tracked.</b> Alegreya Sans SC, +200 to +400.</li>
     <li><b>On the Keeper's phone</b> use the device's system font for speed and legibility; the brand lives on the TV.</li></ul>
    <div class=lab style="margin-top:6mm">licences</div><p style="color:#AFA198;font-size:9pt">All four families are released under the SIL Open Font License 1.1: free for commercial use, embedding and print. Keep a copy of the licence with any font files you share.</p></div></div>
  {foot(7)}</div>""")

pages.append(f"""<div class=page><div class=eb>07 · the world</div><h1>Oaths, candles and seals</h1>
  <div class=cols style="grid-template-columns:1fr 1fr;gap:14mm">
   <div><div class=lab>motifs</div><ul class=l>
     <li><b>The oath</b> is where every night begins. Hands flat on the table, blindfolds on, one promise to the room.</li>
     <li><b>Candles</b> are the guests: one each, lit as they sit down. A snuffed candle is a death, and it's the only place we show one.</li>
     <li><b>Wax seals</b> stand for people: one colour each, initial pressed in blackletter. A Forsworn's seal cracks at the Unmasking.</li>
     <li><b>The hood</b> belongs to the Forsworn. Never draw it as a person with a face: a hood, a fold, a shadow at the edge of the light.</li>
     <li><b>Lancet windows</b> frame the TV; their glass changes with the hour (dawn rose, day amber, night steel).</li>
     <li><b>Mist and dust</b> are slow and low. Nothing flashes except a reveal.</li></ul></div>
   <div><div class=lab>the sacrament</div>
    <p style="color:#E8D0C8">The Sacrament is the opening ceremony: every guest swears the oath with their eyes covered, and the Keeper's tap makes someone Forsworn. It's the brand's most theatrical moment. Treat it with the same care as the word:</p>
    <ul class=l style="margin-top:3mm"><li>Use "the Sacrament" only for the oath-taking at the start of the night.</li><li>Keep it theatrical, not religious: no crosses, altars, priests or communion, and don't pair it with a chalice.</li><li>Show it with hands on a table, blindfolds and candlelight.</li></ul>
    <div class=q style="margin-top:6mm">"Lay your hands on the table. Swear to the people beside you that you will be loyal until the last candle goes out."</div></div></div>
  {foot(8)}</div>""")

rows = [('The Betrayal', 'the product', 'Cloak & Candle'), ('the Forsworn', 'the hidden killers', 'Cloaks'), ('the Loyal', 'everyone else', 'Candles'),
        ('Ghosts', 'players who are out', 'Ghosts'), ('the Keeper', 'the host', 'host'), ('the Sacrament', 'the opening oath', '—'),
        ('Trials', 'the party games', 'missions'), ('the Reckoning', 'the vote; exiled', 'the Reckoning'), ('the Interval', 'the break before the vote', 'the mingle'),
        ('Sanctuary', 'safe from tonight\'s kill', 'shield'), ('the Casting Vote', 'counts twice', 'the blade'), ('the Crown', 'both together', 'the Champion')]
rows2 = [('the Temptation', 'Purse or Sanctuary gamble', 'the Dilemma'), ('a special prize', 'a secret role near the end', '—'),
         ('the Whisper', 'a lone Forsworn recruits', 'Conversion'), ('the Last Offer', 'join or die', 'the Bargain'), ('Errands', 'the Forsworn\'s tasks', 'side-quests'),
         ('the Purse', 'the shared winnings', 'the pot'), ('Trust or Doubt', 'the last secret vote', 'End or Exile'), ('Honour or Betray', 'the survivors\' choice', 'share or take'),
         ('the Unmasking', 'the final reveal', 'the ceremony'), ('an Invitation', 'one game, £15', 'party pass'), ('a Standing Invitation', '£20 a month', 'subscription'), ('the Table', 'a game\'s room', 'room')]
def tbl(rs):
    return '<table><tr><th>say</th><th>what it is</th><th>was</th></tr>' + ''.join(
        f'<tr><td class=t>{a}</td><td>{b}</td><td class=o>{c}</td></tr>' for a, b, c in rs) + '</table>'
pages.append(f"""<div class=page><div class=eb>08 · the words</div><h1>The game's vocabulary</h1>
  <div class=cols style="grid-template-columns:1fr 1fr;gap:10mm">{tbl(rows)}{tbl(rows2)}</div>
  <p class=cap style="margin-top:4mm">Capitalise the game words above. Lower case: exile, night, dawn, poison, murder, oath, seal, candle, blindfold, chalkboard. The full list, awards included, is in <i>02-words/glossary-and-naming.md</i>.</p>
  {foot(9)}</div>""")

pages.append(f"""<div class=page><div class=eb>09 · voice</div><h1>The Keeper at the head of the table</h1>
  <div class=lead style="font-size:12pt">We speak like a host who has been waiting all evening to say this: second person, present tense, a little wicked, never wordy. Short sentences. A pause before the name.</div>
  <div class=cols style="grid-template-columns:1.2fr 1fr;gap:14mm;margin-top:7mm">
   <div><div class=lab>sounds like us</div>
    <div class=q>"Blindfolds on. Hands flat on the table. If I hear a single word, you will answer for it at dawn."</div>
    <div class=q>"If you feel my hand on your shoulder, you are Forsworn."</div>
    <div class=q>"Look at the screen: there is a candle burning for every one of you."</div>
    <div class=q>"Every Forsworn has been unmasked. The Loyal have won."</div></div>
   <div><div class=lab>do</div><ul class=l><li>Address the room directly: you, your table, tonight.</li><li>Use British English and plain words: chalk a name, not submit a vote; the Interval, not a break-out.</li><li>Keep secrets in the copy too. Never hint who holds a role.</li><li>Call the prize "the prize" until it is won.</li></ul>
    <div class=lab style="margin-top:5mm">don't</div><ul class=l><li>Name, quote or allude to any TV programme, presenter, catchphrase, castle or theme tune.</li><li>Borrow another Betrayal game's words or look.</li><li>Write gore or cruelty. Murder is a tap on the shoulder, not a crime scene.</li><li>Use tech words in front of guests: app, sync, user, click.</li></ul></div></div>
  {foot(10)}</div>""")

def ad(p, w): return f'<img src="{img(p)}" style="width:{w};border-radius:2mm;border:1px solid rgba(230,165,140,.25);display:block">'
pages.append(f"""<div class=page><div class=eb>10 · in use</div><h1>How it comes together</h1>
  <div style="display:grid;grid-template-columns:repeat(4,1fr) 1.15fr;gap:5mm;align-items:start">
   <div>{ad('04-launch/ads/01-everyone-swore-an-oath-feed-1080x1350.png','100%')}<div class=cap>Feed ad, 1080 × 1350</div></div>
   <div>{ad('04-launch/ads/02-your-phone-runs-the-game-feed-1080x1350.png','100%')}<div class=cap>For the host</div></div>
   <div>{ad('04-launch/ads/03-under-2-a-guest-feed-1080x1350.png','100%')}<div class=cap>Price and what you need</div></div>
   <div>{ad('04-launch/ads/04-who-do-you-exile-feed-1080x1350.png','100%')}<div class=cap>The Reckoning, drawn in seals</div></div>
   <div>{ad('03-social/og-card-1200x630.png','100%')}<div class=cap>Link preview, 1200 × 630</div>
     <div style="margin-top:4mm">{ad('03-social/square-1080x1080.png','70%')}</div><div class=cap>Social square</div></div></div>
  <p class=cap style="margin-top:4mm">These are drawn from the brand, not from game screens. Once the game itself is renamed, add real TV and phone screenshots: real screens beat mock-ups wherever the product is shown.</p>
  {foot(11)}</div>""")

pages.append(f"""<div class=page style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div style="width:24mm">{svg('the-betrayal-mark-rosegold.svg').replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>
  <div class=lead style="margin-top:8mm">Questions about the brand, or artwork we haven't supplied?</div>
  <div style="margin-top:3mm;font-weight:700;color:#E6A58C">thebetrayal.co.uk/contact</div>
  <p class=cap style="margin-top:14mm;max-width:200mm">The Betrayal is an independent party game. It is not affiliated with, endorsed by or connected to any television programme, broadcaster or other game. Fonts: Grenze Gotisch, IM Fell DW Pica, Alegreya Sans and Alegreya Sans SC, SIL Open Font License 1.1.</p>
  <div class=foot><span>the betrayal · brand guidelines</span><span>version 2.0</span></div></div>""")

html = f'<!doctype html><meta charset=utf-8><style>{CSS}</style>' + ''.join(pages)
tmp = PACK / 'tools' / '_guidelines.html'
tmp.write_text(html)
out = B / 'The-Betrayal-Brand-Guidelines.pdf'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(tmp.as_uri(), wait_until='networkidle'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(300)
    pg.pdf(path=str(out), width='297mm', height='210mm', print_background=True, prefer_css_page_size=True)
    b.close()
tmp.unlink()
print('pages:', len(pages), out)
