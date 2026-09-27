# Electron内蔵FFmpegの対応ソース整備（2026-09-27）

**ソース資料の添付用パッケージを作成。完全な対応ソースの完成・公開のタスクは未完了。**
Xcode関連の実行検証はユーザー指定でスキップ。アップロードはユーザーが行う。

## 今回確認・整備した内容

- Electron/FFmpegの取得済み原本に、固定版Chromiumのビルド設定、Opus、NASM、
  Windowsのエクスポート定義生成スクリプト、depot_toolsを追加。ソースアーカイブは計7件。
  追加取得したアーカイブ・個別資料は計16件で、URL・サイズ・SHA-256を固定した。
- Chromiumタグ152.0.7977.54のコミットは`24072c1aa400ec4a89dc738b6b6acd12a8589b6f`。
  同コミットのDEPSは前回の監査保存物とバイト単位で一致。
- FFmpegのビルド定義が依存するOpusはChromium内の改変版を確保。
  FFmpeg→Opusの静的ライブラリ依存をビルド定義で確認。
- SDK、GN、Siso、Clang、PGOの固定版資料を確認。
  [BUILD-AND-REPLACE.md](BUILD-AND-REPLACE.md)に環境・取得・ビルド・交換の実行案を記載。
- macOS/Windowsの既存公開ZIPを未認証で取得してGitHub公開SHA-256と照合。
  両方の内蔵FFmpegは、前回照合した公式Electron44.0.0のライブラリと全バイト一致。
  WindowsのZIP内EXEから`app-*.7z`とFFmpegを実行せずに抽出できた。
  これは改変DLLへの交換後の実行成功を示すものではない。
- 公開ZIPのハッシュは9/26の候補とは異なるため、候補の検査結果をそのまま転用しなかった。
  今回の公開物検査はFFmpegの対応確認を目的とし、全ライセンス通知の再監査ではない。

## 依存資料の不足・検証の限界

取得アーカイブのGNファイル341件から、FFmpegとOpusを起点に46件のimport参照を走査した。
以下の5参照は取得済みアーカイブだけでは解決しない:

- `build/config/gclient_args.gni`（生成設定）
- `build_overrides/build.gni`
- `testing/test.gni`
- `clank/config.gni`
- `third_party/fuchsia-gn-sdk/src/component.gni`

これは条件分岐を評価しない保守的な走査。Android/Fuchsia向けの参照まで含むため、
5件すべてがmacOS/Windowsビルドに必要という意味ではない。
一方、importだけではGNターゲット、スクリプト、生成ヘッダーやツールの全入力は追えない。
この件数がゼロになっても完全性の証明にはならない。
例えばChromiumルートの`.gn`はANGLEの`dotfile_settings.gni`も読み込むため、
FFmpeg/Opusを起点とする走査だけでGN生成全体を確認したとは扱えない。
実際のgclient同期・GN生成・対象ターゲットの依存グラフとリンクコマンドの確認は未実施。
フルChromium checkout、CIPD/GCSツール本体、PGOプロファイル本体は添付しない。
SDKは同梱せず必要版と導入元を案内する。

macOSのビルドと改変版ライブラリでの動作確認は、Xcode未導入のためユーザー指定でスキップ。
Windowsのビルドと交換後の動作確認は、利用可能なWindowsビルド環境がないため未実施。
バイト単位で同一の再ビルドを要求するという意味ではなく、必要入力・互換性・交換可能性の
未確認を明示している。

## 添付ファイルとユーザーによる公開

ローカルの添付用ディレクトリ:
`release/source-delivery-2026-09-27/upload/`

1. `electron-44.0.0-source-materials-2026-09-27.tar.gz`
2. `SHA256SUMS.txt`
3. `RELEASE-NOTES.md`（追記用の文面。添付も可）

既存の [v1.0.0 Release](https://github.com/ytokuda-devlop/kancolle-browser/releases/tag/v1.0.0)
の編集画面から1・2を添付し、3の文面を説明に追記する。
文面はアップロード後の状態を想定しており、ローカル作成だけで「添付済み」とはしない。
アプリ成果物の置換・リリースの再作成は今回行わない。

提供物には不完全性を`README.md`、`STATUS.json`、公開用の文面で明示した。
これは取得済みソース資料を先に提供するためのもので、完全対応ソースの完成宣言ではない。
アップロード前に`SHA256SUMS.txt`の全行を照合する。
アップロード後、未認証で両ファイルを取得してハッシュを再照合する。
外部公開・公開後取得の確認は現時点で未実施。

## 再実行

```sh
python3 scripts/fetch-electron-build-materials.py
python3 scripts/audit-electron-build-imports.py
python3 scripts/prepare-electron-source-delivery.py
python3 scripts/prepare-electron-source-delivery.py --verify release/source-delivery-2026-09-27/upload/electron-44.0.0-source-materials-2026-09-27.tar.gz
```

初回の不足分取得だけ`fetch-electron-build-materials.py --fetch`を使う。
既存ハッシュの異なる入力、取得の中断、原本アーカイブの破損はパッケージ作成を失敗させる。
パッケージは明示した資料のみで構成し、`.git`、認証情報、アプリ利用データ、配布バイナリは含めない。
外側アーカイブは固定順序・時刻・所有者で作成し、全メンバーのハッシュを内包する。
生成スクリプトの成功を完全対応ソースの認定には使わない。

検証: 追加資料16件のハッシュ照合、原本7アーカイブの全通常ファイル読み取り、
生成パッケージの全メンバー照合を実施。改変・欠落・余分なファイル・危険なパスの
拒否を含む検証テスト5件が成功。同一入力での再生成ハッシュ一致も確認済み。

証拠: `build-materials.json`、`evidence/public-release.json`、
`evidence/public-artifact-verification.json`、`evidence/literal-import-audit.json`、
`bundle-verification.json`。
署名を伴う作業は本プロジェクトの対象外。Windowsインストーラー部品の別タスクは未変更。
