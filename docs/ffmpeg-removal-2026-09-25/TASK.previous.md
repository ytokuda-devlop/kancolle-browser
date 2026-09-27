# 配布前ライセンス対応タスク

この文書は、アプリケーションのバイナリ配布を開始する前に完了させる
ライセンス関連タスクを管理する。READMEに記載する内容は対象外とする。

## 完了条件

以下の必須タスクがすべて完了し、配布対象となる各OSの最終成果物について
ライセンス監査を実施できた時点で、ライセンス面の配布準備完了とする。

## P0: 配布前に必ず完了するタスク

### 1. FFmpegおよびffmpeg-staticの配布方針を確定する

- [x] GPL-3.0-or-laterの`ffmpeg-static`を直接`require`する現在の構成を維持するか決定する
- [x] 現在の構成を維持する場合、MITの独自コードとGPL対象物を含む配布物に適用される条件を確認する
- [x] 必要に応じて、FFmpegを独立した外部プログラムとして扱う構成への変更を検討する
- [x] 判断が困難な場合は、実際の配布方式を示したうえで専門家へ確認する
- [x] 決定内容と根拠をこの文書または別の配布記録へ残す

完了条件:

- 採用する構成と、アプリ独自コード・`ffmpeg-static`・FFmpegバイナリの
  それぞれに適用されるライセンスが説明できる
- 配布物を単に「すべてMIT」と誤認させる表示がない

#### 決定記録（2026-09-21）

`ffmpeg-static` 5.3.0を実行時依存として直接`require`する現在の構成を
維持する。

適用条件は、GPLv3本文、GNU GPL FAQ、FFmpeg公式のライセンス案内、および
現在の実装を照合し、次のとおり整理した。この記録は技術的な確認であり、
正式な法律意見ではない。

- アプリ独自コードの原著作物としてのライセンスはMITのままとする。MITは
  GPLと両立するが、GPLコードと結合した配布物にMITだけを適用することは
  できない。MITの著作権表示と許諾表示も引き続き収録する。
- `electron/services/mediaService.js`はGPL-3.0-or-laterのJavaScriptパッケージ
  `ffmpeg-static`を同じNode.jsプロセス内で直接`require`する。この構成は、
  別作品の単なる同梱ではなく結合作品と評価される可能性があるため、配布時は
  アプリと`ffmpeg-static`から成る結合作品全体をGPL-3.0-or-laterの条件で
  提供する。配布物を「MITのみ」と表示しない。
- 上記結合作品を配布する際は、GPLv3本文と既存の著作権・ライセンス・無保証の
  表示を保持し、受領者にGPLv3上の権利を認め、追加の制限を課さない。結合作品の
  完全な対応ソース（独自コード、`ffmpeg-static`、配布した版を生成・インストール
  するために必要なビルドスクリプト等）を、GPLv3第6条で認められた方法により
  提供する。ソースは配布したオブジェクトコードと一致させる。
- `ffmpeg-static`が示すFFmpeg実行ファイルは、`child_process.spawn()`で起動し、
  コマンドライン引数、入出力ファイル、標準エラー、終了コードだけで通信する
  別プロセスである。この境界は独立したプログラムの集合（aggregate）として
  扱える可能性が高く、FFmpegのGPLがこの理由だけでアプリ独自コードへ及ぶとは
  判断しない。ただし、同梱するFFmpegバイナリ自体については、対応するGPL本文、
  表示、正確な完全対応ソース、ビルド情報、および静的リンクされたライブラリの
  ソースを別途提供する。
- EULAや配布条件で、GPL対象部分の複製・改変・再配布、適法な解析等をGPLより
  狭く制限しない。GPLv3第6条の「User Product」に該当する形でオブジェクトコードを
  配布する場合は、同条が要求するInstallation Informationも提供する。
- 実際のパッケージングで依存関係の結合方法や通信方法を変更した場合、または
  GPLの適用範囲をMIT部分へ及ぼさない運用が必要になった場合は、再評価して
  専門家へ確認する。

確認根拠:

- GNU GPLv3 第4条から第6条（表示、結合作品、aggregate、対応ソース）
  <https://www.gnu.org/licenses/gpl-3.0.html>
- GNU GPL FAQ「Mere Aggregation」「GPL and plug-ins」（同一プロセスでの結合と、
  `exec`、パイプ、コマンドライン等で通信する別プログラムの区別）
  <https://www.gnu.org/licenses/gpl-faq.html#MereAggregation>
- GNU「Various Licenses and Comments about Them」（MIT/Expat LicenseはGPL互換）
  <https://www.gnu.org/licenses/license-list.html#Expat>
