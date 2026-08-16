const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const docsDir = path.resolve(__dirname, '..', 'docs');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4174);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}`);
    if (url.pathname === '/') {
      response.writeHead(302, { location: '/myshipu/' });
      response.end();
      return;
    }
    if (request.method !== 'GET' || !url.pathname.startsWith('/myshipu/')) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const decoded = decodeURIComponent(url.pathname.slice('/myshipu/'.length));
    if (decoded.includes('..') || decoded.includes('\\')) throw new Error('Unsafe path');
    const relative = decoded || 'index.html';
    const file = path.resolve(docsDir, relative);
    if (!file.startsWith(`${docsDir}${path.sep}`)) throw new Error('Unsafe path');
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-store',
    });
    fs.createReadStream(file).pipe(response);
  } catch (_) {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Mingyuan static preview: http://${host}:${port}/myshipu/`);
});
