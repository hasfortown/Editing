/* Cutroom Photo — workspace view & tools */
(function (C) {
  const P = C.photo;
  const PU = (C.photoUI = { tool: 'move', view: { z: 1, ox: 0, oy: 0 }, ready: false });
  PU.TOOLS = [
    ['move', 'move', 'V', 'Move & transform'], ['marquee', 'marquee', 'M', 'Marquee select'], ['lasso', 'lasso', 'L', 'Lasso select'], ['wand', 'wand', 'W', 'Magic wand'],
    ['crop', 'crop', 'C', 'Crop'], ['eyedropper', 'eyedrop', 'I', 'Eyedropper'], '-',
    ['brush', 'brush', 'B', 'Brush'], ['eraser', 'eraser', 'E', 'Eraser'], ['clone', 'stamp', 'S', 'Clone stamp (Alt+click to set source)'], ['retouch', 'droplet', 'O', 'Dodge / burn / blur / sharpen / sponge'],
    ['bucket', 'bucket', 'G', 'Paint bucket'], ['gradient', 'gradient', 'Q', 'Gradient'], '-',
    ['text', 'text', 'T', 'Text'], ['shape', 'shapes', 'U', 'Shapes'], '-', ['hand', 'hand', 'H', 'Hand (or hold Space)'], ['zoom', 'zoomIn', 'Z', 'Zoom (Alt to zoom out)'],
  ];
  PU.opts = {
    move: { auto: true }, marquee: { shape: 'rect', mode: 'new', feather: 0 }, lasso: { mode: 'new', feather: 0, poly: false },
    wand: { tol: 32, contiguous: true, all: true, mode: 'new' }, crop: { ratio: 'free' },
    brush: { size: 40, hardness: 70, opacity: 100, flow: 100 }, eraser: { size: 50, hardness: 60, opacity: 100, flow: 100 },
    clone: { size: 60, hardness: 50, opacity: 100, flow: 100 }, retouch: { mode: 'dodge', size: 70, hardness: 30, strength: 40 },
    bucket: { tol: 32, contiguous: true, all: false, opacity: 100 }, gradient: { type: 'linear', mode: 'fgbg', opacity: 100 },
    text: {}, shape: { kind: 'rect' },
  };
  try { Object.assign(PU.opts, JSON.parse(localStorage.getItem('cutroom.photoOpts') || '{}')); } catch (_) {}
  const saveOpts = C.debounce(() => { try { localStorage.setItem('cutroom.photoOpts', JSON.stringify(PU.opts)); } catch (_) {} }, 400);

  let ws, view, cv, cx, ov, ox, emptyEl, raf = null, needDraw = true, antsT = 0, space = false, drag = null, hover = null, cropRect = null, cloneSrc = null;

  PU.init = () => {
    ws = C.$('#photoWs');
    view = C.$('#phView'); cv = C.$('#phCv'); ov = C.$('#phOv'); emptyEl = C.$('#phEmpty');
    cx = cv.getContext('2d'); ox = ov.getContext('2d');
    new ResizeObserver(() => { sizeCanvases(); PU.redraw(); }).observe(view);
    view.addEventListener('pointerdown', onDown);
    view.addEventListener('pointermove', (e) => { hover = docPt(e); if (!drag) { updateStatus(); PU.redraw(); } });
    view.addEventListener('pointerleave', () => { hover = null; PU.redraw(); });
    view.addEventListener('wheel', onWheel, { passive: false });
    view.addEventListener('dblclick', (e) => { const L = P.active(); if (PU.tool === 'move' && L && L.type === 'text') { PU.setTool('text'); C.emit('photo:focusText'); } });
    C.on('photo:change', () => { needDraw = true; PU.redraw(); });
    C.on('photo:selection', () => PU.redraw());
    buildTools(); PU.renderOptions();
    PU.ready = true;
  };

  // ---------- view math ----------
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  function sizeCanvases() {
    const r = view.getBoundingClientRect(), k = dpr();
    for (const c of [cv, ov]) { c.width = Math.max(1, Math.round(r.width * k)); c.height = Math.max(1, Math.round(r.height * k)); c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; }
  }
  PU.fit = () => {
    if (!P.doc) return; const r = view.getBoundingClientRect();
    const z = Math.min((r.width - 60) / P.doc.w, (r.height - 60) / P.doc.h, 4);
    PU.view = { z, ox: (r.width - P.doc.w * z) / 2, oy: (r.height - P.doc.h * z) / 2 }; PU.redraw(); updateStatus();
  };
  PU.zoomAt = (f, sx, sy) => {
    const v = PU.view; const r = view.getBoundingClientRect();
    if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    const z = C.clamp(v.z * f, 0.02, 64); const dx = (sx - v.ox) / v.z, dy = (sy - v.oy) / v.z;
    PU.view = { z, ox: sx - dx * z, oy: sy - dy * z }; PU.redraw(); updateStatus();
  };
  const docPt = (e) => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left - PU.view.ox) / PU.view.z, y: (e.clientY - r.top - PU.view.oy) / PU.view.z, sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  const toScr = (x, y) => [x * PU.view.z + PU.view.ox, y * PU.view.z + PU.view.oy];

  // ---------- drawing ----------
  let checker = null;
  PU.redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  function draw() {
    raf = null;
    if (!ws || C.mode !== 'photo') return;
    const k = dpr(), W = cv.width / k, H = cv.height / k;
    cx.setTransform(k, 0, 0, k, 0, 0); cx.fillStyle = '#121318'; cx.fillRect(0, 0, W, H);
    emptyEl.style.display = P.doc ? 'none' : 'grid';
    ox.setTransform(k, 0, 0, k, 0, 0); ox.clearRect(0, 0, W, H);
    if (!P.doc) return;
    const { z, ox: vx, oy: vy } = PU.view; const dw = P.doc.w * z, dh = P.doc.h * z;
    cx.save(); cx.shadowColor = 'rgba(0,0,0,.5)'; cx.shadowBlur = 24; cx.fillStyle = '#fff'; cx.fillRect(vx, vy, dw, dh); cx.restore();
    if (!checker) { checker = document.createElement('canvas'); checker.width = checker.height = 16; const c2 = checker.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, 16, 16); c2.fillStyle = '#d6d8de'; c2.fillRect(0, 0, 8, 8); c2.fillRect(8, 8, 8, 8); }
    cx.save(); cx.beginPath(); cx.rect(vx, vy, dw, dh); cx.clip(); cx.fillStyle = cx.createPattern(checker, 'repeat'); cx.fillRect(vx, vy, dw, dh); cx.restore();
    const comp = P._compDirty || needDraw || !P._comp ? P.composite() : P._comp; needDraw = false;
    cx.imageSmoothingEnabled = z < 2; cx.imageSmoothingQuality = 'high';
    cx.drawImage(comp, vx, vy, dw, dh);
    cx.imageSmoothingEnabled = true;
    drawOverlay(W, H);
    if (P.sel && P.sel.edges) { antsT += 1; raf = raf || requestAnimationFrame(draw); }
  }
  let stripe = null;
  function drawOverlay(W, H) {
    const { z, ox: vx, oy: vy } = PU.view;
    // selection marching ants
    if (P.sel && P.sel.edges) {
      const t = PU.tmpAnts || (PU.tmpAnts = document.createElement('canvas'));
      if (t.width !== Math.round(W) || t.height !== Math.round(H)) { t.width = Math.round(W); t.height = Math.round(H); }
      const a = t.getContext('2d'); a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over'; a.clearRect(0, 0, W, H);
      a.imageSmoothingEnabled = false; a.drawImage(P.sel.edges, vx, vy, P.doc.w * z, P.doc.h * z);
      if (!stripe) { stripe = document.createElement('canvas'); stripe.width = stripe.height = 8; const s = stripe.getContext('2d'); s.fillStyle = '#fff'; s.fillRect(0, 0, 8, 8); s.fillStyle = '#000'; for (let i = -8; i < 16; i += 8) { s.beginPath(); s.moveTo(i, 0); s.lineTo(i + 4, 0); s.lineTo(i + 12, 8); s.lineTo(i + 8, 8); s.fill(); } }
      a.globalCompositeOperation = 'source-in'; const pat = a.createPattern(stripe, 'repeat'); pat.setTransform(new DOMMatrix().translate((antsT / 4) % 8, 0)); a.fillStyle = pat; a.fillRect(0, 0, W, H);
      ox.drawImage(t, 0, 0, W, H);
    }
    const L = P.active();
    // transform box
    if (L && PU.tool === 'move' && L.type !== 'adjust' && L.type !== 'fill' && L.visible) {
      const cs = P.corners(L).map(([x, y]) => toScr(x, y));
      ox.strokeStyle = '#19d3c5'; ox.lineWidth = 1.5; ox.beginPath(); cs.forEach(([x, y], i) => (i ? ox.lineTo(x, y) : ox.moveTo(x, y))); ox.closePath(); ox.stroke();
      const top = [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2]; const ctr = P.center(L); const [ccx, ccy] = toScr(ctr.x, ctr.y);
      const dx = top[0] - ccx, dy = top[1] - ccy, dl = Math.hypot(dx, dy) || 1; const rh = [top[0] + (dx / dl) * 26, top[1] + (dy / dl) * 26];
      ox.beginPath(); ox.moveTo(top[0], top[1]); ox.lineTo(rh[0], rh[1]); ox.stroke();
      for (const [x, y] of cs) { ox.fillStyle = '#fff'; ox.fillRect(x - 5, y - 5, 10, 10); ox.strokeRect(x - 5, y - 5, 10, 10); }
      ox.fillStyle = '#19d3c5'; ox.beginPath(); ox.arc(rh[0], rh[1], 6, 0, 6.283); ox.fill();
      PU._handles = { corners: cs, rot: rh };
    } else PU._handles = null;
    // crop
    if (PU.tool === 'crop' && cropRect) {
      const [x1, y1] = toScr(cropRect.x, cropRect.y), [x2, y2] = toScr(cropRect.x + cropRect.w, cropRect.y + cropRect.h);
      ox.fillStyle = 'rgba(0,0,0,.55)'; ox.beginPath(); ox.rect(0, 0, W, H); ox.rect(x1, y1, x2 - x1, y2 - y1); ox.fill('evenodd');
      ox.strokeStyle = '#fff'; ox.lineWidth = 1.5; ox.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ox.strokeStyle = 'rgba(255,255,255,.35)'; ox.lineWidth = 1; for (let i = 1; i < 3; i++) { ox.beginPath(); ox.moveTo(x1 + ((x2 - x1) * i) / 3, y1); ox.lineTo(x1 + ((x2 - x1) * i) / 3, y2); ox.moveTo(x1, y1 + ((y2 - y1) * i) / 3); ox.lineTo(x2, y1 + ((y2 - y1) * i) / 3); ox.stroke(); }
      ox.fillStyle = '#fff'; for (const [x, y] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) ox.fillRect(x - 5, y - 5, 10, 10);
      ox.font = '12px Consolas, monospace'; ox.fillText(`${Math.round(cropRect.w)} × ${Math.round(cropRect.h)}  ·  Enter to apply`, x1, y1 - 8);
    }
    // drag previews
    if (drag && drag.preview) drag.preview(ox);
    // brush cursor
    if (hover && ['brush', 'eraser', 'clone', 'retouch'].includes(PU.tool)) {
      const o = PU.opts[PU.tool]; const [hx, hy] = toScr(hover.x, hover.y); const r = Math.max(2, (o.size / 2) * z);
      ox.strokeStyle = 'rgba(0,0,0,.7)'; ox.lineWidth = 3; ox.beginPath(); ox.arc(hx, hy, r, 0, 6.283); ox.stroke();
      ox.strokeStyle = '#fff'; ox.lineWidth = 1; ox.beginPath(); ox.arc(hx, hy, r, 0, 6.283); ox.stroke();
      if (PU.tool === 'clone' && cloneSrc) { const [sx, sy] = toScr(cloneSrc.x + (drag && drag.cloneOff ? 0 : 0), cloneSrc.y); ox.strokeStyle = '#ff3db5'; ox.beginPath(); ox.moveTo(sx - 8, sy); ox.lineTo(sx + 8, sy); ox.moveTo(sx, sy - 8); ox.lineTo(sx, sy + 8); ox.stroke(); }
    }
  }

  // ---------- tool bar & options ----------
  function buildTools() {
    const bar = C.$('#phTools'); bar.innerHTML = '';
    for (const t of PU.TOOLS) {
      if (t === '-') { bar.appendChild(C.h('<div class="ph-tsep"></div>')); continue; }
      const [id, ic, key, name] = t;
      const b = C.h(`<button class="ph-tool ${PU.tool === id ? 'on' : ''}" data-t="${id}" data-tip="${C.esc(name)} (${key})">${C.icon(ic)}</button>`);
      b.onclick = () => PU.setTool(id); bar.appendChild(b);
    }
    bar.appendChild(C.h('<div style="flex:1"></div>'));
    const sw = C.h(`<div class="ph-swatches" data-tip="Foreground / background color · X swap · D default"><input type="color" class="fgc"><input type="color" class="bgc"><button class="ph-swap">${C.icon('swap')}</button></div>`);
    const fg = sw.querySelector('.fgc'), bg = sw.querySelector('.bgc');
    const sync = () => { fg.value = P.fg; bg.value = P.bg; };
    fg.oninput = () => { P.fg = fg.value; C.emit('photo:colors'); }; bg.oninput = () => { P.bg = bg.value; C.emit('photo:colors'); };
    sw.querySelector('.ph-swap').onclick = () => { [P.fg, P.bg] = [P.bg, P.fg]; sync(); C.emit('photo:colors'); };
    C.on('photo:colors', sync); sync();
    bar.appendChild(sw);
  }
  PU.setTool = (t) => {
    if (PU.tool === 'crop' && t !== 'crop') cropRect = null;
    PU.tool = t; C.$$('.ph-tool').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'crop' && P.doc) cropRect = { x: 0, y: 0, w: P.doc.w, h: P.doc.h };
    view.style.cursor = { hand: 'grab', zoom: 'zoom-in', eyedropper: 'crosshair', text: 'text', move: 'default' }[t] || 'crosshair';
    if (['brush', 'eraser', 'clone', 'retouch'].includes(t)) view.style.cursor = 'none';
    PU.renderOptions(); PU.redraw(); updateStatus();
  };
  const optRow = (html) => C.h(`<div class="ph-opt">${html}</div>`);
  PU.renderOptions = () => {
    const bar = C.$('#phOpts'); if (!bar) return; bar.innerHTML = '';
    const t = PU.tool, o = PU.opts[t] || {};
    const name = (PU.TOOLS.find((x) => x[0] === t) || [])[3] || '';
    bar.appendChild(C.h(`<div class="ph-optname">${C.icon((PU.TOOLS.find((x) => x[0] === t) || [])[1] || 'move')}<b>${C.esc(name.split(' (')[0])}</b></div>`));
    const range = (key, label, min, max, unit = '') => { const r = optRow(`<label>${label}</label><input type="range" min="${min}" max="${max}" value="${o[key]}"><span class="v">${o[key]}${unit}</span>`); const i = r.querySelector('input'), v = r.querySelector('.v'); C.setRangeFill(i); i.oninput = () => { o[key] = +i.value; v.textContent = i.value + unit; saveOpts(); PU.redraw(); }; bar.appendChild(r); };
    const sel = (key, label, options) => { const r = optRow(`<label>${label}</label><select class="select compact">${options.map(([v, l]) => `<option value="${v}" ${o[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`); r.querySelector('select').onchange = (e) => { o[key] = e.target.value; saveOpts(); }; bar.appendChild(r); };
    const chk = (key, label) => { const r = optRow(`<label class="ph-chk"><input type="checkbox" ${o[key] ? 'checked' : ''}> ${label}</label>`); r.querySelector('input').onchange = (e) => { o[key] = e.target.checked; saveOpts(); }; bar.appendChild(r); };
    const modes = [['new', 'New'], ['add', 'Add (Shift)'], ['subtract', 'Subtract (Alt)'], ['intersect', 'Intersect']];
    if (t === 'brush' || t === 'eraser' || t === 'clone') { range('size', 'Size', 1, 500, 'px'); range('hardness', 'Hardness', 0, 100, '%'); range('opacity', 'Opacity', 1, 100, '%'); range('flow', 'Flow', 1, 100, '%'); }
    if (t === 'clone') bar.appendChild(optRow(`<span class="hint">${cloneSrc ? 'Source set — paint to clone' : 'Alt+click to set the source point'}</span>`));
    if (t === 'retouch') { sel('mode', 'Mode', [['dodge', 'Dodge (lighten)'], ['burn', 'Burn (darken)'], ['blur', 'Blur'], ['sharpen', 'Sharpen'], ['sponge', 'Sponge (desaturate)'], ['saturate', 'Saturate']]); range('size', 'Size', 2, 500, 'px'); range('hardness', 'Hardness', 0, 100, '%'); range('strength', 'Strength', 1, 100, '%'); }
    if (t === 'bucket') { range('tol', 'Tolerance', 0, 255); range('opacity', 'Opacity', 1, 100, '%'); chk('contiguous', 'Contiguous'); chk('all', 'Sample all layers'); }
    if (t === 'wand') { range('tol', 'Tolerance', 0, 255); chk('contiguous', 'Contiguous'); chk('all', 'Sample all layers'); sel('mode', 'Mode', modes); }
    if (t === 'marquee') { sel('shape', 'Shape', [['rect', 'Rectangle'], ['ellipse', 'Ellipse']]); sel('mode', 'Mode', modes); range('feather', 'Feather', 0, 100, 'px'); }
    if (t === 'lasso') { sel('mode', 'Mode', modes); range('feather', 'Feather', 0, 100, 'px'); }
    if (t === 'gradient') { sel('type', 'Type', [['linear', 'Linear'], ['radial', 'Radial']]); sel('mode', 'Colors', [['fgbg', 'Foreground → background'], ['fgtrans', 'Foreground → transparent']]); range('opacity', 'Opacity', 1, 100, '%'); }
    if (t === 'shape') sel('kind', 'Shape', [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['star', 'Star'], ['polygon', 'Polygon'], ['heart', 'Heart'], ['arrow', 'Arrow'], ['line', 'Line']]);
    if (t === 'move') { chk('auto', 'Auto-select layer'); bar.appendChild(optRow('<span class="hint">Drag corners to scale (Shift = free), top handle to rotate · arrow keys nudge</span>')); }
    if (t === 'crop') {
      sel('ratio', 'Ratio', [['free', 'Free'], ['1', '1:1'], ['1.7778', '16:9'], ['0.5625', '9:16'], ['1.3333', '4:3'], ['0.8', '4:5']]);
      const r = optRow(`<button class="btn primary" style="height:28px">${C.icon('check')}<span>Apply crop</span></button><button class="btn" style="height:28px">Reset</button>`);
      r.querySelectorAll('button')[0].onclick = () => PU.applyCrop(); r.querySelectorAll('button')[1].onclick = () => { cropRect = P.doc ? { x: 0, y: 0, w: P.doc.w, h: P.doc.h } : null; PU.redraw(); };
      bar.appendChild(r);
    }
    if (t === 'text') bar.appendChild(optRow('<span class="hint">Click to add text · click existing text to select it · edit in the Properties panel</span>'));
    if (t === 'eyedropper') bar.appendChild(optRow('<span class="hint">Click to pick the foreground color · Alt+click for background</span>'));
    C.fillIcons(bar);
  };
  function updateStatus() {
    const s = C.$('#phStatus'); if (!s) return;
    if (!P.doc) { s.textContent = ''; return; }
    s.innerHTML = `<span>${Math.round(PU.view.z * 100)}%</span><span>${P.doc.w} × ${P.doc.h} px</span>${hover ? `<span>x ${Math.round(hover.x)}  y ${Math.round(hover.y)}</span>` : ''}${P.sel && P.sel.bounds ? `<span>Selection ${Math.round(P.sel.bounds.w)} × ${Math.round(P.sel.bounds.h)}</span>` : ''}<span style="margin-left:auto" class="muted">${C.esc(P.doc.name)}${P.dirty ? ' •' : ''}</span>`;
  }
  PU.updateStatus = updateStatus;

  // ---------- pointer handling ----------
  const selMode = (e, base) => (e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : base);
  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) { const p = docPt(e); PU.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.sx, p.sy); }
    else { PU.view.ox -= e.shiftKey ? e.deltaY : e.deltaX; PU.view.oy -= e.shiftKey ? 0 : e.deltaY; PU.redraw(); }
  }
  function onDown(e) {
    if (!P.doc || e.button === 2) return;
    view.setPointerCapture(e.pointerId);
    const p = docPt(e);
    const tool = space || e.button === 1 ? 'hand' : PU.tool;
    const T = TOOLS[tool]; if (!T) return;
    drag = T(e, p) || null;
    if (!drag) return;
    const mv = (m) => { hover = docPt(m); drag && drag.move && drag.move(m, hover); PU.redraw(); updateStatus(); };
    const up = (u) => { view.removeEventListener('pointermove', mv); view.removeEventListener('pointerup', up); view.removeEventListener('pointercancel', up); const d = drag; drag = null; d && d.up && d.up(u, docPt(u)); PU.redraw(); updateStatus(); };
    view.addEventListener('pointermove', mv); view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  }
  PU.spaceDown = (v) => { space = v; view.style.cursor = v ? 'grab' : ''; };

  const needLayer = (types = ['raster']) => {
    const L = P.active();
    if (!L) return null;
    if (L.locked) { C.toast('This layer is locked', 'info'); return null; }
    if (!L.visible) { C.toast('This layer is hidden', 'info'); return null; }
    return L;
  };

  // hit test layer under a point (topmost)
  function layerAt(p) {
    for (let i = P.doc.layers.length - 1; i >= 0; i--) {
      const L = P.doc.layers[i]; if (!L.visible || L.locked || L.type === 'adjust' || L.type === 'fill') continue;
      const c = P.center(L), a = (-L.rot * Math.PI) / 180; const dx = p.x - c.x, dy = p.y - c.y;
      const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / L.sx, ly = (dx * Math.sin(a) + dy * Math.cos(a)) / L.sy;
      const { w, h } = P.size(L);
      if (Math.abs(lx) > w / 2 || Math.abs(ly) > h / 2) continue;
      if (L.type === 'raster') { const px = Math.floor(lx + w / 2), py = Math.floor(ly + h / 2); try { if (L.canvas.getContext('2d').getImageData(px, py, 1, 1).data[3] < 10) continue; } catch (_) {} }
      return L;
    }
    return null;
  }

  const TOOLS = {
    hand: (e) => { const v0 = Object.assign({}, PU.view), x0 = e.clientX, y0 = e.clientY; view.style.cursor = 'grabbing'; return { move: (m) => { PU.view.ox = v0.ox + m.clientX - x0; PU.view.oy = v0.oy + m.clientY - y0; }, up: () => { view.style.cursor = space ? 'grab' : PU.tool === 'hand' ? 'grab' : ''; } }; },
    zoom: (e, p) => { PU.zoomAt(e.altKey ? 1 / 1.5 : 1.5, p.sx, p.sy); return null; },
    eyedropper: (e, p) => {
      const comp = P._comp || P.composite();
      const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= P.doc.w || y >= P.doc.h) return null;
      const d = comp.getContext('2d').getImageData(x, y, 1, 1).data; const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      if (e.altKey) P.bg = hex; else P.fg = hex; C.emit('photo:colors'); return null;
    },
    move: (e, p) => {
      let L = P.active();
      const h = PU._handles;
      if (h && L && !L.locked) {
        const near = (q) => Math.hypot(q[0] - p.sx, q[1] - p.sy) < 10;
        if (near(h.rot)) {
          const c = P.center(L); const a0 = Math.atan2(p.y - c.y, p.x - c.x), r0 = L.rot; P.begin('Rotate layer');
          return { move: (m, q) => { let r = r0 + ((Math.atan2(q.y - c.y, q.x - c.x) - a0) * 180) / Math.PI; if (m.shiftKey) r = Math.round(r / 15) * 15; L.rot = Math.round(r * 10) / 10; P.changed(); }, up: () => P.commit('Rotate layer') };
        }
        const ci = h.corners.findIndex(near);
        if (ci >= 0) {
          const c = P.center(L); const { w, h: hh } = P.size(L); const a = (-L.rot * Math.PI) / 180; const sx0 = L.sx, sy0 = L.sy; P.begin('Scale layer');
          return { move: (m, q) => {
            const dx = q.x - c.x, dy = q.y - c.y; const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
            let nsx = (lx / (w / 2)) * Math.sign(sx0 || 1) * (ci === 0 || ci === 3 ? -1 : 1), nsy = (ly / (hh / 2)) * Math.sign(sy0 || 1) * (ci < 2 ? -1 : 1);
            if (!m.shiftKey) { const k = Math.max(Math.abs(nsx / sx0), Math.abs(nsy / sy0)); nsx = sx0 * k; nsy = sy0 * k; }
            L.sx = Math.abs(nsx) < 0.01 ? 0.01 : nsx; L.sy = Math.abs(nsy) < 0.01 ? 0.01 : nsy;
            // keep the opposite corner fixed by moving the center
            P.changed();
          }, up: () => P.commit('Scale layer') };
        }
      }
      if (PU.opts.move.auto) { const hit = layerAt(p); if (hit && hit !== L) { P.doc.active = hit.id; L = hit; C.emit('photo:change', { structural: true }); } }
      if (!L || L.locked || L.type === 'adjust' || L.type === 'fill') return null;
      const x0 = L.x, y0 = L.y; P.begin('Move layer'); let moved = false;
      return { move: (m, q) => { moved = true; L.x = Math.round(x0 + q.x - p.x); L.y = Math.round(y0 + q.y - p.y); P.changed(); }, up: () => { if (moved) P.commit('Move layer'); else P._txn = null; } };
    },
    marquee: (e, p) => {
      const o = PU.opts.marquee; const mode = selMode(e, o.mode); let q = p;
      const rect = (m) => { let w = q.x - p.x, h = q.y - p.y; if (m && m.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; } return { x: Math.min(p.x, p.x + w), y: Math.min(p.y, p.y + h), w: Math.abs(w), h: Math.abs(h) }; };
      let last = null;
      return {
        move: (m, qq) => { q = qq; last = m; },
        preview: (c) => { const r = rect(last); const [x1, y1] = toScr(r.x, r.y); c.setLineDash([5, 4]); c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); if (o.shape === 'ellipse') c.ellipse(x1 + (r.w * PU.view.z) / 2, y1 + (r.h * PU.view.z) / 2, (r.w * PU.view.z) / 2, (r.h * PU.view.z) / 2, 0, 0, 6.283); else c.rect(x1, y1, r.w * PU.view.z, r.h * PU.view.z); c.stroke(); c.strokeStyle = '#000'; c.lineDashOffset = 5; c.stroke(); c.setLineDash([]); },
        up: () => { const r = rect(last); if (r.w < 2 || r.h < 2) { if (mode === 'new') P.deselect(); return; } P.selectShape((x) => (o.shape === 'ellipse' ? x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 6.283) : x.rect(r.x, r.y, r.w, r.h)), mode, o.feather); },
      };
    },
    lasso: (e, p) => {
      const o = PU.opts.lasso; const mode = selMode(e, o.mode); const pts = [[p.x, p.y]];
      return {
        move: (m, q) => pts.push([q.x, q.y]),
        preview: (c) => { c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.setLineDash([5, 4]); c.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = toScr(x, y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.stroke(); c.setLineDash([]); },
        up: () => { if (pts.length < 3) { if (mode === 'new') P.deselect(); return; } P.selectShape((x) => { pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); }, mode, o.feather); },
      };
    },
    wand: (e, p) => {
      const o = PU.opts.wand; const L = P.active();
      const src = o.all || !L ? P.composite() : P.renderLayerPixels(L, P.doc.w, P.doc.h);
      const mask = P.floodMask(src, 0, 0, p.x, p.y, o.tol, o.contiguous);
      P.setSelection(mask, selMode(e, o.mode)); PU.redraw(); return null;
    },
    crop: (e, p) => {
      if (!cropRect) cropRect = { x: 0, y: 0, w: P.doc.w, h: P.doc.h };
      const r0 = Object.assign({}, cropRect); const z = PU.view.z; const tol = 10 / z;
      const edges = { l: Math.abs(p.x - r0.x) < tol, r: Math.abs(p.x - (r0.x + r0.w)) < tol, t: Math.abs(p.y - r0.y) < tol, b: Math.abs(p.y - (r0.y + r0.h)) < tol };
      const inside = p.x > r0.x && p.x < r0.x + r0.w && p.y > r0.y && p.y < r0.y + r0.h;
      const ratio = PU.opts.crop.ratio === 'free' ? 0 : +PU.opts.crop.ratio;
      const anyEdge = edges.l || edges.r || edges.t || edges.b;
      return { move: (m, q) => {
        const dx = q.x - p.x, dy = q.y - p.y; let r = Object.assign({}, r0);
        if (anyEdge) { if (edges.l) { r.x = r0.x + dx; r.w = r0.w - dx; } if (edges.r) r.w = r0.w + dx; if (edges.t) { r.y = r0.y + dy; r.h = r0.h - dy; } if (edges.b) r.h = r0.h + dy; }
        else if (inside) { r.x = r0.x + dx; r.y = r0.y + dy; }
        else r = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(dx), h: Math.abs(dy) };
        if (ratio) { r.h = r.w / ratio; }
        if (r.w < 0) { r.x += r.w; r.w = -r.w; } if (r.h < 0) { r.y += r.h; r.h = -r.h; }
        cropRect = r;
      } };
    },
    brush: (e, p) => stroke(e, p, 'brush'), eraser: (e, p) => stroke(e, p, 'eraser'), clone: (e, p) => { if (e.altKey) { cloneSrc = { x: p.x, y: p.y }; PU.renderOptions(); C.toast('Clone source set', 'info', 1200); return null; } if (!cloneSrc) { C.toast('Alt+click to set a clone source first', 'info'); return null; } return stroke(e, p, 'clone'); },
    retouch: (e, p) => stroke(e, p, 'retouch'),
    bucket: (e, p) => {
      const L = needLayer(); if (!L) return null;
      if (L.type !== 'raster') { C.toast('Use a pixel layer for the paint bucket', 'info'); return null; }
      const o = PU.opts.bucket;
      P.begin('Paint bucket'); P.prepPaint(L);
      const mask = o.all ? P.floodMask(P.composite(), 0, 0, p.x, p.y, o.tol, o.contiguous) : P.floodMask(L.canvas, L.x, L.y, p.x, p.y, o.tol, o.contiguous);
      const mx = mask.getContext('2d');
      if (P.sel) { mx.globalCompositeOperation = 'destination-in'; mx.drawImage(P.sel.mask, 0, 0); }
      mx.globalCompositeOperation = 'source-in'; mx.fillStyle = P.fg; mx.fillRect(0, 0, mask.width, mask.height);
      const nc = P.clone(L.canvas); const nx = nc.getContext('2d'); nx.globalAlpha = o.opacity / 100; nx.drawImage(mask, -L.x, -L.y); L.canvas = nc;
      P.commit('Paint bucket'); return null;
    },
    gradient: (e, p) => {
      const L = needLayer(); if (!L) return null;
      if (L.type !== 'raster') { C.toast('Use a pixel layer for gradients', 'info'); return null; }
      let q = p; const o = PU.opts.gradient;
      return {
        move: (m, qq) => { q = qq; },
        preview: (c) => { const [a, b] = toScr(p.x, p.y), [x2, y2] = toScr(q.x, q.y); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(a, b); c.lineTo(x2, y2); c.stroke(); c.fillStyle = P.fg; c.beginPath(); c.arc(a, b, 5, 0, 6.283); c.fill(); c.fillStyle = P.bg; c.beginPath(); c.arc(x2, y2, 5, 0, 6.283); c.fill(); },
        up: () => {
          if (Math.hypot(q.x - p.x, q.y - p.y) < 2) return;
          P.begin('Gradient'); P.prepPaint(L);
          const g = P.mk(P.doc.w, P.doc.h); const gx = g.getContext('2d');
          const gr = o.type === 'radial' ? gx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.hypot(q.x - p.x, q.y - p.y)) : gx.createLinearGradient(p.x, p.y, q.x, q.y);
          gr.addColorStop(0, P.fg); gr.addColorStop(1, o.mode === 'fgtrans' ? P.fg + '00' : P.bg);
          gx.fillStyle = gr; gx.fillRect(0, 0, P.doc.w, P.doc.h);
          if (P.sel) { gx.globalCompositeOperation = 'destination-in'; gx.drawImage(P.sel.mask, 0, 0); }
          const nc = P.clone(L.canvas); const nx = nc.getContext('2d'); nx.globalAlpha = o.opacity / 100; nx.drawImage(g, -L.x, -L.y); L.canvas = nc;
          P.commit('Gradient');
        },
      };
    },
    text: (e, p) => {
      const hit = layerAt(p);
      if (hit && hit.type === 'text') { P.doc.active = hit.id; C.emit('photo:change', { structural: true }); C.emit('photo:focusText'); return null; }
      P.act('Add text', () => P.addText(p.x, p.y, 'Your text'));
      C.emit('photo:focusText'); return null;
    },
    shape: (e, p) => {
      let q = p; const kind = PU.opts.shape.kind; let last = null;
      const box = () => { let w = q.x - p.x, h = q.y - p.y; if (last && last.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; } return { x: p.x + w / 2, y: p.y + h / 2, w: kind === 'line' ? w : Math.abs(w), h: kind === 'line' ? h : Math.abs(h) }; };
      return {
        move: (m, qq) => { q = qq; last = m; },
        preview: (c) => { const b = box(); const [x1, y1] = toScr(b.x - b.w / 2, b.y - b.h / 2); c.strokeStyle = '#19d3c5'; c.setLineDash([4, 3]); c.strokeRect(x1, y1, b.w * PU.view.z, b.h * PU.view.z); c.setLineDash([]); },
        up: () => { const b = box(); if (Math.abs(b.w) < 3 && Math.abs(b.h) < 3) { b.w = b.h = Math.min(P.doc.w, P.doc.h) / 4; } P.act('Add shape', () => P.addShape(kind, b.x, b.y, b.w, b.h)); },
      };
    },
  };

  // ---------- painting strokes ----------
  function stroke(e, p, kind) {
    let L = needLayer(); if (!L) return null;
    const o = PU.opts[kind];
    const onMask = P.ui.editMask === L.id && L.mask;
    if (!onMask && L.type !== 'raster') {
      if (L.type === 'adjust' || L.type === 'fill') { C.toast('Add a mask to paint on this layer, or select a pixel layer', 'info'); return null; }
      C.toast(`${L.type === 'text' ? 'Text' : 'Shape'} layer converted to pixels so you can paint on it`, 'info', 2200);
    }
    P.begin(kind === 'eraser' ? 'Eraser' : kind === 'clone' ? 'Clone stamp' : kind === 'retouch' ? 'Retouch: ' + o.mode : 'Brush');
    if (!onMask) { if (L.type !== 'raster') P.rasterize(L); P.prepPaint(L); }
    const target = onMask ? 'mask' : 'canvas';
    const base = onMask ? L.mask : L.canvas;
    const offX = onMask ? 0 : L.x, offY = onMask ? 0 : L.y;
    const sc = P.mk(base.width, base.height); const sx = sc.getContext('2d');
    let mode = 'paint', color = P.fg;
    if (onMask) {
      const n = parseInt(P.fg.slice(1), 16); const luma = (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
      if (kind === 'eraser' || luma < 0.5) { mode = 'erase'; color = '#000000'; } else color = '#ffffff';
    } else if (kind === 'eraser') { mode = 'erase'; color = '#000000'; }
    let processed = null;
    if (kind === 'retouch') {
      const f = { dodge: 'brightness(1.35)', burn: 'brightness(0.65)', blur: `blur(${Math.max(2, o.size / 12)}px)`, sharpen: 'url(#cr-sharpen) url(#cr-sharpen)', sponge: 'saturate(0.2)', saturate: 'saturate(1.9)' }[o.mode];
      processed = P.mk(base.width, base.height); const px = processed.getContext('2d'); px.filter = f; px.drawImage(base, 0, 0); px.filter = 'none'; mode = 'atop';
    }
    const cloneOff = kind === 'clone' ? { x: cloneSrc.x - p.x, y: cloneSrc.y - p.y } : null;
    const snapshot = kind === 'clone' ? P.clone(P.composite()) : null;
    L._stroke = { cv: sc, opacity: kind === 'retouch' ? o.strength / 100 : o.opacity / 100, mode, target };
    const size = o.size, spacing = Math.max(1, size * 0.12);
    const dabImg = P.dab(size, o.hardness, color);
    const dabTmp = P.mk(dabImg.width, dabImg.height); const dt = dabTmp.getContext('2d');
    let last = { x: p.x, y: p.y };
    const put = (x, y) => {
      const lx = x - offX - dabImg.width / 2, ly = y - offY - dabImg.height / 2;
      sx.globalAlpha = (o.flow ?? 100) / 100;
      if (kind === 'clone' || kind === 'retouch') {
        dt.globalCompositeOperation = 'source-over'; dt.clearRect(0, 0, dabTmp.width, dabTmp.height);
        if (kind === 'clone') dt.drawImage(snapshot, -(x + cloneOff.x - dabImg.width / 2), -(y + cloneOff.y - dabImg.height / 2));
        else dt.drawImage(processed, -lx, -ly);
        dt.globalCompositeOperation = 'destination-in'; dt.drawImage(dabImg, 0, 0);
        sx.drawImage(dabTmp, lx, ly);
      } else sx.drawImage(dabImg, lx, ly);
    };
    put(p.x, p.y);
    const segment = (q) => { const d = Math.hypot(q.x - last.x, q.y - last.y); const n = Math.floor(d / spacing); for (let i = 1; i <= n; i++) put(last.x + ((q.x - last.x) * i) / n, last.y + ((q.y - last.y) * i) / n); if (n) last = { x: last.x + ((q.x - last.x) * n) / n, y: last.y + ((q.y - last.y) * n) / n }; };
    P.changed();
    return {
      move: (m, q) => {
        const evs = m.getCoalescedEvents ? m.getCoalescedEvents() : [m];
        for (const ev of evs) segment(docPt(ev));
        P.changed();
      },
      up: () => {
        const s = L._stroke; delete L._stroke;
        const nc = P.clone(base); const nx = nc.getContext('2d');
        nx.globalAlpha = s.opacity; nx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : s.mode === 'atop' ? 'source-atop' : 'source-over';
        nx.drawImage(P.strokeClipped(s, L), 0, 0);
        if (onMask) L.mask = nc; else L.canvas = nc;
        P.commit();
      },
    };
  }

  // ---------- crop ----------
  PU.applyCrop = () => {
    if (!P.doc || !cropRect) return;
    const r = { x: Math.round(cropRect.x), y: Math.round(cropRect.y), w: Math.max(1, Math.round(cropRect.w)), h: Math.max(1, Math.round(cropRect.h)) };
    if (r.x === 0 && r.y === 0 && r.w === P.doc.w && r.h === P.doc.h) return;
    P.act('Crop', () => {
      for (const L of P.doc.layers) {
        L.x -= r.x; L.y -= r.y;
        if (L.mask) { const m = P.mk(r.w, r.h); m.getContext('2d').drawImage(L.mask, -r.x, -r.y); L.mask = m; }
        if (L.type === 'raster' && L.canvas.width === P.doc.w && L.canvas.height === P.doc.h && L.x === -r.x && L.y === -r.y) { const c = P.mk(r.w, r.h); c.getContext('2d').drawImage(L.canvas, -r.x, -r.y); L.canvas = c; L.x = 0; L.y = 0; }
      }
      P.doc.w = r.w; P.doc.h = r.h;
    });
    P.sel = null; cropRect = { x: 0, y: 0, w: P.doc.w, h: P.doc.h }; PU.fit();
  };
  PU._setCrop = (b) => { cropRect = { x: b.x, y: b.y, w: b.w, h: b.h }; PU.redraw(); };
  PU.cancelCrop = () => { if (P.doc) cropRect = { x: 0, y: 0, w: P.doc.w, h: P.doc.h }; PU.redraw(); };
  PU.cropping = () => PU.tool === 'crop';
})(window.C);
