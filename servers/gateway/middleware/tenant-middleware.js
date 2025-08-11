'use strict';

/**
 * @fileoverview Tenant Middleware - Multi-tenant isolation and management
 * @module servers/gateway/middleware/tenant-middleware
 * @requires events
 * @requires crypto
 * @requires jsonwebtoken
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { URL } = require('url');

/**
 * TenantMiddleware class provides comprehensive multi-tenant support for the API Gateway.
 * It handles tenant identification, isolation, routing, resource management, quota enforcement,
 * customization, and security. The middleware supports multiple tenant identification strategies
 * including subdomain, header, JWT token, API key, and custom resolvers. It ensures complete
 * data isolation, implements tenant-specific rate limiting, manages tenant configurations,
 * and provides extensive monitoring and auditing capabilities.
 * 
 * @class TenantMiddleware
 * @extends EventEmitter
 */
class TenantMiddleware extends EventEmitter {
    /**
     * Creates an instance of TenantMiddleware
     * @constructor
     * @param {Object} config - Tenant middleware configuration
     * @param {TenantManager} tenantManager - Tenant manager for tenant operations
     * @param {CacheManager} cacheManager - Cache manager for tenant data caching
     * @param {Logger} logger - Logger instance
     */
    constructor(config, tenantManager, cacheManager, logger) {
        super();
        this.config = config || {};
        this.tenantManager = tenantManager;
        this.cacheManager = cacheManager;
        this.logger = logger;
        this.isInitialized = false;
        
        // Tenant identification strategies
        this.identificationStrategies = {
            'subdomain': this.identifyBySubdomain.bind(this),
            'header': this.identifyByHeader.bind(this),
            'jwt': this.identifyByJWT.bind(this),
            'apikey': this.identifyByApiKey.bind(this),
            'path': this.identifyByPath.bind(this),
            'query': this.identifyByQuery.bind(this),
            'cookie': this.identifyByCookie.bind(this),
            'custom': this.identifyByCustom.bind(this)
        };
        
        // Default configuration
        this.defaultConfig = {
            enabled: config.enabled !== false,
            strategy: config.strategy || 'header',
            strategies: config.strategies || ['header', 'subdomain'],
            headerName: config.headerName || 'x-tenant-id',
            cookieName: config.cookieName || 'tenant-id',
            queryParam: config.queryParam || 'tenant',
            pathPattern: config.pathPattern || /^\/([^\/]+)\//,
            strictMode: config.strictMode !== false,
            cacheTTL: config.cacheTTL || 300000, // 5 minutes
            maxTenantsPerUser: config.maxTenantsPerUser || 10,
            isolationLevel: config.isolationLevel || 'strict',
            enableQuotas: config.enableQuotas !== false,
            enableCustomization: config.enableCustomization !== false,
            enableAuditing: config.enableAuditing !== false,
            ...config
        };
        
        // Tenant registry
        this.tenantRegistry = new Map();
        this.tenantCache = new Map();
        this.tenantConfigurations = new Map();
        
        // Tenant isolation settings
        this.isolationRules = new Map();
        this.crossTenantPolicies = new Map();
        this.dataPartitionStrategies = new Map();
        
        // Tenant quotas and limits
        this.tenantQuotas = new Map();
        this.quotaUsage = new Map();
        this.rateLimits = new Map();
        
        // Tenant customizations
        this.tenantCustomizations = new Map();
        this.tenantThemes = new Map();
        this.tenantFeatureFlags = new Map();
        
        // Tenant routing
        this.tenantRoutes = new Map();
        this.tenantServiceMappings = new Map();
        this.tenantLoadBalancers = new Map();
        
        // Security and permissions
        this.tenantSecurityPolicies = new Map();
        this.tenantPermissions = new Map();
        this.tenantApiKeys = new Map();
        
        // Tenant lifecycle hooks
        this.lifecycleHooks = {
            onTenantCreate: [],
            onTenantUpdate: [],
            onTenantDelete: [],
            onTenantActivate: [],
            onTenantDeactivate: [],
            onTenantSuspend: []
        };
        
        // Request context enrichment
        this.contextEnrichers = [];
        this.tenantResolvers = [];
        
        // Validation rules
        this.validationRules = new Map();
        this.tenantSchemas = new Map();
        
        // Monitoring and metrics
        this.tenantMetrics = new Map();
        this.tenantUsageTracking = new Map();
        
        // Audit logging
        this.auditLog = [];
        this.auditRetentionDays = config.auditRetentionDays || 90;
        
        // Statistics
        this.statistics = {
            totalRequests: 0,
            identifiedRequests: 0,
            unidentifiedRequests: 0,
            rejectedRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            quotaExceeded: 0,
            crossTenantAttempts: 0,
            tenantSwitches: 0,
            byTenant: {},
            byStrategy: {},
            errors: {
                identification: 0,
                validation: 0,
                quota: 0,
                permission: 0
            }
        };
        
        // Performance tracking
        this.performanceMetrics = new Map();
        this.performanceWindow = 60000; // 1 minute
        
        // Tenant status tracking
        this.tenantStatus = new Map();
        this.statusCheckInterval = null;
        
        // Data isolation tracking
        this.isolationViolations = [];
        this.isolationMonitoringEnabled = true;
        
        // Cleanup intervals
        this.cleanupInterval = null;
        this.monitoringInterval = null;
        
        // Master tenant support
        this.masterTenant = config.masterTenant || null;
        this.superAdminTenants = new Set(config.superAdminTenants || []);
    }

