/* Cutroom — text effects: letter animations, loops, gradient, glow, 3D, curved text */
(function (C) {
  const T = (C.textFX = {});
  T.CHAR_IN = [['none', 'None'], ['pop', 'Pop'], ['rise', 'Rise'], ['drop', 'Drop'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['spin', 'Spin'], ['flip', 'Flip'], ['slide', 'Slide'], ['wave', 'Wave'], ['elastic', 'Elastic'], ['blur', 'Blur'], ['scramble', 'Scramble / decode'], ['type', 'Typewriter']];
  T.CHAR_OUT = [['none', 'None'], ['fade', 'Fade'], ['pop', 'Shrink'], ['fall', 'Fall'], ['rise', 'Rise'], ['spin', 'Spin'], ['scramble', 'Scramble'], ['slide', 'Slide']];
  T.CHAR_LOOP = [['none', 'None'], ['wave', 'Wave'], ['bounce', 'Bounce'], ['jiggle', 'Jiggle'], ['pulse', 'Pulse'], ['rainbow', 'Rainbow'], ['flicker', 'Neon flicker'], ['shake', 'Shake'], ['glow', 'Glow pulse']];
  T.DEFAULTS = { fill: 'solid', grad1: '#ffd84d', grad2: '#ff4f9a', gradAngle: 90, glow: 0, glowColor: '#19d3c5', extrude: 0, extrudeColor: '#7c2d12', extrudeAngle: 135, curve: 0, stroke2Width: 0, stroke2Color: '#ffffff', charIn: 'none', charOut: 'none', charLoop: 'none', stagger: 0.04, charDur: 0.45, loopSpeed: 1, bgStyle: 'box', shadowColor: '#000000' };
  const SCR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=?!';
  const rnd = (n) => { const x = Math.sin(n * 91.17 + 7.3) * 43758.5453; return x - Math.floor(x); };
  const ease = (k, e) => (C.kf.easeFn[e] || C.kf.easeFn.out)(C.clamp(k, 0, 1));

  const font = (tx, px) => `${tx.italic ? 'italic ' : ''}${tx.bold ? '700' : '400'} ${px}px "${tx.font}", "Segoe UI Emoji", "Segoe UI", Arial, sans-serif`;
  const needsChars = (tx, chars) => chars < 1 || tx.charIn !== 'none' || tx.charOut !== 'none' || tx.charLoop !== 'none' || Math.abs(tx.curve || 0) > 0.5;

  function fillFor(ctx, tx, w, h) {
    if (tx.fill !== 'gradient') return tx.color;
    const a = ((tx.gradAngle || 90) * Math.PI) / 180, r = Math.hypot(w, h) / 2;
    const g = ctx.createLinearGradient(-Math.sin(a) * r, Math.cos(a) * -r, Math.sin(a) * r, Math.cos(a) * r);
    g.addColorStop(0, tx.grad1); g.addColorStop(1, tx.grad2); return g;
  }

  // Draw a string (or single char) at x,y with all layered styles
  function paint(ctx, tx, s, x, y, px, fill, extra = {}) {
    const a0 = ctx.globalAlpha;
    if (tx.extrude > 0) {
      const ang = ((tx.extrudeAngle || 135) * Math.PI) / 180, d = (tx.extrude * px) / 100, n = Math.max(2, Math.ceil(d / Math.max(1, px / 60)));
      ctx.fillStyle = tx.extrudeColor;
      for (let i = n; i >= 1; i--) ctx.fillText(s, x + Math.cos(ang) * d * (i / n), y + Math.sin(ang) * d * (i / n));
    }
    if (tx.shadow > 0) { ctx.shadowColor = hexA(tx.shadowColor || '#000000', tx.shadow); ctx.shadowBlur = px * 0.18; ctx.shadowOffsetY = px * 0.05; }
    const glow = (tx.glow || 0) * (extra.glowMul ?? 1);
    if (glow > 0) {
      ctx.save(); ctx.shadowColor = tx.glowColor; ctx.shadowOffsetY = 0;
      for (const k of [0.6, 0.3]) { ctx.shadowBlur = (glow / 100) * px * k * 1.6; ctx.fillStyle = tx.glowColor; ctx.globalAlpha = a0 * Math.min(1, glow / 60); ctx.fillText(s, x, y); }
      ctx.restore();
    }
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    if (tx.stroke2Width > 0) { ctx.strokeStyle = tx.stroke2Color; ctx.lineWidth = ((tx.strokeWidth || 0) + tx.stroke2Width) * px / 25; ctx.strokeText(s, x, y); ctx.shadowColor = 'transparent'; }
    if (tx.strokeWidth > 0) { ctx.strokeStyle = tx.strokeColor; ctx.lineWidth = (tx.strokeWidth * px) / 50; ctx.strokeText(s, x, y); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = extra.color || fill; ctx.fillText(s, x, y);
    ctx.shadowColor = 'transparent';
  }
  const hexA = (hex, a) => { const n = parseInt((hex || '#000000').slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  // per-letter animation state
  function charState(tx, i, n, local, dur, px) {
    const s = { dx: 0, dy: 0, sc: 1, scx: 1, rot: 0, a: 1, ch: null, color: null, glowMul: 1 };
    const cd = Math.max(0.05, tx.charDur || 0.45), st = tx.stagger ?? 0.04;
    if (tx.charIn && tx.charIn !== 'none') {
      const k = (local - i * st) / cd; const e = C.clamp(k, 0, 1);
      switch (tx.charIn) {
        case 'pop': s.sc *= ease(e, 'back'); s.a *= C.clamp(k * 3, 0, 1); break;
        case 'rise': s.dy += (1 - ease(e, 'out')) * px * 0.8; s.a *= e; break;
        case 'drop': s.dy -= (1 - ease(e, 'bounce')) * px * 1.4; s.a *= C.clamp(k * 4, 0, 1); break;
        case 'fade': s.a *= ease(e, 'inout'); break;
        case 'zoom': s.sc *= 1 + (1 - ease(e, 'out')) * 2.5; s.a *= e; break;
        case 'spin': s.rot += (1 - ease(e, 'out')) * -Math.PI; s.sc *= ease(e, 'out'); break;
        case 'flip': s.scx *= Math.cos((1 - ease(e, 'out')) * Math.PI * 0.5); s.a *= C.clamp(k * 2, 0, 1); break;
        case 'slide': s.dx -= (1 - ease(e, 'out')) * px * 1.2; s.a *= e; break;
        case 'wave': s.dy += Math.sin(e * Math.PI) * -px * 0.35 + (1 - ease(e, 'out')) * px * 0.6; s.a *= C.clamp(k * 2, 0, 1); break;
        case 'elastic': s.sc *= ease(e, 'elastic'); break;
        case 'blur': s.a *= e; s.sc *= 1 + (1 - e) * 0.4; s.glowMul = 1 + (1 - e) * 3; break;
        case 'scramble': if (k < 1) { s.ch = k < 0 ? ' ' : SCR[Math.floor(rnd(Math.floor(local * 24) * 13 + i) * SCR.length)]; } break;
        case 'type': if (k < 0) s.a = 0; break;
      }
      if (k < 0 && tx.charIn !== 'scramble') s.a = 0;
    }
    if (tx.charOut && tx.charOut !== 'none') {
      const k = (dur - local - (n - 1 - i) * st) / cd; const e = C.clamp(k, 0, 1);
      if (k < 1) switch (tx.charOut) {
        case 'fade': s.a *= e; break;
        case 'pop': s.sc *= ease(e, 'out'); break;
        case 'fall': s.dy += (1 - e) * (1 - e) * px * 2; s.rot += (1 - e) * 0.6; s.a *= e; break;
        case 'rise': s.dy -= (1 - ease(e, 'out')) * px; s.a *= e; break;
        case 'spin': s.rot += (1 - e) * Math.PI; s.sc *= e; break;
        case 'scramble': if (k < 0.8) s.ch = k <= 0 ? ' ' : SCR[Math.floor(rnd(Math.floor(local * 24) * 7 + i) * SCR.length)]; break;
        case 'slide': s.dx += (1 - ease(e, 'out')) * px * 1.2; s.a *= e; break;
      }
    }
    if (tx.charLoop && tx.charLoop !== 'none') {
      const ph = local * (tx.loopSpeed || 1);
      switch (tx.charLoop) {
        case 'wave': s.dy += Math.sin(ph * 5 - i * 0.55) * px * 0.14; break;
        case 'bounce': s.dy -= Math.abs(Math.sin(ph * 4 - i * 0.45)) * px * 0.25; break;
        case 'jiggle': s.rot += Math.sin(ph * 11 + i * 2.1) * 0.12; break;
        case 'pulse': s.sc *= 1 + Math.sin(ph * 5 - i * 0.4) * 0.1; break;
        case 'rainbow': s.color = `hsl(${(ph * 140 + i * 28) % 360},95%,62%)`; break;
        case 'flicker': { const f = rnd(Math.floor(ph * 18) + i * 3.7); s.a *= f > 0.92 ? 0.25 : f > 0.85 ? 0.7 : 1; s.glowMul = f > 0.92 ? 0.2 : 1; break; }
        case 'shake': s.dx += (rnd(Math.floor(ph * 30) + i) - 0.5) * px * 0.08; s.dy += (rnd(Math.floor(ph * 30) * 3 + i) - 0.5) * px * 0.08; break;
        case 'glow': s.glowMul = 0.4 + 0.9 * (0.5 + 0.5 * Math.sin(ph * 4)); break;
      }
    }
    return s;
  }

  T.draw = (ctx, c, ms, chars, local) => {
    const tx = Object.assign({}, T.DEFAULTS, c.text);
    const { px, lines, pad } = ms;
    ctx.font = font(tx, px);
    ctx.textBaseline = 'middle';
    const lh = px * tx.lineHeight;
    // background
    if (tx.bgOpacity > 0) {
      ctx.save(); ctx.globalAlpha *= tx.bgOpacity; ctx.fillStyle = tx.bg;
      if (tx.bgStyle === 'line') {
        try { ctx.letterSpacing = (tx.letterSpacing * px) / 100 + 'px'; } catch (_) {}
        lines.forEach((l, i) => { const w = ctx.measureText(l || ' ').width + px * 0.5; const y = -ms.h / 2 + pad + lh * i; const x = tx.align === 'left' ? -ms.w / 2 + pad - px * 0.25 : tx.align === 'right' ? ms.w / 2 - pad - w + px * 0.25 : -w / 2; ctx.beginPath(); ctx.roundRect(x, y + lh * 0.06, w, lh * 0.94, px * 0.14); ctx.fill(); });
      } else { const r = tx.bgStyle === 'pill' ? ms.h / 2 : px * 0.22; ctx.beginPath(); ctx.roundRect(-ms.w / 2, -ms.h / 2, ms.w, ms.h, r); ctx.fill(); }
      ctx.restore();
    }
    const fill = fillFor(ctx, tx, ms.w, ms.h);
    if (!needsChars(tx, chars)) {
      try { ctx.letterSpacing = (tx.letterSpacing * px) / 100 + 'px'; } catch (_) {}
      ctx.textAlign = tx.align;
      const x0 = tx.align === 'left' ? -ms.w / 2 + pad : tx.align === 'right' ? ms.w / 2 - pad : 0;
      lines.forEach((l, i) => paint(ctx, tx, l, x0, -ms.h / 2 + pad + lh * (i + 0.5), px, fill, { glowMul: tx.charLoop === 'glow' ? 1 : 1 }));
      return;
    }
    // per-letter layout
    try { ctx.letterSpacing = '0px'; } catch (_) {}
    ctx.textAlign = 'center';
    const sp = (tx.letterSpacing * px) / 100;
    const all = lines.map((l) => Array.from(l));
    const n = all.reduce((a, l) => a + l.length, 0);
    let visible = chars >= 1 ? Infinity : Math.floor(n * chars);
    let gi = 0;
    const dur = c.duration;
    const baseA = ctx.globalAlpha;
    all.forEach((glyphs, li) => {
      const ws = glyphs.map((g) => ctx.measureText(g).width);
      const lw = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, glyphs.length - 1);
      let x = tx.align === 'left' ? -ms.w / 2 + pad : tx.align === 'right' ? ms.w / 2 - pad - lw : -lw / 2;
      const mid = x + lw / 2;
      const y = -ms.h / 2 + pad + lh * (li + 0.5);
      const curve = ((tx.curve || 0) / 100) * Math.PI; // total arc angle
      const R = Math.abs(curve) > 1e-3 ? lw / Math.abs(curve) : 0;
      glyphs.forEach((g, ci) => {
        const cx = x + ws[ci] / 2; x += ws[ci] + sp;
        const idx = gi++;
        if (visible !== Infinity && idx >= visible) return;
        const st = charState(tx, idx, n, local, dur, px);
        if (st.a <= 0.003) return;
        let px2 = cx, py2 = y, rot = 0;
        if (R) { const theta = (cx - mid) / R; const sg = Math.sign(curve); px2 = mid + R * Math.sin(theta); py2 = y + sg * (R - R * Math.cos(theta)); rot = sg * theta; }
        ctx.save();
        ctx.globalAlpha = baseA * st.a;
        ctx.translate(px2 + st.dx, py2 + st.dy);
        ctx.rotate(rot + st.rot);
        ctx.scale(st.sc * st.scx, st.sc);
        paint(ctx, tx, st.ch || g, 0, 0, px, fill, { color: st.color, glowMul: st.glowMul });
        ctx.restore();
      });
    });
  };

  // Text style presets (for the Text library)
  T.STYLES = [
    { name: 'Neon glow', css: 'color:#b9fffa;text-shadow:0 0 6px #19d3c5,0 0 14px #19d3c5;font-weight:700', text: { content: 'NEON', color: '#e8fffd', glow: 80, glowColor: '#19d3c5', shadow: 0, charLoop: 'flicker', font: 'Bahnschrift' } },
    { name: 'Gradient pop', css: 'background:linear-gradient(90deg,#ffd84d,#ff4f9a);-webkit-background-clip:text;color:transparent;font-weight:900', text: { content: 'POP!', fill: 'gradient', grad1: '#ffd84d', grad2: '#ff4f9a', size: 150, font: 'Arial Black', strokeWidth: 4, strokeColor: '#1b0b2e', charIn: 'pop' } },
    { name: 'Retro 3D', css: 'color:#ffe14d;text-shadow:2px 2px 0 #e8590c,4px 4px 0 #7c2d12;font-weight:900', text: { content: 'RETRO', color: '#ffe14d', extrude: 22, extrudeColor: '#c2410c', size: 150, font: 'Arial Black', strokeWidth: 3, strokeColor: '#3b0a00', charIn: 'drop' } },
    { name: 'Comic', css: 'font-family:Impact;color:#fff;-webkit-text-stroke:1.5px #000;text-shadow:3px 3px 0 #000', text: { content: 'KAPOW!', font: 'Impact', bold: false, size: 160, color: '#ffffff', strokeWidth: 8, stroke2Width: 6, stroke2Color: '#ff2d55', extrude: 10, extrudeColor: '#000000', charIn: 'elastic' } },
    { name: 'Wave title', css: 'font-weight:800;color:#7ffcf0', text: { content: 'Making waves', color: '#7ffcf0', size: 110, charIn: 'wave', charLoop: 'wave', shadow: 0.5 } },
    { name: 'Decode', css: 'font-family:Consolas;color:#3ee08f', text: { content: 'ACCESS GRANTED', font: 'Consolas', color: '#3ee08f', size: 80, glow: 45, glowColor: '#3ee08f', charIn: 'scramble', stagger: 0.06, charDur: 0.5 } },
    { name: 'Bouncy', css: 'font-weight:900;color:#ff6b9a', text: { content: 'Bouncy!', color: '#ff6b9a', size: 130, strokeWidth: 6, strokeColor: '#ffffff', charIn: 'pop', charLoop: 'bounce', font: 'Arial Black' } },
    { name: 'Rainbow', css: 'background:linear-gradient(90deg,#f55,#fd5,#5f8,#5af,#c5f);-webkit-background-clip:text;color:transparent;font-weight:900', text: { content: 'RAINBOW', size: 130, font: 'Arial Black', charLoop: 'rainbow', strokeWidth: 4, strokeColor: '#111111' } },
    { name: 'Curved', css: 'font-weight:700;color:#fff;letter-spacing:2px', text: { content: 'CURVED TEXT', size: 90, curve: 45, letterSpacing: 8, shadow: 0.6 } },
    { name: 'Highlighter', css: 'background:#ffe14d;color:#111;padding:0 6px;font-weight:700', text: { content: 'Highlight this\nline by line', color: '#111111', bg: '#ffe14d', bgOpacity: 1, bgStyle: 'line', size: 70, shadow: 0, align: 'center' } },
    { name: 'Fire', css: 'background:linear-gradient(0deg,#ff3d00,#ffd54d);-webkit-background-clip:text;color:transparent;font-weight:900', text: { content: 'ON FIRE', fill: 'gradient', grad1: '#ffe066', grad2: '#ff3d00', gradAngle: 0, glow: 60, glowColor: '#ff6a00', size: 140, font: 'Impact', bold: false, charLoop: 'jiggle' } },
    { name: 'Ice', css: 'background:linear-gradient(0deg,#4dd4ff,#ffffff);-webkit-background-clip:text;color:transparent;font-weight:900', text: { content: 'FROZEN', fill: 'gradient', grad1: '#ffffff', grad2: '#4dd4ff', gradAngle: 0, glow: 40, glowColor: '#9be7ff', stroke2Width: 3, stroke2Color: '#0b3d5c', size: 140, font: 'Bahnschrift', charIn: 'blur' } },
    { name: 'Spin in', css: 'font-weight:800;color:#c77dff', text: { content: 'Spin it', color: '#c77dff', size: 120, charIn: 'spin', stagger: 0.07, strokeWidth: 3, strokeColor: '#1a0730' } },
    { name: 'Subtitle pill', css: 'background:#000c;color:#fff;border-radius:20px;padding:2px 10px', text: { content: 'Clean subtitle', size: 56, bg: '#000000', bgOpacity: 0.7, bgStyle: 'pill', shadow: 0, bold: false }, t: { y: 0.86 } },
  ];
})(window.C);
