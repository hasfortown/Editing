/* Cutroom — export (video via FFmpeg pipe, audio mixdown & stems, snapshot) */
(function (C) {
  const X = (C.exporter = {});
  let tab = 'video';
  const opts = { format: 'mp4', res: 1080, fps: 0, quality: 'high', aformat: 'wav', amode: 'mix', rangeOnly: true };
  const span = () => { const r = C.project.range; return r && opts.rangeOnly ? { off: r.in, dur: r.out - r.in, ranged: true } : { off: 0, dur: C.duration(), ranged: false }; };
  const rangeRow = () => C.project.range ? `<div class="form-row"><label>Length</label><div class="seg" id="exRg"><button data-v="1">In/out range (${C.fmtDur(C.project.range.out - C.project.range.in)})</button><button data-v="0">Whole timeline</button></div></div>` : '';
  const wireRange = (form, upd) => { const g = form.querySelector('#exRg'); if (!g) return; const sync = () => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.v === '1') === opts.rangeOnly)); g.querySelectorAll('button').forEach((b) => (b.onclick = () => { opts.rangeOnly = b.dataset.v === '1'; sync(); upd && upd(); })); sync(); };
  const FORMATS = {
    mp4: { ext: 'mp4', label: 'MP4 (H.264)', note: 'Best for sharing — plays everywhere' },
    prores: { ext: 'mov', label: 'MOV (ProRes 422)', note: 'Editing-grade master, very large files' },
    webm: { ext: 'webm', label: 'WebM (VP9)', note: 'Great for the web, slower to encode' },
    gif: { ext: 'gif', label: 'Animated GIF', note: 'No audio, max 720px wide, 15 fps' },
  };
  const AFORMATS = { wav: 'WAV (lossless)', mp3: 'MP3 (320 kbps)', m4a: 'M4A / AAC', flac: 'FLAC (lossless)' };

  function dims() {
    const s = C.project.settings;
    const short = Math.min(s.width, s.height);
    const k = Math.min(opts.res, 4320) / short;
    const ev = (v) => Math.max(2, Math.round(v / 2) * 2);
    return { W: ev(s.width * k), H: ev(s.height * k) };
  }
  const safeName = () => (C.project.name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Untitled';

  X.opts = opts;
  X.open = (which) => {
    if (which) tab = which;
    if (C.UI.playing) C.engine.pause();
    const dur = C.duration();
    if (dur <= 0 && tab !== 'share') { C.toast('Add something to the timeline before exporting', 'info'); return; }
    const { el, close } = C.modal(`<div class="modal-head"><h2>Export</h2><button class="icon-btn" data-close>${C.icon('x')}</button></div>
      <div class="modal-body">
        <div class="export-tabs">
          <button class="chip" data-tab="video">${'Video'}</button><button class="chip" data-tab="audio">Audio</button><button class="chip" data-tab="share">Share project</button>
        </div>
        <div class="export-grid"><div><div class="export-preview"><canvas id="exPrev" style="max-width:100%;max-height:100%"></canvas></div>
        <div class="hint" style="margin-top:10px" id="exInfo"></div></div><div id="exForm"></div></div>
      </div>
      <div class="modal-foot" id="exFoot"></div>`);
    const pv = el.querySelector('#exPrev');
    const s = C.project.settings;
    const pw = 260, ph = Math.round((260 * s.height) / s.width);
    pv.width = pw * 2; pv.height = ph * 2;
    pv.parentElement.style.aspectRatio = `${s.width}/${s.height}`;
    pv.getContext('2d').drawImage(C.engine.canvas, 0, 0, pv.width, pv.height);
    el.querySelector('#exInfo').innerHTML = `Duration <b style="color:var(--text)">${C.fmtTC(dur, C.fps())}</b> · ${C.allClips().length} clips · ${C.tracks().length} tracks`;
    const renderTab = () => {
      el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      const form = el.querySelector('#exForm'), foot = el.querySelector('#exFoot');
      if (tab === 'video') {
        const fpsOpts = [0, 24, 25, 30, 50, 60];
        form.innerHTML = `
          <div class="form-row"><label>File name</label><input class="text-input" id="exName" value="${C.esc(safeName())}"></div>
          <div class="form-row"><label>Format</label><select class="select" id="exFmt">${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select></div>
          <div class="form-row"><label>Resolution</label><select class="select" id="exRes">${[480, 720, 1080, 1440, 2160].map((r) => `<option value="${r}">${r === 2160 ? '4K' : r === 1440 ? '2K' : r + 'p'}</option>`).join('')}</select></div>
          <div class="form-row"><label>Frame rate</label><select class="select" id="exFps">${fpsOpts.map((f) => `<option value="${f}">${f ? f + ' fps' : `Project (${C.fps()} fps)`}</option>`).join('')}</select></div>
          <div class="form-row"><label>Quality</label><div class="seg" id="exQ"><button data-v="low">Smaller</button><button data-v="medium">Balanced</button><button data-v="high">Best</button></div></div>
          ${rangeRow()}
          <p class="est" id="exEst"></p>`;
        foot.innerHTML = `<button class="btn" data-close>Cancel</button><button class="btn primary" id="exGo">${C.icon('export')}<span>Export video</span></button>`;
        const fmt = form.querySelector('#exFmt'), res = form.querySelector('#exRes'), fps = form.querySelector('#exFps');
        fmt.value = opts.format; res.value = opts.res; fps.value = opts.fps;
        const upd = () => {
          opts.format = fmt.value; opts.res = +res.value; opts.fps = +fps.value;
          form.querySelectorAll('#exQ button').forEach((b) => b.classList.toggle('on', b.dataset.v === opts.quality));
          const { W, H } = dims();
          const rate = { mp4: { high: 0.12, medium: 0.07, low: 0.035 }, prores: { high: 1.2, medium: 0.8, low: 0.8 }, webm: { high: 0.08, medium: 0.05, low: 0.025 }, gif: { high: 0.3, medium: 0.3, low: 0.3 } }[opts.format][opts.quality];
          const sd = span().dur;
          const bytes = (W * H * (opts.fps || C.fps()) * rate * sd) / 8 + sd * 32000;
          form.querySelector('#exEst').innerHTML = `${W} × ${H} · ${FORMATS[opts.format].note}<br>Estimated size ≈ ${C.fmtBytes(bytes)}`;
        };
        [fmt, res, fps].forEach((x) => x.addEventListener('change', upd));
        form.querySelectorAll('#exQ button').forEach((b) => (b.onclick = () => { opts.quality = b.dataset.v; upd(); }));
        wireRange(form, upd);
        upd();
        foot.querySelector('#exGo').onclick = () => X.runVideo(form.querySelector('#exName').value || safeName(), el, close);
      } else if (tab === 'audio') {
        const audTracks = C.tracks().filter((t) => C.clipsOn(t.id).some((c) => C.hasAudio(c)));
        form.innerHTML = `
          <div class="form-row"><label>File name</label><input class="text-input" id="exName" value="${C.esc(safeName())}"></div>
          <div class="form-row"><label>Format</label><select class="select" id="exAF">${Object.entries(AFORMATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="form-row"><label>Export</label><div class="seg" id="exAM"><button data-v="mix">Full mix</button><button data-v="stems">Each track (stems)</button></div></div>
          ${rangeRow()}
          <p class="est" id="exAEst"></p>`;
        foot.innerHTML = `<button class="btn" data-close>Cancel</button><button class="btn primary" id="exGo">${C.icon('audio')}<span>Export audio</span></button>`;
        const af = form.querySelector('#exAF'); af.value = opts.aformat;
        const upd = () => {
          opts.aformat = af.value;
          form.querySelectorAll('#exAM button').forEach((b) => b.classList.toggle('on', b.dataset.v === opts.amode));
          form.querySelector('#exAEst').innerHTML = opts.amode === 'mix'
            ? 'All unmuted audio — video clip sound, music and voice-over — mixed into one file with your volumes and fades.'
            : `One file per track (${audTracks.length} track${audTracks.length === 1 ? '' : 's'} with audio): ${audTracks.map((t) => C.esc(t.name)).join(', ') || '—'}. Every file runs the full timeline length, so they line up in any DAW.`;
        };
        af.addEventListener('change', upd);
        wireRange(form, null);
        form.querySelectorAll('#exAM button').forEach((b) => (b.onclick = () => { opts.amode = b.dataset.v; upd(); }));
        upd();
        foot.querySelector('#exGo').onclick = () => X.runAudio(form.querySelector('#exName').value || safeName(), el, close);
      } else {
        form.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px">Share this project</h3>
          <p class="hint">Bundles the project <b style="color:var(--text)">and every media file it uses</b> into a single <span class="kbd">.cutroompack</span> file. Send it by USB drive, cloud storage or email — whoever opens it in Cutroom gets the full editable timeline.</p>
          <p class="hint">Want to edit together at the same time? Use <b style="color:var(--text)">Collaborate</b> and share your join code.</p>`;
        foot.innerHTML = `<button class="btn" id="exCollab">${C.icon('users')}<span>Collaborate live</span></button><button class="btn primary" id="exGo">${C.icon('share')}<span>Create share package</span></button>`;
        foot.querySelector('#exGo').onclick = () => { close(); C.share.pack(); };
        foot.querySelector('#exCollab').onclick = () => { close(); C.collabUI.open(); };
      }
      C.fillIcons(el);
      el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
    };
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderTab(); }));
    renderTab();
  };

  function progressView(el, title) {
    const form = el.querySelector('#exForm'), foot = el.querySelector('#exFoot');
    el.querySelectorAll('[data-tab], .modal-head [data-close]').forEach((b) => (b.disabled = true));
    form.innerHTML = `<h3 style="margin:0 0 14px;font-size:14px">${C.esc(title)}</h3><div class="progress"><div id="exBar"></div></div><div class="export-stats"><span id="exPct">0%</span><span id="exEta">Preparing…</span></div><p class="hint" id="exMsg" style="margin-top:14px">You can keep this window open — exporting renders every frame exactly.</p>`;
    foot.innerHTML = '<button class="btn danger" id="exCancel">Cancel export</button>';
    C._modalDismissable = false;
    return { bar: form.querySelector('#exBar'), pct: form.querySelector('#exPct'), eta: form.querySelector('#exEta'), msg: form.querySelector('#exMsg'), cancel: foot.querySelector('#exCancel') };
  }
  function doneView(el, close, path, label) {
    C._modalDismissable = true;
    el.querySelector('#exForm').innerHTML = `<div style="text-align:center;padding:10px 0"><div class="success-ico">${C.icon('check')}</div><h3 style="margin:0 0 6px">${C.esc(label)}</h3><p class="hint" style="word-break:break-all">${C.esc(path)}</p></div>`;
    el.querySelector('#exFoot').innerHTML = `<button class="btn" id="exShow">${C.icon('folder')}<span>Show in folder</span></button><button class="btn" id="exOpen">${C.icon('play')}<span>Open</span></button><button class="btn primary" id="exDone">Done</button>`;
    el.querySelector('#exShow').onclick = () => window.native.showItem(path);
    el.querySelector('#exOpen').onclick = () => window.native.openPath(path);
    el.querySelector('#exDone').onclick = close;
  }
  function failView(el, close, msg) {
    C._modalDismissable = true;
    el.querySelector('#exForm').innerHTML = `<div style="text-align:center;padding:10px 0"><div class="success-ico" style="background:rgba(255,93,108,.12);color:var(--danger)">${C.icon('alert')}</div><h3 style="margin:0 0 6px">Export failed</h3><pre class="hint" style="text-align:left;white-space:pre-wrap;max-height:180px;overflow:auto;font-size:11px;background:var(--bg-2);padding:10px;border-radius:8px">${C.esc(msg || 'Unknown error')}</pre></div>`;
    el.querySelector('#exFoot').innerHTML = '<button class="btn primary" id="exDone">Close</button>';
    el.querySelector('#exDone').onclick = close;
  }

  X.runVideo = async (name, el, close, outPath) => {
    const f = FORMATS[opts.format];
    const out = outPath || await window.native.saveExportDialog({ name, ext: f.ext, label: f.label });
    if (!out) return;
    const { W, H } = dims();
    const fps = opts.fps || C.fps();
    const sp = span(); const dur = sp.dur;
    const N = Math.max(1, Math.round(dur * fps));
    const ui = progressView(el, `Exporting ${C.baseName(out)}`);
    let cancelled = false;
    ui.cancel.onclick = () => { cancelled = true; ui.msg.textContent = 'Cancelling…'; };
    C.UI.exporting = true;
    C.engine.stopAll();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { alpha: false, willReadFrequently: true });
    const pv = el.querySelector('#exPrev'); const pctx = pv.getContext('2d');
    const st = await window.native.exportStart({ outPath: out, width: W, height: H, fps, format: opts.format, quality: opts.quality, audio: C.audioPlan(), duration: N / fps, offset: sp.off });
    if (!st.ok) { C.UI.exporting = false; failView(el, close, st.error); return; }
    const t0 = performance.now();
    const sess = C.engine.exportSession(W, H, fps);
    let ok = true, errMsg = '';
    try {
      for (let i = 0; i < N; i++) {
        if (cancelled) break;
        await sess.frame(i, ctx, sp.off);
        const img = ctx.getImageData(0, 0, W, H);
        const w = await window.native.exportFrame(img.data.buffer);
        if (!w) { ok = false; break; }
        if (i % 6 === 0 || i === N - 1) {
          const p = (i + 1) / N;
          ui.bar.style.width = p * 100 + '%';
          ui.pct.textContent = `${Math.round(p * 100)}% · frame ${i + 1} / ${N}`;
          const el2 = (performance.now() - t0) / 1000;
          const rate = (i + 1) / el2;
          ui.eta.textContent = `${rate.toFixed(1)} fps · ${C.fmtDur((N - i - 1) / rate)} left`;
          pctx.drawImage(cv, 0, 0, pv.width, pv.height);
        }
      }
    } catch (e) { console.error(e); ok = false; errMsg = e.message; }
    sess.close();
    if (cancelled) await window.native.exportCancel();
    ui.msg.textContent = cancelled ? 'Cancelling…' : 'Finishing file…';
    const r = await window.native.exportFinish();
    C.UI.exporting = false;
    C.engine.resize(); C.engine.seek(C.UI.playhead);
    if (cancelled || r.cancelled) { C._modalDismissable = true; close(); C.toast('Export cancelled', 'info'); return; }
    if (!ok || !r.ok) { failView(el, close, errMsg || r.error || 'The encoder stopped unexpectedly.'); return; }
    doneView(el, close, r.path, `Exported in ${C.fmtDur((performance.now() - t0) / 1000)}`);
  };

  X.runAudio = async (name, el, close, outPath) => {
    const sp = span(); const dur = sp.dur;
    const ext = opts.aformat;
    const jobs = [];
    if (opts.amode === 'mix') {
      const out = outPath || await window.native.saveExportDialog({ name, ext, label: AFORMATS[ext] });
      if (!out) return;
      jobs.push({ out, plan: C.audioPlan(), label: 'Mix' });
    } else {
      const folder = outPath || await window.native.chooseFolder();
      if (!folder) return;
      const sep = window.native.platform === 'win32' ? '\\' : '/';
      for (const tr of C.tracks()) {
        if (!C.clipsOn(tr.id).some((c) => C.hasAudio(c))) continue;
        const plan = C.audioPlan((t) => t.id === tr.id);
        if (!plan.segments.length) continue;
        jobs.push({ out: `${folder}${sep}${name} - ${tr.name.replace(/[\\/:*?"<>|]+/g, '_')}.${ext}`, plan, label: tr.name });
      }
      if (!jobs.length) { C.toast('No unmuted audio found on any track', 'err'); return; }
    }
    const ui = progressView(el, opts.amode === 'mix' ? 'Mixing audio' : `Exporting ${jobs.length} stems`);
    ui.cancel.style.display = 'none';
    let cur = 0;
    window.native.onAudioProgress((v) => { const p = (cur + v) / jobs.length; ui.bar.style.width = p * 100 + '%'; ui.pct.textContent = Math.round(p * 100) + '%'; });
    for (const j of jobs) {
      ui.eta.textContent = j.label;
      const r = await window.native.exportAudio({ outPath: j.out, format: ext, audio: j.plan, duration: dur, offset: sp.off });
      if (!r.ok) { failView(el, close, r.error); return; }
      cur++;
    }
    doneView(el, close, jobs.length === 1 ? jobs[0].out : jobs[0].out.replace(/[^\\/]+$/, ''), jobs.length === 1 ? 'Audio exported' : `${jobs.length} stems exported`);
  };

  X.snapshot = async () => {
    const s = C.project.settings;
    const out = await window.native.saveExportDialog({ name: `${safeName()} - ${C.fmtTC(C.UI.playhead, C.fps()).replace(/:/g, '-')}`, ext: 'png', label: 'PNG image' });
    if (!out) return;
    const cv = document.createElement('canvas'); cv.width = s.width; cv.height = s.height;
    const ctx = cv.getContext('2d');
    C.UI.exporting = true;
    await C.engine.renderExact(C.UI.playhead, ctx, s.width, s.height);
    C.UI.exporting = false;
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    await window.native.writeBinary(out, await blob.arrayBuffer());
    C.engine.seek(C.UI.playhead);
    C.toast('Frame saved');
  };
})(window.C);