    /**
     * Initializes the tenant middleware
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('info', 'Tenant middleware already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing Tenant Middleware');
            
            // Load tenant registry
            await this.loadTenantRegistry();
            
            // Initialize isolation rules
            this.initializeIsolationRules();
            
            // Setup tenant quotas
            await this.setupTenantQuotas();
            
            // Load tenant configurations
            await this.loadTenantConfigurations();
            
            // Initialize security policies
            this.initializeSecurityPolicies();
            
            // Setup monitoring
            this.startMonitoring();
            
            // Setup cleanup
            this.startCleanup();
            
            // Start status checks
            this.startStatusChecks();
            
            this.isInitialized = true;
            this.emit('tenant:initialized');
            
            this.log('info', 'Tenant Middleware initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Tenant Middleware', error);
            throw error;
        }
    }

    /**
     * Identifies and validates tenant for request
     * @param {Object} options - Middleware options
     * @returns {Function} Express middleware function
     */
    identify(options = {}) {
        return async (req, res, next) => {
            const startTime = Date.now();
            
            if (!this.defaultConfig.enabled) {
                return next();
            }
            
            this.statistics.totalRequests++;
            
            try {
                // Check if already identified
                if (req.tenant && !options.force) {
                    this.statistics.identifiedRequests++;
                    return next();
                }
                
                // Identify tenant using configured strategies
                const tenant = await this.identifyTenant(req, options);
                
                if (!tenant) {
                    if (this.defaultConfig.strictMode) {
                        this.statistics.unidentifiedRequests++;
                        this.statistics.rejectedRequests++;
                        
                        return res.status(400).json({
                            error: 'Tenant identification required',
                            message: 'Unable to identify tenant for this request'
                        });
                    } else {
                        this.statistics.unidentifiedRequests++;
                        this.log('warn', 'Request without tenant identification', {
                            path: req.path,
                            method: req.method
                        });
                        return next();
                    }
                }
                
                // Validate tenant
                const validation = await this.validateTenant(tenant, req);
                if (!validation.valid) {
                    this.statistics.errors.validation++;
                    this.statistics.rejectedRequests++;
                    
                    return res.status(validation.statusCode || 403).json({
                        error: 'Tenant validation failed',
                        message: validation.message
                    });
                }
                
                // Check tenant status
                const status = await this.checkTenantStatus(tenant);
                if (!status.active) {
                    this.statistics.rejectedRequests++;
                    
                    return res.status(403).json({
                        error: 'Tenant inactive',
                        message: status.message || 'This tenant is currently inactive'
                    });
                }
                
                // Enrich request context with tenant information
                req.tenant = await this.enrichTenantContext(tenant, req);
                
                // Apply tenant customizations
                if (this.defaultConfig.enableCustomization) {
                    await this.applyTenantCustomizations(req, res);
                }
                
                // Check quotas
                if (this.defaultConfig.enableQuotas) {
                    const quotaCheck = await this.checkTenantQuotas(tenant, req);
                    if (!quotaCheck.allowed) {
                        this.statistics.quotaExceeded++;
                        this.statistics.errors.quota++;
                        
                        return res.status(429).json({
                            error: 'Quota exceeded',
                            message: quotaCheck.message,
                            retryAfter: quotaCheck.retryAfter
                        });
                    }
                }
                
                // Apply security policies
                const securityCheck = await this.applySecurityPolicies(tenant, req);
                if (!securityCheck.allowed) {
                    this.statistics.errors.permission++;
                    
                    return res.status(403).json({
                        error: 'Security policy violation',
                        message: securityCheck.message
                    });
                }
                
                // Track request
                this.trackTenantRequest(tenant, req);
                
                // Audit if enabled
                if (this.defaultConfig.enableAuditing) {
                    this.auditTenantAccess(tenant, req);
                }
                
                // Update statistics
                this.statistics.identifiedRequests++;
                this.updateTenantStatistics(tenant, Date.now() - startTime);
                
                // Set response headers
                res.setHeader('X-Tenant-ID', tenant.id);
                if (tenant.realm) {
                    res.setHeader('X-Tenant-Realm', tenant.realm);
                }
                
                this.emit('tenant:identified', { tenant: tenant.id, duration: Date.now() - startTime });
                
                next();
                
            } catch (error) {
                this.log('error', 'Tenant identification error', error);
                this.statistics.errors.identification++;
                
                if (this.defaultConfig.strictMode) {
                    return res.status(500).json({
                        error: 'Tenant identification error',
                        message: 'An error occurred during tenant identification'
                    });
                }
                
                next(error);
            }
        };
    }

    /**
     * Enforces tenant isolation
     * @param {Object} options - Isolation options
     * @returns {Function} Express middleware function
     */
    isolate(options = {}) {
        return async (req, res, next) => {
            if (!req.tenant) {
                return next();
            }
            
            try {
                // Apply isolation rules
                const isolationLevel = options.level || req.tenant.isolationLevel || this.defaultConfig.isolationLevel;
                
                switch (isolationLevel) {
                    case 'strict':
                        await this.applyStrictIsolation(req, res);
                        break;
                    case 'moderate':
                        await this.applyModerateIsolation(req, res);
                        break;
                    case 'relaxed':
                        await this.applyRelaxedIsolation(req, res);
                        break;
                    default:
                        this.log('warn', `Unknown isolation level: ${isolationLevel}`);
                }
                
                // Check for cross-tenant access attempts
                if (await this.detectCrossTenantAccess(req)) {
                    this.statistics.crossTenantAttempts++;
                    
                    if (!this.isCrossTenantAllowed(req)) {
                        this.logIsolationViolation(req);
                        
                        return res.status(403).json({
                            error: 'Cross-tenant access denied',
                            message: 'Access to resources from other tenants is not permitted'
                        });
                    }
                }
                
                // Set isolation headers
                res.setHeader('X-Tenant-Isolation', isolationLevel);
                res.setHeader('X-Content-Security-Policy', this.getTenantCSP(req.tenant));
                
                next();
                
            } catch (error) {
                this.log('error', 'Tenant isolation error', error);
                next(error);
            }
        };
    }

