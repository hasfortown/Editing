/* Cutroom — app shell: boot, menus, shortcuts, files */
(function (C) {
  const N = window.native;
  const A = (C.app = {});

  const setIcon = (id, name) => { const e = C.$('#' + id); if (e) e.innerHTML = C.icon(name); };

  A.boot = async () => {
    C.fillIcons();
    [['btnUndo', 'undo'], ['btnRedo', 'redo'], ['btnStart', 'skipStart'], ['btnPrevFrame', 'prevFrame'], ['btnNextFrame', 'nextFrame'], ['btnEnd', 'skipEnd'],
      ['btnLoop', 'loop'], ['btnSnapshot', 'camera'], ['btnFullscreen', 'fullscreen'], ['tlSelect', 'cursor'], ['tlBlade', 'blade'], ['tlSplit', 'split'],
      ['tlDelete', 'trash'], ['tlDuplicate', 'copy'], ['tlDetach', 'detach'], ['tlFreeze', 'freeze'], ['tlAddMarker', 'marker'], ['tlSnap', 'magnet'],
      ['tlRipple', 'ripple'], ['tlZoomOut', 'zoomOut'], ['tlZoomIn', 'zoomIn'], ['tlFit', 'fit'], ['tlRecord', 'mic'], ['tlEffect', 'sparkles'], ['btnPalette', 'command']].forEach(([i, n]) => setIcon(i, n));
    C.fx.installSvg();
    await C.presets.load();
    C.initTooltips();

    // Restore last session (autosave) or start fresh
    C.newProject();
    let restored = false;
    try {
      const raw = await N.autosaveLoad();
      if (raw) {
        const a = JSON.parse(raw);
        C.loadProjectData(a.data, a.filePath || null);
        C.UI.dirty = !!a.dirty;
        restored = true;
      }
    } catch (e) { console.warn('Autosave restore failed', e); C.newProject(); }
    try { const ts = JSON.parse(localStorage.getItem('cutroom.tlh') || 'null'); if (ts) document.documentElement.style.setProperty('--tl-h', ts + 'px'); } catch (_) {}

    C.engine.init(); C.tl.init(); C.preview.init(); C.inspector.init(); C.library.init(); await C.home.init();
    C.$$('#modeSwitch button').forEach((b) => (b.onclick = () => C.setMode(b.dataset.m)));
    wireTopbar(); wireTransport(); wireTimelineToolbar(); wireKeys(); wireDrop(); wireResizer(); wireMenus();
    A.afterLoad();
    if (restored && C.allClips().length) C.toast('Restored your last session', 'info', 2200);

    const pend = await N.pendingOpen();
    if (pend) A.openProjectPath(pend); else C.home.show();
    N.onOpenFile((f) => A.openProjectPath(f));
    const info = await N.info();
    if (!info.ffmpeg) C.toast('FFmpeg was not found — import of unusual formats and exporting will not work.', 'err', 8000);
  };

  A.afterLoad = () => {
    C.$('#projectName').value = C.project.name;
    C.$('#aspectSelect').value = C.project.settings.aspect;
    C.engine.gc(); C.engine.resize(); C.engine.layout();
    C.tl.render(); C.library.render(); C.inspector.render(true);
    C.engine.seek(Math.min(C.UI.playhead, C.duration()));
    updateSaveState(); updateUndo(); updateTime();
    for (const m of Object.values(C.project.media)) C.prepareMedia(m);
    setTimeout(() => { if (C.allClips().length) C.tl.fit(); }, 50);
  };

  // ---------- files ----------
  A.confirmDiscard = async () => {
    if (!C.UI.dirty || !C.allClips().length) return true;
    return C.confirm('Discard unsaved changes?', 'Your current project has changes that are not saved to a project file.', 'Discard', true);
  };
  A.newProject = async (aspect) => {
    if (C.collab.mode !== 'off') { if (!(await C.confirm('Leave live session?', 'Starting a new project will disconnect you from the collaboration session.', 'Leave'))) return false; await C.collab.leave(); }
    if (!(await A.confirmDiscard())) return false;
    C.engine.pause();
    C.newProject(); C.UI.dirty = false;
    if (aspect && C.ASPECTS[aspect]) { const [w, h] = C.ASPECTS[aspect]; Object.assign(C.project.settings, { aspect, width: w, height: h }); }
    A.afterLoad(); C.scheduleAutosave();
    return true;
  };
  A.open = async () => {
    const p = await N.shareOpenDialog();
    if (p) A.openProjectPath(p);
  };
  A.openProjectPath = async (p, skipConfirm = false) => {
    if (/\.cutphoto$/i.test(p)) { C.home.hide(); C.setMode('photo'); return C.photoPanels.openProjectPath(p); }
    if (/\.cutroompack$/i.test(p)) return C.share.openPackage(p);
    if (C.collab.mode !== 'off') { if (!(await C.confirm('Leave live session?', 'Opening another project will disconnect you from the collaboration session.', 'Leave'))) return; await C.collab.leave(); }
    if (!skipConfirm && !(await A.confirmDiscard())) return;
    try {
      const text = await N.readText(p);
      C.engine.pause();
      C.loadProjectData(text, p);
      A.afterLoad(); C.scheduleAutosave();
      C.home.hide();
      C.toast('Opened ' + C.baseName(p));
      setTimeout(() => C.home.addRecent(p, C.project.name), 1500);
    } catch (e) { C.toast('Could not open project: ' + e.message, 'err', 5000); }
  };
  A.save = async (as = false) => {
    let p = C.UI.filePath;
    if (!p || as) { p = await N.saveProjectDialog(C.project.name); if (!p) return false; }
    try {
      C.UI.filePath = p;
      await N.writeText(p, C.serialize());
      C.UI.dirty = false; updateSaveState(); C.scheduleAutosave();
      C.toast('Saved ' + C.baseName(p), 'ok', 1600);
      C.home.addRecent(p, C.project.name);
      return true;
    } catch (e) { C.toast('Save failed: ' + e.message, 'err'); return false; }
  };
  A.importDialog = async (addToTimeline = false) => {
    const paths = await N.openMedia();
    if (paths.length) C.importPaths(paths, { addToTimeline });
  };
  C.setAspect = (a) => {
    const [w, h] = C.ASPECTS[a];
    C.act('Change aspect ratio', () => { Object.assign(C.project.settings, { aspect: a, width: w, height: h }); });
    C.$('#aspectSelect').value = a;
    C.engine.resize(); C.engine.layout(); C.inspector.render(true);
  };

  // ---------- top bar ----------
  function updateSaveState() {
    const el = C.$('#saveState');
    if (C.collab && C.collab.mode !== 'off') el.textContent = C.UI.filePath ? (C.UI.dirty ? 'Live · unsaved' : 'Live · saved') : 'Live session';
    else if (!C.UI.filePath) el.textContent = C.allClips().length ? 'Autosaved · not saved to file' : '';
    else el.textContent = C.UI.dirty ? 'Unsaved changes' : 'Saved';
    document.title = `${C.UI.dirty ? '• ' : ''}${C.project.name} — Cutroom`;
  }
  function updateUndo() {
    C.$('#btnUndo').disabled = !C.history.undo.length;
    C.$('#btnRedo').disabled = !C.history.redo.length;
    const u = C.history.undo[C.history.undo.length - 1], r = C.history.redo[C.history.redo.length - 1];
    C.$('#btnUndo').dataset.tip = u ? `Undo ${u.label} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
    C.$('#btnRedo').dataset.tip = r ? `Redo ${r.label} (Ctrl+Shift+Z)` : 'Redo (Ctrl+Shift+Z)';
  }
  function updateTime() {
    C.$('#tcCurrent').textContent = C.fmtTC(C.UI.playhead, C.fps());
    C.$('#tcTotal').textContent = C.fmtTC(C.duration(), C.fps());
  }
  function wireTopbar() {
    C.$('#btnUndo').onclick = C.undo; C.$('#btnRedo').onclick = C.redo;
    C.$('#btnExport').onclick = () => (C.mode === 'photo' ? C.photoPanels.exportMenu(C.$('#btnExport')) : C.exporter.open('video'));
    C.$('#btnCollab').onclick = () => C.collabUI.open();
    const pn = C.$('#projectName');
    pn.addEventListener('change', () => { const v = pn.value.trim() || 'Untitled project'; pn.value = v; C.act('Rename project', () => { C.project.name = v; }); });
    pn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') pn.blur(); e.stopPropagation(); });
    C.$('#aspectSelect').addEventListener('change', (e) => { C.setAspect(e.target.value); e.target.blur(); });
    const pq = C.$('#previewQuality');
    try { const v = localStorage.getItem('cutroom.pq'); if (v) { pq.value = v; C.UI.previewScale = +v; } } catch (_) {}
    pq.addEventListener('change', () => { C.UI.previewScale = +pq.value; try { localStorage.setItem('cutroom.pq', pq.value); } catch (_) {} C.engine.resize(); C.engine.requestDraw(); pq.blur(); });
    C.on('change', (i) => {
      updateUndo(); updateTime();
      if (i.source === 'remote' || i.source === 'undo') { C.$('#projectName').value = C.project.name; C.$('#aspectSelect').value = C.project.settings.aspect; }
    });
    C.on('dirty', updateSaveState); C.on('collab', updateSaveState);
    C.on('time', updateTime);
  }

  // ---------- transport ----------
  function wireTransport() {
    const play = C.$('#btnPlay');
    const upd = () => { play.innerHTML = C.icon(C.UI.playing ? 'pause' : 'play'); play.dataset.tip = C.UI.playing ? 'Pause (Space)' : 'Play (Space)'; };
    upd(); C.on('playstate', upd);
    const meter = C.$('#audioMeter > div');
    let peak = 0;
    C.on('time', () => { const l = C.engine.level(); peak = Math.max(l, peak * 0.9); meter.style.width = C.clamp((20 * Math.log10(peak + 1e-5) + 48) / 48, 0, 1) * 100 + '%'; meter.style.background = peak > 0.95 ? 'var(--danger)' : peak > 0.7 ? 'var(--warn)' : 'var(--accent)'; });
    C.on('playstate', () => { if (!C.UI.playing) { peak = 0; meter.style.width = '0%'; } });
    play.onclick = () => C.engine.toggle();
    C.$('#btnStart').onclick = () => C.engine.seek(0);
    C.$('#btnEnd').onclick = () => C.engine.seek(C.duration());
    C.$('#btnPrevFrame').onclick = () => step(-1);
    C.$('#btnNextFrame').onclick = () => step(1);
    const loop = C.$('#btnLoop');
    loop.onclick = () => { C.UI.loop = !C.UI.loop; loop.classList.toggle('active', C.UI.loop); };
    C.$('#btnSnapshot').onclick = () => C.exporter.snapshot();
    C.$('#btnFullscreen').onclick = () => { const s = C.$('#stage'); if (document.fullscreenElement) document.exitFullscreen(); else s.requestFullscreen(); };
    document.addEventListener('fullscreenchange', () => setTimeout(() => C.engine.layout(), 50));
  }
  const step = (n) => { if (C.UI.playing) C.engine.pause(); C.engine.seek(Math.max(0, C.snapTime(C.UI.playhead + n * C.frame()))); };

  function wireTimelineToolbar() {
    const setTool = (t) => { C.UI.tool = t; C.$('#tlSelect').classList.toggle('active', t === 'select'); C.$('#tlBlade').classList.toggle('active', t === 'blade'); C.$('#timeline').classList.toggle('blade', t === 'blade'); };
    A.setTool = setTool; setTool('select');
    C.$('#tlSelect').onclick = () => setTool('select');
    C.$('#tlBlade').onclick = () => setTool('blade');
    C.$('#tlSplit').onclick = () => C.ops.splitAtPlayhead();
    C.$('#tlDelete').onclick = () => C.ops.deleteSelected(false);
    C.$('#tlDuplicate').onclick = () => C.ops.duplicate();
    C.$('#tlDetach').onclick = () => C.ops.detachAudio(C.primary());
    C.$('#tlFreeze').onclick = () => C.ops.freeze(C.primary() || C.allClips().find((c) => c.kind === 'video' && C.UI.playhead > c.start && C.UI.playhead < C.clipEnd(c)));
    C.$('#tlAddMarker').onclick = () => C.ops.addMarker();
    C.$('#tlRecord').onclick = () => C.recorder.open();
    C.$('#tlEffect').onclick = () => C.presets.picker(C.selectedClips());
    C.$('#btnPalette').onclick = () => C.palette.open();
    const snap = C.$('#tlSnap'), rip = C.$('#tlRipple');
    snap.onclick = () => { C.UI.snap = !C.UI.snap; snap.classList.toggle('on', C.UI.snap); };
    rip.onclick = () => { C.UI.ripple = !C.UI.ripple; rip.classList.toggle('on', C.UI.ripple); C.toast(C.UI.ripple ? 'Ripple editing on — trims push later clips' : 'Ripple editing off', 'info', 1500); };
    const updSel = () => {
      const p = C.primary(); const any = C.selection.size > 0;
      C.$('#tlDelete').disabled = !any; C.$('#tlDuplicate').disabled = !any;
      C.$('#tlDetach').disabled = !(p && p.kind === 'video' && C.hasAudio(p));
    };
    C.on('select', updSel); C.on('change', updSel); updSel();
  }

  // ---------- keyboard ----------
  function wireKeys() {
    document.addEventListener('keydown', (e) => {
      if (C.modalOpen()) { if (e.key === 'Escape' && C._modalClose && C._modalDismissable !== false) C._modalClose(); return; }
      if (C.mode === 'photo' && !C.home.visible()) { C.photoPanels.key(e); return; }
      if (C.home.visible()) { if (e.key === 'Escape' && C.allClips().length) C.home.hide(); return; }
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 'k') { e.preventDefault(); C.palette.open(); return; }
      if (ctrl && k === 's') { e.preventDefault(); A.save(e.shiftKey); return; }
      if (ctrl && k === 'o') { e.preventDefault(); A.open(); return; }
      if (ctrl && k === 'n') { e.preventDefault(); A.newProject(); return; }
      if (ctrl && k === 'e') { e.preventDefault(); C.exporter.open('video'); return; }
      if (ctrl && k === 'i') { e.preventDefault(); A.importDialog(); return; }
      if (C.isTyping()) return;
      if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? C.redo() : C.undo(); return; }
      if (ctrl && k === 'y') { e.preventDefault(); C.redo(); return; }
      if (ctrl && k === 'c') { e.preventDefault(); C.ops.copy(); return; }
      if (ctrl && k === 'x') { e.preventDefault(); C.ops.cut(); return; }
      if (ctrl && k === 'v') { e.preventDefault(); C.ops.paste(); return; }
      if (ctrl && k === 'd') { e.preventDefault(); C.ops.duplicate(); return; }
      if (ctrl && k === 'a') { e.preventDefault(); C.ops.selectAll(); return; }
      if (ctrl && k === 'b') { e.preventDefault(); C.ops.splitAtPlayhead(); return; }
      if (ctrl && k === 'g') { e.preventDefault(); e.shiftKey ? C.ops.ungroup() : C.ops.group(); return; }
      if (ctrl && e.shiftKey && k === 'a') { e.preventDefault(); C.select([]); return; }
      if (e.altKey && k === 'x') { e.preventDefault(); C.tl.clearRange(); return; }
      if (ctrl && (k === '=' || k === '+')) { e.preventDefault(); C.tl.setZoom(C.UI.pps * 1.4); return; }
      if (ctrl && k === '-') { e.preventDefault(); C.tl.setZoom(C.UI.pps / 1.4); return; }
      if (ctrl) return;
      switch (e.key) {
        case ' ': e.preventDefault(); C.engine.toggle(); break;
        case 'k': case 'K': C.engine.pause(); break;
        case 'l': case 'L': C.engine.play(); break;
        case 'j': case 'J': C.engine.pause(); C.engine.seek(Math.max(0, C.UI.playhead - 1)); break;
        case 's': case 'S': C.ops.splitAtPlayhead(); break;
        case 'b': case 'B': A.setTool(C.UI.tool === 'blade' ? 'select' : 'blade'); break;
        case 'v': case 'V': A.setTool('select'); break;
        case 'm': case 'M': C.ops.addMarker(); break;
        case 'i': case 'I': C.tl.setRange('in'); break;
        case 'o': case 'O': C.tl.setRange('out'); break;
        case 'r': case 'R': C.recorder.open(); break;
        case 't': case 'T': C.act('Add text', () => { const c = C.ops.addText(null); C.select([c.id]); C.emit('focusText'); }); break;
        case 'F2': C.ops.rename(); break;
        case 'Tab': e.preventDefault(); C.ops.selectNeighbor(e.shiftKey ? -1 : 1); break;
        case '?': A.showShortcuts(); break;
        case 'n': case 'N': C.$('#tlSnap').click(); break;
        case 'z': case 'Z': if (e.shiftKey) C.tl.fit(); break;
        case '=': case '+': C.tl.setZoom(C.UI.pps * 1.4); break;
        case '-': case '_': C.tl.setZoom(C.UI.pps / 1.4); break;
        case 'Delete': case 'Backspace': e.preventDefault(); C.ops.deleteSelected(e.shiftKey); break;
        case 'Escape': C.UI.focusFx = null; C.select([]); A.setTool('select'); break;
        case 'Home': C.engine.seek(0); break;
        case 'End': C.engine.seek(C.duration()); break;
        case 'ArrowLeft': e.preventDefault(); if (e.altKey) C.ops.nudge(-C.frame() * (e.shiftKey ? 10 : 1)); else e.shiftKey ? C.engine.seek(Math.max(0, C.UI.playhead - 1)) : step(-1); break;
        case 'ArrowRight': e.preventDefault(); if (e.altKey) C.ops.nudge(C.frame() * (e.shiftKey ? 10 : 1)); else e.shiftKey ? C.engine.seek(C.UI.playhead + 1) : step(1); break;
        case 'ArrowUp': e.preventDefault(); jumpEdit(-1); break;
        case 'ArrowDown': e.preventDefault(); jumpEdit(1); break;
      }
    });
  }
  function jumpEdit(dir) {
    const t = C.UI.playhead;
    const pts = [...new Set(C.allClips().flatMap((c) => [c.start, C.clipEnd(c)]))].sort((a, b) => a - b);
    const tgt = dir > 0 ? pts.find((p) => p > t + 1e-3) : pts.reverse().find((p) => p < t - 1e-3);
    if (tgt != null) C.engine.seek(tgt);
  }

  // ---------- OS file drop ----------
  function wireDrop() {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; document.body.classList.add('dragging-files'); });
    addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging-files'); });
    addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; document.body.classList.remove('dragging-files');
      const paths = [...e.dataTransfer.files].map((f) => N.getPathForFile(f)).filter(Boolean);
      if (C.mode === 'photo') { C.photoPanels.openPaths(paths); return; }
      const proj = paths.find((p) => /\.(cutroom|cutroompack)$/i.test(p));
      if (proj) return A.openProjectPath(proj);
      if (!paths.length) return;
      const row = e.target.closest && e.target.closest('.track');
      if (row) C.importPaths(paths, { addToTimeline: true, at: C.snapTime(C.tl.timeAt(e.clientX)), trackId: row.dataset.track });
      else C.importPaths(paths, { addToTimeline: e.target.closest && !!e.target.closest('#timeline') });
    });
  }

  function wireResizer() {
    const r = C.$('#tlResizer');
    r.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const y0 = e.clientY, h0 = C.$('#timeline').getBoundingClientRect().height;
      const move = (ev) => {
        const h = C.clamp(h0 - (ev.clientY - y0), 160, innerHeight - 330);
        document.documentElement.style.setProperty('--tl-h', h + 'px');
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        try { localStorage.setItem('cutroom.tlh', JSON.stringify(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tl-h'), 10))); } catch (_) {}
        C.engine.layout(); C.tl.render();
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
  }

  // ---------- menus ----------
  A.wireMenus = () => wireMenus();
  function wireMenus() {
    const menus = {
      file: () => [
        { label: 'Home', icon: 'home', action: () => C.home.show() },
        { label: 'New project', icon: 'plus', key: 'Ctrl+N', action: () => A.newProject() },
        { label: 'Open…', icon: 'folder', key: 'Ctrl+O', action: A.open },
        { label: 'Save', icon: 'save', key: 'Ctrl+S', action: () => A.save() },
        { label: 'Save as…', icon: 'save', key: 'Ctrl+Shift+S', action: () => A.save(true) },
        '-',
        { label: 'Import media…', icon: 'upload', key: 'Ctrl+I', action: () => A.importDialog() },
        '-',
        { label: 'Share project package…', icon: 'share', action: () => C.share.pack() },
        { label: 'Collaborate…', icon: 'users', action: () => C.collabUI.open() },
        '-',
        { label: 'Export video…', icon: 'export', key: 'Ctrl+E', action: () => C.exporter.open('video') },
        { label: 'Export audio…', icon: 'audio', action: () => C.exporter.open('audio') },
        { label: 'Save current frame (PNG)…', icon: 'camera', action: () => C.exporter.snapshot() },
      ],
      edit: () => [
        { label: 'Undo', icon: 'undo', key: 'Ctrl+Z', disabled: !C.history.undo.length, action: C.undo },
        { label: 'Redo', icon: 'redo', key: 'Ctrl+Y', disabled: !C.history.redo.length, action: C.redo },
        '-',
        { label: 'Cut', icon: 'blade', key: 'Ctrl+X', disabled: !C.selection.size, action: C.ops.cut },
        { label: 'Copy', icon: 'copy', key: 'Ctrl+C', disabled: !C.selection.size, action: C.ops.copy },
        { label: 'Paste', icon: 'copy', key: 'Ctrl+V', disabled: !C.ops.clipboard, action: C.ops.paste },
        { label: 'Duplicate', icon: 'copy', key: 'Ctrl+D', disabled: !C.selection.size, action: C.ops.duplicate },
        { label: 'Delete', icon: 'trash', key: 'Del', disabled: !C.selection.size, action: () => C.ops.deleteSelected(false) },
        { label: 'Ripple delete', icon: 'ripple', key: 'Shift+Del', disabled: !C.selection.size, action: () => C.ops.deleteSelected(true) },
        '-',
        { label: 'Select all', icon: 'check', key: 'Ctrl+A', action: C.ops.selectAll },
        { label: 'Select everything after playhead', icon: 'cursor', action: () => C.ops.selectAfter(C.UI.playhead, null) },
        { label: 'Deselect', icon: 'x', key: 'Ctrl+Shift+A', action: () => C.select([]) },
        '-',
        { label: 'Group', icon: 'link', key: 'Ctrl+G', disabled: C.selection.size < 2, action: C.ops.group },
        { label: 'Ungroup', icon: 'link', key: 'Ctrl+Shift+G', action: C.ops.ungroup },
        { label: 'Rename clip', icon: 'text', key: 'F2', disabled: !C.selection.size, action: () => C.ops.rename() },
        '-',
        { label: 'Command palette', icon: 'command', key: 'Ctrl+K', action: () => C.palette.open() },
      ],
      clip: () => {
        const p = C.primary();
        return [
          { label: 'Edit current frame in Photo editor', icon: 'photo', action: () => C.photoPanels.editVideoFrame() },
          ...(p && p.kind === 'image' ? [{ label: 'Edit this image in Photo editor', icon: 'photo', action: () => C.photoPanels.editImageFile(C.mediaPath(C.mediaOf(p))) }] : []),
          '-',
          { label: 'Split at playhead', icon: 'split', key: 'S', action: C.ops.splitAtPlayhead },
          { label: 'Detach audio', icon: 'detach', disabled: !(p && p.kind === 'video' && C.hasAudio(p)), action: () => C.ops.detachAudio(p) },
          { label: 'Freeze frame', icon: 'freeze', action: () => C.$('#tlFreeze').click() },
          '-',
          { label: 'Add text', icon: 'text', key: 'T', action: () => C.act('Add text', () => { const c = C.ops.addText(null); C.select([c.id]); C.emit('focusText'); }) },
          { label: 'Add sticker / emoji', icon: 'smile', action: () => C.library.show('stickers') },
          { label: 'Add effect…', icon: 'sparkles', action: () => C.presets.picker(C.selectedClips()) },
          { label: 'Effect Studio', icon: 'wand', action: () => C.presets.studio() },
          { label: 'Record voiceover', icon: 'mic', key: 'R', action: () => C.recorder.open() },
          { label: 'Picture-in-picture', icon: 'square', disabled: !(p && (p.kind === 'video' || p.kind === 'image')), action: () => C.ops.pip(p) },
          '-',
          { label: 'Set in point', icon: 'marker', key: 'I', action: () => C.tl.setRange('in') },
          { label: 'Set out point', icon: 'marker', key: 'O', action: () => C.tl.setRange('out') },
          { label: 'Clear in/out', icon: 'x', key: 'Alt+X', disabled: !C.project.range, action: () => C.tl.clearRange() },
          { label: 'Add marker', icon: 'marker', key: 'M', action: () => C.ops.addMarker() },
          '-',
          { label: 'Speed 0.5×', icon: 'gauge', disabled: !p || p.kind === 'text' || p.kind === 'image' || p.kind === 'color', action: () => setSpeed(p, 0.5) },
          { label: 'Speed 1×', icon: 'gauge', disabled: !p || p.kind === 'text' || p.kind === 'image' || p.kind === 'color', action: () => setSpeed(p, 1) },
          { label: 'Speed 2×', icon: 'gauge', disabled: !p || p.kind === 'text' || p.kind === 'image' || p.kind === 'color', action: () => setSpeed(p, 2) },
        ];
      },
      help: () => [
        { label: 'Keyboard shortcuts', icon: 'keyboard', key: '?', action: () => A.showShortcuts() },
        { label: 'Command palette', icon: 'command', key: 'Ctrl+K', action: () => C.palette.open() },
        { label: 'Open developer tools', icon: 'info', key: 'F12', action: () => {} },
        { label: 'About Cutroom', icon: 'sparkles', action: async () => { const i = await N.info(); C.modal(`<div class="modal-head"><h2>Cutroom</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div><div class="modal-body" style="text-align:center"><img src="icons/logo.svg" style="width:64px;height:64px"><p style="font-size:15px;font-weight:600">Cutroom ${i.version}</p><p class="hint">A fast, clean multi-track video editor.<br>Rendering & encoding powered by FFmpeg ${i.ffmpeg ? '(bundled)' : '(not found)'}.</p></div>`); } },
      ],
    };
    C.$$('.menu-btn').forEach((b) => b.addEventListener('click', (e) => {
      const open = b.classList.contains('open');
      C.closeMenu();
      if (open) return;
      b.classList.add('open');
      const r = b.getBoundingClientRect();
      const src = C.mode === 'photo' && C.photoPanels && C.photoPanels.menus[b.dataset.menu] ? C.photoPanels.menus : menus;
      C.menu(r.left, r.bottom + 4, src[b.dataset.menu]());
      e.stopPropagation();
    }));
  }
  A.showShortcuts = () => {
    const groups = [
      ['Playback', [['Play / pause', 'Space'], ['Shuttle', 'J / K / L'], ['Frame step', '← / →'], ['Jump 1 second', 'Shift + ← / →'], ['Previous / next edit', '↑ / ↓'], ['Start / end', 'Home / End'], ['In / out point', 'I / O'], ['Clear in/out', 'Alt + X']]],
      ['Editing', [['Split at playhead', 'S  or  Ctrl + B'], ['Blade / select tool', 'B / V'], ['Delete / ripple delete', 'Del / Shift + Del'], ['Copy / cut / paste', 'Ctrl + C / X / V'], ['Duplicate', 'Ctrl + D'], ['Duplicate by dragging', 'Alt + drag'], ['Nudge clip', 'Alt + ← / →'], ['Add text', 'T'], ['Add marker', 'M'], ['Record voiceover', 'R'], ['Undo / redo', 'Ctrl + Z / Ctrl + Y']]],
      ['Selecting', [['Select / add to selection', 'Click / Ctrl + click'], ['Select a range of clips', 'Shift + click'], ['Box select', 'Drag on empty track'], ['Next / previous clip', 'Tab / Shift + Tab'], ['Select all / none', 'Ctrl + A / Ctrl + Shift + A'], ['Group / ungroup', 'Ctrl + G / Ctrl + Shift + G'], ['Rename', 'F2']]],
      ['App', [['Command palette', 'Ctrl + K'], ['Import / Save / Open', 'Ctrl + I / S / O'], ['Export', 'Ctrl + E'], ['Zoom timeline', 'Ctrl + wheel, + / −'], ['Fit timeline', 'Shift + Z'], ['Snapping', 'N'], ['This list', '?']]],
    ];
    C.modal(`<div class="modal-head"><h2>Keyboard shortcuts</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div><div class="modal-body"><div class="sc-grid">${groups.map(([g, list]) => `<div><h4 class="pk-cat">${g}</h4><div class="shortcut-list">${list.map(([a, k]) => `<span>${a}</span><span class="kbd">${k}</span>`).join('')}</div></div>`).join('')}</div></div>`, { cls: 'wide' });
  };
  function setSpeed(c, v) {
    C.act('Speed', () => { const src = c.duration * c.speed; c.speed = v; c.duration = Math.max(C.frame(), C.snapTime(src / v)); });
  }

  window.addEventListener('DOMContentLoaded', () => A.boot().catch((e) => { console.error(e); alert('Cutroom failed to start: ' + e.message); }));
})(window.C);
