# Windows x64の組込みライブラリとソース調査

対象バイナリSHA-256: `04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00`。
macOSは今回の対象外、arm64は今バージョン非対応。

**全体は未完了。** x264・libaom・libvpxは実行時revisionとソース候補の対応を確認した。
libassの追加照合、oneVPL・版不明9件・推移的依存物の追加調査は[DEPENDENCY-REVIEW.md](DEPENDENCY-REVIEW.md)を参照。
x265はREADMEと実行時表示が食い違い、oneVPLは正確なrevision未確定。
READMEに版番号のない9件と、推移的依存物も確定が必要。

取得済み: ライブラリソース候補37アーカイブ、
親コミットで固定されたサブモジュール4アーカイブ。
URL、完全なコミットID（GitHub取得分）、SHA-256、ライセンスの収録場所は各取得記録を参照。
アーカイブは改変せず保存し、tarの一覧読取り・ライセンスファイルまたはヘッダーの存在と
保存後のSHA-256を検証した。ビルド再現性や全ライセンス条件の監査を完了したという意味ではない。

## 実物の確認結果

- [実行記録](library-probes.json): 合成画像1フレームを各エンコーダーで処理し、6回すべて終了コード0。
- x264: エンコードしたH.264のSEIに `core 164 r3172 c1c9931`。
- libaom: `3.8.0-180-g0eeb62d344`、libvpx: `v1.13.1-601-g655da33b8`。
- x265: 8bit・10bit・12bitすべて `3.5+113-8787af124`。
  READMEの `3.5-153-gce8642f22` と異なる。取得したce8642f22のソースは候補としてのみ保存。
  実行時文字列の由来（別ソース・生成された版情報等）は未解明であり、別ソースと断定もしない。
  README指定ソースのx265Version.txtは `3.5+1-f0c1022b6` 相当で、これも実行時表示の説明にはならない。
  実行時識別子8787af124の解決はMulticorewareinc/x265とvideolan/x265のGitHub APIで422、
  multicoreware/x265_gitのBitbucket APIで404。提供元の確認が必要。
- oneVPL: READMEの `2.9` から `intel/libvpl v2.9.0` を解決できなかった（422）。
  APIバージョンとソースのリリース番号を同一視せず、別のタグで代用しない。
- 通常のPEインポートはWindowsのDLL群のみ。AviSynth・AMFはFFmpeg本体ソースの
  `libavformat/avisynth.c`、`libavcodec/amfenc.c`で実行時DLL読込みを確認。
  ffnvcodecもヘッダーと実行時ドライバーの区別が必要。READMEの全行を静的リンクとは扱わない。
- バイナリにはGnuTLS 3.6.16・libssh 0.10.4・OpenSSL 3.0.7を示す文字列も存在する。
  [実行記録](library-probes.json)に位置を保存したが、完全な版・パッチ・推移的依存物の確定には使わない。

## 全件一覧

「README指定の候補」は実物との完全一致を確認したという意味ではない。
ヘッダー／外部DLLの行では、取得アーカイブはSDK等のソース候補を示す。

