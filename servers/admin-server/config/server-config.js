/**
 * @fileoverview Comprehensive Server Configuration Management
 * @module servers/admin-server/config/server-config
 * @description Centralized configuration management for InsightSerenity Admin Server
 *              with environment variable support, validation, and feature toggles
 * @version 2.0.0
 * @author InsightSerenity Team
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Server Configuration Manager
 * Centralizes all server-level configuration with environment variable overrides
 * @class ServerConfig
 */
class ServerConfig {
    constructor() {
        this.config = this.loadConfiguration();
        this.validateConfiguration();
    }

    /**
     * Load configuration from environment variables with defaults
     * @returns {Object} Server configuration
     */
    loadConfiguration() {
        return {
            // Server Identity
            server: {
                name: process.env.SERVER_NAME || 'admin-server',
                version: process.env.SERVER_VERSION || '2.0.0',
                environment: process.env.NODE_ENV || 'development',
                instanceId: process.env.INSTANCE_ID || this.generateInstanceId()
            },

            // Network Configuration
            network: {
                host: process.env.HOST || '0.0.0.0',
                port: this.normalizePort(process.env.ADMIN_PORT || process.env.PORT || '3000'),
                backlog: parseInt(process.env.BACKLOG, 10) || 511,
                ipv6Only: process.env.IPV6_ONLY === 'true'
            },

            // SSL/TLS Configuration
            ssl: {
                enabled: process.env.SSL_ENABLED === 'true',
                keyPath: process.env.SSL_KEY_PATH || './ssl/key.pem',
                certPath: process.env.SSL_CERT_PATH || './ssl/cert.pem',
                caPath: process.env.SSL_CA_PATH || null,
                passphrase: process.env.SSL_PASSPHRASE || null,
                requestCert: process.env.SSL_REQUEST_CERT === 'true',
                rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED !== 'false',
                minVersion: process.env.SSL_MIN_VERSION || 'TLSv1.2',
                maxVersion: process.env.SSL_MAX_VERSION || 'TLSv1.3',
                ciphers: process.env.SSL_CIPHERS || [
                    'ECDHE-RSA-AES128-GCM-SHA256',
                    'ECDHE-RSA-AES256-GCM-SHA384',
                    'DHE-RSA-AES128-GCM-SHA256',
                    'DHE-RSA-AES256-GCM-SHA384',
                    'ECDHE-RSA-AES128-SHA256',
                    'DHE-RSA-AES128-SHA256',
                    'HIGH',
                    '!aNULL',
                    '!eNULL',
                    '!EXPORT',
                    '!DES',
                    '!RC4',
                    '!MD5',
                    '!PSK',
                    '!SRP',
                    '!CAMELLIA'
                ].join(':'),
                honorCipherOrder: true,
                sessionTimeout: parseInt(process.env.SSL_SESSION_TIMEOUT, 10) || 300
            },

            // Cluster Configuration
            cluster: {
                enabled: process.env.ENABLE_CLUSTER === 'true',
                workers: parseInt(process.env.WORKER_COUNT, 10) || os.cpus().length,
                maxWorkers: parseInt(process.env.MAX_WORKERS, 10) || os.cpus().length * 2,
                respawnDelay: parseInt(process.env.WORKER_RESPAWN_DELAY, 10) || 1000,
                maxRespawns: parseInt(process.env.MAX_WORKER_RESPAWNS, 10) || 10,
                respawnWindow: parseInt(process.env.RESPAWN_WINDOW, 10) || 60000,
                gracefulWorkerShutdown: process.env.GRACEFUL_WORKER_SHUTDOWN !== 'false',
                workerTimeout: parseInt(process.env.WORKER_TIMEOUT, 10) || 30000,
                schedulingPolicy: process.env.CLUSTER_SCHEDULING || 'rr'
            },

            // Timeout Configuration
            timeouts: {
                server: parseInt(process.env.SERVER_TIMEOUT, 10) || 120000,
                keepAlive: parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10) || 65000,
                headers: parseInt(process.env.HEADERS_TIMEOUT, 10) || 66000,
                request: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
                shutdown: parseInt(process.env.SHUTDOWN_TIMEOUT, 10) || 30000,
                forceShutdown: parseInt(process.env.FORCE_SHUTDOWN_TIMEOUT, 10) || 60000,
                connectionDrain: parseInt(process.env.CONNECTION_DRAIN_TIMEOUT, 10) || 5000
            },

            // Connection Configuration
            connections: {
                maxConnections: parseInt(process.env.MAX_CONNECTIONS, 10) || 0,
                maxPending: parseInt(process.env.MAX_PENDING_CONNECTIONS, 10) || 0,
                trackConnections: process.env.TRACK_CONNECTIONS !== 'false',
                keepAlive: process.env.KEEP_ALIVE !== 'false',
                noDelay: process.env.TCP_NO_DELAY !== 'false'
            },

            // Database Configuration
            database: {
                enabled: process.env.DATABASE_ENABLED !== 'false',
                retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS, 10) || 5,
                retryDelay: parseInt(process.env.DB_RETRY_DELAY, 10) || 5000,
                healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL, 10) || 30000
            },

            // Health Monitoring Configuration
            health: {
                enabled: process.env.HEALTH_MONITORING !== 'false',
                checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000,
                memoryThreshold: parseInt(process.env.MEMORY_THRESHOLD, 10) || 90,
                cpuThreshold: parseInt(process.env.CPU_THRESHOLD, 10) || 90,
                eventLoopThreshold: parseInt(process.env.EVENT_LOOP_THRESHOLD, 10) || 100,
                gcMonitoring: process.env.GC_MONITORING === 'true',
                heapSnapshot: process.env.HEAP_SNAPSHOT === 'true',
                heapSnapshotThreshold: parseInt(process.env.HEAP_SNAPSHOT_THRESHOLD, 10) || 95
            },

            // Metrics Configuration
            metrics: {
                enabled: process.env.METRICS_ENABLED === 'true',
                collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL, 10) || 10000,
                retentionPeriod: parseInt(process.env.METRICS_RETENTION, 10) || 3600000,
                exportEnabled: process.env.METRICS_EXPORT === 'true',
                exportEndpoint: process.env.METRICS_EXPORT_ENDPOINT || null,
                prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true',
                statsdEnabled: process.env.STATSD_ENABLED === 'true',
                statsdHost: process.env.STATSD_HOST || 'localhost',
                statsdPort: parseInt(process.env.STATSD_PORT, 10) || 8125
            },

            // Logging Configuration
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                format: process.env.LOG_FORMAT || 'json',
                colorize: process.env.LOG_COLORIZE === 'true',
                timestamp: process.env.LOG_TIMESTAMP !== 'false',
                logStartup: process.env.LOG_STARTUP !== 'false',
                logShutdown: process.env.LOG_SHUTDOWN !== 'false',
                logConnections: process.env.LOG_CONNECTIONS === 'true',
                logRequests: process.env.LOG_REQUESTS !== 'false',
                logErrors: process.env.LOG_ERRORS !== 'false',
                logSlowRequests: process.env.LOG_SLOW_REQUESTS !== 'false',
                slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD, 10) || 5000
            },

            // Process Management
            process: {
                title: process.env.PROCESS_TITLE || 'insightserenity-admin',
                umask: process.env.PROCESS_UMASK || '0022',
                uid: process.env.PROCESS_UID || null,
                gid: process.env.PROCESS_GID || null,
                cwd: process.env.PROCESS_CWD || process.cwd()
            },

            // Feature Flags
            features: {
                trustProxy: process.env.TRUST_PROXY === 'true',
                serveStatic: process.env.SERVE_STATIC === 'true',
                enableCors: process.env.ENABLE_CORS !== 'false',
                enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
                enableHelmet: process.env.ENABLE_HELMET !== 'false',
                enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
                enableRequestId: process.env.ENABLE_REQUEST_ID !== 'false',
                enableGracefulShutdown: process.env.ENABLE_GRACEFUL_SHUTDOWN !== 'false',
                enableHealthRoutes: process.env.ENABLE_HEALTH_ROUTES !== 'false',
                enableMetricsRoutes: process.env.ENABLE_METRICS_ROUTES === 'true',
                enableApiDocs: process.env.ENABLE_API_DOCS !== 'false',
                enableRequestValidation: process.env.ENABLE_REQUEST_VALIDATION !== 'false',
                enableResponseValidation: process.env.ENABLE_RESPONSE_VALIDATION === 'true',
                enableAuditLog: process.env.ENABLE_AUDIT_LOG === 'true',
                enableDistributedTracing: process.env.ENABLE_DISTRIBUTED_TRACING === 'true'
            },

            // Startup Configuration
            startup: {
                banner: process.env.SHOW_BANNER !== 'false',
                delayMs: parseInt(process.env.STARTUP_DELAY, 10) || 0,
                healthCheck: process.env.STARTUP_HEALTH_CHECK !== 'false',
                warmup: process.env.STARTUP_WARMUP === 'true',
                warmupDuration: parseInt(process.env.WARMUP_DURATION, 10) || 5000
            },

            // Shutdown Configuration
            shutdown: {
                signals: (process.env.SHUTDOWN_SIGNALS || 'SIGTERM,SIGINT').split(','),
                drainConnections: process.env.DRAIN_CONNECTIONS !== 'false',
                closeDatabase: process.env.CLOSE_DATABASE !== 'false',
                flushLogs: process.env.FLUSH_LOGS !== 'false',
                notifyWorkers: process.env.NOTIFY_WORKERS !== 'false'
            }
        };
    }

    /**
     * Validate configuration values
     */
    validateConfiguration() {
        const errors = [];

        if (this.config.network.port === false) {
            errors.push('Invalid port configuration');
        }

        if (this.config.cluster.workers < 1) {
            errors.push('Worker count must be at least 1');
        }

        if (this.config.cluster.workers > this.config.cluster.maxWorkers) {
            errors.push('Worker count exceeds maximum allowed workers');
        }

        if (this.config.ssl.enabled) {
            if (!fs.existsSync(this.config.ssl.keyPath)) {
                errors.push(`SSL key file not found: ${this.config.ssl.keyPath}`);
            }
            if (!fs.existsSync(this.config.ssl.certPath)) {
                errors.push(`SSL certificate file not found: ${this.config.ssl.certPath}`);
            }
        }

        if (this.config.health.memoryThreshold < 1 || this.config.health.memoryThreshold > 100) {
            errors.push('Memory threshold must be between 1 and 100');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Normalize port value
     * @param {string|number} val - Port value
     * @returns {number|string|boolean} Normalized port
     */
    normalizePort(val) {
        const port = parseInt(val, 10);
        if (isNaN(port)) return val;
        if (port >= 0 && port <= 65535) return port;
        return false;
    }

    /**
     * Generate unique instance ID
     * @returns {string} Instance ID
     */
    generateInstanceId() {
        return `${os.hostname()}-${process.pid}-${Date.now().toString(36)}`;
    }

    /**
     * Get configuration value by path
     * @param {string} path - Configuration path (e.g., 'server.name')
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Configuration value
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Check if a feature is enabled
     * @param {string} feature - Feature name
     * @returns {boolean} Whether feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.config.features[feature] === true;
    }

    /**
     * Get all configuration
     * @returns {Object} Full configuration object
     */
    getAll() {
        return { ...this.config };
    }
}

/**
 * Application Configuration Manager
 * Centralizes all application-level configuration with environment variable overrides
 * @class AppConfig
 */
class AppConfig {
    constructor(serverConfig = null) {
        this.serverConfig = serverConfig;
        this.config = this.loadConfiguration();
    }

    /**
     * Load configuration from environment variables with defaults
     * @returns {Object} Application configuration
     */
    loadConfiguration() {
        return {
            // Application Identity
            app: {
                name: process.env.APP_NAME || 'InsightSerenity Admin',
                version: process.env.APP_VERSION || '2.0.0',
                environment: process.env.NODE_ENV || 'development',
                debug: process.env.DEBUG === 'true'
            },

            // Trust Proxy Configuration
            proxy: {
                enabled: process.env.TRUST_PROXY === 'true',
                hops: parseInt(process.env.PROXY_HOPS, 10) || 1
            },

            // Body Parser Configuration
            bodyParser: {
                json: {
                    enabled: process.env.ENABLE_JSON_PARSER !== 'false',
                    limit: process.env.JSON_LIMIT || '10mb',
                    strict: process.env.JSON_STRICT !== 'false',
                    type: process.env.JSON_TYPE || 'application/json'
                },
                urlencoded: {
                    enabled: process.env.ENABLE_URLENCODED_PARSER !== 'false',
                    limit: process.env.URL_ENCODED_LIMIT || '10mb',
                    extended: process.env.URL_ENCODED_EXTENDED !== 'false',
                    parameterLimit: parseInt(process.env.PARAMETER_LIMIT, 10) || 1000
                },
                raw: {
                    enabled: process.env.ENABLE_RAW_PARSER === 'true',
                    limit: process.env.RAW_LIMIT || '10mb',
                    type: process.env.RAW_TYPE || 'application/octet-stream'
                },
                text: {
                    enabled: process.env.ENABLE_TEXT_PARSER === 'true',
                    limit: process.env.TEXT_LIMIT || '10mb',
                    type: process.env.TEXT_TYPE || 'text/plain'
                }
            },

            // Cookie Parser Configuration
            cookies: {
                enabled: process.env.ENABLE_COOKIE_PARSER !== 'false',
                secret: process.env.COOKIE_SECRET || this.generateSecret('cookie'),
                options: {
                    httpOnly: process.env.COOKIE_HTTP_ONLY !== 'false',
                    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
                    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
                    maxAge: parseInt(process.env.COOKIE_MAX_AGE, 10) || 86400000
                }
            },

            // Security Configuration
            security: {
                helmet: {
                    enabled: process.env.ENABLE_HELMET !== 'false',
                    contentSecurityPolicy: process.env.ENABLE_CSP !== 'false',
                    crossOriginEmbedderPolicy: process.env.ENABLE_COEP === 'true',
                    crossOriginOpenerPolicy: process.env.ENABLE_COOP === 'true',
                    crossOriginResourcePolicy: process.env.ENABLE_CORP !== 'false',
                    dnsPrefetchControl: process.env.ENABLE_DNS_PREFETCH !== 'false',
                    frameguard: process.env.ENABLE_FRAMEGUARD !== 'false',
                    hidePoweredBy: process.env.HIDE_POWERED_BY !== 'false',
                    hsts: process.env.ENABLE_HSTS !== 'false',
                    ieNoOpen: process.env.ENABLE_IE_NO_OPEN !== 'false',
                    noSniff: process.env.ENABLE_NO_SNIFF !== 'false',
                    originAgentCluster: process.env.ENABLE_ORIGIN_AGENT === 'true',
                    permittedCrossDomainPolicies: process.env.ENABLE_PERMITTED_CROSS_DOMAIN !== 'false',
                    referrerPolicy: process.env.ENABLE_REFERRER_POLICY !== 'false',
                    xssFilter: process.env.ENABLE_XSS_FILTER !== 'false'
                },
                mongoSanitize: {
                    enabled: process.env.ENABLE_MONGO_SANITIZE !== 'false',
                    replaceWith: process.env.MONGO_SANITIZE_REPLACE || '_',
                    allowDots: process.env.MONGO_SANITIZE_ALLOW_DOTS === 'true'
                },
                xss: {
                    enabled: process.env.ENABLE_XSS_CLEAN !== 'false'
                },
                hpp: {
                    enabled: process.env.ENABLE_HPP !== 'false',
                    whitelist: (process.env.HPP_WHITELIST || 'sort,fields,page,limit,filter,search,status,category,tag,ids').split(',')
                }
            },

            // CORS Configuration
            cors: {
                enabled: process.env.ENABLE_CORS !== 'false',
                origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:5173').split(',').map(o => o.trim()),
                methods: (process.env.CORS_METHODS || 'GET,POST,PUT,PATCH,DELETE,OPTIONS').split(','),
                allowedHeaders: (process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-Requested-With,X-Request-ID,X-API-Key,X-Tenant-ID,X-Client-ID').split(','),
                exposedHeaders: (process.env.CORS_EXPOSED_HEADERS || 'X-Total-Count,X-Page-Count,X-Current-Page,X-Per-Page,X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining').split(','),
                credentials: process.env.CORS_CREDENTIALS !== 'false',
                maxAge: parseInt(process.env.CORS_MAX_AGE, 10) || 86400,
                preflightContinue: process.env.CORS_PREFLIGHT_CONTINUE === 'true',
                optionsSuccessStatus: parseInt(process.env.CORS_OPTIONS_STATUS, 10) || 204
            },

            // Compression Configuration
            compression: {
                enabled: process.env.ENABLE_COMPRESSION !== 'false',
                level: parseInt(process.env.COMPRESSION_LEVEL, 10) || 6,
                threshold: parseInt(process.env.COMPRESSION_THRESHOLD, 10) || 1024,
                memLevel: parseInt(process.env.COMPRESSION_MEM_LEVEL, 10) || 8,
                chunkSize: parseInt(process.env.COMPRESSION_CHUNK_SIZE, 10) || 16384,
                windowBits: parseInt(process.env.COMPRESSION_WINDOW_BITS, 10) || 15,
                filter: process.env.COMPRESSION_FILTER || 'default'
            },

            // Logging Configuration
            logging: {
                enabled: process.env.ENABLE_LOGGING !== 'false',
                format: process.env.MORGAN_FORMAT || (process.env.NODE_ENV === 'production' ? 'combined' : 'dev'),
                skipPaths: (process.env.LOG_SKIP_PATHS || '/health,/ready,/favicon.ico').split(','),
                colorize: process.env.LOG_COLORIZE !== 'false',
                immediate: process.env.LOG_IMMEDIATE === 'true'
            },

            // Rate Limiting Configuration
            rateLimiting: {
                enabled: process.env.ENABLE_RATE_LIMIT !== 'false',
                windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
                max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
                message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests, please try again later',
                standardHeaders: process.env.RATE_LIMIT_STANDARD_HEADERS !== 'false',
                legacyHeaders: process.env.RATE_LIMIT_LEGACY_HEADERS === 'true',
                skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
                skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
                keyGenerator: process.env.RATE_LIMIT_KEY || 'ip',
                store: process.env.RATE_LIMIT_STORE || 'memory',
                endpoints: {
                    auth: {
                        windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW, 10) || 900000,
                        max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 5
                    },
                    api: {
                        windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW, 10) || 60000,
                        max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 100
                    },
                    upload: {
                        windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW, 10) || 3600000,
                        max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX, 10) || 10
                    }
                }
            },

            // Request ID Configuration
            requestId: {
                enabled: process.env.ENABLE_REQUEST_ID !== 'false',
                header: process.env.REQUEST_ID_HEADER || 'X-Request-ID',
                generator: process.env.REQUEST_ID_GENERATOR || 'uuid',
                setHeader: process.env.REQUEST_ID_SET_HEADER !== 'false'
            },

            // Request Timeout Configuration
            timeout: {
                enabled: process.env.ENABLE_REQUEST_TIMEOUT !== 'false',
                ms: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000,
                message: process.env.REQUEST_TIMEOUT_MESSAGE || 'Request timeout'
            },

            // Response Configuration
            response: {
                poweredBy: process.env.RESPONSE_POWERED_BY || null,
                jsonSpaces: process.env.NODE_ENV === 'development' ? 2 : 0,
                etag: process.env.ENABLE_ETAG !== 'false',
                etagType: process.env.ETAG_TYPE || 'weak'
            },

            // Static Files Configuration
            static: {
                enabled: process.env.SERVE_STATIC === 'true',
                path: process.env.STATIC_PATH || path.join(__dirname, '..', 'public'),
                prefix: process.env.STATIC_PREFIX || '/static',
                maxAge: process.env.STATIC_MAX_AGE || '1d',
                etag: process.env.STATIC_ETAG !== 'false',
                lastModified: process.env.STATIC_LAST_MODIFIED !== 'false',
                index: process.env.STATIC_INDEX || false,
                dotfiles: process.env.STATIC_DOTFILES || 'ignore',
                extensions: process.env.STATIC_EXTENSIONS ? process.env.STATIC_EXTENSIONS.split(',') : false
            },

            // Health Check Configuration
            health: {
                enabled: process.env.ENABLE_HEALTH_ROUTES !== 'false',
                path: process.env.HEALTH_PATH || '/health',
                readyPath: process.env.READY_PATH || '/ready',
                livePath: process.env.LIVE_PATH || '/live',
                metricsPath: process.env.METRICS_PATH || '/metrics',
                metricsAuth: process.env.METRICS_AUTH !== 'false'
            },

            // API Documentation Configuration
            docs: {
                enabled: process.env.ENABLE_API_DOCS !== 'false',
                path: process.env.DOCS_PATH || '/api/docs',
                title: process.env.DOCS_TITLE || 'InsightSerenity Admin API',
                version: process.env.DOCS_VERSION || '1.0.0'
            },

            // Audit Logging Configuration
            audit: {
                enabled: process.env.ENABLE_AUDIT_LOG === 'true',
                logBody: process.env.AUDIT_LOG_BODY === 'true',
                logQuery: process.env.AUDIT_LOG_QUERY !== 'false',
                logHeaders: process.env.AUDIT_LOG_HEADERS === 'true',
                sensitiveFields: (process.env.AUDIT_SENSITIVE_FIELDS || 'password,token,secret,key,authorization').split(','),
                excludePaths: (process.env.AUDIT_EXCLUDE_PATHS || '/health,/ready,/metrics').split(',')
            },

            // Distributed Tracing Configuration
            tracing: {
                enabled: process.env.ENABLE_DISTRIBUTED_TRACING === 'true',
                serviceName: process.env.TRACING_SERVICE_NAME || 'admin-server',
                samplingRate: parseFloat(process.env.TRACING_SAMPLING_RATE) || 1.0,
                exporterType: process.env.TRACING_EXPORTER || 'jaeger',
                exporterEndpoint: process.env.TRACING_ENDPOINT || 'http://localhost:14268/api/traces'
            },

            // Validation Configuration
            validation: {
                enabled: process.env.ENABLE_REQUEST_VALIDATION !== 'false',
                abortEarly: process.env.VALIDATION_ABORT_EARLY === 'true',
                stripUnknown: process.env.VALIDATION_STRIP_UNKNOWN !== 'false',
                allowUnknown: process.env.VALIDATION_ALLOW_UNKNOWN === 'true'
            },

            // Error Handling Configuration
            errors: {
                includeStack: process.env.ERROR_INCLUDE_STACK === 'true' || process.env.NODE_ENV === 'development',
                logErrors: process.env.LOG_ERRORS !== 'false',
                logUnhandled: process.env.LOG_UNHANDLED !== 'false',
                notifyOnError: process.env.NOTIFY_ON_ERROR === 'true',
                notifyThreshold: parseInt(process.env.ERROR_NOTIFY_THRESHOLD, 10) || 10
            },

            // Slow Request Configuration
            slowRequest: {
                enabled: process.env.ENABLE_SLOW_REQUEST_LOG !== 'false',
                threshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD, 10) || 5000,
                logLevel: process.env.SLOW_REQUEST_LOG_LEVEL || 'warn'
            },

            // Upload Configuration
            upload: {
                enabled: process.env.ENABLE_FILE_UPLOAD !== 'false',
                maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760,
                maxFiles: parseInt(process.env.MAX_FILES, 10) || 5,
                allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif,application/pdf,application/msword').split(','),
                destination: process.env.UPLOAD_DESTINATION || './uploads'
            },

            // Session Configuration
            session: {
                enabled: process.env.ENABLE_SESSION === 'true',
                secret: process.env.SESSION_SECRET || this.generateSecret('session'),
                name: process.env.SESSION_NAME || 'admin.sid',
                resave: process.env.SESSION_RESAVE === 'true',
                saveUninitialized: process.env.SESSION_SAVE_UNINITIALIZED === 'true',
                cookie: {
                    secure: process.env.SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
                    httpOnly: process.env.SESSION_COOKIE_HTTP_ONLY !== 'false',
                    maxAge: parseInt(process.env.SESSION_COOKIE_MAX_AGE, 10) || 86400000,
                    sameSite: process.env.SESSION_COOKIE_SAME_SITE || 'lax'
                },
                store: process.env.SESSION_STORE || 'memory'
            },

            // Cache Configuration
            cache: {
                enabled: process.env.ENABLE_CACHE === 'true',
                ttl: parseInt(process.env.CACHE_TTL, 10) || 300,
                maxKeys: parseInt(process.env.CACHE_MAX_KEYS, 10) || 1000,
                checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 600
            },

            // Webhook Configuration
            webhook: {
                enabled: process.env.ENABLE_WEBHOOKS === 'true',
                secret: process.env.WEBHOOK_SECRET || this.generateSecret('webhook'),
                timeout: parseInt(process.env.WEBHOOK_TIMEOUT, 10) || 5000,
                retries: parseInt(process.env.WEBHOOK_RETRIES, 10) || 3
            }
        };
    }

    /**
     * Generate a random secret
     * @param {string} type - Secret type for identification
     * @returns {string} Generated secret
     */
    generateSecret(type) {
        return `${type}-${crypto.randomBytes(32).toString('hex')}`;
    }

    /**
     * Get configuration value by path
     * @param {string} configPath - Configuration path (e.g., 'security.helmet.enabled')
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Configuration value
     */
    get(configPath, defaultValue = null) {
        const keys = configPath.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Check if a feature is enabled
     * @param {string} feature - Feature path
     * @returns {boolean} Whether feature is enabled
     */
    isEnabled(feature) {
        return this.get(feature) === true;
    }

    /**
     * Get all configuration
     * @returns {Object} Full configuration object
     */
    getAll() {
        return { ...this.config };
    }
}

module.exports = {
    ServerConfig,
    AppConfig
};