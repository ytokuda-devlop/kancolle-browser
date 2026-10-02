/*
 * ゲーム画面をPNGとして保存するモジュール。
 * Pictures直下への保存と、同名ファイルの上書き防止を担当する。
 */
const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const runtime = require('../runtime');

// ゲーム画面を Pictures 直下へPNGで保存
ipcMain.handle('game:capture-screenshot', async () => {
  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) {
    return { success: false, error: 'ゲーム画面を取得できません。' };
  }

  try {
    const image = await runtime.gameView.webContents.capturePage();
    const png = image.toPNG();
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const timestamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate())
    ].join('') + '-' + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');
    const picturesDirectory = app.getPath('pictures');

    await fs.promises.mkdir(picturesDirectory, { recursive: true });

    // 同じ秒に撮影された場合も既存ファイルを上書きしない。
    for (let sequence = 0; sequence < 1000; sequence += 1) {
      const suffix = sequence === 0 ? '' : `-${sequence}`;
      const filename = `kancolle-${timestamp}${suffix}.png`;
      const destination = path.join(picturesDirectory, filename);

      try {
        await fs.promises.writeFile(destination, png, { flag: 'wx' });
        return { success: true, path: destination };
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }

    return { success: false, error: 'スクリーンショットのファイル名を作成できませんでした。' };
  } catch (err) {
    console.error('[Screenshot] 保存に失敗しました:', err);
    return { success: false, error: err.message };
  }
});
