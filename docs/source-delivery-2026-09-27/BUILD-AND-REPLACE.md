# Electron 44.0.0 内蔵FFmpegのビルド資料・交換手順

2026-09-27。対象はmacOS x64 / Windows x64。録画変換用の旧ffmpeg-staticではない。
この手順は固定版ソースの調査に基づく実行案であり、再ビルド・改変版での動作確認は未実施。
macOSのXcodeが必要な工程は、ユーザー指定により今回スキップした。

## 固定する版

| 部品 | 固定値 |
| --- | --- |
| Electron | `bf0c4e67e9a834479ee171e61057f7516a381d25` (44.0.0) |
| Chromium | `24072c1aa400ec4a89dc738b6b6acd12a8589b6f` (152.0.7977.54) |
| Chromium FFmpeg | `2b68d2babae73714846961fb0ee47e3b3d2e39a9` |
| Chromium内のOpus | Chromium上記コミットに含まれる改変済み一式。READMEの上流Revisionは`55513e81d8f606bd75d0ff773d2144e5f2a732f5` |
| NASM | `525a09a813be0f75b646ee93fc2a31c27b87d722` |
| depot_tools | Chromium DEPS指定の`38c391feba5fb96812f9028da12413ffc39df394` |
| GN | DEPSの`git_revision:641ace93dd9560e75e7add0d08f77b446fbb3b78` |
| Siso | DEPSの`git_revision:7bc9a0bfe050ef97e1712ff61c6f11952799e951` |
| Clang | DEPSの`llvmorg-23-init-19482-g53d18800-1` |

取得先・ハッシュは`build-materials.json`と従来の`source-archives.json`に保存する。
Opusは上流の無改変アーカイブへの置換ではなく、Chromiumに取り込まれたソースを保管した。
FFmpegの`BUILD.gn`は`//third_party/opus`へ依存し、Opus側は`static_library("opus")`を定義する。
これはビルド定義で確認した依存関係であり、実物の全静的リンク部品を列挙したという意味ではない。

## 必要な環境

- 共通: Git、Python、Node.js、depot_tools、GN、ビルド実行ツール。
  Electron固定版の案内ではPython >= 3.9、Node.js >= 22.12.0。
  DEPSのGit/CIPD/GCS入力、hooks、Electronのパッチを含めて取得する。
- macOS: XcodeとmacOS SDK。Chromium固定版の`mac_sdk.gni`は公式SDKを
  26.5 / build 25F70とする。Electron一般案内の「最新のXcode」だけで版を確定しない。
  Xcode導入・ビルド・改変ライブラリの動作確認は今回の実行対象外。
- Windows: 固定版Chromiumの案内はWindows 10以降、空き容量100 GB以上、
  RAM 8 GB以上（16 GB超推奨）、Visual Studio 2026のC++/MFC/ATL、
  Windows SDK 10.0.26100.7705、Debugging Tools 10.0.26100.3323以上を指定する。
  `vs_toolchain.py`のSDKディレクトリ値`10.0.26100.0`とSDK配布版を混同しない。
  Electronの一般案内にあるVS2019/2022だけで足りるとは判定しない。
  `DEPOT_TOOLS_WIN_TOOLCHAIN=0`を設定し、ローカルのMicrosoftツールチェーンを使用する。

上記はソース内の要求・設定値。公式配布バイナリのビルドホスト全体を再現した記録ではない。
このMacはXcode本体・GN・gclient・Windows実行環境を持たず、調査開始時の空き容量は約5.3 GiB。
大規模なChromium checkoutやビルドは実行していない。

## ソース取得・ビルドの実行案

添付資料の各アーカイブは原本のまま。`chromium-build-*`は`src/build/`、
`chromium-opus-*`は`src/third_party/opus/`、`nasm-*`は`src/third_party/nasm/`、
`chromium-generate-stubs-*`は`src/tools/generate_stubs/`の内容である。
これらだけを展開しても、完全なChromium checkoutにはならない。

十分な容量がある別の作業ディレクトリに固定したdepot_toolsを置き、PATHへ追加する。
`DEPOT_TOOLS_UPDATE=0`で自動更新を止める。既存のアプリの作業ツリーでは実行しない。
Windowsでは以下をcmd.exeで実行する前に`set DEPOT_TOOLS_WIN_TOOLCHAIN=0`を設定する。

```text
gclient config --name src/electron --unmanaged https://github.com/electron/electron
gclient sync --revision src/electron@bf0c4e67e9a834479ee171e61057f7516a381d25 --with_branch_heads --with_tags
gclient revinfo --actual
```

sync後、Chromium/FFmpeg/Opus/NASMの版を上記と照合する。
Electronのhooksが適用するパッチ一覧・差分も保存する。
FFmpegへの`link_with_loader_path.patch`の二重適用はしない。
`gclient revinfo`だけではCIPD/GCS配布物やSDKの版・ハッシュを記録し切れないため、
syncログ・ツール版・CIPD/GCSの取得記録も保存する。

