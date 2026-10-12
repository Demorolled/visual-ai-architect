import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as express from 'express';

const PORT = 3000;
const PROXY_TARGET = 'http://localhost:5000';

const app = express();

app.use(express.static(path.join(__dirname, '../frontend/build')));
app.use(express.json());

app.get('*', async (req, res) => {
  try {
    const indexHtml = await fs.readFile(path.join(__dirname, '../frontend/build/index.html'), 'utf-8');
    res.send(indexHtml);
  } catch (err) {
    res.status(500).send('Internal Server Error');
  }
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const proxy = new httpProxy.HttpProxyFactory({
  changeOrigin: true,
  target: {
    host: 'localhost',
    port: 5000,
  },
});

app.all('/api/*', (req, res) => {
  proxy.proxy(req, res);
});