import { getValidAccessToken } from '../auth/token-store.js';

const BASE_URL = 'https://api.spotify.com';

export async function spotifyApi(method, path, body) {
  const token = await getValidAccessToken();

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  if (body && method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);

  if (response.status === 204) {
    return { success: true };
  }

  const data = await response.json();

  if (!response.ok) {
    const errorMsg =
      data?.error?.message || `Spotify API error: ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}
