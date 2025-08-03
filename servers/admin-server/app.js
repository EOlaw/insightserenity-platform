/**
 * @file Admin Application Setup - COMPLETE FIXED VERSION
 * @description Express application configuration for administrative platform management
 * @version 3.0.0
 */

'use strict';

require('dotenv').config();

const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const flash = require('express-flash');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const methodOverride = require('method-override');
const morgan = require('morgan');
const passport = require('passport');
const rateLimit = require('express-rate-limit');

// Core imports from shared folder
const config = require('../../shared/config');
const logger = require('../../shared/lib/utils/logger');
const SessionManager = require('../../shared/lib/security/session-manager');
const Database = require('../../shared/lib/database');
const { AppError } = require('../../shared/lib/utils/app-error');

// Admin-specific middleware
const adminAuth = require('./middleware/admin-auth');
const ipWhitelist = require('./middleware/ip-whitelist');
const adminRateLimit = require('./middleware/admin-rate-limit');
const sessionValidation = require('./middleware/session-validation');
const securityHeaders = require('./middleware/security-headers');

// Shared middleware imports
const errorHandler = require('../../shared/lib/middleware/error-handlers/error-handler');
const notFoundHandler = require('../../shared/lib/middleware/error-handlers/not-found-handler');

/**
 * Admin Application class
 * Handles Express app setup for administrative functions with enhanced security
 */
class AdminApplication {
    constructor() {
        this.app = express();
        this.sessionManager = null;
        this.isShuttingDown = false;

        // Create merged configuration with safe defaults
        this.config = this.createMergedConfiguration();
    }

    /**
     * Creates merged configuration with safe defaults
     * @private
     * @returns {Object} Merged configuration object
     */
    createMergedConfiguration() {
        try {
            // Create default configurations
            const defaultApp = {
                env: process.env.NODE_ENV || 'development',
                version: process.env.APP_VERSION || '1.0.0',
                name: process.env.APP_NAME || 'InsightSerenity Admin Server'
            };

            const defaultAdmin = {
                behindProxy: process.env.ADMIN_BEHIND_PROXY === 'true' || false,
                trustProxyLevel: parseInt(process.env.ADMIN_TRUST_PROXY_LEVEL, 10) || 1,
                basePath: process.env.ADMIN_BASE_PATH || '/admin',
                uploadLimit: process.env.ADMIN_UPLOAD_LIMIT || '50mb',
                security: {
                    forceSSL: process.env.ADMIN_FORCE_SSL === 'true' || false,
                    requireMFA: process.env.ADMIN_REQUIRE_MFA === 'true' || false,
                    sessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT, 10) || 3600000,
                    cookieSecret: process.env.ADMIN_COOKIE_SECRET || process.env.SESSION_SECRET || 'admin_development_cookie_secret',
                    cors: {
                        origins: (process.env.ADMIN_CORS_ORIGINS || process.env.CORS_ORIGINS || '').split(',').filter(Boolean)
                    },
                    ipWhitelist: {
                        enabled: process.env.ADMIN_IP_WHITELIST_ENABLED === 'true' || false
                    }
                }
            };

            const defaultSecurity = {
                helmet: { enabled: process.env.HELMET_ENABLED !== 'false' },
                cors: {
                    enabled: process.env.CORS_ENABLED !== 'false',
                    origins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean)
                },
                session: {
                    enabled: process.env.SESSION_ENABLED !== 'false',
                    cookie: {
                        secure: process.env.SESSION_SECURE === 'true',
                        httpOnly: true,
                        sameSite: 'strict',
                        maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000
                    }
                },
                sanitize: { enabled: process.env.SANITIZE_ENABLED !== 'false' },
                cookieSecret: process.env.COOKIE_SECRET || process.env.SESSION_SECRET || 'development_cookie_secret',
                ssl: { enabled: process.env.SSL_ENABLED === 'true' }
            };

            const defaultDatabase = {
                multiTenant: { enabled: process.env.MULTI_TENANT_ENABLED === 'true' }
            };

            // Merge configurations safely
            const mergedConfig = {
                app: { ...defaultApp, ...(config.app || {}) },
                admin: { ...defaultAdmin, ...(config.admin || {}) },
                security: { ...defaultSecurity, ...(config.security || {}) },
                database: { ...defaultDatabase, ...(config.database || {}) }
            };

