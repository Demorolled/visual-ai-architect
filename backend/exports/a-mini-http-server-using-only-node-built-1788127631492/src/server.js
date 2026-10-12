/**
 * Simple HTTP server implementation using Node.js built-in 'http' module.
 * This module provides a way to create a server that handles requests and manages routes.
 */

import http from 'node:http';

/**
 * A simple HTTP server class that wraps the Node.js 'http' module.
 * It provides methods to handle routing and configuration.
 */
export class Server {
  constructor(options) {
    this.port = options.port || 3000;
    this.hostname = options.hostname || 'localhost';
    this.routes = [];

    this.server = http.createServer();
  }

  /**
   * Adds a route to the server.
   * @param {string} path - The URL path.
   * @param {Function} handler - The function to handle the request.
   */
  route(path, handler) {
    this.routes.push({ path, handler });
  }

  /**
   * Starts the server and listens for requests.
   * @returns {Promise<Function>} The request handler function.
   */
  listen() {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.hostname, () => {
        console.log(`Server running at http://${this.hostname}:${this.port}`);
      });
      
      this.server.on('request', (req, res) => {
        const route = this.routes.find(r => r.path === req.url);
         if (route) {
          route.handler(req, res);
        }
      });
      
      resolve(this.server);
    });
  }

  /**
   * Helper method to get the raw server instance.
   * @returns {Object}
   */
  getRawServer() {
    return this.server;
  }
}

export default Server;