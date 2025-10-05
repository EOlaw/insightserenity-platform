/**
 * @fileoverview DatabaseManager - Manages multiple MongoDB database connections with advanced features
 * @module shared/lib/database/database-manager
 * @requires mongoose
 * @requires events
 * @requires winston
 * @requires lodash
 */

const mongoose = require('mongoose');
const EventEmitter = require('events');
const winston = require('winston');
const _ = require('lodash');
const { performance } = require('perf_hooks');
const crypto = require('crypto');

/**
 * @class DatabaseManager
 * @extends EventEmitter
 * @description Manages multiple MongoDB database connections with connection pooling,
 * health monitoring, retry logic, and graceful shutdown capabilities
 */
class DatabaseManager extends EventEmitter {
    /**
     * Creates an instance of DatabaseManager
     * @param {Object} options - Configuration options
     * @param {Object} options.config - Database configuration object
     * @param {Object} options.logger - Winston logger instance
     * @param {Object} options.monitoring - Monitoring configuration
     */
    constructor(options = {}) {
        super();

        // Initialize configuration
        this.config = options.config || {};
        this.logger = options.logger || this._createDefaultLogger();
        this.monitoring = options.monitoring || {};

        // Connection storage
        this.connections = new Map();
        this.connectionStates = new Map();
        this.connectionPools = new Map();
        this.connectionMetrics = new Map();

        // Connection retry configuration
        this.retryConfiguration = {
            maxRetries: this.config.maxRetries || 5,
            initialDelay: this.config.initialRetryDelay || 1000,
            maxDelay: this.config.maxRetryDelay || 30000,
            factor: this.config.retryFactor || 2,
            randomize: this.config.retryRandomize !== false
        };

        // Circuit breaker configuration
        this.circuitBreaker = {
            threshold: this.config.circuitBreakerThreshold || 5,
            timeout: this.config.circuitBreakerTimeout || 60000,
            states: new Map()
        };

        // Health check configuration
        this.healthCheck = {
            enabled: this.config.healthCheckEnabled !== false,
            interval: this.config.healthCheckInterval || 30000,
            timeout: this.config.healthCheckTimeout || 5000,
            timers: new Map()
        };

        // Performance monitoring
        this.performanceMetrics = {
            connectionAttempts: new Map(),
            queryExecutions: new Map(),
            connectionDurations: new Map(),
            errorCounts: new Map()
        };

        // Connection pool settings
        this.poolSettings = {
            default: {
                minPoolSize: 5,
                maxPoolSize: 100,
                maxIdleTimeMS: 60000,
                waitQueueTimeoutMS: 30000,
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                heartbeatFrequencyMS: 10000
            },
            production: {
                minPoolSize: 10,
                maxPoolSize: 200,
                maxIdleTimeMS: 120000,
                waitQueueTimeoutMS: 60000,
                serverSelectionTimeoutMS: 45000,
                socketTimeoutMS: 60000,
                heartbeatFrequencyMS: 5000
            },
            development: {
                minPoolSize: 2,
                maxPoolSize: 50,
                maxIdleTimeMS: 30000,
                waitQueueTimeoutMS: 15000,
                serverSelectionTimeoutMS: 15000,
                socketTimeoutMS: 30000,
                heartbeatFrequencyMS: 15000
            },
            test: {
                minPoolSize: 1,
                maxPoolSize: 10,
                maxIdleTimeMS: 10000,
                waitQueueTimeoutMS: 5000,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 10000,
                heartbeatFrequencyMS: 20000
            }
        };

        // Initialize monitoring
        this._initializeMonitoring();

        // Setup shutdown handlers
        this._setupShutdownHandlers();

        // Initialize connection state machine
        this._initializeStateMachine();

        this.logger.info('DatabaseManager initialized', {
            environment: process.env.NODE_ENV,
            retryConfiguration: this.retryConfiguration,
            healthCheckEnabled: this.healthCheck.enabled
        });
    }

    /**
     * Creates a default Winston logger instance
     * @private
     * @returns {winston.Logger} Logger instance
     */
    _createDefaultLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'database-manager' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    /**
     * Initializes monitoring capabilities
     * @private
     */
    _initializeMonitoring() {
        this.monitoringState = {
            startTime: Date.now(),
            totalConnections: 0,
            successfulConnections: 0,
            failedConnections: 0,
            totalQueries: 0,
            slowQueries: 0,
            errors: []
        };

        // Setup performance monitoring
        if (this.monitoring.enabled) {
            setInterval(() => {
                this._collectPerformanceMetrics();
            }, this.monitoring.interval || 60000);
        }
    }

