import crypto from 'node:crypto';

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-read-email',
  'user-read-private',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
];

export function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizationUrl(clientId, redirectUri, codeChallenge) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES.join(' '),
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(clientId, code, redirectUri, codeVerifier) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error || response.status}`);
  }
  return data;
}

export async function refreshAccessToken(clientId, refreshToken) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error || response.status}`);
  }
  return data;
}
