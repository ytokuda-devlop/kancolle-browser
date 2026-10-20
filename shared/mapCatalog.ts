export interface MapNodeRecord {
  id: number;
  label: string | null;
  x?: number;
  y?: number;
  firstSeenAt: string;
  lastSeenAt: string;
  visitedAt?: string;
  bossObservedAt?: string;
}

export interface MapSnapshot {
  resource: string;
  version: string | null;
  hash: string;
  acquiredAt: string;
  lastSeenAt: string;
  spots: { id: number; x: number; y: number }[];
}

export interface MapCatalogEntry {
  mapAreaId: number;
  mapInfoNo: number;
  nodes: Record<string, MapNodeRecord>;
  // 捕捉済みの地図だけを表す。全マスの取得完了を意味しない。
  snapshots: MapSnapshot[];
}

export interface MapCatalog {
  schemaVersion: 1;
  maps: Record<string, MapCatalogEntry>;
}
