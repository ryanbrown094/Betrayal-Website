/* ===================== QR: a join link as a QR code (byte mode, error correction M, versions 1–6) ===================== */
const QR = {
  // [error-correction codewords per block, blocks, data codewords per block], alignment centre
  V: [null, [10, 1, 16, 0], [16, 1, 28, 18], [26, 1, 44, 22], [18, 2, 32, 26], [24, 2, 43, 30], [16, 4, 27, 34]],
  mul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; },
  divisor(n) { const d = new Array(n).fill(0); d[n - 1] = 1; let root = 1; for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { d[j] = this.mul(d[j], root); if (j + 1 < n) d[j] ^= d[j + 1]; } root = this.mul(root, 2); } return d; },
  ecc(data, div) { const r = new Array(div.length).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => (r[i] ^= this.mul(c, f))); } return r; },
  // the modules, true for dark
  make(text) {
    const bytes = [...new TextEncoder().encode(text)];
    let ver = 1; while (ver < 6 && bytes.length + 2 > this.V[ver][1] * this.V[ver][2]) ver++;
    const [ecn, nb, dpb, al] = this.V[ver], cap = nb * dpb;
    if (bytes.length + 2 > cap) throw new Error("too long for a QR code here");
    const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
    const div = this.divisor(ecn), blocks = [], eccs = [];
    for (let b = 0; b < nb; b++) { const d = data.slice(b * dpb, (b + 1) * dpb); blocks.push(d); eccs.push(this.ecc(d, div)); }
    const all = []; for (let i = 0; i < dpb; i++) blocks.forEach((b) => all.push(b[i])); for (let i = 0; i < ecn; i++) eccs.forEach((e) => all.push(e[i]));
    const n = ver * 4 + 17, m = Array.from({ length: n }, () => new Array(n).fill(false)), fn = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    if (al) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al + dx, al + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    const format = (mask, draw) => {
      const d = mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); // error correction M is 00
      const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) draw(8, i, bit(i));
      draw(8, 7, bit(6)); draw(8, 8, bit(7)); draw(7, 8, bit(8));
      for (let i = 9; i < 15; i++) draw(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) draw(n - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) draw(8, n - 15 + i, bit(i));
      draw(8, n - 8, true);
    };
    format(0, set);
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - v : v;
        if (!fn[y][x] && i < all.length * 8) { m[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const masked = (k) => { const g = m.map((row) => row.slice()); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASKS[k](x, y)) g[y][x] = !g[y][x]; format(k, (x, y, d) => (g[y][x] = d)); return g; };
    // the mask with the fewest long runs, 2×2 blocks and imbalance
    const cost = (g) => {
      let c = 0, dark = 0;
      for (let y = 0; y < n; y++) for (let t = 0; t < 2; t++) { let run = 1; for (let x = 1; x < n; x++) { const a = t ? g[x][y] : g[y][x], b = t ? g[x - 1][y] : g[y][x - 1]; if (a === b) { run++; if (run === 5) c += 3; else if (run > 5) c++; } else run = 1; } }
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) c += 3;
      for (const row of g) for (const d of row) if (d) dark++;
      return c + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    };
    let best = null, bc = Infinity; for (let k = 0; k < 8; k++) { const g = masked(k), c = cost(g); if (c < bc) { bc = c; best = g; } }
    return best;
  },
  svg(text, dark, light) {
    const g = this.make(text), n = g.length, q = 4; let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x]) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
    return `<svg class="qr" viewBox="0 0 ${n + q * 2} ${n + q * 2}" shape-rendering="crispEdges" role="img" aria-label="QR code: ${text.replace(/[&<>"]/g, "")}"><rect width="100%" height="100%" fill="${light || "#fff"}"/><path d="${d}" fill="${dark || "#000"}"/></svg>`;
  },
};
