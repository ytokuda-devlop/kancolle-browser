/*
 * Chrome DevTools Protocolで艦これのKCSAPI通信を捕捉し、データストアを更新するモジュール。
 * iframeを含む通信監視、追加APIの再取得、更新後データのReact UIへの通知を担当する。
 */
const runtime = require('../runtime');
const kancolleStore = require('./store');

// キャプチャ中の一時的なリクエスト情報マッピング
// (sessionId:requestId -> { url, sessionId, postData })
const pendingRequests = new Map();

// CDP の requestId はターゲットセッションごとに管理されるため、
// メイン画面と iframe のリクエストが衝突しない複合キーを使用する。
function createRequestKey(sessionId, requestId) {
  return `${sessionId || 'main'}:${requestId}`;
}

// CDP を用いた API 通信のキャプチャ設定
function setupApiCapture(view) {
  if (!view) return;
  const contents = view.webContents;

  if (contents.debugger.isAttached()) {
    contents.debugger.detach();
  }

  try {
    contents.debugger.attach('1.1');
  } catch (err) {
    console.error('Failed to attach debugger:', err);
    return;
  }

  // 子ターゲット（iframeなど）がアタッチされた際の処理、およびメッセージ処理
  contents.debugger.on('message', async (event, method, params, sessionId) => {
    // iframeなどのサブターゲットが自動アタッチされた場合
    if (method === 'Target.attachedToTarget') {
      const subSessionId = params.sessionId;
      const targetUrl = params.targetInfo ? params.targetInfo.url : "";
      console.log(`[CDP] サブフレームにデバッガーをアタッチしました: ${subSessionId} (URL: ${targetUrl})`);

      // 子ターゲットは待機状態でアタッチされる。起動直後の通信を取りこぼさないよう、
      // Network ドメインを有効化してからターゲットの実行を再開する。
      try {
        await contents.debugger.sendCommand('Network.enable', {}, subSessionId);
        console.log(`[CDP] サブフレームの Network ドメインを有効化しました: ${subSessionId}`);
      } catch (err) {
        console.error(`Failed to enable Network for target ${subSessionId}:`, err);
      } finally {
        try {
          await contents.debugger.sendCommand('Runtime.runIfWaitingForDebugger', {}, subSessionId);
        } catch (err) {
          console.error(`Failed to resume target ${subSessionId}:`, err);
        }
      }
    }

    // レスポンスだけでは変更内容が返らないAPIがあるため、POST内容も保持する。
    if (method === 'Network.requestWillBeSent') {
      const url = params.request.url;
      if (url.includes('/kcsapi/')) {
        const requestKey = createRequestKey(sessionId, params.requestId);
        pendingRequests.set(requestKey, {
          url,
          sessionId,
          postData: params.request.postData || ''
        });
      }
    }

    // レスポンスヘッダー受信時
    if (method === 'Network.responseReceived') {
      const url = params.response.url;
      if (url.includes('/kcsapi/')) {
        const requestId = params.requestId;
        const requestKey = createRequestKey(sessionId, requestId);
        // loadingFinished イベントでのボディ取得用にマッピングを保存
        const request = pendingRequests.get(requestKey) || {};
        pendingRequests.set(requestKey, { ...request, url, sessionId });
      }
    }

    // 通信データのダウンロード完了時 (レスポンスボディが確実に取得できるタイミング)
    if (method === 'Network.loadingFinished') {
      const requestId = params.requestId;
      const requestKey = createRequestKey(sessionId, requestId);
      const req = pendingRequests.get(requestKey);
      if (req) {
        const { url, sessionId: reqSessionId, postData } = req;
        console.log(`[CDP] KCSAPI 通信のロードが完了しました: ${url} (Session: ${reqSessionId || 'main'})`);
        try {
          // ロード完了後にレスポンスボディを取得するため、データ未検出エラーは発生しない
          const result = await contents.debugger.sendCommand('Network.getResponseBody', { requestId }, reqSessionId);
          await handleKcsApiResponse(url, result.body, postData);
        } catch (err) {
          console.warn(`[CDP] レスポンスボディの取得に失敗しました ${url}:`, err.message);
        } finally {
          pendingRequests.delete(requestKey);
        }
      }
    }

    // 通信エラーやキャンセル時
    if (method === 'Network.loadingFailed') {
      const requestId = params.requestId;
      const requestKey = createRequestKey(sessionId, requestId);
      pendingRequests.delete(requestKey);
    }
  });

  // 自動アタッチを有効化 (別ドメイン of iframe 内の通信もキャプチャするため)
  contents.debugger.sendCommand('Target.setAutoAttach', {
    autoAttach: true,
    // Chromium 152ではOOPIFを待機させるとDMMのゲームフレームが黒画面の
    // まま停止することがある。通信の取りこぼしよりゲーム継続を優先する。
    waitForDebuggerOnStart: false,
    flatten: true // メインセッションにメッセージをフラット化して集約する
  }).then(() => {
    console.log('[CDP] Target.setAutoAttach を有効化しました');
  }).catch(err => {
    console.error('Failed to setAutoAttach:', err);
  });

  // メインフレームのネットワークキャプチャを有効化
  contents.debugger.sendCommand('Network.enable').then(() => {
    console.log('[CDP] メインフレームの Network ドメインを有効化しました');
  }).catch(err => {
    console.error('Failed to enable Network domain:', err);
  });
}

