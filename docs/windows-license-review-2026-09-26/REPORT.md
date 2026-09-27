# Windows部品の版・条件・対応ソース調査（2026-09-26）

公開準備の判定は**未完了**。部品の版と実物の対応を以下まで確定した。
WinShellの権利条件やelevateの改変履歴を推測して、全件完了とはしない。
調査対象はこのMacで生成したWindows x64成果物。ユーザーが録画したWebMファイルは
インストーラーの出典照合には使用していない。

## 確定事項と残件

| 部品 | 実物との対応 | 適用条件・必要なソース対応 |
| --- | --- | --- |
| UAC | 公式UAC.zipのx86-unicode DLLとSHA-256一致。History.txtの0.2.4c / 20150526 | zlib/libpng。無改変バイナリのソース提供義務なし。ソース配布時の原文保持・改変表示・出自保持。原文通知を追加、ソース取得済み |
| WinShell | 公式WinShell.zipのUnicode DLLと一致。公式ページの版20121005 | 表記はFreeware。ZIPはDLLのみ。再配布の許諾範囲・条件、ソース義務の有無を確定できない。作者への確認または条件明確な実装への置換が必要 |
| nsis7z | Nsis7z_19.00.7zのx86-unicode DLLと一致。15.07版とは不一致 | 本体READMEは版指定のないLGPL。SDK License.txtはLZMA SDKのpublic domain宣言。本体もpublic domainとは扱わない。プラグインとSDK19.00を取得。版指定なしの場合のLGPL第13条に基づき配布上は2.1を選択。Windowsビルド、交換・再リンク手順、ソース一式の提供が残る |
| elevate.exe | PE FileVersion 1, 0, 0, 2894、Johannes Passing。提供元の導入コミットのEXEと一致 | 作者ソースはMITで原文通知保持が必要。作者1.0 ZIPのx86/x64 EXEとはコードセクションも異なる。提供元の改変・ビルド入力・追加リンク部品は未確定。作者ZIPを実物の対応ソースと断定しない |
| NSIS本体 | toolset 3.0.4.1。Setup/portable/アンインストーラーの.textがzlib-x86-unicodeスタブと一致、7-ZipもDeflateと表示 | 実際に使うNSIS本体と標準プラグインはzlib/libpng。今回のスタブについてCPLのLZMAソース提供を要求する根拠はない。NSIS COPYING原文は保持 |
| System/nsDialogs/nsExec | 既知のtoolset DLLと実物が一致 | NSIS標準プラグインのzlib/libpng条件。追加ソース提供義務なし |
| 生成アンインストーラー | Setup内のUninstall EXEを実行せず抽出。System/nsDialogs/nsExec/UAC/StdUtils/WinShellを内包 | 各部品の条件を引き継ぐ。nsis7z/elevate/nsProcessは内包しない。テンプレートはelectron-builder26.15.3のMITで原文を追加。WinShell残件はアンインストーラーにも該当 |
| StdUtils | 1.14、DLL1.1.4.0。前回調査の公式ZIP一致を維持 | LGPL2.1+、作者のNSIS利用補足、組込みコードの通知を保持。ソース取得済み。実際のソース公開は未実施 |

## 一次資料

