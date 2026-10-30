import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
const args = process.argv.slice(3);
if (!['dev', 'start'].includes(mode)) throw new Error('Expected dev or start.');
if (mode === 'start' && !existsSync('.next-production/BUILD_ID')) {
  console.error('No production build found. Run npm run build first, or npm run dev for development.');
  process.exit(1);
}
const explicitPort = args.some(arg => arg === '-p' || arg === '--port' || arg.startsWith('--port=')) || Boolean(process.env.PORT);
if (!explicitPort) {
  let port = 3000;
  for (; port < 3020; port++) {
    const free = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', error => {
        if (error.code === 'EADDRINUSE') resolve(false);
        else reject(error);
      });
      probe.listen({ port, host: '::', exclusive: true }, () => probe.close(() => resolve(true)));
    });
    if (free) break;
    console.log(`Port ${port} is in use; checking the next port...`);
  }
  if (port === 3020) {
    console.error('Ports 3000–3019 are occupied. Choose a port with npm run ' + mode + ' -- -p 4000.');
    process.exit(1);
  }
  args.push('-p', String(port));
}
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), mode, ...args], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1); });
