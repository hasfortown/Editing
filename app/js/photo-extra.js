/* Cutroom Photo — pen tool, quick select, polygonal lasso, distort/warp, liquify,
   color range, selection modifiers, quick mask, color panel, grid & snapping, align */
(function (C) {
  const P = C.photo, PU = C.photoUI;
  const X = (C.photoX = { grid: false, thirds: false, snap: true });
  try { Object.assign(X, JSON.parse(localStorage.getItem('cutroom.photoView') || '{}')); } catch (_) {}
  const saveView = () => { try { localStorage.setItem('cutroom.photoView', JSON.stringify({ grid: X.grid, thirds: X.thirds, snap: X.snap })); } catch (_) {} };
  const toScr = (x, y) => PU.toScr(x, y);
  const T = PU._tools;

  // ================= PEN TOOL =================
  PU.pen = { pts: [], closed: false };
  const penPath = (x, pts, closed) => C.geo.tracePath(x, pts, 1, 1, closed);
  T.pen = (e, p) => {
    const pen = PU.pen; const z = PU.view.z; const near = (q) => Math.hypot(q.x - p.x, q.y - p.y) < 9 / z;
    if (pen.closed) { const i = pen.pts.findIndex(near); if (i < 0) { pen.pts = []; pen.closed = false; } else return dragPoint(pen.pts[i], p, e.altKey); }
    if (pen.pts.length > 2 && near(pen.pts[0])) { pen.closed = true; PU.renderOptions(); PU.redraw(); return null; }
    const ex = pen.pts.findIndex(near); if (ex >= 0) return dragPoint(pen.pts[ex], p, e.altKey);
    const pt = { x: p.x, y: p.y, ix: 0, iy: 0, ox: 0, oy: 0 }; pen.pts.push(pt); PU.renderOptions();
    return { move: (m, q) => { pt.ox = q.x - p.x; pt.oy = q.y - p.y; pt.ix = -pt.ox; pt.iy = -pt.oy; }, up: () => PU.redraw() };
  };
  function dragPoint(pt, p, handles) {
    const o = Object.assign({}, pt);
    return { move: (m, q) => { if (handles || m.altKey) { pt.ox = q.x - pt.x; pt.oy = q.y - pt.y; pt.ix = -pt.ox; pt.iy = -pt.oy; } else { pt.x = o.x + q.x - p.x; pt.y = o.y + q.y - p.y; } } };
  }
  PU.overlayHooks.push((ox) => {
    const pen = PU.pen; if (!pen.pts.length || PU.tool !== 'pen') return;
    ox.save(); ox.beginPath();
    const z = PU.view.z;
    ox.translate(PU.view.ox, PU.view.oy); ox.scale(z, z); penPath(ox, pen.pts, pen.closed);
    if (!pen.closed && PU.hover()) { const l = pen.pts[pen.pts.length - 1], h = PU.hover(); ox.bezierCurveTo(l.x + l.ox, l.y + l.oy, h.x, h.y, h.x, h.y); }
    ox.restore();
    ox.strokeStyle = '#000'; ox.lineWidth = 3; ox.stroke(); ox.strokeStyle = '#4dd4ff'; ox.lineWidth = 1.5; ox.stroke();
    pen.pts.forEach((pt, i) => {
      const [x, y] = toScr(pt.x, pt.y);
      for (const k of ['i', 'o']) { if (!pt[k + 'x'] && !pt[k + 'y']) continue; const [hx, hy] = toScr(pt.x + pt[k + 'x'], pt.y + pt[k + 'y']); ox.strokeStyle = '#4dd4ff'; ox.lineWidth = 1; ox.beginPath(); ox.moveTo(x, y); ox.lineTo(hx, hy); ox.stroke(); ox.fillStyle = '#4dd4ff'; ox.beginPath(); ox.arc(hx, hy, 4, 0, 6.283); ox.fill(); }
      ox.fillStyle = i === 0 && !pen.closed && pen.pts.length > 2 ? '#4dd4ff' : '#fff'; ox.strokeStyle = '#1b6fa8'; ox.lineWidth = 1.5; ox.fillRect(x - 4, y - 4, 8, 8); ox.strokeRect(x - 4, y - 4, 8, 8);
    });
  });
  const penReady = () => { const pen = PU.pen; if (pen.pts.length < 2) { C.toast('Draw a path with the Pen tool first', 'info'); return false; } return true; };
  X.penToSelection = (mode = PU.opts.pen.mode) => { if (!penReady()) return; P.selectShape((x) => penPath(x, PU.pen.pts, true), mode, PU.opts.pen.feather); PU.redraw(); C.toast('Path converted to a selection', 'ok', 1200); };
  X.penToShape = () => {
    if (!penReady()) return; const pts = PU.pen.pts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) for (const [x, y] of [[p.x, p.y], [p.x + p.ix, p.y + p.iy], [p.x + p.ox, p.y + p.oy]]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const npts = pts.map((p) => ({ x: (p.x - cx) / w, y: (p.y - cy) / h, ix: p.ix / w, iy: p.iy / h, ox: p.ox / w, oy: p.oy / h }));
    P.act('Shape from path', () => { const L = P.addShape('path', cx, cy, w, h); L.name = 'Path shape'; L.shape.pts = npts; L.shape.closed = PU.pen.closed || true; });
    PU.pen = { pts: [], closed: false }; PU.renderOptions();
  };
  X.penToMask = () => {
    if (!penReady()) return; const L = P.active(); if (!L) return;
    P.act('Mask from path', () => { const m = P.mk(P.doc.w, P.doc.h); const x = m.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); penPath(x, PU.pen.pts, true); x.fill(); if (L.mask) { const c2 = P.clone(L.mask); const y = c2.getContext('2d'); y.globalCompositeOperation = 'destination-in'; y.drawImage(m, 0, 0); L.mask = c2; } else L.mask = m; L.maskOn = true; });
    C.toast('Layer mask created from the path', 'ok', 1500);
  };
  X.penToStroke = () => {
    if (!penReady()) return; const L = P.active(); if (!L || L.type !== 'raster') return C.toast('Select a pixel layer to stroke the path', 'info');
    P.act('Stroke path', () => { P.prepPaint(L); const c = P.clone(L.canvas); const x = c.getContext('2d'); x.translate(-L.x, -L.y); x.beginPath(); penPath(x, PU.pen.pts, PU.pen.closed); x.strokeStyle = P.fg; x.lineWidth = PU.opts.brush.size / 4; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke(); L.canvas = c; });
  };
  PU.optionHooks.push((t, bar, h) => {
    if (t === 'pen') {
      h.sel('mode', 'Selection', [['new', 'New'], ['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']]);
      h.range('feather', 'Feather', 0, 100, 'px');
      const r = h.optRow(`<button class="btn primary" style="height:28px">Make selection</button><button class="btn" style="height:28px">Shape layer</button><button class="btn" style="height:28px">Layer mask</button><button class="btn" style="height:28px">Stroke</button><button class="btn" style="height:28px">Clear</button>`);
      const b = r.querySelectorAll('button');
      b[0].onclick = () => X.penToSelection(); b[1].onclick = X.penToShape; b[2].onclick = X.penToMask; b[3].onclick = X.penToStroke; b[4].onclick = () => { PU.pen = { pts: [], closed: false }; PU.redraw(); };
      bar.appendChild(r);
      bar.appendChild(h.optRow(`<span class="hint">${PU.pen.closed ? 'Path closed · drag points to adjust (Alt = handles)' : 'Click to add points · drag for curves · click first point to close · Enter = selection'}</span>`));
    }
    if (t === 'xform' && X.xf) {
      const r = h.optRow(`<b style="color:var(--text)">${X.xf.type === 'warp' ? 'Warp' : 'Perspective / distort'}</b><button class="btn primary" style="height:28px">Apply (Enter)</button><button class="btn" style="height:28px">Cancel (Esc)</button><span class="hint">${X.xf.type === 'warp' ? 'Drag the grid points to bend the layer' : 'Drag the corners · Shift = keep straight edges'}</span>`);
      r.querySelectorAll('button')[0].onclick = X.applyTransform; r.querySelectorAll('button')[1].onclick = X.cancelTransform; bar.appendChild(r);
    }
  });

  // ================= POLYGONAL LASSO =================
  PU.polyLasso = (e, p) => {
    const o = PU.opts.lasso; const z = PU.view.z;
    if (!X.poly) { X.poly = { pts: [[p.x, p.y]], mode: e.shiftKey ? 'add' : e.altKey ? 'subtract' : o.mode }; PU.redraw(); return null; }
    const f = X.poly.pts[0];
    if (X.poly.pts.length > 2 && Math.hypot(f[0] - p.x, f[1] - p.y) < 10 / z) return X.closePoly(), null;
    X.poly.pts.push([p.x, p.y]); PU.redraw(); return null;
  };
  X.closePoly = () => { const q = X.poly; X.poly = null; if (!q || q.pts.length < 3) return PU.redraw(); P.selectShape((x) => { q.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); }, q.mode, PU.opts.lasso.feather); PU.redraw(); };
  PU.overlayHooks.push((ox) => {
    if (!X.poly) return; const h = PU.hover();
    ox.setLineDash([5, 4]); ox.strokeStyle = '#fff'; ox.lineWidth = 1.2; ox.beginPath();
    X.poly.pts.forEach(([x, y], i) => { const [a, b] = toScr(x, y); i ? ox.lineTo(a, b) : ox.moveTo(a, b); });
    if (h) { const [a, b] = toScr(h.x, h.y); ox.lineTo(a, b); }
    ox.stroke(); ox.setLineDash([]);
    X.poly.pts.forEach(([x, y]) => { const [a, b] = toScr(x, y); ox.fillStyle = '#fff'; ox.fillRect(a - 3, b - 3, 6, 6); });
  });

  // ================= QUICK SELECTION BRUSH =================
  T.quick = (e, p) => {
    const o = PU.opts.quick; const comp = P.composite(); const W = P.doc.w, H = P.doc.h;
    const acc = P.mk(W, H); const ax = acc.getContext('2d');
    const subtract = e.altKey; const R = Math.max(30, o.size * 3);
    const grow = (q) => {
      const x0 = Math.max(0, Math.floor(q.x - R)), y0 = Math.max(0, Math.floor(q.y - R)), x1 = Math.min(W, Math.ceil(q.x + R)), y1 = Math.min(H, Math.ceil(q.y + R));
      if (x1 <= x0 || y1 <= y0) return;
      const crop = P.tmp('qs_crop', x1 - x0, y1 - y0); crop.getContext('2d').drawImage(comp, -x0, -y0);
      const m = P.floodMask(crop, x0, y0, q.x, q.y, o.tol, true); ax.drawImage(m, 0, 0);
      ax.fillStyle = '#fff'; ax.beginPath(); ax.arc(q.x, q.y, o.size / 2, 0, 6.283); ax.fill();
    };
    grow(p); X.qsLive = { acc, subtract }; PU.redraw();
    let last = p;
    return {
      move: (m, q) => { if (Math.hypot(q.x - last.x, q.y - last.y) > o.size / 3) { grow(q); last = q; } },
      up: () => { X.qsLive = null; P.setSelection(acc, subtract ? 'subtract' : P.sel ? 'add' : 'new'); PU.redraw(); },
    };
  };
  PU.overlayHooks.push((ox) => {
    if (!X.qsLive) return; const t = P.tmp('qs_view', P.doc.w, P.doc.h); const x = t.getContext('2d');
    x.drawImage(X.qsLive.acc, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = X.qsLive.subtract ? 'rgba(255,80,80,.45)' : 'rgba(77,212,255,.45)'; x.fillRect(0, 0, t.width, t.height);
    const [a, b] = toScr(0, 0); ox.drawImage(t, a, b, P.doc.w * PU.view.z, P.doc.h * PU.view.z);
  });

  // ================= QUICK MASK =================
  X.toggleQuickMask = () => {
    P.ui.quickMask = !P.ui.quickMask;
    if (P.ui.quickMask && !['brush', 'eraser'].includes(PU.tool)) PU.setTool('brush');
    C.toast(P.ui.quickMask ? 'Quick mask on — paint to add to the selection, erase to remove. Press Q to finish.' : 'Quick mask off — selection updated', 'info', 2600);
    C.$('#phQM') && C.$('#phQM').classList.toggle('on', P.ui.quickMask); PU.redraw();
  };
  PU.overlayHooks.push((ox) => {
    if (!P.ui.quickMask || !P.doc) return;
    const mask = PU.liveQuickMask();
    const t = P.tmp('qm_view', P.doc.w, P.doc.h); const x = t.getContext('2d');
    x.fillStyle = 'rgba(255,40,60,.5)'; x.fillRect(0, 0, t.width, t.height);
    if (mask) { x.globalCompositeOperation = 'destination-out'; x.drawImage(mask, 0, 0); }
    const [a, b] = toScr(0, 0); ox.drawImage(t, a, b, P.doc.w * PU.view.z, P.doc.h * PU.view.z);
  });

  // ================= GRID, THIRDS & SNAPPING =================
  PU.overlayHooks.push((ox) => {
    if (!P.doc) return; const [x0, y0] = toScr(0, 0), [x1, y1] = toScr(P.doc.w, P.doc.h);
    if (X.grid) { const step = Math.max(10, Math.round(Math.min(P.doc.w, P.doc.h) / 12)); ox.strokeStyle = 'rgba(77,212,255,.25)'; ox.lineWidth = 1; ox.beginPath(); for (let x = step; x < P.doc.w; x += step) { const [a] = toScr(x, 0); ox.moveTo(a, y0); ox.lineTo(a, y1); } for (let y = step; y < P.doc.h; y += step) { const [, b] = toScr(0, y); ox.moveTo(x0, b); ox.lineTo(x1, b); } ox.stroke(); }
    if (X.thirds) { ox.strokeStyle = 'rgba(255,255,255,.55)'; ox.lineWidth = 1; ox.beginPath(); for (const f of [1 / 3, 2 / 3]) { ox.moveTo(x0 + (x1 - x0) * f, y0); ox.lineTo(x0 + (x1 - x0) * f, y1); ox.moveTo(x0, y0 + (y1 - y0) * f); ox.lineTo(x1, y0 + (y1 - y0) * f); } ox.stroke(); }
    if (PU._guides) { ox.strokeStyle = '#ff3db5'; ox.lineWidth = 1; ox.beginPath(); for (const g of PU._guides) { if (g.v != null) { const [a] = toScr(g.v, 0); ox.moveTo(a, y0 - 2000); ox.lineTo(a, y1 + 2000); } else { const [, b] = toScr(0, g.h); ox.moveTo(x0 - 2000, b); ox.lineTo(x1 + 2000, b); } } ox.stroke(); }
  });
  PU.moveHooks.push((L, ev) => {
    PU._guides = null; if (!X.snap || ev.ctrlKey) return;
    const cs = P.corners(L); const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
    const bx = [Math.min(...xs), (Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...xs)], by = [Math.min(...ys), (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...ys)];
    const tx = [0, P.doc.w / 2, P.doc.w], ty = [0, P.doc.h / 2, P.doc.h]; const th = 7 / PU.view.z; const g = [];
    let best = null; for (const a of bx) for (const t of tx) { const d = t - a; if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }
    if (best) { L.x += best.d; g.push({ v: best.t }); }
    best = null; for (const a of by) for (const t of ty) { const d = t - a; if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }
    if (best) { L.y += best.d; g.push({ h: best.t }); }
    PU._guides = g.length ? g : null;
  });
  X.toggle = (k) => { X[k] = !X[k]; saveView(); PU.redraw(); C.toast(`${{ grid: 'Grid', thirds: 'Rule of thirds', snap: 'Snapping' }[k]} ${X[k] ? 'on' : 'off'}`, 'info', 1000); };

  // ================= ALIGN =================
  X.align = (how) => {
    const L = P.active(); if (!L || L.type === 'adjust' || L.type === 'fill') return;
    const ref = P.sel && P.sel.bounds ? P.sel.bounds : { x: 0, y: 0, w: P.doc.w, h: P.doc.h };
    const cs = P.corners(L); const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
    const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
    P.act('Align', () => {
      if (how === 'left') L.x += ref.x - l; if (how === 'right') L.x += ref.x + ref.w - r; if (how === 'hcenter') L.x += ref.x + ref.w / 2 - (l + r) / 2;
      if (how === 'top') L.y += ref.y - t; if (how === 'bottom') L.y += ref.y + ref.h - b; if (how === 'vcenter') L.y += ref.y + ref.h / 2 - (t + b) / 2;
    });
  };

  // ================= SELECTION: COLOR RANGE & MODIFY =================
  const dilate = (src, r, W, H) => { const c = P.mk(W, H); const x = c.getContext('2d'); x.drawImage(src, 0, 0); const n = Math.min(48, Math.max(12, Math.round(r * 1.5))); for (const rr of r > 3 ? [r, r * 0.66, r * 0.33] : [r]) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; x.drawImage(src, Math.cos(a) * rr, Math.sin(a) * rr); } return c; };
  const invert = (src, W, H) => { const c = P.mk(W, H); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'destination-out'; x.drawImage(src, 0, 0); return c; };
  X.modify = async (kind) => {
    if (!P.sel) return C.toast('Make a selection first', 'info');
    const v = await C.prompt({ expand: 'Expand selection', contract: 'Contract selection', smooth: 'Smooth selection', border: 'Border selection' }[kind], 'Amount (px)', '8', 'OK');
    const r = parseFloat(v); if (!r) return;
    const W = P.doc.w, H = P.doc.h, m = P.sel.mask; let out;
    if (kind === 'expand') out = dilate(m, r, W, H);
    else if (kind === 'contract') out = invert(dilate(invert(m, W, H), r, W, H), W, H);
    else if (kind === 'smooth') { out = P.mk(W, H); const x = out.getContext('2d'); x.filter = `blur(${r}px) url(#cr-post-2)`; x.drawImage(m, 0, 0); }
    else { const big = dilate(m, r / 2, W, H); const small = invert(dilate(invert(m, W, H), r / 2, W, H), W, H); out = big; const x = out.getContext('2d'); x.globalCompositeOperation = 'destination-out'; x.drawImage(small, 0, 0); }
    P.sel = { mask: out }; P.selEdges(); C.emit('photo:selection'); PU.redraw();
  };
  X.colorRange = () => {
    if (!P.doc) return;
    let fuzz = 40, col = P.fg, all = true; let mask = null;
    const { el, close } = C.modal(`<div class="modal-head"><h2>Select color range</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body"><div style="display:grid;grid-template-columns:260px 1fr;gap:16px"><canvas id="crPrev" style="width:260px;background:#000;border-radius:8px"></canvas><div>
      <div class="form-row"><label>Color</label><div style="display:flex;gap:8px"><input type="color" class="color-input" id="crCol" style="width:70px" value="${col}"><button class="btn" id="crPick">${C.icon('eyedrop')}<span>Pick from image</span></button></div></div>
      <div class="form-row"><label>Fuzziness</label><input type="range" min="1" max="200" value="${fuzz}" id="crF"></div>
      <div class="form-row"><label>Sample</label><label class="ph-chk"><input type="checkbox" id="crAll" checked> All layers</label></div>
      <p class="hint">White = selected. Pick a color by clicking the preview.</p></div></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="crOk">Select</button></div>`, { cls: 'wide' });
    const pv = el.querySelector('#crPrev'); const k = 260 / P.doc.w; pv.width = 260; pv.height = Math.round(P.doc.h * k);
    const build = () => {
      const src = all ? P.composite() : P.renderLayerPixels(P.active(), P.doc.w, P.doc.h);
      const W = P.doc.w, H = P.doc.h; const d = src.getContext('2d').getImageData(0, 0, W, H).data;
      const n = parseInt(col.slice(1), 16), r0 = (n >> 16) & 255, g0 = (n >> 8) & 255, b0 = n & 255;
      mask = P.mk(W, H); const mx = mask.getContext('2d'); const id = mx.createImageData(W, H); const o = id.data;
      for (let i = 0; i < d.length; i += 4) { const dist = Math.sqrt((d[i] - r0) ** 2 + (d[i + 1] - g0) ** 2 + (d[i + 2] - b0) ** 2); const a = d[i + 3] ? C.clamp(1 - (dist - fuzz) / (fuzz * 0.6 + 1), 0, 1) : 0; o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = a * 255; }
      mx.putImageData(id, 0, 0);
      const x = pv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, pv.width, pv.height); x.drawImage(mask, 0, 0, pv.width, pv.height);
    };
    const deb = C.debounce(build, 60);
    el.querySelector('#crCol').oninput = (e) => { col = e.target.value; deb(); };
    el.querySelector('#crF').oninput = (e) => { fuzz = +e.target.value; deb(); };
    el.querySelector('#crAll').onchange = (e) => { all = e.target.checked; build(); };
    el.querySelector('#crPick').onclick = async () => { try { const r = await new window.EyeDropper().open(); col = r.sRGBHex; el.querySelector('#crCol').value = col; build(); } catch (_) {} };
    pv.addEventListener('click', (e) => { const r = pv.getBoundingClientRect(); const x = Math.floor(((e.clientX - r.left) / r.width) * P.doc.w), y = Math.floor(((e.clientY - r.top) / r.height) * P.doc.h); const d = P.composite().getContext('2d').getImageData(x, y, 1, 1).data; col = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); el.querySelector('#crCol').value = col; build(); });
    el.querySelector('#crOk').onclick = () => { close(); if (mask) { P.setSelection(mask, 'new'); PU.redraw(); } };
    build();
  };

  // ================= DISTORT / WARP TRANSFORMS =================
  const homography = (q) => {
    // unit square -> quad q[0..3] = TL, TR, BR, BL
    const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
  };
  const bern = (t) => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
  const bezierPatch = (G) => (u, v) => { const bu = bern(u), bv = bern(v); let x = 0, y = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const w = bu[i] * bv[j]; x += G[j * 4 + i][0] * w; y += G[j * 4 + i][1] * w; } return [x, y]; };
  X.startTransform = (type) => {
    const L = P.active(); if (!L || L.type === 'adjust' || L.type === 'fill') return C.toast('Select a layer to transform', 'info');
    P.begin(type === 'warp' ? 'Warp' : 'Distort');
    if (L.type !== 'raster') P.rasterize(L);
    P.prepPaint(L, false);
    const x0 = L.x, y0 = L.y, w = L.canvas.width, h = L.canvas.height;
    X.xf = { L, type, src: L.canvas, x0, y0, w, h, prevTool: PU.tool,
      pts: type === 'warp' ? Array.from({ length: 16 }, (_, k) => [x0 + ((k % 4) / 3) * w, y0 + (Math.floor(k / 4) / 3) * h]) : [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]] };
    PU.tool = 'xform'; C.$$('.ph-tool').forEach((b) => b.classList.remove('on')); PU.renderOptions(); P.changed();
  };
  const xfMap = () => { const xf = X.xf; return xf.type === 'warp' ? bezierPatch(xf.pts) : homography(xf.pts); };
  // tmp() clears on fetch, so keep the preview in our own canvas
  let prevC = null;
  const _rlp = P.renderLayerPixels;
  P.renderLayerPixels = (L, W, H) => {
    if (X.xf && X.xf.L === L) {
      const xf = X.xf; const key = JSON.stringify(xf.pts) + W + 'x' + H;
      if (xf._key !== key || !prevC) { prevC = prevC && prevC.width === W && prevC.height === H ? prevC : P.mk(W, H); xf.srcData = xf.srcData || xf.src.getContext('2d').getImageData(0, 0, xf.w, xf.h); prevC.getContext('2d').putImageData(C.geo.meshPixels(xf.srcData, xf.w, xf.h, 24, 24, xfMap(), W, H), 0, 0); xf._key = key; }
      return prevC;
    }
    return _rlp(L, W, H);
  };
  T.xform = (e, p) => {
    const xf = X.xf; if (!xf) return null; const z = PU.view.z;
    const i = xf.pts.findIndex(([x, y]) => Math.hypot(x - p.x, y - p.y) < 10 / z);
    if (i < 0) return null;
    const o = xf.pts[i].slice();
    return { move: (m, q) => { xf.pts[i] = [o[0] + q.x - p.x, o[1] + q.y - p.y]; P.changed(); } };
  };
  PU.overlayHooks.push((ox) => {
    const xf = X.xf; if (!xf) return; const map = xfMap();
    ox.strokeStyle = 'rgba(255,255,255,.6)'; ox.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { ox.beginPath(); for (let s = 0; s <= 20; s++) { const [x, y] = map(k / 4, s / 20); const [a, b] = toScr(x, y); s ? ox.lineTo(a, b) : ox.moveTo(a, b); } ox.stroke(); ox.beginPath(); for (let s = 0; s <= 20; s++) { const [x, y] = map(s / 20, k / 4); const [a, b] = toScr(x, y); s ? ox.lineTo(a, b) : ox.moveTo(a, b); } ox.stroke(); }
    if (xf.type === 'warp') { ox.strokeStyle = 'rgba(77,212,255,.6)'; ox.beginPath(); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const [a, b] = toScr(...xf.pts[j * 4 + i]); if (i) { const [c, d] = toScr(...xf.pts[j * 4 + i - 1]); ox.moveTo(c, d); ox.lineTo(a, b); } if (j) { const [c, d] = toScr(...xf.pts[(j - 1) * 4 + i]); ox.moveTo(c, d); ox.lineTo(a, b); } } ox.stroke(); }
    for (const pt of xf.pts) { const [a, b] = toScr(pt[0], pt[1]); ox.fillStyle = '#fff'; ox.strokeStyle = '#19d3c5'; ox.lineWidth = 2; ox.beginPath(); ox.arc(a, b, 6, 0, 6.283); ox.fill(); ox.stroke(); }
  });
  X.applyTransform = () => {
    const xf = X.xf; if (!xf) return; const map = xfMap();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let j = 0; j <= 20; j++) for (let i = 0; i <= 20; i++) { const [x, y] = map(i / 20, j / 20); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    const c = P.mk(Math.max(1, Math.ceil(x1 - x0)), Math.max(1, Math.ceil(y1 - y0)));
    c.getContext('2d').putImageData(C.geo.meshPixels(xf.srcData || xf.src, xf.w, xf.h, 48, 48, map, c.width, c.height, x0, y0), 0, 0);
    xf.L.canvas = c; xf.L.x = x0; xf.L.y = y0;
    const prev = xf.prevTool; X.xf = null; P.commit(); PU.setTool(prev === 'xform' ? 'move' : prev);
  };
  X.cancelTransform = () => { const xf = X.xf; if (!xf) return; X.xf = null; P.cancel(); PU.setTool(xf.prevTool === 'xform' ? 'move' : xf.prevTool); };

  // ================= LIQUIFY =================
  X.liquify = () => {
    const L = P.active(); if (!L || L.type === 'adjust' || L.type === 'fill') return C.toast('Select a pixel layer', 'info');
    if (L.type !== 'raster' || !P.isIdentity(L)) { P.act('Prepare layer', () => { if (L.type !== 'raster') P.rasterize(L); P.prepPaint(L, false); }); }
    const src = L.canvas, SW = src.width, SH = src.height;
    const cols = Math.min(80, Math.max(20, Math.round(SW / 24))), rows = Math.max(12, Math.round((cols * SH) / SW));
    const grid = []; for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) grid.push([(i / cols) * SW, (j / rows) * SH]);
    const orig = grid.map((p) => p.slice());
    const st = { tool: 'push', size: Math.round(Math.min(SW, SH) / 8), pressure: 50 };
    const { el, close } = C.modal(`<div class="modal-head"><h2>Liquify</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="liq"><div class="liq-tools"><div class="seg" id="lqT" style="flex-direction:column">${[['push', 'Forward warp'], ['bloat', 'Bloat'], ['pinch', 'Pucker'], ['twirl', 'Twirl clockwise'], ['twirlL', 'Twirl counter'], ['restore', 'Reconstruct']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
        <div class="form-row" style="grid-template-columns:1fr;gap:4px;margin-top:12px"><label>Brush size</label><input type="range" min="5" max="${Math.round(Math.max(SW, SH) / 2)}" value="${st.size}" id="lqS"></div>
        <div class="form-row" style="grid-template-columns:1fr;gap:4px"><label>Pressure</label><input type="range" min="1" max="100" value="${st.pressure}" id="lqP"></div>
        <button class="btn block" id="lqR">Restore all</button></div>
        <div class="liq-view"><canvas id="lqC"></canvas><canvas id="lqO" style="pointer-events:none"></canvas></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="lqOk">Apply</button></div>`, { cls: 'studio-modal' });
    const cv = el.querySelector('#lqC'), ov = el.querySelector('#lqO'); const box = el.querySelector('.liq-view');
    const fit = () => { const r = box.getBoundingClientRect(); const k = Math.min((r.width - 20) / SW, (r.height - 20) / SH, 1); for (const c of [cv, ov]) { c.width = Math.round(SW * k); c.height = Math.round(SH * k); c.style.width = c.width + 'px'; c.style.height = c.height + 'px'; } return k; };
    let k = 1;
    const srcData = src.getContext('2d').getImageData(0, 0, SW, SH);
    const gp = (u, v) => grid[Math.round(v * rows) * (cols + 1) + Math.round(u * cols)];
    const render = () => { cv.getContext('2d').putImageData(C.geo.meshPixels(srcData, SW, SH, cols, rows, (u, v) => { const q = gp(u, v); return [q[0] * k, q[1] * k]; }, cv.width, cv.height), 0, 0); };
    requestAnimationFrame(() => { k = fit(); render(); });
    el.querySelectorAll('#lqT button').forEach((b) => (b.onclick = () => { st.tool = b.dataset.v; el.querySelectorAll('#lqT button').forEach((x) => x.classList.toggle('on', x === b)); }));
    el.querySelector('#lqT button').classList.add('on');
    el.querySelector('#lqS').oninput = (e) => { st.size = +e.target.value; }; el.querySelector('#lqP').oninput = (e) => { st.pressure = +e.target.value; };
    el.querySelector('#lqR').onclick = () => { orig.forEach((p, i) => { grid[i][0] = p[0]; grid[i][1] = p[1]; }); render(); };
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * SW, ((e.clientY - r.top) / r.height) * SH]; };
    const showBrush = (e) => { const x = ov.getContext('2d'); x.clearRect(0, 0, ov.width, ov.height); if (!e) return; const [a, b] = pt(e); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc(a * k, b * k, (st.size / 2) * k, 0, 6.283); x.stroke(); };
    cv.addEventListener('pointermove', (e) => showBrush(e)); cv.addEventListener('pointerleave', () => showBrush(null));
    cv.addEventListener('pointerdown', (e) => {
      let [lx, ly] = pt(e); let raf = null;
      const apply = (x, y, dx, dy) => {
        const R = st.size / 2, s = st.pressure / 100;
        for (let i = 0; i < grid.length; i++) {
          const g = grid[i]; const ddx = g[0] - x, ddy = g[1] - y; const d = Math.hypot(ddx, ddy); if (d > R) continue;
          const f = Math.pow(1 - d / R, 2) * s;
          if (st.tool === 'push') { g[0] += dx * f; g[1] += dy * f; }
          else if (st.tool === 'bloat') { g[0] += ddx * f * 0.12; g[1] += ddy * f * 0.12; }
          else if (st.tool === 'pinch') { g[0] -= ddx * f * 0.12; g[1] -= ddy * f * 0.12; }
          else if (st.tool === 'twirl' || st.tool === 'twirlL') { const a = (st.tool === 'twirl' ? 1 : -1) * f * 0.12; const c = Math.cos(a), sn = Math.sin(a); g[0] = x + ddx * c - ddy * sn; g[1] = y + ddx * sn + ddy * c; }
          else { g[0] += (orig[i][0] - g[0]) * f * 0.3; g[1] += (orig[i][1] - g[1]) * f * 0.3; }
        }
        if (!raf) raf = requestAnimationFrame(() => { raf = null; render(); });
      };
      apply(lx, ly, 0, 0);
      const hold = setInterval(() => { if (st.tool !== 'push') apply(lx, ly, 0, 0); }, 40);
      const mv = (m) => { const [x, y] = pt(m); apply(x, y, x - lx, y - ly); lx = x; ly = y; showBrush(m); };
      const up = () => { clearInterval(hold); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    el.querySelector('#lqOk').onclick = () => {
      P.act('Liquify', () => { const c = P.mk(SW, SH); c.getContext('2d').putImageData(C.geo.meshPixels(srcData, SW, SH, cols, rows, gp, SW, SH), 0, 0); L.canvas = c; });
      close();
    };
  };

  // ================= COLOR PANEL =================
  const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(C.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const rgb2hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; };
  const hsv2rgb = (h, s, v) => { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
  const SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#19d3c5', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#1b2a49', '#f2d7b6', '#2f4f2f'];
  X.colorPanel = (box) => {
    let target = 'fg';
    const cur = () => (target === 'fg' ? P.fg : P.bg);
    let [h, s, v] = rgb2hsv(...hex2rgb(cur()));
    box.innerHTML = `<div class="cp"><div class="cp-which"><button data-t="fg" class="on">Foreground</button><button data-t="bg">Background</button></div>
      <div class="cp-sv"><canvas width="240" height="160"></canvas><span class="cp-dot"></span></div><div class="cp-hue"><span class="cp-hdot"></span></div>
      <div class="cp-row"><span class="cp-prev"></span><input class="text-input cp-hex" maxlength="7" spellcheck="false"><input class="num cp-r" title="R"><input class="num cp-g" title="G"><input class="num cp-b" title="B"></div>
      <div class="hint" style="margin:10px 0 4px">Swatches</div><div class="cp-sw"></div><div class="hint" style="margin:10px 0 4px">Recent</div><div class="cp-sw cp-recent"></div></div>`;
    const sv = box.querySelector('.cp-sv canvas'), dot = box.querySelector('.cp-dot'), hue = box.querySelector('.cp-hue'), hdot = box.querySelector('.cp-hdot');
    const commitColor = (hex, record) => { if (target === 'fg') P.fg = hex; else P.bg = hex; if (record) { X.recent = [hex, ...(X.recent || []).filter((c) => c !== hex)].slice(0, 16); } C.emit('photo:colors'); };
    const draw = () => {
      const x = sv.getContext('2d'); const [r, g, b] = hsv2rgb(h, 1, 1);
      x.fillStyle = rgb2hex(r, g, b); x.fillRect(0, 0, 240, 160);
      let gr = x.createLinearGradient(0, 0, 240, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 240, 160);
      gr = x.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, 240, 160);
      dot.style.left = s * 100 + '%'; dot.style.top = (1 - v) * 100 + '%'; hdot.style.left = (h / 360) * 100 + '%';
      const hex = rgb2hex(...hsv2rgb(h, s, v)); const [r2, g2, b2] = hex2rgb(hex);
      box.querySelector('.cp-prev').style.background = hex;
      if (document.activeElement !== box.querySelector('.cp-hex')) box.querySelector('.cp-hex').value = hex;
      [['r', r2], ['g', g2], ['b', b2]].forEach(([k, val]) => { const i = box.querySelector('.cp-' + k); if (document.activeElement !== i) i.value = val; });
      box.querySelectorAll('.cp-which button').forEach((b) => b.classList.toggle('on', b.dataset.t === target));
      const rec = box.querySelector('.cp-recent'); rec.innerHTML = (X.recent || []).map((c) => `<button style="background:${c}" data-c="${c}"></button>`).join('') || '<span class="hint">—</span>';
    };
    const setHex = (hex, record = true) => { [h, s, v] = rgb2hsv(...hex2rgb(hex)); commitColor(hex, record); draw(); };
    const drag = (elm, fn) => elm.addEventListener('pointerdown', (e) => { e.preventDefault(); const mv = (m) => { const r = elm.getBoundingClientRect(); fn(C.clamp((m.clientX - r.left) / r.width, 0, 1), C.clamp((m.clientY - r.top) / r.height, 0, 1)); commitColor(rgb2hex(...hsv2rgb(h, s, v)), false); draw(); }; mv(e); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); commitColor(rgb2hex(...hsv2rgb(h, s, v)), true); draw(); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
    drag(box.querySelector('.cp-sv'), (x, y) => { s = x; v = 1 - y; });
    drag(hue, (x) => { h = x * 359.9; });
    box.querySelectorAll('.cp-which button').forEach((b) => (b.onclick = () => { target = b.dataset.t; [h, s, v] = rgb2hsv(...hex2rgb(cur())); draw(); }));
    const hexIn = box.querySelector('.cp-hex'); hexIn.onkeydown = (e) => e.stopPropagation(); hexIn.onchange = () => { let t = hexIn.value.trim(); if (!t.startsWith('#')) t = '#' + t; if (/^#[0-9a-f]{6}$/i.test(t)) setHex(t.toLowerCase()); else draw(); };
    ['r', 'g', 'b'].forEach((k) => { const i = box.querySelector('.cp-' + k); i.onkeydown = (e) => e.stopPropagation(); i.onchange = () => { const vals = ['r', 'g', 'b'].map((q) => +box.querySelector('.cp-' + q).value || 0); setHex(rgb2hex(...vals)); }; });
    box.querySelector('.cp-sw').innerHTML = SWATCHES.map((c) => `<button style="background:${c}" data-c="${c}"></button>`).join('');
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) setHex(b.dataset.c); });
    const sync = () => { if (!box.isConnected) return C.off('photo:colors', sync); const hex = cur(); if (hex !== rgb2hex(...hsv2rgb(h, s, v))) { [h, s, v] = rgb2hsv(...hex2rgb(hex)); draw(); } };
    C.on('photo:colors', sync);
    draw();
  };
})(window.C);
