/* ===================== SOUND: everything is synthesised in the browser ===================== */
let AC = null, muted = false;
const MUSICVOL = 1.1; // the score is short notes, not held chords: it sits higher on the bus to carry the same weight
const AU = { master: null, music: null, sfx: null, rev: null, noise: null };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function audioInit(ctx) {
  AC = ctx;
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.28;
  AU.master = AC.createGain(); AU.master.gain.value = 0.9;
  AU.master.connect(comp); comp.connect(AC.destination);
  AU.music = AC.createGain(); AU.music.gain.value = MUSICVOL; AU.music.connect(AU.master);
  AU.sfx = AC.createGain(); AU.sfx.gain.value = 0.95; AU.sfx.connect(AU.master);
  // generated hall: 3.2 s of decaying, darkening noise
  const len = Math.floor(AC.sampleRate * 3.2), ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { const t = i / len, w = Math.random() * 2 - 1; lp += (w - lp) * (0.55 - 0.45 * t); d[i] = lp * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1) }
  }
  const conv = AC.createConvolver(); conv.buffer = ir;
  AU.rev = AC.createGain(); AU.rev.gain.value = 1;
  const wet = AC.createGain(); wet.gain.value = 0.4;
  AU.rev.connect(conv); conv.connect(wet); wet.connect(AU.master);
  const nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AU.noise = nb;
}
function out(node, bus, send) { node.connect(bus || AU.sfx); if (send) { const g = AC.createGain(); g.gain.value = send; node.connect(g); g.connect(AU.rev) } }
// place a voice left or right (older browsers without a stereo panner just get it in the middle)
function panned(node, p) { if (!p || !AC.createStereoPanner) return node; const pn = AC.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, p)); node.connect(pn); return pn }
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.02, dur));
}
function vTone(o) {
  const t = o.t, osc = AC.createOscillator(), g = AC.createGain();
  osc.type = o.type || "sine"; osc.frequency.setValueAtTime(o.f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + o.dur * (o.slideAt || 0.8));
  if (o.detune) osc.detune.value = o.detune;
  env(g, t, o.a || 0.01, o.vol, o.dur);
  let node = osc;
  if (o.lp) { const f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(o.lp, t); if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + o.dur * 0.7); f.Q.value = o.q || 0.7; osc.connect(f); node = f }
  node.connect(g); out(panned(g, o.pan), o.bus, o.rev);
  osc.start(t); osc.stop(t + o.dur + 0.1);
}
function vNoise(o) {
  const t = o.t, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = AU.noise; src.loop = true; f.type = o.type || "lowpass"; f.frequency.setValueAtTime(o.f, t); f.Q.value = o.q || 0.8;
  if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + o.dur);
  if (o.swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + o.dur * o.swell); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur) }
  else env(g, t, o.a || 0.005, o.vol, o.dur);
  src.connect(f); f.connect(g); out(panned(g, o.pan), o.bus, o.rev);
  src.start(t, Math.random()); src.stop(t + o.dur + 0.1);
}
const vPluck = (f, t, vol, bus) => { vTone({ f, t, dur: 1.6, type: "triangle", vol, a: 0.004, lp: 2600, lpTo: 500, bus, rev: 0.5 }); vTone({ f: f * 2, t, dur: 0.5, vol: vol * 0.35, a: 0.003, bus, rev: 0.3 }) };
const vBell = (f, t, vol, bus) => [[1, 1, 3.2], [2.76, 0.42, 2.2], [5.4, 0.2, 1.3], [8.93, 0.09, 0.7]].forEach(p => vTone({ f: f * p[0], t, dur: p[2], vol: vol * p[1], a: 0.003, bus, rev: 0.7 }));
const vTimp = (t, vol, f, bus) => { f = f || 73.4; vTone({ f: f * 1.6, slide: f, slideAt: 0.12, t, dur: 1.5, vol, a: 0.004, bus, rev: 0.6 }); vTone({ f: f * 2.02, t, dur: 0.5, vol: vol * 0.3, a: 0.004, bus, rev: 0.4 }); vNoise({ t, dur: 0.22, vol: vol * 0.5, f: 900, fTo: 140, bus, rev: 0.4 }) };
const vThump = (t, vol, f, bus) => vTone({ f: (f || 58) * 1.9, slide: f || 58, slideAt: 0.2, t, dur: 0.34, vol, a: 0.005, bus });
const vString = (f, t, dur, vol, bus) => [-7, 7].forEach(d => vTone({ f, t, dur, type: "sawtooth", detune: d, vol: vol * 0.5, a: 0.03, lp: 1500, lpTo: 380, q: 1.2, bus, rev: 0.35 }));
const vBrass = (f, t, dur, vol, bus) => [-6, 5].forEach(d => vTone({ f, t, dur, type: "sawtooth", detune: d, vol: vol * 0.5, a: dur * 0.35, lp: 320, lpTo: 2100, q: 0.9, bus, rev: 0.6 }));
const vTick = (t, vol, f, bus) => { vTone({ f: f || 1900, t, dur: 0.05, type: "square", vol: vol * 0.35, a: 0.001, lp: 3200, bus }); vNoise({ t, dur: 0.03, vol: vol * 0.5, type: "bandpass", f: 3800, q: 2, a: 0.001, bus }) };

