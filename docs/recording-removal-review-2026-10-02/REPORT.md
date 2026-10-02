# 録画機能廃止後のMac配布成果物の最終照合

検証日: 2026-10-02。既存の検証スクリプトで新しい通知の固定基準を作成し、
ユーザーが生成したMac x64 ZIP・DMGを検証した。両形式とも成功。
配布ファイルの再生成・変更・公開は行っていない。

## 対象と結果

| 項目               | ZIP・DMGの結果                                                                      |
| ------------------ | ----------------------------------------------------------------------------------- |
| アプリ             | Kancolle-browser 1.0.0                                                              |
| Electron           | 44.0.0、コード領域が監査済み基準と一致                                              |
| 同梱通知           | 28件が現行原本とバイト一致。欠落・余分な資料なし                                    |
| 本番npm            | react、react-dom、scheduler、loose-envify、js-tokensの5件。版・条件が固定基準と一致 |
| ネイティブ部品     | 13件。構成・コード領域が監査済み基準と一致                                          |
| 旧録画変換用FFmpeg | ffmpeg-static・独立したffmpeg実行ファイルの混入なし                                 |
| 署名               | 両形式のアプリは未署名。未署名配布方針に基づく検証                                  |
| ASAR               | ZIP・DMGで同一SHA-256                                                               |

### ファイルとSHA-256

- ZIP: `release/kancolle-browser_1.0.0_mac.zip`
  - `c4e444f7a68602a703a63d4f964ffbe40a8fb7f87110410e74c3aa9256d7e778`
- DMG: `release/艦娘は今日もお仕事です（仮）-1.0.0.dmg`
  - `45ceb6ca806b87aeb720e2fb41fa560063e301971a5d27bd150c24d2740f131a`
- 固定基準: [baseline.json](baseline.json)
  - `98011a92bea93335dae3c042a20ce305f386dd879059ca9c885b6cc92461d3c2`
- 共通ASAR
  - `621ba0750434ceb9ae8c59dc32feb113b41ddcc74536898d408e4b40fa934b99`

現在のZIPはビルド時の製品名付きZIPの検証記録とハッシュが一致する。
以前同じ`kancolle-browser_1.0.0_mac.zip`名で置かれていた旧版とは区別し、ハッシュで特定する。
DMGは検証対象に含めたが、公開対象へ追加する判断は行っていない。

## 記録と再実行

- [ZIP検証結果](mac-zip.json)
- [DMG検証結果](mac-dmg.json)
- [対象ハッシュと検証時のGit状態](artifact-set.json)

固定基準は`package.json`・ロックファイル・通知原本の30ファイルをハッシュ固定する。
ネイティブ部品については2026-09-26の監査済み実物とインストール済みElectronを照合し、
既存の`verify-release-candidate.cjs --freeze`で作成した。
過去の固定基準・検証記録は変更していない。

```sh
node scripts/verify-release-candidate.cjs --freeze docs/recording-removal-review-2026-10-02/baseline.json
node scripts/verify-release-candidate.cjs release/kancolle-browser_1.0.0_mac.zip docs/recording-removal-review-2026-10-02/baseline.json docs/recording-removal-review-2026-10-02/mac-zip.json
node scripts/verify-release-candidate.cjs 'release/艦娘は今日もお仕事です（仮）-1.0.0.dmg' docs/recording-removal-review-2026-10-02/baseline.json docs/recording-removal-review-2026-10-02/mac-dmg.json
```

上記は今回実行したコマンド。固定基準の作成は既存ファイルがあると失敗する。
再検証時は保存済み基準を使い、結果は別名へ出力する。
DMGはサンドボックス内でマウントできなかったため、許可を得て制限外で読み取り専用マウントし、
照合後にアンマウントした。ZIP・DMGとも検証前後の成果物ハッシュが一致した。

## 範囲

ユーザーから、完成した配布ファイルでゲーム表示・音声再生・PNGキャプチャ・
遠征／入渠／建造のカウントダウン・ポイント画面・録画ボタンがないことの確認済み申告あり。

今回はMacの2成果物を静的に検証した。Windowsの録画廃止後の成果物に対する固定基準での
静的照合は今回未実施。Windows実機での動作確認済み申告とは区別する。
検証時HEADは`c3a7023f9105f38f5a177ca83de4b3e755393727`だが、ビルド元コミットの証明ではない。
この照合成功は、Electron等の対応ソース提供・残るライセンス調査の完了を示すものではない。

対応ソースの再確認結果は[SOURCE-REVIEW.md](SOURCE-REVIEW.md)を参照。
旧添付用資料の整合性は確認済み。その後、ローカル対応ソースの完全性は対応済みとの
ユーザー回答を受け、その前提で扱う。旧アーカイブの確認結果をローカル全体の不足判定に使わない。
公開はユーザー回答時点で未実施。
