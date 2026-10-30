import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Starts a separate test server; occupied ports must be skipped without killing their owners.
const child = spawn(process.execPath, ['scripts/serve.mjs', 'start'], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
const exited = once(child, 'exit');
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 20000);
    const capture = chunk => {
      output += chunk.toString();
      const local = output.match(/Local:\s+(http:\/\/localhost:\d+)/);
      if (output.includes('Ready in') && local) { clearTimeout(timer); resolve(local[1]); }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(output)); });
  });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  console.log(output.trim());
  console.log(`Startup check passed: ${url} returned HTTP 200.`);
} finally {
  child.kill('SIGTERM');
  await exited;
}
