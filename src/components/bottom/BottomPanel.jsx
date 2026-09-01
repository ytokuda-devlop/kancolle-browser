/*
 * 画面下部の情報パネル全体を組み立てるコンポーネント。
 * 艦隊・資材・ドック・任務・出撃データを各機能パネルに振り分け、3カラムに配置する。
 */
import ConstructionDockPanel from './ConstructionDockPanel';
import MaterialPanel from './MaterialPanel';
import MissionPanel from './MissionPanel';
import QuestPanel from './QuestPanel';
import RepairDockPanel from './RepairDockPanel';
import SortiePanel from './SortiePanel';

function BottomPanel({ fleets, materials, ndocks, kdocks, quests, sortie, now }) {
  return (
    <div className="bottom-panel">
      <div className="bottom-panel-main-col">
        <MissionPanel fleets={fleets} now={now} />
        <MaterialPanel materials={materials} />
      </div>

      <div className="bottom-panel-main-col">
        <RepairDockPanel docks={ndocks} now={now} />
        <ConstructionDockPanel docks={kdocks} now={now} />
      </div>

      <div className="bottom-panel-main-col">
        <SortiePanel sortie={sortie} />
        <QuestPanel quests={quests} />
      </div>
    </div>
  );
}

export default BottomPanel;
