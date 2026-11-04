/* Cutroom Photo — document model, layers, styles, adjustments, history */
(function (C) {
  const P = (C.photo = { doc: null, undo: [], redo: [], fg: '#000000', bg: '#ffffff', sel: null, ui: { editMask: null } });
  let cid = 1;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); c._id = cid++; return c; };
  const clone = (src) => { const c = mk(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; };
  P.mk = mk; P.clone = clone;
  const pool = {};
  const tmp = (name, w, h) => { let c = pool[name]; if (!c) c = pool[name] = mk(w, h); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, w, h); return c; };
  P.tmp = tmp;

  P.STYLE_DEFAULTS = {
    dropShadow: { on: false, color: '#000000', opacity: 70, angle: 120, distance: 12, size: 14, blend: 'multiply' },
    innerShadow: { on: false, color: '#000000', opacity: 70, angle: 120, distance: 6, size: 8 },
    outerGlow: { on: false, color: '#ffef7a', opacity: 80, size: 18, spread: 20, blend: 'screen' },
    innerGlow: { on: false, color: '#ffef7a', opacity: 75, size: 12 },
    bevel: { on: false, size: 8, depth: 100, angle: 120, highlight: '#ffffff', shadow: '#000000', hOpacity: 75, sOpacity: 75 },
    stroke: { on: false, size: 4, color: '#000000', position: 'outside', opacity: 100 },
    colorOverlay: { on: false, color: '#ff3d7f', opacity: 100, blend: 'source-over' },
    gradientOverlay: { on: false, c1: '#ffd84d', c2: '#ff4f9a', angle: 90, opacity: 100, blend: 'source-over', style: 'linear' },
  };
  P.STYLE_NAMES = { dropShadow: 'Drop shadow', innerShadow: 'Inner shadow', outerGlow: 'Outer glow', innerGlow: 'Inner glow', bevel: 'Bevel & emboss', stroke: 'Stroke', colorOverlay: 'Color overlay', gradientOverlay: 'Gradient overlay' };
  P.ADJUST = {
    brightness: { name: 'Brightness / Contrast', p: { brightness: 0, contrast: 0 } },
    levels: { name: 'Levels', p: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 } },
    curves: { name: 'Curves', p: { curves: null } },
    exposure: { name: 'Exposure', p: { exposure: 0 } },
    hueSat: { name: 'Hue / Saturation', p: { hue: 0, saturation: 0, lightness: 0 } },
    vibrance: { name: 'Vibrance', p: { vibrance: 0, saturation: 0 } },
    colorBalance: { name: 'Color balance', p: { lift: { x: 0, y: 0, l: 0 }, gamma: { x: 0, y: 0, l: 0 }, gain: { x: 0, y: 0, l: 0 } } },
    whiteBalance: { name: 'Temperature / Tint', p: { temp: 0, tint: 0 } },
    bw: { name: 'Black & white', p: { amount: 100, contrast: 0 } },
    photoFilter: { name: 'Photo filter', p: { color: '#ff9a2e', density: 25 } },
    invert: { name: 'Invert', p: {} },
    posterize: { name: 'Posterize', p: { levels: 4 } },
    threshold: { name: 'Threshold', p: { level: 128 } },
    gradientMap: { name: 'Gradient map', p: { c1: '#1b0b3a', c2: '#ffd27a' } },
    look: { name: 'Color look', p: { look: 'teal' } },
  };

  const lid = () => C.uid('pl_');
  P.layer = (o) => Object.assign({ id: lid(), name: 'Layer', type: 'raster', visible: true, locked: false, opacity: 1, blend: 'source-over', x: 0, y: 0, rot: 0, sx: 1, sy: 1, canvas: null, mask: null, maskOn: true, styles: {} }, o);

  // ---------- documents ----------
  P.newDoc = (w, h, bgColor = '#ffffff', name = 'Untitled') => {
    const bg = mk(w, h);
    if (bgColor) { const x = bg.getContext('2d'); x.fillStyle = bgColor; x.fillRect(0, 0, w, h); }
    P.doc = { w: Math.round(w), h: Math.round(h), name, path: null, layers: [P.layer({ name: 'Background', canvas: bg })], active: null };
    P.doc.active = P.doc.layers[0].id;
    P.undo = []; P.redo = []; P.sel = null; P.ui.editMask = null; P.dirty = false;
    P.changed(true);
  };
  P.fromImage = (img, name = 'Image') => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    P.newDoc(w, h, null, name.replace(/\.[^.]+$/, ''));
    const L = P.doc.layers[0]; L.name = 'Background'; L.canvas.getContext('2d').drawImage(img, 0, 0);
    P.changed(true);
  };
  P.active = () => P.doc && P.doc.layers.find((l) => l.id === P.doc.active);
  P.indexOf = (id) => P.doc.layers.findIndex((l) => l.id === id);

  // ---------- history (copy-on-write canvases) ----------
  const snapLayer = (L) => Object.assign({}, L, { styles: C.deep(L.styles || {}), text: L.text && C.deep(L.text), shape: L.shape && C.deep(L.shape), adjust: L.adjust && C.deep(L.adjust), fill: L.fill && C.deep(L.fill), _stroke: undefined, _cache: undefined });
  P.state = () => ({ w: P.doc.w, h: P.doc.h, active: P.doc.active, layers: P.doc.layers.map(snapLayer) });
  P.restore = (s) => { P.doc.w = s.w; P.doc.h = s.h; P.doc.active = s.active; P.doc.layers = s.layers.map(snapLayer); };
  P.begin = (label) => { if (!P._txn) P._txn = { label, before: P.state(), cow: new Set() }; else if (label) P._txn.label = label; };
  P.cow = (L, what = 'canvas') => { P.begin(); const k = L.id + what; if (!P._txn.cow.has(k) && L[what]) { L[what] = clone(L[what]); P._txn.cow.add(k); } };
  P.commit = (label) => {
    const t = P._txn; if (!t) return; P._txn = null; if (label) t.label = label;
    t.after = P.state(); P.undo.push(t); if (P.undo.length > 40) P.undo.shift(); P.redo = []; P.dirty = true; P.changed();
  };
  P.cancel = () => { const t = P._txn; if (!t) return; P._txn = null; P.restore(t.before); P.changed(); };
  P.act = (label, fn) => { P.begin(label); const r = fn(); P.commit(label); return r; };
  P.doUndo = () => { if (P._txn) P.commit(); const t = P.undo.pop(); if (!t) return; P.restore(t.before); P.redo.push(t); P.sel = null; P.changed(true); C.toast('Undo: ' + t.label, 'info', 1200); };
  P.doRedo = () => { const t = P.redo.pop(); if (!t) return; P.restore(t.after); P.undo.push(t); P.changed(true); C.toast('Redo: ' + t.label, 'info', 1200); };
  P.jump = (i) => { while (P.undo.length > i + 1) P.doUndo(); while (P.undo.length < i + 1 && P.redo.length) P.doRedo(); };

  P.changed = (structural = false) => { P._compDirty = true; C.emit('photo:change', { structural }); };

  // ---------- layers ----------
  P.addLayer = (o, above = true) => {
    const L = P.layer(o);
    const i = P.indexOf(P.doc.active);
    P.doc.layers.splice(above && i >= 0 ? i + 1 : P.doc.layers.length, 0, L);
    P.doc.active = L.id; return L;
  };
  P.newRaster = (name = 'Layer ' + (P.doc.layers.length + 1)) => P.addLayer({ name, canvas: mk(P.doc.w, P.doc.h) });
  P.addImageLayer = (img, name = 'Image') => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const c = mk(w, h); c.getContext('2d').drawImage(img, 0, 0);
    const k = Math.min(1, (P.doc.w * 0.9) / w, (P.doc.h * 0.9) / h);
    return P.addLayer({ name: name.replace(/\.[^.]+$/, ''), canvas: c, x: (P.doc.w - w) / 2, y: (P.doc.h - h) / 2, sx: k, sy: k });
  };
  P.addText = (x, y, content = 'Text') => P.addLayer({ name: content.slice(0, 20), type: 'text', x, y, text: { content, font: 'Segoe UI', size: Math.round(Math.min(P.doc.w, P.doc.h) / 10), color: P.fg, bold: true, italic: false, align: 'center', lineHeight: 1.15, letterSpacing: 0 } });
  P.addShape = (kind, x, y, w, h) => P.addLayer({ name: kind[0].toUpperCase() + kind.slice(1), type: 'shape', x, y, shape: { kind, w, h, fill: P.fg, fillOn: true, stroke: P.bg, strokeW: 0, radius: 24, points: 5, inner: 0.45 } });
  P.addAdjust = (kind) => P.addLayer({ name: P.ADJUST[kind].name, type: 'adjust', adjust: { kind, p: C.deep(P.ADJUST[kind].p) } });
  P.addFill = (color) => P.addLayer({ name: 'Color fill', type: 'fill', fill: { mode: 'solid', color, c1: P.fg, c2: P.bg, angle: 90 } });
  P.duplicate = (L) => { const d = snapLayer(L); d.id = lid(); d.name = L.name + ' copy'; if (d.canvas) d.canvas = clone(d.canvas); if (d.mask) d.mask = clone(d.mask); P.doc.layers.splice(P.indexOf(L.id) + 1, 0, d); P.doc.active = d.id; return d; };
  P.remove = (L) => { if (P.doc.layers.length <= 1) return; const i = P.indexOf(L.id); P.doc.layers.splice(i, 1); P.doc.active = P.doc.layers[Math.max(0, i - 1)].id; };

  // layer geometry
  P.size = (L) => {
    if (L.type === 'raster') return { w: L.canvas.width, h: L.canvas.height };
    if (L.type === 'text') { const m = measureText(L); return { w: m.w, h: m.h }; }
    if (L.type === 'shape') return { w: L.shape.w, h: L.shape.h };
    return { w: P.doc.w, h: P.doc.h };
  };
  P.center = (L) => { if (L.type === 'raster') return { x: L.x + L.canvas.width / 2, y: L.y + L.canvas.height / 2 }; if (L.type === 'text' || L.type === 'shape') return { x: L.x, y: L.y }; return { x: P.doc.w / 2, y: P.doc.h / 2 }; };
  P.corners = (L) => {
    const { w, h } = P.size(L); const c = P.center(L); const a = (L.rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => { px *= L.sx; py *= L.sy; return [c.x + px * cs - py * sn, c.y + px * sn + py * cs]; });
  };
  P.isIdentity = (L) => !L.rot && L.sx === 1 && L.sy === 1;

  // Bake a raster's transform & make it cover the document (needed before painting)
  P.prepPaint = (L, cover = true) => {
    if (L.type !== 'raster') return false;
    let x0 = L.x, y0 = L.y, w = L.canvas.width, h = L.canvas.height;
    const needBake = !P.isIdentity(L);
    if (needBake) { const cs = P.corners(L); const xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]); x0 = Math.floor(Math.min(...xs)); y0 = Math.floor(Math.min(...ys)); w = Math.ceil(Math.max(...xs)) - x0; h = Math.ceil(Math.max(...ys)) - y0; }
    let nx = x0, ny = y0, nw = w, nh = h;
    if (cover) { nx = Math.min(x0, 0); ny = Math.min(y0, 0); nw = Math.max(x0 + w, P.doc.w) - nx; nh = Math.max(y0 + h, P.doc.h) - ny; }
    nx = Math.round(nx); ny = Math.round(ny);
    if (!needBake && nx === L.x && ny === L.y && nw === L.canvas.width && nh === L.canvas.height) return true;
    const c = mk(nw, nh); const x = c.getContext('2d');
    x.translate(-nx, -ny); drawLayerContent(x, L);
    L.canvas = c; L.x = nx; L.y = ny; L.rot = 0; L.sx = L.sy = 1;
    return true;
  };
  P.rasterize = (L) => {
    if (L.type === 'raster') return;
    const c = mk(P.doc.w, P.doc.h); drawLayerContent(c.getContext('2d'), L);
    Object.assign(L, { type: 'raster', canvas: c, x: 0, y: 0, rot: 0, sx: 1, sy: 1, text: undefined, shape: undefined, fill: undefined });
  };

  // ---------- drawing ----------
  function measureText(L) {
    const t = L.text; const x = tmp('meas', 4, 4).getContext('2d');
    x.font = `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${t.size}px "${t.font}", "Segoe UI Emoji", "Segoe UI", Arial`;
    try { x.letterSpacing = (t.letterSpacing || 0) + 'px'; } catch (_) {}
    const lines = String(t.content).split('\n');
    const w = Math.max(...lines.map((l) => x.measureText(l || ' ').width));
    return { w: Math.max(4, w), h: Math.max(4, lines.length * t.size * t.lineHeight), lines, font: x.font };
  }
  P.measureText = measureText;
  function shapePath(x, s) {
    const w = s.w, h = s.h;
    x.beginPath();
    switch (s.kind) {
      case 'ellipse': x.ellipse(0, 0, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); break;
      case 'rounded': x.roundRect(-w / 2, -h / 2, w, h, Math.min(Math.abs(w), Math.abs(h)) * (s.radius / 100) * 0.5); break;
      case 'star': case 'polygon': {
        const n = Math.max(3, s.points | 0), pts = s.kind === 'star' ? n * 2 : n;
        for (let i = 0; i < pts; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / pts; const r = s.kind === 'star' && i % 2 ? s.inner : 1; const px = (Math.cos(a) * w) / 2 * r, py = (Math.sin(a) * h) / 2 * r; i ? x.lineTo(px, py) : x.moveTo(px, py); }
        x.closePath(); break;
      }
      case 'line': x.moveTo(-w / 2, -h / 2); x.lineTo(w / 2, h / 2); break;
      case 'arrow': { const t = Math.max(4, Math.abs(h) * 0.35); x.moveTo(-w / 2, -t / 2); x.lineTo(w / 2 - Math.abs(h) * 0.6, -t / 2); x.lineTo(w / 2 - Math.abs(h) * 0.6, -h / 2); x.lineTo(w / 2, 0); x.lineTo(w / 2 - Math.abs(h) * 0.6, h / 2); x.lineTo(w / 2 - Math.abs(h) * 0.6, t / 2); x.lineTo(-w / 2, t / 2); x.closePath(); break; }
      case 'heart': { const sx = w / 2, sy = h / 2; x.moveTo(0, sy * 0.9); x.bezierCurveTo(-sx * 1.3, sy * 0.1, -sx * 0.7, -sy * 1.1, 0, -sy * 0.45); x.bezierCurveTo(sx * 0.7, -sy * 1.1, sx * 1.3, sy * 0.1, 0, sy * 0.9); x.closePath(); break; }
      default: x.rect(-w / 2, -h / 2, w, h);
    }
  }
  function drawLayerContent(x, L) {
    x.save();
    if (L.type === 'fill') {
      const f = L.fill;
      if (f.mode === 'gradient') { const a = ((f.angle || 90) * Math.PI) / 180, r = Math.hypot(P.doc.w, P.doc.h) / 2, cx = P.doc.w / 2, cy = P.doc.h / 2; const g = x.createLinearGradient(cx - Math.sin(a) * r, cy + Math.cos(a) * -r, cx + Math.sin(a) * r, cy + Math.cos(a) * r); g.addColorStop(0, f.c1); g.addColorStop(1, f.c2); x.fillStyle = g; } else x.fillStyle = f.color;
      x.fillRect(0, 0, P.doc.w, P.doc.h); x.restore(); return;
    }
    const c = P.center(L);
    x.translate(c.x, c.y); x.rotate((L.rot * Math.PI) / 180); x.scale(L.sx, L.sy);
    if (L.type === 'raster') x.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2);
    else if (L.type === 'text') {
      const t = L.text, m = measureText(L);
      x.font = m.font; try { x.letterSpacing = (t.letterSpacing || 0) + 'px'; } catch (_) {}
      x.fillStyle = t.color; x.textBaseline = 'middle'; x.textAlign = t.align;
      const ax = t.align === 'left' ? -m.w / 2 : t.align === 'right' ? m.w / 2 : 0;
      m.lines.forEach((l, i) => x.fillText(l, ax, -m.h / 2 + t.size * t.lineHeight * (i + 0.5)));
    } else if (L.type === 'shape') {
      const s = L.shape; shapePath(x, s);
      if (s.fillOn && s.kind !== 'line') { x.fillStyle = s.fill; x.fill(); }
      if (s.strokeW > 0 || s.kind === 'line') { x.lineWidth = Math.max(1, s.strokeW || 6) / Math.max(0.01, (Math.abs(L.sx) + Math.abs(L.sy)) / 2); x.strokeStyle = s.kind === 'line' && !s.strokeW ? s.fill : s.stroke; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke(); }
    }
    x.restore();
  }
  P.drawLayerContent = drawLayerContent;

  // ---------- layer styles ----------
  const tint = (src, color, W, H, name) => { const c = tmp(name, W, H); const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, W, H); return c; };
  const inverse = (src, W, H, name) => { const c = tmp(name, W, H); const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'destination-out'; x.drawImage(src, 0, 0); return c; };
  const dilate = (src, r, W, H, name) => {
    const c = tmp(name, W, H); const x = c.getContext('2d'); x.drawImage(src, 0, 0); if (r < 0.5) return c;
    const n = Math.min(48, Math.max(10, Math.round(r * 1.6)));
    for (const rr of r > 4 ? [r, r * 0.5] : [r]) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; x.drawImage(src, Math.cos(a) * rr, Math.sin(a) * rr); }
    return c;
  };
  const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const off = (angle, dist) => { const a = (angle * Math.PI) / 180; return [-Math.cos(a) * dist, Math.sin(a) * dist]; };
  P.hasStyles = (L) => L.styles && Object.values(L.styles).some((s) => s && s.on);
  function applyStyles(base, st, W, H) {
    const R = tmp('sty_R', W, H); const r = R.getContext('2d');
    const B = tmp('sty_B', W, H); const b = B.getContext('2d'); b.drawImage(base, 0, 0);
    // overlays on the layer itself
    if (st.colorOverlay && st.colorOverlay.on) { const o = st.colorOverlay; const t = tmp('sty_t', W, H).getContext('2d'); t.drawImage(base, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = o.color; t.fillRect(0, 0, W, H); b.globalAlpha = o.opacity / 100; b.globalCompositeOperation = o.blend === 'source-over' ? 'source-atop' : o.blend; b.drawImage(t.canvas, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over'; }
    if (st.gradientOverlay && st.gradientOverlay.on) {
      const o = st.gradientOverlay; const t = tmp('sty_t', W, H).getContext('2d'); t.drawImage(base, 0, 0); t.globalCompositeOperation = 'source-in';
      let g; if (o.style === 'radial') g = t.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2); else { const a = (o.angle * Math.PI) / 180, rr = Math.hypot(W, H) / 2; g = t.createLinearGradient(W / 2 - Math.cos(a) * rr, H / 2 + Math.sin(a) * rr, W / 2 + Math.cos(a) * rr, H / 2 - Math.sin(a) * rr); }
      g.addColorStop(0, o.c1); g.addColorStop(1, o.c2); t.fillStyle = g; t.fillRect(0, 0, W, H);
      b.globalAlpha = o.opacity / 100; b.globalCompositeOperation = o.blend === 'source-over' ? 'source-atop' : o.blend; b.drawImage(t.canvas, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
    }
    const innerBand = (color, size, dx, dy, opacity, mode) => {
      const inv = inverse(base, W, H, 'sty_inv'); const t = tmp('sty_t', W, H).getContext('2d');
      t.filter = `blur(${size / 2}px)`; t.drawImage(inv, dx, dy); t.filter = 'none';
      t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(base, 0, 0);
      b.globalAlpha = opacity / 100; b.globalCompositeOperation = mode; b.drawImage(t.canvas, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
    };
    if (st.innerGlow && st.innerGlow.on) innerBand(st.innerGlow.color, st.innerGlow.size, 0, 0, st.innerGlow.opacity, 'screen');
    if (st.innerShadow && st.innerShadow.on) { const [dx, dy] = off(st.innerShadow.angle, st.innerShadow.distance); innerBand(st.innerShadow.color, st.innerShadow.size, dx, dy, st.innerShadow.opacity, 'multiply'); }
    if (st.bevel && st.bevel.on) {
      const o = st.bevel, d = o.size * 0.6 * (o.depth / 100); const [dx, dy] = off(o.angle, d);
      innerBand(o.highlight, o.size, dx, dy, o.hOpacity, 'screen');
      innerBand(o.shadow, o.size, -dx, -dy, o.sOpacity, 'multiply');
    }
    if (st.stroke && st.stroke.on && st.stroke.position !== 'outside') {
      const o = st.stroke; const sz = o.position === 'center' ? o.size / 2 : o.size;
      const inv = inverse(base, W, H, 'sty_inv'); const band = dilate(inv, sz, W, H, 'sty_dil');
      const t = tmp('sty_t', W, H).getContext('2d'); t.drawImage(band, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = o.color; t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(base, 0, 0);
      b.globalAlpha = o.opacity / 100; b.drawImage(t.canvas, 0, 0); b.globalAlpha = 1;
    }
    // behind the layer
    if (st.dropShadow && st.dropShadow.on) {
      const o = st.dropShadow; const [dx, dy] = off(o.angle, o.distance); const t = tint(base, o.color, W, H, 'sty_sh');
      r.globalAlpha = o.opacity / 100; r.filter = `blur(${o.size / 2}px)`; r.drawImage(t, dx, dy); r.filter = 'none'; r.globalAlpha = 1;
    }
    if (st.outerGlow && st.outerGlow.on) {
      const o = st.outerGlow; const grown = dilate(base, (o.size * o.spread) / 100, W, H, 'sty_dil'); const t = tint(grown, o.color, W, H, 'sty_sh');
      r.globalAlpha = o.opacity / 100; r.globalCompositeOperation = o.blend || 'screen'; r.filter = `blur(${o.size / 2}px)`; r.drawImage(t, 0, 0); r.filter = 'none'; r.globalAlpha = 1; r.globalCompositeOperation = 'source-over';
    }
    if (st.stroke && st.stroke.on && st.stroke.position !== 'inside') {
      const o = st.stroke; const sz = o.position === 'center' ? o.size / 2 : o.size; const t = tint(dilate(base, sz, W, H, 'sty_dil'), o.color, W, H, 'sty_sh');
      r.globalAlpha = o.opacity / 100; r.drawImage(t, 0, 0); r.globalAlpha = 1;
    }
    r.drawImage(B, 0, 0);
    return R;
  }

  // ---------- adjustments ----------
  const levelsCurve = (p) => { const pts = []; for (let i = 0; i <= 16; i++) { const x = i / 16; const v = C.clamp((x * 255 - p.inBlack) / Math.max(1, p.inWhite - p.inBlack), 0, 1); const y = (p.outBlack + (p.outWhite - p.outBlack) * Math.pow(v, 1 / Math.max(0.05, p.gamma))) / 255; pts.push([x, y]); } return pts; };
  const stepCurve = (levels) => { const pts = []; const n = Math.max(2, levels | 0); for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n - 0.001, y = i / (n - 1); pts.push([a + 0.0005, y], [b, y]); } pts[0][0] = 0; pts[pts.length - 1][0] = 1; return pts; };
  const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  P.adjustGrade = (a) => {
    const p = a.p, g = C.grade.defaults();
    switch (a.kind) {
      case 'brightness': g.exposure = p.brightness / 100; g.contrast = p.contrast; break;
      case 'levels': g.curves = { m: levelsCurve(p) }; break;
      case 'curves': g.curves = p.curves; break;
      case 'exposure': g.exposure = p.exposure; break;
      case 'hueSat': g.hue = p.hue; g.saturation = p.saturation; if (p.lightness) g.curves = { m: p.lightness > 0 ? [[0, p.lightness / 100], [1, 1]] : [[0, 0], [1, 1 + p.lightness / 100]] }; break;
      case 'vibrance': g.vibrance = p.vibrance; g.saturation = p.saturation; break;
      case 'colorBalance': g.lift = p.lift; g.gamma = p.gamma; g.gain = p.gain; break;
      case 'whiteBalance': g.temp = p.temp; g.tint = p.tint; break;
      case 'bw': g.bw = p.amount; g.contrast = p.contrast; break;
      case 'invert': g.curves = { m: [[0, 1], [1, 0]] }; break;
      case 'posterize': g.curves = { m: stepCurve(p.levels) }; break;
      case 'threshold': { const t = p.level / 255; g.bw = 100; g.curves = { m: [[0, 0], [Math.max(0.001, t - 0.002), 0], [Math.min(0.999, t + 0.002), 1], [1, 1]] }; break; }
      case 'gradientMap': { const a1 = hexRGB(p.c1), a2 = hexRGB(p.c2); g.bw = 100; g.curves = { r: [[0, a1[0]], [1, a2[0]]], g: [[0, a1[1]], [1, a2[1]]], b: [[0, a1[2]], [1, a2[2]]] }; break; }
      case 'look': { const l = C.grade.LOOKS.find((x) => x.id === p.look); if (l) Object.assign(g, C.deep(l.g)); break; }
    }
    return g;
  };
  // returns a new canvas with the adjustment applied to src
  P.applyAdjust = (src, a) => {
    const W = src.width, H = src.height;
    if (a.kind === 'photoFilter') {
      const c = mk(W, H); const x = c.getContext('2d'); x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'soft-light'; x.globalAlpha = Math.min(1, a.p.density / 60); x.fillStyle = a.p.color; x.fillRect(0, 0, W, H);
      x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0); return c;
    }
    if (!C.grade.available()) return clone(src);
    return C.grade.toCanvas(src, P.adjustGrade(a));
  };

  // ---------- composite ----------
  P.renderLayerPixels = (L, W, H) => {
    const c = tmp('lay', W, H); const x = c.getContext('2d');
    if (L.type === 'raster' && L._stroke) {
      const s = L._stroke;
      const lc = tmp('lay_s', L.canvas.width, L.canvas.height); const lx = lc.getContext('2d');
      if (s.target === 'canvas') {
        lx.drawImage(L.canvas, 0, 0);
        lx.globalAlpha = s.opacity; lx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : s.mode === 'atop' ? 'source-atop' : 'source-over';
        lx.drawImage(P.strokeClipped(s, L), 0, 0);
      } else lx.drawImage(L.canvas, 0, 0);
      x.save(); x.translate(L.x, L.y); x.drawImage(lc, 0, 0); x.restore();
    } else drawLayerContent(x, L);
    const mask = L.mask && L.maskOn ? (L._stroke && L._stroke.target === 'mask' ? P.liveMask(L) : L.mask) : null;
    if (mask) { x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0); x.globalCompositeOperation = 'source-over'; }
    return c;
  };
  P.liveMask = (L) => { const s = L._stroke; const m = tmp('livemask', L.mask.width, L.mask.height); const x = m.getContext('2d'); x.drawImage(L.mask, 0, 0); x.globalAlpha = s.opacity; x.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over'; x.drawImage(P.strokeClipped(s, L), 0, 0); return m; };
  // stroke canvas clipped by the selection (in the stroke target's coordinate space)
  P.strokeClipped = (s, L) => {
    if (!P.sel) return s.cv;
    const c = tmp('strk_clip', s.cv.width, s.cv.height); const x = c.getContext('2d'); x.drawImage(s.cv, 0, 0);
    x.globalCompositeOperation = 'destination-in'; const ox = s.target === 'mask' ? 0 : -L.x, oy = s.target === 'mask' ? 0 : -L.y; x.drawImage(P.sel.mask, ox, oy); return c;
  };
  P.composite = (opts = {}) => {
    const d = P.doc; const W = d.w, H = d.h;
    const out = opts.into || (P._comp && P._comp.width === W && P._comp.height === H ? P._comp : (P._comp = mk(W, H)));
    const o = out.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; o.filter = 'none'; o.clearRect(0, 0, W, H);
    const upto = opts.upto != null ? opts.upto : d.layers.length;
    for (let i = 0; i < upto; i++) {
      const L = d.layers[i]; if (!L.visible) continue;
      if (L.type === 'adjust') {
        const adj = P.applyAdjust(out, L.adjust);
        const ax = adj.getContext('2d');
        if (L.mask && L.maskOn) { ax.globalCompositeOperation = 'destination-in'; ax.drawImage(L._stroke && L._stroke.target === 'mask' ? P.liveMask(L) : L.mask, 0, 0); }
        o.globalAlpha = L.opacity; o.globalCompositeOperation = L.blend || 'source-over'; o.drawImage(adj, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
        continue;
      }
      let px = P.renderLayerPixels(L, W, H);
      if (P.hasStyles(L)) px = applyStyles(px, L.styles, W, H);
      o.globalAlpha = L.opacity; o.globalCompositeOperation = L.blend || 'source-over'; o.drawImage(px, 0, 0);
      o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    }
    P._compDirty = false;
    return out;
  };
  P.flattened = () => { const c = mk(P.doc.w, P.doc.h); P.composite({ into: c }); return c; };

  // ---------- selection ----------
  P.setSelection = (maskCanvas, mode = 'new') => {
    const W = P.doc.w, H = P.doc.h;
    if (mode === 'new' || !P.sel) { if (mode === 'subtract' || mode === 'intersect') { if (!P.sel) return; } P.sel = { mask: mk(W, H) }; if (mode === 'new' || mode === 'add') P.sel.mask.getContext('2d').drawImage(maskCanvas, 0, 0); }
    else {
      const m = P.sel.mask = clone(P.sel.mask); const x = m.getContext('2d');
      x.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in';
      x.drawImage(maskCanvas, 0, 0);
    }
    P.selEdges();
    C.emit('photo:selection');
  };
  P.selectShape = (fn, mode, feather = 0) => {
    const m = mk(P.doc.w, P.doc.h); const x = m.getContext('2d'); x.fillStyle = '#fff';
    if (feather > 0) x.filter = `blur(${feather}px)`;
    x.beginPath(); fn(x); x.fill();
    P.setSelection(m, mode);
  };
  P.selectAll = () => P.selectShape((x) => x.rect(0, 0, P.doc.w, P.doc.h), 'new');
  P.deselect = () => { P.sel = null; C.emit('photo:selection'); };
  P.invertSelection = () => { const m = mk(P.doc.w, P.doc.h); const x = m.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, P.doc.w, P.doc.h); if (P.sel) { x.globalCompositeOperation = 'destination-out'; x.drawImage(P.sel.mask, 0, 0); } P.sel = { mask: m }; P.selEdges(); C.emit('photo:selection'); };
  P.selEdges = () => {
    if (!P.sel) return;
    const W = P.doc.w, H = P.doc.h; const k = Math.min(1, 2400 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const s = mk(w, h); const sx = s.getContext('2d'); sx.drawImage(P.sel.mask, 0, 0, w, h);
    const id = sx.getImageData(0, 0, w, h), d = id.data; const out = sx.createImageData(w, h); const o = out.data;
    let any = false, minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const a = d[i + 3] > 127;
      if (a) { any = true; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
      if (!a) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || d[i - 1] <= 127 || d[i + 7] <= 127 || d[i - w * 4 + 3] <= 127 || d[i + w * 4 + 3] <= 127) { o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = 255; }
    }
    if (!any) { P.sel = null; return; }
    sx.putImageData(out, 0, 0);
    P.sel.edges = s; P.sel.bounds = { x: minX / k, y: minY / k, w: (maxX - minX + 1) / k, h: (maxY - minY + 1) / k };
  };

  // ---------- flood fill (bucket / magic wand) ----------
  P.floodMask = (srcCanvas, ox, oy, sx, sy, tol, contiguous) => {
    const W = srcCanvas.width, H = srcCanvas.height; sx = Math.floor(sx - ox); sy = Math.floor(sy - oy);
    const mask = mk(P.doc.w, P.doc.h);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return mask;
    const d = srcCanvas.getContext('2d').getImageData(0, 0, W, H).data;
    const i0 = (sy * W + sx) * 4; const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
    const t = tol * 4.4;
    const match = (i) => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) + Math.abs(d[i + 3] - a0) <= t;
    const m = new Uint8Array(W * H);
    if (contiguous) {
      const stack = [sx, sy];
      while (stack.length) {
        const y = stack.pop(), x0 = stack.pop();
        let x = x0; while (x >= 0 && !m[y * W + x] && match((y * W + x) * 4)) x--; x++;
        let up = false, dn = false;
        while (x < W && !m[y * W + x] && match((y * W + x) * 4)) {
          m[y * W + x] = 1;
          if (y > 0) { const u = !m[(y - 1) * W + x] && match(((y - 1) * W + x) * 4); if (u && !up) { stack.push(x, y - 1); up = true; } else if (!u) up = false; }
          if (y < H - 1) { const v = !m[(y + 1) * W + x] && match(((y + 1) * W + x) * 4); if (v && !dn) { stack.push(x, y + 1); dn = true; } else if (!v) dn = false; }
          x++;
        }
      }
    } else for (let p = 0; p < W * H; p++) if (match(p * 4)) m[p] = 1;
    const tc = mk(W, H); const tx = tc.getContext('2d'); const id = tx.createImageData(W, H);
    for (let p = 0; p < W * H; p++) if (m[p]) { const q = p * 4; id.data[q] = id.data[q + 1] = id.data[q + 2] = 255; id.data[q + 3] = 255; }
    tx.putImageData(id, 0, 0);
    mask.getContext('2d').drawImage(tc, ox, oy);
    return mask;
  };

  // ---------- brush dabs ----------
  const dabCache = new Map();
  P.dab = (size, hardness, color) => {
    const key = `${Math.round(size)}|${hardness}|${color}`; if (dabCache.has(key)) return dabCache.get(key);
    const r = Math.max(0.5, size / 2), s = Math.ceil(r * 2) + 2; const c = mk(s, s); const x = c.getContext('2d');
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, r);
    const col = hexA(color, 1), clear = hexA(color, 0);
    g.addColorStop(0, col); g.addColorStop(C.clamp(hardness / 100, 0, 0.99), col); g.addColorStop(1, clear);
    x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, r, 0, Math.PI * 2); x.fill();
    if (dabCache.size > 60) dabCache.clear(); dabCache.set(key, c); return c;
  };

  // ---------- serialization ----------
  P.serialize = () => JSON.stringify({ app: 'cutroom-photo', version: 1, w: P.doc.w, h: P.doc.h, name: P.doc.name, active: P.doc.active,
    layers: P.doc.layers.map((L) => Object.assign(snapLayer(L), { canvas: L.canvas ? L.canvas.toDataURL('image/png') : null, mask: L.mask ? L.mask.toDataURL('image/png') : null })) });
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  P.deserialize = async (text) => {
    const d = JSON.parse(text); if (d.app !== 'cutroom-photo') throw new Error('Not a Cutroom photo file');
    const layers = [];
    for (const L of d.layers) {
      const o = Object.assign({}, L);
      if (L.canvas) { const im = await loadImg(L.canvas); o.canvas = mk(im.width, im.height); o.canvas.getContext('2d').drawImage(im, 0, 0); }
      if (L.mask) { const im = await loadImg(L.mask); o.mask = mk(im.width, im.height); o.mask.getContext('2d').drawImage(im, 0, 0); }
      layers.push(P.layer(o));
    }
    P.doc = { w: d.w, h: d.h, name: d.name || 'Untitled', layers, active: d.active || layers[layers.length - 1].id, path: null };
    P.undo = []; P.redo = []; P.sel = null; P.dirty = false; P.changed(true);
  };
})(window.C);