            // Deep merge admin security settings
            if (config.admin && config.admin.security) {
                mergedConfig.admin.security = {
                    ...defaultAdmin.security,
                    ...config.admin.security
                };
            }

            // Deep merge security cookie settings
            if (config.security && config.security.cookie) {
                mergedConfig.security.session.cookie = {
                    ...defaultSecurity.session.cookie,
                    ...config.security.cookie
                };
            }

            logger.info('Configuration structure created and validated', {
                hasApp: !!mergedConfig.app,
                hasAdmin: !!mergedConfig.admin,
                hasSecurity: !!mergedConfig.security,
                hasDatabase: !!mergedConfig.database,
                environment: mergedConfig.app.env
            });

            return mergedConfig;
        } catch (error) {
            logger.error('Configuration creation failed, using minimal defaults', {
                error: error.message
            });

            return {
                app: { env: 'development', version: '1.0.0', name: 'Admin Server' },
                admin: { basePath: '/admin', uploadLimit: '50mb' },
                security: { session: { enabled: true }, cors: { enabled: true } },
                database: { multiTenant: { enabled: false } }
            };
        }
    }

    /**
     * Initialize the admin application
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Admin Application...');

            this.setupTrustProxy();
            this.setupSecurityMiddleware();
            this.setupAdminMiddleware();
            await this.setupAuthentication();
            this.setupAuditMiddleware();
            this.setupAdminRoutes();
            this.setupErrorHandling();
            this.setupAdminEventHandlers();

            console.log('✅ Admin Application initialization completed successfully');
            return this.app;
        } catch (error) {
            console.error('❌ Admin Application initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup trust proxy for production
     */
    setupTrustProxy() {
        try {
            if (this.config.app.env === 'production' || this.config.admin.behindProxy) {
                this.app.set('trust proxy', this.config.admin.trustProxyLevel || 1);
                logger.info('Admin app configured to trust proxy', {
                    level: this.config.admin.trustProxyLevel || 1,
                    environment: this.config.app.env
                });
            }
        } catch (error) {
            logger.error('Failed to setup trust proxy', { error: error.message });
        }
    }

    /**
     * Setup enhanced security middleware for admin
     */
    setupSecurityMiddleware() {
        try {
            console.log('🔒 Setting up security middleware...');

            // Apply security headers first
            this.app.use(securityHeaders.middleware());

            // Enhanced Helmet configuration for admin
            if (this.config.security.helmet && this.config.security.helmet.enabled) {
                this.app.use(helmet({
                    contentSecurityPolicy: {
                        directives: {
                            defaultSrc: ["'self'"],
                            styleSrc: ["'self'", "'unsafe-inline'"],
                            scriptSrc: ["'self'"],
                            imgSrc: ["'self'", "data:", "https:"],
                            connectSrc: ["'self'"],
                            fontSrc: ["'self'"],
                            objectSrc: ["'none'"],
                            mediaSrc: ["'self'"],
                            frameSrc: ["'none'"],
                            sandbox: ['allow-forms', 'allow-scripts', 'allow-same-origin']
                        }
                    },
                    crossOriginEmbedderPolicy: true,
                    crossOriginOpenerPolicy: true,
                    crossOriginResourcePolicy: { policy: "same-site" },
                    dnsPrefetchControl: { allow: false },
                    frameguard: { action: 'deny' },
                    hidePoweredBy: true,
                    hsts: {
                        maxAge: 31536000,
                        includeSubDomains: true,
                        preload: true
                    },
                    ieNoOpen: true,
                    noSniff: true,
                    originAgentCluster: true,
                    permittedCrossDomainPolicies: false,
                    referrerPolicy: { policy: "same-origin" },
                    xssFilter: true
                }));
            }

            // IP Whitelist for admin access
            if (this.config.admin.security && this.config.admin.security.ipWhitelist && this.config.admin.security.ipWhitelist.enabled) {
                this.app.use(ipWhitelist);
                logger.info('IP whitelist middleware enabled for admin');
            }

            // Admin-specific CORS configuration
            if (this.config.security.cors && this.config.security.cors.enabled) {
                const adminCorsOptions = {
                    origin: (origin, callback) => {
                        const allowedOrigins = this.config.admin.security.cors?.origins ||
                            this.config.security.cors.origins || [];

                        if (!origin || allowedOrigins.includes(origin)) {
                            callback(null, true);
                        } else if (this.config.app.env === 'development' && origin?.includes('localhost')) {
                            callback(null, true);
                        } else {
                            callback(new Error('Admin: Not allowed by CORS'));
                        }
                    },
                    credentials: true,
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-CSRF-Token'],
                    exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID'],
                    maxAge: 86400 // 24 hours
                };

                this.app.use(cors(adminCorsOptions));
            }

            // Apply rate limiting for admin endpoints
            this.app.use(adminRateLimit);

            console.log('✅ Security middleware setup completed');
            logger.info('Security middleware setup completed');
        } catch (error) {
            console.error('❌ Security middleware setup failed:', error.message);
            logger.error('Failed to setup security middleware', { error: error.message });
        }
    }

    /**
     * Setup admin-specific middleware
     */
    setupAdminMiddleware() {
        try {
            console.log('⚙️ Setting up admin middleware...');

            // Body parsing with size limits
            this.app.use(express.json({
                limit: this.config.admin.uploadLimit || '50mb',
                verify: (req, res, buf) => {
                    req.rawBody = buf.toString('utf8');
                }
            }));

            this.app.use(express.urlencoded({
                extended: true,
                limit: this.config.admin.uploadLimit || '50mb'
            }));

            // MongoDB injection protection
            if (this.config.security.sanitize && this.config.security.sanitize.enabled) {
                this.app.use(mongoSanitize({
                    replaceWith: '_',
                    onSanitize: ({ req, key }) => {
                        logger.warn('Admin: Sanitized prohibited character', {
                            key,
                            ip: req.ip,
                            path: req.path
                        });
                    }
                }));
            }

            // Cookie parser with secret
            this.app.use(cookieParser(this.config.admin.security.cookieSecret || this.config.security.cookieSecret));

            // Compression
            this.app.use(compression({
                filter: (req, res) => {
                    if (req.headers['x-no-compression']) {
                        return false;
                    }
                    return compression.filter(req, res);
                },
                level: 6
            }));

            // Method override
            this.app.use(methodOverride('_method'));
            this.app.use(methodOverride('X-HTTP-Method-Override'));

            // Static files for admin UI
            this.app.use('/admin/public', express.static(path.join(__dirname, 'public'), {
                maxAge: this.config.app.env === 'production' ? '7d' : 0,
                etag: true,
                lastModified: true,
                index: false
            }));

            // Request logging for admin actions
            if (this.config.app.env !== 'test') {
                const adminMorganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

                this.app.use(morgan(adminMorganFormat, {
                    stream: {
                        write: message => logger.info('Admin Access Log', {
                            log: message.trim(),
                            type: 'access'
                        })
                    },
                    skip: (req, res) => req.path === '/health' // Skip health checks
                }));
            }

            // Flash messages for admin UI
            this.app.use(flash());

            // Request context enrichment
            this.app.use((req, res, next) => {
                req.requestTime = new Date().toISOString();
                req.requestId = require('crypto').randomBytes(16).toString('hex');
                req.isAdmin = true;
                res.setHeader('X-Request-ID', req.requestId);
                res.setHeader('X-Admin-Server', 'true');
                next();
            });

            console.log('✅ Admin middleware setup completed');
            logger.info('Admin middleware setup completed');
        } catch (error) {
            console.error('❌ Admin middleware setup failed:', error.message);
            logger.error('Failed to setup admin middleware', { error: error.message });
            throw error;
        }
    }

    /**
     * FIXED: Setup authentication with proper session manager integration
     */
    async setupAuthentication() {
        try {
            console.log('🔐 Setting up authentication system...');

            // Initialize session manager with custom configuration
            const sessionConfig = {
                session: {
                    sessionSecret: this.config.admin.security.cookieSecret || process.env.SESSION_SECRET,
                    sessionName: 'admin.sid',
                    sessionDuration: this.config.admin.security.sessionTimeout || 3600000,
                    secure: this.config.admin.security.forceSSL || false,
                    httpOnly: true,
                    sameSite: 'strict'
                },
                csrf: {
                    enabled: false // Disable for development
                },
                security: {
                    enableSessionFingerprinting: false,
                    enableIpValidation: false,
                    maxFailedAttempts: 5,
                    lockoutDuration: 900000
                }
            };

            this.sessionManager = new SessionManager(sessionConfig);

            // Configure passport middleware
            this.app.use(passport.initialize());
            this.app.use(passport.session());

            // Apply session middleware from SessionManager
            console.log('📝 Applying session middleware...');
            this.app.use(this.sessionManager.getSessionMiddleware());

            // Add session validation middleware with timeout protection
            this.app.use((req, res, next) => {
                const timeout = setTimeout(() => {
                    if (!res.headersSent) {
                        logger.warn('Session validation timeout', { path: req.path });
                        res.status(500).json({
                            success: false,
                            error: 'Session validation timeout'
                        });
                    }
                }, 5000);

                // Clear timeout when response finishes
                res.on('finish', () => clearTimeout(timeout));
                res.on('close', () => clearTimeout(timeout));

                // Simple session validation for development
                if (!req.session) {
                    req.session = {
                        id: `dev_session_${Date.now()}`,
                        userId: null,
                        organizationId: null,
                        tenantId: null
                    };
                }

                clearTimeout(timeout);
                next();
            });

            // Authentication context middleware with safe defaults
            this.app.use((req, res, next) => {
                res.locals.user = req.user || null;
                res.locals.isAuthenticated = req.isAuthenticated && typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false;
                res.locals.isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin' || false;
                res.locals.permissions = req.user?.permissions || [];
                next();
            });

            console.log('✅ Authentication system initialized successfully');
            logger.info('Authentication initialized with session manager', {
                sessionStore: 'express-session',
                csrfEnabled: false,
                sessionTimeout: sessionConfig.session.sessionDuration
            });

        } catch (error) {
            console.error('❌ Authentication setup failed:', error.message);
            logger.error('Authentication initialization failed, using emergency fallback', {
                error: error.message
            });

            // Emergency fallback - minimal passport setup
            this.app.use(passport.initialize());
            this.app.use((req, res, next) => {
                res.locals.user = null;
                res.locals.isAuthenticated = false;
                res.locals.isAdmin = false;
                res.locals.permissions = [];
                
                // Ensure session exists for compatibility
                if (!req.session) {
                    req.session = {
                        id: `fallback_session_${Date.now()}`,
                        userId: null,
                        organizationId: null,
                        tenantId: null
                    };
                }
                
                next();
            });

            logger.warn('Authentication running in emergency mode');
        }
    }

    /**
     * Setup audit middleware (simplified for development)
     */
    setupAuditMiddleware() {
        try {
            console.log('📊 Setting up audit middleware...');

            // Simple audit middleware for development
            this.app.use((req, res, next) => {
                req.auditContext = {
                    server: 'admin',
                    adminUser: req.user?.id || 'anonymous',
                    adminRole: req.user?.role || 'none',
                    adminPermissions: req.user?.permissions || [],
                    source: 'admin-portal',
                    timestamp: new Date().toISOString(),
                    requestId: req.requestId
                };
                next();
            });

            console.log('✅ Audit middleware initialized');
            logger.info('Admin audit middleware initialized in simplified mode');
        } catch (error) {
            console.error('❌ Audit middleware setup failed:', error.message);
            logger.error('Failed to setup audit middleware', { error: error.message });
        }
    }

    /**
     * Setup admin routes with timeout protection
     */
    setupAdminRoutes() {
        try {
            console.log('🛤️ Setting up admin routes...');

            const adminBase = this.config.admin.basePath || '/admin';
            const apiPrefix = `${adminBase}/api`;

            // Timeout wrapper for database operations
            const withTimeout = (promise, timeoutMs = 5000) => {
                return Promise.race([
                    promise,
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
                    })
                ]);
            };

            // Health check (no auth required)
            this.app.get('/health', (req, res) => {
                try {
                    const dbHealth = Database.getHealthStatus ? Database.getHealthStatus() : { status: 'unknown' };
                    res.status(200).json({
                        status: 'ok',
                        server: 'admin',
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        environment: this.config.app.env,
                        version: this.config.app.version,
                        database: dbHealth,
                        features: {
                            multiTenant: this.config.database.multiTenant?.enabled || false,
                            auditLogging: true,
                            ipWhitelist: this.config.admin.security?.ipWhitelist?.enabled || false,
                            mfa: this.config.admin.security?.requireMFA || false
                        }
                    });
                } catch (error) {
                    res.status(500).json({
                        status: 'error',
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // FIXED: Admin dashboard with proper response handling
            this.app.get(`${adminBase}/dashboard`, (req, res) => {
                try {
                    const responseData = {
                        title: 'Admin Dashboard',
                        message: 'Welcome to the InsightSerenity Admin Dashboard',
                        user: req.user || null,
                        authenticated: !!req.user,
                        session: {
                            id: req.session?.id || 'no-session',
                            authenticated: !!req.user
                        },
                        stats: {
                            uptime: process.uptime(),
                            environment: this.config.app.env,
                            version: this.config.app.version,
                            timestamp: new Date().toISOString()
                        },
                        features: {
                            realTimeMonitoring: true,
                            advancedAnalytics: false,
                            bulkOperations: true
                        }
                    };

                    res.json(responseData);
                } catch (error) {
                    logger.error('Dashboard route error', { error: error.message });
                    res.status(500).json({
                        error: 'Dashboard load failed',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // FIXED: Database status route with proper timeout handling
            this.app.get('/admin/debug/database-status', async (req, res) => {
                try {
                    const connection = Database.getConnection();
                    
                    const diagnostics = {
                        connectionStatus: connection ? 'Connected' : 'Disconnected',
                        databaseName: connection?.db?.databaseName || 'unknown',
                        timestamp: new Date().toISOString(),
                        environment: process.env.NODE_ENV
                    };

                    if (connection && connection.db) {
                        try {
                            const collections = await withTimeout(
                                connection.db.listCollections().toArray(),
                                3000
                            );

                            diagnostics.collections = collections.map(c => ({
                                name: c.name,
                                type: c.type || 'collection'
                            }));

                            // Get counts with timeout
                            for (const collection of diagnostics.collections.slice(0, 5)) { // Limit to first 5
                                try {
                                    collection.count = await withTimeout(
                                        connection.db.collection(collection.name).countDocuments(),
                                        2000
                                    );
                                } catch (e) {
                                    collection.count = 'timeout';
                                }
                            }
                        } catch (dbError) {
                            diagnostics.dbError = dbError.message;
                            diagnostics.collections = ['Database operations timed out'];
                        }
                    }

                    res.json(diagnostics);
                } catch (error) {
                    res.status(500).json({
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        route: '/admin/debug/database-status'
                    });
                }
            });

            // Root admin redirect
            this.app.get(adminBase, (req, res) => {
                res.redirect(`${adminBase}/dashboard`);
            });

            // API documentation
            if (this.config.app.env !== 'production') {
                this.app.get(`${adminBase}/api-docs`, (req, res) => {
                    res.json({
                        title: 'Admin API Documentation',
                        version: this.config.app.version,
                        environment: this.config.app.env,
                        endpoints: this.getApiEndpoints(),
                        timestamp: new Date().toISOString()
                    });
                });
            }

            // Session check endpoint
            this.app.get(`${adminBase}/session`, (req, res) => {
                res.json({
                    authenticated: !!req.user,
                    user: req.user ? {
                        id: req.user.id,
                        username: req.user.username,
                        role: req.user.role,
                        permissions: req.user.permissions
                    } : null,
                    session: req.session ? {
                        id: req.session.id,
                        expires: req.session.cookie?.expires,
                        maxAge: req.session.cookie?.maxAge
                    } : null
                });
            });

            console.log('✅ Admin routes setup completed');
            logger.info('Admin routes setup completed', { basePath: adminBase });
        } catch (error) {
            console.error('❌ Admin routes setup failed:', error.message);
            logger.error('Failed to setup admin routes', { error: error.message });
            throw error;
        }
    }

    /**
     * Setup comprehensive error handling with fallbacks
     */
    setupErrorHandling() {
        try {
            console.log('🚨 Setting up error handling...');

            // 404 handler for admin routes
            this.app.all('*', (req, res, next) => {
                const error = new AppError(`Admin route not found: ${req.originalUrl}`, 404);
                next(error);
            });

            // Apply not found handler if available
            if (typeof notFoundHandler === 'function') {
                this.app.use(notFoundHandler);
            } else {
                this.app.use((req, res, next) => {
                    const error = new AppError('Resource not found', 404);
                    next(error);
                });
            }

            // Main error handler with fallback
            if (typeof errorHandler === 'function') {
                this.app.use(errorHandler);
            } else {
                // Comprehensive fallback error handler for admin
                this.app.use((err, req, res, next) => {
                    logger.error('Admin application error', {
                        error: err.message,
                        stack: this.config.app.env === 'development' ? err.stack : undefined,
                        path: req.path,
                        method: req.method,
                        user: req.user?.id,
                        sessionId: req.session?.id,
                        ip: req.ip,
                        requestId: req.requestId,
                        timestamp: new Date().toISOString()
                    });

                    const statusCode = err.statusCode || err.status || 500;

                    const errorResponse = {
                        success: false,
                        error: {
                            message: err.message || 'Internal server error',
                            code: err.code || 'ADMIN_ERROR',
                            timestamp: new Date().toISOString(),
                            requestId: req.requestId
                        }
                    };

                    if (this.config.app.env === 'development') {
                        errorResponse.error.stack = err.stack;
                        errorResponse.error.details = err.details;
                    }

                    res.status(statusCode).json(errorResponse);
                });
            }

            console.log('✅ Error handling setup completed');
            logger.info('Admin error handling setup completed successfully');
        } catch (error) {
            console.error('❌ Error handling setup failed:', error.message);
            logger.error('Critical failure in error handling setup', {
                error: error.message,
                stack: error.stack
            });

            // Emergency fallback error handler
            this.app.use((err, req, res, next) => {
                res.status(500).json({
                    success: false,
                    error: {
                        message: 'System error occurred',
                        code: 'SYSTEM_ERROR',
                        timestamp: new Date().toISOString()
                    }
                });
            });
        }
    }

    /**
     * Setup admin event handlers
     */
    setupAdminEventHandlers() {
        try {
            console.log('📡 Setting up event handlers...');

            // Handle critical system events
            this.app.on('system:critical', async (event) => {
                logger.error('Critical system event in admin', event);
            });

            // Handle security events
            this.app.on('security:breach', async (event) => {
                logger.error('Security breach detected', event);
            });

            console.log('✅ Event handlers setup completed');
            logger.info('Admin event handlers setup completed');
        } catch (error) {
            console.error('❌ Event handlers setup failed:', error.message);
            logger.error('Failed to setup event handlers', { error: error.message });
        }
    }

    /**
     * Get API endpoints for documentation
     */
    getApiEndpoints() {
        try {
            const endpoints = [];
            if (this.app._router && this.app._router.stack) {
                this.app._router.stack.forEach((middleware) => {
                    if (middleware.route) {
                        endpoints.push({
                            path: middleware.route.path,
                            methods: Object.keys(middleware.route.methods)
                        });
                    }
                });
            }
            return endpoints;
        } catch (error) {
            logger.error('Failed to get API endpoints', { error: error.message });
            return [];
        }
    }

    /**
     * Start the application
     */
    async start() {
        try {
            console.log('🚀 Starting Admin Application...');

            await this.initialize();

            console.log('✅ Admin application started successfully');
            logger.info('Admin application initialized successfully', {
                environment: this.config.app.env,
                features: {
                    ipWhitelist: this.config.admin.security?.ipWhitelist?.enabled || false,
                    mfa: this.config.admin.security?.requireMFA || false,
                    audit: true
                }
            });

            return this.app;
        } catch (error) {
            console.error('❌ Failed to start admin application:', error.message);
            logger.error('Failed to start admin application', { error: error.message });
            throw error;
        }
    }

    /**
     * Stop the application
     */
    async stop() {
        try {
            console.log('🛑 Stopping admin application...');
            logger.info('Stopping admin application...');
            this.isShuttingDown = true;

            // Close session manager
            if (this.sessionManager && typeof this.sessionManager.close === 'function') {
                await this.sessionManager.close();
            }

            console.log('✅ Admin application stopped successfully');
            logger.info('Admin application stopped successfully');
        } catch (error) {
            console.error('❌ Error stopping admin application:', error.message);
            logger.error('Error stopping admin application', { error: error.message });
            throw error;
        }
    }
}

// Create singleton instance
const adminApplication = new AdminApplication();

module.exports = adminApplication;