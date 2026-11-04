/* Cutroom — motion tracking: point/area tracker, attach clips, follow blur & masks, stabilize, auto-reframe */
(function (C) {
  const TR = (C.tracker = {});
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#ffd84d', '#19d3c5', '#ff5a8a', '#7c9cff', '#9cff6b', '#ff9a3d'];
  let svg = null, scratch = null, running = null;

  // ---------- frame/time helpers ----------
  const fps = () => C.fps();
  const nFrames = (c) => Math.max(1, Math.floor(c.duration * fps() + 1e-6));
  const frameOf = (c, t) => C.clamp(Math.round((t - c.start) * fps()), 0, nFrames(c) - 1);
  const timeOf = (c, f) => c.start + f / fps();
  const keys = (tk) => Object.keys(tk.pts || {}).map(Number).sort((a, b) => a - b);
  TR.keys = keys;
  TR.posAt = (tk, f) => {
    const p = tk.pts || {};
    if (p[f]) return p[f];
    const ks = keys(tk); if (!ks.length) return tk.seed && tk.seed.f === f ? [tk.seed.x, tk.seed.y, 1] : null;
    if (f < ks[0] || f > ks[ks.length - 1]) return null;
    let i = 0; while (ks[i + 1] < f) i++;
    const a = ks[i], b = ks[i + 1]; if (b - a > 4) return null;
    const k = (f - a) / (b - a), A = p[a], B = p[b];
    return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, Math.min(A[2], B[2])];
  };
  // position to show/start from at frame f
  const startPos = (tk, f) => TR.posAt(tk, f) || (tk.seed ? [tk.seed.x, tk.seed.y, 1] : [0.5, 0.5, 1]);
  TR.range = (tk) => { const ks = keys(tk); return ks.length ? [ks[0], ks[ks.length - 1]] : null; };

  // ---------- coordinate mapping (source-normalised u,v <-> canvas px) ----------
  const W = () => C.project.settings.width, H = () => C.project.settings.height;
  function boxAt(c, f) {
    const ev = C.evalClip(c, f / fps());
    const b = C.clipBox(scratch, ev, W(), H());
    return { b, fx: ev.t.flipH ? -1 : 1, fy: ev.t.flipV ? -1 : 1, ev };
  }
  const rot = (x, y, deg) => { const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a); return [x * cs - y * sn, x * sn + y * cs]; };
  function rel(B, u, v) { return rot((u - 0.5) * B.b.w * B.fx, (v - 0.5) * B.b.h * B.fy, B.b.rot); }
  TR.toCanvas = (c, f, u, v) => { const B = boxAt(c, f); const [x, y] = rel(B, u, v); return [B.b.cx + x, B.b.cy + y]; };
  function toSource(c, f, px, py) {
    const B = boxAt(c, f); let [x, y] = rot(px - B.b.cx, py - B.b.cy, -B.b.rot);
    return [x / (B.b.w * B.fx) + 0.5, y / (B.b.h * B.fy) + 0.5];
  }

  // ---------- image matching (normalised cross-correlation, coarse to fine) ----------
  function gray(buf, w, h) { const g = new Float32Array(w * h); for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114; return g; }
  function half(g, w, h) { const w2 = w >> 1, h2 = h >> 1, o = new Float32Array(w2 * h2); for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const i = y * 2 * w + x * 2; o[y * w2 + x] = (g[i] + g[i + 1] + g[i + w] + g[i + w + 1]) * 0.25; } return { g: o, w: w2, h: h2 }; }
  function integral(g, w, h) {
    const s = new Float64Array((w + 1) * (h + 1)), q = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let rs = 0, rq = 0; for (let x = 0; x < w; x++) { const v = g[y * w + x]; rs += v; rq += v * v; const i = (y + 1) * (w + 1) + x + 1; s[i] = s[i - w - 1] + rs; q[i] = q[i - w - 1] + rq; } }
    return { s, q, w, h };
  }
  const area = (I, a, x, y, tw, th) => { const W1 = I.w + 1; return a[(y + th) * W1 + x + tw] - a[y * W1 + x + tw] - a[(y + th) * W1 + x] + a[y * W1 + x]; };
  function prepT(t, tw, th) { let m = 0; for (const v of t) m += v; m /= t.length; const z = new Float32Array(t.length); let ss = 0; for (let i = 0; i < t.length; i++) { z[i] = t[i] - m; ss += z[i] * z[i]; } return { z, ss: Math.max(ss, 1e-6), tw, th }; }
  function crop(g, w, h, x, y, tw, th) { const o = new Float32Array(tw * th); for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) { const xx = C.clamp(x + i, 0, w - 1), yy = C.clamp(y + j, 0, h - 1); o[j * tw + i] = g[yy * w + xx]; } return o; }
  function ncc(g, w, I, T, x, y) {
    const { z, ss, tw, th } = T; const n = tw * th;
    const s = area(I, I.s, x, y, tw, th), q = area(I, I.q, x, y, tw, th);
    const vr = q - (s * s) / n; if (vr < 1e-3) return -1;
    let acc = 0; for (let j = 0; j < th; j++) { const row = (y + j) * w + x, tr = j * tw; for (let i = 0; i < tw; i++) acc += g[row + i] * z[tr + i]; }
    return acc / Math.sqrt(vr * ss);
  }
  function search(g, w, h, I, T, cx, cy, R) {
    let best = -2, bx = cx, by = cy;
    const x0 = Math.max(0, cx - R), x1 = Math.min(w - T.tw, cx + R), y0 = Math.max(0, cy - R), y1 = Math.min(h - T.th, cy + R);
    const scores = new Map();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const s = ncc(g, w, I, T, x, y); scores.set(y * w + x, s); if (s > best) { best = s; bx = x; by = y; } }
    return { x: bx, y: by, s: best, scores };
  }
  // track one frame: frame {g,w,h,I,h2}, template state st -> new top-left (float) + score
  function step(fr, st, px, py, R) {
    // coarse on half resolution
    const c = search(fr.h2.g, fr.h2.w, fr.h2.h, fr.h2.I, st.T2, Math.round(px / 2), Math.round(py / 2), Math.max(3, Math.ceil(R / 2)));
    // refine at full resolution
    const f = search(fr.g, fr.w, fr.h, fr.I, st.T, c.x * 2, c.y * 2, 2);
    const sc = (x, y) => f.scores.get(y * fr.w + x) ?? ncc(fr.g, fr.w, fr.I, st.T, x, y);
    let dx = 0, dy = 0;
    if (f.x > 0 && f.x < fr.w - st.T.tw) { const a = sc(f.x - 1, f.y), b = f.s, d = sc(f.x + 1, f.y); const den = a - 2 * b + d; if (den < 0) dx = C.clamp((0.5 * (a - d)) / den, -0.5, 0.5); }
    if (f.y > 0 && f.y < fr.h - st.T.th) { const a = sc(f.x, f.y - 1), b = f.s, d = sc(f.x, f.y + 1); const den = a - 2 * b + d; if (den < 0) dy = C.clamp((0.5 * (a - d)) / den, -0.5, 0.5); }
    return { x: f.x + dx, y: f.y + dy, ix: f.x, iy: f.y, s: f.s };
  }
  function frameFrom(buf, w, h) { const g = gray(buf, w, h); const h2 = half(g, w, h); h2.I = integral(h2.g, h2.w, h2.h); return { g, w, h, I: integral(g, w, h), h2 }; }
  function makeState(fr, x, y, tw, th) {
    const raw = crop(fr.g, fr.w, fr.h, x, y, tw, th);
    const st = { raw, tw, th };
    st.T = prepT(raw, tw, th);
    const r2 = half(raw, tw, th); st.T2 = prepT(r2.g, r2.w, r2.h);
    return st;
  }
  function adapt(st, fr, x, y, k) {
    const p = crop(fr.g, fr.w, fr.h, x, y, st.tw, st.th);
    for (let i = 0; i < p.length; i++) st.raw[i] = st.raw[i] * (1 - k) + p[i] * k;
    st.T = prepT(st.raw, st.tw, st.th); const r2 = half(st.raw, st.tw, st.th); st.T2 = prepT(r2.g, r2.w, r2.h);
  }

  // ---------- run a track ----------
  TR.run = async (c, tk, dir = 1) => {
    if (running) return;
    if (c.kind !== 'video') return C.toast('Motion tracking works on video clips', 'info');
    if (c.freeze) return C.toast('This is a freeze frame — nothing moves to track', 'info');
    const m = C.mediaOf(c); const path = C.mediaPath(m); if (!m || !path) return C.toast('The video file is missing', 'error');
    C.engine.pause();
    const f0 = frameOf(c, C.UI.playhead); const N = nFrames(c);
    const last = dir > 0 ? N - 1 : 0; if (f0 === last) return C.toast(dir > 0 ? 'Move the playhead back — you are at the end of the clip' : 'Move the playhead forward — you are at the start of the clip', 'info');
    const mw = m.width || 1280, mh = m.height || 720;
    const dw = Math.min(512, Math.round(mw / 2) * 2), dh = Math.max(2, Math.round((dw * mh) / mw / 2) * 2);
    const fast = !!tk.fast, adaptive = tk.adapt !== false;
    const tw = C.clamp(Math.round(tk.w * dw), 8, 140), th = C.clamp(Math.round(tk.h * dh), 8, 140);
    const R = Math.round(Math.max(tw, th) * (fast ? 1.4 : 0.7) + (fast ? 16 : 8));
    const start = startPos(tk, f0);
    const out = {}; out[f0] = [start[0], start[1], 1];
    const key = 'trk_' + c.id;
    const ui = progressUI(c, tk, dw, dh);
    running = { cancel: false }; const R0 = running;
    let lost = null, done = 0; const total = Math.abs(last - f0);
    try {
      const open = async (fromF) => window.native.decOpen({ key, path, start: C.srcTime(c, timeOf(c, fromF)), rate: fps() * c.speed, width: dw, height: dh });
      const next = async () => { const b = await window.native.decNext(key, 0); return b && b.byteLength === dw * dh * 4 ? new Uint8ClampedArray(b.buffer, b.byteOffset, b.byteLength) : null; };
      let seq; // async iterator of [f, rgba]
      if (dir > 0) {
        await open(f0);
        seq = (async function* () { for (let f = f0; f <= last; f++) { const b = await next(); if (!b) return; yield [f, b]; } })();
      } else {
        const from = Math.max(0, f0 - 900); await open(from);
        ui.status('Reading frames…');
        const frames = []; for (let f = from; f <= f0; f++) { if (R0.cancel) break; const b = await next(); if (!b) break; frames.push([f, new Uint8ClampedArray(b)]); if (f % 30 === 0) { ui.progress((f - from) / Math.max(1, f0 - from) * 0.3); await new Promise((r) => setTimeout(r)); } }
        frames.reverse();
        seq = (async function* () { for (const fr of frames) yield fr; })();
      }
      let st = null, cx = 0, cy = 0, vx = 0, vy = 0;
      for await (const [f, rgba] of seq) {
        if (R0.cancel) break;
        const fr = frameFrom(rgba, dw, dh);
        if (!st) { cx = start[0] * dw - tw / 2; cy = start[1] * dh - th / 2; st = makeState(fr, Math.round(cx), Math.round(cy), tw, th); ui.frame(rgba, f, start, 1); continue; }
        const r = step(fr, st, cx + vx, cy + vy, R);
        if (r.s < (tk.minScore ?? 0.5)) { lost = f; break; }
        vx = (r.x - cx) * 0.7 + vx * 0.3; vy = (r.y - cy) * 0.7 + vy * 0.3; cx = r.x; cy = r.y;
        if (adaptive && r.s > 0.7) adapt(st, fr, r.ix, r.iy, 0.12);
        const u = (cx + tw / 2) / dw, v = (cy + th / 2) / dh; out[f] = [+u.toFixed(5), +v.toFixed(5), +r.s.toFixed(3)];
        done++; if (done % 2 === 0) { ui.frame(rgba, f, out[f], r.s); ui.progress((dir < 0 ? 0.3 : 0) + (done / total) * (dir < 0 ? 0.7 : 1)); await new Promise((res) => setTimeout(res)); }
      }
    } catch (e) { console.warn(e); C.toast('Tracking failed: ' + e.message, 'error'); }
    finally { window.native.decClose(key); running = null; ui.close(); }
    const n = Object.keys(out).length - 1;
    if (n > 0) {
      C.act('Track motion', () => { const t = (C.getClip(c.id).tracks || []).find((x) => x.id === tk.id); if (!t) return; t.pts = Object.assign(t.pts || {}, out); });
      const lastF = Math.max(...Object.keys(out).map(Number).filter((f) => (dir > 0 ? f >= f0 : f <= f0)).map((f) => (dir > 0 ? f : -f))) * (dir > 0 ? 1 : -1);
      C.engine.seek(timeOf(c, dir > 0 ? lastF : Math.min(...Object.keys(out).map(Number))));
    }
    if (lost != null) C.toast(`Lost the target at ${C.fmtTC(timeOf(c, lost), fps())} — drag the box onto it and track again`, 'info', 4500);
    else if (n > 0 && !R0.cancel) C.toast(`Tracked ${n} frames`, 'ok', 1600);
    C.emit('trackerChange');
  };
  function progressUI(c, tk, dw, dh) {
    const { el, close } = C.modal(`<div class="modal-head"><h2>Tracking “${C.esc(tk.name)}”</h2></div>
      <div class="modal-body"><canvas class="trk-prev"></canvas><div class="trk-bar"><i></i></div><div class="hint trk-status">Starting…</div></div>
      <div class="modal-foot"><button class="btn" id="trkStop">Stop</button></div>`, { dismissable: false });
    const cv = el.querySelector('canvas'); cv.width = dw; cv.height = dh; const x = cv.getContext('2d');
    el.querySelector('#trkStop').onclick = () => { if (running) running.cancel = true; };
    return {
      frame: (rgba, f, p, s) => {
        x.putImageData(new ImageData(new Uint8ClampedArray(rgba), dw, dh), 0, 0);
        const w = tk.w * dw, h = tk.h * dh; x.lineWidth = 2; x.strokeStyle = s > 0.7 ? tk.color : '#ff5a5a'; x.strokeRect(p[0] * dw - w / 2, p[1] * dh - h / 2, w, h);
        x.fillStyle = tk.color; x.beginPath(); x.arc(p[0] * dw, p[1] * dh, 3, 0, 6.283); x.fill();
        el.querySelector('.trk-status').textContent = `Frame ${f + 1} · match ${Math.round(s * 100)}%`;
      },
      progress: (k) => { el.querySelector('.trk-bar i').style.width = Math.round(C.clamp(k, 0, 1) * 100) + '%'; },
      status: (t) => { el.querySelector('.trk-status').textContent = t; },
      close,
    };
  }

  // ---------- track management ----------
  TR.add = (c) => {
    const f = frameOf(c, C.UI.playhead); const id = C.uid('tk_');
    C.act('Add tracker', () => { c.tracks = c.tracks || []; c.tracks.push({ id, name: 'Track ' + (c.tracks.length + 1), color: COLORS[c.tracks.length % COLORS.length], w: 0.1, h: 0.1 * (16 / 9), seed: { f, x: 0.5, y: 0.5 }, pts: {}, adapt: true, fast: false }); });
    C.UI.trackSel = { clip: c.id, track: id };
    C.toast('Drag the box onto what you want to follow, then press Track ▶', 'info', 3500);
  };
  TR.remove = (c, tk) => C.act('Delete tracker', () => { c.tracks = c.tracks.filter((t) => t.id !== tk.id); });
  TR.clear = (c, tk) => C.act('Clear track', () => { const t = c.tracks.find((x) => x.id === tk.id); const f = frameOf(c, C.UI.playhead); const p = startPos(t, f); t.seed = { f, x: p[0], y: p[1] }; t.pts = {}; });

  // ---------- applying a track ----------
  const smooth = (arr, rad) => arr.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - rad); j <= Math.min(arr.length - 1, i + rad); j++) { const w = 1 - Math.abs(j - i) / (rad + 1); s += arr[j] * w; n += w; } return s / n; });
  const setKeys = (clip, path, list) => { clip.kf = clip.kf || {}; if (!list.length) return; clip.kf[path] = list.map(([t, v]) => ({ t: +t.toFixed(5), v: +v.toFixed(5), e: 'linear' })); };
  const refFrame = (c, tk) => { const ks = keys(tk); const f = frameOf(c, C.UI.playhead); return ks.includes(f) ? f : ks.reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a), ks[0]); };
  function need(tk) { if (keys(tk).length < 2) { C.toast('Track the motion first (press Track ▶)', 'info'); return false; } return true; }

  TR.attach = (c, tk, target, atF) => {
    if (!need(tk)) return;
    const ks = keys(tk); const fr = atF ?? refFrame(c, tk);
    const P0 = TR.toCanvas(c, fr, ...tk.pts[fr]);
    const tLocal = C.clamp(timeOf(c, fr) - target.start, 0, target.duration);
    const tv = C.evalClip(target, tLocal).t;
    const ox = tv.x - P0[0] / W(), oy = tv.y - P0[1] / H();
    C.act('Attach to track', () => {
      const xs = [], ys = [];
      for (const f of ks) { const T = timeOf(c, f) - target.start; if (T < -1e-6 || T > target.duration + 1e-6) continue; const p = TR.toCanvas(c, f, ...tk.pts[f]); xs.push([T, p[0] / W() + ox]); ys.push([T, p[1] / H() + oy]); }
      if (!xs.length) return;
      setKeys(target, 't.x', xs); setKeys(target, 't.y', ys); target.followTrack = { clip: c.id, track: tk.id };
    });
    C.toast(`${target.kind === 'text' ? (target.sticker ? 'Sticker' : 'Text') : 'Clip'} now follows ${tk.name}`, 'ok', 1800);
  };
  TR.candidates = (c, tk) => {
    const r = TR.range(tk); if (!r) return [];
    const a = timeOf(c, r[0]), b = timeOf(c, r[1]);
    return Object.values(C.project.clips).filter((x) => x.id !== c.id && x.kind !== 'audio' && x.kind !== 'effect' && x.start < b && C.clipEnd(x) > a);
  };
  TR.addText = (c, tk, sticker) => {
    if (!need(tk)) return;
    const [f0, f1] = TR.range(tk);
    let t;
    C.act(sticker ? 'Add tracked sticker' : 'Add tracked text', () => {
      t = sticker ? C.ops.addSticker(sticker, timeOf(c, f0)) : C.ops.addText({ text: { content: 'Tracked text', size: 90 } }, timeOf(c, f0));
      t.duration = Math.max(C.frame(), (f1 - f0 + 1) / fps());
      const p = TR.toCanvas(c, f0, ...tk.pts[f0]); const hh = tk.h * boxAt(c, f0).b.h;
      t.t.x = p[0] / W(); t.t.y = (p[1] - hh * (sticker ? 0 : 0.9)) / H();
      if (sticker) t.t.scale = C.clamp((tk.w * boxAt(c, f0).b.w * 1.2) / (W() * 0.12), 0.2, 4);
    });
    TR.attach(c, tk, C.getClip(t.id), f0);
    C.select([t.id]);
  };
  TR.blur = (c, tk, type = 'mosaic') => {
    if (!need(tk)) return;
    const ks = keys(tk); const B = boxAt(c, ks[0]);
    const boxPx = tk.w * B.b.w; const e = C.fx.newEffect(type, { area: 'ellipse', rw: C.clamp((tk.w * B.b.w * 1.35) / W(), 0.02, 1.5), rh: C.clamp((tk.h * B.b.h * 1.35) / H(), 0.02, 1.5) });
    if (type === 'blur') e.p.amount = 30; else e.p.size = C.clamp(Math.round(boxPx / 7), 14, 90);
    C.act(type === 'mosaic' ? 'Pixelate tracked area' : 'Blur tracked area', () => {
      c.effects = c.effects || []; c.effects.push(e);
      const xs = [], ys = []; for (const f of ks) { const p = TR.toCanvas(c, f, ...tk.pts[f]); xs.push([f / fps(), p[0] / W()]); ys.push([f / fps(), p[1] / H()]); }
      setKeys(c, `e.${e.id}.rx`, xs); setKeys(c, `e.${e.id}.ry`, ys);
    });
    C.toast(type === 'mosaic' ? 'Pixelation follows the target — adjust it in the Effects tab' : 'Blur follows the target — adjust it in the Effects tab', 'ok', 2200);
  };
  TR.maskFollow = (c, tk, mask) => {
    if (!need(tk)) return;
    if (!mask) {
      const id = C.uid('m_'); const B = boxAt(c, refFrame(c, tk));
      C.act('Add tracked mask', () => { c.masks = c.masks || []; c.masks.push({ id, type: 'ellipse', x: 0, y: 0, w: tk.w * 1.6, h: tk.h * 1.6, rot: 0, feather: 12, round: 0, invert: false, mode: 'add', on: true }); });
      mask = c.masks.find((m) => m.id === id); void B;
    }
    const ks = keys(tk); const fr = refFrame(c, tk); const p0 = tk.pts[fr];
    const mx = C.kf.value(c, `m.${mask.id}.x`, fr / fps()) ?? mask.x ?? 0, my = C.kf.value(c, `m.${mask.id}.y`, fr / fps()) ?? mask.y ?? 0;
    C.act('Mask follows track', () => {
      const xs = [], ys = []; for (const f of ks) { const p = tk.pts[f]; xs.push([f / fps(), mx + (p[0] - p0[0])]); ys.push([f / fps(), my + (p[1] - p0[1])]); }
      setKeys(c, `m.${mask.id}.x`, xs); setKeys(c, `m.${mask.id}.y`, ys);
    });
    C.toast('Mask follows the target', 'ok', 1600);
  };
  // stabilize ('smooth' keeps intentional camera moves, 'lock' pins the target) or reframe ('center')
  TR.stabilize = (c, tk, mode = 'smooth') => {
    if (!need(tk)) return;
    const ks = keys(tk); const B = boxAt(c, ks[0]); const s0 = B.ev.t.scale;
    const us = ks.map((f) => tk.pts[f][0]), vs = ks.map((f) => tk.pts[f][1]);
    const rad = Math.max(4, Math.round(fps() * 0.6));
    const tu = mode === 'lock' ? us.map(() => us[0]) : smooth(us, rad), tv = mode === 'lock' ? vs.map(() => vs[0]) : smooth(vs, rad);
    let mx = 0, my = 0; ks.forEach((_, i) => { mx = Math.max(mx, Math.abs(tu[i] - us[i])); my = Math.max(my, Math.abs(tv[i] - vs[i])); });
    const zNeed = 1 / Math.max(0.2, 1 - 2 * Math.max(mx, my)) + 0.005; const Z = C.clamp(zNeed, 1, 1.8);
    const cx0 = B.ev.t.x * W(), cy0 = B.ev.t.y * H();
    C.act('Stabilize', () => {
      const xs = [], ys = [];
      // smooth: zoom about the frame centre and cancel the jitter; lock: keep the target exactly where it was on the first frame
      ks.forEach((f, i) => { const Bf = boxAt(c, f); const a = rel(Bf, tu[i], tv[i]), b = rel(Bf, us[i], vs[i]);
        const X = mode === 'lock' ? cx0 + a[0] - Z * b[0] : cx0 + Z * (a[0] - b[0]), Y = mode === 'lock' ? cy0 + a[1] - Z * b[1] : cy0 + Z * (a[1] - b[1]);
        xs.push([f / fps(), X / W()]); ys.push([f / fps(), Y / H()]); });
      setKeys(c, 't.x', xs); setKeys(c, 't.y', ys);
      if (c.kf && c.kf['t.scale']) delete c.kf['t.scale'];
      c.t.scale = s0 * Z;
    });
    if (zNeed > 1.8) C.toast(`Stabilized — the camera moves a lot here, so some edges will show (zoomed ${Math.round((Z - 1) * 100)}%)`, 'info', 3600);
    else C.toast(`Stabilized (${mode === 'lock' ? 'locked on target' : 'smooth'}) · zoomed ${Math.round((Z - 1) * 100)}% to hide the edges`, 'ok', 2600);
  };
  TR.reframe = (c, tk) => {
    if (!need(tk)) return;
    const ks = keys(tk);
    C.act('Auto reframe', () => {
      c.t.fit = 'cover'; if (c.kf) { delete c.kf['t.x']; delete c.kf['t.y']; } c.t.x = 0.5; c.t.y = 0.5;
      const us = smooth(ks.map((f) => tk.pts[f][0]), Math.round(fps() * 0.8)), vs = smooth(ks.map((f) => tk.pts[f][1]), Math.round(fps() * 0.8));
      const xs = [], ys = [];
      ks.forEach((f, i) => {
        const Bf = boxAt(c, f); const [rx, ry] = rel(Bf, us[i], vs[i]);
        const lx = Math.max(0, (Bf.b.w - W()) / 2), ly = Math.max(0, (Bf.b.h - H()) / 2);
        xs.push([f / fps(), (W() / 2 + C.clamp(-rx, -lx, lx)) / W()]); ys.push([f / fps(), (H() / 2 + C.clamp(-ry, -ly, ly)) / H()]);
      });
      setKeys(c, 't.x', xs); setKeys(c, 't.y', ys);
    });
    C.toast('Auto-reframed: the camera now follows the target', 'ok', 2200);
  };

  // ---------- inspector tab ----------
  TR.tab = (body, c, h) => {
    const s = h.section(body, 'Motion tracking');
    s.appendChild(C.h(`<p class="hint" style="margin:0 0 10px">Put a box on something that moves, press <b>Track ▶</b>, then make text, stickers, blur, masks or other clips follow it — or stabilize shaky footage.</p>`));
    const add = C.h(`<button class="btn primary block">${C.icon('plus')}<span>Add tracker at playhead</span></button>`);
    add.onclick = () => { TR.add(c); };
    s.appendChild(add);
    const sel = C.UI.trackSel && C.UI.trackSel.clip === c.id ? C.UI.trackSel.track : (c.tracks || [])[0]?.id;
    (c.tracks || []).forEach((tk) => {
      const r = TR.range(tk);
      const card = C.h(`<div class="fx-card trk-card ${sel === tk.id ? 'focused' : ''}"><div class="fx-head"><span class="trk-dot" style="background:${tk.color}"></span><b>${C.esc(tk.name)}</b><span class="muted" style="font-size:11px;margin-left:6px">${r ? `${r[1] - r[0] + 1} frames` : 'not tracked yet'}</span><span style="flex:1"></span><button class="icon-btn" data-a="ren" data-tip="Rename">${C.icon('text')}</button><button class="icon-btn" data-a="del" data-tip="Delete tracker">${C.icon('x')}</button></div>
        <div class="fx-body">
          <div class="trk-run"><button class="btn" data-a="back" data-tip="Track backward">◀ Track</button><button class="btn primary" data-a="fwd">Track ▶</button><button class="btn" data-a="clear">Clear</button></div>
          <div class="trk-opts"></div>
          ${r ? `<div class="pk-cat" style="margin:12px 0 6px">Use this track</div><div class="trk-actions">
            <button class="btn" data-a="text">${C.icon('text')}<span>Add text</span></button>
            <button class="btn" data-a="sticker">😀<span>Add sticker</span></button>
            <button class="btn" data-a="attach">${C.icon('link')}<span>Attach clip…</span></button>
            <button class="btn" data-a="mosaic">▦<span>Pixelate it</span></button>
            <button class="btn" data-a="blur">${C.icon('droplet')}<span>Blur it</span></button>
            <button class="btn" data-a="mask">${C.icon('mask')}<span>Mask follows…</span></button>
            <button class="btn" data-a="stab">${C.icon('crosshair')}<span>Stabilize…</span></button>
            <button class="btn" data-a="reframe">${C.icon('fit')}<span>Auto-reframe</span></button>
          </div>` : ''}
        </div></div>`);
      const opts = card.querySelector('.trk-opts');
      const cb = (k, label, def) => { const row = C.h(`<label class="ph-chk trk-chk"><input type="checkbox" ${(tk[k] ?? def) ? 'checked' : ''}> ${label}</label>`); row.querySelector('input').onchange = (e) => C.act('Tracker option', () => { c.tracks.find((x) => x.id === tk.id)[k] = e.target.checked; }); opts.appendChild(row); };
      cb('fast', 'Fast motion (wider search)', false); cb('adapt', 'Adapt to changing looks', true);
      card.addEventListener('pointerdown', () => { if (!C.UI.trackSel || C.UI.trackSel.track !== tk.id) { C.UI.trackSel = { clip: c.id, track: tk.id }; C.$$('.trk-card').forEach((x) => x.classList.toggle('focused', x === card)); TR.render(); } });
      const live = () => (C.getClip(c.id).tracks || []).find((x) => x.id === tk.id);
      const act = {
        back: () => TR.run(c, live(), -1), fwd: () => TR.run(c, live(), 1), clear: () => TR.clear(c, live()), del: () => TR.remove(c, live()),
        ren: async () => { const v = await C.prompt('Rename tracker', 'Name', tk.name); if (v) C.act('Rename tracker', () => { live().name = v; }); },
        text: () => TR.addText(c, live()), sticker: (b) => C.emoji.picker(b, (em) => TR.addText(c, live(), em)),
        mosaic: () => TR.blur(c, live(), 'mosaic'), blur: () => TR.blur(c, live(), 'blur'), reframe: () => TR.reframe(c, live()),
        attach: (b) => { const list = TR.candidates(c, live()); const r = b.getBoundingClientRect(); if (!list.length) return C.toast('Put a text, sticker, image or clip on another track over this time first', 'info', 3000); C.menu(r.left, r.bottom + 4, list.map((x) => ({ label: x.kind === 'text' ? (x.sticker ? 'Sticker · ' : 'Text · ') + (x.text.content || '').slice(0, 24) : x.name, icon: x.kind === 'text' ? 'text' : x.kind === 'image' ? 'image' : x.kind === 'shape' ? 'shapes' : 'film', action: () => TR.attach(c, live(), x) }))); },
        mask: (b) => { const r = b.getBoundingClientRect(); C.menu(r.left, r.bottom + 4, [{ label: 'New ellipse mask around it', icon: 'mask', action: () => TR.maskFollow(c, live(), null) }, ...(c.masks || []).map((m, i) => ({ label: `Mask ${i + 1} (${m.type})`, icon: 'mask', action: () => TR.maskFollow(c, live(), m) }))]); },
        stab: (b) => { const r = b.getBoundingClientRect(); C.menu(r.left, r.bottom + 4, [{ label: 'Smooth (remove shake, keep camera moves)', icon: 'wave', action: () => TR.stabilize(c, live(), 'smooth') }, { label: 'Lock (pin the target in place)', icon: 'crosshair', action: () => TR.stabilize(c, live(), 'lock') }]); },
      };
      card.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); act[b.dataset.a] && act[b.dataset.a](b); }));
      body.appendChild(card);
    });
    C.fillIcons && C.fillIcons(body);
  };

  // ---------- player overlay ----------
  function ctxNow() {
    if (C.UI.playing || !C.inspector || !C.inspector.isTab('track')) return null;
    const c = C.selectedClips()[0]; if (!c || !(c.tracks || []).length) return null;
    if (C.UI.playhead < c.start || C.UI.playhead >= C.clipEnd(c)) return null;
    return c;
  }
  TR.render = () => {
    if (!svg) return;
    const c = ctxNow(); svg.classList.toggle('active', !!c);
    if (!c) { svg.innerHTML = ''; return; }
    const k = C.$('#canvasWrap').clientWidth / W(); const f = frameOf(c, C.UI.playhead);
    const selId = C.UI.trackSel && C.UI.trackSel.clip === c.id ? C.UI.trackSel.track : c.tracks[0].id;
    let html = '';
    for (const tk of c.tracks) {
      const ks = keys(tk); const on = tk.id === selId;
      if (ks.length > 1) {
        const step = Math.max(1, Math.floor(ks.length / 400));
        const pts = ks.filter((_, i) => i % step === 0).map((q) => TR.toCanvas(c, q, tk.pts[q][0], tk.pts[q][1]).map((v) => (v * k).toFixed(1)).join(',')).join(' ');
        html += `<polyline points="${pts}" class="trk-path" style="stroke:${tk.color};opacity:${on ? 0.9 : 0.45}"/>`;
      }
      const p = startPos(tk, f); const tracked = !!TR.posAt(tk, f) && ks.length > 0;
      const B = boxAt(c, f); const [cx, cy] = TR.toCanvas(c, f, p[0], p[1]);
      const bw = tk.w * B.b.w * k, bh = tk.h * B.b.h * k; const X = cx * k, Y = cy * k;
      const sr = tk.fast ? 2.4 : 1.7;
      html += `<g class="trk-box ${on ? 'on' : ''}" data-t="${tk.id}" transform="translate(${X},${Y}) rotate(${B.b.rot})">
        ${on ? `<rect x="${(-bw * sr) / 2}" y="${(-bh * sr) / 2}" width="${bw * sr}" height="${bh * sr}" class="trk-search"/>` : ''}
        <rect x="${-bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" class="trk-rect" data-a="move" style="stroke:${tk.color}"/>
        <path d="M-6 0H6M0 -6V6" style="stroke:${tk.color}" class="trk-cross"/>
        ${on ? `<rect x="${bw / 2 - 5}" y="${bh / 2 - 5}" width="10" height="10" class="trk-handle" data-a="size" style="fill:${tk.color}"/>` : ''}
        <text x="${-bw / 2}" y="${-bh / 2 - 6}" class="trk-label">${C.esc(tk.name)}${tracked ? '' : ' · place me'}</text></g>`;
    }
    svg.innerHTML = html;
  };
  function onDown(e) {
    const c = ctxNow(); if (!c) return;
    const g = e.target.closest('.trk-box'); if (!g) return;
    e.preventDefault(); e.stopPropagation();
    const tk = c.tracks.find((t) => t.id === g.dataset.t); const a = e.target.dataset.a || 'move';
    C.UI.trackSel = { clip: c.id, track: tk.id };
    const f = frameOf(c, C.UI.playhead); const r = C.$('#canvasWrap').getBoundingClientRect(); const k = r.width / W();
    const toPx = (ev) => [(ev.clientX - r.left) / k, (ev.clientY - r.top) / k];
    const p0 = startPos(tk, f).slice(); const [sx, sy] = toPx(e); const s0 = toSource(c, f, sx, sy); const w0 = tk.w, h0 = tk.h;
    C.begin(); let moved = false;
    const mv = (m) => {
      moved = true; const [px, py] = toPx(m); const s1 = toSource(c, f, px, py);
      const t = C.getClip(c.id).tracks.find((x) => x.id === tk.id);
      if (a === 'size') { t.w = C.clamp(w0 + (s1[0] - s0[0]) * 2, 0.02, 0.6); t.h = C.clamp(h0 + (s1[1] - s0[1]) * 2, 0.02, 0.6); }
      else { const nx = C.clamp(p0[0] + s1[0] - s0[0], 0, 1), ny = C.clamp(p0[1] + s1[1] - s0[1], 0, 1); t.seed = { f, x: nx, y: ny }; if (t.pts && t.pts[f]) t.pts[f] = [nx, ny, 1]; else if (TR.posAt(t, f)) { t.pts = t.pts || {}; t.pts[f] = [nx, ny, 1]; } }
      C.live(); TR.render();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) C.commit(a === 'size' ? 'Resize tracker' : 'Move tracker'); else { C._txn = null; TR.render(); C.inspector.render(true); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  TR.init = () => {
    scratch = document.createElement('canvas').getContext('2d');
    svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'trk-svg');
    C.$('#overlay').appendChild(svg);
    svg.addEventListener('pointerdown', onDown);
    ['drawn', 'change', 'select', 'inspectorRendered', 'trackerChange'].forEach((ev) => C.on(ev, () => TR.render()));
  };
})(window.C);
