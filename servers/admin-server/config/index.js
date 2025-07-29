/**
 * @file Admin Configuration Index
 * @description Central configuration aggregator for admin server
 * @version 3.0.0
 */

'use strict';

const path = require('path');

// Import shared configuration as base
const sharedConfig = require('../../../shared/config');

// Import admin-specific configurations
const adminConfig = require('./admin-config');
const sessionConfig = require('./session-config');
const featuresConfig = require('./features-config');
const securityConfig = require('./security-config');
const monitoringConfig = require('./monitoring-config');

/**
 * Admin server configuration class
 * Extends shared configuration with admin-specific settings
 */
class AdminConfiguration {
    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.isDevelopment = this.environment === 'development';
        this.isProduction = this.environment === 'production';
        this.isStaging = this.environment === 'staging';
        this.isTest = this.environment === 'test';
        
        // Initialize configuration
        this.config = this.buildConfiguration();
        
        // Validate critical configurations
        this.validateConfiguration();
        
        // Freeze configuration in production
        if (this.isProduction) {
            this.deepFreeze(this.config);
        }
    }

    /**
     * Build complete configuration object
     * @returns {Object} Complete admin configuration
     */
    buildConfiguration() {
        // Start with shared configuration as base
        const baseConfig = {
            ...sharedConfig,
            
            // Override app settings for admin
            app: {
                ...sharedConfig.app,
                name: process.env.APP_NAME || 'InsightSerenity Admin Server',
                type: 'admin',
                port: parseInt(process.env.ADMIN_PORT, 10) || 5001,
                host: process.env.ADMIN_HOST || '127.0.0.1',
                url: this.buildAdminUrl(),
                basePath: process.env.ADMIN_BASE_PATH || '/admin',
                apiPrefix: process.env.ADMIN_API_PREFIX || '/admin/api',
                uploadLimit: process.env.ADMIN_UPLOAD_LIMIT || '50mb',
                behindProxy: process.env.ADMIN_BEHIND_PROXY === 'true',
                trustProxyLevel: parseInt(process.env.ADMIN_TRUST_PROXY_LEVEL, 10) || 1
            }
        };

        // Merge admin-specific configurations
        return {
            ...baseConfig,
            admin: adminConfig,
            session: this.mergeSessionConfig(baseConfig.security?.session, sessionConfig),
            features: featuresConfig,
            security: this.mergeSecurityConfig(baseConfig.security, securityConfig),
            monitoring: monitoringConfig,
            
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
     * Build admin URL based on environment
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
     * Merge session configuration with shared config
     * @param {Object} sharedSession - Shared session config
     * @param {Object} adminSession - Admin session config
     * @returns {Object} Merged session configuration
     */
    mergeSessionConfig(sharedSession = {}, adminSession = {}) {
        return {
            ...sharedSession,
            ...adminSession,
            cookie: {
                ...sharedSession.cookie,
                ...adminSession.cookie,
                // Admin sessions should always be secure
                secure: this.isProduction || process.env.ADMIN_FORCE_SSL === 'true',
                httpOnly: true,
                sameSite: 'strict'
            }
        };
    }

    /**
     * Merge security configuration with enhanced admin settings
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
            }
        };
    }

    /**
     * Validate critical configuration values
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
                errors.push('SSL must be enabled for admin server in production');
            }
            
            if (!this.config.admin.security.ipWhitelist?.enabled) {
                errors.push('IP whitelist should be enabled for admin server in production');
            }
            
            if (!this.config.admin.security.requireMFA) {
                errors.push('MFA should be required for admin access in production');
            }
            
            if (!this.config.security.session.secret || this.config.security.session.secret.length < 32) {
                errors.push('Session secret must be at least 32 characters in production');
            }
        }

        // Validate database configuration
        if (!this.config.database?.uri) {
            errors.push('Database URI is required');
        }

        // Validate Redis configuration for sessions
        if (this.config.session.enabled && !this.config.redis?.host) {
            errors.push('Redis configuration is required for session management');
        }

        // Validate critical paths
        const requiredPaths = ['adminRoot', 'adminLogs', 'auditLogs'];
        requiredPaths.forEach(pathKey => {
            if (!this.config.paths[pathKey]) {
                errors.push(`Required path '${pathKey}' is not configured`);
            }
        });

        if (errors.length > 0) {
            throw new Error(`Admin configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Deep freeze configuration object to prevent modifications
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
     * Get configuration value by path
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
     * Check if configuration has a specific path
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
     * Get all configuration
     * @returns {Object} Complete configuration
     */
    getAll() {
        return this.config;
    }

    /**
     * Get environment
     * @returns {string} Current environment
     */
    getEnvironment() {
        return this.environment;
    }

    /**
     * Check if feature is enabled
     * @param {string} feature - Feature name
     * @returns {boolean} True if feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.config.features[feature] === true;
    }

    /**
     * Get security setting
     * @param {string} setting - Security setting path
     * @returns {*} Security setting value
     */
    getSecuritySetting(setting) {
        return this.get(`security.${setting}`);
    }
}

// Create singleton instance
const adminConfiguration = new AdminConfiguration();

// Export configuration
module.exports = adminConfiguration.getAll();

// Also export the configuration instance for advanced usage
module.exports.configInstance = adminConfiguration;

// Export utility methods
module.exports.get = adminConfiguration.get.bind(adminConfiguration);
module.exports.has = adminConfiguration.has.bind(adminConfiguration);
module.exports.isFeatureEnabled = adminConfiguration.isFeatureEnabled.bind(adminConfiguration);
module.exports.getSecuritySetting = adminConfiguration.getSecuritySetting.bind(adminConfiguration);
module.exports.environment = adminConfiguration.getEnvironment();