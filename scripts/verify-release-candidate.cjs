// Final artifact version/notice audit. Read-only, including for signed artifacts.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const asar = require('@electron/asar');
const R = require('resedit');
const plist = require('plist');
const verifyArtifact = require('./verify-artifact-licenses.cjs');
const { licenseFiles } = require('./verify-packaged-licenses.cjs');
const ROOT = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const normalizeVersion = value => String(value).replace(/(?:\.0)+$/, '');

function peInfo(bytes) {
  const exe = R.NtExecutable.from(bytes, { ignoreCert: true });
  const infos = R.Resource.VersionInfo.fromEntries(R.NtExecutableResource.from(exe).entries);
  const fixedVersion = (ms, ls) => [ms >>> 16, ms & 65535, ls >>> 16, ls & 65535].join('.');
  const fixedVersions = infos.map(v => ({
    FileVersion: fixedVersion(v.fixedInfo.fileVersionMS, v.fixedInfo.fileVersionLS),
    ProductVersion: fixedVersion(v.fixedInfo.productVersionMS, v.fixedInfo.productVersionLS),
  }));
  const versions = infos
    .flatMap(v => v.getAllLanguagesForStringValues().map(lang => v.getStringValues(lang)));
  const text = exe.getAllSections().find(s => s.info.name === '.text');
  const nt = bytes.readUInt32LE(60), optional = nt + 24;
  const dirs = optional + (bytes.readUInt16LE(optional) === 0x20b ? 112 : 96);
  return { versions, fixedVersions, architecture: exe.is32bit() ? 'x86' : 'x64',
    textSha256: text?.data ? hash(Buffer.from(text.data)) : null,
    certificateTablePresent: bytes.readUInt32LE(dirs + 8 * 4 + 4) > 0 };
}

function machTextHash(bytes) {
  // Current distribution target is little-endian x64 Mach-O, not universal/arm64.
  check(bytes.readUInt32LE(0) === 0xfeedfacf && bytes.readUInt32LE(4) === 0x01000007,
    'Expected an x64 Mach-O Electron framework');
  let at = 32;
  for (let i = 0; i < bytes.readUInt32LE(16); i++) {
    const command = bytes.readUInt32LE(at), size = bytes.readUInt32LE(at + 4);
    check(size >= 8 && at + size <= bytes.length, 'Invalid Mach-O command');
    if (command === 0x19) {
      for (let j = 0; j < bytes.readUInt32LE(at + 64); j++) {
        const section = at + 72 + j * 80;
        if (bytes.subarray(section, section + 16).toString().replace(/\0.*$/, '') === '__text') {
          const length = Number(bytes.readBigUInt64LE(section + 40));
          const offset = bytes.readUInt32LE(section + 48);
          check(offset + length <= bytes.length, 'Invalid Mach-O text section');
          return hash(bytes.subarray(offset, offset + length));
        }
      }
    }
    at += size;
  }
  throw new Error('No Mach-O __text section');
}

function assertAppVersions(info, baseline, label) {
  check(info.versions.length > 0, `${label}: missing PE version resource`);
  for (const v of info.versions) {
    for (const key of ['FileVersion', 'ProductVersion']) {
      check(normalizeVersion(v[key]) === normalizeVersion(baseline.app.version),
        `${label}: ${key}=${v[key]}, expected ${baseline.app.version}`);
    }
    check(v.ProductName === baseline.app.productName, `${label}: unexpected ProductName=${v.ProductName}`);
  }
  for (const fixed of info.fixedVersions || []) {
    for (const [key, value] of Object.entries(fixed)) check(normalizeVersion(value) === normalizeVersion(baseline.app.version),
      `${label}: fixed ${key}=${value}, expected ${baseline.app.version}`);
  }
}

function assertSignature(result, requireSigned, label) {
  check(!['invalid', 'inspection-failed'].includes(result.status), `Invalid signature: ${label}`);
  check(!requireSigned || result.status === 'verified', `Verified signature required: ${label} (${result.status})`);
}

