import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const distRoot = path.resolve('apps/client/dist');
const indexPath = path.join(distRoot, 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('Production Web export is missing. Run the client build first.');
}

const index = fs.readFileSync(indexPath, 'utf8');
const entryPath = index.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]?.replace(/^\//, '');
if (!entryPath || !fs.existsSync(path.join(distRoot, entryPath))) {
  throw new Error('Production Web entry script is missing from the export.');
}

const server = http.createServer((request, response) => {
  const relative = request.url === '/' ? 'index.html' : (request.url ?? '').replace(/^\//, '');
  const target = path.resolve(distRoot, relative);
  if (!target.startsWith(`${distRoot}${path.sep}`) || !fs.existsSync(target)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': target.endsWith('.js') ? 'text/javascript' : 'text/html' });
  fs.createReadStream(target).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Web smoke server did not bind.');
  const origin = `http://127.0.0.1:${address.port}`;
  const [page, entry] = await Promise.all([fetch(`${origin}/`), fetch(`${origin}/${entryPath}`)]);
  if (!page.ok || !entry.ok) throw new Error('Production Web export did not serve its shell and entry.');
  const [pageBody] = await Promise.all([page.text(), entry.arrayBuffer()]);
  if (!pageBody.includes('<title>Molokh</title>')) {
    throw new Error('Production Web shell does not contain the Molokh title.');
  }
  console.log(`Production Web smoke passed: / and /${entryPath}`);
} finally {
  server.closeIdleConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
