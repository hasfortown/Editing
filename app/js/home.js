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
        <div class="home-grid">
          <section class="home-card home-new" style="animation-delay:.55s">
            <h3>${C.icon('plus')}New project</h3>
            <div class="aspect-cards">${ASPECT_CARDS.map(([a, n, d, w, h]) => `<button class="aspect-card" data-a="${a}"><div class="ar-box"><span style="width:${w}px;height:${h}px"></span></div><b>${n}</b><small>${a} · ${d}</small></button>`).join('')}</div>
          </section>
          <section class="home-card home-side" style="animation-delay:.68s">
            <button class="home-continue" id="homeContinue"><div class="hc-thumb"><canvas width="320" height="180"></canvas></div><div class="hc-text"><small>Continue editing</small><b id="homeContName">Untitled project</b><span id="homeContMeta"></span></div>${C.icon('nextFrame')}</button>
            <div class="home-actions">
              <button class="home-act" id="homeOpen">${C.icon('folder')}<span><b>Open project</b><small>.cutroom or shared .cutroompack</small></span></button>
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
    el.querySelectorAll('.aspect-card').forEach((b) => (b.onclick = async () => { if (await C.app.newProject(b.dataset.a)) Hm.hide(); }));
    el.querySelector('#homeContinue').onclick = () => Hm.hide();
    el.querySelector('#homeOpen').onclick = async () => { const p = await N.shareOpenDialog(); if (p) { Hm.hide(); C.app.openProjectPath(p); } };
    el.querySelector('#homeStudio').onclick = () => { Hm.hide(); C.presets.studio(); };
    const code = el.querySelector('#homeCode');
    code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') join(); });
    el.querySelector('#homeJoin').onclick = () => join();
    async function join() { const v = code.value.trim(); if (!v) { code.focus(); return; } if (await C.collabUI.joinWithCode(v)) Hm.hide(); }
    C.$('.brand').style.cursor = 'pointer';
    C.$('.brand').addEventListener('click', () => Hm.show());
    C.$('.brand').dataset.tip = 'Home';
  };

  Hm.addRecent = async (path, name) => {
    if (!path) return;
    let thumb = '';
    try { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 320, 180); const s = C.engine.canvas; const k = Math.min(320 / s.width, 180 / s.height); x.drawImage(s, (320 - s.width * k) / 2, (180 - s.height * k) / 2, s.width * k, s.height * k); thumb = c.toDataURL('image/jpeg', 0.7); } catch (_) {}
    recents = (await N.recentsLoad()).filter((r) => r.path !== path);
    recents.unshift({ path, name: name || C.baseName(path).replace(/\.cutroom$/i, ''), time: Date.now(), thumb, duration: C.duration() });
    await N.recentsSave(recents);
  };

  async function renderRecents() {
    recents = await N.recentsLoad();
    const g = el.querySelector('#homeRecent');
    g.innerHTML = '';
    if (!recents.length) { g.innerHTML = '<div class="hint" style="grid-column:1/-1">Projects you save or open will appear here.</div>'; return; }
    for (const r of recents.slice(0, 12)) {
      const exists = await N.exists(r.path);
      const card = C.h(`<button class="recent-card ${exists ? '' : 'missing'}" title="${C.esc(r.path)}"><div class="rc-thumb">${r.thumb ? `<img src="${r.thumb}" alt="">` : C.icon('film')}</div><b>${C.esc(r.name)}</b><small>${exists ? ago(r.time) + (r.duration ? ' · ' + C.fmtDur(r.duration) : '') : 'File moved or deleted'}</small><span class="rc-x" data-tip="Remove from list">${C.icon('x')}</span></button>`);
      card.onclick = async (e) => {
        if (e.target.closest('.rc-x')) { e.stopPropagation(); recents = recents.filter((x) => x.path !== r.path); await N.recentsSave(recents); renderRecents(); return; }
        if (!exists) { C.toast('That project file was moved or deleted', 'err'); return; }
        Hm.hide(); C.app.openProjectPath(r.path);
      };
      g.appendChild(card);
    }
  }
  const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d + ' days ago'; };

  Hm.show = () => {
    C.engine.pause();
    const hasWork = C.allClips().length > 0;
    const cont = el.querySelector('#homeContinue');
    cont.style.display = hasWork ? '' : 'none';
    if (hasWork) {
      el.querySelector('#homeContName').textContent = C.project.name;
      el.querySelector('#homeContMeta').textContent = `${C.allClips().length} clips · ${C.fmtDur(C.duration())}${C.UI.dirty && !C.UI.filePath ? ' · autosaved' : ''}`;
      const cv = cont.querySelector('canvas'); const x = cv.getContext('2d'); const s = C.engine.canvas; x.fillStyle = '#000'; x.fillRect(0, 0, 320, 180);
      const k = Math.min(320 / s.width, 180 / s.height); x.drawImage(s, (320 - s.width * k) / 2, (180 - s.height * k) / 2, s.width * k, s.height * k);
    }
    renderRecents();
    el.classList.remove('hide'); el.classList.add('show');
    el.querySelectorAll('.home-card, .home-recent, .home-title span, .home-logo, .home-tag').forEach((n) => { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; });
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
