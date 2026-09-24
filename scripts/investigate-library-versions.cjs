const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const base = 'licenses/ffmpeg/win32-x64/';
const capture = JSON.parse(fs.readFileSync(path.join(root, base, 'capture.json')));
const bytes = fs.readFileSync(path.join(root, capture.binary));
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha256 !== capture.sha256) throw new Error('Binary changed');
const strings = [];
let start = 0;
for (let i = 0; i <= bytes.length; i++) {
  if (i < bytes.length && bytes[i] >= 32 && bytes[i] <= 126) continue;
  if (i - start >= 5 && i - start < 300) strings.push({ offset: start, value: bytes.toString('ascii', start, i) });
  start = i + 1;
}
const definitions = [
  ['bzlib', '1.0.8', /1\.0\.8, 13-Jul-2019/, 'embedded version text'],
  ['gmp', '6.2.1', /gmp-6\.2\.1\//, 'embedded source path'],
  ['gnutls', '3.6.16', /Enabled GnuTLS 3\.6\.16 logging/, 'embedded diagnostic'],
  ['iconv', null, /libiconv.*(?:version|[0-9]\.[0-9])/i, 'no unambiguous version evidence found'],
  ['libfontconfig', null, /W:\/code\/mabs\/local64\/share\/fontconfig/, 'build prefix only; not a version'],
  ['libopenjpeg', null, /^OpenJPEG JPEG 2000$/, 'library name only; bare 2.5.0 string is not enough to attribute'],
  ['libxml2', null, /Fatal: program compiled against libxml/, 'diagnostic only; nearby 21300 is not sufficient proof'],
  ['lzma', '5.2.9', /^5\.2\.9$/, 'unattributed bare string; candidate only'],
  ['zlib', '1.2.13', /^1\.2\.(?:13|11)$/, 'multiple bare version strings; linked revision and copy count unresolved'],
  ['expat', '2.5.0', /expat-2\.5\.0\/|^expat_2\.5\.0$/, 'embedded source path and version'],
  ['nettle', '3.8.1', /nettle-3\.8\.1\//, 'embedded source paths; includes crypto routines'],
  ['OpenSSL', '3.0.7', /openssl-3\.0\.7\/|^OpenSSL 3\.0\.7 /, 'embedded source paths and version'],
  ['libssh', '0.10.4', /^(?:SSH-2\.0-libssh_0\.10\.4|0\.10\.4\/openssl\/zlib)$/, 'version and backend identifiers'],
];
const components = definitions.map(([name, versionCandidate, expression, interpretation]) => ({
  name, versionCandidate, interpretation,
  evidence: strings.filter(s => expression.test(s.value)),
  exactRevisionConfirmed: false, localPatchesConfirmed: false,
}));
const record = {
  checkedAt: new Date().toISOString(), binary: capture.binary, sha256,
  method: 'Read-only printable ASCII extraction with byte offsets; no execution or modification of the binary.',
  components,
  limits: ['Version text and build paths do not establish a complete source revision or absence of local patches.',
    'Bare strings can belong to other libraries or header versions; candidates must not be treated as confirmed.',
    'Absence of a version string does not establish absence of a dependency.'],
};
fs.writeFileSync(path.join(root, base, 'dependency-evidence.json'), JSON.stringify(record, null, 2) + '\n');
console.log(components.map(c => `${c.name}: ${c.versionCandidate || 'unresolved'} (${c.evidence.length} strings)`).join('\n'));
if (process.argv.includes('--runtime')) {
  const cwd = path.join(root, 'release/library-source-check');
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(path.join(cwd, 'probe.ass'), '[Script Info]\nScriptType: v4.00+\nPlayResX: 64\nPlayResY: 64\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Alignment\nStyle: Default,Arial,12,&H00FFFFFF,2\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Default,probe\n');
  const args = ['-hide_banner', '-f', 'lavfi', '-i', 'color=size=64x64:rate=1', '-vf', 'ass=probe.ass', '-frames:v', '1', '-f', 'null', 'pipe:1'];
  const r = require('node:child_process').spawnSync(path.join(root, capture.binary), args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  if (r.error) throw r.error;
  const run = { checkedAt: new Date().toISOString(), binary: capture.binary, sha256, args, fixture: fs.readFileSync(path.join(cwd, 'probe.ass'), 'utf8'), exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
  fs.writeFileSync(path.join(root, base, 'subtitle-library-probe.json'), JSON.stringify(run, null, 2) + '\n');
  console.log(r.stderr);
  if (r.status !== 0) process.exitCode = 1;
}
