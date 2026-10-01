#!/usr/bin/env python3
"""Verify pinned runtime sources and literal GN inputs, not final linkage."""
import hashlib
import json
from pathlib import Path
import re
import tarfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/static-link-review-2026-10-02'


def main():
    plan = json.loads((OUT / 'inputs.json').read_text())
    rows = []
    for item in plan:
        archive = ROOT / item['path']
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        if digest != item['sha256']:
            raise ValueError('Archive hash changed: ' + item['path'])
        with tarfile.open(archive) as tar:
            members = {m.name: m for m in tar.getmembers() if m.isfile()}
            files = []
            for name, member in sorted(members.items()):
                data = tar.extractfile(member).read()
                files.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
            license_data = tar.extractfile(members['LICENSE.TXT']).read()
            (OUT / 'evidence' / (item['component'] + '-LICENSE.TXT')).write_bytes(license_data)
            refs = []
            if item.get('gnEvidence'):
                source = (ROOT / item['gnEvidence']).read_text()
                refs = sorted(set(re.findall('"' + re.escape(item['gnPrefix']) + '([^"$]+)"', source)))
                directories = {m.name.rstrip('/') for m in tar.getmembers() if m.isdir()}
                refs = [name for name in refs if name not in directories]
                missing = [name for name in refs if name not in members]
                if missing:
                    raise ValueError('GN literal source missing: ' + repr(missing))
            if item['component'] == 'compiler-rt-clang':
                assert 'lib/builtins/CMakeLists.txt' in members
                assert any(n.startswith('lib/builtins/x86_64/') for n in members)
            (OUT / (item['component'] + '-files.json')).write_text(json.dumps(files, indent=2) + '\n')
            rows.append({**item, 'regularFiles': len(files), 'literalGnInputsPresent': refs,
                         'licenseSha256': hashlib.sha256(license_data).hexdigest(),
                         'finalLinkedObjectsConfirmed': False})
    (OUT / 'runtime-inputs.json').write_text(json.dumps({
        'scope': 'Source archives and literal GN source references only; references include conditional branches, not evaluated final target input lists.',
        'inputs': rows, 'completeCorrespondingSource': False,
        'toolchainBinaryToSourceVerified': False}, indent=2) + '\n')
    print(json.dumps({'archives': len(rows), 'regularFiles': sum(r['regularFiles'] for r in rows),
                      'literalGnInputs': sum(len(r['literalGnInputsPresent']) for r in rows)}))


if __name__ == '__main__':
    main()
