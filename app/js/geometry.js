/* Cutroom — geometry: mesh warping, 3D projection, warp modes, shared shapes */
(function (C) {
  const G = (C.geo = {});

  // Draw `img` (sw x sh) mapped through a grid: map(u,v) -> [x, y] in destination pixels.
  G.drawMesh = (ctx, img, sw, sh, cols, rows, map, opts = {}) => {
    const P = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) P.push(map(i / cols, j / rows));
    const at = (i, j) => P[j * (cols + 1) + i];
    const cull = opts.cull;
    const t = ctx.getTransform ? ctx.getTransform() : null; const k = t ? Math.max(1e-3, Math.sqrt(Math.abs(t.a * t.d - t.b * t.c))) : 1;
    const grow = (opts.grow ?? 0.7) / k;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const u0 = (i / cols) * sw, u1 = ((i + 1) / cols) * sw, v0 = (j / rows) * sh, v1 = ((j + 1) / rows) * sh;
      const p00 = at(i, j), p10 = at(i + 1, j), p01 = at(i, j + 1), p11 = at(i + 1, j + 1);
      if (!p00 || !p10 || !p01 || !p11) continue;
      tri(ctx, img, u0, v0, u1, v0, u0, v1, p00, p10, p01, cull, grow);
      tri(ctx, img, u1, v1, u0, v1, u1, v0, p11, p01, p10, cull, grow);
    }
  };
  // Exact software mesh warp (no seams, correct with transparency). Returns ImageData of W x H.
  // map(u,v) -> [x,y] in output space (minus ox/oy). src: canvas or {data,width,height}.
  G.meshPixels = (src, sw, sh, cols, rows, map, W, H, ox = 0, oy = 0) => {
    const sd = src.data ? src.data : src.getContext('2d').getImageData(0, 0, sw, sh).data;
    const out = new ImageData(Math.max(1, W), Math.max(1, H)); const o = out.data; const done = new Uint8Array(W * H);
    const P = []; for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const q = map(i / cols, j / rows); P.push([q[0] - ox, q[1] - oy]); }
    const at = (i, j) => P[j * (cols + 1) + i];
    const sample = (sx, sy, idx) => {
      sx -= 0.5; sy -= 0.5; const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < 4; k++) {
        const xx = x0 + (k & 1), yy = y0 + (k >> 1); if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
        const w = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy); if (!w) continue; const i = (yy * sw + xx) * 4; const aw = sd[i + 3] * w;
        r += sd[i] * aw; g += sd[i + 1] * aw; b += sd[i + 2] * aw; a += aw;
      }
      if (a > 0) { o[idx] = r / a; o[idx + 1] = g / a; o[idx + 2] = b / a; o[idx + 3] = a; }
    };
    const triPx = (s0, s1, s2, d0, d1, d2) => {
      const den = (d1[1] - d2[1]) * (d0[0] - d2[0]) + (d2[0] - d1[0]) * (d0[1] - d2[1]); if (Math.abs(den) < 1e-9) return;
      const x0 = Math.max(0, Math.floor(Math.min(d0[0], d1[0], d2[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(d0[0], d1[0], d2[0])));
      const y0 = Math.max(0, Math.floor(Math.min(d0[1], d1[1], d2[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(d0[1], d1[1], d2[1])));
      const e = -1e-4;
      for (let y = y0; y <= y1; y++) { const py = y + 0.5;
        for (let x = x0; x <= x1; x++) { const n = y * W + x; if (done[n]) continue; const px = x + 0.5;
          const w0 = ((d1[1] - d2[1]) * (px - d2[0]) + (d2[0] - d1[0]) * (py - d2[1])) / den; if (w0 < e) continue;
          const w1 = ((d2[1] - d0[1]) * (px - d2[0]) + (d0[0] - d2[0]) * (py - d2[1])) / den; if (w1 < e) continue;
          const w2 = 1 - w0 - w1; if (w2 < e) continue;
          done[n] = 1; sample(w0 * s0[0] + w1 * s1[0] + w2 * s2[0], w0 * s0[1] + w1 * s1[1] + w2 * s2[1], n * 4);
        } }
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const u0 = (i / cols) * sw, u1 = ((i + 1) / cols) * sw, v0 = (j / rows) * sh, v1 = ((j + 1) / rows) * sh;
      triPx([u0, v0], [u1, v0], [u0, v1], at(i, j), at(i + 1, j), at(i, j + 1));
      triPx([u1, v1], [u0, v1], [u1, v0], at(i + 1, j + 1), at(i, j + 1), at(i + 1, j));
    }
    return out;
  };
  function tri(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, d0, d1, d2, cull, grow = 0.7) {
    const [x0, y0] = d0, [x1, y1] = d1, [x2, y2] = d2;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 0.01) return;
    if (cull && area * cull < 0) return;
    // expand the clip triangle slightly to hide seams
    const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3;
    const ex = (x, y) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + (dx / l) * grow, y + (dy / l) * grow]; };
    const a = ex(x0, y0), b = ex(x1, y1), c = ex(x2, y2);
    // affine: src -> dst
    const den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (Math.abs(den) < 1e-9) return;
    const m11 = ((x1 - x0) * (sy2 - sy0) - (x2 - x0) * (sy1 - sy0)) / den;
    const m12 = ((x2 - x0) * (sx1 - sx0) - (x1 - x0) * (sx2 - sx0)) / den;
    const m21 = ((y1 - y0) * (sy2 - sy0) - (y2 - y0) * (sy1 - sy0)) / den;
    const m22 = ((y2 - y0) * (sx1 - sx0) - (y1 - y0) * (sx2 - sx0)) / den;
    const dx = x0 - m11 * sx0 - m12 * sy0, dy = y0 - m21 * sx0 - m22 * sy0;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.clip();
    ctx.transform(m11, m21, m12, m22, dx, dy);
    const minX = Math.max(0, Math.floor(Math.min(sx0, sx1, sx2)) - 1), minY = Math.max(0, Math.floor(Math.min(sy0, sy1, sy2)) - 1);
    const maxX = Math.ceil(Math.max(sx0, sx1, sx2)) + 1, maxY = Math.ceil(Math.max(sy0, sy1, sy2)) + 1;
    const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
    const w = Math.min(iw, maxX) - minX, h = Math.min(ih, maxY) - minY;
    if (w > 0 && h > 0) ctx.drawImage(img, minX, minY, w, h, minX, minY, w, h);
    ctx.restore();
  }

  // ---------- 3D ----------
  const rad = (d) => (d * Math.PI) / 180;
  // rotate a point by rx, ry, rz (degrees) — order: Z, then Y, then X
  G.rot3 = (p, rx, ry, rz) => {
    let [x, y, z] = p;
    if (rz) { const c = Math.cos(rad(rz)), s = Math.sin(rad(rz)); [x, y] = [x * c - y * s, x * s + y * c]; }
    if (ry) { const c = Math.cos(rad(ry)), s = Math.sin(rad(ry)); [x, z] = [x * c + z * s, -x * s + z * c]; }
    if (rx) { const c = Math.cos(rad(rx)), s = Math.sin(rad(rx)); [y, z] = [y * c - z * s, y * s + z * c]; }
    return [x, y, z];
  };
  // perspective projection around (cx, cy); d = camera distance in px
  G.project = (p, cx, cy, d) => { const k = d / Math.max(1, d + p[2]); return [cx + p[0] * k, cy + p[1] * k]; };

  // ---------- warps (map u,v in 0..1 to local [x,y,z], centred, in content px) ----------
  G.WARPS = [['none', 'None'], ['arc', 'Arc'], ['arch', 'Arch'], ['bulge', 'Bulge'], ['squeeze', 'Squeeze'], ['wave', 'Wave'], ['flag', 'Flag'], ['fisheye', 'Fisheye'], ['twist', 'Twist'], ['wrap', 'Wrap (cylinder)'], ['sphere', 'Wrap (sphere)'], ['pin', 'Corner pin']];
  G.warpActive = (w) => w && w.mode && w.mode !== 'none';
  G.warpFn = (w, cw, ch, t) => {
    const k = (w.amount ?? 50) / 100, mode = w.mode, ph = t * (w.speed ?? 1);
    return (u, v) => {
      let x = (u - 0.5) * cw, y = (v - 0.5) * ch, z = 0;
      switch (mode) {
        case 'arc': { const A = k * Math.PI * 0.9; if (Math.abs(A) > 1e-3) { const R = cw / A; const th = (u - 0.5) * A; const r = R - y; x = r * Math.sin(th); y = R - r * Math.cos(th); y -= R * (1 - Math.cos(A / 2)) * 0.5; } break; }
        case 'arch': { y -= Math.sin(u * Math.PI) * k * ch * 0.5 * (1 - v); break; }
        case 'bulge': { const s = 1 + k * 0.6 * Math.sin(u * Math.PI); y *= s; break; }
        case 'squeeze': { const s = 1 - k * 0.5 * Math.sin(v * Math.PI); x *= s; break; }
        case 'wave': { y += Math.sin(u * Math.PI * 2 * (w.freq ?? 2) + ph * 3) * k * ch * 0.15; break; }
        case 'flag': { y += Math.sin(u * Math.PI * 2 * (w.freq ?? 1.5) - ph * 4) * k * ch * 0.12 * u; x += Math.cos(u * 5 - ph * 4) * k * cw * 0.01; break; }
        case 'fisheye': { const r = Math.hypot(u - 0.5, v - 0.5) * 2; if (r > 1e-4) { const nr = Math.pow(Math.min(r, 1.6), 1 - k * 0.6) / r; x *= nr; y *= nr; } break; }
        case 'twist': { const r = Math.hypot(u - 0.5, v - 0.5) * 2; const a = k * Math.PI * Math.max(0, 1 - r) * 1.5 + (w.speed ? ph * 0.5 * k : 0); const c = Math.cos(a), s = Math.sin(a); [x, y] = [x * c - y * s, x * s + y * c]; break; }
        case 'wrap': { const A = Math.max(0.05, Math.abs(k)) * Math.PI * 2; const R = cw / A; const th = (u - 0.5) * A + ph * (w.spin ?? 0.6); x = R * Math.sin(th); z = R - R * Math.cos(th); break; }
        case 'sphere': { const A = Math.max(0.05, Math.abs(k)) * Math.PI; const R = cw / (2 * Math.sin(Math.min(A, Math.PI) / 2) || 1); const th = (u - 0.5) * A * 2 + ph * (w.spin ?? 0.4); const ph2 = (v - 0.5) * Math.PI * 0.9; x = R * Math.sin(th) * Math.cos(ph2); y = R * Math.sin(ph2); z = R - R * Math.cos(th) * Math.cos(ph2); break; }
        case 'pin': { const p = w; const tl = [p.tlx || 0, p.tly || 0], tr = [p.trx || 0, p.try || 0], bl = [p.blx || 0, p.bly || 0], br = [p.brx || 0, p.bry || 0];
          const ox = (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + (1 - u) * v * bl[0] + u * v * br[0];
          const oy = (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + (1 - u) * v * bl[1] + u * v * br[1];
          x += (ox / 100) * cw; y += (oy / 100) * ch; break; }
      }
      return [x, y, z];
    };
  };

  // ---------- shared shape paths (video shape clips, masks, photo shapes) ----------
  G.SHAPES = [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['star', 'Star'], ['polygon', 'Polygon'], ['heart', 'Heart'], ['arrow', 'Arrow'], ['speech', 'Speech bubble'], ['cross', 'Cross'], ['ring', 'Ring'], ['line', 'Line']];
  function roundedPoly(x, pts, r) {
    const n = pts.length; if (!r) { pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); return; }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const start = mid(pts[n - 1], pts[0]); x.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const m = mid(p, q); const lim = Math.min(r, Math.hypot(q[0] - p[0], q[1] - p[1]) / 2, Math.hypot(p[0] - pts[(i + n - 1) % n][0], p[1] - pts[(i + n - 1) % n][1]) / 2); x.arcTo(p[0], p[1], m[0], m[1], lim); }
    x.closePath();
  }
  // Bezier path: pts [{x,y,ix,iy,ox,oy}] (handles relative to the point), scaled by sx, sy
  G.tracePath = (x, pts, sx = 1, sy = 1, closed = true) => {
    if (!pts || !pts.length) return;
    x.moveTo(pts[0].x * sx, pts[0].y * sy);
    const n = pts.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      x.bezierCurveTo((a.x + (a.ox || 0)) * sx, (a.y + (a.oy || 0)) * sy, (b.x + (b.ix || 0)) * sx, (b.y + (b.iy || 0)) * sy, b.x * sx, b.y * sy);
    }
    if (closed) x.closePath();
  };
  // s: {kind, w, h, radius (0-100), points, inner}
  G.shapePath = (x, s) => {
    const w = s.w, h = s.h, hw = Math.abs(w) / 2, hh = Math.abs(h) / 2;
    const r = ((s.radius || 0) / 100) * Math.min(hw, hh);
    x.beginPath();
    switch (s.kind) {
      case 'ellipse': x.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2); break;
      case 'ring': x.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2); x.ellipse(0, 0, hw * (s.inner ?? 0.6), hh * (s.inner ?? 0.6), 0, Math.PI * 2, 0, true); break;
      case 'rounded': x.roundRect(-hw, -hh, hw * 2, hh * 2, Math.max(r, Math.min(hw, hh) * 0.25)); break;
      case 'rect': if (r) x.roundRect(-hw, -hh, hw * 2, hh * 2, r); else x.rect(-hw, -hh, hw * 2, hh * 2); break;
      case 'triangle': roundedPoly(x, [[0, -hh], [hw, hh], [-hw, hh]], r); break;
      case 'star': case 'polygon': {
        const n = Math.max(3, s.points | 0 || 5), pts = []; const cnt = s.kind === 'star' ? n * 2 : n;
        for (let i = 0; i < cnt; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / cnt; const k = s.kind === 'star' && i % 2 ? s.inner ?? 0.45 : 1; pts.push([Math.cos(a) * hw * k, Math.sin(a) * hh * k]); }
        roundedPoly(x, pts, r * 0.6); break;
      }
      case 'cross': { const t = Math.min(hw, hh) * (s.inner ?? 0.35); roundedPoly(x, [[-t, -hh], [t, -hh], [t, -t], [hw, -t], [hw, t], [t, t], [t, hh], [-t, hh], [-t, t], [-hw, t], [-hw, -t], [-t, -t]], r * 0.4); break; }
      case 'speech': { x.roundRect(-hw, -hh, hw * 2, hh * 1.5, Math.max(r, hh * 0.3)); x.moveTo(-hw * 0.4, hh * 0.5); x.lineTo(-hw * 0.6, hh); x.lineTo(-hw * 0.05, hh * 0.5); x.closePath(); break; }
      case 'line': x.moveTo(-w / 2, -h / 2); x.lineTo(w / 2, h / 2); break;
      case 'arrow': { const t = Math.max(4, hh * 0.7), head = Math.min(hw, hh * 1.2); roundedPoly(x, [[-hw, -t / 2], [hw - head, -t / 2], [hw - head, -hh], [hw, 0], [hw - head, hh], [hw - head, t / 2], [-hw, t / 2]], r * 0.3); break; }
      case 'path': G.tracePath(x, s.pts, w, h, s.closed !== false); break;
      case 'heart': { const sx = hw, sy = hh; x.moveTo(0, sy * 0.9); x.bezierCurveTo(-sx * 1.3, sy * 0.1, -sx * 0.7, -sy * 1.1, 0, -sy * 0.45); x.bezierCurveTo(sx * 0.7, -sy * 1.1, sx * 1.3, sy * 0.1, 0, sy * 0.9); x.closePath(); break; }
      default: x.rect(-hw, -hh, hw * 2, hh * 2);
    }
  };
})(window.C);