- FFmpeg License and Legal Considerations（GPL部分を有効にしたビルドではFFmpeg
  全体にGPLが適用され、配布バイナリに正確に対応するソースが必要）
  <https://ffmpeg.org/legal.html>
- `ffmpeg-static` 5.3.0の`package.json`（`GPL-3.0-or-later`）および
  `electron/services/mediaService.js`の現在の実装

#### 構成変更に関する決定（2026-09-23）

利用者との確認により、FFmpegを独立した外部プログラムとして扱うための
追加の構成変更は不要と決定した。現在のソースコード構成を維持する。

根拠:

- `electron/services/mediaService.js`は、`require('ffmpeg-static')`で実行ファイルの
  パスを取得し、`child_process.spawn()`でFFmpegを別プロセスとして起動している。
  FFmpeg実行ファイルは配布物に同梱するが、アプリと同じプロセスにFFmpegの
  ライブラリをリンクする構成ではない。同梱と別プロセス実行は両立する。
- アプリ内に読み込むJavaScriptパッケージ`ffmpeg-static`と、別プロセスで
  動作するFFmpeg実行ファイルは区別する。前者を含む結合作品をGPL条件で
  配布する方針は採用済みのため、これを避けるための依存除去やパス取得方法の
  変更は行わない。
- この決定は上記の配布方針と実装に基づくものであり、別プロセス実行だけを
  理由にGPL上の義務がなくなると判断したものではない。対応ソースの確保・提供、
  ライセンス表示、最終成果物の監査は引き続き実施する。

配布対象はmacOS arm64（Apple Silicon）・macOS x64（Intel）・Windows 11 x64、
公開先はGitHub Releasesとする。対応ソースも同じリリースへの添付を計画する。
配布方針は`licenses/DISTRIBUTION-NOTES.txt`、対応ソースの準備状況は
`licenses/FFmpeg-SOURCE.txt`にも記録している。

専門家への確認は実施していない。依存関係・通信方法・配布条件の変更等で
判断が困難になった場合の確認項目として残す。

### 2. OS別FFmpegバイナリの対応ソースを確保する

- [x] 配布対象OSとCPUアーキテクチャを確定する
  - 2026-09-23: macOSはarm64（Apple Silicon）・x64（Intel）の両方に確定。
    Windows 11はx64に確定。
    アプリ公開先はGitHub Releases。対応ソースも同じリリースへの添付を計画する。
- [ ] 各成果物に入るFFmpegバイナリの提供元とハッシュ値を記録する
- [x] 各バイナリについて`ffmpeg -version`の出力を保存する
  - [x] macOS x64: 2026-09-23、既存の展開済みアプリ内のバイナリで実行。
        `licenses/ffmpeg/darwin-x64/version.txt`に保存（終了コード0）。
- [x] 各バイナリについて`ffmpeg -L`の出力を保存する
  - [x] macOS x64: 2026-09-23、同じバイナリで実行。
        `licenses/ffmpeg/darwin-x64/license.txt`と`license-stderr.txt`に保存（終了コード0）。
- [ ] FFmpeg本体の正確なバージョンと対応ソースを確保する
  - [x] Windows x64: `6.1.1-essentials_build-www.gyan.dev`。
        提供元指定コミット`e38092ef9395d7049f871ef4d5411eb410e283e0`の
        本体上流ソースを`third_party/ffmpeg/win32-x64/`に保存済み（Git管理対象）。
        2026-09-24、SHA-256・全8288エントリ・RELEASE・提供元README・
        保存済み実行記録の対応を再検証。`python3 scripts/verify-ffmpeg-source.py`で再確認可能。
        この環境にWindows成果物はなく、バイナリは既存の実行・ハッシュ記録による確認。
  - [ ] macOS x64: `6.1.1-tessus`の実行記録あり。本体ソースの対応確認・確保は別途対応。
        現行の`licenses/DISTRIBUTION-NOTES.txt`に従いarm64は今バージョン非対応。
        本体上流ソースの取得と、以下のパッチ・依存物を含む完全な一式の確保は区別する。
- [ ] 静的リンクされたx264、x265等のライブラリと、その対応ソースを確認する
  - [x] Windows x64: READMEの33件とconfigureにのみ版情報なしで現れる9件を照合。
        AMF・AviSynthPlus・ffnvcodecはヘッダー／実行時DLLとして区別する。
  - [x] 保存済み実行記録のx264・libaom・libvpx・libassのrevisionと上流ソース候補を照合。
        FriBidi 1.0.13・HarfBuzz 8.3.0は基本版のみ整合（revisionは未確定）。
  - [ ] x265のREADME版と実行時版の不一致、oneVPLのrevision、版不明ライブラリ、
        推移的依存物と提供元パッチを確定する。全体の完了扱いにはしない。
        検証・復元: `python3 scripts/verify-library-sources.py --restore`。
        詳細: `licenses/ffmpeg/win32-x64/LIBRARY-SOURCES.md`。
