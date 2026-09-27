# Windowsインストーラーの原本

取得先・SHA-256・サイズは[sources.json](sources.json)。バイナリとソースの
アーカイブはGitに含めない。再取得後は次のコマンドで原本と実物を照合する。

```sh
python3 scripts/verify-windows-installer-materials.py --setup 'release/… Setup 1.0.0.exe' --portable 'release/… 1.0.0.exe' --output release/windows-materials.json
```

`--seven-zip /path/to/7zz`でNSIS対応7-Zipを指定できる。
省略時はelectron-builderのmacOSキャッシュから検索する。
調査結果と未確定事項は[報告書](../../docs/windows-license-review-2026-09-26/REPORT.md)。

nsis7zは`Nsis7z_19.00.7z`と`lzma1900.7z`の両方が必要。
SDKの`C`/`CPP`をプラグインの`Contrib/nsis7z`へ重ねて、VS2017で
`CPP/7zip/Bundles/Nsis7z/Nsis7z.sln`をビルドするのが原本の指定。
DLLはWin32 Unicode版。VSでの再ビルド・置換手順の検証は未実施。

`elevate-1.0.zip`は作者の原本だが、同梱EXEは実物と一致しない。
`elevate-provider.exe`は実物と一致する提供元のEXEで、ソースではない。
このディレクトリを「対応ソース提供完了」と扱わない。
