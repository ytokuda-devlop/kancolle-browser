const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'audits/inventory/windows-x64');
const read = p => fs.readFileSync(p);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const inventory = JSON.parse(read(path.join(dir, 'inventory.json')));
const lock = JSON.parse(read(path.join(root, 'package-lock.json')));
const project = JSON.parse(read(path.join(root, 'package.json')));
const results = [];
for (const artifact of inventory.artifacts) {
  if (hash(read(path.join(root, 'release/windows-x64', artifact.filename))) !== artifact.sha256) throw new Error('Artifact changed');
  const app = path.join(dir, artifact.filename + '-extracted/payload-app');
  const archive = path.join(app, 'resources/app.asar');
  const archiveRecord = artifact.files.find(f => f.path === 'app/resources/app.asar');
  if (hash(read(archive)) !== archiveRecord.sha256) throw new Error('Extracted ASAR changed');
  const entries = asar.listPackage(archive).map(p => p.slice(1).replaceAll('\\', '/'));
  const packages = artifact.packages.map(pkg => {
    const actual = JSON.parse(asar.extractFile(archive, path.normalize(pkg.path)));
    if (actual.name !== pkg.name || actual.version !== pkg.version) throw new Error('Package inventory changed');
    const matches = Object.entries(lock.packages).filter(([p, v]) =>
      (v.name || p.split('node_modules/').pop()) === pkg.name && v.version === pkg.version);
    return { name: pkg.name, version: pkg.version, path: pkg.path,
      lockPaths: matches.map(([p, v]) => ({ path: p, dev: v.dev === true })),
      status: !matches.length ? 'unknown' : matches.every(([, v]) => v.dev === true) ? 'dev-only' : 'runtime' };
  });
  const directDevPackagePaths = entries.filter(p => Object.keys(project.devDependencies).some(n => p === `node_modules/${n}`));
  const unexpectedModulePaths = entries.filter(p => /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^@/][^/]*$/.test(p))
    .filter(p => !packages.some(pkg => pkg.path === `${p}/package.json`));
  const devServerMarkers = [];
  for (const entry of entries.filter(p => p.startsWith('dist/') && /\.(js|html)$/.test(p))) {
    const code = asar.extractFile(archive, path.normalize(entry)).toString();
    for (const marker of ['/@vite/client', '/@react-refresh', 'react-refresh/runtime', 'localhost:5173']) {
      if (code.includes(marker)) devServerMarkers.push({ path: entry, marker });
    }
  }
  const sourceOnlyPaths = entries.filter(p => /^(?:scripts|src|tests?|\.git|\.vite)(?:\/|$)/.test(p));
  const failures = packages.filter(p => p.status !== 'runtime');
  results.push({ filename: artifact.filename, sha256: artifact.sha256, packages,
    directDevPackagePaths, unexpectedModulePaths, devServerMarkers, sourceOnlyPaths,
    passed: !failures.length && !directDevPackagePaths.length && !unexpectedModulePaths.length && !devServerMarkers.length && !sourceOnlyPaths.length });
}
const report = { auditedAt: new Date().toISOString(), lockSha256: hash(read(path.join(root, 'package-lock.json'))),
  results, passed: results.every(r => r.passed),
  exceptions: ['Electron is declared in devDependencies but its runtime is intentionally shipped and has Electron/Chromium notices.',
    'Installer helper binaries are runtime distribution components; their open license findings remain in LICENSE-FINDINGS.md.',
    'License texts for build tools are documentation, not executable dependency contamination.'],
  limitation: 'Module manifests, directory inventory and selected development-server markers checked; minified bundle contents are not a complete source-level dependency proof.' };
fs.writeFileSync(path.join(dir, 'dev-dependencies.json'), JSON.stringify(report, null, 2) + '\n');
let md = '# Windows x64 開発専用依存物の確認\n\n' + report.auditedAt + '\n\n';
for (const r of results) md += `- ${r.filename}: npm ${r.packages.length}件すべて実行時依存。開発専用・不明パッケージ ${r.packages.filter(p => p.status !== 'runtime').length}件。追加ディレクトリ ${r.unexpectedModulePaths.length}件。開発サーバー識別子 ${r.devServerMarkers.length}件。判定 ${r.passed ? 'PASS' : 'FAIL'}。\n`;
md += '\n同名パッケージの別版を混同せず、名前と版でlockのdev区分を確認した。@types/node 10.17.60はhttp-response-objectの実行時依存であり、開発用の別版と区別した。\n\nElectronはdevDependenciesに宣言されるがアプリ実行基盤であり除外しない。Electron／Chromium通知は収録済み。インストーラー補助部品は開発専用npmの混入とは区別し、既存LICENSE-FINDINGS.mdの不足対応を継続する。licenses/内のビルドツールのライセンス文書もコードの混入とは扱わない。\n\n今回の確認範囲では除外・ライセンス追加が必要な開発専用npmは検出しなかったため、配布設定の変更・再ビルドは不要。詳細と成果物ハッシュはdev-dependencies.jsonを参照。圧縮済みJSの依存元を完全に証明する検査ではなく、ライセンス監査全体の完了判定でもない。\n';
fs.writeFileSync(path.join(dir, 'DEV-DEPENDENCIES.md'), md);
console.log(results.map(r => `${r.filename}: ${r.passed ? 'PASS' : 'FAIL'}, ${r.packages.length} packages`).join('\n'));
if (!report.passed) process.exitCode = 1;
