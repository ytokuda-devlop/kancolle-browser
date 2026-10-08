import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import runtime = require('../runtime');

ipcMain.handle('ships:open', async () => {
  if (runtime.shipInfoWindow && !runtime.shipInfoWindow.isDestroyed()) return { success: true };
  if (!runtime.mainWindow) return { success: false, error: 'メイン画面が見つかりません。' };
  const { width, height } = screen.getDisplayMatching(runtime.mainWindow.getBounds()).workAreaSize;
  const infoWindow = new BrowserWindow({
    width: Math.min(1100, width), height: Math.min(760, height),
    minWidth: Math.min(640, width), minHeight: Math.min(360, height),
    title: '艦娘一覧', show: false, backgroundColor: '#273549',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  runtime.shipInfoWindow = infoWindow;
  infoWindow.setMenu(null);
  infoWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  infoWindow.webContents.on('will-navigate', event => event.preventDefault());
  infoWindow.on('closed', () => {
    if (runtime.shipInfoWindow === infoWindow) runtime.shipInfoWindow = null;
  });
  try {
    if (app.isPackaged) {
      await infoWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'ships' });
    } else {
      await infoWindow.loadURL('http://localhost:5173/#ships');
    }
    if (!infoWindow.isDestroyed()) infoWindow.show();
    return { success: true };
  } catch {
    if (!infoWindow.isDestroyed()) infoWindow.close();
    return { success: false, error: '艦娘一覧を開けませんでした。' };
  }
});