    /**
     * Loads tenant registry
     * @private
     * @async
     */
    async loadTenantRegistry() {
        // In production, load from database or external service
        // For now, load mock tenants
        const tenants = [
            {
                id: 'tenant-001',
                name: 'Acme Corporation',
                domain: 'acme.example.com',
                status: 'active',
                tier: 'enterprise',
                created: new Date('2024-01-01'),
                config: {
                    theme: 'dark',
                    locale: 'en-US',
                    timezone: 'America/New_York'
                }
            },
            {
                id: 'tenant-002',
                name: 'Beta Industries',
                domain: 'beta.example.com',
                status: 'active',
                tier: 'premium',
                created: new Date('2024-02-01'),
                config: {
                    theme: 'light',
                    locale: 'en-GB',
                    timezone: 'Europe/London'
                }
            }
        ];
        
        for (const tenant of tenants) {
            this.tenantRegistry.set(tenant.id, tenant);
            
            // Initialize tenant-specific structures
            this.tenantMetrics.set(tenant.id, {
                requests: 0,
                errors: 0,
                latency: [],
                bandwidth: 0
            });
            
            this.tenantStatus.set(tenant.id, {
                active: tenant.status === 'active',
                lastActive: Date.now(),
                health: 'healthy'
            });
        }
        
        this.log('info', `Loaded ${this.tenantRegistry.size} tenants`);
    }

    /**
     * Initializes isolation rules
     * @private
     */
    initializeIsolationRules() {
        // Database isolation
        this.isolationRules.set('database', {
            strategy: 'schema', // schema, database, row-level
            enforced: true,
            crossTenantQueries: false
        });
        
        // API isolation
        this.isolationRules.set('api', {
            pathPrefix: true,
            headerValidation: true,
            responseFiltering: true
        });
        
        // Cache isolation
        this.isolationRules.set('cache', {
            keyPrefix: true,
            namespace: true,
            ttlPerTenant: true
        });
        
        // File storage isolation
        this.isolationRules.set('storage', {
            bucketStrategy: 'per-tenant',
            pathIsolation: true,
            crossTenantAccess: false
        });
        
        this.log('info', 'Isolation rules initialized');
    }

    /**
     * Sets up tenant quotas
     * @private
     * @async
     */
    async setupTenantQuotas() {
        // Define quota tiers
        const quotaTiers = {
            free: {
                requests: { daily: 1000, monthly: 10000 },
                storage: { gb: 1 },
                bandwidth: { gb: 10 },
                users: { max: 5 },
                apiKeys: { max: 2 }
            },
            premium: {
                requests: { daily: 10000, monthly: 200000 },
                storage: { gb: 10 },
                bandwidth: { gb: 100 },
                users: { max: 50 },
                apiKeys: { max: 10 }
            },
            enterprise: {
                requests: { daily: -1, monthly: -1 }, // Unlimited
                storage: { gb: 100 },
                bandwidth: { gb: 1000 },
                users: { max: -1 }, // Unlimited
                apiKeys: { max: -1 } // Unlimited
            }
        };
        
        // Assign quotas to tenants
        for (const [tenantId, tenant] of this.tenantRegistry) {
            const tier = tenant.tier || 'free';
            const quotas = quotaTiers[tier] || quotaTiers.free;
            
            this.tenantQuotas.set(tenantId, quotas);
            
            // Initialize usage tracking
            this.quotaUsage.set(tenantId, {
                requests: { daily: 0, monthly: 0 },
                storage: { current: 0 },
                bandwidth: { daily: 0, monthly: 0 },
                users: { current: 0 },
                apiKeys: { current: 0 },
                lastReset: {
                    daily: Date.now(),
                    monthly: Date.now()
                }
            });
        }
        
        this.log('info', 'Tenant quotas configured');
    }

    /**
     * Loads tenant configurations
     * @private
     * @async
     */
    async loadTenantConfigurations() {
        for (const [tenantId, tenant] of this.tenantRegistry) {
            const config = {
                ...this.defaultConfig,
                ...tenant.config,
                features: await this.loadTenantFeatures(tenantId),
                routes: await this.loadTenantRoutes(tenantId),
                services: await this.loadTenantServices(tenantId)
            };
            
            this.tenantConfigurations.set(tenantId, config);
            
            // Load customizations
            if (tenant.config?.theme) {
                this.tenantThemes.set(tenantId, tenant.config.theme);
            }
            
            // Load feature flags
            this.tenantFeatureFlags.set(tenantId, config.features || {});
        }
        
        this.log('info', 'Tenant configurations loaded');
    }

    /**
     * Initializes security policies
     * @private
     */
    initializeSecurityPolicies() {
        // Default security policy
        const defaultPolicy = {
            authentication: {
                required: true,
                methods: ['jwt', 'apikey'],
                mfa: false
            },
            authorization: {
                model: 'rbac', // rbac, abac, custom
                defaultRole: 'viewer'
            },
            encryption: {
                atRest: true,
                inTransit: true,
                algorithm: 'AES-256-GCM'
            },
            cors: {
                enabled: true,
                origins: ['*'],
                credentials: true
            },
            rateLimit: {
                enabled: true,
                window: 60000,
                max: 100
            }
        };
        
        // Apply default policy to all tenants
        for (const tenantId of this.tenantRegistry.keys()) {
            const tenantPolicy = {
                ...defaultPolicy,
                ...this.tenantRegistry.get(tenantId).securityPolicy
            };
            
            this.tenantSecurityPolicies.set(tenantId, tenantPolicy);
        }
        
        this.log('info', 'Security policies initialized');
    }