- [ ] 適用されたパッチ、ビルドスクリプト、ビルドに必要な資料を確認する
- [ ] GPLが要求する方法で完全な対応ソースを利用者へ提供できる状態にする
- [ ] ソースの取得先と提供方法を`licenses/FFmpeg-SOURCE.txt`へ記録する

注意:

- 今回のmacOS x64の実行対象パス・SHA-256・実行日時・標準出力／標準エラーの
  原文は`licenses/ffmpeg/darwin-x64/capture.json`に保存した。
  ZIP／DMG内のバイナリとの照合は未実施。リリース時に同一性を確認し、
  バイナリを変更した場合は再取得する。
- FFmpeg公式サイトの最新版ソースへの一般的なリンクだけで完了とはしない
- OSごとに取得されるバイナリが異なる場合は、OSごとに個別確認する
- 現在の`licenses/ffmpeg-build-configuration.txt`はmacOS環境の記録であり、
  Windows版やLinux版の証拠としては使用しない

完了条件:

- 配布した各FFmpegバイナリから、それに対応するソースとビルド情報を
  一意にたどることができる
- 配布物または案内された提供場所から、ライセンス条件に従ってソースを取得できる

### 3. 不足しているnpm依存物のライセンス表示を追加する

- [x] `agent-base` 6.0.2のREADMEに含まれるMITライセンスと著作権表示を、
      `licenses/npm/agent-base-LICENSE.txt`へ原文のまま収録する
- [x] `https-proxy-agent` 5.0.1のREADMEに含まれるMITライセンスと著作権表示を、
      `licenses/npm/https-proxy-agent-LICENSE.txt`へ原文のまま収録する
- [x] 両ファイルに次の著作権表示が保持されていることを確認する

```text
Copyright (c) 2013 Nathan Rajlich <nathan@tootallnate.net>
```

対応記録（2026-09-23）:

- インストール済みパッケージと`package-lock.json`の上記バージョンの一致を確認。
- 各READMEのMITライセンス節を収録。プレーンテキスト表示のため、メールアドレスの
  `&lt;`・`&gt;`のみ`<`・`>`へ変換し、それ以外の本文・改行は保持した。
- 追加ファイルを元のライセンス節と照合し、著作権表示・許諾条件・免責条項の一致を確認。

完了条件:

- 実行時npm依存物について、ライセンス原文または必要な通知が
  `licenses/`配下にすべて存在する

### 4. THIRD_PARTY_NOTICES.mdの配布向け参照先を修正する

- [x] `node_modules/electron/LICENSE`を`licenses/electron-LICENSE.txt`へ置き換える
- [x] Chromium通知の参照を`licenses/LICENSES.chromium.html`へ統一する
- [x] React、React DOM、Schedulerの参照を`licenses/`配下のファイルへ置き換える
- [x] `ffmpeg-static`の参照を`licenses/ffmpeg-static-GPL-3.0.txt`へ置き換える
- [x] `agent-base`と`https-proxy-agent`の個別ライセンスファイルを案内する
- [x] `licenses/FFmpeg-SOURCE.txt`への参照を追加する
- [ ] 記載バージョンが`package-lock.json`および最終成果物と一致することを確認する

対応記録（2026-09-23）:

- 配布時の`licenses/`はアプリのresourcesディレクトリを基準とすることを明記。
  通知自体も`licenses/`内に配置されるため、二重の`licenses/licenses/`参照に
  ならないよう説明を追加した。参照ファイルの存在をソースツリーで確認した。
- 記載するnpmパッケージのバージョンは、ロックファイルの実行時依存と
  既存macOS x64アプリのASAR内のpackage.jsonで照合済み。
  `@types/node` 10.17.60は`http-response-object`の実行時依存であり、
  開発専用の24.13.3と区別した。
- Electron 44.0.0はロックファイルと既存アプリのFrameworkのInfo.plistで照合済み。
- 更新後の通知を収録した最終ZIP／DMG、macOS arm64版、Windows x64版の
  成果物照合は未実施のため、最終成果物との一致確認は未完了とする。

完了条件:

- エンドユーザーが`node_modules`を参照しなくても、配布物内のライセンス情報へ
  到達できる
- 通知内に存在しないファイルへのリンクや参照がない

### 5. ライセンス一式を成果物へ必ず収録する

