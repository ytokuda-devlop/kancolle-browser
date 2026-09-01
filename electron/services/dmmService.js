/*
 * DMMの決済ポップアップとポイントチャージ画面を安全に開くためのモジュール。
 * 許可するURLをDMMのHTTPSページに限定し、ゲームと同じログインセッションを引き継ぐ。
 */
const { BrowserWindow, ipcMain } = require('electron');
const runtime = require('../runtime');
const { setupContextMenu } = require('../window/contextMenu');

const DMM_POINT_PAGE_URLS = {
  charge: 'https://point.dmm.com/choice/pay?basket_service_type=my'
};

function isAllowedDmmUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      (url.hostname === 'dmm.com' || url.hostname.endsWith('.dmm.com'));
  } catch {
    return false;
  }
}

function isAllowedDmmPopupUrl(rawUrl, referrerUrl = '') {
  if (isAllowedDmmUrl(rawUrl)) return true;

  // DMM のフォーム送信では、空の子ウィンドウを先に作ってから購入先へ
  // 遷移させる場合がある。DMM から作られた空ウィンドウだけを許可する。
  return rawUrl === 'about:blank' && isAllowedDmmUrl(referrerUrl);
}

function setupDmmPopupHandler(contents, gameSession) {
  contents.setWindowOpenHandler(details => {
    const referrerUrl = details.referrer?.url || '';
    if (!isAllowedDmmPopupUrl(details.url, referrerUrl)) {
      console.warn('[DMM Popup] 許可されていないポップアップを拒否しました:', details.url);
      return { action: 'deny' };
    }

    return {
      action: 'allow',
      createWindow: options => {
        const popupWindow = new BrowserWindow({
          ...options,
          width: options.width || 1100,
          height: options.height || 800,
          parent: runtime.mainWindow || undefined,
          webPreferences: {
            ...options.webPreferences,
            session: gameSession,
            contextIsolation: true,
            nodeIntegration: false
          }
        });

        setupContextMenu(popupWindow.webContents, 'DMM画面の要素を検証');

        // 購入画面内のリダイレクトもDMMのHTTPSページだけに制限する。
        popupWindow.webContents.on('will-navigate', (event, navigationUrl) => {
          if (!isAllowedDmmUrl(navigationUrl)) {
            console.warn('[DMM Popup] 許可されていない遷移を拒否しました:', navigationUrl);
            event.preventDefault();
          }
        });

        return popupWindow.webContents;
      }
    };
  });
}

// DMM 公式のポイント画面を、ゲームと同じ永続セッションを使う
// 別ウィンドウで開く。DMM ヘッダーの DOM 構造には依存しない。
ipcMain.handle('dmm:open-point-page', async (event, action) => {
  const pointPageUrl = DMM_POINT_PAGE_URLS[action];
  if (!pointPageUrl) {
    return { success: false, error: '不明なポイント操作です。' };
  }

  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) {
    return { success: false, error: 'DMMのゲーム画面を取得できません。' };
  }

  try {
    if (!isAllowedDmmUrl(pointPageUrl)) {
      console.warn('[DMM Point] 許可されていないリンクを拒否しました:', pointPageUrl);
      return { success: false, error: 'ポイントリンクのURLを確認できませんでした。' };
    }

    const pointWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      parent: runtime.mainWindow || undefined,
      title: action === 'charge' ? 'DMMポイントをチャージ' : 'DMMポイント確認',
      webPreferences: {
        session: runtime.gameView.webContents.session,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    setupContextMenu(pointWindow.webContents, 'ポイント画面の要素を検証');
    await pointWindow.loadURL(pointPageUrl);
    return { success: true };
  } catch (err) {
    console.error('[DMM Point] ポイント画面を開けませんでした:', err);
    return { success: false, error: err.message };
  }
});

module.exports = { setupDmmPopupHandler };
