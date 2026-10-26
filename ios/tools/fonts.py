# The app's fonts, made from the website's own files (worker/public/fonts, OFL): each family's latin and latin-ext
# subsets joined into one TTF, and Grenze Gotisch (a variable font on the web) fixed at the two weights the game uses.
# Run from the repo root:  pip install fonttools brotli && python3 ios/tools/fonts.py
import os, tempfile
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
from fontTools.varLib.instancer import instantiateVariableFont

SRC, OUT = "worker/public/fonts", "ios/TheBetrayal/Resources/Fonts"
FACES = [  # (web file stem, weight to fix for a variable font, output name, family, style)
    ("AlegreyaSans-n400", None, "AlegreyaSans-Regular", "Alegreya Sans", "Regular"),
    ("AlegreyaSans-n500", None, "AlegreyaSans-Medium", "Alegreya Sans Medium", "Regular"),
    ("AlegreyaSans-n700", None, "AlegreyaSans-Bold", "Alegreya Sans", "Bold"),
    ("AlegreyaSansSC-n500", None, "AlegreyaSansSC-Medium", "Alegreya Sans SC Medium", "Regular"),
    ("AlegreyaSansSC-n700", None, "AlegreyaSansSC-Bold", "Alegreya Sans SC", "Bold"),
    ("GrenzeGotisch-n300_900", 400, "GrenzeGotisch-Regular", "Grenze Gotisch", "Regular"),
    ("GrenzeGotisch-n300_900", 600, "GrenzeGotisch-SemiBold", "Grenze Gotisch SemiBold", "Regular"),
    ("IMFellDWPica-n400", None, "IMFellDWPica-Roman", "IM FELL DW Pica", "Regular"),
    ("IMFellDWPica-i400", None, "IMFellDWPica-Italic", "IM FELL DW Pica", "Italic"),
]

def load(path, wght):
    f = TTFont(path)
    f.flavor = None
    if wght and "fvar" in f:
        f = instantiateVariableFont(f, {"wght": wght})
    return f

def rename(f, ps, family, style):
    n = f["name"]
    for rec in list(n.names):
        if rec.nameID in (1, 2, 4, 6, 16, 17):
            n.removeNames(nameID=rec.nameID)
    full = family if style == "Regular" else family + " " + style
    for nid, val in ((1, family), (2, style), (4, full), (6, ps)):
        n.setName(val, nid, 3, 1, 0x409)
        n.setName(val, nid, 1, 0, 0)

os.makedirs(OUT, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for stem, wght, out, family, style in FACES:
        parts = []
        for sub in ("latin", "latin-ext"):
            p = os.path.join(SRC, f"{stem}-{sub}.woff2")
            if not os.path.exists(p):
                continue
            f = load(p, wght)
            q = os.path.join(tmp, f"{out}-{sub}.ttf")
            f.save(q)
            parts.append(q)
        merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
        rename(merged, out, family, style)
        dest = os.path.join(OUT, out + ".ttf")
        merged.save(dest)
        print(dest, len(merged.getBestCmap()), "characters")
