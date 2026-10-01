# OS別の部品一覧と静的リンク調査（2026-10-02）

指定されたMac公開ZIPと、保存済みWindows成果物3点をそれぞれ展開して再走査した。Mac 13ファイル、Windowsアプリ本体は各8ファイル。各ASARは92ファイル・npm 5パッケージ・ネイティブ部品0件。これは部品棚卸しであり、全静的リンク部品の特定・ライセンス対応完了を意味しない。

## 対象と方法

固定したパス・SHA-256は[inputs.json](inputs.json)、集計は[summary.json](summary.json)。Macは `release/kancolle-browser_1.0.0_mac.zip` のみを公開対象として扱う。DMGは非公開方針に従い対象外。Windows保存済み公開ZIPは2026-09-27取得分で、現在の公開状態は確認していない。Setup／portableは2026-09-26のローカル候補であり、今回新たに公開候補へ指定したものではない。

全通常ファイルのマジックを検査し、PE／Mach-OのSHA-256、アーキテクチャ、動的依存、公開シンボルを記録した。シンボリックリンクとランタイムデータは別記録。Windowsの外側EXE、内蔵プラグイン、Setup内アンインストーラーも展開した。Windowsコードは実行していない。MacはNodeモードで版情報のみ取得し、GUI・録画・交換試験は実施していない。

## macOS x64

[実物証跡](mac-publication.json)。13ファイルすべてが固定した公式Electron 44.0.0アーカイブ内のファイルとSHA-256一致。

| ファイル（アプリ内相対パス） | 種別 |
| --- | --- |
| `Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework` | 共有ライブラリ |
| `Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler` | 実行ファイル |
| `Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib` | 共有ライブラリ |
| `Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib` | 共有ライブラリ |
| `Contents/Frameworks/KancolleBrowser Helper (GPU).app/Contents/MacOS/KancolleBrowser Helper (GPU)` | 実行ファイル |
| `Contents/Frameworks/KancolleBrowser Helper (Plugin).app/Contents/MacOS/KancolleBrowser Helper (Plugin)` | 実行ファイル |
| `Contents/Frameworks/KancolleBrowser Helper (Renderer).app/Contents/MacOS/KancolleBrowser Helper (Renderer)` | 実行ファイル |
| `Contents/Frameworks/KancolleBrowser Helper.app/Contents/MacOS/KancolleBrowser Helper` | 実行ファイル |
| `Contents/Frameworks/Mantle.framework/Versions/A/Mantle` | 共有ライブラリ |
| `Contents/Frameworks/ReactiveObjC.framework/Versions/A/ReactiveObjC` | 共有ライブラリ |
| `Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt` | 実行ファイル |
| `Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel` | 共有ライブラリ |
| `Contents/MacOS/KancolleBrowser` | 実行ファイル |

## Windows x64アプリ／x86補助部品

3成果物に共通するアプリ内一覧。6 DLLは公式Electronとファイル全体のSHA-256一致。アプリEXEは公式Electronの `.text` 一致（ファイル全体の一致ではない）。elevate.exeは既存のWindows提供元調査で固定したハッシュと一致。

| ファイル | アーキテクチャ |
| --- | --- |
| `d3dcompiler_47.dll` | x64 |
| `dxcompiler.dll` | x64 |
| `dxil.dll` | x64 |
| `ffmpeg.dll` | x64 |
| `resources/elevate.exe` | x86 |
| `vk_swiftshader.dll` | x64 |
| `vulkan-1.dll` | x64 |
| `艦娘は今日もお仕事です（仮）.exe` | x64 |

| 成果物 | 外側EXE | 内蔵プラグイン | アンインストーラー |
| --- | --- | --- | --- |
| [windows-saved-publication](windows-saved-publication.json) | x86・1個 | StdUtils.dll, System.dll, nsis7z.dll | 内蔵なし |
| [windows-setup-candidate](windows-setup-candidate.json) | x86・1個 | StdUtils.dll, System.dll, UAC.dll, WinShell.dll, nsDialogs.dll, nsExec.dll, nsis7z.dll | x86 EXE 1個、内蔵: StdUtils.dll, System.dll, UAC.dll, WinShell.dll, nsDialogs.dll, nsExec.dll |
| [windows-portable-candidate](windows-portable-candidate.json) | x86・1個 | StdUtils.dll, System.dll, nsis7z.dll | 内蔵なし |