追加対応（2026-09-24）:

- 現行対象のmacOS x64アプリ・ZIP・DMG、Windows x64アプリ・NSIS・portableで
  `LICENSE`・`THIRD_PARTY_NOTICES.md`・`licenses/`の109ファイルを原本と照合済み。
- `artifactBuildCompleted`で最終コンテナを新規一時領域へ展開し、欠落・空ファイル・
  内容不一致をビルドエラーにする。DMGは読み取り専用、Windows EXEは実行せず展開。
- 記録: `docs/license-inclusion-2026-09-24.json`。
  成果物: `release/license-inclusion-check/`（Windowsは`windows/`配下）。
  既存release直下の成果物とは別の未署名・未公開の確認用ビルド。
- 欠落・改変・空ファイルと最終ZIPの欠落を検出する3テストが成功。
  手順: `docs/LICENSE-PACKAGING.md`。
- 以下の2026-09-23記録のWindows／DMG未検証状態は今回解消。
  arm64は現行配布対象外。署名・再ビルド後は再検証する。
  この完了はライセンス収録に限り、完全な対応ソース提供や動作・インストール試験は含まない。

- [x] 採用するElectronパッケージングツールを確定する（electron-builder 26.15.3）
- [x] 次のファイルをZIP、アプリバンドル、インストーラー等の配布成果物へ含める

```text
LICENSE
THIRD_PARTY_NOTICES.md
licenses/
```

- [x] `licenses/LICENSES.chromium.html`がサイズ等を理由に除外されていないことを確認する（macOS x64検証ZIP）
- [x] `licenses/GPL-3.0.txt`が含まれていることを確認する（macOS x64検証ZIP）
- [x] FFmpegのソース提供案内が含まれていることを確認する（macOS x64検証ZIP）
- [x] ライセンスファイルを利用者がインストール後にも確認できる配置にする

実装記録（2026-09-23）:

- `extraResources`でルートの`LICENSE`、`THIRD_PARTY_NOTICES.md`、`licenses/`の
  全ファイルをアプリのresources配下の`licenses/`へ収録する。
  macOSではアプリの「パッケージの内容を表示」から
  `Contents/Resources/licenses/`、Windowsではインストール先の
  `resources/licenses/`を通常のファイルとして閲覧できる（ASAR外）。
- `scripts/after-pack.cjs`で既存のmacOS名正規化処理を実行した後、
  `scripts/verify-packaged-licenses.cjs`で収録先と原本の全バイトを照合する。
  必須資料の欠落・空ファイル・内容不一致はビルド失敗とする。
- 展開済み成果物も`node scripts/verify-packaged-licenses.cjs <resourcesのパス>`で
  再検証できる。公開や署名を伴わないmacOS x64の検証用ビルドで43ファイルの
  一致を確認した。macOS arm64・Windowsの最終成果物は引き続き検証が必要。
- 検証ZIPを新規一時ディレクトリへ展開し、上記43ファイルを再照合して一致を確認。
  検証出力: `/private/tmp/kancolle-license-check.9sgkBR/build/`。
  展開先: `/private/tmp/kancolle-license-check.9sgkBR/extracted/`。
  この一時成果物は未署名・未公開。DMG・Windowsインストーラーの検証、および
  全配布対象の最終成果物への収録確認は未完了のため、全体の収録項目は残す。
  FFmpegソース提供案内の収録確認は、対応ソースの確保・公開完了を意味しない。

完了条件:

- 最終成果物をクリーンな環境で展開またはインストールし、上記一式を確認できる
- ASAR内だけに格納する場合を含め、利用者が現実的な方法で内容を閲覧できる

### 6. 配布成果物そのものを対象にライセンス監査を実施する

監査記録（2026-09-23）:

- `audits/licenses/2026-09-23/REPORT.md`に結果を保存した。既存macOS x64の
  ZIP・DMGとタスク5の検証ZIPを実際に展開／読み取り専用マウントして確認。
- 各成果物についてnpmパッケージ25個、Mach-Oファイル14個、動的リンク先、
  ライセンス資料、FFmpeg実行出力、成果物ハッシュと参照コミットをJSONに記録。
- 検証ZIPの43資料とnpm個別通知25件の一致を確認。既存ZIP・DMGには古い通知と
  不足資料があり、再ビルドが必要。開発専用npmコードの混入は検出しなかった。
- Mantle・ReactiveObjCの通知対応、FFmpegの完全な対応ソース、静的リンク部品の
  追跡は未完了。macOS arm64・Windows x64も未監査のため、配布準備未完了。
- 下記チェックは全配布対象に対する完了を表すため、未完了のままとする。

