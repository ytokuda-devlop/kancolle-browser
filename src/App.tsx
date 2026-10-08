import type { DmmPointAction } from '../shared/electronApi';
import React, { useEffect, useState } from 'react';
import BottomPanel from './components/bottom/BottomPanel';
import FleetPanel from './components/fleet/FleetPanel';
import useKancolleData from './hooks/useKancolleData';
import useScreenshot from './hooks/useScreenshot';

function App() {
  const {
    fleetData,
    ndockData,
    kdockData,
    questData,
    sortieData,
    materialData
  } = useKancolleData();
  const {
    captureScreenshot,
    isCapturingScreenshot,
    screenshotStatus
  } = useScreenshot();
  const [shipInfoStatus, setShipInfoStatus] = useState('');
  const openShipInfo = async () => {
    setShipInfoStatus('');
    try {
      const result = await window.electronAPI?.openShipInfo();
      if (result && !result.success) setShipInfoStatus(result.error);
    } catch {
      setShipInfoStatus('艦娘一覧を開けませんでした。');
    }
  };
  const [pointActionStatus, setPointActionStatus] = useState('');
  const [pendingPointAction, setPendingPointAction] = useState<DmmPointAction | ''>('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // 1秒毎に現在時刻を更新してカウントダウンを描画する
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const handlePointAction = async (action: DmmPointAction) => {
    if (!window.electronAPI?.openDmmPointPage || pendingPointAction) return;

    setPendingPointAction(action);
    setPointActionStatus('');
    try {
      const result = await window.electronAPI.openDmmPointPage(action);
      if (!result.success) {
        setPointActionStatus(result.error || 'ポイント画面を開けませんでした。');
      }
    } catch (err) {
      setPointActionStatus(`ポイント画面を開けませんでした: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPendingPointAction('');
    }
  };

  return (
    <div className="app-container">
      {/* メインの表示コンテンツエリア */}
      <main className="main-content">
        {/* 左側：ゲーム画面（上）と下部情報パネル（下） */}
        <div className="left-content">
          <div id="game-container" className="game-area">
            <div className="game-placeholder-text">
              <div className="spinner"></div>
              <span>艦これのゲーム画面を読み込んでいます...</span>
            </div>
          </div>

          <BottomPanel
            fleets={fleetData}
            materials={materialData}
            ndocks={ndockData}
            kdocks={kdockData}
            quests={questData}
            sortie={sortieData}
            now={now}
          />
        </div>

        {/* 右側：艦隊情報パネルと追加機能領域 */}
        <aside className="right-content">
          <FleetPanel fleets={fleetData} />

          {/* 艦隊情報の下に、今後の機能を追加するための領域 */}
          <section className="right-feature-panel">
            <div className="browser-controls browser-controls-actions">
              <button
                className="browser-control-button browser-control-point-charge"
                onClick={() => handlePointAction('charge')}
                disabled={Boolean(pendingPointAction)}
              >
                {pendingPointAction === 'charge' ? '確認中' : 'ポイントをチャージ'}
              </button>
              <button
                className={`browser-control-button browser-control-screenshot ${isCapturingScreenshot ? 'is-loading' : ''}`}
                onClick={captureScreenshot}
                disabled={isCapturingScreenshot}
              >
                {isCapturingScreenshot && <span className="button-spinner" aria-hidden="true" />}
                {isCapturingScreenshot ? '保存中' : 'キャプチャ'}
              </button>
              <button className="browser-control-button browser-control-ship-info" onClick={openShipInfo}>
                艦娘一覧
              </button>
            </div>
            {shipInfoStatus && <div className="control-status control-status-error">{shipInfoStatus}</div>}
            {pointActionStatus && (
              <div className="control-status control-status-error" title={pointActionStatus}>
                {pointActionStatus}
              </div>
            )}
            {screenshotStatus && (
              <div className="control-status screenshot-status" title={screenshotStatus}>
                {screenshotStatus}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
