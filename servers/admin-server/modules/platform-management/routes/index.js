'use strict';

/**
 * @fileoverview Platform Management Routes Index - Comprehensive Version with Timeout Prevention
 * @module servers/admin-server/modules/platform-management/routes
 * @requires express
 * @requires module:servers/admin-server/modules/platform-management/routes/platform-routes
 * @requires module:servers/admin-server/modules/platform-management/routes/system-routes
 * @requires module:servers/admin-server/modules/platform-management/routes/configuration-routes
 * @requires module:servers/admin-server/modules/platform-management/routes/maintenance-routes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/security/security-headers
 */

const express = require('express');
const platformRoutes = require('./platform-routes');
const systemRoutes = require('./system-routes');
const configurationRoutes = require('./configuration-routes');
const maintenanceRoutes = require('./maintenance-routes');
const logger = require('../../../../../shared/lib/utils/logger');
const { ResponseFormatter } = require('../../../../../shared/lib/utils/response-formatter');

// Import shared middleware with fallbacks
let auditLogger, errorHandler, requestLogger, securityHeaders;

// Safe audit logger import
try {
    const { getAuditLogger } = require('../../../../../shared/lib/middleware/logging/audit-logger');
    auditLogger = getAuditLogger({ module: 'PlatformManagementRoutes' });
} catch (error) {
    logger.warn('Audit logger not available, using fallback', { error: error.message });
    auditLogger = {
        logEvent: (event, req) => {
            logger.info('Audit event (fallback)', { event: event.event || 'unknown', path: req?.path });
            return Promise.resolve();
        }
    };
}

// Safe error handler import
try {
    const { handleError } = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
    errorHandler = handleError;
} catch (error) {
    logger.warn('Error handler not available, using fallback', { error: error.message });
    errorHandler = (err, req, res, next) => {
        logger.error('Route error (fallback)', { error: err.message, path: req.path });
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: { message: 'Internal server error', timestamp: new Date().toISOString() }
            });
        }
    };
}

// Safe request logger import
try {
    const { log } = require('../../../../../shared/lib/middleware/logging/request-logger');
    requestLogger = log;
} catch (error) {
    logger.warn('Request logger not available, using fallback', { error: error.message });
    requestLogger = (req, res, next) => {
        logger.debug('Request (fallback)', { method: req.method, path: req.path });
        next();
    };
}

// Safe security headers import
try {
    const { securityHeaders: headers } = require('../../../../../shared/lib/middleware/security/security-headers');
    securityHeaders = headers;
} catch (error) {
    logger.warn('Security headers not available, using fallback', { error: error.message });
    securityHeaders = (config) => (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        next();
    };
}

/**
 * PlatformManagementRoutesManager class handles the configuration, initialization,
 * and management of all platform management related routes with comprehensive
 * functionality and proper timeout prevention.
 */
class PlatformManagementRoutesManager {
    constructor() {
        this.router = express.Router();
        this.responseFormatter = new ResponseFormatter();
        this.routeRegistry = new Map();
        this.metricsCollector = new Map();
        this.healthChecks = new Map();
        this.performanceMetrics = this.initializePerformanceMetrics();
        this.auditLog = this.initializeAuditSystem();
        this.alertManager = this.initializeAlertManager();
        this.systemMonitor = this.initializeSystemMonitor();
        this.deploymentTracker = this.initializeDeploymentTracker();
        this.initialized = false;

        this.config = this.initializeConfiguration();
        this.securityConfig = this.initializeSecurityConfig();

        this.setupBaseMiddleware();
        this.registerRouteModules();
        this.setupHealthChecks();
        this.setupMetricsCollection();
        this.setupDocumentation();

        logger.info('PlatformManagementRoutesManager initialized successfully', {
            module: 'platform-management',
            version: this.config.apiVersion,
            capabilities: this.config.featureFlags
        });
    }

