"""A 16-second vertical launch video (TikTok, Reels, Shorts) with the game's own score as its sound.

    python3 tools/brand/make_crest.py      (once, for the crest)
    python3 tools/brand/make_tiktok.py     (needs imageio-ffmpeg: pip install imageio-ffmpeg)

The picture is drawn frame by frame in Chromium from the brand fonts, the crest and the Modern tour's screenshots
(which never show the secret twists). The sound is src/audio.js, the game's synthesised score and effects, rendered
offline in an OfflineAudioContext on the same timeline. Writes media/social/tiktok/the-betrayal-launch.mp4 (1080x1920,
30 fps, H.264 and AAC).
"""
import base64, pathlib, subprocess, tempfile
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = ROOT / 'worker' / 'public' / 'fonts'
LOGOS = ROOT / 'media' / 'logos'
SHOTS = ROOT / 'media' / 'web'
OUT = ROOT / 'media' / 'social' / 'tiktok'
FPS, DUR, W, H = 30, 16.0, 1080, 1920

def f(n): return (FONTS / n).as_uri()
def shot(n): return (SHOTS / f'tour-modern-{n}.jpg').as_uri()

# ---- the sound: scenes of the game's score, with its effects on the cuts ----
MUSIC = [(0, 'lobby'), (6.2, 'mission'), (11.4, 'night'), (13.2, 'final')]
SFX = [(2.5, 'snuff'), (3.3, 'seal'), (6.3, 'drum'), (9.1, 'vote'), (10.2, 'reveal'), (11.5, 'duck'), (13.3, 'chime')]
AUDIO_JS = """async ({dur, music, sfx}) => {
  const sr = 48000, ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  audioInit(ctx); MUSIC.start(); clearInterval(MUSIC.timer); MUSIC.timer = 1;
  const cues = [];
  for (let t = 0; t < dur; t += 0.25) cues.push(t);
  for (const t of cues) ctx.suspend(t).then(() => {
    for (const [at, name] of music) if (at >= t && at < t + 0.25) MUSIC.setScene(name);
    for (const [at, name] of sfx) if (at >= t && at < t + 0.25) { try { SFX[name]() } catch (e) {} }
    MUSIC.schedule(t + 0.6);
    if (t >= dur - 1.25 && !ctx._fading) { ctx._fading = 1; AU.master.gain.setValueAtTime(0.9, t); AU.master.gain.linearRampToValueAtTime(0.0001, dur - 0.05) }
    ctx.resume();
  });
  const buf = await ctx.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.89 / peak : 1, out = new DataView(new ArrayBuffer(44 + n * 4)), s = (o, x) => [...x].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); s(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); s(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * g)) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * g)) * 32767, true) }
  let bin = ''; const u = new Uint8Array(out.buffer); for (let i = 0; i < u.length; i += 32768) bin += String.fromCharCode(...u.subarray(i, i + 32768));
  return btoa(bin);
}"""

