import { z } from 'zod';
import { spotifyApi } from '../spotify/api.js';

export function registerTools(server) {
  server.tool(
    'search',
    'Search Spotify for tracks, artists, albums, and playlists',
    {
      query: z.string().describe('Search query'),
      types: z
        .string()
        .optional()
        .describe('Comma-separated types: track,artist,album,playlist (default: track,artist,album,playlist)'),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe('Max results per type (1-50, default 5)'),
      market: z
        .string()
        .optional()
        .describe('Market code (e.g. US, GB). If provided, results will be relinkable for that market.'),
    },
    async ({ query, types, limit, market }) => {
      const params = new URLSearchParams({
        q: query,
        type: types || 'track,artist,album,playlist',
        limit: String(limit || 5),
      });
      if (market) params.set('market', market);
      const data = await spotifyApi('GET', `/v1/search?${params}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'search_tracks',
    'Search for tracks on Spotify',
    {
      query: z.string().describe('Track search query'),
      limit: z.number().min(1).max(50).optional().describe('Max results (1-50, default 10)'),
      market: z.string().optional().describe('Market code (e.g. US)'),
    },
    async ({ query, limit, market }) => {
      const params = new URLSearchParams({
        q: query,
        type: 'track',
        limit: String(limit || 10),
      });
      if (market) params.set('market', market);
      const data = await spotifyApi('GET', `/v1/search?${params}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'search_artists',
    'Search for artists on Spotify',
    {
      query: z.string().describe('Artist search query'),
      limit: z.number().min(1).max(50).optional().describe('Max results (1-50, default 10)'),
    },
    async ({ query, limit }) => {
      const params = new URLSearchParams({
        q: query,
        type: 'artist',
        limit: String(limit || 10),
      });
      const data = await spotifyApi('GET', `/v1/search?${params}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'search_albums',
    'Search for albums on Spotify',
    {
      query: z.string().describe('Album search query'),
      limit: z.number().min(1).max(50).optional().describe('Max results (1-50, default 10)'),
    },
    async ({ query, limit }) => {
      const params = new URLSearchParams({
        q: query,
        type: 'album',
        limit: String(limit || 10),
      });
      const data = await spotifyApi('GET', `/v1/search?${params}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'search_playlists',
    'Search for playlists on Spotify',
    {
      query: z.string().describe('Playlist search query'),
      limit: z.number().min(1).max(50).optional().describe('Max results (1-50, default 10)'),
    },
    async ({ query, limit }) => {
      const params = new URLSearchParams({
        q: query,
        type: 'playlist',
        limit: String(limit || 10),
      });
      const data = await spotifyApi('GET', `/v1/search?${params}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
