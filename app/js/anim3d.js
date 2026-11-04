/* Cutroom Animate 3D — 3D layers: rigged models (GLB / glTF / FBX / OBJ), bone posing, keyframes, camera, embedded clips */
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from '../vendor/three/addons/loaders/FBXLoader.js';
import { OBJLoader } from '../vendor/three/addons/loaders/OBJLoader.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { TransformControls } from '../vendor/three/addons/controls/TransformControls.js';

const C = window.C, N = window.native;
const T3 = (C.anim3d = { THREE, ready: true });
const RT = new Map(); // layer id -> runtime { scene, cam, models: Map, lights, ground }
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const uid = () => 'M' + Math.random().toString(36).slice(2, 9);

// ================= data =================
T3.newLayerData = () => ({ models: [], cam: { base: { p: [0, 1.35, 4.6], t: [0, 0.95, 0], fov: 38 }, kf: [] }, light: 'studio', ground: true, autoKey: true });
const bonesOf = (root) => { const out = []; root.traverse((o) => { if (o.isBone || o.userData.isRigBone) out.push(o); }); return out; };

// ================= built-in mannequin rig =================
function mannequin() {
  const root = new THREE.Group(); root.name = 'Mannequin';
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9dde6, roughness: 0.55, metalness: 0.05 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x19d3c5, roughness: 0.35, metalness: 0.2 });
  const bone = (name, parent, pos) => { const b = new THREE.Bone(); b.name = name; b.position.set(...pos); b.userData.isRigBone = true; parent.add(b); return b; };
  const limb = (b, len, r, dir = -1) => { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 6, 14); const m = new THREE.Mesh(g, skin); m.position.y = (dir * len) / 2; m.castShadow = true; b.add(m); const s = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 14, 10), joint); s.castShadow = true; b.add(s); };
  const hips = bone('hips', root, [0, 0.98, 0]);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.18, 2, 2, 2), skin); pelvis.castShadow = true; hips.add(pelvis);
  const spine = bone('spine', hips, [0, 0.08, 0]); limb(spine, 0.22, 0.11, 1);
  const chest = bone('chest', spine, [0, 0.22, 0]); const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.12, 6, 14), skin); torso.scale.set(1.15, 1, 0.75); torso.position.y = 0.12; torso.castShadow = true; chest.add(torso);
  const neck = bone('neck', chest, [0, 0.3, 0]); limb(neck, 0.1, 0.05, 1);
  const head = bone('head', neck, [0, 0.1, 0]); const hm = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), skin); hm.scale.set(0.92, 1.12, 1); hm.position.y = 0.11; hm.castShadow = true; head.add(hm);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 10), joint); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.1, 0.11); head.add(nose);
  for (const s of [1, -1]) {
    const n = s > 0 ? 'l' : 'r';
    const sh = bone(n + '_shoulder', chest, [0.2 * s, 0.25, 0]);
    const ua = bone(n + '_upperarm', sh, [0.03 * s, 0, 0]); ua.rotation.z = s * 1.32; limb(ua, 0.28, 0.05);
    const fa = bone(n + '_forearm', ua, [0, -0.28, 0]); limb(fa, 0.26, 0.043);
    const hd = bone(n + '_hand', fa, [0, -0.26, 0]); const hm2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.035), skin); hm2.position.y = -0.05; hm2.castShadow = true; hd.add(hm2);
    const th = bone(n + '_thigh', hips, [0.1 * s, -0.04, 0]); limb(th, 0.44, 0.07);
    const sn = bone(n + '_shin', th, [0, -0.44, 0]); limb(sn, 0.42, 0.055);
    const ft = bone(n + '_foot', sn, [0, -0.42, 0]); const fm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.22), skin); fm.position.set(0, -0.03, 0.06); fm.castShadow = true; ft.add(fm);
  }
  return root;
}

