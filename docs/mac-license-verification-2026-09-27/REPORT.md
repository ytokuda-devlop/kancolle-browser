# macOS成果物の再検証（2026-09-27）

Macの未署名ZIP・DMGを再生成し、通知28件・npm5件・ネイティブ13件・版の照合に成功した。
Windowsはユーザーから検証済みとの申告があり、今回の実行対象はMacのみ。
Xcodeを使う再ビルドと改変したlibffmpeg.dylibへの交換後の動作検証は、
ユーザーの指示によりスキップした。これらを検証成功とは記録しない。

## 既存成果物で見つかった不一致

`release/kancolle-browser_1.0.0_mac.zip`と同名DMGの通知検査は失敗した。
現在の`licenses/ELECTRON-SOURCES.txt`にある2026-09-27追補が収録されていなかった。
ZIP内の通知を原本と全件比較し、差分はこの1ファイルであることを確認した。
DMGも同ファイルの原本不一致で停止した。
旧成果物のハッシュは`original-artifacts.json`、差分は`original-notice-difference.patch`。

現在の原本を使用し、別ディレクトリへ再生成した。既存の公開ZIP・DMGは置換していない。
アプリのソースコード・依存版・ライセンス原文はこの検証作業では変更していない。

## 合格した新しい成果物

保存先: `release/mac-license-verification-2026-09-27/`

| 形式 | SHA-256 |
| --- | --- |
| ZIP | `51d16e3e58be1d4dbe1fb552dfea372b619185541a64a03e9027c400a8fdc8ed` |
| DMG | `2dd8d185b309db6db5390734ad3229a44b941b8b36462ea9248b2a8a96f8dc04` |

両形式を最終コンテナから展開して確認した内容:

- アプリ版1.0.0、Electron44.0.0、x64。
- 通知28件が現在の原本とバイト単位で一致。録画変換用FFmpeg・ffmpeg-staticの混入なし。
- 本番npm5件の版・条件がロックファイルおよび固定基準と一致。
- ネイティブ13件の一覧・コード領域が、公式Electron等との対応を確認した既存監査の基準と一致。
- アプリは未署名。署名版の作成や署名後照合は行っていない。

`baseline.json`は今回の原本で新たに固定した基準。過去の基準ファイルは上書きしていない。
新しいElectronの出典を自己比較で認定したものではなく、既存監査済みの公式コードを
`verify-release-candidate.cjs`のfreeze処理で再照合した上で通知の基準を固定した。
結果は`mac-zip.json`・`mac-dmg.json`。

## Xcodeなしで実行した読み込み確認

再生成した.appの実行ファイルを`ELECTRON_RUN_AS_NODE=1`で実行し、終了コード0を確認。
実行時のElectron44.0.0・Chromium152.0.7977.54・Node24.18.1・darwin/x64を確認した。
アプリの通常GUIやゲームへのログインは起動していない。

同.appのFFmpegを`ctypes.CDLL`で読み込み、次のAPI呼び出しに成功した:

- `av_version_info`: `git-2026-07-15-6cfe2122b0`
- `avcodec_license`: `LGPL version 2.1 or later`
- SHA-256: `0ea472e75cdf7fb5b2786bf1c5d84fa81b1638199cc01008db58de2616a764c1`

詳細は`runtime-smoke.json`。これは元のライブラリの読み込み確認であり、
録画・音声同期・シークや改変ライブラリへの交換後の検証ではない。
録画・音声同期・シークについては以前のユーザー実機確認を引き続き別記録として扱う。

## 判定の範囲

**今回のMac成果物の版・通知・既知の部品との一致は検証済み。**
「Electronを含む残存部品の未解決事項を全件解消済み」とする判定には拡張しない。
対応ソースの推移的ビルド入力、改変版のビルド・交換、ソース公開後の取得確認、
全静的リンク入力の対応については、今回新たに解消を証明したものではない。
Windowsの検証済み申告も、未受領の許諾資料やビルド記録を取得済みとする根拠にはしない。
Xcode関連は「ユーザー指定でスキップ」とする。

## 実行内容

```sh
npm run build
node scripts/verify-release-candidate.cjs --freeze docs/mac-license-verification-2026-09-27/baseline.json
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac zip dmg --x64 --publish never -c.directories.output=release/mac-license-verification-2026-09-27
```

続いて両成果物に`verify-release-candidate.cjs`の`verifyCandidate`を実行した。
DMGのマウントは読み取り専用。検査終了後に解除した。
コミットと作業状態は`working-state.json`。外部公開は行っていない。
