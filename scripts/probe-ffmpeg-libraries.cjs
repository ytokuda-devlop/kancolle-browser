// Collect runtime evidence; README versions alone are not proof of linked revisions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const directory = 'licenses/ffmpeg/win32-x64';
const capture = JSON.parse(fs.readFileSync(path.join(root, directory, 'capture.json')));
const binary = path.join(root, capture.binary);
const bytes = fs.readFileSync(binary);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha256 !== capture.sha256) throw new Error('Binary changed; recapture provenance first');
const jobs = [
  ['x264', 'libx264', 'yuv420p'],
  ['x265-8bit', 'libx265', 'yuv420p'],
  ['x265-10bit', 'libx265', 'yuv420p10le'],
  ['x265-12bit', 'libx265', 'yuv420p12le'],
  ['aom', 'libaom-av1', 'yuv420p'],
  ['vpx', 'libvpx-vp9', 'yuv420p'],
];
const runs = jobs.map(([name, codec, format]) => {
  const args = ['-hide_banner', '-f', 'lavfi', '-i', 'color=size=64x64:rate=1',
    '-frames:v', '1', '-pix_fmt', format, '-c:v', codec];
  if (codec === 'libx265') args.push('-x265-params', 'pools=1:frame-threads=1');
  // H.264 output includes encoder-version SEI; no user input or media is used.
  args.push('-f', codec === 'libx264' ? 'h264' : 'null', 'pipe:1');
  const result = spawnSync(binary, args, { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw result.error || new Error(`${name}: ${result.stderr}`);
  return { name, args, exitCode: result.status, stderr: result.stderr.toString('utf8'),
    outputStrings: result.stdout.toString('latin1').match(/[\x20-\x7e]{12,}/g) || [] };
});
const needles = [' r3172 c1c9931', '3.5+113-8787af124', 'SSH-2.0-libssh_0.10.4',
  'Enabled GnuTLS 3.6.16 logging...', '../openssl-3.0.7/crypto/x509/x509_v3.c'];
const embeddedStrings = needles.flatMap(value => {
  const offset = bytes.indexOf(Buffer.from(value, 'ascii'));
  return offset < 0 ? [] : [{ value, offset }];
});
const pe = bytes.readUInt32LE(0x3c);
if (bytes.readUInt16LE(pe + 24) !== 0x20b) throw new Error('Expected PE32+');
const sectionStart = pe + 24 + bytes.readUInt16LE(pe + 20);
const sections = Array.from({ length: bytes.readUInt16LE(pe + 6) }, (_, i) => {
  const p = sectionStart + i * 40;
  return { rva: bytes.readUInt32LE(p + 12), size: Math.max(bytes.readUInt32LE(p + 8), bytes.readUInt32LE(p + 16)), offset: bytes.readUInt32LE(p + 20) };
});
const offsetOf = rva => {
  const s = sections.find(s => rva >= s.rva && rva < s.rva + s.size);
  if (!s) throw new Error(`Unmapped RVA: ${rva}`);
  return s.offset + rva - s.rva;
};
const imports = [];
let descriptor = offsetOf(bytes.readUInt32LE(pe + 24 + 112 + 8));
for (; bytes.readUInt32LE(descriptor + 12); descriptor += 20) {
  const offset = offsetOf(bytes.readUInt32LE(descriptor + 12));
  imports.push(bytes.toString('ascii', offset, bytes.indexOf(0, offset)));
}
const evidence = { capturedAt: new Date().toISOString(), binary: capture.binary, sha256, runs,
  embeddedStrings, peImportDlls: imports,
  limitation: 'Runtime version strings identify upstream candidates, not the absence of local patches or all transitive dependencies.' };
fs.writeFileSync(path.join(root, directory, 'library-probes.json'), JSON.stringify(evidence, null, 2) + '\n');
for (const run of runs) console.log(run.name, run.stderr.split(/\r?\n/).filter(s => /version|\b[v]?[0-9]+\.[0-9]+.*-g/i.test(s)).join('\n'), run.outputStrings.filter(s => /x264 - core/.test(s)).join('\n'));
