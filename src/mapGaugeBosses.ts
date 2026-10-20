// キー: 海域、内側のキー: api_gauge_num、値: 攻略対象ボスの表示名。
// 内部IDは経路によって複数存在するため、mapNodeLabelsの逆引きはしない。
export const MAP_GAUGE_BOSSES: Partial<Record<string, Partial<Record<number, string>>>> = {
  '5-6': { 1: 'G', 2: 'N', 3: 'Z' },
  '7-2': { 1: 'G', 2: 'M' },
  '7-3': { 1: 'E', 2: 'P' },
  '7-5': { 1: 'K', 2: 'Q', 3: 'T' }
};

export function getMapGaugeBoss(mapAreaId: number, mapInfoNo: number, gaugeNo: number | null): string | null {
  if (gaugeNo === null) return null;
  return MAP_GAUGE_BOSSES[`${mapAreaId}-${mapInfoNo}`]?.[gaugeNo] || null;
}
