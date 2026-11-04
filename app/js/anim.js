/* Cutroom Animate — 2D animation maker: frame-by-frame drawing with onion skin + tweened objects */
(function (C) {
  const N = window.native;
  const A = (C.anim = { doc: null, tool: 'brush', zoom: 1, ox: 0, oy: 0, playing: false, onion: true, autoFrame: true, sel: null, undo: [], redo: [], ready: false });
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const clone = (s) => { const c = mk(s.width, s.height); c.getContext('2d').drawImage(s, 0, 0); return c; };
  const PROPS = [['x', 'X', -2000, 4000, 1], ['y', 'Y', -2000, 4000, 1], ['scale', 'Scale', 0.05, 8, 0.01], ['rot', 'Rotation', -1080, 1080, 1], ['opacity', 'Opacity', 0, 1, 0.01]];
  const EASES = [['linear', 'Linear'], ['ease', 'Ease in-out'], ['in', 'Ease in'], ['out', 'Ease out'], ['back', 'Overshoot'], ['bounce', 'Bounce'], ['elastic', 'Elastic'], ['hold', 'Hold (no tween)']];
  const easeFn = {
    linear: (t) => t, ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), in: (t) => t * t * t, out: (t) => 1 - Math.pow(1 - t, 3),
    back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
    elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1), hold: () => 0,
  };
  const TOOLS = [['select', 'move', 'V', 'Select & move objects'], ['brush', 'brush', 'B', 'Brush'], ['pencil', 'pen', 'P', 'Pencil (hard edge)'], ['eraser', 'eraser', 'E', 'Eraser'], ['fill', 'bucket', 'G', 'Fill'], '-', ['line', 'minus', 'L', 'Line'], ['rect', 'square', 'R', 'Rectangle'], ['ellipse', 'circle', 'O', 'Ellipse'], ['text', 'text', 'T', 'Text object'], '-', ['eyedrop', 'eyedrop', 'I', 'Color picker'], ['hand', 'hand', 'H', 'Hand (or hold Space)']];
  A.opts = { size: 10, opacity: 100, smooth: 50, color: '#1b1b1f', fill: '#19d3c5', fillShapes: false, tol: 30 };
  try { Object.assign(A.opts, JSON.parse(localStorage.getItem('cutroom.animOpts') || '{}')); } catch (_) {}
  const saveOpts = C.debounce(() => { try { localStorage.setItem('cutroom.animOpts', JSON.stringify(A.opts)); } catch (_) {} }, 300);

  // ================= document =================
  let lid = 0; const newId = () => 'L' + Date.now().toString(36) + (lid++);
  A.newDoc = (w = 1920, h = 1080, fps = 12, name = 'Animation', bg = '#ffffff') => {
    A.doc = { name, w, h, fps, bg, length: Math.max(24, fps * 2), cur: 0, layers: [], active: null, path: null };
    A.addDrawLayer('Drawing 1'); A.undo = []; A.redo = []; A.sel = null; A.dirty = false;
    A.fit(); A.changed(true);
  };
  A.addDrawLayer = (name) => { const L = { id: newId(), name: name || `Drawing ${A.doc.layers.filter((l) => l.type === 'draw').length + 1}`, type: 'draw', visible: true, locked: false, opacity: 1, cells: {} }; A.doc.layers.push(L); A.doc.active = L.id; return L; };
  A.addObject = (obj, name) => {
    const d = A.doc; const L = { id: newId(), name: name || obj.text || obj.kind, type: 'obj', visible: true, locked: false, opacity: 1, obj, base: { x: d.w / 2, y: d.h / 2, scale: 1, rot: 0, opacity: 1 }, kf: {}, from: 0, to: d.length - 1 };
    d.layers.push(L); d.active = L.id; A.sel = L.id; loadObj(L); return L;
  };
  A.layer = (id = A.doc && A.doc.active) => A.doc && A.doc.layers.find((l) => l.id === id);
  // ---- cells (frame-by-frame) ----
  A.keyAt = (L, f) => { let k = -1; for (const key in L.cells) { const n = +key; if (n <= f && n > k) k = n; } return k; };
  A.cellAt = (L, f) => { const k = A.keyAt(L, f); return k < 0 ? null : L.cells[k]; };
  // ---- tweens ----
  A.valueAt = (L, prop, f) => {
    const arr = L.kf[prop]; if (!arr || !arr.length) return L.base[prop];
    if (f <= arr[0].f) return arr[0].v; const last = arr[arr.length - 1]; if (f >= last.f) return last.v;
    let i = 0; while (arr[i + 1].f < f) i++; const a = arr[i], b = arr[i + 1];
    const t = (f - a.f) / (b.f - a.f); return a.v + (b.v - a.v) * (easeFn[a.e || 'ease'] || easeFn.ease)(t);
  };
  A.setKey = (L, prop, f, v) => { const arr = (L.kf[prop] = L.kf[prop] || []); const k = arr.find((x) => x.f === f); if (k) k.v = v; else { arr.push({ f, v, e: A.lastEase || 'ease' }); arr.sort((a, b) => a.f - b.f); } };
  A.setProp = (L, prop, v, f = A.doc.cur) => { if (L.kf[prop] && L.kf[prop].length) A.setKey(L, prop, f, v); else if (A.autoKey && f > 0) { A.setKey(L, prop, 0, L.base[prop]); A.setKey(L, prop, f, v); } else L.base[prop] = v; };
  A.hasKey = (L, f) => Object.values(L.kf || {}).some((arr) => arr.some((k) => k.f === f));
  A.state = (L, f) => { const s = {}; for (const [p] of PROPS) s[p] = A.valueAt(L, p, f); return s; };
  function loadObj(L) {
    const o = L.obj; if (o.kind !== 'image' || L._img) return;
    const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { L._img = img; if (!o.w) { const k = Math.min(1, (A.doc.h * 0.5) / img.naturalHeight); o.w = img.naturalWidth * k; o.h = img.naturalHeight * k; } A.redraw(); }; img.src = o.src.startsWith('data:') ? o.src : N.mediaUrl(o.src);
  }
  const objSize = (L) => { const o = L.obj; if (o.kind === 'text' || o.kind === 'emoji') { const x = scratch(); x.font = font(o); const lines = o.text.split('\n'); return { w: Math.max(...lines.map((l) => x.measureText(l).width)) + 8, h: o.size * 1.2 * lines.length }; } return { w: o.w || 200, h: o.h || 200 }; };
  let sc = null; const scratch = () => (sc = sc || mk(4, 4).getContext('2d'));
  const font = (o) => `${o.bold === false ? 400 : 800} ${o.size}px ${o.kind === 'emoji' ? '"Segoe UI Emoji", ' : ''}${o.font || '"Segoe UI"'}, sans-serif`;
  function drawObj(x, L, f) {
    if (f < (L.from ?? 0) || f > (L.to ?? 1e9)) return;
    const s = A.state(L, f), o = L.obj; const { w, h } = objSize(L);
    x.save(); x.globalAlpha *= C.clamp(s.opacity, 0, 1) * L.opacity; x.translate(s.x, s.y); x.rotate((s.rot * Math.PI) / 180); x.scale(s.scale, s.scale);
    if (o.kind === 'image') { if (L._img) x.drawImage(L._img, -w / 2, -h / 2, w, h); }
    else if (o.kind === 'text' || o.kind === 'emoji') { x.font = font(o); x.textAlign = 'center'; x.textBaseline = 'middle'; const lines = o.text.split('\n'); lines.forEach((l, i) => { const y = (i - (lines.length - 1) / 2) * o.size * 1.2; if (o.stroke) { x.lineWidth = o.stroke; x.strokeStyle = o.strokeColor || '#000'; x.lineJoin = 'round'; x.strokeText(l, 0, y); } x.fillStyle = o.color || '#000'; x.fillText(l, 0, y); }); }
    else { x.beginPath(); C.geo.shapePath(x, { kind: o.shape || 'ellipse', w, h, radius: o.radius || 0, points: 5, inner: 0.45 }); if (o.fill) { x.fillStyle = o.fill; x.fill(); } if (o.strokeW) { x.lineWidth = o.strokeW; x.strokeStyle = o.strokeColor || '#000'; x.stroke(); } }
    x.restore();
  }
  // full frame render (export / thumbnails / playback)
  A.renderFrame = (x, f, opts = {}) => {
    const d = A.doc; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    if (opts.scale) x.scale(opts.scale, opts.scale);
    if (d.bg && !opts.transparent) { x.fillStyle = d.bg; x.fillRect(0, 0, d.w, d.h); } else x.clearRect(0, 0, d.w, d.h);
    for (const L of d.layers) {
      if (!L.visible) continue;
      if (L.type === 'draw') { const c = A.cellAt(L, f); if (c) { x.globalAlpha = L.opacity; x.drawImage(c, 0, 0); x.globalAlpha = 1; } }
      else drawObj(x, L, f);
    }
    x.restore();
  };

  // ================= history =================
  const snap = () => ({ length: A.doc.length, w: A.doc.w, h: A.doc.h, fps: A.doc.fps, bg: A.doc.bg, layers: A.doc.layers.map((L) => Object.assign({}, L, { cells: L.cells ? Object.assign({}, L.cells) : undefined, kf: L.kf ? JSON.parse(JSON.stringify(L.kf)) : undefined, base: L.base ? Object.assign({}, L.base) : undefined, obj: L.obj ? Object.assign({}, L.obj) : undefined })), active: A.doc.active });
  const restore = (s) => { const imgs = new Map(A.doc.layers.map((l) => [l.id, l._img])); Object.assign(A.doc, { length: s.length, w: s.w, h: s.h, fps: s.fps, bg: s.bg, active: s.active }); A.doc.layers = s.layers.map((L) => Object.assign({}, L, { cells: L.cells ? Object.assign({}, L.cells) : undefined, kf: L.kf ? JSON.parse(JSON.stringify(L.kf)) : undefined, base: L.base ? Object.assign({}, L.base) : undefined, obj: L.obj ? Object.assign({}, L.obj) : undefined, _img: imgs.get(L.id) || L._img })); A.doc.layers.forEach((L) => L.type === 'obj' && loadObj(L)); };
  A.act = (label, fn) => { const before = snap(); const r = fn(); A.undo.push({ label, s: before }); if (A.undo.length > 80) A.undo.shift(); A.redo = []; A.dirty = true; A.changed(true); return r; };
  A.doUndo = () => { const u = A.undo.pop(); if (!u) return; A.redo.push({ label: u.label, s: snap() }); restore(u.s); A.changed(true); };
  A.doRedo = () => { const r = A.redo.pop(); if (!r) return; A.undo.push({ label: r.label, s: snap() }); restore(r.s); A.changed(true); };

  // ================= workspace =================
  let ws, view, cv, cx, ov, ox, tl, side, optsBar, toolsEl, raf = 0, needs = true, space = false;
  A.init = () => {
    if (A.ready) return; A.ready = true;
    ws = C.$('#animWs');
    ws.innerHTML = `<div class="an-opts" id="anOpts"></div><nav class="an-tools" id="anTools"></nav>
      <div class="an-view" id="anView"><canvas class="an-cv"></canvas><canvas class="an-ov"></canvas><div class="an-empty" id="anEmpty"></div></div>
      <aside class="an-side" id="anSide"></aside><div class="an-tl" id="anTl"></div>`;
    view = C.$('#anView'); cv = view.querySelector('.an-cv'); ov = view.querySelector('.an-ov'); cx = cv.getContext('2d'); ox = ov.getContext('2d');
    tl = C.$('#anTl'); side = C.$('#anSide'); optsBar = C.$('#anOpts'); toolsEl = C.$('#anTools');
    buildTools(); new ResizeObserver(() => { size(); A.fit(true); }).observe(view);
    view.addEventListener('pointerdown', onDown); view.addEventListener('pointermove', (e) => { hover = toDoc(e); needs = true; });
    view.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e); else { A.ox -= e.deltaX; A.oy -= e.deltaY; needs = true; } }, { passive: false });
    const emp = C.$('#anEmpty'); emp.innerHTML = `<div class="ph-empty-card"><div class="ph-empty-ico">${C.icon('clapper')}</div><h2>Animate</h2><p class="hint">Draw frame by frame with onion skin, or add text, emoji, shapes and images and tween them with keyframes. Export MP4, GIF or PNG frames — or send straight to your video.</p><div class="ph-empty-acts"><button class="btn primary" data-a="new">${C.icon('plus')}<span>New animation</span></button><button class="btn" data-a="open">${C.icon('folder')}<span>Open .cutanim…</span></button><button class="btn" data-a="demo">${C.icon('sparkles')}<span>Bouncing ball demo</span></button></div></div>`;
    emp.querySelector('[data-a=new]').onclick = () => A.newDialog(); emp.querySelector('[data-a=open]').onclick = () => A.open(); emp.querySelector('[data-a=demo]').onclick = () => A.demo();
    loop();
  };
  function size() { const r = view.getBoundingClientRect(); const dpr = devicePixelRatio || 1; for (const c of [cv, ov]) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; } needs = true; }
  A.fit = (keep) => { if (!A.doc || !view) return; const r = view.getBoundingClientRect(); if (!r.width) return; if (keep && A._fitted) { needs = true; return; } A.zoom = Math.min((r.width - 60) / A.doc.w, (r.height - 60) / A.doc.h); A.ox = (r.width - A.doc.w * A.zoom) / 2; A.oy = (r.height - A.doc.h * A.zoom) / 2; A._fitted = true; needs = true; };
  const zoomAt = (k, e) => { const r = view.getBoundingClientRect(); const px = e ? e.clientX - r.left : r.width / 2, py = e ? e.clientY - r.top : r.height / 2; A.ox = px - (px - A.ox) * k; A.oy = py - (py - A.oy) * k; A.zoom *= k; needs = true; };
  const toDoc = (e) => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left - A.ox) / A.zoom, y: (e.clientY - r.top - A.oy) / A.zoom }; };
  let hover = null;
  A.redraw = () => { needs = true; };
  A.changed = (structural) => { needs = true; if (structural) { renderTimeline(); renderSide(); renderOpts(); } else renderTimelineCells(); C.$('#anEmpty') && (C.$('#anEmpty').style.display = A.doc ? 'none' : ''); };

  function loop() {
    raf = requestAnimationFrame(loop);
    if (C.mode !== 'anim') return;
    if (A.playing) { const now = performance.now(); if (now - A._lastTick >= 1000 / A.doc.fps) { A._lastTick = now; A.doc.cur = A.doc.cur + 1 >= A.doc.length ? (A.loop === false ? (A.stop(), A.doc.cur) : 0) : A.doc.cur + 1; needs = true; updatePlayhead(); } }
    if (!needs) return; needs = false; draw();
  }
  function draw() {
    const dpr = devicePixelRatio || 1; cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, ov.width, ov.height);
    const d = A.doc; if (!d) return;
    cx.setTransform(dpr * A.zoom, 0, 0, dpr * A.zoom, dpr * A.ox, dpr * A.oy);
    cx.shadowColor = 'rgba(0,0,0,.45)'; cx.shadowBlur = 30 / A.zoom; cx.fillStyle = d.bg || '#fff'; cx.fillRect(0, 0, d.w, d.h); cx.shadowColor = 'transparent'; cx.shadowBlur = 0;
    if (!d.bg) { cx.fillStyle = '#e8e8ec'; for (let y = 0; y < d.h; y += 32) for (let x = (y / 32) % 2 ? 32 : 0; x < d.w; x += 64) cx.fillRect(x, y, 32, 32); }
    cx.save(); cx.beginPath(); cx.rect(0, 0, d.w, d.h); cx.clip();
    for (const L of d.layers) {
      if (!L.visible) continue;
      if (L.type === 'draw') {
        if (A.onion && !A.playing && L.id === d.active) for (const [off, tint, a] of [[-2, '#ff3b5c', 0.12], [-1, '#ff3b5c', 0.28], [1, '#19c37d', 0.28], [2, '#19c37d', 0.12]]) { const f = d.cur + off; if (f < 0 || f >= d.length) continue; const c = A.cellAt(L, f); if (!c || c === A.cellAt(L, d.cur)) continue; cx.globalAlpha = a; cx.drawImage(tinted(c, tint), 0, 0); cx.globalAlpha = 1; }
        const c = A.cellAt(L, d.cur); if (c) { cx.globalAlpha = L.opacity; cx.drawImage(c, 0, 0); cx.globalAlpha = 1; }
        if (stroke && stroke.L === L) { cx.globalAlpha = stroke.erase ? 1 : A.opts.opacity / 100; if (stroke.erase) { cx.globalAlpha = 0.5; } cx.drawImage(stroke.cv, 0, 0); cx.globalAlpha = 1; }
      } else drawObj(cx, L, d.cur);
    }
    cx.restore();
    // overlay: selection handles, brush cursor, shape preview, motion path
    ox.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = (x, y) => [A.ox + x * A.zoom, A.oy + y * A.zoom];
    const L = A.layer(A.sel);
    if (L && L.type === 'obj' && !A.playing) {
      const xs = L.kf.x, ys = L.kf.y;
      if ((xs && xs.length > 1) || (ys && ys.length > 1)) { ox.strokeStyle = 'rgba(25,211,197,.7)'; ox.setLineDash([4, 4]); ox.lineWidth = 1.5; ox.beginPath(); for (let f = 0; f < d.length; f++) { const [a, b] = S(A.valueAt(L, 'x', f), A.valueAt(L, 'y', f)); f ? ox.lineTo(a, b) : ox.moveTo(a, b); } ox.stroke(); ox.setLineDash([]); for (const k of (xs || [])) { const [a, b] = S(A.valueAt(L, 'x', k.f), A.valueAt(L, 'y', k.f)); ox.fillStyle = '#19d3c5'; ox.beginPath(); ox.arc(a, b, 3.5, 0, 6.283); ox.fill(); } }
      const s = A.state(L, d.cur); const { w, h } = objSize(L); const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const a = (s.rot * Math.PI) / 180; const px = (u * w * s.scale) / 2, py = (v * h * s.scale) / 2; return S(s.x + px * Math.cos(a) - py * Math.sin(a), s.y + px * Math.sin(a) + py * Math.cos(a)); });
      ox.strokeStyle = '#19d3c5'; ox.lineWidth = 1.5; ox.beginPath(); cs.forEach(([a, b], i) => (i ? ox.lineTo(a, b) : ox.moveTo(a, b))); ox.closePath(); ox.stroke();
      cs.forEach(([a, b]) => { ox.fillStyle = '#fff'; ox.fillRect(a - 4, b - 4, 8, 8); ox.strokeRect(a - 4, b - 4, 8, 8); });
      const top = [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2]; const [cxp, cyp] = S(s.x, s.y); const dx = top[0] - cxp, dy = top[1] - cyp, l = Math.hypot(dx, dy) || 1; const rh = [top[0] + (dx / l) * 22, top[1] + (dy / l) * 22];
      ox.beginPath(); ox.moveTo(...top); ox.lineTo(...rh); ox.stroke(); ox.beginPath(); ox.arc(rh[0], rh[1], 5, 0, 6.283); ox.fillStyle = '#fff'; ox.fill(); ox.stroke();
      A._handles = { cs, rh, c: [cxp, cyp] };
    } else A._handles = null;
    if (shapeDrag) { ox.strokeStyle = A.opts.color; ox.lineWidth = Math.max(1, A.opts.size * A.zoom); ox.beginPath(); const [a, b] = S(shapeDrag.a.x, shapeDrag.a.y), [c2, d2] = S(shapeDrag.b.x, shapeDrag.b.y); if (A.tool === 'line') { ox.moveTo(a, b); ox.lineTo(c2, d2); } else if (A.tool === 'rect') ox.rect(a, b, c2 - a, d2 - b); else ox.ellipse((a + c2) / 2, (b + d2) / 2, Math.abs(c2 - a) / 2, Math.abs(d2 - b) / 2, 0, 0, 6.283); ox.stroke(); }
    if (hover && ['brush', 'pencil', 'eraser'].includes(A.tool) && !A.playing) { const [a, b] = S(hover.x, hover.y); ox.strokeStyle = 'rgba(0,0,0,.6)'; ox.lineWidth = 2.5; ox.beginPath(); ox.arc(a, b, Math.max(2, (A.opts.size * A.zoom) / 2), 0, 6.283); ox.stroke(); ox.strokeStyle = '#fff'; ox.lineWidth = 1; ox.stroke(); }
  }
  const tintCache = new WeakMap();
  function tinted(c, col) { let m = tintCache.get(c); if (!m) { m = {}; tintCache.set(c, m); } if (m[col]) return m[col]; const t = clone(c); const x = t.getContext('2d'); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height); m[col] = t; return t; }

  // ================= tools =================
  function buildTools() {
    toolsEl.innerHTML = '';
    for (const t of TOOLS) {
      if (t === '-') { toolsEl.appendChild(C.h('<div class="ph-tsep"></div>')); continue; }
      const b = C.h(`<button class="ph-tool ${A.tool === t[0] ? 'on' : ''}" data-tip="${t[3]} (${t[2]})">${C.icon(t[1])}</button>`); b.onclick = () => A.setTool(t[0]); toolsEl.appendChild(b); t.el = b;
    }
    const sw = C.h(`<div class="ph-swatches"><input type="color" class="fgc" value="${A.opts.color}" data-tip="Line color"><input type="color" class="bgc" value="${A.opts.fill}" data-tip="Fill color"></div>`);
    sw.querySelector('.fgc').oninput = (e) => { A.opts.color = e.target.value; saveOpts(); }; sw.querySelector('.bgc').oninput = (e) => { A.opts.fill = e.target.value; saveOpts(); };
    toolsEl.appendChild(sw);
  }
  A.setTool = (t) => { A.tool = t; TOOLS.forEach((x) => x !== '-' && x.el && x.el.classList.toggle('on', x[0] === t)); view && (view.style.cursor = t === 'hand' ? 'grab' : t === 'select' ? 'default' : 'crosshair'); renderOpts(); needs = true; };
  function renderOpts() {
    if (!optsBar) return; const o = A.opts; const t = TOOLS.find((x) => x !== '-' && x[0] === A.tool) || [];
    optsBar.innerHTML = `<div class="ph-optname">${C.icon(t[1] || 'brush')}<b>${(t[3] || '').split(' (')[0]}</b></div>`;
    const range = (k, label, min, max, unit = '') => { const r = C.h(`<div class="ph-opt"><label>${label}</label><input type="range" min="${min}" max="${max}" value="${o[k]}"><span class="v">${o[k]}${unit}</span></div>`); const i = r.querySelector('input'); C.setRangeFill(i); i.oninput = () => { o[k] = +i.value; r.querySelector('.v').textContent = i.value + unit; saveOpts(); needs = true; }; optsBar.appendChild(r); };
    const chk = (k, label, obj = o) => { const r = C.h(`<div class="ph-opt"><label class="ph-chk"><input type="checkbox" ${obj[k] ? 'checked' : ''}> ${label}</label></div>`); r.querySelector('input').onchange = (e) => { obj[k] = e.target.checked; saveOpts(); needs = true; }; optsBar.appendChild(r); };
    if (['brush', 'pencil', 'eraser'].includes(A.tool)) { range('size', 'Size', 1, 200, 'px'); if (A.tool !== 'eraser') range('opacity', 'Opacity', 5, 100, '%'); if (A.tool === 'brush') range('smooth', 'Smoothing', 0, 100, '%'); }
    if (['line', 'rect', 'ellipse'].includes(A.tool)) { range('size', 'Line width', 1, 100, 'px'); if (A.tool !== 'line') chk('fillShapes', 'Filled'); }
    if (A.tool === 'fill') range('tol', 'Tolerance', 0, 120);
    if (['brush', 'pencil', 'eraser', 'line', 'rect', 'ellipse', 'fill'].includes(A.tool)) chk('autoFrame', 'Draw on a new frame', A);
    if (A.tool === 'select') { chk('autoKey', 'Auto keyframe (moving makes a keyframe)', A); optsBar.appendChild(C.h('<div class="ph-opt"><span class="hint">Drag objects · corners scale · top handle rotates</span></div>')); }
    if (A.tool === 'text') optsBar.appendChild(C.h('<div class="ph-opt"><span class="hint">Click the stage to add a text object, then edit it in Properties</span></div>'));
  }
  A.autoKey = true;

  let stroke = null, shapeDrag = null;
  function editableCell(L, f) {
    // returns the cell canvas to draw into at frame f (creates a key if needed)
    const k = A.keyAt(L, f);
    if (k === f && L.cells[f]) return (L.cells[f] = clone(L.cells[f]));
    if (k < 0 || A.autoFrame) { L.cells[f] = mk(A.doc.w, A.doc.h); if (k >= 0 && !A.autoFrame) L.cells[f].getContext('2d').drawImage(L.cells[k], 0, 0); return L.cells[f]; }
    if (!L.cells[k]) { L.cells[f] = mk(A.doc.w, A.doc.h); return L.cells[f]; }
    return (L.cells[k] = clone(L.cells[k]));
  }
  function onDown(e) {
    if (!A.doc || e.button === 2) return;
    view.setPointerCapture(e.pointerId);
    const p = toDoc(e); const d = A.doc;
    if (A.playing) A.stop();
    if (A.tool === 'hand' || space || e.button === 1) { const o = { x: A.ox, y: A.oy, cx: e.clientX, cy: e.clientY }; return drag((m) => { A.ox = o.x + m.clientX - o.cx; A.oy = o.y + m.clientY - o.cy; needs = true; }); }
    if (A.tool === 'eyedrop') { const t = mk(1, 1); const x = t.getContext('2d'); x.translate(-p.x, -p.y); A.renderFrame(x, d.cur); const c = x.getImageData(0, 0, 1, 1).data; A.opts.color = '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); buildTools(); return; }
    if (A.tool === 'text') { A.act('Add text', () => { const L = A.addObject({ kind: 'text', text: 'Text', size: Math.round(d.h / 9), color: A.opts.color, font: 'Segoe UI' }, 'Text'); L.base.x = p.x; L.base.y = p.y; }); A.setTool('select'); setTimeout(() => { const t = side.querySelector('textarea'); t && (t.focus(), t.select()); }, 50); return; }
    if (A.tool === 'select') return selectDown(e, p);
    const L = A.layer(); if (!L) return;
    if (L.type !== 'draw') { C.toast('Pick a drawing layer to draw on (or add one with + Drawing)', 'info'); return; }
    if (L.locked || !L.visible) { C.toast('This layer is locked or hidden', 'info'); return; }
    if (A.tool === 'fill') { A.act('Fill', () => fillAt(editableCell(L, d.cur), p)); return; }
    if (['line', 'rect', 'ellipse'].includes(A.tool)) { shapeDrag = { a: p, b: p }; return drag((m) => { shapeDrag.b = toDoc(m); if (m.shiftKey) { const dx = shapeDrag.b.x - p.x, dy = shapeDrag.b.y - p.y; if (A.tool === 'line') { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); shapeDrag.b = { x: p.x + Math.cos(a) * l, y: p.y + Math.sin(a) * l }; } else { const s = Math.max(Math.abs(dx), Math.abs(dy)); shapeDrag.b = { x: p.x + Math.sign(dx) * s, y: p.y + Math.sign(dy) * s }; } } needs = true; }, () => { const s = shapeDrag; shapeDrag = null; if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 2) return; A.act('Shape', () => { const x = editableCell(L, d.cur).getContext('2d'); x.strokeStyle = A.opts.color; x.fillStyle = A.opts.fill; x.lineWidth = A.opts.size; x.lineCap = x.lineJoin = 'round'; x.beginPath(); if (A.tool === 'line') { x.moveTo(s.a.x, s.a.y); x.lineTo(s.b.x, s.b.y); } else if (A.tool === 'rect') x.rect(s.a.x, s.a.y, s.b.x - s.a.x, s.b.y - s.a.y); else x.ellipse((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, Math.abs(s.b.x - s.a.x) / 2, Math.abs(s.b.y - s.a.y) / 2, 0, 0, 6.283); if (A.opts.fillShapes && A.tool !== 'line') x.fill(); x.stroke(); }); }); }
    // brush / pencil / eraser
    const erase = A.tool === 'eraser'; const scv = mk(d.w, d.h); const sx = scv.getContext('2d');
    sx.strokeStyle = sx.fillStyle = erase ? '#ff4d6d' : A.opts.color; sx.lineWidth = A.opts.size; sx.lineCap = sx.lineJoin = 'round'; if (A.tool === 'pencil') sx.imageSmoothingEnabled = false;
    stroke = { L, cv: scv, erase }; const pts = [p]; let sm = { x: p.x, y: p.y };
    sx.beginPath(); sx.arc(p.x, p.y, A.opts.size / 2, 0, 6.283); sx.fill(); needs = true;
    const k = A.tool === 'brush' ? 1 - (A.opts.smooth / 100) * 0.85 : 1;
    drag((m) => { const q = toDoc(m); const nx = sm.x + (q.x - sm.x) * k, ny = sm.y + (q.y - sm.y) * k; sx.beginPath(); sx.moveTo(sm.x, sm.y); sx.lineTo(nx, ny); sx.stroke(); sm = { x: nx, y: ny }; pts.push(sm); needs = true; }, () => {
      const s = stroke; stroke = null;
      A.act(erase ? 'Erase' : 'Draw', () => { const target = editableCell(L, d.cur); const x = target.getContext('2d'); if (s.erase) { x.globalCompositeOperation = 'destination-out'; x.drawImage(s.cv, 0, 0); } else { x.globalAlpha = A.opts.opacity / 100; x.drawImage(s.cv, 0, 0); } });
    });
  }
  function drag(move, up) { const mv = (m) => move(m); const u = (m) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', u); up && up(m); }; addEventListener('pointermove', mv); addEventListener('pointerup', u); }
  function hitObj(p) { const d = A.doc; for (let i = d.layers.length - 1; i >= 0; i--) { const L = d.layers[i]; if (L.type !== 'obj' || !L.visible || L.locked || d.cur < (L.from ?? 0) || d.cur > (L.to ?? 1e9)) continue; const s = A.state(L, d.cur); const { w, h } = objSize(L); const a = (-s.rot * Math.PI) / 180; const dx = p.x - s.x, dy = p.y - s.y; const u = (dx * Math.cos(a) - dy * Math.sin(a)) / s.scale, v = (dx * Math.sin(a) + dy * Math.cos(a)) / s.scale; if (Math.abs(u) <= w / 2 + 6 && Math.abs(v) <= h / 2 + 6) return L; } return null; }
  function selectDown(e, p) {
    const d = A.doc; const H = A._handles; const r = view.getBoundingClientRect(); const sp = [e.clientX - r.left, e.clientY - r.top]; const L0 = A.layer(A.sel);
    if (H && L0) {
      const s0 = A.state(L0, d.cur);
      if (Math.hypot(sp[0] - H.rh[0], sp[1] - H.rh[1]) < 9) { const a0 = Math.atan2(sp[1] - H.c[1], sp[0] - H.c[0]); return withAct('Rotate', (m) => { const a = Math.atan2(m.clientY - r.top - H.c[1], m.clientX - r.left - H.c[0]); let v = s0.rot + ((a - a0) * 180) / Math.PI; if (m.shiftKey) v = Math.round(v / 15) * 15; A.setProp(L0, 'rot', v); }); }
      if (H.cs.some(([a, b]) => Math.hypot(sp[0] - a, sp[1] - b) < 9)) { const d0 = Math.hypot(sp[0] - H.c[0], sp[1] - H.c[1]); return withAct('Scale', (m) => { const dd = Math.hypot(m.clientX - r.left - H.c[0], m.clientY - r.top - H.c[1]); A.setProp(L0, 'scale', Math.max(0.05, (s0.scale * dd) / d0)); }); }
    }
    const L = hitObj(p);
    if (!L) { A.sel = null; renderSide(); needs = true; return; }
    A.sel = L.id; A.doc.active = L.id; renderSide(); renderTimeline();
    const s = A.state(L, d.cur);
    withAct('Move', (m) => { const q = toDoc(m); A.setProp(L, 'x', s.x + q.x - p.x); A.setProp(L, 'y', s.y + q.y - p.y); });
  }
  function withAct(label, fn) { const before = snap(); let moved = false; drag((m) => { moved = true; fn(m); needs = true; renderSideValues(); }, () => { if (moved) { A.undo.push({ label, s: before }); A.redo = []; A.dirty = true; A.changed(true); } }); }
  function fillAt(cell, p) {
    const W = cell.width, H = cell.height, x0 = Math.floor(p.x), y0 = Math.floor(p.y); if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
    const x = cell.getContext('2d'); const id = x.getImageData(0, 0, W, H); const d = id.data; const i0 = (y0 * W + x0) * 4; const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
    const n = parseInt(A.opts.fill.slice(1), 16), fr = (n >> 16) & 255, fg = (n >> 8) & 255, fb = n & 255; const t = A.opts.tol * 3;
    const match = (i) => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) + Math.abs(d[i + 3] - a0) * 1.5 <= t;
    const seen = new Uint8Array(W * H); const st = [x0, y0];
    while (st.length) { const y = st.pop(), xs = st.pop(); let x1 = xs; while (x1 >= 0 && !seen[y * W + x1] && match((y * W + x1) * 4)) x1--; x1++; let up = false, dn = false;
      while (x1 < W && !seen[y * W + x1] && match((y * W + x1) * 4)) { const k = y * W + x1; seen[k] = 1; const q = k * 4; d[q] = fr; d[q + 1] = fg; d[q + 2] = fb; d[q + 3] = 255;
        if (y > 0) { const u = !seen[k - W] && match(q - W * 4); if (u && !up) { st.push(x1, y - 1); up = true; } else if (!u) up = false; }
        if (y < H - 1) { const v = !seen[k + W] && match(q + W * 4); if (v && !dn) { st.push(x1, y + 1); dn = true; } else if (!v) dn = false; } x1++; } }
    // grow 1px into antialiased line edges so fills meet the lines
    const out = new Uint8ClampedArray(d); for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) { const k = y * W + xx; if (seen[k]) continue; if (seen[k - 1] || seen[k + 1] || seen[k - W] || seen[k + W]) { const q = k * 4; if (d[q + 3] < 250) { out[q] = fr; out[q + 1] = fg; out[q + 2] = fb; out[q + 3] = 255; } } }
    id.data.set(out); x.putImageData(id, 0, 0);
  }

  // ================= frames & layers =================
  A.go = (f) => { if (!A.doc) return; A.doc.cur = C.clamp(Math.round(f), 0, A.doc.length - 1); needs = true; updatePlayhead(); renderSideValues(); };
  A.play = () => { if (!A.doc) return; A.playing = true; A._lastTick = performance.now(); renderTimeline(); };
  A.stop = () => { A.playing = false; renderTimeline(); needs = true; };
  A.toggle = () => (A.playing ? A.stop() : A.play());
  A.insertFrame = () => A.act('Insert frame', () => { const d = A.doc, f = d.cur; d.length++; for (const L of d.layers) { if (L.type === 'draw') { const nc = {}; for (const k in L.cells) nc[+k > f ? +k + 1 : k] = L.cells[k]; L.cells = nc; } else { for (const arr of Object.values(L.kf)) for (const k of arr) if (k.f > f) k.f++; if (L.to >= f) L.to++; } } });
  A.deleteFrame = () => A.act('Delete frame', () => { const d = A.doc, f = d.cur; if (d.length <= 1) return; d.length--; for (const L of d.layers) { if (L.type === 'draw') { const nc = {}; for (const k in L.cells) { const n = +k; if (n === f) continue; nc[n > f ? n - 1 : n] = L.cells[k]; } L.cells = nc; } else { for (const p in L.kf) { L.kf[p] = L.kf[p].filter((k) => k.f !== f); L.kf[p].forEach((k) => { if (k.f > f) k.f--; }); } if (L.to > f) L.to--; } } d.cur = Math.min(d.cur, d.length - 1); });
  A.keyframe = (blank) => A.act(blank ? 'Blank keyframe' : 'Keyframe', () => { const L = A.layer(); const d = A.doc; if (!L) return; if (L.type === 'draw') { const c = A.cellAt(L, d.cur); L.cells[d.cur] = blank || !c ? mk(d.w, d.h) : clone(c); } else { const s = A.state(L, d.cur); for (const [p] of PROPS) A.setKey(L, p, d.cur, s[p]); } });
  A.nextFrame = (add) => { const d = A.doc; if (!d) return; if (d.cur >= d.length - 1) { if (!add) return A.go(0); A.act('Add frame', () => { d.length++; }); } A.go(d.cur + 1); };
  A.duplicateFrameForward = () => { const d = A.doc; const L = A.layer(); if (!L || L.type !== 'draw') return; A.act('Copy to next frame', () => { if (d.cur >= d.length - 1) d.length++; const c = A.cellAt(L, d.cur); L.cells[d.cur + 1] = c ? clone(c) : mk(d.w, d.h); }); A.go(d.cur + 1); };
  A.clearFrame = () => A.act('Clear frame', () => { const L = A.layer(); if (L && L.type === 'draw') L.cells[A.doc.cur] = mk(A.doc.w, A.doc.h); });
  A.removeLayer = (L = A.layer()) => { if (!L) return; A.act('Delete layer', () => { A.doc.layers = A.doc.layers.filter((x) => x.id !== L.id); A.doc.active = (A.doc.layers[A.doc.layers.length - 1] || {}).id; if (A.sel === L.id) A.sel = null; }); };
  A.moveLayer = (L, dir) => A.act('Reorder layers', () => { const a = A.doc.layers; const i = a.indexOf(L), j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; });
  A.setLength = (n) => A.act('Animation length', () => { A.doc.length = C.clamp(Math.round(n), 1, 6000); A.doc.cur = Math.min(A.doc.cur, A.doc.length - 1); });

  // ================= timeline UI =================
  const CW = 16;
  function renderTimeline() {
    if (!tl) return; const d = A.doc;
    if (!d) { tl.innerHTML = ''; return; }
    tl.innerHTML = `<div class="atl-bar">
        <button class="icon-btn" data-a="first" data-tip="First frame (Home)">${C.icon('prevFrame')}</button><button class="icon-btn" data-a="prev" data-tip="Previous frame (,)">${C.icon('chevronDown').replace('<svg', '<svg style="transform:rotate(90deg)"')}</button>
        <button class="atl-play" data-a="play" data-tip="Play / pause (Space)">${C.icon(A.playing ? 'pause' : 'play')}</button>
        <button class="icon-btn" data-a="next" data-tip="Next frame (.)">${C.icon('chevronDown').replace('<svg', '<svg style="transform:rotate(-90deg)"')}</button><button class="icon-btn" data-a="last" data-tip="Last frame (End)">${C.icon('nextFrame')}</button>
        <span class="atl-frame"><b>${d.cur + 1}</b> / ${d.length}</span><span class="atl-sep"></span>
        <button class="btn" data-a="key" data-tip="Keyframe — copy this frame (F6)">${C.icon('diamond')}<span>Keyframe</span></button>
        <button class="btn" data-a="blank" data-tip="Blank keyframe (F7)">${C.icon('plus')}<span>Blank</span></button>
        <button class="btn" data-a="ins" data-tip="Insert frame (F5)">${C.icon('split')}<span>Insert</span></button>
        <button class="icon-btn" data-a="del" data-tip="Delete frame (Shift+F5)">${C.icon('trash')}</button>
        <span class="atl-sep"></span>
        <button class="btn ${A.onion ? 'on' : ''}" data-a="onion" data-tip="Onion skin — see the frames before (red) and after (green)">${C.icon('onion')}<span>Onion</span></button>
        <button class="btn ${A.loop !== false ? 'on' : ''}" data-a="loop" data-tip="Loop playback">${C.icon('refresh')}</button>
        <label class="atl-fps">FPS <select class="select compact" data-a="fps">${[6, 8, 12, 15, 24, 25, 30, 60].map((v) => `<option ${v === d.fps ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="atl-fps">Frames <input class="num" data-a="len" value="${d.length}"></label>
        <span style="flex:1"></span>
        <button class="btn" data-a="addDraw">${C.icon('brush')}<span>+ Drawing</span></button><button class="btn" data-a="addObj">${C.icon('plus')}<span>+ Object</span></button>
      </div>
      <div class="atl-body"><div class="atl-layers"></div><div class="atl-grid"><div class="atl-ruler"></div><div class="atl-rows"></div><div class="atl-head"></div></div></div>`;
    const bar = tl.querySelector('.atl-bar');
    const on = (a, fn) => { const b = bar.querySelector(`[data-a=${a}]`); if (b) b.onclick = fn; };
    on('first', () => A.go(0)); on('last', () => A.go(d.length - 1)); on('prev', () => A.go(d.cur - 1)); on('next', () => A.nextFrame(true)); on('play', () => A.toggle());
    on('key', () => A.keyframe(false)); on('blank', () => A.keyframe(true)); on('ins', A.insertFrame); on('del', A.deleteFrame);
    on('onion', () => { A.onion = !A.onion; renderTimeline(); needs = true; }); on('loop', () => { A.loop = A.loop === false; renderTimeline(); });
    bar.querySelector('[data-a=fps]').onchange = (e) => A.act('Frame rate', () => { d.fps = +e.target.value; });
    const len = bar.querySelector('[data-a=len]'); len.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') len.blur(); }; len.onchange = () => A.setLength(+len.value || d.length);
    on('addDraw', () => A.act('New drawing layer', () => A.addDrawLayer()));
    on('addObj', (e) => { const r = e.currentTarget.getBoundingClientRect(); C.menu(r.left, r.top - 8 - 36 * 7, objectMenu()); });
    C.fillIcons(tl);
    const lay = tl.querySelector('.atl-layers'), rows = tl.querySelector('.atl-rows'), ruler = tl.querySelector('.atl-ruler');
    const width = d.length * CW; rows.style.width = ruler.style.width = width + 'px';
    ruler.innerHTML = Array.from({ length: d.length }, (_, i) => `<span style="left:${i * CW}px" class="${(i + 1) % 5 === 0 || i === 0 ? 'n' : ''}">${(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}</span>`).join('') + Array.from({ length: Math.floor(d.length / d.fps) + 1 }, (_, s) => `<i style="left:${s * d.fps * CW}px">${s}s</i>`).join('');
    [...d.layers].reverse().forEach((L) => {
      const li = C.h(`<div class="atl-layer ${L.id === d.active ? 'on' : ''}" data-l="${L.id}"><span class="atl-ico">${C.icon(L.type === 'draw' ? 'brush' : L.obj.kind === 'text' ? 'text' : L.obj.kind === 'image' ? 'image' : L.obj.kind === 'emoji' ? 'smile' : 'shapes')}</span><span class="atl-name">${C.esc(L.name)}</span><button class="icon-btn" data-b="vis">${C.icon(L.visible ? 'eye' : 'eyeOff')}</button><button class="icon-btn" data-b="lock">${C.icon(L.locked ? 'lock' : 'unlock')}</button></div>`);
      li.onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) { A.act(b.dataset.b === 'vis' ? 'Toggle visibility' : 'Toggle lock', () => { if (b.dataset.b === 'vis') L.visible = !L.visible; else L.locked = !L.locked; }); return; } d.active = L.id; if (L.type === 'obj') A.sel = L.id; renderTimeline(); renderSide(); needs = true; };
      li.ondblclick = async () => { const v = await C.prompt('Rename layer', 'Name', L.name); if (v) A.act('Rename layer', () => { L.name = v; }); };
      li.oncontextmenu = (e) => { e.preventDefault(); C.menu(e.clientX, e.clientY, [{ label: 'Move up', icon: 'chevronDown', action: () => A.moveLayer(L, 1) }, { label: 'Move down', icon: 'chevronDown', action: () => A.moveLayer(L, -1) }, { label: 'Duplicate', icon: 'copy', action: () => A.act('Duplicate layer', () => { const c = Object.assign({}, L, { id: newId(), name: L.name + ' copy', cells: L.cells ? Object.assign({}, L.cells) : undefined, kf: L.kf ? JSON.parse(JSON.stringify(L.kf)) : undefined, base: L.base ? Object.assign({}, L.base) : undefined, obj: L.obj ? Object.assign({}, L.obj) : undefined }); A.doc.layers.splice(A.doc.layers.indexOf(L) + 1, 0, c); }) }, '-', { label: 'Delete layer', icon: 'trash', action: () => A.removeLayer(L) }]); };
      lay.appendChild(li);
      const row = C.h(`<div class="atl-row ${L.id === d.active ? 'on' : ''}" data-l="${L.id}"></div>`); row._L = L; rows.appendChild(row);
    });
    C.fillIcons(lay);
    renderTimelineCells();
    const grid = tl.querySelector('.atl-grid');
    const pick = (e) => { const r = rows.getBoundingClientRect(); return C.clamp(Math.floor((e.clientX - r.left) / CW), 0, d.length - 1); };
    grid.onpointerdown = (e) => { if (A.playing) A.stop(); const row = e.target.closest('.atl-row'); if (row) { d.active = row._L.id; if (row._L.type === 'obj') A.sel = row._L.id; } A.go(pick(e)); if (row) { renderSide(); C.$$('.atl-layer, .atl-row', tl).forEach((x) => x.classList.toggle('on', x.dataset.l === d.active)); }
      const mv = (m) => A.go(pick(m)); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); };
    updatePlayhead();
  }
  function renderTimelineCells() {
    if (!tl || !A.doc) return;
    for (const row of tl.querySelectorAll('.atl-row')) {
      const L = A.doc.layers.find((x) => x.id === row.dataset.l); if (!L) continue; let html = '';
      if (L.type === 'draw') {
        const keys = Object.keys(L.cells).map(Number).sort((a, b) => a - b);
        keys.forEach((k, i) => { const end = i + 1 < keys.length ? keys[i + 1] : A.doc.length; const c = L.cells[k]; html += `<span class="atl-span ${c ? '' : 'blank'}" style="left:${k * CW}px;width:${(end - k) * CW - 1}px"><i class="atl-key ${c ? '' : 'empty'}"></i></span>`; });
      } else {
        html += `<span class="atl-span obj" style="left:${(L.from ?? 0) * CW}px;width:${((L.to ?? A.doc.length - 1) - (L.from ?? 0) + 1) * CW - 1}px"></span>`;
        const fs = new Set(); Object.values(L.kf).forEach((arr) => arr.forEach((k) => fs.add(k.f))); for (const f of fs) html += `<i class="atl-diamond" style="left:${f * CW + CW / 2 - 4}px"></i>`;
      }
      row.innerHTML = html;
    }
  }
  function updatePlayhead() { if (!tl || !A.doc) return; const h = tl.querySelector('.atl-head'); if (h) h.style.left = A.doc.cur * CW + 'px'; const fr = tl.querySelector('.atl-frame b'); if (fr) fr.textContent = A.doc.cur + 1; const grid = tl.querySelector('.atl-grid'); if (grid && A.playing) { const x = A.doc.cur * CW; if (x < grid.scrollLeft || x > grid.scrollLeft + grid.clientWidth - 40) grid.scrollLeft = x - 40; } }
  function objectMenu() {
    const add = (obj, name) => A.act('Add ' + name, () => A.addObject(obj, name));
    return [
      { label: 'Text', icon: 'text', action: () => add({ kind: 'text', text: 'Hello!', size: Math.round(A.doc.h / 8), color: A.opts.color, font: 'Segoe UI', stroke: 0 }, 'Text') },
      { label: 'Emoji / sticker…', icon: 'smile', action: () => C.emoji.picker(tl.querySelector('[data-a=addObj]'), (em) => add({ kind: 'emoji', text: em, size: Math.round(A.doc.h / 4) }, em)) },
      { label: 'Circle', icon: 'circle', action: () => add({ kind: 'shape', shape: 'ellipse', w: A.doc.h / 4, h: A.doc.h / 4, fill: A.opts.fill }, 'Circle') },
      { label: 'Rectangle', icon: 'square', action: () => add({ kind: 'shape', shape: 'rect', w: A.doc.h / 3, h: A.doc.h / 4, fill: A.opts.fill, radius: 20 }, 'Rectangle') },
      { label: 'Star', icon: 'sparkles', action: () => add({ kind: 'shape', shape: 'star', w: A.doc.h / 4, h: A.doc.h / 4, fill: '#ffd84d' }, 'Star') },
      { label: 'Image file…', icon: 'image', action: async () => { const p = await N.fileOpenDialog({ title: 'Add an image', exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'], extName: 'Images' }); if (p) add({ kind: 'image', src: p }, C.baseName(p)); } },
      { label: 'Image from assets…', icon: 'bookmark', action: async () => { const a = await C.assets.pick(['image'], 'Add an image from your assets'); if (a) A.insertAsset(a); } },
    ];
  }
  A.insertAsset = (a) => { if (!A.doc) A.newDoc(); if (a.type !== 'image') return C.toast('Only image assets can be used in Animate', 'info'); A.act('Add asset', () => A.addObject({ kind: 'image', src: a.path }, a.name)); };

  // ================= side panel =================
  let sideTab = 'props';
  function renderSide() {
    if (!side) return; const d = A.doc;
    side.innerHTML = `<div class="tabs"><button class="tab ${sideTab === 'props' ? 'on' : ''}" data-t="props">Properties</button><button class="tab ${sideTab === 'scene' ? 'on' : ''}" data-t="scene">Scene</button></div><div class="an-props"></div>`;
    side.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { sideTab = b.dataset.t; renderSide(); }));
    const box = side.querySelector('.an-props'); if (!d) return;
    const L = A.layer(A.sel) || A.layer();
    if (sideTab === 'scene' || !L) {
      box.innerHTML = `<div class="section-title">Scene</div>
        <div class="form-row"><label>Name</label><input class="text-input" data-k="name" value="${C.esc(d.name)}"></div>
        <div class="form-row"><label>Size</label><div style="display:flex;gap:6px;align-items:center"><input class="num" data-k="w" value="${d.w}"> × <input class="num" data-k="h" value="${d.h}"></div></div>
        <div class="form-row"><label>Background</label><div style="display:flex;gap:8px;align-items:center"><input type="color" class="color-input" data-k="bg" value="${d.bg || '#ffffff'}" style="width:60px"><label class="ph-chk"><input type="checkbox" data-k="transp" ${d.bg ? '' : 'checked'}> Transparent</label></div></div>
        <p class="hint">${d.length} frames · ${(d.length / d.fps).toFixed(2)} s at ${d.fps} fps</p>`;
      box.querySelectorAll('input').forEach((i) => { i.onkeydown = (e) => e.stopPropagation(); i.onchange = () => A.act('Scene', () => { const k = i.dataset.k; if (k === 'name') d.name = i.value; else if (k === 'bg') d.bg = i.value; else if (k === 'transp') d.bg = i.checked ? null : '#ffffff'; else if (k === 'w' || k === 'h') resizeDoc(k === 'w' ? +i.value : d.w, k === 'h' ? +i.value : d.h); }); });
      return;
    }
    if (L.type === 'draw') {
      box.innerHTML = `<div class="section-title">${C.icon('brush')} ${C.esc(L.name)}</div><p class="hint">Drawing layer · ${Object.keys(L.cells).length} drawings. Draw on the stage; use <b>Keyframe</b> (F6) to copy a frame forward, <b>Blank</b> (F7) for a fresh frame. “Draw on a new frame” in the toolbar makes every frame you draw on its own drawing.</p>
        <div class="form-row"><label>Opacity</label><input type="range" min="0" max="100" value="${Math.round(L.opacity * 100)}" data-k="op"></div>
        <div class="an-btns"><button class="btn" data-a="clear">${C.icon('trash')}<span>Clear this frame</span></button><button class="btn" data-a="copy">${C.icon('copy')}<span>Copy to next frame</span></button></div>`;
      const r = box.querySelector('[data-k=op]'); C.setRangeFill(r); r.oninput = () => { L.opacity = +r.value / 100; needs = true; }; r.onchange = () => A.act('Layer opacity', () => {});
      box.querySelector('[data-a=clear]').onclick = A.clearFrame; box.querySelector('[data-a=copy]').onclick = A.duplicateFrameForward;
      C.fillIcons(box); return;
    }
    const o = L.obj;
    box.innerHTML = `<div class="section-title">${C.esc(L.name)} <span class="muted" style="font-weight:500">· frame ${d.cur + 1}</span></div>
      ${o.kind === 'text' || o.kind === 'emoji' ? `<textarea class="text-input" rows="2" data-o="text">${C.esc(o.text)}</textarea>` : ''}
      ${o.kind === 'text' ? `<div class="form-row"><label>Color</label><input type="color" class="color-input" data-o="color" value="${o.color || '#000000'}"></div><div class="form-row"><label>Outline</label><div style="display:flex;gap:6px"><input class="num" data-o="stroke" value="${o.stroke || 0}"><input type="color" class="color-input" data-o="strokeColor" value="${o.strokeColor || '#000000'}"></div></div>` : ''}
      ${o.kind === 'shape' ? `<div class="form-row"><label>Fill</label><input type="color" class="color-input" data-o="fill" value="${o.fill || '#19d3c5'}"></div><div class="form-row"><label>Size</label><div style="display:flex;gap:6px;align-items:center"><input class="num" data-o="w" value="${Math.round(o.w)}"> × <input class="num" data-o="h" value="${Math.round(o.h)}"></div></div>` : ''}
      <div class="section-title" style="margin-top:12px">Animate <span class="muted" style="font-weight:500">◆ = keyframe at this frame</span></div><div class="an-kprops"></div>
      <div class="form-row"><label>Easing</label><select class="select" data-k="ease">${EASES.map(([v, l]) => `<option value="${v}" ${(A.lastEase || 'ease') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-row"><label>Visible</label><div style="display:flex;gap:6px;align-items:center">frame <input class="num" data-v="from" value="${(L.from ?? 0) + 1}"> to <input class="num" data-v="to" value="${(L.to ?? d.length - 1) + 1}"></div></div>
      <div class="an-presets"><div class="hint" style="margin:10px 0 6px">Quick motion (from this frame)</div>${[['popIn', 'Pop in'], ['fadeIn', 'Fade in'], ['slideIn', 'Slide in'], ['bounceIn', 'Bounce'], ['spin', 'Spin'], ['wiggle', 'Wiggle'], ['fadeOut', 'Fade out'], ['flyOut', 'Fly out']].map(([k, l]) => `<button class="chip" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="an-btns"><button class="btn" data-a="clearKeys">${C.icon('x')}<span>Clear keyframes</span></button><button class="btn" data-a="del">${C.icon('trash')}<span>Delete</span></button></div>`;
    const kp = box.querySelector('.an-kprops');
    for (const [p, label, min, max, step] of PROPS) {
      const has = (L.kf[p] || []).some((k) => k.f === d.cur), any = (L.kf[p] || []).length > 0;
      const row = C.h(`<div class="an-kprop"><button class="kf-dot ${has ? 'on' : any ? 'some' : ''}" data-tip="${has ? 'Remove keyframe' : 'Add keyframe here'}">◆</button><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><input class="num" data-p="${p}"></div>`);
      const r = row.querySelector('input[type=range]'), n = row.querySelector('.num');
      const val = () => A.valueAt(L, p, d.cur); const fmt = (v) => (p === 'opacity' ? Math.round(v * 100) + '%' : p === 'scale' ? Math.round(v * 100) + '%' : p === 'rot' ? Math.round(v) + '°' : Math.round(v));
      const sync = () => { r.value = val(); n.value = fmt(val()); C.setRangeFill(r); }; sync(); row._sync = sync;
      let before = null;
      r.oninput = () => { if (!before) before = snap(); A.setProp(L, p, +r.value); n.value = fmt(+r.value); needs = true; renderTimelineCells(); };
      r.onchange = () => { if (before) { A.undo.push({ label: 'Change ' + label, s: before }); A.redo = []; before = null; A.changed(true); } };
      n.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') n.blur(); }; n.onchange = () => { let v = parseFloat(n.value); if (isNaN(v)) return sync(); if (p === 'opacity' || p === 'scale') v /= 100; A.act('Change ' + label, () => A.setProp(L, p, v)); };
      row.querySelector('.kf-dot').onclick = () => A.act(has ? 'Remove keyframe' : 'Add keyframe', () => { if (has) { L.kf[p] = L.kf[p].filter((k) => k.f !== d.cur); if (!L.kf[p].length) { delete L.kf[p]; } } else { if (!any) L.base[p] = val(); A.setKey(L, p, d.cur, val()); } });
      kp.appendChild(row);
    }
    box.querySelectorAll('[data-o]').forEach((i) => { i.onkeydown = (e) => e.stopPropagation(); const ev = i.tagName === 'TEXTAREA' ? 'oninput' : 'onchange'; i[ev] = () => { const k = i.dataset.o; const v = ['stroke', 'w', 'h'].includes(k) ? +i.value || 0 : i.value; if (i.tagName === 'TEXTAREA') { o[k] = v; L.name = String(v).split('\n')[0].slice(0, 24) || L.name; needs = true; clearTimeout(i._t); i._t = setTimeout(() => A.act('Edit text', () => {}), 600); } else A.act('Edit object', () => { o[k] = v; }); }; });
    box.querySelector('[data-k=ease]').onchange = (e) => { A.lastEase = e.target.value; A.act('Easing', () => { for (const arr of Object.values(L.kf)) { const k = [...arr].reverse().find((x) => x.f <= d.cur) || arr[0]; if (k) k.e = A.lastEase; } }); };
    box.querySelectorAll('[data-v]').forEach((i) => { i.onkeydown = (e) => e.stopPropagation(); i.onchange = () => A.act('Visible range', () => { const v = C.clamp((+i.value || 1) - 1, 0, d.length - 1); L[i.dataset.v] = v; if (L.from > L.to) [L.from, L.to] = [L.to, L.from]; }); });
    box.querySelectorAll('[data-p]').forEach((b) => b.classList.contains('chip') && (b.onclick = () => A.act('Quick motion', () => quickMotion(L, b.dataset.p))));
    box.querySelector('[data-a=clearKeys]').onclick = () => A.act('Clear keyframes', () => { const s = A.state(L, d.cur); L.kf = {}; Object.assign(L.base, s); });
    box.querySelector('[data-a=del]').onclick = () => A.removeLayer(L);
    C.fillIcons(box);
  }
  function renderSideValues() { if (!side) return; side.querySelectorAll('.an-kprop').forEach((r) => r._sync && r._sync()); const t = side.querySelector('.section-title .muted'); if (t && A.doc) t.textContent = '· frame ' + (A.doc.cur + 1); }
  function quickMotion(L, kind) {
    const d = A.doc, f = d.cur, s = A.state(L, f), n = Math.max(3, Math.round(d.fps * 0.6)), e = Math.min(d.length - 1, f + n);
    const key = (p, fr, v, ease = 'out') => { A.setKey(L, p, fr, v); const k = L.kf[p].find((x) => x.f === fr); k.e = ease; };
    if (kind === 'popIn') { key('scale', f, 0.01, 'back'); key('scale', e, s.scale); key('opacity', f, 0); key('opacity', Math.min(e, f + 2), s.opacity); }
    if (kind === 'fadeIn') { key('opacity', f, 0, 'ease'); key('opacity', e, s.opacity || 1); }
    if (kind === 'fadeOut') { key('opacity', f, s.opacity, 'ease'); key('opacity', e, 0); }
    if (kind === 'slideIn') { key('x', f, -objSize(L).w * s.scale, 'out'); key('x', e, s.x); }
    if (kind === 'flyOut') { key('x', f, s.x, 'in'); key('x', e, d.w + objSize(L).w * s.scale); }
    if (kind === 'bounceIn') { key('y', f, -objSize(L).h * s.scale, 'bounce'); key('y', Math.min(d.length - 1, f + n * 2), s.y); }
    if (kind === 'spin') { key('rot', f, s.rot, 'ease'); key('rot', Math.min(d.length - 1, f + n * 2), s.rot + 360); }
    if (kind === 'wiggle') { for (let i = 0; i <= 8; i++) key('rot', Math.min(d.length - 1, f + i * 2), s.rot + (i === 8 ? 0 : (i % 2 ? -12 : 12)), 'ease'); }
  }
  function resizeDoc(w, h) { const d = A.doc; w = C.clamp(Math.round(w) || d.w, 16, 7680); h = C.clamp(Math.round(h) || d.h, 16, 4320); for (const L of d.layers) if (L.type === 'draw') for (const k in L.cells) if (L.cells[k]) { const c = mk(w, h); c.getContext('2d').drawImage(L.cells[k], 0, 0); L.cells[k] = c; } d.w = w; d.h = h; A._fitted = false; A.fit(); }

  // ================= files =================
  A.newDialog = () => {
    const presets = [['Full HD 16:9', 1920, 1080], ['Vertical 9:16', 1080, 1920], ['Square', 1080, 1080], ['HD 720p', 1280, 720], ['Sticker / GIF', 512, 512]];
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.icon('clapper')} New animation</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body"><div class="aspect-cards">${presets.map(([n, w, h], i) => { const k = 48 / Math.max(w, h); return `<button class="aspect-card" data-i="${i}"><div class="ar-box"><span style="width:${w * k}px;height:${h * k}px"></span></div><b>${n}</b><small>${w}×${h}</small></button>`; }).join('')}</div>
      <div class="form-row" style="margin-top:14px"><label>Frame rate</label><select class="select" id="anFps">${[[8, '8 fps · choppy hand-drawn'], [12, '12 fps · classic animation'], [24, '24 fps · film-smooth'], [30, '30 fps · video']].map(([v, l]) => `<option value="${v}" ${v === 12 ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-row"><label>Background</label><select class="select" id="anBg"><option value="#ffffff">White</option><option value="#101114">Dark</option><option value="">Transparent</option></select></div></div>`, { cls: 'wide' });
    el.querySelectorAll('.aspect-card').forEach((b) => (b.onclick = async () => { if (!(await A.confirmDiscard())) return; const [n, w, h] = presets[+b.dataset.i]; close(); C.setMode('anim'); A.newDoc(w, h, +el.querySelector('#anFps').value, 'Animation', el.querySelector('#anBg').value || null); }));
  };
  A.confirmDiscard = async () => (!A.doc || !A.dirty ? true : C.confirm('Discard changes?', 'Your current animation has unsaved changes.', 'Discard', true));
  A.serialize = () => { const d = A.doc; return JSON.stringify({ app: 'cutroom-anim', v: 1, name: d.name, w: d.w, h: d.h, fps: d.fps, bg: d.bg, length: d.length, layers: d.layers.map((L) => L.type === 'draw' ? { id: L.id, name: L.name, type: 'draw', visible: L.visible, locked: L.locked, opacity: L.opacity, cells: Object.fromEntries(Object.entries(L.cells).map(([k, c]) => [k, c ? c.toDataURL('image/png') : null])) } : { id: L.id, name: L.name, type: 'obj', visible: L.visible, locked: L.locked, opacity: L.opacity, obj: L.obj, base: L.base, kf: L.kf, from: L.from, to: L.to }) }); };
  A.load = async (json, path) => {
    const j = JSON.parse(json); if (j.app !== 'cutroom-anim') throw new Error('Not a Cutroom animation');
    const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const layers = [];
    for (const L of j.layers) { if (L.type === 'draw') { const cells = {}; for (const [k, s] of Object.entries(L.cells)) { if (!s) { cells[k] = null; continue; } const img = await loadImg(s); const c = mk(j.w, j.h); if (img) c.getContext('2d').drawImage(img, 0, 0); cells[k] = c; } layers.push(Object.assign({}, L, { cells })); } else layers.push(Object.assign({}, L)); }
    A.doc = { name: j.name, w: j.w, h: j.h, fps: j.fps, bg: j.bg, length: j.length, cur: 0, layers, active: (layers[layers.length - 1] || {}).id, path };
    layers.forEach((L) => L.type === 'obj' && loadObj(L)); A.undo = []; A.redo = []; A.dirty = false; A._fitted = false; A.fit(); A.changed(true);
  };
  A.save = async (as) => { if (!A.doc) return; let p = !as && A.doc.path; if (!p) p = await N.fileSaveDialog({ title: 'Save animation', name: A.doc.name, ext: 'cutanim', extName: 'Cutroom animation' }); if (!p) return; await N.writeText(p, A.serialize()); A.doc.path = p; A.dirty = false; C.toast('Animation saved', 'ok', 1400); const c = mk(320, 180); const x = c.getContext('2d'); x.scale(320 / A.doc.w, 180 / A.doc.h); A.renderFrame(x, Math.floor(A.doc.length / 2)); C.home.addRecent(p, A.doc.name, 'anim', c); };
  A.open = async (p) => { if (!(await A.confirmDiscard())) return; p = p || (await N.fileOpenDialog({ title: 'Open animation', exts: ['cutanim'], extName: 'Cutroom animation' })); if (!p) return; try { C.setMode('anim'); await A.load(await N.readText(p), p); } catch (e) { C.toast('Could not open: ' + e.message, 'err'); } };

  // ================= export =================
  A.exportDialog = () => {
    if (!A.doc) return C.toast('Create an animation first', 'info');
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.icon('export')} Export animation</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body"><div class="exp-pick">${[['mp4', 'MP4 video', 'Plays everywhere'], ['gif', 'Animated GIF', 'Loops in chats & web'], ['webm', 'WebM', 'Small web video'], ['png', 'PNG frames', 'One image per frame'], ['video', 'Send to video editor', 'Adds it to your timeline']].map(([k, n, d], i) => `<button class="exp-opt ${i === 0 ? 'on' : ''}" data-f="${k}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>
      <div class="form-row" style="margin-top:12px"><label>Size</label><select class="select" id="axScale"><option value="1">${A.doc.w}×${A.doc.h} (full)</option><option value="0.5">${Math.round(A.doc.w / 2)}×${Math.round(A.doc.h / 2)} (half)</option></select></div>
      <div class="form-row"><label>Repeat</label><select class="select" id="axLoops"><option value="1">Once</option><option value="2">2×</option><option value="3">3×</option><option value="5">5×</option></select></div>
      <div class="trk-bar"><i></i></div><div class="hint ax-status">${A.doc.length} frames at ${A.doc.fps} fps</div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="axGo">${C.icon('export')}<span>Export</span></button></div>`);
    let fmt = 'mp4'; el.querySelectorAll('.exp-opt').forEach((b) => (b.onclick = () => { fmt = b.dataset.f; el.querySelectorAll('.exp-opt').forEach((x) => x.classList.toggle('on', x === b)); }));
    el.querySelector('#axGo').onclick = async () => { el.querySelector('#axGo').disabled = true; try { const r = await A.export(fmt, +el.querySelector('#axScale').value, +el.querySelector('#axLoops').value, (k, t) => { el.querySelector('.trk-bar i').style.width = Math.round(k * 100) + '%'; if (t) el.querySelector('.ax-status').textContent = t; }); close(); if (r && fmt !== 'video') C.toast('Exported ' + C.baseName(r), 'ok', 2500); if (r && fmt !== 'video') N.showItem(r); } catch (e) { el.querySelector('.ax-status').textContent = 'Export failed: ' + e.message; el.querySelector('#axGo').disabled = false; } };
  };
  A.export = async (fmt, scale = 1, loops = 1, prog = () => {}) => {
    const d = A.doc; const even = (v) => Math.max(2, Math.round(v / 2) * 2); const W = even(d.w * scale), H = even(d.h * scale);
    const c = mk(W, H); const x = c.getContext('2d', { willReadFrequently: true }); const total = d.length * loops;
    if (fmt === 'png') {
      const dir = await N.chooseFolder(); if (!dir) return null;
      for (let i = 0; i < d.length; i++) { A.renderFrame(x, i, { scale: W / d.w, transparent: !d.bg }); const b = await new Promise((r) => c.toBlob(r, 'image/png')); await N.writeBinary(`${dir}/${(d.name || 'frame').replace(/[\\/:*?"<>|]+/g, '_')}_${String(i + 1).padStart(4, '0')}.png`, await b.arrayBuffer()); prog((i + 1) / d.length, `Frame ${i + 1} / ${d.length}`); }
      return dir;
    }
    const ext = fmt === 'video' ? 'mp4' : fmt;
    const out = fmt === 'video' ? await N.animAutoPath(d.name, 'mp4') : await N.fileSaveDialog({ title: 'Export animation', name: d.name, ext, extName: ext.toUpperCase(), dir: 'videos' });
    if (!out) return null;
    const r = await N.exportStart({ outPath: out, width: W, height: H, fps: d.fps, format: ext === 'mp4' ? 'mp4' : ext, quality: 'high', audio: { segments: [] }, duration: total / d.fps });
    if (!r.ok) throw new Error(r.error || 'could not start the encoder');
    for (let i = 0; i < total; i++) { const f = i % d.length; x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = d.bg || '#ffffff'; x.fillRect(0, 0, W, H); A.renderFrame(x, f, { scale: W / d.w, transparent: !d.bg }); const img = x.getImageData(0, 0, W, H); await N.exportFrame(img.data.buffer); if (i % 3 === 0) prog((i + 1) / total, `Encoding frame ${i + 1} / ${total}`); }
    const fin = await N.exportFinish(); if (!fin.ok) throw new Error(fin.error || 'encoding failed');
    if (fmt === 'video') { C.setMode('video'); await C.importPaths([out], { addToTimeline: true }); C.toast('Animation added to your video timeline', 'ok', 2200); }
    return out;
  };

  // ================= menus & keys =================
  A.menus = {
    file: () => [
      { label: 'New animation…', icon: 'plus', key: 'Ctrl+N', action: A.newDialog },
      { label: 'Open .cutanim…', icon: 'folder', key: 'Ctrl+O', action: () => A.open() },
      { label: 'Save', icon: 'save', key: 'Ctrl+S', disabled: !A.doc, action: () => A.save() },
      { label: 'Save as…', icon: 'save', key: 'Ctrl+Shift+S', disabled: !A.doc, action: () => A.save(true) },
      '-', { label: 'Export…', icon: 'export', key: 'Ctrl+E', disabled: !A.doc, action: A.exportDialog },
      { label: 'Send to video editor', icon: 'film', disabled: !A.doc, action: () => A.export('video') },
      { label: 'Save current frame to assets', icon: 'bookmark', disabled: !A.doc, action: () => { const c = mk(A.doc.w, A.doc.h); A.renderFrame(c.getContext('2d'), A.doc.cur, { transparent: !A.doc.bg }); C.assets.saveImage(c, `${A.doc.name} frame ${A.doc.cur + 1}`, 'anim'); } },
      '-', { label: 'Home', icon: 'home', action: () => C.home.show() },
    ],
    edit: () => [{ label: 'Undo', icon: 'undo', key: 'Ctrl+Z', disabled: !A.undo.length, action: A.doUndo }, { label: 'Redo', icon: 'redo', key: 'Ctrl+Y', disabled: !A.redo.length, action: A.doRedo }, '-', { label: 'Clear frame', icon: 'trash', disabled: !A.doc, action: A.clearFrame }],
    frame: () => [
      { label: 'Next frame (add if at end)', icon: 'nextFrame', key: '.', action: () => A.nextFrame(true) }, { label: 'Previous frame', icon: 'prevFrame', key: ',', action: () => A.go(A.doc.cur - 1) },
      '-', { label: 'Keyframe (copy current)', icon: 'diamond', key: 'F6', action: () => A.keyframe(false) }, { label: 'Blank keyframe', icon: 'plus', key: 'F7', action: () => A.keyframe(true) },
      { label: 'Insert frame', icon: 'split', key: 'F5', action: A.insertFrame }, { label: 'Delete frame', icon: 'trash', key: 'Shift+F5', action: A.deleteFrame },
      { label: 'Copy drawing to next frame', icon: 'copy', key: 'Ctrl+D', action: A.duplicateFrameForward },
      '-', { label: (A.onion ? '✓ ' : '') + 'Onion skin', icon: 'onion', key: 'O', action: () => { A.onion = !A.onion; renderTimeline(); needs = true; } },
    ].map((m) => (m === '-' ? m : Object.assign(m, { disabled: !A.doc }))),
    layer: () => [{ label: 'New drawing layer', icon: 'brush', disabled: !A.doc, action: () => A.act('New drawing layer', () => A.addDrawLayer()) }, ...(A.doc ? objectMenu() : []), '-', { label: 'Delete layer', icon: 'trash', disabled: !A.layer(), action: () => A.removeLayer() }],
  };
  A.key = (e) => {
    if (C.mode !== 'anim') return false; const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl) { const map = { z: () => (e.shiftKey ? A.doRedo() : A.doUndo()), y: A.doRedo, s: () => A.save(e.shiftKey), o: () => A.open(), n: A.newDialog, e: A.exportDialog, d: A.duplicateFrameForward, '0': () => { A._fitted = false; A.fit(); }, '=': () => zoomAt(1.2), '+': () => zoomAt(1.2), '-': () => zoomAt(1 / 1.2), k: () => C.palette.open() }; if (map[k]) { e.preventDefault(); map[k](); return true; } return false; }
    if (C.isTyping() || !A.doc) return false;
    if (e.key === ' ') { e.preventDefault(); if (A.tool === 'hand' || e.repeat) return true; A.toggle(); return true; }
    if (e.key === 'F5') { e.preventDefault(); e.shiftKey ? A.deleteFrame() : A.insertFrame(); return true; }
    if (e.key === 'F6') { e.preventDefault(); A.keyframe(false); return true; }
    if (e.key === 'F7') { e.preventDefault(); A.keyframe(true); return true; }
    if (e.key === '.' || e.key === 'ArrowRight') { A.nextFrame(e.key === '.'); return true; }
    if (e.key === ',' || e.key === 'ArrowLeft') { A.go(A.doc.cur - 1); return true; }
    if (e.key === 'Home') { A.go(0); return true; } if (e.key === 'End') { A.go(A.doc.length - 1); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && A.sel) { A.removeLayer(A.layer(A.sel)); return true; }
    if (e.key === '[' || e.key === ']') { A.opts.size = C.clamp(Math.round(A.opts.size * (e.key === ']' ? 1.2 : 1 / 1.2)), 1, 200); renderOpts(); needs = true; return true; }
    if (k === 'o') { A.onion = !A.onion; renderTimeline(); needs = true; return true; }
    const t = TOOLS.find((x) => x !== '-' && x[2].toLowerCase() === k); if (t) { A.setTool(t[0]); return true; }
    return false;
  };

  // ================= demo =================
  A.demo = () => {
    C.setMode('anim'); A.newDoc(1280, 720, 24, 'Bouncing ball', '#fdf6e3'); const d = A.doc; d.length = 48;
    const L0 = d.layers[0]; L0.name = 'Ground'; const g = mk(d.w, d.h); const x = g.getContext('2d'); x.fillStyle = '#e9d8a6'; x.fillRect(0, 600, d.w, 120); x.strokeStyle = '#94795d'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 600); x.lineTo(d.w, 600); x.stroke(); L0.cells[0] = g;
    const shadow = A.addObject({ kind: 'shape', shape: 'ellipse', w: 140, h: 26, fill: 'rgba(0,0,0,.18)' }, 'Shadow');
    const ball = A.addObject({ kind: 'shape', shape: 'ellipse', w: 120, h: 120, fill: '#ee5a3f', strokeW: 0 }, 'Ball');
    const T = A.addObject({ kind: 'text', text: 'Boing!', size: 90, color: '#264653', font: 'Segoe UI' }, 'Title');
    const k = (L, p, f, v, e) => { A.setKey(L, p, f, v); L.kf[p].find((q) => q.f === f).e = e; };
    for (const [f, y, e] of [[0, 140, 'in'], [12, 540, 'out'], [24, 230, 'in'], [36, 540, 'out'], [47, 140, 'in']]) k(ball, 'y', f, y, e);
    k(ball, 'x', 0, 160, 'linear'); k(ball, 'x', 47, 1120, 'linear'); k(ball, 'rot', 0, 0, 'linear'); k(ball, 'rot', 47, 540, 'linear');
    shadow.base.y = 605; k(shadow, 'x', 0, 160, 'linear'); k(shadow, 'x', 47, 1120, 'linear'); for (const [f, s] of [[0, 0.5], [12, 1.1], [24, 0.6], [36, 1.1], [47, 0.5]]) k(shadow, 'scale', f, s, 'ease');
    T.base.x = 640; T.base.y = 110; k(T, 'scale', 10, 0.01, 'back'); k(T, 'scale', 16, 1, 'ease'); k(T, 'opacity', 10, 0, 'linear'); k(T, 'opacity', 12, 1, 'linear');
    d.active = L0.id; A.sel = null; A.undo = []; A.changed(true); A.play();
  };
})(window.C);
