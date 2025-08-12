'use strict';

/**
 * @fileoverview Security Configuration - Enhanced security policies and rules for the API Gateway
 * @module servers/gateway/config/security-config
 * @version 2.0.0
 * @description This module provides comprehensive security configuration including authentication,
 *              authorization, rate limiting, threat protection, and security policy enforcement
 *              for the InsightSerenity API Gateway.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Helper function to load cryptographic key from file
 * @param {string} filePath - Path to the key file
 * @returns {string|null} Key content or null if file doesn't exist
 */
const loadKeyFromFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
    } catch (error) {
        console.warn(`Failed to load key from ${filePath}:`, error.message);
    }
    return null;
};

/**
 * Security configuration module providing comprehensive security policies, authentication rules,
 * authorization mechanisms, threat protection, and security enforcement for enterprise-grade
 * API gateway operations.
 */
const securityConfig = {
    /**
     * Core security policies and enterprise rules
     */
    policies: {
        // Enhanced authentication policies with multiple strategies
        authentication: {
            required: true,
            strategies: ['jwt', 'apiKey', 'oauth2', 'session'],
            jwt: {
                // FIXED: Properly load JWT secret from environment with fallback
                secret: process.env.JWT_SECRET || process.env.JWT_PRIVATE_KEY || 'insightserenity-development-secret-change-in-production',
                publicKey: process.env.JWT_PUBLIC_KEY || (process.env.JWT_PUBLIC_KEY_PATH ? loadKeyFromFile(process.env.JWT_PUBLIC_KEY_PATH) : null),
                privateKey: process.env.JWT_PRIVATE_KEY || (process.env.JWT_PRIVATE_KEY_PATH ? loadKeyFromFile(process.env.JWT_PRIVATE_KEY_PATH) : null),
                algorithms: (process.env.JWT_ALGORITHM || 'RS256').split(','),
                audience: process.env.JWT_AUDIENCE || 'insightserenity-api',
                issuer: process.env.JWT_ISSUER || 'insightserenity',
                clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE, 10) || 30,
                maxAge: process.env.JWT_EXPIRES_IN || '24h',
                refreshMaxAge: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
                ignoreExpiration: process.env.JWT_IGNORE_EXPIRATION === 'true',
                ignoreNotBefore: process.env.JWT_IGNORE_NOT_BEFORE === 'true',
                enabled: process.env.JWT_ENABLED !== 'false'
            },
            apiKey: {
                enabled: process.env.API_KEY_ENABLED === 'true',
                header: process.env.API_KEY_HEADER || 'X-API-Key',
                query: process.env.API_KEY_QUERY || 'api_key',
                validateFunction: async (apiKey) => {
                    // Enhanced API key validation with configurable patterns
                    const minLength = parseInt(process.env.API_KEY_MIN_LENGTH, 10) || 32;
                    const maxLength = parseInt(process.env.API_KEY_MAX_LENGTH, 10) || 64;
                    const pattern = new RegExp(process.env.API_KEY_PATTERN || '^[A-Za-z0-9_-]+$');
                    
                    return apiKey && 
                           apiKey.length >= minLength && 
                           apiKey.length <= maxLength && 
                           pattern.test(apiKey);
                }
            },
            oauth2: {
                enabled: process.env.OAUTH2_ENABLED === 'true',
                providers: [
                    {
                        name: 'google',
                        enabled: process.env.GOOGLE_OAUTH_ENABLED === 'true',
                        clientId: process.env.GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                        authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
                        tokenURL: 'https://oauth2.googleapis.com/token',
                        scope: ['openid', 'email', 'profile']
                    },
                    {
                        name: 'github',
                        enabled: process.env.GITHUB_OAUTH_ENABLED === 'true',
                        clientId: process.env.GITHUB_CLIENT_ID,
                        clientSecret: process.env.GITHUB_CLIENT_SECRET,
                        authorizationURL: 'https://github.com/login/oauth/authorize',
                        tokenURL: 'https://github.com/login/oauth/access_token',
                        scope: ['user:email']
                    },
                    {
                        name: 'linkedin',
                        enabled: process.env.LINKEDIN_OAUTH_ENABLED === 'true',
                        clientId: process.env.LINKEDIN_CLIENT_ID,
                        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
                        authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
                        tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
                        scope: ['r_liteprofile', 'r_emailaddress']
                    }
                ]
            },
            sessionManagement: {
                enabled: process.env.SESSION_ENABLED !== 'false',
                cookieName: process.env.SESSION_COOKIE_NAME || 'gateway-session',
                secure: process.env.SESSION_SECURE === 'true' || process.env.NODE_ENV === 'production',
                httpOnly: process.env.SESSION_HTTP_ONLY !== 'false',
                sameSite: process.env.SESSION_SAME_SITE || 'strict',
                maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000, // 24 hours
                rolling: process.env.SESSION_ROLLING !== 'false',
                secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'session-secret-change-in-production'
            }
        },

        // Enhanced authorization policies with RBAC and ABAC
        authorization: {
            enabled: process.env.AUTHORIZATION_ENABLED !== 'false',
            rbac: {
                enabled: process.env.RBAC_ENABLED !== 'false',
                roles: {
                    'super-admin': {
                        permissions: ['*'],
                        inherits: [],
                        description: 'Full system access'
                    },
                    'admin': {
                        permissions: [
                            'admin:*',
                            'users:read',
                            'users:write',
                            'organizations:*',
                            'billing:*',
                            'system:read',
                            'monitoring:*',
                            'security:read'
                        ],
                        inherits: ['user'],
                        description: 'Administrative access'
                    },
                    'organization-admin': {
                        permissions: [
                            'organization:*',
                            'members:*',
                            'billing:read',
                            'projects:*',
                            'consultants:*',
                            'clients:*'
                        ],
                        inherits: ['user'],
                        description: 'Organization management access'
                    },
                    'project-manager': {
                        permissions: [
                            'projects:*',
                            'consultants:read',
                            'clients:read',
                            'engagements:*',
                            'analytics:read'
                        ],
                        inherits: ['user'],
                        description: 'Project management access'
                    },
                    'recruiter': {
                        permissions: [
                            'jobs:*',
                            'candidates:*',
                            'applications:*',
                            'partnerships:read'
                        ],
                        inherits: ['user'],
                        description: 'Recruitment access'
                    },
                    'user': {
                        permissions: [
                            'profile:read',
                            'profile:write',
                            'projects:read',
                            'clients:read',
                            'jobs:read',
                            'applications:read'
                        ],
                        inherits: [],
                        description: 'Standard user access'
                    },
                    'guest': {
                        permissions: [
                            'public:read',
                            'auth:login',
                            'auth:register'
                        ],
                        inherits: [],
                        description: 'Guest access'
                    }
                },
                defaultRole: process.env.DEFAULT_ROLE || 'guest'
            },
            abac: {
                enabled: process.env.ABAC_ENABLED === 'true',
                policies: [
                    {
                        name: 'tenant-isolation',
                        effect: 'deny',
                        condition: {
                            'request.tenantId': { '$ne': 'user.tenantId' }
                        },
                        description: 'Prevent cross-tenant access'
                    },
                    {
                        name: 'organization-access',
                        effect: 'allow',
                        condition: {
                            'user.organizationId': { '$in': 'resource.allowedOrganizations' }
                        },
                        description: 'Allow organization-based access'
                    },
                    {
                        name: 'time-based-access',
                        effect: 'allow',
                        condition: {
                            'request.time': { '$gte': '09:00', '$lte': '17:00' }
                        },
                        description: 'Business hours access control'
                    }
                ]
            }
        },

        // Enhanced rate limiting with multiple strategies
        rateLimiting: {
            enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
            strategy: process.env.RATE_LIMIT_STRATEGY || 'sliding-window',
            storage: process.env.RATE_LIMIT_STORE || 'memory',
            keyGenerator: (req) => {
                // Enhanced key generation with multiple factors
                const factors = [];
                
                if (req.user && req.user.id) {
                    factors.push(`user:${req.user.id}`);
                } else {
                    factors.push(`ip:${req.ip}`);
                }
                
                if (req.headers['x-tenant-id']) {
                    factors.push(`tenant:${req.headers['x-tenant-id']}`);
                }
                
                if (req.user && req.user.tier) {
                    factors.push(`tier:${req.user.tier}`);
                }
                
                return factors.join('|');
            },
            skip: (req) => {
                // Skip rate limiting for super admins and health checks
                if (req.user && req.user.role === 'super-admin') {
                    return true;
                }
                if (req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
                    return true;
                }
                return false;
            },
            tiers: {
                'free': {
                    windowMs: parseInt(process.env.RATE_LIMIT_FREE_WINDOW, 10) || 60000,
                    max: parseInt(process.env.RATE_LIMIT_FREE_MAX, 10) || 100,
                    message: 'Rate limit exceeded for free tier'
                },
                'basic': {
                    windowMs: parseInt(process.env.RATE_LIMIT_BASIC_WINDOW, 10) || 60000,
                    max: parseInt(process.env.RATE_LIMIT_BASIC_MAX, 10) || 500,
                    message: 'Rate limit exceeded for basic tier'
                },
                'premium': {
                    windowMs: parseInt(process.env.RATE_LIMIT_PREMIUM_WINDOW, 10) || 60000,
                    max: parseInt(process.env.RATE_LIMIT_PREMIUM_MAX, 10) || 2000,
                    message: 'Rate limit exceeded for premium tier'
                },
                'enterprise': {
                    windowMs: parseInt(process.env.RATE_LIMIT_ENTERPRISE_WINDOW, 10) || 60000,
                    max: parseInt(process.env.RATE_LIMIT_ENTERPRISE_MAX, 10) || 10000,
                    message: 'Rate limit exceeded for enterprise tier'
                }
            },
            globalLimits: {
                perSecond: parseInt(process.env.RATE_LIMIT_GLOBAL_PER_SECOND, 10) || 100,
                perMinute: parseInt(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE, 10) || 1000,
                perHour: parseInt(process.env.RATE_LIMIT_GLOBAL_PER_HOUR, 10) || 10000,
                perDay: parseInt(process.env.RATE_LIMIT_GLOBAL_PER_DAY, 10) || 100000
            }
        },

        // Enhanced IP filtering and geo-blocking
        ipFiltering: {
            enabled: process.env.IP_FILTERING_ENABLED === 'true',
            mode: process.env.IP_FILTERING_MODE || 'blacklist', // 'whitelist', 'blacklist'
            whitelist: (process.env.IP_WHITELIST || '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16').split(',').filter(Boolean),
            blacklist: (process.env.IP_BLACKLIST || '').split(',').filter(Boolean),
            cloudflare: {
                enabled: process.env.CLOUDFLARE_ENABLED === 'true',
                trustProxy: process.env.TRUST_PROXY === 'true',
                realIpHeader: process.env.CLOUDFLARE_IP_HEADER || 'CF-Connecting-IP'
            },
            geoBlocking: {
                enabled: process.env.GEO_BLOCKING_ENABLED === 'true',
                allowedCountries: (process.env.GEO_ALLOWED_COUNTRIES || '').split(',').filter(Boolean),
                blockedCountries: (process.env.GEO_BLOCKED_COUNTRIES || '').split(',').filter(Boolean)
            }
        },

        // Enhanced security headers with CSP
        headers: {
            'Strict-Transport-Security': process.env.HSTS_HEADER || 'max-age=31536000; includeSubDomains; preload',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': process.env.X_FRAME_OPTIONS || 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin',
            'Content-Security-Policy': process.env.CSP_HEADER || "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'",
            'Permissions-Policy': process.env.PERMISSIONS_POLICY || 'geolocation=(), microphone=(), camera=()',
            'X-DNS-Prefetch-Control': 'off',
            'X-Download-Options': 'noopen',
            'X-Permitted-Cross-Domain-Policies': 'none'
        },

        // Enhanced CORS policies with dynamic origins
        cors: {
            enabled: process.env.CORS_ENABLED !== 'false',
            origin: (origin, callback) => {
                // Enhanced CORS origin validation
                const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').filter(Boolean);
                const allowedPatterns = [
                    /^https:\/\/.*\.insightserenity\.com$/,
                    /^https:\/\/.*\.insightserenity\.dev$/
                ];

                // Allow requests with no origin (mobile apps, etc.)
                if (!origin) {
                    return callback(null, true);
                }

                // Check exact matches
                if (allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }

                // Check pattern matches
                if (allowedPatterns.some(pattern => pattern.test(origin))) {
                    return callback(null, true);
                }

                // Allow localhost in development
                if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
                    return callback(null, true);
                }

                callback(new Error('Not allowed by CORS'));
            },
            credentials: process.env.CORS_CREDENTIALS !== 'false',
            methods: (process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS').split(','),
            allowedHeaders: (process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-Request-ID,X-API-Key,X-Tenant-ID').split(','),
            exposedHeaders: (process.env.CORS_EXPOSED_HEADERS || 'X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset').split(','),
            maxAge: parseInt(process.env.CORS_MAX_AGE, 10) || 86400,
            preflightContinue: false,
            optionsSuccessStatus: 204
        },

        // Enhanced input validation and sanitization
        validation: {
            enabled: process.env.VALIDATION_ENABLED !== 'false',
            bodySize: {
                json: process.env.BODY_SIZE_JSON || '10mb',
                urlencoded: process.env.BODY_SIZE_URLENCODED || '10mb',
                raw: process.env.BODY_SIZE_RAW || '10mb',
                text: process.env.BODY_SIZE_TEXT || '10mb'
            },
            queryStringLength: parseInt(process.env.QUERY_STRING_MAX_LENGTH, 10) || 2048,
            headerSize: parseInt(process.env.HEADER_MAX_SIZE, 10) || 8192,
            parameterPollution: {
                enabled: process.env.PARAMETER_POLLUTION_PROTECTION === 'true',
                whitelist: (process.env.PARAMETER_POLLUTION_WHITELIST || '').split(',').filter(Boolean)
            },
            sqlInjection: {
                enabled: process.env.SQL_INJECTION_PROTECTION !== 'false',
                patterns: [
                    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/gi,
                    /(--|#|\/\*|\*\/)/g,
                    /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
                    /(\bAND\b\s*\d+\s*=\s*\d+)/gi,
                    /(\bUNION\b.*\bSELECT\b)/gi,
                    /(\b(CONCAT|CHAR|ASCII|SUBSTRING)\s*\()/gi
                ]
            },
            xss: {
                enabled: process.env.XSS_PROTECTION !== 'false',
                patterns: [
                    /<script[^>]*>.*?<\/script>/gi,
                    /<iframe[^>]*>.*?<\/iframe>/gi,
                    /<object[^>]*>.*?<\/object>/gi,
                    /<embed[^>]*>.*?<\/embed>/gi,
                    /javascript:/gi,
                    /vbscript:/gi,
                    /on\w+\s*=/gi,
                    /<img[^>]*onerror[^>]*>/gi
                ]
            },
            pathTraversal: {
                enabled: process.env.PATH_TRAVERSAL_PROTECTION !== 'false',
                patterns: [
                    /\.\.\//g,
                    /\.\.\\/, 
                    /%2e%2e%2f/gi,
                    /%252e%252e%252f/gi,
                    /%c0%ae%c0%ae/gi,
                    /%255c%255c/gi
                ]
            }
        },

        // Enhanced DDoS protection
        ddosProtection: {
            enabled: process.env.DDOS_PROTECTION_ENABLED !== 'false',
            cloudflare: {
                enabled: process.env.CLOUDFLARE_DDOS_ENABLED === 'true',
                zoneId: process.env.CLOUDFLARE_ZONE_ID,
                apiKey: process.env.CLOUDFLARE_API_KEY
            },
            autoBlock: {
                enabled: process.env.AUTO_BLOCK_ENABLED !== 'false',
                threshold: parseInt(process.env.AUTO_BLOCK_THRESHOLD, 10) || 1000,
                blockDuration: parseInt(process.env.AUTO_BLOCK_DURATION, 10) || 3600000,
                whitelistIPs: (process.env.AUTO_BLOCK_WHITELIST || '127.0.0.1').split(',').filter(Boolean)
            },
            slowloris: {
                enabled: process.env.SLOWLORIS_PROTECTION !== 'false',
                headersTimeout: parseInt(process.env.SLOWLORIS_HEADERS_TIMEOUT, 10) || 30000,
                bodyTimeout: parseInt(process.env.SLOWLORIS_BODY_TIMEOUT, 10) || 30000,
                keepAliveTimeout: parseInt(process.env.SLOWLORIS_KEEPALIVE_TIMEOUT, 10) || 5000
            }
        },

        // Enhanced API key management
        apiKeyManagement: {
            enabled: process.env.API_KEY_MANAGEMENT_ENABLED === 'true',
            rotation: {
                enabled: process.env.API_KEY_ROTATION_ENABLED === 'true',
                interval: parseInt(process.env.API_KEY_ROTATION_INTERVAL, 10) || 2592000000, // 30 days
                gracePeriod: parseInt(process.env.API_KEY_GRACE_PERIOD, 10) || 604800000 // 7 days
            },
            scopes: {
                'read': ['GET'],
                'write': ['POST', 'PUT', 'PATCH'],
                'delete': ['DELETE'],
                'admin': ['*']
            },
            validation: {
                minLength: parseInt(process.env.API_KEY_MIN_LENGTH, 10) || 32,
                maxLength: parseInt(process.env.API_KEY_MAX_LENGTH, 10) || 64,
                pattern: new RegExp(process.env.API_KEY_PATTERN || '^[A-Za-z0-9_-]+$')
            }
        },

        // Enhanced audit logging
        auditLogging: {
            enabled: process.env.AUDIT_LOGGING_ENABLED !== 'false',
            events: [
                'authentication.success',
                'authentication.failure',
                'authorization.denied',
                'rate-limit.exceeded',
                'security.violation',
                'data.access',
                'data.modification',
                'configuration.change',
                'admin.action',
                'user.creation',
                'user.deletion',
                'password.change',
                'permission.change'
            ],
            storage: {
                type: process.env.AUDIT_STORAGE_TYPE || 'file',
                retention: parseInt(process.env.AUDIT_RETENTION, 10) || 2592000000, // 30 days
                encryption: process.env.AUDIT_ENCRYPTION === 'true'
            },
            includeRequestBody: process.env.AUDIT_INCLUDE_REQUEST_BODY === 'true',
            includeResponseBody: process.env.AUDIT_INCLUDE_RESPONSE_BODY === 'true',
            excludePaths: (process.env.AUDIT_EXCLUDE_PATHS || '/health,/metrics').split(',').filter(Boolean),
            sanitizeFields: (process.env.AUDIT_SANITIZE_FIELDS || 'password,token,secret,creditCard,ssn').split(',').filter(Boolean)
        },

        // Enhanced threat detection
        threatDetection: {
            enabled: process.env.THREAT_DETECTION_ENABLED !== 'false',
            bruteForce: {
                enabled: process.env.BRUTE_FORCE_PROTECTION !== 'false',
                maxAttempts: parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS, 10) || 5,
                windowMs: parseInt(process.env.BRUTE_FORCE_WINDOW, 10) || 900000, // 15 minutes
                blockDuration: parseInt(process.env.BRUTE_FORCE_BLOCK_DURATION, 10) || 3600000 // 1 hour
            },
            anomalyDetection: {
                enabled: process.env.ANOMALY_DETECTION_ENABLED === 'true',
                ml: {
                    model: process.env.ANOMALY_MODEL || 'isolation-forest',
                    threshold: parseFloat(process.env.ANOMALY_THRESHOLD) || 0.8
                }
            },
            botDetection: {
                enabled: process.env.BOT_DETECTION_ENABLED !== 'false',
                challenges: (process.env.BOT_CHALLENGES || 'captcha,javascript').split(',').filter(Boolean),
                userAgentBlacklist: [
                    /bot/i,
                    /crawler/i,
                    /spider/i,
                    /scraper/i,
                    /curl/i,
                    /wget/i
                ]
            }
        }
    },

    /**
     * Load cryptographic key from file (wrapper for backward compatibility)
     * @param {string} filePath - Path to the key file
     * @returns {string|null} Key content or null if file doesn't exist
     */
    loadKeyFromFile(filePath) {
        return loadKeyFromFile(filePath);
    },

    /**
     * Initialize security configuration structure with safe defaults
     * @param {Object} config - Configuration object
     */
    initializeSecurityStructure(config) {
        // Initialize base security configuration
        config.security = config.security || {};
        
        // Initialize authentication configuration and all nested objects
        config.security.authentication = config.security.authentication || {};
        config.security.authentication.jwt = config.security.authentication.jwt || {};
        config.security.authentication.sessionManagement = config.security.authentication.sessionManagement || {};
        config.security.authentication.apiKey = config.security.authentication.apiKey || {};
        config.security.authentication.oauth2 = config.security.authentication.oauth2 || {};
        
        // Initialize authorization configuration and all nested objects
        config.security.authorization = config.security.authorization || {};
        config.security.authorization.rbac = config.security.authorization.rbac || {};
        config.security.authorization.abac = config.security.authorization.abac || {};
        
        // Initialize rate limiting configuration
        config.security.rateLimiting = config.security.rateLimiting || {};
        
        // Initialize IP filtering configuration and all nested objects
        config.security.ipFiltering = config.security.ipFiltering || {};
        config.security.ipFiltering.cloudflare = config.security.ipFiltering.cloudflare || {};
        config.security.ipFiltering.geoBlocking = config.security.ipFiltering.geoBlocking || {};
        
        // Initialize headers configuration
        config.security.headers = config.security.headers || {};
        
        // Initialize CORS configuration
        config.security.cors = config.security.cors || {};
        
        // Initialize validation configuration and all nested objects
        config.security.validation = config.security.validation || {};
        config.security.validation.bodySize = config.security.validation.bodySize || {};
        config.security.validation.parameterPollution = config.security.validation.parameterPollution || {};
        config.security.validation.sqlInjection = config.security.validation.sqlInjection || {};
        config.security.validation.xss = config.security.validation.xss || {};
        config.security.validation.pathTraversal = config.security.validation.pathTraversal || {};
        
        // Initialize DDoS protection configuration and all nested objects
        config.security.ddosProtection = config.security.ddosProtection || {};
        config.security.ddosProtection.cloudflare = config.security.ddosProtection.cloudflare || {};
        config.security.ddosProtection.autoBlock = config.security.ddosProtection.autoBlock || {};
        config.security.ddosProtection.slowloris = config.security.ddosProtection.slowloris || {};
        
        // Initialize API key management configuration and all nested objects
        config.security.apiKeyManagement = config.security.apiKeyManagement || {};
        config.security.apiKeyManagement.rotation = config.security.apiKeyManagement.rotation || {};
        config.security.apiKeyManagement.scopes = config.security.apiKeyManagement.scopes || {};
        config.security.apiKeyManagement.validation = config.security.apiKeyManagement.validation || {};
        
        // Initialize audit logging configuration and all nested objects
        config.security.auditLogging = config.security.auditLogging || {};
        config.security.auditLogging.storage = config.security.auditLogging.storage || {};
        
        // Initialize threat detection configuration and all nested objects
        config.security.threatDetection = config.security.threatDetection || {};
        config.security.threatDetection.bruteForce = config.security.threatDetection.bruteForce || {};
        config.security.threatDetection.anomalyDetection = config.security.threatDetection.anomalyDetection || {};
        config.security.threatDetection.anomalyDetection.ml = config.security.threatDetection.anomalyDetection.ml || {};
        config.security.threatDetection.botDetection = config.security.threatDetection.botDetection || {};
    },

    /**
     * Apply security transformations to configuration with enhanced error handling
     * @param {Object} config - Configuration object to transform
     * @throws {Error} If security configuration is invalid
     */
    applyTransformations(config) {
        try {
            console.log('Applying security configuration transformations...');
            
            // FIXED: Initialize security configuration structure FIRST
            this.initializeSecurityStructure(config);

            // Merge security policies with environment-specific overrides
            config.security = {
                ...this.policies,
                ...config.security
            };

            // FIXED: Ensure JWT configuration is properly mapped
            this.mapJWTConfiguration(config);

            // Apply environment-specific security settings
            this.applyEnvironmentSettings(config);

            // Validate security configuration
            this.validateSecurityConfig(config);

            // Setup security middleware chain
            this.setupSecurityMiddleware(config);

            console.log('Security configuration transformations completed successfully');

        } catch (error) {
            console.error('Security configuration transformation failed:', error.message);
            throw error;
        }
    },

    /**
     * Map JWT configuration from various sources
     * @param {Object} config - Configuration object
     */
    mapJWTConfiguration(config) {
        // Ensure JWT configuration exists
        if (!config.security.authentication) {
            config.security.authentication = {};
        }
        if (!config.security.authentication.jwt) {
            config.security.authentication.jwt = {};
        }

        // Map from environment variables with proper fallbacks
        const jwtConfig = config.security.authentication.jwt;
        
        // FIXED: Primary mapping from environment variables
        jwtConfig.secret = jwtConfig.secret || 
                          process.env.JWT_SECRET || 
                          process.env.JWT_PRIVATE_KEY ||
                          config.auth?.jwt?.secret ||
                          'insightserenity-development-secret-change-in-production';

        jwtConfig.publicKey = jwtConfig.publicKey || 
                             process.env.JWT_PUBLIC_KEY || 
                             (process.env.JWT_PUBLIC_KEY_PATH ? loadKeyFromFile(process.env.JWT_PUBLIC_KEY_PATH) : null) ||
                             config.auth?.jwt?.publicKey;

        jwtConfig.privateKey = jwtConfig.privateKey || 
                              process.env.JWT_PRIVATE_KEY || 
                              (process.env.JWT_PRIVATE_KEY_PATH ? loadKeyFromFile(process.env.JWT_PRIVATE_KEY_PATH) : null) ||
                              config.auth?.jwt?.privateKey;

        // Map other JWT properties
        jwtConfig.algorithms = jwtConfig.algorithms || 
                              (process.env.JWT_ALGORITHM || 'RS256').split(',') ||
                              config.auth?.jwt?.algorithms ||
                              ['RS256'];

        jwtConfig.audience = jwtConfig.audience || 
                            process.env.JWT_AUDIENCE || 
                            config.auth?.jwt?.audience ||
                            'insightserenity-api';

        jwtConfig.issuer = jwtConfig.issuer || 
                          process.env.JWT_ISSUER || 
                          config.auth?.jwt?.issuer ||
                          'insightserenity';

        jwtConfig.expiresIn = jwtConfig.expiresIn || 
                             process.env.JWT_EXPIRES_IN || 
                             config.auth?.jwt?.expiresIn ||
                             '24h';

        // Ensure enabled status is properly set
        jwtConfig.enabled = jwtConfig.enabled !== false && process.env.JWT_ENABLED !== 'false';

        console.log('JWT configuration mapped successfully', {
            hasSecret: !!jwtConfig.secret,
            hasPublicKey: !!jwtConfig.publicKey,
            hasPrivateKey: !!jwtConfig.privateKey,
            algorithms: jwtConfig.algorithms,
            enabled: jwtConfig.enabled
        });
    },

    /**
     * Apply environment-specific security settings
     * @param {Object} config - Configuration object
     */
    applyEnvironmentSettings(config) {
        const environment = config.environment || process.env.NODE_ENV || 'development';
        
        console.log(`Applying ${environment} environment security settings...`);

        if (environment === 'production') {
            // Enforce strict security in production
            if (config.security.authentication) {
                config.security.authentication.required = true;
            }
            if (config.security.authorization) {
                config.security.authorization.enabled = true;
            }
            if (config.security.rateLimiting) {
                config.security.rateLimiting.enabled = true;
            }
            if (config.security.validation) {
                config.security.validation.enabled = true;
            }
            if (config.security.ddosProtection) {
                config.security.ddosProtection.enabled = true;
            }
            if (config.security.auditLogging) {
                config.security.auditLogging.enabled = true;
            }
            if (config.security.threatDetection) {
                config.security.threatDetection.enabled = true;
            }
            if (config.security.headers) {
                config.security.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
            }
            
            // Disable stack traces in production
            config.security.errorHandling = {
                exposeStack: false,
                exposeDetails: false,
                sanitizeErrors: true
            };
            
            // Validate production-specific requirements
            if (config.security.authentication && 
                config.security.authentication.jwt && 
                config.security.authentication.jwt.secret === 'insightserenity-development-secret-change-in-production') {
                console.warn('WARNING: Using development JWT secret in production environment!');
            }
            
        } else if (environment === 'development') {
            // Relax some security settings for development
            if (config.security.ipFiltering) {
                config.security.ipFiltering.enabled = false;
            }
            if (config.security.cors) {
                config.security.cors.origin = true; // Allow all origins in development
            }
            if (config.security.validation && config.security.validation.sqlInjection) {
                config.security.validation.sqlInjection.enabled = false;
            }
            if (config.security.ddosProtection) {
                config.security.ddosProtection.enabled = false;
            }
            if (config.security.threatDetection && config.security.threatDetection.botDetection) {
                config.security.threatDetection.botDetection.enabled = false;
            }
            
            // Enable detailed error information
            config.security.errorHandling = {
                exposeStack: true,
                exposeDetails: true,
                sanitizeErrors: false
            };
            
        } else if (environment === 'test') {
            // Test environment settings
            if (config.security.rateLimiting) {
                config.security.rateLimiting.enabled = false;
            }
            if (config.security.auditLogging) {
                config.security.auditLogging.enabled = false;
            }
            if (config.security.ddosProtection) {
                config.security.ddosProtection.enabled = false;
            }
            if (config.security.threatDetection) {
                config.security.threatDetection.enabled = false;
            }
            
            config.security.errorHandling = {
                exposeStack: true,
                exposeDetails: true,
                sanitizeErrors: false
            };
        }

        console.log(`${environment} environment security settings applied`);
    },

    /**
     * Enhanced security configuration validation with defensive checks
     * @param {Object} config - Configuration to validate
     * @throws {Error} If configuration is invalid
     */
    validateSecurityConfig(config) {
        console.log('Validating security configuration...');
        
        const errors = [];

        // Ensure security configuration structure exists
        if (!config.security) {
            errors.push('Security configuration is missing');
            throw new Error(`Security configuration validation failed:\n${errors.join('\n')}`);
        }

        // Ensure authentication configuration exists
        if (!config.security.authentication) {
            config.security.authentication = {};
        }

        // Ensure JWT configuration exists
        if (!config.security.authentication.jwt) {
            config.security.authentication.jwt = {};
        }

        // FIXED: Enhanced JWT validation with better error messages and defensive checks
        const jwtConfig = config.security.authentication.jwt;
        if (jwtConfig.enabled !== false) {
            if (!jwtConfig.secret && !jwtConfig.publicKey) {
                errors.push('JWT authentication requires either a secret key or public key to be configured. Please set JWT_SECRET environment variable or provide JWT_PUBLIC_KEY.');
            }

            // Validate JWT secret strength in production
            if (jwtConfig.secret && config.environment === 'production') {
                if (jwtConfig.secret.length < 32) {
                    errors.push('JWT secret must be at least 32 characters long in production environment');
                }
                if (jwtConfig.secret === 'insightserenity-development-secret-change-in-production') {
                    errors.push('JWT secret must be changed from the default value in production environment');
                }
            }

            // Validate JWT algorithms
            if (jwtConfig.algorithms && Array.isArray(jwtConfig.algorithms)) {
                const validAlgorithms = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];
                const invalidAlgorithms = jwtConfig.algorithms.filter(alg => !validAlgorithms.includes(alg));
                if (invalidAlgorithms.length > 0) {
                    errors.push(`Invalid JWT algorithms: ${invalidAlgorithms.join(', ')}`);
                }
            }
        }

        // Validate rate limiting configuration with defensive checks
        if (config.security.rateLimiting && config.security.rateLimiting.enabled) {
            if (!config.security.rateLimiting.storage) {
                errors.push('Rate limiting requires storage configuration (memory or redis)');
            }
            
            if (config.security.rateLimiting.storage === 'redis') {
                if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
                    errors.push('Redis rate limiting requires REDIS_HOST or REDIS_URL environment variable');
                }
            }
        }

        // Validate CORS configuration with defensive checks
        if (config.security.cors && config.security.cors.enabled) {
            if (!config.security.cors.origin && config.environment === 'production') {
                errors.push('CORS origin must be explicitly configured in production environment');
            }
        }

        // Validate audit logging configuration with defensive checks
        if (config.security.auditLogging && config.security.auditLogging.enabled) {
            // Ensure storage configuration exists
            if (!config.security.auditLogging.storage) {
                config.security.auditLogging.storage = {};
            }
            
            if (!config.security.auditLogging.storage.type) {
                errors.push('Audit logging requires storage type configuration');
            }
            
            if (config.security.auditLogging.storage.type === 'elasticsearch') {
                if (!process.env.ES_NODE1 && !process.env.ELASTICSEARCH_URL) {
                    errors.push('Elasticsearch audit logging requires ES_NODE1 or ELASTICSEARCH_URL environment variable');
                }
            }
        }

        // Validate session configuration with defensive checks
        if (config.security.authentication.sessionManagement && config.security.authentication.sessionManagement.enabled) {
            if (!config.security.authentication.sessionManagement.secret) {
                errors.push('Session management requires a secret key');
            }
        }

        // Report validation errors
        if (errors.length > 0) {
            console.error('Security configuration validation failed:', errors);
            throw new Error(`Security configuration validation failed:\n${errors.join('\n')}`);
        }

        console.log('Security configuration validation passed');
    },

    /**
     * Setup security middleware chain based on configuration
     * @param {Object} config - Configuration object
     */
    setupSecurityMiddleware(config) {
        console.log('Setting up security middleware chain...');
        
        const middlewareChain = [];

        // Add middleware based on enabled features
        if (config.security.ipFiltering && config.security.ipFiltering.enabled) {
            middlewareChain.push('ipFiltering');
        }

        if (config.security.ddosProtection && config.security.ddosProtection.enabled) {
            middlewareChain.push('ddosProtection');
        }

        if (config.security.headers) {
            middlewareChain.push('securityHeaders');
        }

        if (config.security.cors && config.security.cors.enabled) {
            middlewareChain.push('cors');
        }

        if (config.security.validation && config.security.validation.enabled) {
            middlewareChain.push('validation');
        }

        if (config.security.authentication && config.security.authentication.required) {
            middlewareChain.push('authentication');
        }

        if (config.security.authorization && config.security.authorization.enabled) {
            middlewareChain.push('authorization');
        }

        if (config.security.rateLimiting && config.security.rateLimiting.enabled) {
            middlewareChain.push('rateLimiting');
        }

        if (config.security.auditLogging && config.security.auditLogging.enabled) {
            middlewareChain.push('auditLogging');
        }

        if (config.security.threatDetection && config.security.threatDetection.enabled) {
            middlewareChain.push('threatDetection');
        }

        config.security.middlewareChain = middlewareChain;
        
        console.log('Security middleware chain configured:', middlewareChain);
    },

    /**
     * Get security headers for response
     * @param {Object} config - Configuration object
     * @returns {Object} Security headers
     */
    getSecurityHeaders(config) {
        return { 
            ...this.policies.headers,
            ...(config?.security?.headers || {})
        };
    },

    /**
     * Check if request requires authentication
     * @param {string} path - Request path
     * @param {Array} publicPaths - List of public paths
     * @returns {boolean} True if authentication is required
     */
    requiresAuthentication(path, publicPaths = []) {
        const defaultPublicPaths = [
            '/health',
            '/health/*',
            '/metrics',
            '/api-docs',
            '/api-docs/*',
            '/openapi.json',
            '/api/auth/login',
            '/api/auth/register',
            '/api/auth/forgot-password',
            '/api/auth/reset-password'
        ];

        const allPublicPaths = [...defaultPublicPaths, ...publicPaths];

        return !allPublicPaths.some(publicPath => {
            if (publicPath.endsWith('*')) {
                return path.startsWith(publicPath.slice(0, -1));
            }
            return path === publicPath;
        });
    },

    /**
     * Get rate limit configuration for a user tier
     * @param {string} tier - User tier
     * @returns {Object} Rate limit configuration
     */
    getRateLimitConfig(tier) {
        return this.policies.rateLimiting.tiers[tier] || this.policies.rateLimiting.tiers.free;
    },

    /**
     * Generate secure random string for secrets
     * @param {number} length - Length of the string
     * @returns {string} Random string
     */
    generateSecureSecret(length = 64) {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    },

    /**
     * Validate password strength
     * @param {string} password - Password to validate
     * @returns {Object} Validation result
     */
    validatePasswordStrength(password) {
        const result = {
            isValid: false,
            score: 0,
            feedback: []
        };

        if (!password) {
            result.feedback.push('Password is required');
            return result;
        }

        if (password.length < 8) {
            result.feedback.push('Password must be at least 8 characters long');
        } else {
            result.score += 1;
        }

        if (!/[a-z]/.test(password)) {
            result.feedback.push('Password must contain lowercase letters');
        } else {
            result.score += 1;
        }

        if (!/[A-Z]/.test(password)) {
            result.feedback.push('Password must contain uppercase letters');
        } else {
            result.score += 1;
        }

        if (!/\d/.test(password)) {
            result.feedback.push('Password must contain numbers');
        } else {
            result.score += 1;
        }

        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\?]/.test(password)) {
            result.feedback.push('Password must contain special characters');
        } else {
            result.score += 1;
        }

        result.isValid = result.score >= 4 && result.feedback.length === 0;
        
        return result;
    }
};

module.exports = securityConfig;