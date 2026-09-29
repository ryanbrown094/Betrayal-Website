# The secondary mark: the cracked wax seal the TV shows when a Forsworn is revealed (a broken oath). Built from the
# game's own artwork (src/art.js, via the built page), so the mark and the game never drift apart.
# Run ./build.sh first. python3 tools/brand/make_seal.py
#   media/logos/the-betrayal-seal.svg / .png            the wine seal with its rose crack, transparent
#   media/logos/the-betrayal-seal-mono-{rose,ivory,ink}.svg   one colour, for print, embossing and small sizes
#   worker/public/icon-180.png, icon-512.png, favicon-32.png   the app and browser icons: the seal on ink
import os, sys, subprocess, time, base64
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); os.chdir(ROOT)
PORT = 8751
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", "worker/public"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
CRACK = '<path d="M52 4 L47 22 L56 34 L44 50 L55 63 L46 78 L51 96"/><path d="M47 22 L33 28 M56 34 L70 30 M44 50 L28 56 M55 63 L72 70"/>'
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); pg.goto(f"http://localhost:{PORT}/play.html"); pg.wait_for_timeout(800)
        # the seal in full colour: the game's defs inlined, the wax colour fixed, the crack drawn in
        svg = pg.evaluate("""(crack)=>{ const ICON = "candle";
          const defs = ART.defs().match(/<defs>[\\s\\S]*<\\/defs>/)[0].replace(/<symbol[\\s\\S]*?<\\/symbol>/g, '').replace(/<pattern[\\s\\S]*?<\\/pattern>/g, '');
          const inner = ART.bigSeal('t', ICON).replace(/^<svg[^>]*>/, '').replace(/<\\/svg>$/, '').replace(/var\\(--c\\)/g, '#8e1b45');
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + defs.replace('</defs>', '<clipPath id="c-wax"><path d="' + ART.blob2 + '"/></clipPath></defs>') + inner +
            '<g clip-path="url(#c-wax)" fill="none" stroke="#ffd7e6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + crack + '</g></svg>'}""", CRACK)
        # one colour: the wax shape, a ring and the crack cut through it (the crack and ring in the ground colour)
        mono = lambda c: pg.evaluate("""([c, crack])=>{ const g = c === '#09070a' ? '#e8d0c8' : '#09070a';
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="c-wax"><path d="' + ART.blob2 + '"/></clipPath></defs><path d="' + ART.blob2 + '" fill="' + c + '"/>' +
            '<circle cx="50.8" cy="51" r="33" fill="none" stroke="' + g + '" stroke-opacity=".55" stroke-width="2"/>' +
            '<g clip-path="url(#c-wax)" fill="none" stroke="' + g + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + crack + '</g></svg>'}""", [c, CRACK])
        os.makedirs("media/logos", exist_ok=True)
        open("media/logos/the-betrayal-seal.svg", "w").write(svg)
        for name, c in [("rose", "#e6a58c"), ("ivory", "#e8d0c8"), ("ink", "#09070a")]: open(f"media/logos/the-betrayal-seal-mono-{name}.svg", "w").write(mono(c))
        def render(markup, size, out, bg=None):
            pg.set_viewport_size({"width": size, "height": size})
            pg.set_content(f'<html><body style="margin:0;background:{bg or "transparent"}"><div style="width:{size}px;height:{size}px;display:grid;place-items:center">'
                           f'<img style="width:{round(size * (.84 if bg else 1))}px;height:{round(size * (.84 if bg else 1))}px" src="data:image/svg+xml;base64,{base64.b64encode(markup.encode()).decode()}"></div></body></html>')
            pg.wait_for_timeout(150); pg.screenshot(path=out, omit_background=not bg)
        render(svg, 1024, "media/logos/the-betrayal-seal.png")
        for size, out in [(512, "worker/public/icon-512.png"), (180, "worker/public/icon-180.png"), (32, "worker/public/favicon-32.png")]: render(svg, size, out, "#09070a")
        b.close()
finally:
    srv.terminate()
print("seal written: media/logos/the-betrayal-seal*.svg/png, worker/public/icon-*.png, favicon-32.png")
