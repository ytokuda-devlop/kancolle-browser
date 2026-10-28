import { app, ipcMain } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, link, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { RecordingResult, RecordingState, ScreenshotResult } from '../../shared/electronApi';
import runtime = require('../runtime');

interface NativeRecording {
  child: ChildProcessWithoutNullStreams;
  temporaryDirectory: string;
  source: string;
  destination: string;
  ready: Promise<void>;
  exited: Promise<{ code: number | null; error: string }>;
  finished: boolean;
}
let recording: NativeRecording | null = null;
let state: RecordingState = { phase: 'idle', startedAt: null, status: '' };
let startTask: Promise<RecordingResult> | null = null;
let finishTask: Promise<ScreenshotResult> | null = null;
let closing = false;
let quitting = false;
app.on('before-quit', () => { quitting = true; });

function authorize(event: IpcMainInvokeEvent): void {
  if (event.sender !== runtime.mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('録画操作はメイン画面からのみ実行できます。');
  }
}
function publish(update: Partial<RecordingState>): void {
  state = { ...state, ...update };
  const contents = runtime.mainWindow?.webContents;
  if (contents && !contents.isDestroyed()) contents.send('game:recording-state', state);
}
const failure = (error: unknown): { success: false; error: string } => ({
  success: false, error: error instanceof Error ? error.message : String(error)
});

function launch(executable: string, config: Record<string, unknown>, temporaryDirectory: string, destination: string): NativeRecording {
  const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let nativeError = '';
  let stderr = '';
  const current: NativeRecording = {
    child, temporaryDirectory, source: String(config.path), destination, ready, finished: false,
    exited: new Promise(resolve => {
      child.on('error', error => { nativeError = error.message; readyReject(error); });
      child.on('close', code => {
        clearTimeout(startTimeout);
        readyReject(new Error(nativeError || stderr || 'OS標準の録画処理が起動前に終了しました。'));
        resolve({ code, error: nativeError || stderr });
        if (recording === current && state.phase === 'recording') void finish(false);
      });
    })
  };
  const startTimeout = setTimeout(() => {
    nativeError = '録画の開始がタイムアウトしました。画面収録の権限を確認してください。';
    readyReject(new Error(nativeError));
    child.kill('SIGKILL');
  }, 120_000);
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
  createInterface({ input: child.stdout }).on('line', line => {
    try {
      const message = JSON.parse(line);
      if (message.event === 'ready') { clearTimeout(startTimeout); readyResolve(); }
      else if (message.event === 'finished') current.finished = true;
      else if (message.event === 'error') { nativeError = String(message.error); readyReject(new Error(nativeError)); }
      else if (message.event === 'diagnostic') console.info('[Native Recording]', message);
    } catch {
      nativeError = '録画プログラムから不正な応答を受信しました。';
      readyReject(new Error(nativeError));
      child.kill('SIGKILL');
    }
  });
  child.stdin.on('error', error => { nativeError ||= error.message; });
  child.stdin.write(`${JSON.stringify(config)}\n`);
  return current;
}

