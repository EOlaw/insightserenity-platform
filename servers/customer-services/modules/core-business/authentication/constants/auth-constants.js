/**
 * @fileoverview Authentication Constants
 * @module servers/customer-services/modules/core-business/authentication/constants/auth-constants
 * @description Constants and enumerations for authentication module
 * @version 1.0.0
 */

/**
 * Token Configuration
 */
const TOKEN_CONFIG = {
    // Access token settings
    ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    ACCESS_TOKEN_EXPIRY_SECONDS: 900, // 15 minutes
    
    // Refresh token settings
    REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    REFRESH_TOKEN_EXPIRY_SECONDS: 604800, // 7 days
    
    // Remember me settings
    REMEMBER_ME_TOKEN_EXPIRY: process.env.REMEMBER_ME_TOKEN_EXPIRY || '30d',
    REMEMBER_ME_TOKEN_EXPIRY_SECONDS: 2592000, // 30 days
    
    // Verification token settings
    EMAIL_VERIFICATION_EXPIRY: process.env.EMAIL_VERIFICATION_EXPIRY || '24h',
    EMAIL_VERIFICATION_EXPIRY_SECONDS: 86400, // 24 hours
    
    // Password reset token settings
    PASSWORD_RESET_EXPIRY: process.env.PASSWORD_RESET_EXPIRY || '1h',
    PASSWORD_RESET_EXPIRY_SECONDS: 3600, // 1 hour
    
    // MFA challenge token settings
    MFA_CHALLENGE_EXPIRY: process.env.MFA_CHALLENGE_EXPIRY || '5m',
    MFA_CHALLENGE_EXPIRY_SECONDS: 300, // 5 minutes
    
    // OAuth state token settings
    OAUTH_STATE_EXPIRY: process.env.OAUTH_STATE_EXPIRY || '10m',
    OAUTH_STATE_EXPIRY_SECONDS: 600, // 10 minutes
    
    // Token types
    TOKEN_TYPE: 'Bearer',
    
    // JWT issuer and audience
    JWT_ISSUER: process.env.JWT_ISSUER || 'customer-auth-service',
    JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'customer-portal'
};

/**
 * Session Configuration
 */
const SESSION_CONFIG = {
    // Session expiry settings
    DEFAULT_SESSION_EXPIRY: process.env.SESSION_EXPIRY || '1h',
    DEFAULT_SESSION_EXPIRY_SECONDS: 3600, // 1 hour
    
    // Extended session for "remember me"
    EXTENDED_SESSION_EXPIRY: process.env.EXTENDED_SESSION_EXPIRY || '30d',
    EXTENDED_SESSION_EXPIRY_SECONDS: 2592000, // 30 days
    
    // Session activity timeout
    SESSION_ACTIVITY_TIMEOUT: process.env.SESSION_ACTIVITY_TIMEOUT || '30m',
    SESSION_ACTIVITY_TIMEOUT_SECONDS: 1800, // 30 minutes
    
    // Maximum concurrent sessions per user
    MAX_CONCURRENT_SESSIONS: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 5,
    
    // Session refresh threshold (refresh when this much time left)
    SESSION_REFRESH_THRESHOLD: 300, // 5 minutes
    
    // Session statuses
    STATUS: {
        ACTIVE: 'active',
        EXPIRED: 'expired',
        TERMINATED: 'terminated',
        SUSPICIOUS: 'suspicious'
    }
};

/**
 * MFA Configuration
 */
const MFA_CONFIG = {
    // MFA methods
    METHODS: {
        TOTP: 'totp',
        SMS: 'sms',
        EMAIL: 'email',
        BACKUP_CODE: 'backup_code',
        BIOMETRIC: 'biometric'
    },
    
    // TOTP settings
    TOTP: {
        ISSUER: process.env.TOTP_ISSUER || 'Customer Portal',
        ALGORITHM: 'sha1',
        DIGITS: 6,
        PERIOD: 30,
        WINDOW: 1 // Allow 1 step before and after
    },
    
    // SMS/Email OTP settings
    OTP: {
        LENGTH: 6,
        EXPIRY_SECONDS: 300, // 5 minutes
        MAX_ATTEMPTS: 3,
        RESEND_COOLDOWN_SECONDS: 60 // 1 minute
    },
    
    // Backup codes settings
    BACKUP_CODES: {
        COUNT: 10,
        LENGTH: 8,
        FORMAT: 'alphanumeric' // or 'numeric'
    },
    
    // MFA statuses
    STATUS: {
        PENDING: 'pending',
        ENABLED: 'enabled',
        DISABLED: 'disabled',
        SUSPENDED: 'suspended'
    },
    
    // MFA requirements
    REQUIRED_FOR_ROLES: ['admin', 'manager'],
    OPTIONAL_FOR_ROLES: ['customer', 'user']
};