async function refreshKdocks(url, requestParams) {
  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) return false;

  const apiToken = requestParams.get('api_token');
  if (!apiToken) {
    console.warn('[KCSAPI] 建造ドック再取得に必要なAPIトークンがありません');
    return false;
  }

  try {
    const refreshUrl = new URL('/kcsapi/api_get_member/kdock', url);
    const body = new URLSearchParams({
      api_token: apiToken,
      api_verno: requestParams.get('api_verno') || '1'
    });
    const response = await runtime.gameView.webContents.session.fetch(refreshUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      credentials: 'include'
    });
    const responseBody = await response.text();
    if (!responseBody.startsWith('svdata=')) {
      throw new Error(`kdock returned HTTP ${response.status}`);
    }

    const parsed = JSON.parse(responseBody.substring(7));
    if (parsed.api_result !== 1 || !Array.isArray(parsed.api_data)) {
      throw new Error(parsed.api_result_msg || 'kdock request failed');
    }

    kancolleStore.updateKdock(parsed.api_data);
    return true;
  } catch (err) {
    console.warn('[KCSAPI] 建造ドックの再取得に失敗しました:', err.message);
    return false;
  }
}

async function refreshRecord(url, requestParams) {
  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) return false;

  const apiToken = requestParams.get('api_token');
  if (!apiToken) {
    console.warn('[KCSAPI] 艦隊司令部情報の再取得に必要なAPIトークンがありません');
    return false;
  }

  try {
    const refreshUrl = new URL('/kcsapi/api_get_member/record', url);
    const body = new URLSearchParams({
      api_token: apiToken,
      api_verno: requestParams.get('api_verno') || '1'
    });
    const response = await runtime.gameView.webContents.session.fetch(refreshUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      credentials: 'include'
    });
    const responseBody = await response.text();
    if (!responseBody.startsWith('svdata=')) {
      throw new Error(`record returned HTTP ${response.status}`);
    }

    const parsed = JSON.parse(responseBody.substring(7));
    if (parsed.api_result !== 1 || !parsed.api_data) {
      throw new Error(parsed.api_result_msg || 'record request failed');
    }

    kancolleStore.updateRecord(parsed.api_data);
    return true;
  } catch (err) {
    console.warn('[KCSAPI] 艦隊司令部情報の再取得に失敗しました:', err.message);
    return false;
  }
}

