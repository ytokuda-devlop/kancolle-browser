const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('esbuild');

const projectDir = path.resolve(__dirname, '..');
function bundle(entry) {
  return buildSync({
    absWorkingDir: projectDir,
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    write: false,
    tsconfig: 'tsconfig.electron.json'
  }).outputFiles[0].text;
}
const storeCode = bundle('electron/kancolle/store.ts');
function load(code) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require, URL, URLSearchParams, Buffer, structuredClone,
    console: { log() {}, warn() {}, error() {} }
  });
  return module.exports;
}
// VMの値を通常のオブジェクトへ変換して比較する。
const plain = value => JSON.parse(JSON.stringify(value));
const ship = (id, slots = [101, -1]) => ({
  api_id: id, api_ship_id: 10, api_lv: 20, api_nowhp: 5, api_maxhp: 30,
  api_cond: 15, api_slot: slots, api_slot_ex: 102, api_onslot: [3, 0],
  api_karyoku: [40, 50], api_sakuteki: [20, 30], api_soku: 10, api_leng: 2
});
const deck = (id, ships) => ({
  api_id: id, api_name: `第${id}艦隊`, api_ship: ships, api_mission: [0, 0, 0, 0]
});
const master = {
  api_mst_ship: [{ api_id: 10, api_name: 'テスト艦', api_stype: 7, api_maxeq: [18, 0] }],
  api_mst_slotitem: [{ api_id: 20, api_name: 'テスト装備', api_type: [0, 0, 6], api_tyku: 10 }]
};
const slotItems = [
  { api_id: 101, api_slotitem_id: 20, api_level: 3, api_alv: 7 },
  { api_id: 102, api_slotitem_id: 20 }
];
const params = values => new URLSearchParams(values);

test('タイトルは起動時に艦娘を表示し、名前を取得できた場合に旗艦名を表示する', () => {
  const { getMainWindowTitle } = load(bundle('electron/window/title.ts'));
  assert.equal(getMainWindowTitle(), '艦娘は今日もお仕事です');
  assert.equal(getMainWindowTitle('電改'), '電改は今日もお仕事です');
});

function loadCapture() {
  const code = buildSync({
    stdin: {
      contents: "import runtime = require('./electron/runtime'); export { runtime }; export { setupApiCapture } from './electron/kancolle/apiCapture'; export { mapCatalogStore } from './electron/kancolle/mapCatalog';",
      resolveDir: projectDir, loader: 'ts'
    },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['electron']
  }).outputFiles[0].text;
  return load(code);
}

test('ログイン・旗艦交換・プリセット展開でタイトルを更新し、再ログインと情報欠落時は艦娘に戻す', async () => {
  const { setupApiCapture, runtime } = loadCapture();
  const titles = [];
  let onMessage;
  let currentBody;
  runtime.mainWindow = {
    isDestroyed: () => false, setTitle: title => titles.push(title),
    webContents: { send() {} }
  };
  setupApiCapture({ webContents: { debugger: {
    isAttached: () => false, attach() {},
    on: (event, callback) => { onMessage = callback; },
    sendCommand: async command => command === 'Network.getResponseBody' ? { body: currentBody } : {}
  } } });
  async function receive(endpoint, data, request = {}) {
    currentBody = 'svdata=' + JSON.stringify({ api_result: 1, api_data: data });
    await onMessage({}, 'Network.requestWillBeSent', { requestId: endpoint,
      request: { url: `https://example.test/kcsapi/${endpoint}`, postData: params(request).toString() }
    }, 'game');
    await onMessage({}, 'Network.loadingFinished', { requestId: endpoint }, 'game');
  }
  const loginMaster = { ...master, api_mst_ship: [
    { ...master.api_mst_ship[0], api_name: '電' },
    { ...master.api_mst_ship[0], api_id: 11, api_name: '雷改' }
  ] };
  await receive('api_start2/getData', loginMaster);
  assert.equal(titles.at(-1), '艦娘は今日もお仕事です');
  await receive('api_port/port', {
    api_ship: [ship(1), { ...ship(2), api_ship_id: 11 }],
    api_deck_port: [deck(1, [1]), deck(2, [2])]
  });
  assert.equal(titles.at(-1), '電は今日もお仕事です');
  await receive('api_req_hensei/change', {}, { api_id: '1', api_ship_idx: '0', api_ship_id: '2' });
  assert.equal(titles.at(-1), '雷改は今日もお仕事です');
  await receive('api_req_hensei/preset_select', deck(1, [1]));
  assert.equal(titles.at(-1), '電は今日もお仕事です');
  await receive('api_req_hensei/change', {}, { api_id: '2', api_ship_idx: '0', api_ship_id: '2' });
  assert.equal(titles.at(-1), '電は今日もお仕事です');
  await receive('api_req_hensei/preset_select', deck(1, [999]));
  assert.equal(titles.at(-1), '艦娘は今日もお仕事です');
  await receive('api_req_hensei/preset_select', deck(1, [1]));
  await receive('api_start2/getData', loginMaster);
  assert.equal(titles.at(-1), '艦娘は今日もお仕事です');
});

