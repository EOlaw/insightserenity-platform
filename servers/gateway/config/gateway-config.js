'use strict';

/**
 * @fileoverview Gateway-Specific Configuration - Core gateway settings and transformations
 * @module servers/gateway/config/gateway-config
 */

/**
 * Gateway configuration module provides gateway-specific settings,
 * service definitions, and configuration transformations.
 */
const gatewayConfig = {
    /**
     * Default gateway settings
     */
    defaults: {
        // API versioning configuration
        versioning: {
            enabled: true,
            type: 'header', // 'header', 'path', 'query'
            header: 'X-API-Version',
            defaultVersion: 'v1',
            supportedVersions: ['v1', 'v2']
        },

        // Request/Response transformation
        transformation: {
            requestHeaders: {
                add: {
                    'X-Gateway-Version': '1.0.0',
                    'X-Gateway-Timestamp': () => new Date().toISOString()
                },
                remove: ['X-Internal-Debug', 'X-Test-Mode'],
                modify: {
                    'User-Agent': (value) => `${value} (Gateway/1.0)`
                }
            },
            responseHeaders: {
                add: {
                    'X-Powered-By': 'InsightSerenity Gateway',
                    'X-Response-Time': (req, res) => `${Date.now() - req.startTime}ms`
                },
                remove: ['Server', 'X-AspNet-Version'],
                security: {
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY',
                    'X-XSS-Protection': '1; mode=block',
                    'Referrer-Policy': 'strict-origin-when-cross-origin'
                }
            }
        },

        // Load balancing configuration
        loadBalancing: {
            algorithm: 'round-robin', // 'round-robin', 'least-connections', 'ip-hash', 'weighted'
            healthCheck: {
                enabled: true,
                path: '/health',
                interval: 10000,
                timeout: 5000,
                unhealthyThreshold: 3,
                healthyThreshold: 2
            },
            stickySession: {
                enabled: false,
                cookieName: 'gateway-session',
                ttl: 3600000
            }
        },

        // WebSocket configuration
        websocket: {
            enabled: true,
            path: '/ws',
            pingInterval: 30000,
            pongTimeout: 10000,
            maxPayload: 1048576, // 1MB
            perMessageDeflate: {
                zlibDeflateOptions: {
                    chunkSize: 1024,
                    memLevel: 7,
                    level: 3
                },
                zlibInflateOptions: {
                    chunkSize: 10 * 1024
                },
                threshold: 1024
            }
        },

        // Request validation
        validation: {
            enabled: true,
            strictMode: false,
            schemas: {
                maxDepth: 10,
                maxProperties: 100,
                maxItems: 1000
            },
            sanitization: {
                enabled: true,
                removeEmpty: false,
                trimStrings: true,
                convertTypes: true
            }
        },

        // Error handling configuration
        errorHandling: {
            exposeStack: false,
            includeRequestId: true,
            customMessages: {
                400: 'Invalid request',
                401: 'Authentication required',
                403: 'Access denied',
                404: 'Resource not found',
                429: 'Too many requests',
                500: 'Internal server error',
                502: 'Service temporarily unavailable',
                503: 'Service unavailable',
                504: 'Gateway timeout'
            },
            retryableErrors: [502, 503, 504],
            retryConfig: {
                retries: 3,
                factor: 2,
                minTimeout: 1000,
                maxTimeout: 60000,
                randomize: true
            }
        },

        // Logging configuration
        requestLogging: {
            enabled: true,
            excludePaths: ['/health', '/metrics', '/favicon.ico'],
            excludeHeaders: ['authorization', 'cookie', 'x-api-key'],
            excludeBody: ['password', 'secret', 'token', 'creditCard'],
            maxBodyLength: 10000,
            slowRequestThreshold: 5000
        },

        // Service mesh integration
        serviceMesh: {
            enabled: false,
            type: 'istio', // 'istio', 'linkerd', 'consul'
            sidecarPort: 15001,
            ingressPort: 15006,
            adminPort: 15000,
            tracing: {
                enabled: true,
                samplingRate: 0.1
            }
        }
    },

    /**
     * Service-specific configurations
     */
    services: {
        'admin-server': {
            displayName: 'Admin Server',
            description: 'Platform administration and management services',
            endpoints: [
                {
                    path: '/users',
                    method: 'GET',
                    summary: 'List all users',
                    description: 'Retrieve a paginated list of platform users',
                    rateLimit: { windowMs: 60000, max: 100 },
                    cache: { ttl: 300 }
                },
                {
                    path: '/organizations',
                    method: 'GET',
                    summary: 'List organizations',
                    description: 'Retrieve all organizations',
                    rateLimit: { windowMs: 60000, max: 100 },
                    cache: { ttl: 600 }
                },
                {
                    path: '/system/config',
                    method: 'GET',
                    summary: 'Get system configuration',
                    description: 'Retrieve system configuration',
                    rateLimit: { windowMs: 60000, max: 50 },
                    cache: { ttl: 1800 }
                }
            ],
            middleware: ['auth', 'admin-only', 'audit-log'],
            timeout: 30000,
            retries: 2,
            circuitBreaker: {
                timeout: 10000,
                errorThreshold: 50,
                resetTimeout: 30000
            }
        },
        'customer-services': {
            displayName: 'Customer Services',
            description: 'Customer-facing business services',
            endpoints: [
                {
                    path: '/clients',
                    method: 'GET',
                    summary: 'List clients',
                    description: 'Retrieve client list for the tenant',
                    rateLimit: { windowMs: 60000, max: 200 },
                    cache: { ttl: 300, vary: ['X-Tenant-ID'] }
                },
                {
                    path: '/projects',
                    method: 'GET',
                    summary: 'List projects',
                    description: 'Retrieve project list',
                    rateLimit: { windowMs: 60000, max: 200 },
                    cache: { ttl: 300, vary: ['X-Tenant-ID'] }
                },
                {
                    path: '/consultants',
                    method: 'GET',
                    summary: 'List consultants',
                    description: 'Retrieve consultant list',
                    rateLimit: { windowMs: 60000, max: 200 },
                    cache: { ttl: 600, vary: ['X-Tenant-ID'] }
                }
            ],
            middleware: ['auth', 'tenant-context', 'subscription-check'],
            timeout: 30000,
            retries: 3,
            supportsWebSocket: true,
            webSocketPaths: ['/realtime', '/notifications'],
            circuitBreaker: {
                timeout: 10000,
                errorThreshold: 50,
                resetTimeout: 30000
            }
        }
    },

    /**
     * Apply gateway-specific transformations to configuration
     * @param {Object} config - Configuration object to transform
     */
    applyTransformations(config) {
        // Merge default gateway settings
        config.gateway = {
            ...this.defaults,
            ...(config.gateway || {})
        };

        // Enhance service configurations
        if (config.services && config.services.registry) {
            config.services.registry = config.services.registry.map(service => {
                const serviceDefaults = this.services[service.name];
                if (serviceDefaults) {
                    return {
                        ...serviceDefaults,
                        ...service,
                        endpoints: serviceDefaults.endpoints || service.endpoints,
                        middleware: serviceDefaults.middleware || service.middleware
                    };
                }
                return service;
            });
        }

        // Add computed values
        this.addComputedValues(config);

        // Validate gateway configuration
        this.validateGatewayConfig(config);
    },

    /**
     * Add computed configuration values
     * @param {Object} config - Configuration object
     */
    addComputedValues(config) {
        // Calculate optimal worker count
        const os = require('os');
        config.gateway.workers = config.gateway.workers || {
            count: process.env.GATEWAY_WORKERS || os.cpus().length,
            maxMemory: process.env.WORKER_MAX_MEMORY || '1G',
            restartOnError: true,
            gracefulShutdownTimeout: 30000
        };

        // Set environment-specific values
        if (config.environment === 'production') {
            config.gateway.errorHandling.exposeStack = false;
            config.gateway.requestLogging.excludeBody = [...config.gateway.requestLogging.excludeBody, 'data'];
            config.gateway.validation.strictMode = true;
        } else if (config.environment === 'development') {
            config.gateway.errorHandling.exposeStack = true;
            config.gateway.requestLogging.maxBodyLength = 50000;
        }

        // Configure service discovery based on environment
        if (config.services.discovery.type === 'kubernetes' && process.env.KUBERNETES_SERVICE_HOST) {
            config.services.discovery.kubernetes = {
                namespace: process.env.KUBERNETES_NAMESPACE || 'default',
                labelSelector: 'app=insightserenity',
                port: 8080
            };
        }

        // Add default retry configuration for all services
        config.services.registry.forEach(service => {
            if (!service.retry) {
                service.retry = config.gateway.errorHandling.retryConfig;
            }
        });
    },

    /**
     * Validate gateway-specific configuration
     * @param {Object} config - Configuration to validate
     * @throws {Error} If configuration is invalid
     */
    validateGatewayConfig(config) {
        // Validate load balancing algorithm
        const validAlgorithms = ['round-robin', 'least-connections', 'ip-hash', 'weighted'];
        if (!validAlgorithms.includes(config.gateway.loadBalancing.algorithm)) {
            throw new Error(`Invalid load balancing algorithm: ${config.gateway.loadBalancing.algorithm}`);
        }

        // Validate API versioning
        if (config.gateway.versioning.enabled) {
            const validTypes = ['header', 'path', 'query'];
            if (!validTypes.includes(config.gateway.versioning.type)) {
                throw new Error(`Invalid versioning type: ${config.gateway.versioning.type}`);
            }
        }

        // Validate WebSocket configuration
        if (config.gateway.websocket.enabled) {
            if (config.gateway.websocket.maxPayload > 104857600) { // 100MB
                throw new Error('WebSocket max payload exceeds 100MB limit');
            }
        }

        // Validate service configurations
        config.services.registry.forEach(service => {
            if (service.timeout < 1000) {
                throw new Error(`Service ${service.name} timeout is too low: ${service.timeout}ms`);
            }
            if (service.retries > 10) {
                throw new Error(`Service ${service.name} retry count is too high: ${service.retries}`);
            }
        });
    },

    /**
     * Get service-specific configuration
     * @param {string} serviceName - Name of the service
     * @returns {Object} Service configuration
     */
    getServiceConfig(serviceName) {
        return this.services[serviceName] || {};
    },

    /**
     * Get default headers for transformation
     * @returns {Object} Default headers configuration
     */
    getDefaultHeaders() {
        return {
            request: this.defaults.transformation.requestHeaders,
            response: this.defaults.transformation.responseHeaders
        };
    },

    /**
     * Get retry configuration for a specific error code
     * @param {number} statusCode - HTTP status code
     * @returns {Object|null} Retry configuration or null if not retryable
     */
    getRetryConfig(statusCode) {
        if (this.defaults.errorHandling.retryableErrors.includes(statusCode)) {
            return this.defaults.errorHandling.retryConfig;
        }
        return null;
    }
};

module.exports = gatewayConfig;