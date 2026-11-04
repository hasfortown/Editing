/* Cutroom — voice-over recording */
(function (C) {
  const R = (C.recorder = {});
  const opt = { play: true, countdown: true, mute: false, device: '' };
  try { Object.assign(opt, JSON.parse(localStorage.getItem('cutroom.rec') || '{}')); } catch (_) {}
  const saveOpt = () => { try { localStorage.setItem('cutroom.rec', JSON.stringify(opt)); } catch (_) {} };

  R.open = async () => {
    if (C.UI.recording) return;
    try { Object.assign(opt, JSON.parse(localStorage.getItem('cutroom.rec') || '{}')); } catch (_) {}
    C.engine.pause();
    let stream = null, actx = null, meterRaf = null, rec = null, chunks = [], state = 'idle', startAt = C.UI.playhead, t0 = 0, cdTimer = null;
    const { el, close } = C.modal(`<div class="modal-head"><h2>${C.icon('mic').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px;color:#ff5d6c"')}Record voiceover</h2><button class="icon-btn" data-x>${C.icon('x')}</button></div>
      <div class="modal-body">
        <div class="form-row"><label>Microphone</label><select class="select" id="rDev"><option value="">Default microphone</option></select></div>
        <div class="form-row"><label>Input level</label><div class="rec-meter"><div id="rLvl"></div></div></div>
        <div class="form-row"><label>Starts at</label><div><b style="font-family:var(--mono);color:var(--accent)">${C.fmtTC(startAt, C.fps())}</b> <span class="hint">— the playhead position</span></div></div>
        <div class="rec-opts">
          <label><input type="checkbox" id="rPlay"> Play the timeline while I record</label>
          <label><input type="checkbox" id="rMute"> Mute the timeline's sound while recording</label>
          <label><input type="checkbox" id="rCd"> 3-second countdown</label>
        </div>
        <div class="rec-stage"><div class="rec-big" id="rBig"></div><div class="rec-time" id="rTime">00:00</div></div>
        <p class="hint" style="text-align:center">Tip: wear headphones so the video's sound isn't picked up by your mic.</p>
      </div>
      <div class="modal-foot"><button class="btn" data-x>Cancel</button><button class="btn rec-btn" id="rGo">${C.icon('record')}<span>Start recording</span></button></div>`, { onClose: cleanup });
    const $ = (s) => el.querySelector(s);
    $('#rPlay').checked = opt.play; $('#rMute').checked = opt.mute; $('#rCd').checked = opt.countdown;
    ['rPlay', 'rMute', 'rCd'].forEach((id) => $('#' + id).addEventListener('change', () => { opt.play = $('#rPlay').checked; opt.mute = $('#rMute').checked; opt.countdown = $('#rCd').checked; saveOpt(); }));
    el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { if (state === 'recording') return stop(); close(); }));

    function cleanup() {
      cancelAnimationFrame(meterRaf); clearInterval(cdTimer);
      if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (_) {} }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (actx) actx.close().catch(() => {});
      if (C.UI.recording) { C.UI.recording = null; C.tl.renderRec(); if (C.engine.master) C.engine.master.gain.value = 1; }
    }

    async function openMic() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(meterRaf);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: opt.device ? { exact: opt.device } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      } catch (e) {
        $('#rBig').innerHTML = `<div class="hint" style="color:var(--danger);max-width:420px">Couldn't open a microphone (${C.esc(e.name || e.message)}).<br>On Windows, check <b>Settings → Privacy & security → Microphone</b> and allow desktop apps.</div>`;
        $('#rGo').disabled = true; return;
      }
      $('#rGo').disabled = false;
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const sel = $('#rDev');
      sel.innerHTML = devs.map((d, i) => `<option value="${C.esc(d.deviceId)}">${C.esc(d.label || 'Microphone ' + (i + 1))}</option>`).join('') || '<option value="">Default microphone</option>';
      const cur = stream.getAudioTracks()[0] && stream.getAudioTracks()[0].getSettings().deviceId;
      sel.value = opt.device || cur || sel.value;
      if (!actx) actx = new AudioContext();
      const an = actx.createAnalyser(); an.fftSize = 1024; actx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize); const lvl = $('#rLvl');
      const tick = () => {
        an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v));
        const db = 20 * Math.log10(pk + 1e-6); const w = C.clamp((db + 60) / 60, 0, 1);
        lvl.style.width = w * 100 + '%'; lvl.style.background = pk > 0.95 ? 'var(--danger)' : pk > 0.6 ? 'var(--warn)' : 'var(--accent)';
        if (state === 'recording') {
          const s = (performance.now() - t0) / 1000; $('#rTime').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
          if (!opt.play) { C.UI.playhead = startAt + s; C.emit('time'); }
          C.tl.renderRec();
        }
        meterRaf = requestAnimationFrame(tick);
      };
      tick();
    }
    $('#rDev').addEventListener('change', (e) => { opt.device = e.target.value; saveOpt(); openMic(); });
    await openMic();
    $('#rBig').innerHTML = `<div class="hint">Press <b style="color:var(--text)">Start recording</b> when you're ready.</div>`;

    $('#rGo').onclick = () => { if (state === 'idle') begin(); else if (state === 'recording') stop(); };

    function begin() {
      if (!stream) return;
      state = 'countdown'; C._modalDismissable = false;
      $('#rGo').disabled = true;
      let n = opt.countdown ? 3 : 0;
      const go = () => {
        clearInterval(cdTimer);
        chunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined);
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.start(250);
        t0 = performance.now(); state = 'recording';
        startAt = C.UI.playhead;
        C.UI.recording = { start: startAt };
        if (opt.mute) { C.engine.ensureAudio(); if (C.engine.master) C.engine.master.gain.value = 0; }
        if (opt.play) C.engine.play();
        $('#rBig').innerHTML = '<div class="rec-dot"></div>';
        $('#rGo').disabled = false; $('#rGo').innerHTML = `${C.icon('stop')}<span>Stop recording</span>`;
      };
      if (!n) return go();
      $('#rBig').innerHTML = `<div class="rec-count">${n}</div>`;
      cdTimer = setInterval(() => { n--; if (n <= 0) go(); else $('#rBig').innerHTML = `<div class="rec-count">${n}</div>`; }, 1000);
    }

    async function stop() {
      if (state !== 'recording') return;
      state = 'saving';
      C.engine.pause();
      if (C.engine.master) C.engine.master.gain.value = 1;
      const dur = (performance.now() - t0) / 1000;
      await new Promise((res) => { rec.onstop = res; rec.stop(); });
      C.UI.recording = null; C.tl.renderRec();
      $('#rGo').disabled = true; $('#rBig').innerHTML = '<div class="hint">Saving your recording…</div>';
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (dur < 0.3 || blob.size < 1000) { C._modalDismissable = true; close(); C.toast('Recording was too short', 'info'); return; }
      const r = await window.native.recSave({ buffer: await blob.arrayBuffer(), projectPath: C.UI.filePath, name: 'Voiceover' });
      C._modalDismissable = true; close();
      if (!r.ok) { C.toast('Could not save the recording: ' + (r.error || ''), 'err', 6000); return; }
      let trackId = C.tracks().find((t) => t.type === 'audio' && t.name === 'Voiceover')?.id;
      if (!trackId || C.overlaps(trackId, startAt, startAt + dur)) C.act('Add voiceover track', () => { trackId = C.addTrack('audio'); C.project.tracks[trackId].name = 'Voiceover'; });
      await C.importPaths([r.path], { addToTimeline: true, at: startAt, trackId });
      C.toast(`Voiceover added (${C.fmtDur(dur)}) — saved to ${r.path}`, 'ok', 4500);
    }
  };
})(window.C);
