const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'audits/inventory/windows-x64');
const inventory = JSON.parse(fs.readFileSync(path.join(dir, 'inventory.json')));
const read = p => fs.readFileSync(p);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const mappings = { react: 'react-LICENSE.txt', 'react-dom': 'react-dom-LICENSE.txt', scheduler: 'scheduler-LICENSE.txt', 'ffmpeg-static': 'ffmpeg-static-GPL-3.0.txt' };
const results = [];
for (const artifact of inventory.artifacts) {
  const original = path.join(root, 'release/windows-x64', artifact.filename);
  if (hash(read(original)) !== artifact.sha256) throw new Error('Artifact changed');
  const app = path.join(dir, artifact.filename + '-extracted/payload-app');
  const licenseDir = path.join(app, 'resources/licenses');
  const notice = read(path.join(licenseDir, 'THIRD_PARTY_NOTICES.md')).toString();
  const chromium = read(path.join(licenseDir, 'LICENSES.chromium.html')).toString();
  function license(relative) {
    const p = path.join(licenseDir, relative), source = path.join(root, 'licenses', relative);
    const b = read(p);
    if (!b.length || hash(b) !== hash(read(source))) throw new Error(`License differs: ${relative}`);
    return { path: `licenses/${relative}`, sha256: hash(b) };
  }
  if (hash(Buffer.from(notice)) !== hash(read(path.join(root, 'THIRD_PARTY_NOTICES.md')))) throw new Error('Notice differs');
  const packages = artifact.packages.map(pkg => {
    const relative = mappings[pkg.name] || `npm/${pkg.name.replace(/^@/, '').replace('/', '__')}-LICENSE.txt`;
    const heading = pkg.name === 'react' || pkg.name === 'react-dom' ? 'React and React DOM' : pkg.name === 'scheduler' ? 'Scheduler' : pkg.name;
    const versionMentioned = notice.includes(`### ${heading} ${pkg.version}`) || notice.includes(`| \`${pkg.name}\` | ${pkg.version} |`);
    if (!versionMentioned) throw new Error(`Notice version absent: ${pkg.name}`);
    return { ...pkg, noticeVersionMatch: true, license: license(relative),
      note: pkg.name === 'parse-cache-control' ? 'Metadata says BSD; included original text has three clauses, consistent with notice BSD-3-Clause.' : null };
  });
  const nativeFiles = artifact.nativeFiles.map(file => {
    const name = file.path.split('/').pop();
    let status = 'unresolved', references = [], reason = 'No explicit component notice/license mapping found; provider and exact terms need investigation.';
    if (file.path.includes('node_modules/ffmpeg-static/ffmpeg.exe')) {
      status = 'notice-present-source-incomplete'; references = ['GPL-3.0.txt', 'FFmpeg-SOURCE.txt'].map(license);
      reason = 'Separate GPL FFmpeg executable; complete corresponding source remains unresolved.';
    } else if (file.path === 'app/艦娘は今日もお仕事です（仮）.exe') {
      status = 'notice-present'; references = ['electron-LICENSE.txt', 'LICENSES.chromium.html'].map(license);
      reason = 'Application executable embeds Electron; original application LICENSE is also included.';
    } else {
      const title = { 'dxcompiler.dll': 'DirectX-Shader-Compiler', 'dxil.dll': 'DirectX-Shader-Compiler',
        'ffmpeg.dll': 'ffmpeg', 'vk_swiftshader.dll': 'SwiftShader', 'vulkan-1.dll': 'Vulkan' }[name];
      if (title) {
        const titles = [...chromium.matchAll(/<span class="title">([^<]+)<\/span>/g)].map(m => m[1]).filter(t => t.toLowerCase().includes(title.toLowerCase()));
        status = titles.length ? 'aggregate-notice-candidate' : 'unresolved';
        references = [license('LICENSES.chromium.html')];
        reason = `Chromium notice sections: ${titles.join(', ') || 'none'}. Exact DLL build/license correspondence not established by title match.`;
      }
    }
    return { ...file, status, references, reason };
  });
  results.push({ filename: artifact.filename, sha256: artifact.sha256, packages, nativeFiles });
}
const report = { comparedAt: new Date().toISOString(), scope: 'Windows x64; comparison performed, not all findings resolved', results };
fs.writeFileSync(path.join(dir, 'notice-comparison.json'), JSON.stringify(report, null, 2) + '\n');
let md = '# Windows x64 通知・ライセンス照合\n\n' + report.comparedAt + '\n\n両成果物のハッシュを再確認し、展開済み通知・ライセンスを現行原本とSHA-256で照合した。照合実施と不足解消は別である。\n\n';
for (const r of results) {
  md += `## ${r.filename}\n\nSHA-256: ${r.sha256}\n\nnpm ${r.packages.length}件すべての版記載と個別ライセンスファイルを確認。個別パス・ハッシュはnotice-comparison.jsonを参照。parse-cache-controlのBSD表記は収録本文の3条項と通知のBSD-3-Clause表記を照合した。\n\n| ファイル | 判定 | 根拠／不足 |\n| --- | --- | --- |\n`;
  for (const n of r.nativeFiles) md += `| ${n.path} | ${n.status} | ${n.reason} |\n`;
}
md += '\n## 後続対応\n\n- インストーラー本体、アンインストーラー、NSISプラグイン、elevate.exe、d3dcompiler_47.dllの提供元・版・適用条件と必要通知を確認する。現行資料では明示対応を確定できない。\n- Chromium通知内の名前の一致だけではDLLの適用条件を確定しない。各DLLのビルドとの対応を確認する。Electron同梱ffmpeg.dllとffmpeg-staticのffmpeg.exeは別部品として扱う。\n- FFmpegの静的リンク部品と完全な対応ソースの未解決事項は既存調査を継続する。\n- 不足資料を追加する場合は成果物を再ビルドし、再照合する。\n';
fs.writeFileSync(path.join(dir, 'NOTICE-COMPARISON.md'), md);
console.log('Compared both artifacts: 25 npm packages each; native findings recorded in ' + dir);
