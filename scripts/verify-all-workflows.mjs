// Compatibility entry point for the authenticated browser workflows.
// Always runs on its own local demo server; it never resets a hosted database.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
  'test', 'tests/reporting.spec.ts', 'tests/response.spec.ts', 'tests/routing.spec.ts',
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: { ...process.env, CIVISCOPE_TEST_SERVER: 'true', TEST_BASE_URL: 'http://localhost:3099' },
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
