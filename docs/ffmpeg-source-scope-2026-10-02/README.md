# Mac版FFmpegの提供範囲の確認（2026-10-02）

**ライブラリ本体・直接依存・適用パッチの範囲は、固定版ソースから具体化できた。**
ただし、現在の7アーカイブだけで公式GN構成のビルド入力が揃っているとは確定できない。
今回の追加調査で、不足を「Chromium全体」という曖昧な単位から、
ランタイムのソース・GNの接続設定・生成入力・PGO等へ絞り込んだ。

対象はユーザーが公開対象に指定した`release/kancolle-browser_1.0.0_mac.zip`。
ZIP SHA-256は`9e7179f3f7309d5ac931e42b10e294d3bfb910cbe704181ee1a51e616c8007c3`。
内蔵FFmpeg SHA-256は`0ea472e75cdf7fb5b2786bf1c5d84fa81b1638199cc01008db58de2616a764c1`。
DMGは非公開。Xcode工程のスキップを維持し、ビルドや改変版への交換は実行していない。

## 提供物に含める範囲

| 区分 | 提供範囲・理由 | 現在の確保状況 |
| --- | --- | --- |
| FFmpeg本体 | 固定コミット`2b68d2babae73714846961fb0ee47e3b3d2e39a9`の全ソース・ヘッダー・通知を保持 | 既存ソース資料に収録済み |
| Mac設定・生成済み定義 | `chromium/config/Chrome/mac/x64/`、`ffmpeg_generated.gni`、`ffmpeg_options.gni`、`BUILD.gn`等 | 収録済み。Mac設定12ファイル確認 |
| Opus | Chromiumコミット`24072c1aa400ec4a89dc738b6b6acd12a8589b6f`内の改変済み`third_party/opus/`一式 | 収録済み。上流無改変版で代用しない |
| Electronパッチ | FFmpegパッチ、Macに関係するChromium buildパッチ、適用順序、適用スクリプト | Electron原本に収録済み。下記の適用確認を実施 |
| ビルド制御 | Chromium `build/`、buildtoolsのGN定義、必要なbuild_overrides等、GN引数、生成設定の作り方 | `build/`は確保済み。GN全体の接続設定と生成入力は未完備 |
| アセンブラ | 固定NASMソース・`nasm_assemble.gni`等。ライブラリに含まれるコードではなくビルド用ツールとして分類 | 収録済み |
| 共通設定から追加されるランタイム | libc++、libc++abi、LLVM libcの参照ヘッダー、ClangのMac向けbuiltinsと、それらのビルド定義 | 固定版・依存経路を特定。ソース一式は既存資料に未収録 |
| ツール・最適化入力 | Clang/GN/Siso/Python等の版と取得・設定手順、必要なPGO入力 | 版・PGO stateは確保。公式相当の入力一式としては未検証 |
| OS/SDK | Xcode/macOS SDKの必要版・導入方法・実際に使用した版 | 要求版の資料あり。SDKそのものを無条件で再配布物へ入れる方針ではない |

FFmpegとOpusは、ファイルを極端に削って最小セットにする方針を採らない。
選択された翻訳単位以外にもヘッダー、テーブル、設定、改変に使う原本があるため、
それぞれ取得済みの全アーカイブと原文通知を保持する。

ここでいうランタイムの「提供範囲」は、再構築に必要な入力を保守的に確保するための範囲。
すべてのランタイムが実物dylibに取り込まれた、またはすべてに同一のソース公開義務が
あると断定したものではない。リンクで除去されるコードと実際の組込みは別途区別する。

## ソースから確定できたこと

固定された`ffmpeg_generated.gni`をMac x64・Chrome構成の条件で評価した。
これは当該ファイルにある限定的な構文の評価で、GNそのものを実行したものではない。
未知の構文・変数・importはエラーにする。

- Cソース285件、NASMアセンブリ29件、GASアセンブリ0件。
- 宣言された補助入力C系48件・アセンブリ系3件。
- Mac設定12ファイル。
- 上記の全ファイルが、ハッシュ固定されたFFmpeg原本に存在し読み取れることを確認。
- `CONFIG_LIB*`で有効なのは`CONFIG_LIBOPUS=1`のみ。
  x264/x265、zlib、bzip2、LZMA等はこのMac構成では無効。
- `ffmpeg_internal`がOpusへ依存し、Opusのx64向け依存はSSE4.1・AVX2実装を含む。

ファイル単位のSHA-256は[source-files.json](source-files.json)、
条件・件数・パッチ・依存関係は[scope.json](scope.json)に保存した。

### パッチ

`patches/config.json`と各`.patches`の順序を確認した。
FFmpeg自身の有効パッチは`link_with_loader_path.patch`の1件。
さらにChromium `build/`を変更する有効パッチが8件ある。

- Macに関係する6件とFFmpegの1件は、保存済み原本の一時コピーへ順番に適用できることを確認。
- Windowsの`ignore_rc_check.patch`も適用確認済みだが、今回のMac対象の条件とは区別する。
- Linux用`gtk_visibility.patch`は`ui/ozone/platform/x11/BUILD.gn`も変更する。
  今回この入力は未確保で適用確認をしていない。Macの未解決事項として数えない。

