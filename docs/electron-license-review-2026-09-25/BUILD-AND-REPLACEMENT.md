# Electron内蔵FFmpegのビルド・交換・公開の確認

2026-09-27。対象はElectron 44.0.0、macOS x64 / Windows x64。
公開予定先は利用者指定の `ytokuda-devlop/kancolle-browser` の `v1.0.0`。
状態: **資料を拡充したが、対応ソースの完成・公開は未完了**。

## 固定入力と今回の確認

Electron `bf0c4e67e9a834479ee171e61057f7516a381d25` のDEPSが指定する
Chromium 152.0.7977.54をコミット
`24072c1aa400ec4a89dc738b6b6acd12a8589b6f`まで解決した。
FFmpegは `2b68d2babae73714846961fb0ee47e3b3d2e39a9`。

既存のElectron・StdUtilsアーカイブを再取得し従来のSHA-256一致を確認。
FFmpegは圧縮アーカイブのSHA-256が変わったが、ファイル内容・実行属性・
symlinkから復元したGit treeが上流コミットの
`c60e6b597c312801ce91d81110442d40fbf4d672`に一致した。
原因を圧縮日時等と断定しない。元の記録は `source-archives.json`、
今回のバイト列は `source-reacquisition.json` に分けて保持した。

`supplemental-source-archives.json`に次の追加アーカイブの取得URL、SHA-256、
Git tree、ファイル数を記録した。すべて上流のtreeと照合した。

| 入力 | 必要となる箇所 |
| --- | --- |
| Chromium build | GN設定、コンパイラ設定、プラットフォームtoolchain、buildflag生成 |
| Chromium buildtools | GN等の周辺設定（ツール実行バイナリ一式ではない） |
| Chromium tools/generate_stubs | Windowsのffmpeg.def生成 |
| Chromium tools/clang | 固定Clangの取得・ビルドスクリプト |
| Chromium third_party/opus | FFmpegのffmpeg_internalが直接依存するOpusとビルド定義 |
| NASM 525a09a813be0f75b646ee93fc2a31c27b87d722 | x64アセンブリのビルドとnasm_assemble.gni |

これらは依存関係全体の閉包ではない。ルート `.gn`、DEPSも保存したが、
ルートBUILD.gn、build_overrides、条件付きimport先やtoolchain runtime等について、
実際のGN生成結果から不足なく収録したことの確認が必要。
取得した上流ソースに含まれるライセンスは削除しない。

## 環境とビルド確認の手順

Electronアーカイブ内の `docs/development/build-instructions-gn.md`、
`build-instructions-windows.md`、`build-instructions-macos.md` を入口にする。
汎用説明のmainや最新版をそのまま使わず、上記コミットへ固定する。

1. OSごとに新しい作業ディレクトリを用意する。depot_toolsの実際のcommit、
   Python、Node、OS、Visual Studio / Windows SDKまたはXcode / SDKの版を記録する。
   Windowsは `DEPOT_TOOLS_WIN_TOOLCHAIN=0` を指定してローカルのVSを使う。
   Electron文書の最低要件だけを当該Chromiumの実ビルド要件とみなさない。
2. `gclient config --name src/electron --unmanaged https://github.com/electron/electron`
   で構成し、`gclient sync --revision src/electron@bf0c4e67e9a834479ee171e61057f7516a381d25 --with_branch_heads --with_tags`
   を行う。解決済み全revision、CIPD instance、取得物ハッシュ、hooksのログを保存する。
   配布アーカイブだけでの再構築を検証する段階では、このネットワーク取得を代替する必要がある。
3. Electronのpatches/config.jsonによるパッチを反映する。FFmpegの
   `link_with_loader_path.patch`だけでなくChromium buildへのパッチも必要。
   gclient hooksで適用済みなら二重適用しない。
