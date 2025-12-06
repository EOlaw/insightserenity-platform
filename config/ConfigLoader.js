/**
 * @fileoverview InsightSerenity Platform Configuration Loader
 * @module config/ConfigLoader
 * @description Enterprise-grade YAML configuration management system with
 *              environment-specific overrides, variable substitution, and validation.
 * 
 * Configuration Hierarchy (lowest to highest priority):
 *   1. default.yaml - Base configuration
 *   2. {environment}.yaml - Environment-specific overrides
 *   3. local.yaml - Developer overrides (git-ignored)
 *   4. services/{service}.yaml - Service-specific configuration
 *   5. Environment variables - Highest priority overrides
 * 
 * @version 1.0.0
 * @author InsightSerenity Team
 */

'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');
const { EventEmitter } = require('events');

/**
 * Configuration Loader Class
 * Handles loading, merging, and accessing YAML configuration files
 * @class ConfigLoader
 * @extends EventEmitter
 */
class ConfigLoader extends EventEmitter {
    /**
     * Creates an instance of ConfigLoader
     * @param {Object} options - Configuration options
     * @param {string} [options.configDir] - Path to configuration directory
     * @param {string} [options.environment] - Environment name (development, staging, production)
     * @param {string} [options.serviceName] - Service name for service-specific config
     * @param {boolean} [options.watchFiles] - Enable file watching for hot reload
     * @param {boolean} [options.validateOnLoad] - Validate configuration on load
     * @param {Object} [options.logger] - Logger instance
     */
    constructor(options = {}) {
        super();

        // Initialize options with defaults
        this.options = {
            configDir: options.configDir || this._findConfigDir(),
            environment: options.environment || process.env.NODE_ENV || 'development',
            serviceName: options.serviceName || null,
            watchFiles: options.watchFiles || false,
            validateOnLoad: options.validateOnLoad !== false,
            logger: options.logger || this._createDefaultLogger()
        };

        // Internal state
        this._config = {};
        this._loadedFiles = [];
        this._watchers = [];
        this._envVarPattern = /\$\{([^:}]+)(?::([^}]*))?\}/g;
        this._isLoaded = false;
        this._loadTimestamp = null;

        // Load configuration
        this._loadConfiguration();

        // Set up file watching if enabled
        if (this.options.watchFiles) {
            this._setupFileWatching();
        }
    }

    /**
     * Find the configuration directory
     * @private
     * @returns {string} Path to configuration directory
     */
    _findConfigDir() {
        // Try multiple possible locations
        const possiblePaths = [
            path.join(process.cwd(), 'config'),
            path.join(process.cwd(), '..', 'config'),
            path.join(__dirname),
            path.join(__dirname, '..', 'config'),
            path.join(__dirname, '..', '..', 'config')
        ];

        for (const configPath of possiblePaths) {
            if (fs.existsSync(configPath) && fs.existsSync(path.join(configPath, 'default.yaml'))) {
                return configPath;
            }
        }

        // Default to ./config
        return path.join(process.cwd(), 'config');
    }

    /**
     * Create a default logger
     * @private
     * @returns {Object} Logger instance
     */
    _createDefaultLogger() {
        const isProduction = this.options?.environment === 'production';
        return {
            debug: (...args) => !isProduction && console.debug('[ConfigLoader]', ...args),
            info: (...args) => console.info('[ConfigLoader]', ...args),
            warn: (...args) => console.warn('[ConfigLoader]', ...args),
            error: (...args) => console.error('[ConfigLoader]', ...args)
        };
    }

    /**
     * Load all configuration files
     * @private
     */
    _loadConfiguration() {
        const { configDir, environment, serviceName, logger } = this.options;
        
        logger.info(`Loading configuration for environment: ${environment}`);
        
        this._config = {};
        this._loadedFiles = [];

        // 1. Load default.yaml (required)
        const defaultPath = path.join(configDir, 'default.yaml');
        if (fs.existsSync(defaultPath)) {
            this._loadAndMerge(defaultPath);
        } else {
            throw new Error(`Required configuration file not found: ${defaultPath}`);
        }

        // 2. Load environment-specific configuration
        const envPath = path.join(configDir, `${environment}.yaml`);
        if (fs.existsSync(envPath)) {
            this._loadAndMerge(envPath);
        } else {
            logger.warn(`Environment configuration not found: ${envPath}`);
        }

        // 3. Load local.yaml (developer overrides, optional)
        const localPath = path.join(configDir, 'local.yaml');
        if (fs.existsSync(localPath)) {
            this._loadAndMerge(localPath);
            logger.debug('Loaded local configuration overrides');
        }

        // 4. Load service-specific configuration
        if (serviceName) {
            const servicePath = path.join(configDir, 'services', `${serviceName}.yaml`);
            if (fs.existsSync(servicePath)) {
                this._loadAndMerge(servicePath);
                logger.debug(`Loaded service configuration: ${serviceName}`);
            }
        }

        // 5. Apply environment variable overrides
        this._applyEnvironmentVariables();

        // 6. Process variable substitution
        this._processVariableSubstitution(this._config);

        // 7. Validate if enabled
        if (this.options.validateOnLoad) {
            this._validateConfiguration();
        }

        this._isLoaded = true;
        this._loadTimestamp = new Date();
        
        logger.info(`Configuration loaded successfully (${this._loadedFiles.length} files)`);
        this.emit('loaded', { files: this._loadedFiles, timestamp: this._loadTimestamp });
    }

    /**
     * Load a YAML file and merge into configuration
     * @private
     * @param {string} filePath - Path to YAML file
     */
    _loadAndMerge(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = YAML.parse(content);
            
            if (parsed) {
                this._deepMerge(this._config, parsed);
                this._loadedFiles.push(filePath);
                this.options.logger.debug(`Loaded: ${filePath}`);
            }
        } catch (error) {
            this.options.logger.error(`Failed to load ${filePath}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Deep merge two objects
     * @private
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    _deepMerge(target, source) {
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) {
                    target[key] = {};
                }
                this._deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    /**
     * Apply environment variable overrides
     * @private
     */
    _applyEnvironmentVariables() {
        // Map common environment variables to configuration paths
        const envMappings = {
            // Server
            'NODE_ENV': 'platform.environment',
            'HOST': 'server.customerServices.host',
            'PORT': 'server.customerServices.port',
            'ADMIN_HOST': 'server.adminServer.host',
            'ADMIN_PORT': 'server.adminServer.port',
            'CUSTOMER_HOST': 'server.customerServices.host',
            'CUSTOMER_PORT': 'server.customerServices.port',

            // Database
            'DATABASE_ADMIN_URI': 'database.admin.uri',
            'DATABASE_CUSTOMER_URI': 'database.customer.uri',
            'DATABASE_SHARED_URI': 'database.shared.uri',
            'MONGODB_URI': 'database.defaultUri',

            // Authentication
            'JWT_SECRET': 'auth.jwt.secret',
            'JWT_EXPIRY': 'auth.jwt.accessTokenExpiry',
            'JWT_REFRESH_EXPIRY': 'auth.jwt.refreshTokenExpiry',
            'SESSION_SECRET': 'auth.session.secret',

            // Security
            'CORS_ORIGINS': 'security.cors.origins',

            // Redis
            'REDIS_HOST': 'cache.redis.host',
            'REDIS_PORT': 'cache.redis.port',
            'REDIS_PASSWORD': 'cache.redis.password',
            'REDIS_URL': 'cache.redis.url',

            // Email
            'SMTP_HOST': 'email.smtp.host',
            'SMTP_PORT': 'email.smtp.port',
            'SMTP_USER': 'email.smtp.auth.user',
            'SMTP_PASS': 'email.smtp.auth.pass',
            'EMAIL_FROM': 'email.from.address',

            // AWS
            'AWS_REGION': 'storage.s3.region',
            'AWS_S3_BUCKET': 'storage.s3.bucket',
            'AWS_ACCESS_KEY_ID': 'aws.accessKeyId',
            'AWS_SECRET_ACCESS_KEY': 'aws.secretAccessKey',

            // Logging
            'LOG_LEVEL': 'logging.level',
            'LOG_FORMAT': 'logging.format',

            // Features
            'ENABLE_METRICS': 'metrics.enabled',
            'ENABLE_HEALTH_CHECK': 'health.enabled',

            // Stripe
            'STRIPE_SECRET_KEY': 'integrations.stripe.secretKey',
            'STRIPE_WEBHOOK_SECRET': 'integrations.stripe.webhookSecret',

            // Sentry
            'SENTRY_DSN': 'integrations.errorTracking.sentry.dsn'
        };

        for (const [envVar, configPath] of Object.entries(envMappings)) {
            if (process.env[envVar] !== undefined) {
                this._setByPath(configPath, this._parseEnvValue(process.env[envVar]));
            }
        }

        // Also process any env vars with CONFIG_ prefix
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith('CONFIG_')) {
                const configPath = key.substring(7).toLowerCase().replace(/__/g, '.').replace(/_/g, '');
                this._setByPath(configPath, this._parseEnvValue(value));
            }
        }
    }

    /**
     * Parse environment variable value to appropriate type
     * @private
     * @param {string} value - Environment variable value
     * @returns {*} Parsed value
     */
    _parseEnvValue(value) {
        // Boolean
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;

        // Number
        if (/^\d+$/.test(value)) return parseInt(value, 10);
        if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

        // Array (comma-separated)
        if (value.includes(',')) {
            return value.split(',').map(v => this._parseEnvValue(v.trim()));
        }

        // JSON
        if ((value.startsWith('{') && value.endsWith('}')) || 
            (value.startsWith('[') && value.endsWith(']'))) {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }

        return value;
    }

    /**
     * Process variable substitution in configuration
     * @private
     * @param {Object} obj - Configuration object
     */
    _processVariableSubstitution(obj) {
        for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'string') {
                obj[key] = this._substituteVariables(obj[key]);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                this._processVariableSubstitution(obj[key]);
            }
        }
    }

    /**
     * Substitute variables in a string
     * @private
     * @param {string} value - String with potential variables
     * @returns {string} Substituted string
     */
    _substituteVariables(value) {
        return value.replace(this._envVarPattern, (match, varName, defaultValue) => {
            // Check environment variable first
            if (process.env[varName] !== undefined) {
                return process.env[varName];
            }
            
            // Check if it's a config reference
            if (varName.includes('.')) {
                const configValue = this.get(varName);
                if (configValue !== undefined) {
                    return configValue;
                }
            }

            // Return default value or original match
            return defaultValue !== undefined ? defaultValue : match;
        });
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfiguration() {
        const errors = [];
        const warnings = [];

        // Required fields validation
        const requiredFields = [
            'platform.name',
            'server.customerServices.port',
            'server.adminServer.port'
        ];

        for (const field of requiredFields) {
            if (this.get(field) === undefined) {
                errors.push(`Required configuration missing: ${field}`);
            }
        }

        // Port validation
        const ports = [
            this.get('server.customerServices.port'),
            this.get('server.adminServer.port')
        ];

        for (const port of ports) {
            if (port && (port < 0 || port > 65535)) {
                errors.push(`Invalid port number: ${port}`);
            }
        }

        // Production-specific validation
        if (this.options.environment === 'production') {
            if (!this.get('auth.jwt.secret') && !process.env.JWT_SECRET) {
                errors.push('JWT_SECRET must be set in production');
            }
            
            if (this.get('devTools.enabled')) {
                warnings.push('devTools are enabled in production');
            }

            if (this.get('logging.level') === 'debug' || this.get('logging.level') === 'silly') {
                warnings.push('Debug logging is enabled in production');
            }
        }

        // Log warnings
        for (const warning of warnings) {
            this.options.logger.warn(`Configuration warning: ${warning}`);
        }

        // Throw on errors
        if (errors.length > 0) {
            const error = new Error(`Configuration validation failed:\n${errors.join('\n')}`);
            error.validationErrors = errors;
            throw error;
        }

        this.emit('validated', { warnings });
    }

    /**
     * Set up file watching for configuration changes
     * @private
     */
    _setupFileWatching() {
        const chokidar = require('chokidar');
        
        const watcher = chokidar.watch(this.options.configDir, {
            ignored: /node_modules/,
            persistent: true,
            ignoreInitial: true
        });

        watcher.on('change', (filePath) => {
            if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
                this.options.logger.info(`Configuration file changed: ${filePath}`);
                this.reload();
            }
        });

        this._watchers.push(watcher);
    }

    /**
     * Get configuration value by path
     * @param {string} path - Dot-notation path (e.g., 'server.port')
     * @param {*} [defaultValue] - Default value if path not found
     * @returns {*} Configuration value
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let value = this._config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Set configuration value by path
     * @param {string} path - Dot-notation path
     * @param {*} value - Value to set
     */
    set(path, value) {
        this._setByPath(path, value);
        this.emit('changed', { path, value });
    }

    /**
     * Internal method to set value by path
     * @private
     * @param {string} path - Dot-notation path
     * @param {*} value - Value to set
     */
    _setByPath(path, value) {
        const keys = path.split('.');
        let current = this._config;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * Check if a configuration path exists
     * @param {string} path - Dot-notation path
     * @returns {boolean} True if path exists
     */
    has(path) {
        return this.get(path) !== undefined;
    }

    /**
     * Get entire configuration section
     * @param {string} section - Section name
     * @returns {Object} Configuration section
     */
    getSection(section) {
        return this.get(section) || {};
    }

    /**
     * Get all configuration
     * @returns {Object} Complete configuration object
     */
    getAll() {
        return JSON.parse(JSON.stringify(this._config));
    }

    /**
     * Check if feature is enabled
     * @param {string} feature - Feature name
     * @returns {boolean} True if enabled
     */
    isFeatureEnabled(feature) {
        return this.get(`features.${feature}`) === true;
    }

    /**
     * Check if environment is production
     * @returns {boolean} True if production
     */
    isProduction() {
        return this.options.environment === 'production';
    }

    /**
     * Check if environment is development
     * @returns {boolean} True if development
     */
    isDevelopment() {
        return this.options.environment === 'development';
    }

    /**
     * Check if environment is staging
     * @returns {boolean} True if staging
     */
    isStaging() {
        return this.options.environment === 'staging';
    }

    /**
     * Get current environment
     * @returns {string} Environment name
     */
    getEnvironment() {
        return this.options.environment;
    }

    /**
     * Get service name
     * @returns {string|null} Service name
     */
    getServiceName() {
        return this.options.serviceName;
    }

    /**
     * Reload configuration
     */
    reload() {
        this.options.logger.info('Reloading configuration...');
        this._loadConfiguration();
        this.emit('reloaded', { timestamp: new Date() });
    }

    /**
     * Export configuration to JSON file
     * @param {string} filePath - Output file path
     */
    exportToJson(filePath) {
        const config = this.getAll();
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        this.options.logger.info(`Configuration exported to: ${filePath}`);
    }

    /**
     * Get configuration metadata
     * @returns {Object} Metadata
     */
    getMetadata() {
        return {
            environment: this.options.environment,
            serviceName: this.options.serviceName,
            configDir: this.options.configDir,
            loadedFiles: [...this._loadedFiles],
            isLoaded: this._isLoaded,
            loadTimestamp: this._loadTimestamp
        };
    }

    /**
     * Close file watchers and cleanup
     */
    close() {
        for (const watcher of this._watchers) {
            watcher.close();
        }
        this._watchers = [];
        this.removeAllListeners();
    }
}

/**
 * Create a singleton configuration instance
 * @param {Object} options - ConfigLoader options
 * @returns {ConfigLoader} Configuration instance
 */
function createConfig(options = {}) {
    return new ConfigLoader(options);
}

/**
 * Get database configuration helper
 * @param {ConfigLoader} config - Configuration instance
 * @param {string} dbName - Database name (admin, customer, shared)
 * @returns {Object} Database configuration
 */
function getDatabaseConfig(config, dbName) {
    const baseConfig = config.get(`database.${dbName}`) || {};
    const connectionConfig = config.get('database.connection') || {};
    
    // Get URI from environment variable or config
    const envVarName = `DATABASE_${dbName.toUpperCase()}_URI`;
    const uri = process.env[envVarName] || 
                process.env.MONGODB_URI || 
                baseConfig.uri || 
                `mongodb://localhost:27017/${baseConfig.name || `insightserenity_${dbName}`}`;

    return {
        name: baseConfig.name,
        uri,
        options: {
            ...baseConfig.options,
            retryWrites: baseConfig.options?.retryWrites ?? true,
            w: baseConfig.options?.writeConcern?.w || 'majority'
        },
        connection: connectionConfig
    };
}

// Export classes and helpers
module.exports = {
    ConfigLoader,
    createConfig,
    getDatabaseConfig
};