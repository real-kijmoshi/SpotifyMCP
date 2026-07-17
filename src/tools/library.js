import { z } from 'zod';
import { spotifyApi } from '../spotify/api.js';

export function registerTools(server) {
  server.tool(
    'library_saved_tracks',
    "Get the user's saved/liked tracks",
    {
      limit: z.number().min(1).max(50).optional().describe('Max tracks (1-50, default 20)'),
      offset: z.number().optional().describe('Offset for pagination'),
      market: z.string().optional().describe('Market code (e.g. US)'),
    },
    async ({ limit, offset, market }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));
      if (market) params.set('market', market);
      const qs = params.toString() ? `?${params}` : '';
      const data = await spotifyApi('GET', `/v1/me/tracks${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'library_saved_albums',
    "Get the user's saved albums",
    {
      limit: z.number().min(1).max(50).optional().describe('Max albums (1-50, default 20)'),
      offset: z.number().optional().describe('Offset for pagination'),
    },
    async ({ limit, offset }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));
      const qs = params.toString() ? `?${params}` : '';
      const data = await spotifyApi('GET', `/v1/me/albums${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'library_check_tracks',
    'Check if tracks are saved in the user\'s library',
    {
      ids: z.array(z.string()).describe('Array of Spotify track IDs to check'),
    },
    async ({ ids }) => {
      const params = new URLSearchParams({ ids: ids.join(',') });
      const data = await spotifyApi('GET', `/v1/me/tracks/contains?${params}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'library_save_tracks',
    'Save tracks to the user\'s library (like/favorite)',
    {
      ids: z.array(z.string()).describe('Array of Spotify track IDs to save'),
    },
    async ({ ids }) => {
      const params = new URLSearchParams({ ids: ids.join(',') });
      await spotifyApi('PUT', `/v1/me/tracks?${params}`);
      return {
        content: [{ type: 'text', text: `Saved ${ids.length} track(s) to library` }],
      };
    }
  );

  server.tool(
    'library_remove_tracks',
    'Remove tracks from the user\'s library',
    {
      ids: z.array(z.string()).describe('Array of Spotify track IDs to remove'),
    },
    async ({ ids }) => {
      const params = new URLSearchParams({ ids: ids.join(',') });
      await spotifyApi('DELETE', `/v1/me/tracks?${params}`);
      return {
        content: [
          { type: 'text', text: `Removed ${ids.length} track(s) from library` },
        ],
      };
    }
  );
}
