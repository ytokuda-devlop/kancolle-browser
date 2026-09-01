/*
 * UI、ゲーム画面、DMM関連ウィンドウで共通利用する右クリックメニューを構築するモジュール。
 * 戻る・進む・再読み込み・編集操作・開発者向け要素検証を提供する。
 */
const { Menu } = require('electron');
const runtime = require('../runtime');

function setupContextMenu(contents, inspectLabel) {
  if (!contents) return;

  contents.on('context-menu', (event, params) => {
    const template = [
      {
        label: '戻る',
        enabled: contents.canGoBack(),
        click: () => contents.goBack()
      },
      {
        label: '進む',
        enabled: contents.canGoForward(),
        click: () => contents.goForward()
      },
      {
        label: '再読み込み',
        click: () => contents.reload()
      },
      { type: 'separator' },
      {
        label: '切り取り',
        role: 'cut',
        visible: params.isEditable,
        enabled: params.editFlags.canCut
      },
      {
        label: 'コピー',
        role: 'copy',
        enabled: params.editFlags.canCopy
      },
      {
        label: '貼り付け',
        role: 'paste',
        visible: params.isEditable,
        enabled: params.editFlags.canPaste
      },
      {
        label: 'すべて選択',
        role: 'selectAll'
      },
      { type: 'separator' },
      {
        label: inspectLabel,
        click: () => contents.inspectElement(params.x, params.y)
      }
    ];

    Menu.buildFromTemplate(template).popup({
      window: runtime.mainWindow || undefined
    });
  });
}

module.exports = { setupContextMenu };
