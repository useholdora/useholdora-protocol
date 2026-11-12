// Tiny static server for local checks: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
createServer((req, res) => {
  let p = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(Number(process.argv[2]) || 4173, '127.0.0.1');
