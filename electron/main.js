/*
 * Electronメインプロセスのエントリーポイント。
 * 機能別モジュールのIPC登録を読み込み、アプリの起動・再アクティブ化・終了だけを管理する。
 */
const { app, BrowserWindow } = require('electron');
const { createWindow } = require('./window/createWindow');

// preloadから呼び出されるIPCハンドラーを機能単位で登録する。
require('./ipc/appIpc');
require('./ipc/kancolleDataIpc');
require('./services/dmmService');
require('./services/mediaService');

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
