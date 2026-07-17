import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

export function startAuthServer(redirectUri) {
  const parsed = new URL(redirectUri);
  const port = parseInt(parsed.port, 10) || 3080;
  const pathname = parsed.pathname || '/callback';

  // Always listen on all interfaces (needed for cloudflared tunnel)
  const host = '0.0.0.0';

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);

      if (url.pathname === pathname) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
          server.close();
          resolve(code);
          return;
        }
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(port, host, () => {
      console.log(`  OAuth callback server listening on http://${host}:${port}`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}
