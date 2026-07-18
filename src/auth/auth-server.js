import http from 'node:http';
import { URL } from 'node:url';

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
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port, pathname }));
      return;
    }

    if (url.pathname === pathname || url.pathname === pathname.replace(/\/$/, '')) {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
        server.close();
        rejectCallback(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolveCallback(code);
        return;
      }
    }

    // Fallback — catch any request with a code parameter
    const code = url.searchParams.get('code');
    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
      server.close();
      resolveCallback(code);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      resolve({ server, promise });
    });

    server.on('error', (err) => {
      rejectCallback(err);
    });

    setTimeout(() => {
      server.close();
      rejectCallback(new Error('OAuth callback timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}
