/* Cutroom — keyframes: animate any numeric property over time */
(function (C) {
  const KF = (C.kf = {});
  KF.EASES = [['linear', 'Linear'], ['inout', 'Ease in & out'], ['in', 'Ease in'], ['out', 'Ease out'], ['sine', 'Smooth (sine)'], ['expo', 'Expo in & out'], ['back', 'Overshoot'], ['bounce', 'Bounce'], ['elastic', 'Elastic'], ['hold', 'Hold']];
  const easeFn = {
    linear: (k) => k,
    in: (k) => k * k * k,
    out: (k) => 1 - Math.pow(1 - k, 3),
    inout: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    sine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
    expo: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
    back: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    bounce: (k) => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375; return n * (k -= 2.625 / d) * k + 0.984375; },
    elastic: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    hold: () => 0,
  };
  KF.easeFn = easeFn;

  // ---- property paths: "t.x", "fx.blur", "volume", "text.size", "e.<effectId>.<param>"
  KF.get = (c, path) => {
    const parts = path.split('.');
    if (parts[0] === 'e') { const e = (c.effects || []).find((x) => x.id === parts[1]); return e ? e.p[parts[2]] : undefined; }
    if (parts[0] === 'm') { const m = (c.masks || []).find((x) => x.id === parts[1]); return m ? m[parts[2]] : undefined; }
    let o = c;
    for (const p of parts) { if (o == null) return undefined; o = o[p]; }
    return o;
  };
  KF.set = (c, path, v) => {
    const parts = path.split('.');
    if (parts[0] === 'e') { const e = (c.effects || []).find((x) => x.id === parts[1]); if (e) e.p[parts[2]] = v; return; }
    if (parts[0] === 'm') { const m = (c.masks || []).find((x) => x.id === parts[1]); if (m) m[parts[2]] = v; return; }
    let o = c;
    for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = v;
  };

  KF.has = (c, path) => !!(c.kf && c.kf[path] && c.kf[path].length);
  KF.any = (c) => !!(c.kf && Object.values(c.kf).some((a) => a && a.length));

  KF.value = (c, path, local) => {
    const arr = c.kf && c.kf[path];
    if (!arr || !arr.length) return KF.get(c, path);
    if (local <= arr[0].t) return arr[0].v;
    const last = arr[arr.length - 1];
    if (local >= last.t) return last.v;
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i], b = arr[i + 1];
      if (local >= a.t && local < b.t) {
        const k = (b.t - a.t) > 1e-9 ? (local - a.t) / (b.t - a.t) : 1;
        return a.v + (b.v - a.v) * (easeFn[a.e] || easeFn.linear)(k);
      }
    }
    return last.v;
  };

  // A copy of the clip with every keyframed property resolved at clip-local time
  KF.evalClip = (c, local) => {
    if (!KF.any(c)) return c;
    const o = Object.assign({}, c, { t: Object.assign({}, c.t), fx: Object.assign({}, c.fx) });
    if (c.text) o.text = Object.assign({}, c.text);
    if (c.grade) o.grade = Object.assign({}, c.grade);
    if (c.warp) o.warp = Object.assign({}, c.warp);
    if (c.shape) o.shape = Object.assign({}, c.shape);
    if (c.masks) o.masks = c.masks.map((m) => Object.assign({}, m));
    if (c.effects) o.effects = c.effects.map((e) => Object.assign({}, e, { p: Object.assign({}, e.p) }));
    for (const path in c.kf) if (c.kf[path] && c.kf[path].length) KF.set(o, path, KF.value(c, path, local));
    return o;
  };
  C.evalClip = KF.evalClip;

  const near = (a, b) => Math.abs(a - b) < 0.5 / C.fps();
  KF.at = (c, path, local) => (c.kf && c.kf[path] ? c.kf[path].find((k) => near(k.t, local)) : null);
  KF.localNow = (c) => C.UI.playhead - c.start;

  // Set a value: updates the keyframe at the playhead if the property is animated, otherwise the static value
  KF.setParam = (c, path, v, local = KF.localNow(c)) => {
    if (KF.has(c, path)) {
      const ex = KF.at(c, path, local);
      if (ex) ex.v = v;
      else { c.kf[path].push({ t: local, v, e: 'linear' }); c.kf[path].sort((a, b) => a.t - b.t); }
    } else KF.set(c, path, v);
  };
  C.setParam = KF.setParam;

  // Toggle a keyframe at the playhead (diamond button)
  KF.toggle = (c, path, local = KF.localNow(c)) => {
    c.kf = c.kf || {};
    local = Math.round(C.clamp(local, 0, c.duration) * C.fps()) / C.fps();
    const arr = c.kf[path] = c.kf[path] || [];
    const ex = arr.find((k) => near(k.t, local));
    if (ex) {
      const cur = KF.value(c, path, local);
      arr.splice(arr.indexOf(ex), 1);
      if (!arr.length) { delete c.kf[path]; KF.set(c, path, cur); }
    } else {
      arr.push({ t: local, v: KF.value(c, path, local), e: 'linear' });
      arr.sort((a, b) => a.t - b.t);
    }
  };
  KF.clear = (c, path) => { if (!c.kf || !c.kf[path]) return; const v = KF.value(c, path, KF.localNow(c)); delete c.kf[path]; KF.set(c, path, v); };
  KF.clearAll = (c) => { if (!c.kf) return; for (const p of Object.keys(c.kf)) KF.clear(c, p); c.kf = {}; };
  KF.setEase = (c, path, local, ease) => { const k = KF.at(c, path, local); if (k) k.e = ease; };

  // All keyframe times on a clip (for timeline diamonds and navigation)
  KF.times = (c) => {
    const ts = [];
    if (!c.kf) return ts;
    for (const p in c.kf) for (const k of c.kf[p] || []) if (!ts.some((x) => near(x, k.t))) ts.push(k.t);
    return ts.sort((a, b) => a - b);
  };
  KF.moveTime = (c, from, to) => { for (const p in c.kf || {}) { for (const k of c.kf[p]) if (near(k.t, from)) k.t = to; c.kf[p].sort((a, b) => a.t - b.t); } };
  // motion-tracking data is keyed by clip-local frame; keep it aligned when a clip is trimmed or split
  const shiftTracks = (c, df, keep) => { for (const tk of c.tracks || []) { const o = {}; for (const f in tk.pts || {}) { const n = +f + df; if (!keep || keep(+f)) o[n] = tk.pts[f]; } tk.pts = o; if (tk.seed) tk.seed.f = Math.max(0, tk.seed.f + df); } };
  KF.shift = (c, dt) => { for (const p in c.kf || {}) for (const k of c.kf[p]) k.t += dt; shiftTracks(c, Math.round(dt * C.fps())); };

  // Split keyframes between two halves at clip-local time `at`
  KF.split = (a, b, at) => {
    if ((a.tracks || []).length) { const af = Math.round(at * C.fps()); b.tracks = C.deep(a.tracks); shiftTracks(a, 0, (f) => f <= af); shiftTracks(b, -af, (f) => f >= af); }
    if (!KF.any(a)) { b.kf = {}; return; }
    const src = C.deep(a.kf);
    a.kf = {}; b.kf = {};
    for (const p in src) {
      const arr = src[p]; if (!arr.length) continue;
      const v =KF.value({ kf: { [p]: arr } }, p, at);
      const left = arr.filter((k) => k.t < at - 1e-6);
      const right = arr.filter((k) => k.t > at + 1e-6).map((k) => Object.assign({}, k, { t: k.t - at }));
      a.kf[p] = [...left, { t: at, v, e: 'linear' }];
      b.kf[p] = [{ t: 0, v, e: (left[left.length - 1] || { e: 'linear' }).e }, ...right];
    }
  };

  // Rename effect-id based paths (when copying effects to a new clip)
  KF.remapEffects = (kf, idMap) => {
    const out = {};
    for (const p in kf || {}) {
      const parts = p.split('.');
      if (parts[0] === 'e' && idMap[parts[1]]) out[`e.${idMap[parts[1]]}.${parts[2]}`] = C.deep(kf[p]);
      else if (parts[0] !== 'e') out[p] = C.deep(kf[p]);
    }
    return out;
  };

  // FFmpeg volume expression from volume keyframes (linear segments)
  KF.volumeExpr = (c) => {
    const arr = c.kf && c.kf.volume;
    if (!arr || arr.length < 1) return null;
    const f = (n) => (+n).toFixed(4);
    let expr = f(arr[arr.length - 1].v);
    for (let i = arr.length - 2; i >= 0; i--) {
      const a = arr[i], b = arr[i + 1];
      const seg = a.e === 'hold' ? f(a.v) : `${f(a.v)}+(${f(b.v - a.v)})*(t-${f(a.t)})/${f(Math.max(1e-4, b.t - a.t))}`;
      expr = `if(lt(t,${f(b.t)}),${seg},${expr})`;
    }
    return `if(lt(t,${f(arr[0].t)}),${f(arr[0].v)},${expr})`;
  };
})(window.C);