    /**
     * Initializes connection state machine
     * @private
     */
    _initializeStateMachine() {
        this.connectionStates.set('states', {
            DISCONNECTED: 'disconnected',
            CONNECTING: 'connecting',
            CONNECTED: 'connected',
            DISCONNECTING: 'disconnecting',
            ERROR: 'error',
            RECONNECTING: 'reconnecting'
        });

        this.connectionStates.set('transitions', {
            disconnected: ['connecting'],
            connecting: ['connected', 'error', 'disconnected'],
            connected: ['disconnecting', 'error', 'reconnecting'],
            disconnecting: ['disconnected', 'error'],
            error: ['connecting', 'disconnected'],
            reconnecting: ['connected', 'error', 'disconnected']
        });
    }

    /**
     * Creates a new database connection with advanced configuration
     * @param {string} name - Connection name identifier
     * @param {Object} connectionConfig - Connection configuration
     * @returns {Promise<mongoose.Connection>} MongoDB connection instance
     */
    async createConnection(name, connectionConfig) {
        const startTime = performance.now();

        try {
            // Validate connection name
            if (!name || typeof name !== 'string') {
                throw new Error('Invalid connection name provided');
            }

            // Check if connection already exists
            if (this.connections.has(name)) {
                this.logger.warn(`Connection "${name}" already exists, returning existing connection`);
                return this.connections.get(name);
            }

            // Validate configuration
            const config = this._validateConnectionConfig(connectionConfig);

            // Check circuit breaker state
            if (this._isCircuitOpen(name)) {
                throw new Error(`Circuit breaker is open for connection "${name}"`);
            }

            // Update connection state
            this._updateConnectionState(name, 'connecting');

            // Create connection with retry logic
            const connection = await this._createConnectionWithRetry(name, config);

            // Store connection
            this.connections.set(name, connection);

            // Setup connection event handlers
            this._setupConnectionEventHandlers(name, connection);

            // Initialize connection pool monitoring
            this._initializeConnectionPoolMonitoring(name, connection);

            // Start health checks
            if (this.healthCheck.enabled) {
                this._startHealthCheck(name, connection);
            }

            // Update metrics
            const duration = performance.now() - startTime;
            this._updateConnectionMetrics(name, 'success', duration);

            // Update connection state
            this._updateConnectionState(name, 'connected');

            // Emit connection event
            this.emit('connection:created', { name, duration });

            this.logger.info(`Database connection "${name}" created successfully`, {
                name,
                uri: this._sanitizeUri(config.uri),
                duration: `${duration.toFixed(2)}ms`
            });

            return connection;

        } catch (error) {
            const duration = performance.now() - startTime;
            this._updateConnectionMetrics(name, 'failure', duration);
            this._updateConnectionState(name, 'error');

            // Update circuit breaker
            this._recordCircuitBreakerFailure(name);

            this.logger.error(`Failed to create connection "${name}"`, {
                name,
                error: error.message,
                stack: error.stack,
                duration: `${duration.toFixed(2)}ms`
            });

            throw error;
        }
    }

    /**
     * Creates connection with retry logic
     * @private
     * @param {string} name - Connection name
     * @param {Object} config - Connection configuration
     * @returns {Promise<mongoose.Connection>} Connection instance
     */
    async _createConnectionWithRetry(name, config) {
        let lastError;
        let retryCount = 0;
        const maxRetries = this.retryConfiguration.maxRetries;

        while (retryCount <= maxRetries) {
            try {
                // Calculate delay with exponential backoff
                if (retryCount > 0) {
                    const delay = this._calculateRetryDelay(retryCount);
                    this.logger.info(`Retrying connection "${name}" (attempt ${retryCount}/${maxRetries}) after ${delay}ms`);
                    await this._delay(delay);
                }

                // Create mongoose connection
                const connection = await this._establishMongooseConnection(name, config);

                // Reset circuit breaker on success
                this._resetCircuitBreaker(name);

                return connection;

            } catch (error) {
                lastError = error;
                retryCount++;

                this.logger.warn(`Connection attempt ${retryCount}/${maxRetries} failed for "${name}"`, {
                    error: error.message
                });

                if (retryCount > maxRetries) {
                    break;
                }
            }
        }

        throw new Error(`Failed to connect to database "${name}" after ${maxRetries} retries: ${lastError.message}`);
    }

