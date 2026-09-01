/*
 * Electronのゲーム画面キャプチャ機能を管理するカスタムフック。
 * 保存要求の実行、二重実行の防止、保存中・成功・失敗メッセージとその自動消去を担当する。
 */
import { useEffect, useState } from 'react';

function useScreenshot() {
  const [screenshotStatus, setScreenshotStatus] = useState('');
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);

  useEffect(() => {
    if (!screenshotStatus || screenshotStatus === '保存中...') return undefined;

    const timer = setTimeout(() => {
      setScreenshotStatus('');
    }, 5000);
    return () => clearTimeout(timer);
  }, [screenshotStatus]);

  const captureScreenshot = async () => {
    if (!window.electronAPI?.captureScreenshot || isCapturingScreenshot) return;

    setIsCapturingScreenshot(true);
    setScreenshotStatus('保存中...');
    try {
      const result = await window.electronAPI.captureScreenshot();
      setScreenshotStatus(
        result.success
          ? `保存しました: ${result.path}`
          : `保存失敗: ${result.error}`
      );
    } catch (error) {
      setScreenshotStatus(`保存失敗: ${error.message}`);
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  return {
    captureScreenshot,
    isCapturingScreenshot,
    screenshotStatus
  };
}

export default useScreenshot;
