#!/usr/bin/env python3
"""Audit the pinned Mac FFmpeg source scope without building or executing GN.

Only the simple syntax in ffmpeg_generated.gni is evaluated. Unknown syntax or
variables fail closed. This is a source-list audit, not a GN/linker substitute.
"""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/ffmpeg-source-scope-2026-10-02'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def expression(text, env):
    tree = ast.parse(text.replace('&&', ' and ').replace('||', ' or ').strip(), mode='eval')

    def visit(node):
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, bool)):
            return node.value
        if isinstance(node, ast.Name):
            return env[node.id]  # Undefined build variables must fail.
        if isinstance(node, ast.BoolOp):
            values = [visit(n) for n in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            a, b = visit(node.left), visit(node.comparators[0])
            if isinstance(node.ops[0], ast.Eq):
                return a == b
            if isinstance(node.ops[0], ast.NotEq):
                return a != b
        raise ValueError(f'Unsupported expression: {ast.dump(node)}')

    return visit(tree)


def source_lists(text, platform):
    if platform not in ('mac', 'win'):
        raise ValueError('Unsupported platform')
    env = {k: False for k in ['is_linux', 'is_chromeos', 'is_fuchsia', 'is_android']}
    env.update(current_cpu='x64', ffmpeg_branding='Chrome', is_apple=platform == 'mac', is_win=platform == 'win')
    # This pinned file has no '#' inside quoted paths; reject rather than guess.
    if re.search(r'"[^"\n]*#[^"\n]*"', text):
        raise ValueError('Unsupported # in quoted string')
    text = re.sub(r'#[^\n]*', '', text)
    active, pos = [True], 0
    while pos < len(text):
        space = re.match(r'\s+', text[pos:])
        if space:
            pos += space.end()
            continue
        rest = text[pos:]
        match = re.match(r'import\("([^"\n]+)"\)', rest)
        if match:
            if match[1] not in ('//build/config/arm.gni', 'ffmpeg_options.gni'):
                raise ValueError('New import must be reviewed')
        elif (match := re.match(r'if\s*\((.*?)\)\s*\{', rest, re.S)):
            condition = expression(' '.join(match[1].split()), env)
            active.append(active[-1] and condition)
        elif rest.startswith('}'):
            if len(active) == 1:
                raise ValueError('Unbalanced scope')
            active.pop()
            pos += 1
            continue
        elif (match := re.match(r'(\w+)\s*(\+=|=)\s*\[(.*?)\]', rest, re.S)):
            values = ast.literal_eval('[' + match[3] + ']')
            if not all(isinstance(v, str) for v in values):
                raise ValueError('Non-literal source array')
            if active[-1]:
                if match[2] == '=':
                    env[match[1]] = values
                else:
                    env[match[1]] += values
        elif (match := re.match(r'(use_linux_config)\s*=([^\n]+)', rest)):
            if active[-1]:
                env[match[1]] = expression(match[2], env)
        else:
            raise ValueError(f'Unsupported GN syntax at {rest[:100]!r}')
        pos += match.end()
    if len(active) != 1:
        raise ValueError('Unbalanced scope')
    return {k: v for k, v in env.items() if isinstance(v, list)}


class Archive:
    def __init__(self, record):
        self.record = record
        self.path = ROOT / record['path']
        if sha(self.path.read_bytes()) != record['sha256']:
            raise ValueError(f'Changed archive: {self.path}')
        self.tar = tarfile.open(self.path)
        self.names = set(self.tar.getnames())

    def read(self, name):
        return self.tar.extractfile(name).read()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = json.loads((ROOT / 'docs/electron-license-review-2026-09-25/source-archives.json').read_text())
    records += json.loads((ROOT / 'docs/source-delivery-2026-09-27/build-materials.json').read_text())
    archives = {}
    for key, prefix in [('ffmpeg', 'ffmpeg-'), ('electron', 'electron-'),
                        ('build', 'chromium-build-'), ('opus', 'chromium-opus-'), ('nasm', 'nasm-')]:
        record = next(r for r in records if Path(r['path']).name.startswith(prefix))
        archives[key] = Archive(record)
    ffmpeg, electron, build, opus = [archives[k] for k in ['ffmpeg', 'electron', 'build', 'opus']]
    ep = next(n.split('/')[0] + '/' for n in electron.names if n.endswith('/patches/config.json'))
    selected = source_lists(ffmpeg.read('ffmpeg_generated.gni').decode(), 'mac')
    inventory = []
    for category in ['ffmpeg_c_sources', 'ffmpeg_gas_sources', 'ffmpeg_asm_sources', 'ffmpeg_c_deps', 'ffmpeg_asm_deps']:
        for name in selected[category]:
            data = ffmpeg.read(name)  # Missing or non-file members must fail.
            inventory.append({'category': category, 'path': name, 'sha256': sha(data)})
    config = ffmpeg.read('chromium/config/Chrome/mac/x64/config.h').decode()
    macros = dict(re.findall(r'^#define (CONFIG_\w+) ([01])$', config, re.M))
    enabled_libraries = sorted(k for k, v in macros.items() if k.startswith('CONFIG_LIB') and v == '1')
    if enabled_libraries != ['CONFIG_LIBOPUS']:
        raise ValueError(f'Additional external libraries: {enabled_libraries}')
    config_files = [n for n in ffmpeg.names if n.startswith('chromium/config/Chrome/mac/x64/') and ffmpeg.tar.getmember(n).isfile()]
    for name in sorted(config_files):
        inventory.append({'category': 'mac_configuration', 'path': name, 'sha256': sha(ffmpeg.read(name))})

    # Apply all active Chromium build/* patches in upstream order to a scratch
    # copy of exactly their input files. FFmpeg is a separate patched repository.
    patches = []
    for group in ['chromium', 'ffmpeg']:
        patch_dir = ep + f'patches/{group}/'
        order = electron.read(patch_dir + '.patches').decode().splitlines()
        with tempfile.TemporaryDirectory(prefix='kancolle-source-scope-') as temporary:
            work = Path(temporary)
            loaded = set()
            for name in order:
                if not name.strip() or name.startswith('#'):
                    continue
                data = electron.read(patch_dir + name)
                targets = re.findall(r'^\+\+\+ b/(.+)$', data.decode(), re.M)
                if group == 'chromium' and not any(p.startswith('build/') for p in targets):
                    continue
                row = {'repository': group, 'patch': f'patches/{group}/{name}',
                       'sha256': sha(data), 'targets': targets, 'includedInElectronArchive': True}
                available = group == 'ffmpeg' or all(p.startswith('build/') and p[6:] in build.names for p in targets)
                row['applyCheck'] = 'not checked: includes inputs outside saved build subtree'
                if available:
                    for target in targets:
                        if Path(target).is_absolute() or '..' in Path(target).parts:
                            raise ValueError('Unsafe patch target')
                        if target not in loaded:
                            p = work / target
                            p.parent.mkdir(parents=True, exist_ok=True)
                            p.write_bytes(ffmpeg.read(target) if group == 'ffmpeg' else build.read(target[6:]))
                            loaded.add(target)
                    subprocess.run(['git', 'apply', '--check', '-'], input=data, cwd=work, check=True, capture_output=True)
                    subprocess.run(['git', 'apply', '-'], input=data, cwd=work, check=True, capture_output=True)
                    row['applyCheck'] = 'passed in upstream order'
                    row['resultSha256'] = {p: sha((work / p).read_bytes()) for p in targets}
                patches.append(row)

    # Bind the source audit to the exact user-selected ZIP; no replacement here.
    binary = ROOT / 'release/kancolle-browser_1.0.0_mac.zip'
    if sha(binary.read_bytes()) != '9e7179f3f7309d5ac931e42b10e294d3bfb910cbe704181ee1a51e616c8007c3':
        raise ValueError('Selected publication ZIP changed')
    with zipfile.ZipFile(binary) as package:
        path = 'KancolleBrowser.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib'
        dylib = package.read(path)
    if sha(dylib) != '0ea472e75cdf7fb5b2786bf1c5d84fa81b1638199cc01008db58de2616a764c1':
        raise ValueError('FFmpeg identity changed')
    with tempfile.TemporaryDirectory(prefix='kancolle-ffmpeg-loads-') as temporary:
        p = Path(temporary) / 'libffmpeg.dylib'
        p.write_bytes(dylib)
        raw = subprocess.check_output(['otool', '-L', str(p)], text=True)
        loads = [line.strip() for line in raw.splitlines()[1:]]
    deps = (ROOT / 'docs/source-delivery-2026-09-27/evidence/chromium/DEPS').read_text()
    runtime_revisions = {k: re.search(r"'" + k + r"':\s*'([^']+)'", deps)[1]
                         for k in ['libcxx_revision', 'libcxxabi_revision', 'compiler_rt_revision', 'llvm_libc_revision']}
    extra = json.loads((OUT / 'additional-evidence.json').read_text())
    for record in extra:
        if sha((OUT / record['path']).read_bytes()) != record['sha256']:
            raise ValueError(f'Changed GN evidence: {record["path"]}')
    llvm = json.loads((OUT / 'llvm-commit.json').read_text())
    if not llvm['sha'].startswith('53d18800'):
        raise ValueError('Clang source revision resolution changed')
    profile = electron.read(ep + 'build/pgo_profiles/macos-x64.pgo.txt').decode().strip()
    report = {
        'scope': 'Source-defined Mac x64 Chrome FFmpeg input scope; not an executed GN/link graph',
        'zipSha256': sha(binary.read_bytes()), 'ffmpegSha256': sha(dylib),
        'archivesVerified': [a.record for a in archives.values()],
        'sourceListAssumptions': {'current_cpu': 'x64', 'ffmpeg_branding': 'Chrome', 'is_apple': True,
                                  'otherPlatforms': False},
        'selectedLists': {k: len(v) for k, v in selected.items()},
        'macConfigurationFiles': len(config_files), 'enabledExternalLibraryFlags': enabled_libraries,
        'directTargetEdges': ['ffmpeg -> ffmpeg_internal', 'ffmpeg_internal -> ffmpeg_features',
                              'ffmpeg_internal -> opus', 'ffmpeg_internal -> ffmpeg_nasm',
                              'opus -> opus_sse41 / opus_avx2 (x64)'],
        'implicitBuildInputs': ['build/config:shared_library_deps -> common_deps -> libc++ (default)',
                               'libc++ -> libc++abi (Mac default) and llvm-libc-shared (header configuration group)',
                               'compiler:runtime_library -> clang:compiler_builtins (libname=osx)',
                               'compiler PGO/ThinLTO configuration and Electron build patches'],
        'runtimeSourceRevisionsFromDeps': runtime_revisions,
        'clangSourceCommit': llvm['sha'], 'additionalEvidence': extra,
        'macDefaultExcludedEdges': ['use_llvm_libatomic = !is_apple -> false',
                                   'use_custom_libunwind = is_fuchsia || is_android -> false'],
        'compilerRtNote': 'DEPS compiler-rt revision is not proof of the Clang package builtins source revision',
        'macPgoState': profile, 'dynamicLoadsIncludingInstallName': loads,
        'patches': patches,
        'wholeFfmpegAndOpusArchivesRetained': True,
        'completeCorrespondingSource': False,
        'remaining': ['Effective GN defaults and compiler runtime link inputs',
                      'Missing GN glue / generated inputs / host-tool provenance',
                      'PGO profile payload or a validated documented alternative build',
                      'Source delivery and modified-library operation (Xcode checks skipped by user)'],
    }
    (OUT / 'source-files.json').write_text(json.dumps(inventory, indent=2) + '\n')
    (OUT / 'scope.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'selectedLists': report['selectedLists'], 'configFiles': len(config_files),
                      'activeBuildPatches': len(patches), 'applyChecks': [r['applyCheck'] for r in patches],
                      'dynamicLoads': loads, 'completeCorrespondingSource': False}, indent=2))


if __name__ == '__main__':
    main()
