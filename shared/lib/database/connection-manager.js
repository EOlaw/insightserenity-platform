/**
 * @fileoverview ConnectionManager - Orchestrates database connections, model routing, and configuration
 * @module shared/lib/database/connection-manager
 * @requires ./database-manager
 * @requires ./model-router
 * @requires ./environment-config
 * @requires winston
 * @requires events
 */

const DatabaseManager = require('./database-manager');
const ModelRouter = require('./model-router');
const EnvironmentConfig = require('./environment-config');
const winston = require('winston');
const EventEmitter = require('events');
const path = require('path');
const _ = require('lodash');
const { performance } = require('perf_hooks');

/**
 * @class ConnectionManager
 * @extends EventEmitter
 * @description Main orchestrator for multi-tenant MongoDB database architecture
 * Manages database connections, model routing, and environment-specific configurations
 */
class ConnectionManager extends EventEmitter {
    /**
     * Creates an instance of ConnectionManager
     * @param {Object} options - Configuration options
     * @param {string} options.environment - Environment name
     * @param {Object} options.config - Additional configuration
     * @param {winston.Logger} options.logger - Logger instance
     */
    constructor(options = {}) {
        super();

        // Initialize logger
        this.logger = options.logger || this._createDefaultLogger();

        // Initialize state
        this.state = {
            initialized: false,
            initializing: false,
            ready: false,
            startTime: Date.now(),
            errors: [],
            warnings: []
        };

        // Retry flag to prevent infinite loops
        this._isRetrying = false;

        // Initialize metrics
        this.metrics = {
            initializationTime: 0,
            connectionAttempts: 0,
            successfulConnections: 0,
            failedConnections: 0,
            modelsRegistered: 0,
            queriesExecuted: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        // Store options
        this.options = {
            environment: options.environment || process.env.NODE_ENV || 'development',
            autoInitialize: options.autoInitialize !== false,
            autoDiscoverModels: options.autoDiscoverModels !== false,
            enableHealthChecks: options.enableHealthChecks !== false,
            enableMetrics: options.enableMetrics !== false,
            retryOnFailure: options.retryOnFailure !== false,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 5000,
            ...options.config
        };

        // Initialize components
        this._initializeComponents();

        // Setup error handlers
        this._setupErrorHandlers();

        // Auto-initialize if enabled
        if (this.options.autoInitialize) {
            this.initialize().catch(error => {
                this.logger.error('Auto-initialization failed', {
                    error: error.message,
                    stack: error.stack
                });
            });
        }

        this.logger.info('ConnectionManager created', {
            environment: this.options.environment,
            autoInitialize: this.options.autoInitialize
        });
    }

    /**
     * Creates a default Winston logger
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
            defaultMeta: { service: 'connection-manager' },
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
     * Initializes components
     * @private
     */
    _initializeComponents() {
        // Initialize EnvironmentConfig
        this.environmentConfig = new EnvironmentConfig({
            environment: this.options.environment,
            logger: this.logger,
            validateOnLoad: true,
            encryptionEnabled: this.options.environment === 'production'
        });

        // Initialize DatabaseManager
        this.databaseManager = new DatabaseManager({
            config: {
                maxRetries: this.options.maxRetries,
                initialRetryDelay: this.options.retryDelay,
                healthCheckEnabled: this.options.enableHealthChecks,
                ...this.environmentConfig.getPerformanceSetting('database')
            },
            logger: this.logger,
            monitoring: {
                enabled: this.options.enableMetrics,
                interval: 60000
            }
        });

        // Initialize ModelRouter
        this.modelRouter = new ModelRouter({
            databaseManager: this.databaseManager,
            config: {
                modelsBasePath: path.join(process.cwd(), 'shared/lib/database/models'),
                autoDiscover: this.options.autoDiscoverModels,
                watchEnabled: this.options.environment === 'development',
                cacheEnabled: this.options.environment !== 'test',
                enableCrossDbRefs: true,
                ...this.options.modelRouterConfig
            },
            logger: this.logger
        });

        // Setup component event listeners
        this._setupComponentEventListeners();
    }

    /**
     * Sets up component event listeners
     * @private
     */
    _setupComponentEventListeners() {
        // DatabaseManager events
        this.databaseManager.on('connection:created', (data) => {
            this.metrics.successfulConnections++;
            this.emit('database:connected', data);
        });

        this.databaseManager.on('connection:error', (data) => {
            this.metrics.failedConnections++;
            this.emit('database:error', data);
        });

        this.databaseManager.on('connection:disconnected', (data) => {
            this.emit('database:disconnected', data);
        });

        this.databaseManager.on('healthcheck:failed', (data) => {
            this.logger.warn('Health check failed', data);
            this.emit('health:degraded', data);
        });

        // ModelRouter events
        this.modelRouter.on('model:registered', (data) => {
            this.metrics.modelsRegistered++;
            this.emit('model:registered', data);
        });

        this.modelRouter.on('discovery:complete', (data) => {
            this.emit('models:discovered', data);
        });

        this.modelRouter.on('model:error', (data) => {
            this.emit('model:error', data);
        });

        // EnvironmentConfig events
        this.environmentConfig.on('configuration:changed', (data) => {
            this.logger.info('Configuration changed, reinitializing connections');
            this._handleConfigurationChange(data);
        });

        this.environmentConfig.on('configuration:reloaded', (data) => {
            this.emit('configuration:reloaded', data);
        });
    }

    /**
     * Sets up error handlers
     * @private
     */
    _setupErrorHandlers() {
        // Handle uncaught errors from components
        const errorHandler = (error) => {
            this.logger.error('Component error', {
                error: error.message,
                stack: error.stack
            });

            this.state.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack
            });

            // Keep only last 100 errors
            if (this.state.errors.length > 100) {
                this.state.errors = this.state.errors.slice(-100);
            }

            this.emit('error', error);
        };

