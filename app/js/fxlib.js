/* Cutroom — library previews: animated transition cards, live effect cards, try-on in the player */
(function (C) {
  const FL = (C.fxlib = {});
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- sample pictures for previews ----------
  let sampleB = null;
  function genB() {
    if (sampleB) return sampleB;
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, '#0b1d3a'); g.addColorStop(0.6, '#1d6b8f'); g.addColorStop(1, '#e8c07d'); x.fillStyle = g; x.fillRect(0, 0, 320, 180);
    x.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 40; i++) { x.globalAlpha = 0.3 + ((i * 37) % 10) / 14; x.fillRect((i * 83) % 320, (i * 29) % 70, 1.5, 1.5); } x.globalAlpha = 1;
    x.fillStyle = '#f4f1e8'; x.beginPath(); x.arc(80, 50, 18, 0, 6.283); x.fill();
    x.fillStyle = '#0d2236'; for (let i = 0; i < 9; i++) { const w = 24 + ((i * 13) % 20), h = 40 + ((i * 47) % 70); x.fillRect(150 + i * 19, 180 - h, w, h); }
    x.fillStyle = '#ffd36b'; for (let i = 0; i < 60; i++) x.fillRect(154 + ((i * 23) % 170), 120 + ((i * 17) % 55), 3, 4);
    x.fillStyle = '#e8c07d'; x.fillRect(0, 168, 150, 12);
    sampleB = c; return c;
  }
  FL.pair = () => {
    const thumbs = Object.values(C.project.media).map((m) => C.MR[m.id] && C.MR[m.id].thumbs && C.MR[m.id].thumbs[0] && C.MR[m.id].thumbs[0].img).filter(Boolean);
    const A = thumbs[0] || C.fx.sampleImage();
    const B = thumbs[1] || genB();
    return [A, B];
  };

  // ---------- draw a transition between two pictures ----------
  function drawImg(g, img, o, W, H) {
    const alpha = o.alpha ?? 1; if (alpha <= 0.002) return;
    const iw = img.width || img.naturalWidth || 1, ih = img.height || img.naturalHeight || 1; const k = Math.max(W / iw, H / ih); const dw = iw * k, dh = ih * k;
    g.save(); g.globalAlpha *= alpha;
    if (o.clipFn) { g.beginPath(); o.clipFn(g); g.clip(); }
    const f = [o.blur ? `blur(${(o.blur * W) / 1920}px)` : '', o.filter || ''].join(' ').trim(); if (f) g.filter = f;
    const sc = o.scale ?? 1, rot = o.rot || 0, sx = o.sx ?? 1, sy = o.sy ?? 1;
    if (o.g3) {
      const q = o.g3, d = 1.6 * Math.max(W, H);
      const map = (u, v) => { let p = [(u - 0.5) * dw * sc * sx, (v - 0.5) * dh * sc * sy, 0]; p = C.geo.rot3(p, q.rx || 0, q.ry || 0, rot); p[0] += (q.tx || 0) + (o.dx || 0); p[1] += (q.ty || 0) + (o.dy || 0); p[2] += q.tz || 0; return C.geo.project(p, W / 2, H / 2, d); };
      C.geo.drawMesh(g, img, iw, ih, 8, 8, map);
    } else {
      g.translate(W / 2 + (o.dx || 0), H / 2 + (o.dy || 0)); if (rot) g.rotate((rot * Math.PI) / 180); g.scale(sc * sx, sc * sy);
      g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    }
    g.restore();
  }
  const pool = {};
  const off = (name, w, h) => { let c = pool[name]; if (!c) c = pool[name] = document.createElement('canvas'); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, w, h); return x; };
  FL.drawTransition = (ctx, type, raw, W, H, imgA, imgB) => {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const S = { p: C.ease.inOut(raw), raw, ctx, W, H, tr: { type, p: raw },
      A: (o = {}, g = ctx) => drawImg(g, imgA, o, W, H), B: (o = {}, g = ctx) => drawImg(g, imgB, o, W, H), off: (n, w = W, h = H) => off('p_' + n, w, h) };
    try { (C.TR_DRAW[type] || C.TR_DRAW.dissolve)(S); } catch (e) { console.warn('transition preview', type, e); }
    ctx.restore();
  };

  // ---------- one animated loop shared by every hovered card ----------
  const active = new Set(); let raf = 0;
  const loop = (now) => { raf = 0; for (const fn of active) fn(now); if (active.size) raf = requestAnimationFrame(loop); };
  const start = (fn) => { active.add(fn); if (!raf) raf = requestAnimationFrame(loop); };
  const stop = (fn) => active.delete(fn);

  // transition card (canvas, static midpoint, animates on hover)
  FL.transitionCard = (t) => {
    const card = C.h(`<div class="card tr-card" draggable="true" data-tr="${t.id}"><div class="card-art"><canvas width="192" height="108"></canvas><span class="card-play">${C.icon('play')}</span></div><div class="card-label">${C.esc(t.name)}</div></div>`);
    const cv = card.querySelector('canvas'); const x = cv.getContext('2d');
    const paint = (p) => { const [A, B] = FL.pair(); FL.drawTransition(x, t.id, p, cv.width, cv.height, A, B); };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); requestAnimationFrame(() => paint(0.45)); } });
    io.observe(card);
    let t0 = 0; const fn = (now) => { const cyc = 1.9; const s = ((now - t0) / 1000) % cyc; paint(C.clamp((s - 0.3) / 1.2, 0, 1)); };
    card.addEventListener('mouseenter', () => { if (reduce()) return; t0 = performance.now(); start(fn); card.classList.add('playing'); });
    card.addEventListener('mouseleave', () => { stop(fn); card.classList.remove('playing'); paint(0.45); });
    return card;
  };

  // effect card hover: live canvas over the cached thumbnail + try-on in the player
  FL.effectHover = (card, effects) => {
    const art = card.querySelector('.card-art'); let cv = null, t0 = 0, tryTimer = null;
    const fn = (now) => { const t = (now - t0) / 1000 + 0.3; C.fx.thumbDraw(cv.getContext('2d'), effects, cv.width, cv.height, t); };
    card.addEventListener('mouseenter', () => {
      if (!reduce()) { if (!cv) { cv = document.createElement('canvas'); cv.width = 192; cv.height = 108; cv.className = 'card-live'; art.appendChild(cv); } t0 = performance.now(); start(fn); card.classList.add('playing'); }
      clearTimeout(tryTimer); tryTimer = setTimeout(() => FL.tryOn(effects, card), 260);
    });
    card.addEventListener('mouseleave', () => { clearTimeout(tryTimer); stop(fn); card.classList.remove('playing'); FL.tryOff(); });
    card.addEventListener('click', () => { clearTimeout(tryTimer); FL.tryOff(); });
  };

  // ---------- try-on: preview an effect on the real footage before applying it ----------
  let tryRaf = 0, badge = null;
  FL.tryOn = (effects, card) => {
    if (C.UI.playing || C.mode !== 'video') return;
    const sel = C.selectedClips().filter((c) => c.kind !== 'audio' && c.kind !== 'effect');
    const t = C.UI.playhead;
    const under = sel.length ? null : C.tracks().filter((x) => x.type === 'video' && !x.hidden).map((tr) => C.trackStateAt(tr, t)).find((s) => s && s.b.kind !== 'effect');
    if (!sel.length && !under) return;
    const target = sel[0] || null;
    C.UI.tryFx = { clip: target ? target.id : null, global: !target, effects, clock: 0, t0: performance.now() };
    if (!badge) { badge = C.h('<div class="try-badge"></div>'); (C.$('#canvasWrap') || document.body).appendChild(badge); }
    const name = card && card.querySelector('.card-label') ? card.querySelector('.card-label').textContent : 'Effect';
    badge.innerHTML = `${C.icon('eye')}<span>Previewing <b>${C.esc(name)}</b> · click to apply${target ? '' : ' as an effect layer'}</span>`;
    requestAnimationFrame(() => badge && badge.classList.add('show'));
    const tick = () => { if (!C.UI.tryFx) return; C.UI.tryFx.clock = (performance.now() - C.UI.tryFx.t0) / 1000; C.engine.draw(); tryRaf = requestAnimationFrame(tick); };
    cancelAnimationFrame(tryRaf); tryRaf = requestAnimationFrame(tick);
  };
  FL.tryOff = () => {
    cancelAnimationFrame(tryRaf); tryRaf = 0;
    if (badge) badge.classList.remove('show');
    if (C.UI.tryFx) { C.UI.tryFx = null; C.engine.draw(); }
  };
})(window.C);
