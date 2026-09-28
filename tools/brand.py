# Builds the Cloak & Candle logo files: the mark and the wordmark as pure SVG paths (no font needed), in every colourway,
# plus PNG renders. Output: media/logos/. Run from the repo root: python3 tools/brand.py
import os, re, subprocess, sys, time, io
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = "media/logos"; os.makedirs(OUT, exist_ok=True)
font = TTFont("worker/public/fonts/GrenzeGotisch-n300_900-latin.woff2")
font = instancer.instantiateVariableFont(font, {"wght": 600})
gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
upm = font["head"].unitsPerEm

def word_path(text, size):
    """Path data for text set at `size` px, baseline at y=size*0.8, plus its advance width."""
    s = size / upm; x = 0; d = []
    for ch in text:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, size * 0.8)))
        d.append(pen.getCommands()); x += hmtx[g][0] * s
    return " ".join(d), x

MARK = '''<path d="M60 16l44 54-44 54-44-54z" fill="{c}" fill-opacity=".14"/><g fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M60 5l55 65-55 65L5 70z"/><path d="M60 16l44 54-44 54-44-54z" stroke-width="1"/><path d="M60 29C51 35 44.5 44 44 56c-.3 6 1.5 8-.5 14-2.5 8-1.5 17-3.5 26h40c-2-9-1-18-3.5-26-2-6-.2-8-.5-14-.5-12-7-21-16-27z"/><path d="M60 41c-6 5-9 10.5-9 16 0 6 4 9.5 9 9.5s9-3.5 9-9.5c0-5.5-3-11-9-16z" stroke-width="1.4"/><path d="M60 48c3 4.4 4.6 7.2 4.6 9.5a4.6 4.6 0 0 1-9.2 0c0-2.3 1.6-5.1 4.6-9.5z" fill="{c}" fill-opacity=".35"/><circle cx="60" cy="70.5" r="1.6"/><path d="M60 73c-.4 8-.8 15.5-1.2 23" stroke-width="1.3"/><path d="M50 77c-1 6.5-2 13-3 19M70 77c1 6.5 2 13 3 19" stroke-width="1"/><path d="M27 70h-9M93 70h9" stroke-width="1.4"/><circle cx="14" cy="70" r="1.6"/><circle cx="106" cy="70" r="1.6"/></g>'''
GRAD = '<defs><linearGradient id="rg" x1="0" y1="0" x2=".15" y2="1"><stop offset=".08" stop-color="#f4c9b7"/><stop offset=".4" stop-color="#e6a58c"/><stop offset=".7" stop-color="#ae6249"/><stop offset="1" stop-color="#763c29"/></linearGradient></defs>'
WAYS = {"rosegold": ("url(#rg)", "#e6a58c"), "rose": ("#e6a58c", "#e6a58c"), "ivory": ("#e8d0c8", "#e8d0c8"), "ink": ("#09070a", "#09070a"), "white": ("#ffffff", "#ffffff"), "black": ("#000000", "#000000")}

wd, ww = word_path("Cloak & Candle", 200)
files = []
def svg(name, w, h, body, grad):
    t = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">{GRAD if grad else ""}{body}</svg>'
    open(f"{OUT}/{name}.svg", "w").write(t); files.append((name, w, h))
for way, (fill, stroke) in WAYS.items():
    g = way == "rosegold"
    svg(f"cloak-and-candle-mark-{way}", 120, 140, MARK.format(c=stroke), False)
    svg(f"cloak-and-candle-wordmark-{way}", ww + 8, 212, f'<path transform="translate(4 6)" fill="{fill}" d="{wd}"/>', g)
    # horizontal lockup: mark at wordmark cap height, a gap of half the mark's width
    svg(f"cloak-and-candle-lockup-horizontal-{way}", 170 + ww + 8, 212, f'<g transform="translate(0 22) scale(1.2)">{MARK.format(c=stroke)}</g><path transform="translate(170 6)" fill="{fill}" d="{wd}"/>', g)
    # stacked lockup: mark centred above the wordmark
    W = ww + 8; svg(f"cloak-and-candle-lockup-stacked-{way}", W, 470, f'<g transform="translate({W/2-102:.1f} 0) scale(1.7)">{MARK.format(c=stroke)}</g><path transform="translate(4 250)" fill="{fill}" d="{wd}"/>', g)

# PNG renders (transparent), via Chromium
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for name, w, h in files:
        scale = 2400 / max(w, h)
        pg.set_viewport_size({"width": int(w * scale) + 2, "height": int(h * scale) + 2})
        body = open(f"{OUT}/{name}.svg").read().replace(f'width="{w:.0f}" height="{h:.0f}"', f'width="{w*scale:.0f}" height="{h*scale:.0f}" style="display:block"')
        pg.set_content(f'<html><body style="margin:0;background:transparent">{body}</body></html>')
        pg.wait_for_timeout(80)
        pg.screenshot(path=f"{OUT}/{name}.png", omit_background=True, clip={"x": 0, "y": 0, "width": int(w * scale), "height": int(h * scale)})
    b.close()
print(len(files), "logos in", OUT)
