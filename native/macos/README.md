# macOS native recorder

`Recorder.swift` is first-party MIT-licensed code. It captures the selected app
window with ScreenCaptureKit, captures the app's process audio with Core Audio
process taps, and writes H.264/AAC MP4 using AVFoundation. It pins
the H.264 encoder ID to an Apple-provided VideoToolbox encoder. AAC compression
is requested through the system AVFoundation writer. No third-party codec
library is linked, copied, downloaded, or used as a fallback.

This changes the recording path; it does not strip codecs or FFmpeg from Electron,
and is not a conclusion about patent permissions.

## Build and package

- Requires macOS, Command Line Tools, and a macOS SDK supporting ScreenCaptureKit.
- `npm run build:electron` builds `dist-native/darwin/KancolleRecorder` as well.
- `RECORDER_ARCH=arm64` or `x64` selects a single architecture; the default builds
  a universal executable for both, so cross-architecture packaging is safe.
- electron-builder copies it outside ASAR to `Contents/Resources/native/`.
- macOS signing configuration includes this executable. Screen/audio usage
  descriptions are included in the main app's Info.plist.
- OS frameworks and Swift system runtime are loaded from macOS, not copied into
  the app. Check with `otool -L dist-native/darwin/KancolleRecorder`.

## Runtime

macOS 14.2 or later is required. Electron starts one helper per recording and sends
one JSON configuration line over stdin: windowID, crop x/y in window points,
width/height in pixels, app/child audio PIDs, and an output path in a private temporary directory.
The fixed output size matches the game's 1200×720 area at up to 30fps.
ScreenCaptureKit window filtering excludes other applications' pictures. Core
Audio translates the supplied PIDs to audio process objects and creates an
inclusive, private, unmuted stereo tap. It never captures global system audio
as a fallback. This avoids losing sound from Electron's audio utility process,
which isn't listed in ScreenCaptureKit's application picker. Audio isolation is
at the app/process level, not the WebContents level. Host-clock timestamps are
used for synchronization with screen frames, with OS drift compensation for the tap.

The helper emits JSON lines on stdout (`diagnostic`, `ready`, `finished`, `error`).
Diagnostics identify the H.264 encoder ID, AAC API, audio capture API/process count,
macOS version, and dimensions.
`stop` on stdin finalizes the movie; `discard` or EOF cancels it. The main process
publishes a complete MP4 without overwriting an existing file. Resize, minimize,
and closing stop and save the current recording. UI reloads preserve native
capture and resubscribe to its state. Captured frames use a bounded serial queue.

Permission denial fails with instructions to enable screen and system audio
recording in macOS Privacy & Security and restart the app. There is no MediaRecorder fallback.
Unsigned development helpers may be attributed to Electron, the terminal, or
the launching app by macOS; packaged app permission must be verified separately.

## Verification

- `node scripts/test-macos-recorder.mjs`: production writer, synthetic video/PCM,
  H.264/AAC track identifiers, duration, and decoded audio amplitude. Requires
  access to macOS media services but no screen capture permission.
- `env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron tests/recording-smoke.cjs`:
  real native screen/audio capture through the production UI hook and IPC,
  MP4 playback, four-corner crop pixel checks, decoded AAC signal amplitude,
  invalid crop rejection, and save-on-close. Requires GUI access and screen and
  system audio recording permissions. MediaRecorder and Chromium display capture
  are disabled in the test.

Final packaged app testing, signed/notarized identity, permission attribution,
minimum supported macOS versions, and both CPU architectures require separate
release validation. Windows 11 native recording is documented in `../windows/README.md`.
