# 配布成果物へのライセンス収録

`package.json`の`build.extraResources`は、ルートの`LICENSE`と
`THIRD_PARTY_NOTICES.md`と、`licenses/`の`filter`に明示した8ファイルをASAR外に収録する。
旧FFmpegの調査資料・GPL本文・不要になった依存通知・開発ツール通知は配布しない。
原本は調査履歴としてソースツリーに保持する。

| 配布先 | 閲覧場所 |
| --- | --- |
| macOSアプリ（ZIP／DMG内を含む） | `KancolleBrowser.app/Contents/Resources/licenses/` |
| Windowsインストール先 | `resources/licenses/` |
| Windows portable | 内部アプリの`resources/licenses/`（実行時に展開される） |

macOSでは「パッケージの内容を表示」から閲覧できる。
`LICENSES.chromium.html`も省略せず、そのまま収録する。

## ビルド時の検証

通常の`npm run package`／`npm run dist:mac`／`npm run dist:win`に組み込まれている。

1. `afterPack`で、展開済みアプリの全ライセンスを原本とバイト単位で照合する。
2. `artifactBuildCompleted`で、完成したZIP・DMG・NSIS・portableを
   新規一時ディレクトリへ展開し、同じ照合を行う。
   DMGは読み取り専用でマウントし、終了時に解除する。
   Windowsインストーラーは実行せず、内包する全`app-*.7z`を検証する。
3. 欠落、空ファイル、内容不一致、選択外資料の混入、展開失敗はビルド失敗となる。
   ASARとresources内のffmpeg-static、ffmpeg／ffmpeg.exeの混入も失敗させる。
   Electron自身のlibffmpeg.dylib／ffmpeg.dllは保持する。
   成功時は成果物の隣に`<成果物名>.licenses.json`を保存する。
   記録には成果物SHA-256と各ライセンスのパス・サイズ・SHA-256が含まれる。

最終コンテナの検証はelectron-builderの成果物通知より前に実行する。
`--dir`はコンテナを作らないため、`afterPack`による検証のみ行う。
DMG検証はmacOSの`hdiutil`、ZIPはmacOSの`ditto`または7-Zip、
Windows実行ファイルはNSIS対応7-Zipを利用する。
ツールやマウント権限が不足する場合も検証をスキップせず失敗させる。

## 手動での再検証

```sh
node scripts/verify-packaged-licenses.cjs '<展開済みアプリのresourcesディレクトリ>'
node scripts/verify-artifact-licenses.cjs '<ZIP・DMG・EXEのパス>' '<記録JSONのパス>'
node --test tests/packaged-licenses.test.cjs
```

記録は検証したハッシュの成果物にのみ有効。再ビルドや署名後は再検証する。
ライセンス収録と録画変換用FFmpeg不在の確認は、Electron内蔵FFmpeg等の
適用条件・必要な対応ソースの確認完了を意味しない。

2026-09-24の旧構成の検証結果は今回の成果物へ流用しない。
今回の変更記録は[FFmpeg除去後の対応](ffmpeg-removal-2026-09-25/REPORT.md)を参照。