async function refreshMaterials(url, requestParams) {
  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) return false;

  const apiToken = requestParams.get('api_token');
  if (!apiToken) {
    console.warn('[KCSAPI] 資材再取得に必要なAPIトークンがありません');
    return false;
  }

  try {
    const refreshUrl = new URL('/kcsapi/api_get_member/material', url);
    const body = new URLSearchParams({
      api_token: apiToken,
      api_verno: requestParams.get('api_verno') || '1'
    });
    const response = await runtime.gameView.webContents.session.fetch(refreshUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      credentials: 'include'
    });
    const responseBody = await response.text();
    if (!responseBody.startsWith('svdata=')) {
      throw new Error(`material returned HTTP ${response.status}`);
    }

    const parsed = JSON.parse(responseBody.substring(7));
    if (parsed.api_result !== 1 || !Array.isArray(parsed.api_data)) {
      throw new Error(parsed.api_result_msg || 'material request failed');
    }

    kancolleStore.updateMaterials(parsed.api_data);
    return true;
  } catch (err) {
    console.warn('[KCSAPI] 資材の再取得に失敗しました:', err.message);
    return false;
  }
}

async function refreshUseItems(url, requestParams) {
  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) return false;

  const apiToken = requestParams.get('api_token');
  if (!apiToken) {
    console.warn('[KCSAPI] 保有アイテム再取得に必要なAPIトークンがありません');
    return false;
  }

  try {
    const refreshUrl = new URL('/kcsapi/api_get_member/useitem', url);
    const body = new URLSearchParams({
      api_token: apiToken,
      api_verno: requestParams.get('api_verno') || '1'
    });
    const response = await runtime.gameView.webContents.session.fetch(refreshUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      credentials: 'include'
    });
    const responseBody = await response.text();
    if (!responseBody.startsWith('svdata=')) {
      throw new Error(`useitem returned HTTP ${response.status}`);
    }

    const parsed = JSON.parse(responseBody.substring(7));
    if (parsed.api_result !== 1 || !parsed.api_data) {
      throw new Error(parsed.api_result_msg || 'useitem request failed');
    }

    kancolleStore.updateUseItems(parsed.api_data);
    return true;
  } catch (err) {
    console.warn('[KCSAPI] 保有アイテムの再取得に失敗しました:', err.message);
    return false;
  }
}

let questDataLoaded = false;
let questRefreshPromise = null;

async function refreshQuestList(url, requestParams) {
  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) return false;

  const apiToken = requestParams.get('api_token');
  if (!apiToken) {
    console.warn('[KCSAPI] 任務一覧の取得に必要なAPIトークンがありません');
    return false;
  }

  // 母港APIが短時間に複数回処理されても、任務一覧の取得を重複させない。
  if (questRefreshPromise) return questRefreshPromise;

  questRefreshPromise = (async () => {
    try {
      const questUrl = new URL('/kcsapi/api_get_member/questlist', url);
      const questPages = [];
      let pageCount = 1;

      for (let page = 1; page <= pageCount; page += 1) {
        const body = new URLSearchParams({
          api_token: apiToken,
          api_verno: requestParams.get('api_verno') || '1',
          api_page_no: String(page),
          api_tab_id: '0'
        });
        const response = await runtime.gameView.webContents.session.fetch(questUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString(),
          credentials: 'include'
        });
        const responseBody = await response.text();
        if (!responseBody.startsWith('svdata=')) {
          throw new Error(`questlist returned HTTP ${response.status}`);
        }

        const parsed = JSON.parse(responseBody.substring(7));
        if (parsed.api_result !== 1 || !parsed.api_data) {
          throw new Error(parsed.api_result_msg || 'questlist request failed');
        }

        questPages.push({ page, apiData: parsed.api_data });
        if (page === 1) {
          pageCount = Math.max(1, Number(parsed.api_data.api_page_count) || 1);
        }
      }

      // 全ページの取得に成功してからまとめて反映し、途中までの状態を表示しない。
      kancolleStore.resetQuests();
      questPages.forEach(({ page, apiData }) => {
        kancolleStore.updateQuestList(apiData, page);
      });
      questDataLoaded = true;
      return true;
    } catch (err) {
      console.warn('[KCSAPI] ログイン後の任務一覧取得に失敗しました:', err.message);
      return false;
    } finally {
      questRefreshPromise = null;
    }
  })();

  return questRefreshPromise;
}

