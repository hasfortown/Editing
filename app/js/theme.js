/* Cutroom — themes & appearance */
(function (C) {
  const TH = (C.theme = {});
  const DARK = { bg: '#0d0e12', bg2: '#121318', panel: '#16171d', panel2: '#1c1d24', panel3: '#23252e', line: '#262832', line2: '#30333e', text: '#e9eaf0', text2: '#b4b7c3', muted: '#7d8191', scheme: 'dark' };
  const LIGHT = { bg: '#eef0f4', bg2: '#ffffff', panel: '#ffffff', panel2: '#f2f3f7', panel3: '#e4e6ec', line: '#e1e3ea', line2: '#cfd3dc', text: '#14161c', text2: '#3d4250', muted: '#717789', scheme: 'light' };
  const tint = (base, over) => Object.assign({}, base, over);
  TH.PRESETS = [
    { id: 'dark', name: 'Dark', base: DARK, accent: '#19d3c5' },
    { id: 'light', name: 'Light', base: LIGHT, accent: '#0fa89c' },
    { id: 'midnight', name: 'Midnight', base: tint(DARK, { bg: '#0a0f1f', bg2: '#0e1428', panel: '#111933', panel2: '#17213f', panel3: '#1f2b52', line: '#1d2747', line2: '#2a3762' }), accent: '#5b8cff' },
    { id: 'forest', name: 'Forest', base: tint(DARK, { bg: '#0b120e', bg2: '#0f1813', panel: '#132019', panel2: '#192a21', panel3: '#21362a', line: '#1f3127', line2: '#2a4234' }), accent: '#4ade80' },
    { id: 'sunset', name: 'Sunset', base: tint(DARK, { bg: '#160c14', bg2: '#1d1019', panel: '#22131e', panel2: '#2c1827', panel3: '#3a2033', line: '#33192c', line2: '#47253e' }), accent: '#ff7a45' },
    { id: 'rose', name: 'Rose', base: tint(LIGHT, { bg: '#fbeef3', panel2: '#fdf3f6', panel3: '#f6dfe8', line: '#f0d6e0', line2: '#e6c0cf' }), accent: '#e8457c' },
    { id: 'mono', name: 'Mono', base: tint(DARK, { bg: '#101010', bg2: '#151515', panel: '#1a1a1a', panel2: '#222222', panel3: '#2c2c2c', line: '#2a2a2a', line2: '#383838' }), accent: '#e5e5e5' },
    { id: 'paper', name: 'Paper', base: tint(LIGHT, { bg: '#f4efe6', bg2: '#fffdf8', panel: '#fffdf8', panel2: '#f7f1e6', panel3: '#ece3d3', line: '#e6dccb', line2: '#d8cab3', text: '#2a241b' }), accent: '#c2410c' },
  ];
  TH.GRADIENTS = [
    ['none', 'Plain', null],
    ['aurora', 'Aurora', ['#0f2027', '#203a43', '#2c5364']],
    ['ocean', 'Ocean', ['#1a2a6c', '#2a5298', '#11998e']],
    ['dusk', 'Dusk', ['#2b1055', '#7597de', '#d4418e']],
    ['candy', 'Candy', ['#ff9a9e', '#fad0c4', '#a18cd1']],
    ['sunrise', 'Sunrise', ['#ff512f', '#f09819', '#dd2476']],
    ['mint', 'Mint', ['#a8ff78', '#78ffd6', '#00c9ff']],
    ['night', 'Night city', ['#0f0c29', '#302b63', '#24243e']],
    ['peach', 'Peach', ['#ffecd2', '#fcb69f', '#ff9a9e']],
  ];
  const DEF = { preset: 'dark', accent: null, gradient: 'none', glass: 0.82, radius: 10 };
  TH.cfg = Object.assign({}, DEF);
  try { Object.assign(TH.cfg, JSON.parse(localStorage.getItem('cutroom.theme') || '{}')); } catch (_) {}

  const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const lum = (h) => { const [r, g, b] = hexToRgb(h); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; };
  const shade = (h, k) => { const [r, g, b] = hexToRgb(h); const f = (v) => Math.round(C.clamp(v * k, 0, 255)).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); };

  TH.apply = (cfg = TH.cfg) => {
    const pr = TH.PRESETS.find((p) => p.id === cfg.preset) || TH.PRESETS[0];
    const b = pr.base, acc = cfg.accent || pr.accent;
    const grad = TH.GRADIENTS.find((g) => g[0] === cfg.gradient);
    const glass = grad && grad[2] ? cfg.glass : 1;
    const r = document.documentElement.style;
    const set = (k, v) => r.setProperty(k, v);
    set('--bg', grad && grad[2] ? 'transparent' : b.bg);
    set('--bg-2', b.bg2);
    set('--panel', glass < 1 ? rgba(b.panel, glass) : b.panel);
    set('--panel-2', glass < 1 ? rgba(b.panel2, Math.min(1, glass + 0.06)) : b.panel2);
    set('--panel-3', b.panel3); set('--line', b.line); set('--line-2', b.line2);
    set('--text', b.text); set('--text-2', b.text2); set('--muted', b.muted);
    set('--accent', acc); set('--accent-2', shade(acc, 0.85)); set('--accent-soft', rgba(acc, b.scheme === 'light' ? 0.14 : 0.16));
    set('--accent-ink', lum(acc) > 0.6 ? '#0b0c10' : '#ffffff');
    set('--radius', (cfg.radius ?? 10) + 'px');
    set('color-scheme', b.scheme);
    document.body.classList.toggle('theme-light', b.scheme === 'light');
    document.body.style.background = grad && grad[2] ? `linear-gradient(135deg, ${grad[2].join(', ')})` : b.bg;
    document.body.style.backgroundAttachment = 'fixed';
    try { localStorage.setItem('cutroom.theme', JSON.stringify(cfg)); } catch (_) {}
    if (window.native && window.native.setTitleBar) window.native.setTitleBar({ color: grad && grad[2] ? grad[2][0] : b.bg, symbol: b.text });
    C.emit('theme');
  };

  TH.open = () => {
    const cfg = TH.cfg;
    const { el } = C.modal(`<div class="modal-head"><h2>${C.icon('sparkles')} Appearance</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body">
        <h4 class="pk-cat" style="margin-top:0">Theme</h4><div class="theme-grid" id="thP"></div>
        <h4 class="pk-cat">Background</h4><div class="theme-grid grad" id="thG"></div>
        <div class="form-row" style="margin-top:14px"><label>Panel glass</label><input type="range" min="0.45" max="1" step="0.01" id="thGlass"></div>
        <div class="form-row"><label>Accent color</label><div style="display:flex;gap:8px;align-items:center"><input type="color" class="color-input" id="thAcc" style="width:60px"><div class="chips" id="thAccs"></div><button class="reset-btn" id="thAccR">Theme default</button></div></div>
        <div class="form-row"><label>Corner style</label><div class="seg" id="thR"><button data-v="4">Sharp</button><button data-v="10">Rounded</button><button data-v="16">Soft</button></div></div>
      </div>
      <div class="modal-foot"><button class="btn" id="thReset">Reset to default</button><button class="btn primary" data-close>Done</button></div>`, { cls: 'wide' });
    const draw = () => {
      const P = el.querySelector('#thP'); P.innerHTML = '';
      TH.PRESETS.forEach((p) => {
        const b = p.base; const btn = C.h(`<button class="theme-card ${cfg.preset === p.id ? 'on' : ''}"><div class="tc-prev" style="background:${b.bg}"><span style="background:${b.panel};border-color:${b.line2}"></span><span style="background:${b.panel};border-color:${b.line2}"><i style="background:${p.accent}"></i></span></div><b>${p.name}</b></button>`);
        btn.onclick = () => { cfg.preset = p.id; cfg.accent = null; TH.apply(); draw(); };
        P.appendChild(btn);
      });
      const Gd = el.querySelector('#thG'); Gd.innerHTML = '';
      TH.GRADIENTS.forEach(([id, name, cols]) => {
        const btn = C.h(`<button class="theme-card ${cfg.gradient === id ? 'on' : ''}"><div class="tc-prev" style="background:${cols ? `linear-gradient(135deg, ${cols.join(',')})` : 'var(--panel-3)'}"></div><b>${name}</b></button>`);
        btn.onclick = () => { cfg.gradient = id; TH.apply(); draw(); };
        Gd.appendChild(btn);
      });
      const pr = TH.PRESETS.find((p) => p.id === cfg.preset);
      el.querySelector('#thAcc').value = cfg.accent || pr.accent;
      el.querySelector('#thGlass').value = cfg.glass; C.setRangeFill(el.querySelector('#thGlass'));
      el.querySelectorAll('#thR button').forEach((b) => b.classList.toggle('on', +b.dataset.v === (cfg.radius ?? 10)));
    };
    const accs = el.querySelector('#thAccs');
    ['#19d3c5', '#5b8cff', '#7c5cff', '#e8457c', '#ff7a45', '#f5c518', '#4ade80', '#ffffff'].forEach((col) => { const b = C.h(`<button class="sw-dot" style="background:${col}"></button>`); b.onclick = () => { cfg.accent = col; TH.apply(); draw(); }; accs.appendChild(b); });
    el.querySelector('#thAcc').oninput = (e) => { cfg.accent = e.target.value; TH.apply(); };
    el.querySelector('#thAccR').onclick = () => { cfg.accent = null; TH.apply(); draw(); };
    el.querySelector('#thGlass').oninput = (e) => { cfg.glass = +e.target.value; TH.apply(); };
    el.querySelectorAll('#thR button').forEach((b) => (b.onclick = () => { cfg.radius = +b.dataset.v; TH.apply(); draw(); }));
    el.querySelector('#thReset').onclick = () => { Object.assign(cfg, DEF); TH.apply(); draw(); };
    draw();
  };
  TH.apply();
})(window.C);
