"""The Betrayal's crest: the diamond mark engraved in detail, for large sizes (social posts, print, profile pictures).
The plain mark (media/logos/the-betrayal-mark-*.svg) stays the logo for small sizes; this is the same drawing, dressed.

    python3 tools/brand/make_crest.py

Writes media/logos/the-betrayal-crest.svg and the-betrayal-crest.png (3000px tall, transparent).
"""
import math, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
LOGOS = ROOT / 'media' / 'logos'

def diamond(cx, cy, rx, ry):
    return f'M{cx} {cy - ry}L{cx + rx} {cy}L{cx} {cy + ry}L{cx - rx} {cy}Z'

def along(cx, cy, rx, ry, step):
    # points spaced evenly along a diamond's edge
    corners = [(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)]
    pts = []
    for i in range(4):
        (x1, y1), (x2, y2) = corners[i], corners[(i + 1) % 4]
        n = max(1, round(math.hypot(x2 - x1, y2 - y1) / step))
        pts += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(n)]
    return pts

def sparkle(x, y, r):
    return (f'<path d="M{x} {y - r}Q{x + r * .18} {y - r * .18} {x + r} {y}Q{x + r * .18} {y + r * .18} {x} {y + r}'
            f'Q{x - r * .18} {y + r * .18} {x - r} {y}Q{x - r * .18} {y - r * .18} {x} {y - r}Z" fill="url(#rg)"/>')

CLOAK = ('M60 29C51 35 44.5 44 44 56c-.3 6 1.5 8-.5 14-2.5 8-1.5 17-3.5 26h40c-2-9-1-18-3.5-26-2-6-.2-8-.5-14'
         '-.5-12-7-21-16-27z')
HOOD = 'M60 41c-6 5-9 10.5-9 16 0 6 4 9.5 9 9.5s9-3.5 9-9.5c0-5.5-3-11-9-16z'
FLAME = 'M60 46.5c3.4 4.8 5.2 8 5.2 10.6a5.2 5.2 0 0 1-10.4 0c0-2.6 1.8-5.8 5.2-10.6z'
CORE = 'M60 51.5c1.6 2.4 2.4 3.9 2.4 5.2a2.4 2.4 0 0 1-4.8 0c0-1.3.8-2.8 2.4-5.2z'

rays = ''.join(f'<line x1="60" y1="60" x2="{60 + 70 * math.cos(a):.2f}" y2="{60 + 70 * math.sin(a):.2f}"/>'
               for a in (i * math.pi / 36 for i in range(72)))
beads = ''.join(f'<circle cx="{x:.2f}" cy="{y:.2f}" r=".42"/>' for x, y in along(60, 70, 49.5, 59.5, 2.6))
ticks = ''.join(f'<circle cx="{x:.2f}" cy="{y:.2f}" r=".22"/>' for x, y in along(60, 70, 58.2, 68.6, 1.6))
folds = ('<path d="M60 73c-.4 8-.8 15.5-1.2 23" stroke-width=".9"/>'
         '<path d="M50 77c-1 6.5-2 13-3 19M70 77c1 6.5 2 13 3 19" stroke-width=".7"/>'
         '<path d="M54.5 75c-.6 7-1.2 14-2 21M65.5 75c.6 7 1.2 14 2 21" stroke-width=".35" opacity=".8"/>'
         '<path d="M47 60c-.8 4-1.2 7-2 10M73 60c.8 4 1.2 7 2 10" stroke-width=".35" opacity=".8"/>')
arms = ''.join(
    f'<path d="M{a} 70h{d * 8.5}" stroke-width="1.3"/><path d="M{a + d * 2} 67.6v4.8M{a + d * 5} 68.4v3.2" stroke-width=".5"/>'
    f'<path d="{diamond(a + d * 11.5, 70, 2, 2.6)}" fill="url(#rg)" stroke="none"/>'
    for a, d in ((27, -1), (93, 1)))

SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -8 132 156" width="1320" height="1560">
<defs>
 <linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="30" y1="-4" x2="80" y2="144">
  <stop offset="0" stop-color="#fbe0d2"/><stop offset=".22" stop-color="#f4c9b7"/><stop offset=".45" stop-color="#e6a58c"/>
  <stop offset=".62" stop-color="#f0bba4"/><stop offset=".8" stop-color="#ae6249"/><stop offset="1" stop-color="#763c29"/></linearGradient>
 <radialGradient id="field" cx="60" cy="58" r="58" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#3d1f40"/><stop offset=".55" stop-color="#231225"/><stop offset="1" stop-color="#110a12"/></radialGradient>
 <radialGradient id="glow" cx="60" cy="57" r="16" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#f6c98a" stop-opacity=".75"/><stop offset=".45" stop-color="#e6a58c" stop-opacity=".22"/><stop offset="1" stop-color="#e6a58c" stop-opacity="0"/></radialGradient>
 <linearGradient id="fire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3d6"/><stop offset=".55" stop-color="#f6c98a"/><stop offset="1" stop-color="#e0895a"/></linearGradient>
 <pattern id="hatch" width="1.15" height="1.15" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
  <line x1="0" y1="0" x2="0" y2="1.15" stroke="#e6a58c" stroke-width=".32" stroke-opacity=".55"/></pattern>
 <clipPath id="inner"><path d="{diamond(60, 70, 44, 54)}"/></clipPath>
 <clipPath id="cloak"><path d="{CLOAK}"/></clipPath>
</defs>
<path d="{diamond(60, 70, 55, 65)}" fill="#0c080d"/>
<path d="{diamond(60, 70, 44, 54)}" fill="url(#field)"/>
<g clip-path="url(#inner)" stroke="url(#rg)" stroke-width=".22" opacity=".32">{rays}</g>
<circle cx="60" cy="57" r="16" fill="url(#glow)"/>
<g fill="url(#rg)">{beads}{ticks}</g>
<g fill="none" stroke="#2a130e" stroke-width="2.4" stroke-linejoin="round" transform="translate(.5 .7)" opacity=".85">
 <path d="{diamond(60, 70, 55, 65)}"/></g>
<g fill="none" stroke="url(#rg)" stroke-linecap="round" stroke-linejoin="round">
 <path d="{diamond(60, 70, 55, 65)}" stroke-width="2.2"/>
 <path d="{diamond(60, 70, 59.6, 70.4)}" stroke-width=".45"/>
 <path d="{diamond(60, 70, 44, 54)}" stroke-width="1"/>
 <path d="{diamond(60, 70, 42.2, 51.8)}" stroke-width=".3" opacity=".8"/>
</g>
<path d="{CLOAK}" fill="#1a0f1b"/>
<rect x="36" y="25" width="48" height="75" fill="url(#hatch)" clip-path="url(#cloak)"/>
<g fill="none" stroke="url(#rg)" stroke-linecap="round" stroke-linejoin="round">
 <path d="{CLOAK}" stroke-width="1.7"/>
 <path d="M60 33.5c-6.6 4.8-11.2 11.6-12 20.5" stroke-width=".4" opacity=".75"/>
 <path d="M60 33.5c6.6 4.8 11.2 11.6 12 20.5" stroke-width=".4" opacity=".75"/>
 {folds}
 <path d="M41.5 96h37" stroke-width=".5" opacity=".7"/>
</g>
<path d="{HOOD}" fill="#0b070c" stroke="url(#rg)" stroke-width="1.3"/>
<path d="{FLAME}" fill="url(#fire)"/><path d="{CORE}" fill="#fffaf0"/>
<g fill="none" stroke="url(#rg)" stroke-linecap="round">
 <circle cx="60" cy="70.6" r="1.9" stroke-width=".9"/><circle cx="60" cy="70.6" r=".6" fill="url(#rg)" stroke="none"/>
 {arms}
</g>
<g fill="url(#rg)">
 <path d="{diamond(60, -2.6, 2.2, 3.4)}"/><path d="{diamond(60, 142.6, 2.2, 3.4)}"/>
 <circle cx="60" cy="3.6" r=".7"/><circle cx="60" cy="136.4" r=".7"/>
</g>
{sparkle(60, 11.5, 2.4)}{sparkle(60, 128.5, 2.4)}{sparkle(32, 38, 1.3)}{sparkle(88, 38, 1.3)}{sparkle(32, 102, 1.3)}{sparkle(88, 102, 1.3)}
</svg>'''

if __name__ == '__main__':
    (LOGOS / 'the-betrayal-crest.svg').write_text(SVG)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1320, 'height': 1560}, device_scale_factor=3000 / 1560)
        pg.set_content(f'<html><body style="margin:0;background:transparent">{SVG}</body></html>')
        pg.screenshot(path=str(LOGOS / 'the-betrayal-crest.png'), omit_background=True); b.close()
    print('crest written')
