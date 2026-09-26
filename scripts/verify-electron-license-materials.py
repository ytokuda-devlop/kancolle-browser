"""Verify pinned source archives/notices and optionally assemble an internal review bundle.

This does not certify complete corresponding source or publish anything.
Download missing archives from source-archives.json before running.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / 'docs/electron-license-review-2026-09-25'


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-review', action='store_true')
    args = parser.parse_args()
    records = json.loads((REVIEW / 'source-archives.json').read_text())
    for record in records:
        archive = ROOT / record['path']
        if not archive.exists():
            raise RuntimeError(f"Missing {archive}; download from {record['url']}")
        assert sha256(archive.read_bytes()) == record['sha256'], archive
        count = 0
        with tarfile.open(archive) as source:
            for member in source:
                if member.isfile():
                    with source.extractfile(member) as stream:
                        while stream.read(1024 * 1024):
                            pass
                    count += 1
        assert count == record['readableFileCount'], archive

    with tarfile.open(ROOT / records[0]['path']) as ffmpeg:
        for source, notice in [('COPYING.LGPLv2.1', 'LGPL-2.1.txt'),
                               ('CREDITS.chromium', 'FFmpeg-CREDITS.txt')]:
            assert ffmpeg.extractfile(source).read() == (ROOT / 'licenses/electron-components' / notice).read_bytes()
        for platform in ['mac', 'win']:
            config = ffmpeg.extractfile(f'chromium/config/Chrome/{platform}/x64/config.h').read().decode()
            for flag in ['GPL', 'NONFREE', 'VERSION3', 'LIBX264', 'LIBX265']:
                assert f'#define CONFIG_{flag} 0' in config
            assert '#define FFMPEG_LICENSE "LGPL version 2.1 or later"' in config
        with tempfile.TemporaryDirectory(prefix='electron-ffmpeg-patch-') as tmp:
            Path(tmp, 'BUILD.gn').write_bytes(ffmpeg.extractfile('BUILD.gn').read())
            patch = REVIEW / 'evidence/electron-ffmpeg-loader.patch'
            subprocess.run(['git', 'apply', '--check', str(patch)], cwd=tmp, check=True)

    for original, copy in [('mantle-LICENSE.md', 'Mantle-LICENSE.md'),
                            ('reactiveobjc-LICENSE.md', 'ReactiveObjC-LICENSE.md'),
                            ('squirrel-LICENSE', 'Squirrel-LICENSE.txt')]:
        assert (REVIEW / 'evidence' / original).read_bytes() == (ROOT / 'licenses/electron-components' / copy).read_bytes()
    report = {'archivesVerified': len(records), 'noticesMatch': True,
              'ffmpegConfigurationVerified': True, 'electronFfmpegPatchApplies': True,
              'completeCorrespondingSourceCertified': False,
              'remaining': ['Chromium build environment and transitive build inputs',
                            'Modified-library replacement validation',
                            'Public source delivery with the matching release',
                            'Other Windows installer components']}
    (REVIEW / 'source-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    if args.prepare_review:
        output = ROOT / 'release/electron-source-review'
        output.mkdir(parents=True, exist_ok=True)
        archive = output / 'electron-44.0.0-INCOMPLETE-source-review.tar'
        with tarfile.open(archive, 'w') as bundle:
            for record in records:
                bundle.add(ROOT / record['path'], arcname=record['path'])
            for file in ['licenses/ELECTRON-SOURCES.txt', 'THIRD_PARTY_NOTICES.md', 'package.json']:
                bundle.add(ROOT / file, arcname=file)
            for directory in ['licenses/electron-components', 'licenses/windows',
                              'docs/electron-license-review-2026-09-25']:
                bundle.add(ROOT / directory, arcname=directory)
            bundle.add(Path(__file__), arcname='scripts/verify-electron-license-materials.py')
        (output / 'SHA256SUMS.txt').write_text(f'{sha256(archive.read_bytes())}  {archive.name}\n')
        report['reviewArchive'] = str(archive.relative_to(ROOT))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
