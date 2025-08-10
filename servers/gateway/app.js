/**
 * Gateway Application
 * Core Express application with middleware and routing configuration
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const responseTime = require('response-time');
const { v4: uuidv4 } = require('uuid');

// Middleware imports
const { SecurityMiddleware } = require('./middleware/security-middleware');
const { AuthenticationMiddleware } = require('./middleware/authentication-middleware');
const { RateLimitMiddleware } = require('./middleware/rate-limit-middleware');
const { TenantMiddleware } = require('./middleware/tenant-middleware');
const { RequestTransformMiddleware } = require('./middleware/request-transform-middleware');
const { ResponseTransformMiddleware } = require('./middleware/response-transform-middleware');
const { LoggingMiddleware } = require('./middleware/logging-middleware');
const { MetricsMiddleware } = require('./middleware/metrics-middleware');
const { TracingMiddleware } = require('./middleware/tracing-middleware');
const { CacheMiddleware } = require('./middleware/cache-middleware');
const { CircuitBreakerMiddleware } = require('./middleware/circuit-breaker-middleware');
const { ErrorHandlerMiddleware } = require('./middleware/error-handler-middleware');
const { ValidationMiddleware } = require('./middleware/validation-middleware');
const { CompressionMiddleware } = require('./middleware/compression-middleware');
const { WebSocketProxy } = require('./middleware/websocket-proxy');

// Router imports
const { ProxyRouter } = require('./routes/proxy-router');
const { HealthRouter } = require('./routes/health-router');
const { MetricsRouter } = require('./routes/metrics-router');
const { DocumentationRouter } = require('./routes/documentation-router');
const { AdminRouter } = require('./routes/admin-router');

/**
 * Gateway Application Class
 */
class GatewayApplication {
    constructor(dependencies) {
        this.config = dependencies.config;
        this.logger = dependencies.logger;
        this.serviceRegistry = dependencies.serviceRegistry;
        this.healthMonitor = dependencies.healthMonitor;
        this.metricsCollector = dependencies.metricsCollector;
        this.traceManager = dependencies.traceManager;
        this.cacheManager = dependencies.cacheManager;
        
        this.app = express();
        this.middleware = {};
        this.routers = {};
        this.wsProxy = null;
    }

    /**
     * Initialize the application
     */
    async initialize() {
        this.logger.info('Initializing Gateway Application');
        
        // Set Express configuration
        this.configureExpress();
        
        // Initialize middleware
        await this.initializeMiddleware();
        
        // Setup middleware pipeline
        this.setupMiddlewarePipeline();
        
        // Initialize routers
        await this.initializeRouters();
        
        // Setup routes
        this.setupRoutes();
        
        // Setup error handling
        this.setupErrorHandling();
        
        // Initialize WebSocket proxy if enabled
        if (this.config.get('websocket.enabled')) {
            await this.initializeWebSocketProxy();
        }
        
        this.logger.info('Gateway Application Initialized Successfully');
    }

    /**
     * Configure Express settings
     */
    configureExpress() {
        // Trust proxy settings
        this.app.set('trust proxy', this.config.get('server.trustProxy', true));
        
        // Disable X-Powered-By header
        this.app.disable('x-powered-by');
        
        // Set view engine if needed
        this.app.set('view engine', 'ejs');
        
        // Set strict routing
        this.app.set('strict routing', true);
        
        // Set case sensitive routing
        this.app.set('case sensitive routing', true);
        
        // Set query parser
        this.app.set('query parser', 'extended');
    }