    /**
     * Initialize configuration for the routes manager
     */
    initializeConfiguration() {
        return {
            apiVersion: process.env.API_VERSION || 'v1',
            basePrefix: process.env.PLATFORM_MANAGEMENT_BASE_PATH || '/api/v1/platform-management',
            enableMetrics: process.env.ENABLE_ROUTE_METRICS !== 'false',
            enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
            enableDocumentation: process.env.ENABLE_ROUTE_DOCS !== 'false',
            enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false',
            requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
            maxRequestSize: process.env.MAX_REQUEST_SIZE || '50mb',

            routePrefixes: {
                platform: '/platform',
                system: '/system',
                configuration: '/configuration',
                maintenance: '/maintenance'
            },

            featureFlags: {
                enablePlatformManagement: process.env.FEATURE_PLATFORM_MGMT !== 'false',
                enableSystemMonitoring: process.env.FEATURE_SYSTEM_MONITORING !== 'false',
                enableConfigurationMgmt: process.env.FEATURE_CONFIG_MGMT !== 'false',
                enableMaintenanceOps: process.env.FEATURE_MAINTENANCE_OPS !== 'false',
                enableFeatureToggling: process.env.FEATURE_TOGGLES !== 'false',
                enableDeploymentMgmt: process.env.FEATURE_DEPLOYMENT_MGMT !== 'false',
                enableSystemHealth: process.env.FEATURE_SYSTEM_HEALTH !== 'false',
                enablePerformanceMonitoring: process.env.FEATURE_PERF_MONITORING !== 'false',
                enableAlertManagement: process.env.FEATURE_ALERT_MGMT !== 'false',
                enableWorkflowAutomation: process.env.FEATURE_WORKFLOW_AUTO !== 'false'
            },

            monitoring: {
                logLevel: process.env.ROUTE_LOG_LEVEL || 'info',
                metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000,
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
                slowRouteThreshold: parseInt(process.env.SLOW_ROUTE_THRESHOLD) || 2000,
                errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.05
            },

            deployment: {
                environment: process.env.NODE_ENV || 'development',
                version: process.env.APP_VERSION || '1.0.0',
                buildId: process.env.BUILD_ID || 'local',
                deploymentId: process.env.DEPLOYMENT_ID || null
            }
        };
    }

    /**
     * Initialize security configuration for route protection
     */
    initializeSecurityConfig() {
        return {
            authentication: {
                required: true,
                excludePaths: ['/health', '/metrics', '/docs', '/system/status']
            },

            authorization: {
                defaultRequiredRoles: ['PLATFORM_ADMIN'],
                roleHierarchy: {
                    'SUPER_ADMIN': 10,
                    'PLATFORM_ADMIN': 9,
                    'SYSTEM_ADMIN': 8,
                    'DEPLOYMENT_ADMIN': 7,
                    'MAINTENANCE_ADMIN': 6,
                    'MONITORING_ADMIN': 5,
                    'CONFIG_ADMIN': 4,
                    'SUPPORT_ADMIN': 3,
                    'READ_ONLY_ADMIN': 1
                }
            },

            headers: {
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
                xFrameOptions: 'DENY'
            }
        };
    }

    /**
     * Initialize performance tracking system
     */
    initializePerformanceMetrics() {
        return {
            routes: new Map(),
            system: {
                startTime: Date.now(),
                requestCount: 0,
                errorCount: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                peakMemoryUsage: 0
            },
            thresholds: {
                slowRoute: 2000,
                highMemory: 500 * 1024 * 1024,
                errorRate: 0.05
            }
        };
    }

    /**
     * Initialize audit logging system
     */
    initializeAuditSystem() {
        return {
            enabled: this.config?.enableAuditLogging || false,
            entries: [],
            maxEntries: 10000,
            retention: 2592000000,
            sensitiveOperations: new Set([
                'configuration_update',
                'system_restart',
                'maintenance_mode',
                'deployment',
                'rollback'
            ])
        };
    }

    /**
     * Initialize alert management system
     */
    initializeAlertManager() {
        return {
            enabled: true,
            activeAlerts: new Map(),
            suppressedAlerts: new Set(),
            alertHistory: []
        };
    }

    /**
     * Initialize system monitoring capabilities
     */
    initializeSystemMonitor() {
        return {
            enabled: true,
            metrics: {
                cpu: { current: 0, history: [] },
                memory: { current: 0, history: [] },
                disk: { current: 0, history: [] }
            },
            healthScore: 100,
            lastCheck: new Date()
        };
    }

    /**
     * Initialize deployment tracking system
     */
    initializeDeploymentTracker() {
        return {
            enabled: true,
            currentDeployment: {
                id: this.config?.deployment?.deploymentId,
                version: this.config?.deployment?.version,
                buildId: this.config?.deployment?.buildId,
                environment: this.config?.deployment?.environment,
                startTime: new Date(),
                status: 'running'
            },
            deploymentHistory: []
        };
    }

