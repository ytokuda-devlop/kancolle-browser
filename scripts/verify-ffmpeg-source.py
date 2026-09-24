#!/usr/bin/env python3
"""Verify the retained Windows FFmpeg core source and provenance, offline."""
import hashlib
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parent.parent
RECORDS = ROOT / 'licenses/ffmpeg/win32-x64'


def read_json(name):
    return json.loads((RECORDS / name).read_text(encoding='utf-8-sig'))


def require(condition, message):
    if not condition:
        raise SystemExit(message)


source = read_json('sources.json')['ffmpeg']
capture = read_json('capture.json')
commit = read_json('ffmpeg-commit.json')
readme = (RECORDS / 'upstream.README').read_text()
archive = ROOT / source['localArchive']
require(hashlib.sha256(archive.read_bytes()).hexdigest() == source['sha256'],
        'Source archive SHA-256 mismatch')
require(source['commit'] == commit['sha'], 'Source commit mismatch')
require(f"/commit/{source['commit'][:10]}" in readme, 'Provider commit mismatch')
require(f"Version: {source['binaryVersion']}" in readme, 'Provider version mismatch')
run = next(r for r in capture['runs'] if r['arg'] == '-version')
require(run['status'] == 0 and run['stdout'].split()[2] == source['binaryVersion'],
        'Captured binary version mismatch')
require(capture['sha256'] == capture['upstream']['decompressedSha256']
        == capture['installedSha256'], 'Recorded binary hashes disagree')

with tarfile.open(archive, 'r:gz') as tar:
    members = tar.getmembers()
    prefix = f"FFmpeg-{source['commit'][:10]}/"
    require(all(m.name == prefix.rstrip('/') or m.name.startswith(prefix)
                for m in members), 'Unexpected archive root')
    # Read every regular file to detect truncated/corrupt retained content.
    for member in members:
        if member.isfile():
            with tar.extractfile(member) as stream:
                while stream.read(1024 * 1024):
                    pass
    for name in source['verification']['archiveRequiredEntries']:
        require(tar.getmember(prefix + name).isfile(), f'Missing source file: {name}')
    release = tar.extractfile(prefix + 'RELEASE').read().decode().strip()
    require(release == source['sourceRelease'], 'Source RELEASE mismatch')

binary = ROOT / capture['binary']
binary_status = 'not-present; historical capture only'
if binary.is_file():
    require(hashlib.sha256(binary.read_bytes()).hexdigest() == capture['sha256'],
            'Local binary SHA-256 mismatch')
    binary_status = 'local binary SHA-256 matched historical capture'

print(json.dumps({
    'scope': 'Windows x64 FFmpeg core upstream source only',
    'binaryVersion': source['binaryVersion'],
    'binarySha256': capture['sha256'],
    'binaryVerification': binary_status,
    'commit': source['commit'],
    'sourceRelease': release,
    'archive': source['localArchive'],
    'archiveSha256': source['sha256'],
    'archiveEntries': len(members),
    'sourceArchiveVerified': True,
    'completeCorrespondingSource': False,
    'limitations': 'Provider patches, dependencies and build materials remain unverified.',
}, ensure_ascii=False, indent=2))
