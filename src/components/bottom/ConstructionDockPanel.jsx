/*
 * 建造ドックの状態を表示するコンポーネント。
 * 各ドックの未開放・空き・建造中・受取待ちの判定と、建造完了までの残り時間を示す。
 */
import { formatRemainingTime } from '../../utils/formatters';

const DOCK_NUMERALS = ['', '１', '２', '３', '４'];

function ConstructionDockPanel({ docks, now }) {
  return (
    <div className="bottom-panel-col kdock-col">
      <div className="panel-col-header">建造</div>
      <div className="panel-col-content">
        {docks.map(dock => {
          const isLocked = dock.state === -1;
          const isEmpty = dock.state === 0;
          const isComplete =
            dock.state === 3 ||
            (dock.state > 0 && dock.completeTime > 0 && dock.completeTime <= now);
          const isBuilding = dock.state > 0 && !isComplete;
          const remaining = isComplete
            ? '完了'
            : isBuilding
              ? formatRemainingTime(dock.completeTime, now)
              : '---';

          let stateText = '空いてます';
          if (isLocked) stateText = '未開放';
          else if (isComplete) stateText = '受取待ち';
          else if (isBuilding) stateText = '建造中';

          return (
            <div key={dock.id} className="panel-row">
              <span className="row-label">
                第{DOCK_NUMERALS[dock.id] || dock.id}ドック：
              </span>
              <span
                className="row-time"
                style={{
                  color: isComplete
                    ? 'var(--success-color)'
                    : isBuilding
                      ? 'var(--accent-color)'
                      : 'var(--bottom-text-secondary)'
                }}
              >
                {remaining}
              </span>
              <span
                className={`row-desc ${isBuilding ? 'is-active' : ''}`}
                title={stateText}
                style={{
                  color: isEmpty || isLocked
                    ? 'var(--bottom-text-secondary)'
                    : 'var(--text-primary)'
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

export default ConstructionDockPanel;