    /**
     * Identifies tenant from request
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} options - Identification options
     * @returns {Promise<Object|null>} Tenant object or null
     */
    async identifyTenant(req, options) {
        const strategies = options.strategies || this.defaultConfig.strategies;
        
        // Check cache first
        const cacheKey = this.getTenantCacheKey(req);
        const cached = this.tenantCache.get(cacheKey);
        
        if (cached && Date.now() < cached.expiry) {
            this.statistics.cacheHits++;
            return cached.tenant;
        }
        
        this.statistics.cacheMisses++;
        
        // Try each strategy in order
        for (const strategyName of strategies) {
            const strategy = this.identificationStrategies[strategyName];
            
            if (strategy) {
                const tenantId = await strategy(req, options);
                
                if (tenantId) {
                    const tenant = await this.getTenant(tenantId);
                    
                    if (tenant) {
                        // Update statistics
                        this.statistics.byStrategy[strategyName] = 
                            (this.statistics.byStrategy[strategyName] || 0) + 1;
                        
                        // Cache the result
                        this.tenantCache.set(cacheKey, {
                            tenant,
                            expiry: Date.now() + this.defaultConfig.cacheTTL
                        });
                        
                        return tenant;
                    }
                }
            }
        }
        
        // Try custom resolvers
        for (const resolver of this.tenantResolvers) {
            const tenant = await resolver(req);
            if (tenant) {
                return tenant;
            }
        }
        
        return null;
    }

    /**
     * Tenant identification strategies
     */
    
    async identifyBySubdomain(req) {
        const host = req.hostname || req.headers.host;
        if (!host) return null;
        
        const subdomain = host.split('.')[0];
        
        // Look up tenant by subdomain
        for (const [tenantId, tenant] of this.tenantRegistry) {
            if (tenant.subdomain === subdomain || 
                tenant.domain === host) {
                return tenantId;
            }
        }
        
        return null;
    }
    
    async identifyByHeader(req) {
        const tenantId = req.headers[this.defaultConfig.headerName.toLowerCase()];
        return tenantId || null;
    }
    
    async identifyByJWT(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        
        try {
            const token = authHeader.substring(7);
            const decoded = jwt.decode(token);
            return decoded?.tenantId || decoded?.tid || null;
        } catch (error) {
            this.log('debug', 'JWT tenant extraction failed', error);
            return null;
        }
    }
    
    async identifyByApiKey(req) {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (!apiKey) return null;
        
        // Look up tenant by API key
        for (const [tenantId, keys] of this.tenantApiKeys) {
            if (keys.has(apiKey)) {
                return tenantId;
            }
        }
        
        return null;
    }
    
    async identifyByPath(req) {
        const matches = req.path.match(this.defaultConfig.pathPattern);
        return matches ? matches[1] : null;
    }
    
    async identifyByQuery(req) {
        return req.query[this.defaultConfig.queryParam] || null;
    }
    
    async identifyByCookie(req) {
        return req.cookies?.[this.defaultConfig.cookieName] || null;
    }
    
    async identifyByCustom(req, options) {
        if (options.customIdentifier) {
            return await options.customIdentifier(req);
        }
        return null;
    }

    /**
     * Gets tenant by ID
     * @private
     * @async
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object|null>} Tenant object
     */
    async getTenant(tenantId) {
        // Check registry
        let tenant = this.tenantRegistry.get(tenantId);
        
        if (!tenant && this.tenantManager) {
            // Try to load from tenant manager
            tenant = await this.tenantManager.getTenant(tenantId);
            
            if (tenant) {
                // Cache in registry
                this.tenantRegistry.set(tenantId, tenant);
            }
        }
        
        return tenant;
    }

    /**
     * Validates tenant
     * @private
     * @async
     * @param {Object} tenant - Tenant object
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Validation result
     */
    async validateTenant(tenant, req) {
        // Check if tenant exists
        if (!tenant) {
            return {
                valid: false,
                message: 'Tenant not found',
                statusCode: 404
            };
        }
        
        // Check tenant status
        if (tenant.status === 'suspended') {
            return {
                valid: false,
                message: 'Tenant is suspended',
                statusCode: 403
            };
        }
        
        if (tenant.status === 'deleted') {
            return {
                valid: false,
                message: 'Tenant has been deleted',
                statusCode: 404
            };
        }
        
        // Check expiration
        if (tenant.expiresAt && new Date(tenant.expiresAt) < new Date()) {
            return {
                valid: false,
                message: 'Tenant subscription has expired',
                statusCode: 403
            };
        }
        
        // Check IP restrictions
        if (tenant.ipWhitelist && tenant.ipWhitelist.length > 0) {
            const clientIp = req.ip;
            if (!tenant.ipWhitelist.includes(clientIp)) {
                return {
                    valid: false,
                    message: 'Access denied from this IP address',
                    statusCode: 403
                };
            }
        }
        
        // Check custom validation rules
        const customRules = this.validationRules.get(tenant.id);
        if (customRules) {
            for (const rule of customRules) {
                const result = await rule(tenant, req);
                if (!result.valid) {
                    return result;
                }
            }
        }
        
        return { valid: true };
    }

    /**
     * Checks tenant status
     * @private
     * @async
     * @param {Object} tenant - Tenant object
     * @returns {Promise<Object>} Status result
     */
    async checkTenantStatus(tenant) {
        const status = this.tenantStatus.get(tenant.id);
        
        if (!status) {
            return { active: true };
        }
        
        // Check health
        if (status.health === 'unhealthy') {
            return {
                active: false,
                message: 'Tenant is currently experiencing issues'
            };
        }
        
        // Check maintenance mode
        if (status.maintenance) {
            return {
                active: false,
                message: 'Tenant is under maintenance'
            };
        }
        
        return { active: status.active };
    }

