# Third-Party Software Notices

This application includes third-party software. Each third-party component is
licensed under its own terms. The MIT License that applies to this
application's original source code does not replace, restrict, or supersede
the license of any third-party component.

The versions below reflect `package-lock.json` at the time this notice was
prepared. Release artifacts must preserve the applicable copyright notices
and license texts for the components that they actually contain.

## Finding the license files

Paths beginning with `licenses/` below are relative to the source repository
root, or to the packaged application's resources directory. On macOS, this is
`KancolleBrowser.app/Contents/Resources`; on Windows, it is the application's
`resources` directory. These files are outside the ASAR archive.
In packaged applications this notice is itself inside `licenses/`: a reference
such as `licenses/electron-LICENSE.txt` therefore names a file alongside this
notice, not a second nested `licenses` directory.

The application's original source code is licensed under MIT. Third-party
components retain their individual terms. See `licenses/DISTRIBUTION-NOTES.txt`
for the current distribution policy.

## Material runtime components

### Electron 44.0.0

- Copyright (c) Electron contributors
- Copyright (c) 2013-2020 GitHub Inc.
- License: MIT
- Source: <https://github.com/electron/electron>
- License text: `licenses/electron-LICENSE.txt`

Electron distributions include Chromium, Node.js, and other third-party
software. Their notices are provided by Electron in
`licenses/LICENSES.chromium.html`. A packaged application
must retain Electron's `LICENSE` and `LICENSES.chromium.html` files or include
equivalent copies with its other license materials.

### React and React DOM 18.3.1

- Copyright (c) Facebook, Inc. and its affiliates.
- License: MIT
- Source: <https://github.com/facebook/react>
- License texts:
  - `licenses/react-LICENSE.txt`
  - `licenses/react-dom-LICENSE.txt`

### Scheduler 0.23.2

- Copyright (c) Facebook, Inc. and its affiliates.
- License: MIT
- Source: <https://github.com/facebook/react>
- License text: `licenses/scheduler-LICENSE.txt`

### FFmpeg included in Electron

Electron includes its own FFmpeg library (for example, `libffmpeg.dylib` on
macOS and `ffmpeg.dll` on Windows). Its upstream notices are retained without
modification in `licenses/LICENSES.chromium.html` under the ffmpeg entry.

- Project and licensing information: <https://ffmpeg.org/legal.html>
- Electron source: <https://github.com/electron/electron/tree/v44.0.0>

The recording feature has been removed. This application does not bundle
`ffmpeg-static` or the separate recording-conversion FFmpeg
executable. The earlier GPL distribution policy for the application combined
with `ffmpeg-static` does not apply to this configuration.

The Electron 44.0.0 build pins Chromium 152.0.7977.54 and FFmpeg revision
`2b68d2babae73714846961fb0ee47e3b3d2e39a9`. Its Chrome/mac/x64 and
Chrome/win/x64 configuration headers identify LGPL-2.1-or-later and disable
GPL, nonfree, x264 and x265. Electron builds this component as a shared library.

- License text: `licenses/electron-components/LGPL-2.1.txt`
- Component credits: `licenses/electron-components/FFmpeg-CREDITS.txt`
- Exact source revisions, Electron patches, upstream download locations and
  source-delivery status: `licenses/ELECTRON-SOURCES.txt`

Users' rights under the applicable LGPL, including modification and reverse
engineering for debugging such modifications, are not restricted by this
application. Source preparation and final distribution checks remain open;
the upstream links alone are not a claim of complete source delivery.

### macOS frameworks included with Electron

These revisions are pinned by Electron 44.0.0's DEPS file. Original notices
are included separately, in addition to Electron's aggregate notices.

| Component | Revision | Terms / original notice |
| --- | --- | --- |
| Mantle | `2a8e2123a3931038179ee06105c9e6ec336b12ea` | MIT and included Proton/Bitswift terms; `licenses/electron-components/Mantle-LICENSE.md` |
| ReactiveObjC | `74ab5baccc6f7202c8ac69a8d1e152c29dc1ea76` | MIT; `licenses/electron-components/ReactiveObjC-LICENSE.md` |
| Squirrel.Mac / ShipIt | `8d808803bc89ec0e2aa1450474856dfee3b00c6b` | MIT; `licenses/electron-components/Squirrel-LICENSE.txt` |

