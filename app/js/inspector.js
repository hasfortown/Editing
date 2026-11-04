/* Cutroom — inspector (properties panel) */
(function (C) {
  const I = (C.inspector = {});
  let root, key = '', tab = null, refreshers = [], selfCommit = false, curClip = null;

  I.init = () => {
    root = C.$('#inspector');
    C.on('select', () => I.render());
    C.on('change', (info) => {
      if (selfCommit) return;
      const k = computeKey();
      if (k !== key || (curClip && C.primary() !== curClip)) I.render(true); else refresh();
    });
    C.on('time', C.throttle(() => { if (C.selection.size === 1) refresh(); }, 90));
    C.on('fadeLive', refresh);
    C.on('voiceReady', C.debounce(() => { if (tab === 'audio') I.render(true); }, 150));
    C.on('inspectTab', (t) => { if (t) tab = t; I.render(true); });
    C.on('focusText', () => { tab = 'text'; I.render(true); setTimeout(() => { const ta = root.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } }, 30); });
    C.on('collab', () => { if (!C.selection.size) I.render(true); });
    I.render();
  };

  function computeKey() {
    const s = C.selectedClips();
    return s.map((c) => c.id + ':' + c.kind + ':' + !!c.transition + ':' + c.freeze + ':' + (c.effects || []).map((e) => e.id + (e.on === false ? '0' : '1') + (e.p.area || '')).join('.')).join(',') + '|' + (s.length ? '' : C.project.settings.aspect);
  }
  function refresh() { for (const r of refreshers) try { r(); } catch (_) {} }

  const commit = (label) => { selfCommit = true; try { C.commit(label); } finally { selfCommit = false; } };
  const live = () => { C.begin(); selfCommit = true; try { C.live(); } finally { selfCommit = false; } };

  // ---------- control builders ----------
  function slider(parent, label, get, set, o = {}) {
    const min = o.min ?? 0, max = o.max ?? 100, step = o.step ?? 1;
    const fmt = o.fmt || ((v) => (Math.round(v * 100) / 100).toString());
    const row = C.h(`<div class="row"><label title="${C.esc(label)}">${C.esc(label)}</label><input type="range" min="${min}" max="${max}" step="${step}"><input class="num" type="text"></div>`);
    const r = row.querySelector('input[type=range]'), n = row.querySelector('.num');
    const toSlider = o.toSlider || ((v) => v), fromSlider = o.fromSlider || ((v) => v);
    const parse = o.parse || ((s) => parseFloat(s));
    const sync = () => { const v = get(); if (document.activeElement !== r) { r.value = toSlider(v); C.setRangeFill(r); } if (document.activeElement !== n) n.value = fmt(v) + (o.unit || ''); };
    sync(); refreshers.push(sync);
    r.addEventListener('input', () => { C.begin(); set(fromSlider(+r.value)); n.value = fmt(get()) + (o.unit || ''); live(); });
    r.addEventListener('change', () => commit(label));
    n.addEventListener('change', () => { const v = parse(n.value); if (!isNaN(v)) { C.begin(); set(C.clamp(v, o.hardMin ?? -Infinity, o.hardMax ?? Infinity)); commit(label); sync(); } else sync(); });
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter') n.blur(); e.stopPropagation(); });
    row.addEventListener('dblclick', (e) => { if (e.target === r && o.def !== undefined) { C.begin(); set(o.def); commit('Reset ' + label); sync(); } });
    parent.appendChild(row);
    return row;
  }
  // Keyframable slider: diamond button adds/removes a keyframe at the playhead
  function prop(parent, c, path, label, o = {}) {
    const local = () => C.UI.playhead - c.start;
    const row = slider(parent, label, () => { const v = C.kf.value(c, path, local()); return v === undefined ? (o.def ?? 0) : v; }, (v) => C.setParam(c, path, o.clamp ? o.clamp(v) : v, local()), o);
    const btn = C.h(`<button class="kf-btn" data-tip="Keyframe (right-click for easing)">${C.icon('diamond')}</button>`);
    row.insertBefore(btn, row.firstChild); row.classList.add('has-kf');
    const sync = () => { const has = C.kf.has(c, path); btn.classList.toggle('has', has); btn.classList.toggle('on', has && !!C.kf.at(c, path, local())); };
    sync(); refreshers.push(sync);
    btn.onclick = () => {
      if (C.UI.playhead < c.start - 1e-6 || C.UI.playhead > C.clipEnd(c) + 1e-6) { C.toast('Move the playhead over this clip to add keyframes', 'info'); return; }
      C.begin(); C.kf.toggle(c, path, local()); commit('Keyframe'); refresh(); C.tl.render();
    };
    btn.oncontextmenu = (e) => {
      e.preventDefault(); const at = C.kf.at(c, path, local());
      C.menu(e.clientX, e.clientY, [
        ...C.kf.EASES.map(([v, l]) => ({ label: `Easing: ${l}`, icon: at && at.e === v ? 'check' : null, disabled: !at, action: () => { C.begin(); C.kf.setEase(c, path, local(), v); commit('Keyframe easing'); } })),
        '-', { label: 'Remove all keyframes here', icon: 'trash', disabled: !C.kf.has(c, path), action: () => { C.begin(); C.kf.clear(c, path); commit('Clear keyframes'); refresh(); C.tl.render(); } },
      ]);
    };
    return row;
  }
  function textRow(parent, label, get, set) {
    const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><input class="text-input" spellcheck="false"></div>`);
    const i = row.querySelector('input'); i.value = get() ?? '';
    refreshers.push(() => { if (document.activeElement !== i) i.value = get() ?? ''; });
    i.addEventListener('input', () => { C.begin(); set(i.value); live(); });
    i.addEventListener('change', () => commit(label));
    i.addEventListener('keydown', (e) => e.stopPropagation());
    parent.appendChild(row); return row;
  }
  function seg(parent, label, options, get, set) {
    const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><div class="seg"></div></div>`);
    const s = row.querySelector('.seg');
    options.forEach(([v, l, ic]) => {
      const b = C.h(`<button data-v="${v}" title="${C.esc(l)}">${ic ? C.icon(ic) : C.esc(l)}</button>`);
      b.onclick = () => { C.begin(); set(v); commit(label); sync(); };
      s.appendChild(b);
    });
    const sync = () => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(get()) === b.dataset.v));
    sync(); refreshers.push(sync);
    parent.appendChild(row);
  }
  function toggles(parent, label, items) {
    const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><div class="seg"></div></div>`);
    const s = row.querySelector('.seg');
    const syncs = [];
    items.forEach(([l, ic, get, set]) => {
      const b = C.h(`<button title="${C.esc(l)}">${ic ? C.icon(ic) : C.esc(l)}</button>`);
      b.onclick = () => { C.begin(); set(!get()); commit(l); sync(); };
      s.appendChild(b); syncs.push(() => b.classList.toggle('on', !!get()));
    });
    const sync = () => syncs.forEach((f) => f());
    sync(); refreshers.push(sync);
    parent.appendChild(row);
  }
  function select(parent, label, options, get, set) {
    const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><select class="select compact"></select></div>`);
    const s = row.querySelector('select');
    options.forEach(([v, l]) => s.appendChild(C.h(`<option value="${C.esc(v)}">${C.esc(l)}</option>`)));
    const sync = () => { if (document.activeElement !== s) s.value = get(); };
    sync(); refreshers.push(sync);
    s.addEventListener('change', () => { C.begin(); set(s.value); commit(label); });
    parent.appendChild(row);
  }
  function color(parent, label, get, set) {
    const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><input type="color" class="color-input"></div>`);
    const i = row.querySelector('input');
    const sync = () => { if (document.activeElement !== i) i.value = get(); };
    sync(); refreshers.push(sync);
    i.addEventListener('input', () => { C.begin(); set(i.value); live(); });
    i.addEventListener('change', () => commit(label));
    parent.appendChild(row);
  }
  function sw(parent, label, get, set) {
    const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><div style="display:flex;justify-content:flex-end"><label class="switch"><input type="checkbox"><span></span></label></div></div>`);
    const i = row.querySelector('input');
    const sync = () => { i.checked = !!get(); };
    sync(); refreshers.push(sync);
    i.addEventListener('change', () => { C.begin(); set(i.checked); commit(label); });
    parent.appendChild(row);
  }
  function section(parent, title, onReset) {
    const s = C.h(`<div class="section"><div class="section-title"><span>${C.esc(title)}</span>${onReset ? '<button class="reset-btn">Reset</button>' : ''}</div></div>`);
    if (onReset) s.querySelector('.reset-btn').onclick = () => { C.begin(); onReset(); commit('Reset ' + title); refresh(); };
    parent.appendChild(s);
    return s;
  }
  const pct = { fmt: (v) => Math.round(v * 100), parse: (s) => parseFloat(s) / 100, unit: '%' };
  const secs = { fmt: (v) => v.toFixed(2), unit: 's', parse: (s) => parseFloat(s) };

  // ---------- render ----------
  I.isTab = (t) => tab === t && C.selection.size === 1;
  I.render = (force) => {
    const k = computeKey();
    if (!force && k === key && root.childElementCount) { refresh(); return; }
    const prevScroll = root.scrollTop;
    const sameSel = k.split('|')[0] === key.split('|')[0];
    key = k; refreshers = []; root.innerHTML = '';
    const sel = C.selectedClips();
    if (!sel.length) return renderProject();
    if (sel.length > 1) return renderMulti(sel);
    const c = sel[0];
    const tabs = {
      video: [['video', 'Video'], ['color', 'Color'], ['mask', 'Mask'], ['style', 'Style'], ['anim', 'Animation'], ['motion', 'Keyframes'], ['audio', 'Audio'], ['speed', 'Speed'], ['transition', 'Transition']],
      image: [['video', 'Image'], ['color', 'Color'], ['mask', 'Mask'], ['style', 'Style'], ['anim', 'Animation'], ['motion', 'Keyframes'], ['transition', 'Transition']],
      text: [['text', 'Text'], ['video', 'Transform'], ['style', 'Style'], ['mask', 'Mask'], ['anim', 'Animation'], ['motion', 'Keyframes'], ['transition', 'Transition']],
      shape: [['shape', 'Shape'], ['video', 'Transform'], ['style', 'Style'], ['mask', 'Mask'], ['anim', 'Animation'], ['motion', 'Keyframes'], ['transition', 'Transition']],
      audio: [['audio', 'Audio'], ['motion', 'Keyframes'], ['speed', 'Speed']],
      color: [['video', 'Color'], ['adjust', 'Adjust'], ['mask', 'Mask'], ['style', 'Style'], ['anim', 'Animation'], ['motion', 'Keyframes'], ['transition', 'Transition']],
      effect: [['effects', 'Effects'], ['color', 'Color grade'], ['motion', 'Keyframes'], ['video', 'Layer']],
    }[c.kind];
    if (c.kind !== 'audio' && c.kind !== 'effect') tabs.splice(1, 0, ['effects', 'Effects']);
    if (c.kind === 'video' && !C.hasAudio(c)) tabs.splice(tabs.findIndex((t) => t[0] === 'audio'), 1);
    if (!tab || !tabs.some((t) => t[0] === tab)) tab = tabs[0][0];
    curClip = c;
    const dot = { video: 'var(--clip-video)', image: 'var(--clip-image)', audio: 'var(--clip-audio)', text: 'var(--clip-text)', color: 'var(--clip-color)', effect: 'var(--clip-effect)', shape: 'var(--clip-shape)' }[c.kind];
    const head = C.h(`<div class="insp-head"><div class="insp-title"><span class="dot" style="background:${dot}"></span><b>${C.esc(c.kind === 'text' ? (c.sticker ? 'Sticker' : 'Text') : c.name)}</b><small>${C.fmtDur(c.duration)}</small></div>
      <div class="kf-bar"><span class="muted">${C.icon('diamond')}<span class="kf-count"></span></span><button class="icon-btn" data-k="prev" data-tip="Previous keyframe">${C.icon('prevFrame')}</button><button class="icon-btn" data-k="next" data-tip="Next keyframe">${C.icon('nextFrame')}</button><button class="reset-btn" data-k="clear">Clear all</button></div>
      <div class="tabs"></div></div>`);
    const kc = head.querySelector('.kf-count');
    const syncKf = () => { const n = C.kf.times(c).length; kc.textContent = n ? `${n} keyframe${n === 1 ? '' : 's'}` : 'No keyframes · click ◆ on a setting'; head.querySelector('[data-k=clear]').style.display = n ? '' : 'none'; };
    syncKf(); refreshers.push(syncKf);
    head.querySelector('[data-k=prev]').onclick = () => { const ts = C.kf.times(c).map((x) => x + c.start).filter((x) => x < C.UI.playhead - 1e-4); if (ts.length) C.engine.seek(ts[ts.length - 1]); };
    head.querySelector('[data-k=next]').onclick = () => { const ts = C.kf.times(c).map((x) => x + c.start).filter((x) => x > C.UI.playhead + 1e-4); if (ts.length) C.engine.seek(ts[0]); };
    head.querySelector('[data-k=clear]').onclick = () => { C.begin(); C.kf.clearAll(c); commit('Clear keyframes'); I.render(true); C.tl.render(); };
    const tb = head.querySelector('.tabs');
    tabs.forEach(([id, l]) => { const b = C.h(`<button class="tab ${id === tab ? 'active' : ''}">${l}</button>`); b.onclick = () => { tab = id; I.render(true); }; tb.appendChild(b); });
    root.appendChild(head);
    const body = C.h('<div class="insp-body"></div>'); root.appendChild(body);
    ({ video: tabTransform, adjust: tabAdjust, color: tabColor, motion: tabMotion, anim: tabAnim, audio: tabAudio, speed: tabSpeed, transition: tabTransition, text: tabText, effects: tabEffects, mask: tabMask, style: tabStyle, shape: tabShape })[tab](body, c);
    if (sameSel) root.scrollTop = prevScroll;
    C.emit('inspectorRendered');
  };

  function timing(body, c) {
    const s = section(body, 'Timing');
    slider(s, 'Start', () => c.start, (v) => { c.start = Math.max(0, C.snapTime(v)); }, { min: 0, max: Math.max(10, C.duration() + 10), step: C.frame(), ...secs });
    slider(s, 'Duration', () => c.duration, (v) => { c.duration = C.clamp(C.snapTime(v), C.frame(), C.maxDuration(c)); }, { min: C.frame(), max: Math.min(C.maxDuration(c), Math.max(30, c.duration * 2)), step: C.frame(), ...secs });
  }

  function tabTransform(body, c) {
    if (c.kind === 'color') { const s = section(body, 'Fill'); color(s, 'Color', () => c.color, (v) => { c.color = v; }); }
    if (c.kind === 'effect') {
      const s = section(body, 'Layer');
      prop(s, c, 't.opacity', 'Strength', { min: 0, max: 1, step: 0.01, ...pct, def: 1, clamp: (v) => C.clamp(v, 0, 1) });
      s.appendChild(C.h('<p class="hint">An effect clip applies its effects to everything on the tracks below it, for as long as it lasts. Drag its edges to change when it starts and ends.</p>'));
      const f = section(body, 'Fade');
      slider(f, 'Fade in', () => c.fadeIn, (v) => { c.fadeIn = C.clamp(v, 0, c.duration - c.fadeOut); }, { min: 0, max: Math.min(5, c.duration), step: 0.05, ...secs, def: 0 });
      slider(f, 'Fade out', () => c.fadeOut, (v) => { c.fadeOut = C.clamp(v, 0, c.duration - c.fadeIn); }, { min: 0, max: Math.min(5, c.duration), step: 0.05, ...secs, def: 0 });
      timing(body, c);
      return;
    }
    const s = section(body, 'Transform', () => { c.t = Object.assign(C.defaultTransform(), { fit: c.t.fit }); for (const k of ['t.x', 't.y', 't.scale', 't.rotation', 't.opacity']) if (c.kf) delete c.kf[k]; });
    prop(s, c, 't.scale', 'Scale', { min: 0.05, max: 4, step: 0.01, ...pct, def: 1, hardMin: 0.01 });
    prop(s, c, 't.x', 'Position X', { min: -0.5, max: 1.5, step: 0.001, fmt: (v) => Math.round((v - 0.5) * C.project.settings.width), parse: (s) => parseFloat(s) / C.project.settings.width + 0.5, def: 0.5 });
    prop(s, c, 't.y', 'Position Y', { min: -0.5, max: 1.5, step: 0.001, fmt: (v) => Math.round((v - 0.5) * C.project.settings.height), parse: (s) => parseFloat(s) / C.project.settings.height + 0.5, def: 0.5 });
    prop(s, c, 't.rotation', 'Rotation', { min: -180, max: 180, step: 0.5, unit: '°', def: 0 });
    prop(s, c, 't.opacity', 'Opacity', { min: 0, max: 1, step: 0.01, ...pct, def: 1, clamp: (v) => C.clamp(v, 0, 1) });
    select(s, 'Blend mode', C.BLENDS, () => c.blend || 'source-over', (v) => { c.blend = v; });
    if (c.kind === 'video' || c.kind === 'image') seg(s, 'Fit', [['contain', 'Fit'], ['cover', 'Fill'], ['stretch', 'Stretch']], () => c.t.fit, (v) => { c.t.fit = v; });
    toggles(s, 'Flip', [['Flip horizontal', 'flipH', () => c.t.flipH, (v) => { c.t.flipH = v; }], ['Flip vertical', 'flipV', () => c.t.flipV, (v) => { c.t.flipV = v; }]]);
    const t3 = section(body, '3D', () => { for (const k of ['rx', 'ry', 'z', 'persp']) { delete c.t[k]; if (c.kf) delete c.kf['t.' + k]; } });
    prop(t3, c, 't.rx', 'Tilt (X)', { min: -180, max: 180, step: 0.5, unit: '°', def: 0 });
    prop(t3, c, 't.ry', 'Turn (Y)', { min: -180, max: 180, step: 0.5, unit: '°', def: 0 });
    prop(t3, c, 't.z', 'Depth', { min: -80, max: 200, step: 0.5, def: 0 });
    prop(t3, c, 't.persp', 'Perspective', { min: 0.2, max: 4, step: 0.01, def: 1, fmt: (v) => (+v).toFixed(2) });
    const q3 = C.h('<div class="chips" style="margin-top:6px"></div>');
    [['Tilt back', { rx: 35 }], ['Lean left', { ry: 35 }], ['Lean right', { ry: -35 }], ['Floor', { rx: 60, z: 10 }], ['Flip', { ry: 180 }]].forEach(([l, v]) => { const b = C.h(`<button class="chip">${l}</button>`); b.onclick = () => { C.begin(); Object.assign(c.t, v); commit('3D preset'); refresh(); }; q3.appendChild(b); });
    t3.appendChild(q3);
    t3.appendChild(C.h('<p class="hint">Animate with ◆ for 3D flips, spins and camera moves. 3D transitions (cube, card flip…) are in Transitions.</p>'));
    const wp = section(body, 'Warp & wrap');
    select(wp, 'Style', C.geo.WARPS, () => (c.warp && c.warp.mode) || 'none', (v) => { if (v === 'none') c.warp = null; else c.warp = Object.assign({ amount: 50, speed: 1, freq: 2, spin: 0.6 }, c.warp || {}, { mode: v }); setTimeout(() => I.render(true), 0); });
    if (c.warp && c.warp.mode && c.warp.mode !== 'none') {
      const m = c.warp.mode;
      if (m !== 'pin') prop(wp, c, 'warp.amount', 'Amount', { min: -100, max: 100, step: 1, def: 50 });
      if (m === 'wave' || m === 'flag') { prop(wp, c, 'warp.freq', 'Waves', { min: 0.5, max: 8, step: 0.1, def: 2, fmt: (v) => (+v).toFixed(1) }); prop(wp, c, 'warp.speed', 'Speed', { min: 0, max: 6, step: 0.05, def: 1, fmt: (v) => (+v).toFixed(2) }); }
      if (m === 'wrap' || m === 'sphere') prop(wp, c, 'warp.spin', 'Spin', { min: -3, max: 3, step: 0.05, def: 0.6, fmt: (v) => (+v).toFixed(2) });
      if (m === 'twist') prop(wp, c, 'warp.speed', 'Animate', { min: 0, max: 6, step: 0.05, def: 0, fmt: (v) => (+v).toFixed(2) });
      if (m === 'pin') for (const [k, l] of [['tlx', 'Top-left X'], ['tly', 'Top-left Y'], ['trx', 'Top-right X'], ['try', 'Top-right Y'], ['blx', 'Bottom-left X'], ['bly', 'Bottom-left Y'], ['brx', 'Bottom-right X'], ['bry', 'Bottom-right Y']]) prop(wp, c, 'warp.' + k, l, { min: -60, max: 60, step: 0.5, def: 0 });
    }
    const al = section(body, 'Align');
    const chips = C.h('<div class="chips"></div>');
    [['Left', 'x', null, 'l'], ['Center H', 'x', 0.5], ['Right', 'x', null, 'r'], ['Top', 'y', null, 't'], ['Middle', 'y', 0.5], ['Bottom', 'y', null, 'b']].forEach(([l, ax, v, edge]) => {
      const b = C.h(`<button class="chip">${l}</button>`);
      b.onclick = () => {
        const W = C.project.settings.width, H = C.project.settings.height;
        const box = C.clipBox(C.engine.ctx, c, W, H);
        C.begin();
        if (v != null) c.t[ax] = v;
        else if (edge === 'l') c.t.x = box.w / 2 / W; else if (edge === 'r') c.t.x = 1 - box.w / 2 / W;
        else if (edge === 't') c.t.y = box.h / 2 / H; else if (edge === 'b') c.t.y = 1 - box.h / 2 / H;
        commit('Align'); refresh();
      };
      chips.appendChild(b);
    });
    al.appendChild(chips);
    const f = section(body, 'Fade');
    slider(f, 'Fade in', () => c.fadeIn, (v) => { c.fadeIn = C.clamp(v, 0, c.duration - c.fadeOut); }, { min: 0, max: Math.min(5, c.duration), step: 0.05, ...secs, def: 0 });
    slider(f, 'Fade out', () => c.fadeOut, (v) => { c.fadeOut = C.clamp(v, 0, c.duration - c.fadeIn); }, { min: 0, max: Math.min(5, c.duration), step: 0.05, ...secs, def: 0 });
    timing(body, c);
  }

  function tabAdjust(body, c) {
    const s = section(body, 'Color', () => { c.fx = C.defaultFx(); c.filterName = null; });
    const fx = [['Brightness', 'brightness', -100, 100], ['Contrast', 'contrast', -100, 100], ['Saturation', 'saturation', -100, 100], ['Temperature', 'temperature', -100, 100], ['Hue', 'hue', -180, 180]];
    fx.forEach(([l, k, mn, mx]) => prop(s, c, 'fx.' + k, l, { min: mn, max: mx, step: 1, def: 0 }));
    const s2 = section(body, 'Effects');
    [['Blur', 'blur', 0, 60], ['Vignette', 'vignette', 0, 100], ['Black & white', 'grayscale', 0, 100], ['Sepia', 'sepia', 0, 100], ['Invert', 'invert', 0, 100]]
      .forEach(([l, k, mn, mx]) => prop(s2, c, 'fx.' + k, l, { min: mn, max: mx, step: 1, def: 0 }));
    const s3 = section(body, 'Filter presets');
    const chips = C.h('<div class="chips"></div>');
    C.FILTERS.forEach((f) => {
      const b = C.h(`<button class="chip ${c.filterName === f.id || (!c.filterName && f.id === 'none') ? 'on' : ''}">${f.name}</button>`);
      b.onclick = () => { C.begin(); C.ops.applyFilter([c], f.id); commit('Filter'); I.render(true); };
      chips.appendChild(b);
    });
    s3.appendChild(chips);
  }

  // ---------- masks ----------
  function tabMask(body, c) {
    const add = section(body, 'Add a mask');
    const grid = C.h('<div class="mask-types"></div>');
    C.MASK_TYPES.forEach(([t, l]) => {
      const b = C.h(`<button class="mask-type" title="${l}"><span class="mt-ico mt-${t}"></span><small>${l}</small></button>`);
      b.onclick = () => { if (t === 'path') { C.penMask.start(c); return; } C.begin(); c.masks = c.masks || []; const m = { id: C.uid('m_'), type: t, x: 0, y: 0, w: t === 'mirror' ? 1 : 0.55, h: t === 'mirror' ? 0.35 : 0.55, rot: 0, feather: t === 'linear' || t === 'mirror' ? 15 : 8, round: t === 'rect' ? 0 : 0, invert: false, mode: 'add', on: true }; c.masks.push(m); C.UI.focusMask = { clip: c.id, mask: m.id }; commit('Add mask'); I.render(true); C.preview.update(); };
      grid.appendChild(b);
    });
    add.appendChild(grid);
    add.appendChild(C.h('<p class="hint" style="margin-top:8px">Masks hide parts of the clip. Drag the pink outline on the player to move, resize and rotate. Every setting can be keyframed (◆) to animate reveals.</p>'));
    (c.masks || []).forEach((m, i) => {
      const card = C.h(`<div class="fx-card ${C.UI.focusMask && C.UI.focusMask.mask === m.id ? 'focused' : ''} ${m.on === false ? 'off' : ''}"><div class="fx-head"><label class="switch"><input type="checkbox" ${m.on !== false ? 'checked' : ''}><span></span></label><b>Mask ${i + 1} · ${(C.MASK_TYPES.find((x) => x[0] === m.type) || ['', m.type])[1]}</b><span style="flex:1"></span><button class="icon-btn" data-a="edit" data-tip="Edit on canvas">${C.icon('fit')}</button><button class="icon-btn" data-a="del" data-tip="Delete mask">${C.icon('x')}</button></div><div class="fx-body"></div></div>`);
      card.querySelector('input').onchange = (e) => { C.begin(); m.on = e.target.checked; commit('Toggle mask'); };
      card.querySelector('[data-a=del]').onclick = () => { C.begin(); c.masks.splice(c.masks.indexOf(m), 1); for (const k of Object.keys(c.kf || {})) if (k.startsWith(`m.${m.id}.`)) delete c.kf[k]; commit('Delete mask'); I.render(true); C.preview.update(); };
      card.querySelector('[data-a=edit]').onclick = () => { C.UI.focusMask = { clip: c.id, mask: m.id }; if (C.UI.playhead < c.start || C.UI.playhead >= C.clipEnd(c)) C.engine.seek(c.start + Math.min(0.5, c.duration / 2)); I.render(true); C.preview.update(); };
      const b = card.querySelector('.fx-body'); const pp = `m.${m.id}.`;
      seg(b, 'Mode', [['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']], () => m.mode || 'add', (v) => { m.mode = v; });
      prop(b, c, pp + 'x', 'Position X', { min: -1, max: 1, step: 0.001, def: 0, fmt: (v) => (+v).toFixed(3) });
      prop(b, c, pp + 'y', 'Position Y', { min: -1, max: 1, step: 0.001, def: 0, fmt: (v) => (+v).toFixed(3) });
      if (m.type === 'path') { b.appendChild(C.h('<p class="hint" style="margin:4px 0">Drag points and handles on the player · Alt+click a point for corner/smooth · double-click to delete a point.</p>')); prop(b, c, pp + 'w', 'Scale X', { min: 0.05, max: 3, step: 0.01, ...pct, def: 1 }); prop(b, c, pp + 'h', 'Scale Y', { min: 0.05, max: 3, step: 0.01, ...pct, def: 1 }); }
      else if (m.type !== 'linear') { if (m.type !== 'mirror') prop(b, c, pp + 'w', 'Width', { min: 0.01, max: 2, step: 0.001, ...pct, def: 0.55 }); prop(b, c, pp + 'h', m.type === 'mirror' ? 'Band size' : 'Height', { min: 0.01, max: 2, step: 0.001, ...pct, def: 0.55 }); }
      prop(b, c, pp + 'rot', 'Rotation', { min: -180, max: 180, step: 0.5, unit: '°', def: 0 });
      prop(b, c, pp + 'feather', 'Feather', { min: 0, max: 100, step: 1, def: 8 });
      if (m.type === 'rect' || m.type === 'triangle' || m.type === 'star') prop(b, c, pp + 'round', 'Round corners', { min: 0, max: 100, step: 1, def: 0 });
      sw(b, 'Invert', () => m.invert, (v) => { m.invert = v; });
      card.addEventListener('pointerdown', (e) => { if (e.target.closest('button, input, select')) return; if (!C.UI.focusMask || C.UI.focusMask.mask !== m.id) { C.UI.focusMask = { clip: c.id, mask: m.id }; C.$$('.fx-card', root).forEach((x) => x.classList.remove('focused')); card.classList.add('focused'); C.preview.update(); } });
      body.appendChild(card);
    });
  }

  // ---------- layer styles (glow, shadow, stroke, bevel…) ----------
  function tabStyle(body, c) {
    const PS = C.photo.STYLE_DEFAULTS, NAMES = C.photo.STYLE_NAMES;
    const ensure = (k) => { c.styles = c.styles || {}; if (!c.styles[k]) c.styles[k] = Object.assign({}, PS[k], { on: false }); return c.styles[k]; };
    const quick = section(body, 'Quick styles');
    const qs = C.h('<div class="chips"></div>');
    [['Glow', { outerGlow: { on: true, color: '#19d3c5', size: 30, spread: 25, opacity: 90 } }], ['Drop shadow', { dropShadow: { on: true, distance: 14, size: 22, opacity: 70 } }], ['Outline', { stroke: { on: true, size: 8, color: '#ffffff' } }], ['Sticker', { stroke: { on: true, size: 14, color: '#ffffff' }, dropShadow: { on: true, distance: 8, size: 14, opacity: 50 } }], ['Neon', { stroke: { on: true, size: 4, color: '#ff4fd8' }, outerGlow: { on: true, color: '#ff4fd8', size: 40, spread: 30, opacity: 100 } }], ['Embossed', { bevel: { on: true, size: 12 }, dropShadow: { on: true, distance: 6, size: 10, opacity: 50 } }], ['Gold', { gradientOverlay: { on: true, c1: '#fff1a8', c2: '#b8860b', angle: 90 }, bevel: { on: true, size: 8 }, stroke: { on: true, size: 3, color: '#5a3d00' } }], ['None', null]].forEach(([l, v]) => {
      const b = C.h(`<button class="chip">${l}</button>`);
      b.onclick = () => { C.begin(); if (!v) c.styles = {}; else for (const k in v) Object.assign(ensure(k), v[k]); commit('Style: ' + l); I.render(true); };
      qs.appendChild(b);
    });
    quick.appendChild(qs);
    for (const k of Object.keys(PS)) {
      const st = (c.styles && c.styles[k]) || Object.assign({}, PS[k], { on: false });
      const sec = C.h(`<div class="section"><div class="section-title"><span>${NAMES[k]}</span><label class="switch"><input type="checkbox" ${st.on ? 'checked' : ''}><span></span></label></div><div class="st-body" style="${st.on ? '' : 'display:none'}"></div></div>`);
      sec.querySelector('input').onchange = (e) => { C.begin(); ensure(k).on = e.target.checked; commit(NAMES[k]); I.render(true); };
      const b = sec.querySelector('.st-body');
      if (st.on) {
        const S = () => ensure(k);
        const sl = (lbl, key, mn, mx) => slider(b, lbl, () => S()[key], (v) => { S()[key] = v; }, { min: mn, max: mx, step: 1, def: PS[k][key] });
        const col = (lbl, key) => color(b, lbl, () => S()[key], (v) => { S()[key] = v; });
        const sel = (lbl, key, opts) => select(b, lbl, opts, () => S()[key], (v) => { S()[key] = v; });
        if (k === 'dropShadow') { col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Angle', 'angle', -180, 180); sl('Distance', 'distance', 0, 200); sl('Softness', 'size', 0, 150); }
        if (k === 'innerShadow') { col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Angle', 'angle', -180, 180); sl('Distance', 'distance', 0, 100); sl('Softness', 'size', 0, 100); }
        if (k === 'outerGlow') { col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Size', 'size', 0, 150); sl('Spread', 'spread', 0, 100); }
        if (k === 'innerGlow') { col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Size', 'size', 0, 100); }
        if (k === 'bevel') { sl('Size', 'size', 1, 60); sl('Depth', 'depth', 1, 300); sl('Light angle', 'angle', -180, 180); col('Highlight', 'highlight'); col('Shadow', 'shadow'); }
        if (k === 'stroke') { sl('Size', 'size', 1, 60); sel('Position', 'position', [['outside', 'Outside'], ['inside', 'Inside'], ['center', 'Center']]); col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); }
        if (k === 'colorOverlay') { col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sel('Blend', 'blend', C.BLENDS); }
        if (k === 'gradientOverlay') { col('From', 'c1'); col('To', 'c2'); sl('Angle', 'angle', -180, 180); sel('Style', 'style', [['linear', 'Linear'], ['radial', 'Radial']]); sl('Opacity', 'opacity', 0, 100); }
      }
      body.appendChild(sec);
    }
    body.appendChild(C.h('<p class="hint">Styles follow the clip’s shape — great on text, stickers, PNGs, green-screened video and shapes.</p>'));
  }

  // ---------- shape clips ----------
  function tabShape(body, c) {
    const sh = c.shape;
    const s = section(body, 'Shape');
    select(s, 'Type', C.geo.SHAPES, () => sh.kind, (v) => { sh.kind = v; setTimeout(() => I.render(true), 0); });
    prop(s, c, 'shape.w', 'Width', { min: 4, max: 2400, step: 1, def: 500, unit: 'px' });
    prop(s, c, 'shape.h', 'Height', { min: 0, max: 2400, step: 1, def: 500, unit: 'px' });
    prop(s, c, 'shape.radius', 'Round corners', { min: 0, max: 100, step: 1, def: 0 });
    if (['star', 'polygon'].includes(sh.kind)) prop(s, c, 'shape.points', 'Points', { min: 3, max: 24, step: 1, def: 5, clamp: (v) => Math.round(v) });
    if (['star', 'ring', 'cross'].includes(sh.kind)) prop(s, c, 'shape.inner', sh.kind === 'star' ? 'Inner radius' : 'Thickness', { min: 0.05, max: 0.95, step: 0.01, def: 0.45, fmt: (v) => (+v).toFixed(2) });
    const f = section(body, 'Fill');
    sw(f, 'Fill', () => sh.fillOn !== false, (v) => { sh.fillOn = v; });
    seg(f, 'Type', [['solid', 'Solid'], ['gradient', 'Gradient']], () => sh.fillMode || 'solid', (v) => { sh.fillMode = v; setTimeout(() => I.render(true), 0); });
    if (sh.fillMode === 'gradient') { color(f, 'From', () => sh.grad1 || '#19d3c5', (v) => { sh.grad1 = v; }); color(f, 'To', () => sh.grad2 || '#7c5cff', (v) => { sh.grad2 = v; }); slider(f, 'Angle', () => sh.gradAngle ?? 90, (v) => { sh.gradAngle = v; }, { min: 0, max: 360, step: 1, unit: '°', def: 90 }); }
    else color(f, 'Color', () => sh.fill, (v) => { sh.fill = v; });
    const o = section(body, 'Outline');
    prop(o, c, 'shape.strokeW', 'Width', { min: 0, max: 80, step: 0.5, def: 0, clamp: (v) => Math.max(0, v) });
    color(o, 'Color', () => sh.stroke, (v) => { sh.stroke = v; });
    slider(o, 'Dashes', () => sh.dash || 0, (v) => { sh.dash = Math.max(0, v); }, { min: 0, max: 60, step: 1, def: 0 });
    timing(body, c);
  }

  function tabMotion(body, c) { C.kfEditor.render(body, c, { section, commit, refreshers }); }

  let hslBand = 0;
  function tabColor(body, c) {
    const G = C.grade;
    const g = () => { if (!c.grade) c.grade = G.defaults(); return c.grade; };
    if (!G.available()) body.appendChild(C.h('<p class="hint" style="color:var(--warn)">GPU color grading is unavailable on this computer — only basic adjustments will apply.</p>'));
    // compare + copy/paste
    const top = C.h(`<div class="fx-actions"><button class="btn" data-a="cmp" data-tip="Hold to see the original">${C.icon('eye')}<span>Hold to compare</span></button><button class="icon-btn" data-a="copy" data-tip="Copy grade">${C.icon('copy')}</button><button class="icon-btn" data-a="paste" data-tip="Paste grade">${C.icon('import')}</button><button class="icon-btn" data-a="reset" data-tip="Reset all color">${C.icon('refresh')}</button></div>`);
    const cmp = top.querySelector('[data-a=cmp]');
    cmp.addEventListener('pointerdown', () => { C.UI.bypassGrade = true; C.engine.requestDraw(); });
    const off = () => { if (C.UI.bypassGrade) { C.UI.bypassGrade = false; C.engine.requestDraw(); } };
    cmp.addEventListener('pointerup', off); cmp.addEventListener('pointerleave', off);
    top.querySelector('[data-a=copy]').onclick = () => { I._gradeClip = C.deep(c.grade || G.defaults()); C.toast('Grade copied — select other clips and paste', 'ok', 1600); };
    top.querySelector('[data-a=paste]').onclick = () => { if (!I._gradeClip) return C.toast('Copy a grade first', 'info'); const targets = C.selectedClips().filter((x) => x.kind === 'video' || x.kind === 'image' || x.kind === 'effect'); C.begin(); targets.forEach((x) => { x.grade = C.deep(I._gradeClip); }); commit('Paste grade'); I.render(true); };
    top.querySelector('[data-a=reset]').onclick = () => { C.begin(); c.grade = null; for (const k of Object.keys(c.kf || {})) if (k.startsWith('grade.')) delete c.kf[k]; commit('Reset color'); I.render(true); };
    body.appendChild(top);

    const lk = section(body, 'Looks');
    const looks = C.h('<div class="looks"></div>');
    G.LOOKS.forEach((l) => {
      const b = C.h(`<button class="look"><canvas width="96" height="54"></canvas><span>${C.esc(l.name)}</span></button>`);
      const cv = b.querySelector('canvas');
      requestAnimationFrame(() => { try { const s = C.fx.sampleImage(); const tmp = document.createElement('canvas'); tmp.width = 96; tmp.height = 54; const x = tmp.getContext('2d'); const sw = s.width || s.naturalWidth, sh = s.height || s.naturalHeight, k = Math.max(96 / sw, 54 / sh); x.drawImage(s, (96 - sw * k) / 2, (54 - sh * k) / 2, sw * k, sh * k); cv.getContext('2d').drawImage(G.available() ? G.apply(tmp, Object.assign(G.defaults(), l.g)) : tmp, 0, 0, 96, 54); } catch (_) {} });
      b.onclick = () => { C.begin(); c.grade = G.applyLook(c.grade || G.defaults(), l); commit('Look: ' + l.name); I.render(true); };
      looks.appendChild(b);
    });
    lk.appendChild(looks);

    const L = section(body, 'Light');
    prop(L, c, 'grade.exposure', 'Exposure', { min: -4, max: 4, step: 0.01, def: 0, unit: ' EV', fmt: (v) => (+v).toFixed(2) });
    for (const [k, l] of [['contrast', 'Contrast'], ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['whites', 'Whites'], ['blacks', 'Blacks']]) prop(L, c, 'grade.' + k, l, { min: -100, max: 100, step: 1, def: 0 });
    const Co = section(body, 'Color');
    for (const [k, l, mn, mx, u] of [['temp', 'Temperature', -100, 100, ''], ['tint', 'Tint', -100, 100, ''], ['vibrance', 'Vibrance', -100, 100, ''], ['saturation', 'Saturation', -100, 100, ''], ['hue', 'Hue shift', -180, 180, '°'], ['bw', 'Black & white', 0, 100, '%']]) prop(Co, c, 'grade.' + k, l, { min: mn, max: mx, step: 1, def: 0, unit: u });

    const W = section(body, 'Color wheels');
    const wrow = C.h('<div class="wheels"></div>');
    for (const [k, l] of [['lift', 'Shadows'], ['gamma', 'Midtones'], ['gain', 'Highlights']]) {
      C.colorUI.wheel(wrow, l, () => (c.grade && c.grade[k]) || { x: 0, y: 0, l: 0 }, (v, isLive) => { C.begin(); g()[k] = Object.assign({ x: 0, y: 0, l: 0 }, v); if (isLive) live(); else commit('Color wheel'); });
    }
    W.appendChild(wrow);
    W.appendChild(C.h('<p class="hint">Drag in a wheel to tint that range · slider below = brightness · Shift for fine control · double-click to reset.</p>'));

    const Cu = section(body, 'Curves');
    C.colorUI.curves(Cu, () => c.grade && c.grade.curves, (v, isLive) => { C.begin(); g().curves = v; if (isLive) live(); else commit('Curves'); });

    const H = section(body, 'HSL — adjust one color');
    const bands = C.h(`<div class="hsl-bands">${G.HSL_BANDS.map(([n, , col], i) => `<button data-i="${i}" title="${n}" style="background:${col}" class="${i === hslBand ? 'on' : ''}"></button>`).join('')}</div>`);
    H.appendChild(bands);
    const hb = C.h('<div></div>'); H.appendChild(hb);
    const renderBand = () => {
      hb.innerHTML = '';
      bands.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === hslBand));
      hb.appendChild(C.h(`<div class="hint" style="margin:6px 0 2px"><b style="color:var(--text)">${G.HSL_BANDS[hslBand][0]}</b> tones</div>`));
      const bandArr = () => { const gg = g(); if (!gg.hsl) gg.hsl = G.HSL_BANDS.map(() => [0, 0, 0]); return gg.hsl[hslBand]; };
      ['Hue', 'Saturation', 'Luminance'].forEach((l, j) => slider(hb, l, () => (c.grade && c.grade.hsl ? c.grade.hsl[hslBand][j] : 0), (v) => { bandArr()[j] = v; }, { min: -100, max: 100, step: 1, def: 0 }));
    };
    bands.querySelectorAll('button').forEach((b) => (b.onclick = () => { hslBand = +b.dataset.i; renderBand(); }));
    renderBand();

    const D = section(body, 'Detail & finish');
    prop(D, c, 'grade.sharpen', 'Sharpen', { min: 0, max: 100, step: 1, def: 0 });
    prop(D, c, 'grade.fade', 'Fade (matte)', { min: 0, max: 100, step: 1, def: 0 });
    if (c.fx) { prop(D, c, 'fx.vignette', 'Vignette', { min: 0, max: 100, step: 1, def: 0 }); prop(D, c, 'fx.blur', 'Blur', { min: 0, max: 60, step: 1, def: 0 }); }

    const LU = section(body, 'LUT');
    const lut = c.grade && c.grade.lut;
    const lrow = C.h(`<div style="display:flex;gap:8px;align-items:center"><button class="btn" style="flex:1;justify-content:center">${C.icon('import')}<span>${lut ? 'Change LUT…' : 'Load .cube LUT…'}</span></button>${lut ? `<button class="icon-btn" data-tip="Remove LUT">${C.icon('x')}</button>` : ''}</div>`);
    lrow.querySelector('.btn').onclick = async () => {
      const pth = await window.native.lutOpen(); if (!pth) return;
      try { await G.loadLut(pth); } catch (e) { return C.toast(e.message, 'err'); }
      C.begin(); g().lut = { path: pth, name: C.baseName(pth) }; if (g().lutMix == null) g().lutMix = 1; commit('Load LUT'); I.render(true);
    };
    const rm = lrow.querySelector('.icon-btn'); if (rm) rm.onclick = () => { C.begin(); g().lut = null; commit('Remove LUT'); I.render(true); };
    LU.appendChild(lrow);
    if (lut) { LU.appendChild(C.h(`<div class="hint" style="margin:8px 0 2px">${C.icon('film').replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-1px"')} ${C.esc(lut.name)}</div>`)); prop(LU, c, 'grade.lutMix', 'Intensity', { min: 0, max: 1, step: 0.01, ...pct, def: 1 }); }
    else LU.appendChild(C.h('<p class="hint" style="margin-top:8px">Use any 3D LUT in .cube format — film emulations, camera log conversions, creative looks.</p>'));
  }

  function tabAnim(body, c) {
    const s = section(body, 'In animation');
    select(s, 'Type', C.ANIMS_IN.filter((a) => c.kind === 'text' || a[0] !== 'typewriter'), () => c.anim.in, (v) => { c.anim.in = v; });
    const s2 = section(body, 'Out animation');
    select(s2, 'Type', C.ANIMS_OUT, () => c.anim.out, (v) => { c.anim.out = v; });
    const s3 = section(body, 'Options');
    slider(s3, 'Duration', () => c.anim.dur, (v) => { c.anim.dur = C.clamp(v, 0.05, 5); }, { min: 0.1, max: 3, step: 0.05, ...secs, def: 0.5 });
    if (c.kind !== 'text') sw(s3, 'Ken Burns zoom', () => c.anim.kenburns, (v) => { c.anim.kenburns = v; });
    const p = C.h('<p class="hint">Tip: animations preview instantly — scrub the playhead across the start or end of the clip.</p>');
    s3.appendChild(p);
  }

  function tabAudio(body, c) {
    const s = section(body, 'Volume');
    prop(s, c, 'volume', 'Volume', { min: 0, max: 2, step: 0.01, ...pct, def: 1, clamp: (v) => C.clamp(v, 0, 2) });
    sw(s, 'Mute clip', () => c.muted, (v) => { c.muted = v; });
    const f = section(body, 'Fades');
    slider(f, 'Fade in', () => c.fadeIn, (v) => { c.fadeIn = C.clamp(v, 0, c.duration - c.fadeOut); }, { min: 0, max: Math.min(10, c.duration), step: 0.05, ...secs, def: 0 });
    slider(f, 'Fade out', () => c.fadeOut, (v) => { c.fadeOut = C.clamp(v, 0, c.duration - c.fadeIn); }, { min: 0, max: Math.min(10, c.duration), step: 0.05, ...secs, def: 0 });
    const vs = section(body, 'Voice effects');
    const st = C.voice.state(c);
    const vg = C.h('<div class="voice-grid"></div>');
    C.voice.PRESETS.forEach(([id, name, icon]) => {
      const on = ((c.voice && c.voice.preset) || 'none') === id;
      const b = C.h(`<button class="voice-btn ${on ? 'on' : ''}"><span>${icon}</span><small>${name}</small></button>`);
      b.onclick = () => { C.begin(); c.voice = Object.assign({}, c.voice || {}, { preset: id }); commit('Voice: ' + name); C.voice.ensure(c); I.render(true); };
      vg.appendChild(b);
    });
    vs.appendChild(vg);
    slider(vs, 'Bass', () => (c.voice && c.voice.bass) || 0, (v) => { c.voice = Object.assign({}, c.voice || { preset: 'none' }, { bass: Math.round(v) }); }, { min: -12, max: 12, step: 1, unit: ' dB', def: 0 });
    slider(vs, 'Treble', () => (c.voice && c.voice.treble) || 0, (v) => { c.voice = Object.assign({}, c.voice || { preset: 'none' }, { treble: Math.round(v) }); }, { min: -12, max: 12, step: 1, unit: ' dB', def: 0 });
    sw(vs, 'Reduce noise', () => !!(c.voice && c.voice.denoise), (v) => { c.voice = Object.assign({}, c.voice || { preset: 'none' }, { denoise: v }); C.voice.ensure(c); });
    vs.appendChild(C.h(`<p class="hint" style="margin-top:6px">${st && st.status === 'processing' ? '⏳ Processing… the effect will play as soon as it’s ready.' : 'Effects are rendered in the background so playback matches the export exactly.'}</p>`));
    if (c.kind === 'video') {
      const d = section(body, 'Separate');
      const b = C.h(`<button class="btn block">${C.icon('detach')}<span>Detach audio to its own track</span></button>`);
      b.onclick = () => C.ops.detachAudio(c);
      d.appendChild(b);
    }
    if (c.kind === 'audio') timing(body, c);
  }

  function tabSpeed(body, c) {
    if (c.freeze) { const s = section(body, 'Freeze frame'); s.appendChild(C.h('<p class="hint">This is a freeze frame — it holds a single frame for its whole duration. Trim it to change the length.</p>')); timing(body, c); return; }
    const s = section(body, 'Speed');
    const setSpeed = (v) => {
      v = C.clamp(v, 0.1, 10);
      const srcLen = c.duration * c.speed;
      c.speed = v;
      c.duration = Math.max(C.frame(), C.snapTime(srcLen / v));
      const nxt = C.clipsOn(c.trackId).find((x) => x.id !== c.id && x.start >= c.start + 1e-4 && x.start < C.clipEnd(c));
      if (nxt) c.duration = Math.max(C.frame(), nxt.start - c.start);
    };
    slider(s, 'Speed', () => c.speed, setSpeed, {
      min: 0, max: 1000, step: 1, toSlider: (v) => (Math.log(v / 0.1) / Math.log(100)) * 1000, fromSlider: (v) => +(0.1 * Math.pow(100, v / 1000)).toFixed(2),
      fmt: (v) => v.toFixed(2), unit: '×', parse: (s) => parseFloat(s), def: 1,
    });
    const chips = C.h('<div class="chips" style="margin-top:6px"></div>');
    [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5].forEach((v) => {
      const b = C.h(`<button class="chip ${Math.abs(c.speed - v) < 1e-3 ? 'on' : ''}">${v}×</button>`);
      b.onclick = () => { C.begin(); setSpeed(v); commit('Speed'); I.render(true); };
      chips.appendChild(b);
    });
    s.appendChild(chips);
    s.appendChild(C.h('<p class="hint" style="margin-top:10px">Changing speed keeps the same source footage and adjusts the clip length. Audio pitch is preserved.</p>'));
    timing(body, c);
  }

  function tabTransition(body, c) {
    const s = section(body, 'Transition in');
    const prev = C.prevAdjacent(c);
    s.appendChild(C.h(`<p class="hint" style="margin:0 0 10px">${prev ? 'Blends from <b style="color:var(--text)">' + C.esc(prev.kind === 'text' ? 'Text' : prev.name) + '</b> into this clip.' : 'No clip directly before this one on the track — the transition will reveal this clip over whatever is underneath. Butt clips together for a blend.'}</p>`));
    const grid = C.h('<div class="card-grid"></div>');
    [{ id: '', name: 'None' }, ...C.TRANSITIONS].forEach((t) => {
      const on = (c.transition ? c.transition.type : '') === t.id;
      const card = C.h(`<div class="card" style="${on ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)' : ''}"><div class="card-art" style="height:54px"><div class="tr-art" style="width:64px;height:36px">${t.id ? `<div class="tr-a"></div><div class="tr-b" style="animation-name:${t.anim}"></div>` : `<div style="display:grid;place-items:center;height:100%;color:var(--muted)">${C.icon('x')}</div>`}</div></div><div class="card-label">${t.name}</div></div>`);
      card.onclick = () => { C.begin(); C.ops.setTransition([c], t.id || null, c.transition ? c.transition.duration : 0.6); commit('Transition'); I.render(true); };
      grid.appendChild(card);
    });
    s.appendChild(grid);
    if (c.transition) {
      const s2 = section(body, 'Settings');
      slider(s2, 'Duration', () => c.transition.duration, (v) => { c.transition.duration = C.clamp(v, 0.1, c.duration); }, { min: 0.1, max: Math.min(3, c.duration), step: 0.05, ...secs, def: 0.6 });
      const b = C.h(`<button class="btn block" style="margin-top:8px">${C.icon('sparkles')}<span>Apply to all clips on this track</span></button>`);
      b.onclick = () => {
        C.begin();
        for (const x of C.clipsOn(c.trackId)) if (x.id !== c.id && C.prevAdjacent(x)) x.transition = C.deep(c.transition);
        commit('Apply transition to all'); C.toast('Transition applied to all cuts on this track');
      };
      s2.appendChild(b);
    }
  }

  function tabEffects(body, c) {
    const bar = C.h(`<div class="fx-actions"><button class="btn primary" data-a="add">${C.icon('plus')}<span>Add effect</span></button><button class="btn" data-a="presets">${C.icon('sparkles')}<span>Presets</span></button><button class="icon-btn" data-a="studio" data-tip="Open Effect Studio">${C.icon('wand')}</button></div>`);
    bar.querySelector('[data-a=add]').onclick = () => C.presets.picker([c]);
    bar.querySelector('[data-a=studio]').onclick = () => C.presets.studio({ fromClip: c });
    bar.querySelector('[data-a=presets]').onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      C.menu(r.left, r.bottom + 4, [
        ...C.presets.all().slice(0, 14).map((p) => ({ label: p.name, icon: 'sparkles', action: () => { C.act('Apply preset', () => C.presets.applyTo(p, [c])); I.render(true); } })),
        '-', { label: 'Save these effects as a preset…', icon: 'save', disabled: !(c.effects || []).length, action: () => C.presets.saveFromClip(c) },
        { label: 'Browse all presets…', icon: 'layers', action: () => C.presets.picker([c]) },
      ]);
    };
    body.appendChild(bar);
    const list = c.effects || [];
    if (!list.length) {
      body.appendChild(C.h(`<div class="empty-note">No effects yet.<br>Add one above, drag one from the <b>Effects</b> library, or apply a preset.<br><br>Every slider has a ◆ keyframe button so effects can change over time.</div>`));
      return;
    }
    list.forEach((e, i) => {
      const d = C.fx.def(e.type); if (!d) return;
      const focused = C.UI.focusFx && C.UI.focusFx.fx === e.id;
      const card = C.h(`<div class="fx-card ${e.on === false ? 'off' : ''} ${focused ? 'focused' : ''}">
        <div class="fx-head"><label class="switch"><input type="checkbox" ${e.on !== false ? 'checked' : ''}><span></span></label><span class="fx-ico">${d.icon}</span><b>${C.esc(d.name)}</b>
          <span style="flex:1"></span>${d.region || d.point ? `<button class="icon-btn" data-a="pos" data-tip="Position on canvas">${C.icon('fit')}</button>` : ''}<button class="icon-btn" data-a="up" data-tip="Move up" ${i === 0 ? 'disabled' : ''}>${C.icon('chevronDown').replace('<svg', '<svg style="transform:rotate(180deg)"')}</button><button class="icon-btn" data-a="down" data-tip="Move down" ${i === list.length - 1 ? 'disabled' : ''}>${C.icon('chevronDown')}</button><button class="icon-btn" data-a="del" data-tip="Remove effect">${C.icon('x')}</button></div>
        <div class="fx-body"></div></div>`);
      card.querySelector('input[type=checkbox]').onchange = (ev) => { C.begin(); e.on = ev.target.checked; commit('Toggle effect'); I.render(true); };
      card.querySelector('[data-a=del]').onclick = () => { C.begin(); c.effects.splice(c.effects.indexOf(e), 1); for (const k of Object.keys(c.kf || {})) if (k.startsWith(`e.${e.id}.`)) delete c.kf[k]; commit('Remove effect'); I.render(true); C.tl.render(); };
      card.querySelector('[data-a=up]').onclick = () => { C.begin(); const a = c.effects; const j = a.indexOf(e); a.splice(j, 1); a.splice(j - 1, 0, e); commit('Reorder effects'); I.render(true); };
      card.querySelector('[data-a=down]').onclick = () => { C.begin(); const a = c.effects; const j = a.indexOf(e); a.splice(j, 1); a.splice(j + 1, 0, e); commit('Reorder effects'); I.render(true); };
      const pos = card.querySelector('[data-a=pos]');
      if (pos) pos.onclick = () => {
        if (d.region && (!e.p.area || e.p.area === 'full')) { C.begin(); e.p.area = 'box'; commit('Effect area'); }
        C.UI.focusFx = { clip: c.id, fx: e.id };
        if (C.UI.playhead < c.start || C.UI.playhead >= C.clipEnd(c)) C.engine.seek(c.start + Math.min(0.5, c.duration / 2));
        I.render(true); C.preview.update(); C.toast('Drag the dashed box on the player to position the effect', 'info', 2400);
      };
      card.addEventListener('pointerdown', (ev) => { if (ev.target.closest('button, input, select, .kf-btn')) return; if (C.UI.focusFx?.fx !== e.id) { C.UI.focusFx = { clip: c.id, fx: e.id }; C.$$('.fx-card', root).forEach((x) => x.classList.remove('focused')); card.classList.add('focused'); C.preview.update(); } });
      const b = card.querySelector('.fx-body');
      const regionKeys = ['rx', 'ry', 'rw', 'rh', 'invert'];
      for (const prm of d.params) {
        if (d.region && regionKeys.includes(prm.key) && (!e.p.area || e.p.area === 'full')) continue;
        const path = `e.${e.id}.${prm.key}`;
        if (prm.type === 'range') prop(b, c, path, prm.label, { min: prm.min, max: prm.max, step: prm.step, unit: prm.unit, def: prm.def, fmt: prm.step < 0.01 ? (v) => (+v).toFixed(3) : prm.step < 1 ? (v) => (+v).toFixed(1) : (v) => Math.round(v) });
        else if (prm.type === 'color') {
          const row = color(b, prm.label, () => e.p[prm.key], (v) => { e.p[prm.key] = v; });
          if (window.EyeDropper && e.type === 'chromaKey') {
            const pick = C.h(`<button class="btn" style="margin:-2px 0 8px">${C.icon('eyedrop')}<span>Pick key color from screen</span></button>`);
            pick.onclick = async () => { try { const r = await new window.EyeDropper().open(); C.begin(); e.p[prm.key] = r.sRGBHex; commit('Pick key color'); refresh(); } catch (_) {} };
            b.appendChild(pick);
          }
          void row;
        } else if (prm.type === 'select') select(b, prm.label, prm.options, () => e.p[prm.key], (v) => { e.p[prm.key] = v; if (prm.key === 'area') setTimeout(() => I.render(true), 0); });
        else if (prm.type === 'bool') sw(b, prm.label, () => e.p[prm.key], (v) => { e.p[prm.key] = v; });
        else if (prm.type === 'text') textRow(b, prm.label, () => e.p[prm.key], (v) => { e.p[prm.key] = v; });
      }
      body.appendChild(card);
    });
  }

  function tabText(body, c) {
    const tx = c.text;
    const s = section(body, 'Content');
    const ta = C.h('<textarea class="textarea" spellcheck="false"></textarea>');
    ta.value = tx.content;
    let typing = null;
    ta.addEventListener('input', () => { C.begin(); tx.content = ta.value; live(); clearTimeout(typing); typing = setTimeout(() => { commit('Edit text'); C.tl.render(); }, 700); });
    ta.addEventListener('blur', () => { clearTimeout(typing); if (C._txn) { commit('Edit text'); C.tl.render(); } });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    refreshers.push(() => { if (document.activeElement !== ta) ta.value = tx.content; });
    s.appendChild(ta);
    const emo = C.h(`<button class="btn" style="margin-top:8px">${C.icon('smile')}<span>Insert emoji</span></button>`);
    emo.onclick = (e) => C.emoji.picker(emo, (em) => {
      const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
      ta.value = ta.value.slice(0, a) + em + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + em.length;
      C.begin(); tx.content = ta.value; commit('Insert emoji'); C.tl.render();
    });
    s.appendChild(emo);
    const st = section(body, 'Style', () => { const content = tx.content; Object.assign(tx, C.defaultText(), { content }); });
    select(st, 'Font', C.FONTS.map((f) => [f, f]), () => tx.font, (v) => { tx.font = v; });
    prop(st, c, 'text.size', 'Size', { min: 12, max: 400, step: 1, unit: 'px', def: 96, clamp: (v) => C.clamp(v, 4, 800) });
    color(st, 'Color', () => tx.color, (v) => { tx.color = v; });
    toggles(st, 'Style', [['Bold', 'bold', () => tx.bold, (v) => { tx.bold = v; }], ['Italic', 'italic', () => tx.italic, (v) => { tx.italic = v; }], ['ALL CAPS', null, () => tx.uppercase, (v) => { tx.uppercase = v; }]]);
    seg(st, 'Align', [['left', 'Left', 'alignLeft'], ['center', 'Center', 'alignCenter'], ['right', 'Right', 'alignRight']], () => tx.align, (v) => { tx.align = v; });
    prop(st, c, 'text.letterSpacing', 'Spacing', { min: -10, max: 50, step: 0.5, def: 0 });
    slider(st, 'Line height', () => tx.lineHeight, (v) => { tx.lineHeight = v; }, { min: 0.7, max: 2.5, step: 0.05, def: 1.15 });
    const ol = section(body, 'Outline & shadow');
    color(ol, 'Outline', () => tx.strokeColor, (v) => { tx.strokeColor = v; });
    prop(ol, c, 'text.strokeWidth', 'Thickness', { min: 0, max: 20, step: 0.5, def: 0, clamp: (v) => Math.max(0, v) });
    slider(ol, 'Shadow', () => tx.shadow, (v) => { tx.shadow = C.clamp(v, 0, 1); }, { min: 0, max: 1, step: 0.01, ...pct, def: 0.4 });
    const bg = section(body, 'Background');
    color(bg, 'Color', () => tx.bg, (v) => { tx.bg = v; });
    slider(bg, 'Opacity', () => tx.bgOpacity, (v) => { tx.bgOpacity = C.clamp(v, 0, 1); }, { min: 0, max: 1, step: 0.01, ...pct, def: 0 });
    select(bg, 'Style', [['box', 'Box'], ['pill', 'Pill'], ['line', 'Highlight each line']], () => tx.bgStyle || 'box', (v) => { tx.bgStyle = v; });
    const D = C.textFX.DEFAULTS; for (const k in D) if (tx[k] === undefined) tx[k] = C.deep(D[k]);
    const la = section(body, 'Letter animation');
    select(la, 'In', C.textFX.CHAR_IN, () => tx.charIn, (v) => { tx.charIn = v; });
    select(la, 'Out', C.textFX.CHAR_OUT, () => tx.charOut, (v) => { tx.charOut = v; });
    select(la, 'Loop', C.textFX.CHAR_LOOP, () => tx.charLoop, (v) => { tx.charLoop = v; });
    slider(la, 'Stagger', () => tx.stagger, (v) => { tx.stagger = C.clamp(v, 0, 1); }, { min: 0, max: 0.3, step: 0.005, ...secs, def: 0.04 });
    slider(la, 'Letter speed', () => tx.charDur, (v) => { tx.charDur = C.clamp(v, 0.05, 3); }, { min: 0.05, max: 1.5, step: 0.01, ...secs, def: 0.45 });
    slider(la, 'Loop speed', () => tx.loopSpeed, (v) => { tx.loopSpeed = C.clamp(v, 0.1, 5); }, { min: 0.1, max: 4, step: 0.05, def: 1, fmt: (v) => (+v).toFixed(2) + '×' });
    la.appendChild(C.h('<p class="hint">Letter animations play per character. Combine with the clip Animation tab and keyframes for full control.</p>'));
    const fl = section(body, 'Fill');
    seg(fl, 'Type', [['solid', 'Solid'], ['gradient', 'Gradient']], () => tx.fill, (v) => { tx.fill = v; I.render(true); });
    if (tx.fill === 'gradient') {
      color(fl, 'From', () => tx.grad1, (v) => { tx.grad1 = v; });
      color(fl, 'To', () => tx.grad2, (v) => { tx.grad2 = v; });
      slider(fl, 'Angle', () => tx.gradAngle, (v) => { tx.gradAngle = v; }, { min: 0, max: 360, step: 1, unit: '°', def: 90 });
    }
    const gl = section(body, 'Glow & 3D');
    prop(gl, c, 'text.glow', 'Glow', { min: 0, max: 100, step: 1, def: 0 });
    color(gl, 'Glow color', () => tx.glowColor, (v) => { tx.glowColor = v; });
    prop(gl, c, 'text.extrude', '3D depth', { min: 0, max: 60, step: 0.5, def: 0 });
    color(gl, '3D color', () => tx.extrudeColor, (v) => { tx.extrudeColor = v; });
    slider(gl, '3D angle', () => tx.extrudeAngle, (v) => { tx.extrudeAngle = v; }, { min: 0, max: 360, step: 1, unit: '°', def: 135 });
    const cu = section(body, 'Curve & second outline');
    prop(cu, c, 'text.curve', 'Curve', { min: -100, max: 100, step: 1, def: 0 });
    prop(cu, c, 'text.stroke2Width', 'Outer outline', { min: 0, max: 20, step: 0.5, def: 0, clamp: (v) => Math.max(0, v) });
    color(cu, 'Outer color', () => tx.stroke2Color, (v) => { tx.stroke2Color = v; });
    color(cu, 'Shadow color', () => tx.shadowColor, (v) => { tx.shadowColor = v; });
    const f = section(body, 'Fade');
    slider(f, 'Fade in', () => c.fadeIn, (v) => { c.fadeIn = C.clamp(v, 0, c.duration - c.fadeOut); }, { min: 0, max: Math.min(5, c.duration), step: 0.05, ...secs, def: 0 });
    slider(f, 'Fade out', () => c.fadeOut, (v) => { c.fadeOut = C.clamp(v, 0, c.duration - c.fadeIn); }, { min: 0, max: Math.min(5, c.duration), step: 0.05, ...secs, def: 0 });
    timing(body, c);
  }

  function renderMulti(sel) {
    root.appendChild(C.h(`<div class="insp-head"><div class="insp-title"><span class="dot" style="background:var(--accent)"></span><b>${sel.length} clips selected</b></div></div>`));
    const body = C.h('<div class="insp-body"></div>'); root.appendChild(body);
    const vis = sel.filter((c) => c.kind !== 'audio');
    const aud = sel.filter((c) => C.hasAudio(c));
    if (vis.length) {
      const s = section(body, 'Visual');
      slider(s, 'Opacity', () => vis[0].t.opacity, (v) => vis.forEach((c) => { c.t.opacity = C.clamp(v, 0, 1); }), { min: 0, max: 1, step: 0.01, ...pct });
      slider(s, 'Fade in', () => vis[0].fadeIn, (v) => vis.forEach((c) => { c.fadeIn = C.clamp(v, 0, c.duration / 2); }), { min: 0, max: 3, step: 0.05, ...secs });
      slider(s, 'Fade out', () => vis[0].fadeOut, (v) => vis.forEach((c) => { c.fadeOut = C.clamp(v, 0, c.duration / 2); }), { min: 0, max: 3, step: 0.05, ...secs });
      select(s, 'Transition', [['', 'None'], ...C.TRANSITIONS.map((t) => [t.id, t.name])], () => (vis[0].transition ? vis[0].transition.type : ''), (v) => C.ops.setTransition(vis, v || null));
      select(s, 'Filter', C.FILTERS.map((f) => [f.id, f.name]), () => vis[0].filterName || 'none', (v) => C.ops.applyFilter(vis, v));
    }
    if (aud.length) {
      const s = section(body, 'Audio');
      slider(s, 'Volume', () => aud[0].volume, (v) => aud.forEach((c) => { c.volume = C.clamp(v, 0, 2); }), { min: 0, max: 2, step: 0.01, ...pct });
    }
    const a = section(body, 'Actions');
    const row = C.h('<div style="display:grid;gap:8px"></div>');
    [['Duplicate', 'copy', () => C.ops.duplicate()], ['Delete', 'trash', () => C.ops.deleteSelected(false)], ['Ripple delete', 'ripple', () => C.ops.deleteSelected(true)]].forEach(([l, ic, fn]) => {
      const b = C.h(`<button class="btn block">${C.icon(ic)}<span>${l}</span></button>`); b.onclick = fn; row.appendChild(b);
    });
    a.appendChild(row);
  }

  function renderProject() {
    const p = C.project; const s = p.settings;
    root.appendChild(C.h(`<div class="insp-head"><div class="insp-title"><span class="dot" style="background:var(--muted)"></span><b>Project</b><small>${s.width}×${s.height}</small></div></div>`));
    const body = C.h('<div class="insp-body"></div>'); root.appendChild(body);
    const sec = section(body, 'Canvas');
    const chips = C.h('<div class="chips"></div>');
    Object.keys(C.ASPECTS).forEach((a) => {
      const b = C.h(`<button class="chip ${s.aspect === a ? 'on' : ''}">${a}</button>`);
      b.onclick = () => C.setAspect(a);
      chips.appendChild(b);
    });
    sec.appendChild(chips);
    select(sec, 'Frame rate', [[24, '24 fps (film)'], [25, '25 fps (PAL)'], [30, '30 fps'], [50, '50 fps'], [60, '60 fps']].map(([v, l]) => [String(v), l]), () => String(s.fps), (v) => { s.fps = +v; });
    color(sec, 'Background', () => s.bg, (v) => { s.bg = v; });

    const stats = section(body, 'Overview');
    const nClips = C.allClips().length, nMedia = Object.keys(p.media).length;
    stats.appendChild(C.h(`<div class="shortcut-list"><span>Duration</span><b>${C.fmtTC(C.duration(), s.fps)}</b><span>Clips</span><b>${nClips}</b><span>Media files</span><b>${nMedia}</b><span>Tracks</span><b>${p.trackOrder.length}</b></div>`));

    const col = section(body, 'Collaborate');
    const cs = C.collab && C.collab.status ? C.collab.status() : null;
    col.appendChild(C.h(`<p class="hint" style="margin:0 0 10px">${cs && cs.mode !== 'off' ? `Live session · <b style="color:var(--accent)">${cs.peers} other${cs.peers === 1 ? '' : 's'} connected</b>` : 'Invite friends with a join code and edit this project together — changes sync live.'}</p>`));
    const cb = C.h(`<button class="btn block">${C.icon('users')}<span>${cs && cs.mode !== 'off' ? 'Session details' : 'Start or join a session'}</span></button>`);
    cb.onclick = () => C.collabUI && C.collabUI.open();
    col.appendChild(cb);

    const sc = section(body, 'Keyboard shortcuts');
    const list = [['Play / pause', 'Space'], ['Split at playhead', 'S'], ['Blade / select tool', 'B / V'], ['Delete / ripple delete', 'Del / Shift+Del'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Copy / paste / duplicate', 'Ctrl+C / V / D'], ['Frame step', '← / →'], ['Jump 1 second', 'Shift+← / →'], ['Nudge clip', 'Alt+← / →'], ['Start / end', 'Home / End'], ['Zoom timeline', 'Ctrl+wheel, + / −'], ['Add marker', 'M'], ['Import media', 'Ctrl+I'], ['Save', 'Ctrl+S'], ['Export', 'Ctrl+E']];
    sc.appendChild(C.h(`<div class="shortcut-list">${list.map(([a, k]) => `<span>${a}</span><span class="kbd">${k}</span>`).join('')}</div>`));
  }
})(window.C);
