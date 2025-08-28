/**
 * @file Customer Services Server Entry Point
 * @description Production-grade customer-facing services server with multi-tenant support,
 *              cluster management, graceful shutdown, and comprehensive business functionality
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 * @module insightserenity-platform/servers/customer-services/server
 * @requires ../../../shared/config
 * @requires ../../../shared/lib/database
 * @requires ../../../shared/lib/utils/logger
 * @requires ../../../shared/lib/utils/app-error
 * @requires ../../../shared/lib/security/session-manager
 * @requires ../../../shared/lib/services/cache-service
 * @requires ../../../shared/lib/services/payment-service
 * @requires ../../../shared/lib/services/email-service
 * @requires ../../../shared/lib/services/file-service
 * @requires ./app
 */

'use strict';

// =============================================================================
// ENVIRONMENT LOADING - MUST BE FIRST
// =============================================================================
const path = require('path');
const dotenv = require('dotenv');
const cluster = require('cluster');
const os = require('os');
const EventEmitter = require('events');

// Enhanced environment variable loading with explicit path resolution
const envPath = path.resolve(__dirname, '.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
    console.warn(`⚠️  Warning: Could not load .env file from ${envPath}:`, envResult.error.message);
    // Fallback to default .env loading
    dotenv.config();
}

console.log('🔧 DEBUG - Environment Variables Check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SERVICES_PORT:', process.env.SERVICES_PORT);
console.log('DB_URI exists:', !!process.env.DB_URI);
console.log('REDIS_ENABLED:', process.env.REDIS_ENABLED);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('ACCESS_TOKEN_SECRET exists:', !!process.env.ACCESS_TOKEN_SECRET);
console.log('TEMPORARY_TOKEN_SECRET exists:', !!process.env.TEMPORARY_TOKEN_SECRET);
console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
console.log('PAYPAL_CLIENT_ID exists:', !!process.env.PAYPAL_CLIENT_ID);

// Validate critical environment variables before proceeding
const requiredEnvVars = [
    'NODE_ENV', 
    'SERVICES_PORT', 
    'DB_URI', 
    'JWT_SECRET', 
    'ACCESS_TOKEN_SECRET',
    'SESSION_SECRET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    process.exit(1);
}

// Set default values for optional environment variables
process.env.CLUSTER_ENABLED = process.env.CLUSTER_ENABLED || 'true';
process.env.CLUSTER_WORKERS = process.env.CLUSTER_WORKERS || String(os.cpus().length);
process.env.MULTI_TENANT_ENABLED = process.env.MULTI_TENANT_ENABLED || 'true';
process.env.WEBSOCKET_ENABLED = process.env.WEBSOCKET_ENABLED || 'true';
process.env.RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED || 'true';
process.env.CACHE_FALLBACK_TO_MEMORY = process.env.CACHE_FALLBACK_TO_MEMORY || 'true';
process.env.PAYMENT_PROCESSOR = process.env.PAYMENT_PROCESSOR || 'stripe';
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'sendgrid';
process.env.FILE_STORAGE_PROVIDER = process.env.FILE_STORAGE_PROVIDER || 'local';

