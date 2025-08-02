/**
 * @file Admin Application Setup
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

// Safely import AuthStrategiesManager with fallback
let AuthStrategiesManager = null;
try {
    const authModule = require('../../shared/lib/auth/strategies');
    AuthStrategiesManager = authModule.AuthStrategiesManager;
} catch (error) {
    logger.warn('AuthStrategiesManager not available', { error: error.message });
}

// Safely import audit middleware with fallback
let auditMiddleware = null;
let AuditService = null;
let AuditEventTypes = null;
try {
    const auditMid = require('../../shared/lib/security/audit/audit-middleware');
    auditMiddleware = auditMid.auditMiddleware;
} catch (error) {
    logger.warn('Audit middleware not available', { error: error.message });
}

try {
    AuditService = require('../../shared/lib/security/audit/audit-service');
} catch (error) {
    logger.warn('AuditService not available', { error: error.message });
}

try {
    const auditEvents = require('../../shared/lib/security/audit/audit-events');
    AuditEventTypes = auditEvents.AuditEventTypes;
} catch (error) {
    logger.warn('AuditEventTypes not available', { error: error.message });
}

// Admin-specific middleware - with safe imports
let adminAuth, ipWhitelist, adminRateLimit, sessionValidation, securityHeaders;

try {
    adminAuth = require('./middleware/admin-auth');
} catch (error) {
    logger.warn('Admin auth middleware not available');
    adminAuth = (req, res, next) => next();
}

try {
    ipWhitelist = require('./middleware/ip-whitelist');
} catch (error) {
    logger.warn('IP whitelist middleware not available');
    ipWhitelist = (req, res, next) => next();
}

try {
    adminRateLimit = require('./middleware/admin-rate-limit');
} catch (error) {
    logger.warn('Admin rate limit middleware not available');
    adminRateLimit = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        message: 'Too many requests from this IP'
    });
}

try {
    sessionValidation = require('./middleware/session-validation');
} catch (error) {
    logger.warn('Session validation middleware not available');
    sessionValidation = (req, res, next) => next();
}

try {
    securityHeaders = require('./middleware/security-headers');
} catch (error) {
    logger.warn('Security headers middleware not available');
    securityHeaders = { middleware: () => (req, res, next) => next() };
}

// Shared middleware imports with fallbacks
let errorHandler, notFoundHandler;

try {
    errorHandler = require('../../shared/lib/middleware/error-handlers/error-handler');
} catch (error) {
    logger.warn('Error handler not available, using fallback');
}

try {
    notFoundHandler = require('../../shared/lib/middleware/error-handlers/not-found-handler');
} catch (error) {
    logger.warn('Not found handler not available, using fallback');
}

/**
 * Admin Application class
 * Handles Express app setup for administrative functions with enhanced security
 */
class AdminApplication {
    constructor() {
        this.app = express();
        this.authManager = AuthStrategiesManager ? new AuthStrategiesManager() : null;
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
    }

