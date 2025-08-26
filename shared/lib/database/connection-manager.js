'use strict';

/**
 * @fileoverview Database connection manager with pooling, retry strategy, health monitoring, and multi-database support
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
 * @description Manages database connections with pooling, retry logic, health monitoring, and multi-database architecture support
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
  static #databaseConnections = new Map();
  static #tenantConnections = new Map();
  
  // ENHANCED: Multi-database architecture support
  static #databaseTypeMapping = new Map();
  static #collectionToDatabase = new Map();
  static #databasePurposes = new Map();

  /**
   * ENHANCED: Initialize database type mappings for multi-database architecture
   */
  static initializeDatabaseMappings() {
    try {
      // Define database purposes and their collection mappings
      const databaseMappings = {
        admin: {
          purpose: 'Administrative operations, user management, system configuration',
          collections: [
            'users', 'user_profiles', 'user_activities', 'login_history',
            'roles', 'permissions', 'organizations', 'organization_members',
            'organization_invitations', 'tenants', 'system_configurations',
            'security_incidents', 'sessions', 'configuration_management'
          ]
        },
        shared: {
          purpose: 'Shared resources, common data, cross-tenant information',
          collections: [
            'subscription_plans', 'features', 'system_settings',
            'webhooks', 'api_integrations', 'notifications',
            'oauth_providers', 'passkeys'
          ]
        },
        audit: {
          purpose: 'Audit trails, compliance logging, security monitoring',
          collections: [
            'audit_logs', 'audit_alerts', 'audit_exports',
            'audit_retention_policies', 'compliance_mappings',
            'data_breaches', 'erasure_logs', 'processing_activities'
          ]
        },
        analytics: {
          purpose: 'Analytics data, usage metrics, performance tracking',
          collections: [
            'api_usage', 'usage_records', 'performance_metrics',
            'user_analytics', 'system_metrics'
          ]
        }
      };

      // Store database purposes
      for (const [dbType, config] of Object.entries(databaseMappings)) {
        ConnectionManager.#databasePurposes.set(dbType, config);
        
        // Map collections to their respective databases
        for (const collection of config.collections) {
          ConnectionManager.#collectionToDatabase.set(collection, dbType);
        }
      }

      logger.info('Database mappings initialized', {
        databaseTypes: Object.keys(databaseMappings),
        totalCollections: ConnectionManager.#collectionToDatabase.size
      });

    } catch (error) {
      logger.error('Failed to initialize database mappings', { error: error.message });
    }
  }

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
   * ENHANCED: Initializes multiple database connections based on configuration with complete collection mapping
   * @static
   * @async
   * @param {Object} [databaseConfig=config.database] - Database configuration
   * @param {Object} [options={}] - Connection options
   * @returns {Promise<Object>} Object containing all established connections
   * @throws {AppError} If any database connection fails
   */
  static async initializeMultipleDatabases(databaseConfig = config.database, options = {}) {
    try {
      logger.info('Initializing multiple database connections with collection mapping');

      // Initialize database mappings first
      ConnectionManager.initializeDatabaseMappings();

      const connections = {};
      const baseUri = databaseConfig.uri.replace(/\/[^/?]+(\?.*)?$/, '');
      
      // Get database configuration from environment/config
      const databaseNames = databaseConfig.databases || {
        admin: process.env.DB_NAME_ADMIN || 'insightserenity_dev_admin',
        shared: process.env.DB_NAME_SHARED || 'insightserenity_dev_shared', 
        audit: process.env.DB_NAME_AUDIT || 'insightserenity_dev_audit',
        analytics: process.env.DB_NAME_ANALYTICS || 'insightserenity_dev_analytics'
      };

      // Remove tenantPrefix from direct connection as it's handled separately
      const { tenantPrefix, ...directDatabases } = databaseNames;
      
      // Initialize connections for each configured database
      for (const [dbType, dbName] of Object.entries(directDatabases)) {
        try {
          const connectionName = `${dbType}_connection`;
          const dbUri = `${baseUri}/${dbName}`;
          
          logger.info(`Connecting to ${dbType} database`, { 
            connectionName, 
            database: dbName 
          });

          const connection = await ConnectionManager.connect(connectionName, {
            uri: dbUri,
            mongoOptions: {
              ...databaseConfig.options,
              ...options.mongoOptions
            },
            enableHealthCheck: options.enableHealthCheck !== false,
            healthCheckInterval: options.healthCheckInterval || 30000,
            retryOptions: options.retryOptions || {}
          });

          connections[dbType] = connection;
          ConnectionManager.#databaseConnections.set(dbType, connection);

          // ENHANCED: Map database type to connection name for routing
          ConnectionManager.#databaseTypeMapping.set(dbType, connectionName);

          // ENHANCED: Verify collections and setup collection routing
          await ConnectionManager.#setupCollectionRouting(dbType, connection);

          logger.info(`Successfully connected to ${dbType} database`, {
            connectionName,
            database: dbName,
            readyState: connection.readyState,
            collectionsConfigured: ConnectionManager.#databasePurposes.get(dbType)?.collections?.length || 0
          });

        } catch (error) {
          logger.error(`Failed to connect to ${dbType} database`, {
            database: dbName,
            error: error.message
          });

          // In development, continue with other connections
          if (config.environment?.isDevelopment) {
            logger.warn(`Continuing initialization despite ${dbType} database connection failure`);
            continue;
          }

          throw new AppError(
            `Failed to connect to ${dbType} database`,
            500,
            'MULTI_DATABASE_CONNECTION_ERROR',
            { 
              databaseType: dbType,
              databaseName: dbName,
              originalError: error.message 
            }
          );
        }
      }

      const connectedDatabases = Object.keys(connections);
      
      // ENHANCED: Log collection mapping summary
      const collectionSummary = {};
      for (const dbType of connectedDatabases) {
        const purpose = ConnectionManager.#databasePurposes.get(dbType);
        if (purpose) {
          collectionSummary[dbType] = {
            purpose: purpose.purpose,
            collections: purpose.collections.length,
            expectedCollections: purpose.collections
          };
        }
      }

      logger.info('Multiple database initialization completed with collection mapping', {
        totalDatabases: connectedDatabases.length,
        connectedDatabases,
        totalConnections: ConnectionManager.#connections.size,
        collectionMapping: collectionSummary,
        collectionRouting: {
          totalMappedCollections: ConnectionManager.#collectionToDatabase.size,
          collectionsPerDatabase: Array.from(ConnectionManager.#databasePurposes.entries()).reduce((acc, [db, config]) => {
            acc[db] = config.collections.length;
            return acc;
          }, {})
        }
      });

      return connections;

    } catch (error) {
      logger.error('Failed to initialize multiple databases', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Multiple database initialization failed',
        500,
        'MULTI_DATABASE_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * ENHANCED: Setup collection routing for a specific database
   * @static
   * @async
   * @param {string} dbType - Database type (admin, shared, audit, analytics)
   * @param {Object} connection - Database connection
   */
  static async #setupCollectionRouting(dbType, connection) {
    try {
      const purpose = ConnectionManager.#databasePurposes.get(dbType);
      if (!purpose) {
        logger.warn(`No purpose configuration found for database type: ${dbType}`);
        return;
      }

      // Verify collections exist or can be created
      const existingCollections = await connection.db.listCollections().toArray();
      const existingNames = existingCollections.map(c => c.name);

      const routingInfo = {
        expected: purpose.collections.length,
        existing: 0,
        missing: [],
        canCreate: true
      };

      for (const collectionName of purpose.collections) {
        if (existingNames.includes(collectionName)) {
          routingInfo.existing++;
        } else {
          routingInfo.missing.push(collectionName);
        }
      }

      logger.info(`Collection routing setup for ${dbType}`, {
        expected: routingInfo.expected,
        existing: routingInfo.existing,
        missing: routingInfo.missing.length,
        missingCollections: routingInfo.missing.slice(0, 5), // Limit log output
        coverage: routingInfo.expected > 0 ? (routingInfo.existing / routingInfo.expected * 100).toFixed(1) + '%' : '100%'
      });

    } catch (error) {
      logger.error(`Failed to setup collection routing for ${dbType}`, {
        error: error.message
      });
    }
  }

  /**
   * ENHANCED: Gets a database-specific connection with automatic routing
   * @static
   * @param {string} dbType - Database type (admin, shared, audit, analytics)
   * @returns {mongoose.Connection|null} Database connection or null
   */
  static getDatabaseConnection(dbType) {
    // First check direct database connections
    const directConnection = ConnectionManager.#databaseConnections.get(dbType);
    if (directConnection) {
      return directConnection;
    }

    // Fall back to connection name pattern
    const connectionName = `${dbType}_connection`;
    return ConnectionManager.#connections.get(connectionName) || null;
  }

  /**
   * ENHANCED: Get database connection for a specific collection
   * @static
   * @param {string} collectionName - Name of the collection
   * @returns {mongoose.Connection|null} Database connection for the collection
   */
  static getConnectionForCollection(collectionName) {
    const dbType = ConnectionManager.#collectionToDatabase.get(collectionName);
    if (dbType) {
      return ConnectionManager.getDatabaseConnection(dbType);
    }

    // Default fallback to admin database for unmapped collections
    logger.debug(`Collection ${collectionName} not mapped, using admin database`);
    return ConnectionManager.getDatabaseConnection('admin') || 
           ConnectionManager.getConnection('default');
  }

  /**
   * ENHANCED: Get database type for a collection
   * @static
   * @param {string} collectionName - Name of the collection
   * @returns {string|null} Database type or null if not mapped
   */
  static getDatabaseTypeForCollection(collectionName) {
    return ConnectionManager.#collectionToDatabase.get(collectionName) || null;
  }

  /**
   * ENHANCED: Get all collections for a database type
   * @static
   * @param {string} dbType - Database type
   * @returns {Array<string>} Array of collection names
   */
  static getCollectionsForDatabase(dbType) {
    const purpose = ConnectionManager.#databasePurposes.get(dbType);
    return purpose ? purpose.collections : [];
  }

  /**
   * ENHANCED: Get database routing information
   * @static
   * @returns {Object} Comprehensive routing information
   */
  static getConnectionRouting() {
    return {
      databases: Array.from(ConnectionManager.#databaseConnections.keys()),
      tenants: Array.from(ConnectionManager.#tenantConnections.keys()),
      totalConnections: ConnectionManager.#connections.size,
      databaseConnections: ConnectionManager.#databaseConnections.size,
      tenantConnections: ConnectionManager.#tenantConnections.size,
      collectionRouting: {
        totalMappedCollections: ConnectionManager.#collectionToDatabase.size,
        collectionToDatabase: Object.fromEntries(ConnectionManager.#collectionToDatabase),
        databasePurposes: Object.fromEntries(
          Array.from(ConnectionManager.#databasePurposes.entries()).map(([db, config]) => [
            db, 
            {
              purpose: config.purpose,
              collections: config.collections
            }
          ])
        )
      },
      connectionMapping: {
        databases: Object.fromEntries(
          Array.from(ConnectionManager.#databaseConnections.entries())
            .map(([key, conn]) => [key, {
              name: conn.name,
              readyState: conn.readyState,
              host: conn.host,
              port: conn.port,
              databaseName: conn.db?.databaseName
            }])
        ),
        tenants: Object.fromEntries(
          Array.from(ConnectionManager.#tenantConnections.entries())
            .map(([key, conn]) => [key, {
              name: conn.name,
              readyState: conn.readyState,
              host: conn.host,
              port: conn.port,
              databaseName: conn.db?.databaseName
            }])
        )
      }
    };
  }

  /**
   * Creates or gets a tenant-specific database connection
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} [options={}] - Connection options
   * @returns {Promise<mongoose.Connection>} Tenant database connection
   * @throws {AppError} If tenant connection fails
   */
  static async createTenantConnection(tenantId, options = {}) {
    try {
      if (!tenantId) {
        throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
      }

      // Check if tenant connection already exists
      const existingConnection = ConnectionManager.#tenantConnections.get(tenantId);
      if (existingConnection && existingConnection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
        logger.info('Reusing existing tenant connection', { tenantId });
        return existingConnection;
      }

      const tenantPrefix = config.database?.databases?.tenantPrefix || 'tenant_';
      const tenantDbName = `${tenantPrefix}${tenantId}`;
      const baseUri = config.database.uri.replace(/\/[^/?]+(\?.*)?$/, '');
      const tenantUri = `${baseUri}/${tenantDbName}`;

      const connectionName = `tenant_${tenantId}`;

      logger.info('Creating tenant database connection', {
        tenantId,
        tenantDbName,
        connectionName
      });

      const connection = await ConnectionManager.connect(connectionName, {
        uri: tenantUri,
        mongoOptions: {
          ...config.database.options,
          ...options.mongoOptions
        },
        enableHealthCheck: options.enableHealthCheck !== false,
        healthCheckInterval: options.healthCheckInterval || 30000,
        retryOptions: options.retryOptions || {}
      });

      // Store tenant connection
      ConnectionManager.#tenantConnections.set(tenantId, connection);

      logger.info('Tenant database connection established', {
        tenantId,
        tenantDbName,
        connectionName,
        readyState: connection.readyState
      });

      return connection;

    } catch (error) {
      logger.error('Failed to create tenant connection', {
        tenantId,
        error: error.message
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Tenant connection creation failed',
        500,
        'TENANT_CONNECTION_ERROR',
        { 
          tenantId,
          originalError: error.message 
        }
      );
    }
  }

  /**
   * Gets a tenant database connection
   * @static
   * @param {string} tenantId - Tenant identifier
   * @returns {mongoose.Connection|null} Tenant connection or null
   */
  static getTenantConnection(tenantId) {
    if (!tenantId) {
      return null;
    }

    // Check direct tenant connections
    const directConnection = ConnectionManager.#tenantConnections.get(tenantId);
    if (directConnection) {
      return directConnection;
    }

    // Fall back to connection name pattern
    const connectionName = `tenant_${tenantId}`;
    return ConnectionManager.#connections.get(connectionName) || null;
  }

  /**
   * Lists all tenant connections
   * @static
   * @returns {Map<string, mongoose.Connection>} All tenant connections
   */
  static getAllTenantConnections() {
    return new Map(ConnectionManager.#tenantConnections);
  }

  /**
   * Closes a tenant database connection
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {boolean} [force=false] - Force close connection
   * @returns {Promise<void>}
   */
  static async closeTenantConnection(tenantId, force = false) {
    try {
      if (!tenantId) {
        throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
      }

      const connectionName = `tenant_${tenantId}`;
      
      // Close the connection
      await ConnectionManager.disconnect(connectionName, force);

      // Remove from tenant connections map
      ConnectionManager.#tenantConnections.delete(tenantId);

      logger.info('Tenant connection closed', { tenantId, forced: force });

    } catch (error) {
      logger.error('Failed to close tenant connection', {
        tenantId,
        error: error.message
      });

      throw new AppError(
        'Tenant connection closure failed',
        500,
        'TENANT_DISCONNECT_ERROR',
        { 
          tenantId,
          originalError: error.message 
        }
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

      // Remove from specialized maps if applicable
      for (const [dbType, conn] of ConnectionManager.#databaseConnections) {
        if (conn === connection) {
          ConnectionManager.#databaseConnections.delete(dbType);
          break;
        }
      }

      for (const [tenantId, conn] of ConnectionManager.#tenantConnections) {
        if (conn === connection) {
          ConnectionManager.#tenantConnections.delete(tenantId);
          break;
        }
      }

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
    ConnectionManager.#databaseConnections.clear();
    ConnectionManager.#tenantConnections.clear();
    ConnectionManager.#databaseTypeMapping.clear();
    ConnectionManager.#collectionToDatabase.clear();
    ConnectionManager.#databasePurposes.clear();
    
    // Clear all health check intervals
    ConnectionManager.#healthCheckIntervals.forEach(intervalId => {
      clearInterval(intervalId);
    });
    ConnectionManager.#healthCheckIntervals.clear();

    logger.info('All connection data cleared');
  }
}

module.exports = ConnectionManager;