let duckT = 0;
// Hum It: the music drops out entirely under the humming, and comes back after
let hushOn = false;
function hush(on) { hushOn = on; if (!AC) return; const t = AC.currentTime, g = AU.music.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on || muted ? 0.0001 : MUSICVOL, t, on ? 0.25 : 0.8) }
function duck(sec) { if (!AC || hushOn) return; const t = AC.currentTime, g = AU.music.gain, base = muted ? 0 : MUSICVOL; if (muted) return; g.cancelScheduledValues(t); g.setTargetAtTime(base * 0.28, t, 0.05); g.setTargetAtTime(base, t + sec, 0.6); duckT = t + sec }

const SFX = {
  chime() { const t = AC.currentTime + 0.02; vBell(440, t, 0.17); vBell(587.3, t + 0.24, 0.13) },
  drum() { const t = AC.currentTime + 0.02; vTimp(t, 0.5); },
  beat() { vThump(AC.currentTime + 0.02, 0.4) },
  tick() { vTick(AC.currentTime + 0.01, 0.9) },
  alarm(sec) { const t = AC.currentTime + 0.01, hi = sec <= 5; vTick(t, hi ? 1.1 : 0.8, hi ? 2500 : 1900); vThump(t, hi ? 0.7 : 0.5, hi ? 74 : 58) },
  vote() { const t = AC.currentTime + 0.01; vThump(t, 0.85, 52); vNoise({ t, dur: 0.09, vol: 0.3, type: "bandpass", f: 1700, q: 1.4, a: 0.002, rev: 0.3 }) },
  seal() { const t = AC.currentTime + 0.01; vThump(t, 0.9, 46); vNoise({ t, dur: 0.12, vol: 0.32, f: 700, fTo: 120, rev: 0.4 }); vBell(392, t + 0.03, 0.05) },
  ignite() { const t = AC.currentTime + 0.01; vNoise({ t, dur: 0.5, vol: 0.1, type: "bandpass", f: 400, fTo: 2600, q: 0.9, swell: 0.35, rev: 0.5 }); vLow(mtof(50 + [0, 3, 7, 10, 12][Math.floor(Math.random() * 5)]), t + 0.1, 0.1, AU.sfx, 0, 0.7) },
  snuff() { const t = AC.currentTime + 0.01; vNoise({ t, dur: 0.7, vol: 0.2, type: "bandpass", f: 3600, fTo: 300, q: 0.8, a: 0.01, rev: 0.6 }); vThump(t + 0.04, 0.3, 50) },
  // a good moment, in the house's voice: a timpani stroke under a brass swell, one bell
  gold() { duck(1.8); const t = AC.currentTime + 0.02; vTimp(t, 0.32, 73.4);[50, 54, 57, 62].forEach((m, i) => vBrass(mtof(m), t + i * 0.04, 1.7, 0.1 - i * 0.012)); vBell(mtof(74), t + 0.35, 0.07); vTone({ f: mtof(38), t, dur: 2.2, type: "triangle", vol: 0.12, a: 0.2, rev: 0.6 }) },
  dawn() { duck(2.5); const t = AC.currentTime + 0.02;[53, 60, 65, 69].forEach((m, i) => vBrass(mtof(m), t + i * 0.25, 3.2 - i * 0.25, 0.1));[77, 81, 84, 89].forEach((m, i) => vBell(mtof(m), t + 1 + i * 0.3, 0.07)); for (let k = 0; k < 4; k++) vBird(t + 1.1 + k * 0.55 + Math.random() * 0.2, AU.sfx, 1.4) },
  sting() {
    duck(3.2); const t = AC.currentTime + 0.02;
    vNoise({ t, dur: 0.9, vol: 0.2, f: 300, fTo: 5000, swell: 0.96, rev: 0.5 });
    const hit = t + 0.9; vTimp(hit, 0.7, 55); vTimp(hit + 0.02, 0.4, 36.7);
    [38, 39, 45, 51, 56].forEach(m => vBrass(mtof(m), hit, 2.6, 0.2));
    vTone({ f: mtof(87), t: hit, dur: 2.2, type: "sawtooth", vol: 0.035, a: 0.4, lp: 2400, detune: 14, rev: 0.8 });
  },
  poison() {
    duck(3.4); const t = AC.currentTime + 0.02;
    [50, 51, 56, 62].forEach((m, i) => vTone({ f: mtof(m), t, dur: 2.8, type: "sawtooth", detune: i * 5 - 8, vol: 0.085, a: 1.7, lp: 260, lpTo: 1500, rev: 0.7 }));
    vNoise({ t: t + 0.6, dur: 1.2, vol: 0.1, type: "bandpass", f: 2500, fTo: 500, q: 3, swell: 0.8, rev: 0.7 });
    vTimp(t + 1.75, 0.65, 49); vThump(t + 1.75, 0.5, 40);
  },
  reveal() { duck(2.4); const t = AC.currentTime + 0.02; vNoise({ t, dur: 1.4, vol: 0.26, f: 200, fTo: 6500, swell: 0.97, rev: 0.4 }); vTone({ f: 55, slide: 110, slideAt: 1, t, dur: 1.4, type: "sawtooth", vol: 0.1, a: 1.2, lp: 500, rev: 0.4 }); vTimp(t + 1.4, 0.7, 61.7) },
  win() {
    duck(5); const t = AC.currentTime + 0.02;
    [[62, 0], [66, 0.22], [69, 0.44], [74, 0.66]].forEach(([m, d]) => vBrass(mtof(m), t + d, 0.5, 0.2));
    [50, 57, 62, 66, 69, 74].forEach(m => vBrass(mtof(m), t + 0.95, 3.4, 0.13));
    for (let i = 0; i < 12; i++) vTimp(t + 0.95 + i * 0.085, 0.16 + i * 0.02, 73.4);
    vTimp(t + 2.05, 0.7, 73.4);[86, 90, 93, 98].forEach((m, i) => vBell(mtof(m), t + 1.2 + i * 0.2, 0.09));
  }
};

