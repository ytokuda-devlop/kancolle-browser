import type { SortieData } from '../../shared/kancolle';

/*
 * UIに表示する時間や出撃地点の文字列を整形するユーティリティ。
 * 現在時刻や出撃データを受け取り、Reactに依存しない表示用文字列へ変換する。
 */
import { getMapNodeLabel } from '../mapNodeLabels';

export function formatRemainingTime(completeTimeMs: number, now: number): string {
  if (!completeTimeMs || completeTimeMs <= 0) return '---';

  const diff = completeTimeMs - now;
  if (diff <= 0) return '完了';

  return formatDuration(diff);
}

export function formatSortieNode(sortie: SortieData | null, nodeId: number): string {
  const label = getMapNodeLabel(
    sortie?.mapAreaId,
    sortie?.mapInfoNo,
    nodeId
  );

  return label ? `${label}マス` : `マスID：${nodeId}`;
}

export function formatSortieBoss(sortie: SortieData): string | null {
  if (sortie.bossLabel) return `${sortie.bossLabel}マス`;
  return sortie.bossCellNo > 0 ? formatSortieNode(sortie, sortie.bossCellNo) : null;
}

function formatDuration(durationMs: number): string {
  const totalSecs = Math.floor(durationMs / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  return [hrs, mins, secs]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}
