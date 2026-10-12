/**
 * A simple HTTP server implementation using Node.js built-in modules.
 * It handles the low-level communication between client and server.
 */

import { EventEmitter } from 'events';

/**
 * Represents a server instance that manages connections and handles requests.
 * 
 * @param {Object} request - The incoming request object.
 * @param {Function} requestHandler - A function that processes the request and returns a response.
 * @returns {Object} An object containing the server instance.
 */
class Server {
  constructor(request,
    /**
     * The function that handles the incoming request.
     * @param {Object} req - The request object.
     * @param {Function} res - The response function.
     * @returns {Promise<any>} A promise that resolves with the response.
     */
    requestHandler)
    {
    this.request = request;
    this.requestHandler = requestHandler;
    this.connections = [];
  }

  /**
   * Starts the server and listens for requests on a specific port.
   * @param {number} port - The port number.
   * @param {string} host - The hostname.
   */
  listen(port, host)
    {
    this.port = port;
    this.host = host;
    this.server = 
      require('http').createServer();
    
    this.server.listen(port, host);
    }

  /**
   * Handles a single connection.