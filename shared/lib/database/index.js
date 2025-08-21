'use strict';

/**
 * @fileoverview Database module main exports - ENHANCED VERSION WITH COMPLETE MULTI-DATABASE SUPPORT
 * @module shared/lib/database
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/multi-tenant-manager
 * @requires module:shared/lib/database/query-builder
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/config
 */

const ConnectionManager = require('./connection-manager');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const config = require('../../config');

// Optional imports - these may not exist in all environments
let MultiTenantManager = null;
let QueryBuilder = null;
let TransactionManager = null;
let BaseModel = null;
let SeedManager = null;
let MigrationRunner = null;

// Safely import optional modules
try {
    MultiTenantManager = require('./multi-tenant-manager');
} catch (error) {
    logger.warn('MultiTenantManager not available', { error: error.message });
}

try {
    QueryBuilder = require('./query-builder');
} catch (error) {
    logger.warn('QueryBuilder not available', { error: error.message });
}

try {
    TransactionManager = require('./transaction-manager');
} catch (error) {
    logger.warn('TransactionManager not available', { error: error.message });
}

try {
    BaseModel = require('./models/base-model');
} catch (error) {
    logger.warn('BaseModel not available', { error: error.message });
}

try {
    SeedManager = require('./seeders/seed-manager');
} catch (error) {
    logger.warn('SeedManager not available', { error: error.message });
}

try {
    MigrationRunner = require('./migrations/migration-runner');
} catch (error) {
    logger.warn('MigrationRunner not available', { error: error.message });
}

// CRITICAL FIX: Import models index to register all models with BaseModel
// This must happen after BaseModel is imported but before Database initialization
let modelsRegistered = false;
function ensureModelsRegistered() {
    if (!modelsRegistered && BaseModel) {
        try {
            logger.info('Loading and registering all database models...');
            require('./models'); // This imports and registers all models
            modelsRegistered = true;
            logger.info('All models have been registered successfully');
        } catch (modelError) {
            logger.error('Failed to register models from index', { error: modelError.message });
            // Continue with fallback behavior
        }
    }
}

/**
 * @class Database
 * @description Main database module providing unified access to all database functionality with multi-database support
 */
class Database {
    /**
     * @private
     * @static
     */
    static #initialized = false;
    static #connectionManager = null;
    static #multiTenantManager = null;
    static #transactionManager = null;
    static #seedManager = null;
    static #migrationRunner = null;
    static #models = new Map();
    static #schemas = new Map();
    static #seedingInProgress = false;
    static #seedingDisabled = false;
    static #modelRegistrationSummary = { total: 0, successful: 0, failed: 0 };
    static #modelRegistrationErrors = [];

    /**
     * Initializes the database module with multi-database support
     * @static
     * @async
     * @param {Object} [options={}] - Initialization options
     * @returns {Promise<void>}
     * @throws {AppError} If initialization fails
     */
    static async initialize(options = {}) {
        try {
            if (Database.#initialized) {
                logger.warn('Database already initialized');
                return;
            }

            const {
                connection = {},
                multiTenant = {},
                transaction = {},
                seed = {},
                migration = {},
                runMigrations = false,
                runSeeds = false,
                disableAutoSeeding = false,
                seedingStrategy = 'safe' // 'safe', 'force', 'skip'
            } = options;

            logger.info('Initializing database module with multi-database support');

            // ENHANCED: Initialize database mappings before connections
            if (ConnectionManager.initializeDatabaseMappings) {
                ConnectionManager.initializeDatabaseMappings();
            }

            // CRITICAL FIX: Ensure models are registered BEFORE any other initialization
            ensureModelsRegistered();

            // Initialize connection manager with multi-database support
            const connectionOptions = {
                ...config.database,
                ...connection,
                enableMultiDatabase: true,
                enableHealthCheck: connection.enableHealthCheck !== false
            };

            // ENHANCED: Initialize multiple database connections
            if (ConnectionManager.initializeMultipleDatabases) {
                await ConnectionManager.initializeMultipleDatabases(connectionOptions);
            } else {
                // Fallback to standard connection initialization
                await ConnectionManager.initialize(connectionOptions);
            }
            
            Database.#connectionManager = ConnectionManager;

            logger.info('Multi-database connections initialized successfully');

            // Initialize multi-tenant manager if available
            if (MultiTenantManager && config.database?.multiTenant?.enabled) {
                try {
                    await MultiTenantManager.initialize({
                        ...config.database.multiTenant,
                        ...multiTenant
                    });
                    Database.#multiTenantManager = MultiTenantManager;
                } catch (error) {
                    logger.warn('Multi-tenant manager initialization failed', { error: error.message });
                }
            }

            // Initialize transaction manager if available
            if (TransactionManager) {
                try {
                    Database.#transactionManager = new TransactionManager({
                        ...config.database?.transaction,
                        ...transaction
                    });
                } catch (error) {
                    logger.warn('Transaction manager initialization failed', { error: error.message });
                }
            }

            // ENHANCED: Initialize base model with multi-database support
            if (BaseModel) {
                try {
                    await BaseModel.initialize({
                        auditService: options.auditService,
                        connectionManager: Database.#connectionManager,
                        multiDatabase: true
                    });
                    logger.info('BaseModel initialized successfully');
                } catch (error) {
                    logger.warn('BaseModel initialization failed', { error: error.message });
                }
            }

            // Initialize migration runner if available
            if (MigrationRunner) {
                try {
                    Database.#migrationRunner = new MigrationRunner({
                        ...config.database?.migration,
                        ...migration,
                        transactionManager: Database.#transactionManager
                    });

                    if (Database.#migrationRunner.initialize) {
                        await Database.#migrationRunner.initialize();
                    }

