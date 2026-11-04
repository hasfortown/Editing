/* Cutroom Photo — panels, menus, dialogs, files, mode switching */
(function (C) {
  const P = C.photo, PU = C.photoUI, N = window.native;
  C.mode = 'video';

  // ---------- mode switching ----------
  C.setMode = (m) => {
    if (C.mode === m) return;
    C.mode = m;
    document.body.classList.toggle('mode-photo', m === 'photo');
    C.$$('#modeSwitch button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    const menuBar = C.$('.menus');
    menuBar.innerHTML = (m === 'photo' ? [['file', 'File'], ['edit', 'Edit'], ['image', 'Image'], ['layer', 'Layer'], ['select', 'Select'], ['filter', 'Filter'], ['help', 'Help']] : [['file', 'File'], ['edit', 'Edit'], ['clip', 'Clip'], ['help', 'Help']]).map(([k, l]) => `<button class="menu-btn" data-menu="${k}">${l}</button>`).join('');
    C.app.wireMenus();
    if (m === 'photo') {
      C.engine.pause();
      if (!PU.ready) { PU.init(); PP.init(); }
      setTimeout(() => { if (P.doc) PU.fit(); PU.redraw(); PP.renderAll(); }, 30);
    } else { C.engine.layout(); C.tl.render(); }
    C.closeMenu();
  };

  const PP = (C.photoPanels = {});
  PP.init = () => {
    C.on('photo:change', C.throttle((info) => { renderLayers(); renderProps(info); renderHistory(); PU.updateStatus(); }, 60));
    C.on('photo:focusText', () => { PP.tab = 'props'; renderProps({ structural: true }); setTimeout(() => { const t = C.$('#phProps textarea'); if (t) { t.focus(); t.select(); } }, 40); });
    C.$$('#phSideTabs button').forEach((b) => (b.onclick = () => { PP.tab = b.dataset.t; renderProps({ structural: true }); }));
    C.$('#phEmpty').innerHTML = `<div class="ph-empty-card"><div class="ph-empty-ico">${C.icon('photo')}</div><h2>Photo editor</h2><p class="hint">Layers, masks, brushes, selections, layer styles, adjustments and filters.</p>
      <div class="ph-empty-acts"><button class="btn primary" data-a="new">${C.icon('plus')}<span>New image…</span></button><button class="btn" data-a="open">${C.icon('folder')}<span>Open image…</span></button><button class="btn" data-a="proj">${C.icon('layers')}<span>Open .cutphoto…</span></button><button class="btn" data-a="frame">${C.icon('film')}<span>Edit current video frame</span></button></div><p class="hint">Or drop an image anywhere here.</p></div>`;
    C.$('#phEmpty [data-a=new]').onclick = () => PP.newDialog();
    C.$('#phEmpty [data-a=open]').onclick = () => PP.openImage();
    C.$('#phEmpty [data-a=proj]').onclick = () => PP.openProject();
    C.$('#phEmpty [data-a=frame]').onclick = () => PP.editVideoFrame();
    PP.renderAll();
  };
  PP.renderAll = () => { renderLayers(); renderProps({ structural: true }); renderHistory(); PU.updateStatus(); };

  // ---------- layers panel ----------
  const thumbs = new Map();
  function thumbFor(L) {
    const key = L.id + ':' + (L.canvas ? L.canvas._id : '') + ':' + JSON.stringify([L.x, L.y, L.rot, L.sx, L.sy, L.text, L.shape, L.fill, L.type]);
    const hit = thumbs.get(L.id); if (hit && hit.key === key) return hit.url;
    const tw = 52, th = Math.max(20, Math.round((52 * P.doc.h) / P.doc.w));
    const c = document.createElement('canvas'); c.width = tw; c.height = th; const x = c.getContext('2d');
    if (L.type === 'adjust') { x.fillStyle = '#2a2c37'; x.fillRect(0, 0, tw, th); x.fillStyle = '#fff'; x.font = '18px Segoe UI Emoji'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('◐', tw / 2, th / 2); }
    else { x.scale(tw / P.doc.w, th / P.doc.h); P.drawLayerContent(x, L); }
    const url = c.toDataURL(); thumbs.set(L.id, { key, url }); return url;
  }
  function renderLayers() {
    const box = C.$('#phLayers'); if (!box) return;
    if (!P.doc) { box.innerHTML = '<div class="hint" style="padding:12px">No image open</div>'; return; }
    const L = P.active();
    box.innerHTML = `<div class="ph-lhead"><select class="select compact" id="phBlend">${C.BLENDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><div class="ph-op"><span>Opacity</span><input type="range" min="0" max="100" id="phOpacity"><span id="phOpV"></span></div></div>
      <div class="ph-llist" id="phLList"></div>
      <div class="ph-lfoot">
        <button class="icon-btn" data-a="styles" data-tip="Layer styles (fx)">${C.icon('fx')}</button>
        <button class="icon-btn" data-a="mask" data-tip="Add layer mask (from selection if any)">${C.icon('mask')}</button>
        <button class="icon-btn" data-a="adjust" data-tip="New adjustment layer">${C.icon('adjust')}</button>
        <button class="icon-btn" data-a="new" data-tip="New layer (Ctrl+Shift+N)">${C.icon('plus')}</button>
        <button class="icon-btn" data-a="dup" data-tip="Duplicate (Ctrl+J)">${C.icon('copy')}</button>
        <button class="icon-btn" data-a="merge" data-tip="Merge down (Ctrl+E)">${C.icon('merge')}</button>
        <button class="icon-btn" data-a="del" data-tip="Delete layer">${C.icon('trash')}</button></div>`;
    const bl = box.querySelector('#phBlend'), op = box.querySelector('#phOpacity'), opv = box.querySelector('#phOpV');
    if (L) { bl.value = L.blend; op.value = Math.round(L.opacity * 100); opv.textContent = op.value + '%'; C.setRangeFill(op); }
    bl.onchange = () => P.act('Blend mode', () => { P.active().blend = bl.value; });
    op.oninput = () => { P.begin('Opacity'); P.active().opacity = op.value / 100; opv.textContent = op.value + '%'; P.changed(); };
    op.onchange = () => P.commit('Opacity');
    const list = box.querySelector('#phLList');
    for (let i = P.doc.layers.length - 1; i >= 0; i--) {
      const l = P.doc.layers[i];
      const row = C.h(`<div class="ph-lrow ${l.id === P.doc.active ? 'on' : ''} ${l.visible ? '' : 'hidden'}" data-id="${l.id}">
        <button class="ph-eye" data-tip="Show / hide">${C.icon(l.visible ? 'eye' : 'eyeOff')}</button>
        <img class="ph-thumb ${P.ui.editMask === l.id ? '' : 'sel'}" src="${thumbFor(l)}">
        ${l.mask ? `<span class="ph-mthumb ${P.ui.editMask === l.id ? 'sel' : ''} ${l.maskOn ? '' : 'off'}" data-tip="Click: paint on mask · Shift+click: disable mask"></span>` : ''}
        <span class="ph-lname">${C.esc(l.name)}</span>
        ${P.hasStyles(l) ? `<span class="ph-fxb" data-tip="Layer styles">fx</span>` : ''}
        ${l.type === 'text' ? '<span class="ph-tb">T</span>' : ''}
        <button class="ph-lock ${l.locked ? 'on' : ''}" data-tip="Lock">${C.icon(l.locked ? 'lock' : 'unlock')}</button></div>`);
      const mt = row.querySelector('.ph-mthumb');
      if (mt) { const mc = document.createElement('canvas'); mc.width = 36; mc.height = 27; const mx = mc.getContext('2d'); mx.fillStyle = '#000'; mx.fillRect(0, 0, 36, 27); mx.drawImage(l.mask, 0, 0, 36, 27); mt.style.backgroundImage = `url(${mc.toDataURL()})`; }
      row.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.ph-eye')) { P.act('Toggle visibility', () => { l.visible = !l.visible; }); return; }
        if (e.target.closest('.ph-lock')) { P.act('Lock layer', () => { l.locked = !l.locked; }); return; }
        if (e.target.closest('.ph-fxb')) { P.doc.active = l.id; PP.stylesDialog(); return; }
        if (e.target.closest('.ph-mthumb')) { P.doc.active = l.id; if (e.shiftKey) P.act('Toggle mask', () => { l.maskOn = !l.maskOn; }); else { P.ui.editMask = P.ui.editMask === l.id ? null : l.id; C.toast(P.ui.editMask ? 'Painting on the mask — black hides, white reveals' : 'Painting on the layer', 'info', 2000); P.changed(true); } return; }
        if (P.doc.active !== l.id) { P.doc.active = l.id; if (P.ui.editMask && P.ui.editMask !== l.id) P.ui.editMask = null; P.changed(true); }
        // drag to reorder
        const y0 = e.clientY; let moved = false, target = null; const rows = C.$$('.ph-lrow', list);
        const mv = (m) => { if (!moved && Math.abs(m.clientY - y0) < 5) return; moved = true; rows.forEach((r) => r.classList.remove('drop-a', 'drop-b')); for (const r of rows) { const b = r.getBoundingClientRect(); if (m.clientY >= b.top && m.clientY < b.bottom) { target = { r, above: m.clientY < b.top + b.height / 2 }; r.classList.add(target.above ? 'drop-a' : 'drop-b'); } } };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); rows.forEach((r) => r.classList.remove('drop-a', 'drop-b')); if (!moved || !target || target.r.dataset.id === l.id) return; P.act('Reorder layers', () => { const arr = P.doc.layers; arr.splice(arr.indexOf(l), 1); const j = arr.findIndex((x) => x.id === target.r.dataset.id); arr.splice(target.above ? j + 1 : j, 0, l); }); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      row.addEventListener('dblclick', async (e) => { if (e.target.closest('.ph-lname')) { const v = await C.prompt('Rename layer', 'Name', l.name); if (v) P.act('Rename layer', () => { l.name = v; }); } else if (l.type === 'adjust' || l.type === 'text' || l.type === 'shape') { PP.tab = 'props'; renderProps({ structural: true }); } else PP.stylesDialog(); });
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); P.doc.active = l.id; P.changed(true); C.menu(e.clientX, e.clientY, PP.menus.layer()); });
      list.appendChild(row);
    }
    box.querySelectorAll('.ph-lfoot [data-a]').forEach((b) => (b.onclick = (e) => {
      const a = b.dataset.a;
      if (a === 'styles') PP.stylesDialog();
      if (a === 'mask') PP.addMask();
      if (a === 'adjust') { const r = b.getBoundingClientRect(); C.menu(r.left, r.top - 8 - 36 * 9, Object.entries(P.ADJUST).map(([k, v]) => ({ label: v.name, icon: 'adjust', action: () => { P.act('New adjustment layer', () => P.addAdjust(k)); PP.tab = 'props'; } }))); }
      if (a === 'new') P.act('New layer', () => P.newRaster());
      if (a === 'dup') P.act('Duplicate layer', () => P.duplicate(P.active()));
      if (a === 'merge') PP.mergeDown();
      if (a === 'del') P.act('Delete layer', () => P.remove(P.active()));
    }));
  }

  // ---------- properties ----------
  PP.tab = 'props';
  function renderProps(info) {
    const box = C.$('#phProps'); if (!box) return;
    C.$$('#phSideTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === PP.tab));
    if (PP.tab === 'history') { box.innerHTML = ''; box.appendChild(historyEl()); return; }
    if (info && !info.structural && box.contains(document.activeElement)) return;
    box.innerHTML = '';
    const L = P.active();
    if (!P.doc || !L) { box.innerHTML = '<div class="hint" style="padding:12px">Open or create an image to start.</div>'; return; }
    const sec = (title) => { const s = C.h(`<div class="section"><div class="section-title"><span>${C.esc(title)}</span></div></div>`); box.appendChild(s); return s; };
    const live = (label, fn) => { P.begin(label); fn(); P.changed(); };
    const done = (label) => P.commit(label);
    const slider = (parent, label, get, set, min, max, step = 1, unit = '') => {
      const row = C.h(`<div class="row"><label>${C.esc(label)}</label><input type="range" min="${min}" max="${max}" step="${step}"><input class="num" type="text"></div>`);
      const r = row.querySelector('input[type=range]'), n = row.querySelector('.num'); const fmt = (v) => (step < 1 ? (+v).toFixed(2) : Math.round(v)) + unit;
      r.value = get(); n.value = fmt(get()); C.setRangeFill(r);
      r.oninput = () => { live(label, () => set(+r.value)); n.value = fmt(r.value); };
      r.onchange = () => done(label);
      n.onchange = () => { const v = parseFloat(n.value); if (!isNaN(v)) { live(label, () => set(v)); done(label); r.value = v; C.setRangeFill(r); } n.value = fmt(get()); };
      n.onkeydown = (e) => e.stopPropagation();
      parent.appendChild(row);
    };
    const color = (parent, label, get, set) => { const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><input type="color" class="color-input" value="${get()}"></div>`); const i = row.querySelector('input'); i.oninput = () => live(label, () => set(i.value)); i.onchange = () => done(label); parent.appendChild(row); };
    const select = (parent, label, opts, get, set) => { const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><select class="select compact">${opts.map(([v, l]) => `<option value="${v}" ${String(get()) === String(v) ? 'selected' : ''}>${C.esc(l)}</option>`).join('')}</select></div>`); row.querySelector('select').onchange = (e) => { P.act(label, () => set(e.target.value)); renderProps({ structural: true }); }; parent.appendChild(row); };
    const check = (parent, label, get, set) => { const row = C.h(`<div class="row two"><label>${C.esc(label)}</label><div style="display:flex;justify-content:flex-end"><label class="switch"><input type="checkbox" ${get() ? 'checked' : ''}><span></span></label></div></div>`); row.querySelector('input').onchange = (e) => P.act(label, () => set(e.target.checked)); parent.appendChild(row); };
    const btns = (parent, list) => { const r = C.h('<div class="ph-btnrow"></div>'); list.forEach(([l, ic, fn]) => { const b = C.h(`<button class="btn">${C.icon(ic)}<span>${l}</span></button>`); b.onclick = fn; r.appendChild(b); }); parent.appendChild(r); };

    box.appendChild(C.h(`<div class="ph-ptitle">${C.icon({ raster: 'photo', text: 'text', shape: 'shapes', adjust: 'adjust', fill: 'droplet' }[L.type])}<b>${C.esc(L.name)}</b><small>${{ raster: 'Pixel layer', text: 'Text layer', shape: 'Shape layer', adjust: 'Adjustment layer', fill: 'Fill layer' }[L.type]}</small></div>`));
    if (L.type === 'text') {
      const s = sec('Text');
      const ta = C.h('<textarea class="textarea" spellcheck="false"></textarea>'); ta.value = L.text.content;
      ta.oninput = () => { live('Edit text', () => { L.text.content = ta.value; L.name = ta.value.split('\n')[0].slice(0, 24) || 'Text'; }); };
      ta.onchange = () => done('Edit text'); ta.onkeydown = (e) => e.stopPropagation(); s.appendChild(ta);
      const emo = C.h(`<button class="btn" style="margin-top:8px">${C.icon('smile')}<span>Insert emoji</span></button>`);
      emo.onclick = () => C.emoji.picker(emo, (em) => { P.act('Insert emoji', () => { L.text.content += em; }); renderProps({ structural: true }); }); s.appendChild(emo);
      select(s, 'Font', C.FONTS.map((f) => [f, f]), () => L.text.font, (v) => { L.text.font = v; });
      slider(s, 'Size', () => L.text.size, (v) => { L.text.size = Math.max(4, v); }, 4, 800, 1, 'px');
      color(s, 'Color', () => L.text.color, (v) => { L.text.color = v; });
      check(s, 'Bold', () => L.text.bold, (v) => { L.text.bold = v; });
      check(s, 'Italic', () => L.text.italic, (v) => { L.text.italic = v; });
      select(s, 'Align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], () => L.text.align, (v) => { L.text.align = v; });
      slider(s, 'Spacing', () => L.text.letterSpacing, (v) => { L.text.letterSpacing = v; }, -20, 200, 1, 'px');
      slider(s, 'Line height', () => L.text.lineHeight, (v) => { L.text.lineHeight = v; }, 0.6, 3, 0.05);
      s.appendChild(C.h('<p class="hint">Add outlines, shadows, glows and gradients with Layer styles (fx).</p>'));
    }
    if (L.type === 'shape') {
      const s = sec('Shape'), sh = L.shape;
      select(s, 'Type', [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['star', 'Star'], ['polygon', 'Polygon'], ['heart', 'Heart'], ['arrow', 'Arrow'], ['line', 'Line']], () => sh.kind, (v) => { sh.kind = v; });
      slider(s, 'Width', () => sh.w, (v) => { sh.w = v; }, 1, P.doc.w * 2, 1, 'px');
      slider(s, 'Height', () => sh.h, (v) => { sh.h = v; }, 1, P.doc.h * 2, 1, 'px');
      check(s, 'Fill', () => sh.fillOn, (v) => { sh.fillOn = v; });
      color(s, 'Fill color', () => sh.fill, (v) => { sh.fill = v; });
      slider(s, 'Stroke', () => sh.strokeW, (v) => { sh.strokeW = Math.max(0, v); }, 0, 100, 1, 'px');
      color(s, 'Stroke color', () => sh.stroke, (v) => { sh.stroke = v; });
      if (sh.kind === 'rounded') slider(s, 'Corners', () => sh.radius, (v) => { sh.radius = v; }, 0, 100, 1, '%');
      if (sh.kind === 'star' || sh.kind === 'polygon') slider(s, 'Points', () => sh.points, (v) => { sh.points = Math.round(v); }, 3, 24, 1);
      if (sh.kind === 'star') slider(s, 'Inner radius', () => sh.inner, (v) => { sh.inner = v; }, 0.1, 0.95, 0.01);
    }
    if (L.type === 'fill') {
      const s = sec('Fill'), f = L.fill;
      select(s, 'Type', [['solid', 'Solid color'], ['gradient', 'Gradient']], () => f.mode, (v) => { f.mode = v; });
      if (f.mode === 'solid') color(s, 'Color', () => f.color, (v) => { f.color = v; });
      else { color(s, 'From', () => f.c1, (v) => { f.c1 = v; }); color(s, 'To', () => f.c2, (v) => { f.c2 = v; }); slider(s, 'Angle', () => f.angle, (v) => { f.angle = v; }, 0, 360, 1, '°'); }
    }
    if (L.type === 'adjust') PP.adjustControls(sec(P.ADJUST[L.adjust.kind].name), L.adjust, live, done);
    if (L.type !== 'adjust' && L.type !== 'fill') {
      const s = sec('Transform');
      const c0 = P.center(L);
      slider(s, 'X', () => Math.round(P.center(L).x), (v) => { const c = P.center(L); L.x += v - c.x; }, -P.doc.w, P.doc.w * 2, 1, 'px');
      slider(s, 'Y', () => Math.round(P.center(L).y), (v) => { const c = P.center(L); L.y += v - c.y; }, -P.doc.h, P.doc.h * 2, 1, 'px');
      slider(s, 'Scale', () => Math.round(Math.abs(L.sx) * 100), (v) => { const k = v / 100 / Math.abs(L.sx); L.sx *= k; L.sy *= k; }, 1, 400, 1, '%');
      slider(s, 'Rotation', () => L.rot, (v) => { L.rot = v; }, -180, 180, 0.5, '°');
      void c0;
      btns(s, [['Flip H', 'flipH', () => P.act('Flip horizontal', () => { L.sx = -L.sx; })], ['Flip V', 'flipV', () => P.act('Flip vertical', () => { L.sy = -L.sy; })], ['Reset', 'refresh', () => P.act('Reset transform', () => { if (L.type === 'raster') { const c = P.center(L); L.rot = 0; L.sx = L.sy = 1; L.x = c.x - L.canvas.width / 2; L.y = c.y - L.canvas.height / 2; } else { L.rot = 0; L.sx = L.sy = 1; } })]]);
      if (L.type === 'raster' && !P.isIdentity(L)) btns(s, [['Apply transform', 'check', () => P.act('Apply transform', () => P.prepPaint(L, false))]]);
      if (L.type !== 'raster') btns(s, [['Convert to pixels', 'photo', () => P.act('Rasterize', () => P.rasterize(L))]]);
    }
    const st = sec('Layer');
    btns(st, [['Layer styles…', 'fx', () => PP.stylesDialog()], [L.mask ? 'Delete mask' : 'Add mask', 'mask', () => (L.mask ? P.act('Delete mask', () => { L.mask = null; P.ui.editMask = null; }) : PP.addMask())]]);
    if (L.mask) btns(st, [[P.ui.editMask === L.id ? 'Stop editing mask' : 'Paint on mask', 'brush', () => { P.ui.editMask = P.ui.editMask === L.id ? null : L.id; P.changed(true); }], ['Invert mask', 'refresh', () => P.act('Invert mask', () => { const m = P.mk(P.doc.w, P.doc.h); const x = m.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, m.width, m.height); x.globalCompositeOperation = 'destination-out'; x.drawImage(L.mask, 0, 0); L.mask = m; })]]);
  }

  // shared adjustment controls (properties panel & Image > Adjustments dialog)
  PP.adjustControls = (s, a, live, done) => {
    const p = a.p;
    const sl = (label, key, min, max, step = 1) => {
      const row = C.h(`<div class="row"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${p[key]}"><input class="num" value="${p[key]}"></div>`);
      const r = row.querySelector('input[type=range]'), n = row.querySelector('.num'); C.setRangeFill(r);
      r.oninput = () => { live('Adjust', () => { p[key] = +r.value; }); n.value = r.value; }; r.onchange = () => done('Adjust');
      n.onchange = () => { const v = parseFloat(n.value); if (!isNaN(v)) { live('Adjust', () => { p[key] = v; }); done('Adjust'); r.value = v; C.setRangeFill(r); } }; n.onkeydown = (e) => e.stopPropagation();
      s.appendChild(row);
    };
    const col = (label, key) => { const row = C.h(`<div class="row two"><label>${label}</label><input type="color" class="color-input" value="${p[key]}"></div>`); const i = row.querySelector('input'); i.oninput = () => live('Adjust', () => { p[key] = i.value; }); i.onchange = () => done('Adjust'); s.appendChild(row); };
    switch (a.kind) {
      case 'brightness': sl('Brightness', 'brightness', -150, 150); sl('Contrast', 'contrast', -100, 100); break;
      case 'levels': sl('Input black', 'inBlack', 0, 253); sl('Input white', 'inWhite', 2, 255); sl('Midtones (gamma)', 'gamma', 0.1, 3, 0.01); sl('Output black', 'outBlack', 0, 255); sl('Output white', 'outWhite', 0, 255); break;
      case 'curves': C.colorUI.curves(s, () => p.curves, (v, isLive) => { if (isLive) live('Curves', () => { p.curves = v; }); else { P.begin('Curves'); p.curves = v; done('Curves'); } }); break;
      case 'exposure': sl('Exposure', 'exposure', -4, 4, 0.01); break;
      case 'hueSat': sl('Hue', 'hue', -180, 180); sl('Saturation', 'saturation', -100, 100); sl('Lightness', 'lightness', -100, 100); break;
      case 'vibrance': sl('Vibrance', 'vibrance', -100, 100); sl('Saturation', 'saturation', -100, 100); break;
      case 'colorBalance': { const w = C.h('<div class="wheels"></div>'); for (const [k, l] of [['lift', 'Shadows'], ['gamma', 'Midtones'], ['gain', 'Highlights']]) C.colorUI.wheel(w, l, () => p[k], (v, isLive) => { if (isLive) live('Color balance', () => { p[k] = v; }); else { P.begin('Color balance'); p[k] = v; done('Color balance'); } }); s.appendChild(w); break; }
      case 'whiteBalance': sl('Temperature', 'temp', -100, 100); sl('Tint', 'tint', -100, 100); break;
      case 'bw': sl('Amount', 'amount', 0, 100); sl('Contrast', 'contrast', -100, 100); break;
      case 'photoFilter': col('Filter color', 'color'); sl('Density', 'density', 0, 100); break;
      case 'posterize': sl('Levels', 'levels', 2, 16); break;
      case 'threshold': sl('Threshold level', 'level', 1, 254); break;
      case 'gradientMap': col('Shadows', 'c1'); col('Highlights', 'c2'); break;
      case 'look': { const row = C.h(`<div class="row two"><label>Look</label><select class="select compact">${C.grade.LOOKS.filter((l) => l.id !== 'none').map((l) => `<option value="${l.id}" ${p.look === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select></div>`); row.querySelector('select').onchange = (e) => { P.begin('Look'); p.look = e.target.value; done('Look'); }; s.appendChild(row); break; }
      case 'invert': s.appendChild(C.h('<p class="hint">Inverts all colors below this layer.</p>')); break;
    }
  };

  // ---------- history ----------
  function historyEl() {
    const el = C.h('<div class="ph-hist"></div>');
    const items = [{ label: 'Open', i: -1 }, ...P.undo.map((t, i) => ({ label: t.label, i })), ...P.redo.slice().reverse().map((t, j) => ({ label: t.label, i: P.undo.length + j, future: true }))];
    for (const it of items) {
      const cur = it.i === P.undo.length - 1;
      const b = C.h(`<button class="ph-hitem ${cur ? 'on' : ''} ${it.future ? 'future' : ''}">${C.icon('refresh')}<span>${C.esc(it.label || 'Edit')}</span></button>`);
      b.onclick = () => { P.jump(it.i); renderProps({ structural: true }); };
      el.appendChild(b);
    }
    return el;
  }
  function renderHistory() { if (PP.tab === 'history') renderProps({ structural: true }); }

  // ---------- dialogs ----------
  PP.newDialog = () => {
    const presets = [['Custom', 1920, 1080], ['Full HD 1920×1080', 1920, 1080], ['4K 3840×2160', 3840, 2160], ['YouTube thumbnail 1280×720', 1280, 720], ['Instagram post 1080×1080', 1080, 1080], ['Instagram portrait 1080×1350', 1080, 1350], ['Story / TikTok 1080×1920', 1080, 1920], ['A4 print (300 dpi)', 2480, 3508], ['Wallpaper 2560×1440', 2560, 1440]];
    const { el, close } = C.modal(`<div class="modal-head"><h2>New image</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div><div class="modal-body">
      <div class="form-row"><label>Preset</label><select class="select" id="ndP">${presets.map(([n], i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="form-row"><label>Width</label><input class="text-input" id="ndW" value="1920"></div>
      <div class="form-row"><label>Height</label><input class="text-input" id="ndH" value="1080"></div>
      <div class="form-row"><label>Name</label><input class="text-input" id="ndN" value="Untitled"></div>
      <div class="form-row"><label>Background</label><div class="seg" id="ndB"><button data-v="#ffffff" class="on">White</button><button data-v="#000000">Black</button><button data-v="">Transparent</button></div></div>
      </div><div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ndGo">Create</button></div>`);
    let bg = '#ffffff';
    el.querySelectorAll('#ndB button').forEach((b) => (b.onclick = () => { bg = b.dataset.v; el.querySelectorAll('#ndB button').forEach((x) => x.classList.toggle('on', x === b)); }));
    el.querySelector('#ndP').onchange = (e) => { const p = presets[+e.target.value]; el.querySelector('#ndW').value = p[1]; el.querySelector('#ndH').value = p[2]; };
    el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    el.querySelector('#ndGo').onclick = async () => {
      const w = C.clamp(parseInt(el.querySelector('#ndW').value, 10) || 1920, 1, 12000), h = C.clamp(parseInt(el.querySelector('#ndH').value, 10) || 1080, 1, 12000);
      close(); if (!(await PP.confirmDiscard())) return;
      P.newDoc(w, h, bg, el.querySelector('#ndN').value || 'Untitled'); PU.fit(); PP.renderAll();
    };
  };
  PP.confirmDiscard = async () => !P.doc || !P.dirty || C.confirm('Discard unsaved changes?', 'The current image has unsaved changes.', 'Discard', true);

  PP.stylesDialog = () => {
    const L = P.active(); if (!L) return;
    if (L.type === 'adjust') { C.toast('Layer styles apply to pixel, text, shape and fill layers', 'info'); return; }
    const before = C.deep(L.styles || {});
    L.styles = L.styles || {};
    for (const k in P.STYLE_DEFAULTS) L.styles[k] = Object.assign({}, P.STYLE_DEFAULTS[k], L.styles[k] || {});
    let cur = Object.keys(P.STYLE_DEFAULTS).find((k) => L.styles[k].on) || 'dropShadow';
    let ok = false;
    const { el, close } = C.modal(`<div class="modal-head"><h2>Layer style · ${C.esc(L.name)}</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="ls-grid"><div class="ls-list" id="lsList"></div><div class="ls-params" id="lsParams"></div></div>
      <div class="modal-foot"><span class="hint" style="margin-right:auto">Changes preview live on the canvas.</span><button class="btn" data-close>Cancel</button><button class="btn primary" id="lsOk">OK</button></div>`, {
      cls: 'wide', onClose: () => { if (!ok) { L.styles = before; P.changed(); } },
    });
    const list = el.querySelector('#lsList'), params = el.querySelector('#lsParams');
    const renderList = () => {
      list.innerHTML = '';
      for (const k in P.STYLE_DEFAULTS) {
        const r = C.h(`<div class="ls-item ${k === cur ? 'on' : ''}"><input type="checkbox" ${L.styles[k].on ? 'checked' : ''}><span>${P.STYLE_NAMES[k]}</span></div>`);
        r.querySelector('input').onchange = (e) => { L.styles[k].on = e.target.checked; cur = k; P.changed(); renderList(); renderParams(); };
        r.onclick = (e) => { if (e.target.tagName === 'INPUT') return; cur = k; if (!L.styles[k].on) { L.styles[k].on = true; P.changed(); } renderList(); renderParams(); };
        list.appendChild(r);
      }
    };
    const renderParams = () => {
      params.innerHTML = `<h3 style="margin:0 0 10px;font-size:14px">${P.STYLE_NAMES[cur]}</h3>`;
      const s = L.styles[cur];
      const sl = (label, key, min, max) => { const row = C.h(`<div class="row"><label>${label}</label><input type="range" min="${min}" max="${max}" value="${s[key]}"><input class="num" value="${s[key]}"></div>`); const r = row.querySelector('input[type=range]'), n = row.querySelector('.num'); C.setRangeFill(r); r.oninput = () => { s[key] = +r.value; n.value = r.value; s.on = true; P.changed(); }; n.onchange = () => { const v = parseFloat(n.value); if (!isNaN(v)) { s[key] = v; r.value = v; C.setRangeFill(r); P.changed(); } }; n.onkeydown = (e) => e.stopPropagation(); params.appendChild(row); };
      const col = (label, key) => { const row = C.h(`<div class="row two"><label>${label}</label><input type="color" class="color-input" value="${s[key]}"></div>`); row.querySelector('input').oninput = (e) => { s[key] = e.target.value; s.on = true; P.changed(); }; params.appendChild(row); };
      const sel = (label, key, opts) => { const row = C.h(`<div class="row two"><label>${label}</label><select class="select compact">${opts.map(([v, l]) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`); row.querySelector('select').onchange = (e) => { s[key] = e.target.value; P.changed(); }; params.appendChild(row); };
      switch (cur) {
        case 'dropShadow': col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Angle', 'angle', -180, 180); sl('Distance', 'distance', 0, 300); sl('Size', 'size', 0, 250); sel('Blend', 'blend', C.BLENDS); break;
        case 'innerShadow': col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Angle', 'angle', -180, 180); sl('Distance', 'distance', 0, 200); sl('Size', 'size', 0, 200); break;
        case 'outerGlow': col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Size', 'size', 0, 250); sl('Spread', 'spread', 0, 100); sel('Blend', 'blend', C.BLENDS); break;
        case 'innerGlow': col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sl('Size', 'size', 0, 200); break;
        case 'bevel': sl('Size', 'size', 1, 100); sl('Depth', 'depth', 1, 400); sl('Light angle', 'angle', -180, 180); col('Highlight', 'highlight'); sl('Highlight opacity', 'hOpacity', 0, 100); col('Shadow', 'shadow'); sl('Shadow opacity', 'sOpacity', 0, 100); break;
        case 'stroke': sl('Size', 'size', 1, 100); sel('Position', 'position', [['outside', 'Outside'], ['inside', 'Inside'], ['center', 'Center']]); col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); break;
        case 'colorOverlay': col('Color', 'color'); sl('Opacity', 'opacity', 0, 100); sel('Blend', 'blend', C.BLENDS); break;
        case 'gradientOverlay': col('From', 'c1'); col('To', 'c2'); sel('Style', 'style', [['linear', 'Linear'], ['radial', 'Radial']]); sl('Angle', 'angle', -180, 180); sl('Opacity', 'opacity', 0, 100); sel('Blend', 'blend', C.BLENDS); break;
      }
    };
    el.querySelector('#lsOk').onclick = () => {
      ok = true; const after = C.deep(L.styles);
      for (const k in after) if (!after[k].on) delete after[k];
      L.styles = before; P.begin('Layer style'); L.styles = after; P.commit('Layer style'); close();
    };
    renderList(); renderParams(); P.changed();
  };

  PP.addMask = () => {
    const L = P.active(); if (!L) return;
    if (L.mask) { C.toast('This layer already has a mask', 'info'); return; }
    P.act('Add mask', () => {
      const m = P.mk(P.doc.w, P.doc.h); const x = m.getContext('2d'); x.fillStyle = '#fff';
      if (P.sel) x.drawImage(P.sel.mask, 0, 0); else x.fillRect(0, 0, m.width, m.height);
      L.mask = m; L.maskOn = true; P.ui.editMask = L.id;
    });
    C.toast('Mask added — paint black to hide, white to reveal', 'info', 2600);
  };
  PP.mergeDown = () => {
    const i = P.indexOf(P.doc.active); if (i <= 0) return C.toast('No layer below to merge into', 'info');
    const top = P.doc.layers[i], below = P.doc.layers[i - 1];
    if (top.type === 'adjust' || below.type === 'adjust') return C.toast('Merge pixel, text or shape layers', 'info');
    P.act('Merge down', () => {
      const c = P.mk(P.doc.w, P.doc.h);
      const tmpDoc = P.doc.layers; P.doc.layers = [Object.assign({}, below, { visible: true }), Object.assign({}, top, { visible: true })];
      P.composite({ into: c });
      P.doc.layers = tmpDoc;
      const merged = P.layer({ id: below.id, name: below.name, canvas: c });
      P.doc.layers.splice(i - 1, 2, merged); P.doc.active = merged.id;
    });
  };
  PP.flatten = () => P.act('Flatten image', () => { const c = P.flattened(); const L = P.layer({ name: 'Background', canvas: c }); P.doc.layers = [L]; P.doc.active = L.id; });

  // Destructive adjustment / filter with live preview on the active layer
  PP.adjustDialog = (kind) => {
    const L = P.active(); if (!L || L.type === 'adjust') return C.toast('Select a pixel layer', 'info');
    const a = { kind, p: C.deep(P.ADJUST[kind].p) };
    let ok = false;
    const { el, close } = C.modal(`<div class="modal-head"><h2>${P.ADJUST[kind].name}</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div><div class="modal-body" id="adBody"></div>
      <div class="modal-foot"><span class="hint" style="margin-right:auto">Tip: Layer → New adjustment layer keeps this editable.</span><button class="btn" data-close>Cancel</button><button class="btn primary" id="adOk">OK</button></div>`, { onClose: () => { if (!ok) { delete L._preview; P.changed(); } } });
    const body = el.querySelector('#adBody');
    PP.adjustControls(body, a, (label, fn) => { fn(); L._preview = a; P.changed(); }, () => {});
    L._preview = a; P.changed();
    el.querySelector('#adOk').onclick = () => {
      ok = true; delete L._preview;
      P.begin(P.ADJUST[kind].name);
      if (L.type !== 'raster') P.rasterize(L);
      let src = L.canvas;
      if (P.sel) { const full = P.applyAdjust(src, a); const out = P.clone(src); const ox = out.getContext('2d'); const m = P.mk(src.width, src.height); const mx = m.getContext('2d'); mx.drawImage(full, 0, 0); mx.globalCompositeOperation = 'destination-in'; mx.drawImage(P.sel.mask, -L.x, -L.y); ox.globalCompositeOperation = 'destination-out'; ox.drawImage(P.sel.mask, -L.x, -L.y); ox.globalCompositeOperation = 'source-over'; ox.drawImage(m, 0, 0); L.canvas = out; }
      else L.canvas = P.applyAdjust(src, a);
      P.commit(); close();
    };
  };
  PP.filterDialog = (type) => {
    const L = P.active(); const d = C.fx.def(type); if (!L || !d) return;
    if (L.type === 'adjust') return C.toast('Select a pixel layer', 'info');
    const e = C.fx.newEffect(type); let ok = false;
    const { el, close } = C.modal(`<div class="modal-head"><h2>${d.icon} ${C.esc(d.name)}</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div><div class="modal-body" id="fdBody"></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="fdOk">Apply</button></div>`, { onClose: () => { if (!ok) { delete L._filter; P.changed(); } } });
    const body = el.querySelector('#fdBody');
    for (const prm of d.params) {
      if (['area', 'rx', 'ry', 'rw', 'rh', 'invert'].includes(prm.key)) continue;
      let row;
      if (prm.type === 'range') { row = C.h(`<div class="row"><label>${prm.label}</label><input type="range" min="${prm.min}" max="${prm.max}" step="${prm.step}" value="${e.p[prm.key]}"><input class="num" value="${e.p[prm.key]}"></div>`); const r = row.querySelector('input[type=range]'), n = row.querySelector('.num'); C.setRangeFill(r); r.oninput = () => { e.p[prm.key] = +r.value; n.value = r.value; P.changed(); }; }
      else if (prm.type === 'color') { row = C.h(`<div class="row two"><label>${prm.label}</label><input type="color" class="color-input" value="${e.p[prm.key]}"></div>`); row.querySelector('input').oninput = (ev) => { e.p[prm.key] = ev.target.value; P.changed(); }; }
      else if (prm.type === 'select') { row = C.h(`<div class="row two"><label>${prm.label}</label><select class="select compact">${prm.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>`); const sl = row.querySelector('select'); sl.value = e.p[prm.key]; sl.onchange = () => { e.p[prm.key] = sl.value; P.changed(); }; }
      else if (prm.type === 'bool') { row = C.h(`<div class="row two"><label>${prm.label}</label><input type="checkbox" ${e.p[prm.key] ? 'checked' : ''}></div>`); row.querySelector('input').onchange = (ev) => { e.p[prm.key] = ev.target.checked; P.changed(); }; }
      else { row = C.h(`<div class="row two"><label>${prm.label}</label><input class="text-input" value="${C.esc(e.p[prm.key] || '')}"></div>`); row.querySelector('input').oninput = (ev) => { e.p[prm.key] = ev.target.value; P.changed(); }; row.querySelector('input').onkeydown = (ev) => ev.stopPropagation(); }
      body.appendChild(row);
    }
    if (!body.children.length) body.appendChild(C.h('<p class="hint">No settings — click Apply.</p>'));
    L._filter = e; P.changed();
    el.querySelector('#fdOk').onclick = () => {
      ok = true; delete L._filter;
      P.begin(d.name);
      if (L.type !== 'raster') P.rasterize(L);
      const out = P.clone(L.canvas); const Lc = { cv: out, cx: out.getContext('2d'), W: out.width, H: out.height };
      C.fx.applyLayer(Lc, [e], { W: out.width, H: out.height, t: 1, T: 1, dur: 2, seed: 7 });
      if (P.sel) { const keep = P.clone(L.canvas); const kx = keep.getContext('2d'); kx.globalCompositeOperation = 'destination-out'; kx.drawImage(P.sel.mask, -L.x, -L.y); const ox = out.getContext('2d'); ox.globalCompositeOperation = 'destination-in'; ox.drawImage(P.sel.mask, -L.x, -L.y); ox.globalCompositeOperation = 'destination-over'; ox.drawImage(keep, 0, 0); }
      L.canvas = out; P.commit(); close();
    };
  };
  // live preview hooks for the dialogs
  const baseRender = P.renderLayerPixels;
  P.renderLayerPixels = (L, W, H) => {
    let c = baseRender(L, W, H);
    if (L._preview) { const adj = P.applyAdjust(c, L._preview); const x = c.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(adj, 0, 0); }
    if (L._filter) { const Lc = { cv: c, cx: c.getContext('2d'), W, H }; C.fx.applyLayer(Lc, [L._filter], { W, H, t: 1, T: 1, dur: 2, seed: 7 }); }
    return c;
  };

  PP.sizeDialog = (canvasMode) => {
    const { el, close } = C.modal(`<div class="modal-head"><h2>${canvasMode ? 'Canvas size' : 'Image size'}</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div><div class="modal-body">
      <div class="form-row"><label>Width</label><input class="text-input" id="szW" value="${P.doc.w}"></div><div class="form-row"><label>Height</label><input class="text-input" id="szH" value="${P.doc.h}"></div>
      ${canvasMode ? `<div class="form-row"><label>Anchor</label><div class="anchor-grid">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<button data-i="${i}" class="${i === 4 ? 'on' : ''}"></button>`).join('')}</div></div>` : '<div class="form-row"><label></label><label class="ph-chk"><input type="checkbox" id="szK" checked> Keep proportions</label></div>'}
      </div><div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="szOk">OK</button></div>`);
    let anchor = 4;
    el.querySelectorAll('.anchor-grid button').forEach((b) => (b.onclick = () => { anchor = +b.dataset.i; el.querySelectorAll('.anchor-grid button').forEach((x) => x.classList.toggle('on', x === b)); }));
    const wI = el.querySelector('#szW'), hI = el.querySelector('#szH'), kI = el.querySelector('#szK');
    [wI, hI].forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    wI.oninput = () => { if (kI && kI.checked) hI.value = Math.round((+wI.value * P.doc.h) / P.doc.w) || ''; };
    hI.oninput = () => { if (kI && kI.checked) wI.value = Math.round((+hI.value * P.doc.w) / P.doc.h) || ''; };
    el.querySelector('#szOk').onclick = () => {
      const nw = C.clamp(parseInt(wI.value, 10) || P.doc.w, 1, 16000), nh = C.clamp(parseInt(hI.value, 10) || P.doc.h, 1, 16000); close();
      if (canvasMode) {
        const ax = (anchor % 3) / 2, ay = Math.floor(anchor / 3) / 2; const dx = Math.round((nw - P.doc.w) * ax), dy = Math.round((nh - P.doc.h) * ay);
        P.act('Canvas size', () => { for (const L of P.doc.layers) { L.x += dx; L.y += dy; if (L.mask) { const m = P.mk(nw, nh); m.getContext('2d').drawImage(L.mask, dx, dy); L.mask = m; } } P.doc.w = nw; P.doc.h = nh; });
      } else {
        const kx = nw / P.doc.w, ky = nh / P.doc.h;
        P.act('Image size', () => { for (const L of P.doc.layers) {
          if (L.type === 'raster') { P.prepPaint(L, false); const c = P.mk(L.canvas.width * kx, L.canvas.height * ky); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(L.canvas, 0, 0, c.width, c.height); L.canvas = c; L.x *= kx; L.y *= ky; }
          else if (L.type === 'text') { L.x *= kx; L.y *= ky; L.text.size *= (kx + ky) / 2; }
          else if (L.type === 'shape') { L.x *= kx; L.y *= ky; L.shape.w *= kx; L.shape.h *= ky; }
          if (L.mask) { const m = P.mk(nw, nh); m.getContext('2d').drawImage(L.mask, 0, 0, nw, nh); L.mask = m; }
        } P.doc.w = nw; P.doc.h = nh; });
      }
      P.sel = null; PU.fit();
    };
  };
  PP.rotateCanvas = (deg) => {
    const W = P.doc.w, H = P.doc.h; const nw = deg % 180 ? H : W, nh = deg % 180 ? W : H;
    const map = (x, y) => (deg === 90 ? [H - y, x] : deg === 270 ? [y, W - x] : [W - x, H - y]);
    P.act('Rotate canvas', () => {
      for (const L of P.doc.layers) {
        if (L.type === 'raster' || L.type === 'text' || L.type === 'shape') { const c = P.center(L); const [nx, ny] = map(c.x, c.y); L.rot += deg; if (L.type === 'raster') { L.x = nx - L.canvas.width / 2; L.y = ny - L.canvas.height / 2; } else { L.x = nx; L.y = ny; } }
        if (L.mask) { const m = P.mk(nw, nh); const x = m.getContext('2d'); x.translate(nw / 2, nh / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(L.mask, -W / 2, -H / 2); L.mask = m; }
      }
      P.doc.w = nw; P.doc.h = nh;
      for (const L of P.doc.layers) if (L.type === 'raster') P.prepPaint(L, false);
    });
    P.sel = null; PU.fit();
  };
  PP.flipCanvas = (h) => P.act(h ? 'Flip canvas horizontal' : 'Flip canvas vertical', () => {
    for (const L of P.doc.layers) {
      if (L.type === 'raster' || L.type === 'text' || L.type === 'shape') { const c = P.center(L); const nx = h ? P.doc.w - c.x : c.x, ny = h ? c.y : P.doc.h - c.y; if (h) L.sx = -L.sx; else L.sy = -L.sy; L.rot = -L.rot; if (L.type === 'raster') { L.x = nx - L.canvas.width / 2; L.y = ny - L.canvas.height / 2; } else { L.x = nx; L.y = ny; } }
      if (L.mask) { const m = P.mk(P.doc.w, P.doc.h); const x = m.getContext('2d'); x.translate(h ? P.doc.w : 0, h ? 0 : P.doc.h); x.scale(h ? -1 : 1, h ? 1 : -1); x.drawImage(L.mask, 0, 0); L.mask = m; }
    }
  });
  PP.featherDialog = async () => {
    if (!P.sel) return C.toast('Make a selection first', 'info');
    const v = await C.prompt('Feather selection', 'Radius (px)', '10', 'Feather'); const r = parseFloat(v); if (!r) return;
    const m = P.mk(P.doc.w, P.doc.h); const x = m.getContext('2d'); x.filter = `blur(${r}px)`; x.drawImage(P.sel.mask, 0, 0); P.sel = { mask: m }; P.selEdges(); PU.redraw();
  };
  PP.selectLayerPixels = () => { const L = P.active(); if (!L) return; P.setSelection(P.renderLayerPixels(L, P.doc.w, P.doc.h), 'new'); PU.redraw(); };

  // ---------- clipboard ----------
  PP.copy = async (merged = false) => {
    const L = P.active(); if (!P.doc || (!L && !merged)) return;
    const src = merged ? P.composite() : P.renderLayerPixels(L, P.doc.w, P.doc.h);
    const b = P.sel ? P.sel.bounds : { x: 0, y: 0, w: P.doc.w, h: P.doc.h };
    const c = P.mk(Math.max(1, Math.round(b.w)), Math.max(1, Math.round(b.h))); const x = c.getContext('2d');
    x.drawImage(src, -Math.round(b.x), -Math.round(b.y));
    if (P.sel) { x.globalCompositeOperation = 'destination-in'; x.drawImage(P.sel.mask, -Math.round(b.x), -Math.round(b.y)); }
    P.clipboard = { canvas: c, x: Math.round(b.x), y: Math.round(b.y) };
    try { const blob = await new Promise((r) => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch (_) {}
    C.toast(merged ? 'Copied merged' : 'Copied', 'ok', 1000);
  };
  PP.clear = () => {
    const L = P.active(); if (!L) return;
    if (!P.sel) { P.act('Delete layer', () => P.remove(L)); return; }
    if (L.type !== 'raster') return C.toast('Convert to pixels first', 'info');
    P.act('Clear', () => { P.prepPaint(L); const c = P.clone(L.canvas); const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out'; x.drawImage(P.sel.mask, -L.x, -L.y); L.canvas = c; });
  };
  PP.cut = async () => { await PP.copy(); PP.clear(); };
  PP.paste = async () => {
    if (!P.doc) { const img = await clipImage(); if (img) { P.fromImage(img, 'Pasted'); PU.fit(); } return; }
    const img = await clipImage();
    if (img) { P.act('Paste', () => { const L = P.addImageLayer(img, 'Pasted'); L.sx = L.sy = 1; L.x = (P.doc.w - L.canvas.width) / 2; L.y = (P.doc.h - L.canvas.height) / 2; }); return; }
    if (P.clipboard) P.act('Paste', () => P.addLayer({ name: 'Pasted', canvas: P.clone(P.clipboard.canvas), x: P.clipboard.x, y: P.clipboard.y }));
  };
  async function clipImage() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) for (const t of it.types) if (t.startsWith('image/')) {
        const blob = await it.getType(t); const url = URL.createObjectURL(blob);
        const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
        if (img && P.clipboard && img.width === P.clipboard.canvas.width && img.height === P.clipboard.canvas.height) return null; // our own copy: keep position
        return img;
      }
    } catch (_) {}
    return null;
  }
  PP.fill = (useBg) => {
    const L = P.active(); if (!L) return; if (L.type !== 'raster') return C.toast('Select a pixel layer', 'info');
    P.act('Fill', () => { P.prepPaint(L); const c = P.clone(L.canvas); const x = c.getContext('2d'); const f = P.mk(P.doc.w, P.doc.h); const fx = f.getContext('2d'); fx.fillStyle = useBg ? P.bg : P.fg; fx.fillRect(0, 0, f.width, f.height); if (P.sel) { fx.globalCompositeOperation = 'destination-in'; fx.drawImage(P.sel.mask, 0, 0); } x.drawImage(f, -L.x, -L.y); L.canvas = c; });
  };

  // ---------- files ----------
  const loadImageFile = (path) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = N.mediaUrl(path); });
  PP.openImage = async (asLayer = false) => {
    const paths = (await N.openMedia()).filter((p) => C.kindOfPath(p) === 'image');
    if (!paths.length) return;
    for (const [i, p] of paths.entries()) {
      const img = await loadImageFile(p); if (!img) { C.toast('Could not open ' + C.baseName(p), 'err'); continue; }
      if (!P.doc || (!asLayer && i === 0)) { if (P.doc && !(await PP.confirmDiscard())) return; P.fromImage(img, C.baseName(p)); PU.fit(); }
      else P.act('Place image', () => P.addImageLayer(img, C.baseName(p)));
    }
    PP.renderAll();
  };
  PP.openPaths = async (paths) => {
    for (const p of paths) {
      if (/\.cutphoto$/i.test(p)) { await PP.openProjectPath(p); continue; }
      if (C.kindOfPath(p) !== 'image') continue;
      const img = await loadImageFile(p); if (!img) continue;
      if (!P.doc) { P.fromImage(img, C.baseName(p)); PU.fit(); } else P.act('Place image', () => P.addImageLayer(img, C.baseName(p)));
    }
    PP.renderAll();
  };
  PP.openProject = async () => { const p = await N.photoOpenDialog(); if (p) PP.openProjectPath(p); };
  PP.openProjectPath = async (p) => {
    if (!(await PP.confirmDiscard())) return;
    try { await P.deserialize(await N.readText(p)); P.doc.path = p; PU.fit(); PP.renderAll(); C.toast('Opened ' + C.baseName(p)); C.home.addRecent(p, P.doc.name, 'photo', P.flattened()); } catch (e) { C.toast('Could not open: ' + e.message, 'err'); }
  };
  PP.save = async (as = false) => {
    if (!P.doc) return;
    let p = P.doc.path; if (!p || as) { p = await N.photoSaveDialog(P.doc.name); if (!p) return; }
    await N.writeText(p, P.serialize()); P.doc.path = p; P.dirty = false; PU.updateStatus(); C.toast('Saved ' + C.baseName(p));
    C.home.addRecent(p, P.doc.name, 'photo', P.flattened());
  };
  PP.export = async (fmt = 'png') => {
    if (!P.doc) return;
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
    const out = await N.saveExportDialog({ name: P.doc.name, ext: fmt, label: fmt.toUpperCase() + ' image' }); if (!out) return;
    let c = P.flattened();
    if (fmt === 'jpg') { const b = P.mk(c.width, c.height); const x = b.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, b.width, b.height); x.drawImage(c, 0, 0); c = b; }
    const blob = await new Promise((r) => c.toBlob(r, mime, 0.92));
    await N.writeBinary(out, await blob.arrayBuffer());
    C.toast('Exported ' + C.baseName(out)); N.showItem(out);
  };
  PP.sendToVideo = async () => {
    if (!P.doc) return;
    const out = await N.photoAutoPath(P.doc.name);
    const blob = await new Promise((r) => P.flattened().toBlob(r, 'image/png'));
    await N.writeBinary(out, await blob.arrayBuffer());
    C.setMode('video');
    await C.importPaths([out], { addToTimeline: true });
    C.toast('Image added to your video at the playhead');
  };
  PP.editVideoFrame = () => {
    if (!C.allClips().length) return C.toast('Your video timeline is empty', 'info');
    const s = C.project.settings; const c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
    C.UI.exporting = true;
    C.engine.renderExact(C.UI.playhead, c.getContext('2d'), s.width, s.height).then(() => {
      C.UI.exporting = false; C.engine.seek(C.UI.playhead);
      C.setMode('photo'); P.fromImage(c, `${C.project.name} frame ${C.fmtTC(C.UI.playhead, C.fps()).replace(/:/g, '-')}`); PU.fit(); PP.renderAll();
    });
  };
  PP.editImageFile = async (path) => {
    const img = await loadImageFile(path); if (!img) return C.toast('Could not open image', 'err');
    C.setMode('photo'); if (!(await PP.confirmDiscard())) return; P.fromImage(img, C.baseName(path)); PU.fit(); PP.renderAll();
  };

  // ---------- menus ----------
  const has = () => !!P.doc;
  PP.menus = {
    file: () => [
      { label: 'New image…', icon: 'plus', key: 'Ctrl+N', action: PP.newDialog },
      { label: 'Open image…', icon: 'folder', key: 'Ctrl+O', action: () => PP.openImage() },
      { label: 'Open .cutphoto project…', icon: 'layers', action: PP.openProject },
      { label: 'Place image as layer…', icon: 'image', disabled: !has(), action: () => PP.openImage(true) },
      { label: 'Edit current video frame', icon: 'film', action: PP.editVideoFrame },
      '-',
      { label: 'Save project', icon: 'save', key: 'Ctrl+S', disabled: !has(), action: () => PP.save() },
      { label: 'Save project as…', icon: 'save', key: 'Ctrl+Shift+S', disabled: !has(), action: () => PP.save(true) },
      { label: 'Export PNG…', icon: 'export', key: 'Ctrl+E', disabled: !has(), action: () => PP.export('png') },
      { label: 'Export JPG…', icon: 'export', disabled: !has(), action: () => PP.export('jpg') },
      { label: 'Export WebP…', icon: 'export', disabled: !has(), action: () => PP.export('webp') },
      '-',
      { label: 'Send to video timeline', icon: 'film', disabled: !has(), action: PP.sendToVideo },
      { label: 'Back to video editor', icon: 'video', action: () => C.setMode('video') },
      { label: 'Home', icon: 'home', action: () => C.home.show() },
    ],
    edit: () => [
      { label: 'Undo', icon: 'undo', key: 'Ctrl+Z', disabled: !P.undo.length, action: P.doUndo },
      { label: 'Redo', icon: 'redo', key: 'Ctrl+Y', disabled: !P.redo.length, action: P.doRedo },
      '-',
      { label: 'Cut', icon: 'blade', key: 'Ctrl+X', disabled: !has(), action: PP.cut },
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', disabled: !has(), action: () => PP.copy() },
      { label: 'Copy merged', icon: 'copy', key: 'Ctrl+Shift+C', disabled: !has(), action: () => PP.copy(true) },
      { label: 'Paste', icon: 'import', key: 'Ctrl+V', action: PP.paste },
      { label: 'Clear selection area', icon: 'trash', key: 'Del', disabled: !has(), action: PP.clear },
      '-',
      { label: 'Fill with foreground', icon: 'bucket', key: 'Alt+Del', disabled: !has(), action: () => PP.fill(false) },
      { label: 'Fill with background', icon: 'bucket', key: 'Ctrl+Del', disabled: !has(), action: () => PP.fill(true) },
      { label: 'Free transform', icon: 'move', key: 'Ctrl+T', disabled: !has(), action: () => PU.setTool('move') },
    ],
    image: () => [
      ...Object.entries(P.ADJUST).filter(([k]) => k !== 'look').map(([k, v]) => ({ label: 'Adjust · ' + v.name + '…', icon: 'adjust', disabled: !has(), action: () => PP.adjustDialog(k) })),
      '-',
      { label: 'Image size…', icon: 'fit', disabled: !has(), action: () => PP.sizeDialog(false) },
      { label: 'Canvas size…', icon: 'crop', disabled: !has(), action: () => PP.sizeDialog(true) },
      { label: 'Rotate 90° clockwise', icon: 'refresh', disabled: !has(), action: () => PP.rotateCanvas(90) },
      { label: 'Rotate 90° counter-clockwise', icon: 'refresh', disabled: !has(), action: () => PP.rotateCanvas(270) },
      { label: 'Rotate 180°', icon: 'refresh', disabled: !has(), action: () => PP.rotateCanvas(180) },
      { label: 'Flip canvas horizontal', icon: 'flipH', disabled: !has(), action: () => PP.flipCanvas(true) },
      { label: 'Flip canvas vertical', icon: 'flipV', disabled: !has(), action: () => PP.flipCanvas(false) },
      { label: 'Crop to selection', icon: 'crop', disabled: !P.sel, action: () => PU.cropTo(P.sel.bounds) },
    ],
    layer: () => {
      const L = P.active();
      return [
        { label: 'New layer', icon: 'plus', key: 'Ctrl+Shift+N', disabled: !has(), action: () => P.act('New layer', () => P.newRaster()) },
        { label: 'New fill layer', icon: 'droplet', disabled: !has(), action: () => P.act('New fill layer', () => P.addFill(P.fg)) },
        ...Object.entries(P.ADJUST).map(([k, v]) => ({ label: 'New adjustment · ' + v.name, icon: 'adjust', disabled: !has(), action: () => { P.act('New adjustment layer', () => P.addAdjust(k)); PP.tab = 'props'; } })),
        '-',
        { label: 'Layer styles…', icon: 'fx', disabled: !L, action: PP.stylesDialog },
        { label: 'Duplicate layer', icon: 'copy', key: 'Ctrl+J', disabled: !L, action: () => P.act('Duplicate layer', () => P.duplicate(L)) },
        { label: 'Delete layer', icon: 'trash', disabled: !L, action: () => P.act('Delete layer', () => P.remove(L)) },
        { label: L && L.mask ? 'Delete mask' : 'Add mask', icon: 'mask', disabled: !L, action: () => (L.mask ? P.act('Delete mask', () => { L.mask = null; }) : PP.addMask()) },
        { label: 'Convert to pixels', icon: 'photo', disabled: !L || L.type === 'raster' || L.type === 'adjust', action: () => P.act('Rasterize', () => P.rasterize(L)) },
        { label: 'Bring forward', icon: 'chevronDown', key: 'Ctrl+]', disabled: !L, action: () => PP.arrange(1) },
        { label: 'Send backward', icon: 'chevronDown', key: 'Ctrl+[', disabled: !L, action: () => PP.arrange(-1) },
        { label: 'Merge down', icon: 'merge', key: 'Ctrl+E', disabled: !L, action: PP.mergeDown },
        { label: 'Flatten image', icon: 'layers', disabled: !has(), action: PP.flatten },
      ];
    },
    select: () => [
      { label: 'Select all', icon: 'marquee', key: 'Ctrl+A', disabled: !has(), action: () => { P.selectAll(); PU.redraw(); } },
      { label: 'Deselect', icon: 'x', key: 'Ctrl+D', disabled: !P.sel, action: () => { P.deselect(); PU.redraw(); } },
      { label: 'Invert selection', icon: 'swap', key: 'Ctrl+Shift+I', disabled: !has(), action: () => { P.invertSelection(); PU.redraw(); } },
      { label: 'Feather…', icon: 'droplet', disabled: !P.sel, action: PP.featherDialog },
      { label: 'Select layer pixels', icon: 'layers', disabled: !has(), action: PP.selectLayerPixels },
    ],
    filter: () => C.fx.CATS.filter((c) => c !== 'Motion').flatMap((cat) => C.fx.DEFS.filter((d) => d.cat === cat && d.phase === 'layer').map((d) => ({ label: `${cat} · ${d.name}…`, icon: 'sparkles', disabled: !has(), action: () => PP.filterDialog(d.id) }))),
  };
  PP.exportMenu = (btn) => {
    if (!P.doc) return C.toast('Open or create an image first', 'info');
    const r = btn.getBoundingClientRect();
    C.menu(r.right - 230, r.bottom + 4, [
      { label: 'Export PNG…', icon: 'export', action: () => PP.export('png') },
      { label: 'Export JPG…', icon: 'export', action: () => PP.export('jpg') },
      { label: 'Export WebP…', icon: 'export', action: () => PP.export('webp') },
      '-', { label: 'Send to video timeline', icon: 'film', action: PP.sendToVideo },
      { label: 'Save .cutphoto project', icon: 'save', action: () => PP.save() },
    ]);
  };
  PP.arrange = (dir) => { const i = P.indexOf(P.doc.active), j = i + dir; if (j < 0 || j >= P.doc.layers.length) return; P.act('Arrange', () => { const a = P.doc.layers; [a[i], a[j]] = [a[j], a[i]]; }); };
  PU.cropTo = (b) => { PU.setTool('crop'); setTimeout(() => { PU._setCrop && PU._setCrop(b); }, 0); };

  // ---------- keyboard ----------
  PP.key = (e) => {
    if (C.mode !== 'photo') return false;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl) {
      const map = {
        z: () => (e.shiftKey ? P.doRedo() : P.doUndo()), y: P.doRedo, s: () => PP.save(e.shiftKey), o: () => PP.openImage(), n: () => (e.shiftKey ? P.doc && P.act('New layer', () => P.newRaster()) : PP.newDialog()),
        c: () => PP.copy(e.shiftKey), x: PP.cut, v: PP.paste, j: () => P.doc && P.act('Duplicate layer', () => P.duplicate(P.active())), e: () => (e.shiftKey ? PP.flatten() : PP.mergeDown()),
        a: () => { P.selectAll(); PU.redraw(); }, d: () => { P.deselect(); PU.redraw(); }, i: () => { if (e.shiftKey) { P.invertSelection(); PU.redraw(); } else PP.adjustDialog('invert'); }, t: () => PU.setTool('move'),
        '0': PU.fit, '=': () => PU.zoomAt(1.25), '+': () => PU.zoomAt(1.25), '-': () => PU.zoomAt(0.8), '1': () => { PU.view.z = 1; PU.fit(); PU.zoomAt(1 / PU.view.z); }, ']': () => PP.arrange(1), '[': () => PP.arrange(-1),
        delete: () => PP.fill(true), backspace: () => PP.fill(true), l: () => PP.adjustDialog('levels'), m: () => PP.adjustDialog('curves'), u: () => PP.adjustDialog('hueSat'), k: () => C.palette.open(),
      };
      if (map[k]) { e.preventDefault(); map[k](); return true; }
      return false;
    }
    if (C.isTyping()) return false;
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) { PU.spaceDown(true); const up = (u) => { if (u.key === ' ') { PU.spaceDown(false); removeEventListener('keyup', up); } }; addEventListener('keyup', up); } return true; }
    if (e.key === 'Enter' && PU.cropping()) { PU.applyCrop(); return true; }
    if (e.key === 'Escape') { if (PU.cropping()) PU.cancelCrop(); else { P.deselect(); PU.redraw(); } return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); if (e.altKey) PP.fill(false); else PP.clear(); return true; }
    if (e.key === '[' || e.key === ']') { const o = PU.opts[PU.tool]; if (o && o.size) { o.size = C.clamp(Math.round(o.size * (e.key === ']' ? 1.15 : 1 / 1.15)), 1, 1000); PU.renderOptions(); PU.redraw(); } return true; }
    if (e.key.startsWith('Arrow') && PU.tool === 'move') { const L = P.active(); if (!L) return true; const d = e.shiftKey ? 10 : 1; e.preventDefault(); P.act('Nudge', () => { if (e.key === 'ArrowLeft') L.x -= d; if (e.key === 'ArrowRight') L.x += d; if (e.key === 'ArrowUp') L.y -= d; if (e.key === 'ArrowDown') L.y += d; }); return true; }
    if (k === 'x') { [P.fg, P.bg] = [P.bg, P.fg]; C.emit('photo:colors'); return true; }
    if (k === 'd') { P.fg = '#000000'; P.bg = '#ffffff'; C.emit('photo:colors'); return true; }
    const tool = PU.TOOLS.find((t) => t !== '-' && t[2].toLowerCase() === k);
    if (tool) { PU.setTool(tool[0]); return true; }
    return false;
  };
})(window.C);