async function signature(file, platform) {
  if (platform === 'darwin') {
    const display = await run('/usr/bin/codesign', ['-d', '--verbose=4', file]).catch(e => e);
    const description = String(display.stderr || '');
    if (description.includes('not signed at all')) return { status: 'unsigned' };
    if (display.code) return { status: 'inspection-failed', detail: description.trim() };
    const verified = await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', file]).then(() => true, () => false);
    return { status: !verified ? 'invalid' : description.includes('Signature=adhoc') ? 'ad-hoc' : 'verified',
      authorities: [...description.matchAll(/^Authority=(.*)$/gm)].map(m => m[1]),
      teamIdentifier: description.match(/^TeamIdentifier=(.*)$/m)?.[1] || null,
      notarizationChecked: false };
  }
  const info = peInfo(await fs.readFile(file));
  if (!info.certificateTablePresent) return { status: 'unsigned' };
  if (process.platform !== 'win32') return { status: 'present-unverified',
    reason: 'Authenticode trust validation requires rerunning this audit on Windows' };
  const command = '$s=Get-AuthenticodeSignature -LiteralPath $env:CANDIDATE_AUDIT_FILE; ' +
    '@{status=$s.Status.ToString();subject=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress';
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { env: { ...process.env, CANDIDATE_AUDIT_FILE: path.resolve(file) } });
  const result = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  return { ...result, authenticodeStatus: result.status, status: result.status === 'Valid' ? 'verified' : 'invalid' };
}

async function nativeFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { await visit(file); continue; }
      const handle = await fs.open(file, 'r');
      const magic = Buffer.alloc(4);
      try { await handle.read(magic, 0, 4, 0); } finally { await handle.close(); }
      if (magic.subarray(0, 2).toString() === 'MZ' || magic.readUInt32LE() === 0xfeedfacf)
        files.push(path.relative(root, file).split(path.sep).join('/'));
      else check(!/\.(exe|dll|dylib|node|so)$/i.test(file), `Unrecognized native file: ${entry.name}`);
    }
  }
  await visit(root);
  return files.sort();
}

async function nativeIdentity(file, platform) {
  const bytes = await fs.readFile(file);
  if (platform === 'darwin') return { codeSha256: machTextHash(bytes) };
  const info = peInfo(bytes);
  return { codeSha256: info.textSha256, versions: info.versions };
}