    /**
     * Initialize all middleware instances
     */
    async initializeMiddleware() {
        this.logger.info('Initializing Middleware Components');
        
        // Security middleware
        this.middleware.security = new SecurityMiddleware(
            this.config.get('security')
        );
        
        // Authentication middleware
        this.middleware.authentication = new AuthenticationMiddleware(
            this.config.get('authentication'),
            this.serviceRegistry
        );
        
        // Rate limiting middleware
        this.middleware.rateLimit = new RateLimitMiddleware(
            this.config.get('rateLimit'),
            this.cacheManager
        );
        
        // Tenant detection middleware
        this.middleware.tenant = new TenantMiddleware(
            this.config.get('multiTenant'),
            this.serviceRegistry
        );
        
        // Request transformation middleware
        this.middleware.requestTransform = new RequestTransformMiddleware(
            this.config.get('transformation.request')
        );
        
        // Response transformation middleware
        this.middleware.responseTransform = new ResponseTransformMiddleware(
            this.config.get('transformation.response')
        );
        
        // Logging middleware
        this.middleware.logging = new LoggingMiddleware(
            this.logger,
            this.config.get('logging')
        );
        
        // Metrics middleware
        this.middleware.metrics = new MetricsMiddleware(
            this.metricsCollector,
            this.config.get('metrics')
        );
        
        // Tracing middleware
        this.middleware.tracing = new TracingMiddleware(
            this.traceManager,
            this.config.get('tracing')
        );
        
        // Cache middleware
        this.middleware.cache = new CacheMiddleware(
            this.cacheManager,
            this.config.get('cache')
        );
        
        // Circuit breaker middleware
        this.middleware.circuitBreaker = new CircuitBreakerMiddleware(
            this.config.get('circuitBreaker'),
            this.metricsCollector
        );
        
        // Validation middleware
        this.middleware.validation = new ValidationMiddleware(
            this.config.get('validation')
        );
        
        // Compression middleware
        this.middleware.compression = new CompressionMiddleware(
            this.config.get('compression')
        );
        
        // Error handler middleware
        this.middleware.errorHandler = new ErrorHandlerMiddleware(
            this.logger,
            this.config.get('errorHandling')
        );
        
        // Initialize all middleware
        for (const [name, middleware] of Object.entries(this.middleware)) {
            if (middleware.initialize) {
                await middleware.initialize();
                this.logger.debug(`Middleware initialized: ${name}`);
            }
        }
    }

    /**
     * Setup middleware pipeline
     */
    setupMiddlewarePipeline() {
        this.logger.info('Setting up Middleware Pipeline');
        
        // Add request ID to every request
        this.app.use((req, res, next) => {
            req.id = req.headers['x-request-id'] || uuidv4();
            res.setHeader('X-Request-ID', req.id);
            next();
        });
        
        // Response time tracking
        this.app.use(responseTime());
        
        // Security headers
        this.app.use(helmet(this.config.get('security.helmet')));
        
        // CORS configuration
        this.app.use(cors(this.config.get('security.cors')));
        
        // Compression
        this.app.use(compression(this.config.get('compression')));
        
        // Body parsing
        this.app.use(bodyParser.json({
            limit: this.config.get('server.bodyLimit', '10mb'),
            strict: true
        }));
        
        this.app.use(bodyParser.urlencoded({
            extended: true,
            limit: this.config.get('server.bodyLimit', '10mb')
        }));
        
        // Cookie parsing
        this.app.use(cookieParser(this.config.get('security.cookieSecret')));
        
        // Method override
        this.app.use(methodOverride('X-HTTP-Method-Override'));
        
        // Tracing middleware (must be early in pipeline)
        this.app.use(this.middleware.tracing.getMiddleware());
        
        // Logging middleware
        this.app.use(this.middleware.logging.getMiddleware());
        
        // Metrics collection
        this.app.use(this.middleware.metrics.getMiddleware());
        
        // Security middleware
        this.app.use(this.middleware.security.getMiddleware());
        
        // Rate limiting (before authentication)
        this.app.use(this.middleware.rateLimit.getMiddleware());
        
        // Tenant detection
        this.app.use(this.middleware.tenant.getMiddleware());
        
        // Request validation
        this.app.use(this.middleware.validation.getMiddleware());
        
        // Request transformation
        this.app.use(this.middleware.requestTransform.getMiddleware());
    }

    /**
     * Initialize routers
     */
    async initializeRouters() {
        this.logger.info('Initializing Routers');
        
        // Health check router
        this.routers.health = new HealthRouter(
            this.healthMonitor,
            this.config.get('healthCheck')
        );
        
        // Metrics router
        this.routers.metrics = new MetricsRouter(
            this.metricsCollector,
            this.config.get('metrics')
        );
        
        // Documentation router
        this.routers.documentation = new DocumentationRouter(
            this.config.get('documentation'),
            this.serviceRegistry
        );
        
        // Admin router
        this.routers.admin = new AdminRouter(
            this.config.get('admin'),
            this.serviceRegistry,
            this.healthMonitor,
            this.metricsCollector
        );
        
        // Main proxy router
        this.routers.proxy = new ProxyRouter({
            config: this.config,
            serviceRegistry: this.serviceRegistry,
            circuitBreaker: this.middleware.circuitBreaker,
            cache: this.middleware.cache,
            logger: this.logger,
            metricsCollector: this.metricsCollector
        });
        
        // Initialize all routers
        for (const [name, router] of Object.entries(this.routers)) {
            if (router.initialize) {
                await router.initialize();
                this.logger.debug(`Router initialized: ${name}`);
            }
        }
    }

