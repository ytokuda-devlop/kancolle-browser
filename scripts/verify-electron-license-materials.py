"""Verify pinned source archives/notices and optionally assemble an internal review bundle.

This does not certify complete corresponding source or publish anything.
Download missing archives from source-archives.json before running.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / 'docs/electron-license-review-2026-09-25'
TREE_SPEC = importlib.util.spec_from_file_location('git_tree', ROOT / 'scripts/source-archive-git-tree.py')
sys.dont_write_bytecode = True
TREE_MODULE = importlib.util.module_from_spec(TREE_SPEC)
TREE_SPEC.loader.exec_module(TREE_MODULE)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def same_notice(original, copy):
    # Git's Windows checkout may convert LF to CRLF; preserve every other byte.
    if original.replace(b'\r\n', b'\n') != copy.replace(b'\r\n', b'\n'):
        raise RuntimeError('Notice content mismatch (ignoring only CRLF/LF)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-review', action='store_true')
    args = parser.parse_args()
    records = json.loads((REVIEW / 'source-archives.json').read_text(encoding='utf-8'))
    supplemental = json.loads((REVIEW / 'supplemental-source-archives.json').read_text(encoding='utf-8'))
    acquisition = json.loads((REVIEW / 'source-reacquisition.json').read_text(encoding='utf-8'))
    verification = []
    all_records = records + supplemental['archives']
    for record in all_records:
        archive = ROOT / record['path']
        if not archive.exists():
            raise RuntimeError(f"Missing {archive}; download from {record['url']}")
        digest = sha256(archive.read_bytes())
        expected_digest = record['sha256']
        tree = record.get('tree')
        if record['path'] == acquisition['path']:
            tree = acquisition['tree']
            if digest != expected_digest:
                expected_digest = acquisition['sha256']
        if digest != expected_digest:
            raise RuntimeError(f'Archive SHA-256 mismatch: {archive}')
        if tree and TREE_MODULE.archive_tree(archive) != tree:
            raise RuntimeError(f'Archive Git tree mismatch: {archive}')
        count = 0
        with tarfile.open(archive) as source:
            for member in source:
                if member.isfile():
                    with source.extractfile(member) as stream:
                        while stream.read(1024 * 1024):
                            pass
                    count += 1
        if count != record['readableFileCount']:
            raise RuntimeError(f'Archive file count mismatch: {archive}')
        verification.append({'path': record['path'], 'sha256': digest, 'tree': tree, 'files': count})

    with tarfile.open(ROOT / records[0]['path']) as ffmpeg:
        for source, notice in [('COPYING.LGPLv2.1', 'LGPL-2.1.txt'),
                               ('CREDITS.chromium', 'FFmpeg-CREDITS.txt')]:
            same_notice(ffmpeg.extractfile(source).read(), (ROOT / 'licenses/electron-components' / notice).read_bytes())
        for platform in ['mac', 'win']:
            config = ffmpeg.extractfile(f'chromium/config/Chrome/{platform}/x64/config.h').read().decode()
            for flag in ['GPL', 'NONFREE', 'VERSION3', 'LIBX264', 'LIBX265']:
                assert f'#define CONFIG_{flag} 0' in config
            assert '#define FFMPEG_LICENSE "LGPL version 2.1 or later"' in config
        with tempfile.TemporaryDirectory(prefix='electron-ffmpeg-patch-') as tmp:
            Path(tmp, 'BUILD.gn').write_bytes(ffmpeg.extractfile('BUILD.gn').read())
            with tarfile.open(ROOT / records[1]['path']) as electron:
                member = next(m for m in electron if m.name.endswith('/patches/ffmpeg/link_with_loader_path.patch'))
                patch_bytes = electron.extractfile(member).read()
            same_notice(patch_bytes, (REVIEW / 'evidence/electron-ffmpeg-loader.patch').read_bytes())
            patch = Path(tmp, 'loader.patch')
            patch.write_bytes(patch_bytes)
            subprocess.run(['git', 'apply', '--check', str(patch)], cwd=tmp, check=True)

    for original, copy in [('mantle-LICENSE.md', 'Mantle-LICENSE.md'),
                            ('reactiveobjc-LICENSE.md', 'ReactiveObjC-LICENSE.md'),
                            ('squirrel-LICENSE', 'Squirrel-LICENSE.txt')]:
        same_notice((REVIEW / 'evidence' / original).read_bytes(), (ROOT / 'licenses/electron-components' / copy).read_bytes())
    report = {'archivesVerified': len(all_records), 'archives': verification, 'noticesMatch': True,
              'noticeComparison': 'Content equality ignoring CRLF/LF only; not byte identity',
              'ffmpegConfigurationVerified': True, 'electronFfmpegPatchApplies': True,
              'completeCorrespondingSourceCertified': False,
              'remaining': ['Full GN dependency closure and clean builds on both target platforms',
                            'Modified-library replacement validation',
                            'Public source delivery with the matching release',
                            'Other Windows installer components']}
    (REVIEW / 'source-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    if args.prepare_review:
        output = ROOT / 'release/electron-source-review'
        output.mkdir(parents=True, exist_ok=True)
        archive = output / 'electron-44.0.0-INCOMPLETE-source-review.tar'
        with tarfile.open(archive, 'w') as bundle:
            for record in all_records:
                bundle.add(ROOT / record['path'], arcname=record['path'])
            for file in ['licenses/ELECTRON-SOURCES.txt', 'THIRD_PARTY_NOTICES.md', 'package.json']:
                bundle.add(ROOT / file, arcname=file)
            for directory in ['licenses/electron-components', 'licenses/windows',
                              'docs/electron-license-review-2026-09-25']:
                bundle.add(ROOT / directory, arcname=directory)
            bundle.add(Path(__file__), arcname='scripts/verify-electron-license-materials.py')
            for script in ['source-archive-git-tree.py', 'acquire-electron-build-inputs.py']:
                bundle.add(ROOT / 'scripts' / script, arcname='scripts/' + script)
        (output / 'SHA256SUMS.txt').write_text(f'{sha256(archive.read_bytes())}  {archive.name}\n')
        report['reviewArchive'] = str(archive.relative_to(ROOT))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
