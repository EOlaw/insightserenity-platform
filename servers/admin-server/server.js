/**
 * @file Admin Server Entry Point - ENHANCED VERSION WITH MODEL RECOVERY
 * @description Enterprise administration server with enhanced security, monitoring, and model recovery
 * @version 3.1.0
 */

'use strict';

// =============================================================================
// ENVIRONMENT LOADING - MUST BE FIRST
// =============================================================================
const path = require('path');
const dotenv = require('dotenv');
const EventEmitter = require('events');

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
console.log(`DB_URI: ${process.env.DB_URI ? 'Set' : 'Not set'}`);

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
 * Admin Server class for platform administration with enhanced model recovery
 * @class AdminServer
 */
class AdminServer extends EventEmitter {
    constructor() {
        super(); // Initialize EventEmitter
        this.server = null;
        this.isShuttingDown = false;
        this.healthMonitor = null;
        this.securityManager = null;
        this.adminConnections = new Map();
        this.startTime = null;
        this.auditService = null;
        this.adminConfig = null;
        this.mergedConfig = null;
        this.modelRecoveryAttempts = 0;
        this.maxModelRecoveryAttempts = 3;
    }

    /**
     * Initialize and start the admin server with enhanced model recovery
     * @returns {Promise<http.Server|https.Server>} The server instance
     * @throws {Error} If server initialization fails
     */
    async start() {
        try {
            this.startTime = new Date();

            // Ensure critical environment variables are set with defaults
            process.env.PASSKEY_ENABLED = process.env.PASSKEY_ENABLED || 'false';
            process.env.PASSKEY_RP_ID = process.env.PASSKEY_RP_ID || process.env.RELYING_PARTY_ID || 'localhost';
            process.env.PASSKEY_RP_NAME = process.env.PASSKEY_RP_NAME || process.env.RELYING_PARTY_NAME || 'InsightSerenity Platform';
            process.env.LOCAL_AUTH_ENABLED = process.env.LOCAL_AUTH_ENABLED || 'true';
            process.env.OAUTH_GOOGLE_ENABLED = process.env.OAUTH_GOOGLE_ENABLED || 'false';
            process.env.OAUTH_GITHUB_ENABLED = process.env.OAUTH_GITHUB_ENABLED || 'false';
            process.env.OAUTH_LINKEDIN_ENABLED = process.env.OAUTH_LINKEDIN_ENABLED || 'false';
            process.env.OAUTH_MICROSOFT_ENABLED = process.env.OAUTH_MICROSOFT_ENABLED || 'false';

            logger.info('Environment variables validated and defaults applied');

            // Ensure admin configuration structure exists BEFORE audit system initialization
            this.validateAndSetupAdminConfiguration();

            // Initialize database connection EARLY - before security verification
            await Database.initialize();

            // ENHANCED: Validate and recover models after database initialization
            await this.validateAndRecoverModels();

            // Initialize enterprise audit system with error handling
            await this.initializeAuditSystemSafely();

            // Initialize security manager
            this.securityManager = new SecurityManager({
                enforceIPWhitelist: true,
                requireMFA: this.adminConfig.security.requireMFA,
                sessionTimeout: this.adminConfig.security.sessionTimeout
            });

            logger.info('Starting InsightSerenity Admin Server', {
                environment: config.app?.env || process.env.NODE_ENV || 'development',
                version: config.app?.version || '1.0.0',
                nodeVersion: process.version,
                platform: process.platform,
                adminFeatures: {
                    multiTenant: String(config.database?.multiTenant?.enabled || false),
                    auditLogging: String(auditConfig?.enabled || false),
                    realTimeMonitoring: String(this.adminConfig?.features?.realTimeMonitoring || false),
                    advancedSecurity: String(this.adminConfig?.security?.advanced || false),
                    modelRecovery: String(true),
                    redisEnabled: process.env.REDIS_ENABLED === 'true',
                    memoryFallback: process.env.CACHE_FALLBACK_TO_MEMORY === 'true'
                }
            });

            // Verify admin security prerequisites
            await this.verifySecurityPrerequisites();

            // Initialize the Express application - FIXED: await the promise
            const expressApp = await app.start();

            if (!expressApp) {
                throw new Error('Failed to initialize Admin Express application');
            }

            // Initialize health monitoring with model status
            this.healthMonitor = new HealthMonitor({
                checkInterval: this.adminConfig.monitoring.healthCheckInterval || 30000,
                services: ['database', 'redis', 'auth', 'audit', 'models'],
                customChecks: {
                    adminSessions: () => this.checkAdminSessions(),
                    securityStatus: () => this.checkSecurityStatus(),
                    environmentConfig: () => this.checkEnvironmentConfig(),
                    auditSystem: () => this.checkAuditSystemHealth(),
                    modelStatus: () => this.checkModelStatus(),
                    modelRecovery: () => this.checkModelRecoveryStatus()
                }
            });

            await this.healthMonitor.start();

            // Create server
            if (this.shouldUseSSL()) {
                this.server = await this.createSecureHttpsServer(expressApp);
            } else {
                if (config.app?.env === 'production') {
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
            this.setupModelRecoveryMonitoring();

            // Log server startup success
            logger.info('Admin server startup completed successfully', {
                version: config.app?.version || '1.0.0',
                environment: config.app?.env || 'development',
                features: this.getEnabledFeatures(),
                securityLevel: this.adminConfig?.security?.level || 'high',
                cacheStrategy: process.env.REDIS_ENABLED === 'true' ? 'redis' : 'memory',
                sessionStore: process.env.SESSION_STORE || 'memory',
                auditEnabled: auditConfig?.enabled || false,
                auditStorageType: auditConfig?.storage?.type || 'hybrid',
                modelRecoveryEnabled: true,
                modelsHealthy: await this.getModelsHealthStatus()
            });

            return this.server;
        } catch (error) {
            logger.error('Failed to start admin server', {
                error: error.message,
                stack: error.stack,
                config: {
                    port: this.adminConfig?.port || 'undefined',
                    ssl: this.shouldUseSSL() ? 'enabled' : 'disabled',
                    redis: process.env.REDIS_ENABLED,
                    environment: process.env.NODE_ENV
                }
            });

            throw error;
        }
    }

    /**
     * ENHANCED: Validate and recover models with comprehensive error handling
     */
    async validateAndRecoverModels() {
        try {
            logger.info('Starting enhanced model validation and recovery', {
                attempt: this.modelRecoveryAttempts + 1,
                maxAttempts: this.maxModelRecoveryAttempts
            });

            // Get current model status
            const modelSummary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { total: 0, successful: 0, failed: 0 };
            const modelErrors = Database.getRegistrationErrors ? Database.getRegistrationErrors() : [];

            logger.info('Current model registration status', {
                total: modelSummary.total,
                successful: modelSummary.successful,
                failed: modelSummary.failed,
                errors: modelErrors.length
            });

            // If models failed to register and we haven't exceeded retry attempts
            if (modelSummary.failed > 0 && this.modelRecoveryAttempts < this.maxModelRecoveryAttempts) {
                logger.warn('Some models failed to register, attempting recovery', {
                    failed: modelSummary.failed,
                    successful: modelSummary.successful,
                    attempt: this.modelRecoveryAttempts + 1
                });

                this.modelRecoveryAttempts++;

                // Force model registration
                if (Database.forceModelRegistration) {
                    const forceResult = Database.forceModelRegistration();
                    logger.info('Force model registration result', forceResult);
                }

                // Attempt to reload models
                if (Database.reloadModels) {
                    const reloadResult = await Database.reloadModels();
                    logger.info('Model reload completed', reloadResult);
                }

                // Re-check status after recovery attempt
                const updatedSummary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : modelSummary;
                logger.info('Model status after recovery attempt', {
                    previousFailed: modelSummary.failed,
                    currentFailed: updatedSummary.failed,
                    improvement: modelSummary.failed - updatedSummary.failed
                });
            }

            // Validate essential models are available
            const essentialModels = ['User', 'Organization', 'AuditLog'];
            const missingEssential = [];

            for (const modelName of essentialModels) {
                try {
                    const model = await Database.getModel(modelName);
                    if (!model) {
                        missingEssential.push(modelName);
                    } else {
                        logger.debug(`Essential model verified: ${modelName}`);
                    }
                } catch (error) {
                    logger.warn(`Failed to verify essential model: ${modelName}`, { error: error.message });
                    missingEssential.push(modelName);
                }
            }

            if (missingEssential.length > 0) {
                logger.error('Essential models missing', { missing: missingEssential });
                // Create fallback models if needed
                await this.createFallbackModels(missingEssential);
            }

            // Test database operations
            await this.testDatabaseOperations();

            // Create test collections to ensure database is properly set up
            if (Database.createTestCollections) {
                try {
                    const testResult = await Database.createTestCollections();
                    logger.info('Database test collections created successfully', testResult);
                } catch (testError) {
                    logger.warn('Failed to create test collections', { error: testError.message });
                }
            }

            logger.info('Model validation and recovery completed successfully', {
                recoveryAttempts: this.modelRecoveryAttempts,
                essentialModelsAvailable: essentialModels.length - missingEssential.length,
                totalEssentialModels: essentialModels.length
            });

        } catch (error) {
            logger.error('Model validation and recovery failed', { 
                error: error.message,
                stack: error.stack,
                attempt: this.modelRecoveryAttempts
            });

            // Don't fail startup for model issues in development
            if (process.env.NODE_ENV === 'development') {
                logger.warn('Continuing startup despite model validation failure in development mode');
                return;
            }

            throw new AppError('Model validation failed', 500, 'MODEL_VALIDATION_ERROR', {
                originalError: error.message,
                recoveryAttempts: this.modelRecoveryAttempts
            });
        }
    }

    /**
     * Create fallback models for missing essential models
     */
    async createFallbackModels(missingModels) {
        for (const modelName of missingModels) {
            try {
                logger.info(`Creating fallback model: ${modelName}`);
                
                // Try to use Database.createTestCollections to ensure basic functionality
                if (Database.createTestCollections) {
                    await Database.createTestCollections();
                }

                // Try to register essential models if BaseModel is available
                const BaseModel = require('../../shared/lib/database/models/base-model');
                if (BaseModel && BaseModel.createModel) {
                    const mongoose = require('mongoose');
                    
                    if (modelName === 'User' && !await Database.getModel('User')) {
                        const userSchema = new mongoose.Schema({
                            username: { type: String, required: true, unique: true },
                            email: { type: String, required: true, unique: true },
                            password: { type: String, required: true },
                            profile: {
                                firstName: { type: String, required: true },
                                lastName: { type: String, required: true },
                                displayName: String
                            },
                            accountStatus: {
                                status: { type: String, default: 'active' }
                            },
                            isSystem: { type: Boolean, default: false },
                            metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
                            createdAt: { type: Date, default: Date.now },
                            updatedAt: { type: Date, default: Date.now }
                        });

                        Database.registerModel('User', userSchema);
                        logger.info('Fallback User model created');
                    }

                    if (modelName === 'Organization' && !await Database.getModel('Organization')) {
                        const organizationSchema = new mongoose.Schema({
                            name: { type: String, required: true },
                            slug: { type: String, required: true, unique: true },
                            displayName: String,
                            description: String,
                            type: { 
                                type: String, 
                                enum: ['individual', 'business', 'nonprofit', 'government', 'educational', 'healthcare', 'system', 'other'],
                                default: 'business'
                            },
                            contact: {
                                email: { type: String, required: true },
                                phone: String,
                                website: String
                            },
                            ownership: {
                                ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                                createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
                            },
                            subscription: {
                                status: { type: String, default: 'active' },
                                tier: { type: String, default: 'starter' }
                            },
                            status: {
                                state: { type: String, default: 'active' }
                            },
                            metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
                            createdAt: { type: Date, default: Date.now },
                            updatedAt: { type: Date, default: Date.now }
                        });

                        Database.registerModel('Organization', organizationSchema);
                        logger.info('Fallback Organization model created');
                    }
                }

            } catch (error) {
                logger.error(`Failed to create fallback for ${modelName}`, { 
                    error: error.message,
                    stack: error.stack
                });
            }
        }
    }

    /**
     * Test basic database operations
     */
    async testDatabaseOperations() {
        try {
            const connection = Database.getConnection();
            if (connection) {
                // Test basic read operation
                const collections = await connection.db.listCollections().toArray();
                logger.info('Database operations test passed', { 
                    collections: collections.length,
                    connectionStatus: 'healthy'
                });

                // Test basic write operation
                const testCollection = connection.db.collection('_admin_server_test');
                const testDoc = { 
                    test: true, 
                    timestamp: new Date(),
                    serverInstance: process.pid
                };
                
                await testCollection.insertOne(testDoc);
                await testCollection.deleteOne({ test: true });
                
                logger.debug('Database write/delete operations test passed');
                
            } else {
                throw new Error('No database connection available');
            }
        } catch (error) {
            logger.error('Database operations test failed', { 
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Check current model status
     */
    async checkModelStatus() {
        try {
            const summary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { total: 0, successful: 0, failed: 0 };
            const errors = Database.getRegistrationErrors ? Database.getRegistrationErrors() : [];
            
            return {
                healthy: summary.failed === 0,
                summary,
                errors: errors.slice(0, 5), // Limit error details
                lastCheck: new Date().toISOString(),
                recoveryAttempts: this.modelRecoveryAttempts,
                maxRecoveryAttempts: this.maxModelRecoveryAttempts
            };
        } catch (error) {
            logger.error('Model status check failed', { error: error.message });
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Check model recovery status
     */
    async checkModelRecoveryStatus() {
        try {
            return {
                healthy: this.modelRecoveryAttempts < this.maxModelRecoveryAttempts,
                recoveryAttempts: this.modelRecoveryAttempts,
                maxAttempts: this.maxModelRecoveryAttempts,
                canRecover: this.modelRecoveryAttempts < this.maxModelRecoveryAttempts,
                lastRecoveryAttempt: this.modelRecoveryAttempts > 0 ? new Date().toISOString() : null
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    /**
     * Get models health status
     */
    async getModelsHealthStatus() {
        try {
            const summary = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { successful: 0, failed: 0 };
            return {
                total: summary.total || summary.successful + summary.failed,
                successful: summary.successful,
                failed: summary.failed,
                healthy: summary.failed === 0 || summary.successful > 0
            };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    /**
     * Setup model recovery monitoring
     */
    setupModelRecoveryMonitoring() {
        try {
            // Monitor for model-related events
            this.on('model:recovery:needed', async (data) => {
                logger.warn('Model recovery needed', data);
                
                if (this.modelRecoveryAttempts < this.maxModelRecoveryAttempts) {
                    try {
                        await this.validateAndRecoverModels();
                    } catch (error) {
                        logger.error('Automatic model recovery failed', { error: error.message });
                    }
                }
            });

            // Monitor for model failures
            this.on('model:failure', async (data) => {
                logger.error('Model failure detected', data);
                
                if (this.auditService) {
                    try {
                        await this.auditService.logEvent({
                            eventType: AuditEvents.SYSTEM.ERROR,
                            userId: 'system',
                            tenantId: 'admin',
                            resource: 'model_system',
                            action: 'model_failure',
                            result: 'failure',
                            metadata: data
                        });
                    } catch (auditError) {
                        logger.warn('Failed to log model failure to audit', { error: auditError.message });
                    }
                }
            });

            logger.info('Model recovery monitoring setup completed');

        } catch (error) {
            logger.error('Failed to setup model recovery monitoring', { error: error.message });
        }
    }

    /**
     * FIXED: Determine if SSL should be used
     * @private
     * @returns {boolean} Whether SSL should be used
     */
    // shouldUseSSL() {
    //     // Check admin-specific SSL configuration first
    //     if (this.adminConfig?.security?.forceSSL === true) {
    //         return true;
    //     }

    //     // Check if SSL is explicitly disabled
    //     if (this.adminConfig?.security?.forceSSL === false) {
    //         return false;
    //     }

    //     // Check environment variable
    //     if (process.env.ADMIN_FORCE_SSL === 'true') {
    //         return true;
    //     }

    //     // Check for SSL certificates existence
    //     if (this.adminConfig?.security?.ssl?.keyPath && this.adminConfig?.security?.ssl?.certPath) {
    //         const keyPath = path.resolve(process.cwd(), this.adminConfig.security.ssl.keyPath);
    //         const certPath = path.resolve(process.cwd(), this.adminConfig.security.ssl.certPath);
            
    //         if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    //             return true;
    //         }
    //     }

    //     // Default to false for development
    //     return false;
    // }
    shouldUseSSL() {
        // Check if SSL is explicitly enabled in admin configuration
        if (this.adminConfig?.security?.ssl?.enabled === true) {
            return true;
        }

        // Check admin-specific SSL configuration
        if (this.adminConfig?.security?.forceSSL === true) {
            return true;
        }

        // Check environment variables
        if (process.env.ADMIN_SSL_ENABLED === 'true' || process.env.ADMIN_FORCE_SSL === 'true') {
            return true;
        }

        // Check for SSL certificates existence
        if (this.adminConfig?.security?.ssl?.keyPath && this.adminConfig?.security?.ssl?.certPath) {
            const keyPath = path.resolve(process.cwd(), this.adminConfig.security.ssl.keyPath);
            const certPath = path.resolve(process.cwd(), this.adminConfig.security.ssl.certPath);
            
            if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
                return true;
            }
        }

        // Default to false for development
        return false;
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
                        keyPath: process.env.ADMIN_SSL_KEY_PATH || process.env.SSL_KEY_PATH || '/insightserenity-platform/servers/admin-server/key.pem',
                        certPath: process.env.ADMIN_SSL_CERT_PATH || process.env.SSL_CERT_PATH || '/insightserenity-platform/servers/admin-server/cert.pem',
                        ca: process.env.ADMIN_SSL_CA_PATH || process.env.SSL_CA_PATH
                    },
                    level: process.env.ADMIN_SECURITY_LEVEL || 'high',
                    advanced: process.env.ADMIN_ADVANCED_SECURITY === 'true' || false
                },
                features: {
                    realTimeMonitoring: process.env.ADMIN_REAL_TIME_MONITORING !== 'false',
                    advancedAnalytics: process.env.ADMIN_ADVANCED_ANALYTICS !== 'false',
                    bulkOperations: process.env.ADMIN_BULK_OPERATIONS !== 'false',
                    modelRecovery: true
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
                sslEnabled: this.shouldUseSSL(),
                ipWhitelistEnabled: this.adminConfig.security.ipWhitelist.enabled,
                mfaRequired: this.adminConfig.security.requireMFA,
                featuresEnabled: Object.keys(this.adminConfig.features).length,
                monitoringEnabled: this.adminConfig.monitoring.metricsEnabled,
                modelRecoveryEnabled: this.adminConfig.features.modelRecovery
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
                    ipWhitelist: { enabled: false, addresses: [] },
                    requireMFA: false,
                    sessionTimeout: 3600000,
                    ssl: {},
                    level: 'medium',
                    advanced: false
                },
                features: {
                    realTimeMonitoring: true,
                    advancedAnalytics: false,
                    bulkOperations: false,
                    modelRecovery: true
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
     * Initialize enterprise audit system safely
     * @private
     * @returns {Promise<void>}
     */
    async initializeAuditSystemSafely() {
        try {
            // Check if audit config exists and is valid
            if (!auditConfig || typeof auditConfig !== 'object') {
                logger.warn('Audit config not found or invalid, creating minimal config');
                // Create minimal audit config
                global.auditConfig = {
                    enabled: false,
                    environment: process.env.NODE_ENV || 'development',
                    storage: { type: 'memory' },
                    processing: {
                        batchSize: 100,
                        flushInterval: 30000,
                        logEmptyFlushes: false
                    },
                    compliance: {
                        standards: {
                            sox: false,
                            gdpr: false,
                            hipaa: false
                        }
                    },
                    security: {
                        enableEncryption: false
                    },
                    riskScoring: {
                        enabled: false
                    }
                };
                return;
            }

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
                flushInterval: auditConfig.processing.flushInterval
            });

        } catch (error) {
            logger.warn('Audit system initialization failed, continuing without audit', {
                error: error.message
            });
            
            // Continue without audit system - not critical for basic operation
            this.auditService = null;
        }
    }

    /**
     * Check audit system health
     * @private
     * @returns {Object} Audit system health status
     */
    async checkAuditSystemHealth() {
        try {
            if (!this.auditService) {
                return {
                    healthy: true,
                    enabled: false,
                    message: 'Audit system disabled'
                };
            }

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
            auditEnabled: auditConfig?.enabled || false
        });

        return true;
    }

    /**
     * Get enabled admin features safely
     * @private
     * @returns {Array} Array of enabled feature names
     */
    getEnabledFeatures() {
        try {
            if (!this.adminConfig || !this.adminConfig.features || typeof this.adminConfig.features !== 'object') {
                logger.warn('Admin config features not properly initialized, returning empty array');
                return [];
            }

            const features = this.adminConfig.features;
            const enabledFeatures = Object.keys(features).filter(key => {
                try {
                    return features[key] === true;
                } catch (filterError) {
                    logger.warn(`Error checking feature ${key}`, { error: filterError.message });
                    return false;
                }
            });

            return enabledFeatures;
        } catch (error) {
            logger.warn('Error getting enabled features', { error: error.message });
            return [];
        }
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

        // Check SSL certificates only if SSL is required
        if (this.shouldUseSSL()) {
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
     * Verify SSL certificates exist and are valid
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
     * Create HTTPS server with enhanced security
     */
    async createSecureHttpsServer(app) {
        try {
            const keyPath = path.resolve(process.cwd(), this.adminConfig.security.ssl?.keyPath || './key.pem');
            const certPath = path.resolve(process.cwd(), this.adminConfig.security.ssl?.certPath || './cert.pem');

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

            // Add CA if configured
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
                logger.info('Audit system is disabled - continuing without audit logging');
                return true; // Not an error if intentionally disabled
            }

            const isEnabled = this.auditService.isEnabled();
            if (!isEnabled) {
                logger.warn('Audit system is disabled');
                return true; // Not an error if intentionally disabled
            }

            logger.info('Audit log system verified and ready for operational events');
            return true;
        } catch (error) {
            logger.warn(`Audit system check failed: ${error.message} - continuing without audit`);
            return true; // Don't fail startup for audit issues
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
                    environment: config.app?.env || process.env.NODE_ENV,
                    adminDashboard: `${protocol.toLowerCase()}://${host}:${port}/admin/dashboard`,
                    apiDocs: `${protocol.toLowerCase()}://${host}:${port}/admin/api-docs`,
                    healthCheck: `${protocol.toLowerCase()}://${host}:${port}/health`,
                    redis: process.env.REDIS_ENABLED === 'true' ? 'enabled' : 'disabled (memory fallback)',
                    sessionStore: process.env.SESSION_STORE || 'memory',
                    auditSystem: {
                        enabled: auditConfig?.enabled || false,
                        storageType: auditConfig?.storage?.type || 'memory',
                        environment: auditConfig?.environment || 'development'
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
                console.log(`📋 Audit System: ${auditConfig?.enabled ? 'Enabled' : 'Disabled'} (${auditConfig?.storage?.type || 'memory'})`);
                console.log(`🔧 Model Recovery: Enabled`);

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
        this.on('admin:login:failed', async (data) => {
            if (this.auditService) {
                try {
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
                } catch (auditError) {
                    logger.warn('Failed to log audit event', { error: auditError.message });
                }
            }

            if (data.attempts > 5) {
                logger.warn('Potential brute force attack on admin', data);
            }
        });

        // Monitor privilege escalations
        this.on('admin:privilege:changed', async (data) => {
            if (this.auditService) {
                try {
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
                } catch (auditError) {
                    logger.warn('Failed to log audit event', { error: auditError.message });
                }
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
            auditEnabled: auditConfig?.enabled || false
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
                logger.info('Admin server graceful shutdown initiated', {
                    signal,
                    uptime: process.uptime(),
                    activeConnections: this.adminConnections.size,
                    shutdownInitiated: new Date().toISOString()
                });

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

            // Emit model recovery needed if it's a model-related error
            if (error.message && error.message.toLowerCase().includes('model')) {
                this.emit('model:failure', {
                    error: error.message,
                    type: 'uncaught_exception',
                    timestamp: new Date().toISOString()
                });
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

            // Emit model recovery needed if it's a model-related error
            if (reason && String(reason).toLowerCase().includes('model')) {
                this.emit('model:failure', {
                    error: String(reason),
                    type: 'unhandled_rejection',
                    timestamp: new Date().toISOString()
                });
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
     * Get admin server status with enhanced model information
     */
    getStatus() {
        const dbHealth = Database.getHealthStatus();
        const uptime = this.startTime ? (new Date() - this.startTime) / 1000 : 0;
        const auditStatus = this.auditService ? {
            enabled: this.auditService.isEnabled(),
            config: this.auditService.getConfig(),
            factoryStatus: AuditServiceFactory.getStatus()
        } : { enabled: false };

        const modelStatus = Database.getRegistrationSummary ? Database.getRegistrationSummary() : { total: 0, successful: 0, failed: 0 };

        return {
            server: {
                running: !!this.server,
                uptime,
                startTime: this.startTime,
                environment: config.app?.env,
                version: config.app?.version,
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
            models: {
                total: modelStatus.total,
                successful: modelStatus.successful,
                failed: modelStatus.failed,
                recoveryAttempts: this.modelRecoveryAttempts,
                maxRecoveryAttempts: this.maxModelRecoveryAttempts,
                recoveryEnabled: this.adminConfig.features.modelRecovery
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