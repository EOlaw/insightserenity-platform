/**
 * @fileoverview Entity Strategy Registry
 * @module shared/lib/database/services/entity-strategy-registry
 * @description Manages registration and discovery of entity-specific transaction strategies
 * Integrates with DatabaseService for seamless model and strategy coordination
 */

const path = require('path');
const logger = require('../../utils/logger').createLogger({
    serviceName: 'entity-strategy-registry'
});
const { AppError } = require('../../utils/app-error');

/**
 * Entity Strategy Registry
 * Central registry for managing entity creation and linking strategies
 * Discovers strategies from the filesystem and validates their interfaces
 */
class EntityStrategyRegistry {
    constructor() {
        this._strategies = new Map();
        this._entityTypeMap = new Map();
        this._strategyPaths = new Map();
        this._initialized = false;
        this._discoveryAttempts = new Map();
    }

    /**
     * Register an entity strategy
     * 
     * @param {string} userType - User type identifier (client, consultant, candidate, partner)
     * @param {string} entityType - Entity model name (Client, Consultant, Candidate, Partner)
     * @param {Object} strategy - Strategy implementation
     * @param {Function} strategy.prepare - Function to prepare entity document
     * @param {Function} strategy.validate - Function to validate entity data
     * @param {Function} strategy.link - Function to define linking strategy
     * @param {Object} strategy.config - Strategy configuration
     */
    registerStrategy(userType, entityType, strategy) {
        if (!userType || typeof userType !== 'string') {
            throw new AppError('User type is required for strategy registration', 400);
        }

        if (!entityType || typeof entityType !== 'string') {
            throw new AppError('Entity type is required for strategy registration', 400);
        }

        if (!strategy || typeof strategy !== 'object') {
            throw new AppError('Strategy implementation is required', 400);
        }

        this._validateStrategyInterface(strategy, userType, entityType);

        const strategyKey = this._buildStrategyKey(userType, entityType);

        if (this._strategies.has(strategyKey)) {
            logger.warn('Overwriting existing strategy', {
                userType,
                entityType,
                strategyKey
            });
        }

        this._strategies.set(strategyKey, {
            userType,
            entityType,
            strategy,
            registeredAt: new Date()
        });

        this._entityTypeMap.set(userType, entityType);

        logger.info('Entity strategy registered', {
            userType,
            entityType,
            strategyKey,
            methods: Object.keys(strategy)
        });
    }

    /**
     * Get strategy for user type
     * 
     * @param {string} userType - User type identifier
     * @returns {Object|null} Strategy implementation or null if not found
     */
    getStrategy(userType) {
        const entityType = this._entityTypeMap.get(userType);
        
        if (!entityType) {
            logger.debug('No strategy found for user type', { userType });
            return null;
        }

        const strategyKey = this._buildStrategyKey(userType, entityType);
        const strategyEntry = this._strategies.get(strategyKey);

        return strategyEntry ? strategyEntry.strategy : null;
    }

    /**
     * Get entity type for user type
     * 
     * @param {string} userType - User type identifier
     * @returns {string|null} Entity type or null if not found
     */
    getEntityType(userType) {
        return this._entityTypeMap.get(userType) || null;
    }

    /**
     * Check if strategy exists for user type
     * 
     * @param {string} userType - User type identifier
     * @returns {boolean} True if strategy exists
     */
    hasStrategy(userType) {
        return this._entityTypeMap.has(userType);
    }

    /**
     * Get all registered strategies
     * 
     * @returns {Array<Object>} Array of strategy metadata
     */
    getAllStrategies() {
        return Array.from(this._strategies.entries()).map(([key, entry]) => ({
            key,
            userType: entry.userType,
            entityType: entry.entityType,
            registeredAt: entry.registeredAt,
            methods: Object.keys(entry.strategy)
        }));
    }

