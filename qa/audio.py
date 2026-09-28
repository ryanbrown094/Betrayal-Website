# Render every scene and every sound effect offline and measure levels, so the mix is checked by numbers, not by ear.
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8716", "--directory", "worker/public"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
JS = r"""async () => {
  const out = {};
  const measure = buf => { let pk = 0, sum = 0, n = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; sum += d[i] * d[i]; n++ } } return { peak: +pk.toFixed(3), rmsDb: +(10 * Math.log10(sum / n + 1e-12)).toFixed(1) } };
  for (const scene of Object.keys(SCENES)) {
    const ctx = new OfflineAudioContext(2, 44100 * 24, 44100); audioInit(ctx); MUSIC.timer = 1; MUSIC.scene = null; MUSIC.pad = null; MUSIC.next = 0; MUSIC.start(); MUSIC.setScene(scene); MUSIC.schedule(24);
    out["scene:" + scene] = measure(await ctx.startRendering());
  }
  for (const name of Object.keys(SFX)) {
    const ctx = new OfflineAudioContext(2, 44100 * 6, 44100); audioInit(ctx); muted = false; SFX[name](3);
    out["sfx:" + name] = measure(await ctx.startRendering());
  }
  { const ctx = new OfflineAudioContext(2, 44100 * 16, 44100); audioInit(ctx); muted = false; ROLL.g = null; ROLL.start(); out["sfx:drumroll(15s)"] = measure(await ctx.startRendering()); ROLL.g = null }
  // worst case: the loudest scene with the loudest stinger on top
  const ctx = new OfflineAudioContext(2, 44100 * 8, 44100); audioInit(ctx); MUSIC.timer = 1; MUSIC.scene = null; MUSIC.pad = null; MUSIC.next = 0; MUSIC.start(); MUSIC.setScene("final"); MUSIC.schedule(8); SFX.win(); SFX.sting();
  out["worst:final+win+sting"] = measure(await ctx.startRendering());
  return out }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8716/play.html"); pg.wait_for_timeout(1000)
    res = pg.evaluate(JS)
    for k, v in res.items(): print(f"{k:28s} peak {v['peak']:<6} rms {v['rmsDb']} dBFS" + ("   <-- CLIPS" if v["peak"] >= 1 else "") + ("   <-- silent?" if v["rmsDb"] < -70 else ""))
    print("page errors:", errs); b.close()
srv.terminate()
