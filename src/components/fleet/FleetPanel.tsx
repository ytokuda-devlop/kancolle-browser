import type { FleetData } from '../../../shared/kancolle';

interface Props {
  fleets: FleetData[];
}

/*
 * 右側の艦隊情報パネル全体を表示するコンポーネント。
 * 選択中の艦隊を管理し、艦隊サマリーと最大6隻分の艦娘カードを組み立てる。
 */
import { useState } from 'react';
import {
  getFleetSakuteki,
  getFleetSeiku,
  getFleetTotalLevel
} from '../../utils/fleetCalculations';
import FleetHeader from './FleetHeader';
import ShipCard from './ShipCard';

const MAX_VISIBLE_SHIPS = 6;

function FleetPanel({ fleets }: Props) {
  const [selectedFleetId, setSelectedFleetId] = useState(1);
  const currentFleet = fleets.find(fleet => fleet.id === selectedFleetId) || {
    id: selectedFleetId,
    name: `第${selectedFleetId}艦隊`,
    ships: []
  };
  const ships = currentFleet.ships || [];

  return (
    <div className="fleet-panel">
      <FleetHeader
        selectedFleetId={selectedFleetId}
        onSelectFleet={setSelectedFleetId}
        totalLevel={getFleetTotalLevel(ships)}
        totalSakuteki={getFleetSakuteki(ships)}
        totalSeiku={getFleetSeiku(ships)}
      />

      <div className="fleet-grid">
        {fleets.length === 0 ? (
          <FleetLoadingState />
        ) : ships.length > 0 ? (
          <>
            {ships.map((ship, index) => (
              <ShipCard key={ship.id} ship={ship} position={index + 1} />
            ))}
            {ships.length < MAX_VISIBLE_SHIPS && Array.from(
              { length: MAX_VISIBLE_SHIPS - ships.length },
              (_, index) => (
                <div
                  key={`empty-${index}`}
                  className="ship-card ship-card-empty"
                  aria-hidden="true"
                />
              )
            )}
          </>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            height: '100%',
            padding: '20px'
          }}>
            艦隊に編成されている艦娘がいません。
          </div>
        )}
      </div>
    </div>
  );
}

function FleetLoadingState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-secondary)',
      fontSize: '0.95rem',
      gap: '12px',
      padding: '20px',
      textAlign: 'center',
      height: '100%'
    }}>
      <div
        className="spinner"
        style={{
          width: '30px',
          height: '30px',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTop: '3px solid var(--accent-color)'
        }}
      />
      <div>
        <span style={{
          fontWeight: 'bold',
          color: 'var(--accent-color)',
          display: 'block',
          marginBottom: '4px'
        }}>
          ゲームデータ受信待ち
        </span>
        艦これにログインし、母港画面を表示すると艦隊データがここに反映されます。
      </div>
    </div>
  );
}

export default FleetPanel;
