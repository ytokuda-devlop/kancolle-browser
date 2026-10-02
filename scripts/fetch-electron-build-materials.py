#!/usr/bin/env python3
"""Fetch pinned upstream build material; this is not a full Chromium checkout.

Default: verify the saved manifest. --fetch: acquire missing material and record
its hash on first acquisition. Existing hashes are never silently updated.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / 'docs/source-delivery-2026-09-27'
MANIFEST = REVIEW / 'build-materials.json'
CHROMIUM = '24072c1aa400ec4a89dc738b6b6acd12a8589b6f'
BASE = f'https://chromium.googlesource.com/chromium/src/+archive/{CHROMIUM}'
RAW = f'https://raw.githubusercontent.com/chromium/chromium/{CHROMIUM}'
SPECS = [
    (f'{RAW}/{path}', f'evidence/chromium/{path}', False)
    for path in ['DEPS', '.gn', 'BUILD.gn', 'LICENSE',
                 'docs/mac_build_instructions.md', 'docs/windows_build_instructions.md',
                 'build/config/mac/mac_sdk.gni', 'build/vs_toolchain.py',
                 'tools/clang/scripts/update.py', 'third_party/opus/BUILD.gn',
                 'third_party/opus/README.chromium']
] + [
    (f'{BASE}/{path}.tar.gz', f'../../third_party/electron-44.0.0/{name}.tar.gz', True)
    for path, name in [('build', 'chromium-build-24072c1aa400'),
                       ('third_party/opus', 'chromium-opus-24072c1aa400'),
                       ('tools/generate_stubs', 'chromium-generate-stubs-24072c1aa400')]
] + [
    ('https://chromium.googlesource.com/chromium/deps/nasm/+archive/'
     '525a09a813be0f75b646ee93fc2a31c27b87d722.tar.gz',
     '../../third_party/electron-44.0.0/nasm-525a09a813be0.tar.gz', True),
    ('https://chromium.googlesource.com/chromium/tools/depot_tools/+archive/'
     '38c391feba5fb96812f9028da12413ffc39df394.tar.gz',
     '../../third_party/electron-44.0.0/depot-tools-38c391feba5f.tar.gz', True),
]


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    records = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []
    indexed = {r['url']: r for r in records}
    for url, relative, archive in SPECS:
        path = (REVIEW / relative).resolve()
        path.relative_to(ROOT)
        record = indexed.get(url)
        if not path.exists():
            if not args.fetch:
                raise RuntimeError(f'Missing {path}')
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(path.name + '.download')
            subprocess.run(['curl', '-fsSL', '--retry', '3', '--retry-all-errors', '--max-time', '180',
                            url, '-o', str(temporary)], check=True)
            if record and digest(temporary) != record['sha256']:
                raise RuntimeError(f'Download hash mismatch: {url}')
            temporary.replace(path)
        actual = digest(path)
        if record:
            if actual != record['sha256'] or path.stat().st_size != record['bytes']:
                raise RuntimeError(f'Changed material: {path}')
        elif not args.fetch:
            raise RuntimeError(f'Unpinned material: {path}')
        else:
            record = {'path': str(path.relative_to(ROOT)), 'url': url,
                      'sha256': actual, 'bytes': path.stat().st_size}
            if archive:
                count = 0
                with tarfile.open(path) as source:
                    for member in source:
                        if member.isfile():
                            with source.extractfile(member) as stream:
                                while stream.read(1024 * 1024):
                                    pass
                            count += 1
                record['readableFileCount'] = count
            records.append(record)
            MANIFEST.write_text(json.dumps(records, indent=2) + '\n')
        print(f'Verified {path.name}', flush=True)
    print(f'{len(SPECS)} build materials verified; full dependency closure NOT certified.')


if __name__ == '__main__':
    main()
