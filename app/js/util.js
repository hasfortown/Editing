/* Cutroom — utilities */
window.C = window.C || {};
(function (C) {
  const ICONS = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    export: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    media: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    text: '<path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/>',
    transition: '<rect x="2" y="6" width="9" height="12" rx="2"/><rect x="13" y="6" width="9" height="12" rx="2" opacity=".5"/><path d="m9 12 6 0"/><path d="m13 10 2 2-2 2"/>',
    filter: '<circle cx="9" cy="9" r="6"/><circle cx="15" cy="9" r="6" opacity=".7"/><circle cx="12" cy="15" r="6" opacity=".5"/>',
    shapes: '<path d="M8.3 10a.7.7 0 0 1-.6-1L11.4 3a.7.7 0 0 1 1.2 0L16.3 9a.7.7 0 0 1-.6 1z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16.5A3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5"/>',
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    skipStart: '<path d="M19 20 9 12l10-8v16z"/><path d="M5 19V5"/>',
    skipEnd: '<path d="m5 4 10 8-10 8V4z"/><path d="M19 5v14"/>',
    prevFrame: '<path d="m15 18-6-6 6-6"/>',
    nextFrame: '<path d="m9 18 6-6-6-6"/>',
    loop: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    cursor: '<path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>',
    blade: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    split: '<path d="M12 2v20"/><path d="m8 7-4 5 4 5"/><path d="m16 7 4 5-4 5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    detach: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    freeze: '<path d="M12 2v20"/><path d="m4.9 4.9 14.2 14.2"/><path d="M2 12h20"/><path d="m4.9 19.1 14.2-14.2"/>',
    marker: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    magnet: '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/><path d="m5 8 4 4"/><path d="m12 15 4 4"/>',
    ripple: '<path d="M3 12h4"/><path d="M17 12h4"/><rect x="7" y="7" width="10" height="10" rx="2"/><path d="m19 9 2 3-2 3"/>',
    zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
    zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
    fit: '<path d="M21 3 14 10"/><path d="M3 21l7-7"/><path d="M15 3h6v6"/><path d="M9 21H3v-6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 7 10 7a13 13 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    volumeOff: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/>',
    video: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    wifi: '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4M7 16h10"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    alignLeft: '<path d="M21 6H3"/><path d="M15 12H3"/><path d="M17 18H3"/>',
    alignCenter: '<path d="M21 6H3"/><path d="M17 12H7"/><path d="M19 18H5"/>',
    alignRight: '<path d="M21 6H3"/><path d="M21 12H9"/><path d="M21 18H7"/>',
    bold: '<path d="M6 12h9a4 4 0 0 1 0 8H6V4h8a4 4 0 0 1 0 8"/>',
    italic: '<path d="M19 4h-9"/><path d="M14 20H5"/><path d="M15 4 9 20"/>',
    flipH: '<path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
    flipV: '<path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20"/><path d="M17 2v20"/><path d="M2 12h20"/><path d="M2 7h5"/><path d="M2 17h5"/><path d="M17 17h5"/><path d="M17 7h5"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    diamond: '<path d="M12 2 22 12 12 22 2 12z"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    wand: '<path d="m15 4-1 1"/><path d="M21 3 3 21"/><path d="m19 9-1 1"/><path d="M8 3v2"/><path d="M19 14v2"/><path d="M5 9H3"/><path d="M21 19h-2"/>',
    record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    import: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    eyedrop: '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>',
    brush: '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    bucket: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>',
    gradient: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15 15 3"/><path d="M9 21 21 9"/><path d="M3 9 9 3" opacity=".5"/>',
    lasso: '<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    stamp: '<path d="M5 22h14"/><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v1"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    marquee: '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
    move: '<path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    mask: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="5" fill="currentColor" opacity=".35"/>',
    fx: '<path d="M4 20 10 4"/><path d="M3 10h8"/><path d="m14 10 6 10"/><path d="m20 10-6 10"/>',
    merge: '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.17 2.87L4 22"/><path d="m20 22-5-5"/>',
    swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    adjust: '<circle cx="12" cy="12" r="10"/><path d="M12 2v20" /><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" opacity=".5"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  };
  C.icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  C.fillIcons = (root = document) => {
    root.querySelectorAll('[data-icon]').forEach((e) => { if (!e.dataset.filled) { e.innerHTML = C.icon(e.dataset.icon); e.dataset.filled = '1'; } });
  };

  C.uid = (p = '') => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  C.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  C.lerp = (a, b, t) => a + (b - a) * t;
  C.deep = (o) => JSON.parse(JSON.stringify(o));
  C.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  C.ease = {
    linear: (t) => t,
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };

  C.fmtTC = (t, fps = 30) => {
    t = Math.max(0, t || 0);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
    const f = Math.floor((t - Math.floor(t)) * fps + 1e-6);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}:${p(Math.min(f, fps - 1))}`;
  };
  C.fmtDur = (t) => {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    if (t < 10) return t.toFixed(1) + 's';
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  C.fmtBytes = (b) => {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i ? 1 : 0) + ' ' + u[i];
  };
  C.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  C.throttle = (fn, ms) => {
    let last = 0, t = null, pending = null;
    return (...a) => {
      const now = performance.now(); pending = a;
      if (now - last >= ms) { last = now; fn(...a); }
      else if (!t) t = setTimeout(() => { t = null; last = performance.now(); fn(...pending); }, ms - (now - last));
    };
  };

  // Event bus
  const listeners = {};
  C.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  C.off = (ev, fn) => { const l = listeners[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
  C.emit = (ev, ...a) => { (listeners[ev] || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(ev, e); } }); };

  C.$ = (s, r = document) => r.querySelector(s);
  C.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  C.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  C.toast = (msg, kind = 'ok', ms = 3200) => {
    const el = C.h(`<div class="toast ${kind === 'err' ? 'err' : ''}"><span class="ico">${C.icon(kind === 'err' ? 'alert' : kind === 'info' ? 'info' : 'check')}</span><span>${C.esc(msg)}</span></div>`);
    C.$('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, ms);
  };

  // Tooltips
  C.initTooltips = () => {
    const tip = C.$('#tooltip');
    let timer = null;
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-tip]');
      clearTimeout(timer); tip.classList.remove('show');
      if (!t) return;
      timer = setTimeout(() => {
        tip.textContent = t.dataset.tip;
        const r = t.getBoundingClientRect();
        tip.style.left = '0px'; tip.style.top = '0px';
        const w = tip.offsetWidth;
        let x = r.left + r.width / 2 - w / 2;
        x = C.clamp(x, 6, innerWidth - w - 6);
        let y = r.bottom + 8;
        if (y + 30 > innerHeight) y = r.top - 32;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
        tip.classList.add('show');
      }, 450);
    });
    document.addEventListener('mousedown', () => { clearTimeout(timer); tip.classList.remove('show'); });
  };

  // Context menu: items [{label, icon, key, action, disabled} | '-']
  C.menu = (x, y, items) => {
    const m = C.$('#ctxMenu');
    m.innerHTML = '';
    items.forEach((it) => {
      if (it === '-') { m.appendChild(C.h('<div class="ctx-sep"></div>')); return; }
      if (it.swatches) {
        const row = C.h('<div class="ctx-swatches"></div>');
        it.swatches.forEach((col) => {
          const b = C.h(`<button class="sw ${col === (it.current || null) ? 'on' : ''}" title="${col ? 'Label color' : 'No label'}" style="background:${col || 'transparent'}">${col ? '' : '∅'}</button>`);
          b.addEventListener('click', () => { C.closeMenu(); it.action(col); });
          row.appendChild(b);
        });
        m.appendChild(row); return;
      }
      const el = C.h(`<div class="ctx-item ${it.disabled ? 'disabled' : ''}"><span class="ico">${it.icon ? C.icon(it.icon) : ''}</span><span>${C.esc(it.label)}</span>${it.key ? `<span class="k">${C.esc(it.key)}</span>` : ''}</div>`);
      el.addEventListener('click', () => { C.closeMenu(); it.action && it.action(); });
      m.appendChild(el);
    });
    m.classList.add('show');
    const w = m.offsetWidth, hh = m.offsetHeight;
    m.style.left = Math.min(x, innerWidth - w - 6) + 'px';
    m.style.top = Math.min(y, innerHeight - hh - 6) + 'px';
  };
  C.closeMenu = () => { C.$('#ctxMenu').classList.remove('show'); C.$$('.menu-btn.open').forEach((b) => b.classList.remove('open')); };
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxMenu') && !e.target.closest('.menu-btn')) C.closeMenu(); });

  // Modal
  C.modal = (html, { onClose, dismissable = true, cls = '' } = {}) => {
    const bd = C.$('#modalBackdrop'), m = C.$('#modal');
    if (C._modalClose) { const prev = C._modalClose; C._modalClose = null; try { prev(); } catch (_) {} }
    const token = {}; C._modalToken = token;
    C._modalDismissable = true;
    m.className = 'modal' + (cls ? ' ' + cls : '');
    m.innerHTML = html; C.fillIcons(m);
    bd.classList.add('show');
    const close = () => {
      if (token.closed) return; token.closed = true;
      if (C._modalToken === token) { bd.classList.remove('show'); m.innerHTML = ''; m.className = 'modal'; bd.onclick = null; C._modalClose = null; C._modalToken = null; }
      onClose && onClose();
    };
    bd.onclick = (e) => { if (e.target === bd && dismissable && C._modalDismissable !== false) close(); };
    C._modalClose = close;
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    return { el: m, close };
  };
  C.modalOpen = () => C.$('#modalBackdrop').classList.contains('show');

  C.confirm = (title, text, okLabel = 'OK', danger = false) => new Promise((res) => {
    let result = false;
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.esc(title)}</h2></div><div class="modal-body"><p class="hint" style="font-size:13px;color:var(--text-2)">${text}</p></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cOk">${C.esc(okLabel)}</button></div>`, { onClose: () => res(result) });
    el.querySelector('#cOk').addEventListener('click', () => { result = true; close(); });
  });
  C.prompt = (title, label, value = '', okLabel = 'OK') => new Promise((res) => {
    let result = null;
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.esc(title)}</h2></div><div class="modal-body"><div class="form-row"><label>${C.esc(label)}</label><input class="text-input" id="pIn" value="${C.esc(value)}"></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pOk">${C.esc(okLabel)}</button></div>`, { onClose: () => res(result) });
    const inp = el.querySelector('#pIn'); setTimeout(() => { inp.focus(); inp.select(); }, 30);
    const ok = () => { result = inp.value; close(); };
    el.querySelector('#pOk').addEventListener('click', ok);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });

  C.setRangeFill = (r) => {
    const min = +r.min || 0, max = +r.max || 100;
    r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%');
  };
  document.addEventListener('input', (e) => { if (e.target.type === 'range') C.setRangeFill(e.target); });

  C.isTyping = () => {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(a.type) || a.tagName === 'TEXTAREA' || a.isContentEditable || a.tagName === 'SELECT');
  };

  C.FONTS = ['Segoe UI', 'Arial', 'Arial Black', 'Bahnschrift', 'Impact', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    'Tahoma', 'Courier New', 'Consolas', 'Comic Sans MS', 'Segoe Script', 'Segoe Print', 'Palatino Linotype', 'Lucida Console', 'Gabriola', 'Candara', 'Franklin Gothic Medium'];
})(window.C);
