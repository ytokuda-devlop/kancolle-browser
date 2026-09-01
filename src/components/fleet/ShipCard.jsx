/*
 * 艦隊に所属する艦娘1隻分のカードを表示するコンポーネント。
 * 編成順、艦名、レベル、HP、コンディション、能力値、装備一覧を組み立てる。
 */
import { getCondClass, getHpFillClass } from '../../utils/shipDisplay';
import EquipmentList from './EquipmentList';
import ShipStats from './ShipStats';

function ShipCard({ ship, position }) {
  const hpRatio = ship.nowhp / ship.maxhp;
  const isTaiha = hpRatio <= 0.25;

  return (
    <div className={`ship-card ${isTaiha ? 'ship-card-taiha' : ''}`}>
      <div className="ship-header">
        <div className="ship-identity">
          <span className="ship-num">{position}</span>
          <span className="ship-name" title={ship.name}>{ship.name}</span>
        </div>
        <span className="ship-lv">Lv.{ship.lv}</span>

        <div className="ship-hp-section">
          <div className="ship-hp-bar">
            <div
              className={`ship-hp-fill ${getHpFillClass(ship.nowhp, ship.maxhp)}`}
              style={{ width: `${hpRatio * 100}%` }}
            />
          </div>
          <span className="ship-hp-text">{ship.nowhp}/{ship.maxhp}</span>
        </div>

        <span className={`ship-cond ${getCondClass(ship.cond)}`} title="コンディション">
          {ship.cond}
        </span>
      </div>

      <div className="ship-body">
        <ShipStats ship={ship} />
        <EquipmentList slots={ship.slots} />
      </div>
    </div>
  );
}

export default ShipCard;
