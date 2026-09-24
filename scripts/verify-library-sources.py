#!/usr/bin/env python3
"""Audit retained source candidates; optionally restore exact recorded archives.

No source is executed or extracted. A successful audit does not establish binary
correspondence. Downloads use curl and must match the existing SHA-256 record.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'licenses/ffmpeg/win32-x64'
DEST = ROOT / 'third_party/ffmpeg/win32-x64/libraries'


def audit(record, restore):
    result = {'name': record['name'], 'sourceRecordStatus': record['status']}
    if record['status'] != 'upstream-candidate-acquired':
        return dict(result, status='unresolved', error=record.get('error'))
    try:
        archive = (ROOT / record['archive']).resolve()
        if archive.parent != DEST.resolve():
            raise ValueError('Archive must be inside the library source directory')
        if not archive.exists() and restore:
            if not record['url'].startswith('https://'):
                raise ValueError('Only HTTPS source URLs are supported')
            with tempfile.NamedTemporaryFile(dir=DEST, suffix='.download') as temp:
                subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                                '--proto', '=https', '--proto-redir', '=https',
                                '--connect-timeout', '20', '--max-time', '180',
                                record['url'], '-o', temp.name], check=True,
                               capture_output=True)
                data = Path(temp.name).read_bytes()
                if hashlib.sha256(data).hexdigest() != record['sha256']:
                    raise ValueError('Downloaded SHA-256 mismatch; archive not installed')
                # Exclusive creation prevents replacing an existing archive.
                with archive.open('xb') as output:
                    output.write(data)
        if not archive.exists():
            return dict(result, status='missing', archive=record['archive'])
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        if digest != record['sha256']:
            raise ValueError('Retained SHA-256 mismatch; archive not changed')
        with tarfile.open(archive, 'r:*') as tar:
            members = tar.getmembers()
            if len(members) != record['archiveEntryCount']:
                raise ValueError('Archive entry count mismatch')
            for member in members:
                if member.isfile():
                    with tar.extractfile(member) as stream:
                        while stream.read(1024 * 1024):
                            pass
            if not record['licenseEntries']:
                raise ValueError('No recorded license entries')
            for name in record['licenseEntries']:
                if not tar.getmember(name).isfile():
                    raise ValueError(f'License is not a regular file: {name}')
        return dict(result, status='verified', archive=record['archive'],
                    sha256=digest, archiveEntries=len(members),
                    licenseEntries=record['licenseEntries'])
    except (OSError, ValueError, KeyError, tarfile.TarError,
            subprocess.CalledProcessError) as error:
        detail = error.stderr.decode(errors='replace').strip() if isinstance(
            error, subprocess.CalledProcessError) else str(error)
        return dict(result, status='error', error=detail)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--restore', action='store_true', help='Download missing archives')
    parser.add_argument('--names', nargs='+', help='Audit only these recorded component names')
    parser.add_argument('--report', type=Path, help='Save current local verification results')
    args = parser.parse_args()
    records = [json.loads(p.read_text(encoding='utf-8-sig'))
               for p in sorted((BASE / 'library-sources').glob('*.json'))]
    if args.names:
        unknown = set(args.names) - {r['name'] for r in records}
        if unknown:
            parser.error(f'Unknown components: {sorted(unknown)}')
        records = [r for r in records if r['name'] in args.names]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda record: audit(record, args.restore), records))
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(),
              'scope': 'Windows x64 upstream source candidate archive integrity only',
              'binaryExecuted': False, 'completeCorrespondingSource': False,
              'results': results}
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    for result in results:
        print(f"{result['name']}: {result['status']}" +
              (f" — {result['error']}" if result.get('error') else ''))
    # Unresolved records also fail the all-candidates verification gate.
    return 0 if all(r['status'] == 'verified' for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
