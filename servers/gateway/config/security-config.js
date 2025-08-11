'use strict';

/**
 * @fileoverview Security Configuration - Security policies and rules for the API Gateway
 * @module servers/gateway/config/security-config
 */

/**
 * Security configuration module provides security policies, authentication rules,
 * and threat protection configurations.
 */
const securityConfig = {
    /**
     * Security policies and rules
     */
    policies: {
        // Authentication policies
        authentication: {
            required: true,
            strategies: ['jwt', 'apiKey', 'oauth2'],
            jwt: {
                algorithms: ['HS256', 'RS256'],
                audience: 'insightserenity-api',
                issuer: 'insightserenity',
                clockTolerance: 30,
                maxAge: '24h',
                ignoreExpiration: false,
                ignoreNotBefore: false
            },
            apiKey: {
                header: 'X-API-Key',
                query: 'api_key',
                validateFunction: async (apiKey) => {
                    // Implement API key validation logic
                    return apiKey && apiKey.length === 32;
                }
            },
            oauth2: {
                providers: [
                    {
                        name: 'google',
                        clientId: process.env.GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                        authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
                        tokenURL: 'https://oauth2.googleapis.com/token',
                        scope: ['openid', 'email', 'profile']
                    },
                    {
                        name: 'github',
                        clientId: process.env.GITHUB_CLIENT_ID,
                        clientSecret: process.env.GITHUB_CLIENT_SECRET,
                        authorizationURL: 'https://github.com/login/oauth/authorize',
                        tokenURL: 'https://github.com/login/oauth/access_token',
                        scope: ['user:email']
                    }
                ]
            },
            sessionManagement: {
                enabled: true,
                cookieName: 'gateway-session',
                secure: true,
                httpOnly: true,
                sameSite: 'strict',
                maxAge: 86400000, // 24 hours
                rolling: true
            }
        },

        // Authorization policies
        authorization: {
            enabled: true,
            rbac: {
                enabled: true,
                roles: {
                    'super-admin': {
                        permissions: ['*'],
                        inherits: []
                    },
                    'admin': {
                        permissions: [
                            'admin:*',
                            'users:read',
                            'users:write',
                            'organizations:*',
                            'billing:*',
                            'system:read'
                        ],
                        inherits: ['user']
                    },
                    'organization-admin': {
                        permissions: [
                            'organization:*',
                            'members:*',
                            'billing:read',
                            'projects:*'
                        ],
                        inherits: ['user']
                    },
                    'user': {
                        permissions: [
                            'profile:read',
                            'profile:write',
                            'projects:read',
                            'clients:read'
                        ],
                        inherits: []
                    },
                    'guest': {
                        permissions: [
                            'public:read'
                        ],
                        inherits: []
                    }
                },
                defaultRole: 'guest'
            },
            abac: {
                enabled: true,
                policies: [
                    {
                        name: 'tenant-isolation',
                        effect: 'deny',
                        condition: {
                            'request.tenantId': { '$ne': 'user.tenantId' }
                        }
                    },
                    {
                        name: 'organization-access',
                        effect: 'allow',
                        condition: {
                            'user.organizationId': { '$in': 'resource.allowedOrganizations' }
                        }
                    }
                ]
            }
        },

        // Rate limiting policies
        rateLimiting: {
            enabled: true,
            strategy: 'sliding-window', // 'fixed-window', 'sliding-window', 'token-bucket'
            storage: 'redis', // 'memory', 'redis'
            keyGenerator: (req) => {
                // Generate rate limit key based on user or IP
                if (req.user && req.user.id) {
                    return `user:${req.user.id}`;
                }
                return `ip:${req.ip}`;
            },
            skip: (req) => {
                // Skip rate limiting for certain conditions
                return req.user && req.user.role === 'super-admin';
            },
            tiers: {
                'free': {
                    windowMs: 60000,
                    max: 100,
                    message: 'Rate limit exceeded for free tier'
                },
                'basic': {
                    windowMs: 60000,
                    max: 500,
                    message: 'Rate limit exceeded for basic tier'
                },
                'premium': {
                    windowMs: 60000,
                    max: 2000,
                    message: 'Rate limit exceeded for premium tier'
                },
                'enterprise': {
                    windowMs: 60000,
                    max: 10000,
                    message: 'Rate limit exceeded for enterprise tier'
                }
            },
            globalLimits: {
                perSecond: 100,
                perMinute: 1000,
                perHour: 10000,
                perDay: 100000
            }
        },

        // IP filtering and whitelisting
        ipFiltering: {
            enabled: true,
            mode: 'blacklist', // 'whitelist', 'blacklist'
            whitelist: [
                '127.0.0.1',
                '::1',
                '10.0.0.0/8',
                '172.16.0.0/12',
                '192.168.0.0/16'
            ],
            blacklist: [],
            cloudflare: {
                enabled: true,
                trustProxy: true,
                realIpHeader: 'CF-Connecting-IP'
            },
            geoBlocking: {
                enabled: false,
                allowedCountries: [],
                blockedCountries: []
            }
        },

        // Security headers
        headers: {
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
            'X-DNS-Prefetch-Control': 'off',
            'X-Download-Options': 'noopen',
            'X-Permitted-Cross-Domain-Policies': 'none'
        },

        // CORS policies
        cors: {
            enabled: true,
            origin: (origin, callback) => {
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:3001',
                    'https://insightserenity.com',
                    /^https:\/\/.*\.insightserenity\.com$/
                ];

                if (!origin || allowedOrigins.some(allowed => {
                    if (allowed instanceof RegExp) {
                        return allowed.test(origin);
                    }
                    return allowed === origin;
                })) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'X-Request-ID',
                'X-API-Key',
                'X-Tenant-ID'
            ],
            exposedHeaders: [
                'X-Request-ID',
                'X-RateLimit-Limit',
                'X-RateLimit-Remaining',
                'X-RateLimit-Reset'
            ],
            maxAge: 86400,
            preflightContinue: false,
            optionsSuccessStatus: 204
        },

        // Input validation and sanitization
        validation: {
            enabled: true,
            bodySize: {
                json: '10mb',
                urlencoded: '10mb',
                raw: '10mb',
                text: '10mb'
            },
            queryStringLength: 2048,
            headerSize: 8192,
            parameterPollution: {
                enabled: true,
                whitelist: []
            },
            sqlInjection: {
                enabled: true,
                patterns: [
                    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/gi,
                    /(--|#|\/\*|\*\/)/g,
                    /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
                    /(\bAND\b\s*\d+\s*=\s*\d+)/gi
                ]
            },
            xss: {
                enabled: true,
                patterns: [
                    /<script[^>]*>.*?<\/script>/gi,
                    /<iframe[^>]*>.*?<\/iframe>/gi,
                    /javascript:/gi,
                    /on\w+\s*=/gi
                ]
            },
            pathTraversal: {
                enabled: true,
                patterns: [
                    /\.\.\//g,
                    /\.\.\\/, 
                    /%2e%2e%2f/gi,
                    /%252e%252e%252f/gi
                ]
            }
        },

        // DDoS protection
        ddosProtection: {
            enabled: true,
            cloudflare: {
                enabled: false,
                zoneId: process.env.CLOUDFLARE_ZONE_ID,
                apiKey: process.env.CLOUDFLARE_API_KEY
            },
            autoBlock: {
                enabled: true,
                threshold: 1000, // Requests per minute
                blockDuration: 3600000, // 1 hour
                whitelistIPs: ['127.0.0.1']
            },
            slowloris: {
                enabled: true,
                headersTimeout: 30000,
                bodyTimeout: 30000,
                keepAliveTimeout: 5000
            }
        },

        // API key management
        apiKeyManagement: {
            enabled: true,
            rotation: {
                enabled: true,
                interval: 2592000000, // 30 days
                gracePeriod: 604800000 // 7 days
            },
            scopes: {
                'read': ['GET'],
                'write': ['POST', 'PUT', 'PATCH'],
                'delete': ['DELETE'],
                'admin': ['*']
            },
            validation: {
                minLength: 32,
                maxLength: 64,
                pattern: /^[A-Za-z0-9_-]+$/
            }
        },

        // Audit logging
        auditLogging: {
            enabled: true,
            events: [
                'authentication.success',
                'authentication.failure',
                'authorization.denied',
                'rate-limit.exceeded',
                'security.violation',
                'data.access',
                'data.modification',
                'configuration.change'
            ],
            storage: {
                type: 'elasticsearch', // 'file', 'database', 'elasticsearch'
                retention: 2592000000, // 30 days
                encryption: true
            },
            includeRequestBody: false,
            includeResponseBody: false,
            excludePaths: ['/health', '/metrics'],
            sanitizeFields: ['password', 'token', 'secret', 'creditCard']
        },

        // Threat detection
        threatDetection: {
            enabled: true,
            bruteForce: {
                enabled: true,
                maxAttempts: 5,
                windowMs: 900000, // 15 minutes
                blockDuration: 3600000 // 1 hour
            },
            anomalyDetection: {
                enabled: false,
                ml: {
                    model: 'isolation-forest',
                    threshold: 0.8
                }
            },
            botDetection: {
                enabled: true,
                challenges: ['captcha', 'javascript'],
                userAgentBlacklist: [
                    /bot/i,
                    /crawler/i,
                    /spider/i,
                    /scraper/i
                ]
            }
        }
    },

    /**
     * Apply security transformations to configuration
     * @param {Object} config - Configuration object to transform
     */
    applyTransformations(config) {
        // Ensure security configuration exists
        config.security = config.security || {};

        // Merge security policies
        config.security = {
            ...this.policies,
            ...config.security
        };

        // Apply environment-specific security settings
        this.applyEnvironmentSettings(config);

        // Validate security configuration
        this.validateSecurityConfig(config);

        // Setup security middleware chain
        this.setupSecurityMiddleware(config);
    },

    /**
     * Apply environment-specific security settings
     * @param {Object} config - Configuration object
     */
    applyEnvironmentSettings(config) {
        if (config.environment === 'production') {
            // Enforce strict security in production
            config.security.authentication.required = true;
            config.security.authorization.enabled = true;
            config.security.rateLimiting.enabled = true;
            config.security.validation.enabled = true;
            config.security.ddosProtection.enabled = true;
            config.security.auditLogging.enabled = true;
            config.security.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
            
            // Disable stack traces in production
            config.security.errorHandling = {
                exposeStack: false,
                exposeDetails: false
            };
        } else if (config.environment === 'development') {
            // Relax some security settings for development
            config.security.ipFiltering.enabled = false;
            config.security.cors.origin = true; // Allow all origins in development
            config.security.validation.sqlInjection.enabled = false;
            config.security.ddosProtection.enabled = false;
            
            // Enable detailed error information
            config.security.errorHandling = {
                exposeStack: true,
                exposeDetails: true
            };
        }
    },

    /**
     * Validate security configuration
     * @param {Object} config - Configuration to validate
     * @throws {Error} If configuration is invalid
     */
    validateSecurityConfig(config) {
        // Validate JWT configuration
        if (config.security.authentication.jwt.enabled !== false) {
            if (!config.security.authentication.jwt.secret && !config.security.authentication.jwt.publicKey) {
                throw new Error('JWT secret or public key must be configured');
            }
        }

        // Validate rate limiting configuration
        if (config.security.rateLimiting.enabled) {
            if (!config.security.rateLimiting.storage) {
                throw new Error('Rate limiting storage must be configured');
            }
        }

        // Validate CORS configuration
        if (config.security.cors.enabled) {
            if (!config.security.cors.origin) {
                throw new Error('CORS origin must be configured');
            }
        }

        // Validate audit logging
        if (config.security.auditLogging.enabled) {
            if (!config.security.auditLogging.storage.type) {
                throw new Error('Audit logging storage type must be configured');
            }
        }
    },

    /**
     * Setup security middleware chain
     * @param {Object} config - Configuration object
     */
    setupSecurityMiddleware(config) {
        config.security.middlewareChain = [
            'ipFiltering',
            'ddosProtection',
            'securityHeaders',
            'cors',
            'validation',
            'authentication',
            'authorization',
            'rateLimiting',
            'auditLogging'
        ].filter(middleware => {
            const middlewareConfig = config.security[middleware];
            return middlewareConfig && middlewareConfig.enabled !== false;
        });
    },

    /**
     * Get security headers for response
     * @returns {Object} Security headers
     */
    getSecurityHeaders() {
        return { ...this.policies.headers };
    },

    /**
     * Check if request should be authenticated
     * @param {string} path - Request path
     * @param {Array} publicPaths - List of public paths
     * @returns {boolean} True if authentication is required
     */
    requiresAuthentication(path, publicPaths = []) {
        return !publicPaths.some(publicPath => {
            if (publicPath.endsWith('*')) {
                return path.startsWith(publicPath.slice(0, -1));
            }
            return path === publicPath;
        });
    },

    /**
     * Get rate limit configuration for a tier
     * @param {string} tier - User tier
     * @returns {Object} Rate limit configuration
     */
    getRateLimitConfig(tier) {
        return this.policies.rateLimiting.tiers[tier] || this.policies.rateLimiting.tiers.free;
    }
};

module.exports = securityConfig;