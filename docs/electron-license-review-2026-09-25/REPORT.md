# Electron側の残存ライセンス課題への対応

調査開始: 2026-09-25、最終検証: 2026-09-26。
対象: Electron 44.0.0 / electron-builder 26.15.3、macOS x64・Windows x64。
判定: 追加通知と4形式での収録検証は完了。配布全体のライセンス準備は未完了。

2026-09-27追補: ビルド資料6アーカイブを追加し、既存3アーカイブも再取得した。
詳細は[ビルド・交換・公開確認](BUILD-AND-REPLACEMENT.md)と
`source-reacquisition.json`、`supplemental-source-archives.json`参照。
改変版の両OSでのビルド・交換実証と公開は未完了。
今回ELECTRON-SOURCES.txtを更新したため、以前の配布物の通知一致結果は今回の
変更後の通知を検証した結果ではない。再パッケージ後に再検証する必要がある。

## 解消した事項

### macOSのフレームワーク通知

Electronのタグをコミット`bf0c4e67e9a834479ee171e61057f7516a381d25`まで解決し、
DEPSに固定されたMantle・ReactiveObjC・Squirrel.Macを確認した。
macOSの実アプリ内の3 framework、ShipIt、libffmpeg.dylibのSHA-256は、
Electron公式ZIP内の各ファイルと一致。公式ZIP自体もnpm提供checksums.jsonと一致。
原文通知を追加し、Mantleに含まれるProton / Bitswiftの条件も保持した。
ReactiveObjCに適用されるElectronの2パッチはビルド用変更で、通知の変更を含まない。
Squirrelは包括通知に既存の項目があるが、固定版の原文も追加した。

### Electron内蔵FFmpegの版・構成

- Electron 44.0.0 → Chromium 152.0.7977.54 → FFmpeg
  `2b68d2babae73714846961fb0ee47e3b3d2e39a9`まで追跡。
- Chrome/mac/x64・Chrome/win/x64のconfig.hはLGPL-2.1-or-later。
  GPL、nonfree、version3、x264、x265はいずれも無効。
- Electron release.gnは共有ライブラリ構成。Chrome brandingと
  proprietary_codecs=trueはGPL有効化と同義ではない。
- LGPL本文とFFmpegのCREDITS原文を配布資料へ追加。
- Chromium FFmpegソースとElectronソース（ビルド資料・パッチを含む）を取得し、
  SHA-256とアーカイブ全ファイルの読み取りを確認。
- Electronのlink_with_loader_path.patchが取得したBUILD.gnへ適用可能と確認。
- 新規Windows検証ビルドのffmpeg.dllも公式Electron ZIP内のDLLとSHA-256一致。

### WindowsのNSIS・StdUtils

- nsis-3.0.4.1とnsis-resources-3.4.1のアーカイブSHA-256は
  インストール済みelectron-builderが指定するチェックサムと一致。
- NSIS COPYING原文を追加。zlib/libpng、bzip2、CPL-1.0およびLZMAリンク例外を保持。
  NSIS本体の文書を、別配布の全プラグインの許諾として流用しない。
- StdUtilsはリリース1.14（FileVersion 1.1.4.0）。公式ZIP内Unicode DLLと、
  キャッシュおよび今回の両Windows成果物のDLLが全バイト一致。
- 作者のLGPL-2.1-or-later通知、NSIS利用についての補足、RHash・BLAKE2・
  Apache由来Base64の原文通知を収録。公式対応ソースも取得・読み取り検証済み。
- プラグインを最終コンテナから列挙した。SetupはSystem、UAC、StdUtils、
  nsDialogs、nsExec、nsis7z、WinShell。portableはSystem、nsis7z、StdUtils。
  nsProcessは今回のこれらのコンテナ一覧では検出せず、バンドルにあるだけで
  アプリへ配布されると判断しない。生成されるアンインストーラーは別途確認が必要。

## 重要な未解決事項

