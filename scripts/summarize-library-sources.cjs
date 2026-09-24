const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const base = 'licenses/ffmpeg/win32-x64/';
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const manifest = json(base + 'sources.json');
const capture = json(base + 'capture.json');
const probes = json(base + 'library-probes.json');
assert.equal(probes.sha256, capture.sha256);
assert(probes.runs.every(run => run.exitCode === 0));
const config = capture.runs.find(run => run.arg === '-version').stdout;
const aliases = { AMF: 'amf', aom: 'libaom', AviSynthPlus: 'avisynth', freetype: 'libfreetype',
  fribidi: 'libfribidi', gsm: 'libgsm', harfbuzz: 'libharfbuzz', lame: 'libmp3lame',
  oneVPL: 'libvpl', openmpt: 'libopenmpt', opus: 'libopus', rubberband: 'librubberband',
  SDL: 'sdl2', speex: 'libspeex', srt: 'libsrt', vidstab: 'libvidstab', vmaf: 'libvmaf',
  'vo-amrwbenc': 'libvo-amrwbenc', vorbis: 'libvorbis', vpx: 'libvpx', x264: 'libx264',
  x265: 'libx265', xvid: 'libxvid', zeromq: 'libzmq', zimg: 'libzimg', libfontconfig: 'fontconfig' };
