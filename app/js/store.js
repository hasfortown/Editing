/* Cutroom — project store, undo/redo, diffs */
(function (C) {
  C.ASPECTS = {
    '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '4:3': [1440, 1080], '21:9': [2560, 1080],
  };
  const ENTITY = ['clips', 'tracks', 'media', 'markers'];

  C.UI = { playhead: 0, playing: false, pps: 80, tool: 'select', snap: true, ripple: false, loop: false, dragging: false, filePath: null, dirty: false, previewScale: 0.5 };
  C.selection = new Set();
  C.MR = {}; // media runtime (local only): {status, progress, thumbs, poster, peaks, localPath, el}

  C.defaultTransform = () => ({ x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, fit: 'contain', flipH: false, flipV: false });
  C.defaultFx = () => ({ brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, grayscale: 0, sepia: 0, vignette: 0, temperature: 0, invert: 0 });
  C.defaultText = () => ({
    content: 'Your text here', font: 'Segoe UI', size: 96, color: '#ffffff', bold: true, italic: false, align: 'center',
    strokeColor: '#000000', strokeWidth: 0, shadow: 0.4, bg: '#000000', bgOpacity: 0, lineHeight: 1.15, letterSpacing: 0, uppercase: false,
  });

  C.newProject = (name = 'Untitled project') => {
    const p = {
      id: C.uid('p_'), name, version: 2,
      settings: { aspect: '16:9', width: 1920, height: 1080, fps: 30, bg: '#000000' },
      tracks: {}, trackOrder: [], clips: {}, media: {}, markers: {}, range: null,
    };
    C.project = p;
    C.addTrack('video', null, true);
    C.addTrack('audio', null, true);
    C.history = { undo: [], redo: [] };
    C._txn = null;
    C.selection.clear();
    C.UI.filePath = null; C.UI.dirty = false; C.UI.playhead = 0;
    return p;
  };

  // ---------- accessors ----------
  C.P = () => C.project;
  C.tracks = () => C.project.trackOrder.map((id) => C.project.tracks[id]).filter(Boolean);
  C.getClip = (id) => C.project.clips[id];
  C.allClips = () => Object.values(C.project.clips);
  C.clipEnd = (c) => c.start + c.duration;
  C.clipsOn = (trackId) => C.allClips().filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  C.mediaOf = (c) => (c && c.mediaId ? C.project.media[c.mediaId] : null);
  C.mediaPath = (m) => (m ? (C.MR[m.id] && C.MR[m.id].localPath) || m.path : null);
  C.mediaUrl = (m) => { const mr = m && C.MR[m.id]; const p = mr && mr.proxyPath ? mr.proxyPath : C.mediaPath(m); return p ? window.native.mediaUrl(p) : ''; };
  C.duration = () => { let d = 0; for (const c of C.allClips()) d = Math.max(d, C.clipEnd(c)); return d; };
  C.isVisualTrack = (t) => t && t.type === 'video';
  C.trackAccepts = (t, kind) => t && (kind === 'audio' ? t.type === 'audio' : t.type === 'video');
  C.hasAudio = (c) => { if (c.kind === 'audio') return true; if (c.kind !== 'video') return false; const m = C.mediaOf(c); return !!(m && m.hasAudio) && !c.audioDetached; };
  C.fps = () => C.project.settings.fps || 30;
  C.frame = () => 1 / C.fps();
  C.snapTime = (t) => Math.round(t * C.fps()) / C.fps();

  C.addTrack = (type, index = null, silent = false) => {
    const p = C.project;
    const same = C.tracks().filter((t) => t.type === type).length;
    const id = C.uid('t_');
    p.tracks[id] = { id, type, name: (type === 'video' ? 'Video ' : 'Audio ') + (same + 1), muted: false, hidden: false, locked: false };
    if (index === null) {
      if (type === 'video') {
        const firstAudio = p.trackOrder.findIndex((tid) => p.tracks[tid] && p.tracks[tid].type === 'audio');
        // new video tracks go above existing video tracks
        const firstVideo = p.trackOrder.findIndex((tid) => p.tracks[tid] && p.tracks[tid].type === 'video');
        index = firstVideo >= 0 ? firstVideo : (firstAudio >= 0 ? firstAudio : p.trackOrder.length);
      } else index = p.trackOrder.length;
    }
    p.trackOrder.splice(index, 0, id);
    if (!silent) C.renumberTracks();
    return id;
  };
  C.renumberTracks = () => {
    // Video tracks numbered bottom-up (V1 is closest to audio), audio top-down.
    const ts = C.tracks();
    const vids = ts.filter((t) => t.type === 'video').reverse();
    vids.forEach((t, i) => { if (/^Video \d+$/.test(t.name)) t.name = 'Video ' + (i + 1); });
    ts.filter((t) => t.type === 'audio').forEach((t, i) => { if (/^Audio \d+$/.test(t.name)) t.name = 'Audio ' + (i + 1); });
  };
  C.removeTrack = (id) => {
    const p = C.project;
    for (const c of C.clipsOn(id)) delete p.clips[c.id];
    delete p.tracks[id];
    p.trackOrder = p.trackOrder.filter((t) => t !== id);
    if (!C.tracks().some((t) => t.type === 'video')) C.addTrack('video', 0, true);
    if (!C.tracks().some((t) => t.type === 'audio')) C.addTrack('audio', null, true);
  };

  C.overlaps = (trackId, start, end, exclude = new Set()) => C.clipsOn(trackId).some((c) => !exclude.has(c.id) && start < C.clipEnd(c) - 1e-4 && end > c.start + 1e-4);

  // Find a track of the right type with free space; otherwise create one.
  C.findSpace = (kind, start, dur, preferId = null, exclude = new Set()) => {
    const ts = C.tracks();
    const pref = preferId && C.project.tracks[preferId];
    if (pref && C.trackAccepts(pref, kind) && !pref.locked && !C.overlaps(pref.id, start, start + dur, exclude)) return pref.id;
    const cand = kind === 'audio' ? ts.filter((t) => t.type === 'audio') : ts.filter((t) => t.type === 'video').reverse();
    for (const t of cand) if (!t.locked && !C.overlaps(t.id, start, start + dur, exclude)) return t.id;
    const id = C.addTrack(kind === 'audio' ? 'audio' : 'video');
    C.renumberTracks();
    return id;
  };

  C.makeClip = (o) => {
    const c = Object.assign({
      id: C.uid('c_'), trackId: null, kind: 'video', mediaId: null, name: 'Clip', start: 0, duration: 5, in: 0, speed: 1,
      volume: 1, muted: false, fadeIn: 0, fadeOut: 0, transition: null, t: C.defaultTransform(), fx: C.defaultFx(),
      anim: { in: 'none', out: 'none', dur: 0.5 }, audioDetached: false,
      effects: [], kf: {}, blend: 'source-over', group: null, label: null,
    }, o);
    if (c.kind === 'text' && !c.text) c.text = C.defaultText();
    if (c.kind === 'color' && !c.color) c.color = '#2b2d42';
    if (c.kind === 'effect' && !c.name) c.name = 'Effect';
    return c;
  };

  C.maxDuration = (c) => {
    if (c.kind === 'video' || c.kind === 'audio') { const m = C.mediaOf(c); if (m && m.duration) return (m.duration - c.in) / c.speed; }
    return Infinity;
  };

  // ---------- selection ----------
  C.select = (ids, mode = 'set', expand = true) => {
    if (mode === 'set') C.selection.clear();
    if (expand && ids.length) ids = C.expandGroups(ids);
    if (ids.length) C.UI.anchor = ids[ids.length - 1];
    for (const id of ids) {
      if (mode === 'toggle' && C.selection.has(id)) C.selection.delete(id); else C.selection.add(id);
    }
    C.emit('select');
  };
  // groups: selecting one clip of a group selects all of it
  C.expandGroups = (ids) => {
    const out = new Set(ids);
    const groups = new Set([...out].map((id) => C.project.clips[id] && C.project.clips[id].group).filter(Boolean));
    if (groups.size) for (const c of Object.values(C.project.clips)) if (c.group && groups.has(c.group)) out.add(c.id);
    return [...out];
  };
  C.selectedClips = () => [...C.selection].map(C.getClip).filter(Boolean);
  C.primary = () => { const s = C.selectedClips(); return s.length ? s[s.length - 1] : null; };

  // ---------- diffs ----------
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  C.diff = (a, b) => {
    const d = {}; let any = false;
    for (const k of ENTITY) {
      const A = a[k] || {}, B = b[k] || {}, out = {};
      let n = false;
      for (const id in B) if (!A[id] || !same(A[id], B[id])) { out[id] = C.deep(B[id]); n = true; }
      for (const id in A) if (!B[id]) { out[id] = null; n = true; }
      if (n) { d[k] = out; any = true; }
    }
    if (!same(a.trackOrder, b.trackOrder)) { d.trackOrder = b.trackOrder.slice(); any = true; }
    if (!same(a.settings, b.settings)) { d.settings = C.deep(b.settings); any = true; }
    if (!same(a.range || null, b.range || null)) { d.range = b.range ? C.deep(b.range) : null; any = true; }
    if (a.name !== b.name) { d.name = b.name; any = true; }
    return any ? d : null;
  };
  C.applyDiff = (p, d) => {
    if (!d) return;
    for (const k of ENTITY) if (d[k]) for (const id in d[k]) { if (d[k][id] === null) delete p[k][id]; else p[k][id] = C.deep(d[k][id]); }
    if (d.trackOrder) {
      // keep only tracks that exist; append any tracks not in order
      const order = d.trackOrder.filter((id) => p.tracks[id]);
      for (const id in p.tracks) if (!order.includes(id)) order.push(id);
      p.trackOrder = order;
    } else if (d.tracks) {
      for (const id in d.tracks) if (d.tracks[id] && !p.trackOrder.includes(id)) p.trackOrder.push(id);
      p.trackOrder = p.trackOrder.filter((id) => p.tracks[id]);
    }
    // orphan clips -> drop
    for (const id in p.clips) if (!p.tracks[p.clips[id].trackId]) delete p.clips[id];
    if (d.settings) p.settings = C.deep(d.settings);
    if (d.range !== undefined) p.range = d.range ? C.deep(d.range) : null;
    if (d.name !== undefined) p.name = d.name;
  };
  // inverse of a diff relative to the state it was produced from
  C.invertDiff = (before, d) => {
    const inv = {};
    for (const k of ENTITY) if (d[k]) { inv[k] = {}; for (const id in d[k]) inv[k][id] = before[k][id] ? C.deep(before[k][id]) : null; }
    if (d.trackOrder) inv.trackOrder = before.trackOrder.slice();
    if (d.settings) inv.settings = C.deep(before.settings);
    if (d.range !== undefined) inv.range = before.range ? C.deep(before.range) : null;
    if (d.name !== undefined) inv.name = before.name;
    return inv;
  };

  // ---------- transactions ----------
  C.history = { undo: [], redo: [] };
  C.begin = () => { if (!C._txn) C._txn = C.deep(C.project); };
  C.live = () => { C.begin(); C.emit('change', { source: 'live' }); };
  C.commit = (label = 'Edit') => {
    if (!C._txn) { C.emit('change', { source: 'local' }); return; }
    const before = C._txn; C._txn = null;
    const d = C.diff(before, C.project);
    if (!d) { C.emit('change', { source: 'local' }); return; }
    C.history.undo.push({ label, redo: d, undo: C.invertDiff(before, d) });
    if (C.history.undo.length > 200) C.history.undo.shift();
    C.history.redo = [];
    C.markDirty();
    C.emit('change', { source: 'local', label });
  };
  C.cancel = () => { if (C._txn) { C.project = C._txn; C._txn = null; C.emit('change', { source: 'local' }); } };
  // Convenience: run fn as one undoable step
  C.act = (label, fn) => { C.begin(); const r = fn(); C.commit(label); return r; };

  C.undo = () => {
    if (C._txn) C.commit();
    const e = C.history.undo.pop(); if (!e) return;
    C.applyDiff(C.project, e.undo); C.history.redo.push(e);
    C.cleanSelection(); C.markDirty();
    C.emit('change', { source: 'undo' }); C.toast('Undo: ' + e.label, 'info', 1400);
  };
  C.redo = () => {
    const e = C.history.redo.pop(); if (!e) return;
    C.applyDiff(C.project, e.redo); C.history.undo.push(e);
    C.cleanSelection(); C.markDirty();
    C.emit('change', { source: 'undo' }); C.toast('Redo: ' + e.label, 'info', 1400);
  };
  C.cleanSelection = () => { for (const id of [...C.selection]) if (!C.project.clips[id]) C.selection.delete(id); };

  // remote diffs (collaboration) — keep open transaction base consistent
  C.applyRemote = (d) => {
    C.applyDiff(C.project, d);
    if (C._txn) C.applyDiff(C._txn, d);
    C.cleanSelection();
    C.markDirty(true);
    C.emit('change', { source: 'remote' });
  };

  // ---------- persistence ----------
  C.serialize = () => {
    const p = C.deep(C.project);
    for (const id in p.media) { const m = p.media[id]; m.path = C.mediaPath(C.project.media[id]) || m.path; }
    return JSON.stringify({ app: 'cutroom', version: 2, savedAt: new Date().toISOString(), project: p, ui: { pps: C.UI.pps, playhead: C.UI.playhead } }, null, 1);
  };
  C.loadProjectData = (text, filePath = null) => {
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!data || data.app !== 'cutroom' || !data.project) throw new Error('Not a Cutroom project file');
    const p = data.project;
    p.tracks = p.tracks || {}; p.trackOrder = p.trackOrder || Object.keys(p.tracks); p.clips = p.clips || {};
    p.media = p.media || {}; p.markers = p.markers || {}; p.settings = Object.assign({ aspect: '16:9', width: 1920, height: 1080, fps: 30, bg: '#000000' }, p.settings);
    for (const id in p.clips) {
      const c = p.clips[id];
      c.t = Object.assign(C.defaultTransform(), c.t); c.fx = Object.assign(C.defaultFx(), c.fx);
      c.anim = Object.assign({ in: 'none', out: 'none', dur: 0.5 }, c.anim);
      if (c.kind === 'text') c.text = Object.assign(C.defaultText(), c.text);
      c.effects = c.effects || []; c.kf = c.kf || {}; c.blend = c.blend || 'source-over';
    }
    C.project = p;
    C.history = { undo: [], redo: [] }; C._txn = null;
    C.selection.clear();
    C.UI.filePath = filePath; C.UI.dirty = false;
    if (data.ui) { C.UI.pps = data.ui.pps || C.UI.pps; C.UI.playhead = data.ui.playhead || 0; }
    for (const k in C.MR) delete C.MR[k];
    return p;
  };

  C.markDirty = (remote = false) => { C.UI.dirty = true; C.emit('dirty'); C.scheduleAutosave(); };
  C.scheduleAutosave = C.debounce(() => {
    const payload = JSON.stringify({ filePath: C.UI.filePath, dirty: C.UI.dirty, data: C.serialize() });
    window.native.autosaveSave(payload).catch(() => {});
  }, 900);
})(window.C);