/**
 * Password Configuration
 */
const PASSWORD_CONFIG = {
    // Password requirements
    MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
    MAX_LENGTH: parseInt(process.env.PASSWORD_MAX_LENGTH) || 128,
    REQUIRE_UPPERCASE: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
    REQUIRE_LOWERCASE: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
    REQUIRE_NUMBERS: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
    REQUIRE_SPECIAL_CHARS: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
    SPECIAL_CHARS: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    
    // Password strength levels
    STRENGTH: {
        VERY_WEAK: 'very_weak',
        WEAK: 'weak',
        MEDIUM: 'medium',
        STRONG: 'strong',
        VERY_STRONG: 'very_strong'
    },
    
    // Password history
    PREVENT_REUSE_COUNT: parseInt(process.env.PASSWORD_HISTORY_COUNT) || 5,
    
    // Password expiry
    EXPIRY_DAYS: parseInt(process.env.PASSWORD_EXPIRY_DAYS) || 90,
    EXPIRY_WARNING_DAYS: parseInt(process.env.PASSWORD_EXPIRY_WARNING_DAYS) || 7,
    
    // Password reset
    RESET_TOKEN_LENGTH: 32,
    MAX_RESET_ATTEMPTS: 3,
    RESET_LOCKOUT_MINUTES: 30,
    
    // Common passwords to block
    FORBIDDEN_PATTERNS: [
        'password',
        '12345',
        'qwerty',
        'admin',
        'letmein',
        'welcome'
    ]
};

/**
 * OAuth Configuration
 */
const OAUTH_CONFIG = {
    // Supported OAuth providers
    PROVIDERS: {
        GITHUB: 'github',
        LINKEDIN: 'linkedin',
        GOOGLE: 'google',
        MICROSOFT: 'microsoft',
        FACEBOOK: 'facebook'
    },
    
    // OAuth scopes by provider
    SCOPES: {
        GITHUB: ['user:email'],
        LINKEDIN: ['r_emailaddress', 'r_liteprofile'],
        GOOGLE: ['email', 'profile'],
        MICROSOFT: ['User.Read'],
        FACEBOOK: ['email', 'public_profile']
    },
    
    // OAuth URLs
    GITHUB: {
        AUTH_URL: 'https://github.com/login/oauth/authorize',
        TOKEN_URL: 'https://github.com/login/oauth/access_token',
        USER_URL: 'https://api.github.com/user',
        EMAIL_URL: 'https://api.github.com/user/emails'
    },
    
    LINKEDIN: {
        AUTH_URL: 'https://www.linkedin.com/oauth/v2/authorization',
        TOKEN_URL: 'https://www.linkedin.com/oauth/v2/accessToken',
        USER_URL: 'https://api.linkedin.com/v2/me',
        EMAIL_URL: 'https://api.linkedin.com/v2/emailAddress'
    },
    
    GOOGLE: {
        AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
        TOKEN_URL: 'https://oauth2.googleapis.com/token',
        USER_URL: 'https://www.googleapis.com/oauth2/v2/userinfo'
    },
    
    // OAuth state token configuration
    STATE_TOKEN_LENGTH: 32,
    STATE_EXPIRY_SECONDS: 600, // 10 minutes
    
    // OAuth callback configuration
    CALLBACK_BASE_URL: process.env.OAUTH_CALLBACK_BASE_URL || 'http://localhost:3000',
    CALLBACK_PATHS: {
        GITHUB: '/api/auth/oauth/github/callback',
        LINKEDIN: '/api/auth/oauth/linkedin/callback',
        GOOGLE: '/api/auth/oauth/google/callback'
    }
};

/**
 * Verification Configuration
 */
