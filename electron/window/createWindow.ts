/*
 * メインウィンドウと艦これゲームビューを生成し、画面配置とブラウザ動作を設定するモジュール。
 * セッション、ショートカット、ゲームページ調整、API捕捉、表示ライフサイクルを接続する。
 */
import {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  screen
} from 'electron';
import type { Event, Input, WebContents } from 'electron';
import path from 'node:path';
import runtime = require('../runtime');
import { setupApiCapture } from '../kancolle/apiCapture';
import { setupContextMenu } from './contextMenu';
import { setupGamePageCss } from './gamePage';
import { setupDmmPopupHandler } from '../services/dmmService';

// ウィンドウとゲームビューのサイズを調整する関数
function updateGameViewBounds(): void {
  if (!runtime.mainWindow || !runtime.gameView) return;

  // ゲーム画面は標準の 1200 * 720 固定サイズに配置
  runtime.gameView.setBounds({
    x: 0,
    y: 0,
    width: 1200,
    height: 720
  });
}

export function createWindow(): void {
  // メインウィンドウ（UI側）の生成
  // ゲーム領域 (1200x720) + サイドバー (320) = 1520 (+ 余白20)
  // ゲーム高さ (720) + 艦隊パネル (300) = 1020
  // マウスカーソルがあるディスプレイを使用し、切断済み画面の座標へ出るのを防ぐ。
  const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const {
    x: workAreaX,
    y: workAreaY,
    width: workAreaWidth,
    height: workAreaHeight
  } = activeDisplay.workArea;
  const windowWidth = Math.min(1700, workAreaWidth);
  const windowHeight = Math.min(1050, workAreaHeight);
  const windowX = workAreaX + Math.floor((workAreaWidth - windowWidth) / 2);
  const windowY = workAreaY + Math.floor((workAreaHeight - windowHeight) / 2);

  runtime.mainWindow = new BrowserWindow({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
    minWidth: Math.min(1200, workAreaWidth),
    minHeight: Math.min(720, workAreaHeight),
    show: false,
    title: '艦これ専用ブラウザ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  let mainWindowRevealed = false;
  const revealMainWindow = (source: string): void => {
    if (mainWindowRevealed || !runtime.mainWindow || runtime.mainWindow.isDestroyed()) return;
    mainWindowRevealed = true;
    updateGameViewBounds();
    runtime.mainWindow.setBounds({
      x: windowX,
      y: windowY,
      width: windowWidth,
      height: windowHeight
    });
    if (runtime.mainWindow.isMinimized()) runtime.mainWindow.restore();
    runtime.mainWindow.show();
    if (process.platform === 'darwin') {
      app.dock?.show();
      app.focus({ steal: true });
    }
    runtime.mainWindow.moveTop();
    runtime.mainWindow.focus();
  };

  // セッションの永続化設定（ログイン情報やキャッシュを保存）
  const gameSession = session.fromPartition('persist:kancolle');
  let recoveringStaleDmmCache = false;
  gameSession.webRequest.onCompleted(
    { urls: ['https://play.games.dmm.com/assets/*'] },
    details => {
      if (details.statusCode !== 403 || recoveringStaleDmmCache) return;
      recoveringStaleDmmCache = true;
      console.warn('[Game Cache] 古いDMMアセットを検出したため再取得します');
      gameSession.clearCache()
        .then(() => {
          if (runtime.gameView && !runtime.gameView.webContents.isDestroyed()) {
            return runtime.gameView.webContents.loadURL('https://play.games.dmm.com/game/kancolle');
          }
        })
        .catch(err => {
          console.error('[Game Cache] DMMページを再取得できませんでした:', err.message);
        })
        .finally(() => {
          recoveringStaleDmmCache = false;
        });
    }
  );

  // DMM/艦これのロードでエラーにならないよう、標準的なブラウザのUser-Agentを設定
  const customUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
  gameSession.setUserAgent(customUA);

  // ゲーム画面を表示するビューの生成
  runtime.gameView = new WebContentsView({
    webPreferences: {
      session: gameSession,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // ゲーム内のアイテム購入が要求するDMM決済画面を、同じログイン
  // セッションを使う安全な別ウィンドウとして開く。
  setupDmmPopupHandler(runtime.gameView.webContents, gameSession);

  // DMM ヘッダー等を非表示にし、ゲーム iframe の見切れを解消する
  setupGamePageCss(runtime.gameView);

  // メインウィンドウにゲームビューを追加
  runtime.mainWindow.contentView.addChildView(runtime.gameView);

  // キーボードショートカットの登録
  const handleKeyDown = (event: Event, input: Input, targetContents: WebContents): void => {
    if (input.type !== 'keyDown') return;

    // Windows: F12、macOS: fn + F12（ElectronにはF12として届く）
    if (input.key === 'F12' || input.code === 'F12') {
      if (targetContents.isDevToolsOpened()) {
        targetContents.closeDevTools();
      } else {
        targetContents.openDevTools({ mode: 'detach' });
      }
      event.preventDefault();
      return;
    }

    const isMod = process.platform === 'darwin' ? input.meta : input.control;
    if (isMod && input.key.toLowerCase() === 'r') {
      if (runtime.gameView) {
        runtime.gameView.webContents.reload();
      }
      event.preventDefault();
    }
  };

  const mainContents = runtime.mainWindow.webContents;
  const gameContents = runtime.gameView.webContents;
  mainContents.on('before-input-event', (event, input) => {
    handleKeyDown(event, input, mainContents);
  });
  gameContents.on('before-input-event', (event, input) => {
    handleKeyDown(event, input, gameContents);
  });
  runtime.gameView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // DMMログイン後のリダイレクトでは進行中のロードが正常に中断される。
    if (errorCode === -3) return;
    console.error('[Game Load Failure]', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });
  runtime.gameView.webContents.on('render-process-gone', (event, details) => {
    console.error('[Game Renderer Gone]', details);
  });

  // 読み込みが完了してから明示的に表示し、macOSでも確実に前面化する。
  runtime.mainWindow.once('ready-to-show', () => {
    revealMainWindow('ready-to-show');
  });

  // 開発環境と本番環境でロード先を切り替える
  // Vite開発サーバー起動時は環境変数 VITE_DEV_SERVER_URL が指定されることを想定
  const devUrl = 'http://localhost:5173';
  const isDev = !app.isPackaged;

  if (isDev) {
    runtime.mainWindow.loadURL(devUrl).then(() => revealMainWindow('loadURL'));
  } else {
    runtime.mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
      .then(() => revealMainWindow('loadFile'));
  }

  // ready-to-showが発火しない環境でも、非表示のまま残らないようにする。
  setTimeout(() => revealMainWindow('timeout'), 3000);

  setupContextMenu(runtime.mainWindow.webContents, 'UIの要素を検証');
  setupContextMenu(runtime.gameView.webContents, 'ゲーム画面の要素を検証');

  // 通信キャプチャはページを開く前に有効化し、最初のAPI通信も取得する。
  setupApiCapture(runtime.gameView);

  // 艦これの現行ゲーム開始ページをロード
  runtime.gameView.webContents.loadURL('https://play.games.dmm.com/game/kancolle');

  // ウィンドウサイズ変更時にビューのサイズを追従させる
  runtime.mainWindow.on('resize', updateGameViewBounds);

  runtime.mainWindow.on('closed', () => {
    runtime.mainWindow = null;
    runtime.gameView = null;
  });
}