// ================= loading =================
const loadingManager = (dir) => { const m = new THREE.LoadingManager(); m.setURLModifier((url) => { if (/^(app|data|blob|https?):/i.test(url)) return url; const sep = dir.includes('\\') ? '\\' : '/'; return N.mediaUrl(dir + sep + decodeURIComponent(url).replace(/^\.\//, '').replace(/[\\/]/g, sep)); }); return m; };
async function loadModel(src) {
  if (src === 'builtin:mannequin') return { root: mannequin(), clips: [] };
  const ext = (src.split('.').pop() || '').toLowerCase(); const dir = src.replace(/[\\/][^\\/]*$/, ''); const mgr = loadingManager(dir);
  const buf = await (await fetch(N.mediaUrl(src))).arrayBuffer();
  if (ext === 'glb' || ext === 'gltf') { const g = await new Promise((res, rej) => new GLTFLoader(mgr).parse(ext === 'gltf' ? new TextDecoder().decode(buf) : buf, '', res, rej)); return { root: g.scene, clips: g.animations || [] }; }
  if (ext === 'fbx') { const o = new FBXLoader(mgr).parse(buf, ''); return { root: o, clips: o.animations || [] }; }
  if (ext === 'obj') { const o = new OBJLoader(mgr).parse(new TextDecoder().decode(buf)); o.traverse((m) => { if (m.isMesh && (!m.material || m.material.type === 'MeshPhongMaterial')) m.material = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, roughness: 0.6 }); }); return { root: o, clips: [] }; }
  throw new Error('Unsupported 3D file — use .glb, .gltf, .fbx or .obj');
}
function normalise(root) {
  // scale & centre so the model stands on the ground about 1.8 units tall
  const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3()); const h = Math.max(size.x, size.y, size.z) || 1;
  const k = 1.8 / h; const wrap = new THREE.Group(); wrap.add(root); root.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(wrap); const c = b2.getCenter(new THREE.Vector3()); root.position.x -= c.x; root.position.z -= c.z; root.position.y -= b2.min.y;
  return wrap;
}

// ================= runtime =================
function runtime(L) {
  let r = RT.get(L.id); if (r) return r;
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 500);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445066, 1.4); const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 }); key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.0); rim.position.set(-4, 3, -3);
  scene.add(hemi, key, rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.ShadowMaterial({ opacity: 0.28 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(8, 16, 0x19d3c5, 0x3a3f4b); grid.material.opacity = 0.35; grid.material.transparent = true; grid.layers.set(1); scene.add(grid);
  const helpers = new THREE.Group(); helpers.layers.set(1); scene.add(helpers);
  r = { scene, cam, models: new Map(), hemi, key, rim, ground, grid, helpers };
  RT.set(L.id, r); return r;
}
const LIGHTS = { studio: [0xffffff, 0x445066, 1.4, 0xffffff, 2.2, 0x9fd8ff, 1.0], sunset: [0xffd6a6, 0x3a2340, 1.1, 0xff9a5c, 2.6, 0x6a8cff, 1.2], night: [0x6a7cff, 0x0b0d1a, 0.6, 0xbfd0ff, 1.2, 0x19d3c5, 1.6], neon: [0xff4fd8, 0x1a0a2a, 0.9, 0x19d3c5, 2.0, 0xff3d9a, 2.0], soft: [0xffffff, 0xd8dde6, 2.2, 0xffffff, 0.8, 0xffffff, 0.3] };
function applyLights(r, L) { const v = LIGHTS[L.scene.light] || LIGHTS.studio; r.hemi.color.setHex(v[0]); r.hemi.groundColor.setHex(v[1]); r.hemi.intensity = v[2]; r.key.color.setHex(v[3]); r.key.intensity = v[4]; r.rim.color.setHex(v[5]); r.rim.intensity = v[6]; r.ground.visible = L.scene.ground !== false; }
T3.sync = async (L) => {
  const r = runtime(L); const want = new Set(L.scene.models.map((m) => m.id));
  for (const [id, rm] of r.models) if (!want.has(id)) { r.scene.remove(rm.obj); r.models.delete(id); }
  for (const m of L.scene.models) {
    if (r.models.has(m.id)) continue;
    const rm = { loading: true, obj: new THREE.Group(), bones: new Map(), clips: [], mixer: null }; r.models.set(m.id, rm); r.scene.add(rm.obj);
    try {
      const { root, clips } = await loadModel(m.src); const wrap = normalise(root); rm.obj.add(wrap);
      wrap.traverse((o) => { if (o.isMesh) { if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.castShadow = true; o.receiveShadow = true; if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
      for (const b of bonesOf(wrap)) { b.userData.rest = b.quaternion.clone(); b.userData.restPos = b.position.clone(); rm.bones.set(b.name || b.uuid, b); }
      rm.clips = clips; rm.mixer = clips.length ? new THREE.AnimationMixer(wrap) : null; rm.actions = new Map(); rm.loading = false;
      m.bonesCount = rm.bones.size; m.clipNames = clips.map((c) => c.name || 'Animation');
    } catch (e) { rm.loading = false; rm.error = e.message; C.toast('Could not load 3D model: ' + e.message, 'err'); }
    C.anim && C.anim.changed(true);
  }
};

// ================= keyframes =================
const keyAround = (arr, f) => { if (!arr || !arr.length) return null; if (f <= arr[0].f) return [arr[0], arr[0], 0]; const last = arr[arr.length - 1]; if (f >= last.f) return [last, last, 0]; let i = 0; while (arr[i + 1].f < f) i++; const a = arr[i], b = arr[i + 1]; return [a, b, ease((f - a.f) / (b.f - a.f))]; };
const putKey = (arr, f, v) => { const k = arr.find((x) => x.f === f); if (k) Object.assign(k, v); else { arr.push(Object.assign({ f }, v)); arr.sort((a, b) => a.f - b.f); } };
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
function applyFrame(L, f) {
  const r = runtime(L); const fps = (C.anim.doc && C.anim.doc.fps) || 12; applyLights(r, L);
  for (const m of L.scene.models) {
    const rm = r.models.get(m.id); if (!rm || rm.loading || rm.error) continue;
    const base = m.base || (m.base = { p: [0, 0, 0], r: [0, 0, 0], s: 1 });
    const ok = keyAround(m.kf, f);
    if (ok) { const [a, b, t] = ok; rm.obj.position.set(...a.p.map((v, i) => v + (b.p[i] - v) * t)); qa.fromArray(a.q); qb.fromArray(b.q); rm.obj.quaternion.slerpQuaternions(qa, qb, t); rm.obj.scale.setScalar(a.s + (b.s - a.s) * t); }
    else { rm.obj.position.set(...base.p); rm.obj.rotation.set(...base.r.map((d) => (d * Math.PI) / 180)); rm.obj.scale.setScalar(base.s); }
    rm.obj.visible = m.visible !== false;
    // embedded animation clip
    if (rm.mixer && m.clip != null && rm.clips[m.clip]) {
      const clip = rm.clips[m.clip]; let act = rm.actions.get(m.clip); if (!act) { act = rm.mixer.clipAction(clip); rm.actions.set(m.clip, act); }
      rm.mixer.stopAllAction(); act.reset().play(); const t = ((f / fps) * (m.speed || 1) + (m.offset || 0)); act.time = m.loop === false ? Math.min(clip.duration, t) : ((t % clip.duration) + clip.duration) % clip.duration; rm.mixer.update(0);
    } else {
      if (rm.mixer) rm.mixer.stopAllAction();
      for (const [name, b] of rm.bones) {
        const arr = m.pose && m.pose[name]; const k = keyAround(arr, f);
        if (k) { const [a, bb, t] = k; qa.fromArray(a.q); qb.fromArray(bb.q); b.quaternion.slerpQuaternions(qa, qb, t); } else b.quaternion.copy(b.userData.rest);
        const parr = m.posePos && m.posePos[name]; const kp = keyAround(parr, f); if (kp) { const [a, bb, t] = kp; b.position.set(...a.p.map((v, i) => v + (bb.p[i] - v) * t)); } else if (b.userData.restPos) b.position.copy(b.userData.restPos);
      }
    }
  }
  const ck = keyAround(L.scene.cam.kf, f); const cb = L.scene.cam.base;
  const p = ck ? ck[0].p.map((v, i) => v + (ck[1].p[i] - v) * ck[2]) : cb.p, tg = ck ? ck[0].t.map((v, i) => v + (ck[1].t[i] - v) * ck[2]) : cb.t, fov = ck ? ck[0].fov + (ck[1].fov - ck[0].fov) * ck[2] : cb.fov;
  r.cam.position.set(...p); r.cam.fov = fov; r.cam.lookAt(...tg); r.cam.updateProjectionMatrix(); r.camTarget = tg;
}
T3.hasKeyAt = (L, f) => L.scene.cam.kf.some((k) => k.f === f) || L.scene.models.some((m) => (m.kf || []).some((k) => k.f === f) || Object.values(m.pose || {}).some((arr) => arr.some((k) => k.f === f)));
T3.keyFrames = (L) => { const s = new Set(); L.scene.cam.kf.forEach((k) => s.add(k.f)); for (const m of L.scene.models) { (m.kf || []).forEach((k) => s.add(k.f)); Object.values(m.pose || {}).forEach((arr) => arr.forEach((k) => s.add(k.f))); } return [...s]; };

// ================= offscreen render (composite / export) =================
let outR = null;
T3.render = (L, f, w, h) => {
  if (!outR) { outR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); outR.shadowMap.enabled = true; outR.shadowMap.type = THREE.PCFSoftShadowMap; outR.outputColorSpace = THREE.SRGBColorSpace; outR.toneMapping = THREE.ACESFilmicToneMapping; }
  const r = runtime(L); if (!RT.get(L.id).synced) { RT.get(L.id).synced = true; T3.sync(L); }
  applyFrame(L, f); const W = Math.round(w), H = Math.round(h);
  if (outR.domElement.width !== W || outR.domElement.height !== H) outR.setSize(W, H, false);
  r.cam.aspect = W / H; r.cam.updateProjectionMatrix(); r.cam.layers.set(0);
  outR.setClearColor(0x000000, 0); outR.render(r.scene, r.cam); return outR.domElement;
};

// ================= interactive editing overlay =================
let ed = null; // { L, renderer, canvas, orbit, gizmo, sel: {model, bone}, mode }
function ensureEditor(host) {
  if (ed) { if (ed.canvas.parentNode !== host) host.appendChild(ed.canvas); return ed; }
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement; canvas.className = 'an3d-cv'; host.appendChild(canvas);
  ed = { renderer, canvas, sel: null, mode: 'rotate', target: 'bone' };
  canvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPick(e); });
  canvas.addEventListener('wheel', (e) => e.stopPropagation());
  return ed;
}
function bindLayer(L) {
  const r = runtime(L);
  if (ed.L === L && ed.r === r) return;
  if (ed.orbit) ed.orbit.dispose(); if (ed.gizmo) { ed.gizmo.detach(); ed.gizmoHelper && ed.gizmoHelper.parent && ed.gizmoHelper.parent.remove(ed.gizmoHelper); ed.gizmo.dispose(); }
  ed.L = L; ed.r = r; ed.sel = null;
  ed.orbit = new OrbitControls(r.cam, ed.canvas); ed.orbit.enableDamping = false;
  ed.orbit.addEventListener('start', () => { ed.orbitActive = true; });
  ed.orbit.addEventListener('change', () => C.anim.redraw());
  ed.orbit.addEventListener('end', () => { commitCam(); ed.orbitActive = false; });
  ed.gizmo = new TransformControls(r.cam, ed.canvas); ed.gizmo.setSize(0.8); ed.gizmo.setSpace('local');
  ed.gizmoHelper = ed.gizmo.getHelper ? ed.gizmo.getHelper() : ed.gizmo; r.scene.add(ed.gizmoHelper); ed.gizmoHelper.traverse((o) => o.layers.set(1));
  ed.gizmo.addEventListener('dragging-changed', (e) => { ed.orbit.enabled = !e.value; if (!e.value) commitGizmo(); });
  ed.gizmo.addEventListener('change', () => C.anim.redraw());
}
const snapCam = () => ({ p: ed.r.cam.position.toArray(), t: ed.orbit.target.toArray(), fov: ed.r.cam.fov });
function commitCam() {
  const L = ed.L, f = C.anim.doc.cur, now = snapCam();
  C.anim.act('Move 3D camera', () => { if (L.scene.cam.kf.length || (L.scene.autoKey && f > 0)) { if (!L.scene.cam.kf.length) putKey(L.scene.cam.kf, 0, JSON.parse(JSON.stringify(L.scene.cam.base))); putKey(L.scene.cam.kf, f, now); } else L.scene.cam.base = now; });
}
function commitGizmo() {
  const L = ed.L, f = C.anim.doc.cur, s = ed.sel; if (!s) return; const m = L.scene.models.find((x) => x.id === s.model); if (!m) return; const rm = ed.r.models.get(m.id);
  C.anim.act(s.bone ? 'Pose bone' : 'Move model', () => {
    if (s.bone) {
      const b = rm.bones.get(s.bone); m.pose = m.pose || {}; const arr = (m.pose[s.bone] = m.pose[s.bone] || []);
      if (!arr.length && f > 0) putKey(arr, 0, { q: b.userData.rest.toArray() });
      putKey(arr, f, { q: b.quaternion.toArray() });
      if (ed.mode === 'translate') { m.posePos = m.posePos || {}; const pa = (m.posePos[s.bone] = m.posePos[s.bone] || []); if (!pa.length && f > 0) putKey(pa, 0, { p: b.userData.restPos.toArray() }); putKey(pa, f, { p: b.position.toArray() }); }
    } else {
      const v = { p: rm.obj.position.toArray(), q: rm.obj.quaternion.toArray(), s: rm.obj.scale.x };
      m.kf = m.kf || []; if (m.kf.length || (L.scene.autoKey && f > 0)) { if (!m.kf.length) { const b0 = m.base || { p: [0, 0, 0], r: [0, 0, 0], s: 1 }; putKey(m.kf, 0, { p: b0.p.slice(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...b0.r.map((d) => (d * Math.PI) / 180))).toArray(), s: b0.s }); } putKey(m.kf, f, v); }
      else { const e = new THREE.Euler().setFromQuaternion(rm.obj.quaternion); m.base = { p: v.p, r: [e.x, e.y, e.z].map((x) => (x * 180) / Math.PI), s: v.s }; }
    }
  });
}
function rebuildHelpers() {
  const r = ed.r; r.helpers.clear();
  const geo = new THREE.SphereGeometry(1, 12, 8);
  for (const [id, rm] of r.models) {
    if (rm.loading || rm.error) continue;
    for (const [name, b] of rm.bones) {
      const on = ed.sel && ed.sel.model === id && ed.sel.bone === name;
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: on ? 0xffd84d : 0x19d3c5, depthTest: false, transparent: true, opacity: on ? 1 : 0.85 }));
      m.renderOrder = 999; m.layers.set(1); m.userData = { model: id, bone: name, b }; r.helpers.add(m);
    }
  }
}
function positionHelpers() {
  const r = ed.r; const v = new THREE.Vector3();
  for (const h of r.helpers.children) { h.userData.b.getWorldPosition(v); h.position.copy(v); const d = r.cam.position.distanceTo(v); h.scale.setScalar(d * 0.012); }
}
function onPick(e) {
  if (ed.gizmo.dragging || ed.gizmo.axis) return;
  const rect = ed.canvas.getBoundingClientRect(); const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.layers.enableAll(); rc.setFromCamera(ndc, ed.r.cam); rc.params.Points = { threshold: 0.05 };
  const hb = rc.intersectObjects(ed.r.helpers.children, false)[0];
  if (hb && ed.target !== 'model') return T3.select({ model: hb.object.userData.model, bone: hb.object.userData.bone });
  const objs = [...ed.r.models.values()].map((m) => m.obj); const hit = rc.intersectObjects(objs, true)[0];
  if (hit) { let o = hit.object; let id = null; for (const [mid, rm] of ed.r.models) { let p = o; while (p) { if (p === rm.obj) { id = mid; break; } p = p.parent; } if (id) break; } if (id) return T3.select({ model: id, bone: null }); }
  if (!e.shiftKey) { /* empty click keeps selection so orbiting doesn't drop it */ }
}
T3.select = (sel) => {
  ed.sel = sel; const rm = sel && ed.r.models.get(sel.model);
  if (!sel || !rm) ed.gizmo.detach();
  else { ed.gizmo.attach(sel.bone ? rm.bones.get(sel.bone) : rm.obj); ed.gizmo.setMode(sel.bone && ed.mode === 'scale' ? 'rotate' : ed.mode); }
  rebuildHelpers(); C.anim.changed(true);
};
T3.setMode = (m) => { if (!ed) return; ed.mode = m; if (ed.sel) ed.gizmo.setMode(ed.sel.bone && m === 'scale' ? 'rotate' : m); C.anim.changed(true); };
T3.setTarget = (t) => { if (!ed) return; ed.target = t; if (t === 'model' && ed.sel && ed.sel.bone) T3.select({ model: ed.sel.model, bone: null }); C.anim.changed(true); };
T3.editState = () => (ed ? { mode: ed.mode, target: ed.target, sel: ed.sel } : null);
// called by the 2D stage every draw
T3.edit = (L, host, rect, f) => {
  if (!L) { if (ed) ed.canvas.style.display = 'none'; return; }
  ensureEditor(host); bindLayer(L); const r = ed.r;
  if (!r.synced) { r.synced = true; T3.sync(L).then(() => { rebuildHelpers(); C.anim.redraw(); }); }
  ed.canvas.style.display = 'block'; Object.assign(ed.canvas.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
  const dpr = Math.min(2, devicePixelRatio || 1); const W = Math.max(2, Math.round(rect.w * dpr)), H = Math.max(2, Math.round(rect.h * dpr));
  if (ed.canvas.width !== W || ed.canvas.height !== H) ed.renderer.setSize(W, H, false);
  if (!ed.gizmo.dragging && !ed.orbitActive) { applyFrame(L, f); ed.orbit.target.set(...(r.camTarget || [0, 1, 0])); ed.orbit.update(); } r.cam.aspect = rect.w / rect.h; r.cam.updateProjectionMatrix();
  if (r.helpers.children.length === 0) rebuildHelpers(); positionHelpers();
  r.cam.layers.enableAll(); ed.renderer.setClearColor(0x000000, 0); ed.renderer.render(r.scene, r.cam); r.cam.layers.set(0);
};
T3.invalidate = () => { if (ed) ed.lastF = -1; };

// ================= actions used by the panel =================
T3.addModel = async (L, src, name) => {
  const m = { id: uid(), name: name || (src === 'builtin:mannequin' ? 'Mannequin' : src.split(/[\\/]/).pop()), src, base: { p: [(L.scene.models.length % 2 ? -1 : 1) * Math.ceil(L.scene.models.length / 2) * 1.1, 0, 0], r: [0, 0, 0], s: 1 }, kf: [], pose: {}, posePos: {}, clip: null, speed: 1, offset: 0, visible: true };
  C.anim.act('Add 3D model', () => L.scene.models.push(m));
  await T3.sync(L); if (ed && ed.L === L) { rebuildHelpers(); T3.select({ model: m.id, bone: null }); }
  if (m.clipNames && m.clipNames.length) C.toast(`Loaded ${m.name} · ${m.bonesCount} bones · ${m.clipNames.length} built-in animation${m.clipNames.length > 1 ? 's' : ''}`, 'ok', 3000);
  else C.toast(`Loaded ${m.name}${m.bonesCount ? ` · ${m.bonesCount} bones — click a joint to pose it` : ''}`, 'ok', 2600);
  return m;
};
T3.importFile = async (L) => {
  const p = await N.fileOpenDialog({ title: 'Import a 3D model or rig', exts: ['glb', 'gltf', 'fbx', 'obj'], extName: '3D models (GLB, glTF, FBX, OBJ)' }); if (!p) return;
  return T3.addModel(L, p);
};
T3.removeModel = (L, id) => { C.anim.act('Remove 3D model', () => { L.scene.models = L.scene.models.filter((m) => m.id !== id); }); T3.sync(L); if (ed) { ed.sel = null; ed.gizmo.detach(); rebuildHelpers(); } };
T3.keyPose = (L, mid) => {
  const r = runtime(L); const m = L.scene.models.find((x) => x.id === mid); const rm = r.models.get(mid); if (!m || !rm) return; const f = C.anim.doc.cur;
  C.anim.act('Key full pose', () => { m.pose = m.pose || {}; for (const [name, b] of rm.bones) { const arr = (m.pose[name] = m.pose[name] || []); putKey(arr, f, { q: b.quaternion.toArray() }); } });
};
T3.resetPose = (L, mid) => {
  const r = runtime(L); const m = L.scene.models.find((x) => x.id === mid); const rm = r.models.get(mid); if (!m || !rm) return; const f = C.anim.doc.cur;
  C.anim.act('Reset pose', () => { for (const [name, b] of rm.bones) { if (!m.pose[name] || !m.pose[name].length) continue; putKey(m.pose[name], f, { q: b.userData.rest.toArray() }); } }); T3.invalidate();
};
T3.clearKeys = (L, mid) => { const m = L.scene.models.find((x) => x.id === mid); if (!m) return; C.anim.act('Clear 3D keyframes', () => { m.pose = {}; m.posePos = {}; m.kf = []; }); T3.invalidate(); };
// procedural walk cycle for the mannequin (or any rig with similar bone names)
const BONE_ALIASES = { l_thigh: ['l_thigh', 'mixamorig:LeftUpLeg', 'LeftUpLeg', 'thigh_l', 'Thigh_L'], r_thigh: ['r_thigh', 'mixamorig:RightUpLeg', 'RightUpLeg', 'thigh_r', 'Thigh_R'], l_shin: ['l_shin', 'mixamorig:LeftLeg', 'LeftLeg', 'calf_l', 'Shin_L'], r_shin: ['r_shin', 'mixamorig:RightLeg', 'RightLeg', 'calf_r', 'Shin_R'], l_upperarm: ['l_upperarm', 'mixamorig:LeftArm', 'LeftArm', 'upperarm_l'], r_upperarm: ['r_upperarm', 'mixamorig:RightArm', 'RightArm', 'upperarm_r'], l_forearm: ['l_forearm', 'mixamorig:LeftForeArm', 'LeftForeArm', 'lowerarm_l'], r_forearm: ['r_forearm', 'mixamorig:RightForeArm', 'RightForeArm', 'lowerarm_r'], hips: ['hips', 'mixamorig:Hips', 'Hips', 'pelvis'], head: ['head', 'mixamorig:Head', 'Head'] };
const findBone = (rm, key) => { for (const n of BONE_ALIASES[key] || [key]) if (rm.bones.has(n)) return n; return null; };
T3.generate = (L, mid, kind) => {
  const r = runtime(L); const m = L.scene.models.find((x) => x.id === mid); const rm = r.models.get(mid); if (!m || !rm) return;
  const d = C.anim.doc; const f0 = d.cur; const cyc = Math.max(8, Math.round(d.fps * (kind === 'walk' ? 1.0 : kind === 'wave' ? 1.2 : 0.8)));
  const n = (key) => findBone(rm, key); if (!n('l_thigh') && kind !== 'wave') return C.toast("Couldn't find leg bones on this rig — pose it by clicking joints instead", 'info', 3500);
  const rot = (name, f, ex, ey = 0, ez = 0) => { if (!name) return; const b = rm.bones.get(name); const q = b.userData.rest.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(ex, ey, ez))); m.pose[name] = m.pose[name] || []; putKey(m.pose[name], f, { q: q.toArray() }); };
  C.anim.act(kind === 'walk' ? 'Walk cycle' : kind === 'wave' ? 'Wave' : 'Jump', () => {
    m.pose = m.pose || {}; m.clip = null;
    const loops = Math.max(1, Math.floor((d.length - f0) / cyc));
    for (let l = 0; l < loops; l++) for (let i = 0; i <= 4; i++) {
      const f = f0 + l * cyc + Math.round((i * cyc) / 4); if (f >= d.length) break; const ph = (i / 4) * Math.PI * 2;
      if (kind === 'walk') {
        const s = Math.sin(ph); rot(n('l_thigh'), f, -0.5 * s); rot(n('r_thigh'), f, 0.5 * s); rot(n('l_shin'), f, Math.max(0, 0.8 * Math.sin(ph + 1.2))); rot(n('r_shin'), f, Math.max(0, -0.8 * Math.sin(ph + 1.2)));
        rot(n('l_upperarm'), f, 0.45 * s); rot(n('r_upperarm'), f, -0.45 * s); rot(n('l_forearm'), f, -0.3); rot(n('r_forearm'), f, -0.3);
        const hp = n('hips'); if (hp) { const b = rm.bones.get(hp); m.posePos = m.posePos || {}; m.posePos[hp] = m.posePos[hp] || []; putKey(m.posePos[hp], f, { p: b.userData.restPos.clone().add(new THREE.Vector3(0, Math.abs(Math.cos(ph)) * 0.035 * (b.userData.restPos.y > 5 ? 50 : 1), 0)).toArray() }); }
      } else if (kind === 'wave') {
        const ua = n('r_upperarm') || n('l_upperarm'), fa = n('r_forearm') || n('l_forearm'); rot(ua, f, 0, 0, i % 2 ? 1.1 : 1.0); rot(fa, f, 0, 0, i % 2 ? 0.9 : 0.3); rot(n('head'), f, 0, 0, i % 2 ? 0.08 : -0.08);
      } else {
        const crouch = i === 0 || i === 4 ? 0 : i === 1 ? 0.7 : 0; rot(n('l_thigh'), f, -crouch); rot(n('r_thigh'), f, -crouch); rot(n('l_shin'), f, crouch * 1.6); rot(n('r_shin'), f, crouch * 1.6); rot(n('l_upperarm'), f, i === 2 ? -2.6 : 0.3); rot(n('r_upperarm'), f, i === 2 ? -2.6 : 0.3);
        const hp = n('hips'); if (hp) { const b = rm.bones.get(hp); const unit = b.userData.restPos.y > 5 ? 50 : 1; m.posePos = m.posePos || {}; m.posePos[hp] = m.posePos[hp] || []; putKey(m.posePos[hp], f, { p: b.userData.restPos.clone().add(new THREE.Vector3(0, (i === 2 ? 0.45 : i === 1 ? -0.18 : 0) * unit, 0)).toArray() }); }
      }
    }
  });
  T3.invalidate(); C.toast(kind === 'walk' ? 'Walk cycle keyed — move the model with keyframes to make it travel' : kind === 'wave' ? 'Wave keyed' : 'Jump keyed', 'ok', 2600);
};

