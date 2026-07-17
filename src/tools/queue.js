import { z } from 'zod';
import { spotifyApi } from '../spotify/api.js';

export function registerTools(server) {
  server.tool(
    'queue_get',
    'Get the current playback queue',
    {},
    async () => {
      const data = await spotifyApi('GET', '/v1/me/player/queue');
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'queue_add',
    'Add a track to the playback queue',
    {
      uri: z
        .string()
        .describe('Spotify track URI (e.g. spotify:track:4uLU6hMCjMI75M1A2tKUQC)'),
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ uri, device_id }) => {
      let path = `/v1/me/player/queue?uri=${encodeURIComponent(uri)}`;
      if (device_id) path += `&device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('POST', path);
      return {
        content: [{ type: 'text', text: `Added to queue: ${uri}` }],
      };
    }
  );
}