    /**
     * Enriches tenant context
     * @private
     * @async
     * @param {Object} tenant - Tenant object
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Enriched tenant context
     */
    async enrichTenantContext(tenant, req) {
        const context = {
            ...tenant,
            configuration: this.tenantConfigurations.get(tenant.id),
            features: this.tenantFeatureFlags.get(tenant.id) || {},
            quotas: this.tenantQuotas.get(tenant.id),
            usage: this.quotaUsage.get(tenant.id),
            metadata: {
                identifiedBy: req.tenantIdentificationStrategy,
                identifiedAt: Date.now(),
                requestId: req.id
            }
        };
        
        // Apply context enrichers
        for (const enricher of this.contextEnrichers) {
            await enricher(context, req);
        }
        
        return context;
    }

    /**
     * Applies tenant customizations
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    async applyTenantCustomizations(req, res) {
        const tenant = req.tenant;
        if (!tenant) return;
        
        const customizations = this.tenantCustomizations.get(tenant.id);
        
        if (customizations) {
            // Apply request transformations
            if (customizations.requestTransform) {
                await customizations.requestTransform(req);
            }
            
            // Apply response transformations
            if (customizations.responseTransform) {
                const originalSend = res.send;
                res.send = function(data) {
                    const transformed = customizations.responseTransform(data);
                    originalSend.call(res, transformed);
                };
            }
            
            // Apply headers
            if (customizations.headers) {
                Object.entries(customizations.headers).forEach(([key, value]) => {
                    res.setHeader(key, value);
                });
            }
        }
        
        // Apply theme
        const theme = this.tenantThemes.get(tenant.id);
        if (theme) {
            res.setHeader('X-Tenant-Theme', theme);
        }
    }

    /**
     * Checks tenant quotas
     * @private
     * @async
     * @param {Object} tenant - Tenant object
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Quota check result
     */
    async checkTenantQuotas(tenant, req) {
        const quotas = this.tenantQuotas.get(tenant.id);
        const usage = this.quotaUsage.get(tenant.id);
        
        if (!quotas || !usage) {
            return { allowed: true };
        }
        
        // Reset daily/monthly counters if needed
        this.resetQuotaCounters(tenant.id, usage);
        
        // Check request quota
        if (quotas.requests) {
            if (quotas.requests.daily > 0 && usage.requests.daily >= quotas.requests.daily) {
                return {
                    allowed: false,
                    message: 'Daily request quota exceeded',
                    retryAfter: this.getNextResetTime('daily')
                };
            }
            
            if (quotas.requests.monthly > 0 && usage.requests.monthly >= quotas.requests.monthly) {
                return {
                    allowed: false,
                    message: 'Monthly request quota exceeded',
                    retryAfter: this.getNextResetTime('monthly')
                };
            }
        }
        
        // Update usage
        usage.requests.daily++;
        usage.requests.monthly++;
        
        // Check bandwidth (estimate based on content-length)
        const bandwidth = parseInt(req.headers['content-length'] || '0');
        if (bandwidth > 0 && quotas.bandwidth) {
            usage.bandwidth.daily += bandwidth;
            usage.bandwidth.monthly += bandwidth;
            
            if (quotas.bandwidth.gb > 0) {
                const dailyGB = usage.bandwidth.daily / (1024 * 1024 * 1024);
                const monthlyGB = usage.bandwidth.monthly / (1024 * 1024 * 1024);
                
                if (dailyGB > quotas.bandwidth.gb || monthlyGB > quotas.bandwidth.gb * 30) {
                    return {
                        allowed: false,
                        message: 'Bandwidth quota exceeded'
                    };
                }
            }
        }
        
        return { allowed: true };
    }

    /**
     * Applies security policies
     * @private
     * @async
     * @param {Object} tenant - Tenant object
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Security check result
     */
    async applySecurityPolicies(tenant, req) {
        const policy = this.tenantSecurityPolicies.get(tenant.id);
        
        if (!policy) {
            return { allowed: true };
        }
        
        // Check authentication requirements
        if (policy.authentication?.required && !req.user) {
            return {
                allowed: false,
                message: 'Authentication required for this tenant'
            };
        }
        
        // Check MFA requirements
        if (policy.authentication?.mfa && req.user && !req.user.mfaVerified) {
            return {
                allowed: false,
                message: 'Multi-factor authentication required'
            };
        }
        
        // Check authorization
        if (policy.authorization && req.user) {
            const hasPermission = await this.checkTenantPermissions(
                tenant.id,
                req.user,
                req.method,
                req.path
            );
            
            if (!hasPermission) {
                return {
                    allowed: false,
                    message: 'Insufficient permissions for this operation'
                };
            }
        }
        
        // Check CORS
        if (policy.cors?.enabled) {
            const origin = req.headers.origin;
            if (origin && !this.isOriginAllowed(origin, policy.cors.origins)) {
                return {
                    allowed: false,
                    message: 'CORS policy violation'
                };
            }
        }
        
        return { allowed: true };
    }

    /**
     * Isolation enforcement methods
     */
    
    async applyStrictIsolation(req, res) {
        // Database isolation
        req.dbSchema = `tenant_${req.tenant.id}`;
        req.dbConnection = await this.getTenantDatabaseConnection(req.tenant.id);
        
        // Cache isolation
        req.cacheNamespace = `tenant:${req.tenant.id}`;
        
        // File storage isolation
        req.storageBucket = `tenant-${req.tenant.id}`;
        req.storagePath = `/tenants/${req.tenant.id}/`;
        
        // API isolation
        req.baseUrl = `/api/tenants/${req.tenant.id}`;
    }
    
    async applyModerateIsolation(req, res) {
        // Shared database with row-level security
        req.tenantFilter = { tenantId: req.tenant.id };
        
        // Shared cache with key prefixing
        req.cacheKeyPrefix = `t:${req.tenant.id}:`;
        
        // Shared storage with path isolation
        req.storagePath = `/shared/tenants/${req.tenant.id}/`;
    }
    
    async applyRelaxedIsolation(req, res) {
        // Minimal isolation - only logical separation
        req.tenantContext = req.tenant.id;
    }
    
