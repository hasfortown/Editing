/* Cutroom — beat detection (onsets + tempo), beat markers, cut-to-the-beat */
(function (C) {
  const BT = (C.beats = {});
  const SR = 22050, N = 1024, HOP = 512;
  const cache = new Map();

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], xr = re[i + k + len / 2], xi = im[i + k + len / 2]; const vr = xr * cr - xi * ci, vi = xr * ci + xi * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  async function decode(m) {
    const p = C.mediaPath(m); if (cache.has(p)) return cache.get(p);
    const buf = await (await fetch(window.native.mediaUrl(p))).arrayBuffer();
    const ab = await new OfflineAudioContext(1, 1, SR).decodeAudioData(buf);
    const x = ab.getChannelData(0); cache.set(p, x); return x;
  }
  // onset strength envelope: per-band spectral flux on log magnitude, low bands weighted (kick drums mark the beat)
  const BANDS = [1, 6, 12, 24, 48, 96, 200, 512], BW = [2.2, 1.8, 1.2, 1, 0.9, 0.7, 0.5];
  function envelope(x) {
    const frames = Math.max(0, Math.floor((x.length - N) / HOP)); const nb = BW.length;
    const band = Array.from({ length: nb }, () => new Float32Array(frames));
    const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    let prev = new Float32Array(N / 2); const re = new Float32Array(N), im = new Float32Array(N);
    for (let f = 0; f < frames; f++) {
      const o = f * HOP; for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
      fft(re, im); const cur = new Float32Array(N / 2);
      for (let b = 0; b < nb; b++) { let flux = 0; for (let k = BANDS[b]; k < BANDS[b + 1]; k++) { const mag = Math.log1p(100 * Math.hypot(re[k], im[k])); cur[k] = mag; const d = mag - prev[k]; if (d > 0) flux += d; } band[b][f] = flux / (BANDS[b + 1] - BANDS[b]); }
      prev = cur;
    }
    const out = new Float32Array(frames); const R = 8;
    for (let b = 0; b < nb; b++) {
      const e = band[b]; const t = new Float32Array(frames); let mx = 0;
      for (let f = 0; f < frames; f++) { let s = 0, n = 0; for (let j = Math.max(0, f - R); j <= Math.min(frames - 1, f + R); j++) { s += e[j]; n++; } t[f] = Math.max(0, e[f] - s / n); mx = Math.max(mx, t[f]); }
      if (mx) for (let f = 0; f < frames; f++) out[f] += (t[f] / mx) * BW[b];
    }
    let mx = 0; for (const v of out) mx = Math.max(mx, v); if (mx) for (let i = 0; i < frames; i++) out[i] /= mx;
    return out;
  }
  BT.analyze = (x) => {
    const env = envelope(x); const fr = SR / HOP;
    // a softened copy for tempo estimation (beat periods rarely land on whole frames)
    const es = new Float32Array(env.length); const kw = [0.15, 0.5, 1, 0.5, 0.15];
    for (let i = 0; i < env.length; i++) { let s = 0, n = 0; for (let j = -2; j <= 2; j++) { const v = env[i + j]; if (v === undefined) continue; s += v * kw[j + 2]; n += kw[j + 2]; } es[i] = s / n; }
    // tempo by autocorrelation, 70–180 BPM, weighted toward ~120
    let best = 0, bestLag = Math.round(fr * 0.5);
    for (let lag = Math.round((fr * 60) / 180); lag <= Math.round((fr * 60) / 70); lag++) {
      let s = 0; for (let i = lag; i < es.length; i++) s += es[i] * es[i - lag];
      const bpm = (60 * fr) / lag; s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 1.0, 2));
      if (s > best) { best = s; bestLag = lag; }
    }
    const ac = (lag) => { let s = 0; for (let i = lag; i < es.length; i++) s += es[i] * es[i - lag]; return s; };
    const a0 = ac(bestLag - 1), a1 = ac(bestLag), a2 = ac(bestLag + 1); const den = a0 - 2 * a1 + a2; const fracLag = bestLag + (den < 0 ? C.clamp((0.5 * (a0 - a2)) / den, -0.5, 0.5) : 0);
    // dynamic-programming beat tracking (Ellis 2007)
    const n = env.length, score = new Float32Array(n), back = new Int32Array(n).fill(-1), alpha = 120;
    for (let i = 0; i < n; i++) {
      let bs = 0, bi = -1;
      for (let p = i - Math.round(bestLag * 2); p <= i - Math.round(bestLag / 2); p++) { if (p < 0) continue; const pen = -alpha * Math.pow(Math.log((i - p) / bestLag), 2); const v = score[p] + pen; if (bi < 0 || v > bs) { bs = v; bi = p; } }
      score[i] = env[i] + (bi >= 0 ? Math.max(0, bs) : 0); back[i] = bi >= 0 && bs > 0 ? bi : -1;
    }
    let i = 0; for (let k = Math.max(0, n - bestLag * 2); k < n; k++) if (score[k] > score[i]) i = k;
    const beats = []; while (i >= 0) { beats.push(i); i = back[i]; } beats.reverse();
    const times = beats.map((b) => (b * HOP + N / 2) / SR);
    const strength = beats.map((b) => env[b]);
    return { bpm: Math.round((60 * fr) / fracLag), times, strength };
  };

  BT.detect = async (c, every = 1) => {
    const m = C.mediaOf(c); if (!m || !C.hasAudio(c)) return C.toast('This clip has no audio', 'info');
    const t = C.toast('Listening for the beat…', 'info', 60000);
    try {
      const x = await decode(m); const a = BT.analyze(x);
      const inS = c.in, outS = c.in + c.duration * c.speed;
      const list = a.times.map((s, i) => ({ s, st: a.strength[i], i })).filter((b) => b.s >= inS && b.s < outS);
      // choose the phase whose beats are strongest (downbeats) when thinning
      let phase = 0; if (every > 1) { let bs = -1; for (let p = 0; p < every; p++) { const s = list.filter((b) => b.i % every === p).reduce((q, b) => q + b.st, 0); if (s > bs) { bs = s; phase = p; } } }
      const keep = list.filter((b) => every === 1 || b.i % every === phase);
      C.act('Detect beats', () => {
        for (const mk of Object.values(C.project.markers)) if (mk.beat && mk.src === c.id) delete C.project.markers[mk.id];
        for (const b of keep) { const id = C.uid('k_'); C.project.markers[id] = { id, t: C.snapTime(c.start + (b.s - c.in) / c.speed), label: '♪', color: '#a78bfa', beat: true, src: c.id }; }
      });
      t && t.remove && t.remove();
      C.toast(`Found ${keep.length} beats · about ${a.bpm} BPM`, 'ok', 2600);
      return keep.length;
    } catch (e) { console.warn(e); t && t.remove && t.remove(); C.toast('Could not analyse this audio: ' + e.message, 'error'); }
  };
  BT.clear = () => C.act('Clear beat markers', () => { for (const mk of Object.values(C.project.markers)) if (mk.beat) delete C.project.markers[mk.id]; });
  BT.count = () => Object.values(C.project.markers).filter((m) => m.beat).length;

  // cut every selected clip (or the given one) at each marker inside it
  BT.splitAtMarkers = (clips) => {
    const ts = Object.values(C.project.markers).map((m) => m.t).sort((a, b) => a - b);
    let n = 0;
    C.act('Split at markers', () => {
      for (const c0 of clips) {
        let cur = c0;
        for (const t of ts) { if (t <= cur.start + C.frame() / 2 || t >= C.clipEnd(cur) - C.frame() / 2) continue; const b = C.ops.split(cur, t); if (b) { n++; cur = b; } }
      }
    });
    C.toast(n ? `Cut into ${n + clips.length} pieces on the beat` : 'No markers inside the selected clips', n ? 'ok' : 'info', 2000);
  };

  BT.section = (body, c, h) => {
    const s = h.section(body, 'Beat sync');
    s.appendChild(C.h('<p class="hint" style="margin:0 0 8px">Find the beat of this music and drop markers on it. Clips snap to markers, and you can cut video clips on every beat.</p>'));
    const row = C.h(`<div class="beat-row"><select class="select compact"><option value="1">Every beat</option><option value="2">Every 2 beats</option><option value="4" selected>Every bar (4 beats)</option><option value="8">Every 2 bars</option></select><button class="btn primary">${C.icon('beat')}<span>Detect beats</span></button></div>`);
    row.querySelector('button').onclick = () => BT.detect(c, +row.querySelector('select').value);
    s.appendChild(row);
    const r2 = C.h(`<div class="beat-row" style="margin-top:6px"><button class="btn">${C.icon('split')}<span>Cut clips on beats</span></button><button class="btn">${C.icon('x')}<span>Clear markers</span></button></div>`);
    const [cut, clr] = r2.querySelectorAll('button');
    cut.onclick = () => { const vids = Object.values(C.project.clips).filter((x) => x.kind === 'video' || x.kind === 'image'); const sel = C.selectedClips().filter((x) => x.kind !== 'audio'); BT.splitAtMarkers(sel.length ? sel : vids); };
    clr.onclick = BT.clear;
    s.appendChild(r2);
  };
})(window.C);
