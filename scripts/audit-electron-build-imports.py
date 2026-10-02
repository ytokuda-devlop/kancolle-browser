#!/usr/bin/env python3
"""Conservative GN literal-import audit. Does not evaluate GN or prove closure."""
import json
from pathlib import Path
import posixpath
import re
import tarfile

ROOT = Path(__file__).resolve().parent.parent
ARCHIVES = [
    ('ffmpeg-2b68d2babae7.tar.gz', 'third_party/ffmpeg/'),
    ('chromium-build-24072c1aa400.tar.gz', 'build/'),
    ('chromium-opus-24072c1aa400.tar.gz', 'third_party/opus/'),
    ('nasm-525a09a813be0.tar.gz', 'third_party/nasm/'),
    ('chromium-generate-stubs-24072c1aa400.tar.gz', 'tools/generate_stubs/'),
]


def main():
    files = {}
    for name, prefix in ARCHIVES:
        with tarfile.open(ROOT / 'third_party/electron-44.0.0' / name) as source:
            for member in source:
                if member.isfile() and member.name.endswith(('.gn', '.gni')):
                    files[prefix + member.name.removeprefix('./')] = source.extractfile(member).read().decode()
    roots = ['third_party/ffmpeg/BUILD.gn', 'third_party/opus/BUILD.gn']
    queue, seen, missing, dynamic = list(roots), set(), set(), []
    while queue:
        name = queue.pop()
        if name in seen:
            continue
        seen.add(name)
        if name not in files:
            missing.add(name)
            continue
        content = re.sub(r'(?m)#.*$', '', files[name])
        for imported in re.findall(r'import\("([^"]+)"\)', content):
            if '$' in imported:
                dynamic.append({'from': name, 'import': imported})
            else:
                queue.append(imported[2:] if imported.startswith('//') else
                             posixpath.normpath(posixpath.join(posixpath.dirname(name), imported)))
    report = {
        'method': 'Conservative literal import traversal only; GN conditions and targets NOT evaluated',
        'startingFiles': roots, 'availableGnFiles': len(files),
        'visitedLiteralImports': len(seen), 'missingLiteralImports': sorted(missing),
        'dynamicImportsNotEvaluated': dynamic, 'completeTransitiveBuildGraph': False,
    }
    output = ROOT / 'docs/source-delivery-2026-09-27/evidence/literal-import-audit.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
