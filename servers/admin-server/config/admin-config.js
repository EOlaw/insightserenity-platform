/**
 * @file Admin Service Configuration
 * @description Service-specific settings for admin server operations
 * @version 3.0.0
 */

'use strict';

const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';
const isDevelopment = environment === 'development';

/**
 * Parse comma-separated values from environment variables
 * @param {string} value - Environment variable value
 * @returns {Array} Parsed array
 */
const parseArrayFromEnv = (value) => {
    if (!value) return [];
    return value.split(',').map(item => item.trim()).filter(Boolean);
};

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
 * Admin server configuration
 */
module.exports = {
    // Server identification
    serverId: process.env.ADMIN_SERVER_ID || 'admin-primary',
    serverType: 'admin',
    clusterEnabled: parseBooleanFromEnv(process.env.ADMIN_CLUSTER_ENABLED, false),
    instanceId: process.env.INSTANCE_ID || process.pid.toString(),
    
    // Network configuration
    network: {
        port: parseInt(process.env.ADMIN_PORT, 10) || 5001,
        host: process.env.ADMIN_HOST || '127.0.0.1',
        publicUrl: process.env.ADMIN_PUBLIC_URL || `https://admin.${process.env.DOMAIN || 'insightserenity.com'}`,
        behindProxy: parseBooleanFromEnv(process.env.ADMIN_BEHIND_PROXY, isProduction),
        trustedProxies: parseArrayFromEnv(process.env.ADMIN_TRUSTED_PROXIES),
        keepAliveTimeout: parseInt(process.env.ADMIN_KEEP_ALIVE_TIMEOUT, 10) || 65000,
        headersTimeout: parseInt(process.env.ADMIN_HEADERS_TIMEOUT, 10) || 66000
    },
    
    // Security configuration
    security: {
        level: process.env.ADMIN_SECURITY_LEVEL || 'high',
        requireMFA: parseBooleanFromEnv(process.env.ADMIN_REQUIRE_MFA, isProduction),
        sessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT, 10) || 3600000, // 1 hour
        maxLoginAttempts: parseInt(process.env.ADMIN_MAX_LOGIN_ATTEMPTS, 10) || 5,
        lockoutDuration: parseInt(process.env.ADMIN_LOCKOUT_DURATION, 10) || 1800000, // 30 minutes
        passwordPolicy: {
            minLength: parseInt(process.env.ADMIN_PASSWORD_MIN_LENGTH, 10) || 12,
            requireUppercase: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_UPPERCASE, true),
            requireLowercase: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_LOWERCASE, true),
            requireNumbers: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_NUMBERS, true),
            requireSymbols: parseBooleanFromEnv(process.env.ADMIN_PASSWORD_REQUIRE_SYMBOLS, true),
            preventReuse: parseInt(process.env.ADMIN_PASSWORD_PREVENT_REUSE, 10) || 5,
            expiryDays: parseInt(process.env.ADMIN_PASSWORD_EXPIRY_DAYS, 10) || 90
        },
        
        // IP whitelist configuration
        ipWhitelist: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_IP_WHITELIST_ENABLED, isProduction),
            addresses: parseArrayFromEnv(process.env.ADMIN_IP_WHITELIST),
            allowPrivateNetworks: parseBooleanFromEnv(process.env.ADMIN_ALLOW_PRIVATE_NETWORKS, true),
            cloudflareEnabled: parseBooleanFromEnv(process.env.ADMIN_CLOUDFLARE_ENABLED, false),
            checkHeaders: ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'],
            strict: parseBooleanFromEnv(process.env.ADMIN_IP_WHITELIST_STRICT, true)
        },
        
        // SSL/TLS configuration
        ssl: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_SSL_ENABLED, isProduction),
            forceSSL: parseBooleanFromEnv(process.env.ADMIN_FORCE_SSL, isProduction),
            keyPath: process.env.ADMIN_SSL_KEY_PATH || '../key.pem',
            certPath: process.env.ADMIN_SSL_CERT_PATH || '../cert.pem',
            caPath: process.env.ADMIN_SSL_CA_PATH || './certs/admin-ca.pem',
            ciphers: process.env.ADMIN_SSL_CIPHERS || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256',
            requestClientCert: parseBooleanFromEnv(process.env.ADMIN_SSL_REQUEST_CLIENT_CERT, false),
            rejectUnauthorized: parseBooleanFromEnv(process.env.ADMIN_SSL_REJECT_UNAUTHORIZED, false),
            dhParamSize: parseInt(process.env.ADMIN_SSL_DH_PARAM_SIZE, 10) || 2048
        },
        
        // CORS configuration
        cors: {
            origins: parseArrayFromEnv(process.env.ADMIN_CORS_ORIGINS) || ['https://admin.insightserenity.com'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-CSRF-Token', 'X-Request-ID'],
            exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID', 'X-RateLimit-Remaining'],
            maxAge: parseInt(process.env.ADMIN_CORS_MAX_AGE, 10) || 86400
        },
        
        // Session security
        sessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET,
        cookieSecret: process.env.ADMIN_COOKIE_SECRET || process.env.COOKIE_SECRET,
        jwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
        refreshTokenSecret: process.env.ADMIN_REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET
    },
    
    // Administrative access control
    access: {
        superAdminEmails: parseArrayFromEnv(process.env.ADMIN_SUPER_ADMIN_EMAILS),
        allowedRoles: parseArrayFromEnv(process.env.ADMIN_ALLOWED_ROLES) || ['admin', 'superadmin'],
        requireEmailVerification: parseBooleanFromEnv(process.env.ADMIN_REQUIRE_EMAIL_VERIFICATION, true),
        requireApproval: parseBooleanFromEnv(process.env.ADMIN_REQUIRE_APPROVAL, true),
        autoApprovedomains: parseArrayFromEnv(process.env.ADMIN_AUTO_APPROVE_DOMAINS),
        restrictedActions: parseArrayFromEnv(process.env.ADMIN_RESTRICTED_ACTIONS),
        auditAllActions: parseBooleanFromEnv(process.env.ADMIN_AUDIT_ALL_ACTIONS, true)
    },
    
    // Upload configuration
    upload: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_UPLOAD_ENABLED, true),
        maxFileSize: parseInt(process.env.ADMIN_MAX_FILE_SIZE, 10) || 52428800, // 50MB
        allowedMimeTypes: parseArrayFromEnv(process.env.ADMIN_ALLOWED_MIME_TYPES) || [
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/pdf',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ],
        uploadDir: process.env.ADMIN_UPLOAD_DIR || './uploads/admin',
        tempDir: process.env.ADMIN_TEMP_DIR || './temp/admin',
        scanForViruses: parseBooleanFromEnv(process.env.ADMIN_SCAN_UPLOADS, true),
        quarantineDir: process.env.ADMIN_QUARANTINE_DIR || './quarantine/admin'
    },
    
    // Logging configuration
    logging: {
        level: process.env.ADMIN_LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
        format: process.env.ADMIN_LOG_FORMAT || 'json',
        logDir: process.env.ADMIN_LOG_DIR || './logs/admin',
        auditLogDir: process.env.ADMIN_AUDIT_LOG_DIR || './logs/audit',
        accessLogEnabled: parseBooleanFromEnv(process.env.ADMIN_ACCESS_LOG_ENABLED, true),
        errorLogEnabled: parseBooleanFromEnv(process.env.ADMIN_ERROR_LOG_ENABLED, true),
        performanceLogEnabled: parseBooleanFromEnv(process.env.ADMIN_PERFORMANCE_LOG_ENABLED, true),
        securityLogEnabled: parseBooleanFromEnv(process.env.ADMIN_SECURITY_LOG_ENABLED, true),
        logRotation: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_LOG_ROTATION_ENABLED, true),
            maxSize: process.env.ADMIN_LOG_MAX_SIZE || '100m',
            maxFiles: parseInt(process.env.ADMIN_LOG_MAX_FILES, 10) || 30,
            compress: parseBooleanFromEnv(process.env.ADMIN_LOG_COMPRESS, true)
        }
    },
    
    // Performance settings
    performance: {
        requestTimeout: parseInt(process.env.ADMIN_REQUEST_TIMEOUT, 10) || 300000, // 5 minutes
        maxConcurrentRequests: parseInt(process.env.ADMIN_MAX_CONCURRENT_REQUESTS, 10) || 100,
        enableCompression: parseBooleanFromEnv(process.env.ADMIN_ENABLE_COMPRESSION, true),
        compressionLevel: parseInt(process.env.ADMIN_COMPRESSION_LEVEL, 10) || 6,
        enableCaching: parseBooleanFromEnv(process.env.ADMIN_ENABLE_CACHING, true),
        cacheTimeout: parseInt(process.env.ADMIN_CACHE_TIMEOUT, 10) || 300000, // 5 minutes
        enableMetrics: parseBooleanFromEnv(process.env.ADMIN_ENABLE_METRICS, true)
    },
    
    // Integration settings
    integrations: {
        slack: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_SLACK_ENABLED, false),
            webhookUrl: process.env.ADMIN_SLACK_WEBHOOK_URL,
            channel: process.env.ADMIN_SLACK_CHANNEL || '#admin-alerts',
            username: process.env.ADMIN_SLACK_USERNAME || 'Admin Server',
            alertLevel: process.env.ADMIN_SLACK_ALERT_LEVEL || 'error'
        },
        email: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_EMAIL_ENABLED, true),
            from: process.env.ADMIN_EMAIL_FROM || 'admin@insightserenity.com',
            alertRecipients: parseArrayFromEnv(process.env.ADMIN_ALERT_EMAILS),
            criticalRecipients: parseArrayFromEnv(process.env.ADMIN_CRITICAL_EMAILS),
            provider: process.env.ADMIN_EMAIL_PROVIDER || process.env.EMAIL_PROVIDER || 'sendgrid'
        },
        sms: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_SMS_ENABLED, false),
            criticalNumbers: parseArrayFromEnv(process.env.ADMIN_CRITICAL_SMS),
            provider: process.env.ADMIN_SMS_PROVIDER || 'twilio'
        },
        webhooks: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_WEBHOOKS_ENABLED, false),
            endpoints: parseArrayFromEnv(process.env.ADMIN_WEBHOOK_ENDPOINTS),
            secret: process.env.ADMIN_WEBHOOK_SECRET,
            retryAttempts: parseInt(process.env.ADMIN_WEBHOOK_RETRY_ATTEMPTS, 10) || 3,
            timeout: parseInt(process.env.ADMIN_WEBHOOK_TIMEOUT, 10) || 5000
        }
    },
    
    // Maintenance settings
    maintenance: {
        autoBackup: parseBooleanFromEnv(process.env.ADMIN_AUTO_BACKUP, true),
        backupSchedule: process.env.ADMIN_BACKUP_SCHEDULE || '0 2 * * *', // 2 AM daily
        backupRetentionDays: parseInt(process.env.ADMIN_BACKUP_RETENTION_DAYS, 10) || 30,
        maintenanceWindow: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_MAINTENANCE_WINDOW_ENABLED, false),
            dayOfWeek: parseInt(process.env.ADMIN_MAINTENANCE_DAY, 10) || 0, // Sunday
            startHour: parseInt(process.env.ADMIN_MAINTENANCE_START_HOUR, 10) || 2,
            durationHours: parseInt(process.env.ADMIN_MAINTENANCE_DURATION, 10) || 4
        },
        healthCheck: {
            interval: parseInt(process.env.ADMIN_HEALTH_CHECK_INTERVAL, 10) || 30000,
            timeout: parseInt(process.env.ADMIN_HEALTH_CHECK_TIMEOUT, 10) || 5000,
            unhealthyThreshold: parseInt(process.env.ADMIN_UNHEALTHY_THRESHOLD, 10) || 3
        }
    },
    
    // UI Configuration
    ui: {
        theme: process.env.ADMIN_UI_THEME || 'dark',
        locale: process.env.ADMIN_UI_LOCALE || 'en-US',
        timezone: process.env.ADMIN_UI_TIMEZONE || 'UTC',
        dateFormat: process.env.ADMIN_UI_DATE_FORMAT || 'YYYY-MM-DD',
        timeFormat: process.env.ADMIN_UI_TIME_FORMAT || 'HH:mm:ss',
        customLogo: process.env.ADMIN_CUSTOM_LOGO_URL,
        customTitle: process.env.ADMIN_CUSTOM_TITLE || 'InsightSerenity Admin',
        showVersion: parseBooleanFromEnv(process.env.ADMIN_UI_SHOW_VERSION, !isProduction),
        showEnvironment: parseBooleanFromEnv(process.env.ADMIN_UI_SHOW_ENVIRONMENT, !isProduction)
    }
};