test('master・母港・装備を表示用データに整形し、所有枠と資材を更新する', () => {
  const store = load(storeCode);
  store.updateMaster(master);
  store.updatePort({ api_ship: [ship(1)], api_deck_port: [deck(1, [1, -1])],
    api_basic: { api_max_chara: 100, api_max_slotitem: 200 } });
  store.updateSlotItems(slotItems);
  store.updateMaterials([{ api_id: 1, api_value: 123 }]);
  store.updateUseItems([{ api_id: 54, api_count: 2 }, { api_id: 59, api_count: 1 }]);
  const formatted = plain(store.getFormattedFleets());
  assert.equal(formatted[0].ships[0].name, 'テスト艦');
  assert.equal(formatted[0].ships[0].karyoku, 40);
  assert.equal(formatted[0].ships[0].slots.length, 2);
  assert.equal(formatted[0].ships[0].slots[0].currentAircraft, 3);
  assert.equal(formatted[0].ships[0].slots[1].isExpansion, true);
  assert.equal(formatted[0].ships[0].slots[1].currentAircraft, 0);
  assert.equal(store.getFormattedMaterials().maxSlotItems, 203);
  store.updateRecord({ api_ship: [2, 120], api_slotitem: [4, 250] });
  store.updateMaterials([10, 20, 30, 40, 5, 6, 7, 8]);
  store.updateUseItems([]);
  assert.deepEqual(plain(store.getFormattedMaterials()), {
    fuel: 10, ammo: 20, steel: 30, bauxite: 40, burner: 5, bucket: 6,
    devco: 7, screw: 8, mamiya: 0, irako: 0,
    shipCount: 2, maxShips: 120, slotItemCount: 4, maxSlotItems: 253
  });
});

test('艦隊内の交換・艦隊間の交換・一括解除で艦娘を失わない', () => {
  const store = load(storeCode);
  store.updateDeck([deck(1, [1, 2, 3]), deck(2, [4, 5])]);
  store.updateDeckFromChange(params({ api_id: '1', api_ship_idx: '0', api_ship_id: '3' }));
  assert.deepEqual(plain(store.decks[0].shipIds), [3, 2, 1]);
  store.updateDeckFromChange(params({ api_id: '1', api_ship_idx: '1', api_ship_id: '4' }));
  assert.deepEqual(plain(store.decks.map(d => d.shipIds)), [[3, 4, 1], [2, 5]]);
  store.updateDeckFromChange(params({ api_id: '1', api_ship_idx: '0', api_ship_id: '-2' }));
  assert.deepEqual(plain(store.decks[0].shipIds), [3]);
});

