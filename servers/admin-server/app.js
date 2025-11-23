/**
 * @fileoverview Admin Server Express Application
 * @module servers/admin-server/app
 * @description Enterprise-grade Express application configuration for InsightSerenity Admin Server
 *              with comprehensive configuration management, security layers, and modular middleware
 * @version 2.0.1
 * @author InsightSerenity Team
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { getLogger } = require('../../shared/lib/utils/logger');
const { AppError } = require('../../shared/lib/utils/app-error');

// Import configuration from external file
const { AppConfig } = require('./config/server-config');

// Import routes
const routes = require('./routes');

// Import middleware
const { authenticate } = require('./middleware/auth-middleware');
const { authorize } = require('./middleware/permission-middleware');
const { rateLimiter } = require('./middleware/rate-limiter');

/**
 * Admin Application Class
 * Configures and manages the Express application with comprehensive middleware
 * @class AdminApp
 */
class AdminApp {
    constructor(serverConfig = null) {
        this.app = express();
        this.serverConfig = serverConfig;
        this.appConfig = new AppConfig(serverConfig);
        this.logger = getLogger({ serviceName: 'admin-app' });
        this.initialized = false;
        this.middlewareStack = [];
    }

    /**
     * Initialize the application
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            this.logger.warn('Application already initialized');
            return;
        }

        this.logger.info('Initializing Admin application', {
            environment: this.appConfig.get('app.environment'),
            version: this.appConfig.get('app.version')
        });

        // Core setup
        this.setupExpressSettings();
        this.setupTrustProxy();

        // Security layer
        if (this.appConfig.isEnabled('security.helmet.enabled')) {
            this.setupHelmetSecurity();
        }

        // Compression
        if (this.appConfig.isEnabled('compression.enabled')) {
            this.setupCompression();
        }

        // Logging
        if (this.appConfig.isEnabled('logging.enabled')) {
            this.setupLogging();
        }

        // Request tracking
        if (this.appConfig.isEnabled('requestId.enabled')) {
            this.setupRequestId();
        }

        // Body parsing
        this.setupBodyParsing();

        // Cookie parsing
        if (this.appConfig.isEnabled('cookies.enabled')) {
            this.setupCookieParsing();
        }

        // Data sanitization
        this.setupSanitization();

        // CORS
        if (this.appConfig.isEnabled('cors.enabled')) {
            this.setupCors();
        }

        // Rate limiting
        if (this.appConfig.isEnabled('rateLimiting.enabled')) {
            this.setupRateLimiting();
        }

        // Request timeout
        if (this.appConfig.isEnabled('timeout.enabled')) {
            this.setupRequestTimeout();
        }

        // Audit logging
        if (this.appConfig.isEnabled('audit.enabled')) {
            this.setupAuditLogging();
        }

        // Health routes
        if (this.appConfig.isEnabled('health.enabled')) {
            this.setupHealthRoutes();
        }

        // API routes
        this.setupApiRoutes();

        // API documentation
        if (this.appConfig.isEnabled('docs.enabled')) {
            this.setupApiDocumentation();
        }

        // Static files
        if (this.appConfig.isEnabled('static.enabled')) {
            this.setupStaticFiles();
        }

        // Error handling (must be last)
        this.setupNotFoundHandler();
        this.setupErrorHandler();

        this.initialized = true;
        this.logger.info('Admin application initialized successfully', {
            middlewareCount: this.middlewareStack.length
        });
    }

    /**
     * Get Express application instance
     * @returns {express.Application} Express app
     */
    getApp() {
        return this.app;
    }

    /**
     * Get application configuration
     * @returns {AppConfig} Application configuration
     */
    getConfig() {
        return this.appConfig;
    }