const VERIFICATION_CONFIG = {
    // Verification types
    TYPES: {
        EMAIL: 'email',
        PHONE: 'phone',
        IDENTITY: 'identity',
        DOCUMENT: 'document'
    },
    
    // Email verification
    EMAIL: {
        TOKEN_LENGTH: 32,
        CODE_LENGTH: 6,
        EXPIRY_SECONDS: 86400, // 24 hours
        MAX_ATTEMPTS: 5,
        RESEND_COOLDOWN_SECONDS: 60 // 1 minute
    },
    
    // Phone verification
    PHONE: {
        CODE_LENGTH: 6,
        EXPIRY_SECONDS: 300, // 5 minutes
        MAX_ATTEMPTS: 3,
        RESEND_COOLDOWN_SECONDS: 60, // 1 minute
        METHODS: {
            SMS: 'sms',
            CALL: 'call',
            WHATSAPP: 'whatsapp'
        }
    },
    
    // Document verification (KYC)
    DOCUMENT: {
        TYPES: {
            PASSPORT: 'passport',
            DRIVERS_LICENSE: 'drivers_license',
            NATIONAL_ID: 'national_id',
            RESIDENCE_PERMIT: 'residence_permit'
        },
        MAX_FILE_SIZE: 10485760, // 10MB
        ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'pdf'],
        REVIEW_TIME_HOURS: 24
    },
    
    // Verification statuses
    STATUS: {
        PENDING: 'pending',
        VERIFIED: 'verified',
        FAILED: 'failed',
        EXPIRED: 'expired',
        REVIEWING: 'reviewing'
    }
};

/**
 * Rate Limiting Configuration
 */
const RATE_LIMIT_CONFIG = {
    // Login attempts
    LOGIN: {
        MAX_ATTEMPTS: parseInt(process.env.LOGIN_MAX_ATTEMPTS) || 5,
        WINDOW_MINUTES: parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15,
        LOCKOUT_MINUTES: parseInt(process.env.LOGIN_LOCKOUT_MINUTES) || 30
    },
    
    // Registration attempts
    REGISTRATION: {
        MAX_ATTEMPTS: parseInt(process.env.REGISTRATION_MAX_ATTEMPTS) || 3,
        WINDOW_MINUTES: parseInt(process.env.REGISTRATION_WINDOW_MINUTES) || 60
    },
    
    // Password reset attempts
    PASSWORD_RESET: {
        MAX_ATTEMPTS: parseInt(process.env.PASSWORD_RESET_MAX_ATTEMPTS) || 3,
        WINDOW_MINUTES: parseInt(process.env.PASSWORD_RESET_WINDOW_MINUTES) || 60
    },
    
    // MFA verification attempts
    MFA_VERIFICATION: {
        MAX_ATTEMPTS: parseInt(process.env.MFA_MAX_ATTEMPTS) || 3,
        WINDOW_MINUTES: parseInt(process.env.MFA_WINDOW_MINUTES) || 5,
        LOCKOUT_MINUTES: parseInt(process.env.MFA_LOCKOUT_MINUTES) || 15
    },
    
    // Email verification attempts
    EMAIL_VERIFICATION: {
        MAX_RESENDS: parseInt(process.env.EMAIL_VERIFICATION_MAX_RESENDS) || 5,
        WINDOW_MINUTES: parseInt(process.env.EMAIL_VERIFICATION_WINDOW_MINUTES) || 60
    },
    
    // API rate limits
    API: {
        WINDOW_MINUTES: 15,
        MAX_REQUESTS: 100
    }
};

/**
 * User Roles and Permissions
 */
const ROLES = {
    // Role names
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    CUSTOMER: 'customer',
    USER: 'user',
    GUEST: 'guest',
    
    // Role hierarchy (higher number = more privileges)
    HIERARCHY: {
        super_admin: 100,
        admin: 80,
        manager: 60,
        customer: 40,
        user: 20,
        guest: 0
    },
    
    // Default role for new registrations
    DEFAULT: 'customer'
};

/**
 * User Account Statuses
 */
const USER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    PENDING: 'pending',
    SUSPENDED: 'suspended',
    LOCKED: 'locked',
    DELETED: 'deleted',
    BANNED: 'banned'
};

/**
 * Authentication Events
 */
