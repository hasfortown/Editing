// Cutroom — LAN collaboration (main process)
// Host runs an HTTP + WebSocket hub; guests discover it over UDP broadcast and connect with a PIN.
const http = require('http');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const DISCOVERY_PORT = 47810;
const BASE_PORT = 47811;
const COLORS = ['#ff6b9a', '#ffb547', '#7c8cff', '#3ee08f', '#ff7a45', '#c77dff', '#4dd4ff', '#f5e04b'];

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  }
  // prefer typical home/office ranges first
  out.sort((a, b) => (/^(192\.168|10\.|172\.)/.test(b.address) ? 1 : 0) - (/^(192\.168|10\.|172\.)/.test(a.address) ? 1 : 0));
  return out;
}

function create({ send, userDir }) {
  let hub = null;      // when hosting
  let client = null;   // when joined as guest
  let discovery = null;
  const sessions = new Map();

  // ---------------- HOST ----------------
  async function host({ name, sessionName }) {
    await leave();
    const sessionId = crypto.randomBytes(6).toString('hex');
    const pin = String(crypto.randomInt(100000, 999999));
    const cacheDir = path.join(userDir, 'collab', sessionId);
    await fsp.mkdir(cacheDir, { recursive: true });
    const h = {
      sessionId, pin, name, sessionName, cacheDir,
      clients: new Map(), // id -> {ws, name, color, ready, queue}
      media: new Map(),   // mediaId -> local path
      pendingState: new Map(),
      colorIdx: 1,
      server: null, wss: null, beacon: null, port: 0,
    };
    const server = http.createServer((req, res) => handleHttp(h, req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
    server.on('upgrade', (req, socket, head) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== '/ws' || u.searchParams.get('pin') !== h.pin) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, (ws) => onGuest(h, ws, u.searchParams.get('name') || 'Guest'));
    });
    let port = BASE_PORT;
    for (; port < BASE_PORT + 20; port++) {
      const ok = await new Promise((res) => { server.once('error', () => res(false)); server.listen(port, '0.0.0.0', () => res(true)); });
      if (ok) break;
    }
    if (!server.listening) throw new Error('Could not open a network port for the session');
    h.server = server; h.wss = wss; h.port = port;
    // UDP beacon
    try {
      const b = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      b.bind(() => { try { b.setBroadcast(true); } catch (_) {} });
      const msg = () => Buffer.from(JSON.stringify({ app: 'cutroom', v: 1, id: sessionId, port, host: name, session: sessionName, computer: os.hostname(), peers: h.clients.size }));
      const tick = () => {
        const m = msg();
        try { b.send(m, DISCOVERY_PORT, '255.255.255.255'); } catch (_) {}
        for (const a of lanAddresses()) { // directed broadcast per interface (more reliable on Windows)
          const parts = a.address.split('.'); parts[3] = '255';
          try { b.send(m, DISCOVERY_PORT, parts.join('.')); } catch (_) {}
        }
      };
      tick(); h.beaconTimer = setInterval(tick, 1500); h.beacon = b;
    } catch (_) {}
    hub = h;
    return { ok: true, port, pin, sessionId, addresses: lanAddresses() };
  }

  function broadcast(h, msg, exceptId = null) {
    const s = JSON.stringify(msg);
    for (const [id, c] of h.clients) {
      if (id === exceptId) continue;
      if (!c.ready) { c.queue.push(s); continue; }
      if (c.ws.readyState === WebSocket.OPEN) c.ws.send(s);
    }
  }
  // message from any participant (host renderer uses id 'host')
  function hubIncoming(h, fromId, msg) {
    if (msg.t === 'op') {
      const out = { t: 'op', from: fromId, seq: msg.seq, diff: msg.diff };
      broadcast(h, out);               // to guests (including sender for ordering)
      send('collab:message', out);     // to host renderer
    } else if (msg.t === 'presence') {
      const c = fromId === 'host' ? { name: h.name, color: COLORS[0] } : h.clients.get(fromId);
      const out = { t: 'presence', from: fromId, name: c ? c.name : 'Guest', color: c ? c.color : '#fff', playhead: msg.playhead, selection: msg.selection, mode: msg.mode };
      broadcast(h, out, fromId);
      if (fromId !== 'host') send('collab:message', out);
    } else if (['pl', 'pd', 'preq', 'pc'].includes(msg.t)) {
      // photo-editor collaboration. Layer + structure updates are echoed to everyone (sender included) so all
      // copies apply them in the same hub order and converge; cursors / requests go to everyone else.
      const c = fromId === 'host' ? { name: h.name, color: COLORS[0] } : h.clients.get(fromId);
      const out = Object.assign({}, msg, { from: fromId, name: c ? c.name : 'Guest', color: c ? c.color : '#fff' });
      const echo = msg.t === 'pl' || msg.t === 'pd';
      broadcast(h, out, echo ? null : fromId);
      if (echo || fromId !== 'host') send('collab:message', out);
    } else if (msg.t === 'chat') {
      const c = fromId === 'host' ? { name: h.name } : h.clients.get(fromId);
      const out = { t: 'chat', from: fromId, name: c ? c.name : 'Guest', text: String(msg.text || '').slice(0, 500) };
      broadcast(h, out, fromId);
      if (fromId !== 'host') send('collab:message', out);
    }
  }

  function onGuest(h, ws, name) {
    const id = crypto.randomBytes(4).toString('hex');
    const color = COLORS[h.colorIdx++ % COLORS.length];
    const c = { ws, name: name.slice(0, 40), color, ready: false, queue: [] };
    h.clients.set(id, c);
    // ask the host renderer for the current state
    const reqId = crypto.randomBytes(4).toString('hex');
    h.pendingState.set(reqId, (state) => {
      const peers = [{ id: 'host', name: h.name, color: COLORS[0] }, ...[...h.clients].filter(([k]) => k !== id).map(([k, v]) => ({ id: k, name: v.name, color: v.color }))];
      ws.send(JSON.stringify({ t: 'welcome', you: id, color, sessionId: h.sessionId, state, peers, hostName: h.name }));
      c.ready = true;
      for (const q of c.queue) ws.send(q);
      c.queue = [];
    });
    send('collab:stateRequest', reqId);
    const joinMsg = { t: 'join', id, name: c.name, color };
    broadcast(h, joinMsg, id);
    send('collab:message', joinMsg);
    ws.on('message', (data) => { let m; try { m = JSON.parse(data.toString()); } catch (_) { return; } hubIncoming(h, id, m); });
    ws.on('close', () => {
      h.clients.delete(id);
      const m = { t: 'left', id, name: c.name };
      broadcast(h, m); send('collab:message', m);
    });
    ws.on('error', () => {});
    return id;
  }

  async function handleHttp(h, req, res) {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('pin') !== h.pin) { res.writeHead(401); return res.end(); }
    const m = /^\/media\/([\w-]+)$/.exec(u.pathname);
    if (!m) { res.writeHead(404); return res.end(); }
    const id = m[1];
    if (req.method === 'GET') {
      const p = h.media.get(id);
      if (!p) { res.writeHead(404); return res.end(); }
      try {
        const st = await fsp.stat(p);
        res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': 'application/octet-stream' });
        fs.createReadStream(p).pipe(res);
      } catch (_) { res.writeHead(404); res.end(); }
    } else if (req.method === 'PUT' || req.method === 'POST') {
      const ext = (u.searchParams.get('ext') || 'bin').replace(/[^\w]/g, '').slice(0, 8);
      const dest = path.join(h.cacheDir, `${id}.${ext}`);
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      req.pipe(out);
      out.on('finish', async () => {
        await fsp.rename(tmp, dest).catch(() => {});
        h.media.set(id, dest);
        res.writeHead(200); res.end('ok');
        send('collab:mediaArrived', id, dest);
        broadcast(h, { t: 'media', id });
      });
      out.on('error', () => { res.writeHead(500); res.end(); });
    } else { res.writeHead(405); res.end(); }
  }

  // ---------------- GUEST ----------------
  async function join({ address, port, pin, name }) {
    await leave();
    return await new Promise((resolve) => {
      const url = `ws://${address}:${port}/ws?pin=${encodeURIComponent(pin)}&name=${encodeURIComponent(name)}`;
      const ws = new WebSocket(url, { handshakeTimeout: 6000, maxPayload: 64 * 1024 * 1024 });
      let settled = false;
      const done = (r) => { if (!settled) { settled = true; resolve(r); } };
      ws.on('unexpected-response', (_req, res) => done({ ok: false, error: res.statusCode === 401 ? 'Wrong PIN' : 'Host refused the connection (' + res.statusCode + ')' }));
      ws.on('error', (e) => done({ ok: false, error: 'Could not reach host: ' + (e.code || e.message) }));
      ws.on('message', (data) => {
        let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
        if (m.t === 'welcome') {
          client = { ws, address, port, pin, sessionId: m.sessionId, cacheDir: path.join(userDir, 'collab', m.sessionId) };
          fs.mkdirSync(client.cacheDir, { recursive: true });
          done({ ok: true, welcome: m });
          return;
        }
        send('collab:message', m);
      });
      ws.on('close', () => { if (client && client.ws === ws) { client = null; send('collab:message', { t: 'end' }); } done({ ok: false, error: 'Connection closed' }); });
      setTimeout(() => done({ ok: false, error: 'Timed out waiting for host' }), 15000);
    });
  }

  function fetchMedia({ id, ext }) {
    if (!client) return Promise.resolve({ ok: false, error: 'Not connected' });
    const dest = path.join(client.cacheDir, `${id}.${(ext || 'bin').replace(/[^\w]/g, '')}`);
    if (fs.existsSync(dest)) return Promise.resolve({ ok: true, path: dest });
    const deadline = Date.now() + 10 * 60 * 1000;
    const attempt = () => new Promise((resolve) => {
      const req = http.get({ host: client.address, port: client.port, path: `/media/${id}?pin=${client.pin}` }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve({ retry: true }); }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let got = 0;
        const tmp = dest + '.part';
        const out = fs.createWriteStream(tmp);
        res.on('data', (d) => { got += d.length; if (total) send('collab:fetchProgress', id, got / total); });
        res.pipe(out);
        out.on('finish', () => { fs.rename(tmp, dest, (e) => resolve(e ? { ok: false, error: String(e) } : { ok: true, path: dest })); });
        out.on('error', (e) => resolve({ ok: false, error: String(e) }));
      });
      req.on('error', () => resolve({ retry: true }));
    });
    return (async () => {
      while (Date.now() < deadline) {
        if (!client) return { ok: false, error: 'Disconnected' };
        const r = await attempt();
        if (!r.retry) return r;
        await new Promise((s) => setTimeout(s, 2000));
      }
      return { ok: false, error: 'Timed out' };
    })();
  }

  function upload({ id, filePath, ext }) {
    if (!client) return Promise.resolve(false);
    return new Promise((resolve) => {
      let size = 0; try { size = fs.statSync(filePath).size; } catch (_) { return resolve(false); }
      const req = http.request({ host: client.address, port: client.port, method: 'PUT', path: `/media/${id}?pin=${client.pin}&ext=${encodeURIComponent(ext || 'bin')}`, headers: { 'Content-Length': size } }, (res) => { res.resume(); resolve(res.statusCode === 200); });
      req.on('error', () => resolve(false));
      fs.createReadStream(filePath).pipe(req);
    });
  }

  function sendMsg(msg) {
    if (hub) hubIncoming(hub, 'host', msg);
    else if (client && client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(msg));
  }

  async function leave() {
    if (hub) {
      const h = hub; hub = null;
      clearInterval(h.beaconTimer);
      try { h.beacon && h.beacon.close(); } catch (_) {}
      for (const c of h.clients.values()) { try { c.ws.send(JSON.stringify({ t: 'end' })); c.ws.close(); } catch (_) {} }
      try { h.wss.close(); } catch (_) {}
      await new Promise((r) => h.server.close(() => r()));
    }
    if (client) { const c = client; client = null; try { c.ws.close(); } catch (_) {} }
    return true;
  }

  // ---------------- DISCOVERY ----------------
  function discoverStart() {
    if (discovery) return true;
    sessions.clear();
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('message', (buf, rinfo) => {
      let m; try { m = JSON.parse(buf.toString()); } catch (_) { return; }
      if (m.app !== 'cutroom') return;
      if (hub && m.id === hub.sessionId) return;
      sessions.set(m.id, { ...m, address: rinfo.address, seen: Date.now() });
      emitSessions();
    });
    s.on('error', () => {});
    try { s.bind(DISCOVERY_PORT, () => { try { s.setBroadcast(true); } catch (_) {} }); } catch (_) {}
    const prune = setInterval(() => { const now = Date.now(); let ch = false; for (const [k, v] of sessions) if (now - v.seen > 5000) { sessions.delete(k); ch = true; } if (ch) emitSessions(); }, 2000);
    discovery = { s, prune };
    return true;
  }
  function emitSessions() { send('collab:sessions', [...sessions.values()]); }
  function discoverStop() { if (!discovery) return; clearInterval(discovery.prune); try { discovery.s.close(); } catch (_) {} discovery = null; }

  // ---------------- INTERNET GUESTS (WebRTC, bridged by the host's window) ----------------
  // An internet guest is a "virtual" client of the hub: same welcome / ordering / broadcast logic as LAN guests.
  const EventEmitter = require('events');
  const virt = new Map();
  function rtcOpen(name) {
    if (!hub) return { ok: false, error: 'Not hosting' };
    const ee = new EventEmitter(); let vid = null;
    const ws = { readyState: 1, send: (s) => { if (vid) send('collab:rtcOut', vid, String(s)); }, close: () => { ws.readyState = 3; if (vid) { send('collab:rtcKill', vid); virt.delete(vid); } }, on: (e, f) => ee.on(e, f) };
    vid = onGuest(hub, ws, String(name || 'Guest'));
    virt.set(vid, ee);
    return { ok: true, id: vid };
  }
  const rtcIn = (vid, data) => { const ee = virt.get(vid); if (ee) ee.emit('message', String(data)); };
  const rtcClose = (vid) => { const ee = virt.get(vid); if (ee) { virt.delete(vid); ee.emit('close'); } };
  const rtcMediaPath = (id) => (hub && hub.media.get(id)) || null;
  async function rtcCachePath(id, ext) {
    const dir = hub ? hub.cacheDir : path.join(userDir, 'collab', 'net'); await fsp.mkdir(dir, { recursive: true });
    const p = path.join(dir, `${String(id).replace(/[^\w-]/g, '')}.${String(ext || 'bin').replace(/[^\w]/g, '').slice(0, 8)}`);
    await fsp.writeFile(p, Buffer.alloc(0)); return p;
  }
  function rtcMediaSaved(id, p) { if (!hub) return; hub.media.set(id, p); send('collab:mediaArrived', id, p); broadcast(hub, { t: 'media', id }); }

  return {
    rtcOpen, rtcIn, rtcClose, rtcMediaPath, rtcCachePath, rtcMediaSaved,
    host, join, leave, sendMsg, fetchMedia, upload, discoverStart, discoverStop,
    provideState: (reqId, state) => { if (!hub) return; const f = hub.pendingState.get(reqId); if (f) { hub.pendingState.delete(reqId); f(state); } },
    registerMedia: (id, p) => { if (hub && p) hub.media.set(id, p); },
    info: () => ({ hosting: !!hub, joined: !!client, port: hub ? hub.port : null, pin: hub ? hub.pin : null, addresses: lanAddresses(), peers: hub ? hub.clients.size : null }),
  };
}

module.exports = { create };
