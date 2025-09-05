'use strict';

/**
 * @file Feature Flags Middleware
 * @description Advanced feature flags middleware for customer services with A/B testing,
 *              multi-tenant feature isolation, and dynamic feature rollout management
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 * @module insightserenity-platform/servers/customer-services/middleware/feature-flags
 * @requires ../../../shared/lib/utils/logger
 * @requires ../../../shared/lib/utils/app-error
 * @requires ../../../shared/lib/database
 * @requires ../../../shared/lib/services/cache-service
 * @requires ../../../shared/lib/services/analytics-service
 */

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const Database = require('../../../shared/lib/database');
const CacheService = require('../../../shared/lib/services/cache-service');
const AnalyticsService = require('../../../shared/lib/services/analytics-service');

/**
 * Advanced Feature Flags Middleware
 * Features:
 * - Multi-tenant feature isolation
 * - A/B testing and experimentation
 * - Gradual feature rollouts
 * - User/organization-based targeting
 * - Subscription tier feature gating
 * - Dynamic feature toggling
 * - Feature usage analytics
 * - External provider integration
 * - Fallback mechanisms
 * - Performance optimization
 */
class FeatureFlagsMiddleware {
    constructor(options = {}) {
        this.config = {
            enabled: options.enabled !== false,
            strictMode: options.strictMode === true,
            cacheEnabled: options.cacheEnabled !== false,
            cacheTTL: options.cacheTTL || 300, // 5 minutes
            enableAnalytics: options.enableAnalytics !== false,
            enableTenantIsolation: options.enableTenantIsolation !== false,
            enableABTesting: options.enableABTesting !== false,
            
            // External provider configuration
            externalProvider: {
                enabled: options.externalProvider?.enabled === true,
                provider: options.externalProvider?.provider || 'launchdarkly',
                apiKey: process.env.FEATURE_FLAGS_API_KEY,
                environmentKey: process.env.FEATURE_FLAGS_ENVIRONMENT || 'production'
            },

            // Default feature flags
            defaultFeatures: options.defaultFeatures || {
                // Core platform features
                'user-management': { enabled: true, rollout: 100, sticky: true },
                'project-creation': { enabled: true, rollout: 100, sticky: true },
                'basic-analytics': { enabled: true, rollout: 100, sticky: true },
                'file-upload': { enabled: true, rollout: 100, sticky: true },

                // Premium features
                'advanced-analytics': { enabled: false, rollout: 0, subscription: ['business', 'enterprise'] },
                'custom-branding': { enabled: false, rollout: 0, subscription: ['business', 'enterprise'] },
                'api-access': { enabled: false, rollout: 0, subscription: ['professional', 'business', 'enterprise'] },
                'webhooks': { enabled: false, rollout: 0, subscription: ['professional', 'business', 'enterprise'] },
                'sso': { enabled: false, rollout: 0, subscription: ['business', 'enterprise'] },
                'audit-logs': { enabled: false, rollout: 0, subscription: ['business', 'enterprise'] },

                // Experimental features
                'new-dashboard-ui': { enabled: false, rollout: 0, experiment: 'dashboard_redesign', version: 'v2' },
                'improved-search': { enabled: false, rollout: 20, experiment: 'search_enhancement', version: 'v1' },
                'mobile-app-integration': { enabled: false, rollout: 5, experiment: 'mobile_integration', version: 'beta' },
                'ai-powered-matching': { enabled: false, rollout: 10, experiment: 'ai_matching', version: 'alpha' },

                // Beta features
                'video-interviews': { enabled: false, rollout: 15, beta: true, subscription: ['professional', 'business', 'enterprise'] },
                'automated-scheduling': { enabled: false, rollout: 30, beta: true },
                'real-time-notifications': { enabled: false, rollout: 50, beta: true },

                // Developer features
                'debug-mode': { enabled: false, rollout: 0, development: true },
                'performance-profiling': { enabled: false, rollout: 0, development: true },
                'feature-preview': { enabled: false, rollout: 0, development: true }
            },

            // A/B testing configuration
            experiments: options.experiments || {
                'dashboard_redesign': {
                    name: 'Dashboard Redesign',
                    description: 'Testing new dashboard layout and functionality',
                    variants: [
                        { name: 'control', weight: 50, features: {} },
                        { name: 'new_ui', weight: 50, features: { 'new-dashboard-ui': true } }
                    ],
                    targetAudience: {
                        subscription: ['professional', 'business', 'enterprise'],
                        minUsers: 10,
                        excludeNew: false
                    },
                    duration: 30, // days
                    metrics: ['engagement', 'task_completion', 'user_satisfaction']
                },

                'search_enhancement': {
                    name: 'Enhanced Search Algorithm',
                    description: 'Testing improved search relevance and performance',
                    variants: [
                        { name: 'current', weight: 80, features: {} },
                        { name: 'enhanced', weight: 20, features: { 'improved-search': true } }
                    ],
                    targetAudience: {
                        minUsers: 5,
                        excludeNew: true
                    },
                    duration: 14,
                    metrics: ['search_success_rate', 'click_through_rate', 'search_time']
                }
            },

            // Rollout strategies
            rolloutStrategies: {
                'percentage': (user, flag, config) => this.percentageRollout(user, flag, config),
                'user_attribute': (user, flag, config) => this.userAttributeRollout(user, flag, config),
                'organization': (user, flag, config) => this.organizationRollout(user, flag, config),
                'subscription': (user, flag, config) => this.subscriptionRollout(user, flag, config),
                'beta_user': (user, flag, config) => this.betaUserRollout(user, flag, config)
            },

            // Feature flag evaluation order
            evaluationOrder: ['subscription', 'experiment', 'beta', 'rollout', 'default']
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.analytics = AnalyticsService ? AnalyticsService.getInstance() : null;
        this.featureFlagsCache = new Map();
        this.userExperiments = new Map();
        this.featureUsageMetrics = new Map();
        this.experimentAssignments = new Map();

        // External provider client
        this.externalClient = null;
        if (this.config.externalProvider.enabled) {
            this.initializeExternalProvider();
        }

        // Initialize background processes
        this.initializeBackgroundProcesses();

        console.log('Feature flags middleware initialized');
        logger.info('Feature flags middleware initialized', {
            enabled: this.config.enabled,
            tenantIsolation: this.config.enableTenantIsolation,
            abTesting: this.config.enableABTesting,
            analytics: this.config.enableAnalytics,
            externalProvider: this.config.externalProvider.enabled,
            defaultFeaturesCount: Object.keys(this.config.defaultFeatures).length,
            experimentsCount: Object.keys(this.config.experiments).length
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    evaluateFeatures = async (req, res, next) => {
        if (!this.config.enabled) {
            return next();
        }

        const startTime = Date.now();

        try {
            console.log(`Evaluating feature flags for ${req.path} (tenant: ${req.tenantId || 'default'})`);

            // Initialize feature flags context
            req.features = {
                startTime,
                tenantId: req.tenantId || 'default',
                organizationId: req.organizationId || null,
                userId: req.user?.id || null,
                subscription: req.subscription?.tier || 'free',
                userContext: this.buildUserContext(req),
                flags: new Map(),
                experiments: new Map(),
                evaluations: [],
                fallbacks: [],
                cached: false
            };

            // Build comprehensive user context
            const userContext = req.features.userContext;

            // Try to get cached feature flags first
            const cachedFlags = await this.getCachedFeatures(userContext);
            if (cachedFlags) {
                console.log(`Using cached feature flags for ${req.features.tenantId}`);
                req.features.flags = cachedFlags.flags;
                req.features.experiments = cachedFlags.experiments;
                req.features.cached = true;
            } else {
                // Evaluate all feature flags
                await this.evaluateAllFeatures(req.features, userContext);
                
                // Cache the results
                await this.cacheFeatures(userContext, {
                    flags: req.features.flags,
                    experiments: req.features.experiments
                });
            }

            // Set feature flag headers for debugging
            if (process.env.NODE_ENV === 'development' || req.get('x-debug-features')) {
                this.setDebugHeaders(res, req.features);
            }

            // Track feature flag usage
            await this.trackFeatureUsage(req);

            const duration = Date.now() - startTime;
            console.log(`Feature flags evaluation completed in ${duration}ms for ${req.features.tenantId}`);

            logger.debug('Feature flags evaluated', {
                tenantId: req.features.tenantId,
                userId: req.features.userId,
                flagsCount: req.features.flags.size,
                experimentsCount: req.features.experiments.size,
                duration,
                cached: req.features.cached
            });

            next();

        } catch (error) {
            console.error(`Feature flags evaluation failed for tenant ${req.tenantId}:`, error.message);
            logger.error('Feature flags middleware error', {
                error: error.message,
                stack: error.stack,
                tenantId: req.tenantId,
                userId: req.user?.id,
                path: req.path,
                method: req.method,
                requestId: req.requestId
            });

            if (this.config.strictMode) {
                return next(new AppError('Feature flags evaluation failed', 500, 'FEATURE_FLAGS_ERROR'));
            }

            // Fallback: use default features
            req.features = {
                tenantId: req.tenantId || 'default',
                organizationId: req.organizationId || null,
                userId: req.user?.id || null,
                subscription: req.subscription?.tier || 'free',
                flags: this.getDefaultFeaturesMap(),
                experiments: new Map(),
                evaluations: [],
                fallbacks: ['default_fallback'],
                error: error.message
            };

            next();
        }
    };

    /**
     * Build user context for feature evaluation
     * @param {Object} req - Express request object
     * @returns {Object} User context
     */
    buildUserContext(req) {
        const user = req.user || {};
        const subscription = req.subscription || {};
        const tenant = req.tenant || {};

        return {
            // User attributes
            userId: user.id || null,
            email: user.email || null,
            role: user.role || 'user',
            createdAt: user.createdAt || null,
            lastLoginAt: user.lastLoginAt || null,
            isActive: user.accountStatus?.state === 'active',
            isBetaUser: user.preferences?.betaFeatures === true,
            
            // Organization attributes
            organizationId: req.organizationId || null,
            organizationName: tenant.name || null,
            organizationType: tenant.type || 'standard',
            organizationCreatedAt: tenant.createdAt || null,
            teamSize: tenant.teamSize || 0,
            
            // Subscription attributes
            subscription: subscription.tier || 'free',
            subscriptionStatus: subscription.status || 'active',
            subscriptionCreatedAt: subscription.createdAt || null,
            trialUser: subscription.inTrial || false,
            
            // Tenant attributes
            tenantId: req.tenantId || 'default',
            customDomain: req.tenant?.customDomain || false,
            whiteLabel: req.tenant?.whiteLabel || false,
            
            // Request context
            userAgent: req.get('user-agent') || '',
            ip: req.ip || '',
            country: req.get('cf-ipcountry') || 'unknown',
            language: req.get('accept-language')?.split(',')[0] || 'en',
            
            // Feature context
            betaOptIn: user.preferences?.betaOptIn === true,
            experimentOptIn: user.preferences?.experimentOptIn !== false,
            debugMode: process.env.NODE_ENV === 'development' && user.role === 'admin'
        };
    }

    /**
     * Evaluate all feature flags for user context
     * @param {Object} features - Features context object
     * @param {Object} userContext - User context
     */
    async evaluateAllFeatures(features, userContext) {
        console.log(`Evaluating all features for user: ${userContext.userId}`);

        // Get feature definitions (from external provider or default)
        const featureDefinitions = await this.getFeatureDefinitions(userContext);

        // Evaluate each feature flag
        for (const [featureName, featureConfig] of Object.entries(featureDefinitions)) {
            try {
                const evaluation = await this.evaluateFeature(featureName, featureConfig, userContext);
                
                features.flags.set(featureName, evaluation.enabled);
                features.evaluations.push({
                    feature: featureName,
                    enabled: evaluation.enabled,
                    reason: evaluation.reason,
                    variant: evaluation.variant,
                    experiment: evaluation.experiment
                });

                // Track experiment assignments
                if (evaluation.experiment) {
                    features.experiments.set(evaluation.experiment, {
                        variant: evaluation.variant,
                        feature: featureName
                    });
                }

                console.log(`Feature ${featureName}: ${evaluation.enabled} (${evaluation.reason})`);

            } catch (error) {
                console.error(`Error evaluating feature ${featureName}:`, error.message);
                features.flags.set(featureName, false);
                features.fallbacks.push(`${featureName}: ${error.message}`);
            }
        }
    }

    /**
     * Evaluate individual feature flag
     * @param {string} featureName - Feature name
     * @param {Object} featureConfig - Feature configuration
     * @param {Object} userContext - User context
     * @returns {Object} Evaluation result
     */
    async evaluateFeature(featureName, featureConfig, userContext) {
        console.log(`Evaluating feature: ${featureName}`);

        const evaluation = {
            enabled: false,
            reason: 'default_disabled',
            variant: null,
            experiment: null,
            config: featureConfig
        };

        // Evaluation order: subscription -> experiment -> beta -> rollout -> default
        for (const strategy of this.config.evaluationOrder) {
            const result = await this.evaluateStrategy(strategy, featureName, featureConfig, userContext);
            
            if (result.handled) {
                evaluation.enabled = result.enabled;
                evaluation.reason = result.reason;
                evaluation.variant = result.variant;
                evaluation.experiment = result.experiment;
                break;
            }
        }

        return evaluation;
    }

    /**
     * Evaluate specific strategy
     * @param {string} strategy - Evaluation strategy
     * @param {string} featureName - Feature name
     * @param {Object} featureConfig - Feature configuration
     * @param {Object} userContext - User context
     * @returns {Object} Strategy evaluation result
     */
    async evaluateStrategy(strategy, featureName, featureConfig, userContext) {
        switch (strategy) {
            case 'subscription':
                return this.evaluateSubscriptionStrategy(featureName, featureConfig, userContext);
            
            case 'experiment':
                return this.evaluateExperimentStrategy(featureName, featureConfig, userContext);
            
            case 'beta':
                return this.evaluateBetaStrategy(featureName, featureConfig, userContext);
            
            case 'rollout':
                return this.evaluateRolloutStrategy(featureName, featureConfig, userContext);
            
            case 'default':
                return this.evaluateDefaultStrategy(featureName, featureConfig, userContext);
            
            default:
                return { handled: false };
        }
    }

    /**
     * Evaluate subscription-based feature access
     */
    evaluateSubscriptionStrategy(featureName, featureConfig, userContext) {
        if (!featureConfig.subscription) {
            return { handled: false };
        }

        const userSubscription = userContext.subscription || 'free';
        const requiredSubscriptions = Array.isArray(featureConfig.subscription) 
            ? featureConfig.subscription 
            : [featureConfig.subscription];

        const hasAccess = requiredSubscriptions.includes(userSubscription);
        
        return {
            handled: true,
            enabled: hasAccess,
            reason: hasAccess ? `subscription_${userSubscription}` : 'subscription_insufficient',
            variant: null,
            experiment: null
        };
    }

    /**
     * Evaluate experiment-based feature access
     */
    async evaluateExperimentStrategy(featureName, featureConfig, userContext) {
        if (!featureConfig.experiment || !this.config.enableABTesting) {
            return { handled: false };
        }

        const experimentName = featureConfig.experiment;
        const experiment = this.config.experiments[experimentName];

        if (!experiment) {
            console.warn(`Experiment ${experimentName} not found for feature ${featureName}`);
            return { handled: false };
        }

        // Check if user is eligible for experiment
        const eligibility = await this.checkExperimentEligibility(userContext, experiment);
        if (!eligibility.eligible) {
            console.log(`User not eligible for experiment ${experimentName}: ${eligibility.reason}`);
            return { handled: false };
        }

        // Get or assign experiment variant
        const variant = await this.getExperimentVariant(userContext, experiment);
        const variantConfig = experiment.variants.find(v => v.name === variant);

        if (!variantConfig) {
            console.error(`Variant ${variant} not found for experiment ${experimentName}`);
            return { handled: false };
        }

        // Check if variant enables this feature
        const enabled = variantConfig.features[featureName] === true;

        return {
            handled: true,
            enabled,
            reason: `experiment_${experimentName}_${variant}`,
            variant,
            experiment: experimentName
        };
    }

    /**
     * Evaluate beta feature access
     */
    evaluateBetaStrategy(featureName, featureConfig, userContext) {
        if (!featureConfig.beta) {
            return { handled: false };
        }

        // Check if user opted into beta features
        if (!userContext.betaOptIn && !userContext.isBetaUser) {
            return {
                handled: true,
                enabled: false,
                reason: 'beta_not_opted_in',
                variant: null,
                experiment: null
            };
        }

        // Apply rollout percentage if configured
        if (featureConfig.rollout !== undefined) {
            const rolloutResult = this.percentageRollout(userContext, featureName, featureConfig);
            return {
                handled: true,
                enabled: rolloutResult,
                reason: rolloutResult ? 'beta_rollout_included' : 'beta_rollout_excluded',
                variant: null,
                experiment: null
            };
        }

        return {
            handled: true,
            enabled: true,
            reason: 'beta_user',
            variant: null,
            experiment: null
        };
    }

    /**
     * Evaluate rollout strategy
     */
    evaluateRolloutStrategy(featureName, featureConfig, userContext) {
        if (featureConfig.rollout === undefined) {
            return { handled: false };
        }

        if (featureConfig.rollout === 0) {
            return {
                handled: true,
                enabled: false,
                reason: 'rollout_disabled',
                variant: null,
                experiment: null
            };
        }

        if (featureConfig.rollout === 100) {
            return {
                handled: true,
                enabled: true,
                reason: 'rollout_full',
                variant: null,
                experiment: null
            };
        }

        const rolloutResult = this.percentageRollout(userContext, featureName, featureConfig);
        return {
            handled: true,
            enabled: rolloutResult,
            reason: rolloutResult ? 'rollout_included' : 'rollout_excluded',
            variant: null,
            experiment: null
        };
    }

    /**
     * Evaluate default strategy
     */
    evaluateDefaultStrategy(featureName, featureConfig, userContext) {
        return {
            handled: true,
            enabled: featureConfig.enabled === true,
            reason: featureConfig.enabled ? 'default_enabled' : 'default_disabled',
            variant: null,
            experiment: null
        };
    }

    /**
     * Percentage-based rollout algorithm
     */
    percentageRollout(userContext, featureName, featureConfig) {
        const rolloutPercentage = featureConfig.rollout || 0;
        
        if (rolloutPercentage === 0) return false;
        if (rolloutPercentage === 100) return true;

        // Use consistent hash for stable rollout
        const hash = this.generateUserHash(userContext, featureName);
        const userPercentile = hash % 100;
        
        return userPercentile < rolloutPercentage;
    }

    /**
     * Check experiment eligibility
     */
    async checkExperimentEligibility(userContext, experiment) {
        const targetAudience = experiment.targetAudience || {};

        // Check subscription requirement
        if (targetAudience.subscription) {
            const requiredSubscriptions = Array.isArray(targetAudience.subscription) 
                ? targetAudience.subscription 
                : [targetAudience.subscription];
            
            if (!requiredSubscriptions.includes(userContext.subscription)) {
                return { eligible: false, reason: 'subscription_not_eligible' };
            }
        }

        // Check minimum users requirement
        if (targetAudience.minUsers && userContext.teamSize < targetAudience.minUsers) {
            return { eligible: false, reason: 'team_size_too_small' };
        }

        // Check exclude new users
        if (targetAudience.excludeNew && userContext.createdAt) {
            const daysSinceCreation = (Date.now() - new Date(userContext.createdAt).getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceCreation < 7) {
                return { eligible: false, reason: 'user_too_new' };
            }
        }

        // Check experiment opt-in
        if (!userContext.experimentOptIn) {
            return { eligible: false, reason: 'not_opted_in_experiments' };
        }

        return { eligible: true };
    }

    /**
     * Get experiment variant for user
     */
    async getExperimentVariant(userContext, experiment) {
        const experimentKey = `experiment:${experiment.name}:${userContext.userId}`;
        
        // Check for existing assignment
        let assignment = await this.getExperimentAssignment(experimentKey);
        
        if (assignment) {
            console.log(`Existing experiment assignment: ${assignment.variant}`);
            return assignment.variant;
        }

        // Assign new variant based on weights
        const variant = this.assignExperimentVariant(userContext, experiment);
        
        // Store assignment
        assignment = {
            userId: userContext.userId,
            experiment: experiment.name,
            variant,
            assignedAt: Date.now(),
            tenantId: userContext.tenantId
        };

        await this.storeExperimentAssignment(experimentKey, assignment);
        
        console.log(`New experiment assignment: ${variant} for experiment ${experiment.name}`);
        return variant;
    }

    /**
     * Assign experiment variant based on weights
     */
    assignExperimentVariant(userContext, experiment) {
        const variants = experiment.variants;
        const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0);
        
        // Generate consistent random number for user
        const hash = this.generateUserHash(userContext, experiment.name);
        const randomValue = hash % totalWeight;
        
        let cumulativeWeight = 0;
        for (const variant of variants) {
            cumulativeWeight += variant.weight;
            if (randomValue < cumulativeWeight) {
                return variant.name;
            }
        }
        
        return variants[0].name; // Fallback
    }

    /**
     * Generate consistent hash for user
     */
    generateUserHash(userContext, salt = '') {
        const crypto = require('crypto');
        const identifier = userContext.userId || userContext.ip || 'anonymous';
        const hashInput = `${identifier}:${userContext.tenantId}:${salt}`;
        
        const hash = crypto.createHash('md5').update(hashInput).digest('hex');
        return parseInt(hash.substring(0, 8), 16);
    }

    /**
     * Cache and storage methods
     */

    async getCachedFeatures(userContext) {
        if (!this.config.cacheEnabled) return null;

        const cacheKey = `features:${userContext.tenantId}:${userContext.userId || 'anonymous'}`;
        
        try {
            if (this.cache) {
                const cached = await this.cache.get(cacheKey);
                if (cached) {
                    const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
                    return {
                        flags: new Map(Object.entries(parsed.flags || {})),
                        experiments: new Map(Object.entries(parsed.experiments || {}))
                    };
                }
            }

            // Check local cache
            return this.featureFlagsCache.get(cacheKey) || null;
        } catch (error) {
            console.error('Error getting cached features:', error.message);
            return null;
        }
    }

    async cacheFeatures(userContext, features) {
        if (!this.config.cacheEnabled) return;

        const cacheKey = `features:${userContext.tenantId}:${userContext.userId || 'anonymous'}`;
        const cacheData = {
            flags: Object.fromEntries(features.flags),
            experiments: Object.fromEntries(features.experiments),
            cachedAt: Date.now()
        };

        try {
            // Store in Redis cache
            if (this.cache) {
                await this.cache.set(cacheKey, JSON.stringify(cacheData), this.config.cacheTTL);
            }

            // Store in local cache
            this.featureFlagsCache.set(cacheKey, cacheData);
        } catch (error) {
            console.error('Error caching features:', error.message);
        }
    }

    async getExperimentAssignment(key) {
        try {
            if (this.cache) {
                const assignment = await this.cache.get(key);
                return assignment ? JSON.parse(assignment) : null;
            }
            
            return this.experimentAssignments.get(key) || null;
        } catch (error) {
            console.error('Error getting experiment assignment:', error.message);
            return null;
        }
    }

    async storeExperimentAssignment(key, assignment) {
        try {
            if (this.cache) {
                await this.cache.set(key, JSON.stringify(assignment), 86400 * 30); // 30 days
            }
            
            this.experimentAssignments.set(key, assignment);
        } catch (error) {
            console.error('Error storing experiment assignment:', error.message);
        }
    }

    /**
     * Get feature definitions (from external provider or default)
     */
    async getFeatureDefinitions(userContext) {
        try {
            // Try external provider first
            if (this.externalClient) {
                const externalFeatures = await this.getExternalFeatures(userContext);
                if (externalFeatures) {
                    return { ...this.config.defaultFeatures, ...externalFeatures };
                }
            }

            // Load from database if available
            const dbFeatures = await this.getDatabaseFeatures(userContext);
            if (dbFeatures) {
                return { ...this.config.defaultFeatures, ...dbFeatures };
            }

            return this.config.defaultFeatures;
        } catch (error) {
            console.error('Error getting feature definitions:', error.message);
            return this.config.defaultFeatures;
        }
    }

    async getExternalFeatures(userContext) {
        // Implementation for external feature flag providers
        // This would integrate with LaunchDarkly, Split.io, etc.
        return null;
    }

    async getDatabaseFeatures(userContext) {
        try {
            if (!userContext.organizationId) return null;

            const Organization = await Database.getModel('Organization');
            const organization = await Organization.findById(userContext.organizationId)
                .select('settings.features')
                .lean();

            return organization?.settings?.features || null;
        } catch (error) {
            console.error('Error loading features from database:', error.message);
            return null;
        }
    }

    /**
     * Utility methods
     */

    getDefaultFeaturesMap() {
        const map = new Map();
        for (const [name, config] of Object.entries(this.config.defaultFeatures)) {
            map.set(name, config.enabled === true);
        }
        return map;
    }

    setDebugHeaders(res, features) {
        res.setHeader('X-Features-Count', features.flags.size);
        res.setHeader('X-Features-Cached', features.cached);
        res.setHeader('X-Experiments-Count', features.experiments.size);
        
        if (features.evaluations.length > 0) {
            const enabledFeatures = features.evaluations
                .filter(e => e.enabled)
                .map(e => e.feature)
                .join(',');
            
            if (enabledFeatures) {
                res.setHeader('X-Features-Enabled', enabledFeatures.substring(0, 1000));
            }
        }
    }

    async trackFeatureUsage(req) {
        if (!this.config.enableAnalytics) return;

        try {
            const usage = {
                timestamp: Date.now(),
                tenantId: req.features.tenantId,
                userId: req.features.userId,
                path: req.path,
                method: req.method,
                featuresEnabled: Array.from(req.features.flags.entries())
                    .filter(([name, enabled]) => enabled)
                    .map(([name]) => name),
                experiments: Array.from(req.features.experiments.entries())
                    .map(([experiment, data]) => ({ experiment, variant: data.variant })),
                cached: req.features.cached
            };

            // Store in analytics
            if (this.analytics) {
                await this.analytics.track('feature_flag_evaluation', usage);
            }

            // Store in local metrics
            const metricsKey = `usage:${new Date().getHours()}`;
            if (!this.featureUsageMetrics.has(metricsKey)) {
                this.featureUsageMetrics.set(metricsKey, []);
            }
            this.featureUsageMetrics.get(metricsKey).push(usage);

        } catch (error) {
            console.error('Error tracking feature usage:', error.message);
        }
    }

    /**
     * Background processes
     */

    initializeBackgroundProcesses() {
        // Clean up local caches every 10 minutes
        setInterval(() => {
            this.cleanupLocalCaches();
        }, 600000);

        // Update feature metrics every hour
        setInterval(() => {
            this.updateFeatureMetrics();
        }, 3600000);

        // Sync with external provider every 5 minutes
        if (this.config.externalProvider.enabled) {
            setInterval(() => {
                this.syncWithExternalProvider();
            }, 300000);
        }
    }

    cleanupLocalCaches() {
        const cutoff = Date.now() - (this.config.cacheTTL * 1000 * 2);
        let cleaned = 0;

        // Clean feature flags cache
        for (const [key, data] of this.featureFlagsCache) {
            if (data.cachedAt < cutoff) {
                this.featureFlagsCache.delete(key);
                cleaned++;
            }
        }

        // Clean usage metrics
        for (const [key, data] of this.featureUsageMetrics) {
            if (data[0]?.timestamp < cutoff) {
                this.featureUsageMetrics.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} expired feature flag cache entries`);
        }
    }

    updateFeatureMetrics() {
        const metrics = this.calculateFeatureMetrics();
        console.log('Feature flag metrics updated:', {
            totalEvaluations: metrics.totalEvaluations,
            cacheHitRate: Math.round(metrics.cacheHitRate * 100) + '%',
            topFeatures: metrics.topFeatures.slice(0, 5)
        });
    }

    calculateFeatureMetrics() {
        const allUsage = Array.from(this.featureUsageMetrics.values()).flat();
        
        const metrics = {
            totalEvaluations: allUsage.length,
            cachedEvaluations: allUsage.filter(u => u.cached).length,
            uniqueUsers: new Set(allUsage.map(u => u.userId)).size,
            uniqueTenants: new Set(allUsage.map(u => u.tenantId)).size,
            featureUsageCount: new Map(),
            experimentCount: new Map()
        };

        // Calculate cache hit rate
        metrics.cacheHitRate = metrics.totalEvaluations > 0 
            ? metrics.cachedEvaluations / metrics.totalEvaluations 
            : 0;

        // Count feature usage
        allUsage.forEach(usage => {
            usage.featuresEnabled.forEach(feature => {
                metrics.featureUsageCount.set(feature, (metrics.featureUsageCount.get(feature) || 0) + 1);
            });

            usage.experiments.forEach(exp => {
                const key = `${exp.experiment}:${exp.variant}`;
                metrics.experimentCount.set(key, (metrics.experimentCount.get(key) || 0) + 1);
            });
        });

        // Get top features
        metrics.topFeatures = Array.from(metrics.featureUsageCount.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([feature, count]) => ({ feature, count }));

        return metrics;
    }

    async syncWithExternalProvider() {
        // Implementation for syncing with external providers
        console.log('Syncing with external feature flag provider...');
    }

    initializeExternalProvider() {
        // Initialize external provider client based on configuration
        console.log(`Initializing external provider: ${this.config.externalProvider.provider}`);
    }

    /**
     * Public API methods
     */

    getStatistics() {
        const metrics = this.calculateFeatureMetrics();
        
        return {
            ...metrics,
            config: {
                enabled: this.config.enabled,
                tenantIsolation: this.config.enableTenantIsolation,
                abTesting: this.config.enableABTesting,
                analytics: this.config.enableAnalytics,
                externalProvider: this.config.externalProvider.enabled
            },
            cacheStats: {
                localCacheSize: this.featureFlagsCache.size,
                experimentAssignments: this.experimentAssignments.size,
                usageMetricsSize: this.featureUsageMetrics.size
            },
            featureDefinitions: Object.keys(this.config.defaultFeatures).length,
            experiments: Object.keys(this.config.experiments).length
        };
    }

    async healthCheck() {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            components: {}
        };

        try {
            // Check cache connectivity
            if (this.cache) {
                try {
                    await this.cache.ping();
                    health.components.cache = { status: 'healthy', type: 'redis' };
                } catch (error) {
                    health.components.cache = { status: 'unhealthy', error: error.message };
                    health.status = 'degraded';
                }
            }

            // Check external provider
            if (this.externalClient) {
                health.components.externalProvider = { 
                    status: 'healthy', 
                    provider: this.config.externalProvider.provider 
                };
            }

            // Check local components
            health.components.localCache = {
                status: 'healthy',
                size: this.featureFlagsCache.size
            };

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    clearCaches() {
        console.log('Clearing feature flag caches');
        this.featureFlagsCache.clear();
        this.userExperiments.clear();
        this.featureUsageMetrics.clear();
        this.experimentAssignments.clear();
        
        logger.info('Feature flag caches cleared');
    }

    /**
     * Helper methods for accessing features in application code
     */

    static isEnabled(req, featureName) {
        if (!req.features || !req.features.flags) return false;
        return req.features.flags.get(featureName) === true;
    }

    static getExperiment(req, experimentName) {
        if (!req.features || !req.features.experiments) return null;
        return req.features.experiments.get(experimentName) || null;
    }

    static getVariant(req, experimentName) {
        const experiment = this.getExperiment(req, experimentName);
        return experiment ? experiment.variant : null;
    }

    static getAllFlags(req) {
        if (!req.features || !req.features.flags) return {};
        return Object.fromEntries(req.features.flags);
    }
}

// Create singleton instance
const featureFlagsMiddleware = new FeatureFlagsMiddleware({
    enabled: process.env.FEATURE_FLAGS_ENABLED !== 'false',
    strictMode: process.env.FEATURE_FLAGS_STRICT_MODE === 'true',
    cacheEnabled: process.env.FEATURE_FLAGS_CACHE_ENABLED !== 'false',
    enableTenantIsolation: process.env.FEATURE_FLAGS_TENANT_ISOLATION !== 'false',
    enableABTesting: process.env.FEATURE_FLAGS_AB_TESTING !== 'false',
    enableAnalytics: process.env.FEATURE_FLAGS_ANALYTICS !== 'false',
    cacheTTL: parseInt(process.env.FEATURE_FLAGS_CACHE_TTL, 10) || 300,
    externalProvider: {
        enabled: process.env.FEATURE_FLAGS_EXTERNAL_PROVIDER === 'true',
        provider: process.env.FEATURE_FLAGS_PROVIDER || 'launchdarkly'
    }
});

module.exports = featureFlagsMiddleware.evaluateFeatures;