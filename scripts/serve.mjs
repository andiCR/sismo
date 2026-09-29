/* Minimal static file server for local development: `npm run dev` (http://localhost:8123/).
   Options: --port 8080, --root _site (serve the built site, share pages included).
   Folder URLs get index.html and unknown paths get the root's 404.html, like GitHub Pages. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values: args } = parseArgs({ options: { port: { type: 'string', default: '8123' }, root: { type: 'string', default: '.' } } });
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', args.root);
const PORT = Number(args.port);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

async function send(req, res, file, status = 200) {
  const body = await fs.readFile(file);
  res.writeHead(status, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const isFile = (file) => fs.stat(file).then((s) => s.isFile(), () => false);
const isDir = (file) => fs.stat(file).then((s) => s.isDirectory(), () => false);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
    if (await isDir(file)) {
      if (!url.pathname.endsWith('/')) return res.writeHead(301, { Location: url.pathname + '/' + url.search }).end();
      if (await isFile(path.join(file, 'index.html'))) return await send(req, res, path.join(file, 'index.html'));
    } else if (await isFile(file)) {
      return await send(req, res, file);
    }
    const notFound = path.join(ROOT, '404.html');
    if (await isFile(notFound)) return await send(req, res, notFound, 404);
    res.writeHead(404).end();
  } catch (err) {
    console.warn(req.url, err.message);
    if (!res.headersSent) res.writeHead(err instanceof URIError ? 400 : 500);
    res.end();
  }
});

server.on('error', (err) => {
  // Windows reserves some port ranges (5173 on some machines) and reports them as EACCES.
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') console.error(`Port ${PORT} is unavailable (${err.code}). Try: npm run dev -- --port 8124`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => console.log(`Serving ${ROOT} at http://localhost:${PORT}/  (Ctrl+C to stop)`));
