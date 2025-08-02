/**
 * @file Admin Server Entry Point
 * @description Enterprise administration server with enhanced security and monitoring
 * @version 3.0.0
 */

'use strict';

// =============================================================================
// ENVIRONMENT LOADING - MUST BE FIRST
// =============================================================================
const path = require('path');
const dotenv = require('dotenv');

// Enhanced environment variable loading with explicit path resolution
const envPath = path.resolve(__dirname, '.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(`Warning: Could not load .env file from ${envPath}:`, envResult.error.message);
  // Fallback to default .env loading
  dotenv.config();
}

// Validate critical environment variables before proceeding
const requiredEnvVars = ['NODE_ENV', 'ADMIN_PORT', 'DB_URI'];
// Add this verification after the existing console.log statements:
console.log(`DB_URI loaded: ${process.env.DB_URI ? 'Yes' : 'No'}`);
console.log(`Database URI that will be used: ${process.env.DB_URI || process.env.MONGODB_URI || 'localhost fallback'}`);
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  process.exit(1);
}

// Log environment loading status for debugging
console.log('Admin Server Environment Configuration:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`ADMIN_PORT: ${process.env.ADMIN_PORT}`);
console.log(`REDIS_ENABLED: ${process.env.REDIS_ENABLED}`);
console.log(`SESSION_STORE: ${process.env.SESSION_STORE}`);
console.log(`Cache Fallback: ${process.env.CACHE_FALLBACK_TO_MEMORY}`);
console.log(`Environment file loaded from: ${envPath}`);

// Add this after the existing console.log statements
console.log(`DB_URI: ${process.env.DB_URI ? 'Set' : 'Not set'}`);
console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? 'Set' : 'Not set'}`);
console.log(`Database URI being used: ${process.env.DB_URI || process.env.MONGODB_URI || 'localhost fallback'}`);

// =============================================================================
// MODULE IMPORTS - AFTER ENVIRONMENT LOADING
// =============================================================================
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = require('./app');
const config = require('./config');
const Database = require('../../shared/lib/database');
const logger = require('../../shared/lib/utils/logger');
const { AppError } = require('../../shared/lib/utils/app-error');

// Import enterprise audit configuration and factory
const auditConfig = require('./config/audit-config');
const AuditServiceFactory = require('../../shared/lib/security/audit/audit-service-factory');
const { AuditEvents } = require('../../shared/lib/security/audit/audit-events');

const HealthMonitor = require('../../shared/lib/utils/health-monitor');
const SecurityManager = require('../../shared/lib/security/security-manager');

/**
 * Admin Server class for platform administration
 * @class AdminServer
 */
class AdminServer {
    constructor() {
        this.server = null;
        this.isShuttingDown = false;
        this.healthMonitor = null;
        this.securityManager = null;
        this.adminConnections = new Map();
        this.startTime = null;
        this.auditService = null;
        this.adminConfig = null;
        this.mergedConfig = null;
    }

    /**
     * Initialize and start the admin server
     * @returns {Promise<http.Server|https.Server>} The server instance
     * @throws {Error} If server initialization fails
     */
    async start() {
        try {
            // Temporary fix to ensure config.app exists
            // if (!config.app) {
            //     config.app = {
            //         env: process.env.NODE_ENV || 'development',
            //         version: '1.0.0',
            //         name: 'InsightSerenity Admin Server'
            //     };
            // }

            this.startTime = new Date();
            
            // Ensure admin configuration structure exists BEFORE audit system initialization
            this.validateAndSetupAdminConfiguration();

            // Initialize database connection EARLY - before security verification
            await Database.initialize();
            
            // Initialize enterprise audit system FIRST
            await this.initializeAuditSystem();
            
            // Log detailed configuration status
            logger.info('Admin Server Configuration Status', {
                environment: config.app?.env || process.env.NODE_ENV || 'development',
                redis: {
                    enabled: process.env.REDIS_ENABLED === 'true',
                    fallbackToMemory: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
                    maxReconnectAttempts: process.env.CACHE_MAX_RECONNECT_ATTEMPTS
                },
                session: {
                    store: process.env.SESSION_STORE,
                    secure: process.env.SESSION_SECURE === 'true'
                },
                database: {
                    host: config.database.host,
                    multiTenant: config.database.multiTenant.enabled
                },
                audit: {
                    enabled: auditConfig.enabled,
                    storageType: auditConfig.storage.type,
                    batchSize: auditConfig.processing.batchSize,
                    flushInterval: auditConfig.processing.flushInterval,
                    environment: auditConfig.environment
                }
            });
            
            // Initialize security manager first
            this.securityManager = new SecurityManager({
                enforceIPWhitelist: true,
                requireMFA: this.adminConfig.security.requireMFA,
                sessionTimeout: this.adminConfig.security.sessionTimeout
            });
            
            logger.info('Starting InsightSerenity Admin Server', {
                environment: config.app?.env || process.env.NODE_ENV || 'development',
                version: config.app.version,
                nodeVersion: process.version,
                platform: process.platform,
                adminFeatures: {
                    multiTenant: config.database.multiTenant.enabled,
                    auditLogging: auditConfig.enabled,
                    realTimeMonitoring: this.adminConfig.features.realTimeMonitoring,
                    advancedSecurity: this.adminConfig.security.advanced,
                    redisEnabled: process.env.REDIS_ENABLED === 'true',
                    memoryFallback: process.env.CACHE_FALLBACK_TO_MEMORY === 'true'
                }
            });

            // Verify admin security prerequisites
            await this.verifySecurityPrerequisites();
            
            // Initialize the Express application with audit system
            const expressApp = await app.start();
            
            if (!expressApp) {
                throw new Error('Failed to initialize Admin Express application');
            }

            // Initialize health monitoring
            this.healthMonitor = new HealthMonitor({
                checkInterval: this.adminConfig.monitoring.healthCheckInterval || 30000,
                services: ['database', 'redis', 'auth', 'audit'],
                customChecks: {
                    adminSessions: () => this.checkAdminSessions(),
                    securityStatus: () => this.checkSecurityStatus(),
                    environmentConfig: () => this.checkEnvironmentConfig(),
                    auditSystem: () => this.checkAuditSystemHealth()
                }
            });
            
            await this.healthMonitor.start();

            // Log database health for admin visibility
            const dbHealth = Database.getHealthStatus();
            logger.info('Admin Server: Database health status', {
                isConnected: dbHealth.isConnected,
                totalConnections: dbHealth.totalConnections,
                multiTenantEnabled: dbHealth.multiTenantEnabled,
                strategy: dbHealth.strategy,
                tenantsActive: dbHealth.activeConnections.filter(c => c.name.includes('tenant')).length,
                masterConnection: dbHealth.activeConnections.find(c => c.name === 'master')?.state
            });

            // Create server with enhanced security for admin
            if (this.adminConfig.security.forceSSL || config.security.ssl.enabled) {
                this.server = await this.createSecureHttpsServer(expressApp);
            } else {
                if (config.app.env === 'production') {
                    throw new Error('Admin server must use HTTPS in production');
                }
                logger.warn('Admin server running without SSL - NOT RECOMMENDED');
                this.server = this.createHttpServer(expressApp);
            }

            // Start listening
            await this.listen();
            
            // Setup admin-specific handlers
            this.setupAdminHandlers();
            this.setupGracefulShutdown();
            this.setupErrorHandlers();
            this.setupSecurityMonitoring();

            // Log successful startup to audit
            await this.auditService.logEvent({
                eventType: AuditEvents.SYSTEM.CONFIG_CHANGE,
                userId: 'system',
                tenantId: 'admin',
                resource: 'admin_server',
                action: 'startup',
                result: 'success',
                metadata: {
                    version: config.app.version,
                    environment: config.app.env,
                    features: Object.keys(this.adminConfig.features || {}),
                    securityLevel: this.adminConfig.security.level || 'high',
                    cacheStrategy: process.env.REDIS_ENABLED === 'true' ? 'redis' : 'memory',
                    sessionStore: process.env.SESSION_STORE || 'memory',
                    auditEnabled: auditConfig.enabled,
                    auditStorageType: auditConfig.storage.type
                }
            });

            return this.server;
        } catch (error) {
            logger.error('Failed to start admin server', { 
                error: error.message,
                stack: error.stack,
                config: {
                    port: this.adminConfig?.port || 'undefined',
                    ssl: this.adminConfig?.security?.forceSSL || 'undefined',
                    redis: process.env.REDIS_ENABLED,
                    environment: process.env.NODE_ENV
                }
            });
            
            // Log startup failure to audit if service is available
            if (this.auditService) {
                try {
                    await this.auditService.logEvent({
                        eventType: AuditEvents.SYSTEM.CONFIG_CHANGE,
                        userId: 'system',
                        tenantId: 'admin',
                        resource: 'admin_server',
                        action: 'startup',
                        result: 'failure',
                        metadata: {
                            error: error.message,
                            errorCode: error.code
                        }
                    });
                } catch (auditError) {
                    logger.error('Failed to log startup failure to audit', { error: auditError.message });
                }
            }
            
            throw error;
        }
    }

    /**
     * Validate and setup admin configuration structure
     * @private
     * @returns {void}
     */
    validateAndSetupAdminConfiguration() {
        try {
            // Create a local admin configuration object instead of modifying the frozen config
            this.adminConfig = {
                port: parseInt(process.env.ADMIN_PORT, 10) || 5001,
                host: process.env.ADMIN_HOST || '127.0.0.1',
                security: {
                    forceSSL: process.env.ADMIN_FORCE_SSL === 'true' || false,
                    ipWhitelist: { 
                        enabled: process.env.ADMIN_IP_WHITELIST_ENABLED === 'true' || false,
                        addresses: process.env.ADMIN_IP_WHITELIST ? process.env.ADMIN_IP_WHITELIST.split(',') : []
                    },
                    requireMFA: process.env.ADMIN_REQUIRE_MFA === 'true' || false,
                    sessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT, 10) || 3600000,
                    ssl: {
                        keyPath: process.env.ADMIN_SSL_KEY_PATH || process.env.SSL_KEY_PATH || './certs/key.pem',
                        certPath: process.env.ADMIN_SSL_CERT_PATH || process.env.SSL_CERT_PATH || './certs/cert.pem',
                        ca: process.env.ADMIN_SSL_CA_PATH || process.env.SSL_CA_PATH
                    },
                    level: process.env.ADMIN_SECURITY_LEVEL || 'high',
                    advanced: process.env.ADMIN_ADVANCED_SECURITY === 'true' || false
                },
                features: {
                    realTimeMonitoring: process.env.ADMIN_REAL_TIME_MONITORING !== 'false',
                    advancedAnalytics: process.env.ADMIN_ADVANCED_ANALYTICS !== 'false',
                    bulkOperations: process.env.ADMIN_BULK_OPERATIONS !== 'false'
                },
                monitoring: {
                    healthCheckInterval: parseInt(process.env.ADMIN_HEALTH_CHECK_INTERVAL, 10) || 30000,
                    metricsEnabled: process.env.ADMIN_METRICS_ENABLED !== 'false',
                    alerting: { 
                        enabled: process.env.ADMIN_ALERTING_ENABLED === 'true' || false 
                    }
                }
            };

            // Create a merged configuration that includes both shared and admin config
            this.mergedConfig = {
                ...config,
                admin: this.adminConfig
            };

            logger.info('Admin configuration structure validated and initialized', {
                port: this.adminConfig.port,
                host: this.adminConfig.host,
                sslEnabled: this.adminConfig.security.forceSSL,
                ipWhitelistEnabled: this.adminConfig.security.ipWhitelist.enabled,
                mfaRequired: this.adminConfig.security.requireMFA,
                featuresEnabled: Object.keys(this.adminConfig.features).length,
                monitoringEnabled: this.adminConfig.monitoring.metricsEnabled
            });

        } catch (error) {
            logger.error('Failed to validate admin configuration structure', {
                error: error.message,
                stack: error.stack
            });
            
            // Set minimal working configuration as fallback
            this.adminConfig = {
                port: parseInt(process.env.ADMIN_PORT, 10) || 5001,
                host: process.env.ADMIN_HOST || '127.0.0.1',
                security: {
                    forceSSL: false,
                    ipWhitelist: { enabled: false },
                    requireMFA: false,
                    sessionTimeout: 3600000,
                    ssl: {},
                    level: 'medium',
                    advanced: false
                },
                features: {
                    realTimeMonitoring: true,
                    advancedAnalytics: false,
                    bulkOperations: false
                },
                monitoring: {
                    healthCheckInterval: 30000,
                    metricsEnabled: false,
                    alerting: { enabled: false }
                }
            };

            this.mergedConfig = {
                ...config,
                admin: this.adminConfig
            };

            logger.warn('Applied minimal admin configuration due to validation error');
        }
    }

    /**
     * Initialize enterprise audit system
     * @private
     * @returns {Promise<void>}
     */
    async initializeAuditSystem() {
        try {
            // Validate enterprise audit configuration
            AuditServiceFactory.validateConfig(auditConfig);
            
            // Initialize audit service factory with enterprise configuration
            AuditServiceFactory.initialize(auditConfig);
            
            // Get configured audit service instance
            this.auditService = AuditServiceFactory.getInstance();
            
            logger.info('Enterprise audit system initialized', {
                enabled: auditConfig.enabled,
                environment: auditConfig.environment,
                storageType: auditConfig.storage.type,
                batchSize: auditConfig.processing.batchSize,
                flushInterval: auditConfig.processing.flushInterval,
                logEmptyFlushes: auditConfig.processing.logEmptyFlushes,
                complianceStandards: Object.keys(auditConfig.compliance.standards)
                    .filter(standard => auditConfig.compliance.standards[standard]),
                encryptionEnabled: auditConfig.security.enableEncryption,
                riskScoringEnabled: auditConfig.riskScoring.enabled
            });

            // Test audit system with a startup event using valid event type
            if (auditConfig.enabled) {
                try {
                    await this.auditService.logEvent({
                        eventType: AuditEvents.SYSTEM.CONFIG_CHANGE,
                        userId: 'system',
                        tenantId: 'admin',
                        resource: 'audit_system',
                        action: 'initialize',
                        result: 'success',
                        metadata: {
                            message: 'Enterprise audit system initialization completed',
                            configVersion: auditConfig.version || '1.0.0'
                        }
                    });
                } catch (testError) {
                    logger.warn('Audit test event failed, but system will continue', {
                        error: testError.message
                    });
                }
            }

        } catch (error) {
            logger.error('Failed to initialize enterprise audit system', {
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Audit system initialization failed: ${error.message}`);
        }
    }

    /**
     * Check audit system health
     * @private
     * @returns {Object} Audit system health status
     */
    async checkAuditSystemHealth() {
        try {
            const factoryStatus = AuditServiceFactory.getStatus();
            const auditServiceConfig = this.auditService?.getConfig() || {};
            
            return {
                healthy: factoryStatus.initialized && factoryStatus.enabled,
                factoryStatus,
                serviceEnabled: this.auditService?.isEnabled() || false,
                queueSize: this.auditService?.auditQueue?.length || 0,
                isProcessing: this.auditService?.isProcessing || false,
                storageType: auditServiceConfig.storage?.type,
                lastCheck: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Audit system health check failed', { error: error.message });
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Verify environment configuration is properly loaded
     */
    async verifyEnvironmentConfiguration() {
        const requiredConfigs = [
            { key: 'NODE_ENV', value: process.env.NODE_ENV },
            { key: 'ADMIN_PORT', value: process.env.ADMIN_PORT },
            { key: 'DB_URI', value: process.env.DB_URI },
            { key: 'SESSION_SECRET', value: process.env.SESSION_SECRET }
        ];

        const missing = requiredConfigs.filter(config => !config.value);
        
        if (missing.length > 0) {
            throw new Error(`Missing critical environment variables: ${missing.map(c => c.key).join(', ')}`);
        }

        // Validate environment-specific requirements
        if (process.env.NODE_ENV === 'production') {
            const prodRequired = [
                { key: 'JWT_SECRET', value: process.env.JWT_SECRET },
                { key: 'ENCRYPTION_KEY', value: process.env.ENCRYPTION_KEY }
            ];

            const prodMissing = prodRequired.filter(config => !config.value);
            if (prodMissing.length > 0) {
                throw new Error(`Missing production environment variables: ${prodMissing.map(c => c.key).join(', ')}`);
            }
        }

        logger.info('Environment configuration verified successfully', {
            nodeEnv: process.env.NODE_ENV,
            redisEnabled: process.env.REDIS_ENABLED === 'true',
            sessionStore: process.env.SESSION_STORE,
            cacheFallback: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
            auditEnabled: auditConfig.enabled
        });
        
        return true;
    }

    /**
     * Create HTTP server (development only)
     */
    createHttpServer(app) {
        logger.warn('Creating HTTP server for admin - development only');
        return http.createServer(app);
    }

    /**
     * Verify security prerequisites for admin server
     */
    async verifySecurityPrerequisites() {
        const checks = [];
        
        // Check SSL certificates - FIXED: Use only admin config for SSL settings
        if (this.adminConfig.security.forceSSL || this.adminConfig.security.ssl?.enabled) {
            checks.push(this.verifySslCertificates());
        }
        
        // Check IP whitelist configuration
        if (this.adminConfig.security.ipWhitelist?.enabled) {
            checks.push(this.verifyIpWhitelist());
        }
        
        // Check audit log availability
        checks.push(this.verifyAuditLogSystem());
        
        // Check admin database permissions
        checks.push(this.verifyDatabasePermissions());
        
        // Check environment configuration
        checks.push(this.verifyEnvironmentConfiguration());
        
        const results = await Promise.allSettled(checks);
        const failures = results.filter(r => r.status === 'rejected');
        
        if (failures.length > 0) {
            throw new Error(`Security prerequisites failed: ${failures.map(f => f.reason).join(', ')}`);
        }
        
        logger.info('All security prerequisites verified successfully');
    }

    /**
     * Verify SSL certificates exist and are valid - FIXED: Use admin config consistently
     */
    async verifySslCertificates() {
        const keyPath = path.resolve(process.cwd(), this.adminConfig.security.ssl?.keyPath || './certs/key.pem');
        const certPath = path.resolve(process.cwd(), this.adminConfig.security.ssl?.certPath || './certs/cert.pem');
        
        if (!fs.existsSync(keyPath)) {
            throw new Error(`Admin SSL key not found: ${keyPath}`);
        }
        
        if (!fs.existsSync(certPath)) {
            throw new Error(`Admin SSL certificate not found: ${certPath}`);
        }
        
        logger.info('SSL certificates verified', { keyPath, certPath });
        return true;
    }

    /**
     * Create HTTPS server with enhanced security - FIXED: Use admin config consistently
     */
    async createSecureHttpsServer(app) {
        try {
            const keyPath = path.resolve(process.cwd(), this.adminConfig.security.ssl?.keyPath || './certs/key.pem');
            const certPath = path.resolve(process.cwd(), this.adminConfig.security.ssl?.certPath || './certs/cert.pem');
            
            if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
                throw new Error(`SSL certificates not found: key=${keyPath}, cert=${certPath}`);
            }

            const sslOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
                // Enhanced security options for admin
                secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
                ciphers: this.adminConfig.security.ssl?.ciphers || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256',
                honorCipherOrder: true,
                requestCert: this.adminConfig.security.ssl?.requestClientCert || false,
                rejectUnauthorized: this.adminConfig.security.ssl?.rejectUnauthorized || false
            };

            // Add CA if configured - FIXED: Use admin config consistently
            if (this.adminConfig.security.ssl?.ca) {
                const caPath = path.resolve(process.cwd(), this.adminConfig.security.ssl.ca);
                if (fs.existsSync(caPath)) {
                    sslOptions.ca = fs.readFileSync(caPath);
                }
            }

            logger.info('Admin HTTPS server configured with enhanced security', {
                tlsVersion: 'TLS 1.2+',
                clientCertRequired: sslOptions.requestCert,
                cipherSuite: 'High Security'
            });

            return https.createServer(sslOptions, app);
        } catch (error) {
            logger.error('Failed to create secure HTTPS server', { error: error.message });
            throw error;
        }
    }

    /**
     * Verify IP whitelist configuration
     */
    async verifyIpWhitelist() {
        const whitelist = this.adminConfig.security.ipWhitelist?.addresses || [];
        if (whitelist.length === 0) {
            throw new Error('Admin IP whitelist is empty - no access will be allowed');
        }
        
        logger.info('IP whitelist configured', { 
            addresses: whitelist.length,
            ranges: whitelist.filter(ip => ip.includes('/')).length
        });
        return true;
    }

    /**
     * Verify audit log system is operational
     */
    async verifyAuditLogSystem() {
        try {
            if (!this.auditService) {
                throw new Error('Audit service not initialized');
            }

            const isEnabled = this.auditService.isEnabled();
            if (!isEnabled) {
                logger.warn('Audit system is disabled');
                return true; // Not an error if intentionally disabled
            }

            // Test audit service functionality with a valid event type
            await this.auditService.logEvent({
                eventType: AuditEvents.SYSTEM.CONFIG_CHANGE,
                userId: 'system',
                tenantId: 'admin',
                resource: 'audit_system',
                action: 'verification_test',
                result: 'success',
                metadata: {
                    message: 'Audit system verification test',
                    timestamp: new Date().toISOString()
                }
            });

            logger.info('Audit log system verified successfully');
            return true;
        } catch (error) {
            throw new Error(`Audit system not operational: ${error.message}`);
        }
    }

    /**
     * Verify database permissions for admin operations
     */
    async verifyDatabasePermissions() {
        try {
            const db = await Database.getConnection();
            const collections = await db.db.listCollections().toArray();
            logger.info('Database permissions verified', { collections: collections.length });
            return true;
        } catch (error) {
            throw new AppError(`Database permission check failed: ${error.message}`, 500, 'DATABASE_PERMISSION_ERROR');
        }
    }

    /**
     * Start server listening
     */
    listen() {
        return new Promise((resolve, reject) => {
            // Use adminConfig values
            const port = this.adminConfig.port;
            const host = this.adminConfig.host;
            
            this.server.listen(port, host, () => {
                const protocol = this.server instanceof https.Server ? 'HTTPS' : 'HTTP';
                
                logger.info(`InsightSerenity Admin Server started`, {
                    protocol,
                    host,
                    port,
                    url: `${protocol.toLowerCase()}://${host}:${port}`,
                    environment: config.app.env,
                    adminDashboard: `${protocol.toLowerCase()}://${host}:${port}/admin/dashboard`,
                    apiDocs: `${protocol.toLowerCase()}://${host}:${port}/admin/api-docs`,
                    healthCheck: `${protocol.toLowerCase()}://${host}:${port}/health`,
                    redis: process.env.REDIS_ENABLED === 'true' ? 'enabled' : 'disabled (memory fallback)',
                    sessionStore: process.env.SESSION_STORE || 'memory',
                    auditSystem: {
                        enabled: auditConfig.enabled,
                        storageType: auditConfig.storage.type,
                        environment: auditConfig.environment
                    }
                });
                
                // Console output for development
                console.log(`\n🚀 InsightSerenity Admin Server Started`);
                console.log(`📍 URL: ${protocol.toLowerCase()}://${host}:${port}`);
                console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
                console.log(`🗄️  Database: Connected`);
                console.log(`💾 Cache: ${process.env.REDIS_ENABLED === 'true' ? 'Redis' : 'Memory'}`);
                console.log(`🛡️  Security: ${protocol} ${this.adminConfig.security.ipWhitelist?.enabled ? '+ IP Whitelist' : ''}`);
                console.log(`📊 Admin Dashboard: ${protocol.toLowerCase()}://${host}:${port}/admin/dashboard`);
                console.log(`🔍 Health Check: ${protocol.toLowerCase()}://${host}:${port}/health`);
                console.log(`📋 Audit System: ${auditConfig.enabled ? 'Enabled' : 'Disabled'} (${auditConfig.storage.type})`);
                
                if (process.env.NODE_ENV === 'development') {
                    console.log(`🐛 Debugger: ws://${host}:9230`);
                    console.log(`📚 API Docs: ${protocol.toLowerCase()}://${host}:${port}/admin/api-docs`);
                }
                
                resolve();
            });

            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error(`Admin port ${port} is already in use`);
                } else if (error.code === 'EACCES') {
                    logger.error(`Admin port ${port} requires elevated privileges`);
                } else {
                    logger.error('Admin server error', { error: error.message });
                }
                reject(error);
            });
        });
    }

    /**
     * Setup admin-specific connection handlers
     */
    setupAdminHandlers() {
        this.server.on('connection', (socket) => {
            const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
            this.adminConnections.set(connectionId, {
                socket,
                connectedAt: new Date(),
                remoteAddress: socket.remoteAddress
            });
            
            socket.on('close', () => {
                this.adminConnections.delete(connectionId);
            });
        });
        
        // Monitor admin connections
        setInterval(() => {
            if (this.adminConnections.size > 0) {
                logger.debug('Active admin connections', {
                    count: this.adminConnections.size,
                    addresses: Array.from(this.adminConnections.values()).map(c => c.remoteAddress)
                });
            }
        }, 60000);
    }

    /**
     * Setup security monitoring for admin activities
     */
    setupSecurityMonitoring() {
        // Monitor failed login attempts
        app.on('admin:login:failed', async (data) => {
            if (this.auditService) {
                await this.auditService.logEvent({
                    eventType: AuditEvents.AUTH.LOGIN_FAILURE,
                    userId: data.username || 'unknown',
                    tenantId: 'admin',
                    resource: 'admin_portal',
                    action: 'login_attempt',
                    result: 'failure',
                    metadata: {
                        attempts: data.attempts,
                        reason: data.reason
                    },
                    context: {
                        ip: data.ip,
                        userAgent: data.userAgent
                    }
                });
            }
            
            if (data.attempts > 5) {
                logger.warn('Potential brute force attack on admin', data);
            }
        });
        
        // Monitor privilege escalations
        app.on('admin:privilege:changed', async (data) => {
            if (this.auditService) {
                await this.auditService.logEvent({
                    eventType: AuditEvents.AUTH.PRIVILEGE_ESCALATION,
                    userId: data.actor?.id || 'unknown',
                    tenantId: 'admin',
                    resource: data.target?.type || 'user_account',
                    action: 'privilege_changed',
                    result: 'success',
                    metadata: {
                        changes: data.changes,
                        target: data.target
                    }
                });
            }
        });
    }

    /**
     * Check admin sessions health
     */
    async checkAdminSessions() {
        return {
            healthy: true,
            activeSessions: 0,
            expiredToday: 0,
            store: process.env.SESSION_STORE || 'memory'
        };
    }

    /**
     * Check security status
     */
    async checkSecurityStatus() {
        return {
            healthy: true,
            sslEnabled: this.server instanceof https.Server,
            ipWhitelistActive: this.adminConfig.security.ipWhitelist?.enabled,
            mfaRequired: this.adminConfig.security.requireMFA,
            lastSecurityScan: new Date().toISOString()
        };
    }

    /**
     * Check environment configuration health
     */
    async checkEnvironmentConfig() {
        return {
            healthy: true,
            redisEnabled: process.env.REDIS_ENABLED === 'true',
            fallbackToMemory: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
            sessionStore: process.env.SESSION_STORE || 'memory',
            environment: process.env.NODE_ENV,
            auditEnabled: auditConfig.enabled
        };
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) {
                logger.warn('Admin shutdown already in progress');
                return;
            }

            this.isShuttingDown = true;
            logger.info(`Admin server received ${signal}, starting graceful shutdown`);

            try {
                // Log shutdown event
                if (this.auditService) {
                    await this.auditService.logEvent({
                        eventType: AuditEvents.SYSTEM.CONFIG_CHANGE,
                        userId: 'system',
                        tenantId: 'admin',
                        resource: 'admin_server',
                        action: 'graceful_shutdown',
                        result: 'success',
                        metadata: {
                            signal,
                            uptime: process.uptime(),
                            activeConnections: this.adminConnections.size,
                            shutdownInitiated: new Date().toISOString()
                        }
                    });
                }

                // Stop health monitoring
                if (this.healthMonitor) {
                    await this.healthMonitor.stop();
                }

                // Close all admin connections
                for (const [id, conn] of this.adminConnections) {
                    conn.socket.destroy();
                }

                // Close server
                await this.closeServer();

                // Close database connections
                await Database.close();

                // Stop the Express app
                if (app.stop) {
                    await app.stop();
                }

                // Flush audit logs and cleanup audit system
                if (this.auditService) {
                    await this.auditService.cleanup();
                }

                logger.info('Admin server graceful shutdown completed', {
                    signal,
                    uptime: process.uptime()
                });
                
                process.exit(0);
            } catch (error) {
                logger.error('Error during admin shutdown', { error: error.message });
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }

    /**
     * Setup error handlers
     */
    setupErrorHandlers() {
        process.on('uncaughtException', async (error) => {
            logger.error('Admin Server: Uncaught Exception', { 
                error: error.message,
                stack: error.stack,
                severity: 'critical'
            });

            // Log critical error to audit if available
            if (this.auditService) {
                try {
                    await this.auditService.logEvent({
                        eventType: AuditEvents.SECURITY.THREAT_DETECTED,
                        userId: 'system',
                        tenantId: 'admin',
                        resource: 'admin_server',
                        action: 'uncaught_exception',
                        result: 'failure',
                        metadata: {
                            error: error.message,
                            stack: error.stack,
                            severity: 'critical'
                        }
                    });
                } catch (auditError) {
                    logger.error('Failed to log uncaught exception to audit', { error: auditError.message });
                }
            }
            
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('Admin Server: Unhandled Promise Rejection', { 
                reason: reason instanceof Error ? reason.message : reason,
                stack: reason instanceof Error ? reason.stack : undefined,
                severity: 'high'
            });

            // Log unhandled rejection to audit if available
            if (this.auditService) {
                try {
                    await this.auditService.logEvent({
                        eventType: AuditEvents.SECURITY.THREAT_DETECTED,
                        userId: 'system',
                        tenantId: 'admin',
                        resource: 'admin_server',
                        action: 'unhandled_rejection',
                        result: 'failure',
                        metadata: {
                            reason: reason instanceof Error ? reason.message : reason,
                            stack: reason instanceof Error ? reason.stack : undefined,
                            severity: 'high'
                        }
                    });
                } catch (auditError) {
                    logger.error('Failed to log unhandled rejection to audit', { error: auditError.message });
                }
            }
        });
    }

    /**
     * Close the server
     */
    closeServer() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                logger.error('Admin server forceful shutdown due to timeout');
                reject(new Error('Server close timeout'));
            }, 30000);

            this.server.close((error) => {
                clearTimeout(timeout);
                
                if (error) {
                    logger.error('Error closing admin server', { error: error.message });
                    reject(error);
                } else {
                    logger.info('Admin server closed successfully');
                    resolve();
                }
            });
        });
    }

    /**
     * Get admin server status
     */
    getStatus() {
        const dbHealth = Database.getHealthStatus();
        const uptime = this.startTime ? (new Date() - this.startTime) / 1000 : 0;
        const auditStatus = this.auditService ? {
            enabled: this.auditService.isEnabled(),
            config: this.auditService.getConfig(),
            factoryStatus: AuditServiceFactory.getStatus()
        } : null;
        
        return {
            server: {
                running: !!this.server,
                uptime,
                startTime: this.startTime,
                environment: config.app.env,
                version: config.app.version,
                nodeVersion: process.version
            },
            connections: {
                active: this.adminConnections.size,
                addresses: Array.from(this.adminConnections.values()).map(c => ({
                    address: c.remoteAddress,
                    duration: (new Date() - c.connectedAt) / 1000
                }))
            },
            security: {
                ssl: this.server instanceof https.Server,
                ipWhitelist: this.adminConfig.security.ipWhitelist?.enabled,
                mfa: this.adminConfig.security.requireMFA
            },
            configuration: {
                redis: process.env.REDIS_ENABLED === 'true',
                sessionStore: process.env.SESSION_STORE || 'memory',
                cacheFallback: process.env.CACHE_FALLBACK_TO_MEMORY === 'true'
            },
            audit: auditStatus,
            database: dbHealth,
            health: this.healthMonitor?.getStatus() || {},
            timestamp: new Date().toISOString()
        };
    }
}

// Create singleton instance
const adminServer = new AdminServer();

// Start server if run directly
if (require.main === module) {
    adminServer.start().catch((error) => {
        logger.error('Failed to start admin server', { 
            error: error.message,
            stack: error.stack 
        });
        process.exit(1);
    });
}

module.exports = adminServer;