    async detectCrossTenantAccess(req) {
        // Check if request is trying to access resources from another tenant
        const resourceTenant = this.extractResourceTenant(req);
        
        if (resourceTenant && resourceTenant !== req.tenant.id) {
            return true;
        }
        
        // Check for tenant ID in request body
        if (req.body?.tenantId && req.body.tenantId !== req.tenant.id) {
            return true;
        }
        
        // Check for tenant ID in query parameters
        if (req.query?.tenantId && req.query.tenantId !== req.tenant.id) {
            return true;
        }
        
        return false;
    }
    
    isCrossTenantAllowed(req) {
        // Check if user has super admin privileges
        if (this.superAdminTenants.has(req.tenant.id)) {
            return true;
        }
        
        // Check if specific cross-tenant policy exists
        const policy = this.crossTenantPolicies.get(req.tenant.id);
        if (policy) {
            return policy.allowed && policy.tenants.includes(req.targetTenant);
        }
        
        return false;
    }
    
    logIsolationViolation(req) {
        const violation = {
            timestamp: Date.now(),
            tenant: req.tenant.id,
            user: req.user?.id,
            path: req.path,
            method: req.method,
            targetTenant: req.targetTenant,
            type: 'cross-tenant-access'
        };
        
        this.isolationViolations.push(violation);
        
        this.emit('isolation:violation', violation);
        this.log('warn', 'Isolation violation detected', violation);
    }

    /**
     * Helper methods
     */
    
    getTenantCacheKey(req) {
        const parts = [
            req.hostname,
            req.headers[this.defaultConfig.headerName.toLowerCase()],
            req.user?.tenantId
        ].filter(Boolean);
        
        return crypto.createHash('sha256')
            .update(parts.join(':'))
            .digest('hex')
            .substring(0, 16);
    }
    
    getTenantCSP(tenant) {
        return "default-src 'self'; " +
               "script-src 'self' 'unsafe-inline'; " +
               "style-src 'self' 'unsafe-inline'; " +
               `frame-ancestors 'self' ${tenant.domain || '*'};`;
    }
    
    extractResourceTenant(req) {
        // Extract tenant ID from resource path
        const matches = req.path.match(/\/tenants\/([^\/]+)/);
        return matches ? matches[1] : null;
    }
    
    async getTenantDatabaseConnection(tenantId) {
        // In production, return actual database connection
        return `db-connection-${tenantId}`;
    }
    
    async checkTenantPermissions(tenantId, user, method, path) {
        const permissions = this.tenantPermissions.get(tenantId);
        if (!permissions) return true;
        
        const userPermissions = permissions[user.role] || permissions.default;
        if (!userPermissions) return false;
        
        const resource = `${method}:${path}`;
        return userPermissions.includes(resource) || userPermissions.includes('*');
    }
    
    isOriginAllowed(origin, allowedOrigins) {
        if (allowedOrigins.includes('*')) return true;
        
        return allowedOrigins.some(allowed => {
            if (allowed === origin) return true;
            if (allowed.includes('*')) {
                const pattern = allowed.replace(/\*/g, '.*');
                return new RegExp(pattern).test(origin);
            }
            return false;
        });
    }
    
    resetQuotaCounters(tenantId, usage) {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const oneMonthMs = 30 * oneDayMs;
        
        // Reset daily counters
        if (now - usage.lastReset.daily > oneDayMs) {
            usage.requests.daily = 0;
            usage.bandwidth.daily = 0;
            usage.lastReset.daily = now;
        }
        
        // Reset monthly counters
        if (now - usage.lastReset.monthly > oneMonthMs) {
            usage.requests.monthly = 0;
            usage.bandwidth.monthly = 0;
            usage.lastReset.monthly = now;
        }
    }
    
    getNextResetTime(period) {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const oneMonthMs = 30 * oneDayMs;
        
        if (period === 'daily') {
            const tomorrow = new Date(now + oneDayMs);
            tomorrow.setHours(0, 0, 0, 0);
            return Math.floor((tomorrow.getTime() - now) / 1000);
        } else if (period === 'monthly') {
            const nextMonth = new Date(now);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            nextMonth.setDate(1);
            nextMonth.setHours(0, 0, 0, 0);
            return Math.floor((nextMonth.getTime() - now) / 1000);
        }
        
        return 3600; // Default 1 hour
    }
    
    async loadTenantFeatures(tenantId) {
        // Load feature flags for tenant
        return {
            newUI: true,
            advancedAnalytics: false,
            apiV2: true
        };
    }
    
    async loadTenantRoutes(tenantId) {
        // Load custom routes for tenant
        return [];
    }
    
    async loadTenantServices(tenantId) {
        // Load service configurations for tenant
        return {};
    }
    
    trackTenantRequest(tenant, req) {
        // Update metrics
        const metrics = this.tenantMetrics.get(tenant.id);
        if (metrics) {
            metrics.requests++;
            metrics.lastActive = Date.now();
        }
        
        // Update usage tracking
        const usage = this.tenantUsageTracking.get(tenant.id);
        if (!usage) {
            this.tenantUsageTracking.set(tenant.id, new Map());
        }
        
        const hourKey = new Date().toISOString().substring(0, 13);
        const hourUsage = this.tenantUsageTracking.get(tenant.id);
        hourUsage.set(hourKey, (hourUsage.get(hourKey) || 0) + 1);
    }
    
    auditTenantAccess(tenant, req) {
        const auditEntry = {
            timestamp: Date.now(),
            tenantId: tenant.id,
            userId: req.user?.id,
            action: `${req.method} ${req.path}`,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            result: 'success'
        };
        
        this.auditLog.push(auditEntry);
        
        // Limit audit log size
        const maxEntries = 10000;
        if (this.auditLog.length > maxEntries) {
            this.auditLog = this.auditLog.slice(-maxEntries);
        }
        
        this.emit('tenant:audit', auditEntry);
    }
    