- [UAC公式配布](https://nsis.sourceforge.io/UAC_plug-in)：ZIP内History.txtとLicense.txtを照合。
- [WinShell公式ページ](https://nsis.sourceforge.io/WinShell_plug-in)：版・作者・Freeware表記。
  作者ページも確認したが追加の再配布条件は見つからなかった。
  Wikiフッターの一般コンテンツライセンスをDLLへ自動適用しない。
- [nsis7z公式配布](https://nsis.sourceforge.io/Nsis7z_plug-in)：19.00アーカイブ内のREADME・License.txt・VSプロジェクト。
- [LZMA SDK](https://www.7-zip.org/sdk.html)：19.00の指定ソースを取得。
- [elevate作者リポジトリ](https://github.com/jpassing/elevate/tree/d5cfc93d1ce06844a39d1a334a7a8081d26b6204)、
  [作者によるMIT表明](https://jpassing.com/2007/12/08/launch-elevated-processes-from-the-command-line/)。
  LICENSE.mdのcopyright欄は原本で未記入なので補完・改変せず収録。
- [提供元のelevate導入コミット](https://github.com/electron-userland/electron-builder-binaries/commit/b266aeda90e296ffb0d803d769b738d14148f72f)：EXEの追加を確認。
  現在の提供元は別のelevateプロジェクトをビルドするため、現在のスクリプトから旧EXEの条件を推定しない。
- [electron-builder26.15.3のMIT原文](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.15.3/LICENSE)。

取得物のURL・SHA-256・サイズは
[sources.json](../../third_party/windows-installer/sources.json)。
[provenance-before.json](evidence/provenance-before.json)は前回成果物からの実物照合。
原文の取得記録・UACの履歴・作者の記述は`evidence/`へ保存。

## ソース提供の範囲

UAC/zlib・元elevate/MIT・electron-builder/MITの条件からは、アプリ全体の
ソース公開義務は発生しない。MITの必要な通知は保持する。
WinShellはソース不要とも必要とも確定していない。

nsis7zはプラグインのソースだけでは不足し、原本指定のLZMA SDK19.00が必要。
両者を重ねるとVSプロジェクトの361入力中、コンパイル対象ソースは全て存在する。
`CPP/7zip/IMyUnknown.h`というClInclude参照1件だけが存在しない。
ソースのincludeでは参照されておらず古いプロジェクト記載と考えられるが、
Windowsでの再ビルドを実施するまでは解消済みとしない。
原本指定はVS2017、Release/Win32/Unicode。

LGPLの版は本文第13条の版指定なしの場合の選択規定に基づき2.1を選ぶ。
これは作者の記載を「2.1限定」に改変するものではない。
利用者が改変したDLLを使用できる構成か、
再リンク・再構築に必要な入力を提供する方法を検証する。
Setup内へ組み込まれるため、DLLとURLだけを置けば完了とは扱わない。
既存StdUtilsとElectron内蔵FFmpegの対応ソース提供も別途完了させる。
公開する際は対応するバイナリとソースを同じリリースから取得可能にし、
通知から具体的な提供先へ案内する。現時点では外部公開していない。

## 実装・検証

6資料を追加し、配布対象は計27資料。`extraResources`と欠落検知を更新した。
`verify-windows-installer-materials.py`は原本ハッシュ、公式DLL、Setup/portable/
アンインストーラーの全プラグイン一覧、スタブのコードセクション、アプリ内elevateを
照合する。未知のDLL、ハッシュ変更、圧縮方式変更があれば失敗する。
ライセンスの未確定事項はこの照合が成功しても自動で完了扱いしない。

アプリ・インストーラーの機能変更は行っていない。作者への問い合わせも送信していない。
残件の解消には、WinShellの権利者回答または置換、elevateの提供元ビルド情報または
出典を追える構成への変更、nsis7zのWindowsビルド・交換手順とソース提供が必要。

構成変更で解消する場合、現行アプリには`autoUpdater`/`electron-updater`の利用がないため、
`nsis.packElevateHelper: false`によるelevate非同梱が候補になる（今回は未変更）。
WinShellはショートカットのAppUserModelID設定とアンインストール時の後処理に使われるため、
単にDLLを消さず、その機能を条件明確なNSIS/System・COM呼び出しへ置換してWindowsで確認する。

取得済みソースとテンプレートのレビュー用保存物:
`release/windows-license-review-2026-09-26/source-review/windows-INCOMPLETE-source-review.tar.gz`。
記録は[evidence/source-review.json](evidence/source-review.json)。
未検証であることをファイル名とSTATUS.txtに明記しており、完成した対応ソース提供物ではない。

再生成コマンド（署名・公開なし、Windowsの実行検証なし）:

```sh
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --win nsis portable --x64 --publish never -c.directories.output=release/windows-license-review-2026-09-26/build -c.win.signAndEditExecutable=false
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac zip dmg --x64 --publish never -c.directories.output=release/windows-license-review-2026-09-26/mac
```

検証結果:

- 録画・ライセンス検査の既存テスト9件成功。Viteビルド成功。
- Windows Setup/portable・macOS ZIP/DMGの4形式で27資料の原本一致と録画変換用FFmpeg不在を確認。
- 新しいSetupからアンインストーラーを再抽出し、全DLL・zlibスタブ・elevateの原本照合が成功。
- Windows最終EXEのPE証明書テーブルは空。macOSも署名なしで生成。外部公開は行っていない。
- `git diff --check`成功。

成果物のハッシュと検査記録は[artifact-summary.json](evidence/artifact-summary.json)、
部品照合は[provenance-final.json](evidence/provenance-final.json)。
この検証は収録内容と出典の一致を確認するもので、上記未確定条件を解消するものではない。
