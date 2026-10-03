interface Props {
  selectedFleetId: number;
  onSelectFleet: (id: number) => void;
  totalLevel: number;
  totalSakuteki: number;
  totalSeiku: number;
}

/*
 * 艦隊情報パネルのヘッダーを表示するコンポーネント。
 * 第1～第4艦隊の切り替えボタンと、選択艦隊のレベル合計・索敵・制空値を示す。
 */
function FleetHeader({
  selectedFleetId,
  onSelectFleet,
  totalLevel,
  totalSakuteki,
  totalSeiku
}: Props) {
  return (
    <div className="fleet-header">
      <div className="fleet-selector-group">
        {[1, 2, 3, 4].map(id => (
          <button
            key={id}
            type="button"
            className={`fleet-tab-button ${selectedFleetId === id ? 'active' : ''}`}
            onClick={() => onSelectFleet(id)}
          >
            第{id}艦隊
          </button>
        ))}
      </div>
      <div className="fleet-summary">
        <span className="fleet-summary-item">
          Lv.合計: <span className="fleet-summary-val">{totalLevel}</span>
        </span>
        <span className="fleet-summary-item">
          索敵: <span className="fleet-summary-val">{totalSakuteki}</span>
        </span>
        <span className="fleet-summary-item">
          制空: <span className="fleet-summary-val">{totalSeiku}</span>
        </span>
      </div>
    </div>
  );
}

export default FleetHeader;
