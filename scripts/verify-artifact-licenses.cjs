// Verify final distribution containers without launching the application/installer.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const verifyLicenses = require('./verify-packaged-licenses.cjs');

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function verify(projectDir, artifact) {
  const extension = path.extname(artifact).toLowerCase();
  if (!['.zip', '.dmg', '.exe'].includes(extension)) {
    throw new Error(`Unsupported license audit container: ${artifact}`);
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kancolle-license-artifact-'));
  let mounted = false;
  const mount = path.join(temp, 'volume');
  const originalHash = await sha256(artifact);
  try {
    let extracted = path.join(temp, 'extracted');
    if (extension === '.dmg') {
      if (process.platform !== 'darwin') throw new Error('DMG license audit requires macOS');
      await fs.mkdir(mount);
      await run('/usr/bin/hdiutil', ['attach', artifact, '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount]);
      mounted = true;
      extracted = mount;
    } else if (extension === '.zip' && process.platform === 'darwin') {
      await run('/usr/bin/ditto', ['-x', '-k', artifact, extracted]);
    } else {
      // Use the same toolset as electron-builder; the Windows vendor tool supports NSIS.
      const seven = process.platform === 'win32'
        ? path.join(projectDir, 'node_modules/electron-winstaller/vendor/7z-x64.exe')
        : await require('app-builder-lib/out/toolsets/7zip').getPath7za();
      const unpack = (file, destination, filters = []) => run(seven,
        ['x', file, '-y', `-o${destination}`, ...filters], { maxBuffer: 16 * 1024 * 1024 });
      if (extension === '.exe') {
        await unpack(artifact, extracted, ['$PLUGINSDIR/app-*.7z']);
        const payloadDir = path.join(extracted, '$PLUGINSDIR');
        const payloads = (await fs.readdir(payloadDir)).filter(name => /^app-.*\.7z$/.test(name));
        if (!payloads.length) throw new Error('No embedded NSIS/portable application payload');
        const reports = [];
        for (const [index, payload] of payloads.entries()) {
          const app = path.join(temp, `payload-${index}`);
          await unpack(path.join(payloadDir, payload), app);
          reports.push(await verifyLicenses(projectDir, path.join(app, 'resources')));
        }
        if (await sha256(artifact) !== originalHash) throw new Error('Artifact changed during verification');
        return { artifact: path.basename(artifact), sha256: originalHash, payloads: reports };
      }
      await unpack(artifact, extracted);
    }
    const apps = (await fs.readdir(extracted, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && entry.name.endsWith('.app'));
    if (apps.length > 1) throw new Error('Ambiguous app bundles in distribution container');
    const resources = apps.length === 1
      ? path.join(extracted, apps[0].name, 'Contents', 'Resources')
      : path.join(extracted, 'resources');
    const report = await verifyLicenses(projectDir, resources);
    if (await sha256(artifact) !== originalHash) throw new Error('Artifact changed during verification');
    return { artifact: path.basename(artifact), sha256: originalHash, payloads: [report] };
  } finally {
    // Never remove the temporary mountpoint until the disk image is detached.
    if (mounted) await run('/usr/bin/hdiutil', ['detach', mount]);
    await fs.rm(temp, { recursive: true, force: true });
  }
}

module.exports = verify;
if (require.main === module) {
  const [artifact, output] = process.argv.slice(2);
  if (!artifact) throw new Error('Usage: node scripts/verify-artifact-licenses.cjs <artifact> [report.json]');
  verify(path.resolve(__dirname, '..'), path.resolve(artifact)).then(async result => {
    const report = JSON.stringify(result, null, 2) + '\n';
    if (output) await fs.writeFile(output, report);
    else console.log(report);
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
