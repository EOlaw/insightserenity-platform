'use strict';

/**
 * @fileoverview Gateway Routes - Management and control endpoints for API Gateway
 * @module servers/gateway/routes/gateway-routes
 * @requires express
 * @requires joi
 * @requires crypto
 */

const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const router = express.Router();

/**
 * Gateway management routes providing administrative control over the API Gateway.
 * These routes handle configuration management, service registration, route updates,
 * policy management, cache control, metrics access, and system administration.
 * All routes require authentication and appropriate permissions.
 */
class GatewayRoutes {
    /**
     * Creates an instance of GatewayRoutes
     * @constructor
     * @param {Object} gatewayManager - Gateway manager instance
     * @param {Object} serviceRegistry - Service registry instance
     * @param {Object} configManager - Configuration manager
     * @param {Object} cacheManager - Cache manager
     * @param {Object} metricsCollector - Metrics collector
     * @param {Object} authMiddleware - Authentication middleware
     * @param {Object} logger - Logger instance
     */
    constructor(gatewayManager, serviceRegistry, configManager, cacheManager, metricsCollector, authMiddleware, logger) {
        this.gatewayManager = gatewayManager;
        this.serviceRegistry = serviceRegistry;
        this.configManager = configManager;
        this.cacheManager = cacheManager;
        this.metricsCollector = metricsCollector;
        this.authMiddleware = authMiddleware;
        this.logger = logger;
        
        // Validation schemas
        this.schemas = this.initializeSchemas();
        
        // Route statistics
        this.routeStats = {
            requests: {},
            errors: {},
            latency: {}
        };
        
        // Initialize routes
        this.initializeRoutes();
    }

