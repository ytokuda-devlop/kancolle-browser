// Run from any directory after packaging Windows x64 and downloading the upstream gzip.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 required');
const binary = 'release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe';
const installed = 'node_modules/ffmpeg-static/ffmpeg.exe';
const upstream = 'release/ffmpeg-sources-win32-x64/ffmpeg-win32-x64.gz';
const bytes = read(binary);
const pe = bytes.readUInt32LE(0x3c);
if (bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0' || bytes.readUInt16LE(pe + 4) !== 0x8664) {
  throw new Error('Expected an AMD64 PE executable');
}
const sha256 = hash(bytes);
if (hash(read(installed)) !== sha256 || hash(gunzipSync(read(upstream))) !== sha256) {
  throw new Error('Packaged, installed and upstream FFmpeg differ');
}
const runs = ['-version', '-L', '-buildconf'].map(arg => {
  const result = spawnSync(path.join(root, binary), [arg], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || new Error(`${arg}: ${result.status}`);
  return { arg, status: result.status, stdout: result.stdout, stderr: result.stderr };
});
const out = path.join(root, 'licenses/ffmpeg/win32-x64');
fs.mkdirSync(out, { recursive: true });
const names = ['version', 'license', 'buildconf'];
runs.forEach((run, i) => {
  for (const stream of ['stdout', 'stderr']) {
    // Empty streams are recorded in capture.json; packaged license files must be nonempty.
    if (run[stream]) fs.writeFileSync(path.join(out, `${names[i]}${stream === 'stderr' ? '-stderr' : ''}.txt`), run[stream]);
  }
});
for (const suffix of ['README', 'LICENSE']) {
  fs.writeFileSync(path.join(out, `upstream.${suffix}`), read(`${installed}.${suffix}`));
}
const release = JSON.parse(read('release/ffmpeg-release.json'));
const asset = release.assets.find(asset => asset.name === 'ffmpeg-win32-x64.gz');
const capture = {
  capturedAt: new Date().toISOString(), binary, sha256, installedSha256: hash(read(installed)),
  platform: process.platform, arch: process.arch, format: 'PE AMD64',
  upstream: { url: asset.browser_download_url, assetId: asset.id, size: asset.size,
    compressedSha256: hash(read(upstream)), decompressedSha256: sha256 },
  runs,
  limitation: 'Unpacked application checked. NSIS and portable final artifacts still require extraction and comparison.'
};
fs.writeFileSync(path.join(out, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
console.log(`Verified packaged = installed = upstream: ${sha256}`);