// ================= side panel =================
T3.panel = (box, L) => {
  const sc = L.scene; const st = T3.editState() || { mode: 'rotate', target: 'bone', sel: null }; const r = RT.get(L.id);
  const selM = st.sel && sc.models.find((m) => m.id === st.sel.model);
  box.innerHTML = `<div class="section-title">${C.icon('cube')} ${C.esc(L.name)}</div>
    <div class="an3d-modes"><div class="seg" data-g="target">${[['bone', 'Bones'], ['model', 'Model']].map(([k, l]) => `<button data-v="${k}" class="${st.target === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="seg" data-g="mode">${[['rotate', 'Rotate'], ['translate', 'Move'], ['scale', 'Scale']].map(([k, l]) => `<button data-v="${k}" class="${st.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <p class="hint">Drag empty space to orbit the camera · right-drag to pan · scroll to zoom. Click a joint (dot) to pose it, or the body to pick the model. Changes key the current frame automatically.</p>
    <label class="ph-chk"><input type="checkbox" data-k="autoKey" ${sc.autoKey !== false ? 'checked' : ''}> Auto keyframe</label>
    <div class="an3d-models">${sc.models.map((m) => { const rm = r && r.models.get(m.id); return `<div class="an3d-model ${selM && selM.id === m.id ? 'on' : ''}" data-m="${m.id}"><b>${C.esc(m.name)}</b><small>${rm && rm.loading ? 'loading…' : rm && rm.error ? 'failed: ' + C.esc(rm.error) : `${m.bonesCount || 0} bones${m.clipNames && m.clipNames.length ? ' · ' + m.clipNames.length + ' clips' : ''}`}</small><button class="icon-btn" data-x="${m.id}">${C.icon('x')}</button></div>`; }).join('') || '<p class="hint">No models yet.</p>'}</div>
    <div class="an-btns"><button class="btn primary" data-a="import">${C.icon('import')}<span>Import rig / model…</span></button><button class="btn" data-a="manq">${C.icon('user')}<span>Add mannequin</span></button></div>
    ${selM ? `<div class="section-title" style="margin-top:10px">${C.esc(selM.name)}${st.sel.bone ? ` · <span style="color:var(--accent)">${C.esc(st.sel.bone)}</span>` : ''}</div>
      ${selM.clipNames && selM.clipNames.length ? `<div class="form-row"><label>Animation</label><select class="select" data-k="clip"><option value="">Pose with keyframes</option>${selM.clipNames.map((n, i) => `<option value="${i}" ${selM.clip === i ? 'selected' : ''}>${C.esc(n)}</option>`).join('')}</select></div><div class="form-row"><label>Speed</label><input type="range" min="0.1" max="3" step="0.05" value="${selM.speed || 1}" data-k="speed"></div>` : ''}
      <div class="an-presets"><div class="hint" style="margin:6px 0">Auto-animate (from this frame)</div><button class="chip" data-g2="walk">🚶 Walk cycle</button><button class="chip" data-g2="wave">👋 Wave</button><button class="chip" data-g2="jump">🦘 Jump</button></div>
      <div class="an-btns"><button class="btn" data-a="key">${C.icon('diamond')}<span>Key whole pose</span></button><button class="btn" data-a="rest">${C.icon('refresh')}<span>Rest pose</span></button><button class="btn" data-a="clear">${C.icon('x')}<span>Clear keys</span></button></div>` : ''}
    <div class="section-title" style="margin-top:10px">Scene</div>
    <div class="form-row"><label>Lighting</label><select class="select" data-k="light">${Object.keys(LIGHTS).map((k) => `<option ${sc.light === k ? 'selected' : ''} value="${k}">${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></div>
    <label class="ph-chk"><input type="checkbox" data-k="ground" ${sc.ground !== false ? 'checked' : ''}> Shadow on the ground</label>
    <div class="form-row"><label>Lens</label><input type="range" min="15" max="90" value="${Math.round(sc.cam.base.fov)}" data-k="fov"></div>
    <div class="an-btns"><button class="btn" data-a="camkey">${C.icon('video')}<span>Key camera here</span></button><button class="btn" data-a="camreset">${C.icon('fit')}<span>Reset camera</span></button></div>`;
  C.fillIcons(box);
  const L2 = L;
  box.querySelectorAll('[data-g=target] button').forEach((b) => (b.onclick = () => { T3.setTarget(b.dataset.v); }));
  box.querySelectorAll('[data-g=mode] button').forEach((b) => (b.onclick = () => { T3.setMode(b.dataset.v); }));
  box.querySelectorAll('.an3d-model').forEach((el) => (el.onclick = (e) => { if (e.target.closest('[data-x]')) return T3.removeModel(L2, e.target.closest('[data-x]').dataset.x); ensureReady(L2); T3.select({ model: el.dataset.m, bone: null }); }));
  const on = (a, fn) => { const b = box.querySelector(`[data-a=${a}]`); if (b) b.onclick = fn; };
  on('import', () => T3.importFile(L2)); on('manq', () => T3.addModel(L2, 'builtin:mannequin'));
  if (selM) { on('key', () => T3.keyPose(L2, selM.id)); on('rest', () => T3.resetPose(L2, selM.id)); on('clear', () => T3.clearKeys(L2, selM.id)); box.querySelectorAll('[data-g2]').forEach((b) => (b.onclick = () => T3.generate(L2, selM.id, b.dataset.g2))); }
  on('camkey', () => { if (ed) { const f = C.anim.doc.cur; C.anim.act('Key camera', () => putKey(L2.scene.cam.kf, f, snapCam())); } });
  on('camreset', () => C.anim.act('Reset camera', () => { L2.scene.cam = T3.newLayerData().cam; T3.invalidate(); }));
  box.querySelectorAll('[data-k]').forEach((i) => { i.onkeydown = (e) => e.stopPropagation(); i.onchange = () => C.anim.act('3D setting', () => { const k = i.dataset.k; if (k === 'autoKey') sc.autoKey = i.checked; else if (k === 'ground') sc.ground = i.checked; else if (k === 'light') sc.light = i.value; else if (k === 'fov') sc.cam.base.fov = +i.value; else if (k === 'clip') selM.clip = i.value === '' ? null : +i.value; else if (k === 'speed') selM.speed = +i.value; T3.invalidate(); }); });
  box.querySelectorAll('input[type=range]').forEach((i) => C.setRangeFill(i));
};
const ensureReady = (L) => { if (!ed || ed.L !== L) C.anim.redraw(); };
T3.dispose = (id) => RT.delete(id);
T3._debug = () => ({ RT, ed });
C.emit && C.emit('anim3dReady');
