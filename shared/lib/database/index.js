'use strict';

/**
 * @fileoverview Database module main exports - FIXED VERSION
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

/**
 * @class Database
 * @description Main database module providing unified access to all database functionality
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

    /**
     * Initializes the database module
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
                runSeeds = false
            } = options;

            logger.info('Initializing database module');

            // Initialize connection manager
            const connectionOptions = {
                ...config.database,
                ...connection
            };

            await ConnectionManager.connect('default', connectionOptions);
            Database.#connectionManager = ConnectionManager;

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

            // Initialize base model if available
            if (BaseModel) {
                try {
                    BaseModel.initialize({
                        auditService: options.auditService
                    });
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

            // Initialize seed manager if available
            if (SeedManager) {
                try {
                    Database.#seedManager = new SeedManager({
                        ...config.database?.seed,
                        ...seed,
                        transactionManager: Database.#transactionManager
                    });

                    if (Database.#seedManager.initialize) {
                        await Database.#seedManager.initialize();
                    }

                    if (runSeeds && config.app?.env !== 'production' && Database.#seedManager.seed) {
                        const seedResult = await Database.#seedManager.seed({
                            type: config.app?.env
                        });
                        logger.info('Seeds completed', {
                            successful: seedResult.successful || 0,
                            failed: seedResult.failed || 0
                        });
                    }
                } catch (seedError) {
                    logger.warn('Seed manager initialization failed', {
                        error: seedError.message
                    });
                }
            }

            // Load models (FIXED - now properly loads models from BaseModel registry)
            await Database.#loadModels();

            Database.#initialized = true;

            logger.info('Database module initialized successfully', {
                connection: connectionOptions.uri ? 'Connected' : 'Not configured',
                multiTenant: Database.#multiTenantManager ? 'Enabled' : 'Disabled',
                migrationRunner: Database.#migrationRunner ? 'Available' : 'Not available',
                seedManager: Database.#seedManager ? 'Available' : 'Not available',
                modelsLoaded: Database.#models.size
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

            // Clear model registry
            Database.#models.clear();
            Database.#schemas.clear();
            
            if (BaseModel && BaseModel.clearRegistry) {
                BaseModel.clearRegistry();
            }

            // Close all connections
            await ConnectionManager.disconnectAll(force);

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
            throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
        }

        return ConnectionManager.getConnection(name);
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
            throw new AppError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
        }

        // Check if multi-tenant
        if (tenantId && Database.#multiTenantManager) {
            const schema = Database.#schemas.get(modelName);

            if (!schema) {
                throw new AppError(`Model schema not found: ${modelName}`, 404, 'MODEL_NOT_FOUND');
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
                metrics: {},
                timestamp: new Date().toISOString()
            };

            if (!Database.#initialized) {
                health.status = 'not_initialized';
                return health;
            }

            // Check connections
            const connections = ConnectionManager.getAllConnections();

            for (const [name] of connections) {
                try {
                    const connectionHealth = await ConnectionManager.checkHealth(name);
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

        logger.info('Model registered', { modelName });

        return model;
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
                        createdAt: new Date(),
                        role: 'user',
                        status: 'active'
                    }
                },
                {
                    name: 'organizations',
                    sampleDoc: {
                        name: 'Test Organization',
                        slug: 'test-org-' + Date.now(),
                        type: 'business',
                        status: 'active',
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
     * Loads built-in models - FIXED VERSION
     * @static
     * @async
     */
    static async #loadModels() {
        try {
            logger.info('Starting model loading process');
            
            let loadedCount = 0;
            let failedCount = 0;

            // Get models from BaseModel registry if available
            if (BaseModel && BaseModel.getAllModels) {
                try {
                    const baseModelRegistry = BaseModel.getAllModels();
                    
                    for (const [modelName, model] of baseModelRegistry) {
                        try {
                            // Register with Database module
                            Database.#models.set(modelName, model);
                            
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

            logger.info('Model loading completed', {
                loaded: loadedCount,
                failed: failedCount,
                total: loadedCount + failedCount,
                modelsAvailable: Array.from(Database.#models.keys())
            });

            // Log model details for debugging
            for (const [modelName, model] of Database.#models) {
                logger.debug(`Model available: ${modelName}`, {
                    hasModel: !!model,
                    modelName: model.modelName || 'undefined',
                    collection: model.collection?.name || 'undefined',
                    hasSchema: Database.#schemas.has(modelName)
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
                    firstName: String,
                    lastName: String,
                    displayName: String,
                    roles: [{
                        code: String,
                        name: String,
                        assignedAt: Date,
                        assignedBy: String
                    }],
                    status: { type: String, default: 'active' },
                    isSystem: { type: Boolean, default: false },
                    metadata: mongoose.Schema.Types.Mixed,
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
                    metadata: mongoose.Schema.Types.Mixed,
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
            const connections = ConnectionManager.getAllConnections();

            if (connections.size === 0) {
                validation.valid = false;
                validation.errors.push('No database connections');
            }

            // Check connection health
            for (const [name] of connections) {
                try {
                    const health = await ConnectionManager.checkHealth(name);

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

            // Reload models
            await Database.#loadModels();

            logger.info('Models reloaded successfully', {
                modelsLoaded: Database.#models.size,
                modelsAvailable: Array.from(Database.#models.keys())
            });

            return {
                success: true,
                modelsLoaded: Database.#models.size,
                models: Array.from(Database.#models.keys())
            };

        } catch (error) {
            logger.error('Failed to reload models', error);
            throw new AppError('Model reload failed', 500, 'MODEL_RELOAD_ERROR', {
                originalError: error.message
            });
        }
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