/*
 * Electronメインプロセスのエントリーポイント。
 * 機能別モジュールのIPC登録を読み込み、アプリの起動・再アクティブ化・終了だけを管理する。
 */
import { app, BrowserWindow } from 'electron';
import { createWindow } from './window/createWindow';
import { initializeMapCatalog } from './kancolle/mapCatalog';
import { logMap } from './kancolle/mapLog';

// preloadから呼び出されるIPCハンドラーを機能単位で登録する。
import './ipc/appIpc';
import './ipc/kancolleDataIpc';
import './services/dmmService';
import './services/mediaService';
import './services/shipInfoService';

app.whenReady().then(async () => {
  try {
    await initializeMapCatalog(app.getPath('userData'));
    logMap('カタログを読み込みました。地図JSONの捕捉を待機します', { filePath: `${app.getPath('userData')}/map-catalog.json` });
  } catch (error) {
    logMap('カタログの読み込みに失敗しました。既存ファイルを保護し、この起動ではメモリだけに記録します', String(error), true);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
