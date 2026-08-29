const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
  Menu,
  dialog,
  screen,
  webFrameMain
} = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

let mainWindow;
let gameView;
let activeRecording = null;

function formatFileTimestamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('') +
    '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
}

async function createRecordingPaths() {
  // Windowsでは C:\\Users\\<ユーザー名>\\Videos\\Kancolle になる。
  const recordingDirectory = path.join(app.getPath('videos'), 'Kancolle');
  await fs.promises.mkdir(recordingDirectory, { recursive: true });

  const timestamp = formatFileTimestamp(new Date());
  for (let sequence = 0; sequence < 1000; sequence += 1) {
    const suffix = sequence === 0 ? '' : `-${sequence}`;
    const filename = `kancolle-${timestamp}${suffix}.mp4`;
    const destination = path.join(recordingDirectory, filename);
    try {
      await fs.promises.access(destination);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return {
          destination,
          temporary: path.join(app.getPath('temp'), `${filename}.${process.pid}.webm`)
        };
      }
      throw err;
    }
  }
  throw new Error('録画ファイル名を作成できませんでした。');
}

function convertRecordingToMp4(input, output) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('MP4変換用のFFmpegを読み込めませんでした。'));
      return;
    }

    const ffmpeg = spawn(ffmpegPath, [
      '-y', '-i', input,
      // WebFrameMainのWebMは1msのタイムベースを実フレームレートのように
      // 通知することがある。明示的に30fpsへ間引かないと、FFmpegが同一
      // フレームを最大1000fpsまで複製し、再生が実時間に追いつかなくなる。
      '-vf', 'fps=30', '-fps_mode', 'cfr',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', output
    ], { windowsHide: true });
    let errorOutput = '';
    ffmpeg.stderr.on('data', chunk => {
      errorOutput = (errorOutput + chunk.toString()).slice(-8000);
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`MP4変換に失敗しました (FFmpeg ${code}): ${errorOutput}`));
    });
  });
}

const AIRCRAFT_ITEM_TYPES = new Set([
  6, 7, 8, 9, 10, 11, 25, 26, 41, 45, 47, 48, 49, 53, 56, 57, 58, 59, 94
]);
const SLOT_ITEM_RESERVED_CAPACITY = 3;

// DMM の親ページから不要なナビゲーション類を隠す。
// iframe の位置決めは DMM 側の ID 変更に耐えられるよう、下のスクリプトで
// 実際のゲーム iframe を検出して行う。
const GAME_PAGE_CSS = `
  html,
  body {
    width: 1200px !important;
    height: 720px !important;
    min-width: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
  }

  #dh-gnav,
  #foot,
  #footer,
  .dmm-ntgnavi,
  .area-naviapp,
  #ntg-recommend {
    display: none !important;
  }

  #game_frame,
  iframe[data-kancolle-game-frame="true"] {
    position: fixed !important;
    inset: 0 auto auto 0 !important;
    width: 1200px !important;
    height: 860px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    /* DMMのアイテム購入画面は親ページのオーバーレイに表示されるため、
       iframeを最大z-indexにすると購入画面が背後に隠れてしまう。 */
    z-index: 1 !important;
    pointer-events: auto !important;
  }

  /* ゲーム内の「ポイントで購入」からDMMが生成する決済オーバーレイ。
     DMM側のインラインz-indexより優先し、ゲームiframeの手前に表示する。 */
  #block_background {
    z-index: 2 !important;
  }

  #alert {
    z-index: 3 !important;
    pointer-events: auto !important;
  }
`;

// DMM はゲーム iframe の ID やラッパーを変更することがあるため、既知の ID
// だけでなく URL・サイズも使って対象を特定する。親要素のレイアウトや
// DOM の親子関係は DMM 側の入力制御に必要なので変更しない。
const PIN_GAME_FRAME_SCRIPT = `
  (() => {
    const marker = 'data-kancolle-game-frame';
    const pinFrame = () => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const gameFrame = frames.find(frame => {
        const src = frame.getAttribute('src') || '';
        const idAndName = \`${'${frame.id} ${frame.name}'}\`.toLowerCase();
        const rect = frame.getBoundingClientRect();

        return frame.id === 'game_frame' ||
          /kancolle|osapi|gadgets/.test(src.toLowerCase()) ||
          /game.?frame|kancolle/.test(idAndName) ||
          (rect.width >= 1000 && rect.height >= 600);
      });

      if (!gameFrame) return false;

      gameFrame.setAttribute(marker, 'true');
      return true;
    };

    // DMM 側がログイン確認後などに iframe を生成・交換しても固定を維持する。
    if (!window.__kancolleFrameObserver) {
      window.__kancolleFrameObserver = new MutationObserver(pinFrame);
      window.__kancolleFrameObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    return pinFrame();
  })()
`;

// ゲーム開始画面左上の公式 X フォローボタンだけを隠す。ゲーム本体は
// cross-origin iframe 内にあるため、読み込まれた各フレーム内で適用する。
const HIDE_GAME_SOCIAL_LINK_SCRIPT = `
  (() => {
    const hideSocialLink = () => {
      const selectors = [
        'iframe[src*="twitter.com"]',
        'iframe[src*="x.com"]',
        'a[href*="twitter.com"]',
        'a[href*="x.com"]'
      ];

      document.querySelectorAll(selectors.join(',')).forEach(element => {
        const rect = element.getBoundingClientRect();
        if (rect.top < 80 && rect.left < 320) {
          element.style.setProperty('display', 'none', 'important');
        }
      });
    };

    hideSocialLink();
    if (!window.__kancolleSocialLinkObserver) {
      window.__kancolleSocialLinkObserver = new MutationObserver(hideSocialLink);
      window.__kancolleSocialLinkObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  })()
`;

function isKancolleGameUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    const isCurrentGamePage =
      (url.hostname === 'games.dmm.com' ||
        url.hostname.endsWith('.games.dmm.com')) &&
      url.pathname.toLowerCase().includes('kancolle');

    const isLegacyGamePage =
      url.hostname === 'www.dmm.com' &&
      url.pathname.includes('/netgame/social/-/gadgets/=');

    return isCurrentGamePage || isLegacyGamePage;
  } catch {
    return false;
  }
}

