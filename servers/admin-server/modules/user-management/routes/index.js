'use strict';

/**
 * @fileoverview User Management Routes Index - Central export and configuration for all user management routes
 * @module servers/admin-server/modules/user-management/routes
 * @requires express
 * @requires module:servers/admin-server/modules/user-management/routes/admin-user-routes
 * @requires module:servers/admin-server/modules/user-management/routes/user-management-routes
 * @requires module:servers/admin-server/modules/user-management/routes/user-permissions-routes
 * @requires module:servers/admin-server/modules/user-management/routes/user-sessions-routes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/security/security-headers
 */

const express = require('express');
const adminUserRoutes = require('./admin-user-routes');
const userManagementRoutes = require('./user-management-routes');
const userPermissionsRoutes = require('./user-permissions-routes');
const userSessionsRoutes = require('./user-sessions-routes');
const logger = require('../../../../../shared/lib/utils/logger');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const errorHandler = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const requestLogger = require('../../../../../shared/lib/middleware/logging/request-logger');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');

/**
 * UserManagementRoutesManager class handles the configuration, initialization,
 * and management of all user management related routes. It provides a centralized
 * interface for registering routes with the Express application while maintaining
 * proper middleware ordering, error handling, and monitoring capabilities.
 * 
 * @class UserManagementRoutesManager
 */
class UserManagementRoutesManager {
    /**
     * Private fields for internal state management
     */
    #router;
    #config;
    #responseFormatter;
    #routeRegistry;
    #metricsCollector;
    #healthChecks;
    #routeDocumentation;
    #securityConfig;
    #middlewareStack;
    #initialized;

    /**
     * Constructor initializes the routes manager with default configurations
     * and prepares the internal state for route registration and management.
     */
    constructor() {
        this.#router = express.Router();
        this.#responseFormatter = new ResponseFormatter();
        this.#routeRegistry = new Map();
        this.#metricsCollector = new Map();
        this.#healthChecks = new Map();
        this.#routeDocumentation = [];
        this.#middlewareStack = [];
        this.#initialized = false;

        this.#initializeConfiguration();
        this.#initializeSecurityConfig();
        this.#setupBaseMiddleware();
        this.#registerRouteModules();
        this.#setupHealthChecks();
        this.#setupMetricsCollection();
        this.#generateRouteDocumentation();

        logger.info('UserManagementRoutesManager initialized successfully');
    }

    /**
     * Initialize default configuration for the routes manager.
     * This includes API versioning, route prefixes, feature flags,
     * and operational parameters.
     * 
     * @private
     */
    #initializeConfiguration() {
        this.#config = {
            apiVersion: process.env.API_VERSION || 'v1',
            basePrefix: process.env.USER_MANAGEMENT_BASE_PATH || '/api/v1/user-management',
            enableMetrics: process.env.ENABLE_ROUTE_METRICS !== 'false',
            enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
            enableDocumentation: process.env.ENABLE_ROUTE_DOCS !== 'false',
            enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false',
            enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
            enableCaching: process.env.ENABLE_ROUTE_CACHING !== 'false',
            requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
            maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
            corsEnabled: process.env.ENABLE_CORS !== 'false',
            compressionEnabled: process.env.ENABLE_COMPRESSION !== 'false',
            
            routePrefixes: {
                adminUsers: '/admin',
                users: '/users',
                permissions: '/permissions',
                sessions: '/sessions'
            },
            
            featureFlags: {
                enableAdminUserManagement: process.env.FEATURE_ADMIN_USERS !== 'false',
                enableUserManagement: process.env.FEATURE_USER_MANAGEMENT !== 'false',
                enablePermissionManagement: process.env.FEATURE_PERMISSIONS !== 'false',
                enableSessionManagement: process.env.FEATURE_SESSIONS !== 'false',
                enableBulkOperations: process.env.FEATURE_BULK_OPS !== 'false',
                enableImportExport: process.env.FEATURE_IMPORT_EXPORT !== 'false',
                enableImpersonation: process.env.FEATURE_IMPERSONATION !== 'false',
                enableAdvancedSecurity: process.env.FEATURE_ADVANCED_SECURITY !== 'false'
            },
            
