import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './build-windows-recorder.mjs';

if (process.platform !== 'win32') throw new Error('This test requires Windows 11.');
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = path.join(root, 'dist-native/win32/KancolleRecorder.exe');
const directory = mkdtempSync(path.join(root, 'dist-native/win32/recorder-test-'));
try {
  // Unicode/spaces exercise the same UTF-16 output path used in production.
  const movie = path.join(directory, '録画 test.mp4');
  const output = execFileSync(executable, ['--self-test', movie], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  const messages = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.ok(messages.some(message => message.event === 'finished'));
  const bytes = readFileSync(movie);
  assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  for (const tag of ['moov', 'mdat', 'avc1', 'mp4a', 'vide', 'soun']) assert.ok(bytes.includes(Buffer.from(tag)), `Missing ${tag}`);
  execFileSync(executable, ['--verify', movie], { stdio: 'inherit', timeout: 30000, windowsHide: true });
  console.log('PASS: Microsoft H.264/AAC -> MP4 -> decoded video/audio, Unicode path');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
