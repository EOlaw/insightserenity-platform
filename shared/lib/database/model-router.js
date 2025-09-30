/**
 * @fileoverview Model Router for Dynamic Model Management
 * @module shared/lib/database/model-router
 * @description Routes and manages database models across different services
 */

const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

/**
 * ModelRouter Class
 * Manages model routing and discovery across different database connections
 */
class ModelRouter extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = this._initializeConfig(config);
        this.models = new Map();
        this.routingRules = new Map();
        this.modelCache = new Map();
        this.isInitialized = false;

        // Setup default routing rules
        this._setupDefaultRouting();
    }

    /**
     * Initialize configuration with defaults
     * @private
     */
    _initializeConfig(config) {
        return {
            modelsBasePath: config.modelsBasePath || path.join(__dirname, 'models'),
            adminModelsPath: config.adminModelsPath || 'admin-server',
            customerModelsPath: config.customerModelsPath || 'customer-services',
            sharedModelsPath: config.sharedModelsPath || 'shared',
            modelFilePattern: config.modelFilePattern || '**/*{.model.js, -model.js}',
            excludePatterns: config.excludePatterns || ['**/test/**', '**/tests/**', '**/*.test.js', '**/*.spec.js'],
            watchEnabled: config.watchEnabled !== false && process.env.NODE_ENV === 'development',
            autoDiscover: config.autoDiscover !== false,
            lazyLoading: config.lazyLoading !== false,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 300000,
            cacheMaxSize: config.cacheMaxSize || 1000,
            logger: config.logger || console
        };
    }

    /**
     * Setup default routing rules
     * @private
     */
    _setupDefaultRouting() {
        this.addRoutingRule('admin-server', 'admin');
        this.addRoutingRule('customer-services', 'customer');
        this.addRoutingRule('shared', 'shared');
    }

    /**
     * Initialize the model router
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Discover models if auto-discovery is enabled
            if (this.config.autoDiscover) {
                await this.discoverModels();
            }

            // Setup file watchers if enabled
            if (this.config.watchEnabled) {
                await this._setupWatchers();
            }

            this.isInitialized = true;
            this.emit('initialized');
        } catch (error) {
            this.config.logger.error('Failed to initialize ModelRouter:', error);
            throw error;
        }
    }

    /**
     * Add a routing rule
     * @param {string} serviceName - The service name
     * @param {string} databaseName - The database name to route to
     */
    addRoutingRule(serviceName, databaseName) {
        this.routingRules.set(serviceName, databaseName);
        this.emit('routingRuleAdded', { serviceName, databaseName });
    }

    /**
     * Get the database name for a service
     * @param {string} serviceName - The service name
     * @returns {string} The database name
     */
    getDatabaseForService(serviceName) {
        return this.routingRules.get(serviceName) || 'shared';
    }

    /**
     * Register a model
     * @param {string} modelName - The model name
     * @param {Object} model - The model definition
     * @param {string} databaseName - The database name
     */
    registerModel(modelName, model, databaseName) {
        const key = `${databaseName}:${modelName}`;
        this.models.set(key, model);

        // Update cache
        if (this.config.cacheEnabled) {
            this.modelCache.set(key, {
                model,
                timestamp: Date.now()
            });
        }

        this.emit('modelRegistered', { modelName, databaseName });
    }

    /**
     * Get a model
     * @param {string} modelName - The model name
     * @param {string} databaseName - The database name
     * @returns {Object} The model
     */
    getModel(modelName, databaseName) {
        const key = `${databaseName}:${modelName}`;

        // Check cache first
        if (this.config.cacheEnabled) {
            const cached = this.modelCache.get(key);
            if (cached && (Date.now() - cached.timestamp) < this.config.cacheTTL) {
                return cached.model;
            }
        }

        return this.models.get(key);
    }

    /**
     * Discover models in the filesystem
     */
    async discoverModels(options = {}) {
        const discoveryId = Math.random().toString(36).substring(7);
        this.config.logger.info(`Starting model discovery (${discoveryId})`);

        try {
            const discoveries = await Promise.all([
                this._discoverModelsInPath('admin-server', this.config.adminModelsPath),
                this._discoverModelsInPath('customer-services', this.config.customerModelsPath),
                this._discoverModelsInPath('shared', this.config.sharedModelsPath)
            ]);

            const totalDiscovered = discoveries.reduce((sum, d) => sum + d.length, 0);

            this.config.logger.info(`Model discovery completed (${discoveryId}): ${totalDiscovered} models found`);
            this.emit('modelsDiscovered', { count: totalDiscovered, discoveryId });

            return discoveries.flat();
        } catch (error) {
            this.config.logger.error('Model discovery failed:', error);
            throw error;
        }
    }

    /**
     * Discover models in a specific path
     * @private
     */
    async _discoverModelsInPath(serverType, relativePath) {
        const basePath = path.join(this.config.modelsBasePath, relativePath);

        try {
            // Check if path exists
            await fs.access(basePath);

            // Read directory recursively
            const files = await this._readDirRecursive(basePath);
            const modelFiles = files.filter(file =>
                file.endsWith('.model.js') || file.endsWith('-model.js')
            );

            const models = [];
            for (const file of modelFiles) {
                try {
                    const modelName = path.basename(file, '.js').replace(/[-.]model$/, '');
                    models.push({
                        name: modelName,
                        path: file,
                        serverType,
                        database: this.getDatabaseForService(serverType)
                    });
                } catch (error) {
                    this.config.logger.warn(`Failed to process model file ${file}:`, error.message);
                }
            }

            this.config.logger.info(`Discovered ${models.length} models in ${serverType}`);
            return models;
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.config.logger.warn(`Model path does not exist: ${basePath}`);
                return [];
            }
            throw error;
        }
    }

    /**
     * Read directory recursively
     * @private
     */
    async _readDirRecursive(dir, fileList = []) {
        try {
            const files = await fs.readdir(dir);

            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = await fs.stat(filePath);

                if (stat.isDirectory()) {
                    // Skip excluded directories
                    if (!this._isExcluded(filePath)) {
                        await this._readDirRecursive(filePath, fileList);
                    }
                } else if (stat.isFile()) {
                    fileList.push(filePath);
                }
            }

            return fileList;
        } catch (error) {
            this.config.logger.error(`Error reading directory ${dir}:`, error);
            return fileList;
        }
    }

    /**
     * Check if a path should be excluded
     * @private
     */
    _isExcluded(filePath) {
        return this.config.excludePatterns.some(pattern => {
            if (pattern.includes('**')) {
                const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
                return regex.test(filePath);
            }
            return filePath.includes(pattern.replace(/\*/g, ''));
        });
    }

    /**
     * Setup file watchers for development
     * @private
     */
    async _setupWatchers() {
        if (process.env.NODE_ENV === 'production') {
            return;
        }

        // This would use chokidar or fs.watch in a real implementation
        this.config.logger.info('File watchers setup (development mode)');
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.modelCache.clear();
        this.emit('cacheCleared');
    }

    /**
     * Get all registered models
     */
    getAllModels() {
        const models = [];
        for (const [key, model] of this.models) {
            const [database, name] = key.split(':');
            models.push({ name, database, model });
        }
        return models;
    }

    /**
     * Check if a model exists
     */
    hasModel(modelName, databaseName) {
        const key = `${databaseName}:${modelName}`;
        return this.models.has(key);
    }

    /**
     * Remove a model
     */
    removeModel(modelName, databaseName) {
        const key = `${databaseName}:${modelName}`;
        const removed = this.models.delete(key);
        if (removed) {
            this.modelCache.delete(key);
            this.emit('modelRemoved', { modelName, databaseName });
        }
        return removed;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            totalModels: this.models.size,
            cachedModels: this.modelCache.size,
            routingRules: this.routingRules.size,
            isInitialized: this.isInitialized,
            config: {
                watchEnabled: this.config.watchEnabled,
                autoDiscover: this.config.autoDiscover,
                cacheEnabled: this.config.cacheEnabled,
                lazyLoading: this.config.lazyLoading
            }
        };
    }

    /**
     * Shutdown the router
     */
    async shutdown() {
        this.clearCache();
        this.models.clear();
        this.removeAllListeners();
        this.isInitialized = false;
        this.config.logger.info('ModelRouter shutdown complete');
    }

    /**
     * Get metrics (alias for getStats for compatibility with ConnectionManager)
     * @returns {Object} Metrics object
     */
    getMetrics() {
        const stats = this.getStats();

        return {
            models: {
                total: stats.totalModels,
                byDatabase: this._getModelsByDatabase()
            },
            cache: {
                hits: this.cacheHits || 0,
                misses: this.cacheMisses || 0,
                size: stats.cachedModels
            },
            discovery: {
                state: this.isInitialized ? 'completed' : 'pending',
                lastDiscovery: this.lastDiscoveryTime || null
            },
            routing: {
                rules: stats.routingRules
            },
            performance: {
                averageResponseTime: this.avgResponseTime || 0,
                totalRequests: this.totalRequests || 0
            }
        };
    }

    /**
     * Get models grouped by database
     * @private
     * @returns {Object} Models grouped by database
     */
    _getModelsByDatabase() {
        const byDatabase = {};

        for (const [key] of this.models) {
            const [database] = key.split(':');
            if (!byDatabase[database]) {
                byDatabase[database] = 0;
            }
            byDatabase[database]++;
        }

        return byDatabase;
    }
}

// Export the class
module.exports = ModelRouter;
