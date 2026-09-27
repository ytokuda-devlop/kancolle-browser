"""Fetch pinned supplemental build inputs; never claim a complete build closure."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'third_party/electron-44.0.0'
REVIEW = ROOT / 'docs/electron-license-review-2026-09-25'
spec = importlib.util.spec_from_file_location('git_tree', ROOT / 'scripts/source-archive-git-tree.py')
sys.dont_write_bytecode = True
git_tree = importlib.util.module_from_spec(spec)
spec.loader.exec_module(git_tree)


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            time.sleep(2)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    chromium = 'https://chromium.googlesource.com/chromium/src'
    revision = '152.0.7977.54'
    resolved = json.loads(fetch(f'{chromium}/+/{revision}?format=JSON')[4:])
    revision = resolved['commit']
    print(f'Chromium commit: {revision}', flush=True)
    records = []
    inputs = [(chromium, revision, path) for path in
              ['build', 'buildtools', 'tools/generate_stubs', 'tools/clang', 'third_party/opus']]
    inputs += [('https://chromium.googlesource.com/chromium/deps/nasm',
                '525a09a813be0f75b646ee93fc2a31c27b87d722', '')]
    for repo, commit, subtree in inputs:
        name = ('chromium-' + subtree.replace('/', '-') if subtree else 'nasm') + '.tar.gz'
        url = f'{repo}/+archive/{commit}' + (f'/{subtree}' if subtree else '') + '.tar.gz'
        metadata_url = f'{repo}/+/{commit}' + (f'/{subtree}/' if subtree else '') + '?format=JSON'
        print(f'Fetching {url}', flush=True)
        metadata = json.loads(fetch(metadata_url)[4:])
        expected_tree = metadata['id'] if subtree else metadata['tree']
        data = fetch(url)
        target = DEST / name
        target.write_bytes(data)
        actual_tree = git_tree.archive_tree(target)
        if actual_tree != expected_tree:
            raise RuntimeError(f'Git tree mismatch: {name}')
        with tarfile.open(target) as archive:
            count = sum(member.isfile() for member in archive)
        records.append(dict(path=target.relative_to(ROOT).as_posix(), url=url,
                            revision=commit, subtree=subtree, tree=actual_tree,
                            metadataUrl=metadata_url, sha256=hashlib.sha256(data).hexdigest(),
                            bytes=len(data), readableFileCount=count))
        print(f'Verified {name}: {actual_tree}', flush=True)
    for name in ['.gn', 'DEPS']:
        data = base64.b64decode(fetch(f'{chromium}/+/{revision}/{name}?format=TEXT'))
        target = REVIEW / 'evidence' / ('chromium-root' + name if name.startswith('.') else 'chromium-DEPS-recheck')
        target.write_bytes(data)
    (REVIEW / 'supplemental-source-archives.json').write_text(
        json.dumps({'chromiumCommit': revision, 'completeBuildClosure': False,
                    'archives': records}, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
