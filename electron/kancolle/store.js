/*
 * 艦これAPIから受信したマスタ・艦隊・装備・資材・ドック・任務・出撃情報を保持するデータストア。
 * API形式のデータ更新と、React UIへ渡す表示用データへの整形を担当する。
 */
const AIRCRAFT_ITEM_TYPES = new Set([
  6, 7, 8, 9, 10, 11, 25, 26, 41, 45, 47, 48, 49, 53, 56, 57, 58, 59, 94
]);
const SLOT_ITEM_RESERVED_CAPACITY = 3;

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

module.exports = kancolleStore;