    /**
     * Initialize default strategies
     * Call this during application startup to discover and register strategies
     */
    async initialize() {
        if (this._initialized) {
            logger.warn('Strategy registry already initialized');
            return;
        }

        try {
            await this._registerDefaultStrategies();

            this._initialized = true;

            logger.info('Entity strategy registry initialized', {
                strategiesRegistered: this._strategies.size,
                userTypes: Array.from(this._entityTypeMap.keys())
            });

        } catch (error) {
            logger.error('Failed to initialize entity strategy registry', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Register default strategies by discovering them from the filesystem
     * @private
     */
    async _registerDefaultStrategies() {
        const strategies = [
            {
                userType: 'client',
                entityType: 'Client',
                modulePath: 'core-business/client-management',
                strategyFile: 'client-registration-strategy'
            },
            {
                userType: 'consultant',
                entityType: 'Consultant',
                modulePath: 'core-business/consultant-management',
                strategyFile: 'consultant-registration-strategy'
            },
            {
                userType: 'candidate',
                entityType: 'Candidate',
                modulePath: 'recruitment-services/candidates',
                strategyFile: 'candidate-registration-strategy'
            },
            {
                userType: 'partner',
                entityType: 'Partner',
                modulePath: 'recruitment-services/partnerships',
                strategyFile: 'partner-registration-strategy'
            }
        ];

        for (const strategyConfig of strategies) {
            try {
                const strategy = await this._loadStrategy(strategyConfig);
                
                if (strategy) {
                    this.registerStrategy(
                        strategyConfig.userType,
                        strategyConfig.entityType,
                        strategy
                    );
                }
            } catch (error) {
                logger.warn('Could not load strategy module', {
                    userType: strategyConfig.userType,
                    error: error.message
                });
            }
        }
    }

    /**
     * Load a strategy module from the filesystem with intelligent path resolution
     * @private
     */
    async _loadStrategy(strategyConfig) {
        const { userType, entityType, modulePath, strategyFile } = strategyConfig;

        const attemptsKey = `${userType}:${entityType}`;
        if (this._discoveryAttempts.has(attemptsKey)) {
            logger.debug('Strategy already attempted', { userType, entityType });
            return null;
        }

        this._discoveryAttempts.set(attemptsKey, true);

        const possiblePaths = this._generateStrategyPaths(modulePath, strategyFile);

        for (const strategyPath of possiblePaths) {
            try {
                logger.debug('Attempting to load strategy', {
                    userType,
                    entityType,
                    path: strategyPath
                });

                const strategy = require(strategyPath);

                this._strategyPaths.set(attemptsKey, strategyPath);

                logger.info('Strategy loaded successfully', {
                    userType,
                    entityType,
                    path: strategyPath
                });

                return strategy;

            } catch (error) {
                if (error.code !== 'MODULE_NOT_FOUND') {
                    logger.error('Error loading strategy module', {
                        userType,
                        entityType,
                        path: strategyPath,
                        error: error.message
                    });
                }
            }
        }

        logger.warn('Strategy not found in any expected location', {
            userType,
            entityType,
            attemptedPaths: possiblePaths
        });

        return null;
    }

    /**
     * Generate possible paths for a strategy file
     * @private
     */
    _generateStrategyPaths(modulePath, strategyFile) {
        const currentDir = __dirname;
        const sharedLibPath = path.resolve(currentDir, '../..');
        const projectRoot = path.resolve(sharedLibPath, '../..');

        return [
            path.resolve(projectRoot, 'servers/customer-services/modules', modulePath, 'strategies', strategyFile),
            path.resolve(projectRoot, 'servers/customer-services/modules', modulePath, strategyFile),
            path.resolve(projectRoot, 'servers/customer-services', modulePath, 'strategies', strategyFile),
            path.join('../../../..', 'servers/customer-services/modules', modulePath, 'strategies', strategyFile),
            path.join('../../../../servers/customer-services/modules', modulePath, 'strategies', strategyFile)
        ].map(p => p.replace(/\\/g, '/'));
    }

    /**
     * Validate strategy interface to ensure it implements required methods
     * @private
     */
    _validateStrategyInterface(strategy, userType, entityType) {
        const requiredMethods = ['prepare', 'validate'];
        const missingMethods = requiredMethods.filter(method => 
            typeof strategy[method] !== 'function'
        );

        if (missingMethods.length > 0) {
            throw new AppError(
                `Strategy for ${userType}/${entityType} missing required methods: ${missingMethods.join(', ')}`,
                400,
                'INVALID_STRATEGY'
            );
        }

        if (typeof strategy.getConfig === 'function') {
            const config = strategy.getConfig();
            
            if (!config.entityType) {
                logger.warn('Strategy config missing entityType', {
                    userType,
                    entityType
                });
            }

            if (!config.database) {
                logger.warn('Strategy config missing database', {
                    userType,
                    entityType
                });
            }
        }
    }

    /**
     * Build strategy key for storage and retrieval
     * @private
     */
    _buildStrategyKey(userType, entityType) {
        return `${userType}:${entityType}`;
    }

    /**
     * Clear all strategies (useful for testing)
     */
    clear() {
        this._strategies.clear();
        this._entityTypeMap.clear();
        this._strategyPaths.clear();
        this._discoveryAttempts.clear();
        this._initialized = false;
        logger.info('Entity strategy registry cleared');
    }

    /**
     * Reload a specific strategy from disk
     * @param {string} userType - User type identifier
     * @returns {Promise<boolean>} True if reload successful
     */
    async reloadStrategy(userType) {
        const strategyKey = Array.from(this._strategyPaths.keys())
            .find(key => key.startsWith(`${userType}:`));

        if (!strategyKey) {
            logger.warn('No strategy path found for reload', { userType });
            return false;
        }

        const strategyPath = this._strategyPaths.get(strategyKey);
        
        try {
            delete require.cache[require.resolve(strategyPath)];

            const strategy = require(strategyPath);
            const entityType = this._entityTypeMap.get(userType);

            this.registerStrategy(userType, entityType, strategy);

            logger.info('Strategy reloaded successfully', {
                userType,
                entityType,
                path: strategyPath
            });

            return true;

        } catch (error) {
            logger.error('Failed to reload strategy', {
                userType,
                error: error.message,
                path: strategyPath
            });
            return false;
        }
    }

    /**
     * Get detailed status including discovery attempts
     * @returns {Object} Registry status
     */
    getStatus() {
        return {
            initialized: this._initialized,
            strategiesRegistered: this._strategies.size,
            userTypes: Array.from(this._entityTypeMap.keys()),
            strategies: this.getAllStrategies(),
            discoveryAttempts: Array.from(this._discoveryAttempts.keys()),
            strategyPaths: Object.fromEntries(this._strategyPaths)
        };
    }

    /**
     * Validate all registered strategies
     * @returns {Object} Validation results
     */
    validateAll() {
        const results = {
            valid: true,
            strategies: [],
            errors: []
        };

        for (const [key, entry] of this._strategies.entries()) {
            try {
                this._validateStrategyInterface(
                    entry.strategy,
                    entry.userType,
                    entry.entityType
                );

                results.strategies.push({
                    key,
                    userType: entry.userType,
                    entityType: entry.entityType,
                    valid: true
                });

            } catch (error) {
                results.valid = false;
                results.errors.push({
                    key,
                    userType: entry.userType,
                    entityType: entry.entityType,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Test a strategy without registering it
     * @param {Object} strategy - Strategy to test
     * @param {string} userType - User type
     * @param {string} entityType - Entity type
     * @returns {Object} Test results
     */
    testStrategy(strategy, userType, entityType) {
        const results = {
            valid: true,
            checks: {},
            errors: []
        };

        try {
            this._validateStrategyInterface(strategy, userType, entityType);
            results.checks.interface = true;
        } catch (error) {
            results.valid = false;
            results.checks.interface = false;
            results.errors.push(error.message);
        }

        results.checks.hasPrepare = typeof strategy.prepare === 'function';
        results.checks.hasValidate = typeof strategy.validate === 'function';
        results.checks.hasLink = typeof strategy.link === 'function';
        results.checks.hasGetConfig = typeof strategy.getConfig === 'function';

        if (typeof strategy.getConfig === 'function') {
            try {
                const config = strategy.getConfig();
                results.config = config;
                results.checks.config = true;
            } catch (error) {
                results.checks.config = false;
                results.errors.push(`getConfig() error: ${error.message}`);
            }
        }

        return results;
    }
}

module.exports = new EntityStrategyRegistry();