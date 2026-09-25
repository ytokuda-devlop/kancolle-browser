// Inventory actual installer contents, including bootstrap files and ASAR entries.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const build = path.resolve(process.argv[2] || 'release/windows-x64');
const out = path.resolve(process.argv[3] || `audits/inventory/windows-x64-${crypto.randomUUID()}`);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(p);
const seven = path.join(root, 'node_modules/electron-winstaller/vendor/7z-x64.exe');
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isSymbolicLink()) throw new Error(`Unexpected symlink: ${p}`);
    return e.isDirectory() ? walk(path.join(dir, e.name), p) : [p];
  }).sort();
}
function native(b) {
  if (b.length < 64 || b.toString('ascii', 0, 2) !== 'MZ') return null;
  const p = b.readUInt32LE(60);
  if (p + 24 > b.length || b.readUInt32LE(p) !== 0x4550) return null;
  return { format: 'PE', machine: '0x' + b.readUInt16LE(p + 4).toString(16),
    kind: b.readUInt16LE(p + 22) & 0x2000 ? 'library' : 'executable' };
}
function extract(file, dest) {
  cp.execFileSync(seven, ['x', file, '-y', `-o${dest}`], { stdio: 'pipe' });
}
const artifacts = [];
fs.mkdirSync(out, { recursive: true });
for (const filename of fs.readdirSync(build).filter(f => f.endsWith('.exe'))) {
  const file = path.join(build, filename), binary = read(file), before = hash(binary);
  const dest = path.join(out, filename + '-extracted');
  extract(file, dest);
  const payload = path.join(dest, '$PLUGINSDIR/app-64.7z');
  const app = path.join(dest, 'payload-app');
  extract(payload, app);
  const files = [], nativeFiles = [], packages = [], links = [];
  function add(location, b) {
    const record = { path: location, bytes: b.length, sha256: hash(b) };
    files.push(record);
    const info = native(b);
    if (info) nativeFiles.push({ ...record, ...info });
    else if (/\.(exe|dll|node|so|dylib|wasm)$/i.test(location)) nativeFiles.push({ ...record, format: 'other-or-unrecognized', kind: 'review' });
  }
  add('artifact/' + filename, binary);
  for (const relative of walk(dest).filter(p => !p.startsWith('payload-app/'))) add('installer/' + relative, read(path.join(dest, relative)));
  for (const relative of walk(app)) add('app/' + relative, read(path.join(app, relative)));
  const archive = path.join(app, 'resources/app.asar');
  for (const entry of asar.listPackage(archive)) {
    const p = entry.slice(1), stat = asar.statFile(archive, p, false);
    if (stat.files) continue;
    if (stat.link) { links.push({ path: p, target: stat.link }); continue; }
    const b = asar.extractFile(archive, p);
    const normalized = p.replaceAll('\\', '/');
    add('asar/' + normalized, b);
    if (normalized.startsWith('node_modules/') && normalized.endsWith('/package.json')) {
      const pkg = JSON.parse(b);
      if (pkg.name && pkg.version) packages.push({ name: pkg.name, version: pkg.version,
        license: pkg.license || pkg.licenses || null, path: normalized, sha256: hash(b) });
    }
  }
  if (hash(read(file)) !== before) throw new Error('Artifact changed during inventory');
  artifacts.push({ filename, sha256: before, payloadSha256: hash(read(payload)),
    appVersion: JSON.parse(asar.extractFile(archive, 'package.json')).version,
    nativeFiles, packages, links, files });
}
if (artifacts.length !== 2) throw new Error('Expected two Windows artifacts');
const record = { createdAt: new Date().toISOString(), scope: 'Windows x64 NSIS and portable; macOS excluded; arm64 unsupported',
  referenceCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  referenceStatus: cp.execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
  provenance: 'Reference checkout only, not proof of build commit. Uncommitted changes exist.',
  extractorSha256: hash(read(seven)), artifacts,
  limitations: ['Static libraries embedded in Electron (including its own FFmpeg) require separate build/source/license review; removed recording FFmpeg records do not apply.',
    'Installer wrapper, extracted bootstrap files, app payload and ASAR are separate namespaces; unpacked ASAR entries may duplicate physical files.',
    'Generated installed uninstaller and runtime OS libraries are outside this archive inventory.',
    'This is an inventory, not license compliance or corresponding-source clearance.'] };
fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify(record, null, 2) + '\n');
let md = '# Windows x64 成果物のファイル一覧\n\n' + record.createdAt + '\n\n';
for (const a of artifacts) {
  md += `## ${a.filename}\n\nSHA-256: \`${a.sha256}\`\n\nアプリ版: ${a.appVersion}。npm: ${a.packages.length}件。\n\n### 実行ファイル・ネイティブライブラリ\n\n| パス | 種別 | PE machine |\n| --- | --- | --- |\n`;
  for (const n of a.nativeFiles) md += `| ${n.path} | ${n.kind} | ${n.machine || n.format} |\n`;
  md += '\n### npmパッケージ\n\n| 名前 | バージョン | package.jsonのライセンス表記 |\n| --- | --- | --- |\n';
  for (const p of a.packages) md += `| ${p.name} | ${p.version} | ${typeof p.license === 'string' ? p.license : JSON.stringify(p.license)} |\n`;
  md += '\n';
}
md += '## 範囲と制限\n\n全ファイルのパス・SHA-256、ASAR内パス、参照コミットはinventory.jsonを参照。参照コミットはビルド元の確定を意味しない。\n\nPE machineは0x8664がx64、0x14cがx86。インストーラー補助部品はアプリ本体と異なるCPUの場合がある。\n\nASARのunpackedファイルは物理ファイルと重複して記録する。Electron内部（内蔵FFmpegを含む）の静的リンク部品は独立ファイルとして列挙できないため、Electronの実ビルドとChromium通知で別途追跡する。録画変換用FFmpegの旧調査記録を流用しない。インストール時に生成されるアンインストーラーとOS提供DLLは対象外。ライセンス適合性や完全な対応ソースの確保は、この一覧だけでは判定しない。\n';
fs.writeFileSync(path.join(out, 'REPORT.md'), md);
console.log(JSON.stringify(artifacts.map(a => ({ artifact: a.filename, nativeFiles: a.nativeFiles.length, npmPackages: a.packages.length, files: a.files.length })), null, 2));
console.log(out);
