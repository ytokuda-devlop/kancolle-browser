import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.platform !== 'darwin') throw new Error('This test requires macOS');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist-native', 'native-recorder-test');
mkdirSync(path.dirname(output), { recursive: true });
execFileSync('xcrun', ['swiftc', '-parse-as-library', '-swift-version', '5', '-D', 'RECORDER_SELF_TEST',
  '-module-cache-path', path.join(root, 'dist-native/swift-module-cache'),
  path.join(root, 'native/macos/Recorder.swift'), path.join(root, 'tests/native-recorder-test.swift'),
  '-o', output, '-framework', 'ScreenCaptureKit', '-framework', 'AVFoundation', '-framework', 'VideoToolbox'
], { stdio: 'inherit' });
execFileSync(output, [], { stdio: 'inherit', timeout: 30000 });
