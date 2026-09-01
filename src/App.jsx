import React, { useState, useEffect, useRef } from 'react';
import BottomPanel from './components/bottom/BottomPanel';
import FleetPanel from './components/fleet/FleetPanel';
import { formatElapsedTime } from './utils/formatters';

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
