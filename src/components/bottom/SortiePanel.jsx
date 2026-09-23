/*
 * 現在の出撃海域と進行状況を表示するコンポーネント。
 * 出撃艦隊、海域名、現在マス、ボスマス、イベント海域のゲージを出撃データから描画する。
 */
import { formatSortieNode } from '../../utils/formatters';

function SortiePanel({ sortie }) {
  return (
    <div className="bottom-panel-col sortie-col">
      <div className="panel-col-header">出撃海域</div>
      <div className="panel-col-content sortie-content">
        {sortie ? (
          <>
            <div className="sortie-heading">
              <span className="sortie-fleet">第{sortie.deckId || '?'}艦隊</span>
              {sortie.isEvent && <span className="sortie-event-badge">イベント</span>}
            </div>
            <div className="sortie-map" title={`${sortie.areaName} ${sortie.mapName}`}>
              <span className="sortie-map-code">
                {sortie.isEvent
                  ? `E-${sortie.mapInfoNo}`
                  : `${sortie.mapAreaId}-${sortie.mapInfoNo}`}
              </span>
              <span className="sortie-map-name">
                {sortie.mapName || sortie.areaName || '海域名取得中'}
              </span>
            </div>
            <div className="sortie-position">
              現在：{formatSortieNode(sortie, sortie.cellNo)}
              {sortie.bossCellNo > 0 && ` / ボス：${formatSortieNode(sortie, sortie.bossCellNo)}`}
            </div>
            {sortie.eventMap?.maxHp > 0 && (
              <div className="sortie-gauge">
                ゲージ：{sortie.eventMap.nowHp.toLocaleString()} / {sortie.eventMap.maxHp.toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="sortie-empty">出撃していません</div>
        )}
      </div>
    </div>
  );
}

export default SortiePanel;