function setupGamePageCss(view) {
  if (!view) return;

  const applyGamePageLayout = async () => {
    const currentUrl = view.webContents.getURL();

    // ログイン画面など、艦これのゲームページ以外には適用しない。
    // DMM の現行URLと、リダイレクト移行期間中の旧URLの両方に対応する。
    if (!isKancolleGameUrl(currentUrl)) return;

    try {
      await view.webContents.insertCSS(GAME_PAGE_CSS, {
        cssOrigin: 'user'
      });
      const pinned = await view.webContents.executeJavaScript(
        PIN_GAME_FRAME_SCRIPT,
        true
      );
      console.log(
        pinned
          ? '[Game Layout] ゲーム iframe を左上へ固定しました'
          : '[Game Layout] ゲーム iframe の読み込みを待っています'
      );
    } catch (err) {
      // DMM 側の変更などで失敗しても、ゲームページ自体の表示は継続する。
      console.warn('[Game CSS] CSS の適用に失敗しました:', err.message);
    }
  };

  view.webContents.on('did-finish-load', applyGamePageLayout);

  view.webContents.on(
    'did-frame-finish-load',
    async (event, isMainFrame, frameProcessId, frameRoutingId) => {
      if (isMainFrame) return;

      const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
      if (!frame) return;

      try {
        await frame.executeJavaScript(HIDE_GAME_SOCIAL_LINK_SCRIPT);
      } catch (err) {
        // ナビゲーション直後にフレームが破棄された場合は次の load で再適用する。
        console.warn('[Game Layout] X リンクの非表示を再試行します:', err.message);
      }
    }
  );

  // 親ページの load 完了後に iframe が遅延生成される場合にも追従する。
  view.webContents.on('dom-ready', () => {
    [250, 1000, 3000].forEach(delay => {
      setTimeout(applyGamePageLayout, delay);
    });
  });
}

function setupContextMenu(contents, inspectLabel) {
  if (!contents) return;

  contents.on('context-menu', (event, params) => {
    const template = [
      {
        label: '戻る',
        enabled: contents.canGoBack(),
        click: () => contents.goBack()
      },
      {
        label: '進む',
        enabled: contents.canGoForward(),
        click: () => contents.goForward()
      },
      {
        label: '再読み込み',
        click: () => contents.reload()
      },
      { type: 'separator' },
      {
        label: '切り取り',
        role: 'cut',
        visible: params.isEditable,
        enabled: params.editFlags.canCut
      },
      {
        label: 'コピー',
        role: 'copy',
        enabled: params.editFlags.canCopy
      },
      {
        label: '貼り付け',
        role: 'paste',
        visible: params.isEditable,
        enabled: params.editFlags.canPaste
      },
      {
        label: 'すべて選択',
        role: 'selectAll'
      },
      { type: 'separator' },
      {
        label: inspectLabel,
        click: () => contents.inspectElement(params.x, params.y)
      }
    ];

    Menu.buildFromTemplate(template).popup({
      window: mainWindow || undefined
    });
  });
}

