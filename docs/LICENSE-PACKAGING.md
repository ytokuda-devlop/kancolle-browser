# 配布成果物へのライセンス収録

## 録画機能廃止後の構成（2026-10-02）

現行コードから録画機能を削除した。スクリーンショット保存は継続する。
Electron内蔵FFmpeg、対応する通知・ソース資料、旧録画変換用FFmpegの混入検査は維持する。
旧FFmpegの調査資料と過去の監査結果は履歴として保持する。

今回の変更では配布成果物を再生成していない。以下の過去の照合結果は録画廃止後の
成果物の検証結果ではない。通知文書の変更により既存の固定基準は一致しなくなるため、
次回配布時は新しい基準ファイルを作成し、再ビルドした最終成果物を検証する。
過去の`baseline.json`や監査結果を上書きして現行版の結果として扱わない。

```sh
node scripts/verify-release-candidate.cjs --freeze path/to/new-baseline.json
node scripts/verify-release-candidate.cjs path/to/new-artifact path/to/new-baseline.json path/to/new-report.json
```

録画廃止後の動作確認は、ゲーム表示・音声再生、PNGキャプチャ、遠征・入渠・建造の
カウントダウン、ポイント画面、録画ボタンがないことを対象とする。
Electron内蔵FFmpegの改変版交換を確認する場合も、現行版で提供する再生機能を検証し、
読み込まれたライブラリの識別と交換前後のハッシュを記録する。
過去の手順にある録画・WebM保存の確認は録画対応版にのみ適用する。

## 過去の成果物と共通の収録手順

正式候補の版・通知の照合は[2026-09-26の最終照合記録](release-candidate-review-2026-09-26/REPORT.md)を参照。
`verify-release-candidate.cjs`は固定した基準を使い、アプリ版・Electronのコード領域・
npmの版と条件・ネイティブ一覧・通知原文を最終コンテナから確認する。
本プロジェクトは未署名版のみを配布する。再ビルド・再梱包した場合は最終成果物を再検査する。

対応ソースの添付用資料と残件は[2026-09-27の整備記録](source-delivery-2026-09-27/REPORT.md)を参照。
Xcode工程はスキップ、アップロードはユーザーが実施する。完全対応ソースの完成・公開は未完了。

Macの再検証は[2026-09-27の記録](mac-license-verification-2026-09-27/REPORT.md)を参照。
既存ZIP・DMGのソース通知の追補漏れを確認し、原本を収録した新しいZIP・DMGを別フォルダに生成した。
両形式で版・通知28件・npm5件・ネイティブ13件の照合が成功。Xcodeを使う改変版の検証はスキップ。

```sh
node scripts/verify-release-candidate.cjs path/to/artifact docs/release-candidate-review-2026-09-26/baseline.json path/to/report.json
```

Windows候補の作成には`-c.win.signExecutable=false`を使い、
`signAndEditExecutable=false`でアプリの版情報編集まで止めない。

`package.json`の`build.extraResources`は、ルートの`LICENSE`と
`THIRD_PARTY_NOTICES.md`と、`licenses/`の`filter`に明示した現行資料をASAR外に収録する。
旧FFmpegの調査資料・GPL本文・不要になった依存通知・開発ツール通知は配布しない。
原本は調査履歴としてソースツリーに保持する。
Electron内蔵FFmpegのLGPL本文・macOSフレームワーク・WindowsのNSIS/StdUtils通知は
現行資料として収録する。UAC・nsis7z・elevate原典・electron-builderの通知と
Windows個別ソース記録を追加し、nbytesの原文通知も追加し、現時点の資料数はルート2件を含め28件。
Windows部品の確定事項・残件は[2026-09-26の報告書](windows-license-review-2026-09-26/REPORT.md)を参照。

| 配布先 | 閲覧場所 |
| --- | --- |
| macOSアプリ（ZIP／DMG内を含む） | `KancolleBrowser.app/Contents/Resources/licenses/` |
| Windowsインストール先 | `resources/licenses/` |
| Windows portable | 内部アプリの`resources/licenses/`（実行時に展開される） |

macOSでは「パッケージの内容を表示」から閲覧できる。
`LICENSES.chromium.html`も省略せず、そのまま収録する。

## ビルド時の検証

通常の`npm run package`／`npm run dist:mac`／`npm run dist:win`に組み込まれている。

1. `afterPack`で、展開済みアプリの全ライセンスを原本とバイト単位で照合する。
2. `artifactBuildCompleted`で、完成したZIP・DMG・NSIS・portableを
   新規一時ディレクトリへ展開し、同じ照合を行う。
   DMGは読み取り専用でマウントし、終了時に解除する。
   Windowsインストーラーは実行せず、内包する全`app-*.7z`を検証する。
3. 欠落、空ファイル、内容不一致、選択外資料の混入、展開失敗はビルド失敗となる。
   ASARとresources内のffmpeg-static、ffmpeg／ffmpeg.exeの混入も失敗させる。
   Electron自身のlibffmpeg.dylib／ffmpeg.dllは保持する。
   成功時は成果物の隣に`<成果物名>.licenses.json`を保存する。
   記録には成果物SHA-256と各ライセンスのパス・サイズ・SHA-256が含まれる。

最終コンテナの検証はelectron-builderの成果物通知より前に実行する。
`--dir`はコンテナを作らないため、`afterPack`による検証のみ行う。
DMG検証はmacOSの`hdiutil`、ZIPはmacOSの`ditto`または7-Zip、
Windows実行ファイルはNSIS対応7-Zipを利用する。
ツールやマウント権限が不足する場合も検証をスキップせず失敗させる。

## 手動での再検証

```sh
node scripts/verify-packaged-licenses.cjs '<展開済みアプリのresourcesディレクトリ>'
node scripts/verify-artifact-licenses.cjs '<ZIP・DMG・EXEのパス>' '<記録JSONのパス>'
node --test tests/packaged-licenses.test.cjs
```

記録は検証したハッシュの成果物にのみ有効。再ビルド・再梱包後は再検証する。
ライセンス収録と録画変換用FFmpeg不在の確認は、Electron内蔵FFmpeg等の
適用条件・必要な対応ソースの確認完了を意味しない。

2026-09-24の旧構成の検証結果は今回の成果物へ流用しない。
今回の変更記録は[FFmpeg除去後の対応](ffmpeg-removal-2026-09-25/REPORT.md)を参照。
