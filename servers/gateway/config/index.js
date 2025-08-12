'use strict';

/**
 * @fileoverview Configuration Manager - Centralized configuration management for the API Gateway
 * @module servers/gateway/config
 * @requires path
 * @requires fs
 * @requires module:servers/gateway/config/gateway-config
 * @requires module:servers/gateway/config/routing-config
 * @requires module:servers/gateway/config/security-config
 */

const path = require('path');
const fs = require('fs').promises;
const gatewayConfig = require('./gateway-config');
const routingConfig = require('./routing-config');
const securityConfig = require('./security-config');

/**
 * ConfigManager class provides centralized configuration management for the gateway.
 * It loads, validates, and merges configuration from multiple sources including
 * environment variables, configuration files, and default settings.
 * 
 * @class ConfigManager
 */
class ConfigManager {
    /**
     * Creates an instance of ConfigManager
     * @constructor
     */
    constructor() {
        this.config = {};
        this.environment = process.env.NODE_ENV || 'development';
        this.configPath = process.env.GATEWAY_CONFIG_PATH || path.join(__dirname, 'environments');
        this.isLoaded = false;
        this.watchers = new Map();
        this.configChangeHandlers = new Set();
    }

    /**
     * Loads configuration from all sources
     * @async
     * @returns {Promise<void>}
     */
    async load() {
        if (this.isLoaded) {
            return;
        }

        try {
            // Load base configuration
            const baseConfig = this.loadBaseConfiguration();

            // Load environment-specific configuration
            const envConfig = await this.loadEnvironmentConfiguration();

            // Load dynamic configuration from files
            const fileConfig = await this.loadFileConfiguration();

            // Merge configurations with precedence: env vars > file > environment > base
            this.config = this.mergeConfigurations(
                baseConfig,
                envConfig,
                fileConfig,
                this.loadEnvironmentVariables()
            );

            // Apply configuration transformations
            this.applyTransformations();

            // Setup configuration watching in development
            if (this.environment === 'development') {
                await this.setupConfigurationWatching();
            }

            this.isLoaded = true;
            console.log(`Configuration loaded for environment: ${this.environment}`);
        } catch (error) {
            console.error('Failed to load configuration:', error);
            throw new Error(`Configuration loading failed: ${error.message}`);
        }
    }