test('ship2・ship3・ship_deck、補給、修復、解体、装備差分を反映する', () => {
  const store = load(storeCode);
  store.updateShip3([ship(1)]);
  store.updateShip3({ api_ship_data: [ship(2)], api_deck_data: [deck(1, [1, 2])] });
  store.updateShip3({ api_shipdata: [ship(3)] });
  store.updateSlotItems(slotItems);
  store.updateSlotItems({ api_slot_item: [{ api_id: 103, api_slotitem_id: 20 }] }, false);
  assert.equal(Object.keys(store.slotItems).length, 3);
  assert.equal(store.updateSupply({ api_ship: { api_id: 1, api_onslot: [18, 0] } }), true);
  assert.deepEqual(plain(store.ships[1].onslot), [18, 0]);
  store.updateShipSlots('/kcsapi/api_req_kaisou/slot_exchange_index', params({ api_id: '1' }), { api_slot: [-1, 101] });
  assert.deepEqual(plain(store.ships[1].slots), [-1, 101]);
  store.updateNdock([{ api_id: 1, api_state: 1, api_ship_id: 1, api_complete_time: 999 }]);
  store.completeRepair(params({ api_ndock_id: '1' }));
  assert.equal(store.ships[1].nowhp, 30);
  assert.equal(store.ships[1].cond, 40);
  assert.equal(store.getFormattedNdocks()[0].state, 0);
  store.removeDestroyedShips(params({ api_ship_id: '1', api_slot_dest_flag: '1' }));
  assert.equal(store.ships[1], undefined);
  assert.deepEqual(plain(store.decks[0].shipIds), [2]);
  assert.equal(store.slotItems[101], undefined);
  assert.equal(store.slotItems[102], undefined);
  store.updateSlotItems([]);
  assert.equal(Object.keys(store.slotItems).length, 0);
});

test('任務ページの置換・解除と、出撃更新・母港帰還を反映する', () => {
  const store = load(storeCode);
  store.updateQuestList({ api_list: [-1, null, { api_no: 1, api_state: 2, api_progress_flag: 2 }] });
  store.updateQuestList({ api_list: [{ api_no: 2, api_state: 3 }], api_disp_page: 2 });
  assert.deepEqual(plain(store.getFormattedQuests().map(q => q.progress)), [80, 100]);
  store.updateQuestList({ api_list: [{ api_no: 3, api_state: 2 }], api_disp_page: 1 });
  assert.deepEqual(plain(store.getFormattedQuests().map(q => q.id)), [2, 3]);
  store.updateQuestFromAction('/kcsapi/api_req_quest/stop', params({ api_quest_id: '3' }));
  assert.equal(store.getFormattedQuests().length, 1);
  store.updateSortie({ api_maparea_id: 1, api_mapinfo_no: 1, api_no: 1 }, params({ api_deck_id: '2' }), true);
  store.updateSortie({ api_maparea_id: 1, api_mapinfo_no: 1, api_no: 2,
    api_eventmap: { api_now_maphp: 100, api_max_maphp: 200 } }, params({}), false);
  assert.equal(store.getFormattedSortie().deckId, 2);
  assert.equal(store.getFormattedSortie().eventMap.maxHp, 200);
  store.clearSortie();
  assert.equal(store.getFormattedSortie(), null);
});

test('CDPの同一requestIdをセッション別に処理し、base64応答とIPC通知を扱う', async () => {
  const { setupApiCapture, runtime } = loadCapture();
  const bodies = new Map();
  const notifications = [];
  let onMessage;
  runtime.mainWindow = { isDestroyed: () => false, setTitle() {}, webContents: { send: (channel, data) => notifications.push({ channel, data: plain(data) }) } };
  const debuggerMock = {
    isAttached: () => false,
    attach() {},
    on: (event, callback) => { onMessage = callback; },
    sendCommand: async (command, args, sessionId) => command === 'Network.getResponseBody'
      ? bodies.get(`${sessionId}:${args.requestId}`) : {}
  };
  setupApiCapture({ webContents: { debugger: debuggerMock } });
  for (const [sessionId, fuel] of [['frame1', 100], ['frame2', 200]]) {
    const body = 'svdata=' + JSON.stringify({ api_result: 1, api_data: [fuel, 2, 3, 4] });
    bodies.set(`${sessionId}:same-id`, { body: Buffer.from(body).toString('base64'), base64Encoded: true });
    await onMessage({}, 'Network.requestWillBeSent', {
      requestId: 'same-id', request: { url: 'https://example.test/kcsapi/api_get_member/material' }
    }, sessionId);
  }
  for (const sessionId of ['frame1', 'frame2']) {
    await onMessage({}, 'Network.loadingFinished', { requestId: 'same-id' }, sessionId);
  }
  assert.deepEqual(notifications.map(n => n.data.fuel), [100, 200]);
  assert.ok(notifications.every(n => n.channel === 'kancolle:material-data'));
  await onMessage({}, 'Network.loadingFinished', { requestId: 'same-id' }, 'frame1');
  assert.equal(notifications.length, 2);
  await onMessage({}, 'Network.requestWillBeSent', {
    requestId: 'cancelled', request: { url: 'https://example.test/kcsapi/api_get_member/material' }
  }, 'frame1');
  await onMessage({}, 'Network.loadingFailed', { requestId: 'cancelled' }, 'frame1');
  await onMessage({}, 'Network.loadingFinished', { requestId: 'cancelled' }, 'frame1');
  assert.equal(notifications.length, 2);
});

