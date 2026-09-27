// Read-only inspection of an extracted macOS app and its original ZIP/DMG.
// Emits evidence as JSON; this inventory is not an automatic legal clearance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const asar = require('@electron/asar');
const { licenseFiles: selectedLicenseFiles } = require('./verify-packaged-licenses.cjs');
const root = path.resolve(__dirname, '..');
const [artifactArg, appArg] = process.argv.slice(2);
if (!artifactArg || !appArg) throw new Error('Usage: node scripts/audit-mac-artifact.cjs <ZIP-or-DMG> <extracted.app>');
const artifact = path.resolve(artifactArg), app = path.resolve(appArg);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const read = p => fs.readFileSync(p);
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const relative = path.join(prefix, e.name);
    if (e.isDirectory()) return walk(path.join(dir, e.name), relative);
    return e.isFile() ? [relative] : []; // Do not follow framework symlinks twice.
  }).sort();
}
const resources = path.join(app, 'Contents/Resources');
const archive = path.join(resources, 'app.asar');
const entries = asar.listPackage(archive).map(p => p.replace(/^\//, ''));
const lock = JSON.parse(read(path.join(root, 'package-lock.json')));
const noticePath = path.join(resources, 'licenses/THIRD_PARTY_NOTICES.md');
const notice = fs.existsSync(noticePath) ? read(noticePath).toString() : '';
const licenseDir = path.join(resources, 'licenses');
const licenseFiles = fs.existsSync(licenseDir) ? walk(licenseDir) : [];
const packages = [];
for (const entry of entries.filter(p => p.startsWith('node_modules/') && p.endsWith('/package.json'))) {
  const pkg = JSON.parse(asar.extractFile(archive, entry));
  if (!pkg.name || !pkg.version) continue;
  const matches = Object.entries(lock.packages).filter(([, p]) => p.version === pkg.version)
    .filter(([p, value]) => (value.name || p.split('node_modules/').pop()) === pkg.name);
  const base = entry.slice(0, -'package.json'.length);
  const embeddedNotices = entries.filter(p => p.startsWith(base) && !p.slice(base.length).includes('/')
    && /^(license|copying|notice)(\.|$)/i.test(p.slice(base.length)));
  const licenseText = typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || pkg.licenses || null);
  packages.push({ name: pkg.name, version: pkg.version, license: licenseText, path: entry,
    lockMatches: matches.map(([p]) => p), developmentOnly: matches.length ? matches.every(([, p]) => p.dev === true) : null,
    mentionedInPackagedNotice: notice.includes(pkg.name) && notice.includes(pkg.version),
    embeddedNotices, reviewRequired: !licenseText || licenseText === 'null' || /GPL|SEE LICENSE|LicenseRef/i.test(licenseText) });
}
const expected = selectedLicenseFiles(JSON.parse(read(path.join(root, 'package.json')))).map(p => [path.join(root, 'licenses', p), p]);
expected.push(...['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(p => [path.join(root, p), p]));
const licenseComparison = expected.map(([source, relative]) => {
  const target = path.join(licenseDir, relative);
  return { path: relative, status: !fs.existsSync(target) ? 'missing' : hash(read(source)) === hash(read(target)) ? 'match' : 'different' };
});
const binaries = [];
const executableFiles = [];
for (const relative of walk(app)) {
  const full = path.join(app, relative);
  if (fs.statSync(full).mode & 0o111) executableFiles.push(relative);
  const fd = fs.openSync(full, 'r'), header = Buffer.alloc(4);
  try { fs.readSync(fd, header, 0, 4, 0); } finally { fs.closeSync(fd); }
  if (!['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca'].includes(header.toString('hex'))) continue;
  const result = cp.spawnSync('/usr/bin/otool', ['-L', full], { encoding: 'utf8' });
  binaries.push({ path: relative, sha256: hash(read(full)),
    file: cp.execFileSync('/usr/bin/file', ['-b', full], { encoding: 'utf8' }).trim(),
    dynamicLinks: result.stdout, dynamicLinkStatus: result.status });
}
const recordingFfmpegEntries = [...entries, ...walk(resources)].filter(entry =>
  /(^|[/\\])(ffmpeg-static|ffmpeg(?:\.exe)?)([/\\]|$)/i.test(entry));
if (recordingFfmpegEntries.length) throw new Error(`Removed recording FFmpeg found: ${recordingFfmpegEntries.join(', ')}`);
const plist = p => cp.execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', p], { encoding: 'utf8' }).trim();
const result = {
  auditedAt: new Date().toISOString(), artifact, artifactSha256: hash(read(artifact)), app,
  appVersion: JSON.parse(asar.extractFile(archive, 'package.json')).version,
  electronVersion: plist(path.join(app, 'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist')),
  referenceGitCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  referenceWorktreeStatus: cp.execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
  provenanceNote: 'Git commit describes the current reference checkout, not proven build provenance. Uncommitted changes exist.',
  packages, executableFiles, binaries,
  nativeAsarEntries: entries.filter(p => /\.(node|dylib|dll|so)$/.test(p)),
  licenseFiles: licenseFiles.map(p => ({ path: p, bytes: fs.statSync(path.join(licenseDir, p)).size, sha256: hash(read(path.join(licenseDir, p))) })),
  licenseComparison, recordingFfmpegAbsent: true,
  limits: ['Native binary inventory does not enumerate all statically linked components.',
    'Electron/Chromium components (including its own FFmpeg library) still require source/notice coverage review.',
    'This record does not approve release or confirm complete corresponding source availability.']
};
console.log(JSON.stringify(result, null, 2));