    /**
     * Loads base configuration
     * @private
     * @returns {Object} Base configuration
     */
    loadBaseConfiguration() {
        return {
            environment: this.environment,
            
            // Server configuration
            server: {
                port: 3000,
                host: '0.0.0.0',
                backlog: 511,
                trustProxy: true,
                bodyLimit: '10mb',
                compressionLevel: 6,
                shutdownTimeout: 30000,
                timeouts: {
                    request: 120000,
                    keepAlive: 65000,
                    headers: 66000
                },
                publicUrl: 'http://localhost:3000'
            },

            // Logging configuration
            logging: {
                level: 'info',
                format: 'json',
                prettyPrint: false,
                service: 'api-gateway',
                outputs: ['console']
            },

            // Distributed tracing configuration
            tracing: {
                enabled: true,
                serviceName: 'api-gateway',
                endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
                samplingRate: 1.0,
                propagators: ['w3c', 'jaeger']
            },

            // Cache configuration
            cache: {
                enabled: true,
                type: 'redis',
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
                    password: process.env.REDIS_PASSWORD,
                    db: parseInt(process.env.REDIS_DB, 10) || 0,
                    keyPrefix: 'gateway:',
                    ttl: 3600,
                    maxRetriesPerRequest: 3
                },
                memory: {
                    max: 100,
                    ttl: 300
                }
            },

            // Service discovery configuration
            services: {
                discovery: {
                    type: 'static', // 'static', 'consul', 'kubernetes'
                    refreshInterval: 30000,
                    healthCheckInterval: 10000
                },
                registry: [
                    {
                        name: 'admin-server',
                        url: process.env.ADMIN_SERVER_URL || 'https://localhost:4001',
                        path: '/api/admin',
                        requiresAuth: true,
                        timeout: 30000,
                        retries: 3,
                        rateLimit: {
                            windowMs: 60000,
                            max: 100
                        },
                        circuitBreaker: {
                            timeout: 10000,
                            errorThreshold: 50,
                            resetTimeout: 30000
                        }
                    },
                    {
                        name: 'customer-services',
                        url: process.env.CUSTOMER_SERVICES_URL || 'http://localhost:4002',
                        path: '/api/services',
                        requiresAuth: true,
                        timeout: 30000,
                        retries: 3,
                        supportsWebSocket: true,
                        rateLimit: {
                            windowMs: 60000,
                            max: 200
                        },
                        circuitBreaker: {
                            timeout: 10000,
                            errorThreshold: 50,
                            resetTimeout: 30000
                        }
                    }
                ]
            },

            // Authentication configuration
            auth: {
                enabled: true,
                jwt: {
                    secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
                    algorithms: ['HS256', 'RS256'],
                    issuer: 'insightserenity',
                    audience: 'api-gateway',
                    expiresIn: '24h'
                },
                apiKey: {
                    enabled: true,
                    header: 'X-API-Key',
                    query: 'api_key'
                },
                oauth: {
                    enabled: false,
                    providers: []
                },
                publicPaths: [
                    '/health',
                    '/health/*',
                    '/api-docs',
                    '/api-docs/*',
                    '/openapi.json',
                    '/auth/login',
                    '/auth/register',
                    '/auth/forgot-password'
                ]
            },

            // Rate limiting configuration
            rateLimiting: {
                enabled: true,
                global: {
                    windowMs: 60000,
                    max: 1000,
                    message: 'Too many requests from this IP',
                    standardHeaders: true,
                    legacyHeaders: false
                },
                paths: {
                    '/api/auth/login': {
                        windowMs: 900000,
                        max: 5
                    },
                    '/api/auth/register': {
                        windowMs: 3600000,
                        max: 3
                    }
                }
            },

            // Circuit breaker configuration
            circuitBreaker: {
                enabled: true,
                timeout: 10000,
                errorThreshold: 50,
                resetTimeout: 30000,
                rollingWindow: 10000,
                volumeThreshold: 10
            },

            // Health check configuration
            healthCheck: {
                enabled: true,
                interval: 30000,
                timeout: 5000,
                startupDelay: 5000,
                endpoints: {
                    liveness: '/health/live',
                    readiness: '/health/ready',
                    startup: '/health/startup'
                }
            },

            // Metrics configuration
            metrics: {
                enabled: true,
                endpoint: '/metrics',
                defaultLabels: {
                    service: 'api-gateway',
                    environment: this.environment
                },
                buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10, 30, 60]
            },

            // Request aggregation configuration
            aggregation: {
                enabled: true,
                maxParallel: 5,
                timeout: 30000
            },

            // Security policies configuration
            policies: {
                security: securityConfig.policies,
                routing: routingConfig.policies,
                cache: {
                    enabled: true,
                    rules: [
                        {
                            path: '/api/*/static/*',
                            ttl: 86400,
                            vary: ['Accept-Encoding']
                        },
                        {
                            path: '/api/*/config',
                            ttl: 300,
                            vary: ['X-Tenant-ID']
                        }
                    ],
                    blacklist: [
                        '/api/*/admin/*',
                        '/api/*/auth/*',
                        '/api/*/user/profile'
                    ]
                }
            },