                    if (runMigrations && Database.#migrationRunner.migrate) {
                        logger.info('Running database migrations...');
                        const migrationResult = await Database.#migrationRunner.migrate();
                        logger.info('Migrations completed', {
                            successful: migrationResult.successful || 0,
                            failed: migrationResult.failed || 0
                        });
                    }
                } catch (migrationError) {
                    logger.warn('Migration runner initialization failed', {
                        error: migrationError.message
                    });
                }
            }

            // ENHANCED: Load models with multi-database routing AFTER registration and BEFORE attempting seeding
            await Database.#loadModels();

            // Initialize seed manager if available
            if (SeedManager && !disableAutoSeeding) {
                try {
                    Database.#seedManager = new SeedManager({
                        ...config.database?.seed,
                        ...seed,
                        transactionManager: Database.#transactionManager
                    });

                    if (Database.#seedManager.initialize) {
                        await Database.#seedManager.initialize();
                    }

                    // Enhanced seeding control with better error handling
                    const shouldRunSeeds = runSeeds && 
                                         config.app?.env !== 'production' && 
                                         Database.#seedManager.seed &&
                                         !Database.#seedingDisabled;

                    if (shouldRunSeeds) {
                        await Database.#runSeedsWithStrategy(seedingStrategy, seed);
                    }
                } catch (seedError) {
                    logger.error('Seed manager initialization failed', {
                        error: seedError.message,
                        stack: seedError.stack
                    });
                    
                    // Don't fail initialization due to seeding issues in development
                    if (config.app?.env === 'development') {
                        logger.warn('Continuing database initialization despite seeding failure in development mode');
                        Database.#seedingDisabled = true;
                    } else {
                        throw new AppError('Critical seeding failure in non-development environment', 500, 'SEEDING_ERROR');
                    }
                }
            }

            Database.#initialized = true;

            // Get multi-database status for logging
            const dbConnections = Database.getAllConnections();
            const connectionRouting = Database.getConnectionRouting();

            logger.info('Database module initialized successfully with multi-database architecture', {
                connection: connectionOptions.uri ? 'Connected' : 'Not configured',
                multiTenant: Database.#multiTenantManager ? 'Enabled' : 'Disabled',
                migrationRunner: Database.#migrationRunner ? 'Available' : 'Not available',
                seedManager: Database.#seedManager ? 'Available' : 'Not available',
                modelsLoaded: Database.#models.size,
                modelsRegistered: modelsRegistered,
                seedingDisabled: Database.#seedingDisabled,
                multiDatabase: {
                    totalConnections: dbConnections.size,
                    databaseConnections: connectionRouting.databaseConnections,
                    tenantConnections: connectionRouting.tenantConnections,
                    collectionMappings: Object.keys(connectionRouting.collectionRouting?.databasePurposes || {}).length
                }
            });

        } catch (error) {
            logger.error('Failed to initialize database module', error);

            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError(
                'Database initialization failed',
                500,
                'DATABASE_INIT_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * ENHANCED: Gets all database connections with routing information
     * @static
     * @returns {Map} All database connections
     */
    static getAllConnections() {
        if (!Database.#connectionManager) {
            return new Map();
        }
        return ConnectionManager.getAllConnections ? ConnectionManager.getAllConnections() : new Map();
    }

    /**
     * ENHANCED: Gets comprehensive connection routing information
     * @static
     * @returns {Object} Connection routing details
     */
    static getConnectionRouting() {
        if (!Database.#connectionManager) {
            return { databaseConnections: 0, tenantConnections: 0, collectionMappings: 0 };
        }
        return ConnectionManager.getConnectionRouting ? ConnectionManager.getConnectionRouting() : { databaseConnections: 0, tenantConnections: 0, collectionMappings: 0 };
    }

    /**
     * ENHANCED: Gets database connection for specific type
     * @static
     * @param {string} dbType - Database type (admin, shared, audit, analytics)
     * @returns {Object|null} Database connection
     */
    static getDatabaseConnection(dbType) {
        if (!Database.#connectionManager) {
            return null;
        }
        return ConnectionManager.getDatabaseConnection ? ConnectionManager.getDatabaseConnection(dbType) : null;
    }

    /**
     * ENHANCED: Gets connection for specific collection
     * @static
     * @param {string} collectionName - Collection name
     * @returns {Object|null} Database connection
     */
    static getConnectionForCollection(collectionName) {
        if (!Database.#connectionManager) {
            return null;
        }
        return ConnectionManager.getConnectionForCollection ? ConnectionManager.getConnectionForCollection(collectionName) : null;
    }

    /**
     * ENHANCED: Gets database type for collection
     * @static
     * @param {string} collectionName - Collection name
     * @returns {string|null} Database type
     */
    static getDatabaseTypeForCollection(collectionName) {
        if (!Database.#connectionManager) {
            return null;
        }
        return ConnectionManager.getDatabaseTypeForCollection ? ConnectionManager.getDatabaseTypeForCollection(collectionName) : null;
    }

    /**
     * ENHANCED: Gets all collections for database type
     * @static
     * @param {string} dbType - Database type
     * @returns {Array<string>} Collection names
     */
    static getCollectionsForDatabase(dbType) {
        if (!Database.#connectionManager) {
            return [];
        }
        return ConnectionManager.getCollectionsForDatabase ? ConnectionManager.getCollectionsForDatabase(dbType) : [];
    }

    /**
     * Creates or gets tenant connection
     * @static
     * @async
     * @param {string} tenantId - Tenant identifier
     * @param {Object} [options={}] - Connection options
     * @returns {Promise<Object>} Tenant connection
     */
    static async createTenantConnection(tenantId, options = {}) {
        if (!Database.#connectionManager) {
            throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
        }
        return ConnectionManager.createTenantConnection ? await ConnectionManager.createTenantConnection(tenantId, options) : null;
    }

    /**
     * Gets tenant connection
     * @static
     * @param {string} tenantId - Tenant identifier
     * @returns {Object|null} Tenant connection
     */
    static getTenantConnection(tenantId) {
        if (!Database.#connectionManager) {
            return null;
        }
        return ConnectionManager.getTenantConnection ? ConnectionManager.getTenantConnection(tenantId) : null;
    }

    /**
     * Gets all tenant connections
     * @static
     * @returns {Map} All tenant connections
     */
    static getAllTenantConnections() {
        if (!Database.#connectionManager) {
            return new Map();
        }
        return ConnectionManager.getAllTenantConnections ? ConnectionManager.getAllTenantConnections() : new Map();
    }

    /**
     * Closes tenant connection
     * @static
     * @async
     * @param {string} tenantId - Tenant identifier
     * @param {boolean} [force=false] - Force close
     * @returns {Promise<void>}
     */
    static async closeTenantConnection(tenantId, force = false) {
        if (!Database.#connectionManager) {
            throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
        }
        return ConnectionManager.closeTenantConnection ? await ConnectionManager.closeTenantConnection(tenantId, force) : null;
    }

    /**
     * Runs seeds with enhanced strategy and error handling
     * @private
     * @static
     * @async
     * @param {string} strategy - Seeding strategy ('safe', 'force', 'skip')
     * @param {Object} seedOptions - Seeding options
     */
    static async #runSeedsWithStrategy(strategy, seedOptions = {}) {
        if (Database.#seedingInProgress) {
            logger.warn('Seeding already in progress, skipping');
            return;
        }

        Database.#seedingInProgress = true;

        try {
            logger.info('Starting database seeding', { strategy });

            // Pre-seeding validation
            const validationResult = await Database.#validateSeedingPrerequisites();
            if (!validationResult.valid) {
                if (strategy === 'safe') {
                    logger.warn('Seeding prerequisites not met, skipping seeding', {
                        issues: validationResult.issues
                    });
                    return;
                } else if (strategy === 'force') {
                    logger.warn('Seeding prerequisites not met, but forcing seeding', {
                        issues: validationResult.issues
                    });
                } else {
                    logger.info('Skipping seeding due to strategy');
                    return;
                }
            }

            // Check if database is empty
            const databaseState = await Database.#checkDatabaseState();
            
            if (databaseState.hasExistingData && strategy === 'safe') {
                logger.info('Database already contains data, skipping seeding in safe mode', {
                    collections: databaseState.existingCollections
                });
                return;
            }

            // Run seeding with transaction support
            const seedResult = await Database.#executeSeeding(seedOptions);
            
            logger.info('Database seeding completed', {
                successful: seedResult.successful || 0,
                failed: seedResult.failed || 0,
                warnings: seedResult.warnings || 0,
                strategy
            });

        } catch (seedingError) {
            logger.error('Database seeding failed', {
                error: seedingError.message,
                stack: seedingError.stack,
                strategy
            });

            if (strategy === 'force' || config.app?.env === 'development') {
                logger.warn('Seeding failed but continuing due to strategy/environment');
                Database.#seedingDisabled = true;
            } else {
                throw seedingError;
            }
        } finally {
            Database.#seedingInProgress = false;
        }
    }

    /**
     * Validates seeding prerequisites
     * @private
     * @static
     * @async
     * @returns {Promise<Object>} Validation result
     */
    static async #validateSeedingPrerequisites() {
        const issues = [];
        
        try {
            // Check database connection
            const connection = Database.getConnection();
            if (!connection) {
                issues.push('No database connection available');
            }

            // Check if essential models are loaded
            const essentialModels = ['User', 'Organization'];
            for (const modelName of essentialModels) {
                if (!Database.#models.has(modelName)) {
                    issues.push(`Essential model ${modelName} not loaded`);
                }
            }

            // Check BaseModel availability
            if (!BaseModel) {
                issues.push('BaseModel not available for seeding operations');
            }

            // Check database write permissions
            if (connection) {
                try {
                    const testCollection = connection.db.collection('_database_test');
                    await testCollection.insertOne({ test: true, timestamp: new Date() });
                    await testCollection.deleteOne({ test: true });
                } catch (permissionError) {
                    issues.push('Database write permissions check failed');
                }
            }

            return {
                valid: issues.length === 0,
                issues
            };

        } catch (error) {
            issues.push(`Validation error: ${error.message}`);
            return {
                valid: false,
                issues
            };
        }
    }

    /**
     * Checks current database state
     * @private
     * @static
     * @async
     * @returns {Promise<Object>} Database state information
     */
    static async #checkDatabaseState() {
        try {
            const connection = Database.getConnection();
            if (!connection) {
                return { hasExistingData: false, existingCollections: [] };
            }

            const collections = await connection.db.listCollections().toArray();
            const dataCollections = collections.filter(c => 
                !c.name.startsWith('_') && 
                !c.name.includes('test') &&
                c.name !== 'sessions'
            );

            const existingCollections = [];
            let hasExistingData = false;

            for (const collection of dataCollections) {
                try {
                    const count = await connection.db.collection(collection.name).countDocuments();
                    if (count > 0) {
                        hasExistingData = true;
                        existingCollections.push({
                            name: collection.name,
                            count
                        });
                    }
                } catch (countError) {
                    logger.warn(`Could not count documents in ${collection.name}`, { error: countError.message });
                }
            }

            return {
                hasExistingData,
                existingCollections,
                totalCollections: collections.length
            };

        } catch (error) {
            logger.error('Failed to check database state', { error: error.message });
            return { hasExistingData: false, existingCollections: [] };
        }
    }

    /**
     * Executes seeding with proper error handling
     * @private
     * @static
     * @async
     * @param {Object} seedOptions - Seeding options
     * @returns {Promise<Object>} Seeding result
     */
    static async #executeSeeding(seedOptions) {
        let seedResult = { successful: 0, failed: 0, warnings: 0 };

        try {
            // Use transaction if available
            if (Database.#transactionManager) {
                seedResult = await Database.#transactionManager.withTransaction(async () => {
                    return await Database.#seedManager.seed({
                        type: config.app?.env,
                        skipExisting: true,
                        continueOnError: true,
                        ...seedOptions
                    });
                });
            } else {
                seedResult = await Database.#seedManager.seed({
                    type: config.app?.env,
                    skipExisting: true,
                    continueOnError: true,
                    ...seedOptions
                });
            }

            return seedResult;

        } catch (error) {
            logger.error('Seeding execution failed', {
                error: error.message,
                stack: error.stack
            });

            // Try to provide partial results if available
            return {
                successful: seedResult.successful || 0,
                failed: (seedResult.failed || 0) + 1,
                warnings: seedResult.warnings || 0,
                error: error.message
            };
        }
    }

    /**
     * Manually run database seeds
     * @static
     * @async
     * @param {Object} [options={}] - Seeding options
     * @returns {Promise<Object>} Seeding result
     */
    static async runSeeds(options = {}) {
        if (!Database.#initialized) {
            throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
        }

        if (!Database.#seedManager) {
            throw new AppError('Seed manager not available', 500, 'SEED_MANAGER_NOT_AVAILABLE');
        }

        if (Database.#seedingInProgress) {
            throw new AppError('Seeding already in progress', 409, 'SEEDING_IN_PROGRESS');
        }

        const {
            strategy = 'safe',
            resetDatabase = false,
            seedTypes = ['development'],
            continueOnError = true
        } = options;

        logger.info('Manually running database seeds', { strategy, resetDatabase, seedTypes });

        try {
            // Reset database if requested
            if (resetDatabase) {
                await Database.#resetDatabase();
            }

            Database.#seedingDisabled = false;
            return await Database.#runSeedsWithStrategy(strategy, {
                types: seedTypes,
                continueOnError
            });

        } catch (error) {
            logger.error('Manual seeding failed', { error: error.message });
            throw new AppError('Manual seeding failed', 500, 'MANUAL_SEEDING_ERROR', {
                originalError: error.message
            });
        }
    }

    /**
     * Resets database by removing all data
     * @private
     * @static
     * @async
     */
    static async #resetDatabase() {
        logger.warn('Resetting database - removing all data');
        
        const connection = Database.getConnection();
        if (!connection) {
            throw new Error('No database connection for reset');
        }

        const collections = await connection.db.listCollections().toArray();
        
        for (const collection of collections) {
            try {
                if (!collection.name.startsWith('_')) {
                    await connection.db.collection(collection.name).deleteMany({});
                    logger.info(`Cleared collection: ${collection.name}`);
                }
            } catch (error) {
                logger.warn(`Failed to clear collection ${collection.name}`, { error: error.message });
            }
        }
    }

    /**
     * Checks seeding status
     * @static
     * @returns {Object} Seeding status information
     */
    static getSeedingStatus() {
        return {
            initialized: Database.#initialized,
            seedManagerAvailable: !!Database.#seedManager,
            seedingInProgress: Database.#seedingInProgress,
            seedingDisabled: Database.#seedingDisabled,
            canRunSeeds: Database.#initialized && Database.#seedManager && !Database.#seedingInProgress
        };
    }

    /**
     * Shuts down the database module
     * @static
     * @async
     * @param {Object} [options={}] - Shutdown options
     * @returns {Promise<void>}
     */
    static async shutdown(options = {}) {
        try {
            const { force = false } = options;

            logger.info('Shutting down database module');

            // Wait for seeding to complete if in progress
            if (Database.#seedingInProgress && !force) {
                logger.info('Waiting for seeding to complete before shutdown');
                let attempts = 0;
                while (Database.#seedingInProgress && attempts < 30) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    attempts++;
                }
            }

            // Clear model registry
            Database.#models.clear();
            Database.#schemas.clear();
            
            if (BaseModel && BaseModel.clearRegistry) {
                BaseModel.clearRegistry();
            }

            // Close all connections
            if (ConnectionManager.disconnectAll) {
                await ConnectionManager.disconnectAll(force);
            } else if (ConnectionManager.closeAllConnections) {
                await ConnectionManager.closeAllConnections();
            }

            // Cleanup managers
            if (Database.#multiTenantManager && MultiTenantManager.cleanup) {
                await MultiTenantManager.cleanup();
            }

            // Clear references
            Database.#connectionManager = null;
            Database.#multiTenantManager = null;
            Database.#transactionManager = null;
            Database.#seedManager = null;
            Database.#migrationRunner = null;
            Database.#initialized = false;
            Database.#seedingInProgress = false;
            Database.#seedingDisabled = false;
            modelsRegistered = false;

            logger.info('Database module shutdown complete');

        } catch (error) {
            logger.error('Failed to shutdown database module', error);

            throw new AppError(
                'Database shutdown failed',
                500,
                'DATABASE_SHUTDOWN_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Gets a database connection
     * @static
     * @param {string} [name='default'] - Connection name
     * @returns {Object|null} Database connection
     */
    static getConnection(name = 'default') {
        if (!Database.#initialized) {
            return null;
        }

        // Try to get connection using ConnectionManager
        if (ConnectionManager.getConnection) {
            const connection = ConnectionManager.getConnection(name);
            if (connection) {
                return connection;
            }
        }

        // ENHANCED: Try to get admin database as fallback
        if (ConnectionManager.getDatabaseConnection) {
            return ConnectionManager.getDatabaseConnection('admin');
        }

        return null;
    }

    /**
     * Gets the database instance (FIXED - direct access)
     * @static
     * @param {string} [name='default'] - Connection name
     * @returns {Object|null} Database instance
     */
    static getDatabase(name = 'default') {
        const connection = Database.getConnection(name);
        return connection ? connection.db : null;
    }

    /**
     * Gets a model
     * @static
     * @param {string} modelName - Model name
     * @param {string} [tenantId] - Tenant ID for multi-tenant models
     * @returns {Object|null} Model instance
     */
    static async getModel(modelName, tenantId) {
        if (!Database.#initialized) {
            return null;
        }

        // Ensure models are registered before attempting to get them
        ensureModelsRegistered();

        // Check if multi-tenant
        if (tenantId && Database.#multiTenantManager) {
            const schema = Database.#schemas.get(modelName);

            if (!schema) {
                return null;
            }

            return await MultiTenantManager.getTenantModel(tenantId, modelName, schema);
        }

        // Return standard model
        return Database.#models.get(modelName) || null;
    }

    /**
     * Creates a query builder
     * @static
     * @param {string} modelName - Model name
     * @param {Object} [options={}] - Query builder options
     * @returns {QueryBuilder} Query builder instance
     */
    static query(modelName, options = {}) {
        if (!QueryBuilder) {
            throw new AppError('QueryBuilder not available', 500, 'QUERY_BUILDER_NOT_AVAILABLE');
        }

        const model = Database.#models.get(modelName);

        if (!model) {
            throw new AppError(`Model not found: ${modelName}`, 404, 'MODEL_NOT_FOUND');
        }

        return new QueryBuilder(model, options);
    }

    /**
     * Executes a transaction
     * @static
     * @async
     * @param {Function} callback - Transaction callback
     * @param {Object} [options={}] - Transaction options
     * @returns {Promise<*>} Transaction result
     */
    static async transaction(callback, options = {}) {
        if (!Database.#initialized) {
            throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
        }

        if (!Database.#transactionManager) {
            throw new AppError('Transaction manager not available', 500, 'TRANSACTION_MANAGER_NOT_AVAILABLE');
        }

        return await Database.#transactionManager.withTransaction(callback, options);
    }

    /**
     * Gets tenant manager
     * @static
     * @returns {Object|null} Multi-tenant manager
     */
    static getTenantManager() {
        return Database.#multiTenantManager;
    }

    /**
     * Gets transaction manager
     * @static
     * @returns {Object} Transaction manager
     */
    static getTransactionManager() {
        return Database.#transactionManager;
    }

    /**
     * Gets seed manager
     * @static
     * @returns {Object} Seed manager
     */
    static getSeedManager() {
        return Database.#seedManager;
    }

    /**
     * Gets migration runner
     * @static
     * @returns {Object} Migration runner
     */
    static getMigrationRunner() {
        return Database.#migrationRunner;
    }

    /**
     * Gets database health status
     * @static
     * @async
     * @returns {Promise<Object>} Health status
     */
    static async getHealthStatus() {
        try {
            const health = {
                status: 'healthy',
                initialized: Database.#initialized,
                connections: {},
                models: Database.#models.size,
                modelsRegistered: modelsRegistered,
                metrics: {},
                seeding: Database.getSeedingStatus(),
                multiDatabase: {
                    enabled: true,
                    connectionCount: 0,
                    databaseTypes: [],
                    collectionsMapping: {}
                },
                timestamp: new Date().toISOString()
            };

            if (!Database.#initialized) {
                health.status = 'not_initialized';
                return health;
            }

            // Check connections
            const connections = Database.getAllConnections();
            const connectionRouting = Database.getConnectionRouting();

            // Update multi-database information
            health.multiDatabase = {
                enabled: true,
                connectionCount: connections.size,
                databaseTypes: connectionRouting.databases || [],
                tenantConnections: connectionRouting.tenantConnections || 0,
                collectionsMapping: connectionRouting.collectionRouting?.databasePurposes || {}
            };

            for (const [name] of connections) {
                try {
                    let connectionHealth = { healthy: true };
                    if (ConnectionManager.checkHealth) {
                        connectionHealth = await ConnectionManager.checkHealth(name);
                    }
                    health.connections[name] = connectionHealth;

                    if (!connectionHealth.healthy) {
                        health.status = 'unhealthy';
                    }
                } catch (healthError) {
                    health.connections[name] = {
                        healthy: false,
                        error: healthError.message
                    };
                    health.status = 'unhealthy';
                }
            }

            // Get transaction metrics if available
            if (Database.#transactionManager && Database.#transactionManager.getMetrics) {
                try {
                    health.metrics.transactions = Database.#transactionManager.getMetrics();
                } catch (metricsError) {
                    logger.warn('Failed to get transaction metrics', { error: metricsError.message });
                }
            }

            return health;

        } catch (error) {
            logger.error('Failed to get database health', error);

            return {
                status: 'error',
                error: error.message,
                initialized: Database.#initialized,
                modelsRegistered: modelsRegistered,
                seeding: Database.getSeedingStatus(),
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Registers a custom model
     * @static
     * @param {string} modelName - Model name
     * @param {Object} schema - Mongoose schema
     * @param {Object} [options={}] - Model options
     * @returns {Object} Registered model
     */
    static registerModel(modelName, schema, options = {}) {
        if (!Database.#initialized) {
            throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
        }

        if (!BaseModel) {
            throw new AppError('BaseModel not available', 500, 'BASE_MODEL_NOT_AVAILABLE');
        }

        // Store schema for multi-tenant use
        Database.#schemas.set(modelName, schema);

        // Create and register model
        const model = BaseModel.createModel(modelName, schema, options);
        Database.#models.set(modelName, model);

        // Update registration summary
        Database.#modelRegistrationSummary.successful++;
        Database.#modelRegistrationSummary.total++;

        logger.info('Model registered', { modelName });

        return model;
    }

    /**
     * Gets model registration summary
     * @static
     * @returns {Object} Registration summary
     */
    static getRegistrationSummary() {
        return {
            ...Database.#modelRegistrationSummary,
            registeredModels: Array.from(Database.#models.keys())
        };
    }

    /**
     * Gets model registration errors
     * @static
     * @returns {Array} Registration errors
     */
    static getRegistrationErrors() {
        return [...Database.#modelRegistrationErrors];
    }

    /**
     * Creates test collections to verify database setup
     * @static
     * @async
     * @returns {Promise<Object>} Test collection creation result
     */
    static async createTestCollections() {
        try {
            const connection = Database.getConnection();
            if (!connection) {
                throw new Error('No database connection available');
            }

            const testCollections = [
                {
                    name: 'sessions',
                    sampleDoc: {
                        sessionId: 'test_session_' + Date.now(),
                        userId: 'test_user',
                        createdAt: new Date(),
                        expiresAt: new Date(Date.now() + 86400000)
                    }
                },
                {
                    name: 'audit_logs',
                    sampleDoc: {
                        action: 'TEST_ACTION',
                        userId: 'test_user',
                        timestamp: new Date(),
                        details: { 
                            test: true,
                            message: 'Database initialization test'
                        }
                    }
                },
                {
                    name: 'users',
                    sampleDoc: {
                        username: 'test_user_' + Date.now(),
                        email: 'test@example.com',
                        profile: {
                            firstName: 'Test',
                            lastName: 'User'
                        },
                        createdAt: new Date(),
                        accountStatus: { status: 'active' }
                    }
                },
                {
                    name: 'organizations',
                    sampleDoc: {
                        name: 'Test Organization',
                        slug: 'test-org-' + Date.now(),
                        type: 'business',
                        contact: {
                            email: 'test@example.com'
                        },
                        ownership: {
                            ownerId: new (require('mongoose')).Types.ObjectId(),
                            createdBy: new (require('mongoose')).Types.ObjectId()
                        },
                        status: { state: 'active' },
                        createdAt: new Date()
                    }
                }
            ];

            const results = [];

            for (const { name, sampleDoc } of testCollections) {
                try {
                    const collection = connection.db.collection(name);

                    // Insert a test document (this creates the collection)
                    const result = await collection.insertOne(sampleDoc);

                    // Create basic indexes
                    if (name === 'sessions') {
                        await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
                    }
                    if (name === 'users') {
                        await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
                        await collection.createIndex({ username: 1 }, { unique: true, sparse: true });
                    }
                    if (name === 'organizations') {
                        await collection.createIndex({ slug: 1 }, { unique: true });
                    }

                    results.push({
                        collection: name,
                        status: 'created',
                        documentId: result.insertedId,
                        message: 'Collection created with test document'
                    });

                    logger.info(`Test collection created: ${name}`);
                } catch (error) {
                    results.push({
                        collection: name,
                        status: 'failed',
                        error: error.message
                    });
                    logger.error(`Failed to create test collection: ${name}`, { error: error.message });
                }
            }

            return {
                success: true,
                message: 'Test collections creation completed',
                collections: results,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Failed to create test collections', error);
            throw error;
        }
    }

    /**
     * @private
     * Loads built-in models - ENHANCED VERSION with improved registry access and multi-database routing
     * @static
     * @async
     */
    static async #loadModels() {
        try {
            logger.info('Starting model loading process');
            
            let loadedCount = 0;
            let failedCount = 0;

            // Ensure models are registered first
            ensureModelsRegistered();

            // Get models from BaseModel registry if available
            if (BaseModel && BaseModel.getAllModels) {
                try {
                    const baseModelRegistry = BaseModel.getAllModels();
                    
                    for (const [modelName, model] of baseModelRegistry) {
                        try {
                            // ENHANCED: Connect models to their appropriate databases based on collection routing
                            const collectionName = model.collection?.name || BaseModel.getCollectionName ? BaseModel.getCollectionName(modelName) : modelName.toLowerCase() + 's';
                            
                            // Get the appropriate database connection for this collection
                            const connection = Database.getConnectionForCollection(collectionName);
                            
                            if (connection && model.schema) {
                                // Ensure the model is using the correct connection for multi-database setup
                                try {
                                    const DatabaseModel = connection.model(modelName, model.schema);
                                    Database.#models.set(modelName, DatabaseModel);
                                    logger.debug(`Model connected to specific database: ${modelName}`, {
                                        collection: collectionName,
                                        database: Database.getDatabaseTypeForCollection(collectionName)
                                    });
                                } catch (connectionError) {
                                    // Fallback to original model if database-specific connection fails
                                    Database.#models.set(modelName, model);
                                    logger.debug(`Model using fallback connection: ${modelName}`, {
                                        collection: collectionName,
                                        warning: connectionError.message
                                    });
                                }
                            } else {
                                // Register with Database module using original model
                                Database.#models.set(modelName, model);
                                logger.debug(`Model registered with default connection: ${modelName}`, {
                                    collection: collectionName
                                });
                            }
                            
                            // Try to get schema if available
                            if (BaseModel.schemaCache && BaseModel.schemaCache.get) {
                                const schema = BaseModel.schemaCache.get(modelName);
                                if (schema) {
                                    Database.#schemas.set(modelName, schema);
                                }
                            }
                            
                            loadedCount++;
                            logger.debug(`Loaded model: ${modelName}`);
                        } catch (modelError) {
                            failedCount++;
                            const error = {
                                modelName,
                                error: modelError.message,
                                source: 'BaseModel registry'
                            };
                            Database.#modelRegistrationErrors.push(error);
                            logger.error(`Failed to load model ${modelName}`, { error: modelError.message });
                        }
                    }
                } catch (registryError) {
                    logger.warn('Could not access BaseModel registry', { error: registryError.message });
                }
            }

            // Alternative method: Try to access models through mongoose if BaseModel registry is not available
            if (loadedCount === 0) {
                try {
                    const mongoose = require('mongoose');
                    const modelNames = mongoose.modelNames();
                    
                    for (const modelName of modelNames) {
                        try {
                            const model = mongoose.model(modelName);
                            Database.#models.set(modelName, model);
                            
                            // Try to get schema
                            if (model.schema) {
                                Database.#schemas.set(modelName, model.schema);
                            }
                            
                            loadedCount++;
                            logger.debug(`Loaded model from mongoose: ${modelName}`);
                        } catch (modelError) {
                            failedCount++;
                            const error = {
                                modelName,
                                error: modelError.message,
                                source: 'mongoose registry'
                            };
                            Database.#modelRegistrationErrors.push(error);
                            logger.error(`Failed to load model ${modelName} from mongoose`, { error: modelError.message });
                        }
                    }
                } catch (mongooseError) {
                    logger.warn('Could not access mongoose models', { error: mongooseError.message });
                }
            }

            // Final attempt: Register essential models if none were loaded
            if (loadedCount === 0) {
                logger.warn('No models loaded from registries, attempting to create essential models');
                await Database.#createEssentialModels();
                loadedCount = Database.#models.size;
            }

            // Update registration summary
            Database.#modelRegistrationSummary = {
                total: loadedCount + failedCount,
                successful: loadedCount,
                failed: failedCount
            };

            logger.info('Model loading completed', {
                loaded: loadedCount,
                failed: failedCount,
                total: loadedCount + failedCount,
                modelsAvailable: Array.from(Database.#models.keys()),
                modelsRegistered: modelsRegistered
            });

            // ENHANCED: Log model details for debugging with database routing information
            for (const [modelName, model] of Database.#models) {
                const collectionName = model.collection?.name || 'undefined';
                const databaseType = Database.getDatabaseTypeForCollection(collectionName);
                logger.debug(`Model available: ${modelName}`, {
                    hasModel: !!model,
                    modelName: model.modelName || 'undefined',
                    collection: collectionName,
                    hasSchema: Database.#schemas.has(modelName),
                    databaseType: databaseType || 'unmapped'
                });
            }

        } catch (error) {
            logger.error('Model loading failed', error);
            throw new AppError('Failed to load models', 500, 'MODEL_LOADING_ERROR', {
                originalError: error.message
            });
        }
    }

    /**
     * @private
     * Creates essential models if none are loaded
     * @static
     * @async
     */
    static async #createEssentialModels() {
        try {
            const mongoose = require('mongoose');
            
            // Create basic User model if not exists
            if (!Database.#models.has('User')) {
                const userSchema = new mongoose.Schema({
                    username: { type: String, required: true, unique: true },
                    email: { type: String, required: true, unique: true },
                    password: { type: String, required: true },
                    profile: {
                        firstName: { type: String, required: true },
                        lastName: { type: String, required: true },
                        displayName: String
                    },
                    accountStatus: {
                        status: { type: String, default: 'active' }
                    },
                    isSystem: { type: Boolean, default: false },
                    metadata: {
                        type: mongoose.Schema.Types.Mixed,
                        default: {}
                    },
                    createdAt: { type: Date, default: Date.now },
                    updatedAt: { type: Date, default: Date.now }
                });

                const UserModel = mongoose.model('User', userSchema);
                Database.#models.set('User', UserModel);
                Database.#schemas.set('User', userSchema);
                logger.info('Created essential User model');
            }

            // Create basic Organization model if not exists
            if (!Database.#models.has('Organization')) {
                const organizationSchema = new mongoose.Schema({
                    name: { type: String, required: true },
                    slug: { type: String, required: true, unique: true },
                    displayName: String,
                    description: String,
                    type: { 
                        type: String, 
                        enum: ['individual', 'business', 'nonprofit', 'government', 'educational', 'healthcare', 'system', 'other'],
                        default: 'business'
                    },
                    contact: {
                        email: { type: String, required: true },
                        phone: String,
                        website: String
                    },
                    ownership: {
                        ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
                    },
                    subscription: {
                        status: { type: String, default: 'active' },
                        tier: { type: String, default: 'starter' }
                    },
                    status: {
                        state: { type: String, default: 'active' }
                    },
                    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
                    createdAt: { type: Date, default: Date.now },
                    updatedAt: { type: Date, default: Date.now }
                });

                const OrganizationModel = mongoose.model('Organization', organizationSchema);
                Database.#models.set('Organization', OrganizationModel);
                Database.#schemas.set('Organization', organizationSchema);
                logger.info('Created essential Organization model');
            }

        } catch (error) {
            logger.error('Failed to create essential models', error);
            throw error;
        }
    }

    /**
     * Creates indexes for all models
     * @static
     * @async
     * @param {Object} [options={}] - Index creation options
     * @returns {Promise<Object>} Index creation result
     */
    static async createIndexes(options = {}) {
        try {
            const results = {
                successful: 0,
                failed: 0,
                models: []
            };

            for (const [modelName, model] of Database.#models) {
                try {
                    if (model && model.createIndexes) {
                        await model.createIndexes();
                    }
                    results.successful++;
                    results.models.push({
                        name: modelName,
                        status: 'success'
                    });
                } catch (error) {
                    results.failed++;
                    results.models.push({
                        name: modelName,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            logger.info('Index creation completed', results);
            return results;

        } catch (error) {
            logger.error('Failed to create indexes', error);

            throw new AppError(
                'Index creation failed',
                500,
                'INDEX_CREATION_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Validates database configuration
     * @static
     * @async
     * @returns {Promise<Object>} Validation result
     */
    static async validate() {
        try {
            const validation = {
                valid: true,
                errors: [],
                warnings: []
            };

            // Check connection
            if (!Database.#initialized) {
                validation.valid = false;
                validation.errors.push('Database not initialized');
                return validation;
            }

            // Validate connections
            const connections = Database.getAllConnections();

            if (connections.size === 0) {
                validation.valid = false;
                validation.errors.push('No database connections');
            }

            // Check connection health
            for (const [name] of connections) {
                try {
                    let health = { healthy: true };
                    if (ConnectionManager.checkHealth) {
                        health = await ConnectionManager.checkHealth(name);
                    }

                    if (!health.healthy) {
                        validation.errors.push(`Connection '${name}' is unhealthy`);
                        validation.valid = false;
                    }
                } catch (healthError) {
                    validation.errors.push(`Failed to check health for connection '${name}': ${healthError.message}`);
                    validation.valid = false;
                }
            }

            // Check model count
            if (Database.#models.size === 0) {
                validation.warnings.push('No models registered');
            }

            // Check seeding issues
            if (Database.#seedingDisabled) {
                validation.warnings.push('Database seeding is disabled due to previous failures');
            }

            // Validate multi-database architecture
            const connectionRouting = Database.getConnectionRouting();
            if (connectionRouting.databaseConnections === 0) {
                validation.warnings.push('No multi-database connections established');
            }

            logger.info('Database validation completed', {
                valid: validation.valid,
                errors: validation.errors.length,
                warnings: validation.warnings.length
            });

            return validation;

        } catch (error) {
            logger.error('Failed to validate database', error);

            return {
                valid: false,
                errors: [error.message],
                warnings: []
            };
        }
    }

    /**
     * Gets comprehensive health status
     * @static
     * @async
     * @returns {Promise<Object>} Comprehensive health status
     */
    static async getHealth() {
        return await Database.getHealthStatus();
    }

    /**
     * Clears all database data (for testing)
     * @static
     */
    static clearAll() {
        Database.#models.clear();
        Database.#schemas.clear();
        Database.#initialized = false;
        Database.#connectionManager = null;
        Database.#multiTenantManager = null;
        Database.#transactionManager = null;
        Database.#seedManager = null;
        Database.#migrationRunner = null;
        Database.#seedingInProgress = false;
        Database.#seedingDisabled = false;
        Database.#modelRegistrationSummary = { total: 0, successful: 0, failed: 0 };
        Database.#modelRegistrationErrors = [];
        modelsRegistered = false;

        logger.info('All database data cleared');
    }

    /**
     * Forces model reload from BaseModel registry
     * @static
     * @async
     * @returns {Promise<Object>} Reload result
     */
    static async reloadModels() {
        try {
            // Clear current models
            Database.#models.clear();
            Database.#schemas.clear();

            // Reset registration tracking
            Database.#modelRegistrationSummary = { total: 0, successful: 0, failed: 0 };
            Database.#modelRegistrationErrors = [];

            // Force re-registration
            modelsRegistered = false;
            ensureModelsRegistered();

            // Reload models
            await Database.#loadModels();

            logger.info('Models reloaded successfully', {
                modelsLoaded: Database.#models.size,
                modelsAvailable: Array.from(Database.#models.keys()),
                modelsRegistered: modelsRegistered
            });

            return {
                success: true,
                modelsLoaded: Database.#models.size,
                models: Array.from(Database.#models.keys()),
                modelsRegistered: modelsRegistered,
                registrationSummary: Database.#modelRegistrationSummary
            };

        } catch (error) {
            logger.error('Failed to reload models', error);
            throw new AppError('Model reload failed', 500, 'MODEL_RELOAD_ERROR', {
                originalError: error.message
            });
        }
    }

    /**
     * Forces model registration
     * @static
     * @returns {Object} Registration result
     */
    static forceModelRegistration() {
        modelsRegistered = false;
        ensureModelsRegistered();
        
        return {
            success: modelsRegistered,
            modelsInRegistry: BaseModel && BaseModel.getAllModels ? BaseModel.getAllModels().size : 0,
            registrationSummary: Database.#modelRegistrationSummary
        };
    }
}

// Export main class and utilities
module.exports = Database;

// Export individual components for direct access (with safe fallbacks)
module.exports.ConnectionManager = ConnectionManager;
module.exports.MultiTenantManager = MultiTenantManager;
module.exports.QueryBuilder = QueryBuilder;
module.exports.TransactionManager = TransactionManager;
module.exports.BaseModel = BaseModel;

// Export convenience methods
module.exports.connect = Database.initialize;
module.exports.disconnect = Database.shutdown;
module.exports.getConnection = Database.getConnection;
module.exports.getDatabase = Database.getDatabase;
module.exports.getModel = Database.getModel;
module.exports.query = Database.query;
module.exports.transaction = Database.transaction;
module.exports.reloadModels = Database.reloadModels;
module.exports.runSeeds = Database.runSeeds;
module.exports.getSeedingStatus = Database.getSeedingStatus;
module.exports.forceModelRegistration = Database.forceModelRegistration;

// ENHANCED: Export multi-database specific methods
module.exports.getAllConnections = Database.getAllConnections;
module.exports.getConnectionRouting = Database.getConnectionRouting;
module.exports.getDatabaseConnection = Database.getDatabaseConnection;
module.exports.getConnectionForCollection = Database.getConnectionForCollection;
module.exports.getDatabaseTypeForCollection = Database.getDatabaseTypeForCollection;
module.exports.getCollectionsForDatabase = Database.getCollectionsForDatabase;
module.exports.createTenantConnection = Database.createTenantConnection;
module.exports.getTenantConnection = Database.getTenantConnection;
module.exports.getAllTenantConnections = Database.getAllTenantConnections;
module.exports.closeTenantConnection = Database.closeTenantConnection;
module.exports.getRegistrationSummary = Database.getRegistrationSummary;
module.exports.getRegistrationErrors = Database.getRegistrationErrors;