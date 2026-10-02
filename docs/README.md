# 文書・検証記録の案内

## 現行版

- [ライセンス収録・配布物の検証手順](LICENSE-PACKAGING.md)
- [録画廃止後のMac配布物の照合結果](recording-removal-review-2026-10-02/REPORT.md)
- [対応ソース確認の記録](recording-removal-review-2026-10-02/SOURCE-REVIEW.md)
  — ローカル対応ソースの完全性はユーザー回答により対応済みとして扱う。
- [生成物の整理・削除記録](storage-cleanup-2026-10-02/REPORT.md)

## ソース資料と検証スクリプトが使用する記録

- `electron-license-review-2026-09-25/`: 固定ソース取得記録、原文、パッチ、Electron調査。
- `native-inventory-2026-09-26/`: ネイティブ部品の監査基準。新しい固定基準の作成でも使用する。
- `source-delivery-2026-09-27/`: ソース資料の梱包入力と構築・交換手順。
- `windows-license-review-2026-09-26/`: Windows部品の原典と調査記録。
- `compiler-rt-review-2026-10-02/`: ローカルの追加調査資料。

日付が古くても現行の検証やソース資料の組立に使用するため、上記の名前・配置は維持する。

## 過去の検証履歴

- `ffmpeg-removal-2026-09-25/`: 旧録画変換用FFmpegの撤去記録。
- `release-candidate-review-2026-09-26/`: 過去の正式候補の固定基準と結果。
- `mac-license-verification-2026-09-27/`: 過去のMac候補の照合結果。
- `license-inclusion-2026-09-24.*`: 初期構成のライセンス収録記録（ローカル資料）。

過去の結果は、その記録にあるハッシュの成果物についての証拠として保持する。
整理により削除した過去の生成物のパスは、当時の記録の中では書き換えない。
現在の実在ファイルと削除範囲は整理記録を参照する。
