'use strict';

/**
 * @fileoverview Database connection manager with pooling, retry strategy, and health monitoring
 * @module shared/lib/database/connection-manager
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/config
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const config = require('../../config');

/**
 * @class ConnectionManager
 * @description Manages database connections with pooling, retry logic, and health monitoring
 */
class ConnectionManager {
  /**
   * @private
   * @static
   * @readonly
   */
  static #CONNECTION_STATES = {
    DISCONNECTED: 0,
    CONNECTED: 1,
    CONNECTING: 2,
    DISCONNECTING: 3,
    UNINITIALIZED: 99
  };

  static #RETRY_OPTIONS = {
    maxRetries: 5,
    retryDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 30000
  };

  static #DEFAULT_OPTIONS = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    family: 4,
    retryWrites: true,
    w: 'majority'
  };

  static #connections = new Map();
  static #healthCheckIntervals = new Map();
  static #connectionStats = new Map();

  /**
   * Establishes a database connection with retry logic
   * @static
   * @async
   * @param {string} [connectionName='default'] - Connection identifier
   * @param {Object} [options={}] - Connection options
   * @param {string} [options.uri] - MongoDB connection URI
   * @param {Object} [options.mongoOptions={}] - MongoDB-specific options
   * @param {boolean} [options.enableHealthCheck=true] - Enable health monitoring
   * @param {number} [options.healthCheckInterval=30000] - Health check interval in ms
   * @param {Object} [options.retryOptions={}] - Retry configuration
   * @returns {Promise<mongoose.Connection>} Database connection
   * @throws {AppError} If connection fails after all retries
   */
  static async connect(connectionName = 'default', options = {}) {
    try {
      const {
        uri = config.database.uri,
        mongoOptions = {},
        enableHealthCheck = true,
        healthCheckInterval = 30000,
        retryOptions = {}
      } = options;

      if (!uri) {
        throw new AppError('Database URI is required', 400, 'INVALID_CONNECTION_CONFIG');
      }

      // Check if connection already exists and is active
      const existingConnection = ConnectionManager.#connections.get(connectionName);
      if (existingConnection && existingConnection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
        logger.info('Reusing existing database connection', { connectionName });
        return existingConnection;
      }

      // Merge options
      const finalOptions = {
        ...ConnectionManager.#DEFAULT_OPTIONS,
        ...mongoOptions
      };

      const finalRetryOptions = {
        ...ConnectionManager.#RETRY_OPTIONS,
        ...retryOptions
      };

      // Initialize connection stats
      ConnectionManager.#connectionStats.set(connectionName, {
        attempts: 0,
        lastAttempt: null,
        lastSuccess: null,
        lastError: null,
        totalConnections: 0,
        totalDisconnections: 0
      });

      // Attempt connection with retry logic
      const connection = await ConnectionManager.#connectWithRetry(
        connectionName,
        uri,
        finalOptions,
        finalRetryOptions
      );

      // Store connection
      ConnectionManager.#connections.set(connectionName, connection);

      // Setup event handlers
      ConnectionManager.#setupEventHandlers(connectionName, connection);

      // Start health check if enabled
      if (enableHealthCheck) {
        ConnectionManager.#startHealthCheck(connectionName, healthCheckInterval);
      }

      // Update stats
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      stats.lastSuccess = new Date().toISOString();
      stats.totalConnections++;

      logger.info('Database connection established successfully', {
        connectionName,
        poolSize: finalOptions.maxPoolSize,
        healthCheck: enableHealthCheck
      });

      return connection;

    } catch (error) {
      logger.error('Failed to establish database connection', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Database connection failed',
        500,
        'CONNECTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Disconnects from database
   * @static
   * @async
   * @param {string} [connectionName='default'] - Connection identifier
   * @param {boolean} [force=false] - Force close connections
   * @returns {Promise<void>}
   * @throws {AppError} If disconnection fails
   */
  static async disconnect(connectionName = 'default', force = false) {
    try {
      const connection = ConnectionManager.#connections.get(connectionName);
      
      if (!connection) {
        logger.warn('No connection found to disconnect', { connectionName });
        return;
      }

      // Stop health check
      ConnectionManager.#stopHealthCheck(connectionName);

      // Close connection
      await connection.close(force);

      // Remove from connections map
      ConnectionManager.#connections.delete(connectionName);

      // Update stats
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.totalDisconnections++;
      }

      logger.info('Database connection closed', { connectionName, forced: force });

    } catch (error) {
      logger.error('Failed to disconnect from database', error);

      throw new AppError(
        'Database disconnection failed',
        500,
        'DISCONNECTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Disconnects all active connections
   * @static
   * @async
   * @param {boolean} [force=false] - Force close connections
   * @returns {Promise<void>}
   */
  static async disconnectAll(force = false) {
    const disconnectPromises = Array.from(ConnectionManager.#connections.keys())
      .map(connectionName => ConnectionManager.disconnect(connectionName, force));

    await Promise.all(disconnectPromises);
    
    logger.info('All database connections closed');
  }

  /**
   * Gets a specific connection
   * @static
   * @param {string} [connectionName='default'] - Connection identifier
   * @returns {mongoose.Connection|null} Database connection or null
   */
  static getConnection(connectionName = 'default') {
    return ConnectionManager.#connections.get(connectionName) || null;
  }

  /**
   * Gets all active connections
   * @static
   * @returns {Map<string, mongoose.Connection>} All connections
   */
  static getAllConnections() {
    return new Map(ConnectionManager.#connections);
  }

  /**
   * Checks connection health
   * @static
   * @async
   * @param {string} [connectionName='default'] - Connection identifier
   * @returns {Promise<Object>} Health status
   */
  static async checkHealth(connectionName = 'default') {
    try {
      const connection = ConnectionManager.#connections.get(connectionName);
      
      if (!connection) {
        return {
          status: 'disconnected',
          connectionName,
          message: 'No active connection found'
        };
      }

      const state = connection.readyState;
      const stateMap = {
        [ConnectionManager.#CONNECTION_STATES.DISCONNECTED]: 'disconnected',
        [ConnectionManager.#CONNECTION_STATES.CONNECTED]: 'connected',
        [ConnectionManager.#CONNECTION_STATES.CONNECTING]: 'connecting',
        [ConnectionManager.#CONNECTION_STATES.DISCONNECTING]: 'disconnecting'
      };

      const health = {
        status: stateMap[state] || 'unknown',
        connectionName,
        readyState: state,
        host: connection.host,
        port: connection.port,
        name: connection.name
      };

      // Perform ping if connected
      if (state === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
        const startTime = Date.now();
        await connection.db.admin().ping();
        health.pingTime = Date.now() - startTime;
        health.healthy = true;
      } else {
        health.healthy = false;
      }

      // Add stats if available
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        health.stats = {
          totalConnections: stats.totalConnections,
          totalDisconnections: stats.totalDisconnections,
          lastSuccess: stats.lastSuccess,
          lastError: stats.lastError
        };
      }

      return health;

    } catch (error) {
      logger.error('Health check failed', error);

      return {
        status: 'error',
        connectionName,
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Gets connection statistics
   * @static
   * @param {string} [connectionName='default'] - Connection identifier
   * @returns {Object|null} Connection statistics
   */
  static getConnectionStats(connectionName = 'default') {
    return ConnectionManager.#connectionStats.get(connectionName) || null;
  }

  /**
   * Creates a new connection instance without storing it
   * @static
   * @async
   * @param {string} uri - MongoDB connection URI
   * @param {Object} [options={}] - Connection options
   * @returns {Promise<mongoose.Connection>} New connection instance
   * @throws {AppError} If connection creation fails
   */
  static async createConnection(uri, options = {}) {
    try {
      if (!uri) {
        throw new AppError('Database URI is required', 400, 'INVALID_URI');
      }

      const finalOptions = {
        ...ConnectionManager.#DEFAULT_OPTIONS,
        ...options
      };

      const connection = mongoose.createConnection(uri, finalOptions);

      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        connection.once('connected', resolve);
        connection.once('error', reject);
      });

      logger.info('New database connection created');

      return connection;

    } catch (error) {
      logger.error('Failed to create connection', error);

      throw new AppError(
        'Connection creation failed',
        500,
        'CREATE_CONNECTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Connects with retry logic
   * @static
   * @async
   * @param {string} connectionName - Connection name
   * @param {string} uri - MongoDB URI
   * @param {Object} mongoOptions - MongoDB options
   * @param {Object} retryOptions - Retry options
   * @returns {Promise<mongoose.Connection>} Database connection
   * @throws {AppError} If all retries fail
   */
  static async #connectWithRetry(connectionName, uri, mongoOptions, retryOptions) {
    const stats = ConnectionManager.#connectionStats.get(connectionName);
    let lastError;
    let delay = retryOptions.retryDelay;

    for (let attempt = 1; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        stats.attempts++;
        stats.lastAttempt = new Date().toISOString();

        logger.info(`Attempting database connection (attempt ${attempt}/${retryOptions.maxRetries})`, {
          connectionName
        });

        const connection = await mongoose.createConnection(uri, mongoOptions).asPromise();

        return connection;

      } catch (error) {
        lastError = error;
        stats.lastError = {
          message: error.message,
          timestamp: new Date().toISOString(),
          attempt
        };

        logger.warn(`Database connection attempt ${attempt} failed`, {
          connectionName,
          error: error.message,
          nextRetryIn: attempt < retryOptions.maxRetries ? delay : null
        });

        if (attempt < retryOptions.maxRetries) {
          await ConnectionManager.#delay(delay);
          delay = Math.min(delay * retryOptions.backoffMultiplier, retryOptions.maxDelay);
        }
      }
    }

    throw new AppError(
      'Database connection failed after all retries',
      500,
      'CONNECTION_RETRY_EXHAUSTED',
      {
        attempts: stats.attempts,
        lastError: lastError.message
      }
    );
  }

  /**
   * @private
   * Sets up connection event handlers
   * @static
   * @param {string} connectionName - Connection name
   * @param {mongoose.Connection} connection - Database connection
   */
  static #setupEventHandlers(connectionName, connection) {
    connection.on('connected', () => {
      logger.info('Database connected', { connectionName });
    });

    connection.on('disconnected', () => {
      logger.warn('Database disconnected', { connectionName });
      
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.totalDisconnections++;
      }
    });

    connection.on('error', (error) => {
      logger.error('Database connection error', {
        connectionName,
        error: error.message
      });

      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.lastError = {
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    });

    connection.on('reconnected', () => {
      logger.info('Database reconnected', { connectionName });
      
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.totalConnections++;
        stats.lastSuccess = new Date().toISOString();
      }
    });

    connection.on('close', () => {
      logger.info('Database connection closed', { connectionName });
    });
  }

  /**
   * @private
   * Starts health check monitoring
   * @static
   * @param {string} connectionName - Connection name
   * @param {number} interval - Check interval in ms
   */
  static #startHealthCheck(connectionName, interval) {
    // Clear existing interval if any
    ConnectionManager.#stopHealthCheck(connectionName);

    const intervalId = setInterval(async () => {
      const health = await ConnectionManager.checkHealth(connectionName);
      
      if (!health.healthy && health.status === 'connected') {
        logger.error('Database health check failed', {
          connectionName,
          health
        });
      }
    }, interval);

    ConnectionManager.#healthCheckIntervals.set(connectionName, intervalId);

    logger.info('Health check monitoring started', {
      connectionName,
      interval
    });
  }

  /**
   * @private
   * Stops health check monitoring
   * @static
   * @param {string} connectionName - Connection name
   */
  static #stopHealthCheck(connectionName) {
    const intervalId = ConnectionManager.#healthCheckIntervals.get(connectionName);
    
    if (intervalId) {
      clearInterval(intervalId);
      ConnectionManager.#healthCheckIntervals.delete(connectionName);
      
      logger.info('Health check monitoring stopped', { connectionName });
    }
  }

  /**
   * @private
   * Delays execution
   * @static
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  static #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Executes a transaction across the connection
   * @static
   * @async
   * @param {Function} callback - Transaction callback
   * @param {string} [connectionName='default'] - Connection identifier
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<*>} Transaction result
   * @throws {AppError} If transaction fails
   */
  static async executeTransaction(callback, connectionName = 'default', options = {}) {
    const connection = ConnectionManager.getConnection(connectionName);
    
    if (!connection) {
      throw new AppError('No active connection found', 400, 'NO_CONNECTION');
    }

    const session = await connection.startSession();

    try {
      const result = await session.withTransaction(callback, options);
      
      logger.info('Transaction completed successfully', { connectionName });
      
      return result;

    } catch (error) {
      logger.error('Transaction failed', error);

      throw new AppError(
        'Transaction execution failed',
        500,
        'TRANSACTION_ERROR',
        { originalError: error.message }
      );

    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets database instance from connection
   * @static
   * @param {string} [connectionName='default'] - Connection identifier
   * @param {string} [dbName] - Database name (optional)
   * @returns {mongoose.Db|null} Database instance
   */
  static getDatabase(connectionName = 'default', dbName) {
    const connection = ConnectionManager.getConnection(connectionName);
    
    if (!connection) {
      return null;
    }

    return dbName ? connection.useDb(dbName) : connection.db;
  }

  /**
   * Clears all connection data (for testing)
   * @static
   */
  static clearAll() {
    ConnectionManager.#connections.clear();
    ConnectionManager.#connectionStats.clear();
    
    // Clear all health check intervals
    ConnectionManager.#healthCheckIntervals.forEach(intervalId => {
      clearInterval(intervalId);
    });
    ConnectionManager.#healthCheckIntervals.clear();

    logger.info('All connection data cleared');
  }
}

module.exports = ConnectionManager;