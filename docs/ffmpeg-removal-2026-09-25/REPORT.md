# FFmpeg削除後のライセンス対応（2026-09-25）

対象: `future/kancolle-no-ffmpeg`、MediaRecorderでWebMを直接保存する構成。
録画変換用FFmpegとffmpeg-staticの削除に伴う通知・配布設定・監査処理を更新した。
独自コードのMITは維持。Electronを含む第三者部品には個別の条件が適用される。

## 変更

- README、THIRD_PARTY_NOTICES.md、licenses/DISTRIBUTION-NOTES.txtを現構成に更新。
- 本番npm依存はReact、React DOM、Scheduler、loose-envify、js-tokensの5件。
  原文ライセンスとロックファイルの版を照合。各MIT。
- package.jsonのextraResources.filterに現行資料8ファイルを明示。
  ルートLICENSEとTHIRD_PARTY_NOTICES.mdを含め配布資料は10ファイル。
- 旧FFmpegのGPL本文・専用依存通知・対応ソース調査は配布対象から除外。
  ソースツリーの原文・アーカイブ・過去の調査記録は保持する。
- FFmpeg-SOURCE.txtに旧構成の記録である旨を明記。
  旧TASK・旧配布方針の写しはこのディレクトリのpreviousファイルに保存。
- afterPackと最終コンテナ検証は明示資料を原本照合し、余分な資料の混入も検出。
  ASARとresources内のffmpeg-static、ffmpeg／ffmpeg.exeはビルドエラーにする。
  Electronのlibffmpeg.dylib／ffmpeg.dllはこの拒否対象に含めない。
- macOS/Windowsの現行監査スクリプトを更新。旧FFmpeg専用調査スクリプトは
  過去資料の保守用として残し、現行リリース判定には使用しない。

## 検証

- node --test tests/packaged-licenses.test.cjs tests/recording.test.cjs: 9件成功。
  欠落・改変・空資料、最終ZIP欠落、旧資料混入、ASAR内／外の旧FFmpeg混入を検出。
  Electron内蔵ライブラリを拒否しないことも確認。
- npm run build: 成功。
- macOS x64の未署名・未公開アプリと最終ZIPを新規ビルドし、10資料の一致と
  録画変換用FFmpegの不在を確認。ASAR内npm5件は現行ロックファイルと一致。
- ElectronのLICENSEとLICENSES.chromium.htmlはインストール済み配布原文と一致。
- 利用者がmacOSで録画・音声同期・シークを確認済み（今回のライセンス検証とは別）。

証拠:

- source-license-check.json: 本番npmとElectron原文の照合
- mac-packages.json: 展開済みアプリのnpm版の照合
- mac-zip-licenses.json: 最終ZIPと収録資料のハッシュ、不在検証
- mac-inventory.json: アプリ・Electron版、ネイティブ部品、通知照合、参照コミットと差分

成果物: `release/ffmpeg-removal-check/`。
再現コマンド（macOS、署名・公開なし）:

```sh
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac zip --x64 --publish never -c.directories.output=release/ffmpeg-removal-check
```

## 残る作業

- Windows最終成果物とmacOS DMGの新構成での検証。
- Electron内蔵FFmpegの正確なビルド・条件・必要な通知とソース提供の確認。
- Mantle・ReactiveObjC、WindowsのNSIS等、従来から残る第三者部品の監査。
- 全配布対象の最終ハッシュとビルド元の確定。

今回の変更は削除した部品に関する負担を整理するもので、配布全体の適合性を
確定した記録ではない。旧版に適用される条件も取り消さない。
FFmpegの適用条件がビルド構成に依存する根拠: https://ffmpeg.org/legal.html