    /**
     * Establishes mongoose connection with proper configuration
     * @private
     * @param {string} name - Connection name
     * @param {Object} config - Connection configuration
     * @returns {Promise<mongoose.Connection>} Connection instance
     */
    async _establishMongooseConnection(name, config) {
        // Get environment-specific pool settings
        const environment = process.env.NODE_ENV || 'development';
        const poolConfig = this.poolSettings[environment] || this.poolSettings.default;

        // Merge configurations
        const connectionOptions = {
            ...poolConfig,
            ...config.options,
            // MongoDB driver options
            // useNewUrlParser: true,
            // useUnifiedTopology: true,
            // Connection string options
            authSource: config.authSource || 'admin',
            retryWrites: config.retryWrites !== false,
            w: config.writeConcern || 'majority',
            // Additional options for MongoDB Atlas
            ...(config.isAtlas && {
                ssl: true,
                // sslValidate removed - not supported in newer MongoDB drivers
                sslCA: config.sslCA,
                readPreference: config.readPreference || 'primaryPreferred',
                readConcern: { level: config.readConcernLevel || 'majority' }
            })
        };

        // Create connection
        const connection = mongoose.createConnection(config.uri, connectionOptions);

        // Wait for connection to be established
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout for "${name}"`));
            }, connectionOptions.serverSelectionTimeoutMS);

            connection.once('connected', () => {
                clearTimeout(timeout);
                resolve();
            });

            connection.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        return connection;
    }

    /**
     * Validates connection configuration
     * @private
     * @param {Object} config - Connection configuration
     * @returns {Object} Validated configuration
     */
    _validateConnectionConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid connection configuration provided');
        }

        if (!config.uri || typeof config.uri !== 'string') {
            throw new Error('Database URI is required');
        }

        // Validate URI format
        const uriPattern = /^mongodb(\+srv)?:\/\/.+/;
        if (!uriPattern.test(config.uri)) {
            throw new Error('Invalid MongoDB URI format');
        }

        return {
            uri: config.uri,
            options: config.options || {},
            authSource: config.authSource,
            isAtlas: config.uri.includes('mongodb+srv') || config.isAtlas,
            retryWrites: config.retryWrites,
            writeConcern: config.writeConcern,
            readPreference: config.readPreference,
            readConcernLevel: config.readConcernLevel,
            sslCA: config.sslCA
        };
    }

    /**
     * Sets up connection event handlers
     * @private
     * @param {string} name - Connection name
     * @param {mongoose.Connection} connection - Connection instance
     */
    _setupConnectionEventHandlers(name, connection) {
        // Connected event
        connection.on('connected', () => {
            this._updateConnectionState(name, 'connected');
            this.logger.info(`Database "${name}" connected`);
            this.emit('connection:connected', { name });
        });

        // Disconnected event
        connection.on('disconnected', () => {
            this._updateConnectionState(name, 'disconnected');
            this.logger.warn(`Database "${name}" disconnected`);
            this.emit('connection:disconnected', { name });
        });

        // Error event
        connection.on('error', (error) => {
            this._updateConnectionState(name, 'error');
            this.logger.error(`Database "${name}" error`, {
                error: error.message,
                stack: error.stack
            });
            this.emit('connection:error', { name, error });
        });

        // Reconnected event
        connection.on('reconnected', () => {
            this._updateConnectionState(name, 'connected');
            this.logger.info(`Database "${name}" reconnected`);
            this.emit('connection:reconnected', { name });
        });

        // Reconnect failed event
        connection.on('reconnectFailed', () => {
            this._updateConnectionState(name, 'error');
            this.logger.error(`Database "${name}" reconnection failed`);
            this.emit('connection:reconnectFailed', { name });
        });

        // Close event
        connection.on('close', () => {
            this._updateConnectionState(name, 'disconnected');
            this.logger.info(`Database "${name}" connection closed`);
            this.emit('connection:closed', { name });
        });

        // Monitor connection pool events
        const client = connection.getClient();
        if (client) {
            // Connection pool created
            client.on('connectionPoolCreated', (event) => {
                this.logger.debug(`Connection pool created for "${name}"`, event);
            });

            // Connection pool closed
            client.on('connectionPoolClosed', (event) => {
                this.logger.debug(`Connection pool closed for "${name}"`, event);
            });

            // Connection created
            client.on('connectionCreated', (event) => {
                this._updatePoolMetrics(name, 'connectionCreated', event);
            });

            // Connection closed
            client.on('connectionClosed', (event) => {
                this._updatePoolMetrics(name, 'connectionClosed', event);
            });

            // Connection check out
            client.on('connectionCheckedOut', (event) => {
                this._updatePoolMetrics(name, 'connectionCheckedOut', event);
            });

            // Connection check in
            client.on('connectionCheckedIn', (event) => {
                this._updatePoolMetrics(name, 'connectionCheckedIn', event);
            });
        }
    }

    /**
     * Initializes connection pool monitoring
     * @private
     * @param {string} name - Connection name
     * @param {mongoose.Connection} connection - Connection instance
     */
    _initializeConnectionPoolMonitoring(name, connection) {
        const poolMetrics = {
            totalConnections: 0,
            availableConnections: 0,
            pendingConnections: 0,
            currentCheckouts: 0,
            totalCheckouts: 0,
            totalCheckins: 0,
            totalTimeouts: 0,
            averageCheckoutTime: 0,
            checkoutTimes: []
        };

        this.connectionPools.set(name, poolMetrics);

        // Setup periodic pool status monitoring
        const monitoringInterval = setInterval(() => {
            if (connection.readyState === 1) {
                this._monitorConnectionPool(name, connection);
            }
        }, 10000); // Check every 10 seconds

        // Store interval for cleanup
        if (!this.monitoringIntervals) {
            this.monitoringIntervals = new Map();
        }
        this.monitoringIntervals.set(name, monitoringInterval);
    }

    /**
     * Monitors connection pool status
     * @private
     * @param {string} name - Connection name
     * @param {mongoose.Connection} connection - Connection instance
     */
    _monitorConnectionPool(name, connection) {
        try {
            const client = connection.getClient();
            if (!client) return;

            // Get topology for pool statistics
            const topology = client.topology;
            if (!topology) return;

            const servers = topology.s.servers;
            if (!servers) return;

            let totalConnections = 0;
            let availableConnections = 0;
            let pendingConnections = 0;

            servers.forEach((server) => {
                if (server.s && server.s.pool) {
                    const pool = server.s.pool;
                    totalConnections += pool.totalConnectionCount || 0;
                    availableConnections += pool.availableConnectionCount || 0;
                    pendingConnections += pool.pendingConnectionCount || 0;
                }
            });

            const poolMetrics = this.connectionPools.get(name);
            if (poolMetrics) {
                poolMetrics.totalConnections = totalConnections;
                poolMetrics.availableConnections = availableConnections;
                poolMetrics.pendingConnections = pendingConnections;

                // Calculate average checkout time
                if (poolMetrics.checkoutTimes.length > 0) {
                    const sum = poolMetrics.checkoutTimes.reduce((a, b) => a + b, 0);
                    poolMetrics.averageCheckoutTime = sum / poolMetrics.checkoutTimes.length;

                    // Keep only last 100 measurements
                    if (poolMetrics.checkoutTimes.length > 100) {
                        poolMetrics.checkoutTimes = poolMetrics.checkoutTimes.slice(-100);
                    }
                }
            }

            // Log pool status if in debug mode
            if (process.env.LOG_LEVEL === 'debug') {
                this.logger.debug(`Connection pool status for "${name}"`, {
                    total: totalConnections,
                    available: availableConnections,
                    pending: pendingConnections
                });
            }

        } catch (error) {
            this.logger.error(`Error monitoring connection pool for "${name}"`, {
                error: error.message
            });
        }
    }

    /**
     * Updates pool metrics
     * @private
     * @param {string} name - Connection name
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    _updatePoolMetrics(name, event, data) {
        const poolMetrics = this.connectionPools.get(name);
        if (!poolMetrics) return;

        switch (event) {
            case 'connectionCheckedOut':
                poolMetrics.currentCheckouts++;
                poolMetrics.totalCheckouts++;
                poolMetrics.lastCheckoutTime = Date.now();
                break;

            case 'connectionCheckedIn':
                poolMetrics.currentCheckouts = Math.max(0, poolMetrics.currentCheckouts - 1);
                poolMetrics.totalCheckins++;

                // Calculate checkout duration
                if (poolMetrics.lastCheckoutTime) {
                    const duration = Date.now() - poolMetrics.lastCheckoutTime;
                    poolMetrics.checkoutTimes.push(duration);
                }
                break;

            case 'connectionCreated':
                poolMetrics.totalConnections++;
                break;

            case 'connectionClosed':
                poolMetrics.totalConnections = Math.max(0, poolMetrics.totalConnections - 1);
                break;
        }
    }

    /**
     * Starts health check for a connection
     * @private
     * @param {string} name - Connection name
     * @param {mongoose.Connection} connection - Connection instance
     */
    _startHealthCheck(name, connection) {
        // Clear existing health check if any
        if (this.healthCheck.timers.has(name)) {
            clearInterval(this.healthCheck.timers.get(name));
        }

        // Setup health check interval
        const healthCheckTimer = setInterval(async () => {
            await this.performHealthCheck(name);
        }, this.healthCheck.interval);

        this.healthCheck.timers.set(name, healthCheckTimer);

        // Perform initial health check
        this.performHealthCheck(name);
    }

    /**
     * Performs health check on a connection
     * @param {string} name - Connection name
     * @returns {Promise<Object>} Health check result
     */
    async performHealthCheck(name) {
        const startTime = performance.now();

        try {
            const connection = this.connections.get(name);

            if (!connection) {
                return {
                    status: 'disconnected',
                    responseTime: 0,
                    error: 'Connection not found'
                };
            }

            // Check connection state
            const state = connection.readyState;

            if (state !== 1) { // 1 = connected
                return {
                    status: 'disconnected',
                    responseTime: 0,
                    error: `Connection state: ${this._getReadyStateString(state)}`
                };
            }

            // Use a simple ping command instead of serverStatus for MongoDB Atlas compatibility
            try {
                // Simple ping command that works with MongoDB Atlas
                await connection.db.admin().ping();

                const responseTime = performance.now() - startTime;

                // Build health result
                const healthResult = {
                    status: 'healthy',
                    responseTime: `${responseTime.toFixed(2)}ms`,
                    databases: connection.db.databaseName,
                    connections: {
                        current: connection.connections?.length || 1,
                        available: connection.connections?.length || 1
                    }
                };

                // Update health metrics
                this._updateHealthMetrics(name, healthResult);

                return healthResult;

            } catch (pingError) {
                // If ping fails, try a simple listCollections as fallback
                try {
                    await connection.db.listCollections().limit(1).toArray();

                    const responseTime = performance.now() - startTime;

                    const healthResult = {
                        status: 'healthy',
                        responseTime: `${responseTime.toFixed(2)}ms`,
                        databases: connection.db.databaseName,
                        connections: {
                            current: 1,
                            available: 1
                        }
                    };

                    this._updateHealthMetrics(name, healthResult);
                    return healthResult;
                } catch (fallbackError) {
                    throw fallbackError;
                }
            }

        } catch (error) {
            const responseTime = performance.now() - startTime;

            this.logger.error(`Health check failed for "${name}"`, {
                error: error.message,
                responseTime: `${responseTime.toFixed(2)}ms`
            });

            // Don't log permission errors as critical
            if (error.message.includes('not allowed to do action')) {
                this.logger.info(`Note: Health check using limited permissions for "${name}". Connection is still functional.`);

                // Return healthy with limited info if it's just a permission issue
                const healthResult = {
                    status: 'healthy',
                    responseTime: `${responseTime.toFixed(2)}ms`,
                    limited: true,
                    note: 'Limited health check due to MongoDB Atlas permissions'
                };

                this._updateHealthMetrics(name, healthResult);
                return healthResult;
            }

            const unhealthyResult = {
                status: 'unhealthy',
                responseTime: `${responseTime.toFixed(2)}ms`,
                error: error.message
            };

            this._updateHealthMetrics(name, unhealthyResult);
            return unhealthyResult;
        }
    }

    /**
     * Updates health metrics for a connection
     * @private
     * @param {string} name - Connection name
     * @param {Object} metrics - Health metrics
     */
    _updateHealthMetrics(name, metrics) {
        if (!this.connectionMetrics.has(name)) {
            this.connectionMetrics.set(name, {
                health: {},
                performance: {},
                errors: []
            });
        }

        const connectionMetrics = this.connectionMetrics.get(name);
        connectionMetrics.health = {
            ...metrics,
            lastCheck: new Date().toISOString()
        };

        // Keep error history (last 10 errors)
        if (metrics.status === 'unhealthy' && metrics.error) {
            connectionMetrics.errors.push({
                timestamp: new Date().toISOString(),
                error: metrics.error
            });

            if (connectionMetrics.errors.length > 10) {
                connectionMetrics.errors = connectionMetrics.errors.slice(-10);
            }
        }
    }

    /**
     * Gets a connection by name
     * @param {string} name - Connection name
     * @returns {mongoose.Connection|null} Connection instance or null
     */
    getConnection(name) {
        const connection = this.connections.get(name);

        if (!connection) {
            this.logger.warn(`Connection "${name}" not found`);
            return null;
        }

        // Check connection state
        if (connection.readyState !== 1) {
            this.logger.warn(`Connection "${name}" is not ready`, {
                readyState: connection.readyState
            });
        }

        return connection;
    }

    /**
     * Gets all connections
     * @returns {Map<string, mongoose.Connection>} All connections
     */
    getAllConnections() {
        return new Map(this.connections);
    }

    /**
     * Closes a specific connection
     * @param {string} name - Connection name
     * @param {boolean} force - Force close without waiting
     * @returns {Promise<void>}
     */
    async closeConnection(name, force = false) {
        const connection = this.connections.get(name);

        if (!connection) {
            this.logger.warn(`Connection "${name}" not found for closing`);
            return;
        }

        try {
            this._updateConnectionState(name, 'disconnecting');

            // Stop health checks
            if (this.healthCheck.timers.has(name)) {
                clearInterval(this.healthCheck.timers.get(name));
                this.healthCheck.timers.delete(name);
            }

            // Stop monitoring
            if (this.monitoringIntervals && this.monitoringIntervals.has(name)) {
                clearInterval(this.monitoringIntervals.get(name));
                this.monitoringIntervals.delete(name);
            }

            // Close connection
            await connection.close(force);

            // Remove from connections map
            this.connections.delete(name);
            this.connectionStates.delete(name);
            this.connectionPools.delete(name);
            this.connectionMetrics.delete(name);

            this.logger.info(`Connection "${name}" closed successfully`);
            this.emit('connection:closed', { name });

        } catch (error) {
            this.logger.error(`Error closing connection "${name}"`, {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Closes all connections
     * @param {boolean} force - Force close without waiting
     * @returns {Promise<void>}
     */
    async closeAllConnections(force = false) {
        const closePromises = [];

        for (const [name] of this.connections) {
            closePromises.push(this.closeConnection(name, force));
        }

        await Promise.allSettled(closePromises);

        this.logger.info('All database connections closed');
    }

    /**
     * Gets health status for all connections
     * @returns {Object} Health status object
     */
    getHealthStatus() {
        const status = {
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.monitoringState.startTime,
            environment: process.env.NODE_ENV || 'development',
            connections: {}
        };

        for (const [name, connection] of this.connections) {
            const metrics = this.connectionMetrics.get(name) || {};
            const poolMetrics = this.connectionPools.get(name) || {};
            const state = this._getConnectionState(name);

            status.connections[name] = {
                state,
                readyState: connection.readyState,
                health: metrics.health || {},
                pool: {
                    total: poolMetrics.totalConnections || 0,
                    available: poolMetrics.availableConnections || 0,
                    pending: poolMetrics.pendingConnections || 0,
                    currentCheckouts: poolMetrics.currentCheckouts || 0,
                    averageCheckoutTime: poolMetrics.averageCheckoutTime || 0
                },
                errors: metrics.errors || []
            };
        }

        return status;
    }

    /**
     * Gets performance metrics
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        return {
            timestamp: new Date().toISOString(),
            connections: Object.fromEntries(this.performanceMetrics.connectionAttempts),
            queries: Object.fromEntries(this.performanceMetrics.queryExecutions),
            durations: Object.fromEntries(this.performanceMetrics.connectionDurations),
            errors: Object.fromEntries(this.performanceMetrics.errorCounts),
            monitoring: this.monitoringState
        };
    }

    /**
     * Circuit breaker methods
     */

    /**
     * Checks if circuit is open for a connection
     * @private
     * @param {string} name - Connection name
     * @returns {boolean} True if circuit is open
     */
    _isCircuitOpen(name) {
        const state = this.circuitBreaker.states.get(name);

        if (!state || state.status !== 'open') {
            return false;
        }

        // Check if timeout has passed
        if (Date.now() - state.openedAt > this.circuitBreaker.timeout) {
            // Move to half-open state
            state.status = 'half-open';
            return false;
        }

        return true;
    }

    /**
     * Records circuit breaker failure
     * @private
     * @param {string} name - Connection name
     */
    _recordCircuitBreakerFailure(name) {
        let state = this.circuitBreaker.states.get(name);

        if (!state) {
            state = {
                status: 'closed',
                failures: 0,
                openedAt: null
            };
            this.circuitBreaker.states.set(name, state);
        }

        state.failures++;

        if (state.failures >= this.circuitBreaker.threshold) {
            state.status = 'open';
            state.openedAt = Date.now();

            this.logger.warn(`Circuit breaker opened for connection "${name}"`, {
                failures: state.failures,
                threshold: this.circuitBreaker.threshold
            });

            this.emit('circuitbreaker:open', { name });
        }
    }

    /**
     * Resets circuit breaker for a connection
     * @private
     * @param {string} name - Connection name
     */
    _resetCircuitBreaker(name) {
        const state = this.circuitBreaker.states.get(name);

        if (state) {
            const wasOpen = state.status === 'open';
            state.status = 'closed';
            state.failures = 0;
            state.openedAt = null;

            if (wasOpen) {
                this.logger.info(`Circuit breaker reset for connection "${name}"`);
                this.emit('circuitbreaker:reset', { name });
            }
        }
    }

    /**
     * Utility methods
     */

    /**
     * Updates connection state
     * @private
     * @param {string} name - Connection name
     * @param {string} state - New state
     */
    _updateConnectionState(name, state) {
        const states = this.connectionStates.get('states');
        const transitions = this.connectionStates.get('transitions');

        const currentState = this._getConnectionState(name);

        // Validate state transition
        if (currentState && transitions[currentState]) {
            if (!transitions[currentState].includes(state)) {
                this.logger.warn(`Invalid state transition for "${name}": ${currentState} -> ${state}`);
                return;
            }
        }

        this.connectionStates.set(name, state);

        this.logger.debug(`Connection "${name}" state changed: ${currentState} -> ${state}`);
        this.emit('connection:stateChange', { name, previousState: currentState, newState: state });
    }

    /**
     * Gets connection state
     * @private
     * @param {string} name - Connection name
     * @returns {string} Connection state
     */
    _getConnectionState(name) {
        return this.connectionStates.get(name) || 'disconnected';
    }

    /**
     * Updates connection metrics
     * @private
     * @param {string} name - Connection name
     * @param {string} status - Connection status
     * @param {number} duration - Connection duration
     */
    _updateConnectionMetrics(name, status, duration) {
        // Update attempt counters
        if (!this.performanceMetrics.connectionAttempts.has(name)) {
            this.performanceMetrics.connectionAttempts.set(name, { success: 0, failure: 0 });
        }

        const attempts = this.performanceMetrics.connectionAttempts.get(name);
        attempts[status]++;

        // Update duration tracking
        if (!this.performanceMetrics.connectionDurations.has(name)) {
            this.performanceMetrics.connectionDurations.set(name, []);
        }

        const durations = this.performanceMetrics.connectionDurations.get(name);
        durations.push(duration);

        // Keep only last 100 durations
        if (durations.length > 100) {
            durations.shift();
        }

        // Update monitoring state
        this.monitoringState.totalConnections++;
        if (status === 'success') {
            this.monitoringState.successfulConnections++;
        } else {
            this.monitoringState.failedConnections++;
        }
    }

    /**
     * Collects performance metrics
     * @private
     */
    _collectPerformanceMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            connections: {},
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };

        for (const [name, connection] of this.connections) {
            const poolMetrics = this.connectionPools.get(name) || {};
            const healthMetrics = this.connectionMetrics.get(name) || {};

            metrics.connections[name] = {
                state: connection.readyState,
                pool: poolMetrics,
                health: healthMetrics.health || {},
                recentErrors: (healthMetrics.errors || []).slice(-5)
            };
        }

        // Emit metrics event
        this.emit('metrics:collected', metrics);

        // Log if in debug mode
        if (process.env.LOG_LEVEL === 'debug') {
            this.logger.debug('Performance metrics collected', metrics);
        }
    }

    /**
     * Calculates retry delay with exponential backoff
     * @private
     * @param {number} retryCount - Current retry count
     * @returns {number} Delay in milliseconds
     */
    _calculateRetryDelay(retryCount) {
        const { initialDelay, maxDelay, factor, randomize } = this.retryConfiguration;

        let delay = initialDelay * Math.pow(factor, retryCount - 1);
        delay = Math.min(delay, maxDelay);

        if (randomize) {
            // Add random jitter (±25%)
            const jitter = delay * 0.25;
            delay += (Math.random() * 2 - 1) * jitter;
        }

        return Math.round(delay);
    }

    /**
     * Sanitizes database URI for logging
     * @private
     * @param {string} uri - Database URI
     * @returns {string} Sanitized URI
     */
    _sanitizeUri(uri) {
        // Replace password with asterisks
        return uri.replace(/:([^:@]+)@/, ':****@');
    }

    /**
     * Creates a delay promise
     * @private
     * @param {number} ms - Delay in milliseconds
     * @returns {Promise<void>}
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Sets up graceful shutdown handlers
     * @private
     */
    _setupShutdownHandlers() {
        const shutdownHandler = async (signal) => {
            this.logger.info(`Received ${signal}, starting graceful shutdown`);

            try {
                // Stop health checks
                for (const timer of this.healthCheck.timers.values()) {
                    clearInterval(timer);
                }

                // Stop monitoring intervals
                if (this.monitoringIntervals) {
                    for (const interval of this.monitoringIntervals.values()) {
                        clearInterval(interval);
                    }
                }

                // Close all connections
                await this.closeAllConnections(false);

                this.logger.info('Graceful shutdown completed');
                process.exit(0);

            } catch (error) {
                this.logger.error('Error during graceful shutdown', {
                    error: error.message,
                    stack: error.stack
                });
                process.exit(1);
            }
        };

        // Register shutdown handlers
        process.once('SIGTERM', () => shutdownHandler('SIGTERM'));
        process.once('SIGINT', () => shutdownHandler('SIGINT'));
        process.once('SIGUSR2', () => shutdownHandler('SIGUSR2'));
    }

    /**
     * Executes a query with monitoring
     * @param {string} connectionName - Connection name
     * @param {Function} queryFunction - Query function to execute
     * @returns {Promise<any>} Query result
     */
    async executeQuery(connectionName, queryFunction) {
        const startTime = performance.now();
        const queryId = crypto.randomBytes(8).toString('hex');

        try {
            const connection = this.getConnection(connectionName);

            if (!connection) {
                throw new Error(`Connection "${connectionName}" not found`);
            }

            if (connection.readyState !== 1) {
                throw new Error(`Connection "${connectionName}" is not ready`);
            }

            // Log query start
            this.logger.debug(`Executing query on "${connectionName}"`, { queryId });

            // Execute query
            const result = await queryFunction(connection);

            // Calculate execution time
            const executionTime = performance.now() - startTime;

            // Update query metrics
            this._updateQueryMetrics(connectionName, 'success', executionTime);

            // Log slow queries
            if (executionTime > 1000) {
                this.logger.warn(`Slow query detected on "${connectionName}"`, {
                    queryId,
                    executionTime: `${executionTime.toFixed(2)}ms`
                });
                this.monitoringState.slowQueries++;
            }

            return result;

        } catch (error) {
            const executionTime = performance.now() - startTime;

            // Update query metrics
            this._updateQueryMetrics(connectionName, 'failure', executionTime);

            this.logger.error(`Query failed on "${connectionName}"`, {
                queryId,
                error: error.message,
                executionTime: `${executionTime.toFixed(2)}ms`
            });

            throw error;
        }
    }

    /**
     * Updates query metrics
     * @private
     * @param {string} name - Connection name
     * @param {string} status - Query status
     * @param {number} duration - Query duration
     */
    _updateQueryMetrics(name, status, duration) {
        if (!this.performanceMetrics.queryExecutions.has(name)) {
            this.performanceMetrics.queryExecutions.set(name, {
                total: 0,
                success: 0,
                failure: 0,
                totalDuration: 0,
                averageDuration: 0
            });
        }

        const metrics = this.performanceMetrics.queryExecutions.get(name);
        metrics.total++;
        metrics[status]++;
        metrics.totalDuration += duration;
        metrics.averageDuration = metrics.totalDuration / metrics.total;

        this.monitoringState.totalQueries++;
    }
}

module.exports = DatabaseManager;