const AUTH_EVENTS = {
    // User events
    USER_REGISTERED: 'user_registered',
    USER_LOGIN: 'user_login',
    USER_LOGOUT: 'user_logout',
    USER_LOGOUT_ALL: 'user_logout_all',
    
    // Email events
    EMAIL_VERIFIED: 'email_verified',
    EMAIL_VERIFICATION_SENT: 'email_verification_sent',
    
    // Phone events
    PHONE_VERIFIED: 'phone_verified',
    PHONE_VERIFICATION_SENT: 'phone_verification_sent',
    
    // Password events
    PASSWORD_CHANGED: 'password_changed',
    PASSWORD_RESET_REQUESTED: 'password_reset_requested',
    PASSWORD_RESET_COMPLETED: 'password_reset_completed',
    
    // MFA events
    MFA_ENABLED: 'mfa_enabled',
    MFA_DISABLED: 'mfa_disabled',
    MFA_VERIFIED: 'mfa_verified',
    MFA_FAILED: 'mfa_failed',
    
    // OAuth events
    OAUTH_LINKED: 'oauth_linked',
    OAUTH_UNLINKED: 'oauth_unlinked',
    OAUTH_LOGIN: 'oauth_login',
    
    // Session events
    SESSION_CREATED: 'session_created',
    SESSION_TERMINATED: 'session_terminated',
    SESSION_EXPIRED: 'session_expired',
    SESSION_SUSPICIOUS: 'session_suspicious',
    
    // Security events
    ACCOUNT_LOCKED: 'account_locked',
    ACCOUNT_UNLOCKED: 'account_unlocked',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    FAILED_LOGIN_ATTEMPT: 'failed_login_attempt'
};

/**
 * Error Codes
 */
const ERROR_CODES = {
    // Authentication errors
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    UNAUTHORIZED: 'UNAUTHORIZED',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
    ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED',
    
    // Token errors
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    TOKEN_MISSING: 'TOKEN_MISSING',
    TOKEN_REVOKED: 'TOKEN_REVOKED',
    
    // MFA errors
    MFA_REQUIRED: 'MFA_REQUIRED',
    MFA_INVALID_CODE: 'MFA_INVALID_CODE',
    MFA_EXPIRED: 'MFA_EXPIRED',
    MFA_MAX_ATTEMPTS: 'MFA_MAX_ATTEMPTS',
    
    // Password errors
    PASSWORD_WEAK: 'PASSWORD_WEAK',
    PASSWORD_REUSED: 'PASSWORD_REUSED',
    PASSWORD_EXPIRED: 'PASSWORD_EXPIRED',
    PASSWORD_MISMATCH: 'PASSWORD_MISMATCH',
    
    // Rate limit errors
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
    
    // Validation errors
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_EMAIL: 'INVALID_EMAIL',
    INVALID_PHONE: 'INVALID_PHONE',
    
    // Resource errors
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    
    // Conflict errors
    EMAIL_EXISTS: 'EMAIL_EXISTS',
    USERNAME_EXISTS: 'USERNAME_EXISTS',
    DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
    
    // OAuth errors
    OAUTH_ERROR: 'OAUTH_ERROR',
    OAUTH_CANCELLED: 'OAUTH_CANCELLED',
    OAUTH_ACCOUNT_EXISTS: 'OAUTH_ACCOUNT_EXISTS',
    
    // General errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    BAD_REQUEST: 'BAD_REQUEST'
};

/**
 * Customer Types
 */
const CUSTOMER_TYPES = {
    INDIVIDUAL: 'individual',
    BUSINESS: 'business',
    ENTERPRISE: 'enterprise',
    PARTNER: 'partner'
};

/**
 * Subscription Tiers
 */
const SUBSCRIPTION_TIERS = {
    FREE: 'free',
    BASIC: 'basic',
    PREMIUM: 'premium',
    ENTERPRISE: 'enterprise'
};

/**
 * Notification Channels
 */
const NOTIFICATION_CHANNELS = {
    EMAIL: 'email',
    SMS: 'sms',
    PUSH: 'push',
    IN_APP: 'in_app',
    WEBHOOK: 'webhook'
};

/**
 * Cookie Configuration
 */
const COOKIE_CONFIG = {
    REFRESH_TOKEN_NAME: 'refreshToken',
    SESSION_COOKIE_NAME: 'sessionId',
    SECURE: process.env.NODE_ENV === 'production',
    HTTP_ONLY: true,
    SAME_SITE: 'strict',
    MAX_AGE: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
};

/**
 * Export all constants
 */
module.exports = {
    TOKEN_CONFIG,
    SESSION_CONFIG,
    MFA_CONFIG,
    PASSWORD_CONFIG,
    OAUTH_CONFIG,
    VERIFICATION_CONFIG,
    RATE_LIMIT_CONFIG,
    ROLES,
    USER_STATUS,
    AUTH_EVENTS,
    ERROR_CODES,
    CUSTOMER_TYPES,
    SUBSCRIPTION_TIERS,
    NOTIFICATION_CHANNELS,
    COOKIE_CONFIG
};