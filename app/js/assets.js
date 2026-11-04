/* Cutroom — Asset library: save clips, titles, images, sounds and animations once, reuse them in any project */
(function (C) {
  const N = window.native;
  const AS = (C.assets = { list: [], loaded: false });
  const TYPES = [['all', 'All'], ['clips', 'Clips & titles'], ['image', 'Images'], ['video', 'Video'], ['audio', 'Audio']];
  let filter = 'all', query = '';

  AS.load = async () => { try { AS.list = (await N.assetsLoad()) || []; } catch (_) { AS.list = []; } AS.loaded = true; C.emit('assets'); return AS.list; };
  const persist = async () => { await N.assetsSave(AS.list); C.emit('assets'); };

  // ---------- thumbnails ----------
  const cv = (w = 240, h = 135) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const fit = (x, img, w, h, cover = true) => { const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height; if (!iw || !ih) return; const k = cover ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih); x.drawImage(img, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k); };
  const checker = (x, w, h) => { x.fillStyle = '#1c1e25'; x.fillRect(0, 0, w, h); x.fillStyle = '#262933'; for (let j = 0; j < h; j += 12) for (let i = (j / 12) % 2 ? 12 : 0; i < w; i += 24) x.fillRect(i, j, 12, 12); };
  async function thumbOfFile(p, kind) {
    const c = cv(); const x = c.getContext('2d'); x.fillStyle = '#111318'; x.fillRect(0, 0, c.width, c.height);
    try {
      if (kind === 'image') { const img = await new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = N.mediaUrl(p); }); if (img) { checker(x, c.width, c.height); fit(x, img, c.width, c.height, false); } }
      else if (kind === 'video') { const v = document.createElement('video'); v.muted = true; v.crossOrigin = 'anonymous'; v.src = N.mediaUrl(p); await new Promise((res) => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 6000); }); try { v.currentTime = Math.min(1, (v.duration || 2) / 3); await new Promise((res) => { v.onseeked = res; setTimeout(res, 3000); }); } catch (_) {} fit(x, v, c.width, c.height); }
      else { const g = x.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, '#2a1b55'); g.addColorStop(1, '#0d6e6a'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i < 60; i++) { const h = (Math.sin(i * 1.7) * 0.5 + 0.5) * (Math.sin(i * 0.31) * 0.5 + 0.6) * 46; x.moveTo(20 + i * 3.4, 68 - h / 2); x.lineTo(20 + i * 3.4, 68 + h / 2); } x.stroke(); }
    } catch (_) {}
    return c.toDataURL('image/jpeg', 0.78);
  }
  function thumbOfClips(clips) {
    const c = cv(); const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    const t = Math.min(...clips.map((k) => k.start)) + Math.min(...clips.map((k) => k.duration)) * 0.5;
    try {
      C.renderFrame(x, t, c.width, c.height, (k) => { const m = C.mediaOf(k); const r = m && C.MR[m.id]; return r && ((r.thumbs && r.thumbs[0] && r.thumbs[0].img) || r.img || r.el) || null; });
    } catch (_) {}
    return c.toDataURL('image/jpeg', 0.78);
  }

  // ---------- saving ----------
  AS.addFiles = async (paths) => {
    if (!paths) paths = await N.fileOpenDialog({ title: 'Add files to your asset library', multi: true, exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'mp4', 'mov', 'webm', 'mkv', 'm4v', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'], extName: 'Media' });
    if (!paths || !paths.length) return;
    let n = 0;
    for (const p of paths) {
      const kind = C.kindOfPath(p); if (!kind) continue;
      const dst = await N.assetsCopyIn(p);
      AS.list.unshift({ id: C.uid('a_'), type: kind, name: C.baseName(p).replace(/\.[^.]+$/, ''), path: dst, thumb: await thumbOfFile(dst, kind), created: Date.now() });
      n++;
    }
    await persist(); if (n) C.toast(`Saved ${n} asset${n > 1 ? 's' : ''} to your library`, 'ok', 1800);
  };
  AS.saveImage = async (canvas, name = 'Image', from = 'photo') => {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const dst = await N.assetsWriteFile(name + '.png', await blob.arrayBuffer());
    AS.list.unshift({ id: C.uid('a_'), type: 'image', name, path: dst, thumb: await thumbOfFile(dst, 'image'), created: Date.now(), from });
    await persist(); C.toast(`“${name}” saved to Assets`, 'ok', 1800);
  };
  AS.saveClips = async (clips) => {
    clips = (clips || C.selectedClips()).filter(Boolean);
    if (!clips.length) return C.toast('Select clips, text or stickers on the timeline first', 'info');
    const name = await C.prompt('Save to asset library', 'Name', clips.length === 1 ? (clips[0].kind === 'text' ? (clips[0].text.content || 'Title').slice(0, 30) : clips[0].name) : `${clips.length} clips`, 'Save');
    if (name == null) return;
    const t0 = Math.min(...clips.map((c) => c.start));
    const media = {};
    for (const c of clips) {
      const m = c.mediaId && C.project.media[c.mediaId]; if (!m || media[m.id]) continue;
      const p = C.mediaPath(m); if (!p || !(await N.exists(p))) continue;
      media[m.id] = { name: m.name, kind: m.kind, path: await N.assetsCopyIn(p) };
    }
    const tracks = C.tracks().map((t) => t.id);
    const data = clips.map((c) => Object.assign(C.deep(c), { start: c.start - t0, _trackOrder: tracks.indexOf(c.trackId) }));
    AS.list.unshift({ id: C.uid('a_'), type: 'clips', name: name || 'Clips', clips: data, media, thumb: thumbOfClips(clips), created: Date.now(), dur: Math.max(...clips.map((c) => C.clipEnd(c))) - t0 });
    await persist(); C.toast(`“${name}” saved to Assets — use it in any project`, 'ok', 2200);
  };

  // ---------- using ----------
  AS.insert = async (a, at = C.UI.playhead) => {
    if (C.mode === 'photo') return AS.toPhoto(a);
    if (C.mode === 'anim') return C.anim && C.anim.insertAsset(a);
    if (a.type === 'clips') {
      const map = {};
      for (const [oldId, m] of Object.entries(a.media || {})) {
        if (!(await N.exists(m.path))) { C.toast(`Missing file for “${m.name}”`, 'err'); continue; }
        await C.importPaths([m.path]);
        const nm = Object.values(C.project.media).find((x) => C.mediaPath(x) === m.path); if (nm) map[oldId] = nm.id;
      }
      const prev = C.ops.clipboard; const ph = C.UI.playhead; C.UI.playhead = at;
      C.ops.clipboard = a.clips.map((c) => { const d = C.deep(c); delete d._trackOrder; if (d.mediaId) d.mediaId = map[d.mediaId] || d.mediaId; return d; }).sort((x, y) => (y._trackOrder ?? 0) - (x._trackOrder ?? 0));
      C.ops.paste(); C.ops.clipboard = prev; C.UI.playhead = ph;
      C.toast(`Added “${a.name}”`, 'ok', 1200); return;
    }
    if (!(await N.exists(a.path))) return C.toast('That asset file is missing', 'err');
    await C.importPaths([a.path], { addToTimeline: true, at });
    C.toast(`Added “${a.name}”`, 'ok', 1200);
  };
  AS.toPhoto = async (a) => {
    const P = C.photo; if (a.type !== 'image') return C.toast('Only image assets can be placed in the photo editor', 'info');
    const img = await new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = N.mediaUrl(a.path); });
    if (!img) return C.toast('Could not load that image', 'err');
    if (!P.doc) { P.newDoc(img.naturalWidth, img.naturalHeight, null, a.name); }
    P.act('Place asset', () => P.addImageLayer(img, a.name)); C.photoUI.fit && C.photoUI.redraw(); C.photoPanels.renderAll();
  };
  AS.remove = async (a) => { if (!(await C.confirm('Delete asset', `Delete “${a.name}” from your asset library? This can't be undone.`, 'Delete', true))) return; AS.list = AS.list.filter((x) => x.id !== a.id); if (a.path) N.assetsRemove(a.path); for (const m of Object.values(a.media || {})) if (!AS.list.some((x) => Object.values(x.media || {}).some((y) => y.path === m.path) || x.path === m.path)) N.assetsRemove(m.path); await persist(); };
  AS.rename = async (a) => { const v = await C.prompt('Rename asset', 'Name', a.name, 'Rename'); if (v) { a.name = v; await persist(); } };

  // ---------- panel (video editor library rail) ----------
  AS.render = (panel) => {
    if (!AS.loaded) { AS.load().then(() => C.library.render && C.library.render()); }
    panel.appendChild(C.h(`<h3>Assets <small class="muted" style="font-weight:500;font-size:12px">${AS.list.length}</small></h3>`));
    panel.appendChild(C.h('<p class="hint" style="margin:-4px 2px 10px">Your personal library — saved here once, available in every project, the photo editor and the animation maker.</p>'));
    const acts = C.h(`<div class="asset-acts"><button class="btn primary">${C.icon('save')}<span>Save selected clips</span></button><button class="btn">${C.icon('import')}<span>Add files…</span></button><button class="icon-btn" data-tip="Open assets folder">${C.icon('folder')}</button></div>`);
    const [b1, b2, b3] = acts.querySelectorAll('button'); b1.onclick = () => AS.saveClips(); b2.onclick = () => AS.addFiles(); b3.onclick = () => N.assetsReveal();
    panel.appendChild(acts);
    const q = C.h(`<input class="text-input" placeholder="Search assets…" value="${C.esc(query)}" style="margin:8px 0 6px">`);
    q.addEventListener('input', C.debounce(() => { query = q.value; C.library.render(); const n = panel.querySelector('input'); if (n) { n.focus(); n.selectionStart = n.value.length; } }, 200));
    q.addEventListener('keydown', (e) => e.stopPropagation()); panel.appendChild(q);
    const chips = C.h(`<div class="chips" style="margin-bottom:10px">${TYPES.map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>`);
    chips.querySelectorAll('button').forEach((b) => (b.onclick = () => { filter = b.dataset.k; C.library.render(); })); panel.appendChild(chips);
    const list = AS.list.filter((a) => (filter === 'all' || a.type === filter) && (!query || a.name.toLowerCase().includes(query.toLowerCase())));
    if (!list.length) { panel.appendChild(C.h(`<div class="asset-empty">${C.icon('layers')}<b>${AS.list.length ? 'No matches' : 'Your library is empty'}</b><span class="hint">${AS.list.length ? 'Try a different search or filter.' : 'Select clips, titles or stickers and press <b>Save selected clips</b>, right-click a clip → <b>Save to assets</b>, or add files. In the photo editor use Layer → Save layer to assets.'}</span></div>`)); return; }
    const g = C.h('<div class="card-grid asset-grid"></div>');
    list.forEach((a) => g.appendChild(AS.card(a)));
    panel.appendChild(g);
  };
  const BADGE = { clips: 'CLIPS', image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO' };
  AS.card = (a, onPick) => {
    const card = C.h(`<div class="card asset-card" draggable="true"><div class="card-art"><img src="${a.thumb || ''}" alt=""><span class="asset-badge t-${a.type}">${BADGE[a.type] || a.type}</span>${a.dur ? `<span class="asset-dur">${C.fmtDur(a.dur)}</span>` : ''}</div><div class="card-label">${C.esc(a.name)}</div></div>`);
    card.onclick = () => (onPick ? onPick(a) : AS.insert(a));
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); C.menu(e.clientX, e.clientY, [{ label: 'Insert at playhead', icon: 'plus', action: () => AS.insert(a) }, { label: 'Rename…', icon: 'text', action: () => AS.rename(a) }, { label: 'Show in folder', icon: 'folder', disabled: !a.path, action: () => N.showItem(a.path) }, '-', { label: 'Delete from library', icon: 'trash', action: () => AS.remove(a) }]); });
    card.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-cutroom-asset', a.id));
    return card;
  };
  // picker modal (photo editor / animation maker)
  AS.pick = async (types, title = 'Insert from assets') => {
    if (!AS.loaded) await AS.load();
    return new Promise((res) => {
      const list = AS.list.filter((a) => !types || types.includes(a.type));
      const { el, close } = C.modal(`<div class="modal-head"><h2>${C.icon('layers')} ${C.esc(title)}</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div><div class="modal-body"><div class="card-grid asset-grid wide"></div>${list.length ? '' : '<p class="hint">No matching assets yet. Save images from the photo editor (Layer → Save layer to assets) or add files in the video editor\'s Assets panel.</p>'}</div>`, { cls: 'wide', onClose: () => res(null) });
      const g = el.querySelector('.asset-grid'); list.forEach((a) => g.appendChild(AS.card(a, (x) => { res(x); close(); })));
    });
  };

  // drop an asset card onto the timeline / player
  AS.init = () => {
    AS.load();
    const drop = (e) => { const id = e.dataTransfer && e.dataTransfer.getData('application/x-cutroom-asset'); if (!id) return; e.preventDefault(); e.stopPropagation(); const a = AS.list.find((x) => x.id === id); if (!a) return; let at = C.UI.playhead; const tl = C.$('#tracks') || C.$('.tracks'); if (tl && tl.contains(e.target)) { const r = tl.getBoundingClientRect(); at = Math.max(0, (e.clientX - r.left + tl.scrollLeft) / C.UI.pps); } AS.insert(a, C.snapTime(at)); };
    document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('application/x-cutroom-asset')) e.preventDefault(); }, true);
    document.addEventListener('drop', drop, true);
  };
})(window.C);
