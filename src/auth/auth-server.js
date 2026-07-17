import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = path.join(__dirname, '..', '..', '.certs');

function generateSelfSignedCert(hostname) {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
  }

  const keyPath = path.join(CERT_DIR, `${hostname}.key`);
  const certPath = path.join(CERT_DIR, `${hostname}.crt`);

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  // Generate self-signed cert with openssl
  const san = hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
    ? `IP:${hostname}`
    : `DNS:${hostname}`;

  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes ` +
    `-keyout "${keyPath}" -out "${certPath}" ` +
    `-days 365 -subj "/CN=${hostname}" ` +
    `-addext "subjectAltName=${san}"`,
    { stdio: 'ignore' }
  );

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

export function startAuthServer(redirectUri) {
  const parsed = new URL(redirectUri);
  const port = parseInt(parsed.port, 10) || 3080;
  const pathname = parsed.pathname || '/callback';
  const useHttps = parsed.protocol === 'https:';

  // If redirect points to a non-localhost address, listen on all interfaces
  const host = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    ? '127.0.0.1'
    : '0.0.0.0';

  const handleRequest = (req, res) => {
    const url = new URL(req.url, `http://${parsed.hostname}:${port}`);

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
  };

  let server;
  let resolve, reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;

    if (useHttps) {
      const { key, cert } = generateSelfSignedCert(parsed.hostname);
      server = https.createServer({ key, cert }, handleRequest);
    } else {
      server = http.createServer(handleRequest);
    }

    server.listen(port, host, () => {
      const proto = useHttps ? 'https' : 'http';
      console.log(`  OAuth callback server listening on ${proto}://${host}:${port}`);
      if (useHttps) {
        console.log(`  (using self-signed certificate for ${parsed.hostname})`);
      }
    });
  });

  setTimeout(() => {
    server.close();
    reject(new Error('OAuth callback timed out after 5 minutes'));
  }, 5 * 60 * 1000);

  return promise;
}
