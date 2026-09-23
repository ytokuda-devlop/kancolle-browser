/*
 * 保有資材と保有枠の使用状況を表示するコンポーネント。
 * 10種類の資材、艦娘数、装備数を定義済みの順序でグリッド表示する。
 */
const MATERIALS = [
  { key: 'fuel', label: '油', className: 'mat-fuel' },
  { key: 'steel', label: '鉄', className: 'mat-steel' },
  { key: 'ammo', label: '弾', className: 'mat-ammo' },
  { key: 'bauxite', label: 'ボーキ', className: 'mat-bauxite' },
  { key: 'devco', label: '開発資材', className: 'mat-devco' },
  { key: 'screw', label: '改修資材', className: 'mat-screw' },
  { key: 'bucket', label: 'バケツ', className: 'mat-bucket' },
  { key: 'burner', label: 'バーナー', className: 'mat-burner' },
  { key: 'mamiya', label: '間宮', className: 'mat-mamiya' },
  { key: 'irako', label: '伊良湖', className: 'mat-irako' }
];

function MaterialPanel({ materials }) {
  return (
    <div className="bottom-panel-col material-col">
      <div className="panel-col-header">資材</div>
      <div className="panel-col-content">
        <div className="material-grid">
          {MATERIALS.map(material => (
            <div key={material.key} className="material-item">
              <span className={`material-label ${material.className}`}>{material.label}</span>
              <span className="material-value">{materials[material.key].toLocaleString()}</span>
            </div>
          ))}
          <div className="material-item capacity-item">
            <span className="capacity-label">保有艦娘数</span>
            <span className="material-value">
              {materials.shipCount.toLocaleString()}/{materials.maxShips.toLocaleString()}
            </span>
          </div>
          <div className="material-item capacity-item">
            <span className="capacity-label">保有装備数</span>
            <span className="material-value">
              {materials.slotItemCount.toLocaleString()}/{materials.maxSlotItems.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MaterialPanel;
