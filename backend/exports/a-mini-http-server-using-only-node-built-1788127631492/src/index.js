const http = require('http');
const { parse } = require('url');

/**
 * A simple web server that handles routes and provides a basic 
 * routing system.
 */
class SimpleServer {
  constructor() {
    this.routes = [];
     this.port = 3000;
     this.host = 'localhost';
  }
  
  /**
   * Adds a route to the server.
   * @param {string} method - The HTTP method (e.g., 'GET', 'POST').
   * @param {string} path - The URL path.
   * @param {Function} handler - A function that handles the request.
   */
  route(method, path, handler) {
    this.routes.push({ method, path, handler });
  }
  
  /**
   * Starts the server and listens for requests.
   * @param {Function} reqHandler - A function that takes (req, res) and handles the request.
   */
  listen(reqHandler) {
    const server = http.createServer((req, Res) => {
      const path = parse(Req.url).pathname;
      const method = Req.method;
      
      const route = this.routes.find(r => r.path === path && r.method === method);
      
      if (route) {
        return route.handler(Req, Res);
      } else {
        // Default fallback if no route is found
        return (Req, Res) => {
          Res.writeHead(404);
          Res.send('Page Not Found');
        });
      }
    });
  
    server.listen(this.port, this.host);
    console.log(`Server running at ${this.host}:${this.port}`);
  });
  
  /**
   * Helper function to add a route and start the server.
   * @param {number} port - The port number.
   * @param {string} host - The hostname.
   * @param {Function} ReqHandler - The function to handle the request.
   */
  start(port, host, ReqHandler) {
    this.port = port;
    this.host = host;
    this.listen(ReqHandler);
  }
}

const app = new SimpleServer();

 // Example Usage:
 // app.route('GET', '/', (req, res) => {
 //   res.send('Hello World!');
 // });
 // app.start(3000, 'localhost');

 module.exports = app;