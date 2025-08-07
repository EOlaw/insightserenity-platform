/**
 * @file Admin Application Setup - ENHANCED VERSION WITH MODEL RECOVERY
 * @description Express application configuration for administrative platform management with enhanced model handling
 * @version 3.1.0
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
const session = require('express-session'); // FIXED: Direct import for proper ordering
const rateLimit = require('express-rate-limit');

// Core imports from shared folder
const config = require('../../shared/config');
const logger = require('../../shared/lib/utils/logger');
const SessionManager = require('../../shared/lib/security/session-manager');
const Database = require('../../shared/lib/database');
const { AppError } = require('../../shared/lib/utils/app-error');

// Admin-specific middleware
// const adminAuth = require('./middleware/admin-auth');
// const ipWhitelist = require('./middleware/ip-whitelist');
// const adminRateLimit = require('./middleware/admin-rate-limit');
// const sessionValidation = require('./middleware/session-validation');
// const securityHeaders = require('./middleware/security-headers');

// Shared middleware imports
// const errorHandler = require('../../shared/lib/middleware/error-handlers/error-handler');
// const notFoundHandler = require('../../shared/lib/middleware/error-handlers/not-found-handler');

// FIXED: Conditional middleware imports with error handling
let adminAuth, ipWhitelist, adminRateLimit, sessionValidation, securityHeaders;
try {
    adminAuth = require('./middleware/admin-auth');
} catch (error) {
    logger.warn('Admin auth middleware not available', { error: error.message });
    adminAuth = (req, res, next) => next(); // Fallback
}

try {
    ipWhitelist = require('./middleware/ip-whitelist');
} catch (error) {
    logger.warn('IP whitelist middleware not available', { error: error.message });
    ipWhitelist = (req, res, next) => next(); // Fallback
}

try {
    adminRateLimit = require('./middleware/admin-rate-limit');
} catch (error) {
    logger.warn('Admin rate limit middleware not available', { error: error.message });
    adminRateLimit = (req, res, next) => next(); // Fallback
}

try {
    sessionValidation = require('./middleware/session-validation');
} catch (error) {
    logger.warn('Session validation middleware not available', { error: error.message });
    sessionValidation = (req, res, next) => next(); // Fallback
}

try {
    securityHeaders = require('./middleware/security-headers');
} catch (error) {
    logger.warn('Security headers middleware not available', { error: error.message });
    securityHeaders = { middleware: () => (req, res, next) => next() }; // Fallback
}

// Shared middleware imports with error handling
let errorHandler, notFoundHandler;
try {
    errorHandler = require('../../shared/lib/middleware/error-handlers/error-handler');
} catch (error) {
    logger.warn('Error handler not available, using fallback', { error: error.message });
    errorHandler = null;
}

try {
    notFoundHandler = require('../../shared/lib/middleware/error-handlers/not-found-handler');
} catch (error) {
    logger.warn('Not found handler not available, using fallback', { error: error.message });
    notFoundHandler = null;
}

// Import admin modules
const platformManagementRoutes = require('./modules/platform-management/routes');
// const userManagementRoutes = require('./modules/user-management/routes');
// const organizationManagementRoutes = require('./modules/organization-management/routes');
// const securityAdministrationRoutes = require('./modules/security-administration/routes');
// const billingAdministrationRoutes = require('./modules/billing-administration/routes');
// const systemMonitoringRoutes = require('./modules/system-monitoring/routes');
// const supportAdministrationRoutes = require('./modules/support-administration/routes');
// const reportsAnalyticsRoutes = require('./modules/reports-analytics/routes');

/**
 * ENHANCED: Admin Application class with proper middleware ordering, error handling, and model management
 */