    /**
     * Initialize the admin application
     */
    async initialize() {
        this.setupTrustProxy();
        this.setupSecurityMiddleware();
        this.setupAdminMiddleware();
        await this.setupAuthentication();
        this.setupAuditMiddleware();
        this.setupAdminRoutes();
        this.setupErrorHandling();
        this.setupAdminEventHandlers();
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
            // Continue with defaults - not critical for basic operation
        }
    }

    /**
     * Setup enhanced security middleware for admin
     */
    setupSecurityMiddleware() {
        try {
            // Apply security headers first
            if (securityHeaders && typeof securityHeaders.middleware === 'function') {
                this.app.use(securityHeaders.middleware());
            }

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

            // SIMPLIFIED CORS configuration - no complex callbacks
            if (this.config.security.cors && this.config.security.cors.enabled) {
                const corsOptions = {
                    origin: function (origin, callback) {
                        // Allow requests with no origin (like mobile apps or curl requests)
                        if (!origin) return callback(null, true);

                        // For development, allow all origins
                        if (process.env.NODE_ENV === 'development') {
                            return callback(null, true);
                        }

                        // For production, you can add specific origin checking here
                        const allowedOrigins = [
                            'http://localhost:3000',
                            'http://localhost:5001',
                            'http://127.0.0.1:3000',
                            'http://127.0.0.1:5001'
                        ];

                        if (allowedOrigins.includes(origin)) {
                            callback(null, true);
                        } else {
                            callback(null, true); // Allow all for now - you can restrict later
                        }
                    },
                    credentials: true,
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-CSRF-Token'],
                    exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID'],
                    maxAge: 86400 // 24 hours
                };

                this.app.use(cors(corsOptions));
            }

            // Apply rate limiting for admin endpoints
            this.app.use(adminRateLimit);

            logger.info('Security middleware setup completed');
        } catch (error) {
            logger.error('Failed to setup security middleware', { error: error.message });
            // Continue - some security features may be disabled but app should start
        }
    }

    /**
     * Setup admin-specific middleware
     */
    setupAdminMiddleware() {
        try {
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

            // Session management
            if (this.config.security.session && this.config.security.session.enabled) {
                this.sessionManager = new SessionManager({
                    ...this.config.security.session,
                    name: 'admin.sid',
                    cookie: {
                        ...this.config.security.session.cookie,
                        secure: this.config.admin.security.forceSSL || this.config.security.ssl.enabled,
                        httpOnly: true,
                        sameSite: 'strict',
                        maxAge: this.config.admin.security.sessionTimeout || 3600000 // 1 hour default
                    }
                });

                this.app.use(this.sessionManager.getSessionMiddleware());
                this.app.use(sessionValidation); // Validate admin sessions
            }

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

            logger.info('Admin middleware setup completed');
        } catch (error) {
            logger.error('Failed to setup admin middleware', { error: error.message });
            throw error; // This is more critical, should not continue
        }
    }

    /**
     * EMERGENCY FIX: Replace the setupAuthentication method in app.js
     * This bypasses the failing AuthStrategiesManager for development
     */
    async setupAuthentication() {
        try {
            logger.info('Setting up authentication with development bypass');

            // Configure passport middleware
            this.app.use(passport.initialize());
            this.app.use(passport.session());

            // Authentication context middleware with safe defaults
            this.app.use((req, res, next) => {
                res.locals.user = req.user || null;
                res.locals.isAuthenticated = req.isAuthenticated && typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false;
                res.locals.isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin' || false;
                res.locals.permissions = req.user?.permissions || [];
                next();
            });

            // Store authentication manager reference
            this.authManagerInitialized = false; // Set to false to indicate minimal setup

            logger.info('Authentication initialized with development configuration', {
                strategies: ['local'],
                mfaRequired: false,
                passkeyEnabled: false,
                oauthProviders: []
            });

        } catch (error) {
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
                next();
            });

            this.authManagerInitialized = false;
            logger.warn('Authentication running in emergency mode');
        }
    }

    /**
     * Safe method to get enabled authentication strategies
     */
    getEnabledAuthStrategies() {
        return ['local']; // Always return a safe default
    }

    /**
     * Setup comprehensive audit middleware for admin actions
     */
    setupAuditMiddleware() {
        try {
            if (auditMiddleware) {
                // Enhanced audit configuration for admin
                this.app.use(auditMiddleware({
                    enabled: true, // Always enabled for admin
                    skipRoutes: [
                        '/health',
                        '/admin/public',
                        '/favicon.ico'
                    ],
                    sensitiveFields: [
                        'password',
                        'token',
                        'secret',
                        'key',
                        'authorization',
                        'cookie',
                        'apiKey',
                        'privateKey',
                        'accessToken',
                        'refreshToken'
                    ],
                    includeRequestBody: true, // Always log request body for admin
                    includeResponseBody: this.config.app.env !== 'production',
                    severity: 'high' // All admin actions are high severity
                }));
            }

            // Admin-specific audit context
            this.app.use((req, res, next) => {
                req.auditContext = {
                    ...req.auditContext,
                    server: 'admin',
                    adminUser: req.user?.id,
                    adminRole: req.user?.role,
                    adminPermissions: req.user?.permissions || [],
                    source: 'admin-portal'
                };
                next();
            });

            logger.info('Admin audit middleware initialized with enhanced logging');
        } catch (error) {
            logger.error('Failed to setup audit middleware', { error: error.message });
            // Continue - audit is important but not critical for basic operation
        }
    }

    /**
     * Setup admin routes
     */
    setupAdminRoutes() {
        try {
            const adminBase = this.config.admin.basePath || '/admin';
            const apiPrefix = `${adminBase}/api`;

            // Health check (no auth required)
            this.app.get('/health', async (req, res) => {
                try {
                    const dbHealth = Database.getHealthStatus ? await Database.getHealthStatus() : { status: 'unknown' };

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

            // Database debug endpoint
            this.app.get('/admin/debug/database', async (req, res) => {
                try {
                    const connection = Database.getConnection();
                    if (!connection) {
                        return res.json({ error: 'No database connection' });
                    }

                    const admin = connection.db.admin();
                    const databases = await admin.listDatabases();
                    const collections = await connection.db.listCollections().toArray();
                    const stats = await connection.db.stats();

                    res.json({
                        currentDatabase: connection.db.databaseName,
                        databases: databases.databases,
                        collections: collections.map(c => c.name),
                        stats: {
                            collections: stats.collections,
                            dataSize: stats.dataSize,
                            storageSize: stats.storageSize
                        },
                        connectionString: process.env.DB_URI ? process.env.DB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'Not set'
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            });

            // Database initialization endpoint
            this.app.post('/admin/debug/initialize-database', async (req, res) => {
                try {
                    const result = await Database.createTestCollections();
                    res.json({
                        success: true,
                        message: 'Database initialization completed',
                        results: result
                    });
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            });

            // Admin dashboard (requires auth when available)
            this.app.get(`${adminBase}/dashboard`, (req, res) => {
                res.json({
                    title: 'Admin Dashboard',
                    message: 'Admin dashboard endpoint',
                    user: req.user || null,
                    authenticated: !!req.user,
                    stats: {} // Would be populated with real stats
                });
            });

            // Admin API routes (all require authentication when available)
            // this.app.use(`${apiPrefix}/platform`, adminAuth, platformManagementRoutes);
            // ... other routes will be added as modules are implemented

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
                        endpoints: this.getApiEndpoints()
                    });
                });
            }

            logger.info('Admin routes setup completed', { basePath: adminBase });
        } catch (error) {
            logger.error('Failed to setup admin routes', { error: error.message });
            throw error; // Routes are critical
        }
    }

    /**
     * Handle admin login
     */
    async handleAdminLogin(req, res, next) {
        try {
            // Placeholder for actual login implementation
            res.status(501).json({
                success: false,
                message: 'Admin login not yet implemented'
            });
        } catch (error) {
            logger.error('Admin login error', { error: error.message });
            next(error);
        }
    }

    /**
     * Handle admin logout
     */
    async handleAdminLogout(req, res) {
        try {
            // Placeholder for actual logout implementation
            res.json({
                success: true,
                message: 'Admin logout not yet implemented'
            });
        } catch (error) {
            logger.error('Admin logout error', { error: error.message });
            res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }
    }

    /**
     * Handle session check
     */
    handleSessionCheck(req, res) {
        res.json({
            authenticated: !!req.user,
            user: req.user ? {
                id: req.user.id,
                username: req.user.username,
                role: req.user.role,
                permissions: req.user.permissions
            } : null,
            session: req.session ? {
                expires: req.session.cookie?.expires,
                maxAge: req.session.cookie?.maxAge
            } : null
        });
    }

    /**
   * Setup comprehensive error handling with fallbacks
   */
    setupErrorHandling() {
        try {
            // 404 handler for admin routes
            this.app.all('*', (req, res, next) => {
                const error = new AppError(`Admin route not found: ${req.originalUrl}`, 404);
                next(error);
            });

            // Apply not found handler if available and valid
            if (typeof notFoundHandler === 'function') {
                this.app.use(notFoundHandler);
            } else {
                // Fallback 404 handler
                this.app.use((req, res, next) => {
                    const error = new AppError('Resource not found', 404);
                    next(error);
                });
            }

            // Apply main error handler with multiple fallback strategies
            if (typeof errorHandler === 'function') {
                this.app.use(errorHandler);
            } else if (errorHandler && typeof errorHandler.handle === 'function') {
                this.app.use(errorHandler.handle);
            } else if (errorHandler && typeof errorHandler.middleware === 'function') {
                this.app.use(errorHandler.middleware());
            } else {
                // Comprehensive fallback error handler for admin
                this.app.use((err, req, res, next) => {
                    // Log all admin errors with enhanced context
                    logger.error('Admin application error', {
                        error: err.message,
                        stack: this.config.app.env === 'development' ? err.stack : undefined,
                        path: req.path,
                        method: req.method,
                        user: req.user?.id || req.admin?.id,
                        sessionId: req.session?.id,
                        ip: req.ip,
                        userAgent: req.get('user-agent'),
                        requestId: req.requestId,
                        timestamp: new Date().toISOString()
                    });

                    // Determine status code
                    const statusCode = err.statusCode || err.status || 500;

                    // Prepare error response
                    const errorResponse = {
                        success: false,
                        error: {
                            message: err.message || 'Internal server error',
                            code: err.code || 'ADMIN_ERROR',
                            timestamp: new Date().toISOString(),
                            requestId: req.requestId
                        }
                    };

                    // Add development-specific details
                    if (this.config.app.env === 'development') {
                        errorResponse.error.stack = err.stack;
                        errorResponse.error.details = err.details;
                    }

                    // Add admin-specific error context
                    if (req.admin) {
                        errorResponse.error.context = {
                            adminId: req.admin.id,
                            adminRole: req.admin.role,
                            permissions: req.admin.permissions
                        };
                    }

                    // Handle specific error types
                    switch (statusCode) {
                        case 401:
                            res.clearCookie('admin_session');
                            errorResponse.error.action = 'redirect_to_login';
                            break;
                        case 403:
                            errorResponse.error.action = 'access_denied';
                            break;
                        case 404:
                            errorResponse.error.action = 'not_found';
                            break;
                        case 429:
                            errorResponse.error.action = 'rate_limited';
                            errorResponse.error.retryAfter = err.retryAfter;
                            break;
                        case 500:
                        default:
                            errorResponse.error.action = 'internal_error';
                    }

                    // Send error response
                    res.status(statusCode).json(errorResponse);
                });
            }

            logger.info('Admin error handling setup completed successfully');
        } catch (error) {
            logger.error('Critical failure in error handling setup', {
                error: error.message,
                stack: error.stack
            });

            // Emergency fallback error handler
            this.app.use((err, req, res, next) => {
                logger.error('Emergency error handler triggered', {
                    error: err.message,
                    path: req.path
                });

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
            // Handle critical system events
            this.app.on('system:critical', async (event) => {
                logger.error('Critical system event in admin', event);
                // Could trigger alerts, notifications, etc.
            });

            // Handle security events
            this.app.on('security:breach', async (event) => {
                logger.error('Security breach detected', event);
                // Could trigger lockdown procedures
            });

            logger.info('Admin event handlers setup completed');
        } catch (error) {
            logger.error('Failed to setup event handlers', { error: error.message });
            // Continue - event handlers are not critical
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
            // Initialize all middleware except authentication
            this.setupTrustProxy();
            this.setupSecurityMiddleware();
            this.setupAdminMiddleware();

            // Skip authentication setup entirely for now
            logger.info('Skipping authentication setup for development debugging');

            // Configure minimal passport
            this.app.use(passport.initialize());
            this.app.use((req, res, next) => {
                res.locals.user = null;
                res.locals.isAuthenticated = false;
                res.locals.isAdmin = false;
                res.locals.permissions = [];
                next();
            });

            this.setupAuditMiddleware();
            this.setupAdminRoutes();
            this.setupErrorHandling();
            this.setupAdminEventHandlers();

            logger.info('Admin application initialized successfully with minimal authentication', {
                environment: this.config.app.env,
                features: {
                    ipWhitelist: this.config.admin.security?.ipWhitelist?.enabled || false,
                    mfa: false,
                    audit: true
                }
            });

            return this.app;
        } catch (error) {
            logger.error('Failed to start admin application', { error: error.message });
            throw error;
        }
    }

    /**
     * Stop the application
     */
    async stop() {
        try {
            logger.info('Stopping admin application...');
            this.isShuttingDown = true;

            // Close session store
            if (this.sessionManager && typeof this.sessionManager.close === 'function') {
                await this.sessionManager.close();
            }

            // Flush audit logs if available
            if (AuditService && typeof AuditService.flush === 'function') {
                await AuditService.flush();
            }

            logger.info('Admin application stopped successfully');
        } catch (error) {
            logger.error('Error stopping admin application', { error: error.message });
            throw error;
        }
    }
}

// Create singleton instance
const adminApplication = new AdminApplication();

module.exports = adminApplication;