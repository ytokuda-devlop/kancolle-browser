#!/usr/bin/env python3
"""Record audit-time state without inventing historical build provenance."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/release-provenance-2026-10-02'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    inputs = json.loads((ROOT / 'docs/native-inventory-2026-10-02/inputs.json').read_text())
    artifacts = []
    for item in inputs:
        path = ROOT / item['path']
        digest = sha(path.read_bytes())
        if digest != item['sha256']:
            raise ValueError('Artifact changed: ' + item['path'])
        artifacts.append({**item, 'bytes': path.stat().st_size,
                          'buildCommit': None, 'cleanCommitBuildProven': False})
    old = json.loads((ROOT / 'docs/release-candidate-review-2026-09-26/working-state.json').read_text())
    old_set = json.loads((ROOT / 'docs/release-candidate-review-2026-09-26/artifact-set.json').read_text())
    for item in artifacts:
        if item['sha256'] in json.dumps(old_set):
            item['historicalReferenceCommit'] = old['referenceCommit']
            item['historicalStateEvidence'] = 'docs/release-candidate-review-2026-09-26/working-state.json'
            item['historicalStateLimit'] = old['note']

    # Compare actual unbundled application source, not merely archive timestamps.
    mac = ROOT / inputs[0]['path']
    with tempfile.TemporaryDirectory(prefix='kancolle-provenance-') as temp:
        archive = Path(temp) / 'app.asar'
        with zipfile.ZipFile(mac) as z:
            names = [n for n in z.namelist() if n.endswith('/Contents/Resources/app.asar')]
            if len(names) != 1:
                raise ValueError('Expected one Mac ASAR')
            archive.write_bytes(z.read(names[0]))
        script = """
const a=require('@electron/asar'),c=require('node:crypto');const p=process.argv[1];
const rows=[];for(const e of a.listPackage(p)){const n=e.replace(/^\\//,'');
const s=a.statFile(p,n);if(s.files||s.link||n.startsWith('node_modules/'))continue;
rows.push({path:n,sha256:c.createHash('sha256').update(a.extractFile(p,n)).digest('hex')});}
console.log(JSON.stringify(rows));
"""
        shipped = json.loads(subprocess.check_output(['node', '-e', script, str(archive)], cwd=ROOT))
    commits = git('rev-list', '--all', '--max-count=100').decode().splitlines()
    for row in shipped:
        local = ROOT / row['path']
        row['matchesCurrentFile'] = local.is_file() and sha(local.read_bytes()) == row['sha256']
        row['matchingReachableCommits'] = []
        for commit in commits:
            result = subprocess.run(['git', 'show', commit + ':' + row['path']], cwd=ROOT, capture_output=True)
            if result.returncode == 0 and sha(result.stdout) == row['sha256']:
                row['matchingReachableCommits'].append(commit)
    (OUT / 'mac-shipped-source-comparison.json').write_text(json.dumps({
        'scope': 'Non-node_modules ASAR files compared byte-for-byte with up to 100 reachable commits. Matching files do not prove build origin or renderer source provenance.',
        'commitsExamined': commits, 'files': shipped}, ensure_ascii=False, indent=2) + '\n')

    excluded = ('docs/release-provenance-2026-10-02/',)
    names = set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0'))
    names.discard('')
    # Explicit ignored build inputs. Do not include caches, credentials or private DMGs.
    names.add('TASK.md')
    names.update(str(p.relative_to(ROOT)) for p in (ROOT / 'dist').rglob('*') if p.is_file())
    files = []
    snapshot = ROOT / 'release/provenance-2026-10-02/audit-working-files.tar.gz'
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(snapshot, 'w:gz') as tar:
        for name in sorted(names):
            p = ROOT / name
            if name.startswith(excluded) or not p.is_file() or p.is_symlink():
                continue
            data = p.read_bytes()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if p.stat().st_mode & 0o111 else 0o644
            tar.addfile(info, io.BytesIO(data))
            files.append({'path': name, 'sha256': sha(data), 'bytes': len(data)})
    patch = git('diff', '--binary', 'HEAD', '--', '.', ':!docs/release-provenance-2026-10-02')
    (OUT / 'tracked-working-tree.patch').write_bytes(patch)
    audits = []
    for folder in ['native-inventory-2026-10-02', 'ffmpeg-source-scope-2026-10-02',
                   'static-link-review-2026-10-02', 'mac-publication-2026-10-02']:
        for p in sorted((ROOT / 'docs' / folder).rglob('*')):
            if p.is_file():
                audits.append({'path': str(p.relative_to(ROOT)), 'sha256': sha(p.read_bytes())})
    report = {
        'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
        'artifacts': artifacts,
        'auditReferenceCommit': git('rev-parse', 'HEAD').decode().strip(),
        'branch': git('branch', '--show-current').decode().strip(),
        'auditWorkingTreeStatus': git('status', '--short').decode(),
        'trackedDiffSha256': sha(patch),
        'snapshot': {'path': str(snapshot.relative_to(ROOT)), 'sha256': sha(snapshot.read_bytes()),
                     'scope': 'Audit-time tracked/untracked non-ignored files plus TASK.md and dist; excludes this output directory and symlinks. Not historical build inputs.'},
        'files': files, 'auditEvidence': audits,
        'historicalBuildOriginComplete': False,
        'completeStaticLinkReview': False,
        'completeCorrespondingSource': False,
        'limits': ['Current HEAD is not assigned as the historical build commit.',
                   'Original Mac/Windows publication ZIP build logs and exact build-time dirty trees are unavailable.',
                   'No rebuild, Xcode installation, library replacement test, signing or publication performed.']}
    (OUT / 'provenance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'artifacts': len(artifacts), 'snapshotFiles': len(files), 'auditEvidence': len(audits),
                      'historicalBuildOriginComplete': False}))


if __name__ == '__main__':
    main()
