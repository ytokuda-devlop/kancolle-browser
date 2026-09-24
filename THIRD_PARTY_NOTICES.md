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

The adopted distribution policy for the application combined with
`ffmpeg-static` is GPL-3.0-or-later; the original application source retains
its MIT license. See `licenses/DISTRIBUTION-NOTES.txt` for this policy and
`licenses/GPL-3.0.txt` for the GPL text.

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

### ffmpeg-static 5.3.0

- License: GNU General Public License, version 3 or later
- Source: <https://github.com/eugeneware/ffmpeg-static>
- License text: `licenses/ffmpeg-static-GPL-3.0.txt`

`ffmpeg-static` downloads a platform-specific FFmpeg executable during
installation. The downloaded executable is separate from the JavaScript
package and is governed by the license terms of that particular build.

### FFmpeg

- Copyright (c) 2000-present the FFmpeg developers
- Project: <https://ffmpeg.org/>
- Licensing information: <https://ffmpeg.org/legal.html>
- Upstream source information: <https://ffmpeg.org/download.html#get-sources>
- Corresponding-source availability and release-specific records:
  `licenses/FFmpeg-SOURCE.txt`
- GPL text: `licenses/GPL-3.0.txt`

This application invokes the FFmpeg executable as a separate process to
convert recordings to MP4. The recorded Windows x64 executable reports
FFmpeg 6.1.1-essentials_build-www.gyan.dev. The recorded macOS x64 executable reports
FFmpeg 6.1.1-tessus with GPL and version-3 components enabled. It also reports a
number of statically linked libraries, including x264 and x265. Builds
downloaded for another operating system or CPU architecture may have different versions,
configuration options, source providers, and license obligations.

Before distributing an application build, the distributor must record the
exact output of `ffmpeg -version` and `ffmpeg -L` for the executable included
in that build, preserve all required notices, include the applicable GPL text,
and make the complete corresponding source code available in the manner
required by that executable's license. A generic link to the latest FFmpeg
source is not necessarily the corresponding source for a distributed binary.
The corresponding-source record currently describes incomplete preparation;
it is not a claim that complete corresponding source is already available.

## Other runtime npm dependencies

The following packages are runtime dependencies recorded in the current lock
file. Their original license files and copyright notices must be preserved
when their code is included in a distribution. Copies available from the
currently installed packages are collected under `licenses/npm/`.

In particular, the MIT license and copyright notices extracted from the
READMEs of `agent-base` 6.0.2 and `https-proxy-agent` 5.0.1 are included in
`licenses/npm/agent-base-LICENSE.txt` and
`licenses/npm/https-proxy-agent-LICENSE.txt`, respectively.

| Package | Version | License |
| --- | ---: | --- |
| `@derhuerst/http-basic` | 8.2.4 | MIT |
| `agent-base` | 6.0.2 | MIT |
| `buffer-from` | 1.1.2 | MIT |
| `caseless` | 0.12.0 | Apache-2.0 |
| `concat-stream` | 2.0.0 | MIT |
| `debug` | 4.4.3 | MIT |
| `env-paths` | 2.2.1 | MIT |
| `http-response-object` | 3.0.2 | MIT |
| `@types/node` | 10.17.60 | MIT |
| `https-proxy-agent` | 5.0.1 | MIT |
| `inherits` | 2.0.4 | ISC |
| `js-tokens` | 4.0.0 | MIT |
| `loose-envify` | 1.4.0 | MIT |
| `ms` | 2.1.3 | MIT |
| `parse-cache-control` | 1.0.1 | BSD-3-Clause |
| `progress` | 2.0.3 | MIT |
| `readable-stream` | 3.6.2 | MIT |
| `safe-buffer` | 5.2.1 | MIT |
| `string_decoder` | 1.3.0 | MIT |
| `typedarray` | 0.0.6 | MIT |
| `util-deprecate` | 1.0.2 | MIT |

The `@types/node` entry refers to the runtime dependency of
`http-response-object`, not the separate development-only version in the lock
file. Installation and packaging may place this dependency at different paths.

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
the Electron version, the packaged operating systems, or the FFmpeg binary
change.
