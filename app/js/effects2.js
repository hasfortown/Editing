/* Cutroom — extra effects pack (v1.5): distortions, motion, color looks, retro, light, stylize */
(function (C) {
  const FX = C.fx;
  const R = (key, label, min, max, def, step = 1, unit = '') => ({ key, label, type: 'range', min, max, def, step, unit });
  const COL = (key, label, def) => ({ key, label, type: 'color', def });
  const SEL = (key, label, options, def) => ({ key, label, type: 'select', options, def: def ?? options[0][0] });
  const BOOL = (key, label, def = false) => ({ key, label, type: 'bool', def });
  const REGION_KEYS = ['area', 'rx', 'ry', 'rw', 'rh', 'invert'];
  const REGION = () => FX.def('blur').params.filter((p) => REGION_KEYS.includes(p.key)).map((p) => Object.assign({}, p));
  const reset = (cx) => { cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.filter = 'none'; cx.imageSmoothingEnabled = true; cx.shadowColor = 'transparent'; cx.shadowBlur = 0; };
  const copyOf = (L, name = 'x1') => { const T = FX.canvas(name, L.W, L.H); reset(T._cx); T._cx.clearRect(0, 0, L.W, L.H); T._cx.drawImage(L.cv, 0, 0); return T; };
  const k1080 = (env) => Math.min(env.W, env.H) / 1080;
  const rnd = FX.rnd;
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const filterPass = (L, f) => { const T = copyOf(L); const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.filter = f; cx.drawImage(T, 0, 0); reset(cx); };
  // mesh distortion: map(x, y) in pixels -> [x, y]
  const meshWarp = (L, map, cols = 28, rows = 18) => { const T = copyOf(L, 'xmesh'); const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); C.geo.drawMesh(cx, T, L.W, L.H, cols, rows, (u, v) => map(u * L.W, v * L.H)); };
  // per-pixel colour op via LUT callback (r,g,b,l) -> [r,g,b]
  const pixelOp = (L, fn) => { const id = L.cx.getImageData(0, 0, L.W, L.H); const d = id.data; for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const r = d[i], g = d[i + 1], b = d[i + 2]; const o = fn(r, g, b, r * 0.299 + g * 0.587 + b * 0.114); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; } L.cx.putImageData(id, 0, 0); };
  const gradMap = (stops) => { const lut = []; for (let v = 0; v < 256; v++) { const t = v / 255; let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++; const [t0, c0] = stops[i], [t1, c1] = stops[i + 1]; const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1))); lut.push([0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k)); } return lut; };
  const THERMAL = gradMap([[0, [10, 0, 40]], [0.25, [60, 0, 160]], [0.45, [220, 0, 90]], [0.65, [255, 120, 0]], [0.85, [255, 230, 40]], [1, [255, 255, 230]]]);
  const rgb2h = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return [0, 0, mx / 255]; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, d / mx, mx / 255]; };

  // GPU colour maps (SVG component-transfer filters) for looks that would be slow per pixel
  const svgReady = () => {
    if (document.getElementById('cr-svg-filters2')) return;
    const at = (lut, ch) => Array.from({ length: 11 }, (_, i) => (lut[Math.round((i / 10) * 255)][ch] / 255).toFixed(3)).join(' ');
    const svg = `<svg id="cr-svg-filters2" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true"><defs>
      <filter id="cr-thermal" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="${at(THERMAL, 0)}"/><feFuncG type="table" tableValues="${at(THERMAL, 1)}"/><feFuncB type="table" tableValues="${at(THERMAL, 2)}"/></feComponentTransfer></filter>
      <filter id="cr-tealorange" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="0 0.17 0.5 0.84 1"/><feFuncG type="table" tableValues="0 0.27 0.52 0.77 0.97"/><feFuncB type="table" tableValues="0.08 0.36 0.52 0.66 0.85"/></feComponentTransfer></filter>
    </defs></svg>`;
    document.body.insertAdjacentHTML('beforeend', svg);
  };
  const mixFilter = (L, f, amount) => { svgReady(); const T = copyOf(L); const cx = L.cx; reset(cx); cx.globalAlpha = amount; cx.filter = f; cx.drawImage(T, 0, 0); reset(cx); cx.globalCompositeOperation = 'destination-in'; cx.drawImage(T, 0, 0); reset(cx); };
  let atlas = null;
  const glyphAtlas = () => { if (atlas) return atlas; const chars = ' .:-=+*#%@', gh = 64, gw = 38; const c = document.createElement('canvas'); c.width = gw * chars.length; c.height = gh; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.font = '700 60px Consolas, "Courier New", monospace'; x.textBaseline = 'middle'; x.textAlign = 'center'; [...chars].forEach((ch, i) => x.fillText(ch, i * gw + gw / 2, gh / 2 + 2)); atlas = { c, gw, gh, n: chars.length }; return atlas; };
  const DEFS = [
    // ---------- Blur & distort ----------
    { id: 'tiltShift', name: 'Tilt-shift (miniature)', cat: 'Blur & distort', icon: '🏙️', params: [R('blur', 'Blur', 0, 60, 18), R('center', 'Focus position', 0, 1, 0.55, 0.01), R('band', 'Focus size', 0.05, 0.8, 0.25, 0.01), R('sat', 'Saturation boost', 0, 100, 35)],
      apply: (L, p) => {
        const T = copyOf(L); const B = FX.canvas('xblur', L.W, L.H); const b = B._cx; reset(b); b.clearRect(0, 0, L.W, L.H); b.filter = `blur(${(p.blur * L.W) / 1920}px) saturate(${1 + p.sat / 100})`; b.drawImage(T, 0, 0); b.filter = 'none';
        const c = p.center * L.H, h = (p.band * L.H) / 2; const g = b.createLinearGradient(0, 0, 0, L.H);
        const s = (y) => Math.min(1, Math.max(0, y / L.H));
        g.addColorStop(0, '#000'); g.addColorStop(s(c - h * 2), '#000'); g.addColorStop(s(c - h * 0.6), 'rgba(0,0,0,0)'); g.addColorStop(s(c + h * 0.6), 'rgba(0,0,0,0)'); g.addColorStop(s(c + h * 2), '#000'); g.addColorStop(1, '#000');
        b.globalCompositeOperation = 'destination-in'; b.fillStyle = g; b.fillRect(0, 0, L.W, L.H); reset(b);
        const cx = L.cx; reset(cx); cx.filter = `saturate(${1 + p.sat / 100})`; cx.clearRect(0, 0, L.W, L.H); cx.drawImage(T, 0, 0); cx.filter = 'none'; cx.drawImage(B, 0, 0);
      } },
    { id: 'bulge', name: 'Bulge / fisheye', cat: 'Blur & distort', icon: '🔮', point: true, params: [R('amount', 'Amount', -100, 100, 55), R('radius', 'Radius', 5, 100, 45, 1, '%'), R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001)],
      apply: (L, p) => { const cx0 = p.x * L.W, cy0 = p.y * L.H, R0 = (p.radius / 100) * Math.max(L.W, L.H) * 0.6, k = p.amount / 100; const gam = k >= 0 ? 1 / (1 + k * 1.2) : 1 - k * 1.2; meshWarp(L, (x, y) => { const dx = x - cx0, dy = y - cy0, d = Math.hypot(dx, dy); if (d >= R0 || !d) return [x, y]; const nd = R0 * Math.pow(d / R0, gam); return [cx0 + (dx / d) * nd, cy0 + (dy / d) * nd]; }, 36, 24); } },
    { id: 'swirl', name: 'Swirl', cat: 'Blur & distort', icon: '🌀', point: true, params: [R('angle', 'Twist', -720, 720, 180, 1, '°'), R('radius', 'Radius', 5, 100, 45, 1, '%'), R('spin', 'Animate', -360, 360, 0, 1, '°/s'), R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001)],
      apply: (L, p, env) => { const cx0 = p.x * L.W, cy0 = p.y * L.H, R0 = (p.radius / 100) * Math.max(L.W, L.H) * 0.6; const ang = ((p.angle + p.spin * env.t) * Math.PI) / 180; meshWarp(L, (x, y) => { const dx = x - cx0, dy = y - cy0, d = Math.hypot(dx, dy); if (d >= R0) return [x, y]; const a = ang * Math.pow(1 - d / R0, 2); const c = Math.cos(a), s = Math.sin(a); return [cx0 + dx * c - dy * s, cy0 + dx * s + dy * c]; }, 40, 26); } },
    { id: 'waterRipple', name: 'Water ripple', cat: 'Blur & distort', icon: '💧', point: true, params: [R('amp', 'Strength', 0, 100, 35), R('waves', 'Rings', 2, 40, 12), R('speed', 'Speed', 0, 20, 5), R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001)],
      apply: (L, p, env) => { const cx0 = p.x * L.W, cy0 = p.y * L.H, D = Math.hypot(L.W, L.H); const A = (p.amp / 100) * k1080(env) * 18; meshWarp(L, (x, y) => { const dx = x - cx0, dy = y - cy0, d = Math.hypot(dx, dy) || 1; const w = Math.sin((d / D) * p.waves * Math.PI * 2 - env.t * p.speed) * A * (1 - Math.min(1, d / D)); return [x + (dx / d) * w, y + (dy / d) * w]; }, 40, 26); } },
    { id: 'heatWave', name: 'Heat haze', cat: 'Blur & distort', icon: '🔥', params: [R('amount', 'Strength', 0, 100, 40), R('speed', 'Speed', 0, 20, 6)],
      apply: (L, p, env) => { const A = (p.amount / 100) * L.W * 0.008; meshWarp(L, (x, y) => [x + Math.sin(y * 0.035 * (1080 / L.H) + env.t * p.speed) * A + Math.sin(y * 0.09 * (1080 / L.H) - env.t * p.speed * 1.7) * A * 0.4, y + Math.cos(x * 0.02 * (1920 / L.W) + env.t * p.speed * 0.6) * A * 0.3], 24, 40); } },
    { id: 'spinBlurFx', name: 'Radial spin blur', cat: 'Blur & distort', icon: '💫', point: true, params: [R('amount', 'Amount', 0, 100, 30), R('x', 'Center X', 0, 1, 0.5, 0.001), R('y', 'Center Y', 0, 1, 0.5, 0.001)],
      apply: (L, p) => { const T = copyOf(L); const cx = L.cx; reset(cx); const ox = p.x * L.W, oy = p.y * L.H, n = 9, a = (p.amount / 100) * 0.12; for (let i = 1; i <= n; i++) { const r = ((i / n) - 0.5) * a; cx.globalAlpha = 1 / (i + 1); cx.setTransform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), ox - ox * Math.cos(r) + oy * Math.sin(r), oy - ox * Math.sin(r) - oy * Math.cos(r)); cx.drawImage(T, 0, 0); } reset(cx); } },
    { id: 'splitScreen', name: 'Split screen / tiles', cat: 'Blur & distort', icon: '🔲', params: [SEL('layout', 'Layout', [['2h', '2 side by side'], ['3h', '3 columns'], ['3v', '3 rows'], ['4', '2 × 2'], ['9', '3 × 3'], ['16', '4 × 4']], '4'), R('gap', 'Gap', 0, 40, 0), COL('gapColor', 'Gap color', '#000000')],
      apply: (L, p, env) => {
        const T = copyOf(L); const cx = L.cx; reset(cx); cx.fillStyle = p.gapColor; cx.fillRect(0, 0, L.W, L.H);
        const [c, r] = { '2h': [2, 1], '3h': [3, 1], '3v': [1, 3], '4': [2, 2], '9': [3, 3], '16': [4, 4] }[p.layout] || [2, 2];
        const g = p.gap * k1080(env); const w = (L.W - g * (c + 1)) / c, h = (L.H - g * (r + 1)) / r;
        for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) { const s = Math.max(w / L.W, h / L.H); const sw = w / s, sh = h / s; cx.drawImage(T, (L.W - sw) / 2, (L.H - sh) / 2, sw, sh, g + i * (w + g), g + j * (h + g), w, h); }
      } },
    // ---------- Motion ----------
    { id: 'heartbeat', name: 'Heartbeat', cat: 'Motion', icon: '💓', phase: 'pre', params: [R('amount', 'Strength', 0, 100, 40), R('bpm', 'Tempo', 30, 200, 70, 1, ' bpm')],
      pre: (s, p, env) => { const ph = ((env.t * p.bpm) / 60) % 1; const beat = Math.exp(-Math.pow((ph - 0.05) / 0.05, 2)) + 0.7 * Math.exp(-Math.pow((ph - 0.25) / 0.05, 2)); s.scale *= 1 + (p.amount / 100) * 0.12 * beat; } },
    { id: 'sway', name: 'Sway', cat: 'Motion', icon: '🍃', phase: 'pre', params: [R('angle', 'Angle', 0, 30, 6, 0.5, '°'), R('speed', 'Speed', 0.2, 6, 1, 0.1)],
      pre: (s, p, env) => { s.rot += Math.sin(env.t * p.speed * Math.PI) * p.angle; s.scale *= 1 + (p.angle / 30) * 0.1; } },
    { id: 'bounce', name: 'Bounce', cat: 'Motion', icon: '🏀', phase: 'pre', params: [R('height', 'Height', 0, 100, 30), R('speed', 'Bounces / sec', 0.2, 6, 1.5, 0.1)],
      pre: (s, p, env) => { const ph = (env.t * p.speed) % 1; s.dy -= Math.abs(Math.sin(ph * Math.PI)) * (p.height / 100) * 0.12; const sq = ph < 0.08 || ph > 0.92 ? 0.04 * (p.height / 100) : 0; s.scale *= 1 - sq; } },
    { id: 'earthquake', name: 'Earthquake', cat: 'Motion', icon: '🌋', phase: 'pre', params: [R('intensity', 'Intensity', 0, 100, 60)],
      pre: (s, p, env) => { const k = p.intensity / 100; const n = Math.floor(env.t * 30); s.dx += (rnd(n * 1.7) - 0.5) * k * 0.06; s.dy += (rnd(n * 3.1 + 9) - 0.5) * k * 0.06; s.rot += (rnd(n * 5.3 + 2) - 0.5) * k * 3; s.scale *= 1 + k * 0.08; } },
    { id: 'punchZoom', name: 'Punch zoom', cat: 'Motion', icon: '👊', phase: 'pre', params: [R('amount', 'Zoom', 0, 100, 35, 1, '%'), R('at', 'Hit at', 0, 10, 0, 0.05, 's'), R('decay', 'Settle', 1, 20, 6)],
      pre: (s, p, env) => { const dt = env.t - p.at; if (dt < 0) return; s.scale *= 1 + (p.amount / 100) * Math.exp(-dt * p.decay) * (dt < 0.05 ? dt / 0.05 : 1); } },
    { id: 'kenBurns', name: 'Ken Burns pan', cat: 'Motion', icon: '🎞️', phase: 'pre', params: [R('zoom', 'Zoom', 0, 60, 18, 1, '%'), SEL('dir', 'Direction', [['lr', 'Left → right'], ['rl', 'Right → left'], ['tb', 'Top → bottom'], ['bt', 'Bottom → top'], ['in', 'Zoom in only']], 'lr')],
      pre: (s, p, env) => { const t = C.clamp(env.t / Math.max(0.1, env.dur), 0, 1); const e = t * t * (3 - 2 * t); const z = 1 + (p.zoom / 100) * (0.4 + 0.6 * e); s.scale *= z; const m = ((z - 1) / 2) * (e * 2 - 1); if (p.dir === 'lr') s.dx -= m; if (p.dir === 'rl') s.dx += m; if (p.dir === 'tb') s.dy -= m; if (p.dir === 'bt') s.dy += m; } },
    { id: 'wobble', name: 'Wobble', cat: 'Motion', icon: '🍮', phase: 'pre', params: [R('amount', 'Amount', 0, 100, 35), R('speed', 'Speed', 1, 20, 6)],
      pre: (s, p, env) => { const k = p.amount / 100; s.rot += Math.sin(env.t * p.speed) * 4 * k; s.scale *= 1 + Math.sin(env.t * p.speed * 1.7) * 0.04 * k; s.dx += Math.sin(env.t * p.speed * 0.7) * 0.01 * k; } },
    // ---------- Color ----------
    { id: 'noir', name: 'Noir', cat: 'Color', icon: '🕵️', region: true, params: [R('contrast', 'Contrast', 0, 100, 55), R('grain', 'Grain', 0, 100, 20)],
      apply: (L, p, env) => { filterPass(L, `grayscale(1) contrast(${1 + p.contrast / 80}) brightness(0.95)`); if (p.grain) { const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'overlay'; cx.globalAlpha = p.grain / 250; const s = Math.max(2, 3 * k1080(env)); for (let i = 0; i < 900; i++) { const r = rnd(i + Math.floor(env.t * 24) * 997); cx.fillStyle = r > 0.5 ? '#fff' : '#000'; cx.fillRect(rnd(i * 3.3 + r) * L.W, rnd(i * 7.7 + r) * L.H, s, s); } reset(cx); } } },
    { id: 'sepiaTone', name: 'Sepia', cat: 'Color', icon: '📜', region: true, params: [R('amount', 'Amount', 0, 100, 80)], apply: (L, p) => filterPass(L, `sepia(${p.amount / 100}) contrast(1.05)`) },
    { id: 'invertFx', name: 'Invert', cat: 'Color', icon: '🔄', region: true, params: [R('amount', 'Amount', 0, 100, 100)], apply: (L, p) => filterPass(L, `invert(${p.amount / 100})`) },
    { id: 'thermal', name: 'Thermal camera', cat: 'Color', icon: '🌡️', region: true, params: [R('amount', 'Mix', 0, 100, 100)],
      apply: (L, p) => mixFilter(L, 'grayscale(1) url(#cr-thermal)', p.amount / 100) },
    { id: 'nightVision', name: 'Night vision', cat: 'Color', icon: '🪖', params: [R('noise', 'Noise', 0, 100, 40), R('vignette', 'Vignette', 0, 100, 70)],
      apply: (L, p, env) => {
        filterPass(L, 'grayscale(1) brightness(1.5) contrast(1.3)'); const cx = L.cx; reset(cx);
        cx.globalCompositeOperation = 'multiply'; cx.fillStyle = '#39ff6a'; cx.fillRect(0, 0, L.W, L.H);
        cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = p.noise / 300; const s = Math.max(1, 2 * k1080(env)); for (let i = 0; i < 2500; i++) { const r = rnd(i + Math.floor(env.t * 30) * 131); cx.fillStyle = r > 0.5 ? '#b8ffc4' : '#001a05'; cx.fillRect(rnd(i * 1.3 + r) * L.W, rnd(i * 2.9 + r) * L.H, s, s); }
        cx.globalAlpha = 0.12; cx.fillStyle = '#000'; for (let y = 0; y < L.H; y += 4 * k1080(env) + 1) cx.fillRect(0, y, L.W, 1);
        cx.globalAlpha = p.vignette / 100; const g = cx.createRadialGradient(L.W / 2, L.H / 2, Math.min(L.W, L.H) * 0.3, L.W / 2, L.H / 2, Math.hypot(L.W, L.H) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); cx.fillStyle = g; cx.fillRect(0, 0, L.W, L.H); reset(cx);
      } },
    { id: 'colorPop', name: 'Color pop (keep one color)', cat: 'Color', icon: '🌹', region: true, params: [COL('color', 'Keep color', '#e0283c'), R('range', 'Range', 5, 90, 28), R('soft', 'Softness', 0, 60, 15)],
      apply: (L, p) => {
        const [cr, cg, cb] = hex(p.color); const [h0] = rgb2h(cr, cg, cb);
        const sw = Math.max(1, Math.round(L.W / 4)), sh = Math.max(1, Math.round(L.H / 4)); const S = FX.canvas('xpop', sw, sh); const sx = S._cx; reset(sx); sx.clearRect(0, 0, sw, sh); sx.drawImage(L.cv, 0, 0, sw, sh);
        const id = sx.getImageData(0, 0, sw, sh); const d = id.data;
        for (let i = 0; i < d.length; i += 4) { const [h, sat] = rgb2h(d[i], d[i + 1], d[i + 2]); let dd = Math.abs(h - h0); dd = Math.min(dd, 360 - dd); const keep = sat < 0.18 ? 0 : C.clamp(1 - (dd - p.range) / Math.max(1, p.soft), 0, 1); d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = keep * 255; }
        sx.putImageData(id, 0, 0);
        const T = copyOf(L); const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.filter = 'grayscale(1)'; cx.drawImage(T, 0, 0); cx.filter = 'none';
        const K = FX.canvas('xpop2', L.W, L.H); const k = K._cx; reset(k); k.clearRect(0, 0, L.W, L.H); k.drawImage(T, 0, 0); k.globalCompositeOperation = 'destination-in'; k.imageSmoothingQuality = 'high'; k.drawImage(S, 0, 0, L.W, L.H); reset(k);
        cx.drawImage(K, 0, 0);
      } },
    { id: 'tealOrange', name: 'Teal & orange', cat: 'Color', icon: '🎬', region: true, params: [R('amount', 'Strength', 0, 100, 60)],
      apply: (L, p) => mixFilter(L, 'url(#cr-tealorange) saturate(1.15)', p.amount / 100) },
    { id: 'rainbowShift', name: 'Rainbow shift', cat: 'Color', icon: '🌈', params: [R('amount', 'Strength', 0, 100, 45), R('speed', 'Speed', 0, 10, 2)],
      apply: (L, p, env) => { const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'color'; cx.globalAlpha = p.amount / 100; const o = (env.t * p.speed * 0.2) % 1; const g = cx.createLinearGradient(0, 0, L.W, L.H); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${((i / 6 + o) * 360) % 360},90%,55%)`); cx.fillStyle = g; cx.fillRect(0, 0, L.W, L.H); cx.globalCompositeOperation = 'destination-in'; cx.globalAlpha = 1; reset(cx); } },
    { id: 'bleach', name: 'Bleach bypass', cat: 'Color', icon: '🧪', region: true, params: [R('amount', 'Amount', 0, 100, 60)], apply: (L, p) => filterPass(L, `saturate(${1 - p.amount / 160}) contrast(${1 + p.amount / 140}) brightness(${1 + p.amount / 900})`) },
    // ---------- Retro ----------
    { id: 'halftone', name: 'Halftone dots', cat: 'Retro', icon: '🔴', region: true, params: [R('size', 'Dot size', 4, 60, 14), BOOL('color', 'Keep colors', true), COL('ink', 'Ink', '#111111'), COL('paper', 'Paper', '#f4efe2')],
      apply: (L, p, env) => {
        const s = Math.max(3, p.size * k1080(env)); const sw = Math.ceil(L.W / s), sh = Math.ceil(L.H / s);
        const S = FX.canvas('xsmall', sw, sh); reset(S._cx); S._cx.clearRect(0, 0, sw, sh); S._cx.drawImage(L.cv, 0, 0, sw, sh); const d = S._cx.getImageData(0, 0, sw, sh).data;
        const cx = L.cx; reset(cx); cx.fillStyle = p.paper; cx.fillRect(0, 0, L.W, L.H);
        for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const k = (j * sw + i) * 4; if (d[k + 3] < 10) continue; const l = (d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114) / 255; const r = (s / 2) * Math.sqrt(1 - l) * 1.25; if (r < 0.4) continue; cx.fillStyle = p.color ? `rgb(${d[k] * 0.85},${d[k + 1] * 0.85},${d[k + 2] * 0.85})` : p.ink; cx.beginPath(); cx.arc(i * s + s / 2 + ((j % 2) * s) / 2, j * s + s / 2, r, 0, 6.283); cx.fill(); }
      } },
    { id: 'crt', name: 'CRT monitor', cat: 'Retro', icon: '📺', params: [R('curve', 'Curvature', 0, 100, 40), R('lines', 'Scanlines', 0, 100, 45), R('rgb', 'Color fringe', 0, 100, 30), R('flicker', 'Flicker', 0, 100, 20)],
      apply: (L, p, env) => {
        const k = p.curve / 100 * 0.18; const W = L.W, H = L.H;
        if (k) meshWarp(L, (x, y) => { const u = x / W * 2 - 1, v = y / H * 2 - 1; const f = 1 + k * (u * u + v * v) * 0.5; return [(u / f + 1) * W / 2, (v / f + 1) * H / 2]; }, 24, 16);
        const cx = L.cx; reset(cx);
        if (p.rgb) { const T = copyOf(L, 'xcrt'); const o = (p.rgb / 100) * 3 * k1080(env); cx.globalCompositeOperation = 'screen'; cx.globalAlpha = 0.35; cx.filter = 'sepia(1) saturate(6) hue-rotate(-50deg)'; cx.drawImage(T, o, 0); cx.filter = 'sepia(1) saturate(6) hue-rotate(160deg)'; cx.drawImage(T, -o, 0); reset(cx); }
        if (p.lines) { cx.globalAlpha = p.lines / 160; cx.fillStyle = '#000'; const st = Math.max(2, 3 * k1080(env)); for (let y = 0; y < H; y += st) cx.fillRect(0, y, W, st / 2); }
        cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-atop'; const g = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.65)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        if (p.flicker) { cx.globalAlpha = (p.flicker / 100) * 0.12 * rnd(Math.floor(env.t * 24)); cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H); }
        reset(cx);
      } },
    { id: 'eightBit', name: '8-bit game', cat: 'Retro', icon: '👾', region: true, params: [R('size', 'Pixel size', 2, 40, 10), SEL('colors', 'Colors', [['4', '4 levels'], ['3', '3 levels'], ['6', '6 levels']], '4')],
      apply: (L, p, env) => { const s = Math.max(2, p.size * k1080(env)); const sw = Math.ceil(L.W / s), sh = Math.ceil(L.H / s); const S = FX.canvas('xsmall', sw, sh); reset(S._cx); S._cx.clearRect(0, 0, sw, sh); S._cx.filter = `saturate(1.4) url(#cr-post-${p.colors})`; S._cx.drawImage(L.cv, 0, 0, sw, sh); S._cx.filter = 'none'; const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.imageSmoothingEnabled = false; cx.drawImage(S, 0, 0, sw, sh, 0, 0, sw * s, sh * s); reset(cx); } },
    { id: 'datamosh', name: 'Datamosh', cat: 'Retro', icon: '🧩', params: [R('amount', 'Amount', 0, 100, 45), R('block', 'Block size', 8, 120, 40), R('speed', 'Speed', 1, 30, 10)],
      apply: (L, p, env) => { const T = copyOf(L); const cx = L.cx; reset(cx); const n = Math.round((p.amount / 100) * 40); const b = p.block * k1080(env); const f = Math.floor(env.t * p.speed); for (let i = 0; i < n; i++) { const r = rnd(f * 97 + i * 13); const x = rnd(i * 7.1 + f) * L.W, y = rnd(i * 3.7 + f * 1.3) * L.H; const w = b * (1 + r * 3), h = b * (0.5 + rnd(i + f) * 1.5); cx.drawImage(T, x, y, w, h, x + (r - 0.5) * b * 3, y + (rnd(i * 2.2 + f) - 0.5) * b, w, h); } if (rnd(f * 3.3) < p.amount / 200) { cx.globalCompositeOperation = 'difference'; cx.globalAlpha = 0.25; cx.drawImage(T, b * 0.3, 0); } reset(cx); } },
    { id: 'filmDamage', name: 'Film scratches & dust', cat: 'Retro', icon: '🎞️', params: [R('scratches', 'Scratches', 0, 100, 45), R('dust', 'Dust', 0, 100, 50), R('jitter', 'Gate weave', 0, 100, 30)],
      apply: (L, p, env) => {
        const f = Math.floor(env.t * 24); const cx = L.cx; const kk = k1080(env);
        if (p.jitter) { const T = copyOf(L); reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.drawImage(T, 0, (rnd(f * 1.9) - 0.5) * (p.jitter / 100) * 6 * kk); }
        reset(cx); cx.strokeStyle = 'rgba(255,255,240,.55)';
        const ns = Math.round((p.scratches / 100) * 4); for (let i = 0; i < ns; i++) { if (rnd(f * 0.37 + i * 9) > 0.6) continue; const x = rnd(Math.floor(f / 6) * 5 + i * 31) * L.W + (rnd(f + i) - 0.5) * 4; cx.lineWidth = (0.6 + rnd(i + f) * 1.4) * kk; cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x + (rnd(i * 4 + f) - 0.5) * 20, L.H); cx.stroke(); }
        const nd = Math.round((p.dust / 100) * 30); for (let i = 0; i < nd; i++) { const r = rnd(f * 13 + i * 7); if (r > 0.5) continue; cx.fillStyle = r < 0.25 ? 'rgba(0,0,0,.7)' : 'rgba(255,255,240,.7)'; cx.beginPath(); cx.ellipse(rnd(i * 3.1 + f) * L.W, rnd(i * 5.7 + f) * L.H, (1 + rnd(i) * 4) * kk, (0.6 + rnd(i * 2) * 2) * kk, rnd(i + f) * 3, 0, 6.283); cx.fill(); }
        reset(cx);
      } },
    // ---------- Light ----------
    { id: 'godRays', name: 'God rays', cat: 'Light', icon: '🌤️', point: true, params: [R('intensity', 'Intensity', 0, 100, 55), R('length', 'Length', 0, 100, 50), R('threshold', 'Brightness threshold', 0, 100, 60), R('x', 'Light X', 0, 1, 0.5, 0.001), R('y', 'Light Y', 0, 1, 0.2, 0.001)],
      apply: (L, p) => {
        const B = FX.canvas('xrays', L.W / 2, L.H / 2); const b = B._cx; reset(b); b.clearRect(0, 0, B.width, B.height);
        b.filter = `brightness(${0.4 + (100 - p.threshold) / 120}) contrast(${2 + p.threshold / 20}) grayscale(0.3)`; b.drawImage(L.cv, 0, 0, B.width, B.height); b.filter = 'none';
        const R2 = FX.canvas('xrays2', B.width, B.height); const r = R2._cx; reset(r); r.clearRect(0, 0, B.width, B.height);
        const ox = p.x * B.width, oy = p.y * B.height, n = 14, len = (p.length / 100) * 0.6;
        for (let i = 0; i < n; i++) { const s = 1 + len * (i / n); r.globalAlpha = (1 - i / n) * 0.35; r.setTransform(s, 0, 0, s, ox - ox * s, oy - oy * s); r.drawImage(B, 0, 0); }
        const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'screen'; cx.globalAlpha = p.intensity / 70; cx.drawImage(R2, 0, 0, L.W, L.H); reset(cx);
      } },
    { id: 'neonEdges', name: 'Neon edges', cat: 'Light', icon: '🟣', params: [COL('color', 'Glow color', '#ff2bd6'), R('glow', 'Glow', 0, 100, 60), R('dark', 'Darken picture', 0, 100, 70), BOOL('rainbow', 'Rainbow cycle', false)],
      apply: (L, p, env) => {
        const E = FX.canvas('xedge', L.W, L.H); const e = E._cx; reset(e); e.clearRect(0, 0, L.W, L.H); e.filter = 'grayscale(1) url(#cr-edge) brightness(3) contrast(2)'; e.drawImage(L.cv, 0, 0); e.filter = 'none';
        e.globalCompositeOperation = 'multiply'; e.fillStyle = p.rainbow ? `hsl(${(env.t * 90) % 360},100%,60%)` : p.color; e.fillRect(0, 0, L.W, L.H); reset(e);
        const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = p.dark / 100; cx.fillStyle = '#000'; cx.fillRect(0, 0, L.W, L.H); reset(cx);
        cx.globalCompositeOperation = 'lighter'; cx.filter = `blur(${(p.glow / 100) * 10 * k1080(env)}px)`; cx.drawImage(E, 0, 0); cx.drawImage(E, 0, 0); cx.filter = 'none'; cx.drawImage(E, 0, 0); reset(cx);
      } },
    { id: 'disco', name: 'Disco lights', cat: 'Light', icon: '🪩', params: [R('intensity', 'Intensity', 0, 100, 60), R('speed', 'Speed', 0, 10, 3), R('count', 'Lights', 1, 8, 4)],
      apply: (L, p, env) => { const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'overlay'; cx.globalAlpha = p.intensity / 100; for (let i = 0; i < p.count; i++) { const a = env.t * p.speed * (0.6 + i * 0.17) + i * 2.1; const x = L.W / 2 + Math.cos(a) * L.W * 0.38, y = L.H / 2 + Math.sin(a * 1.3) * L.H * 0.35; const r = Math.max(L.W, L.H) * 0.35; const g = cx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `hsla(${(i * 75 + env.t * 40) % 360},100%,60%,1)`); g.addColorStop(1, 'hsla(0,0%,50%,0)'); cx.fillStyle = g; cx.fillRect(0, 0, L.W, L.H); } reset(cx); } },
    { id: 'blink', name: 'Blink / fade pulse', cat: 'Light', icon: '😑', params: [R('rate', 'Blinks / sec', 0.2, 10, 1.5, 0.1), R('depth', 'Depth', 0, 100, 100), COL('color', 'Color', '#000000')],
      apply: (L, p, env) => { const ph = (env.t * p.rate) % 1; const a = (ph > 0.75 ? Math.sin(((ph - 0.75) / 0.25) * Math.PI) : 0) * (p.depth / 100); if (a < 0.01) return; const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = a; cx.fillStyle = p.color; cx.fillRect(0, 0, L.W, L.H); reset(cx); } },
    { id: 'shine', name: 'Shine sweep', cat: 'Light', icon: '✨', params: [R('width', 'Width', 2, 60, 18), R('speed', 'Sweeps / sec', 0.1, 3, 0.6, 0.05), R('angle', 'Angle', -60, 60, 25, 1, '°'), R('intensity', 'Intensity', 0, 100, 70)],
      apply: (L, p, env) => { const cx = L.cx; reset(cx); const ph = (env.t * p.speed) % 1.4; const x = (ph / 1.2) * (L.W * 1.6) - L.W * 0.3; const w = (p.width / 100) * L.W; cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = p.intensity / 100; cx.translate(x, L.H / 2); cx.rotate((p.angle * Math.PI) / 180); const g = cx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = g; cx.fillRect(-w / 2, -L.H * 1.5, w, L.H * 3); reset(cx); } },
    // ---------- Stylize ----------
    { id: 'sketch', name: 'Pencil sketch', cat: 'Stylize', icon: '✏️', region: true, params: [R('strength', 'Line strength', 0, 100, 60), BOOL('color', 'Colored pencil', false)],
      apply: (L, p) => {
        const T = copyOf(L); const E = FX.canvas('xedge', L.W, L.H); const e = E._cx; reset(e); e.clearRect(0, 0, L.W, L.H); e.filter = `grayscale(1) url(#cr-edge) brightness(${1.5 + p.strength / 25}) invert(1)`; e.drawImage(T, 0, 0); e.filter = 'none';
        const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.fillStyle = '#fbfaf6'; cx.fillRect(0, 0, L.W, L.H);
        if (p.color) { cx.globalAlpha = 0.45; cx.filter = 'saturate(1.4) brightness(1.15)'; cx.drawImage(T, 0, 0); cx.filter = 'none'; cx.globalAlpha = 1; }
        cx.globalCompositeOperation = 'multiply'; cx.drawImage(E, 0, 0); cx.globalCompositeOperation = 'destination-in'; cx.drawImage(T, 0, 0); reset(cx);
      } },
    { id: 'comic', name: 'Comic book', cat: 'Stylize', icon: '💥', region: true, params: [R('levels', 'Color levels', 2, 8, 4), R('ink', 'Ink lines', 0, 100, 70)],
      apply: (L, p) => {
        const T = copyOf(L); const E = FX.canvas('xedge', L.W, L.H); const e = E._cx; reset(e); e.clearRect(0, 0, L.W, L.H); e.filter = `grayscale(1) url(#cr-edge) brightness(${2 + p.ink / 20}) contrast(3) invert(1)`; e.drawImage(T, 0, 0); e.filter = 'none';
        const cx = L.cx; reset(cx); cx.clearRect(0, 0, L.W, L.H); cx.filter = `saturate(1.6) contrast(1.2) url(#cr-post-${Math.round(p.levels)})`; cx.drawImage(T, 0, 0); cx.filter = 'none';
        cx.globalCompositeOperation = 'multiply'; cx.globalAlpha = p.ink / 100; cx.drawImage(E, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'destination-in'; cx.drawImage(T, 0, 0); reset(cx);
      } },
    { id: 'ascii', name: 'ASCII art', cat: 'Stylize', icon: '🔤', params: [R('size', 'Character size', 6, 40, 14), BOOL('color', 'Keep colors', true), COL('fg', 'Text color', '#39ff6a'), COL('bg', 'Background', '#050805')],
      apply: (L, p, env) => {
        const A = glyphAtlas(); const ch = Math.max(5, p.size * k1080(env)), cw = ch * 0.6; const sw = Math.ceil(L.W / cw), sh = Math.ceil(L.H / ch);
        const S = FX.canvas('xsmall', sw, sh); reset(S._cx); S._cx.clearRect(0, 0, sw, sh); S._cx.drawImage(L.cv, 0, 0, sw, sh); const d = S._cx.getImageData(0, 0, sw, sh).data;
        const G = FX.canvas('xglyph', L.W, L.H); const g = G._cx; reset(g); g.clearRect(0, 0, L.W, L.H);
        for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const k = (j * sw + i) * 4; const l = (d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114) / 255; const gi = Math.min(A.n - 1, Math.floor(l * A.n)); if (!gi) continue; g.drawImage(A.c, gi * A.gw, 0, A.gw, A.gh, i * cw, j * ch, cw, ch); }
        g.globalCompositeOperation = 'source-in'; if (p.color) { g.imageSmoothingEnabled = false; g.filter = 'saturate(1.3) brightness(1.2)'; g.drawImage(S, 0, 0, sw, sh, 0, 0, sw * cw, sh * ch); g.filter = 'none'; } else { g.fillStyle = p.fg; g.fillRect(0, 0, L.W, L.H); } reset(g);
        const cx = L.cx; reset(cx); cx.fillStyle = p.bg; cx.fillRect(0, 0, L.W, L.H); cx.drawImage(G, 0, 0);
      } },
    { id: 'outline', name: 'Outline / ink', cat: 'Stylize', icon: '🖋️', region: true, params: [COL('color', 'Line color', '#ffffff'), R('strength', 'Strength', 0, 100, 60), R('fill', 'Keep picture', 0, 100, 30)],
      apply: (L, p) => {
        const T = copyOf(L); const E = FX.canvas('xedge', L.W, L.H); const e = E._cx; reset(e); e.clearRect(0, 0, L.W, L.H); e.filter = `grayscale(1) url(#cr-edge) brightness(${2 + p.strength / 15}) contrast(2)`; e.drawImage(T, 0, 0); e.filter = 'none'; e.globalCompositeOperation = 'multiply'; e.fillStyle = p.color; e.fillRect(0, 0, L.W, L.H); reset(e);
        const cx = L.cx; reset(cx); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = 1 - p.fill / 100; cx.fillStyle = '#000'; cx.fillRect(0, 0, L.W, L.H); reset(cx); cx.globalCompositeOperation = 'lighter'; cx.drawImage(E, 0, 0); reset(cx);
      } },
  ];
  for (const d of DEFS) {
    d.phase = d.phase || 'layer';
    if (d.region) d.params = d.params.concat(REGION());
    if (!FX.def(d.id)) FX.DEFS.push(d);
  }

  // a few more preset looks built from the new effects
  const mk = (type, params) => ({ type, p: params || {} });
  const more = [
    { id: 'bp_miniature', name: 'Miniature world', builtin: true, effects: [mk('tiltShift', { blur: 22, sat: 45 })] },
    { id: 'bp_arcade', name: 'Arcade', builtin: true, effects: [mk('eightBit', { size: 8 }), mk('crt', { curve: 30, lines: 40, rgb: 30 })] },
    { id: 'bp_oldmovie', name: 'Old movie', builtin: true, effects: [mk('sepiaTone', { amount: 70 }), mk('filmDamage', { scratches: 60, dust: 60, jitter: 40 }), mk('vignette')] },
    { id: 'bp_comic', name: 'Comic strip', builtin: true, effects: [mk('comic', { levels: 4, ink: 80 }), mk('halftone', { size: 8, color: true })] },
    { id: 'bp_club', name: 'Club night', builtin: true, effects: [mk('disco', { intensity: 70, speed: 4 }), mk('heartbeat', { amount: 40, bpm: 124 })] },
    { id: 'bp_blockbuster', name: 'Blockbuster', builtin: true, effects: [mk('tealOrange', { amount: 70 }), mk('letterbox')] },
  ];
  if (Array.isArray(FX.BUILTIN_PRESETS)) for (const p of more) {
    p.effects = p.effects.filter((e) => FX.def(e.type)).map((e) => { const n = FX.newEffect(e.type, e.p); delete n.id; return n; });
    if (!FX.BUILTIN_PRESETS.some((x) => x.id === p.id)) FX.BUILTIN_PRESETS.push(p);
  }
})(window.C);
