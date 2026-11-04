/* Cutroom — GPU color grading (WebGL): light, color, wheels, curves, HSL, LUTs, looks */
(function (C) {
  const G = (C.grade = {});

  G.defaults = () => ({
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    temp: 0, tint: 0, vibrance: 0, saturation: 0, hue: 0, fade: 0, sharpen: 0,
    lift: { x: 0, y: 0, l: 0 }, gamma: { x: 0, y: 0, l: 0 }, gain: { x: 0, y: 0, l: 0 },
    curves: null, hsl: null, lut: null, lutMix: 1, bw: 0,
  });
  G.SCALARS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temp', 'tint', 'vibrance', 'saturation', 'hue', 'fade', 'sharpen', 'lutMix', 'bw'];
  G.HSL_BANDS = [['Red', 0, '#ff3b3b'], ['Orange', 30, '#ff9a2e'], ['Yellow', 60, '#ffe14d'], ['Green', 120, '#3ee08f'], ['Aqua', 180, '#30d5e8'], ['Blue', 225, '#3b6bff'], ['Purple', 275, '#a45cff'], ['Magenta', 320, '#ff4fc3']];

  const wheelOn = (w) => w && (Math.abs(w.x) > 1e-4 || Math.abs(w.y) > 1e-4 || Math.abs(w.l) > 1e-4);
  G.active = (g) => {
    if (!g) return false;
    for (const k of G.SCALARS) if (k !== 'lutMix' && Math.abs(g[k] || 0) > 1e-4) return true;
    if (wheelOn(g.lift) || wheelOn(g.gamma) || wheelOn(g.gain)) return true;
    if (g.curves && curvesKey(g.curves) !== IDENT_KEY) return true;
    if (g.hsl && g.hsl.some((b) => b && (b[0] || b[1] || b[2]))) return true;
    if (g.lut && g.lut.path && (g.lutMix ?? 1) > 0) return true;
    return false;
  };

  // ---------- curves (monotone cubic) ----------
  const IDENT = [[0, 0], [1, 1]];
  const curvesKey = (cv) => JSON.stringify([cv.m || IDENT, cv.r || IDENT, cv.g || IDENT, cv.b || IDENT]);
  const IDENT_KEY = curvesKey({});
  G.evalCurve = (pts, n = 256) => {
    const p = (pts && pts.length >= 2 ? pts : IDENT).slice().sort((a, b) => a[0] - b[0]);
    const out = new Float32Array(n);
    const k = p.length, xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const d = [], m = new Array(k).fill(0);
    for (let i = 0; i < k - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
    m[0] = d[0]; m[k - 1] = d[k - 2];
    for (let i = 1; i < k - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < k - 1; i++) { if (Math.abs(d[i]) < 1e-9) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
    for (let j = 0; j < n; j++) {
      const x = j / (n - 1);
      if (x <= xs[0]) { out[j] = ys[0]; continue; } if (x >= xs[k - 1]) { out[j] = ys[k - 1]; continue; }
      let i = 0; while (i < k - 2 && x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      out[j] = C.clamp((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1], 0, 1);
    }
    return out;
  };

  // ---------- .cube LUTs ----------
  const lutCache = new Map(); // path -> {size, data(Float32Array rgb), tex}
  G.parseCube = (text) => {
    let size = 0; const vals = [];
    let dmin = [0, 0, 0], dmax = [1, 1, 1];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if (!line || line[0] === '#') continue;
      if (/^LUT_3D_SIZE/i.test(line)) { size = parseInt(line.split(/\s+/)[1], 10); continue; }
      if (/^DOMAIN_MIN/i.test(line)) { dmin = line.split(/\s+/).slice(1).map(Number); continue; }
      if (/^DOMAIN_MAX/i.test(line)) { dmax = line.split(/\s+/).slice(1).map(Number); continue; }
      if (/^[A-Z_]/i.test(line)) continue;
      const p = line.split(/\s+/).map(Number); if (p.length >= 3 && p.every((v) => !isNaN(v))) vals.push((p[0] - dmin[0]) / (dmax[0] - dmin[0]), (p[1] - dmin[1]) / (dmax[1] - dmin[1]), (p[2] - dmin[2]) / (dmax[2] - dmin[2]));
    }
    if (!size || vals.length < size * size * size * 3) throw new Error('Not a valid 3D .cube LUT');
    return { size, data: Float32Array.from(vals.slice(0, size * size * size * 3)) };
  };
  G.loadLut = async (path) => {
    if (lutCache.has(path)) return lutCache.get(path);
    const text = await window.native.readText(path);
    const l = G.parseCube(text); lutCache.set(path, l); return l;
  };
  G.lutReady = (path) => lutCache.has(path) && lutCache.get(path);

  // ---------- WebGL ----------
  let gl = null, cv = null, prog = null, U = {}, srcTex, curveTex, lutTex, lastLutPath = null, lastCurve = null, ok = true;
  const VS = `attribute vec2 p; varying vec2 v; void main(){ v = (p + 1.0) * 0.5; v.y = 1.0 - v.y; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `precision highp float; varying vec2 v;
    uniform sampler2D src, crv, lut; uniform vec2 px;
    uniform float exposure, contrast, highlights, shadows, whites, blacks, temp, tint, vibrance, saturation, hue, fade, sharpen, lutMix, lutSize, useLut, useCrv, bw;
    uniform vec3 lift, gamma, gain; uniform float hsl[24];
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    vec3 rgb2hsl(vec3 c){ float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)); float l=(mx+mn)*0.5; float d=mx-mn; float h=0.0, s=0.0;
      if(d>1e-5){ s = l>0.5 ? d/(2.0-mx-mn) : d/(mx+mn); if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0); else if(mx==c.g) h=(c.b-c.r)/d+2.0; else h=(c.r-c.g)/d+4.0; h/=6.0; } return vec3(h,s,l); }
    float h2r(float p,float q,float t){ if(t<0.0)t+=1.0; if(t>1.0)t-=1.0; if(t<1.0/6.0)return p+(q-p)*6.0*t; if(t<0.5)return q; if(t<2.0/3.0)return p+(q-p)*(2.0/3.0-t)*6.0; return p; }
    vec3 hsl2rgb(vec3 c){ if(c.y<1e-5) return vec3(c.z); float q=c.z<0.5?c.z*(1.0+c.y):c.z+c.y-c.z*c.y; float p=2.0*c.z-q; return vec3(h2r(p,q,c.x+1.0/3.0),h2r(p,q,c.x),h2r(p,q,c.x-1.0/3.0)); }
    vec3 lut3(vec3 c){ float n=lutSize; vec3 s=clamp(c,0.0,1.0)*(n-1.0); float b=floor(s.b); float f=s.b-b; float b2=min(b+1.0,n-1.0);
      vec2 uv1=vec2((b*n + s.r + 0.5)/(n*n), (s.g+0.5)/n); vec2 uv2=vec2((b2*n + s.r + 0.5)/(n*n), (s.g+0.5)/n);
      return mix(texture2D(lut,uv1).rgb, texture2D(lut,uv2).rgb, f); }
    void main(){
      vec4 t = texture2D(src, v); vec3 c = t.rgb;
      if (t.a > 0.0) c /= max(t.a, 1e-4);
      if (sharpen > 0.0) { vec3 n = (texture2D(src, v+vec2(px.x,0.0)).rgb + texture2D(src, v-vec2(px.x,0.0)).rgb + texture2D(src, v+vec2(0.0,px.y)).rgb + texture2D(src, v-vec2(0.0,px.y)).rgb) * 0.25; c += (c - n) * sharpen * 2.5; }
      c *= exp2(exposure);
      c.r += temp * 0.08; c.b -= temp * 0.08; c.g -= tint * 0.06; c.r += tint * 0.02; c.b += tint * 0.02;
      c = (c - 0.5) * (1.0 + contrast) + 0.5;
      float l = luma(clamp(c, 0.0, 1.0));
      c += highlights * 0.45 * smoothstep(0.45, 1.0, l);
      c += shadows * 0.45 * (1.0 - smoothstep(0.0, 0.55, l));
      c += whites * 0.3 * smoothstep(0.7, 1.0, l);
      c += blacks * 0.3 * (1.0 - smoothstep(0.0, 0.3, l));
      c = gain * (c + lift * (1.0 - c));
      c = pow(max(c, vec3(0.0)), 1.0 / max(gamma, vec3(0.05)));
      l = luma(c);
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      c = mix(vec3(l), c, 1.0 + vibrance * (1.0 - clamp(mx - mn, 0.0, 1.0)));
      c = mix(vec3(l), c, 1.0 + saturation);
      if (abs(hue) > 1e-4) { const mat3 toY = mat3(0.299,0.596,0.211, 0.587,-0.274,-0.523, 0.114,-0.322,0.312); const mat3 toR = mat3(1.0,1.0,1.0, 0.956,-0.272,-1.106, 0.621,-0.647,1.703); vec3 yiq = toY * c; float a = hue; float cs = cos(a), sn = sin(a); yiq = vec3(yiq.x, yiq.y*cs - yiq.z*sn, yiq.y*sn + yiq.z*cs); c = toR * yiq; }
      vec3 hs = rgb2hsl(clamp(c, 0.0, 1.0)); float dh = 0.0, ds = 0.0, dl = 0.0; float wsum = 0.0;
      for (int i = 0; i < 8; i++) { float ctr = float(i==0?0.0:i==1?30.0:i==2?60.0:i==3?120.0:i==4?180.0:i==5?225.0:i==6?275.0:320.0)/360.0; float d = abs(hs.x - ctr); d = min(d, 1.0 - d); float w = (1.0 - smoothstep(0.0, 0.09, d)) * smoothstep(0.02, 0.2, hs.y); dh += w * hsl[i*3]; ds += w * hsl[i*3+1]; dl += w * hsl[i*3+2]; wsum += w; }
      if (wsum > 0.0) { hs.x = fract(hs.x + dh * 0.1); hs.y = clamp(hs.y * (1.0 + ds), 0.0, 1.0); hs.z = clamp(hs.z + dl * 0.25 * hs.y, 0.0, 1.0); c = hsl2rgb(hs); }
      c = mix(c, vec3(luma(c)), bw);
      c = clamp(c, 0.0, 1.0);
      if (useCrv > 0.5) { c = vec3(texture2D(crv, vec2(c.r, 0.125)).r, texture2D(crv, vec2(c.g, 0.125)).r, texture2D(crv, vec2(c.b, 0.125)).r);
        c = vec3(texture2D(crv, vec2(c.r, 0.375)).r, texture2D(crv, vec2(c.g, 0.625)).r, texture2D(crv, vec2(c.b, 0.875)).r); }
      c = mix(c, 0.08 + c * 0.84, fade);
      if (useLut > 0.5) c = mix(c, lut3(c), lutMix);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * t.a, t.a);
    }`;
  function init() {
    if (gl || !ok) return !!gl;
    try {
      cv = document.createElement('canvas');
      gl = cv.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
      if (!gl) throw new Error('no webgl');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['src', 'crv', 'lut', 'px', 'lift', 'gamma', 'gain', 'hsl', 'lutSize', 'useLut', 'useCrv', ...G.SCALARS]) U[n] = gl.getUniformLocation(prog, n);
      const mk = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
      srcTex = mk(0); curveTex = mk(1); lutTex = mk(2);
      gl.uniform1i(U.src, 0); gl.uniform1i(U.crv, 1); gl.uniform1i(U.lut, 2);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      return true;
    } catch (e) { console.warn('Color grading unavailable:', e); ok = false; gl = null; return false; }
  }
  G.available = () => init();

  const wheelVec = (w, kind) => {
    if (!w) return kind === 'lift' ? [0, 0, 0] : [1, 1, 1];
    const ang = Math.atan2(w.y, w.x), r = Math.min(1, Math.hypot(w.x, w.y));
    const hc = [0, 2.094, 4.189].map((o) => Math.cos(ang - o)); // hue direction, zero-mean
    const s = kind === 'lift' ? 0.12 : kind === 'gamma' ? 0.25 : 0.3;
    if (kind === 'lift') return hc.map((h) => h * r * s + w.l * 0.25);
    return hc.map((h) => 1 + h * r * s + w.l * (kind === 'gamma' ? 0.6 : 0.5));
  };

  // Grade a source (video/img/canvas) and return a canvas with the result
  G.apply = (src, g, maxW = 2560, maxH = 2560) => {
    if (!init()) return src;
    const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
    if (!sw || !sh) return src;
    const k = Math.min(1, maxW / sw, maxH / sh);
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { return src; }
    gl.uniform2f(U.px, 1 / w, 1 / h);
    const s = (n, v) => gl.uniform1f(U[n], v);
    s('exposure', g.exposure || 0); s('contrast', (g.contrast || 0) / 100); s('highlights', (g.highlights || 0) / 100); s('shadows', (g.shadows || 0) / 100);
    s('whites', (g.whites || 0) / 100); s('blacks', (g.blacks || 0) / 100); s('temp', (g.temp || 0) / 100); s('tint', (g.tint || 0) / 100);
    s('vibrance', (g.vibrance || 0) / 100); s('saturation', (g.saturation || 0) / 100); s('hue', ((g.hue || 0) * Math.PI) / 180);
    s('fade', (g.fade || 0) / 100); s('sharpen', (g.sharpen || 0) / 100); s('bw', (g.bw || 0) / 100);
    gl.uniform3fv(U.lift, wheelVec(g.lift, 'lift')); gl.uniform3fv(U.gamma, wheelVec(g.gamma, 'gamma')); gl.uniform3fv(U.gain, wheelVec(g.gain, 'gain'));
    const hsl = new Float32Array(24); if (g.hsl) g.hsl.forEach((b, i) => { if (b) { hsl[i * 3] = (b[0] || 0) / 100; hsl[i * 3 + 1] = (b[1] || 0) / 100; hsl[i * 3 + 2] = (b[2] || 0) / 100; } });
    gl.uniform1fv(U.hsl, hsl);
    // curves texture (256 x 4 rows: master, r, g, b)
    const useCrv = g.curves && curvesKey(g.curves) !== IDENT_KEY;
    s('useCrv', useCrv ? 1 : 0);
    if (useCrv) {
      const key = curvesKey(g.curves);
      if (key !== lastCurve) {
        const rows = [g.curves.m, g.curves.r, g.curves.g, g.curves.b].map((p) => G.evalCurve(p));
        const data = new Uint8Array(256 * 4 * 4);
        rows.forEach((row, y) => { for (let x = 0; x < 256; x++) { const o = (y * 256 + x) * 4, v = Math.round(row[x] * 255); data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255; } });
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, curveTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        lastCurve = key;
      }
    }
    const lut = g.lut && g.lut.path && G.lutReady(g.lut.path);
    if (g.lut && g.lut.path && !lutCache.has(g.lut.path)) G.loadLut(g.lut.path).then(() => C.engine && C.engine.requestDraw()).catch(() => {});
    s('useLut', lut ? 1 : 0); s('lutMix', g.lutMix ?? 1);
    if (lut) {
      if (lastLutPath !== g.lut.path) {
        const n = lut.size; const data = new Uint8Array(n * n * n * 4);
        for (let b = 0; b < n; b++) for (let gg = 0; gg < n; gg++) for (let r = 0; r < n; r++) {
          const si = (r + gg * n + b * n * n) * 3; const di = (gg * n * n + b * n + r) * 4;
          data[di] = Math.round(C.clamp(lut.data[si], 0, 1) * 255); data[di + 1] = Math.round(C.clamp(lut.data[si + 1], 0, 1) * 255); data[di + 2] = Math.round(C.clamp(lut.data[si + 2], 0, 1) * 255); data[di + 3] = 255;
        }
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, lutTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n * n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        lastLutPath = g.lut.path;
      }
      s('lutSize', lut.size);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return cv;
  };

  // Grade into a fresh 2D canvas (for the photo editor & thumbnails)
  G.toCanvas = (src, g) => {
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const r = G.apply(src, g, 1e5, 1e5);
    out.getContext('2d').drawImage(r, 0, 0, out.width, out.height);
    return out;
  };

  // ---------- looks (grade presets) ----------
  G.LOOKS = [
    { id: 'none', name: 'None', g: {} },
    { id: 'teal', name: 'Teal & orange', g: { contrast: 15, temp: 8, saturation: 10, lift: { x: -0.55, y: -0.6, l: 0 }, gain: { x: 0.55, y: 0.25, l: 0 } } },
    { id: 'film', name: 'Warm film', g: { temp: 25, fade: 25, contrast: -5, saturation: -10, highlights: -20, curves: { m: [[0, 0.06], [0.5, 0.52], [1, 0.95]] } } },
    { id: 'cold', name: 'Cold blue', g: { temp: -35, tint: 5, saturation: -15, contrast: 10, gain: { x: -0.3, y: -0.6, l: 0 } } },
    { id: 'bleach', name: 'Bleach bypass', g: { saturation: -55, contrast: 40, highlights: -15, sharpen: 20 } },
    { id: 'matte', name: 'Matte', g: { fade: 45, contrast: -10, saturation: -5, shadows: 15 } },
    { id: 'noir', name: 'Noir', g: { bw: 100, contrast: 45, blacks: -30, highlights: 15 } },
    { id: 'vivid', name: 'Vivid', g: { vibrance: 50, saturation: 10, contrast: 12, sharpen: 15 } },
    { id: 'golden', name: 'Golden hour', g: { temp: 40, tint: 8, exposure: 0.15, highlights: -10, gain: { x: 0.6, y: 0.4, l: 0.05 } } },
    { id: 'pastel', name: 'Pastel', g: { fade: 30, saturation: -20, exposure: 0.3, contrast: -20, hsl: [[0, -20, 10], [0, -10, 10], [0, 0, 10], [0, -30, 10], [0, 0, 10], [0, -10, 10], [0, 0, 10], [0, 0, 10]] } },
    { id: 'cyber', name: 'Neon night', g: { tint: 25, temp: -20, saturation: 30, contrast: 25, lift: { x: 0.2, y: -0.6, l: -0.05 }, gain: { x: -0.5, y: 0.3, l: 0 } } },
    { id: 'retro', name: '70s retro', g: { temp: 30, fade: 20, saturation: -15, hue: -6, curves: { m: [[0, 0.1], [0.3, 0.32], [0.7, 0.75], [1, 0.92]], b: [[0, 0.12], [1, 0.85]] } } },
    { id: 'forest', name: 'Forest green', g: { tint: -15, saturation: -10, hsl: [[0, 0, 0], [0, -20, 0], [-15, -15, 0], [0, 15, -10], [0, 0, 0], [0, -20, 0], [0, 0, 0], [0, 0, 0]], contrast: 10 } },
    { id: 'hdr', name: 'HDR pop', g: { highlights: -45, shadows: 45, whites: 15, blacks: -15, vibrance: 35, sharpen: 30, contrast: 10 } },
  ];
  G.applyLook = (g, look) => {
    const base = G.defaults(); const keep = { lut: g.lut, lutMix: g.lutMix };
    return Object.assign(base, C.deep(look.g), keep);
  };
})(window.C);