test('母港で任務の全ページを取得し、途中失敗時は既存任務を保持して再試行する', async () => {
  const { setupApiCapture, runtime } = loadCapture();
  const notifications = [];
  let onMessage;
  let currentBody;
  let failSecondPage = true;
  let questRequests = 0;
  const reply = data => ({ api_result: 1, api_data: data });
  const session = {
    fetch: async (url, options) => {
      const endpoint = new URL(url).pathname.split('/').pop();
      let response;
      if (endpoint === 'useitem') response = reply([]);
      else if (endpoint === 'record') response = reply({ api_ship: [0, 100], api_slotitem: [0, 200] });
      else if (endpoint === 'kdock') response = reply([]);
      else if (endpoint === 'questlist') {
        questRequests += 1;
        const page = Number(new URLSearchParams(options.body).get('api_page_no'));
        response = page === 2 && failSecondPage ? { api_result: 0 } : reply({
          api_page_count: 2, api_disp_page: page,
          api_list: [{ api_no: page, api_title: `任務${page}`, api_state: 2 }]
        });
      } else throw new Error(`Unexpected endpoint: ${endpoint}`);
      return { status: 200, text: async () => 'svdata=' + JSON.stringify(response) };
    }
  };
  runtime.mainWindow = { isDestroyed: () => false, setTitle() {}, webContents: { send: (channel, data) => notifications.push({ channel, data: plain(data) }) } };
  const view = { webContents: {
    isDestroyed: () => false, session,
    debugger: { isAttached: () => false, attach() {},
      on: (event, callback) => { onMessage = callback; },
      sendCommand: async command => command === 'Network.getResponseBody' ? { body: currentBody } : {}
    }
  } };
  runtime.gameView = view;
  setupApiCapture(view);
  async function receive(endpoint, data) {
    currentBody = 'svdata=' + JSON.stringify(reply(data));
    await onMessage({}, 'Network.requestWillBeSent', { requestId: endpoint,
      request: { url: `https://example.test/kcsapi/${endpoint}`, postData: 'api_token=test-token' }
    }, 'game');
    await onMessage({}, 'Network.loadingFinished', { requestId: endpoint }, 'game');
  }
  await receive('api_get_member/questlist', { api_list: [{ api_no: 99, api_state: 2 }] });
  await receive('api_port/port', {});
  // 2ページ目の失敗により、中途半端な1ページ目を通知していない。
  assert.equal(notifications.filter(n => n.channel === 'kancolle:quest-data').length, 1);
  assert.equal(notifications.find(n => n.channel === 'kancolle:quest-data').data[0].id, 99);
  failSecondPage = false;
  await receive('api_port/port', {});
  const questUpdates = notifications.filter(n => n.channel === 'kancolle:quest-data');
  assert.deepEqual(questUpdates.at(-1).data.map(q => q.id), [1, 2]);
  assert.equal(questRequests, 4);
  await receive('api_port/port', {});
  assert.equal(questRequests, 4);
});

test('全艦娘一覧は編成外の艦も含み、耐久と対象の能力値だけを返す', () => {
  const store = load(storeCode);
  store.updateMaster(master);
  store.updatePort({ api_ship: [ship(1), ship(2)], api_deck_port: [deck(1, [1])] });
  const allShips = plain(store.getFormattedShips());
  assert.deepEqual(allShips.map(item => item.id), [1, 2]);
  assert.equal(allShips[1].name, 'テスト艦');
  assert.equal(allShips[1].maxhp, 30);
  assert.equal(allShips[1].karyoku, 40);
  assert.deepEqual(Object.keys(allShips[1]).sort(), [
    'id', 'name', 'lv', 'maxhp', 'cond', 'karyoku', 'raisou', 'taiku',
    'soukou', 'kaihi', 'taisen', 'sakuteki', 'lucky', 'shipType', 'equipment', 'expansionEquipment'
  ].sort());
  store.updatePort({ api_ship: [ship(2)] });
  assert.deepEqual(plain(store.getFormattedShips()).map(item => item.id), [2]);
});

