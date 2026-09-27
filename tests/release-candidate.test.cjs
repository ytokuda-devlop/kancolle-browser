const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const R = require('resedit');
const { peInfo, assertAppVersions, assertSignature, verifyCandidate } = require('../scripts/verify-release-candidate.cjs');

function executable(version, productName) {
  const exe = R.NtExecutable.createEmpty(false, false);
  const resources = R.NtExecutableResource.from(exe);
  const info = R.Resource.VersionInfo.createEmpty();
  info.setFileVersion(version, 1033);
  info.setProductVersion(version, 1033);
  info.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: productName });
  info.outputToResourceEntries(resources.entries);
  resources.outputResource(exe);
  return Buffer.from(exe.generate());
}

test('PE resource inspection rejects the previous Electron-branded application version', () => {
  const baseline = { app: { version: '1.0.0', productName: 'Example' } };
  assert.throws(() => assertAppVersions(peInfo(executable('44.0.0', 'Electron')), baseline, 'app'), /FileVersion/);
  assert.throws(() => assertAppVersions(peInfo(executable('1.0.0', 'Electron')), baseline, 'app'), /ProductName/);
  assert.doesNotThrow(() => assertAppVersions(peInfo(executable('1.0.0', 'Example')), baseline, 'app'));
  assert.throws(() => assertAppVersions({ versions: [] }, baseline, 'app'), /missing PE version/);
});

test('certificate presence alone and ad-hoc signing cannot satisfy signed-candidate checks', () => {
  for (const status of ['unsigned', 'ad-hoc', 'present-unverified']) {
    assert.throws(() => assertSignature({ status }, true, 'app'), /Verified signature required/);
    assert.doesNotThrow(() => assertSignature({ status }, false, 'app'));
  }
  assert.throws(() => assertSignature({ status: 'invalid' }, false, 'app'), /Invalid signature/);
  assert.doesNotThrow(() => assertSignature({ status: 'verified' }, true, 'app'));
});

test('changed source notices cannot silently redefine a frozen baseline', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'notice.txt'), 'changed');
  const baseline = path.join(root, 'baseline.json');
  await fs.writeFile(baseline, JSON.stringify({ schema: 1, sourceFiles: { 'notice.txt': '0'.repeat(64) } }));
  await assert.rejects(verifyCandidate(root, path.join(root, 'unused.zip'), baseline), /Frozen source changed: notice.txt/);
});
