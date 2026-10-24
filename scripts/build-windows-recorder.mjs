import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildWindowsRecorder() {
  if (process.platform !== 'win32') throw new Error('Windows recorder requires Windows and the MSVC C++ build tools.');
  if ((process.env.RECORDER_ARCH || process.arch) !== 'x64') throw new Error('Windows recorder currently supports x64 only.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = path.join(root, 'dist-native', 'win32');
  mkdirSync(output, { recursive: true });
  const executable = path.join(output, 'KancolleRecorder.exe');
  const args = ['/nologo', '/std:c++17', '/EHsc', '/O2', '/MT', '/W4', '/utf-8', '/D_UNICODE', '/DUNICODE',
    path.join(root, 'native/windows/Recorder.cpp'), `/Fe${executable}`, `/Fo${path.join(output, 'Recorder.obj')}`,
    '/link', 'windowsapp.lib', 'd3d11.lib', 'dxgi.lib', 'dwmapi.lib', 'mfplat.lib', 'mfreadwrite.lib',
    'mfuuid.lib', 'wmcodecdspuuid.lib', 'ole32.lib', 'propsys.lib', 'mmdevapi.lib', 'user32.lib'];
  if (process.env.VCINSTALLDIR && process.env.VSCMD_ARG_TGT_ARCH === 'x64') {
    execFileSync('cl.exe', args, { cwd: output, stdio: 'inherit' });
  } else {
    const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    if (!existsSync(vswhere)) throw new Error('Install Visual Studio C++ Build Tools and Windows SDK, or run from an x64 Native Tools prompt.');
    // -all also handles installations whose optional components are incomplete.
    const installs = execFileSync(vswhere, ['-all', '-products', '*', '-property', 'installationPath'], { encoding: 'utf8' }).trim().split(/\r?\n/);
    const vcvars = installs.map(install => path.join(install, 'VC/Auxiliary/Build/vcvarsall.bat')).find(existsSync);
    if (!vcvars) throw new Error('MSVC x64 tools were not found. Install the Desktop development with C++ workload.');
    // Only fixed compiler options and local paths go into this private build script.
    const quote = value => {
      if (/["%\r\n]/.test(value)) throw new Error('Unsupported character in native build path.');
      return `"${value}"`;
    };
    const batch = path.join(output, 'build-recorder.cmd');
    writeFileSync(batch, `@echo off\r\nchcp 65001 >nul\r\ncall ${quote(vcvars)} x64\r\nif errorlevel 1 exit /b %errorlevel%\r\ncl.exe ${args.map(quote).join(' ')}\r\nexit /b %errorlevel%\r\n`);
    execFileSync('cmd.exe', ['/d', '/s', '/c', `"${batch}"`], { cwd: output, stdio: 'inherit', windowsHide: true, windowsVerbatimArguments: true });
  }
  return executable;
}

if (process.platform === 'win32') buildWindowsRecorder();