            // Monitoring configuration
            monitoring: {
                slowRequestThreshold: 5000,
                errorRateThreshold: 0.05,
                alerting: {
                    enabled: false,
                    webhooks: []
                }
            }
        };
    }

    /**
     * Loads environment-specific configuration
     * @private
     * @async
     * @returns {Promise<Object>} Environment configuration
     */
    async loadEnvironmentConfiguration() {
        const envConfigPath = path.join(this.configPath, `${this.environment}.json`);
        
        try {
            const configData = await fs.readFile(envConfigPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`No environment configuration found at: ${envConfigPath}`);
                return {};
            }
            throw error;
        }
    }

    /**
     * Loads configuration from external files
     * @private
     * @async
     * @returns {Promise<Object>} File configuration
     */
    async loadFileConfiguration() {
        const customConfigPath = process.env.GATEWAY_CONFIG_FILE;
        
        if (!customConfigPath) {
            return {};
        }

        try {
            const configData = await fs.readFile(customConfigPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.error(`Failed to load custom configuration from: ${customConfigPath}`, error);
            return {};
        }
    }

    /**
     * Loads configuration from environment variables
     * @private
     * @returns {Object} Environment variable configuration
     */
    loadEnvironmentVariables() {
        const envConfig = {};

        // Server configuration
        if (process.env.GATEWAY_PORT) {
            envConfig.server = envConfig.server || {};
            envConfig.server.port = parseInt(process.env.GATEWAY_PORT, 10);
        }
        if (process.env.GATEWAY_HOST) {
            envConfig.server = envConfig.server || {};
            envConfig.server.host = process.env.GATEWAY_HOST;
        }

        // Logging configuration
        if (process.env.LOG_LEVEL) {
            envConfig.logging = envConfig.logging || {};
            envConfig.logging.level = process.env.LOG_LEVEL;
        }

        // Authentication configuration
        if (process.env.JWT_SECRET) {
            envConfig.auth = envConfig.auth || {};
            envConfig.auth.jwt = envConfig.auth.jwt || {};
            envConfig.auth.jwt.secret = process.env.JWT_SECRET;
        }

        // Cache configuration
        if (process.env.CACHE_ENABLED) {
            envConfig.cache = envConfig.cache || {};
            envConfig.cache.enabled = process.env.CACHE_ENABLED === 'true';
        }

        // Service URLs
        if (process.env.ADMIN_SERVER_URL || process.env.CUSTOMER_SERVICES_URL) {
            envConfig.services = envConfig.services || {};
            envConfig.services.registry = [];
            
            if (process.env.ADMIN_SERVER_URL) {
                envConfig.services.registry.push({
                    name: 'admin-server',
                    url: process.env.ADMIN_SERVER_URL,
                    path: process.env.ADMIN_SERVER_PATH || '/api/admin'
                });
            }
            
            if (process.env.CUSTOMER_SERVICES_URL) {
                envConfig.services.registry.push({
                    name: 'customer-services',
                    url: process.env.CUSTOMER_SERVICES_URL,
                    path: process.env.CUSTOMER_SERVICES_PATH || '/api/services'
                });
            }
        }

        return envConfig;
    }

    /**
     * Merges multiple configuration objects with proper precedence
     * @private
     * @param {...Object} configs - Configuration objects to merge
     * @returns {Object} Merged configuration
     */
    mergeConfigurations(...configs) {
        const merge = (target, source) => {
            for (const key in source) {
                if (source[key] === null || source[key] === undefined) {
                    continue;
                }

                if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    target[key] = target[key] || {};
                    if (typeof target[key] === 'object' && !Array.isArray(target[key])) {
                        merge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                } else {
                    target[key] = source[key];
                }
            }
            return target;
        };

        return configs.reduce((merged, config) => merge(merged, config), {});
    }

    /**
     * Applies configuration transformations and computed values
     * @private
     */
    applyTransformations() {
        // Add computed gateway configuration
        gatewayConfig.applyTransformations(this.config);

        // Add computed routing configuration
        routingConfig.applyTransformations(this.config);

        // Add computed security configuration
        securityConfig.applyTransformations(this.config);

        // Set production defaults
        if (this.environment === 'production') {
            this.config.logging.level = this.config.logging.level || 'warn';
            this.config.logging.prettyPrint = false;
            this.config.server.trustProxy = true;
            this.config.tracing.samplingRate = Math.min(this.config.tracing.samplingRate, 0.1);
        }

        // Set development defaults
        if (this.environment === 'development') {
            this.config.logging.prettyPrint = true;
            this.config.monitoring.slowRequestThreshold = 10000;
        }
    }

    /**
     * Sets up configuration file watching for development
     * @private
     * @async
     */
    async setupConfigurationWatching() {
        const fs = require('fs');
        const watchPaths = [
            path.join(this.configPath, `${this.environment}.json`),
            process.env.GATEWAY_CONFIG_FILE
        ].filter(Boolean);

        for (const watchPath of watchPaths) {
            try {
                const watcher = fs.watch(watchPath, async (eventType) => {
                    if (eventType === 'change') {
                        console.log(`Configuration file changed: ${watchPath}`);
                        await this.reload();
                    }
                });
                this.watchers.set(watchPath, watcher);
            } catch (error) {
                console.warn(`Failed to watch configuration file: ${watchPath}`, error.message);
            }
        }
    }

    /**
     * Validates the loaded configuration
     * @async
     * @throws {Error} If configuration is invalid
     */
    async validateConfiguration() {
        const requiredFields = [
            'server.port',
            'auth.jwt.secret',
            'services.registry'
        ];

        for (const field of requiredFields) {
            const value = this.get(field);
            if (value === undefined || value === null) {
                throw new Error(`Required configuration field missing: ${field}`);
            }
        }

        // Validate JWT secret in production
        if (this.environment === 'production') {
            if (this.config.auth.jwt.secret === 'change-this-secret-in-production') {
                throw new Error('JWT secret must be changed for production environment');
            }
            if (this.config.auth.jwt.secret.length < 32) {
                throw new Error('JWT secret must be at least 32 characters in production');
            }
        }

        // Validate service registry
        if (!Array.isArray(this.config.services.registry) || this.config.services.registry.length === 0) {
            throw new Error('At least one service must be configured in the registry');
        }

        // Validate each service
        for (const service of this.config.services.registry) {
            if (!service.name || !service.url || !service.path) {
                throw new Error(`Invalid service configuration: ${JSON.stringify(service)}`);
            }
        }

        console.log('Configuration validation passed');
    }

    /**
     * Reloads configuration from all sources
     * @async
     */
    async reload() {
        try {
            this.isLoaded = false;
            const oldConfig = { ...this.config };
            await this.load();
            
            // Notify change handlers
            for (const handler of this.configChangeHandlers) {
                try {
                    await handler(this.config, oldConfig);
                } catch (error) {
                    console.error('Error in configuration change handler:', error);
                }
            }
            
            console.log('Configuration reloaded successfully');
        } catch (error) {
            console.error('Failed to reload configuration:', error);
            throw error;
        }
    }

    /**
     * Gets a configuration value by path
     * @param {string} path - Dot-separated path to configuration value
     * @param {*} defaultValue - Default value if path not found
     * @returns {*} Configuration value
     */
    get(path, defaultValue) {
        if (!path) {
            return this.config;
        }

        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value !== undefined ? value : defaultValue;
    }

    /**
     * Sets a configuration value by path
     * @param {string} path - Dot-separated path to configuration value
     * @param {*} value - Value to set
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = this.config;

        for (const key of keys) {
            if (!(key in target) || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }

        target[lastKey] = value;
    }

    /**
     * Checks if a configuration path exists
     * @param {string} path - Dot-separated path to check
     * @returns {boolean} True if path exists
     */
    has(path) {
        return this.get(path) !== undefined;
    }

    /**
     * Registers a configuration change handler
     * @param {Function} handler - Handler function to call on configuration changes
     */
    onConfigChange(handler) {
        this.configChangeHandlers.add(handler);
    }

    /**
     * Removes a configuration change handler
     * @param {Function} handler - Handler function to remove
     */
    offConfigChange(handler) {
        this.configChangeHandlers.delete(handler);
    }

    /**
     * Gets all configuration
     * @returns {Object} Complete configuration object
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Close file watchers
        for (const [path, watcher] of this.watchers.entries()) {
            watcher.close();
            console.log(`Stopped watching configuration file: ${path}`);
        }
        this.watchers.clear();
        this.configChangeHandlers.clear();
    }
}

// Export singleton instance
module.exports = { ConfigManager };