/* Cutroom — interactive preview overlay (move / scale / rotate on canvas) */
(function (C) {
  const Pv = (C.preview = {});
  let overlay, wrap, scratch;

  Pv.init = () => {
    overlay = C.$('#overlay'); wrap = C.$('#canvasWrap');
    scratch = document.createElement('canvas').getContext('2d');
    C.on('drawn', update); C.on('change', update); C.on('inspectorRendered', update);
    C.on('select', () => { const f = C.UI.focusFx; if (f && !C.selection.has(f.clip)) C.UI.focusFx = null; update(); });
    overlay.addEventListener('pointerdown', onDown);
    overlay.addEventListener('dblclick', (e) => { const c = hit(e); if (c && c.kind === 'text') C.emit('focusText'); });
    overlay.addEventListener('wheel', (e) => {
      const c = activeSelected(); if (!c || c.kind === 'effect') return;
      e.preventDefault();
      const cur = C.kf.value(c, 't.scale', C.UI.playhead - c.start);
      C.begin(); C.setParam(c, 't.scale', C.clamp(cur * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.02, 20)); C.live();
      clearTimeout(Pv._wt); Pv._wt = setTimeout(() => C.commit('Scale'), 300);
    }, { passive: false });
  };

  const dims = () => ({ W: C.project.settings.width, H: C.project.settings.height, dw: wrap.clientWidth, dh: wrap.clientHeight });
  const visibleAt = (c, t) => {
    const tr = C.project.tracks[c.trackId];
    return tr && tr.type === 'video' && !tr.hidden && c.kind !== 'audio' && t >= c.start && t < C.clipEnd(c);
  };
  function activeSelected() {
    const s = C.selectedClips();
    if (s.length !== 1) return null;
    return visibleAt(s[0], C.UI.playhead) ? s[0] : null;
  }

  const evalAt = (c) => C.evalClip(c, C.UI.playhead - c.start);
  function updateFx(c) {
    let fb = overlay.querySelector('.fx-box');
    const f = C.UI.focusFx;
    const e = f && c && f.clip === c.id ? (evalAt(c).effects || []).find((x) => x.id === f.fx) : null;
    const d = e && C.fx.def(e.type);
    const show = d && !C.UI.playing && ((d.region && e.p.area && e.p.area !== 'full') || d.point);
    if (!show) { if (fb) fb.remove(); return; }
    const { W, H, dw } = dims(); const k = dw / W;
    if (!fb) { fb = C.h('<div class="fx-box"><div class="fx-tag"></div></div>'); overlay.appendChild(fb); }
    fb.querySelector('.fx-tag').textContent = d.name;
    fb.dataset.fx = e.id;
    if (d.region && e.p.area !== 'full') {
      fb.className = 'fx-box region' + (e.p.area === 'ellipse' ? ' ellipse' : '');
      Object.assign(fb.style, { left: (e.p.rx - e.p.rw / 2) * W * k + 'px', top: (e.p.ry - e.p.rh / 2) * H * k + 'px', width: e.p.rw * W * k + 'px', height: e.p.rh * H * k + 'px' });
      fb.dataset.h = 'fxmove';
      if (!fb.querySelector('.hnd')) fb.insertAdjacentHTML('beforeend', '<div class="hnd br" data-h="fxsize"></div><div class="hnd tl" data-h="fxsize"></div>');
      fb.querySelectorAll('.fx-rad').forEach((x) => x.remove());
    } else {
      const rad = d.radius ? e.p.radius * Math.max(W, H) * k : 0;
      fb.className = 'fx-box point';
      Object.assign(fb.style, { left: e.p.x * W * k - 12 + 'px', top: e.p.y * H * k - 12 + 'px', width: '24px', height: '24px' });
      fb.dataset.h = 'fxmove';
      fb.querySelectorAll('.hnd').forEach((x) => x.remove());
      let r = fb.querySelector('.fx-rad');
      if (d.radius) {
        if (!r) { r = C.h('<div class="fx-rad"><div class="hnd" data-h="fxrad"></div></div>'); fb.appendChild(r); }
        Object.assign(r.style, { width: rad * 2 + 'px', height: rad * 2 + 'px', left: 12 - rad + 'px', top: 12 - rad + 'px' });
      } else if (r) r.remove();
    }
  }

  function updateMask(c) {
    let mb = overlay.querySelector('.mask-box');
    const f = C.UI.focusMask;
    const ev = f && c && f.clip === c.id ? evalAt(c) : null;
    const m = ev && (ev.masks || []).find((x) => x.id === f.mask);
    if (!m || C.UI.playing || !C.inspector.isTab('mask') || m.type === 'path') { if (mb) mb.remove(); return; }
    const { W, H, dw } = dims(); const k = dw / W;
    const b = C.clipBox(scratch, ev, W, H); const a = (b.rot * Math.PI) / 180;
    const lx = (m.x || 0) * b.w, ly = (m.y || 0) * b.h;
    const cx = b.cx + lx * Math.cos(a) - ly * Math.sin(a), cy = b.cy + lx * Math.sin(a) + ly * Math.cos(a);
    const line = m.type === 'linear' || m.type === 'mirror';
    const w = line ? Math.max(b.w, b.h) * 1.2 : (m.w ?? 0.5) * b.w, h = m.type === 'linear' ? 0 : (m.h ?? 0.5) * b.h;
    if (!mb) { mb = C.h('<div class="mask-box"><div class="hnd br" data-h="msize"></div><div class="rot-line"></div><div class="hnd rot" data-h="mrot"></div></div>'); overlay.appendChild(mb); }
    mb.classList.toggle('ellipse', m.type === 'ellipse'); mb.classList.toggle('line', line);
    Object.assign(mb.style, { left: (cx - w / 2) * k + 'px', top: (cy - h / 2) * k + 'px', width: w * k + 'px', height: Math.max(2, h * k) + 'px', transform: `rotate(${b.rot + (m.rot || 0)}deg)` });
    mb.dataset.h = 'mmove';
    const sz = mb.querySelector('.hnd.br'); sz.style.display = m.type === 'linear' ? 'none' : '';
    PvState.box = b;
  }
  const PvState = {};

  function update() {
    if (!overlay) return;
    const c = activeSelected();
    updateFx(c);
    updateMask(c);
    let box = overlay.querySelector('.sel-box');
    if (!c || C.UI.playing || c.kind === 'effect') { if (box) box.remove(); return; }
    const { W, H, dw } = dims(); const k = dw / W;
    const b = C.clipBox(scratch, evalAt(c), W, H);
    if (!box) {
      box = C.h('<div class="sel-box"><div class="rot-line"></div><div class="hnd rot" data-h="rot"></div><div class="hnd tl" data-h="s"></div><div class="hnd tr" data-h="s"></div><div class="hnd bl" data-h="s"></div><div class="hnd br" data-h="s"></div></div>');
      overlay.appendChild(box);
    }
    Object.assign(box.style, { left: (b.cx - b.w / 2) * k + 'px', top: (b.cy - b.h / 2) * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px', transform: `rotate(${b.rot}deg)` });
  }
  Pv.update = update;

  function toProject(e) {
    const r = wrap.getBoundingClientRect(); const { W, H } = dims();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function hit(e) {
    const p = toProject(e); const { W, H } = dims(); const t = C.UI.playhead;
    for (const tr of C.tracks()) {
      if (tr.type !== 'video' || tr.hidden || tr.locked) continue;
      const st = C.trackStateAt(tr, t); if (!st) continue;
      const c = st.b;
      if (c.kind === 'effect') continue;
      const b = C.clipBox(scratch, evalAt(c), W, H);
      const a = -b.rot * Math.PI / 180;
      const dx = p.x - b.cx, dy = p.y - b.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return c;
    }
    return null;
  }

  function guides(showV, showH) {
    overlay.querySelectorAll('.guide').forEach((g) => g.remove());
    if (showV) overlay.appendChild(C.h('<div class="guide v" style="left:50%"></div>'));
    if (showH) overlay.appendChild(C.h('<div class="guide h" style="top:50%"></div>'));
  }

  function onFxDown(e, handle) {
    const c = activeSelected(); const f = C.UI.focusFx; if (!c || !f) return;
    e.preventDefault(); e.stopPropagation();
    if (C.UI.playing) C.engine.pause();
    const ev = evalAt(c).effects.find((x) => x.id === f.fx); if (!ev) return;
    const { W, H } = dims(); const p0 = toProject(e); const o = Object.assign({}, ev.p);
    const d = C.fx.def(ev.type);
    const set = (k, v) => C.setParam(c, `e.${f.fx}.${k}`, v);
    C.begin(); let moved = false;
    const move = (m) => {
      const p = toProject(m); moved = true;
      const dx = (p.x - p0.x) / W, dy = (p.y - p0.y) / H;
      if (handle === 'fxmove') { if (d.region && o.area && o.area !== 'full') { set('rx', o.rx + dx); set('ry', o.ry + dy); } else { set('x', C.clamp(o.x + dx, 0, 1)); set('y', C.clamp(o.y + dy, 0, 1)); } }
      else if (handle === 'fxsize') { set('rw', C.clamp(Math.abs(p.x / W - o.rx) * 2, 0.02, 1.5)); set('rh', C.clamp(Math.abs(p.y / H - o.ry) * 2, 0.02, 1.5)); }
      else if (handle === 'fxrad') { set('radius', C.clamp(Math.hypot(p.x - o.x * W, p.y - o.y * H) / Math.max(W, H), 0.02, 1)); }
      C.live();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); if (moved) C.commit('Position effect'); else C._txn = null; };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  function onMaskDown(e, handle) {
    const c = activeSelected(); const f = C.UI.focusMask; if (!c || !f) return;
    e.preventDefault(); e.stopPropagation();
    const ev = evalAt(c); const m = (ev.masks || []).find((x) => x.id === f.mask); if (!m) return;
    const { W, H } = dims(); const b = C.clipBox(scratch, ev, W, H); const a = (-b.rot * Math.PI) / 180;
    const toLocal = (p) => { const dx = p.x - b.cx, dy = p.y - b.cy; return [(dx * Math.cos(a) - dy * Math.sin(a)) / b.w, (dx * Math.sin(a) + dy * Math.cos(a)) / b.h]; };
    const p0 = toLocal(toProject(e)); const o = Object.assign({}, m);
    const set = (key, v) => C.setParam(c, `m.${m.id}.${key}`, v);
    C.begin(); let moved = false;
    const mv = (ev2) => {
      moved = true; const p = toLocal(toProject(ev2));
      if (handle === 'mmove') { set('x', o.x + p[0] - p0[0]); set('y', o.y + p[1] - p0[1]); }
      else if (handle === 'msize') { const ra = (-(o.rot || 0) * Math.PI) / 180; const dx = (p[0] - o.x) * b.w, dy = (p[1] - o.y) * b.h; const lx = dx * Math.cos(ra) - dy * Math.sin(ra), ly = dx * Math.sin(ra) + dy * Math.cos(ra); if (m.type !== 'mirror') set('w', C.clamp((Math.abs(lx) * 2) / b.w, 0.02, 3)); set('h', C.clamp((Math.abs(ly) * 2) / b.h, 0.02, 3)); }
      else if (handle === 'mrot') { const ang = (Math.atan2((p[1] - o.y) * b.h, (p[0] - o.x) * b.w) * 180) / Math.PI + 90; let r = ((ang + 540) % 360) - 180; if (ev2.shiftKey) r = Math.round(r / 15) * 15; set('rot', r); }
      C.live();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) C.commit('Edit mask'); else C._txn = null; };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const handle = e.target.dataset && e.target.dataset.h;
    if (handle && handle.startsWith('m')) return onMaskDown(e, handle);
    if (e.target.closest && e.target.closest('.mask-box')) return onMaskDown(e, 'mmove');
    if (handle && handle.startsWith('fx')) return onFxDown(e, handle);
    if (e.target.closest && e.target.closest('.fx-box')) return onFxDown(e, 'fxmove');
    let c = activeSelected();
    if (!handle) {
      const hc = hit(e);
      if (!hc) { C.select([]); return; }
      if (!c || hc.id !== c.id) { C.select([hc.id]); c = hc; }
    }
    if (!c || C.project.tracks[c.trackId].locked || c.kind === 'effect') return;
    e.preventDefault();
    if (C.UI.playing) C.engine.pause();
    const { W, H, dw } = dims(); const k = dw / W;
    const p0 = toProject(e);
    const o = C.deep(evalAt(c).t);
    const cx = o.x * W, cy = o.y * H;
    const d0 = Math.hypot(p0.x - cx, p0.y - cy) || 1;
    const a0 = Math.atan2(p0.y - cy, p0.x - cx);
    let moved = false;
    C.begin();
    const move = (ev) => {
      const p = toProject(ev); moved = true;
      if (handle === 's') {
        C.setParam(c, 't.scale', C.clamp(o.scale * (Math.hypot(p.x - cx, p.y - cy) / d0), 0.02, 20));
      } else if (handle === 'rot') {
        let ang = o.rotation + ((Math.atan2(p.y - cy, p.x - cx) - a0) * 180) / Math.PI;
        ang = ((ang + 540) % 360) - 180;
        if (ev.shiftKey) ang = Math.round(ang / 15) * 15;
        else for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(ang - s) < 3) ang = s;
        C.setParam(c, 't.rotation', Math.round(ang * 10) / 10);
      } else {
        let nx = o.x + (p.x - p0.x) / W, ny = o.y + (p.y - p0.y) / H;
        const th = 8 / k;
        const sv = !ev.shiftKey && Math.abs(nx * W - W / 2) < th, sh = !ev.shiftKey && Math.abs(ny * H - H / 2) < th;
        if (sv) nx = 0.5; if (sh) ny = 0.5;
        guides(sv, sh);
        C.setParam(c, 't.x', nx); C.setParam(c, 't.y', ny);
      }
      C.live();
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      guides(false, false);
      if (moved) C.commit(handle === 's' ? 'Scale' : handle === 'rot' ? 'Rotate' : 'Move on canvas'); else C._txn = null;
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
})(window.C);
