/*
 * DMMの艦これゲームページへ専用CSSとDOM調整を適用するモジュール。
 * ゲームiframeの固定、不要なナビゲーションと公式SNSリンクの非表示を担当する。
 */
const { webFrameMain } = require('electron');

// DMM の親ページから不要なナビゲーション類を隠す。
// iframe の位置決めは DMM 側の ID 変更に耐えられるよう、下のスクリプトで
// 実際のゲーム iframe を検出して行う。
const GAME_PAGE_CSS = `
  html,
  body {
    width: 1200px !important;
    height: 720px !important;
    min-width: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
  }

  #dh-gnav,
  #foot,
  #footer,
  .dmm-ntgnavi,
  .area-naviapp,
  #ntg-recommend {
    display: none !important;
  }

  #game_frame,
  iframe[data-kancolle-game-frame="true"] {
    position: fixed !important;
    inset: 0 auto auto 0 !important;
    width: 1200px !important;
    height: 860px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    /* DMMのアイテム購入画面は親ページのオーバーレイに表示されるため、
       iframeを最大z-indexにすると購入画面が背後に隠れてしまう。 */
    z-index: 1 !important;
    pointer-events: auto !important;
  }

  /* ゲーム内の「ポイントで購入」からDMMが生成する決済オーバーレイ。
     DMM側のインラインz-indexより優先し、ゲームiframeの手前に表示する。 */
  #block_background {
    z-index: 2 !important;
  }

  #alert {
    z-index: 3 !important;
    pointer-events: auto !important;
  }
`;

// DMM はゲーム iframe の ID やラッパーを変更することがあるため、既知の ID
// だけでなく URL・サイズも使って対象を特定する。親要素のレイアウトや
// DOM の親子関係は DMM 側の入力制御に必要なので変更しない。
const PIN_GAME_FRAME_SCRIPT = `
  (() => {
    const marker = 'data-kancolle-game-frame';
    const pinFrame = () => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      const gameFrame = frames.find(frame => {
        const src = frame.getAttribute('src') || '';
        const idAndName = \`${'${frame.id} ${frame.name}'}\`.toLowerCase();
        const rect = frame.getBoundingClientRect();

        return frame.id === 'game_frame' ||
          /kancolle|osapi|gadgets/.test(src.toLowerCase()) ||
          /game.?frame|kancolle/.test(idAndName) ||
          (rect.width >= 1000 && rect.height >= 600);
      });

      if (!gameFrame) return false;

      gameFrame.setAttribute(marker, 'true');
      return true;
    };

    // DMM 側がログイン確認後などに iframe を生成・交換しても固定を維持する。
    if (!window.__kancolleFrameObserver) {
      window.__kancolleFrameObserver = new MutationObserver(pinFrame);
      window.__kancolleFrameObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    return pinFrame();
  })()
`;

// ゲーム開始画面左上の公式 X フォローボタンだけを隠す。ゲーム本体は
// cross-origin iframe 内にあるため、読み込まれた各フレーム内で適用する。
const HIDE_GAME_SOCIAL_LINK_SCRIPT = `
  (() => {
    const hideSocialLink = () => {
      const selectors = [
        'iframe[src*="twitter.com"]',
        'iframe[src*="x.com"]',
        'a[href*="twitter.com"]',
        'a[href*="x.com"]'
      ];

      document.querySelectorAll(selectors.join(',')).forEach(element => {
        const rect = element.getBoundingClientRect();
        if (rect.top < 80 && rect.left < 320) {
          element.style.setProperty('display', 'none', 'important');
        }
      });
    };

    hideSocialLink();
    if (!window.__kancolleSocialLinkObserver) {
      window.__kancolleSocialLinkObserver = new MutationObserver(hideSocialLink);
      window.__kancolleSocialLinkObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  })()
`;

function isKancolleGameUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    const isCurrentGamePage =
      (url.hostname === 'games.dmm.com' ||
        url.hostname.endsWith('.games.dmm.com')) &&
      url.pathname.toLowerCase().includes('kancolle');

    const isLegacyGamePage =
      url.hostname === 'www.dmm.com' &&
      url.pathname.includes('/netgame/social/-/gadgets/=');

    return isCurrentGamePage || isLegacyGamePage;
  } catch {
    return false;
  }
}

function setupGamePageCss(view) {
  if (!view) return;

  const applyGamePageLayout = async () => {
    const currentUrl = view.webContents.getURL();

    // ログイン画面など、艦これのゲームページ以外には適用しない。
    // DMM の現行URLと、リダイレクト移行期間中の旧URLの両方に対応する。
    if (!isKancolleGameUrl(currentUrl)) return;

    try {
      await view.webContents.insertCSS(GAME_PAGE_CSS, {
        cssOrigin: 'user'
      });
      const pinned = await view.webContents.executeJavaScript(
        PIN_GAME_FRAME_SCRIPT,
        true
      );
      console.log(
        pinned
          ? '[Game Layout] ゲーム iframe を左上へ固定しました'
          : '[Game Layout] ゲーム iframe の読み込みを待っています'
      );
    } catch (err) {
      // DMM 側の変更などで失敗しても、ゲームページ自体の表示は継続する。
      console.warn('[Game CSS] CSS の適用に失敗しました:', err.message);
    }
  };

  view.webContents.on('did-finish-load', applyGamePageLayout);

  view.webContents.on(
    'did-frame-finish-load',
    async (event, isMainFrame, frameProcessId, frameRoutingId) => {
      if (isMainFrame) return;

      const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
      if (!frame) return;

      try {
        await frame.executeJavaScript(HIDE_GAME_SOCIAL_LINK_SCRIPT);
      } catch (err) {
        // ナビゲーション直後にフレームが破棄された場合は次の load で再適用する。
        console.warn('[Game Layout] X リンクの非表示を再試行します:', err.message);
      }
    }
  );

  // 親ページの load 完了後に iframe が遅延生成される場合にも追従する。
  view.webContents.on('dom-ready', () => {
    [250, 1000, 3000].forEach(delay => {
      setTimeout(applyGamePageLayout, delay);
    });
  });
}

module.exports = { setupGamePageCss };
