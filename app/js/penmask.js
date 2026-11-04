/* Cutroom — Pen tool masks for video clips (like Premiere Pro) */
(function (C) {
  const PM = (C.penMask = {});
  let svg = null, scratch = null, cursor = null;
  const NS = 'http://www.w3.org/2000/svg';

  PM.init = () => {
    scratch = document.createElement('canvas').getContext('2d');
    svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'pen-svg');
    C.$('#overlay').appendChild(svg);
    ['drawn', 'change', 'select', 'inspectorRendered'].forEach((ev) => C.on(ev, () => PM.render()));
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', (e) => { if (C.UI.penDraw) { cursor = screenPt(e); PM.render(); } });
    svg.addEventListener('dblclick', (e) => { if (C.UI.penDraw) { e.preventDefault(); finish(); } else onDbl(e); });
    document.addEventListener('keydown', (e) => {
      if (!C.UI.penDraw) return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); PM.cancel(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); C.UI.penDraw.pts.pop(); PM.render(); }
    }, true);
  };

  const clipOf = (id) => C.getClip(id);
  const evalAt = (c) => C.evalClip(c, C.UI.playhead - c.start);
  const geom = () => { const W = C.project.settings.width, H = C.project.settings.height, dw = C.$('#canvasWrap').clientWidth; return { W, H, k: dw / W }; };
  const rot = (x, y, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
  // mask-local point -> screen px
  function toScreen(b, m, px, py, k) {
    let [x, y] = m ? rot(px * (m.w ?? 1) * b.w, py * (m.h ?? 1) * b.h, m.rot || 0) : [px * b.w, py * b.h];
    if (m) { x += (m.x || 0) * b.w; y += (m.y || 0) * b.h; }
    const [sx, sy] = rot(x, y, b.rot);
    return [(b.cx + sx) * k, (b.cy + sy) * k];
  }
  // screen event -> mask-local point
  function toLocal(b, m, e) {
    const r = C.$('#canvasWrap').getBoundingClientRect(); const { W, H } = geom();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    let [x, y] = rot(px - b.cx, py - b.cy, -b.rot);
    if (m) { x -= (m.x || 0) * b.w; y -= (m.y || 0) * b.h; [x, y] = rot(x, y, -(m.rot || 0)); return [x / ((m.w ?? 1) * b.w), y / ((m.h ?? 1) * b.h)]; }
    return [x / b.w, y / b.h];
  }
  const screenPt = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  function context() {
    if (C.UI.penDraw) { const c = clipOf(C.UI.penDraw.clip); if (!c) { C.UI.penDraw = null; return null; } return { c, m: null, pts: C.UI.penDraw.pts, drawing: true }; }
    const f = C.UI.focusMask; if (!f || C.UI.playing || !C.inspector.isTab('mask')) return null;
    const c = clipOf(f.clip); if (!c || !C.selection.has(c.id)) return null;
    const m = (c.masks || []).find((x) => x.id === f.mask && x.type === 'path'); if (!m) return null;
    if (C.UI.playhead < c.start || C.UI.playhead >= C.clipEnd(c)) return null;
    return { c, m, pts: m.pts, drawing: false };
  }

  PM.render = () => {
    if (!svg) return;
    const ctx = context();
    svg.classList.toggle('active', !!ctx);
    svg.classList.toggle('drawing', !!(ctx && ctx.drawing));
    if (!ctx) { svg.innerHTML = ''; return; }
    const { c, pts, drawing } = ctx; const ev = evalAt(c); const { W, H, k } = geom();
    const b = C.clipBox(scratch, ev, W, H);
    const m = drawing ? null : (ev.masks || []).find((x) => x.id === ctx.m.id);
    const S = (p, dx = 0, dy = 0) => toScreen(b, m, p.x + dx, p.y + dy, k);
    let d = '';
    if (pts.length) {
      const [x0, y0] = S(pts[0]); d = `M${x0},${y0}`;
      const n = pts.length, segs = drawing ? n - 1 : n;
      for (let i = 0; i < segs; i++) { const a = pts[i], bb = pts[(i + 1) % n]; const [c1x, c1y] = S(a, a.ox || 0, a.oy || 0), [c2x, c2y] = S(bb, bb.ix || 0, bb.iy || 0), [ex, ey] = S(bb); d += ` C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`; }
      if (!drawing) d += ' Z';
      else if (cursor) { const last = pts[n - 1]; const [c1x, c1y] = S(last, last.ox || 0, last.oy || 0); d += ` C${c1x},${c1y} ${cursor[0]},${cursor[1]} ${cursor[0]},${cursor[1]}`; }
    }
    let html = `<path d="${d}" class="pen-path ${drawing ? 'open' : ''}"/>`;
    pts.forEach((p, i) => {
      const [px, py] = S(p);
      for (const h of ['i', 'o']) { const hx = p[h + 'x'] || 0, hy = p[h + 'y'] || 0; if (!hx && !hy) continue; const [qx, qy] = S(p, hx, hy); html += `<line x1="${px}" y1="${py}" x2="${qx}" y2="${qy}" class="pen-hl"/><circle cx="${qx}" cy="${qy}" r="5" class="pen-h" data-i="${i}" data-h="${h}"/>`; }
      html += `<rect x="${px - 5}" y="${py - 5}" width="10" height="10" class="pen-pt ${i === 0 && drawing && pts.length > 2 ? 'first' : ''}" data-i="${i}"/>`;
    });
    if (drawing) html += `<text x="12" y="22" class="pen-tip">Pen: click to add points · drag for curves · click the first point or press Enter to close · Esc cancels</text>`;
    svg.innerHTML = html;
  };

  PM.start = (c) => {
    if (C.UI.playhead < c.start || C.UI.playhead >= C.clipEnd(c)) C.engine.seek(c.start + Math.min(0.5, c.duration / 2));
    C.engine.pause(); C.select([c.id]);
    C.UI.penDraw = { clip: c.id, pts: [] }; C.UI.focusMask = null; cursor = null;
    PM.render();
  };
  PM.cancel = () => { C.UI.penDraw = null; PM.render(); };
  function finish() {
    const st = C.UI.penDraw; if (!st) return;
    if (st.pts.length < 3) { C.toast('Add at least 3 points for a mask', 'info'); return; }
    const c = clipOf(st.clip); const pts = st.pts; C.UI.penDraw = null;
    const id = C.uid('m_');
    C.act('Pen mask', () => { c.masks = c.masks || []; c.masks.push({ id, type: 'path', pts, x: 0, y: 0, w: 1, h: 1, rot: 0, feather: 3, invert: false, mode: 'add', on: true }); });
    C.UI.focusMask = { clip: c.id, mask: id };
    C.emit('inspectTab', 'mask'); PM.render();
  }

  function onDown(e) {
    const ctx = context(); if (!ctx) return;
    e.preventDefault(); e.stopPropagation();
    const { c } = ctx; const ev = evalAt(c); const { W, H } = geom(); const b = C.clipBox(scratch, ev, W, H);
    if (ctx.drawing) {
      const pts = ctx.pts;
      const t = e.target;
      if (t.classList.contains('pen-pt') && +t.dataset.i === 0 && pts.length > 2) { finish(); return; }
      const [x, y] = toLocal(b, null, e);
      const p = { x, y, ix: 0, iy: 0, ox: 0, oy: 0 }; pts.push(p); PM.render();
      const mv = (m) => { const [mx, my] = toLocal(b, null, m); p.ox = mx - x; p.oy = my - y; p.ix = -p.ox; p.iy = -p.oy; PM.render(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
      return;
    }
    // editing an existing pen mask
    const real = (c.masks || []).find((x) => x.id === ctx.m.id); const em = (ev.masks || []).find((x) => x.id === ctx.m.id);
    const t = e.target; const i = t.dataset.i != null ? +t.dataset.i : -1;
    if (i < 0) return;
    const p = real.pts[i];
    if (t.classList.contains('pen-pt') && e.altKey) { C.act('Toggle corner', () => { if (p.ix || p.iy || p.ox || p.oy) { p.ix = p.iy = p.ox = p.oy = 0; } else { const a = real.pts[(i - 1 + real.pts.length) % real.pts.length], bb = real.pts[(i + 1) % real.pts.length]; const dx = (bb.x - a.x) / 6, dy = (bb.y - a.y) / 6; p.ox = dx; p.oy = dy; p.ix = -dx; p.iy = -dy; } }); return; }
    C.begin(); let moved = false;
    const h = t.dataset.h;
    const o = Object.assign({}, p); const [sx, sy] = toLocal(b, em, e);
    const mv = (m) => {
      moved = true; const [mx, my] = toLocal(b, em, m);
      if (!h) { p.x = o.x + mx - sx; p.y = o.y + my - sy; }
      else { const kx = mx - p.x, ky = my - p.y; p[h + 'x'] = kx; p[h + 'y'] = ky; if (!m.altKey) { const oh = h === 'i' ? 'o' : 'i'; const len = Math.hypot(o[oh + 'x'] || 0, o[oh + 'y'] || 0) || Math.hypot(kx, ky); const l2 = Math.hypot(kx, ky) || 1; p[oh + 'x'] = (-kx / l2) * len; p[oh + 'y'] = (-ky / l2) * len; } }
      C.live(); PM.render();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) C.commit('Edit pen mask'); else C._txn = null; };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function onDbl(e) {
    const ctx = context(); if (!ctx || ctx.drawing) return;
    const t = e.target; if (!t.classList.contains('pen-pt')) return;
    const real = (ctx.c.masks || []).find((x) => x.id === ctx.m.id); if (real.pts.length <= 3) return C.toast('A mask needs at least 3 points', 'info');
    C.act('Delete point', () => real.pts.splice(+t.dataset.i, 1));
  }
})(window.C);
