/*
 * ゲーム再読み込みとUI・ゲーム画面の開発者ツール操作を受け付けるIPCリスナー。
 * 現在有効なウィンドウとゲームビューをruntime経由で参照してブラウザ操作を実行する。
 */
const { ipcMain } = require('electron');
const runtime = require('../runtime');

// ゲーム画面の再読み込み
ipcMain.on('game:reload', () => {
  if (runtime.gameView) {
    runtime.gameView.webContents.reload();
  }
});

// UI（メインウィンドウ）の開発者ツール切り替え
ipcMain.on('ui:toggle-devtools', () => {
  if (runtime.mainWindow) {
    if (runtime.mainWindow.webContents.isDevToolsOpened()) {
      runtime.mainWindow.webContents.closeDevTools();
    } else {
      runtime.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }
});

// ゲーム画面の開発者ツール切り替え
ipcMain.on('game:toggle-devtools', () => {
  if (runtime.gameView) {
    if (runtime.gameView.webContents.isDevToolsOpened()) {
      runtime.gameView.webContents.closeDevTools();
    } else {
      runtime.gameView.webContents.openDevTools({ mode: 'detach' });
    }
  }
});