async function begin(): Promise<RecordingResult> {
  publish({ phase: 'starting', status: '', startedAt: null });
  let temporaryDirectory: string | undefined;
  try {
    const windows = process.platform === 'win32';
    if (!windows && process.platform !== 'darwin') throw new Error('OS標準録画はmacOSとWindows 11に対応しています。');
    const [major, minor, build] = process.getSystemVersion().split('.').map(Number);
    if (windows ? major < 10 || (major === 10 && (!build || build < 22000))
      : major < 14 || (major === 14 && minor < 2)) {
      throw new Error(windows ? 'OS標準録画にはWindows 11以降が必要です。' : 'OS標準録画にはmacOS 14.2以降が必要です。');
    }
    const window = runtime.mainWindow;
    const view = runtime.gameView;
    if (!window || !view || view.webContents.isDestroyed()) throw new Error('ゲーム画面を取得できません。');
    if (window.isMinimized()) throw new Error('最小化を解除してから録画を開始してください。');
    const filename = windows ? 'KancolleRecorder.exe' : 'KancolleRecorder';
    const executable = app.isPackaged
      ? path.join(process.resourcesPath, 'native', filename)
      : path.join(app.getAppPath(), 'dist-native', process.platform, filename);
    await access(executable, constants.X_OK);
    const bounds = window.getBounds();
    const content = window.getContentBounds();
    const game = view.getBounds();
    if (game.x < 0 || game.y < 0 || game.x + game.width > content.width || game.y + game.height > content.height) {
      throw new Error('ゲーム画面全体がウィンドウ内に収まる大きさにしてから録画してください。');
    }
    const windowID = windows ? 0 : Number(window.getMediaSourceId().split(':')[1]);
    if (!windows && (!Number.isSafeInteger(windowID) || windowID <= 0)) throw new Error('録画対象のウィンドウIDを取得できません。');
    // HWND is passed as a hex string, preserving all pointer bits across JSON.
    const handle = windows ? window.getNativeWindowHandle() : null;
    const windowHandle = handle ? (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString(16) : '';
    const directory = app.getPath('videos');
    await mkdir(directory, { recursive: true });
    temporaryDirectory = await mkdtemp(path.join(directory, '.kancolle-recording-'));
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const destination = path.join(directory, `kancolle-${date}-${time}.mp4`);
    const current = launch(executable, {
      windowID, windowHandle, processID: process.pid,
      x: content.x - bounds.x + game.x,
      y: content.y - bounds.y + game.y,
      width: game.width, height: game.height, path: path.join(temporaryDirectory, 'recording.mp4'),
      audioPIDs: [...new Set([process.pid, ...app.getAppMetrics().map(metric => metric.pid)])]
    }, temporaryDirectory, destination);
    recording = current;
    await current.ready;
    publish({ phase: 'recording', startedAt: Date.now() });
    return { success: true };
  } catch (error) {
    if (recording) { recording.child.kill('SIGKILL'); await recording.exited; recording = null; }
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(console.error);
    const result = failure(error);
    publish({ phase: 'idle', startedAt: null, status: `録画失敗: ${result.error}` });
    return result;
  }
}

async function finalize(discard: boolean): Promise<ScreenshotResult> {
  if (startTask) await startTask;
  const current = recording;
  if (!current) return failure('録画が開始されていません。');
  publish({ phase: 'saving' });
  const timeout = setTimeout(() => current.child.kill('SIGKILL'), 30_000);
  let preserveCompletedMovie = false;
  try {
    if (current.child.exitCode === null && current.child.signalCode === null) current.child.stdin.end(discard ? 'discard\n' : 'stop\n');
    const exit = await current.exited;
    if (!discard && (exit.code !== 0 || !current.finished)) throw new Error(exit.error || 'OS標準の録画処理が正常に終了しませんでした。');
    if (!discard) {
      preserveCompletedMovie = true;
      if (process.platform === 'win32') {
        // Video folders can be on exFAT/network volumes without hard links.
        await copyFile(current.source, current.destination, constants.COPYFILE_EXCL);
      } else await link(current.source, current.destination);
      preserveCompletedMovie = false;
    }
    publish({ phase: 'idle', startedAt: null, status: discard ? '録画を中止しました。' : `保存しました: ${current.destination}` });
    return { success: true, path: current.destination };
  } catch (error) {
    const result = failure(preserveCompletedMovie
      ? `${failure(error).error} 復旧用MP4: ${current.source}` : error);
    publish({ phase: 'idle', startedAt: null, status: `録画失敗: ${result.error}` });
    return result;
  } finally {
    clearTimeout(timeout);
    if (!preserveCompletedMovie) await rm(current.temporaryDirectory, { recursive: true, force: true }).catch(console.error);
    recording = null;
  }
}

function finish(discard: boolean): Promise<ScreenshotResult> {
  finishTask ??= finalize(discard).finally(() => {
    finishTask = null;
    if (closing) setImmediate(() => { if (quitting) app.quit(); else runtime.mainWindow?.close(); });
  });
  return finishTask;
}

ipcMain.handle('game:recording-state', event => { authorize(event); return state; });
ipcMain.handle('game:recording-begin', event => {
  authorize(event);
  if (state.phase !== 'idle' || startTask || finishTask) return failure('すでに録画処理中です。');
  startTask = begin().finally(() => { startTask = null; });
  return startTask;
});
ipcMain.handle('game:recording-finish', (event, discard: boolean) => { authorize(event); return finish(discard === true); });

export function setupRecording(window: BrowserWindow): void {
  closing = false;
  window.on('close', event => {
    if (state.phase === 'idle' && !finishTask && !startTask) return;
    event.preventDefault();
    closing = true;
    void finish(false);
  });
  // A source rectangle is fixed during capture. Save if its geometry changes.
  const stopForGeometryChange = () => {
    if (state.phase === 'recording' || state.phase === 'starting') void finish(false);
  };
  window.on('resize', stopForGeometryChange);
  window.on('minimize', stopForGeometryChange);
  window.on('enter-full-screen', stopForGeometryChange);
  window.on('leave-full-screen', stopForGeometryChange);
  // Native capture survives a UI reload; a destroyed window cannot be recorded.
  window.once('closed', () => { if (recording || startTask) void finish(true); });
}
