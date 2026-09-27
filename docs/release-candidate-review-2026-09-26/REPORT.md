# 正式配布候補の版・通知の最終照合

ユーザー指定により、現在のブランチの最新**未署名ビルド**を正式候補として照合した。
アプリ1.0.0、Electron44.0.0、npm5件、通知28件について4形式で照合済み。
今回の結果は署名済み・公証済み・ライセンス課題全件解決済みという意味ではない。

## 候補の修正

前回の検証用Windows EXEは`signAndEditExecutable=false`で作られていたため、
ASARのアプリ版は1.0.0でも、EXEのProductNameはElectron、FileVersion/ProductVersionは44.0.0だった。
正式候補としてこの不一致を検出し、**署名だけを無効にする**設定で再生成した。
アプリの機能やライセンス原文は変更していない。

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac zip dmg --win nsis portable --x64 --publish never -c.directories.output=release/release-candidate-2026-09-26 -c.win.signExecutable=false
```

候補の場所: `release/release-candidate-2026-09-26/`。
外部への公開・push・署名鍵の利用は行っていない。

## 照合対象と結果

| 項目 | 確認 |
| --- | --- |
| アプリの版 | 全形式のASAR package.jsonが1.0.0 |
| macOSの表示版・ビルド版 | Info.plistが1.0.0 |
| Windowsの表示版・数値版 | アプリEXE・Setup/portable・生成アンインストーラーの版が1.0.0相当。3桁/4桁の表記差のみ許容 |
| Windowsの製品名 | アプリ名「艦娘は今日もお仕事です（仮）」と一致 |
| Electron | ロックと通知が44.0.0。macOS frameworkの版も44.0.0。両OSのコード領域が公式版に対応する監査済み基準と一致 |
| npm | react/react-dom18.3.1、scheduler0.23.2、loose-envify1.4.0、js-tokens4.0.0の5件。各版・MIT表記が基準と一致 |
| 通知 | 28資料が原本とバイト一致。余分な資料・旧録画変換用FFmpegの混入なし |
| ネイティブ部品 | macOS13ファイル・Windowsアプリ8ファイルの一覧とコード領域が監査済み基準と一致。Windows補助部品の版リソースも照合 |
| Windowsインストーラーの部品 | 別の原本照合スクリプトでもDLL・スタブ・elevateを照合 |
| 署名 | 今回は全候補のアプリとWindowsコンテナが未署名。署名必須モードでは実際の未署名portableが拒否された |

コード領域の比較はmacOSの`__text`、Windowsの`.text`。
署名やWindowsリソース編集で全体ハッシュが変わっても比較できる一方、
全セクションの一致や署名者の身元をそれだけで証明するものではない。
各成果物の全体SHA-256も別に保存し、検査の前後に変化しなかったことを確認した。

詳細:

- [macOS ZIP](mac-zip.json)
- [macOS DMG](mac-dmg.json)
- [Windows Setup](windows-setup.json)
- [Windows portable](windows-portable.json)
- [Windows部品の原本照合](windows-components.json)
- [署名必須モードの拒否確認](unsigned-rejection.json)
- [固定した照合基準](baseline.json)
- [正式候補4形式のSHA-256一覧](artifact-set.json)
- [参照コミットと作業ツリーのハッシュ記録](working-state.json)

コミットされていない変更を含むため、参照コミットだけから再現できるクリーンビルドとは記録していない。

## 配布方針と再照合

本プロジェクトは未署名版のみを配布する。署名版の作成・署名後の照合は対象外とし、残タスクに含めない。
再ビルド・再梱包した場合は最終成果物の版・通知・ハッシュを再照合する。

```sh
node scripts/verify-release-candidate.cjs path/to/artifact docs/release-candidate-review-2026-09-26/baseline.json path/to/report.json
```

今回の記録とbaseline.jsonは照合時点の原本として保持する。
本方針の追記により配布対象のDISTRIBUTION-NOTES.txtが更新されているため、
既存の成果物・基準を現行資料と一致するものとして扱わない。
次回の候補作成時に変更内容を確認した新しい基準を作成し、再照合する。

新しい基準を作る`--freeze`は、監査済みネイティブ部品と公式Electronの一致を確認した後に使用する。
現在の生成処理は今回のElectron44.0.0/x64と既存の監査資料を前提とし、既存ファイルを上書きしない。

## 検査の追加と限界

`verify-release-candidate.cjs`を追加し、最終コンテナの既存検査に読取り用の追加検査口を設けた。
署名済みのPEも読めるが、リソースや証明書を書き換えない。
依存通知・package.json・ロックファイル等のハッシュを基準へ固定し、
ソース側の変更で古い成果物を誤って承認しないようにした。

既存の録画/収録資料テストに、旧Windows版情報、製品名不一致、署名未検証、基準からの資料変更、
検査中のコンテナ変更の検出を加えた。計13件成功。

このタスクで完了したのは指定された未署名候補の版と通知の照合。
WinShell/elevateの条件、LGPL対応ソース・交換手順、静的依存の包括監査などの残件は継続する。
