import { startServer } from '../src/app';
import http from 'http';

const PORT = 3000;

let server: http.Server;

beforeEach((done) => {
  server = startServer(PORT, () => {
    done();
  });
});

afterEach((done) => {
  server.close(done);
});

test('Server starts and listens on the correct port', (done) => {
  const request = http.request({ port: PORT }, (res) => {
    expect(res.statusCode).toBe(200);
    done();
  });
  request.end();
});