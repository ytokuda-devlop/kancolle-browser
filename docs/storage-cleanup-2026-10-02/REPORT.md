# release・docsの生成物整理

実施日: 2026-10-02。ユーザーの整理・削除依頼に基づき、現在の配布物・対応ソース・
固定基準の作成に必要な原本を残して、古い生成物と重複を削除した。

## 削除対象

- 古いビルド: `electron-license-review`、`electron-license-review-windows`、
  `ffmpeg-removal-check`、`license-inclusion-check`、`mac-license-verification-2026-09-27`。
- 一時的なWindows用作業コピー: `license-win-stage-rejHbV`。
- ネイティブ監査用の重複した展開・ビルド先: `native-inventory-2026-09-26/`内の
  `containers`、`mac`、`portable`、`portable-app`、`setup`、`setup-app`、`uninstaller`、`verified`。
  **`final-extracted/`は検証スクリプトが参照するため保持。**
- `windows-license-review-2026-09-26/`の`build`、`extracted`、`mac`。
  同ディレクトリの`source-review/`は保持。
- `release-candidate-2026-09-26/`の`mac`・`win-unpacked`。
  配布コンテナとその検証記録は保持。
- `source-delivery-2026-09-27/downloads/`の`windows-app`・`windows-container`。
  ダウンロードした元ファイルと`upload/`は保持。
- `docs/source-delivery-2026-09-27/evidence/chromium-mac-build.md`。
  同一内容の`evidence/chromium/docs/mac_build_instructions.md`を保持し、Git管理対象にした。
- `release/`・`docs/`の`.DS_Store`。

対象は29パス、通常ファイル19,961件、合計9,377,786,111 bytes（約8.73 GiB）。
削除前の割当サイズの合計は9,461,469,184 bytes（約8.81 GiB）。
APFSの共有ブロック・スナップショット等により、実際の空き容量の増加とは一致しない場合がある。
個別の対象と完了状態は[manifest.json](manifest.json)を参照。

古いビルド直下の小さなJSON・YAML等は`retained-build-metadata/builds/`へコピーして保持した。
過去の監査報告は当時のパスとハッシュを記録した履歴なので、削除したパスを文書内で
新しい成果物へ置き換えていない。削除した旧コンテナそのものを再調査する場合は別途復元が必要。

## 保持と整理

- 現行Mac ZIP・DMG、現行の展開済みアプリ、ビルド設定、ライセンス照合結果。
- ソースアーカイブ・公開準備セット・作業状態の記録。内容や名前の新旧を理由に削除していない。
- ソース・通知・パッチ・ネイティブ監査の原典、過去の固定基準と検証結果。
- ローカル対応ソースの完全性はユーザー回答により対応済みとして扱う。

`docs/`は約4 MiBで、現行スクリプトや履歴が参照する資料が多いため、削除範囲を絞った。
[文書の案内](../README.md)と`release/README.md`で、現行成果物・必要な原本・過去の記録を区別する。

## 検証

保持対象228ファイルの削除前ハッシュをmanifestに記録した。
整理後の照合結果と、固定基準作成・ソースアーカイブ検証の結果は[validation.json](validation.json)を参照。
保持対象228ファイルは全件ハッシュ一致。固定基準を一時ディレクトリで再作成し、
録画廃止後の保存済み基準と同一内容になることを確認した。
保存済みソース資料の54ファイルもアーカイブ検証に合格した。
整理後の`du -sh`表示は`release/`が3.8G、`docs/`が4.3M。
この整理ではアプリコード・同梱通知・固定基準・配布ファイルを変更しない。