const records = fs.readdirSync(path.join(root, base, 'library-sources')).map(name => json(base + 'library-sources/' + name));
for (const record of records.filter(r => r.status === 'upstream-candidate-acquired')) {
  assert.equal(crypto.createHash('sha256').update(read(record.archive)).digest('hex'), record.sha256, record.name);
  assert(record.archiveEntryCount > 1 && record.licenseEntries.length > 0);
}
const runtime = {
  x264: { version: 'core 164 r3172 c1c9931', revision: 'c1c9931', run: 'x264' },
  x265: { version: '3.5+113-8787af124', revision: '8787af124', run: 'x265-8bit' },
  aom: { version: '3.8.0-180-g0eeb62d344', revision: '0eeb62d344', run: 'aom' },
  vpx: { version: 'v1.13.1-601-g655da33b8', revision: '655da33b8', run: 'vpx' },
};
const subtitleFile = path.join(root, base, 'subtitle-library-probe.json');
const subtitle = fs.existsSync(subtitleFile) ? json(base + 'subtitle-library-probe.json') : null;
if (subtitle) {
  assert.equal(subtitle.sha256, capture.sha256);
  assert.equal(subtitle.exitCode, 0);
  const match = subtitle.stderr.match(/libass source: commit: (\S+-g([a-f0-9]{40}))/);
  assert(match, 'Missing libass source revision');
  runtime.libass = { version: match[1], revision: match[2], run: 'subtitle', evidence: 'subtitle-library-probe.json' };
}
const sdkOnly = new Set(['AMF', 'AviSynthPlus', 'ffnvcodec']);
for (const library of manifest.libraries) {
  const flag = aliases[library.name] || library.name;
  assert(config.includes('--enable-' + flag), `Not enabled: ${library.name}`);
  library.readmeVersion = library.version;
  library.versionEvidence = 'upstream.README; not independently authoritative for the binary';
  library.configureFlag = '--enable-' + flag;
  library.integration = sdkOnly.has(library.name) ? 'headers-with-runtime-dll-loading' : 'static-library-or-dispatcher';
  const sourceName = library.name.startsWith('libopencore-amr') ? 'opencore-amr' : library.name;
  const source = records.find(r => r.name === sourceName);
  assert(source, `Missing source investigation: ${library.name}`);
  library.sourceStatus = source.status;
  library.sourceEvidence = 'library-sources/' + source.name + '.json';
  library.correspondence = 'readme-candidate; binary-revision-and-local-patches-unverified';
  if (source.archive) library.localArchive = source.archive;
  if (source.commit) library.upstreamCommit = source.commit;
  library.submoduleEvidence = records.filter(r => r.plan.parent === library.name).map(r => 'library-sources/' + r.name + '.json');
  if (runtime[library.name]) {
    library.runtime = runtime[library.name];
    const run = library.runtime.run === 'subtitle' ? subtitle : probes.runs.find(r => r.name === library.runtime.run);
    assert((run.stderr + (run.outputStrings || []).join('\n')).includes(library.runtime.version));
    library.correspondence = library.name === 'x265' ? 'CONFLICT: README revision differs from runtime; corresponding source unresolved'
      : 'runtime-revision-matched-upstream-candidate; local-patches-unverified';
    if (library.name !== 'x265' && source.commit) assert(source.commit.startsWith(library.runtime.revision));
  }
}
const projectUrls = {
  bzlib: 'https://sourceware.org/bzip2/', gmp: 'https://gmplib.org/',
  gnutls: 'https://www.gnutls.org/', iconv: 'https://www.gnu.org/software/libiconv/',
  libfontconfig: 'https://www.freedesktop.org/wiki/Software/fontconfig/',
  libopenjpeg: 'https://github.com/uclouvain/openjpeg', libxml2: 'https://gitlab.gnome.org/GNOME/libxml2',
  lzma: 'https://tukaani.org/xz/', zlib: 'https://zlib.net/',
};
manifest.unversionedLibraries = manifest.missingVersions.map(name => {
  const flag = '--enable-' + (aliases[name] || name);
  assert(config.includes(flag));
  return { name, configureFlag: flag, sourceStatus: 'unresolved-version', projectUrl: projectUrls[name],
    note: 'Project URL is not a corresponding source URL. Do not substitute the latest release.' };
});
const dependencyFile = path.join(root, base, 'dependency-evidence.json');
if (fs.existsSync(dependencyFile)) {
  const investigation = json(base + 'dependency-evidence.json');
  assert.equal(investigation.sha256, capture.sha256);
  for (const library of manifest.unversionedLibraries) {
    const evidence = investigation.components.find(c => c.name === library.name);
    library.versionCandidate = evidence?.versionCandidate || null;
    library.binaryEvidence = 'dependency-evidence.json';
    const source = records.find(r => r.name === library.name);
    if (source) {
      library.sourceEvidence = 'library-sources/' + source.name + '.json';
      library.candidateSourceStatus = source.status;
    }
  }
}
manifest.libraryInvestigation = {
  checkedAt: new Date().toISOString(), binarySha256: probes.sha256, complete: false,
  runtimeEvidence: 'library-probes.json', report: 'LIBRARY-SOURCES.md',
  readmeLibraryCount: manifest.libraries.length, unversionedLibraryCount: manifest.unversionedLibraries.length,
  downloadedLibraryArchives: records.filter(r => !r.plan.parent && r.status === 'upstream-candidate-acquired').length,
  downloadedSubmoduleArchives: records.filter(r => r.plan.parent && r.status === 'upstream-candidate-acquired').length,
  runtimeMatched: Object.keys(runtime).filter(name => name !== 'x265'), runtimeConflicts: ['x265'],
  additionalReview: 'DEPENDENCY-REVIEW.md',
  transitiveDependencyReview: ['libogg', 'OpenSSL', 'libpng', 'expat', 'nettle/hogweed', 'libtasn1', 'p11-kit', 'libintl', 'compiler/thread runtimes'],
  limits: ['Transitive dependency list is a review list, not a proven bill of materials.',
    'PE imports are system DLLs but dynamic loading and header-only dependencies must be assessed separately.',
    'All build-specific patches and build recipe correspondence remain unverified.',
    'Downloaded archives are ignored by Git and are not automatically packaged or publicly available.'],
};
manifest.complete = false;
write(base + 'sources.json', JSON.stringify(manifest, null, 2) + '\n');
const rows = manifest.libraries.map(l => {
  const s = records.find(s => 'library-sources/' + s.name + '.json' === l.sourceEvidence);
  const kind = sdkOnly.has(l.name) ? 'ヘッダー／外部DLL' : '静的ライブラリ／dispatcher';
  const result = l.name === 'x265' ? '**実物と不一致・未確定**' : l.runtime ? '実行時revision一致、パッチ未確認' : 'README指定の候補、実物との対応未確認';
  return `| ${l.name} | ${l.readmeVersion} | ${l.runtime?.version || '未取得'} | ${kind} | ${s.status === 'upstream-candidate-acquired' ? `[取得記録](${l.sourceEvidence})` : '未確定'} | ${result} |`;
});
rows.push(...manifest.unversionedLibraries.map(l => `| ${l.name} | 記載なし | 未確定 | 静的ライブラリ候補 | ${l.sourceEvidence ? `[候補調査](${l.sourceEvidence})` : '未取得'} | 正確なrevision未確定。追加調査参照 |`));
const report = `# Windows x64の組込みライブラリとソース調査

対象バイナリSHA-256: \`${probes.sha256}\`。
macOSは今回の対象外、arm64は今バージョン非対応。

**全体は未完了。** x264・libaom・libvpxは実行時revisionとソース候補の対応を確認した。
libassの追加照合、oneVPL・版不明9件・推移的依存物の追加調査は[DEPENDENCY-REVIEW.md](DEPENDENCY-REVIEW.md)を参照。
x265はREADMEと実行時表示が食い違い、oneVPLは正確なrevision未確定。
READMEに版番号のない9件と、推移的依存物も確定が必要。

取得済み: ライブラリソース候補${manifest.libraryInvestigation.downloadedLibraryArchives}アーカイブ、
親コミットで固定されたサブモジュール${manifest.libraryInvestigation.downloadedSubmoduleArchives}アーカイブ。
URL、完全なコミットID（GitHub取得分）、SHA-256、ライセンスの収録場所は各取得記録を参照。
アーカイブは改変せず保存し、tarの一覧読取り・ライセンスファイルまたはヘッダーの存在と
保存後のSHA-256を検証した。ビルド再現性や全ライセンス条件の監査を完了したという意味ではない。

## 実物の確認結果

- [実行記録](library-probes.json): 合成画像1フレームを各エンコーダーで処理し、6回すべて終了コード0。
- x264: エンコードしたH.264のSEIに \`core 164 r3172 c1c9931\`。
- libaom: \`3.8.0-180-g0eeb62d344\`、libvpx: \`v1.13.1-601-g655da33b8\`。
- x265: 8bit・10bit・12bitすべて \`3.5+113-8787af124\`。
  READMEの \`3.5-153-gce8642f22\` と異なる。取得したce8642f22のソースは候補としてのみ保存。
  実行時文字列の由来（別ソース・生成された版情報等）は未解明であり、別ソースと断定もしない。
  README指定ソースのx265Version.txtは \`3.5+1-f0c1022b6\` 相当で、これも実行時表示の説明にはならない。
  実行時識別子8787af124の解決はMulticorewareinc/x265とvideolan/x265のGitHub APIで422、
  multicoreware/x265_gitのBitbucket APIで404。提供元の確認が必要。
- oneVPL: READMEの \`2.9\` から \`intel/libvpl v2.9.0\` を解決できなかった（422）。
  APIバージョンとソースのリリース番号を同一視せず、別のタグで代用しない。
- 通常のPEインポートはWindowsのDLL群のみ。AviSynth・AMFはFFmpeg本体ソースの
  \`libavformat/avisynth.c\`、\`libavcodec/amfenc.c\`で実行時DLL読込みを確認。
  ffnvcodecもヘッダーと実行時ドライバーの区別が必要。READMEの全行を静的リンクとは扱わない。
- バイナリにはGnuTLS 3.6.16・libssh 0.10.4・OpenSSL 3.0.7を示す文字列も存在する。
  [実行記録](library-probes.json)に位置を保存したが、完全な版・パッチ・推移的依存物の確定には使わない。

## 全件一覧

「README指定の候補」は実物との完全一致を確認したという意味ではない。
ヘッダー／外部DLLの行では、取得アーカイブはSDK等のソース候補を示す。

| 名前 | README版 | 実行時版 | 組込み方法 | ソース | 判定 |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## 残作業と保管

1. x265の版情報の不一致とoneVPLの正確なrevisionを提供元に確認する。
2. 版不明9件、libogg・OpenSSL等の推移的依存物、実際に使用されたパッチとビルド設定を確定する。
   推移的依存物候補はsources.jsonに記載し、全件を同梱済みと断定しない。
3. AviSynthPlus/filesystem、FreeType/subprojects/dlg、zimg/graphengineとtest/extra/googletestは
   サブモジュールとして別アーカイブに保存。親コミットと配置先は各取得記録のsubmoduleを参照。
   ビルドでの要否・使用設定は未確認。
4. 全候補のバイナリとの対応と資料の完全性を確認してから、対応ソース一式として公開する。

アーカイブは \`third_party/ffmpeg/win32-x64/libraries/\` にローカル保存。
大容量のためGit管理対象外であり、クローン・アプリ配布物には自動では含まれない。
今後の公開用ファイルとして保管し、リリース前に公開URLとダウンロード可能性を確認する。
取得スクリプト: \`scripts/acquire-library-sources.ps1\`（版の固定情報はlibrary-source-plan.json）。
検証・一覧更新: \`node scripts/summarize-library-sources.cjs\`。
提供元への確認文案は[SOURCE-REQUEST.md](SOURCE-REQUEST.md)（未送信）。
`;
write(base + 'LIBRARY-SOURCES.md', report);
console.log(JSON.stringify(manifest.libraryInvestigation, null, 2));
