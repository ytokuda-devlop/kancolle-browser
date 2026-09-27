### Electron内蔵FFmpegのソース資料

このリリースのmacOS x64 / Windows x64で使用するElectron 44.0.0のFFmpegについて、
ソース・Electronパッチ・追加ビルド資料・交換手順を添付しました。

- `electron-44.0.0-source-materials-2026-09-27.tar.gz`
- `SHA256SUMS.txt`

アーカイブ内の`BUILD-AND-REPLACE.md`と`STATUS.json`をご確認ください。
FFmpegとElectronの原本に加え、固定版Chromiumのビルド設定、Opus、NASM、
Windows用エクスポート定義の生成スクリプト、depot_toolsを含みます。

**これは現時点で確保できたソース資料の提供です。推移的ビルド入力一式の確認と
改変版への交換検証は未完了であり、完全な対応ソースの提供完了とは表示していません。**
macOSのXcodeを必要とする工程は未実施です。Windows側のビルド・交換確認も未実施です。
Windowsインストーラー部品の別途調査を含む、全ライセンス課題の解消を意味しません。

アプリ独自コードのMIT条件とは別に、各第三者部品の原文条件を保持しています。
録画変換用の旧ffmpeg-staticの資料ではありません。
