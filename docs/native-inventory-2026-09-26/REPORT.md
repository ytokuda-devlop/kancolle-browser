# OS別の実行ファイル・npm・ネイティブ部品調査

対象はElectron 44.0.0 / electron-builder 26.15.3で生成したmacOS x64とWindows x64。
ファイルとして存在するネイティブ部品とnpmパッケージを列挙し、静的依存の追跡を進めた。
**静的リンク部品を含む包括的な監査は継続中**。通知一覧やGNの依存宣言だけを、
各OSの最終リンク結果と同一視しない。

## 実物の一覧

| 対象 | ネイティブファイル数 | npmパッケージ数 | ASAR内のネイティブ部品 |
| --- | ---: | ---: | ---: |
| macOSアプリ | 13（実行ファイル7・ライブラリ6） | 5 | 0 |
| Windows Setup内のアプリ | 8（EXE2・DLL6） | 5 | 0 |
| Windows portable内のアプリ | 8（EXE2・DLL6） | 5 | 0 |

macOSのsymlinkは別記し、実ファイルを重複計上していない。
WindowsのSetup/portableでアプリ内ネイティブファイルのパスとハッシュは一致した。
全ファイルの先頭マジックを調べ、拡張子のない実行ファイルも対象にした。
ASAR内も全92ファイルを確認。`.node`だけを検索した結果ではない。

macOSの13ファイル:

| ファイル／部品 | 配置・用途 |
| --- | --- |
| KancolleBrowser | Contents/MacOSの起動EXE |
| KancolleBrowser Helper | Helperアプリの起動EXE |
| KancolleBrowser Helper (GPU) | GPU用Helper |
| KancolleBrowser Helper (Plugin) | Plugin用Helper |
| KancolleBrowser Helper (Renderer) | Renderer用Helper |
| Electron Framework | Chromium/Node.js/V8等を含むframework本体 |
| chrome_crashpad_handler | クラッシュ処理のEXE |
| libffmpeg.dylib | Electron内蔵FFmpeg |
| libvk_swiftshader.dylib | ソフトウェアGPU実装 |
| Mantle | Mantle.framework本体 |
| ReactiveObjC | ReactiveObjC.framework本体 |
| Squirrel | Squirrel.framework本体 |
| ShipIt | Squirrel.framework内の更新補助EXE |

Windowsアプリ内の8ファイル:

| ファイル | アーキテクチャ／位置 |
| --- | --- |
| 艦娘は今日もお仕事です（仮）.exe | x64、アプリ本体 |
| resources/elevate.exe | x86、昇格補助 |
| ffmpeg.dll | x64 |
| d3dcompiler_47.dll | x64 |
| dxcompiler.dll | x64 |
| dxil.dll | x64 |
| vk_swiftshader.dll | x64 |
| vulkan-1.dll | x64 |

Windowsの外側のSetup EXE・portable EXEも別に列挙した。
Setupから生成アンインストーラーを取り出し、次のプラグインも列挙した。
これらはアプリ内8ファイルには含めない。

| コンテナ | 内包プラグイン |
| --- | --- |
| Setup | System、UAC、StdUtils、nsDialogs、nsExec、nsis7z、WinShell |
| portable | System、StdUtils、nsis7z |
| アンインストーラー | System、UAC、StdUtils、nsDialogs、nsExec、WinShell |

実物ハッシュ・サイズ・パス・PEの通常/遅延import・Mach-Oのload command・symlink・
公開シンボルの根拠は[native-components.json](evidence/native-components.json)。
PEのimportやMach-Oのload commandは動的ロードの全経路を表すものではない。
OS標準ライブラリへの参照を、配布物に含まれるファイルとして数えない。
icudtl.dat、V8 snapshot、pak等の実行時データもJSONへ別記した。

## npmの実物

各OSのASAR内package.jsonを列挙し、package-lock.jsonの版と照合した。

| npmパッケージ | 版 | package.jsonの条件 |
| --- | --- | --- |
| react | 18.3.1 | MIT |
| react-dom | 18.3.1 | MIT |
| scheduler | 0.23.2 | MIT |
| loose-envify | 1.4.0 | MIT |
| js-tokens | 4.0.0 | MIT |

Viteで作られたrendererのJavaScriptもASAR内にある。バンドルとnode_modulesの
パッケージは重複し得るため、別々の第三者部品として二重計上しない。
Electron自身のNode組込みJavaScript・ネイティブライブラリは、このnpm5件とは別枠。
開発環境のnode_modules全体を配布依存として数えていない。

根拠: [mac-npm.json](evidence/mac-npm.json)、
[windows-setup-npm.json](evidence/windows-setup-npm.json)、
[windows-portable-npm.json](evidence/windows-portable-npm.json)。

## 公式配布との対応

キャッシュ内の公式Electron44.0.0 ZIPと照合した。ZIPのSHA-256は前回監査の
公式配布チェックサム照合結果と同じで、今回のJSONにも保持する。

- macOSの13実ファイルは全て公式Electron ZIP内のファイルと完全一致。
- Windowsの6 DLLは公式Electron ZIP内のファイルと完全一致。
- WindowsのアプリEXEはリソース編集により全体ハッシュが異なるが、`.text`コード領域は公式electron.exeと一致。
  これは全セクションの一致や任意の変更が無害であることまで証明しない。
- elevate.exeとインストーラーの部品はElectron ZIPとは別の出典。
  [Windowsの前回調査](../windows-license-review-2026-09-26/REPORT.md)を引き継ぐ。

## 静的リンクの確認を進めた範囲

Electronリリース設定は`is_component_build=false`、FFmpegは例外的に
`is_component_ffmpeg=true`。NodeのGN定義は`source_set("libnode")`で、
Electron本体の依存に入る。

