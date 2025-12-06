/**
 * @fileoverview InsightSerenity Platform Configuration Module
 * @module config
 * @description Central entry point for the platform configuration system.
 *              Exports the ConfigLoader class and pre-configured instances.
 * 
 * @example
 * // Import the default configuration instance
 * const { config } = require('./config');
 * const port = config.get('server.customerServices.port');
 * 
 * @example
 * // Create a custom configuration instance
 * const { createConfig } = require('./config');
 * const config = createConfig({
 *   environment: 'staging',
 *   serviceName: 'customer-services'
 * });
 * 
 * @version 1.0.0
 * @author InsightSerenity Team
 */

'use strict';

const path = require('path');
const { ConfigLoader, createConfig, getDatabaseConfig } = require('./ConfigLoader');

// Determine service name from environment or directory
const serviceName = process.env.SERVICE_NAME || 
                    process.env.npm_package_name?.replace('@insightserenity-platform/', '') ||
                    null;

// Create default configuration instance
let defaultConfig = null;

/**
 * Get the default configuration instance (lazy initialization)
 * @returns {ConfigLoader} Default configuration instance
 */
function getConfig() {
    if (!defaultConfig) {
        defaultConfig = createConfig({
            configDir: path.join(__dirname),
            environment: process.env.NODE_ENV || 'development',
            serviceName: serviceName,
            watchFiles: process.env.CONFIG_WATCH === 'true',
            validateOnLoad: process.env.CONFIG_VALIDATE !== 'false'
        });
    }
    return defaultConfig;
}

/**
 * Create configuration for a specific service
 * @param {string} service - Service name
 * @param {Object} options - Additional options
 * @returns {ConfigLoader} Service configuration instance
 */
function createServiceConfig(service, options = {}) {
    return createConfig({
        configDir: path.join(__dirname),
        environment: process.env.NODE_ENV || 'development',
        serviceName: service,
        ...options
    });
}

/**
 * Get database configuration for a specific database
 * @param {string} dbName - Database name (admin, customer, shared)
 * @returns {Object} Database configuration
 */
function getDbConfig(dbName) {
    return getDatabaseConfig(getConfig(), dbName);
}

// Export configuration utilities
module.exports = {
    // Classes
    ConfigLoader,
    
    // Factory functions
    createConfig,
    createServiceConfig,
    
    // Default instance accessor
    getConfig,
    config: getConfig(),
    
    // Helper functions
    getDatabaseConfig,
    getDbConfig,
    
    // Convenience methods (proxied from default instance)
    get: (path, defaultValue) => getConfig().get(path, defaultValue),
    has: (path) => getConfig().has(path),
    getSection: (section) => getConfig().getSection(section),
    getAll: () => getConfig().getAll(),
    isFeatureEnabled: (feature) => getConfig().isFeatureEnabled(feature),
    isProduction: () => getConfig().isProduction(),
    isDevelopment: () => getConfig().isDevelopment(),
    isStaging: () => getConfig().isStaging(),
    getEnvironment: () => getConfig().getEnvironment()
};