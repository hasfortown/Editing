/* Cutroom — shared color UI: curves editor, color wheels */
(function (C) {
  const U = (C.colorUI = {});
  const CH = [['m', 'RGB', '#e9eaf0'], ['r', 'Red', '#ff5a5a'], ['g', 'Green', '#3ee08f'], ['b', 'Blue', '#4d8dff']];

  // Curves editor. get() -> {m,r,g,b} | null ; set(curves, live)
  U.curves = (parent, get, set, opts = {}) => {
    let ch = 'm';
    const box = C.h(`<div class="curves"><div class="seg crv-ch">${CH.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div><canvas width="520" height="520"></canvas><div class="crv-foot"><span class="hint">Click to add a point · drag · double-click to remove</span><button class="reset-btn">Reset</button></div></div>`);
    const cv = box.querySelector('canvas'), x = cv.getContext('2d');
    const S = 520, pad = 14, inner = S - pad * 2;
    const pts = () => { const c = get() || {}; return (c[ch] && c[ch].length ? c[ch] : [[0, 0], [1, 1]]).map((p) => p.slice()); };
    const toPx = (p) => [pad + p[0] * inner, pad + (1 - p[1]) * inner];
    const fromPx = (px, py) => [C.clamp((px - pad) / inner, 0, 1), C.clamp(1 - (py - pad) / inner, 0, 1)];
    const draw = () => {
      x.clearRect(0, 0, S, S); x.fillStyle = '#0b0c10'; x.fillRect(0, 0, S, S);
      x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { const v = pad + (inner * i) / 4; x.beginPath(); x.moveTo(v, pad); x.lineTo(v, S - pad); x.moveTo(pad, v); x.lineTo(S - pad, v); x.stroke(); }
      x.strokeStyle = 'rgba(255,255,255,.18)'; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(pad, S - pad); x.lineTo(S - pad, pad); x.stroke(); x.setLineDash([]);
      const all = get() || {};
      for (const [k, , col] of CH) {
        if (k === ch || !all[k]) continue;
        const vals = C.grade.evalCurve(all[k], 128); x.strokeStyle = col + '55'; x.lineWidth = 2; x.beginPath();
        vals.forEach((v, i) => { const [px, py] = toPx([i / 127, v]); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
      }
      const col = CH.find((c) => c[0] === ch)[2];
      const vals = C.grade.evalCurve(pts(), 256); x.strokeStyle = col; x.lineWidth = 3.5; x.beginPath();
      vals.forEach((v, i) => { const [px, py] = toPx([i / 255, v]); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
      for (const p of pts()) { const [px, py] = toPx(p); x.fillStyle = '#fff'; x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 9, 0, 6.283); x.fill(); x.stroke(); }
      box.querySelectorAll('.crv-ch button').forEach((b) => b.classList.toggle('on', b.dataset.k === ch));
    };
    const write = (arr, live) => { const c = Object.assign({}, get() || {}); c[ch] = arr; set(c, live); draw(); };
    const evPt = (e) => { const r = cv.getBoundingClientRect(); return fromPx(((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S); };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = evPt(e); let arr = pts();
      let idx = arr.findIndex((q) => Math.hypot((q[0] - p[0]) * inner, (q[1] - p[1]) * inner) < 22);
      if (idx < 0) { arr.push(p); arr.sort((a, b) => a[0] - b[0]); idx = arr.findIndex((q) => q === p); write(arr, true); }
      const move = (m) => {
        const q = evPt(m); arr = pts();
        const lo = idx > 0 ? arr[idx - 1][0] + 0.01 : 0, hi = idx < arr.length - 1 ? arr[idx + 1][0] - 0.01 : 1;
        arr[idx] = [idx === 0 && arr.length > 1 && q[0] < 0.02 ? 0 : C.clamp(q[0], lo, hi), q[1]];
        write(arr, true);
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); set(get(), false); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
    cv.addEventListener('dblclick', (e) => {
      const p = evPt(e); const arr = pts();
      const idx = arr.findIndex((q) => Math.hypot((q[0] - p[0]) * inner, (q[1] - p[1]) * inner) < 22);
      if (idx >= 0 && arr.length > 2) { arr.splice(idx, 1); write(arr, false); }
    });
    box.querySelectorAll('.crv-ch button').forEach((b) => (b.onclick = () => { ch = b.dataset.k; draw(); }));
    box.querySelector('.reset-btn').onclick = () => { const c = Object.assign({}, get() || {}); delete c[ch]; set(Object.keys(c).length ? c : null, false); draw(); };
    draw();
    parent.appendChild(box);
    return { redraw: draw };
  };

  // Color wheel. get() -> {x,y,l}; set(v, live)
  U.wheel = (parent, label, get, set) => {
    const box = C.h(`<div class="wheel"><canvas width="240" height="240"></canvas><input type="range" min="-1" max="1" step="0.01"><div class="wheel-lbl">${C.esc(label)} <button class="reset-btn">↺</button></div></div>`);
    const cv = box.querySelector('canvas'), x = cv.getContext('2d'), r = box.querySelector('input');
    const R = 112, cx = 120, cy = 120;
    const bg = document.createElement('canvas'); bg.width = 240; bg.height = 240;
    (() => { const b = bg.getContext('2d'); const id = b.createImageData(240, 240);
      for (let j = 0; j < 240; j++) for (let i = 0; i < 240; i++) {
        const dx = i - cx, dy = j - cy, d = Math.hypot(dx, dy); const o = (j * 240 + i) * 4; if (d > R) continue;
        const a = Math.atan2(dy, dx); const s = d / R; const hc = [0, 2.094, 4.189].map((k) => Math.cos(a - k));
        id.data[o] = C.clamp(128 + hc[0] * 110 * s, 0, 255); id.data[o + 1] = C.clamp(128 + hc[1] * 110 * s, 0, 255); id.data[o + 2] = C.clamp(128 + hc[2] * 110 * s, 0, 255); id.data[o + 3] = 255;
      } b.putImageData(id, 0, 0); })();
    const draw = () => {
      const v = get() || { x: 0, y: 0, l: 0 };
      x.clearRect(0, 0, 240, 240); x.drawImage(bg, 0, 0);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, 6.283); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(cx - 8, cy); x.lineTo(cx + 8, cy); x.moveTo(cx, cy - 8); x.lineTo(cx, cy + 8); x.stroke();
      const px = cx + v.x * R, py = cy + v.y * R;
      x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 10, 0, 6.283); x.fill(); x.stroke();
      if (document.activeElement !== r) { r.value = v.l; C.setRangeFill(r); }
    };
    const ev = (e) => { const b = cv.getBoundingClientRect(); let dx = ((e.clientX - b.left) / b.width) * 240 - cx, dy = ((e.clientY - b.top) / b.height) * 240 - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } return { x: dx / R, y: dy / R }; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const fine = e.shiftKey ? 0.25 : 1; const v0 = Object.assign({ x: 0, y: 0, l: 0 }, get()); const p0 = ev(e);
      const apply = (m) => { const p = ev(m); const v = fine < 1 ? { x: v0.x + (p.x - p0.x) * fine, y: v0.y + (p.y - p0.y) * fine } : p; set(Object.assign({}, get() || { l: 0 }, v), true); draw(); };
      apply(e);
      const up = () => { removeEventListener('pointermove', apply); removeEventListener('pointerup', up); set(get(), false); };
      addEventListener('pointermove', apply); addEventListener('pointerup', up);
    });
    cv.addEventListener('dblclick', () => { set(Object.assign({}, get(), { x: 0, y: 0 }), false); draw(); });
    r.addEventListener('input', () => { set(Object.assign({ x: 0, y: 0 }, get(), { l: +r.value }), true); });
    r.addEventListener('change', () => set(get(), false));
    box.querySelector('.reset-btn').onclick = () => { set({ x: 0, y: 0, l: 0 }, false); draw(); };
    draw();
    parent.appendChild(box);
    return { redraw: draw };
  };
})(window.C);
