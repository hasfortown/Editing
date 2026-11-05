/* Cutroom — live collaboration (renderer side) + share packages */
(function (C) {
  const N = window.native;
  const K = (C.collab = { mode: 'off' });
  let myColor = null;
  let myId = null, seq = 0, lastSynced = null, pendingOwn = new Map(), peers = new Map(), sent = new Set(), info = null;
  C.localImports = new Set();

  const keysOf = (d) => {
    const ks = [];
    for (const k of ['clips', 'tracks', 'media', 'markers']) if (d[k]) for (const id in d[k]) ks.push(k + ':' + id);
    if (d.trackOrder) ks.push('trackOrder'); if (d.settings) ks.push('settings'); if (d.name !== undefined) ks.push('name'); if (d.range !== undefined) ks.push('range');
    return ks;
  };
  const filterDiff = (d, keep) => {
    const out = {}; let any = false;
    for (const k of ['clips', 'tracks', 'media', 'markers']) if (d[k]) for (const id in d[k]) if (keep(k + ':' + id)) { (out[k] = out[k] || {})[id] = d[k][id]; any = true; }
    for (const k of ['trackOrder', 'settings', 'name', 'range']) if (d[k] !== undefined && keep(k)) { out[k] = d[k]; any = true; }
    return any ? out : null;
  };

  // one place to send / receive — LAN guests & the host go through the main process, internet guests over WebRTC
  const handlers = [];
  K.onMessage = (fn) => handlers.push(fn);
  K.dispatch = (m) => { for (const h of handlers) { try { h(m); } catch (e) { console.warn(e); } } };
  N.onCollab('message', (m) => K.dispatch(m));
  K.send = (m) => (K.net && K.net.isGuest() ? K.net.send(m) : N.collabSend(m));
  K.status = () => ({ mode: K.mode, peers: peers.size, info });
  K.myId = () => myId;
  K.peers = () => [...peers.values()];
  K.canFetch = () => K.mode === 'guest';
  K.fetchMedia = async (m, onProgress) => {
    const handler = (id, v) => { if (id === m.id) onProgress(v); };
    progressHandlers.add(handler);
    try { if (K.net && K.net.isGuest()) return await K.net.fetchMedia(m, onProgress); const r = await N.collabFetchMedia({ id: m.id, ext: m.ext || C.extOf(m.path) }); return r.ok ? r.path : null; }
    finally { progressHandlers.delete(handler); }
  };
  const progressHandlers = new Set();
  N.onCollab('fetchProgress', (id, v) => progressHandlers.forEach((h) => h(id, v)));

  function startSync() {
    lastSynced = C.deep(C.project); seq = 0; pendingOwn.clear(); sent.clear();
  }

  const flush = C.throttle(() => {
    if (K.mode === 'off' || !lastSynced) return;
    const d = C.diff(lastSynced, C.project);
    if (!d) return;
    seq++;
    for (const k of keysOf(d)) pendingOwn.set(k, seq);
    C.applyDiff(lastSynced, d);
    K.send({ t: 'op', seq, diff: d });
    if (d.media) for (const id in d.media) if (d.media[id]) shareMedia(id);
  }, 60);

  function shareMedia(id) {
    if (sent.has(id)) return;
    const m = C.project.media[id]; if (!m) return;
    const p = C.mediaPath(m);
    if (K.mode === 'host') { sent.add(id); N.collabRegisterMedia(id, p); }
    else if (K.mode === 'guest' && C.localImports.has(id)) {
      sent.add(id);
      (K.net && K.net.isGuest() ? K.net.upload(id, p, m.ext || C.extOf(p)) : N.collabUpload({ id, filePath: p, ext: m.ext || C.extOf(p) })).then((ok) => { if (!ok) { sent.delete(id); C.toast(`Could not send ${m.name} to the session`, 'err'); } });
    }
  }

  C.on('change', (i) => { if (K.mode !== 'off' && i.source !== 'remote') flush(); });
  const presence = C.throttle(() => { if (K.mode !== 'off') K.send({ t: 'presence', playhead: C.UI.playhead, selection: [...C.selection], mode: C.mode || 'video' }); }, 150);
  C.on('time', presence); C.on('select', presence); C.on('modeChanged', presence); C.on('collab', () => setTimeout(presence, 300));
  K.where = (m) => ({ photo: '🖼️ Photo editor', anim: '✏️ Animate', video: '🎬 Video editor' })[m || 'video'];

  K.onMessage((m) => {
    if (m.t === 'op') {
      let d = m.diff;
      if (m.from === myId) {
        d = filterDiff(d, (k) => { const s = pendingOwn.get(k); if (s === m.seq) pendingOwn.delete(k); return !(s > m.seq); });
      } else {
        d = filterDiff(d, (k) => !pendingOwn.has(k));
      }
      if (!d) return;
      const newMedia = d.media ? Object.keys(d.media).filter((id) => d.media[id] && !C.project.media[id]) : [];
      C.applyDiff(lastSynced, d);
      C.applyRemote(d);
      for (const id of newMedia) C.prepareMedia(C.project.media[id]);
      if (d.media) C.emit('media');
    } else if (m.t === 'presence') {
      peers.set(m.from, Object.assign(peers.get(m.from) || {}, { id: m.from, name: m.name, color: m.color, playhead: m.playhead, selection: m.selection, mode: m.mode }));
      C.emit('peers');
    } else if (m.t === 'join') {
      peers.set(m.id, { id: m.id, name: m.name, color: m.color });
      C.toast(`${m.name} joined the session`, 'info'); C.emit('peers'); C.emit('collab');
    } else if (m.t === 'left') {
      peers.delete(m.id); C.toast(`${m.name} left the session`, 'info'); C.emit('peers'); C.emit('collab');
    } else if (m.t === 'media') {
      // a guest's upload finished — retry anything still missing
      const mm = C.project.media[m.id]; const r = C.MR[m.id];
      if (mm && r && (r.status === 'missing' || r.status === 'error')) C.prepareMedia(mm);
    } else if (m.t === 'end') {
      if (K.mode === 'guest') { C.toast('The host ended the session. You still have a copy — save it to keep it.', 'info', 6000); }
      K.mode = 'off'; peers.clear(); myId = null; C.emit('peers'); C.emit('collab');
    }
  });
  N.onCollab('stateRequest', (reqId) => N.collabProvideState(reqId, C.serialize()));
  N.onCollab('mediaArrived', (id, p) => {
    const r = C.mr(id); r.localPath = p;
    const m = C.project.media[id]; if (m) C.prepareMedia(m);
  });

  K.host = async (name) => {
    const r = await N.collabHost({ name, sessionName: C.project.name });
    if (!r.ok) { C.toast(r.error || 'Could not start session', 'err'); return false; }
    K.mode = 'host'; myId = 'host'; myColor = '#ff6b9a'; info = r; peers.clear();
    startSync();
    for (const id in C.project.media) shareMedia(id);
    C.emit('collab'); C.emit('peers');
    if (K.net) K.net.startHost().then(() => C.emit('collab')).catch((e) => { console.warn(e); K.netError = e.message; C.emit('collab'); });
    return true;
  };
  K.join = async ({ address, port, pin, name }) => {
    const r = await N.collabJoin({ address, port, pin, name });
    if (!r.ok) { C.toast(r.error, 'err', 5000); return false; }
    return K.afterWelcome(r.welcome, { hostName: r.welcome.hostName, address, port });
  };
  K.afterWelcome = (w, inf) => {
    C.engine.pause();
    C.loadProjectData(w.state, null);
    C.UI.dirty = true;
    K.mode = 'guest'; myId = w.you; myColor = w.color; info = inf;
    peers.clear(); for (const p of w.peers) peers.set(p.id, p);
    startSync();
    C.app.afterLoad();
    C.emit('collab'); C.emit('peers');
    C.toast(`Joined ${w.hostName}'s session`);
    return true;
  };
  K.leave = async () => {
    if (K.net && K.net.isGuest()) K.net.leave();
    await N.collabLeave();
    if (K.net) setTimeout(() => K.net.leave(), 600); // let the 'session ended' message reach internet guests first
    K.mode = 'off'; peers.clear(); myId = null; info = null;
    C.emit('collab'); C.emit('peers');
  };

  // ---------------- UI ----------------
  const UI = (C.collabUI = {});
  const myName = () => { try { return localStorage.getItem('cutroom.name') || ''; } catch (_) { return ''; } };
  const setName = (v) => { try { localStorage.setItem('cutroom.name', v); } catch (_) {} };

  UI.open = async () => {
    if (K.mode !== 'off') return openSession();
    const name = await askName();
    if (name) openStart(name);
  };

  // ---------- join codes: address + port + PIN packed into 12 characters ----------
  const ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  K.makeCode = (address, port, pin) => {
    const ip = address.split('.').map((n) => BigInt(+n));
    let v = (ip[0] << 24n) | (ip[1] << 16n) | (ip[2] << 8n) | ip[3];
    v = (v << 5n) | BigInt(C.clamp(port - 47811, 0, 31));
    v = (v << 20n) | BigInt(+pin);
    let chk = 0n; for (let x = v; x > 0n; x >>= 3n) chk = (chk + (x & 7n)) & 7n;
    v = (v << 3n) | chk;
    let out = '';
    for (let i = 0; i < 12; i++) { out = ALPH[Number(v & 31n)] + out; v >>= 5n; }
    return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
  };
  K.readCode = (code) => {
    const clean = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (clean.length !== 12) return null;
    let v = 0n;
    for (const ch of clean) { const i = ALPH.indexOf(ch); if (i < 0) return null; v = (v << 5n) | BigInt(i); }
    const chk = v & 7n; v >>= 3n;
    let c2 = 0n; for (let x = v; x > 0n; x >>= 3n) c2 = (c2 + (x & 7n)) & 7n;
    if (c2 !== chk) return null;
    const pin = String(Number(v & 0xFFFFFn)).padStart(6, '0'); v >>= 20n;
    const port = 47811 + Number(v & 31n); v >>= 5n;
    const address = [24n, 16n, 8n, 0n].map((sh) => Number((v >> sh) & 255n)).join('.');
    return { address, port, pin };
  };
  K.codes = () => (info && info.addresses ? info.addresses.map((a) => ({ name: a.name, code: K.makeCode(a.address, info.port, info.pin) })) : []);

  // Step 1 of collaborating: everyone enters a name so it's clear who's who
  const NAME_COLORS = ['#ff6b9a', '#ffb547', '#7c8cff', '#3ee08f', '#ff7a45', '#c77dff', '#4dd4ff', '#f5e04b'];
  const colorFor = (n) => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return NAME_COLORS[h % NAME_COLORS.length]; };
  function askName(title = 'Collaborate') {
    return new Promise((resolve) => {
      let result = null;
      const { el, close } = C.modal(`<div class="modal-head"><h2>${C.icon('users').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px;color:var(--accent)"')}${C.esc(title)}</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
        <div class="modal-body name-step">
          <div class="name-avatar" id="nAv">?</div>
          <h3>Enter your name</h3>
          <p class="hint">So everyone can tell who's who — your name is shown on your playhead, the clips you select and in the people list.</p>
          <input class="text-input name-input" id="nIn" maxlength="24" placeholder="Your name" spellcheck="false" autocomplete="off">
          <div class="hint" id="nErr" style="color:var(--danger);min-height:18px"></div>
        </div>
        <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="nGo">Continue</button></div>`, { onClose: () => resolve(result) });
      const inp = el.querySelector('#nIn'), av = el.querySelector('#nAv');
      const sync = () => { const v = inp.value.trim(); av.textContent = v ? v[0].toUpperCase() : '?'; av.style.background = v ? colorFor(v) : 'var(--panel-3)'; };
      inp.value = myName(); sync();
      inp.addEventListener('input', () => { sync(); el.querySelector('#nErr').textContent = ''; });
      const go = () => {
        const v = inp.value.trim().replace(/\s+/g, ' ');
        if (!v) { el.querySelector('#nErr').textContent = 'Please enter your name'; inp.focus(); return; }
        setName(v); result = v; close();
      };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
      el.querySelector('#nGo').onclick = go;
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  }
  UI.askName = askName;
  const ensureName = () => askName('Join session');
  UI.joinWithCode = async (code, address = null, port = null, knownName = null) => {
    const raw = String(code || '').trim();
    let target = null;
    if (K.net && K.net.isCode(raw)) {
      if (K.mode !== 'off') { if (!(await C.confirm('Leave current session?', 'You are already in a session.', 'Leave'))) return false; await K.leave(); }
      const name = knownName || await ensureName(); if (!name) return false;
      C.toast('Connecting over the internet…', 'info', 2500);
      return K.net.join(raw, name);
    }
    if (/^\d{6}$/.test(raw) && address) target = { address, port, pin: raw };
    else target = K.readCode(raw);
    if (!target) { C.toast('That join code doesn’t look right — check it and try again', 'err', 4000); return false; }
    if (K.mode !== 'off') { if (!(await C.confirm('Leave current session?', 'You are already in a session.', 'Leave'))) return false; await K.leave(); }
    const name = knownName || await ensureName(); if (!name) return false;
    C.toast('Connecting…', 'info', 1500);
    return K.join({ address: target.address, port: target.port, pin: target.pin, name });
  };

  function openStart(name) {
    let sessions = [];
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.icon('users').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px;color:var(--accent)"')}Collaborate</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body">
        <div class="you-are"><span class="name-avatar sm" style="background:${colorFor(name)}">${C.esc(name[0].toUpperCase())}</span><span>You'll appear as <b>${C.esc(name)}</b></span><button class="reset-btn" id="cChange">Change name</button></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
          <div class="collab-box">
            <div class="section-title"><span>Invite friends</span></div>
            <p class="hint">Start a session and you'll get a <b style="color:var(--text)">join code</b>. Give it to your friends — they enter it in Cutroom and edit this project with you live. Your media is sent to them automatically.</p>
            <button class="btn primary block" id="cHost">${C.icon('share')}<span>Start session & get code</span></button>
          </div>
          <div class="collab-box">
            <div class="section-title"><span>Join with a code</span></div>
            <div style="display:flex;gap:8px"><input class="text-input code-input" id="cCode" placeholder="XXXX-XXXX-XXXX" maxlength="20" spellcheck="false"><button class="btn primary" id="cJoin">Join</button></div>
            <div class="section-title" style="margin-top:16px"><span>Sessions nearby</span><span class="muted" id="cScan" style="text-transform:none;letter-spacing:0">Searching…</span></div>
            <div id="cList" style="display:grid;gap:8px"></div>
          </div>
        </div>
        <p class="hint" style="margin-top:14px">${C.icon('info').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} The first time, Windows may ask to let Cutroom through the firewall — choose <b>Allow</b>. Joining opens the host's project (your current one is autosaved).</p>
      </div>`, { onClose: () => N.collabDiscoverStop() });
    const getName = () => name;
    el.querySelector('#cChange').onclick = async () => { close(); const n = await askName(); if (n) openStart(n); };
    el.querySelector('#cHost').onclick = async () => { if (await K.host(name)) { close(); openSession(); } };
    const codeEl = el.querySelector('#cCode');
    codeEl.addEventListener('input', () => { const v = codeEl.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 16); codeEl.value = v.replace(/(.{4})(?=.)/g, '$1-'); });
    codeEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') el.querySelector('#cJoin').click(); });
    el.querySelector('#cJoin').onclick = async () => {
      const v = codeEl.value;
      if (!K.readCode(v) && !(K.net && K.net.isCode(v))) { C.toast('That join code doesn’t look right — check it and try again', 'err', 4000); codeEl.focus(); return; }
      close(); if (!(await UI.joinWithCode(v, null, null, name))) setTimeout(() => openStart(name), 50);
    };
    const list = el.querySelector('#cList');
    const renderList = () => {
      el.querySelector('#cScan').textContent = sessions.length ? `${sessions.length} found` : 'Searching…';
      list.innerHTML = sessions.length ? '' : '<div class="hint">No sessions found nearby yet — use the join code instead.</div>';
      for (const s of sessions) {
        const row = C.h(`<div class="nearby"><div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${C.esc(s.session || 'Untitled')}</div><div class="hint">${C.esc(s.host)} · ${s.peers} joined</div></div><button class="btn">Join</button></div>`);
        row.querySelector('button').onclick = async () => {
          const code = await C.prompt('Join session', `Enter ${s.host}'s join code`, '', 'Join');
          if (!code) return;
          await UI.joinWithCode(code, s.address, s.port, getName());
        };
        list.appendChild(row);
      }
    };
    renderList();
    N.onCollab('sessions', (s) => { sessions = s; if (document.body.contains(list)) renderList(); });
    N.collabDiscoverStart();
  }

  function openSession() {
    const { el, close } = C.modal('<div id="cBody"></div>', { onClose: () => { C.off && (C.off('collab', h), C.off('peers', h)); } });
    const render = () => {
      const body = el.querySelector('#cBody'); if (!body) return;
      const ps = K.peers();
      const people = [{ name: (myName() || 'You') + ' (you)', color: myColor || colorFor(myName() || 'You'), mode: C.mode }, ...ps];
      body.innerHTML = `<div class="modal-head"><h2>${K.mode === 'host' ? 'Hosting live session' : 'Connected to ' + C.esc(info.hostName)}</h2><button class="icon-btn" data-x>${C.icon('x')}</button></div>
        <div class="modal-body">
          ${K.mode === 'host' ? (() => { const codes = K.codes(); const net = K.netCode; return `<div class="code-hero"><div class="hint">${net ? '🌍 Join code — works from anywhere with internet' : K.netError ? 'Join code (same Wi-Fi only — internet unavailable)' : 'Setting up internet access…'}</div><div class="join-code ${net ? 'net' : ''}" id="cCodeBig">${net || (codes[0] ? codes[0].code : '—')}</div><button class="btn" id="cCopy">${C.icon('copy')}<span>Copy code</span></button></div>
            <p class="hint" style="text-align:center;margin:10px 0 0">Friends open <b style="color:var(--text)">Collaborate</b> in Cutroom (or the home screen), enter this code and join you — ${net ? 'on any Wi-Fi, anywhere' : 'they need to be on your Wi-Fi'}.</p>
            ${net && codes.length ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer;text-align:center">On the same Wi-Fi? Faster local code</summary><div style="display:grid;gap:6px;margin-top:8px">${codes.map((c) => `<div class="hint" style="text-align:center"><span class="kbd">${c.code}</span> <span>(${C.esc(c.name)})</span></div>`).join('')}</div></details>` : ''}${K.netError ? `<p class="hint" style="text-align:center;color:var(--danger)">Internet joining isn't available right now (${C.esc(K.netError)}). People on your Wi-Fi can still join.</p>` : ''}`; })() : `<p class="hint" style="margin-top:0">Edits you make are sent to everyone instantly. Media you import is uploaded to the session automatically.</p>`}
          <div class="collab-shared"><div><b>Work on anything together</b><span class="hint">Video edits sync live. In the 🖼️ Photo editor you share one image (perfect for thumbnails) — everyone sees each other's cursor and layers update as you work.</span></div>${C.photo && C.photo.doc ? `<button class="btn" id="cSharePhoto">${C.icon('photo')}<span>Share “${C.esc(C.photo.doc.name)}”</span></button>` : ''}</div>
          <div class="section-title" style="margin-top:18px"><span>People (${people.length})</span></div>
          <div style="display:grid;gap:8px">${people.map((p) => `<div style="display:flex;align-items:center;gap:10px"><span style="width:28px;height:28px;border-radius:50%;background:${p.color};color:#000;display:grid;place-items:center;font-weight:700">${C.esc((p.name || '?')[0].toUpperCase())}</span><span>${C.esc(p.name)}<small class="muted" style="display:block;font-size:11px">${K.where(p.mode)}</small></span>${p.playhead != null && (p.mode || 'video') === 'video' ? `<span class="muted" style="margin-left:auto;font-family:var(--mono);font-size:11.5px">${C.fmtTC(p.playhead, C.fps())}</span>` : ''}</div>`).join('')}</div>
        </div>
        <div class="modal-foot"><button class="btn danger" id="cEnd">${K.mode === 'host' ? 'End session' : 'Leave session'}</button><button class="btn primary" data-x>Keep editing</button></div>`;
      C.fillIcons(body);
      body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = close));
      const cp = body.querySelector('#cCopy');
      if (cp) cp.onclick = () => { navigator.clipboard.writeText(body.querySelector('#cCodeBig').textContent).then(() => C.toast('Join code copied — send it to your friends')); };
      body.querySelector('#cEnd').onclick = async () => { const wasHost = K.mode === 'host'; await K.leave(); close(); C.toast(wasHost ? 'Session ended' : 'Left the session', 'info'); };
      const sh = body.querySelector('#cSharePhoto'); if (sh) sh.onclick = () => { if (C.photoSync && C.photo.doc) { C.photoSync.flush(true); C.toast(`Sharing “${C.photo.doc.name}” with everyone`, 'ok', 2000); } };
    };
    render();
    const h = () => render();
    C.on('collab', h); C.on('peers', h);
  }

  // top-bar avatars
  C.on('peers', () => {
    const wrap = C.$('#collabAvatars'); if (!wrap) return;
    const ps = K.peers();
    const me = { name: (myName() || 'You') + ' (you)', color: myColor || '#19d3c5' };
    me.mode = C.mode;
    wrap.innerHTML = K.mode === 'off' ? '' : `<span class="live-pill" data-tip="Live session · ${ps.length + 1} ${ps.length ? 'people' : 'person (waiting for others)'}"><i></i>LIVE · ${ps.length + 1}</span>` + [me, ...ps].slice(0, 6).map((p) => `<span data-tip="${C.esc(p.name)} · ${K.where(p.mode)}" style="width:24px;height:24px;border-radius:50%;background:${p.color};color:#000;display:inline-grid;place-items:center;font-weight:700;font-size:11px;margin-left:-6px;border:2px solid var(--bg)">${C.esc((p.name || '?')[0].toUpperCase())}</span>`).join('');
    const btn = C.$('#btnCollab'); if (btn) btn.classList.toggle('active', K.mode !== 'off');
  });

  // ---------------- Share packages ----------------
  const S = (C.share = {});
  function progressModal(title) {
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.esc(title)}</h2></div><div class="modal-body"><div class="progress"><div id="shBar"></div></div><div class="export-stats"><span id="shPct">0%</span><span></span></div></div>`, { dismissable: false });
    N.onShareProgress((v) => { const b = el.querySelector('#shBar'); if (b) { b.style.width = v * 100 + '%'; el.querySelector('#shPct').textContent = Math.round(v * 100) + '%'; } });
    return { el, close };
  }
  S.pack = async () => {
    const name = (C.project.name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '_');
    const out = await N.shareSaveDialog(name);
    if (!out) return;
    const media = Object.values(C.project.media).map((m) => ({ id: m.id, path: C.mediaPath(m) }));
    const pm = progressModal('Creating share package');
    const r = await N.sharePack({ projectText: C.serialize(), media, outPath: out });
    pm.close();
    if (!r.ok) { C.toast('Could not create package: ' + r.error, 'err', 6000); return; }
    const { el, close } = C.modal(`<div class="modal-head"><h2>Package ready</h2></div><div class="modal-body" style="text-align:center"><div class="success-ico">${C.icon('check')}</div><p>Your project and ${r.files} media file${r.files === 1 ? '' : 's'} are bundled in one file.</p><p class="hint" style="word-break:break-all">${C.esc(r.path)}</p>${r.missing ? `<p class="hint" style="color:var(--warn)">${r.missing} missing file(s) were skipped.</p>` : ''}<p class="hint">Send it any way you like. They open it with <b>File → Open</b> in Cutroom (or just double-click it).</p></div><div class="modal-foot"><button class="btn" id="shShow">${C.icon('folder')}<span>Show in folder</span></button><button class="btn primary" data-close>Done</button></div>`);
    el.querySelector('#shShow').onclick = () => N.showItem(r.path);
    void close;
  };
  S.openPackage = async (p) => {
    const pm = progressModal('Opening package');
    const r = await N.shareUnpack(p);
    pm.close();
    if (!r.ok) { C.toast(r.error, 'err', 6000); return; }
    await C.app.openProjectPath(r.projectPath, true);
    C.toast('Package opened — media saved to ' + r.folder, 'ok', 5000);
  };
})(window.C);