- [ ] macOS、Windows、Linuxなど、実際に配布するOSごとに成果物を作成する
- [ ] 各成果物に含まれる実行ファイル、npmパッケージ、ネイティブライブラリを列挙する
- [ ] 列挙結果を`THIRD_PARTY_NOTICES.md`および`licenses/`と照合する
- [ ] 未申告、ライセンス不明、独自ライセンス、GPL系依存物がないか確認する
- [ ] 開発専用依存物が成果物へ混入している場合は、除外するかライセンスを収録する
- [ ] 監査日、アプリバージョン、Gitコミット、対象OS、成果物ハッシュを記録する

完了条件:

- 最終成果物に含まれるすべての第三者コンポーネントについて、
  適用ライセンスと必要な表示を追跡できる
- ソースツリーだけを対象とした確認で完了扱いにしない

### 7. 外部由来のコード・データ・素材を確認する

調査記録（2026-09-23）:

- `audits/provenance/2026-09-23/REPORT.md`と`inventory.json`に調査結果を保存。
  独自コード・設定49ファイル、Git履歴、素材参照、既存macOS x64検証ZIPの
  ASAR内の独自アプリ領域を確認した。
- マス対応表は36海域・469件。2026-09-23、作成者より「取得したマスのIDから
  画面と照合して作成した」と確認済み。さらに、補正値の取得元はAPI、
  その他のWiki・他ツールからのコード・データ転記はないと作成者が申告。
  補正値は現実装では固定配列等であり、取得元の申告と実行時の取得処理は区別する。
- 独自画像・音声・動画・フォントの同梱は発見しなかった。熟練度マークはCSS描画。
  ゲーム画面・マスタ等は実行時取得であり、独自の同梱素材とは区別する。
- 調査と作成者申告を合わせ、独自コード・素材の出典確認は完了とした。
  追加の通知・収録・置換・除外が必要な転記物は確認されず、条件付き項目は
  該当なし。依存部品の未解決事項はタスク6で継続管理する。

- [x] `src/mapNodeLabels.js`のデータ作成元を確認する
- [x] Wiki、他ツール、外部リポジトリ等から転記したコードやデータがないか確認する
- [x] 外部由来のものがある場合、利用条件、ライセンス、著作権表示、出典表示を確認する（追加の転記物は該当なし）
- [x] ライセンスに表示義務がある場合は`THIRD_PARTY_NOTICES.md`と`licenses/`へ追加する（今回の追加対象なし）
- [x] 利用許諾を確認できない素材は、自作物へ置き換えるか配布対象から除外する（今回の該当素材なし）

完了条件:

- リポジトリ内のコード、データ、画像、音声、フォント等について、
  自作物か、利用条件を確認済みの第三者成果物かを説明できる

## P1: 必須対応に付随する整備

### 8. ルートLICENSEの形式を整える

- [x] `LICENSE`末尾に改行を追加する（既に末尾改行ありと確認）
- [x] 著作権者名と公開年が意図した内容であることを最終確認する
- [x] `package.json`と`package-lock.json`の`license`が`MIT`で一致することを確認する

確認記録（2026-09-23）:

- `LICENSE`末尾の改行と、`package.json`・`package-lock.json`のルートパッケージの
  `license: "MIT"`を確認した。形式修正は不要。
- 現在の著作権表示は`Copyright (c) 2026 ytokuda-develop`。
  2026-09-23、作成者が現在の著作権者名・公開年で確定すると確認済み。

### 9. 依存関係更新時のライセンス検査を自動化する

- [ ] 本番依存物の名前、バージョン、ライセンス識別子を出力する処理を追加する
- [ ] ライセンス不明のパッケージを検出した場合に失敗させる
- [ ] GPL、AGPL、独自ライセンス等を検出した場合に手動確認を要求する
- [ ] `package-lock.json`更新時に`THIRD_PARTY_NOTICES.md`との差分を確認する
- [ ] リリース時に成果物ベースの監査を実行する

## リリース判定チェックリスト

- [ ] P0の全タスクが完了している
- [ ] 配布対象OSごとのFFmpeg対応ソースを提供できる
- [ ] 最終成果物内に`LICENSE`、`THIRD_PARTY_NOTICES.md`、`licenses/`がある
- [ ] 最終成果物と第三者通知のバージョンが一致している
- [ ] 外部由来のコード・データ・素材に未確認のものがない
- [ ] ライセンス監査記録と成果物ハッシュを保存した

このチェックリストは技術的な監査項目であり、正式な法律意見を構成しない。
配布形態やGPL適用範囲に疑義が残る場合は、公開前に専門家へ確認する。