1. **Electron内蔵FFmpegのソース提供**
   本体とElectronパッチは取得済みだが、Chromiumのビルド環境・推移的ビルド入力、
   改変ライブラリの交換・再リンク方法、配布版に対応する一式の完成と公開を確認する。
   上流URLの掲載だけで完了としない。ライブラリ改変のデバッグ目的の解析等を
   禁止する追加条件は設けない方針を配布文書に明記した。
2. **Windowsの個別プラグインと補助実行ファイル**
   UAC・WinShell・nsis7z・elevate.exe等の正確な条件・版・必要ソースを確定する。
   WinShellの公式WikiはFreeware表記であり、これだけで再配布条件を確定しない。
   nsis7zは上流で7-Zipの条件に従うとされるが、現在のDLLと版・ソースの対応は未確定。
   StdUtilsのソース公開とインストーラーへの組込み方に応じた条件も確認する。
3. **配布バイナリとタグの差異**
   nsis-resources-3.4.1のGitタグのtreeと、キャッシュのStdUtils・nsis7zのGit blobが
   一致しない。一方、配布7z自体のチェックサムはbuilderの指定値と一致する。
   タグだけを対応ソースの根拠にせず、配布DLLに合わせる。
   StdUtilsは公式1.14のDLL一致で独立に対応を確認した。nsis7zは未解決。
4. **そのほかの残存部品**
   Chromium内部の静的リンク部品、d3dcompiler_47.dll等の実ビルド・通知対応と、
   未署名の配布候補の全体監査は継続する。

## 配布物での検証

新規の未署名・未公開検証ビルドについて、21資料の原本一致、余分な旧資料の不在、
録画変換用ffmpeg-static / ffmpeg実行ファイルの不在を確認。
macOS ZIP・DMG、Windows NSIS・portableの全4形式を展開して確認した。
Windowsインストーラーは実行していない。WebM保存の動作確認は利用者申告で別管理。
WindowsはsignAndEditExecutable=falseによる検証ビルドで、正式版のリソース編集・
署名の検証を代替しない。両Windows EXEのPE証明書テーブルは空と確認。
macOS/WindowsのASAR内npm5件は現在のロックファイルと一致。

- 生成物: `release/electron-license-review/`、`release/electron-license-review-windows/`
- ハッシュと検証記録: `artifact-summary.json`、`*.licenses.json`
- 版とバイナリ: `official-binary-comparison.json`、`packaged-npm.json`
- Windows: `windows-actual-plugins.json`、`windows-toolset-*.json`、`stdutils-binary-comparison.json`
- 上流資料: `upstream-materials.json`、`evidence/`
- ソース: `source-archives.json`、`source-verification.json`
- 参照コミット: `reference-state.json`（未コミット差分がありコミット単独で再現可能とはしない）

確認コマンド:

```sh
node --test tests/packaged-licenses.test.cjs tests/recording.test.cjs
npm run build
python3 scripts/verify-electron-license-materials.py --prepare-review
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac zip dmg --x64 --publish never -c.directories.output=release/electron-license-review
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --win nsis portable --x64 --publish never -c.directories.output=release/electron-license-review-windows -c.win.signAndEditExecutable=false
```

自動テスト9件成功。ソース検証では3アーカイブ・通知原文・FFmpeg構成・パッチ適用を確認。
内部確認用の`release/electron-source-review/electron-44.0.0-INCOMPLETE-source-review.tar`
は公開可能な完全対応ソースとは表示しない。公開や外部への問い合わせ送信は行っていない。

## 一次資料

- [Electron 44.0.0 DEPS](https://github.com/electron/electron/blob/bf0c4e67e9a834479ee171e61057f7516a381d25/DEPS)
- [Electron releaseビルド設定](https://github.com/electron/electron/blob/bf0c4e67e9a834479ee171e61057f7516a381d25/build/args/release.gn)
- [Chromium FFmpegの固定ソース](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9/)
- [StdUtils 1.14の作者リリース](https://github.com/lordmulder/stdutils/releases/tag/1.14)
- [WinShellの作者による説明](https://nsis.sourceforge.io/WinShell_plug-in)
- [UACの作者による説明](https://nsis.sourceforge.io/UAC_plug-in)
- [nsis7zの作者による説明](https://nsis.sourceforge.io/Nsis7z_plug-in)
