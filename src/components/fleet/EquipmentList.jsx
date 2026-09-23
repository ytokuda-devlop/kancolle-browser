/*
 * 艦娘カード内の装備スロット一覧を表示するコンポーネント。
 * 装備名、改修値、熟練度、艦載機搭載数、補強増設スロットを装備ごとに描画する。
 */
import { getAircraftCountClass } from '../../utils/shipDisplay';
import ProficiencyMark from './ProficiencyMark';

function EquipmentList({ slots }) {
  return (
    <div className="ship-slots">
      {slots?.length > 0 ? (
        slots.map((slot, index) => (
          <div
            key={slot.id || index}
            className={`slot-item ${slot.isExpansion ? 'slot-item-expansion' : ''}`}
            title={slot.isExpansion ? `補強増設: ${slot.name}` : slot.name}
          >
            <span className="slot-name">{slot.name}</span>
            <span className="slot-meta">
              {slot.level > 0 && (
                <span className="slot-level" title={`改修値 ${slot.level}`}>
                  ★+{slot.level}
                </span>
              )}
              {slot.isAircraft && slot.alv > 0 && <ProficiencyMark level={slot.alv} />}
              {slot.isAircraft && (
                <span
                  className={`slot-aircraft ${getAircraftCountClass(slot)}`}
                  title={`搭載数 ${slot.currentAircraft}/${slot.maxAircraft}`}
                >
                  {slot.currentAircraft}/{slot.maxAircraft}
                </span>
              )}
            </span>
          </div>
        ))
      ) : (
        <div className="slot-item" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
          未装備
        </div>
      )}
    </div>
  );
}

export default EquipmentList;
