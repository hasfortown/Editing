/* Cutroom — compositor (shared by preview and export) */
(function (C) {
  C.TRANSITIONS = [
    { id: 'dissolve', name: 'Cross dissolve', anim: 'tr-fade' },
    { id: 'fadeblack', name: 'Dip to black', anim: 'tr-black' },
    { id: 'fadewhite', name: 'Dip to white', anim: 'tr-white' },
    { id: 'slideLeft', name: 'Slide left', anim: 'tr-slide-l' },
    { id: 'slideRight', name: 'Slide right', anim: 'tr-slide-r' },
    { id: 'slideUp', name: 'Slide up', anim: 'tr-slide-u' },
    { id: 'slideDown', name: 'Slide down', anim: 'tr-slide-d' },
    { id: 'push', name: 'Push', anim: 'tr-slide-l' },
    { id: 'wipeLeft', name: 'Wipe right', anim: 'tr-wipe-l' },
    { id: 'wipeRight', name: 'Wipe left', anim: 'tr-wipe-r' },
    { id: 'circle', name: 'Circle reveal', anim: 'tr-circle' },
    { id: 'doors', name: 'Doors', anim: 'tr-doors' },
    { id: 'zoom', name: 'Zoom', anim: 'tr-zoom' },
    { id: 'spin', name: 'Spin', anim: 'tr-spin' },
    { id: 'blur', name: 'Blur', anim: 'tr-blur' },
    { id: 'glitch', name: 'Glitch', anim: 'tr-glitch' },
    { id: 'cube', name: '3D cube', anim: 'tr-cube' },
    { id: 'flip3d', name: '3D card flip', anim: 'tr-flip' },
    { id: 'tumble', name: '3D tumble', anim: 'tr-tumble' },
    { id: 'door', name: '3D door', anim: 'tr-door' },
    { id: 'swing', name: '3D swing in', anim: 'tr-swing' },
  ];
  C.ANIMS_IN = [['none', 'None'], ['fade', 'Fade'], ['pop', 'Pop'], ['slideUp', 'Rise'], ['slideDown', 'Drop'], ['slideLeft', 'From right'], ['slideRight', 'From left'], ['zoomIn', 'Zoom in'], ['zoomOut', 'Zoom out'], ['spin', 'Spin'], ['blur', 'Focus'], ['typewriter', 'Typewriter']];
  C.ANIMS_OUT = [['none', 'None'], ['fade', 'Fade'], ['pop', 'Shrink'], ['slideUp', 'Rise'], ['slideDown', 'Drop'], ['slideLeft', 'To left'], ['slideRight', 'To right'], ['zoomIn', 'Zoom in'], ['zoomOut', 'Zoom out'], ['spin', 'Spin'], ['blur', 'Defocus']];

  const EPS = 0.02;
  C.prevAdjacent = (c) => C.clipsOn(c.trackId).find((o) => o.id !== c.id && Math.abs(C.clipEnd(o) - c.start) < EPS) || null;
  C.nextAdjacent = (c) => C.clipsOn(c.trackId).find((o) => o.id !== c.id && Math.abs(o.start - C.clipEnd(c)) < EPS) || null;
  C.trDur = (c) => (c.transition ? Math.min(c.transition.duration, c.duration) : 0);

  C.srcTime = (c, t) => {
    let s = c.freeze ? c.in : c.in + (t - c.start) * c.speed;
    const m = C.mediaOf(c);
    if (m && m.duration) s = Math.min(s, m.duration - 0.04);
    return Math.max(0, s);
  };

  // What each visual track shows at time t
  C.trackStateAt = (track, t) => {
    const clips = C.clipsOn(track.id);
    let b = null;
    for (const c of clips) if (t >= c.start - 1e-6 && t < C.clipEnd(c) - 1e-6) b = c;
    if (!b) return null;
    const d = C.trDur(b);
    const local = t - b.start;
    if (d > 0 && local < d) {
      const a = C.prevAdjacent(b);
      return { b, a, tr: { type: b.transition.type, p: C.clamp(local / d, 0, 1), d } };
    }
    return { b, a: null, tr: null };
  };

  // Clips that need a playing/seeked source at time t: [{clip, srcTime}]
  C.neededAt = (t) => {
    const out = [];
    for (const tr of C.tracks()) {
      if (tr.type === 'video') {
        const st = C.trackStateAt(tr, t);
        if (!st) continue;
        out.push({ clip: st.b, src: C.srcTime(st.b, t) });
        if (st.a) out.push({ clip: st.a, src: C.srcTime(st.a, t), tail: true });
      } else {
        for (const c of C.clipsOn(tr.id)) {
          if (t >= c.start && t < C.clipEnd(c)) out.push({ clip: c, src: C.srcTime(c, t) });
          else {
            const n = C.nextAdjacent(c); const d = n ? C.trDur(n) : 0;
            if (d && t >= C.clipEnd(c) && t < C.clipEnd(c) + d) out.push({ clip: c, src: C.srcTime(c, t), tail: true });
          }
        }
      }
    }
    return out;
  };

  // Audio gain for a clip at timeline time t (live preview)
  C.audioGain = (c, t) => {
    const tr = C.project.tracks[c.trackId];
    if (!tr || tr.muted || c.muted || !C.hasAudio(c)) return 0;
    const local = t - c.start;
    let g = C.kf.value(c, 'volume', Math.min(Math.max(0, local), c.duration));
    if (local < 0) return 0;
    if (local < c.duration) {
      if (c.fadeIn > 0 && local < c.fadeIn) g *= local / c.fadeIn;
      if (c.fadeOut > 0 && local > c.duration - c.fadeOut) g *= Math.max(0, (c.duration - local) / c.fadeOut);
      const d = C.trDur(c);
      if (d && local < d && C.prevAdjacent(c)) g *= local / d;
      return g;
    }
    const n = C.nextAdjacent(c); const d = n ? C.trDur(n) : 0;
    if (d && local < c.duration + d) return g * (1 - (local - c.duration) / d);
    return 0;
  };

  // Audio mix plan for FFmpeg export
  C.audioPlan = (trackFilter = null) => {
    const segs = [];
    for (const tr of C.tracks()) {
      if (tr.muted) continue;
      if (trackFilter && !trackFilter(tr)) continue;
      for (const c of C.clipsOn(tr.id)) {
        if (c.muted || !C.hasAudio(c) || (c.volume <= 0 && !C.kf.has(c, 'volume'))) continue;
        const m = C.mediaOf(c); if (!m) continue;
        let dur = c.duration, fadeIn = c.fadeIn, fadeOut = c.fadeOut;
        const d = C.trDur(c);
        if (d && C.prevAdjacent(c)) fadeIn = Math.max(fadeIn, d);
        const n = C.nextAdjacent(c); const nd = n ? C.trDur(n) : 0;
        if (nd) { const room = m.duration ? (m.duration - c.in) / c.speed - c.duration : nd; const ext = Math.max(0, Math.min(nd, room)); dur += ext; fadeOut = Math.max(fadeOut, ext); }
        segs.push({ path: (C.voice && C.voice.processedPath(c)) || C.mediaPath(m), start: c.start, in: c.in, dur, speed: c.speed, volume: c.volume, fadeIn, fadeOut, volExpr: C.kf.volumeExpr(c) });
      }
    }
    return { segments: segs };
  };

  // ---------- drawing ----------
  const filterStr = (fx, W, extraBlur = 0) => {
    const f = [];
    if (fx.brightness) f.push(`brightness(${1 + fx.brightness / 100})`);
    if (fx.contrast) f.push(`contrast(${1 + fx.contrast / 100})`);
    if (fx.saturation) f.push(`saturate(${Math.max(0, 1 + fx.saturation / 100)})`);
    if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
    if (fx.grayscale) f.push(`grayscale(${fx.grayscale}%)`);
    if (fx.sepia) f.push(`sepia(${fx.sepia}%)`);
    if (fx.invert) f.push(`invert(${fx.invert}%)`);
    const b = (fx.blur || 0) + extraBlur;
    if (b > 0.05) f.push(`blur(${(b * W) / 1920}px)`);
    return f.length ? f.join(' ') : 'none';
  };

  function animState(c, local) {
    const s = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, chars: 1 };
    const ad = Math.min(c.anim.dur || 0.5, c.duration / 2);
    const apply = (type, k /* 0 = hidden, 1 = shown */) => {
      const e = C.ease.out(k), inv = 1 - e;
      switch (type) {
        case 'fade': s.alpha *= k; break;
        case 'pop': s.scale *= type === 'pop' ? Math.max(0.01, C.ease.outBack(k) * 1) : 1; s.alpha *= Math.min(1, k * 2); break;
        case 'slideUp': s.dy += inv * 0.18; s.alpha *= k; break;
        case 'slideDown': s.dy -= inv * 0.18; s.alpha *= k; break;
        case 'slideLeft': s.dx += inv * 0.25; s.alpha *= k; break;
        case 'slideRight': s.dx -= inv * 0.25; s.alpha *= k; break;
        case 'zoomIn': s.scale *= 0.6 + 0.4 * e; s.alpha *= k; break;
        case 'zoomOut': s.scale *= 1.5 - 0.5 * e; s.alpha *= k; break;
        case 'spin': s.rot += inv * -180; s.scale *= Math.max(0.01, e); break;
        case 'blur': s.blur += inv * 40; s.alpha *= k; break;
        case 'typewriter': s.chars = k; break;
      }
    };
    if (c.anim.in && c.anim.in !== 'none' && local < ad) apply(c.anim.in, C.clamp(local / ad, 0, 1));
    if (c.anim.out && c.anim.out !== 'none' && local > c.duration - ad) {
      let type = c.anim.out;
      const k = C.clamp((c.duration - local) / ad, 0, 1);
      if (type === 'slideLeft') { s.dx -= (1 - C.ease.out(k)) * 0.25; s.alpha *= k; }
      else if (type === 'slideRight') { s.dx += (1 - C.ease.out(k)) * 0.25; s.alpha *= k; }
      else if (type === 'slideUp') { s.dy -= (1 - C.ease.out(k)) * 0.18; s.alpha *= k; }
      else if (type === 'slideDown') { s.dy += (1 - C.ease.out(k)) * 0.18; s.alpha *= k; }
      else if (type === 'pop') { s.scale *= Math.max(0.01, C.ease.out(k)); s.alpha *= k; }
      else apply(type, k);
    }
    if (c.anim.kenburns) s.scale *= 1 + 0.12 * C.clamp(local / c.duration, 0, 1);
    return s;
  }

  // Intrinsic size of a clip's content in canvas pixels (before transform scale)
  C.contentSize = (c, W, H, ctx) => {
    if (c.kind === 'text') return measureText(ctx, c, W, H);
    if (c.kind === 'color') return { w: W, h: H };
    if (c.kind === 'shape') { const k = Math.min(W, H) / 1080, pad = ((c.shape.strokeW || 0) + 2) * k * 2; return { w: Math.abs(c.shape.w) * k + pad, h: Math.abs(c.shape.h) * k + pad }; }
    const m = C.mediaOf(c);
    const mw = (m && m.width) || 16, mh = (m && m.height) || 9;
    const r = c.t.fit === 'cover' ? Math.max(W / mw, H / mh) : c.t.fit === 'stretch' ? null : Math.min(W / mw, H / mh);
    if (r === null) return { w: W, h: H };
    return { w: mw * r, h: mh * r };
  };

  function textFont(tx, px) {
    return `${tx.italic ? 'italic ' : ''}${tx.bold ? '700' : '400'} ${px}px "${tx.font}", "Segoe UI Emoji", "Segoe UI", Arial, sans-serif`;
  }
  function textLines(tx) { const s = tx.uppercase ? tx.content.toUpperCase() : tx.content; return s.split('\n'); }
  function measureText(ctx, c, W, H) {
    const tx = c.text; const px = tx.size * (Math.min(W, H) / 1080);
    ctx.save(); ctx.font = textFont(tx, px); try { ctx.letterSpacing = (tx.letterSpacing * px / 100) + 'px'; } catch (_) {}
    const lines = textLines(tx);
    let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l || ' ').width);
    ctx.restore();
    const pad = tx.bgOpacity > 0 ? px * 0.35 : 0;
    return { w: w + pad * 2, h: lines.length * px * tx.lineHeight + pad * 2, px, lines, pad };
  }

  function drawText(ctx, c, W, H, chars, local = 0) {
    const ms = measureText(ctx, c, W, H);
    C.textFX.draw(ctx, c, ms, chars, local);
  }

  C.BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'], ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity'], ['lighter', 'Add']];

  function fadeAlpha(c, local) {
    let a = 1;
    if (local < c.duration) {
      if (c.fadeIn > 0 && local < c.fadeIn) a *= local / c.fadeIn;
      if (c.fadeOut > 0 && local > c.duration - c.fadeOut) a *= Math.max(0, (c.duration - local) / c.fadeOut);
    }
    return a;
  }

  // Effect clip ("adjustment layer"): applies its effects to everything below it
  function drawEffectClip(ctx, c, t, local, W, H, o) {
    const alpha = c.t.opacity * fadeAlpha(c, local) * (o.alpha ?? 1);
    const graded = c.grade && !C.UI.bypassGrade && C.grade.active(c.grade);
    if (alpha <= 0.002 || ((!c.effects || !c.effects.length) && !graded)) return;
    const env = { W, H, t: local, T: t, dur: c.duration, seed: C.fx.seedOf(c.id) };
    if (graded) {
      const g = C.grade.apply(ctx.canvas, c.grade, W, H);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = C.clamp(alpha, 0, 1); ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
      ctx.drawImage(g, 0, 0, W, H); ctx.restore();
    }
    if (!c.effects || !c.effects.length) return;
    const s = { dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1, blur: 0, chars: 1 };
    C.fx.applyPre(s, c.effects, env);
    if (s.dx || s.dy || s.scale !== 1 || s.rot) {
      const T = C.fx.canvas('adjpre', W, H); const tc = T._cx; tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over'; tc.filter = 'none';
      tc.clearRect(0, 0, W, H); tc.drawImage(ctx.canvas, 0, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = C.project.settings.bg || '#000'; ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2 + s.dx * W * alpha, H / 2 + s.dy * H * alpha); ctx.rotate(((s.rot * alpha) * Math.PI) / 180); const k = 1 + (s.scale - 1) * alpha; ctx.scale(k, k);
      ctx.drawImage(T, -W / 2, -H / 2); ctx.restore();
    }
    if (C.fx.hasLayer(c.effects)) C.fx.applyToCanvas(ctx, c.effects, env, alpha);
  }

  const styleOn = (st) => st && Object.values(st).some((x) => x && x.on);
  C.scaleStyles = (st, k) => {
    const o = {};
    for (const n in st) { const v = st[n]; if (!v || !v.on) continue; o[n] = Object.assign({}, v); for (const key of ['distance', 'size']) if (o[n][key] != null) o[n][key] *= k; }
    return o;
  };

  // Masks: shapes in content space (fractions of the content box)
  C.MASK_TYPES = [['path', 'Pen (freeform)'], ['rect', 'Rectangle'], ['ellipse', 'Circle / ellipse'], ['rounded', 'Rounded rectangle'], ['star', 'Star'], ['heart', 'Heart'], ['triangle', 'Triangle'], ['linear', 'Split (linear)'], ['mirror', 'Band (mirror)']];
  function applyMasks(cc, masks, cw, ch) {
    const mc = C.fx.canvas('maskAll', cw, ch); const m = mc._cx;
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1; m.filter = 'none'; m.clearRect(0, 0, cw, ch);
    masks.forEach((mk, i) => {
      const t = C.fx.canvas('mask1', cw, ch); const x = t._cx;
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, cw, ch);
      const f = ((mk.feather || 0) / 100) * Math.min(cw, ch) * 0.2;
      x.filter = f > 0.3 ? `blur(${f}px)` : 'none';
      x.fillStyle = '#fff';
      x.save(); x.translate((0.5 + (mk.x || 0)) * cw, (0.5 + (mk.y || 0)) * ch); x.rotate(((mk.rot || 0) * Math.PI) / 180);
      const w = (mk.w ?? 0.5) * cw, h = (mk.h ?? 0.5) * ch, big = (cw + ch) * 3;
      if (mk.type === 'path') { x.scale(mk.w ?? 1, mk.h ?? 1); x.beginPath(); C.geo.tracePath(x, mk.pts, cw, ch, true); x.fill(); }
      else if (mk.type === 'linear') x.fillRect(-big, 0, big * 2, big);
      else if (mk.type === 'mirror') x.fillRect(-big, -h / 2, big * 2, h);
      else { C.geo.shapePath(x, { kind: mk.type === 'rect' ? 'rect' : mk.type, w, h, radius: mk.round || 0, points: 5, inner: 0.45 }); x.fill(); }
      x.restore(); x.filter = 'none';
      if (mk.invert) { x.globalCompositeOperation = 'xor'; x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.globalCompositeOperation = 'source-over'; }
      if (i === 0 && (mk.mode === 'subtract')) { m.fillStyle = '#fff'; m.fillRect(0, 0, cw, ch); }
      m.globalCompositeOperation = i === 0 ? (mk.mode === 'subtract' ? 'destination-out' : 'source-over') : mk.mode === 'subtract' ? 'destination-out' : mk.mode === 'intersect' ? 'destination-in' : 'source-over';
      m.drawImage(t, 0, 0);
      m.globalCompositeOperation = 'source-over';
    });
    const x = cc._cx; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(mc, 0, 0); x.globalCompositeOperation = 'source-over';
  }

  function drawShapeClip(g, c, sz, k) {
    const s = c.shape; const w = s.w * k, h = s.h * k;
    C.geo.shapePath(g, { kind: s.kind, w, h, radius: s.radius, points: s.points, inner: s.inner });
    if (s.fillOn !== false && s.kind !== 'line') {
      if (s.fillMode === 'gradient') { const a = ((s.gradAngle ?? 90) * Math.PI) / 180, r = Math.hypot(w, h) / 2; const gr = g.createLinearGradient(-Math.sin(a) * r, Math.cos(a) * -r, Math.sin(a) * r, Math.cos(a) * r); gr.addColorStop(0, s.grad1 || '#19d3c5'); gr.addColorStop(1, s.grad2 || '#7c5cff'); g.fillStyle = gr; }
      else g.fillStyle = s.fill;
      g.fill(s.kind === 'ring' ? 'evenodd' : 'nonzero');
    }
    if ((s.strokeW || 0) > 0 || s.kind === 'line') { g.lineWidth = Math.max(1, (s.strokeW || 8) * k); g.strokeStyle = s.kind === 'line' && !s.strokeW ? s.fill : s.stroke; g.lineJoin = 'round'; g.lineCap = 'round'; if (s.dash) g.setLineDash([s.dash * k, s.dash * k]); g.stroke(); g.setLineDash([]); }
  }

  function paintContent(g, c, sz, src, W, H, an, local, fl) {
    g.filter = fl;
    if (c.kind === 'text') drawText(g, c, W, H, an.chars, local);
    else if (c.kind === 'color') { g.fillStyle = c.color; g.fillRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h); }
    else if (c.kind === 'shape') drawShapeClip(g, c, sz, Math.min(W, H) / 1080);
    else g.drawImage(src, -sz.w / 2, -sz.h / 2, sz.w, sz.h);
    g.filter = 'none';
    if (c.fx.temperature && c.kind !== 'text' && c.kind !== 'shape') {
      const a0 = g.globalAlpha, op = g.globalCompositeOperation;
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a0 * Math.min(1, Math.abs(c.fx.temperature) / 100) * 0.5;
      g.fillStyle = c.fx.temperature > 0 ? '#ff9a2e' : '#2e8bff'; g.fillRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h);
      g.globalAlpha = a0; g.globalCompositeOperation = op;
    }
    if (c.fx.vignette && c.kind !== 'text' && c.kind !== 'shape') {
      const op = g.globalCompositeOperation; g.globalCompositeOperation = 'source-atop';
      const gr = g.createRadialGradient(0, 0, Math.min(sz.w, sz.h) * 0.25, 0, 0, Math.hypot(sz.w, sz.h) / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${c.fx.vignette / 100})`);
      g.fillStyle = gr; g.fillRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h); g.globalCompositeOperation = op;
    }
  }

  // Draw one clip. o: {alpha, dx, dy, scale, rot, blur, clipFn, g3:{rx,ry,tx,tz}}
  C.drawClip = (ctx, c0, t, W, H, src, o = {}) => {
    const local = t - c0.start;
    const c = C.evalClip(c0, Math.min(local, c0.duration + 10));
    if (c.kind === 'effect') return drawEffectClip(ctx, c, t, local, W, H, o);
    const an = animState(c, Math.min(local, c.duration));
    let fxs = c.effects && c.effects.length ? c.effects : null; let tOff = 0;
    const tf = C.UI.tryFx; if (tf && !tf.global && tf.clip === c0.id) { fxs = (fxs || []).concat(tf.effects); tOff = tf.clock || 0; }
    const env = { W, H, t: local + tOff, T: t + tOff, dur: c.duration, seed: fxs ? C.fx.seedOf(c.id) : 1 };
    if (fxs) C.fx.applyPre(an, fxs, env);
    const alpha = c.t.opacity * an.alpha * (o.alpha ?? 1) * fadeAlpha(c, local);
    if (alpha <= 0.002) return;
    if ((c.kind === 'video' || c.kind === 'image') && !src) return;
    if ((c.kind === 'video' || c.kind === 'image') && c.grade && !C.UI.bypassGrade && C.grade.active(c.grade)) src = C.grade.apply(src, c.grade, Math.max(W, H) * 1.25, Math.max(W, H) * 1.25);
    const k = Math.min(W, H) / 1080;
    const shape = fxs ? C.fx.shape(fxs) : null;
    const comp = fxs ? C.fx.compositeFilter(fxs, W) : 'none';
    const styles = styleOn(c.styles) ? c.styles : null;
    const masks = (c.masks || []).filter((m) => m && m.on !== false);
    const tt = c.t, g3 = o.g3 || null;
    const has3d = !!(tt.rx || tt.ry || tt.z || g3);
    const warp = C.geo.warpActive(c.warp) ? c.warp : null;
    const geom = has3d || !!warp;
    const needContent = geom || masks.length > 0 || !!shape;
    const layered = (!!fxs && (C.fx.hasLayer(fxs) || comp !== 'none')) || !!styles;
    const blend = c.blend || 'source-over';
    let L = null, g = ctx;
    if (layered) {
      const cv = C.fx.canvas('layer', W, H); L = { cv, cx: cv._cx, W, H }; g = L.cx;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.clearRect(0, 0, W, H);
    }
    const sz = C.contentSize(c, W, H, g);
    const cx = tt.x * W + (o.dx || 0) + an.dx * W, cy = tt.y * H + (o.dy || 0) + an.dy * H;
    const rot = tt.rotation + an.rot + (o.rot || 0);
    const sc = tt.scale * an.scale * (o.scale ?? 1);
    let fl = filterStr(c.fx, W, an.blur + (o.blur || 0)); if (o.filter) fl = (fl === 'none' ? '' : fl + ' ') + o.filter;
    const osx = o.sx ?? 1, osy = o.sy ?? 1;
    g.save();
    if (!layered) {
      if (o.clipFn) { g.beginPath(); o.clipFn(g); g.clip(); }
      g.globalAlpha = C.clamp(alpha, 0, 1);
      if (blend !== 'source-over') g.globalCompositeOperation = blend;
    }
    if (!needContent) {
      g.translate(cx, cy); if (rot) g.rotate((rot * Math.PI) / 180);
      g.scale(sc * osx * (tt.flipH ? -1 : 1), sc * osy * (tt.flipV ? -1 : 1));
      paintContent(g, c, sz, src, W, H, an, local, fl);
    } else {
      // render the clip's content into its own canvas (masks, rounding, 3D and warps work on it)
      let rs = C.clamp(Math.abs(sc), 0.05, 4);
      let cw = Math.max(2, Math.round(sz.w * rs)), ch = Math.max(2, Math.round(sz.h * rs));
      const cap = 4096; if (cw > cap || ch > cap) { const f = cap / Math.max(cw, ch); cw = Math.round(cw * f); ch = Math.round(ch * f); }
      const cc = C.fx.canvas('content', cw, ch); const x = cc._cx;
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, cw, ch);
      x.save(); x.translate(cw / 2, ch / 2); x.scale(cw / sz.w, ch / sz.h);
      const rr = shape ? (Math.min(sz.w, sz.h) * shape.radius) / 100 : 0;
      if (shape) { x.save(); x.beginPath(); x.roundRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h, rr); x.clip(); }
      paintContent(x, c, sz, src, W, H, an, local, fl);
      if (shape) {
        x.restore();
        if (shape.border > 0) { x.lineWidth = (shape.border * (W / 1920)) / Math.max(0.01, Math.abs(sc)) * 2; x.strokeStyle = shape.color; x.beginPath(); x.roundRect(-sz.w / 2, -sz.h / 2, sz.w, sz.h, rr); x.save(); x.clip(); x.stroke(); x.restore(); }
      }
      x.restore();
      if (masks.length) applyMasks(cc, masks, cw, ch);
      const fx = tt.flipH ? -1 : 1, fy = tt.flipV ? -1 : 1;
      if (!geom) {
        g.translate(cx, cy); if (rot) g.rotate((rot * Math.PI) / 180);
        g.scale((fx * sc * osx * sz.w) / cw, (fy * sc * osy * sz.h) / ch);
        g.drawImage(cc, -cw / 2, -ch / 2);
      } else {
        const d = (tt.persp ?? 1) * 1.6 * Math.max(W, H);
        const w2 = sz.w * sc, h2 = sz.h * sc;
        const wf = warp ? C.geo.warpFn(warp, w2, h2, local) : (u, v) => [(u - 0.5) * w2, (v - 0.5) * h2, 0];
        const rx = (tt.rx || 0) + ((g3 && g3.rx) || 0), ry = (tt.ry || 0) + ((g3 && g3.ry) || 0);
        const tz = (tt.z || 0) * k * 10 + ((g3 && g3.tz) || 0), tx = (g3 && g3.tx) || 0, ty = (g3 && g3.ty) || 0;
        const map = (u, v) => { let p = wf(u, v); p = [p[0] * fx, p[1] * fy, p[2]]; p = C.geo.rot3(p, rx, ry, rot); p[0] += tx; p[1] += ty; p[2] += tz; return C.geo.project(p, cx, cy, d); };
        const dense = warp && /wrap|sphere|fisheye|twist|arc/.test(warp.mode);
        const cull = warp && (warp.mode === 'wrap' || warp.mode === 'sphere') ? (fx * fy > 0 ? 1 : -1) : 0;
        C.geo.drawMesh(g, cc, cw, ch, dense ? 28 : warp ? 18 : 10, dense ? 18 : warp ? 12 : 10, map, { cull });
      }
    }
    g.restore();
    if (layered) {
      if (fxs) C.fx.applyLayer(L, fxs, env);
      let out = L.cv;
      if (styles && C.photo && C.photo.applyStyles) out = C.photo.applyStyles(L.cv, C.scaleStyles(styles, k), W, H);
      ctx.save();
      if (o.clipFn) { ctx.beginPath(); o.clipFn(ctx); ctx.clip(); }
      ctx.globalAlpha = C.clamp(alpha, 0, 1);
      ctx.globalCompositeOperation = blend;
      ctx.filter = comp;
      ctx.drawImage(out, 0, 0);
      ctx.restore();
    }
  };

  // offscreen buffers for transitions
  const trPool = {};
  C.trOffscreen = (name, w, h) => { let c = trPool[name]; if (!c) c = trPool[name] = document.createElement('canvas'); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, w, h); return x; };
  function drawTransition(ctx, st, t, W, H, getSrc) {
    const { a, b, tr } = st;
    const S = {
      p: C.ease.inOut(tr.p), raw: tr.p, ctx, W, H, tr,
      A: (o = {}, g = ctx) => { if (a) C.drawClip(g, a, t, W, H, getSrc(a), o); },
      B: (o = {}, g = ctx) => C.drawClip(g, b, t, W, H, getSrc(b), o),
      off: (name, w = W, h = H) => C.trOffscreen(name, w, h),
    };
    const fn = C.TR_DRAW && C.TR_DRAW[tr.type];
    if (fn) fn(S); else { S.A(); S.B({ alpha: S.p }); }
  }

  // Composite the whole frame
  C.renderFrame = (ctx, t, W, H, getSrc) => {
    ctx.save();
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.project.settings.bg || '#000'; ctx.fillRect(0, 0, W, H);
    const ts = C.tracks().filter((x) => x.type === 'video' && !x.hidden).reverse();
    for (const tr of ts) {
      const st = C.trackStateAt(tr, t);
      if (!st) continue;
      if (st.tr && st.b.kind !== 'effect') drawTransition(ctx, st, t, W, H, getSrc);
      else C.drawClip(ctx, st.b, t, W, H, getSrc(st.b));
    }
    const tf = C.UI.tryFx;
    if (tf && tf.global && C.fx) { const tt = t + (tf.clock || 0); const pre = { dx: 0, dy: 0, scale: 1, rot: 0 }; C.fx.applyPre(pre, tf.effects, { W, H, t: tt, T: tt, dur: 5, seed: 3 }); C.fx.applyToCanvas(ctx, tf.effects, { W, H, t: tt, T: tt, dur: 5, seed: 3 }); }
    ctx.restore();
  };

  // Bounding box of a clip in canvas pixels (for preview handles/hit testing)
  C.clipBox = (ctx, c, W, H) => {
    const sz = C.contentSize(c, W, H, ctx);
    return { cx: c.t.x * W, cy: c.t.y * H, w: sz.w * c.t.scale, h: sz.h * c.t.scale, rot: c.t.rotation };
  };
})(window.C);