            monitoring: {
                logLevel: process.env.ROUTE_LOG_LEVEL || 'info',
                metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000,
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
                slowRouteThreshold: parseInt(process.env.SLOW_ROUTE_THRESHOLD) || 1000,
                errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.05
            }
        };
    }

    /**
     * Initialize security configuration for route protection.
     * This includes authentication requirements, authorization levels,
     * and security headers configuration.
     * 
     * @private
     */
    #initializeSecurityConfig() {
        this.#securityConfig = {
            authentication: {
                required: true,
                excludePaths: [
                    '/sessions/validate',
                    '/sessions/refresh',
                    '/health',
                    '/metrics',
                    '/docs'
                ],
                tokenValidation: {
                    algorithm: 'HS256',
                    issuer: process.env.JWT_ISSUER || 'insightserenity',
                    audience: process.env.JWT_AUDIENCE || 'admin-api',
                    maxAge: process.env.JWT_MAX_AGE || '24h'
                }
            },
            
            authorization: {
                defaultRequiredRoles: ['AUTHENTICATED_USER'],
                roleHierarchy: {
                    'SUPER_ADMIN': 10,
                    'PLATFORM_ADMIN': 9,
                    'SECURITY_ADMIN': 8,
                    'USER_ADMIN': 7,
                    'ORGANIZATION_ADMIN': 6,
                    'DEPARTMENT_ADMIN': 5,
                    'SUPPORT_ADMIN': 4,
                    'BILLING_ADMIN': 4,
                    'COMPLIANCE_OFFICER': 4,
                    'READ_ONLY_ADMIN': 1
                },
                permissionCache: {
                    enabled: true,
                    ttl: 300,
                    maxSize: 1000
                }
            },
            
            headers: {
                hsts: {
                    maxAge: 31536000,
                    includeSubDomains: true,
                    preload: true
                },
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        scriptSrc: ["'self'", "'unsafe-inline'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        imgSrc: ["'self'", 'data:', 'https:'],
                        connectSrc: ["'self'"],
                        fontSrc: ["'self'"],
                        objectSrc: ["'none'"],
                        mediaSrc: ["'self'"],
                        frameSrc: ["'none'"]
                    }
                },
                referrerPolicy: 'strict-origin-when-cross-origin',
                xContentTypeOptions: 'nosniff',
                xFrameOptions: 'DENY',
                xXssProtection: '1; mode=block'
            },
            
            rateLimiting: {
                windowMs: 60000,
                max: 100,
                standardHeaders: true,
                legacyHeaders: false,
                skipSuccessfulRequests: false,
                keyGenerator: (req) => req.user?.id || req.ip
            },
            
            encryption: {
                algorithm: 'aes-256-gcm',
                keyRotationInterval: 86400000,
                sensitiveFields: [
                    'password',
                    'apiKey',
                    'apiSecret',
                    'twoFactorSecret',
                    'refreshToken',
                    'sessionToken'
                ]
            }
        };
    }

    /**
     * Setup base middleware that applies to all routes.
     * This includes logging, security headers, and error handling.
     * 
     * @private
     */
    #setupBaseMiddleware() {
        // Request logging middleware
        this.#router.use(requestLogger({
            module: 'UserManagementRoutes',
            logLevel: this.#config.monitoring.logLevel,
            includeHeaders: process.env.NODE_ENV === 'development',
            includeBody: process.env.NODE_ENV === 'development'
        }));

        // Security headers middleware
        this.#router.use(securityHeaders(this.#securityConfig.headers));

        // Request ID middleware for tracing
        this.#router.use((req, res, next) => {
            req.requestId = req.headers['x-request-id'] || this.#generateRequestId();
            res.setHeader('X-Request-ID', req.requestId);
            next();
        });

        // Metrics collection middleware
        if (this.#config.enableMetrics) {
            this.#router.use(this.#createMetricsMiddleware());
        }

        // Audit logging middleware
        if (this.#config.enableAuditLogging) {
            this.#router.use(this.#createAuditMiddleware());
        }

        logger.debug('Base middleware configured for user management routes');
    }

    /**
     * Register all route modules with their respective prefixes.
     * This method conditionally registers routes based on feature flags.
     * 
     * @private
     */
    #registerRouteModules() {
        const modules = [
            {
                name: 'adminUsers',
                routes: adminUserRoutes,
                prefix: this.#config.routePrefixes.adminUsers,
                enabled: this.#config.featureFlags.enableAdminUserManagement,
                description: 'Administrative user management endpoints'
            },
            {
                name: 'userManagement',
                routes: userManagementRoutes,
                prefix: this.#config.routePrefixes.users,
                enabled: this.#config.featureFlags.enableUserManagement,
                description: 'Platform user management endpoints'
            },
            {
                name: 'permissions',
                routes: userPermissionsRoutes,
                prefix: this.#config.routePrefixes.permissions,
                enabled: this.#config.featureFlags.enablePermissionManagement,
                description: 'Permission and role management endpoints'
            },
            {
                name: 'sessions',
                routes: userSessionsRoutes,
                prefix: this.#config.routePrefixes.sessions,
                enabled: this.#config.featureFlags.enableSessionManagement,
                description: 'Session management endpoints'
            }
        ];

        modules.forEach(module => {
            if (module.enabled) {
                this.#registerModule(module);
                logger.info(`Registered ${module.name} routes at prefix: ${module.prefix}`);
            } else {
                logger.warn(`${module.name} routes are disabled by feature flag`);
            }
        });
    }

    /**
     * Register an individual route module with the router.
     * 
     * @private
     * @param {Object} module - Module configuration object
     */
    #registerModule(module) {
        // Create module-specific router
        const moduleRouter = express.Router();

        // Apply module-specific middleware
        moduleRouter.use(this.#createModuleMiddleware(module.name));

        // Mount the module routes
        moduleRouter.use(module.routes);

        // Register with main router
        this.#router.use(module.prefix, moduleRouter);

        // Store in registry
        this.#routeRegistry.set(module.name, {
            prefix: module.prefix,
            router: moduleRouter,
            description: module.description,
            registeredAt: new Date(),
            requestCount: 0,
            errorCount: 0,
            averageResponseTime: 0
        });
    }

    /**
     * Create module-specific middleware for enhanced monitoring and control.
     * 
     * @private
     * @param {string} moduleName - Name of the module
     * @returns {Function} Express middleware function
     */
    #createModuleMiddleware(moduleName) {
        return (req, res, next) => {
            req.moduleContext = {
                module: moduleName,
                startTime: Date.now(),
                requestId: req.requestId
            };

            // Track module request
            const moduleData = this.#routeRegistry.get(moduleName);
            if (moduleData) {
                moduleData.requestCount++;
            }

            // Monitor response
            const originalSend = res.send;
            res.send = function(data) {
                const responseTime = Date.now() - req.moduleContext.startTime;
                
                // Update metrics
                if (moduleData) {
                    const currentAvg = moduleData.averageResponseTime;
                    const count = moduleData.requestCount;
                    moduleData.averageResponseTime = (currentAvg * (count - 1) + responseTime) / count;
                    
                    if (res.statusCode >= 400) {
                        moduleData.errorCount++;
                    }
                }

                // Log slow requests
                if (responseTime > this.#config.monitoring.slowRouteThreshold) {
                    logger.warn(`Slow request detected in ${moduleName}`, {
                        path: req.path,
                        method: req.method,
                        responseTime,
                        requestId: req.requestId
                    });
                }

                return originalSend.call(this, data);
            }.bind(this);

            next();
        };
    }

    /**
     * Setup health check endpoints for monitoring service health.
     * 
     * @private
     */
    #setupHealthChecks() {
        // Main health check endpoint
        this.#router.get('/health', (req, res) => {
            const health = this.#performHealthCheck();
            const statusCode = health.status === 'healthy' ? 200 : 503;
            
            res.status(statusCode).json(this.#responseFormatter.formatSuccess(
                health,
                `User management service is ${health.status}`
            ));
        });

        // Detailed health check endpoint
        this.#router.get('/health/detailed', (req, res) => {
            const detailedHealth = this.#performDetailedHealthCheck();
            const statusCode = detailedHealth.overallStatus === 'healthy' ? 200 : 503;
            
            res.status(statusCode).json(this.#responseFormatter.formatSuccess(
                detailedHealth,
                'Detailed health check completed'
            ));
        });

        // Liveness probe for Kubernetes
        this.#router.get('/health/live', (req, res) => {
            res.status(200).json({
                status: 'alive',
                timestamp: new Date().toISOString()
            });
        });

        // Readiness probe for Kubernetes
        this.#router.get('/health/ready', (req, res) => {
            const isReady = this.#checkReadiness();
            const statusCode = isReady ? 200 : 503;
            
            res.status(statusCode).json({
                ready: isReady,
                timestamp: new Date().toISOString()
            });
        });

        logger.debug('Health check endpoints configured');
    }

    /**
     * Perform basic health check of the service.
     * 
     * @private
     * @returns {Object} Health status object
     */
    #performHealthCheck() {
        const checks = {
            routesRegistered: this.#routeRegistry.size > 0,
            errorRateAcceptable: this.#checkErrorRate(),
            responseTimeAcceptable: this.#checkResponseTime()
        };

        const status = Object.values(checks).every(check => check) ? 'healthy' : 'unhealthy';

        return {
            status,
            timestamp: new Date().toISOString(),
            checks,
            uptime: process.uptime(),
            moduleCount: this.#routeRegistry.size
        };
    }

    /**
     * Perform detailed health check including all subsystems.
     * 
     * @private
     * @returns {Object} Detailed health status object
     */
    #performDetailedHealthCheck() {
        const moduleHealth = {};
        
        this.#routeRegistry.forEach((data, name) => {
            const errorRate = data.requestCount > 0 
                ? data.errorCount / data.requestCount 
                : 0;
            
            moduleHealth[name] = {
                status: errorRate < this.#config.monitoring.errorRateThreshold ? 'healthy' : 'degraded',
                metrics: {
                    requestCount: data.requestCount,
                    errorCount: data.errorCount,
                    errorRate: errorRate.toFixed(4),
                    averageResponseTime: Math.round(data.averageResponseTime)
                }
            };
        });

        const overallStatus = Object.values(moduleHealth)
            .every(module => module.status === 'healthy') ? 'healthy' : 'degraded';

        return {
            overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            modules: moduleHealth,
            configuration: {
                apiVersion: this.#config.apiVersion,
                basePrefix: this.#config.basePrefix,
                featuresEnabled: Object.entries(this.#config.featureFlags)
                    .filter(([, enabled]) => enabled)
                    .map(([feature]) => feature)
            },
            performance: {
                totalRequests: Array.from(this.#routeRegistry.values())
                    .reduce((sum, data) => sum + data.requestCount, 0),
                totalErrors: Array.from(this.#routeRegistry.values())
                    .reduce((sum, data) => sum + data.errorCount, 0),
                averageResponseTime: this.#calculateOverallAverageResponseTime()
            }
        };
    }

    /**
     * Check if the service is ready to handle requests.
     * 
     * @private
     * @returns {boolean} Readiness status
     */
    #checkReadiness() {
        return this.#initialized && this.#routeRegistry.size > 0;
    }

    /**
     * Check if error rate is within acceptable threshold.
     * 
     * @private
     * @returns {boolean} Error rate status
     */
    #checkErrorRate() {
        let totalRequests = 0;
        let totalErrors = 0;

        this.#routeRegistry.forEach(data => {
            totalRequests += data.requestCount;
            totalErrors += data.errorCount;
        });

        if (totalRequests === 0) return true;
        
        const errorRate = totalErrors / totalRequests;
        return errorRate < this.#config.monitoring.errorRateThreshold;
    }

    /**
     * Check if response time is within acceptable threshold.
     * 
     * @private
     * @returns {boolean} Response time status
     */
    #checkResponseTime() {
        const avgResponseTime = this.#calculateOverallAverageResponseTime();
        return avgResponseTime < this.#config.monitoring.slowRouteThreshold;
    }

    /**
     * Calculate overall average response time across all modules.
     * 
     * @private
     * @returns {number} Average response time in milliseconds
     */
    #calculateOverallAverageResponseTime() {
        let totalTime = 0;
        let totalRequests = 0;

        this.#routeRegistry.forEach(data => {
            if (data.requestCount > 0) {
                totalTime += data.averageResponseTime * data.requestCount;
                totalRequests += data.requestCount;
            }
        });

        return totalRequests > 0 ? Math.round(totalTime / totalRequests) : 0;
    }

    /**
     * Setup metrics collection for monitoring and observability.
     * 
     * @private
     */
    #setupMetricsCollection() {
        if (!this.#config.enableMetrics) return;

        // Metrics endpoint
        this.#router.get('/metrics', (req, res) => {
            const metrics = this.#collectMetrics();
            res.json(this.#responseFormatter.formatSuccess(
                metrics,
                'Metrics collected successfully'
            ));
        });

        // Prometheus-compatible metrics endpoint
        this.#router.get('/metrics/prometheus', (req, res) => {
            const prometheusMetrics = this.#formatMetricsForPrometheus();
            res.set('Content-Type', 'text/plain');
            res.send(prometheusMetrics);
        });

        logger.debug('Metrics collection endpoints configured');
    }

    /**
     * Collect current metrics from all modules.
     * 
     * @private
     * @returns {Object} Collected metrics
     */
    #collectMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            modules: {},
            totals: {
                requests: 0,
                errors: 0,
                averageResponseTime: 0
            }
        };

        this.#routeRegistry.forEach((data, name) => {
            metrics.modules[name] = {
                requestCount: data.requestCount,
                errorCount: data.errorCount,
                errorRate: data.requestCount > 0 
                    ? (data.errorCount / data.requestCount).toFixed(4) 
                    : '0.0000',
                averageResponseTime: Math.round(data.averageResponseTime),
                lastUpdated: data.registeredAt
            };

            metrics.totals.requests += data.requestCount;
            metrics.totals.errors += data.errorCount;
        });

        metrics.totals.averageResponseTime = this.#calculateOverallAverageResponseTime();
        metrics.totals.errorRate = metrics.totals.requests > 0
            ? (metrics.totals.errors / metrics.totals.requests).toFixed(4)
            : '0.0000';

        return metrics;
    }

    /**
     * Format metrics in Prometheus exposition format.
     * 
     * @private
     * @returns {string} Prometheus-formatted metrics
     */
    #formatMetricsForPrometheus() {
        const lines = [];
        const timestamp = Date.now();

        lines.push('# HELP user_management_requests_total Total number of requests');
        lines.push('# TYPE user_management_requests_total counter');

        this.#routeRegistry.forEach((data, name) => {
            lines.push(`user_management_requests_total{module="${name}"} ${data.requestCount}`);
        });

        lines.push('# HELP user_management_errors_total Total number of errors');
        lines.push('# TYPE user_management_errors_total counter');

        this.#routeRegistry.forEach((data, name) => {
            lines.push(`user_management_errors_total{module="${name}"} ${data.errorCount}`);
        });

        lines.push('# HELP user_management_response_time_ms Average response time in milliseconds');
        lines.push('# TYPE user_management_response_time_ms gauge');

        this.#routeRegistry.forEach((data, name) => {
            lines.push(`user_management_response_time_ms{module="${name}"} ${Math.round(data.averageResponseTime)}`);
        });

        return lines.join('\n');
    }

    /**
     * Create metrics collection middleware.
     * 
     * @private
     * @returns {Function} Express middleware function
     */
    #createMetricsMiddleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            const metricsKey = `${req.method}:${req.baseUrl}${req.path}`;

            res.on('finish', () => {
                const duration = Date.now() - startTime;
                const statusCode = res.statusCode;

                // Update metrics
                if (!this.#metricsCollector.has(metricsKey)) {
                    this.#metricsCollector.set(metricsKey, {
                        count: 0,
                        totalTime: 0,
                        errors: 0,
                        statusCodes: {}
                    });
                }

                const metrics = this.#metricsCollector.get(metricsKey);
                metrics.count++;
                metrics.totalTime += duration;
                
                if (statusCode >= 400) {
                    metrics.errors++;
                }

                metrics.statusCodes[statusCode] = (metrics.statusCodes[statusCode] || 0) + 1;
            });

            next();
        };
    }

    /**
     * Create audit logging middleware for compliance and security.
     * 
     * @private
     * @returns {Function} Express middleware function
     */
    #createAuditMiddleware() {
        return (req, res, next) => {
            const auditEntry = {
                timestamp: new Date().toISOString(),
                requestId: req.requestId,
                method: req.method,
                path: req.path,
                user: req.user?.id || 'anonymous',
                ip: req.ip,
                userAgent: req.headers['user-agent']
            };

            res.on('finish', () => {
                auditEntry.statusCode = res.statusCode;
                auditEntry.responseTime = Date.now() - Date.parse(auditEntry.timestamp);

                // Log audit entry
                logger.audit('API_REQUEST', auditEntry);

                // Store for compliance reporting if needed
                if (this.#shouldStoreAuditEntry(auditEntry)) {
                    this.#storeAuditEntry(auditEntry);
                }
            });

            next();
        };
    }

    /**
     * Determine if an audit entry should be stored for compliance.
     * 
     * @private
     * @param {Object} entry - Audit entry
     * @returns {boolean} Whether to store the entry
     */
    #shouldStoreAuditEntry(entry) {
        // Store entries for sensitive operations
        const sensitivePaths = [
            '/permissions',
            '/roles',
            '/admin',
            '/sessions/impersonate',
            '/users/bulk'
        ];

        return sensitivePaths.some(path => entry.path.includes(path)) ||
               entry.statusCode >= 400;
    }

    /**
     * Store audit entry for compliance reporting.
     * 
     * @private
     * @param {Object} entry - Audit entry to store
     */
    #storeAuditEntry(entry) {
        // Implementation would store to database or audit service
        logger.debug('Storing audit entry for compliance', { requestId: entry.requestId });
    }

    /**
     * Generate comprehensive route documentation.
     * 
     * @private
     */
    #generateRouteDocumentation() {
        if (!this.#config.enableDocumentation) return;

        this.#router.get('/docs', (req, res) => {
            const documentation = this.#buildDocumentation();
            res.json(this.#responseFormatter.formatSuccess(
                documentation,
                'Route documentation generated successfully'
            ));
        });

        this.#router.get('/docs/openapi', (req, res) => {
            const openApiSpec = this.#generateOpenApiSpec();
            res.json(openApiSpec);
        });

        logger.debug('Route documentation endpoints configured');
    }

    /**
     * Build comprehensive documentation for all routes.
     * 
     * @private
     * @returns {Object} Route documentation
     */
    #buildDocumentation() {
        const documentation = {
            service: 'User Management Service',
            version: this.#config.apiVersion,
            baseUrl: this.#config.basePrefix,
            modules: [],
            authentication: {
                required: this.#securityConfig.authentication.required,
                type: 'Bearer Token',
                excludedPaths: this.#securityConfig.authentication.excludePaths
            },
            rateLimiting: {
                enabled: this.#config.enableRateLimiting,
                window: this.#securityConfig.rateLimiting.windowMs,
                maxRequests: this.#securityConfig.rateLimiting.max
            }
        };

        this.#routeRegistry.forEach((data, name) => {
            documentation.modules.push({
                name,
                prefix: data.prefix,
                description: data.description,
                metrics: {
                    totalRequests: data.requestCount,
                    errorRate: data.requestCount > 0 
                        ? (data.errorCount / data.requestCount).toFixed(4) 
                        : '0.0000',
                    averageResponseTime: Math.round(data.averageResponseTime)
                }
            });
        });

        return documentation;
    }

    /**
     * Generate OpenAPI specification for the routes.
     * 
     * @private
     * @returns {Object} OpenAPI specification
     */
    #generateOpenApiSpec() {
        return {
            openapi: '3.0.0',
            info: {
                title: 'User Management API',
                version: this.#config.apiVersion,
                description: 'Comprehensive user management service for enterprise applications',
                contact: {
                    name: 'API Support',
                    email: 'api-support@insightserenity.com'
                }
            },
            servers: [
                {
                    url: this.#config.basePrefix,
                    description: 'User Management API Server'
                }
            ],
            paths: this.#generateOpenApiPaths(),
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    }
                }
            },
            security: [
                {
                    bearerAuth: []
                }
            ]
        };
    }

    /**
     * Generate OpenAPI paths from registered routes.
     * 
     * @private
     * @returns {Object} OpenAPI paths object
     */
    #generateOpenApiPaths() {
        // This would typically be generated dynamically from route definitions
        return {
            '/health': {
                get: {
                    summary: 'Health check endpoint',
                    tags: ['Monitoring'],
                    responses: {
                        '200': {
                            description: 'Service is healthy'
                        },
                        '503': {
                            description: 'Service is unhealthy'
                        }
                    }
                }
            },
            '/metrics': {
                get: {
                    summary: 'Metrics endpoint',
                    tags: ['Monitoring'],
                    responses: {
                        '200': {
                            description: 'Metrics retrieved successfully'
                        }
                    }
                }
            }
        };
    }

    /**
     * Generate a unique request ID for tracing.
     * 
     * @private
     * @returns {string} Unique request ID
     */
    #generateRequestId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the configured router instance with all routes mounted.
     * This is the main export method for integration with Express app.
     * 
     * @returns {express.Router} Configured Express router
     */
    getRouter() {
        if (!this.#initialized) {
            this.#finalize();
        }
        return this.#router;
    }

    /**
     * Finalize router configuration with error handling and cleanup.
     * 
     * @private
     */
    #finalize() {
        // Add 404 handler for unmatched routes
        this.#router.use((req, res) => {
            res.status(404).json(this.#responseFormatter.formatError(
                'Route not found',
                404,
                {
                    path: req.path,
                    method: req.method
                }
            ));
        });

        // Add global error handler
        this.#router.use(errorHandler());

        this.#initialized = true;
        logger.info('User management routes finalized and ready');
    }

    /**
     * Get current route statistics for monitoring.
     * 
     * @returns {Object} Route statistics
     */
    getStatistics() {
        return this.#collectMetrics();
    }

    /**
     * Reset all metrics and statistics.
     * Useful for testing or after deployment.
     */
    resetMetrics() {
        this.#routeRegistry.forEach(data => {
            data.requestCount = 0;
            data.errorCount = 0;
            data.averageResponseTime = 0;
        });
        
        this.#metricsCollector.clear();
        logger.info('Metrics reset successfully');
    }

    /**
     * Enable or disable a specific feature flag.
     * 
     * @param {string} feature - Feature name
     * @param {boolean} enabled - Whether to enable or disable
     */
    setFeatureFlag(feature, enabled) {
        if (this.#config.featureFlags.hasOwnProperty(feature)) {
            this.#config.featureFlags[feature] = enabled;
            logger.info(`Feature flag ${feature} set to ${enabled}`);
        } else {
            logger.warn(`Unknown feature flag: ${feature}`);
        }
    }

    /**
     * Get current configuration for debugging or monitoring.
     * 
     * @returns {Object} Current configuration
     */
    getConfiguration() {
        return {
            ...this.#config,
            security: {
                authenticationRequired: this.#securityConfig.authentication.required,
                rateLimitingEnabled: this.#config.enableRateLimiting
            }
        };
    }
}

