#!/usr/bin/env python3
"""Prepare the user-selected Mac ZIP and companion materials; never publish."""
import hashlib
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / 'docs/mac-publication-2026-10-02'
OUTPUT = ROOT / 'release/mac-publication-2026-10-02'
ZIP = ROOT / 'release/kancolle-browser_1.0.0_mac.zip'
SOURCE = ROOT / 'release/source-delivery-2026-09-27/upload/electron-44.0.0-source-materials-2026-09-27.tar.gz'
ZIP_SHA = '9e7179f3f7309d5ac931e42b10e294d3bfb910cbe704181ee1a51e616c8007c3'
SOURCE_SHA = 'fc497d1313aed57ee32c52e122a49daeb3322f55b3906386111e0067f9cee360'
FFMPEG_SHA = '0ea472e75cdf7fb5b2786bf1c5d84fa81b1638199cc01008db58de2616a764c1'


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    require(digest(ZIP) == ZIP_SHA, 'Selected ZIP changed; review and pin the new artifact first')
    require(digest(SOURCE) == SOURCE_SHA, 'Source-material bundle differs from reviewed bundle')
    subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-electron-source-delivery.py'),
                    '--verify', str(SOURCE)], check=True)
    package = json.loads((ROOT / 'package.json').read_text())
    require(package['build']['mac']['target'] == [{'target': 'zip', 'arch': ['x64']}],
            'Expected ZIP-only macOS build configuration')
    expected = {'LICENSE', 'THIRD_PARTY_NOTICES.md'}
    expected.update(next(x['filter'] for x in package['build']['extraResources'] if x['from'] == 'licenses'))
    notices, differences = [], []
    with zipfile.ZipFile(ZIP) as archive:
        prefix = 'KancolleBrowser.app/Contents/Resources/licenses/'
        paths = [n for n in archive.namelist() if n.startswith(prefix) and not n.endswith('/')]
        require(len(paths) == len(set(paths)), 'Duplicate license members')
        require({n[len(prefix):] for n in paths} == expected, 'License member set changed')
        for name in sorted(paths):
            relative = name[len(prefix):]
            original = ROOT / (relative if relative in {'LICENSE', 'THIRD_PARTY_NOTICES.md'} else 'licenses/' + relative)
            data = archive.read(name)
            matches = data == original.read_bytes()
            notices.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest(), 'matchesCurrentSource': matches})
            if not matches:
                differences.append(relative)
        require(differences == ['ELECTRON-SOURCES.txt'], 'Unexpected notice changes; review before preparing')
        prior = 'KancolleBrowser.app/Contents/Frameworks/Electron Framework.framework/Versions/A/'
        electron = plistlib.loads(archive.read(prior + 'Resources/Info.plist'))['CFBundleVersion']
        app = plistlib.loads(archive.read('KancolleBrowser.app/Contents/Info.plist'))['CFBundleShortVersionString']
        ffmpeg = hashlib.sha256(archive.read(prior + 'Libraries/libffmpeg.dylib')).hexdigest()
        require((app, electron, ffmpeg) == ('1.0.0', '44.0.0', FFMPEG_SHA), 'Binary/source identity changed')
    report = {
        'policyDate': '2026-10-02', 'platform': 'macOS x64', 'dmgPublic': False,
        'zip': {'name': ZIP.name, 'sha256': ZIP_SHA, 'bytes': ZIP.stat().st_size},
        'appVersion': app, 'electronVersion': electron, 'ffmpegSha256': ffmpeg,
        'sourceMaterials': {'name': SOURCE.name, 'sha256': SOURCE_SHA, 'bytes': SOURCE.stat().st_size,
                            'completeCorrespondingSource': False},
        'licenses': notices, 'packagedNoticesMatchCurrentSource': False,
        'noticeCompanion': {'name': 'ELECTRON-SOURCES.txt', 'sha256': digest(ROOT / 'licenses/ELECTRON-SOURCES.txt'),
                           'reason': 'Selected ZIP lacks the 2026-09-27 source-investigation addendum'},
        'macRebuildAndModifiedLibraryTest': 'skipped by user instruction',
        'windows': 'user reports verified; supporting build/source records not cross-checked',
        'publication': 'prepared for manual upload by user; public download not verified',
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    files = [ZIP, SOURCE, ROOT / 'licenses/ELECTRON-SOURCES.txt', DOC / 'RELEASE-NOTES.md']
    allowed = {p.name for p in files} | {'publication.json', 'SHA256SUMS.txt'}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    require(set(p.name for p in OUTPUT.iterdir()) <= allowed, 'Unexpected files in publication directory')
    for source in files:
        destination = OUTPUT / source.name
        shutil.copyfile(source, destination)
        require(digest(source) == digest(destination), f'Copy verification failed: {source.name}')
    require(digest(OUTPUT / ZIP.name) == ZIP_SHA and digest(OUTPUT / SOURCE.name) == SOURCE_SHA,
            'Pinned input changed during preparation')
    (DOC / 'publication.json').write_text(encoded)
    (OUTPUT / 'publication.json').write_text(encoded)
    names = sorted(allowed - {'SHA256SUMS.txt'})
    (OUTPUT / 'SHA256SUMS.txt').write_text(''.join(f'{digest(OUTPUT / name)}  {name}\n' for name in names))
    print(f'Prepared {len(allowed)} files in {OUTPUT.relative_to(ROOT)}; DMG excluded; not published')


if __name__ == '__main__':
    main()
