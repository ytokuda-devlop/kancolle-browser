import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// No third-party codec library is downloaded or linked.
if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = path.join(root, 'dist-native', 'darwin');
  const cache = path.join(root, 'dist-native', 'swift-module-cache');
  mkdirSync(output, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const arches = process.env.RECORDER_ARCH ? [process.env.RECORDER_ARCH] : ['arm64', 'x64'];
  const binaries = [];
  for (const arch of arches) {
    if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`);
    const binary = path.join(output, `KancolleRecorder-${arch}`);
    execFileSync('xcrun', ['swiftc', '-parse-as-library', '-swift-version', '5', '-O',
      '-target', `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx14.2`,
      '-module-cache-path', cache,
      path.join(root, 'native/macos/Recorder.swift'), '-o', binary,
      '-framework', 'ScreenCaptureKit', '-framework', 'AVFoundation', '-framework', 'VideoToolbox'
    ], { stdio: 'inherit' });
    binaries.push(binary);
  }
  execFileSync('xcrun', ['lipo', '-create', ...binaries, '-output', path.join(output, 'KancolleRecorder')], { stdio: 'inherit' });
}
