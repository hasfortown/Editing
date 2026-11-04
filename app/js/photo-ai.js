/* Cutroom Photo — content-aware fill & Remove tool (PatchMatch inpainting), remove background,
   auto tone / contrast / color, histogram */
(function (C) {
  const P = C.photo, PU = C.photoUI, X = C.photoX;
  const A = (C.photoAI = {});

  // ================= INPAINTING (runs in js/inpaint-worker.js) =================
  let worker = null, wid = 0; const pend = new Map();
  function getWorker() {
    if (worker) return worker;
    try {
      worker = new Worker('js/inpaint-worker.js');
      worker.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.out); };
      worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error(e.message || 'worker error')); pend.clear(); worker = null; };
    } catch (_) { worker = null; }
    return worker;
  }
  A.inpaint = (data, W, H, hole) => new Promise((res, rej) => {
    const w = getWorker();
    if (!w) return rej(new Error('background worker unavailable'));
    const id = ++wid; pend.set(id, { res, rej }); w.postMessage({ id, data, W, H, hole }, [data.buffer]);
  });

  // fill `maskCanvas` (doc-sized, alpha = amount) on layer L with surrounding content
  A.fillLayer = async (L, maskCanvas, label = 'Content-aware fill') => {
    if (!L || L.type !== 'raster') { C.toast('Select a pixel layer first', 'info'); return false; }
    P.act('Prepare layer', () => P.prepPaint(L));
    const Wd = L.canvas.width, Hd = L.canvas.height;
    const mk = P.mk(Wd, Hd); const mx = mk.getContext('2d'); mx.drawImage(maskCanvas, -L.x, -L.y);
    const md = mx.getImageData(0, 0, Wd, Hd).data; const hole = new Uint8Array(Wd * Hd); let any = 0;
    for (let i = 0; i < hole.length; i++) if (md[i * 4 + 3] > 24) { hole[i] = 1; any++; }
    if (!any) { C.toast('Nothing to fill — make a selection or paint over something', 'info'); return false; }
    // grow the hole a little so object edges/halos are replaced too
    const grown = new Uint8Array(hole); for (let y = 1; y < Hd - 1; y++) for (let x = 1; x < Wd - 1; x++) { const i = y * Wd + x; if (hole[i]) continue; if (hole[i - 1] || hole[i + 1] || hole[i - Wd] || hole[i + Wd]) grown[i] = 1; }
    const busy = C.toast('Filling with surrounding content…', 'info', 120000);
    document.body.classList.add('busy');
    try {
      const src = L.canvas.getContext('2d').getImageData(0, 0, Wd, Hd);
      const out = await A.inpaint(new Uint8ClampedArray(src.data), Wd, Hd, grown);
      P.act(label, () => {
        const c = P.mk(Wd, Hd); const x = c.getContext('2d');
        const id = new ImageData(out, Wd, Hd);
        // blend by the (soft) mask so feathered edges stay soft
        const o = id.data, s = src.data;
        for (let i = 0; i < hole.length; i++) { const a = grown[i] ? Math.max(md[i * 4 + 3], hole[i] ? 255 : 160) / 255 : 0; if (a < 1) { const k = i * 4; for (let ch = 0; ch < 4; ch++) o[k + ch] = s[k + ch] + (o[k + ch] - s[k + ch]) * a; } }
        x.putImageData(id, 0, 0); L.canvas = c;
      });
      return true;
    } catch (e) { console.warn(e); C.toast('Fill failed: ' + e.message, 'err'); return false; }
    finally { busy && busy.remove(); document.body.classList.remove('busy'); }
  };
  A.contentAwareFill = async () => {
    if (!P.doc) return; if (!P.sel) return C.toast('Select the area to remove first (lasso, marquee or quick select)', 'info', 3000);
    const ok = await A.fillLayer(P.active(), P.sel.mask); if (ok) { P.deselect(); PU.redraw(); }
  };

  // ---------- Remove tool (paint over it, it disappears) ----------
  const ti = PU.TOOLS.findIndex((t) => t !== '-' && t[0] === 'heal');
  PU.TOOLS.splice(ti + 1, 0, ['remove', 'wand2', 'J', 'Remove tool (paint over things to erase them)']);
  PU.opts.remove = Object.assign({ size: 60 }, PU.opts.remove);
  PU._tools.remove = (e, p) => {
    const L = P.active(); if (!L || L.type !== 'raster') { C.toast('Select a pixel layer to remove things from', 'info'); return null; }
    const o = PU.opts.remove; const m = P.mk(P.doc.w, P.doc.h); const x = m.getContext('2d');
    x.strokeStyle = x.fillStyle = '#fff'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = o.size;
    x.beginPath(); x.arc(p.x, p.y, o.size / 2, 0, 6.283); x.fill(); x.beginPath(); x.moveTo(p.x, p.y);
    A._live = m; PU.redraw();
    return {
      move: (ev, q) => { x.lineTo(q.x, q.y); x.stroke(); x.beginPath(); x.moveTo(q.x, q.y); PU.redraw(); },
      up: async () => { await A.fillLayer(L, m, 'Remove'); A._live = null; PU.redraw(); },
    };
  };
  PU.overlayHooks.push((ox) => {
    if (!A._live) return; const t = P.tmp('rm_view', P.doc.w, P.doc.h); const x = t.getContext('2d');
    x.drawImage(A._live, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgba(255,61,181,.5)'; x.fillRect(0, 0, t.width, t.height);
    const [a, b] = PU.toScr(0, 0); ox.drawImage(t, a, b, P.doc.w * PU.view.z, P.doc.h * PU.view.z);
  });
  PU.optionHooks.push((t, bar, h) => { if (t === 'remove') { h.range('size', 'Size', 4, 400, 'px'); bar.appendChild(h.optRow('<span class="hint">Paint over people, objects, wires or blemishes — they are replaced with the surrounding background</span>')); } });

  // ================= REMOVE BACKGROUND / SELECT SUBJECT =================
  A.subjectMask = (src) => {
    const W0 = src.width, H0 = src.height; const k = Math.min(1, 720 / Math.max(W0, H0)); const w = Math.max(8, Math.round(W0 * k)), h = Math.max(8, Math.round(H0 * k));
    const sm = P.mk(w, h); const sx = sm.getContext('2d'); sx.drawImage(src, 0, 0, w, h); const d = sx.getImageData(0, 0, w, h).data;
    const n = w * h;
    // already-transparent images: use alpha
    let transp = 0; for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 20) transp++;
    const lab = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; lab[i * 3] = 0.299 * r + 0.587 * g + 0.114 * b; lab[i * 3 + 1] = (r - g) * 0.9; lab[i * 3 + 2] = (r + g) * 0.45 - b * 0.9; }
    // border samples -> k-means (k=4)
    const border = []; const bw = Math.max(2, Math.round(Math.min(w, h) * 0.015));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < bw || y < bw || x >= w - bw || y >= h - bw) border.push(y * w + x);
    const K = 4; let cen = Array.from({ length: K }, (_, i) => { const j = border[Math.floor(((i + 0.5) / K) * border.length)]; return [lab[j * 3], lab[j * 3 + 1], lab[j * 3 + 2]]; });
    let asg = new Int32Array(border.length);
    for (let it = 0; it < 10; it++) {
      border.forEach((j, q) => { let bi = 0, bd = Infinity; cen.forEach((c, ci) => { const dd = (lab[j * 3] - c[0]) ** 2 + (lab[j * 3 + 1] - c[1]) ** 2 + (lab[j * 3 + 2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = ci; } }); asg[q] = bi; });
      const s = cen.map(() => [0, 0, 0, 0]); border.forEach((j, q) => { const t = s[asg[q]]; t[0] += lab[j * 3]; t[1] += lab[j * 3 + 1]; t[2] += lab[j * 3 + 2]; t[3]++; });
      cen = cen.map((c, i) => (s[i][3] ? [s[i][0] / s[i][3], s[i][1] / s[i][3], s[i][2] / s[i][3]] : c));
    }
    const spread = cen.map(() => [0, 0]); border.forEach((j, q) => { const c = cen[asg[q]]; spread[asg[q]][0] += Math.sqrt((lab[j * 3] - c[0]) ** 2 + (lab[j * 3 + 1] - c[1]) ** 2 + (lab[j * 3 + 2] - c[2]) ** 2); spread[asg[q]][1]++; });
    const sig = spread.map(([s, c]) => (c ? s / c : 0)); const weight = spread.map(([, c]) => c / border.length);
    const bgScore = new Float32Array(n);
    for (let i = 0; i < n; i++) { let best = Infinity; cen.forEach((c, ci) => { if (weight[ci] < 0.03) return; const dd = Math.sqrt((lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2) / (sig[ci] * 2.2 + 14); if (dd < best) best = dd; }); bgScore[i] = best; }
    // flood from the border through background-like pixels (with local edge stop)
    const bg = new Uint8Array(n); const st = [];
    const edge = (a, b) => Math.abs(lab[a * 3] - lab[b * 3]) + Math.abs(lab[a * 3 + 1] - lab[b * 3 + 1]) + Math.abs(lab[a * 3 + 2] - lab[b * 3 + 2]);
    for (const j of border) if (bgScore[j] < 1 || d[j * 4 + 3] < 20) { bg[j] = 1; st.push(j); }
    while (st.length) { const j = st.pop(); const x = j % w, y = (j / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (bg[q]) continue; if (d[q * 4 + 3] < 20 || (bgScore[q] < 1 && edge(j, q) < 42) || bgScore[q] < 0.55) { bg[q] = 1; st.push(q); } } }
    // drop tiny foreground specks
    const lab2 = new Int32Array(n).fill(-1); const sizes = [];
    for (let i = 0; i < n; i++) { if (bg[i] || lab2[i] >= 0) continue; const id = sizes.length; let cnt = 0; const s2 = [i]; lab2[i] = id; while (s2.length) { const j = s2.pop(); cnt++; const x = j % w, y = (j / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (bg[q] || lab2[q] >= 0) continue; lab2[q] = id; s2.push(q); } } sizes.push(cnt); }
    const big = Math.max(...sizes, 0); const minKeep = Math.max(12, big * 0.04);
    const mc = P.mk(w, h); const mxx = mc.getContext('2d'); const id = mxx.createImageData(w, h);
    let fg = 0; for (let i = 0; i < n; i++) { const keep = !bg[i] && sizes[lab2[i]] >= minKeep; if (keep) fg++; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = keep ? 255 : 0; }
    mxx.putImageData(id, 0, 0);
    // upscale with soft edges
    const out = P.mk(W0, H0); const o = out.getContext('2d'); o.imageSmoothingQuality = 'high'; o.filter = `blur(${Math.max(0.6, 0.8 / k)}px)`; o.drawImage(mc, 0, 0, W0, H0);
    return { mask: out, coverage: fg / n, transparent: transp / n };
  };
  A.removeBackground = (asSelection = false) => {
    const L = P.active(); if (!P.doc || !L) return;
    if (L.type === 'adjust' || L.type === 'fill') return C.toast('Select a photo layer', 'info');
    const px = P.renderLayerPixels(L, P.doc.w, P.doc.h); const keep = P.mk(P.doc.w, P.doc.h); keep.getContext('2d').drawImage(px, 0, 0);
    const r = A.subjectMask(keep);
    if (r.coverage < 0.01 || r.coverage > 0.97) return C.toast("Couldn't find a clear subject — this works best on plain or simple backgrounds", 'info', 3600);
    if (asSelection) { P.setSelection(r.mask, 'new'); PU.redraw(); return C.toast('Subject selected', 'ok', 1400); }
    P.act('Remove background', () => {
      if (L.mask) { const c2 = P.clone(L.mask); const y = c2.getContext('2d'); y.globalCompositeOperation = 'destination-in'; y.drawImage(r.mask, 0, 0); L.mask = c2; }
      else L.mask = maskFromAlpha(r.mask);
      L.maskOn = true;
    });
    C.toast('Background removed as a layer mask — paint the mask to touch it up', 'ok', 3000);
  };
  // photo layer masks use alpha (white = visible); normalise to that
  function maskFromAlpha(a) { const m = P.mk(a.width, a.height); m.getContext('2d').drawImage(a, 0, 0); return m; }

  // ================= AUTO TONE / CONTRAST / COLOR =================
  A.auto = (kind) => {
    const L = P.active(); if (!L || L.type !== 'raster') return C.toast('Select a pixel layer', 'info');
    P.act({ tone: 'Auto tone', contrast: 'Auto contrast', color: 'Auto color' }[kind], () => {
      const c = P.clone(L.canvas); const x = c.getContext('2d'); const id = x.getImageData(0, 0, c.width, c.height); const d = id.data;
      const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]; let n = 0;
      const step = Math.max(1, Math.floor(d.length / 4 / 400000));
      for (let i = 0; i < d.length; i += 4 * step) { if (d[i + 3] < 10) continue; n++; hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; hist[3][Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)]++; }
      if (!n) return;
      const pct = (h, p) => { let s = 0; for (let v = 0; v < 256; v++) { s += h[v]; if (s >= n * p) return v; } return 255; };
      const clip = 0.005;
      const lut = [0, 1, 2].map((ch) => { const hh = kind === 'contrast' ? hist[3] : hist[ch]; const lo = pct(hh, clip), hi = Math.max(lo + 8, pct(hh, 1 - clip)); return Array.from({ length: 256 }, (_, v) => C.clamp(((v - lo) / (hi - lo)) * 255, 0, 255)); });
      if (kind === 'color') {
        const mean = [0, 1, 2].map((ch) => { let s = 0; for (let v = 0; v < 256; v++) s += lut[ch][v] * hist[ch][v]; return s / n; });
        const g = (mean[0] + mean[1] + mean[2]) / 3;
        [0, 1, 2].forEach((ch) => { const gam = Math.log(C.clamp(g / 255, 0.05, 0.95)) / Math.log(C.clamp(mean[ch] / 255, 0.05, 0.95)); for (let v = 0; v < 256; v++) lut[ch][v] = 255 * Math.pow(lut[ch][v] / 255, gam); });
      }
      for (let i = 0; i < d.length; i += 4) { d[i] = lut[0][d[i]]; d[i + 1] = lut[1][d[i + 1]]; d[i + 2] = lut[2][d[i + 2]]; }
      x.putImageData(id, 0, 0); L.canvas = c;
    });
  };

  // ================= HISTOGRAM (in the Color tab) =================
  const baseColorPanel = X.colorPanel;
  X.colorPanel = (box) => {
    baseColorPanel(box);
    const wrap = C.h('<div class="hist"><div class="hint" style="margin:10px 0 4px">Histogram</div><canvas width="480" height="150"></canvas><div class="hist-info hint"></div></div>');
    box.querySelector('.cp').appendChild(wrap);
    const cv = wrap.querySelector('canvas');
    const draw = () => {
      if (!box.isConnected) return C.off('photo:change', deb);
      if (!P.doc) return;
      const k = Math.min(1, 300 / Math.max(P.doc.w, P.doc.h)); const t = P.tmp('hist_s', Math.max(1, Math.round(P.doc.w * k)), Math.max(1, Math.round(P.doc.h * k)));
      t.getContext('2d').drawImage(P.composite(), 0, 0, t.width, t.height);
      const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
      const H = [new Float32Array(256), new Float32Array(256), new Float32Array(256), new Float32Array(256)]; let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 10) continue; H[0][d[i]]++; H[1][d[i + 1]]++; H[2][d[i + 2]]++; const l = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114); H[3][l]++; sum += l; n++; }
      const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height);
      const mx = Math.max(1, ...H.slice(0, 3).map((h) => { const s = Array.from(h).sort((a, b) => b - a); return s[3]; }));
      const cols = ['rgba(255,70,70,.55)', 'rgba(70,220,90,.55)', 'rgba(70,130,255,.55)', 'rgba(255,255,255,.35)'];
      x.globalCompositeOperation = document.body.classList.contains('theme-light') ? 'multiply' : 'screen';
      H.forEach((h, ci) => { x.fillStyle = cols[ci]; x.beginPath(); x.moveTo(0, cv.height); for (let v = 0; v < 256; v++) x.lineTo((v / 255) * cv.width, cv.height - Math.min(1, h[v] / mx) * (cv.height - 4)); x.lineTo(cv.width, cv.height); x.fill(); });
      x.globalCompositeOperation = 'source-over';
      wrap.querySelector('.hist-info').textContent = n ? `Mean brightness ${Math.round(sum / n)} · ${Math.round((H[3][0] + H[3][1]) / n * 1000) / 10}% clipped shadows · ${Math.round((H[3][255] + H[3][254]) / n * 1000) / 10}% clipped highlights` : '';
    };
    const deb = C.debounce(draw, 250);
    C.on('photo:change', deb); draw();
  };

  // ================= menus & keys =================
  const PP = C.photoPanels;
  const baseEdit = PP.menus.edit, baseImage = PP.menus.image, baseSelect = PP.menus.select, baseLayer = PP.menus.layer;
  PP.menus.edit = () => { const m = baseEdit(); const i = m.findIndex((x) => x.label === 'Fill with background'); m.splice(i + 1, 0, { label: 'Content-aware fill', icon: 'wand2', key: 'Shift+Del', disabled: !P.sel, action: A.contentAwareFill }); return m; };
  PP.menus.image = () => [
    { label: 'Auto tone', icon: 'sparkles', key: 'Ctrl+Shift+L', disabled: !P.doc, action: () => A.auto('tone') },
    { label: 'Auto contrast', icon: 'adjust', key: 'Ctrl+Alt+Shift+L', disabled: !P.doc, action: () => A.auto('contrast') },
    { label: 'Auto color', icon: 'droplet', key: 'Ctrl+Shift+B', disabled: !P.doc, action: () => A.auto('color') },
    '-', ...baseImage()];
  PP.menus.select = () => { const m = baseSelect(); m.splice(5, 0, { label: 'Select subject', icon: 'sparkles', disabled: !P.doc, action: () => A.removeBackground(true) }); return m; };
  PP.menus.layer = () => { const m = baseLayer(); const i = m.findIndex((x) => x.label === 'Layer styles…'); m.splice(i, 0, { label: 'Remove background', icon: 'wand2', disabled: !P.active(), action: () => A.removeBackground(false) }, { label: 'Save layer to assets', icon: 'bookmark', disabled: !P.active(), action: () => { const L = P.active(); const px = P.renderLayerPixels(L, P.doc.w, P.doc.h); const c = P.mk(P.doc.w, P.doc.h); c.getContext('2d').drawImage(px, 0, 0); C.assets.saveImage(trimCanvas(c), L.name || 'Layer'); } }, { label: 'Save whole image to assets', icon: 'bookmark', disabled: !P.doc, action: () => C.assets.saveImage(P.flattened(), P.doc.name || 'Image') }); return m; };
  const baseFile = PP.menus.file;
  PP.menus.file = () => { const m = baseFile(); const i = m.findIndex((x) => x.label === 'Place image as layer…'); m.splice(i + 1, 0, { label: 'Place from assets…', icon: 'bookmark', action: async () => { const a = await C.assets.pick(['image'], 'Place an image from your assets'); if (a) C.assets.toPhoto(a); } }); return m; };
  function trimCanvas(c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (x1 < 0) return c; const o = P.mk(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, -x0, -y0); return o; }
  const baseKey = PP.key;
  PP.key = (e) => {
    if (C.mode === 'photo' && !C.isTyping()) {
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (ctrl && e.shiftKey && k === 'l' && !e.altKey) { e.preventDefault(); A.auto('tone'); return true; }
      if (ctrl && e.shiftKey && e.altKey && k === 'l') { e.preventDefault(); A.auto('contrast'); return true; }
      if (ctrl && e.shiftKey && k === 'b') { e.preventDefault(); A.auto('color'); return true; }
      if (!ctrl && e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); A.contentAwareFill(); return true; }
    }
    return baseKey(e);
  };
})(window.C);