// 艦これのデータを管理するデータストア
const kancolleStore = {
  shipsMaster: {},     // api_id -> { name, type, maxeq }
  slotitemsMaster: {}, // api_id -> { name, type }
  missionsMaster: {},  // api_id -> name
  mapAreasMaster: {},  // api_id -> { name, type }
  mapsMaster: {},      // "areaId-mapNo" -> { name }
  ships: {},           // api_id -> ship dynamic info
  decks: [],           // [fleet1, fleet2, fleet3, fleet4]
  slotItems: {},       // api_id -> { slotitemId, level, alv }
  ndocks: [],          // repair docks
  kdocks: [],          // construction docks
  quests: {},          // quest id -> quest
  questPages: {},      // page number -> quest ids
  sortie: null,        // current sortie information
  materials: {},       // api_id -> value
  useItems: {},        // api_id -> count
  maxShips: 0,         // maximum ship capacity
  maxSlotItems: 0,     // maximum equipment capacity
  recordCapacity: null, // record API's game-calculated ownership/capacity counts

  updateMaterials(apiMaterial) {
    if (!Array.isArray(apiMaterial)) return;
    if (apiMaterial.length === 0) return;

    if (typeof apiMaterial[0] === 'object' && apiMaterial[0] !== null) {
      apiMaterial.forEach(m => {
        if (m && m.api_id) {
          this.materials[m.api_id] = m.api_value;
        }
      });
    } else {
      if (apiMaterial.length >= 4) {
        this.materials[1] = apiMaterial[0];
        this.materials[2] = apiMaterial[1];
        this.materials[3] = apiMaterial[2];
        this.materials[4] = apiMaterial[3];
      }
      if (apiMaterial.length >= 8) {
        this.materials[5] = apiMaterial[4];
        this.materials[6] = apiMaterial[5];
        this.materials[7] = apiMaterial[6];
        this.materials[8] = apiMaterial[7];
      }
    }
  },

  updateUseItems(apiUseItems) {
    const items = Array.isArray(apiUseItems) ? apiUseItems : [apiUseItems];
    // 保有数0のアイテムがレスポンスから省略されても古い値を残さない。
    this.useItems[54] = 0;
    this.useItems[59] = 0;
    items.forEach(item => {
      if (item && Number.isFinite(Number(item.api_id))) {
        this.useItems[Number(item.api_id)] = Number(item.api_count) || 0;
      }
    });
  },

  getFormattedMaterials() {
    const recordCapacity = this.recordCapacity;
    return {
      fuel: this.materials[1] || 0,
      ammo: this.materials[2] || 0,
      steel: this.materials[3] || 0,
      bauxite: this.materials[4] || 0,
      burner: this.materials[5] || 0,
      bucket: this.materials[6] || 0,
      devco: this.materials[7] || 0,
      screw: this.materials[8] || 0,
      mamiya: this.useItems[54] || 0,
      irako: this.useItems[59] || 0,
      shipCount: recordCapacity ? recordCapacity.shipCount : Object.keys(this.ships).length,
      maxShips: recordCapacity ? recordCapacity.maxShips : this.maxShips,
      slotItemCount: recordCapacity ? recordCapacity.slotItemCount : Object.keys(this.slotItems).length,
      maxSlotItems: recordCapacity ? recordCapacity.maxSlotItems : this.maxSlotItems
    };
  },

  updateRecord(apiData) {
    if (!apiData || !Array.isArray(apiData.api_ship) || !Array.isArray(apiData.api_slotitem)) return;
    if (apiData.api_ship.length < 2 || apiData.api_slotitem.length < 2) return;

    this.recordCapacity = {
      shipCount: Number(apiData.api_ship[0]) || 0,
      maxShips: Number(apiData.api_ship[1]) || 0,
      slotItemCount: Number(apiData.api_slotitem[0]) || 0,
      maxSlotItems: Number(apiData.api_slotitem[1]) > 0
        ? Number(apiData.api_slotitem[1]) + SLOT_ITEM_RESERVED_CAPACITY
        : 0
    };
  },

  updateBasic(apiBasic) {
    if (!apiBasic) return;
    this.maxShips = Number(apiBasic.api_max_chara) || 0;
    const maxSlotItems = Number(apiBasic.api_max_slotitem) || 0;
    this.maxSlotItems = maxSlotItems > 0
      ? maxSlotItems + SLOT_ITEM_RESERVED_CAPACITY
      : 0;
  },

  updateMaster(apiData) {
    if (apiData.api_mst_ship) {
      apiData.api_mst_ship.forEach(s => {
        this.shipsMaster[s.api_id] = {
          name: s.api_name,
          type: s.api_stype,
          maxeq: s.api_maxeq || []
        };
      });
    }
    if (apiData.api_mst_slotitem) {
      apiData.api_mst_slotitem.forEach(item => {
        this.slotitemsMaster[item.api_id] = {
          name: item.api_name,
          type: item.api_type ? item.api_type[2] : 0,
          tyku: item.api_tyku || 0
        };
      });
    }
    if (apiData.api_mst_mission) {
      apiData.api_mst_mission.forEach(m => {
        this.missionsMaster[m.api_id] = m.api_name;
      });
    }
    if (apiData.api_mst_maparea) {
      apiData.api_mst_maparea.forEach(area => {
        this.mapAreasMaster[area.api_id] = {
          name: area.api_name,
          type: area.api_type
        };
      });
    }
    if (apiData.api_mst_mapinfo) {
      apiData.api_mst_mapinfo.forEach(map => {
        this.mapsMaster[`${map.api_maparea_id}-${map.api_no}`] = {
          name: map.api_name
        };
      });
    }
  },

  updateSortie(apiData, requestParams, isStart) {
    if (!apiData) return;

    const mapAreaId = Number(apiData.api_maparea_id);
    const mapInfoNo = Number(apiData.api_mapinfo_no);
    if (!Number.isFinite(mapAreaId) || !Number.isFinite(mapInfoNo)) return;

    const previous = this.sortie || {};
    const deckId = isStart
      ? Number(requestParams.get('api_deck_id'))
      : previous.deckId;
    const area = this.mapAreasMaster[mapAreaId];
    const map = this.mapsMaster[`${mapAreaId}-${mapInfoNo}`];

    this.sortie = {
      deckId: Number.isFinite(deckId) ? deckId : null,
      mapAreaId,
      mapInfoNo,
      areaName: area?.name || '',
      mapName: map?.name || '',
      cellNo: Number(apiData.api_no) || 0,
      bossCellNo: Number(apiData.api_bosscell_no) || 0,
      isEvent: Boolean(apiData.api_eventmap),
      eventMap: apiData.api_eventmap
        ? {
            nowHp: Number(apiData.api_eventmap.api_now_maphp) || 0,
            maxHp: Number(apiData.api_eventmap.api_max_maphp) || 0
          }
        : null
    };
  },

  clearSortie() {
    this.sortie = null;
  },

  getFormattedSortie() {
    return this.sortie ? { ...this.sortie } : null;
  },

  updatePort(apiData) {
    this.updateBasic(apiData.api_basic);
    if (apiData.api_ship) {
      this.ships = {};
      apiData.api_ship.forEach(s => {
        this.ships[s.api_id] = {
          id: s.api_id,
          shipId: s.api_ship_id,
          lv: s.api_lv,
          nowhp: s.api_nowhp,
          maxhp: s.api_maxhp,
          cond: s.api_cond,
          slots: s.api_slot,
          slotEx: s.api_slot_ex || -1,
          onslot: s.api_onslot || [],
          karyoku: s.api_karyoku ? s.api_karyoku[0] : 0,
          raisou: s.api_raisou ? s.api_raisou[0] : 0,
          taiku: s.api_taiku ? s.api_taiku[0] : 0,
          soukou: s.api_soukou ? s.api_soukou[0] : 0,
          kaihi: s.api_kaihi ? s.api_kaihi[0] : 0,
          taisen: s.api_taisen ? s.api_taisen[0] : 0,
          sakuteki: s.api_sakuteki ? s.api_sakuteki[0] : 0,
          lucky: s.api_lucky ? s.api_lucky[0] : 0,
          soku: s.api_soku,
          leng: s.api_leng
        };
      });
    }
    if (apiData.api_deck_port) {
      this.decks = apiData.api_deck_port.map(deck => {
        return {
          id: deck.api_id,
          name: deck.api_name,
          shipIds: deck.api_ship.filter(id => id > 0),
          mission: deck.api_mission
        };
      });
    }
    if (apiData.api_ndock) {
      this.updateNdock(apiData.api_ndock);
    }
    if (apiData.api_kdock) {
      this.updateKdock(apiData.api_kdock);
    }
  },

  updateDeck(apiData) {
    if (!Array.isArray(apiData)) return;

    apiData.forEach(deck => {
      if (!deck || !Array.isArray(deck.api_ship)) return;
      const idx = deck.api_id - 1;
      this.decks[idx] = {
        id: deck.api_id,
        name: deck.api_name,
        shipIds: deck.api_ship.filter(id => id > 0),
        mission: deck.api_mission
      };
    });
  },

  updateDeckFromChange(params) {
    const deckId = Number(params.get('api_id'));
    const shipIndex = Number(params.get('api_ship_idx'));
    const shipId = Number(params.get('api_ship_id'));
    const deck = this.decks[deckId - 1];
    if (!deck || !Number.isInteger(shipIndex)) return;

    if (shipId === -2) {
      // 旗艦以外を一括解除
      deck.shipIds = deck.shipIds.slice(0, 1);
      return;
    }

    if (shipId < 0) {
      deck.shipIds.splice(shipIndex, 1);
      return;
    }

    // 同一艦隊内の並び替えは、移動元を削除してから移動先を上書きすると
    // 移動先にいた艦が配列から消えてしまうため、2つの位置を直接交換する。
    const sameDeckIndex = deck.shipIds.indexOf(shipId);
    if (sameDeckIndex >= 0) {
      if (sameDeckIndex === shipIndex) return;

      if (shipIndex >= 0 && shipIndex < deck.shipIds.length) {
        [deck.shipIds[sameDeckIndex], deck.shipIds[shipIndex]] =
          [deck.shipIds[shipIndex], deck.shipIds[sameDeckIndex]];
        return;
      }

      // 末尾への移動にも対応する。
      deck.shipIds.splice(sameDeckIndex, 1);
      deck.shipIds.push(shipId);
      return;
    }

    // 別艦隊からの入れ替えでは、配属先の艦を移動元の位置へ戻す。
    const replacedShipId = deck.shipIds[shipIndex];
    let previousPosition = null;
    this.decks.forEach(otherDeck => {
      if (otherDeck === deck) return;
      const index = otherDeck.shipIds.indexOf(shipId);
      if (index >= 0) {
        previousPosition = { deck: otherDeck, index };
        otherDeck.shipIds.splice(index, 1);
      }
    });

    if (shipIndex < deck.shipIds.length) {
      deck.shipIds[shipIndex] = shipId;
    } else {
      deck.shipIds.push(shipId);
    }

    if (previousPosition && replacedShipId > 0) {
      previousPosition.deck.shipIds.splice(previousPosition.index, 0, replacedShipId);
    }
  },

  updateShipSlots(pathname, params, apiData) {
    const removeItemFromAllShips = itemId => {
      if (itemId <= 0) return;
      Object.values(this.ships).forEach(ship => {
        if (Array.isArray(ship.slots)) {
          ship.slots = ship.slots.map(id => id === itemId ? -1 : id);
        }
        if (ship.slotEx === itemId) {
          ship.slotEx = -1;
        }
      });
    };

    if (pathname.includes('/api_req_kaisou/slotset_ex')) {
      const ship = this.ships[Number(params.get('api_id'))];
      const itemId = Number(params.get('api_item_id'));
      if (!ship) return;

      removeItemFromAllShips(itemId);
      ship.slotEx = itemId > 0 ? itemId : -1;
      return;
    }

    if (pathname.includes('/api_req_kaisou/unsetslot_all')) {
      const ship = this.ships[Number(params.get('api_id'))];
      if (ship && Array.isArray(ship.slots)) {
        ship.slots = ship.slots.map(() => -1);
      }
      return;
    }

    if (pathname.includes('/api_req_kaisou/slot_deprive')) {
      const unsetShip = this.ships[Number(params.get('api_unset_ship'))];
      const setShip = this.ships[Number(params.get('api_set_ship'))];
      const unsetIndex = Number(params.get('api_unset_idx'));
      const setIndex = Number(params.get('api_set_idx'));
      if (!unsetShip || !setShip || !Array.isArray(unsetShip.slots) || !Array.isArray(setShip.slots)) return;

      const movedItem = unsetShip.slots[unsetIndex] || -1;
      const replacedItem = setShip.slots[setIndex] || -1;
      unsetShip.slots[unsetIndex] = replacedItem;
      setShip.slots[setIndex] = movedItem;
      return;
    }

    if (pathname.includes('/api_req_kaisou/slot_exchange_index')) {
      const ship = this.ships[Number(params.get('api_id'))];
      if (!ship) return;

      // このAPIは変更後のスロット配列を返すため、レスポンスを正とする。
      if (apiData && Array.isArray(apiData.api_slot)) {
        ship.slots = apiData.api_slot;
        return;
      }

      const sourceIndex = Number(params.get('api_slot_idx'));
      const destinationIndex = Number(params.get('api_slot_idx_dest'));
      if (!Array.isArray(ship.slots) || !Number.isInteger(sourceIndex) || !Number.isInteger(destinationIndex)) return;
      [ship.slots[sourceIndex], ship.slots[destinationIndex]] =
        [ship.slots[destinationIndex], ship.slots[sourceIndex]];
      return;
    }

    if (pathname.includes('/api_req_kaisou/slotset')) {
      const ship = this.ships[Number(params.get('api_id'))];
      const slotIndex = Number(params.get('api_slot_idx'));
      const itemId = Number(params.get('api_item_id'));
      if (!ship || !Array.isArray(ship.slots) || !Number.isInteger(slotIndex)) return;

      removeItemFromAllShips(itemId);
      ship.slots[slotIndex] = itemId;
    }
  },

  updateSupply(apiData) {
    if (!apiData || !apiData.api_ship) return false;

    // 単艦補給と一括補給の両方を同じ形式で処理する。
    const suppliedShips = Array.isArray(apiData.api_ship)
      ? apiData.api_ship
      : [apiData.api_ship];
    let updated = false;

    suppliedShips.forEach(suppliedShip => {
      if (!suppliedShip) return;

      const ship = this.ships[Number(suppliedShip.api_id)];
      if (!ship || !Array.isArray(suppliedShip.api_onslot)) return;

      // 艦載機補充後の各スロット搭載数をレスポンスの値で置き換える。
      ship.onslot = [...suppliedShip.api_onslot];
      updated = true;
    });

    return updated;
  },

  completeRepair(params) {
    const dockId = Number(params.get('api_ndock_id'));
    const dock = this.ndocks.find(d => d.id === dockId);
    // 入渠開始と同時に使用する場合はリクエストに艦娘IDが含まれる。
    // 入渠中に使用する場合はドック情報から対象艦を特定する。
    const requestedShipId = Number(params.get('api_ship_id'));
    const shipId = requestedShipId > 0 ? requestedShipId : (dock ? dock.shipId : 0);
    if (shipId <= 0) return;

    const ship = this.ships[shipId];
    if (ship) {
      ship.nowhp = ship.maxhp;
      // 入渠完了時、40未満のCondは40まで回復する。
      ship.cond = Math.max(ship.cond, 40);
    }

    if (dock) {
      dock.state = 0;
      dock.shipId = 0;
      dock.completeTime = 0;
    }
  },

  updateShip3(apiData) {
    if (!apiData) return;

    // ship2 は艦娘配列そのもの、ship3 と ship_deck はオブジェクト内に
    // 艦娘配列を持つため、いずれのレスポンス形式も扱う。
    const shipData = Array.isArray(apiData)
      ? apiData
      : apiData.api_ship_data || apiData.api_shipdata;
    if (Array.isArray(shipData)) {
      shipData.forEach(s => {
        this.ships[s.api_id] = {
          id: s.api_id,
          shipId: s.api_ship_id,
          lv: s.api_lv,
          nowhp: s.api_nowhp,
          maxhp: s.api_maxhp,
          cond: s.api_cond,
          slots: s.api_slot,
          slotEx: s.api_slot_ex || -1,
          onslot: s.api_onslot || [],
          karyoku: s.api_karyoku ? s.api_karyoku[0] : 0,
          raisou: s.api_raisou ? s.api_raisou[0] : 0,
          taiku: s.api_taiku ? s.api_taiku[0] : 0,
          soukou: s.api_soukou ? s.api_soukou[0] : 0,
          kaihi: s.api_kaihi ? s.api_kaihi[0] : 0,
          taisen: s.api_taisen ? s.api_taisen[0] : 0,
          sakuteki: s.api_sakuteki ? s.api_sakuteki[0] : 0,
          lucky: s.api_lucky ? s.api_lucky[0] : 0,
          soku: s.api_soku,
          leng: s.api_leng
        };
      });
    }

    if (Array.isArray(apiData.api_deck_data)) {
      apiData.api_deck_data.forEach(deck => {
        const idx = deck.api_id - 1;
        this.decks[idx] = {
          id: deck.api_id,
          name: deck.api_name,
          shipIds: deck.api_ship.filter(id => id > 0),
          mission: deck.api_mission
        };
      });
    }
  },

  updateSlotItems(apiData, replace = true) {
    const slotItemData = Array.isArray(apiData) ? apiData : apiData && apiData.api_slot_item;
    if (Array.isArray(slotItemData)) {
      // port/require_info/slot_item は全件スナップショットなので、廃棄済みの
      // 装備を残さないよう、既存一覧を破棄してサーバーの状態で置き換える。
      if (replace) this.slotItems = {};
      slotItemData.forEach(item => {
        this.slotItems[item.api_id] = {
          slotitemId: item.api_slotitem_id,
          level: item.api_level || 0,
          alv: item.api_alv || 0
        };
      });
    }
  },

  removeDestroyedSlotItems(params) {
    const rawIds = params.get('api_slotitem_ids') || params.get('api_slotitem_id') || '';
    rawIds.split(',').forEach(rawId => {
      const id = Number(rawId);
      if (Number.isFinite(id) && id > 0) delete this.slotItems[id];
    });
  },

  removeDestroyedShips(params) {
    const rawIds = params.get('api_ship_id') || '';
    const destroyedIds = rawIds.split(',')
      .map(Number)
      .filter(id => Number.isFinite(id) && id > 0);
    const destroyEquippedItems = Number(params.get('api_slot_dest_flag')) === 1;
    destroyedIds.forEach(id => {
      const ship = this.ships[id];
      if (destroyEquippedItems && ship) {
        [...(ship.slots || []), ship.slotEx].forEach(slotItemId => {
          if (Number.isFinite(slotItemId) && slotItemId > 0) delete this.slotItems[slotItemId];
        });
      }
      delete this.ships[id];
    });
    if (destroyedIds.length > 0) {
      const destroyedIdSet = new Set(destroyedIds);
      this.decks.forEach(deck => {
        deck.shipIds = deck.shipIds.filter(id => !destroyedIdSet.has(id));
      });
    }
  },

  updateNdock(apiData) {
    if (!apiData) return;
    this.ndocks = apiData.map(d => {
      return {
        id: d.api_id,
        state: d.api_state,
        shipId: d.api_ship_id,
        completeTime: d.api_complete_time
      };
    });
  },

  updateKdock(apiData) {
    if (!Array.isArray(apiData)) return;
    this.kdocks = apiData.map(d => ({
      id: d.api_id,
      state: d.api_state,
      createdShipId: d.api_created_ship_id || 0,
      completeTime: d.api_complete_time || 0
    }));
  },

  resetQuests() {
    this.quests = {};
    this.questPages = {};
  },

  updateQuestList(apiData, requestedPage = 1) {
    if (!apiData || !Array.isArray(apiData.api_list)) return;

    const page = Number(apiData.api_disp_page) || Number(requestedPage) || 1;
    const previousIds = this.questPages[page] || [];

    // 同じページを再取得した際、解除・達成済みで消えた任務を除去する。
    previousIds.forEach(id => {
      delete this.quests[id];
    });

    const currentIds = [];
    apiData.api_list.forEach(quest => {
      if (!quest || typeof quest !== 'object') return;

      const id = Number(quest.api_no);
      if (!Number.isFinite(id)) return;
      currentIds.push(id);

      this.quests[id] = {
        id,
        name: quest.api_title || `任務 ${id}`,
        state: quest.api_state,
        progressFlag: quest.api_progress_flag || 0
      };
    });

    this.questPages[page] = currentIds;
  },

  updateQuestFromAction(pathname, params) {
    const questId = Number(params.get('api_quest_id'));
    if (!Number.isFinite(questId)) return;

    if (
      pathname.includes('/api_req_quest/clearitemget') ||
      pathname.includes('/api_req_quest/stop')
    ) {
      delete this.quests[questId];
      return;
    }

    if (pathname.includes('/api_req_quest/start') && this.quests[questId]) {
      this.quests[questId].state = 2;
    }
  },

  getSlotitemName(userSlotId) {
    const userItem = this.slotItems[userSlotId];
    if (!userItem) return "未装備";
    const masterItem = this.slotitemsMaster[userItem.slotitemId];
    return masterItem ? masterItem.name : `装備 ID:${userItem.slotitemId}`;
  },

  getFormattedFleets() {
    return this.decks.map(deck => {
      const ships = deck.shipIds.map(id => {
        const ship = this.ships[id];
        if (!ship) return null;
        const master = this.shipsMaster[ship.shipId] || {};

        const formatSlotItem = (slotId, slotIndex, isExpansion = false) => {
          if (!Number.isFinite(slotId) || slotId <= 0) return null;
          const userItem = this.slotItems[slotId];
          const masterItem = userItem ? this.slotitemsMaster[userItem.slotitemId] : null;
          return {
            id: slotId,
            name: this.getSlotitemName(slotId),
            level: userItem ? userItem.level : 0,
            alv: userItem ? userItem.alv : 0,
            currentAircraft: !isExpansion && ship.onslot ? ship.onslot[slotIndex] : 0,
            maxAircraft: !isExpansion && master.maxeq ? master.maxeq[slotIndex] : 0,
            itemType: masterItem ? masterItem.type : 0,
            isAircraft: masterItem ? AIRCRAFT_ITEM_TYPES.has(masterItem.type) : false,
            tyku: masterItem ? (masterItem.tyku || 0) : 0,
            isExpansion
          };
        };

        const slotItems = (ship.slots || [])
          .map((slotId, slotIndex) => formatSlotItem(slotId, slotIndex))
          .filter(Boolean);

        const expansionItem = formatSlotItem(ship.slotEx, -1, true);
        if (expansionItem) {
          slotItems.push(expansionItem);
        }

        return {
          id: ship.id,
          name: master.name || `艦娘 ID:${ship.shipId}`,
          lv: ship.lv,
          nowhp: ship.nowhp,
          maxhp: ship.maxhp,
          cond: ship.cond,
          karyoku: ship.karyoku,
          raisou: ship.raisou,
          taiku: ship.taiku,
          soukou: ship.soukou,
          kaihi: ship.kaihi,
          taisen: ship.taisen,
          sakuteki: ship.sakuteki,
          lucky: ship.lucky,
          soku: ship.soku,
          leng: ship.leng,
          slots: slotItems
        };
      }).filter(Boolean);

      const missionRaw = deck.mission || [0, 0, 0, 0];
      const missionName = this.missionsMaster[missionRaw[1]] || "";

      return {
        id: deck.id,
        name: deck.name,
        ships,
        mission: {
          status: missionRaw[0],
          missionId: missionRaw[1],
          completeTime: missionRaw[2],
          name: missionName
        }
      };
    });
  },

  getFormattedNdocks() {
    return this.ndocks.map(d => {
      let shipName = "";
      if (d.shipId > 0) {
        const ship = this.ships[d.shipId];
        if (ship) {
          const master = this.shipsMaster[ship.shipId];
          shipName = master ? master.name : `艦娘 ID:${ship.shipId}`;
        } else {
          shipName = `艦娘 ID:${d.shipId}`;
        }
      }
      return {
        id: d.id,
        state: d.state,
        shipId: d.shipId,
        shipName: shipName,
        completeTime: d.completeTime
      };
    });
  },

  getFormattedKdocks() {
    return this.kdocks.map(d => ({
      id: d.id,
      state: d.state,
      createdShipId: d.createdShipId,
      completeTime: d.completeTime
    }));
  },

  getFormattedQuests() {
    return Object.values(this.quests)
      .filter(quest => quest.state >= 2)
      .map(quest => {
        let progress = 0;
        if (quest.state === 3) progress = 100;
        else if (quest.progressFlag === 2) progress = 80;
        else if (quest.progressFlag === 1) progress = 50;

        return {
          id: quest.id,
          name: quest.name,
          progress
        };
      })
      .sort((a, b) => a.id - b.id);
  }
};

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
  if (!gameView || gameView.webContents.isDestroyed()) return false;

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
    const response = await gameView.webContents.session.fetch(refreshUrl.toString(), {
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
  if (!gameView || gameView.webContents.isDestroyed()) return false;

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
    const response = await gameView.webContents.session.fetch(refreshUrl.toString(), {
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
  if (!gameView || gameView.webContents.isDestroyed()) return false;

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
    const response = await gameView.webContents.session.fetch(refreshUrl.toString(), {
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
  if (!gameView || gameView.webContents.isDestroyed()) return false;

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
    const response = await gameView.webContents.session.fetch(refreshUrl.toString(), {
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
  if (!gameView || gameView.webContents.isDestroyed()) return false;

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
        const response = await gameView.webContents.session.fetch(questUrl.toString(), {
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
  if (mainWindow) {
    const materialData = kancolleStore.getFormattedMaterials();
    mainWindow.webContents.send('kancolle:material-data', materialData);
  }
}

// UI (React) への艦隊データ送信
function sendFleetDataToUi() {
  if (mainWindow) {
    const fleetData = kancolleStore.getFormattedFleets();
    mainWindow.webContents.send('kancolle:fleet-data', fleetData);
  }
}

// UI (React) への入渠ドックデータ送信
function sendNdockDataToUi() {
  if (mainWindow) {
    const ndockData = kancolleStore.getFormattedNdocks();
    mainWindow.webContents.send('kancolle:ndock-data', ndockData);
  }
}

// UI (React) への建造ドックデータ送信
function sendKdockDataToUi() {
  if (mainWindow) {
    const kdockData = kancolleStore.getFormattedKdocks();
    mainWindow.webContents.send('kancolle:kdock-data', kdockData);
  }
}

// UI (React) への進行中任務データ送信
function sendQuestDataToUi() {
  if (mainWindow) {
    const questData = kancolleStore.getFormattedQuests();
    mainWindow.webContents.send('kancolle:quest-data', questData);
  }
}

function sendSortieDataToUi() {
  if (mainWindow) {
    mainWindow.webContents.send('kancolle:sortie-data', kancolleStore.getFormattedSortie());
  }
}

// ウィンドウとゲームビューのサイズを調整する関数
function updateGameViewBounds() {
  if (!mainWindow || !gameView) return;

  // ゲーム画面は標準の 1200 * 720 固定サイズに配置
  gameView.setBounds({
    x: 0,
    y: 0,
    width: 1200,
    height: 720
  });
}

function createWindow() {
  // メインウィンドウ（UI側）の生成
  // ゲーム領域 (1200x720) + サイドバー (320) = 1520 (+ 余白20)
  // ゲーム高さ (720) + 艦隊パネル (300) = 1020
  // マウスカーソルがあるディスプレイを使用し、切断済み画面の座標へ出るのを防ぐ。
  const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const {
    x: workAreaX,
    y: workAreaY,
    width: workAreaWidth,
    height: workAreaHeight
  } = activeDisplay.workArea;
  const windowWidth = Math.min(1700, workAreaWidth);
  const windowHeight = Math.min(1050, workAreaHeight);
  const windowX = workAreaX + Math.floor((workAreaWidth - windowWidth) / 2);
  const windowY = workAreaY + Math.floor((workAreaHeight - windowHeight) / 2);

  mainWindow = new BrowserWindow({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
    minWidth: Math.min(1200, workAreaWidth),
    minHeight: Math.min(720, workAreaHeight),
    show: false,
    title: '艦これ専用ブラウザ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  let mainWindowRevealed = false;
  const revealMainWindow = source => {
    if (mainWindowRevealed || !mainWindow || mainWindow.isDestroyed()) return;
    mainWindowRevealed = true;
    updateGameViewBounds();
    mainWindow.setBounds({
      x: windowX,
      y: windowY,
      width: windowWidth,
      height: windowHeight
    });
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    if (process.platform === 'darwin') {
      app.dock?.show();
      app.focus({ steal: true });
    }
    mainWindow.moveTop();
    mainWindow.focus();
  };

  // セッションの永続化設定（ログイン情報やキャッシュを保存）
  const gameSession = session.fromPartition('persist:kancolle');
  let recoveringStaleDmmCache = false;
  gameSession.webRequest.onCompleted(
    { urls: ['https://play.games.dmm.com/assets/*'] },
    details => {
      if (details.statusCode !== 403 || recoveringStaleDmmCache) return;
      recoveringStaleDmmCache = true;
      console.warn('[Game Cache] 古いDMMアセットを検出したため再取得します');
      gameSession.clearCache()
        .then(() => {
          if (gameView && !gameView.webContents.isDestroyed()) {
            return gameView.webContents.loadURL('https://play.games.dmm.com/game/kancolle');
          }
        })
        .catch(err => {
          console.error('[Game Cache] DMMページを再取得できませんでした:', err.message);
        })
        .finally(() => {
          recoveringStaleDmmCache = false;
        });
    }
  );

  // DMM/艦これのロードでエラーにならないよう、標準的なブラウザのUser-Agentを設定
  const customUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
  gameSession.setUserAgent(customUA);

  // ゲーム画面を表示するビューの生成
  gameView = new WebContentsView({
    webPreferences: {
      session: gameSession,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // UIのgetDisplayMedia要求には、ゲームビューだけの映像・音声を渡す。
  // enableLocalEchoにより録画中もゲーム音をスピーカーから再生し続ける。
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    if (!gameView || gameView.webContents.isDestroyed()) {
      callback({});
      return;
    }
    const gameFrame = gameView.webContents.mainFrame;
    callback({ video: gameFrame, audio: gameFrame, enableLocalEcho: true });
  });

  // ゲーム内のアイテム購入が要求するDMM決済画面を、同じログイン
  // セッションを使う安全な別ウィンドウとして開く。
  setupDmmPopupHandler(gameView.webContents, gameSession);

  // DMM ヘッダー等を非表示にし、ゲーム iframe の見切れを解消する
  setupGamePageCss(gameView);

  // メインウィンドウにゲームビューを追加
  mainWindow.contentView.addChildView(gameView);

  // キーボードショートカットの登録
  const handleKeyDown = (event, input, targetContents) => {
    if (input.type !== 'keyDown') return;

    // Windows: F12、macOS: fn + F12（ElectronにはF12として届く）
    if (input.key === 'F12' || input.code === 'F12') {
      if (targetContents.isDevToolsOpened()) {
        targetContents.closeDevTools();
      } else {
        targetContents.openDevTools({ mode: 'detach' });
      }
      event.preventDefault();
      return;
    }

    const isMod = process.platform === 'darwin' ? input.meta : input.control;
    if (isMod && input.key.toLowerCase() === 'r') {
      if (gameView) {
        gameView.webContents.reload();
      }
      event.preventDefault();
    }
  };

  mainWindow.webContents.on('before-input-event', (event, input) => {
    handleKeyDown(event, input, mainWindow.webContents);
  });
  gameView.webContents.on('before-input-event', (event, input) => {
    handleKeyDown(event, input, gameView.webContents);
  });
  gameView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // DMMログイン後のリダイレクトでは進行中のロードが正常に中断される。
    if (errorCode === -3) return;
    console.error('[Game Load Failure]', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });
  gameView.webContents.on('render-process-gone', (event, details) => {
    console.error('[Game Renderer Gone]', details);
  });

  // 読み込みが完了してから明示的に表示し、macOSでも確実に前面化する。
  mainWindow.once('ready-to-show', () => {
    revealMainWindow('ready-to-show');
  });

  // 開発環境と本番環境でロード先を切り替える
  // Vite開発サーバー起動時は環境変数 VITE_DEV_SERVER_URL が指定されることを想定
  const devUrl = 'http://localhost:5173';
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL(devUrl).then(() => revealMainWindow('loadURL'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
      .then(() => revealMainWindow('loadFile'));
  }

  // ready-to-showが発火しない環境でも、非表示のまま残らないようにする。
  setTimeout(() => revealMainWindow('timeout'), 3000);

  setupContextMenu(mainWindow.webContents, 'UIの要素を検証');
  setupContextMenu(gameView.webContents, 'ゲーム画面の要素を検証');

  // 通信キャプチャはページを開く前に有効化し、最初のAPI通信も取得する。
  setupApiCapture(gameView);

  // 艦これの現行ゲーム開始ページをロード
  gameView.webContents.loadURL('https://play.games.dmm.com/game/kancolle');

  // ウィンドウサイズ変更時にビューのサイズを追従させる
  mainWindow.on('resize', updateGameViewBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
    gameView = null;
  });
}

// IPC（プロセス間通信）のハンドラー登録

// ゲーム画面の再読み込み
ipcMain.on('game:reload', () => {
  if (gameView) {
    gameView.webContents.reload();
  }
});

const DMM_POINT_PAGE_URLS = {
  charge: 'https://point.dmm.com/choice/pay?basket_service_type=my'
};

function isAllowedDmmUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      (url.hostname === 'dmm.com' || url.hostname.endsWith('.dmm.com'));
  } catch {
    return false;
  }
}

function isAllowedDmmPopupUrl(rawUrl, referrerUrl = '') {
  if (isAllowedDmmUrl(rawUrl)) return true;

  // DMM のフォーム送信では、空の子ウィンドウを先に作ってから購入先へ
  // 遷移させる場合がある。DMM から作られた空ウィンドウだけを許可する。
  return rawUrl === 'about:blank' && isAllowedDmmUrl(referrerUrl);
}

function setupDmmPopupHandler(contents, gameSession) {
  contents.setWindowOpenHandler(details => {
    const referrerUrl = details.referrer?.url || '';
    if (!isAllowedDmmPopupUrl(details.url, referrerUrl)) {
      console.warn('[DMM Popup] 許可されていないポップアップを拒否しました:', details.url);
      return { action: 'deny' };
    }

    return {
      action: 'allow',
      createWindow: options => {
        const popupWindow = new BrowserWindow({
          ...options,
          width: options.width || 1100,
          height: options.height || 800,
          parent: mainWindow || undefined,
          webPreferences: {
            ...options.webPreferences,
            session: gameSession,
            contextIsolation: true,
            nodeIntegration: false
          }
        });

        setupContextMenu(popupWindow.webContents, 'DMM画面の要素を検証');

        // 購入画面内のリダイレクトもDMMのHTTPSページだけに制限する。
        popupWindow.webContents.on('will-navigate', (event, navigationUrl) => {
          if (!isAllowedDmmUrl(navigationUrl)) {
            console.warn('[DMM Popup] 許可されていない遷移を拒否しました:', navigationUrl);
            event.preventDefault();
          }
        });

        return popupWindow.webContents;
      }
    };
  });
}

// DMM 公式のポイント画面を、ゲームと同じ永続セッションを使う
// 別ウィンドウで開く。DMM ヘッダーの DOM 構造には依存しない。
ipcMain.handle('dmm:open-point-page', async (event, action) => {
  const pointPageUrl = DMM_POINT_PAGE_URLS[action];
  if (!pointPageUrl) {
    return { success: false, error: '不明なポイント操作です。' };
  }

  if (!gameView || gameView.webContents.isDestroyed()) {
    return { success: false, error: 'DMMのゲーム画面を取得できません。' };
  }

  try {
    if (!isAllowedDmmUrl(pointPageUrl)) {
      console.warn('[DMM Point] 許可されていないリンクを拒否しました:', pointPageUrl);
      return { success: false, error: 'ポイントリンクのURLを確認できませんでした。' };
    }

    const pointWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      parent: mainWindow || undefined,
      title: action === 'charge' ? 'DMMポイントをチャージ' : 'DMMポイント確認',
      webPreferences: {
        session: gameView.webContents.session,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    setupContextMenu(pointWindow.webContents, 'ポイント画面の要素を検証');
    await pointWindow.loadURL(pointPageUrl);
    return { success: true };
  } catch (err) {
    console.error('[DMM Point] ポイント画面を開けませんでした:', err);
    return { success: false, error: err.message };
  }
});

// ゲーム画面を Pictures 直下へPNGで保存
ipcMain.handle('game:capture-screenshot', async () => {
  if (!gameView || gameView.webContents.isDestroyed()) {
    return { success: false, error: 'ゲーム画面を取得できません。' };
  }

  try {
    const image = await gameView.webContents.capturePage();
    const png = image.toPNG();
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const timestamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate())
    ].join('') + '-' + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');
    const picturesDirectory = app.getPath('pictures');

    await fs.promises.mkdir(picturesDirectory, { recursive: true });

    // 同じ秒に撮影された場合も既存ファイルを上書きしない。
    for (let sequence = 0; sequence < 1000; sequence += 1) {
      const suffix = sequence === 0 ? '' : `-${sequence}`;
      const filename = `kancolle-${timestamp}${suffix}.png`;
      const destination = path.join(picturesDirectory, filename);

      try {
        await fs.promises.writeFile(destination, png, { flag: 'wx' });
        return { success: true, path: destination };
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }

    return { success: false, error: 'スクリーンショットのファイル名を作成できませんでした。' };
  } catch (err) {
    console.error('[Screenshot] 保存に失敗しました:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:recording-start', async () => {
  if (activeRecording) return { success: false, error: 'すでに録画中です。' };
  try {
    const paths = await createRecordingPaths();
    await fs.promises.writeFile(paths.temporary, Buffer.alloc(0), { flag: 'wx' });
    activeRecording = { ...paths, nextSequence: 0 };
    return { success: true };
  } catch (err) {
    console.error('[Recording] 開始準備に失敗しました:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:recording-chunk', async (event, sequence, bytes) => {
  if (!activeRecording) return { success: false, error: '録画が開始されていません。' };
  if (sequence !== activeRecording.nextSequence) {
    return { success: false, error: '録画データの順序が一致しません。' };
  }
  try {
    await fs.promises.appendFile(activeRecording.temporary, Buffer.from(bytes));
    activeRecording.nextSequence += 1;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:recording-stop', async () => {
  if (!activeRecording) return { success: false, error: '録画が開始されていません。' };
  const recording = activeRecording;
  activeRecording = null;
  try {
    const saveResult = await dialog.showSaveDialog(mainWindow || undefined, {
      title: '録画したゲーム動画を保存',
      defaultPath: recording.destination,
      buttonLabel: '保存',
      filters: [{ name: 'MP4動画', extensions: ['mp4'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });

    if (saveResult.canceled || !saveResult.filePath) {
      await fs.promises.unlink(recording.temporary);
      return { success: false, canceled: true };
    }

    // 拡張子を省略して入力された場合もMP4として保存する。
    const destination = path.extname(saveResult.filePath).toLowerCase() === '.mp4'
      ? saveResult.filePath
      : `${saveResult.filePath}.mp4`;
    await convertRecordingToMp4(recording.temporary, destination);
    await fs.promises.unlink(recording.temporary);
    return { success: true, path: destination };
  } catch (err) {
    console.error('[Recording] MP4保存に失敗しました:', err);
    return {
      success: false,
      error: err.message,
      recoveryPath: recording.temporary
    };
  }
});

ipcMain.handle('game:recording-abort', async () => {
  if (!activeRecording) return { success: true };
  const temporary = activeRecording.temporary;
  activeRecording = null;
  try {
    await fs.promises.unlink(temporary);
  } catch (err) {
    if (err.code !== 'ENOENT') return { success: false, error: err.message };
  }
  return { success: true };
});

// UIからの初期資材データ要求
ipcMain.on('kancolle:get-material-data', (event) => {
  event.reply('kancolle:material-data', kancolleStore.getFormattedMaterials());
});

// UIからの初期艦隊データ要求
ipcMain.on('kancolle:get-fleet-data', (event) => {
  event.reply('kancolle:fleet-data', kancolleStore.getFormattedFleets());
});

// UIからの初期入渠ドックデータ要求
ipcMain.on('kancolle:get-ndock-data', (event) => {
  event.reply('kancolle:ndock-data', kancolleStore.getFormattedNdocks());
});

// UIからの初期建造ドックデータ要求
ipcMain.on('kancolle:get-kdock-data', (event) => {
  event.reply('kancolle:kdock-data', kancolleStore.getFormattedKdocks());
});

// UIからの初期進行中任務データ要求
ipcMain.on('kancolle:get-quest-data', (event) => {
  event.reply('kancolle:quest-data', kancolleStore.getFormattedQuests());
});

// UIからの初期出撃海域データ要求
ipcMain.on('kancolle:get-sortie-data', (event) => {
  event.reply('kancolle:sortie-data', kancolleStore.getFormattedSortie());
});

// UI（メインウィンドウ）の開発者ツール切り替え
ipcMain.on('ui:toggle-devtools', () => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }
});

// ゲーム画面の開発者ツール切り替え
ipcMain.on('game:toggle-devtools', () => {
  if (gameView) {
    if (gameView.webContents.isDevToolsOpened()) {
      gameView.webContents.closeDevTools();
    } else {
      gameView.webContents.openDevTools({ mode: 'detach' });
    }
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
