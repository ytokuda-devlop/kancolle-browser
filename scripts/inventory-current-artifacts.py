#!/usr/bin/env python3
"""Inventory pinned artifacts independently; do not assume their payloads match.

Reuses the native and ASAR scanners. Windows installers are extracted, never run.
The Mac executable is run only in Electron's Node mode to read process.versions.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/native-inventory-2026-10-02'


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


native = module('native_inventory', 'inventory-native-components.py')
windows = module('windows_materials', 'verify-windows-installer-materials.py')


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True, text=True, **kwargs).stdout


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    inputs = json.loads((OUT / 'inputs.json').read_text())
    previous = json.loads((ROOT / 'docs/native-inventory-2026-09-26/evidence/native-components.json').read_text())
    originals, codes, official = {}, {}, []
    for record in previous['officialElectronArchives']:
        archive = next((Path.home() / 'Library/Caches/electron').glob('*/' + record['file']))
        if native.sha(archive.read_bytes()) != record['sha256']:
            raise ValueError('Official Electron cache changed')
        official.append(record)
        with zipfile.ZipFile(archive) as source:
            for name in source.namelist():
                if name.endswith('/'):
                    continue
                with source.open(name) as stream:
                    magic = stream.read(8)
                if native.kind(magic):
                    data = source.read(name)
                    provenance = {'archive': archive.name, 'path': name}
                    originals.setdefault(native.sha(data), []).append(provenance)
                    if native.kind(magic) == 'PE':
                        details, _ = native.pe(data)
                        codes.setdefault(details['textSectionSha256'], []).append(provenance)
    seven = next((Path.home() / 'Library/Caches/electron-builder').glob('7zip@*/*/bin/7zz'))
    known_plugins = {h: name for name, h in windows.EXPECTED.items()}
    known_plugins[windows.ELEVATE] = 'elevate.exe'

    def inventory(directory):
        result = native.inventory(directory, originals, codes)
        for row in result['binaries']:
            if row['sha256'] in known_plugins:
                row['previousWindowsProvenanceMatch'] = known_plugins[row['sha256']]
        return result

    def unpack(artifact, destination):
        run([seven, 'x', artifact, '-y', '-o' + str(destination)])

    reports = []
    for item in inputs:
        artifact = ROOT / item['path']
        if native.sha(artifact.read_bytes()) != item['sha256']:
            raise ValueError(f'Pinned artifact changed: {item["id"]}')
        with tempfile.TemporaryDirectory(prefix='kancolle-current-inventory-') as temporary:
            temp = Path(temporary)
            report = {'input': item, 'officialElectronArchives': official}
            if item['id'] == 'mac-publication':
                unpacked = temp / 'mac'
                run(['/usr/bin/ditto', '-x', '-k', artifact, unpacked])
                apps = list(unpacked.glob('*.app'))
                if len(apps) != 1:
                    raise ValueError('Expected one Mac application')
                app = apps[0]
                resources = app / 'Contents/Resources'
                report['app'] = inventory(unpacked)
                versions = run([app / 'Contents/MacOS/KancolleBrowser', '-e',
                                'console.log(JSON.stringify({versions:process.versions,arch:process.arch,platform:process.platform}))'],
                               env={**os.environ, 'ELECTRON_RUN_AS_NODE': '1'}, timeout=30)
                report['runtimeVersionMetadata'] = json.loads(versions)
                report['runtimeScope'] = 'Node-mode metadata only; not GUI, recording or replacement testing'
            else:
                if artifact.suffix == '.zip':
                    unpack(artifact, temp / 'zip')
                    executables = list((temp / 'zip').glob('*.exe'))
                    if len(executables) != 1:
                        raise ValueError('Expected exactly one executable in Windows ZIP')
                    executable = executables[0]
                else:
                    executable = artifact
                container = temp / 'container'
                container.mkdir()
                shutil.copyfile(executable, container / executable.name)
                report['containerExecutable'] = inventory(container)
                outer = temp / 'outer'
                unpack(executable, outer)
                report['containerContents'] = inventory(outer)
                uninstallers = list(outer.rglob('Uninstall*.exe'))
                if len(uninstallers) > 1:
                    raise ValueError('Ambiguous uninstaller')
                if uninstallers:
                    unpack(uninstallers[0], temp / 'uninstaller')
                    report['uninstallerContents'] = inventory(temp / 'uninstaller')
                payloads = list(outer.rglob('app-*.7z'))
                if len(payloads) != 1:
                    raise ValueError('Expected one Windows app payload')
                app = temp / 'app'
                unpack(payloads[0], app)
                resources = app / 'resources'
                report['app'] = inventory(app)
                report['runtimeScope'] = 'Windows code not executed; user previously reported verification'
            npm_report = temp / 'npm.json'
            run(['node', ROOT / 'scripts/inventory-asar-packages.cjs', resources / 'app.asar', npm_report])
            report['npm'] = json.loads(npm_report.read_text())
            report['coverage'] = 'All app files scanned by magic; symlinks separate; runtime data separate. Static linkage not fully certified.'
            if native.sha(artifact.read_bytes()) != item['sha256']:
                raise ValueError('Artifact changed during inspection')
            (OUT / (item['id'] + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            reports.append(report)
            print(json.dumps({'artifact': item['id'], 'native': len(report['app']['binaries']),
                              'npm': len(report['npm']['packages']), 'nativeInAsar': len(report['npm']['nativeEntries'])}), flush=True)
    summary = []
    for report in reports:
        summary.append({'id': report['input']['id'], 'sha256': report['input']['sha256'],
                        'nativeFiles': len(report['app']['binaries']),
                        'npm': [{k: p[k] for k in ['name', 'version', 'license']} for p in report['npm']['packages']],
                        'nativeInAsar': len(report['npm']['nativeEntries']),
                        'filesScannedInAsar': report['npm']['filesScanned']})
    comparison = []
    windows_reports = [r for r in reports if r['input']['id'].startswith('windows-')]
    reference = windows_reports[0]
    by_path = {r['path']: r for r in reference['app']['binaries']}
    for report in windows_reports[1:]:
        current = {r['path']: r for r in report['app']['binaries']}
        shared = sorted(by_path.keys() & current.keys())
        comparison.append({'reference': reference['input']['id'], 'compared': report['input']['id'],
                           'added': sorted(current.keys() - by_path.keys()),
                           'removed': sorted(by_path.keys() - current.keys()),
                           'changedNativeFiles': [p for p in shared if current[p]['sha256'] != by_path[p]['sha256']],
                           'npmSetsMatch': report['npm']['packages'] == reference['npm']['packages'],
                           'asarBytesMatch': report['npm']['asarSha256'] == reference['npm']['asarSha256']})
    (OUT / 'summary.json').write_text(json.dumps({'artifacts': summary, 'windowsComparisons': comparison},
                                               ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
