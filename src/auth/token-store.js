import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshAccessToken } from './oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', '..', '.spotify-auth.json');

export function loadTokens() {
  try {
    const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveTokens(tokenData) {
  const existing = loadTokens();
  const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || (existing && existing.refresh_token),
    expires_at: expiresAt,
    scope: tokenData.scope || (existing && existing.scope),
  };

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2) + '\n');
  return tokens;
}

export async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error(
      'No Spotify tokens found. Run `node setup.js` to authenticate first.'
    );
  }

  if (Date.now() >= tokens.expires_at - 60000) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      throw new Error('SPOTIFY_CLIENT_ID not set in environment.');
    }
    if (!tokens.refresh_token) {
      throw new Error('No refresh token available. Run `node setup.js` to re-authenticate.');
    }

    try {
      const refreshed = await refreshAccessToken(clientId, tokens.refresh_token);
      saveTokens(refreshed);
      return refreshed.access_token;
    } catch (err) {
      throw new Error(
        `Token refresh failed: ${err.message}. Run \`node setup.js\` to re-authenticate.`
      );
    }
  }

  return tokens.access_token;
}
