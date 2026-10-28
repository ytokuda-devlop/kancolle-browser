# Windows 11 native recorder

`Recorder.cpp` is first-party MIT-licensed code. It uses Windows Graphics Capture
for the app window, WASAPI process loopback for the Electron main process and
its child processes, and Media Foundation for H.264/AAC encoding and MP4 muxing.

The helper instantiates `CLSID_CMSH264EncoderMFT` and `CLSID_AACMFTEncoder`
directly. It does not enumerate or automatically select installed encoders.
The MP4 sink receives already compressed samples with converters disabled.
No H.264/AAC implementation, external FFmpeg executable, codec download, or
MediaRecorder fallback is added. Missing Windows media components cause an
error. Windows N editions may need Microsoft's Media Feature Pack installed
through Windows settings; the app does not install it automatically.

This describes the recording implementation, not a determination of patent
permissions. Electron's existing FFmpeg and codec implementations are retained.
Free distribution and use of system APIs are not treated as proof of patent
clearance.

## Build and distribution

- Supported target: Windows 11 x64 (build 22000 or later).
- Requires MSVC C++ build tools and Windows SDK 10.0.19041.0 or later.
- `npm run build:electron` builds `dist-native/win32/KancolleRecorder.exe` on
  Windows. The build discovers Visual Studio through `vswhere`, or uses an x64
  Native Tools command prompt. No codec dependencies are downloaded.
- electron-builder copies the helper outside ASAR to
  `resources/native/KancolleRecorder.exe` for the Windows target.
- The helper links Windows system libraries and the MSVC static C/C++ runtime
  (`/MT`). It does not redistribute Windows media DLLs or codec libraries.
- C++/WinRT's MIT license is retained in `licenses/windows/cppwinrt-LICENSE.txt`
  and checked by the packaging license verifier.
- macOS packaging still needs a macOS build; Windows packaging needs a Windows
  build. Other Windows CPU architectures are currently rejected.

## Runtime

Electron sends a UTF-8 JSON configuration line over a private stdin pipe:
`windowHandle` (hex HWND string), `processID` (Electron main PID), crop `x`/`y`
relative to the outer window in DIPs, output `width`/`height`, and a private
temporary MP4 `path`. The helper validates window ownership and crop dimensions.
Dimensions are even, at most 1200x720, with a maximum 30fps cadence.

The crop accounts for DWM's invisible borders, Electron's menu bar, and the
window DPI. BGRA capture is downsampled to the logical output size and converted
to NV12 in a bounded buffer. Only this app's process tree is captured for audio;
there is no microphone or global audio fallback. Other windows of this app may
be audible. PCM is stereo 48kHz, encoded at 128kbps; H.264 is configured at 6Mbps.
Both timelines use the Windows performance-counter clock. Silent gaps are filled
with PCM silence, and static images repeat the latest captured frame.

The helper reports JSON lines (`diagnostic`, `ready`, `finished`, `error`). Ready
is emitted after an actual video frame. `stop` finalizes both encoders and the
MP4 container; `discard` or pipe EOF cancels. Geometry/DPI changes stop and save
the current capture. The parent handles resize, minimize, fullscreen changes,
and close, and publishes the completed MP4 without overwriting an existing file.
Windows uses an exclusive copy so video folders on volumes without hard links
can be used. A completed temporary MP4 is retained if publication fails.

## Verification

- `npm run test:recording:win`: builds the production helper, generates two
  seconds of synthetic video/PCM, checks MP4/H.264/AAC track markers and a
  Japanese output path, then decodes with Windows Media Foundation to verify
  frame count, dimensions, duration, and audio amplitude.
- `npm run build` then `npm run test:recording:smoke`: opens a visible test
  Electron window, captures synthetic app video/audio through the production
  IPC and hook, checks decoded corner pixels and AAC signal, rejects an invalid
  crop, tests silent/static recording and discard, and checks save on resize,
  minimize, and close.
  MediaRecorder and Chromium display capture are disabled by the test.
- Set `RECORDING_TEST_FULL_SIZE=1` for the same smoke test at 1200x720.

Verified here on Windows at 96 DPI, including the full-size smoke test. Mixed-DPI
monitors, HDR, Windows N/missing media features, long recordings, and the final
portable package need separate release testing. No macOS live recording test is
required for this Windows change.

API references:
- <https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow>
- <https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/>
- <https://learn.microsoft.com/en-us/windows/win32/medfound/h-264-video-encoder>
- <https://learn.microsoft.com/en-us/windows/win32/medfound/aac-encoder>
