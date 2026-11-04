/* Cutroom — voice & audio effects (processed by FFmpeg so preview matches export) */
(function (C) {
  const V = (C.voice = {});
  V.PRESETS = [
    ['none', 'None', '🎙️', ''],
    ['deep', 'Deep voice', '🗿', 'asetrate=48000*0.78,aresample=48000,atempo=1.2820513'],
    ['monster', 'Monster', '👹', 'asetrate=48000*0.62,aresample=48000,atempo=1.6129032,aecho=0.6:0.5:40:0.35,lowpass=f=3500'],
    ['chipmunk', 'Chipmunk', '🐿️', 'asetrate=48000*1.5,aresample=48000,atempo=0.6666667'],
    ['helium', 'Helium', '🎈', 'asetrate=48000*1.25,aresample=48000,atempo=0.8'],
    ['underwater', 'Underwater', '🌊', 'lowpass=f=450,vibrato=f=4:d=0.35,aecho=0.8:0.85:60|110:0.35|0.25,volume=1.6'],
    ['robot', 'Robot', '🤖', "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75,volume=1.4"],
    ['alien', 'Alien', '👽', 'asetrate=48000*1.12,aresample=48000,atempo=0.8928571,vibrato=f=8:d=0.5,aphaser=type=t:speed=1.5'],
    ['ghost', 'Ghost', '👻', 'asetrate=48000*0.92,aresample=48000,atempo=1.0869565,aecho=0.8:0.9:200|400:0.5|0.35,aphaser'],
    ['whisper', 'Whisper', '🤫', "afftfilt=real='hypot(re,im)*cos((random(0)*2-1)*2*3.14)':imag='hypot(re,im)*sin((random(1)*2-1)*2*3.14)':win_size=128:overlap=0.8,highpass=f=500,volume=2"],
    ['telephone', 'Telephone', '☎️', 'highpass=f=400,lowpass=f=3200,acompressor=threshold=0.1:ratio=6,volume=1.8'],
    ['radio', 'Old radio', '📻', 'highpass=f=300,lowpass=f=4200,acrusher=bits=10:mode=log:aa=1,volume=1.4'],
    ['megaphone', 'Megaphone', '📢', 'highpass=f=650,lowpass=f=3000,acrusher=bits=7:mode=lin:aa=1,volume=2.2'],
    ['reverb', 'Room reverb', '🏠', 'aecho=0.8:0.88:40|70|110:0.35|0.25|0.18'],
    ['hall', 'Concert hall', '🎭', 'aecho=0.8:0.9:120|250|400:0.45|0.32|0.22'],
    ['stadium', 'Stadium', '🏟️', 'aecho=0.8:0.92:180|350|520:0.5|0.35|0.25,volume=0.9'],
    ['cave', 'Cave', '🕳️', 'aecho=0.8:0.9:600|1100:0.45|0.28'],
    ['echo', 'Echo', '🔁', 'aecho=0.8:0.85:380:0.45'],
  ];
  V.get = (id) => V.PRESETS.find((p) => p[0] === id);
  V.filterFor = (c) => {
    const v = c.voice; if (!v || !v.preset || v.preset === 'none') return '';
    const p = V.get(v.preset); if (!p) return '';
    let f = p[3];
    const eq = [];
    if (v.bass) eq.push(`bass=g=${v.bass}`);
    if (v.treble) eq.push(`treble=g=${v.treble}`);
    if (v.denoise) eq.push('afftdn=nf=-25');
    return [f, ...eq].filter(Boolean).join(',');
  };
  V.filterExtras = (c) => {
    const v = c.voice || {}; const eq = [];
    if (v.denoise) eq.push('afftdn=nf=-25');
    if (v.bass) eq.push(`bass=g=${v.bass}`);
    if (v.treble) eq.push(`treble=g=${v.treble}`);
    return eq.join(',');
  };
  V.active = (c) => !!(c.voice && ((c.voice.preset && c.voice.preset !== 'none') || c.voice.bass || c.voice.treble || c.voice.denoise));
  const fullFilter = (c) => [V.get(c.voice.preset || 'none')?.[3], V.filterExtras(c)].filter(Boolean).join(',');

  // processed file cache: key -> {status, path}
  const cache = new Map();
  const keyOf = (c) => { const m = C.mediaOf(c); return m ? `${m.id}|${fullFilter(c)}` : null; };
  V.state = (c) => { if (!V.active(c)) return null; const k = keyOf(c); return k ? cache.get(k) || null : null; };
  V.processedPath = (c) => { const s = V.state(c); return s && s.status === 'ready' ? s.path : null; };
  V.ensure = (c) => {
    if (!V.active(c)) return Promise.resolve(null);
    const k = keyOf(c); if (!k) return Promise.resolve(null);
    const ex = cache.get(k); if (ex) return ex.promise;
    const m = C.mediaOf(c);
    const entry = { status: 'processing', path: null };
    entry.promise = window.native.voiceProcess({ path: C.mediaPath(m), filter: fullFilter(c) }).then((r) => {
      if (r && r.ok) { entry.status = 'ready'; entry.path = r.path; } else { entry.status = 'error'; C.toast('Voice effect failed: ' + ((r && r.error) || '').slice(-200), 'err', 5000); }
      C.emit('voiceReady'); C.engine && C.engine.requestDraw(); return entry.path;
    });
    cache.set(k, entry); C.emit('voiceReady');
    return entry.promise;
  };
  V.ensureAll = () => Promise.all(C.allClips().filter(V.active).map(V.ensure));
  C.on('change', () => { for (const c of C.allClips()) if (V.active(c)) V.ensure(c); });
})(window.C);
