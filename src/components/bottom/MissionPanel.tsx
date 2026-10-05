import type { FleetData } from '../../../shared/kancolle';

interface Props {
  fleets: FleetData[];
  now: number;
}

/*
 * 第2～第4艦隊の遠征状況を表示するコンポーネント。
 * 遠征名と完了までの残り時間、または母港待機中であることを艦隊ごとに示す。
 */
import { formatRemainingTime } from '../../utils/formatters';

const FLEET_NUMERALS = ['', '１', '２', '３', '４'];

function MissionPanel({ fleets, now }: Props) {
  return (
    <div className="bottom-panel-col mission-col">
      <div className="panel-col-header">遠征</div>
      <div className="panel-col-content">
        {fleets.filter(fleet => fleet.id > 1).map(fleet => {
          const mission = fleet.mission || { status: 0, name: '' };
          const hasMission = mission.status > 0;
          const remaining = hasMission
            ? formatRemainingTime(mission.completeTime, now)
            : '---';
          const isFinished = remaining === '完了';

          return (
            <div key={fleet.id} className="panel-row">
              <span className="row-label mission-fleet-label">
                {`第${FLEET_NUMERALS[fleet.id]}艦隊`}：
              </span>
              <span
                className="row-time"
                style={{
                  color: isFinished
                    ? 'var(--success-color)'
                    : hasMission
                      ? 'var(--accent-color)'
                      : 'var(--bottom-text-secondary)'
                }}
              >
                {remaining}
              </span>
              <span
                className={`row-desc ${hasMission ? 'is-active' : ''}`}
                title={hasMission ? mission.name : '母港にいます'}
                style={{
                  color: hasMission
                    ? 'var(--text-primary)'
                    : 'var(--bottom-text-secondary)'
                }}
              >
                {hasMission
                  ? mission.name || `遠征 ID:${mission.missionId}`
                  : '母港にいます'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MissionPanel;
