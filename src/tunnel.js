import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';

function hasCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function startTunnel(port) {
  return new Promise((resolve, reject) => {
    if (hasCommand('cloudflared')) {
      const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;

      proc.stdout.on('data', (chunk) => {
        if (resolved) return;
        const text = chunk.toString();
        const match = text.match(/(https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com)/);
        if (match) {
          resolved = true;
          proc.stdout.removeAllListeners('data');
          proc.stderr.removeAllListeners('data');
          resolve({ url: match[1], proc, type: 'cloudflared' });
        }
      });

      proc.stderr.on('data', () => {});

      proc.on('error', (err) => {
        if (!resolved) reject(err);
      });

      proc.on('exit', (code) => {
        if (!resolved) reject(new Error(`cloudflared exited with code ${code}`));
      });

      return;
    }

    // Fallback: localtunnel via npx
    const proc = spawn('npx', ['-y', 'localtunnel', '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;

    proc.stdout.on('data', (chunk) => {
      if (resolved) return;
      const text = chunk.toString();
      const match = text.match(/(https:\/\/[a-zA-Z0-9\-]+\.loca\.lt)/);
      if (match) {
        resolved = true;
        proc.stdout.removeAllListeners('data');
        proc.stderr.removeAllListeners('data');
        resolve({ url: match[1], proc, type: 'localtunnel' });
      }
    });

    proc.stderr.on('data', () => {});

    proc.on('error', (err) => {
      if (!resolved) reject(err);
    });

    proc.on('exit', (code) => {
      if (!resolved) reject(new Error(`localtunnel exited with code ${code}`));
    });
  });
}
