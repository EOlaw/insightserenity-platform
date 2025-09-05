'use strict';

/**
 * @file Subscription Validation Middleware
 * @description Comprehensive subscription and billing validation middleware for customer services
 *              Enforces subscription-based access controls, usage limits, and feature restrictions
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 * @module insightserenity-platform/servers/customer-services/middleware/subscription-validation
 * @requires ../../../shared/lib/utils/logger
 * @requires ../../../shared/lib/utils/app-error
 * @requires ../../../shared/lib/database
 * @requires ../../../shared/lib/services/cache-service
 * @requires ../../../shared/lib/services/payment-service
 */

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const Database = require('../../../shared/lib/database');
const CacheService = require('../../../shared/lib/services/cache-service');
const PaymentService = require('../../../shared/lib/services/payment-service');

/**
 * Subscription Validation Middleware
 * Validates and enforces:
 * - Active subscription status
 * - Subscription tier limitations
 * - Usage quotas and limits
 * - Feature access permissions
 * - Payment method validity
 * - Trial period limitations
 * - Billing status checks
 * - Grace period handling
 */
class SubscriptionValidationMiddleware {
    constructor(options = {}) {
        this.config = {
            enabled: options.enabled !== false,
            strictMode: options.strictMode === true,
            allowTrials: options.allowTrials !== false,
            allowGracePeriod: options.allowGracePeriod !== false,
            cacheEnabled: options.cacheEnabled !== false,
            cacheTTL: options.cacheTTL || 300, // 5 minutes
            gracePeriodDays: options.gracePeriodDays || 7,
            trialPeriodDays: options.trialPeriodDays || 14,
            usageCheckInterval: options.usageCheckInterval || 3600000, // 1 hour
            quotaResetInterval: options.quotaResetInterval || 86400000, // 24 hours
            allowedEndpoints: options.allowedEndpoints || [
                '/health',
                '/ping',
                '/auth/login',
                '/auth/register',
                '/auth/logout',
                '/api/billing/subscription',
                '/api/billing/payment-methods',
                '/api/billing/invoices'
            ],
            freeAccessPatterns: options.freeAccessPatterns || [
                /^\/api\/auth\//,
                /^\/api\/billing\//,
                /^\/api\/account\/profile$/
            ]
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.payment = PaymentService ? PaymentService.getInstance() : null;

        // Subscription status cache
        this.subscriptionCache = new Map();
        this.usageCache = new Map();
        this.quotaCache = new Map();

        // Subscription tiers and their limits
        this.subscriptionTiers = {
            free: {
                name: 'Free',
                price: 0,
                limits: {
                    users: 3,
                    projects: 2,
                    storage: 100 * 1024 * 1024, // 100MB
                    apiCalls: 1000,
                    exports: 2,
                    integrations: 1,
                    customDomains: 0,
                    teamMembers: 1
                },
                features: {
                    basicReporting: true,
                    emailSupport: true,
                    mobileAccess: true,
                    basicIntegrations: false,
                    advancedReporting: false,
                    prioritySupport: false,
                    customBranding: false,
                    apiAccess: false,
                    webhooks: false,
                    sso: false,
                    auditLogs: false
                }
            },
            professional: {
                name: 'Professional',
                price: 29,
                limits: {
                    users: 25,
                    projects: 15,
                    storage: 1024 * 1024 * 1024, // 1GB
                    apiCalls: 10000,
                    exports: 50,
                    integrations: 10,
                    customDomains: 2,
                    teamMembers: 10
                },
                features: {
                    basicReporting: true,
                    emailSupport: true,
                    mobileAccess: true,
                    basicIntegrations: true,
                    advancedReporting: true,
                    prioritySupport: false,
                    customBranding: false,
                    apiAccess: true,
                    webhooks: true,
                    sso: false,
                    auditLogs: false
                }
            },
            business: {
                name: 'Business',
                price: 79,
                limits: {
                    users: 100,
                    projects: 50,
                    storage: 10 * 1024 * 1024 * 1024, // 10GB
                    apiCalls: 50000,
                    exports: 200,
                    integrations: 25,
                    customDomains: 10,
                    teamMembers: 50
                },
                features: {
                    basicReporting: true,
                    emailSupport: true,
                    mobileAccess: true,
                    basicIntegrations: true,
                    advancedReporting: true,
                    prioritySupport: true,
                    customBranding: true,
                    apiAccess: true,
                    webhooks: true,
                    sso: true,
                    auditLogs: true
                }
            },
            enterprise: {
                name: 'Enterprise',
                price: 199,
                limits: {
                    users: -1, // Unlimited
                    projects: -1, // Unlimited
                    storage: -1, // Unlimited
                    apiCalls: -1, // Unlimited
                    exports: -1, // Unlimited
                    integrations: -1, // Unlimited
                    customDomains: -1, // Unlimited
                    teamMembers: -1 // Unlimited
                },
                features: {
                    basicReporting: true,
                    emailSupport: true,
                    mobileAccess: true,
                    basicIntegrations: true,
                    advancedReporting: true,
                    prioritySupport: true,
                    customBranding: true,
                    apiAccess: true,
                    webhooks: true,
                    sso: true,
                    auditLogs: true
                }
            }
        };

        // Start background processes
        this.startUsageTracking();
        this.startQuotaReset();

        console.log('Subscription validation middleware initialized');
        logger.info('Subscription validation middleware initialized', {
            enabled: this.config.enabled,
            strictMode: this.config.strictMode,
            allowTrials: this.config.allowTrials,
            allowGracePeriod: this.config.allowGracePeriod,
            gracePeriodDays: this.config.gracePeriodDays,
            trialPeriodDays: this.config.trialPeriodDays
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    validate = async (req, res, next) => {
        if (!this.config.enabled) {
            return next();
        }

        try {
            console.log(`Validating subscription for ${req.method} ${req.path} (tenant: ${req.tenantId || 'default'})`);

            // Skip validation for allowed endpoints
            if (this.shouldSkipValidation(req)) {
                console.log(`Skipping subscription validation for ${req.path}`);
                return next();
            }

            // Get tenant/organization information
            const tenantId = req.tenantId || 'default';
            const organizationId = req.organizationId || req.user?.organizationId;

            if (!organizationId && tenantId !== 'default') {
                console.log(`No organization ID found for tenant ${tenantId}`);
                if (this.config.strictMode) {
                    return next(new AppError('Organization context required', 400, 'MISSING_ORGANIZATION'));
                }
                return next();
            }

            // Get subscription status
            const subscriptionStatus = await this.getSubscriptionStatus(organizationId || tenantId);

            // Validate subscription
            const validationResult = await this.validateSubscription(subscriptionStatus, req);

            if (!validationResult.valid) {
                return this.handleInvalidSubscription(validationResult, req, res, next);
            }

            // Check usage limits
            const usageValidation = await this.validateUsageLimits(subscriptionStatus, req);

            if (!usageValidation.valid) {
                return this.handleUsageLimitExceeded(usageValidation, req, res, next);
            }

            // Check feature access
            const featureValidation = await this.validateFeatureAccess(subscriptionStatus, req);

            if (!featureValidation.valid) {
                return this.handleFeatureRestricted(featureValidation, req, res, next);
            }

            // Attach subscription context to request
            req.subscription = {
                status: subscriptionStatus,
                tier: subscriptionStatus.tier,
                limits: this.subscriptionTiers[subscriptionStatus.tier]?.limits || {},
                features: this.subscriptionTiers[subscriptionStatus.tier]?.features || {},
                usage: usageValidation.usage,
                quotas: usageValidation.quotas,
                isValid: true,
                validatedAt: Date.now()
            };

            // Set response headers
            res.setHeader('X-Subscription-Tier', subscriptionStatus.tier);
            res.setHeader('X-Subscription-Status', subscriptionStatus.status);

            console.log(`Subscription validation passed for tenant ${tenantId}, tier: ${subscriptionStatus.tier}`);

            // Track usage for this request
            await this.trackUsage(organizationId || tenantId, req);

            next();
        } catch (error) {
            console.error(`Subscription validation failed for tenant ${req.tenantId}:`, error.message);
            logger.error('Subscription validation middleware error', {
                error: error.message,
                stack: error.stack,
                tenantId: req.tenantId,
                organizationId: req.organizationId,
                path: req.path,
                method: req.method,
                requestId: req.requestId
            });

            if (this.config.strictMode) {
                return next(new AppError('Subscription validation failed', 500, 'SUBSCRIPTION_VALIDATION_ERROR'));
            }

            // Fallback: continue with limited access
            req.subscription = {
                status: { tier: 'free', status: 'fallback' },
                tier: 'free',
                limits: this.subscriptionTiers.free.limits,
                features: this.subscriptionTiers.free.features,
                usage: {},
                quotas: {},
                isValid: false,
                fallback: true,
                error: error.message
            };

            next();
        }
    };

    /**
     * Check if validation should be skipped for this request
     * @param {Object} req - Express request object
     * @returns {boolean} Whether to skip validation
     */
    shouldSkipValidation(req) {
        const path = req.path;

        // Check allowed endpoints
        if (this.config.allowedEndpoints.includes(path)) {
            return true;
        }

        // Check free access patterns
        for (const pattern of this.config.freeAccessPatterns) {
            if (pattern.test(path)) {
                return true;
            }
        }

        // Skip for health checks and system endpoints
        if (path.startsWith('/_') || path === '/favicon.ico') {
            return true;
        }

        // Skip for non-authenticated users on public endpoints
        if (!req.user && (path.startsWith('/api/jobs') || path.startsWith('/api/public'))) {
            return true;
        }

        return false;
    }

    /**
     * Get subscription status for organization
     * @param {string} organizationId - Organization ID
     * @returns {Object} Subscription status
     */
    async getSubscriptionStatus(organizationId) {
        console.log(`Getting subscription status for organization: ${organizationId}`);

        // Check cache first
        const cacheKey = `subscription:${organizationId}`;
        if (this.subscriptionCache.has(cacheKey)) {
            console.log(`Using cached subscription status for ${organizationId}`);
            return this.subscriptionCache.get(cacheKey);
        }

        try {
            // Handle default tenant
            if (organizationId === 'default') {
                const defaultSubscription = {
                    id: 'default',
                    organizationId,
                    tier: 'free',
                    status: 'active',
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
                    isDefault: true
                };

                this.subscriptionCache.set(cacheKey, defaultSubscription);
                return defaultSubscription;
            }

            // Load from database
            const Organization = await Database.getModel('Organization');
            const organization = await Organization.findById(organizationId)
                .select('subscription billing createdAt')
                .lean();

            if (!organization) {
                throw new Error(`Organization not found: ${organizationId}`);
            }

            let subscriptionStatus = {
                id: organization.subscription?.id || null,
                organizationId,
                tier: organization.subscription?.tier || 'free',
                status: organization.subscription?.status || 'active',
                currentPeriodStart: organization.subscription?.currentPeriodStart || organization.createdAt,
                currentPeriodEnd: organization.subscription?.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                trialStart: organization.subscription?.trialStart || organization.createdAt,
                trialEnd: organization.subscription?.trialEnd || new Date(organization.createdAt.getTime() + this.config.trialPeriodDays * 24 * 60 * 60 * 1000),
                paymentMethodId: organization.billing?.paymentMethodId || null,
                lastPaymentDate: organization.billing?.lastPaymentDate || null,
                nextBillingDate: organization.subscription?.nextBillingDate || null,
                customLimits: organization.subscription?.customLimits || null
            };

            // Determine actual subscription status
            subscriptionStatus = this.determineSubscriptionStatus(subscriptionStatus);

            // Cache the result
            this.subscriptionCache.set(cacheKey, subscriptionStatus);
            setTimeout(() => this.subscriptionCache.delete(cacheKey), this.config.cacheTTL * 1000);

            console.log(`Loaded subscription status for ${organizationId}: ${subscriptionStatus.tier} (${subscriptionStatus.status})`);
            return subscriptionStatus;

        } catch (error) {
            console.error(`Failed to load subscription status for ${organizationId}:`, error.message);
            logger.error('Failed to load subscription status', {
                organizationId,
                error: error.message,
                stack: error.stack
            });

            // Return fallback subscription
            return {
                id: null,
                organizationId,
                tier: 'free',
                status: 'error',
                error: error.message,
                fallback: true
            };
        }
    }

    /**
     * Determine actual subscription status based on dates and billing
     * @param {Object} subscription - Subscription data
     * @returns {Object} Updated subscription with actual status
     */
    determineSubscriptionStatus(subscription) {
        const now = new Date();

        // Check if in trial period
        if (subscription.trialStart && subscription.trialEnd) {
            const trialStart = new Date(subscription.trialStart);
            const trialEnd = new Date(subscription.trialEnd);

            if (now >= trialStart && now <= trialEnd && subscription.tier === 'free') {
                subscription.actualStatus = 'trial';
                subscription.inTrial = true;
                subscription.trialDaysRemaining = Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000));
                return subscription;
            }
        }

        // Check if subscription is expired
        if (subscription.currentPeriodEnd) {
            const periodEnd = new Date(subscription.currentPeriodEnd);
            const gracePeriodEnd = new Date(periodEnd.getTime() + this.config.gracePeriodDays * 24 * 60 * 60 * 1000);

            if (now > periodEnd && subscription.tier !== 'free') {
                if (now <= gracePeriodEnd && this.config.allowGracePeriod) {
                    subscription.actualStatus = 'grace_period';
                    subscription.inGracePeriod = true;
                    subscription.gracePeriodDaysRemaining = Math.ceil((gracePeriodEnd - now) / (24 * 60 * 60 * 1000));
                } else {
                    subscription.actualStatus = 'expired';
                    subscription.isExpired = true;
                }
                return subscription;
            }
        }

        // Check payment status
        if (subscription.tier !== 'free' && subscription.status === 'past_due') {
            subscription.actualStatus = 'past_due';
            subscription.isPastDue = true;
            return subscription;
        }

        // Check if cancelled
        if (subscription.status === 'cancelled' || subscription.status === 'canceled') {
            subscription.actualStatus = 'cancelled';
            subscription.isCancelled = true;
            return subscription;
        }

        // Active subscription
        subscription.actualStatus = subscription.status || 'active';
        subscription.isActive = subscription.actualStatus === 'active';
        return subscription;
    }

    /**
     * Validate subscription status
     * @param {Object} subscriptionStatus - Subscription status
     * @param {Object} req - Express request object
     * @returns {Object} Validation result
     */
    async validateSubscription(subscriptionStatus, req) {
        console.log(`Validating subscription: ${subscriptionStatus.tier} (${subscriptionStatus.actualStatus})`);

        const validation = {
            valid: false,
            reason: null,
            allowedActions: [],
            blockedActions: []
        };

        // Handle error states
        if (subscriptionStatus.status === 'error') {
            if (this.config.strictMode) {
                validation.reason = 'subscription_error';
                validation.error = subscriptionStatus.error;
                return validation;
            } else {
                // Allow with limited access
                validation.valid = true;
                validation.reason = 'error_fallback';
                return validation;
            }
        }

        // Check trial status
        if (subscriptionStatus.inTrial) {
            if (this.config.allowTrials) {
                validation.valid = true;
                validation.reason = 'trial_access';
                validation.trialDaysRemaining = subscriptionStatus.trialDaysRemaining;
                return validation;
            } else {
                validation.reason = 'trial_not_allowed';
                return validation;
            }
        }

        // Check grace period
        if (subscriptionStatus.inGracePeriod) {
            if (this.config.allowGracePeriod) {
                validation.valid = true;
                validation.reason = 'grace_period_access';
                validation.gracePeriodDaysRemaining = subscriptionStatus.gracePeriodDaysRemaining;
                validation.allowedActions = ['billing', 'account', 'support'];
                return validation;
            } else {
                validation.reason = 'grace_period_not_allowed';
                return validation;
            }
        }

        // Check if expired
        if (subscriptionStatus.isExpired) {
            validation.reason = 'subscription_expired';
            validation.allowedActions = ['billing', 'account'];
            return validation;
        }

        // Check if cancelled
        if (subscriptionStatus.isCancelled) {
            validation.reason = 'subscription_cancelled';
            validation.allowedActions = ['billing', 'account', 'export'];
            return validation;
        }

        // Check if past due
        if (subscriptionStatus.isPastDue) {
            validation.valid = true;
            validation.reason = 'past_due_limited_access';
            validation.allowedActions = ['billing', 'account', 'support'];
            validation.blockedActions = ['create', 'invite', 'export'];
            return validation;
        }

        // Active subscription
        if (subscriptionStatus.isActive || subscriptionStatus.tier === 'free') {
            validation.valid = true;
            validation.reason = 'active_subscription';
            return validation;
        }

        // Default: deny access
        validation.reason = 'invalid_subscription_status';
        return validation;
    }

    /**
     * Validate usage limits
     * @param {Object} subscriptionStatus - Subscription status
     * @param {Object} req - Express request object
     * @returns {Object} Usage validation result
     */
    async validateUsageLimits(subscriptionStatus, req) {
        const organizationId = subscriptionStatus.organizationId;
        console.log(`Validating usage limits for organization: ${organizationId}`);

        const validation = {
            valid: true,
            reason: null,
            usage: {},
            quotas: {},
            exceeded: []
        };

        try {
            // Get current usage
            const usage = await this.getCurrentUsage(organizationId);
            const limits = subscriptionStatus.customLimits || this.subscriptionTiers[subscriptionStatus.tier]?.limits;

            if (!limits) {
                console.log(`No limits found for tier: ${subscriptionStatus.tier}`);
                return validation;
            }

            validation.usage = usage;
            validation.quotas = limits;

            // Check each limit
            for (const [limitType, limit] of Object.entries(limits)) {
                if (limit === -1) continue; // Unlimited

                const currentUsage = usage[limitType] || 0;
                const remaining = limit - currentUsage;

                validation.usage[`${limitType}_remaining`] = Math.max(0, remaining);
                validation.usage[`${limitType}_percentage`] = Math.min(100, (currentUsage / limit) * 100);

                // Check if limit exceeded
                if (currentUsage >= limit) {
                    validation.exceeded.push({
                        type: limitType,
                        current: currentUsage,
                        limit: limit,
                        percentage: (currentUsage / limit) * 100
                    });

                    // Determine if request should be blocked
                    if (this.shouldBlockForLimit(limitType, req)) {
                        validation.valid = false;
                        validation.reason = `${limitType}_limit_exceeded`;
                    }
                }
            }

            console.log(`Usage validation completed for ${organizationId}: ${validation.valid ? 'passed' : 'failed'}`);
            if (validation.exceeded.length > 0) {
                console.log(`Limits exceeded: ${validation.exceeded.map(e => e.type).join(', ')}`);
            }

            return validation;

        } catch (error) {
            console.error(`Usage validation failed for ${organizationId}:`, error.message);
            logger.error('Usage validation failed', {
                organizationId,
                error: error.message,
                stack: error.stack
            });

            // Allow request but log error
            validation.error = error.message;
            return validation;
        }
    }

    /**
     * Validate feature access
     * @param {Object} subscriptionStatus - Subscription status
     * @param {Object} req - Express request object
     * @returns {Object} Feature validation result
     */
    async validateFeatureAccess(subscriptionStatus, req) {
        console.log(`Validating feature access for ${req.path} on tier: ${subscriptionStatus.tier}`);

        const validation = {
            valid: true,
            reason: null,
            requiredFeature: null,
            availableFeatures: [],
            tier: subscriptionStatus.tier
        };

        const features = this.subscriptionTiers[subscriptionStatus.tier]?.features;
        if (!features) {
            validation.availableFeatures = [];
            return validation;
        }

        validation.availableFeatures = Object.keys(features).filter(feature => features[feature]);

        // Determine required feature based on endpoint
        const requiredFeature = this.getRequiredFeature(req.path, req.method);

        if (!requiredFeature) {
            // No specific feature required
            return validation;
        }

        validation.requiredFeature = requiredFeature;

        // Check if feature is available
        if (!features[requiredFeature]) {
            validation.valid = false;
            validation.reason = `feature_not_available`;
            validation.upgradeRequired = true;
            validation.minimumTier = this.getMinimumTierForFeature(requiredFeature);
        }

        console.log(`Feature validation for ${requiredFeature}: ${validation.valid ? 'passed' : 'failed'}`);
        return validation;
    }

    /**
     * Get required feature for endpoint
     * @param {string} path - Request path
     * @param {string} method - HTTP method
     * @returns {string|null} Required feature name
     */
    getRequiredFeature(path, method) {
        const featureMap = {
            '/api/analytics': 'advancedReporting',
            '/api/integrations': 'basicIntegrations',
            '/api/webhooks': 'webhooks',
            '/api/sso': 'sso',
            '/api/audit': 'auditLogs',
            '/api/branding': 'customBranding',
            '/api/export': 'advancedReporting',
            '/api/support/priority': 'prioritySupport'
        };

        // Check exact matches first
        if (featureMap[path]) {
            return featureMap[path];
        }

        // Check patterns
        if (path.startsWith('/api/integrations/')) return 'basicIntegrations';
        if (path.startsWith('/api/analytics/')) return 'advancedReporting';
        if (path.startsWith('/api/webhooks/')) return 'webhooks';
        if (path.startsWith('/api/sso/')) return 'sso';
        if (path.startsWith('/api/audit/')) return 'auditLogs';
        if (path.startsWith('/api/branding/')) return 'customBranding';

        return null;
    }

    /**
     * Get minimum tier that has a specific feature
     * @param {string} feature - Feature name
     * @returns {string} Minimum tier name
     */
    getMinimumTierForFeature(feature) {
        for (const [tier, config] of Object.entries(this.subscriptionTiers)) {
            if (config.features[feature]) {
                return tier;
            }
        }
        return 'enterprise';
    }

    /**
     * Get current usage for organization
     * @param {string} organizationId - Organization ID
     * @returns {Object} Current usage metrics
     */
    async getCurrentUsage(organizationId) {
        console.log(`Getting current usage for organization: ${organizationId}`);

        // Check cache first
        const cacheKey = `usage:${organizationId}`;
        if (this.usageCache.has(cacheKey)) {
            console.log(`Using cached usage data for ${organizationId}`);
            return this.usageCache.get(cacheKey);
        }

        try {
            const usage = {
                users: 0,
                projects: 0,
                storage: 0,
                apiCalls: 0,
                exports: 0,
                integrations: 0,
                customDomains: 0,
                teamMembers: 0
            };

            if (organizationId === 'default') {
                // Return default usage
                this.usageCache.set(cacheKey, usage);
                return usage;
            }

            // Load actual usage from database
            const Organization = await Database.getModel('Organization');
            const organization = await Organization.findById(organizationId)
                .select('usage statistics')
                .lean();

            if (organization && organization.usage) {
                Object.assign(usage, organization.usage);
            }

            // Cache the result
            this.usageCache.set(cacheKey, usage);
            setTimeout(() => this.usageCache.delete(cacheKey), this.config.cacheTTL * 1000);

            console.log(`Loaded usage data for ${organizationId}:`, usage);
            return usage;

        } catch (error) {
            console.error(`Failed to load usage for ${organizationId}:`, error.message);
            logger.error('Failed to load usage data', {
                organizationId,
                error: error.message
            });

            // Return empty usage on error
            return {
                users: 0,
                projects: 0,
                storage: 0,
                apiCalls: 0,
                exports: 0,
                integrations: 0,
                customDomains: 0,
                teamMembers: 0
            };
        }
    }

    /**
     * Check if request should be blocked for specific limit type
     * @param {string} limitType - Type of limit
     * @param {Object} req - Express request object
     * @returns {boolean} Whether to block request
     */
    shouldBlockForLimit(limitType, req) {
        const blockingLimits = {
            'apiCalls': true,
            'storage': req.method !== 'GET',
            'users': req.method === 'POST' && req.path.includes('/users'),
            'projects': req.method === 'POST' && req.path.includes('/projects'),
            'exports': req.path.includes('/export'),
            'integrations': req.path.includes('/integrations')
        };

        return blockingLimits[limitType] || false;
    }

    /**
     * Track usage for the current request
     * @param {string} organizationId - Organization ID
     * @param {Object} req - Express request object
     */
    async trackUsage(organizationId, req) {
        try {
            if (organizationId === 'default') return;

            // Track API call
            await this.incrementUsage(organizationId, 'apiCalls', 1);

            // Track other usage based on endpoint
            if (req.path.includes('/export')) {
                await this.incrementUsage(organizationId, 'exports', 1);
            }

            if (req.method === 'POST') {
                if (req.path.includes('/projects')) {
                    await this.incrementUsage(organizationId, 'projects', 1);
                } else if (req.path.includes('/users')) {
                    await this.incrementUsage(organizationId, 'users', 1);
                }
            }

        } catch (error) {
            console.error(`Usage tracking failed for ${organizationId}:`, error.message);
            logger.error('Usage tracking failed', {
                organizationId,
                error: error.message
            });
        }
    }

    /**
     * Increment usage counter
     * @param {string} organizationId - Organization ID
     * @param {string} type - Usage type
     * @param {number} amount - Amount to increment
     */
    async incrementUsage(organizationId, type, amount = 1) {
        try {
            // Update cache
            const cacheKey = `usage:${organizationId}`;
            if (this.usageCache.has(cacheKey)) {
                const usage = this.usageCache.get(cacheKey);
                usage[type] = (usage[type] || 0) + amount;
                this.usageCache.set(cacheKey, usage);
            }

            // Update database (could be async/batched)
            const Organization = await Database.getModel('Organization');
            await Organization.findByIdAndUpdate(
                organizationId,
                { $inc: { [`usage.${type}`]: amount } },
                { upsert: true }
            );

            console.log(`Incremented ${type} usage by ${amount} for organization ${organizationId}`);

        } catch (error) {
            console.error(`Failed to increment ${type} usage for ${organizationId}:`, error.message);
        }
    }

    /**
     * Handle invalid subscription
     * @param {Object} validationResult - Validation result
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    handleInvalidSubscription(validationResult, req, res, next) {
        console.log(`Handling invalid subscription: ${validationResult.reason}`);

        const error = new AppError(
            'Subscription validation failed',
            402, // Payment Required
            'SUBSCRIPTION_INVALID',
            {
                reason: validationResult.reason,
                allowedActions: validationResult.allowedActions,
                blockedActions: validationResult.blockedActions,
                trialDaysRemaining: validationResult.trialDaysRemaining,
                gracePeriodDaysRemaining: validationResult.gracePeriodDaysRemaining
            }
        );

        // Set subscription headers for client
        res.setHeader('X-Subscription-Valid', 'false');
        res.setHeader('X-Subscription-Reason', validationResult.reason);

        if (validationResult.allowedActions && validationResult.allowedActions.length > 0) {
            res.setHeader('X-Allowed-Actions', validationResult.allowedActions.join(','));
        }

        logger.warn('Invalid subscription access attempt', {
            reason: validationResult.reason,
            tenantId: req.tenantId,
            organizationId: req.organizationId,
            path: req.path,
            method: req.method,
            requestId: req.requestId
        });

        return next(error);
    }

    /**
     * Handle usage limit exceeded
     * @param {Object} usageValidation - Usage validation result
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    handleUsageLimitExceeded(usageValidation, req, res, next) {
        console.log(`Handling usage limit exceeded: ${usageValidation.reason}`);

        const error = new AppError(
            'Usage limit exceeded',
            429, // Too Many Requests
            'USAGE_LIMIT_EXCEEDED',
            {
                reason: usageValidation.reason,
                exceeded: usageValidation.exceeded,
                usage: usageValidation.usage,
                quotas: usageValidation.quotas
            }
        );

        // Set usage headers
        res.setHeader('X-Usage-Limit-Exceeded', 'true');
        res.setHeader('X-Usage-Reason', usageValidation.reason);

        logger.warn('Usage limit exceeded', {
            reason: usageValidation.reason,
            exceeded: usageValidation.exceeded,
            tenantId: req.tenantId,
            organizationId: req.organizationId,
            path: req.path,
            method: req.method,
            requestId: req.requestId
        });

        return next(error);
    }

    /**
     * Handle feature restricted
     * @param {Object} featureValidation - Feature validation result
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    handleFeatureRestricted(featureValidation, req, res, next) {
        console.log(`Handling feature restriction: ${featureValidation.reason}`);

        const error = new AppError(
            'Feature not available in current subscription',
            403, // Forbidden
            'FEATURE_RESTRICTED',
            {
                reason: featureValidation.reason,
                requiredFeature: featureValidation.requiredFeature,
                currentTier: featureValidation.tier,
                minimumTier: featureValidation.minimumTier,
                upgradeRequired: featureValidation.upgradeRequired
            }
        );

        // Set feature headers
        res.setHeader('X-Feature-Restricted', 'true');
        res.setHeader('X-Required-Feature', featureValidation.requiredFeature);
        res.setHeader('X-Minimum-Tier', featureValidation.minimumTier);

        logger.warn('Feature access restricted', {
            reason: featureValidation.reason,
            requiredFeature: featureValidation.requiredFeature,
            currentTier: featureValidation.tier,
            minimumTier: featureValidation.minimumTier,
            tenantId: req.tenantId,
            organizationId: req.organizationId,
            path: req.path,
            method: req.method,
            requestId: req.requestId
        });

        return next(error);
    }

    /**
     * Start background usage tracking
     */
    startUsageTracking() {
        setInterval(() => {
            try {
                // Sync usage data from cache to database
                this.syncUsageToDatabase();
            } catch (error) {
                console.error('Usage tracking error:', error.message);
                logger.error('Usage tracking error', { error: error.message });
            }
        }, this.config.usageCheckInterval);
    }

    /**
     * Start quota reset process
     */
    startQuotaReset() {
        setInterval(() => {
            try {
                // Reset daily/monthly quotas
                this.resetQuotas();
            } catch (error) {
                console.error('Quota reset error:', error.message);
                logger.error('Quota reset error', { error: error.message });
            }
        }, this.config.quotaResetInterval);
    }

    /**
     * Sync usage data from cache to database
     */
    async syncUsageToDatabase() {
        console.log('Syncing usage data to database');
        
        for (const [cacheKey, usage] of this.usageCache) {
            if (cacheKey.startsWith('usage:')) {
                const organizationId = cacheKey.replace('usage:', '');
                
                try {
                    const Organization = await Database.getModel('Organization');
                    await Organization.findByIdAndUpdate(
                        organizationId,
                        { $set: { usage, lastUsageUpdate: new Date() } },
                        { upsert: true }
                    );
                } catch (error) {
                    console.error(`Failed to sync usage for ${organizationId}:`, error.message);
                }
            }
        }
    }

    /**
     * Reset quotas (for limits that reset daily/monthly)
     */
    async resetQuotas() {
        console.log('Resetting quotas');
        
        // This would implement quota reset logic based on subscription terms
        // For now, just clear the usage cache to force reload
        this.usageCache.clear();
        this.subscriptionCache.clear();
    }

    /**
     * Clear all caches
     */
    clearCaches() {
        console.log('Clearing subscription validation caches');
        this.subscriptionCache.clear();
        this.usageCache.clear();
        this.quotaCache.clear();
        logger.info('Subscription validation caches cleared');
    }

    /**
     * Get validation statistics
     * @returns {Object} Validation statistics
     */
    getStatistics() {
        return {
            subscriptionCacheSize: this.subscriptionCache.size,
            usageCacheSize: this.usageCache.size,
            quotaCacheSize: this.quotaCache.size,
            config: {
                enabled: this.config.enabled,
                strictMode: this.config.strictMode,
                allowTrials: this.config.allowTrials,
                allowGracePeriod: this.config.allowGracePeriod
            }
        };
    }
}

// Create singleton instance
const subscriptionValidationMiddleware = new SubscriptionValidationMiddleware({
    enabled: process.env.SUBSCRIPTION_VALIDATION_ENABLED !== 'false',
    strictMode: process.env.SUBSCRIPTION_STRICT_MODE === 'true',
    allowTrials: process.env.ALLOW_TRIALS !== 'false',
    allowGracePeriod: process.env.ALLOW_GRACE_PERIOD !== 'false',
    cacheTTL: parseInt(process.env.SUBSCRIPTION_CACHE_TTL, 10) || 300,
    gracePeriodDays: parseInt(process.env.GRACE_PERIOD_DAYS, 10) || 7,
    trialPeriodDays: parseInt(process.env.TRIAL_PERIOD_DAYS, 10) || 14
});

module.exports = subscriptionValidationMiddleware.validate;