    /**
     * Setup application routes
     */
    setupRoutes() {
        this.logger.info('Setting up Routes');
        
        // Health and metrics routes (no authentication required)
        this.app.use('/health', this.routers.health.getRouter());
        this.app.use('/metrics', this.routers.metrics.getRouter());
        
        // Documentation route (configurable authentication)
        if (this.config.get('documentation.enabled')) {
            this.app.use(
                '/docs',
                this.config.get('documentation.requireAuth') 
                    ? this.middleware.authentication.getMiddleware()
                    : (req, res, next) => next(),
                this.routers.documentation.getRouter()
            );
        }
        
        // Admin routes (always require authentication)
        if (this.config.get('admin.enabled')) {
            this.app.use(
                '/admin',
                this.middleware.authentication.getAdminMiddleware(),
                this.routers.admin.getRouter()
            );
        }
        
        // Authentication middleware for protected routes
        this.app.use(this.middleware.authentication.getMiddleware());
        
        // Circuit breaker middleware
        this.app.use(this.middleware.circuitBreaker.getMiddleware());
        
        // Cache middleware
        this.app.use(this.middleware.cache.getMiddleware());
        
        // Main proxy routes
        this.app.use('/', this.routers.proxy.getRouter());
        
        // Response transformation middleware
        this.app.use(this.middleware.responseTransform.getMiddleware());
        
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: 'The requested resource was not found',
                path: req.path,
                method: req.method,
                requestId: req.id
            });
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // Error handler middleware (must be last)
        this.app.use(this.middleware.errorHandler.getMiddleware());
        
        // Final catch-all error handler
        this.app.use((err, req, res, next) => {
            // Log the error
            this.logger.error('Unhandled error in gateway', {
                error: err.message,
                stack: err.stack,
                requestId: req.id,
                path: req.path,
                method: req.method
            });
            
            // Send error response
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: process.env.NODE_ENV === 'production' 
                        ? 'An internal error occurred'
                        : err.message,
                    requestId: req.id
                });
            }
        });
    }

    /**
     * Initialize WebSocket proxy
     */
    async initializeWebSocketProxy() {
        this.logger.info('Initializing WebSocket Proxy');
        
        this.wsProxy = new WebSocketProxy({
            config: this.config.get('websocket'),
            serviceRegistry: this.serviceRegistry,
            logger: this.logger,
            authentication: this.middleware.authentication
        });
        
        await this.wsProxy.initialize();
    }

    /**
     * Attach WebSocket proxy to server
     */
    attachWebSocketProxy(server) {
        if (this.wsProxy) {
            this.wsProxy.attach(server);
            this.logger.info('WebSocket Proxy attached to server');
        }
    }

    /**
     * Get Express application instance
     */
    getExpressApp() {
        return this.app;
    }

    /**
     * Get middleware instances
     */
    getMiddleware() {
        return this.middleware;
    }

    /**
     * Get router instances
     */
    getRouters() {
        return this.routers;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.logger.info('Cleaning up Gateway Application');
        
        // Cleanup WebSocket proxy
        if (this.wsProxy) {
            await this.wsProxy.cleanup();
        }
        
        // Cleanup routers
        for (const [name, router] of Object.entries(this.routers)) {
            if (router.cleanup) {
                await router.cleanup();
                this.logger.debug(`Router cleaned up: ${name}`);
            }
        }
        
        // Cleanup middleware
        for (const [name, middleware] of Object.entries(this.middleware)) {
            if (middleware.cleanup) {
                await middleware.cleanup();
                this.logger.debug(`Middleware cleaned up: ${name}`);
            }
        }
        
        this.logger.info('Gateway Application Cleanup Completed');
    }
}

module.exports = { GatewayApplication };