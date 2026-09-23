const path = require('node:path');
const fs = require('node:fs/promises');

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
  const files = await filesUnder(sourceDir);
  for (const required of ['GPL-3.0.txt', 'LICENSES.chromium.html',
    'FFmpeg-SOURCE.txt', 'ffmpeg-static-GPL-3.0.txt']) {
    if (!files.includes(required)) throw new Error(`Missing required license: ${required}`);
  }
  const pairs = files.map(file => [path.join(sourceDir, file), file]);
  pairs.push(...['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(file => [path.join(projectDir, file), file]));
  for (const [source, relative] of pairs) {
    const destination = path.join(resourcesDir, 'licenses', relative);
    const expected = await fs.readFile(source);
    const actual = await fs.readFile(destination);
    if (!expected.length || !expected.equals(actual)) {
      throw new Error(`Empty or mismatched packaged license: ${destination}`);
    }
  }
  console.log(`Verified ${pairs.length} license files outside ASAR: ${resourcesDir}`);
}

module.exports = verify;
if (require.main === module) {
  const resourcesDir = process.argv[2];
  if (!resourcesDir) throw new Error('Usage: node scripts/verify-packaged-licenses.cjs <resources-directory>');
  verify(path.resolve(__dirname, '..'), path.resolve(resourcesDir)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