async function handleKcsApiResponse(url, body, postData = '') {
  if (!body || !body.startsWith('svdata=')) return;

  try {
    const jsonStr = body.substring(7); // "svdata="を除去
    const response = JSON.parse(jsonStr);

    if (response.api_result !== 1) return;

    const apiData = response.api_data;
    const pathname = new URL(url).pathname;
    const requestParams = new URLSearchParams(postData);
    let updated = false;
    let updatedNdock = false;
    let updatedKdock = false;
    let updatedQuest = false;
    let updatedSortie = false;
    let updatedMaterial = false;

    if (pathname.includes('/api_start2/getData')) {
      kancolleStore.updateMaster(apiData);
      // 新しいログインとして任務取得状態を初期化する。
      questDataLoaded = false;
      kancolleStore.resetQuests();
      kancolleStore.recordCapacity = null;
      updated = true;
      updatedQuest = true;
    } else if (pathname.includes('/api_port/port')) {
      kancolleStore.clearSortie();
      updatedSortie = true;
      kancolleStore.updatePort(apiData);
      kancolleStore.updateSlotItems(apiData);
      // 保有数・最大枠も資材パネルへ反映する。
      updatedMaterial = true;
      if (apiData.api_material) {
        kancolleStore.updateMaterials(apiData.api_material);
        updatedMaterial = true;
      }
      // 母港到着時に給糧艦などの保有アイテム数も取得する。
      updatedMaterial = await refreshUseItems(url, requestParams) || updatedMaterial;
      // 司令部情報画面を開かなくても、ゲーム集計済みの保有数を取得する。
      updatedMaterial = await refreshRecord(url, requestParams) || updatedMaterial;
      updated = true;
      updatedNdock = true;
      // port レスポンスに建造ドックが含まれない場合でも、母港到着時に
      // 明示的に再取得して4ドックの状態を表示できるようにする。
      updatedKdock = Array.isArray(apiData.api_kdock)
        ? true
        : await refreshKdocks(url, requestParams);
      // ログイン後の最初の母港到着時に全ページを取得する。
      // 失敗時は未取得のままなので、次回の母港到着時に再試行される。
      if (!questDataLoaded) {
        updatedQuest = await refreshQuestList(url, requestParams);
      }
    } else if (pathname.includes('/api_get_member/ship_deck')) {
      // 戦闘終了後の最新艦娘データ（耐久・Cond）とデッキ情報を反映する。
      // /ship_deck は /deck とレスポンス形式が異なるため先に判定する。
      kancolleStore.updateShip3(apiData);
      updated = true;
    } else if (pathname.includes('/api_req_map/start')) {
      kancolleStore.updateSortie(apiData, requestParams, true);
      updatedSortie = true;
    } else if (pathname.includes('/api_req_map/next')) {
      kancolleStore.updateSortie(apiData, requestParams, false);
      updatedSortie = true;
    } else if (
      pathname.includes('/api_req_sortie/goback_port') ||
      pathname.includes('/api_req_combined_battle/goback_port')
    ) {
      kancolleStore.clearSortie();
      updatedSortie = true;
    } else if (pathname.includes('/api_get_member/deck')) {
      kancolleStore.updateDeck(apiData);
      updated = true;
    } else if (pathname.includes('/api_get_member/ship3')) {
      kancolleStore.updateShip3(apiData);
      updated = true;
    } else if (pathname.includes('/api_get_member/ship2')) {
      // 疲労回復アイテム使用後などにゲーム本体が取得する最新艦娘情報を反映する。
      kancolleStore.updateShip3(apiData);
      updated = true;
    } else if (
      pathname.includes('/api_get_member/require_info') ||
      pathname.includes('/api_get_member/slot_item')
    ) {
      kancolleStore.updateSlotItems(apiData);
      updated = true;
      updatedMaterial = true;
    } else if (pathname.includes('/api_get_member/basic')) {
      kancolleStore.updateBasic(apiData);
      updatedMaterial = true;
    } else if (pathname.includes('/api_get_member/record')) {
      // 艦隊司令部情報画面と同じ、ゲーム側で集計済みの保有数・最大数を優先する。
      kancolleStore.updateRecord(apiData);
      updatedMaterial = true;
    } else if (pathname.includes('/api_get_member/ndock')) {
      kancolleStore.updateNdock(apiData);
      updatedNdock = true;
    } else if (pathname.includes('/api_get_member/kdock')) {
      kancolleStore.updateKdock(apiData);
      updatedKdock = true;
    } else if (pathname.includes('/api_get_member/material')) {
      kancolleStore.updateMaterials(apiData);
      updatedMaterial = true;
    } else if (pathname.includes('/api_get_member/useitem')) {
      kancolleStore.updateUseItems(apiData);
      updatedMaterial = true;
    } else if (pathname.includes('/api_get_member/questlist')) {
      kancolleStore.updateQuestList(apiData, requestParams.get('api_page_no'));
      updatedQuest = true;
    } else if (pathname.includes('/api_req_quest/')) {
      kancolleStore.updateQuestFromAction(pathname, requestParams);
      updatedQuest = true;
    } else if (pathname.includes('/api_req_kousyou/destroyitem')) {
      // レスポンスには廃棄後の装備一覧がないため、送信した保有装備IDを差分削除する。
      // destroyitem と destroyitem2 の両方を同じ前方一致で扱う。
      kancolleStore.removeDestroyedSlotItems(requestParams);
      updatedMaterial = true;
      updatedMaterial = await refreshMaterials(url, requestParams) || updatedMaterial;
    } else if (pathname.includes('/api_req_kousyou/destroyship')) {
      // 艦娘解体・装備廃棄で獲得した4資源を、処理完了直後の確定値で反映する。
      kancolleStore.removeDestroyedShips(requestParams);
      updated = true;
      updatedMaterial = true;
      updatedMaterial = await refreshMaterials(url, requestParams) || updatedMaterial;
    } else if (
      pathname.includes('/api_req_kousyou/createship') ||
      pathname.includes('/api_req_kousyou/createship_speedchange') ||
      pathname.includes('/api_req_kousyou/getship')
    ) {
      if (pathname.includes('/api_req_kousyou/getship')) {
        // 建造艦と同時に得た初期装備は差分追加し、既存装備一覧を消さない。
        if (apiData && apiData.api_ship) {
          kancolleStore.updateShip3([apiData.api_ship]);
        }
        kancolleStore.updateSlotItems(apiData, false);
        updated = true;
        updatedMaterial = true;
      }
      // 建造開始・高速建造・受取後は、サーバー上の正確なドック状態を再取得する。
      updatedKdock = await refreshKdocks(url, requestParams);
    } else if (pathname.includes('/api_req_hokyu/')) {
      // 艦載機補充・艦隊全補給・まとめて補給の搭載数を即時反映する。
      updated = kancolleStore.updateSupply(apiData);
      if (apiData && Array.isArray(apiData.api_material)) {
        kancolleStore.updateMaterials(apiData.api_material);
        updatedMaterial = true;
      }
      // 補給レスポンスの形式に依存せず、消費後の燃料・弾薬・ボーキを確定値で反映する。
      updatedMaterial = await refreshMaterials(url, requestParams) || updatedMaterial;
    } else if (pathname.includes('/api_req_air_corps/supply')) {
      // 基地航空隊の補充後は、消費された4資源をサーバー上の確定値で反映する。
      updatedMaterial = await refreshMaterials(url, requestParams);
    } else if (pathname.includes('/api_req_hensei/change')) {
      kancolleStore.updateDeckFromChange(requestParams);
      updated = true;
    } else if (pathname.includes('/api_req_hensei/preset_select')) {
      // プリセット展開時は変更後のデッキがレスポンスに含まれる。
      kancolleStore.updateDeck(Array.isArray(apiData) ? apiData : [apiData]);
      updated = true;
    } else if (pathname.includes('/api_req_member/itemuse_cond')) {
      // 間宮・伊良湖使用後は、続く ship2 では個数を取得できないため明示的に再取得する。
      updatedMaterial = await refreshUseItems(url, requestParams);
    } else if (
      pathname.includes('/api_req_kaisou/slotset') ||
      pathname.includes('/api_req_kaisou/slot_deprive') ||
      pathname.includes('/api_req_kaisou/unsetslot_all') ||
      pathname.includes('/api_req_kaisou/slot_exchange_index')
    ) {
      kancolleStore.updateShipSlots(pathname, requestParams, apiData);
      updated = true;
    } else if (pathname.includes('/api_req_nyukyo/speedchange')) {
      kancolleStore.completeRepair(requestParams);
      updated = true;
      updatedNdock = true;
      // 高速修復後のバケツ数を母港へ戻る前に反映する。
      updatedMaterial = await refreshMaterials(url, requestParams);
    } else if (pathname.includes('/api_req_nyukyo/start')) {
      if (Number(requestParams.get('api_highspeed')) === 1) {
        // 入渠開始と同時に高速修復材を使用した場合
        kancolleStore.completeRepair(requestParams);
        updated = true;
        updatedNdock = true;
      }
      // 通常入渠の燃料・鋼材、高速修復時のバケツを確定値で反映する。
      updatedMaterial = await refreshMaterials(url, requestParams);
    }

    if (updated) {
      sendFleetDataToUi();
    }
    if (updatedNdock) {
      sendNdockDataToUi();
    }
    if (updatedKdock) {
      sendKdockDataToUi();
    }
    if (updatedQuest) {
      sendQuestDataToUi();
    }
    if (updatedSortie) {
      sendSortieDataToUi();
    }
    if (updatedMaterial) {
      sendMaterialDataToUi();
    }
  } catch (err) {
    console.error('Error parsing API response:', err);
  }
}

