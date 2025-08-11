'use strict';

/**
 * @fileoverview Gateway Application - Core Express application configuration for API Gateway
 * @module servers/gateway/app
 * @requires express
 * @requires helmet
 * @requires compression
 * @requires http-proxy-middleware
 * @requires express-rate-limit
 * @requires cors
 * @requires module:servers/gateway/middleware/gateway-auth
 * @requires module:servers/gateway/middleware/rate-limiting
 * @requires module:servers/gateway/middleware/request-routing
 * @requires module:servers/gateway/middleware/response-aggregation
 * @requires module:servers/gateway/routes/gateway-routes
 * @requires module:servers/gateway/routes/proxy-routes
 * @requires module:servers/gateway/routes/health-routes
 * @requires module:servers/gateway/policies/security-policies
 * @requires module:servers/gateway/policies/routing-policies
 * @requires module:servers/gateway/policies/cache-policies
 */

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { v4: uuidv4 } = require('uuid');

// Import middleware
const { GatewayAuthMiddleware } = require('./middleware/gateway-auth');
const { RateLimitingMiddleware } = require('./middleware/rate-limiting');
const { RequestRoutingMiddleware } = require('./middleware/request-routing');
const { ResponseAggregationMiddleware } = require('./middleware/response-aggregation');

// Import routes
const { GatewayRoutesManager } = require('./routes/gateway-routes');
const { ProxyRoutesManager } = require('./routes/proxy-routes');
const { HealthRoutesManager } = require('./routes/health-routes');

// Import policies
const { SecurityPolicyEngine } = require('./policies/security-policies');
const { RoutingPolicyEngine } = require('./policies/routing-policies');
const { CachePolicyEngine } = require('./policies/cache-policies');

/**
 * GatewayApplication class manages the Express application instance and configures
 * all middleware, routes, and policies required for the API gateway functionality.
 * It provides centralized request routing, security enforcement, rate limiting,
 * and monitoring capabilities.
 * 
 * @class GatewayApplication
 */
class GatewayApplication {
    /**
     * Creates an instance of GatewayApplication
     * @constructor
     * @param {Object} components - Application components and dependencies
     * @param {ConfigManager} components.config - Configuration manager instance
     * @param {Logger} components.logger - Logger instance
     * @param {ServiceRegistry} components.serviceRegistry - Service registry for discovery
     * @param {HealthMonitor} components.healthMonitor - Health monitoring service
     * @param {MetricsCollector} components.metricsCollector - Metrics collection service
     * @param {TraceManager} components.traceManager - Distributed tracing manager
     * @param {CacheManager} components.cacheManager - Cache management service
     * @param {CircuitBreakerManager} components.circuitBreakerManager - Circuit breaker manager
     */
    constructor(components) {
        this.config = components.config;
        this.logger = components.logger;
        this.serviceRegistry = components.serviceRegistry;
        this.healthMonitor = components.healthMonitor;
        this.metricsCollector = components.metricsCollector;
        this.traceManager = components.traceManager;
        this.cacheManager = components.cacheManager;
        this.circuitBreakerManager = components.circuitBreakerManager;
        
        this.app = express();
        this.isInitialized = false;
        
        // Initialize policy engines
        this.securityPolicy = null;
        this.routingPolicy = null;
        this.cachePolicy = null;
        
        // Initialize middleware managers
        this.gatewayAuth = null;
        this.rateLimiter = null;
        this.requestRouter = null;
        this.responseAggregator = null;
        
        // Initialize route managers
        this.gatewayRoutes = null;
        this.proxyRoutes = null;
        this.healthRoutes = null;
        
        // Store proxy instances for cleanup
        this.proxyInstances = new Map();
    }

    /**
     * Initializes the gateway application with all required components
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('Gateway application already initialized');
            return;
        }

        try {
            this.logger.info('Initializing Gateway Application');

            // Initialize policy engines
            await this.initializePolicies();

            // Configure Express settings
            this.configureExpressSettings();

            // Setup global middleware
            await this.setupGlobalMiddleware();

            // Setup security middleware
            await this.setupSecurityMiddleware();

            // Setup monitoring middleware
            this.setupMonitoringMiddleware();

            // Setup routing middleware
            await this.setupRoutingMiddleware();

            // Setup API routes
            await this.setupRoutes();

            // Setup proxy routes for backend services
            await this.setupProxyRoutes();

            // Setup error handling
            this.setupErrorHandling();

            // Generate API documentation
            await this.setupApiDocumentation();

            this.isInitialized = true;
            this.logger.info('Gateway Application initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Gateway Application', error);
            throw error;
        }
    }

    /**
     * Initializes policy engines for security, routing, and caching
     * @private
     * @async
     */
    async initializePolicies() {
        this.securityPolicy = new SecurityPolicyEngine(
            this.config.get('policies.security'),
            this.logger
        );
        await this.securityPolicy.initialize();

        this.routingPolicy = new RoutingPolicyEngine(
            this.config.get('policies.routing'),
            this.serviceRegistry,
            this.logger
        );
        await this.routingPolicy.initialize();

        this.cachePolicy = new CachePolicyEngine(
            this.config.get('policies.cache'),
            this.cacheManager,
            this.logger
        );
        await this.cachePolicy.initialize();

        this.logger.info('Policy engines initialized');
    }

