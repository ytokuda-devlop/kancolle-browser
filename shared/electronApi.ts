import type {
  ShipInfoData,
  FleetData,
  KdockData,
  MaterialData,
  NdockData,
  QuestData,
  SortieData
} from './kancolle';
import type { MapCatalog } from './mapCatalog';

/** イベント購読を解除する。 */
export type Unsubscribe = () => void;
export type DataSubscription<T> = (callback: (data: T) => void) => Unsubscribe;

export interface OperationFailure {
  success: false;
  error: string;
}

export type ScreenshotResult = { success: true; path: string } | OperationFailure;
export type RecordingResult = { success: true } | OperationFailure;
export interface RecordingState {
  phase: 'idle' | 'starting' | 'recording' | 'saving';
  startedAt: number | null;
  status: string;
}
export type DmmPointAction = 'charge';
export type DmmPointPageResult = { success: true } | OperationFailure;

/** preloadがcontextBridgeを通じて公開する全API。Node/Electronの実装には依存しない。 */
export interface ElectronAPI {
  getMapCatalog(): Promise<MapCatalog>;
  openShipInfo(): Promise<{ success: true } | OperationFailure>;
  onShipData: DataSubscription<ShipInfoData[]>;
  getShipData(): void;
  reloadGame(): void;
  toggleDevTools(): void;
  toggleGameDevTools(): void;
  captureScreenshot(): Promise<ScreenshotResult>;
  beginRecording(): Promise<RecordingResult>;
  finishRecording(discard: boolean): Promise<ScreenshotResult>;
  getRecordingState(): Promise<RecordingState>;
  onRecordingState: DataSubscription<RecordingState>;
  openDmmPointPage(action: DmmPointAction): Promise<DmmPointPageResult>;
  onMaterialData: DataSubscription<MaterialData>;
  getMaterialData(): void;
  onFleetData: DataSubscription<FleetData[]>;
  getFleetData(): void;
  onNdockData: DataSubscription<NdockData[]>;
  getNdockData(): void;
  onKdockData: DataSubscription<KdockData[]>;
  getKdockData(): void;
  onQuestData: DataSubscription<QuestData[]>;
  getQuestData(): void;
  onSortieData: DataSubscription<SortieData | null>;
  getSortieData(): void;
}
