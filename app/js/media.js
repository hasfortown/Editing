/* Cutroom — media import, probing, proxies, thumbnails, waveforms */
(function (C) {
  const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mts', 'm2ts', 'ts', '3gp', 'mpg', 'mpeg', 'ogv'];
  const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma', 'aif', 'aiff'];
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
  C.extOf = (p) => (String(p).split(/[\\/]/).pop().split('.').pop() || '').toLowerCase();
  C.baseName = (p) => String(p).split(/[\\/]/).pop();
  C.kindOfPath = (p) => {
    const e = C.extOf(p);
    if (VIDEO_EXT.includes(e)) return 'video';
    if (AUDIO_EXT.includes(e)) return 'audio';
    if (IMAGE_EXT.includes(e)) return 'image';
    return null;
  };

  const mr = (id) => (C.MR[id] = C.MR[id] || { status: 'loading', progress: 0 });
  C.mr = mr;

  window.native && window.native.onProxyProgress((id, v) => {
    const r = C.MR[id]; if (!r) return; r.progress = v; C.emit('mediaProgress', id);
  });

  C.importPaths = async (paths, opts = {}) => {
    const added = [];
    const bad = [];
    C.begin();
    for (const p of paths) {
      const kind = C.kindOfPath(p);
      if (!kind) { bad.push(C.baseName(p)); continue; }
      const existing = Object.values(C.project.media).find((m) => C.mediaPath(m) === p);
      if (existing) { added.push(existing); continue; }
      const m = { id: C.uid('m_'), name: C.baseName(p), kind, path: p, ext: C.extOf(p), duration: kind === 'image' ? 0 : 0, width: 0, height: 0, hasAudio: kind === 'audio', hasVideo: kind !== 'audio', size: 0, addedAt: Date.now() };
      C.project.media[m.id] = m;
      C.localImports && C.localImports.add(m.id);
      added.push(m);
    }
    C.commit('Import media');
    if (bad.length) C.toast(`Unsupported file${bad.length > 1 ? 's' : ''}: ${bad.slice(0, 3).join(', ')}`, 'err');
    C.emit('media');
    const results = await Promise.all(added.map((m) => C.prepareMedia(m)));
    if (opts.addToTimeline) {
      let t = opts.at ?? C.UI.playhead;
      C.act('Add to timeline', () => {
        for (const m of added) { if (C.MR[m.id] && C.MR[m.id].status === 'ready') { const c = C.addMediaClip(m.id, t, opts.trackId); t = C.clipEnd(c); } }
      });
    }
    return results;
  };

  const loadEl = (tag, url, timeout = 15000) => new Promise((res) => {
    const el = document.createElement(tag);
    el.preload = 'auto'; el.muted = true; el.crossOrigin = 'anonymous';
    let done = false;
    const fin = (ok) => { if (done) return; done = true; clearTimeout(to); res(ok ? el : null); };
    const to = setTimeout(() => fin(false), timeout);
    el.addEventListener('loadeddata', () => fin(tag === 'audio' || el.videoWidth > 0));
    el.addEventListener('error', () => fin(false));
    el.src = url;
    if (tag === 'audio') el.addEventListener('loadedmetadata', () => fin(true));
  });
  const loadImg = (url) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });

  C.prepareMedia = async (m) => {
    const r = mr(m.id);
    r.status = 'loading'; r.progress = 0; C.emit('mediaProgress', m.id);
    try {
      let p = C.mediaPath(m);
      if (!p || !(await window.native.exists(p))) {
        if (C.collab && C.collab.canFetch() && !C.localImports.has(m.id)) {
          r.status = 'downloading'; C.emit('mediaProgress', m.id);
          p = await C.collab.fetchMedia(m, (v) => { r.progress = v; C.emit('mediaProgress', m.id); });
          if (!p) throw new Error('Download failed');
          r.localPath = p;
        } else { r.status = 'missing'; C.emit('mediaProgress', m.id); C.emit('media'); return false; }
      }
      const info = await window.native.probe(p);
      const meta = {};
      meta.size = info.size;
      if (m.kind === 'video' && !info.hasVideo && info.hasAudio) meta.kind = 'audio';
      if (info.duration) meta.duration = info.duration;
      if (info.width) { meta.width = info.width; meta.height = info.height; }
      meta.hasAudio = info.hasAudio;
      meta.hasVideo = info.hasVideo;
      if (info.fps) meta.fps = info.fps;
      const kind = meta.kind || m.kind;

      if (kind === 'image') {
        const img = await loadImg(window.native.mediaUrl(p));
        if (!img) throw new Error('Could not read image');
        r.img = img; meta.width = img.naturalWidth; meta.height = img.naturalHeight; meta.duration = 0;
        r.thumbs = [{ t: 0, img }];
      } else {
        let el = await loadEl(kind === 'video' ? 'video' : 'audio', window.native.mediaUrl(p));
        if (!el) {
          r.status = 'proxying'; r.progress = 0; C.emit('mediaProgress', m.id);
          const pr = await window.native.proxy(p, m.id);
          if (!pr.ok) throw new Error('This format could not be converted');
          r.proxyPath = pr.path;
          el = await loadEl(kind === 'video' ? 'video' : 'audio', window.native.mediaUrl(pr.path), 30000);
          if (!el) throw new Error('Could not decode media');
        }
        if (!meta.duration || !isFinite(meta.duration)) meta.duration = el.duration;
        if (kind === 'video') { meta.width = el.videoWidth || meta.width; meta.height = el.videoHeight || meta.height; }
        if (kind === 'video') { r.status = 'thumbs'; C.emit('mediaProgress', m.id); await makeThumbs(m.id, el, meta.duration); }
        el.removeAttribute('src'); el.load();
      }
      // apply meta without polluting undo history
      Object.assign(C.project.media[m.id] || m, meta);
      if (C._txn && C._txn.media[m.id]) Object.assign(C._txn.media[m.id], meta);
      r.status = 'ready'; r.progress = 1;
      C.emit('mediaProgress', m.id); C.emit('media'); C.emit('change', { source: 'meta' });
      if (meta.hasAudio) {
        window.native.waveform(p).then((peaks) => { if (peaks) { r.peaks = peaks; C.emit('waveform', m.id); } });
      }
      return true;
    } catch (e) {
      console.error(e);
      r.status = 'error'; r.error = e.message; C.emit('mediaProgress', m.id); C.emit('media');
      C.toast(`${m.name}: ${e.message}`, 'err', 5000);
      return false;
    }
  };

  const seekTo = (el, t) => new Promise((res) => {
    const to = setTimeout(res, 3000);
    el.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true });
    el.currentTime = t;
  });

  async function makeThumbs(id, el, dur) {
    const r = mr(id);
    const n = C.clamp(Math.round(dur / 2), 6, 40);
    const H = 90, W = Math.round(H * (el.videoWidth / el.videoHeight || 16 / 9));
    r.thumbs = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.05, (i + 0.5) * (dur / n));
      await seekTo(el, Math.max(0, t));
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cv.getContext('2d').drawImage(el, 0, 0, W, H);
      r.thumbs.push({ t, img: cv });
      if (i === 0) C.emit('mediaProgress', id);
    }
  }

  C.thumbAt = (mediaId, t) => {
    const r = C.MR[mediaId]; if (!r || !r.thumbs || !r.thumbs.length) return null;
    let best = r.thumbs[0], bd = Infinity;
    for (const th of r.thumbs) { const d = Math.abs(th.t - t); if (d < bd) { bd = d; best = th; } }
    return best.img;
  };

  C.addMediaClip = (mediaId, start, trackId = null) => {
    const m = C.project.media[mediaId]; if (!m) return null;
    const kind = m.kind;
    const dur = kind === 'image' ? 5 : Math.max(C.frame(), m.duration || 5);
    const tid = C.findSpace(kind, start, dur, trackId);
    const c = C.makeClip({ trackId: tid, kind, mediaId, name: m.name.replace(/\.[^.]+$/, ''), start, duration: dur });
    C.project.clips[c.id] = c;
    // If first visual clip, adopt orientation hint
    return c;
  };

  C.relinkMedia = async (m) => {
    const paths = await window.native.openMedia();
    if (!paths.length) return;
    C.act('Relink media', () => { C.project.media[m.id].path = paths[0]; });
    delete C.MR[m.id];
    await C.prepareMedia(C.project.media[m.id]);
  };

  C.removeMedia = async (id) => {
    const used = C.allClips().filter((c) => c.mediaId === id).length;
    if (used && !(await C.confirm('Remove media?', `This media is used by ${used} clip${used > 1 ? 's' : ''} on the timeline. They will be removed too.`, 'Remove', true))) return;
    C.act('Remove media', () => {
      for (const c of C.allClips()) if (c.mediaId === id) delete C.project.clips[c.id];
      delete C.project.media[id];
    });
    delete C.MR[id];
    C.cleanSelection();
    C.emit('media');
  };
})(window.C);
