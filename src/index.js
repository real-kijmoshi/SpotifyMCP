import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpotifyMcpServer } from './create-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  try {
    const data = fs.readFileSync(envPath, 'utf-8');
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found, rely on existing env vars
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { mode: 'stdio', port: null, host: '127.0.0.1', tunnel: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stdio') {
      opts.mode = 'stdio';
    } else if (args[i] === '--port' && args[i + 1]) {
      opts.mode = 'http';
      opts.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--host' && args[i + 1]) {
      opts.host = args[i + 1];
      i++;
    } else if (args[i] === '--tunnel') {
      opts.tunnel = true;
    }
  }

  if (opts.mode === 'http' && !opts.port) {
    opts.port = parseInt(process.env.MCP_PORT || '3000', 10);
  }

  if (opts.tunnel && opts.mode === 'stdio') {
    opts.mode = 'http';
    if (!opts.port) opts.port = parseInt(process.env.MCP_PORT || '3000', 10);
  }

  return opts;
}

async function main() {
  loadEnv();

  if (!process.env.SPOTIFY_CLIENT_ID) {
    console.error(
      'Error: SPOTIFY_CLIENT_ID not set. Run `node setup.js` first or add it to .env'
    );
    process.exit(1);
  }

  const opts = parseArgs(process.argv);

  if (opts.mode === 'stdio') {
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    const server = createSpotifyMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    const { startHttpServer } = await import('./http-handler.js');
    const apiKey = process.env.MCP_API_KEY || '';
    startHttpServer(createSpotifyMcpServer, opts.port, opts.host, apiKey);

    if (opts.tunnel) {
      const { startTunnel } = await import('./tunnel.js');
      try {
        const { url, type } = await startTunnel(opts.port);
        const apiKey = process.env.MCP_API_KEY;
        const config = { mcpServers: { spotify: { url: `${url}/mcp` } } };
        if (apiKey) {
          config.mcpServers.spotify.headers = { Authorization: `Bearer ${apiKey}` };
        }
        console.log(`\nTunnel (${type}): ${url}/mcp\n`);
        if (apiKey) console.log(`API Key: ${apiKey}\n`);
        console.log('Add to claude_desktop_config.json:');
        console.log(JSON.stringify(config, null, 2));
        console.log('');
      } catch (err) {
        console.error(`Tunnel failed: ${err.message}`);
        console.log(`Server still running at http://localhost:${opts.port}/mcp`);
      }
    }
  }
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
