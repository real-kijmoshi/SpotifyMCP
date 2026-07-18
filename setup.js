import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { execSync, spawn } from 'node:child_process';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
} from './src/auth/oauth.js';
import { startAuthServer } from './src/auth/auth-server.js';
import { saveTokens } from './src/auth/token-store.js';
import {
  c, line, header, step, success, warn, error, info,
  highlight, code, muted, box, prompt, confirm, spinner, config,
} from './src/ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, '.env');

function loadExistingEnv() {
  const env = {};
  try {
    const data = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch {}
  return env;
}

function openBrowser(url) {
  try {
    const platform = process.platform;
    if (platform === 'darwin') execSync(`open "${url}"`);
    else if (platform === 'linux') execSync(`xdg-open "${url}"`);
    else if (platform === 'win32') execSync(`start "${url}"`);
  } catch {}
}

function hasCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensurePm2() {
  if (!hasCommand('pm2')) {
    const s = spinner('Installing pm2');
    try {
      execSync('npm install -g pm2', { stdio: 'ignore' });
      s.succeed('pm2 installed');
    } catch {
      s.fail('Failed to install pm2');
      throw new Error('pm2 installation failed');
    }
  }
}

function startAuthTunnel(port) {
  return new Promise((resolve, reject) => {
    if (!hasCommand('cloudflared')) {
      reject(new Error('cloudflared not found. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'));
      return;
    }

    const proc = spawn('cloudflared', ['tunnel', '--config', '/dev/null', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    let buf = '';

    proc.stdout.on('data', () => {});

    proc.stderr.on('data', (chunk) => {
      if (resolved) return;
      buf += chunk.toString();
      const match = buf.match(/(https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com)/);
      if (match) {
        resolved = true;
        proc.stdout.removeAllListeners('data');
        proc.stderr.removeAllListeners('data');
        resolve({ url: match[1], proc });
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        reject(err);
      }
    });

    proc.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });
  });
}

async function main() {
  process.stdout.write(header('Spotify MCP Server'));
  process.stdout.write(`${muted('  Interactive setup wizard')}\n\n`);

  const existing = loadExistingEnv();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let stepNum = 0;

  // ── Step 1: Environment ──
  process.stdout.write(step(++stepNum, 'Environment'));
  const location = await prompt(
    rl,
    'Where are you running this?',
    existing.LOCATION || 'local'
  );
  const isServer = location.toLowerCase() === 'server';
  process.stdout.write(info(`Mode: ${highlight(isServer ? 'Remote Server' : 'Local')}\n`));

  // ── Step 2: Spotify App ──
  process.stdout.write(step(++stepNum, 'Spotify Developer App'));
  process.stdout.write(`${muted('  You need a Spotify Developer app. If you don\'t have one:')}\n`);
  process.stdout.write(`${muted('  1. Go to')} ${code('https://developer.spotify.com/dashboard')}\n`);
  process.stdout.write(`${muted('  2. Click "Create App" and set a name')}\n`);
  process.stdout.write(`${muted('  3. Copy the Client ID from app settings')}\n\n`);

  const clientId = await prompt(
    rl,
    'Spotify Client ID',
    existing.SPOTIFY_CLIENT_ID || ''
  );
  if (!clientId) {
    console.log(error('Client ID is required'));
    rl.close();
    process.exit(1);
  }
  process.stdout.write(success(`Client ID: ${code(clientId)}\n`));

  const clientSecret = await prompt(
    rl,
    'Spotify Client Secret (optional, not needed for PKCE)',
    existing.SPOTIFY_CLIENT_SECRET || ''
  );
  if (clientSecret) {
    process.stdout.write(success('Client secret set\n'));
  } else {
    process.stdout.write(info('No client secret (PKCE mode)\n'));
  }

  // ── Step 3: Server Config ──
  process.stdout.write(step(++stepNum, 'Server Configuration'));

  const defaultPort = existing.MCP_PORT || '3000';
  const mcpPort = await prompt(rl, 'MCP Server Port', defaultPort);

  const webhookUrl = await prompt(
    rl,
    'Webhook URL (optional)',
    existing.WEBHOOK_URL || ''
  );

  // API key
  process.stdout.write('\n');
  const useApiKey = await confirm(rl, 'Protect server with API key?', true);

  let apiKey = existing.MCP_API_KEY || '';
  if (useApiKey) {
    if (!apiKey) {
      apiKey = crypto.randomBytes(24).toString('hex');
    }
    process.stdout.write(success(`API Key: ${code(apiKey)}\n`));
    process.stdout.write(`${muted('  Save this — you\'ll need it to connect')}\n`);
  }

  // ── Step 4: Redirect URI ──
  process.stdout.write(step(++stepNum, 'OAuth Redirect URI'));
  let redirectUri = existing.REDIRECT_URI || 'http://127.0.0.1:3080/callback';
  let authTunnelProc = null;

  const redirectUriInput = await prompt(rl, 'Redirect URI', redirectUri);
  redirectUri = redirectUriInput;

  // Write .env early
  const envContent = [
    `SPOTIFY_CLIENT_ID=${clientId}`,
    clientSecret ? `SPOTIFY_CLIENT_SECRET=${clientSecret}` : '# SPOTIFY_CLIENT_SECRET=',
    `REDIRECT_URI=${redirectUri}`,
    `MCP_PORT=${mcpPort}`,
    `LOCATION=${location}`,
    isServer ? `SERVER_IP=auto` : '# SERVER_IP=',
    webhookUrl ? `WEBHOOK_URL=${webhookUrl}` : '# WEBHOOK_URL=',
    apiKey ? `MCP_API_KEY=${apiKey}` : '# MCP_API_KEY=',
    '',
  ].join('\n');

  fs.writeFileSync(ENV_PATH, envContent);

  // ── Step 5: OAuth Flow ──
  process.stdout.write(step(++stepNum, 'OAuth Authorization'));

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Start auth server
  const s = spinner('Starting callback listener');
  let authServerHandle;
  try {
    authServerHandle = await startAuthServer(redirectUri);
    s.succeed(`Callback server on ${code(`http://0.0.0.0:3080`)}`);
  } catch (err) {
    s.fail(`Failed to start callback server: ${err.message}`);
    rl.close();
    process.exit(1);
  }
  const authPromise = authServerHandle.promise;

  // Server mode: start tunnel
  if (isServer) {
    process.stdout.write('\n');
    const ts = spinner('Creating cloudflared tunnel');
    try {
      const { url: tunnelUrl, proc } = await startAuthTunnel(3080);
      authTunnelProc = proc;
      ts.succeed(`Tunnel ready: ${code(tunnelUrl)}`);

      const tunnelRedirect = `${tunnelUrl}/callback`;

      // Verify tunnel
      const hs = spinner('Verifying tunnel connectivity');
      try {
        const healthRes = await fetch(`${tunnelUrl}/health`);
        const healthData = await healthRes.json();
        hs.succeed(`Tunnel health check passed`);
      } catch {
        hs.fail(`Tunnel health check failed — tunnel may need a moment`);
      }

      process.stdout.write(box(
        `You must add this redirect URI to your Spotify app:\n\n` +
        `${highlight(tunnelRedirect)}\n\n` +
        `1. Go to ${code('https://developer.spotify.com/dashboard')}\n` +
        `2. Open your app settings\n` +
        `3. Add Redirect URI\n` +
        `4. Click Save\n\n` +
        `${muted('The URL changes every time you run setup.')}`,
        c.yellow
      ));
      process.stdout.write('\n');

      await prompt(rl, 'Press Enter after adding the redirect URI to Spotify', '');

      // Update .env
      const updatedEnv = envContent.replace(
        `REDIRECT_URI=${redirectUri}`,
        `REDIRECT_URI=${tunnelRedirect}`
      );
      fs.writeFileSync(ENV_PATH, updatedEnv);
      redirectUri = tunnelRedirect;
    } catch (err) {
      ts.fail(`Tunnel failed: ${err.message}`);
      process.stdout.write(warn('Falling back to localhost redirect\n'));
    }
  }

  // Build auth URL
  const authUrl = buildAuthorizationUrl(clientId, redirectUri, codeChallenge);

  process.stdout.write('\n');
  process.stdout.write(box(
    `Open this URL in your browser to authorize:\n\n` +
    `${highlight(authUrl)}\n\n` +
    `${muted('(browser will open automatically if possible)')}`,
    c.cyan
  ));
  process.stdout.write('\n');

  openBrowser(authUrl);

  const ws = spinner('Waiting for authorization');
  try {
    const code = await authPromise;
    ws.succeed('Authorization code received');

    const es = spinner('Exchanging code for tokens');
    const tokens = await exchangeCodeForTokens(clientId, code, redirectUri, codeVerifier);
    saveTokens(tokens);
    es.succeed('Tokens saved to .spotify-auth.json');
  } catch (err) {
    ws.fail(`Authorization failed: ${err.message}`);
    if (authTunnelProc) authTunnelProc.kill();
    rl.close();
    process.exit(1);
  }

  // Kill auth tunnel
  if (authTunnelProc) {
    authTunnelProc.kill();
  }

  // ── Step 6: Launch Options ──
  process.stdout.write(step(++stepNum, 'Launch Options'));

  const wantsTunnel = await confirm(rl, 'Expose MCP server via public tunnel?', true);
  const wantsPm2 = await confirm(rl, 'Run as background service with pm2?', true);

  rl.close();

  if (wantsPm2) {
    ensurePm2();
  }

  const indexScript = path.join(ROOT, 'src', 'index.js');
  const port = mcpPort || '3000';

  if (wantsPm2) {
    const args = ['--port', port, '--host', '127.0.0.1'];
    if (wantsTunnel) args.push('--tunnel');

    const s = spinner('Starting server with pm2');
    const pm2Name = 'spotify-mcp';
    try {
      execSync(`pm2 delete ${pm2Name} 2>/dev/null || true`, { stdio: 'ignore' });
      const pm2Cmd = `pm2 start "${indexScript}" --name "${pm2Name}" --cwd "${ROOT}" -- ${args.join(' ')}`;
      execSync(pm2Cmd, { stdio: 'ignore' });
      execSync('pm2 save', { stdio: 'ignore' });
      s.succeed('Server running in background');
    } catch (err) {
      s.fail(`Failed to start server: ${err.message}`);
      process.exit(1);
    }

    process.stdout.write('\n');
    process.stdout.write(`${muted('  Manage with:')}\n`);
    process.stdout.write(`    ${code('pm2 logs spotify-mcp')}     ${muted('# view logs')}\n`);
    process.stdout.write(`    ${code('pm2 status')}               ${muted('# check status')}\n`);
    process.stdout.write(`    ${code('pm2 restart spotify-mcp')}  ${muted('# restart')}\n`);
    process.stdout.write(`    ${code('pm2 stop spotify-mcp')}     ${muted('# stop')}\n`);
    process.stdout.write(`    ${code('pm2 delete spotify-mcp')}   ${muted('# remove')}\n`);
  } else {
    const args = ['src/index.js', '--port', port, '--host', '127.0.0.1'];
    if (wantsTunnel) args.push('--tunnel');

    process.stdout.write(`\n  ${muted('Running:')} ${code(`node ${args.join(' ')}`)}\n`);
    process.stdout.write(`  ${muted('(Ctrl+C to stop)')}\n\n`);

    const child = spawn('node', args, { cwd: ROOT, stdio: 'inherit' });
    child.on('close', () => process.exit(0));
    process.on('SIGINT', () => { child.kill(); process.exit(0); });
    process.on('SIGTERM', () => { child.kill(); process.exit(0); });
    return;
  }

  // ── Connection Instructions ──
  process.stdout.write(header('All Set'));

  if (wantsTunnel) {
    process.stdout.write(`${muted('  Find the tunnel URL in the logs:')}\n`);
    process.stdout.write(`    ${code('pm2 logs spotify-mcp --lines 20')}\n\n`);
    process.stdout.write(`${muted('  The URL will look like:')}\n`);
    process.stdout.write(`    ${code('https://xxxx.trycloudflare.com/mcp')}\n\n`);
    process.stdout.write(`${muted('  Add to claude_desktop_config.json:')}\n`);

    const clientConfig = { mcpServers: { spotify: { url: '<tunnel-url>/mcp' } } };
    if (apiKey) {
      clientConfig.mcpServers.spotify.headers = { Authorization: `Bearer ${apiKey}` };
    }
    process.stdout.write(config(clientConfig) + '\n');
  } else {
    process.stdout.write(`${muted('  Add to claude_desktop_config.json:')}\n\n`);
    const clientConfig = {
      mcpServers: {
        spotify: {
          command: 'node',
          args: [path.join(ROOT, 'src', 'index.js'), '--stdio'],
        },
      },
    };
    process.stdout.write(config(clientConfig) + '\n');
  }

  process.stdout.write(`\n  ${c.green}${c.bold}Done!${c.reset}\n\n`);
}

main().catch((err) => {
  console.log(error(`Setup failed: ${err.message}`));
  process.exit(1);
});