    /**
     * Initializes validation schemas
     * @private
     * @returns {Object} Validation schemas
     */
    initializeSchemas() {
        return {
            // Service registration schema
            serviceRegistration: Joi.object({
                name: Joi.string().required().min(3).max(50),
                url: Joi.string().uri().required(),
                version: Joi.string().default('1.0.0'),
                description: Joi.string().max(500),
                healthCheck: Joi.object({
                    enabled: Joi.boolean().default(true),
                    path: Joi.string().default('/health'),
                    interval: Joi.number().min(1000).default(30000),
                    timeout: Joi.number().min(100).default(5000),
                    retries: Joi.number().min(0).default(3)
                }),
                loadBalancing: Joi.object({
                    algorithm: Joi.string().valid('round-robin', 'least-connections', 'weighted', 'ip-hash').default('round-robin'),
                    weight: Joi.number().min(1).max(100).default(1)
                }),
                security: Joi.object({
                    authentication: Joi.boolean().default(true),
                    authorization: Joi.array().items(Joi.string()),
                    rateLimit: Joi.object({
                        enabled: Joi.boolean().default(true),
                        requests: Joi.number().min(1).default(100),
                        window: Joi.number().min(1000).default(60000)
                    })
                }),
                metadata: Joi.object().default({})
            }),

            // Route configuration schema
            routeConfig: Joi.object({
                path: Joi.string().required(),
                method: Joi.string().valid('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', '*').default('*'),
                service: Joi.string().required(),
                target: Joi.string(),
                rewrite: Joi.object({
                    enabled: Joi.boolean().default(false),
                    pattern: Joi.string(),
                    replacement: Joi.string()
                }),
                authentication: Joi.boolean().default(true),
                authorization: Joi.array().items(Joi.string()),
                rateLimit: Joi.object({
                    enabled: Joi.boolean(),
                    requests: Joi.number().min(1),
                    window: Joi.number().min(1000)
                }),
                caching: Joi.object({
                    enabled: Joi.boolean().default(false),
                    ttl: Joi.number().min(0).default(300),
                    key: Joi.string()
                }),
                transformation: Joi.object({
                    request: Joi.object(),
                    response: Joi.object()
                }),
                metadata: Joi.object()
            }),

            // Policy configuration schema
            policyConfig: Joi.object({
                name: Joi.string().required().min(3).max(50),
                type: Joi.string().valid('security', 'routing', 'transformation', 'caching', 'custom').required(),
                enabled: Joi.boolean().default(true),
                priority: Joi.number().min(0).max(1000).default(100),
                conditions: Joi.array().items(Joi.object({
                    field: Joi.string().required(),
                    operator: Joi.string().valid('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'regex').required(),
                    value: Joi.any().required()
                })),
                actions: Joi.array().items(Joi.object({
                    type: Joi.string().required(),
                    config: Joi.object()
                })),
                metadata: Joi.object()
            }),

            // Configuration update schema
            configUpdate: Joi.object({
                section: Joi.string().required(),
                key: Joi.string().required(),
                value: Joi.any().required(),
                scope: Joi.string().valid('global', 'service', 'route').default('global')
            }),

            // Cache operation schema
            cacheOperation: Joi.object({
                pattern: Joi.string(),
                service: Joi.string(),
                tenant: Joi.string(),
                maxAge: Joi.number().min(0)
            })
        };
    }

    /**
     * Initializes routes
     * @private
     */
    initializeRoutes() {
        // Gateway info and status
        this.setupInfoRoutes();
        
        // Service management routes
        this.setupServiceRoutes();
        
        // Route management
        this.setupRouteManagementRoutes();
        
        // Policy management
        this.setupPolicyRoutes();
        
        // Configuration management
        this.setupConfigurationRoutes();
        
        // Cache management
        this.setupCacheRoutes();
        
        // Metrics and monitoring
        this.setupMetricsRoutes();
        
        // Admin operations
        this.setupAdminRoutes();
        
        // Circuit breaker management
        this.setupCircuitBreakerRoutes();
        
        // Rate limiting management
        this.setupRateLimitingRoutes();
    }

    /**
     * Sets up gateway info routes
     * @private
     */
    setupInfoRoutes() {
        /**
         * GET /gateway/info
         * Returns gateway information and status
         */
        router.get('/info', async (req, res) => {
            try {
                const info = {
                    name: 'API Gateway',
                    version: process.env.GATEWAY_VERSION || '1.0.0',
                    environment: process.env.NODE_ENV || 'development',
                    uptime: process.uptime(),
                    timestamp: Date.now(),
                    status: 'operational',
                    features: {
                        authentication: true,
                        rateLimit: true,
                        caching: true,
                        tracing: true,
                        multiTenant: true
                    },
                    cluster: {
                        enabled: this.gatewayManager?.clusterEnabled || false,
                        nodes: this.gatewayManager?.clusterNodes || 1
                    }
                };
                
                res.json({
                    success: true,
                    data: info
                });
            } catch (error) {
                this.handleError(res, error, 'Failed to get gateway info');
            }
        });

        /**
         * GET /gateway/status
         * Returns detailed gateway status
         */
        router.get('/status', 
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin', 'operator']),
            async (req, res) => {
                try {
                    const status = await this.getGatewayStatus();
                    
                    res.json({
                        success: true,
                        data: status
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get gateway status');
                }
            }
        );

        /**
         * GET /gateway/config
         * Returns current gateway configuration
         */
        router.get('/config',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const config = this.configManager.getConfig();
                    
                    // Redact sensitive information
                    const sanitizedConfig = this.sanitizeConfig(config);
                    
                    res.json({
                        success: true,
                        data: sanitizedConfig
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get gateway configuration');
                }
            }
        );
    }

    /**
     * Sets up service management routes
     * @private
     */
    setupServiceRoutes() {
        /**
         * GET /gateway/services
         * Lists all registered services
         */
        router.get('/services',
            this.authMiddleware.authenticate(),
            async (req, res) => {
                try {
                    const { status, health, tenant } = req.query;
                    
                    let services = this.serviceRegistry.getAllServices();
                    
                    // Apply filters
                    if (status) {
                        services = services.filter(s => s.status === status);
                    }
                    
                    if (health) {
                        services = services.filter(s => s.health === health);
                    }
                    
                    if (tenant && req.user.role === 'admin') {
                        services = services.filter(s => s.tenant === tenant);
                    }
                    
                    res.json({
                        success: true,
                        data: services,
                        total: services.length
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to list services');
                }
            }
        );

        /**
         * GET /gateway/services/:serviceName
         * Gets details of a specific service
         */
        router.get('/services/:serviceName',
            this.authMiddleware.authenticate(),
            async (req, res) => {
                try {
                    const service = this.serviceRegistry.getService(req.params.serviceName);
                    
                    if (!service) {
                        return res.status(404).json({
                            success: false,
                            error: 'Service not found'
                        });
                    }
                    
                    // Get additional service details
                    const details = await this.getServiceDetails(service);
                    
                    res.json({
                        success: true,
                        data: details
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get service details');
                }
            }
        );

        /**
         * POST /gateway/services
         * Registers a new service
         */
        router.post('/services',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.serviceRegistration),
            async (req, res) => {
                try {
                    const service = await this.serviceRegistry.registerService(req.body);
                    
                    this.log('info', 'Service registered', { 
                        service: service.name,
                        by: req.user.id 
                    });
                    
                    res.status(201).json({
                        success: true,
                        data: service,
                        message: 'Service registered successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to register service');
                }
            }
        );

        /**
         * PUT /gateway/services/:serviceName
         * Updates service configuration
         */
        router.put('/services/:serviceName',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.serviceRegistration.optional()),
            async (req, res) => {
                try {
                    const updated = await this.serviceRegistry.updateService(
                        req.params.serviceName,
                        req.body
                    );
                    
                    this.log('info', 'Service updated', {
                        service: req.params.serviceName,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        data: updated,
                        message: 'Service updated successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to update service');
                }
            }
        );

        /**
         * DELETE /gateway/services/:serviceName
         * Unregisters a service
         */
        router.delete('/services/:serviceName',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.serviceRegistry.unregisterService(req.params.serviceName);
                    
                    this.log('info', 'Service unregistered', {
                        service: req.params.serviceName,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Service unregistered successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to unregister service');
                }
            }
        );

        /**
         * POST /gateway/services/:serviceName/health
         * Triggers health check for a service
         */
        router.post('/services/:serviceName/health',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin', 'operator']),
            async (req, res) => {
                try {
                    const health = await this.serviceRegistry.checkServiceHealth(
                        req.params.serviceName
                    );
                    
                    res.json({
                        success: true,
                        data: health
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to check service health');
                }
            }
        );
    }

    /**
     * Sets up route management routes
     * @private
     */
    setupRouteManagementRoutes() {
        /**
         * GET /gateway/routes
         * Lists all configured routes
         */
        router.get('/routes',
            this.authMiddleware.authenticate(),
            async (req, res) => {
                try {
                    const routes = this.gatewayManager.getRoutes();
                    
                    res.json({
                        success: true,
                        data: routes,
                        total: routes.length
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to list routes');
                }
            }
        );

        /**
         * POST /gateway/routes
         * Creates a new route
         */
        router.post('/routes',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.routeConfig),
            async (req, res) => {
                try {
                    const route = await this.gatewayManager.addRoute(req.body);
                    
                    this.log('info', 'Route created', {
                        route: route.path,
                        by: req.user.id
                    });
                    
                    res.status(201).json({
                        success: true,
                        data: route,
                        message: 'Route created successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to create route');
                }
            }
        );

        /**
         * PUT /gateway/routes/:routeId
         * Updates a route
         */
        router.put('/routes/:routeId',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.routeConfig.optional()),
            async (req, res) => {
                try {
                    const updated = await this.gatewayManager.updateRoute(
                        req.params.routeId,
                        req.body
                    );
                    
                    this.log('info', 'Route updated', {
                        route: req.params.routeId,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        data: updated,
                        message: 'Route updated successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to update route');
                }
            }
        );

        /**
         * DELETE /gateway/routes/:routeId
         * Deletes a route
         */
        router.delete('/routes/:routeId',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.deleteRoute(req.params.routeId);
                    
                    this.log('info', 'Route deleted', {
                        route: req.params.routeId,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Route deleted successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to delete route');
                }
            }
        );

        /**
         * POST /gateway/routes/reload
         * Reloads route configuration
         */
        router.post('/routes/reload',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.reloadRoutes();
                    
                    this.log('info', 'Routes reloaded', {
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Routes reloaded successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to reload routes');
                }
            }
        );
    }

    /**
     * Sets up policy management routes
     * @private
     */
    setupPolicyRoutes() {
        /**
         * GET /gateway/policies
         * Lists all policies
         */
        router.get('/policies',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin', 'operator']),
            async (req, res) => {
                try {
                    const { type, enabled } = req.query;
                    
                    let policies = this.gatewayManager.getPolicies();
                    
                    if (type) {
                        policies = policies.filter(p => p.type === type);
                    }
                    
                    if (enabled !== undefined) {
                        policies = policies.filter(p => p.enabled === (enabled === 'true'));
                    }
                    
                    res.json({
                        success: true,
                        data: policies,
                        total: policies.length
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to list policies');
                }
            }
        );

        /**
         * POST /gateway/policies
         * Creates a new policy
         */
        router.post('/policies',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.policyConfig),
            async (req, res) => {
                try {
                    const policy = await this.gatewayManager.addPolicy(req.body);
                    
                    this.log('info', 'Policy created', {
                        policy: policy.name,
                        by: req.user.id
                    });
                    
                    res.status(201).json({
                        success: true,
                        data: policy,
                        message: 'Policy created successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to create policy');
                }
            }
        );

        /**
         * PUT /gateway/policies/:policyId
         * Updates a policy
         */
        router.put('/policies/:policyId',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.policyConfig.optional()),
            async (req, res) => {
                try {
                    const updated = await this.gatewayManager.updatePolicy(
                        req.params.policyId,
                        req.body
                    );
                    
                    this.log('info', 'Policy updated', {
                        policy: req.params.policyId,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        data: updated,
                        message: 'Policy updated successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to update policy');
                }
            }
        );

        /**
         * DELETE /gateway/policies/:policyId
         * Deletes a policy
         */
        router.delete('/policies/:policyId',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.deletePolicy(req.params.policyId);
                    
                    this.log('info', 'Policy deleted', {
                        policy: req.params.policyId,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Policy deleted successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to delete policy');
                }
            }
        );

        /**
         * POST /gateway/policies/:policyId/enable
         * Enables a policy
         */
        router.post('/policies/:policyId/enable',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.enablePolicy(req.params.policyId);
                    
                    res.json({
                        success: true,
                        message: 'Policy enabled successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to enable policy');
                }
            }
        );

        /**
         * POST /gateway/policies/:policyId/disable
         * Disables a policy
         */
        router.post('/policies/:policyId/disable',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.disablePolicy(req.params.policyId);
                    
                    res.json({
                        success: true,
                        message: 'Policy disabled successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to disable policy');
                }
            }
        );
    }

    /**
     * Sets up configuration management routes
     * @private
     */
    setupConfigurationRoutes() {
        /**
         * GET /gateway/configuration
         * Gets configuration sections
         */
        router.get('/configuration',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const sections = this.configManager.getConfigSections();
                    
                    res.json({
                        success: true,
                        data: sections
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get configuration sections');
                }
            }
        );

        /**
         * GET /gateway/configuration/:section
         * Gets configuration for a specific section
         */
        router.get('/configuration/:section',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const config = this.configManager.getConfigSection(req.params.section);
                    
                    if (!config) {
                        return res.status(404).json({
                            success: false,
                            error: 'Configuration section not found'
                        });
                    }
                    
                    res.json({
                        success: true,
                        data: config
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get configuration section');
                }
            }
        );

        /**
         * PUT /gateway/configuration
         * Updates configuration
         */
        router.put('/configuration',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.configUpdate),
            async (req, res) => {
                try {
                    await this.configManager.updateConfig(
                        req.body.section,
                        req.body.key,
                        req.body.value,
                        req.body.scope
                    );
                    
                    this.log('info', 'Configuration updated', {
                        section: req.body.section,
                        key: req.body.key,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Configuration updated successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to update configuration');
                }
            }
        );

        /**
         * POST /gateway/configuration/reload
         * Reloads configuration from source
         */
        router.post('/configuration/reload',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.configManager.reloadConfig();
                    
                    this.log('info', 'Configuration reloaded', {
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Configuration reloaded successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to reload configuration');
                }
            }
        );

        /**
         * POST /gateway/configuration/export
         * Exports current configuration
         */
        router.post('/configuration/export',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const config = await this.configManager.exportConfig();
                    
                    res.json({
                        success: true,
                        data: config,
                        exportedAt: Date.now()
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to export configuration');
                }
            }
        );

        /**
         * POST /gateway/configuration/import
         * Imports configuration
         */
        router.post('/configuration/import',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.configManager.importConfig(req.body);
                    
                    this.log('warn', 'Configuration imported', {
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Configuration imported successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to import configuration');
                }
            }
        );
    }

    /**
     * Sets up cache management routes
     * @private
     */
    setupCacheRoutes() {
        /**
         * GET /gateway/cache/stats
         * Gets cache statistics
         */
        router.get('/cache/stats',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin', 'operator']),
            async (req, res) => {
                try {
                    const stats = await this.cacheManager.getStatistics();
                    
                    res.json({
                        success: true,
                        data: stats
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get cache statistics');
                }
            }
        );

        /**
         * DELETE /gateway/cache
         * Clears cache
         */
        router.delete('/cache',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            this.validateRequest(this.schemas.cacheOperation.optional()),
            async (req, res) => {
                try {
                    const { pattern, service, tenant } = req.body || {};
                    
                    let cleared = 0;
                    
                    if (pattern) {
                        cleared = await this.cacheManager.clearByPattern(pattern);
                    } else if (service) {
                        cleared = await this.cacheManager.clearByService(service);
                    } else if (tenant) {
                        cleared = await this.cacheManager.clearByTenant(tenant);
                    } else {
                        cleared = await this.cacheManager.clearAll();
                    }
                    
                    this.log('info', 'Cache cleared', {
                        entries: cleared,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: `Cleared ${cleared} cache entries`
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to clear cache');
                }
            }
        );

        /**
         * POST /gateway/cache/warm
         * Warms up cache
         */
        router.post('/cache/warm',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const warmed = await this.cacheManager.warmCache(req.body);
                    
                    res.json({
                        success: true,
                        message: `Warmed ${warmed} cache entries`
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to warm cache');
                }
            }
        );
    }

    /**
     * Sets up metrics routes
     * @private
     */
    setupMetricsRoutes() {
        /**
         * GET /gateway/metrics
         * Gets gateway metrics
         */
        router.get('/metrics',
            this.authMiddleware.authenticate(),
            async (req, res) => {
                try {
                    const metrics = await this.metricsCollector.getMetrics(req.query.format);
                    
                    if (req.query.format === 'prometheus') {
                        res.set('Content-Type', 'text/plain');
                        res.send(metrics);
                    } else {
                        res.json({
                            success: true,
                            data: metrics
                        });
                    }
                } catch (error) {
                    this.handleError(res, error, 'Failed to get metrics');
                }
            }
        );

        /**
         * GET /gateway/metrics/services
         * Gets per-service metrics
         */
        router.get('/metrics/services',
            this.authMiddleware.authenticate(),
            async (req, res) => {
                try {
                    const metrics = await this.metricsCollector.getServiceMetrics();
                    
                    res.json({
                        success: true,
                        data: metrics
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get service metrics');
                }
            }
        );

        /**
         * GET /gateway/metrics/routes
         * Gets per-route metrics
         */
        router.get('/metrics/routes',
            this.authMiddleware.authenticate(),
            async (req, res) => {
                try {
                    const metrics = await this.metricsCollector.getRouteMetrics();
                    
                    res.json({
                        success: true,
                        data: metrics
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get route metrics');
                }
            }
        );
    }

    /**
     * Sets up admin operation routes
     * @private
     */
    setupAdminRoutes() {
        /**
         * POST /gateway/admin/shutdown
         * Gracefully shuts down the gateway
         */
        router.post('/admin/shutdown',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const { gracePeriod = 30000, force = false } = req.body;
                    
                    this.log('warn', 'Gateway shutdown initiated', {
                        by: req.user.id,
                        gracePeriod,
                        force
                    });
                    
                    res.json({
                        success: true,
                        message: 'Gateway shutdown initiated',
                        gracePeriod
                    });
                    
                    // Initiate shutdown after response
                    setTimeout(() => {
                        this.gatewayManager.shutdown(gracePeriod, force);
                    }, 100);
                    
                } catch (error) {
                    this.handleError(res, error, 'Failed to initiate shutdown');
                }
            }
        );

        /**
         * POST /gateway/admin/restart
         * Restarts the gateway
         */
        router.post('/admin/restart',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    this.log('warn', 'Gateway restart initiated', {
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: 'Gateway restart initiated'
                    });
                    
                    // Initiate restart after response
                    setTimeout(() => {
                        this.gatewayManager.restart();
                    }, 100);
                    
                } catch (error) {
                    this.handleError(res, error, 'Failed to initiate restart');
                }
            }
        );

        /**
         * POST /gateway/admin/maintenance
         * Toggles maintenance mode
         */
        router.post('/admin/maintenance',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const { enabled, message } = req.body;
                    
                    await this.gatewayManager.setMaintenanceMode(enabled, message);
                    
                    this.log('info', 'Maintenance mode changed', {
                        enabled,
                        by: req.user.id
                    });
                    
                    res.json({
                        success: true,
                        message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to set maintenance mode');
                }
            }
        );

        /**
         * GET /gateway/admin/logs
         * Gets gateway logs
         */
        router.get('/admin/logs',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const { level, from, to, limit = 100 } = req.query;
                    
                    const logs = await this.gatewayManager.getLogs({
                        level,
                        from: from ? new Date(from) : undefined,
                        to: to ? new Date(to) : undefined,
                        limit: parseInt(limit)
                    });
                    
                    res.json({
                        success: true,
                        data: logs
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get logs');
                }
            }
        );
    }

    /**
     * Sets up circuit breaker management routes
     * @private
     */
    setupCircuitBreakerRoutes() {
        /**
         * GET /gateway/circuit-breakers
         * Lists all circuit breakers
         */
        router.get('/circuit-breakers',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin', 'operator']),
            async (req, res) => {
                try {
                    const breakers = this.gatewayManager.getCircuitBreakers();
                    
                    res.json({
                        success: true,
                        data: breakers
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get circuit breakers');
                }
            }
        );

        /**
         * POST /gateway/circuit-breakers/:service/reset
         * Resets a circuit breaker
         */
        router.post('/circuit-breakers/:service/reset',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.resetCircuitBreaker(req.params.service);
                    
                    res.json({
                        success: true,
                        message: 'Circuit breaker reset successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to reset circuit breaker');
                }
            }
        );

        /**
         * POST /gateway/circuit-breakers/:service/open
         * Manually opens a circuit breaker
         */
        router.post('/circuit-breakers/:service/open',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.openCircuitBreaker(req.params.service);
                    
                    res.json({
                        success: true,
                        message: 'Circuit breaker opened successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to open circuit breaker');
                }
            }
        );
    }

    /**
     * Sets up rate limiting management routes
     * @private
     */
    setupRateLimitingRoutes() {
        /**
         * GET /gateway/rate-limits
         * Gets rate limit configurations
         */
        router.get('/rate-limits',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const limits = this.gatewayManager.getRateLimits();
                    
                    res.json({
                        success: true,
                        data: limits
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to get rate limits');
                }
            }
        );

        /**
         * PUT /gateway/rate-limits/:tier
         * Updates rate limits for a tier
         */
        router.put('/rate-limits/:tier',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    await this.gatewayManager.updateRateLimits(req.params.tier, req.body);
                    
                    res.json({
                        success: true,
                        message: 'Rate limits updated successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to update rate limits');
                }
            }
        );

        /**
         * DELETE /gateway/rate-limits/reset
         * Resets rate limit counters
         */
        router.delete('/rate-limits/reset',
            this.authMiddleware.authenticate(),
            this.authMiddleware.authorize(['admin']),
            async (req, res) => {
                try {
                    const { user, ip, apiKey } = req.body;
                    
                    await this.gatewayManager.resetRateLimits({ user, ip, apiKey });
                    
                    res.json({
                        success: true,
                        message: 'Rate limits reset successfully'
                    });
                } catch (error) {
                    this.handleError(res, error, 'Failed to reset rate limits');
                }
            }
        );
    }

    /**
     * Helper methods
     */

    /**
     * Validates request body
     * @private
     * @param {Object} schema - Joi validation schema
     * @returns {Function} Express middleware
     */
    validateRequest(schema) {
        return (req, res, next) => {
            const { error, value } = schema.validate(req.body, {
                abortEarly: false,
                stripUnknown: true
            });
            
            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation error',
                    details: error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    }))
                });
            }
            
            req.body = value;
            next();
        };
    }

    /**
     * Gets gateway status
     * @private
     * @async
     * @returns {Promise<Object>} Gateway status
     */
    async getGatewayStatus() {
        return {
            status: 'operational',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            services: {
                total: this.serviceRegistry.getAllServices().length,
                healthy: this.serviceRegistry.getHealthyServices().length,
                unhealthy: this.serviceRegistry.getUnhealthyServices().length
            },
            routes: {
                total: this.gatewayManager.getRoutes().length,
                active: this.gatewayManager.getActiveRoutes().length
            },
            cache: await this.cacheManager.getStatistics(),
            metrics: this.metricsCollector.getSummary()
        };
    }

    /**
     * Gets service details
     * @private
     * @async
     * @param {Object} service - Service object
     * @returns {Promise<Object>} Service details
     */
    async getServiceDetails(service) {
        return {
            ...service,
            health: await this.serviceRegistry.getServiceHealth(service.name),
            metrics: await this.metricsCollector.getServiceMetrics(service.name),
            routes: this.gatewayManager.getServiceRoutes(service.name),
            instances: await this.serviceRegistry.getServiceInstances(service.name)
        };
    }

    /**
     * Sanitizes configuration for display
     * @private
     * @param {Object} config - Configuration object
     * @returns {Object} Sanitized configuration
     */
    sanitizeConfig(config) {
        const sanitized = { ...config };
        
        // Remove sensitive fields
        const sensitiveFields = ['secret', 'password', 'apiKey', 'token', 'privateKey'];
        
        const sanitizeObject = (obj) => {
            for (const key in obj) {
                if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObject(obj[key]);
                }
            }
        };
        
        sanitizeObject(sanitized);
        return sanitized;
    }

    /**
     * Handles errors
     * @private
     * @param {Object} res - Response object
     * @param {Error} error - Error object
     * @param {string} message - Error message
     */
    handleError(res, error, message) {
        this.log('error', message, error);
        
        const statusCode = error.statusCode || 500;
        
        res.status(statusCode).json({
            success: false,
            error: message,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger) {
            this.logger[level](message, data);
        } else {
            console[level](message, data);
        }
    }

    /**
     * Returns the router
     * @returns {Object} Express router
     */
    getRouter() {
        return router;
    }
}

module.exports = GatewayRoutes;