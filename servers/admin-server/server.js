/**
 * @file Admin Server Entry Point - FIXED VERSION WITH ENHANCED DEBUGGING
 * @description Enterprise administration server with multi-database architecture support
 * @version 3.2.1 - FIXED
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

// Add this at the very top of your server.js file, after require('dotenv').config()
console.log('DEBUG - Environment Variables Check:');
console.log('ACCESS_TOKEN_SECRET exists:', !!process.env.ACCESS_TOKEN_SECRET);
console.log('TEMPORARY_TOKEN_SECRET exists:', !!process.env.TEMPORARY_TOKEN_SECRET);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);

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

console.log('🔄 DEBUG: Loading core modules...');

let app;
try {
    app = require('./app');
    console.log('✅ DEBUG: App module loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load app module:', error.message);
    throw error;
}

let config;
try {
    config = require('./config');
    console.log('✅ DEBUG: Config module loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load config module:', error.message);
    console.log('🔄 DEBUG: Attempting fallback config...');
    config = {
        app: { env: process.env.NODE_ENV, version: '1.0.0' },
        admin: { port: 4001, security: { ssl: { enabled: false } } }
    };
    console.log('⚠️  DEBUG: Using fallback config');
}

let Database, ConnectionManager;
try {
    Database = require('../../shared/lib/database');
    console.log('✅ DEBUG: Database module loaded successfully');
    
    // FIXED: Import ConnectionManager directly since Database doesn't expose getAllConnections
    ConnectionManager = require('../../shared/lib/database/connection-manager');
    console.log('✅ DEBUG: ConnectionManager loaded successfully');
    
    // Check available methods
    console.log('🔍 DEBUG: Database methods:', Object.getOwnPropertyNames(Database).filter(name => typeof Database[name] === 'function'));
    console.log('🔍 DEBUG: ConnectionManager methods:', Object.getOwnPropertyNames(ConnectionManager).filter(name => typeof ConnectionManager[name] === 'function'));
    
} catch (error) {
    console.error('❌ DEBUG: Failed to load database modules:', error.message);
    console.error('❌ DEBUG: Error stack:', error.stack);
    throw error;
}

let logger;
try {
    logger = require('../../shared/lib/utils/logger');
    console.log('✅ DEBUG: Logger module loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load logger, using console fallback');
    logger = {
        info: console.log,
        warn: console.warn,
        error: console.error,
        debug: console.log
    };
}

let AppError;
try {
    const { AppError: ImportedAppError } = require('../../shared/lib/utils/app-error');
    AppError = ImportedAppError;
    console.log('✅ DEBUG: AppError loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load AppError, using fallback');
    AppError = class AppError extends Error {
        constructor(message, statusCode = 500, code = 'UNKNOWN_ERROR', details = {}) {
            super(message);
            this.statusCode = statusCode;
            this.code = code;
            this.details = details;
        }
    };
}

// Import enterprise audit configuration and factory with error handling
let auditConfig, AuditServiceFactory, AuditEvents;
try {
    auditConfig = require('./config/audit-config');
    console.log('✅ DEBUG: Audit config loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load audit config:', error.message);
    auditConfig = { enabled: false };
}

try {
    AuditServiceFactory = require('../../shared/lib/security/audit/audit-service-factory');
    console.log('✅ DEBUG: AuditServiceFactory loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load AuditServiceFactory:', error.message);
    AuditServiceFactory = null;
}

try {
    const { AuditEvents: ImportedAuditEvents } = require('../../shared/lib/security/audit/audit-events');
    AuditEvents = ImportedAuditEvents;
    console.log('✅ DEBUG: AuditEvents loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load AuditEvents:', error.message);
    AuditEvents = { AUTH: {}, SYSTEM: {}, SECURITY: {} };
}

let HealthMonitor, SecurityManager;
try {
    HealthMonitor = require('../../shared/lib/utils/health-monitor');
    console.log('✅ DEBUG: HealthMonitor loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load HealthMonitor:', error.message);
    HealthMonitor = class HealthMonitor {
        constructor() {}
        async start() {}
        async stop() {}
        getStatus() { return { status: 'mock' }; }
    };
}

try {
    SecurityManager = require('../../shared/lib/security/security-manager');
    console.log('✅ DEBUG: SecurityManager loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load SecurityManager:', error.message);
    SecurityManager = class SecurityManager {
        constructor() {}
    };
}

/**
 * Admin Server class for platform administration with multi-database architecture
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
        
        // Multi-database tracking
        this.databaseConnections = new Map();
        this.databaseHealthStatus = new Map();
        this.databaseCollectionMapping = new Map();
        
        console.log('✅ DEBUG: AdminServer instance created successfully');
    }

    /**
     * Initialize and start the admin server with multi-database architecture
     * @returns {Promise<http.Server|https.Server>} The server instance
     * @throws {Error} If server initialization fails
     */
    async start() {
        try {
            console.log('🚀 DEBUG: Starting admin server initialization...');
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

            console.log('✅ DEBUG: Environment variables validated and defaults applied');
            logger.info('Environment variables validated and defaults applied');

            // Ensure admin configuration structure exists BEFORE audit system initialization
            console.log('🔧 DEBUG: Setting up admin configuration...');
            this.validateAndSetupAdminConfiguration();
            console.log('✅ DEBUG: Admin configuration setup completed');

            // Initialize database connection EARLY - before security verification
            console.log('🔄 DEBUG: Initializing database connection...');
            try {
                await Database.initialize();
                console.log('✅ DEBUG: Database initialized successfully');
            } catch (dbError) {
                console.error('❌ DEBUG: Database initialization failed:', dbError.message);
                console.error('❌ DEBUG: Database error stack:', dbError.stack);
                throw dbError;
            }

            // ENHANCED: Initialize multi-database connections and validate architecture
            console.log('🔄 DEBUG: Initializing multi-database architecture...');
            try {
                await this.initializeMultiDatabaseArchitecture();
                console.log('✅ DEBUG: Multi-database architecture initialized successfully');
            } catch (multiDbError) {
                console.error('❌ DEBUG: Multi-database architecture initialization failed:', multiDbError.message);
                console.error('❌ DEBUG: Multi-database error stack:', multiDbError.stack);
                
                // Continue without multi-database in development
                if (process.env.NODE_ENV === 'development') {
                    console.log('⚠️  DEBUG: Continuing without multi-database architecture in development mode');
                    logger.warn('Continuing without multi-database architecture in development mode');
                } else {
                    throw multiDbError;
                }
            }

            // ENHANCED: Validate and recover models after database initialization
            console.log('🔄 DEBUG: Validating and recovering models...');
            try {
                await this.validateAndRecoverModels();
                console.log('✅ DEBUG: Model validation and recovery completed');
            } catch (modelError) {
                console.error('❌ DEBUG: Model validation failed:', modelError.message);
                logger.warn('Model validation failed, continuing with basic models', { error: modelError.message });
            }

            // Initialize enterprise audit system with error handling
            console.log('🔄 DEBUG: Initializing audit system...');
            try {
                await this.initializeAuditSystemSafely();
                console.log('✅ DEBUG: Audit system initialized');
            } catch (auditError) {
                console.error('❌ DEBUG: Audit system initialization failed:', auditError.message);
                logger.warn('Audit system initialization failed, continuing without audit', { error: auditError.message });
            }

            // Initialize security manager
            console.log('🔄 DEBUG: Initializing security manager...');
            try {
                this.securityManager = new SecurityManager({
                    enforceIPWhitelist: true,
                    requireMFA: this.adminConfig.security.requireMFA,
                    sessionTimeout: this.adminConfig.security.sessionTimeout
                });
                console.log('✅ DEBUG: Security manager initialized');
            } catch (securityError) {
                console.error('❌ DEBUG: Security manager initialization failed:', securityError.message);
                logger.warn('Security manager initialization failed, using basic security', { error: securityError.message });
                this.securityManager = { enforceIPWhitelist: false };
            }

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
                    multiDatabase: String(true),
                    redisEnabled: process.env.REDIS_ENABLED === 'true',
                    memoryFallback: process.env.CACHE_FALLBACK_TO_MEMORY === 'true'
                },
                databases: {
                    total: this.databaseConnections.size,
                    connected: Array.from(this.databaseConnections.keys()),
                    collectionsMapping: Object.fromEntries(this.databaseCollectionMapping)
                }
            });

            // Verify admin security prerequisites with multi-database support
            console.log('🔄 DEBUG: Verifying security prerequisites...');
            try {
                await this.verifySecurityPrerequisites();
                console.log('✅ DEBUG: Security prerequisites verified');
            } catch (securityPrereqError) {
                console.error('❌ DEBUG: Security prerequisites verification failed:', securityPrereqError.message);
                logger.warn('Security prerequisites verification failed, continuing with reduced security', { error: securityPrereqError.message });
            }

            // Initialize the Express application - FIXED: await the promise
            console.log('🔄 DEBUG: Starting Express application...');
            let expressApp;
            try {
                expressApp = await app.start();
                console.log('✅ DEBUG: Express application started successfully');
            } catch (appError) {
                console.error('❌ DEBUG: Express application startup failed:', appError.message);
                console.error('❌ DEBUG: App error stack:', appError.stack);
                throw appError;
            }

            if (!expressApp) {
                throw new Error('Failed to initialize Admin Express application');
            }

            // Initialize health monitoring with multi-database status
            console.log('🔄 DEBUG: Initializing health monitoring...');
            try {
                this.healthMonitor = new HealthMonitor({
                    checkInterval: this.adminConfig.monitoring.healthCheckInterval || 30000,
                    services: ['database', 'redis', 'auth', 'audit', 'models', 'multi-database'],
                    customChecks: {
                        adminSessions: () => this.checkAdminSessions(),
                        securityStatus: () => this.checkSecurityStatus(),
                        environmentConfig: () => this.checkEnvironmentConfig(),
                        auditSystem: () => this.checkAuditSystemHealth(),
                        modelStatus: () => this.checkModelStatus(),
                        modelRecovery: () => this.checkModelRecoveryStatus(),
                        multiDatabaseHealth: () => this.checkMultiDatabaseHealth(),
                        databaseCollectionMapping: () => this.checkDatabaseCollectionMapping()
                    }
                });

                await this.healthMonitor.start();
                console.log('✅ DEBUG: Health monitoring started successfully');
            } catch (healthError) {
                console.error('❌ DEBUG: Health monitoring initialization failed:', healthError.message);
                logger.warn('Health monitoring initialization failed, continuing without monitoring', { error: healthError.message });
                this.healthMonitor = { start: async () => {}, stop: async () => {}, getStatus: () => ({ status: 'disabled' }) };
            }

            // Create server
            console.log('🔄 DEBUG: Creating server...');
            try {
                if (this.shouldUseSSL()) {
                    console.log('🔒 DEBUG: Creating HTTPS server...');
                    this.server = await this.createSecureHttpsServer(expressApp);
                } else {
                    if (config.app?.env === 'production') {
                        throw new Error('Admin server must use HTTPS in production');
                    }
                    console.log('🔓 DEBUG: Creating HTTP server (development)...');
                    logger.warn('Admin server running without SSL - NOT RECOMMENDED');
                    this.server = this.createHttpServer(expressApp);
                }
                console.log('✅ DEBUG: Server created successfully');
            } catch (serverError) {
                console.error('❌ DEBUG: Server creation failed:', serverError.message);
                throw serverError;
            }

            // Start listening
            console.log('🔄 DEBUG: Starting server listening...');
            await this.listen();
            console.log('✅ DEBUG: Server listening started');

            // Setup admin-specific handlers
            console.log('🔄 DEBUG: Setting up handlers...');
            this.setupAdminHandlers();
            this.setupGracefulShutdown();
            this.setupErrorHandlers();
            this.setupSecurityMonitoring();
            this.setupModelRecoveryMonitoring();
            console.log('✅ DEBUG: All handlers setup completed');

            // Log server startup success with detailed multi-database information
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
                modelsHealthy: await this.getModelsHealthStatus(),
                multiDatabaseArchitecture: {
                    enabled: true,
                    totalDatabases: this.databaseConnections.size,
                    databases: Array.from(this.databaseConnections.keys()),
                    collectionsPerDatabase: Object.fromEntries(
                        Array.from(this.databaseCollectionMapping.entries()).map(([db, collections]) => 
                            [db, collections.length]
                        )
                    ),
                    healthyDatabases: Array.from(this.databaseHealthStatus.entries())
                        .filter(([db, status]) => status.healthy)
                        .map(([db]) => db).length
                }
            });

            console.log('🎉 DEBUG: Admin server startup completed successfully!');
            return this.server;
        } catch (error) {
            console.error('❌ DEBUG: Admin server startup failed:', error.message);
            console.error('❌ DEBUG: Startup error stack:', error.stack);
            
            logger.error('Failed to start admin server', {
                error: error.message,
                stack: error.stack,
                config: {
                    port: this.adminConfig?.port || 'undefined',
                    ssl: this.shouldUseSSL() ? 'enabled' : 'disabled',
                    redis: process.env.REDIS_ENABLED,
                    environment: process.env.NODE_ENV
                },
                databases: {
                    configured: this.databaseConnections.size,
                    healthy: Array.from(this.databaseHealthStatus.values()).filter(s => s.healthy).length
                }
            });

            throw error;
        }
    }

    /**
     * ENHANCED: Initialize multi-database architecture for admin operations - FIXED VERSION
     */
    async initializeMultiDatabaseArchitecture() {
        try {
            console.log('🔄 DEBUG: Starting multi-database architecture initialization...');
            logger.info('Initializing multi-database architecture for admin server');

            // FIXED: Use ConnectionManager directly instead of Database.getAllConnections()
            console.log('🔍 DEBUG: Getting all available connections...');
            let availableConnections, databaseRouting;
            
            try {
                // Check if ConnectionManager has the getAllConnections method
                if (typeof ConnectionManager.getAllConnections === 'function') {
                    availableConnections = ConnectionManager.getAllConnections();
                    console.log('✅ DEBUG: Got connections from ConnectionManager.getAllConnections()');
                } else {
                    console.log('⚠️  DEBUG: ConnectionManager.getAllConnections() not available, using fallback');
                    availableConnections = new Map();
                    
                    // Try alternative methods
                    if (typeof ConnectionManager.getStats === 'function') {
                        const stats = ConnectionManager.getStats();
                        console.log('🔍 DEBUG: ConnectionManager stats:', stats);
                    }
                }

                if (typeof ConnectionManager.getConnectionRouting === 'function') {
                    databaseRouting = ConnectionManager.getConnectionRouting();
                    console.log('✅ DEBUG: Got database routing from ConnectionManager');
                } else {
                    console.log('⚠️  DEBUG: ConnectionManager.getConnectionRouting() not available, using fallback');
                    databaseRouting = { 
                        databaseConnections: new Map(),
                        tenantConnections: new Map()
                    };
                }
            } catch (connectionError) {
                console.error('❌ DEBUG: Error getting connections:', connectionError.message);
                console.error('❌ DEBUG: Available ConnectionManager methods:', Object.getOwnPropertyNames(ConnectionManager));
                
                // Create fallback routing
                availableConnections = new Map();
                databaseRouting = { 
                    databaseConnections: new Map(),
                    tenantConnections: new Map()
                };
            }

            logger.info('Available database connections', {
                totalConnections: availableConnections.size,
                databaseConnections: databaseRouting.databaseConnections ? databaseRouting.databaseConnections.size || 0 : 0,
                tenantConnections: databaseRouting.tenantConnections ? databaseRouting.tenantConnections.size || 0 : 0
            });

            // Map database types to their specific purposes and collections
            const databasePurposes = {
                admin: {
                    purpose: 'Administrative operations, user management, system configuration',
                    collections: [
                        'users', 'user_profiles', 'user_activities', 'login_history',
                        'roles', 'permissions', 'organizations', 'organization_members',
                        'organization_invitations', 'tenants', 'system_configurations',
                        'security_incidents', 'sessions'
                    ]
                },
                shared: {
                    purpose: 'Shared resources, common data, cross-tenant information',
                    collections: [
                        'subscription_plans', 'features', 'system_settings',
                        'webhooks', 'api_integrations', 'notifications',
                        'oauth_providers', 'passkeys'
                    ]
                },
                audit: {
                    purpose: 'Audit trails, compliance logging, security monitoring',
                    collections: [
                        'audit_logs', 'audit_alerts', 'audit_exports',
                        'audit_retention_policies', 'compliance_mappings',
                        'data_breaches', 'erasure_logs', 'processing_activities'
                    ]
                },
                analytics: {
                    purpose: 'Analytics data, usage metrics, performance tracking',
                    collections: [
                        'api_usage', 'usage_records', 'performance_metrics',
                        'user_analytics', 'system_metrics'
                    ]
                }
            };

            console.log('🔍 DEBUG: Database purposes configured:', Object.keys(databasePurposes));

            // Initialize each database connection and verify collections
            for (const [dbType, config] of Object.entries(databasePurposes)) {
                console.log(`🔄 DEBUG: Processing database type: ${dbType}`);
                
                try {
                    // FIXED: Get database connection using the correct method
                    let connection = null;
                    
                    // Try multiple methods to get the connection
                    if (typeof ConnectionManager.getDatabaseConnection === 'function') {
                        connection = ConnectionManager.getDatabaseConnection(dbType);
                        console.log(`🔍 DEBUG: ConnectionManager.getDatabaseConnection(${dbType}):`, connection ? 'Found' : 'Not found');
                    }
                    
                    if (!connection && typeof ConnectionManager.getConnection === 'function') {
                        connection = ConnectionManager.getConnection(dbType);
                        console.log(`🔍 DEBUG: ConnectionManager.getConnection(${dbType}):`, connection ? 'Found' : 'Not found');
                        
                        if (!connection) {
                            connection = ConnectionManager.getConnection(`${dbType}_connection`);
                            console.log(`🔍 DEBUG: ConnectionManager.getConnection(${dbType}_connection):`, connection ? 'Found' : 'Not found');
                        }
                    }
                    
                    if (!connection && typeof Database.getConnection === 'function') {
                        connection = Database.getConnection(dbType);
                        console.log(`🔍 DEBUG: Database.getConnection(${dbType}):`, connection ? 'Found' : 'Not found');
                    }
                    
                    if (!connection && typeof Database.getPrimaryConnection === 'function') {
                        connection = Database.getPrimaryConnection();
                        console.log(`🔍 DEBUG: Using Database.getPrimaryConnection() as fallback:`, connection ? 'Found' : 'Not found');
                    }
                    
                    if (connection) {
                        console.log(`✅ DEBUG: Found connection for ${dbType}`);
                        
                        // Store connection reference
                        this.databaseConnections.set(dbType, connection);
                        
                        // Map collections to this database
                        this.databaseCollectionMapping.set(dbType, config.collections);
                        
                        // Verify database health
                        console.log(`🔄 DEBUG: Verifying health for ${dbType}...`);
                        const healthStatus = await this.verifyDatabaseHealth(dbType, connection, config);
                        this.databaseHealthStatus.set(dbType, healthStatus);
                        console.log(`✅ DEBUG: Health verification completed for ${dbType}:`, healthStatus.healthy ? 'Healthy' : 'Unhealthy');
                        
                        logger.info(`Database ${dbType} initialized successfully`, {
                            purpose: config.purpose,
                            collections: config.collections.length,
                            healthy: healthStatus.healthy,
                            connectionName: connection.name,
                            databaseName: connection.db?.databaseName
                        });
                    } else {
                        console.log(`⚠️  DEBUG: No connection available for database type: ${dbType}`);
                        logger.warn(`Database connection for ${dbType} not available`, {
                            expectedPurpose: config.purpose,
                            expectedCollections: config.collections.length
                        });
                        
                        this.databaseHealthStatus.set(dbType, {
                            healthy: false,
                            error: 'Connection not available',
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    console.error(`❌ DEBUG: Error initializing database ${dbType}:`, error.message);
                    logger.error(`Failed to initialize database ${dbType}`, {
                        error: error.message,
                        purpose: config.purpose
                    });
                    
                    this.databaseHealthStatus.set(dbType, {
                        healthy: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Verify minimum database requirements
            const healthyDatabases = Array.from(this.databaseHealthStatus.entries())
                .filter(([db, status]) => status.healthy);
            
            console.log(`🔍 DEBUG: Healthy databases found: ${healthyDatabases.length}`);
            console.log(`🔍 DEBUG: Healthy database list:`, healthyDatabases.map(([db]) => db));
            
            if (healthyDatabases.length === 0) {
                console.error('❌ DEBUG: No healthy database connections available');
                
                // In development, create a basic fallback
                if (process.env.NODE_ENV === 'development') {
                    console.log('⚠️  DEBUG: Creating development fallback for admin operations');
                    
                    // Try to get any available connection
                    let fallbackConnection = null;
                    if (typeof Database.getPrimaryConnection === 'function') {
                        fallbackConnection = Database.getPrimaryConnection();
                    }
                    
                    if (fallbackConnection) {
                        console.log('✅ DEBUG: Using primary connection as fallback for all database operations');
                        this.databaseConnections.set('admin', fallbackConnection);
                        this.databaseCollectionMapping.set('admin', databasePurposes.admin.collections);
                        this.databaseHealthStatus.set('admin', {
                            healthy: true,
                            fallback: true,
                            timestamp: new Date().toISOString()
                        });
                    } else {
                        logger.warn('No database connections available for admin operations, some features will be limited');
                    }
                } else {
                    throw new Error('No healthy database connections available for admin operations');
                }
            }

            // Ensure admin database is available for core operations
            if (!this.databaseHealthStatus.get('admin')?.healthy) {
                console.log('⚠️  DEBUG: Admin database not healthy, operations may be limited');
                logger.warn('Admin database not healthy, operations may be limited');
            }

            const finalHealthyCount = Array.from(this.databaseHealthStatus.entries())
                .filter(([db, status]) => status.healthy).length;

            console.log(`✅ DEBUG: Multi-database architecture initialization completed with ${finalHealthyCount} healthy databases`);

            logger.info('Multi-database architecture initialized successfully', {
                totalDatabases: this.databaseConnections.size,
                healthyDatabases: finalHealthyCount,
                databaseStatus: Object.fromEntries(
                    Array.from(this.databaseHealthStatus.entries()).map(([db, status]) => 
                        [db, { healthy: status.healthy, error: status.error }]
                    )
                ),
                collectionsMapping: Object.fromEntries(this.databaseCollectionMapping)
            });

        } catch (error) {
            console.error('❌ DEBUG: Multi-database architecture initialization failed:', error.message);
            console.error('❌ DEBUG: Error stack:', error.stack);
            
            logger.error('Failed to initialize multi-database architecture', {
                error: error.message,
                stack: error.stack
            });
            
            throw new AppError('Multi-database initialization failed', 500, 'MULTI_DATABASE_INIT_ERROR', {
                originalError: error.message
            });
        }
    }

    /**
     * Verify database health and collection availability
     */
    async verifyDatabaseHealth(dbType, connection, config) {
        console.log(`🔄 DEBUG: Starting health verification for ${dbType}...`);
        
        try {
            const healthStatus = {
                healthy: false,
                collections: {},
                totalCollections: 0,
                availableCollections: 0,
                errors: [],
                timestamp: new Date().toISOString()
            };

            console.log(`🔍 DEBUG: Testing basic connectivity for ${dbType}...`);

            // Test basic database connectivity with timeout
            let collections;
            try {
                const listCollectionsPromise = connection.db.listCollections().toArray();
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('List collections timeout')), 10000)
                );
                
                collections = await Promise.race([listCollectionsPromise, timeoutPromise]);
                console.log(`✅ DEBUG: Listed ${collections.length} collections for ${dbType}`);
            } catch (listError) {
                console.error(`❌ DEBUG: Failed to list collections for ${dbType}:`, listError.message);
                healthStatus.errors.push(`List collections failed: ${listError.message}`);
                collections = [];
            }

            const availableCollectionNames = collections.map(c => c.name);
            healthStatus.totalCollections = collections.length;

            console.log(`🔍 DEBUG: Available collections in ${dbType}:`, availableCollectionNames.slice(0, 10)); // Limit log output

            // Check each expected collection
            for (const expectedCollection of config.collections) {
                try {
                    const exists = availableCollectionNames.includes(expectedCollection);
                    
                    if (exists) {
                        console.log(`✅ DEBUG: Collection ${expectedCollection} exists in ${dbType}`);
                        
                        // Test collection access with timeout
                        try {
                            const countPromise = connection.db.collection(expectedCollection).countDocuments({}, { limit: 1 });
                            const countTimeoutPromise = new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Count timeout')), 5000)
                            );
                            
                            const count = await Promise.race([countPromise, countTimeoutPromise]);
                            
                            healthStatus.collections[expectedCollection] = {
                                exists: true,
                                accessible: true,
                                hasDocuments: count > 0
                            };
                            healthStatus.availableCollections++;
                            console.log(`✅ DEBUG: Collection ${expectedCollection} is accessible (${count} docs)`);
                        } catch (accessError) {
                            console.log(`⚠️  DEBUG: Collection ${expectedCollection} exists but access test failed:`, accessError.message);
                            healthStatus.collections[expectedCollection] = {
                                exists: true,
                                accessible: false,
                                hasDocuments: false,
                                accessError: accessError.message
                            };
                        }
                    } else {
                        console.log(`⚠️  DEBUG: Collection ${expectedCollection} does not exist in ${dbType}`);
                        healthStatus.collections[expectedCollection] = {
                            exists: false,
                            accessible: false,
                            hasDocuments: false
                        };
                    }
                } catch (collectionError) {
                    console.error(`❌ DEBUG: Error checking collection ${expectedCollection}:`, collectionError.message);
                    healthStatus.collections[expectedCollection] = {
                        exists: availableCollectionNames.includes(expectedCollection),
                        accessible: false,
                        error: collectionError.message
                    };
                    healthStatus.errors.push(`${expectedCollection}: ${collectionError.message}`);
                }
            }

            // Consider database healthy if basic connectivity works
            healthStatus.healthy = true;

            // Test write operations
            console.log(`🔄 DEBUG: Testing write operations for ${dbType}...`);
            try {
                const testCollection = connection.db.collection('_admin_health_test');
                const testDoc = {
                    test: true,
                    timestamp: new Date(),
                    dbType: dbType,
                    serverInstance: process.pid
                };
                
                const writeTimeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Write test timeout')), 10000)
                );
                
                const insertPromise = testCollection.insertOne(testDoc);
                await Promise.race([insertPromise, writeTimeoutPromise]);
                
                const deletePromise = testCollection.deleteOne({ test: true });
                await Promise.race([deletePromise, writeTimeoutPromise]);
                
                healthStatus.writeOperations = true;
                console.log(`✅ DEBUG: Write operations successful for ${dbType}`);
            } catch (writeError) {
                console.error(`❌ DEBUG: Write operations failed for ${dbType}:`, writeError.message);
                healthStatus.writeOperations = false;
                healthStatus.errors.push(`Write test failed: ${writeError.message}`);
            }

            console.log(`✅ DEBUG: Health verification completed for ${dbType}. Healthy: ${healthStatus.healthy}`);
            return healthStatus;

        } catch (error) {
            console.error(`❌ DEBUG: Database health verification failed for ${dbType}:`, error.message);
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get database connection for specific operations
     */
    getDatabaseForOperation(operationType) {
        const operationMapping = {
            // User and organization management
            'user': 'admin',
            'organization': 'admin',
            'role': 'admin',
            'permission': 'admin',
            'session': 'admin',
            'authentication': 'admin',
            
            // Shared resources
            'subscription': 'shared',
            'plan': 'shared',
            'feature': 'shared',
            'webhook': 'shared',
            'integration': 'shared',
            'notification': 'shared',
            
            // Audit and compliance
            'audit': 'audit',
            'compliance': 'audit',
            'security': 'audit',
            'breach': 'audit',
            'erasure': 'audit',
            
            // Analytics and metrics
            'analytics': 'analytics',
            'usage': 'analytics',
            'metrics': 'analytics',
            'performance': 'analytics'
        };

        const dbType = operationMapping[operationType] || 'admin';
        return this.databaseConnections.get(dbType);
    }

    /**
     * ENHANCED: Validate and recover models with multi-database support - FIXED VERSION
     */
    async validateAndRecoverModels() {
        try {
            console.log('🔄 DEBUG: Starting model validation and recovery...');
            logger.info('Starting enhanced model validation and recovery with multi-database support', {
                attempt: this.modelRecoveryAttempts + 1,
                maxAttempts: this.maxModelRecoveryAttempts,
                availableDatabases: Array.from(this.databaseConnections.keys())
            });

            // Get current model status
            let modelSummary = { total: 0, successful: 0, failed: 0 };
            let modelErrors = [];
            
            try {
                if (typeof Database.getRegistrationSummary === 'function') {
                    modelSummary = Database.getRegistrationSummary();
                    console.log('✅ DEBUG: Got model summary from Database.getRegistrationSummary()');
                } else {
                    console.log('⚠️  DEBUG: Database.getRegistrationSummary() not available');
                }

                if (typeof Database.getRegistrationErrors === 'function') {
                    modelErrors = Database.getRegistrationErrors();
                    console.log('✅ DEBUG: Got model errors from Database.getRegistrationErrors()');
                } else {
                    console.log('⚠️  DEBUG: Database.getRegistrationErrors() not available');
                }
            } catch (summaryError) {
                console.error('❌ DEBUG: Error getting model summary:', summaryError.message);
            }

            logger.info('Current model registration status', {
                total: modelSummary.total,
                successful: modelSummary.successful,
                failed: modelSummary.failed,
                errors: modelErrors.length
            });

            // If models failed to register and we haven't exceeded retry attempts
            if (modelSummary.failed > 0 && this.modelRecoveryAttempts < this.maxModelRecoveryAttempts) {
                console.log(`🔄 DEBUG: Attempting model recovery (attempt ${this.modelRecoveryAttempts + 1})...`);
                
                logger.warn('Some models failed to register, attempting recovery', {
                    failed: modelSummary.failed,
                    successful: modelSummary.successful,
                    attempt: this.modelRecoveryAttempts + 1
                });

                this.modelRecoveryAttempts++;

                // Force model registration
                try {
                    if (typeof Database.forceModelRegistration === 'function') {
                        const forceResult = Database.forceModelRegistration();
                        logger.info('Force model registration result', forceResult);
                        console.log('✅ DEBUG: Force model registration completed');
                    } else {
                        console.log('⚠️  DEBUG: Database.forceModelRegistration() not available');
                    }
                } catch (forceError) {
                    console.error('❌ DEBUG: Force model registration failed:', forceError.message);
                }

                // Attempt to reload models
                try {
                    if (typeof Database.reloadModels === 'function') {
                        const reloadResult = await Database.reloadModels();
                        logger.info('Model reload completed', reloadResult);
                        console.log('✅ DEBUG: Model reload completed');
                    } else {
                        console.log('⚠️  DEBUG: Database.reloadModels() not available');
                    }
                } catch (reloadError) {
                    console.error('❌ DEBUG: Model reload failed:', reloadError.message);
                }

                // Re-check status after recovery attempt
                try {
                    const updatedSummary = typeof Database.getRegistrationSummary === 'function' ? 
                        Database.getRegistrationSummary() : modelSummary;
                    logger.info('Model status after recovery attempt', {
                        previousFailed: modelSummary.failed,
                        currentFailed: updatedSummary.failed,
                        improvement: modelSummary.failed - updatedSummary.failed
                    });
                    console.log(`🔍 DEBUG: Model recovery improvement: ${modelSummary.failed - updatedSummary.failed} models recovered`);
                } catch (updateError) {
                    console.error('❌ DEBUG: Error getting updated model summary:', updateError.message);
                }
            }

            // Validate essential models are available across databases
            const essentialModels = ['User', 'Organization', 'AuditLog'];
            const missingEssential = [];

            console.log('🔄 DEBUG: Checking essential models...');
            for (const modelName of essentialModels) {
                try {
                    let model = null;
                    
                    if (typeof Database.getModel === 'function') {
                        model = await Database.getModel(modelName);
                        console.log(`🔍 DEBUG: Database.getModel(${modelName}):`, model ? 'Found' : 'Not found');
                    } else {
                        console.log(`⚠️  DEBUG: Database.getModel() not available for ${modelName}`);
                    }
                    
                    if (!model) {
                        missingEssential.push(modelName);
                        console.log(`⚠️  DEBUG: Essential model missing: ${modelName}`);
                    } else {
                        console.log(`✅ DEBUG: Essential model verified: ${modelName}`);
                        logger.debug(`Essential model verified: ${modelName}`);
                    }
                } catch (error) {
                    console.error(`❌ DEBUG: Failed to verify essential model ${modelName}:`, error.message);
                    logger.warn(`Failed to verify essential model: ${modelName}`, { error: error.message });
                    missingEssential.push(modelName);
                }
            }

            if (missingEssential.length > 0) {
                console.log(`⚠️  DEBUG: Missing essential models: ${missingEssential.join(', ')}`);
                logger.error('Essential models missing', { missing: missingEssential });
                
                // Create fallback models if needed
                try {
                    await this.createFallbackModels(missingEssential);
                    console.log('✅ DEBUG: Fallback models creation completed');
                } catch (fallbackError) {
                    console.error('❌ DEBUG: Fallback model creation failed:', fallbackError.message);
                }
            }

            // Test database operations across all available databases
            console.log('🔄 DEBUG: Testing multi-database operations...');
            try {
                await this.testMultiDatabaseOperations();
                console.log('✅ DEBUG: Multi-database operations test completed');
            } catch (testError) {
                console.error('❌ DEBUG: Multi-database operations test failed:', testError.message);
            }

            // Create test collections to ensure databases are properly set up
            console.log('🔄 DEBUG: Creating test collections...');
            try {
                if (typeof Database.createTestCollections === 'function') {
                    const testResult = await Database.createTestCollections();
                    logger.info('Database test collections created successfully', testResult);
                    console.log('✅ DEBUG: Test collections created successfully');
                } else {
                    console.log('⚠️  DEBUG: Database.createTestCollections() not available');
                }
            } catch (testError) {
                console.error('❌ DEBUG: Failed to create test collections:', testError.message);
                logger.warn('Failed to create test collections', { error: testError.message });
            }

            const finalEssentialCount = essentialModels.length - missingEssential.length;
            console.log(`✅ DEBUG: Model validation completed. Essential models available: ${finalEssentialCount}/${essentialModels.length}`);

            logger.info('Model validation and recovery completed successfully', {
                recoveryAttempts: this.modelRecoveryAttempts,
                essentialModelsAvailable: finalEssentialCount,
                totalEssentialModels: essentialModels.length,
                databasesAvailable: this.databaseConnections.size,
                healthyDatabases: Array.from(this.databaseHealthStatus.values()).filter(s => s.healthy).length
            });

        } catch (error) {
            console.error('❌ DEBUG: Model validation and recovery failed:', error.message);
            console.error('❌ DEBUG: Model validation error stack:', error.stack);
            
            logger.error('Model validation and recovery failed', { 
                error: error.message,
                stack: error.stack,
                attempt: this.modelRecoveryAttempts
            });

            // Don't fail startup for model issues in development
            if (process.env.NODE_ENV === 'development') {
                console.log('⚠️  DEBUG: Continuing startup despite model validation failure in development mode');
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
     * Test database operations across all available databases
     */
    async testMultiDatabaseOperations() {
        try {
            console.log('🔄 DEBUG: Starting multi-database operations test...');
            const testResults = new Map();

            for (const [dbType, connection] of this.databaseConnections) {
                console.log(`🔄 DEBUG: Testing operations for database: ${dbType}`);
                
                try {
                    // Test basic read operation with timeout
                    console.log(`🔍 DEBUG: Testing read operations for ${dbType}...`);
                    const listPromise = connection.db.listCollections().toArray();
                    const readTimeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Read test timeout')), 10000)
                    );
                    
                    const collections = await Promise.race([listPromise, readTimeoutPromise]);
                    console.log(`✅ DEBUG: Read test passed for ${dbType} (${collections.length} collections)`);

                    // Test basic write operation (safe test) with timeout
                    console.log(`🔍 DEBUG: Testing write operations for ${dbType}...`);
                    const testCollection = connection.db.collection('_admin_multi_db_test');
                    const testDoc = {
                        test: true,
                        timestamp: new Date(),
                        dbType: dbType,
                        serverInstance: process.pid
                    };
                    
                    const writeTimeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Write test timeout')), 10000)
                    );
                    
                    const insertPromise = testCollection.insertOne(testDoc);
                    await Promise.race([insertPromise, writeTimeoutPromise]);
                    
                    const deletePromise = testCollection.deleteOne({ test: true });
                    await Promise.race([deletePromise, writeTimeoutPromise]);
                    
                    console.log(`✅ DEBUG: Write test passed for ${dbType}`);
                    
                    testResults.set(dbType, {
                        success: true,
                        collections: collections.length,
                        readOperations: true,
                        writeOperations: true
                    });
                    
                    logger.debug(`Database operations test passed for ${dbType}`, {
                        collections: collections.length,
                        connectionStatus: 'healthy'
                    });
                    
                } catch (dbError) {
                    console.error(`❌ DEBUG: Database operations test failed for ${dbType}:`, dbError.message);
                    
                    testResults.set(dbType, {
                        success: false,
                        error: dbError.message
                    });
                    
                    logger.warn(`Database operations test failed for ${dbType}`, {
                        error: dbError.message
                    });
                }
            }

            const successfulTests = Array.from(testResults.values()).filter(r => r.success).length;
            const totalTests = testResults.size;

            console.log(`✅ DEBUG: Multi-database operations test completed. Success rate: ${successfulTests}/${totalTests}`);

            logger.info('Multi-database operations test completed', {
                totalDatabases: totalTests,
                successfulTests: successfulTests,
                failedTests: totalTests - successfulTests,
                results: Object.fromEntries(testResults)
            });

            if (successfulTests === 0) {
                throw new Error('All database operation tests failed');
            }

        } catch (error) {
            console.error('❌ DEBUG: Multi-database operations test failed:', error.message);
            logger.error('Multi-database operations test failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Create fallback models for missing essential models
     */
    async createFallbackModels(missingModels) {
        console.log('🔄 DEBUG: Creating fallback models for:', missingModels);
        
        for (const modelName of missingModels) {
            try {
                console.log(`🔄 DEBUG: Creating fallback model: ${modelName}`);
                logger.info(`Creating fallback model: ${modelName}`);
                
                // Try to use Database.createTestCollections to ensure basic functionality
                if (typeof Database.createTestCollections === 'function') {
                    await Database.createTestCollections();
                    console.log(`✅ DEBUG: Test collections created for ${modelName}`);
                }

                // Try to register essential models if BaseModel is available
                try {
                    const BaseModel = require('../../shared/lib/database/models/base-model');
                    console.log(`✅ DEBUG: BaseModel loaded for ${modelName}`);
                    
                    if (BaseModel && BaseModel.createModel) {
                        const mongoose = require('mongoose');
                        
                        if (modelName === 'User' && !(await Database.getModel('User'))) {
                            console.log('🔄 DEBUG: Creating fallback User model...');
                            
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

                            if (typeof Database.registerModel === 'function') {
                                Database.registerModel('User', userSchema);
                                console.log('✅ DEBUG: Fallback User model created and registered');
                                logger.info('Fallback User model created');
                            } else {
                                console.log('⚠️  DEBUG: Database.registerModel() not available for User');
                            }
                        }

                        if (modelName === 'Organization' && !(await Database.getModel('Organization'))) {
                            console.log('🔄 DEBUG: Creating fallback Organization model...');
                            
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

                            if (typeof Database.registerModel === 'function') {
                                Database.registerModel('Organization', organizationSchema);
                                console.log('✅ DEBUG: Fallback Organization model created and registered');
                                logger.info('Fallback Organization model created');
                            } else {
                                console.log('⚠️  DEBUG: Database.registerModel() not available for Organization');
                            }
                        }
                        
                        if (modelName === 'AuditLog' && !(await Database.getModel('AuditLog'))) {
                            console.log('🔄 DEBUG: Creating fallback AuditLog model...');
                            
                            const auditLogSchema = new mongoose.Schema({
                                eventType: { type: String, required: true },
                                userId: { type: String },
                                tenantId: { type: String },
                                resource: { type: String, required: true },
                                action: { type: String, required: true },
                                result: { type: String, required: true },
                                metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
                                context: { type: mongoose.Schema.Types.Mixed, default: {} },
                                timestamp: { type: Date, default: Date.now }
                            });

                            if (typeof Database.registerModel === 'function') {
                                Database.registerModel('AuditLog', auditLogSchema);
                                console.log('✅ DEBUG: Fallback AuditLog model created and registered');
                                logger.info('Fallback AuditLog model created');
                            } else {
                                console.log('⚠️  DEBUG: Database.registerModel() not available for AuditLog');
                            }
                        }
                    }
                } catch (baseModelError) {
                    console.error(`❌ DEBUG: BaseModel operations failed for ${modelName}:`, baseModelError.message);
                }

            } catch (error) {
                console.error(`❌ DEBUG: Failed to create fallback for ${modelName}:`, error.message);
                logger.error(`Failed to create fallback for ${modelName}`, { 
                    error: error.message,
                    stack: error.stack
                });
            }
        }
        
        console.log('✅ DEBUG: Fallback models creation process completed');
    }

    /**
     * Check multi-database health status
     */
    async checkMultiDatabaseHealth() {
        try {
            const healthStatus = {
                healthy: true,
                totalDatabases: this.databaseConnections.size,
                healthyDatabases: 0,
                unhealthyDatabases: 0,
                databases: {},
                lastCheck: new Date().toISOString()
            };

            for (const [dbType, status] of this.databaseHealthStatus) {
                healthStatus.databases[dbType] = {
                    healthy: status.healthy,
                    collections: status.collections ? Object.keys(status.collections).length : 0,
                    writeOperations: status.writeOperations,
                    error: status.error,
                    lastCheck: status.timestamp
                };

                if (status.healthy) {
                    healthStatus.healthyDatabases++;
                } else {
                    healthStatus.unhealthyDatabases++;
                    healthStatus.healthy = false;
                }
            }

            return healthStatus;
        } catch (error) {
            logger.error('Multi-database health check failed', { error: error.message });
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Check database collection mapping status
     */
    async checkDatabaseCollectionMapping() {
        try {
            const mappingStatus = {
                healthy: true,
                totalMappings: this.databaseCollectionMapping.size,
                mappings: {},
                coverage: {},
                lastCheck: new Date().toISOString()
            };

            for (const [dbType, collections] of this.databaseCollectionMapping) {
                const connection = this.databaseConnections.get(dbType);
                if (connection) {
                    try {
                        const actualCollections = await connection.db.listCollections().toArray();
                        const actualNames = actualCollections.map(c => c.name);
                        
                        const expectedCollections = collections;
                        const existingCollections = expectedCollections.filter(name => actualNames.includes(name));
                        const missingCollections = expectedCollections.filter(name => !actualNames.includes(name));
                        
                        mappingStatus.mappings[dbType] = {
                            expected: expectedCollections.length,
                            existing: existingCollections.length,
                            missing: missingCollections.length,
                            missingList: missingCollections,
                            coverage: expectedCollections.length > 0 ? 
                                (existingCollections.length / expectedCollections.length) * 100 : 100
                        };
                        
                        mappingStatus.coverage[dbType] = mappingStatus.mappings[dbType].coverage;
                    } catch (error) {
                        mappingStatus.mappings[dbType] = {
                            error: error.message,
                            coverage: 0
                        };
                        mappingStatus.coverage[dbType] = 0;
                        mappingStatus.healthy = false;
                    }
                } else {
                    mappingStatus.mappings[dbType] = {
                        error: 'Connection not available',
                        coverage: 0
                    };
                    mappingStatus.coverage[dbType] = 0;
                    mappingStatus.healthy = false;
                }
            }

            return mappingStatus;
        } catch (error) {
            logger.error('Database collection mapping check failed', { error: error.message });
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * ENHANCED: Verify security prerequisites for admin server with multi-database support
     */
    async verifySecurityPrerequisites() {
        console.log('🔄 DEBUG: Starting security prerequisites verification...');
        const checks = [];

        // Check SSL certificates only if SSL is required
        if (this.shouldUseSSL()) {
            console.log('🔍 DEBUG: Adding SSL certificate verification...');
            checks.push(this.verifySslCertificates());
        }

        // Check IP whitelist configuration
        if (this.adminConfig.security.ipWhitelist?.enabled) {
            console.log('🔍 DEBUG: Adding IP whitelist verification...');
            checks.push(this.verifyIpWhitelist());
        }

        // Check audit log availability
        console.log('🔍 DEBUG: Adding audit log system verification...');
        checks.push(this.verifyAuditLogSystem());

        // ENHANCED: Check multi-database permissions
        console.log('🔍 DEBUG: Adding multi-database permissions verification...');
        checks.push(this.verifyMultiDatabasePermissions());

        // Check environment configuration
        console.log('🔍 DEBUG: Adding environment configuration verification...');
        checks.push(this.verifyEnvironmentConfiguration());

        console.log(`🔍 DEBUG: Running ${checks.length} security prerequisite checks...`);
        const results = await Promise.allSettled(checks);
        const failures = results.filter(r => r.status === 'rejected');

        if (failures.length > 0) {
            console.error(`❌ DEBUG: ${failures.length} security prerequisite checks failed:`, failures.map(f => f.reason?.message || f.reason));
            throw new Error(`Security prerequisites failed: ${failures.map(f => f.reason).join(', ')}`);
        }

        console.log('✅ DEBUG: All security prerequisites verified successfully');
        logger.info('All security prerequisites verified successfully with multi-database support');
    }

    /**
     * ENHANCED: Verify database permissions for admin operations across all databases - FIXED VERSION
     */
    async verifyMultiDatabasePermissions() {
        try {
            console.log('🔄 DEBUG: Starting multi-database permissions verification...');
            const permissionResults = new Map();

            // Check permissions for each database
            for (const [dbType, connection] of this.databaseConnections) {
                console.log(`🔍 DEBUG: Checking permissions for database: ${dbType}`);
                
                try {
                    // Test basic read permissions with timeout
                    const readTimeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Read permissions test timeout')), 10000)
                    );
                    
                    const listPromise = connection.db.listCollections().toArray();
                    const collections = await Promise.race([listPromise, readTimeoutPromise]);
                    console.log(`✅ DEBUG: Read permissions OK for ${dbType} (${collections.length} collections)`);
                    
                    // Test write permissions with timeout
                    const writeTimeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Write permissions test timeout')), 10000)
                    );
                    
                    const testCollection = connection.db.collection('_admin_permission_test');
                    const testDoc = {
                        test: true,
                        timestamp: new Date(),
                        dbType: dbType
                    };
                    
                    const insertPromise = testCollection.insertOne(testDoc);
                    await Promise.race([insertPromise, writeTimeoutPromise]);
                    
                    const deletePromise = testCollection.deleteOne({ test: true });
                    await Promise.race([deletePromise, writeTimeoutPromise]);
                    
                    console.log(`✅ DEBUG: Write permissions OK for ${dbType}`);
                    
                    permissionResults.set(dbType, {
                        success: true,
                        readPermissions: true,
                        writePermissions: true,
                        collections: collections.length
                    });
                    
                    logger.info(`Database permissions verified for ${dbType}`, {
                        collections: collections.length,
                        readWrite: 'success'
                    });
                    
                } catch (error) {
                    console.error(`❌ DEBUG: Permission check failed for ${dbType}:`, error.message);
                    
                    permissionResults.set(dbType, {
                        success: false,
                        error: error.message
                    });
                    
                    logger.warn(`Database permission check failed for ${dbType}`, {
                        error: error.message
                    });
                }
            }

            const successfulChecks = Array.from(permissionResults.values()).filter(r => r.success).length;
            const totalChecks = permissionResults.size;

            console.log(`🔍 DEBUG: Permission verification results: ${successfulChecks}/${totalChecks} successful`);

            if (successfulChecks === 0 && totalChecks > 0) {
                throw new AppError('No database permissions available for admin operations', 500, 'NO_DATABASE_PERMISSIONS');
            }

            if (successfulChecks < totalChecks) {
                console.log(`⚠️  DEBUG: Some database permission checks failed (${totalChecks - successfulChecks} failed)`);
                logger.warn('Some database permission checks failed', {
                    successful: successfulChecks,
                    total: totalChecks,
                    results: Object.fromEntries(permissionResults)
                });
            }

            logger.info('Multi-database permissions verified', {
                totalDatabases: totalChecks,
                successfulChecks: successfulChecks,
                coverage: totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100
            });

            console.log('✅ DEBUG: Multi-database permissions verification completed');
            return true;
        } catch (error) {
            console.error('❌ DEBUG: Multi-database permission verification failed:', error.message);
            throw new AppError(`Multi-database permission check failed: ${error.message}`, 500, 'MULTI_DATABASE_PERMISSION_ERROR');
        }
    }

    /**
     * ENHANCED: Determine if SSL should be used
     * @private
     * @returns {boolean} Whether SSL should be used
     */
    shouldUseSSL() {
        console.log('🔍 DEBUG: Checking SSL configuration...');
        
        // Check if SSL is explicitly enabled in admin configuration
        if (this.adminConfig?.security?.ssl?.enabled === true) {
            console.log('✅ DEBUG: SSL enabled via admin config');
            return true;
        }

        // Check admin-specific SSL configuration
        if (this.adminConfig?.security?.forceSSL === true) {
            console.log('✅ DEBUG: SSL forced via admin config');
            return true;
        }

        // Check environment variables
        if (process.env.ADMIN_SSL_ENABLED === 'true' || process.env.ADMIN_FORCE_SSL === 'true') {
            console.log('✅ DEBUG: SSL enabled via environment variables');
            return true;
        }

        // Check for SSL certificates existence
        if (this.adminConfig?.security?.ssl?.keyPath && this.adminConfig?.security?.ssl?.certPath) {
            const keyPath = path.resolve(process.cwd(), this.adminConfig.security.ssl.keyPath);
            const certPath = path.resolve(process.cwd(), this.adminConfig.security.ssl.certPath);
            
            if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
                console.log('✅ DEBUG: SSL certificates found, enabling SSL');
                return true;
            }
        }

        console.log('🔓 DEBUG: SSL not required/configured, using HTTP');
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
            console.log('🔄 DEBUG: Creating admin configuration structure...');
            
            // Create a local admin configuration object instead of modifying the frozen config
            this.adminConfig = {
                port: parseInt(process.env.ADMIN_PORT, 10) || 4001,
                host: process.env.ADMIN_HOST || 'localhost',
                security: {
                    forceSSL: process.env.ADMIN_FORCE_SSL === 'true' || false,
                    ipWhitelist: {
                        enabled: process.env.ADMIN_IP_WHITELIST_ENABLED === 'true' || false,
                        addresses: process.env.ADMIN_IP_WHITELIST ? process.env.ADMIN_IP_WHITELIST.split(',') : []
                    },
                    requireMFA: process.env.ADMIN_REQUIRE_MFA === 'true' || false,
                    sessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT, 10) || 3600000,
                    ssl: {
                        enabled: process.env.ADMIN_SSL_ENABLED === 'true' || false,
                        keyPath: process.env.ADMIN_SSL_KEY_PATH || process.env.SSL_KEY_PATH || '/insightserenity-platform/servers/admin-server/key.pem',
                        certPath: process.env.ADMIN_SSL_CERT_PATH || process.env.SSL_CERT_PATH || '/insightserenity-platform/servers/admin-server/cert.pem',
                        ca: process.env.ADMIN_SSL_CA_PATH || process.env.SSL_CA_PATH
                    },
                    level: process.env.ADMIN_SECURITY_LEVEL || 'maximum',
                    advanced: process.env.ADMIN_ADVANCED_SECURITY === 'true' || false
                },
                features: {
                    realTimeMonitoring: process.env.ADMIN_REAL_TIME_MONITORING !== 'false',
                    advancedAnalytics: process.env.ADMIN_ADVANCED_ANALYTICS !== 'false',
                    bulkOperations: process.env.ADMIN_BULK_OPERATIONS !== 'false',
                    modelRecovery: true,
                    multiDatabase: true
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

            console.log('✅ DEBUG: Admin configuration structure created successfully');
            console.log('🔍 DEBUG: Admin config port:', this.adminConfig.port);
            console.log('🔍 DEBUG: Admin config host:', this.adminConfig.host);
            console.log('🔍 DEBUG: SSL enabled:', this.shouldUseSSL());

            logger.info('Admin configuration structure validated and initialized', {
                port: this.adminConfig.port,
                host: this.adminConfig.host,
                sslEnabled: this.shouldUseSSL(),
                ipWhitelistEnabled: this.adminConfig.security.ipWhitelist.enabled,
                mfaRequired: this.adminConfig.security.requireMFA,
                featuresEnabled: Object.keys(this.adminConfig.features).length,
                monitoringEnabled: this.adminConfig.monitoring.metricsEnabled,
                modelRecoveryEnabled: this.adminConfig.features.modelRecovery,
                multiDatabaseEnabled: this.adminConfig.features.multiDatabase
            });

        } catch (error) {
            console.error('❌ DEBUG: Admin configuration validation failed:', error.message);
            logger.error('Failed to validate admin configuration structure', {
                error: error.message,
                stack: error.stack
            });

            // Set minimal working configuration as fallback
            console.log('⚠️  DEBUG: Using fallback admin configuration');
            this.adminConfig = {
                port: parseInt(process.env.ADMIN_PORT, 10) || 4001,
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
                    modelRecovery: true,
                    multiDatabase: true
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
            console.log('🔄 DEBUG: Checking audit configuration...');
            
            // Check if audit config exists and is valid
            if (!auditConfig || typeof auditConfig !== 'object') {
                console.log('⚠️  DEBUG: Audit config not found or invalid, creating minimal config');
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

            console.log('✅ DEBUG: Audit config is valid, proceeding with initialization');

            // Validate enterprise audit configuration
            if (AuditServiceFactory && typeof AuditServiceFactory.validateConfig === 'function') {
                AuditServiceFactory.validateConfig(auditConfig);
                console.log('✅ DEBUG: Audit configuration validated');

                // Initialize audit service factory with enterprise configuration
                AuditServiceFactory.initialize(auditConfig);
                console.log('✅ DEBUG: AuditServiceFactory initialized');

                // Get configured audit service instance
                this.auditService = AuditServiceFactory.getInstance();
                console.log('✅ DEBUG: Audit service instance obtained');
            } else {
                console.log('⚠️  DEBUG: AuditServiceFactory not available');
            }

            logger.info('Enterprise audit system initialized', {
                enabled: auditConfig.enabled,
                environment: auditConfig.environment,
                storageType: auditConfig.storage?.type,
                batchSize: auditConfig.processing?.batchSize,
                flushInterval: auditConfig.processing?.flushInterval
            });

        } catch (error) {
            console.error('❌ DEBUG: Audit system initialization failed:', error.message);
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

            const factoryStatus = AuditServiceFactory && typeof AuditServiceFactory.getStatus === 'function' ? 
                AuditServiceFactory.getStatus() : { initialized: false, enabled: false };
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
        console.log('🔄 DEBUG: Verifying environment configuration...');
        
        const requiredConfigs = [
            { key: 'NODE_ENV', value: process.env.NODE_ENV },
            { key: 'ADMIN_PORT', value: process.env.ADMIN_PORT },
            { key: 'DB_URI', value: process.env.DB_URI },
            { key: 'SESSION_SECRET', value: process.env.SESSION_SECRET }
        ];

        console.log('🔍 DEBUG: Checking required configurations...');
        const missing = requiredConfigs.filter(config => {
            const isMissing = !config.value;
            if (isMissing) {
                console.log(`❌ DEBUG: Missing required config: ${config.key}`);
            } else {
                console.log(`✅ DEBUG: Required config present: ${config.key}`);
            }
            return isMissing;
        });

        if (missing.length > 0) {
            throw new Error(`Missing critical environment variables: ${missing.map(c => c.key).join(', ')}`);
        }

        // Validate environment-specific requirements
        if (process.env.NODE_ENV === 'production') {
            console.log('🔍 DEBUG: Checking production-specific requirements...');
            
            const prodRequired = [
                { key: 'JWT_SECRET', value: process.env.JWT_SECRET },
                { key: 'ENCRYPTION_KEY', value: process.env.ENCRYPTION_KEY }
            ];

            const prodMissing = prodRequired.filter(config => {
                const isMissing = !config.value;
                if (isMissing) {
                    console.log(`❌ DEBUG: Missing production config: ${config.key}`);
                } else {
                    console.log(`✅ DEBUG: Production config present: ${config.key}`);
                }
                return isMissing;
            });
            
            if (prodMissing.length > 0) {
                throw new Error(`Missing production environment variables: ${prodMissing.map(c => c.key).join(', ')}`);
            }
        }

        console.log('✅ DEBUG: Environment configuration verification completed');
        logger.info('Environment configuration verified successfully', {
            nodeEnv: process.env.NODE_ENV,
            redisEnabled: process.env.REDIS_ENABLED === 'true',
            sessionStore: process.env.SESSION_STORE,
            cacheFallback: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
            auditEnabled: auditConfig?.enabled || false,
            multiDatabaseEnabled: this.adminConfig?.features?.multiDatabase || false
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
        console.log('🔓 DEBUG: Creating HTTP server for development');
        logger.warn('Creating HTTP server for admin - development only');
        return http.createServer(app);
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

            const isEnabled = typeof this.auditService.isEnabled === 'function' ? 
                this.auditService.isEnabled() : false;
            
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
     * Start server listening
     */
    listen() {
        return new Promise((resolve, reject) => {
            // Use adminConfig values
            const port = this.adminConfig.port;
            const host = this.adminConfig.host;

            console.log(`🔄 DEBUG: Starting server on ${host}:${port}...`);

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
                    },
                    multiDatabase: {
                        enabled: this.adminConfig.features.multiDatabase,
                        totalDatabases: this.databaseConnections.size,
                        healthyDatabases: Array.from(this.databaseHealthStatus.values()).filter(s => s.healthy).length,
                        databases: Array.from(this.databaseConnections.keys())
                    }
                });

                // Console output for development
                console.log(`\n🚀 InsightSerenity Admin Server Started`);
                console.log(`📍 URL: ${protocol.toLowerCase()}://${host}:${port}`);
                console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
                console.log(`🗄️  Database: Multi-Database Architecture (${this.databaseConnections.size} databases)`);
                console.log(`💾 Cache: ${process.env.REDIS_ENABLED === 'true' ? 'Redis' : 'Memory'}`);
                console.log(`🛡️  Security: ${protocol} ${this.adminConfig.security.ipWhitelist?.enabled ? '+ IP Whitelist' : ''}`);
                console.log(`📊 Admin Dashboard: ${protocol.toLowerCase()}://${host}:${port}/api/admin/dashboard`);
                console.log(`🔍 Health Check: ${protocol.toLowerCase()}://${host}:${port}/api/health`);
                console.log(`📋 Audit System: ${auditConfig?.enabled ? 'Enabled' : 'Disabled'} (${auditConfig?.storage?.type || 'memory'})`);
                console.log(`🔧 Model Recovery: Enabled`);
                console.log(`🏗️  Multi-Database: ${this.databaseConnections.size} databases connected`);
                
                // Display database information
                for (const [dbType, connection] of this.databaseConnections) {
                    const status = this.databaseHealthStatus.get(dbType);
                    const collections = this.databaseCollectionMapping.get(dbType);
                    console.log(`   - ${dbType}: ${status?.healthy ? '✅' : '❌'} (${collections?.length || 0} collections)`);
                }

                if (process.env.NODE_ENV === 'development') {
                    console.log(`🐛 Debugger: ws://${host}:9230`);
                    console.log(`📚 API Docs: ${protocol.toLowerCase()}://${host}:${port}/admin/api-docs`);
                }

                console.log('✅ DEBUG: Server listening setup completed');
                resolve();
            });

            this.server.on('error', (error) => {
                console.error('❌ DEBUG: Server error:', error.message);
                
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
        console.log('🔄 DEBUG: Setting up admin handlers...');
        
        this.server.on('connection', (socket) => {
            const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
            this.adminConnections.set(connectionId, {
                socket,
                connectedAt: new Date(),
                remoteAddress: socket.remoteAddress
            });

            console.log(`🔗 DEBUG: New admin connection: ${connectionId}`);
            logger.debug('New admin connection established', {
                connectionId,
                remoteAddress: socket.remoteAddress,
                totalConnections: this.adminConnections.size
            });

            socket.on('close', () => {
                this.adminConnections.delete(connectionId);
                console.log(`🔌 DEBUG: Admin connection closed: ${connectionId}`);
                logger.debug('Admin connection closed', {
                    connectionId,
                    remainingConnections: this.adminConnections.size
                });
            });

            socket.on('error', (error) => {
                console.error(`❌ DEBUG: Socket error for ${connectionId}:`, error.message);
                logger.warn('Admin socket error', {
                    connectionId,
                    error: error.message
                });
            });
        });

        // Monitor admin connections
        const connectionMonitorInterval = setInterval(() => {
            if (this.adminConnections.size > 0) {
                console.log(`🔗 DEBUG: Active admin connections: ${this.adminConnections.size}`);
                logger.debug('Active admin connections', {
                    count: this.adminConnections.size,
                    addresses: Array.from(this.adminConnections.values()).map(c => c.remoteAddress)
                });
            }
        }, 60000);

        // Store interval for cleanup
        this.connectionMonitorInterval = connectionMonitorInterval;

        console.log('✅ DEBUG: Admin handlers setup completed');
    }

    /**
     * Setup security monitoring for admin activities
     */
    setupSecurityMonitoring() {
        try {
            console.log('🔄 DEBUG: Setting up security monitoring...');

            // Monitor failed login attempts
            this.on('admin:login:failed', async (data) => {
                console.log(`🚨 DEBUG: Admin login failed for user: ${data.username || 'unknown'} from IP: ${data.ip}`);
                
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
                        console.log('✅ DEBUG: Failed login attempt logged to audit');
                    } catch (auditError) {
                        console.error('❌ DEBUG: Failed to log audit event:', auditError.message);
                        logger.warn('Failed to log audit event', { error: auditError.message });
                    }
                }

                if (data.attempts > 5) {
                    console.log(`🚨 DEBUG: Potential brute force attack detected from IP: ${data.ip}`);
                    logger.warn('Potential brute force attack on admin', data);
                }
            });

            // Monitor privilege escalations
            this.on('admin:privilege:changed', async (data) => {
                console.log(`🔐 DEBUG: Admin privilege changed for user: ${data.target?.id || 'unknown'}`);
                
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
                        console.log('✅ DEBUG: Privilege change logged to audit');
                    } catch (auditError) {
                        console.error('❌ DEBUG: Failed to log privilege change to audit:', auditError.message);
                        logger.warn('Failed to log audit event', { error: auditError.message });
                    }
                }
            });

            // Monitor suspicious admin activities
            this.on('admin:suspicious:activity', async (data) => {
                console.log(`🚨 DEBUG: Suspicious admin activity detected:`, data.activity);
                
                if (this.auditService) {
                    try {
                        await this.auditService.logEvent({
                            eventType: AuditEvents.SECURITY.THREAT_DETECTED,
                            userId: data.userId || 'unknown',
                            tenantId: 'admin',
                            resource: 'admin_portal',
                            action: data.activity,
                            result: 'alert',
                            metadata: data.metadata || {},
                            context: data.context || {}
                        });
                        console.log('✅ DEBUG: Suspicious activity logged to audit');
                    } catch (auditError) {
                        console.error('❌ DEBUG: Failed to log suspicious activity to audit:', auditError.message);
                    }
                }

                logger.error('Suspicious admin activity detected', data);
            });

            console.log('✅ DEBUG: Security monitoring setup completed');
            logger.info('Admin security monitoring initialized successfully');

        } catch (error) {
            console.error('❌ DEBUG: Security monitoring setup failed:', error.message);
            logger.error('Failed to setup security monitoring', { error: error.message });
        }
    }

    /**
     * Check admin sessions health
     */
    async checkAdminSessions() {
        try {
            console.log('🔄 DEBUG: Checking admin sessions health...');
            
            const sessionStatus = {
                healthy: true,
                activeSessions: this.adminConnections.size,
                expiredToday: 0,
                store: process.env.SESSION_STORE || 'memory',
                connections: [],
                lastCheck: new Date().toISOString()
            };

            // Get connection details
            for (const [id, conn] of this.adminConnections) {
                const duration = (new Date() - conn.connectedAt) / 1000;
                sessionStatus.connections.push({
                    id: id,
                    address: conn.remoteAddress,
                    duration: duration,
                    active: duration < this.adminConfig.security.sessionTimeout / 1000
                });
            }

            console.log(`✅ DEBUG: Admin sessions check completed. Active: ${sessionStatus.activeSessions}`);
            return sessionStatus;
        } catch (error) {
            console.error('❌ DEBUG: Admin sessions check failed:', error.message);
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Check security status
     */
    async checkSecurityStatus() {
        try {
            console.log('🔄 DEBUG: Checking security status...');
            
            const securityStatus = {
                healthy: true,
                sslEnabled: this.server instanceof https.Server,
                ipWhitelistActive: this.adminConfig.security.ipWhitelist?.enabled || false,
                mfaRequired: this.adminConfig.security.requireMFA || false,
                securityLevel: this.adminConfig.security.level || 'medium',
                advancedSecurity: this.adminConfig.security.advanced || false,
                sessionTimeout: this.adminConfig.security.sessionTimeout,
                lastSecurityScan: new Date().toISOString(),
                securityManager: !!this.securityManager
            };

            console.log(`✅ DEBUG: Security check completed. SSL: ${securityStatus.sslEnabled}, MFA: ${securityStatus.mfaRequired}`);
            return securityStatus;
        } catch (error) {
            console.error('❌ DEBUG: Security status check failed:', error.message);
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Check environment configuration health
     */
    async checkEnvironmentConfig() {
        try {
            console.log('🔄 DEBUG: Checking environment configuration...');
            
            const envStatus = {
                healthy: true,
                redisEnabled: process.env.REDIS_ENABLED === 'true',
                fallbackToMemory: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
                sessionStore: process.env.SESSION_STORE || 'memory',
                environment: process.env.NODE_ENV,
                auditEnabled: auditConfig?.enabled || false,
                multiDatabaseEnabled: this.adminConfig?.features?.multiDatabase || false,
                requiredVarsPresent: {
                    NODE_ENV: !!process.env.NODE_ENV,
                    ADMIN_PORT: !!process.env.ADMIN_PORT,
                    DB_URI: !!process.env.DB_URI,
                    SESSION_SECRET: !!process.env.SESSION_SECRET,
                    JWT_SECRET: !!process.env.JWT_SECRET,
                    ACCESS_TOKEN_SECRET: !!process.env.ACCESS_TOKEN_SECRET,
                    TEMPORARY_TOKEN_SECRET: !!process.env.TEMPORARY_TOKEN_SECRET
                },
                lastCheck: new Date().toISOString()
            };

            // Check if all required vars are present
            const missingVars = Object.entries(envStatus.requiredVarsPresent)
                .filter(([key, present]) => !present)
                .map(([key]) => key);

            if (missingVars.length > 0) {
                envStatus.healthy = false;
                envStatus.missingVariables = missingVars;
                console.log(`⚠️  DEBUG: Missing environment variables: ${missingVars.join(', ')}`);
            }

            console.log(`✅ DEBUG: Environment configuration check completed. Healthy: ${envStatus.healthy}`);
            return envStatus;
        } catch (error) {
            console.error('❌ DEBUG: Environment configuration check failed:', error.message);
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Check current model status
     */
    async checkModelStatus() {
        try {
            console.log('🔄 DEBUG: Checking model status...');
            
            let modelSummary = { total: 0, successful: 0, failed: 0 };
            let modelErrors = [];
            
            try {
                if (typeof Database.getRegistrationSummary === 'function') {
                    modelSummary = Database.getRegistrationSummary();
                    console.log('✅ DEBUG: Got model summary from Database.getRegistrationSummary()');
                } else {
                    console.log('⚠️  DEBUG: Database.getRegistrationSummary() not available');
                }

                if (typeof Database.getRegistrationErrors === 'function') {
                    modelErrors = Database.getRegistrationErrors();
                    console.log('✅ DEBUG: Got model errors from Database.getRegistrationErrors()');
                } else {
                    console.log('⚠️  DEBUG: Database.getRegistrationErrors() not available');
                }
            } catch (summaryError) {
                console.error('❌ DEBUG: Error getting model summary:', summaryError.message);
            }
            
            const modelStatus = {
                healthy: modelSummary.failed === 0,
                summary: modelSummary,
                errors: modelErrors.slice(0, 5), // Limit error details
                lastCheck: new Date().toISOString(),
                recoveryAttempts: this.modelRecoveryAttempts,
                maxRecoveryAttempts: this.maxModelRecoveryAttempts,
                recoveryEnabled: this.adminConfig?.features?.modelRecovery || true,
                databasesAvailable: this.databaseConnections.size
            };

            console.log(`✅ DEBUG: Model status check completed. Total: ${modelSummary.total}, Failed: ${modelSummary.failed}`);
            return modelStatus;
        } catch (error) {
            console.error('❌ DEBUG: Model status check failed:', error.message);
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
            console.log('🔄 DEBUG: Checking model recovery status...');
            
            const recoveryStatus = {
                healthy: this.modelRecoveryAttempts < this.maxModelRecoveryAttempts,
                recoveryAttempts: this.modelRecoveryAttempts,
                maxAttempts: this.maxModelRecoveryAttempts,
                canRecover: this.modelRecoveryAttempts < this.maxModelRecoveryAttempts,
                lastRecoveryAttempt: this.modelRecoveryAttempts > 0 ? new Date().toISOString() : null,
                recoveryEnabled: this.adminConfig?.features?.modelRecovery || true,
                lastCheck: new Date().toISOString()
            };

            console.log(`✅ DEBUG: Model recovery status check completed. Attempts: ${recoveryStatus.recoveryAttempts}/${recoveryStatus.maxAttempts}`);
            return recoveryStatus;
        } catch (error) {
            console.error('❌ DEBUG: Model recovery status check failed:', error.message);
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Get models health status
     */
    async getModelsHealthStatus() {
        try {
            console.log('🔄 DEBUG: Getting models health status...');
            
            let summary = { successful: 0, failed: 0, total: 0 };
            
            try {
                if (typeof Database.getRegistrationSummary === 'function') {
                    summary = Database.getRegistrationSummary();
                    console.log('✅ DEBUG: Got registration summary from Database');
                } else {
                    console.log('⚠️  DEBUG: Database.getRegistrationSummary() not available');
                }
            } catch (summaryError) {
                console.error('❌ DEBUG: Error getting registration summary:', summaryError.message);
            }

            const healthStatus = {
                total: summary.total || (summary.successful + summary.failed),
                successful: summary.successful,
                failed: summary.failed,
                healthy: summary.failed === 0 || summary.successful > 0,
                lastCheck: new Date().toISOString()
            };

            console.log(`✅ DEBUG: Models health status obtained. Total: ${healthStatus.total}, Healthy: ${healthStatus.healthy}`);
            return healthStatus;
        } catch (error) {
            console.error('❌ DEBUG: Getting models health status failed:', error.message);
            return { 
                healthy: false, 
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Setup model recovery monitoring
     */
    setupModelRecoveryMonitoring() {
        try {
            console.log('🔄 DEBUG: Setting up model recovery monitoring...');

            // Monitor for model-related events
            this.on('model:recovery:needed', async (data) => {
                console.log('🔧 DEBUG: Model recovery needed event triggered:', data);
                logger.warn('Model recovery needed', data);
                
                if (this.modelRecoveryAttempts < this.maxModelRecoveryAttempts) {
                    try {
                        console.log('🔄 DEBUG: Attempting automatic model recovery...');
                        await this.validateAndRecoverModels();
                        console.log('✅ DEBUG: Automatic model recovery completed');
                    } catch (error) {
                        console.error('❌ DEBUG: Automatic model recovery failed:', error.message);
                        logger.error('Automatic model recovery failed', { error: error.message });
                    }
                } else {
                    console.log('⚠️  DEBUG: Max model recovery attempts reached, manual intervention required');
                    logger.error('Max model recovery attempts reached, manual intervention required');
                }
            });

            // Monitor for model failures
            this.on('model:failure', async (data) => {
                console.log('❌ DEBUG: Model failure detected:', data);
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
                        console.log('✅ DEBUG: Model failure logged to audit');
                    } catch (auditError) {
                        console.error('❌ DEBUG: Failed to log model failure to audit:', auditError.message);
                        logger.warn('Failed to log model failure to audit', { error: auditError.message });
                    }
                }

                // Trigger recovery if not at max attempts
                if (this.modelRecoveryAttempts < this.maxModelRecoveryAttempts) {
                    console.log('🔄 DEBUG: Triggering model recovery due to failure...');
                    this.emit('model:recovery:needed', {
                        trigger: 'model_failure',
                        originalFailure: data,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            console.log('✅ DEBUG: Model recovery monitoring setup completed');
            logger.info('Model recovery monitoring setup completed');

        } catch (error) {
            console.error('❌ DEBUG: Failed to setup model recovery monitoring:', error.message);
            logger.error('Failed to setup model recovery monitoring', { error: error.message });
        }
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        console.log('🔄 DEBUG: Setting up graceful shutdown handlers...');

        const shutdown = async (signal) => {
            if (this.isShuttingDown) {
                console.log('⚠️  DEBUG: Admin shutdown already in progress');
                logger.warn('Admin shutdown already in progress');
                return;
            }

            this.isShuttingDown = true;
            console.log(`🔄 DEBUG: Admin server received ${signal}, starting graceful shutdown...`);
            logger.info(`Admin server received ${signal}, starting graceful shutdown`);

            try {
                // Log shutdown event
                const shutdownInfo = {
                    signal,
                    uptime: process.uptime(),
                    activeConnections: this.adminConnections.size,
                    shutdownInitiated: new Date().toISOString(),
                    multiDatabase: {
                        totalDatabases: this.databaseConnections.size,
                        healthyDatabases: Array.from(this.databaseHealthStatus.values()).filter(s => s.healthy).length
                    }
                };

                console.log('📊 DEBUG: Shutdown info:', shutdownInfo);
                logger.info('Admin server graceful shutdown initiated', shutdownInfo);

                // Clear intervals
                if (this.connectionMonitorInterval) {
                    clearInterval(this.connectionMonitorInterval);
                    console.log('✅ DEBUG: Connection monitor interval cleared');
                }

                // Stop health monitoring
                if (this.healthMonitor) {
                    console.log('🔄 DEBUG: Stopping health monitor...');
                    await this.healthMonitor.stop();
                    console.log('✅ DEBUG: Health monitor stopped');
                }

                // Close all admin connections
                console.log('🔄 DEBUG: Closing admin connections...');
                for (const [id, conn] of this.adminConnections) {
                    try {
                        conn.socket.destroy();
                        console.log(`✅ DEBUG: Connection ${id} destroyed`);
                    } catch (connError) {
                        console.error(`❌ DEBUG: Error destroying connection ${id}:`, connError.message);
                    }
                }
                console.log('✅ DEBUG: All admin connections closed');

                // Close server
                console.log('🔄 DEBUG: Closing server...');
                await this.closeServer();
                console.log('✅ DEBUG: Server closed');

                // Close database connections
                console.log('🔄 DEBUG: Closing database connections...');
                try {
                    await Database.shutdown();
                    console.log('✅ DEBUG: Database connections closed');
                } catch (dbShutdownError) {
                    console.error('❌ DEBUG: Database shutdown error:', dbShutdownError.message);
                    logger.error('Database shutdown error', { error: dbShutdownError.message });
                }

                // Stop the Express app
                console.log('🔄 DEBUG: Stopping Express app...');
                try {
                    if (app.stop && typeof app.stop === 'function') {
                        await app.stop();
                        console.log('✅ DEBUG: Express app stopped');
                    } else {
                        console.log('⚠️  DEBUG: app.stop() not available');
                    }
                } catch (appStopError) {
                    console.error('❌ DEBUG: Express app stop error:', appStopError.message);
                }

                // Flush audit logs and cleanup audit system
                if (this.auditService) {
                    console.log('🔄 DEBUG: Cleaning up audit system...');
                    try {
                        if (typeof this.auditService.cleanup === 'function') {
                            await this.auditService.cleanup();
                            console.log('✅ DEBUG: Audit system cleaned up');
                        }
                    } catch (auditCleanupError) {
                        console.error('❌ DEBUG: Audit cleanup error:', auditCleanupError.message);
                    }
                }

                console.log('✅ DEBUG: Admin server graceful shutdown completed');
                logger.info('Admin server graceful shutdown completed', {
                    signal,
                    uptime: process.uptime()
                });

                process.exit(0);
            } catch (error) {
                console.error('❌ DEBUG: Error during admin shutdown:', error.message);
                logger.error('Error during admin shutdown', { error: error.message });
                process.exit(1);
            }
        };

        process.on('SIGINT', () => {
            console.log('🛑 DEBUG: Received SIGINT signal');
            shutdown('SIGINT');
        });
        
        process.on('SIGTERM', () => {
            console.log('🛑 DEBUG: Received SIGTERM signal');
            shutdown('SIGTERM');
        });

        console.log('✅ DEBUG: Graceful shutdown handlers setup completed');
    }

    /**
     * Setup error handlers
     */
    setupErrorHandlers() {
        console.log('🔄 DEBUG: Setting up error handlers...');

        process.on('uncaughtException', async (error) => {
            console.error('❌ DEBUG: UNCAUGHT EXCEPTION:', error.message);
            console.error('❌ DEBUG: UNCAUGHT EXCEPTION STACK:', error.stack);
            
            const errorInfo = {
                error: error.message,
                stack: error.stack,
                severity: 'critical',
                multiDatabase: {
                    totalDatabases: this.databaseConnections.size,
                    healthyDatabases: Array.from(this.databaseHealthStatus.values()).filter(s => s.healthy).length
                },
                timestamp: new Date().toISOString()
            };

            logger.error('Admin Server: Uncaught Exception', errorInfo);

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
                    console.log('✅ DEBUG: Uncaught exception logged to audit');
                } catch (auditError) {
                    console.error('❌ DEBUG: Failed to log uncaught exception to audit:', auditError.message);
                    logger.error('Failed to log uncaught exception to audit', { error: auditError.message });
                }
            }

            // Emit model recovery needed if it's a model-related error
            if (error.message && error.message.toLowerCase().includes('model')) {
                console.log('🔧 DEBUG: Uncaught exception appears model-related, emitting model:failure event');
                this.emit('model:failure', {
                    error: error.message,
                    type: 'uncaught_exception',
                    timestamp: new Date().toISOString()
                });
            }

            setTimeout(() => {
                console.log('💥 DEBUG: Forcing process exit due to uncaught exception');
                process.exit(1);
            }, 1000);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            console.error('❌ DEBUG: UNHANDLED REJECTION:', reason);
            
            const reasonString = reason instanceof Error ? reason.message : String(reason);
            const stack = reason instanceof Error ? reason.stack : undefined;
            
            const rejectionInfo = {
                reason: reasonString,
                stack: stack,
                severity: 'high',
                multiDatabase: {
                    totalDatabases: this.databaseConnections.size,
                    healthyDatabases: Array.from(this.databaseHealthStatus.values()).filter(s => s.healthy).length
                },
                timestamp: new Date().toISOString()
            };

            logger.error('Admin Server: Unhandled Promise Rejection', rejectionInfo);

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
                            reason: reasonString,
                            stack: stack,
                            severity: 'high'
                        }
                    });
                    console.log('✅ DEBUG: Unhandled rejection logged to audit');
                } catch (auditError) {
                    console.error('❌ DEBUG: Failed to log unhandled rejection to audit:', auditError.message);
                    logger.error('Failed to log unhandled rejection to audit', { error: auditError.message });
                }
            }

            // Emit model recovery needed if it's a model-related error
            if (reason && reasonString.toLowerCase().includes('model')) {
                console.log('🔧 DEBUG: Unhandled rejection appears model-related, emitting model:failure event');
                this.emit('model:failure', {
                    error: reasonString,
                    type: 'unhandled_rejection',
                    timestamp: new Date().toISOString()
                });
            }
        });

        console.log('✅ DEBUG: Error handlers setup completed');
    }

    /**
     * Close the server
     */
    closeServer() {
        return new Promise((resolve, reject) => {
            console.log('🔄 DEBUG: Starting server close process...');
            
            if (!this.server) {
                console.log('✅ DEBUG: No server to close');
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                console.error('❌ DEBUG: Admin server forceful shutdown due to timeout');
                logger.error('Admin server forceful shutdown due to timeout');
                reject(new Error('Server close timeout'));
            }, 30000);

            this.server.close((error) => {
                clearTimeout(timeout);

                if (error) {
                    console.error('❌ DEBUG: Error closing admin server:', error.message);
                    logger.error('Error closing admin server', { error: error.message });
                    reject(error);
                } else {
                    console.log('✅ DEBUG: Admin server closed successfully');
                    logger.info('Admin server closed successfully');
                    resolve();
                }
            });
        });
    }

    /**
     * ENHANCED: Get admin server status with multi-database architecture information
     */
    getStatus() {
        try {
            console.log('🔄 DEBUG: Getting admin server status...');
            
            let dbHealth = { status: 'unknown' };
            try {
                if (typeof Database.getHealthStatus === 'function') {
                    dbHealth = Database.getHealthStatus();
                    console.log('✅ DEBUG: Got database health status from Database.getHealthStatus()');
                } else {
                    console.log('⚠️  DEBUG: Database.getHealthStatus() not available');
                }
            } catch (healthError) {
                console.error('❌ DEBUG: Error getting database health status:', healthError.message);
            }
            
            const uptime = this.startTime ? (new Date() - this.startTime) / 1000 : 0;
            
            let auditStatus = { enabled: false };
            try {
                auditStatus = this.auditService ? {
                    enabled: typeof this.auditService.isEnabled === 'function' ? this.auditService.isEnabled() : false,
                    config: typeof this.auditService.getConfig === 'function' ? this.auditService.getConfig() : {},
                    factoryStatus: AuditServiceFactory && typeof AuditServiceFactory.getStatus === 'function' ? 
                        AuditServiceFactory.getStatus() : { initialized: false, enabled: false }
                } : { enabled: false };
                console.log('✅ DEBUG: Got audit status');
            } catch (auditError) {
                console.error('❌ DEBUG: Error getting audit status:', auditError.message);
            }

            let modelStatus = { total: 0, successful: 0, failed: 0 };
            try {
                if (typeof Database.getRegistrationSummary === 'function') {
                    modelStatus = Database.getRegistrationSummary();
                    console.log('✅ DEBUG: Got model status from Database.getRegistrationSummary()');
                } else {
                    console.log('⚠️  DEBUG: Database.getRegistrationSummary() not available for status');
                }
            } catch (modelError) {
                console.error('❌ DEBUG: Error getting model status:', modelError.message);
            }

            // Multi-database status
            const multiDatabaseStatus = {
                enabled: this.adminConfig?.features?.multiDatabase || false,
                totalDatabases: this.databaseConnections.size,
                databases: Object.fromEntries(
                    Array.from(this.databaseConnections.entries()).map(([dbType, connection]) => {
                        const health = this.databaseHealthStatus.get(dbType);
                        const collections = this.databaseCollectionMapping.get(dbType);
                        return [dbType, {
                            connectionName: connection?.name || 'unknown',
                            databaseName: connection?.db?.databaseName || 'unknown',
                            healthy: health?.healthy || false,
                            collections: collections?.length || 0,
                            collectionsExpected: collections || [],
                            writeOperations: health?.writeOperations || false,
                            lastHealthCheck: health?.timestamp,
                            error: health?.error
                        }];
                    })
                ),
                healthyDatabases: Array.from(this.databaseHealthStatus.values()).filter(s => s.healthy).length,
                collectionsMapping: Object.fromEntries(this.databaseCollectionMapping)
            };

            const status = {
                server: {
                    running: !!this.server,
                    uptime,
                    startTime: this.startTime,
                    environment: config.app?.env,
                    version: config.app?.version,
                    nodeVersion: process.version,
                    shuttingDown: this.isShuttingDown
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
                    ipWhitelist: this.adminConfig?.security?.ipWhitelist?.enabled || false,
                    mfa: this.adminConfig?.security?.requireMFA || false,
                    securityLevel: this.adminConfig?.security?.level || 'medium',
                    advancedSecurity: this.adminConfig?.security?.advanced || false,
                    securityManager: !!this.securityManager
                },
                configuration: {
                    redis: process.env.REDIS_ENABLED === 'true',
                    sessionStore: process.env.SESSION_STORE || 'memory',
                    cacheFallback: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
                    adminPort: this.adminConfig?.port || 'unknown',
                    adminHost: this.adminConfig?.host || 'unknown'
                },
                models: {
                    total: modelStatus.total,
                    successful: modelStatus.successful,
                    failed: modelStatus.failed,
                    recoveryAttempts: this.modelRecoveryAttempts,
                    maxRecoveryAttempts: this.maxModelRecoveryAttempts,
                    recoveryEnabled: this.adminConfig?.features?.modelRecovery || true,
                    healthy: modelStatus.failed === 0 || modelStatus.successful > 0
                },
                multiDatabase: multiDatabaseStatus,
                audit: auditStatus,
                database: dbHealth,
                health: this.healthMonitor?.getStatus() || { status: 'not_available' },
                timestamp: new Date().toISOString()
            };

            console.log('✅ DEBUG: Admin server status compiled successfully');
            return status;
        } catch (error) {
            console.error('❌ DEBUG: Error getting admin server status:', error.message);
            logger.error('Error getting admin server status', { error: error.message });
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Force restart server (for emergency situations)
     */
    async forceRestart() {
        try {
            console.log('🔄 DEBUG: Force restart initiated...');
            logger.warn('Admin server force restart initiated');
            
            if (this.auditService) {
                try {
                    await this.auditService.logEvent({
                        eventType: AuditEvents.SYSTEM.RESTART,
                        userId: 'system',
                        tenantId: 'admin',
                        resource: 'admin_server',
                        action: 'force_restart',
                        result: 'initiated',
                        metadata: {
                            trigger: 'manual',
                            uptime: process.uptime()
                        }
                    });
                    console.log('✅ DEBUG: Force restart logged to audit');
                } catch (auditError) {
                    console.error('❌ DEBUG: Failed to log force restart to audit:', auditError.message);
                }
            }

            // Reset recovery attempts
            this.modelRecoveryAttempts = 0;
            
            // Close current server
            await this.closeServer();
            
            // Reinitialize everything
            await this.start();
            
            console.log('✅ DEBUG: Force restart completed successfully');
            logger.info('Admin server force restart completed successfully');
            
            return { success: true, timestamp: new Date().toISOString() };
        } catch (error) {
            console.error('❌ DEBUG: Force restart failed:', error.message);
            logger.error('Admin server force restart failed', { error: error.message });
            throw error;
        }
    }
}

// Create singleton instance
const adminServer = new AdminServer();

// Export both the instance and the class for testing
module.exports = adminServer;
module.exports.AdminServer = AdminServer;

// Start server if run directly
if (require.main === module) {
    console.log('🚀 DEBUG: Starting admin server as main module...');
    adminServer.start().catch((error) => {
        console.error('❌ DEBUG: Failed to start admin server from main:', error.message);
        console.error('❌ DEBUG: Main startup error stack:', error.stack);
        
        logger.error('Failed to start admin server', {
            error: error.message,
            stack: error.stack,
            trigger: 'main_module'
        });
        process.exit(1);
    });
}