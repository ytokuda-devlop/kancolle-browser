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