    /**
     * Setup base middleware with proper timeout handling
     */
    setupBaseMiddleware() {
        // Request logging middleware with timeout protection
        this.router.use(this.createTimeoutWrapper(requestLogger, 'request-logger', 1000));

        // Security headers middleware with timeout protection
        this.router.use(this.createTimeoutWrapper(
            securityHeaders(this.securityConfig.headers), 
            'security-headers', 
            500
        ));

        // Request ID and correlation tracking with immediate response
        this.router.use((req, res, next) => {
            req.requestId = req.headers['x-request-id'] || this.generateRequestId();
            req.correlationId = req.headers['x-correlation-id'] || this.generateCorrelationId();
            req.platformContext = {
                module: 'platform-management',
                timestamp: new Date().toISOString(),
                environment: this.config.deployment.environment
            };

            res.setHeader('X-Request-ID', req.requestId);
            res.setHeader('X-Correlation-ID', req.correlationId);
            res.setHeader('X-Platform-Module', 'platform-management');
            
            next();
        });

        // Performance monitoring middleware with timeout protection
        if (this.config.enableMetrics) {
            this.router.use(this.createPerformanceMiddleware());
        }

        // Safe audit logging middleware with proper error handling
        if (this.config.enableAuditLogging && auditLogger) {
            this.router.use(this.createSafeAuditMiddleware());
        }

        // System health middleware with immediate response
        this.router.use((req, res, next) => {
            req.systemHealth = {
                status: this.systemMonitor.healthScore >= 80 ? 'healthy' : 'degraded',
                score: this.systemMonitor.healthScore,
                lastCheck: this.systemMonitor.lastCheck
            };
            next();
        });

        logger.debug('Base middleware configured for platform management routes');
    }

    /**
     * Create timeout wrapper for middleware to prevent hanging
     */
    createTimeoutWrapper(middleware, name, timeoutMs = 5000) {
        return (req, res, next) => {
            let timeoutHandle;
            let completed = false;

            const complete = (error) => {
                if (completed) return;
                completed = true;
                
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                
                if (error) {
                    logger.warn(`Middleware ${name} failed`, { 
                        error: error.message, 
                        path: req.path,
                        requestId: req.requestId 
                    });
                    next(error);
                } else {
                    next();
                }
            };

            timeoutHandle = setTimeout(() => {
                if (!completed) {
                    logger.warn(`Middleware ${name} timeout`, { 
                        path: req.path, 
                        timeout: timeoutMs,
                        requestId: req.requestId 
                    });
                    complete();
                }
            }, timeoutMs);

            try {
                middleware(req, res, complete);
            } catch (error) {
                complete(error);
            }
        };
    }

    /**
     * Create performance monitoring middleware with timeout protection
     */
    createPerformanceMiddleware() {
        return (req, res, next) => {
            const startTime = process.hrtime();
            const startMemory = process.memoryUsage();

            res.on('finish', () => {
                try {
                    const [seconds, nanoseconds] = process.hrtime(startTime);
                    const duration = seconds * 1000 + nanoseconds * 1e-6;
                    const endMemory = process.memoryUsage();

                    this.performanceMetrics.system.requestCount++;
                    this.performanceMetrics.system.totalResponseTime += duration;
                    this.performanceMetrics.system.averageResponseTime =
                        this.performanceMetrics.system.totalResponseTime / this.performanceMetrics.system.requestCount;

                    if (res.statusCode >= 400) {
                        this.performanceMetrics.system.errorCount++;
                    }

                    if (endMemory.heapUsed > this.performanceMetrics.system.peakMemoryUsage) {
                        this.performanceMetrics.system.peakMemoryUsage = endMemory.heapUsed;
                    }

                    if (duration > this.performanceMetrics.thresholds.slowRoute) {
                        this.triggerAlert('performance', {
                            type: 'slow_route',
                            duration,
                            path: req.path,
                            method: req.method
                        });
                    }
                } catch (error) {
                    logger.error('Performance metrics collection failed', { error: error.message });
                }
            });

            next();
        };
    }