// UI (React) への資材データ送信
function sendMaterialDataToUi() {
  if (runtime.mainWindow) {
    const materialData = kancolleStore.getFormattedMaterials();
    runtime.mainWindow.webContents.send('kancolle:material-data', materialData);
  }
}

// UI (React) への艦隊データ送信
function sendFleetDataToUi() {
  if (runtime.mainWindow) {
    const fleetData = kancolleStore.getFormattedFleets();
    runtime.mainWindow.webContents.send('kancolle:fleet-data', fleetData);
  }
}

// UI (React) への入渠ドックデータ送信
function sendNdockDataToUi() {
  if (runtime.mainWindow) {
    const ndockData = kancolleStore.getFormattedNdocks();
    runtime.mainWindow.webContents.send('kancolle:ndock-data', ndockData);
  }
}

// UI (React) への建造ドックデータ送信
function sendKdockDataToUi() {
  if (runtime.mainWindow) {
    const kdockData = kancolleStore.getFormattedKdocks();
    runtime.mainWindow.webContents.send('kancolle:kdock-data', kdockData);
  }
}

// UI (React) への進行中任務データ送信
function sendQuestDataToUi() {
  if (runtime.mainWindow) {
    const questData = kancolleStore.getFormattedQuests();
    runtime.mainWindow.webContents.send('kancolle:quest-data', questData);
  }
}

function sendSortieDataToUi() {
  if (runtime.mainWindow) {
    runtime.mainWindow.webContents.send('kancolle:sortie-data', kancolleStore.getFormattedSortie());
  }
}

module.exports = { setupApiCapture };
