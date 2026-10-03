# 艦娘は今日もお仕事です（仮）

艦娘は今日もお仕事です（仮）は、 DMM.com が配信しているブラウザゲーム「艦隊これくしょん〜艦これ〜」を遊びやすくするためのツールです。

ダウンロードは、[Github - 最新リリース](https://github.com/ytokuda-devlop/kancolle-browser/releases/latest) からどうぞ。

## このプロジェクトについて

「艦これ」のゲーム画面と、プレイ中に確認したい情報をひとつのウィンドウにまとめたデスクトップ向け専用ブラウザです。

**当然ですが、DMM/艦これサーバーに対するゲームの通信内容の改変や、マクロによる自動操作・チート行為は一切行っていません。**

## 主な機能

- **艦隊・装備情報の表示**：第1〜第4艦隊を切り替え、艦娘のレベル・HP・コンディション・能力値や装備を確認できます。装備の改修値・熟練度・搭載数、艦隊の索敵値・制空値も表示します。
- **資源・資材の表示**：燃料・弾薬・鋼材・ボーキサイトや各種資材の所持数、艦娘・装備の保有数と上限を確認できます。
- **遠征・入渠・建造の状況表示**：各艦隊やドックの状態と、完了までの残り時間を確認できます。
- **任務の進捗表示**：進行中の任務名と進捗状況を確認できます。
- **出撃情報の表示**：出撃中の艦隊・海域・現在マス・ボスマスを確認できます。イベント海域ではゲージの情報も表示します。
- **スクリーンショット撮影**：ゲーム画面を画像として保存できます。

## 動作環境

- Windows 11
- macOS (Apple Silicon（arm64）)のみ
- 1920 \* 1080以上のモニタ推奨

## 開発環境・言語

Electron + React で開発しています。

ChatGPTを使用しています。

開発環境は Macbook Pro + VSCode になります。

## TypeScriptの段階導入

React側とElectron側のアプリソースはすべてTS・TSXへ移行済みです。
開発用依存関係は `npm ci` でインストールできます。

- `tsconfig.base.json`：共通設定。`strict: true`・`allowJs: false` でアプリのTSを検査します。
- `tsconfig.renderer.json`：React・DOM・Vite用。`src/` と今後追加する `shared/` を対象にします。
- `tsconfig.electron.json`：Node・Electron用。`electron/` と `shared/` を対象にし、現在のpackage.jsonに合わせてCommonJSとして解決します。

`npm run typecheck` で両方の型チェックを実行します。
個別に実行する場合は `npm run typecheck:renderer` または `npm run typecheck:electron` を使います。
`npm run build` と、それを呼ぶ配布コマンドでも、ビルド前に型チェックを実行します。

両設定とも `noEmit: true` とし、型チェックとJSの生成を分けています。
Electron用JSは `npm run build:electron` で型チェック後にesbuildで生成します。
mainとpreloadをCommonJSの別バンドルとして `dist-electron/main.js` と `dist-electron/preload.js` に出力します。
`npm run dev` はElectronをビルドしてからViteとElectronを起動し、配布コマンドは生成物を収録します。
Electron側を変更した場合は `npm run dev` を再起動してください（React側は従来通りHMRで反映）。

共通の型は `shared/kancolle.ts`（表示用データ）と `shared/electronApi.ts`（公開API）に定義しています。
`src/types/electron.d.ts` が `window.electronAPI` の型を宣言します。
通常のブラウザではAPIが存在しないため、利用前に存在を確認してください。
main・window・preload・IPC・services・共有runtimeはTSへ移行済みです。
`electron/preload.ts` は共通の `ElectronAPI` 型に合わせて公開APIを定義します。
共通の型は `import type` で参照し、実行時のrequireを追加しません。
`electron/kancolle/store.ts` と `apiCapture.ts` もTSへ移行済みです。
APIの受信型は `apiTypes.ts`、ストア内部の状態型は `storeTypes.ts` に定義します。
JSONとCDPの受信境界では、エンドポイント・イベントごとの型を指定しています。
全フィールドを実行時に検証するスキーマは追加していません。
`npm run test:kancolle` で、母港データの整形・艦隊変更・補給・修復・任務・出撃・通信捕捉の回帰テストを実行できます。

## ライセンス

本プロジェクトの独自ソースコードは、[MITライセンス](LICENSE)で公開しています。

使用ライブラリや同梱ソフトウェアには、それぞれのライセンスが適用されます。

詳細は[第三者ソフトウェアのライセンス表記](THIRD_PARTY_NOTICES.md)と[配布ライセンス方針](licenses/DISTRIBUTION-NOTES.txt)をご確認ください。

配布物内のライセンスの閲覧場所とビルド時の収録検証については、
[ライセンス収録手順](docs/LICENSE-PACKAGING.md)を参照してください。

## 使用ライブラリ

主なライブラリと開発ツールを以下に記載します。ライセンス全文へのリンクには、各パッケージに付属するライセンス文書を掲載しています。

| ライブラリ・ソフトウェア | 用途                               | Copyright・作者表記                                                       | ライセンス  | ライセンス全文                                    |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------------- | ----------- | ------------------------------------------------- |
| Electron                 | デスクトップアプリの実行基盤       | Copyright (c) Electron contributors / Copyright (c) 2013-2020 GitHub Inc. | MIT         | [全文](licenses/electron-LICENSE.txt)             |
| React                    | 画面のUI構築                       | Copyright (c) Facebook, Inc. and its affiliates.                          | MIT         | [全文](licenses/react-LICENSE.txt)                |
| React DOM                | ReactのUIを画面に描画              | Copyright (c) Facebook, Inc. and its affiliates.                          | MIT         | [全文](licenses/react-dom-LICENSE.txt)            |
| Scheduler                | Reactの描画処理のスケジューリング  | Copyright (c) Facebook, Inc. and its affiliates.                          | MIT         | [全文](licenses/scheduler-LICENSE.txt)            |
| Vite                     | 開発サーバー・画面のビルド         | Copyright (c) 2019-present, VoidZero Inc. and Vite contributors           | MIT（本体） | [全文・同梱依存の表記](licenses/vite-LICENSE.txt) |
| @vitejs/plugin-react     | ViteでのReact開発支援              | Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors         | MIT         | [全文](licenses/vitejs-plugin-react-LICENSE.txt)  |
| electron-builder         | 配布用アプリ・インストーラーの作成 | Copyright (c) 2015 Loopline Systems                                       | MIT         | [全文](licenses/electron-builder-LICENSE.txt)     |
| concurrently             | 開発時にViteとElectronを同時起動   | Copyright (c) 2015 Kimmo Brunfeldt                                        | MIT         | [全文](licenses/concurrently-LICENSE.txt)         |
| wait-on                  | 開発サーバーの起動完了を待機       | Copyright (c) 2015 Jeff Barczewski                                        | MIT         | [全文](licenses/wait-on-LICENSE.txt)              |

その他の依存ライブラリは[第三者ソフトウェアのライセンス表記](THIRD_PARTY_NOTICES.md)、Electronに含まれるChromium・Node.js等のライセンスは[同梱ソフトウェアのライセンス全文](licenses/LICENSES.chromium.html)に記載しています。