4. `src/out/FFmpegRelease/args.gn`へ次を保存する（交換検証用の候補設定）。

   ```gn
   import("//electron/build/args/release.gn")
   target_cpu = "x64"
   chrome_pgo_phase = 0
   ```

   release.gnは `is_component_ffmpeg=true`、all.gnは
   `ffmpeg_branding="Chrome"`、`proprietary_codecs=true`を設定する。
   PGO無効化は上流READMEに記載された代替設定で、公式バイナリと同一のビルドではない。
   公式条件の再構築ではElectronの `build/pgo_profiles/*.pgo.txt` と対応プロファイルも
   保存・検証する。ClangはChromium DEPSの `llvmorg-23-init-19482-g53d18800-1`。
   GNは `641ace93dd9560e75e7add0d08f77b446fbb3b78`、sisoは
   `7bc9a0bfe050ef97e1712ff61c6f11952799e951` が固定されている。
5. `src`から `gn gen out/FFmpegRelease` を実行し、
   `gn desc out/FFmpegRelease //third_party/ffmpeg:ffmpeg deps --all` と
   ビルドコマンド・生成入力を保存する。上流手順のautoninjaを使い
   `autoninja -C out/FFmpegRelease ffmpeg` を実行する。
   この手順は今回未実行であり、成功保証済みのビルドレシピではない。
6. 生成されたDLL/dylibのarch、export、動的依存、configとパッチを照合する。
   クリーン環境で再度ビルドできるまで、推移的資料の完備としない。

## 交換検証の手順（未実施）

実運用のアプリではなく、配布候補を複製した検証用コピーで行う。
バックアップはアプリの外に置き、元のライブラリと交換品のSHA-256を記録する。
互換性を保った識別可能な変更をソースへ加え、差分とビルドログを保存する。

| OS | 交換対象 |
| --- | --- |
| Windows x64 | 展開済みアプリのEXEと同じディレクトリの `ffmpeg.dll` |
| macOS x64 | `.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib`（実物の構造も確認する） |

Windowsはアプリを完全終了して交換する。portable EXEは起動時に再展開するため、
外側のEXEの隣にDLLを置く方法では検証しない。Setupもコンテナ自体の変更ではなく
インストール／展開後の検証コピーを使用する。
macOSも終了後に交換し、dyldのinstall nameと依存先を確認する。
このプロジェクトは未署名配布を対象とするが、実物にad-hoc署名等があれば交換後の
起動条件を確認する必要がある。今回署名の除去・再署名を実施したとは扱わない。

両OSで読み込まれたDLL/dylibの実パスと変更識別子を確認し、起動、動画・音声再生、
録画対応版ではWebM録画・再生・シークも確認する。2026-10-02の録画廃止後の版では
録画確認を対象外とし、現行の確認項目は[ライセンス収録手順](../LICENSE-PACKAGING.md)を参照する。
元のライブラリへ復元して再起動も確認する。
単なる元ファイルの差し戻しや同一公式DLLへの交換だけでは改変版の動作実証としない。

## 公開を完了する条件

- 両OSで上記のビルドと改変版交換の証拠を保存する。
- ソース一式だけを展開した環境から再構築し、不足する推移的資料を追加する。
- 対象バイナリのSHA-256、アプリのソースcommitと差分、ソース一式のSHA-256を結び付ける。
- 検証済みソースとチェックサムをv1.0.0に添付し、ELECTRON-SOURCES.txtに実際の
  asset URLを記載する。通知を更新した配布物は以前の28資料一致結果を流用せず再検証する。
- ログアウト状態から添付物をダウンロードし、ハッシュ一致と全ファイル読み取りを確認する。

2026-09-27の未認証GET
`https://api.github.com/repos/ytokuda-devlop/kancolle-browser/releases/tags/v1.0.0`
はHTTP 404。未作成・draft・非公開等のどれかは、この応答だけでは確定できない。
公開済み・ダウンロード確認済みとは記載しない。今回の環境ではGitHub CLIも利用できない。

検証コマンド:

```sh
python scripts/acquire-electron-build-inputs.py
python scripts/verify-electron-license-materials.py --prepare-review
```

生成される `INCOMPLETE-source-review.tar` は内部確認用のままとし、完全な対応ソースとして
公開しない。StdUtils等を同梱していても、残るインストーラー部品の監査完了を意味しない。