/* ---------- the score: a light step sequencer, one small band per scene ---------- */
// Short, articulated voices (harp, marimba, pizzicato, flute, a soft kit) instead of held pads: nothing drones.
const vHarp = (f, t, vol, bus, p) => { vTone({ f, t, dur: 1.3, type: "triangle", vol, a: 0.003, lp: 3600, lpTo: 700, bus, rev: 0.45, pan: p }); vTone({ f: f * 2, t, dur: 0.35, vol: vol * 0.3, a: 0.002, bus, rev: 0.2, pan: p }) };
const vMarimba = (f, t, vol, bus, p) => { vTone({ f, t, dur: 0.6, vol, a: 0.002, bus, rev: 0.25, pan: p }); vTone({ f: f * 3.93, t, dur: 0.1, vol: vol * 0.25, a: 0.001, bus, pan: p }) };
const vPizz = (f, t, vol, bus, p) => vTone({ f, t, dur: 0.3, type: "sawtooth", vol, a: 0.004, lp: 2000, lpTo: 260, q: 1.1, bus, rev: 0.3, pan: p });
const vBass = (f, t, dur, vol, bus) => { vTone({ f, t, dur, type: "triangle", vol, a: 0.005, lp: 700, lpTo: 200, bus }); vTone({ f, t, dur: dur * 0.8, vol: vol * 0.6, a: 0.005, bus }) };
const vKick = (t, vol, bus) => vTone({ f: 150, slide: 46, slideAt: 0.22, t, dur: 0.34, vol, a: 0.002, bus });
// band-passed, not high-passed: a run of high-passed noise bursts spiked to 30x their level in Chrome
const vHat = (t, vol, bus, p) => vNoise({ t, dur: 0.045, vol: vol * 1.2, type: "bandpass", f: 8500, q: 0.6, a: 0.001, bus, pan: p });
const vShaker = (t, vol, bus, p) => vNoise({ t, dur: 0.07, vol, type: "bandpass", f: 6200, q: 0.9, a: 0.014, bus, pan: p });
const vClap = (t, vol, bus) => [0, 0.011, 0.023].forEach((d, k) => vNoise({ t: t + d, dur: k === 2 ? 0.16 : 0.02, vol: vol * (k === 2 ? 1 : 0.7), type: "bandpass", f: 1400, q: 0.9, a: 0.001, bus, rev: k === 2 ? 0.3 : 0 }));
const vStab = (fs, t, dur, vol, bus) => fs.forEach(f => [-8, 8].forEach(d => vTone({ f, t, dur, type: "sawtooth", detune: d, vol: vol * 0.5, a: 0.015, lp: 2600, lpTo: 450, q: 0.8, bus, rev: 0.45 })));
const vBox = (f, t, vol, bus, p) => [[1, 1, 1.4], [3.01, 0.22, 0.45], [5.8, 0.08, 0.2]].forEach(q => vTone({ f: f * q[0], t, dur: q[2], vol: vol * q[1], a: 0.002, bus, rev: 0.75, pan: p }));
const vSwell = (fs, t, dur, vol, bus) => fs.forEach(f => vTone({ f, t, dur, type: "triangle", vol, a: dur * 0.45, lp: 1400, bus, rev: 0.6 }));
function vFlute(f, t, dur, vol, bus, p) {
  const o = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(), g2 = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain(), end = t + dur + 0.1;
  o.type = "sine"; o.frequency.value = f; o2.type = "triangle"; o2.frequency.value = f * 2; g2.gain.value = 0.1;
  lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur * 0.6)); lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.06); g.gain.setValueAtTime(vol, t + Math.max(0.07, dur * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  o.connect(g); o2.connect(g2); g2.connect(g); out(panned(g, p), bus, 0.45);
  vNoise({ t, dur: 0.09, vol: vol * 0.22, type: "bandpass", f: Math.min(9000, f * 2), q: 1.5, a: 0.01, bus, pan: p });
  [o, o2, lfo].forEach(x => { x.start(t); x.stop(end) });
}
// small birds: a quick trill, a rising-falling whistle, a double tweet, or a warble — each from a random spot in the room
function vChirp(t, f0, f1, dur, vol, bus, p) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(panned(g, p), bus, 0.35); o.start(t); o.stop(t + dur + 0.05);
}
function vBird(t, bus, loud) {
  const R = Math.random, base = 2500 + R() * 1900, vol = (0.022 + R() * 0.026) * (loud || 1), p = (R() - 0.5) * 1.6, kind = Math.floor(R() * 4);
  if (kind === 0) { const n = 4 + Math.floor(R() * 6); for (let k = 0; k < n; k++) vChirp(t + k * 0.065, base * (1 + (R() - 0.5) * 0.05), base * 1.3, 0.05, vol * (1 - k * 0.05), bus, p) }
  else if (kind === 1) { vChirp(t, base * 0.8, base * 1.25, 0.2, vol, bus, p); vChirp(t + 0.24, base * 1.2, base * 0.72, 0.24, vol * 0.85, bus, p) }
  else if (kind === 2) { for (let k = 0; k < 2; k++) { vChirp(t + k * 0.17, base, base * 1.5, 0.06, vol, bus, p); vChirp(t + k * 0.17 + 0.065, base * 1.5, base * 1.05, 0.05, vol * 0.8, bus, p) } }
  else { for (let k = 0; k < 6; k++) vChirp(t + k * 0.045, base * (k % 2 ? 1.18 : 0.94), base * (k % 2 ? 0.97 : 1.2), 0.042, vol * 0.8, bus, p) }
}
// The house's own voices (lobby, day, missions, mingle, the end): low strings, horns, a choir far off, big drums.
// Low strings, spiccato: two detuned saws through a closing low-pass, short and dry.
const vLow = (f, t, vol, bus, p, len) => [-6, 6].forEach(d => vTone({ f, t, dur: len || 0.22, type: "sawtooth", detune: d, vol: vol * 0.5, a: 0.006, lp: 1150, lpTo: 230, q: 1.3, bus, rev: 0.28, pan: p }));
// a big low drum, felt more than heard
const vTaiko = (t, vol, bus) => { vTone({ f: 96, slide: 43, slideAt: 0.3, t, dur: 0.95, vol, a: 0.004, bus, rev: 0.55 }); vNoise({ t, dur: 0.16, vol: vol * 0.5, f: 800, fTo: 110, bus, rev: 0.45 }) };
// a distant choir, "ah": detuned saws through two vowel formants, slow in and slow out
function vChoir(f, t, dur, vol, bus) {
  [-9, 0, 9].forEach(d => {
    const o = AC.createOscillator(), f1 = AC.createBiquadFilter(), f2 = AC.createBiquadFilter(), g = AC.createGain();
    o.type = "sawtooth"; o.frequency.value = f; o.detune.value = d;
    f1.type = "bandpass"; f1.frequency.value = 720; f1.Q.value = 5; f2.type = "bandpass"; f2.frequency.value = 1180; f2.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.setValueAtTime(vol, t + dur * 0.62); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); out(g, bus, 0.85);
    o.start(t); o.stop(t + dur + 0.05);
  });
}
// a held cello: bowed, not plucked — soft in, steady, soft out
function vCello(f, t, dur, vol, bus, p) {
  [-5, 5].forEach(d => {
    const o = AC.createOscillator(), lp = AC.createBiquadFilter(), g = AC.createGain();
    o.type = "sawtooth"; o.frequency.value = f; o.detune.value = d; lp.type = "lowpass"; lp.frequency.value = 620; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.5, t + Math.min(0.35, dur * 0.3)); g.gain.setValueAtTime(vol * 0.5, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); out(panned(g, p), bus, 0.35); o.start(t); o.stop(t + dur + 0.05);
  });
}
// a horn for the tunes: brass with the bite taken off
const vHorn = (f, t, dur, vol, bus) => [-4, 4].forEach(d => vTone({ f, t, dur: Math.max(0.3, dur), type: "sawtooth", detune: d, vol: vol * 0.5, a: Math.min(0.14, dur * 0.3), lp: 650, lpTo: 1250, q: 0.7, bus, rev: 0.6 }));
// a low clarinet: a hollow, filtered square
const vClar = (f, t, dur, vol, bus) => vTone({ f, t, dur: Math.max(0.2, dur), type: "square", vol, a: 0.05, lp: 1000, lpTo: 650, q: 0.8, bus, rev: 0.45 });
const vOwl = (t, bus) => { const p = (Math.random() - 0.5) * 1.2;[[0, 0.5], [0.72, 0.26], [1.05, 0.62]].forEach(([d, len], k) => vTone({ f: 388 - k * 8, slide: 352 - k * 8, slideAt: 0.9, t: t + d, dur: len, vol: 0.05, a: 0.07, lp: 900, bus, rev: 0.8, pan: p })) };

