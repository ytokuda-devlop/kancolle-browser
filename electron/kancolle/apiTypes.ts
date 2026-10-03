/** このアプリが利用する艦これAPIのフィールド。表示用のshared型とは分離する。 */
export interface ApiShip {
  api_id: number;
  api_ship_id: number;
  api_lv: number;
  api_nowhp: number;
  api_maxhp: number;
  api_cond: number;
  api_slot: number[];
  api_slot_ex?: number;
  api_onslot?: number[];
  api_karyoku?: number[];
  api_raisou?: number[];
  api_taiku?: number[];
  api_soukou?: number[];
  api_kaihi?: number[];
  api_taisen?: number[];
  api_sakuteki?: number[];
  api_lucky?: number[];
  api_soku: number;
  api_leng: number;
}

export type ApiMission = [number, number, number, number];
export interface ApiDeck {
  api_id: number;
  api_name: string;
  api_ship: number[];
  api_mission?: ApiMission;
}
export interface ApiSlotItem {
  api_id: number;
  api_slotitem_id: number;
  api_level?: number;
  api_alv?: number;
}
export interface ApiMaterial { api_id: number; api_value: number }
export type ApiMaterials = ApiMaterial[] | number[];
export interface ApiUseItem { api_id: number; api_count: number }
export interface ApiBasic { api_max_chara: number; api_max_slotitem: number }
export interface ApiRecord { api_ship: number[]; api_slotitem: number[] }
export interface ApiNdock {
  api_id: number;
  api_state: number;
  api_ship_id: number;
  api_complete_time: number;
}
export interface ApiKdock {
  api_id: number;
  api_state: number;
  api_created_ship_id?: number;
  api_complete_time?: number;
}
export interface ApiQuest {
  api_no: number;
  api_title?: string;
  api_state: number;
  api_progress_flag?: number;
}
export interface ApiQuestList {
  api_list?: (ApiQuest | number | null)[];
  api_disp_page?: number;
  api_page_count?: number;
}
export interface ApiMaster {
  api_mst_ship?: { api_id: number; api_name: string; api_stype: number; api_maxeq?: number[] }[];
  api_mst_slotitem?: { api_id: number; api_name: string; api_type?: number[]; api_tyku?: number }[];
  api_mst_mission?: { api_id: number; api_name: string }[];
  api_mst_maparea?: { api_id: number; api_name: string; api_type: number }[];
  api_mst_mapinfo?: { api_maparea_id: number; api_no: number; api_name: string }[];
}
export interface ApiSlotItems { api_slot_item?: ApiSlotItem[] }
export interface ApiPort extends ApiSlotItems {
  api_basic?: ApiBasic;
  api_ship?: ApiShip[];
  api_deck_port?: ApiDeck[];
  api_ndock?: ApiNdock[];
  api_kdock?: ApiKdock[];
  api_material?: ApiMaterials;
}
export interface ApiShipData {
  api_ship_data?: ApiShip[];
  api_shipdata?: ApiShip[];
  api_deck_data?: ApiDeck[];
}
export interface ApiSupply {
  api_ship?: { api_id: number; api_onslot?: number[] } | { api_id: number; api_onslot?: number[] }[];
  api_material?: ApiMaterials;
}
export interface ApiSortie {
  api_maparea_id: number;
  api_mapinfo_no: number;
  api_no?: number;
  api_bosscell_no?: number;
  api_eventmap?: { api_now_maphp?: number; api_max_maphp?: number } | null;
}
export interface ApiSlotExchange { api_slot?: number[] }
export interface ApiGetShip extends ApiSlotItems { api_ship?: ApiShip }
export interface ApiRemodelSlot { api_after_material?: ApiMaterials }

/** JSONの境界はunknown。エンドポイント判定後に利用するレスポンス型を選ぶ。 */
export interface ApiResponse<T = unknown> {
  api_result: number;
  api_result_msg?: string;
  api_data: T;
}
