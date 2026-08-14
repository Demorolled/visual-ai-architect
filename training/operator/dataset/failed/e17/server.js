const http = require('http');
const crypto = require('crypto');

const cache = new Map(); // code -> original url

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST' && req.url === '/api/shorten') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let url = '';
      try { url = JSON.parse(body).url || ''; } catch (e) { url = ''; }
      if (!url) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing URL' })); }
      const code = crypto.randomBytes(3).toString('hex').slice(0, 6);
      cache.set(code, url);
      res.end(JSON.stringify({ code }));
    });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/')) {
    const code = req.url.slice('/api/'.length);
    const target = cache.get(code);
    if (target) {
      res.writeHead(302, { Location: target });
      return res.end();
    }
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Not found' }));
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(process.env.PORT || 3000, () => {
  console.log('listening on', process.env.PORT || 3000);
});
