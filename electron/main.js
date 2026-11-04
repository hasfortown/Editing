// Cutroom — Electron main process
const { app, BrowserWindow, ipcMain, dialog, protocol, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { Readable } = require('stream');

const APP_DIR = path.join(__dirname, '..', 'app');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---------- FFmpeg location ----------
function findFFmpeg() {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    path.join(process.resourcesPath || '', 'ffmpeg', exe),
    path.join(__dirname, '..', 'vendor', 'ffmpeg', process.platform, exe),
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (_) {} }
  return exe; // fall back to PATH
}
const FFMPEG = findFFmpeg();
let FFMPEG_MAJOR = 0;
let FFMPEG_OK = false;
try {
  const r = spawnSync(FFMPEG, ['-version'], { encoding: 'utf8', windowsHide: true });
  const m = /ffmpeg version (?:n)?(\d+)/.exec(r.stdout || '');
  FFMPEG_OK = r.status === 0;
  FFMPEG_MAJOR = m ? parseInt(m[1], 10) : (FFMPEG_OK ? 7 : 0); // "N-xxxx" master builds are new
} catch (_) {}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
};

async function serveFile(filePath, request) {
  const stat = await fsp.stat(filePath);
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = request.headers.get('range');
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (!m || (!m[1] && m[2])) { start = Math.max(0, stat.size - parseInt(m[2], 10)); end = stat.size - 1; }
    end = Math.min(end, stat.size - 1);
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${stat.size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end }));
    return new Response(stream, {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(filePath));
  return new Response(stream, { status: 200, headers: { ...base, 'Content-Length': String(stat.size) } });
}

function registerProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host === 'media') {
        const p = decodeURIComponent(url.pathname.slice(1));
        return await serveFile(p, request);
      }
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const full = path.normalize(path.join(APP_DIR, rel));
      if (!full.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
      return await serveFile(full, request);
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });
}

// ---------- Window ----------
let win = null;
function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1080, minHeight: 680,
    backgroundColor: '#0d0e12',
    title: 'Cutroom',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#0d0e12', symbolColor: '#c9ccd6', height: 44 },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.once('ready-to-show', () => { win.show(); if (process.env.CUTROOM_MAXIMIZE !== '0') win.maximize(); });
  win.loadURL('app://cutroom/index.html');
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  registerProtocol();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- Helpers ----------
const userDir = () => app.getPath('userData');
const proxyDir = () => path.join(userDir(), 'proxies');

function runFFmpeg(args, { onStderr, onStdout } = {}) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { const s = d.toString(); err += s; if (err.length > 200000) err = err.slice(-100000); onStderr && onStderr(s); });
    if (onStdout) p.stdout.on('data', onStdout); else p.stdout.resume();
    p.on('error', (e) => resolve({ code: -1, err: String(e) }));
    p.on('close', (code) => resolve({ code, err }));
  });
}

function parseProbe(text) {
  const out = { duration: 0, hasVideo: false, hasAudio: false, width: 0, height: 0, vcodec: '', fps: 0 };
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (d) out.duration = (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]);
  const v = /Stream #\d+:\d+[^:]*: Video: (\w+)([^\n]*)/.exec(text);
  if (v) {
    out.vcodec = v[1];
    out.hasVideo = !/attached pic/.test(v[2]);
    const sz = /, (\d{2,5})x(\d{2,5})/.exec(v[2]);
    if (sz) { out.width = +sz[1]; out.height = +sz[2]; }
    const f = /, ([\d.]+) fps/.exec(v[2]) || /, ([\d.]+) tbr/.exec(v[2]);
    if (f) out.fps = parseFloat(f[1]);
  }
  out.hasAudio = /Stream #\d+:\d+[^:]*: Audio:/.test(text);
  return out;
}

function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s > 2.0) { parts.push('atempo=2.0'); s /= 2.0; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-4) parts.push(`atempo=${s.toFixed(5)}`);
  return parts;
}

