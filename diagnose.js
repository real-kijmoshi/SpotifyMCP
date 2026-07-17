import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  SPOTIFY_SCOPES,
} from './src/auth/oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(msg) { console.log(`[diag] ${msg}`); }
function logLine() { console.log('[diag] ' + '-'.repeat(60)); }

// Load .env
function loadEnv() {
  const env = {};
  try {
    const data = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  } catch (err) {
    log(`Error loading .env: ${err.message}`);
  }
  return env;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q) => new Promise(r => rl.question(q, r));

  logLine();
  log('Spotify OAuth Diagnostics');
  logLine();

  // Step 1: Load and display .env
  const env = loadEnv();
  log('');
  log('=== Step 1: .env Configuration ===');
  log(`  SPOTIFY_CLIENT_ID: ${env.SPOTIFY_CLIENT_ID || '(not set)'}`);
  log(`  SPOTIFY_CLIENT_SECRET: ${env.SPOTIFY_CLIENT_SECRET ? '(set, hidden)' : '(not set)'}`);
  log(`  REDIRECT_URI: ${env.REDIRECT_URI || '(not set)'}`);
  log(`  MCP_PORT: ${env.MCP_PORT || '(not set)'}`);

  if (!env.SPOTIFY_CLIENT_ID) {
    log('');
    log('ERROR: No SPOTIFY_CLIENT_ID in .env');
    rl.close();
    return;
  }

  // Step 2: Generate PKCE params
  log('');
  log('=== Step 2: PKCE Parameters ===');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  log(`  Code Verifier: ${codeVerifier}`);
  log(`  Code Challenge: ${codeChallenge}`);
  log(`  Verifier length: ${codeVerifier.length}`);
  log(`  Challenge length: ${codeChallenge.length}`);

  // Step 3: Build auth URL
  log('');
  log('=== Step 3: Authorization URL ===');
  const redirectUri = env.REDIRECT_URI || 'http://127.0.0.1:3080/callback';
  const authUrl = buildAuthorizationUrl(env.SPOTIFY_CLIENT_ID, redirectUri, codeChallenge);
  log(`  Redirect URI: ${redirectUri}`);
  log(`  Scopes: ${SPOTIFY_SCOPES.join(', ')}`);
  log(`  Scope count: ${SPOTIFY_SCOPES.length}`);
  log('');
  log(`  Full URL:`);
  log(`  ${authUrl}`);
  log('');

  // Parse and display all params
  const urlObj = new URL(authUrl);
  log('  URL Parameters:');
  for (const [key, val] of urlObj.searchParams) {
    if (key === 'code_challenge') {
      log(`    ${key}: ${val.substring(0, 20)}...`);
    } else if (key === 'scope') {
      log(`    ${key}: (${val.split(' ').length} scopes)`);
    } else {
      log(`    ${key}: ${val}`);
    }
  }

  // Step 4: Validate redirect URI format
  log('');
  log('=== Step 4: Redirect URI Validation ===');
  try {
    const rUrl = new URL(redirectUri);
    log(`  Protocol: ${rUrl.protocol}`);
    log(`  Hostname: ${rUrl.hostname}`);
    log(`  Port: ${rUrl.port || '(default)'}`);
    log(`  Pathname: ${rUrl.pathname}`);
    log(`  Has trailing slash: ${rUrl.pathname.endsWith('/') && rUrl.pathname !== '/'}`);
    log(`  Uses HTTPS: ${rUrl.protocol === 'https:'}`);
    log(`  Is localhost: ${rUrl.hostname === 'localhost' || rUrl.hostname === '127.0.0.1'}`);
    log(`  Is trycloudflare: ${rUrl.hostname.includes('trycloudflare.com')}`);

    if (rUrl.pathname.endsWith('/') && rUrl.pathname !== '/') {
      log('  WARNING: Redirect URI has trailing slash! This causes mismatch.');
    }
  } catch (err) {
    log(`  ERROR: Invalid redirect URI: ${err.message}`);
  }

  // Step 5: Test if Spotify is reachable
  log('');
  log('=== Step 5: Spotify API Reachability ===');
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code: 'invalid_test_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    log(`  Token endpoint status: ${res.status}`);
    log(`  Response: ${JSON.stringify(data)}`);

    if (data.error === 'invalid_grant') {
      log('  Expected error (invalid_grant) — Spotify endpoint is working correctly.');
    } else if (data.error === 'invalid_client') {
      log('  WARNING: invalid_client — Client ID may be wrong or app not configured.');
    } else if (data.error === 'invalid_request' && data.error_description?.includes('redirect_uri')) {
      log('  WARNING: Redirect URI mismatch! The URI sent does not match Spotify app config.');
    } else {
      log(`  Unexpected response: ${data.error}`);
    }
  } catch (err) {
    log(`  ERROR reaching Spotify: ${err.message}`);
  }

  // Step 6: Check if redirect URI is registered in Spotify
  log('');
  log('=== Step 6: Manual Verification ===');
  log('  Please verify in Spotify Developer Dashboard:');
  log(`  URL: https://developer.spotify.com/dashboard`);
  log('');
  log('  The EXACT redirect URI registered should be:');
  log(`  ${redirectUri}`);
  log('');
  log('  Common mismatch causes:');
  log('    - Trailing slash: /callback vs /callback/');
  log('    - Protocol: http:// vs https://');
  log('    - Port: :3080 vs :3000');
  log('    - Old tunnel URL from previous run');
  log('    - Copied with extra spaces');

  // Step 7: Quick test - open URL in browser
  log('');
  log('=== Step 7: Quick Test ===');
  log('  To test, open this URL in a browser and check what happens:');
  log(`  ${authUrl}`);
  log('');
  log('  If Spotify shows "server_error" immediately, the issue is:');
  log('    1. Redirect URI not registered in Spotify app');
  log('    2. Client ID mismatch');
  log('    3. Spotify app not set to "Web API" type');
  log('');
  log('  If Spotify shows the consent screen but errors after approve:');
  log('    1. Redirect URI changed between URL generation and Spotify validation');
  log('    2. Browser cached an old redirect URI');

  logLine();
  log('Diagnostics complete.');
  logLine();

  rl.close();
}

main().catch(console.error);
