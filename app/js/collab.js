/* Cutroom — live collaboration (renderer side) + share packages */
(function (C) {
  const N = window.native;
  const K = (C.collab = { mode: 'off' });
  let myId = null, seq = 0, lastSynced = null, pendingOwn = new Map(), peers = new Map(), sent = new Set(), info = null;
  C.localImports = new Set();

  const keysOf = (d) => {
    const ks = [];
    for (const k of ['clips', 'tracks', 'media', 'markers']) if (d[k]) for (const id in d[k]) ks.push(k + ':' + id);
    if (d.trackOrder) ks.push('trackOrder'); if (d.settings) ks.push('settings'); if (d.name !== undefined) ks.push('name');
    return ks;
  };
  const filterDiff = (d, keep) => {
    const out = {}; let any = false;
    for (const k of ['clips', 'tracks', 'media', 'markers']) if (d[k]) for (const id in d[k]) if (keep(k + ':' + id)) { (out[k] = out[k] || {})[id] = d[k][id]; any = true; }
    for (const k of ['trackOrder', 'settings', 'name']) if (d[k] !== undefined && keep(k)) { out[k] = d[k]; any = true; }
    return any ? out : null;
  };

  K.status = () => ({ mode: K.mode, peers: peers.size, info });
  K.peers = () => [...peers.values()];
  K.canFetch = () => K.mode === 'guest';
  K.fetchMedia = async (m, onProgress) => {
    const handler = (id, v) => { if (id === m.id) onProgress(v); };
    progressHandlers.add(handler);
    try { const r = await N.collabFetchMedia({ id: m.id, ext: m.ext || C.extOf(m.path) }); return r.ok ? r.path : null; }
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
    N.collabSend({ t: 'op', seq, diff: d });
    if (d.media) for (const id in d.media) if (d.media[id]) shareMedia(id);
  }, 60);

  function shareMedia(id) {
    if (sent.has(id)) return;
    const m = C.project.media[id]; if (!m) return;
    const p = C.mediaPath(m);
    if (K.mode === 'host') { sent.add(id); N.collabRegisterMedia(id, p); }
    else if (K.mode === 'guest' && C.localImports.has(id)) {
      sent.add(id);
      N.collabUpload({ id, filePath: p, ext: m.ext || C.extOf(p) }).then((ok) => { if (!ok) { sent.delete(id); C.toast(`Could not send ${m.name} to the session`, 'err'); } });
    }
  }

  C.on('change', (i) => { if (K.mode !== 'off' && i.source !== 'remote') flush(); });
  const presence = C.throttle(() => { if (K.mode !== 'off') N.collabSend({ t: 'presence', playhead: C.UI.playhead, selection: [...C.selection] }); }, 150);
  C.on('time', presence); C.on('select', presence);

  N.onCollab('message', (m) => {
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
      peers.set(m.from, Object.assign(peers.get(m.from) || {}, { id: m.from, name: m.name, color: m.color, playhead: m.playhead, selection: m.selection }));
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
    K.mode = 'host'; myId = 'host'; info = r; peers.clear();
    startSync();
    for (const id in C.project.media) shareMedia(id);
    C.emit('collab'); C.emit('peers');
    return true;
  };
  K.join = async ({ address, port, pin, name }) => {
    const r = await N.collabJoin({ address, port, pin, name });
    if (!r.ok) { C.toast(r.error, 'err', 5000); return false; }
    const w = r.welcome;
    C.engine.pause();
    C.loadProjectData(w.state, null);
    C.UI.dirty = true;
    K.mode = 'guest'; myId = w.you; info = { hostName: w.hostName, address, port };
    peers.clear(); for (const p of w.peers) peers.set(p.id, p);
    startSync();
    C.app.afterLoad();
    C.emit('collab'); C.emit('peers');
    C.toast(`Joined ${w.hostName}'s session`);
    return true;
  };
  K.leave = async () => {
    await N.collabLeave();
    K.mode = 'off'; peers.clear(); myId = null; info = null;
    C.emit('collab'); C.emit('peers');
  };

  // ---------------- UI ----------------
  const UI = (C.collabUI = {});
  const myName = () => { try { return localStorage.getItem('cutroom.name') || ''; } catch (_) { return ''; } };
  const setName = (v) => { try { localStorage.setItem('cutroom.name', v); } catch (_) {} };

  UI.open = () => {
    if (K.mode === 'off') return openStart();
    return openSession();
  };

  function openStart() {
    let sessions = [];
    const { el, close } = C.modal(`<div class="modal-head"><h2>Collaborate over Wi-Fi</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Your name</label><input class="text-input" id="cName" placeholder="e.g. Alex" value="${C.esc(myName())}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div class="section" style="border:1px solid var(--line);border-radius:12px;padding:16px">
            <div class="section-title"><span>Host this project</span></div>
            <p class="hint">Others on the same network can join and edit this timeline with you live. Your media files are sent to them automatically.</p>
            <button class="btn primary block" id="cHost">${C.icon('wifi')}<span>Start session</span></button>
          </div>
          <div class="section" style="border:1px solid var(--line);border-radius:12px;padding:16px">
            <div class="section-title"><span>Join a session</span><span class="muted" id="cScan" style="text-transform:none;letter-spacing:0">Searching…</span></div>
            <div id="cList" style="display:grid;gap:8px;margin-bottom:12px"></div>
            <details><summary class="hint" style="cursor:pointer">Connect by address</summary>
              <div style="display:grid;gap:8px;margin-top:10px"><input class="text-input" id="cAddr" placeholder="192.168.1.20:47811"><input class="text-input" id="cPin" placeholder="6-digit PIN" maxlength="6"><button class="btn block" id="cJoinManual">Join</button></div>
            </details>
          </div>
        </div>
        <p class="hint" style="margin-top:14px">${C.icon('info').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} Windows may ask to allow Cutroom through the firewall the first time — choose <b>Private networks</b>. Joining replaces your open timeline with the host's project (yours is autosaved).</p>
      </div>`, { onClose: () => N.collabDiscoverStop() });
    const nameEl = el.querySelector('#cName');
    const getName = () => { const v = nameEl.value.trim(); if (!v) { nameEl.focus(); C.toast('Enter your name first', 'info'); return null; } setName(v); return v; };
    el.querySelector('#cHost').onclick = async () => { const n = getName(); if (!n) return; if (await K.host(n)) { close(); openSession(); } };
    const joinWith = async (address, port) => {
      const n = getName(); if (!n) return;
      const pin = await C.prompt('Enter PIN', 'Session PIN', '', 'Join');
      if (!pin) return;
      if (await K.join({ address, port, pin: pin.trim(), name: n })) { close(); }
    };
    el.querySelector('#cJoinManual').onclick = async () => {
      const n = getName(); if (!n) return;
      const [a, p] = el.querySelector('#cAddr').value.trim().split(':');
      if (!a) return C.toast('Enter the host address', 'info');
      if (await K.join({ address: a, port: +(p || 47811), pin: el.querySelector('#cPin').value.trim(), name: n })) close();
    };
    const list = el.querySelector('#cList');
    const renderList = () => {
      el.querySelector('#cScan').textContent = sessions.length ? `${sessions.length} found` : 'Searching…';
      list.innerHTML = sessions.length ? '' : '<div class="hint">No sessions found yet. Make sure you\'re on the same Wi-Fi as the host.</div>';
      for (const s of sessions) {
        const row = C.h(`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line-2);border-radius:9px;background:var(--bg-2)"><div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${C.esc(s.session || 'Untitled')}</div><div class="hint">${C.esc(s.host)} · ${C.esc(s.computer)} · ${s.peers} joined</div></div><button class="btn">Join</button></div>`);
        row.querySelector('button').onclick = () => joinWith(s.address, s.port);
        list.appendChild(row);
      }
    };
    renderList();
    N.onCollab('sessions', (s) => { sessions = s; if (document.body.contains(list)) renderList(); });
    N.collabDiscoverStart();
  }

  function openSession() {
    const { el, close } = C.modal('<div id="cBody"></div>');
    const render = () => {
      const body = el.querySelector('#cBody'); if (!body) return;
      const ps = K.peers();
      const people = [{ name: (myName() || 'You') + ' (you)', color: K.mode === 'host' ? '#ff6b9a' : '#19d3c5' }, ...ps];
      body.innerHTML = `<div class="modal-head"><h2>${K.mode === 'host' ? 'Hosting live session' : 'Connected to ' + C.esc(info.hostName)}</h2><button class="icon-btn" data-x>${C.icon('x')}</button></div>
        <div class="modal-body">
          ${K.mode === 'host' ? `<div style="display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center">
            <div style="text-align:center;background:var(--bg-2);border:1px solid var(--line-2);border-radius:14px;padding:16px 26px"><div class="hint">Session PIN</div><div style="font:700 38px var(--mono);letter-spacing:6px;color:var(--accent)">${info.pin}</div></div>
            <div><p class="hint" style="margin-top:0">Others open <b style="color:var(--text)">Collaborate</b> in Cutroom on the same Wi-Fi — your session appears automatically. They'll need this PIN.</p>
            <p class="hint">Or connect by address: ${info.addresses.map((a) => `<span class="kbd">${a.address}:${info.port}</span>`).join(' ') || 'no network found'}</p></div></div>` : `<p class="hint" style="margin-top:0">Edits you make are sent to everyone instantly. Media you import is uploaded to the session automatically.</p>`}
          <div class="section-title" style="margin-top:18px"><span>People (${people.length})</span></div>
          <div style="display:grid;gap:8px">${people.map((p) => `<div style="display:flex;align-items:center;gap:10px"><span style="width:28px;height:28px;border-radius:50%;background:${p.color};color:#000;display:grid;place-items:center;font-weight:700">${C.esc((p.name || '?')[0].toUpperCase())}</span><span>${C.esc(p.name)}</span>${p.playhead != null ? `<span class="muted" style="margin-left:auto;font-family:var(--mono);font-size:11.5px">${C.fmtTC(p.playhead, C.fps())}</span>` : ''}</div>`).join('')}</div>
        </div>
        <div class="modal-foot"><button class="btn danger" id="cEnd">${K.mode === 'host' ? 'End session' : 'Leave session'}</button><button class="btn primary" data-x>Keep editing</button></div>`;
      C.fillIcons(body);
      body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = close));
      body.querySelector('#cEnd').onclick = async () => { await K.leave(); close(); C.toast(K.mode === 'host' ? 'Session ended' : 'Left the session', 'info'); };
    };
    render();
    const h = () => render();
    C.on('collab', h);
  }

  // top-bar avatars
  C.on('peers', () => {
    const wrap = C.$('#collabAvatars'); if (!wrap) return;
    const ps = K.peers();
    wrap.innerHTML = K.mode === 'off' ? '' : ps.slice(0, 5).map((p) => `<span data-tip="${C.esc(p.name)}" style="width:24px;height:24px;border-radius:50%;background:${p.color};color:#000;display:inline-grid;place-items:center;font-weight:700;font-size:11px;margin-left:-6px;border:2px solid var(--bg)">${C.esc((p.name || '?')[0].toUpperCase())}</span>`).join('') + `<span class="live-pill" style="margin-left:8px;background:rgba(62,224,143,.15);color:#3ee08f;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">LIVE${ps.length ? ' · ' + (ps.length + 1) : ''}</span>`;
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
