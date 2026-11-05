/* Cutroom — live collaboration for the photo editor (thumbnails, posters…)
   Each layer syncs on its own (pixels, mask, styles, text…); the layer order syncs separately.
   The hub echoes every update to everyone (the sender too), so all copies apply updates in the same order:
   if two people change the same thing at the same moment, the later one wins everywhere — and nobody's new
   layers or deletions are lost. */
(function (C) {
  const N = window.native, P = C.photo, K = C.collab;
  const PS = (C.photoSync = { sigs: new Map(), uid: null, cursors: new Map(), stash: null, applying: false });
  const on = () => K.mode !== 'off';
  const me = () => K.myId && K.myId();
  const skip = new Set(['canvas', 'mask']);
  const metaOf = (L) => { const o = {}; for (const k in L) { if (skip.has(k) || k[0] === '_' || typeof L[k] === 'function') continue; o[k] = L[k]; } return JSON.parse(JSON.stringify(o)); };
  const cid = (c) => (c ? (c._id ?? (c._id = 'r' + Math.random())) : null);
  const sigOf = (L) => ({ meta: JSON.stringify(metaOf(L)), cid: cid(L.canvas), mid: cid(L.mask) });
  const docUid = () => (P.doc ? (P.doc._sid = P.doc._sid || C.uid('pd_')) : null);
  const toPng = (c) => (c ? c.toDataURL('image/png') : null);
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const toCanvas = async (src) => { const im = await loadImg(src); if (!im) return null; const c = P.mk(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; };
  const orderStr = () => (P.doc ? P.doc.layers.map((l) => l.id).join(',') : null);
  const metaStr = () => (P.doc ? JSON.stringify([P.doc.w, P.doc.h, P.doc.name]) : null);
  const remember = () => { PS.sigs.clear(); if (P.doc) for (const L of P.doc.layers) PS.sigs.set(L.id, sigOf(L)); PS.uid = docUid(); PS.meta = metaStr(); PS.order = orderStr(); };
  let seq = 0; const pendL = new Map(); let pendD = null; const dead = new Set(); // tombstones: deleted layers never come back unless someone undoes the delete

  // ---------- sending ----------
  PS.flush = (full = false) => {
    if (!on() || !P.doc || PS.applying) return false;
    if (P._txn) { setTimeout(() => PS.flush(full), 120); return false; }
    const uid = docUid(); if (uid !== PS.uid) full = true;
    let sent = 0; const revive = [];
    for (const L of P.doc.layers) { if (dead.has(L.id)) { dead.delete(L.id); revive.push(L.id); PS.sigs.delete(L.id); } }
    for (const L of P.doc.layers) {
      const s = sigOf(L), old = full ? null : PS.sigs.get(L.id);
      if (old && old.meta === s.meta && old.cid === s.cid && old.mid === s.mid) continue;
      const msg = { t: 'pl', doc: uid, id: L.id, meta: metaOf(L), seq: ++seq };
      if (!old || old.cid !== s.cid) { msg.canvas = toPng(L.canvas); msg.hasCanvas = !!L.canvas; }
      if (!old || old.mid !== s.mid) { msg.mask = toPng(L.mask); msg.hasMask = !!L.mask; }
      N.collabSend(msg); PS.sigs.set(L.id, s); pendL.set(L.id, msg.seq); sent++;
    }
    const order = orderStr(), meta = metaStr();
    if (full || sent || revive.length || order !== PS.order || meta !== PS.meta) {
      const removed = full ? [] : [...PS.sigs.keys()].filter((id) => !P.doc.layers.some((l) => l.id === id));
      for (const id of removed) { PS.sigs.delete(id); dead.add(id); }
      pendD = ++seq;
      N.collabSend({ t: 'pd', doc: uid, w: P.doc.w, h: P.doc.h, title: P.doc.name, order: P.doc.layers.map((l) => l.id), removed, revive, full, seq: pendD });
      PS.order = order; PS.meta = meta; PS.uid = uid;
    }
    return true;
  };
  const flushSoon = C.debounce(() => PS.flush(false), 140);
  C.on('photo:change', () => { if (on() && !PS.applying) flushSoon(); });

  // ---------- receiving (strictly in hub order) ----------
  let queue = Promise.resolve();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  N.onCollab('message', (m) => {
    if (m.t === 'pc') { PS.cursors.set(m.from, { name: m.name, color: m.color, x: m.x, y: m.y, doc: m.doc, layer: m.layer, at: Date.now() }); C.photoUI && C.photoUI.ready && C.photoUI.redraw(); markLayers(); return; }
    if (m.t === 'preq') { if (P.doc && docUid() === m.doc) PS.flush(true); return; }
    if (m.t === 'join' && K.mode === 'host' && P.doc) { setTimeout(() => PS.flush(true), 400); return; }
    if (m.t === 'left') { PS.cursors.delete(m.id); C.photoUI && C.photoUI.ready && C.photoUI.redraw(); return; }
    if (m.t !== 'pl' && m.t !== 'pd') return;
    queue = queue.then(() => handle(m)).catch((e) => console.warn('photo sync', e));
  });
  async function handle(m) {
    const mine = m.from === me();
    if (m.t === 'pl') {
      if (mine) { if (pendL.get(m.id) === m.seq) pendL.delete(m.id); return; }
      const L = { id: m.id, meta: m.meta, skip: pendL.has(m.id) };
      if (m.hasCanvas !== undefined) L.canvas = m.hasCanvas ? await toCanvas(m.canvas) : null;
      if (m.hasMask !== undefined) L.mask = m.hasMask ? await toCanvas(m.mask) : null;
      if (!PS.stash || PS.stash.doc !== m.doc) PS.stash = { doc: m.doc, layers: new Map() };
      const prev = PS.stash.layers.get(m.id) || {}; PS.stash.layers.set(m.id, Object.assign(prev, L, { skip: !!(prev.skip || L.skip) }));
      return;
    }
    // 'pd' — structure
    if (mine) { if (pendD === m.seq) pendD = null; return; }
    while (P._txn) await wait(60);       // let the local user finish their stroke first
    PS.flush(false);                     // send anything local first, so nothing gets overwritten silently
    const sameDoc = P.doc && docUid() === m.doc;
    const st = PS.stash && PS.stash.doc === m.doc ? PS.stash.layers : new Map(); PS.stash = null;
    if (!sameDoc && !m.full) { N.collabSend({ t: 'preq', doc: m.doc }); return; }
    PS.applying = true;
    try {
      const local = new Map(sameDoc ? P.doc.layers.map((l) => [l.id, l]) : []);
      for (const id of m.revive || []) dead.delete(id);
      for (const id of m.removed || []) dead.add(id);
      const removed = dead;
      const forced = new Set();
      const upd = (L, inc) => {
        if (!inc) return L;
        if (inc.skip || pendL.has(L.id)) { if ('canvas' in inc || 'mask' in inc) forced.add(L.id); return L; } // my newer change wins → resend it in full
        const keepCanvas = L.canvas, keepMask = L.mask;
        for (const k of Object.keys(L)) if (!skip.has(k) && k[0] !== '_' && !(k in inc.meta)) delete L[k];
        Object.assign(L, inc.meta);
        L.canvas = 'canvas' in inc ? inc.canvas : keepCanvas; L.mask = 'mask' in inc ? inc.mask : keepMask;
        delete L._stroke; return L;
      };
      let layers;
      // safety net: a pixel layer without pixels means we missed data — ask for a full copy instead of breaking
      const broken = () => layers.some((L) => L.type === 'raster' && !L.canvas);
      if (!sameDoc) layers = m.order.map((id) => (st.has(id) ? upd(P.layer({ id }), st.get(id)) : null)).filter(Boolean);
      else {
        // my own structure change is still in flight → it lands after this one, so keep my order; otherwise take theirs
        const base = pendD ? P.doc.layers.map((l) => l.id) : m.order;
        const ids = base.filter((id) => !removed.has(id)); // a deletion always wins
        // keep layers I have that they didn't know about (e.g. just added by me)
        if (!pendD) P.doc.layers.forEach((l, i) => { if (!ids.includes(l.id) && !removed.has(l.id) && !(m.order || []).includes(l.id)) { const prev = i > 0 ? ids.indexOf(P.doc.layers[i - 1].id) : -1; ids.splice(prev + 1, 0, l.id); } });
        // add layers they created that I don't have yet
        m.order.forEach((id, i) => { if (!ids.includes(id) && st.has(id) && !removed.has(id)) { const prev = i > 0 ? ids.indexOf(m.order[i - 1]) : -1; ids.splice(prev + 1, 0, id); } });
        layers = ids.map((id) => { const inc = st.get(id); const L = local.get(id) || (inc && (inc.meta.type !== 'raster' || inc.canvas) ? P.layer({ id }) : null); return L ? upd(L, inc) : null; }).filter(Boolean);
      }
      if (broken()) { layers = layers.filter((L) => !(L.type === 'raster' && !L.canvas)); setTimeout(() => N.collabSend({ t: 'preq', doc: m.doc }), 50); }
      if (!sameDoc) {
        const had = !!P.doc;
        P.doc = { w: m.w, h: m.h, name: m.title, path: null, layers, active: (layers[layers.length - 1] || {}).id, _sid: m.doc };
        P.undo = []; P.redo = []; P.sel = null; P.ui.editMask = null; pendL.clear(); pendD = null; dead.clear();
        if (C.mode === 'photo') C.toast(`${m.name} shared “${m.title || 'Untitled'}” — you're editing it together`, 'info', 3500);
        else if (had || m.full) C.toast(`${m.name} shared an image — switch to 🖼️ Photo to edit it together`, 'info', 4000);
      } else {
        P.doc.layers = layers;
        if (!pendD) { P.doc.w = m.w; P.doc.h = m.h; P.doc.name = m.title; }
        if (!layers.some((l) => l.id === P.doc.active)) P.doc.active = (layers[layers.length - 1] || {}).id;
      }
      // what we now show is in sync (except our own in-flight changes, which stay pending)
      for (const L of P.doc.layers) PS.sigs.set(L.id, sigOf(L));
      for (const id of [...PS.sigs.keys()]) if (!P.doc.layers.some((l) => l.id === id)) PS.sigs.delete(id);
      for (const id of forced) { const sg = PS.sigs.get(id); if (sg) { sg.cid = 'force'; sg.mid = 'force'; } }
      PS.uid = docUid(); PS.meta = metaStr(); PS.order = orderStr();
      P._compDirty = true; P.changed(true);
      if (forced.size) setTimeout(() => PS.flush(false), 30);
      if (!sameDoc && C.mode === 'photo' && C.photoUI && C.photoUI.ready && C.photoUI.fit) C.photoUI.fit();
    } finally { PS.applying = false; }
  }

  // ---------- presence: live cursors & who's on which layer ----------
  const sendCursor = C.throttle((x, y) => { if (on() && P.doc) N.collabSend({ t: 'pc', doc: docUid(), x, y, layer: P.doc.active }); }, 70);
  PS.init = () => {
    const view = C.$('#phView'); if (!view || PS._wired) return; PS._wired = true;
    view.addEventListener('pointermove', (e) => { if (!on() || !P.doc) return; const r = view.getBoundingClientRect(); const v = C.photoUI.view; sendCursor((e.clientX - r.left - v.ox) / v.z, (e.clientY - r.top - v.oy) / v.z); });
    view.addEventListener('pointerleave', () => { if (on() && P.doc) N.collabSend({ t: 'pc', doc: docUid(), x: null, y: null, layer: P.doc.active }); });
    C.photoUI.overlayHooks.push((ox) => {
      if (!on() || !P.doc) return; const uid = docUid(); const now = Date.now();
      for (const [, c] of PS.cursors) {
        if (c.doc !== uid || c.x == null || now - c.at > 15000) continue;
        const [a, b] = C.photoUI.toScr(c.x, c.y);
        ox.save(); ox.fillStyle = c.color; ox.strokeStyle = '#000'; ox.lineWidth = 1.2;
        ox.beginPath(); ox.moveTo(a, b); ox.lineTo(a + 3, b + 15); ox.lineTo(a + 7, b + 10); ox.lineTo(a + 13, b + 12); ox.closePath(); ox.fill(); ox.stroke();
        ox.font = '600 11px Segoe UI, sans-serif'; const w = ox.measureText(c.name).width + 12; ox.beginPath(); ox.roundRect(a + 12, b + 14, w, 18, 9); ox.fill();
        ox.fillStyle = '#0b0c10'; ox.fillText(c.name, a + 18, b + 27); ox.restore();
      }
    });
  };
  function markLayers() {
    const box = C.$('#phLayers'); if (!box || !P.doc) return; const uid = docUid();
    box.querySelectorAll('.ph-peer').forEach((e) => e.remove());
    for (const [, c] of PS.cursors) {
      if (c.doc !== uid || !c.layer) continue; const row = box.querySelector(`.ph-lrow[data-id="${c.layer}"]`); if (!row) continue;
      row.appendChild(C.h(`<span class="ph-peer" title="${C.esc(c.name)} is on this layer" style="background:${c.color}">${C.esc((c.name || '?')[0].toUpperCase())}</span>`));
    }
  }
  C.on('photo:change', () => setTimeout(markLayers, 80));

  C.on('collab', () => {
    pendL.clear(); pendD = null; dead.clear();
    if (!on()) { PS.cursors.clear(); remember(); return; }
    remember();
    if (K.mode === 'host' && P.doc) setTimeout(() => PS.flush(true), 200);
    if (K.mode === 'guest') PS.uid = null; // the host sends its image; ours is shared on our first edit
  });
})(window.C);
