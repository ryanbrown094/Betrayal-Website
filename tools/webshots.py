# Web-sized copies of the media screenshots for the site's tour page: the TV at 1280x720, the phone at 780 wide (2x),
# as JPEGs in media/web/ (build.sh copies them to worker/public/media/). Run after qa/media.py.
# python3 tools/webshots.py
import os
from PIL import Image
SRC, OUT = "media/screenshots", "media/web"
os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    im = Image.open(os.path.join(SRC, f)).convert("RGB"); name = "tour-" + os.path.splitext(f)[0] + ".jpg"
    size = (1280, 720) if f.startswith("tv-") else (780, round(im.height * 780 / im.width))
    im.resize(size, Image.LANCZOS).save(os.path.join(OUT, name), "JPEG", quality=80, optimize=True, progressive=True)
    print(name, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")
