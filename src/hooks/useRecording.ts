import { useEffect, useRef, useState } from 'react';
import type { RecordingState } from '../../shared/electronApi';

// Encoding and capture take place in the OS-native helper, not MediaRecorder.
export default function useRecording() {
  const [state, setState] = useState<RecordingState>({ phase: 'idle', startedAt: null, status: '' });
  const pending = useRef(false);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    let live = true;
    let received = false;
    const unsubscribe = api.onRecordingState(next => { received = true; if (live) setState(next); });
    void api.getRecordingState().then(next => { if (live && !received) setState(next); }).catch(error => {
      if (live) setState(current => ({ ...current, status: `録画状態を取得できません: ${String(error)}` }));
    });
    return () => { live = false; unsubscribe(); };
  }, []);
  const toggleRecording = async () => {
    const api = window.electronAPI;
    if (!api || pending.current || state.phase === 'starting' || state.phase === 'saving') return;
    pending.current = true;
    try {
      const result = state.phase === 'recording' ? await api.finishRecording(false) : await api.beginRecording();
      if (!result.success) setState(current => ({ ...current, status: `録画失敗: ${result.error}` }));
    } catch (error) {
      setState(current => ({ ...current, status: `録画失敗: ${error instanceof Error ? error.message : String(error)}` }));
    } finally { pending.current = false; }
  };
  return { ...state, toggleRecording };
}
