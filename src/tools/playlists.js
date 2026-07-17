import { z } from 'zod';
import { spotifyApi } from '../spotify/api.js';

export function registerTools(server) {
  server.tool(
    'playlists_list',
    "Get the current user's playlists",
    {
      limit: z.number().min(1).max(50).optional().describe('Max playlists (1-50, default 20)'),
      offset: z.number().optional().describe('Offset for pagination'),
    },
    async ({ limit, offset }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));
      const qs = params.toString() ? `?${params}` : '';
      const data = await spotifyApi('GET', `/v1/me/playlists${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'playlists_get',
    'Get a playlist and its tracks',
    {
      playlist_id: z.string().describe('Spotify playlist ID'),
      limit: z.number().min(1).max(100).optional().describe('Max tracks per page (1-100, default 100)'),
      offset: z.number().optional().describe('Offset for pagination'),
    },
    async ({ playlist_id, limit, offset }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));
      const qs = params.toString() ? `?${params}` : '';
      const data = await spotifyApi('GET', `/v1/playlists/${playlist_id}${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'playlists_create',
    'Create a new playlist for the current user',
    {
      name: z.string().describe('Playlist name'),
      description: z.string().optional().describe('Playlist description'),
      public: z
        .boolean()
        .optional()
        .describe('true for public, false for private (default false)'),
    },
    async ({ name, description, public: isPublic }) => {
      const me = await spotifyApi('GET', '/v1/me');
      const body = {
        name,
        description: description || '',
        public: isPublic ?? false,
      };
      const data = await spotifyApi(
        'POST',
        `/v1/users/${me.id}/playlists`,
        body
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'playlists_add_tracks',
    'Add tracks to a playlist',
    {
      playlist_id: z.string().describe('Spotify playlist ID'),
      uris: z
        .array(z.string())
        .describe('Array of Spotify track URIs (e.g. spotify:track:4uLU6hMCjMI75M1A2tKUQC)'),
      position: z
        .number()
        .optional()
        .describe('Position to insert tracks (0-based)'),
    },
    async ({ playlist_id, uris, position }) => {
      const body = { uris };
      if (position !== undefined) body.position = position;
      const data = await spotifyApi(
        'POST',
        `/v1/playlists/${playlist_id}/tracks`,
        body
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'playlists_remove_tracks',
    'Remove tracks from a playlist',
    {
      playlist_id: z.string().describe('Spotify playlist ID'),
      uris: z
        .array(z.string())
        .describe('Array of Spotify track URIs to remove'),
    },
    async ({ playlist_id, uris }) => {
      const body = { tracks: uris.map((uri) => ({ uri })) };
      const data = await spotifyApi(
        'DELETE',
        `/v1/playlists/${playlist_id}/tracks`,
        body
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'playlists_follow',
    'Follow/save a playlist to your library',
    {
      playlist_id: z.string().describe('Spotify playlist ID'),
    },
    async ({ playlist_id }) => {
      await spotifyApi('PUT', `/v1/playlists/${playlist_id}/followers`);
      return {
        content: [{ type: 'text', text: 'Playlist followed/saved' }],
      };
    }
  );
}
