import { z } from 'zod';
import { spotifyApi } from '../spotify/api.js';

export function registerTools(server) {
  server.tool(
    'playback_state',
    'Get current playback state (track, progress, device, shuffle, repeat)',
    {},
    async () => {
      const data = await spotifyApi('GET', '/v1/me/player');
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'playback_now_playing',
    'Get the currently playing track',
    {},
    async () => {
      const data = await spotifyApi('GET', '/v1/me/player/currently-playing');
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'playback_play',
    'Start or resume Spotify playback',
    {
      device_id: z.string().optional().describe('Spotify device ID to play on'),
      context_uri: z
        .string()
        .optional()
        .describe('Spotify URI of context (album, playlist, artist)'),
      uris: z
        .array(z.string())
        .optional()
        .describe('Array of Spotify track URIs to play'),
      position_ms: z
        .number()
        .optional()
        .describe('Position in milliseconds to start playback'),
    },
    async ({ device_id, context_uri, uris, position_ms }) => {
      const body = {};
      if (context_uri) body.context_uri = context_uri;
      if (uris) body.uris = uris;
      if (position_ms !== undefined) body.position_ms = position_ms;

      let path = '/v1/me/player/play';
      if (device_id) path += `?device_id=${encodeURIComponent(device_id)}`;

      await spotifyApi(
        'PUT',
        path,
        Object.keys(body).length ? body : undefined
      );
      return {
        content: [{ type: 'text', text: 'Playback started/resumed' }],
      };
    }
  );

  server.tool(
    'playback_pause',
    'Pause Spotify playback',
    {
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ device_id }) => {
      let path = '/v1/me/player/pause';
      if (device_id) path += `?device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('PUT', path);
      return { content: [{ type: 'text', text: 'Playback paused' }] };
    }
  );

  server.tool(
    'playback_next',
    'Skip to next track',
    {
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ device_id }) => {
      let path = '/v1/me/player/next';
      if (device_id) path += `?device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('POST', path);
      return { content: [{ type: 'text', text: 'Skipped to next track' }] };
    }
  );

  server.tool(
    'playback_previous',
    'Skip to previous track',
    {
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ device_id }) => {
      let path = '/v1/me/player/previous';
      if (device_id) path += `?device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('POST', path);
      return { content: [{ type: 'text', text: 'Skipped to previous track' }] };
    }
  );

  server.tool(
    'playback_seek',
    'Seek to a position in the current track',
    {
      position_ms: z.number().describe('Position in milliseconds'),
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ position_ms, device_id }) => {
      let path = `/v1/me/player/seek?position_ms=${position_ms}`;
      if (device_id) path += `&device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('PUT', path);
      return { content: [{ type: 'text', text: `Seeked to ${position_ms}ms` }] };
    }
  );

  server.tool(
    'playback_volume',
    'Set playback volume',
    {
      volume_percent: z
        .number()
        .min(0)
        .max(100)
        .describe('Volume level 0-100'),
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ volume_percent, device_id }) => {
      let path = `/v1/me/player/volume?volume_percent=${volume_percent}`;
      if (device_id) path += `&device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('PUT', path);
      return {
        content: [{ type: 'text', text: `Volume set to ${volume_percent}%` }],
      };
    }
  );

  server.tool(
    'playback_shuffle',
    'Toggle shuffle mode',
    {
      state: z.boolean().describe('true to enable shuffle, false to disable'),
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ state, device_id }) => {
      let path = `/v1/me/player/shuffle?state=${state}`;
      if (device_id) path += `&device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('PUT', path);
      return {
        content: [
          {
            type: 'text',
            text: `Shuffle ${state ? 'enabled' : 'disabled'}`,
          },
        ],
      };
    }
  );

  server.tool(
    'playback_repeat',
    'Set repeat mode',
    {
      state: z
        .enum(['track', 'context', 'off'])
        .describe('Repeat mode: track, context, or off'),
      device_id: z.string().optional().describe('Spotify device ID'),
    },
    async ({ state, device_id }) => {
      let path = `/v1/me/player/repeat?state=${state}`;
      if (device_id) path += `&device_id=${encodeURIComponent(device_id)}`;
      await spotifyApi('PUT', path);
      return {
        content: [{ type: 'text', text: `Repeat mode set to ${state}` }],
      };
    }
  );

  server.tool(
    'playback_transfer',
    'Transfer playback to another device',
    {
      device_ids: z
        .array(z.string())
        .describe('Array of device IDs to transfer to (first one is preferred)'),
      force_play: z
        .boolean()
        .optional()
        .describe('true to start playing on the new device immediately'),
    },
    async ({ device_ids, force_play }) => {
      const body = { device_ids, play: force_play ?? true };
      await spotifyApi('PUT', '/v1/me/player', body);
      return {
        content: [
          {
            type: 'text',
            text: `Playback transferred to device(s): ${device_ids.join(', ')}`,
          },
        ],
      };
    }
  );
}
