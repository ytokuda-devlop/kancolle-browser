/*
 * 入渠ドックの状態を表示するコンポーネント。
 * 各ドックの開放状態、入渠中の艦娘名、修復完了までの残り時間を示す。
 */
import { formatRemainingTime } from '../../utils/formatters';

const DOCK_NUMERALS = ['', '１', '２', '３', '４'];

function RepairDockPanel({ docks, now }) {
  return (
    <div className="bottom-panel-col ndock-col">
      <div className="panel-col-header">入渠</div>
      <div className="panel-col-content">
        {docks.map(dock => {
          const isRepairing = dock.state === 1;
          const remaining = isRepairing
            ? formatRemainingTime(dock.completeTime, now)
            : '---';
          const isFinished = remaining === '完了';

          let stateText = '空いてます';
          if (dock.state === -1) stateText = '未開放';
          else if (isRepairing) stateText = dock.shipName;

          return (
            <div key={dock.id} className="panel-row">
              <span className="row-label">
                第{DOCK_NUMERALS[dock.id] || dock.id}ドック：
              </span>
              <span
                className="row-time"
                style={{
                  color: isFinished
                    ? 'var(--success-color)'
                    : isRepairing
                      ? 'var(--danger-color)'
                      : 'var(--bottom-text-secondary)'
                }}
              >
                {remaining}
              </span>
              <span
                className={`row-desc ${isRepairing ? 'is-active' : ''}`}
                title={stateText}
                style={{
                  color: isRepairing
                    ? 'var(--text-primary)'
                    : 'var(--bottom-text-secondary)'
                }}
              >
                {stateText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RepairDockPanel;
