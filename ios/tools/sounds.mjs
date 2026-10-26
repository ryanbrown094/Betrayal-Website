// The app's music and sounds, rendered from the website's own synthesiser (src/audio.js, built into
// worker/public/modern.html) in headless Chromium: each scene of the score as a seamless loop of 16 bars, and each sound
// effect the Modern page plays. The app plays these files and nothing else.
// Run from the repo root (Playwright with Chromium, and ffmpeg):  node ios/tools/sounds.mjs
import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright"); // a global install works too (NODE_PATH)

const OUT = "ios/TheBetrayal/Resources/Sound", RATE = 44100, BARS = 16, TAIL = 5;
const SFX = ["chime", "drum", "beat", "alarm", "seal", "snuff", "gold", "dawn", "poison", "reveal", "win"];

const render = async ([what, name, bars, tail, rate]) => {
  const pack = (chs) => { // 16-bit stereo PCM, base64
    const n = chs[0].length, b = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) b[i * 2 + c] = Math.max(-32768, Math.min(32767, Math.round(chs[c][i] * 32767)));
    const u = new Uint8Array(b.buffer); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  if (what === "scene") {
    const sc = SCENES[name], loop = bars * 16 * (60 / sc.bpm / 4), ctx = new OfflineAudioContext(2, Math.ceil(rate * (loop + tail)), rate);
    audioInit(ctx); muted = false; MUSIC.timer = 1; MUSIC.scene = null; MUSIC.bus = null; MUSIC.next = 0; MUSIC.start(); MUSIC.setScene(name);
    // the draught through the hall at its level from the first sample, so the loop doesn't swell at its start
    MUSIC.wind.gain.cancelScheduledValues(0); MUSIC.wind.gain.setValueAtTime(Math.max(0.0001, sc.wind), 0);
    // notes start only within the loop; the tail (the last notes ringing on) is folded back onto the start
    MUSIC.schedule(loop - 0.001);
    const buf = await ctx.startRendering(), n = Math.round(rate * loop), out = [];
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c), o = new Float32Array(n); o.set(d.subarray(0, n)); for (let i = n; i < d.length && i - n < n; i++) o[i - n] += d[i]; out.push(o); }
    return pack(out);
  }
  const ctx = new OfflineAudioContext(2, rate * 7, rate); audioInit(ctx); muted = false;
  SFX[name](3);
  const buf = await ctx.startRendering(), out = [];
  let last = 0; // trimmed once it has died away
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > 0.0003) { last = i; break; } }
  const n = Math.min(buf.length, last + Math.round(rate * 0.05));
  for (let c = 0; c < 2; c++) out.push(buf.getChannelData(c).slice(0, n));
  return pack(out);
};

const wav = (pcm) => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

fs.mkdirSync(OUT, { recursive: true });
const root = path.resolve("worker/public");
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(8731, "127.0.0.1");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sounds-"));
const browser = await chromium.launch(), pg = await browser.newPage(), errs = [];
pg.on("pageerror", (e) => errs.push(String(e)));
await pg.goto("http://127.0.0.1:8731/modern.html"); await pg.waitForTimeout(800);
const jobs = [...(await pg.evaluate("Object.keys(SCENES)")).map((k) => ["scene", k]), ...SFX.map((k) => ["sfx", k])];
for (const [what, name] of jobs) {
  const pcm = Buffer.from(await pg.evaluate(render, [what, name, BARS, TAIL, RATE]), "base64");
  const w = path.join(tmp, name + ".wav"); fs.writeFileSync(w, wav(pcm));
  const dest = path.join(OUT, (what === "scene" ? "music-" : "sfx-") + name + ".m4a");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", w, "-c:a", "aac", "-b:a", what === "scene" ? "128k" : "96k", dest]);
  let peak = 0; for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  console.log(dest.padEnd(52), (pcm.length / 4 / RATE).toFixed(1).padStart(6), "s  peak", (peak / 32767).toFixed(2), " ", Math.round(fs.statSync(dest).size / 1024), "KB");
}
await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true });
if (errs.length) console.error("page errors:", errs);
