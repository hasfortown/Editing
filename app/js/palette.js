/* Cutroom — command palette (Ctrl+K) */
(function (C) {
  const PL = (C.palette = {});
  PL.commands = () => {
    const A = C.app, O = C.ops;
    const sel = C.selectedClips(); const p = C.primary();
    const list = [
      ['New project', 'Ctrl+N', () => A.newProject()], ['Open project…', 'Ctrl+O', () => A.open()], ['Save', 'Ctrl+S', () => A.save()], ['Save as…', 'Ctrl+Shift+S', () => A.save(true)],
      ['Home screen', '', () => C.home.show()], ['Import media…', 'Ctrl+I', () => A.importDialog()], ['Export video…', 'Ctrl+E', () => C.exporter.open('video')], ['Export audio…', '', () => C.exporter.open('audio')],
      ['Share project package…', '', () => C.share.pack()], ['Collaborate…', '', () => C.collabUI.open()], ['Record voiceover', 'R', () => C.recorder.open()],
      ['Effect Studio', '', () => C.presets.studio()], ['Photo editor', '', () => C.setMode('photo')], ['Video editor', '', () => C.setMode('video')], ['New image (photo editor)', '', () => { C.setMode('photo'); C.photoPanels.newDialog(); }], ['Edit current frame in Photo editor', '', () => C.photoPanels.editVideoFrame()], ['Add effect…', '', () => C.presets.picker(sel)], ['Import effect presets…', '', () => C.presets.importPresets()], ['Export my effect presets…', '', () => C.presets.exportPresets(C.presets.user, 'My Cutroom presets')],
      ['Add text', 'T', () => C.act('Add text', () => { const c = O.addText(null); C.select([c.id]); C.emit('focusText'); })],
      ['Split at playhead', 'S', () => O.splitAtPlayhead()], ['Delete selection', 'Del', () => O.deleteSelected(false)], ['Ripple delete', 'Shift+Del', () => O.deleteSelected(true)],
      ['Duplicate', 'Ctrl+D', () => O.duplicate()], ['Copy', 'Ctrl+C', () => O.copy()], ['Paste', 'Ctrl+V', () => O.paste()], ['Select all', 'Ctrl+A', () => O.selectAll()], ['Deselect all', 'Esc', () => C.select([])],
      ['Group selected clips', 'Ctrl+G', () => O.group()], ['Ungroup', 'Ctrl+Shift+G', () => O.ungroup()], ['Rename clip', 'F2', () => O.rename()],
      ['Select everything after playhead', '', () => O.selectAfter(C.UI.playhead, null)],
      ['Detach audio', '', () => O.detachAudio(p)], ['Freeze frame', '', () => C.$('#tlFreeze').click()], ['Picture-in-picture', '', () => p && O.pip(p)],
      ['Save effects as preset…', '', () => p && C.presets.saveFromClip(p)], ['Add marker', 'M', () => O.addMarker()], ['Detect beats in selected music', '', () => { const a = C.selectedClips().find((x) => C.hasAudio(x)) || Object.values(C.project.clips).find((x) => x.kind === 'audio'); if (a) C.beats.detect(a, 4); else C.toast('Add some music first', 'info'); }], ['Cut clips on markers (beat sync)', '', () => { const s = C.selectedClips().filter((x) => x.kind !== 'audio'); C.beats.splitAtMarkers(s.length ? s : Object.values(C.project.clips).filter((x) => x.kind === 'video' || x.kind === 'image')); }], ['Clear beat markers', '', () => C.beats.clear()], ['Motion tracking (selected video)', '', () => { const v = C.selectedClips().find((x) => x.kind === 'video'); if (!v) return C.toast('Select a video clip first', 'info'); C.emit('inspectTab', 'track'); }],
      ['Set in point', 'I', () => C.tl.setRange('in')], ['Set out point', 'O', () => C.tl.setRange('out')], ['Clear in/out', 'Alt+X', () => C.tl.clearRange()],
      ['Toggle loop playback', '', () => C.$('#btnLoop').click()], ['Toggle snapping', 'N', () => C.$('#tlSnap').click()], ['Toggle ripple editing', '', () => C.$('#tlRipple').click()],
      ['Zoom timeline to fit', 'Shift+Z', () => C.tl.fit()], ['Blade tool', 'B', () => A.setTool('blade')], ['Selection tool', 'V', () => A.setTool('select')],
      ['Save current frame as PNG', '', () => C.exporter.snapshot()], ['Add video track', '', () => C.act('Add track', () => { C.addTrack('video'); C.renumberTracks(); })], ['Add audio track', '', () => C.act('Add track', () => { C.addTrack('audio'); C.renumberTracks(); })],
      ['Keyboard shortcuts', '?', () => A.showShortcuts()], ['Appearance & themes', '', () => C.theme.open()],
      ...C.theme.PRESETS.map((t) => [`Theme: ${t.name}`, '', () => { C.theme.cfg.preset = t.id; C.theme.cfg.accent = null; C.theme.apply(); }]),
      ...C.fx.OVERLAYS.flatMap(([, l]) => l).map((o) => [`Overlay: ${o.name}`, o.icon, () => C.presets.applyRef('ov:' + o.id, [])]),
      ...C.geo.SHAPES.map(([k, l]) => [`Shape: ${l}`, '', () => C.act('Add shape', () => { const c = C.ops.addShape(k); C.select([c.id]); })]),
      ...['Media', 'Text', 'Stickers', 'Effects', 'Transitions', 'Filters', 'Elements'].map((n) => [`Show ${n} panel`, '', () => C.library.show(n.toLowerCase())]),
      ...Object.keys(C.ASPECTS).map((a) => [`Canvas ${a}`, '', () => C.setAspect(a)]),
      ...C.fx.DEFS.map((d) => [`Effect: ${d.name}`, d.icon, () => C.presets.applyRef('fx:' + d.id, sel.filter((c) => c.kind !== 'audio' && c.kind !== 'effect'))]),
      ...C.presets.all().map((pr) => [`Preset: ${pr.name}`, '★', () => C.presets.applyRef('preset:' + pr.id, sel.filter((c) => c.kind !== 'audio' && c.kind !== 'effect'))]),
      ...C.TRANSITIONS.map((t) => [`Transition: ${t.name}`, '', () => { const v = sel.filter((c) => c.kind !== 'audio'); if (!v.length) return C.toast('Select a clip first', 'info'); C.act('Add transition', () => O.setTransition(v, t.id)); }]),
    ];
    return list.map(([label, key, run]) => ({ label, key, run }));
  };
  const score = (label, q) => {
    const l = label.toLowerCase(); if (!q) return 1;
    if (l.startsWith(q)) return 100; const i = l.indexOf(q); if (i >= 0) return 80 - i;
    let j = 0, s = 0; for (const ch of l) { if (ch === q[j]) { j++; s += 2; } } return j === q.length ? s : 0;
  };
  PL.open = () => {
    const cmds = PL.commands(); let idx = 0, items = cmds;
    const { el, close } = C.modal(`<div class="palette"><div class="pal-in">${C.icon('search')}<input id="palQ" placeholder="Type a command, effect, preset…" spellcheck="false"><span class="kbd">Esc</span></div><div class="pal-list" id="palL"></div></div>`, { cls: 'pal-modal' });
    const q = el.querySelector('#palQ'), L = el.querySelector('#palL');
    const render = () => {
      const s = q.value.trim().toLowerCase();
      items = cmds.map((c) => ({ c, s: score(c.label, s) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 60).map((x) => x.c);
      idx = Math.min(idx, Math.max(0, items.length - 1));
      L.innerHTML = items.map((c, i) => `<div class="pal-item ${i === idx ? 'on' : ''}" data-i="${i}"><span>${C.esc(c.label)}</span><span class="k">${C.esc(c.key || '')}</span></div>`).join('') || '<div class="hint" style="padding:14px">No matching commands</div>';
      const on = L.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const run = (i) => { const c = items[i]; if (!c) return; close(); setTimeout(() => c.run(), 0); };
    q.addEventListener('input', () => { idx = 0; render(); });
    q.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') run(idx);
      else if (e.key === 'Escape') close();
    });
    L.addEventListener('click', (e) => { const it = e.target.closest('.pal-item'); if (it) run(+it.dataset.i); });
    render(); setTimeout(() => q.focus(), 20);
  };
})(window.C);