    /**
     * Configures Express application settings
     * @private
     */
    configureExpressSettings() {
        // Trust proxy settings for accurate IP addresses
        this.app.set('trust proxy', this.config.get('server.trustProxy') || true);
        
        // Disable X-Powered-By header for security
        this.app.disable('x-powered-by');
        
        // Set strict routing and case sensitivity
        this.app.set('strict routing', true);
        this.app.set('case sensitive routing', true);
        
        // Configure view engine if needed
        this.app.set('view engine', 'ejs');
        
        // Set request size limits
        this.app.set('json spaces', 2);
        
        this.logger.info('Express settings configured');
    }

    /**
     * Sets up global middleware for all requests
     * @private
     * @async
     */
    async setupGlobalMiddleware() {
        // Add request ID for tracing
        this.app.use((req, res, next) => {
            req.id = req.headers['x-request-id'] || uuidv4();
            req.startTime = Date.now();
            res.setHeader('X-Request-ID', req.id);
            next();
        });

        // Add distributed tracing
        this.app.use((req, res, next) => {
            const span = this.traceManager.startSpan('gateway.request', {
                'http.method': req.method,
                'http.url': req.url,
                'http.target': req.originalUrl,
                'request.id': req.id
            });
            req.span = span;
            
            res.on('finish', () => {
                span.setAttributes({
                    'http.status_code': res.statusCode,
                    'response.time': Date.now() - req.startTime
                });
                span.end();
            });
            
            next();
        });

        // Parse JSON bodies
        this.app.use(express.json({
            limit: this.config.get('server.bodyLimit') || '10mb',
            strict: true
        }));

        // Parse URL-encoded bodies
        this.app.use(express.urlencoded({
            extended: true,
            limit: this.config.get('server.bodyLimit') || '10mb'
        }));

        // Enable compression
        this.app.use(compression({
            level: this.config.get('server.compressionLevel') || 6,
            threshold: 1024,
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            }
        }));

