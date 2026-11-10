# WebP copies of every screenshot site/pages/tour.html shows, at the widths it offers by screen size (srcset): a phone
# at 390, 585 and 780 wide, the TV at 640, 960 and 1280, beside each JPEG in media/web/ (the JPEG stays as the
# fallback and as the TV's enlarged view without WebP). Run after tools/modern-shots.py or tools/webshots.py, then ./build.sh.
#   python3 tools/tour-webp.py
import os, re
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WEB = os.path.join(ROOT, "media", "web")
page = open(os.path.join(ROOT, "site", "pages", "tour.html"), encoding="utf-8").read()
for name in sorted(set(re.findall(r'src="/media/([\w-]+)\.jpg"', page))):
    im = Image.open(os.path.join(WEB, name + ".jpg")).convert("RGB")
    for w in ((640, 960, 1280) if im.width > im.height else (390, 585, 780)):
        p = os.path.join(WEB, f"{name}-{w}.webp")
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(p, "WEBP", quality=78, method=6); print(os.path.basename(p), os.path.getsize(p) // 1024, "KB")