    updateTenantStatistics(tenant, duration) {
        // Update per-tenant statistics
        this.statistics.byTenant[tenant.id] = 
            (this.statistics.byTenant[tenant.id] || 0) + 1;
        
        // Update performance metrics
        if (!this.performanceMetrics.has(tenant.id)) {
            this.performanceMetrics.set(tenant.id, []);
        }
        
        const metrics = this.performanceMetrics.get(tenant.id);
        metrics.push({
            duration,
            timestamp: Date.now()
        });
        
        // Keep only recent metrics
        const cutoff = Date.now() - this.performanceWindow;
        this.performanceMetrics.set(
            tenant.id,
            metrics.filter(m => m.timestamp > cutoff)
        );
    }

    /**
     * Lifecycle methods
     */
    
    async createTenant(tenantData) {
        const tenantId = tenantData.id || crypto.randomBytes(16).toString('hex');
        
        const tenant = {
            ...tenantData,
            id: tenantId,
            created: Date.now(),
            status: 'active'
        };
        
        // Register tenant
        this.tenantRegistry.set(tenantId, tenant);
        
        // Initialize tenant structures
        await this.initializeTenantStructures(tenant);
        
        // Execute lifecycle hooks
        for (const hook of this.lifecycleHooks.onTenantCreate) {
            await hook(tenant);
        }
        
        this.emit('tenant:created', tenant);
        
        return tenant;
    }
    
    async updateTenant(tenantId, updates) {
        const tenant = this.tenantRegistry.get(tenantId);
        if (!tenant) {
            throw new Error(`Tenant not found: ${tenantId}`);
        }
        
        const updatedTenant = {
            ...tenant,
            ...updates,
            updated: Date.now()
        };
        
        this.tenantRegistry.set(tenantId, updatedTenant);
        
        // Clear cache
        this.clearTenantCache(tenantId);
        
        // Execute lifecycle hooks
        for (const hook of this.lifecycleHooks.onTenantUpdate) {
            await hook(updatedTenant, tenant);
        }
        
        this.emit('tenant:updated', updatedTenant);
        
        return updatedTenant;
    }
    
    async deleteTenant(tenantId) {
        const tenant = this.tenantRegistry.get(tenantId);
        if (!tenant) {
            throw new Error(`Tenant not found: ${tenantId}`);
        }
        
        // Mark as deleted (soft delete)
        tenant.status = 'deleted';
        tenant.deleted = Date.now();
        
        // Execute lifecycle hooks
        for (const hook of this.lifecycleHooks.onTenantDelete) {
            await hook(tenant);
        }
        
        // Clean up tenant structures
        await this.cleanupTenantStructures(tenantId);
        
        this.emit('tenant:deleted', tenant);
        
        return tenant;
    }
    
    async initializeTenantStructures(tenant) {
        const tenantId = tenant.id;
        
        // Initialize metrics
        this.tenantMetrics.set(tenantId, {
            requests: 0,
            errors: 0,
            latency: [],
            bandwidth: 0
        });
        
        // Initialize status
        this.tenantStatus.set(tenantId, {
            active: true,
            lastActive: Date.now(),
            health: 'healthy'
        });
        
        // Initialize quotas
        const tier = tenant.tier || 'free';
        this.tenantQuotas.set(tenantId, this.getQuotasByTier(tier));
        
        // Initialize usage
        this.quotaUsage.set(tenantId, {
            requests: { daily: 0, monthly: 0 },
            storage: { current: 0 },
            bandwidth: { daily: 0, monthly: 0 },
            users: { current: 0 },
            apiKeys: { current: 0 },
            lastReset: {
                daily: Date.now(),
                monthly: Date.now()
            }
        });
    }
    
    async cleanupTenantStructures(tenantId) {
        // Remove from all maps
        this.tenantRegistry.delete(tenantId);
        this.tenantCache.delete(tenantId);
        this.tenantConfigurations.delete(tenantId);
        this.tenantMetrics.delete(tenantId);
        this.tenantStatus.delete(tenantId);
        this.tenantQuotas.delete(tenantId);
        this.quotaUsage.delete(tenantId);
        this.tenantCustomizations.delete(tenantId);
        this.tenantThemes.delete(tenantId);
        this.tenantFeatureFlags.delete(tenantId);
        this.tenantSecurityPolicies.delete(tenantId);
        this.tenantPermissions.delete(tenantId);
        this.tenantApiKeys.delete(tenantId);
        this.performanceMetrics.delete(tenantId);
        this.tenantUsageTracking.delete(tenantId);
    }
    
    clearTenantCache(tenantId) {
        // Clear cache entries for tenant
        for (const [key, cached] of this.tenantCache) {
            if (cached.tenant?.id === tenantId) {
                this.tenantCache.delete(key);
            }
        }
    }
    
    getQuotasByTier(tier) {
        const quotaTiers = {
            free: {
                requests: { daily: 1000, monthly: 10000 },
                storage: { gb: 1 },
                bandwidth: { gb: 10 }
            },
            premium: {
                requests: { daily: 10000, monthly: 200000 },
                storage: { gb: 10 },
                bandwidth: { gb: 100 }
            },
            enterprise: {
                requests: { daily: -1, monthly: -1 },
                storage: { gb: 100 },
                bandwidth: { gb: 1000 }
            }
        };
        
        return quotaTiers[tier] || quotaTiers.free;
    }

