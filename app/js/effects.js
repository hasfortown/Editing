/* Cutroom — effects engine: base effects, effect stacks, regions, presets */
(function (C) {
  const FX = (C.fx = {});

  // ---------- helpers ----------
  const pool = {};
  FX.canvas = (name, W, H) => {
    let c = pool[name];
    if (!c) { c = document.createElement('canvas'); c._cx = c.getContext('2d', { willReadFrequently: name === 'key' }); pool[name] = c; }
    W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    return c;
  };
  const reset = (cx) => { cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.filter = 'none'; cx.imageSmoothingEnabled = true; cx.shadowColor = 'transparent'; };
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  FX.rnd = rnd;
  const copyOf = (L, name = 't1') => { const T = FX.canvas(name, L.W, L.H); reset(T._cx); T._cx.clearRect(0, 0, L.W, L.H); T._cx.drawImage(L.cv, 0, 0); return T; };
  const filterPass = (L, f) => {
    const T = FX.canvas('t1', L.W, L.H); const t = T._cx; reset(t); t.clearRect(0, 0, L.W, L.H);
    t.filter = f; t.drawImage(L.cv, 0, 0); t.filter = 'none';
    reset(L.cx); L.cx.clearRect(0, 0, L.W, L.H); L.cx.drawImage(T, 0, 0);
  };
  const k1080 = (env) => Math.min(env.W, env.H) / 1080;
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  // SVG filters used by some effects
  FX.installSvg = () => {
    if (document.getElementById('cr-svg-filters')) return;
    const post = [];
    for (let n = 2; n <= 12; n++) { const vals = Array.from({ length: n }, (_, i) => (i / (n - 1)).toFixed(3)).join(' '); post.push(`<filter id="cr-post-${n}" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="discrete" tableValues="${vals}"/><feFuncG type="discrete" tableValues="${vals}"/><feFuncB type="discrete" tableValues="${vals}"/></feComponentTransfer></filter>`); }
    const svg = `<svg id="cr-svg-filters" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true"><defs>${post.join('')}
      <filter id="cr-edge" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="true"/></filter>
      <filter id="cr-emboss" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" kernelMatrix="-2 -1 0 -1 1 1 0 1 2" preserveAlpha="true"/></filter>
      <filter id="cr-sharpen" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" preserveAlpha="true"/></filter>
    </defs></svg>`;
    document.body.insertAdjacentHTML('beforeend', svg);
  };

  // param builders
  const R = (key, label, min, max, def, step = 1, unit = '') => ({ key, label, type: 'range', min, max, def, step, unit });
  const COL = (key, label, def) => ({ key, label, type: 'color', def });
  const SEL = (key, label, options, def) => ({ key, label, type: 'select', options, def: def ?? options[0][0] });
  const BOOL = (key, label, def = false) => ({ key, label, type: 'bool', def });
  const TXT = (key, label, def) => ({ key, label, type: 'text', def });
  const REGION = [SEL('area', 'Apply to', [['full', 'Whole frame'], ['box', 'Box area'], ['ellipse', 'Ellipse area']]), R('rx', 'Area X', 0, 1, 0.5, 0.001), R('ry', 'Area Y', 0, 1, 0.5, 0.001), R('rw', 'Area width', 0.02, 1.5, 0.4, 0.001), R('rh', 'Area height', 0.02, 1.5, 0.4, 0.001), BOOL('invert', 'Invert area')];

  // ---------- effect definitions ----------
  // phase: 'layer' (pixels of the clip/frame), 'pre' (moves the clip), 'shape' (frame/border), 'composite' (shadow)
  FX.DEFS = [
    // Blur & distort
    { id: 'blur', name: 'Gaussian blur', cat: 'Blur & distort', icon: '🌫️', region: true, params: [R('amount', 'Amount', 0, 80, 20)],
      apply: (L, p, env) => filterPass(L, `blur(${(p.amount * L.W) / 1920}px)`) },
    { id: 'mosaic', name: 'Mosaic / pixelate', cat: 'Blur & distort', icon: '🟪', region: true, params: [R('size', 'Block size', 2, 120, 24)],
      apply: (L, p, env) => {
        const s = Math.max(2, p.size * k1080(env)); const sw = Math.ceil(L.W / s), sh = Math.ceil(L.H / s);
        const S = FX.canvas('small', sw, sh); const sc = S._cx; reset(sc); sc.clearRect(0, 0, sw, sh); sc.drawImage(L.cv, 0, 0, sw, sh);
        reset(L.cx); L.cx.clearRect(0, 0, L.W, L.H); L.cx.imageSmoothingEnabled = false; L.cx.drawImage(S, 0, 0, sw, sh, 0, 0, sw * s, sh * s); L.cx.imageSmoothingEnabled = true;
      } },
    { id: 'zoomBlur', name: 'Zoom blur', cat: 'Blur & distort', icon: '💫', point: true, params: [R('amount', 'Amount', 0, 100, 40), R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001)],
      apply: (L, p) => {
        const T = copyOf(L); const cx = L.cx; reset(cx);
        const ox = p.x * L.W, oy = p.y * L.H, n = 10;
        for (let i = 1; i <= n; i++) { const s = 1 + (p.amount / 100) * 0.35 * (i / n); cx.globalAlpha = 0.9 / (i + 1); cx.setTransform(s, 0, 0, s, ox - ox * s, oy - oy * s); cx.drawImage(T, 0, 0); }
        reset(cx);
      } },
    { id: 'motionBlur', name: 'Motion blur', cat: 'Blur & distort', icon: '💨', region: true, params: [R('amount', 'Amount', 0, 100, 35), R('angle', 'Angle', -180, 180, 0, 1, '°')],
      apply: (L, p) => {
        const T = copyOf(L); const cx = L.cx; reset(cx);
        const d = (p.amount / 100) * L.W * 0.04, a = (p.angle * Math.PI) / 180, n = 8;
        cx.clearRect(0, 0, L.W, L.H);
        for (let i = 0; i < n; i++) { const k = i / (n - 1) - 0.5; cx.globalAlpha = i === 0 ? 1 : 1 / (i + 1); cx.drawImage(T, Math.cos(a) * d * k, Math.sin(a) * d * k); }
        reset(cx);
      } },
    { id: 'wave', name: 'Wave', cat: 'Blur & distort', icon: '🌊', region: true, params: [R('amp', 'Strength', 0, 100, 25), R('freq', 'Waves', 1, 30, 6), R('speed', 'Speed', 0, 20, 4), SEL('dir', 'Direction', [['h', 'Horizontal'], ['v', 'Vertical']])],
      apply: (L, p, env) => {
        const T = copyOf(L); const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H);
        const amp = (p.amp / 100) * 40 * k1080(env), s = Math.max(2, Math.round(L.H / 300));
        if (p.dir === 'v') for (let x = 0; x < L.W; x += s) { const dy = Math.sin((x / L.W) * p.freq * 6.283 + env.t * p.speed) * amp; cx.drawImage(T, x, 0, s, L.H, x, dy, s, L.H); }
        else for (let y = 0; y < L.H; y += s) { const dx = Math.sin((y / L.H) * p.freq * 6.283 + env.t * p.speed) * amp; cx.drawImage(T, 0, y, L.W, s, dx, y, L.W, s); }
      } },
    { id: 'mirror', name: 'Mirror', cat: 'Blur & distort', icon: '🪞', params: [SEL('mode', 'Mode', [['lr', 'Left → right'], ['rl', 'Right → left'], ['tb', 'Top → bottom'], ['bt', 'Bottom → top'], ['quad', 'Four-way']])],
      apply: (L, p) => {
        const T = copyOf(L); const cx = L.cx; reset(cx); const W = L.W, H = L.H, w2 = W / 2, h2 = H / 2;
        cx.clearRect(0, 0, W, H);
        const half = (sx, sy, sw, sh, flipX, flipY, dx, dy) => { cx.save(); cx.translate(dx + (flipX ? sw : 0), dy + (flipY ? sh : 0)); cx.scale(flipX ? -1 : 1, flipY ? -1 : 1); cx.drawImage(T, sx, sy, sw, sh, 0, 0, sw, sh); cx.restore(); };
        if (p.mode === 'lr') { half(0, 0, w2, H, false, false, 0, 0); half(0, 0, w2, H, true, false, w2, 0); }
        else if (p.mode === 'rl') { half(w2, 0, w2, H, false, false, w2, 0); half(w2, 0, w2, H, true, false, 0, 0); }
        else if (p.mode === 'tb') { half(0, 0, W, h2, false, false, 0, 0); half(0, 0, W, h2, false, true, 0, h2); }
        else if (p.mode === 'bt') { half(0, h2, W, h2, false, false, 0, h2); half(0, h2, W, h2, false, true, 0, 0); }
        else { half(0, 0, w2, h2, false, false, 0, 0); half(0, 0, w2, h2, true, false, w2, 0); half(0, 0, w2, h2, false, true, 0, h2); half(0, 0, w2, h2, true, true, w2, h2); }
      } },
    { id: 'kaleido', name: 'Kaleidoscope', cat: 'Blur & distort', icon: '🔯', point: true, params: [R('segments', 'Segments', 3, 16, 6), R('rotate', 'Rotation', -180, 180, 0, 1, '°'), R('spin', 'Spin speed', -90, 90, 0, 1, '°/s'), R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001)],
      apply: (L, p, env) => {
        const T = copyOf(L); const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H);
        const n = Math.round(p.segments), wedge = (Math.PI * 2) / n, ox = p.x * L.W, oy = p.y * L.H, Rr = Math.hypot(L.W, L.H);
        const rot = ((p.rotate + p.spin * env.t) * Math.PI) / 180;
        for (let i = 0; i < n; i++) {
          cx.save(); cx.translate(ox, oy); cx.rotate(i * wedge + rot); if (i % 2) cx.scale(1, -1);
          cx.beginPath(); cx.moveTo(0, 0); cx.arc(0, 0, Rr, -wedge / 2 - 0.01, wedge / 2 + 0.01); cx.closePath(); cx.clip();
          cx.rotate(-rot); cx.drawImage(T, -ox, -oy); cx.restore();
        }
      } },
    // Motion (move the clip)
    { id: 'shake', name: 'Camera shake', cat: 'Motion', icon: '📳', phase: 'pre', params: [R('intensity', 'Intensity', 0, 100, 35), R('speed', 'Speed', 1, 60, 18), R('rotation', 'Rotation', 0, 100, 20)],
      pre: (s, p, env) => {
        const n = env.t * p.speed, k = p.intensity / 100;
        const nz = (o) => (Math.sin(n * 1.13 + o) + Math.sin(n * 2.31 + o * 2.7) * 0.6 + Math.sin(n * 4.07 + o * 1.3) * 0.3) / 1.9;
        s.dx += nz(0.3) * k * 0.035; s.dy += nz(5.1) * k * 0.035; s.rot += nz(9.7) * k * (p.rotation / 100) * 4; s.scale *= 1 + k * 0.06;
      } },
    { id: 'zoomPulse', name: 'Beat zoom', cat: 'Motion', icon: '🥁', phase: 'pre', params: [R('amount', 'Amount', 0, 100, 30), R('bpm', 'Tempo', 30, 240, 120, 1, ' bpm')],
      pre: (s, p, env) => { const ph = ((env.t * p.bpm) / 60) % 1; s.scale *= 1 + (p.amount / 100) * 0.25 * Math.exp(-ph * 6); } },
    { id: 'spin', name: 'Spin', cat: 'Motion', icon: '🌀', phase: 'pre', params: [R('speed', 'Speed', -720, 720, 90, 1, '°/s')],
      pre: (s, p, env) => { s.rot += p.speed * env.t; } },
    { id: 'float', name: 'Float', cat: 'Motion', icon: '🎈', phase: 'pre', params: [R('amount', 'Distance', 0, 100, 25), R('speed', 'Speed', 1, 20, 4)],
      pre: (s, p, env) => { s.dy += Math.sin(env.t * p.speed * 0.8) * (p.amount / 100) * 0.04; s.rot += Math.sin(env.t * p.speed * 0.4) * (p.amount / 100) * 3; } },
    { id: 'slowZoom', name: 'Slow zoom', cat: 'Motion', icon: '🔍', phase: 'pre', params: [R('amount', 'Zoom', -50, 100, 20, 1, '%')],
      pre: (s, p, env) => { s.scale *= 1 + (p.amount / 100) * C.clamp(env.t / Math.max(0.1, env.dur), 0, 1); } },
    // Color
    { id: 'tint', name: 'Color tint', cat: 'Color', icon: '🎨', region: true, params: [COL('color', 'Color', '#ff3d7f'), R('amount', 'Amount', 0, 100, 50), SEL('mode', 'Blend', [['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['color', 'Color'], ['hue', 'Hue'], ['source-atop', 'Solid']])],
      apply: (L, p) => {
        const T = copyOf(L); const t = T._cx; t.globalCompositeOperation = p.mode; t.fillStyle = p.color; t.fillRect(0, 0, L.W, L.H);
        t.globalCompositeOperation = 'destination-in'; t.drawImage(L.cv, 0, 0); reset(t);
        reset(L.cx); L.cx.globalAlpha = p.amount / 100; L.cx.drawImage(T, 0, 0); reset(L.cx);
      } },
    { id: 'duotone', name: 'Duotone', cat: 'Color', icon: '🌗', region: true, params: [COL('dark', 'Shadows', '#2b1055'), COL('light', 'Highlights', '#ffb347'), R('amount', 'Amount', 0, 100, 100)],
      apply: (L, p) => {
        const T = FX.canvas('t1', L.W, L.H); const t = T._cx; reset(t); t.clearRect(0, 0, L.W, L.H);
        t.filter = 'grayscale(1) contrast(1.15)'; t.drawImage(L.cv, 0, 0); t.filter = 'none';
        t.globalCompositeOperation = 'multiply'; t.fillStyle = p.light; t.fillRect(0, 0, L.W, L.H);
        t.globalCompositeOperation = 'screen'; t.fillStyle = p.dark; t.fillRect(0, 0, L.W, L.H);
        t.globalCompositeOperation = 'destination-in'; t.drawImage(L.cv, 0, 0); reset(t);
        reset(L.cx); L.cx.globalAlpha = p.amount / 100; L.cx.drawImage(T, 0, 0); reset(L.cx);
      } },
    { id: 'posterize', name: 'Posterize', cat: 'Color', icon: '🖼️', region: true, params: [R('levels', 'Levels', 2, 12, 4)],
      apply: (L, p) => filterPass(L, `url(#cr-post-${Math.round(p.levels)})`) },
    { id: 'hueCycle', name: 'Rainbow cycle', cat: 'Color', icon: '🌈', region: true, params: [R('speed', 'Speed', -360, 360, 120, 1, '°/s'), R('saturation', 'Saturation', 0, 300, 140, 1, '%')],
      apply: (L, p, env) => filterPass(L, `hue-rotate(${(p.speed * env.t) % 360}deg) saturate(${p.saturation / 100})`) },
    { id: 'ink', name: 'Ink (black & white)', cat: 'Color', icon: '🖋️', region: true, params: [R('contrast', 'Contrast', 100, 800, 350, 1, '%'), R('brightness', 'Brightness', 50, 200, 110, 1, '%')],
      apply: (L, p) => filterPass(L, `grayscale(1) brightness(${p.brightness / 100}) contrast(${p.contrast / 100})`) },
    { id: 'sharpen', name: 'Sharpen', cat: 'Color', icon: '🔪', region: true, params: [], apply: (L) => filterPass(L, 'url(#cr-sharpen)') },
    // Retro
    { id: 'vhs', name: 'VHS', cat: 'Retro', icon: '📼', params: [R('amount', 'Amount', 0, 100, 60), BOOL('label', 'Show PLAY label', true)],
      apply: (L, p, env) => {
        const a = p.amount / 100;
        rgbShift(L, a * 6 * (L.W / 1920), 0);
        filterPass(L, `saturate(${1 + a * 0.4}) contrast(${1 + a * 0.1}) blur(${a * 0.8 * (L.W / 1920)}px)`);
        scan(L, 3 * k1080(env), 0.25 * a);
        grain(L, a * 0.35, env);
        const cx = L.cx; reset(cx);
        const by = ((env.T * 0.23) % 1.2 - 0.1) * L.H, bh = L.H * 0.03;
        cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = 0.25 * a; cx.fillStyle = '#fff'; cx.fillRect(0, by, L.W, bh);
        reset(cx);
        if (p.label) { const px = 54 * k1080(env); cx.font = `600 ${px}px Consolas, monospace`; cx.fillStyle = 'rgba(255,255,255,.85)'; cx.shadowColor = 'rgba(0,0,0,.6)'; cx.shadowBlur = px * 0.2; cx.fillText('PLAY ▶', px * 0.9, px * 1.6); const s = Math.floor(env.T); cx.fillText(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, L.W - px * 4.2, L.H - px * 0.9); reset(cx); }
      } },
    { id: 'grain', name: 'Film grain', cat: 'Retro', icon: '🎞️', region: true, params: [R('amount', 'Amount', 0, 100, 35)], apply: (L, p, env) => grain(L, p.amount / 100, env) },
    { id: 'scanlines', name: 'Scanlines', cat: 'Retro', icon: '📺', params: [R('size', 'Line size', 1, 12, 3), R('opacity', 'Opacity', 0, 100, 35)], apply: (L, p, env) => scan(L, p.size * k1080(env), p.opacity / 100) },
    { id: 'oldFilm', name: 'Old film', cat: 'Retro', icon: '📽️', params: [R('amount', 'Amount', 0, 100, 70)],
      apply: (L, p, env) => {
        const a = p.amount / 100, f = Math.floor(env.T * 24);
        filterPass(L, `sepia(${a * 0.85}) contrast(${1 + a * 0.15}) brightness(${1 + (rnd(f) - 0.5) * 0.12 * a})`);
        grain(L, a * 0.45, env);
        const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'source-atop';
        for (let i = 0; i < 3; i++) { if (rnd(f * 3 + i) > 0.55) continue; const x = rnd(f * 7 + i) * L.W; cx.globalAlpha = 0.35 * a; cx.fillStyle = rnd(i + f) > 0.5 ? '#fff' : '#000'; cx.fillRect(x, 0, Math.max(1, L.W / 900), L.H); }
        reset(cx); vignette(L, { amount: 55 * a, size: 70, color: '#000000', x: 0.5, y: 0.5 });
      } },
    { id: 'rgbSplit', name: 'RGB split', cat: 'Retro', icon: '🔴', region: true, params: [R('amount', 'Amount', 0, 100, 30), R('angle', 'Angle', -180, 180, 0, 1, '°')],
      apply: (L, p) => { const d = (p.amount / 100) * L.W * 0.012, a = (p.angle * Math.PI) / 180; rgbShift(L, Math.cos(a) * d, Math.sin(a) * d); } },
    { id: 'glitch', name: 'Glitch', cat: 'Retro', icon: '👾', region: true, params: [R('amount', 'Amount', 0, 100, 50), R('frequency', 'Frequency', 0, 100, 60, 1, '%'), R('speed', 'Speed', 1, 30, 12)],
      apply: (L, p, env) => {
        const f = Math.floor(env.T * p.speed);
        if (rnd(f * 1.7) * 100 > p.frequency) return;
        const a = p.amount / 100; const T = copyOf(L, 't2'); const cx = L.cx; reset(cx);
        const n = 3 + Math.round(a * 10);
        for (let i = 0; i < n; i++) {
          const y = rnd(f * 13 + i) * L.H, h = rnd(f * 17 + i * 3) * L.H * 0.09 + 2, dx = (rnd(f * 19 + i * 7) - 0.5) * a * L.W * 0.18;
          cx.clearRect(0, y, L.W, h); cx.drawImage(T, 0, y, L.W, h, dx, y, L.W, h);
        }
        rgbShift(L, a * L.W * 0.008 * (rnd(f) > 0.5 ? 1 : -1), 0);
      } },
    // Light
    { id: 'glow', name: 'Glow', cat: 'Light', icon: '✨', region: true, params: [R('intensity', 'Intensity', 0, 200, 70, 1, '%'), R('radius', 'Radius', 1, 80, 25)],
      apply: (L, p, env) => {
        const T = FX.canvas('t1', L.W, L.H); const t = T._cx; reset(t); t.clearRect(0, 0, L.W, L.H);
        t.filter = `blur(${(p.radius * L.W) / 1920}px) brightness(1.25)`; t.drawImage(L.cv, 0, 0); t.filter = 'none';
        const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'screen';
        let k = p.intensity / 100; while (k > 0) { cx.globalAlpha = Math.min(1, k); cx.drawImage(T, 0, 0); k -= 1; }
        reset(cx);
      } },
    { id: 'lightLeak', name: 'Light leak', cat: 'Light', icon: '🌅', params: [COL('color1', 'Color 1', '#ff7a18'), COL('color2', 'Color 2', '#ff2e88'), R('intensity', 'Intensity', 0, 100, 60), R('speed', 'Speed', 0, 10, 2)],
      apply: (L, p, env) => {
        const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'screen';
        const t = env.T * p.speed * 0.3, a = p.intensity / 100;
        [[p.color1, 0.15 + 0.25 * Math.sin(t), 0.2 + 0.2 * Math.cos(t * 0.7)], [p.color2, 0.85 + 0.2 * Math.cos(t * 0.8), 0.75 + 0.2 * Math.sin(t * 1.1)]].forEach(([col, x, y]) => {
          const g = cx.createRadialGradient(x * L.W, y * L.H, 0, x * L.W, y * L.H, Math.max(L.W, L.H) * 0.6);
          g.addColorStop(0, hexA(col, 0.85 * a)); g.addColorStop(1, hexA(col, 0)); cx.fillStyle = g; cx.fillRect(0, 0, L.W, L.H);
        });
        reset(cx);
      } },
    { id: 'flash', name: 'Beat flash', cat: 'Light', icon: '⚡', params: [R('bpm', 'Tempo', 30, 240, 120, 1, ' bpm'), R('intensity', 'Intensity', 0, 100, 60), COL('color', 'Color', '#ffffff')],
      apply: (L, p, env) => { const ph = ((env.t * p.bpm) / 60) % 1; const a = (p.intensity / 100) * Math.exp(-ph * 7); const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = a; cx.fillStyle = p.color; cx.fillRect(0, 0, L.W, L.H); reset(cx); } },
    { id: 'strobe', name: 'Strobe', cat: 'Light', icon: '🚨', params: [R('rate', 'Rate', 1, 30, 8, 1, ' Hz'), R('amount', 'Amount', 0, 100, 70), SEL('mode', 'Style', [['black', 'Black'], ['white', 'White'], ['invert', 'Invert']])],
      apply: (L, p, env) => {
        if (Math.floor(env.t * p.rate * 2) % 2 === 0) return;
        if (p.mode === 'invert') { filterPass(L, `invert(${p.amount / 100})`); return; }
        const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = p.amount / 100; cx.fillStyle = p.mode === 'white' ? '#fff' : '#000'; cx.fillRect(0, 0, L.W, L.H); reset(cx);
      } },
    { id: 'spotlight', name: 'Spotlight', cat: 'Light', icon: '🔦', point: true, radius: true, params: [R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001), R('radius', 'Radius', 0.02, 1, 0.3, 0.001), R('softness', 'Softness', 0, 100, 40), R('darkness', 'Darkness', 0, 100, 80)],
      apply: (L, p) => {
        const cx = L.cx; reset(cx); const r = p.radius * Math.max(L.W, L.H), x = p.x * L.W, y = p.y * L.H;
        const g = cx.createRadialGradient(x, y, r * (1 - p.softness / 100) * 0.999, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${p.darkness / 100})`);
        cx.globalCompositeOperation = 'source-atop'; cx.fillStyle = g; cx.fillRect(0, 0, L.W, L.H); reset(cx);
      } },
    { id: 'vignette', name: 'Vignette', cat: 'Light', icon: '⚫', point: true, params: [R('amount', 'Amount', 0, 100, 60), R('size', 'Size', 10, 150, 70), COL('color', 'Color', '#000000'), R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001)],
      apply: (L, p) => vignette(L, p) },
    // Stylize
    { id: 'edges', name: 'Sketch & edges', cat: 'Stylize', icon: '✏️', region: true, params: [SEL('mode', 'Style', [['sketch', 'Pencil sketch'], ['neon', 'Neon edges'], ['emboss', 'Emboss']]), R('mix', 'Mix', 0, 100, 100)],
      apply: (L, p) => {
        const T = FX.canvas('t2', L.W, L.H); const t = T._cx; reset(t); t.clearRect(0, 0, L.W, L.H);
        t.filter = p.mode === 'emboss' ? 'url(#cr-emboss) grayscale(1)' : p.mode === 'neon' ? 'url(#cr-edge) saturate(3) brightness(2.2)' : 'grayscale(1) url(#cr-edge) invert(1) contrast(1.6) brightness(1.05)';
        t.drawImage(L.cv, 0, 0); t.filter = 'none';
        if (p.mode !== 'neon') { t.globalCompositeOperation = 'destination-in'; t.drawImage(L.cv, 0, 0); reset(t); }
        const cx = L.cx; reset(cx);
        if (p.mode === 'neon') { cx.globalAlpha = p.mix / 100; cx.globalCompositeOperation = 'source-atop'; cx.fillStyle = '#000'; cx.fillRect(0, 0, L.W, L.H); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1; cx.drawImage(T, 0, 0); }
        else { cx.globalAlpha = p.mix / 100; cx.drawImage(T, 0, 0); }
        reset(cx);
      } },
    { id: 'letterbox', name: 'Cinema bars', cat: 'Stylize', icon: '🎬', params: [R('size', 'Bar size', 0, 40, 12, 0.5, '%'), COL('color', 'Color', '#000000')],
      apply: (L, p) => { const cx = L.cx; reset(cx); const h = (p.size / 100) * L.H; cx.fillStyle = p.color; cx.fillRect(0, 0, L.W, h); cx.fillRect(0, L.H - h, L.W, h); } },
    { id: 'frame', name: 'Rounded frame', cat: 'Stylize', icon: '🔲', phase: 'shape', params: [R('radius', 'Corner radius', 0, 50, 8, 0.5, '%'), R('border', 'Border', 0, 40, 6), COL('color', 'Border color', '#ffffff')] },
    { id: 'shadow', name: 'Drop shadow', cat: 'Stylize', icon: '🌑', phase: 'composite', params: [R('blur', 'Blur', 0, 100, 30), R('distance', 'Distance', 0, 100, 15), R('angle', 'Angle', -180, 180, 45, 1, '°'), R('opacity', 'Opacity', 0, 100, 60), COL('color', 'Color', '#000000')] },
    // Overlays
    { id: 'particles', name: 'Particles', cat: 'Overlays', icon: '❄️', params: [SEL('type', 'Type', [['snow', 'Snow'], ['rain', 'Rain'], ['confetti', 'Confetti'], ['hearts', 'Hearts'], ['sparkles', 'Sparkles'], ['bubbles', 'Bubbles'], ['fireflies', 'Fireflies'], ['bokeh', 'Bokeh'], ['emoji', 'Emoji']]), TXT('char', 'Emoji', '🎉 ⭐ 💖'), R('count', 'Amount', 5, 300, 80), R('size', 'Size', 1, 100, 30), R('speed', 'Speed', 0, 300, 100, 1, '%'), R('wind', 'Wind', -100, 100, 0), COL('color', 'Color', '#ffffff')],
      apply: (L, p, env) => particles(L, p, env) },
    // Keying
    { id: 'chromaKey', name: 'Green screen (chroma key)', cat: 'Keying', icon: '🟩', params: [COL('color', 'Key color', '#00ff00'), R('similarity', 'Similarity', 0, 100, 40), R('smoothness', 'Smoothness', 0, 100, 10), R('spill', 'Spill removal', 0, 100, 50)],
      apply: (L, p) => chromaKey(L, p) },
  ];
  FX.CATS = ['Blur & distort', 'Motion', 'Color', 'Retro', 'Light', 'Stylize', 'Overlays', 'Keying'];
  FX.def = (id) => FX.DEFS.find((d) => d.id === id);
  // add region params
  for (const d of FX.DEFS) { d.phase = d.phase || 'layer'; if (d.region) d.params = d.params.concat(REGION.map((x) => Object.assign({}, x))); }

  // ---------- shared implementations ----------
  function rgbShift(L, dx, dy) {
    if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return;
    const chans = ['#ff0000', '#00ff00', '#0000ff'].map((col, i) => {
      const T = FX.canvas('ch' + i, L.W, L.H); const t = T._cx; reset(t); t.clearRect(0, 0, L.W, L.H); t.drawImage(L.cv, 0, 0);
      t.globalCompositeOperation = 'multiply'; t.fillStyle = col; t.fillRect(0, 0, L.W, L.H);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(L.cv, 0, 0); reset(t); return T;
    });
    const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.globalCompositeOperation = 'lighter';
    cx.drawImage(chans[0], dx, dy); cx.drawImage(chans[1], 0, 0); cx.drawImage(chans[2], -dx, -dy); reset(cx);
  }
  const grainTiles = [];
  function grain(L, a, env) {
    if (a <= 0) return;
    if (!grainTiles.length) for (let k = 0; k < 6; k++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); const id = x.createImageData(256, 256);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.floor(rnd(i * 0.37 + k * 911) * 255); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      x.putImageData(id, 0, 0); grainTiles.push(c);
    }
    const tile = grainTiles[Math.floor(env.T * 24) % grainTiles.length];
    const T = copyOf(L, 'grain'); const t = T._cx;
    t.globalCompositeOperation = 'overlay'; t.globalAlpha = Math.min(1, a);
    const s = Math.max(1, L.W / 1600); t.setTransform(s, 0, 0, s, 0, 0);
    t.fillStyle = t.createPattern(tile, 'repeat'); t.fillRect(0, 0, L.W / s, L.H / s);
    reset(t); t.globalCompositeOperation = 'destination-in'; t.drawImage(L.cv, 0, 0); reset(t);
    const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.drawImage(T, 0, 0);
  }
  function scan(L, size, a) {
    const s = Math.max(1, Math.round(size)); const P = FX.canvas('scan', 2, s * 2); const p = P._cx; reset(p); p.clearRect(0, 0, 2, s * 2); p.fillStyle = '#000'; p.fillRect(0, s, 2, s);
    const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = a; cx.fillStyle = cx.createPattern(P, 'repeat'); cx.fillRect(0, 0, L.W, L.H); reset(cx);
  }
  function vignette(L, p) {
    const cx = L.cx; reset(cx); const x = p.x * L.W, y = p.y * L.H, r = Math.hypot(L.W, L.H) / 2;
    const g = cx.createRadialGradient(x, y, r * (p.size / 100) * 0.4, x, y, r * Math.max(0.2, p.size / 100) * 1.05);
    g.addColorStop(0, hexA(p.color, 0)); g.addColorStop(1, hexA(p.color, p.amount / 100));
    cx.globalCompositeOperation = 'source-atop'; cx.fillStyle = g; cx.fillRect(0, 0, L.W, L.H); reset(cx);
  }
  const CONFETTI = ['#ff5d6c', '#ffb547', '#19d3c5', '#7c5cff', '#3ee08f', '#ff6bd6', '#4dd4ff'];
  function particles(L, p, env) {
    const cx = L.cx; reset(cx);
    const W = L.W, H = L.H, n = Math.round(p.count), t = env.t, sp = p.speed / 100, base = (p.size / 100) * Math.min(W, H) * 0.06 + 1;
    const seed = env.seed || 1;
    const chars = (p.char || '⭐').trim().split(/\s+/).filter(Boolean);
    const wrap = (v, m) => ((v % m) + m) % m;
    for (let i = 0; i < n; i++) {
      const r1 = rnd(i * 3.17 + seed), r2 = rnd(i * 7.31 + seed), r3 = rnd(i * 1.93 + seed), r4 = rnd(i * 5.11 + seed);
      const s = base * (0.4 + r3 * 0.8), v = (0.5 + r4) * sp;
      let x, y;
      switch (p.type) {
        case 'snow':
          y = wrap(r2 * (H + 40) + t * v * H * 0.18, H + 40) - 20; x = wrap(r1 * W + Math.sin(t * 1.3 + i) * s * 2 + p.wind * t * v * W * 0.002, W);
          cx.globalAlpha = 0.6 + r3 * 0.4; cx.fillStyle = p.color; cx.beginPath(); cx.arc(x, y, s * 0.18, 0, 6.283); cx.fill(); break;
        case 'rain':
          y = wrap(r2 * (H + 100) + t * v * H * 1.6, H + 100) - 50; x = wrap(r1 * W + p.wind * (y / H) * 40, W);
          cx.globalAlpha = 0.35 + r3 * 0.3; cx.strokeStyle = p.color; cx.lineWidth = Math.max(1, s * 0.04); cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + p.wind * 0.2, y + s * 0.9); cx.stroke(); break;
        case 'confetti':
          y = wrap(r2 * (H + 40) + t * v * H * 0.3, H + 40) - 20; x = wrap(r1 * W + Math.sin(t * 2 + i) * s + p.wind * t * W * 0.002, W);
          cx.save(); cx.translate(x, y); cx.rotate(t * (2 + r3 * 4) + i); cx.scale(1, Math.cos(t * 5 + i)); cx.globalAlpha = 0.95; cx.fillStyle = CONFETTI[i % CONFETTI.length]; cx.fillRect(-s * 0.2, -s * 0.1, s * 0.4, s * 0.2); cx.restore(); break;
        case 'hearts': case 'bubbles': {
          const life = wrap(r2 + t * v * 0.15, 1); y = H * (1.05 - life * 1.15); x = wrap(r1 * W + Math.sin(t * 1.5 + i * 2) * s * 1.5 + p.wind * life * W * 0.002, W);
          cx.globalAlpha = Math.sin(life * Math.PI) * 0.9;
          if (p.type === 'hearts') { cx.font = `${s}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`; cx.textAlign = 'center'; cx.fillStyle = p.color; cx.fillText('❤', x, y); }
          else { cx.strokeStyle = p.color; cx.lineWidth = Math.max(1, s * 0.05); cx.beginPath(); cx.arc(x, y, s * 0.35, 0, 6.283); cx.stroke(); cx.globalAlpha *= 0.5; cx.beginPath(); cx.arc(x - s * 0.12, y - s * 0.12, s * 0.07, 0, 6.283); cx.fillStyle = p.color; cx.fill(); }
          break;
        }
        case 'sparkles': {
          x = r1 * W; y = r2 * H; const tw = Math.max(0, Math.sin(t * (2 + r3 * 4) * sp * 2 + i * 1.7)); if (tw < 0.05) break;
          cx.globalAlpha = tw; cx.fillStyle = p.color; cx.save(); cx.translate(x, y); cx.rotate(t * 0.5 + i); const k = s * 0.45 * tw;
          cx.beginPath(); for (let j = 0; j < 8; j++) { const a = (j * Math.PI) / 4, rr = j % 2 ? k * 0.18 : k; cx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } cx.closePath(); cx.fill(); cx.restore(); break;
        }
        case 'fireflies': {
          x = wrap(r1 * W + Math.sin(t * 0.4 * (0.5 + sp) + i) * W * 0.05, W); y = wrap(r2 * H + Math.cos(t * 0.33 * (0.5 + sp) + i * 1.3) * H * 0.05, H);
          const glow = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + i * 2.1)); const g = cx.createRadialGradient(x, y, 0, x, y, s * 0.5);
          g.addColorStop(0, hexA(p.color === '#ffffff' ? '#fff27a' : p.color, glow)); g.addColorStop(1, hexA(p.color === '#ffffff' ? '#fff27a' : p.color, 0));
          cx.globalAlpha = 1; cx.fillStyle = g; cx.fillRect(x - s, y - s, s * 2, s * 2); break;
        }
        case 'bokeh': {
          x = wrap(r1 * W + t * v * W * 0.02 * (r3 - 0.5) * 4 + p.wind * t, W); y = wrap(r2 * H - t * v * H * 0.01, H); const rr = s * 1.6;
          const g = cx.createRadialGradient(x, y, rr * 0.6, x, y, rr); g.addColorStop(0, hexA(CONFETTI[i % CONFETTI.length], 0.22)); g.addColorStop(1, hexA(CONFETTI[i % CONFETTI.length], 0));
          cx.globalCompositeOperation = 'screen'; cx.globalAlpha = 1; cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, rr, 0, 6.283); cx.fill(); cx.globalCompositeOperation = 'source-over'; break;
        }
        default: { // emoji
          y = wrap(r2 * (H + 2 * s) + t * v * H * 0.25, H + 2 * s) - s; x = wrap(r1 * W + Math.sin(t * 1.4 + i) * s * 0.8 + p.wind * t * W * 0.002, W);
          cx.save(); cx.translate(x, y); cx.rotate(Math.sin(t * 2 + i) * 0.3); cx.globalAlpha = 1; cx.font = `${s}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
          cx.fillText(chars[i % chars.length] || '⭐', 0, 0); cx.restore();
        }
      }
    }
    reset(cx);
  }
  function chromaKey(L, p) {
    const W = L.W, H = L.H; const cx = L.cx; reset(cx);
    let img; try { img = cx.getImageData(0, 0, W, H); } catch (_) { return; }
    const d = img.data; const n = parseInt(p.color.slice(1), 16);
    const kr = (n >> 16) & 255, kg = (n >> 8) & 255, kb = n & 255;
    const kcb = -0.168736 * kr - 0.331264 * kg + 0.5 * kb, kcr = 0.5 * kr - 0.418688 * kg - 0.081312 * kb;
    const sim = (p.similarity / 100) * 120 + 2, smooth = (p.smoothness / 100) * 80 + 1, spill = p.spill / 100;
    const dom = kg >= kr && kg >= kb ? 1 : kb >= kr ? 2 : 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const cb = -0.168736 * r - 0.331264 * g + 0.5 * b, cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
      const dist = Math.hypot(cb - kcb, cr - kcr);
      let a = dist <= sim ? 0 : dist >= sim + smooth ? 1 : (dist - sim) / smooth;
      if (a < 1) d[i + 3] = d[i + 3] * a;
      if (spill > 0) {
        if (dom === 1) { const m = Math.max(r, b); if (g > m) d[i + 1] = g - (g - m) * spill; }
        else if (dom === 2) { const m = Math.max(r, g); if (b > m) d[i + 2] = b - (b - m) * spill; }
        else { const m = Math.max(g, b); if (r > m) d[i] = r - (r - m) * spill; }
      }
    }
    cx.putImageData(img, 0, 0);
  }
  function regionPath(cx, p, W, H) {
    const x = p.rx * W, y = p.ry * H, w = (p.rw * W) / 2, h = (p.rh * H) / 2;
    if (p.area === 'ellipse') cx.ellipse(x, y, Math.max(1, w), Math.max(1, h), 0, 0, Math.PI * 2);
    else cx.rect(x - w, y - h, w * 2, h * 2);
  }

  // ---------- stack API ----------
  FX.newEffect = (type, params) => {
    const d = FX.def(type); if (!d) return null;
    const p = {}; for (const prm of d.params) p[prm.key] = prm.def;
    return { id: C.uid('e_'), type, on: true, p: Object.assign(p, params || {}) };
  };
  FX.active = (effects, phase) => (effects || []).filter((e) => e.on !== false && FX.def(e.type) && FX.def(e.type).phase === phase);
  FX.hasLayer = (effects) => FX.active(effects, 'layer').length > 0;
  FX.applyPre = (s, effects, env) => { for (const e of FX.active(effects, 'pre')) FX.def(e.type).pre(s, e.p, env); };
  FX.shape = (effects) => { const e = FX.active(effects, 'shape')[0]; return e ? e.p : null; };
  FX.compositeFilter = (effects, W) => {
    const e = FX.active(effects, 'composite')[0]; if (!e) return 'none';
    const p = e.p, k = W / 1920, a = (p.angle * Math.PI) / 180, d = p.distance * 0.6 * k;
    return `drop-shadow(${(Math.cos(a) * d).toFixed(1)}px ${(Math.sin(a) * d).toFixed(1)}px ${(p.blur * 0.5 * k).toFixed(1)}px ${hexA(p.color, p.opacity / 100)})`;
  };
  // Run layer effects on canvas L ({cv, cx, W, H})
  FX.applyLayer = (L, effects, env) => {
    for (const e of FX.active(effects, 'layer')) {
      const d = FX.def(e.type); const p = e.p;
      try {
        if (d.region && p.area && p.area !== 'full') {
          const keep = FX.canvas('keep', L.W, L.H); const k = keep._cx; reset(k); k.clearRect(0, 0, L.W, L.H); k.drawImage(L.cv, 0, 0);
          d.apply(L, p, env);
          const cx = L.cx; reset(cx); cx.save(); cx.beginPath();
          if (!p.invert) { cx.rect(0, 0, L.W, L.H); regionPath(cx, p, L.W, L.H); cx.clip('evenodd'); } else { regionPath(cx, p, L.W, L.H); cx.clip(); }
          cx.globalCompositeOperation = 'copy'; cx.drawImage(keep, 0, 0); cx.restore(); reset(cx);
        } else d.apply(L, p, env);
      } catch (err) { console.warn('effect failed', e.type, err); }
      reset(L.cx);
    }
  };
  // Apply an effect stack to everything already drawn on ctx (adjustment / effect clips)
  FX.applyToCanvas = (ctx, effects, env, alpha = 1) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const cv = FX.canvas('adj', W, H); const L = { cv, cx: cv._cx, W, H };
    reset(L.cx); L.cx.clearRect(0, 0, W, H); L.cx.drawImage(ctx.canvas, 0, 0);
    FX.applyLayer(L, effects, env);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = C.clamp(alpha, 0, 1); ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.drawImage(cv, 0, 0); ctx.restore();
  };
  FX.seedOf = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h + 1; };

  // ---------- built-in presets ----------
  const mk = (type, p) => ({ type, on: true, p: Object.assign((() => { const o = {}; for (const prm of FX.def(type).params) o[prm.key] = prm.def; return o; })(), p || {}) });
  FX.BUILTIN_PRESETS = [
    { id: 'bp_vhs', name: 'Retro tape', builtin: true, effects: [mk('vhs', { amount: 70 }), mk('vignette', { amount: 45 })] },
    { id: 'bp_dream', name: 'Dreamy glow', builtin: true, effects: [mk('glow', { intensity: 90, radius: 35 }), mk('lightLeak', { intensity: 35 }), mk('particles', { type: 'bokeh', count: 25, size: 60, speed: 40 })] },
    { id: 'bp_cyber', name: 'Cyberpunk', builtin: true, effects: [mk('duotone', { dark: '#1a0640', light: '#00f0ff', amount: 70 }), mk('rgbSplit', { amount: 25 }), mk('glow', { intensity: 60 }), mk('scanlines', { opacity: 20 })] },
    { id: 'bp_film', name: 'Silent movie', builtin: true, effects: [mk('oldFilm', { amount: 90 }), mk('ink', { contrast: 160, brightness: 105 }), mk('letterbox', { size: 6 })] },
    { id: 'bp_music', name: 'Music video', builtin: true, effects: [mk('zoomPulse', { amount: 40, bpm: 120 }), mk('flash', { intensity: 35, bpm: 120 }), mk('glitch', { amount: 40, frequency: 25 })] },
    { id: 'bp_cam', name: 'Security cam', builtin: true, effects: [mk('ink', { contrast: 140, brightness: 100 }), mk('grain', { amount: 60 }), mk('scanlines', { opacity: 30 }), mk('vignette', { amount: 70 })] },
    { id: 'bp_comic', name: 'Comic book', builtin: true, effects: [mk('posterize', { levels: 4 }), mk('edges', { mode: 'sketch', mix: 55 })] },
    { id: 'bp_snow', name: 'Snow day', builtin: true, effects: [mk('tint', { color: '#7fb8ff', amount: 25, mode: 'soft-light' }), mk('particles', { type: 'snow', count: 160, size: 35, speed: 70 })] },
    { id: 'bp_party', name: 'Party time', builtin: true, effects: [mk('particles', { type: 'confetti', count: 120, size: 40 }), mk('lightLeak', { color1: '#ff2e88', color2: '#7c5cff', intensity: 45, speed: 4 })] },
    { id: 'bp_love', name: 'Lovestruck', builtin: true, effects: [mk('tint', { color: '#ff6b9a', amount: 30, mode: 'soft-light' }), mk('particles', { type: 'hearts', count: 40, size: 45, color: '#ff4d7d' }), mk('glow', { intensity: 40 })] },
  ];

  // ---------- thumbnails ----------
  let sample = null;
  FX.sampleImage = () => {
    const firstThumb = Object.values(C.project.media).map((m) => C.MR[m.id] && C.MR[m.id].thumbs && C.MR[m.id].thumbs[0] && C.MR[m.id].thumbs[0].img).find(Boolean);
    if (firstThumb) return firstThumb;
    if (sample) return sample;
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, '#2b5876'); g.addColorStop(0.55, '#f79d6b'); g.addColorStop(1, '#4e4376'); x.fillStyle = g; x.fillRect(0, 0, 320, 180);
    x.fillStyle = '#ffe29a'; x.beginPath(); x.arc(220, 95, 30, 0, 6.283); x.fill();
    x.fillStyle = '#1d1b38'; x.beginPath(); x.moveTo(0, 180); x.lineTo(0, 120); x.lineTo(70, 80); x.lineTo(130, 125); x.lineTo(190, 90); x.lineTo(260, 135); x.lineTo(320, 105); x.lineTo(320, 180); x.fill();
    x.fillStyle = '#2d2a52'; x.beginPath(); x.moveTo(0, 180); x.lineTo(0, 150); x.lineTo(90, 128); x.lineTo(170, 155); x.lineTo(250, 140); x.lineTo(320, 158); x.lineTo(320, 180); x.fill();
    x.fillStyle = '#19d3c5'; x.fillRect(40, 140, 8, 22); x.fillStyle = '#fff'; x.beginPath(); x.arc(44, 134, 6, 0, 6.283); x.fill();
    sample = c; return c;
  };
  const thumbCache = new Map();
  FX.thumb = (effects, key, w = 192, h = 108, t = 0.8) => {
    if (key && thumbCache.has(key)) return thumbCache.get(key);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); const src = FX.sampleImage();
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight, k = Math.max(w / sw, h / sh);
    cx.drawImage(src, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
    const env = { W: w, H: h, t, T: t, dur: 3, seed: 7 };
    const pre = { dx: 0, dy: 0, scale: 1, rot: 0 }; FX.applyPre(pre, effects, env);
    if (pre.dx || pre.dy || pre.scale !== 1 || pre.rot) {
      const T = FX.canvas('thumbpre', w, h); T._cx.clearRect(0, 0, w, h); T._cx.drawImage(cv, 0, 0);
      cx.clearRect(0, 0, w, h); cx.save(); cx.translate(w / 2 + pre.dx * w, h / 2 + pre.dy * h); cx.rotate((pre.rot * Math.PI) / 180); cx.scale(pre.scale, pre.scale); cx.drawImage(T, -w / 2, -h / 2); cx.restore();
    }
    FX.applyToCanvas(cx, effects, env);
    const sh2 = FX.shape(effects);
    if (sh2) { cx.save(); cx.globalCompositeOperation = 'destination-in'; cx.beginPath(); cx.roundRect(w * 0.12, h * 0.12, w * 0.76, h * 0.76, (Math.min(w, h) * sh2.radius) / 100); cx.fill(); cx.restore(); if (sh2.border) { cx.strokeStyle = sh2.color; cx.lineWidth = (sh2.border * w) / 900; cx.beginPath(); cx.roundRect(w * 0.12, h * 0.12, w * 0.76, h * 0.76, (Math.min(w, h) * sh2.radius) / 100); cx.stroke(); } }
    const url = cv.toDataURL('image/jpeg', 0.8);
    if (key) thumbCache.set(key, url);
    return url;
  };
  FX.clearThumbs = () => thumbCache.clear();
})(window.C);