`src/out/FFmpegSource/args.gn`を作成する。標準release設定を基準にする実行案:

```gn
import("//electron/build/args/release.gn")
target_cpu = "x64"
```

同設定は`is_component_build=false`、`is_component_ffmpeg=true`、
`ffmpeg_branding="Chrome"`、`proprietary_codecs=true`を指定する。
Chrome/mac/x64・Chrome/win/x64のconfig.hのGPL/NONFREE/VERSION3無効も照合する。
PGOはElectron独自のstateファイルとダウンロードhookを使うため、
プロファイルを省略したまま公式release設定を再現できたとは扱わない。
stateファイル・取得スクリプトはElectron原本アーカイブにある。
プロファイル本体は今回の添付物には含めていない。

`src`から次を実行する。ローカル実行に必要なSiso/reclient設定も固定版の資料で確認する。

```text
gn gen out/FFmpegSource
gn desc out/FFmpegSource //third_party/ffmpeg:ffmpeg deps --all
gn desc out/FFmpegSource //third_party/ffmpeg:ffmpeg outputs
autoninja -C out/FFmpegSource ffmpeg
```

GNが確定した依存グラフ、生成ヘッダー、実際のコンパイル・リンクコマンドを保存する。
取得済みの7ソースアーカイブだけで依存が閉じているかは、まだ検証できていない。
`is_official_build`やPGOを変更する場合は、変更値と理由を記録し、交換後の動作を確認する。
バイト単位で同一の再ビルドを完了条件とはしないが、ABI・必要機能の互換性は確認する。

## 交換先と確認方法

元の配布物を保管し、アプリ終了後、別の検証用コピーで行う。
ファイル名だけを合わせて他版のライブラリを使わず、x64・同じ固定版と設定を基準にする。

| 形式 | 交換する場所 |
| --- | --- |
| macOS ZIP/DMGからコピーした.app | `Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib` |
| Windows Setupでインストールしたアプリ | アプリEXEと同じディレクトリの`ffmpeg.dll` |
| Windows portable | 下記のように内包アプリを別ディレクトリへ展開し、その`ffmpeg.dll` |

macOSはFrameworkのシンボリックリンク先を確認する。`otool -L`/`otool -D`で
ロードパスを、`nm`で必要な公開シンボルを確認する。Electronパッチ中の
`@loader_path`と実物Frameworkの`@rpath`参照は別の確認項目で、文字列が同じとは限らない。
本プロジェクトは未署名配布。署名版の作成や署名後検査を前提にしない。

Windows portableは起動のたびに内包アプリが展開されるため、一時展開先のDLLを
差し替えるだけでは永続的な交換手順にならない。NSIS対応7-Zipを使い、例えば:

```text
7za x portable.exe -oportable-container "$PLUGINSDIR/app-*.7z"
7za x "portable-container/$PLUGINSDIR/app-64.7z" -omodified-app
```

これはcmd.exe向けの例。実際の`app-*.7z`名は一覧で確認する。
PowerShellでは`$PLUGINSDIR`の展開を避けるため単一引用符で囲む。
`modified-app/ffmpeg.dll`を交換し、そこにあるアプリEXEを起動する。
元のportable.exeを起動すると元の内包DLLが使われる。
今回、公開ZIP内のEXEから内包アプリのFFmpegを静的抽出できることは確認済み。
改変版DLLへの交換後に展開済みアプリが動くことはWindows実機で未検証。

各OSで必要シンボル・アーキテクチャ・依存DLLを確認した上で、起動、音声・動画再生を
検証する。録画対応版では録画、WebM保存、音声同期、シークも検証する。
2026-10-02の録画廃止後の版の確認項目は[ライセンス収録手順](../LICENSE-PACKAGING.md)を参照する。
交換前後のライブラリSHA-256と
動作結果を保存する。元ライブラリに戻す手順も確認する。
以前のWebM動作確認は、改変したFFmpegでの動作確認の代用にはならない。

## 完了判定と公開

今回の添付物は版を固定したソース資料と手順であり、完全な対応ソース一式とする判定は保留。
特にGNで解決された推移的入力の確認、Windowsのビルド・交換確認が残る。
Xcode工程のスキップは、その工程が成功したという意味ではない。
アップロードはユーザーが行う。公開後、Releaseの添付ファイルをログインなしで取得し、
SHA-256一致を確認するまでは「公開・取得確認済み」にしない。

根拠は固定版の原本を`evidence/`とアーカイブ内に保存している。
公式参照先:

- https://github.com/electron/electron/tree/bf0c4e67e9a834479ee171e61057f7516a381d25
- https://chromium.googlesource.com/chromium/src/+/24072c1aa400ec4a89dc738b6b6acd12a8589b6f/docs/windows_build_instructions.md
- https://chromium.googlesource.com/chromium/src/+/24072c1aa400ec4a89dc738b6b6acd12a8589b6f/build/config/mac/mac_sdk.gni
- https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9/BUILD.gn
