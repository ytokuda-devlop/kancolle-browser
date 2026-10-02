const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

function licenseFiles(project) {
  const files = project.build.extraResources.find(entry => entry.from === 'licenses')?.filter;
  if (!Array.isArray(files) || !files.length || files.some(file =>
    typeof file !== 'string' || /[*!?{}\\]/.test(file) || path.isAbsolute(file) || file.split('/').includes('..'))) {
    throw new Error('Expected an explicit list of relative license files in package.json');
  }
  for (const required of ['DISTRIBUTION-NOTES.txt', 'electron-LICENSE.txt', 'LICENSES.chromium.html',
    'react-LICENSE.txt', 'react-dom-LICENSE.txt', 'scheduler-LICENSE.txt',
    'npm/js-tokens-LICENSE.txt', 'npm/loose-envify-LICENSE.txt',
    'electron-components/Mantle-LICENSE.md', 'electron-components/ReactiveObjC-LICENSE.md',
    'electron-components/Squirrel-LICENSE.txt', 'electron-components/LGPL-2.1.txt',
    'electron-components/nbytes-LICENSE.txt', 'electron-components/FFmpeg-CREDITS.txt', 'ELECTRON-SOURCES.txt']) {
    if (!files.includes(required)) throw new Error(`Missing required license: ${required}`);
  }
  if (files.some(file => /^(ffmpeg\/|ffmpeg-static-GPL-3\.0\.txt$|FFmpeg-SOURCE\.txt$|ffmpeg-build-configuration\.txt$|GPL-3\.0\.txt$)/i.test(file))) {
    throw new Error('Legacy recording-conversion license material selected for distribution');
  }
  const targets = (project.build.win?.target || []).map(t => typeof t === 'string' ? t : t.target);
  if (targets.includes('portable')) {
    for (const name of ['NSIS-COPYING.txt', 'StdUtils-ReadMe.txt', 'StdUtils-README.html',
      'StdUtils-rhash-COPYING.txt', 'StdUtils-blake2-COPYING.txt', 'nsis7z-README.txt',
      'nsis7z-LZMA-SDK-LICENSE.txt', 'elevate-upstream-LICENSE.md',
      'electron-builder-LICENSE.txt', 'SOURCES.txt']) {
      if (!files.includes(`windows/${name}`)) throw new Error(`Missing portable license: windows/${name}`);
    }
  }
  return files;
}

async function verifyNoRecordingFfmpeg(resourcesDir) {
  const archive = path.join(resourcesDir, 'app.asar');
  asar.uncache(archive);
  const entries = asar.listPackage(archive);
  entries.push(...await filesUnder(resourcesDir));
  const forbidden = entries.filter(entry => /(^|[/\\])(ffmpeg-static|ffmpeg(?:\.exe)?)([/\\]|$)/i.test(entry));
  if (forbidden.length) throw new Error(`Removed recording FFmpeg found: ${forbidden.join(', ')}`);
  // Electron's ffmpeg.dll/libffmpeg.dylib are intentionally retained.
  return { recordingFfmpegAbsent: true };
}

async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesUnder(path.join(directory, entry.name), relative));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unsupported license entry: ${relative}`);
    }
  }
  return files;
}

async function verify(projectDir, resourcesDir) {
  const sourceDir = path.join(projectDir, 'licenses');
  const project = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
  const files = licenseFiles(project);
  const pairs = files.map(file => [path.join(sourceDir, file), file]);
  pairs.push(...['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(file => [path.join(projectDir, file), file]));
  const verified = [];
  for (const [source, relative] of pairs) {
    const destination = path.join(resourcesDir, 'licenses', relative);
    const expected = await fs.readFile(source);
    const actual = await fs.readFile(destination);
    if (!expected.length || !expected.equals(actual)) {
      throw new Error(`Empty or mismatched packaged license: ${destination}`);
    }
    verified.push({ path: relative.split(path.sep).join('/'), bytes: actual.length,
      sha256: crypto.createHash('sha256').update(actual).digest('hex') });
  }
  const allowed = new Set(pairs.map(([, relative]) => relative));
  const extra = (await filesUnder(path.join(resourcesDir, 'licenses')))
    .filter(file => !allowed.has(file.split(path.sep).join('/')));
  if (extra.length) throw new Error(`Unexpected packaged license material: ${extra.join(', ')}`);
  const runtime = await verifyNoRecordingFfmpeg(resourcesDir);
  console.log(`Verified ${pairs.length} license files outside ASAR: ${resourcesDir}`);
  return { fileCount: verified.length, files: verified, ...runtime };
}

module.exports = verify;
module.exports.licenseFiles = licenseFiles;
module.exports.verifyNoRecordingFfmpeg = verifyNoRecordingFfmpeg;
if (require.main === module) {
  const resourcesDir = process.argv[2];
  if (!resourcesDir) throw new Error('Usage: node scripts/verify-packaged-licenses.cjs <resources-directory>');
  verify(path.resolve(__dirname, '..'), path.resolve(resourcesDir)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
