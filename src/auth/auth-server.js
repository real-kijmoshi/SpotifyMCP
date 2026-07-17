import http from 'node:http';
import { URL } from 'node:url';
import net from 'node:net';

function isPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => { tester.close(() => resolve(true)); })
      .listen(port, host);
  });
}

export function startAuthServer(redirectUri) {
  const parsed = new URL(redirectUri);
  const port = parseInt(parsed.port, 10) || 3080;
  const pathname = parsed.pathname || '/callback';

  let resolveCallback, rejectCallback;
  const promise = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((req, res) => {
    const remoteAddr = req.socket.remoteAddress || 'unknown';
    console.log(`[auth] >>> ${req.method} ${req.url} from ${remoteAddr}`);
    console.log(`[auth]     headers: ${JSON.stringify(req.headers)}`);

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    // Health check — useful for verifying the server is reachable
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port, pathname }));
      console.log(`[auth]     /health -> 200`);
      return;
    }

    if (url.pathname === pathname || url.pathname === pathname.replace(/\/$/, '')) {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        console.log(`[auth]     OAuth error: ${error}`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
        server.close();
        rejectCallback(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        console.log(`[auth]     Success! Got code on exact path match.`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolveCallback(code);
        return;
      }

      console.log(`[auth]     Matched path ${url.pathname} but no code param`);
    }

    // Fallback — catch any request with a code parameter
    const code = url.searchParams.get('code');
    if (code) {
      console.log(`[auth]     Fallback: got code on path ${url.pathname}`);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
      server.close();
      resolveCallback(code);
      return;
    }

    console.log(`[auth]     404 for path: ${url.pathname}, search: ${url.search}`);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  return new Promise(async (resolve) => {
    const available = await isPortAvailable(port);
    if (!available) {
      console.log(`[auth] WARNING: Port ${port} may already be in use!`);
    }

    server.listen(port, '0.0.0.0', () => {
      console.log(`[auth] Server listening on http://0.0.0.0:${port}`);
      console.log(`[auth] Expected pathname: "${pathname}"`);
      resolve({ server, promise });
    });

    server.on('error', (err) => {
      console.error(`[auth] Server error:`, err.message);
      rejectCallback(err);
    });

    setTimeout(() => {
      server.close();
      rejectCallback(new Error('OAuth callback timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}
