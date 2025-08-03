/**
 * @file Session Configuration
 * @description Session management settings for admin server
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
 * Generate session name based on environment
 * @returns {string} Session cookie name
 */
const generateSessionName = () => {
    const prefix = process.env.ADMIN_SESSION_PREFIX || 'admin';
    const suffix = isProduction ? '' : `.${environment}`;
    return `${prefix}.sid${suffix}`;
};

/**
 * Session configuration for admin server
 */
module.exports = {
    // Core session settings
    enabled: parseBooleanFromEnv(process.env.ADMIN_SESSION_ENABLED, true),
    name: process.env.ADMIN_SESSION_NAME || generateSessionName(),
    secret: process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET,
    resave: parseBooleanFromEnv(process.env.ADMIN_SESSION_RESAVE, false),
    saveUninitialized: parseBooleanFromEnv(process.env.ADMIN_SESSION_SAVE_UNINITIALIZED, false),
    rolling: parseBooleanFromEnv(process.env.ADMIN_SESSION_ROLLING, true),
    proxy: parseBooleanFromEnv(process.env.ADMIN_SESSION_PROXY, isProduction),
    
    // Cookie configuration
    cookie: {
        secure: parseBooleanFromEnv(process.env.ADMIN_SESSION_SECURE, isProduction),
        httpOnly: parseBooleanFromEnv(process.env.ADMIN_SESSION_HTTP_ONLY, true),
        domain: process.env.ADMIN_SESSION_DOMAIN || (isProduction ? '.insightserenity.com' : undefined),
        path: process.env.ADMIN_SESSION_PATH || '/admin',
        maxAge: parseInt(process.env.ADMIN_SESSION_MAX_AGE, 10) || 3600000, // 1 hour
        sameSite: process.env.ADMIN_SESSION_SAME_SITE || 'strict',
        expires: null // Will be calculated based on maxAge
    },
    
    // Session store configuration (Redis)
    store: {
        type: process.env.ADMIN_SESSION_STORE_TYPE || 'redis',
        prefix: process.env.ADMIN_SESSION_STORE_PREFIX || 'admin:sess:',
        scanCount: parseInt(process.env.ADMIN_SESSION_SCAN_COUNT, 10) || 100,
        serializer: process.env.ADMIN_SESSION_SERIALIZER || 'json',
        
        // Redis specific settings
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT, 10) || 6379,
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.ADMIN_REDIS_DB || process.env.REDIS_DB, 10) || 1,
            keyPrefix: process.env.ADMIN_REDIS_KEY_PREFIX || 'admin:',
            ttl: parseInt(process.env.ADMIN_SESSION_TTL || process.env.REDIS_SESSION_TTL, 10) || 3600,
            disableTTL: parseBooleanFromEnv(process.env.ADMIN_SESSION_DISABLE_TTL, false),
            
            // Connection options
            enableOfflineQueue: parseBooleanFromEnv(process.env.REDIS_ENABLE_OFFLINE_QUEUE, true),
            connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
            maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3,
            enableReadyCheck: parseBooleanFromEnv(process.env.REDIS_ENABLE_READY_CHECK, true),
            autoResubscribe: parseBooleanFromEnv(process.env.REDIS_AUTO_RESUBSCRIBE, true),
            autoResendUnfulfilledCommands: parseBooleanFromEnv(process.env.REDIS_AUTO_RESEND, true),
            lazyConnect: parseBooleanFromEnv(process.env.REDIS_LAZY_CONNECT, false),
            
            // Cluster configuration (if using Redis cluster)
            cluster: parseBooleanFromEnv(process.env.REDIS_CLUSTER_ENABLED, false),
            clusterNodes: process.env.REDIS_CLUSTER_NODES ? 
                process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
                    const [host, port] = node.trim().split(':');
                    return { host, port: parseInt(port, 10) || 6379 };
                }) : [],
            
            // Sentinel configuration (if using Redis sentinel)
            sentinel: parseBooleanFromEnv(process.env.REDIS_SENTINEL_ENABLED, false),
            sentinels: process.env.REDIS_SENTINELS ? 
                process.env.REDIS_SENTINELS.split(',').map(sentinel => {
                    const [host, port] = sentinel.trim().split(':');
                    return { host, port: parseInt(port, 10) || 26379 };
                }) : [],
            sentinelName: process.env.REDIS_SENTINEL_NAME || 'mymaster'
        },
        
        // Memory store settings (fallback for development)
        memory: {
            checkPeriod: parseInt(process.env.ADMIN_MEMORY_CHECK_PERIOD, 10) || 86400000, // 24 hours
            max: parseInt(process.env.ADMIN_MEMORY_MAX_SESSIONS, 10) || 1000,
            ttl: parseInt(process.env.ADMIN_MEMORY_TTL, 10) || 3600000
        }
    },
    
    // Session security settings
    security: {
        // Session validation
        validateSession: parseBooleanFromEnv(process.env.ADMIN_VALIDATE_SESSION, true),
        validateIP: parseBooleanFromEnv(process.env.ADMIN_VALIDATE_IP, true),
        validateUserAgent: parseBooleanFromEnv(process.env.ADMIN_VALIDATE_USER_AGENT, true),
        
        // Session regeneration
        regenerateAfterLogin: parseBooleanFromEnv(process.env.ADMIN_REGENERATE_AFTER_LOGIN, true),
        regenerateInterval: parseInt(process.env.ADMIN_REGENERATE_INTERVAL, 10) || 900000, // 15 minutes
        
        // Concurrent session handling
        allowConcurrentSessions: parseBooleanFromEnv(process.env.ADMIN_ALLOW_CONCURRENT_SESSIONS, false),
        maxConcurrentSessions: parseInt(process.env.ADMIN_MAX_CONCURRENT_SESSIONS, 10) || 1,
        terminateOldestSession: parseBooleanFromEnv(process.env.ADMIN_TERMINATE_OLDEST_SESSION, true),
        
        // Session timeout settings
        absoluteTimeout: parseInt(process.env.ADMIN_SESSION_ABSOLUTE_TIMEOUT, 10) || 28800000, // 8 hours
        idleTimeout: parseInt(process.env.ADMIN_SESSION_IDLE_TIMEOUT, 10) || 1800000, // 30 minutes
        warningTime: parseInt(process.env.ADMIN_SESSION_WARNING_TIME, 10) || 300000, // 5 minutes before timeout
        
        // Additional security
        requireReauthentication: parseBooleanFromEnv(process.env.ADMIN_REQUIRE_REAUTH, true),
        reauthenticationInterval: parseInt(process.env.ADMIN_REAUTH_INTERVAL, 10) || 3600000, // 1 hour
        sensitiveActions: process.env.ADMIN_SENSITIVE_ACTIONS ? 
            process.env.ADMIN_SENSITIVE_ACTIONS.split(',').map(a => a.trim()) : 
            ['deleteUser', 'deleteOrganization', 'modifyBilling', 'exportData', 'modifySecuritySettings']
    },
    
    // Session monitoring
    monitoring: {
        trackActivity: parseBooleanFromEnv(process.env.ADMIN_TRACK_SESSION_ACTIVITY, true),
        logSessionEvents: parseBooleanFromEnv(process.env.ADMIN_LOG_SESSION_EVENTS, true),
        metricsEnabled: parseBooleanFromEnv(process.env.ADMIN_SESSION_METRICS, true),
        
        // Session analytics
        analytics: {
            trackLoginLocation: parseBooleanFromEnv(process.env.ADMIN_TRACK_LOGIN_LOCATION, true),
            trackDeviceInfo: parseBooleanFromEnv(process.env.ADMIN_TRACK_DEVICE_INFO, true),
            trackSessionDuration: parseBooleanFromEnv(process.env.ADMIN_TRACK_SESSION_DURATION, true),
            trackPageViews: parseBooleanFromEnv(process.env.ADMIN_TRACK_PAGE_VIEWS, false)
        },
        
        // Alerting
        alerts: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_SESSION_ALERTS, true),
            suspiciousActivity: parseBooleanFromEnv(process.env.ADMIN_ALERT_SUSPICIOUS_ACTIVITY, true),
            multipleFailed: parseBooleanFromEnv(process.env.ADMIN_ALERT_MULTIPLE_FAILED, true),
            unusualLocation: parseBooleanFromEnv(process.env.ADMIN_ALERT_UNUSUAL_LOCATION, true),
            concurrentLogin: parseBooleanFromEnv(process.env.ADMIN_ALERT_CONCURRENT_LOGIN, true)
        }
    },
    
    // Session cleanup
    cleanup: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_SESSION_CLEANUP, true),
        interval: parseInt(process.env.ADMIN_SESSION_CLEANUP_INTERVAL, 10) || 3600000, // 1 hour
        batchSize: parseInt(process.env.ADMIN_SESSION_CLEANUP_BATCH, 10) || 1000,
        
        // Expired session handling
        deleteExpired: parseBooleanFromEnv(process.env.ADMIN_DELETE_EXPIRED_SESSIONS, true),
        archiveBeforeDelete: parseBooleanFromEnv(process.env.ADMIN_ARCHIVE_SESSIONS, true),
        archiveRetention: parseInt(process.env.ADMIN_SESSION_ARCHIVE_RETENTION, 10) || 7776000000, // 90 days
        
        // Orphaned session handling
        detectOrphaned: parseBooleanFromEnv(process.env.ADMIN_DETECT_ORPHANED_SESSIONS, true),
        orphanedTimeout: parseInt(process.env.ADMIN_ORPHANED_TIMEOUT, 10) || 86400000 // 24 hours
    },
    
    // Development settings
    development: {
        debugSessions: parseBooleanFromEnv(process.env.ADMIN_DEBUG_SESSIONS, isDevelopment),
        logSessionData: parseBooleanFromEnv(process.env.ADMIN_LOG_SESSION_DATA, false),
        useMemoryStore: parseBooleanFromEnv(process.env.ADMIN_USE_MEMORY_STORE, false),
        disableSecureFlag: parseBooleanFromEnv(process.env.ADMIN_DISABLE_SECURE_FLAG, isDevelopment),
        mockSessions: parseBooleanFromEnv(process.env.ADMIN_MOCK_SESSIONS, false)
    }
};