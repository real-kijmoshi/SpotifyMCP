import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

const sessions = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function checkAuth(req, apiKey) {
  if (!apiKey) return true;
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token.length !== apiKey.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(apiKey));
}

function jsonError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

async function handlePost(req, res, serverFactory, apiKey) {
  if (!checkAuth(req, apiKey)) {
    return jsonError(res, 401, 'Unauthorized — valid API key required');
  }

  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId);
    await transport.handleRequest(req, res);
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return jsonError(res, 400, 'Invalid JSON in request body');
  }

  if (!isInitializeRequest(body)) {
    return jsonError(res, 400, 'Expected MCP initialize request');
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
  };

  const mcpServer = serverFactory();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

async function handleGet(req, res, apiKey) {
  if (!checkAuth(req, apiKey)) {
    return jsonError(res, 401, 'Unauthorized');
  }

  const sessionId = req.headers['mcp-session-id'];
  const transport = sessions.get(sessionId);
  if (!transport) {
    return jsonError(res, 404, 'Session not found — send an initialize request first');
  }
  await transport.handleRequest(req, res);
}

async function handleDelete(req, res, apiKey) {
  if (!checkAuth(req, apiKey)) {
    return jsonError(res, 401, 'Unauthorized');
  }

  const sessionId = req.headers['mcp-session-id'];
  const transport = sessions.get(sessionId);
  if (!transport) {
    return jsonError(res, 404, 'Session not found');
  }
  await transport.handleRequest(req, res);
}

export function startHttpServer(serverFactory, port, host = '127.0.0.1', apiKey = '') {
  const c = {
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    reset: '\x1b[0m',
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'POST, GET, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, mcp-session-id, Authorization'
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
      return;
    }

    if (url.pathname !== '/mcp') {
      return jsonError(res, 404, `Not found — use POST ${c.cyan}/mcp${c.reset}`);
    }

    try {
      if (req.method === 'POST') {
        await handlePost(req, res, serverFactory, apiKey);
      } else if (req.method === 'GET') {
        await handleGet(req, res, apiKey);
      } else if (req.method === 'DELETE') {
        await handleDelete(req, res, apiKey);
      } else {
        res.writeHead(405);
        res.end();
      }
    } catch (err) {
      console.error('Request error:', err);
      if (!res.headersSent) {
        jsonError(res, 500, 'Internal server error');
      }
    }
  });

  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`${c.bold}${c.green}Spotify MCP${c.reset} running at ${c.cyan}http://${displayHost}:${port}/mcp${c.reset}`);
    if (apiKey) {
      console.log(`${c.gray}API Key required — include Authorization: Bearer <key>${c.reset}`);
    }
    console.log(`${c.gray}Health: http://${displayHost}:${port}/health${c.reset}`);
  });

  return server;
}
