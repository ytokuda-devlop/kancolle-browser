import type { ShipData } from '../../../shared/kancolle';

interface Props {
  ship: ShipData;
}

/*
 * 艦娘カード内の能力値一覧を表示するコンポーネント。
 * 火力・回避などの基本能力に加え、搭載数・制空値・速力・射程を表示用に整形する。
 */
import { getShipSeiku, getShipTotalAircraft } from '../../utils/fleetCalculations';
import { getLengText, getSokuText } from '../../utils/shipDisplay';

function ShipStats({ ship }: Props) {
  return (
    <div className="ship-stats">
      <Stat label="火力" value={ship.karyoku} />
      <Stat label="回避" value={ship.kaihi} />
      <Stat label="雷装" value={ship.raisou} />
      <Stat label="対潜" value={ship.taisen} />
      <Stat label="対空" value={ship.taiku} />
      <Stat label="索敵" value={ship.sakuteki} />
      <Stat label="装甲" value={ship.soukou} />
      <Stat label="運" value={ship.lucky} />
      <Stat label="搭載" value={getShipTotalAircraft(ship)} />
      <Stat label="制空" value={getShipSeiku(ship)} />
      <Stat label="速力" value={getSokuText(ship.soku)} compact />
      <Stat label="射程" value={getLengText(ship.leng)} compact />
    </div>
  );
}

function Stat({ label, value, compact = false }: { label: string; value: number | string; compact?: boolean }) {
  return (
    <div className="stat-item">
      <span>{label}</span>
      <span className="stat-val" style={compact ? { fontSize: '0.65rem' } : undefined}>
        {value}
      </span>
    </div>
  );
}

export default ShipStats;