test('艦種タブは派生艦種を同じ系統にまとめ、補助艦を分類する', () => {
  const { matchesShipTab } = load(bundle('src/utils/shipTabs.ts'));
  for (const [type, tab] of [
    [10, '戦艦'], [7, '空母'], [18, '空母'], [6, '重巡'],
    [4, '軽巡'], [21, '軽巡'], [2, '駆逐'], [1, '海防'],
    [14, '潜水'], [16, '補助'], [19, '補助'], [20, '補助'], [22, '補助']
  ]) {
    assert.equal(matchesShipTab(type, tab), true);
    assert.equal(matchesShipTab(type, 'ALL'), true);
    if (tab !== '補助') assert.equal(matchesShipTab(type, '補助'), false);
  }
  assert.equal(matchesShipTab(14, '空母'), false);
});

test('艦娘装備は編成外の艦も対象にし、空きスロットと補強増設を分けて返す', () => {
  const store = load(storeCode);
  store.updateMaster(master);
  store.updatePort({ api_ship: [ship(1), ship(2, [-1, 101])], api_deck_port: [deck(1, [1])] });
  store.updateSlotItems(slotItems);
  const ships = plain(store.getFormattedShips());
  assert.equal(ships[1].equipment[0], null);
  assert.equal(ships[1].equipment[1].name, 'テスト装備');
  assert.equal(ships[1].equipment[1].level, 3);
  assert.equal(ships[1].equipment[1].alv, 7);
  assert.equal(ships[1].equipment[1].isExpansion, false);
  assert.equal(ships[1].expansionEquipment.id, 102);
  assert.equal(ships[1].expansionEquipment.isExpansion, true);
  assert.equal(ships[0].equipment[0].currentAircraft, 3);
  assert.equal(ships[0].equipment[0].maxAircraft, 18);
});


test('地図カタログは未訪問・追加マスと訪問記録を保存し、重複排除と再読み込みができる', async t => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kancolle-map-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { MapCatalogStore, getMapResource } = load(bundle('electron/kancolle/mapCatalog.ts'));
  const file = path.join(dir, 'map-catalog.json');
  const store = new MapCatalogStore(file);
  await store.load();
  const url = 'https://example.test/kcs2/resources/map/001/01_info.json?version=2';
  assert.equal(getMapResource('https://example.test/kcs2/resources/map/001/01_image.json'), null);
  const body = JSON.stringify({ spots: [{ no: 0, x: 0, y: 0 }, { no: 1, x: 10, y: 20 }, { no: 3, x: 30, y: 40 }] });
  const first = await store.capture(url, body, '2026-10-14T00:00:00Z');
  assert.equal(first.added, 2);
  assert.equal(store.getCatalog().maps['1-1'].nodes['3'].visitedAt, undefined);
  const firstCatalog = plain(store.getCatalog());
  const firstFile = await fs.stat(file);
  const second = await store.capture(url, body, '2026-10-14T00:01:00Z');
  assert.equal(second.duplicate, true);
  assert.equal(second.added, 0);
  assert.deepEqual(plain(store.getCatalog()), firstCatalog);
  assert.equal((await fs.stat(file)).mtimeMs, firstFile.mtimeMs);
  const beforeSortieFile = await fs.readFile(file, 'utf8');
  const sortieSummary = await store.observeSortie({ api_maparea_id: 1, api_mapinfo_no: 1, api_no: 1, api_bosscell_no: 3 });
  assert.equal(sortieSummary.added, 0);
  assert.ok(store.getCatalog().maps['1-1'].nodes['1'].visitedAt);
  assert.equal(await fs.readFile(file, 'utf8'), beforeSortieFile);
  assert.equal((await fs.stat(file)).mtimeMs, firstFile.mtimeMs);
  await store.capture(url.replace('_info.json', '_info3.json'), JSON.stringify({ spots: [{ no: 9, x: 90, y: 40 }] }));
  // 内容・バージョン・追加地図の名前が変わっても、新規IDがなければ保存しない。
  const beforeUpdate = plain(store.getCatalog());
  const beforeFile = await fs.stat(file);
  await store.capture(url.replace('version=2', 'version=3'), JSON.stringify({ spots: [{ no: 1, x: 11, y: 20 }] }));
  await store.capture(url.replace('_info.json', '_info99.json'), body);
  assert.deepEqual(plain(store.getCatalog()), beforeUpdate);
  assert.equal((await fs.stat(file)).mtimeMs, beforeFile.mtimeMs);
  const restored = new MapCatalogStore(file);
  await restored.load();
  const map = restored.getCatalog().maps['1-1'];
  assert.deepEqual(Object.keys(map.nodes), ['1', '3', '9']);
  assert.equal(map.nodes['1'].label, 'A');
  assert.equal(map.nodes['1'].x, 10);
  assert.ok(map.nodes['1'].visitedAt);
  assert.ok(map.nodes['3'].bossObservedAt);
  assert.equal(map.nodes['3'].visitedAt, undefined);
  assert.equal(map.snapshots.length, 2);
  const before = plain(restored.getCatalog());
  await assert.rejects(restored.capture(url, '{invalid'));
  await assert.rejects(restored.capture(url, JSON.stringify({ spots: [{ no: 2, x: 0, y: 0 }, { no: '3', x: 0, y: 0 }] })));
  assert.deepEqual(plain(restored.getCatalog()), before);
});