async function freeze(projectDir, output) {
  const project = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json')));
  const lock = JSON.parse(await fs.readFile(path.join(projectDir, 'package-lock.json')));
  check(lock.version === project.version && lock.packages[''].version === project.version, 'Root lockfile version differs');
  const electronVersion = lock.packages['node_modules/electron'].version;
  const notices = await fs.readFile(path.join(projectDir, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  check(notices.includes(`### Electron ${electronVersion}\n`), 'Electron notice version differs');
  const audited = JSON.parse(await fs.readFile(path.join(projectDir, 'docs/native-inventory-2026-09-26/evidence/native-components.json')));
  check(audited.officialElectronArchives.every(a => a.file.startsWith(`electron-v${electronVersion}-`)), 'Native audit must be renewed for this Electron version');
  const win = audited.inventories['setup-app'].binaries.find(b => b.officialElectronTextMatches?.some(o => o.path === 'electron.exe'));
  check(win, 'Missing audited Electron Windows code identity');
  const framework = path.join(projectDir, 'node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
  const mac = await fs.readFile(framework);
  check(audited.inventories.mac.binaries.some(b => b.sha256 === hash(mac) && b.officialElectronMatches.length), 'Installed Electron does not match audited official framework');
  const npm = {};
  const visit = name => {
    if (npm[name]) return;
    const entry = lock.packages[`node_modules/${name}`];
    check(entry && !entry.dev, `Unsupported production dependency layout: ${name}`);
    npm[name] = { version: entry.version, license: entry.license };
    Object.keys(entry.dependencies || {}).forEach(visit);
  };
  Object.keys(project.dependencies).forEach(visit);
  check(Object.keys(npm).sort().join(',') === 'js-tokens,loose-envify,react,react-dom,scheduler', 'New production dependencies require notice review');
  check(notices.includes(`### React and React DOM ${npm.react.version}\n`) && npm.react.version === npm['react-dom'].version, 'React notice version differs');
  check(notices.includes(`### Scheduler ${npm.scheduler.version}\n`), 'Scheduler notice version differs');
  for (const name of ['js-tokens', 'loose-envify']) check(notices.includes(`| \`${name}\` | ${npm[name].version} |`), `${name} notice version differs`);
  const sourceFiles = {};
  for (const file of ['package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
    ...licenseFiles(project).map(n => `licenses/${n}`)]) sourceFiles[file] = hash(await fs.readFile(path.join(projectDir, file)));
  const native = { darwin: {}, win32: {} };
  for (const [platform, inventory, directory] of [
    ['darwin', audited.inventories.mac.binaries, 'mac'],
    ['win32', audited.inventories['setup-app'].binaries, 'setup-app'],
  ]) {
    for (const row of inventory) {
      const original = path.join(projectDir, 'release/native-inventory-2026-09-26/final-extracted', directory, row.path);
      check(hash(await fs.readFile(original)) === row.sha256, `Audited native file changed: ${row.path}`);
      const relative = platform === 'darwin' ? row.path.replace(/^[^/]+\.app\//, '') : row.path;
      const identity = await nativeIdentity(original, platform);
      // The old test build retained Electron's version resource on the main EXE.
      // Candidate app version resources are checked against baseline.app instead.
      if (platform === 'win32' && relative === project.build.productName + '.exe') delete identity.versions;
      native[platform][relative] = identity;
    }
  }
  const baseline = { schema: 1, app: { name: project.name, version: project.version, productName: project.build.productName },
    electron: { version: electronVersion, macTextSha256: machTextHash(mac), winTextSha256: win.textSectionSha256 }, npm, sourceFiles,
    native,
    scope: 'Frozen version/notice reference; not license clearance or signing approval' };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
  return baseline;
}

async function verifyCandidate(projectDir, artifact, baselineFile, requireSigned = false) {
  const baselineBytes = await fs.readFile(baselineFile);
  const baseline = JSON.parse(baselineBytes);
  check(baseline.schema === 1, 'Unsupported baseline');
  for (const [file, expected] of Object.entries(baseline.sourceFiles))
    check(hash(await fs.readFile(path.join(projectDir, file))) === expected, `Frozen source changed: ${file}`);
  const signatureCheck = async (file, platform) => {
    const result = await signature(file, platform);
    assertSignature(result, requireSigned, path.basename(file));
    return result;
  };
  const report = await verifyArtifact(projectDir, artifact, {
    inspectPayload: async (resources, platform) => {
      const archive = path.join(resources, 'app.asar');
      asar.uncache(archive);
      const app = JSON.parse(asar.extractFile(archive, 'package.json'));
      check(app.name === baseline.app.name && app.version === baseline.app.version, 'ASAR application version/name differs');
      const npm = {};
      for (const entry of asar.listPackage(archive)) {
        const name = entry.replace(/^\//, '');
        if (name.startsWith('node_modules/') && name.endsWith('/package.json')) {
          const pkg = JSON.parse(asar.extractFile(archive, name));
          check(!npm[pkg.name], `Duplicate npm package: ${pkg.name}`);
          npm[pkg.name] = { version: pkg.version, license: pkg.license };
        }
      }
      check(Object.keys(npm).sort().join(',') === Object.keys(baseline.npm).sort().join(','), 'Packaged npm set differs');
      for (const [name, expected] of Object.entries(baseline.npm))
        check(npm[name].version === expected.version && npm[name].license === expected.license, `Packaged npm version/license differs: ${name}`);
      const appRoot = platform === 'darwin' ? path.dirname(path.dirname(resources)) : path.dirname(resources);
      const paths = await nativeFiles(appRoot);
      check(JSON.stringify(paths) === JSON.stringify(Object.keys(baseline.native[platform]).sort()), 'Native file set differs from audited baseline');
      const nativeComponents = [];
      for (const relative of paths) {
        const current = await nativeIdentity(path.join(appRoot, relative), platform);
        const expected = baseline.native[platform][relative];
        check(current.codeSha256 === expected.codeSha256, `Native code differs: ${relative}`);
        if (expected.versions) check(JSON.stringify(current.versions) === JSON.stringify(expected.versions), `Native version resource differs: ${relative}`);
        nativeComponents.push({ path: relative, codeSha256: current.codeSha256 });
      }
      let native, signed;
      if (platform === 'darwin') {
        const appPlist = plist.parse(await fs.readFile(path.join(appRoot, 'Contents/Info.plist'), 'utf8'));
        check(appPlist.CFBundleShortVersionString === baseline.app.version && normalizeVersion(appPlist.CFBundleVersion) === normalizeVersion(baseline.app.version), 'macOS bundle version differs');
        const base = path.join(appRoot, 'Contents/Frameworks/Electron Framework.framework/Versions/A');
        const electronPlist = plist.parse(await fs.readFile(path.join(base, 'Resources/Info.plist'), 'utf8'));
        check(electronPlist.CFBundleVersion === baseline.electron.version, 'Electron framework version differs');
        check(machTextHash(await fs.readFile(path.join(base, 'Electron Framework'))) === baseline.electron.macTextSha256, 'Electron Mach-O code differs');
        native = { appVersion: appPlist.CFBundleShortVersionString, buildVersion: appPlist.CFBundleVersion, electronVersion: electronPlist.CFBundleVersion, codeMatchesBaseline: true };
        signed = await signatureCheck(appRoot, platform);
      } else {
        const executable = path.join(path.dirname(resources), baseline.app.productName + '.exe');
        native = peInfo(await fs.readFile(executable));
        assertAppVersions(native, baseline, 'Windows application');
        check(native.architecture === 'x64' && native.textSha256 === baseline.electron.winTextSha256, 'Electron PE code/architecture differs');
        native.electronVersionByCodeIdentity = baseline.electron.version;
        signed = await signatureCheck(executable, platform);
      }
      return { platform, appVersion: app.version, asarSha256: hash(await fs.readFile(archive)), npm, native, nativeComponents, signature: signed };
    },
    inspectContainer: async (file, extracted) => {
      if (path.extname(file).toLowerCase() !== '.exe') return { signature: { status: 'not-applicable', note: 'App bundle signature checked; container notarization/signature not checked' } };
      const info = peInfo(await fs.readFile(file));
      assertAppVersions(info, baseline, 'Windows container');
      const uninstallers = [];
      async function walk(dir) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(p);
          else if (/^Uninstall.*\.exe$/i.test(entry.name)) {
            const native = peInfo(await fs.readFile(p));
            assertAppVersions(native, baseline, 'Uninstaller');
            uninstallers.push({ file: entry.name, native, signature: await signatureCheck(p, 'win32') });
          }
        }
      }
      await walk(extracted);
      return { native: info, signature: await signatureCheck(file, 'win32'), uninstallers };
    },
  });
  return { checkedAt: new Date().toISOString(), baselineSha256: hash(baselineBytes), requireSigned,
    ...report, scope: 'Application/Electron/npm versions and frozen notice equality; signature scope is recorded separately; not full license clearance' };
}

module.exports = { freeze, verifyCandidate, peInfo, machTextHash, assertAppVersions, assertSignature };
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args[0] === '--freeze' && args.length === 2) {
      await freeze(ROOT, path.resolve(args[1]));
      console.log('Created frozen candidate reference');
      return;
    }
    const requireSigned = args.includes('--require-signatures');
    const positional = args.filter(a => a !== '--require-signatures');
    check(positional.length === 3, 'Usage: verify-release-candidate.cjs artifact baseline.json report.json [--require-signatures]');
    const [artifact, baseline, output] = positional.map(p => path.resolve(p));
    check(output !== artifact && output !== baseline, 'Report must not overwrite artifact/baseline');
    const report = await verifyCandidate(ROOT, artifact, baseline, requireSigned);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`Final version/notice check passed: ${path.basename(artifact)}`);
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
