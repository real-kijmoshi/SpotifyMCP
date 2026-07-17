import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { URL } from 'node:url';

const PORT = 3081;
function log(msg) { console.log(`[test] ${msg}`); }

async function main() {
  log('Starting cloudflared tunnel connectivity test...');

  // Kill leftover cloudflared
  try { spawn('pkill', ['-f', 'cloudflared tunnel']); } catch {}
  await new Promise(r => setTimeout(r, 1000));

  // Start a simple echo server
  const server = http.createServer((req, res) => {
    log(`  SERVER RECEIVED: ${req.method} ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`OK from server: ${req.url}`);
  });

  await new Promise((resolve) => {
    server.listen(PORT, '0.0.0.0', () => {
      log(`  Echo server on port ${PORT}`);
      resolve();
    });
  });

  // Verify local works
  const localRes = await fetch(`http://127.0.0.1:${PORT}/local-test`);
  log(`  Local fetch: ${localRes.status} - ${await localRes.text()}`);

  // Start cloudflared
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let tunnelUrl = null;
  let buf = '';

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log('  Timeout waiting for tunnel URL');
      proc.kill();
      server.close();
      process.exit(1);
    }, 20000);

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text); // Also print cloudflared output

      if (!tunnelUrl) {
        buf += text;
        const match = buf.match(/(https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com)/);
        if (match) {
          tunnelUrl = match[1];
          log(`  Tunnel URL: ${tunnelUrl}`);
          clearTimeout(timeout);
          resolve();
        }
      }
    });

    proc.on('error', (err) => {
      log(`  cloudflared process error: ${err.message}`);
      clearTimeout(timeout);
      resolve();
    });

    proc.on('exit', (code) => {
      log(`  cloudflared exited with code ${code}`);
      clearTimeout(timeout);
      resolve();
    });
  });

  if (!tunnelUrl) {
    log('No tunnel URL obtained, exiting.');
    server.close();
    process.exit(1);
  }

  // Wait for tunnel to be ready
  log('  Waiting 5s for tunnel to fully establish...');
  await new Promise(r => setTimeout(r, 5000));

  // Test with multiple approaches
  log('');
  log('=== Test A: fetch() ===');
  try {
    const res = await fetch(`${tunnelUrl}/callback?code=test123`, {
      signal: AbortSignal.timeout(10000),
    });
    log(`  fetch status: ${res.status}`);
    log(`  fetch body: ${await res.text()}`);
  } catch (err) {
    log(`  fetch error: ${err.message}`);
    log(`  fetch error name: ${err.name}`);
    if (err.cause) log(`  fetch cause: ${err.cause}`);
  }

  log('');
  log('=== Test B: curl ===');
  try {
    const result = execSync(`curl -v --max-time 10 "${tunnelUrl}/callback?code=curltest" 2>&1`, {
      timeout: 15000,
    });
    log(`  curl output: ${result.toString()}`);
  } catch (err) {
    log(`  curl error: ${err.message}`);
    if (err.stdout) log(`  curl stdout: ${err.stdout.toString()}`);
    if (err.stderr) log(`  curl stderr: ${err.stderr.toString()}`);
  }

  log('');
  log('=== Test C: Node http.get ===');
  await new Promise((resolve) => {
    const url = new URL(`${tunnelUrl}/callback?code=nodetest`);
    const req = http.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        log(`  http.get status: ${res.statusCode}`);
        log(`  http.get body: ${body}`);
        resolve();
      });
    });
    req.on('error', (err) => {
      log(`  http.get error: ${err.message}`);
      resolve();
    });
    req.on('timeout', () => {
      log(`  http.get timeout`);
      req.destroy();
      resolve();
    });
  });

  // Cleanup
  log('');
  log('=== Cleanup ===');
  proc.kill();
  server.close();
  log('Done.');
}

main().catch(console.error);
