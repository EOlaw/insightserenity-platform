'use strict';

/**
 * @file Customer Services Express Application
 * @description Production-grade Express application for customer-facing services with
 *              multi-tenant support, comprehensive business modules, and enterprise security
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 * @module insightserenity-platform/servers/customer-services/app
 * @requires ../../../shared/config
 * @requires ../../../shared/lib/utils/logger
 * @requires ../../../shared/lib/database
 * @requires ../../../shared/lib/utils/app-error
 * @requires ../../../shared/lib/utils/constants/error-codes
 * @requires ../../../shared/lib/auth/middleware/authenticate
 * @requires ../../../shared/lib/auth/middleware/authorize
 * @requires ../../../shared/lib/security/session-manager
 * @requires ../../../shared/lib/services/email-service
 * @requires ../../../shared/lib/services/cache-service
 * @requires ../../../shared/lib/services/payment-service
 * @requires ../../../shared/lib/services/file-service
 * @requires ../../../shared/lib/services/notification-service
 * @requires ../../../shared/lib/services/analytics-service
 * @requires ../../../shared/lib/services/webhook-service
 * @requires ../../../shared/lib/middleware/error-handlers/error-handler
 * @requires ../../../shared/lib/middleware/error-handlers/not-found-handler
 * @requires ../../../shared/lib/middleware/logging/request-logger
 * @requires ../../../shared/lib/middleware/logging/audit-logger
 * @requires ../../../shared/lib/middleware/cors-middleware
 * @requires ./middleware/tenant-detection
 * @requires ./middleware/tenant-context
 * @requires ./middleware/performance-monitoring
 * @requires ./middleware/subscription-validation
 * @requires ./middleware/feature-flags
 * @requires ./modules/core-business/clients/routes
 * @requires ./modules/core-business/projects/routes
 * @requires ./modules/core-business/consultants/routes
 * @requires ./modules/core-business/engagements/routes
 * @requires ./modules/core-business/analytics/routes
 * @requires ./modules/hosted-organizations/organizations/routes
 * @requires ./modules/hosted-organizations/tenants/routes
 * @requires ./modules/hosted-organizations/subscriptions/routes
 * @requires ./modules/hosted-organizations/white-label/routes
 * @requires ./modules/recruitment-services/jobs/routes
 * @requires ./modules/recruitment-services/candidates/routes
 * @requires ./modules/recruitment-services/applications/routes
 * @requires ./modules/recruitment-services/partnerships/routes
 * @requires ./modules/recruitment-services/analytics/routes
 * @requires ../../../shared/lib/auth/strategies/local-strategy
 * @requires ../../../shared/lib/auth/strategies/jwt-strategy
 * @requires ../../../shared/lib/auth/strategies/organization-strategy
 * @requires ../../../shared/lib/auth/strategies/passkey-strategy
 * @requires ../../../shared/lib/auth/strategies/google-strategy
 * @requires ../../../shared/lib/auth/strategies/github-strategy
 * @requires ../../../shared/lib/auth/strategies/linkedin-strategy
 */

require('dotenv').config();

