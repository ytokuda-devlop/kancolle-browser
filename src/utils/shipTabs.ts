export const shipTabs = ['ALL', '戦艦', '空母', '重巡', '軽巡', '駆逐', '海防', '潜水', '補助'] as const;
export type ShipTab = typeof shipTabs[number];

// api_stype: 航空戦艦・航空巡洋艦・雷巡・練習巡洋艦も各系統に含める。
const shipTypes: Record<Exclude<ShipTab, 'ALL' | '補助'>, readonly number[]> = {
  戦艦: [8, 9, 10], 空母: [7, 11, 18], 重巡: [5, 6],
  軽巡: [3, 4, 21], 駆逐: [2], 海防: [1], 潜水: [13, 14]
};
export function matchesShipTab(shipType: number, tab: ShipTab): boolean {
  if (tab === 'ALL') return true;
  if (tab === '補助') return !Object.values(shipTypes).some(types => types.includes(shipType));
  return shipTypes[tab].includes(shipType);
}
