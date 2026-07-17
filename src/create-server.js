import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerTools as registerPlayback } from './tools/playback.js';
import { registerTools as registerSearch } from './tools/search.js';
import { registerTools as registerPlaylists } from './tools/playlists.js';
import { registerTools as registerProfile } from './tools/profile.js';
import { registerTools as registerLibrary } from './tools/library.js';
import { registerTools as registerQueue } from './tools/queue.js';

export function createSpotifyMcpServer() {
  const server = new McpServer({
    name: 'spotify-mcp',
    version: '1.0.0',
  });

  registerPlayback(server);
  registerSearch(server);
  registerPlaylists(server);
  registerProfile(server);
  registerLibrary(server);
  registerQueue(server);

  return server;
}
