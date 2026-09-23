const path = require('node:path');
const { readdir, rename } = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

// macOS distribution/copying can convert filenames to NFD. Keep executable
// and Helper names ASCII; preserve the Japanese NFC name for display only.
// Electron derives Helper paths from the main bundle's CFBundleName.
module.exports = async ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== 'darwin' && electronPlatformName !== 'mas') return;
  const executableName = packager.appInfo.productFilename;
  if (!/^[A-Za-z0-9_-]+$/.test(executableName)) {
    throw new Error('mac.executableName must use ASCII letters, digits, underscores or hyphens');
  }
  const plist = path.join(appOutDir, `${executableName}.app`, 'Contents', 'Info.plist');
  const frameworks = path.join(path.dirname(plist), 'Frameworks');
  const prefix = packager.appInfo.sanitizedProductName;
  for (const entry of await readdir(frameworks)) {
    if (!entry.startsWith(`${prefix} Helper`) || !entry.endsWith('.app')) continue;
    const bundle = path.join(frameworks, entry);
    const helperPlist = path.join(bundle, 'Contents', 'Info.plist');
    const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', helperPlist]);
    const oldName = stdout.replace(/\n$/, '');
    const newName = executableName + entry.slice(prefix.length, -4);
    await rename(path.join(bundle, 'Contents', 'MacOS', oldName), path.join(bundle, 'Contents', 'MacOS', newName));
    for (const key of ['CFBundleExecutable', 'CFBundleName']) {
      await run('/usr/bin/plutil', ['-replace', key, '-string', newName, helperPlist]);
    }
    await rename(bundle, path.join(frameworks, `${newName}.app`));
  }
  await run('/usr/bin/plutil', ['-replace', 'CFBundleName', '-string', executableName, plist]);
  await run('/usr/bin/plutil', [
    '-replace', 'CFBundleDisplayName', '-string', packager.appInfo.productName.normalize('NFC'), plist
  ]);
};
