/**
 * @fileoverview Database Middleware for ConnectionManager Integration
 * @module servers/customer-services/middleware/database-middleware
 * @description Ensures database connections are available to route handlers
 */

const database = require('../../../shared/lib/database');

/**
 * Database middleware factory
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware function
 */
function createDatabaseMiddleware(options = {}) {
    const {
        required = true,
        timeout = 30000,
        healthCheck = false
    } = options;

    return async (req, res, next) => {
        try {
            // Get or initialize database connection manager
            let connectionManager;
            
            try {
                connectionManager = database.getInstance();
            } catch (error) {
                // If no instance exists, try to initialize
                if (error.message.includes('not initialized')) {
                    connectionManager = await database.initialize({
                        environment: process.env.NODE_ENV || 'development',
                        autoDiscoverModels: true,
                        enableHealthChecks: true,
                        enableMetrics: true
                    });
                } else {
                    throw error;
                }
            }

            if (!connectionManager) {
                if (required) {
                    return res.status(503).json({
                        success: false,
                        error: {
                            code: 'DATABASE_UNAVAILABLE',
                            message: 'Database connection manager not available'
                        }
                    });
                }
                return next();
            }

            // Check if initialization is complete
            const status = connectionManager.getStatus();
            if (!status.initialized || !status.ready) {
                if (required) {
                    return res.status(503).json({
                        success: false,
                        error: {
                            code: 'DATABASE_NOT_READY',
                            message: 'Database connections are not ready'
                        }
                    });
                }
                return next();
            }

            // Perform health check if requested
            if (healthCheck) {
                const healthStatus = await connectionManager.getHealthStatus();
                if (!healthStatus.healthy) {
                    if (required) {
                        return res.status(503).json({
                            success: false,
                            error: {
                                code: 'DATABASE_UNHEALTHY',
                                message: 'Database health check failed'
                            }
                        });
                    }
                }
            }

            // Attach database connections to request
            req.db = {
                connectionManager,
                
                // Direct database access
                admin: connectionManager.getDatabase('admin'),
                customer: connectionManager.getDatabase('customer'), 
                shared: connectionManager.getDatabase('shared'),
                
                // Model access helpers
                getModel: (modelName) => {
                    const customerDB = connectionManager.getDatabase('customer');
                    if (customerDB && customerDB.models[modelName]) {
                        return customerDB.models[modelName];
                    }
                    
                    // Fallback to connection manager model routing
                    try {
                        return connectionManager.getModel(modelName);
                    } catch (error) {
                        console.warn(`Model ${modelName} not found:`, error.message);
                        return null;
                    }
                },
                
                getUserModel: () => {
                    const customerDB = connectionManager.getDatabase('customer');
                    if (customerDB && customerDB.models.User) {
                        return customerDB.models.User;
                    }
                    
                    // Try to create model if schema is available
                    try {
                        const UserModel = require('../../../shared/lib/database/models/customer-services/core-business/user.model');
                        if (UserModel.schema && customerDB) {
                            return customerDB.model('User', UserModel.schema);
                        }
                    } catch (error) {
                        console.warn('Failed to create User model:', error.message);
                    }
                    
                    return null;
                },
                
                // Transaction helpers
                createTransaction: async (databases, transactionFunction) => {
                    return await connectionManager.createTransaction(databases, transactionFunction);
                },
                
                // Query execution with monitoring
                executeQuery: async (databaseName, queryFunction) => {
                    return await connectionManager.executeQuery(databaseName, queryFunction);
                }
            };

            // Add database status to response headers (for debugging)
            if (process.env.NODE_ENV === 'development') {
                res.setHeader('X-Database-Status', status.ready ? 'ready' : 'initializing');
                res.setHeader('X-Database-Connections', Object.keys(status.databases).join(','));
            }

            next();

        } catch (error) {
            console.error('Database middleware error:', error);
            
            if (required) {
                return res.status(503).json({
                    success: false,
                    error: {
                        code: 'DATABASE_ERROR',
                        message: process.env.NODE_ENV === 'production' 
                            ? 'Database service temporarily unavailable'
                            : error.message
                    }
                });
            }

            // If not required, continue without database
            req.db = null;
            next();
        }
    };
}

/**
 * Tenant-aware database middleware
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware function
 */
function createTenantDatabaseMiddleware(options = {}) {
    const baseDatabaseMiddleware = createDatabaseMiddleware(options);

    return async (req, res, next) => {
        // First ensure database is available
        await new Promise((resolve, reject) => {
            baseDatabaseMiddleware(req, res, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        // Add tenant-specific model access
        if (req.db && req.tenantId) {
            // Create tenant-aware model wrapper
            req.db.getTenantModel = (modelName) => {
                const Model = req.db.getModel(modelName);
                if (!Model) return null;

                // Return a proxy that automatically adds tenantId to queries
                return new Proxy(Model, {
                    get(target, prop) {
                        if (typeof target[prop] === 'function' && 
                            ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'count', 'countDocuments'].includes(prop)) {
                            
                            return function(...args) {
                                // Add tenantId to query filter
                                if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
                                    args[0].tenantId = req.tenantId;
                                } else if (args[0] === undefined || args[0] === null) {
                                    args[0] = { tenantId: req.tenantId };
                                }
                                return target[prop].apply(target, args);
                            };
                        }
                        
                        if (prop === 'create') {
                            return function(doc, options) {
                                // Add tenantId to document(s)
                                if (Array.isArray(doc)) {
                                    doc.forEach(d => { if (d && typeof d === 'object') d.tenantId = req.tenantId; });
                                } else if (doc && typeof doc === 'object') {
                                    doc.tenantId = req.tenantId;
                                }
                                return target[prop](doc, options);
                            };
                        }

                        return target[prop];
                    }
                });
            };

            // Convenience method for User model with tenant isolation
            req.db.getTenantUserModel = () => {
                return req.db.getTenantModel('User');
            };
        }

        next();
    };
}

/**
 * Health check middleware for database connections
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware function
 */
function createDatabaseHealthMiddleware(options = {}) {
    const { 
        timeout = 5000,
        skipOnError = true
    } = options;

    return async (req, res, next) => {
        try {
            const connectionManager = database.getInstance();
            if (!connectionManager) {
                if (skipOnError) return next();
                return res.status(503).json({
                    success: false,
                    error: { code: 'DATABASE_UNAVAILABLE', message: 'Database not available' }
                });
            }

            const healthPromise = connectionManager.getHealthStatus();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), timeout);
            });

            const healthStatus = await Promise.race([healthPromise, timeoutPromise]);
            
            req.dbHealth = healthStatus;
            next();

        } catch (error) {
            console.error('Database health check failed:', error);
            if (skipOnError) {
                req.dbHealth = { healthy: false, error: error.message };
                next();
            } else {
                res.status(503).json({
                    success: false,
                    error: { code: 'DATABASE_HEALTH_CHECK_FAILED', message: error.message }
                });
            }
        }
    };
}

module.exports = {
    createDatabaseMiddleware,
    createTenantDatabaseMiddleware,
    createDatabaseHealthMiddleware,
    
    // Convenience exports
    database: createDatabaseMiddleware(),
    tenantDatabase: createTenantDatabaseMiddleware(),
    databaseHealth: createDatabaseHealthMiddleware()
};