/* Cutroom — playback engine */
(function (C) {
  const E = (C.engine = { players: new Map(), ac: null, master: null });
  let canvas, ctx, raf = null, startWall = 0, startT = 0, drawQueued = false;

  E.init = () => {
    canvas = C.$('#previewCanvas');
    ctx = canvas.getContext('2d', { alpha: false });
    E.canvas = canvas; E.ctx = ctx;
    E.resize();
    new ResizeObserver(() => E.layout()).observe(C.$('#stage'));
    C.on('change', () => { E.gc(); E.resize(); E.requestDraw(); });
    C.on('mediaProgress', () => E.requestDraw());
  };

  E.ensureAudio = () => {
    if (E.ac) { if (E.ac.state === 'suspended') E.ac.resume(); return; }
    try {
      E.ac = new AudioContext({ latencyHint: 'interactive' });
      E.master = E.ac.createGain();
      E.master.connect(E.ac.destination);
      E.analyser = E.ac.createAnalyser(); E.analyser.fftSize = 512; E.master.connect(E.analyser);
      for (const p of E.players.values()) connectAudio(p);
    } catch (e) { console.warn('Audio unavailable', e); }
  };
  function connectAudio(p) {
    if (!E.ac || p.node) return;
    try {
      p.node = E.ac.createMediaElementSource(p.el);
      p.gain = E.ac.createGain(); p.gain.gain.value = 0;
      p.node.connect(p.gain).connect(E.master);
    } catch (e) { console.warn(e); }
  }

  E.player = (c) => {
    let p = E.players.get(c.id);
    const m = C.mediaOf(c);
    if (!m) return null;
    const r = C.MR[m.id];
    if (!r || r.status !== 'ready') return null;
    const url = C.mediaUrl(m);
    if (p && p.url === url) return p;
    if (p) destroy(c.id);
    const el = document.createElement(c.kind === 'audio' ? 'audio' : 'video');
    el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.playsInline = true; el.src = url;
    el.addEventListener('seeked', () => { if (!C.UI.playing) E.requestDraw(); });
    el.addEventListener('loadeddata', () => E.requestDraw());
    p = { el, url, clipId: c.id, node: null, gain: null };
    E.players.set(c.id, p);
    connectAudio(p);
    if (c.kind === 'video') el.currentTime = c.in;
    return p;
  };
  function destroy(id) {
    const p = E.players.get(id); if (!p) return;
    try { p.el.pause(); } catch (_) {}
    try { p.node && p.node.disconnect(); p.gain && p.gain.disconnect(); } catch (_) {}
    p.el.removeAttribute('src'); try { p.el.load(); } catch (_) {}
    E.players.delete(id);
  }
  E.gc = () => {
    for (const [id, p] of E.players) {
      const c = C.getClip(id);
      if (!c || !C.mediaOf(c) || C.mediaUrl(C.mediaOf(c)) !== p.url) destroy(id);
    }
  };

  E.getSrc = (c) => {
    if (c.kind === 'image') { const r = C.MR[c.mediaId]; return r && r.img; }
    if (c.kind !== 'video') return null;
    const p = E.player(c);
    if (!p || p.el.readyState < 2) return p && p.lastOk ? p.el : null;
    p.lastOk = true;
    return p.el;
  };

  // ---------- canvas sizing ----------
  E.resize = () => {
    const s = C.project.settings;
    const k = C.UI.exporting ? 1 : C.UI.previewScale;
    const w = Math.round(s.width * k), h = Math.round(s.height * k);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; E.layout(); }
  };
  E.layout = () => {
    const st = C.$('#stage'); const s = C.project.settings;
    const pad = document.fullscreenElement ? 0 : 24;
    const aw = st.clientWidth - pad * 2, ah = st.clientHeight - pad * 2;
    const r = Math.min(aw / s.width, ah / s.height);
    const wrap = C.$('#canvasWrap');
    wrap.style.width = Math.max(10, Math.floor(s.width * r)) + 'px';
    wrap.style.height = Math.max(10, Math.floor(s.height * r)) + 'px';
    C.emit('drawn');
  };

  // ---------- transport ----------
  E.play = () => {
    if (C.UI.playing) return;
    E.ensureAudio();
    const d = C.duration();
    if (d <= 0) return;
    const r = C.project.range;
    if (C.UI.loop && r && (C.UI.playhead < r.in || C.UI.playhead >= r.out - 0.01)) C.UI.playhead = r.in;
    else if (C.UI.playhead >= d - 0.01) C.UI.playhead = r ? r.in : 0;
    C.UI.playing = true;
    startWall = performance.now(); startT = C.UI.playhead;
    C.emit('playstate');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  };
  E.pause = () => {
    if (!C.UI.playing) return;
    C.UI.playing = false;
    cancelAnimationFrame(raf);
    for (const p of E.players.values()) { try { p.el.pause(); } catch (_) {} if (p.gain) p.gain.gain.value = 0; }
    C.UI.playhead = C.snapTime(C.UI.playhead);
    E.sync(C.UI.playhead, false);
    C.emit('playstate'); C.emit('time'); E.requestDraw();
  };
  E.toggle = () => (C.UI.playing ? E.pause() : E.play());
  E.seek = (t) => {
    t = Math.max(0, t);
    C.UI.playhead = t;
    if (C.UI.playing) { startWall = performance.now(); startT = t; E.sync(t, true, true); }
    else { E.sync(t, false); E.requestDraw(); }
    C.emit('time');
  };

  function tick() {
    if (!C.UI.playing) return;
    let t = startT + (performance.now() - startWall) / 1000;
    const rg = C.project.range;
    const d = C.UI.loop && rg ? rg.out : C.duration();
    if (t >= d) {
      const back = C.UI.loop && rg ? rg.in : 0;
      if (C.UI.loop && d > 0) { startWall = performance.now(); startT = back; t = back; E.sync(back, true, true); }
      else { C.UI.playhead = d; E.pause(); return; }
    }
    C.UI.playhead = t;
    E.sync(t, true);
    draw();
    C.emit('time');
    raf = requestAnimationFrame(tick);
  }

  E.sync = (t, playing, hard = false) => {
    const need = C.neededAt(t);
    const ids = new Set();
    for (const n of need) {
      const c = n.clip;
      if (c.kind !== 'video' && c.kind !== 'audio') continue;
      const p = E.player(c); if (!p) continue;
      ids.add(c.id);
      const el = p.el;
      if (playing && !c.freeze) {
        if (Math.abs(el.playbackRate - c.speed) > 1e-3) el.playbackRate = c.speed;
        const drift = Math.abs(el.currentTime - n.src);
        if (el.paused) { if (drift > 0.05) el.currentTime = n.src; el.play().catch(() => {}); }
        else if (hard || drift > 0.25 + 0.1 * c.speed) el.currentTime = n.src;
        if (p.gain) p.gain.gain.setTargetAtTime(C.audioGain(c, t), E.ac.currentTime, 0.012);
      } else {
        if (!el.paused) el.pause();
        if (p.gain) p.gain.gain.value = 0;
        if (Math.abs(el.currentTime - n.src) > 0.5 / C.fps()) el.currentTime = n.src;
      }
    }
    for (const [id, p] of E.players) {
      if (ids.has(id)) continue;
      if (!p.el.paused) p.el.pause();
      if (p.gain) p.gain.gain.value = 0;
      // pre-roll upcoming clips so they start instantly
      const c = C.getClip(id);
      if (c && c.start > t && c.start - t < 1.2 && Math.abs(p.el.currentTime - c.in) > 0.05 && !p.el.seeking) p.el.currentTime = c.in;
    }
  };

  function draw() {
    C.renderFrame(ctx, C.UI.playhead, canvas.width, canvas.height, E.getSrc);
    C.emit('drawn');
  }
  E.draw = draw;
  E.requestDraw = () => {
    if (C.UI.playing || drawQueued || C.UI.exporting) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  };

  // ---------- exact rendering for export ----------
  const seekExact = (el, t) => new Promise((res) => {
    if (Math.abs(el.currentTime - t) < 0.0005 && el.readyState >= 2) return res();
    const to = setTimeout(res, 4000);
    const done = () => { clearTimeout(to); el.removeEventListener('seeked', done); res(); };
    el.addEventListener('seeked', done);
    el.currentTime = t;
  });
  const waitReady = (el) => new Promise((res) => {
    if (el.readyState >= 2) return res();
    const to = setTimeout(res, 8000);
    el.addEventListener('loadeddata', () => { clearTimeout(to); res(); }, { once: true });
  });
  E.renderExact = async (t, cx, W, H) => {
    const need = C.neededAt(t);
    const jobs = [];
    for (const n of need) {
      if (n.clip.kind !== 'video') continue;
      const p = E.player(n.clip); if (!p) continue;
      if (!p.el.paused) p.el.pause();
      jobs.push(waitReady(p.el).then(() => seekExact(p.el, n.src)));
    }
    await Promise.all(jobs);
    C.renderFrame(cx, t, W, H, (c) => {
      if (c.kind === 'image') { const r = C.MR[c.mediaId]; return r && r.img; }
      if (c.kind !== 'video') return null;
      const p = E.players.get(c.id); return p && p.el.readyState >= 2 ? p.el : null;
    });
  };
  // ---------- fast export: FFmpeg-decoded sequential frames ----------
  E.exportSession = (W, H, fps) => {
    const st = new Map();
    const even = (v) => Math.max(2, Math.round(v / 2) * 2);
    let n = 0;
    async function prepare(c, src) {
      let s = st.get(c.id);
      if (s) return s;
      const m = C.mediaOf(c);
      const mw = m.width || 1280, mh = m.height || 720;
      const sf = Math.min(1, Math.max(W / mw, H / mh) * Math.max(1, c.t.scale));
      const w = even(mw * sf), h = even(mh * sf);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      s = { key: 'x' + (n++) + c.id, cv, cx: cv.getContext('2d'), w, h, idx: -1, has: false, start: src, rate: c.freeze ? 1 : fps * c.speed, failed: false };
      st.set(c.id, s);
      try { await window.native.decOpen({ key: s.key, path: C.mediaPath(m), start: src, rate: s.rate, width: w, height: h }); }
      catch (e) { s.failed = true; }
      return s;
    }
    async function pull(c, src) {
      const s = await prepare(c, src);
      if (s.failed) {
        const p = E.player(c); if (!p) return;
        if (!p.el.paused) p.el.pause();
        await waitReady(p.el); await seekExact(p.el, src);
        s.cx.drawImage(p.el, 0, 0, s.w, s.h); s.has = true; return;
      }
      const k = c.freeze ? 0 : Math.round((src - s.start) * s.rate);
      if (k <= s.idx) return;
      const buf = await window.native.decNext(s.key, Math.max(0, k - s.idx - 1));
      s.idx = k;
      if (buf && buf.byteLength === s.w * s.h * 4) {
        s.cx.putImageData(new ImageData(new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength), s.w, s.h), 0, 0);
        s.has = true;
      } else if (!s.has) {
        s.failed = true; return pull(c, src);
      }
    }
    return {
      async frame(i, ctx, t0 = 0) {
        const t = t0 + i / fps;
        const need = C.neededAt(t).filter((x) => x.clip.kind === 'video');
        await Promise.all(need.map((x) => pull(x.clip, x.src)));
        const ids = new Set(need.map((x) => x.clip.id));
        for (const [id, s] of st) if (!ids.has(id)) { window.native.decClose(s.key); st.delete(id); }
        C.renderFrame(ctx, t, W, H, (c) => {
          if (c.kind === 'image') { const r = C.MR[c.mediaId]; return r && r.img; }
          if (c.kind !== 'video') return null;
          const s = st.get(c.id); return s && s.has ? s.cv : null;
        });
      },
      close() { window.native.decClose(null); st.clear(); },
    };
  };
  const meterBuf = new Float32Array(512);
  E.level = () => { if (!E.analyser || !C.UI.playing) return 0; E.analyser.getFloatTimeDomainData(meterBuf); let p = 0; for (const v of meterBuf) p = Math.max(p, Math.abs(v)); return p; };
  E.stopAll = () => { for (const p of E.players.values()) { try { p.el.pause(); } catch (_) {} if (p.gain) p.gain.gain.value = 0; } };
})(window.C);
