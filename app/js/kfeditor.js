/* Cutroom — keyframe templates & keyframe editor */
(function (C) {
  const KT = (C.kfTemplates = { user: [] });
  // keys: path -> [[fraction 0..1, value, mode('abs'|'mul'|'add'), ease]]
  const B = (id, name, group, icon, dur, keys) => ({ id, name, group, icon, dur, keys, builtin: true });
  KT.BUILTIN = [
    B('zoomIn', 'Zoom in', 'In', '🔍', 0.6, { 't.scale': [[0, 0.3, 'mul', 'back'], [1, 1, 'mul']], 't.opacity': [[0, 0, 'mul', 'out'], [0.5, 1, 'mul']] }),
    B('pop', 'Pop', 'In', '💥', 0.5, { 't.scale': [[0, 0, 'mul', 'out'], [0.6, 1.18, 'mul', 'inout'], [1, 1, 'mul']] }),
    B('fadeIn', 'Fade in', 'In', '🌅', 0.6, { 't.opacity': [[0, 0, 'mul', 'inout'], [1, 1, 'mul']] }),
    B('slideL', 'Slide from left', 'In', '⬅️', 0.6, { 't.x': [[0, -0.75, 'add', 'out'], [1, 0, 'add']] }),
    B('slideR', 'Slide from right', 'In', '➡️', 0.6, { 't.x': [[0, 0.75, 'add', 'out'], [1, 0, 'add']] }),
    B('slideT', 'Slide from top', 'In', '⬆️', 0.6, { 't.y': [[0, -0.75, 'add', 'out'], [1, 0, 'add']] }),
    B('slideB', 'Slide from bottom', 'In', '⬇️', 0.6, { 't.y': [[0, 0.75, 'add', 'out'], [1, 0, 'add']] }),
    B('drop', 'Drop & bounce', 'In', '🏀', 0.9, { 't.y': [[0, -0.7, 'add', 'bounce'], [1, 0, 'add']] }),
    B('spinIn', 'Spin in', 'In', '🌀', 0.7, { 't.rotation': [[0, -360, 'add', 'out'], [1, 0, 'add']], 't.scale': [[0, 0.1, 'mul', 'out'], [1, 1, 'mul']] }),
    B('swingIn', 'Swing in', 'In', '🎐', 0.9, { 't.rotation': [[0, -40, 'add', 'elastic'], [1, 0, 'add']], 't.opacity': [[0, 0, 'mul', 'out'], [0.3, 1, 'mul']] }),
    B('blurIn', 'Focus in', 'In', '👓', 0.7, { 'fx.blur': [[0, 40, 'abs', 'out'], [1, 0, 'abs']], 't.opacity': [[0, 0, 'mul', 'out'], [0.6, 1, 'mul']] }),
    B('zoomBlast', 'Zoom blast', 'In', '🚀', 0.5, { 't.scale': [[0, 3, 'mul', 'expo'], [1, 1, 'mul']], 't.opacity': [[0, 0, 'mul', 'out'], [0.4, 1, 'mul']] }),
    B('zoomOut', 'Zoom out', 'Out', '🔎', 0.6, { 't.scale': [[0, 1, 'mul', 'in'], [1, 0.3, 'mul']], 't.opacity': [[0.4, 1, 'mul', 'in'], [1, 0, 'mul']] }),
    B('fadeOut', 'Fade out', 'Out', '🌇', 0.6, { 't.opacity': [[0, 1, 'mul', 'inout'], [1, 0, 'mul']] }),
    B('outL', 'Slide out left', 'Out', '⏪', 0.6, { 't.x': [[0, 0, 'add', 'in'], [1, -0.75, 'add']] }),
    B('outR', 'Slide out right', 'Out', '⏩', 0.6, { 't.x': [[0, 0, 'add', 'in'], [1, 0.75, 'add']] }),
    B('fall', 'Fall away', 'Out', '🍂', 0.8, { 't.y': [[0, 0, 'add', 'in'], [1, 0.9, 'add']], 't.rotation': [[0, 0, 'add', 'in'], [1, 25, 'add']] }),
    B('spinOut', 'Spin out', 'Out', '💫', 0.7, { 't.rotation': [[0, 0, 'add', 'in'], [1, 360, 'add']], 't.scale': [[0, 1, 'mul', 'in'], [1, 0.05, 'mul']] }),
    B('shrink', 'Shrink', 'Out', '🫧', 0.5, { 't.scale': [[0, 1, 'mul', 'back'], [1, 0, 'mul']] }),
    B('kbIn', 'Ken Burns in', 'Full', '🖼️', 1, { 't.scale': [[0, 1, 'mul', 'linear'], [1, 1.2, 'mul']] }),
    B('kbOut', 'Ken Burns out', 'Full', '🏞️', 1, { 't.scale': [[0, 1.2, 'mul', 'linear'], [1, 1, 'mul']] }),
    B('panLR', 'Pan left → right', 'Full', '↔️', 1, { 't.scale': [[0, 1.25, 'mul', 'linear'], [1, 1.25, 'mul']], 't.x': [[0, -0.1, 'add', 'sine'], [1, 0.1, 'add']] }),
    B('panUD', 'Pan top → bottom', 'Full', '↕️', 1, { 't.scale': [[0, 1.25, 'mul', 'linear'], [1, 1.25, 'mul']], 't.y': [[0, -0.1, 'add', 'sine'], [1, 0.1, 'add']] }),
    B('rot360', 'Rotate 360°', 'Full', '🔄', 1, { 't.rotation': [[0, 0, 'add', 'linear'], [1, 360, 'add']] }),
    B('drift', 'Slow drift', 'Full', '🎈', 1, { 't.x': [[0, -0.03, 'add', 'sine'], [1, 0.03, 'add']], 't.y': [[0, 0.02, 'add', 'sine'], [1, -0.02, 'add']], 't.scale': [[0, 1.05, 'mul', 'linear'], [1, 1.1, 'mul']] }),
    B('pulse', 'Pulse', 'Loop', '💗', 0.8, { 't.scale': [[0, 1, 'mul', 'sine'], [0.5, 1.08, 'mul', 'sine'], [1, 1, 'mul']] }),
    B('heart', 'Heartbeat', 'Loop', '❤️', 0.9, { 't.scale': [[0, 1, 'mul', 'out'], [0.15, 1.15, 'mul', 'in'], [0.3, 1, 'mul', 'out'], [0.45, 1.1, 'mul', 'in'], [0.65, 1, 'mul'], [1, 1, 'mul']] }),
    B('wobble', 'Wobble', 'Loop', '〰️', 1, { 't.rotation': [[0, -5, 'add', 'sine'], [0.5, 5, 'add', 'sine'], [1, -5, 'add']] }),
    B('floatL', 'Float', 'Loop', '☁️', 2, { 't.y': [[0, 0, 'add', 'sine'], [0.5, -0.025, 'add', 'sine'], [1, 0, 'add']] }),
    B('swing', 'Swing', 'Loop', '🎢', 1.6, { 't.rotation': [[0, -12, 'add', 'sine'], [0.5, 12, 'add', 'sine'], [1, -12, 'add']] }),
    B('shakeL', 'Jitter', 'Loop', '📳', 0.24, { 't.x': [[0, 0, 'add', 'linear'], [0.25, 0.008, 'add', 'linear'], [0.5, -0.006, 'add', 'linear'], [0.75, 0.005, 'add', 'linear'], [1, 0, 'add']] }),
    B('blink', 'Blink', 'Loop', '👁️', 0.7, { 't.opacity': [[0, 1, 'mul', 'inout'], [0.5, 0.15, 'mul', 'inout'], [1, 1, 'mul']] }),
    B('breathe', 'Breathe', 'Loop', '🫁', 2.4, { 't.scale': [[0, 1, 'mul', 'sine'], [0.5, 1.04, 'mul', 'sine'], [1, 1, 'mul']] }),
    B('swellIn', 'Volume swell in', 'Audio', '🔊', 1.5, { volume: [[0, 0, 'mul', 'inout'], [1, 1, 'mul']] }),
    B('fadeAudio', 'Volume fade out', 'Audio', '🔉', 1.5, { volume: [[0, 1, 'mul', 'inout'], [1, 0, 'mul']] }),
    B('duck', 'Duck under voice', 'Audio', '🦆', 1, { volume: [[0, 1, 'mul', 'inout'], [0.08, 0.25, 'mul'], [0.92, 0.25, 'mul', 'inout'], [1, 1, 'mul']] }),
  ];
  KT.GROUPS = ['In', 'Out', 'Full', 'Loop', 'Audio', 'Mine'];

  const LS = 'cutroom.kfTemplates';
  KT.load = () => { try { KT.user = JSON.parse(localStorage.getItem(LS) || '[]'); } catch (_) { KT.user = []; } };
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(KT.user)); } catch (_) {} };
  KT.all = () => [...KT.BUILTIN, ...KT.user];

  // Apply a template to a clip. Mine-templates are anchored at the playhead.
  KT.apply = (c, tpl) => {
    c.kf = c.kf || {};
    const fps = C.fps(), snap = (t) => Math.round(t * fps) / fps;
    let t0, span, cycles = 1;
    if (tpl.group === 'Out') { span = Math.min(tpl.dur, c.duration); t0 = c.duration - span; }
    else if (tpl.group === 'Full') { t0 = 0; span = c.duration; }
    else if (tpl.group === 'Loop') { t0 = 0; span = Math.min(tpl.dur, c.duration); cycles = Math.max(1, Math.floor(c.duration / span)); }
    else if (tpl.group === 'Mine') { t0 = C.clamp(C.UI.playhead - c.start, 0, c.duration); span = tpl.dur; }
    else { t0 = 0; span = Math.min(tpl.dur, c.duration); }
    const t1 = t0 + span * cycles;
    for (const path in tpl.keys) {
      const base = C.kf.value(c, path, t0) ?? (path === 't.scale' || path === 't.opacity' || path === 'volume' ? 1 : 0);
      const arr = (c.kf[path] || []).filter((k) => k.t < t0 - 1e-6 || k.t > t1 + 1e-6);
      if (!c.kf[path] && C.kf.get(c, path) === undefined) C.kf.set(c, path, base);
      for (let n = 0; n < cycles; n++) for (const [f, v, mode, e] of tpl.keys[path]) {
        if (n > 0 && f === 0) continue;
        const val = mode === 'mul' ? base * v : mode === 'add' ? base + v : v;
        arr.push({ t: snap(Math.min(c.duration, t0 + (n + f) * span)), v: val, e: e || 'linear' });
      }
      arr.sort((a, b) => a.t - b.t);
      c.kf[path] = arr.filter((k, i) => i === 0 || Math.abs(k.t - arr[i - 1].t) > 1e-6 || k.v !== arr[i - 1].v);
    }
  };
  KT.saveFromClip = async (c) => {
    if (!C.kf.any(c)) { C.toast('This clip has no keyframes yet', 'info'); return; }
    const name = await C.prompt('Save keyframe template', 'Template name', 'My animation', 'Save');
    if (!name) return;
    const times = C.kf.times(c); const t0 = times[0], dur = Math.max(0.05, times[times.length - 1] - t0);
    const keys = {};
    for (const path in c.kf) { if (path.startsWith('e.')) continue; keys[path] = c.kf[path].map((k) => [(k.t - t0) / dur, k.v, 'abs', k.e]); }
    KT.user.push({ id: C.uid('kt_'), name, group: 'Mine', icon: '⭐', dur, keys }); persist();
    C.toast(`Saved template “${name}” — find it under Keyframes → Mine`);
  };
  KT.export = async () => {
    if (!KT.user.length) return C.toast('Save a template first', 'info');
    const out = await window.native.saveExportDialog({ name: 'My keyframe templates', ext: 'cutkf', label: 'Cutroom keyframe templates' });
    if (!out) return;
    await window.native.writeText(out, JSON.stringify({ app: 'cutroom-kf', version: 1, templates: KT.user }, null, 1));
    C.toast('Templates exported'); window.native.showItem(out);
  };
  KT.import = async () => {
    const files = await window.native.presetsImportDialog();
    let n = 0;
    for (const f of files) { try { const d = JSON.parse(f.text); for (const t of d.templates || []) { if (!t.keys) continue; KT.user.push(Object.assign({}, t, { id: C.uid('kt_'), group: 'Mine' })); n++; } } catch (_) {} }
    persist(); if (n) C.toast(`Imported ${n} template${n > 1 ? 's' : ''}`); else if (files.length) C.toast('No keyframe templates found in that file', 'err');
  };
  KT.load();

  // ---------- property names ----------
  const NAMES = { 't.x': 'Position X', 't.y': 'Position Y', 't.scale': 'Scale', 't.rotation': 'Rotation', 't.opacity': 'Opacity', volume: 'Volume', 'text.size': 'Text size', 'text.letterSpacing': 'Letter spacing', 'text.strokeWidth': 'Outline', 'text.curve': 'Curve' };
  KT.propName = (c, path) => {
    if (NAMES[path]) return NAMES[path];
    const p = path.split('.');
    if (p[0] === 'e') { const e = (c.effects || []).find((x) => x.id === p[1]); const d = e && C.fx.def(e.type); const prm = d && d.params.find((q) => q.key === p[2]); return d ? `${d.name} · ${prm ? prm.label : p[2]}` : path; }
    if (p[0] === 'grade') return 'Color · ' + p[1].replace(/^\w/, (m) => m.toUpperCase());
    if (p[0] === 'fx') return 'Adjust · ' + p[1].replace(/^\w/, (m) => m.toUpperCase());
    return path;
  };

  // ---------- editor UI (inspector tab) ----------
  const ED = (C.kfEditor = { sel: null });
  ED.render = (body, c, ctx) => {
    const { section, commit, refreshers } = ctx;
    const local = () => C.UI.playhead - c.start;
    // templates
    const ts = section(body, 'Animation templates');
    let grp = ED.group || (c.kind === 'audio' ? 'Audio' : 'In');
    const chips = C.h(`<div class="chips">${KT.GROUPS.filter((g) => c.kind === 'audio' ? g === 'Audio' || g === 'Mine' : g !== 'Audio').map((g) => `<button class="chip ${g === grp ? 'on' : ''}" data-g="${g}">${g === 'Full' ? 'Whole clip' : g === 'Mine' ? 'My templates' : g}</button>`).join('')}</div>`);
    const grid = C.h('<div class="kt-grid"></div>');
    const fill = () => {
      chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.g === grp));
      grid.innerHTML = '';
      const list = KT.all().filter((t) => t.group === grp);
      if (!list.length) grid.innerHTML = `<div class="hint" style="grid-column:1/-1">${grp === 'Mine' ? 'Animate a clip, then use “Save as template” below. Templates you save or import appear here.' : 'No templates'}</div>`;
      for (const t of list) {
        const b = C.h(`<button class="kt-btn" title="${C.esc(t.name)}"><span>${t.icon || '⭐'}</span>${C.esc(t.name)}</button>`);
        b.onclick = () => { C.begin(); KT.apply(c, t); commit('Animation: ' + t.name); C.tl.render(); C.inspector.render(true); C.toast(`${t.name} applied — press play to see it`, 'ok', 1500); };
        if (t.group === 'Mine') b.oncontextmenu = (e) => { e.preventDefault(); C.menu(e.clientX, e.clientY, [{ label: 'Delete template', icon: 'trash', action: () => { KT.user = KT.user.filter((x) => x !== t); persist(); fill(); } }]); };
        grid.appendChild(b);
      }
    };
    chips.querySelectorAll('button').forEach((b) => (b.onclick = () => { grp = ED.group = b.dataset.g; fill(); }));
    ts.appendChild(chips); ts.appendChild(grid); fill();
    ts.appendChild(C.h('<p class="hint" style="margin-top:8px">In/Out templates animate the start/end of the clip; Loop repeats for the whole clip. Applying replaces keyframes in that time range only.</p>'));

    // property lanes
    const paths = Object.keys(c.kf || {}).filter((p) => c.kf[p] && c.kf[p].length);
    const ps = section(body, `Animated properties (${paths.length})`);
    if (!paths.length) ps.appendChild(C.h('<p class="hint">Nothing animated yet. Apply a template above, or click a ◆ next to any slider in the other tabs.</p>'));
    if (ED.sel && (ED.sel.clip !== c.id || !c.kf[ED.sel.path])) ED.sel = null;
    if (!ED.sel && paths.length) ED.sel = { clip: c.id, path: paths[0], t: null };
    const lanes = C.h('<div class="kf-lanes"></div>');
    for (const path of paths) {
      const row = C.h(`<div class="kf-lane ${ED.sel && ED.sel.path === path ? 'on' : ''}"><div class="kl-name" title="${C.esc(KT.propName(c, path))}">${C.esc(KT.propName(c, path))}</div><div class="kl-track"><div class="kl-ph"></div></div><button class="icon-btn" data-tip="Remove animation">${C.icon('x')}</button></div>`);
      const track = row.querySelector('.kl-track');
      for (const k of c.kf[path]) {
        const d = C.h(`<span class="kl-d ${ED.sel && ED.sel.path === path && ED.sel.t != null && Math.abs(ED.sel.t - k.t) < 1e-6 ? 'on' : ''}" style="left:${(k.t / c.duration) * 100}%" title="${C.esc(easeName(k.e))}"></span>`);
        d.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation();
          ED.sel = { clip: c.id, path, t: k.t }; C.engine.seek(c.start + k.t);
          const r = track.getBoundingClientRect(); const t0 = k.t; let moved = false;
          C.begin();
          const mv = (m) => { moved = true; const nt = C.clamp(Math.round(((m.clientX - r.left) / r.width) * c.duration * C.fps()) / C.fps(), 0, c.duration); k.t = nt; d.style.left = (nt / c.duration) * 100 + '%'; ED.sel.t = nt; C.engine.requestDraw(); drawGraph(); };
          const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); c.kf[path].sort((a, b) => a.t - b.t); if (moved && k.t !== t0) commit('Move keyframe'); else C._txn = null; C.inspector.render(true); C.tl.render(); };
          addEventListener('pointermove', mv); addEventListener('pointerup', up);
        });
        track.appendChild(d);
      }
      track.addEventListener('pointerdown', (e) => { if (e.target !== track) return; const r = track.getBoundingClientRect(); C.engine.seek(c.start + ((e.clientX - r.left) / r.width) * c.duration); ED.sel = { clip: c.id, path, t: null }; C.inspector.render(true); });
      row.querySelector('.kl-name').onclick = () => { ED.sel = { clip: c.id, path, t: null }; C.inspector.render(true); };
      row.querySelector('.icon-btn').onclick = () => { C.begin(); C.kf.clear(c, path); commit('Remove animation'); C.inspector.render(true); C.tl.render(); };
      lanes.appendChild(row);
      const ph = row.querySelector('.kl-ph');
      refreshers.push(() => { ph.style.left = C.clamp(local() / c.duration, 0, 1) * 100 + '%'; });
    }
    ps.appendChild(lanes);

    // selected keyframe
    let drawGraph = () => {};
    if (ED.sel && c.kf[ED.sel.path]) {
      const arr = c.kf[ED.sel.path];
      const k = ED.sel.t != null ? arr.find((q) => Math.abs(q.t - ED.sel.t) < 1e-6) : null;
      const gs = section(body, 'Graph · ' + KT.propName(c, ED.sel.path));
      const cv = C.h('<canvas class="kf-graph" width="560" height="260"></canvas>'); gs.appendChild(cv);
      const gx = cv.getContext('2d');
      const range = () => { let lo = Infinity, hi = -Infinity; for (const q of arr) { lo = Math.min(lo, q.v); hi = Math.max(hi, q.v); } if (hi - lo < 1e-6) { lo -= 1; hi += 1; } const m = (hi - lo) * 0.18; return [lo - m, hi + m]; };
      let rg = range();
      const toX = (t) => 16 + (t / c.duration) * (560 - 32), toY = (v) => 16 + (1 - (v - rg[0]) / (rg[1] - rg[0])) * (260 - 32);
      drawGraph = () => {
        gx.clearRect(0, 0, 560, 260); gx.fillStyle = '#0b0c10'; gx.fillRect(0, 0, 560, 260);
        gx.strokeStyle = 'rgba(255,255,255,.06)'; gx.lineWidth = 1; for (let i = 0; i <= 4; i++) { const y = 16 + (i * 228) / 4; gx.beginPath(); gx.moveTo(16, y); gx.lineTo(544, y); gx.stroke(); }
        gx.strokeStyle = '#19d3c5'; gx.lineWidth = 2.5; gx.beginPath();
        for (let i = 0; i <= 200; i++) { const t = (i / 200) * c.duration; const v = C.kf.value({ kf: { p: arr } }, 'p', t); const x = toX(t), y = toY(v); i ? gx.lineTo(x, y) : gx.moveTo(x, y); }
        gx.stroke();
        for (const q of arr) { const x = toX(q.t), y = toY(q.v); gx.save(); gx.translate(x, y); gx.rotate(Math.PI / 4); gx.fillStyle = k === q ? '#fff' : '#ffe066'; gx.strokeStyle = '#000'; gx.lineWidth = 2; gx.fillRect(-6, -6, 12, 12); gx.strokeRect(-6, -6, 12, 12); gx.restore(); }
        const px = toX(C.clamp(local(), 0, c.duration)); gx.strokeStyle = '#fff'; gx.lineWidth = 1; gx.beginPath(); gx.moveTo(px, 8); gx.lineTo(px, 252); gx.stroke();
        gx.fillStyle = '#8b8f9e'; gx.font = '11px Consolas, monospace'; gx.fillText(fmt(rg[1]), 20, 14); gx.fillText(fmt(rg[0]), 20, 256);
      };
      const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));
      drawGraph(); refreshers.push(drawGraph);
      cv.addEventListener('pointerdown', (e) => {
        const r = cv.getBoundingClientRect(); const sx = 560 / r.width, sy = 260 / r.height;
        const mx = (e.clientX - r.left) * sx, my = (e.clientY - r.top) * sy;
        const hit = arr.find((q) => Math.hypot(toX(q.t) - mx, toY(q.v) - my) < 12);
        if (!hit) { C.engine.seek(c.start + C.clamp((mx - 16) / 528, 0, 1) * c.duration); return; }
        e.preventDefault(); ED.sel.t = hit.t; C.engine.seek(c.start + hit.t);
        C.begin(); const lock = rg.slice();
        const mv = (m) => {
          const x2 = (m.clientX - r.left) * sx, y2 = (m.clientY - r.top) * sy;
          rg = lock;
          hit.t = C.clamp(Math.round((((x2 - 16) / 528) * c.duration) * C.fps()) / C.fps(), 0, c.duration);
          hit.v = lock[0] + (1 - (y2 - 16) / 228) * (lock[1] - lock[0]);
          if (ED.sel.path === 't.opacity') hit.v = C.clamp(hit.v, 0, 1);
          ED.sel.t = hit.t; drawGraph(); C.engine.requestDraw();
        };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); arr.sort((a, b) => a.t - b.t); commit('Edit keyframe'); rg = range(); C.inspector.render(true); C.tl.render(); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      if (k) {
        const row = C.h(`<div class="kf-selrow"><span class="hint">Keyframe at ${C.fmtTC(c.start + k.t, C.fps())}</span><input class="num" style="width:90px" value="${fmt(k.v)}"><select class="select compact">${C.kf.EASES.map(([v, l]) => `<option value="${v}" ${k.e === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="icon-btn" data-tip="Delete keyframe">${C.icon('trash')}</button></div>`);
        row.querySelector('input').onchange = (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { C.begin(); k.v = v; commit('Keyframe value'); C.inspector.render(true); } };
        row.querySelector('input').onkeydown = (e) => e.stopPropagation();
        row.querySelector('select').onchange = (e) => { C.begin(); k.e = e.target.value; commit('Keyframe easing'); drawGraph(); };
        row.querySelector('.icon-btn').onclick = () => { C.begin(); arr.splice(arr.indexOf(k), 1); if (!arr.length) { const v = k.v; delete c.kf[ED.sel.path]; C.kf.set(c, ED.sel.path, v); } commit('Delete keyframe'); ED.sel.t = null; C.inspector.render(true); C.tl.render(); };
        gs.appendChild(row);
      } else gs.appendChild(C.h('<p class="hint">Click a diamond (in a lane or on the graph) to edit its value and easing. Drag diamonds on the graph to change both time and value.</p>'));
    }

    // actions
    const as = section(body, 'Tools');
    const grid2 = C.h('<div class="kf-tools"></div>');
    const btn = (label, icon, fn) => { const b = C.h(`<button class="btn">${C.icon(icon)}<span>${label}</span></button>`); b.onclick = fn; grid2.appendChild(b); };
    btn('Key transform here', 'diamond', () => {
      if (C.UI.playhead < c.start || C.UI.playhead > C.clipEnd(c)) return C.toast('Move the playhead over this clip', 'info');
      C.begin(); for (const p of ['t.x', 't.y', 't.scale', 't.rotation', 't.opacity']) { if (!C.kf.at(c, p, local())) C.kf.toggle(c, p, local()); } commit('Keyframe transform'); C.inspector.render(true); C.tl.render();
    });
    btn('Copy keyframes', 'copy', () => { if (!C.kf.any(c)) return C.toast('No keyframes to copy', 'info'); const t0 = C.kf.times(c)[0]; ED.clip = {}; for (const p in c.kf) ED.clip[p] = c.kf[p].map((q) => Object.assign({}, q, { t: q.t - t0 })); C.toast('Keyframes copied'); });
    btn('Paste at playhead', 'import', () => {
      if (!ED.clip) return C.toast('Copy keyframes from a clip first', 'info');
      const t0 = C.clamp(local(), 0, c.duration); C.begin(); c.kf = c.kf || {};
      for (const p in ED.clip) { if (p.startsWith('e.') && !(c.effects || []).some((e) => e.id === p.split('.')[1])) continue; const add = ED.clip[p].map((q) => Object.assign({}, q, { t: Math.min(c.duration, q.t + t0) })); const keep = (c.kf[p] || []).filter((q) => !add.some((a) => Math.abs(a.t - q.t) < 1e-6)); c.kf[p] = [...keep, ...add].sort((a, b) => a.t - b.t); }
      commit('Paste keyframes'); C.inspector.render(true); C.tl.render();
    });
    btn('Save as template', 'save', () => KT.saveFromClip(c));
    btn('Import templates', 'import', async () => { await KT.import(); C.inspector.render(true); });
    btn('Export my templates', 'export', () => KT.export());
    as.appendChild(grid2);
  };
  const easeName = (e) => (C.kf.EASES.find((x) => x[0] === e) || [0, 'Linear'])[1];
})(window.C);