test('CDPはiframeの地図JSONを捕捉し、UI Consoleへのログと出撃照合結果を送る', async () => {
  const { setupApiCapture, runtime, mapCatalogStore } = loadCapture();
  const logs = [];
  const evaluations = [];
  let onMessage;
  let currentBody;
  let failBody = false;
  runtime.mainWindow = { isDestroyed: () => false, webContents: { send: (channel, data) => {
    if (channel === 'kancolle:map-log') logs.push(data);
  } } };
  setupApiCapture({ webContents: { debugger: {
    isAttached: () => false, attach() {}, on: (_event, callback) => { onMessage = callback; },
    sendCommand: async (command, params, sessionId) => {
      if (command === 'Runtime.evaluate') evaluations.push({ params, sessionId });
      if (command === 'Network.getResponseBody') {
        if (failBody) throw new Error('body unavailable');
        return { body: Buffer.from(currentBody).toString('base64'), base64Encoded: true };
      }
      return {};
    }
  } } });
  async function receive(url, body) {
    currentBody = body;
    await onMessage({}, 'Network.responseReceived', { requestId: 'map', response: { url } }, 'game');
    await onMessage({}, 'Network.loadingFinished', { requestId: 'map' }, 'game');
  }
  const url = 'https://example.test/kcs2/resources/map/001/01_info.json?version=1';
  await receive(url, JSON.stringify({ spots: [{ no: 1, x: 20, y: 30 }, { no: 3, x: 40, y: 50 }] }));
  assert.equal(Object.keys(mapCatalogStore.getCatalog().maps['1-1'].nodes).length, 2);
  assert.ok(logs.some(log => log.includes('取得・保存')));
  assert.equal(evaluations[0].sessionId, 'game');
  const logCount = logs.length;
  const evaluationCount = evaluations.length;
  await receive(url.replace('version=1', 'version=2'), JSON.stringify({ spots: [{ no: 1, x: 21, y: 30 }] }));
  assert.equal(logs.length, logCount);
  assert.equal(evaluations.length, evaluationCount);
  await receive('https://example.test/kcsapi/api_req_map/start', 'svdata=' + JSON.stringify({
    api_result: 1, api_data: { api_maparea_id: 1, api_mapinfo_no: 1, api_no: 1, api_bosscell_no: 3 }
  }));
  assert.equal(logs.length, logCount);
  assert.ok(mapCatalogStore.getCatalog().maps['1-1'].nodes['1'].visitedAt);
  failBody = true;
  await receive(url, '');
  assert.ok(logs.some(log => log.includes('取得・解析・保存に失敗')));
  assert.equal(mapCatalogStore.getCatalog().maps['1-1'].snapshots.length, 1);
});


