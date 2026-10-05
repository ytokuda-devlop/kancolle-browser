/** storeが整形してIPCでReactへ送る表示用データ。艦これAPIの生データとは別に扱う。 */
export interface MaterialData {
  fuel: number;
  ammo: number;
  steel: number;
  bauxite: number;
  burner: number;
  bucket: number;
  devco: number;
  screw: number;
  mamiya: number;
  irako: number;
  shipCount: number;
  maxShips: number;
  slotItemCount: number;
  maxSlotItems: number;
}

export interface EquipmentData {
  id: number;
  name: string;
  level: number;
  alv: number;
  /** 搭載数の配列やマスタに該当スロットがない場合はundefined。 */
  currentAircraft: number | undefined;
  maxAircraft: number | undefined;
  itemType: number;
  isAircraft: boolean;
  tyku: number;
  isExpansion: boolean;
}

export interface ShipData {
  id: number;
  name: string;
  lv: number;
  nowhp: number;
  maxhp: number;
  cond: number;
  karyoku: number;
  raisou: number;
  taiku: number;
  soukou: number;
  kaihi: number;
  taisen: number;
  sakuteki: number;
  lucky: number;
  soku: number;
  leng: number;
  slots: EquipmentData[];
}

export interface MissionData {
  status: number;
  missionId: number;
  /** 完了時刻（Unix時刻・ミリ秒）。 */
  completeTime: number;
  name: string;
}

export interface FleetData {
  id: number;
  name: string;
  ships: ShipData[];
  mission: MissionData;
}

export interface NdockData {
  id: number;
  state: number;
  shipId: number;
  shipName: string;
  /** 完了時刻（Unix時刻・ミリ秒）。 */
  completeTime: number;
}

export interface KdockData {
  id: number;
  state: number;
  createdShipId: number;
  /** 完了時刻（Unix時刻・ミリ秒）。 */
  completeTime: number;
}

export interface QuestData {
  id: number;
  name: string;
  progress: 0 | 50 | 80 | 100;
}

export interface EventMapData {
  nowHp: number;
  maxHp: number;
}

/** 出撃していない場合、IPCで送る値はSortieDataではなくnull。 */
export interface SortieData {
  deckId: number | null;
  mapAreaId: number;
  mapInfoNo: number;
  areaName: string;
  mapName: string;
  cellNo: number;
  bossCellNo: number;
  isEvent: boolean;
  eventMap: EventMapData | null;
}