    /**
     * Setup Express application settings
     */
    setupExpressSettings() {
        // JSON formatting
        this.app.set('json spaces', this.appConfig.get('response.jsonSpaces'));

        // ETag configuration
        if (this.appConfig.isEnabled('response.etag')) {
            this.app.set('etag', this.appConfig.get('response.etagType'));
        } else {
            this.app.set('etag', false);
        }

        // Disable x-powered-by
        this.app.disable('x-powered-by');

        // Set custom powered by if configured
        const poweredBy = this.appConfig.get('response.poweredBy');
        if (poweredBy) {
            this.app.use((req, res, next) => {
                res.setHeader('X-Powered-By', poweredBy);
                next();
            });
        }

        // Case sensitive routing
        this.app.set('case sensitive routing', true);

        // Strict routing
        this.app.set('strict routing', false);

        this.logger.debug('Express settings configured');
    }

    /**
     * Setup trust proxy for reverse proxy environments
     */
    setupTrustProxy() {
        if (this.appConfig.isEnabled('proxy.enabled')) {
            const hops = this.appConfig.get('proxy.hops');
            this.app.set('trust proxy', hops);
            this.logger.info('Trust proxy enabled', { hops });
        }
    }

    /**
     * Setup Helmet security middleware
     */
    setupHelmetSecurity() {
        const helmetConfig = this.appConfig.get('security.helmet');

        // Content Security Policy
        const cspDirectives = {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            connectSrc: ["'self'", 'https://api.anthropic.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: []
        };

        // Build helmet options
        const helmetOptions = {
            contentSecurityPolicy: helmetConfig.contentSecurityPolicy ? {
                directives: cspDirectives,
                reportOnly: process.env.CSP_REPORT_ONLY === 'true'
            } : false,
            crossOriginEmbedderPolicy: helmetConfig.crossOriginEmbedderPolicy,
            crossOriginOpenerPolicy: helmetConfig.crossOriginOpenerPolicy ? {
                policy: 'same-origin'
            } : false,
            crossOriginResourcePolicy: helmetConfig.crossOriginResourcePolicy ? {
                policy: 'cross-origin'
            } : false,
            dnsPrefetchControl: helmetConfig.dnsPrefetchControl ? {
                allow: false
            } : false,
            frameguard: helmetConfig.frameguard ? {
                action: 'deny'
            } : false,
            hidePoweredBy: helmetConfig.hidePoweredBy,
            hsts: helmetConfig.hsts ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            } : false,
            ieNoOpen: helmetConfig.ieNoOpen,
            noSniff: helmetConfig.noSniff,
            originAgentCluster: helmetConfig.originAgentCluster,
            permittedCrossDomainPolicies: helmetConfig.permittedCrossDomainPolicies ? {
                permittedPolicies: 'none'
            } : false,
            referrerPolicy: helmetConfig.referrerPolicy ? {
                policy: 'strict-origin-when-cross-origin'
            } : false,
            xssFilter: helmetConfig.xssFilter
        };

        this.app.use(helmet(helmetOptions));
        this.middlewareStack.push('helmet');

        // Additional security headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
            res.setHeader('X-Download-Options', 'noopen');
            res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
            next();
        });

        this.logger.debug('Helmet security configured');
    }

    /**
     * Setup compression middleware
     */
    setupCompression() {
        const compressionConfig = this.appConfig.get('compression');

        const compressionOptions = {
            level: compressionConfig.level,
            threshold: compressionConfig.threshold,
            memLevel: compressionConfig.memLevel,
            chunkSize: compressionConfig.chunkSize,
            windowBits: compressionConfig.windowBits,
            filter: (req, res) => {
                // Don't compress if client doesn't accept it
                if (req.headers['x-no-compression']) {
                    return false;
                }

                // Don't compress Server-Sent Events
                if (req.headers.accept === 'text/event-stream') {
                    return false;
                }

                // Use compression filter
                return compression.filter(req, res);
            }
        };

        this.app.use(compression(compressionOptions));
        this.middlewareStack.push('compression');

        this.logger.debug('Compression configured', {
            level: compressionConfig.level,
            threshold: compressionConfig.threshold
        });
    }

    /**
     * Setup logging middleware
     */
    setupLogging() {
        const loggingConfig = this.appConfig.get('logging');
        const skipPaths = loggingConfig.skipPaths;

        // Custom tokens
        morgan.token('request-id', (req) => req.requestId || '-');
        morgan.token('user-id', (req) => req.user?.id || '-');
        morgan.token('tenant-id', (req) => req.headers['x-tenant-id'] || '-');
        morgan.token('real-ip', (req) => {
            return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   req.headers['x-real-ip'] ||
                   req.ip ||
                   req.connection.remoteAddress;
        });

        // Custom format for production
        const customFormat = ':real-ip :method :url :status :res[content-length] - :response-time ms [:request-id] [:user-id]';

        const morganFormat = loggingConfig.format === 'custom' ? customFormat : loggingConfig.format;

        const morganOptions = {
            stream: {
                write: (message) => {
                    // Use 'info' level instead of 'http' to ensure compatibility
                    this.logger.info(message.trim());
                }
            },
            skip: (req) => {
                return skipPaths.some(path => req.url.startsWith(path));
            },
            immediate: loggingConfig.immediate
        };

        this.app.use(morgan(morganFormat, morganOptions));
        this.middlewareStack.push('morgan');

        this.logger.debug('Logging configured', { format: morganFormat });
    }

    /**
     * Setup request ID middleware
     */
    setupRequestId() {
        const requestIdConfig = this.appConfig.get('requestId');

        this.app.use((req, res, next) => {
            const headerName = requestIdConfig.header;
            
            // Get from header or generate
            let requestId = req.headers[headerName.toLowerCase()];

            if (!requestId) {
                if (requestIdConfig.generator === 'uuid') {
                    requestId = crypto.randomUUID();
                } else {
                    requestId = `req_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
                }
            }

            req.requestId = requestId;
            req.startTime = Date.now();

            // Set response header
            if (requestIdConfig.setHeader) {
                res.setHeader(headerName, requestId);
            }

            // Log slow requests
            if (this.appConfig.isEnabled('slowRequest.enabled')) {
                res.on('finish', () => {
                    const duration = Date.now() - req.startTime;
                    const threshold = this.appConfig.get('slowRequest.threshold');

                    if (duration > threshold) {
                        const logLevel = this.appConfig.get('slowRequest.logLevel');
                        this.logger[logLevel]('Slow request detected', {
                            requestId: req.requestId,
                            method: req.method,
                            url: req.originalUrl,
                            duration: `${duration}ms`,
                            statusCode: res.statusCode,
                            threshold: `${threshold}ms`
                        });
                    }
                });
            }

            next();
        });

        this.middlewareStack.push('requestId');
        this.logger.debug('Request ID middleware configured');
    }

    /**
     * Setup body parsing middleware
     */
    setupBodyParsing() {
        const parserConfig = this.appConfig.get('bodyParser');

        // JSON parser
        if (parserConfig.json.enabled) {
            this.app.use(express.json({
                limit: parserConfig.json.limit,
                strict: parserConfig.json.strict,
                type: parserConfig.json.type,
                verify: (req, res, buf, encoding) => {
                    // Store raw body for signature verification
                    if (buf && buf.length) {
                        req.rawBody = buf.toString(encoding || 'utf8');
                    }
                }
            }));
            this.middlewareStack.push('json-parser');
        }

        // URL encoded parser
        if (parserConfig.urlencoded.enabled) {
            this.app.use(express.urlencoded({
                limit: parserConfig.urlencoded.limit,
                extended: parserConfig.urlencoded.extended,
                parameterLimit: parserConfig.urlencoded.parameterLimit
            }));
            this.middlewareStack.push('urlencoded-parser');
        }

        // Raw parser
        if (parserConfig.raw.enabled) {
            this.app.use(express.raw({
                limit: parserConfig.raw.limit,
                type: parserConfig.raw.type
            }));
            this.middlewareStack.push('raw-parser');
        }

        // Text parser
        if (parserConfig.text.enabled) {
            this.app.use(express.text({
                limit: parserConfig.text.limit,
                type: parserConfig.text.type
            }));
            this.middlewareStack.push('text-parser');
        }

        this.logger.debug('Body parsing configured');
    }

    /**
     * Setup cookie parsing middleware
     */
    setupCookieParsing() {
        const cookieConfig = this.appConfig.get('cookies');

        this.app.use(cookieParser(cookieConfig.secret));
        this.middlewareStack.push('cookie-parser');

        this.logger.debug('Cookie parsing configured');
    }

    /**
     * Setup data sanitization middleware
     */
    setupSanitization() {
        const securityConfig = this.appConfig.get('security');

        // MongoDB query injection prevention with updated configuration
        if (securityConfig.mongoSanitize.enabled) {
            // Use custom sanitization to avoid Node.js 24+ compatibility issues
            this.app.use((req, res, next) => {
                try {
                    // Sanitize req.body
                    if (req.body && typeof req.body === 'object') {
                        req.body = this.sanitizeObject(req.body, securityConfig.mongoSanitize.replaceWith);
                    }

                    // Sanitize req.params
                    if (req.params && typeof req.params === 'object') {
                        req.params = this.sanitizeObject(req.params, securityConfig.mongoSanitize.replaceWith);
                    }

                    // Create a sanitized copy of query instead of modifying it directly
                    if (req.query && typeof req.query === 'object') {
                        const sanitizedQuery = this.sanitizeObject(req.query, securityConfig.mongoSanitize.replaceWith);
                        
                        // Store sanitized query in a custom property
                        req.sanitizedQuery = sanitizedQuery;
                        
                        // Override the query getter to return sanitized version
                        Object.defineProperty(req, 'query', {
                            get: function() {
                                return this.sanitizedQuery || {};
                            },
                            enumerable: true,
                            configurable: true
                        });
                    }

                    next();
                } catch (error) {
                    this.logger.error('Error in sanitization middleware', {
                        error: error.message,
                        requestId: req.requestId
                    });
                    next(error);
                }
            });
            
            this.middlewareStack.push('mongo-sanitize-custom');
        }

        // XSS prevention with custom implementation for Node.js 24+ compatibility
        if (securityConfig.xss.enabled) {
            this.app.use((req, res, next) => {
                try {
                    // Sanitize req.body
                    if (req.body && typeof req.body === 'object') {
                        req.body = this.sanitizeXSS(req.body);
                    }

                    // Sanitize req.params
                    if (req.params && typeof req.params === 'object') {
                        req.params = this.sanitizeXSS(req.params);
                    }

                    // Sanitize query using the same approach as MongoDB sanitization
                    if (req.query && typeof req.query === 'object') {
                        const sanitizedQuery = this.sanitizeXSS(req.query);
                        
                        // Store sanitized query in a custom property
                        req.sanitizedQuery = sanitizedQuery;
                        
                        // Override the query getter to return sanitized version
                        Object.defineProperty(req, 'query', {
                            get: function() {
                                return this.sanitizedQuery || {};
                            },
                            enumerable: true,
                            configurable: true
                        });
                    }

                    next();
                } catch (error) {
                    this.logger.error('Error in XSS sanitization middleware', {
                        error: error.message,
                        requestId: req.requestId
                    });
                    next(error);
                }
            });
            this.middlewareStack.push('xss-clean-custom');
        }

        // HTTP Parameter Pollution prevention
        if (securityConfig.hpp.enabled) {
            this.app.use(hpp({
                whitelist: securityConfig.hpp.whitelist
            }));
            this.middlewareStack.push('hpp');
        }

        this.logger.debug('Sanitization configured');
    }

    /**
     * Sanitize an object by removing MongoDB operators
     * @param {Object} obj - Object to sanitize
     * @param {string} replaceWith - String to replace operators with
     * @returns {Object} Sanitized object
     */
    sanitizeObject(obj, replaceWith = '_') {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeObject(item, replaceWith));
        }

        const sanitized = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                // Check if key starts with $ or contains .
                const sanitizedKey = key.replace(/^\$+/, replaceWith).replace(/\./g, replaceWith);
                
                if (sanitizedKey !== key) {
                    this.logger.warn('MongoDB injection attempt sanitized', {
                        originalKey: key,
                        sanitizedKey: sanitizedKey
                    });
                }

                // Recursively sanitize nested objects
                sanitized[sanitizedKey] = this.sanitizeObject(obj[key], replaceWith);
            }
        }

        return sanitized;
    }

    /**
     * Sanitize data against XSS attacks
     * @param {*} data - Data to sanitize
     * @returns {*} Sanitized data
     */
    sanitizeXSS(data) {
        if (typeof data === 'string') {
            // Remove potentially dangerous HTML/script tags and attributes
            return data
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '')
                .replace(/<embed\b[^>]*>/gi, '')
                .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
                .replace(/&lt;script/gi, '')
                .replace(/&lt;iframe/gi, '');
        }

        if (typeof data !== 'object' || data === null) {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeXSS(item));
        }

        const sanitized = {};
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                sanitized[key] = this.sanitizeXSS(data[key]);
            }
        }

        return sanitized;
    }

    /**
     * Setup CORS middleware
     */
    setupCors() {
        const corsConfig = this.appConfig.get('cors');

        const corsOptions = {
            origin: (origin, callback) => {
                // Allow requests with no origin (mobile apps, curl, etc.)
                if (!origin) {
                    return callback(null, true);
                }

                // Check if origin is allowed
                if (corsConfig.origins.includes(origin) || 
                    corsConfig.origins.includes('*') ||
                    this.appConfig.get('app.environment') === 'development') {
                    return callback(null, true);
                }

                // Log blocked request
                this.logger.warn('CORS request blocked', { origin });
                return callback(new AppError('Not allowed by CORS', 403, 'CORS_ERROR'));
            },
            credentials: corsConfig.credentials,
            methods: corsConfig.methods,
            allowedHeaders: corsConfig.allowedHeaders,
            exposedHeaders: corsConfig.exposedHeaders,
            maxAge: corsConfig.maxAge,
            preflightContinue: corsConfig.preflightContinue,
            optionsSuccessStatus: corsConfig.optionsSuccessStatus
        };

        this.app.use(cors(corsOptions));
        this.middlewareStack.push('cors');

        this.logger.debug('CORS configured', {
            origins: corsConfig.origins.length,
            credentials: corsConfig.credentials
        });
    }

    /**
     * Setup rate limiting middleware
     */
    setupRateLimiting() {
        const rateLimitConfig = this.appConfig.get('rateLimiting');

        // Global rate limiter
        const globalLimiter = rateLimiter({
            windowMs: rateLimitConfig.windowMs,
            maxRequests: rateLimitConfig.max,
            message: rateLimitConfig.message,
            standardHeaders: rateLimitConfig.standardHeaders,
            legacyHeaders: rateLimitConfig.legacyHeaders
        });

        this.app.use('/api', globalLimiter);
        this.middlewareStack.push('rate-limiter');

        this.logger.debug('Rate limiting configured', {
            windowMs: rateLimitConfig.windowMs,
            max: rateLimitConfig.max
        });
    }

    /**
     * Setup request timeout middleware
     */
    setupRequestTimeout() {
        const timeoutConfig = this.appConfig.get('timeout');

        this.app.use((req, res, next) => {
            req.setTimeout(timeoutConfig.ms, () => {
                if (!res.headersSent) {
                    this.logger.warn('Request timeout', {
                        requestId: req.requestId,
                        method: req.method,
                        url: req.originalUrl,
                        timeout: timeoutConfig.ms
                    });

                    res.status(408).json({
                        success: false,
                        error: {
                            message: timeoutConfig.message,
                            code: 'REQUEST_TIMEOUT'
                        },
                        requestId: req.requestId
                    });
                }
            });
            next();
        });

        this.middlewareStack.push('request-timeout');
        this.logger.debug('Request timeout configured', { ms: timeoutConfig.ms });
    }

    /**
     * Setup audit logging middleware
     */
    setupAuditLogging() {
        const auditConfig = this.appConfig.get('audit');

        this.app.use((req, res, next) => {
            // Skip excluded paths
            if (auditConfig.excludePaths.some(path => req.url.startsWith(path))) {
                return next();
            }

            // Capture response
            const oldSend = res.send;
            res.send = function(data) {
                res.responseBody = data;
                return oldSend.apply(res, arguments);
            };

            // Log on finish
            res.on('finish', () => {
                const auditEntry = {
                    timestamp: new Date().toISOString(),
                    requestId: req.requestId,
                    method: req.method,
                    url: req.originalUrl,
                    statusCode: res.statusCode,
                    userId: req.user?.id,
                    tenantId: req.headers['x-tenant-id'],
                    ip: req.ip,
                    userAgent: req.headers['user-agent'],
                    duration: Date.now() - req.startTime
                };

                if (auditConfig.logQuery) {
                    auditEntry.query = req.query;
                }

                if (auditConfig.logBody && req.body) {
                    // Mask sensitive fields
                    const sanitizedBody = { ...req.body };
                    auditConfig.sensitiveFields.forEach(field => {
                        if (sanitizedBody[field]) {
                            sanitizedBody[field] = '***REDACTED***';
                        }
                    });
                    auditEntry.body = sanitizedBody;
                }

                this.logger.info('Audit log', auditEntry);
            });

            next();
        });

        this.middlewareStack.push('audit-logging');
        this.logger.debug('Audit logging configured');
    }

    /**
     * Setup health check routes
     */
    setupHealthRoutes() {
        const healthConfig = this.appConfig.get('health');

        // Liveness probe
        this.app.get(healthConfig.livePath, (req, res) => {
            res.status(200).json({
                status: 'alive',
                timestamp: new Date().toISOString()
            });
        });

        // Health check
        this.app.get(healthConfig.path, (req, res) => {
            const memoryUsage = process.memoryUsage();

            res.status(200).json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString(),
                service: this.appConfig.get('app.name'),
                version: this.appConfig.get('app.version'),
                environment: this.appConfig.get('app.environment'),
                uptime: process.uptime(),
                memory: {
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                    rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB'
                }
            });
        });

        // Readiness probe
        this.app.get(healthConfig.readyPath, async (req, res) => {
            try {
                const checks = {
                    database: await this.checkDatabaseHealth(),
                    memory: this.checkMemoryHealth()
                };

                const isReady = Object.values(checks).every(check => check.status === 'ok');

                res.status(isReady ? 200 : 503).json({
                    success: isReady,
                    status: isReady ? 'ready' : 'not ready',
                    timestamp: new Date().toISOString(),
                    checks
                });
            } catch (error) {
                res.status(503).json({
                    success: false,
                    status: 'not ready',
                    error: error.message
                });
            }
        });

        // Metrics endpoint
        if (healthConfig.metricsAuth) {
            this.app.get(healthConfig.metricsPath, authenticate, (req, res) => {
                this.sendMetrics(res);
            });
        } else {
            this.app.get(healthConfig.metricsPath, (req, res) => {
                this.sendMetrics(res);
            });
        }

        this.logger.debug('Health routes configured');
    }

    /**
     * Send metrics response
     * @param {express.Response} res - Express response
     */
    sendMetrics(res) {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            metrics: {
                uptime: process.uptime(),
                memory: {
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    external: Math.round(memoryUsage.external / 1024 / 1024),
                    rss: Math.round(memoryUsage.rss / 1024 / 1024),
                    arrayBuffers: Math.round((memoryUsage.arrayBuffers || 0) / 1024 / 1024)
                },
                cpu: {
                    user: cpuUsage.user,
                    system: cpuUsage.system
                },
                process: {
                    pid: process.pid,
                    ppid: process.ppid,
                    title: process.title,
                    version: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            }
        });
    }

    /**
     * Check database health
     * @returns {Promise<Object>} Database health status
     */
    async checkDatabaseHealth() {
        try {
            const database = require('../../shared/lib/database');
            const status = await database.healthCheck();

            return {
                status: status.healthy ? 'ok' : 'degraded',
                latency: status.latency || null
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Check memory health
     * @returns {Object} Memory health status
     */
    checkMemoryHealth() {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
        const usagePercentage = (heapUsedMB / heapTotalMB) * 100;

        let status = 'ok';
        if (usagePercentage > 90) {
            status = 'critical';
        } else if (usagePercentage > 70) {
            status = 'warning';
        }

        return {
            status,
            usagePercentage: Math.round(usagePercentage),
            heapUsedMB: Math.round(heapUsedMB)
        };
    }

    /**
     * Setup API routes
     */
    setupApiRoutes() {
        // API root
        this.app.get('/api', (req, res) => {
            res.status(200).json({
                success: true,
                message: `${this.appConfig.get('app.name')} API`,
                version: this.appConfig.get('app.version'),
                environment: this.appConfig.get('app.environment'),
                documentation: this.appConfig.get('docs.path'),
                endpoints: {
                    admin: '/api/v1/admin'
                }
            });
        });

        // Mount admin routes
        // this.app.use('/api/v1/admin', routes);

        this.middlewareStack.push('api-routes');
        this.logger.debug('API routes configured');
    }

    /**
     * Setup API documentation
     */
    setupApiDocumentation() {
        const docsConfig = this.appConfig.get('docs');

        this.app.get(docsConfig.path, (req, res) => {
            res.status(200).json({
                success: true,
                title: docsConfig.title,
                version: docsConfig.version,
                description: 'Administrative API for InsightSerenity platform',
                baseUrl: '/api/v1/admin',
                authentication: {
                    type: 'Bearer',
                    header: 'Authorization',
                    format: 'Bearer <token>'
                },
                modules: [
                    {
                        name: 'Content Management System',
                        basePath: '/cms',
                        description: 'Blog posts, pages, media, and templates management',
                        endpoints: [
                            { method: 'GET', path: '/blog/posts', description: 'List all blog posts' },
                            { method: 'POST', path: '/blog/admin/posts', description: 'Create a new blog post' },
                            { method: 'GET', path: '/blog/admin/posts/:id', description: 'Get blog post by ID' },
                            { method: 'PUT', path: '/blog/admin/posts/:id', description: 'Update blog post' },
                            { method: 'DELETE', path: '/blog/admin/posts/:id', description: 'Delete blog post' },
                            { method: 'POST', path: '/blog/admin/posts/:id/publish', description: 'Publish blog post' }
                        ]
                    },
                    {
                        name: 'User Management System',
                        basePath: '/users',
                        description: 'User accounts, roles, permissions, and sessions',
                        endpoints: [
                            { method: 'GET', path: '/', description: 'List all users' },
                            { method: 'POST', path: '/', description: 'Create a new user' },
                            { method: 'GET', path: '/:id', description: 'Get user by ID' },
                            { method: 'PUT', path: '/:id', description: 'Update user' },
                            { method: 'DELETE', path: '/:id', description: 'Delete user' }
                        ]
                    },
                    {
                        name: 'Client Administration',
                        basePath: '/clients',
                        description: 'Administrative client operations and bulk management'
                    },
                    {
                        name: 'Billing System',
                        basePath: '/billing',
                        description: 'Subscriptions, invoices, payments, and plans'
                    },
                    {
                        name: 'Tenant Management',
                        basePath: '/tenants',
                        description: 'Multi-tenant administration and configuration'
                    },
                    {
                        name: 'Analytics & Reporting',
                        basePath: '/analytics',
                        description: 'Dashboards, reports, and data exports'
                    },
                    {
                        name: 'System Configuration',
                        basePath: '/system',
                        description: 'Settings, feature flags, and integrations'
                    },
                    {
                        name: 'Audit & Compliance',
                        basePath: '/audit',
                        description: 'Audit logs, compliance, and data retention'
                    },
                    {
                        name: 'Monitoring & Health',
                        basePath: '/monitoring',
                        description: 'System monitoring, alerts, and metrics'
                    }
                ],
                commonResponses: {
                    success: {
                        status: 200,
                        body: {
                            success: true,
                            data: {}
                        }
                    },
                    error: {
                        status: 400,
                        body: {
                            success: false,
                            error: {
                                message: 'Error description',
                                code: 'ERROR_CODE'
                            }
                        }
                    }
                }
            });
        });

        this.logger.debug('API documentation configured');
    }

    /**
     * Setup static file serving
     */
    setupStaticFiles() {
        const staticConfig = this.appConfig.get('static');

        if (!fs.existsSync(staticConfig.path)) {
            this.logger.warn('Static files path does not exist', { path: staticConfig.path });
            return;
        }

        const staticOptions = {
            maxAge: staticConfig.maxAge,
            etag: staticConfig.etag,
            lastModified: staticConfig.lastModified,
            index: staticConfig.index,
            dotfiles: staticConfig.dotfiles,
            extensions: staticConfig.extensions
        };

        this.app.use(staticConfig.prefix, express.static(staticConfig.path, staticOptions));
        this.middlewareStack.push('static-files');

        this.logger.debug('Static files configured', { path: staticConfig.path, prefix: staticConfig.prefix });
    }

    /**
     * Setup 404 not found handler
     */
    setupNotFoundHandler() {
        this.app.use((req, res, next) => {
            const error = new AppError(
                `Cannot ${req.method} ${req.originalUrl}`,
                404,
                'ROUTE_NOT_FOUND'
            );
            next(error);
        });

        this.middlewareStack.push('not-found-handler');
    }

    /**
     * Setup global error handler
     */
    setupErrorHandler() {
        this.app.use((err, req, res, next) => {
            // Set default values
            err.statusCode = err.statusCode || 500;
            err.status = err.status || 'error';
            err.code = err.code || 'INTERNAL_ERROR';

            // Log error
            if (this.appConfig.isEnabled('errors.logErrors')) {
                const logLevel = err.statusCode >= 500 ? 'error' : 'warn';

                this.logger[logLevel]('Request error', {
                    requestId: req.requestId,
                    method: req.method,
                    url: req.originalUrl,
                    statusCode: err.statusCode,
                    code: err.code,
                    message: err.message,
                    stack: this.appConfig.isEnabled('errors.includeStack') ? err.stack : undefined,
                    userId: req.user?.id,
                    ip: req.ip
                });
            }

            // Build error response
            const errorResponse = {
                success: false,
                error: {
                    message: err.message,
                    code: err.code
                },
                requestId: req.requestId
            };

            // Include additional details in development
            if (this.appConfig.get('app.environment') === 'development' || 
                this.appConfig.isEnabled('errors.includeStack')) {
                errorResponse.error.statusCode = err.statusCode;
                errorResponse.error.stack = err.stack;
            }

            // Include validation errors if present
            if (err.errors) {
                errorResponse.error.details = err.errors;
            }

            // Handle specific error types
            if (err.name === 'ValidationError') {
                err.statusCode = 400;
                err.code = 'VALIDATION_ERROR';
            } else if (err.name === 'CastError') {
                err.statusCode = 400;
                err.code = 'INVALID_ID';
                errorResponse.error.message = 'Invalid ID format';
            } else if (err.code === 11000) {
                err.statusCode = 409;
                err.code = 'DUPLICATE_ERROR';
                errorResponse.error.message = 'Duplicate entry found';
            } else if (err.name === 'JsonWebTokenError') {
                err.statusCode = 401;
                err.code = 'INVALID_TOKEN';
                errorResponse.error.message = 'Invalid token';
            } else if (err.name === 'TokenExpiredError') {
                err.statusCode = 401;
                err.code = 'TOKEN_EXPIRED';
                errorResponse.error.message = 'Token has expired';
            }

            // Send response
            res.status(err.statusCode).json(errorResponse);
        });

        this.middlewareStack.push('error-handler');
        this.logger.debug('Error handler configured');
    }
}

module.exports = AdminApp;