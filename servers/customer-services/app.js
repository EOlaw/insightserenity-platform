/**
 * @fileoverview Customer Services Express Application
 * @module servers/customer-services/app
 * @requires express
 * @requires cors
 * @requires helmet
 * @requires compression
 * @requires express-rate-limit
 * @requires passport
 * @requires winston
 * @requires swagger-ui-express
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const { filterXSS } = require('xss');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const winston = require('winston');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');

// Import shared modules
const database = require('../../shared/lib/database');
const auth = require('../../shared/lib/auth');

// Import middleware
const databaseMiddleware = require('./middleware/database-middleware');
const errorHandler = require('./middleware/error-handler');
const notFoundHandler = require('./middleware/not-found-handler');
const tenantResolver = require('./middleware/tenant-resolver');
const requestLogger = require('./middleware/request-logger');
const apiVersioning = require('./middleware/api-versioning');

// Import route modules - Core Business
const authRoutes = require('./modules/core-business/authentication/routes'); // NEW: Authentication routes
const userRoutes = require('./modules/core-business/user-management/routes/user-routes');
const clientManagementRoutes = require('./modules/core-business/client-management/routes/');
const consultantManagementRoutes = require('./modules/core-business/consultant-management/routes/');
const consultationManagementRoutes = require('./modules/core-business/consultation-management/routes');
const projectRoutes = require('./modules/core-business/project-management/routes/project.routes');

// Import route modules - Hosted Organizations
const organizationRoutes = require('./modules/hosted-organizations/organization-management/routes/organization.routes');
const subscriptionRoutes = require('./modules/hosted-organizations/subscription-management/routes/subscription.routes');
const tenantRoutes = require('./modules/hosted-organizations/tenant-management/routes/tenant.routes');

// Import route modules - Recruitment Services
const jobRoutes = require('./modules/recruitment-services/jobs/routes/job.routes');
const candidateRoutes = require('./modules/recruitment-services/candidates/routes/candidate.routes');
const applicationRoutes = require('./modules/recruitment-services/applications/routes/application.routes');
const partnershipRoutes = require('./modules/recruitment-services/partnerships/routes/partnership.routes');

// Import route modules - Content Management Systems
// (e.g., blog, knowledge base) can be added here as needed
// const blogRoutes = require('./modules/content/blog/routes/blog-routes');

/**
 * @class CustomerServicesApp
 * @description Main application class for Customer Services
 */
class CustomerServicesApp {
    /**
     * Creates an instance of CustomerServicesApp
     * @param {Object} config - Application configuration
     */
    constructor(config = {}) {
        this.config = this._loadConfiguration(config);
        this.app = express();
        this.logger = this._setupLogger();
        this.database = null;
        this.isInitialized = false;

        // Application metadata
        this.metadata = {
            name: 'Customer Services',
            version: '1.0.0',
            description: 'Multi-tenant customer services platform',
            author: 'InsightSerenity Team',
            environment: process.env.NODE_ENV || 'development',
            startTime: new Date()
        };

        // Module registry
        this.modules = {
            coreBusiness: ['authentication', 'user-management', 'client-management', 'consultant-management', 'project-management'],
            hostedOrganizations: ['organization-management', 'subscription-management', 'tenant-management'],
            recruitmentServices: ['jobs', 'candidates', 'applications', 'partnerships']
        };

        // Metrics tracking
        this.metrics = {
            requests: {
                total: 0,
                success: 0,
                failed: 0,
                byModule: new Map(),
                byTenant: new Map()
            },
            performance: {
                avgResponseTime: 0,
                maxResponseTime: 0,
                minResponseTime: Infinity
            },
            health: {
                status: 'initializing',
                lastCheck: null,
                uptime: 0
            }
        };

        // Initialize on creation
        this._initialize();
    }

