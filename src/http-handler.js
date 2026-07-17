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

async function handlePost(req, res, serverFactory, apiKey) {
  if (!checkAuth(req, apiKey)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
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
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  if (!isInitializeRequest(body)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'Bad Request: expected initialize request' })
    );
    return;
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
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const sessionId = req.headers['mcp-session-id'];
  const transport = sessions.get(sessionId);
  if (!transport) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }
  await transport.handleRequest(req, res);
}

async function handleDelete(req, res, apiKey) {
  if (!checkAuth(req, apiKey)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const sessionId = req.headers['mcp-session-id'];
  const transport = sessions.get(sessionId);
  if (!transport) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }
  await transport.handleRequest(req, res);
}

export function startHttpServer(serverFactory, port, host = '127.0.0.1', apiKey = '') {
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

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /mcp' }));
      return;
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
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  server.listen(port, host, () => {
    console.log(`Spotify MCP server running at http://${host}:${port}/mcp`);
  });

  return server;
}