// Log environment loading status for debugging
console.log('🌍 Customer Services Environment Configuration:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`SERVICES_PORT: ${process.env.SERVICES_PORT}`);
console.log(`CLUSTER_ENABLED: ${process.env.CLUSTER_ENABLED}`);
console.log(`CLUSTER_WORKERS: ${process.env.CLUSTER_WORKERS}`);
console.log(`MULTI_TENANT_ENABLED: ${process.env.MULTI_TENANT_ENABLED}`);
console.log(`WEBSOCKET_ENABLED: ${process.env.WEBSOCKET_ENABLED}`);
console.log(`REDIS_ENABLED: ${process.env.REDIS_ENABLED}`);
console.log(`RATE_LIMIT_ENABLED: ${process.env.RATE_LIMIT_ENABLED}`);
console.log(`PAYMENT_PROCESSOR: ${process.env.PAYMENT_PROCESSOR}`);
console.log(`EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER}`);
console.log(`FILE_STORAGE_PROVIDER: ${process.env.FILE_STORAGE_PROVIDER}`);
console.log(`Environment file loaded from: ${envPath}`);

// =============================================================================
// MODULE IMPORTS - AFTER ENVIRONMENT LOADING
// =============================================================================
const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

console.log('🔄 DEBUG: Loading core modules...');

let app;
try {
    app = require('./app');
    console.log('✅ DEBUG: Customer Services App module loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load app module:', error.message);
    console.error('❌ Stack:', error.stack);
    throw error;
}

let config;
try {
    config = require('../../shared/config');
    console.log('✅ DEBUG: Shared config module loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load config module:', error.message);
    console.log('🔄 DEBUG: Attempting fallback config...');
    config = {
        app: { env: process.env.NODE_ENV, version: '1.0.0' },
        services: { port: parseInt(process.env.SERVICES_PORT, 10) || 4002 },
        database: { multiTenant: { enabled: true } },
        security: { ssl: { enabled: false } }
    };
    console.log('⚠️  DEBUG: Using fallback config');
}

let Database, logger, AppError;
try {
    Database = require('../../shared/lib/database');
    console.log('✅ DEBUG: Database module loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load database modules:', error.message);
    console.error('❌ Stack:', error.stack);
    throw error;
}

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

// Import shared services with error handling
let SessionManager, CacheService, PaymentService, EmailService, FileService;
try {
    SessionManager = require('../../shared/lib/security/session-manager');
    console.log('✅ DEBUG: SessionManager loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load SessionManager:', error.message);
    SessionManager = null;
}

try {
    CacheService = require('../../shared/lib/services/cache-service');
    console.log('✅ DEBUG: CacheService loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load CacheService:', error.message);
    CacheService = null;
}

try {
    PaymentService = require('../../shared/lib/services/payment-service');
    console.log('✅ DEBUG: PaymentService loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load PaymentService:', error.message);
    PaymentService = null;
}

try {
    EmailService = require('../../shared/lib/services/email-service');
    console.log('✅ DEBUG: EmailService loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load EmailService:', error.message);
    EmailService = null;
}

try {
    FileService = require('../../shared/lib/services/file-service');
    console.log('✅ DEBUG: FileService loaded successfully');
} catch (error) {
    console.error('❌ DEBUG: Failed to load FileService:', error.message);
    FileService = null;
}

/**
 * Customer Services Server class for enterprise customer operations with multi-tenant support
 * @class CustomerServicesServer
 */
class CustomerServicesServer extends EventEmitter {
    constructor() {
        super();
        this.server = null;
        this.wsServer = null;
        this.isShuttingDown = false;
        this.connections = new Map();
        this.wsConnections = new Map();
        this.startTime = null;
        this.sessionManager = null;
        this.tenantConnections = new Map();
        this.businessMetrics = {
            activeUsers: 0,
            activeTenants: 0,
            totalRequests: 0,
            totalOrganizations: 0,
            totalProjects: 0,
            totalJobs: 0,
            totalCandidates: 0,
            totalConsultants: 0
        };
        
        // Multi-tenant tracking
        this.tenantDatabases = new Map();
        this.tenantHealthStatus = new Map();
        
        console.log('✅ DEBUG: CustomerServicesServer instance created successfully');
    }

    /**
     * Initialize and start the customer services server
     * @returns {Promise<http.Server|https.Server>} The server instance
     * @throws {Error} If server initialization fails
     */
    async start() {
        try {
            console.log('🚀 DEBUG: Starting customer services server initialization...');
            this.startTime = new Date();

            // Set up environment-specific configurations
            this.setupEnvironmentConfig();
            
            // Initialize database connection FIRST
            console.log('🔄 DEBUG: Initializing database connection...');
            try {
                await Database.initialize();
                console.log('✅ DEBUG: Database initialized successfully');
            } catch (dbError) {
                console.error('❌ DEBUG: Database initialization failed:', dbError.message);
                console.error('❌ Stack:', dbError.stack);
                throw dbError;
            }

            // Initialize multi-tenant architecture
            console.log('🔄 DEBUG: Initializing multi-tenant architecture...');
            try {
                await this.initializeMultiTenantArchitecture();
                console.log('✅ DEBUG: Multi-tenant architecture initialized successfully');
            } catch (tenantError) {
                console.error('❌ DEBUG: Multi-tenant architecture initialization failed:', tenantError.message);
                if (process.env.NODE_ENV === 'production') {
                    throw tenantError;
                } else {
                    console.log('⚠️  DEBUG: Continuing without multi-tenant architecture in development');
                    logger.warn('Continuing without multi-tenant architecture in development');
                }
            }

            // Initialize shared services
            console.log('🔄 DEBUG: Initializing shared services...');
            await this.initializeSharedServices();

            // Initialize session manager
            console.log('🔄 DEBUG: Initializing session manager...');
            try {
                this.sessionManager = new SessionManager({
                    session: {
                        sessionSecret: process.env.SESSION_SECRET,
                        sessionName: 'customer.sid',
                        sessionDuration: parseInt(process.env.SESSION_TIMEOUT, 10) || 1800000, // 30 minutes
                        secure: process.env.NODE_ENV === 'production',
                        httpOnly: true,
                        sameSite: 'strict'
                    },
                    csrf: {
                        enabled: process.env.CSRF_ENABLED === 'true' || process.env.NODE_ENV === 'production'
                    },
                    security: {
                        enableSessionFingerprinting: process.env.SESSION_FINGERPRINTING === 'true',
                        enableIpValidation: process.env.SESSION_IP_VALIDATION === 'true',
                        maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS, 10) || 5,
                        lockoutDuration: parseInt(process.env.LOCKOUT_DURATION, 10) || 900000 // 15 minutes
                    }
                });
                console.log('✅ DEBUG: Session manager initialized successfully');
            } catch (sessionError) {
                console.error('❌ DEBUG: Session manager initialization failed:', sessionError.message);
                logger.warn('Session manager initialization failed, using basic session', { error: sessionError.message });
                this.sessionManager = null;
            }

            // Initialize the Express application
            console.log('🔄 DEBUG: Starting Express application...');
            let expressApp;
            try {
                expressApp = await app.start();
                console.log('✅ DEBUG: Express application started successfully');
            } catch (appError) {
                console.error('❌ DEBUG: Express application startup failed:', appError.message);
                console.error('❌ Stack:', appError.stack);
                throw appError;
            }

            if (!expressApp) {
                throw new Error('Failed to initialize Customer Services Express application');
            }

            // Create server with SSL support
            console.log('🔄 DEBUG: Creating server...');
            try {
                if (this.shouldUseSSL()) {
                    console.log('🔒 DEBUG: Creating HTTPS server...');
                    this.server = await this.createSecureHttpsServer(expressApp);
                } else {
                    console.log('🔓 DEBUG: Creating HTTP server...');
                    this.server = this.createHttpServer(expressApp);
                }
                console.log('✅ DEBUG: Server created successfully');
            } catch (serverError) {
                console.error('❌ DEBUG: Server creation failed:', serverError.message);
                throw serverError;
            }

            // Initialize WebSocket server if enabled
            if (process.env.WEBSOCKET_ENABLED === 'true') {
                console.log('🔄 DEBUG: Initializing WebSocket server...');
                try {
                    await this.initializeWebSocketServer();
                    console.log('✅ DEBUG: WebSocket server initialized successfully');
                } catch (wsError) {
                    console.error('❌ DEBUG: WebSocket server initialization failed:', wsError.message);
                    logger.warn('WebSocket server failed to initialize, continuing without real-time features', { error: wsError.message });
                }
            }

            // Start listening
            console.log('🔄 DEBUG: Starting server listening...');
            await this.listen();
            console.log('✅ DEBUG: Server listening started');

            // Setup handlers
            console.log('🔄 DEBUG: Setting up handlers...');
            this.setupConnectionHandlers();
            this.setupGracefulShutdown();
            this.setupErrorHandlers();
            this.setupBusinessMetricsTracking();
            console.log('✅ DEBUG: All handlers setup completed');

            // Log startup success
            this.logStartupSuccess();

            console.log('🎉 DEBUG: Customer services server startup completed successfully!');
            return this.server;
        } catch (error) {
            console.error('❌ DEBUG: Customer services server startup failed:', error.message);
            console.error('❌ Stack:', error.stack);
            
            logger.error('Failed to start customer services server', {
                error: error.message,
                stack: error.stack,
                environment: process.env.NODE_ENV,
                port: process.env.SERVICES_PORT
            });

            throw error;
        }
    }

    /**
     * Setup environment-specific configuration
     * @private
     */
    setupEnvironmentConfig() {
        console.log('🔧 DEBUG: Setting up environment-specific configuration...');
        
        // Development specific settings
        if (process.env.NODE_ENV === 'development') {
            console.log('🔧 DEBUG: Applying development configuration');
            process.env.RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED || 'false';
            process.env.SESSION_SECURE = process.env.SESSION_SECURE || 'false';
            process.env.CSRF_ENABLED = process.env.CSRF_ENABLED || 'false';
            process.env.SESSION_IP_VALIDATION = process.env.SESSION_IP_VALIDATION || 'false';
            process.env.CORS_STRICT = process.env.CORS_STRICT || 'false';
            process.env.HELMET_ENABLED = process.env.HELMET_ENABLED || 'false';
            
            // Enable debugging features
            process.env.DEBUG_REQUESTS = process.env.DEBUG_REQUESTS || 'true';
            process.env.DEBUG_DATABASE = process.env.DEBUG_DATABASE || 'true';
            process.env.DEBUG_WEBSOCKETS = process.env.DEBUG_WEBSOCKETS || 'true';
        }
        
        // Production specific settings
        if (process.env.NODE_ENV === 'production') {
            console.log('🔧 DEBUG: Applying production configuration');
            process.env.RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED || 'true';
            process.env.SESSION_SECURE = process.env.SESSION_SECURE || 'true';
            process.env.CSRF_ENABLED = process.env.CSRF_ENABLED || 'true';
            process.env.SESSION_IP_VALIDATION = process.env.SESSION_IP_VALIDATION || 'true';
            process.env.CORS_STRICT = process.env.CORS_STRICT || 'true';
            process.env.HELMET_ENABLED = process.env.HELMET_ENABLED || 'true';
            
            // Disable debugging features
            process.env.DEBUG_REQUESTS = 'false';
            process.env.DEBUG_DATABASE = 'false';
            process.env.DEBUG_WEBSOCKETS = 'false';
        }

        console.log('✅ DEBUG: Environment configuration applied');
        logger.info('Environment configuration applied', {
            environment: process.env.NODE_ENV,
            rateLimit: process.env.RATE_LIMIT_ENABLED,
            sessionSecure: process.env.SESSION_SECURE,
            csrfEnabled: process.env.CSRF_ENABLED,
            corsStrict: process.env.CORS_STRICT,
            helmetEnabled: process.env.HELMET_ENABLED
        });
    }

    /**
     * Initialize multi-tenant architecture for customer operations
     * @private
     */
    async initializeMultiTenantArchitecture() {
        try {
            console.log('🔄 DEBUG: Starting multi-tenant architecture initialization...');
            
            if (process.env.MULTI_TENANT_ENABLED !== 'true') {
                console.log('⚠️  DEBUG: Multi-tenant support is disabled');
                logger.info('Multi-tenant support is disabled');
                return;
            }

            // Initialize tenant database connections
            const tenantTypes = {
                organizations: {
                    purpose: 'Organization-specific data and configurations',
                    collections: ['org_settings', 'org_members', 'org_invitations', 'org_billing']
                },
                projects: {
                    purpose: 'Project data and management',
                    collections: ['projects', 'project_milestones', 'project_resources', 'project_timelines']
                },
                clients: {
                    purpose: 'Client relationship management',
                    collections: ['clients', 'client_contacts', 'client_documents', 'client_notes']
                },
                recruitment: {
                    purpose: 'Recruitment and job posting data',
                    collections: ['jobs', 'candidates', 'applications', 'interviews']
                }
            };

            for (const [tenantType, config] of Object.entries(tenantTypes)) {
                console.log(`🔄 DEBUG: Processing tenant type: ${tenantType}`);
                
                try {
                    // Initialize tenant-specific database connection
                    const tenantConnection = await Database.getTenantConnection(tenantType);
                    
                    if (tenantConnection) {
                        this.tenantDatabases.set(tenantType, tenantConnection);
                        
                        // Verify tenant health
                        const healthStatus = await this.verifyTenantHealth(tenantType, tenantConnection, config);
                        this.tenantHealthStatus.set(tenantType, healthStatus);
                        
                        console.log(`✅ DEBUG: Tenant ${tenantType} initialized successfully`);
                        logger.info(`Tenant ${tenantType} initialized successfully`, {
                            purpose: config.purpose,
                            collections: config.collections.length,
                            healthy: healthStatus.healthy
                        });
                    } else {
                        console.log(`⚠️  DEBUG: No tenant connection available for: ${tenantType}`);
                        this.tenantHealthStatus.set(tenantType, {
                            healthy: false,
                            error: 'Connection not available',
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    console.error(`❌ DEBUG: Error initializing tenant ${tenantType}:`, error.message);
                    logger.error(`Failed to initialize tenant ${tenantType}`, {
                        error: error.message,
                        purpose: config.purpose
                    });
                    
                    this.tenantHealthStatus.set(tenantType, {
                        healthy: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            const healthyTenants = Array.from(this.tenantHealthStatus.entries())
                .filter(([tenant, status]) => status.healthy);

            console.log(`✅ DEBUG: Multi-tenant architecture initialized with ${healthyTenants.length} healthy tenants`);
            logger.info('Multi-tenant architecture initialized successfully', {
                totalTenants: this.tenantDatabases.size,
                healthyTenants: healthyTenants.length,
                tenantTypes: Array.from(this.tenantDatabases.keys())
            });

        } catch (error) {
            console.error('❌ DEBUG: Multi-tenant architecture initialization failed:', error.message);
            logger.error('Failed to initialize multi-tenant architecture', {
                error: error.message,
                stack: error.stack
            });
            
            throw new AppError('Multi-tenant initialization failed', 500, 'MULTI_TENANT_INIT_ERROR', {
                originalError: error.message
            });
        }
    }

    /**
     * Verify tenant health and collection availability
     * @private
     */
    async verifyTenantHealth(tenantType, connection, config) {
        console.log(`🔄 DEBUG: Starting health verification for tenant: ${tenantType}`);
        
        try {
            const healthStatus = {
                healthy: false,
                collections: {},
                totalCollections: 0,
                availableCollections: 0,
                errors: [],
                timestamp: new Date().toISOString()
            };

            // Test basic connectivity
            const collections = await connection.db.listCollections().toArray();
            const availableCollectionNames = collections.map(c => c.name);
            healthStatus.totalCollections = collections.length;

            console.log(`🔍 DEBUG: Available collections in ${tenantType}:`, availableCollectionNames.slice(0, 5));

            // Check each expected collection
            for (const expectedCollection of config.collections) {
                try {
                    const exists = availableCollectionNames.includes(expectedCollection);
                    
                    if (exists) {
                        const count = await connection.db.collection(expectedCollection).countDocuments({}, { limit: 1 });
                        
                        healthStatus.collections[expectedCollection] = {
                            exists: true,
                            accessible: true,
                            hasDocuments: count > 0
                        };
                        healthStatus.availableCollections++;
                        console.log(`✅ DEBUG: Collection ${expectedCollection} is accessible (${count} docs)`);
                    } else {
                        console.log(`⚠️  DEBUG: Collection ${expectedCollection} does not exist in ${tenantType}`);
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

            healthStatus.healthy = true; // Consider healthy if basic connectivity works

            console.log(`✅ DEBUG: Health verification completed for ${tenantType}. Healthy: ${healthStatus.healthy}`);
            return healthStatus;

        } catch (error) {
            console.error(`❌ DEBUG: Tenant health verification failed for ${tenantType}:`, error.message);
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Initialize shared services
     * @private
     */
    async initializeSharedServices() {
        try {
            console.log('🔄 DEBUG: Starting shared services initialization...');

            const serviceInitPromises = [];

            // Initialize Cache Service
            if (CacheService) {
                console.log('🔄 DEBUG: Initializing CacheService...');
                serviceInitPromises.push(
                    CacheService.getInstance().initialize?.()
                        .then(() => {
                            console.log('✅ DEBUG: CacheService initialized successfully');
                        })
                        .catch(error => {
                            console.error('❌ DEBUG: CacheService initialization failed:', error.message);
                            logger.warn('CacheService initialization failed', { error: error.message });
                        })
                );
            }

            // Initialize Payment Service
            if (PaymentService) {
                console.log('🔄 DEBUG: Initializing PaymentService...');
                serviceInitPromises.push(
                    PaymentService.initialize?.()
                        .then(() => {
                            console.log('✅ DEBUG: PaymentService initialized successfully');
                        })
                        .catch(error => {
                            console.error('❌ DEBUG: PaymentService initialization failed:', error.message);
                            logger.warn('PaymentService initialization failed', { error: error.message });
                        })
                );
            }

            // Initialize Email Service
            if (EmailService) {
                console.log('🔄 DEBUG: Initializing EmailService...');
                serviceInitPromises.push(
                    EmailService.initialize?.()
                        .then(() => {
                            console.log('✅ DEBUG: EmailService initialized successfully');
                        })
                        .catch(error => {
                            console.error('❌ DEBUG: EmailService initialization failed:', error.message);
                            logger.warn('EmailService initialization failed', { error: error.message });
                        })
                );
            }

            // Initialize File Service
            if (FileService) {
                console.log('🔄 DEBUG: Initializing FileService...');
                serviceInitPromises.push(
                    FileService.initialize?.()
                        .then(() => {
                            console.log('✅ DEBUG: FileService initialized successfully');
                        })
                        .catch(error => {
                            console.error('❌ DEBUG: FileService initialization failed:', error.message);
                            logger.warn('FileService initialization failed', { error: error.message });
                        })
                );
            }

            // Wait for all services to initialize (with timeout)
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Service initialization timeout')), 30000)
            );

            await Promise.race([
                Promise.allSettled(serviceInitPromises),
                timeout
            ]);

            console.log('✅ DEBUG: Shared services initialization completed');
            logger.info('Shared services initialization completed', {
                cacheService: !!CacheService,
                paymentService: !!PaymentService,
                emailService: !!EmailService,
                fileService: !!FileService
            });

        } catch (error) {
            console.error('❌ DEBUG: Shared services initialization failed:', error.message);
            logger.warn('Some shared services failed to initialize, continuing with available services', {
                error: error.message
            });
            // Don't throw - allow server to start with partially initialized services
        }
    }

    /**
     * Initialize WebSocket server for real-time communication
     * @private
     */
    async initializeWebSocketServer() {
        try {
            console.log('🔄 DEBUG: Creating WebSocket server...');
            
            this.wsServer = new WebSocket.Server({ 
                server: this.server,
                path: '/ws',
                clientTracking: true,
                maxPayload: 16 * 1024 * 1024, // 16MB
                perMessageDeflate: {
                    zlibDeflateOptions: {
                        threshold: 1024,
                        concurrencyLimit: 10,
                        chunkSize: 1024
                    }
                }
            });

            // WebSocket connection handler
            this.wsServer.on('connection', (ws, req) => {
                const connectionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                
                console.log(`🔌 DEBUG: New WebSocket connection: ${connectionId} from ${clientIP}`);
                
                // Store connection
                this.wsConnections.set(connectionId, {
                    ws,
                    connectionId,
                    clientIP,
                    connectedAt: new Date(),
                    userId: null,
                    organizationId: null,
                    tenantId: null,
                    subscriptions: new Set()
                });

                // Connection setup
                ws.connectionId = connectionId;
                ws.isAlive = true;

                // Send welcome message
                ws.send(JSON.stringify({
                    type: 'connection',
                    status: 'connected',
                    connectionId,
                    timestamp: new Date().toISOString(),
                    server: 'customer-services'
                }));

                // Message handler
                ws.on('message', (message) => {
                    try {
                        console.log(`📨 DEBUG: WebSocket message received on ${connectionId}:`, message.toString().substring(0, 100));
                        
                        const data = JSON.parse(message);
                        this.handleWebSocketMessage(connectionId, data);
                    } catch (error) {
                        console.error(`❌ DEBUG: WebSocket message parse error on ${connectionId}:`, error.message);
                        ws.send(JSON.stringify({
                            type: 'error',
                            error: 'Invalid message format',
                            timestamp: new Date().toISOString()
                        }));
                    }
                });

                // Pong handler for heartbeat
                ws.on('pong', () => {
                    ws.isAlive = true;
                    if (process.env.DEBUG_WEBSOCKETS === 'true') {
                        console.log(`💓 DEBUG: Pong received from ${connectionId}`);
                    }
                });

                // Close handler
                ws.on('close', (code, reason) => {
                    console.log(`🔌 DEBUG: WebSocket connection closed: ${connectionId}, code: ${code}, reason: ${reason}`);
                    this.wsConnections.delete(connectionId);
                });

                // Error handler
                ws.on('error', (error) => {
                    console.error(`❌ DEBUG: WebSocket error on ${connectionId}:`, error.message);
                    this.wsConnections.delete(connectionId);
                });

                logger.info('WebSocket connection established', {
                    connectionId,
                    clientIP,
                    totalConnections: this.wsConnections.size
                });
            });

            // Setup heartbeat interval
            const heartbeatInterval = setInterval(() => {
                if (process.env.DEBUG_WEBSOCKETS === 'true') {
                    console.log(`💓 DEBUG: WebSocket heartbeat check (${this.wsConnections.size} connections)`);
                }

                this.wsServer.clients.forEach((ws) => {
                    if (!ws.isAlive) {
                        console.log(`💀 DEBUG: Terminating inactive WebSocket connection: ${ws.connectionId}`);
                        this.wsConnections.delete(ws.connectionId);
                        return ws.terminate();
                    }
                    
                    ws.isAlive = false;
                    ws.ping();
                });
            }, 30000); // 30 second heartbeat

            // Store interval for cleanup
            this.wsHeartbeatInterval = heartbeatInterval;

            // Error handler for WebSocket server
            this.wsServer.on('error', (error) => {
                console.error('❌ DEBUG: WebSocket server error:', error.message);
                logger.error('WebSocket server error', { error: error.message });
            });

            console.log('✅ DEBUG: WebSocket server initialized successfully');
            logger.info('WebSocket server initialized successfully', {
                path: '/ws',
                maxPayload: '16MB',
                perMessageDeflate: true
            });

        } catch (error) {
            console.error('❌ DEBUG: WebSocket server initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Handle WebSocket messages
     * @private
     */
    handleWebSocketMessage(connectionId, data) {
        const connection = this.wsConnections.get(connectionId);
        if (!connection) {
            console.error(`❌ DEBUG: Connection not found: ${connectionId}`);
            return;
        }

        const { ws } = connection;

        try {
            switch (data.type) {
                case 'authenticate':
                    this.handleWebSocketAuth(connectionId, data);
                    break;

                case 'subscribe':
                    this.handleWebSocketSubscribe(connectionId, data);
                    break;

                case 'unsubscribe':
                    this.handleWebSocketUnsubscribe(connectionId, data);
                    break;

                case 'ping':
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: new Date().toISOString()
                    }));
                    break;

                case 'business_update':
                    this.handleBusinessUpdate(connectionId, data);
                    break;

                default:
                    console.log(`📨 DEBUG: Unknown WebSocket message type: ${data.type}`);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: `Unknown message type: ${data.type}`,
                        timestamp: new Date().toISOString()
                    }));
                    break;
            }
        } catch (error) {
            console.error(`❌ DEBUG: Error handling WebSocket message:`, error.message);
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Message processing failed',
                timestamp: new Date().toISOString()
            }));
        }
    }

    /**
     * Handle WebSocket authentication
     * @private
     */
    async handleWebSocketAuth(connectionId, data) {
        const connection = this.wsConnections.get(connectionId);
        if (!connection) return;

        try {
            console.log(`🔐 DEBUG: WebSocket authentication for ${connectionId}`);
            
            // Here you would validate the token and extract user information
            // For now, using a simplified approach
            const { token } = data;
            
            if (token) {
                // Mock user data - in production, validate JWT token
                connection.userId = data.userId || 'authenticated_user';
                connection.organizationId = data.organizationId || null;
                connection.tenantId = data.tenantId || null;

                connection.ws.send(JSON.stringify({
                    type: 'auth_success',
                    userId: connection.userId,
                    organizationId: connection.organizationId,
                    tenantId: connection.tenantId,
                    timestamp: new Date().toISOString()
                }));

                console.log(`✅ DEBUG: WebSocket authentication successful for ${connectionId}`);
            } else {
                connection.ws.send(JSON.stringify({
                    type: 'auth_error',
                    error: 'Invalid token',
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (error) {
            console.error(`❌ DEBUG: WebSocket authentication error for ${connectionId}:`, error.message);
        }
    }

    /**
     * Handle WebSocket subscriptions
     * @private
     */
    handleWebSocketSubscribe(connectionId, data) {
        const connection = this.wsConnections.get(connectionId);
        if (!connection) return;

        try {
            const { channel } = data;
            console.log(`📡 DEBUG: WebSocket subscription to ${channel} for ${connectionId}`);
            
            connection.subscriptions.add(channel);
            
            connection.ws.send(JSON.stringify({
                type: 'subscribe_success',
                channel,
                timestamp: new Date().toISOString()
            }));

            logger.info('WebSocket subscription added', {
                connectionId,
                channel,
                totalSubscriptions: connection.subscriptions.size
            });
        } catch (error) {
            console.error(`❌ DEBUG: WebSocket subscription error:`, error.message);
        }
    }

    /**
     * Handle WebSocket unsubscriptions
     * @private
     */
    handleWebSocketUnsubscribe(connectionId, data) {
        const connection = this.wsConnections.get(connectionId);
        if (!connection) return;

        try {
            const { channel } = data;
            console.log(`📡 DEBUG: WebSocket unsubscription from ${channel} for ${connectionId}`);
            
            connection.subscriptions.delete(channel);
            
            connection.ws.send(JSON.stringify({
                type: 'unsubscribe_success',
                channel,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            console.error(`❌ DEBUG: WebSocket unsubscription error:`, error.message);
        }
    }

    /**
     * Handle business updates
     * @private
     */
    handleBusinessUpdate(connectionId, data) {
        try {
            console.log(`📊 DEBUG: Business update received from ${connectionId}:`, data.updateType);
            
            // Broadcast to relevant subscribers
            this.broadcastToSubscribers(`business_${data.updateType}`, {
                type: 'business_update',
                updateType: data.updateType,
                data: data.payload,
                timestamp: new Date().toISOString(),
                source: connectionId
            });

        } catch (error) {
            console.error(`❌ DEBUG: Business update error:`, error.message);
        }
    }

    /**
     * Broadcast message to subscribers of a channel
     * @private
     */
    broadcastToSubscribers(channel, message) {
        let subscriberCount = 0;
        
        this.wsConnections.forEach((connection) => {
            if (connection.subscriptions.has(channel)) {
                try {
                    connection.ws.send(JSON.stringify(message));
                    subscriberCount++;
                } catch (error) {
                    console.error(`❌ DEBUG: Broadcast error to ${connection.connectionId}:`, error.message);
                    // Remove failed connection
                    this.wsConnections.delete(connection.connectionId);
                }
            }
        });

        if (process.env.DEBUG_WEBSOCKETS === 'true') {
            console.log(`📡 DEBUG: Broadcast to ${subscriberCount} subscribers on channel ${channel}`);
        }
    }

    /**
     * Determine if SSL should be used
     * @private
     * @returns {boolean}
     */
    shouldUseSSL() {
        if (process.env.SERVICES_SSL_ENABLED === 'true') {
            console.log('✅ DEBUG: SSL enabled via environment variable');
            return true;
        }

        if (process.env.NODE_ENV === 'production' && process.env.SERVICES_FORCE_SSL !== 'false') {
            console.log('✅ DEBUG: SSL enabled for production environment');
            return true;
        }

        // Check for SSL certificate files
        const keyPath = process.env.SERVICES_SSL_KEY_PATH || './certs/key.pem';
        const certPath = process.env.SERVICES_SSL_CERT_PATH || './certs/cert.pem';

        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            console.log('✅ DEBUG: SSL certificates found, enabling SSL');
            return true;
        }

        console.log('🔓 DEBUG: SSL not required/configured, using HTTP');
        return false;
    }

    /**
     * Create HTTP server
     * @private
     */
    createHttpServer(app) {
        console.log('🔓 DEBUG: Creating HTTP server for customer services');
        logger.info('Creating HTTP server for customer services');
        return http.createServer(app);
    }

    /**
     * Create HTTPS server with enhanced security
     * @private
     */
    async createSecureHttpsServer(app) {
        try {
            console.log('🔒 DEBUG: Creating HTTPS server for customer services');
            
            const keyPath = path.resolve(process.cwd(), process.env.SERVICES_SSL_KEY_PATH || './certs/key.pem');
            const certPath = path.resolve(process.cwd(), process.env.SERVICES_SSL_CERT_PATH || './certs/cert.pem');

            if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
                throw new Error(`SSL certificates not found: key=${keyPath}, cert=${certPath}`);
            }

            const sslOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
                secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
                ciphers: process.env.SERVICES_SSL_CIPHERS || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256',
                honorCipherOrder: true,
                requestCert: false,
                rejectUnauthorized: false
            };

            // Add CA if configured
            const caPath = process.env.SERVICES_SSL_CA_PATH;
            if (caPath && fs.existsSync(caPath)) {
                sslOptions.ca = fs.readFileSync(caPath);
            }

            console.log('✅ DEBUG: HTTPS server configured with enhanced security');
            logger.info('Customer Services HTTPS server configured with enhanced security', {
                tlsVersion: 'TLS 1.2+',
                cipherSuite: 'High Security'
            });

            return https.createServer(sslOptions, app);
        } catch (error) {
            console.error('❌ DEBUG: Failed to create secure HTTPS server:', error.message);
            logger.error('Failed to create secure HTTPS server', { error: error.message });
            throw error;
        }
    }

    /**
     * Start server listening
     * @private
     */
    listen() {
        return new Promise((resolve, reject) => {
            const port = parseInt(process.env.SERVICES_PORT, 10) || 4002;
            const host = process.env.SERVICES_HOST || '0.0.0.0';

            console.log(`🔄 DEBUG: Starting customer services server on ${host}:${port}...`);

            this.server.listen(port, host, () => {
                const protocol = this.server instanceof https.Server ? 'HTTPS' : 'HTTP';
                
                console.log(`✅ DEBUG: Customer services server listening on ${protocol}://${host}:${port}`);
                resolve();
            });

            this.server.on('error', (error) => {
                console.error('❌ DEBUG: Server error:', error.message);
                
                if (error.code === 'EADDRINUSE') {
                    console.error(`❌ Port ${port} is already in use`);
                    logger.error(`Customer services port ${port} is already in use`);
                } else if (error.code === 'EACCES') {
                    console.error(`❌ Port ${port} requires elevated privileges`);
                    logger.error(`Customer services port ${port} requires elevated privileges`);
                } else {
                    logger.error('Customer services server error', { error: error.message });
                }
                reject(error);
            });
        });
    }

    /**
     * Setup connection handlers
     * @private
     */
    setupConnectionHandlers() {
        console.log('🔄 DEBUG: Setting up connection handlers...');
        
        this.server.on('connection', (socket) => {
            const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
            this.connections.set(connectionId, {
                socket,
                connectedAt: new Date(),
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort
            });

            console.log(`🔗 DEBUG: New connection: ${connectionId}`);
            logger.debug('New connection established', {
                connectionId,
                remoteAddress: socket.remoteAddress,
                totalConnections: this.connections.size
            });

            socket.on('close', () => {
                this.connections.delete(connectionId);
                console.log(`🔌 DEBUG: Connection closed: ${connectionId}`);
                logger.debug('Connection closed', {
                    connectionId,
                    remainingConnections: this.connections.size
                });
            });

            socket.on('error', (error) => {
                console.error(`❌ DEBUG: Socket error for ${connectionId}:`, error.message);
                logger.warn('Socket error', {
                    connectionId,
                    error: error.message
                });
            });
        });

        console.log('✅ DEBUG: Connection handlers setup completed');
    }

    /**
     * Setup business metrics tracking
     * @private
     */
    setupBusinessMetricsTracking() {
        try {
            console.log('🔄 DEBUG: Setting up business metrics tracking...');

            // Track business events
            this.on('user:registered', (data) => {
                this.businessMetrics.activeUsers++;
                console.log(`📊 DEBUG: User registered. Total active users: ${this.businessMetrics.activeUsers}`);
                this.broadcastMetricsUpdate('user_registered', data);
            });

            this.on('organization:created', (data) => {
                this.businessMetrics.totalOrganizations++;
                this.businessMetrics.activeTenants++;
                console.log(`📊 DEBUG: Organization created. Total: ${this.businessMetrics.totalOrganizations}`);
                this.broadcastMetricsUpdate('organization_created', data);
            });

            this.on('project:created', (data) => {
                this.businessMetrics.totalProjects++;
                console.log(`📊 DEBUG: Project created. Total: ${this.businessMetrics.totalProjects}`);
                this.broadcastMetricsUpdate('project_created', data);
            });

            this.on('job:posted', (data) => {
                this.businessMetrics.totalJobs++;
                console.log(`📊 DEBUG: Job posted. Total: ${this.businessMetrics.totalJobs}`);
                this.broadcastMetricsUpdate('job_posted', data);
            });

            this.on('candidate:registered', (data) => {
                this.businessMetrics.totalCandidates++;
                console.log(`📊 DEBUG: Candidate registered. Total: ${this.businessMetrics.totalCandidates}`);
                this.broadcastMetricsUpdate('candidate_registered', data);
            });

            this.on('consultant:onboarded', (data) => {
                this.businessMetrics.totalConsultants++;
                console.log(`📊 DEBUG: Consultant onboarded. Total: ${this.businessMetrics.totalConsultants}`);
                this.broadcastMetricsUpdate('consultant_onboarded', data);
            });

            // Metrics update interval
            setInterval(() => {
                if (process.env.DEBUG_REQUESTS === 'true') {
                    console.log('📊 DEBUG: Current business metrics:', this.businessMetrics);
                }
            }, 60000); // Every minute

            console.log('✅ DEBUG: Business metrics tracking setup completed');
            logger.info('Business metrics tracking initialized');

        } catch (error) {
            console.error('❌ DEBUG: Business metrics tracking setup failed:', error.message);
            logger.error('Failed to setup business metrics tracking', { error: error.message });
        }
    }

    /**
     * Broadcast metrics update via WebSocket
     * @private
     */
    broadcastMetricsUpdate(eventType, data) {
        if (this.wsServer && this.wsConnections.size > 0) {
            const message = {
                type: 'metrics_update',
                eventType,
                metrics: this.businessMetrics,
                data,
                timestamp: new Date().toISOString()
            };

            this.broadcastToSubscribers('metrics', message);
        }
    }

    /**
     * Log startup success with comprehensive information
     * @private
     */
    logStartupSuccess() {
        const protocol = this.server instanceof https.Server ? 'HTTPS' : 'HTTP';
        const port = process.env.SERVICES_PORT || 4002;
        const host = process.env.SERVICES_HOST || '0.0.0.0';

        logger.info('Customer Services Server started successfully', {
            protocol,
            host,
            port,
            url: `${protocol.toLowerCase()}://${host}:${port}`,
            environment: process.env.NODE_ENV,
            version: config.app?.version || '1.0.0',
            features: {
                multiTenant: process.env.MULTI_TENANT_ENABLED === 'true',
                websocket: process.env.WEBSOCKET_ENABLED === 'true',
                redis: process.env.REDIS_ENABLED === 'true',
                rateLimit: process.env.RATE_LIMIT_ENABLED === 'true',
                clustering: process.env.CLUSTER_ENABLED === 'true',
                paymentProcessor: process.env.PAYMENT_PROCESSOR,
                emailProvider: process.env.EMAIL_PROVIDER,
                fileStorageProvider: process.env.FILE_STORAGE_PROVIDER
            },
            database: {
                multiTenant: this.tenantDatabases.size > 0,
                tenantTypes: Array.from(this.tenantDatabases.keys()),
                healthyTenants: Array.from(this.tenantHealthStatus.values()).filter(s => s.healthy).length
            },
            services: {
                sessionManager: !!this.sessionManager,
                cacheService: !!CacheService,
                paymentService: !!PaymentService,
                emailService: !!EmailService,
                fileService: !!FileService
            },
            connections: {
                http: 0,
                websocket: 0
            }
        });

        // Console output for development
        console.log(`\n🚀 Customer Services Server Started Successfully`);
        console.log(`📍 URL: ${protocol.toLowerCase()}://${host}:${port}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
        console.log(`🏗️  Multi-Tenant: ${process.env.MULTI_TENANT_ENABLED === 'true' ? 'Enabled' : 'Disabled'} (${this.tenantDatabases.size} tenant types)`);
        console.log(`📡 WebSocket: ${process.env.WEBSOCKET_ENABLED === 'true' ? 'Enabled' : 'Disabled'} (ws://${host}:${port}/ws)`);
        console.log(`💾 Cache: ${process.env.REDIS_ENABLED === 'true' ? 'Redis' : 'Memory'}`);
        console.log(`💳 Payments: ${process.env.PAYMENT_PROCESSOR} ${PaymentService ? '(Ready)' : '(Disabled)'}`);
        console.log(`📧 Email: ${process.env.EMAIL_PROVIDER} ${EmailService ? '(Ready)' : '(Disabled)'}`);
        console.log(`📁 File Storage: ${process.env.FILE_STORAGE_PROVIDER} ${FileService ? '(Ready)' : '(Disabled)'}`);
        console.log(`🔒 Security: ${protocol} + Session Management + CORS + Rate Limiting`);
        console.log(`🔍 Health Check: ${protocol.toLowerCase()}://${host}:${port}/health`);
        console.log(`📊 Business API: ${protocol.toLowerCase()}://${host}:${port}/api/`);
        
        // Display tenant information
        if (this.tenantDatabases.size > 0) {
            console.log(`🏢 Tenant Types:`);
            for (const [tenantType, connection] of this.tenantDatabases) {
                const status = this.tenantHealthStatus.get(tenantType);
                console.log(`   - ${tenantType}: ${status?.healthy ? '✅' : '❌'} ${connection.db?.databaseName || 'Unknown DB'}`);
            }
        }

        console.log(`📈 Business Modules Available:`);
        console.log(`   - Core Business: /api/clients, /api/projects, /api/consultants, /api/engagements`);
        console.log(`   - Organizations: /api/organizations, /api/tenants, /api/subscriptions, /api/white-label`);
        console.log(`   - Recruitment: /api/jobs, /api/candidates, /api/applications, /api/partnerships`);
        console.log(`   - Real-time: WebSocket subscriptions for live updates`);

        if (process.env.NODE_ENV === 'development') {
            console.log(`🐛 Debug Features:`);
            console.log(`   - Request Debugging: ${process.env.DEBUG_REQUESTS === 'true' ? 'ON' : 'OFF'}`);
            console.log(`   - Database Debugging: ${process.env.DEBUG_DATABASE === 'true' ? 'ON' : 'OFF'}`);
            console.log(`   - WebSocket Debugging: ${process.env.DEBUG_WEBSOCKETS === 'true' ? 'ON' : 'OFF'}`);
        }
    }

    /**
     * Setup graceful shutdown handlers
     * @private
     */
    setupGracefulShutdown() {
        console.log('🔄 DEBUG: Setting up graceful shutdown handlers...');

        const shutdown = async (signal) => {
            if (this.isShuttingDown) {
                console.log('⚠️  DEBUG: Shutdown already in progress');
                return;
            }

            this.isShuttingDown = true;
            console.log(`🔄 DEBUG: Customer services server received ${signal}, starting graceful shutdown...`);
            logger.info(`Customer services server received ${signal}, starting graceful shutdown`);

            try {
                const shutdownInfo = {
                    signal,
                    uptime: process.uptime(),
                    activeConnections: this.connections.size,
                    wsConnections: this.wsConnections.size,
                    businessMetrics: this.businessMetrics,
                    shutdownInitiated: new Date().toISOString()
                };

                logger.info('Customer services server graceful shutdown initiated', shutdownInfo);

                // Stop accepting new connections
                this.server.close();

                // Close WebSocket server
                if (this.wsServer) {
                    console.log('🔄 DEBUG: Closing WebSocket server...');
                    this.wsServer.close();

                    // Close all WebSocket connections
                    this.wsConnections.forEach((connection) => {
                        try {
                            connection.ws.close(1001, 'Server shutting down');
                        } catch (error) {
                            console.error(`❌ DEBUG: Error closing WebSocket connection:`, error.message);
                        }
                    });

                    if (this.wsHeartbeatInterval) {
                        clearInterval(this.wsHeartbeatInterval);
                    }
                    console.log('✅ DEBUG: WebSocket server closed');
                }

                // Close all HTTP connections
                console.log('🔄 DEBUG: Closing HTTP connections...');
                for (const [id, conn] of this.connections) {
                    try {
                        conn.socket.destroy();
                    } catch (error) {
                        console.error(`❌ DEBUG: Error destroying connection ${id}:`, error.message);
                    }
                }
                console.log('✅ DEBUG: All connections closed');

                // Stop Express app
                console.log('🔄 DEBUG: Stopping Express app...');
                try {
                    if (app.stop && typeof app.stop === 'function') {
                        await app.stop();
                    }
                    console.log('✅ DEBUG: Express app stopped');
                } catch (appStopError) {
                    console.error('❌ DEBUG: Express app stop error:', appStopError.message);
                }

                // Close database connections
                console.log('🔄 DEBUG: Closing database connections...');
                try {
                    await Database.shutdown();
                    console.log('✅ DEBUG: Database connections closed');
                } catch (dbError) {
                    console.error('❌ DEBUG: Database shutdown error:', dbError.message);
                }

                // Cleanup shared services
                console.log('🔄 DEBUG: Cleaning up shared services...');
                try {
                    if (this.sessionManager && typeof this.sessionManager.cleanup === 'function') {
                        await this.sessionManager.cleanup();
                    }

                    if (CacheService && typeof CacheService.getInstance().cleanup === 'function') {
                        await CacheService.getInstance().cleanup();
                    }

                    if (PaymentService && typeof PaymentService.cleanup === 'function') {
                        await PaymentService.cleanup();
                    }

                    console.log('✅ DEBUG: Shared services cleaned up');
                } catch (cleanupError) {
                    console.error('❌ DEBUG: Service cleanup error:', cleanupError.message);
                }

                console.log('✅ DEBUG: Customer services server graceful shutdown completed');
                logger.info('Customer services server graceful shutdown completed', {
                    signal,
                    uptime: process.uptime(),
                    finalMetrics: this.businessMetrics
                });

                process.exit(0);
            } catch (error) {
                console.error('❌ DEBUG: Error during shutdown:', error.message);
                logger.error('Error during customer services shutdown', { error: error.message });
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
     * @private
     */
    setupErrorHandlers() {
        console.log('🔄 DEBUG: Setting up error handlers...');

        process.on('uncaughtException', async (error) => {
            console.error('❌ DEBUG: UNCAUGHT EXCEPTION:', error.message);
            console.error('❌ Stack:', error.stack);
            
            logger.error('Customer Services Server: Uncaught Exception', {
                error: error.message,
                stack: error.stack,
                businessMetrics: this.businessMetrics,
                connections: this.connections.size,
                wsConnections: this.wsConnections.size,
                timestamp: new Date().toISOString()
            });

            setTimeout(() => {
                console.log('💥 DEBUG: Forcing process exit due to uncaught exception');
                process.exit(1);
            }, 1000);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            console.error('❌ DEBUG: UNHANDLED REJECTION:', reason);
            
            const reasonString = reason instanceof Error ? reason.message : String(reason);
            const stack = reason instanceof Error ? reason.stack : undefined;
            
            logger.error('Customer Services Server: Unhandled Promise Rejection', {
                reason: reasonString,
                stack: stack,
                businessMetrics: this.businessMetrics,
                connections: this.connections.size,
                wsConnections: this.wsConnections.size,
                timestamp: new Date().toISOString()
            });
        });

        console.log('✅ DEBUG: Error handlers setup completed');
    }

    /**
     * Get server status
     */
    getStatus() {
        try {
            const uptime = this.startTime ? (new Date() - this.startTime) / 1000 : 0;

            return {
                server: {
                    running: !!this.server,
                    uptime,
                    startTime: this.startTime,
                    environment: process.env.NODE_ENV,
                    protocol: this.server instanceof https.Server ? 'HTTPS' : 'HTTP',
                    shuttingDown: this.isShuttingDown
                },
                connections: {
                    http: this.connections.size,
                    websocket: this.wsConnections.size,
                    details: {
                        httpConnections: Array.from(this.connections.keys()),
                        wsConnections: Array.from(this.wsConnections.keys())
                    }
                },
                tenants: {
                    enabled: process.env.MULTI_TENANT_ENABLED === 'true',
                    total: this.tenantDatabases.size,
                    healthy: Array.from(this.tenantHealthStatus.values()).filter(s => s.healthy).length,
                    types: Array.from(this.tenantDatabases.keys()),
                    status: Object.fromEntries(
                        Array.from(this.tenantHealthStatus.entries()).map(([type, status]) => 
                            [type, { healthy: status.healthy, error: status.error }]
                        )
                    )
                },
                features: {
                    websocket: process.env.WEBSOCKET_ENABLED === 'true',
                    rateLimit: process.env.RATE_LIMIT_ENABLED === 'true',
                    clustering: process.env.CLUSTER_ENABLED === 'true',
                    sessionManager: !!this.sessionManager
                },
                services: {
                    cache: !!CacheService,
                    payment: !!PaymentService,
                    email: !!EmailService,
                    file: !!FileService
                },
                businessMetrics: this.businessMetrics,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ DEBUG: Error getting server status:', error.message);
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// =============================================================================
// CLUSTER MANAGEMENT
// =============================================================================
if (process.env.CLUSTER_ENABLED === 'true' && cluster.isPrimary) {
    const numWorkers = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length;
    
    console.log(`🏭 DEBUG: Starting cluster with ${numWorkers} workers...`);
    logger.info('Starting customer services cluster', { workers: numWorkers });

    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    // Handle worker events
    cluster.on('online', (worker) => {
        console.log(`👷 DEBUG: Worker ${worker.process.pid} is online`);
        logger.info('Cluster worker online', { pid: worker.process.pid });
    });

    cluster.on('exit', (worker, code, signal) => {
        console.log(`👷 DEBUG: Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
        logger.warn('Cluster worker died', { 
            pid: worker.process.pid, 
            code, 
            signal 
        });
        
        if (!worker.exitedAfterDisconnect) {
            console.log('👷 DEBUG: Restarting worker...');
            cluster.fork();
        }
    });

    // Graceful shutdown for cluster
    process.on('SIGINT', () => {
        console.log('🛑 DEBUG: Cluster received SIGINT, shutting down workers...');
        
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
    });

    process.on('SIGTERM', () => {
        console.log('🛑 DEBUG: Cluster received SIGTERM, shutting down workers...');
        
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
    });

} else {
    // Worker process or single process mode
    const customerServer = new CustomerServicesServer();

    // Export server instance
    module.exports = customerServer;

    // Start server if run directly
    if (require.main === module || !cluster.isPrimary) {
        console.log('🚀 DEBUG: Starting customer services server as worker/main...');
        
        customerServer.start().catch((error) => {
            console.error('❌ DEBUG: Failed to start customer services server:', error.message);
            console.error('❌ Stack:', error.stack);
            
            logger.error('Failed to start customer services server', {
                error: error.message,
                stack: error.stack,
                process: cluster.isPrimary ? 'primary' : 'worker',
                pid: process.pid
            });
            
            process.exit(1);
        });
    }
}

// Export class for testing
module.exports.CustomerServicesServer = CustomerServicesServer;