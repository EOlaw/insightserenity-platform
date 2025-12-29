/**
 * @fileoverview WebSocket Server
 * @module servers/admin-server/websockets/websocket-server
 * @description Main WebSocket server setup for real-time communications
 * @version 1.0.0
 */

'use strict';

const { Server } = require('socket.io');
const { getLogger } = require('../../../shared/lib/utils/logger');
const { TokenService } = require('../modules/user-management-system/authentication/services');
const AdminSession = require('../../../shared/lib/database/models/admin-server/admin-session');

const logger = getLogger({ serviceName: 'websocket-server' });

/**
 * WebSocket Server Class
 * @class WebSocketServer
 * @description Manages WebSocket connections and real-time events
 */
class WebSocketServer {
  /**
   * @private
   * @static
   * @type {Server} Socket.IO server instance
   */
  static #io = null;

  /**
   * @private
   * @static
   * @type {Map<string, Set<string>>} User to socket ID mappings
   */
  static #userSockets = new Map();

  /**
   * Initialize WebSocket server
   * @param {Object} httpServer - HTTP server instance
   * @param {Object} options - Socket.IO options
   * @static
   * @public
   */
  static initialize(httpServer, options = {}) {
    logger.info('Initializing WebSocket server');

    this.#io = new Server(httpServer, {
      cors: {
        origin: process.env.ADMIN_PORTAL_URL || '*',
        credentials: true
      },
      ...options
    });

    // Authentication middleware
    this.#io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify JWT token
        const decoded = TokenService.verifyAccessToken(token);

        // Validate session
        const session = await AdminSession.findOne({
          sessionId: decoded.sessionId,
          isActive: true
        }).populate('adminUser', 'firstName lastName email role');

        if (!session) {
          return next(new Error('Invalid or expired session'));
        }

        // Attach user info to socket
        socket.userId = decoded.sub;
        socket.userEmail = decoded.email;
        socket.userRole = decoded.role;
        socket.sessionId = decoded.sessionId;
        socket.user = session.adminUser;

        logger.info('WebSocket authenticated', {
          userId: socket.userId,
          email: socket.userEmail,
          socketId: socket.id
        });

        next();
      } catch (error) {
        logger.error('WebSocket authentication failed', {
          error: error.message,
          socketId: socket.id
        });
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.#io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Handle new WebSocket connection
   * @param {Object} socket - Socket instance
   * @static
   * @private
   */
  static handleConnection(socket) {
    const userId = socket.userId;

    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId,
      email: socket.userEmail
    });

    // Track user's sockets
    if (!this.#userSockets.has(userId)) {
      this.#userSockets.set(userId, new Set());
    }
    this.#userSockets.get(userId).add(socket.id);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Join role-based room
    socket.join(`role:${socket.userRole}`);

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to admin server',
      socketId: socket.id,
      user: {
        id: socket.user._id,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName,
        email: socket.user.email,
        role: socket.user.role
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId,
        reason
      });

      // Remove from tracking
      const userSocketSet = this.#userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        if (userSocketSet.size === 0) {
          this.#userSockets.delete(userId);
        }
      }
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        userId,
        error: error.message
      });
    });
  }

  /**
   * Send notification to specific user
   * @param {string} userId - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @static
   * @public
   */
  static sendToUser(userId, event, data) {
    if (!this.#io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.#io.to(`user:${userId}`).emit(event, data);

    logger.debug('Event sent to user', {
      userId,
      event,
      socketCount: this.#userSockets.get(userId)?.size || 0
    });
  }

  /**
   * Send notification to all users with specific role
   * @param {string} role - User role
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @static
   * @public
   */
  static sendToRole(role, event, data) {
    if (!this.#io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.#io.to(`role:${role}`).emit(event, data);

    logger.debug('Event sent to role', { role, event });
  }

  /**
   * Broadcast to all connected clients
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @static
   * @public
   */
  static broadcast(event, data) {
    if (!this.#io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.#io.emit(event, data);

    logger.debug('Event broadcast to all clients', { event });
  }

  /**
   * Get connected user count
   * @returns {number} Number of connected users
   * @static
   * @public
   */
  static getConnectedUserCount() {
    return this.#userSockets.size;
  }

  /**
   * Get user's socket count
   * @param {string} userId - User ID
   * @returns {number} Number of sockets for user
   * @static
   * @public
   */
  static getUserSocketCount(userId) {
    return this.#userSockets.get(userId)?.size || 0;
  }

  /**
   * Check if user is connected
   * @param {string} userId - User ID
   * @returns {boolean} True if user is connected
   * @static
   * @public
   */
  static isUserConnected(userId) {
    return this.#userSockets.has(userId);
  }

  /**
   * Get server instance
   * @returns {Server} Socket.IO server instance
   * @static
   * @public
   */
  static getIO() {
    return this.#io;
  }

  /**
   * Disconnect all users (for shutdown)
   * @static
   * @public
   */
  static disconnectAll() {
    if (this.#io) {
      logger.info('Disconnecting all WebSocket clients');
      this.#io.disconnectSockets(true);
      this.#userSockets.clear();
    }
  }
}

module.exports = WebSocketServer;
