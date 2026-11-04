/* Cutroom — timeline UI and editing operations */
(function (C) {
  const HEAD = 168;
  const T = (C.tl = {});
  let scroll, inner, tracksEl, ruler, rctx, phEl, snapEl, marqEl, pending = false;

  const ppsFromSlider = (v) => 2 * Math.pow(600 / 2, v / 1000);
  const sliderFromPps = (p) => (Math.log(p / 2) / Math.log(300)) * 1000;

  T.init = () => {
    scroll = C.$('#tlScroll'); inner = C.$('#tlInner'); tracksEl = C.$('#tlTracks');
    ruler = C.$('#tlRuler'); rctx = ruler.getContext('2d'); phEl = C.$('#tlPlayhead'); snapEl = C.$('#tlSnapline'); marqEl = C.$('#tlMarquee');
    C.$('#tlCorner').innerHTML = `<button class="icon-btn" id="tlAddV" data-tip="Add video track">${C.icon('video')}</button><button class="icon-btn" id="tlAddA" data-tip="Add audio track">${C.icon('audio')}</button><span style="flex:1"></span><span class="muted" style="font-size:11px" id="tlClipCount"></span>`;
    C.$('#tlAddV').onclick = () => C.act('Add track', () => { C.addTrack('video'); C.renumberTracks(); });
    C.$('#tlAddA').onclick = () => C.act('Add track', () => { C.addTrack('audio'); C.renumberTracks(); });

    scroll.addEventListener('scroll', () => { drawRuler(); });
    new ResizeObserver(() => { T.render(); }).observe(scroll);
    scroll.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        const t = T.timeAt(e.clientX);
        const before = e.clientX - scroll.getBoundingClientRect().left;
        T.setZoom(C.UI.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
        scroll.scrollLeft = HEAD + t * C.UI.pps - before;
      }
    }, { passive: false });

    const zr = C.$('#tlZoom');
    zr.value = sliderFromPps(C.UI.pps); C.setRangeFill(zr);
    zr.addEventListener('input', () => T.setZoom(ppsFromSlider(+zr.value), true));
    C.$('#tlZoomIn').onclick = () => T.setZoom(C.UI.pps * 1.4);
    C.$('#tlZoomOut').onclick = () => T.setZoom(C.UI.pps / 1.4);
    C.$('#tlFit').onclick = () => T.fit();

    ruler.addEventListener('pointerdown', (e) => scrubStart(e));
    phEl.querySelector('.ph-head').addEventListener('pointerdown', (e) => scrubStart(e));
    tracksEl.addEventListener('pointerdown', onPointerDown);
    tracksEl.addEventListener('contextmenu', onContext);
    tracksEl.addEventListener('dblclick', (e) => {
      const ce = e.target.closest('.clip'); if (!ce) return;
      C.emit('inspectTab', null);
    });
    // drag from library
    tracksEl.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].some((t) => t.startsWith('application/x-cutroom'))) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      C.$$('.track.drop-target').forEach((x) => x.classList.remove('drop-target'));
      const row = e.target.closest('.track'); if (row) row.classList.add('drop-target');
    });
    tracksEl.addEventListener('dragleave', (e) => { if (!tracksEl.contains(e.relatedTarget)) C.$$('.track.drop-target').forEach((x) => x.classList.remove('drop-target')); });
    tracksEl.addEventListener('drop', onLibraryDrop);

    C.on('change', () => T.render());
    C.on('select', () => T.paintSelection());
    C.on('time', () => { T.updatePlayhead(); if (C.UI.playing) T.follow(); });
    C.on('waveform', () => T.render());
    C.on('mediaProgress', C.debounce(() => T.render(), 120));
    C.on('peers', () => T.renderPeers());
  };

  T.setZoom = (pps, fromSlider = false) => {
    const center = T.timeAt(scroll.getBoundingClientRect().left + HEAD + (scroll.clientWidth - HEAD) / 2);
    C.UI.pps = C.clamp(pps, 2, 600);
    if (!fromSlider) { const zr = C.$('#tlZoom'); zr.value = sliderFromPps(C.UI.pps); C.setRangeFill(zr); }
    T.render();
    scroll.scrollLeft = Math.max(0, HEAD + center * C.UI.pps - HEAD - (scroll.clientWidth - HEAD) / 2);
  };
  T.fit = () => {
    const d = Math.max(5, C.duration());
    T.setZoom((scroll.clientWidth - HEAD - 60) / d);
    scroll.scrollLeft = 0;
  };
  T.timeAt = (clientX) => Math.max(0, (clientX - inner.getBoundingClientRect().left - HEAD) / C.UI.pps);
  T.follow = () => {
    const x = HEAD + C.UI.playhead * C.UI.pps;
    const l = scroll.scrollLeft + HEAD, r = scroll.scrollLeft + scroll.clientWidth - 40;
    if (x > r || x < l) scroll.scrollLeft = x - HEAD - 40;
  };

  // ---------- render ----------
  T.render = () => {
    if (!tracksEl) return;
    if (C.UI.dragging) { pending = true; return; }
    pending = false;
    const pps = C.UI.pps;
    const dur = C.duration();
    const contentW = Math.max((dur + 30) * pps, scroll.clientWidth - HEAD + 300);
    inner.style.width = HEAD + contentW + 'px';
    const frag = document.createDocumentFragment();
    for (const tr of C.tracks()) {
      const row = C.h(`<div class="track ${tr.type} ${tr.locked ? 'locked' : ''} ${tr.hidden ? 'hidden-track' : ''} h-${tr.h || 'normal'}" data-track="${tr.id}">
        <div class="track-head">
          <div class="track-name" data-tip="Drag to reorder · double-click to rename">${C.icon(tr.type === 'video' ? 'film' : 'music')}<span>${C.esc(tr.name)}</span></div>
          ${tr.type === 'video' ? `<button class="icon-btn ${tr.hidden ? 'off' : ''}" data-act="hide" data-tip="${tr.hidden ? 'Show' : 'Hide'} track">${C.icon(tr.hidden ? 'eyeOff' : 'eye')}</button>` : ''}
          <button class="icon-btn ${tr.muted ? 'off' : ''}" data-act="mute" data-tip="${tr.muted ? 'Unmute' : 'Mute'} track audio">${C.icon(tr.muted ? 'volumeOff' : 'volume')}</button>
          <button class="icon-btn ${tr.locked ? 'off' : ''}" data-act="lock" data-tip="${tr.locked ? 'Unlock' : 'Lock'} track">${C.icon(tr.locked ? 'lock' : 'unlock')}</button>
        </div>
        <div class="track-lane"></div></div>`);
      const lane = row.querySelector('.track-lane');
      for (const c of C.clipsOn(tr.id)) lane.appendChild(clipEl(c, tr));
      frag.appendChild(row);
    }
    tracksEl.innerHTML = '';
    tracksEl.appendChild(frag);
    if (!C.allClips().length) tracksEl.appendChild(C.h(`<div class="tl-empty">${C.icon('upload')}<span>Drag media here or press <span class="kbd">Ctrl</span>+<span class="kbd">I</span> to import, then drop clips onto the timeline</span></div>`));
    tracksEl.querySelectorAll('.track-head [data-act]').forEach((b) => b.addEventListener('click', onTrackBtn));
    tracksEl.querySelectorAll('.track-head').forEach((h) => h.addEventListener('contextmenu', onTrackContext));
    tracksEl.querySelectorAll('.track-name').forEach((n) => { n.addEventListener('pointerdown', trackDrag); n.addEventListener('dblclick', async () => { const tr = C.project.tracks[n.closest('.track').dataset.track]; const v = await C.prompt('Rename track', 'Name', tr.name); if (v) C.act('Rename track', () => { tr.name = v; }); }); });
    T.renderRange(); T.renderRec();
    tracksEl.querySelectorAll('.clip').forEach(drawClipCanvases);
    C.$('#tlClipCount').textContent = '';
    T.updatePlayhead(); drawRuler(); T.renderMarkers(); T.renderPeers();
  };

  function clipEl(c, tr) {
    const pps = C.UI.pps;
    const w = Math.max(2, c.duration * pps);
    const m = C.mediaOf(c);
    const r = m && C.MR[m.id];
    const sel = C.selection.has(c.id);
    const label = c.kind === 'text' ? (c.text.content.split('\n')[0] || 'Text') : c.name;
    const icon = { video: 'film', image: 'image', audio: 'music', text: c.sticker ? 'smile' : 'text', color: 'square', effect: 'sparkles' }[c.kind];
    const status = r && r.status !== 'ready' ? `<span class="tag">${r.status === 'missing' ? 'MISSING' : r.status === 'error' ? 'ERROR' : '…'}</span>` : '';
    const el = C.h(`<div class="clip kind-${c.kind} ${sel ? 'selected' : ''} ${c.muted ? 'muted-clip' : ''}" data-clip="${c.id}" style="left:${c.start * pps}px;width:${w}px">
      ${c.label ? `<div class="label-bar" style="background:${c.label}"></div>` : ''}
      <div class="clip-label">${C.icon(icon)}<span>${C.esc(label)}</span>${status}${c.freeze ? '<span class="tag">FREEZE</span>' : ''}${c.group ? `<span class="tag" title="Grouped">${C.icon('link')}</span>` : ''}${c.effects && c.effects.length && c.kind !== 'effect' ? `<span class="tag" title="${c.effects.length} effect(s)">fx</span>` : ''}${c.blend && c.blend !== 'source-over' ? '<span class="tag">BLEND</span>' : ''}</div>
      ${c.speed !== 1 ? `<span class="speed-tag">${+c.speed.toFixed(2)}×</span>` : ''}
      <div class="trim l"></div><div class="trim r"></div></div>`);
    el.querySelectorAll('.clip-label svg').forEach((sv) => { sv.style.cssText = 'width:12px;height:12px;flex:none'; });
    if (C.kf.any(c)) {
      const ts = C.kf.times(c);
      el.insertAdjacentHTML('beforeend', `<div class="kf-row">${ts.map((kt) => `<span class="kf-d" data-kt="${kt}" style="left:${kt * pps}px" data-tip="Keyframe · drag to move"></span>`).join('')}</div>`);
    }
    // fades
    const fi = c.fadeIn * pps, fo = c.fadeOut * pps;
    el.insertAdjacentHTML('beforeend', `<svg class="fade-svg" preserveAspectRatio="none" viewBox="0 0 ${w} 100" width="100%" height="100%">
      ${fi > 0 ? `<polygon points="0,0 ${fi},0 0,100" fill="rgba(0,0,0,.45)"/><line x1="0" y1="100" x2="${fi}" y2="0" stroke="rgba(255,255,255,.7)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>` : ''}
      ${fo > 0 ? `<polygon points="${w - fo},0 ${w},0 ${w},100" fill="rgba(0,0,0,.45)"/><line x1="${w - fo}" y1="0" x2="${w}" y2="100" stroke="rgba(255,255,255,.7)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>` : ''}
    </svg>`);
    if (w > 40) {
      el.insertAdjacentHTML('beforeend', `<div class="fade-h" data-fade="in" style="left:${Math.max(5, fi)}px" data-tip="Fade in"></div><div class="fade-h" data-fade="out" style="left:${Math.min(w - 5, w - fo)}px" data-tip="Fade out"></div>`);
    }
    if (c.transition) {
      const tw = Math.max(16, C.trDur(c) * pps);
      el.insertAdjacentHTML('beforeend', `<div class="tr-badge" style="width:${tw}px" data-tip="${C.esc((C.TRANSITIONS.find((x) => x.id === c.transition.type) || {}).name || 'Transition')} · ${c.transition.duration.toFixed(2)}s">${C.icon('transition')}</div>`);
    }
    return el;
  }

  function drawClipCanvases(el) {
    const c = C.getClip(el.dataset.clip); if (!c) return;
    const pps = C.UI.pps;
    const H = el.clientHeight || 44;
    const W = Math.min(16000, Math.max(2, Math.round(c.duration * pps)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const m = C.mediaOf(c); const r = m && C.MR[m.id];
    const hasWave = C.hasAudio(c) && r && r.peaks;
    const stripH = c.kind === 'audio' ? 0 : c.kind === 'video' && C.hasAudio(c) ? Math.round(H * 0.64) : H;
    if (stripH > 0 && (c.kind === 'video' || c.kind === 'image') && r && r.thumbs && r.thumbs.length) {
      const cv = document.createElement('canvas'); cv.className = 'strip';
      cv.width = W * dpr; cv.height = stripH * dpr; cv.style.width = W + 'px'; cv.style.height = stripH + 'px';
      const x = cv.getContext('2d'); x.scale(dpr, dpr);
      const img0 = r.thumbs[0].img;
      const aspect = (img0.width || img0.naturalWidth) / (img0.height || img0.naturalHeight) || 16 / 9;
      const tw = stripH * aspect;
      x.globalAlpha = 0.92;
      for (let px = 0; px < W; px += tw) {
        const st = c.kind === 'video' ? (c.freeze ? c.in : c.in + ((px + tw / 2) / pps) * c.speed) : 0;
        const img = c.kind === 'image' ? r.img : C.thumbAt(m.id, st);
        if (img) x.drawImage(img, px, 0, tw, stripH);
      }
      x.globalAlpha = 1;
      const g = x.createLinearGradient(0, 0, 0, 18); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, 18);
      el.insertBefore(cv, el.firstChild);
    }
    if (hasWave) {
      const wh = c.kind === 'audio' ? H : H - stripH;
      const cv = document.createElement('canvas'); cv.className = 'wave';
      cv.width = W * dpr; cv.height = wh * dpr; cv.style.width = W + 'px'; cv.style.height = wh + 'px'; cv.style.top = (H - wh) + 'px';
      const x = cv.getContext('2d'); x.scale(dpr, dpr);
      if (c.kind === 'video') { x.fillStyle = 'rgba(8,40,30,.9)'; x.fillRect(0, 0, W, wh); }
      x.fillStyle = c.kind === 'audio' ? 'rgba(160,255,214,.85)' : 'rgba(120,230,190,.85)';
      const peaks = r.peaks; const mid = c.kind === 'audio' ? wh * 0.55 : wh / 2;
      const amp = (c.kind === 'audio' ? wh * 0.42 : wh * 0.46) * Math.min(1.6, c.volume);
      for (let px = 0; px < W; px++) {
        const s0 = c.in + (px / pps) * c.speed, s1 = c.in + ((px + 1) / pps) * c.speed;
        let i0 = Math.floor(s0 * 100), i1 = Math.max(i0 + 1, Math.ceil(s1 * 100));
        let v = 0; for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > v) v = peaks[i];
        const hh = Math.max(0.5, v * amp);
        x.fillRect(px, mid - hh, 1, hh * 2);
      }
      el.insertBefore(cv, el.firstChild);
    }
    if (c.kind === 'color') el.style.background = c.color;
  }

  T.paintSelection = () => { C.$$('.clip', tracksEl).forEach((e) => e.classList.toggle('selected', C.selection.has(e.dataset.clip))); };
  T.updatePlayhead = () => { phEl.style.left = HEAD + C.UI.playhead * C.UI.pps + 'px'; };

  function drawRuler() {
    const dpr = window.devicePixelRatio || 1;
    const w = scroll.clientWidth - HEAD, h = 30;
    if (ruler.width !== w * dpr) { ruler.width = w * dpr; ruler.height = h * dpr; ruler.style.width = w + 'px'; }
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.clearRect(0, 0, w, h);
    const pps = C.UI.pps, t0 = scroll.scrollLeft / pps, t1 = t0 + w / pps;
    const steps = [1 / C.fps(), 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    let major = steps.find((s) => s * pps >= 90) || 600;
    const minor = major / (major >= 1 ? 5 : 2);
    rctx.strokeStyle = '#3a3d4a'; rctx.fillStyle = '#8b8f9e'; rctx.font = '10.5px Consolas, monospace'; rctx.lineWidth = 1;
    rctx.beginPath();
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
      const x = Math.round((t - t0) * pps) + 0.5;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      rctx.moveTo(x, isMajor ? 14 : 22); rctx.lineTo(x, h);
      if (isMajor) {
        const tt = Math.round(t * 1000) / 1000;
        const mm = Math.floor(tt / 60), ss = Math.floor(tt % 60), ff = Math.round((tt % 1) * C.fps()) % C.fps();
        const lbl = major < 1 ? `${mm}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        rctx.fillText(lbl, x + 4, 12);
      }
    }
    rctx.stroke();
    const rg = C.project.range;
    if (rg) {
      const a = (rg.in - t0) * pps, b = (rg.out - t0) * pps;
      rctx.fillStyle = 'rgba(0,0,0,.35)'; rctx.fillRect(0, 0, Math.max(0, a), h); rctx.fillRect(Math.max(0, b), 0, w, h);
      rctx.fillStyle = '#19d3c5'; rctx.fillRect(a, 0, b - a, 4);
    }
    // work area / duration shade
    const dx = (C.duration() - t0) * pps;
    if (dx < w) { rctx.fillStyle = 'rgba(0,0,0,.25)'; rctx.fillRect(Math.max(0, dx), 0, w, h); }
  }
  T.drawRuler = drawRuler;

  T.renderMarkers = () => {
    C.$$('.marker', inner).forEach((m) => m.remove());
    for (const mk of Object.values(C.project.markers)) {
      const el = C.h(`<div class="marker" data-tip="${C.esc(mk.label || 'Marker')} · ${C.fmtTC(mk.t, C.fps())}" style="left:${HEAD + mk.t * C.UI.pps}px;top:16px;background:${mk.color || '#ffb547'}"></div>`);
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); C.engine.seek(mk.t); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        C.menu(e.clientX, e.clientY, [
          { label: 'Rename marker', icon: 'text', action: async () => { const v = await C.prompt('Rename marker', 'Label', mk.label || ''); if (v !== null) C.act('Rename marker', () => { C.project.markers[mk.id].label = v; }); } },
          { label: 'Delete marker', icon: 'trash', action: () => C.act('Delete marker', () => { delete C.project.markers[mk.id]; }) },
        ]);
      });
      inner.appendChild(el);
    }
  };
  T.renderPeers = () => {
    C.$$('.peer-ph', inner).forEach((m) => m.remove());
    if (!C.collab || !C.collab.peers) return;
    for (const p of C.collab.peers()) {
      if (p.playhead == null) continue;
      const el = C.h(`<div class="peer-ph" style="position:absolute;top:0;bottom:0;width:0;left:${HEAD + p.playhead * C.UI.pps}px;z-index:7;pointer-events:none;border-left:2px dashed ${p.color}"><div style="position:sticky;top:30px;background:${p.color};color:#000;font-size:10px;font-weight:700;padding:1px 5px;border-radius:0 4px 4px 0;white-space:nowrap;width:max-content">${C.esc(p.name)}</div></div>`);
      inner.appendChild(el);
    }
    // outline clips peers have selected
    C.$$('.clip', tracksEl).forEach((e) => { e.style.outline = ''; });
    for (const p of C.collab.peers()) for (const id of p.selection || []) {
      const e = tracksEl.querySelector(`.clip[data-clip="${id}"]`);
      if (e) { e.style.outline = `2px solid ${p.color}`; e.style.outlineOffset = '-2px'; }
    }
  };

  // ---------- in/out range ----------
  T.renderRange = () => {
    let el = inner.querySelector('.tl-range');
    const r = C.project.range;
    if (!r) { if (el) el.remove(); return; }
    if (!el) { el = C.h('<div class="tl-range"></div>'); inner.appendChild(el); }
    el.style.left = HEAD + r.in * C.UI.pps + 'px'; el.style.width = Math.max(1, (r.out - r.in) * C.UI.pps) + 'px';
  };
  T.setRange = (which) => {
    const t = C.snapTime(C.UI.playhead); const d = C.duration();
    C.act(which === 'in' ? 'Set in point' : 'Set out point', () => {
      const r = C.project.range ? Object.assign({}, C.project.range) : { in: 0, out: Math.max(t, d) };
      if (which === 'in') { r.in = t; if (r.out <= t) r.out = Math.max(t + 1, d); } else { r.out = t; if (r.in >= t) r.in = 0; }
      C.project.range = r.out - r.in > C.frame() ? r : null;
    });
    C.toast(which === 'in' ? `In point ${C.fmtTC(t, C.fps())}` : `Out point ${C.fmtTC(t, C.fps())}`, 'info', 1200);
  };
  T.clearRange = () => { if (C.project.range) C.act('Clear in/out', () => { C.project.range = null; }); };
  T.renderRec = () => {
    let el = inner.querySelector('.tl-rec');
    const r = C.UI.recording;
    if (!r) { if (el) el.remove(); return; }
    if (!el) { el = C.h('<div class="tl-rec"><span>● REC</span></div>'); inner.appendChild(el); }
    el.style.left = HEAD + r.start * C.UI.pps + 'px'; el.style.width = Math.max(2, (C.UI.playhead - r.start) * C.UI.pps) + 'px';
  };

  // ---------- track reordering ----------
  function trackDrag(e) {
    if (e.button !== 0) return;
    const row = e.currentTarget.closest('.track'); const id = row.dataset.track; const tr = C.project.tracks[id];
    const y0 = e.clientY; let moved = false, target = null, line = null;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientY - y0) < 5) return;
      moved = true;
      const rows = C.$$('.track', tracksEl).filter((r) => C.project.tracks[r.dataset.track].type === tr.type);
      let best = null;
      for (const r of rows) { const b = r.getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { best = { r, before: true }; break; } best = { r, before: false }; }
      target = best;
      if (!line) { line = C.h('<div class="track-drop-line"></div>'); tracksEl.appendChild(line); }
      const b = best.r.getBoundingClientRect(), tb = tracksEl.getBoundingClientRect();
      line.style.top = (best.before ? b.top : b.bottom) - tb.top - 1 + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (line) line.remove();
      if (!moved || !target) return;
      const tid = target.r.dataset.track; if (tid === id) return;
      C.act('Reorder track', () => {
        const order = C.project.trackOrder; order.splice(order.indexOf(id), 1);
        const i = order.indexOf(tid); order.splice(target.before ? i : i + 1, 0, id);
        C.renumberTracks();
      });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  // ---------- scrubbing ----------
  function scrubStart(e) {
    e.preventDefault();
    const wasPlaying = C.UI.playing; if (wasPlaying) C.engine.pause();
    const move = (ev) => { let t = T.timeAt(ev.clientX); if (C.UI.snap && !ev.shiftKey) t = snapScrub(t); C.engine.seek(C.snapTime(t)); };
    move(e);
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  function snapScrub(t) {
    const th = 6 / C.UI.pps;
    let best = t, bd = th;
    for (const p of snapPoints(new Set())) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function snapPoints(exclude, includePlayhead = true) {
    const pts = [0];
    if (includePlayhead) pts.push(C.UI.playhead);
    for (const c of C.allClips()) if (!exclude.has(c.id)) pts.push(c.start, C.clipEnd(c));
    for (const m of Object.values(C.project.markers)) pts.push(m.t);
    return pts;
  }
  function showSnap(t) { if (t == null) { snapEl.style.display = 'none'; return; } snapEl.style.display = 'block'; snapEl.style.left = HEAD + t * C.UI.pps + 'px'; }

  // ---------- pointer interactions ----------
  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.track-head')) return;
    const clipE = e.target.closest('.clip');
    const lane = e.target.closest('.track-lane');
    if (!lane) return;
    const tr = C.project.tracks[lane.parentElement.dataset.track];
    if (!clipE) { return marqueeStart(e); }
    const c = C.getClip(clipE.dataset.clip); if (!c) return;
    if (tr && tr.locked) { C.toast('Track is locked', 'info', 1500); return; }
    e.preventDefault();
    if (C.UI.tool === 'blade') {
      const t = C.snapTime(e.shiftKey ? T.timeAt(e.clientX) : snapScrub(T.timeAt(e.clientX)));
      C.act('Blade cut', () => C.ops.split(c, t));
      return;
    }
    if (e.target.classList.contains('tr-badge')) { C.select([c.id]); C.emit('inspectTab', 'transition'); return; }
    if (e.target.classList.contains('kf-d')) return kfDrag(e, c, clipE, +e.target.dataset.kt);
    if (e.target.classList.contains('fade-h')) return fadeDrag(e, c, clipE, e.target.dataset.fade);
    if (e.target.classList.contains('trim')) { if (!C.selection.has(c.id)) C.select([c.id]); return trimDrag(e, c, clipE, e.target.classList.contains('l') ? 'l' : 'r'); }
    let deferSelect = false;
    if (e.shiftKey && C.UI.anchor && C.getClip(C.UI.anchor) && C.UI.anchor !== c.id) { const a = C.UI.anchor; C.select(rangeIds(C.getClip(a), c), 'add'); C.UI.anchor = a; }
    else if (e.ctrlKey || e.metaKey) C.select([c.id], 'toggle');
    else if (!C.selection.has(c.id)) C.select([c.id]);
    else deferSelect = true;
    if (!C.selection.has(c.id)) return;
    moveDrag(e, c, deferSelect);
  }

  function rangeIds(a, b) {
    const order = C.project.trackOrder;
    const i0 = Math.min(order.indexOf(a.trackId), order.indexOf(b.trackId)), i1 = Math.max(order.indexOf(a.trackId), order.indexOf(b.trackId));
    const t0 = Math.min(a.start, b.start), t1 = Math.max(C.clipEnd(a), C.clipEnd(b));
    return C.allClips().filter((c) => { const i = order.indexOf(c.trackId); return i >= i0 && i <= i1 && c.start < t1 - 1e-4 && C.clipEnd(c) > t0 + 1e-4; }).map((c) => c.id);
  }

  function kfDrag(e, c, el, kt) {
    e.stopPropagation(); e.preventDefault();
    C.select([c.id]); C.engine.seek(c.start + kt);
    const x0 = e.clientX; const d = e.target; let nt = kt, moved = false;
    beginDrag();
    const move = (ev) => {
      if (Math.abs(ev.clientX - x0) < 3 && !moved) return;
      moved = true;
      nt = C.clamp(Math.round((kt + (ev.clientX - x0) / C.UI.pps) * C.fps()) / C.fps(), 0, c.duration);
      d.style.left = nt * C.UI.pps + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); endDrag();
      if (moved && Math.abs(nt - kt) > 1e-6) { C.act('Move keyframe', () => C.kf.moveTime(c, kt, nt)); C.engine.seek(c.start + nt); }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  function beginDrag() { C.UI.dragging = true; if (C.UI.playing) C.engine.pause(); }
  function endDrag() { C.UI.dragging = false; showSnap(null); if (pending) T.render(); }

  function moveDrag(e, primary, deferSelect) {
    const x0 = e.clientX, y0 = e.clientY;
    const sel = C.selectedClips().filter((c) => !C.project.tracks[c.trackId].locked);
    const exclude = new Set(sel.map((c) => c.id));
    const orig = new Map(sel.map((c) => [c.id, { start: c.start, trackId: c.trackId }]));
    const order = C.project.trackOrder;
    const pts = snapPoints(exclude);
    const minStart = Math.min(...sel.map((c) => c.start));
    let moved = false, dt = 0, dTrack = 0;
    const els = new Map(sel.map((c) => [c.id, tracksEl.querySelector(`.clip[data-clip="${c.id}"]`)]));
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) { moved = true; beginDrag(); els.forEach((el) => el && el.classList.add('dragging')); }
      dt = (ev.clientX - x0) / C.UI.pps;
      // snapping on primary clip edges
      let snapT = null;
      if (C.UI.snap && !ev.shiftKey) {
        const th = 8 / C.UI.pps;
        const o = orig.get(primary.id);
        const s = o.start + dt, en = s + primary.duration;
        let bd = th;
        for (const p of pts) {
          if (Math.abs(p - s) < bd) { bd = Math.abs(p - s); dt = p - o.start; snapT = p; }
          if (Math.abs(p - en) < bd) { bd = Math.abs(p - en); dt = p - primary.duration - o.start; snapT = p; }
        }
      }
      if (minStart + dt < 0) dt = -minStart;
      showSnap(snapT);
      // vertical: track change
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.track');
      dTrack = 0;
      if (row) {
        const hov = order.indexOf(row.dataset.track), base = order.indexOf(orig.get(primary.id).trackId);
        const d = hov - base;
        const ok = sel.every((c) => { const i = order.indexOf(orig.get(c.id).trackId) + d; const t = C.project.tracks[order[i]]; return t && C.trackAccepts(t, c.kind) && !t.locked; });
        if (ok) dTrack = d;
      }
      for (const c of sel) {
        const el = els.get(c.id); if (!el) continue;
        el.style.left = Math.max(0, orig.get(c.id).start + dt) * C.UI.pps + 'px';
        const tid = order[order.indexOf(orig.get(c.id).trackId) + dTrack];
        const lane = tracksEl.querySelector(`.track[data-track="${tid}"] .track-lane`);
        if (lane && el.parentElement !== lane) lane.appendChild(el);
      }
    };
    const up = (ev) => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (!moved) { if (deferSelect) C.select([primary.id]); return; }
      endDrag();
      if (ev && ev.altKey) {
        C.act('Duplicate (Alt-drag)', () => {
          const gmap = {}; const ids = [];
          for (const c of sel) {
            const d = C.deep(c); d.id = C.uid('c_');
            if (c.group) d.group = gmap[c.group] = gmap[c.group] || C.uid('g_');
            d.start = C.snapTime(Math.max(0, orig.get(c.id).start + dt));
            d.trackId = order[order.indexOf(orig.get(c.id).trackId) + dTrack];
            if (C.overlaps(d.trackId, d.start, C.clipEnd(d))) d.trackId = C.findSpace(d.kind, d.start, d.duration);
            C.project.clips[d.id] = d; ids.push(d.id);
          }
          C.select(ids, 'set', false);
        });
        return;
      }
      C.act(sel.length > 1 ? 'Move clips' : 'Move clip', () => {
        for (const c of sel) {
          c.start = C.snapTime(Math.max(0, orig.get(c.id).start + dt));
          c.trackId = order[order.indexOf(orig.get(c.id).trackId) + dTrack];
        }
        // resolve collisions: bump colliding clips to a free track
        const placed = new Set();
        for (const c of sel.sort((a, b) => a.start - b.start)) {
          const others = new Set([c.id, ...[...exclude].filter((id) => !placed.has(id))]);
          if (C.overlaps(c.trackId, c.start, C.clipEnd(c), others)) c.trackId = C.findSpace(c.kind, c.start, c.duration, null, others);
          placed.add(c.id);
        }
      });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  function trimDrag(e, c, el, side) {
    e.stopPropagation();
    beginDrag();
    const x0 = e.clientX;
    const o = { start: c.start, duration: c.duration, in: c.in, end: C.clipEnd(c) };
    const neighbors = C.clipsOn(c.trackId).filter((x) => x.id !== c.id);
    const prevEnd = Math.max(0, ...neighbors.filter((x) => C.clipEnd(x) <= o.start + 1e-4).map(C.clipEnd));
    const nextStart = Math.min(Infinity, ...neighbors.filter((x) => x.start >= o.end - 1e-4).map((x) => x.start));
    const isMedia = c.kind === 'video' || c.kind === 'audio';
    const m = C.mediaOf(c);
    const fr = C.frame();
    const pts = snapPoints(new Set([c.id]));
    const ripple = C.UI.ripple;
    const move = (ev) => {
      let dt = (ev.clientX - x0) / C.UI.pps;
      let snapT = null;
      if (side === 'l') {
        let s = o.start + dt;
        if (C.UI.snap && !ev.shiftKey) { for (const p of pts) if (Math.abs(p - s) < 8 / C.UI.pps) { s = p; snapT = p; break; } }
        s = Math.max(s, prevEnd, 0);
        if (isMedia && !c.freeze) s = Math.max(s, o.start - o.in / c.speed);
        s = Math.min(s, o.end - fr);
        c.start = s; c.duration = o.end - s;
        if (isMedia && !c.freeze) c.in = Math.max(0, o.in + (s - o.start) * c.speed);
      } else {
        let en = o.end + dt;
        if (C.UI.snap && !ev.shiftKey) { for (const p of pts) if (Math.abs(p - en) < 8 / C.UI.pps) { en = p; snapT = p; break; } }
        if (!ripple) en = Math.min(en, nextStart);
        en = Math.max(en, o.start + fr);
        if (isMedia && !c.freeze && m && m.duration) en = Math.min(en, o.start + (m.duration - c.in) / c.speed);
        c.duration = en - o.start;
      }
      c.fadeIn = Math.min(c.fadeIn, c.duration); c.fadeOut = Math.min(c.fadeOut, c.duration - c.fadeIn);
      showSnap(snapT);
      el.style.left = c.start * C.UI.pps + 'px'; el.style.width = c.duration * C.UI.pps + 'px';
      C.engine.requestDraw();
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      const nv = { start: c.start, duration: c.duration, in: c.in };
      Object.assign(c, { start: o.start, duration: o.duration, in: o.in });
      endDrag();
      C.act('Trim clip', () => {
        Object.assign(c, { start: C.snapTime(nv.start), duration: Math.max(fr, C.snapTime(nv.duration)), in: nv.in });
        if (side === 'l' && Math.abs(c.start - o.start) > 1e-6) C.kf.shift(c, -(c.start - o.start));
        if (ripple && side === 'r') {
          const delta = C.clipEnd(c) - o.end;
          for (const x of neighbors) if (x.start >= o.end - 1e-4) x.start = Math.max(0, x.start + delta);
        }
      });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  function fadeDrag(e, c, el, which) {
    e.stopPropagation();
    beginDrag(); C.select([c.id]);
    const rect = el.getBoundingClientRect();
    C.begin();
    const move = (ev) => {
      const x = (ev.clientX - rect.left) / C.UI.pps;
      if (which === 'in') c.fadeIn = C.clamp(x, 0, c.duration - c.fadeOut);
      else c.fadeOut = C.clamp(c.duration - x, 0, c.duration - c.fadeIn);
      const w = c.duration * C.UI.pps;
      const fi = c.fadeIn * C.UI.pps, fo = c.fadeOut * C.UI.pps;
      el.querySelector('.fade-svg').innerHTML = `${fi > 0 ? `<polygon points="0,0 ${fi},0 0,100" fill="rgba(0,0,0,.45)"/>` : ''}${fo > 0 ? `<polygon points="${w - fo},0 ${w},0 ${w},100" fill="rgba(0,0,0,.45)"/>` : ''}`;
      const h = el.querySelector(`.fade-h[data-fade="${which}"]`);
      if (h) h.style.left = (which === 'in' ? Math.max(5, fi) : Math.min(w - 5, w - fo)) + 'px';
      C.emit('fadeLive', c.id);
      C.engine.requestDraw();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); endDrag(); C.commit('Adjust fade'); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  function marqueeStart(e) {
    const x0 = e.clientX, y0 = e.clientY;
    const ir = inner.getBoundingClientRect();
    let moved = false;
    const base = e.shiftKey || e.ctrlKey ? new Set(C.selection) : new Set();
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      const r = inner.getBoundingClientRect();
      const l = Math.min(x0, ev.clientX), t = Math.min(y0, ev.clientY), w = Math.abs(ev.clientX - x0), h = Math.abs(ev.clientY - y0);
      Object.assign(marqEl.style, { display: 'block', left: l - r.left + 'px', top: t - r.top + 'px', width: w + 'px', height: h + 'px' });
      const ids = new Set(base);
      C.$$('.clip', tracksEl).forEach((ce) => {
        const b = ce.getBoundingClientRect();
        if (b.right > l && b.left < l + w && b.bottom > t && b.top < t + h) ids.add(ce.dataset.clip);
      });
      C.selection.clear(); ids.forEach((i) => C.selection.add(i)); T.paintSelection();
    };
    const up = (ev) => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      marqEl.style.display = 'none';
      if (!moved) { if (!base.size) C.select([]); let t = T.timeAt(ev.clientX); if (C.UI.snap) t = snapScrub(t); C.engine.seek(C.snapTime(t)); }
      else C.emit('select');
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    void ir;
  }

  function onLibraryDrop(e) {
    e.preventDefault();
    C.$$('.track.drop-target').forEach((x) => x.classList.remove('drop-target'));
    const row = e.target.closest('.track');
    const t = C.snapTime(T.timeAt(e.clientX));
    const mid = e.dataTransfer.getData('application/x-cutroom-media');
    const txt = e.dataTransfer.getData('application/x-cutroom-text');
    const tr = e.dataTransfer.getData('application/x-cutroom-transition');
    const fl = e.dataTransfer.getData('application/x-cutroom-filter');
    const col = e.dataTransfer.getData('application/x-cutroom-color');
    const efx = e.dataTransfer.getData('application/x-cutroom-effect');
    const sticker = e.dataTransfer.getData('application/x-cutroom-sticker');
    if (efx) {
      const ce = e.target.closest('.clip');
      const target = ce && C.getClip(ce.dataset.clip);
      C.presets.applyRef(efx, target && target.kind !== 'audio' ? [target] : [], t, trackId);
      return;
    }
    if (sticker) { C.act('Add sticker', () => { const c = C.ops.addSticker(sticker, t, trackId); C.select([c.id]); }); return; }
    const trackId = row ? row.dataset.track : null;
    if (mid) {
      const ids = mid.split(',');
      C.act('Add to timeline', () => { let at = t; for (const id of ids) { const c = C.addMediaClip(id, at, trackId); if (c) { at = C.clipEnd(c); C.select([c.id]); } } });
    } else if (txt) {
      C.act('Add text', () => { const c = C.ops.addText(JSON.parse(txt), t, trackId); C.select([c.id]); });
    } else if (col) {
      C.act('Add color', () => { const c = C.ops.addColor(col, t, trackId); C.select([c.id]); });
    } else if (tr || fl) {
      const ce = e.target.closest('.clip'); if (!ce) { C.toast('Drop onto a clip', 'info'); return; }
      const c = C.getClip(ce.dataset.clip);
      if (tr) C.act('Add transition', () => C.ops.setTransition([c], tr));
      else C.act('Apply filter', () => C.ops.applyFilter([c], fl));
      C.select([c.id]);
    }
  }

  // ---------- context menus ----------
  function onContext(e) {
    e.preventDefault();
    const ce = e.target.closest('.clip');
    const t = C.snapTime(T.timeAt(e.clientX));
    if (ce) {
      const c = C.getClip(ce.dataset.clip);
      if (!C.selection.has(c.id)) C.select([c.id]);
      const inside = C.UI.playhead > c.start && C.UI.playhead < C.clipEnd(c);
      const visual = c.kind !== 'audio';
      const sel = C.selectedClips();
      C.menu(e.clientX, e.clientY, [
        { label: 'Split at playhead', icon: 'split', key: 'S', disabled: !inside, action: () => C.ops.splitAtPlayhead() },
        { label: 'Rename…', icon: 'text', key: 'F2', action: () => C.ops.rename(c) },
        { swatches: C.LABELS, current: c.label, action: (col) => C.ops.label(col) },
        { label: 'Duplicate', icon: 'copy', key: 'Ctrl+D', action: () => C.ops.duplicate() },
        { label: 'Copy', icon: 'copy', key: 'Ctrl+C', action: () => C.ops.copy() },
        { label: 'Paste at playhead', icon: 'copy', key: 'Ctrl+V', disabled: !C.ops.clipboard, action: () => C.ops.paste() },
        '-',
        { label: 'Detach audio', icon: 'detach', disabled: !(c.kind === 'video' && C.hasAudio(c)), action: () => C.ops.detachAudio(c) },
        { label: 'Freeze frame here', icon: 'freeze', disabled: !(c.kind === 'video' && inside), action: () => C.ops.freeze(c) },
        { label: c.muted ? 'Unmute clip' : 'Mute clip', icon: c.muted ? 'volume' : 'volumeOff', disabled: !C.hasAudio(c), action: () => C.act('Mute clip', () => { c.muted = !c.muted; }) },
        { label: 'Remove transition', icon: 'transition', disabled: !c.transition, action: () => C.act('Remove transition', () => { c.transition = null; }) },
        { label: 'Reset effects', icon: 'refresh', action: () => C.act('Reset effects', () => { c.fx = C.defaultFx(); c.t = C.defaultTransform(); c.filterName = null; c.effects = []; c.kf = {}; }) },
        '-',
        { label: 'Add effect…', icon: 'sparkles', disabled: !visual, action: () => C.presets.picker(sel.filter((x) => x.kind !== 'audio')) },
        { label: 'Save effects as preset…', icon: 'save', disabled: !(c.effects && c.effects.length), action: () => C.presets.saveFromClip(c) },
        { label: 'Picture-in-picture', icon: 'square', disabled: !(c.kind === 'video' || c.kind === 'image'), action: () => C.ops.pip(c) },
        '-',
        { label: sel.length > 1 ? 'Group clips' : 'Group (select 2+ clips)', icon: 'link', key: 'Ctrl+G', disabled: sel.length < 2, action: () => C.ops.group() },
        { label: 'Ungroup', icon: 'link', key: 'Ctrl+Shift+G', disabled: !sel.some((x) => x.group), action: () => C.ops.ungroup() },
        { label: 'Select everything after this', icon: 'cursor', action: () => C.ops.selectAfter(c.start, null) },
        { label: 'Select all on this track', icon: 'cursor', action: () => C.ops.selectAfter(0, c.trackId) },
        { label: 'Select clips using this media', icon: 'cursor', disabled: !c.mediaId, action: () => C.select(C.allClips().filter((x) => x.mediaId === c.mediaId).map((x) => x.id)) },
        '-',
        { label: 'Delete', icon: 'trash', key: 'Del', action: () => C.ops.deleteSelected(false) },
        { label: 'Ripple delete', icon: 'trash', key: 'Shift+Del', action: () => C.ops.deleteSelected(true) },
      ]);
    } else {
      const row = e.target.closest('.track');
      C.menu(e.clientX, e.clientY, [
        { label: 'Paste here', icon: 'copy', disabled: !C.ops.clipboard, action: () => { C.engine.seek(t); C.ops.paste(); } },
        { label: 'Add text here', icon: 'text', action: () => C.act('Add text', () => { const c = C.ops.addText(null, t, row && row.dataset.track); C.select([c.id]); }) },
        { label: 'Add effect clip here…', icon: 'sparkles', action: () => { C.engine.seek(t); C.presets.picker([]); } },
        { label: 'Record voiceover here', icon: 'mic', action: () => { C.engine.seek(t); C.recorder.open(); } },
        { label: 'Select everything after here', icon: 'cursor', action: () => C.ops.selectAfter(t, null) },
        { label: 'Add marker here', icon: 'marker', action: () => C.ops.addMarker(t) },
        { label: 'Close gap', icon: 'ripple', disabled: !row, action: () => C.ops.closeGap(row.dataset.track, t) },
      ]);
    }
  }
  function onTrackBtn(e) {
    e.stopPropagation();
    const id = e.currentTarget.closest('.track').dataset.track;
    const tr = C.project.tracks[id]; const act = e.currentTarget.dataset.act;
    C.act('Track ' + act, () => {
      if (act === 'mute') tr.muted = !tr.muted;
      if (act === 'hide') tr.hidden = !tr.hidden;
      if (act === 'lock') tr.locked = !tr.locked;
    });
  }
  function onTrackContext(e) {
    e.preventDefault();
    const id = e.currentTarget.closest('.track').dataset.track;
    const tr = C.project.tracks[id];
    const idx = C.project.trackOrder.indexOf(id);
    const order = C.project.trackOrder;
    const canUp = idx > 0 && C.project.tracks[order[idx - 1]].type === tr.type;
    const canDown = idx < order.length - 1 && C.project.tracks[order[idx + 1]].type === tr.type;
    C.menu(e.clientX, e.clientY, [
      { label: 'Rename track', icon: 'text', action: async () => { const v = await C.prompt('Rename track', 'Name', tr.name); if (v) C.act('Rename track', () => { tr.name = v; }); } },
      { label: 'Move up', icon: 'chevronDown', disabled: !canUp, action: () => C.act('Move track', () => { order.splice(idx, 1); order.splice(idx - 1, 0, id); }) },
      { label: 'Move down', icon: 'chevronDown', disabled: !canDown, action: () => C.act('Move track', () => { order.splice(idx, 1); order.splice(idx + 1, 0, id); }) },
      { label: `Add ${tr.type} track`, icon: 'plus', action: () => C.act('Add track', () => { C.addTrack(tr.type, tr.type === 'video' ? idx : idx + 1); C.renumberTracks(); }) },
      { label: 'Height: small', icon: 'chevronDown', disabled: tr.h === 'small', action: () => C.act('Track height', () => { tr.h = 'small'; }) },
      { label: 'Height: normal', icon: 'chevronDown', disabled: !tr.h || tr.h === 'normal', action: () => C.act('Track height', () => { tr.h = 'normal'; }) },
      { label: 'Height: large', icon: 'chevronDown', disabled: tr.h === 'large', action: () => C.act('Track height', () => { tr.h = 'large'; }) },
      { label: 'Select all on track', icon: 'cursor', action: () => C.ops.selectAfter(0, id) },
      '-',
      { label: 'Delete track', icon: 'trash', action: async () => {
        const n = C.clipsOn(id).length;
        if (n && !(await C.confirm('Delete track?', `“${C.esc(tr.name)}” contains ${n} clip${n > 1 ? 's' : ''}.`, 'Delete', true))) return;
        C.act('Delete track', () => { C.removeTrack(id); C.renumberTracks(); }); C.cleanSelection();
      } },
    ]);
  }

  // ---------- operations ----------
  const O = (C.ops = { clipboard: null });
  const fr = () => C.frame();

  O.split = (c, t) => {
    if (!c || t <= c.start + fr() / 2 || t >= C.clipEnd(c) - fr() / 2) return null;
    const b = C.deep(c);
    b.id = C.uid('c_');
    b.start = t; b.duration = C.clipEnd(c) - t;
    if ((c.kind === 'video' || c.kind === 'audio') && !c.freeze) b.in = c.in + (t - c.start) * c.speed;
    b.transition = null; b.fadeIn = 0; b.anim = Object.assign({}, b.anim, { in: 'none' });
    c.duration = t - c.start; c.fadeOut = 0; c.anim = Object.assign({}, c.anim, { out: 'none' });
    c.fadeIn = Math.min(c.fadeIn, c.duration); b.fadeOut = Math.min(b.fadeOut, b.duration);
    C.kf.split(c, b, t - c.start);
    C.project.clips[b.id] = b;
    return b;
  };
  O.splitAtPlayhead = () => {
    const t = C.snapTime(C.UI.playhead);
    let targets = C.selectedClips().filter((c) => t > c.start && t < C.clipEnd(c));
    if (!targets.length) targets = C.allClips().filter((c) => t > c.start && t < C.clipEnd(c) && !C.project.tracks[c.trackId].locked);
    if (!targets.length) { C.toast('Move the playhead over a clip to split', 'info'); return; }
    C.act('Split', () => { const nw = []; for (const c of targets) { const b = O.split(c, t); if (b) nw.push(b.id); } C.select(nw.length ? nw : []); });
  };
  O.deleteSelected = (ripple = false) => {
    const sel = C.selectedClips().filter((c) => !C.project.tracks[c.trackId].locked);
    if (!sel.length) return;
    C.act(ripple ? 'Ripple delete' : 'Delete', () => {
      for (const c of sel) delete C.project.clips[c.id];
      if (ripple) {
        const byTrack = {};
        for (const c of sel) (byTrack[c.trackId] = byTrack[c.trackId] || []).push(c);
        for (const tid in byTrack) {
          const removed = byTrack[tid].sort((a, b) => b.start - a.start);
          for (const r of removed) for (const x of C.clipsOn(tid)) if (x.start >= C.clipEnd(r) - 1e-4) x.start = Math.max(0, x.start - r.duration);
        }
      }
    });
    C.select([]);
  };
  O.duplicate = () => {
    const sel = C.selectedClips(); if (!sel.length) return;
    const span = Math.max(...sel.map(C.clipEnd)) - Math.min(...sel.map((c) => c.start));
    C.act('Duplicate', () => {
      const ids = [];
      for (const c of sel) {
        const d = C.deep(c); d.id = C.uid('c_'); d.start = c.start + span;
        d.trackId = C.findSpace(d.kind, d.start, d.duration, c.trackId);
        C.project.clips[d.id] = d; ids.push(d.id);
      }
      C.select(ids);
    });
  };
  O.copy = () => {
    const sel = C.selectedClips(); if (!sel.length) return;
    const t0 = Math.min(...sel.map((c) => c.start));
    O.clipboard = sel.map((c) => Object.assign(C.deep(c), { start: c.start - t0 }));
    C.toast(`Copied ${sel.length} clip${sel.length > 1 ? 's' : ''}`, 'ok', 1200);
  };
  O.cut = () => { O.copy(); O.deleteSelected(false); };
  O.paste = () => {
    if (!O.clipboard) return;
    C.act('Paste', () => {
      const ids = [];
      for (const c of O.clipboard) {
        if (c.mediaId && !C.project.media[c.mediaId]) continue;
        const d = C.deep(c); d.id = C.uid('c_'); d.start = C.snapTime(C.UI.playhead + c.start);
        d.trackId = C.findSpace(d.kind, d.start, d.duration, C.project.tracks[c.trackId] ? c.trackId : null);
        C.project.clips[d.id] = d; ids.push(d.id);
      }
      C.select(ids);
    });
  };
  O.detachAudio = (c) => {
    if (!c || c.kind !== 'video' || !C.hasAudio(c)) { C.toast('Select a video clip with audio', 'info'); return; }
    C.act('Detach audio', () => {
      const a = C.makeClip({ kind: 'audio', mediaId: c.mediaId, name: c.name + ' (audio)', start: c.start, duration: c.duration, in: c.in, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, muted: c.muted });
      a.trackId = C.findSpace('audio', a.start, a.duration);
      C.project.clips[a.id] = a;
      c.audioDetached = true;
      C.select([a.id]);
    });
    C.toast('Audio detached to its own track');
  };
  O.freeze = (c, len = 3) => {
    const t = C.snapTime(C.UI.playhead);
    if (!c || c.kind !== 'video' || t <= c.start || t >= C.clipEnd(c)) { C.toast('Place the playhead over a video clip', 'info'); return; }
    C.act('Freeze frame', () => {
      const src = C.srcTime(c, t);
      const b = O.split(c, t);
      for (const x of C.clipsOn(c.trackId)) if (x.start >= t - 1e-4 && x.id !== c.id) x.start += len;
      const f = C.makeClip(Object.assign(C.deep(c), { id: C.uid('c_'), start: t, duration: len, in: src, freeze: true, transition: null, fadeIn: 0, fadeOut: 0, muted: true, speed: 1 }));
      C.project.clips[f.id] = f;
      void b;
      C.select([f.id]);
    });
  };
  O.addMarker = (t = C.UI.playhead) => {
    C.act('Add marker', () => { const id = C.uid('k_'); C.project.markers[id] = { id, t: C.snapTime(t), label: 'Marker', color: '#ffb547' }; });
  };
  O.closeGap = (trackId, t) => {
    const clips = C.clipsOn(trackId);
    const before = clips.filter((c) => C.clipEnd(c) <= t + 1e-4);
    const after = clips.filter((c) => c.start >= t - 1e-4);
    if (!after.length) return;
    const gapStart = before.length ? Math.max(...before.map(C.clipEnd)) : 0;
    const shift = after[0].start - gapStart;
    if (shift <= 0) return;
    C.act('Close gap', () => { for (const c of after) c.start -= shift; });
  };
  O.addText = (preset, t = C.UI.playhead, trackId = null) => {
    const text = Object.assign(C.defaultText(), preset && preset.text);
    const c = C.makeClip({ kind: 'text', name: 'Text', start: C.snapTime(t), duration: 4, text, anim: Object.assign({ in: 'fade', out: 'fade', dur: 0.4 }, preset && preset.anim) });
    if (preset && preset.t) Object.assign(c.t, preset.t);
    // text goes on the top-most free video track
    const vids = C.tracks().filter((x) => x.type === 'video');
    let tid = trackId && C.project.tracks[trackId] && C.project.tracks[trackId].type === 'video' && !C.overlaps(trackId, c.start, c.start + c.duration) ? trackId : null;
    if (!tid) {
      tid = vids.find((x) => !x.locked && !C.overlaps(x.id, c.start, c.start + c.duration) && C.clipsOn(x.id).every((k) => k.kind === 'text'))?.id;
      if (!tid) { tid = C.addTrack('video', 0); C.renumberTracks(); }
    }
    c.trackId = tid;
    C.project.clips[c.id] = c;
    return c;
  };
  O.addColor = (color, t = C.UI.playhead, trackId = null) => {
    const c = C.makeClip({ kind: 'color', name: 'Color', color, start: C.snapTime(t), duration: 5 });
    c.trackId = C.findSpace('video', c.start, c.duration, trackId);
    C.project.clips[c.id] = c;
    return c;
  };
  O.setTransition = (clips, type, duration = 0.6) => {
    for (const c of clips) {
      if (c.kind === 'audio') continue;
      c.transition = type ? { type, duration: Math.min(duration, c.duration / 2) } : null;
    }
  };
  O.applyFilter = (clips, name) => {
    const f = C.FILTERS.find((x) => x.id === name);
    for (const c of clips) {
      if (c.kind === 'audio') continue;
      c.fx = Object.assign(C.defaultFx(), f ? f.fx : {});
      c.filterName = f && f.id !== 'none' ? f.id : null;
    }
  };
  C.LABELS = [null, '#ff5d6c', '#ffb547', '#f5e04b', '#3ee08f', '#19d3c5', '#4dd4ff', '#7c8cff', '#c77dff', '#ff6bd6'];
  O.rename = async (c) => {
    c = c || C.primary(); if (!c) return;
    const v = await C.prompt('Rename clip', 'Name', c.kind === 'text' ? c.text.content : c.name);
    if (v === null) return;
    C.act('Rename clip', () => { if (c.kind === 'text') c.text.content = v; else c.name = v; });
  };
  O.label = (color) => { const sel = C.selectedClips(); if (sel.length) C.act('Label color', () => sel.forEach((c) => { c.label = color || null; })); };
  O.group = () => {
    const sel = C.selectedClips(); if (sel.length < 2) { C.toast('Select two or more clips to group', 'info'); return; }
    const g = C.uid('g_'); C.act('Group', () => sel.forEach((c) => { c.group = g; })); C.toast(`Grouped ${sel.length} clips — they now select and move together`, 'ok', 2200);
  };
  O.ungroup = () => { const sel = C.selectedClips(); if (sel.some((c) => c.group)) C.act('Ungroup', () => sel.forEach((c) => { c.group = null; })); };
  O.selectAfter = (t, trackId) => C.select(C.allClips().filter((c) => C.clipEnd(c) > t + 1e-4 && (!trackId || c.trackId === trackId)).map((c) => c.id), 'set', false);
  O.selectNeighbor = (dir) => {
    const p = C.primary(); if (!p) { const first = C.allClips().sort((a, b) => a.start - b.start)[0]; if (first) C.select([first.id]); return; }
    const list = C.clipsOn(p.trackId); const i = list.findIndex((c) => c.id === p.id); const n = list[i + dir];
    if (n) { C.select([n.id]); C.engine.seek(n.start); }
  };
  O.pip = (c) => {
    C.act('Picture-in-picture', () => {
      if (!C.overlaps(c.trackId, c.start, C.clipEnd(c), new Set([c.id])) && C.tracks().filter((t) => t.type === 'video').length < 2) { /* single track: keep */ }
      Object.assign(c.t, { scale: 0.34, x: 0.79, y: 0.77 });
      c.effects = (c.effects || []).filter((e) => e.type !== 'frame' && e.type !== 'shadow');
      c.effects.push(C.fx.newEffect('frame', { radius: 6, border: 6 }), C.fx.newEffect('shadow', { blur: 40, opacity: 55 }));
    });
  };
  O.addSticker = (emoji, t = C.UI.playhead, trackId = null) => {
    const c = O.addText({ text: { content: emoji, size: 220, font: 'Segoe UI Emoji', bold: false, shadow: 0.25, strokeWidth: 0 }, anim: { in: 'pop', out: 'pop', dur: 0.35 } }, t, trackId);
    c.sticker = true; c.name = 'Sticker';
    return c;
  };
  O.addEffectClip = (effects, t = C.UI.playhead, trackId = null, name = 'Effect', kf = null) => {
    const c = C.makeClip({ kind: 'effect', name, start: C.snapTime(t), duration: 5, effects });
    if (kf) c.kf = kf;
    const vids = C.tracks().filter((x) => x.type === 'video');
    let tid = trackId && C.project.tracks[trackId] && C.project.tracks[trackId].type === 'video' && !C.overlaps(trackId, c.start, c.start + c.duration) ? trackId : null;
    if (!tid) { tid = vids.find((x) => !x.locked && !C.overlaps(x.id, c.start, c.start + c.duration) && C.clipsOn(x.id).every((k) => k.kind === 'effect'))?.id; }
    if (!tid) { tid = C.addTrack('video', 0); C.renumberTracks(); }
    c.trackId = tid; C.project.clips[c.id] = c;
    return c;
  };
  O.nudge = (dt) => {
    const sel = C.selectedClips().filter((c) => !C.project.tracks[c.trackId].locked); if (!sel.length) return;
    C.act('Nudge', () => { for (const c of sel) c.start = Math.max(0, C.snapTime(c.start + dt)); });
  };
  O.selectAll = () => C.select(C.allClips().map((c) => c.id));
})(window.C);
