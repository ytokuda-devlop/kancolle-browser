import React, { useState, useEffect, useRef } from 'react';
import {
  formatElapsedTime,
  formatRemainingTime,
  formatSortieNode
} from './utils/formatters';
import {
  getFleetSakuteki,
  getFleetSeiku,
  getFleetTotalLevel,
  getShipSeiku,
  getShipTotalAircraft
} from './utils/fleetCalculations';
import {
  getAircraftCountClass,
  getCondClass,
  getHpFillClass,
  getLengText,
  getSokuText
} from './utils/shipDisplay';

function App() {
  const [fleetData, setFleetData] = useState([]);
  const [ndockData, setNdockData] = useState([]);
  const [kdockData, setKdockData] = useState([]);
  const [questData, setQuestData] = useState([]);
  const [sortieData, setSortieData] = useState(null);
  const [materialData, setMaterialData] = useState({
    fuel: 0,
    ammo: 0,
    steel: 0,
    bauxite: 0,
    devco: 0,
    screw: 0,
    bucket: 0,
    burner: 0,
    mamiya: 0,
    irako: 0,
    shipCount: 0,
    maxShips: 0,
    slotItemCount: 0,
    maxSlotItems: 0
  });
  const [selectedFleetId, setSelectedFleetId] = useState(1);
  const [screenshotStatus, setScreenshotStatus] = useState('');
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [recordingState, setRecordingState] = useState('idle');
  const [recordingStatus, setRecordingStatus] = useState('');
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const recorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const chunkSequenceRef = useRef(0);
  const chunkQueueRef = useRef(Promise.resolve());
  const [pointActionStatus, setPointActionStatus] = useState('');
  const [pendingPointAction, setPendingPointAction] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // 1秒毎に現在時刻を更新してカウントダウンを描画する
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!screenshotStatus || screenshotStatus === '保存中...') return;

    const timer = setTimeout(() => {
      setScreenshotStatus('');
    }, 5000);
    return () => clearTimeout(timer);
  }, [screenshotStatus]);

  useEffect(() => {
    if (!recordingStatus.startsWith('保存しました:')) return;

    const timer = setTimeout(() => {
      setRecordingStatus('');
    }, 5000);
    return () => clearTimeout(timer);
  }, [recordingStatus]);

  useEffect(() => {
    if (window.electronAPI) {
      // 艦隊データのリアルタイム受信
      const unsubscribeFleet = window.electronAPI.onFleetData((data) => {
        if (data && data.length > 0) {
          setFleetData(data);
        }
      });

      // 入渠ドックデータのリアルタイム受信
      const unsubscribeNdock = window.electronAPI.onNdockData((data) => {
        if (data) {
          setNdockData(data);
        }
      });

      // 建造ドックデータのリアルタイム受信
      const unsubscribeKdock = window.electronAPI.onKdockData((data) => {
        if (data) {
          setKdockData(data);
        }
      });

      // 進行中任務データのリアルタイム受信
      const unsubscribeQuest = window.electronAPI.onQuestData((data) => {
        if (data) {
          setQuestData(data);
        }
      });

      // 資材データのリアルタイム受信
      const unsubscribeMaterial = window.electronAPI.onMaterialData((data) => {
        if (data) {
          setMaterialData(data);
        }
      });

      const unsubscribeSortie = window.electronAPI.onSortieData((data) => {
        setSortieData(data || null);
      });

      // 初期データ要求
      window.electronAPI.getFleetData();
      window.electronAPI.getNdockData();
      window.electronAPI.getKdockData();
      window.electronAPI.getQuestData();
      window.electronAPI.getMaterialData();
      window.electronAPI.getSortieData();

      return () => {
        if (unsubscribeFleet) unsubscribeFleet();
        if (unsubscribeNdock) unsubscribeNdock();
        if (unsubscribeKdock) unsubscribeKdock();
        if (unsubscribeQuest) unsubscribeQuest();
        if (unsubscribeMaterial) unsubscribeMaterial();
        if (unsubscribeSortie) unsubscribeSortie();
      };
    }
  }, []);

  const currentFleets = fleetData;
  const currentFleet = currentFleets.find(f => f.id === selectedFleetId) || { id: selectedFleetId, name: `第${selectedFleetId}艦隊`, ships: [] };
  const currentNdocks = ndockData;
  const currentKdocks = kdockData;

  // 艦隊全体のサマリー計算
  const shipsList = currentFleet.ships || [];
  const totalLv = getFleetTotalLevel(shipsList);
  const totalSakuteki = getFleetSakuteki(shipsList);
  const totalSeiku = getFleetSeiku(shipsList);

  const handleScreenshot = async () => {
    if (!window.electronAPI?.captureScreenshot || isCapturingScreenshot) return;

    setIsCapturingScreenshot(true);
    setScreenshotStatus('保存中...');
    try {
      const result = await window.electronAPI.captureScreenshot();
      setScreenshotStatus(result.success ? `保存しました: ${result.path}` : `保存失敗: ${result.error}`);
    } catch (err) {
      setScreenshotStatus(`保存失敗: ${err.message}`);
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const handleRecording = async () => {
    if (recordingState === 'recording') {
      setRecordingState('converting');
      setRecordingStatus('MP4へ変換中...');
      recorderRef.current?.stop();
      return;
    }
    if (recordingState !== 'idle' || !window.electronAPI?.startRecordingFile) return;

    setRecordingStatus('録画を準備中...');
    let filePrepared = false;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1200, height: 720, frameRate: 30 }
      });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('ゲーム音声トラックを取得できませんでした。');
      }

      const prepared = await window.electronAPI.startRecordingFile();
      if (!prepared.success) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error(prepared.error);
      }
      filePrepared = true;

      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunkSequenceRef.current = 0;
      chunkQueueRef.current = Promise.resolve();

      recorder.addEventListener('dataavailable', event => {
        if (!event.data.size) return;
        const sequence = chunkSequenceRef.current++;
        chunkQueueRef.current = chunkQueueRef.current.then(async () => {
          const bytes = new Uint8Array(await event.data.arrayBuffer());
          const result = await window.electronAPI.appendRecordingChunk(sequence, bytes);
          if (!result.success) throw new Error(result.error);
        });
      });

      recorder.addEventListener('stop', async () => {
        stream.getTracks().forEach(track => track.stop());
        try {
          await chunkQueueRef.current;
          const result = await window.electronAPI.finishRecordingFile();
          if (result.canceled) {
            setRecordingStatus('録画の保存をキャンセルしました。');
            return;
          }
          if (!result.success) {
            const recovery = result.recoveryPath ? ` 一時ファイル: ${result.recoveryPath}` : '';
            throw new Error(`${result.error}${recovery}`);
          }
          setRecordingStatus(`保存しました: ${result.path}`);
        } catch (err) {
          setRecordingStatus(`録画保存失敗: ${err.message}`);
        } finally {
          recorderRef.current = null;
          recordingStreamRef.current = null;
          setRecordingStartedAt(0);
          setRecordingState('idle');
        }
      }, { once: true });

      recorder.start(1000);
      setRecordingStartedAt(Date.now());
      setRecordingState('recording');
      setRecordingStatus('ゲーム音声付きで録画中');
    } catch (err) {
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
      if (filePrepared) await window.electronAPI.abortRecordingFile();
      setRecordingState('idle');
      setRecordingStatus(`録画開始失敗: ${err.message}`);
    }
  };

  const handlePointAction = async (action) => {
    if (!window.electronAPI?.openDmmPointPage || pendingPointAction) return;

    setPendingPointAction(action);
    setPointActionStatus('');
    try {
      const result = await window.electronAPI.openDmmPointPage(action);
      if (!result.success) {
        setPointActionStatus(result.error || 'ポイント画面を開けませんでした。');
      }
    } catch (err) {
      setPointActionStatus(`ポイント画面を開けませんでした: ${err.message}`);
    } finally {
      setPendingPointAction('');
    }
  };

  // 熟練度（alv）の記章を CSS で描画する
  const getAlvDisplay = (alv) => {
    if (!alv || alv <= 0) return null;

    const normalizedAlv = Math.min(Math.max(alv, 1), 7);
    const variant =
      normalizedAlv <= 3 ? "bars" :
        normalizedAlv <= 6 ? "slashes" :
          "chevrons";
    const markCount =
      normalizedAlv <= 3 ? normalizedAlv :
        normalizedAlv <= 6 ? normalizedAlv - 3 :
          2;

    return (
      <span
        className={`slot-alv alv-${variant}`}
        title={`熟練度 ${alv}`}
        role="img"
        aria-label={`熟練度 ${alv}`}
      >
        {Array.from({ length: markCount }, (_, index) => (
          <span key={index} className="alv-mark" aria-hidden="true" />
        ))}
      </span>
    );
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

          {/* 下部情報パネル（資材・遠征・ドック・任務） */}
          <div className="bottom-panel">
            {/* カラム1 (左): 遠征 (上) + 資材 (下) */}
            <div className="bottom-panel-main-col">
              {/* 遠征 */}
              <div className="bottom-panel-col mission-col">
                <div className="panel-col-header">遠征</div>
                <div className="panel-col-content">
                  {currentFleets.filter(f => f.id > 1).map(f => {
                    const mission = f.mission || { status: 0, name: "" };
                    const hasMission = mission.status > 0;
                    const remaining = hasMission ? formatRemainingTime(mission.completeTime, now) : "---";
                    const isFinished = remaining === "完了";

                    return (
                      <div key={f.id} className="panel-row">
                        <span className="row-label mission-fleet-label">
                          {`第${["", "１", "２", "３", "４"][f.id]}艦隊`}：
                        </span>
                        <span className="row-time" style={{
                          color: isFinished ? 'var(--success-color)' : (hasMission ? 'var(--accent-color)' : 'var(--bottom-text-secondary)')
                        }}>
                          {remaining}
                        </span>
                        <span
                          className={`row-desc ${hasMission ? 'is-active' : ''}`}
                          title={hasMission ? mission.name : "母港にいます"}
                          style={{
                            color: hasMission
                              ? 'var(--text-primary)'
                              : 'var(--bottom-text-secondary)'
                          }}
                        >
                          {hasMission ? (mission.name || `遠征 ID:${mission.missionId}`) : "母港にいます"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 資材 */}
              <div className="bottom-panel-col material-col">
                <div className="panel-col-header">資材</div>
                <div className="panel-col-content">
                  <div className="material-grid">
                    <div className="material-item">
                      <span className="material-label mat-fuel">油</span>
                      <span className="material-value">{materialData.fuel.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-steel">鉄</span>
                      <span className="material-value">{materialData.steel.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-ammo">弾</span>
                      <span className="material-value">{materialData.ammo.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-bauxite">ボーキ</span>
                      <span className="material-value">{materialData.bauxite.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-devco">開発資材</span>
                      <span className="material-value">{materialData.devco.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-screw">改修資材</span>
                      <span className="material-value">{materialData.screw.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-bucket">バケツ</span>
                      <span className="material-value">{materialData.bucket.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-burner">バーナー</span>
                      <span className="material-value">{materialData.burner.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-mamiya">間宮</span>
                      <span className="material-value">{materialData.mamiya.toLocaleString()}</span>
                    </div>
                    <div className="material-item">
                      <span className="material-label mat-irako">伊良湖</span>
                      <span className="material-value">{materialData.irako.toLocaleString()}</span>
                    </div>
                    <div className="material-item capacity-item">
                      <span className="capacity-label">保有艦娘数</span>
                      <span className="material-value">{materialData.shipCount.toLocaleString()}/{materialData.maxShips.toLocaleString()}</span>
                    </div>
                    <div className="material-item capacity-item">
                      <span className="capacity-label">保有装備数</span>
                      <span className="material-value">{materialData.slotItemCount.toLocaleString()}/{materialData.maxSlotItems.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* カラム2 (中央): 入渠ドック (上) + 建造ドック (下) */}
            <div className="bottom-panel-main-col">
              {/* 入渠情報 */}
              <div className="bottom-panel-col ndock-col">
                <div className="panel-col-header">入渠</div>
                <div className="panel-col-content">
                  {currentNdocks && currentNdocks.length > 0 ? (
                    currentNdocks.map(d => {
                      const isRepairing = d.state === 1;
                      const remaining = isRepairing ? formatRemainingTime(d.completeTime, now) : "---";
                      const isFinished = remaining === "完了";

                      let stateText = "空いてます";
                      if (d.state === -1) stateText = "未開放";
                      else if (isRepairing) stateText = d.shipName;

                      return (
                        <div key={d.id} className="panel-row">
                          <span className="row-label">
                            第{["", "１", "２", "３", "４"][d.id] || d.id}ドック：
                          </span>
                          <span className="row-time" style={{
                            color: isFinished ? 'var(--success-color)' : (isRepairing ? 'var(--danger-color)' : 'var(--bottom-text-secondary)')
                          }}>
                            {remaining}
                          </span>
                          <span
                            className={`row-desc ${isRepairing ? 'is-active' : ''}`}
                            title={stateText}
                            style={{
                              color: isRepairing
                                ? 'var(--text-primary)'
                                : 'var(--bottom-text-secondary)'
                            }}
                          >
                            {stateText}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    null
                  )}
                </div>
              </div>

              {/* 建造ドック情報 */}
              <div className="bottom-panel-col kdock-col">
                <div className="panel-col-header">建造</div>
                <div className="panel-col-content">
                  {currentKdocks && currentKdocks.length > 0 ? (
                    currentKdocks.map(d => {
                      const isLocked = d.state === -1;
                      const isEmpty = d.state === 0;
                      const isComplete =
                        d.state === 3 ||
                        (d.state > 0 && d.completeTime > 0 && d.completeTime <= now);
                      const isBuilding = d.state > 0 && !isComplete;
                      const remaining = isComplete
                        ? "完了"
                        : isBuilding
                          ? formatRemainingTime(d.completeTime, now)
                          : "---";

                      let stateText = "空いてます";
                      if (isLocked) stateText = "未開放";
                      else if (isComplete) stateText = "受取待ち";
                      else if (isBuilding) stateText = "建造中";

                      return (
                        <div key={d.id} className="panel-row">
                          <span className="row-label">
                            第{["", "１", "２", "３", "４"][d.id] || d.id}ドック：
                          </span>
                          <span
                            className="row-time"
                            style={{
                              color: isComplete
                                ? 'var(--success-color)'
                                : isBuilding
                                  ? 'var(--accent-color)'
                                  : 'var(--bottom-text-secondary)'
                            }}
                          >
                            {remaining}
                          </span>
                          <span
                            className={`row-desc ${isBuilding ? 'is-active' : ''}`}
                            title={stateText}
                            style={{
                              color: isEmpty || isLocked
                                ? 'var(--bottom-text-secondary)'
                                : 'var(--text-primary)'
                            }}
                          >
                            {stateText}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    null
                  )}
                </div>
              </div>
            </div>

            {/* カラム3 (右): 出撃海域 (上) + 進行中任務 (下) */}
            <div className="bottom-panel-main-col">
              <div className="bottom-panel-col sortie-col">
                <div className="panel-col-header">出撃海域</div>
                <div className="panel-col-content sortie-content">
                  {sortieData ? (
                    <>
                      <div className="sortie-heading">
                        <span className="sortie-fleet">第{sortieData.deckId || '?'}艦隊</span>
                        {sortieData.isEvent && <span className="sortie-event-badge">イベント</span>}
                      </div>
                      <div className="sortie-map" title={`${sortieData.areaName} ${sortieData.mapName}`}>
                        <span className="sortie-map-code">
                          {sortieData.isEvent
                            ? `E-${sortieData.mapInfoNo}`
                            : `${sortieData.mapAreaId}-${sortieData.mapInfoNo}`}
                        </span>
                        <span className="sortie-map-name">
                          {sortieData.mapName || sortieData.areaName || '海域名取得中'}
                        </span>
                      </div>
                      <div className="sortie-position">
                        現在：{formatSortieNode(sortieData, sortieData.cellNo)}
                        {sortieData.bossCellNo > 0 && ` / ボス：${formatSortieNode(sortieData, sortieData.bossCellNo)}`}
                      </div>
                      {sortieData.eventMap?.maxHp > 0 && (
                        <div className="sortie-gauge">
                          ゲージ：{sortieData.eventMap.nowHp.toLocaleString()} / {sortieData.eventMap.maxHp.toLocaleString()}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="sortie-empty">出撃していません</div>
                  )}
                </div>
              </div>

              <div className="bottom-panel-col quest-col">
                <div className="panel-col-header">進行中任務</div>
                <div className="panel-col-content">
                  {questData.map(quest => (
                    <div key={quest.id} className="quest-row" title={quest.name}>
                      <span className="quest-name">{quest.name}</span>
                      <span className="quest-progress-rate">{quest.progress}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：艦隊情報パネルと追加機能領域 */}
        <aside className="right-content">
          <div className="fleet-panel">
            <div className="fleet-header">
              <div className="fleet-selector-group">
                {[1, 2, 3, 4].map(id => (
                  <button
                    key={id}
                    type="button"
                    className={`fleet-tab-button ${selectedFleetId === id ? 'active' : ''}`}
                    onClick={() => setSelectedFleetId(id)}
                  >
                    第{id}艦隊
                  </button>
                ))}
              </div>
              <div className="fleet-summary">
                <span className="fleet-summary-item">Lv.合計: <span className="fleet-summary-val">{totalLv}</span></span>
                <span className="fleet-summary-item">索敵: <span className="fleet-summary-val">{totalSakuteki}</span></span>
                <span className="fleet-summary-item">制空: <span className="fleet-summary-val">{totalSeiku}</span></span>
              </div>
            </div>

            <div className="fleet-grid">
              {fleetData.length === 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.95rem',
                  gap: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  height: '100%'
                }}>
                  <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--accent-color)' }}></div>
                  <div>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-color)', display: 'block', marginBottom: '4px' }}>ゲームデータ受信待ち</span>
                    艦これにログインし、母港画面を表示すると艦隊データがここに反映されます。
                  </div>
                </div>
              ) : (currentFleet.ships && currentFleet.ships.length > 0) ? (
                <>
                  {currentFleet.ships.map((ship, idx) => {
                    const isTaiha = ship.nowhp / ship.maxhp <= 0.25;
                    return (
                      <div key={ship.id} className={`ship-card ${isTaiha ? 'ship-card-taiha' : ''}`}>
                        <div className="ship-header">
                          <div className="ship-identity">
                            <span className="ship-num">{idx + 1}</span>
                            <span className="ship-name" title={ship.name}>{ship.name}</span>
                          </div>
                          <span className="ship-lv">Lv.{ship.lv}</span>

                          <div className="ship-hp-section">
                            <div className="ship-hp-bar">
                              <div
                                className={`ship-hp-fill ${getHpFillClass(ship.nowhp, ship.maxhp)}`}
                                style={{ width: `${(ship.nowhp / ship.maxhp) * 100}%` }}
                              ></div>
                            </div>
                            <span className="ship-hp-text">{ship.nowhp}/{ship.maxhp}</span>
                          </div>

                          <span className={`ship-cond ${getCondClass(ship.cond)}`} title="コンディション">
                            {ship.cond}
                          </span>
                        </div>

                        <div className="ship-body">
                          {/* パラメータリスト (左側) */}
                          <div className="ship-stats">
                            <div className="stat-item"><span>火力</span><span className="stat-val">{ship.karyoku}</span></div>
                            <div className="stat-item"><span>回避</span><span className="stat-val">{ship.kaihi}</span></div>
                            <div className="stat-item"><span>雷装</span><span className="stat-val">{ship.raisou}</span></div>
                            <div className="stat-item"><span>対潜</span><span className="stat-val">{ship.taisen}</span></div>
                            <div className="stat-item"><span>対空</span><span className="stat-val">{ship.taiku}</span></div>
                            <div className="stat-item"><span>索敵</span><span className="stat-val">{ship.sakuteki}</span></div>
                            <div className="stat-item"><span>装甲</span><span className="stat-val">{ship.soukou}</span></div>
                            <div className="stat-item"><span>運</span><span className="stat-val">{ship.lucky}</span></div>
                            <div className="stat-item"><span>搭載</span><span className="stat-val">{getShipTotalAircraft(ship)}</span></div>
                            <div className="stat-item"><span>制空</span><span className="stat-val">{getShipSeiku(ship)}</span></div>
                            <div className="stat-item"><span>速力</span><span className="stat-val" style={{ fontSize: '0.65rem' }}>{getSokuText(ship.soku)}</span></div>
                            <div className="stat-item"><span>射程</span><span className="stat-val" style={{ fontSize: '0.65rem' }}>{getLengText(ship.leng)}</span></div>
                          </div>

                          {/* 装備リスト (右側) */}
                          <div className="ship-slots">
                            {ship.slots && ship.slots.length > 0 ? (
                              ship.slots.map((slot, sIdx) => (
                                <div
                                  key={slot.id || sIdx}
                                  className={`slot-item ${slot.isExpansion ? 'slot-item-expansion' : ''}`}
                                  title={slot.isExpansion ? `補強増設: ${slot.name}` : slot.name}
                                >
                                  <span className="slot-name">{slot.name}</span>
                                  <span className="slot-meta">
                                    {slot.level > 0 && (
                                      <span className="slot-level" title={`改修値 ${slot.level}`}>★+{slot.level}</span>
                                    )}
                                    {slot.isAircraft && slot.alv > 0 && getAlvDisplay(slot.alv)}
                                    {slot.isAircraft && (
                                      <span
                                        className={`slot-aircraft ${getAircraftCountClass(slot)}`}
                                        title={`搭載数 ${slot.currentAircraft}/${slot.maxAircraft}`}
                                      >
                                        {slot.currentAircraft}/{slot.maxAircraft}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="slot-item" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>未装備</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {shipsList.length < 6 && Array.from({ length: 6 - shipsList.length }, (_, idx) => (
                    <div
                      key={`empty-${idx}`}
                      className="ship-card ship-card-empty"
                      aria-hidden="true"
                    />
                  ))}
                </>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  height: '100%',
                  padding: '20px'
                }}>
                  艦隊に編成されている艦娘がいません。
                </div>
              )}
            </div>
          </div>

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
                onClick={handleScreenshot}
                disabled={isCapturingScreenshot}
              >
                {isCapturingScreenshot && <span className="button-spinner" aria-hidden="true" />}
                {isCapturingScreenshot ? '保存中' : 'キャプチャ'}
              </button>
              <button
                className={`browser-control-button browser-control-recording ${recordingState === 'recording' ? 'is-recording' : ''}`}
                onClick={handleRecording}
                disabled={recordingState === 'converting'}
              >
                {recordingState === 'converting'
                  ? 'MP4変換中...'
                  : recordingState === 'recording'
                    ? `録画停止 ${formatElapsedTime(recordingStartedAt, now)}`
                    : '録画'}
              </button>
            </div>
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
            {recordingStatus && (
              <div className="control-status recording-status" title={recordingStatus}>
                {recordingStatus}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
