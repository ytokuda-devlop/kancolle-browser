// Inspect final NSIS/portable payloads without running the installers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const asar = require('@electron/asar');
const verifyLicenses = require('./verify-packaged-licenses.cjs');
const root = path.resolve(__dirname, '..');
const build = path.resolve(process.argv[2] || 'release/version-audit-build');
const output = path.resolve(process.argv[3] || `audits/notice-versions/${crypto.randomUUID()}`);
const read = p => fs.readFileSync(p);
const hash = p => crypto.createHash('sha256').update(read(p)).digest('hex');
const lockPath = path.join(root, 'package-lock.json');
const lock = JSON.parse(read(lockPath));
const noticePath = path.join(root, 'THIRD_PARTY_NOTICES.md');
const notice = read(noticePath).toString('utf8');
const expected = new Map([...notice.matchAll(/^\| `([^`]+)` \| ([^ |]+) \|/gm)].map(m => [m[1], m[2]]));
for (const [heading, names] of [ ['React and React DOM', ['react', 'react-dom']], ['Scheduler', ['scheduler']], ['ffmpeg-static', ['ffmpeg-static']] ]) {
  const version = notice.match(new RegExp(`^### ${heading} ([0-9.]+)$`, 'm'))?.[1];
  if (!version) throw new Error(`Missing notice heading: ${heading}`);
  for (const name of names) expected.set(name, version);
}
const electronVersion = notice.match(/^### Electron ([0-9.]+)$/m)?.[1];
if (!electronVersion || lock.packages['node_modules/electron'].version !== electronVersion) throw new Error('Electron lock mismatch');
const ffmpegVersion = notice.match(/Windows x64 executable reports\r?\nFFmpeg ([^.\s]+(?:\.[^.\s]+)*)\./)?.[1];
if (!ffmpegVersion) throw new Error('Missing Windows FFmpeg version');
const lockMatches = (name, version) => Object.entries(lock.packages).filter(([p, v]) =>
  (v.name || p.split('node_modules/').pop()) === name && v.version === version && !v.dev).map(([p]) => p);
for (const [name, version] of expected) if (!lockMatches(name, version).length) throw new Error(`Notice/production lock mismatch: ${name}@${version}`);
const seven = path.join(root, 'node_modules/electron-winstaller/vendor/7z-x64.exe');
const run = (exe, args, options = {}) => cp.execFileSync(exe, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
fs.mkdirSync(output, { recursive: true });
async function main() {
  const artifacts = [];
  const inputs = fs.readdirSync(build).filter(f => f.endsWith('.exe'));
  if (inputs.length !== 2 || !inputs.some(f => f.includes('Setup'))) throw new Error('Expected NSIS and portable artifacts');
  for (const filename of inputs) {
    const artifact = path.join(build, filename), artifactSha256 = hash(artifact);
    const extracted = path.join(output, filename + '-extracted');
    run(seven, ['x', artifact, '-y', `-o${extracted}`, '$PLUGINSDIR/app-64.7z']);
    const payload = path.join(extracted, '$PLUGINSDIR/app-64.7z');
    const app = path.join(extracted, 'app');
    run(seven, ['x', payload, '-y', `-o${app}`]);
    const resources = path.join(app, 'resources');
    await verifyLicenses(root, resources);
    const archive = path.join(resources, 'app.asar');
    const packages = [];
    for (const entry of asar.listPackage(archive).map(p => p.replaceAll('\\', '/').replace(/^\//, '')).filter(p => p.startsWith('node_modules/') && p.endsWith('/package.json'))) {
      const pkg = JSON.parse(asar.extractFile(archive, path.normalize(entry)));
      if (!pkg.name || !pkg.version) continue;
      if (expected.get(pkg.name) !== pkg.version || !lockMatches(pkg.name, pkg.version).length) throw new Error(`Artifact/notice/lock mismatch: ${entry}: ${pkg.name}@${pkg.version}`);
      packages.push({ name: pkg.name, version: pkg.version, path: entry, lockPaths: lockMatches(pkg.name, pkg.version) });
    }
    for (const [name, version] of expected) if (!packages.some(p => p.name === name && p.version === version)) throw new Error(`Package absent from artifact: ${name}`);
    const executables = fs.readdirSync(app).filter(f => f.endsWith('.exe'));
    if (executables.length !== 1) throw new Error('Ambiguous application executable');
    const electron = JSON.parse(run(path.join(app, executables[0]), ['-p', 'JSON.stringify(process.versions)'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).trim());
    if (electron.electron !== electronVersion) throw new Error('Packaged Electron version mismatch');
    const ffmpeg = path.join(resources, 'app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe');
    const ffmpegOutput = run(ffmpeg, ['-version']);
    if (ffmpegOutput.split(/\r?\n/)[0].split(' ')[2] !== ffmpegVersion) throw new Error(`FFmpeg notice mismatch: ${ffmpegVersion}`);
    if (hash(artifact) !== artifactSha256) throw new Error('Artifact changed during audit');
    artifacts.push({ filename, artifactSha256, payloadSha256: hash(payload), asarSha256: hash(archive),
      noticeSha256: hash(path.join(resources, 'licenses/THIRD_PARTY_NOTICES.md')), packages,
      electron, ffmpegSha256: hash(ffmpeg), ffmpegVersionOutput: ffmpegOutput, licenseFilesMatch: true });
  }
  const report = { auditedAt: new Date().toISOString(), scope: 'Windows x64 NSIS and portable only; macOS excluded; arm64 unsupported',
    build, lockSha256: hash(lockPath), noticeSha256: hash(noticePath), expectedPackageCount: expected.size,
    artifacts, passed: true, limitation: 'Only these artifact hashes are verified. Re-run after rebuilding/signing. This is not corresponding-source clearance.' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Verified ${expected.size} npm packages, Electron and FFmpeg in both final artifacts. Report: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
