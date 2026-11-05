/* Cutroom — collaborate over the internet (any Wi-Fi), with just a join code.
   How it works: the two apps meet through a public WebRTC "signalling" server (PeerJS cloud) only long enough to
   exchange connection details — those details are end-to-end encrypted with a secret that's part of the join code,
   so the server can't read them and nobody without the code can join. After that, everything (edits, images, media)
   flows directly between the two computers over an encrypted WebRTC connection. */
(function (C) {
  const N = window.native, K = C.collab;
  const NET = (K.net = { role: null });
  const SIGNAL = () => { try { return localStorage.getItem('cutroom.signal') || 'wss://0.peerjs.com/peerjs'; } catch (_) { return 'wss://0.peerjs.com/peerjs'; } };
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
  const ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const rnd = (n) => { const a = crypto.getRandomValues(new Uint8Array(n)); return [...a].map((v) => ALPH[v & 31]).join(''); };
  const clean = (code) => String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  NET.isCode = (code) => clean(code).length === 16;
  const fmt = (c) => c.replace(/(.{4})(?=.)/g, '$1-');
  const hostIdOf = (room) => 'cutroom-' + room.toLowerCase();

  // ---------- end-to-end encryption of the signalling payload (AES-GCM, key from the code's secret) ----------
  async function keyFor(room, secret) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('cutroom/' + room), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function seal(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))); return { iv: b64(iv), ct: b64(ct) }; }
  async function open(key, box) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)); return JSON.parse(new TextDecoder().decode(pt)); }

  // ---------- signalling socket (PeerJS server protocol) ----------
  function signal(id) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${SIGNAL()}?key=peerjs&id=${encodeURIComponent(id)}&token=${rnd(10).toLowerCase()}&version=1.5.4`);
      const s = { ws, on: null, send: (type, dst, payload) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type, dst, payload })); }, close: () => { clearInterval(s.hb); try { ws.close(); } catch (_) {} } };
      const to = setTimeout(() => { reject(new Error("couldn't reach the connection server")); s.close(); }, 12000);
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.type === 'OPEN') { clearTimeout(to); s.hb = setInterval(() => ws.readyState === 1 && ws.send('{"type":"HEARTBEAT"}'), 5000); resolve(s); return; }
        if (m.type === 'ID-TAKEN') { clearTimeout(to); reject(new Error('ID-TAKEN')); return; }
        if (m.type === 'ERROR' || m.type === 'INVALID-KEY') { clearTimeout(to); reject(new Error((m.payload && m.payload.msg) || m.type)); return; }
        s.on && s.on(m);
      };
      ws.onerror = () => { clearTimeout(to); reject(new Error("couldn't reach the connection server")); };
      ws.onclose = () => { clearInterval(s.hb); s.closed = true; s.onclose && s.onclose(); };
    });
  }
  const gathered = (pc, ms = 4000) => new Promise((res) => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });

  // ---------- framed messaging over a data channel (splits big messages, respects back-pressure) ----------
  const CH = 60000;
  function framer(dc, onMsg) {
    let parts = null;
    dc.onmessage = (e) => {
      const d = e.data; if (typeof d !== 'string') return;
      const k = d[0];
      if (k === 'M') onMsg(d.slice(1));
      else if (k === 'S') parts = [];
      else if (k === 'P' && parts) parts.push(d.slice(1));
      else if (k === 'E' && parts) { const full = parts.join(''); parts = null; onMsg(full); }
    };
    let chain = Promise.resolve();
    const drain = () => new Promise((r) => { if (dc.bufferedAmount < 4e6) return r(); dc.bufferedAmountLowThreshold = 1e6; const f = () => { dc.removeEventListener('bufferedamountlow', f); r(); }; dc.addEventListener('bufferedamountlow', f); });
    return (str) => { chain = chain.then(async () => { if (dc.readyState !== 'open') return; if (str.length <= CH) { await drain(); dc.send('M' + str); return; } dc.send('S'); for (let i = 0; i < str.length; i += CH) { await drain(); if (dc.readyState !== 'open') return; dc.send('P' + str.slice(i, i + CH)); } dc.send('E'); }); return chain; };
  }

  // ---------- media streaming (files are read in 512 KB ranges, never fully into memory) ----------
  async function streamFile(dc, header, filePath, onProg) {
    const sctp = dc._pc && dc._pc.sctp; const PIECE = Math.max(16 * 1024, Math.min(192 * 1024, ((sctp && sctp.maxMessageSize) || 65536) - 1024));
    const url = N.mediaUrl(filePath);
    const head = await fetch(url, { headers: { Range: 'bytes=0-0' } }); const total = +((head.headers.get('Content-Range') || '').split('/')[1] || head.headers.get('Content-Length') || 0);
    dc.send(JSON.stringify(Object.assign({}, header, { size: total })));
    for (let off = 0; off < total; off += PIECE) {
      const end = Math.min(total, off + PIECE) - 1; // each read is one data-channel message
      const buf = await (await fetch(url, { headers: { Range: `bytes=${off}-${end}` } })).arrayBuffer();
      while (dc.bufferedAmount > 8e6) await new Promise((r) => setTimeout(r, 15));
      if (dc.readyState !== 'open') throw new Error('connection closed');
      dc.send(buf); onProg && onProg((end + 1) / total);
    }
    dc.send(JSON.stringify({ t: 'end', id: header.id }));
  }
  function receiver(dc, onFile) {
    let cur = null; let q = Promise.resolve();
    dc.binaryType = 'arraybuffer';
    dc.addEventListener('message', (e) => {
      const d = e.data;
      q = q.then(async () => {
        if (typeof d === 'string') {
          const m = JSON.parse(d);
          if (m.t === 'end' && cur) { const c = cur; cur = null; onFile(c); return; }
          if (m.t === 'file') { cur = Object.assign({}, m, { got: 0, path: await N.collabRtcCachePath(m.id, m.ext) }); if (!m.size) { const c = cur; cur = null; onFile(c); } return; }
          if (m.t === 'mget' || m.t === 'missing') { NET._onMediaCtl && NET._onMediaCtl(dc, m); return; }
        } else if (cur) { await N.appendBinary(cur.path, d); cur.got += d.byteLength; cur.onProg && cur.onProg(cur.got / (cur.size || 1)); const w = NET._waiters.get(cur.id); if (w && w.prog) w.prog(cur.got / (cur.size || 1)); }
      }).catch((err) => console.warn('media receive', err));
    });
  }
  NET._waiters = new Map();

  // ================= HOST =================
  const guests = new Map(); // vid -> { pc, ctl, media, send }
  let hostSig = null, hostKey = null, room = null, secret = null;
  NET.startHost = async () => {
    NET.stopHost(); K.netCode = null; K.netError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      room = rnd(6); secret = rnd(10);
      try { hostSig = await signal(hostIdOf(room)); break; } catch (e) { if (e.message !== 'ID-TAKEN' || attempt === 2) throw e; }
    }
    hostKey = await keyFor(room, secret); NET.role = 'host';
    K.netCode = fmt(room + secret);
    hostSig.on = async (m) => {
      if (m.type !== 'OFFER' || !m.payload || !m.payload.box) return;
      let offer; try { offer = await open(hostKey, m.payload.box); } catch (_) { hostSig.send('ANSWER', m.src, { bad: true }); return; } // wrong secret → tell them, reveal nothing
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const g = { pc, name: offer.name };
      pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        if (dc.label === 'ctl') {
          g.ctl = dc;
          dc.onopen = async () => {
            if (g.opened) return; g.opened = true;
            const r = await N.collabRtcOpen(g.name); if (!r.ok) { pc.close(); return; }
            g.vid = r.id; guests.set(g.vid, g); g.send = framer(dc, (s) => N.collabRtcIn(g.vid, s));
            const pre = (early.get(g.vid) || []).concat(g.pendingOut || []); early.delete(g.vid); g.pendingOut = null; pre.forEach((s) => g.send(s));
          };
          if (dc.readyState === 'open') dc.onopen();
          dc.onclose = () => { if (g.vid) { N.collabRtcClose(g.vid); guests.delete(g.vid); } };
        } else if (dc.label === 'media') { g.media = dc; dc._pc = pc; receiver(dc, async (f) => { if (f.t === 'file') { await N.collabRtcMediaSaved(f.id, f.path); } }); }
      };
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState) && g.vid) { N.collabRtcClose(g.vid); guests.delete(g.vid); } };
      await pc.setRemoteDescription(offer.sdp); await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
      hostSig.send('ANSWER', m.src, { box: await seal(hostKey, { sdp: pc.localDescription }) });
    };
    hostSig.onclose = () => { if (NET.role === 'host' && K.mode === 'host') setTimeout(() => NET.role === 'host' && reconnectHost(), 3000); };
  };
  async function reconnectHost() { try { const s = await signal(hostIdOf(room)); const on = hostSig.on; hostSig = s; hostSig.on = on; hostSig.onclose = () => setTimeout(() => NET.role === 'host' && reconnectHost(), 3000); } catch (_) { setTimeout(() => NET.role === 'host' && reconnectHost(), 6000); } }
  // hub → internet guest
  const early = new Map(); // messages for a guest that arrive before we've registered them
  N.onCollab('rtcOut', (vid, s) => { const g = guests.get(vid); if (!g) { if (!early.has(vid)) early.set(vid, []); early.get(vid).push(s); return; } if (g.send) g.send(s); else (g.pendingOut = g.pendingOut || []).push(s); });
  N.onCollab('rtcKill', (vid) => { const g = guests.get(vid); if (g) { setTimeout(() => { try { g.pc.close(); } catch (_) {} }, 400); guests.delete(vid); } });
  // a guest asks for a media file
  NET._onMediaCtl = async (dc, m) => {
    if (m.t !== 'mget') return;
    const p = (await N.collabRtcMediaPath(m.id)) || (C.project.media[m.id] && C.mediaPath(C.project.media[m.id]));
    if (!p || !(await N.exists(p))) { dc.send(JSON.stringify({ t: 'missing', id: m.id })); return; }
    try { await (NET._sendQ = (NET._sendQ || Promise.resolve()).then(() => streamFile(dc, { t: 'file', id: m.id, ext: m.ext || C.extOf(p) }, p))); } catch (e) { console.warn('send media', e); try { dc.send(JSON.stringify({ t: 'missing', id: m.id })); } catch (_) {} }
  };
  NET.stopHost = () => { if (hostSig) { hostSig.onclose = null; hostSig.close(); } hostSig = null; for (const g of guests.values()) { try { g.pc.close(); } catch (_) {} } guests.clear(); if (NET.role === 'host') NET.role = null; K.netCode = null; };

  // ================= GUEST =================
  let gs = null; // { pc, ctl, media, send }
  NET.isGuest = () => NET.role === 'guest' && !!gs;
  NET.send = (m) => { if (gs && gs.send) gs.send(JSON.stringify(m)); };
  NET.join = async (code, name) => {
    const c = clean(code); const rm = c.slice(0, 6), sec = c.slice(6);
    const key = await keyFor(rm, sec);
    let sig;
    try { sig = await signal('cutroom-g-' + rnd(10).toLowerCase()); } catch (e) { C.toast('Could not connect to the internet session: ' + e.message, 'err', 6000); return false; }
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const ctl = pc.createDataChannel('ctl', { ordered: true }), media = pc.createDataChannel('media', { ordered: true }); media._pc = pc;
    const g = { pc, ctl, media };
    const welcome = new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error("the host didn't answer — check the code, and that they still have the session open")), 30000);
      g.onFirst = (m) => { if (m.t === 'welcome') { clearTimeout(to); res(m); } };
      g.fail = (e) => { clearTimeout(to); rej(e); };
    });
    ctl.onopen = () => { g.send = framer(ctl, (s) => { let m; try { m = JSON.parse(s); } catch (_) { return; } if (g.onFirst && m.t === 'welcome') { const f = g.onFirst; g.onFirst = null; f(m); return; } K.dispatch(m); }); };
    ctl.onclose = () => { if (gs === g) { gs = null; NET.role = null; if (K.mode === 'guest') K.dispatch({ t: 'end' }); } };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { g.fail && g.fail(new Error("couldn't connect directly — one of the networks is blocking it")); if (gs === g) ctl.onclose(); } };
    receiver(media, (f) => { const w = NET._waiters.get(f.id); if (w) { NET._waiters.delete(f.id); w.res(f.path); } });
    media.addEventListener('message', (e) => { if (typeof e.data === 'string') { const m = JSON.parse(e.data); if (m.t === 'missing') { const w = NET._waiters.get(m.id); if (w) { NET._waiters.delete(m.id); w.res(null); } } } });
    sig.on = async (m) => { if (m.type === 'ANSWER' && m.payload && m.payload.bad) { g.fail && g.fail(new Error("that code isn't right — check it and try again")); return; } if (m.type === 'ANSWER' && m.payload && m.payload.box) { try { const a = await open(key, m.payload.box); await pc.setRemoteDescription(a.sdp); } catch (_) { g.fail && g.fail(new Error('wrong code')); } } else if (m.type === 'EXPIRE') g.fail && g.fail(new Error('no session with that code — check the code')); };
    try {
      await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
      sig.send('OFFER', hostIdOf(rm), { box: await seal(key, { sdp: pc.localDescription, name }) });
      const w = await welcome;
      sig.close(); gs = g; NET.role = 'guest';
      return K.afterWelcome(w, { hostName: w.hostName, address: 'internet', port: 0, net: true });
    } catch (e) {
      sig.close(); try { pc.close(); } catch (_) {}
      C.toast('Could not join: ' + e.message, 'err', 6000); return false;
    }
  };
  NET.fetchMedia = (m, onProgress) => new Promise((res) => {
    if (!gs) return res(null);
    NET._waiters.set(m.id, { res, prog: onProgress });
    gs.media.send(JSON.stringify({ t: 'mget', id: m.id, ext: m.ext || C.extOf(m.path || '') }));
  });
  NET.upload = async (id, filePath, ext) => {
    if (!gs) return false;
    try { await (NET._sendQ = (NET._sendQ || Promise.resolve()).then(() => streamFile(gs.media, { t: 'file', id, ext }, filePath))); return true; } catch (e) { console.warn(e); return false; }
  };
  NET.leave = () => { NET.stopHost(); if (gs) { const g = gs; gs = null; NET.role = null; try { g.pc.close(); } catch (_) {} } };
})(window.C);