    /**
     * Load and merge configuration
     * @private
     */
    _loadConfiguration(userConfig) {
        const defaultConfig = {
            // Server configuration
            port: parseInt(process.env.PORT) || 3001,
            host: process.env.HOST || '0.0.0.0',
            environment: process.env.NODE_ENV || 'development',

            // Database configuration
            database: {
                uri: process.env.DATABASE_CUSTOMER_URI || process.env.DATABASE_URI,
                options: {
                    maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
                    minPoolSize: 2,
                    serverSelectionTimeoutMS: 30000,
                    socketTimeoutMS: 45000
                }
            },

            // Session configuration
            session: {
                secret: process.env.SESSION_SECRET || 'customer-services-secret',
                resave: false,
                saveUninitialized: false,
                cookie: {
                    secure: process.env.NODE_ENV === 'production',
                    httpOnly: true,
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                }
            },

            // Security configuration
            security: {
                helmet: {
                    contentSecurityPolicy: process.env.NODE_ENV === 'production',
                    crossOriginEmbedderPolicy: false
                },
                cors: {
                    origin: process.env.CORS_ORIGIN
                        ? process.env.CORS_ORIGIN.split(',')
                        : [
                            'http://localhost:3000',
                            'http://localhost:3001',
                            'http://localhost:4000',
                            'http://127.0.0.1:3000',
                            'http://127.0.0.1:3001',
                            'http://127.0.0.1:4000'
                        ],
                    credentials: true,
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Version'],
                    exposedHeaders: ['Authorization'],
                    maxAge: 86400
                },
                rateLimit: {
                    windowMs: 15 * 60 * 1000,
                    max: process.env.RATE_LIMIT || 100,
                    message: 'Too many requests from this IP',
                    // standardHeaders: true,
                    // legacyHeaders: false,
                    // validate: {
                    //     trustProxy: false  // This fixes the trust proxy validation error
                    // }
                }
            },

            // JWT configuration
            jwt: {
                secret: process.env.JWT_SECRET || 'customer-jwt-secret',
                expiresIn: process.env.JWT_EXPIRES_IN || '7d'
            },

            // Multi-tenant configuration
            multiTenant: {
                enabled: process.env.ENABLE_MULTI_TENANCY !== 'false',
                headerName: 'X-Tenant-ID',
                defaultTenant: 'default',
                isolation: 'database' // 'database', 'schema', or 'collection'
            },

            // API versioning
            apiVersioning: {
                enabled: true,
                defaultVersion: 'v1',
                headerName: 'X-API-Version',
                supportedVersions: ['v1', 'v2']
            },

            // Feature flags
            features: {
                authentication: true,
                authorization: true,
                multiTenancy: true,
                caching: process.env.ENABLE_CACHING !== 'false',
                monitoring: true,
                webhooks: process.env.ENABLE_WEBHOOKS === 'true',
                realtime: process.env.ENABLE_REALTIME === 'true'
            }
        };

        return { ...defaultConfig, ...userConfig };
    }

