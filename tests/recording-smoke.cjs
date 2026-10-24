// GUIのある環境で実行: env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron tests/recording-smoke.cjs
// ゲームへの接続や実際のビデオフォルダへの書き込みは行わない。
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const { buildSync } = require('esbuild');
const { mkdtempSync, readFileSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
app.setAppPath(root);
const output = mkdtempSync(path.join(tmpdir(), 'kancolle-recording-'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setPath('userData', output);
app.setPath('videos', output);
const timeout = setTimeout(() => { console.error('録画テストがタイムアウトしました'); app.exit(1); }, 150000);
function bundle(contents, platform) {
  return buildSync({
    stdin: { contents, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, platform, format: platform === 'node' ? 'cjs' : 'iife',
    external: platform === 'node' ? ['electron'] : [],
  }).outputFiles[0].text;
}
app.whenReady().then(async () => {
  const implementation = new Module(path.join(root, 'tests/recording-bundle.cjs'), module);
  implementation.filename = path.join(root, 'tests/recording-bundle.cjs');
  implementation.paths = module.paths;
  implementation._compile(bundle(`
    import runtime = require('./electron/runtime');
    export { runtime };
    export { setupRecording } from './electron/services/recordingService';
  `, 'node'), implementation.filename);
  const { runtime, setupRecording } = implementation.exports;
  ipcMain.handle('kancolle:get-map-logs', () => []);
  const window = new BrowserWindow({ width: 640, height: 480, show: true,
    webPreferences: { preload: path.join(root, 'dist-electron/preload.js'), backgroundThrottling: false }
  });
  const game = new WebContentsView({ webPreferences: { backgroundThrottling: false } });
  window.contentView.addChildView(game);
  game.setBounds({ x: 0, y: 0, width: 320, height: 240 });
  runtime.mainWindow = window;
  runtime.gameView = game;
  setupRecording(window);
  await game.webContents.loadURL('data:text/html,' + encodeURIComponent(`<style>html,body{margin:0;overflow:hidden}</style><canvas width="320" height="240"></canvas><script>
    const canvas = document.querySelector('canvas'), context = canvas.getContext('2d');
    setInterval(() => { context.fillStyle = 'rgb(' + Math.floor(Date.now()/10)%255 + ',80,100)'; context.fillRect(0,0,320,240); }, 33);
    const audio = new AudioContext(), oscillator = audio.createOscillator();
    const gain = audio.createGain(); gain.gain.value = 0.01;
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); audio.resume();
  </script>`));
  console.log('Synthetic audio state:', await game.webContents.executeJavaScript(`(async () => { await audio.resume(); return audio.state; })()`, true));
  await window.loadURL('file://' + path.join(root, 'dist/index.html'));
  // 既存Appを使わず、実際の録画フックを小さいテスト用UIに接続する。
  await window.webContents.executeJavaScript(bundle(`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import useRecording from './src/hooks/useRecording';
    function Probe() {
      const recording = useRecording();
      return <div><button id="record-test" onClick={recording.toggleRecording}>record</button>
        <output id="phase">{recording.phase}</output><output id="status">{recording.status}</output></div>;
    }
    const container = document.createElement('div'); document.body.append(container);
    createRoot(container).render(<Probe/>);
  `, 'browser'));
  const waitFor = expression => window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const started = Date.now(); const timer = setInterval(() => {
      if (${expression}) { clearInterval(timer); resolve(true); }
      else if (document.querySelector('#status')?.textContent.startsWith('録画失敗:')) { clearInterval(timer); reject(new Error(document.querySelector('#status').textContent)); }
    else if (Date.now()-started > 125000) { clearInterval(timer); reject(new Error(document.querySelector('#status')?.textContent || 'timeout')); }
    }, 50);
  })`);
  await waitFor(`document.querySelector('#record-test')`);
  // Prove the production hook never uses Chromium's encoders or display capture.
  await window.webContents.executeJavaScript(`window.MediaRecorder = class { constructor() { throw new Error('MediaRecorder must not be used'); } }; navigator.mediaDevices.getDisplayMedia = () => { throw new Error('Chromium capture must not be used'); }; void 0;`);
  await window.webContents.executeJavaScript(`document.querySelector('#record-test').click()`, true);
  await waitFor(`document.querySelector('#phase').textContent === 'recording'`);
  await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 2200))');
  await window.webContents.executeJavaScript(`document.querySelector('#record-test').click()`, true);
  await waitFor(`document.querySelector('#phase').textContent === 'idle'`);
  const status = await window.webContents.executeJavaScript(`document.querySelector('#status').textContent`);
  assert.match(status, /^保存しました:/);
  const files = readdirSync(output).filter(name => name.endsWith('.mp4'));
  assert.equal(files.length, 1);
  const bytes = readFileSync(path.join(output, files[0]));
  assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  assert.ok(bytes.includes(Buffer.from('moov')));
  assert.ok(bytes.includes(Buffer.from('mdat')));
  assert.ok(bytes.includes(Buffer.from('vide')));
  assert.ok(bytes.includes(Buffer.from('soun')));
  assert.equal(readdirSync(output).filter(name => name.startsWith('.kancolle-recording-')).length, 0);
  console.log('PASS: 映像・音声を含むMP4の直接録画と保存', bytes.length, 'bytes', output);
  const playback = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const video = document.createElement('video'); video.muted = true;
    video.src = ${JSON.stringify('file://' + path.join(output, files[0]))};
    video.onerror = () => reject(new Error('保存したMP4を再生できません'));
    video.onloadeddata = async () => {
      await video.play();
      await new Promise(ready => video.requestVideoFrameCallback(ready));
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
      video.pause();
      resolve({width: video.videoWidth, height: video.videoHeight,
        corners: [[5,5],[315,5],[5,235],[315,235]].map(([x,y]) => Array.from(context.getImageData(x,y,1,1).data))});
    };
    document.body.append(video);
  })`);
  assert.ok(playback.width > 0 && playback.height > 0);
  assert.equal(playback.width, 320);
  assert.equal(playback.height, 240);
  console.log('Captured corner pixels:', playback.corners);
  for (const pixel of playback.corners) {
    assert.ok(Math.abs(pixel[1] - 80) < 15 && Math.abs(pixel[2] - 100) < 15, `ゲーム領域の切り出しが不正: ${pixel}`);
  }
  console.log('PASS: 保存したMP4の映像をデコード', playback);
  const audio = await window.webContents.executeJavaScript(`(async () => {
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(new Uint8Array(${JSON.stringify(Array.from(bytes))}).buffer);
      let peak = 0;
      for (const sample of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
      return {channels: buffer.numberOfChannels, duration: buffer.duration, peak};
    } finally { await context.close(); }
  })()`);
  assert.ok(audio.peak > 0.0001, `収録したアプリ音声が無音: ${JSON.stringify(audio)}`);
  console.log('PASS: 収録したAAC音声をデコードして信号を確認', audio);
  const invalidBounds = game.getBounds();
  game.setBounds({ ...invalidBounds, width: 1200 });
  const rejected = await window.webContents.executeJavaScript('window.electronAPI.beginRecording()');
  assert.equal(rejected.success, false);
  assert.match(rejected.error, /ゲーム画面全体/);
  game.setBounds(invalidBounds);
  console.log('PASS: ウィンドウ外にはみ出した録画領域を拒否');
  await window.webContents.executeJavaScript(`document.querySelector('#record-test').click()`, true);
  await waitFor(`document.querySelector('#phase').textContent === 'recording'`);
  await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 1200))');
  const closed = new Promise(resolve => window.once('closed', resolve));
  window.close();
  await closed;
  assert.equal(readdirSync(output).filter(name => name.endsWith('.mp4')).length, 2);
  assert.equal(readdirSync(output).filter(name => name.startsWith('.kancolle-recording-')).length, 0);
  console.log('PASS: ウィンドウを閉じる際に録画を停止して保存');
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
