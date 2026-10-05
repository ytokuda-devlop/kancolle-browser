import type { QuestData } from '../../../shared/kancolle';

interface Props {
  quests: QuestData[];
}

/*
 * 進行中の任務一覧を表示するコンポーネント。
 * 各任務の名称と進捗率を、Electron側から受け取った任務データの順に描画する。
 */
function QuestPanel({ quests }: Props) {
  return (
    <div className="bottom-panel-col quest-col">
      <div className="panel-col-header">進行中任務</div>
      <div className="panel-col-content">
        {quests.map(quest => (
          <div key={quest.id} className="quest-row" title={quest.name}>
            <span className="quest-name">{quest.name}</span>
            <span className="quest-progress-rate">{quest.progress}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default QuestPanel;
