import type { EquipmentData } from '../../shared/kancolle';

/*
 * 艦娘や装備の状態を、画面表示に使用する文言・CSSクラス名へ変換するユーティリティ。
 * HP、疲労度、速力、射程、艦載機残数の表示判定をまとめて管理する。
 */
export function getHpFillClass(now: number, max: number) {
  const ratio = now / max;
  if (ratio > 0.75) return 'hp-green';
  if (ratio > 0.5) return 'hp-yellow';
  if (ratio > 0.25) return 'hp-orange';
  return 'hp-red';
}

export function getCondClass(cond: number) {
  if (cond >= 49) return 'cond-spark';
  if (cond >= 40) return 'cond-normal';
  if (cond >= 20) return 'cond-orange';
  return 'cond-red';
}

export function getSokuText(soku: number) {
  if (soku === 10 || soku === 1) return '高速';
  if (soku === 15) return '最速';
  if (soku === 20) return '超高速';
  if (soku === 5 || soku === 0) return '低速';
  return '不明';
}

export function getLengText(leng: number) {
  if (leng === 1) return '短';
  if (leng === 2) return '中';
  if (leng === 3) return '長';
  if (leng === 4) return '超長';
  return '無';
}

export function getAircraftCountClass(slot: EquipmentData) {
  const current = Number(slot.currentAircraft) || 0;
  const maximum = Number(slot.maxAircraft) || 0;

  if (maximum <= 0 || current >= maximum) return 'aircraft-full';
  if (current <= 0) return 'aircraft-empty';
  if (current / maximum >= 0.5) return 'aircraft-medium';
  return 'aircraft-low';
}