    /**
     * Setup Winston logger
     * @private
     */
    _setupLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'customer-services' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
                ...(process.env.NODE_ENV === 'production' ? [
                    new winston.transports.File({ filename: 'error.log', level: 'error' }),
                    new winston.transports.File({ filename: 'combined.log' })
                ] : [])
            ]
        });
    }

    /**
     * Initialize the application
     * @private
     */
    async _initialize() {
        try {
            this.logger.info('Initializing Customer Services application...');

            // Setup trust proxy
            if (process.env.TRUST_PROXY) {
                this.app.set('trust proxy', true);
            }

            // Initialize database
            await this._initializeDatabase();

            // Setup middleware
            this._setupMiddleware();

            // Setup authentication
            this._setupAuthentication();

            // Setup routes
            this._setupRoutes();

            // Setup error handling
            this._setupErrorHandling();

            // Setup health monitoring
            this._setupHealthMonitoring();

            this.isInitialized = true;
            this.metrics.health.status = 'healthy';

            this.logger.info('Customer Services application initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize application', { error: error.message });
            this.metrics.health.status = 'error';
            throw error;
        }
    }

    /**
     * Initialize database connection
     * @private
     */
    // async _initializeDatabase() {
    //     try {
    //         this.logger.info('Initializing database connection...');

    //         // Initialize connection manager
    //         this.database = new database.ConnectionManager({
    //             environment: this.config.environment,
    //             config: this.config.database
    //         });

    //         // Initialize database
    //         await this.database.initialize();

    //         // Setup model routing for customer services if available
    //         if (this.database && this.database.modelRouter) {
    //             if (typeof this.database.modelRouter.addRoutingRule === 'function') {
    //                 this.database.modelRouter.addRoutingRule('customer-services', 'customer');
    //             }
    //         }

    //         this.logger.info('Database initialized successfully');

    //     } catch (error) {
    //         this.logger.error('Database initialization failed', { error: error.message });
    //         // Don't throw error in development to allow server to start
    //         if (this.config.environment === 'production') {
    //             throw error;
    //         }
    //     }
    // }

    /**
     * Initialize database connection
     * @private
     */
    async _initializeDatabase() {
        try {
            this.logger.info('Initializing database connection...');

            // CRITICAL FIX: Use existing database instance instead of creating new ConnectionManager
            // The database is already initialized in server.js before app creation
            const existingDatabase = database.getInstance();

            if (!existingDatabase) {
                throw new Error('Database not initialized. Server must initialize database before creating app.');
            }

            // Verify database is ready
            if (!existingDatabase.state || !existingDatabase.state.ready) {
                throw new Error('Database instance exists but is not ready');
            }

            // Use the existing connection manager
            this.database = existingDatabase;

            this.logger.info('Database initialized successfully (using existing connection)');

        } catch (error) {
            this.logger.error('Database initialization failed', { error: error.message });
            // Don't throw error in development to allow server to start
            if (this.config.environment === 'production') {
                throw error;
            }
        }
    }

    /**
     * Setup middleware
     * @private
     */
    _setupMiddleware() {
        const app = this.app;

        // Security middleware
        app.use(helmet(this.config.security.helmet));
        app.use(cors(this.config.security.cors));

        // Request parsing
        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        app.use(cookieParser());

        // Compression
        app.use(compression());

        // MongoDB injection prevention - configured to avoid read-only property errors
        app.use((req, res, next) => {
            try {
                mongoSanitize({
                    replaceWith: '_',
                    onSanitize: ({ req, key }) => {
                        if (process.env.NODE_ENV === 'development') {
                            console.warn(`Sanitized potentially malicious key: ${key}`);
                        }
                    }
                })(req, res, next);
            } catch (error) {
                // Log the error but don't crash the request
                if (process.env.NODE_ENV === 'development') {
                    console.error('Sanitization error:', error.message);
                }
                next();
            }
        });

        // XSS protection
        app.use((req, res, next) => {
            if (req.body) {
                req.body = JSON.parse(filterXSS(JSON.stringify(req.body)));
            }
            next();
        });

        // Prevent HTTP parameter pollution
        app.use(hpp());

        // Session management
        if (this.config.features.authentication) {
            app.use(session({
                ...this.config.session,
                store: MongoStore.create({
                    mongoUrl: this.config.database.uri,
                    touchAfter: 24 * 3600 // lazy session update
                })
            }));
        }

        // Request logging
        if (process.env.NODE_ENV !== 'test') {
            app.use(morgan('combined', {
                stream: { write: message => this.logger.info(message.trim()) }
            }));
        }

        // Custom request logger with metrics
        app.use((req, res, next) => {
            const startTime = Date.now();

            res.on('finish', () => {
                const duration = Date.now() - startTime;
                this.metrics.requests.total++;

                if (res.statusCode < 400) {
                    this.metrics.requests.success++;
                } else {
                    this.metrics.requests.failed++;
                }

                // Update performance metrics
                this.metrics.performance.avgResponseTime =
                    (this.metrics.performance.avgResponseTime * (this.metrics.requests.total - 1) + duration) /
                    this.metrics.requests.total;

                this.metrics.performance.maxResponseTime = Math.max(
                    this.metrics.performance.maxResponseTime,
                    duration
                );

                this.metrics.performance.minResponseTime = Math.min(
                    this.metrics.performance.minResponseTime,
                    duration
                );
            });

            next();
        });

        // Multi-tenant resolution
        if (this.config.features.multiTenancy) {
            app.use(this._createTenantResolver());
        }

        // API versioning
        if (this.config.apiVersioning.enabled) {
            app.use(this._createApiVersioning());
        }

        // Rate limiting
        app.use('/api/', rateLimit(this.config.security.rateLimit));

        // Static files
        app.use('/public', express.static(path.join(__dirname, 'public')));
    }

    /**
     * Setup authentication
     * @private
     */
    _setupAuthentication() {
        if (!this.config.features.authentication) {
            return;
        }

        // Initialize Passport
        this.app.use(passport.initialize());
        this.app.use(passport.session());

        // Configure strategies
        auth.configureStrategies(passport, {
            jwtSecret: this.config.jwt.secret,
            jwtOptions: {
                expiresIn: this.config.jwt.expiresIn,
                audience: 'customer-services',
                issuer: 'insightserenity'
            },
            callbacks: {
                jwt: this._jwtVerifyCallback.bind(this),
                local: this._localVerifyCallback.bind(this)
            }
        });

        this.logger.info('Authentication configured');
    }

    /**
     * JWT verification callback
     * @private
     */
    async _jwtVerifyCallback(req, payload, done) {
        try {
            // Add tenant context from token
            if (payload.tenantId) {
                req.tenantId = payload.tenantId;
            }

            // Simple verification for now - can be enhanced with actual user lookup
            if (payload.id) {
                const user = {
                    id: payload.id,
                    email: payload.email,
                    tenantId: payload.tenantId,
                    isActive: true
                };

                req.user = user;
                return done(null, user);
            }

            return done(null, false);

        } catch (error) {
            return done(error, false);
        }
    }

    /**
     * Local strategy verification callback
     * @private
     */
    async _localVerifyCallback(req, email, password, done) {
        try {
            // Simple verification for now - can be enhanced with actual user authentication
            // This is a placeholder implementation
            if (email && password) {
                const user = {
                    id: 'temp-user-id',
                    email: email,
                    tenantId: req.tenantId || 'default',
                    isActive: true
                };

                req.tenantId = user.tenantId;
                return done(null, user);
            }

            return done(null, false, { message: 'Invalid credentials' });

        } catch (error) {
            return done(error, false);
        }
    }

    /**
     * Setup routes
     * @private
     */
    _setupRoutes() {
        const app = this.app;
        const apiRouter = express.Router();

        // Health check
        app.get('/health', (req, res) => {
            res.json({
                status: this.metrics.health.status,
                uptime: process.uptime(),
                timestamp: new Date(),
                service: 'customer-services',
                version: this.metadata.version,
                environment: this.config.environment
            });
        });

        // Database middleware - ensure connections are available to routes
        app.use('/api', databaseMiddleware.tenantDatabase);

        // Add health check middleware for monitoring endpoints
        app.use('/health', databaseMiddleware.databaseHealth);
        app.use('/api/metrics', databaseMiddleware.database);

        // API documentation
        if (process.env.NODE_ENV !== 'production') {
            const swaggerDocument = this._loadSwaggerDocument();
            if (swaggerDocument) {
                app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
            }
        }

        // ==================== AUTHENTICATION ROUTES ====================
        // Mount authentication routes BEFORE other protected routes
        // This ensures authentication endpoints are accessible without auth
        apiRouter.use('/auth', authRoutes);

        // ==================== CORE BUSINESS ROUTES ====================
        apiRouter.use('/users', userRoutes);
        apiRouter.use('/clients', clientManagementRoutes);
        apiRouter.use('/consultants', consultantManagementRoutes);
        apiRouter.use('/consultations', consultationManagementRoutes);
        apiRouter.use('/projects', projectRoutes);

        // ==================== HOSTED ORGANIZATIONS ROUTES ====================
        apiRouter.use('/organizations', organizationRoutes);
        apiRouter.use('/subscriptions', subscriptionRoutes);
        apiRouter.use('/tenants', tenantRoutes);

        // ==================== RECRUITMENT SERVICES ROUTES ====================
        apiRouter.use('/jobs', jobRoutes);
        apiRouter.use('/candidates', candidateRoutes);
        apiRouter.use('/applications', applicationRoutes);
        apiRouter.use('/partnerships', partnershipRoutes);

        // ==================== CONTENT MANAGEMENT ROUTES ====================
        // apiRouter.use('/blog', blogRoutes);

        // ==================== UTILITY ROUTES ====================

        // Metrics endpoint
        apiRouter.get('/metrics', this._authenticate('jwt'), (req, res) => {
            res.json({
                ...this.metrics,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date()
            });
        });

        // Module information
        apiRouter.get('/modules', (req, res) => {
            res.json({
                modules: this.modules,
                metadata: this.metadata
            });
        });

        // Mount API router
        app.use('/api/v1', apiRouter);

        // Legacy API support
        app.use('/api', apiRouter);

        this.logger.info('Routes configured (including authentication)');
    }

    /**
     * Setup error handling
     * @private
     */
    _setupErrorHandling() {
        // 404 handler
        this.app.use((req, res, next) => {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Route ${req.method} ${req.path} not found`
                }
            });
        });

        // Global error handler
        this.app.use((err, req, res, next) => {
            this.logger.error('Unhandled error', {
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method
            });

            const status = err.status || 500;
            const response = {
                success: false,
                error: {
                    code: err.code || 'INTERNAL_ERROR',
                    message: process.env.NODE_ENV === 'production'
                        ? 'An error occurred'
                        : err.message
                }
            };

            if (process.env.NODE_ENV !== 'production') {
                response.error.stack = err.stack;
            }

            res.status(status).json(response);
        });
    }

    /**
     * Setup health monitoring
     * @private
     */
    _setupHealthMonitoring() {
        // Periodic health check
        setInterval(() => {
            this._performHealthCheck();
        }, 30000); // Every 30 seconds

        // Initial health check
        this._performHealthCheck();
    }

    /**
     * Perform health check
     * @private
     */
    async _performHealthCheck() {
        try {
            const checks = {
                database: await this._checkDatabaseHealth(),
                memory: this._checkMemoryHealth(),
                uptime: process.uptime()
            };

            const isHealthy = checks.database && checks.memory;

            this.metrics.health = {
                status: isHealthy ? 'healthy' : 'degraded',
                lastCheck: new Date(),
                uptime: process.uptime(),
                checks
            };

        } catch (error) {
            this.logger.error('Health check failed', { error: error.message });
            this.metrics.health.status = 'error';
        }
    }

    /**
     * Check database health
     * @private
     */
    async _checkDatabaseHealth() {
        try {
            if (!this.database) return false;

            // Check if getStatus method exists
            if (typeof this.database.getStatus === 'function') {
                const status = this.database.getStatus();
                return status.ready && status.databases && status.databases.customer;
            }

            // Fallback to simple check
            return this.database.isInitialized || false;

        } catch (error) {
            return false;
        }
    }

    /**
     * Check memory health
     * @private
     */
    _checkMemoryHealth() {
        const usage = process.memoryUsage();
        const limit = 1024 * 1024 * 1024; // 1GB
        return usage.heapUsed < limit;
    }

    /**
     * Create tenant resolver middleware
     * @private
     */
    _createTenantResolver() {
        return (req, res, next) => {
            // Get tenant from header, query, or JWT token
            const tenantId = req.headers[this.config.multiTenant.headerName.toLowerCase()] ||
                req.query.tenantId ||
                (req.user && req.user.tenantId) ||
                this.config.multiTenant.defaultTenant;

            req.tenantId = tenantId;

            // Track tenant metrics
            if (!this.metrics.requests.byTenant.has(tenantId)) {
                this.metrics.requests.byTenant.set(tenantId, 0);
            }
            this.metrics.requests.byTenant.set(
                tenantId,
                this.metrics.requests.byTenant.get(tenantId) + 1
            );

            next();
        };
    }

    /**
     * Create API versioning middleware
     * @private
     */
    _createApiVersioning() {
        return (req, res, next) => {
            const version = req.headers[this.config.apiVersioning.headerName.toLowerCase()] ||
                req.query.apiVersion ||
                this.config.apiVersioning.defaultVersion;

            if (!this.config.apiVersioning.supportedVersions.includes(version)) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_API_VERSION',
                        message: `API version ${version} is not supported`
                    }
                });
            }

            req.apiVersion = version;
            res.setHeader('X-API-Version', version);

            next();
        };
    }

    /**
     * Authentication middleware factory
     * @private
     */
    _authenticate(strategy = 'jwt') {
        return (req, res, next) => {
            if (!this.config.features.authentication) {
                return next();
            }

            passport.authenticate(strategy, { session: false }, (err, user, info) => {
                if (err) {
                    return next(err);
                }

                if (!user) {
                    return res.status(401).json({
                        success: false,
                        error: {
                            code: 'UNAUTHORIZED',
                            message: info?.message || 'Authentication required'
                        }
                    });
                }

                req.user = user;
                next();
            })(req, res, next);
        };
    }

    /**
     * Load Swagger documentation
     * @private
     */
    _loadSwaggerDocument() {
        try {
            const swaggerPath = path.join(__dirname, 'docs', 'api-documentation.yaml');
            if (fs.existsSync(swaggerPath)) {
                return YAML.load(swaggerPath);
            }
            return null;
        } catch (error) {
            this.logger.warn('Failed to load Swagger documentation', { error: error.message });
            return null;
        }
    }

    /**
     * Get Express application instance
     * @returns {Express} Express application
     */
    getApp() {
        return this.app;
    }

    /**
     * Get application metrics
     * @returns {Object} Application metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
    }

    /**
     * Get application status
     * @returns {Object} Application status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            health: this.metrics.health,
            metadata: this.metadata,
            config: {
                environment: this.config.environment,
                features: this.config.features
            }
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.logger.info('Shutting down Customer Services application...');

        try {
            // Close database connections
            if (this.database) {
                await this.database.close();
            }

            this.logger.info('Customer Services application shut down successfully');
        } catch (error) {
            this.logger.error('Error during shutdown', { error: error.message });
            throw error;
        }
    }
}

module.exports = CustomerServicesApp;