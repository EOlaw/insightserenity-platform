/**
 * @file Admin Configuration Index - FIXED VERSION
 * @description Central configuration aggregator for admin server
 * @module servers/admin-server/config/index
 * @version 3.0.0
 */

'use strict';

const path = require('path');

// Import shared configuration as base - FIXED to use existing base-config
const sharedConfig = require('../../../shared/config');

// Import admin-specific configurations directly
const adminConfig = require('./admin-config');
const sessionConfig = require('./session-config');
const featuresConfig = require('./features-config');
const securityConfig = require('./security-config');
const monitoringConfig = require('./monitoring-config');

// Safely load admin-specific configurations
// const loadAdminConfigModule = (moduleName) => {
//     try {
//         return require(`./${moduleName}`);
//     } catch (error) {
//         console.log(`Admin config module ${moduleName} not found, using defaults`);
//         return {};
//     }
// };

// Load admin-specific configurations with fallbacks
// const adminConfig = loadAdminConfigModule('admin-config');
// const sessionConfig = loadAdminConfigModule('session-config');
// const featuresConfig = loadAdminConfigModule('features-config');
// const securityConfig = loadAdminConfigModule('security-config');
// const monitoringConfig = loadAdminConfigModule('monitoring-config');

/**
 * Admin server configuration class - FIXED to use existing baseConfig structure
 * Extends shared configuration with admin-specific settings
 */
class AdminConfiguration {
    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.isDevelopment = this.environment === 'development';
        this.isProduction = this.environment === 'production';
        this.isStaging = this.environment === 'staging';
        this.isTest = this.environment === 'test';

        // Initialize configuration using existing shared config
        this.config = this.buildConfiguration();

        // Validate critical configurations
        this.validateConfiguration();

