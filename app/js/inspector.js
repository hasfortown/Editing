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
      video: [['video', 'Video'], ['adjust', 'Adjust'], ['anim', 'Animation'], ['audio', 'Audio'], ['speed', 'Speed'], ['transition', 'Transition']],
      image: [['video', 'Image'], ['adjust', 'Adjust'], ['anim', 'Animation'], ['transition', 'Transition']],
      text: [['text', 'Text'], ['video', 'Transform'], ['anim', 'Animation'], ['transition', 'Transition']],
      audio: [['audio', 'Audio'], ['speed', 'Speed']],
      color: [['video', 'Color'], ['adjust', 'Adjust'], ['anim', 'Animation'], ['transition', 'Transition']],
      effect: [['effects', 'Effects'], ['video', 'Layer']],
    }[c.kind];
    if (c.kind !== 'audio' && c.kind !== 'effect') tabs.splice(1, 0, ['effects', 'Effects']);
    if (c.kind === 'video' && !C.hasAudio(c)) tabs.splice(tabs.findIndex((t) => t[0] === 'audio'), 1);
    if (!tab || !tabs.some((t) => t[0] === tab)) tab = tabs[0][0];
    curClip = c;
    const dot = { video: 'var(--clip-video)', image: 'var(--clip-image)', audio: 'var(--clip-audio)', text: 'var(--clip-text)', color: 'var(--clip-color)', effect: 'var(--clip-effect)' }[c.kind];
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
    ({ video: tabTransform, adjust: tabAdjust, anim: tabAnim, audio: tabAudio, speed: tabSpeed, transition: tabTransition, text: tabText, effects: tabEffects })[tab](body, c);
    if (sameSel) root.scrollTop = prevScroll;
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
