import http from 'http';
import yargs from 'yargs';

const argv = yargs(process.argv.slice(2))
  .usage('$0 [options]')
  .option('p', {
    alias: 'port',
    type: 'number',
    default: 3000,
    description: 'Port number to listen on'
  })
  .option('h', {
    alias: 'hostname',
    type: 'string',
    default: '127.0.0.1',
    description: 'Hostname to listen on'
  })
  .help()
  .parse();

const hostname = argv.hostname;
const port = argv.port;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World\n');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});