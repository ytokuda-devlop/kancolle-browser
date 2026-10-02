const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const verify = require('../scripts/verify-packaged-licenses.cjs');
const verifyArtifact = require('../scripts/verify-artifact-licenses.cjs');
const run = promisify(execFile);
const asar = require('@electron/asar');
const projectConfig = require('../package.json');
const selected = verify.licenseFiles(projectConfig);

test('portable configuration requires its component notices', () => {
  const project = structuredClone(projectConfig);
  project.build.win.target = [{ target: 'portable', arch: ['x64'] }];
  const entry = project.build.extraResources.find(e => e.from === 'licenses');
  entry.filter = entry.filter.filter(n => n !== 'windows/nsis7z-README.txt');
  assert.throws(() => verify.licenseFiles(project), /Missing portable license: windows\/nsis7z-README.txt/);
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'license-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const app = path.join(root, 'Example.app');
  const resources = path.join(app, 'Contents', 'Resources');
  const licenseDir = path.join(resources, 'licenses');
  await fs.mkdir(path.join(project, 'licenses/npm'), { recursive: true });
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify(projectConfig));
  for (const name of selected) {
    await fs.mkdir(path.dirname(path.join(project, 'licenses', name)), { recursive: true });
    await fs.writeFile(path.join(project, 'licenses', name), `Contents of ${name}\n`);
  }
  await fs.cp(path.join(project, 'licenses'), licenseDir, { recursive: true });
  // Historical source-tree records must not be required or packaged.
  await fs.writeFile(path.join(project, 'licenses/FFmpeg-SOURCE.txt'), 'legacy record');
  const appSource = path.join(root, 'app-source');
  await fs.mkdir(appSource);
  await fs.writeFile(path.join(appSource, 'package.json'), '{"name":"fixture"}');
  await asar.createPackage(appSource, path.join(resources, 'app.asar'));
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    await fs.writeFile(path.join(project, name), name + '\n');
    await fs.copyFile(path.join(project, name), path.join(licenseDir, name));
  }
  return { root, project, app, resources, licenseDir, appSource };
}

test('all root and nested notices are verified outside ASAR', async t => {
  const f = await fixture(t);
  const report = await verify(f.project, f.resources);
  assert.equal(report.fileCount, selected.length + 2);
  assert(report.files.some(file => file.path === 'npm/js-tokens-LICENSE.txt'));
});

test('missing, altered and empty licenses fail verification', async t => {
  const f = await fixture(t);
  const notice = path.join(f.licenseDir, 'npm/js-tokens-LICENSE.txt');
  await fs.rm(notice);
  await assert.rejects(verify(f.project, f.resources), /ENOENT/);
  await fs.writeFile(notice, 'wrong');
  await assert.rejects(verify(f.project, f.resources), /mismatched/);
  await fs.writeFile(notice, '');
  await fs.writeFile(path.join(f.project, 'licenses/npm/js-tokens-LICENSE.txt'), '');
  await assert.rejects(verify(f.project, f.resources), /Empty/);
});

test('final ZIP is checked independently of the packed app', { skip: process.platform !== 'darwin' }, async t => {
  const f = await fixture(t);
  const good = path.join(f.root, 'good.zip');
  await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', f.app, good]);
  const result = await verifyArtifact(f.project, good);
  assert.equal(result.payloads[0].fileCount, selected.length + 2);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  // afterPack can succeed while a later container is missing files.
  await fs.rm(path.join(f.licenseDir, 'THIRD_PARTY_NOTICES.md'));
  const bad = path.join(f.root, 'bad.zip');
  await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', f.app, bad]);
  await assert.rejects(verifyArtifact(f.project, bad), /ENOENT/);
});


test('legacy license material is rejected in the packaged app', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.licenseDir, 'FFmpeg-SOURCE.txt'), 'legacy record');
  await assert.rejects(verify(f.project, f.resources), /Unexpected packaged license material/);
});

test('a container changed during final candidate inspection is rejected', { skip: process.platform !== 'darwin' }, async t => {
  const f = await fixture(t);
  const file = path.join(f.root, 'changing.zip');
  await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', f.app, file]);
  await assert.rejects(verifyArtifact(f.project, file, {
    inspectContainer: async () => { await fs.appendFile(file, 'changed-after-extraction'); },
  }), /Artifact changed during verification/);
});

test('removed FFmpeg is rejected inside ASAR and in unpacked resources', async t => {
  const f = await fixture(t);
  const dependency = path.join(f.appSource, 'node_modules/ffmpeg-static');
  await fs.mkdir(dependency, { recursive: true });
  await fs.writeFile(path.join(dependency, 'index.js'), 'module.exports = "ffmpeg";');
  await asar.createPackage(f.appSource, path.join(f.resources, 'app.asar'));
  await assert.rejects(verify(f.project, f.resources), /Removed recording FFmpeg/);
  await fs.rm(dependency, { recursive: true });
  await asar.createPackage(f.appSource, path.join(f.resources, 'app.asar'));
  await fs.writeFile(path.join(f.resources, 'ffmpeg.exe'), 'old executable');
  await assert.rejects(verify(f.project, f.resources), /Removed recording FFmpeg/);
  await fs.rm(path.join(f.resources, 'ffmpeg.exe'));
  await fs.writeFile(path.join(f.resources, 'ffmpeg.dll'), 'Electron library');
  await fs.writeFile(path.join(f.resources, 'libffmpeg.dylib'), 'Electron library');
  assert.equal((await verify(f.project, f.resources)).recordingFfmpegAbsent, true);
});
