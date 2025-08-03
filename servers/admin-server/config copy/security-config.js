/**
 * @file Security Configuration
 * @description Enhanced security settings for admin server operations
 * @version 3.0.0
 */

'use strict';

const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';
const isDevelopment = environment === 'development';

/**
 * Parse boolean from environment variable
 * @param {string} value - Environment variable value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean
 */
const parseBooleanFromEnv = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    return value === 'true' || value === '1' || value === 'yes';
};

/**
 * Parse array from comma-separated environment variable
 * @param {string} value - Environment variable value
 * @returns {Array} Parsed array
 */
const parseArrayFromEnv = (value) => {
    if (!value) return [];
    return value.split(',').map(item => item.trim()).filter(Boolean);
};

/**
 * Admin-specific security configuration
 * Overrides and enhances shared security settings
 */
module.exports = {
    // Overall security level
    level: process.env.ADMIN_SECURITY_LEVEL || 'maximum',
    enforceStrictMode: parseBooleanFromEnv(process.env.ADMIN_ENFORCE_STRICT_MODE, true),
    
    // Authentication configuration
    authentication: {
        // Multi-factor authentication
        mfa: {
            required: parseBooleanFromEnv(process.env.ADMIN_REQUIRE_MFA, isProduction),
            type: process.env.ADMIN_MFA_TYPE || 'totp', // totp, sms, email, hardware
            backupCodes: parseBooleanFromEnv(process.env.ADMIN_MFA_BACKUP_CODES, true),
            backupCodeCount: parseInt(process.env.ADMIN_MFA_BACKUP_CODE_COUNT, 10) || 10,
            gracePeriod: parseInt(process.env.ADMIN_MFA_GRACE_PERIOD, 10) || 0, // No grace period
            rememberDevice: parseBooleanFromEnv(process.env.ADMIN_MFA_REMEMBER_DEVICE, false),
            deviceTrustDuration: parseInt(process.env.ADMIN_MFA_DEVICE_TRUST_DURATION, 10) || 0
        },
        
        // Password requirements
        password: {
            minLength: parseInt(process.env.ADMIN_PASSWORD_MIN_LENGTH, 10) || 16,
            maxLength: parseInt(process.env.ADMIN_PASSWORD_MAX_LENGTH, 10) || 128,
            requireUppercase: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_UPPERCASE, true),
            requireLowercase: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_LOWERCASE, true),
            requireNumbers: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_NUMBERS, true),
            requireSymbols: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_SYMBOLS, true),
            minUppercase: parseInt(process.env.ADMIN_PASSWORD_MIN_UPPERCASE, 10) || 2,
            minLowercase: parseInt(process.env.ADMIN_PASSWORD_MIN_LOWERCASE, 10) || 2,
            minNumbers: parseInt(process.env.ADMIN_PASSWORD_MIN_NUMBERS, 10) || 2,
            minSymbols: parseInt(process.env.ADMIN_PASSWORD_MIN_SYMBOLS, 10) || 2,
            prohibitedPasswords: parseArrayFromEnv(process.env.ADMIN_PROHIBITED_PASSWORDS),
            checkHaveIBeenPwned: parseBooleanFromEnv(process.env.ADMIN_CHECK_HIBP, true),
            preventReuse: parseInt(process.env.ADMIN_PASSWORD_PREVENT_REUSE, 10) || 12,
            expiryDays: parseInt(process.env.ADMIN_PASSWORD_EXPIRY_DAYS, 10) || 60,
            expiryWarningDays: parseInt(process.env.ADMIN_PASSWORD_EXPIRY_WARNING, 10) || 7,
            complexityScore: parseInt(process.env.ADMIN_PASSWORD_COMPLEXITY_SCORE, 10) || 4
        },
        
        // Login security
        login: {
            maxAttempts: parseInt(process.env.ADMIN_MAX_LOGIN_ATTEMPTS, 10) || 3,
            lockoutDuration: parseInt(process.env.ADMIN_LOCKOUT_DURATION, 10) || 3600000, // 1 hour
            lockoutMultiplier: parseFloat(process.env.ADMIN_LOCKOUT_MULTIPLIER) || 2,
            captchaAfterFailures: parseInt(process.env.ADMIN_CAPTCHA_AFTER_FAILURES, 10) || 2,
            requireCaptcha: parseBooleanFromEnv(process.env.ADMIN_REQUIRE_CAPTCHA, false),
            slowDown: parseBooleanFromEnv(process.env.ADMIN_LOGIN_SLOWDOWN, true),
            slowDownDelay: parseInt(process.env.ADMIN_SLOWDOWN_DELAY, 10) || 1000,
            geoBlocking: parseBooleanFromEnv(process.env.ADMIN_GEO_BLOCKING, false),
            blockedCountries: parseArrayFromEnv(process.env.ADMIN_BLOCKED_COUNTRIES),
            allowedCountries: parseArrayFromEnv(process.env.ADMIN_ALLOWED_COUNTRIES)
        },
        
        // Token security
        tokens: {
            jwt: {
                secret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
                algorithm: process.env.ADMIN_JWT_ALGORITHM || 'RS256',
                expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '15m',
                issuer: process.env.ADMIN_JWT_ISSUER || 'insightserenity-admin',
                audience: process.env.ADMIN_JWT_AUDIENCE || 'admin-portal',
                clockTolerance: parseInt(process.env.ADMIN_JWT_CLOCK_TOLERANCE, 10) || 30
            },
            refresh: {
                secret: process.env.ADMIN_REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET,
                expiresIn: process.env.ADMIN_REFRESH_TOKEN_EXPIRES || '7d',
                rotateOnUse: parseBooleanFromEnv(process.env.ADMIN_ROTATE_REFRESH_TOKEN, true),
                reuseDetection: parseBooleanFromEnv(process.env.ADMIN_REFRESH_REUSE_DETECTION, true),
                family: parseBooleanFromEnv(process.env.ADMIN_REFRESH_TOKEN_FAMILY, true)
            },
            csrf: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_CSRF_ENABLED, true),
                secret: process.env.ADMIN_CSRF_SECRET || process.env.CSRF_SECRET,
                cookieName: process.env.ADMIN_CSRF_COOKIE_NAME || 'admin-csrf',
                headerName: process.env.ADMIN_CSRF_HEADER_NAME || 'X-CSRF-Token',
                doubleSubmit: parseBooleanFromEnv(process.env.ADMIN_CSRF_DOUBLE_SUBMIT, true)
            }
        }
    },
    
    // Access control
    accessControl: {
        // IP restrictions
        ipRestrictions: {
            whitelist: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_IP_WHITELIST_ENABLED, isProduction),
                addresses: parseArrayFromEnv(process.env.ADMIN_IP_WHITELIST),
                ranges: parseArrayFromEnv(process.env.ADMIN_IP_WHITELIST_RANGES),
                checkHeaders: parseArrayFromEnv(process.env.ADMIN_IP_CHECK_HEADERS) || 
                    ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'x-client-ip'],
                trustProxy: parseBooleanFromEnv(process.env.ADMIN_TRUST_PROXY_FOR_IP, isProduction),
                strict: parseBooleanFromEnv(process.env.ADMIN_IP_WHITELIST_STRICT, true),
                bypassForLocal: parseBooleanFromEnv(process.env.ADMIN_IP_BYPASS_LOCAL, isDevelopment)
            },
            blacklist: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_IP_BLACKLIST_ENABLED, true),
                addresses: parseArrayFromEnv(process.env.ADMIN_IP_BLACKLIST),
                autoBlock: parseBooleanFromEnv(process.env.ADMIN_IP_AUTO_BLOCK, true),
                autoBlockThreshold: parseInt(process.env.ADMIN_IP_AUTO_BLOCK_THRESHOLD, 10) || 10,
                autoBlockDuration: parseInt(process.env.ADMIN_IP_AUTO_BLOCK_DURATION, 10) || 86400000,
                persistBlacklist: parseBooleanFromEnv(process.env.ADMIN_IP_PERSIST_BLACKLIST, true)
            },
            geoip: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_GEOIP_ENABLED, false),
                allowedCountries: parseArrayFromEnv(process.env.ADMIN_GEOIP_ALLOWED_COUNTRIES),
                blockedCountries: parseArrayFromEnv(process.env.ADMIN_GEOIP_BLOCKED_COUNTRIES),
                vpnDetection: parseBooleanFromEnv(process.env.ADMIN_VPN_DETECTION, true),
                proxyDetection: parseBooleanFromEnv(process.env.ADMIN_PROXY_DETECTION, true),
                torDetection: parseBooleanFromEnv(process.env.ADMIN_TOR_DETECTION, true)
            }
        },
        
        // Role-based access control
        rbac: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_RBAC_ENABLED, true),
            roles: parseArrayFromEnv(process.env.ADMIN_ALLOWED_ROLES) || ['admin', 'superadmin'],
            hierarchical: parseBooleanFromEnv(process.env.ADMIN_RBAC_HIERARCHICAL, true),
            dynamicPermissions: parseBooleanFromEnv(process.env.ADMIN_DYNAMIC_PERMISSIONS, true),
            cachePermissions: parseBooleanFromEnv(process.env.ADMIN_CACHE_PERMISSIONS, true),
            cacheDuration: parseInt(process.env.ADMIN_PERMISSION_CACHE_DURATION, 10) || 300000
        },
        
        // Time-based restrictions
        timeRestrictions: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_TIME_RESTRICTIONS, false),
            allowedHours: process.env.ADMIN_ALLOWED_HOURS ? 
                process.env.ADMIN_ALLOWED_HOURS.split('-').map(h => parseInt(h, 10)) : null,
            allowedDays: parseArrayFromEnv(process.env.ADMIN_ALLOWED_DAYS),
            timezone: process.env.ADMIN_RESTRICTION_TIMEZONE || 'UTC',
            holidayRestrictions: parseBooleanFromEnv(process.env.ADMIN_HOLIDAY_RESTRICTIONS, false)
        }
    },
    
    // Rate limiting
    rateLimit: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_RATE_LIMIT_ENABLED, true),
        
        // Global limits
        global: {
            windowMs: parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW, 10) || 900000, // 15 minutes
            max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX, 10) || 1000,
            message: process.env.ADMIN_RATE_LIMIT_MESSAGE || 'Too many requests from this IP',
            standardHeaders: parseBooleanFromEnv(process.env.ADMIN_RATE_LIMIT_HEADERS, true),
            legacyHeaders: parseBooleanFromEnv(process.env.ADMIN_RATE_LIMIT_LEGACY_HEADERS, false),
            skipSuccessfulRequests: parseBooleanFromEnv(process.env.ADMIN_RATE_LIMIT_SKIP_SUCCESS, false),
            skipFailedRequests: parseBooleanFromEnv(process.env.ADMIN_RATE_LIMIT_SKIP_FAILED, false)
        },
        
        // Endpoint-specific limits
        endpoints: {
            login: {
                windowMs: parseInt(process.env.ADMIN_LOGIN_RATE_WINDOW, 10) || 900000,
                max: parseInt(process.env.ADMIN_LOGIN_RATE_MAX, 10) || 5,
                skipSuccessfulRequests: true
            },
            api: {
                windowMs: parseInt(process.env.ADMIN_API_RATE_WINDOW, 10) || 60000,
                max: parseInt(process.env.ADMIN_API_RATE_MAX, 10) || 100
            },
            write: {
                windowMs: parseInt(process.env.ADMIN_WRITE_RATE_WINDOW, 10) || 60000,
                max: parseInt(process.env.ADMIN_WRITE_RATE_MAX, 10) || 50
            },
            delete: {
                windowMs: parseInt(process.env.ADMIN_DELETE_RATE_WINDOW, 10) || 3600000,
                max: parseInt(process.env.ADMIN_DELETE_RATE_MAX, 10) || 10
            }
        },
        
        // Advanced rate limiting
        advanced: {
            distributeLoad: parseBooleanFromEnv(process.env.ADMIN_RATE_DISTRIBUTE_LOAD, true),
            useRedisStore: parseBooleanFromEnv(process.env.ADMIN_RATE_USE_REDIS, true),
            keyGenerator: process.env.ADMIN_RATE_KEY_GENERATOR || 'ip-user',
            costBasedLimiting: parseBooleanFromEnv(process.env.ADMIN_COST_BASED_LIMITING, true)
        }
    },
    
    // Headers security
    headers: {
        // Helmet configuration overrides
        helmet: {
            enabled: true, // Always enabled for admin
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'strict-dynamic'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'none'"],
                    frameSrc: ["'none'"],
                    sandbox: ['allow-forms', 'allow-scripts', 'allow-same-origin'],
                    reportUri: process.env.ADMIN_CSP_REPORT_URI || '/admin/api/security/csp-report',
                    upgradeInsecureRequests: isProduction
                },
                reportOnly: parseBooleanFromEnv(process.env.ADMIN_CSP_REPORT_ONLY, false)
            },
            crossOriginEmbedderPolicy: true,
            crossOriginOpenerPolicy: true,
            crossOriginResourcePolicy: { policy: "same-site" },
            expectCt: {
                enforce: true,
                maxAge: 86400,
                reportUri: process.env.ADMIN_EXPECT_CT_REPORT_URI
            },
            referrerPolicy: { policy: "same-origin" },
            hsts: {
                maxAge: 63072000, // 2 years
                includeSubDomains: true,
                preload: true
            },
            noSniff: true,
            originAgentCluster: true,
            dnsPrefetchControl: { allow: false },
            ieNoOpen: true,
            frameguard: { action: 'deny' },
            permittedCrossDomainPolicies: false,
            hidePoweredBy: true,
            xssFilter: true
        },
        
        // Custom security headers
        custom: {
            'X-Admin-Server': parseBooleanFromEnv(process.env.ADMIN_SHOW_SERVER_HEADER, false) ? 'true' : undefined,
            'X-Request-ID': true,
            'X-XSS-Protection': '1; mode=block',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-Permitted-Cross-Domain-Policies': 'none',
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    },
    
    // Encryption and cryptography
    encryption: {
        algorithm: process.env.ADMIN_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
        keyDerivation: process.env.ADMIN_KEY_DERIVATION || 'pbkdf2',
        keyIterations: parseInt(process.env.ADMIN_KEY_ITERATIONS, 10) || 100000,
        saltLength: parseInt(process.env.ADMIN_SALT_LENGTH, 10) || 32,
        ivLength: parseInt(process.env.ADMIN_IV_LENGTH, 10) || 16,
        tagLength: parseInt(process.env.ADMIN_TAG_LENGTH, 10) || 16,
        
        // Key management
        keys: {
            rotation: parseBooleanFromEnv(process.env.ADMIN_KEY_ROTATION, true),
            rotationInterval: parseInt(process.env.ADMIN_KEY_ROTATION_INTERVAL, 10) || 7776000000, // 90 days
            keyStore: process.env.ADMIN_KEY_STORE || 'hsm', // hsm, kms, file
            backupKeys: parseBooleanFromEnv(process.env.ADMIN_BACKUP_KEYS, true)
        },
        
        // Field-level encryption
        fieldEncryption: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_FIELD_ENCRYPTION, true),
            fields: parseArrayFromEnv(process.env.ADMIN_ENCRYPTED_FIELDS) || 
                ['ssn', 'creditCard', 'bankAccount', 'apiKey', 'privateKey']
        }
    },
    
    // Audit and compliance
    audit: {
        enabled: true, // Always enabled for admin
        level: process.env.ADMIN_AUDIT_LEVEL || 'verbose',
        storage: process.env.ADMIN_AUDIT_STORAGE || 'database',
        encryption: parseBooleanFromEnv(process.env.ADMIN_AUDIT_ENCRYPTION, true),
        retention: parseInt(process.env.ADMIN_AUDIT_RETENTION_DAYS, 10) || 2555, // 7 years
        
        // Audit events
        events: {
            authentication: parseBooleanFromEnv(process.env.ADMIN_AUDIT_AUTH, true),
            authorization: parseBooleanFromEnv(process.env.ADMIN_AUDIT_AUTHZ, true),
            dataAccess: parseBooleanFromEnv(process.env.ADMIN_AUDIT_DATA_ACCESS, true),
            dataModification: parseBooleanFromEnv(process.env.ADMIN_AUDIT_DATA_MODIFY, true),
            configuration: parseBooleanFromEnv(process.env.ADMIN_AUDIT_CONFIG, true),
            security: parseBooleanFromEnv(process.env.ADMIN_AUDIT_SECURITY, true),
            system: parseBooleanFromEnv(process.env.ADMIN_AUDIT_SYSTEM, true)
        },
        
        // Compliance
        compliance: {
            frameworks: parseArrayFromEnv(process.env.ADMIN_COMPLIANCE_FRAMEWORKS) || 
                ['SOC2', 'ISO27001', 'GDPR', 'HIPAA'],
            reporting: parseBooleanFromEnv(process.env.ADMIN_COMPLIANCE_REPORTING, true),
            automation: parseBooleanFromEnv(process.env.ADMIN_COMPLIANCE_AUTOMATION, true)
        }
    },
    
    // Security monitoring
    monitoring: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_SECURITY_MONITORING, true),
        realTime: parseBooleanFromEnv(process.env.ADMIN_REAL_TIME_MONITORING, true),
        
        // Threat detection
        threatDetection: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_THREAT_DETECTION, true),
            bruteForce: parseBooleanFromEnv(process.env.ADMIN_DETECT_BRUTE_FORCE, true),
            anomalies: parseBooleanFromEnv(process.env.ADMIN_DETECT_ANOMALIES, true),
            patterns: parseBooleanFromEnv(process.env.ADMIN_DETECT_PATTERNS, true),
            ml: parseBooleanFromEnv(process.env.ADMIN_ML_DETECTION, false)
        },
        
        // Incident response
        incidentResponse: {
            autoResponse: parseBooleanFromEnv(process.env.ADMIN_AUTO_RESPONSE, true),
            blockThreats: parseBooleanFromEnv(process.env.ADMIN_BLOCK_THREATS, true),
            alerting: parseBooleanFromEnv(process.env.ADMIN_SECURITY_ALERTING, true),
            escalation: parseBooleanFromEnv(process.env.ADMIN_SECURITY_ESCALATION, true)
        }
    },
    
    // CORS configuration (admin-specific)
    cors: {
        enabled: true, // Always enabled for admin
        origins: parseArrayFromEnv(process.env.ADMIN_CORS_ORIGINS) || [],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-CSRF-Token', 'X-Request-ID'],
        exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID', 'X-RateLimit-Remaining'],
        maxAge: 86400,
        preflightContinue: false,
        optionsSuccessStatus: 204
    }
};