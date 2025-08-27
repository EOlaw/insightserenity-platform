'use strict';

/**
 * @fileoverview Enhanced connection manager for hybrid database architecture with comprehensive multi-database support
 * @module shared/lib/database/connection-manager
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/config/base-config
 * @version 3.2.0
 * @author InsightSerenity Platform Team
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const config = require('../../config/base-config');

/**
 * @class ConnectionManager
 * @description Enhanced connection manager supporting comprehensive multi-database architecture:
 * - Primary MongoDB connection for core business data
 * - Analytics connection for time-series and metrics data
 * - Audit connection for compliance and security logging
 * - Shared connection for cross-tenant resources
 * - Dynamic tenant connections for enterprise clients
 * - Automatic collection routing and health monitoring
 */
class ConnectionManager {

  /**
   * @private
   * @static
   * @readonly
   * @description Connection state constants
   */
  static #CONNECTION_STATES = {
    DISCONNECTED: 0,
    CONNECTED: 1,
    CONNECTING: 2,
    DISCONNECTING: 3,
    UNINITIALIZED: 99
  };

  /**
   * @private
   * @static
   * @readonly
   * @description Default retry configuration
   */
  static #RETRY_OPTIONS = {
    maxRetries: 5,
    retryDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 30000
  };

  /**
   * @private
   * @static
   * @readonly
   * @description Default mongoose connection options
   */
  static #DEFAULT_OPTIONS = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    family: 4,
    retryWrites: true,
    w: 'majority',
    maxIdleTimeMS: 30000,
    heartbeatFrequencyMS: 10000,
    connectTimeoutMS: 30000
  };

  /**
   * @private
   * @static
   * @type {Map<string, mongoose.Connection>}
   * @description All active database connections
   */
  static #connections = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   * @description Connection statistics and health information
   */
  static #connectionStats = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, number>}
   * @description Health check intervals for each connection
   */
  static #healthCheckIntervals = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, mongoose.Connection>}
   * @description Database type to connection mapping (admin, shared, audit, analytics)
   */
  static #databaseConnections = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, mongoose.Connection>}
   * @description Tenant-specific connections for enterprise clients
   */
  static #tenantConnections = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   * @description Database type to purpose and collections mapping
   */
  static #databasePurposes = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, string>}
   * @description Collection name to database type routing
   */
  static #collectionToDatabase = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Array>}
   * @description Database routing cache for performance
   */
  static #routingCache = new Map();

  /**
   * @private
   * @static
   * @type {boolean}
   * @description Whether the connection manager has been initialized
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @type {Object}
   * @description Global health status tracking
   */
  static #globalHealthStatus = {
    healthy: false,
    lastCheck: null,
    totalConnections: 0,
    healthyConnections: 0,
    unhealthyConnections: 0,
    errors: []
  };

  /**
   * Initialize database type mappings and collection routing for multi-database architecture
   * @static
   * @throws {AppError} If mapping initialization fails
   */
  static initializeDatabaseMappings() {
    try {
      // Prevent duplicate initialization
      if (ConnectionManager.#databasePurposes.size > 0) {
        logger.debug('Database mappings already initialized, skipping');
        return;
      }

      logger.info('Initializing comprehensive database mappings and collection routing');

      // Define comprehensive database purposes and their collection mappings
      const databaseMappings = {
        admin: {
          purpose: 'Administrative operations, user management, system configuration, platform settings',
          priority: 'high',
          collections: [
            'users', 'user_profiles', 'user_activities', 'login_history',
            'roles', 'permissions', 'organizations', 'organization_members',
            'organization_invitations', 'tenants', 'system_configurations',
            'security_incidents', 'sessions', 'platforms', 'platform_configurations',
            'rate_limits', 'system_health', 'configuration_management',
            'maintenance_schedules', 'deployment_logs'
          ]
        },
        shared: {
          purpose: 'Shared resources, common data, cross-tenant information, billing',
          priority: 'medium',
          collections: [
            'subscription_plans', 'subscriptions', 'invoices', 'payments',
            'features', 'system_settings', 'webhooks', 'api_integrations',
            'notifications', 'oauth_providers', 'passkeys', 'integrations',
            'third_party_services', 'service_configurations'
          ]
        },
        audit: {
          purpose: 'Audit trails, compliance logging, security monitoring, data governance',
          priority: 'critical',
          collections: [
            'audit_logs', 'audit_alerts', 'audit_exports', 'audit_retention_policies',
            'compliance_mappings', 'data_breaches', 'erasure_logs', 'processing_activities',
            'consents', 'anonymized_users', 'security_logs', 'compliance_reports',
            'data_classification', 'privacy_requests', 'consent_records'
          ]
        },
        analytics: {
          purpose: 'Analytics data, usage metrics, performance tracking, business intelligence',
          priority: 'medium',
          collections: [
            'api_usage', 'usage_records', 'performance_metrics', 'user_analytics',
            'system_metrics', 'application_metrics', 'business_metrics',
            'usage_patterns', 'performance_trends', 'operational_metrics',
            'customer_insights', 'revenue_analytics'
          ]
        }
      };

      // Store database purposes
      for (const [dbType, config] of Object.entries(databaseMappings)) {
        ConnectionManager.#databasePurposes.set(dbType, config);

        // Create collection to database mapping for efficient routing
        for (const collectionName of config.collections) {
          ConnectionManager.#collectionToDatabase.set(collectionName, dbType);
        }
      }

      logger.info('Database mappings initialized successfully', {
        databaseTypes: Object.keys(databaseMappings).length,
        totalCollections: ConnectionManager.#collectionToDatabase.size,
        collectionDistribution: Object.fromEntries(
          Object.entries(databaseMappings).map(([type, config]) => [type, config.collections.length])
        )
      });

    } catch (error) {
      logger.error('Failed to initialize database mappings', { error: error.message });
      throw new AppError(
        'Database mapping initialization failed',
        500,
        'DATABASE_MAPPING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Configure process event listeners to prevent memory leaks
   * @static
   */
  static configureProcessEventHandlers() {
    try {
      // Increase max listeners to prevent warnings
      process.setMaxListeners(20);
      
      // Check if listeners are already configured
      if (process.listenerCount('SIGTERM') < 10) {
        // Only add if not already configured
        process.once('SIGTERM', () => {
          logger.info('Received SIGTERM, initiating graceful database shutdown');
          ConnectionManager.disconnectAll(false).catch(error => {
            logger.error('Error during graceful database shutdown', { error: error.message });
          });
        });

        process.once('SIGINT', () => {
          logger.info('Received SIGINT, initiating graceful database shutdown');
          ConnectionManager.disconnectAll(false).catch(error => {
            logger.error('Error during graceful database shutdown', { error: error.message });
          });
        });
      }

      logger.debug('Process event handlers configured to prevent memory leaks');
    } catch (error) {
      logger.warn('Failed to configure process event handlers', { error: error.message });
    }
  }

  /**
   * Initialize hybrid database architecture with comprehensive multi-database support
   * @static
   * @async
   * @param {Object} [databaseConfig=config.database] - Database configuration
   * @param {Object} [options={}] - Connection options
   * @returns {Promise<Object>} Object containing all established connections
   * @throws {AppError} If initialization fails
   */
  static async initialize(databaseConfig = config.database, options = {}) {
    try {
      logger.info('Initializing comprehensive hybrid database architecture');

      // Initialize database mappings first
      ConnectionManager.initializeDatabaseMappings();

      const connections = {};
      const baseUri = databaseConfig.uri;

      // FIXED: Proper URI generation that preserves authentication and hostname
      const databaseUris = ConnectionManager.#generateDatabaseUris(baseUri, databaseConfig);

      // Establish connections for each database type
      for (const [dbType, uri] of Object.entries(databaseUris)) {
        try {
          const connectionName = `${dbType}_connection`;
          
          // Get database-specific options
          const dbOptions = {
            ...ConnectionManager.#DEFAULT_OPTIONS,
            ...databaseConfig.options,
            ...options,
            // Database-specific optimizations
            ...(dbType === 'analytics' ? {
              maxPoolSize: 15,
              minPoolSize: 3,
              // bufferMaxEntries: 0,
              bufferCommands: false
            } : {}),
            ...(dbType === 'audit' ? {
              maxPoolSize: 10,
              minPoolSize: 2,
              writeConcern: { w: 'majority', j: true }
            } : {})
          };

          logger.info(`Establishing ${dbType} database connection`, {
            uri: uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
            maxPoolSize: dbOptions.maxPoolSize,
            purpose: ConnectionManager.#databasePurposes.get(dbType)?.purpose
          });

          const connection = await ConnectionManager.connect(connectionName, {
            uri: uri,
            options: dbOptions
          });

          connections[dbType] = connection;
          ConnectionManager.#databaseConnections.set(dbType, connection);

          // Setup collection routing for this database
          await ConnectionManager.setupCollectionRouting(dbType, connection);

          logger.info(`${dbType} database connection established successfully`, {
            connectionName,
            database: connection.db?.databaseName,
            readyState: connection.readyState,
            collectionsConfigured: ConnectionManager.#databasePurposes.get(dbType)?.collections?.length || 0
          });

        } catch (error) {
          logger.error(`Failed to connect to ${dbType} database`, {
            uri: databaseUris[dbType].replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
            error: error.message
          });

          // In development, continue with other connections
          if (config.environment?.isDevelopment || process.env.NODE_ENV === 'development') {
            logger.warn(`Continuing initialization despite ${dbType} database connection failure`);
            continue;
          }

          throw new AppError(
            `Failed to connect to ${dbType} database`,
            500,
            'MULTI_DATABASE_CONNECTION_ERROR',
            { 
              databaseType: dbType,
              databaseName: databaseUris[dbType],
              originalError: error.message 
            }
          );
        }
      }

      const connectedDatabases = Object.keys(connections);
      
      // Ensure at least primary connection is available
      if (connectedDatabases.length === 0) {
        throw new AppError(
          'No database connections established',
          500,
          'NO_DATABASE_CONNECTIONS'
        );
      }

      // If admin database failed, use primary as fallback
      if (!connections.admin && connections.primary) {
        logger.warn('Admin database not available, using primary as fallback');
        connections.admin = connections.primary;
        ConnectionManager.#databaseConnections.set('admin', connections.primary);
      }

      // Start comprehensive health monitoring
      ConnectionManager.#startComprehensiveHealthMonitoring();

      // Update global health status
      ConnectionManager.#updateGlobalHealthStatus();

      // Mark as initialized
      ConnectionManager.#initialized = true;

      // Log comprehensive initialization summary
      const collectionSummary = {};
      for (const dbType of connectedDatabases) {
        const purpose = ConnectionManager.#databasePurposes.get(dbType);
        if (purpose) {
          collectionSummary[dbType] = {
            purpose: purpose.purpose,
            collections: purpose.collections.length,
            priority: purpose.priority
          };
        }
      }

      logger.info('Comprehensive hybrid database architecture initialized successfully', {
        totalDatabases: connectedDatabases.length,
        connectedDatabases,
        totalConnections: ConnectionManager.#connections.size,
        totalTenantConnections: ConnectionManager.#tenantConnections.size,
        collectionMapping: collectionSummary,
        routingCache: ConnectionManager.#routingCache.size,
        globalHealth: ConnectionManager.#globalHealthStatus.healthy
      });

      return connections;

    } catch (error) {
      logger.error('Failed to initialize hybrid database architecture', {
        error: error.message,
        stack: error.stack
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Database architecture initialization failed',
        500,
        'DATABASE_ARCHITECTURE_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Setup collection routing for a specific database
   * @static
   * @async
   * @param {string} dbType - Database type
   * @param {mongoose.Connection} connection - Database connection
   * @returns {Promise<void>}
   */
  static async setupCollectionRouting(dbType, connection) {
    try {
      const purpose = ConnectionManager.#databasePurposes.get(dbType);
      if (!purpose) {
        logger.warn(`No purpose defined for database type: ${dbType}`);
        return;
      }

      // Verify collections exist or can be created
      const collections = await connection.db.listCollections().toArray();
      const existingCollections = collections.map(c => c.name);
      
      const routingInfo = {
        dbType,
        connection: connection.name,
        database: connection.db.databaseName,
        expected: purpose.collections.length,
        existing: 0,
        missing: [],
        available: []
      };

      for (const collectionName of purpose.collections) {
        if (existingCollections.includes(collectionName)) {
          routingInfo.existing++;
          routingInfo.available.push(collectionName);
        } else {
          routingInfo.missing.push(collectionName);
        }

        // Update routing cache
        ConnectionManager.#routingCache.set(collectionName, {
          dbType,
          connection,
          lastAccessed: new Date().toISOString()
        });
      }

      logger.info(`Collection routing setup for ${dbType}`, {
        collections: routingInfo.expected,
        existing: routingInfo.existing,
        missing: routingInfo.missing.length,
        coverage: routingInfo.expected > 0 ? 
          (routingInfo.existing / routingInfo.expected * 100).toFixed(1) + '%' : '100%'
      });

    } catch (error) {
      logger.error(`Failed to setup collection routing for ${dbType}`, {
        error: error.message
      });
    }
  }

  /**
   * Establish a database connection with enhanced retry logic and health monitoring
   * @static
   * @async
   * @param {string} connectionName - Connection identifier
   * @param {Object} connectionConfig - Connection configuration
   * @param {string} connectionConfig.uri - MongoDB connection URI
   * @param {Object} [connectionConfig.options={}] - Mongoose connection options
   * @param {Object} [retryOptions={}] - Retry configuration
   * @returns {Promise<mongoose.Connection>} Database connection
   * @throws {AppError} If connection fails after retries
   */
  static async connect(connectionName, connectionConfig, retryOptions = {}) {
    const {
      maxRetries = ConnectionManager.#RETRY_OPTIONS.maxRetries,
      retryDelay = ConnectionManager.#RETRY_OPTIONS.retryDelay,
      backoffMultiplier = ConnectionManager.#RETRY_OPTIONS.backoffMultiplier,
      maxDelay = ConnectionManager.#RETRY_OPTIONS.maxDelay,
      enableHealthCheck = true,
      healthCheckInterval = 30000
    } = retryOptions;

    // Check if connection already exists and is healthy
    if (ConnectionManager.#connections.has(connectionName)) {
      const existingConnection = ConnectionManager.#connections.get(connectionName);
      if (existingConnection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
        logger.debug(`Reusing existing healthy connection: ${connectionName}`);
        return existingConnection;
      } else {
        logger.warn(`Existing connection unhealthy, recreating: ${connectionName}`, {
          readyState: existingConnection.readyState
        });
        await ConnectionManager.disconnect(connectionName);
      }
    }

    // Initialize connection statistics
    ConnectionManager.#connectionStats.set(connectionName, {
      connectionName,
      status: 'connecting',
      attempts: 0,
      lastAttempt: new Date().toISOString(),
      lastSuccess: null,
      lastError: null,
      totalConnections: 0,
      totalDisconnections: 0,
      healthChecks: {
        total: 0,
        successful: 0,
        failed: 0,
        lastCheck: null
      }
    });

    // Merge connection options with defaults
    const finalOptions = {
      ...ConnectionManager.#DEFAULT_OPTIONS,
      ...connectionConfig.options
    };

    const finalRetryOptions = {
      maxRetries,
      retryDelay,
      backoffMultiplier,
      maxDelay
    };

    try {
      // Establish connection with retry logic
      const connection = await ConnectionManager.#connectWithRetry(
        connectionName,
        connectionConfig.uri,
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
      stats.status = 'connected';
      stats.lastSuccess = new Date().toISOString();
      stats.lastError = null;
      stats.totalConnections++;

      logger.info('Database connection established successfully', {
        connectionName,
        database: connection.db?.databaseName,
        poolSize: finalOptions.maxPoolSize,
        healthCheck: enableHealthCheck
      });

      return connection;

    } catch (error) {
      logger.error('Failed to establish database connection', {
        connectionName,
        error: error.message,
        attempts: retryOptions.maxRetries + 1
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Database connection failed',
        500,
        'CONNECTION_ERROR',
        { 
          connectionName,
          originalError: error.message,
          attempts: retryOptions.maxRetries + 1
        }
      );
    }
  }

  /**
   * @private
   * Establish connection with retry logic
   * @static
   * @async
   * @param {string} connectionName - Connection identifier
   * @param {string} uri - MongoDB connection URI
   * @param {Object} options - Connection options
   * @param {Object} retryOptions - Retry configuration
   * @returns {Promise<mongoose.Connection>} Database connection
   */
  static async #connectWithRetry(connectionName, uri, options, retryOptions) {
    const { maxRetries, retryDelay, backoffMultiplier, maxDelay } = retryOptions;
    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const stats = ConnectionManager.#connectionStats.get(connectionName);
        stats.attempts++;
        stats.lastAttempt = new Date().toISOString();

        logger.info(`Attempting database connection: ${connectionName}`, {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          uri: uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
        });

        const connection = await ConnectionManager.#establishConnection(uri, options);

        return connection;

      } catch (error) {
        lastError = error;
        const stats = ConnectionManager.#connectionStats.get(connectionName);
        stats.lastError = error.message;
        stats.status = 'error';

        attempt++;

        if (attempt <= maxRetries) {
          const delay = Math.min(
            retryDelay * Math.pow(backoffMultiplier, attempt - 1),
            maxDelay
          );
          
          logger.warn(`Connection attempt ${attempt} failed, retrying in ${delay}ms`, {
            connectionName,
            error: error.message,
            nextAttempt: attempt + 1,
            totalAttempts: maxRetries + 1
          });
          
          await ConnectionManager.#sleep(delay);
        }
      }
    }

    logger.error('Failed to establish database connection after all retries', {
      connectionName,
      attempts: maxRetries + 1,
      lastError: lastError?.message
    });

    throw new AppError(
      `Database connection failed after ${maxRetries + 1} attempts`,
      500,
      'CONNECTION_RETRY_EXHAUSTED',
      {
        connectionName,
        attempts: maxRetries + 1,
        originalError: lastError?.message
      }
    );
  }

  /**
   * @private
   * Establish the actual mongoose connection with timeout handling
   * @static
   * @async
   * @param {string} uri - MongoDB connection URI
   * @param {Object} options - Connection options
   * @returns {Promise<mongoose.Connection>} Database connection
   */
  static async #establishConnection(uri, options) {
    return new Promise((resolve, reject) => {
      const connection = mongoose.createConnection();

      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${options.serverSelectionTimeoutMS || 30000}ms`));
      }, options.serverSelectionTimeoutMS || 30000);

      connection.openUri(uri, options)
        .then(() => {
          clearTimeout(timeout);
          resolve(connection);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * @private
   * Setup comprehensive event handlers for connection monitoring with leak prevention
   * @static
   * @param {string} connectionName - Connection identifier
   * @param {mongoose.Connection} connection - Database connection
   */
  static #setupEventHandlers(connectionName, connection) {
    // Prevent event listener memory leaks by checking if listeners already exist
    if (connection.listenerCount('connected') > 0) {
      logger.debug(`Event listeners already configured for ${connectionName}`);
      return;
    }

    // Set max listeners to prevent memory leak warnings
    connection.setMaxListeners(15);

    connection.on('connected', () => {
      logger.info(`Database connected: ${connectionName}`, {
        database: connection.db?.databaseName,
        host: connection.host,
        port: connection.port
      });

      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.status = 'connected';
        stats.lastSuccess = new Date().toISOString();
      }

      ConnectionManager.#updateGlobalHealthStatus();
    });

    connection.on('disconnected', () => {
      logger.warn(`Database disconnected: ${connectionName}`, {
        database: connection.db?.databaseName
      });

      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.status = 'disconnected';
        stats.totalDisconnections++;
      }

      ConnectionManager.#updateGlobalHealthStatus();
    });

    connection.on('reconnected', () => {
      logger.info(`Database reconnected: ${connectionName}`, {
        database: connection.db?.databaseName
      });

      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.status = 'connected';
        stats.lastSuccess = new Date().toISOString();
        stats.totalConnections++;
      }

      ConnectionManager.#updateGlobalHealthStatus();
    });

    connection.on('error', (error) => {
      logger.error(`Database error on ${connectionName}`, {
        error: error.message,
        database: connection.db?.databaseName,
        readyState: connection.readyState
      });

      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.lastError = error.message;
        stats.status = 'error';
      }

      ConnectionManager.#updateGlobalHealthStatus();
    });

    connection.on('close', () => {
      logger.info(`Database connection closed: ${connectionName}`);
      
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.status = 'closed';
      }

      ConnectionManager.#updateGlobalHealthStatus();
    });

    connection.on('fullsetup', () => {
      logger.info(`Database replica set fully configured: ${connectionName}`);
    });

    connection.on('all', () => {
      logger.info(`Database replica set all members connected: ${connectionName}`);
    });
  }

  /**
   * @private
   * Start comprehensive health monitoring for all connections
   * @static
   */
  static #startComprehensiveHealthMonitoring() {
    try {
      // Clear existing intervals
      ConnectionManager.#healthCheckIntervals.forEach(interval => clearInterval(interval));
      ConnectionManager.#healthCheckIntervals.clear();

      // Global health check interval
      const globalInterval = setInterval(async () => {
        try {
          await ConnectionManager.#performGlobalHealthCheck();
        } catch (error) {
          logger.warn('Global health check failed', { error: error.message });
        }
      }, 30000); // Every 30 seconds

      ConnectionManager.#healthCheckIntervals.set('global', globalInterval);

      // Individual connection health checks
      for (const connectionName of ConnectionManager.#connections.keys()) {
        ConnectionManager.#startHealthCheck(connectionName, 60000); // Every 60 seconds
      }

      logger.info('Comprehensive health monitoring started', {
        totalConnections: ConnectionManager.#connections.size,
        globalCheckInterval: 30000,
        individualCheckInterval: 60000
      });

    } catch (error) {
      logger.error('Failed to start health monitoring', { error: error.message });
    }
  }

  /**
   * @private
   * Start health check for a specific connection
   * @static
   * @param {string} connectionName - Connection identifier
   * @param {number} interval - Health check interval in milliseconds
   */
  static #startHealthCheck(connectionName, interval = 30000) {
    const healthCheckInterval = setInterval(async () => {
      try {
        await ConnectionManager.checkHealth(connectionName);
      } catch (error) {
        logger.warn(`Health check failed for ${connectionName}`, { error: error.message });
      }
    }, interval);

    ConnectionManager.#healthCheckIntervals.set(connectionName, healthCheckInterval);
  }

  /**
   * @private
   * Perform global health check across all connections
   * @static
   * @async
   */
  static async #performGlobalHealthCheck() {
    try {
      const healthPromises = Array.from(ConnectionManager.#connections.keys())
        .map(name => ConnectionManager.checkHealth(name));

      const healthResults = await Promise.allSettled(healthPromises);
      const healthyConnections = healthResults.filter(r => 
        r.status === 'fulfilled' && r.value.status === 'healthy'
      ).length;

      ConnectionManager.#globalHealthStatus = {
        healthy: healthyConnections > 0,
        lastCheck: new Date().toISOString(),
        totalConnections: ConnectionManager.#connections.size,
        healthyConnections,
        unhealthyConnections: ConnectionManager.#connections.size - healthyConnections,
        errors: healthResults
          .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status !== 'healthy'))
          .map(r => r.status === 'rejected' ? r.reason.message : r.value.message)
          .slice(0, 5) // Limit error count
      };

    } catch (error) {
      ConnectionManager.#globalHealthStatus = {
        healthy: false,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * @private
   * Update global health status
   * @static
   */
  static #updateGlobalHealthStatus() {
    try {
      const totalConnections = ConnectionManager.#connections.size;
      const healthyConnections = Array.from(ConnectionManager.#connections.values())
        .filter(conn => conn.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED).length;

      ConnectionManager.#globalHealthStatus = {
        ...ConnectionManager.#globalHealthStatus,
        healthy: healthyConnections > 0,
        lastCheck: new Date().toISOString(),
        totalConnections,
        healthyConnections,
        unhealthyConnections: totalConnections - healthyConnections
      };

    } catch (error) {
      logger.warn('Failed to update global health status', { error: error.message });
    }
  }

  /**
   * @private
   * Generate proper database URIs preserving authentication and hostname
   * @static
   * @param {string} baseUri - Original MongoDB connection URI
   * @param {Object} databaseConfig - Database configuration
   * @returns {Object} Object containing database-specific URIs
   */
  static #generateDatabaseUris(baseUri, databaseConfig) {
    try {
      // Parse the original URI to extract components
      const url = new URL(baseUri);
      
      // Extract the base URI without the database name
      const protocol = url.protocol; // mongodb: or mongodb+srv:
      const auth = url.username && url.password ? `${url.username}:${url.password}@` : '';
      const hostname = url.hostname;
      const port = url.port ? `:${url.port}` : '';
      const queryParams = url.search; // Includes the ?
      
      // Build base URI pattern
      const basePattern = `${protocol}//${auth}${hostname}${port}`;
      
      logger.info('Generating database URIs from base pattern', {
        protocol,
        hostname,
        hasAuth: !!auth,
        hasQueryParams: !!queryParams
      });

      // Generate database-specific URIs
      const databaseUris = {
        admin: `${basePattern}/insightserenity_admin${queryParams}`,
        shared: `${basePattern}/insightserenity_shared${queryParams}`,
        audit: `${basePattern}/insightserenity_audit${queryParams}`,
        analytics: databaseConfig.analyticsUri || `${basePattern}/insightserenity_analytics${queryParams}`
      };

      // Validate generated URIs
      for (const [dbType, uri] of Object.entries(databaseUris)) {
        try {
          new URL(uri); // Validate URI format
          logger.debug(`Generated valid URI for ${dbType}`, {
            uri: uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') // Mask credentials in logs
          });
        } catch (uriError) {
          logger.error(`Invalid URI generated for ${dbType}`, {
            error: uriError.message,
            uri: uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
          });
          throw new AppError(`Invalid URI generated for ${dbType} database`, 500, 'INVALID_URI_GENERATION');
        }
      }

      return databaseUris;

    } catch (error) {
      logger.error('Failed to generate database URIs', {
        error: error.message,
        baseUri: baseUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
      });

      // Fallback: try simple database name replacement if URL parsing fails
      if (baseUri.includes('/')) {
        const fallbackUris = {
          admin: baseUri.replace(/\/([^/?]+)(\?.*)?$/, '/insightserenity_admin$2'),
          shared: baseUri.replace(/\/([^/?]+)(\?.*)?$/, '/insightserenity_shared$2'),
          audit: baseUri.replace(/\/([^/?]+)(\?.*)?$/, '/insightserenity_audit$2'),
          analytics: databaseConfig.analyticsUri || baseUri.replace(/\/([^/?]+)(\?.*)?$/, '/insightserenity_analytics$2')
        };
        
        logger.warn('Using fallback URI generation method');
        return fallbackUris;
      }

      throw new AppError(
        'Database URI generation failed',
        500,
        'URI_GENERATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Sleep utility for retry delays
   * @static
   * @async
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  static async #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets the primary database connection (core business data)
   * @static
   * @returns {mongoose.Connection|null} Primary database connection
   */
  static getPrimaryConnection() {
    return ConnectionManager.getConnection('primary') || 
           ConnectionManager.getConnection('primary_connection') ||
           ConnectionManager.getDatabaseConnection('admin');
  }

  /**
   * Gets the analytics database connection (time-series data)
   * @static
   * @returns {mongoose.Connection|null} Analytics database connection
   */
  static getAnalyticsConnection() {
    return ConnectionManager.getConnection('analytics') || 
           ConnectionManager.getConnection('analytics_connection') ||
           ConnectionManager.getDatabaseConnection('analytics');
  }

  /**
   * Gets a specific connection by name with fallback logic
   * @static
   * @param {string} connectionName - Connection identifier
   * @returns {mongoose.Connection|null} Database connection or null
   */
  static getConnection(connectionName) {
    // Direct lookup first
    let connection = ConnectionManager.#connections.get(connectionName);
    if (connection && connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      return connection;
    }

    // Try with _connection suffix
    connection = ConnectionManager.#connections.get(`${connectionName}_connection`);
    if (connection && connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      return connection;
    }

    // Try database type mapping
    connection = ConnectionManager.#databaseConnections.get(connectionName);
    if (connection && connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      return connection;
    }

    // Default fallback
    if (connectionName === 'default' || connectionName === 'primary') {
      const fallbackConnection = Array.from(ConnectionManager.#connections.values())
        .find(conn => conn.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED);
      
      if (fallbackConnection) {
        logger.debug(`Using fallback connection for ${connectionName}`);
        return fallbackConnection;
      }
    }

    return null;
  }

  /**
   * Gets all active connections with comprehensive information
   * @static
   * @returns {Map<string, mongoose.Connection>} All connections with metadata
   */
  static getAllConnections() {
    const connectionsWithMetadata = new Map();

    // Add regular connections
    for (const [name, connection] of ConnectionManager.#connections) {
      connectionsWithMetadata.set(name, {
        connection,
        type: 'regular',
        database: connection.db?.databaseName,
        readyState: connection.readyState,
        healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED
      });
    }

    // Add database type connections
    for (const [dbType, connection] of ConnectionManager.#databaseConnections) {
      if (!connectionsWithMetadata.has(dbType)) {
        connectionsWithMetadata.set(dbType, {
          connection,
          type: 'database',
          database: connection.db?.databaseName,
          readyState: connection.readyState,
          healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED,
          purpose: ConnectionManager.#databasePurposes.get(dbType)?.purpose
        });
      }
    }

    // Add tenant connections
    for (const [tenantId, connection] of ConnectionManager.#tenantConnections) {
      const key = `tenant_${tenantId}`;
      connectionsWithMetadata.set(key, {
        connection,
        type: 'tenant',
        tenantId,
        database: connection.db?.databaseName,
        readyState: connection.readyState,
        healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED
      });
    }

    return connectionsWithMetadata;
  }

  /**
   * Gets comprehensive connection routing information for admin server
   * @static
   * @returns {Object} Detailed connection routing information
   */
  static getConnectionRouting() {
    try {
      const allConnections = ConnectionManager.getAllConnections();
      
      // Database connections summary
      const databaseConnectionsSummary = {};
      for (const [dbType, connection] of ConnectionManager.#databaseConnections) {
        const purpose = ConnectionManager.#databasePurposes.get(dbType);
        databaseConnectionsSummary[dbType] = {
          connectionName: Array.from(ConnectionManager.#connections.entries())
            .find(([name, conn]) => conn === connection)?.[0] || `${dbType}_connection`,
          database: connection.db?.databaseName,
          readyState: connection.readyState,
          healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED,
          purpose: purpose?.purpose || 'Unknown purpose',
          priority: purpose?.priority || 'medium',
          collections: purpose?.collections || [],
          collectionsCount: purpose?.collections?.length || 0
        };
      }

      // Tenant connections summary
      const tenantConnectionsSummary = {};
      for (const [tenantId, connection] of ConnectionManager.#tenantConnections) {
        tenantConnectionsSummary[tenantId] = {
          database: connection.db?.databaseName,
          readyState: connection.readyState,
          healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED
        };
      }

      // Collection routing summary
      const collectionRoutingSummary = {
        databasePurposes: Object.fromEntries(
          Array.from(ConnectionManager.#databasePurposes.entries()).map(([dbType, config]) => [
            dbType, 
            {
              purpose: config.purpose,
              collections: config.collections,
              priority: config.priority
            }
          ])
        ),
        collectionToDatabase: Object.fromEntries(ConnectionManager.#collectionToDatabase),
        routingCacheSize: ConnectionManager.#routingCache.size,
        totalMappedCollections: ConnectionManager.#collectionToDatabase.size
      };

      return {
        summary: {
          totalConnections: allConnections.size,
          databaseConnections: ConnectionManager.#databaseConnections.size,
          tenantConnections: ConnectionManager.#tenantConnections.size,
          healthyConnections: Array.from(allConnections.values()).filter(c => c.healthy).length,
          initialized: ConnectionManager.#initialized
        },
        connections: {
          database: databaseConnectionsSummary,
          tenant: tenantConnectionsSummary,
          all: Object.fromEntries(
            Array.from(allConnections.entries()).map(([name, data]) => [
              name,
              {
                type: data.type,
                database: data.database,
                healthy: data.healthy,
                purpose: data.purpose || 'General purpose'
              }
            ])
          )
        },
        routing: collectionRoutingSummary,
        health: ConnectionManager.#globalHealthStatus,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to generate connection routing information', {
        error: error.message
      });

      return {
        summary: {
          totalConnections: ConnectionManager.#connections.size,
          databaseConnections: ConnectionManager.#databaseConnections.size,
          tenantConnections: ConnectionManager.#tenantConnections.size,
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Gets database connection for specific type with automatic routing
   * @static
   * @param {string} dbType - Database type (admin, shared, audit, analytics)
   * @returns {mongoose.Connection|null} Database connection
   */
  static getDatabaseConnection(dbType) {
    // First check direct database connections mapping
    let connection = ConnectionManager.#databaseConnections.get(dbType);
    if (connection && connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      return connection;
    }

    // Try connection name pattern
    connection = ConnectionManager.#connections.get(`${dbType}_connection`);
    if (connection && connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      return connection;
    }

    // Try direct connection name
    connection = ConnectionManager.#connections.get(dbType);
    if (connection && connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      return connection;
    }

    // For simplified architecture, fall back to primary connection
    if (['admin', 'shared', 'audit', 'analytics'].includes(dbType)) {
      const primaryConnection = ConnectionManager.getPrimaryConnection();
      if (primaryConnection) {
        logger.debug(`Using primary connection as fallback for ${dbType} database`);
        return primaryConnection;
      }
    }

    logger.warn(`No healthy connection found for database type: ${dbType}`, {
      availableConnections: Array.from(ConnectionManager.#connections.keys()),
      databaseConnections: Array.from(ConnectionManager.#databaseConnections.keys())
    });

    return null;
  }

  /**
   * Get database connection for a specific collection with intelligent routing
   * @static
   * @param {string} collectionName - Name of the collection
   * @returns {mongoose.Connection|null} Database connection for the collection
   */
  static getConnectionForCollection(collectionName) {
    // Check routing cache first for performance
    const cached = ConnectionManager.#routingCache.get(collectionName);
    if (cached && cached.connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      cached.lastAccessed = new Date().toISOString();
      return cached.connection;
    }

    // Determine database type for collection
    const dbType = ConnectionManager.#collectionToDatabase.get(collectionName);
    if (dbType) {
      const connection = ConnectionManager.getDatabaseConnection(dbType);
      if (connection) {
        // Update routing cache
        ConnectionManager.#routingCache.set(collectionName, {
          dbType,
          connection,
          lastAccessed: new Date().toISOString()
        });
        return connection;
      }
    }

    // Default fallback to admin database for unmapped collections
    logger.debug(`Collection ${collectionName} not mapped to specific database, using admin database`);
    const adminConnection = ConnectionManager.getDatabaseConnection('admin');
    if (adminConnection) {
      // Cache the fallback routing
      ConnectionManager.#routingCache.set(collectionName, {
        dbType: 'admin',
        connection: adminConnection,
        lastAccessed: new Date().toISOString(),
        fallback: true
      });
      return adminConnection;
    }

    // Final fallback to any available connection
    const fallbackConnection = Array.from(ConnectionManager.#connections.values())
      .find(conn => conn.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED);
    
    if (fallbackConnection) {
      logger.warn(`Using emergency fallback connection for collection: ${collectionName}`);
      return fallbackConnection;
    }

    logger.error(`No available connection for collection: ${collectionName}`);
    return null;
  }

  /**
   * Get database type for a collection
   * @static
   * @param {string} collectionName - Name of the collection
   * @returns {string|null} Database type or null if not mapped
   */
  static getDatabaseTypeForCollection(collectionName) {
    return ConnectionManager.#collectionToDatabase.get(collectionName) || null;
  }

  /**
   * Get all collections for a database type
   * @static
   * @param {string} dbType - Database type
   * @returns {Array<string>} Array of collection names
   */
  static getCollectionsForDatabase(dbType) {
    const purpose = ConnectionManager.#databasePurposes.get(dbType);
    return purpose ? [...purpose.collections] : [];
  }

  /**
   * Creates a tenant-specific connection for enterprise clients
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {Object} [options={}] - Tenant connection options
   * @param {string} [options.uri] - Custom tenant URI
   * @param {string} [options.strategy='database'] - Isolation strategy
   * @param {Object} [options.connectionOptions] - Mongoose connection options
   * @returns {Promise<mongoose.Connection>} Tenant connection
   * @throws {AppError} If tenant connection fails
   */
  static async createTenantConnection(tenantId, options = {}) {
    try {
      if (!tenantId || typeof tenantId !== 'string') {
        throw new AppError('Invalid tenant ID provided', 400, 'INVALID_TENANT_ID');
      }

      // Check if tenant connection already exists
      if (ConnectionManager.#tenantConnections.has(tenantId)) {
        const existing = ConnectionManager.#tenantConnections.get(tenantId);
        if (existing.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
          logger.debug(`Reusing existing tenant connection: ${tenantId}`);
          return existing;
        } else {
          logger.warn(`Existing tenant connection unhealthy, recreating: ${tenantId}`);
          await ConnectionManager.closeTenantConnection(tenantId);
        }
      }

      const {
        uri = ConnectionManager.#generateTenantUri(tenantId),
        strategy = 'database',
        connectionOptions = {}
      } = options;

      const connectionName = `tenant_${tenantId}`;

      // Tenant-specific connection options
      const tenantOptions = {
        ...ConnectionManager.#DEFAULT_OPTIONS,
        maxPoolSize: connectionOptions.maxPoolSize || 10,
        minPoolSize: connectionOptions.minPoolSize || 2,
        serverSelectionTimeoutMS: connectionOptions.serverSelectionTimeoutMS || 15000,
        ...connectionOptions
      };

      logger.info(`Creating tenant connection: ${tenantId}`, {
        strategy,
        uri: uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
        maxPoolSize: tenantOptions.maxPoolSize
      });

      const connection = await ConnectionManager.connect(connectionName, {
        uri,
        options: tenantOptions
      });

      // Store tenant connection
      ConnectionManager.#tenantConnections.set(tenantId, connection);

      // Setup tenant-specific monitoring
      ConnectionManager.#setupTenantMonitoring(tenantId, connection);

      logger.info('Tenant connection created successfully', {
        tenantId,
        connectionName,
        database: connection.db?.databaseName,
        strategy
      });

      return connection;

    } catch (error) {
      logger.error('Failed to create tenant connection', {
        tenantId,
        error: error.message
      });

      throw new AppError(
        `Tenant connection creation failed for ${tenantId}`,
        500,
        'TENANT_CONNECTION_ERROR',
        { tenantId, originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Generate tenant-specific URI
   * @static
   * @param {string} tenantId - Tenant identifier
   * @returns {string} Tenant-specific URI
   */
  static #generateTenantUri(tenantId) {
    const baseUri = config.database?.uri || process.env.DB_URI;
    if (!baseUri) {
      throw new AppError('Base database URI not configured', 500, 'NO_BASE_URI');
    }

    // Replace database name with tenant-specific database
    return baseUri.replace(/\/([^?]+)(\?|$)/, `/insightserenity_tenant_${tenantId}$2`);
  }

  /**
   * @private
   * Setup monitoring for tenant connections
   * @static
   * @param {string} tenantId - Tenant identifier
   * @param {mongoose.Connection} connection - Tenant connection
   */
  static #setupTenantMonitoring(tenantId, connection) {
    try {
      // Setup tenant-specific event handlers
      connection.on('disconnected', () => {
        logger.warn(`Tenant connection lost: ${tenantId}`);
      });

      connection.on('error', (error) => {
        logger.error(`Tenant connection error: ${tenantId}`, { error: error.message });
      });

      // Start health monitoring for tenant
      ConnectionManager.#startHealthCheck(`tenant_${tenantId}`, 60000);

    } catch (error) {
      logger.warn(`Failed to setup tenant monitoring for ${tenantId}`, { error: error.message });
    }
  }

  /**
   * Gets a tenant connection
   * @static
   * @param {string} tenantId - Tenant identifier
   * @returns {mongoose.Connection|null} Tenant connection
   */
  static getTenantConnection(tenantId) {
    const connection = ConnectionManager.#tenantConnections.get(tenantId);
    if (connection && connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED) {
      return connection;
    }
    return null;
  }

  /**
   * Gets all tenant connections
   * @static
   * @returns {Map<string, mongoose.Connection>} All tenant connections
   */
  static getAllTenantConnections() {
    return new Map(ConnectionManager.#tenantConnections);
  }

  /**
   * Close a tenant connection
   * @static
   * @async
   * @param {string} tenantId - Tenant identifier
   * @param {boolean} [force=false] - Force close connection
   * @returns {Promise<void>}
   */
  static async closeTenantConnection(tenantId, force = false) {
    try {
      const connection = ConnectionManager.#tenantConnections.get(tenantId);
      if (!connection) {
        logger.debug(`No tenant connection found to close: ${tenantId}`);
        return;
      }

      await connection.close(force);
      ConnectionManager.#tenantConnections.delete(tenantId);

      // Clean up from main connections if present
      const connectionName = `tenant_${tenantId}`;
      ConnectionManager.#connections.delete(connectionName);

      // Clear health check interval
      const intervalId = ConnectionManager.#healthCheckIntervals.get(connectionName);
      if (intervalId) {
        clearInterval(intervalId);
        ConnectionManager.#healthCheckIntervals.delete(connectionName);
      }

      logger.info('Tenant connection closed successfully', { tenantId, forced: force });

    } catch (error) {
      logger.error('Failed to close tenant connection', {
        tenantId,
        error: error.message
      });
      throw new AppError(
        `Failed to close tenant connection for ${tenantId}`,
        500,
        'TENANT_DISCONNECT_ERROR',
        { tenantId, originalError: error.message }
      );
    }
  }

  /**
   * Initialize multiple database connections based on configuration
   * @static
   * @async
   * @param {Object} [databaseConfig=config.database] - Database configuration
   * @param {Object} [options={}] - Connection options
   * @returns {Promise<Object>} Object containing all established connections
   * @throws {AppError} If any database connection fails
   */
  static async initializeMultipleDatabases(databaseConfig = config.database, options = {}) {
    try {
      logger.info('Initializing multiple database connections with comprehensive routing');

      // Initialize database mappings first
      ConnectionManager.initializeDatabaseMappings();

      const connections = {};
      const baseUri = databaseConfig.uri;

      // Generate database-specific URIs with proper naming
      const databaseUris = {
        admin: baseUri.replace(/\/([^?]+)(\?|$)/, '/insightserenity_admin$2'),
        shared: baseUri.replace(/\/([^?]+)(\?|$)/, '/insightserenity_shared$2'),
        audit: baseUri.replace(/\/([^?]+)(\?|$)/, '/insightserenity_audit$2'),
        analytics: databaseConfig.analyticsUri || baseUri.replace(/\/([^?]+)(\?|$)/, '/insightserenity_analytics$2')
      };

      // Establish connections for each database type
      for (const [dbType, uri] of Object.entries(databaseUris)) {
        try {
          const connectionName = `${dbType}_connection`;
          
          // Database-specific connection options
          const dbOptions = {
            ...ConnectionManager.#DEFAULT_OPTIONS,
            ...databaseConfig.options,
            ...options,
            // Optimize for specific database purposes
            ...(dbType === 'analytics' ? {
              maxPoolSize: 15,
              minPoolSize: 3,
              // bufferMaxEntries: 0,
              bufferCommands: false,
              readPreference: 'secondary'
            } : {}),
            ...(dbType === 'audit' ? {
              maxPoolSize: 10,
              minPoolSize: 2,
              writeConcern: { w: 'majority', j: true },
              readConcern: { level: 'majority' }
            } : {}),
            ...(dbType === 'admin' ? {
              maxPoolSize: 25,
              minPoolSize: 5,
              writeConcern: { w: 'majority' }
            } : {})
          };

          logger.info(`Establishing ${dbType} database connection`, {
            uri: uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
            maxPoolSize: dbOptions.maxPoolSize,
            purpose: ConnectionManager.#databasePurposes.get(dbType)?.purpose
          });

          const connection = await ConnectionManager.connect(connectionName, {
            uri: uri,
            options: dbOptions
          });

          connections[dbType] = connection;
          ConnectionManager.#databaseConnections.set(dbType, connection);

          // Setup collection routing for this database
          await ConnectionManager.setupCollectionRouting(dbType, connection);

          logger.info(`${dbType} database connection established successfully`, {
            connectionName,
            database: connection.db?.databaseName,
            readyState: connection.readyState,
            collectionsConfigured: ConnectionManager.#databasePurposes.get(dbType)?.collections?.length || 0
          });

        } catch (error) {
          logger.error(`Failed to connect to ${dbType} database`, {
            uri: databaseUris[dbType].replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
            error: error.message
          });

          // In development, continue with other connections
          if (config.environment?.isDevelopment || process.env.NODE_ENV === 'development') {
            logger.warn(`Continuing initialization despite ${dbType} database connection failure`);
            continue;
          }

          throw new AppError(
            `Failed to connect to ${dbType} database`,
            500,
            'MULTI_DATABASE_CONNECTION_ERROR',
            { 
              databaseType: dbType,
              databaseName: databaseUris[dbType],
              originalError: error.message 
            }
          );
        }
      }

      const connectedDatabases = Object.keys(connections);
      
      // Ensure at least one connection is available
      if (connectedDatabases.length === 0) {
        throw new AppError(
          'No database connections established',
          500,
          'NO_DATABASE_CONNECTIONS'
        );
      }

      // Set up cross-database fallbacks
      ConnectionManager.#setupFallbackRouting(connections);

      // Start comprehensive health monitoring
      ConnectionManager.#startComprehensiveHealthMonitoring();

      // Update global health status
      ConnectionManager.#updateGlobalHealthStatus();

      // Mark as initialized
      ConnectionManager.#initialized = true;

      logger.info('Multiple database initialization completed successfully', {
        totalDatabases: connectedDatabases.length,
        connectedDatabases,
        totalConnections: ConnectionManager.#connections.size,
        collectionMappings: ConnectionManager.#collectionToDatabase.size,
        routingCacheSize: ConnectionManager.#routingCache.size
      });

      return connections;

    } catch (error) {
      logger.error('Failed to initialize multiple databases', {
        error: error.message,
        stack: error.stack
      });

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
   * @private
   * Setup fallback routing for database connections
   * @static
   * @param {Object} connections - Available database connections
   */
  static #setupFallbackRouting(connections) {
    try {
      // If admin database failed, use shared as fallback
      if (!connections.admin && connections.shared) {
        logger.warn('Admin database not available, using shared as fallback');
        ConnectionManager.#databaseConnections.set('admin', connections.shared);
      }

      // If shared database failed, use admin as fallback
      if (!connections.shared && connections.admin) {
        logger.warn('Shared database not available, using admin as fallback');
        ConnectionManager.#databaseConnections.set('shared', connections.admin);
      }

      // If analytics database failed, use primary or admin as fallback
      if (!connections.analytics) {
        const fallback = connections.admin || connections.shared;
        if (fallback) {
          logger.warn('Analytics database not available, using fallback');
          ConnectionManager.#databaseConnections.set('analytics', fallback);
        }
      }

      // If audit database failed, use admin as fallback (critical for compliance)
      if (!connections.audit && connections.admin) {
        logger.warn('Audit database not available, using admin as fallback');
        ConnectionManager.#databaseConnections.set('audit', connections.admin);
      }

    } catch (error) {
      logger.error('Failed to setup fallback routing', { error: error.message });
    }
  }

  /**
   * Closes a specific connection with comprehensive cleanup
   * @static
   * @async
   * @param {string} connectionName - Connection identifier
   * @param {boolean} [force=false] - Force close connection
   * @returns {Promise<void>}
   * @throws {AppError} If disconnection fails
   */
  static async disconnect(connectionName, force = false) {
    try {
      const connection = ConnectionManager.#connections.get(connectionName);

      if (!connection) {
        logger.debug(`No connection found to disconnect: ${connectionName}`);
        return;
      }

      logger.info(`Closing database connection: ${connectionName}`, {
        force,
        readyState: connection.readyState
      });

      await connection.close(force);

      // Clean up from all mappings
      ConnectionManager.#connections.delete(connectionName);

      // Remove from database connections
      for (const [dbType, conn] of ConnectionManager.#databaseConnections) {
        if (conn === connection) {
          ConnectionManager.#databaseConnections.delete(dbType);
          logger.info(`Removed ${dbType} database connection mapping`);
        }
      }

      // Remove from tenant connections
      for (const [tenantId, conn] of ConnectionManager.#tenantConnections) {
        if (conn === connection) {
          ConnectionManager.#tenantConnections.delete(tenantId);
          logger.info(`Removed tenant connection: ${tenantId}`);
        }
      }

      // Clear routing cache entries for this connection
      for (const [collection, routing] of ConnectionManager.#routingCache) {
        if (routing.connection === connection) {
          ConnectionManager.#routingCache.delete(collection);
        }
      }

      // Clear health check interval
      const intervalId = ConnectionManager.#healthCheckIntervals.get(connectionName);
      if (intervalId) {
        clearInterval(intervalId);
        ConnectionManager.#healthCheckIntervals.delete(connectionName);
      }

      // Update connection stats
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.totalDisconnections++;
        stats.status = 'disconnected';
      }

      // Update global health status
      ConnectionManager.#updateGlobalHealthStatus();

      logger.info('Database connection closed successfully', {
        connectionName,
        forced: force
      });

    } catch (error) {
      logger.error('Failed to disconnect from database', {
        connectionName,
        error: error.message
      });
      throw new AppError(
        `Database disconnection failed for ${connectionName}`,
        500,
        'DISCONNECTION_ERROR',
        { connectionName, originalError: error.message }
      );
    }
  }

  /**
   * Closes all connections with comprehensive cleanup
   * @static
   * @async
   * @param {boolean} [force=false] - Force close connections
   * @returns {Promise<void>}
   */
  static async disconnectAll(force = false) {
    try {
      logger.info('Closing all database connections', {
        totalConnections: ConnectionManager.#connections.size,
        tenantConnections: ConnectionManager.#tenantConnections.size,
        force
      });

      // Close tenant connections first
      const tenantDisconnectPromises = Array.from(ConnectionManager.#tenantConnections.keys())
        .map(tenantId => ConnectionManager.closeTenantConnection(tenantId, force));

      await Promise.allSettled(tenantDisconnectPromises);

      // Close regular connections
      const disconnectPromises = Array.from(ConnectionManager.#connections.keys())
        .map(connectionName => ConnectionManager.disconnect(connectionName, force));

      await Promise.allSettled(disconnectPromises);

      // Clear all health check intervals
      ConnectionManager.#healthCheckIntervals.forEach(intervalId => {
        clearInterval(intervalId);
      });
      ConnectionManager.#healthCheckIntervals.clear();

      // Clear all caches and mappings
      ConnectionManager.#routingCache.clear();
      ConnectionManager.#connectionStats.clear();
      ConnectionManager.#databaseConnections.clear();

      // Reset global health status
      ConnectionManager.#globalHealthStatus = {
        healthy: false,
        lastCheck: new Date().toISOString(),
        totalConnections: 0,
        healthyConnections: 0,
        unhealthyConnections: 0,
        errors: []
      };

      // Mark as uninitialized
      ConnectionManager.#initialized = false;

      logger.info('All database connections closed successfully');

    } catch (error) {
      logger.error('Error during connection cleanup', { error: error.message });
      throw new AppError(
        'Connection cleanup failed',
        500,
        'CLEANUP_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Check comprehensive health status for a connection
   * @static
   * @async
   * @param {string} connectionName - Connection identifier
   * @returns {Promise<Object>} Detailed health status
   */
  static async checkHealth(connectionName) {
    try {
      const connection = ConnectionManager.#connections.get(connectionName);
      const stats = ConnectionManager.#connectionStats.get(connectionName);

      if (!connection) {
        return {
          status: 'not_found',
          connectionName,
          message: 'No active connection found',
          timestamp: new Date().toISOString()
        };
      }

      // Update health check stats
      if (stats) {
        stats.healthChecks.total++;
        stats.healthChecks.lastCheck = new Date().toISOString();
      }

      if (connection.readyState !== ConnectionManager.#CONNECTION_STATES.CONNECTED) {
        if (stats) {
          stats.healthChecks.failed++;
        }
        
        return {
          status: 'disconnected',
          connectionName,
          readyState: connection.readyState,
          message: `Connection not ready (state: ${connection.readyState})`,
          timestamp: new Date().toISOString()
        };
      }

      // Perform ping test with timeout
      const pingPromise = connection.db.admin().ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );

      await Promise.race([pingPromise, timeoutPromise]);

      // Test basic operations
      const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
      
      if (stats) {
        stats.healthChecks.successful++;
      }

      return {
        status: 'healthy',
        connectionName,
        readyState: connection.readyState,
        database: connection.db.databaseName,
        collections: collections.length,
        host: connection.host,
        port: connection.port,
        message: 'Connection healthy and responsive',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const stats = ConnectionManager.#connectionStats.get(connectionName);
      if (stats) {
        stats.healthChecks.failed++;
      }

      return {
        status: 'unhealthy',
        connectionName,
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Gets comprehensive connection statistics and health information
   * @static
   * @returns {Object} Detailed connection statistics
   */
  static getStats() {
    try {
      const stats = Array.from(ConnectionManager.#connectionStats.values());
      const healthyConnections = Array.from(ConnectionManager.#connections.values())
        .filter(conn => conn.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED);

      // Database type statistics
      const databaseTypeStats = {};
      for (const [dbType, connection] of ConnectionManager.#databaseConnections) {
        const purpose = ConnectionManager.#databasePurposes.get(dbType);
        databaseTypeStats[dbType] = {
          healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED,
          database: connection.db?.databaseName,
          purpose: purpose?.purpose,
          collections: purpose?.collections?.length || 0,
          priority: purpose?.priority
        };
      }

      // Tenant connection statistics
      const tenantStats = {
        total: ConnectionManager.#tenantConnections.size,
        healthy: Array.from(ConnectionManager.#tenantConnections.values())
          .filter(conn => conn.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED).length,
        tenants: Array.from(ConnectionManager.#tenantConnections.keys())
      };

      return {
        summary: {
          totalConnections: ConnectionManager.#connections.size,
          healthyConnections: healthyConnections.length,
          unhealthyConnections: ConnectionManager.#connections.size - healthyConnections.length,
          tenantConnections: ConnectionManager.#tenantConnections.size,
          initialized: ConnectionManager.#initialized
        },
        connections: {
          regular: stats,
          database: databaseTypeStats,
          tenant: tenantStats
        },
        routing: {
          totalMappedCollections: ConnectionManager.#collectionToDatabase.size,
          routingCacheSize: ConnectionManager.#routingCache.size,
          databasePurposes: Object.fromEntries(
            Array.from(ConnectionManager.#databasePurposes.entries()).map(([type, config]) => [
              type,
              {
                purpose: config.purpose,
                collections: config.collections.length,
                priority: config.priority
              }
            ])
          )
        },
        globalHealth: ConnectionManager.#globalHealthStatus,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to generate connection statistics', { error: error.message });
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute a transaction on the appropriate database connection
   * @static
   * @async
   * @param {Function} callback - Transaction callback function
   * @param {Object} [options={}] - Transaction options
   * @param {string} [options.database='admin'] - Target database type
   * @returns {Promise<*>} Transaction result
   * @throws {AppError} If transaction fails
   */
  static async executeTransaction(callback, options = {}) {
    try {
      const { database = 'admin', ...transactionOptions } = options;
      
      const connection = ConnectionManager.getDatabaseConnection(database);
      if (!connection) {
        throw new AppError(
          `No connection available for database: ${database}`,
          500,
          'NO_CONNECTION_FOR_TRANSACTION'
        );
      }

      const session = await connection.startSession();

      try {
        const result = await session.withTransaction(callback, {
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' },
          ...transactionOptions
        });

        logger.info('Transaction completed successfully', {
          database,
          connectionName: connection.name
        });

        return result;
      } finally {
        await session.endSession();
      }

    } catch (error) {
      logger.error('Transaction execution failed', {
        error: error.message,
        database: options.database
      });

      throw new AppError(
        'Transaction execution failed',
        500,
        'TRANSACTION_ERROR',
        { 
          database: options.database,
          originalError: error.message 
        }
      );
    }
  }

  /**
   * Gets database instance from connection
   * @static
   * @param {string} [connectionName='primary'] - Connection identifier
   * @returns {mongoose.Db|null} Database instance
   */
  static getDatabase(connectionName = 'primary') {
    const connection = ConnectionManager.getConnection(connectionName);
    return connection ? connection.db : null;
  }

  /**
   * Gets database instance for specific type
   * @static
   * @param {string} dbType - Database type
   * @returns {mongoose.Db|null} Database instance
   */
  static getDatabaseInstance(dbType) {
    const connection = ConnectionManager.getDatabaseConnection(dbType);
    return connection ? connection.db : null;
  }

  /**
   * Test all database connections and operations
   * @static
   * @async
   * @returns {Promise<Object>} Test results for all connections
   */
  static async testAllConnections() {
    try {
      const testResults = new Map();

      // Test regular connections
      for (const [connectionName, connection] of ConnectionManager.#connections) {
        try {
          const result = await ConnectionManager.#testConnection(connectionName, connection);
          testResults.set(connectionName, result);
        } catch (error) {
          testResults.set(connectionName, {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Test tenant connections
      for (const [tenantId, connection] of ConnectionManager.#tenantConnections) {
        try {
          const connectionName = `tenant_${tenantId}`;
          const result = await ConnectionManager.#testConnection(connectionName, connection);
          testResults.set(connectionName, { ...result, tenantId });
        } catch (error) {
          testResults.set(`tenant_${tenantId}`, {
            success: false,
            error: error.message,
            tenantId,
            timestamp: new Date().toISOString()
          });
        }
      }

      const successfulTests = Array.from(testResults.values()).filter(r => r.success).length;
      const totalTests = testResults.size;

      logger.info('Connection testing completed', {
        totalTests,
        successfulTests,
        failedTests: totalTests - successfulTests,
        successRate: totalTests > 0 ? ((successfulTests / totalTests) * 100).toFixed(1) + '%' : '0%'
      });

      return {
        summary: {
          totalTests,
          successfulTests,
          failedTests: totalTests - successfulTests,
          successRate: totalTests > 0 ? (successfulTests / totalTests) * 100 : 0
        },
        results: Object.fromEntries(testResults),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Connection testing failed', { error: error.message });
      throw new AppError(
        'Connection testing failed',
        500,
        'CONNECTION_TEST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Test a specific connection
   * @static
   * @async
   * @param {string} connectionName - Connection identifier
   * @param {mongoose.Connection} connection - Database connection
   * @returns {Promise<Object>} Test result
   */
  static async #testConnection(connectionName, connection) {
    try {
      // Test basic connectivity
      await connection.db.admin().ping();

      // Test read operations
      const collections = await connection.db.listCollections().toArray();

      // Test write operations (safe test)
      const testCollection = connection.db.collection('_connection_health_test');
      const testDoc = {
        test: true,
        timestamp: new Date(),
        connectionName,
        serverInstance: process.pid
      };

      const insertResult = await testCollection.insertOne(testDoc);
      await testCollection.deleteOne({ _id: insertResult.insertedId });

      return {
        success: true,
        connectionName,
        database: connection.db.databaseName,
        collections: collections.length,
        readOperations: true,
        writeOperations: true,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        connectionName,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get comprehensive status for all connections and routing
   * @static
   * @returns {Object} Complete status information
   */
  static getStatus() {
    try {
      return {
        initialized: ConnectionManager.#initialized,
        connections: ConnectionManager.getStats(),
        routing: ConnectionManager.getConnectionRouting(),
        health: ConnectionManager.#globalHealthStatus,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get connection manager status', { error: error.message });
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Clear all connection data and reset state (for testing and recovery)
   * @static
   */
  static clearAll() {
    try {
      // Clear all intervals
      ConnectionManager.#healthCheckIntervals.forEach(intervalId => {
        clearInterval(intervalId);
      });

      // Clear all data structures
      ConnectionManager.#connections.clear();
      ConnectionManager.#connectionStats.clear();
      ConnectionManager.#healthCheckIntervals.clear();
      ConnectionManager.#databaseConnections.clear();
      ConnectionManager.#tenantConnections.clear();
      ConnectionManager.#databasePurposes.clear();
      ConnectionManager.#collectionToDatabase.clear();
      ConnectionManager.#routingCache.clear();

      // Reset state
      ConnectionManager.#initialized = false;
      ConnectionManager.#globalHealthStatus = {
        healthy: false,
        lastCheck: null,
        totalConnections: 0,
        healthyConnections: 0,
        unhealthyConnections: 0,
        errors: []
      };

      logger.info('All connection data cleared and state reset');

    } catch (error) {
      logger.error('Failed to clear connection data', { error: error.message });
    }
  }

  /**
   * Force reconnection for all unhealthy connections
   * @static
   * @async
   * @returns {Promise<Object>} Reconnection results
   */
  static async forceReconnectUnhealthy() {
    try {
      const reconnectionResults = new Map();
      const unhealthyConnections = [];

      // Identify unhealthy connections
      for (const [connectionName, connection] of ConnectionManager.#connections) {
        if (connection.readyState !== ConnectionManager.#CONNECTION_STATES.CONNECTED) {
          unhealthyConnections.push(connectionName);
        }
      }

      logger.info('Force reconnecting unhealthy connections', {
        unhealthyConnections: unhealthyConnections.length,
        connections: unhealthyConnections
      });

      // Attempt reconnection for each unhealthy connection
      for (const connectionName of unhealthyConnections) {
        try {
          // Get original connection config from stats
          const stats = ConnectionManager.#connectionStats.get(connectionName);
          if (stats) {
            // Force disconnect first
            await ConnectionManager.disconnect(connectionName, true);
            
            // Note: Would need original URI and options stored to properly reconnect
            // For now, mark as needing manual intervention
            reconnectionResults.set(connectionName, {
              success: false,
              action: 'manual_intervention_required',
              message: 'Connection requires manual reconfiguration'
            });
          }
        } catch (error) {
          reconnectionResults.set(connectionName, {
            success: false,
            error: error.message
          });
        }
      }

      return {
        attempted: unhealthyConnections.length,
        results: Object.fromEntries(reconnectionResults),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Force reconnection failed', { error: error.message });
      throw new AppError(
        'Force reconnection failed',
        500,
        'FORCE_RECONNECT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Get connection health summary
   * @static
   * @returns {Object} Health summary for all connections
   */
  static getHealthSummary() {
    try {
      const summary = {
        global: ConnectionManager.#globalHealthStatus,
        connections: {},
        databases: {},
        tenants: {},
        routing: {
          totalCollections: ConnectionManager.#collectionToDatabase.size,
          cacheSize: ConnectionManager.#routingCache.size,
          databaseTypes: ConnectionManager.#databasePurposes.size
        },
        timestamp: new Date().toISOString()
      };

      // Connection-level health
      for (const [name, stats] of ConnectionManager.#connectionStats) {
        summary.connections[name] = {
          status: stats.status,
          healthy: stats.status === 'connected',
          attempts: stats.attempts,
          lastSuccess: stats.lastSuccess,
          lastError: stats.lastError,
          healthChecks: stats.healthChecks
        };
      }

      // Database-level health
      for (const [dbType, connection] of ConnectionManager.#databaseConnections) {
        summary.databases[dbType] = {
          healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED,
          database: connection.db?.databaseName,
          readyState: connection.readyState
        };
      }

      // Tenant-level health
      for (const [tenantId, connection] of ConnectionManager.#tenantConnections) {
        summary.tenants[tenantId] = {
          healthy: connection.readyState === ConnectionManager.#CONNECTION_STATES.CONNECTED,
          database: connection.db?.databaseName,
          readyState: connection.readyState
        };
      }

      return summary;

    } catch (error) {
      logger.error('Failed to generate health summary', { error: error.message });
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check if connection manager is properly initialized
   * @static
   * @returns {boolean} Whether the connection manager is initialized
   */
  static isInitialized() {
    return ConnectionManager.#initialized;
  }

  /**
   * Get total number of active connections
   * @static
   * @returns {number} Total active connections
   */
  static getConnectionCount() {
    return ConnectionManager.#connections.size + ConnectionManager.#tenantConnections.size;
  }

  /**
   * Get collection to database routing map
   * @static
   * @returns {Map<string, string>} Collection to database type mapping
   */
  static getCollectionRouting() {
    return new Map(ConnectionManager.#collectionToDatabase);
  }
}

module.exports = ConnectionManager;