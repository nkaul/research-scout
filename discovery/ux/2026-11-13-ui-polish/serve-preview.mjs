// Local, read-only server for this standalone design review. No app/API proxy.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.SCOUT_PREVIEW_PORT || 3133);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.');
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep) || !types[path.extname(target)]) { res.writeHead(404); res.end(); return; }
    const file = await fs.readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)], 'Content-Length': file.length });
    res.end(req.method === 'HEAD' ? undefined : file);
  } catch { res.writeHead(404); res.end('Preview file not found.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Research Scout mockups: http://127.0.0.1:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
