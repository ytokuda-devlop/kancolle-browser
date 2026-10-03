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
    module, exports: module.exports, require, URL, URLSearchParams, Buffer,
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

function loadCapture() {
  const code = buildSync({
    stdin: {
      contents: "import runtime = require('./electron/runtime'); export { runtime }; export { setupApiCapture } from './electron/kancolle/apiCapture';",
      resolveDir: projectDir, loader: 'ts'
    },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['electron']
  }).outputFiles[0].text;
  return load(code);
}

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
  runtime.mainWindow = { webContents: { send: (channel, data) => notifications.push({ channel, data: plain(data) }) } };
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
  runtime.mainWindow = { webContents: { send: (channel, data) => notifications.push({ channel, data: plain(data) }) } };
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
