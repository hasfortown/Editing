/* Cutroom — library panels */
(function (C) {
  const L = (C.library = {});
  let panel, current = 'media', mediaFilter = 'all';

  C.FILTERS = [
    { id: 'none', name: 'Original', fx: {} },
    { id: 'vivid', name: 'Vivid', fx: { saturation: 40, contrast: 12, brightness: 3 } },
    { id: 'warm', name: 'Golden', fx: { temperature: 45, saturation: 12, brightness: 4 } },
    { id: 'cool', name: 'Arctic', fx: { temperature: -45, saturation: -5, contrast: 6 } },
    { id: 'mono', name: 'Mono', fx: { grayscale: 100, contrast: 15 } },
    { id: 'noir', name: 'Noir', fx: { grayscale: 100, contrast: 45, brightness: -8, vignette: 55 } },
    { id: 'vintage', name: 'Vintage', fx: { sepia: 45, contrast: -8, saturation: -15, vignette: 35, brightness: 4 } },
    { id: 'faded', name: 'Faded', fx: { contrast: -25, saturation: -25, brightness: 8 } },
    { id: 'drama', name: 'Drama', fx: { contrast: 35, saturation: -10, vignette: 45, brightness: -4 } },
    { id: 'teal', name: 'Teal & Orange', fx: { temperature: 20, hue: -8, saturation: 25, contrast: 15 } },
    { id: 'dream', name: 'Dreamy', fx: { blur: 2, brightness: 10, saturation: 15, contrast: -10 } },
    { id: 'cyber', name: 'Cyber', fx: { hue: 40, saturation: 50, contrast: 20, temperature: -30 } },
    { id: 'film', name: 'Film', fx: { contrast: 10, saturation: -12, sepia: 15, vignette: 25 } },
    { id: 'pop', name: 'Pop', fx: { saturation: 80, contrast: 25, brightness: 5 } },
  ];
  const cssFilter = (fx) => {
    const f = [];
    if (fx.brightness) f.push(`brightness(${1 + fx.brightness / 100})`);
    if (fx.contrast) f.push(`contrast(${1 + fx.contrast / 100})`);
    if (fx.saturation) f.push(`saturate(${1 + fx.saturation / 100})`);
    if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
    if (fx.grayscale) f.push(`grayscale(${fx.grayscale}%)`);
    if (fx.sepia) f.push(`sepia(${fx.sepia}%)`);
    if (fx.blur) f.push(`blur(${fx.blur / 2}px)`);
    if (fx.temperature > 0) f.push(`sepia(${fx.temperature * 0.3}%)`);
    if (fx.temperature < 0) f.push(`hue-rotate(${fx.temperature * 0.2}deg)`);
    return f.join(' ') || 'none';
  };

  C.TEXT_PRESETS = [
    { name: 'Title', css: 'font-weight:800;font-size:22px', text: { content: 'Big Title', size: 140, bold: true, shadow: 0.5 } },
    { name: 'Subtitle', css: 'font-size:15px', text: { content: 'Subtitle text', size: 64, bold: false, shadow: 0.6 }, t: { y: 0.86 } },
    { name: 'Caption box', css: 'background:#000a;padding:3px 8px;border-radius:5px;font-size:14px', text: { content: 'Caption', size: 58, bold: true, bg: '#000000', bgOpacity: 0.65, shadow: 0 }, t: { y: 0.85 } },
    { name: 'Outline', css: 'font-weight:900;font-size:20px;color:#fff;-webkit-text-stroke:1.5px #000', text: { content: 'OUTLINE', size: 130, bold: true, strokeWidth: 8, strokeColor: '#000000', font: 'Arial Black', shadow: 0 } },
    { name: 'Neon', css: 'font-weight:700;font-size:20px;color:#7ffcf0;text-shadow:0 0 8px #19d3c5', text: { content: 'NEON', size: 130, color: '#7ffcf0', bold: true, strokeWidth: 3, strokeColor: '#0a7d74', shadow: 0.9, font: 'Bahnschrift' }, anim: { in: 'blur' } },
    { name: 'Impact', css: 'font-family:Impact;font-size:21px;color:#ffe14d;-webkit-text-stroke:1px #000', text: { content: 'WOW!', size: 160, color: '#ffe14d', font: 'Impact', bold: false, strokeWidth: 6, strokeColor: '#000000' }, anim: { in: 'pop', out: 'pop' } },
    { name: 'Lower third', css: 'font-size:13px;text-align:left;border-left:3px solid #19d3c5;padding-left:6px', text: { content: 'Jane Doe\nDirector', size: 52, align: 'left', bg: '#111318', bgOpacity: 0.8, shadow: 0, bold: true }, t: { x: 0.24, y: 0.82 }, anim: { in: 'slideRight', out: 'slideLeft' } },
    { name: 'Typewriter', css: 'font-family:Consolas;font-size:15px', text: { content: 'Once upon a time…', size: 70, font: 'Consolas', bold: false }, anim: { in: 'typewriter', out: 'fade', dur: 1.2 } },
    { name: 'Elegant', css: 'font-family:Georgia;font-style:italic;font-size:19px', text: { content: 'Elegant', size: 120, font: 'Georgia', italic: true, bold: false, letterSpacing: 4 }, anim: { in: 'slideUp' } },
    { name: 'Spaced', css: 'letter-spacing:5px;font-size:13px;font-weight:600', text: { content: 'C I N E M A', size: 60, letterSpacing: 25, bold: true, uppercase: true, shadow: 0.3 }, anim: { in: 'zoomOut' } },
  ];
  const COLORS = ['#000000', '#ffffff', '#19d3c5', '#7c5cff', '#ff5d6c', '#ffb547', '#2f5fd8', '#1f9d6b', '#e83e8c', '#2b2d42', '#f4f1de', '#3d405b'];

  L.init = () => {
    panel = C.$('#libraryPanel');
    C.$$('.rail-btn').forEach((b) => b.addEventListener('click', () => { current = b.dataset.panel; C.$$('.rail-btn').forEach((x) => x.classList.toggle('active', x === b)); L.render(); }));
    C.on('media', () => { if (current === 'media') L.render(); });
    C.on('change', (i) => { if (current === 'media' && (i.source === 'remote' || i.source === 'undo')) L.render(); });
    C.on('mediaProgress', (id) => { if (current === 'media') updateItem(id); });
    C.on('presets', () => { if (current === 'effects') L.render(); });
    L.render();
  };

  L.show = (name) => { const b = C.$(`.rail-btn[data-panel="${name}"]`); if (b) b.click(); };
  L.render = () => {
    panel.innerHTML = '';
    ({ media: renderMedia, text: renderText, transitions: renderTransitions, filters: renderFilters, elements: renderElements, effects: renderEffects, stickers: renderStickers, overlays: renderOverlays })[current]();
    C.fillIcons(panel);
  };

  function renderMedia() {
    const media = Object.values(C.project.media).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    panel.appendChild(C.h(`<h3><span>Project media</span><span class="muted" style="font-weight:400;font-size:12px">${media.length} item${media.length === 1 ? '' : 's'}</span></h3>`));
    const zone = C.h(`<div class="import-zone"><span class="ico">${C.icon('upload')}</span><b>Import media</b><small>Video, audio & images · or drag files anywhere</small></div>`);
    zone.onclick = () => C.app.importDialog();
    panel.appendChild(zone);
    if (media.length) {
      const chips = C.h('<div class="chips" style="margin-top:12px"></div>');
      [['all', 'All'], ['video', 'Video'], ['audio', 'Audio'], ['image', 'Images']].forEach(([v, l]) => {
        const b = C.h(`<button class="chip ${mediaFilter === v ? 'on' : ''}">${l}</button>`);
        b.onclick = () => { mediaFilter = v; L.render(); };
        chips.appendChild(b);
      });
      panel.appendChild(chips);
    }
    const grid = C.h('<div class="media-grid"></div>');
    for (const m of media) { if (mediaFilter !== 'all' && m.kind !== mediaFilter) continue; grid.appendChild(mediaItem(m)); }
    panel.appendChild(grid);
    if (!media.length) panel.appendChild(C.h('<div class="empty-note">Your imported clips, music and photos show up here.<br>Drag them onto the timeline to start editing.</div>'));
  }

  function mediaItem(m) {
    const r = C.MR[m.id] || {};
    const el = C.h(`<div class="media-item" draggable="true" data-media="${m.id}">
      <div class="media-thumb"></div>
      <span class="media-kind">${C.icon(m.kind === 'video' ? 'film' : m.kind === 'audio' ? 'music' : 'image')}</span>
      <button class="media-add" data-tip="Add at playhead">${C.icon('plus')}</button>
      ${m.duration ? `<span class="media-badge">${C.fmtDur(m.duration)}</span>` : ''}
      <div class="media-meta"><div class="media-name" title="${C.esc(m.name)}">${C.esc(m.name)}</div></div></div>`);
    const th = el.querySelector('.media-thumb');
    paintThumb(th, m, r);
    el.querySelector('.media-add').addEventListener('click', (e) => { e.stopPropagation(); addAtPlayhead(m); });
    if (m.kind === 'video') {
      th.addEventListener('mousemove', (e) => {
        const rr = C.MR[m.id]; if (!rr || !rr.thumbs || rr.thumbs.length < 2) return;
        const b = th.getBoundingClientRect(); const f = C.clamp((e.clientX - b.left) / b.width, 0, 0.999);
        const cv = th.querySelector('canvas'); if (!cv) return;
        const img = rr.thumbs[Math.floor(f * rr.thumbs.length)].img; const x = cv.getContext('2d');
        const iw = img.width, ih = img.height, k = Math.max(cv.width / iw, cv.height / ih);
        x.drawImage(img, (cv.width - iw * k) / 2, (cv.height - ih * k) / 2, iw * k, ih * k);
        x.fillStyle = '#19d3c5'; x.fillRect(f * cv.width - 1.5, 0, 3, cv.height);
      });
      th.addEventListener('mouseleave', () => paintThumb(th, m, C.MR[m.id] || {}));
    }
    el.addEventListener('dblclick', () => addAtPlayhead(m));
    el.addEventListener('dragstart', (e) => {
      if ((C.MR[m.id] || {}).status !== 'ready') { e.preventDefault(); C.toast('Still preparing this file…', 'info'); return; }
      e.dataTransfer.setData('application/x-cutroom-media', m.id); e.dataTransfer.effectAllowed = 'copy';
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      C.menu(e.clientX, e.clientY, [
        { label: 'Add at playhead', icon: 'plus', disabled: r.status !== 'ready', action: () => addAtPlayhead(m) },
        { label: 'Show in folder', icon: 'folder', action: () => window.native.showItem(C.mediaPath(m)) },
        ...(m.kind === 'image' ? [{ label: 'Edit in Photo editor', icon: 'photo', action: () => C.photoPanels.editImageFile(C.mediaPath(m)) }] : []),
        { label: 'Relink file…', icon: 'link', action: () => C.relinkMedia(m) },
        { label: 'Rename', icon: 'text', action: async () => { const v = await C.prompt('Rename media', 'Name', m.name); if (v) C.act('Rename media', () => { C.project.media[m.id].name = v; }); C.emit('media'); } },
        '-',
        { label: 'Remove from project', icon: 'trash', action: () => C.removeMedia(m.id) },
      ]);
    });
    return el;
  }
  function paintThumb(th, m, r) {
    th.innerHTML = '';
    if (m.kind === 'audio') {
      th.style.background = 'linear-gradient(135deg,#0f3d30,#135f45)';
      if (r.peaks) {
        const cv = document.createElement('canvas'); cv.width = 260; cv.height = 120;
        const x = cv.getContext('2d'); x.fillStyle = 'rgba(160,255,214,.85)';
        const n = 130, per = Math.max(1, Math.floor(r.peaks.length / n));
        for (let i = 0; i < n; i++) { let v = 0; for (let j = i * per; j < (i + 1) * per && j < r.peaks.length; j++) v = Math.max(v, r.peaks[j]); const hh = Math.max(1, v * 50); x.fillRect(i * 2, 60 - hh, 1.4, hh * 2); }
        th.appendChild(cv);
      } else th.innerHTML = C.icon('music');
    } else if (r.thumbs && r.thumbs.length) {
      const cv = document.createElement('canvas'); cv.width = 260; cv.height = 162;
      const img = r.thumbs[Math.floor(r.thumbs.length / 3)].img;
      const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
      const k = Math.max(260 / iw, 162 / ih);
      cv.getContext('2d').drawImage(img, (260 - iw * k) / 2, (162 - ih * k) / 2, iw * k, ih * k);
      th.appendChild(cv);
    } else th.innerHTML = C.icon(m.kind === 'image' ? 'image' : 'film');
    if (r.status && r.status !== 'ready') {
      const labels = { loading: 'Reading…', thumbs: 'Generating previews…', proxying: 'Converting for editing', downloading: 'Receiving from host', missing: 'File missing', error: 'Could not load' };
      const st = C.h(`<div class="media-status ${r.status === 'missing' || r.status === 'error' ? 'media-missing' : ''}"><div>${labels[r.status] || r.status}${r.progress && r.status !== 'missing' ? ' ' + Math.round(r.progress * 100) + '%' : ''}${r.status === 'missing' ? '<br><button class="btn" style="height:24px;margin-top:6px;font-size:11px" data-relink>Relink…</button>' : ''}</div></div>`);
      const rl = st.querySelector('[data-relink]'); if (rl) rl.onclick = (e) => { e.stopPropagation(); C.relinkMedia(m); };
      th.appendChild(st);
      if (r.progress && r.status !== 'missing') th.appendChild(C.h(`<div class="media-progress"><div style="width:${r.progress * 100}%"></div></div>`));
    }
  }
  function updateItem(id) {
    const el = panel.querySelector(`.media-item[data-media="${id}"]`);
    const m = C.project.media[id];
    if (!el || !m) return;
    paintThumb(el.querySelector('.media-thumb'), m, C.MR[id] || {});
    const badge = el.querySelector('.media-badge');
    if (!badge && m.duration) el.appendChild(C.h(`<span class="media-badge">${C.fmtDur(m.duration)}</span>`));
  }
  function addAtPlayhead(m) {
    if ((C.MR[m.id] || {}).status !== 'ready') { C.toast('Still preparing this file…', 'info'); return; }
    C.act('Add to timeline', () => { const c = C.addMediaClip(m.id, C.snapTime(C.UI.playhead)); if (c) C.select([c.id]); });
  }

  function renderText() {
    panel.appendChild(C.h('<h3>Text</h3>'));
    const add = C.h(`<button class="btn primary block" style="margin-bottom:14px">${C.icon('plus')}<span>Add text</span></button>`);
    add.onclick = () => C.act('Add text', () => { const c = C.ops.addText(null); C.select([c.id]); C.emit('focusText'); });
    panel.appendChild(add);
    panel.appendChild(C.h('<h4>Animated styles</h4>'));
    const sg = C.h('<div class="card-grid"></div>');
    C.textFX.STYLES.forEach((p) => {
      const card = C.h(`<div class="card" draggable="true"><div class="card-art"><div class="text-preset" style="${p.css}">${C.esc(p.text.content.split('\n')[0])}</div></div><div class="card-label">${p.name}</div></div>`);
      card.onclick = () => C.act('Add text', () => { const c = C.ops.addText(p); C.select([c.id]); });
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-text', JSON.stringify(p)));
      sg.appendChild(card);
    });
    panel.appendChild(sg);
    panel.appendChild(C.h('<h4>Basic presets</h4>'));
    const grid = C.h('<div class="card-grid"></div>');
    C.TEXT_PRESETS.forEach((p) => {
      const card = C.h(`<div class="card" draggable="true"><div class="card-art"><div class="text-preset" style="${p.css}">${C.esc(p.text.content.split('\n')[0])}</div></div><div class="card-label">${p.name}</div></div>`);
      card.onclick = () => C.act('Add text', () => { const c = C.ops.addText(p); C.select([c.id]); });
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-text', JSON.stringify(p)));
      grid.appendChild(card);
    });
    panel.appendChild(grid);
  }

  let trQuery = '';
  function renderTransitions() {
    panel.appendChild(C.h(`<h3>Transitions <small class="muted" style="font-weight:500;font-size:12px">${C.TRANSITIONS.length}</small></h3>`));
    panel.appendChild(C.h('<p class="hint" style="margin:-4px 2px 10px">Hover to preview · click to add to the selected clip(s) · or drag onto a clip. A transition blends in from the previous clip on the same track.</p>'));
    const q = C.h(`<input class="text-input" placeholder="Search transitions…" value="${C.esc(trQuery)}" style="margin-bottom:6px">`);
    q.addEventListener('input', C.debounce(() => { trQuery = q.value; L.render(); const n = panel.querySelector('input'); if (n) { n.focus(); n.selectionStart = n.value.length; } }, 200));
    q.addEventListener('keydown', (e) => e.stopPropagation());
    panel.appendChild(q);
    const ql = trQuery.toLowerCase();
    for (const cat of C.TR_CATS) {
      const list = C.TRANSITIONS.filter((t) => t.cat === cat && (!ql || t.name.toLowerCase().includes(ql) || cat.toLowerCase().includes(ql)));
      if (!list.length) continue;
      panel.appendChild(C.h(`<h4>${cat}</h4>`));
      const grid = C.h('<div class="card-grid"></div>');
      list.forEach((t) => {
        const card = C.fxlib.transitionCard(t);
        card.onclick = () => {
          const sel = C.selectedClips().filter((c) => c.kind !== 'audio');
          if (!sel.length) { C.toast('Select a clip first, or drag the transition onto a clip', 'info'); return; }
          C.act('Add transition', () => C.ops.setTransition(sel, t.id));
          card.classList.add('applied'); setTimeout(() => card.classList.remove('applied'), 500);
          C.toast(`${t.name} added`, 'ok', 1400);
        };
        card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-transition', t.id));
        grid.appendChild(card);
      });
      panel.appendChild(grid);
    }
  }

  function renderFilters() {
    panel.appendChild(C.h('<h3>Filters</h3>'));
    panel.appendChild(C.h('<p class="hint" style="margin:-4px 2px 12px">Click to apply to selected clips, or drag onto a clip. Fine-tune in the Adjust tab.</p>'));
    const grid = C.h('<div class="card-grid"></div>');
    let src = null;
    const firstVid = Object.values(C.project.media).find((m) => C.MR[m.id] && C.MR[m.id].thumbs && C.MR[m.id].thumbs.length);
    if (firstVid) src = C.MR[firstVid.id].thumbs[0].img;
    C.FILTERS.forEach((f) => {
      const card = C.h(`<div class="card" draggable="true"><div class="card-art"></div><div class="card-label">${f.name}</div></div>`);
      const art = card.querySelector('.card-art');
      if (src) {
        const cv = document.createElement('canvas'); cv.width = 180; cv.height = 74; cv.style.cssText = `width:100%;height:100%;filter:${cssFilter(f.fx)}`;
        const iw = src.width || src.naturalWidth, ih = src.height || src.naturalHeight, k = Math.max(180 / iw, 74 / ih);
        cv.getContext('2d').drawImage(src, (180 - iw * k) / 2, (74 - ih * k) / 2, iw * k, ih * k);
        art.appendChild(cv);
      } else art.appendChild(C.h(`<div class="filter-art" style="filter:${cssFilter(f.fx)}"></div>`));
      card.onclick = () => {
        const sel = C.selectedClips().filter((c) => c.kind !== 'audio');
        if (!sel.length) { C.toast('Select a clip first', 'info'); return; }
        C.act('Apply filter', () => C.ops.applyFilter(sel, f.id));
        C.inspector.render(true);
      };
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-filter', f.id));
      grid.appendChild(card);
    });
    panel.appendChild(grid);
  }

  function fxCard(ref, name, effects, key, badge, menuItems) {
    const cd = C.h(`<div class="card fx-pick" draggable="true"><div class="card-art"><img alt=""><span class="fx-badge">${badge || ''}</span></div><div class="card-label">${C.esc(name)}</div></div>`);
    const img = cd.querySelector('img');
    C.presets.queueThumb(img, effects, key);
    C.fxlib.effectHover(cd, effects);
    cd.onclick = () => { C.presets.applyRef(ref, C.selectedClips().filter((c) => c.kind !== 'audio' && c.kind !== 'effect')); cd.classList.add('applied'); setTimeout(() => cd.classList.remove('applied'), 500); };
    cd.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-effect', ref));
    if (menuItems) cd.addEventListener('contextmenu', (e) => { e.preventDefault(); C.menu(e.clientX, e.clientY, menuItems()); });
    return cd;
  }
  let fxQuery = '';
  function renderEffects() {
    const P = C.presets;
    panel.appendChild(C.h('<h3>Effects</h3>'));
    const act = C.h(`<div style="display:grid;grid-template-columns:1fr auto auto;gap:6px;margin-bottom:10px"><button class="btn primary">${C.icon('wand')}<span>Effect Studio</span></button><button class="icon-btn" data-tip="Import presets (.cutfx)">${C.icon('import')}</button><button class="icon-btn" data-tip="Export my presets">${C.icon('export')}</button></div>`);
    const [bStudio, bImp, bExp] = act.querySelectorAll('button');
    bStudio.onclick = () => P.studio(); bImp.onclick = () => P.importPresets(); bExp.onclick = () => P.exportPresets(P.user, 'My Cutroom presets');
    panel.appendChild(act);
    panel.appendChild(C.h('<p class="hint" style="margin:0 2px 10px">Click to add to the selected clip — or, with nothing selected, as an <b style="color:var(--text)">effect clip</b> that affects everything below it. Drag onto a clip or track. Hover to preview.</p>'));
    const q = C.h(`<input class="text-input" placeholder="Search effects & presets…" value="${C.esc(fxQuery)}" style="margin-bottom:6px">`);
    q.addEventListener('input', C.debounce(() => { fxQuery = q.value; L.render(); const n = panel.querySelector('input'); if (n) { n.focus(); n.selectionStart = n.value.length; } }, 200));
    q.addEventListener('keydown', (e) => e.stopPropagation());
    panel.appendChild(q);
    const ql = fxQuery.toLowerCase();
    const mine = P.user.filter((p) => !ql || p.name.toLowerCase().includes(ql));
    panel.appendChild(C.h(`<h4>My presets</h4>`));
    if (mine.length) {
      const g = C.h('<div class="card-grid"></div>');
      mine.forEach((p) => g.appendChild(fxCard('preset:' + p.id, p.name, P.instantiate(p).effects, 'p:' + p.id + ':' + (p.created || 0), p.imported ? '⇣' : '', () => [
        { label: 'Apply', icon: 'sparkles', action: () => P.applyRef('preset:' + p.id, C.selectedClips().filter((c) => c.kind !== 'audio')) },
        { label: 'Edit in Effect Studio', icon: 'wand', action: () => P.studio({ preset: p }) },
        { label: 'Rename…', icon: 'text', action: () => P.rename(p) },
        { label: 'Export…', icon: 'export', action: () => P.exportPresets([p], p.name) },
        '-', { label: 'Delete', icon: 'trash', action: () => P.remove(p) },
      ])));
      panel.appendChild(g);
    } else panel.appendChild(C.h(`<div class="hint" style="margin:0 2px 6px">${ql ? 'No matches.' : 'Build your own look in the <b>Effect Studio</b>, or right-click a clip → “Save effects as preset”. Import presets friends share with you using the ⇣ button.'}</div>`));
    const packs = C.fx.BUILTIN_PRESETS.filter((p) => !ql || p.name.toLowerCase().includes(ql));
    if (packs.length) {
      panel.appendChild(C.h('<h4>Preset looks</h4>'));
      const g = C.h('<div class="card-grid"></div>');
      packs.forEach((p) => g.appendChild(fxCard('preset:' + p.id, p.name, P.instantiate(p).effects, 'p:' + p.id, '★', () => [
        { label: 'Apply', icon: 'sparkles', action: () => P.applyRef('preset:' + p.id, C.selectedClips().filter((c) => c.kind !== 'audio')) },
        { label: 'Customize in Effect Studio', icon: 'wand', action: () => P.studio({ preset: p }) },
        { label: 'Export…', icon: 'export', action: () => P.exportPresets([p], p.name) },
      ])));
      panel.appendChild(g);
    }
    for (const cat of C.fx.CATS) {
      const defs = C.fx.DEFS.filter((d) => d.cat === cat && (!ql || d.name.toLowerCase().includes(ql) || cat.toLowerCase().includes(ql)));
      if (!defs.length) continue;
      panel.appendChild(C.h(`<h4>${cat}</h4>`));
      const g = C.h('<div class="card-grid"></div>');
      defs.forEach((d) => g.appendChild(fxCard('fx:' + d.id, d.name, [C.fx.newEffect(d.id)], 'fx:' + d.id, d.icon)));
      panel.appendChild(g);
    }
  }

  let stickerCat = 'Smileys', stickerQ = '';
  function renderStickers() {
    panel.appendChild(C.h('<h3>Stickers & emoji</h3>'));
    const q = C.h(`<input class="text-input" placeholder="Search emoji (e.g. fire, party, heart)…" value="${C.esc(stickerQ)}">`);
    q.addEventListener('input', () => { stickerQ = q.value; fill(); });
    q.addEventListener('keydown', (e) => e.stopPropagation());
    panel.appendChild(q);
    const tabs = C.h('<div class="emoji-tabs big"></div>');
    const recent = C.emoji.recent();
    [...(recent.length ? [['Recent', '🕘']] : []), ...C.emoji.CATS.map((c) => [c.name, C.emoji.CAT_ICON[c.name]])].forEach(([n, ic]) => {
      const b = C.h(`<button data-c="${n}" title="${n}">${ic}</button>`); b.onclick = () => { stickerCat = n; stickerQ = ''; q.value = ''; fill(); }; tabs.appendChild(b);
    });
    panel.appendChild(tabs);
    const title = C.h('<h4></h4>'); panel.appendChild(title);
    const grid = C.h('<div class="sticker-grid"></div>'); panel.appendChild(grid);
    panel.appendChild(C.h('<p class="hint" style="margin-top:12px">Click to add at the playhead, or drag onto the timeline. Stickers are fully editable — resize, rotate, animate and keyframe them like text. You can also type emoji straight into any text.</p>'));
    function fill() {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !stickerQ && b.dataset.c === stickerCat));
      const items = stickerQ ? C.emoji.search(stickerQ) : stickerCat === 'Recent' ? C.emoji.recent().map((e) => ({ e })) : C.emoji.CATS.find((c) => c.name === stickerCat).items;
      title.textContent = stickerQ ? `Results (${items.length})` : stickerCat;
      grid.innerHTML = '';
      for (const it of items) {
        const b = C.h(`<button draggable="true" title="${C.esc(it.k || '')}">${it.e}</button>`);
        b.onclick = () => { C.emoji.pushRecent(it.e); C.act('Add sticker', () => { const c = C.ops.addSticker(it.e); C.select([c.id]); }); };
        b.addEventListener('dragstart', (e) => { C.emoji.pushRecent(it.e); e.dataTransfer.setData('application/x-cutroom-sticker', it.e); });
        grid.appendChild(b);
      }
    }
    fill();
  }

  function renderOverlays() {
    panel.appendChild(C.h('<h3>Overlays</h3>'));
    panel.appendChild(C.h('<p class="hint" style="margin:-4px 2px 10px">Click or drag onto the timeline. Each overlay is an effect clip on its own track — stretch it to any length, and tweak or keyframe it in the inspector.</p>'));
    for (const [cat, list] of C.fx.OVERLAYS) {
      panel.appendChild(C.h(`<h4>${cat}</h4>`));
      const g = C.h('<div class="card-grid"></div>');
      list.forEach((o) => {
        const effects = C.presets.instantiate(o).effects;
        const cd = C.h(`<div class="card fx-pick" draggable="true"><div class="card-art"><img alt=""><span class="fx-badge">${o.icon}</span></div><div class="card-label">${C.esc(o.name)}</div></div>`);
        const img = cd.querySelector('img'); C.presets.queueThumb(img, effects, 'ov:' + o.id); C.fxlib.effectHover(cd, effects);
        cd.onclick = () => C.presets.applyRef('ov:' + o.id, []);
        cd.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-effect', 'ov:' + o.id));
        g.appendChild(cd);
      });
      panel.appendChild(g);
    }
  }

  function renderElements() {
    panel.appendChild(C.h('<h3>Elements</h3>'));
    panel.appendChild(C.h('<h4>Shapes</h4>'));
    const sg = C.h('<div class="card-grid" style="grid-template-columns:repeat(4,1fr)"></div>');
    C.geo.SHAPES.forEach(([k, l]) => {
      const cv = document.createElement('canvas'); cv.width = 80; cv.height = 80; const x = cv.getContext('2d'); x.translate(40, 40);
      const sh = C.defaultShape(k); const sc = 52 / Math.max(sh.w, sh.h || 1); C.geo.shapePath(x, { kind: k, w: sh.w * sc, h: (sh.h || 0) * sc, radius: sh.radius, points: sh.points, inner: sh.inner });
      if (k === 'line') { x.strokeStyle = '#19d3c5'; x.lineWidth = 5; x.lineCap = 'round'; x.stroke(); } else { const g = x.createLinearGradient(-30, -30, 30, 30); g.addColorStop(0, '#19d3c5'); g.addColorStop(1, '#7c5cff'); x.fillStyle = g; x.fill(k === 'ring' ? 'evenodd' : 'nonzero'); }
      const card = C.h(`<div class="card" data-tip="Add ${l}"><div class="card-art" style="height:62px"><img src="${cv.toDataURL()}" style="width:46px;height:46px"></div></div>`);
      card.onclick = () => C.act('Add shape', () => { const c = C.ops.addShape(k); C.select([c.id]); C.emit('inspectTab', 'shape'); });
      sg.appendChild(card);
    });
    panel.appendChild(sg);
    panel.appendChild(C.h('<h4>Solid colors</h4>'));
    const grid = C.h('<div class="card-grid" style="grid-template-columns:repeat(4,1fr)"></div>');
    COLORS.forEach((col) => {
      const card = C.h(`<div class="card" draggable="true" data-tip="Add ${col} background"><div class="card-art" style="height:58px"><div class="element-art" style="background:${col};border:1px solid #fff2"></div></div></div>`);
      card.onclick = () => C.act('Add color', () => { const c = C.ops.addColor(col); C.select([c.id]); });
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-color', col));
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    panel.appendChild(C.h('<h4>Tips</h4>'));
    panel.appendChild(C.h('<p class="hint">Use a color clip as a background for titles, or put one on an upper track and lower its opacity for a tint. Scale it down in the Color tab to make shapes and bars.</p>'));
  }
})(window.C);
