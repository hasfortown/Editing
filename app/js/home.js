/* Cutroom — animated home screen */
(function (C) {
  const N = window.native;
  const Hm = (C.home = {});
  let el, raf = null, recents = [];

  const ASPECT_CARDS = [
    ['16:9', 'Landscape', 'YouTube · TV · desktop', 64, 36],
    ['9:16', 'Vertical', 'TikTok · Reels · Shorts', 27, 48],
    ['1:1', 'Square', 'Instagram · posts', 44, 44],
    ['4:5', 'Portrait', 'Instagram feed', 38, 48],
    ['21:9', 'Cinema', 'Widescreen film', 70, 30],
  ];

  Hm.init = async () => {
    el = C.h(`<div class="home" id="home">
      <canvas class="home-bg"></canvas>
      <div class="home-inner">
        <header class="home-top"><div class="home-brand"><img src="icons/logo.svg" alt=""><span>Cutroom</span></div><span class="home-ver" id="homeVer"></span></header>
        <div class="home-hero">
          <div class="home-logo"><img src="icons/logo.svg" alt=""></div>
          <h1 class="home-title">${'Cutroom'.split('').map((ch, i) => `<span style="animation-delay:${0.25 + i * 0.06}s">${ch}</span>`).join('')}</h1>
          <p class="home-tag">Edit anything. Animate everything. Create together.</p>
        </div>
        <div class="home-stats" style="animation-delay:.38s"><span>${C.icon('film')}Video</span><span>${C.icon('photo')}Photo</span><span>${C.icon('clapper')}Animation</span><span class="hs-dot"></span><span>${C.TRANSITIONS.length} transitions</span><span>${C.fx.DEFS.length} effects</span><span>Live collaboration</span></div>
        <div class="home-editors">
          <button class="editor-card video" data-ed="video" style="animation-delay:.45s"><canvas class="ec-art" data-art="video"></canvas><div class="ec-body"><div class="ec-ico">🎬</div><div><b>Video editor</b><small>Multi-track editing, 63 transitions, effects, motion tracking, masks, 3D & live collaboration</small></div></div><span class="ec-go" data-go="video">Open ${C.icon('nextFrame')}</span><i class="ec-glow"></i></button>
          <button class="editor-card photo" data-ed="photo" style="animation-delay:.52s"><canvas class="ec-art" data-art="photo"></canvas><div class="ec-body"><div class="ec-ico">🖼️</div><div><b>Photo editor</b><small>Layers, masks, pen tool, remove tool, smart selections, layer styles & filters</small></div></div><span class="ec-go" data-go="photo">Open ${C.icon('nextFrame')}</span><i class="ec-glow"></i></button>
          <button class="editor-card anim" data-ed="anim" style="animation-delay:.59s"><canvas class="ec-art" data-art="anim"></canvas><div class="ec-body"><div class="ec-ico">✏️</div><div><b>Animate</b><small>Frame-by-frame drawing with onion skin, tweened text, shapes & images, GIF export</small></div></div><span class="ec-go" data-go="anim">Open ${C.icon('nextFrame')}</span><i class="ec-glow"></i></button>
        </div>
        <div class="home-tip" id="homeTip"></div>
        <div class="home-grid">
          <section class="home-card home-new" style="animation-delay:.6s"><h3 id="homeNewTitle"></h3><div id="homeNew"></div></section>
          <section class="home-card home-side" style="animation-delay:.68s">
            <button class="home-continue" id="homeContinue"><div class="hc-thumb"><canvas width="320" height="180"></canvas></div><div class="hc-text"><small>Continue editing</small><b id="homeContName">Untitled project</b><span id="homeContMeta"></span></div>${C.icon('nextFrame')}</button>
            <div class="home-actions">
              <button class="home-act" id="homeOpen">${C.icon('folder')}<span><b id="homeOpenT">Open project</b><small id="homeOpenS">.cutroom or shared .cutroompack</small></span></button>
              <button class="home-act" id="homeStudio">${C.icon('wand')}<span><b>Effect Studio</b><small>Design & share effect presets</small></span></button>
            </div>
            <div class="home-join"><div class="hj-title">${C.icon('users')}<b>Collaborate</b><small>Got a code from a friend?</small></div>
              <div class="hj-row"><input class="text-input" id="homeCode" placeholder="Enter join code" maxlength="20" spellcheck="false"><button class="btn primary" id="homeJoin">Join</button></div></div>
          </section>
        </div>
        <section class="home-recent" style="animation-delay:.8s"><h3>${C.icon('layers')}Recent projects</h3><div class="recent-grid" id="homeRecent"></div></section>
      </div>
    </div>`);
    document.body.appendChild(el);
    C.fillIcons(el);
    N.info().then((i) => { el.querySelector('#homeVer').textContent = 'v' + i.version; });
    try { Hm.tab = localStorage.getItem('cutroom.homeTab') || 'video'; } catch (_) { Hm.tab = 'video'; }
    el.querySelectorAll('.editor-card').forEach((b) => (b.onclick = (e) => {
      if (e.target.closest('[data-go]')) { Hm.hide(); C.setMode(b.dataset.ed); if (b.dataset.ed === 'photo' && !C.photo.doc) setTimeout(() => C.photoPanels.newDialog(), 350); if (b.dataset.ed === 'anim' && !C.anim.doc) setTimeout(() => C.anim.newDialog(), 350); return; }
      Hm.tab = b.dataset.ed; try { localStorage.setItem('cutroom.homeTab', Hm.tab); } catch (_) {} renderNew();
    }));
    el.querySelector('#homeContinue').onclick = () => { Hm.hide(); C.setMode(Hm.tab); };
    el.querySelectorAll('.editor-card').forEach((card) => {
      card.addEventListener('pointermove', (e) => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; card.style.setProperty('--mx', x * 100 + '%'); card.style.setProperty('--my', y * 100 + '%'); card.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg'); card.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg'); });
      card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
    addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now(); });
    startTips();
    el.querySelector('#homeOpen').onclick = async () => {
      if (Hm.tab === 'photo') { Hm.hide(); C.setMode('photo'); C.photoPanels.openImage(); return; }
      if (Hm.tab === 'anim') { const p = await N.fileOpenDialog({ title: 'Open animation', exts: ['cutanim'], extName: 'Cutroom animation' }); if (p) { Hm.hide(); C.anim.open(p); } return; }
      const p = await N.shareOpenDialog(); if (p) { Hm.hide(); C.setMode('video'); C.app.openProjectPath(p); }
    };
    el.querySelector('#homeStudio').onclick = () => { Hm.hide(); C.presets.studio(); };
    const code = el.querySelector('#homeCode');
    code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') join(); });
    el.querySelector('#homeJoin').onclick = () => join();
    async function join() { const v = code.value.trim(); if (!v) { code.focus(); return; } if (await C.collabUI.joinWithCode(v)) Hm.hide(); }
    C.$('.brand').style.cursor = 'pointer';
    C.$('.brand').addEventListener('click', () => Hm.show());
    C.$('.brand').dataset.tip = 'Home';
  };

  const PHOTO_SIZES = [['YouTube thumbnail', 1280, 720, '16:9'], ['Instagram post', 1080, 1080, '1:1'], ['Story / TikTok', 1080, 1920, '9:16'], ['Full HD', 1920, 1080, '16:9'], ['4K wallpaper', 3840, 2160, '16:9'], ['A4 print', 2480, 3508, 'A4']];
  function renderNew() {
    el.querySelectorAll('.editor-card').forEach((b) => b.classList.toggle('on', b.dataset.ed === Hm.tab));
    const box = el.querySelector('#homeNew'), title = el.querySelector('#homeNewTitle');
    if (Hm.tab === 'anim') {
      title.innerHTML = `${C.icon('plus')}New animation`;
      const AP = [['Full HD', 1920, 1080, 12], ['Vertical', 1080, 1920, 12], ['Square', 1080, 1080, 12], ['GIF sticker', 512, 512, 12], ['Film 24 fps', 1920, 1080, 24]];
      box.innerHTML = `<div class="aspect-cards">${AP.map(([n, w, h, f], i) => { const k = 48 / Math.max(w, h); return `<button class="aspect-card" data-i="${i}"><div class="ar-box"><span style="width:${w * k}px;height:${h * k}px"></span></div><b>${n}</b><small>${w}×${h} · ${f} fps</small></button>`; }).join('')}</div><button class="btn home-demo">${C.icon('sparkles')}<span>Try the bouncing-ball demo</span></button>`;
      box.querySelectorAll('.aspect-card').forEach((b) => (b.onclick = async () => { const [n, w, h, f] = AP[+b.dataset.i]; if (!(await C.anim.confirmDiscard())) return; Hm.hide(); C.setMode('anim'); setTimeout(() => C.anim.newDoc(w, h, f, 'Animation', '#ffffff'), 60); }));
      box.querySelector('.home-demo').onclick = async () => { if (!(await C.anim.confirmDiscard())) return; Hm.hide(); setTimeout(() => C.anim.demo(), 60); };
      el.querySelector('#homeOpenT').textContent = 'Open animation'; el.querySelector('#homeOpenS').textContent = 'A .cutanim project';
    } else if (Hm.tab === 'photo') {
      title.innerHTML = `${C.icon('plus')}New image`;
      box.innerHTML = `<div class="aspect-cards">${PHOTO_SIZES.map(([n, w, h, a], i) => { const k = 48 / Math.max(w, h); return `<button class="aspect-card" data-i="${i}"><div class="ar-box"><span style="width:${Math.round(w * k)}px;height:${Math.round(h * k)}px"></span></div><b>${n}</b><small>${w}×${h}</small></button>`; }).join('')}<button class="aspect-card" data-i="custom"><div class="ar-box"><span style="width:40px;height:40px;border-style:dashed"></span></div><b>Custom</b><small>Any size</small></button></div>`;
      box.querySelectorAll('.aspect-card').forEach((b) => (b.onclick = async () => {
        Hm.hide(); C.setMode('photo');
        if (b.dataset.i === 'custom') return setTimeout(() => C.photoPanels.newDialog(), 350);
        const [n, w, h] = PHOTO_SIZES[+b.dataset.i];
        setTimeout(async () => { if (!(await C.photoPanels.confirmDiscard())) return; C.photo.newDoc(w, h, '#ffffff', n); C.photoUI.fit(); C.photoPanels.renderAll(); }, 350);
      }));
      el.querySelector('#homeOpenT').textContent = 'Open image'; el.querySelector('#homeOpenS').textContent = 'PNG, JPG, WebP… or a .cutphoto project';
    } else {
      title.innerHTML = `${C.icon('plus')}New video project`;
      box.innerHTML = `<div class="aspect-cards">${ASPECT_CARDS.map(([a, n, d, w, h]) => `<button class="aspect-card" data-a="${a}"><div class="ar-box"><span style="width:${w}px;height:${h}px"></span></div><b>${n}</b><small>${a} · ${d}</small></button>`).join('')}</div>`;
      box.querySelectorAll('.aspect-card').forEach((b) => (b.onclick = async () => { C.setMode('video'); if (await C.app.newProject(b.dataset.a)) Hm.hide(); }));
      el.querySelector('#homeOpenT').textContent = 'Open project'; el.querySelector('#homeOpenS').textContent = '.cutroom or shared .cutroompack';
    }
    renderContinue();
  }
  Hm.renderNew = () => renderNew();
  function renderContinue() {
    const cont = el.querySelector('#homeContinue'); const cv = cont.querySelector('canvas'); const x = cv.getContext('2d');
    const draw = (s) => { x.fillStyle = '#000'; x.fillRect(0, 0, 320, 180); const k = Math.min(320 / s.width, 180 / s.height); x.drawImage(s, (320 - s.width * k) / 2, (180 - s.height * k) / 2, s.width * k, s.height * k); };
    if (Hm.tab === 'anim') {
      const d = C.anim && C.anim.doc; cont.style.display = d ? '' : 'none'; if (!d) return;
      el.querySelector('#homeContName').textContent = d.name;
      el.querySelector('#homeContMeta').textContent = `${d.w}×${d.h} · ${d.length} frames · ${d.fps} fps`;
      const c = document.createElement('canvas'); c.width = d.w; c.height = d.h; C.anim.renderFrame(c.getContext('2d'), d.cur); draw(c);
    } else if (Hm.tab === 'photo') {
      const has = !!C.photo.doc; cont.style.display = has ? '' : 'none'; if (!has) return;
      el.querySelector('#homeContName').textContent = C.photo.doc.name;
      el.querySelector('#homeContMeta').textContent = `${C.photo.doc.w}×${C.photo.doc.h} · ${C.photo.doc.layers.length} layer${C.photo.doc.layers.length === 1 ? '' : 's'}`;
      draw(C.photo.flattened());
    } else {
      const has = C.allClips().length > 0; cont.style.display = has ? '' : 'none'; if (!has) return;
      el.querySelector('#homeContName').textContent = C.project.name;
      el.querySelector('#homeContMeta').textContent = `${C.allClips().length} clips · ${C.fmtDur(C.duration())}${C.UI.dirty && !C.UI.filePath ? ' · autosaved' : ''}`;
      draw(C.engine.canvas);
    }
  }

  Hm.addRecent = async (path, name, kind = 'video', srcCanvas = null) => {
    if (!path) return;
    let thumb = '';
    try { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 320, 180); const s = srcCanvas || C.engine.canvas; const k = Math.min(320 / s.width, 180 / s.height); x.drawImage(s, (320 - s.width * k) / 2, (180 - s.height * k) / 2, s.width * k, s.height * k); thumb = c.toDataURL('image/jpeg', 0.7); } catch (_) {}
    recents = (await N.recentsLoad()).filter((r) => r.path !== path);
    recents.unshift({ path, kind, name: name || C.baseName(path).replace(/\.(cutroom|cutphoto|cutanim)$/i, ''), time: Date.now(), thumb, duration: kind === 'video' ? C.duration() : 0 });
    await N.recentsSave(recents);
  };

  async function renderRecents() {
    recents = await N.recentsLoad();
    const g = el.querySelector('#homeRecent');
    g.innerHTML = '';
    if (!recents.length) { g.innerHTML = '<div class="hint" style="grid-column:1/-1">Projects you save or open will appear here.</div>'; return; }
    for (const r of recents.slice(0, 12)) {
      const exists = await N.exists(r.path);
      const isPhoto = r.kind === 'photo' || /\.cutphoto$/i.test(r.path); const isAnim = r.kind === 'anim' || /\.cutanim$/i.test(r.path);
      const card = C.h(`<button class="recent-card ${exists ? '' : 'missing'}" title="${C.esc(r.path)}"><span class="rc-badge">${isAnim ? '✏️ ANIM' : isPhoto ? '🖼️ PHOTO' : '🎬 VIDEO'}</span><div class="rc-thumb">${r.thumb ? `<img src="${r.thumb}" alt="">` : C.icon('film')}</div><b>${C.esc(r.name)}</b><small>${exists ? ago(r.time) + (r.duration ? ' · ' + C.fmtDur(r.duration) : '') : 'File moved or deleted'}</small><span class="rc-x" data-tip="Remove from list">${C.icon('x')}</span></button>`);
      card.onclick = async (e) => {
        if (e.target.closest('.rc-x')) { e.stopPropagation(); recents = recents.filter((x) => x.path !== r.path); await N.recentsSave(recents); renderRecents(); return; }
        if (!exists) { C.toast('That project file was moved or deleted', 'err'); return; }
        Hm.hide();
        if (isAnim) { C.anim.open(r.path); } else if (isPhoto) { C.setMode('photo'); C.photoPanels.openProjectPath(r.path); } else { C.setMode('video'); C.app.openProjectPath(r.path); }
      };
      g.appendChild(card);
    }
  }
  const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d + ' days ago'; };

  Hm.show = () => {
    C.engine.pause();
    renderNew();
    renderRecents();
    el.classList.remove('hide'); el.classList.add('show');
    el.querySelectorAll('.home-card, .home-recent, .editor-card, .home-title span, .home-logo, .home-tag, .home-stats').forEach((n) => { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; });
    startBg();
  };
  Hm.hide = () => {
    if (!el.classList.contains('show')) return;
    el.classList.add('hide'); el.classList.remove('show');
    setTimeout(() => { cancelAnimationFrame(raf); raf = null; C.engine.layout(); C.tl.render(); }, 450);
  };
  Hm.visible = () => el && el.classList.contains('show');

  // ---------- tips ----------
  const TIPS = [
    'Hover any effect to try it on your clip before applying it',
    'Right-click a clip → Track motion… to make text follow anything',
    'Turn on Motion blur in the Video tab for buttery-smooth moves',
    'Save titles, stickers and clips to Assets and reuse them in every project',
    'Detect beats in your music, then cut clips on the beat in one click',
    'In Animate, press . to step forward and see the last frame in onion skin',
    'Paint over unwanted objects with the photo Remove tool (J)',
    'Press Ctrl+K anywhere for the command palette',
  ];
  function startTips() { const box = el.querySelector('#homeTip'); let i = Math.floor(Math.random() * TIPS.length); const show = () => { box.classList.remove('in'); setTimeout(() => { box.innerHTML = `${C.icon('sparkles')}<span>${TIPS[i++ % TIPS.length]}</span>`; box.classList.add('in'); }, 260); }; show(); setInterval(() => { if (Hm.visible()) show(); }, 5200); }

  // ---------- animated background + card previews ----------
  const mouse = { x: -999, y: -999, t: 0 };
  function startBg() {
    const cv = el.querySelector('.home-bg'); const cx = cv.getContext('2d');
    const blobs = [['#19d3c5', 0.2, 0.3], ['#6d5cff', 0.75, 0.25], ['#ff3d9a', 0.6, 0.8], ['#1aa5ff', 0.15, 0.85]];
    const pts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.00025, vy: (Math.random() - 0.5) * 0.00025, r: 0.6 + Math.random() * 1.6 }));
    const arts = [...el.querySelectorAll('.ec-art')].map((c) => ({ c, x: c.getContext('2d'), kind: c.dataset.art }));
    const t0 = performance.now();
    cancelAnimationFrame(raf);
    const loop = () => {
      const dpr = Math.min(1.5, devicePixelRatio || 1);
      const W = innerWidth, H = innerHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (performance.now() - t0) / 1000;
      cx.globalCompositeOperation = 'source-over'; cx.fillStyle = '#06070a'; cx.fillRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      blobs.forEach(([col, bx, by], i) => {
        const x = (bx + Math.sin(t * 0.13 + i * 1.7) * 0.18) * W, y = (by + Math.cos(t * 0.11 + i * 2.3) * 0.16) * H, r = Math.max(W, H) * (0.42 + Math.sin(t * 0.2 + i) * 0.06);
        const g = cx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col + '40'); g.addColorStop(1, col + '00'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      });
      // aurora ribbons
      for (let k = 0; k < 3; k++) {
        cx.beginPath(); const base = H * (0.18 + k * 0.09);
        for (let x = 0; x <= W; x += 24) { const y = base + Math.sin(x * 0.004 + t * (0.35 + k * 0.1) + k) * 40 + Math.sin(x * 0.011 - t * 0.5) * 14; x ? cx.lineTo(x, y) : cx.moveTo(x, y); }
        cx.lineTo(W, 0); cx.lineTo(0, 0); cx.closePath();
        const g = cx.createLinearGradient(0, 0, 0, base + 60); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, ['rgba(25,211,197,.07)', 'rgba(124,92,255,.07)', 'rgba(255,61,154,.05)'][k]); cx.fillStyle = g; cx.fill();
      }
      cx.globalCompositeOperation = 'source-over';
      // interactive constellation
      const near = performance.now() - mouse.t < 4000;
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1;
        if (near) { const dx = p.x * W - mouse.x, dy = p.y * H - mouse.y, d = Math.hypot(dx, dy); if (d < 140 && d > 0) { p.x += (dx / d) * 0.0009; p.y += (dy / d) * 0.0009; } }
      }
      cx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j]; const d = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H); if (d < 130) { cx.strokeStyle = `rgba(140,220,255,${(1 - d / 130) * 0.16})`; cx.beginPath(); cx.moveTo(a.x * W, a.y * H); cx.lineTo(b.x * W, b.y * H); cx.stroke(); } }
      if (near) for (const p of pts) { const d = Math.hypot(p.x * W - mouse.x, p.y * H - mouse.y); if (d < 180) { cx.strokeStyle = `rgba(25,211,197,${(1 - d / 180) * 0.35})`; cx.beginPath(); cx.moveTo(p.x * W, p.y * H); cx.lineTo(mouse.x, mouse.y); cx.stroke(); } }
      for (const p of pts) { cx.fillStyle = 'rgba(220,240,255,.7)'; cx.beginPath(); cx.arc(p.x * W, p.y * H, p.r, 0, 6.283); cx.fill(); }
      for (const a of arts) drawArt(a, t);
      raf = requestAnimationFrame(loop);
    };
    loop();
  }
  function drawArt(a, t) {
    const c = a.c, r = c.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height)); if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const x = a.x; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    if (a.kind === 'video') {
      const ph = (t * 0.18) % 1;
      const g = x.createLinearGradient(0, 0, w, h * 0.55); g.addColorStop(0, `hsl(${(t * 30) % 360},70%,45%)`); g.addColorStop(1, `hsl(${(t * 30 + 120) % 360},70%,35%)`);
      x.fillStyle = g; x.beginPath(); x.roundRect(w * 0.18, 8, w * 0.64, h * 0.42, 6); x.fill();
      x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.moveTo(w * 0.47, 8 + h * 0.13); x.lineTo(w * 0.47, 8 + h * 0.29); x.lineTo(w * 0.55, 8 + h * 0.21); x.fill();
      const rows = [[['#3a7bd5', 0, 0.38], ['#7c5cff', 0.4, 0.75], ['#3a7bd5', 0.77, 1.2]], [['#ff9a3d', 0.1, 0.5], ['#19d3c5', 0.55, 0.95]], [['#2bb673', 0, 1]]];
      rows.forEach((row, i) => row.forEach(([col, a0, a1]) => { const off = -((t * 0.05) % 0.4); x.fillStyle = col; x.globalAlpha = 0.85; x.beginPath(); x.roundRect(8 + (a0 + off) * (w - 16), h * 0.58 + i * 15, (a1 - a0) * (w - 16) - 3, 11, 3); x.fill(); }));
      x.globalAlpha = 1; x.fillStyle = '#ff3d5a'; x.fillRect(8 + ph * (w - 16), h * 0.55, 2, h * 0.42);
    } else if (a.kind === 'photo') {
      for (let i = 0; i < 3; i++) { const k = 2 - i; x.save(); x.translate(w / 2 + k * 14 - 14, h * 0.48 - k * 10 + 6); x.rotate(-0.06 + k * 0.05); x.fillStyle = ['#ff4f9a', '#ffb547', '#1aa5ff'][i]; x.globalAlpha = 0.25 + i * 0.3; x.beginPath(); x.roundRect(-w * 0.3, -h * 0.3, w * 0.6, h * 0.6, 8); x.fill(); x.restore(); }
      x.globalAlpha = 1; x.strokeStyle = '#fff'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); const n = Math.floor(((t * 0.4) % 1.3) * 60); for (let i = 0; i <= Math.min(60, n); i++) { const px = w * 0.28 + (i / 60) * w * 0.44, py = h * 0.5 + Math.sin(i * 0.25 + 1) * h * 0.12; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
      x.setLineDash([5, 4]); x.lineDashOffset = -t * 20; x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.2; x.strokeRect(w * 0.25, h * 0.2, w * 0.5, h * 0.6); x.setLineDash([]);
    } else {
      const ph = (t * 0.9) % 1; const bx = (q) => w * 0.15 + ((q % 1) * w * 0.7); const by = (q) => h * 0.72 - Math.abs(Math.sin(q * Math.PI * 2)) * h * 0.5;
      for (let k = 4; k >= 1; k--) { const q = ph - k * 0.04; if (q < 0) continue; x.globalAlpha = 0.12 * (5 - k); x.fillStyle = k % 2 ? '#ff3b5c' : '#19c37d'; x.beginPath(); x.arc(bx(q), by(q), 12, 0, 6.283); x.fill(); }
      x.globalAlpha = 1; const sq = by(ph) > h * 0.68 ? 0.75 : 1; x.fillStyle = '#ffd84d'; x.beginPath(); x.ellipse(bx(ph), by(ph) + (1 - sq) * 6, 13 / sq, 13 * sq, 0, 0, 6.283); x.fill();
      x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(w * 0.1, h * 0.72 + 13, w * 0.8, 2);
      for (let i = 0; i < 12; i++) { x.fillStyle = i === Math.floor(ph * 12) ? '#19d3c5' : 'rgba(255,255,255,.18)'; x.fillRect(w * 0.1 + i * (w * 0.8 / 12), h * 0.88, w * 0.8 / 12 - 3, 8); }
    }
  }
})(window.C);
