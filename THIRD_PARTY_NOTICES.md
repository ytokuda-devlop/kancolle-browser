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

Recordings are saved directly as WebM using MediaRecorder. This application
no longer bundles `ffmpeg-static` or the separate recording-conversion FFmpeg
executable. The earlier GPL distribution policy for the application combined
with `ffmpeg-static` does not apply to this configuration.

The Electron library is a separate component from the removed executable.
The notices and source links above do not certify that all build-specific
license or corresponding-source requirements have been fulfilled. Review of
the exact Electron/Chromium components remains part of the release audit.

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