// Build audio inputs + filter graph from a mixing plan.
// plan.segments: [{path, start, in, dur, speed, volume, fadeIn, fadeOut}]
function buildAudioGraph(plan, inputOffset, total, offset = 0) {
  const args = [];
  const filters = [];
  const labels = [];
  plan.segments.forEach((s, i) => {
    const srcDur = s.dur * s.speed + 0.25;
    args.push('-ss', Math.max(0, s.in).toFixed(4), '-t', srcDur.toFixed(4), '-i', s.path);
    const idx = inputOffset + i;
    const chain = [];
    chain.push('aformat=sample_rates=48000:channel_layouts=stereo');
    chain.push(...atempoChain(s.speed));
    chain.push(`atrim=0:${s.dur.toFixed(4)}`, 'asetpts=PTS-STARTPTS');
    if (s.volExpr && /^[\w().,+\-*/ ]+$/.test(s.volExpr)) chain.push(`volume='${s.volExpr}':eval=frame`);
    else chain.push(`volume=${Math.max(0, s.volume).toFixed(4)}`);
    if (s.fadeIn > 0.001) chain.push(`afade=t=in:st=0:d=${Math.min(s.fadeIn, s.dur).toFixed(4)}`);
    if (s.fadeOut > 0.001) {
      const fo = Math.min(s.fadeOut, s.dur);
      chain.push(`afade=t=out:st=${(s.dur - fo).toFixed(4)}:d=${fo.toFixed(4)}`);
    }
    const ms = Math.max(0, Math.round(s.start * 1000));
    if (ms > 0) chain.push(`adelay=${ms}|${ms}`);
    filters.push(`[${idx}:a]${chain.join(',')}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  if (labels.length === 0) return null;
  const tail = `apad,atrim=${offset.toFixed(4)}:${(offset + total).toFixed(4)},asetpts=PTS-STARTPTS[aout]`;
  if (labels.length === 1) filters.push(`${labels[0]}${tail}`);
  else filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,${tail}`);
  return { args, graph: filters.join(';\n') };
}

async function filterArgs(graph) {
  const f = path.join(os.tmpdir(), `cutroom-graph-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  await fsp.writeFile(f, graph, 'utf8');
  const flag = FFMPEG_MAJOR >= 7 ? '-/filter_complex' : '-filter_complex_script';
  return { args: [flag, f], file: f };
}

function audioCodecArgs(format) {
  switch (format) {
    case 'wav': return ['-c:a', 'pcm_s16le'];
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', '320k'];
    case 'm4a': return ['-c:a', 'aac', '-b:a', '256k'];
    case 'flac': return ['-c:a', 'flac'];
    default: return ['-c:a', 'pcm_s16le'];
  }
}

// ---------- IPC: dialogs & files ----------
const MEDIA_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mts', 'm2ts', 'ts', '3gp', 'mpg', 'mpeg',
  'mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma', 'aif', 'aiff',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

ipcMain.handle('dialog:openMedia', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Import media', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Media', extensions: MEDIA_EXT }, { name: 'All files', extensions: ['*'] }],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:openProject', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open project', properties: ['openFile'], filters: [{ name: 'Cutroom project', extensions: ['cutroom'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:saveProject', async (_e, name) => {
  const r = await dialog.showSaveDialog(win, { title: 'Save project', defaultPath: (name || 'Untitled') + '.cutroom', filters: [{ name: 'Cutroom project', extensions: ['cutroom'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:saveExport', async (_e, { name, ext, label }) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Export', defaultPath: path.join(app.getPath('videos') || app.getPath('documents'), `${name}.${ext}`),
    filters: [{ name: label || ext.toUpperCase(), extensions: [ext] }],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:chooseFolder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose folder', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('fs:readText', async (_e, p) => fsp.readFile(p, 'utf8'));
ipcMain.handle('fs:writeText', async (_e, p, text) => { await fsp.writeFile(p, text, 'utf8'); return true; });
ipcMain.handle('fs:exists', async (_e, p) => { try { await fsp.access(p); return true; } catch (_) { return false; } });
ipcMain.handle('fs:writeBinary', async (_e, p, buf) => { await fsp.writeFile(p, Buffer.from(buf)); return true; });
ipcMain.handle('autosave:load', async () => { try { return await fsp.readFile(path.join(userDir(), 'autosave.cutroom'), 'utf8'); } catch (_) { return null; } });
ipcMain.handle('autosave:save', async (_e, text) => { await fsp.mkdir(userDir(), { recursive: true }); await fsp.writeFile(path.join(userDir(), 'autosave.cutroom'), text, 'utf8'); return true; });
ipcMain.handle('shell:showItem', async (_e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('shell:openPath', async (_e, p) => shell.openPath(p));
ipcMain.handle('app:info', async () => ({ version: app.getVersion(), ffmpeg: FFMPEG_OK, ffmpegMajor: FFMPEG_MAJOR, platform: process.platform }));

// ---------- IPC: media ----------
ipcMain.handle('media:probe', async (_e, p) => {
  const r = await runFFmpeg(['-hide_banner', '-i', p]);
  const info = parseProbe(r.err);
  try { info.size = (await fsp.stat(p)).size; } catch (_) { info.size = 0; }
  return info;
});

ipcMain.handle('media:proxy', async (e, p, id) => {
  await fsp.mkdir(proxyDir(), { recursive: true });
  const st = await fsp.stat(p);
  const hash = crypto.createHash('sha1').update(p + ':' + st.size + ':' + st.mtimeMs).digest('hex').slice(0, 16);
  const out = path.join(proxyDir(), hash + '.mp4');
  try { await fsp.access(out); return { ok: true, path: out }; } catch (_) {}
  const tmp = out + '.part.mp4';
  const probe = parseProbe((await runFFmpeg(['-hide_banner', '-i', p])).err);
  const total = probe.duration || 1;
  const args = ['-hide_banner', '-y', '-i', p, '-map', '0:v:0?', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-vf', "scale='min(1920,iw)':-2", '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats', tmp];
  const r = await runFFmpeg(args, {
    onStdout: (d) => {
      const m = /out_time_ms=(\d+)/g; let x, last = null;
      const s = d.toString(); while ((x = m.exec(s))) last = x;
      if (last) e.sender.send('media:proxyProgress', id, Math.min(1, parseInt(last[1], 10) / 1e6 / total));
    },
  });
  if (r.code !== 0) { try { await fsp.unlink(tmp); } catch (_) {} return { ok: false, error: r.err.slice(-600) }; }
  await fsp.rename(tmp, out);
  return { ok: true, path: out };
});

ipcMain.handle('media:waveform', async (_e, p) => {
  // Mono 8 kHz float PCM -> 100 peaks per second
  const RATE = 8000, PER = 80;
  const peaks = [];
  let carry = Buffer.alloc(0);
  let cur = 0, n = 0;
  const r = await runFFmpeg(['-hide_banner', '-v', 'error', '-i', p, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'], {
    onStdout: (chunk) => {
      let buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 4);
      for (let o = 0; o < usable; o += 4) {
        const v = Math.abs(buf.readFloatLE(o));
        if (v > cur) cur = v;
        if (++n === PER) { peaks.push(cur); cur = 0; n = 0; }
      }
      carry = buf.subarray(usable);
    },
  });
  if (n > 0) peaks.push(cur);
  if (r.code !== 0 && peaks.length === 0) return null;
  return Float32Array.from(peaks.map((v) => Math.min(1, v)));
});

// ---------- IPC: export ----------
let job = null;

ipcMain.handle('export:start', async (_e, opts) => {
  if (job) return { ok: false, error: 'An export is already running.' };
  const { outPath, width, height, fps, format, quality, audio, duration, offset = 0 } = opts;
  const args = ['-hide_banner', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0'];
  let graphFile = null;
  const ag = format === 'gif' ? null : buildAudioGraph(audio, 1, duration, offset);
  if (ag) {
    args.push(...ag.args);
    const fa = await filterArgs(ag.graph); graphFile = fa.file;
    args.push(...fa.args, '-map', '0:v', '-map', '[aout]');
  } else if (format !== 'gif') {
    args.push('-map', '0:v');
  }
  const crf = { high: 17, medium: 21, low: 26 }[quality] ?? 21;
  if (format === 'mp4' || format === 'mov-h264') {
    args.push('-c:v', 'libx264', '-preset', quality === 'high' ? 'medium' : 'fast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high');
    if (ag) args.push('-c:a', 'aac', '-b:a', quality === 'low' ? '128k' : '256k');
    args.push('-movflags', '+faststart');
  } else if (format === 'prores') {
    args.push('-c:v', 'prores_ks', '-profile:v', quality === 'high' ? '3' : '2', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0');
    if (ag) args.push('-c:a', 'pcm_s16le');
  } else if (format === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf + 12), '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-pix_fmt', 'yuv420p');
    if (ag) args.push('-c:a', 'libopus', '-b:a', '192k');
  } else if (format === 'gif') {
    const gw = Math.min(width, 720);
    args.push('-vf', `fps=${Math.min(fps, 15)},scale=${gw}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`, '-loop', '0');
  }
  if (ag) args.push('-shortest');
  args.push(outPath);

  const proc = spawn(FFMPEG, args, { windowsHide: true });
  job = { proc, err: '', outPath, graphFile, done: null, cancelled: false };
  const j = job;
  proc.stderr.on('data', (d) => { j.err += d.toString(); if (j.err.length > 200000) j.err = j.err.slice(-100000); });
  proc.stdout.resume();
  proc.stdin.on('error', () => {});
  j.done = new Promise((resolve) => {
    proc.on('error', (e) => resolve({ code: -1, err: String(e) }));
    proc.on('close', (code) => resolve({ code }));
  });
  return { ok: true };
});

ipcMain.handle('export:frame', async (_e, buf) => {
  if (!job) return false;
  const b = Buffer.from(buf);
  return await new Promise((resolve) => {
    if (job.proc.exitCode !== null) return resolve(false);
    const ok = job.proc.stdin.write(b, () => resolve(true));
    if (!ok) { /* callback fires after flush */ }
  });
});

ipcMain.handle('export:finish', async () => {
  if (!job) return { ok: false, error: 'No export running' };
  const j = job;
  try { j.proc.stdin.end(); } catch (_) {}
  const r = await j.done;
  job = null;
  if (j.graphFile) fsp.unlink(j.graphFile).catch(() => {});
  if (j.cancelled) { fsp.unlink(j.outPath).catch(() => {}); return { ok: false, cancelled: true }; }
  if (r.code !== 0) return { ok: false, error: (j.err || r.err || '').slice(-1500) };
  return { ok: true, path: j.outPath };
});

ipcMain.handle('export:cancel', async () => {
  if (!job) return true;
  job.cancelled = true;
  try { job.proc.stdin.destroy(); } catch (_) {}
  try { job.proc.kill('SIGKILL'); } catch (_) {}
  return true;
});

ipcMain.handle('export:audio', async (e, opts) => {
  const { outPath, format, audio, duration, offset = 0 } = opts;
  const args = ['-hide_banner', '-y'];
  const ag = buildAudioGraph(audio, 0, duration, offset);
  let graphFile = null;
  if (ag) {
    args.push(...ag.args);
    const fa = await filterArgs(ag.graph); graphFile = fa.file;
    args.push(...fa.args, '-map', '[aout]');
  } else {
    args.push('-f', 'lavfi', '-t', duration.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
  }
  args.push('-ar', '48000', ...audioCodecArgs(format), '-progress', 'pipe:1', '-nostats', outPath);
  const r = await runFFmpeg(args, {
    onStdout: (d) => {
      const m = /out_time_ms=(\d+)/.exec(d.toString());
      if (m) e.sender.send('export:audioProgress', Math.min(1, parseInt(m[1], 10) / 1e6 / Math.max(0.01, duration)));
    },
  });
  if (graphFile) fsp.unlink(graphFile).catch(() => {});
  if (r.code !== 0) return { ok: false, error: r.err.slice(-1500) };
  return { ok: true, path: outPath };
});

// ---------- Collaboration (LAN) ----------
const collabMod = require('./collab');
let collab = null;
const sendToWin = (ch, ...a) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); };
app.whenReady().then(() => { collab = collabMod.create({ send: sendToWin, userDir: userDir() }); });
ipcMain.handle('collab:host', async (_e, o) => { try { return await collab.host(o); } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('collab:join', async (_e, o) => collab.join(o));
ipcMain.handle('collab:leave', async () => collab.leave());
ipcMain.handle('collab:send', async (_e, m) => { collab.sendMsg(m); return true; });
ipcMain.handle('collab:provideState', async (_e, reqId, state) => { collab.provideState(reqId, state); return true; });
ipcMain.handle('collab:registerMedia', async (_e, id, p) => { collab.registerMedia(id, p); return true; });
ipcMain.handle('collab:upload', async (_e, o) => collab.upload(o));
ipcMain.handle('collab:fetchMedia', async (_e, o) => collab.fetchMedia(o));
ipcMain.handle('collab:discoverStart', async () => collab.discoverStart());
ipcMain.handle('collab:discoverStop', async () => collab.discoverStop());
ipcMain.handle('collab:info', async () => collab.info());
app.on('before-quit', () => { try { collab && collab.leave(); } catch (_) {} });

// ---------- Share packages ----------
const share = require('./share');
ipcMain.handle('share:pack', async (e, o) => {
  try {
    return await share.pack({ ...o, onProgress: (v) => e.sender.send('share:progress', v) });
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('share:saveDialog', async (_e, name) => {
  const r = await dialog.showSaveDialog(win, { title: 'Save share package', defaultPath: path.join(app.getPath('documents'), name + '.cutroompack'), filters: [{ name: 'Cutroom share package', extensions: ['cutroompack'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('share:openDialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open project or package', properties: ['openFile'], filters: [{ name: 'Cutroom projects', extensions: ['cutroom', 'cutroompack'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('share:unpack', async (e, pkgPath) => {
  const destRoot = path.join(app.getPath('documents'), 'Cutroom Projects');
  await fsp.mkdir(destRoot, { recursive: true });
  return share.unpack({ pkgPath, destRoot, onProgress: (v) => e.sender.send('share:progress', v) });
});

// ---------- Open files passed on the command line / file association ----------
function fileFromArgv(argv) {
  return argv.slice(1).find((a) => /\.(cutroom|cutroompack)$/i.test(a) && fs.existsSync(a)) || null;
}
let pendingOpen = fileFromArgv(process.argv);
app.on('second-instance', (_e, argv) => { const f = fileFromArgv(argv); if (f) sendToWin('app:openFile', f); });
app.on('open-file', (e, f) => { e.preventDefault(); if (win) sendToWin('app:openFile', f); else pendingOpen = f; });
ipcMain.handle('app:pendingOpen', async () => { const f = pendingOpen; pendingOpen = null; return f; });

// ---------- Sequential frame decoders for fast export ----------
const decoders = new Map();
ipcMain.handle('dec:open', async (_e, { key, path: p, start, rate, width, height }) => {
  const old = decoders.get(key); if (old) { try { old.proc.kill('SIGKILL'); } catch (_) {} }
  const frameSize = width * height * 4;
  const args = ['-hide_banner', '-v', 'error', '-ss', Math.max(0, start).toFixed(4), '-i', p, '-an', '-sn',
    '-vf', `fps=${rate.toFixed(5)}:start_time=0:round=near,scale=${width}:${height}:flags=bicubic`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'];
  const proc = spawn(FFMPEG, args, { windowsHide: true });
  const d = { proc, frameSize, chunks: [], buffered: 0, frames: [], waiters: [], ended: false, paused: false };
  const pump = () => {
    while (d.buffered >= frameSize) {
      const buf = Buffer.concat(d.chunks, d.buffered);
      let off = 0;
      while (buf.length - off >= frameSize) { d.frames.push(buf.subarray(off, off + frameSize)); off += frameSize; }
      const rest = buf.subarray(off);
      d.chunks = rest.length ? [Buffer.from(rest)] : []; d.buffered = rest.length;
    }
    while (d.waiters.length && (d.frames.length || d.ended)) d.waiters.shift()(d.frames.shift() || null);
    if (d.frames.length > 6 && !d.paused) { d.paused = true; proc.stdout.pause(); }
  };
  proc.stdout.on('data', (c) => { d.chunks.push(c); d.buffered += c.length; pump(); });
  proc.stdout.on('end', () => { d.ended = true; pump(); });
  proc.on('error', () => { d.ended = true; pump(); });
  proc.stderr.resume();
  decoders.set(key, d);
  return true;
});
ipcMain.handle('dec:next', async (_e, key, skip = 0) => {
  const d = decoders.get(key); if (!d) return null;
  const take = () => new Promise((res) => {
    if (d.frames.length || d.ended) res(d.frames.shift() || null); else d.waiters.push(res);
    if (d.paused && d.frames.length <= 3) { d.paused = false; d.proc.stdout.resume(); }
  });
  let f = await take();
  for (let i = 0; i < skip && f; i++) { const g = await take(); if (!g) break; f = g; }
  if (d.paused && d.frames.length <= 3) { d.paused = false; d.proc.stdout.resume(); }
  return f;
});
ipcMain.handle('dec:close', async (_e, key) => {
  const keys = key ? [key] : [...decoders.keys()];
  for (const k of keys) { const d = decoders.get(k); if (d) { try { d.proc.kill('SIGKILL'); } catch (_) {} decoders.delete(k); } }
  return true;
});

// ---------- Effect presets ----------
const presetsFile = () => path.join(userDir(), 'presets.json');
ipcMain.handle('presets:load', async () => { try { return await fsp.readFile(presetsFile(), 'utf8'); } catch (_) { return null; } });
ipcMain.handle('presets:save', async (_e, text) => { await fsp.mkdir(userDir(), { recursive: true }); await fsp.writeFile(presetsFile(), text, 'utf8'); return true; });
ipcMain.handle('presets:exportDialog', async (_e, name) => {
  const r = await dialog.showSaveDialog(win, { title: 'Export effect presets', defaultPath: path.join(app.getPath('documents'), (name || 'My presets') + '.cutfx'), filters: [{ name: 'Cutroom effect presets', extensions: ['cutfx'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('presets:importDialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Import effect presets', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Cutroom effect presets', extensions: ['cutfx', 'json'] }] });
  if (r.canceled) return [];
  const out = [];
  for (const f of r.filePaths) { try { out.push({ path: f, text: await fsp.readFile(f, 'utf8') }); } catch (_) {} }
  return out;
});

// ---------- Voice-over recordings ----------
ipcMain.handle('rec:save', async (_e, { buffer, projectPath, name }) => {
  const dir = projectPath ? path.join(path.dirname(projectPath), 'Cutroom Recordings') : path.join(app.getPath('documents'), 'Cutroom Recordings');
  await fsp.mkdir(dir, { recursive: true });
  const base = (name || 'Voiceover').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+\d+$/, '');
  let out;
  for (let i = 1; ; i++) { out = path.join(dir, `${base} ${i}.m4a`); if (!fs.existsSync(out)) break; }
  const tmp = path.join(os.tmpdir(), `cutroom-rec-${Date.now()}.webm`);
  await fsp.writeFile(tmp, Buffer.from(buffer));
  const r = await runFFmpeg(['-hide_banner', '-y', '-i', tmp, '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', out]);
  fsp.unlink(tmp).catch(() => {});
  if (r.code !== 0) return { ok: false, error: r.err.slice(-600) };
  return { ok: true, path: out };
});

// microphone access for voice-overs
app.whenReady().then(() => {
  const { session } = require('electron');
  const allow = new Set(['media', 'microphone', 'audioCapture', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allow.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allow.has(perm));
});

// ---------- Recent projects ----------
const recentsFile = () => path.join(userDir(), 'recents.json');
ipcMain.handle('recents:load', async () => { try { return JSON.parse(await fsp.readFile(recentsFile(), 'utf8')); } catch (_) { return []; } });
ipcMain.handle('recents:save', async (_e, list) => { await fsp.mkdir(userDir(), { recursive: true }); await fsp.writeFile(recentsFile(), JSON.stringify(list.slice(0, 24)), 'utf8'); return true; });