// =============================================================================
// CORE DEPENDENCIES
// =============================================================================
const path = require('path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const flash = require('express-flash');
const mongoSanitize = require('express-mongo-sanitize');
const helmet = require('helmet');
const methodOverride = require('method-override');
const morgan = require('morgan');
const passport = require('passport');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const multer = require('multer');
const hpp = require('hpp');

// =============================================================================
// SHARED MODULES IMPORTS
// =============================================================================
const config = require('../../shared/config');
const logger = require('../../shared/lib/utils/logger');
const Database = require('../../shared/lib/database');
const { AppError } = require('../../shared/lib/utils/app-error');
const { ERROR_CODES } = require('../../shared/lib/utils/constants/error-codes');

// Authentication and Security
const { authenticate } = require('../../shared/lib/auth/middleware/authenticate');
const { authorize } = require('../../shared/lib/auth/middleware/authorize');
const SessionManager = require('../../shared/lib/security/session-manager');

// Shared Services
const { 
    EmailService, 
    CacheService, 
    PaymentService, 
    FileService,
    NotificationService,
    AnalyticsService,
    WebhookService
} = require('../../shared/lib/services');

// Shared Middleware
const errorHandler = require('../../shared/lib/middleware/error-handlers/error-handler');
const notFoundHandler = require('../../shared/lib/middleware/error-handlers/not-found-handler');
const requestLogger = require('../../shared/lib/middleware/logging/request-logger');
const auditLogger = require('../../shared/lib/middleware/logging/audit-logger');
const corsMiddleware = require('../../shared/lib/middleware/cors-middleware');

// =============================================================================
// CUSTOMER-SPECIFIC MIDDLEWARE IMPORTS
// =============================================================================
let tenantDetection, tenantContext, performanceMonitoring, subscriptionValidation, featureFlags;

try {
    tenantDetection = require('./middleware/tenant-detection');
    console.log('✅ DEBUG: Tenant detection middleware loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Tenant detection middleware not available:', error.message);
    tenantDetection = (req, res, next) => next();
}

try {
    tenantContext = require('./middleware/tenant-context');
    console.log('✅ DEBUG: Tenant context middleware loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Tenant context middleware not available:', error.message);
    tenantContext = (req, res, next) => next();
}

try {
    performanceMonitoring = require('./middleware/performance-monitoring');
    console.log('✅ DEBUG: Performance monitoring middleware loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Performance monitoring middleware not available:', error.message);
    performanceMonitoring = (req, res, next) => next();
}

try {
    subscriptionValidation = require('./middleware/subscription-validation');
    console.log('✅ DEBUG: Subscription validation middleware loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Subscription validation middleware not available:', error.message);
    subscriptionValidation = (req, res, next) => next();
}

try {
    featureFlags = require('./middleware/feature-flags');
    console.log('✅ DEBUG: Feature flags middleware loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Feature flags middleware not available:', error.message);
    featureFlags = (req, res, next) => next();
}

// =============================================================================
// BUSINESS MODULE ROUTES IMPORTS
// =============================================================================
console.log('🔄 DEBUG: Loading business module routes...');

// Core Business Module Routes
let clientsRoutes, projectsRoutes, consultantsRoutes, engagementsRoutes, coreAnalyticsRoutes;

try {
    clientsRoutes = require('./modules/core-business/clients/routes');
    console.log('✅ DEBUG: Clients routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Clients routes not available:', error.message);
    clientsRoutes = null;
}

try {
    projectsRoutes = require('./modules/core-business/projects/routes');
    console.log('✅ DEBUG: Projects routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Projects routes not available:', error.message);
    projectsRoutes = null;
}

try {
    consultantsRoutes = require('./modules/core-business/consultants/routes');
    console.log('✅ DEBUG: Consultants routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Consultants routes not available:', error.message);
    consultantsRoutes = null;
}

try {
    engagementsRoutes = require('./modules/core-business/engagements/routes');
    console.log('✅ DEBUG: Engagements routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Engagements routes not available:', error.message);
    engagementsRoutes = null;
}

try {
    coreAnalyticsRoutes = require('./modules/core-business/analytics/routes');
    console.log('✅ DEBUG: Core Analytics routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Core Analytics routes not available:', error.message);
    coreAnalyticsRoutes = null;
}

// Hosted Organizations Module Routes
let organizationsRoutes, tenantsRoutes, subscriptionsRoutes, whiteLabelRoutes;

try {
    organizationsRoutes = require('./modules/hosted-organizations/organizations/routes');
    console.log('✅ DEBUG: Organizations routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Organizations routes not available:', error.message);
    organizationsRoutes = null;
}

try {
    tenantsRoutes = require('./modules/hosted-organizations/tenants/routes');
    console.log('✅ DEBUG: Tenants routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Tenants routes not available:', error.message);
    tenantsRoutes = null;
}

try {
    subscriptionsRoutes = require('./modules/hosted-organizations/subscriptions/routes');
    console.log('✅ DEBUG: Subscriptions routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Subscriptions routes not available:', error.message);
    subscriptionsRoutes = null;
}

try {
    whiteLabelRoutes = require('./modules/hosted-organizations/white-label/routes');
    console.log('✅ DEBUG: White Label routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: White Label routes not available:', error.message);
    whiteLabelRoutes = null;
}

// Recruitment Services Module Routes
let jobsRoutes, candidatesRoutes, applicationsRoutes, partnershipsRoutes, recruitmentAnalyticsRoutes;

try {
    jobsRoutes = require('./modules/recruitment-services/jobs/routes');
    console.log('✅ DEBUG: Jobs routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Jobs routes not available:', error.message);
    jobsRoutes = null;
}

try {
    candidatesRoutes = require('./modules/recruitment-services/candidates/routes');
    console.log('✅ DEBUG: Candidates routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Candidates routes not available:', error.message);
    candidatesRoutes = null;
}

try {
    applicationsRoutes = require('./modules/recruitment-services/applications/routes');
    console.log('✅ DEBUG: Applications routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Applications routes not available:', error.message);
    applicationsRoutes = null;
}

try {
    partnershipsRoutes = require('./modules/recruitment-services/partnerships/routes');
    console.log('✅ DEBUG: Partnerships routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Partnerships routes not available:', error.message);
    partnershipsRoutes = null;
}

try {
    recruitmentAnalyticsRoutes = require('./modules/recruitment-services/analytics/routes');
    console.log('✅ DEBUG: Recruitment Analytics routes loaded');
} catch (error) {
    console.warn('⚠️  DEBUG: Recruitment Analytics routes not available:', error.message);
    recruitmentAnalyticsRoutes = null;
}

// =============================================================================
// AUTHENTICATION STRATEGIES
// =============================================================================
const LocalStrategy = require('../../shared/lib/auth/strategies/local-strategy');
const JwtStrategy = require('../../shared/lib/auth/strategies/jwt-strategy');
const OrganizationStrategy = require('../../shared/lib/auth/strategies/organization-strategy');
const PasskeyStrategy = require('../../shared/lib/auth/strategies/passkey-strategy');

// OAuth Strategies (conditionally loaded)
let GoogleStrategy, GitHubStrategy, LinkedInStrategy;

if (process.env.OAUTH_GOOGLE_ENABLED === 'true') {
    try {
        GoogleStrategy = require('../../shared/lib/auth/strategies/google-strategy');
        console.log('✅ DEBUG: Google OAuth strategy loaded');
    } catch (error) {
        console.warn('⚠️  DEBUG: Google OAuth strategy not available:', error.message);
    }
}

if (process.env.OAUTH_GITHUB_ENABLED === 'true') {
    try {
        GitHubStrategy = require('../../shared/lib/auth/strategies/github-strategy');
        console.log('✅ DEBUG: GitHub OAuth strategy loaded');
    } catch (error) {
        console.warn('⚠️  DEBUG: GitHub OAuth strategy not available:', error.message);
    }
}

if (process.env.OAUTH_LINKEDIN_ENABLED === 'true') {
    try {
        LinkedInStrategy = require('../../shared/lib/auth/strategies/linkedin-strategy');
        console.log('✅ DEBUG: LinkedIn OAuth strategy loaded');
    } catch (error) {
        console.warn('⚠️  DEBUG: LinkedIn OAuth strategy not available:', error.message);
    }
}

/**
 * Customer Services Application class
 * @class CustomerServicesApplication
 */
class CustomerServicesApplication {
    constructor() {
        this.app = express();
        this.isShuttingDown = false;
        this.requestCount = 0;
        this.businessMetrics = {
            requestsPerMinute: 0,
            activeUsers: 0,
            activeTenants: 0,
            errorRate: 0,
            averageResponseTime: 0
        };
        this.performanceMetrics = new Map();
        
        // Configuration
        this.config = this.createMergedConfiguration();
        
        console.log('✅ DEBUG: CustomerServicesApplication instance created');
    }

    /**
     * Creates merged configuration with environment-specific settings
     * @private
     */
    createMergedConfiguration() {
        try {
            console.log('🔧 DEBUG: Creating merged configuration...');
            
            const defaultConfig = {
                app: {
                    env: process.env.NODE_ENV || 'development',
                    version: process.env.APP_VERSION || '1.0.0',
                    name: 'InsightSerenity Customer Services'
                },
                services: {
                    port: parseInt(process.env.SERVICES_PORT, 10) || 4002,
                    host: process.env.SERVICES_HOST || '0.0.0.0',
                    behindProxy: process.env.SERVICES_BEHIND_PROXY === 'true',
                    trustProxyLevel: parseInt(process.env.SERVICES_TRUST_PROXY_LEVEL, 10) || 1,
                    uploadLimit: process.env.SERVICES_UPLOAD_LIMIT || '100mb',
                    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000
                },
                security: {
                    helmet: { enabled: process.env.HELMET_ENABLED !== 'false' },
                    cors: {
                        enabled: process.env.CORS_ENABLED !== 'false',
                        origins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
                        credentials: true,
                        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                        allowedHeaders: [
                            'Content-Type', 'Authorization', 'X-Tenant-ID', 
                            'X-Organization-ID', 'X-API-Key', 'X-Request-ID'
                        ]
                    },
                    session: {
                        secret: process.env.SESSION_SECRET,
                        name: 'customer.sid',
                        cookie: {
                            secure: process.env.SESSION_SECURE === 'true',
                            httpOnly: true,
                            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
                            maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 1800000 // 30 minutes
                        }
                    },
                    rateLimit: {
                        enabled: process.env.RATE_LIMIT_ENABLED === 'true',
                        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 900000, // 15 minutes
                        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000,
                        message: 'Too many requests from this IP, please try again later'
                    }
                },
                database: {
                    multiTenant: { enabled: process.env.MULTI_TENANT_ENABLED === 'true' }
                },
                features: {
                    websocket: process.env.WEBSOCKET_ENABLED === 'true',
                    fileUpload: process.env.FILE_UPLOAD_ENABLED !== 'false',
                    analytics: process.env.ANALYTICS_ENABLED !== 'false',
                    notifications: process.env.NOTIFICATIONS_ENABLED !== 'false',
                    payments: process.env.PAYMENTS_ENABLED !== 'false',
                    subscriptions: process.env.SUBSCRIPTIONS_ENABLED !== 'false'
                }
            };

            // Merge with imported config
            const mergedConfig = {
                app: { ...defaultConfig.app, ...(config.app || {}) },
                services: { ...defaultConfig.services, ...(config.services || {}) },
                security: { ...defaultConfig.security, ...(config.security || {}) },
                database: { ...defaultConfig.database, ...(config.database || {}) },
                features: { ...defaultConfig.features, ...(config.features || {}) }
            };

            console.log('✅ DEBUG: Configuration merged successfully');
            return mergedConfig;
        } catch (error) {
            console.error('❌ DEBUG: Configuration creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Initialize the customer services application
     */
    async initialize() {
        try {
            console.log('🚀 DEBUG: Initializing Customer Services Application...');

            // Setup in proper order
            this.setupTrustProxy();
            this.setupRequestTracking();
            this.setupSecurityMiddleware();
            this.setupBusinessMiddleware();
            await this.setupAuthenticationAndSession();
            this.setupMultiTenantMiddleware();
            this.setupFileUploadSupport();
            this.setupBusinessRoutes();
            this.setupErrorHandling();
            
            console.log('✅ DEBUG: Customer Services Application initialization completed');
            return this.app;
        } catch (error) {
            console.error('❌ DEBUG: Application initialization failed:', error.message);
            console.error('❌ Stack:', error.stack);
            throw error;
        }
    }

    /**
     * Setup trust proxy for production deployments
     * @private
     */
    setupTrustProxy() {
        try {
            console.log('🔄 DEBUG: Setting up trust proxy...');
            
            if (this.config.services.behindProxy || this.config.app.env === 'production') {
                this.app.set('trust proxy', this.config.services.trustProxyLevel);
                console.log(`✅ DEBUG: Trust proxy configured (level: ${this.config.services.trustProxyLevel})`);
            }
            
            // View engine setup for any server-rendered pages
            this.app.set('view engine', 'ejs');
            this.app.set('views', path.join(__dirname, 'views'));
            
        } catch (error) {
            console.error('❌ DEBUG: Trust proxy setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup comprehensive request tracking
     * @private
     */
    setupRequestTracking() {
        try {
            console.log('🔄 DEBUG: Setting up request tracking...');

            // Request ID and timing middleware
            this.app.use((req, res, next) => {
                const startTime = Date.now();
                const requestId = require('crypto').randomBytes(8).toString('hex');

                this.requestCount++;
                req.requestId = requestId;
                req.requestTime = new Date().toISOString();
                req.requestNumber = this.requestCount;
                req.startTime = startTime;

                // Debug logging for development
                if (process.env.DEBUG_REQUESTS === 'true') {
                    console.log(`🔍 [${requestId}] ${req.method} ${req.path} - START (#${this.requestCount})`);
                    console.log(`🔍 [${requestId}] Headers:`, JSON.stringify(req.headers, null, 2).substring(0, 500));
                    console.log(`🔍 [${requestId}] IP: ${req.ip}, User-Agent: ${req.get('user-agent')?.substring(0, 100)}`);
                }

                // Essential timeout protection
                const timeout = setTimeout(() => {
                    if (!res.headersSent) {
                        console.log(`⏰ [${requestId}] REQUEST TIMEOUT after ${this.config.services.requestTimeout}ms`);
                        res.status(408).json({
                            success: false,
                            error: {
                                message: 'Request timeout',
                                code: 'REQUEST_TIMEOUT',
                                requestId: requestId,
                                timeout: this.config.services.requestTimeout,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                }, this.config.services.requestTimeout);

                // Response tracking
                res.on('finish', () => {
                    clearTimeout(timeout);
                    const duration = Date.now() - startTime;
                    
                    // Update performance metrics
                    this.updatePerformanceMetrics(duration, res.statusCode);
                    
                    if (process.env.DEBUG_REQUESTS === 'true') {
                        console.log(`✅ [${requestId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) (#${req.requestNumber})`);
                    }

                    // Log slow requests
                    if (duration > 5000) {
                        console.warn(`🐌 [${requestId}] SLOW REQUEST: ${req.method} ${req.path} - ${duration}ms`);
                        logger.warn('Slow request detected', {
                            requestId,
                            method: req.method,
                            path: req.path,
                            duration,
                            statusCode: res.statusCode
                        });
                    }
                });

                res.on('close', () => {
                    clearTimeout(timeout);
                });

                // Set headers immediately
                res.setHeader('X-Request-ID', requestId);
                res.setHeader('X-Customer-Services', 'true');
                res.setHeader('X-Request-Number', req.requestNumber);
                res.setHeader('X-Environment', this.config.app.env);

                next();
            });

            // Request metrics middleware
            this.app.use((req, res, next) => {
                req.businessContext = {
                    service: 'customer-services',
                    module: null,
                    feature: null,
                    tenantId: null,
                    organizationId: null,
                    userId: null
                };

                next();
            });

            console.log('✅ DEBUG: Request tracking setup completed');
        } catch (error) {
            console.error('❌ DEBUG: Request tracking setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Update performance metrics
     * @private
     */
    updatePerformanceMetrics(duration, statusCode) {
        try {
            // Update business metrics
            this.businessMetrics.averageResponseTime = this.calculateRollingAverage(
                this.businessMetrics.averageResponseTime, 
                duration, 
                100
            );

            // Update error rate
            if (statusCode >= 400) {
                this.businessMetrics.errorRate = this.calculateRollingAverage(
                    this.businessMetrics.errorRate, 
                    1, 
                    100
                );
            } else {
                this.businessMetrics.errorRate = this.calculateRollingAverage(
                    this.businessMetrics.errorRate, 
                    0, 
                    100
                );
            }

            // Store detailed metrics for the last hour
            const now = Date.now();
            const hourAgo = now - 3600000;
            
            // Clean old metrics
            for (const [timestamp] of this.performanceMetrics) {
                if (timestamp < hourAgo) {
                    this.performanceMetrics.delete(timestamp);
                }
            }

            // Store new metric
            this.performanceMetrics.set(now, {
                duration,
                statusCode,
                timestamp: now
            });

        } catch (error) {
            console.error('❌ DEBUG: Performance metrics update failed:', error.message);
        }
    }

    /**
     * Calculate rolling average
     * @private
     */
    calculateRollingAverage(currentAverage, newValue, windowSize) {
        return ((currentAverage * (windowSize - 1)) + newValue) / windowSize;
    }

    /**
     * Setup comprehensive security middleware
     * @private
     */
    setupSecurityMiddleware() {
        try {
            console.log('🔒 DEBUG: Setting up security middleware...');

            // Helmet for security headers
            if (this.config.security.helmet.enabled) {
                const helmetOptions = {
                    contentSecurityPolicy: this.config.app.env === 'production' ? {
                        directives: {
                            defaultSrc: ["'self'"],
                            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                            scriptSrc: ["'self'", "'unsafe-inline'"],
                            imgSrc: ["'self'", "data:", "https:"],
                            connectSrc: ["'self'", "wss:", "ws:"],
                            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                            objectSrc: ["'none'"],
                            mediaSrc: ["'self'"],
                            frameSrc: ["'none'"]
                        }
                    } : false,
                    crossOriginEmbedderPolicy: false,
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
                };

                this.app.use(helmet(helmetOptions));
                console.log('✅ DEBUG: Helmet security headers configured');
            }

            // CORS configuration
            if (this.config.security.cors.enabled) {
                const corsOptions = {
                    origin: (origin, callback) => {
                        // Allow requests with no origin (mobile apps, etc.)
                        if (!origin) return callback(null, true);

                        const allowedOrigins = this.config.security.cors.origins;
                        
                        // Development: allow all localhost and development origins
                        if (this.config.app.env === 'development') {
                            if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('dev')) {
                                return callback(null, true);
                            }
                        }

                        // Check against configured origins
                        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                            callback(null, true);
                        } else {
                            console.warn(`❌ [CORS] Origin not allowed: ${origin}`);
                            callback(new Error(`Origin ${origin} not allowed by CORS policy`));
                        }
                    },
                    credentials: this.config.security.cors.credentials,
                    methods: this.config.security.cors.methods,
                    allowedHeaders: this.config.security.cors.allowedHeaders,
                    exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID', 'X-Rate-Limit-Remaining'],
                    maxAge: 86400,
                    optionsSuccessStatus: 200
                };

                this.app.use(cors(corsOptions));
                console.log('✅ DEBUG: CORS middleware configured');
            }

            // Rate limiting
            if (this.config.security.rateLimit.enabled) {
                const limiter = rateLimit({
                    windowMs: this.config.security.rateLimit.windowMs,
                    max: this.config.security.rateLimit.max,
                    message: {
                        success: false,
                        error: {
                            message: this.config.security.rateLimit.message,
                            code: 'RATE_LIMIT_EXCEEDED',
                            timestamp: new Date().toISOString()
                        }
                    },
                    standardHeaders: true,
                    legacyHeaders: false,
                    skip: (req) => {
                        // Skip rate limiting for health checks
                        return req.path === '/health' || req.path === '/ping';
                    },
                    keyGenerator: (req) => {
                        // Use tenant ID + IP for more granular limiting
                        const tenantId = req.headers['x-tenant-id'] || 'default';
                        return `${tenantId}:${req.ip}`;
                    }
                });

                this.app.use('/api', limiter);
                console.log('✅ DEBUG: Rate limiting configured');

                // Slow down middleware for additional protection
                const speedLimiter = slowDown({
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    delayAfter: 100, // allow 100 requests per 15 minutes at full speed
                    delayMs: 500 // 500ms delay per request after limit
                });

                this.app.use('/api', speedLimiter);
                console.log('✅ DEBUG: Speed limiting configured');
            }

            // Parameter pollution protection
            this.app.use(hpp({
                whitelist: ['tags', 'skills', 'locations', 'categories']
            }));

            console.log('✅ DEBUG: Security middleware setup completed');
        } catch (error) {
            console.error('❌ DEBUG: Security middleware setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup business-specific middleware
     * @private
     */
    setupBusinessMiddleware() {
        try {
            console.log('⚙️  DEBUG: Setting up business middleware...');

            // Body parsing with size limits
            this.app.use(express.json({
                limit: this.config.services.uploadLimit,
                verify: (req, res, buf) => {
                    req.rawBody = buf.toString('utf8');
                },
                type: ['application/json', 'application/*+json']
            }));

            this.app.use(express.urlencoded({
                extended: true,
                limit: this.config.services.uploadLimit,
                parameterLimit: 1000
            }));

            // MongoDB injection protection
            this.app.use(mongoSanitize({
                replaceWith: '_',
                onSanitize: ({ req, key }) => {
                    console.warn(`🚨 [SECURITY] Sanitized prohibited character in ${key} from ${req.ip}`);
                    logger.warn('Request sanitized for security', {
                        key,
                        ip: req.ip,
                        path: req.path,
                        requestId: req.requestId
                    });
                }
            }));

            // Cookie parser
            this.app.use(cookieParser(process.env.COOKIE_SECRET || process.env.SESSION_SECRET));

            // Compression
            this.app.use(compression({
                filter: (req, res) => {
                    if (req.headers['x-no-compression']) {
                        return false;
                    }
                    return compression.filter(req, res);
                },
                level: this.config.app.env === 'production' ? 6 : 1,
                threshold: 1024
            }));

            // Method override
            this.app.use(methodOverride('_method'));
            this.app.use(methodOverride('X-HTTP-Method-Override'));

            // Static files for customer assets
            this.app.use('/public', express.static(path.join(__dirname, 'public'), {
                maxAge: this.config.app.env === 'production' ? '7d' : 0,
                etag: true,
                lastModified: true,
                index: false,
                dotfiles: 'ignore'
            }));

            // Request logging
            if (this.config.app.env !== 'test') {
                const morganFormat = this.config.app.env === 'development' 
                    ? 'dev' 
                    : ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

                this.app.use(morgan(morganFormat, {
                    stream: {
                        write: message => {
                            if (this.config.app.env === 'production') {
                                logger.info('HTTP Access Log', {
                                    log: message.trim(),
                                    type: 'access'
                                });
                            }
                        }
                    },
                    skip: (req, res) => {
                        // Skip health checks and internal requests
                        return req.path === '/health' || req.path === '/ping' || req.path.startsWith('/_');
                    }
                }));
            }

            // Flash messages
            this.app.use(flash());

            console.log('✅ DEBUG: Business middleware setup completed');
        } catch (error) {
            console.error('❌ DEBUG: Business middleware setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup authentication and session management
     * @private
     */
    async setupAuthenticationAndSession() {
        try {
            console.log('🔐 DEBUG: Setting up authentication and session management...');

            // Session configuration
            const sessionConfig = {
                secret: this.config.security.session.secret,
                name: this.config.security.session.name,
                resave: false,
                saveUninitialized: false,
                rolling: true,
                cookie: this.config.security.session.cookie
            };

            // Use Redis session store if available
            if (process.env.REDIS_ENABLED === 'true' && CacheService) {
                try {
                    const RedisStore = require('connect-redis')(session);
                    sessionConfig.store = new RedisStore({
                        client: await CacheService.getInstance().getRedisClient(),
                        prefix: 'customer:sess:',
                        ttl: Math.floor(this.config.security.session.cookie.maxAge / 1000)
                    });
                    console.log('✅ DEBUG: Redis session store configured');
                } catch (redisError) {
                    console.warn('⚠️  DEBUG: Redis session store failed, using memory store:', redisError.message);
                }
            }

            this.app.use(session(sessionConfig));

            // Passport initialization
            this.app.use(passport.initialize());
            this.app.use(passport.session());

            // Configure passport strategies
            await this.configurePassportStrategies();

            // Authentication context middleware
            this.app.use((req, res, next) => {
                res.locals.user = req.user || null;
                res.locals.isAuthenticated = req.isAuthenticated && req.isAuthenticated() || false;
                res.locals.sessionId = req.sessionID;
                res.locals.requestId = req.requestId;

                // Set business context for authenticated users
                if (req.user) {
                    req.businessContext.userId = req.user.id || req.user._id;
                    req.businessContext.organizationId = req.user.organizationId;
                    req.businessContext.tenantId = req.user.tenantId;
                }

                next();
            });

            console.log('✅ DEBUG: Authentication and session setup completed');
        } catch (error) {
            console.error('❌ DEBUG: Authentication setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Configure Passport authentication strategies
     * @private
     */
    async configurePassportStrategies() {
        try {
            console.log('🔐 DEBUG: Configuring Passport strategies...');

            // Serialize/deserialize user
            passport.serializeUser((user, done) => {
                done(null, user.id || user._id);
            });

            passport.deserializeUser(async (id, done) => {
                try {
                    const User = Database.getModel('User');
                    const user = await User.findById(id)
                        .populate('organization', 'name slug type')
                        .select('-password -__v');
                    done(null, user);
                } catch (error) {
                    done(error, null);
                }
            });

            // Local strategy for email/password
            if (process.env.LOCAL_AUTH_ENABLED !== 'false') {
                passport.use('local', new LocalStrategy({
                    usernameField: 'email',
                    passwordField: 'password',
                    passReqToCallback: true
                }));
                console.log('✅ DEBUG: Local strategy configured');
            }

            // JWT strategy for API authentication
            passport.use('jwt', JwtStrategy({
                jwtFromRequest: req => {
                    let token = null;
                    if (req && req.headers) {
                        // Check Authorization header first
                        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
                            token = req.headers.authorization.substring(7);
                        }
                        // Check X-API-Key header
                        else if (req.headers['x-api-key']) {
                            token = req.headers['x-api-key'];
                        }
                        // Check cookies
                        else if (req.cookies && req.cookies.jwt) {
                            token = req.cookies.jwt;
                        }
                    }
                    return token;
                },
                secretOrKey: process.env.JWT_SECRET,
                passReqToCallback: true
            }));
            console.log('✅ DEBUG: JWT strategy configured');

            // Organization-based strategy for multi-tenant auth
            if (process.env.MULTI_TENANT_ENABLED === 'true') {
                passport.use('organization', OrganizationStrategy({
                    organizationField: 'organizationId',
                    passReqToCallback: true
                }));
                console.log('✅ DEBUG: Organization strategy configured');
            }

            // Passkey/WebAuthn strategy
            if (process.env.PASSKEY_ENABLED === 'true') {
                passport.use('passkey', PasskeyStrategy({
                    rpID: process.env.PASSKEY_RP_ID || 'localhost',
                    rpName: process.env.PASSKEY_RP_NAME || 'InsightSerenity Platform',
                    passReqToCallback: true
                }));
                console.log('✅ DEBUG: Passkey strategy configured');
            }

            // OAuth strategies
            if (GoogleStrategy) {
                passport.use('google', GoogleStrategy({
                    clientID: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                    callbackURL: '/auth/google/callback',
                    passReqToCallback: true
                }));
                console.log('✅ DEBUG: Google OAuth strategy configured');
            }

            if (GitHubStrategy) {
                passport.use('github', GitHubStrategy({
                    clientID: process.env.GITHUB_CLIENT_ID,
                    clientSecret: process.env.GITHUB_CLIENT_SECRET,
                    callbackURL: '/auth/github/callback',
                    passReqToCallback: true
                }));
                console.log('✅ DEBUG: GitHub OAuth strategy configured');
            }

            if (LinkedInStrategy) {
                passport.use('linkedin', LinkedInStrategy({
                    clientID: process.env.LINKEDIN_CLIENT_ID,
                    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
                    callbackURL: '/auth/linkedin/callback',
                    scope: ['r_emailaddress', 'r_liteprofile'],
                    passReqToCallback: true
                }));
                console.log('✅ DEBUG: LinkedIn OAuth strategy configured');
            }

            console.log('✅ DEBUG: All Passport strategies configured');
        } catch (error) {
            console.error('❌ DEBUG: Passport strategy configuration failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup multi-tenant middleware
     * @private
     */
    setupMultiTenantMiddleware() {
        try {
            console.log('🏢 DEBUG: Setting up multi-tenant middleware...');

            if (process.env.MULTI_TENANT_ENABLED === 'true') {
                // Tenant detection middleware
                this.app.use('/api', tenantDetection);
                console.log('✅ DEBUG: Tenant detection middleware applied');

                // Tenant context middleware
                this.app.use('/api', tenantContext);
                console.log('✅ DEBUG: Tenant context middleware applied');

                // Subscription validation middleware
                this.app.use('/api', subscriptionValidation);
                console.log('✅ DEBUG: Subscription validation middleware applied');

                // Feature flags middleware
                this.app.use('/api', featureFlags);
                console.log('✅ DEBUG: Feature flags middleware applied');
            }

            // Performance monitoring middleware
            this.app.use(performanceMonitoring);
            console.log('✅ DEBUG: Performance monitoring middleware applied');

            console.log('✅ DEBUG: Multi-tenant middleware setup completed');
        } catch (error) {
            console.error('❌ DEBUG: Multi-tenant middleware setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup file upload support
     * @private
     */
    setupFileUploadSupport() {
        try {
            console.log('📁 DEBUG: Setting up file upload support...');

            if (this.config.features.fileUpload) {
                // Configure multer for file uploads
                const storage = multer.diskStorage({
                    destination: (req, file, cb) => {
                        const uploadDir = path.join(__dirname, 'uploads', req.businessContext.tenantId || 'default');
                        require('fs').mkdirSync(uploadDir, { recursive: true });
                        cb(null, uploadDir);
                    },
                    filename: (req, file, cb) => {
                        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
                        cb(null, uniqueName);
                    }
                });

                const upload = multer({
                    storage: storage,
                    limits: {
                        fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024, // 50MB
                        files: parseInt(process.env.MAX_FILES_PER_REQUEST, 10) || 10
                    },
                    fileFilter: (req, file, cb) => {
                        // Allow common business file types
                        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv/;
                        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                        const mimetype = allowedTypes.test(file.mimetype);

                        if (mimetype && extname) {
                            return cb(null, true);
                        } else {
                            cb(new AppError('Invalid file type', 400, 'INVALID_FILE_TYPE'));
                        }
                    }
                });

                // File upload endpoints
                this.app.post('/api/upload/single', authenticate, upload.single('file'), (req, res) => {
                    try {
                        if (!req.file) {
                            return res.status(400).json({
                                success: false,
                                error: { message: 'No file uploaded', code: 'NO_FILE' }
                            });
                        }

                        console.log(`📁 DEBUG: File uploaded: ${req.file.filename} (${req.file.size} bytes)`);

                        res.json({
                            success: true,
                            data: {
                                filename: req.file.filename,
                                originalname: req.file.originalname,
                                mimetype: req.file.mimetype,
                                size: req.file.size,
                                path: `/api/files/${req.file.filename}`,
                                uploadedAt: new Date().toISOString()
                            }
                        });
                    } catch (error) {
                        console.error('❌ DEBUG: File upload error:', error.message);
                        res.status(500).json({
                            success: false,
                            error: { message: 'File upload failed', code: 'UPLOAD_ERROR' }
                        });
                    }
                });

                this.app.post('/api/upload/multiple', authenticate, upload.array('files', 10), (req, res) => {
                    try {
                        if (!req.files || req.files.length === 0) {
                            return res.status(400).json({
                                success: false,
                                error: { message: 'No files uploaded', code: 'NO_FILES' }
                            });
                        }

                        const files = req.files.map(file => ({
                            filename: file.filename,
                            originalname: file.originalname,
                            mimetype: file.mimetype,
                            size: file.size,
                            path: `/api/files/${file.filename}`,
                            uploadedAt: new Date().toISOString()
                        }));

                        console.log(`📁 DEBUG: ${files.length} files uploaded`);

                        res.json({
                            success: true,
                            data: { files, count: files.length }
                        });
                    } catch (error) {
                        console.error('❌ DEBUG: Multiple file upload error:', error.message);
                        res.status(500).json({
                            success: false,
                            error: { message: 'File upload failed', code: 'UPLOAD_ERROR' }
                        });
                    }
                });

                // File serving endpoint
                this.app.get('/api/files/:filename', authenticate, (req, res) => {
                    try {
                        const filename = req.params.filename;
                        const tenantId = req.businessContext.tenantId || 'default';
                        const filePath = path.join(__dirname, 'uploads', tenantId, filename);

                        if (!require('fs').existsSync(filePath)) {
                            return res.status(404).json({
                                success: false,
                                error: { message: 'File not found', code: 'FILE_NOT_FOUND' }
                            });
                        }

                        res.sendFile(filePath);
                    } catch (error) {
                        console.error('❌ DEBUG: File serving error:', error.message);
                        res.status(500).json({
                            success: false,
                            error: { message: 'File serving failed', code: 'FILE_SERVE_ERROR' }
                        });
                    }
                });

                console.log('✅ DEBUG: File upload support configured');
            }
        } catch (error) {
            console.error('❌ DEBUG: File upload setup failed:', error.message);
            console.warn('⚠️  DEBUG: Continuing without file upload support');
        }
    }

    /**
     * Setup comprehensive business routes
     * @private
     */
    setupBusinessRoutes() {
        try {
            console.log('🛤️  DEBUG: Setting up business routes...');

            // Health check endpoint (no auth required)
            this.app.get('/health', async (req, res) => {
                try {
                    const healthStatus = {
                        status: 'healthy',
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        environment: this.config.app.env,
                        version: this.config.app.version,
                        server: 'customer-services',
                        requestId: req.requestId,
                        businessMetrics: this.businessMetrics,
                        features: {
                            multiTenant: this.config.database.multiTenant.enabled,
                            websocket: this.config.features.websocket,
                            fileUpload: this.config.features.fileUpload,
                            analytics: this.config.features.analytics,
                            notifications: this.config.features.notifications,
                            payments: this.config.features.payments,
                            subscriptions: this.config.features.subscriptions
                        },
                        services: {
                            database: Database.connect ? Database.connect() : 'unknown',
                            cache: CacheService ? 'available' : 'unavailable',
                            payment: PaymentService ? 'available' : 'unavailable',
                            email: EmailService ? 'available' : 'unavailable',
                            file: FileService ? 'available' : 'unavailable'
                        }
                    };

                    res.json(healthStatus);
                } catch (error) {
                    res.status(500).json({
                        status: 'unhealthy',
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    });
                }
            });

            // Ping endpoint
            this.app.get('/ping', (req, res) => {
                res.json({
                    message: 'pong',
                    timestamp: new Date().toISOString(),
                    server: 'customer-services',
                    requestId: req.requestId
                });
            });

            // Authentication routes
            this.setupAuthenticationRoutes();

            // API route prefix
            const apiRouter = express.Router();

            // API-level middleware
            apiRouter.use((req, res, next) => {
                // Set API context
                req.businessContext.module = req.path.split('/')[1] || 'unknown';
                next();
            });

            // Core Business Module Routes
            console.log('🏢 DEBUG: Setting up Core Business routes...');
            if (clientsRoutes) {
                apiRouter.use('/clients', authenticate, clientsRoutes);
                console.log('✅ DEBUG: Clients routes mounted at /api/clients');
            }

            if (projectsRoutes) {
                apiRouter.use('/projects', authenticate, projectsRoutes);
                console.log('✅ DEBUG: Projects routes mounted at /api/projects');
            }

            if (consultantsRoutes) {
                apiRouter.use('/consultants', authenticate, consultantsRoutes);
                console.log('✅ DEBUG: Consultants routes mounted at /api/consultants');
            }

            if (engagementsRoutes) {
                apiRouter.use('/engagements', authenticate, engagementsRoutes);
                console.log('✅ DEBUG: Engagements routes mounted at /api/engagements');
            }

            if (coreAnalyticsRoutes) {
                apiRouter.use('/core-analytics', authenticate, coreAnalyticsRoutes);
                console.log('✅ DEBUG: Core Analytics routes mounted at /api/core-analytics');
            }

            // Hosted Organizations Module Routes
            console.log('🏛️  DEBUG: Setting up Hosted Organizations routes...');
            if (organizationsRoutes) {
                apiRouter.use('/organizations', authenticate, organizationsRoutes);
                console.log('✅ DEBUG: Organizations routes mounted at /api/organizations');
            }

            if (tenantsRoutes) {
                apiRouter.use('/tenants', authenticate, authorize(['admin', 'org-admin']), tenantsRoutes);
                console.log('✅ DEBUG: Tenants routes mounted at /api/tenants');
            }

            if (subscriptionsRoutes) {
                apiRouter.use('/subscriptions', authenticate, subscriptionsRoutes);
                console.log('✅ DEBUG: Subscriptions routes mounted at /api/subscriptions');
            }

            if (whiteLabelRoutes) {
                apiRouter.use('/white-label', authenticate, authorize(['admin', 'white-label-admin']), whiteLabelRoutes);
                console.log('✅ DEBUG: White Label routes mounted at /api/white-label');
            }

            // Recruitment Services Module Routes
            console.log('👥 DEBUG: Setting up Recruitment Services routes...');
            if (jobsRoutes) {
                apiRouter.use('/jobs', jobsRoutes); // Public job listings don't require auth
                console.log('✅ DEBUG: Jobs routes mounted at /api/jobs');
            }

            if (candidatesRoutes) {
                apiRouter.use('/candidates', authenticate, candidatesRoutes);
                console.log('✅ DEBUG: Candidates routes mounted at /api/candidates');
            }

            if (applicationsRoutes) {
                apiRouter.use('/applications', authenticate, applicationsRoutes);
                console.log('✅ DEBUG: Applications routes mounted at /api/applications');
            }

            if (partnershipsRoutes) {
                apiRouter.use('/partnerships', authenticate, authorize(['admin', 'partner-manager']), partnershipsRoutes);
                console.log('✅ DEBUG: Partnerships routes mounted at /api/partnerships');
            }

            if (recruitmentAnalyticsRoutes) {
                apiRouter.use('/recruitment-analytics', authenticate, recruitmentAnalyticsRoutes);
                console.log('✅ DEBUG: Recruitment Analytics routes mounted at /api/recruitment-analytics');
            }

            // Utility API endpoints
            this.setupUtilityRoutes(apiRouter);

            // Mount API router
            this.app.use('/api', apiRouter);

            // Root redirect
            this.app.get('/', (req, res) => {
                res.json({
                    message: 'InsightSerenity Customer Services API',
                    version: this.config.app.version,
                    environment: this.config.app.env,
                    endpoints: {
                        health: '/health',
                        api: '/api',
                        auth: '/auth',
                        upload: '/api/upload',
                        docs: this.config.app.env !== 'production' ? '/api/docs' : null
                    },
                    features: this.config.features,
                    timestamp: new Date().toISOString(),
                    requestId: req.requestId
                });
            });

            console.log('✅ DEBUG: Business routes setup completed');
        } catch (error) {
            console.error('❌ DEBUG: Business routes setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup authentication routes
     * @private
     */
    setupAuthenticationRoutes() {
        try {
            console.log('🔐 DEBUG: Setting up authentication routes...');

            const authRouter = express.Router();

            // Local authentication
            authRouter.post('/login', (req, res, next) => {
                passport.authenticate('local', (err, user, info) => {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            error: { message: 'Authentication error', code: 'AUTH_ERROR' }
                        });
                    }
                    
                    if (!user) {
                        return res.status(401).json({
                            success: false,
                            error: { message: info?.message || 'Invalid credentials', code: 'INVALID_CREDENTIALS' }
                        });
                    }

                    req.logIn(user, (err) => {
                        if (err) {
                            return res.status(500).json({
                                success: false,
                                error: { message: 'Login error', code: 'LOGIN_ERROR' }
                            });
                        }

                        console.log(`🔐 DEBUG: User logged in: ${user.email} (ID: ${user.id})`);

                        res.json({
                            success: true,
                            data: {
                                user: {
                                    id: user.id,
                                    email: user.email,
                                    firstName: user.profile?.firstName,
                                    lastName: user.profile?.lastName,
                                    organizationId: user.organizationId,
                                    tenantId: user.tenantId,
                                    role: user.role,
                                    permissions: user.permissions
                                },
                                sessionId: req.sessionID
                            },
                            message: 'Login successful'
                        });
                    });
                })(req, res, next);
            });

            // Registration
            authRouter.post('/register', async (req, res) => {
                try {
                    const { email, password, firstName, lastName, organizationName } = req.body;

                    console.log(`🔐 DEBUG: Registration attempt for: ${email}`);

                    // Validation
                    if (!email || !password || !firstName || !lastName) {
                        return res.status(400).json({
                            success: false,
                            error: { message: 'Missing required fields', code: 'MISSING_FIELDS' }
                        });
                    }

                    // Check if user already exists
                    const User = await Database.getModel('User');
                    const existingUser = await User.findOne({ email });

                    if (existingUser) {
                        return res.status(409).json({
                            success: false,
                            error: { message: 'User already exists', code: 'USER_EXISTS' }
                        });
                    }

                    // Create user
                    const user = new User({
                        email,
                        password, // Will be hashed by pre-save hook
                        profile: { firstName, lastName },
                        accountStatus: { status: 'active' },
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });

                    // Create organization if provided
                    if (organizationName) {
                        const Organization = await Database.getModel('Organization');
                        const organization = new Organization({
                            name: organizationName,
                            slug: organizationName.toLowerCase().replace(/\s+/g, '-'),
                            contact: { email },
                            ownership: { ownerId: user._id },
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });

                        await organization.save();
                        user.organizationId = organization._id;
                    }

                    await user.save();

                    console.log(`✅ DEBUG: User registered: ${email} (ID: ${user.id})`);

                    res.status(201).json({
                        success: true,
                        data: {
                            user: {
                                id: user.id,
                                email: user.email,
                                firstName: user.profile.firstName,
                                lastName: user.profile.lastName,
                                organizationId: user.organizationId
                            }
                        },
                        message: 'Registration successful'
                    });

                } catch (error) {
                    console.error('❌ DEBUG: Registration error:', error.message);
                    res.status(500).json({
                        success: false,
                        error: { message: 'Registration failed', code: 'REGISTRATION_ERROR' }
                    });
                }
            });

            // Logout
            authRouter.post('/logout', (req, res) => {
                req.logout((err) => {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            error: { message: 'Logout error', code: 'LOGOUT_ERROR' }
                        });
                    }

                    console.log(`🔐 DEBUG: User logged out (session: ${req.sessionID})`);

                    res.json({
                        success: true,
                        message: 'Logout successful'
                    });
                });
            });

            // Current user
            authRouter.get('/me', authenticate, (req, res) => {
                res.json({
                    success: true,
                    data: {
                        user: {
                            id: req.user.id,
                            email: req.user.email,
                            firstName: req.user.profile?.firstName,
                            lastName: req.user.profile?.lastName,
                            organizationId: req.user.organizationId,
                            tenantId: req.user.tenantId,
                            role: req.user.role,
                            permissions: req.user.permissions
                        },
                        sessionId: req.sessionID
                    }
                });
            });

            // OAuth routes (if enabled)
            if (GoogleStrategy) {
                authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
                authRouter.get('/google/callback', 
                    passport.authenticate('google', { failureRedirect: '/auth/login' }),
                    (req, res) => {
                        res.redirect(process.env.FRONTEND_URL || '/');
                    }
                );
            }

            if (GitHubStrategy) {
                authRouter.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
                authRouter.get('/github/callback',
                    passport.authenticate('github', { failureRedirect: '/auth/login' }),
                    (req, res) => {
                        res.redirect(process.env.FRONTEND_URL || '/');
                    }
                );
            }

            if (LinkedInStrategy) {
                authRouter.get('/linkedin', passport.authenticate('linkedin'));
                authRouter.get('/linkedin/callback',
                    passport.authenticate('linkedin', { failureRedirect: '/auth/login' }),
                    (req, res) => {
                        res.redirect(process.env.FRONTEND_URL || '/');
                    }
                );
            }

            this.app.use('/auth', authRouter);
            console.log('✅ DEBUG: Authentication routes configured');

        } catch (error) {
            console.error('❌ DEBUG: Authentication routes setup failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup utility routes
     * @private
     */
    setupUtilityRoutes(router) {
        try {
            console.log('🔧 DEBUG: Setting up utility routes...');

            // System information
            router.get('/system/info', authenticate, authorize(['admin']), (req, res) => {
                res.json({
                    success: true,
                    data: {
                        server: 'customer-services',
                        version: this.config.app.version,
                        environment: this.config.app.env,
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        cpu: process.cpuUsage(),
                        platform: process.platform,
                        nodeVersion: process.version,
                        requestCount: this.requestCount,
                        businessMetrics: this.businessMetrics,
                        performanceMetrics: {
                            totalRequests: this.performanceMetrics.size,
                            timeRange: '1 hour',
                            averageResponseTime: this.businessMetrics.averageResponseTime,
                            errorRate: this.businessMetrics.errorRate
                        }
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.requestId
                });
            });

            // Business metrics
            router.get('/metrics', authenticate, (req, res) => {
                const tenantMetrics = this.getTenantMetrics(req.businessContext.tenantId);
                
                res.json({
                    success: true,
                    data: {
                        global: this.businessMetrics,
                        tenant: tenantMetrics,
                        performance: {
                            requests: {
                                total: this.performanceMetrics.size,
                                perMinute: this.calculateRequestsPerMinute(),
                                averageResponseTime: this.businessMetrics.averageResponseTime,
                                errorRate: this.businessMetrics.errorRate
                            }
                        }
                    },
                    timestamp: new Date().toISOString(),
                    requestId: req.requestId
                });
            });

            // Cache operations (if Redis is available)
            if (CacheService) {
                router.post('/cache/clear', authenticate, authorize(['admin']), async (req, res) => {
                    try {
                        await CacheService.getInstance().clear();
                        res.json({
                            success: true,
                            message: 'Cache cleared successfully',
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        res.status(500).json({
                            success: false,
                            error: { message: 'Cache clear failed', code: 'CACHE_ERROR' }
                        });
                    }
                });
            }

            // WebSocket connection info
            if (this.config.features.websocket) {
                router.get('/websocket/info', authenticate, (req, res) => {
                    res.json({
                        success: true,
                        data: {
                            enabled: true,
                            endpoint: '/ws',
                            protocols: ['v1'],
                            maxPayload: '16MB',
                            compression: true,
                            heartbeat: 30000
                        }
                    });
                });
            }

            console.log('✅ DEBUG: Utility routes configured');
        } catch (error) {
            console.error('❌ DEBUG: Utility routes setup failed:', error.message);
        }
    }

    /**
     * Get tenant-specific metrics
     * @private
     */
    getTenantMetrics(tenantId) {
        // This would typically query the database for tenant-specific metrics
        // For now, return mock data
        return {
            tenantId: tenantId || 'default',
            activeUsers: Math.floor(Math.random() * 100),
            totalProjects: Math.floor(Math.random() * 50),
            totalJobs: Math.floor(Math.random() * 200),
            totalCandidates: Math.floor(Math.random() * 500),
            lastActivity: new Date().toISOString()
        };
    }

    /**
     * Calculate requests per minute
     * @private
     */
    calculateRequestsPerMinute() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        let requestsInLastMinute = 0;
        for (const [timestamp] of this.performanceMetrics) {
            if (timestamp >= oneMinuteAgo) {
                requestsInLastMinute++;
            }
        }
        
        return requestsInLastMinute;
    }

    /**
     * Setup comprehensive error handling
     * @private
     */
    setupErrorHandling() {
        try {
            console.log('🚨 DEBUG: Setting up error handling...');

            // 404 handler for API routes
            this.app.use('/api/*', (req, res, next) => {
                const error = new AppError(`API endpoint not found: ${req.originalUrl}`, 404, 'ENDPOINT_NOT_FOUND');
                next(error);
            });

            // General 404 handler
            this.app.use('*', (req, res, next) => {
                const error = new AppError(`Resource not found: ${req.originalUrl}`, 404, 'RESOURCE_NOT_FOUND');
                next(error);
            });

            // Main error handler
            this.app.use((err, req, res, next) => {
                console.error('❌ DEBUG: Application error:', {
                    message: err.message,
                    stack: this.config.app.env === 'development' ? err.stack : undefined,
                    path: req.path,
                    method: req.method,
                    user: req.user?.id,
                    tenantId: req.businessContext?.tenantId,
                    organizationId: req.businessContext?.organizationId,
                    ip: req.ip,
                    requestId: req.requestId
                });

                logger.error('Customer Services Application Error', {
                    error: err.message,
                    stack: err.stack,
                    statusCode: err.statusCode,
                    code: err.code,
                    path: req.path,
                    method: req.method,
                    user: req.user?.id,
                    businessContext: req.businessContext,
                    ip: req.ip,
                    requestId: req.requestId,
                    timestamp: new Date().toISOString()
                });

                const statusCode = err.statusCode || err.status || 500;

                const errorResponse = {
                    success: false,
                    error: {
                        message: err.message || 'Internal server error',
                        code: err.code || 'INTERNAL_ERROR',
                        timestamp: new Date().toISOString(),
                        requestId: req.requestId
                    }
                };

                // Add business context to error response
                if (req.businessContext) {
                    errorResponse.context = {
                        module: req.businessContext.module,
                        tenantId: req.businessContext.tenantId,
                        organizationId: req.businessContext.organizationId
                    };
                }

                if (this.config.app.env === 'development') {
                    errorResponse.error.stack = err.stack;
                    errorResponse.error.details = err.details;
                }

                // Handle specific error types
                if (err.name === 'ValidationError') {
                    errorResponse.error.validation = err.errors;
                } else if (err.name === 'CastError') {
                    errorResponse.error.message = 'Invalid resource ID format';
                    errorResponse.error.code = 'INVALID_ID';
                } else if (err.code === 11000) {
                    errorResponse.error.message = 'Duplicate resource exists';
                    errorResponse.error.code = 'DUPLICATE_RESOURCE';
                }

                if (!res.headersSent) {
                    res.status(statusCode).json(errorResponse);
                }
            });

            console.log('✅ DEBUG: Error handling setup completed');
        } catch (error) {
            console.error('❌ DEBUG: Error handling setup failed:', error.message);
        }
    }

    /**
     * Start the application
     */
    async start() {
        try {
            console.log('🚀 DEBUG: Starting Customer Services Application...');

            await this.initialize();

            console.log('✅ DEBUG: Customer Services Application started successfully');
            console.log('📍 Available API endpoints:');
            console.log('   Authentication:');
            console.log('     - POST /auth/login (Email/password login)');
            console.log('     - POST /auth/register (User registration)');
            console.log('     - POST /auth/logout (Logout)');
            console.log('     - GET /auth/me (Current user info)');
            console.log('   Core Business:');
            console.log('     - /api/clients/* (Client management)');
            console.log('     - /api/projects/* (Project management)');
            console.log('     - /api/consultants/* (Consultant management)');
            console.log('     - /api/engagements/* (Engagement management)');
            console.log('     - /api/core-analytics/* (Business analytics)');
            console.log('   Hosted Organizations:');
            console.log('     - /api/organizations/* (Organization management)');
            console.log('     - /api/tenants/* (Tenant management)');
            console.log('     - /api/subscriptions/* (Subscription management)');
            console.log('     - /api/white-label/* (White label customization)');
            console.log('   Recruitment Services:');
            console.log('     - /api/jobs/* (Job posting and management)');
            console.log('     - /api/candidates/* (Candidate management)');
            console.log('     - /api/applications/* (Application tracking)');
            console.log('     - /api/partnerships/* (Partnership management)');
            console.log('     - /api/recruitment-analytics/* (Recruitment analytics)');
            console.log('   Utilities:');
            console.log('     - GET /health (Health check)');
            console.log('     - GET /ping (Server ping)');
            console.log('     - POST /api/upload/single (Single file upload)');
            console.log('     - POST /api/upload/multiple (Multiple file upload)');
            console.log('     - GET /api/metrics (Business metrics)');
            console.log('     - GET /api/system/info (System information)');

            if (this.config.features.websocket) {
                console.log('   Real-time:');
                console.log('     - WebSocket: /ws (Real-time communication)');
            }

            console.log('🔧 Features enabled:');
            console.log(`   - Multi-tenant: ${this.config.database.multiTenant.enabled}`);
            console.log(`   - WebSocket: ${this.config.features.websocket}`);
            console.log(`   - File Upload: ${this.config.features.fileUpload}`);
            console.log(`   - Analytics: ${this.config.features.analytics}`);
            console.log(`   - Notifications: ${this.config.features.notifications}`);
            console.log(`   - Payments: ${this.config.features.payments}`);
            console.log(`   - Subscriptions: ${this.config.features.subscriptions}`);

            logger.info('Customer Services Application started successfully', {
                environment: this.config.app.env,
                version: this.config.app.version,
                features: this.config.features,
                totalRoutes: this.countRoutes(),
                businessModules: this.getBusinessModules()
            });

            return this.app;
        } catch (error) {
            console.error('❌ DEBUG: Customer Services Application startup failed:', error.message);
            console.error('❌ Stack:', error.stack);
            logger.error('Customer Services Application startup failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Stop the application
     */
    async stop() {
        try {
            console.log('🛑 DEBUG: Stopping Customer Services Application...');
            this.isShuttingDown = true;

            logger.info('Customer Services Application stopping...', {
                requestCount: this.requestCount,
                uptime: process.uptime(),
                businessMetrics: this.businessMetrics
            });

            console.log('✅ DEBUG: Customer Services Application stopped successfully');
        } catch (error) {
            console.error('❌ DEBUG: Error stopping Customer Services Application:', error.message);
            throw error;
        }
    }

    /**
     * Count total routes
     * @private
     */
    countRoutes() {
        let count = 0;
        if (this.app._router && this.app._router.stack) {
            count = this.app._router.stack.length;
        }
        return count;
    }

    /**
     * Get active business modules
     * @private
     */
    getBusinessModules() {
        const modules = [];
        
        if (clientsRoutes) modules.push('clients');
        if (projectsRoutes) modules.push('projects');
        if (consultantsRoutes) modules.push('consultants');
        if (engagementsRoutes) modules.push('engagements');
        if (organizationsRoutes) modules.push('organizations');
        if (tenantsRoutes) modules.push('tenants');
        if (subscriptionsRoutes) modules.push('subscriptions');
        if (whiteLabelRoutes) modules.push('white-label');
        if (jobsRoutes) modules.push('jobs');
        if (candidatesRoutes) modules.push('candidates');
        if (applicationsRoutes) modules.push('applications');
        if (partnershipsRoutes) modules.push('partnerships');
        
        return modules;
    }
}

// Create singleton instance
const customerServicesApplication = new CustomerServicesApplication();

module.exports = customerServicesApplication;