const CQ = { M: [0, 4, 7], m: [0, 3, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10] };
const MODES_ = { minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], major: [0, 2, 4, 5, 7, 9, 11] };
const chord = c => { const r = parseInt(c, 10); return { root: r, iv: CQ[c.replace(/^\d+/, "")] } };
// key: tonic (MIDI); prog: one chord a bar; wind: the draught through the hall (night and lobby only)
// Every scene but the morning (F major) plays in D minor, the A major chord (harmonic minor) giving each turn of the
// progression its pull.
const SCENES = {
  lobby: { bpm: 66, key: 50, mode: "minor", prog: ["50m", "46M", "43m", "45M"], wind: 0.035 },
  day: { bpm: 84, key: 50, mode: "minor", prog: ["50m", "46M", "48M", "45M"], wind: 0.012 },
  morning: { bpm: 96, key: 53, mode: "major", prog: ["53M", "48M", "50m", "46M"], wind: 0 },
  mingle: { bpm: 92, key: 50, mode: "minor", prog: ["50m", "43m", "45M", "50m"], wind: 0 },
  mission: { bpm: 112, key: 50, mode: "minor", prog: ["50m", "46M", "41M", "45M"], wind: 0 },
  table: { bpm: 76, key: 50, mode: "minor", prog: ["50m", "46M", "43m", "45M"], wind: 0.03 },
  night: { bpm: 60, key: 50, mode: "minor", prog: ["50m", "46M", "50m", "45M"], wind: 0.06 },
  final: { bpm: 88, key: 50, mode: "minor", prog: ["50m", "46M", "41M", "48M", "43m", "46M", "48M", "45M"], wind: 0 }
};
for (const k in SCENES) SCENES[k].chords = SCENES[k].prog.map(chord);
// melody rhythms, one bar each: [step, length in sixteenths]
const MELT = [[[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]], [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 6], [6, 2], [8, 8]], [[2, 2], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 3], [3, 3], [6, 2], [8, 3], [11, 5]]];
const OSTINATO = [33, 33, 36, 33, 39, 33, 36, 35];
const MUSIC = {
  scene: null, next: 0, step: 0, pad: null, wind: null, timer: null, mel: { d: 9, tm: null },
  start() {
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
    src.buffer = AU.noise; src.loop = true; f.type = "bandpass"; f.frequency.value = 420; f.Q.value = 0.6; g.gain.value = 0.0001;
    lfo.frequency.value = 0.07; lg.gain.value = 240; lfo.connect(lg); lg.connect(f.frequency);
    src.connect(f); f.connect(g); out(g, AU.music, 0.3); src.start(); lfo.start();
    this.wind = g;
    if (!this.timer && typeof setInterval === "function") this.timer = setInterval(() => this.schedule(AC.currentTime + 0.12), 30);
  },
  // Each scene plays into its own gain: on a change the old one fades out over a second and a half (its last notes
  // and tails with it) while the new one fades in from a clean downbeat, so a change of scene never lurches.
  setScene(name) {
    if (!AC || !SCENES[name] || this.scene === name) return;
    this.scene = name; const t = AC.currentTime, old = this.bus;
    if (old) { old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(Math.max(0.0001, old.gain.value), t); old.gain.linearRampToValueAtTime(0.0001, t + 1.2); if (typeof setTimeout === "function") setTimeout(() => { try { old.disconnect() } catch (e) {} }, 5000) }
    const g = AC.createGain(); g.gain.setValueAtTime(old ? 0.35 : 1, t); if (old) g.gain.linearRampToValueAtTime(1, t + 1.1); g.connect(AU.music); this.bus = g;
    this.step = 0; this.mel = { d: 9, tm: null }; this.next = t + 0.12;
    if (this.wind) this.wind.gain.setTargetAtTime(Math.max(0.0001, SCENES[name].wind), t, 1.5);
  },
  schedule(until) {
    if (!this.scene) return;
    const sc = SCENES[this.scene], dt = 60 / sc.bpm / 4;
    while (this.next < until) {
      const i = this.step++, s = i % 16, bar = Math.floor(i / 16), ch = sc.chords[bar % sc.chords.length];
      const t = this.next + (sc.swing && s % 4 === 2 ? sc.swing * dt * 2 : 0); // swung eighths
      try { this.play(this.scene, sc, s, bar, t, ch, dt) } catch (e) { console.warn("music", e) }
      this.next += dt;
    }
  },
  // one note of melody on the bar's rhythm: chord tones on the strong beats, steps in between
  melody(sc, s, t, ch, dt, inst, vol) {
    const m = this.mel;
    if (s === 0) m.tm = MELT[Math.floor(Math.random() * MELT.length)];
    const hit = m.tm && m.tm.find(x => x[0] === s); if (!hit) return;
    const sca = MODES_[sc.mode], note = d => sc.key + 12 + 12 * Math.floor(d / 7) + sca[((d % 7) + 7) % 7];
    let d = m.d + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
    if (s === 0 || s === 8) {
      const pcs = ch.iv.map(x => (ch.root + x) % 12); let best = d, bd = 99;
      for (let k = d - 3; k <= d + 3; k++) if (pcs.includes(note(k) % 12) && Math.abs(k - m.d) < bd) { bd = Math.abs(k - m.d); best = k }
      d = best;
    }
    m.d = d = Math.max(5, Math.min(13, d));
    inst(mtof(note(d)), t, hit[1] * dt, vol);
  },
  play(name, sc, s, bar, t, ch, dt) {
    const B = this.bus || AU.music, R = Math.random, r = ch.root, T = ch.iv.map(x => r + x), arp = [...T.map(x => x + 12), ...T.map(x => x + 24)];
    const flute = (f, tt, d, v) => vFlute(f, tt, Math.max(0.12, d * 0.92), v, B, 0.15), mar = (f, tt, d, v) => vMarimba(f, tt, v, B, -0.2);
    const upDown = k => arp[[0, 1, 2, 3, 4, 3, 2, 1][k % 8] % arp.length];
    const horn = (f, tt, d, v) => vHorn(f, tt, d * 0.95, v, B), clar = (f, tt, d, v) => vClar(f / 2, tt, d * 0.9, v, B);
    // the low register, kept between C2 and B2 so the bass never sinks below what a TV can play
    const lo = n => n - 12 >= 36 ? n - 12 : n;
    if (name === "lobby") {
      // the house waiting: a tolling bell, a slow marcato pulse in the cellos, a choir somewhere upstairs
      if (s % 2 === 0) vLow(mtof(lo(r) + 12 + [0, 0, 0, 0, 0, 0, 7, 5][s / 2]), t, s === 0 ? 0.1 : s % 4 === 0 ? 0.075 : 0.055, B, -0.15, dt * 1.6);
      if (s === 0) vBass(mtof(lo(r)), t, dt * 12, 0.1, B);
      if (s === 0 && bar % 2 === 0) vBell(mtof(sc.key), t, 0.05, B);
      if (s === 0) vTaiko(t, bar % 4 === 0 ? 0.16 : 0.1, B);
      if (s === 0 && bar % 4 === 1) vChoir(mtof(T[0] + 12), t, dt * 26, 0.03, B), vChoir(mtof(T[2]), t, dt * 26, 0.024, B);
      if (s === 8 && bar % 4 === 3 && R() < 0.8) { const sca = MODES_.minor, d = 7 + Math.floor(R() * 5); vBox(mtof(sc.key + 12 * Math.floor(d / 7) + sca[d % 7]), t, 0.02, B, (R() - 0.5) * 0.8) }
    } else if (name === "day") {
      // a new day, and a clock: tick-tock under a restless cello figure; the horns carry the tune
      if (s % 4 === 0) vTick(t, s % 8 === 0 ? 0.075 : 0.05, s % 8 === 0 ? 1500 : 1150, B);
      if (s % 2 === 0) vLow(mtof(lo(r) + 12 + [0, 7, 12, 7, 0, 7, 10, 7][s / 2]), t, s === 0 ? 0.085 : 0.05, B, 0.1, dt * 1.4);
      if (s === 0) vBass(mtof(lo(r)), t, dt * 7, 0.11, B);
      if (s === 8) vBass(mtof(lo(r) + 7), t, dt * 6, 0.07, B);
      if (s === 0 && bar % 2 === 0) vTimp(t, 0.12, mtof(lo(r)), B);
      if (s === 0 && bar % 4 === 0) { vBrass(mtof(lo(r)), t, dt * 14, 0.05, B); vBrass(mtof(lo(r) + 7), t, dt * 14, 0.04, B) }
      if (bar % 4 >= 2) this.melody(sc, s, t, ch, dt, horn, 0.05);
    } else if (name === "morning") {
      if (s % 2 === 0) vHarp(mtof(arp[[0, 1, 2, 3, 4, 5, 4, 3][(s / 2) % 8] % arp.length]), t, 0.048, B, s % 4 ? 0.3 : -0.3);
      if (s === 0) vBass(mtof(r - 12), t, dt * 7, 0.13, B);
      if (s === 8) vBass(mtof(r - 5), t, dt * 6, 0.09, B);
      if (s === 0 && bar % 2 === 0) vKick(t, 0.1, B);
      vShaker(t, s % 4 === 2 ? 0.028 : 0.011, B, -0.35);
      if (bar % 4 < 2) this.melody(sc, s, t, ch, dt, flute, 0.05); else this.melody(sc, s, t, ch, dt, mar, 0.055);
      if (s === 12 && bar % 2 === 1 && R() < 0.5) vBell(mtof(T[1] + 36), t, 0.018, B);
      if (R() < (bar < 8 ? 0.07 : 0.04)) vBird(t + R() * dt, B); // a dawn chorus that settles down
    } else if (name === "mingle") {
      // whispering in corners: a pizzicato walk, a low clarinet, a clock on two and four
      if (s % 4 === 0) { const beat = s / 4, next = sc.chords[(bar + 1) % sc.chords.length].root, n = [r, T[1], T[2], next + (R() < 0.5 ? -1 : 2)][beat]; vPizz(mtof(lo(n)), t, 0.1, B); vBass(mtof(lo(n)), t, dt * 3, 0.05, B) }
      if (s === 4 || s === 12) vTick(t, 0.045, 1250, B);
      if (s === 6 && bar % 2 === 1) vPizz(mtof(T[2]), t, 0.045, B, 0.3);
      if (s === 0) vCello(mtof(lo(r) + 12), t, dt * 15.5, 0.05, B, -0.2); // a held cello under each bar, so the walk never sounds empty
      if (bar % 4 >= 2) this.melody(sc, s, t, ch, dt, clar, 0.04);
      if (s === 0 && bar % 8 === 4) vChoir(mtof(T[0] + 12), t, dt * 24, 0.02, B);
    } else if (name === "mission") {
      // the chase: spiccato cellos in threes-threes-two, war drums, a ticking clock, brass on the turn of the phrase
      const pat = [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 10, 0, 7, 0], acc = [0, 3, 6, 8, 11, 14].includes(s);
      vLow(mtof(lo(r) + 12 + pat[s]), t, acc ? 0.07 : 0.035, B, s % 2 ? 0.2 : -0.2);
      if (s === 0 || s === 6) vTaiko(t, 0.17, B);
      if (s === 10 && bar % 2 === 1) vTaiko(t, 0.1, B);
      if (s === 14) vTaiko(t, 0.06, B);
      if (s % 4 === 2) vTick(t, 0.03, 2400, B); // the clock, on the off-beats only
      if (s === 0) vBass(mtof(lo(r)), t, dt * 4, 0.1, B);
      if (s === 0 && bar % 2 === 0) { vBrass(mtof(lo(r)), t, dt * 6, 0.06, B); vBrass(mtof(lo(T[2])), t, dt * 6, 0.045, B) }
      if (bar % 8 === 7 && s === 0) vNoise({ t, dur: dt * 16, vol: 0.05, f: 300, fTo: 3200, swell: 0.95, bus: B, rev: 0.4 });
      if (bar % 8 >= 4 && bar % 8 <= 6) this.melody(sc, s, t, ch, dt, horn, 0.045);
    } else if (name === "table") {
      if (s % 2 === 0) vPizz(mtof(OSTINATO[(s / 2) % 8] + 12), t, s === 0 ? 0.16 : 0.11, B);
      if (s % 4 === 0) vTick(t, 0.08, 1500, B);
      if (s === 0 && bar % 2 === 0) vTimp(t, 0.18, 55, B);
      if (s === 0 && bar % 4 === 0) vSwell([mtof(T[0]), mtof(T[1])], t, dt * 28, 0.016, B);
      if (s === 0 && bar % 4 === 2) vTone({ f: mtof(T[2] + 36), t, dur: 4, type: "sine", vol: 0.022, a: 1.5, bus: B, rev: 0.9 });
    } else if (name === "night") {
      if (s === 0) { vThump(t, 0.3, 46, B); vThump(t + 0.27, 0.2, 42, B) }
      if (s % 4 === 0 && s && R() < 0.35) { const sca = MODES_.minor, d = 7 + Math.floor(R() * 8); vBox(mtof(sc.key + 12 + 12 * Math.floor(d / 7) + sca[d % 7]), t, 0.032, B, (R() - 0.5)) }
      if (s === 0 && bar % 4 === 0) vSwell([mtof(r - 12)], t, dt * 40, 0.02, B);
      if (s === 8 && bar % 6 === 3 && R() < 0.7) vOwl(t, B);
    } else if (name === "final") {
      // the reckoning: timpani, low brass on every chord, the choir, strings driving underneath
      if (s === 0) vTimp(t, 0.2, mtof(lo(r)), B);
      if (s === 8) vTimp(t, 0.12, mtof(lo(r)), B);
      if (bar % 2 === 1 && s >= 13) vTimp(t, 0.05 + (s - 13) * 0.025, mtof(lo(r)), B);
      if (s % 2 === 0) vLow(mtof(lo(r) + 12 + [0, 0, 7, 0, 12, 0, 7, 0][s / 2]), t, s === 0 ? 0.08 : 0.05, B, -0.1);
      if (s === 0) { vBrass(mtof(lo(T[0])), t, dt * 12, 0.05, B); vBrass(mtof(lo(T[1])), t, dt * 12, 0.035, B); vBrass(mtof(lo(T[2])), t, dt * 12, 0.035, B) }
      if (s === 0 && bar % 2 === 0) vChoir(mtof(T[0] + 12), t, dt * 28, 0.026, B), vChoir(mtof(T[2]), t, dt * 28, 0.02, B);
      if (s === 0) vBass(mtof(lo(r)), t, dt * 8, 0.1, B);
      if (s === 12 && bar % 4 === 3) vBell(mtof(T[0] + 24), t, 0.03, B);
      if (bar % 4 >= 2) this.melody(sc, s, t, ch, dt, horn, 0.05);
    }
  },
  mute(m) { muted = m; if (!AC) return; const t = AC.currentTime; AU.master.gain.cancelScheduledValues(t); AU.master.gain.setTargetAtTime(m ? 0.0001 : 0.9, t, 0.08) }
};
// The drumroll: a snare-and-timpani roll that builds for as long as the host holds the button (15 s at most).
const ROLL = {
  g: null,
  start() {
    if (!AC || muted || this.g) return; if (AC.state === "suspended" && AC.resume) { try { const r = AC.resume(); if (r && r.catch) r.catch(() => {}) } catch (e) {} }
    const t0 = AC.currentTime + 0.02, g = AC.createGain(); g.gain.value = 1; g.connect(AU.sfx); this.g = g; duck(15);
    for (let i = 0; i < 250; i++) {
      const t = t0 + i * 0.06, k = Math.min(1, i / 110);
      vNoise({ t, dur: 0.07, vol: 0.05 + 0.2 * k, type: "bandpass", f: 1900, q: 0.8, a: 0.002, bus: g });
      if (i % 2 === 0) vTone({ f: 110 - 40 * k, slide: 70 - 20 * k, slideAt: 0.5, t, dur: 0.16, vol: 0.06 + 0.2 * k, a: 0.003, bus: g });
    }
  },
  stop() { if (!this.g || !AC) return; const g = this.g, t = AC.currentTime; this.g = null; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.03); setTimeout(() => { try { g.disconnect() } catch (e) {} }, 400); if (AU.music) { AU.music.gain.cancelScheduledValues(t); AU.music.gain.setTargetAtTime(muted ? 0 : MUSICVOL * 0.28, t, 0.05); AU.music.gain.setTargetAtTime(muted ? 0 : MUSICVOL, t + 2.5, 0.6) } }
};
function sfx(name, arg) { if (!AC || muted || !SFX[name]) return; try { if (AC.state === "suspended") AC.resume(); SFX[name](arg) } catch (e) { console.warn("sfx", name, e) } }
function enableSound() {
  if (AC) return;
  try { audioInit(new (window.AudioContext || window.webkitAudioContext)()); MUSIC.start(); sfx("chime") } catch (e) { console.warn(e); AC = null }
  if (typeof tvRefresh === "function") tvRefresh(true);
}
function toggleMute() { MUSIC.mute(!muted); if (typeof tvRefresh === "function") tvRefresh(true) }
