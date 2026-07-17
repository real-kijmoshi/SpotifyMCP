import { z } from 'zod';
import { spotifyApi } from '../spotify/api.js';

export function registerTools(server) {
  server.tool(
    'user_profile',
    'Get the current user\'s Spotify profile',
    {},
    async () => {
      const data = await spotifyApi('GET', '/v1/me');
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'user_top_tracks',
    "Get the user's top tracks",
    {
      time_range: z
        .enum(['short_term', 'medium_term', 'long_term'])
        .optional()
        .describe('Time range: short_term (~4 weeks), medium_term (~6 months), long_term (years). Default: medium_term'),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe('Max tracks (1-50, default 20)'),
    },
    async ({ time_range, limit }) => {
      const params = new URLSearchParams();
      if (time_range) params.set('time_range', time_range);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString() ? `?${params}` : '';
      const data = await spotifyApi('GET', `/v1/me/top/tracks${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'user_top_artists',
    "Get the user's top artists",
    {
      time_range: z
        .enum(['short_term', 'medium_term', 'long_term'])
        .optional()
        .describe('Time range: short_term (~4 weeks), medium_term (~6 months), long_term (years). Default: medium_term'),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe('Max artists (1-50, default 20)'),
    },
    async ({ time_range, limit }) => {
      const params = new URLSearchParams();
      if (time_range) params.set('time_range', time_range);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString() ? `?${params}` : '';
      const data = await spotifyApi('GET', `/v1/me/top/artists${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'user_devices',
    'List available Spotify Connect devices',
    {},
    async () => {
      const data = await spotifyApi('GET', '/v1/me/player/devices');
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'user_recently_played',
    'Get recently played tracks',
    {
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe('Max tracks (1-50, default 20)'),
      after: z
        .number()
        .optional()
        .describe('Unix timestamp in ms. Return items after this timestamp.'),
      before: z
        .number()
        .optional()
        .describe('Unix timestamp in ms. Return items before this timestamp.'),
    },
    async ({ limit, after, before }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (after) params.set('after', String(after));
      if (before) params.set('before', String(before));
      const qs = params.toString() ? `?${params}` : '';
      const data = await spotifyApi(
        'GET',
        `/v1/me/player/recently-played${qs}`
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