test('近代化改修で素材艦・装備の消費を保有数通知へ反映し、装備を残す指定と改修不成功も扱う', async () => {
  for (const [flag, expectedItems] of [['1', 1], ['0', 4]]) {
    const { setupApiCapture, runtime } = loadCapture();
    const notifications = [];
    let onMessage;
    let currentBody;
    runtime.mainWindow = { isDestroyed: () => false, setTitle() {},
      webContents: { send: (channel, data) => notifications.push({ channel, data: plain(data) }) } };
    setupApiCapture({ webContents: { debugger: {
      isAttached: () => false, attach() {},
      on: (event, callback) => { onMessage = callback; },
      sendCommand: async command => command === 'Network.getResponseBody' ? { body: currentBody } : {}
    } } });
    async function receive(endpoint, data, request = {}, result = 1) {
      currentBody = 'svdata=' + JSON.stringify({ api_result: result, api_data: data });
      await onMessage({}, 'Network.requestWillBeSent', { requestId: endpoint,
        request: { url: `https://example.test/kcsapi/${endpoint}`, postData: params(request).toString() }
      }, 'game');
      await onMessage({}, 'Network.loadingFinished', { requestId: endpoint }, 'game');
    }
    await receive('api_get_member/ship3', { api_ship_data: [
      { ...ship(1, [104]), api_slot_ex: -1 }, ship(2), { ...ship(3, [103]), api_slot_ex: -1 }
    ], api_deck_data: [deck(1, [1, 2, 3])] });
    await receive('api_get_member/slot_item', [...slotItems,
      { api_id: 103, api_slotitem_id: 20 }, { api_id: 104, api_slotitem_id: 20 }]);
    await receive('api_get_member/record', { api_ship: [3, 100], api_slotitem: [4, 200] });
    const request = { api_id: '1', api_id_items: '2,3', api_slot_dest_flag: flag };
    notifications.length = 0;
    await receive('api_req_kaisou/powerup', {}, request, 0);
    assert.equal(notifications.length, 0);
    await receive('api_req_kaisou/powerup', {
      api_powerup_flag: 0, api_ship: { ...ship(1, [104]), api_slot_ex: -1, api_karyoku: [45, 50] },
      api_deck: [deck(1, [1])]
    }, request);
    const materials = notifications.find(n => n.channel === 'kancolle:material-data').data;
    assert.equal(materials.shipCount, 1);
    assert.equal(materials.slotItemCount, expectedItems);
    assert.equal(materials.maxShips, 100);
    assert.equal(materials.maxSlotItems, 203);
    const fleets = notifications.find(n => n.channel === 'kancolle:fleet-data').data;
    assert.equal(fleets[0].ships.length, 1);
    assert.equal(fleets[0].ships[0].karyoku, 45);
  }
});


