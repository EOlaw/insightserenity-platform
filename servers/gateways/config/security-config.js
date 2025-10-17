/**
 * @fileoverview Security Configuration
 * @module servers/gateway/config/security-config
 */

module.exports = {
    // CORS Configuration
    cors: {
        enabled: process.env.CORS_ENABLED === 'true',
        origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-API-Key',
            'X-Tenant-ID',
            'X-Organization-ID',
            'X-Request-ID',
            'X-Correlation-ID',
            'X-API-Version'
        ],
        exposedHeaders: [
            'X-Request-ID',
            'X-Correlation-ID',
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
            'X-Response-Time'
        ],
        maxAge: 86400,
        preflightContinue: false,
        optionsSuccessStatus: 204
    },

    // Helmet Configuration
    helmet: {
        enabled: process.env.HELMET_ENABLED === 'true',
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        dnsPrefetchControl: true,
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
        referrerPolicy: { policy: 'same-origin' },
        xssFilter: true
    },

    // JWT Configuration
    jwt: {
        enabled: true,
        secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        algorithm: 'HS256',
        issuer: 'insightserenity-gateway',
        audience: 'insightserenity-services',
        clockTolerance: 30
    },

    // API Key Configuration
    apiKey: {
        enabled: process.env.ENABLE_API_KEY_AUTH === 'true',
        header: process.env.API_KEY_HEADER || 'X-API-Key',
        keys: new Map([
            ['service-admin', {
                key: process.env.ADMIN_API_KEY || 'admin-key-change-in-production',
                roles: ['admin'],
                rateLimit: 10000
            }],
            ['service-customer', {
                key: process.env.CUSTOMER_API_KEY || 'customer-key-change-in-production',
                roles: ['service'],
                rateLimit: 5000
            }],
            ['external-partner', {
                key: process.env.PARTNER_API_KEY || 'partner-key-change-in-production',
                roles: ['partner'],
                rateLimit: 1000
            }]
        ])
    },

    // Session Configuration
    session: {
        secret: process.env.SESSION_SECRET || 'change-this-session-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000,
            sameSite: 'strict'
        },
        name: 'gateway.sid',
        rolling: true
    },

    // SSL/TLS Configuration
    ssl: {
        enabled: process.env.SSL_ENABLED === 'true',
        key: process.env.SSL_KEY_PATH || './ssl/key.pem',
        cert: process.env.SSL_CERT_PATH || './ssl/cert.pem',
        ca: process.env.SSL_CA_PATH || './ssl/ca.pem',
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        requestCert: false,
        minVersion: 'TLSv1.2',
        ciphers: [
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES128-SHA256',
            'ECDHE-RSA-AES256-SHA384'
        ].join(':')
    },

    // Authentication Strategies
    authentication: {
        strategies: ['jwt', 'apiKey', 'session'],
        jwt: {
            extractor: 'fromAuthHeaderAsBearerToken',
            passReqToCallback: true
        },
        oauth: {
            enabled: false,
            providers: ['google', 'github', 'linkedin']
        }
    },

    // Authorization Configuration
    authorization: {
        enabled: true,
        defaultPolicy: 'deny',
        policies: {
            admin: {
                roles: ['super_admin', 'admin'],
                permissions: ['*']
            },
            user: {
                roles: ['user'],
                permissions: ['read', 'write:own']
            },
            service: {
                roles: ['service'],
                permissions: ['read', 'write', 'admin']
            }
        }
    },

    // IP Filtering
    ipFiltering: {
        enabled: false,
        mode: 'whitelist', // 'whitelist' or 'blacklist'
        whitelist: [],
        blacklist: [],
        trustProxy: true
    },

    // Request Validation
    validation: {
        request: {
            enabled: true,
            body: true,
            params: true,
            query: true,
            headers: false
        },
        response: {
            enabled: false,
            body: true,
            headers: false
        },
        schemas: {
            strict: false,
            coerceTypes: true,
            additionalProperties: false
        }
    },

    // Security Headers
    headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'X-Permitted-Cross-Domain-Policies': 'none',
        'Referrer-Policy': 'same-origin',
        'Feature-Policy': "geolocation 'none'; microphone 'none'; camera 'none'"
    },

    // DDoS Protection
    ddosProtection: {
        enabled: true,
        burst: 10,
        limit: 100,
        maxcount: 500,
        trustProxy: true,
        includeUserAgent: true,
        whitelist: [],
        errormessage: 'Too many requests, please try again later.',
        testmode: false
    },

    // Input Sanitization
    sanitization: {
        enabled: true,
        mongo: true,
        sql: true,
        xss: true,
        escape: true,
        trim: true,
        normalizeEmail: true
    },

    // Encryption
    encryption: {
        algorithm: 'aes-256-gcm',
        keyDerivation: 'pbkdf2',
        iterations: 100000,
        saltLength: 32,
        tagLength: 16,
        encoding: 'base64'
    },

    // Audit Logging
    audit: {
        enabled: true,
        events: [
            'authentication',
            'authorization',
            'data_access',
            'data_modification',
            'configuration_change',
            'security_event'
        ],
        storage: 'file', // 'file', 'database', 'elasticsearch'
        retention: 90 // days
    },

    // WAF (Web Application Firewall) Rules
    waf: {
        enabled: false,
        rules: [
            {
                id: 'sql-injection',
                pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/gi,
                action: 'block',
                message: 'Potential SQL injection detected'
            },
            {
                id: 'xss-attack',
                pattern: /<script[^>]*>.*?<\/script>/gi,
                action: 'block',
                message: 'Potential XSS attack detected'
            },
            {
                id: 'path-traversal',
                pattern: /\.\.\//g,
                action: 'block',
                message: 'Path traversal attempt detected'
            }
        ]
    }
};
