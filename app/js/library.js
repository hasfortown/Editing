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
    L.render();
  };

  L.render = () => {
    panel.innerHTML = '';
    ({ media: renderMedia, text: renderText, transitions: renderTransitions, filters: renderFilters, elements: renderElements })[current]();
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
    panel.appendChild(C.h('<h4>Presets</h4>'));
    const grid = C.h('<div class="card-grid"></div>');
    C.TEXT_PRESETS.forEach((p) => {
      const card = C.h(`<div class="card" draggable="true"><div class="card-art"><div class="text-preset" style="${p.css}">${C.esc(p.text.content.split('\n')[0])}</div></div><div class="card-label">${p.name}</div></div>`);
      card.onclick = () => C.act('Add text', () => { const c = C.ops.addText(p); C.select([c.id]); });
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-text', JSON.stringify(p)));
      grid.appendChild(card);
    });
    panel.appendChild(grid);
  }

  function renderTransitions() {
    panel.appendChild(C.h('<h3>Transitions</h3>'));
    panel.appendChild(C.h('<p class="hint" style="margin:-4px 2px 12px">Click to apply to the selected clip(s), or drag onto a clip. Transitions blend from the previous clip on the same track.</p>'));
    const grid = C.h('<div class="card-grid"></div>');
    C.TRANSITIONS.forEach((t) => {
      const card = C.h(`<div class="card" draggable="true"><div class="card-art"><div class="tr-art"><div class="tr-a"></div><div class="tr-b" style="animation-name:${t.anim}"></div></div></div><div class="card-label">${t.name}</div></div>`);
      card.onclick = () => {
        const sel = C.selectedClips().filter((c) => c.kind !== 'audio');
        if (!sel.length) { C.toast('Select a clip first, or drag the transition onto a clip', 'info'); return; }
        C.act('Add transition', () => C.ops.setTransition(sel, t.id));
        C.toast(`${t.name} added`, 'ok', 1400);
      };
      card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-transition', t.id));
      grid.appendChild(card);
    });
    panel.appendChild(grid);
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

  function renderElements() {
    panel.appendChild(C.h('<h3>Elements</h3>'));
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
