/*
 * ゲーム画面と音声の録画フローを管理するカスタムフック。
 * MediaRecorderの開始・停止、Electronへのチャンク送信、WebM保存、進行状態と結果表示を担当する。
 */
import { useEffect, useRef, useState } from 'react';

const RECORDING_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

function useRecording() {
  const [recordingState, setRecordingState] = useState('idle');
  const [recordingStatus, setRecordingStatus] = useState('');
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const recorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const chunkSequenceRef = useRef(0);
  const chunkQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    if (!recordingStatus.startsWith('保存しました:')) return undefined;

    const timer = setTimeout(() => {
      setRecordingStatus('');
    }, 5000);
    return () => clearTimeout(timer);
  }, [recordingStatus]);

  const toggleRecording = async () => {
    if (recordingState === 'recording') {
      setRecordingState('saving');
      setRecordingStatus('保存中...');
      recorderRef.current?.stop();
      return;
    }
    if (recordingState !== 'idle' || !window.electronAPI?.startRecordingFile) return;

    setRecordingState('preparing');
    setRecordingStatus('録画を準備中...');
    let filePrepared = false;
    try {
      const mimeType = RECORDING_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('この環境ではWebM形式の録画に対応していません。');

      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1200, height: 720, frameRate: 30 }
      });
      recordingStreamRef.current = stream;
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

      const recorder = new MediaRecorder(stream, { mimeType });
      let recordingError = null;
      recorderRef.current = recorder;
      chunkSequenceRef.current = 0;
      chunkQueueRef.current = Promise.resolve();

      recorder.addEventListener('dataavailable', event => {
        if (!event.data.size) return;
        const sequence = chunkSequenceRef.current++;
        chunkQueueRef.current = chunkQueueRef.current.then(async () => {
          if (recordingError) return;
          const bytes = new Uint8Array(await event.data.arrayBuffer());
          const result = await window.electronAPI.appendRecordingChunk(sequence, bytes);
          if (!result.success) throw new Error(result.error);
        }).catch(error => {
          recordingError = error;
          if (recorder.state !== 'inactive') recorder.stop();
        });
      });

      recorder.addEventListener('error', event => {
        recordingError = event.error || new Error('録画中にエラーが発生しました。');
        if (recorder.state !== 'inactive') recorder.stop();
      });

      recorder.addEventListener('stop', async () => {
        setRecordingState('saving');
        setRecordingStatus('保存中...');
        stream.getTracks().forEach(track => track.stop());
        try {
          await chunkQueueRef.current;
          if (recordingError) {
            await window.electronAPI.abortRecordingFile();
            throw recordingError;
          }
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
        } catch (error) {
          setRecordingStatus(`録画保存失敗: ${error.message}`);
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
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
      recorderRef.current = null;
      if (filePrepared) {
        try {
          await window.electronAPI.abortRecordingFile();
        } catch (cleanupError) {
          console.error('録画開始失敗後の後始末に失敗しました:', cleanupError);
        }
      }
      setRecordingState('idle');
      setRecordingStatus(`録画開始失敗: ${error.message}`);
    }
  };

  return {
    recordingStartedAt,
    recordingState,
    recordingStatus,
    toggleRecording
  };
}

export default useRecording;
