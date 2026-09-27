#!/usr/bin/env python3
"""Read-only provenance audit; does not execute installers or certify licensing."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
MATERIALS = ROOT / 'third_party/windows-installer'
EXPECTED = {
    'System.dll': '3eb38ae99653a7dbc724132ee240f6e5c4af4bfe7c01d31d23faf373f9f2eaca',
    'nsExec.dll': '5d9ceb1ce5f35aea5f9e5a0c0edeeec04dfefe0c77890c80c70e98209b58b962',
    'nsDialogs.dll': '1e40211af65923c2f4fd02ce021458a7745d28e2f383835e3015e96575632172',
    'StdUtils.dll': 'b72e9013a6204e9f01076dc38dabbf30870d44dfc66962adbf73619d4331601e',
    'nsis7z.dll': 'b393f05e8ff919ef071181050e1873c9a776e1a0ae8329aefff7007d0cadf592',
    'WinShell.dll': '9be85b986ea66a6997dde658abe82b3147ed2a1a3dcb784bb5176f41d22815a6',
    'UAC.dll': '2f7f8fc05dc4fd0d5cda501b47e4433357e887bbfed7292c028d99c73b52dc08',
}
ELEVATE = '9b1fbf0c11c520ae714af8aa9af12cfd48503eedecd7398d8992ee94d1b4dc37'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run7(tool, *args):
    return subprocess.run([str(tool), *map(str, args)], check=True,
                          capture_output=True, text=True).stdout


def text_section(path):
    data = path.read_bytes()
    offset = struct.unpack_from('<I', data, 60)[0]
    count = struct.unpack_from('<H', data, offset + 6)[0]
    optional = struct.unpack_from('<H', data, offset + 20)[0]
    for i in range(count):
        start = offset + 24 + optional + 40 * i
        if data[start:start + 8].rstrip(b'\0') == b'.text':
            size, pos = struct.unpack_from('<II', data, start + 16)
            return sha(data[pos:pos + size])
    raise RuntimeError(f'No PE .text section: {path}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--setup', required=True, type=Path)
    parser.add_argument('--portable', required=True, type=Path)
    parser.add_argument('--seven-zip', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    cache = Path.home() / 'Library/Caches/electron-builder'
    tool = args.seven_zip or next(cache.glob('7zip@*/*/bin/7zz'))
    toolset = next(cache.glob('nsis-3.0.4.1/*/Stubs/zlib-x86-unicode')).parent.parent
    manifest = json.loads((MATERIALS / 'sources.json').read_text())
    for entry in manifest:
        data = (MATERIALS / entry['file']).read_bytes()
        require(sha(data) == entry['sha256'] and len(data) == entry['size'],
                f'Changed source input: {entry["file"]}')
    for name in ['System.dll', 'nsDialogs.dll', 'nsExec.dll']:
        require(sha((toolset / 'Plugins/x86-unicode' / name).read_bytes()) == EXPECTED[name],
                f'Standard NSIS plugin mismatch: {name}')
    report = {'sourceInputs': manifest, 'licenseReviewComplete': False, 'artifacts': {}}
    with tempfile.TemporaryDirectory(prefix='windows-provenance-') as temporary:
        temp = Path(temporary)
        for archive, name in [('UAC.zip', 'UAC.dll'), ('WinShell.zip', 'WinShell.dll')]:
            with zipfile.ZipFile(MATERIALS / archive) as z:
                matches = [n for n in z.namelist() if n.endswith(name)
                           and sha(z.read(n)) == EXPECTED[name]]
                require(len(matches) == 1, f'No unique original match: {name}')
        original = temp / 'nsis7z-original'
        run7(tool, 'x', MATERIALS / 'Nsis7z_19.00.7z', '-o' + str(original), '-y')
        require(sha((original / 'Plugins/x86-unicode/nsis7z.dll').read_bytes()) ==
                EXPECTED['nsis7z.dll'], 'nsis7z original mismatch')
        for source, notice in [('nsis7z.txt', 'nsis7z-README.txt'),
                               ('License.txt', 'nsis7z-LZMA-SDK-LICENSE.txt')]:
            require((original / 'Contrib/nsis7z/DOC' / source).read_bytes() ==
                    (ROOT / 'licenses/windows' / notice).read_bytes(),
                    f'Altered original notice: {notice}')
        with zipfile.ZipFile(MATERIALS / 'UAC.zip') as z:
            require(z.read('License.txt') ==
                    (ROOT / 'licenses/windows/UAC-LICENSE.txt').read_bytes(),
                    'Altered original UAC notice')
        require(sha((MATERIALS / 'elevate-provider.exe').read_bytes()) == ELEVATE,
                'elevate provider mismatch')
        with zipfile.ZipFile(MATERIALS / 'elevate-1.0.zip') as z:
            license_name = next(n for n in z.namelist() if n.endswith('LICENSE.md'))
            require(z.read(license_name) ==
                    (ROOT / 'licenses/windows/elevate-upstream-LICENSE.md').read_bytes(),
                    'Altered original elevate notice')
            report['elevateAuthorBinaryHashes'] = {
                n: sha(z.read(n)) for n in z.namelist() if n.lower().endswith('.exe')}
            require(ELEVATE not in report['elevateAuthorBinaryHashes'].values(),
                    'Reassess elevate correspondence')

        def audit(label, artifact, names):
            listing = run7(tool, 'l', '-slt', artifact)
            require('Type = Nsis' in listing and 'Method = Deflate' in listing,
                    f'Unexpected NSIS compression: {label}')
            destination = temp / label
            run7(tool, 'x', artifact, '-o' + str(destination), '-y')
            plugins = {p.name: sha(p.read_bytes())
                       for p in (destination / '$PLUGINSDIR').glob('*.dll')}
            require(plugins == {n: EXPECTED[n] for n in names},
                    f'Unexpected plugin inventory: {label}: {plugins}')
            section = text_section(artifact)
            require(section == text_section(toolset / 'Stubs/zlib-x86-unicode'),
                    f'Changed NSIS executable code: {label}')
            report['artifacts'][label] = {
                'file': artifact.name, 'sha256': sha(artifact.read_bytes()),
                'compression': 'Deflate', 'plugins': plugins,
                'stubTextMatchesToolsetZlib': True, 'stubTextSha256': section}
            return destination

        setup = audit('setup', args.setup, EXPECTED)
        uninstallers = list(setup.rglob('Uninstall*.exe'))
        require(len(uninstallers) == 1, 'Expected exactly one uninstaller')
        audit('uninstaller', uninstallers[0], set(EXPECTED) - {'nsis7z.dll'})
        portable = audit('portable', args.portable, {'System.dll', 'StdUtils.dll', 'nsis7z.dll'})
        for label, destination in [('setup', setup), ('portable', portable)]:
            archives = list(destination.rglob('app-*.7z'))
            require(len(archives) == 1, f'Expected x64-only application: {label}')
            app = temp / (label + '-app')
            run7(tool, 'x', archives[0], '-o' + str(app), '-y')
            helpers = list(app.rglob('elevate.exe'))
            require(len(helpers) == 1 and sha(helpers[0].read_bytes()) == ELEVATE,
                    f'elevate mismatch: {label}')
            report['artifacts'][label]['elevateSha256'] = ELEVATE
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'Provenance verified; license review remains open. Report: {args.output}')


if __name__ == '__main__':
    main()
