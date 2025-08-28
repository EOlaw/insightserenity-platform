/**
 * @file Tenant Context Middleware
 * @description Multi-tenant context management middleware for customer services
 *              Sets up tenant-specific database connections, configurations, and business rules
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 */

'use strict';

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const Database = require('../../../shared/lib/database');
const CacheService = require('../../../shared/lib/services/cache-service');

/**
 * Tenant Context Middleware
 * Establishes complete tenant context including:
 * - Database connection routing
 * - Feature flag configurations
 * - Business rule enforcement
 * - Resource access controls
 * - Subscription-based limitations
 * - Custom branding and configurations
 */
class TenantContextMiddleware {
    constructor(options = {}) {
        this.config = {
            enableDatabaseIsolation: options.enableDatabaseIsolation !== false,
            enableFeatureFlagIsolation: options.enableFeatureFlagIsolation !== false,
            enableResourceLimits: options.enableResourceLimits !== false,
            enableCustomizations: options.enableCustomizations !== false,
            cacheEnabled: options.cacheEnabled !== false,
            cacheTTL: options.cacheTTL || 600, // 10 minutes
            contextTimeout: options.contextTimeout || 5000,
            strictValidation: options.strictValidation === true,
            fallbackEnabled: options.fallbackEnabled !== false,
            defaultLimits: options.defaultLimits || {
                maxUsers: 100,
                maxProjects: 50,
                maxStorage: 1024 * 1024 * 1024, // 1GB
                maxApiCalls: 10000,
                maxConcurrentRequests: 100
            }
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.contextCache = new Map();
        this.connectionPool = new Map();
        this.featureFlagsCache = new Map();

        console.log('Tenant context middleware initialized');
        logger.info('Tenant context middleware initialized', {
            databaseIsolation: this.config.enableDatabaseIsolation,
            featureFlagIsolation: this.config.enableFeatureFlagIsolation,
            resourceLimits: this.config.enableResourceLimits,
            customizations: this.config.enableCustomizations
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    setupContext = async (req, res, next) => {
        const startTime = Date.now();
        
        try {
            console.log(`Setting up tenant context for tenant: ${req.tenantId || 'undefined'}`);

            // Ensure tenant detection has been completed
            if (!req.tenantId) {
                console.warn('Tenant context middleware called before tenant detection');
                if (this.config.strictValidation) {
                    return next(new AppError('Tenant context requires tenant detection', 400, 'MISSING_TENANT_CONTEXT'));
                }
                req.tenantId = 'default';
            }

            // Initialize tenant context object
            req.tenantContext = {
                tenantId: req.tenantId,
                tenant: req.tenant,
                organizationId: req.organizationId,
                setupTime: startTime,
                isIsolated: false,
                hasCustomizations: false,
                limits: { ...this.config.defaultLimits },
                features: new Map(),
                customizations: new Map(),
                databaseConnections: new Map(),
                businessRules: new Map(),
                settings: new Map(),
                metadata: new Map()
            };

            // Setup tenant-specific context
            await Promise.all([
                this.setupDatabaseContext(req),
                this.setupFeatureContext(req),
                this.setupResourceLimits(req),
                this.setupCustomizations(req),
                this.setupBusinessRules(req)
            ]);

            // Set response headers
            res.setHeader('X-Tenant-Context', 'initialized');
            res.setHeader('X-Tenant-Features', req.tenantContext.features.size.toString());
            res.setHeader('X-Tenant-Isolated', req.tenantContext.isIsolated.toString());

            const duration = Date.now() - startTime;
            console.log(`Tenant context setup completed in ${duration}ms for tenant: ${req.tenantId}`);

            logger.debug('Tenant context established', {
                tenantId: req.tenantId,
                organizationId: req.organizationId,
                duration,
                isolated: req.tenantContext.isIsolated,
                featureCount: req.tenantContext.features.size,
                hasCustomizations: req.tenantContext.hasCustomizations,
                path: req.path,
                method: req.method
            });

            next();
        } catch (error) {
            console.error(`Tenant context setup failed for tenant ${req.tenantId}:`, error.message);
            logger.error('Tenant context middleware error', {
                error: error.message,
                stack: error.stack,
                tenantId: req.tenantId,
                path: req.path,
                method: req.method,
                requestId: req.requestId
            });

            if (this.config.fallbackEnabled && !this.config.strictValidation) {
                // Setup minimal fallback context
                req.tenantContext = {
                    tenantId: req.tenantId || 'default',
                    tenant: req.tenant || null,
                    organizationId: req.organizationId || null,
                    setupTime: startTime,
                    isIsolated: false,
                    hasCustomizations: false,
                    limits: { ...this.config.defaultLimits },
                    features: new Map(),
                    customizations: new Map(),
                    databaseConnections: new Map(),
                    businessRules: new Map(),
                    settings: new Map(),
                    metadata: new Map(),
                    fallback: true,
                    error: error.message
                };

                res.setHeader('X-Tenant-Context', 'fallback');
                console.log(`Using fallback tenant context for tenant: ${req.tenantId}`);
                next();
            } else {
                next(new AppError('Tenant context setup failed', 500, 'TENANT_CONTEXT_ERROR', {
                    tenantId: req.tenantId,
                    originalError: error.message
                }));
            }
        }
    };

    /**
     * Setup database context and connections for tenant isolation
     * @param {Object} req - Express request object
     */
    async setupDatabaseContext(req) {
        if (!this.config.enableDatabaseIsolation) {
            console.log('Database isolation is disabled');
            return;
        }

        const { tenantId, organizationId } = req.tenantContext;
        console.log(`Setting up database context for tenant: ${tenantId}`);

        try {
            // Check cache first
            const cacheKey = `db_context:${tenantId}`;
            let dbContext = null;

            if (this.cache) {
                dbContext = await this.cache.get(cacheKey);
                if (dbContext) {
                    console.log(`Using cached database context for tenant: ${tenantId}`);
                    req.tenantContext.databaseConnections = new Map(Object.entries(dbContext.connections));
                    req.tenantContext.isIsolated = dbContext.isIsolated;
                    return;
                }
            }

            // Get tenant-specific database configuration
            if (organizationId) {
                // Load organization-specific database settings
                const Organization = await Database.getModel('Organization');
                const orgData = await Organization.findById(organizationId)
                    .select('settings.database subscription.tier status')
                    .lean();

                if (orgData && orgData.settings && orgData.settings.database) {
                    const dbSettings = orgData.settings.database;
                    
                    // Setup isolated connections based on subscription tier
                    if (dbSettings.isolated && orgData.subscription && orgData.subscription.tier !== 'free') {
                        console.log(`Setting up isolated database for tenant: ${tenantId}`);
                        
                        // Create tenant-specific connections for different data types
                        const connectionTypes = ['primary', 'analytics', 'files', 'audit'];
                        
                        for (const type of connectionTypes) {
                            if (dbSettings.connections && dbSettings.connections[type]) {
                                const connection = await Database.createTenantConnection(
                                    tenantId,
                                    type,
                                    dbSettings.connections[type]
                                );
                                
                                if (connection) {
                                    req.tenantContext.databaseConnections.set(type, connection);
                                    console.log(`Created ${type} connection for tenant: ${tenantId}`);
                                }
                            }
                        }

                        req.tenantContext.isIsolated = true;
                    }
                }
            }

            // Cache database context
            if (this.cache) {
                const contextToCache = {
                    connections: Object.fromEntries(req.tenantContext.databaseConnections),
                    isIsolated: req.tenantContext.isIsolated,
                    setupTime: Date.now()
                };
                await this.cache.set(cacheKey, contextToCache, this.config.cacheTTL);
            }

            console.log(`Database context setup completed for tenant: ${tenantId}, isolated: ${req.tenantContext.isIsolated}`);

        } catch (error) {
            console.error(`Database context setup failed for tenant ${tenantId}:`, error.message);
            logger.error('Database context setup failed', {
                tenantId,
                error: error.message,
                stack: error.stack
            });
            // Don't throw, continue with shared database
        }
    }

    /**
     * Setup feature flag context for tenant
     * @param {Object} req - Express request object
     */
    async setupFeatureContext(req) {
        if (!this.config.enableFeatureFlagIsolation) {
            console.log('Feature flag isolation is disabled');
            return;
        }

        const { tenantId, organizationId, tenant } = req.tenantContext;
        console.log(`Setting up feature context for tenant: ${tenantId}`);

        try {
            // Check cache first
            const cacheKey = `features:${tenantId}`;
            let features = null;

            if (this.featureFlagsCache.has(cacheKey)) {
                features = this.featureFlagsCache.get(cacheKey);
                console.log(`Using cached features for tenant: ${tenantId}`);
            } else if (this.cache) {
                features = await this.cache.get(cacheKey);
                if (features) {
                    this.featureFlagsCache.set(cacheKey, features);
                    console.log(`Loaded features from cache for tenant: ${tenantId}`);
                }
            }

            if (!features) {
                // Load tenant-specific feature flags
                features = new Map();

                // Default features based on subscription tier
                const subscriptionTier = tenant?.subscription?.tier || 'free';
                const defaultFeatures = this.getDefaultFeatures(subscriptionTier);
                
                for (const [feature, enabled] of Object.entries(defaultFeatures)) {
                    features.set(feature, enabled);
                }

                // Load custom feature overrides
                if (organizationId) {
                    try {
                        const Organization = await Database.getModel('Organization');
                        const orgData = await Organization.findById(organizationId)
                            .select('settings.features')
                            .lean();

                        if (orgData && orgData.settings && orgData.settings.features) {
                            for (const [feature, config] of Object.entries(orgData.settings.features)) {
                                if (typeof config === 'boolean') {
                                    features.set(feature, config);
                                } else if (config && typeof config === 'object') {
                                    features.set(feature, config.enabled === true);
                                    
                                    // Store additional feature configuration
                                    if (config.config) {
                                        req.tenantContext.metadata.set(`feature_config_${feature}`, config.config);
                                    }
                                }
                            }
                        }
                    } catch (featureError) {
                        console.error(`Failed to load custom features for tenant ${tenantId}:`, featureError.message);
                    }
                }

                // Cache features
                if (this.cache) {
                    const featureObj = Object.fromEntries(features);
                    await this.cache.set(cacheKey, featureObj, this.config.cacheTTL);
                    this.featureFlagsCache.set(cacheKey, featureObj);
                }
            }

            // Convert cached object back to Map if needed
            if (features && !(features instanceof Map)) {
                const featureMap = new Map();
                for (const [key, value] of Object.entries(features)) {
                    featureMap.set(key, value);
                }
                features = featureMap;
            }

            req.tenantContext.features = features || new Map();
            console.log(`Feature context setup completed for tenant: ${tenantId}, features: ${req.tenantContext.features.size}`);

        } catch (error) {
            console.error(`Feature context setup failed for tenant ${tenantId}:`, error.message);
            logger.error('Feature context setup failed', {
                tenantId,
                error: error.message,
                stack: error.stack
            });
            
            // Fallback to default features
            req.tenantContext.features = new Map(Object.entries(this.getDefaultFeatures('free')));
        }
    }

    /**
     * Setup resource limits for tenant
     * @param {Object} req - Express request object
     */
    async setupResourceLimits(req) {
        if (!this.config.enableResourceLimits) {
            console.log('Resource limits are disabled');
            return;
        }

        const { tenantId, tenant } = req.tenantContext;
        console.log(`Setting up resource limits for tenant: ${tenantId}`);

        try {
            // Get subscription-based limits
            const subscriptionTier = tenant?.subscription?.tier || 'free';
            const baseLimits = this.getSubscriptionLimits(subscriptionTier);

            // Apply base limits
            req.tenantContext.limits = { ...baseLimits };

            // Load custom limits if available
            if (tenant && tenant.settings && tenant.settings.limits) {
                const customLimits = tenant.settings.limits;
                
                // Only apply custom limits that don't exceed subscription maximums
                for (const [key, value] of Object.entries(customLimits)) {
                    if (baseLimits[key] !== undefined) {
                        // Apply the more restrictive limit
                        req.tenantContext.limits[key] = Math.min(value, baseLimits[key]);
                    }
                }
            }

            // Store current usage for rate limiting
            if (this.cache) {
                const usageKey = `usage:${tenantId}`;
                const currentUsage = await this.cache.get(usageKey) || {
                    apiCalls: 0,
                    storage: 0,
                    concurrentRequests: 0,
                    resetTime: Date.now() + 3600000 // 1 hour
                };

                req.tenantContext.currentUsage = currentUsage;
            }

            console.log(`Resource limits setup completed for tenant: ${tenantId}, tier: ${subscriptionTier}`);

        } catch (error) {
            console.error(`Resource limits setup failed for tenant ${tenantId}:`, error.message);
            logger.error('Resource limits setup failed', {
                tenantId,
                error: error.message
            });
            
            // Fallback to default limits
            req.tenantContext.limits = { ...this.config.defaultLimits };
        }
    }

    /**
     * Setup tenant customizations
     * @param {Object} req - Express request object
     */
    async setupCustomizations(req) {
        if (!this.config.enableCustomizations) {
            console.log('Customizations are disabled');
            return;
        }

        const { tenantId, tenant } = req.tenantContext;
        console.log(`Setting up customizations for tenant: ${tenantId}`);

        try {
            if (tenant && tenant.settings && tenant.settings.customizations) {
                const customizations = tenant.settings.customizations;

                // Process different types of customizations
                for (const [type, config] of Object.entries(customizations)) {
                    switch (type) {
                        case 'branding':
                            if (config.enabled) {
                                req.tenantContext.customizations.set('branding', {
                                    logo: config.logo,
                                    colors: config.colors,
                                    theme: config.theme,
                                    fonts: config.fonts
                                });
                                req.tenantContext.hasCustomizations = true;
                            }
                            break;

                        case 'labels':
                            if (config.enabled && config.labels) {
                                req.tenantContext.customizations.set('labels', config.labels);
                                req.tenantContext.hasCustomizations = true;
                            }
                            break;

                        case 'workflows':
                            if (config.enabled && config.workflows) {
                                req.tenantContext.customizations.set('workflows', config.workflows);
                                req.tenantContext.hasCustomizations = true;
                            }
                            break;

                        case 'integrations':
                            if (config.enabled && config.integrations) {
                                req.tenantContext.customizations.set('integrations', config.integrations);
                                req.tenantContext.hasCustomizations = true;
                            }
                            break;

                        default:
                            // Store unknown customization types as-is
                            if (config.enabled) {
                                req.tenantContext.customizations.set(type, config);
                                req.tenantContext.hasCustomizations = true;
                            }
                    }
                }
            }

            console.log(`Customizations setup completed for tenant: ${tenantId}, has customizations: ${req.tenantContext.hasCustomizations}`);

        } catch (error) {
            console.error(`Customizations setup failed for tenant ${tenantId}:`, error.message);
            logger.error('Customizations setup failed', {
                tenantId,
                error: error.message
            });
            // Continue without customizations
        }
    }

    /**
     * Setup business rules for tenant
     * @param {Object} req - Express request object
     */
    async setupBusinessRules(req) {
        const { tenantId, tenant } = req.tenantContext;
        console.log(`Setting up business rules for tenant: ${tenantId}`);

        try {
            // Default business rules
            const defaultRules = {
                'user_registration': { enabled: true, requireApproval: false },
                'project_creation': { enabled: true, requireApproval: false },
                'file_upload': { enabled: true, maxSize: 50 * 1024 * 1024 }, // 50MB
                'api_access': { enabled: true, rateLimit: 1000 },
                'data_export': { enabled: true, requireApproval: true },
                'integration_access': { enabled: false, requireApproval: true }
            };

            // Apply default rules
            for (const [rule, config] of Object.entries(defaultRules)) {
                req.tenantContext.businessRules.set(rule, config);
            }

            // Load custom business rules
            if (tenant && tenant.settings && tenant.settings.businessRules) {
                const customRules = tenant.settings.businessRules;
                
                for (const [rule, config] of Object.entries(customRules)) {
                    if (config && typeof config === 'object') {
                        req.tenantContext.businessRules.set(rule, config);
                    }
                }
            }

            // Apply subscription-based rule restrictions
            const subscriptionTier = tenant?.subscription?.tier || 'free';
            this.applySubscriptionRuleRestrictions(req.tenantContext.businessRules, subscriptionTier);

            console.log(`Business rules setup completed for tenant: ${tenantId}, rules: ${req.tenantContext.businessRules.size}`);

        } catch (error) {
            console.error(`Business rules setup failed for tenant ${tenantId}:`, error.message);
            logger.error('Business rules setup failed', {
                tenantId,
                error: error.message
            });
            // Continue with default rules
        }
    }

    /**
     * Get default features for subscription tier
     * @param {string} tier - Subscription tier
     * @returns {Object} Default features
     */
    getDefaultFeatures(tier) {
        const features = {
            'user_management': true,
            'project_creation': true,
            'basic_analytics': true,
            'email_notifications': true,
            'file_storage': true,
            'api_access': true,
            'mobile_access': true,
            'basic_integrations': false,
            'advanced_analytics': false,
            'custom_branding': false,
            'advanced_integrations': false,
            'priority_support': false,
            'custom_workflows': false,
            'advanced_security': false,
            'audit_logs': false,
            'white_label': false,
            'custom_domains': false,
            'sso': false,
            'advanced_permissions': false,
            'data_export': false
        };

        switch (tier) {
            case 'professional':
                features['basic_integrations'] = true;
                features['advanced_analytics'] = true;
                features['priority_support'] = true;
                features['data_export'] = true;
                break;

            case 'business':
                features['basic_integrations'] = true;
                features['advanced_analytics'] = true;
                features['custom_branding'] = true;
                features['priority_support'] = true;
                features['custom_workflows'] = true;
                features['audit_logs'] = true;
                features['data_export'] = true;
                features['advanced_permissions'] = true;
                break;

            case 'enterprise':
                Object.keys(features).forEach(key => {
                    features[key] = true;
                });
                break;
        }

        return features;
    }

    /**
     * Get subscription-based resource limits
     * @param {string} tier - Subscription tier
     * @returns {Object} Resource limits
     */
    getSubscriptionLimits(tier) {
        const baseLimits = {
            maxUsers: 5,
            maxProjects: 3,
            maxStorage: 100 * 1024 * 1024, // 100MB
            maxApiCalls: 1000,
            maxConcurrentRequests: 10,
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxIntegrations: 2
        };

        switch (tier) {
            case 'professional':
                baseLimits.maxUsers = 25;
                baseLimits.maxProjects = 15;
                baseLimits.maxStorage = 1024 * 1024 * 1024; // 1GB
                baseLimits.maxApiCalls = 10000;
                baseLimits.maxConcurrentRequests = 25;
                baseLimits.maxFileSize = 50 * 1024 * 1024; // 50MB
                baseLimits.maxIntegrations = 10;
                break;

            case 'business':
                baseLimits.maxUsers = 100;
                baseLimits.maxProjects = 50;
                baseLimits.maxStorage = 10 * 1024 * 1024 * 1024; // 10GB
                baseLimits.maxApiCalls = 50000;
                baseLimits.maxConcurrentRequests = 50;
                baseLimits.maxFileSize = 100 * 1024 * 1024; // 100MB
                baseLimits.maxIntegrations = 25;
                break;

            case 'enterprise':
                baseLimits.maxUsers = -1; // Unlimited
                baseLimits.maxProjects = -1; // Unlimited
                baseLimits.maxStorage = -1; // Unlimited
                baseLimits.maxApiCalls = -1; // Unlimited
                baseLimits.maxConcurrentRequests = 200;
                baseLimits.maxFileSize = 500 * 1024 * 1024; // 500MB
                baseLimits.maxIntegrations = -1; // Unlimited
                break;
        }

        return baseLimits;
    }

    /**
     * Apply subscription-based restrictions to business rules
     * @param {Map} businessRules - Business rules map
     * @param {string} tier - Subscription tier
     */
    applySubscriptionRuleRestrictions(businessRules, tier) {
        if (tier === 'free') {
            // Restrict advanced features for free tier
            businessRules.set('integration_access', { enabled: false });
            businessRules.set('advanced_workflows', { enabled: false });
            businessRules.set('custom_branding', { enabled: false });
            businessRules.set('priority_support', { enabled: false });
        } else if (tier === 'professional') {
            businessRules.set('integration_access', { enabled: true, maxIntegrations: 10 });
            businessRules.set('custom_branding', { enabled: false });
            businessRules.set('advanced_workflows', { enabled: true, maxWorkflows: 5 });
        } else if (tier === 'business') {
            businessRules.set('integration_access', { enabled: true, maxIntegrations: 25 });
            businessRules.set('custom_branding', { enabled: true });
            businessRules.set('advanced_workflows', { enabled: true, maxWorkflows: 20 });
        } else if (tier === 'enterprise') {
            // No restrictions for enterprise tier
            businessRules.set('integration_access', { enabled: true });
            businessRules.set('custom_branding', { enabled: true });
            businessRules.set('advanced_workflows', { enabled: true });
        }
    }

    /**
     * Clear context caches
     */
    clearCaches() {
        console.log('Clearing tenant context caches');
        this.contextCache.clear();
        this.featureFlagsCache.clear();
        if (this.cache) {
            // Clear relevant cache keys
            // This would be implemented based on cache service capabilities
        }
        logger.info('Tenant context caches cleared');
    }

    /**
     * Get context statistics
     * @returns {Object} Context statistics
     */
    getStatistics() {
        return {
            contextCacheSize: this.contextCache.size,
            featureFlagsCacheSize: this.featureFlagsCache.size,
            connectionPoolSize: this.connectionPool.size,
            config: {
                databaseIsolation: this.config.enableDatabaseIsolation,
                featureFlagIsolation: this.config.enableFeatureFlagIsolation,
                resourceLimits: this.config.enableResourceLimits,
                customizations: this.config.enableCustomizations
            }
        };
    }

    /**
     * Check if tenant has specific feature enabled
     * @param {Object} req - Express request object
     * @param {string} featureName - Feature name to check
     * @returns {boolean} Whether feature is enabled
     */
    static hasFeature(req, featureName) {
        if (!req.tenantContext || !req.tenantContext.features) {
            return false;
        }
        return req.tenantContext.features.get(featureName) === true;
    }

    /**
     * Check if tenant is within resource limits
     * @param {Object} req - Express request object
     * @param {string} resource - Resource type to check
     * @param {number} requested - Requested amount
     * @returns {boolean} Whether request is within limits
     */
    static withinLimits(req, resource, requested = 1) {
        if (!req.tenantContext || !req.tenantContext.limits) {
            return true; // Allow if no limits configured
        }

        const limit = req.tenantContext.limits[resource];
        if (limit === -1) {
            return true; // Unlimited
        }

        const currentUsage = req.tenantContext.currentUsage?.[resource] || 0;
        return (currentUsage + requested) <= limit;
    }

    /**
     * Get tenant customization
     * @param {Object} req - Express request object
     * @param {string} type - Customization type
     * @returns {*} Customization value or null
     */
    static getCustomization(req, type) {
        if (!req.tenantContext || !req.tenantContext.customizations) {
            return null;
        }
        return req.tenantContext.customizations.get(type) || null;
    }

    /**
     * Get business rule configuration
     * @param {Object} req - Express request object
     * @param {string} rule - Business rule name
     * @returns {*} Business rule configuration or null
     */
    static getBusinessRule(req, rule) {
        if (!req.tenantContext || !req.tenantContext.businessRules) {
            return null;
        }
        return req.tenantContext.businessRules.get(rule) || null;
    }
}

// Create singleton instance
const tenantContextMiddleware = new TenantContextMiddleware({
    enableDatabaseIsolation: process.env.TENANT_DB_ISOLATION === 'true',
    enableFeatureFlagIsolation: process.env.TENANT_FEATURE_ISOLATION !== 'false',
    enableResourceLimits: process.env.TENANT_RESOURCE_LIMITS !== 'false',
    enableCustomizations: process.env.TENANT_CUSTOMIZATIONS !== 'false',
    strictValidation: process.env.TENANT_STRICT_VALIDATION === 'true',
    cacheTTL: parseInt(process.env.TENANT_CONTEXT_CACHE_TTL, 10) || 600
});

module.exports = tenantContextMiddleware.setupContext;