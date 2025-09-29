/**
 * @fileoverview Enhanced Database Service Layer - Secure Abstraction
 * @module shared/lib/database
 * @description Provides secure, abstracted database operations for all services
 */

const ConnectionManager = require('./connection-manager');
const DatabaseManager = require('./database-manager');
const ModelRouter = require('./model-router');
const EnvironmentConfig = require('./environment-config');
const winston = require('winston');
const path = require('path');

/**
 * Global database instance
 * @type {ConnectionManager|null}
 */
let globalInstance = null;

/**
 * Default logger configuration
 * @type {Object}
 */
const defaultLoggerConfig = {
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'database' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
};

/**
 * Creates a Winston logger instance
 * @param {Object} config - Logger configuration
 * @returns {winston.Logger} Logger instance
 */
function createLogger(config = {}) {
    return winston.createLogger({
        ...defaultLoggerConfig,
        ...config
    });
}

/**
 * Database initialization options
 * @typedef {Object} DatabaseOptions
 * @property {string} [environment] - Environment name (development, staging, production)
 * @property {boolean} [autoInitialize=true] - Auto-initialize on creation
 * @property {boolean} [autoDiscoverModels=true] - Auto-discover models from filesystem
 * @property {boolean} [enableHealthChecks=true] - Enable health monitoring
 * @property {boolean} [enableMetrics=true] - Enable metrics collection
 * @property {winston.Logger} [logger] - Custom logger instance
 * @property {Object} [config] - Additional configuration
 */

/**
 * Initializes the database system
 * @param {DatabaseOptions} options - Initialization options
 * @returns {Promise<ConnectionManager>} Initialized connection manager
 */
