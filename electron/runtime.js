/*
 * Electronメインプロセス内で生成されるメインウィンドウとゲームビューの参照を共有する。
 * 各機能モジュールが互いを直接importせず、現在有効な表示対象へアクセスするために使用する。
 */
module.exports = {
  mainWindow: null,
  gameView: null
};
