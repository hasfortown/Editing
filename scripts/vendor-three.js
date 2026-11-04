// Copies the parts of three.js that Cutroom Animate 3D uses into app/vendor/three,
// rewriting bare `from 'three'` imports to relative paths (no import map needed).
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'node_modules', 'three'), OUT = path.join(__dirname, '..', 'app', 'vendor', 'three');
const files = ['build/three.module.js', 'build/three.core.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/FBXLoader.js', 'examples/jsm/loaders/OBJLoader.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/controls/TransformControls.js', 'examples/jsm/utils/SkeletonUtils.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/curves/NURBSCurve.js', 'examples/jsm/curves/NURBSUtils.js', 'examples/jsm/libs/fflate.module.js'];
fs.rmSync(OUT, { recursive: true, force: true });
for (const f of files) {
  const dst = path.join(OUT, f.replace(/^build\//, '').replace(/^examples\/jsm\//, 'addons/'));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  let s = fs.readFileSync(path.join(SRC, f), 'utf8');
  const rel = path.relative(path.dirname(dst), path.join(OUT, 'three.module.js')).replace(/\\/g, '/');
  s = s.replace(/from\s+'three'/g, `from '${rel.startsWith('.') ? rel : './' + rel}'`);
  fs.writeFileSync(dst, s);
}
fs.copyFileSync(path.join(SRC, 'LICENSE'), path.join(OUT, 'LICENSE'));
console.log('vendored three', require(path.join(SRC, 'package.json')).version, '->', OUT);
