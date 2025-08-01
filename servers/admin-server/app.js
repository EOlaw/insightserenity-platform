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
const { AuthStrategiesManager } = require('../../shared/lib/auth/strategies');
const { auditMiddleware } = require('../../shared/lib/security/audit/audit-middleware');
const AuditService = require('../../shared/lib/security/audit/audit-service');
const { AuditEventTypes } = require('../../shared/lib/security/audit/audit-events');

// Admin-specific middleware
const adminAuth = require('./middleware/admin-auth');
const ipWhitelist = require('./middleware/ip-whitelist');
const adminRateLimit = require('./middleware/admin-rate-limit');
const sessionValidation = require('./middleware/session-validation');
const securityHeaders = require('./middleware/security-headers');

// Import admin modules
// const platformManagementRoutes = require('./modules/platform-management/routes');
// const userManagementRoutes = require('./modules/user-management/routes');
// const organizationManagementRoutes = require('./modules/organization-management/routes');
// const securityAdministrationRoutes = require('./modules/security-administration/routes');
// const billingAdministrationRoutes = require('./modules/billing-administration/routes');
// const systemMonitoringRoutes = require('./modules/system-monitoring/routes');
// const supportAdministrationRoutes = require('./modules/support-administration/routes');
// const reportsAnalyticsRoutes = require('./modules/reports-analytics/routes');

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
        this.authManager = new AuthStrategiesManager();
        this.sessionManager = null;
        this.isShuttingDown = false;
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
        if (config.app.env === 'production' || config.admin.behindProxy) {
            this.app.set('trust proxy', config.admin.trustProxyLevel || 1);
            logger.info('Admin app configured to trust proxy', {
                level: config.admin.trustProxyLevel || 1
            });
        }
    }

    /**
     * Setup enhanced security middleware for admin
     */
    setupSecurityMiddleware() {
        // Apply security headers first
        this.app.use(securityHeaders);

        // Enhanced Helmet configuration for admin
        if (config.security.helmet.enabled) {
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
        if (config.admin.security.ipWhitelist?.enabled) {
            this.app.use(ipWhitelist);
            logger.info('IP whitelist middleware enabled for admin');
        }

        // Admin-specific CORS configuration
        if (config.security.cors.enabled) {
            const adminCorsOptions = {
                origin: (origin, callback) => {
                    const allowedOrigins = config.admin.security.cors?.origins || 
                                         config.security.cors.origins || [];
                    
                    if (!origin || allowedOrigins.includes(origin)) {
                        callback(null, true);
                    } else if (config.app.env === 'development' && origin?.includes('localhost')) {
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
    }

    /**
     * Setup admin-specific middleware
     */
    setupAdminMiddleware() {
        // Body parsing with size limits
        this.app.use(express.json({ 
            limit: config.admin.uploadLimit || '50mb',
            verify: (req, res, buf) => {
                req.rawBody = buf.toString('utf8');
            }
        }));
        
        this.app.use(express.urlencoded({ 
            extended: true, 
            limit: config.admin.uploadLimit || '50mb' 
        }));

        // MongoDB injection protection
        if (config.security.sanitize.enabled) {
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
        this.app.use(cookieParser(config.admin.security.cookieSecret || config.security.cookieSecret));

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
            maxAge: config.app.env === 'production' ? '7d' : 0,
            etag: true,
            lastModified: true,
            index: false
        }));

        // Session management with Redis
        if (config.security.session.enabled) {
            this.sessionManager = new SessionManager({
                ...config.security.session,
                name: 'admin.sid',
                cookie: {
                    ...config.security.session.cookie,
                    secure: config.admin.security.forceSSL || config.security.ssl.enabled,
                    httpOnly: true,
                    sameSite: 'strict',
                    maxAge: config.admin.security.sessionTimeout || 3600000 // 1 hour default
                }
            });
            
            this.app.use(this.sessionManager.getSessionMiddleware());
            this.app.use(sessionValidation); // Validate admin sessions
        }

        // Request logging for admin actions
        if (config.app.env !== 'test') {
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
    }

    /**
     * Setup authentication strategies with admin enhancements
     */
    async setupAuthentication() {
        try {
            await this.authManager.initialize(this.app, {
                enableSessions: true,
                adminMode: true,
                requireMFA: config.admin.security.requireMFA,
                sessionTimeout: config.admin.security.sessionTimeout
            });
            
            // Use passport for admin authentication
            this.app.use(passport.initialize());
            this.app.use(passport.session());
            
            // Admin authentication check middleware
            this.app.use((req, res, next) => {
                res.locals.user = req.user;
                res.locals.isAuthenticated = req.isAuthenticated();
                res.locals.isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
                res.locals.permissions = req.user?.permissions || [];
                next();
            });
            
            logger.info('Admin authentication strategies initialized', {
                strategies: this.authManager.getEnabledStrategies(),
                mfaRequired: config.admin.security.requireMFA
            });
        } catch (error) {
            logger.error('Failed to initialize admin authentication', { error });
            throw error;
        }
    }

    /**
     * Setup comprehensive audit middleware for admin actions
     */
    setupAuditMiddleware() {
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
            includeResponseBody: config.app.env !== 'production',
            severity: 'high' // All admin actions are high severity
        }));

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
    }

    /**
     * Setup admin routes
     */
    setupAdminRoutes() {
        const adminBase = config.admin.basePath || '/admin';
        const apiPrefix = `${adminBase}/api`;

        // Health check (no auth required)
        this.app.get('/health', (req, res) => {
            const dbHealth = Database.getHealthStatus();
            res.status(200).json({
                status: 'ok',
                server: 'admin',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: config.app.env,
                version: config.app.version,
                database: dbHealth,
                features: {
                    multiTenant: config.database.multiTenant.enabled,
                    auditLogging: true,
                    ipWhitelist: config.admin.security.ipWhitelist?.enabled,
                    mfa: config.admin.security.requireMFA
                }
            });
        });

        // Admin dashboard (requires auth)
        this.app.get(`${adminBase}/dashboard`, adminAuth, (req, res) => {
            res.render('dashboard', {
                title: 'Admin Dashboard',
                user: req.user,
                stats: {} // Would be populated with real stats
            });
        });

        // Admin API routes (all require authentication)
        // this.app.use(`${apiPrefix}/platform`, adminAuth, platformManagementRoutes);
        // this.app.use(`${apiPrefix}/users`, adminAuth, userManagementRoutes);
        // this.app.use(`${apiPrefix}/organizations`, adminAuth, organizationManagementRoutes);
        // this.app.use(`${apiPrefix}/security`, adminAuth, securityAdministrationRoutes);
        // this.app.use(`${apiPrefix}/billing`, adminAuth, billingAdministrationRoutes);
        // this.app.use(`${apiPrefix}/monitoring`, adminAuth, systemMonitoringRoutes);
        // this.app.use(`${apiPrefix}/support`, adminAuth, supportAdministrationRoutes);
        // this.app.use(`${apiPrefix}/analytics`, adminAuth, reportsAnalyticsRoutes);

        // // Admin authentication routes
        // this.app.post(`${adminBase}/login`, this.handleAdminLogin.bind(this));
        // this.app.post(`${adminBase}/logout`, adminAuth, this.handleAdminLogout.bind(this));
        // this.app.get(`${adminBase}/session`, adminAuth, this.handleSessionCheck.bind(this));

        // Root admin redirect
        this.app.get(adminBase, (req, res) => {
            res.redirect(`${adminBase}/dashboard`);
        });

        // API documentation
        if (config.app.env !== 'production') {
            this.app.get(`${adminBase}/api-docs`, adminAuth, (req, res) => {
                res.json({
                    title: 'Admin API Documentation',
                    version: config.app.version,
                    endpoints: this.getApiEndpoints()
                });
            });
        }

        // 404 handler
        this.app.all('*', (req, res, next) => {
            next(new AppError(`Admin route not found: ${req.originalUrl}`, 404));
        });
    }

    /**
     * Handle admin login
     */
    async handleAdminLogin(req, res, next) {
        try {
            // Use passport local strategy with admin validation
            passport.authenticate('local', async (err, user, info) => {
                if (err) {
                    return next(err);
                }
                
                if (!user || !['admin', 'superadmin'].includes(user.role)) {
                    this.app.emit('admin:login:failed', {
                        username: req.body.username,
                        ip: req.ip,
                        userAgent: req.get('user-agent'),
                        attempts: req.session?.loginAttempts || 1
                    });
                    
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid admin credentials'
                    });
                }

                // Check if MFA is required
                if (config.admin.security.requireMFA && !req.body.mfaToken) {
                    return res.status(200).json({
                        success: false,
                        requireMFA: true,
                        message: 'MFA token required'
                    });
                }

                // Verify MFA if provided
                if (config.admin.security.requireMFA) {
                    const mfaValid = await this.authManager.verifyMFA(user.id, req.body.mfaToken);
                    if (!mfaValid) {
                        return res.status(401).json({
                            success: false,
                            message: 'Invalid MFA token'
                        });
                    }
                }

                req.logIn(user, (err) => {
                    if (err) {
                        return next(err);
                    }

                    // Log successful admin login
                    AuditService.log({
                        type: AuditEventTypes.ADMIN_LOGIN,
                        action: 'admin_login',
                        category: 'authentication',
                        severity: 'high',
                        actor: {
                            id: user.id,
                            username: user.username,
                            role: user.role
                        },
                        target: {
                            type: 'admin_portal',
                            id: 'main'
                        },
                        metadata: {
                            ip: req.ip,
                            userAgent: req.get('user-agent'),
                            mfaUsed: config.admin.security.requireMFA
                        }
                    });

                    res.json({
                        success: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            role: user.role,
                            permissions: user.permissions
                        }
                    });
                });
            })(req, res, next);
        } catch (error) {
            logger.error('Admin login error', { error: error.message });
            next(error);
        }
    }

    /**
     * Handle admin logout
     */
    async handleAdminLogout(req, res) {
        const userId = req.user?.id;
        
        // Log admin logout
        await AuditService.log({
            type: AuditEventTypes.ADMIN_LOGOUT,
            action: 'admin_logout',
            category: 'authentication',
            actor: {
                id: userId,
                username: req.user?.username
            }
        });

        req.logout((err) => {
            if (err) {
                logger.error('Admin logout error', { error: err.message });
            }
            
            req.session.destroy((err) => {
                if (err) {
                    logger.error('Session destroy error', { error: err.message });
                }
                
                res.clearCookie('admin.sid');
                res.json({ success: true, message: 'Logged out successfully' });
            });
        });
    }

    /**
     * Handle session check
     */
    handleSessionCheck(req, res) {
        res.json({
            authenticated: true,
            user: {
                id: req.user.id,
                username: req.user.username,
                role: req.user.role,
                permissions: req.user.permissions
            },
            session: {
                expires: req.session.cookie.expires,
                maxAge: req.session.cookie.maxAge
            }
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        this.app.use(notFoundHandler);
        
        // Enhanced error handler for admin
        this.app.use((err, req, res, next) => {
            // Log all admin errors
            logger.error('Admin error', {
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method,
                user: req.user?.id
            });

            // Audit critical errors
            if (err.statusCode >= 500 || err.severity === 'critical') {
                AuditService.log({
                    type: AuditEventTypes.ADMIN_ERROR,
                    action: 'admin_error',
                    category: 'error',
                    severity: 'critical',
                    actor: {
                        id: req.user?.id,
                        username: req.user?.username
                    },
                    error: {
                        message: err.message,
                        code: err.code,
                        statusCode: err.statusCode
                    }
                });
            }

            errorHandler.handle(err, req, res, next);
        });
    }

    /**
     * Setup admin event handlers
     */
    setupAdminEventHandlers() {
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
    }

    /**
     * Get API endpoints for documentation
     */
    getApiEndpoints() {
        const endpoints = [];
        this.app._router.stack.forEach((middleware) => {
            if (middleware.route) {
                endpoints.push({
                    path: middleware.route.path,
                    methods: Object.keys(middleware.route.methods)
                });
            }
        });
        return endpoints;
    }

    /**
     * Start the application
     */
    async start() {
        try {
            await Database.initialize();
            await this.initialize();
            
            logger.info('Admin application initialized successfully', {
                environment: config.app.env,
                features: {
                    ipWhitelist: config.admin.security.ipWhitelist?.enabled,
                    mfa: config.admin.security.requireMFA,
                    audit: true
                }
            });

            return this.app;
        } catch (error) {
            logger.error('Failed to start admin application', { error });
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
            if (this.sessionManager) {
                await this.sessionManager.close();
            }
            
            // Flush audit logs
            await AuditService.flush();
            
            logger.info('Admin application stopped successfully');
        } catch (error) {
            logger.error('Error stopping admin application', { error });
            throw error;
        }
    }
}

// Create singleton instance
const adminApplication = new AdminApplication();

module.exports = adminApplication;