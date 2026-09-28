# One-off: moves the v17 palette (walnut, brass, oxblood) to the Cloak & Candle palette (plum ink, rose-gold, wine).
# Rules work in HSL so every shade keeps its place relative to its neighbours. Candle flames are left alone.
# Usage: python3 tools/recolour.py src/style.css src/art.js   (rewrites the files in place; prints a mapping)
import colorsys, re, sys

def conv(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255); H = h * 360
    if s < 0.06:                                   # greys, black, white: untouched
        return r, g, b
    if 8 < H < 60 and l < 0.30:                    # walnut / soot / peat backgrounds -> plum ink
        H, s = 292, min(s, 0.45) * 0.8
    elif 25 <= H < 60 and s >= 0.30 and l < 0.92:  # brass, gold, candle-lit stone -> rose-gold
        H, s = 16 + (H - 40) * 0.35, s * 0.82
    elif 8 < H < 60:                               # tallow and parchment text -> cooler ivory
        H, s = 24, s * 0.55
    elif H >= 340 or H <= 8:                       # oxblood and blood -> wine
        H = 338 if H >= 340 else 338 + H * 0.2
    R, G, B = colorsys.hls_to_rgb((H % 360) / 360, l, max(0, min(1, s)))
    return round(R * 255), round(G * 255), round(B * 255)

hexre = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
rgbre = re.compile(r"rgba?\((\d+),\s*(\d+),\s*(\d+)")
seen = {}
def hx(m):
    v = m.group(1)
    if len(v) == 3: v = "".join(c * 2 for c in v)
    r, g, b = (int(v[i:i + 2], 16) for i in (0, 2, 4))
    o = "#%02x%02x%02x" % conv(r, g, b); seen[m.group(0)] = o; return o
def rg(m):
    r, g, b = conv(*map(int, m.groups()))
    return m.group(0).split("(")[0] + "(%d,%d,%d" % (r, g, b)
for f in sys.argv[1:]:
    out = []
    for line in open(f).read().split("\n"):
        if "flame" in line or "fog" in line.lower() and "--fog:" in line: out.append(line); continue
        out.append(rgbre.sub(rg, hexre.sub(hx, line)))
    open(f, "w").write("\n".join(out))
for k, v in sorted(seen.items()): print(k, "->", v)
