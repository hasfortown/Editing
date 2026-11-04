/* Cutroom — transition library: drawing functions (shared by the compositor and the library previews) */
(function (C) {
  // S = { p (eased 0..1), raw (linear), A(o, g?), B(o, g?), ctx, W, H, off(name) -> clean offscreen ctx, fx(cv, effects), tr }
  const ease = {
    out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t,
    back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
  };
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // a noise field for "luma"/dissolve style transitions (cached per size)
  let noise = null;
  const noiseCanvas = (W, H) => {
    const w = 96, h = Math.max(8, Math.round((96 * H) / W));
    if (noise && noise.width === w && noise.height === h) return noise;
    noise = document.createElement('canvas'); noise.width = w; noise.height = h; const x = noise.getContext('2d'); const id = x.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { let v = 0, a = 1, f = 1, s = 0; for (let o = 0; o < 4; o++) { v += a * (Math.sin(i * 0.11 * f + o * 3.1) * Math.cos(y * 0.13 * f + o * 1.7) * 0.5 + 0.5); s += a; a *= 0.5; f *= 2.1; } v = v / s * 0.75 + rnd(y * w + i) * 0.25; const k = (y * w + i) * 4; id.data[k] = id.data[k + 1] = id.data[k + 2] = v * 255; id.data[k + 3] = 255; }
    x.putImageData(id, 0, 0); return noise;
  };
  // draw B through a mask built by fn(maskCtx) (white = B visible)
  const maskB = (S, fn, softness = 0) => {
    const { W, H } = S; const g = S.off('trB'); S.B({}, g);
    const m = S.off('trM'); m.save(); if (softness) m.filter = `blur(${softness}px)`; m.fillStyle = '#fff'; fn(m); m.restore();
    g.globalCompositeOperation = 'destination-in'; g.drawImage(m.canvas, 0, 0); g.globalCompositeOperation = 'source-over';
    S.ctx.drawImage(g.canvas, 0, 0, W, H);
  };
  const shapePath = (x, kind, cx, cy, r) => {
    x.beginPath();
    if (kind === 'diamond') { x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath(); }
    else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; i ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); }
    else if (kind === 'heart') { const s = r / 1.1; x.moveTo(cx, cy + s * 0.9); x.bezierCurveTo(cx - s * 1.3, cy + s * 0.1, cx - s * 0.7, cy - s * 1.1, cx, cy - s * 0.45); x.bezierCurveTo(cx + s * 0.7, cy - s * 1.1, cx + s * 1.3, cy + s * 0.1, cx, cy + s * 0.9); x.closePath(); }
    else x.arc(cx, cy, Math.max(0.1, r), 0, Math.PI * 2);
  };
  const shapeIn = (kind) => (S) => { const { W, H, p } = S; S.A(); const R = Math.hypot(W, H) * (kind === 'circle' ? 0.5 : kind === 'diamond' ? 0.72 : 0.95); S.B({ clipFn: (cx) => { shapePath(cx, kind, W / 2, H / 2, p * R); } }); };
  const flashOver = (S, col, peak = 0.5, k = 1) => { const { ctx, W, H, raw } = S; const a = Math.max(0, 1 - Math.abs(raw - peak) / 0.5) ** 1.5 * k; if (a <= 0) return; ctx.save(); ctx.globalCompositeOperation = col === '#000' ? 'source-over' : 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); };
  const crossAt = (S, mid = 0.5) => { const { p } = S; if (p < mid) S.A(); else S.B(); };

  C.TR_DRAW = {
    // ----- basic -----
    dissolve: (S) => { S.A(); S.B({ alpha: S.p }); },
    fadeblack: (S) => { const { p, ctx, W, H } = S; const col = S.tr.type === 'fadeblack' ? '#000' : '#fff'; if (p < 0.5) { S.A(); ctx.save(); ctx.globalAlpha = p * 2; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); } else { S.B(); ctx.save(); ctx.globalAlpha = (1 - p) * 2; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); } },
    fadewhite: (S) => C.TR_DRAW.fadeblack(S),
    flash: (S) => { crossAt(S); flashOver(S, '#fff', 0.5, 1.1); },
    overexpose: (S) => { const { p } = S; const b = 1 + Math.sin(p * Math.PI) * 2.2; if (p < 0.5) S.A({ filter: `brightness(${b}) saturate(${1 + (b - 1) * 0.3})` }); else S.B({ filter: `brightness(${b})` }); },
    filmBurn: (S) => {
      const { ctx, W, H, raw } = S; S.A(); S.B({ alpha: C.clamp((raw - 0.35) / 0.4, 0, 1) });
      const a = Math.sin(raw * Math.PI); if (a < 0.02) return;
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(W * (0.2 + raw * 0.6), H * 0.4, 0, W * (0.2 + raw * 0.6), H * 0.4, Math.max(W, H) * (0.3 + a * 0.7));
      g.addColorStop(0, '#fff6d8'); g.addColorStop(0.35, '#ffb347'); g.addColorStop(0.7, 'rgba(230,60,20,.75)'); g.addColorStop(1, 'rgba(120,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    },
    lightLeak: (S) => {
      const { ctx, W, H, raw } = S; S.A(); S.B({ alpha: S.p });
      const a = Math.sin(raw * Math.PI) * 0.9; ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(W * (raw - 0.3), 0, W * (raw + 0.6), H); g.addColorStop(0, 'rgba(255,90,40,0)'); g.addColorStop(0.4, 'rgba(255,120,60,.9)'); g.addColorStop(0.6, 'rgba(255,220,140,.9)'); g.addColorStop(1, 'rgba(255,60,120,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    },
    // ----- slide & push -----
    slideLeft: (S) => { S.A(); S.B({ dx: (1 - S.p) * S.W }); },
    slideRight: (S) => { S.A(); S.B({ dx: -(1 - S.p) * S.W }); },
    slideUp: (S) => { S.A(); S.B({ dy: (1 - S.p) * S.H }); },
    slideDown: (S) => { S.A(); S.B({ dy: -(1 - S.p) * S.H }); },
    push: (S) => { S.A({ dx: -S.p * S.W }); S.B({ dx: (1 - S.p) * S.W }); },
    pushRight: (S) => { S.A({ dx: S.p * S.W }); S.B({ dx: -(1 - S.p) * S.W }); },
    pushUp: (S) => { S.A({ dy: -S.p * S.H }); S.B({ dy: (1 - S.p) * S.H }); },
    pushDown: (S) => { S.A({ dy: S.p * S.H }); S.B({ dy: -(1 - S.p) * S.H }); },
    whipLeft: (S) => { const { raw, W } = S; const p = ease.in(raw) * 0.5 + (raw > 0.5 ? ease.out((raw - 0.5) * 2) * 0.5 : 0); const bl = Math.sin(raw * Math.PI) * W * 0.03; S.A({ dx: -p * W, blur: bl }); S.B({ dx: (1 - p) * W, blur: bl }); },
    whipRight: (S) => { const { raw, W } = S; const p = ease.in(raw) * 0.5 + (raw > 0.5 ? ease.out((raw - 0.5) * 2) * 0.5 : 0); const bl = Math.sin(raw * Math.PI) * W * 0.03; S.A({ dx: p * W, blur: bl }); S.B({ dx: -(1 - p) * W, blur: bl }); },
    whipUp: (S) => { const { raw, H, W } = S; const p = ease.in(raw) * 0.5 + (raw > 0.5 ? ease.out((raw - 0.5) * 2) * 0.5 : 0); const bl = Math.sin(raw * Math.PI) * W * 0.03; S.A({ dy: -p * H, blur: bl }); S.B({ dy: (1 - p) * H, blur: bl }); },
    squeeze: (S) => { const { p } = S; if (p < 0.5) S.A({ sx: Math.max(0.001, 1 - p * 2) }); else S.B({ sx: Math.max(0.001, (p - 0.5) * 2) }); },
    stretch: (S) => { const { p } = S; S.A({ sy: 1 + p * 1.5, alpha: 1 - p }); S.B({ sy: Math.max(0.001, p), alpha: Math.min(1, p * 1.6) }); },
    bounceIn: (S) => { const { raw, H } = S; S.A(); S.B({ dy: -(1 - ease.bounce(raw)) * H }); },
    split: (S) => { const { W, H, p } = S; S.B(); S.A({ dx: -p * W / 2, clipFn: (cx) => cx.rect(-W, 0, W * 1.5 - p * W / 2, H) }); S.A({ dx: p * W / 2, clipFn: (cx) => cx.rect(W / 2 + (p * W) / 2, 0, W * 2, H) }); },
    splitV: (S) => { const { W, H, p } = S; S.B(); S.A({ dy: -p * H / 2, clipFn: (cx) => cx.rect(0, -H, W, H * 1.5 - p * H / 2) }); S.A({ dy: p * H / 2, clipFn: (cx) => cx.rect(0, H / 2 + (p * H) / 2, W, H * 2) }); },
    // ----- wipes & shapes -----
    wipeLeft: (S) => { S.A(); S.B({ clipFn: (cx) => cx.rect(0, 0, S.p * S.W, S.H) }); },
    wipeRight: (S) => { S.A(); S.B({ clipFn: (cx) => cx.rect(S.W - S.p * S.W, 0, S.p * S.W, S.H) }); },
    wipeUp: (S) => { S.A(); S.B({ clipFn: (cx) => cx.rect(0, S.H - S.p * S.H, S.W, S.p * S.H) }); },
    wipeDown: (S) => { S.A(); S.B({ clipFn: (cx) => cx.rect(0, 0, S.W, S.p * S.H) }); },
    softWipe: (S) => { const { W, H, p } = S; S.A(); maskB(S, (m) => { const e = W * 0.25; const g = m.createLinearGradient(p * (W + e) - e, 0, p * (W + e), 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); m.fillStyle = g; m.fillRect(0, 0, W, H); }); },
    diagonal: (S) => { const { W, H, p } = S; S.A(); const d = (W + H) * p; S.B({ clipFn: (cx) => { cx.moveTo(0, 0); cx.lineTo(Math.min(d, W), 0); if (d > W) cx.lineTo(W, d - W); cx.lineTo(Math.max(0, d - H), Math.min(d, H)); if (d < H) cx.lineTo(0, d); else cx.lineTo(0, H); cx.closePath(); } }); },
    clock: (S) => { const { W, H, p } = S; S.A(); const r = Math.hypot(W, H); S.B({ clipFn: (cx) => { cx.moveTo(W / 2, H / 2); cx.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); cx.closePath(); } }); },
    circle: shapeIn('circle'), diamond: shapeIn('diamond'), star: shapeIn('star'), heart: shapeIn('heart'),
    circleOut: (S) => { const { W, H, p } = S; S.B(); const R = Math.hypot(W, H) / 2; S.A({ clipFn: (cx) => cx.arc(W / 2, H / 2, Math.max(0.1, (1 - p) * R), 0, Math.PI * 2) }); },
    doors: (S) => { S.A(); S.B({ clipFn: (cx) => cx.rect(S.W / 2 - (S.p * S.W) / 2, 0, S.p * S.W, S.H) }); },
    barnV: (S) => { S.A(); S.B({ clipFn: (cx) => cx.rect(0, S.H / 2 - (S.p * S.H) / 2, S.W, S.p * S.H) }); },
    blinds: (S) => { const { W, H, p } = S; S.A(); const n = 8, h = H / n; S.B({ clipFn: (cx) => { for (let i = 0; i < n; i++) cx.rect(0, i * h, W, h * C.clamp(p * 1.4 - (i / n) * 0.4, 0, 1) + 0.5); } }); },
    vblinds: (S) => { const { W, H, p } = S; S.A(); const n = 10, w = W / n; S.B({ clipFn: (cx) => { for (let i = 0; i < n; i++) cx.rect(i * w, 0, w * C.clamp(p * 1.4 - (i / n) * 0.4, 0, 1) + 0.5, H); } }); },
    checker: (S) => { const { W, H, p } = S; S.A(); const n = 8, s = W / n, rows = Math.ceil(H / s); S.B({ clipFn: (cx) => { for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) { const d = rnd(j * 31 + i * 7); const k = C.clamp((p - d * 0.6) / 0.4, 0, 1); if (k > 0) { const z = s * k; cx.rect(i * s + (s - z) / 2, j * s + (s - z) / 2, z + 0.5, z + 0.5); } } } }); },
    // ----- zoom & spin -----
    zoom: (S) => { const { p } = S; S.A({ scale: 1 + p * 0.6, alpha: 1 - p }); S.B({ scale: 0.6 + 0.4 * p, alpha: p }); },
    zoomIn: (S) => { const { raw, W } = S; const bl = Math.sin(raw * Math.PI) * W * 0.012; if (raw < 0.5) S.A({ scale: 1 + ease.in(raw * 2) * 1.6, blur: bl }); else S.B({ scale: 0.4 + ease.out((raw - 0.5) * 2) * 0.6, blur: bl }); flashOver(S, '#fff', 0.5, 0.35); },
    zoomOut: (S) => { const { raw, W } = S; const bl = Math.sin(raw * Math.PI) * W * 0.012; if (raw < 0.5) S.A({ scale: Math.max(0.01, 1 - ease.in(raw * 2) * 0.7), blur: bl }); else S.B({ scale: 2.2 - ease.out((raw - 0.5) * 2) * 1.2, blur: bl }); },
    spin: (S) => { S.A(); S.B({ rot: (1 - S.p) * -180, scale: Math.max(0.01, S.p) }); },
    spinBlur: (S) => { const { raw, W } = S; const bl = Math.sin(raw * Math.PI) * W * 0.02; if (raw < 0.5) S.A({ rot: ease.in(raw * 2) * 180, scale: 1 + raw * 0.6, blur: bl }); else S.B({ rot: -(1 - ease.out((raw - 0.5) * 2)) * 180, scale: 1.3 - (raw - 0.5) * 0.6, blur: bl }); },
    rotateZoom: (S) => { const { p } = S; S.A({ rot: p * 45, scale: 1 + p * 1.5, alpha: 1 - p }); S.B({ rot: -(1 - p) * 45, scale: 0.5 + p * 0.5, alpha: p }); },
    blur: (S) => { const { p } = S; S.A({ blur: p * 60, alpha: 1 - p * 0.5 }); S.B({ blur: (1 - p) * 60, alpha: p }); },
    shake: (S) => { const { raw, W, H } = S; const a = Math.sin(raw * Math.PI); const j = (n) => (rnd(Math.floor(raw * 40) * 3.7 + n) - 0.5) * a; S.A({ dx: j(1) * W * 0.08, dy: j(2) * H * 0.08, rot: j(3) * 6 }); S.B({ alpha: S.p, dx: j(4) * W * 0.08, dy: j(5) * H * 0.08, rot: j(6) * 6 }); },
    // ----- 3D -----
    cube: (S) => { const { p, W } = S; const a = 90 * p, r = (a * Math.PI) / 180, sW = W / 2; const ga = { ry: a, tx: -sW * Math.sin(r), tz: sW - sW * Math.cos(r) }, gb = { ry: a - 90, tx: sW * Math.cos(r), tz: sW - sW * Math.sin(r) }; if (ga.tz > gb.tz) { S.A({ g3: ga }); S.B({ g3: gb }); } else { S.B({ g3: gb }); S.A({ g3: ga }); } },
    cubeUp: (S) => { const { p, H } = S; const a = 90 * p, r = (a * Math.PI) / 180, sH = H / 2; const ga = { rx: -a, ty: -sH * Math.sin(r), tz: sH - sH * Math.cos(r) }, gb = { rx: 90 - a, ty: sH * Math.cos(r), tz: sH - sH * Math.sin(r) }; if (ga.tz > gb.tz) { S.A({ g3: ga }); S.B({ g3: gb }); } else { S.B({ g3: gb }); S.A({ g3: ga }); } },
    flip3d: (S) => { const { p, W } = S; const z = Math.sin(p * Math.PI) * W * 0.35; if (p < 0.5) S.A({ g3: { ry: p * 180, tz: z } }); else S.B({ g3: { ry: (p - 1) * 180, tz: z } }); },
    tumble: (S) => { const { p, H } = S; const z = Math.sin(p * Math.PI) * H * 0.35; if (p < 0.5) S.A({ g3: { rx: p * 180, tz: z } }); else S.B({ g3: { rx: (p - 1) * 180, tz: z } }); },
    door: (S) => { const { p, W } = S; S.A(); const a = -90 * (1 - p), r = (a * Math.PI) / 180, sW = W / 2; S.B({ g3: { ry: a, tx: -sW + sW * Math.cos(r), tz: -sW * Math.sin(r) } }); },
    pageTurn: (S) => { const { p, W } = S; S.B(); const a = 100 * p, r = (a * Math.PI) / 180, sW = W / 2; if (a < 90) S.A({ g3: { ry: -a, tx: -sW + sW * Math.cos(r), tz: sW * Math.sin(r) * 0.6 }, filter: `brightness(${1 - p * 0.5})` }); },
    swing: (S) => { const { p, H } = S; S.A({ alpha: 1 - p * 0.6 }); S.B({ g3: { rx: -70 * (1 - p), tz: (1 - p) * H * 0.5 }, alpha: p }); },
    fold: (S) => { const { p, W } = S; if (p < 0.5) S.A({ g3: { ry: p * 160, tz: Math.sin(p * Math.PI) * W * 0.2 }, filter: `brightness(${1 - p})` }); else S.B({ g3: { ry: -(1 - p) * 160, tz: Math.sin(p * Math.PI) * W * 0.2 }, filter: `brightness(${p})` }); },
    // ----- glitch & stylized -----
    glitch: (S) => { const { p, raw, W, ctx } = S; S.A({ alpha: 1 - p }); const j = Math.sin(raw * 90) * (1 - p) * W * 0.04; S.B({ alpha: p, dx: j }); if (p < 0.85) { ctx.save(); ctx.globalAlpha = 0.35 * (1 - p); ctx.globalCompositeOperation = 'screen'; S.B({ dx: -j * 2.5, alpha: 0.5 }); ctx.restore(); } },
    rgbGlitch: (S) => {
      const { raw, W, H, ctx } = S; const a = Math.sin(raw * Math.PI); const first = raw < 0.5; const g = S.off('trG'); (first ? S.A : S.B)({}, g);
      ctx.save(); const sh = a * W * 0.03; const bands = 7;
      for (let i = 0; i < bands; i++) { const y0 = (i / bands) * H, h = H / bands; const off = (rnd(Math.floor(raw * 24) * 13 + i) - 0.5) * a * W * 0.12; ctx.drawImage(g.canvas, 0, y0 * (g.canvas.height / H), g.canvas.width, h * (g.canvas.height / H), off, y0, W, h); }
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6 * a;
      ctx.filter = 'sepia(1) saturate(8) hue-rotate(-50deg)'; ctx.drawImage(g.canvas, sh, 0, W, H); ctx.filter = 'sepia(1) saturate(8) hue-rotate(150deg)'; ctx.drawImage(g.canvas, -sh, 0, W, H); ctx.restore();
    },
    pixelate: (S) => {
      const { raw, W, H, ctx } = S; const a = Math.sin(raw * Math.PI); const g = S.off('trP'); (raw < 0.5 ? S.A : S.B)({}, g);
      const s = Math.max(1, a * Math.min(W, H) * 0.08); const sw = Math.max(1, Math.ceil(W / s)), sh = Math.max(1, Math.ceil(H / s));
      const small = S.off('trPs', sw, sh); small.drawImage(g.canvas, 0, 0, sw, sh);
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(small.canvas, 0, 0, sw, sh, 0, 0, sw * s, sh * s); ctx.restore();
    },
    mosaicTiles: (S) => { const { W, H, p } = S; S.A(); const n = 12, s = W / n, rows = Math.ceil(H / s); S.B({ clipFn: (cx) => { for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) { if (rnd(j * 53 + i * 19) < p * 1.05) cx.rect(i * s, j * s, s + 0.5, s + 0.5); } } }); },
  };
  // noise/ink transitions need a threshold on the mask; implement by contrast filter on the noise
  const lumaMask = (S, extra) => { const { W, H, p } = S; S.A(); const n = noiseCanvas(W, H); maskB(S, (m) => { const lo = p * 1.2 - 0.1; m.filter = `contrast(800%) brightness(${0.5 / Math.max(0.01, 1 - lo)})`; m.drawImage(n, 0, 0, W, H); m.filter = 'none'; if (extra) extra(m); }); };
  C.TR_DRAW.dissolveNoise = (S) => lumaMask(S);
  C.TR_DRAW.inkBleed = (S) => { const { W, H, p } = S; lumaMask(S, (m) => { m.globalCompositeOperation = 'destination-in'; const g = m.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, '#fff'); g.addColorStop(C.clamp(p * 1.2, 0.01, 1), '#fff'); g.addColorStop(C.clamp(p * 1.2 + 0.2, 0.02, 1), 'rgba(255,255,255,0)'); m.fillStyle = g; m.fillRect(0, 0, W, H); }); };
  C.TR_DRAW.ripple = (S) => {
    const { raw, W, H, ctx } = S; const a = Math.sin(raw * Math.PI); const f = S.off('trR'); S.A({}, f); S.B({ alpha: S.p }, f);
    const step = Math.max(2, Math.round(H / 120)); const fc = f.canvas, k = fc.height / H;
    for (let y = 0; y < H; y += step) { const dx = Math.sin(y * (12 / H) * Math.PI + raw * 18) * a * W * 0.035; ctx.drawImage(fc, 0, y * k, fc.width, step * k, dx, y, W, step + 0.5); }
  };

  // categories + names for the library (anim = legacy css keyframes, kept for compatibility)
  const T = (id, name, cat) => ({ id, name, cat });
  const LIST = [
    T('dissolve', 'Cross dissolve', 'Basic'), T('fadeblack', 'Dip to black', 'Basic'), T('fadewhite', 'Dip to white', 'Basic'), T('flash', 'Flash', 'Basic'), T('overexpose', 'Overexpose', 'Basic'), T('dissolveNoise', 'Noise dissolve', 'Basic'), T('blur', 'Blur', 'Basic'),
    T('slideLeft', 'Slide left', 'Slide & push'), T('slideRight', 'Slide right', 'Slide & push'), T('slideUp', 'Slide up', 'Slide & push'), T('slideDown', 'Slide down', 'Slide & push'), T('push', 'Push left', 'Slide & push'), T('pushRight', 'Push right', 'Slide & push'), T('pushUp', 'Push up', 'Slide & push'), T('pushDown', 'Push down', 'Slide & push'),
    T('whipLeft', 'Whip pan left', 'Slide & push'), T('whipRight', 'Whip pan right', 'Slide & push'), T('whipUp', 'Whip pan up', 'Slide & push'), T('squeeze', 'Squeeze', 'Slide & push'), T('stretch', 'Stretch', 'Slide & push'), T('bounceIn', 'Bounce drop', 'Slide & push'), T('split', 'Split open', 'Slide & push'), T('splitV', 'Split vertical', 'Slide & push'),
    T('wipeLeft', 'Wipe right', 'Wipes & shapes'), T('wipeRight', 'Wipe left', 'Wipes & shapes'), T('wipeUp', 'Wipe up', 'Wipes & shapes'), T('wipeDown', 'Wipe down', 'Wipes & shapes'), T('softWipe', 'Soft wipe', 'Wipes & shapes'), T('diagonal', 'Diagonal wipe', 'Wipes & shapes'), T('clock', 'Clock wipe', 'Wipes & shapes'),
    T('circle', 'Circle reveal', 'Wipes & shapes'), T('circleOut', 'Iris close', 'Wipes & shapes'), T('diamond', 'Diamond', 'Wipes & shapes'), T('star', 'Star', 'Wipes & shapes'), T('heart', 'Heart', 'Wipes & shapes'), T('doors', 'Doors', 'Wipes & shapes'), T('barnV', 'Barn doors', 'Wipes & shapes'), T('blinds', 'Blinds', 'Wipes & shapes'), T('vblinds', 'Vertical blinds', 'Wipes & shapes'), T('checker', 'Checkerboard', 'Wipes & shapes'), T('mosaicTiles', 'Tiles', 'Wipes & shapes'),
    T('zoom', 'Zoom', 'Zoom & spin'), T('zoomIn', 'Zoom punch in', 'Zoom & spin'), T('zoomOut', 'Zoom pull out', 'Zoom & spin'), T('spin', 'Spin', 'Zoom & spin'), T('spinBlur', 'Spin blur', 'Zoom & spin'), T('rotateZoom', 'Rotate zoom', 'Zoom & spin'), T('shake', 'Shake', 'Zoom & spin'),
    T('cube', '3D cube', '3D'), T('cubeUp', '3D cube up', '3D'), T('flip3d', '3D card flip', '3D'), T('tumble', '3D tumble', '3D'), T('door', '3D door', '3D'), T('pageTurn', 'Page turn', '3D'), T('swing', '3D swing in', '3D'), T('fold', 'Fold', '3D'),
    T('glitch', 'Glitch', 'Glitch & light'), T('rgbGlitch', 'RGB glitch', 'Glitch & light'), T('pixelate', 'Pixelate', 'Glitch & light'), T('ripple', 'Ripple', 'Glitch & light'), T('inkBleed', 'Ink bleed', 'Glitch & light'), T('lightLeak', 'Light leak', 'Glitch & light'), T('filmBurn', 'Film burn', 'Glitch & light'),
  ];
  const old = new Map(C.TRANSITIONS.map((t) => [t.id, t]));
  C.TRANSITIONS.length = 0;
  for (const t of LIST) C.TRANSITIONS.push(Object.assign({}, old.get(t.id) || {}, t));
  C.TR_CATS = [...new Set(LIST.map((t) => t.cat))];
})(window.C);
