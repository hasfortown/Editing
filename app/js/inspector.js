/* Cutroom — inspector (properties panel) */
(function (C) {
  const I = (C.inspector = {});
  let root, key = '', tab = null, refreshers = [], selfCommit = false;

  I.init = () => {
    root = C.$('#inspector');
    C.on('select', () => I.render());
    C.on('change', (info) => {
      if (selfCommit) return;
      const k = computeKey();
      if (k !== key) I.render(); else refresh();
    });
    C.on('fadeLive', refresh);
    C.on('inspectTab', (t) => { if (t) tab = t; I.render(true); });
    C.on('focusText', () => { tab = 'text'; I.render(true); setTimeout(() => { const ta = root.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } }, 30); });
    C.on('collab', () => { if (!C.selection.size) I.render(true); });
    I.render();
  };

  function computeKey() {
    const s = C.selectedClips();
    return s.map((c) => c.id + ':' + c.kind + ':' + !!c.transition + ':' + c.freeze).join(',') + '|' + (s.length ? '' : C.project.settings.aspect);
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
    }[c.kind];
    if (c.kind === 'video' && !C.hasAudio(c)) tabs.splice(tabs.findIndex((t) => t[0] === 'audio'), 1);
    if (!tab || !tabs.some((t) => t[0] === tab)) tab = tabs[0][0];
    const dot = { video: 'var(--clip-video)', image: 'var(--clip-image)', audio: 'var(--clip-audio)', text: 'var(--clip-text)', color: 'var(--clip-color)' }[c.kind];
    const head = C.h(`<div class="insp-head"><div class="insp-title"><span class="dot" style="background:${dot}"></span><b>${C.esc(c.kind === 'text' ? 'Text' : c.name)}</b><small>${C.fmtDur(c.duration)}</small></div><div class="tabs"></div></div>`);
    const tb = head.querySelector('.tabs');
    tabs.forEach(([id, l]) => { const b = C.h(`<button class="tab ${id === tab ? 'active' : ''}">${l}</button>`); b.onclick = () => { tab = id; I.render(true); }; tb.appendChild(b); });
    root.appendChild(head);
    const body = C.h('<div class="insp-body"></div>'); root.appendChild(body);
    ({ video: tabTransform, adjust: tabAdjust, anim: tabAnim, audio: tabAudio, speed: tabSpeed, transition: tabTransition, text: tabText })[tab](body, c);
    if (sameSel) root.scrollTop = prevScroll;
  };

  function timing(body, c) {
    const s = section(body, 'Timing');
    slider(s, 'Start', () => c.start, (v) => { c.start = Math.max(0, C.snapTime(v)); }, { min: 0, max: Math.max(10, C.duration() + 10), step: C.frame(), ...secs });
    slider(s, 'Duration', () => c.duration, (v) => { c.duration = C.clamp(C.snapTime(v), C.frame(), C.maxDuration(c)); }, { min: C.frame(), max: Math.min(C.maxDuration(c), Math.max(30, c.duration * 2)), step: C.frame(), ...secs });
  }

  function tabTransform(body, c) {
    if (c.kind === 'color') { const s = section(body, 'Fill'); color(s, 'Color', () => c.color, (v) => { c.color = v; }); }
    const s = section(body, 'Transform', () => { c.t = Object.assign(C.defaultTransform(), { fit: c.t.fit }); });
    slider(s, 'Scale', () => c.t.scale, (v) => { c.t.scale = v; }, { min: 0.05, max: 4, step: 0.01, ...pct, def: 1, hardMin: 0.01 });
    slider(s, 'Position X', () => c.t.x, (v) => { c.t.x = v; }, { min: -0.5, max: 1.5, step: 0.001, fmt: (v) => Math.round((v - 0.5) * C.project.settings.width), parse: (s) => parseFloat(s) / C.project.settings.width + 0.5, def: 0.5 });
    slider(s, 'Position Y', () => c.t.y, (v) => { c.t.y = v; }, { min: -0.5, max: 1.5, step: 0.001, fmt: (v) => Math.round((v - 0.5) * C.project.settings.height), parse: (s) => parseFloat(s) / C.project.settings.height + 0.5, def: 0.5 });
    slider(s, 'Rotation', () => c.t.rotation, (v) => { c.t.rotation = v; }, { min: -180, max: 180, step: 0.5, unit: '°', def: 0 });
    slider(s, 'Opacity', () => c.t.opacity, (v) => { c.t.opacity = C.clamp(v, 0, 1); }, { min: 0, max: 1, step: 0.01, ...pct, def: 1 });
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
    fx.forEach(([l, k, mn, mx]) => slider(s, l, () => c.fx[k], (v) => { c.fx[k] = v; }, { min: mn, max: mx, step: 1, def: 0 }));
    const s2 = section(body, 'Effects');
    [['Blur', 'blur', 0, 60], ['Vignette', 'vignette', 0, 100], ['Black & white', 'grayscale', 0, 100], ['Sepia', 'sepia', 0, 100], ['Invert', 'invert', 0, 100]]
      .forEach(([l, k, mn, mx]) => slider(s2, l, () => c.fx[k], (v) => { c.fx[k] = v; }, { min: mn, max: mx, step: 1, def: 0 }));
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
    slider(s, 'Volume', () => c.volume, (v) => { c.volume = C.clamp(v, 0, 2); }, { min: 0, max: 2, step: 0.01, ...pct, def: 1 });
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
    const st = section(body, 'Style', () => { const content = tx.content; Object.assign(tx, C.defaultText(), { content }); });
    select(st, 'Font', C.FONTS.map((f) => [f, f]), () => tx.font, (v) => { tx.font = v; });
    slider(st, 'Size', () => tx.size, (v) => { tx.size = C.clamp(v, 8, 600); }, { min: 12, max: 300, step: 1, unit: 'px', def: 96 });
    color(st, 'Color', () => tx.color, (v) => { tx.color = v; });
    toggles(st, 'Style', [['Bold', 'bold', () => tx.bold, (v) => { tx.bold = v; }], ['Italic', 'italic', () => tx.italic, (v) => { tx.italic = v; }], ['ALL CAPS', null, () => tx.uppercase, (v) => { tx.uppercase = v; }]]);
    seg(st, 'Align', [['left', 'Left', 'alignLeft'], ['center', 'Center', 'alignCenter'], ['right', 'Right', 'alignRight']], () => tx.align, (v) => { tx.align = v; });
    slider(st, 'Spacing', () => tx.letterSpacing, (v) => { tx.letterSpacing = v; }, { min: -10, max: 50, step: 0.5, def: 0 });
    slider(st, 'Line height', () => tx.lineHeight, (v) => { tx.lineHeight = v; }, { min: 0.7, max: 2.5, step: 0.05, def: 1.15 });
    const ol = section(body, 'Outline & shadow');
    color(ol, 'Outline', () => tx.strokeColor, (v) => { tx.strokeColor = v; });
    slider(ol, 'Thickness', () => tx.strokeWidth, (v) => { tx.strokeWidth = Math.max(0, v); }, { min: 0, max: 20, step: 0.5, def: 0 });
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
    col.appendChild(C.h(`<p class="hint" style="margin:0 0 10px">${cs && cs.mode !== 'off' ? `Live session · <b style="color:var(--accent)">${cs.peers} other${cs.peers === 1 ? '' : 's'} connected</b>` : 'Edit together with someone on the same Wi-Fi network — changes sync live.'}</p>`));
    const cb = C.h(`<button class="btn block">${C.icon('users')}<span>${cs && cs.mode !== 'off' ? 'Session details' : 'Start or join a session'}</span></button>`);
    cb.onclick = () => C.collabUI && C.collabUI.open();
    col.appendChild(cb);

    const sc = section(body, 'Keyboard shortcuts');
    const list = [['Play / pause', 'Space'], ['Split at playhead', 'S'], ['Blade / select tool', 'B / V'], ['Delete / ripple delete', 'Del / Shift+Del'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Copy / paste / duplicate', 'Ctrl+C / V / D'], ['Frame step', '← / →'], ['Jump 1 second', 'Shift+← / →'], ['Nudge clip', 'Alt+← / →'], ['Start / end', 'Home / End'], ['Zoom timeline', 'Ctrl+wheel, + / −'], ['Add marker', 'M'], ['Import media', 'Ctrl+I'], ['Save', 'Ctrl+S'], ['Export', 'Ctrl+E']];
    sc.appendChild(C.h(`<div class="shortcut-list">${list.map(([a, k]) => `<span>${a}</span><span class="kbd">${k}</span>`).join('')}</div>`));
  }
})(window.C);
