import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// mainとpreloadを別々のCommonJSバンドルにする。
// sandbox化されたpreloadからローカルモジュールをrequireする必要がなくなる。
await build({
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  entryPoints: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts'
  },
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  tsconfig: 'tsconfig.electron.json',
  logLevel: 'info'
});
