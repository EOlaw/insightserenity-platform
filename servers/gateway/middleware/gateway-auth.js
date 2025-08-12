'use strict';

/**
 * @fileoverview Gateway Authentication Middleware - Comprehensive authentication and authorization
 * @module servers/gateway/middleware/gateway-auth
 * @requires jsonwebtoken
 * @requires passport
 * @requires passport-jwt
 * @requires passport-local
 * @requires crypto
 * @requires events
 */

const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { Strategy: LocalStrategy } = require('passport-local');
const crypto = require('crypto');
const { promisify } = require('util');

/**
 * GatewayAuthMiddleware class provides comprehensive authentication and authorization
 * middleware for the API Gateway. It supports multiple authentication strategies including
 * JWT, API keys, OAuth2, and session-based authentication. The middleware implements
 * role-based access control (RBAC), attribute-based access control (ABAC), multi-factor
 * authentication (MFA), and token management with refresh capabilities.
 * 
 * @class GatewayAuthMiddleware
 * @extends EventEmitter
 */
class GatewayAuthMiddleware extends EventEmitter {
    /**
     * Creates an instance of GatewayAuthMiddleware
     * @constructor
     * @param {Object} config - Authentication configuration
     * @param {Object} securityPolicy - Security policy engine
     * @param {Object} logger - Logger instance
     */
    constructor(config, securityPolicy, logger) {
        super();
        this.config = config || {};
        this.securityPolicy = securityPolicy;
        this.logger = logger;
        this.isInitialized = false;
        
        // Authentication strategies
        this.strategies = new Map();
        this.defaultStrategy = config.defaultStrategy || 'jwt';
        
        // Token management
        this.tokenBlacklist = new Set();
        this.refreshTokens = new Map();
        this.sessionTokens = new Map();
        
        // API key storage
        this.apiKeys = new Map();
        this.apiKeyPermissions = new Map();
        
        // User sessions
        this.userSessions = new Map();
        this.sessionTimeout = config.sessionTimeout || 3600000; // 1 hour
        
        // Rate limiting per user
        this.userRateLimits = new Map();
        
        // Permission cache
        this.permissionCache = new Map();
        this.permissionCacheTTL = config.permissionCacheTTL || 300000; // 5 minutes
        
        // JWT configuration
        this.jwtConfig = {
            secret: config.jwt?.secret || process.env.JWT_SECRET,
            publicKey: config.jwt?.publicKey,
            privateKey: config.jwt?.privateKey,
            algorithms: config.jwt?.algorithms || ['RS256'],
            issuer: config.jwt?.issuer || 'api-gateway',
            audience: config.jwt?.audience || 'api-gateway',
            expiresIn: config.jwt?.expiresIn || '1h',
            refreshExpiresIn: config.jwt?.refreshExpiresIn || '7d',
            clockTolerance: config.jwt?.clockTolerance || 30,
            ...config.jwt
        };
        
        // OAuth2 configuration
        this.oauth2Config = {
            enabled: config.oauth2?.enabled || false,
            providers: config.oauth2?.providers || [],
            callbackUrl: config.oauth2?.callbackUrl || '/auth/callback',
            ...config.oauth2
        };
        
        // MFA configuration
        this.mfaConfig = {
            enabled: config.mfa?.enabled || false,
            methods: config.mfa?.methods || ['totp', 'sms'],
            required: config.mfa?.required || false,
            ...config.mfa
        };
        
        // RBAC configuration
        this.rbacConfig = {
            enabled: config.rbac?.enabled !== false,
            roles: config.rbac?.roles || {},
            defaultRole: config.rbac?.defaultRole || 'user',
            hierarchical: config.rbac?.hierarchical || true,
            ...config.rbac
        };
        
        // ABAC configuration
        this.abacConfig = {
            enabled: config.abac?.enabled || false,
            policies: config.abac?.policies || [],
            policyEngine: config.abac?.policyEngine,
            ...config.abac
        };
        
        // Security headers
        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            ...config.securityHeaders
        };
        
