# macOS ZIPの公開方針（2026-10-02）

ユーザー指定の`release/kancolle-browser_1.0.0_mac.zip`をそのまま公開対象に固定する。
DMGは非公開とし、GitにもGitHub Releasesにもアップロードしない。
通常のelectron-builder macターゲットをZIPのみに変更した。
Windows側の配布形式・検証済みとのユーザー申告は変更しない。
アップロードはユーザーが行う。今回、外部への公開操作は行っていない。

## 固定する実物

- ZIP SHA-256: `9e7179f3f7309d5ac931e42b10e294d3bfb910cbe704181ee1a51e616c8007c3`
- アプリ1.0.0 / Electron44.0.0 / macOS x64。
- 内蔵FFmpeg SHA-256: `0ea472e75cdf7fb5b2786bf1c5d84fa81b1638199cc01008db58de2616a764c1`
- ソース資料: `electron-44.0.0-source-materials-2026-09-27.tar.gz`
- ソース資料SHA-256: `fc497d1313aed57ee32c52e122a49daeb3322f55b3906386111e0067f9cee360`

このZIPは9/27に別フォルダへ再生成した検証用ZIPとは異なる。
指定ZIPの通知は28件。現行原本との差分は`ELECTRON-SOURCES.txt`の9/27追補だけ。
指定ZIP自体は変更せず、現在の同通知をReleaseへ別添する。
別添は追補の提供であり、ZIP内部の原本一致検査が成功するようになったという意味ではない。
`publication.json`に検査したZIPとソース資料の対応・差分を記録する。

## 公開セット

```sh
python3 scripts/prepare-mac-publication.py
```

`release/mac-publication-2026-10-02/`に次の6ファイルを配置する。
コピー元のハッシュを検証してから作成する。指定ZIPと既存ソース資料は上書きしない。

1. `kancolle-browser_1.0.0_mac.zip`
2. `electron-44.0.0-source-materials-2026-09-27.tar.gz`
3. `ELECTRON-SOURCES.txt`（ZIPに未収録の追補を含む現行通知）
4. `publication.json`（対象ZIP・ソース資料の対応と未完了事項）
5. `SHA256SUMS.txt`
6. `RELEASE-NOTES.md`（Release説明への追記用。添付してもよい）

1〜5を公開先の同じReleaseへ添付し、6を説明へ追記する。
既存の添付ファイルがある場合、名前だけで同一と判断せずハッシュを照合する。
DMG・blockmap・latest-mac.yml・他の検証用成果物は今回の添付対象に含めない。
このアプリでは自動更新用メタデータの配布を今回の作業対象にしていない。

Gitには方針・検査記録・スクリプトを含める。成果物は`release/`のignoreを維持する。
DMGは別の場所へコピーされた場合も`.gitignore`で除外する。
今回の確認時点でGit追跡中のDMGはなかった。

## 未完了事項と次の作業

ソース資料は収集済み資料の提供であり、完全な対応ソースの完成とは判定していない。
10/2に[FFmpegの提供範囲](../ffmpeg-source-scope-2026-10-02/README.md)を追加調査した。
本体・直接依存・パッチは確認済み。共通ビルド設定のランタイム等が追加確保対象として具体化した。
DMGの非公開化は配布形式の変更であり、ZIPに含まれる同じFFmpegの依存入力の残件は残る。

- 固定版のgclient同期・GN依存グラフ・生成入力・コンパイルとリンク記録を取得する。
- 既存キャッシュに依存しない再構築で不足する入力を特定し、提供資料へ追加する。
- Windowsの検証済みとの申告に対応するソース・設定・交換結果の記録を照合する。
- MacのXcodeを必要とする再ビルド・交換後検証はユーザー指定でスキップ。
- 手動公開後、未認証で添付ZIPとソース資料等を取得し、ハッシュを照合する。

公開先は設定上`ytokuda-devlop/kancolle-browser`のRelease `v1.0.0`。
10/2の未認証API確認は404で、公開状態を確定できていない。
この公開セットの作成をもって公開済み・全ライセンス課題解消済みにはしない。
