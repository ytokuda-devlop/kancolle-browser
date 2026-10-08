import { useEffect, useMemo, useState } from 'react';
import type { EquipmentData, ShipInfoData } from '../../shared/kancolle';
import './ship-info.css';
import ProficiencyMark from './fleet/ProficiencyMark';
import { shipTabs, matchesShipTab, type ShipTab } from '../utils/shipTabs';

type SortKey = Exclude<keyof ShipInfoData, 'id' | 'shipType' | 'equipment' | 'expansionEquipment'>;
const columns: { key: SortKey; label: string }[] = [
  { key: 'name', label: '艦名' }, { key: 'lv', label: 'Lv' },
  { key: 'maxhp', label: '耐久' }, { key: 'cond', label: 'Cond' },
  { key: 'karyoku', label: '火力' }, { key: 'raisou', label: '雷装' },
  { key: 'taiku', label: '対空' }, { key: 'soukou', label: '装甲' },
  { key: 'kaihi', label: '回避' }, { key: 'taisen', label: '対潜' },
  { key: 'sakuteki', label: '索敵' }, { key: 'lucky', label: '運' }
];

export default function ShipInfo() {
  const [view, setView] = useState<'艦娘一覧' | '艦娘装備'>('艦娘一覧');
  const [ships, setShips] = useState<ShipInfoData[]>([]);
  const [activeTab, setActiveTab] = useState<ShipTab>('ALL');
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'lv', ascending: false });
  useEffect(() => {
    document.title = '艦娘一覧';
    const api = window.electronAPI;
    if (!api) return;
    const unsubscribe = api.onShipData(data => { setShips(data); setLoaded(true); });
    api.getShipData();
    return unsubscribe;
  }, []);
  const sortedShips = useMemo(() => ships.filter(ship => matchesShipTab(ship.shipType, activeTab)).sort((a, b) => {
    const compared = sort.key === 'name'
      ? a.name.localeCompare(b.name, 'ja')
      : (a[sort.key] as number) - (b[sort.key] as number);
    return (sort.ascending ? compared : -compared) || a.id - b.id;
  }), [ships, sort, activeTab]);

  const equipmentSlotCount = Math.max(5, ...ships.map(ship => ship.equipment.length));

  return <main className="ship-info">
    <div className="ship-info-tabs ship-info-view-tabs" role="tablist" aria-label="表示内容">
      {(['艦娘一覧', '艦娘装備'] as const).map(tab => <button key={tab} role="tab"
        id={`ship-view-${tab}`} aria-selected={view === tab} aria-controls="ship-view-panel"
        onClick={() => setView(tab)}>{tab}</button>)}
    </div>
    <section id="ship-view-panel" className="ship-info-view-panel" role="tabpanel" aria-labelledby={`ship-view-${view}`}>
    <div className="ship-info-tabs" role="tablist" aria-label="艦種">
      {shipTabs.map(tab => <button key={tab} id={`ship-tab-${tab}`} role="tab"
        aria-selected={activeTab === tab} aria-controls="ship-list-panel"
        onClick={() => setActiveTab(tab)}>{tab}</button>)}
    </div>
    <div className="ship-info-table-scroll" id="ship-list-panel" role="tabpanel" aria-labelledby={`ship-tab-${activeTab}`}>

      {view === '艦娘一覧' ? <table className="ship-info-table">
        <colgroup>
          <col className="ship-info-name-column" />
          {columns.slice(1).map(column => <col key={column.key} />)}
        </colgroup>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col"
          aria-sort={sort.key === column.key ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
          <button onClick={() => setSort(previous => ({ key: column.key,
            ascending: previous.key === column.key ? !previous.ascending : true }))}>
            {column.label}<span aria-hidden="true">{sort.key === column.key ? (sort.ascending ? ' ▲' : ' ▼') : ''}</span>
          </button>
        </th>)}</tr></thead>
        <tbody>{sortedShips.map(ship => <tr key={ship.id}>{columns.map(column =>
          <td key={column.key}><span className="ship-info-cell">{ship[column.key]}</span></td>)}</tr>)}</tbody>
      </table> : <table className="ship-info-table ship-equipment-table">
        <colgroup><col className="ship-info-name-column" /><col style={{ width: 70 }} />
          {Array.from({ length: equipmentSlotCount + 1 }, (_, index) => <col key={index} style={{ width: 240 }} />)}
        </colgroup>
        <thead><tr><th scope="col">艦名</th><th scope="col">Lv</th>
          {Array.from({ length: equipmentSlotCount }, (_, index) => <th key={index} scope="col">装備{index + 1}</th>)}
          <th scope="col">補強増設</th></tr></thead>
        <tbody>{sortedShips.map(ship => <tr key={ship.id}>
          <td><span className="ship-info-cell" title={ship.name}>{ship.name}</span></td>
          <td><span className="ship-info-cell">{ship.lv}</span></td>
          {Array.from({ length: equipmentSlotCount }, (_, index) => <td key={index}>
            <EquipmentCell item={ship.equipment[index]} available={index < ship.equipment.length} />
          </td>)}
          <td><EquipmentCell item={ship.expansionEquipment} available /></td>
        </tr>)}</tbody>
      </table>}
      {sortedShips.length === 0 && <p className="ship-info-empty">{loaded
        ? (ships.length === 0 ? '艦娘一覧がありません。ゲームで母港を開くと表示されます。' : `${activeTab}に該当する艦娘はいません。`)
        : '艦娘一覧を読み込んでいます…'}</p>}
    </div>
    </section>
  </main>;
}

function EquipmentCell({ item, available }: { item: EquipmentData | null | undefined; available: boolean }) {
  const label = item ? `${item.name}${item.level > 0 ? ` ★+${item.level}` : ''}` : available ? '未装備' : '—';
  return <span className="ship-info-cell ship-equipment-cell">
    <span className="ship-equipment-label" title={label}>{item ? item.name : label}</span>
    {item && item.level > 0 && <span className="slot-level" title={`改修値 ${item.level}`}>★+{item.level}</span>}
    {item?.isAircraft && item.alv > 0 && <ProficiencyMark level={item.alv} />}
  </span>;
}