# ---- the picture: layers that fade and drift on a timeline; render(t) poses every one of them ----
PAGE = f"""<!doctype html><meta charset=utf-8><style>
@font-face{{font-family:Fell;src:url({f('IMFellDWPica-n400-latin.woff2')})}}
@font-face{{font-family:Fell;font-style:italic;src:url({f('IMFellDWPica-i400-latin.woff2')})}}
@font-face{{font-family:Sans;src:url({f('AlegreyaSans-n700-latin.woff2')});font-weight:700}}
@font-face{{font-family:SansSC;src:url({f('AlegreyaSansSC-n700-latin.woff2')});font-weight:700}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:{W}px;height:{H}px;overflow:hidden;background:#09070A;color:#E8D0C8}}
#bg{{position:absolute;inset:0;background:radial-gradient(ellipse 90% 55% at 50% 40%,#3a1d3c 0%,#251428 30%,#130D14 62%,#09070A 100%)}}
.L{{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center;opacity:0;will-change:opacity,transform}}
.say{{font-family:Fell;font-style:italic;font-size:78px;line-height:1.18;color:#F1DDD5;text-shadow:0 4px 30px rgba(0,0,0,.8);padding:0 80px;text-wrap:balance}}
.h{{font-family:Fell;font-size:104px;line-height:1.02;background:linear-gradient(172deg,#F4C9B7,#E6A58C 45%,#AE6249 85%);-webkit-background-clip:text;background-clip:text;color:transparent;padding:0 60px .1em}}
.eb{{font-family:SansSC;font-weight:700;font-size:34px;letter-spacing:.28em;text-transform:lowercase;color:#E6A58C}}
.cap{{font-family:Sans;font-weight:700;font-size:50px;line-height:1.2;color:#F1DDD5;padding:0 90px;text-shadow:0 4px 24px rgba(0,0,0,.9)}}
.phone{{background:#150d16;border:2px solid rgba(230,165,140,.5);border-radius:70px;padding:20px;box-shadow:0 40px 120px rgba(0,0,0,.8)}}
.phone .s{{border-radius:52px;overflow:hidden}} .phone img{{width:100%;display:block}}
.tv{{background:#0c080d;border:2px solid rgba(230,165,140,.45);border-radius:18px;padding:14px;box-shadow:0 40px 120px rgba(0,0,0,.8)}} .tv img{{width:100%;display:block;border-radius:8px}}
.candles{{display:flex;gap:44px;align-items:flex-end}}
.cd{{position:relative;width:46px;height:200px}} .cd .wax{{position:absolute;bottom:10px;left:8px;width:30px;height:140px;border-radius:4px;background:#EADBD2}}
.cd .base{{position:absolute;bottom:0;left:0;width:46px;height:12px;border-radius:3px;background:#AE6249}}
.cd .fl{{position:absolute;left:10px;top:4px;width:26px;height:40px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:radial-gradient(circle at 50% 70%,#FFF3D6 0 30%,#F6C98A 55%,rgba(246,201,138,0) 72%);filter:drop-shadow(0 0 18px #F6C98A)}}
</style>
<div id=bg></div>
<div class=L id=candles style="bottom:520px"><div class=candles>{''.join(f'<div class=cd id=c{i}><div class=fl></div><div class=wax></div><div class=base></div></div>' for i in range(7))}</div></div>
<div class=L id=t1 style="top:520px"><div class=say>Everyone swore an oath.</div></div>
<div class=L id=t2 style="top:720px"><div class=say style="color:#F4C9B7">Not everyone meant it.</div></div>
<div class=L id=role style="top:250px"><div class=phone style="width:560px"><div class=s style="height:1000px"><img src="{shot('phone-role')}"></div></div>
  <div class=cap style="margin-top:56px">Your secret role arrives on your phone.<br>Nobody else sees it.</div></div>
<div class=L id=quiz style="top:300px"><div class=eb>the trials</div><div class=tv style="width:960px;margin-top:30px"><img src="{shot('tv-quiz')}"></div>
  <div class=phone style="width:330px;margin-top:-120px;margin-left:520px"><div class=s style="height:560px"><img src="{shot('phone-quiz')}"></div></div>
  <div class=cap style="margin-top:40px">Play for the Purse.<br>The Forsworn lose on purpose.</div></div>
<div class=L id=vote style="top:330px"><div class=eb>the reckoning</div><div class=tv style="width:960px;margin-top:30px"><img id=vimg src="{shot('tv-vote')}"></div>
  <div class=cap id=vcap style="margin-top:60px">Argue it out. Vote in secret.</div></div>
<div class=L id=night style="top:560px"><div class=h style="font-size:150px">Heads down.</div><div class=say style="font-size:66px;margin-top:40px">By morning, someone is gone.</div></div>
<div class=L id=end style="top:300px"><img src="{(LOGOS / 'the-betrayal-crest.svg').as_uri()}" style="width:420px">
  <img src="{(LOGOS / 'the-betrayal-wordmark-rosegold.svg').as_uri()}" style="width:760px;margin-top:40px">
  <div class=eb style="margin-top:44px">the party game of loyalty and lies</div>
  <div class=cap style="margin-top:44px;font-size:46px">8 to 24 players · a phone each · no app</div>
  <div class=cap style="margin-top:36px;color:#E6A58C">Book a Table · thebetrayal.co.uk</div></div>
<script>
const $ = id => document.getElementById(id), clamp = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);
function show(id, a, b, t, rise = 60, fade = .45) {{
  const i = ease(clamp((t - a) / fade)), o = ease(clamp((b - t) / fade)), v = Math.min(i, o), el = $(id);
  el.style.opacity = v; el.style.transform = `translateY(${{(1 - i) * rise}}px) scale(${{1 + (t - a) * .006}})`;
}}
function render(t) {{
  show('candles', -1, 6.0, t, 0); show('t1', .35, 3.25, t); show('t2', 1.55, 3.25, t);
  for (let i = 0; i < 7; i++) {{ const out = i === 4 && t > 2.5, fl = $('c' + i).firstChild;
    fl.style.opacity = out ? Math.max(0, 1 - (t - 2.5) * 4) : .85 + .15 * Math.sin(t * 9 + i * 1.7);
    fl.style.transform = `scale(${{1 + .05 * Math.sin(t * 7 + i)}},${{1 + .08 * Math.sin(t * 11 + i * 2)}})` }}
  $('candles').style.opacity = Math.min(1, clamp(t / .5)) * (t < 3.3 ? 1 : Math.max(0, 1 - (t - 3.3) * 2.5));
  show('role', 3.3, 6.2, t, 120); show('quiz', 6.2, 9.1, t, 120); show('vote', 9.1, 11.45, t, 120);
  const rv = t > 10.2; $('vimg').src = rv ? {shot('tv-reveal')!r} : {shot('tv-vote')!r}; $('vcap').textContent = rv ? 'Then the table finds out what they were.' : 'Argue it out. Vote in secret.';
  show('night', 11.45, 13.25, t, 0, .5); show('end', 13.25, 99, t, 80, .6);
  $('bg').style.filter = `brightness(${{t > 11.3 && t < 13.2 ? .55 : 1}})`;
}}
</script>"""

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
        td = pathlib.Path(td); b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        a = b.new_page(); a.set_content('<script>' + (ROOT / 'src' / 'audio.js').read_text() + '</script>')
        wav = td / 'sound.wav'; wav.write_bytes(base64.b64decode(a.evaluate(AUDIO_JS, {'dur': DUR, 'music': MUSIC, 'sfx': SFX})))
        pg = b.new_page(viewport={'width': W, 'height': H}); (td / 'v.html').write_text(PAGE, encoding='utf-8')
        pg.goto((td / 'v.html').as_uri(), wait_until='networkidle'); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(300)
        frames = td / 'f'; frames.mkdir()
        for i in range(int(DUR * FPS)):
            pg.evaluate(f'render({i / FPS})')
            if i % 30 == 0: pg.wait_for_timeout(60)
            pg.screenshot(path=str(frames / f'{i:04d}.jpg'), type='jpeg', quality=94)
        b.close()
        mp4 = OUT / 'the-betrayal-launch.mp4'
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', str(frames / '%04d.jpg'), '-i', str(wav),
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(mp4)], check=True)
        (OUT / 'the-betrayal-launch-sound.wav').write_bytes(wav.read_bytes())
        # the profile picture, with the crest set well inside the circle TikTok crops to (it looks cramped edge to edge)
        av = p.chromium.launch(); pp = av.new_page(viewport={'width': 1080, 'height': 1080})
        pp.set_content(f'''<body style="margin:0;width:1080px;height:1080px;display:grid;place-items:center;
          background:radial-gradient(circle at 50% 50%,#3a1d3c 0%,#251428 36%,#130D14 64%,#09070A 100%)">
          <div style="height:640px;aspect-ratio:1320/1560">{(LOGOS / 'the-betrayal-crest.svg').read_text().replace('width="1320" height="1560"', 'width="100%" height="100%"')}</div></body>''')
        pp.wait_for_timeout(300); pp.screenshot(path=str(OUT / 'tiktok-profile-picture.png')); av.close()
    print(mp4.relative_to(ROOT), mp4.stat().st_size // 1024, 'KB')

if __name__ == '__main__':
    main()