test('通常海域の段階別ボス表示はmapinfoの更新と月次リセットに追従し、内部IDを保持する', () => {
  const store = load(storeCode);
  const { formatSortieBoss } = load(bundle('src/utils/formatters.ts'));
  const expected = { 2: ['G', 'M'], 3: ['E', 'P'], 5: ['K', 'Q', 'T'] };
  for (const [map, bosses] of Object.entries(expected)) {
    store.updateSortie({ api_maparea_id: 7, api_mapinfo_no: Number(map), api_no: 1, api_bosscell_no: 1 }, params({ api_deck_id: '1' }), true);
    assert.equal(store.getFormattedSortie().bossLabel, null);
    assert.equal(formatSortieBoss(store.getFormattedSortie()), 'Aマス');
    bosses.forEach((boss, i) => {
      store.updateMapInfo({ api_map_info: [{ api_id: 70 + Number(map), api_gauge_num: i + 1, api_cleared: 0 }] });
      const sortie = store.getFormattedSortie();
      assert.equal(sortie.gaugeNo, i + 1);
      assert.equal(sortie.bossLabel, boss);
      assert.equal(sortie.bossCellNo, 1);
      assert.equal(formatSortieBoss(sortie), boss + 'マス');
      store.updateSortie({ api_maparea_id: 7, api_mapinfo_no: Number(map), api_no: 2, api_bosscell_no: 1 }, params({}), false);
      assert.equal(store.getFormattedSortie().bossLabel, boss);
    });
    // 全ゲージクリア後は、段階省略・第1段階・0・最終段階のどれでも最終ボス。
    for (const gauge of [undefined, 1, 0, bosses.length]) {
      store.updateMapInfo({ api_map_info: [{ api_id: 70 + Number(map), api_gauge_num: gauge, api_cleared: 1 }] });
      const sortie = store.getFormattedSortie();
      assert.equal(sortie.gaugeNo, bosses.length);
      assert.equal(sortie.bossLabel, bosses.at(-1));
      assert.equal(formatSortieBoss(sortie), bosses.at(-1) + 'マス');
      assert.equal(sortie.bossCellNo, 1);
    }
    store.clearSortie();
    store.updateMapInfo({ api_map_info: [{ api_id: 70 + Number(map), api_cleared: 0 }] });
    store.updateSortie({ api_maparea_id: 7, api_mapinfo_no: Number(map), api_no: 1, api_bosscell_no: 1 }, params({ api_deck_id: '2' }), true);
    assert.equal(store.getFormattedSortie().bossLabel, bosses[0]);
    store.updateMapInfo({ api_map_info: [{ api_id: 70 + Number(map), api_gauge_num: 99 }] });
    assert.equal(store.getFormattedSortie().bossLabel, null);
    assert.equal(formatSortieBoss(store.getFormattedSortie()), 'Aマス');
  }
  store.updateMapInfo(null);
  store.updateMapInfo({ api_map_info: [null, { api_id: 75, api_gauge_num: -1 }] });
  assert.equal(store.getFormattedSortie().gaugeNo, null);
});

test('CDPから取得したゲージ段階を出撃パネルへ通知し、再ログインで前回の段階を消去する', async () => {
  const { setupApiCapture, runtime } = loadCapture();
  const sorties = [];
  let onMessage;
  let currentBody;
  runtime.mainWindow = { isDestroyed: () => false, setTitle() {}, webContents: { send: (channel, data) => {
    if (channel === 'kancolle:sortie-data') sorties.push(plain(data));
  } } };
  setupApiCapture({ webContents: { debugger: {
    isAttached: () => false, attach() {}, on: (_event, cb) => { onMessage = cb; },
    sendCommand: async command => command === 'Network.getResponseBody' ? { body: currentBody } : {}
  } } });
  async function receive(endpoint, data) {
    currentBody = 'svdata=' + JSON.stringify({ api_result: 1, api_data: data });
    await onMessage({}, 'Network.responseReceived', { requestId: endpoint, response: { url: `https://example.test/kcsapi/${endpoint}` } }, 'game');
    await onMessage({}, 'Network.loadingFinished', { requestId: endpoint }, 'game');
  }
  await receive('api_get_member/mapinfo', { api_map_info: [{ api_id: 72, api_gauge_num: 2 }] });
  await receive('api_req_map/start', { api_maparea_id: 7, api_mapinfo_no: 2, api_no: 1, api_bosscell_no: 7 });
  assert.equal(sorties.at(-1).bossLabel, 'M');
  assert.equal(sorties.at(-1).bossCellNo, 7);
  await receive('api_get_member/mapinfo', { api_map_info: [{ api_id: 72, api_gauge_num: 1 }] });
  assert.equal(sorties.at(-1).bossLabel, 'G');
  // クリア後にゲージ番号が省略されても、第1ボスには戻さない。
  await receive('api_get_member/mapinfo', { api_map_info: [{ api_id: 72, api_cleared: 1 }] });
  assert.equal(sorties.at(-1).bossLabel, 'M');
  assert.equal(sorties.at(-1).gaugeNo, 2);
  await receive('api_start2/getData', {});
  await receive('api_req_map/start', { api_maparea_id: 7, api_mapinfo_no: 2, api_no: 1, api_bosscell_no: 7 });
  assert.equal(sorties.at(-1).bossLabel, null);
});
