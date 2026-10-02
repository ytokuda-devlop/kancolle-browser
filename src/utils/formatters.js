/*
 * UIに表示する時間や出撃地点の文字列を整形するユーティリティ。
 * 現在時刻や出撃データを受け取り、Reactに依存しない表示用文字列へ変換する。
 */
import { getMapNodeLabel } from '../mapNodeLabels';

export function formatRemainingTime(completeTimeMs, now) {
  if (!completeTimeMs || completeTimeMs <= 0) return '---';

  const diff = completeTimeMs - now;
  if (diff <= 0) return '完了';

  return formatDuration(diff);
}

export function formatSortieNode(sortie, nodeId) {
  const label = getMapNodeLabel(
    sortie?.mapAreaId,
    sortie?.mapInfoNo,
    nodeId
  );

  return label ? `${label}マス` : `マスID：${nodeId}`;
}

function formatDuration(durationMs) {
  const totalSecs = Math.floor(durationMs / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  return [hrs, mins, secs]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}
