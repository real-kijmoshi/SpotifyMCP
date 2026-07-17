# spotifyMCP

MCP server for Spotify. Control playback, manage playlists, search music, and more — from any MCP-compatible AI client.

**34 tools. 2 dependencies. Works locally or on a server.**

## Quick Start

```bash
git clone https://github.com/real-kijmoshi/SpotifyMCP.git
cd spotifyMCP
npm install    # or bun install
npm run setup  # or bun run setup
```

The setup script will:

1. Show you where to get a Spotify Developer app
2. Ask for your **Client ID**, **Secret** (optional), **port**, and **webhook URL**
3. Generate an **API key** to protect your server from unauthorized access
4. Open Spotify authorization in your browser
5. Handle the OAuth callback automatically
6. Optionally start the server with a **public tunnel** (cloudflared) and run it as a **background service** (pm2)

## Connect to Claude Desktop

Add one of these to `claude_desktop_config.json`:

**Local (stdio):**
```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["/absolute/path/to/spotifyMCP/src/index.js", "--stdio"]
    }
  }
}
```

**HTTP (local or remote):**
```json
{
  "mcpServers": {
    "spotify": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Via tunnel (public URL):**
```json
{
  "mcpServers": {
    "spotify": {
      "url": "https://your-tunnel.trycloudflare.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## Running

```bash
# Local stdio mode (for Claude Desktop)
node src/index.js --stdio

# HTTP server on port 3000
node src/index.js --port 3000

# HTTP server with public tunnel
node src/index.js --port 3000 --tunnel

# As a pm2 background service with tunnel
npm run service:install
```

## Service Management

```bash
npm run service:logs       # view logs (shows tunnel URL)
npm run service:status     # check status
npm run service:restart    # restart
npm run service:stop       # stop
npm run service:remove     # remove service
```

## Getting a Spotify Client ID

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **Create App**
4. Set a name (e.g. "spotifyMCP") and description
5. Add Redirect URI: `http://127.0.0.1:3080/callback` (or `http://YOUR-SERVER-IP:3080/callback`)
6. Click **Save**
7. Copy your **Client ID** from the app settings page

## Server Setup

When running on a remote server, the setup script asks for your server's IP/hostname. It uses that to build the redirect URI (e.g. `http://10.0.0.5:3080/callback`) so the browser OAuth callback reaches the server directly. Make sure port 3080 is open for the initial auth.

## Tools (34)

### Playback
| Tool | Description |
|------|-------------|
| `playback_state` | Get current playback state |
| `playback_now_playing` | Get currently playing track |
| `playback_play` | Start or resume playback |
| `playback_pause` | Pause playback |
| `playback_next` | Skip to next track |
| `playback_previous` | Skip to previous track |
| `playback_seek` | Seek to position (ms) |
| `playback_volume` | Set volume (0-100) |
| `playback_shuffle` | Toggle shuffle mode |
| `playback_repeat` | Set repeat mode |
| `playback_transfer` | Transfer to another device |

### Search
| Tool | Description |
|------|-------------|
| `search` | Search tracks, artists, albums, playlists |
| `search_tracks` | Search tracks only |
| `search_artists` | Search artists only |
| `search_albums` | Search albums only |
| `search_playlists` | Search playlists only |

### Playlists
| Tool | Description |
|------|-------------|
| `playlists_list` | List your playlists |
| `playlists_get` | Get playlist and its tracks |
| `playlists_create` | Create a new playlist |
| `playlists_add_tracks` | Add tracks to playlist |
| `playlists_remove_tracks` | Remove tracks from playlist |
| `playlists_follow` | Follow/save a playlist |

### Profile & Discovery
| Tool | Description |
|------|-------------|
| `user_profile` | Get your Spotify profile |
| `user_top_tracks` | Get your top tracks |
| `user_top_artists` | Get your top artists |
| `user_devices` | List available devices |
| `user_recently_played` | Get recently played tracks |

### Library
| Tool | Description |
|------|-------------|
| `library_saved_tracks` | List saved/liked tracks |
| `library_saved_albums` | List saved albums |
| `library_check_tracks` | Check if tracks are in library |
| `library_save_tracks` | Save tracks to library |
| `library_remove_tracks` | Remove tracks from library |

### Queue
| Tool | Description |
|------|-------------|
| `queue_get` | Get current playback queue |
| `queue_add` | Add track to queue |

## Architecture

```
spotifyMCP/
├── setup.js              # Interactive quickstart CLI
└── src/
    ├── index.js          # Entry point (--stdio or --port N --tunnel)
    ├── create-server.js  # McpServer factory + tool registration
    ├── http-handler.js   # node:http + StreamableHTTPServerTransport
    ├── tunnel.js         # Auto-detect cloudflared / localtunnel
    ├── auth/
    │   ├── oauth.js      # PKCE generation, token exchange/refresh
    │   ├── auth-server.js # Ephemeral OAuth callback server
    │   └── token-store.js # .spotify-auth.json persistence
    ├── spotify/
    │   └── api.js        # Spotify Web API fetch wrapper
    └── tools/            # 7 tool modules, 34 tools total
```

## Config (`.env`)

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=optional
REDIRECT_URI=http://127.0.0.1:3080/callback
MCP_PORT=3000
MCP_API_KEY=auto_generated_key
LOCATION=local
# SERVER_IP=10.0.0.5
# WEBHOOK_URL=
```

## Authentication

When running in HTTP mode (especially with a public tunnel), the server is protected by an **API key**. The setup script generates one automatically.

For Claude Desktop, add the `headers` field:
```json
{
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  }
}
```

The API key is required for all HTTP requests. Stdio mode (local) does not use API key auth since it's already protected by process isolation.

## License

MIT