        // Audit logging
        this.auditConfig = {
            enabled: config.audit?.enabled !== false,
            logLevel: config.audit?.logLevel || 'info',
            includeBody: config.audit?.includeBody || false,
            excludePaths: config.audit?.excludePaths || ['/health', '/metrics'],
            ...config.audit
        };
        
        // Statistics
        this.statistics = {
            totalAuthentications: 0,
            successfulAuthentications: 0,
            failedAuthentications: 0,
            tokenValidations: 0,
            tokenRefreshes: 0,
            apiKeyValidations: 0,
            authorizationChecks: 0,
            authorizationDenials: 0,
            mfaAttempts: 0,
            mfaSuccesses: 0
        };
        
        // Authentication cache
        this.authCache = new Map();
        this.authCacheTTL = config.authCacheTTL || 60000; // 1 minute
        
        // Failed attempt tracking
        this.failedAttempts = new Map();
        this.maxFailedAttempts = config.maxFailedAttempts || 5;
        this.lockoutDuration = config.lockoutDuration || 900000; // 15 minutes
    }

    /**
     * Initializes the authentication middleware
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('info', 'Authentication middleware already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing Authentication Middleware');
            
            // Initialize Passport
            this.initializePassport();
            
            // Setup authentication strategies
            this.setupAuthStrategies();
            
            // Load API keys
            await this.loadApiKeys();
            
            // Setup token cleanup
            this.startTokenCleanup();
            
            // Setup cache cleanup
            this.startCacheCleanup();
            
            this.isInitialized = true;
            this.emit('auth:initialized');
            
            this.log('info', 'Authentication Middleware initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Authentication Middleware', error);
            throw error;
        }
    }

    /**
     * Initializes Passport
     * @private
     */
    initializePassport() {
        // Serialize user
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });
        
        // Deserialize user
        passport.deserializeUser(async (id, done) => {
            try {
                const user = await this.getUserById(id);
                done(null, user);
            } catch (error) {
                done(error);
            }
        });
        
        this.log('info', 'Passport initialized');
    }

    /**
     * Sets up authentication strategies
     * @private
     */
    setupAuthStrategies() {
        // JWT Strategy
        this.setupJwtStrategy();
        
        // Local Strategy
        this.setupLocalStrategy();
        
        // API Key Strategy
        this.setupApiKeyStrategy();
        
        // OAuth2 Strategies
        if (this.oauth2Config.enabled) {
            this.setupOAuth2Strategies();
        }
        
        this.log('info', 'Authentication strategies configured');
    }

    /**
     * Sets up JWT strategy
     * @private
     */
    setupJwtStrategy() {
        const jwtOptions = {
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: this.jwtConfig.publicKey || this.jwtConfig.secret,
            issuer: this.jwtConfig.issuer,
            audience: this.jwtConfig.audience,
            algorithms: this.jwtConfig.algorithms,
            ignoreExpiration: false,
            passReqToCallback: true
        };
        
        const jwtStrategy = new JwtStrategy(jwtOptions, async (req, payload, done) => {
            try {
                // Check if token is blacklisted
                if (this.isTokenBlacklisted(payload.jti)) {
                    return done(null, false, { message: 'Token has been revoked' });
                }
                
                // Validate user
                const user = await this.validateJwtPayload(payload);
                if (!user) {
                    return done(null, false, { message: 'Invalid token payload' });
                }
                
                // Check MFA if required
                if (this.mfaConfig.enabled && this.mfaConfig.required && !payload.mfaVerified) {
                    return done(null, false, { message: 'MFA verification required' });
                }
                
                // Attach additional context
                user.tokenId = payload.jti;
                user.tokenExpiry = payload.exp;
                
                done(null, user);
            } catch (error) {
                done(error);
            }
        });
        
        passport.use('jwt', jwtStrategy);
        this.strategies.set('jwt', jwtStrategy);
    }

    /**
     * Sets up local strategy
     * @private
     */
    setupLocalStrategy() {
        const localStrategy = new LocalStrategy({
            usernameField: 'username',
            passwordField: 'password',
            passReqToCallback: true
        }, async (req, username, password, done) => {
            try {
                // Check for account lockout
                if (this.isAccountLocked(username)) {
                    return done(null, false, { message: 'Account temporarily locked' });
                }
                
                // Validate credentials
                const user = await this.validateCredentials(username, password);
                if (!user) {
                    this.recordFailedAttempt(username);
                    return done(null, false, { message: 'Invalid credentials' });
                }
                
                // Clear failed attempts
                this.clearFailedAttempts(username);
                
                done(null, user);
            } catch (error) {
                done(error);
            }
        });
        
        passport.use('local', localStrategy);
        this.strategies.set('local', localStrategy);
    }

    /**
     * Sets up API key strategy
     * @private
     */
    setupApiKeyStrategy() {
        const apiKeyStrategy = {
            name: 'apikey',
            authenticate: async (req) => {
                const apiKey = this.extractApiKey(req);
                
                if (!apiKey) {
                    return { success: false, message: 'API key not provided' };
                }
                
                const keyData = this.apiKeys.get(apiKey);
                if (!keyData) {
                    this.statistics.failedAuthentications++;
                    return { success: false, message: 'Invalid API key' };
                }
                
                // Check if key is expired
                if (keyData.expiresAt && Date.now() > keyData.expiresAt) {
                    return { success: false, message: 'API key expired' };
                }
                
                // Check rate limits for API key
                if (!this.checkApiKeyRateLimit(apiKey)) {
                    return { success: false, message: 'API key rate limit exceeded' };
                }
                
                this.statistics.apiKeyValidations++;
                
                return {
                    success: true,
                    user: {
                        id: keyData.userId,
                        apiKey: apiKey,
                        permissions: this.apiKeyPermissions.get(apiKey) || [],
                        type: 'apikey'
                    }
                };
            }
        };
        
        this.strategies.set('apikey', apiKeyStrategy);
    }

    /**
     * Sets up OAuth2 strategies
     * @private
     */
    setupOAuth2Strategies() {
        for (const provider of this.oauth2Config.providers) {
            // Setup each OAuth2 provider
            // This would use passport-google-oauth20, passport-github2, etc.
            this.log('info', `OAuth2 strategy configured for: ${provider.name}`);
        }
    }

    /**
     * Authentication middleware
     * @returns {Function} Express middleware function
     */
    authenticate() {
        return async (req, res, next) => {
            const startTime = Date.now();
            
            try {
                // Check if path is public
                if (this.isPublicPath(req.path)) {
                    return next();
                }
                
                // Get authentication strategy
                const strategy = this.getAuthStrategy(req);
                
                // Check auth cache
                const cacheKey = this.getAuthCacheKey(req);
                const cachedAuth = this.authCache.get(cacheKey);
                if (cachedAuth && Date.now() < cachedAuth.expiry) {
                    req.user = cachedAuth.user;
                    this.statistics.totalAuthentications++;
                    this.statistics.successfulAuthentications++;
                    return next();
                }
                
                // Perform authentication
                const authResult = await this.performAuthentication(req, res, strategy);
                
                if (!authResult.success) {
                    this.statistics.failedAuthentications++;
                    this.logAuthFailure(req, authResult.message);
                    
                    return res.status(401).json({
                        error: 'Authentication failed',
                        message: authResult.message
                    });
                }
                
                // Set user in request
                req.user = authResult.user;
                
                // Cache successful authentication
                this.authCache.set(cacheKey, {
                    user: authResult.user,
                    expiry: Date.now() + this.authCacheTTL
                });
                
                // Add security headers
                this.addSecurityHeaders(res);
                
                // Log successful authentication
                if (this.auditConfig.enabled) {
                    this.logAuthSuccess(req);
                }
                
                this.statistics.totalAuthentications++;
                this.statistics.successfulAuthentications++;
                
                // Record metrics
                const duration = Date.now() - startTime;
                this.emit('auth:completed', { duration, success: true });
                
                next();
            } catch (error) {
                this.log('error', 'Authentication error', error);
                this.statistics.failedAuthentications++;
                
                res.status(500).json({
                    error: 'Authentication error',
                    message: 'Internal server error'
                });
            }
        };
    }

    /**
     * Authorization middleware
     * @param {Array<string>} requiredRoles - Required roles
     * @returns {Function} Express middleware function
     */
    authorize(requiredRoles = []) {
        return async (req, res, next) => {
            try {
                // Check if user is authenticated
                if (!req.user) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Authentication required'
                    });
                }
                
                // Check RBAC
                if (this.rbacConfig.enabled) {
                    const hasRole = await this.checkRoles(req.user, requiredRoles);
                    if (!hasRole) {
                        this.statistics.authorizationDenials++;
                        this.logAuthorizationFailure(req, 'Insufficient roles');
                        
                        return res.status(403).json({
                            error: 'Forbidden',
                            message: 'Insufficient permissions'
                        });
                    }
                }
                
                // Check ABAC
                if (this.abacConfig.enabled) {
                    const hasAccess = await this.checkAttributes(req);
                    if (!hasAccess) {
                        this.statistics.authorizationDenials++;
                        this.logAuthorizationFailure(req, 'ABAC policy denied');
                        
                        return res.status(403).json({
                            error: 'Forbidden',
                            message: 'Access denied by policy'
                        });
                    }
                }
                
                // Check permissions
                const hasPermission = await this.checkPermissions(req);
                if (!hasPermission) {
                    this.statistics.authorizationDenials++;
                    this.logAuthorizationFailure(req, 'Insufficient permissions');
                    
                    return res.status(403).json({
                        error: 'Forbidden',
                        message: 'Insufficient permissions'
                    });
                }
                
                this.statistics.authorizationChecks++;
                next();
            } catch (error) {
                this.log('error', 'Authorization error', error);
                
                res.status(500).json({
                    error: 'Authorization error',
                    message: 'Internal server error'
                });
            }
        };
    }

    /**
     * Performs authentication
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {string} strategy - Authentication strategy
     * @returns {Promise<Object>} Authentication result
     */
    async performAuthentication(req, res, strategy) {
        if (strategy === 'jwt') {
            return await this.authenticateJwt(req);
        } else if (strategy === 'apikey') {
            const apiKeyStrategy = this.strategies.get('apikey');
            return await apiKeyStrategy.authenticate(req);
        } else if (strategy === 'basic') {
            return await this.authenticateBasic(req);
        } else if (strategy === 'oauth2') {
            return await this.authenticateOAuth2(req);
        } else {
            // Use Passport for other strategies
            return new Promise((resolve) => {
                passport.authenticate(strategy, { session: false }, (err, user, info) => {
                    if (err || !user) {
                        resolve({ 
                            success: false, 
                            message: info?.message || 'Authentication failed' 
                        });
                    } else {
                        resolve({ success: true, user });
                    }
                })(req, res, () => {});
            });
        }
    }

    /**
     * Authenticates JWT token
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Authentication result
     */
    async authenticateJwt(req) {
        const token = this.extractToken(req);
        
        if (!token) {
            return { success: false, message: 'Token not provided' };
        }
        
        try {
            // Verify token
            const payload = jwt.verify(token, this.jwtConfig.secret, {
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience,
                algorithms: this.jwtConfig.algorithms,
                clockTolerance: this.jwtConfig.clockTolerance
            });
            
            // Check if token is blacklisted
            if (this.isTokenBlacklisted(payload.jti)) {
                return { success: false, message: 'Token has been revoked' };
            }
            
            // Validate payload
            const user = await this.validateJwtPayload(payload);
            if (!user) {
                return { success: false, message: 'Invalid token payload' };
            }
            
            this.statistics.tokenValidations++;
            
            return { success: true, user };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { success: false, message: 'Token expired' };
            } else if (error.name === 'JsonWebTokenError') {
                return { success: false, message: 'Invalid token' };
            } else {
                throw error;
            }
        }
    }

    /**
     * Authenticates Basic auth
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Authentication result
     */
    async authenticateBasic(req) {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return { success: false, message: 'Basic auth not provided' };
        }
        
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');
        
        const user = await this.validateCredentials(username, password);
        if (!user) {
            return { success: false, message: 'Invalid credentials' };
        }
        
        return { success: true, user };
    }

    /**
     * Authenticates OAuth2
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Authentication result
     */
    async authenticateOAuth2(req) {
        // OAuth2 authentication logic
        return { success: false, message: 'OAuth2 not implemented' };
    }

    /**
     * Generates JWT token
     * @param {Object} user - User object
     * @param {Object} options - Token options
     * @returns {Object} Token data
     */
    generateToken(user, options = {}) {
        const payload = {
            sub: user.id,
            username: user.username,
            email: user.email,
            roles: user.roles || [],
            permissions: user.permissions || [],
            jti: this.generateTokenId(),
            iat: Math.floor(Date.now() / 1000),
            ...options.payload
        };
        
        const tokenOptions = {
            expiresIn: options.expiresIn || this.jwtConfig.expiresIn,
            issuer: this.jwtConfig.issuer,
            audience: this.jwtConfig.audience,
            algorithm: this.jwtConfig.algorithms[0]
        };
        
        const token = jwt.sign(payload, this.jwtConfig.secret, tokenOptions);
        
        // Generate refresh token
        const refreshToken = this.generateRefreshToken(user);
        
        return {
            token,
            refreshToken,
            expiresIn: tokenOptions.expiresIn,
            tokenType: 'Bearer'
        };
    }

    /**
     * Generates refresh token
     * @private
     * @param {Object} user - User object
     * @returns {string} Refresh token
     */
    generateRefreshToken(user) {
        const refreshToken = crypto.randomBytes(32).toString('hex');
        
        this.refreshTokens.set(refreshToken, {
            userId: user.id,
            createdAt: Date.now(),
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        });
        
        return refreshToken;
    }

    /**
     * Refreshes JWT token
     * @param {string} refreshToken - Refresh token
     * @returns {Object|null} New token data or null
     */
    async refreshToken(refreshToken) {
        const tokenData = this.refreshTokens.get(refreshToken);
        
        if (!tokenData) {
            return null;
        }
        
        // Check if refresh token is expired
        if (Date.now() > tokenData.expiresAt) {
            this.refreshTokens.delete(refreshToken);
            return null;
        }
        
        // Get user
        const user = await this.getUserById(tokenData.userId);
        if (!user) {
            return null;
        }
        
        // Generate new tokens
        const newTokens = this.generateToken(user);
        
        // Delete old refresh token
        this.refreshTokens.delete(refreshToken);
        
        this.statistics.tokenRefreshes++;
        
        return newTokens;
    }

    /**
     * Revokes a token
     * @param {string} tokenId - Token JTI
     */
    revokeToken(tokenId) {
        this.tokenBlacklist.add(tokenId);
        this.emit('token:revoked', { tokenId });
    }

    /**
     * Checks if token is blacklisted
     * @private
     * @param {string} tokenId - Token JTI
     * @returns {boolean} Blacklist status
     */
    isTokenBlacklisted(tokenId) {
        return this.tokenBlacklist.has(tokenId);
    }

    /**
     * Generates token ID
     * @private
     * @returns {string} Token ID
     */
    generateTokenId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Extracts token from request
     * @private
     * @param {Object} req - Request object
     * @returns {string|null} Token or null
     */
    extractToken(req) {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        
        // Check query parameter
        if (req.query.token) {
            return req.query.token;
        }
        
        // Check cookie
        if (req.cookies && req.cookies.token) {
            return req.cookies.token;
        }
        
        return null;
    }

    /**
     * Extracts API key from request
     * @private
     * @param {Object} req - Request object
     * @returns {string|null} API key or null
     */
    extractApiKey(req) {
        // Check header
        const headerKey = req.headers['x-api-key'] || req.headers['api-key'];
        if (headerKey) {
            return headerKey;
        }
        
        // Check query parameter
        if (req.query.api_key || req.query.apiKey) {
            return req.query.api_key || req.query.apiKey;
        }
        
        return null;
    }

    /**
     * Gets authentication strategy for request
     * @private
     * @param {Object} req - Request object
     * @returns {string} Authentication strategy
     */
    getAuthStrategy(req) {
        const authHeader = req.headers.authorization;
        
        if (authHeader) {
            if (authHeader.startsWith('Bearer ')) {
                return 'jwt';
            } else if (authHeader.startsWith('Basic ')) {
                return 'basic';
            }
        }
        
        if (this.extractApiKey(req)) {
            return 'apikey';
        }
        
        return this.defaultStrategy;
    }

    /**
     * Checks if path is public
     * @private
     * @param {string} path - Request path
     * @returns {boolean} Public status
     */
    isPublicPath(path) {
        const publicPaths = this.config.publicPaths || [];
        
        return publicPaths.some(publicPath => {
            if (typeof publicPath === 'string') {
                return path === publicPath || path.startsWith(publicPath);
            } else if (publicPath instanceof RegExp) {
                return publicPath.test(path);
            }
            return false;
        });
    }

    /**
     * Gets auth cache key
     * @private
     * @param {Object} req - Request object
     * @returns {string} Cache key
     */
    getAuthCacheKey(req) {
        const token = this.extractToken(req);
        const apiKey = this.extractApiKey(req);
        const authHeader = req.headers.authorization;
        
        if (token) {
            return `jwt:${token.substring(0, 20)}`;
        } else if (apiKey) {
            return `apikey:${apiKey}`;
        } else if (authHeader) {
            return `auth:${crypto.createHash('sha256').update(authHeader).digest('hex')}`;
        }
        
        return `auth:${req.ip}:${req.method}:${req.path}`;
    }

    /**
     * Validates JWT payload
     * @private
     * @async
     * @param {Object} payload - JWT payload
     * @returns {Promise<Object|null>} User object or null
     */
    async validateJwtPayload(payload) {
        // This would typically fetch user from database
        return {
            id: payload.sub,
            username: payload.username,
            email: payload.email,
            roles: payload.roles,
            permissions: payload.permissions
        };
    }

    /**
     * Validates credentials
     * @private
     * @async
     * @param {string} username - Username
     * @param {string} password - Password
     * @returns {Promise<Object|null>} User object or null
     */
    async validateCredentials(username, password) {
        // This would typically validate against database
        // For now, return mock user
        if (username === 'admin' && password === 'admin') {
            return {
                id: '1',
                username: 'admin',
                email: 'admin@example.com',
                roles: ['admin'],
                permissions: ['*']
            };
        }
        return null;
    }

    /**
     * Gets user by ID
     * @private
     * @async
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} User object or null
     */
    async getUserById(userId) {
        // This would typically fetch from database
        return {
            id: userId,
            username: 'user',
            email: 'user@example.com',
            roles: ['user'],
            permissions: []
        };
    }

    /**
     * Checks user roles
     * @private
     * @async
     * @param {Object} user - User object
     * @param {Array<string>} requiredRoles - Required roles
     * @returns {Promise<boolean>} Role check result
     */
    async checkRoles(user, requiredRoles) {
        if (requiredRoles.length === 0) {
            return true;
        }
        
        const userRoles = user.roles || [];
        
        // Check for super admin
        if (userRoles.includes('super-admin')) {
            return true;
        }
        
        // Check if user has any required role
        return requiredRoles.some(role => userRoles.includes(role));
    }

    /**
     * Checks attributes for ABAC
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<boolean>} Attribute check result
     */
    async checkAttributes(req) {
        if (!this.abacConfig.policyEngine) {
            return true;
        }
        
        const context = {
            user: req.user,
            resource: req.path,
            action: req.method,
            environment: {
                ip: req.ip,
                time: new Date(),
                userAgent: req.headers['user-agent']
            }
        };
        
        return await this.abacConfig.policyEngine.evaluate(context);
    }

    /**
     * Checks permissions
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<boolean>} Permission check result
     */
    async checkPermissions(req) {
        const user = req.user;
        const resource = `${req.method}:${req.path}`;
        
        // Check cache
        const cacheKey = `perm:${user.id}:${resource}`;
        const cached = this.permissionCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.allowed;
        }
        
        // Check if user has wildcard permission
        if (user.permissions && user.permissions.includes('*')) {
            this.cachePermission(cacheKey, true);
            return true;
        }
        
        // Check specific permissions
        const hasPermission = user.permissions && user.permissions.some(perm => {
            if (perm === resource) return true;
            
            // Check wildcard patterns
            const pattern = perm.replace(/\*/g, '.*');
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(resource);
        });
        
        this.cachePermission(cacheKey, hasPermission);
        return hasPermission;
    }

    /**
     * Caches permission result
     * @private
     * @param {string} key - Cache key
     * @param {boolean} allowed - Permission result
     */
    cachePermission(key, allowed) {
        this.permissionCache.set(key, {
            allowed,
            expiry: Date.now() + this.permissionCacheTTL
        });
    }

    /**
     * Checks API key rate limit
     * @private
     * @param {string} apiKey - API key
     * @returns {boolean} Rate limit check result
     */
    checkApiKeyRateLimit(apiKey) {
        const keyData = this.apiKeys.get(apiKey);
        if (!keyData || !keyData.rateLimit) {
            return true;
        }
        
        const now = Date.now();
        const windowStart = now - keyData.rateLimit.window;
        
        // Clean old requests
        keyData.requests = (keyData.requests || []).filter(time => time > windowStart);
        
        // Check limit
        if (keyData.requests.length >= keyData.rateLimit.max) {
            return false;
        }
        
        // Add current request
        keyData.requests.push(now);
        return true;
    }

    /**
     * Records failed authentication attempt
     * @private
     * @param {string} identifier - User identifier
     */
    recordFailedAttempt(identifier) {
        const attempts = this.failedAttempts.get(identifier) || {
            count: 0,
            firstAttempt: Date.now(),
            lastAttempt: Date.now()
        };
        
        attempts.count++;
        attempts.lastAttempt = Date.now();
        
        this.failedAttempts.set(identifier, attempts);
    }

    /**
     * Clears failed attempts
     * @private
     * @param {string} identifier - User identifier
     */
    clearFailedAttempts(identifier) {
        this.failedAttempts.delete(identifier);
    }

    /**
     * Checks if account is locked
     * @private
     * @param {string} identifier - User identifier
     * @returns {boolean} Lock status
     */
    isAccountLocked(identifier) {
        const attempts = this.failedAttempts.get(identifier);
        
        if (!attempts) {
            return false;
        }
        
        // Check if lockout period has expired
        if (Date.now() - attempts.lastAttempt > this.lockoutDuration) {
            this.failedAttempts.delete(identifier);
            return false;
        }
        
        return attempts.count >= this.maxFailedAttempts;
    }

    /**
     * Loads API keys
     * @private
     * @async
     */
    async loadApiKeys() {
        // This would typically load from database
        // For now, create mock API keys
        this.apiKeys.set('test-api-key', {
            userId: 'api-user-1',
            name: 'Test API Key',
            createdAt: Date.now(),
            expiresAt: null,
            rateLimit: {
                window: 60000,
                max: 100
            }
        });
        
        this.apiKeyPermissions.set('test-api-key', ['read:*', 'write:*']);
        
        this.log('info', 'API keys loaded');
    }

    /**
     * Starts token cleanup interval
     * @private
     */
    startTokenCleanup() {
        setInterval(() => {
            // Clean expired refresh tokens
            const now = Date.now();
            for (const [token, data] of this.refreshTokens) {
                if (data.expiresAt < now) {
                    this.refreshTokens.delete(token);
                }
            }
            
            // Clean expired sessions
            for (const [sessionId, session] of this.userSessions) {
                if (session.expiresAt < now) {
                    this.userSessions.delete(sessionId);
                }
            }
        }, 3600000); // Every hour
    }

    /**
     * Starts cache cleanup interval
     * @private
     */
    startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            
            // Clean auth cache
            for (const [key, data] of this.authCache) {
                if (data.expiry < now) {
                    this.authCache.delete(key);
                }
            }
            
            // Clean permission cache
            for (const [key, data] of this.permissionCache) {
                if (data.expiry < now) {
                    this.permissionCache.delete(key);
                }
            }
        }, 300000); // Every 5 minutes
    }

    /**
     * Adds security headers
     * @private
     * @param {Object} res - Response object
     */
    addSecurityHeaders(res) {
        Object.entries(this.securityHeaders).forEach(([header, value]) => {
            res.setHeader(header, value);
        });
    }

    /**
     * Logs authentication success
     * @private
     * @param {Object} req - Request object
     */
    logAuthSuccess(req) {
        if (!this.auditConfig.enabled) return;
        
        const auditLog = {
            event: 'authentication.success',
            timestamp: new Date().toISOString(),
            user: req.user.id,
            username: req.user.username,
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        };
        
        this.emit('audit:log', auditLog);
        this.log('info', 'Authentication successful', auditLog);
    }

    /**
     * Logs authentication failure
     * @private
     * @param {Object} req - Request object
     * @param {string} reason - Failure reason
     */
    logAuthFailure(req, reason) {
        if (!this.auditConfig.enabled) return;
        
        const auditLog = {
            event: 'authentication.failure',
            timestamp: new Date().toISOString(),
            reason,
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        };
        
        this.emit('audit:log', auditLog);
        this.log('warn', 'Authentication failed', auditLog);
    }

    /**
     * Logs authorization failure
     * @private
     * @param {Object} req - Request object
     * @param {string} reason - Failure reason
     */
    logAuthorizationFailure(req, reason) {
        if (!this.auditConfig.enabled) return;
        
        const auditLog = {
            event: 'authorization.failure',
            timestamp: new Date().toISOString(),
            user: req.user.id,
            username: req.user.username,
            reason,
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        };
        
        this.emit('audit:log', auditLog);
        this.log('warn', 'Authorization failed', auditLog);
    }

    /**
     * Gets authentication statistics
     * @returns {Object} Authentication statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            activeTokens: this.refreshTokens.size,
            blacklistedTokens: this.tokenBlacklist.size,
            activeSessions: this.userSessions.size,
            failedAttempts: this.failedAttempts.size,
            cachedAuths: this.authCache.size,
            cachedPermissions: this.permissionCache.size
        };
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
     * Cleans up resources
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        this.log('info', 'Cleaning up Authentication Middleware');
        
        // Clear all caches and maps
        this.authCache.clear();
        this.permissionCache.clear();
        this.tokenBlacklist.clear();
        this.refreshTokens.clear();
        this.userSessions.clear();
        this.apiKeys.clear();
        this.apiKeyPermissions.clear();
        this.failedAttempts.clear();
        
        this.isInitialized = false;
        this.emit('auth:cleanup');
    }
}

module.exports = { GatewayAuthMiddleware };