    /**
     * Monitoring and maintenance
     */
    
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
            this.emit('tenant:metrics', this.getStatistics());
        }, 30000); // Every 30 seconds
        
        this.log('info', 'Tenant monitoring started');
    }
    
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            
            // Clean expired cache entries
            for (const [key, cached] of this.tenantCache) {
                if (cached.expiry < now) {
                    this.tenantCache.delete(key);
                }
            }
            
            // Clean old audit logs
            const retentionMs = this.auditRetentionDays * 24 * 60 * 60 * 1000;
            const cutoff = now - retentionMs;
            this.auditLog = this.auditLog.filter(entry => entry.timestamp > cutoff);
            
            // Clean old performance metrics
            const metricsCutoff = now - this.performanceWindow;
            for (const [tenantId, metrics] of this.performanceMetrics) {
                this.performanceMetrics.set(
                    tenantId,
                    metrics.filter(m => m.timestamp > metricsCutoff)
                );
            }
            
            // Clean old isolation violations
            this.isolationViolations = this.isolationViolations
                .filter(v => v.timestamp > cutoff);
                
        }, 3600000); // Every hour
        
        this.log('info', 'Tenant cleanup started');
    }
    
    startStatusChecks() {
        this.statusCheckInterval = setInterval(async () => {
            for (const [tenantId, tenant] of this.tenantRegistry) {
                await this.checkTenantHealth(tenantId);
            }
        }, 60000); // Every minute
        
        this.log('info', 'Tenant status checks started');
    }
    
    async checkTenantHealth(tenantId) {
        const status = this.tenantStatus.get(tenantId);
        if (!status) return;
        
        const metrics = this.tenantMetrics.get(tenantId);
        if (!metrics) return;
        
        // Check for recent activity
        const inactiveThreshold = 3600000; // 1 hour
        if (Date.now() - status.lastActive > inactiveThreshold) {
            status.health = 'idle';
        } else {
            status.health = 'healthy';
        }
        
        // Check error rate
        const errorRate = metrics.errors / (metrics.requests || 1);
        if (errorRate > 0.1) {
            status.health = 'unhealthy';
        }
    }
    
    collectMetrics() {
        // Calculate cache hit rate
        const totalCacheRequests = this.statistics.cacheHits + this.statistics.cacheMisses;
        if (totalCacheRequests > 0) {
            this.statistics.cacheHitRate = 
                (this.statistics.cacheHits / totalCacheRequests) * 100;
        }
    }

    /**
     * Public API methods
     */
    
    registerTenantResolver(resolver) {
        this.tenantResolvers.push(resolver);
        this.log('info', 'Tenant resolver registered');
    }
    
    registerContextEnricher(enricher) {
        this.contextEnrichers.push(enricher);
        this.log('info', 'Context enricher registered');
    }
    
    registerLifecycleHook(event, hook) {
        if (this.lifecycleHooks[event]) {
            this.lifecycleHooks[event].push(hook);
            this.log('info', `Lifecycle hook registered for ${event}`);
        }
    }
    
    setTenantCustomization(tenantId, customization) {
        this.tenantCustomizations.set(tenantId, customization);
    }
    
    setTenantFeatureFlags(tenantId, features) {
        this.tenantFeatureFlags.set(tenantId, features);
    }
    
    addValidationRule(tenantId, rule) {
        if (!this.validationRules.has(tenantId)) {
            this.validationRules.set(tenantId, []);
        }
        this.validationRules.get(tenantId).push(rule);
    }
    
    getStatistics() {
        return {
            ...this.statistics,
            activeTenants: this.tenantRegistry.size,
            cacheSize: this.tenantCache.size,
            auditLogSize: this.auditLog.length,
            isolationViolations: this.isolationViolations.length,
            tenantHealth: Object.fromEntries(
                Array.from(this.tenantStatus.entries()).map(([id, status]) => [
                    id,
                    status.health
                ])
            )
        };
    }
    
    getTenantMetrics(tenantId) {
        return {
            metrics: this.tenantMetrics.get(tenantId),
            usage: this.quotaUsage.get(tenantId),
            performance: this.performanceMetrics.get(tenantId),
            status: this.tenantStatus.get(tenantId)
        };
    }
    
    getAuditLog(tenantId, options = {}) {
        let logs = this.auditLog;
        
        if (tenantId) {
            logs = logs.filter(entry => entry.tenantId === tenantId);
        }
        
        if (options.from) {
            logs = logs.filter(entry => entry.timestamp >= options.from);
        }
        
        if (options.to) {
            logs = logs.filter(entry => entry.timestamp <= options.to);
        }
        
        if (options.limit) {
            logs = logs.slice(-options.limit);
        }
        
        return logs;
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger) {
            this.logger[level](message, data);
        } else {
            console[level](message, data);
        }
    }

    /**
     * Cleans up resources
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        this.log('info', 'Cleaning up Tenant Middleware');
        
        // Clear intervals
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
        
        // Clear all maps
        this.tenantRegistry.clear();
        this.tenantCache.clear();
        this.tenantConfigurations.clear();
        this.isolationRules.clear();
        this.crossTenantPolicies.clear();
        this.dataPartitionStrategies.clear();
        this.tenantQuotas.clear();
        this.quotaUsage.clear();
        this.rateLimits.clear();
        this.tenantCustomizations.clear();
        this.tenantThemes.clear();
        this.tenantFeatureFlags.clear();
        this.tenantRoutes.clear();
        this.tenantServiceMappings.clear();
        this.tenantLoadBalancers.clear();
        this.tenantSecurityPolicies.clear();
        this.tenantPermissions.clear();
        this.tenantApiKeys.clear();
        this.validationRules.clear();
        this.tenantSchemas.clear();
        this.tenantMetrics.clear();
        this.tenantUsageTracking.clear();
        this.performanceMetrics.clear();
        this.tenantStatus.clear();
        
        // Clear arrays
        this.contextEnrichers = [];
        this.tenantResolvers = [];
        this.auditLog = [];
        this.isolationViolations = [];
        
        // Clear lifecycle hooks
        Object.keys(this.lifecycleHooks).forEach(key => {
            this.lifecycleHooks[key] = [];
        });
        
        this.isInitialized = false;
        this.emit('tenant:cleanup');
    }
}

module.exports = { TenantMiddleware };