        this.databaseManager.on('error', errorHandler);
        this.modelRouter.on('error', errorHandler);
        this.environmentConfig.on('error', errorHandler);
    }

    /**
     * Initializes the connection manager
     * @returns {Promise<Object>} Initialization result
     */
    async initialize() {
        const startTime = performance.now();

        // Check if already initializing
        if (this.state.initializing) {
            this.logger.warn('Initialization already in progress');
            return { success: false, message: 'Already initializing' };
        }

        // Check if already initialized
        if (this.state.initialized) {
            this.logger.info('Already initialized');
            return { success: true, message: 'Already initialized' };
        }

        this.state.initializing = true;

        try {
            this.logger.info('Starting ConnectionManager initialization');

            // Step 1: Validate environment configuration
            const configValidation = this.environmentConfig.validateConfiguration();
            if (!configValidation.valid) {
                throw new Error(`Configuration validation failed: ${configValidation.errors.join(', ')}`);
            }

            // Step 2: Initialize database connections
            await this._initializeDatabaseConnections();

            // Step 3: Discover and register models
            if (this.options.autoDiscoverModels) {
                await this._discoverAndRegisterModels();
            }

            // Step 4: Setup health monitoring
            if (this.options.enableHealthChecks) {
                this._setupHealthMonitoring();
            }

            // Step 5: Setup metrics collection
            if (this.options.enableMetrics) {
                this._setupMetricsCollection();
            }

            // Calculate initialization time
            this.metrics.initializationTime = performance.now() - startTime;

            // Update state
            this.state.initialized = true;
            this.state.initializing = false;
            this.state.ready = true;

            // Emit ready event
            this.emit('ready', {
                initializationTime: this.metrics.initializationTime,
                databases: this._getDatabaseStatus(),
                models: this._getModelStatus()
            });

            this.logger.info('ConnectionManager initialization completed', {
                duration: `${this.metrics.initializationTime.toFixed(2)}ms`,
                databases: Object.keys(this._getDatabaseStatus()),
                models: this.metrics.modelsRegistered
            });

            return {
                success: true,
                duration: this.metrics.initializationTime,
                status: this.getStatus()
            };

        } catch (error) {
            this.state.initializing = false;
            this.state.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack
            });

            this.logger.error('ConnectionManager initialization failed', {
                error: error.message,
                stack: error.stack,
                duration: `${(performance.now() - startTime).toFixed(2)}ms`
            });

            // Attempt retry if enabled and not already retrying
            if (this.options.retryOnFailure && !this._isRetrying) {
                this._isRetrying = true;
                const result = await this._retryInitialization();
                this._isRetrying = false;
                return result;
            }

            // Don't throw error - just log and return failure
            this.logger.error('ConnectionManager initialization failed, but system will continue', {
                error: error.message,
                note: 'Direct database connections will still work'
            });

            return {
                success: false,
                error: error.message,
                message: 'Initialization failed but system can continue'
            };
        }
    }

    /**
     * Initializes database connections
     * @private
     * @returns {Promise<void>}
     */
    async _initializeDatabaseConnections() {
        this.logger.info('Initializing database connections');

        const databases = this.environmentConfig.getAllDatabaseConfigs();
        const connectionPromises = [];

        for (const [name, config] of Object.entries(databases)) {
            // Skip if no URI configured
            if (!config.uri) {
                this.logger.warn(`No URI configured for ${name} database, skipping`);
                continue;
            }

            // Create connection promise
            const connectionPromise = this.databaseManager.createConnection(name, config)
                .then(connection => {
                    this.logger.info(`Database connection established: ${name}`);
                    return { name, success: true, connection };
                })
                .catch(error => {
                    this.logger.error(`Failed to connect to ${name} database`, {
                        error: error.message
                    });
                    return { name, success: false, error: error.message };
                });

            connectionPromises.push(connectionPromise);
            this.metrics.connectionAttempts++;
        }

        // Wait for all connections
        const results = await Promise.allSettled(connectionPromises);

        // Check results
        const failedConnections = results.filter(r =>
            r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
        );

        if (failedConnections.length > 0) {
            const criticalDatabases = ['admin', 'customer'];
            const criticalFailures = failedConnections.filter(f =>
                criticalDatabases.includes(f.value?.name)
            );

            if (criticalFailures.length > 0) {
                throw new Error(`Critical database connections failed: ${
                    criticalFailures.map(f => f.value?.name || 'unknown').join(', ')
                }`);
            }

            // Log warnings for non-critical failures
            failedConnections.forEach(f => {
                this.state.warnings.push({
                    timestamp: new Date().toISOString(),
                    message: `Failed to connect to ${f.value?.name} database`,
                    error: f.value?.error || f.reason
                });
            });
        }
    }

    /**
     * Discovers and registers models
     * @private
     * @returns {Promise<void>}
     */
    async _discoverAndRegisterModels() {
        this.logger.info('Discovering and registering models');

        try {
            // Check if modelRouter is properly initialized
            if (!this.modelRouter) {
                this.logger.warn('ModelRouter not initialized, skipping model discovery');
                return;
            }

            const discoveryResults = await this.modelRouter.discoverModels({
                autoRegister: true
            });

            // Handle null/undefined/array/object return types safely
            let discovered = [];
            if (discoveryResults) {
                if (Array.isArray(discoveryResults)) {
                    discovered = discoveryResults;
                } else if (typeof discoveryResults === 'object') {
                    // If it's an object with models property
                    discovered = discoveryResults.models || [];
                }
            }

            this.logger.info('Model discovery completed', {
                discovered: discovered.length,
                failed: 0,
                results: discovered.map(m => ({ name: m.name, database: m.database }))
            });

            // Register discovered models
            let registered = 0;
            let failed = 0;
            for (const modelInfo of discovered) {
                if (modelInfo && modelInfo.name && modelInfo.database && modelInfo.path) {
                    try {
                        // Get the database connection
                        const connection = this.databaseManager.getConnection(modelInfo.database);
                        if (!connection) {
                            throw new Error(`Database connection "${modelInfo.database}" not found`);
                        }

                        // Load the model definition
                        const ModelDefinition = require(modelInfo.path);

                        // Compile the model with the correct connection
                        let model;
                        if (ModelDefinition.schema && ModelDefinition.modelName) {
                            // ConnectionManager-compatible export with schema
                            model = connection.model(ModelDefinition.modelName, ModelDefinition.schema);
                        } else if (ModelDefinition.schema) {
                            // Has schema but no modelName - derive from filename
                            const modelName = modelInfo.name.split('-').map(part =>
                                part.charAt(0).toUpperCase() + part.slice(1)
                            ).join('');
                            model = connection.model(modelName, ModelDefinition.schema);
                        } else {
                            // Assume direct model export (already compiled)
                            model = ModelDefinition;
                        }

                        // Register the compiled model
                        this.modelRouter.registerModel(modelInfo.name, model, modelInfo.database);
                        registered++;
                        this.logger.debug(`Registered model ${modelInfo.name} for ${modelInfo.database} database`);
                    } catch (error) {
                        failed++;
                        this.logger.warn(`Failed to register model ${modelInfo.name}`, {
                            error: error.message,
                            database: modelInfo.database,
                            path: modelInfo.path
                        });
                    }
                }
            }

            this.logger.info('Model registration completed', {
                discovered: discovered.length,
                registered,
                failed
            });

        } catch (error) {
            // Don't throw error for model discovery failures - log and continue
            this.logger.warn('Model discovery encountered an issue, but continuing', {
                error: error.message,
                detail: 'The system will continue to work with direct model imports'
            });
            // Don't re-throw the error to prevent initialization failure
        }
    }

    /**
     * Sets up health monitoring
     * @private
     */
    _setupHealthMonitoring() {
        // Setup periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this._performHealthCheck();
        }, 30000); // Every 30 seconds

        // Perform initial health check
        this._performHealthCheck();

        this.logger.info('Health monitoring setup completed');
    }

    /**
     * Performs health check
     * @private
     */
    async _performHealthCheck() {
        const healthStatus = {
            timestamp: new Date().toISOString(),
            healthy: true,
            databases: {},
            models: {},
            metrics: {}
        };

        try {
            // Check database health
            const dbHealth = this.databaseManager.getHealthStatus();
            healthStatus.databases = dbHealth.connections;

            // Check for unhealthy databases
            for (const [name, status] of Object.entries(dbHealth.connections)) {
                if (status.health?.status === 'unhealthy') {
                    healthStatus.healthy = false;
                }
            }

            // Check model router health
            const modelMetrics = this.modelRouter.getMetrics();
            healthStatus.models = {
                total: modelMetrics.models.total,
                byDatabase: modelMetrics.models.byDatabase,
                cacheHitRate: modelMetrics.cache.hits /
                    (modelMetrics.cache.hits + modelMetrics.cache.misses) || 0
            };

            // Add system metrics
            healthStatus.metrics = {
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                initializationTime: this.metrics.initializationTime,
                queriesExecuted: this.metrics.queriesExecuted
            };

            // Emit health status
            this.emit('health:check', healthStatus);

            // Log if unhealthy
            if (!healthStatus.healthy) {
                this.logger.warn('Health check detected issues', healthStatus);
            }

        } catch (error) {
            this.logger.error('Health check failed', {
                error: error.message
            });

            healthStatus.healthy = false;
            healthStatus.error = error.message;
        }

        return healthStatus;
    }

    /**
     * Sets up metrics collection
     * @private
     */
    _setupMetricsCollection() {
        // Setup periodic metrics collection
        this.metricsInterval = setInterval(() => {
            this._collectMetrics();
        }, 60000); // Every minute

        // Collect initial metrics
        this._collectMetrics();

        this.logger.info('Metrics collection setup completed');
    }

    /**
     * Collects metrics
     * @private
     */
    _collectMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            connectionManager: { ...this.metrics },
            databases: this.databaseManager.getPerformanceMetrics(),
            models: this.modelRouter.getMetrics(),
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
                uptime: process.uptime()
            }
        };

        // Emit metrics event
        this.emit('metrics:collected', metrics);

        // Log if in debug mode
        if (process.env.LOG_LEVEL === 'debug') {
            this.logger.debug('Metrics collected', metrics);
        }

        return metrics;
    }

    /**
     * Handles configuration changes
     * @private
     * @param {Object} changes - Configuration changes
     */
    async _handleConfigurationChange(changes) {
        this.logger.info('Handling configuration change', changes);

        try {
            // Reinitialize connections if database config changed
            if (changes.databases) {
                await this._reinitializeDatabaseConnections();
            }

            // Reload models if model config changed
            if (changes.models) {
                await this._reloadModels();
            }

            this.emit('configuration:applied', changes);

        } catch (error) {
            this.logger.error('Failed to apply configuration changes', {
                error: error.message,
                changes
            });
        }
    }

    /**
     * Reinitializes database connections
     * @private
     * @returns {Promise<void>}
     */
    async _reinitializeDatabaseConnections() {
        this.logger.info('Reinitializing database connections');

        // Close existing connections
        await this.databaseManager.closeAllConnections();

        // Reinitialize connections
        await this._initializeDatabaseConnections();

        // Reload models to use new connections
        await this._reloadModels();
    }

    /**
     * Reloads all models
     * @private
     * @returns {Promise<void>}
     */
    async _reloadModels() {
        this.logger.info('Reloading all models');

        const models = this.modelRouter.getAllModels();

        for (const [modelName] of models) {
            try {
                await this.modelRouter.reloadModel(modelName);
            } catch (error) {
                this.logger.error(`Failed to reload model ${modelName}`, {
                    error: error.message
                });
            }
        }
    }

    /**
     * Retries initialization
     * @private
     * @returns {Promise<Object>} Retry result
     */
    async _retryInitialization() {
        // Don't retry if already initialized
        if (this.state.initialized) {
            return { success: true, message: 'Already initialized' };
        }

        let retryCount = 0;
        const maxRetries = this.options.maxRetries;

        while (retryCount < maxRetries) {
            retryCount++;

            this.logger.info(`Retrying initialization (attempt ${retryCount}/${maxRetries})`);

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));

            try {
                // Reset state but prevent recursive retry
                this.state.initialized = false;
                this.state.initializing = false;
                this.state.errors = [];

                // Call initialization without triggering another retry
                const startTime = performance.now();

                // Skip if already initializing
                if (this.state.initializing) {
                    return { success: false, message: 'Already initializing' };
                }

                // Skip if already initialized
                if (this.state.initialized) {
                    return { success: true, message: 'Already initialized' };
                }

                this.state.initializing = true;

                // Try initialization steps directly
                try {
                    // Validate configuration
                    const configValidation = this.environmentConfig.validateConfiguration();
                    if (!configValidation.valid && configValidation.errors.length > 0) {
                        // Only fail on errors, not warnings
                        throw new Error(`Configuration validation failed: ${configValidation.errors.join(', ')}`);
                    }

                    // Initialize database connections
                    await this._initializeDatabaseConnections();

                    // Discover and register models - but don't fail on model discovery
                    if (this.options.autoDiscoverModels) {
                        try {
                            await this._discoverAndRegisterModels();
                        } catch (modelError) {
                            this.logger.warn('Model discovery failed, but continuing', {
                                error: modelError.message
                            });
                        }
                    }

                    // Setup monitoring if enabled
                    if (this.options.enableHealthChecks) {
                        this._setupHealthMonitoring();
                    }

                    if (this.options.enableMetrics) {
                        this._setupMetricsCollection();
                    }

                    // Mark as initialized
                    this.metrics.initializationTime = performance.now() - startTime;
                    this.state.initialized = true;
                    this.state.initializing = false;
                    this.state.ready = true;

                    this.emit('ready', {
                        initializationTime: this.metrics.initializationTime,
                        databases: this._getDatabaseStatus(),
                        models: this._getModelStatus()
                    });

                    this.logger.info('ConnectionManager initialization completed on retry', {
                        attempt: retryCount,
                        duration: `${this.metrics.initializationTime.toFixed(2)}ms`
                    });

                    return {
                        success: true,
                        duration: this.metrics.initializationTime,
                        status: this.getStatus()
                    };

                } catch (innerError) {
                    this.state.initializing = false;
                    throw innerError;
                }

            } catch (error) {
                this.logger.error(`Initialization retry ${retryCount} failed`, {
                    error: error.message
                });

                if (retryCount >= maxRetries) {
                    this.state.initializing = false;
                    this.state.ready = false;

                    // Don't throw error - just log and mark as not ready
                    this.logger.error(`Initialization failed after ${maxRetries} retries, but system will continue`, {
                        error: error.message,
                        note: 'Direct database connections will still work'
                    });

                    return {
                        success: false,
                        message: `Initialization failed after ${maxRetries} retries`,
                        error: error.message
                    };
                }
            }
        }

        return {
            success: false,
            message: 'Max retries reached'
        };
    }

    /**
     * Gets database connection
     * @param {string} name - Database name
     * @returns {mongoose.Connection} Database connection
     */
    getDatabase(name) {
        return this.databaseManager.getConnection(name);
    }

    /**
     * Gets model by name and database
     * @param {string} modelName - Model name
     * @param {string} databaseName - Database name
     * @returns {mongoose.Model} Model instance
     */
    getModel(modelName, databaseName) {
        return this.modelRouter.getModel(modelName, databaseName);
    }

    /**
     * Gets all models for a database
     * @param {string} databaseName - Database name
     * @returns {Map<string, mongoose.Model>} Models map
     */
    getModelsByDatabase(databaseName) {
        return this.modelRouter.getModelsByDatabase(databaseName);
    }

    /**
     * Executes a query with monitoring
     * @param {string} databaseName - Database name
     * @param {Function} queryFunction - Query function
     * @returns {Promise<any>} Query result
     */
    async executeQuery(databaseName, queryFunction) {
        this.metrics.queriesExecuted++;

        try {
            const result = await this.databaseManager.executeQuery(databaseName, queryFunction);

            // Update cache metrics if applicable
            if (result._fromCache) {
                this.metrics.cacheHits++;
            } else {
                this.metrics.cacheMisses++;
            }

            return result;

        } catch (error) {
            this.logger.error('Query execution failed', {
                database: databaseName,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Creates a transaction across databases
     * @param {Array<string>} databases - Database names
     * @param {Function} transactionFunction - Transaction function
     * @returns {Promise<any>} Transaction result
     */
    async createTransaction(databases, transactionFunction) {
        const sessions = new Map();

        try {
            // Start sessions for each database
            for (const dbName of databases) {
                const connection = this.getDatabase(dbName);
                if (!connection) {
                    throw new Error(`Database ${dbName} not found`);
                }

                const session = await connection.startSession();
                sessions.set(dbName, session);
            }

            // Start transactions
            for (const session of sessions.values()) {
                session.startTransaction();
            }

            // Execute transaction function
            const result = await transactionFunction(sessions);

            // Commit all transactions
            for (const session of sessions.values()) {
                await session.commitTransaction();
            }

            return result;

        } catch (error) {
            // Abort all transactions
            for (const session of sessions.values()) {
                try {
                    await session.abortTransaction();
                } catch (abortError) {
                    this.logger.error('Failed to abort transaction', {
                        error: abortError.message
                    });
                }
            }

            throw error;

        } finally {
            // End all sessions
            for (const session of sessions.values()) {
                try {
                    await session.endSession();
                } catch (endError) {
                    this.logger.error('Failed to end session', {
                        error: endError.message
                    });
                }
            }
        }
    }

    /**
     * Gets database status
     * @private
     * @returns {Object} Database status
     */
    _getDatabaseStatus() {
        const status = {};
        const connections = this.databaseManager.getAllConnections();

        for (const [name, connection] of connections) {
            status[name] = {
                connected: connection.readyState === 1,
                readyState: connection.readyState,
                name: connection.name
            };
        }

        return status;
    }

    /**
     * Gets model status
     * @private
     * @returns {Object} Model status
     */
    _getModelStatus() {
        const metrics = this.modelRouter.getMetrics();

        return {
            total: metrics.models.total,
            byDatabase: metrics.models.byDatabase,
            discovery: metrics.discovery.state
        };
    }

    /**
     * Gets connection manager status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            initialized: this.state.initialized,
            ready: this.state.ready,
            environment: this.options.environment,
            uptime: Date.now() - this.state.startTime,
            databases: this._getDatabaseStatus(),
            models: this._getModelStatus(),
            metrics: this.metrics,
            errors: this.state.errors.slice(-10),
            warnings: this.state.warnings.slice(-10)
        };
    }

    /**
     * Gets health status
     * @returns {Promise<Object>} Health status
     */
    async getHealthStatus() {
        return await this._performHealthCheck();
    }

    /**
     * Gets configuration
     * @param {boolean} includeSensitive - Include sensitive data
     * @returns {Object} Configuration
     */
    getConfiguration(includeSensitive = false) {
        return this.environmentConfig.exportConfiguration(includeSensitive);
    }

    /**
     * Updates configuration
     * @param {Object} updates - Configuration updates
     * @returns {Promise<void>}
     */
    async updateConfiguration(updates) {
        this.environmentConfig.applyOverrides(updates);

        // Reinitialize if needed
        if (updates.databases || updates.connections) {
            await this._reinitializeDatabaseConnections();
        }
    }

    /**
     * Registers a model manually
     * @param {Object} modelInfo - Model information
     * @returns {Promise<mongoose.Model>} Registered model
     */
    async registerModel(modelInfo) {
        return await this.modelRouter.registerModel(modelInfo);
    }

    /**
     * Adds a global plugin to all models
     * @param {Function} pluginFn - Plugin function
     * @param {Object} options - Plugin options
     */
    addGlobalPlugin(pluginFn, options = {}) {
        this.modelRouter.addGlobalPlugin(pluginFn, options);
    }

    /**
     * Adds a plugin to specific model
     * @param {string} modelName - Model name
     * @param {Function} pluginFn - Plugin function
     * @param {Object} options - Plugin options
     */
    addModelPlugin(modelName, pluginFn, options = {}) {
        this.modelRouter.addModelPlugin(modelName, pluginFn, options);
    }

    /**
     * Closes all connections and cleans up
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.logger.info('Starting ConnectionManager shutdown');

        try {
            // Clear intervals
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
            }

            // Cleanup components
            await this.modelRouter.cleanup();
            await this.databaseManager.closeAllConnections();
            await this.environmentConfig.cleanup();

            // Update state
            this.state.ready = false;
            this.state.initialized = false;

            // Emit shutdown event
            this.emit('shutdown');

            this.logger.info('ConnectionManager shutdown completed');

        } catch (error) {
            this.logger.error('Error during shutdown', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Creates a singleton instance
     * @static
     * @param {Object} options - Configuration options
     * @returns {ConnectionManager} Singleton instance
     */
    static getInstance(options) {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager(options);
        }
        return ConnectionManager.instance;
    }
}

// Export the class
module.exports = ConnectionManager;