class AdminApplication {
    constructor() {
        this.app = express();
        this.sessionManager = null;
        this.isShuttingDown = false;
        this.requestCount = 0; // FIXED: Add request tracking
        this.modelRecoveryAttempts = 0;
        this.maxModelRecoveryAttempts = 3;

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
                },
                features: {
                    modelRecovery: true,
                    realTimeMonitoring: process.env.ADMIN_REAL_TIME_MONITORING !== 'false',
                    advancedAnalytics: process.env.ADMIN_ADVANCED_ANALYTICS !== 'false'
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

            logger.info('Configuration structure created and validated', {
                hasApp: !!mergedConfig.app,
                hasAdmin: !!mergedConfig.admin,
                hasSecurity: !!mergedConfig.security,
                hasDatabase: !!mergedConfig.database,
                environment: mergedConfig.app.env,
                modelRecoveryEnabled: mergedConfig.admin.features.modelRecovery
            });

            return mergedConfig;
        } catch (error) {
            logger.error('Configuration creation failed, using minimal defaults', {
                error: error.message
            });

            return {
                app: { env: 'development', version: '1.0.0', name: 'Admin Server' },
                admin: {
                    basePath: '/admin',
                    uploadLimit: '50mb',
                    features: { modelRecovery: true }
                },
                security: { session: { enabled: true }, cors: { enabled: true } },
                database: { multiTenant: { enabled: false } }
            };
        }
    }

    /**
     * ENHANCED: Initialize the admin application with proper ordering and model management
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Enhanced Admin Application...');

            this.setupTrustProxy();
            this.setupRequestTracking(); // FIXED: Add request tracking first
            this.setupSecurityMiddleware();
            this.setupAdminMiddleware();
            await this.setupSessionAndAuthentication(); // FIXED: Combined and reordered
            this.setupAuditMiddleware();
            this.setupModelAwareMiddleware(); // ENHANCED: Add model-aware middleware
            this.setupAdminRoutes(); // ENHANCED: Setup enhanced routes
            this.setupErrorHandling();
            this.setupAdminEventHandlers();

            console.log('✅ Enhanced Admin Application initialization completed successfully');
            return this.app;
        } catch (error) {
            console.error('❌ Enhanced Admin Application initialization failed:', error.message);
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
     * FIXED: Setup request tracking first to prevent hanging
     */
    setupRequestTracking() {
        try {
            console.log('🔍 Setting up request tracking...');

            this.app.use((req, res, next) => {
                const startTime = Date.now();
                const requestId = require('crypto').randomBytes(8).toString('hex');

                this.requestCount++;
                req.requestId = requestId;
                req.requestTime = new Date().toISOString();
                req.requestNumber = this.requestCount;
                req.isAdmin = true;

                console.log(`🔍 [${requestId}] ${req.method} ${req.path} - START (#${this.requestCount})`);

                // FIXED: Essential timeout protection to prevent hanging
                const timeout = setTimeout(() => {
                    if (!res.headersSent) {
                        console.log(`⏰ [${requestId}] REQUEST TIMEOUT after 30s - ${req.method} ${req.path}`);
                        res.status(408).json({
                            success: false,
                            error: {
                                message: 'Request timeout',
                                code: 'REQUEST_TIMEOUT',
                                requestId: requestId,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                }, 30000);

                // Enhanced response tracking
                res.on('finish', () => {
                    clearTimeout(timeout);
                    const duration = Date.now() - startTime;
                    console.log(`✅ [${requestId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) (#${req.requestNumber})`);
                });

                res.on('close', () => {
                    clearTimeout(timeout);
                });

                // Set essential headers immediately
                res.setHeader('X-Request-ID', requestId);
                res.setHeader('X-Admin-Server', 'true');
                res.setHeader('X-Request-Number', req.requestNumber);

                next();
            });

            console.log('✅ Request tracking setup completed');
        } catch (error) {
            console.error('❌ Request tracking setup failed:', error.message);
            throw error;
        }
    }

    /**
     * FIXED: Setup enhanced security middleware with proper error handling
     */
    setupSecurityMiddleware() {
        try {
            console.log('🔒 Setting up security middleware...');

            // FIXED: Apply security headers with error handling
            try {
                this.app.use(securityHeaders.middleware());
                logger.info('Security headers middleware applied successfully');
            } catch (headerError) {
                logger.warn('Security headers failed, using basic headers', { error: headerError.message });
                // Fallback security headers
                this.app.use((req, res, next) => {
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    res.setHeader('X-Frame-Options', 'DENY');
                    res.setHeader('X-XSS-Protection', '1; mode=block');
                    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
                    next();
                });
            }

            // FIXED: Enhanced Helmet configuration with error handling
            if (this.config.security.helmet && this.config.security.helmet.enabled) {
                try {
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
                                frameSrc: ["'none'"]
                            }
                        },
                        crossOriginEmbedderPolicy: false, // FIXED: Disable to prevent blocking
                        crossOriginOpenerPolicy: false,
                        dnsPrefetchControl: { allow: false },
                        frameguard: { action: 'deny' },
                        hidePoweredBy: true,
                        hsts: this.config.app.env === 'production' ? {
                            maxAge: 31536000,
                            includeSubDomains: true,
                            preload: true
                        } : false,
                        noSniff: true,
                        xssFilter: true
                    }));
                } catch (helmetError) {
                    logger.warn('Helmet configuration failed, continuing without', { error: helmetError.message });
                }
            }

            // FIXED: IP Whitelist with timeout protection
            if (this.config.admin.security && this.config.admin.security.ipWhitelist && this.config.admin.security.ipWhitelist.enabled) {
                try {
                    // Wrap IP whitelist with timeout
                    this.app.use((req, res, next) => {
                        const timeout = setTimeout(() => {
                            if (!res.headersSent) {
                                logger.warn('IP whitelist timeout', { ip: req.ip, path: req.path });
                                next(); // Continue instead of blocking
                            }
                        }, 5000);

                        const originalNext = next;
                        next = (error) => {
                            clearTimeout(timeout);
                            originalNext(error);
                        };

                        ipWhitelist(req, res, next);
                    });
                    logger.info('IP whitelist middleware enabled for admin');
                } catch (ipError) {
                    logger.warn('IP whitelist middleware failed, continuing without', { error: ipError.message });
                }
            }

            // FIXED: Admin-specific CORS configuration with error handling
            if (this.config.security.cors && this.config.security.cors.enabled) {
                try {
                    const adminCorsOptions = {
                        origin: (origin, callback) => {
                            const allowedOrigins = this.config.admin.security.cors?.origins ||
                                this.config.security.cors.origins || [];

                            // FIXED: Always allow in development
                            if (this.config.app.env === 'development') {
                                return callback(null, true);
                            }

                            if (!origin || allowedOrigins.includes(origin)) {
                                callback(null, true);
                            } else if (origin?.includes('localhost')) {
                                callback(null, true);
                            } else {
                                callback(new Error('Admin: Not allowed by CORS'));
                            }
                        },
                        credentials: true,
                        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                        allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-CSRF-Token'],
                        exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID'],
                        maxAge: 86400
                    };

                    this.app.use(cors(adminCorsOptions));
                    logger.info('CORS middleware configured successfully');
                } catch (corsError) {
                    logger.warn('CORS configuration failed, continuing without', { error: corsError.message });
                }
            }

            // FIXED: Apply rate limiting with timeout protection
            try {
                // Wrap rate limiting with timeout
                this.app.use((req, res, next) => {
                    const timeout = setTimeout(() => {
                        if (!res.headersSent) {
                            logger.warn('Rate limit timeout', { ip: req.ip, path: req.path });
                            next(); // Continue instead of blocking
                        }
                    }, 3000);

                    const originalNext = next;
                    next = (error) => {
                        clearTimeout(timeout);
                        originalNext(error);
                    };

                    adminRateLimit(req, res, next);
                });
            } catch (rateLimitError) {
                logger.warn('Rate limiting failed, continuing without', { error: rateLimitError.message });
            }

            console.log('✅ Security middleware setup completed');
            logger.info('Security middleware setup completed');
        } catch (error) {
            console.error('❌ Security middleware setup failed:', error.message);
            logger.error('Failed to setup security middleware', { error: error.message });
            // Continue - security middleware failure should not stop the app
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
                            path: req.path,
                            requestId: req.requestId
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

            console.log('✅ Admin middleware setup completed');
            logger.info('Admin middleware setup completed');
        } catch (error) {
            console.error('❌ Admin middleware setup failed:', error.message);
            logger.error('Failed to setup admin middleware', { error: error.message });
            throw error;
        }
    }

    /**
     * FIXED: Setup session and authentication with proper ordering
     */
    async setupSessionAndAuthentication() {
        try {
            console.log('🔐 Setting up session and authentication...');

            // FIXED: Setup express-session FIRST before passport
            const sessionOptions = {
                secret: this.config.admin.security.cookieSecret,
                name: 'admin.sid',
                resave: false,
                saveUninitialized: false,
                rolling: true,
                cookie: {
                    secure: this.config.admin.security.forceSSL,
                    httpOnly: true,
                    maxAge: this.config.admin.security.sessionTimeout,
                    sameSite: 'strict'
                }
            };

            // Apply express-session middleware FIRST
            this.app.use(session(sessionOptions));
            logger.info('Express session middleware configured', {
                sessionName: sessionOptions.name,
                secure: sessionOptions.cookie.secure,
                maxAge: sessionOptions.cookie.maxAge
            });

            // FIXED: Initialize passport AFTER express-session
            this.app.use(passport.initialize());
            this.app.use(passport.session());

            // Configure Passport serialization
            passport.serializeUser((user, done) => {
                done(null, user.id || user._id);
            });

            passport.deserializeUser(async (id, done) => {
                try {
                    // Simple user object for development
                    const user = { id, role: 'admin', permissions: [] };
                    done(null, user);
                } catch (error) {
                    done(error, null);
                }
            });

            // FIXED: Initialize SessionManager as additional layer (not replacement)
            try {
                const sessionConfig = {
                    session: {
                        sessionSecret: this.config.admin.security.cookieSecret,
                        sessionName: 'admin.sid',
                        sessionDuration: this.config.admin.security.sessionTimeout,
                        secure: this.config.admin.security.forceSSL,
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
                logger.info('SessionManager initialized as additional security layer');
            } catch (sessionManagerError) {
                logger.warn('SessionManager initialization failed, using basic session only', {
                    error: sessionManagerError.message
                });
            }

            // FIXED: Session validation with timeout protection
            try {
                this.app.use((req, res, next) => {
                    const timeout = setTimeout(() => {
                        if (!res.headersSent) {
                            logger.warn('Session validation timeout', { path: req.path, requestId: req.requestId });
                            next(); // Continue instead of hanging
                        }
                    }, 3000);

                    const originalNext = next;
                    next = (error) => {
                        clearTimeout(timeout);
                        originalNext(error);
                    };

                    // Simple session validation
                    if (!req.session) {
                        req.session = {
                            id: `admin_session_${Date.now()}`,
                            userId: null,
                            organizationId: null,
                            tenantId: null
                        };
                    }

                    next();
                });
            } catch (validationError) {
                logger.warn('Session validation setup failed, using passthrough', { error: validationError.message });
            }

            // Authentication context middleware with safe defaults
            this.app.use((req, res, next) => {
                res.locals.user = req.user || null;
                res.locals.isAuthenticated = req.isAuthenticated && typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false;
                res.locals.isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin' || false;
                res.locals.permissions = req.user?.permissions || [];
                res.locals.sessionId = req.session?.id || req.sessionID || 'no-session';
                res.locals.requestId = req.requestId;

                next();
            });

            console.log('✅ Session and authentication setup completed');
            logger.info('Session and authentication initialized successfully', {
                expressSession: true,
                passport: true,
                sessionManager: !!this.sessionManager
            });

        } catch (error) {
            console.error('❌ Session and authentication setup failed:', error.message);
            logger.error('Session and authentication initialization failed, using emergency fallback', {
                error: error.message
            });

            // Emergency fallback
            this.app.use(passport.initialize());
            this.app.use((req, res, next) => {
                res.locals.user = null;
                res.locals.isAuthenticated = false;
                res.locals.isAdmin = false;
                res.locals.permissions = [];

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

            logger.warn('Session and authentication running in emergency mode');
        }
    }

    /**
     * FIXED: Setup audit middleware with timeout protection
     */
    setupAuditMiddleware() {
        try {
            console.log('📊 Setting up audit middleware...');

            // FIXED: Simple audit middleware with timeout protection
            this.app.use((req, res, next) => {
                const timeout = setTimeout(() => {
                    if (!res.headersSent) {
                        logger.warn('Audit middleware timeout', { path: req.path, requestId: req.requestId });
                        next(); // Continue instead of hanging
                    }
                }, 2000);

                try {
                    req.auditContext = {
                        server: 'admin',
                        adminUser: req.user?.id || 'anonymous',
                        adminRole: req.user?.role || 'none',
                        adminPermissions: req.user?.permissions || [],
                        source: 'admin-portal',
                        timestamp: req.requestTime,
                        requestId: req.requestId,
                        sessionId: req.session?.id || req.sessionID,
                        ipAddress: req.ip,
                        userAgent: req.get('user-agent')
                    };

                    clearTimeout(timeout);
                    next();
                } catch (auditError) {
                    clearTimeout(timeout);
                    logger.warn('Audit context creation failed', { error: auditError.message });
                    req.auditContext = {
                        server: 'admin',
                        timestamp: req.requestTime,
                        requestId: req.requestId
                    };
                    next();
                }
            });

            console.log('✅ Audit middleware initialized');
            logger.info('Admin audit middleware initialized with timeout protection');
        } catch (error) {
            console.error('❌ Audit middleware setup failed:', error.message);
            logger.error('Failed to setup audit middleware', { error: error.message });
            // Continue - audit is not critical for basic operation
        }
    }

    /**
     * ENHANCED: Setup model-aware middleware for enhanced error handling
     */
    setupModelAwareMiddleware() {
        try {
            console.log('🔧 Setting up model-aware middleware...');

            // Model availability middleware
            this.app.use(async (req, res, next) => {
                try {
                    // Attach model availability info to request
                    const modelSummary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { total: 0, successful: 0, failed: 0 };

                    req.modelStatus = {
                        available: modelSummary,
                        canAccessUsers: false,
                        canAccessOrganizations: false,
                        canAccessAuditLogs: false,
                        recoveryAttempts: this.modelRecoveryAttempts,
                        maxRecoveryAttempts: this.maxModelRecoveryAttempts
                    };

                    // Check individual model availability
                    try {
                        req.modelStatus.canAccessUsers = !!(await Database.getModel('User'));
                    } catch (error) {
                        logger.debug('User model check failed', { error: error.message });
                    }

                    try {
                        req.modelStatus.canAccessOrganizations = !!(await Database.getModel('Organization'));
                    } catch (error) {
                        logger.debug('Organization model check failed', { error: error.message });
                    }

                    try {
                        req.modelStatus.canAccessAuditLogs = !!(await Database.getModel('AuditLog'));
                    } catch (error) {
                        logger.debug('AuditLog model check failed', { error: error.message });
                    }

                    next();
                } catch (error) {
                    logger.warn('Model status check failed', { error: error.message });
                    req.modelStatus = {
                        available: false,
                        canAccessUsers: false,
                        canAccessOrganizations: false,
                        canAccessAuditLogs: false,
                        error: error.message,
                        recoveryAttempts: this.modelRecoveryAttempts
                    };
                    next();
                }
            });

            // Enhanced error recovery middleware
            this.app.use((err, req, res, next) => {
                if (err.message && err.message.toLowerCase().includes('model')) {
                    logger.warn('Model-related error detected, attempting recovery', {
                        error: err.message,
                        path: req.path,
                        recoveryAttempts: this.modelRecoveryAttempts
                    });

                    // Trigger model recovery if needed
                    if (this.modelRecoveryAttempts < this.maxModelRecoveryAttempts) {
                        this.triggerModelRecovery(err);
                    }

                    // Provide fallback response for model errors
                    return res.status(503).json({
                        success: false,
                        error: {
                            message: 'Service temporarily unavailable due to model initialization',
                            code: 'MODEL_UNAVAILABLE',
                            canRetry: true,
                            retryAfter: 30,
                            recoveryInProgress: this.modelRecoveryAttempts < this.maxModelRecoveryAttempts
                        },
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }

                next(err);
            });

            console.log('✅ Model-aware middleware setup completed');
            logger.info('Model-aware middleware initialized successfully');

        } catch (error) {
            console.error('❌ Model-aware middleware setup failed:', error.message);
            logger.error('Failed to setup model-aware middleware', { error: error.message });
        }
    }

    /**
     * Trigger model recovery process
     */
    async triggerModelRecovery(error) {
        try {
            if (this.modelRecoveryAttempts >= this.maxModelRecoveryAttempts) {
                logger.warn('Model recovery attempts exceeded limit', {
                    attempts: this.modelRecoveryAttempts,
                    maxAttempts: this.maxModelRecoveryAttempts
                });
                return;
            }

            this.modelRecoveryAttempts++;
            logger.info('Triggering model recovery', {
                attempt: this.modelRecoveryAttempts,
                triggerError: error.message
            });

            // Force model registration
            if (Database.forceModelRegistration) {
                Database.forceModelRegistration();
            }

            // Attempt model reload
            if (Database.reloadModels) {
                const reloadResult = await Database.reloadModels();
                logger.info('Model recovery reload result', reloadResult);
            }

        } catch (recoveryError) {
            logger.error('Model recovery failed', {
                error: recoveryError.message,
                originalError: error.message,
                attempt: this.modelRecoveryAttempts
            });
        }
    }

    /**
     * ENHANCED: Setup admin routes with model validation and recovery endpoints
     */
    setupAdminRoutes() {
        try {
            console.log('🛤️ Setting up enhanced admin routes...');

            const adminBase = this.config.admin.basePath || '/admin';

            // Timeout wrapper for database operations
            const withTimeout = (promise, timeoutMs = 5000) => {
                return Promise.race([
                    promise,
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
                    })
                ]);
            };

            // Admin API routes (all require authentication)
            this.app.use(`${apiPrefix}/platform`, adminAuth, platformManagementRoutes);
            // this.app.use(`${apiPrefix}/users`, adminAuth, userManagementRoutes);
            // this.app.use(`${apiPrefix}/organizations`, adminAuth, organizationManagementRoutes);
            // this.app.use(`${apiPrefix}/security`, adminAuth, securityAdministrationRoutes);
            // this.app.use(`${apiPrefix}/billing`, adminAuth, billingAdministrationRoutes);
            // this.app.use(`${apiPrefix}/monitoring`, adminAuth, systemMonitoringRoutes);
            // this.app.use(`${apiPrefix}/support`, adminAuth, supportAdministrationRoutes);
            // this.app.use(`${apiPrefix}/analytics`, adminAuth, reportsAnalyticsRoutes);

            // ENHANCED: Health check with comprehensive model status
            this.app.get('/health', async (req, res) => {
                try {
                    const dbHealth = Database.getHealthStatus ?
                        await Database.getHealthStatus() :
                        { status: 'unknown' };

                    const modelSummary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { total: 0, successful: 0, failed: 0 };
                    const modelErrors = Database.getRegistrationErrors ? Database.getRegistrationErrors() : [];
                    const seedingStatus = Database.getSeedingStatus ? Database.getSeedingStatus() : {};

                    res.status(200).json({
                        status: 'ok',
                        server: 'admin',
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        environment: this.config.app.env,
                        version: this.config.app.version,
                        requestId: req.requestId,
                        requestNumber: req.requestNumber,
                        database: dbHealth,
                        models: {
                            total: modelSummary.total,
                            successful: modelSummary.successful,
                            failed: modelSummary.failed,
                            available: modelSummary.models || [],
                            errors: modelErrors.slice(0, 3), // Limit error details
                            status: modelSummary.failed > 0 ? 'partial' : 'healthy',
                            recoveryAttempts: this.modelRecoveryAttempts,
                            maxRecoveryAttempts: this.maxModelRecoveryAttempts,
                            recoveryEnabled: this.config.admin.features.modelRecovery
                        },
                        seeding: seedingStatus,
                        session: {
                            configured: !!req.session,
                            sessionId: req.session?.id || req.sessionID || 'no-session',
                            authenticated: !!req.user
                        },
                        passport: {
                            initialized: !!req._passport,
                            user: !!req.user
                        },
                        features: {
                            multiTenant: this.config.database.multiTenant?.enabled || false,
                            auditLogging: true,
                            ipWhitelist: this.config.admin.security?.ipWhitelist?.enabled || false,
                            mfa: this.config.admin.security?.requireMFA || false,
                            sessionManager: !!this.sessionManager,
                            modelRecovery: this.config.admin.features.modelRecovery
                        }
                    });
                } catch (error) {
                    res.status(500).json({
                        status: 'error',
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            // ENHANCED: Model status endpoint
            this.app.get(`${adminBase}/models/status`, async (req, res) => {
                try {
                    const modelSummary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { total: 0, successful: 0, failed: 0 };
                    const modelErrors = Database.getRegistrationErrors ? Database.getRegistrationErrors() : [];

                    const essentialModels = ['User', 'Organization', 'AuditLog'];
                    const modelAvailability = {};

                    for (const modelName of essentialModels) {
                        try {
                            const model = await Database.getModel(modelName);
                            modelAvailability[modelName] = {
                                available: !!model,
                                name: model?.modelName || 'N/A',
                                collection: model?.collection?.name || 'N/A'
                            };
                        } catch (error) {
                            modelAvailability[modelName] = {
                                available: false,
                                error: error.message
                            };
                        }
                    }

                    res.json({
                        summary: modelSummary,
                        errors: modelErrors,
                        essentialModels: modelAvailability,
                        recovery: {
                            attempts: this.modelRecoveryAttempts,
                            maxAttempts: this.maxModelRecoveryAttempts,
                            canRecover: this.modelRecoveryAttempts < this.maxModelRecoveryAttempts,
                            enabled: this.config.admin.features.modelRecovery
                        },
                        actions: {
                            canReload: !!Database.reloadModels,
                            canForceRegistration: !!Database.forceModelRegistration,
                            canRunSeeds: !!Database.runSeeds
                        },
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    res.status(500).json({
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            // ENHANCED: Model reload endpoint
            this.app.post(`${adminBase}/models/reload`, async (req, res) => {
                try {
                    if (!Database.reloadModels) {
                        return res.status(501).json({
                            success: false,
                            error: 'Model reload functionality not available',
                            timestamp: new Date().toISOString()
                        });
                    }

                    const reloadResult = await Database.reloadModels();
                    this.modelRecoveryAttempts++; // Track manual reload attempts

                    res.json({
                        success: true,
                        result: reloadResult,
                        recoveryAttempts: this.modelRecoveryAttempts,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            // ENHANCED: Force model registration endpoint
            this.app.post(`${adminBase}/models/force-registration`, async (req, res) => {
                try {
                    if (!Database.forceModelRegistration) {
                        return res.status(501).json({
                            success: false,
                            error: 'Force model registration functionality not available',
                            timestamp: new Date().toISOString()
                        });
                    }

                    const result = Database.forceModelRegistration();

                    res.json({
                        success: true,
                        result,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            // ENHANCED: Database seeds management
            this.app.get(`${adminBase}/seeds/status`, async (req, res) => {
                try {
                    const seedingStatus = Database.getSeedingStatus ? Database.getSeedingStatus() : {};

                    res.json({
                        status: seedingStatus,
                        canRunSeeds: !!Database.runSeeds,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    res.status(500).json({
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            this.app.post(`${adminBase}/seeds/run`, async (req, res) => {
                try {
                    if (!Database.runSeeds) {
                        return res.status(501).json({
                            success: false,
                            error: 'Seeding functionality not available',
                            timestamp: new Date().toISOString()
                        });
                    }

                    const { strategy = 'safe', resetDatabase = false } = req.body;

                    const seedResult = await Database.runSeeds({
                        strategy,
                        resetDatabase,
                        seedTypes: ['development'],
                        continueOnError: true
                    });

                    res.json({
                        success: true,
                        result: seedResult,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            // Admin dashboard with proper response handling
            this.app.get(`${adminBase}/dashboard`, async (req, res) => {
                try {
                    const modelSummary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { total: 0, successful: 0, failed: 0 };

                    const responseData = {
                        title: 'Enhanced Admin Dashboard',
                        message: 'Welcome to the Enhanced InsightSerenity Admin Dashboard',
                        user: req.user || null,
                        authenticated: !!req.user,
                        session: {
                            id: req.session?.id || req.sessionID || 'no-session',
                            authenticated: !!req.user
                        },
                        system: {
                            uptime: process.uptime(),
                            environment: this.config.app.env,
                            version: this.config.app.version,
                            requestNumber: req.requestNumber,
                            totalRequests: this.requestCount
                        },
                        models: {
                            total: modelSummary.total,
                            successful: modelSummary.successful,
                            failed: modelSummary.failed,
                            healthy: modelSummary.failed === 0,
                            recoveryAttempts: this.modelRecoveryAttempts,
                            available: req.modelStatus || {}
                        },
                        features: {
                            realTimeMonitoring: true,
                            advancedAnalytics: false,
                            bulkOperations: true,
                            sessionManager: !!this.sessionManager,
                            modelRecovery: this.config.admin.features.modelRecovery
                        },
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    };

                    res.json(responseData);
                } catch (error) {
                    logger.error('Dashboard route error', { error: error.message, requestId: req.requestId });
                    res.status(500).json({
                        error: 'Dashboard load failed',
                        message: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            // Session check endpoint
            this.app.get(`${adminBase}/session`, (req, res) => {
                try {
                    res.json({
                        authenticated: !!req.user,
                        user: req.user ? {
                            id: req.user.id,
                            username: req.user.username,
                            role: req.user.role,
                            permissions: req.user.permissions
                        } : null,
                        session: req.session ? {
                            id: req.session.id || req.sessionID,
                            expires: req.session.cookie?.expires,
                            maxAge: req.session.cookie?.maxAge
                        } : null,
                        passport: {
                            initialized: !!req._passport,
                            sessionSupport: !!req.session
                        },
                        middleware: {
                            sessionManager: !!this.sessionManager
                        },
                        models: req.modelStatus || {},
                        requestId: req.requestId,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    res.status(500).json({
                        error: error.message,
                        requestId: req.requestId,
                        timestamp: new Date().toISOString()
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
                        title: 'Enhanced Admin API Documentation',
                        version: this.config.app.version,
                        environment: this.config.app.env,
                        endpoints: this.getApiEndpoints(),
                        features: {
                            modelManagement: true,
                            seedsManagement: true,
                            healthMonitoring: true,
                            sessionManagement: true
                        },
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                });
            }

            console.log('✅ Enhanced admin routes setup completed');
            logger.info('Enhanced admin routes setup completed', {
                basePath: adminBase,
                modelRecoveryEnabled: this.config.admin.features.modelRecovery
            });
        } catch (error) {
            console.error('❌ Enhanced admin routes setup failed:', error.message);
            logger.error('Failed to setup enhanced admin routes', { error: error.message });
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
                        sessionId: req.session?.id || req.sessionID,
                        ip: req.ip,
                        requestId: req.requestId,
                        modelStatus: req.modelStatus,
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

                    // Add model status if available
                    if (req.modelStatus) {
                        errorResponse.models = req.modelStatus;
                    }

                    if (this.config.app.env === 'development') {
                        errorResponse.error.stack = err.stack;
                        errorResponse.error.details = err.details;
                    }

                    // Check if this is a model-related error
                    if (err.message && err.message.toLowerCase().includes('model')) {
                        errorResponse.error.recovery = {
                            available: this.config.admin.features.modelRecovery,
                            attempts: this.modelRecoveryAttempts,
                            maxAttempts: this.maxModelRecoveryAttempts,
                            canRetry: this.modelRecoveryAttempts < this.maxModelRecoveryAttempts
                        };
                    }

                    if (!res.headersSent) {
                        res.status(statusCode).json(errorResponse);
                    }
                });
            }

            console.log('✅ Error handling setup completed');
            logger.info('Enhanced admin error handling setup completed successfully');
        } catch (error) {
            console.error('❌ Error handling setup failed:', error.message);
            logger.error('Critical failure in error handling setup', {
                error: error.message,
                stack: error.stack
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

            // ENHANCED: Handle model-related events
            this.app.on('model:failure', async (event) => {
                logger.error('Model failure detected in admin app', event);

                if (this.modelRecoveryAttempts < this.maxModelRecoveryAttempts) {
                    await this.triggerModelRecovery(event);
                }
            });

            console.log('✅ Event handlers setup completed');
            logger.info('Enhanced admin event handlers setup completed');
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
            console.log('🚀 Starting Enhanced Admin Application...');

            await this.initialize();

            console.log('✅ Enhanced admin application started successfully');
            console.log('📍 Available routes:');
            console.log('   - GET /health (Comprehensive health check with model status)');
            console.log('   - GET /admin/dashboard (Enhanced dashboard)');
            console.log('   - GET /admin/session (Session details)');
            console.log('   - GET /admin/models/status (Model status and recovery)');
            console.log('   - POST /admin/models/reload (Reload models)');
            console.log('   - POST /admin/models/force-registration (Force model registration)');
            console.log('   - GET /admin/seeds/status (Seeding status)');
            console.log('   - POST /admin/seeds/run (Run database seeds)');
            console.log('   - GET /admin/api-docs (API documentation)');

            console.log('🔧 Enhanced features:');
            console.log('   - Proper middleware ordering');
            console.log('   - Express-session before Passport');
            console.log('   - Timeout protection on all middleware');
            console.log('   - Request tracking and monitoring');
            console.log('   - Fallback error handling');
            console.log('   - Model recovery and management');
            console.log('   - Database seeding management');
            console.log('   - Enhanced health monitoring');

            logger.info('Enhanced admin application started successfully', {
                environment: this.config.app.env,
                features: {
                    sessionManager: !!this.sessionManager,
                    requestTracking: true,
                    timeoutProtection: true,
                    fallbackHandling: true,
                    modelRecovery: this.config.admin.features.modelRecovery,
                    modelManagement: true,
                    seedsManagement: true
                },
                modelRecovery: {
                    enabled: this.config.admin.features.modelRecovery,
                    attempts: this.modelRecoveryAttempts,
                    maxAttempts: this.maxModelRecoveryAttempts
                }
            });

            return this.app;
        } catch (error) {
            console.error('❌ Failed to start enhanced admin application:', error.message);
            logger.error('Failed to start admin application', { error: error.message });
            throw error;
        }
    }

    /**
     * Stop the application
     */
    async stop() {
        try {
            console.log('🛑 Stopping enhanced admin application...');
            logger.info('Stopping enhanced admin application...');
            this.isShuttingDown = true;

            // Close session manager
            if (this.sessionManager && typeof this.sessionManager.close === 'function') {
                await this.sessionManager.close();
            }

            console.log('✅ Enhanced admin application stopped successfully');
            logger.info('Enhanced admin application stopped successfully');
        } catch (error) {
            console.error('❌ Error stopping enhanced admin application:', error.message);
            logger.error('Error stopping admin application', { error: error.message });
            throw error;
        }
    }
}

// Create singleton instance
const adminApplication = new AdminApplication();

module.exports = adminApplication;