Source repositories and patch information: `licenses/ELECTRON-SOURCES.txt`.

### Native dependencies integrated into Electron

Electron 44.0.0 pins Node.js 24.18.1. Its release build integrates Node.js,
V8 and other native dependencies into the Electron binary/framework rather
than distributing each as a separate npm package or library. The aggregate
`licenses/LICENSES.chromium.html` retains the Node.js composite license.
Electron's build uses Chromium BoringSSL in place of Node's bundled OpenSSL;
an OpenSSL entry in the composite notice alone does not identify a linked binary.

The Node.js build also declares nbytes as a dependency. Its original MIT notice,
Copyright (c) 2024 Node.js, is retained separately at
`licenses/electron-components/nbytes-LICENSE.txt`.
Source: <https://github.com/nodejs/node/tree/v24.18.1/deps/nbytes>.

The per-platform native inventory and static-link investigation are recorded in
the source repository at `docs/native-inventory-2026-09-26/REPORT.md`.
Notice entries and build dependencies are not a complete per-platform linker
map; review of transitive native components remains ongoing.

### Windows installer components

NSIS 3.0.4.1 and nsis-resources 3.4.1 are selected by electron-builder 26.15.3.
NSIS's original COPYING is included at `licenses/windows/NSIS-COPYING.txt`;
its compression modules have additional terms described there. This notice
does not determine the terms of every separately supplied plugin.

StdUtils release 1.14 (DLL FileVersion 1.1.4.0) is licensed under
LGPL-2.1-or-later. Its original notices, NSIS-use clarification and bundled-code
credits are in `licenses/windows/StdUtils-ReadMe.txt` and
`licenses/windows/StdUtils-README.html`. The LGPL text is provided at
`licenses/electron-components/LGPL-2.1.txt`. RHash and BLAKE2 notices are also
retained in `licenses/windows/StdUtils-rhash-COPYING.txt` and
`licenses/windows/StdUtils-blake2-COPYING.txt`. Source locations and outstanding
installer-component review are recorded in `licenses/ELECTRON-SOURCES.txt`.

Additional Windows component findings (2026-09-26):

| Component | Identified version | Terms / status |
| --- | --- | --- |
| UAC | 0.2.4c, 2015-05-26 | zlib/libpng; `licenses/windows/UAC-LICENSE.txt`; original DLL and source identified |
| WinShell | 20121005 | Author labels it Freeware; precise redistribution conditions remain unresolved |
| nsis7z | 19.00 | Plugin README states LGPL without a version; we elect LGPL 2.1 under section 13; LZMA SDK 19.00 is public domain |
| elevate.exe | FileVersion 1, 0, 0, 2894 | Johannes Passing's original source is MIT; the provider binary's exact build provenance remains unresolved |
| NSIS stubs / standard plugins | toolset 3.0.4.1 | Actual Setup, portable and uninstaller use the zlib stub; standard plugins retain NSIS terms |
| Generated installer templates | electron-builder 26.15.3 | MIT; `licenses/windows/electron-builder-LICENSE.txt` |

Original nsis7z notices are `licenses/windows/nsis7z-README.txt` and
`licenses/windows/nsis7z-LZMA-SDK-LICENSE.txt`. The original elevate source
license is `licenses/windows/elevate-upstream-LICENSE.md`; its inclusion does
not assert that all terms of the provider binary have been verified.
Exact source locations, obligations and remaining verification steps are
recorded in `licenses/windows/SOURCES.txt`. No completed source delivery or
permission beyond the applicable upstream terms is claimed.

## Other runtime npm dependencies

The following packages are runtime dependencies recorded in the current lock
file. Their original license files and copyright notices must be preserved
when their code is included in a distribution. Copies available from the
currently installed packages are collected under `licenses/npm/`.

| Package | Version | License |
| --- | ---: | --- |
| `js-tokens` | 4.0.0 | MIT |
| `loose-envify` | 1.4.0 | MIT |

Packages used only to build or test the application are not normally included
in the packaged runtime. If a release artifact includes any development
dependency, its license and notices must also be included in the release's
license materials.

## MIT License text

The following license text applies to the MIT-licensed components identified
above. Component-specific copyright notices remain as stated in each
component's original license file.

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Release maintenance

This notice is a record of the current dependency set, not a substitute for a
license audit of the final release artifact. Update it whenever dependencies,
the Electron version, or the packaged operating systems change.
