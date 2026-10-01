# 静的リンク部品の追加確認（2026-10-02）

Mac公開ZIPのFFmpegについて、ビルド定義から追跡した4系統のランタイムソースを固定版で追加取得した。25,262通常ファイルを読み取り、ファイル単位のSHA-256を保存した。libc++／libc++abiのGN原文にある71個のリテラルファイル参照は、取得したソースにすべて存在する。条件分岐の両側を含む存在確認であり、71ファイルが最終バイナリにリンクされたという判定ではない。

## 固定ソースと確認結果

| 部品 | 固定版 | 今回の結果 |
| --- | --- | --- |
| libc++ | b16984ce99c702355a5b2b4c52574e82cec41fb9 | ソース・LICENSE.TXT取得、GN参照ファイル存在確認 |
| libc++abi | 8f11bb1d4438d0239d0dfc1bd9456a9f31629dda | ソース・LICENSE.TXT取得、GN参照ファイル存在確認 |
| LLVM libc | 3ea89f4304312567e31a8eb45e0737577e65b676 | ヘッダーを含むソース・LICENSE.TXT取得。共有ライブラリ収録とは扱わない |
| Clang由来compiler-rt候補 | 53d18800eda3b7407e53366f27ca78e922c6e0db | compiler-rtサブツリー取得、builtinsのCMake定義・x86_64ソース存在確認。公式ツールチェーン内builtinsとの対応は未確定 |

最初の3つのコミットはChromium DEPSが指定する**分割リポジトリ**のコミットであり、LLVM monorepoの同じコミットとして解釈しない。compiler-rtはClang更新スクリプトから解決したmonorepoコミットを使用し、別のcompiler_rt DEPS値とは区別した。

取得URL・アーカイブSHA-256は[inputs.json](inputs.json)、検査結果は[runtime-inputs.json](runtime-inputs.json)。4つの `*-files.json` は全通常ファイルのハッシュ一覧。原文は `evidence/*-LICENSE.TXT` に保存した。

## 必要なソースと条件

| 対象 | 確認した条件／扱い | 残る確認 |
| --- | --- | --- |
| LLVM系4部品 | 各固定版の原文はApache-2.0 WITH LLVM-exceptionを掲げる。ソース再配布時はライセンス・著作権等を保持し、改変を表示し、適用されるNOTICEがあれば保持する。取得アーカイブを削減・改変せず保存した | 個別ファイル・第三者由来コードの別条件と、最終収録オブジェクトとの対応 |
| LLVM例外 | コンパイルによって生成物へ埋め込まれる部分には、所定の通知条件の例外がある。例外の適用を全ライブラリの無条件免除とは扱わない | 実際の組込み方を確認するまで、通知を省略しない |
| FFmpeg | LGPL 2.1の対象モジュール・関連インターフェース・コンパイル／インストール制御スクリプトを提供範囲として確認。共有ライブラリ交換方式の条件は別に確認する | 最終GN引数・リンク情報、GN接続資料、ツールチェーン固有変更、PGO等の入力と提供物への統合 |
| Opus | FFmpegからの宣言依存を確認済み。既存アーカイブのCOPYINGと各ソース通知を維持する | 実物へ入る最終オブジェクト範囲 |
| その他のElectron／Windows部品 | 既存45項目の根拠・通知・候補分類を維持する。シンボル確認、ビルド宣言、通知のみの候補を混同しない | Skia等の最終収録範囲、d3dcompiler条件、elevate CRT由来等は継続 |

LLVM各原文には旧ライセンス説明や第三者コードに別条件があり得る旨もあるため、トップレベルの表示だけで全ファイルを一律に分類しない。LLVMの許諾条件自体から、アプリ全体のソース公開義務を導くものではない。FFmpegの対応ソース範囲に必要かという判断と、それぞれのランタイムの独自の条件を分ける。

原文: [compiler-rt固定版](https://llvm.googlesource.com/llvm-project/+/53d18800eda3b7407e53366f27ca78e922c6e0db/compiler-rt/LICENSE.TXT)、[libc++固定版](https://chromium.googlesource.com/external/github.com/llvm/llvm-project/libcxx/+/b16984ce99c702355a5b2b4c52574e82cec41fb9/LICENSE.TXT)、[LGPL 2.1](https://opensource.org/license/lgpl-2-1)。他の固定版原文のリポジトリURLはinputs.jsonのarchive部分を当該LICENSE.TXTへ置き換えて参照できる。

## 完了範囲と残件

今回解消したのは「上記4系統の固定ソースが手元にない」という不足。**最終収録範囲・完全対応ソースの確定は未完了**。公式バイナリのリンクマップやビルドログがないため、ソース取得や動的依存の検査だけでは、デッドストリップ後の静的コードを完全には確定できない。

次の根拠が必要になる。

1. 公式ビルドの最終引数・リンクコマンド／マップ、または対象設定を評価した依存グラフと対応ソースの追加照合。
2. 配布ツールチェーンのbuiltinsと取得compiler-rtの対応、ツールチェーン側パッチ・生成入力の確認。
3. GN接続資料、PGO等の残る入力を既存ソース提供物へ統合し、受領者向け取得・構築・交換手順と照合。

Xcodeを要するビルド・交換試験はユーザー指定によりスキップした。署名版の作成は対象外。追加ソースは `third_party/electron-44.0.0/` に保存し、Git対象外を維持する。既存公開用ソースbundleとMac ZIPには統合していないため、それらのハッシュ・不完全性の表示は変わらない。

再検査: `python3 scripts/audit-static-runtime-inputs.py`。既存の[部品表](../native-inventory-2026-10-02/static-components.json)、[FFmpeg範囲調査](../ffmpeg-source-scope-2026-10-02/README.md)と併せて読む。