macOSのElectron FrameworkとWindows EXEの公開シンボルから、
**Node.js・V8・libuvのコードが本体に含まれることを確認**した。
WindowsではSQLiteのシンボルも確認した。ただしどのSQLiteコピー由来かは
シンボル名だけでは確定しない。macOSで公開シンボルが見つからない部品を不在とは扱わない。

固定版の設定・パッチから、次の依存を追跡した。

- Node.js24.18.1、V8、libuv、ada、simdjson、c-ares、llhttp、nghttp2、uvwasi、
  histogram、merve、nbytes、postject。
- Chromium側のBoringSSL、zlib、Brotli、Zstandard、ICU、simdutf。
- Electron本体のSkia、WebRTC、libyuv、Highway、LevelDB等の依存宣言。
- その他のコーデック・描画・フォント部品は、通知と固定ソースから候補を整理。

ElectronはNodeの同梱OpenSSLをそのまま使わず、BoringSSLへ切り替えている。
Brotli/ZstandardにもChromium側への切替がある。Node上流の依存一覧だけで
静的リンク一覧を確定しない。NodeのGNパッチではngtcp2の直接依存も削除される。

[static-components.json](evidence/static-components.json)に41項目を記録し、
「シンボルでも確認」「ビルド宣言で確認」「通知・ソース上の候補」「未確定」を区別した。
41項目全ての静的リンクが証明済み、という意味ではない。

`LICENSES.chromium.html`の779通知項目を
[chromium-notice-index.json](evidence/chromium-notice-index.json)に索引化した。
この通知には対象OSで使われない候補や重複タイトルも含まれるので、
「779ライブラリがこのアプリにリンクされている」とは扱わない。

## 通知の追加

包括通知のNode.js欄は、Node24.18.1のLICENSEとテキストが完全一致した。
ただし、GNの依存にあるnbytes固有の`Copyright (c) 2024 Node.js`とMIT原文は
包括通知では見つからなかった。そのため
`licenses/electron-components/nbytes-LICENSE.txt`を原本どおり追加した。
`extraResources`・必須通知検査・THIRD_PARTY_NOTICESも更新した。配布資料は28件。
最終リンクの全オブジェクトを確定したという主張ではなく、宣言済み依存の原文保持を補う変更。
比較結果は[notice-comparison.json](evidence/notice-comparison.json)。

## 残る確認

1. 両OSの最終GN引数・Ninja依存・link map/PDB/dSYM等を用いて推移的な部品と
   最終オブジェクトの対応を確認する。stripされたバイナリの公開シンボルだけでは完結しない。
2. SwiftShader、Dawn/ANGLE、DXC/DXIL、Vulkan loader等の内部静的依存と条件を対応付ける。
   `d3dcompiler_47.dll`のMicrosoft SDK再配布条件も個別に確認する。
   公式Electronとの一致は、全てがMITであることを意味しない。
3. 通知の各項目と対象OSのリンク部品を対応付け、選択条項・例外・特別な表示条件を確認する。
4. WinShell・elevateの出典/条件、nsis7z/StdUtils/Electron内蔵FFmpegのソース提供・交換手順の残件を継続する。

## 再実行

`scripts/inventory-native-components.py`は展開済みのレビュー用ディレクトリを読み取る。
`mac`はZIPからdittoで展開したアプリ、`setup`/`portable`は7zzで展開した外側、
`setup-app`/`portable-app`は各app-64.7zの内容、`uninstaller`はSetup内Uninstall EXEの内容、
`containers`は外側のSetup/portable EXEを置く。インストーラーは実行しない。

```sh
python3 scripts/inventory-native-components.py --root release/native-inventory-2026-09-26/final-extracted --output docs/native-inventory-2026-09-26/evidence
node scripts/inventory-asar-packages.cjs path/to/app.asar path/to/npm-inventory.json
```

macOSのfile/otool/nmと、electron-builderの公式Electron ZIPキャッシュを使う。
括弧を含むHelper名をotoolがarchive memberと誤認するため、一時hard linkで同じバイトを検査する。
ASAR検査は拡張子に加えてPE/Mach-O/ELF/arのマジックも確認する。
出力にはユーザー名入りの絶対パスを含めない。

一次資料はElectron44.0.0アーカイブからのBUILD.gn・release/all設定・Nodeパッチと、
[Node.js24.18.1のGN定義](https://github.com/nodejs/node/blob/v24.18.1/unofficial.gni)。
取得URLとSHA-256は[downloaded-source-files.json](evidence/downloaded-source-files.json)。

## 検証結果

- 録画・収録資料の既存テスト9件成功。
- macOS ZIP/DMG・Windows Setup/portableを28資料で再生成し、4形式とも原本一致・録画変換用FFmpeg不在の検査に成功。
- 再生成したZIP/Setup/portableを新規ディレクトリへ展開し、ネイティブ部品・npm一覧を取得。
  DMGについては最終コンテナの通知検査を実施。独立したネイティブ一覧の取得元はmacOS ZIP。
- 通知索引はHTML内の全779タイトルと件数一致。
- 自作PEパーサーのWindows本体の通常import一覧は、LLVM objdumpの結果と一致。
  遅延importは別途記録するが、この独立照合の対象外。
- macOSは未署名設定、WindowsはsignAndEditExecutable=falseで生成。公開していない。

成果物のハッシュと通知検査結果は[artifacts.json](evidence/artifacts.json)。
PE読取の独立照合は[pe-parser-crosscheck.json](evidence/pe-parser-crosscheck.json)。
調査スクリプトはアプリ・インストーラーを実行せず、抽出とバイナリの読取りだけを行った。
