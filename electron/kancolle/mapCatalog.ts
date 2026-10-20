import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MapCatalog, MapCatalogEntry, MapNodeRecord } from '../../shared/mapCatalog';
import type { ApiSortie } from './apiTypes';
import { getMapNodeLabel } from '../../src/mapNodeLabels';

export function getMapResource(url: string) {
  const parsed = new URL(url);
  const match = /^\/kcs2\/resources\/map\/(\d+)\/(\d+)_info(\d*)\.json$/.exec(parsed.pathname);
  if (!match) return null;
  return {
    mapAreaId: Number(match[1]), mapInfoNo: Number(match[2]),
    resource: parsed.pathname, version: parsed.searchParams.get('version')
  };
}

const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export class MapCatalogStore {
  private data: MapCatalog = { schemaVersion: 1, maps: {} };
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly filePath?: string) {}

  async load(): Promise<void> {
    if (!this.filePath) return;
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as MapCatalog;
      if (data.schemaVersion !== 1 || !data.maps || typeof data.maps !== 'object' || Array.isArray(data.maps)) {
        throw new Error('地図カタログの形式が不正です');
      }
      for (const entry of Object.values(data.maps)) {
        if (!positiveId(entry.mapAreaId) || !positiveId(entry.mapInfoNo) ||
            !entry.nodes || typeof entry.nodes !== 'object' || !Array.isArray(entry.snapshots)) {
          throw new Error('海域データの形式が不正です');
        }
      }
      this.data = data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  getCatalog(): MapCatalog {
    return structuredClone(this.data);
  }

  private entry(area: number, map: number): MapCatalogEntry {
    return this.data.maps[`${area}-${map}`] ??= {
      mapAreaId: area, mapInfoNo: map, nodes: {}, snapshots: []
    };
  }

  private node(entry: MapCatalogEntry, id: number, now: string): MapNodeRecord {
    const node = entry.nodes[id] ??= {
      id, label: null, firstSeenAt: now, lastSeenAt: now
    };
    node.label = getMapNodeLabel(entry.mapAreaId, entry.mapInfoNo, id);
    node.lastSeenAt = now;
    return node;
  }

  async capture(url: string, body: string, now = new Date().toISOString()) {
    const resource = getMapResource(url);
    if (!resource || !positiveId(resource.mapAreaId) || !positiveId(resource.mapInfoNo)) throw new Error('地図URLが不正です');
    const json = JSON.parse(body) as { spots?: unknown };
    if (!json || !Array.isArray(json.spots)) throw new Error('地図JSONにspots配列がありません');
    const spots = json.spots.map((spot: unknown) => {
      const s = spot as { no?: unknown; x?: unknown; y?: unknown } | null;
      // no=0 は開始地点。出撃APIのマスIDとしては保存しない。
      if (s?.no === 0) return null;
      if (!s || !positiveId(s.no) || typeof s.x !== 'number' || !Number.isFinite(s.x) ||
          typeof s.y !== 'number' || !Number.isFinite(s.y)) throw new Error('地図のマス番号・座標が不正です');
      return { id: s.no, x: s.x, y: s.y };
    }).filter((s): s is { id: number; x: number; y: number } => s !== null);
    if (new Set(spots.map(s => s.id)).size !== spots.length) throw new Error('地図のマス番号が重複しています');
    const entry = this.entry(resource.mapAreaId, resource.mapInfoNo);
    const hash = createHash('sha256').update(body).digest('hex');
    const previous = entry.snapshots.find(s => s.resource === resource.resource && s.hash === hash && s.version === resource.version);
    const added = spots.filter(s => !entry.nodes[s.id]).length;
    const summary = { map: `${resource.mapAreaId}-${resource.mapInfoNo}`, count: spots.length,
      added, total: Object.keys(entry.nodes).length + added, ids: spots.map(s => s.id),
      version: resource.version, hash, filePath: this.filePath, duplicate: Boolean(previous) };
    // 新しい内部IDがなければ、バージョン・座標・取得履歴も更新せず保存を省く。
    if (added === 0) return summary;
    if (previous) previous.lastSeenAt = now;
    else entry.snapshots.push({ ...resource, hash, acquiredAt: now, lastSeenAt: now, spots });
    for (const spot of spots) Object.assign(this.node(entry, spot.id, now), { x: spot.x, y: spot.y });
    await this.save();
    return summary;
  }

  async observeSortie(sortie: ApiSortie, now = new Date().toISOString()) {
    if (!positiveId(sortie.api_maparea_id) || !positiveId(sortie.api_mapinfo_no)) return null;
    const entry = this.entry(sortie.api_maparea_id, sortie.api_mapinfo_no);
    const previousCount = Object.keys(entry.nodes).length;
    if (positiveId(sortie.api_no)) this.node(entry, sortie.api_no, now).visitedAt = now;
    if (positiveId(sortie.api_bosscell_no)) this.node(entry, sortie.api_bosscell_no, now).bossObservedAt = now;
    const added = Object.keys(entry.nodes).length - previousCount;
    // 既知マスの訪問・ボス情報はメモリだけで更新し、追加IDがある場合だけ保存する。
    if (added > 0) await this.save();
    return { map: `${entry.mapAreaId}-${entry.mapInfoNo}`, visitedId: sortie.api_no,
      added,
      bossId: sortie.api_bosscell_no, mapDataCaptured: entry.snapshots.length > 0,
      total: Object.keys(entry.nodes).length };
  }

  private save(): Promise<void> {
    if (!this.filePath) return Promise.resolve();
    const file = this.filePath;
    const body = JSON.stringify(this.data, null, 2);
    // 並行レスポンスでも古い書き込みが後から新しいデータを上書きしない。
    this.queue = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(`${file}.tmp`, body, 'utf8');
      await fs.rename(`${file}.tmp`, file);
    });
    return this.queue;
  }
}

export let mapCatalogStore = new MapCatalogStore();
export async function initializeMapCatalog(userDataPath: string): Promise<void> {
  const store = new MapCatalogStore(path.join(userDataPath, 'map-catalog.json'));
  await store.load();
  mapCatalogStore = store;
}