/**
 * Create and export singleton instance of the routes manager
 */
const routesManager = new UserManagementRoutesManager();

/**
 * Main export function that returns the configured router
 * This can be directly used in app.js
 * 
 * @returns {express.Router} Configured router with all user management routes
 */
module.exports = routesManager.getRouter();

/**
 * Also export the manager class for advanced usage and testing
 */
module.exports.UserManagementRoutesManager = UserManagementRoutesManager;

/**
 * Export the manager instance for access to utilities and configuration
 */
module.exports.routesManager = routesManager;

/**
 * Convenience exports for specific functionalities
 */
module.exports.getStatistics = () => routesManager.getStatistics();
module.exports.resetMetrics = () => routesManager.resetMetrics();
module.exports.setFeatureFlag = (feature, enabled) => routesManager.setFeatureFlag(feature, enabled);
module.exports.getConfiguration = () => routesManager.getConfiguration();

/**
 * Export individual route modules for direct access if needed
 */
module.exports.routes = {
    adminUsers: adminUserRoutes,
    userManagement: userManagementRoutes,
    permissions: userPermissionsRoutes,
    sessions: userSessionsRoutes
};

/**
 * Module initialization logging
 */
logger.info('User Management Routes module initialized', {
    modules: Object.keys(module.exports.routes),
    featuresEnabled: Object.entries(routesManager.getConfiguration().featureFlags)
        .filter(([, enabled]) => enabled)
        .map(([feature]) => feature)
});