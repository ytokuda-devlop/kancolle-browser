#!/usr/bin/env python3
"""Inventory extracted artifacts without executing them. Not a full static-link SBOM."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def kind(data):
    if data[:2] == b'MZ':
        return 'PE'
    if data[:4] in [bytes.fromhex(x) for x in ['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca']]:
        return 'Mach-O'
    if data[:4] == b'\x7fELF':
        return 'ELF'
    if data[:8] == b'!<arch>\n':
        return 'ar'
    return None


def pe(data):
    header = struct.unpack_from('<I', data, 60)[0]
    if data[header:header + 4] != b'PE\0\0':
        raise ValueError('Invalid PE header')
    machine, count = struct.unpack_from('<HH', data, header + 4)
    optional_size = struct.unpack_from('<H', data, header + 20)[0]
    optional = header + 24
    magic = struct.unpack_from('<H', data, optional)[0]
    directories = optional + (112 if magic == 0x20b else 96)
    sections = []
    code_hash = None
    for i in range(count):
        pos = optional + optional_size + i * 40
        virtual_size, address, size, raw = struct.unpack_from('<IIII', data, pos + 8)
        sections.append((address, max(size, virtual_size), raw))
        if data[pos:pos + 8].rstrip(b'\0') == b'.text':
            code_hash = sha(data[raw:raw + size])

    def offset(rva):
        for address, size, raw in sections:
            if address <= rva < address + size:
                return raw + rva - address
        raise ValueError(f'Unmapped RVA {rva}')

    def string(rva):
        start = offset(rva)
        return data[start:data.index(b'\0', start)].decode('ascii')

    imports, delayed, exports = [], [], []
    for index, width, name_position, target in [(1, 20, 12, imports), (13, 32, 4, delayed)]:
        rva, size = struct.unpack_from('<II', data, directories + index * 8)
        if not rva:
            continue
        pos = offset(rva)
        for _ in range(size // width + 1):
            row = data[pos:pos + width]
            if not any(row):
                break
            if index == 13 and not struct.unpack_from('<I', row)[0] & 1:
                raise ValueError('VA-based delay imports are unsupported')
            target.append(string(struct.unpack_from('<I', row, name_position)[0]))
            pos += width
    export_rva = struct.unpack_from('<I', data, directories)[0]
    if export_rva:
        pos = offset(export_rva)
        names_count = struct.unpack_from('<I', data, pos + 24)[0]
        names = offset(struct.unpack_from('<I', data, pos + 32)[0]) if names_count else 0
        exports = [string(struct.unpack_from('<I', data, names + 4 * i)[0]) for i in range(names_count)]
    return {'architecture': {0x8664: 'x64', 0x14c: 'x86', 0xaa64: 'arm64'}.get(machine, hex(machine)),
            'imports': sorted(set(imports)), 'delayImports': sorted(set(delayed)),
            'textSectionSha256': code_hash}, exports


MARKERS = {'Node.js': r'(?:_ZN4node|\?[^ ]*@node@@|^node_)',
           'V8': r'(?:_ZN2v8|@v8@@)', 'libuv': r'^_?uv_',
           'SQLite': r'^_?sqlite3_', 'Brotli': r'^_?Brotli',
           'zlib': r'^_?(?:inflate|deflate|zlibVersion)',
           'BoringSSL/OpenSSL API (not identity proof)': r'^_?(?:SSL_|EVP_)'}


class Credits(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.current, self.capture = [], None, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'div' and a.get('class') == 'product':
            self.current = {'title': '', 'homepage': '', 'licenseText': ''}
        if self.current is not None:
            if tag == 'span' and a.get('class') == 'title':
                self.capture = 'title'
            elif tag == 'pre':
                self.capture = 'licenseText'
            elif tag == 'a' and 'href' in a:
                self.current['homepage'] = a['href']

    def handle_data(self, data):
        if self.capture:
            self.current[self.capture] += data

    def handle_endtag(self, tag):
        if tag == 'span' and self.capture == 'title':
            self.capture = None
        if tag == 'pre' and self.capture == 'licenseText':
            text = self.current.pop('licenseText')
            self.current['licenseTextSha256'] = sha(text.encode())
            self.rows.append(self.current)
            self.current, self.capture = None, None


def inventory(directory, originals, original_code):
    binaries, links, data_files = [], [], []
    for p in sorted(directory.rglob('*')):
        rel = p.relative_to(directory).as_posix()
        if p.is_symlink():
            links.append({'path': rel, 'target': str(p.readlink())})
            continue
        if not p.is_file():
            continue
        with p.open('rb') as stream:
            magic = stream.read(8)
        format_ = kind(magic)
        if not format_ and p.suffix.lower() in ['.node', '.exe', '.dll', '.dylib', '.so', '.a', '.lib']:
            raise ValueError(f'Unrecognized native-format candidate: {rel}')
        if not format_:
            if p.suffix in ['.bin', '.dat', '.pak', '.json'] and 'node_modules' not in rel:
                data_files.append({'path': rel, 'size': p.stat().st_size, 'sha256': sha(p.read_bytes())})
            continue
        data = p.read_bytes()
        row = {'path': rel, 'format': format_, 'size': len(data), 'sha256': sha(data)}
        row['officialElectronMatches'] = originals.get(row['sha256'], [])
        symbols = []
        if format_ == 'PE':
            details, symbols = pe(data)
            row.update(details)
            row['officialElectronTextMatches'] = original_code.get(details['textSectionSha256'], [])
        elif format_ == 'Mach-O':
            row['fileDescription'] = subprocess.check_output(['file', '-b', str(p)], text=True).strip()
            # cctools interprets trailing parentheses as archive-member syntax.
            # Inspect an unchanged hard link with a neutral filename instead.
            with tempfile.TemporaryDirectory(prefix='native-inspect-') as temp:
                neutral = Path(temp) / 'binary'
                os.link(p, neutral)
                output = subprocess.check_output(['otool', '-L', str(neutral)], text=True)
                row['loadCommands'] = [line.strip() for line in output.splitlines()[1:]]
                result = subprocess.run(['nm', '-gU', str(neutral)], capture_output=True, text=True)
            row['symbolReadExitCode'] = result.returncode
            symbols = [line.split()[-1] for line in result.stdout.splitlines() if line.split()]
        row['exportedSymbolCount'] = len(symbols)
        row['symbolEvidence'] = {name: {'count': len(matches), 'examples': matches[:3]}
                                 for name, pattern in MARKERS.items()
                                 if (matches := [s for s in symbols if re.search(pattern, s)])}
        binaries.append(row)
    return {'binaries': binaries, 'symlinks': links, 'runtimeDataFiles': data_files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path, help='Extracted review directory')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    original_hashes = {}
    original_code = {}
    original_archives = []
    for platform in ['darwin', 'win32']:
        archive = next((Path.home() / 'Library/Caches/electron').glob(f'*/electron-v44.0.0-{platform}-x64.zip'))
        original_archives.append({'file': archive.name, 'sha256': sha(archive.read_bytes())})
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if name.endswith('/'):
                    continue
                with z.open(name) as f:
                    magic = f.read(8)
                if kind(magic):
                    data = z.read(name)
                    origin = {'archive': archive.name, 'path': name}
                    original_hashes.setdefault(sha(data), []).append(origin)
                    if kind(magic) == 'PE':
                        details, _ = pe(data)
                        if details['textSectionSha256']:
                            original_code.setdefault(details['textSectionSha256'], []).append(origin)
    reports = {}
    for label in ['mac', 'setup-app', 'portable-app', 'containers', 'setup', 'portable', 'uninstaller']:
        directory = args.root / label
        if not directory.is_dir():
            raise ValueError(f'Missing extracted artifact directory: {label}')
        reports[label] = inventory(directory, original_hashes, original_code)
    # Identical path/hash native payloads must occur in both Windows containers.
    def digest(rows):
        return {r['path']: r['sha256'] for r in rows['binaries']}
    if digest(reports['setup-app']) != digest(reports['portable-app']):
        raise ValueError('Windows Setup and portable native payloads differ')
    result = {'scope': 'Extracted x64 artifacts; symbols/imports are not a complete static dependency graph',
              'officialElectronArchives': original_archives, 'windowsNativePayloadsIdentical': True,
              'inventories': reports}
    (args.output / 'native-components.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    credits = Credits()
    credits.feed((ROOT / 'licenses/LICENSES.chromium.html').read_text())
    (args.output / 'chromium-notice-index.json').write_text(json.dumps({
        'sourceSha256': sha((ROOT / 'licenses/LICENSES.chromium.html').read_bytes()),
        'scope': 'Notice entries; inclusion does not prove linkage on either OS',
        'entries': credits.rows}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: len(v['binaries']) for k, v in reports.items()}))
    print(f'Indexed {len(credits.rows)} notice entries')


if __name__ == '__main__':
    main()
