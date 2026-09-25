const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

async function fixture(t) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'recording-test-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const temporary = path.join(root, 'temp');
  await fs.promises.mkdir(temporary);
  const handlers = new Map();
  const state = { save: { canceled: false, filePath: path.join(root, 'saved') } };
  const electron = {
    app: { getPath: name => name === 'temp' ? temporary : path.join(root, name) },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: { showSaveDialog: async (_, options) => {
      state.options = options;
      return state.save;
    } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/services/mediaService.js'), 'utf8'), {
    require: name => {
      if (name === 'electron') return electron;
      if (name === '../runtime') return {};
      if (['fs', 'path', 'crypto'].includes(name)) return require(name);
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
    Buffer, console: { error() {} }
  });
  return { root, temporary, state,
    invoke: (name, ...args) => handlers.get(`game:recording-${name}`)({}, ...args) };
}

test('saves every chunk unchanged as WebM, including the final chunk', async t => {
  const f = await fixture(t);
  assert.equal((await f.invoke('start')).success, true);
  const chunks = [Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('last chunk')];
  for (const [sequence, bytes] of chunks.entries()) {
    assert.equal((await f.invoke('chunk', sequence, bytes)).success, true);
  }
  const result = await f.invoke('stop');
  assert.equal(result.success, true);
  assert.equal(result.path, `${f.state.save.filePath}.webm`);
  assert.deepEqual(await fs.promises.readFile(result.path), Buffer.concat(chunks));
  assert.equal(f.state.options.filters[0].extensions[0], 'webm');
  assert.match(f.state.options.defaultPath, /Kancolle[/\\]kancolle-.*\.webm$/);
  assert.deepEqual(await fs.promises.readdir(f.temporary), []);
});

test('cancel removes the temporary recording and allows another recording', async t => {
  const f = await fixture(t);
  await f.invoke('start');
  await f.invoke('chunk', 0, Buffer.from('data'));
  f.state.save = { canceled: true };
  assert.equal((await f.invoke('stop')).canceled, true);
  assert.deepEqual(await fs.promises.readdir(f.temporary), []);
  assert.equal((await f.invoke('start')).success, true);
  assert.equal((await f.invoke('abort')).success, true);
});

test('failed save preserves data and a subsequent recording does not overwrite recovery data', async t => {
  const f = await fixture(t);
  await f.invoke('start');
  await f.invoke('chunk', 0, Buffer.from('recover me'));
  f.state.save.filePath = path.join(f.root, 'missing-directory', 'saved.webm');
  const result = await f.invoke('stop');
  assert.equal(result.success, false);
  assert.equal(await fs.promises.readFile(result.recoveryPath, 'utf8'), 'recover me');
  assert.equal((await f.invoke('start')).success, true);
  await f.invoke('abort');
  assert.equal(await fs.promises.readFile(result.recoveryPath, 'utf8'), 'recover me');
});

test('rejects out-of-order chunks and abort releases recording state', async t => {
  const f = await fixture(t);
  await f.invoke('start');
  assert.equal((await f.invoke('chunk', 1, Buffer.from('wrong order'))).success, false);
  await f.invoke('abort');
  assert.deepEqual(await fs.promises.readdir(f.temporary), []);
  assert.equal((await f.invoke('start')).success, true);
  await f.invoke('abort');
});
