# The home page's hero for Modern: the TV's join screen with three phones in front of it (a Forsworn's role, the
# vote, the night), from the tour screenshots (python3 tools/modern-shots.py first). python3 tools/hero-modern.py
import os
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WEB = os.path.join(ROOT, "media", "web")
W, H = 1920, 1080
bg = Image.new("RGB", (W, H), (9, 7, 10)); g = ImageDraw.Draw(bg)
for r in range(900, 0, -6):  # a warm glow behind the TV
    a = int(38 * (1 - r / 900)); g.ellipse((W * .42 - r * 1.3, H * .46 - r * .8, W * .42 + r * 1.3, H * .46 + r * .8), fill=(9 + a, 7 + a // 3, 10 + a // 2))
def rounded(im, rad):
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), rad, fill=255); o = im.convert("RGBA"); o.putalpha(m); return o
def shadow(canvas, box, rad, blur, alpha):
    s = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); ImageDraw.Draw(s).rounded_rectangle(box, rad, fill=(0, 0, 0, alpha)); canvas.alpha_composite(s.filter(ImageFilter.GaussianBlur(blur)))
c = bg.convert("RGBA")
tv = Image.open(os.path.join(WEB, "tour-modern-tv-lobby.jpg")).convert("RGB").resize((1100, 619), Image.LANCZOS)
tx, ty = 70, 200
shadow(c, (tx - 10, ty - 10 + 30, tx + 1110, ty + 639 + 30), 22, 40, 170)
bez = Image.new("RGBA", (1124, 643), (24, 16, 26, 255)); c.alpha_composite(rounded(bez, 22), (tx - 12, ty - 12)); c.alpha_composite(rounded(tv, 12), (tx, ty))
for i, (name, x, y, rot) in enumerate([("role", 1330, 250, 5), ("vote", 1560, 320, -3), ("night", 1745, 200, 4)][::-1]):
    ph = Image.open(os.path.join(WEB, "tour-modern-phone-" + name + ".jpg")).convert("RGB").crop((0, 0, 780, 1500)).resize((270, 519), Image.LANCZOS)
    body = Image.new("RGBA", (290, 539), (20, 13, 22, 255)); body = rounded(body, 40); body.alpha_composite(rounded(ph, 30), (10, 10))
    body = body.rotate(rot, resample=Image.BICUBIC, expand=True)
    sh = Image.new("RGBA", c.size, (0, 0, 0, 0)); sh.alpha_composite(Image.new("RGBA", body.size, (0, 0, 0, 150)), (x - 145 + 20, y + 40)); m = Image.new("L", c.size, 0); m.paste(body.split()[3], (x - 145 + 20, y + 40)); sh.putalpha(m.point(lambda v: v * 150 // 255)); c.alpha_composite(sh.filter(ImageFilter.GaussianBlur(28)))
    c.alpha_composite(body, (x - 145, y))
out = os.path.join(WEB, "hero-modern.jpg"); c.convert("RGB").save(out, "JPEG", quality=82, optimize=True, progressive=True); print(out, os.path.getsize(out) // 1024, "KB")
# smaller WebP copies of the home page's three images, which the page offers by screen size (site/index.html srcset)
def webp(im, name, widths):
    for w in widths:
        p = os.path.join(WEB, f"{name}-{w}.webp"); im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(p, "WEBP", quality=78, method=6); print(p, os.path.getsize(p) // 1024, "KB")
webp(c.convert("RGB"), "hero-modern", (640, 960, 1280, 1920))
webp(Image.open(os.path.join(WEB, "tour-modern-tv-quiz.jpg")).convert("RGB"), "tour-modern-tv-quiz", (640, 960, 1280))
webp(Image.open(os.path.join(WEB, "tour-modern-phone-role.jpg")).convert("RGB"), "tour-modern-phone-role", (390, 780))
