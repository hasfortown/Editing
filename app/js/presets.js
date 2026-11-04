/* Cutroom — effect presets, effect picker, Effect Studio, import/export */
(function (C) {
  const N = window.native;
  const P = (C.presets = { user: [] });

  P.load = async () => {
    try { const t = await N.presetsLoad(); P.user = t ? (JSON.parse(t).presets || []) : []; } catch (_) { P.user = []; }
    C.emit('presets');
  };
  const persist = C.debounce(() => N.presetsSave(JSON.stringify({ app: 'cutroom-fx', version: 1, presets: P.user }, null, 1)), 250);
  P.all = () => [...P.user, ...C.fx.BUILTIN_PRESETS];
  P.byId = (id) => P.all().find((p) => p.id === id);

  // stored presets reference effects by index ("e.<index>.<param>") so they are portable
  P.fromEffects = (name, effects, kf) => {
    const idx = {}; effects.forEach((e, i) => { idx[e.id] = String(i); });
    const pk = {};
    for (const path in kf || {}) { const parts = path.split('.'); if (parts[0] === 'e' && idx[parts[1]] !== undefined) pk[`e.${idx[parts[1]]}.${parts[2]}`] = C.deep(kf[path]); }
    return { id: C.uid('p_'), name, created: Date.now(), effects: effects.map((e) => ({ type: e.type, on: e.on !== false, p: C.deep(e.p) })), kf: pk };
  };
  P.instantiate = (preset) => {
    const map = {};
    const effects = (preset.effects || []).filter((e) => C.fx.def(e.type)).map((e, i) => {
      const fresh = C.fx.newEffect(e.type, C.deep(e.p)); fresh.on = e.on !== false; map[String(i)] = fresh.id; return fresh;
    });
    const kf = {};
    for (const path in preset.kf || {}) { const parts = path.split('.'); if (map[parts[1]]) kf[`e.${map[parts[1]]}.${parts[2]}`] = C.deep(preset.kf[path]); }
    return { effects, kf };
  };
  P.applyTo = (preset, clips) => {
    for (const c of clips) {
      const inst = P.instantiate(preset);
      c.effects = (c.effects || []).concat(inst.effects);
      c.kf = Object.assign(c.kf || {}, inst.kf);
    }
  };
  P.refPreset = (ref) => {
    if (ref.startsWith('fx:')) { const d = C.fx.def(ref.slice(3)); return d ? { id: ref, name: d.name, effects: [C.fx.newEffect(d.id)] } : null; }
    return P.byId(ref.replace(/^preset:/, ''));
  };
  // ref: "fx:<type>" or "preset:<id>". With clips -> add to them, otherwise create an effect clip.
  P.applyRef = (ref, clips, t = C.UI.playhead, trackId = null) => {
    const pr = P.refPreset(ref); if (!pr) return;
    if (clips && clips.length) {
      C.act('Add effect', () => P.applyTo(pr, clips));
      C.select(clips.map((c) => c.id));
      C.emit('inspectTab', 'effects');
      C.toast(`${pr.name} added to ${clips.length > 1 ? clips.length + ' clips' : 'clip'}`, 'ok', 1500);
    } else {
      let c;
      C.act('Add effect clip', () => { const inst = P.instantiate(pr); c = C.ops.addEffectClip(inst.effects, t, trackId, pr.name, inst.kf); });
      C.select([c.id]); C.emit('inspectTab', 'effects');
      C.toast(`${pr.name} effect clip added — it affects everything below it`, 'ok', 2400);
    }
  };

  P.saveFromClip = async (c) => {
    if (!c.effects || !c.effects.length) return;
    const name = await C.prompt('Save effect preset', 'Preset name', c.effects.map((e) => C.fx.def(e.type)?.name).filter(Boolean).slice(0, 2).join(' + '), 'Save');
    if (!name) return;
    P.user.unshift(P.fromEffects(name, c.effects, c.kf)); persist(); C.emit('presets');
    C.toast(`Saved preset “${name}”`);
  };
  P.remove = async (p) => {
    if (!(await C.confirm('Delete preset?', `“${C.esc(p.name)}” will be removed from your presets.`, 'Delete', true))) return;
    P.user = P.user.filter((x) => x.id !== p.id); persist(); C.emit('presets');
  };
  P.rename = async (p) => { const v = await C.prompt('Rename preset', 'Name', p.name); if (v) { p.name = v; persist(); C.emit('presets'); } };

  P.exportPresets = async (list, name) => {
    if (!list.length) { C.toast('No presets to export yet — save one first', 'info'); return; }
    const out = await N.presetsExportDialog(name);
    if (!out) return;
    const clean = list.map((p) => ({ name: p.name, created: p.created || Date.now(), effects: p.effects, kf: p.kf || {} }));
    await N.writeText(out, JSON.stringify({ app: 'cutroom-fx', version: 1, presets: clean }, null, 1));
    C.toast(`Exported ${list.length} preset${list.length > 1 ? 's' : ''}`); N.showItem(out);
  };
  P.importPresets = async () => {
    const files = await N.presetsImportDialog();
    let n = 0, bad = 0; const added = [];
    for (const f of files) {
      try {
        const d = JSON.parse(f.text);
        const list = Array.isArray(d) ? d : d.presets || (d.effects ? [d] : []);
        for (const p of list) {
          const effects = (p.effects || []).filter((e) => e && C.fx.def(e.type));
          if (!effects.length) { bad++; continue; }
          const np = { id: C.uid('p_'), name: String(p.name || 'Imported preset').slice(0, 60), created: Date.now(), imported: true, effects: effects.map((e) => ({ type: e.type, on: e.on !== false, p: Object.assign(C.fx.newEffect(e.type).p, e.p || {}) })), kf: p.kf || {} };
          P.user.unshift(np); added.push(np); n++;
        }
      } catch (_) { bad++; }
    }
    if (n) { persist(); C.emit('presets'); C.toast(`Imported ${n} preset${n > 1 ? 's' : ''}`); }
    else if (files.length) C.toast('No valid presets found in that file', 'err');
    if (bad && n) C.toast(`${bad} item(s) were skipped (unknown effects)`, 'info');
    return added;
  };

  // ---------- effect picker ----------
  P.picker = (clips) => {
    clips = (clips || []).filter((c) => c.kind !== 'audio');
    let tab = 'effects', q = '';
    const { el, close } = C.modal(`<div class="modal-head"><h2>${clips.length ? `Add effect to ${clips.length > 1 ? clips.length + ' clips' : 'clip'}` : 'Add effect clip at playhead'}</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body"><div style="display:flex;gap:8px;margin-bottom:12px"><div class="export-tabs" style="margin:0"><button class="chip" data-t="effects">Effects</button><button class="chip" data-t="presets">Presets</button></div><input class="text-input" id="pkQ" placeholder="Search effects…" style="flex:1"></div><div id="pkBody" style="max-height:60vh;overflow:auto"></div></div>`, { cls: 'wide' });
    const body = el.querySelector('#pkBody');
    const card = (ref, name, effects, key, icon) => {
      const cd = C.h(`<div class="card fx-pick"><div class="card-art"><img alt=""><span class="fx-badge">${icon || ''}</span></div><div class="card-label">${C.esc(name)}</div></div>`);
      const img = cd.querySelector('img');
      queueThumb(img, effects, key);
      hoverAnimate(cd, img, effects);
      cd.onclick = () => { close(); P.applyRef(ref, clips); };
      return cd;
    };
    const render = () => {
      el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      body.innerHTML = '';
      const ql = q.toLowerCase();
      if (tab === 'effects') {
        for (const cat of C.fx.CATS) {
          const defs = C.fx.DEFS.filter((d) => d.cat === cat && (!ql || d.name.toLowerCase().includes(ql) || cat.toLowerCase().includes(ql)));
          if (!defs.length) continue;
          body.appendChild(C.h(`<h4 class="pk-cat">${cat}</h4>`));
          const g = C.h('<div class="card-grid fx-grid"></div>');
          defs.forEach((d) => g.appendChild(card('fx:' + d.id, d.name, [C.fx.newEffect(d.id)], 'fx:' + d.id, d.icon)));
          body.appendChild(g);
        }
      } else {
        const list = P.all().filter((p) => !ql || p.name.toLowerCase().includes(ql));
        const g = C.h('<div class="card-grid fx-grid"></div>');
        list.forEach((p) => g.appendChild(card('preset:' + p.id, p.name, P.instantiate(p).effects, 'p:' + p.id + ':' + (p.created || 0), p.builtin ? '★' : '')));
        body.appendChild(g);
        if (!list.length) body.appendChild(C.h('<div class="empty-note">No presets match.</div>'));
      }
    };
    el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; render(); }));
    const qi = el.querySelector('#pkQ'); qi.addEventListener('input', () => { q = qi.value; render(); }); qi.addEventListener('keydown', (e) => e.stopPropagation());
    setTimeout(() => qi.focus(), 30);
    render();
  };

  // thumbnails are rendered a few at a time so panels open instantly
  const queue = []; let pumping = false;
  function queueThumb(img, effects, key) {
    queue.push({ img, effects, key });
    if (!pumping) { pumping = true; requestAnimationFrame(pump); }
  }
  function pump() {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 12) { const j = queue.shift(); if (document.body.contains(j.img)) j.img.src = C.fx.thumb(j.effects, j.key); }
    if (queue.length) requestAnimationFrame(pump); else pumping = false;
  }
  P.queueThumb = queueThumb;
  function hoverAnimate(cardEl, img, effects) {
    let timer = null, t = 0;
    cardEl.addEventListener('mouseenter', () => { const still = img.src; timer = setInterval(() => { t += 0.08; img.src = C.fx.thumb(effects, null, 192, 108, t); }, 80); cardEl._still = still; });
    cardEl.addEventListener('mouseleave', () => { clearInterval(timer); timer = null; t = 0; if (cardEl._still) img.src = cardEl._still; });
  }
  P.hoverAnimate = hoverAnimate;

  // ---------- Effect Studio ----------
  P.studio = (opts = {}) => {
    const src = opts.preset || null;
    const fromClip = opts.fromClip || null;
    const work = {
      id: src && P.user.some((p) => p.id === src.id) ? src.id : null,
      name: src ? src.name : fromClip ? (fromClip.name || 'My effect') + ' look' : 'My effect',
      effects: src ? P.instantiate(src).effects : fromClip ? (fromClip.effects || []).map((e) => Object.assign(C.deep(e), { id: C.uid('e_') })) : [],
    };
    let sel = work.effects[0] ? work.effects[0].id : null, playing = true, bgMode = C.allClips().length ? 'frame' : 'sample', libQ = '';
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.icon('wand').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px;color:var(--accent)"')}Effect Studio</h2>
        <input class="text-input" id="stName" style="max-width:280px;margin-left:auto;margin-right:10px" placeholder="Preset name"><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="studio">
        <div class="st-lib"><input class="text-input" id="stQ" placeholder="Search effects…"><div id="stLib"></div></div>
        <div class="st-center">
          <div class="st-preview"><canvas id="stCv" width="960" height="540"></canvas></div>
          <div class="st-bar"><button class="icon-btn" id="stPlay" data-tip="Play / pause preview"></button><div class="seg" id="stBg"><button data-v="frame">Current frame</button><button data-v="sample">Sample image</button></div><span class="muted" style="margin-left:auto;font-size:12px" id="stCount"></span></div>
          <div class="st-stack" id="stStack"></div>
        </div>
        <div class="st-params" id="stParams"></div>
      </div>
      <div class="modal-foot"><button class="btn" id="stImport">${C.icon('import')}<span>Import…</span></button><button class="btn" id="stExport">${C.icon('export')}<span>Export…</span></button><span style="flex:1"></span>
        <button class="btn" id="stApply">${C.icon('sparkles')}<span>Apply to selection</span></button><button class="btn primary" id="stSave">${C.icon('save')}<span>Save preset</span></button></div>`, { cls: 'studio-modal' });
    const nameEl = el.querySelector('#stName'); nameEl.value = work.name;
    nameEl.addEventListener('input', () => { work.name = nameEl.value; }); nameEl.addEventListener('keydown', (e) => e.stopPropagation());
    const cv = el.querySelector('#stCv'); const cx = cv.getContext('2d');
    const s = C.project.settings; cv.width = 960; cv.height = Math.round((960 * s.height) / s.width); if (cv.height > 720) { cv.height = 720; cv.width = Math.round((720 * s.width) / s.height); }
    const frame = document.createElement('canvas'); frame.width = cv.width; frame.height = cv.height;
    frame.getContext('2d').drawImage(C.engine.canvas, 0, 0, cv.width, cv.height);
    const t0 = performance.now(); let still = 1.0;
    const draw = () => {
      if (!document.body.contains(cv)) return;
      const t = playing ? ((performance.now() - t0) / 1000) % 6 : still;
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.filter = 'none'; cx.globalCompositeOperation = 'source-over';
      cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
      const W = cv.width, H = cv.height, env = { W, H, t, T: t, dur: 6, seed: 11 };
      const base = bgMode === 'frame' ? frame : C.fx.sampleImage();
      const pre = { dx: 0, dy: 0, scale: 1, rot: 0 }; C.fx.applyPre(pre, work.effects, env);
      const shape = C.fx.shape(work.effects);
      const sc = shape ? 0.8 : 1;
      const bw = base.width || base.naturalWidth, bh = base.height || base.naturalHeight, k = Math.max(W / bw, H / bh) * sc;
      cx.save(); cx.translate(W / 2 + pre.dx * W, H / 2 + pre.dy * H); cx.rotate((pre.rot * Math.PI) / 180); cx.scale(pre.scale, pre.scale);
      cx.filter = C.fx.compositeFilter(work.effects, W);
      if (shape) { cx.beginPath(); cx.roundRect((-bw * k) / 2, (-bh * k) / 2, bw * k, bh * k, (Math.min(bw, bh) * k * shape.radius) / 100); cx.clip(); }
      cx.drawImage(base, (-bw * k) / 2, (-bh * k) / 2, bw * k, bh * k);
      cx.restore();
      if (shape && shape.border) { cx.save(); cx.translate(W / 2 + pre.dx * W, H / 2 + pre.dy * H); cx.scale(pre.scale, pre.scale); cx.strokeStyle = shape.color; cx.lineWidth = (shape.border * W) / 1920; cx.beginPath(); cx.roundRect((-bw * k) / 2, (-bh * k) / 2, bw * k, bh * k, (Math.min(bw, bh) * k * shape.radius) / 100); cx.stroke(); cx.restore(); }
      C.fx.applyToCanvas(cx, work.effects, env);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    const playBtn = el.querySelector('#stPlay');
    const syncPlay = () => { playBtn.innerHTML = C.icon(playing ? 'pause' : 'play'); };
    syncPlay(); playBtn.onclick = () => { if (playing) still = ((performance.now() - t0) / 1000) % 6; playing = !playing; syncPlay(); };
    const bgSeg = el.querySelector('#stBg');
    const syncBg = () => bgSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === bgMode));
    bgSeg.querySelectorAll('button').forEach((b) => (b.onclick = () => { bgMode = b.dataset.v; syncBg(); })); syncBg();

    const lib = el.querySelector('#stLib');
    const renderLib = () => {
      lib.innerHTML = '';
      const ql = libQ.toLowerCase();
      for (const cat of C.fx.CATS) {
        const defs = C.fx.DEFS.filter((d) => d.cat === cat && (!ql || d.name.toLowerCase().includes(ql)));
        if (!defs.length) continue;
        lib.appendChild(C.h(`<div class="st-cat">${cat}</div>`));
        for (const d of defs) {
          const b = C.h(`<button class="st-item"><span>${d.icon}</span>${C.esc(d.name)}<span class="st-plus">${C.icon('plus')}</span></button>`);
          b.onclick = () => { const e = C.fx.newEffect(d.id); work.effects.push(e); sel = e.id; renderStack(); renderParams(); };
          lib.appendChild(b);
        }
      }
    };
    const q = el.querySelector('#stQ'); q.addEventListener('input', () => { libQ = q.value; renderLib(); }); q.addEventListener('keydown', (e) => e.stopPropagation());

    const stack = el.querySelector('#stStack');
    const renderStack = () => {
      el.querySelector('#stCount').textContent = `${work.effects.length} effect${work.effects.length === 1 ? '' : 's'} in this preset`;
      stack.innerHTML = work.effects.length ? '' : '<div class="hint" style="padding:10px">Add effects from the list on the left. They stack from top to bottom — reorder them to change the look.</div>';
      work.effects.forEach((e, i) => {
        const d = C.fx.def(e.type);
        const row = C.h(`<div class="st-row ${e.id === sel ? 'on' : ''} ${e.on === false ? 'off' : ''}"><label class="switch"><input type="checkbox" ${e.on !== false ? 'checked' : ''}><span></span></label><span>${d.icon}</span><b>${C.esc(d.name)}</b><span style="flex:1"></span>
          <button class="icon-btn" data-a="up" ${i === 0 ? 'disabled' : ''}>${C.icon('chevronDown').replace('<svg', '<svg style="transform:rotate(180deg)"')}</button><button class="icon-btn" data-a="down" ${i === work.effects.length - 1 ? 'disabled' : ''}>${C.icon('chevronDown')}</button><button class="icon-btn" data-a="dup" data-tip="Duplicate">${C.icon('copy')}</button><button class="icon-btn" data-a="del">${C.icon('x')}</button></div>`);
        row.onclick = (ev) => { if (ev.target.closest('button, input, label')) return; sel = e.id; renderStack(); renderParams(); };
        row.querySelector('input').onchange = (ev) => { e.on = ev.target.checked; renderStack(); };
        const mv = (dir) => { const j = work.effects.indexOf(e); work.effects.splice(j, 1); work.effects.splice(j + dir, 0, e); renderStack(); };
        row.querySelector('[data-a=up]').onclick = () => mv(-1);
        row.querySelector('[data-a=down]').onclick = () => mv(1);
        row.querySelector('[data-a=dup]').onclick = () => { const c2 = Object.assign(C.deep(e), { id: C.uid('e_') }); work.effects.splice(work.effects.indexOf(e) + 1, 0, c2); sel = c2.id; renderStack(); renderParams(); };
        row.querySelector('[data-a=del]').onclick = () => { work.effects.splice(work.effects.indexOf(e), 1); if (sel === e.id) sel = work.effects[0] && work.effects[0].id; renderStack(); renderParams(); };
        stack.appendChild(row);
      });
    };
    const params = el.querySelector('#stParams');
    const renderParams = () => {
      params.innerHTML = '';
      const e = work.effects.find((x) => x.id === sel);
      if (!e) { params.innerHTML = '<div class="hint" style="padding:12px">Select an effect in the stack to customize it.</div>'; return; }
      const d = C.fx.def(e.type);
      params.appendChild(C.h(`<div class="section-title" style="padding:2px 0 8px"><span>${d.icon} ${C.esc(d.name)}</span><button class="reset-btn" id="stReset">Reset</button></div>`));
      params.querySelector('#stReset').onclick = () => { e.p = C.fx.newEffect(e.type).p; renderParams(); };
      const regionKeys = ['rx', 'ry', 'rw', 'rh', 'invert'];
      for (const prm of d.params) {
        if (d.region && regionKeys.includes(prm.key) && (!e.p.area || e.p.area === 'full')) continue;
        let row;
        if (prm.type === 'range') {
          row = C.h(`<div class="row"><label>${C.esc(prm.label)}</label><input type="range" min="${prm.min}" max="${prm.max}" step="${prm.step}"><input class="num" type="text"></div>`);
          const r = row.querySelector('input[type=range]'), n = row.querySelector('.num');
          const fmt = (v) => (prm.step < 0.01 ? (+v).toFixed(3) : prm.step < 1 ? (+v).toFixed(1) : Math.round(v)) + (prm.unit || '');
          r.value = e.p[prm.key]; n.value = fmt(e.p[prm.key]); C.setRangeFill(r);
          r.oninput = () => { e.p[prm.key] = +r.value; n.value = fmt(r.value); };
          n.onchange = () => { const v = parseFloat(n.value); if (!isNaN(v)) { e.p[prm.key] = v; r.value = v; C.setRangeFill(r); } n.value = fmt(e.p[prm.key]); };
          n.onkeydown = (ev) => ev.stopPropagation();
        } else if (prm.type === 'color') {
          row = C.h(`<div class="row two"><label>${C.esc(prm.label)}</label><input type="color" class="color-input" value="${e.p[prm.key]}"></div>`);
          row.querySelector('input').oninput = (ev) => { e.p[prm.key] = ev.target.value; };
        } else if (prm.type === 'select') {
          row = C.h(`<div class="row two"><label>${C.esc(prm.label)}</label><select class="select compact">${prm.options.map(([v, l]) => `<option value="${v}">${C.esc(l)}</option>`).join('')}</select></div>`);
          const sl = row.querySelector('select'); sl.value = e.p[prm.key];
          sl.onchange = () => { e.p[prm.key] = sl.value; if (prm.key === 'area') renderParams(); };
        } else if (prm.type === 'bool') {
          row = C.h(`<div class="row two"><label>${C.esc(prm.label)}</label><div style="display:flex;justify-content:flex-end"><label class="switch"><input type="checkbox" ${e.p[prm.key] ? 'checked' : ''}><span></span></label></div></div>`);
          row.querySelector('input').onchange = (ev) => { e.p[prm.key] = ev.target.checked; };
        } else {
          row = C.h(`<div class="row two"><label>${C.esc(prm.label)}</label><input class="text-input"></div>`);
          const i = row.querySelector('input'); i.value = e.p[prm.key] || ''; i.oninput = () => { e.p[prm.key] = i.value; }; i.onkeydown = (ev) => ev.stopPropagation();
        }
        params.appendChild(row);
      }
      params.appendChild(C.h('<p class="hint" style="margin-top:12px">Tip: after applying, every slider can be keyframed on the timeline with the ◆ button to animate the effect.</p>'));
    };
    const toPreset = () => P.fromEffects(work.name || 'My effect', work.effects, {});
    el.querySelector('#stSave').onclick = () => {
      if (!work.effects.length) { C.toast('Add at least one effect first', 'info'); return; }
      const pr = toPreset();
      if (work.id) { pr.id = work.id; const i = P.user.findIndex((p) => p.id === work.id); if (i >= 0) P.user[i] = pr; else P.user.unshift(pr); }
      else { P.user.unshift(pr); work.id = pr.id; }
      persist(); C.emit('presets'); C.toast(`Preset “${pr.name}” saved — find it under Effects → My presets`);
    };
    el.querySelector('#stApply').onclick = () => {
      if (!work.effects.length) { C.toast('Add at least one effect first', 'info'); return; }
      const pr = toPreset();
      const clips = C.selectedClips().filter((c) => c.kind !== 'audio');
      close();
      if (clips.length) { C.act('Apply effects', () => P.applyTo(pr, clips)); C.emit('inspectTab', 'effects'); C.toast('Effects applied'); }
      else { let c; C.act('Add effect clip', () => { const inst = P.instantiate(pr); c = C.ops.addEffectClip(inst.effects, C.UI.playhead, null, pr.name); }); C.select([c.id]); C.toast('Added as an effect clip at the playhead'); }
    };
    el.querySelector('#stExport').onclick = () => { if (!work.effects.length) return C.toast('Add at least one effect first', 'info'); P.exportPresets([toPreset()], work.name); };
    el.querySelector('#stImport').onclick = async () => {
      const added = await P.importPresets();
      if (added.length) { const inst = P.instantiate(added[0]); work.effects = inst.effects; work.name = added[0].name; work.id = added[0].id; nameEl.value = work.name; sel = work.effects[0] && work.effects[0].id; renderStack(); renderParams(); }
    };
    renderLib(); renderStack(); renderParams();
  };
})(window.C);