        this.logger.info('Global middleware configured');
    }

    /**
     * Sets up security middleware
     * @private
     * @async
     */
    async setupSecurityMiddleware() {
        // Configure Helmet for security headers
        const helmetConfig = this.config.get('security.helmet') || {};
        this.app.use(helmet({
            contentSecurityPolicy: helmetConfig.contentSecurityPolicy || {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        // Configure CORS
        const corsConfig = this.config.get('security.cors') || {};
        this.app.use(cors({
            origin: corsConfig.origin || false,
            credentials: corsConfig.credentials || true,
            methods: corsConfig.methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: corsConfig.allowedHeaders || ['Content-Type', 'Authorization', 'X-Request-ID'],
            exposedHeaders: corsConfig.exposedHeaders || ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
            maxAge: corsConfig.maxAge || 86400
        }));

        // Initialize and apply gateway authentication
        this.gatewayAuth = new GatewayAuthMiddleware(
            this.config.get('auth'),
            this.securityPolicy,
            this.logger
        );
        await this.gatewayAuth.initialize();

        // Initialize and apply rate limiting
        this.rateLimiter = new RateLimitingMiddleware(
            this.config.get('rateLimiting'),
            this.cacheManager,
            this.metricsCollector,
            this.logger
        );
        await this.rateLimiter.initialize();

        // Apply security policy enforcement
        this.app.use(async (req, res, next) => {
            try {
                const policyResult = await this.securityPolicy.evaluate(req);
                if (!policyResult.allowed) {
                    return res.status(403).json({
                        error: 'Security policy violation',
                        message: policyResult.reason,
                        requestId: req.id
                    });
                }
                req.securityContext = policyResult.context;
                next();
            } catch (error) {
                this.logger.error('Security policy evaluation failed', error);
                next(error);
            }
        });

        this.logger.info('Security middleware configured');
    }

    /**
     * Sets up monitoring and metrics middleware
     * @private
     */
    setupMonitoringMiddleware() {
        // Request metrics
        this.app.use((req, res, next) => {
            const labels = {
                method: req.method,
                path: req.route?.path || req.path,
                service: req.headers['x-service-name'] || 'unknown'
            };

            // Increment request counter
            this.metricsCollector.incrementCounter('gateway_requests_total', labels);

            // Track response metrics
            res.on('finish', () => {
                const duration = Date.now() - req.startTime;
                
                // Record response time histogram
                this.metricsCollector.recordHistogram('gateway_request_duration_ms', duration, {
                    ...labels,
                    status: res.statusCode
                });

                // Track status codes
                this.metricsCollector.incrementCounter('gateway_responses_total', {
                    ...labels,
                    status: res.statusCode,
                    status_class: `${Math.floor(res.statusCode / 100)}xx`
                });

                // Log slow requests
                if (duration > (this.config.get('monitoring.slowRequestThreshold') || 5000)) {
                    this.logger.warn('Slow request detected', {
                        requestId: req.id,
                        method: req.method,
                        path: req.path,
                        duration,
                        status: res.statusCode
                    });
                }
            });

            next();
        });

        // Track active connections
        let activeConnections = 0;
        this.app.use((req, res, next) => {
            activeConnections++;
            this.metricsCollector.registerGauge('gateway_active_connections', activeConnections);

            res.on('finish', () => {
                activeConnections--;
                this.metricsCollector.registerGauge('gateway_active_connections', activeConnections);
            });

            next();
        });

        this.logger.info('Monitoring middleware configured');
    }

    /**
     * Sets up request routing middleware
     * @private
     * @async
     */
    async setupRoutingMiddleware() {
        // Initialize request router
        this.requestRouter = new RequestRoutingMiddleware(
            this.routingPolicy,
            this.serviceRegistry,
            this.circuitBreakerManager,
            this.logger
        );
        await this.requestRouter.initialize();

        // Initialize response aggregator for composite requests
        this.responseAggregator = new ResponseAggregationMiddleware(
            this.config.get('aggregation'),
            this.logger
        );
        await this.responseAggregator.initialize();

        // Apply tenant detection for multi-tenant routing
        this.app.use((req, res, next) => {
            // Extract tenant from subdomain or header
            const host = req.get('host');
            const tenantHeader = req.get('X-Tenant-ID');
            
            if (tenantHeader) {
                req.tenantId = tenantHeader;
            } else if (host) {
                const subdomain = host.split('.')[0];
                if (subdomain && subdomain !== 'www') {
                    req.tenantId = subdomain;
                }
            }

            if (req.tenantId) {
                req.headers['x-tenant-id'] = req.tenantId;
            }

            next();
        });

        this.logger.info('Routing middleware configured');
    }

    /**
     * Sets up API routes
     * @private
     * @async
     */
    async setupRoutes() {
        // Initialize health routes (no auth required)
        this.healthRoutes = new HealthRoutesManager(
            this.healthMonitor,
            this.metricsCollector,
            this.logger
        );
        await this.healthRoutes.initialize();
        this.app.use('/health', this.healthRoutes.getRouter());

        // Initialize gateway management routes
        this.gatewayRoutes = new GatewayRoutesManager(
            this.config,
            this.serviceRegistry,
            this.securityPolicy,
            this.logger
        );
        await this.gatewayRoutes.initialize();
        this.app.use('/gateway', 
            this.gatewayAuth.authenticate(),
            this.gatewayAuth.authorize(['admin', 'gateway-admin']),
            this.gatewayRoutes.getRouter()
        );

        // Initialize proxy routes manager
        this.proxyRoutes = new ProxyRoutesManager(
            this.config,
            this.serviceRegistry,
            this.requestRouter,
            this.logger
        );
        await this.proxyRoutes.initialize();

        this.logger.info('API routes configured');
    }

    /**
     * Sets up proxy routes for backend services
     * @private
     * @async
     */
    async setupProxyRoutes() {
        const services = await this.serviceRegistry.getAllServices();
        
        for (const service of services) {
            const proxyConfig = {
                target: service.url,
                changeOrigin: true,
                ws: service.supportsWebSocket || false,
                pathRewrite: service.pathRewrite || {},
                onProxyReq: this.handleProxyRequest.bind(this),
                onProxyRes: this.handleProxyResponse.bind(this),
                onError: this.handleProxyError.bind(this),
                logLevel: 'warn',
                timeout: service.timeout || 30000,
                proxyTimeout: service.proxyTimeout || 30000
            };

            // Apply circuit breaker
            const circuitBreaker = this.circuitBreakerManager.getBreaker(service.name);
            
            const proxyMiddleware = createProxyMiddleware(proxyConfig);
            const wrappedProxy = async (req, res, next) => {
                try {
                    await circuitBreaker.fire(() => {
                        return new Promise((resolve, reject) => {
                            const originalEnd = res.end;
                            res.end = function(...args) {
                                originalEnd.apply(res, args);
                                if (res.statusCode >= 500) {
                                    reject(new Error(`Service error: ${res.statusCode}`));
                                } else {
                                    resolve();
                                }
                            };
                            proxyMiddleware(req, res, (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        });
                    });
                } catch (error) {
                    if (error.message.includes('Circuit breaker is OPEN')) {
                        res.status(503).json({
                            error: 'Service temporarily unavailable',
                            service: service.name,
                            requestId: req.id
                        });
                    } else {
                        next(error);
                    }
                }
            };

            // Store proxy instance for cleanup
            this.proxyInstances.set(service.name, wrappedProxy);

            // Apply authentication based on service configuration
            if (service.requiresAuth) {
                this.app.use(
                    service.path,
                    this.gatewayAuth.authenticate(),
                    this.rateLimiter.apply(service.rateLimit),
                    wrappedProxy
                );
            } else {
                this.app.use(
                    service.path,
                    this.rateLimiter.apply(service.rateLimit),
                    wrappedProxy
                );
            }

            this.logger.info(`Proxy route configured for service: ${service.name}`, {
                path: service.path,
                target: service.url
            });
        }
    }

    /**
     * Handles proxy request modification
     * @private
     */
    handleProxyRequest(proxyReq, req, res) {
        // Add gateway headers
        proxyReq.setHeader('X-Gateway-Request-ID', req.id);
        proxyReq.setHeader('X-Gateway-Time', new Date().toISOString());
        proxyReq.setHeader('X-Original-IP', req.ip);
        
        // Add tenant context if present
        if (req.tenantId) {
            proxyReq.setHeader('X-Tenant-ID', req.tenantId);
        }

        // Add trace context
        if (req.span) {
            const traceContext = this.traceManager.getTraceContext(req.span);
            proxyReq.setHeader('X-Trace-ID', traceContext.traceId);
            proxyReq.setHeader('X-Span-ID', traceContext.spanId);
        }

        // Log proxy request
        this.logger.debug('Proxying request', {
            requestId: req.id,
            method: req.method,
            path: req.path,
            target: proxyReq.getHeader('host')
        });
    }

    /**
     * Handles proxy response modification
     * @private
     */
    handleProxyResponse(proxyRes, req, res) {
        // Add response headers
        proxyRes.headers['X-Gateway-Response-Time'] = Date.now() - req.startTime;
        
        // Cache response if applicable
        if (req.method === 'GET' && proxyRes.statusCode === 200) {
            const cacheKey = this.cachePolicy.generateKey(req);
            const cacheTTL = this.cachePolicy.getTTL(req.path);
            
            if (cacheTTL > 0) {
                let responseData = '';
                proxyRes.on('data', (chunk) => {
                    responseData += chunk;
                });
                proxyRes.on('end', () => {
                    this.cacheManager.set(cacheKey, responseData, cacheTTL);
                });
            }
        }

        // Log proxy response
        this.logger.debug('Proxy response received', {
            requestId: req.id,
            statusCode: proxyRes.statusCode,
            responseTime: Date.now() - req.startTime
        });
    }

    /**
     * Handles proxy errors
     * @private
     */
    handleProxyError(err, req, res) {
        this.logger.error('Proxy error', {
            requestId: req.id,
            error: err.message,
            code: err.code,
            path: req.path
        });

        // Increment error metrics
        this.metricsCollector.incrementCounter('gateway_proxy_errors_total', {
            path: req.path,
            error_code: err.code
        });

        // Send error response
        if (!res.headersSent) {
            res.status(502).json({
                error: 'Bad Gateway',
                message: 'Unable to reach backend service',
                requestId: req.id
            });
        }
    }

    /**
     * Sets up API documentation
     * @private
     * @async
     */
    async setupApiDocumentation() {
        try {
            // Generate OpenAPI specification
            const openApiSpec = await this.generateOpenApiSpec();
            
            // Serve Swagger UI
            this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
                customCss: '.swagger-ui .topbar { display: none }',
                customSiteTitle: 'InsightSerenity API Gateway Documentation'
            }));

            // Serve OpenAPI spec as JSON
            this.app.get('/openapi.json', (req, res) => {
                res.json(openApiSpec);
            });

            this.logger.info('API documentation configured at /api-docs');
        } catch (error) {
            this.logger.error('Failed to setup API documentation', error);
        }
    }

    /**
     * Generates OpenAPI specification
     * @private
     * @async
     * @returns {Object} OpenAPI specification
     */
    async generateOpenApiSpec() {
        const services = await this.serviceRegistry.getAllServices();
        
        return {
            openapi: '3.0.0',
            info: {
                title: 'InsightSerenity API Gateway',
                version: '1.0.0',
                description: 'Enterprise API Gateway for InsightSerenity Platform',
                contact: {
                    name: 'API Support',
                    email: 'api-support@insightserenity.com'
                }
            },
            servers: [
                {
                    url: this.config.get('server.publicUrl') || 'http://localhost:3000',
                    description: 'API Gateway'
                }
            ],
            paths: this.generateApiPaths(services),
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    },
                    apiKey: {
                        type: 'apiKey',
                        in: 'header',
                        name: 'X-API-Key'
                    }
                }
            },
            security: [
                { bearerAuth: [] }
            ]
        };
    }

    /**
     * Generates API paths for OpenAPI spec
     * @private
     * @param {Array} services - List of services
     * @returns {Object} API paths
     */
    generateApiPaths(services) {
        const paths = {};
        
        // Add health endpoints
        paths['/health'] = {
            get: {
                summary: 'Health check',
                tags: ['Health'],
                responses: {
                    '200': {
                        description: 'Service is healthy'
                    }
                }
            }
        };

        // Add service endpoints
        services.forEach(service => {
            if (service.endpoints) {
                service.endpoints.forEach(endpoint => {
                    const path = `${service.path}${endpoint.path}`;
                    if (!paths[path]) {
                        paths[path] = {};
                    }
                    paths[path][endpoint.method.toLowerCase()] = {
                        summary: endpoint.summary,
                        description: endpoint.description,
                        tags: [service.name],
                        parameters: endpoint.parameters,
                        requestBody: endpoint.requestBody,
                        responses: endpoint.responses
                    };
                });
            }
        });

        return paths;
    }

    /**
     * Sets up error handling middleware
     * @private
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: 'The requested resource was not found',
                path: req.path,
                requestId: req.id
            });
        });

        // Global error handler
        this.app.use((err, req, res, next) => {
            this.logger.error('Unhandled error', {
                requestId: req.id,
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method
            });

            // Increment error metrics
            this.metricsCollector.incrementCounter('gateway_errors_total', {
                type: err.name || 'UnknownError'
            });

            // Send error response
            const statusCode = err.statusCode || 500;
            const message = process.env.NODE_ENV === 'production' 
                ? 'Internal Server Error' 
                : err.message;

            res.status(statusCode).json({
                error: err.name || 'Error',
                message,
                requestId: req.id,
                ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
            });
        });

        this.logger.info('Error handling configured');
    }

    /**
     * Returns the Express application instance
     * @returns {express.Application} Express app instance
     */
    getExpressApp() {
        return this.app;
    }

    /**
     * Performs cleanup operations
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            this.logger.info('Cleaning up Gateway Application');

            // Cleanup proxy instances
            this.proxyInstances.clear();

            // Cleanup middleware
            if (this.gatewayAuth) await this.gatewayAuth.cleanup();
            if (this.rateLimiter) await this.rateLimiter.cleanup();
            if (this.requestRouter) await this.requestRouter.cleanup();
            if (this.responseAggregator) await this.responseAggregator.cleanup();

            // Cleanup routes
            if (this.gatewayRoutes) await this.gatewayRoutes.cleanup();
            if (this.proxyRoutes) await this.proxyRoutes.cleanup();
            if (this.healthRoutes) await this.healthRoutes.cleanup();

            // Cleanup policies
            if (this.securityPolicy) await this.securityPolicy.cleanup();
            if (this.routingPolicy) await this.routingPolicy.cleanup();
            if (this.cachePolicy) await this.cachePolicy.cleanup();

            this.logger.info('Gateway Application cleanup completed');
        } catch (error) {
            this.logger.error('Error during application cleanup', error);
            throw error;
        }
    }
}

module.exports = { GatewayApplication };