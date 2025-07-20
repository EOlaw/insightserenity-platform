'use strict';

/**
 * @fileoverview Security configuration for authentication, encryption, and access control
 * @module shared/config/security-config
 */

const { parseBoolean, parseNumber, parseArray } = require('./base-config').helpers;

// Security configuration object
const securityConfig = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'change_this_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change_this_refresh_secret',
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
    rememberMeExpiry: process.env.JWT_REMEMBER_ME_EXPIRY || '30d',
    algorithm: process.env.JWT_ALGORITHM || 'HS256',
    issuer: process.env.JWT_ISSUER || 'insightserenity.com',
    audience: process.env.JWT_AUDIENCE || 'insightserenity-platform',
    clockTolerance: parseNumber(process.env.JWT_CLOCK_TOLERANCE, 60), // seconds
    maxAge: process.env.JWT_MAX_AGE || '90d',
    notBefore: parseNumber(process.env.JWT_NOT_BEFORE, 0) // seconds
  },

  // Encryption settings
  encryption: {
    algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    key: process.env.ENCRYPTION_KEY || 'change_this_32_character_string!',
    ivLength: parseNumber(process.env.ENCRYPTION_IV_LENGTH, 16),
    tagLength: parseNumber(process.env.ENCRYPTION_TAG_LENGTH, 16),
    saltRounds: parseNumber(process.env.BCRYPT_SALT_ROUNDS, 12),
    passwordMinLength: parseNumber(process.env.PASSWORD_MIN_LENGTH, 8),
    passwordMaxLength: parseNumber(process.env.PASSWORD_MAX_LENGTH, 128),
    passwordRequireUppercase: parseBoolean(process.env.PASSWORD_REQUIRE_UPPERCASE, true),
    passwordRequireLowercase: parseBoolean(process.env.PASSWORD_REQUIRE_LOWERCASE, true),
    passwordRequireNumbers: parseBoolean(process.env.PASSWORD_REQUIRE_NUMBERS, true),
    passwordRequireSpecial: parseBoolean(process.env.PASSWORD_REQUIRE_SPECIAL, true),
    passwordHistory: parseNumber(process.env.PASSWORD_HISTORY_COUNT, 5),
    passwordExpiryDays: parseNumber(process.env.PASSWORD_EXPIRY_DAYS, 90)
  },

  // Session configuration
  session: {
    secret: process.env.SESSION_SECRET || 'change_this_session_secret',
    name: process.env.SESSION_NAME || 'insightserenity_session',
    resave: parseBoolean(process.env.SESSION_RESAVE, false),
    saveUninitialized: parseBoolean(process.env.SESSION_SAVE_UNINITIALIZED, false),
    rolling: parseBoolean(process.env.SESSION_ROLLING, true),
    proxy: parseBoolean(process.env.SESSION_PROXY, true),
    cookie: {
      secure: parseBoolean(process.env.SESSION_SECURE_COOKIE, process.env.NODE_ENV === 'production'),
      httpOnly: parseBoolean(process.env.SESSION_HTTP_ONLY, true),
      maxAge: parseNumber(process.env.SESSION_MAX_AGE, 86400000), // 24 hours
      sameSite: process.env.SESSION_SAME_SITE || 'strict',
      domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
      path: process.env.SESSION_COOKIE_PATH || '/'
    },
    store: {
      type: process.env.SESSION_STORE_TYPE || 'redis', // redis, mongodb, memory
      prefix: process.env.SESSION_STORE_PREFIX || 'sess:',
      ttl: parseNumber(process.env.SESSION_STORE_TTL, 86400), // seconds
      touchAfter: parseNumber(process.env.SESSION_TOUCH_AFTER, 300) // seconds
    }
  },

  // Authentication settings
  authentication: {
    maxLoginAttempts: parseNumber(process.env.MAX_LOGIN_ATTEMPTS, 5),
    lockoutDuration: parseNumber(process.env.LOCKOUT_DURATION_MINUTES, 30),
    requireEmailVerification: parseBoolean(process.env.REQUIRE_EMAIL_VERIFICATION, true),
    emailVerificationExpiry: process.env.EMAIL_VERIFICATION_EXPIRY || '24h',
    passwordResetExpiry: process.env.PASSWORD_RESET_EXPIRY || '1h',
    rememberMeEnabled: parseBoolean(process.env.REMEMBER_ME_ENABLED, true),
    multiFactorRequired: parseBoolean(process.env.MFA_REQUIRED, false),
    allowedAuthMethods: parseArray(process.env.ALLOWED_AUTH_METHODS, [
      'local',
      'oauth',
      'passkey',
      'saml'
    ])
  },

  // Two-Factor Authentication
  twoFactor: {
    enabled: parseBoolean(process.env.TWO_FACTOR_ENABLED, true),
    issuer: process.env.TWO_FACTOR_ISSUER || 'InsightSerenity',
    window: parseNumber(process.env.TWO_FACTOR_WINDOW, 1),
    codeLength: parseNumber(process.env.TWO_FACTOR_CODE_LENGTH, 6),
    qrCodeSize: parseNumber(process.env.TWO_FACTOR_QR_SIZE, 200),
    backupCodesCount: parseNumber(process.env.TWO_FACTOR_BACKUP_CODES, 10),
    methods: parseArray(process.env.TWO_FACTOR_METHODS, ['totp', 'sms', 'email'])
  },

  // OAuth providers configuration
  oauth: {
    google: {
      enabled: parseBoolean(process.env.OAUTH_GOOGLE_ENABLED, true),
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.OAUTH_GOOGLE_CALLBACK_URL || '/auth/google/callback',
      scope: parseArray(process.env.OAUTH_GOOGLE_SCOPE, ['profile', 'email'])
    },
    github: {
      enabled: parseBoolean(process.env.OAUTH_GITHUB_ENABLED, true),
      clientId: process.env.OAUTH_GITHUB_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET || '',
      callbackUrl: process.env.OAUTH_GITHUB_CALLBACK_URL || '/auth/github/callback',
      scope: parseArray(process.env.OAUTH_GITHUB_SCOPE, ['user:email'])
    },
    linkedin: {
      enabled: parseBoolean(process.env.OAUTH_LINKEDIN_ENABLED, true),
      clientId: process.env.OAUTH_LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_LINKEDIN_CLIENT_SECRET || '',
      callbackUrl: process.env.OAUTH_LINKEDIN_CALLBACK_URL || '/auth/linkedin/callback',
      scope: parseArray(process.env.OAUTH_LINKEDIN_SCOPE, ['r_emailaddress', 'r_liteprofile'])
    }
  },

  // API Key configuration
  apiKey: {
    enabled: parseBoolean(process.env.API_KEY_ENABLED, true),
    prefix: process.env.API_KEY_PREFIX || 'isk_',
    length: parseNumber(process.env.API_KEY_LENGTH, 32),
    hashAlgorithm: process.env.API_KEY_HASH_ALGORITHM || 'sha256',
    expiryDays: parseNumber(process.env.API_KEY_EXPIRY_DAYS, 365),
    maxKeysPerUser: parseNumber(process.env.MAX_API_KEYS_PER_USER, 5),
    rateLimit: {
      windowMs: parseNumber(process.env.API_KEY_RATE_LIMIT_WINDOW, 900000), // 15 minutes
      maxRequests: parseNumber(process.env.API_KEY_RATE_LIMIT_MAX, 1000)
    }
  },

  // CORS and CSRF protection
  csrf: {
    enabled: parseBoolean(process.env.CSRF_ENABLED, true),
    secret: process.env.CSRF_SECRET || 'change_this_csrf_secret',
    cookieName: process.env.CSRF_COOKIE_NAME || '_csrf',
    headerName: process.env.CSRF_HEADER_NAME || 'X-CSRF-Token',
    paramName: process.env.CSRF_PARAM_NAME || '_csrf',
    sessionKey: process.env.CSRF_SESSION_KEY || 'csrfSecret',
    saltLength: parseNumber(process.env.CSRF_SALT_LENGTH, 8),
    secretLength: parseNumber(process.env.CSRF_SECRET_LENGTH, 18)
  },

  // Security headers
  headers: {
    contentSecurityPolicy: {
      enabled: parseBoolean(process.env.CSP_ENABLED, true),
      directives: {
        defaultSrc: parseArray(process.env.CSP_DEFAULT_SRC, ["'self'"]),
        scriptSrc: parseArray(process.env.CSP_SCRIPT_SRC, ["'self'", "'unsafe-inline'"]),
        styleSrc: parseArray(process.env.CSP_STYLE_SRC, ["'self'", "'unsafe-inline'"]),
        imgSrc: parseArray(process.env.CSP_IMG_SRC, ["'self'", 'data:', 'https:']),
        connectSrc: parseArray(process.env.CSP_CONNECT_SRC, ["'self'"]),
        fontSrc: parseArray(process.env.CSP_FONT_SRC, ["'self'"]),
        objectSrc: parseArray(process.env.CSP_OBJECT_SRC, ["'none'"]),
        mediaSrc: parseArray(process.env.CSP_MEDIA_SRC, ["'self'"]),
        frameSrc: parseArray(process.env.CSP_FRAME_SRC, ["'none'"])
      }
    },
    strictTransportSecurity: {
      enabled: parseBoolean(process.env.HSTS_ENABLED, true),
      maxAge: parseNumber(process.env.HSTS_MAX_AGE, 31536000), // 1 year
      includeSubDomains: parseBoolean(process.env.HSTS_INCLUDE_SUBDOMAINS, true),
      preload: parseBoolean(process.env.HSTS_PRELOAD, true)
    },
    xFrameOptions: process.env.X_FRAME_OPTIONS || 'DENY',
    xContentTypeOptions: process.env.X_CONTENT_TYPE_OPTIONS || 'nosniff',
    referrerPolicy: process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin',
    permissionsPolicy: process.env.PERMISSIONS_POLICY || 'geolocation=(), microphone=(), camera=()'
  },

  // IP security
  ipSecurity: {
    enableWhitelist: parseBoolean(process.env.IP_WHITELIST_ENABLED, false),
    whitelist: parseArray(process.env.IP_WHITELIST, []),
    enableBlacklist: parseBoolean(process.env.IP_BLACKLIST_ENABLED, true),
    blacklist: parseArray(process.env.IP_BLACKLIST, []),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
    proxyDepth: parseNumber(process.env.PROXY_DEPTH, 1)
  },

  // Rate limiting
  rateLimit: {
    global: {
      enabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
      windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 900000), // 15 minutes
      max: parseNumber(process.env.RATE_LIMIT_MAX, 100),
      message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests, please try again later.',
      standardHeaders: parseBoolean(process.env.RATE_LIMIT_STANDARD_HEADERS, true),
      legacyHeaders: parseBoolean(process.env.RATE_LIMIT_LEGACY_HEADERS, false)
    },
    login: {
      windowMs: parseNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 900000), // 15 minutes
      max: parseNumber(process.env.LOGIN_RATE_LIMIT_MAX, 5),
      skipSuccessfulRequests: parseBoolean(process.env.LOGIN_RATE_LIMIT_SKIP_SUCCESS, true)
    },
    api: {
      windowMs: parseNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 60000), // 1 minute
      max: parseNumber(process.env.API_RATE_LIMIT_MAX, 60)
    }
  },

  // Audit and logging
  audit: {
    enabled: parseBoolean(process.env.AUDIT_ENABLED, true),
    logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    sensitiveActions: parseArray(process.env.AUDIT_SENSITIVE_ACTIONS, [
      'login',
      'logout',
      'password_change',
      'permission_change',
      'data_export',
      'data_delete',
      'api_key_created',
      'security_settings_changed'
    ]),
    retentionDays: parseNumber(process.env.AUDIT_RETENTION_DAYS, 365),
    encryptLogs: parseBoolean(process.env.AUDIT_ENCRYPT_LOGS, true)
  },

  // Additional security features
  features: {
    preventBruteForce: parseBoolean(process.env.PREVENT_BRUTE_FORCE, true),
    detectAnomalies: parseBoolean(process.env.DETECT_ANOMALIES, true),
    enforcePasswordPolicy: parseBoolean(process.env.ENFORCE_PASSWORD_POLICY, true),
    requireSecureContext: parseBoolean(process.env.REQUIRE_SECURE_CONTEXT, true),
    enableSecurityMonitoring: parseBoolean(process.env.ENABLE_SECURITY_MONITORING, true),
    blockSuspiciousIPs: parseBoolean(process.env.BLOCK_SUSPICIOUS_IPS, true),
    enableHoneypot: parseBoolean(process.env.ENABLE_HONEYPOT, false)
  }
};