プラグインはすべて既存調査のSHA-256と一致。版・配布条件の詳細は[Windows調査](../windows-license-review-2026-09-26/REPORT.md)を参照。ハッシュ一致は、既存の未解決条件を解消する根拠とはしない。

保存済みWindows公開ZIPとSetup／portable候補では、アプリEXEの全体ハッシュとASARハッシュが異なる。ネイティブファイルの追加・削除はなく、他の7ファイルとnpm一覧は一致する。ASAR内容差分の意味までは今回確認していないため、成果物全体の同一性や相互の動作検証代替は主張しない。

## 実際に同梱されたnpm

| パッケージ | 版 | ライセンス |
| --- | --- | --- |
| js-tokens | 4.0.0 | MIT |
| loose-envify | 1.4.0 | MIT |
| react | 18.3.1 | MIT |
| react-dom | 18.3.1 | MIT |
| scheduler | 0.23.2 | MIT |

各成果物のASARを個別に読み、package-lockと照合した。開発専用依存はこの一覧へ加算しない。レンダラーのバンドル情報は各JSONへ別記録した。Electron組込みのNodeモジュールの版情報は、このnpm 5件とは別の調査対象。

## 静的リンク調査の更新

[static-components.json](static-components.json)に既存41項目と追加4項目の計45項目を記録した。共有部品や候補も含む調査表であり、「静的リンク45部品確認済み」という意味ではない。

- Mac Electron Framework／WindowsアプリEXEでNode.js・V8・libuvの公開シンボルを再確認。WindowsではSQLiteのシンボルも確認した。
- Mac公開ZIPからNode 24.18.1、V8 15.2.124.13-electron.0、libuv 1.52.1、SQLite 3.53.1、nbytes 0.1.4等の実行時版情報を取得し、17項目へ対応付けた。版情報単独で個別オブジェクトのリンクや全ソース由来を証明するものではない。
- [FFmpegソース範囲調査](../ffmpeg-source-scope-2026-10-02/README.md)を統合。Mac x64 Chrome設定のFFmpeg→Opus依存はソース定義で確認。libc++、libc++abi、LLVM libcヘッダー、Clang compiler builtinsの暗黙のビルド入力も追跡した。LLVM libcの `llvm-libc-shared` はgroupであり、共有ライブラリ実物の存在を示さない。
- Macの既定条件をWindowsへ流用しない。最終GNグラフ・リンクマップを実行取得した結果ではない。Opusの他ターゲットへのリンクも一括して確定しない。
- BoringSSLの設定と `openssl=0.0.0` を区別。版メタデータからOpenSSL本体を同梱すると判断しない。通知に記載された候補だけでは静的リンク済みと判断しない。

### 残る確認

1. libc++／libc++abi／LLVM libc／ツールチェーン由来builtins等の固定ソース・入力を揃え、FFmpeg対応ソース提供範囲の不足を解消する。詳細なpinと未確認入力はソース範囲調査に記録済み。
2. 最終ビルド条件・リンク情報で、宣言依存／通知だけの候補（Skia、WebRTC、画像・フォント系等）の実際の収録範囲を絞る。ストリップされたシンボルの不在は部品不在の証明にしない。
3. Windowsのd3dcompiler再配布条件、elevateのCRT由来など、既存表の未解決事項を引き続き確認する。
4. Xcodeが必要なMac再ビルド・改変ライブラリ交換動作確認は、ユーザー指定どおりスキップ。完了扱いにしない。

## 再実行

`python3 scripts/inventory-current-artifacts.py`

固定した成果物と公式Electronキャッシュ、electron-builderの7zz、Node依存、macOSのditto／otool／nmが必要。既存のnative／ASARスキャナーを再利用する。入力ハッシュを前後に検査し、作業用ディレクトリへ展開する。配布ZIP・EXEを変更しない。静的調査表と本レポートは証跡から編集したレビュー資料で、自動再生成対象ではない。

2026-10-02追加調査: 上記LLVM系4ソースは[追加調査](../static-link-review-2026-10-02/REPORT.md)で取得・ハッシュ固定済み。最終収録範囲・ツールチェーン対応の未確定事項は継続する。
