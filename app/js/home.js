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
        <div class="home-editors">
          <button class="editor-card video" data-ed="video" style="animation-delay:.45s"><div class="ec-ico">🎬</div><div><b>Video editor</b><small>Multi-track editing, effects, keyframes, color grading, text, audio & live collaboration</small></div><span class="ec-go" data-go="video">Open ${C.icon('nextFrame')}</span></button>
          <button class="editor-card photo" data-ed="photo" style="animation-delay:.52s"><div class="ec-ico">🖼️</div><div><b>Photo editor</b><small>Layers, masks, brushes, selections, layer styles, adjustments & filters</small></div><span class="ec-go" data-go="photo">Open ${C.icon('nextFrame')}</span></button>
        </div>
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
      if (e.target.closest('[data-go]')) { Hm.hide(); C.setMode(b.dataset.ed); if (b.dataset.ed === 'photo' && !C.photo.doc) setTimeout(() => C.photoPanels.newDialog(), 350); return; }
      Hm.tab = b.dataset.ed; try { localStorage.setItem('cutroom.homeTab', Hm.tab); } catch (_) {} renderNew();
    }));
    el.querySelector('#homeContinue').onclick = () => { Hm.hide(); C.setMode(Hm.tab); };
    el.querySelector('#homeOpen').onclick = async () => {
      if (Hm.tab === 'photo') { Hm.hide(); C.setMode('photo'); C.photoPanels.openImage(); return; }
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
    if (Hm.tab === 'photo') {
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
    if (Hm.tab === 'photo') {
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
    recents.unshift({ path, kind, name: name || C.baseName(path).replace(/\.(cutroom|cutphoto)$/i, ''), time: Date.now(), thumb, duration: kind === 'video' ? C.duration() : 0 });
    await N.recentsSave(recents);
  };

  async function renderRecents() {
    recents = await N.recentsLoad();
    const g = el.querySelector('#homeRecent');
    g.innerHTML = '';
    if (!recents.length) { g.innerHTML = '<div class="hint" style="grid-column:1/-1">Projects you save or open will appear here.</div>'; return; }
    for (const r of recents.slice(0, 12)) {
      const exists = await N.exists(r.path);
      const isPhoto = r.kind === 'photo' || /\.cutphoto$/i.test(r.path);
      const card = C.h(`<button class="recent-card ${exists ? '' : 'missing'}" title="${C.esc(r.path)}"><span class="rc-badge">${isPhoto ? '🖼️ PHOTO' : '🎬 VIDEO'}</span><div class="rc-thumb">${r.thumb ? `<img src="${r.thumb}" alt="">` : C.icon('film')}</div><b>${C.esc(r.name)}</b><small>${exists ? ago(r.time) + (r.duration ? ' · ' + C.fmtDur(r.duration) : '') : 'File moved or deleted'}</small><span class="rc-x" data-tip="Remove from list">${C.icon('x')}</span></button>`);
      card.onclick = async (e) => {
        if (e.target.closest('.rc-x')) { e.stopPropagation(); recents = recents.filter((x) => x.path !== r.path); await N.recentsSave(recents); renderRecents(); return; }
        if (!exists) { C.toast('That project file was moved or deleted', 'err'); return; }
        Hm.hide();
        if (isPhoto) { C.setMode('photo'); C.photoPanels.openProjectPath(r.path); } else { C.setMode('video'); C.app.openProjectPath(r.path); }
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
    el.querySelectorAll('.home-card, .home-recent, .editor-card, .home-title span, .home-logo, .home-tag').forEach((n) => { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; });
    startBg();
  };
  Hm.hide = () => {
    if (!el.classList.contains('show')) return;
    el.classList.add('hide'); el.classList.remove('show');
    setTimeout(() => { cancelAnimationFrame(raf); raf = null; C.engine.layout(); C.tl.render(); }, 450);
  };
  Hm.visible = () => el && el.classList.contains('show');

  // ---------- animated background ----------
  function startBg() {
    const cv = el.querySelector('.home-bg'); const cx = cv.getContext('2d');
    const blobs = [['#19d3c5', 0.2, 0.3], ['#6d5cff', 0.75, 0.25], ['#ff3d9a', 0.6, 0.8], ['#1aa5ff', 0.15, 0.85]];
    const frames = Array.from({ length: 14 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), r: Math.random() * 6.28, v: 0.15 + Math.random() * 0.35, i }));
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6.28, s: Math.random() }));
    const t0 = performance.now();
    cancelAnimationFrame(raf);
    const loop = () => {
      const dpr = Math.min(1.5, devicePixelRatio || 1);
      const W = innerWidth, H = innerHeight;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (performance.now() - t0) / 1000;
      cx.globalCompositeOperation = 'source-over'; cx.fillStyle = '#07080b'; cx.fillRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      blobs.forEach(([col, bx, by], i) => {
        const x = (bx + Math.sin(t * 0.13 + i * 1.7) * 0.18) * W, y = (by + Math.cos(t * 0.11 + i * 2.3) * 0.16) * H, r = Math.max(W, H) * (0.42 + Math.sin(t * 0.2 + i) * 0.06);
        const g = cx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col + '38'); g.addColorStop(1, col + '00');
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      });
      // perspective grid floor
      cx.globalCompositeOperation = 'source-over';
      const hy = H * 0.72; cx.strokeStyle = 'rgba(25,211,197,0.10)'; cx.lineWidth = 1;
      for (let i = -14; i <= 14; i++) { cx.beginPath(); cx.moveTo(W / 2 + i * 18, hy); cx.lineTo(W / 2 + i * W * 0.16, H); cx.stroke(); }
      for (let j = 0; j < 12; j++) { const k = ((j + (t * 0.35) % 1) / 12); const y = hy + (H - hy) * k * k; cx.globalAlpha = k; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
      cx.globalAlpha = 1;
      // floating film frames
      for (const f of frames) {
        const y = ((f.y - t * f.v * 0.04) % 1.2 + 1.2) % 1.2 - 0.1, x = f.x + Math.sin(t * 0.3 + f.i) * 0.02;
        cx.save(); cx.translate(x * W, y * H); cx.rotate(f.r + t * 0.05 * (f.i % 2 ? 1 : -1)); const w = 60 * f.s, h = 34 * f.s;
        cx.globalAlpha = 0.18; cx.strokeStyle = '#ffffff'; cx.lineWidth = 1.2; cx.strokeRect(-w / 2, -h / 2, w, h);
        for (let k = -2; k <= 2; k++) { cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(k * w * 0.2 - 2, -h / 2 - 6, 4, 3); cx.fillRect(k * w * 0.2 - 2, h / 2 + 3, 4, 3); }
        cx.restore();
      }
      for (const s of stars) { cx.globalAlpha = 0.25 + 0.5 * Math.max(0, Math.sin(t * (0.8 + s.s) + s.p)); cx.fillStyle = '#fff'; cx.fillRect(s.x * W, s.y * H * 0.7, 1.4, 1.4); }
      cx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    loop();
  }
})(window.C);
