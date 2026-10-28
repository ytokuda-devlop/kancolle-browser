import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), ['tests/recording-smoke.cjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit',
  timeout: 180000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