async function initialize(options = {}) {
    if (globalInstance && globalInstance.state && globalInstance.state.initialized) {
        return globalInstance;
    }

    const logger = options.logger || createLogger();

    const connectionManager = new ConnectionManager({
        environment: options.environment || process.env.NODE_ENV || 'development',
        autoInitialize: false,
        autoDiscoverModels: options.autoDiscoverModels !== false,
        enableHealthChecks: options.enableHealthChecks !== false,
        enableMetrics: options.enableMetrics !== false,
        logger,
        config: options.config
    });

    try {
        await connectionManager.initialize();
        globalInstance = connectionManager;
        logger.info('Database system initialized successfully');
        return connectionManager;
    } catch (error) {
        logger.error('Failed to initialize database system', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Gets the global database instance
 * @returns {ConnectionManager|null} Global instance or null
 */
function getInstance() {
    if (!globalInstance) {
        throw new Error('Database not initialized. Call initialize() first.');
    }
    return globalInstance;
}

/**
 * Database Service Factory - Provides secure, abstracted database operations
 * @class DatabaseService
 */
class DatabaseService {
    constructor() {
        this._connectionManager = null;
        this._modelCache = new Map();
    }

    /**
     * Get connection manager instance
     * @private
     */
    _getConnectionManager() {
        if (!this._connectionManager) {
            this._connectionManager = getInstance();
        }
        return this._connectionManager;
    }

    /**
     * Get database connection by name
     * @param {string} databaseName - Database name (admin, customer, shared)
     * @returns {mongoose.Connection} Database connection
     */
    getConnection(databaseName) {
        const connectionManager = this._getConnectionManager();
        return connectionManager.getDatabase(databaseName);
    }

    /**
     * Get model from specific database
     * @param {string} modelName - Model name
     * @param {string} databaseName - Database name
     * @returns {mongoose.Model} Model instance
     */
    getModel(modelName, databaseName = 'customer') {
        const cacheKey = `${databaseName}:${modelName}`;
        
        if (this._modelCache.has(cacheKey)) {
            return this._modelCache.get(cacheKey);
        }

        const connection = this.getConnection(databaseName);
        if (!connection) {
            throw new Error(`Database connection '${databaseName}' not available`);
        }

        let model = null;

        // Check if model already exists in connection
        if (connection.models[modelName]) {
            model = connection.models[modelName];
        } else {
            // Try to get model from ConnectionManager first
            try {
                const connectionManager = this._getConnectionManager();
                
                // Try to get model through ConnectionManager's existing discovery
                if (connectionManager.modelRouter && typeof connectionManager.modelRouter.getModel === 'function') {
                    model = connectionManager.modelRouter.getModel(modelName, databaseName);
                }
                
                // If not found, try direct path resolution
                if (!model) {
                    const modelPath = this._resolveModelPath(modelName, databaseName);
                    const ModelDefinition = require(modelPath);
                    
                    if (ModelDefinition.schema) {
                        // Create model with specific connection
                        model = connection.model(modelName, ModelDefinition.schema);
                    } else if (ModelDefinition.createModel) {
                        // Use factory method if available
                        model = ModelDefinition.createModel(connection);
                    } else if (ModelDefinition.User) {
                        // Handle backward compatibility exports
                        model = connection.model(modelName, ModelDefinition.User.schema || ModelDefinition.schema);
                    } else {
                        // Direct model export
                        model = ModelDefinition;
                    }
                }
            } catch (error) {
                throw new Error(`Failed to load model '${modelName}' for database '${databaseName}': ${error.message}`);
            }
        }

        if (model) {
            this._modelCache.set(cacheKey, model);
        }

        return model;
    }

    /**
     * Resolve model file path using automated filesystem discovery
     * @param {string} modelName - Model name
     * @param {string} databaseName - Database name
     * @returns {string} Model file path
     * @private
     */
    _resolveModelPath(modelName, databaseName) {
        // Check cache first
        const cacheKey = `${databaseName}:${modelName}`;
        if (this._modelPathCache && this._modelPathCache.has(cacheKey)) {
            return this._modelPathCache.get(cacheKey);
        }

        // Initialize cache if not exists
        if (!this._modelPathCache) {
            this._modelPathCache = new Map();
        }

        // Discover all models if not already done
        if (!this._discoveredModelPaths) {
            this._discoverAllModels();
        }

        // Find model in discovered paths
        const modelPath = this._discoveredModelPaths.get(cacheKey);
        if (modelPath) {
            this._modelPathCache.set(cacheKey, modelPath);
            return modelPath;
        }

        // If not found, provide helpful error
        const availableModels = Array.from(this._discoveredModelPaths.keys())
            .filter(key => key.startsWith(`${databaseName}:`))
            .map(key => key.split(':')[1]);

        throw new Error(`Model '${modelName}' not found in database '${databaseName}'. Available models: ${availableModels.join(', ')}`);
    }

    /**
     * Discover all models in the filesystem automatically
     * @private
     */
    _discoverAllModels() {
        const fs = require('fs');
        const path = require('path');
        
        // Initialize discovered paths map
        this._discoveredModelPaths = new Map();
        
        const modelsBasePath = path.join(__dirname, 'models');
        
        // Service to database mapping
        const serviceToDatabaseMap = {
            'customer-services': 'customer',
            'admin-server': 'admin',
            'shared': 'shared'
        };

        try {
            if (!fs.existsSync(modelsBasePath)) {
                console.warn('Models directory not found:', modelsBasePath);
                return;
            }

            // Scan each service directory
            const serviceDirectories = fs.readdirSync(modelsBasePath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            for (const serviceDir of serviceDirectories) {
                const databaseName = serviceToDatabaseMap[serviceDir];
                if (!databaseName) {
                    console.warn(`Unknown service directory: ${serviceDir}. Skipping.`);
                    continue;
                }

                const servicePath = path.join(modelsBasePath, serviceDir);
                this._scanDirectoryForModels(servicePath, databaseName, '');
            }

            console.log(`Discovered ${this._discoveredModelPaths.size} models across all services`);

        } catch (error) {
            console.error('Error during model discovery:', error.message);
        }
    }

    /**
     * Recursively scan directory for model files
     * @param {string} dirPath - Directory path to scan
     * @param {string} databaseName - Database name for models in this directory
     * @param {string} relativePath - Relative path from service root
     * @private
     */
    _scanDirectoryForModels(dirPath, databaseName, relativePath) {
        const fs = require('fs');
        const path = require('path');

        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const item of items) {
                const itemPath = path.join(dirPath, item.name);
                const currentRelativePath = path.join(relativePath, item.name);

                if (item.isDirectory()) {
                    // Recursively scan subdirectories
                    this._scanDirectoryForModels(itemPath, databaseName, currentRelativePath);
                } else if (item.isFile() && this._isModelFile(item.name)) {
                    // Process model file
                    const modelName = this._extractModelNameFromFile(item.name);
                    const relativeModelPath = path.join('models', path.relative(path.join(__dirname, 'models'), itemPath));
                    const normalizedPath = `./${relativeModelPath.replace(/\\/g, '/')}`;
                    
                    const cacheKey = `${databaseName}:${modelName}`;
                    this._discoveredModelPaths.set(cacheKey, normalizedPath);

                    console.log(`Discovered model: ${modelName} -> ${normalizedPath} (${databaseName} database)`);
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dirPath}:`, error.message);
        }
    }

    /**
     * Check if file is a model file
     * @param {string} filename - File name
     * @returns {boolean} True if model file
     * @private
     */
    _isModelFile(filename) {
        return filename.endsWith('.model.js') || filename.endsWith('-model.js');
    }

    /**
     * Extract model name from filename
     * @param {string} filename - Model file name
     * @returns {string} Model name
     * @private
     */
    _extractModelNameFromFile(filename) {
        // Remove .model.js or -model.js extension
        let modelName = filename.replace(/\.model\.js$/, '').replace(/-model\.js$/, '');
        
        // Convert from kebab-case or snake_case to PascalCase
        modelName = modelName
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');

        return modelName;
    }

    /**
     * Clear model discovery cache and force re-discovery
     */
    clearModelCache() {
        this._modelPathCache = null;
        this._discoveredModelPaths = null;
        this._modelCache.clear();
        console.log('Model cache cleared. Next model access will trigger re-discovery.');
    }

    /**
     * Get all discovered models for debugging
     * @returns {Object} Discovered models organized by database
     */
    getDiscoveredModels() {
        if (!this._discoveredModelPaths) {
            this._discoverAllModels();
        }

        const result = {
            customer: [],
            admin: [],
            shared: [],
            total: this._discoveredModelPaths.size
        };

        for (const [key, path] of this._discoveredModelPaths.entries()) {
            const [database, modelName] = key.split(':');
            if (result[database]) {
                result[database].push({ name: modelName, path });
            }
        }

        return result;
    }

    /**
     * Force re-discovery of all models (useful for development)
     */
    rediscoverModels() {
        this._discoveredModelPaths = null;
        this._modelPathCache = null;
        this._discoverAllModels();
        return this.getDiscoveredModels();
    }

    /**
     * Execute query with automatic connection management
     * @param {string} databaseName - Database name
     * @param {Function} queryFunction - Query function
     * @returns {Promise<any>} Query result
     */
    async executeQuery(databaseName, queryFunction) {
        const connectionManager = this._getConnectionManager();
        return await connectionManager.executeQuery(databaseName, queryFunction);
    }

    /**
     * Create transaction across multiple databases
     * @param {Array<string>} databases - Database names
     * @param {Function} transactionFunction - Transaction function
     * @returns {Promise<any>} Transaction result
     */
    async createTransaction(databases, transactionFunction) {
        const connectionManager = this._getConnectionManager();
        return await connectionManager.createTransaction(databases, transactionFunction);
    }

    /**
     * Get system health status
     * @returns {Promise<Object>} Health status
     */
    async getHealthStatus() {
        const connectionManager = this._getConnectionManager();
        return await connectionManager.getHealthStatus();
    }

    /**
     * Get system status
     * @returns {Object} Status object
     */
    getStatus() {
        const connectionManager = this._getConnectionManager();
        return connectionManager.getStatus();
    }
}

/**
 * User-specific database operations
 * @class UserDatabaseService
 */
class UserDatabaseService extends DatabaseService {
    constructor() {
        super();
        this._userModelCache = null;
    }

    /**
     * Get User model with proper connection
     * @returns {mongoose.Model} User model
     */
    getUserModel() {
        if (!this._userModelCache) {
            this._userModelCache = this.getModel('User', 'customer');
        }
        return this._userModelCache;
    }

    /**
     * Find user by ID with tenant isolation
     * @param {string} userId - User ID
     * @param {string} tenantId - Tenant ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User document
     */
    async findUserById(userId, tenantId, options = {}) {
        const User = this.getUserModel();
        const { select, populate, includeDeleted = false } = options;

        const query = { _id: userId, tenantId };
        if (!includeDeleted) {
            query.status = { $ne: 'deleted' };
        }

        let userQuery = User.findOne(query);

        if (select) {
            userQuery = userQuery.select(select);
        }

        if (populate && Array.isArray(populate)) {
            populate.forEach(field => {
                userQuery = userQuery.populate(field);
            });
        }

        return await userQuery.exec();
    }

    /**
     * Find users with tenant isolation and pagination
     * @param {string} tenantId - Tenant ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated users result
     */
    async findUsers(tenantId, options = {}) {
        const User = this.getUserModel();
        const {
            page = 1,
            limit = 20,
            sort = '-createdAt',
            filters = {},
            search = null,
            select = null
        } = options;

        const skip = (page - 1) * limit;
        const query = { tenantId, status: { $ne: 'deleted' }, ...filters };

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { email: searchRegex },
                { username: searchRegex }
            ];
        }

        let userQuery = User.find(query)
            .skip(skip)
            .limit(limit)
            .sort(sort);

        if (select) {
            userQuery = userQuery.select(select);
        }

        const [users, total] = await Promise.all([
            userQuery.exec(),
            User.countDocuments(query)
        ]);

        return {
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        };
    }

    /**
     * Create user with tenant isolation
     * @param {Object} userData - User data
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object>} Created user
     */
    async createUser(userData, tenantId) {
        const User = this.getUserModel();
        const userDocument = { ...userData, tenantId };
        return await User.create(userDocument);
    }

    /**
     * Update user with tenant isolation
     * @param {string} userId - User ID
     * @param {Object} updates - Update data
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object>} Updated user
     */
    async updateUser(userId, updates, tenantId) {
        const User = this.getUserModel();
        return await User.findOneAndUpdate(
            { _id: userId, tenantId, status: { $ne: 'deleted' } },
            updates,
            { new: true, runValidators: true }
        );
    }

    /**
     * Delete user (soft delete) with tenant isolation
     * @param {string} userId - User ID
     * @param {string} tenantId - Tenant ID
     * @param {Object} options - Delete options
     * @returns {Promise<Object>} Delete result
     */
    async deleteUser(userId, tenantId, options = {}) {
        const User = this.getUserModel();
        const { hardDelete = false } = options;

        if (hardDelete) {
            return await User.deleteOne({ _id: userId, tenantId });
        } else {
            return await User.findOneAndUpdate(
                { _id: userId, tenantId },
                { 
                    status: 'deleted', 
                    deletedAt: new Date() 
                },
                { new: true }
            );
        }
    }

    /**
     * Check if user exists
     * @param {string} email - Email address
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<boolean>} Whether user exists
     */
    async userExists(email, tenantId) {
        const User = this.getUserModel();
        const count = await User.countDocuments({ 
            email: email.toLowerCase(), 
            tenantId,
            status: { $ne: 'deleted' }
        });
        return count > 0;
    }

    /**
     * Find user by credentials
     * @param {string} email - Email address
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object|null>} User document with password
     */
    async findUserByCredentials(email, tenantId) {
        const User = this.getUserModel();
        return await User.findOne({
            email: email.toLowerCase(),
            tenantId,
            status: { $nin: ['deleted', 'archived'] }
        }).select('+password +twoFactorSecret +twoFactorEnabled');
    }

    /**
     * Get user statistics for tenant
     * @param {string} tenantId - Tenant ID
     * @param {Object} filters - Additional filters
     * @returns {Promise<Object>} User statistics
     */
    async getUserStatistics(tenantId, filters = {}) {
        const User = this.getUserModel();
        const baseMatch = {
            tenantId,
            status: { $ne: 'deleted' },
            ...filters
        };

        const stats = await User.aggregate([
            { $match: baseMatch },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                    inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } }
                }
            }
        ]);

        return stats[0] || {
            total: 0,
            active: 0,
            inactive: 0,
            pending: 0,
            suspended: 0
        };
    }
}

// Create service instances
const databaseService = new DatabaseService();
const userDatabaseService = new UserDatabaseService();

/**
 * Factory function for creating database services
 * @param {string} serviceType - Service type ('user', 'client', etc.)
 * @returns {DatabaseService} Service instance
 */
function createDatabaseService(serviceType) {
    switch (serviceType) {
        case 'user':
            return userDatabaseService;
        default:
            return databaseService;
    }
}

/**
 * Middleware factories
 */
const middleware = {
    /**
     * Creates database connection middleware
     * @param {Object} options - Middleware options
     * @returns {Function} Express middleware
     */
    connectionMiddleware(options = {}) {
        return async (req, res, next) => {
            try {
                if (!globalInstance || !globalInstance.state.initialized) {
                    await initialize(options);
                }

                req.db = {
                    service: databaseService,
                    userService: userDatabaseService,
                    getService: createDatabaseService
                };

                next();
            } catch (error) {
                next(error);
            }
        };
    },

    /**
     * Creates tenant isolation middleware
     * @param {Object} options - Middleware options
     * @returns {Function} Express middleware
     */
    tenantMiddleware(options = {}) {
        return (req, res, next) => {
            const tenantId = req.headers['x-tenant-id'] ||
                           req.query.tenantId ||
                           req.params.tenantId ||
                           'default';

            req.tenantId = tenantId;
            next();
        };
    }
};

// Plugin system remains the same...
const plugins = {
    auditTrailPlugin(options = {}) {
        return function(schema) {
            schema.add({
                _audit: {
                    createdBy: { type: schema.constructor.Types.ObjectId, ref: options.userModel || 'User' },
                    updatedBy: { type: schema.constructor.Types.ObjectId, ref: options.userModel || 'User' },
                    changes: [{
                        timestamp: Date,
                        user: { type: schema.constructor.Types.ObjectId, ref: options.userModel || 'User' },
                        action: String,
                        changes: schema.constructor.Types.Mixed
                    }]
                }
            });

            schema.pre('save', function() {
                if (this.isNew) {
                    this._audit.createdBy = this._context?.userId;
                } else {
                    this._audit.updatedBy = this._context?.userId;
                    if (!this._audit.changes) this._audit.changes = [];
                    this._audit.changes.push({
                        timestamp: new Date(),
                        user: this._context?.userId,
                        action: 'update',
                        changes: this.getChanges()
                    });
                }
            });
        };
    }
};

/**
 * Helper utilities
 */
const helpers = {
    createSchema(definition, options = {}) {
        const mongoose = require('mongoose');
        const enhancedDefinition = {
            ...definition,
            createdAt: { type: Date, default: Date.now, index: true },
            updatedAt: { type: Date, default: Date.now, index: true },
            isDeleted: { type: Boolean, default: false, index: true },
            deletedAt: Date
        };

        const schema = new mongoose.Schema(enhancedDefinition, {
            timestamps: true,
            ...options
        });

        schema.methods.softDelete = function() {
            this.isDeleted = true;
            this.deletedAt = new Date();
            return this.save();
        };

        schema.methods.restore = function() {
            this.isDeleted = false;
            this.deletedAt = undefined;
            return this.save();
        };

        schema.pre(/^find/, function() {
            if (!this.options.includeDeleted) {
                this.where({ isDeleted: { $ne: true } });
            }
        });

        return schema;
    }
};

/**
 * Shutdown function
 * @returns {Promise<void>}
 */
async function shutdown() {
    if (!globalInstance) {
        return;
    }

    await globalInstance.shutdown();
    globalInstance = null;
}

/**
 * Export secure database interface
 */
module.exports = {
    // Core functions
    initialize,
    getInstance,
    shutdown,

    // Service factories
    createDatabaseService,
    getDatabaseService: () => databaseService,
    getUserDatabaseService: () => userDatabaseService,

    // Classes (for advanced usage)
    ConnectionManager,
    DatabaseManager,
    ModelRouter,
    EnvironmentConfig,
    DatabaseService,
    UserDatabaseService,

    // Utilities
    helpers,
    middleware,
    plugins,
    createLogger,

    // Constants
    DATABASES: {
        ADMIN: 'admin',
        CUSTOMER: 'customer', 
        SHARED: 'shared'
    },

    ENVIRONMENTS: {
        DEVELOPMENT: 'development',
        STAGING: 'staging',
        PRODUCTION: 'production',
        TEST: 'test'
    }
};