| 名前 | README版 | 実行時版 | 組込み方法 | ソース | 判定 |
| --- | --- | --- | --- | --- | --- |
| AMF | v1.4.32 | 未取得 | ヘッダー／外部DLL | [取得記録](library-sources/AMF.json) | README指定の候補、実物との対応未確認 |
| aom | v3.8.0-180-g0eeb62d344 | 3.8.0-180-g0eeb62d344 | 静的ライブラリ／dispatcher | [取得記録](library-sources/aom.json) | 実行時revision一致、パッチ未確認 |
| AviSynthPlus | v3.7.3-38-geb3c4330 | 未取得 | ヘッダー／外部DLL | [取得記録](library-sources/AviSynthPlus.json) | README指定の候補、実物との対応未確認 |
| ffnvcodec | n12.1.14.0-1-g75f032b | 未取得 | ヘッダー／外部DLL | [取得記録](library-sources/ffnvcodec.json) | README指定の候補、実物との対応未確認 |
| freetype | VER-2-13-2 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/freetype.json) | README指定の候補、実物との対応未確認 |
| fribidi | v1.0.13-2-g5b9a242 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/fribidi.json) | README指定の候補、実物との対応未確認 |
| gsm | 1.0.22 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/gsm.json) | README指定の候補、実物との対応未確認 |
| harfbuzz | 8.3.0-41-gd455066ad | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/harfbuzz.json) | README指定の候補、実物との対応未確認 |
| lame | 3.100 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/lame.json) | README指定の候補、実物との対応未確認 |
| libass | 0.17.0-63-gc047dd2 | 0.17.0-63-gc047dd2ea16f73abb4f448e6db3637158c1226d0 | 静的ライブラリ／dispatcher | [取得記録](library-sources/libass.json) | 実行時revision一致、パッチ未確認 |
| libgme | 0.6.3 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/libgme.json) | README指定の候補、実物との対応未確認 |
| libopencore-amrnb | 0.1.6 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/opencore-amr.json) | README指定の候補、実物との対応未確認 |
| libopencore-amrwb | 0.1.6 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/opencore-amr.json) | README指定の候補、実物との対応未確認 |
| libssh | 0.10.4 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/libssh.json) | README指定の候補、実物との対応未確認 |
| libtheora | 1.1.1 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/libtheora.json) | README指定の候補、実物との対応未確認 |
| libwebp | v1.3.2-109-ge78e924f | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/libwebp.json) | README指定の候補、実物との対応未確認 |
| oneVPL | 2.9 | 未取得 | 静的ライブラリ／dispatcher | 未確定 | README指定の候補、実物との対応未確認 |
| openmpt | libopenmpt-0.6.12-54-g7ec8c1440 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/openmpt.json) | README指定の候補、実物との対応未確認 |
| opus | v1.4-9-gc8549975 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/opus.json) | README指定の候補、実物との対応未確認 |
| rubberband | v1.8.1 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/rubberband.json) | README指定の候補、実物との対応未確認 |
| SDL | release-2.28.0-345-g0f8f4f676 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/SDL.json) | README指定の候補、実物との対応未確認 |
| speex | Speex-1.2.1-20-g3693431 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/speex.json) | README指定の候補、実物との対応未確認 |
| srt | v1.5.3-21-g02acd18 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/srt.json) | README指定の候補、実物との対応未確認 |
| vidstab | v1.1.1-4-g05829db | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/vidstab.json) | README指定の候補、実物との対応未確認 |
| vmaf | v3.0.0-28-gcf67786b | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/vmaf.json) | README指定の候補、実物との対応未確認 |
| vo-amrwbenc | 0.1.3 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/vo-amrwbenc.json) | README指定の候補、実物との対応未確認 |
| vorbis | v1.3.7-10-g84c02369 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/vorbis.json) | README指定の候補、実物との対応未確認 |
| vpx | v1.13.1-601-g655da33b8 | v1.13.1-601-g655da33b8 | 静的ライブラリ／dispatcher | [取得記録](library-sources/vpx.json) | 実行時revision一致、パッチ未確認 |
| x264 | v0.164.3172 | core 164 r3172 c1c9931 | 静的ライブラリ／dispatcher | [取得記録](library-sources/x264.json) | 実行時revision一致、パッチ未確認 |
| x265 | 3.5-153-gce8642f22 | 3.5+113-8787af124 | 静的ライブラリ／dispatcher | [取得記録](library-sources/x265.json) | **実物と不一致・未確定** |
| xvid | v1.3.7 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/xvid.json) | README指定の候補、実物との対応未確認 |
| zeromq | 4.3.5 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/zeromq.json) | README指定の候補、実物との対応未確認 |
| zimg | release-3.0.5-150-g7143181 | 未取得 | 静的ライブラリ／dispatcher | [取得記録](library-sources/zimg.json) | README指定の候補、実物との対応未確認 |
| bzlib | 記載なし | 未確定 | 静的ライブラリ候補 | [候補調査](library-sources/bzlib.json) | 正確なrevision未確定。追加調査参照 |
| gmp | 記載なし | 未確定 | 静的ライブラリ候補 | [候補調査](library-sources/gmp.json) | 正確なrevision未確定。追加調査参照 |
| gnutls | 記載なし | 未確定 | 静的ライブラリ候補 | [候補調査](library-sources/gnutls.json) | 正確なrevision未確定。追加調査参照 |
| iconv | 記載なし | 未確定 | 静的ライブラリ候補 | 未取得 | 正確なrevision未確定。追加調査参照 |
| libfontconfig | 記載なし | 未確定 | 静的ライブラリ候補 | 未取得 | 正確なrevision未確定。追加調査参照 |
| libopenjpeg | 記載なし | 未確定 | 静的ライブラリ候補 | 未取得 | 正確なrevision未確定。追加調査参照 |
| libxml2 | 記載なし | 未確定 | 静的ライブラリ候補 | 未取得 | 正確なrevision未確定。追加調査参照 |
| lzma | 記載なし | 未確定 | 静的ライブラリ候補 | 未取得 | 正確なrevision未確定。追加調査参照 |
| zlib | 記載なし | 未確定 | 静的ライブラリ候補 | 未取得 | 正確なrevision未確定。追加調査参照 |

## 残作業と保管

1. x265の版情報の不一致とoneVPLの正確なrevisionを提供元に確認する。
2. 版不明9件、libogg・OpenSSL等の推移的依存物、実際に使用されたパッチとビルド設定を確定する。
   推移的依存物候補はsources.jsonに記載し、全件を同梱済みと断定しない。
3. AviSynthPlus/filesystem、FreeType/subprojects/dlg、zimg/graphengineとtest/extra/googletestは
   サブモジュールとして別アーカイブに保存。親コミットと配置先は各取得記録のsubmoduleを参照。
   ビルドでの要否・使用設定は未確認。
4. 全候補のバイナリとの対応と資料の完全性を確認してから、対応ソース一式として公開する。

アーカイブは `third_party/ffmpeg/win32-x64/libraries/` にローカル保存。
大容量のためGit管理対象外であり、クローン・アプリ配布物には自動では含まれない。
今後の公開用ファイルとして保管し、リリース前に公開URLとダウンロード可能性を確認する。
取得スクリプト: `scripts/acquire-library-sources.ps1`（版の固定情報はlibrary-source-plan.json）。
検証・一覧更新: `node scripts/summarize-library-sources.cjs`。
提供元への確認文案は[SOURCE-REQUEST.md](SOURCE-REQUEST.md)（未送信）。
