/**
 * @fileoverview EnvironmentConfig - Manages database configurations across different environments
 * @module shared/lib/database/environment-config
 * @requires dotenv
 * @requires joi
 * @requires winston
 * @requires crypto
 */

const dotenv = require('dotenv');
const Joi = require('joi');
const winston = require('winston');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const _ = require('lodash');

/**
 * @class EnvironmentConfig
 * @extends EventEmitter
 * @description Manages environment-specific database configurations with validation,
 * encryption, and dynamic configuration updates
 */
class EnvironmentConfig extends EventEmitter {
    /**
     * Creates an instance of EnvironmentConfig
     * @param {Object} options - Configuration options
     * @param {string} options.environment - Environment name (development, staging, production)
     * @param {string} options.configPath - Path to configuration files
     * @param {winston.Logger} options.logger - Logger instance
     * @param {boolean} options.validateOnLoad - Validate configuration on load
     */
    constructor(options = {}) {
        super();

        // Initialize environment
        this.environment = options.environment || process.env.NODE_ENV || 'development';
        this.configPath = options.configPath || process.cwd();
        this.logger = options.logger || this._createDefaultLogger();
        this.validateOnLoad = options.validateOnLoad !== false;

        // Configuration storage
        this.configurations = new Map();
        this.secrets = new Map();
        this.overrides = new Map();
        this.defaults = new Map();

        // Environment variables cache
        this.envVarsCache = new Map();
        this.envVarsLastLoad = null;

        // Configuration state
        this.configState = {
            isLoaded: false,
            lastLoaded: null,
            loadCount: 0,
            errors: [],
            warnings: []
        };

        // Validation schemas
        this.validationSchemas = this._initializeValidationSchemas();

        // Security configuration
        this.security = {
            encryptionEnabled: options.encryptionEnabled !== false && this.environment === 'production',
            encryptionKey: this._getEncryptionKey(),
            algorithm: 'aes-256-gcm',
            saltLength: 32
        };

        // Database configuration templates
        this.databaseTemplates = this._initializeDatabaseTemplates();

        // Connection string patterns
        this.connectionPatterns = {
            standard: /^mongodb:\/\/([^:]+):([^@]+)@([^\/]+)\/(.+)$/,
            srv: /^mongodb\+srv:\/\/([^:]+):([^@]+)@([^\/]+)\/(.+)$/,
            atlas: /^mongodb\+srv:\/\/.*\.mongodb\.net/
        };

        // Feature flags
        this.features = {
            autoSSL: this.environment === 'production',
            retryWrites: true,
            readPreference: this.environment === 'production' ? 'secondaryPreferred' : 'primary',
            writeConcern: this.environment === 'production' ? 'majority' : '1',
            readConcern: this.environment === 'production' ? 'majority' : 'local'
        };

        // Initialize default configurations
        this._initializeDefaults();

        // Load environment variables
        this._loadEnvironmentVariables();

        // Load configuration files
        this._loadConfigurationFiles();

        // Apply overrides if any
        if (options.overrides) {
            this.applyOverrides(options.overrides);
        }

        // Validate configuration if enabled
        if (this.validateOnLoad) {
            this.validateConfiguration();
        }

        // Setup configuration watchers in development
        if (this.environment === 'development' && options.watchFiles !== false) {
            this._setupConfigurationWatchers();
        }

        // Log initialization
        this.logger.info('EnvironmentConfig initialized', {
            environment: this.environment,
            configPath: this.configPath,
            encryptionEnabled: this.security.encryptionEnabled
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
            defaultMeta: { service: 'environment-config' },
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
     * Initializes validation schemas
     * @private
     * @returns {Object} Validation schemas
     */
    _initializeValidationSchemas() {
        return {
            databaseUri: Joi.string()
                .pattern(/^mongodb(\+srv)?:\/\/.+/)
                .required()
                .description('MongoDB connection URI'),

            databaseConfig: Joi.object({
                uri: Joi.string().pattern(/^mongodb(\+srv)?:\/\/.+/).required(),
                name: Joi.string().required(),
                options: Joi.object({
                    minPoolSize: Joi.number().min(1).max(100),
                    maxPoolSize: Joi.number().min(1).max(500),
                    maxIdleTimeMS: Joi.number().min(1000),
                    waitQueueTimeoutMS: Joi.number().min(1000),
                    serverSelectionTimeoutMS: Joi.number().min(1000),
                    socketTimeoutMS: Joi.number().min(1000),
                    heartbeatFrequencyMS: Joi.number().min(1000),
                    retryWrites: Joi.boolean(),
                    w: Joi.alternatives().try(Joi.string(), Joi.number()),
                    readPreference: Joi.string().valid('primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'),
                    readConcern: Joi.object({
                        level: Joi.string().valid('local', 'available', 'majority', 'linearizable', 'snapshot')
                    }),
                    ssl: Joi.boolean(),
                    sslValidate: Joi.boolean(),
                    sslCA: Joi.string(),
                    authSource: Joi.string(),
                    authMechanism: Joi.string()
                }).unknown(true)
            }),

            environmentConfig: Joi.object({
                databases: Joi.object({
                    admin: Joi.object().keys(this._getDatabaseConfigSchema()),
                    customer: Joi.object().keys(this._getDatabaseConfigSchema()),
                    shared: Joi.object().keys(this._getDatabaseConfigSchema()).optional()
                }).required(),

                features: Joi.object({
                    multiTenancy: Joi.boolean(),
                    autoMigration: Joi.boolean(),
                    caching: Joi.boolean(),
                    monitoring: Joi.boolean(),
                    audit: Joi.boolean()
                }),

                security: Joi.object({
                    encryptAtRest: Joi.boolean(),
                    encryptInTransit: Joi.boolean(),
                    requireAuth: Joi.boolean(),
                    ipWhitelist: Joi.array().items(Joi.string().ip()),
                    tlsVersion: Joi.string()
                }),

                performance: Joi.object({
                    queryTimeout: Joi.number(),
                    slowQueryThreshold: Joi.number(),
                    maxConnections: Joi.number(),
                    connectionTimeout: Joi.number()
                })
            })
        };
    }

    /**
     * Gets database configuration schema
     * @private
     * @returns {Object} Database config schema
     */
    _getDatabaseConfigSchema() {
        return {
            uri: Joi.string().pattern(/^mongodb(\+srv)?:\/\/.+/).required(),
            name: Joi.string().required(),
            options: Joi.object().unknown(true)
        };
    }

    /**
     * Initializes database templates
     * @private
     * @returns {Object} Database templates
     */
    _initializeDatabaseTemplates() {
        return {
            development: {
                admin: {
                    name: 'insightserenity_admin_dev',
                    options: {
                        minPoolSize: 2,
                        maxPoolSize: 50,
                        maxIdleTimeMS: 30000,
                        waitQueueTimeoutMS: 15000,
                        serverSelectionTimeoutMS: 15000,
                        socketTimeoutMS: 30000,
                        heartbeatFrequencyMS: 15000,
                        retryWrites: true,
                        w: 1,
                        readPreference: 'primary',
                        readConcern: { level: 'local' }
                        // Note: compressors not needed in development
                    }
                },
                customer: {
                    name: 'insightserenity_customer_dev',
                    options: {
                        minPoolSize: 2,
                        maxPoolSize: 50,
                        maxIdleTimeMS: 30000,
                        waitQueueTimeoutMS: 15000,
                        serverSelectionTimeoutMS: 15000,
                        socketTimeoutMS: 30000,
                        heartbeatFrequencyMS: 15000,
                        retryWrites: true,
                        w: 1,
                        readPreference: 'primary',
                        readConcern: { level: 'local' }
                    }
                },
                shared: {
                    name: 'insightserenity_shared_dev',
                    options: {
                        minPoolSize: 2,
                        maxPoolSize: 50,
                        maxIdleTimeMS: 30000,
                        waitQueueTimeoutMS: 15000,
                        serverSelectionTimeoutMS: 15000,
                        socketTimeoutMS: 30000,
                        heartbeatFrequencyMS: 15000,
                        retryWrites: true,
                        w: 1,
                        readPreference: 'primary',
                        readConcern: { level: 'local' }
                    }
                }
            },

            staging: {
                admin: {
                    name: 'insightserenity_admin_staging',
                    options: {
                        minPoolSize: 5,
                        maxPoolSize: 100,
                        maxIdleTimeMS: 60000,
                        waitQueueTimeoutMS: 30000,
                        serverSelectionTimeoutMS: 30000,
                        socketTimeoutMS: 45000,
                        heartbeatFrequencyMS: 10000,
                        retryWrites: true,
                        w: 'majority',
                        readPreference: 'primaryPreferred',
                        readConcern: { level: 'majority' }
                    }
                },
                customer: {
                    name: 'insightserenity_customer_staging',
                    options: {
                        minPoolSize: 5,
                        maxPoolSize: 100,
                        maxIdleTimeMS: 60000,
                        waitQueueTimeoutMS: 30000,
                        serverSelectionTimeoutMS: 30000,
                        socketTimeoutMS: 45000,
                        heartbeatFrequencyMS: 10000,
                        retryWrites: true,
                        w: 'majority',
                        readPreference: 'primaryPreferred',
                        readConcern: { level: 'majority' }
                    }
                }
            },

            production: {
                admin: {
                    name: 'insightserenity_admin_prod',
                    options: {
                        minPoolSize: 10,
                        maxPoolSize: 200,
                        maxIdleTimeMS: 120000,
                        waitQueueTimeoutMS: 60000,
                        serverSelectionTimeoutMS: 45000,
                        socketTimeoutMS: 60000,
                        heartbeatFrequencyMS: 5000,
                        retryWrites: true,
                        w: 'majority',
                        readPreference: 'secondaryPreferred',
                        readConcern: { level: 'majority' },
                        ssl: true
                        // compressors will be added dynamically in production
                    }
                },
                customer: {
                    name: 'insightserenity_customer_prod',
                    options: {
                        minPoolSize: 10,
                        maxPoolSize: 200,
                        maxIdleTimeMS: 120000,
                        waitQueueTimeoutMS: 60000,
                        serverSelectionTimeoutMS: 45000,
                        socketTimeoutMS: 60000,
                        heartbeatFrequencyMS: 5000,
                        retryWrites: true,
                        w: 'majority',
                        readPreference: 'secondaryPreferred',
                        readConcern: { level: 'majority' },
                        ssl: true
                        // compressors will be added dynamically in production
                    }
                }
            },

            test: {
                admin: {
                    name: 'insightserenity_admin_test',
                    options: {
                        minPoolSize: 1,
                        maxPoolSize: 10,
                        maxIdleTimeMS: 10000,
                        waitQueueTimeoutMS: 5000,
                        serverSelectionTimeoutMS: 5000,
                        socketTimeoutMS: 10000,
                        heartbeatFrequencyMS: 20000,
                        retryWrites: false,
                        w: 1,
                        readPreference: 'primary',
                        readConcern: { level: 'local' }
                    }
                },
                customer: {
                    name: 'insightserenity_customer_test',
                    options: {
                        minPoolSize: 1,
                        maxPoolSize: 10,
                        maxIdleTimeMS: 10000,
                        waitQueueTimeoutMS: 5000,
                        serverSelectionTimeoutMS: 5000,
                        socketTimeoutMS: 10000,
                        heartbeatFrequencyMS: 20000,
                        retryWrites: false,
                        w: 1,
                        readPreference: 'primary',
                        readConcern: { level: 'local' }
                    }
                }
            }
        };
    }

    /**
     * Initializes default configurations
     * @private
     */
    _initializeDefaults() {
        // Set default URIs based on environment
        // These will be overridden by environment variables if present
        const defaultUris = {
            development: {
                admin: process.env.DATABASE_ADMIN_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_admin_dev',
                customer: process.env.DATABASE_CUSTOMER_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_customer_dev',
                shared: process.env.DATABASE_SHARED_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_shared_dev'
            },
            staging: {
                admin: process.env.DATABASE_ADMIN_URI || process.env.STAGING_ADMIN_DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_admin_staging',
                customer: process.env.DATABASE_CUSTOMER_URI || process.env.STAGING_CUSTOMER_DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_customer_staging',
                shared: process.env.DATABASE_SHARED_URI || process.env.STAGING_SHARED_DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_shared_staging'
            },
            production: {
                admin: process.env.DATABASE_ADMIN_URI || process.env.PRODUCTION_ADMIN_DB_URI || process.env.MONGODB_URI || '',
                customer: process.env.DATABASE_CUSTOMER_URI || process.env.PRODUCTION_CUSTOMER_DB_URI || process.env.MONGODB_URI || '',
                shared: process.env.DATABASE_SHARED_URI || process.env.PRODUCTION_SHARED_DB_URI || process.env.MONGODB_URI || ''
            },
            test: {
                admin: process.env.DATABASE_ADMIN_URI || 'mongodb://localhost:27017/insightserenity_admin_test',
                customer: process.env.DATABASE_CUSTOMER_URI || 'mongodb://localhost:27017/insightserenity_customer_test',
                shared: process.env.DATABASE_SHARED_URI || 'mongodb://localhost:27017/insightserenity_shared_test'
            }
        };

        this.defaults.set('uris', defaultUris[this.environment] || defaultUris.development);

        // Set default features
        this.defaults.set('features', {
            multiTenancy: true,
            autoMigration: this.environment !== 'production',
            caching: this.environment !== 'test',
            monitoring: true,
            audit: this.environment === 'production',
            healthChecks: true,
            queryLogging: this.environment === 'development',
            performanceTracking: true
        });

        // Set default security settings
        this.defaults.set('security', {
            encryptAtRest: this.environment === 'production',
            encryptInTransit: this.environment !== 'development',
            requireAuth: this.environment !== 'development',
            ipWhitelist: [],
            tlsVersion: 'TLSv1.2',
            sessionTimeout: this.environment === 'production' ? 900000 : 3600000, // 15 min vs 1 hour
            maxLoginAttempts: 5,
            lockoutDuration: 300000 // 5 minutes
        });

        // Set default performance settings
        this.defaults.set('performance', {
            queryTimeout: this.environment === 'production' ? 30000 : 60000,
            slowQueryThreshold: this.environment === 'production' ? 100 : 1000,
            maxConnections: this.environment === 'production' ? 1000 : 100,
            connectionTimeout: this.environment === 'production' ? 10000 : 30000,
            maxQueryRetries: 3,
            retryDelay: 1000,
            cacheTTL: 300000, // 5 minutes
            compressionEnabled: this.environment === 'production'
        });

        // Set default monitoring settings
        this.defaults.set('monitoring', {
            enabled: true,
            metricsInterval: 60000, // 1 minute
            healthCheckInterval: 30000, // 30 seconds
            alertThresholds: {
                connectionPoolUsage: 0.8,
                queryResponseTime: 1000,
                errorRate: 0.05,
                memoryUsage: 0.9
            }
        });
    }

    /**
     * Loads environment variables
     * @private
     */
    _loadEnvironmentVariables() {
        // Load .env files based on environment
        const envFiles = [
            '.env',
            `.env.${this.environment}`,
            `.env.${this.environment}.local`
        ];

        for (const envFile of envFiles) {
            const envPath = path.join(this.configPath, envFile);
            if (fs.existsSync(envPath)) {
                dotenv.config({ path: envPath });
                this.logger.debug(`Loaded environment file: ${envFile}`);
            }
        }

        // Cache relevant environment variables
        const relevantVars = [
            'DATABASE_ADMIN_URI',
            'DATABASE_CUSTOMER_URI',
            'DATABASE_SHARED_URI',
            'MONGODB_URI',
            'MONGODB_ATLAS_URI',
            'DB_HOST',
            'DB_PORT',
            'DB_USER',
            'DB_PASSWORD',
            'DB_AUTH_SOURCE',
            'DB_SSL',
            'DB_SSL_CA',
            'DB_REPLICA_SET',
            'DB_READ_PREFERENCE',
            'DB_WRITE_CONCERN',
            'DB_MAX_POOL_SIZE',
            'DB_MIN_POOL_SIZE',
            'DB_CONNECTION_TIMEOUT',
            'DB_SOCKET_TIMEOUT',
            'ENCRYPTION_KEY',
            'ENABLE_QUERY_LOGGING',
            'ENABLE_PERFORMANCE_MONITORING',
            'ENABLE_AUDIT_TRAIL'
        ];

        for (const varName of relevantVars) {
            if (process.env[varName]) {
                this.envVarsCache.set(varName, process.env[varName]);
            }
        }

        this.envVarsLastLoad = Date.now();

        this.logger.info('Environment variables loaded', {
            count: this.envVarsCache.size,
            environment: this.environment
        });
    }

    /**
     * Loads configuration files
     * @private
     */
    _loadConfigurationFiles() {
        const configFiles = [
            `config.json`,
            `config.${this.environment}.json`,
            `database.config.json`,
            `database.config.${this.environment}.json`
        ];

        for (const configFile of configFiles) {
            const configPath = path.join(this.configPath, configFile);
            if (fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    this._mergeConfiguration(config);
                    this.logger.debug(`Loaded configuration file: ${configFile}`);
                } catch (error) {
                    this.logger.error(`Failed to load configuration file: ${configFile}`, {
                        error: error.message
                    });
                    this.configState.errors.push({
                        file: configFile,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }

        this.configState.isLoaded = true;
        this.configState.lastLoaded = new Date().toISOString();
        this.configState.loadCount++;
    }

    /**
     * Merges configuration
     * @private
     * @param {Object} config - Configuration to merge
     */
    _mergeConfiguration(config) {
        for (const [key, value] of Object.entries(config)) {
            if (this.configurations.has(key)) {
                // Deep merge existing configuration
                const existing = this.configurations.get(key);
                this.configurations.set(key, _.merge({}, existing, value));
            } else {
                this.configurations.set(key, value);
            }
        }
    }

    /**
     * Gets database configuration
     * @param {string} databaseName - Database name (admin, customer, shared)
     * @returns {Object} Database configuration
     */
    getDatabaseConfig(databaseName) {
        // Validate database name
        if (!databaseName || typeof databaseName !== 'string') {
            throw new Error(`Invalid database name: ${databaseName}. Must be a non-empty string.`);
        }

        // Normalize database name
        const normalizedDbName = databaseName.toLowerCase().trim();

        // Check for environment variable first
        const envVarName = `DATABASE_${normalizedDbName.toUpperCase()}_URI`;
        const envUri = this.envVarsCache.get(envVarName) || this.envVarsCache.get('MONGODB_URI');

        // Get template for current environment with fallback chain
        let template = this.databaseTemplates[this.environment]?.[normalizedDbName];

        if (!template) {
            template = this.databaseTemplates.development?.[normalizedDbName];
        }

        if (!template) {
            // Create a default template if none exists
            this.logger.warn(`No template found for database '${normalizedDbName}' in environment '${this.environment}'. Using default template.`);

            template = {
                name: `insightserenity_${normalizedDbName}_${this.environment}`,
                options: {
                    minPoolSize: this.environment === 'production' ? 5 : 2,
                    maxPoolSize: this.environment === 'production' ? 100 : 50,
                    maxIdleTimeMS: 30000,
                    waitQueueTimeoutMS: 15000,
                    serverSelectionTimeoutMS: 15000,
                    socketTimeoutMS: 30000,
                    heartbeatFrequencyMS: 15000,
                    retryWrites: true,
                    w: this.environment === 'production' ? 'majority' : 1,
                    readPreference: this.environment === 'production' ? 'secondaryPreferred' : 'primary',
                    readConcern: { level: this.environment === 'production' ? 'majority' : 'local' }
                }
            };
        }

        // Get default URI with fallback
        const defaultUris = this.defaults.get('uris') || {};
        const defaultUri = defaultUris[normalizedDbName] || `mongodb://localhost:27017/${template.name}`;

        // Build configuration
        const config = {
            uri: envUri || defaultUri,
            name: template.name,
            options: { ...template.options }
        };

        // Apply overrides if any
        const overrides = this.overrides.get(`database.${normalizedDbName}`);
        if (overrides) {
            Object.assign(config, overrides);
        }

        // Apply Atlas-specific settings if detected
        if (this._isAtlasUri(config.uri)) {
            config.options = this._applyAtlasSettings(config.options);
        }

        // Apply encryption if enabled
        if (this.security.encryptionEnabled && config.uri) {
            config.encryptedUri = this._encryptUri(config.uri);
        }

        // Log configuration creation for debugging
        this.logger.debug(`Database configuration created for '${normalizedDbName}'`, {
            databaseName: normalizedDbName,
            templateFound: !!this.databaseTemplates[this.environment]?.[normalizedDbName],
            hasEnvUri: !!envUri,
            configName: config.name,
            isAtlasUri: this._isAtlasUri(config.uri)
        });

        return config;
    }

    /**
     * Gets all database configurations
     * @returns {Object} All database configurations
     */
    getAllDatabaseConfigs() {
        const configs = {};
        const databases = ['admin', 'customer', 'shared'];

        for (const db of databases) {
            configs[db] = this.getDatabaseConfig(db);
        }

        return configs;
    }

    /**
     * Gets connection options for environment
     * @param {string} databaseName - Database name
     * @returns {Object} Connection options
     */
    getConnectionOptions(databaseName) {
        const config = this.getDatabaseConfig(databaseName);
        const options = { ...config.options };

        // Add environment-specific options
        if (this.environment === 'production') {
            options.autoIndex = false; // Disable auto-indexing in production
            options.bufferCommands = false; // Disable buffering
            options.bufferTimeoutMS = 10000;
        }

        // Add monitoring options
        if (this.defaults.get('features').monitoring) {
            options.monitorCommands = true;
        }

        // Add security options
        if (this.defaults.get('security').requireAuth) {
            options.authSource = this.envVarsCache.get('DB_AUTH_SOURCE') || 'admin';
        }

        return options;
    }

    /**
     * Validates configuration
     * @returns {Object} Validation result
     */
    validateConfiguration() {
        const results = {
            valid: true,
            errors: [],
            warnings: []
        };

        // Validate database configurations
        const databases = ['admin', 'customer'];
        for (const db of databases) {
            const config = this.getDatabaseConfig(db);

            // Check URI
            if (!config.uri) {
                results.errors.push(`Missing URI for ${db} database`);
                results.valid = false;
            } else {
                // Validate URI format
                const { error } = this.validationSchemas.databaseUri.validate(config.uri);
                if (error) {
                    results.errors.push(`Invalid URI for ${db} database: ${error.message}`);
                    results.valid = false;
                }
            }

            // Validate options
            if (config.options) {
                const { error } = Joi.object(config.options).unknown(true).validate(config.options);
                if (error) {
                    results.warnings.push(`Invalid options for ${db} database: ${error.message}`);
                }
            }
        }

        // Check for production requirements
        if (this.environment === 'production') {
            if (!this.envVarsCache.get('DATABASE_ADMIN_URI')) {
                results.warnings.push('DATABASE_ADMIN_URI not set for production environment');
            }
            if (!this.envVarsCache.get('DATABASE_CUSTOMER_URI')) {
                results.warnings.push('DATABASE_CUSTOMER_URI not set for production environment');
            }
            if (!this.security.encryptionKey) {
                results.warnings.push('Encryption key not set for production environment');
            }
        }

        // Store validation results
        this.configState.errors = results.errors;
        this.configState.warnings = results.warnings;

        // Log results
        if (!results.valid) {
            this.logger.error('Configuration validation failed', results);
        } else if (results.warnings.length > 0) {
            this.logger.warn('Configuration validation warnings', results);
        } else {
            this.logger.info('Configuration validation passed');
        }

        return results;
    }

    /**
     * Applies overrides to configuration
     * @param {Object} overrides - Configuration overrides
     */
    applyOverrides(overrides) {
        for (const [key, value] of Object.entries(overrides)) {
            this.overrides.set(key, value);
        }

        this.logger.info('Configuration overrides applied', {
            keys: Object.keys(overrides)
        });

        // Emit configuration change event
        this.emit('configuration:changed', { overrides });
    }

    /**
     * Gets feature flag value
     * @param {string} feature - Feature name
     * @returns {boolean} Feature enabled status
     */
    isFeatureEnabled(feature) {
        const features = this.defaults.get('features');
        const override = this.overrides.get(`features.${feature}`);

        if (override !== undefined) {
            return override;
        }

        return features[feature] || false;
    }

    /**
     * Gets security setting
     * @param {string} setting - Security setting name
     * @returns {any} Security setting value
     */
    getSecuritySetting(setting) {
        const security = this.defaults.get('security');
        const override = this.overrides.get(`security.${setting}`);

        if (override !== undefined) {
            return override;
        }

        return security[setting];
    }

    /**
     * Gets performance setting
     * @param {string} setting - Performance setting name
     * @returns {any} Performance setting value
     */
    getPerformanceSetting(setting) {
        const performance = this.defaults.get('performance');
        const override = this.overrides.get(`performance.${setting}`);

        if (override !== undefined) {
            return override;
        }

        return performance[setting];
    }

    /**
     * Checks if URI is MongoDB Atlas
     * @private
     * @param {string} uri - Database URI
     * @returns {boolean} True if Atlas URI
     */
    _isAtlasUri(uri) {
        if (!uri) return false;
        return uri.includes('mongodb.net') || uri.includes('mongodb+srv');
    }

    /**
     * Applies MongoDB Atlas specific settings
     * @private
     * @param {Object} options - Connection options
     * @returns {Object} Modified options
     */
    _applyAtlasSettings(options) {
        const atlasOptions = {
            ...options,
            ssl: true,
            // Remove sslValidate as it's not a valid option for newer MongoDB drivers
            retryWrites: true,
            w: 'majority',
            readPreference: this.environment === 'production' ? 'secondaryPreferred' : 'primary',
            maxPoolSize: Math.min(options.maxPoolSize || 100, 500), // Atlas has connection limits
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 0 // Let Atlas handle timeouts
        };

        // Only add compressors in production environment
        // Development doesn't need compression
        if (this.environment === 'production') {
            try {
                // MongoDB driver expects compressors as an array
                atlasOptions.compressors = ['snappy', 'zlib'];
            } catch (e) {
                // Ignore if compressors not supported
                this.logger.debug('Compressors not supported by driver version');
            }
        }

        return atlasOptions;
    }

    /**
     * Gets encryption key
     * @private
     * @returns {string|null} Encryption key
     */
    _getEncryptionKey() {
        // Try multiple sources for encryption key
        const key = process.env.ENCRYPTION_KEY ||
                   process.env.DB_ENCRYPTION_KEY ||
                   process.env.SECRET_KEY;

        if (!key && this.environment === 'production') {
            this.logger.warn('No encryption key found for production environment');
        }

        return key;
    }

    /**
     * Encrypts URI
     * @private
     * @param {string} uri - Database URI
     * @returns {string} Encrypted URI
     */
    _encryptUri(uri) {
        if (!this.security.encryptionKey) {
            return uri;
        }

        try {
            const iv = crypto.randomBytes(16);
            const salt = crypto.randomBytes(this.security.saltLength);
            const key = crypto.pbkdf2Sync(
                this.security.encryptionKey,
                salt,
                100000,
                32,
                'sha256'
            );

            const cipher = crypto.createCipheriv(this.security.algorithm, key, iv);

            let encrypted = cipher.update(uri, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const authTag = cipher.getAuthTag();

            return Buffer.concat([
                salt,
                iv,
                authTag,
                Buffer.from(encrypted, 'hex')
            ]).toString('base64');

        } catch (error) {
            this.logger.error('Failed to encrypt URI', { error: error.message });
            return uri;
        }
    }

    /**
     * Decrypts URI
     * @param {string} encryptedUri - Encrypted URI
     * @returns {string} Decrypted URI
     */
    decryptUri(encryptedUri) {
        if (!this.security.encryptionKey) {
            return encryptedUri;
        }

        try {
            const buffer = Buffer.from(encryptedUri, 'base64');

            const salt = buffer.slice(0, this.security.saltLength);
            const iv = buffer.slice(this.security.saltLength, this.security.saltLength + 16);
            const authTag = buffer.slice(this.security.saltLength + 16, this.security.saltLength + 32);
            const encrypted = buffer.slice(this.security.saltLength + 32);

            const key = crypto.pbkdf2Sync(
                this.security.encryptionKey,
                salt,
                100000,
                32,
                'sha256'
            );

            const decipher = crypto.createDecipheriv(this.security.algorithm, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;

        } catch (error) {
            this.logger.error('Failed to decrypt URI', { error: error.message });
            return encryptedUri;
        }
    }

    /**
     * Sets up configuration watchers
     * @private
     */
    _setupConfigurationWatchers() {
        const chokidar = require('chokidar');

        const watchPatterns = [
            path.join(this.configPath, '*.json'),
            path.join(this.configPath, '.env*')
        ];

        this.watcher = chokidar.watch(watchPatterns, {
            persistent: true,
            ignoreInitial: true
        });

        this.watcher.on('change', (filePath) => {
            this.logger.info(`Configuration file changed: ${filePath}`);

            // Reload configuration
            this._loadConfigurationFiles();
            this._loadEnvironmentVariables();

            // Validate new configuration
            if (this.validateOnLoad) {
                this.validateConfiguration();
            }

            // Emit change event
            this.emit('configuration:reloaded', { filePath });
        });

        this.logger.info('Configuration file watchers setup');
    }

    /**
     * Gets environment name
     * @returns {string} Environment name
     */
    getEnvironment() {
        return this.environment;
    }

    /**
     * Checks if in production
     * @returns {boolean} True if production
     */
    isProduction() {
        return this.environment === 'production';
    }

    /**
     * Checks if in development
     * @returns {boolean} True if development
     */
    isDevelopment() {
        return this.environment === 'development';
    }

    /**
     * Checks if in test
     * @returns {boolean} True if test
     */
    isTest() {
        return this.environment === 'test';
    }

    /**
     * Gets configuration state
     * @returns {Object} Configuration state
     */
    getConfigurationState() {
        return {
            ...this.configState,
            environment: this.environment,
            databases: this.getAllDatabaseConfigs(),
            features: Object.fromEntries(this.defaults.get('features')),
            security: Object.fromEntries(this.defaults.get('security')),
            performance: Object.fromEntries(this.defaults.get('performance'))
        };
    }

    /**
     * Exports configuration
     * @param {boolean} includeSensitive - Include sensitive data
     * @returns {Object} Exported configuration
     */
    exportConfiguration(includeSensitive = false) {
        const config = {
            environment: this.environment,
            databases: {},
            features: Object.fromEntries(this.defaults.get('features')),
            security: Object.fromEntries(this.defaults.get('security')),
            performance: Object.fromEntries(this.defaults.get('performance')),
            monitoring: Object.fromEntries(this.defaults.get('monitoring'))
        };

        // Export database configs
        for (const db of ['admin', 'customer', 'shared']) {
            const dbConfig = this.getDatabaseConfig(db);
            config.databases[db] = {
                name: dbConfig.name,
                options: dbConfig.options
            };

            if (includeSensitive) {
                config.databases[db].uri = dbConfig.uri;
            } else {
                // Sanitize URI
                config.databases[db].uri = this._sanitizeUri(dbConfig.uri);
            }
        }

        return config;
    }

    /**
     * Sanitizes URI for logging
     * @private
     * @param {string} uri - Database URI
     * @returns {string} Sanitized URI
     */
    _sanitizeUri(uri) {
        if (!uri) return '';
        return uri.replace(/:([^:@]+)@/, ':****@');
    }

    /**
     * Generates example configuration
     * @returns {string} Example configuration
     */
    generateExampleConfig() {
        return {
            development: {
                DATABASE_ADMIN_URI: 'mongodb://localhost:27017/insightserenity_admin_dev',
                DATABASE_CUSTOMER_URI: 'mongodb://localhost:27017/insightserenity_customer_dev',
                DATABASE_SHARED_URI: 'mongodb://localhost:27017/insightserenity_shared_dev',
                DB_MAX_POOL_SIZE: '50',
                DB_MIN_POOL_SIZE: '2',
                ENABLE_QUERY_LOGGING: 'true',
                ENABLE_PERFORMANCE_MONITORING: 'true'
            },
            staging: {
                DATABASE_ADMIN_URI: 'mongodb+srv://username:password@cluster.mongodb.net/insightserenity_admin_staging',
                DATABASE_CUSTOMER_URI: 'mongodb+srv://username:password@cluster.mongodb.net/insightserenity_customer_staging',
                DATABASE_SHARED_URI: 'mongodb+srv://username:password@cluster.mongodb.net/insightserenity_shared_staging',
                DB_MAX_POOL_SIZE: '100',
                DB_MIN_POOL_SIZE: '5',
                DB_SSL: 'true',
                ENABLE_AUDIT_TRAIL: 'true'
            },
            production: {
                DATABASE_ADMIN_URI: 'mongodb+srv://username:password@cluster.mongodb.net/insightserenity_admin_prod',
                DATABASE_CUSTOMER_URI: 'mongodb+srv://username:password@cluster.mongodb.net/insightserenity_customer_prod',
                DATABASE_SHARED_URI: 'mongodb+srv://username:password@cluster.mongodb.net/insightserenity_shared_prod',
                DB_MAX_POOL_SIZE: '200',
                DB_MIN_POOL_SIZE: '10',
                DB_SSL: 'true',
                DB_SSL_VALIDATE: 'true',
                DB_READ_PREFERENCE: 'secondaryPreferred',
                DB_WRITE_CONCERN: 'majority',
                ENCRYPTION_KEY: 'your-256-bit-encryption-key-here',
                ENABLE_AUDIT_TRAIL: 'true',
                ENABLE_PERFORMANCE_MONITORING: 'true'
            }
        };
    }

    /**
     * Cleanup method
     * @returns {Promise<void>}
     */
    async cleanup() {
        this.logger.info('Cleaning up EnvironmentConfig');

        // Stop file watchers
        if (this.watcher) {
            await this.watcher.close();
        }

        // Clear caches
        this.configurations.clear();
        this.secrets.clear();
        this.overrides.clear();
        this.defaults.clear();
        this.envVarsCache.clear();

        this.logger.info('EnvironmentConfig cleanup completed');
    }
}

module.exports = EnvironmentConfig;
