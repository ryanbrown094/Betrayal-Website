/* ===================== ART: every drawing is original inline SVG ===================== */
function blobPath(cx, cy, r, wob, n, seed) {
  let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = r + (rnd() - .5) * 2 * wob; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]) }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f = p => p[0].toFixed(1) + " " + p[1].toFixed(1);
  let d = "M" + f(mid(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) d += "Q" + f(pts[i]) + " " + f(mid(pts[i], pts[(i + 1) % n]));
  return d + "Z";
}
const ICONS = {
  moon: '<path d="M43 7a25 25 0 1 0 14 39A21 21 0 0 1 43 7z"/><path class="f" d="M17 12l1.4 3.6L22 17l-3.6 1.4L17 22l-1.4-3.6L12 17l3.6-1.4zM27 28l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>',
  sun: '<path d="M14 44a18 18 0 0 1 36 0"/><path d="M4 44h56M10 52h44M18 59h28M32 8v9M9 21l6 6M55 21l-6 6M2 36h6M56 36h6"/>',
  blade: '<path d="M32 60L27 24h10z"/><path d="M32 24v26"/><path d="M19 24c4-3 22-3 26 0"/><path d="M32 24V12"/><circle cx="32" cy="8" r="4"/>',
  crown: '<path d="M9 46L13 19l11 14 8-20 8 20 11-14 4 27z"/><path d="M9 53h46"/><circle class="f" cx="13" cy="16" r="2.6"/><circle class="f" cx="32" cy="10" r="2.6"/><circle class="f" cx="51" cy="16" r="2.6"/>',
  shield: '<path d="M32 5l22 8v17c0 14-10 24-22 30C20 54 10 44 10 30V13z"/><path d="M32 14v36M19 27h26"/>',
  table: '<circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="9"/><circle class="f" cx="32" cy="7" r="3"/><circle class="f" cx="53.6" cy="19.5" r="3"/><circle class="f" cx="53.6" cy="44.5" r="3"/><circle class="f" cx="32" cy="57" r="3"/><circle class="f" cx="10.4" cy="44.5" r="3"/><circle class="f" cx="10.4" cy="19.5" r="3"/>',
  chalice: '<path d="M17 7h30c0 15-6 24-15 24S17 22 17 7z"/><path d="M32 31v17M21 57c0-6 5-9 11-9s11 3 11 9z"/><path d="M19 15h26"/>',
  scroll: '<path d="M18 9h30a6 6 0 0 1 6 6v3H24"/><path d="M18 9a6 6 0 0 0-6 6v34a6 6 0 0 0 6 6h26a6 6 0 0 0 6-6V18"/><path d="M18 9a6 6 0 0 1 6 6v3M21 28h20M21 36h20M21 44h13"/>',
  hourglass: '<path d="M16 6h32M16 58h32"/><path d="M19 6c0 15 11 18 13 26-2 8-13 11-13 26M45 6c0 15-11 18-13 26 2 8 13 11 13 26"/><path class="f" d="M25 14h14c-2 6-5 9-7 12-2-3-5-6-7-12zM24 56c1-7 5-9 8-12 3 3 7 5 8 12z"/>',
  scales: '<path d="M32 8v48M20 58h24M10 16h44"/><path d="M10 16L3 36h14zM54 16l-7 20h14z"/><path d="M3 36a7 5 0 0 0 14 0M47 36a7 5 0 0 0 14 0"/><circle class="f" cx="32" cy="8" r="3"/>',
  raven: '<path class="f" d="M4 22l13-5c3-8 13-11 20-5 9 5 15 16 23 38l-9-5 2 13-9-11c-8 2-17-2-21-10-3-5-2-9-5-12z"/><path d="M33 47l-2 11M40 48l1 10M27 58h8M37 58h8"/>',
  ghost: '<path d="M13 57V27a19 19 0 0 1 38 0v30l-6.3-5-6.4 5-6.3-5-6.3 5-6.4-5z"/><circle class="f" cx="25" cy="27" r="3.2"/><circle class="f" cx="39" cy="27" r="3.2"/><path d="M28 38c2 2 6 2 8 0"/>',
  key: '<circle cx="18" cy="20" r="11"/><circle cx="18" cy="20" r="4"/><path d="M26 28l30 30M44 46l7-7M50 52l6-6"/>',
  skull: '<path d="M12 30a20 20 0 0 1 40 0c0 8-3 12-8 15v9H20v-9c-5-3-8-7-8-15z"/><circle class="f" cx="24" cy="30" r="5"/><circle class="f" cx="40" cy="30" r="5"/><path d="M32 37l-3 6h6zM27 54v-6M32 54v-6M37 54v-6"/>',
  candle: '<path d="M24 28h16v30H24z"/><path d="M24 36c3 3 5-2 8 1s5-1 8 1M18 58h28"/><path d="M32 28v-5"/><path class="f" d="M32 4c5 6 7 10 7 13a7 7 0 0 1-14 0c0-3 2-7 7-13z"/>',
  eye: '<path d="M4 32c8-13 18-19 28-19s20 6 28 19c-8 13-18 19-28 19S12 45 4 32z"/><circle cx="32" cy="32" r="9"/><circle class="f" cx="32" cy="32" r="3.6"/>',
  handshake: '<path d="M4 22l12-4 10 4 6-3 6 3 10-4 12 4v20l-10 2-14 12a4 4 0 0 1-5 0L17 44 4 42z"/><path d="M26 22l-6 8c2 3 6 3 9 0l3-3 14 13M38 36l4 4M33 41l4 4"/>'
};
const ART = {
  blob: blobPath(50, 50, 44, 3.2, 18, 7),
  blob2: blobPath(50, 50, 45, 4, 22, 23),
  icon(n, cls) { return `<svg class="ico ${cls || ""}" viewBox="0 0 64 64" aria-hidden="true">${ICONS[n] || ""}</svg>` },
  defs() {
    return `<svg id="artdefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<radialGradient id="g-wax" cx="34%" cy="28%" r="80%"><stop offset="0" stop-color="#ffffff" stop-opacity=".42"/><stop offset=".45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".5"/></radialGradient>
<linearGradient id="g-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4c9b7"/><stop offset=".5" stop-color="#e6a58c"/><stop offset="1" stop-color="#ae6249"/></linearGradient>
<radialGradient id="g-flame" cx="50%" cy="72%" r="62%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".35" stop-color="#ffd977"/><stop offset=".75" stop-color="#ff9a3c"/><stop offset="1" stop-color="#e2541a" stop-opacity=".0"/></radialGradient>
<pattern id="p-lead" width="15" height="22" patternUnits="userSpaceOnUse"><path d="M7.5 0L15 11 7.5 22 0 11z" fill="none" stroke="#080609" stroke-width="1.5"/></pattern>
<symbol id="sym-seal" viewBox="0 0 100 100"><ellipse cx="51" cy="55" rx="44" ry="42" fill="#000000" opacity=".5"/><path d="${this.blob}" style="fill:var(--c,#ae6249)"/><path d="${this.blob}" fill="url(#g-wax)"/><circle cx="50.8" cy="51" r="31" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="1.6"/><circle cx="50" cy="50" r="31" fill="#000000" fill-opacity=".09" stroke="#000000" stroke-opacity=".32" stroke-width="3"/><ellipse cx="32" cy="24" rx="13" ry="5" fill="#ffffff" opacity=".2" transform="rotate(-32 32 24)"/></symbol>
<symbol id="sym-flame" viewBox="0 0 20 44"><path d="M10 0c6 11 10 19 10 28a10 12 0 0 1-20 0C0 19 4 11 10 0z" fill="url(#g-flame)"/><path d="M10 17c3 6 5 10 5 14a5 7 0 0 1-10 0c0-4 2-8 5-14z" fill="#fffdf0"/><path d="M10 33c1.6 2 2.4 4 2.4 5.6a2.4 3 0 0 1-4.8 0c0-1.6.8-3.6 2.4-5.6z" fill="#5a86c9" opacity=".75"/></symbol>
</defs></svg>`;
  },
  seal(p, cls) {
    const ch = esc((p.name || "?").trim()[0] || "?").toUpperCase();
    const c = /^#[0-9a-f]{3,8}$/i.test(p.color || "") ? p.color : "#ae6249";
    return `<svg class="seal ${cls || ""}" viewBox="0 0 100 100" style="--c:${c}" aria-hidden="true"><use href="#sym-seal"/><text x="51" y="67.5" fill="#ffffff" fill-opacity=".3">${ch}</text><text x="50" y="66" fill="#000000" fill-opacity=".5">${ch}</text><path class="crack" d="M30 12l9 20-7 9 13 12-6 11 12 9-4 16" fill="none" stroke="#09070a" stroke-opacity=".85" stroke-width="3" stroke-linejoin="round"/></svg>`;
  },
  bigSeal(kind, icon) {
    const c = { t: "#8e1b45", f: "#ae6249", good: "#2e7a62", steel: "#51657c" }[kind] || "#ae6249";
    return `<svg viewBox="0 0 100 100" style="--c:${c}" aria-hidden="true"><ellipse cx="51" cy="56" rx="45" ry="43" fill="#000000" opacity=".55"/><path d="${this.blob2}" style="fill:var(--c)"/><path d="${this.blob2}" fill="url(#g-wax)"/><circle cx="50.8" cy="51" r="33" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="1.4"/><circle cx="50" cy="50" r="33" fill="#000000" fill-opacity=".1" stroke="#000000" stroke-opacity=".35" stroke-width="2.6"/><g transform="translate(29.6 30.6) scale(.64)" fill="none" stroke="#ffffff" stroke-opacity=".32" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${(ICONS[icon] || "").replace(/class="f"/g, 'fill="#ffffff" fill-opacity=".3" stroke="none"')}</g><g transform="translate(29 30) scale(.64)" fill="none" stroke="#000000" stroke-opacity=".58" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${(ICONS[icon] || "").replace(/class="f"/g, 'fill="#000000" fill-opacity=".55" stroke="none"')}</g><ellipse cx="31" cy="23" rx="14" ry="5" fill="#ffffff" opacity=".2" transform="rotate(-32 31 23)"/></svg>`;
  },
  // the Cloak & Candle mark: a cloaked figure in a lozenge, a candle flame where the face should be
  crest(draw) {
    const p = 'pathLength="1"';
    return `<svg class="${draw ? "draw" : ""}" viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path class="fillin" d="M60 16l44 54-44 54-44-54z" fill="currentColor" fill-opacity=".14" stroke="none"/>
<path ${p} d="M60 5l55 65-55 65L5 70z"/><path ${p} d="M60 16l44 54-44 54-44-54z" stroke-width="1"/>
<path ${p} d="M60 29C51 35 44.5 44 44 56c-.3 6 1.5 8-.5 14-2.5 8-1.5 17-3.5 26h40c-2-9-1-18-3.5-26-2-6-.2-8-.5-14-.5-12-7-21-16-27z"/><path ${p} d="M60 41c-6 5-9 10.5-9 16 0 6 4 9.5 9 9.5s9-3.5 9-9.5c0-5.5-3-11-9-16z" stroke-width="1.4"/><path ${p} d="M60 48c3 4.4 4.6 7.2 4.6 9.5a4.6 4.6 0 0 1-9.2 0c0-2.3 1.6-5.1 4.6-9.5z" fill="currentColor" fill-opacity=".35"/><circle ${p} cx="60" cy="70.5" r="1.6"/><path ${p} d="M60 73c-.4 8-.8 15.5-1.2 23" stroke-width="1.3"/><path ${p} d="M50 77c-1 6.5-2 13-3 19M70 77c1 6.5 2 13 3 19" stroke-width="1"/>
<path ${p} d="M27 70h-9M93 70h9" stroke-width="1.4"/><circle ${p} cx="14" cy="70" r="1.6"/><circle ${p} cx="106" cy="70" r="1.6"/></svg>`;
  },
  window(id) {
    const lights = '<path d="M17 580V318c0-40 12-68 27-86 15 18 27 46 27 86v262z"/><path d="M79 580V318c0-40 12-68 27-86 15 18 27 46 27 86v262z"/><circle cx="75" cy="158" r="37"/><path d="M75 30c-13 14-25 33-34 57a52 52 0 0 1 68 0C100 63 88 44 75 30z"/>';
    return `<svg viewBox="0 0 150 580" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g-glass-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="glassA"/><stop offset="1" class="glassB"/></linearGradient></defs>
<path d="M6 580V190C6 96 44 36 75 6c31 30 69 90 69 184v390z" fill="#050305"/>
<g fill="url(#g-glass-${id})">${lights}</g><g fill="url(#p-lead)" opacity=".85">${lights}</g>
<path d="M75 121v74M38 158h74M49 132l52 52M101 132l-52 52" stroke="#080609" stroke-width="2.4"/><circle cx="75" cy="158" r="12" fill="none" stroke="#080609" stroke-width="2.4"/>
<path d="M6 580V190C6 96 44 36 75 6c31 30 69 90 69 184v390" fill="none" stroke="#1a111b" stroke-width="7"/><path d="M12 580V192c0-88 35-145 63-174 28 29 63 86 63 174v388" fill="none" stroke="#432b47" stroke-width="1.2" opacity=".8"/></svg>`;
  },
  inlay() {
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 23 : i % 4 ? 38 : 46; pts.push((50 + Math.cos(a) * r).toFixed(1) + "," + (50 + Math.sin(a) * r).toFixed(1)) }
    return `<svg viewBox="0 0 100 100" fill="none" stroke="#e6a58c" stroke-width=".35" aria-hidden="true"><polygon points="${pts.join(" ")}"/><circle cx="50" cy="50" r="46.5"/><circle cx="50" cy="50" r="38"/></svg>`;
  },
  flame() { return `<svg viewBox="0 0 20 44" aria-hidden="true"><use href="#sym-flame"/></svg>` },
  uri(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")' },
  grain() { return this.uri('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>') },
  stone() { return this.uri('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><filter id="s"><feTurbulence type="fractalNoise" baseFrequency=".035 .06" numOctaves="4" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .55 0"/></filter><rect width="400" height="200" filter="url(#s)"/><path d="M0 0h400M0 100h400M0 200h400M0 0v100M200 0v100M400 0v100M100 100v100M300 100v100" stroke="#000000" stroke-opacity=".55" stroke-width="3" fill="none"/><path d="M0 3h400M0 103h400M3 0v100M203 0v100M103 100v100M303 100v100" stroke="#ffffff" stroke-opacity=".10" stroke-width="1.5" fill="none"/></svg>') }
};
