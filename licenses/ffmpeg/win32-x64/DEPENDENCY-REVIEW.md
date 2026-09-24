# oneVPL・版不明9件・推移的依存物の追加調査

2026-09-24。Windows x64のみ（macOS対象外、arm64非対応）。
対象SHA-256: `04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00`。
**全体は未完了。** 版の手掛かりとソース候補を追加したが、正確なrevision・
ローカルパッチ・依存物全件の確定には提供元のビルド記録が必要。

## oneVPL

Intel公式変更履歴では製品2023.2.0がAPI 2.9対応を追加し、2023.4.0がAPI 2.10対応を追加。
2.10.1から製品とAPIの版番号を揃える変更も明記されている。
READMEの`2.9`から`v2.9.0`タグを仮定した前回の調査では、製品リリースを特定できない。
タグ解決の失敗はソースが存在しない証拠ではない。

- 公式: https://raw.githubusercontent.com/intel/libvpl/main/CHANGELOG.md
- [保存した原文](onevpl-changelog-2026-09-24.md)
- Intelの製品案内も2023.2.0とAPI 2.9を区別:
  https://www.intel.com/content/www/us/en/developer/articles/guide/get-started-with-the-oneapi-video-processing-library.html

任意の2023.xタグで代用せず、使用されたdispatcherの完全なコミット、生成ヘッダー、
ビルド設定、パッチを提供元へ確認する。GPUランタイムの版とも区別する。

## 版不明9件

[dependency-evidence.json](dependency-evidence.json)に文字列・ファイル内オフセットを保存。
文字列の存在は検証済みだが、ソースの未改変や正確なrevisionを保証しない。

| 対象 | 証拠 | 判定 |
| --- | --- | --- |
| bzip2 | `1.0.8, 13-Jul-2019` | 1.0.8候補取得、パッチ未確認 |
| GMP | `../../gmp-6.2.1/mpz/pprime_p.c` | 6.2.1候補取得、パッチ未確認 |
| GnuTLS | `Enabled GnuTLS 3.6.16 logging...` | 3.6.16候補取得、パッチ未確認 |
| iconv | 判別可能な版文字列なし | 未確定 |
| fontconfig | `W:/code/mabs/local64/share/fontconfig/conf.avail` | ビルドパスのみ、版未確定 |
| OpenJPEG | ライブラリ名と別位置の`2.5.0` | 単独の数字では帰属できず、未確定 |
| libxml2 | バージョン診断文付近の`21300` | 数字の意味と参照元を確定しておらず、未確定 |
| liblzma | 単独の`5.2.9` | 候補のみ、帰属・revision未確定 |
| zlib | 複数箇所の`1.2.13`、別位置の`1.2.11` | ヘッダー版・実装版・複数コピーを区別できず未確定 |

版文字列から正確なソースを断定しない。取得URL・ハッシュ・ライセンス収録位置は
`library-sources/`の各JSON。アーカイブは`third_party/ffmpeg/win32-x64/libraries/`に
ローカル保存済み、Git管理対象外・未公開。

## 推移的依存物

- Expat: `expat_2.5.0`と`../../expat-2.5.0/lib/xmlparse.c`を発見。2.5.0候補取得。
- Nettle: `../nettle-3.8.1/`配下の暗号処理ソースパスを発見。3.8.1候補取得。
- OpenSSL: `OpenSSL 3.0.7 1 Nov 2022`と同版のソースパスを発見。3.0.7候補取得。
- libssh: `SSH-2.0-libssh_0.10.4`と`0.10.4/openssl/zlib`を発見。
  取得済みlibssh 0.10.4の`src/misc.c`の`ssh_version()`では、`/openssl`は
  `HAVE_LIBCRYPTO`、`/zlib`は`WITH_ZLIB`によって付加される。
  libssh→OpenSSL／zlibの関係を支持するが、リンク入力の正確なrevisionとパッチは未確定。

Expat・Nettleの組込み元を含め、全依存関係は未確定。libogg、libpng、libtasn1、p11-kit、
libintl、コンパイラ・スレッドランタイム等も存在・版・配布範囲をリンク記録で確認する。
文字列が見つからないことは未使用の証明ではない。

## README指定ソースとの照合

[合成字幕1フレームの実行結果](subtitle-library-probe.json)は終了コード0。

- libass: 完全な実行時コミット`c047dd2ea16f73abb4f448e6db3637158c1226d0`が取得済みソースと一致。
  ローカルパッチの有無は未確認。
- FriBidi: 実行時`1.0.13`はREADMEの`v1.0.13-2-g5b9a242`と基本版が整合。
- HarfBuzz: 実行時`8.3.0`はREADMEの`8.3.0-41-gd455066ad`と基本版が整合。
- FriBidi・HarfBuzzは実行時表示にコミットがなく、revision一致とは判定しない。
  フォント提供元はDirectWrite（GDI併用）だったためfontconfigの版確認にも使わない。

再検証: `node scripts/investigate-library-versions.cjs --runtime`。
ハッシュ照合・一覧更新: `node scripts/summarize-library-sources.cjs`。
提供元への確認文案は[SOURCE-REQUEST.md](SOURCE-REQUEST.md)（未送信）。
