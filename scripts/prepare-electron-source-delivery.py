#!/usr/bin/env python3
"""Build/verify a deterministic, explicitly incomplete Electron source-material bundle.

No network access, build, application execution or publication is performed.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile

ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / 'docs/source-delivery-2026-09-27'
NAME = 'electron-44.0.0-source-materials-2026-09-27.tar.gz'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def verify(archive):
    with tarfile.open(archive, 'r:gz') as bundle:
        members = bundle.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)):
            raise ValueError('Duplicate members')
        for member in members:
            name = PurePosixPath(member.name)
            if not member.isfile() or name.is_absolute() or '..' in name.parts:
                raise ValueError(f'Unsafe member: {member.name}')
        index = json.load(bundle.extractfile('MANIFEST.json'))
        expected = {r['path'] for r in index['files']}
        if len(expected) != len(index['files']) or set(names) != expected | {'MANIFEST.json'}:
            raise ValueError('Manifest/member set mismatch')
        for row in index['files']:
            data = bundle.extractfile(row['path']).read()
            if sha(data) != row['sha256'] or len(data) != row['bytes']:
                raise ValueError(f'Content mismatch: {row["path"]}')
        status = json.load(bundle.extractfile('STATUS.json'))
        if status['completeCorrespondingSource'] is not False:
            raise ValueError('This workflow cannot certify complete corresponding source')
    return {'archive': archive.name, 'sha256': sha(archive.read_bytes()),
            'bytes': archive.stat().st_size, 'verifiedFiles': len(expected),
            'completeCorrespondingSource': False}


def prepare(output):
    old = json.loads((ROOT / 'docs/electron-license-review-2026-09-25/source-archives.json').read_text())
    records = [r for r in old if Path(r['path']).name.startswith(('ffmpeg-', 'electron-'))]
    additional = json.loads((REVIEW / 'build-materials.json').read_text())
    # An interrupted fetch must not produce a package that silently omits material.
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location('fetch_materials', ROOT / 'scripts/fetch-electron-build-materials.py')
    fetch = module_from_spec(spec)
    spec.loader.exec_module(fetch)
    if {r['url'] for r in additional} != {s[0] for s in fetch.SPECS}:
        raise ValueError('Build-material acquisition is incomplete')
    records += additional
    files = {}
    for record in records:
        path = (ROOT / record['path']).resolve()
        path.relative_to(ROOT)
        data = path.read_bytes()
        if sha(data) != record['sha256'] or len(data) != record['bytes']:
            raise ValueError(f'Pinned input mismatch: {path}')
        if path.name.endswith('.tar.gz'):
            with tarfile.open(fileobj=io.BytesIO(data)) as source:
                count = 0
                for member in source:
                    if member.isfile():
                        with source.extractfile(member) as stream:
                            while stream.read(1024 * 1024):
                                pass
                        count += 1
                if count != record['readableFileCount']:
                    raise ValueError(f'Archive file count mismatch: {path}')
            name = 'archives/' + path.name
        else:
            name = 'materials/' + str(path.relative_to(REVIEW / 'evidence'))
        if name in files:
            raise ValueError(f'Duplicate destination: {name}')
        files[name] = data
    for name in ['BUILD-AND-REPLACE.md', 'RELEASE-NOTES.md', 'REPORT.md']:
        files[name] = (REVIEW / name).read_bytes()
    files['build-materials.json'] = (REVIEW / 'build-materials.json').read_bytes()
    files['source-archives.json'] = encode(records[:2])
    files['LICENSE'] = (ROOT / 'LICENSE').read_bytes()
    for path in sorted((REVIEW / 'evidence').rglob('*')):
        if path.is_file():
            files['evidence/' + path.relative_to(REVIEW / 'evidence').as_posix()] = path.read_bytes()
    for path in ['licenses/electron-components/LGPL-2.1.txt',
                 'licenses/electron-components/FFmpeg-CREDITS.txt',
                 'docs/electron-license-review-2026-09-25/evidence/electron-ffmpeg-loader.patch']:
        files['notices-and-patches/' + Path(path).name] = (ROOT / path).read_bytes()
    for path in ['scripts/prepare-electron-source-delivery.py', 'scripts/fetch-electron-build-materials.py',
                 'scripts/audit-electron-build-imports.py']:
        files[path] = (ROOT / path).read_bytes()
    files['UPSTREAM-MATERIALS.json'] = encode(records)
    files['STATUS.json'] = encode({
        'scope': 'Electron 44.0.0 embedded FFmpeg, macOS x64 and Windows x64',
        'completeCorrespondingSource': False,
        'macosRebuildAndModifiedLibraryRuntime': 'skipped by user request (Xcode not installed)',
        'windowsRebuildAndModifiedLibraryRuntime': 'not performed (Windows build environment unavailable)',
        'transitiveBuildInputClosure': 'not verified by GN; full Chromium checkout and PGO inputs not included',
        'publication': 'user will upload; public availability not yet verified',
        'publicRelease': 'https://github.com/ytokuda-devlop/kancolle-browser/releases/tag/v1.0.0',
        'publicFfmpegBytes': 'macOS and Windows match previously audited official Electron 44.0.0',
    })
    files['README.md'] = (
        '# Electron 44.0.0 source materials — completeness not certified\n\n'
        '固定版ソース資料の提供。完全な対応ソースの提供完了とは判定していません。\n'
        'STATUS.json、BUILD-AND-REPLACE.md、REPORT.mdを先にお読みください。\n'
        'archives/は取得した原本です。ビルドには追加のChromium依存入力が必要です。\n'
        '外側アーカイブのMANIFEST.jsonで全収録ファイルのSHA-256を確認できます。\n'
        'パッチはElectron原本にも含まれます。二重適用しないでください。\n'
        'scripts/はアプリのリポジトリから再作成するためのものです。\n'
        '単体で検査する場合: python3 scripts/prepare-electron-source-delivery.py --verify ARCHIVE\n'
    ).encode()
    files['MANIFEST.json'] = encode({'files': [
        {'path': name, 'bytes': len(data), 'sha256': sha(data)}
        for name, data in sorted(files.items())]})
    output.mkdir(parents=True, exist_ok=True)
    destination = output / NAME
    temporary = output / (NAME + '.tmp')
    with temporary.open('wb') as stream:
        with gzip.GzipFile(filename='', mode='wb', fileobj=stream, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as bundle:
                for name, data in sorted(files.items()):
                    info = tarfile.TarInfo(name)
                    info.size, info.mode, info.mtime = len(data), 0o644, 0
                    bundle.addfile(info, io.BytesIO(data))
    result = verify(temporary)
    temporary.replace(destination)
    result['archive'] = destination.name
    shutil.copyfile(REVIEW / 'RELEASE-NOTES.md', output / 'RELEASE-NOTES.md')
    (output / 'SHA256SUMS.txt').write_text(''.join(
        f'{sha((output / name).read_bytes())}  {name}\n'
        for name in [NAME, 'RELEASE-NOTES.md']))
    (REVIEW / 'bundle-verification.json').write_bytes(encode(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path, help='verify a bundle without extracting it')
    parser.add_argument('--output', type=Path, default=ROOT / 'release/source-delivery-2026-09-27/upload')
    args = parser.parse_args()
    result = verify(args.verify) if args.verify else prepare(args.output)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
