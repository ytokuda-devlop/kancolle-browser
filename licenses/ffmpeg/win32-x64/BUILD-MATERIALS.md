# Windows x64のパッチ・ビルド資料確認

確認日: 2026-09-24。macOSは今回対象外、arm64は非対応。
対象FFmpegのSHA-256: `04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00`。

**未完了。上流のビルド資料は確保・確認できたが、当該バイナリに実際に適用された
パッチと提供元のビルド手順は未確定。パッチなしとは判定しない。**

## 確認済み資料

[build-materials.json](build-materials.json)にFFmpeg本体、ライブラリ候補37件、
サブモジュール4件の計42アーカイブのSHA-256と内部ファイル一覧を記録した。
全アーカイブのハッシュを取得時記録と照合し、tarで読取り確認した。
ビルドファイル、説明書、パッチ候補、設定ファイル候補を名前に基づき列挙する。
これは全ファイルの内容審査や実際の使用確認を意味しない。

| 資料 | 確認した内容 | 限界 |
| --- | --- | --- |
| FFmpeg本体 | `configure`、`Makefile`、`ffbuild/`、`doc/platform.texi` | 上流の仕組みであり、提供元の全手順ではない |
| Windows向け説明 | `doc/platform.texi`のMSYS2／MinGW-w64節。make、pkgconf、GCC、NASM等の説明 | 記載の一般手順や最新版インストールで当該ビルドを再現できるとは扱わない |
| 実行ファイル | `-version`と`-buildconf`の保存済み出力 | 環境変数、依存物の設定、リンク入力、適用パッチは網羅しない |
| x264 | ソース内`configure`と`Makefile` | 提供元の設定・生成ファイルは未確保 |
| x265候補 | `source/CMakeLists.txt`、`build/README.txt`、`build/msys/multilib.sh`、toolchainファイル | README版と実物の不一致があり、実際の使用スクリプトとは確定しない |
| x265版生成 | `source/cmake/Version.cmake`がGit／Hg情報や`x265Version.txt`を読むことを確認 | 実ビルド時の入力・生成ヘッダーが必要。不一致の原因確定ではない |
| その他依存物 | Autotools、CMake、Meson等のビルドファイルとREADME／INSTALL | configureオプション・パッチ・正確なリンク順は未確定 |

x265のMSYS multilibスクリプトは、12bit・10bitを別々に静的ビルドし、8bit側から参照して
GNU arでまとめる例を含む。これが当該8bit／10bit／12bitバイナリに使われた証拠はない。

## パッチの扱い

実際に拡張子が`.patch`／`.diff`のファイルと`patches/`内の候補を列挙し、次を読んだ。

- FreeType: `src/gzip/patches/freetype-zlib.diff`。
  同ディレクトリの`README.freetype`は、組込みzlib 1.2.13への変更手順
  （ヘッダー名変更、zlib2ansi処理、パッチ適用）を説明する。
  **上流FreeType内の変更資料**として確保済み。当該バイナリが内部zlibを使ったか、
  外部zlibをリンクしたかは未確認で、Gyan独自パッチとは分類しない。
- Opus: `doc/opus_update.patch`はcelt等の変更差分を含む。保存場所だけから適用済みとは扱わない。
- Xvid: `dshow/dxpatch/dx90sdk-update-gcc.patch`はDirectShow SDK向け差分を含む。
  FFmpegにリンクされたXvidのビルドに必要・適用済みとは扱わない。

パッチファイルの存在も不在も、提供元が変更していない証明にはならない。
完全なベースコミット、変更差分、適用順、適用条件、適用後ソースの照合が必要。

## 提供元の公開情報とツールチェーン

- [Gyanの公開回答](https://github.com/GyanD/codexffmpeg/issues/91#issuecomment-1474806731)は
  MSYS2／MinGW-w64とGCC・GNUツールチェーンを使うと説明している。
  2023-03の別版5.1.2についての質問への回答であり、6.1.1の正確なビルド記録ではない。
  回答原文は[API取得記録](build-evidence/gyan-issue-91-comments.json)に保存。
- [提供元の6.1.1リリース](https://github.com/GyanD/codexffmpeg/releases/tag/6.1.1)と
  [ビルド案内](https://www.gyan.dev/ffmpeg/builds/)も確認したが、今回の調査では
  当該バイナリに対応付けられたパッチ一式・ビルドスクリプト一式を確認できなかった。
  GitHubの自動生成Source code添付だけで、それらが提供されているとは扱わない。
- FFmpegの実行時表示はGCC 12.2.0（Rev10、MSYS2）、x265はGCC 13.2.0。
  別々に作られた依存物をリンクできるため、違い自体を異常とは判定しない。
  FFmpeg用ツールチェーンだけを固定して依存物も再現できるとは扱わない。
- fontconfigの埋込みパスに`W:/code/mabs/`がある。
  [media-autobuild_suite](https://github.com/m-ab-s/media-autobuild_suite)は調査候補だが、
  パスだけでは使用の有無・revision・設定を確定できない。現在のmasterを実ビルド資料の代用にしない。

## 提供元へ確認する不足資料

1. 各ソースのベースコミット／アーカイブのハッシュ、全パッチと適用順・条件。
   未変更の部品については未変更であることの確認。
2. 実際の統合ビルドスクリプトのrevisionとローカル変更。取得・生成・インストール・
   静的リンク・strip・梱包の各手順と使用設定。
3. MSYS2／MinGW-w64、GCC／G++、binutils、NASM、CMake、Meson、Ninja、Autotools、
   pkgconf等の必要な版、環境変数（PATH、CFLAGS、CXXFLAGS、LDFLAGS、PKG_CONFIG_PATH等）。
4. 各依存物の設定ログ、FFmpegの`ffbuild/config.log`、`ffbuild/config.mak`、`config.h`、
   該当するCMakeCacheや生成ヘッダー、パッケージ一覧、リンク入力とビルドログ。
5. x265各bit-depthの版生成入力と結合設定、oneVPLの正確なrevision、未確定依存物の情報。

取得後に対象バイナリと資料を対応付け、ソース一式の完全性とビルド可能性を検証する。
ビット単位一致の再ビルドは強い検証手段だが、それだけを資料確認の唯一の基準とはしない。
今回はビルドやパッチ適用を実行していない。

`ffmpeg-static/install.js`は既成バイナリのダウンロード処理、アプリのnpm／electron-builder設定は
アプリ梱包用であり、FFmpegと依存物のコンパイル手順を補うものではない。
本リポジトリの取得・監査スクリプトも提供元のビルドスクリプトとは区別する。

再確認: `./scripts/audit-ffmpeg-build-materials.ps1`。
未送信の照会文案は[SOURCE-REQUEST.md](SOURCE-REQUEST.md)を参照。
