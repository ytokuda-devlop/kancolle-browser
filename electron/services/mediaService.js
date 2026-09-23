/*
 * ゲーム画面のスクリーンショット保存と録画ファイル作成を担当するモジュール。
 * 録画チャンクの一時保存、FFmpegによるMP4変換、保存ダイアログ、異常時の復旧パスを管理する。
 */
const { app, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const runtime = require('../runtime');

let activeRecording = null;

function formatFileTimestamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('') +
    '-' + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
}

async function createRecordingPaths() {
  // Windowsでは C:\\Users\\<ユーザー名>\\Videos\\Kancolle になる。
  const recordingDirectory = path.join(app.getPath('videos'), 'Kancolle');
  await fs.promises.mkdir(recordingDirectory, { recursive: true });

  const timestamp = formatFileTimestamp(new Date());
  for (let sequence = 0; sequence < 1000; sequence += 1) {
    const suffix = sequence === 0 ? '' : `-${sequence}`;
    const filename = `kancolle-${timestamp}${suffix}.mp4`;
    const destination = path.join(recordingDirectory, filename);
    try {
      await fs.promises.access(destination);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return {
          destination,
          temporary: path.join(app.getPath('temp'), `${filename}.${process.pid}.webm`)
        };
      }
      throw err;
    }
  }
  throw new Error('録画ファイル名を作成できませんでした。');
}

function convertRecordingToMp4(input, output) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('MP4変換用のFFmpegを読み込めませんでした。'));
      return;
    }

    const ffmpeg = spawn(ffmpegPath, [
      '-y', '-i', input,
      // WebFrameMainのWebMは1msのタイムベースを実フレームレートのように
      // 通知することがある。明示的に30fpsへ間引かないと、FFmpegが同一
      // フレームを最大1000fpsまで複製し、再生が実時間に追いつかなくなる。
      '-vf', 'fps=30', '-fps_mode', 'cfr',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', output
    ], { windowsHide: true });
    let errorOutput = '';
    ffmpeg.stderr.on('data', chunk => {
      errorOutput = (errorOutput + chunk.toString()).slice(-8000);
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`MP4変換に失敗しました (FFmpeg ${code}): ${errorOutput}`));
    });
  });
}

// ゲーム画面を Pictures 直下へPNGで保存
ipcMain.handle('game:capture-screenshot', async () => {
  if (!runtime.gameView || runtime.gameView.webContents.isDestroyed()) {
    return { success: false, error: 'ゲーム画面を取得できません。' };
  }

  try {
    const image = await runtime.gameView.webContents.capturePage();
    const png = image.toPNG();
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const timestamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate())
    ].join('') + '-' + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join('');
    const picturesDirectory = app.getPath('pictures');

    await fs.promises.mkdir(picturesDirectory, { recursive: true });

    // 同じ秒に撮影された場合も既存ファイルを上書きしない。
    for (let sequence = 0; sequence < 1000; sequence += 1) {
      const suffix = sequence === 0 ? '' : `-${sequence}`;
      const filename = `kancolle-${timestamp}${suffix}.png`;
      const destination = path.join(picturesDirectory, filename);

      try {
        await fs.promises.writeFile(destination, png, { flag: 'wx' });
        return { success: true, path: destination };
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }

    return { success: false, error: 'スクリーンショットのファイル名を作成できませんでした。' };
  } catch (err) {
    console.error('[Screenshot] 保存に失敗しました:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:recording-start', async () => {
  if (activeRecording) return { success: false, error: 'すでに録画中です。' };
  try {
    const paths = await createRecordingPaths();
    await fs.promises.writeFile(paths.temporary, Buffer.alloc(0), { flag: 'wx' });
    activeRecording = { ...paths, nextSequence: 0 };
    return { success: true };
  } catch (err) {
    console.error('[Recording] 開始準備に失敗しました:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:recording-chunk', async (event, sequence, bytes) => {
  if (!activeRecording) return { success: false, error: '録画が開始されていません。' };
  if (sequence !== activeRecording.nextSequence) {
    return { success: false, error: '録画データの順序が一致しません。' };
  }
  try {
    await fs.promises.appendFile(activeRecording.temporary, Buffer.from(bytes));
    activeRecording.nextSequence += 1;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:recording-stop', async () => {
  if (!activeRecording) return { success: false, error: '録画が開始されていません。' };
  const recording = activeRecording;
  activeRecording = null;
  try {
    const saveResult = await dialog.showSaveDialog(runtime.mainWindow || undefined, {
      title: '録画したゲーム動画を保存',
      defaultPath: recording.destination,
      buttonLabel: '保存',
      filters: [{ name: 'MP4動画', extensions: ['mp4'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });

    if (saveResult.canceled || !saveResult.filePath) {
      await fs.promises.unlink(recording.temporary);
      return { success: false, canceled: true };
    }

    // 拡張子を省略して入力された場合もMP4として保存する。
    const destination = path.extname(saveResult.filePath).toLowerCase() === '.mp4'
      ? saveResult.filePath
      : `${saveResult.filePath}.mp4`;
    await convertRecordingToMp4(recording.temporary, destination);
    await fs.promises.unlink(recording.temporary);
    return { success: true, path: destination };
  } catch (err) {
    console.error('[Recording] MP4保存に失敗しました:', err);
    return {
      success: false,
      error: err.message,
      recoveryPath: recording.temporary
    };
  }
});

ipcMain.handle('game:recording-abort', async () => {
  if (!activeRecording) return { success: true };
  const temporary = activeRecording.temporary;
  activeRecording = null;
  try {
    await fs.promises.unlink(temporary);
  } catch (err) {
    if (err.code !== 'ENOENT') return { success: false, error: err.message };
  }
  return { success: true };
});
