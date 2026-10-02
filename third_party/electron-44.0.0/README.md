# Electron 44.0.0のソース調査資料

録画変換用FFmpegの旧ソースとは別の資料。
アーカイブはGit管理・アプリ同梱の対象外。取得URLとSHA-256は
`docs/electron-license-review-2026-09-25/source-archives.json`に固定する。
不足しているファイルは同JSONのURLから同じpathへ保存する。

検証と内部確認用パッケージ作成:

```sh
python3 scripts/verify-electron-license-materials.py --prepare-review
```

`release/electron-source-review/electron-44.0.0-INCOMPLETE-source-review.tar`は
内部確認用。完全な対応ソースとして公開しない。公開・署名はこの処理では行わない。
残作業は`licenses/ELECTRON-SOURCES.txt`と調査REPORT.md参照。

2026-09-27: Chromiumのビルド設定、Opus、NASM、depot_tools等を追加取得。
URL・ハッシュは`docs/source-delivery-2026-09-27/build-materials.json`を参照。
`python3 scripts/prepare-electron-source-delivery.py`で添付用のソース資料を生成する。
完全な対応ソースの判定は保留。Xcode工程はユーザー指定でスキップ。
公開はユーザーが行い、完成・公開済みとはまだ扱わない。
手順と残件は`docs/source-delivery-2026-09-27/REPORT.md`を参照。

2026-09-27追補: Chromium build/buildtools、生成ツール、Opus、NASMを追加取得。
固定URL・Git tree・SHA-256は調査ディレクトリの
`supplemental-source-archives.json`、FFmpeg再取得記録は
`source-reacquisition.json`を参照。取得スクリプトは
`scripts/acquire-electron-build-inputs.py`。
ビルドと交換の確認手順・公開先v1.0.0の状態は
`docs/electron-license-review-2026-09-25/BUILD-AND-REPLACEMENT.md`に記録した。
追加資料だけでは全ビルド入力が揃ったとは扱わない。
