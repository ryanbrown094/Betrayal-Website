"""Build The Betrayal wordmark and lockups (outlined SVG + 2400px PNG) from Grenze Gotisch SemiBold."""
import pathlib, re, shutil, io
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

PACK = pathlib.Path(__file__).resolve().parents[1]
SRC = PACK / '01-brand'
LOGOS = PACK / '01-brand' / 'logos'
LOGOS.mkdir(parents=True, exist_ok=True)

TEXT = 'The Betrayal'
font = TTFont(SRC / 'fonts/web/GrenzeGotisch-n300_900-latin.woff2')
inst = instantiateVariableFont(font, {'wght': 600})
buf = io.BytesIO(); inst.flavor = None; inst.save(buf); data = buf.getvalue()
face = hb.Face(data); hbfont = hb.Font(face)
hbfont.set_variations({'wght': 600})
b = hb.Buffer(); b.add_str(TEXT); b.guess_segment_properties()
hb.shape(hbfont, b, {'kern': True, 'liga': True})
gs = inst.getGlyphSet(); order = inst.getGlyphOrder()
upm = inst['head'].unitsPerEm

pen = SVGPathPen(gs); bpen = BoundsPen(gs)
x = 0
for info, pos in zip(b.glyph_infos, b.glyph_positions):
    name = order[info.codepoint]
    # font units -> y down
    t = (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)
    gs[name].draw(TransformPen(pen, t)); gs[name].draw(TransformPen(bpen, t))
    x += pos.x_advance
xmin, ymin, xmax, ymax = bpen.bounds
H = 200.0  # target glyph-box height in px, as in the old wordmark
s = H / (ymax - ymin)
W = (xmax - xmin) * s
D = pen.getCommands()
WORD = f'<path transform="translate(4 6) scale({s:.5f}) translate({-xmin:.2f} {-ymin:.2f})" fill="FILL" d="{D}"/>'
ww, wh = round(W + 8), 212

GRAD = ('<defs><linearGradient id="rg" x1="0" y1="0" x2=".15" y2="1"><stop offset=".08" stop-color="#f4c9b7"/>'
        '<stop offset=".4" stop-color="#e6a58c"/><stop offset=".7" stop-color="#ae6249"/><stop offset="1" stop-color="#763c29"/></linearGradient></defs>')
COLS = {'black': '#000000', 'ink': '#09070a', 'ivory': '#e8d0c8', 'rose': '#e6a58c', 'rosegold': 'url(#rg)', 'white': '#ffffff'}

def mark_inner(col):
    svg = (LOGOS / f'the-betrayal-mark-{col}.svg').read_text()
    return re.sub(r'^<svg[^>]*>|</svg>$', '', svg)

out = {}
for col, fill in COLS.items():
    word = WORD.replace('FILL', fill)
    g = GRAD if col == 'rosegold' else ''
    out[f'the-betrayal-wordmark-{col}'] = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ww} {wh}" width="{ww}" height="{wh}">{g}{word}</svg>', ww, wh)
    hw = ww + 170
    out[f'the-betrayal-lockup-horizontal-{col}'] = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {hw} 212" width="{hw}" height="212">{g}'
        f'<g transform="translate(0 22) scale(1.2)">{mark_inner(col)}</g>'
        f'<g transform="translate(170 0)">{word}</g></svg>', hw, 212)
    mx = (ww - 120 * 1.7) / 2
    out[f'the-betrayal-lockup-stacked-{col}'] = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ww} 470" width="{ww}" height="470">{g}'
        f'<g transform="translate({mx:.1f} 0) scale(1.7)">{mark_inner(col)}</g>'
        f'<g transform="translate(0 244)">{word}</g></svg>', ww, 470)

for name, (svg, w, h) in out.items():
    (LOGOS / f'{name}.svg').write_text(svg)

# PNGs at 2400px wide, transparent
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, (svg, w, h) in out.items():
        scale = 2400 / w
        pg = br.new_page(viewport={'width': 2400, 'height': round(h * scale)})
        wrap = LOGOS / '_wrap.html'
        wrap.write_text(f'<html><body style="margin:0;background:transparent"><img src="{name}.svg" style="width:2400px;display:block"></body></html>')
        pg.goto(wrap.as_uri())
        pg.wait_for_timeout(100)
        pg.screenshot(path=str(LOGOS / f'{name}.png'), omit_background=True)
        pg.close()
    br.close()
(LOGOS / '_wrap.html').unlink()
print('logos:', len(list(LOGOS.iterdir())), 'files; wordmark', ww, 'x', wh)