// Validate security configuration
const validateSecurityConfig = (config) => {
  const errors = [];

  // Production environment checks
  if (process.env.NODE_ENV === 'production') {
    if (config.jwt.secret === 'change_this_secret') {
      errors.push('JWT secret must be changed in production');
    }
    if (config.jwt.refreshSecret === 'change_this_refresh_secret') {
      errors.push('JWT refresh secret must be changed in production');
    }
    if (config.encryption.key === 'change_this_32_character_string!') {
      errors.push('Encryption key must be changed in production');
    }
    if (config.session.secret === 'change_this_session_secret') {
      errors.push('Session secret must be changed in production');
    }
    if (config.csrf.secret === 'change_this_csrf_secret') {
      errors.push('CSRF secret must be changed in production');
    }
    if (!config.session.cookie.secure) {
      errors.push('Secure cookies must be enabled in production');
    }
    if (!config.headers.strictTransportSecurity.enabled) {
      errors.push('HSTS must be enabled in production');
    }
  }

  // Validate JWT settings
  if (config.jwt.secret.length < 32) {
    errors.push('JWT secret should be at least 32 characters long');
  }

  // Validate encryption key
  if (config.encryption.key.length !== 32) {
    errors.push('Encryption key must be exactly 32 characters long');
  }

  // Validate password policy
  if (config.encryption.passwordMinLength < 8) {
    errors.push('Password minimum length should be at least 8 characters');
  }

  // Validate rate limiting
  if (config.rateLimit.login.max > config.authentication.maxLoginAttempts) {
    errors.push('Login rate limit should not exceed max login attempts');
  }

  if (errors.length > 0) {
    throw new Error('Security configuration validation failed:\n' + errors.join('\n'));
  }

  return true;
};

// Validate the configuration
validateSecurityConfig(securityConfig);

// Export configuration
module.exports = securityConfig;