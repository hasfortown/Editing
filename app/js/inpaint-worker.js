/* Cutroom Photo — PatchMatch inpainting worker (content-aware fill / Remove tool) */
// data: Uint8ClampedArray RGBA (W*H), hole: Uint8Array (W*H) 1 = fill
function inpaint(data, W, H, hole, seed) {
  let rnd = seed || 12345; const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // region of interest around the hole
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hole[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return data;
  const hw = x1 - x0 + 1, hh = y1 - y0 + 1; const mg = Math.max(40, Math.round(Math.max(hw, hh) * 1.2));
  const rx0 = Math.max(0, x0 - mg), ry0 = Math.max(0, y0 - mg), rx1 = Math.min(W - 1, x1 + mg), ry1 = Math.min(H - 1, y1 + mg);
  const RW = rx1 - rx0 + 1, RH = ry1 - ry0 + 1;
  // level 0 buffers
  const img0 = new Float32Array(RW * RH * 3), m0 = new Uint8Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const i = (y + ry0) * W + x + rx0, j = y * RW + x; img0[j * 3] = data[i * 4]; img0[j * 3 + 1] = data[i * 4 + 1]; img0[j * 3 + 2] = data[i * 4 + 2]; m0[j] = hole[i] || data[i * 4 + 3] < 8 ? 1 : 0; }
  // pyramid
  const levels = [{ img: img0, m: m0, w: RW, h: RH }];
  while (true) {
    const L = levels[levels.length - 1]; const s = 2 ** levels.length;
    if (Math.max(hw, hh) / s < 10 || Math.min(RW, RH) / s < 28) break;
    const w = L.w >> 1, h = L.h >> 1; const img = new Float32Array(w * h * 3), m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0, any = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const j = (y * 2 + dy) * L.w + x * 2 + dx; if (L.m[j]) { any = 1; continue; } r += L.img[j * 3]; g += L.img[j * 3 + 1]; b += L.img[j * 3 + 2]; n++; }
      const k = y * w + x; m[k] = any; if (n) { img[k * 3] = r / n; img[k * 3 + 1] = g / n; img[k * 3 + 2] = b / n; }
    }
    levels.push({ img, m, w, h });
  }
  const R = 3; // 7x7 patches
  let nnf = null, prevW = 0;
  for (let li = levels.length - 1; li >= 0; li--) {
    const { img, m, w, h } = levels[li]; const n = w * h;
    // valid source centres: whole patch inside the image and outside the hole
    const ii = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let rs = 0; for (let x = 0; x < w; x++) { rs += m[y * w + x]; ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + rs; } }
    const holeIn = (xa, ya, xb, yb) => ii[(yb + 1) * (w + 1) + xb + 1] - ii[ya * (w + 1) + xb + 1] - ii[(yb + 1) * (w + 1) + xa] + ii[ya * (w + 1) + xa];
    const valid = new Uint8Array(n); const vlist = [];
    for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) if (!holeIn(x - R, y - R, x + R, y + R)) { valid[y * w + x] = 1; vlist.push(y * w + x); }
    if (!vlist.length) continue;
    // target centres: hole dilated by R
    const tgt = []; const isT = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (holeIn(Math.max(0, x - R), Math.max(0, y - R), Math.min(w - 1, x + R), Math.min(h - 1, y + R))) { isT[y * w + x] = 1; tgt.push(y * w + x); } }
    // initial fill
    if (li === levels.length - 1) {
      const known = new Uint8Array(n); for (let j = 0; j < n; j++) known[j] = m[j] ? 0 : 1;
      let left = 1; let guard = 0;
      while (left && guard++ < 4000) {
        left = 0; const upd = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = y * w + x; if (known[j]) continue; let r = 0, g = 0, b = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const k = yy * w + xx; if (!known[k]) continue; r += img[k * 3]; g += img[k * 3 + 1]; b += img[k * 3 + 2]; c++; } if (c) upd.push(j, r / c, g / c, b / c); else left = 1; }
        for (let q = 0; q < upd.length; q += 4) { const j = upd[q]; img[j * 3] = upd[q + 1]; img[j * 3 + 1] = upd[q + 2]; img[j * 3 + 2] = upd[q + 3]; known[j] = 1; }
        if (!upd.length) break;
      }
    }
    // nnf init (upsample from coarser level or random)
    const nn = new Int32Array(n).fill(-1), nd = new Float32Array(n).fill(Infinity);
    const dist = (p, s, best) => {
      const px = p % w, py = (p / w) | 0, sx = s % w, sy = (s / w) | 0; let d = 0;
      for (let dy = -R; dy <= R; dy++) { const yy = py + dy; if (yy < 0 || yy >= h) continue; const ty = sy + dy;
        for (let dx = -R; dx <= R; dx++) { const xx = px + dx; if (xx < 0 || xx >= w) continue; const a = (yy * w + xx) * 3, b = (ty * w + sx + dx) * 3;
          const e0 = img[a] - img[b], e1 = img[a + 1] - img[b + 1], e2 = img[a + 2] - img[b + 2]; d += e0 * e0 + e1 * e1 + e2 * e2; }
        if (d > best) return d; }
      return d;
    };
    const randValid = () => vlist[(rand() * vlist.length) | 0];
    for (const p of tgt) {
      let s = -1;
      if (nnf && prevW) { const px = p % w, py = (p / w) | 0; const cw = prevW; const q = nnf[(py >> 1) * cw + (px >> 1)]; if (q >= 0) { const sx = (q % cw) * 2 + (px & 1), sy = ((q / cw) | 0) * 2 + (py & 1); if (sx < w && sy < h && valid[sy * w + sx]) s = sy * w + sx; } }
      if (s < 0) s = randValid();
      nn[p] = s; nd[p] = dist(p, s, Infinity);
    }
    const emIters = li === 0 ? 2 : li === levels.length - 1 ? 6 : 4, pmIters = li === 0 ? 2 : 4;
    const maxR = Math.max(w, h);
    for (let em = 0; em < emIters; em++) {
      for (let it = 0; it < pmIters; it++) {
        const fwd = it % 2 === 0; const d = fwd ? 1 : -1;
        for (let t = fwd ? 0 : tgt.length - 1; fwd ? t < tgt.length : t >= 0; t += d) {
          const p = tgt[t]; const px = p % w, py = (p / w) | 0;
          // propagation
          for (const [ox, oy] of [[-d, 0], [0, -d]]) {
            const qx = px + ox, qy = py + oy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue; const q = qy * w + qx; if (!isT[q] || nn[q] < 0) continue;
            const sx = (nn[q] % w) - ox, sy = ((nn[q] / w) | 0) - oy; if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue; const s = sy * w + sx; if (!valid[s] || s === nn[p]) continue;
            const dd = dist(p, s, nd[p]); if (dd < nd[p]) { nd[p] = dd; nn[p] = s; }
          }
          // random search
          let rad = maxR; const cx = nn[p] % w, cy = (nn[p] / w) | 0;
          while (rad >= 1) {
            const sx = Math.round(cx + (rand() * 2 - 1) * rad), sy = Math.round(cy + (rand() * 2 - 1) * rad); rad *= 0.5;
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue; const s = sy * w + sx; if (!valid[s]) continue;
            const dd = dist(p, s, nd[p]); if (dd < nd[p]) { nd[p] = dd; nn[p] = s; }
          }
        }
      }
      // voting (weighted by patch similarity)
      let sigma = 0; { const ds = tgt.map((p) => nd[p]).sort((a, b) => a - b); sigma = Math.max(1, ds[(ds.length * 0.75) | 0] || 1); }
      const acc = new Float32Array(n * 3), wsum = new Float32Array(n);
      for (const p of tgt) {
        const s = nn[p]; const px = p % w, py = (p / w) | 0, sx = s % w, sy = (s / w) | 0; const wt = Math.exp(-nd[p] / (2 * sigma));
        for (let dy = -R; dy <= R; dy++) { const yy = py + dy; if (yy < 0 || yy >= h) continue; for (let dx = -R; dx <= R; dx++) { const xx = px + dx; if (xx < 0 || xx >= w) continue; const q = yy * w + xx; if (!m[q]) continue; const b = ((sy + dy) * w + sx + dx) * 3; acc[q * 3] += img[b] * wt; acc[q * 3 + 1] += img[b + 1] * wt; acc[q * 3 + 2] += img[b + 2] * wt; wsum[q] += wt; } }
      }
      for (let q = 0; q < n; q++) if (m[q] && wsum[q] > 0) { img[q * 3] = acc[q * 3] / wsum[q]; img[q * 3 + 1] = acc[q * 3 + 1] / wsum[q]; img[q * 3 + 2] = acc[q * 3 + 2] / wsum[q]; }
      for (const p of tgt) nd[p] = dist(p, nn[p], Infinity);
    }
    // upsample the hole estimate into the next level
    if (li > 0) {
      const F = levels[li - 1];
      for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) { const j = y * F.w + x; if (!F.m[j]) continue; const cx = Math.min(w - 1, x >> 1), cy = Math.min(h - 1, y >> 1); const k = cy * w + cx; F.img[j * 3] = img[k * 3]; F.img[j * 3 + 1] = img[k * 3 + 1]; F.img[j * 3 + 2] = img[k * 3 + 2]; }
      nnf = nn; prevW = w;
    }
  }
  const out = new Uint8ClampedArray(data);
  const L0 = levels[0];
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const j = y * RW + x; if (!L0.m[j]) continue; const i = ((y + ry0) * W + x + rx0) * 4; if (!hole[(y + ry0) * W + x + rx0]) continue; out[i] = L0.img[j * 3]; out[i + 1] = L0.img[j * 3 + 1]; out[i + 2] = L0.img[j * 3 + 2]; out[i + 3] = 255; }
  return out;
}
self.inpaint = inpaint;
self.onmessage = (e) => { const { id, data, W, H, hole } = e.data; try { const out = inpaint(data, W, H, hole); self.postMessage({ id, out }, [out.buffer]); } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); } };

