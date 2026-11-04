// Cutroom — share packages (.cutroompack = zip of project.json + media files)
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const yazl = require('yazl');
const yauzl = require('yauzl');

const safe = (s) => String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').slice(0, 120);

async function pack({ projectText, media, outPath, onProgress }) {
  const data = JSON.parse(projectText);
  const zip = new yazl.ZipFile();
  let total = 0, done = 0;
  const entries = [];
  for (const m of media) {
    try {
      const st = await fsp.stat(m.path);
      const name = `media/${m.id}_${safe(path.basename(m.path))}`;
      entries.push({ m, name, size: st.size });
      total += st.size;
      if (data.project.media[m.id]) data.project.media[m.id].path = name; // relative inside the package
    } catch (_) { /* missing file: skip */ }
  }
  data.packaged = true;
  zip.addBuffer(Buffer.from(JSON.stringify(data, null, 1)), 'project.json');
  for (const e of entries) {
    zip.addFile(e.m.path, e.name, { compress: false, size: e.size });
  }
  zip.end({ forceZip64Format: total > 3.9e9 });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outPath);
    let last = 0;
    zip.outputStream.on('data', (d) => { done += d.length; const now = Date.now(); if (now - last > 100) { last = now; onProgress && onProgress(total ? Math.min(1, done / total) : 1); } });
    zip.outputStream.pipe(out).on('close', resolve).on('error', reject);
  });
  return { ok: true, path: outPath, files: entries.length, missing: media.length - entries.length };
}

function unpack({ pkgPath, destRoot, onProgress }) {
  return new Promise((resolve) => {
    yauzl.open(pkgPath, { lazyEntries: true, autoClose: true }, async (err, zip) => {
      if (err) return resolve({ ok: false, error: 'Not a valid package: ' + err.message });
      const base = path.basename(pkgPath).replace(/\.cutroompack$/i, '');
      let dest = path.join(destRoot, safe(base));
      for (let i = 2; fs.existsSync(dest); i++) dest = path.join(destRoot, `${safe(base)} (${i})`);
      await fsp.mkdir(path.join(dest, 'media'), { recursive: true });
      let projectText = null;
      let n = 0;
      zip.on('entry', (entry) => {
        const name = entry.fileName.replace(/\\/g, '/');
        if (name.includes('..') || name.startsWith('/')) { zip.readEntry(); return; }
        if (name.endsWith('/')) { zip.readEntry(); return; }
        zip.openReadStream(entry, (e, rs) => {
          if (e) { zip.readEntry(); return; }
          if (name === 'project.json') {
            const chunks = []; rs.on('data', (d) => chunks.push(d));
            rs.on('end', () => { projectText = Buffer.concat(chunks).toString('utf8'); zip.readEntry(); });
          } else {
            const target = path.join(dest, name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            rs.pipe(fs.createWriteStream(target)).on('close', () => { n++; onProgress && onProgress(n / Math.max(1, zip.entryCount - 1)); zip.readEntry(); });
          }
        });
      });
      zip.on('end', async () => {
        if (!projectText) return resolve({ ok: false, error: 'Package has no project.json' });
        const data = JSON.parse(projectText);
        for (const id in data.project.media) {
          const m = data.project.media[id];
          if (m.path && m.path.startsWith('media/')) m.path = path.join(dest, m.path);
        }
        delete data.packaged;
        const projPath = path.join(dest, safe(data.project.name || base) + '.cutroom');
        await fsp.writeFile(projPath, JSON.stringify(data, null, 1), 'utf8');
        resolve({ ok: true, projectPath: projPath, folder: dest });
      });
      zip.readEntry();
    });
  });
}

module.exports = { pack, unpack };
