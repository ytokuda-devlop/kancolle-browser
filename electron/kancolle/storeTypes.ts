import type { ApiMission } from './apiTypes';
import type { KdockData, NdockData, ShipData, SortieData } from '../../shared/kancolle';

export interface StoredShip extends Omit<ShipData, 'name' | 'slots'> {
  shipId: number;
  slots: number[];
  slotEx: number;
  onslot: number[];
}
export interface StoredDeck {
  id: number;
  name: string;
  shipIds: number[];
  mission?: ApiMission;
}
export interface StoreState {
  shipsMaster: Record<number, { name: string; type: number; maxeq: number[] }>;
  slotitemsMaster: Record<number, { name: string; type: number; tyku: number }>;
  missionsMaster: Record<number, string>;
  mapAreasMaster: Record<number, { name: string; type: number }>;
  mapsMaster: Record<string, { name: string }>;
  ships: Record<number, StoredShip>;
  decks: StoredDeck[];
  slotItems: Record<number, { slotitemId: number; level: number; alv: number }>;
  ndocks: Omit<NdockData, 'shipName'>[];
  kdocks: KdockData[];
  quests: Record<number, { id: number; name: string; state: number; progressFlag: number }>;
  questPages: Record<number, number[]>;
  sortie: SortieData | null;
  materials: Record<number, number>;
  useItems: Record<number, number>;
  maxShips: number;
  maxSlotItems: number;
  recordCapacity: { shipCount: number; maxShips: number; slotItemCount: number; maxSlotItems: number } | null;
}
