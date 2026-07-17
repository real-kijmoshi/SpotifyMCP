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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, '.env');

function prompt(rl, question, defaultVal = '') {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

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
    console.log('  Installing pm2 globally...');
    execSync('npm install -g pm2', { stdio: 'inherit' });
  }
}

function pm2Start(scriptPath, name, args, env) {
  const existing = execSync('pm2 list --no-color 2>/dev/null || true', {
    encoding: 'utf-8',
  });
  if (existing.includes(name)) {
    execSync(`pm2 delete ${name}`, { stdio: 'ignore' });
  }

  const envArgs = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

  const cmd = [
    'pm2', 'start', scriptPath,
    '--name', name,
    '--',
    ...args,
  ];

  const proc = spawn('node', [
    scriptPath,
    ...args,
  ], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  // Use pm2 directly
  execSync(`pm2 delete ${name} 2>/dev/null || true`, { stdio: 'ignore' });

  const pm2Cmd = `pm2 start "${scriptPath}" --name "${name}" --cwd "${ROOT}" -- ${args.join(' ')}`;
  execSync(pm2Cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

  execSync('pm2 save', { stdio: 'ignore' });
}

async function main() {
  console.log('');
  console.log('===========================================');
  console.log('  Spotify MCP Server - Quickstart Setup');
  console.log('===========================================');
  console.log('');

  const existing = loadExistingEnv();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Ask where setup is running
  const location = await prompt(
    rl,
    '? Running on (local / server)? [local]: ',
    existing.LOCATION || 'local'
  );
  const isServer = location.toLowerCase() === 'server';

  let serverIp = '';
  if (isServer) {
    serverIp = await prompt(
      rl,
      '? Server IP or hostname (e.g. 10.0.0.5 or myserver.com): ',
      existing.SERVER_IP || ''
    );
    if (!serverIp) {
      console.error('Error: Server IP is required for server mode.');
      rl.close();
      process.exit(1);
    }
  }

  // Build redirect URI based on location
  const defaultRedirect = existing.REDIRECT_URI || (isServer
    ? `http://${serverIp}:3080/callback`
    : 'http://127.0.0.1:3080/callback');

  console.log('');
  console.log('  You need a Spotify Developer app to use this server.');
  console.log('');
  console.log('  1. Go to https://developer.spotify.com/dashboard');
  console.log('  2. Log in with your Spotify account');
  console.log('  3. Click "Create App"');
  console.log('  4. Set a name (e.g. "spotifyMCP") and description');
  console.log(`  5. Add Redirect URI: ${defaultRedirect}`);
  console.log('  6. Click "Save"');
  console.log('  7. Copy your Client ID from the app settings page');
  console.log('');

  const clientId = await prompt(
    rl,
    `? Spotify Client ID${existing.SPOTIFY_CLIENT_ID ? ` [${existing.SPOTIFY_CLIENT_ID}]` : ''}: `,
    existing.SPOTIFY_CLIENT_ID || ''
  );

  if (!clientId) {
    console.error('Error: Client ID is required.');
    rl.close();
    process.exit(1);
  }

  const clientSecret = await prompt(
    rl,
    `? Spotify Client Secret (optional, not needed for PKCE)${existing.SPOTIFY_CLIENT_SECRET ? ' [set]' : ''}: `,
    existing.SPOTIFY_CLIENT_SECRET || ''
  );

  const redirectUri = await prompt(
    rl,
    `? Redirect URI [${defaultRedirect}]: `,
    defaultRedirect
  );

  const defaultPort = existing.MCP_PORT || '3000';
  const mcpPort = await prompt(
    rl,
    `? MCP Server Port [${defaultPort}]: `,
    defaultPort
  );

  const webhookUrl = await prompt(
    rl,
    `? Webhook URL (optional)${existing.WEBHOOK_URL ? ` [${existing.WEBHOOK_URL}]` : ''}: `,
    existing.WEBHOOK_URL || ''
  );

  // API key for HTTP auth
  const useApiKey = await prompt(
    rl,
    '? Protect server with API key? (y/n) [y]: ',
    existing.MCP_API_KEY ? 'y' : 'y'
  );

  let apiKey = existing.MCP_API_KEY || '';
  if (useApiKey.toLowerCase() !== 'n') {
    if (!apiKey) {
      apiKey = crypto.randomBytes(24).toString('hex');
    }
    console.log('');
    console.log(`  API Key: ${apiKey}`);
    console.log('');
  }

  // Write .env
  const envContent = [
    `SPOTIFY_CLIENT_ID=${clientId}`,
    clientSecret ? `SPOTIFY_CLIENT_SECRET=${clientSecret}` : '# SPOTIFY_CLIENT_SECRET=',
    `REDIRECT_URI=${redirectUri}`,
    `MCP_PORT=${mcpPort}`,
    `LOCATION=${location}`,
    isServer ? `SERVER_IP=${serverIp}` : '# SERVER_IP=',
    webhookUrl ? `WEBHOOK_URL=${webhookUrl}` : '# WEBHOOK_URL=',
    apiKey ? `MCP_API_KEY=${apiKey}` : '# MCP_API_KEY=',
    '',
  ].join('\n');

  fs.writeFileSync(ENV_PATH, envContent);
  console.log('');
  console.log('  Configuration saved to .env');

  // OAuth flow
  console.log('');
  console.log('  Starting OAuth authorization flow...');
  console.log('');

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const authUrl = buildAuthorizationUrl(clientId, redirectUri, codeChallenge);

  console.log('  Open this URL in your browser to authorize:');
  console.log('');
  console.log(`  ${authUrl}`);
  console.log('');
  console.log('  (browser will open automatically if possible)');
  console.log('');

  openBrowser(authUrl);

  console.log('  Waiting for authorization callback...');
  console.log('');

  try {
    const code = await startAuthServer(redirectUri);
    console.log('  Authorization code received! Exchanging for tokens...');

    const tokens = await exchangeCodeForTokens(
      clientId,
      code,
      redirectUri,
      codeVerifier
    );
    saveTokens(tokens);

    console.log('');
    console.log('  Authorization successful!');
    console.log('  Tokens saved to .spotify-auth.json');
  } catch (err) {
    console.error(`  Authorization failed: ${err.message}`);
    rl.close();
    process.exit(1);
  }

  // Ask about tunnel
  console.log('');
  const useTunnel = await prompt(
    rl,
    `? Expose via public tunnel? (y/n) [y]: `,
    'y'
  );

  const wantsTunnel = useTunnel.toLowerCase() !== 'n';

  // Ask about pm2
  console.log('');
  const usePm2 = await prompt(
    rl,
    `? Run as background service with pm2? (y/n) [y]: `,
    'y'
  );

  const wantsPm2 = usePm2.toLowerCase() !== 'n';

  rl.close();

  // Ensure pm2 if needed
  if (wantsPm2) {
    ensurePm2();
  }

  // Start the server
  console.log('');
  console.log('===========================================');
  console.log('  Starting Spotify MCP server...');
  console.log('===========================================');
  console.log('');

  const indexScript = path.join(ROOT, 'src', 'index.js');
  const port = mcpPort || '3000';

  if (wantsPm2) {
    const args = ['--port', port, '--host', '127.0.0.1'];
    if (wantsTunnel) args.push('--tunnel');

    const pm2Name = 'spotify-mcp';
    execSync(`pm2 delete ${pm2Name} 2>/dev/null || true`, { stdio: 'ignore' });

    const pm2Cmd = `pm2 start "${indexScript}" --name "${pm2Name}" --cwd "${ROOT}" -- ${args.join(' ')}`;
    execSync(pm2Cmd, { stdio: 'inherit' });
    execSync('pm2 save', { stdio: 'ignore' });

    console.log('');
    console.log('  Server running in background via pm2.');
    console.log('');
    console.log('  Useful commands:');
    console.log('    pm2 logs spotify-mcp     # view logs');
    console.log('    pm2 status               # check status');
    console.log('    pm2 restart spotify-mcp  # restart');
    console.log('    pm2 stop spotify-mcp     # stop');
    console.log('    pm2 delete spotify-mcp   # remove');
    console.log('');
  } else {
    // Foreground with tunnel
    const args = ['src/index.js', '--port', port, '--host', '127.0.0.1'];
    if (wantsTunnel) args.push('--tunnel');

    console.log(`  Running: node ${args.join(' ')}`);
    console.log('  (Ctrl+C to stop)');
    console.log('');

    const child = spawn('node', args, { cwd: ROOT, stdio: 'inherit' });
    child.on('close', () => process.exit(0));

    process.on('SIGINT', () => { child.kill(); process.exit(0); });
    process.on('SIGTERM', () => { child.kill(); process.exit(0); });

    return; // don't print final instructions, server is running
  }

  // Print connection instructions
  console.log('===========================================');
  console.log('  All set! Here is how to connect:');
  console.log('===========================================');
  console.log('');

  if (wantsTunnel) {
    console.log('  The server is running with a public tunnel.');
    console.log('  Check the tunnel URL in the logs:');
    console.log('    pm2 logs spotify-mcp --lines 20');
    console.log('');
    console.log('  The URL will look like:');
    console.log(`    https://xxxx.trycloudflare.com/mcp`);
    console.log('');
    console.log('  Add to claude_desktop_config.json:');
    console.log('  {');
    console.log('    "mcpServers": {');
    console.log('      "spotify": {');
    console.log('        "url": "<tunnel-url>/mcp"');
    console.log('      }');
    console.log('    }');
    console.log('  }');
  } else {
    console.log('  Local mode:');
    console.log('');
    console.log('  {');
    console.log('    "mcpServers": {');
    console.log('      "spotify": {');
    console.log('        "command": "node",');
    console.log(
      `        "args": ["${path.join(ROOT, 'src', 'index.js')}", "--stdio"]`
    );
    console.log('      }');
    console.log('    }');
    console.log('  }');
    console.log('');
    console.log('  Or HTTP mode:');
    console.log('  {');
    console.log('    "mcpServers": {');
    console.log('      "spotify": {');
    console.log(`        "url": "http://localhost:${port}/mcp"`);
    console.log('      }');
    console.log('    }');
    console.log('  }');
  }

  console.log('');
  console.log('  Done!');
  console.log('');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
