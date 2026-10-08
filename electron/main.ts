/*
 * Electronメインプロセスのエントリーポイント。
 * 機能別モジュールのIPC登録を読み込み、アプリの起動・再アクティブ化・終了だけを管理する。
 */
import { app, BrowserWindow } from 'electron';
import { createWindow } from './window/createWindow';

// preloadから呼び出されるIPCハンドラーを機能単位で登録する。
import './ipc/appIpc';
import './ipc/kancolleDataIpc';
import './services/dmmService';
import './services/mediaService';
import './services/shipInfoService';

app.whenReady().then(() => {
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
