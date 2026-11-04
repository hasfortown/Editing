/* Cutroom — interactive preview overlay (move / scale / rotate on canvas) */
(function (C) {
  const Pv = (C.preview = {});
  let overlay, wrap, scratch;

  Pv.init = () => {
    overlay = C.$('#overlay'); wrap = C.$('#canvasWrap');
    scratch = document.createElement('canvas').getContext('2d');
    C.on('drawn', update); C.on('select', update); C.on('change', update);
    overlay.addEventListener('pointerdown', onDown);
    overlay.addEventListener('dblclick', (e) => { const c = hit(e); if (c && c.kind === 'text') C.emit('focusText'); });
    overlay.addEventListener('wheel', (e) => {
      const c = activeSelected(); if (!c) return;
      e.preventDefault();
      C.begin(); c.t.scale = C.clamp(c.t.scale * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.02, 20); C.live();
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

  function update() {
    if (!overlay) return;
    const c = activeSelected();
    let box = overlay.querySelector('.sel-box');
    if (!c || C.UI.playing) { if (box) box.remove(); return; }
    const { W, H, dw } = dims(); const k = dw / W;
    const b = C.clipBox(scratch, c, W, H);
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
      const b = C.clipBox(scratch, c, W, H);
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

  function onDown(e) {
    if (e.button !== 0) return;
    const handle = e.target.dataset && e.target.dataset.h;
    let c = activeSelected();
    if (!handle) {
      const hc = hit(e);
      if (!hc) { C.select([]); return; }
      if (!c || hc.id !== c.id) { C.select([hc.id]); c = hc; }
    }
    if (!c || C.project.tracks[c.trackId].locked) return;
    e.preventDefault();
    if (C.UI.playing) C.engine.pause();
    const { W, H, dw } = dims(); const k = dw / W;
    const p0 = toProject(e);
    const o = C.deep(c.t);
    const cx = o.x * W, cy = o.y * H;
    const d0 = Math.hypot(p0.x - cx, p0.y - cy) || 1;
    const a0 = Math.atan2(p0.y - cy, p0.x - cx);
    let moved = false;
    C.begin();
    const move = (ev) => {
      const p = toProject(ev); moved = true;
      if (handle === 's') {
        c.t.scale = C.clamp(o.scale * (Math.hypot(p.x - cx, p.y - cy) / d0), 0.02, 20);
      } else if (handle === 'rot') {
        let ang = o.rotation + ((Math.atan2(p.y - cy, p.x - cx) - a0) * 180) / Math.PI;
        ang = ((ang + 540) % 360) - 180;
        if (ev.shiftKey) ang = Math.round(ang / 15) * 15;
        else for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(ang - s) < 3) ang = s;
        c.t.rotation = Math.round(ang * 10) / 10;
      } else {
        let nx = o.x + (p.x - p0.x) / W, ny = o.y + (p.y - p0.y) / H;
        const th = 8 / k;
        const sv = !ev.shiftKey && Math.abs(nx * W - W / 2) < th, sh = !ev.shiftKey && Math.abs(ny * H - H / 2) < th;
        if (sv) nx = 0.5; if (sh) ny = 0.5;
        guides(sv, sh);
        c.t.x = nx; c.t.y = ny;
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