        // Freeze configuration in production
        if (this.isProduction) {
            this.deepFreeze(this.config);
        }
    }

    /**
     * Build complete configuration object - FIXED to use existing shared config structure
     * @returns {Object} Complete admin configuration
     */
    buildConfiguration() {
        // Start with shared configuration as base - FIXED to not modify shared config
        const baseConfig = {
            ...sharedConfig,

            // Override app settings for admin using existing structure
            app: {
                ...sharedConfig.app,
                env: sharedConfig.environment?.name || process.env.NODE_ENV || 'development',
                name: process.env.APP_NAME || 'InsightSerenity Admin Server',
                type: 'admin',
                port: parseInt(process.env.ADMIN_PORT, 10) || 5001,
                host: process.env.ADMIN_HOST || '127.0.0.1',
                url: this.buildAdminUrl(),
                basePath: process.env.ADMIN_BASE_PATH || '/admin',
                apiPrefix: process.env.ADMIN_API_PREFIX || '/admin/api',
                uploadLimit: process.env.ADMIN_UPLOAD_LIMIT || '50mb',
                behindProxy: process.env.ADMIN_BEHIND_PROXY === 'true',
                trustProxyLevel: parseInt(process.env.ADMIN_TRUST_PROXY_LEVEL, 10) || 1,
                version: sharedConfig.constants?.VERSION || sharedConfig.app?.version || '1.0.0'
            }
        };

        // Merge admin-specific configurations using existing patterns
        return {
            ...baseConfig,

            // Admin-specific configuration
            admin: {
                port: parseInt(process.env.ADMIN_PORT, 10) || 5001,
                host: process.env.ADMIN_HOST || '127.0.0.1',
                url: this.buildAdminUrl(),
                basePath: process.env.ADMIN_BASE_PATH || '/admin',
                apiPrefix: process.env.ADMIN_API_PREFIX || '/admin/api',
                uploadLimit: process.env.ADMIN_UPLOAD_LIMIT || '50mb',
                behindProxy: process.env.ADMIN_BEHIND_PROXY === 'true',
                trustProxyLevel: parseInt(process.env.ADMIN_TRUST_PROXY_LEVEL, 10) || 1,

                security: {
                    forceSSL: process.env.ADMIN_FORCE_SSL === 'true',
                    requireMFA: process.env.ADMIN_REQUIRE_MFA === 'true',
                    sessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT, 10) || 3600000,
                    cookieSecret: process.env.ADMIN_COOKIE_SECRET || process.env.SESSION_SECRET || 'admin_development_secret',
                    ipWhitelist: {
                        enabled: process.env.ADMIN_IP_WHITELIST_ENABLED === 'true',
                        addresses: process.env.ADMIN_IP_WHITELIST ? process.env.ADMIN_IP_WHITELIST.split(',') : []
                    },
                    ssl: {
                        keyPath: process.env.ADMIN_SSL_KEY_PATH || '../key.pem',
                        certPath: process.env.ADMIN_SSL_CERT_PATH || '../cert.pem'
                    }
                },
                // Extract non-logging properties from adminConfig
                ...Object.fromEntries(Object.entries(adminConfig).filter(([key]) => key !== 'logging'))
            },

            // Expose logging configuration at top level for admin-logger
            logging: {
                ...baseConfig.logging,
                ...adminConfig.logging
            },

            // Session configuration - merge with existing session config
            session: this.mergeSessionConfig(baseConfig.security?.session, sessionConfig),

            // Features configuration - use from baseConfig or override
            features: {
                ...baseConfig.features,
                realTimeMonitoring: process.env.ADMIN_REAL_TIME_MONITORING !== 'false',
                advancedAnalytics: process.env.ADMIN_ADVANCED_ANALYTICS !== 'false',
                bulkOperations: process.env.ADMIN_BULK_OPERATIONS !== 'false',
                auditLogging: process.env.AUDIT_ENABLED !== 'false',
                ...featuresConfig
            },

            // Security configuration - enhance existing security config
            security: this.mergeSecurityConfig(baseConfig.security, securityConfig),

            // Monitoring configuration
            monitoring: {
                healthCheckInterval: parseInt(process.env.ADMIN_HEALTH_CHECK_INTERVAL, 10) || 30000,
                metricsEnabled: process.env.ADMIN_METRICS_ENABLED !== 'false',
                alerting: {
                    enabled: process.env.ADMIN_ALERTING_ENABLED === 'true'
                },
                ...monitoringConfig
            },

            // Admin-specific paths
            paths: {
                ...baseConfig.paths,
                adminRoot: path.join(process.cwd(), 'servers', 'admin-server'),
                adminPublic: path.join(process.cwd(), 'servers', 'admin-server', 'public'),
                adminViews: path.join(process.cwd(), 'servers', 'admin-server', 'views'),
                adminLogs: path.join(process.cwd(), 'logs', 'admin'),
                adminUploads: path.join(process.cwd(), 'uploads', 'admin'),
                adminTemp: path.join(process.cwd(), 'temp', 'admin'),
                auditLogs: path.join(process.cwd(), 'logs', 'audit')
            }
        };
    }

    /**
     * Build admin URL based on environment - keep existing function
     * @returns {string} Admin server URL
     */
    buildAdminUrl() {
        if (process.env.ADMIN_URL) {
            return process.env.ADMIN_URL;
        }

        const protocol = process.env.ADMIN_FORCE_SSL === 'true' ? 'https' : 'http';
        const host = process.env.ADMIN_HOST || '127.0.0.1';
        const port = process.env.ADMIN_PORT || 5001;

        // Production URLs typically don't include port
        if (this.isProduction && [80, 443].includes(parseInt(port, 10))) {
            return `${protocol}://${host}`;
        }

        return `${protocol}://${host}:${port}`;
    }

    /**
     * Merge session configuration with shared config - keep existing function
     * @param {Object} sharedSession - Shared session config
     * @param {Object} adminSession - Admin session config
     * @returns {Object} Merged session configuration
     */
    mergeSessionConfig(sharedSession = {}, adminSession = {}) {
        return {
            ...sharedSession,
            ...adminSession,
            enabled: process.env.SESSION_ENABLED !== 'false',
            timeout: parseInt(process.env.SESSION_TIMEOUT, 10) || 3600000,
            secret: process.env.SESSION_SECRET || 'development_session_secret',
            cookie: {
                ...sharedSession.cookie,
                ...adminSession.cookie,
                // Admin sessions should always be secure in production
                secure: this.isProduction || process.env.ADMIN_FORCE_SSL === 'true',
                httpOnly: true,
                sameSite: 'strict'
            },
            store: process.env.SESSION_STORE || 'memory'
        };
    }

    /**
     * Merge security configuration with enhanced admin settings - keep existing function
     * @param {Object} sharedSecurity - Shared security config
     * @param {Object} adminSecurity - Admin security config
     * @returns {Object} Merged security configuration
     */
    mergeSecurityConfig(sharedSecurity = {}, adminSecurity = {}) {
        return {
            ...sharedSecurity,
            ...adminSecurity,
            // Ensure critical security features are enabled for admin
            helmet: {
                ...sharedSecurity.helmet,
                ...adminSecurity.helmet,
                enabled: true
            },
            cors: {
                ...sharedSecurity.cors,
                ...adminSecurity.cors,
                enabled: true,
                credentials: true
            },
            csrf: {
                ...sharedSecurity.csrf,
                ...adminSecurity.csrf,
                enabled: !this.isTest
            },
            rateLimit: {
                ...sharedSecurity.rateLimit,
                ...adminSecurity.rateLimit,
                enabled: !this.isTest
            },
            ssl: {
                ...sharedSecurity.ssl,
                enabled: process.env.SSL_ENABLED === 'true'
            }
        };
    }

    /**
     * Validate critical configuration values - keep existing function
     * @throws {Error} If configuration is invalid
     */
    validateConfiguration() {
        const errors = [];

        // Validate admin port
        if (!this.config.app.port || this.config.app.port < 1 || this.config.app.port > 65535) {
            errors.push('Invalid admin port configuration');
        }

        // Validate security settings in production
        if (this.isProduction) {
            if (!this.config.security.ssl.enabled && !this.config.admin.security.forceSSL) {
                console.warn('Warning: SSL should be enabled for admin server in production');
            }

            if (!this.config.admin.security.ipWhitelist?.enabled) {
                console.warn('Warning: IP whitelist should be enabled for admin server in production');
            }

            if (!this.config.security.session.secret || this.config.security.session.secret.length < 32) {
                errors.push('Session secret must be at least 32 characters in production');
            }
        }

        // Validate database configuration
        if (!this.config.database?.uri) {
            console.warn('Warning: Database URI not configured, using default');
        }

        // Validate critical paths
        const requiredPaths = ['adminRoot', 'adminLogs'];
        requiredPaths.forEach(pathKey => {
            if (!this.config.paths[pathKey]) {
                console.warn(`Warning: Required path '${pathKey}' is not configured`);
            }
        });

        if (errors.length > 0) {
            throw new Error(`Admin configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Deep freeze configuration object to prevent modifications - keep existing function
     * @param {Object} obj - Object to freeze
     * @returns {Object} Frozen object
     */
    deepFreeze(obj) {
        Object.freeze(obj);

        Object.getOwnPropertyNames(obj).forEach(prop => {
            if (obj[prop] !== null
                && (typeof obj[prop] === 'object' || typeof obj[prop] === 'function')
                && !Object.isFrozen(obj[prop])) {
                this.deepFreeze(obj[prop]);
            }
        });

        return obj;
    }

    /**
     * Get configuration value by path - keep existing function
     * @param {string} path - Dot-separated path
     * @param {*} defaultValue - Default value if path not found
     * @returns {*} Configuration value
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let result = this.config;

        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return defaultValue;
            }
        }

        return result;
    }

    /**
     * Check if configuration has a specific path - keep existing function
     * @param {string} path - Dot-separated path
     * @returns {boolean} True if path exists
     */
    has(path) {
        const keys = path.split('.');
        let result = this.config;

        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return false;
            }
        }

        return true;
    }

    /**
     * Get all configuration - keep existing function
     * @returns {Object} Complete configuration
     */
    getAll() {
        return this.config;
    }

    /**
     * Get environment - keep existing function
     * @returns {string} Current environment
     */
    getEnvironment() {
        return this.environment;
    }

    /**
     * Check if feature is enabled - keep existing function
     * @param {string} feature - Feature name
     * @returns {boolean} True if feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.config.features[feature] === true;
    }

    /**
     * Get security setting - keep existing function
     * @param {string} setting - Security setting path
     * @returns {*} Security setting value
     */
    getSecuritySetting(setting) {
        return this.get(`security.${setting}`);
    }
}

// Create singleton instance
const adminConfiguration = new AdminConfiguration();

// Export configuration - keep existing export structure
module.exports = adminConfiguration.getAll();

// Also export the configuration instance for advanced usage
module.exports.configInstance = adminConfiguration;

// Export utility methods - keep existing exports
module.exports.get = adminConfiguration.get.bind(adminConfiguration);
module.exports.has = adminConfiguration.has.bind(adminConfiguration);
module.exports.isFeatureEnabled = adminConfiguration.isFeatureEnabled.bind(adminConfiguration);
module.exports.getSecuritySetting = adminConfiguration.getSecuritySetting.bind(adminConfiguration);
module.exports.environment = adminConfiguration.getEnvironment();