    /**
     * Create safe audit logging middleware with proper error handling
     */
    createSafeAuditMiddleware() {
        return (req, res, next) => {
            const startTime = Date.now();

            res.on('finish', () => {
                // Use setTimeout to ensure this doesn't block the response
                setTimeout(async () => {
                    try {
                        const responseTime = Date.now() - startTime;
                        
                        if (auditLogger && typeof auditLogger.logEvent === 'function') {
                            const auditPromise = auditLogger.logEvent({
                                event: 'platform.management.accessed',
                                timestamp: new Date().toISOString(),
                                actor: req.user || { type: 'anonymous', id: req.ip },
                                resource: {
                                    type: 'platform_management',
                                    id: req.path
                                },
                                action: req.method,
                                result: res.statusCode < 400 ? 'success' : 'failure',
                                metadata: {
                                    statusCode: res.statusCode,
                                    responseTime,
                                    path: req.path,
                                    requestId: req.requestId
                                }
                            }, req);

                            // Add timeout to audit logging to prevent hanging
                            const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error('Audit logging timeout')), 3000);
                            });

                            await Promise.race([auditPromise, timeoutPromise]);
                        } else {
                            // Fallback to standard logging
                            logger.info('Platform management access', {
                                event: 'platform_access',
                                method: req.method,
                                path: req.path,
                                status: res.statusCode,
                                responseTime,
                                userId: req.user?.id || 'anonymous',
                                requestId: req.requestId
                            });
                        }
                    } catch (auditError) {
                        logger.error('Audit logging failed', {
                            error: auditError.message,
                            path: req.path,
                            requestId: req.requestId
                        });
                    }
                }, 0);
            });

            next();
        };
    }

    /**
     * Register all route modules with proper error handling
     */
    registerRouteModules() {
        const modules = [
            {
                name: 'platform',
                routes: platformRoutes,
                prefix: this.config.routePrefixes.platform,
                enabled: this.config.featureFlags.enablePlatformManagement,
                description: 'Platform configuration and management endpoints'
            },
            {
                name: 'system',
                routes: systemRoutes,
                prefix: this.config.routePrefixes.system,
                enabled: this.config.featureFlags.enableSystemMonitoring,
                description: 'System monitoring and health management endpoints'
            },
            {
                name: 'configuration',
                routes: configurationRoutes,
                prefix: this.config.routePrefixes.configuration,
                enabled: this.config.featureFlags.enableConfigurationMgmt,
                description: 'Configuration management and versioning endpoints'
            },
            {
                name: 'maintenance',
                routes: maintenanceRoutes,
                prefix: this.config.routePrefixes.maintenance,
                enabled: this.config.featureFlags.enableMaintenanceOps,
                description: 'Maintenance operations and deployment management endpoints'
            }
        ];

        modules.forEach(module => {
            if (module.enabled) {
                this.registerModule(module);
                logger.info(`Registered ${module.name} routes at prefix: ${module.prefix}`, {
                    description: module.description
                });
            } else {
                logger.warn(`${module.name} routes are disabled by feature flag`);
            }
        });
    }

    /**
     * Register an individual route module with timeout protection
     */
    registerModule(module) {
        const moduleRouter = express.Router();

        // Apply module-specific middleware with timeout protection
        moduleRouter.use(this.createModuleMiddleware(module.name));

        // Apply timeout protection to the entire module
        moduleRouter.use((req, res, next) => {
            const moduleTimeout = setTimeout(() => {
                if (!res.headersSent) {
                    logger.error(`Module ${module.name} timeout`, {
                        path: req.path,
                        method: req.method,
                        requestId: req.requestId
                    });
                    
                    res.status(408).json({
                        success: false,
                        error: {
                            message: `${module.name} module timeout`,
                            code: 'MODULE_TIMEOUT',
                            module: module.name,
                            path: req.path,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            }, this.config.requestTimeout);

            res.on('finish', () => {
                clearTimeout(moduleTimeout);
            });

            next();
        });

        // Mount the module routes with error handling
        try {
            moduleRouter.use(module.routes);
        } catch (error) {
            logger.error(`Failed to mount ${module.name} routes`, { error: error.message });
            
            moduleRouter.use((req, res) => {
                res.status(503).json({
                    success: false,
                    error: {
                        message: `${module.name} module is unavailable`,
                        code: 'MODULE_UNAVAILABLE',
                        module: module.name,
                        timestamp: new Date().toISOString()
                    }
                });
            });
        }

        // Register with main router
        this.router.use(module.prefix, moduleRouter);

        // Store in registry
        this.routeRegistry.set(module.name, {
            prefix: module.prefix,
            router: moduleRouter,
            description: module.description,
            registeredAt: new Date(),
            requestCount: 0,
            errorCount: 0,
            averageResponseTime: 0,
            lastAccessed: null
        });
    }

    /**
     * Create module-specific middleware for monitoring
     */
    createModuleMiddleware(moduleName) {
        return (req, res, next) => {
            const startTime = Date.now();

            req.moduleContext = {
                module: moduleName,
                startTime,
                requestId: req.requestId,
                correlationId: req.correlationId
            };

            const moduleData = this.routeRegistry.get(moduleName);
            if (moduleData) {
                moduleData.requestCount++;
                moduleData.lastAccessed = new Date();
            }

            res.on('finish', () => {
                try {
                    const responseTime = Date.now() - startTime;

                    if (moduleData) {
                        const currentAvg = moduleData.averageResponseTime;
                        const count = moduleData.requestCount;
                        moduleData.averageResponseTime = (currentAvg * (count - 1) + responseTime) / count;

                        if (res.statusCode >= 400) {
                            moduleData.errorCount++;
                        }
                    }

                    if (responseTime > this.config.monitoring.slowRouteThreshold) {
                        logger.warn(`Slow request detected in ${moduleName}`, {
                            path: req.path,
                            method: req.method,
                            responseTime,
                            requestId: req.requestId
                        });

                        this.triggerAlert('slow_route', {
                            module: moduleName,
                            path: req.path,
                            responseTime
                        });
                    }
                } catch (error) {
                    logger.error('Module middleware monitoring failed', { error: error.message });
                }
            });

            next();
        };
    }

    /**
     * Setup health check endpoints
     */
    setupHealthChecks() {
        this.router.get('/health', async (req, res) => {
            try {
                const health = await this.performHealthCheck();
                const statusCode = health.status === 'healthy' ? 200 : 503;

                res.status(statusCode).json(this.responseFormatter.formatSuccess(
                    health,
                    `Platform management service is ${health.status}`
                ));
            } catch (error) {
                logger.error('Health check failed', { error: error.message });
                res.status(500).json({
                    success: false,
                    error: {
                        message: 'Health check failed',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });

        this.router.get('/health/detailed', async (req, res) => {
            try {
                const detailedHealth = await this.performDetailedHealthCheck();
                const statusCode = detailedHealth.overallStatus === 'healthy' ? 200 : 503;

                res.status(statusCode).json(this.responseFormatter.formatSuccess(
                    detailedHealth,
                    'Detailed health check completed'
                ));
            } catch (error) {
                logger.error('Detailed health check failed', { error: error.message });
                res.status(500).json({
                    success: false,
                    error: {
                        message: 'Detailed health check failed',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });

        logger.debug('Health check endpoints configured for platform management');
    }

    /**
     * Setup metrics collection endpoints
     */
    setupMetricsCollection() {
        if (!this.config.enableMetrics) return;

        this.router.get('/metrics', (req, res) => {
            try {
                const metrics = this.collectMetrics();
                res.json(this.responseFormatter.formatSuccess(
                    metrics,
                    'Metrics collected successfully'
                ));
            } catch (error) {
                logger.error('Metrics collection failed', { error: error.message });
                res.status(500).json({
                    success: false,
                    error: {
                        message: 'Metrics collection failed',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });

        this.router.get('/metrics/performance', (req, res) => {
            try {
                const perfMetrics = this.performanceMetrics;
                res.json(this.responseFormatter.formatSuccess(
                    perfMetrics,
                    'Performance metrics collected'
                ));
            } catch (error) {
                logger.error('Performance metrics collection failed', { error: error.message });
                res.status(500).json({
                    success: false,
                    error: {
                        message: 'Performance metrics collection failed',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });

        logger.debug('Metrics collection endpoints configured');
    }

    /**
     * Setup documentation endpoints
     */
    setupDocumentation() {
        if (!this.config.enableDocumentation) return;

        this.router.get('/docs', (req, res) => {
            try {
                const documentation = this.buildDocumentation();
                res.json(this.responseFormatter.formatSuccess(
                    documentation,
                    'Route documentation generated successfully'
                ));
            } catch (error) {
                logger.error('Documentation generation failed', { error: error.message });
                res.status(500).json({
                    success: false,
                    error: {
                        message: 'Documentation generation failed',
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });

        logger.debug('Route documentation endpoints configured');
    }

    // Helper methods
    generateRequestId() {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substr(2, 9);
        return `plat-${timestamp}-${randomPart}`;
    }

    generateCorrelationId() {
        return require('crypto').randomBytes(16).toString('hex');
    }

    triggerAlert(type, details) {
        if (!this.alertManager.enabled) return;

        const alertId = require('crypto').randomBytes(8).toString('hex');
        const alert = {
            id: alertId,
            type,
            details,
            timestamp: new Date().toISOString(),
            module: 'platform-management'
        };

        this.alertManager.activeAlerts.set(alertId, alert);
        this.alertManager.alertHistory.push(alert);

        logger.warn('Platform management alert triggered', alert);
    }

    async performHealthCheck() {
        const checks = {
            routes: this.routeRegistry.size > 0,
            performance: this.performanceMetrics.system.averageResponseTime < 2000,
            system: true,
            dependencies: true
        };

        const status = Object.values(checks).every(check => check) ? 'healthy' : 'unhealthy';

        return {
            status,
            timestamp: new Date().toISOString(),
            checks,
            uptime: process.uptime(),
            version: this.config.deployment.version,
            environment: this.config.deployment.environment
        };
    }

    async performDetailedHealthCheck() {
        return {
            overallStatus: 'healthy',
            timestamp: new Date().toISOString(),
            modules: Array.from(this.routeRegistry.entries()).map(([name, data]) => ({
                name,
                requestCount: data.requestCount,
                errorCount: data.errorCount,
                averageResponseTime: data.averageResponseTime,
                lastAccessed: data.lastAccessed,
                status: data.errorCount / Math.max(data.requestCount, 1) < 0.1 ? 'healthy' : 'degraded'
            })),
            performance: this.performanceMetrics.system,
            deployment: this.deploymentTracker.currentDeployment
        };
    }

    collectMetrics() {
        return {
            timestamp: new Date().toISOString(),
            routes: Array.from(this.routeRegistry.entries()).map(([name, data]) => ({
                name,
                requestCount: data.requestCount,
                errorCount: data.errorCount,
                averageResponseTime: data.averageResponseTime,
                lastAccessed: data.lastAccessed
            })),
            performance: this.performanceMetrics.system,
            alerts: this.alertManager.activeAlerts.size
        };
    }

    buildDocumentation() {
        return {
            title: 'Platform Management API',
            version: this.config.apiVersion,
            environment: this.config.deployment.environment,
            modules: Array.from(this.routeRegistry.keys()),
            endpoints: {
                health: '/health',
                metrics: '/metrics',
                documentation: '/docs'
            },
            capabilities: this.config.featureFlags
        };
    }

    /**
     * Get the configured router instance
     */
    getRouter() {
        if (!this.initialized) {
            this.finalize();
        }
        return this.router;
    }

    /**
     * Finalize router configuration
     */
    finalize() {
        // Add 404 handler
        this.router.use((req, res) => {
            res.status(404).json(this.responseFormatter.formatError(
                'Platform management route not found',
                404,
                {
                    path: req.path,
                    method: req.method,
                    availableModules: Array.from(this.routeRegistry.keys())
                }
            ));
        });

        // Add global error handler
        this.router.use(errorHandler);

        this.initialized = true;
        logger.info('Platform management routes finalized and ready');
    }

    /**
     * Get current statistics
     */
    getStatistics() {
        return this.collectMetrics();
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.routeRegistry.forEach(data => {
            data.requestCount = 0;
            data.errorCount = 0;
            data.averageResponseTime = 0;
        });

        this.performanceMetrics.system = {
            ...this.performanceMetrics.system,
            requestCount: 0,
            errorCount: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };

        logger.info('Platform management metrics reset successfully');
    }

    /**
     * Get configuration
     */
    getConfiguration() {
        return {
            ...this.config,
            security: {
                authenticationRequired: this.securityConfig.authentication.required
            },
            features: this.config.featureFlags
        };
    }
}

// Create and export singleton instance
const routesManager = new PlatformManagementRoutesManager();

// Export the router directly for use in app.js
module.exports = routesManager.getRouter();

// Export additional utilities
module.exports.PlatformManagementRoutesManager = PlatformManagementRoutesManager;
module.exports.routesManager = routesManager;
module.exports.getStatistics = () => routesManager.getStatistics();
module.exports.resetMetrics = () => routesManager.resetMetrics();
module.exports.getConfiguration = () => routesManager.getConfiguration();

// Export individual route modules for direct access
module.exports.routes = {
    platform: platformRoutes,
    system: systemRoutes,
    configuration: configurationRoutes,
    maintenance: maintenanceRoutes
};

logger.info('Platform Management Routes module initialized', {
    modules: Object.keys(module.exports.routes),
    featuresEnabled: Object.entries(routesManager.getConfiguration().features)
        .filter(([, enabled]) => enabled)
        .map(([feature]) => feature),
    environment: routesManager.getConfiguration().deployment?.environment
});