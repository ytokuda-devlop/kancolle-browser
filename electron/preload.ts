import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { ElectronAPI } from '../shared/electronApi';
import type { ShipInfoData, MaterialData, FleetData, NdockData, KdockData, QuestData, SortieData } from '../shared/kancolle';

// レンダラープロセス（React）に安全にAPIを公開する
const electronAPI: ElectronAPI = {
  openShipInfo: () => ipcRenderer.invoke('ships:open'),
  onShipData: (callback) => {
    const subscription = (_event: IpcRendererEvent, data: ShipInfoData[]) => callback(data);
    ipcRenderer.on('kancolle:ship-data', subscription);
    return () => ipcRenderer.removeListener('kancolle:ship-data', subscription);
  },
  getShipData: () => ipcRenderer.send('kancolle:get-ship-data'),
  // ゲーム画面の再読み込みをメインプロセスに要求する
  reloadGame: () => ipcRenderer.send('game:reload'),

  // メインウィンドウ（UI）の開発者ツール切り替えを要求する
  toggleDevTools: () => ipcRenderer.send('ui:toggle-devtools'),

  // ゲーム画面の開発者ツール切り替えを要求する
  toggleGameDevTools: () => ipcRenderer.send('game:toggle-devtools'),

  // ゲーム画面のスクリーンショットを Pictures へ保存する
  captureScreenshot: () => ipcRenderer.invoke('game:capture-screenshot'),

  // DMM 公式のポイント画面をゲームと同じセッションの別ウィンドウで開く
  openDmmPointPage: (action) => ipcRenderer.invoke('dmm:open-point-page', action),

  // 資材データの更新イベントを受信する
  onMaterialData: (callback) => {
    const subscription = (event: IpcRendererEvent, data: MaterialData) => callback(data);
    ipcRenderer.on('kancolle:material-data', subscription);
    return () => ipcRenderer.removeListener('kancolle:material-data', subscription);
  },

  // 初期資材データの取得要求
  getMaterialData: () => ipcRenderer.send('kancolle:get-material-data'),

  // 艦隊データの更新イベントを受信する
  onFleetData: (callback) => {
    const subscription = (event: IpcRendererEvent, data: FleetData[]) => callback(data);
    ipcRenderer.on('kancolle:fleet-data', subscription);
    return () => ipcRenderer.removeListener('kancolle:fleet-data', subscription);
  },

  // 初期データの取得要求
  getFleetData: () => ipcRenderer.send('kancolle:get-fleet-data'),

  // 入渠ドックデータの更新イベントを受信する
  onNdockData: (callback) => {
    const subscription = (event: IpcRendererEvent, data: NdockData[]) => callback(data);
    ipcRenderer.on('kancolle:ndock-data', subscription);
    return () => ipcRenderer.removeListener('kancolle:ndock-data', subscription);
  },

  // 初期入渠ドックデータの取得要求
  getNdockData: () => ipcRenderer.send('kancolle:get-ndock-data'),

  // 建造ドックデータの更新イベントを受信する
  onKdockData: (callback) => {
    const subscription = (event: IpcRendererEvent, data: KdockData[]) => callback(data);
    ipcRenderer.on('kancolle:kdock-data', subscription);
    return () => ipcRenderer.removeListener('kancolle:kdock-data', subscription);
  },

  // 初期建造ドックデータの取得要求
  getKdockData: () => ipcRenderer.send('kancolle:get-kdock-data'),

  // 進行中任務データの更新イベントを受信する
  onQuestData: (callback) => {
    const subscription = (event: IpcRendererEvent, data: QuestData[]) => callback(data);
    ipcRenderer.on('kancolle:quest-data', subscription);
    return () => ipcRenderer.removeListener('kancolle:quest-data', subscription);
  },

  // 初期進行中任務データの取得要求
  getQuestData: () => ipcRenderer.send('kancolle:get-quest-data'),

  // 出撃海域データの更新イベントを受信する
  onSortieData: (callback) => {
    const subscription = (event: IpcRendererEvent, data: SortieData | null) => callback(data);
    ipcRenderer.on('kancolle:sortie-data', subscription);
    return () => ipcRenderer.removeListener('kancolle:sortie-data', subscription);
  },

  // 初期出撃海域データの取得要求
  getSortieData: () => ipcRenderer.send('kancolle:get-sortie-data')
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