パッチは既存Electron原本に全件含まれるので、別途削減したパッチセットを公開する必要はない。
今回のチェックはパッチの適用可能性であり、ビルド成功の証明ではない。

## 新たに具体化した暗黙の依存

FFmpegの`deps`欄だけで範囲を終えない。`shared_library`の共通設定により、
既定のrelease構成では次の経路が追加される。

```text
ffmpeg
  -> ffmpeg_internal -> Opus / FFmpegのNASM出力 / buildflag生成
  -> shared_library_deps -> common_deps -> libc++
                                            -> libc++abi
                                            -> llvm-libc-shared（ヘッダー設定のgroup）
  + compiler:runtime_library -> clang:compiler_builtins（Macではlibname=osx）
```

`llvm-libc-shared`という名前でも、取得した定義は共有ライブラリではなくinclude設定を
伝えるgroupだった。新しい動的ライブラリが配布物に含まれるという意味ではない。
追加取得した3つのGN原文とURL・ハッシュは`additional-evidence.json`に保存した。

保守的に追加確保する固定ソースの版:

| 入力 | 根拠となる版 |
| --- | --- |
| libc++ | DEPS: `b16984ce99c702355a5b2b4c52574e82cec41fb9` |
| libc++abi | DEPS: `8f11bb1d4438d0239d0dfc1bd9456a9f31629dda` |
| LLVM libcヘッダー | DEPS: `3ea89f4304312567e31a8eb45e0737577e65b676` |
| Clang同梱Mac builtinsのソース候補 | Clang更新スクリプトの`53d18800`をLLVMコミット`53d18800eda3b7407e53366f27ca78e922c6e0db`に解決。compiler-rt部分とツールチェーン側の変更を確認する |

DEPSには別にcompiler-rtの`e1c9323385b40780f574f440a8a9ad83855712b0`があるが、
これをClangパッケージに入るbuiltinsの対応版と同一視してはいけない。
Mac既定値では`use_llvm_libatomic=false`、`use_custom_libunwind=false`。
従ってWindows/Android/Fuchsiaのためのatomic・独自libunwindをMacの必須リンク入力へ
無条件に追加しない。引数を変更する場合はこの判定を再評価する。

実物dylibを指定ZIPから取り出し、`otool -L`で確認した動的依存は
`/usr/lib/libSystem.B.dylib`のみ（ほかに自身のinstall name）。
これは静的ランタイムの不在を証明しないため、上記のソース定義と区別する。

## 現在のソースだけでは確定できない部分

1. 実際に使われた最終GN引数、リンクコマンド、リンクされたランタイムのオブジェクト。
   指定ZIPにはlink mapやビルドログがない。stripされた実物の動的依存一覧だけでは不足。
2. Clangパッケージ中のMac builtinsと、固定LLVMソース・ツールチェーン用変更の完全な対応。
   LLVM短縮コミットの解決まで確認したが、これだけで対応ソース完備とは扱わない。
3. GN生成に必要なroot `.gn`、build_overrides、buildtools、生成gclient設定等の接続。
   FFmpeg本体のソース不足と、GNが設定を読むための資料不足を分けて扱う。
4. ElectronのMac x64 PGOプロファイル本体。stateとハッシュは原本にあるが本体は既存資料に未収録。
   PGO無効の交換用ビルドを採るなら、変更設定を記録し、その手順の成立・互換性を別途確認する。

したがって次の取得対象は、上記ランタイムの固定ソース、buildtools等の必要なGN定義、
Clang取得・ビルドスクリプト一式、必要な生成・最適化入力である。
これらを揃えて最終入力一覧を確認する段階が、現在の7アーカイブと完全な提供物の間に残る。
すべてのChromiumコードを無条件に再配布する、全OSでElectron全体を自力ビルドする、
ビット単位で公式バイナリを再現する、という条件へ拡張しない。

## ライセンス上の範囲との区別

LGPL2.1第0条は、ライブラリの全モジュール、関連するインターフェース定義、
コンパイル・インストールを制御するスクリプトを完全なソースの範囲に含める。
第4条はライブラリのバイナリと対応ソースの提供を扱い、第6条には共有ライブラリ方式などの条件がある。
「このMacでのビルド試験成功」という手続き自体が条文上の一律要件という意味ではない。
ビルドや依存グラフ確認は、資料の十分性と交換可能性を検証するための方法として使う。

標準コンパイラ・SDKの全コードを当然に添付するという解釈は採らない。
一方、配布ライブラリに組み込まれるコードと、単にビルドを実行するツールは区別して条件を確認する。
これは技術的な提供範囲の設計であり、未検証のライセンス条件を解消済みとする判定ではない。
本文: https://opensource.org/license/lgpl-2-1 （第0・4・6条、2026-10-02確認）。

## 再実行と既存公開セット

```sh
python3 scripts/audit-ffmpeg-source-scope.py
python3 tests/ffmpeg-source-scope.test.py
```

入力5アーカイブと追加GN原文3件のハッシュを検査する。
不明構文・不明条件を黙って除外せず、存在しないソースや適用できない対象パッチも失敗にする。
本調査は現在の公開セットのZIP・ソースアーカイブを変更しない。
そのため公開セットの`completeCorrespondingSource=false`は引き続き正しい。
Xcode工程をスキップしたまま、完全対応ソース・交換動作・公開取得確認を完了扱いしない。
