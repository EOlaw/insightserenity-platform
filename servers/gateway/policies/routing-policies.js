'use strict';

/**
 * @fileoverview Routing Policy Engine - Dynamic routing policies for API Gateway
 * @module servers/gateway/policies/routing-policies
 * @requires events
 * @requires crypto
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * RoutingPolicyEngine class implements dynamic routing policies for the API Gateway.
 * It provides traffic management, service version routing, canary deployments,
 * A/B testing, geo-routing, load distribution, and failover strategies.
 */
class RoutingPolicyEngine extends EventEmitter {
    /**
     * Creates an instance of RoutingPolicyEngine
     * @constructor
     * @param {Object} config - Routing configuration
     * @param {Object} serviceRegistry - Service registry
     * @param {Object} logger - Logger instance
     */
    constructor(config, serviceRegistry, logger) {
        super();
        this.config = config || {};
        this.serviceRegistry = serviceRegistry;
        this.logger = logger;
        
        // Routing policies
        this.policies = new Map();
        this.policyConditions = new Map();
        this.policyActions = new Map();
        
        // Traffic management
        this.trafficRules = new Map();
        this.trafficSplits = new Map();
        this.canaryDeployments = new Map();
        
        // Service version routing
        this.versionMappings = new Map();
        this.defaultVersions = new Map();
        
        // A/B testing configurations
        this.abTests = new Map();
        this.abTestResults = new Map();
        
        // Geo-routing rules
        this.geoRoutes = new Map();
        this.regionMappings = new Map();
        
        // Load distribution strategies
        this.loadStrategies = {
            'round-robin': this.roundRobinStrategy.bind(this),
            'weighted': this.weightedStrategy.bind(this),
            'least-connections': this.leastConnectionsStrategy.bind(this),
            'least-response-time': this.leastResponseTimeStrategy.bind(this),
            'ip-hash': this.ipHashStrategy.bind(this),
            'random': this.randomStrategy.bind(this),
            'consistent-hash': this.consistentHashStrategy.bind(this),
            'adaptive': this.adaptiveStrategy.bind(this)
        };
        
        // Failover configuration
        this.failoverConfig = {
            enabled: config.failover?.enabled !== false,
            maxRetries: config.failover?.maxRetries || 3,
            retryDelay: config.failover?.retryDelay || 1000,
            healthCheckInterval: config.failover?.healthCheckInterval || 30000,
            circuitBreakerThreshold: config.failover?.circuitBreakerThreshold || 5
        };
        
        // Sticky session configuration
        this.stickySessionConfig = {
            enabled: config.stickySession?.enabled || false,
            cookieName: config.stickySession?.cookieName || 'SERVERID',
            ttl: config.stickySession?.ttl || 3600000, // 1 hour
            method: config.stickySession?.method || 'cookie' // cookie, ip, header
        };
        
        // Request routing cache
        this.routingCache = new Map();
        this.routingCacheTTL = config.routingCacheTTL || 60000; // 1 minute
        
        // Service health tracking
        this.serviceHealth = new Map();
        this.serviceMetrics = new Map();
        this.serviceInstances = new Map();
        
        // Round-robin counters
        this.roundRobinCounters = new Map();
        
        // Consistent hash ring
        this.hashRing = new Map();
        this.virtualNodes = 150;
        
        // Policy evaluation metrics
        this.evaluationMetrics = {
            totalEvaluations: 0,
            successfulRoutes: 0,
            failedRoutes: 0,
            cacheHits: 0,
            cacheMisses: 0,
            policyMatches: {},
            strategyUsage: {}
        };
        
        // Circuit breaker states
        this.circuitBreakers = new Map();
        
        // Weight-based routing
        this.weightedRouting = {
            enabled: config.weightedRouting?.enabled || false,
            weights: new Map(),
            algorithm: config.weightedRouting?.algorithm || 'weighted-round-robin'
        };
        
        // Blue-green deployment support
        this.blueGreenDeployments = new Map();
        
        // Feature flags for routing
        this.featureFlags = new Map();
        
        // Request context tracking
        this.requestContexts = new Map();
        
        // Performance monitoring
        this.performanceMetrics = {
            averageResponseTime: 0,
            throughputPerSecond: 0,
            errorRate: 0,
            latencyPercentiles: { p50: 0, p95: 0, p99: 0 }
        };
        
        // Service mesh integration
        this.serviceMesh = {
            enabled: config.serviceMesh?.enabled || false,
            provider: config.serviceMesh?.provider || 'istio',
            namespace: config.serviceMesh?.namespace || 'default'
        };
        
        // Advanced routing rules
        this.advancedRules = new Map();
        
        // Initialization state
        this.isInitialized = false;
        
        // Background tasks
        this.backgroundTasks = new Map();
        
        // Event handlers
        this.setupEventHandlers();
    }

    /**
     * Initializes the routing policy engine
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('warn', 'Routing policy engine already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing routing policy engine');

            // Initialize policies
            await this.initializePolicies();
            
            // Initialize hash ring for consistent hashing
            await this.initializeHashRing();
            
            // Initialize service health monitoring
            await this.initializeHealthMonitoring();
            
            // Initialize performance monitoring
            await this.initializePerformanceMonitoring();
            
            // Start background tasks
            await this.startBackgroundTasks();
            
            this.isInitialized = true;
            this.log('info', 'Routing policy engine initialized successfully');
            
        } catch (error) {
            this.log('error', 'Failed to initialize routing policy engine', error);
            throw error;
        }
    }

    /**
     * Sets up event handlers
     * @private
     */
    setupEventHandlers() {
        // Service registry events
        if (this.serviceRegistry) {
            this.serviceRegistry.on('service:registered', (service) => {
                this.onServiceRegistered(service);
            });
            
            this.serviceRegistry.on('service:deregistered', (service) => {
                this.onServiceDeregistered(service);
            });
            
            this.serviceRegistry.on('service:health:changed', (service, health) => {
                this.onServiceHealthChanged(service, health);
            });
        }
        
        // Policy engine events
        this.on('policy:matched', (event) => {
            this.updatePolicyMetrics(event.policy);
        });
        
        this.on('route:selected', (event) => {
            this.updateRoutingMetrics(event);
        });
    }

    /**
     * Initializes routing policies
     * @private
     * @async
     */
    async initializePolicies() {
        // Version-based routing policy
        this.registerPolicy('version-routing', {
            priority: 100,
            enabled: true,
            description: 'Routes requests based on API version',
            condition: (req) => {
                return req.headers['x-api-version'] || 
                       req.query.version || 
                       this.extractVersionFromPath(req.path);
            },
            action: 'route-by-version',
            config: {
                defaultVersion: 'v1',
                supportedVersions: ['v1', 'v2', 'v3'],
                versionHeader: 'x-api-version',
                versionQuery: 'version',
                versionPath: true,
                backwardCompatibility: true
            }
        });

        // Canary deployment policy
        this.registerPolicy('canary-deployment', {
            priority: 90,
            enabled: true,
            description: 'Routes percentage of traffic to canary version',
            condition: (req, context) => {
                return this.canaryDeployments.has(context.service);
            },
            action: 'route-canary',
            config: {
                defaultPercentage: 10,
                cookieOverride: 'force-canary',
                headerOverride: 'x-canary-force',
                userBasedCanary: true,
                gradualRollout: true,
                rollbackOnError: true
            }
        });

        // A/B testing policy
        this.registerPolicy('ab-testing', {
            priority: 85,
            enabled: true,
            description: 'Routes requests for A/B testing',
            condition: (req, context) => {
                return this.abTests.has(context.service);
            },
            action: 'route-ab-test',
            config: {
                cookieName: 'ab-variant',
                headerName: 'x-ab-variant',
                sessionStickiness: true,
                statistical: true,
                automaticWinner: false
            }
        });

        // Geo-routing policy
        this.registerPolicy('geo-routing', {
            priority: 80,
            enabled: true,
            description: 'Routes requests based on geographic location',
            condition: (req) => {
                return this.config.geoRouting?.enabled && this.getClientRegion(req);
            },
            action: 'route-by-geography',
            config: {
                defaultRegion: 'us-east-1',
                fallbackEnabled: true,
                latencyOptimization: true,
                complianceRouting: true
            }
        });

        // User-based routing policy
        this.registerPolicy('user-routing', {
            priority: 75,
            enabled: true,
            description: 'Routes specific users to specific services',
            condition: (req) => {
                return req.user && this.hasUserRoutingRule(req.user.id);
            },
            action: 'route-by-user',
            config: {
                betaUsers: [],
                internalUsers: [],
                vipUsers: [],
                userTiers: new Map()
            }
        });

        // Load-based routing policy
        this.registerPolicy('load-routing', {
            priority: 70,
            enabled: true,
            description: 'Routes based on service load',
            condition: (req, context) => {
                return context.instances && context.instances.length > 1;
            },
            action: 'route-by-load',
            config: {
                strategy: 'least-connections',
                healthCheckEnabled: true,
                loadThreshold: 0.8,
                responseTimeWeight: 0.3,
                connectionWeight: 0.7
            }
        });

        // Tenant-based routing policy
        this.registerPolicy('tenant-routing', {
            priority: 95,
            enabled: true,
            description: 'Routes based on tenant configuration',
            condition: (req) => {
                return req.tenant && this.hasTenantRoutingRule(req.tenant.id);
            },
            action: 'route-by-tenant',
            config: {
                isolationLevel: 'strict',
                sharedServices: [],
                tenantAffinity: true
            }
        });

        // Content-based routing policy
        this.registerPolicy('content-routing', {
            priority: 65,
            enabled: true,
            description: 'Routes based on request content',
            condition: (req) => {
                return req.headers['content-type'] || req.body;
            },
            action: 'route-by-content',
            config: {
                rules: [
                    { contentType: 'application/json', service: 'api-service' },
                    { contentType: 'application/xml', service: 'legacy-service' },
                    { contentType: 'multipart/form-data', service: 'upload-service' }
                ],
                bodyInspection: false,
                maxBodySize: 1024 * 1024 // 1MB
            }
        });

        // Priority-based routing policy
        this.registerPolicy('priority-routing', {
            priority: 60,
            enabled: true,
            description: 'Routes based on request priority',
            condition: (req) => {
                return req.headers['x-priority'] || this.inferPriority(req);
            },
            action: 'route-by-priority',
            config: {
                highPriorityServices: [],
                lowPriorityServices: [],
                priorityLevels: ['low', 'normal', 'high', 'critical']
            }
        });

        // Time-based routing policy
        this.registerPolicy('time-routing', {
            priority: 55,
            enabled: false,
            description: 'Routes based on time of day',
            condition: (req) => {
                return this.config.timeBasedRouting?.enabled;
            },
            action: 'route-by-time',
            config: {
                peakHours: { start: 9, end: 17 },
                offPeakServices: [],
                timezone: 'UTC',
                workdays: [1, 2, 3, 4, 5] // Monday to Friday
            }
        });

        // Feature flag routing policy
        this.registerPolicy('feature-flag-routing', {
            priority: 85,
            enabled: true,
            description: 'Routes based on feature flags',
            condition: (req) => {
                return this.hasFeatureFlagForRequest(req);
            },
            action: 'route-by-feature-flag',
            config: {
                defaultBehavior: 'stable',
                userGroupTargeting: true,
                percentageRollout: true
            }
        });

        // Blue-green deployment policy
        this.registerPolicy('blue-green-deployment', {
            priority: 88,
            enabled: true,
            description: 'Routes traffic for blue-green deployments',
            condition: (req, context) => {
                return this.blueGreenDeployments.has(context.service);
            },
            action: 'route-blue-green',
            config: {
                switchThreshold: 100, // percentage
                healthCheckRequired: true,
                rollbackCapability: true
            }
        });

        // Register policy actions
        await this.registerPolicyActions();
        
        this.log('info', 'Routing policies initialized');
    }

    /**
     * Registers policy actions
     * @private
     * @async
     */
    async registerPolicyActions() {
        // Version routing action
        this.policyActions.set('route-by-version', (req, context) => {
            const version = this.extractVersion(req);
            const versionedService = `${context.service}-${version}`;
            
            if (this.serviceRegistry.hasService(versionedService)) {
                return {
                    service: versionedService,
                    version,
                    reason: 'version-routing',
                    metadata: {
                        originalService: context.service,
                        supportedVersions: context.policy.config.supportedVersions
                    }
                };
            }
            
            // Fallback to default version
            const defaultVersion = this.defaultVersions.get(context.service) || 
                                  context.policy.config.defaultVersion;
            return {
                service: `${context.service}-${defaultVersion}`,
                version: defaultVersion,
                reason: 'version-default',
                metadata: {
                    fallback: true,
                    requestedVersion: version
                }
            };
        });

        // Canary routing action
        this.policyActions.set('route-canary', (req, context) => {
            const canary = this.canaryDeployments.get(context.service);
            
            if (!canary || !canary.enabled) {
                return null;
            }
            
            // Check for override cookie/header
            const cookieOverride = req.cookies?.[canary.cookieName];
            const headerOverride = req.headers[canary.headerOverride];
            
            if (cookieOverride === 'canary' || headerOverride === 'true') {
                return {
                    service: canary.canaryService,
                    variant: 'canary',
                    reason: 'canary-override',
                    metadata: {
                        overrideMethod: cookieOverride ? 'cookie' : 'header'
                    }
                };
            }
            
            // User-based canary
            if (canary.userBasedCanary && req.user) {
                const userHash = this.hashString(req.user.id);
                const userPercentage = (userHash % 100) + 1;
                
                if (userPercentage <= canary.percentage) {
                    return {
                        service: canary.canaryService,
                        variant: 'canary',
                        reason: 'canary-user-based',
                        metadata: {
                            userPercentage,
                            canaryPercentage: canary.percentage
                        }
                    };
                }
            }
            
            // Random selection based on percentage
            const random = Math.random() * 100;
            if (random < canary.percentage) {
                return {
                    service: canary.canaryService,
                    variant: 'canary',
                    reason: 'canary-percentage',
                    metadata: {
                        randomValue: random,
                        canaryPercentage: canary.percentage
                    }
                };
            }
            
            return {
                service: canary.stableService,
                variant: 'stable',
                reason: 'canary-stable'
            };
        });

        // A/B testing action
        this.policyActions.set('route-ab-test', (req, context) => {
            const abTest = this.abTests.get(context.service);
            
            if (!abTest || !abTest.enabled) {
                return null;
            }
            
            // Check for existing variant assignment
            let variant = req.cookies?.[abTest.cookieName] || 
                         req.headers[abTest.headerName];
            
            if (!variant) {
                // Assign variant based on distribution
                variant = this.assignABTestVariant(abTest, req);
                
                // Store assignment for session stickiness
                if (abTest.sessionStickiness) {
                    context.setCookie = {
                        name: abTest.cookieName,
                        value: variant,
                        maxAge: abTest.duration
                    };
                }
            }
            
            // Record test participation
            this.recordABTestParticipation(abTest.id, variant, req);
            
            return {
                service: abTest.variants[variant].service,
                variant,
                testId: abTest.id,
                reason: 'ab-test',
                metadata: {
                    testName: abTest.name,
                    distribution: abTest.distribution
                }
            };
        });

        // Geographic routing action
        this.policyActions.set('route-by-geography', (req, context) => {
            const region = this.getClientRegion(req);
            const policy = context.policy;
            
            // Check for compliance-based routing
            if (policy.config.complianceRouting) {
                const complianceRegion = this.getComplianceRegion(req, region);
                if (complianceRegion !== region) {
                    region = complianceRegion;
                }
            }
            
            const geoRoute = this.geoRoutes.get(region);
            
            if (geoRoute) {
                const nearestService = this.findNearestService(context.service, region);
                
                if (nearestService) {
                    return {
                        service: nearestService,
                        region,
                        reason: 'geo-routing',
                        metadata: {
                            clientCountry: this.getCountryFromRegion(region),
                            latencyOptimized: policy.config.latencyOptimization
                        }
                    };
                }
            }
            
            // Fallback to default region
            if (policy.config.fallbackEnabled) {
                const defaultRegion = policy.config.defaultRegion;
                return {
                    service: `${context.service}-${defaultRegion}`,
                    region: defaultRegion,
                    reason: 'geo-default',
                    metadata: {
                        originalRegion: region,
                        fallback: true
                    }
                };
            }
            
            return null;
        });

        // User-based routing action
        this.policyActions.set('route-by-user', (req, context) => {
            const userId = req.user.id;
            const userRoute = this.getUserRoutingRule(userId);
            const policy = context.policy;
            
            if (userRoute) {
                return {
                    service: userRoute.service,
                    reason: 'user-routing',
                    userId,
                    metadata: {
                        userTier: userRoute.tier,
                        routingRule: userRoute.rule
                    }
                };
            }
            
            // Check user tiers
            const userTier = this.getUserTier(userId);
            if (userTier && policy.config.userTiers.has(userTier)) {
                const tierConfig = policy.config.userTiers.get(userTier);
                return {
                    service: tierConfig.service,
                    reason: 'user-tier-routing',
                    userId,
                    metadata: {
                        tier: userTier,
                        tierConfig
                    }
                };
            }
            
            return null;
        });

        // Load-based routing action
        this.policyActions.set('route-by-load', (req, context) => {
            const policy = context.policy;
            const strategy = policy.config.strategy || 'round-robin';
            const loadStrategy = this.loadStrategies[strategy];
            
            if (!loadStrategy) {
                this.log('warn', `Unknown load balancing strategy: ${strategy}`);
                return null;
            }
            
            const healthyInstances = this.getHealthyInstances(context.instances);
            
            if (healthyInstances.length === 0) {
                throw new Error('No healthy instances available');
            }
            
            const selectedInstance = loadStrategy(req, healthyInstances, context);
            
            this.evaluationMetrics.strategyUsage[strategy] = 
                (this.evaluationMetrics.strategyUsage[strategy] || 0) + 1;
            
            return {
                instance: selectedInstance,
                strategy,
                reason: 'load-routing',
                metadata: {
                    totalInstances: context.instances.length,
                    healthyInstances: healthyInstances.length,
                    loadMetrics: this.getInstanceLoadMetrics(selectedInstance.id)
                }
            };
        });

        // Tenant-based routing action
        this.policyActions.set('route-by-tenant', (req, context) => {
            const tenantId = req.tenant.id;
            const tenantRoute = this.getTenantRoutingRule(tenantId);
            const policy = context.policy;
            
            if (tenantRoute) {
                return {
                    service: tenantRoute.service,
                    instance: tenantRoute.instance,
                    reason: 'tenant-routing',
                    tenantId,
                    metadata: {
                        isolationLevel: policy.config.isolationLevel,
                        sharedServices: policy.config.sharedServices,
                        tenantAffinity: tenantRoute.affinity
                    }
                };
            }
            
            return null;
        });

        // Content-based routing action
        this.policyActions.set('route-by-content', (req, context) => {
            const contentType = req.headers['content-type'];
            const policy = context.policy;
            const rules = policy.config.rules;
            
            for (const rule of rules) {
                if (contentType?.includes(rule.contentType)) {
                    return {
                        service: rule.service,
                        reason: 'content-routing',
                        contentType,
                        metadata: {
                            matchedRule: rule,
                            bodyInspection: policy.config.bodyInspection
                        }
                    };
                }
            }
            
            // Check body-based rules if enabled
            if (policy.config.bodyInspection && req.body && typeof req.body === 'object') {
                const bodyRule = this.matchBodyRule(req.body);
                if (bodyRule) {
                    return {
                        service: bodyRule.service,
                        reason: 'content-body-routing',
                        metadata: {
                            bodyPattern: bodyRule.pattern
                        }
                    };
                }
            }
            
            return null;
        });

        // Priority-based routing action
        this.policyActions.set('route-by-priority', (req, context) => {
            const priority = req.headers['x-priority'] || this.inferPriority(req);
            const policy = context.policy;
            
            if (priority === 'high' || priority === 'critical') {
                const highPriorityService = this.selectHighPriorityService(context.service, priority);
                if (highPriorityService) {
                    return {
                        service: highPriorityService,
                        priority,
                        reason: 'priority-routing',
                        metadata: {
                            priorityLevel: priority,
                            availableLevels: policy.config.priorityLevels
                        }
                    };
                }
            }
            
            return null;
        });

        // Time-based routing action
        this.policyActions.set('route-by-time', (req, context) => {
            const now = new Date();
            const policy = context.policy;
            const config = policy.config;
            
            // Check timezone
            const timeInZone = this.convertToTimezone(now, config.timezone);
            const currentHour = timeInZone.getHours();
            const currentDay = timeInZone.getDay();
            
            const isPeakHour = currentHour >= config.peakHours.start && 
                              currentHour <= config.peakHours.end;
            const isWorkday = config.workdays.includes(currentDay);
            
            if (!isPeakHour && !isWorkday && config.offPeakServices.length > 0) {
                return {
                    service: config.offPeakServices[0],
                    reason: 'time-routing',
                    period: 'off-peak',
                    metadata: {
                        currentHour,
                        currentDay,
                        timezone: config.timezone
                    }
                };
            }
            
            return null;
        });

        // Feature flag routing action
        this.policyActions.set('route-by-feature-flag', (req, context) => {
            const featureFlag = this.getFeatureFlagForRequest(req);
            
            if (!featureFlag || !featureFlag.enabled) {
                return null;
            }
            
            // Check user group targeting
            if (featureFlag.userGroupTargeting && req.user) {
                const userGroups = this.getUserGroups(req.user.id);
                const hasTargetGroup = userGroups.some(group => 
                    featureFlag.targetGroups.includes(group)
                );
                
                if (hasTargetGroup) {
                    return {
                        service: featureFlag.targetService,
                        reason: 'feature-flag-user-group',
                        featureFlag: featureFlag.name,
                        metadata: {
                            userGroups,
                            targetGroups: featureFlag.targetGroups
                        }
                    };
                }
            }
            
            // Check percentage rollout
            if (featureFlag.percentageRollout) {
                const userHash = req.user ? this.hashString(req.user.id) : this.hashString(req.ip);
                const percentage = (userHash % 100) + 1;
                
                if (percentage <= featureFlag.percentage) {
                    return {
                        service: featureFlag.targetService,
                        reason: 'feature-flag-percentage',
                        featureFlag: featureFlag.name,
                        metadata: {
                            userPercentage: percentage,
                            flagPercentage: featureFlag.percentage
                        }
                    };
                }
            }
            
            return null;
        });

        // Blue-green deployment action
        this.policyActions.set('route-blue-green', (req, context) => {
            const deployment = this.blueGreenDeployments.get(context.service);
            
            if (!deployment || !deployment.enabled) {
                return null;
            }
            
            // Check health of green environment
            if (deployment.config.healthCheckRequired) {
                const greenHealth = this.getEnvironmentHealth(deployment.greenService);
                if (!greenHealth.healthy) {
                    return {
                        service: deployment.blueService,
                        environment: 'blue',
                        reason: 'blue-green-health-fallback',
                        metadata: {
                            greenHealth
                        }
                    };
                }
            }
            
            // Route based on switch percentage
            const random = Math.random() * 100;
            if (random < deployment.switchPercentage) {
                return {
                    service: deployment.greenService,
                    environment: 'green',
                    reason: 'blue-green-switch',
                    metadata: {
                        switchPercentage: deployment.switchPercentage,
                        randomValue: random
                    }
                };
            }
            
            return {
                service: deployment.blueService,
                environment: 'blue',
                reason: 'blue-green-stable'
            };
        });
    }

    /**
     * Load balancing strategies implementation
     */
    
    roundRobinStrategy(req, instances, context) {
        const service = context.service;
        const counter = this.roundRobinCounters.get(service) || 0;
        const selectedIndex = counter % instances.length;
        
        this.roundRobinCounters.set(service, counter + 1);
        
        return instances[selectedIndex];
    }
    
    weightedStrategy(req, instances, context) {
        const totalWeight = instances.reduce((sum, instance) => 
            sum + (instance.weight || 1), 0
        );
        
        let random = Math.random() * totalWeight;
        
        for (const instance of instances) {
            random -= (instance.weight || 1);
            if (random <= 0) {
                return instance;
            }
        }
        
        return instances[0];
    }
    
    leastConnectionsStrategy(req, instances, context) {
        let minConnections = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const connections = this.getInstanceConnections(instance.id);
            
            if (connections < minConnections) {
                minConnections = connections;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance || instances[0];
    }
    
    leastResponseTimeStrategy(req, instances, context) {
        let minResponseTime = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const avgResponseTime = this.getAverageResponseTime(instance.id);
            
            if (avgResponseTime < minResponseTime) {
                minResponseTime = avgResponseTime;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance || instances[0];
    }
    
    ipHashStrategy(req, instances, context) {
        const hash = this.hashString(req.ip);
        const index = hash % instances.length;
        
        return instances[index];
    }
    
    randomStrategy(req, instances, context) {
        const randomIndex = Math.floor(Math.random() * instances.length);
        return instances[randomIndex];
    }
    
    consistentHashStrategy(req, instances, context) {
        const key = req.headers['x-session-id'] || req.ip;
        const hash = this.hashString(key);
        
        // Find the next node in the hash ring
        let selectedInstance = null;
        
        for (const [nodeHash, instance] of this.hashRing) {
            if (nodeHash >= hash) {
                selectedInstance = instance;
                break;
            }
        }
        
        // Wrap around if needed
        if (!selectedInstance) {
            selectedInstance = this.hashRing.values().next().value;
        }
        
        return selectedInstance;
    }
    
    adaptiveStrategy(req, instances, context) {
        // Combine multiple factors for adaptive routing
        const scores = instances.map(instance => {
            const connections = this.getInstanceConnections(instance.id);
            const responseTime = this.getAverageResponseTime(instance.id);
            const errorRate = this.getErrorRate(instance.id);
            const health = this.getInstanceHealth(instance.id);
            const cpuUsage = this.getCpuUsage(instance.id);
            const memoryUsage = this.getMemoryUsage(instance.id);
            
            // Calculate composite score (lower is better)
            const score = (connections * 0.2) + 
                         (responseTime * 0.2) + 
                         (errorRate * 100 * 0.2) + 
                         ((1 - health) * 100 * 0.2) +
                         (cpuUsage * 0.1) +
                         (memoryUsage * 0.1);
            
            return { instance, score };
        });
        
        // Sort by score and select best
        scores.sort((a, b) => a.score - b.score);
        
        return scores[0].instance;
    }

    /**
     * Evaluates routing policies for a request
     * @param {Object} req - Request object
     * @param {Object} context - Routing context
     * @returns {Object} Routing decision
     */
    async evaluate(req, context) {
        this.evaluationMetrics.totalEvaluations++;
        
        // Check cache
        const cacheKey = this.getRoutingCacheKey(req, context);
        const cached = this.routingCache.get(cacheKey);
        
        if (cached && Date.now() < cached.expiry) {
            this.evaluationMetrics.cacheHits++;
            return cached.decision;
        }
        
        this.evaluationMetrics.cacheMisses++;
        
        // Get applicable policies
        const policies = this.getApplicablePolicies(req, context);
        
        // Sort by priority
        policies.sort((a, b) => b.priority - a.priority);
        
        // Evaluate policies
        for (const policy of policies) {
            if (!policy.enabled) continue;
            
            try {
                if (policy.condition(req, context)) {
                    const action = this.policyActions.get(policy.action);
                    
                    if (action) {
                        const decision = action(req, { ...context, policy });
                        
                        if (decision) {
                            // Cache decision
                            this.routingCache.set(cacheKey, {
                                decision,
                                expiry: Date.now() + this.routingCacheTTL
                            });
                            
                            // Update metrics
                            this.evaluationMetrics.policyMatches[policy.name] = 
                                (this.evaluationMetrics.policyMatches[policy.name] || 0) + 1;
                            
                            this.evaluationMetrics.successfulRoutes++;
                            
                            this.emit('policy:matched', {
                                policy: policy.name,
                                decision
                            });
                            
                            this.emit('route:selected', {
                                service: decision.service,
                                reason: decision.reason,
                                metadata: decision.metadata
                            });
                            
                            return decision;
                        }
                    }
                }
            } catch (error) {
                this.log('error', `Policy evaluation failed: ${policy.name}`, error);
                this.evaluationMetrics.failedRoutes++;
            }
        }
        
        // No policy matched, return default
        const defaultDecision = {
            service: context.service,
            reason: 'default',
            metadata: {
                evaluatedPolicies: policies.map(p => p.name),
                fallback: true
            }
        };
        
        this.evaluationMetrics.successfulRoutes++;
        return defaultDecision;
    }

    /**
     * Canary deployment management
     */
    
    createCanaryDeployment(service, config) {
        this.canaryDeployments.set(service, {
            enabled: true,
            stableService: service,
            canaryService: config.canaryService || `${service}-canary`,
            percentage: config.percentage || 10,
            cookieName: config.cookieName || 'canary-override',
            headerOverride: config.headerOverride || 'x-canary-force',
            userBasedCanary: config.userBasedCanary !== false,
            gradualRollout: config.gradualRollout !== false,
            rollbackOnError: config.rollbackOnError !== false,
            startTime: Date.now(),
            metrics: {
                stable: { requests: 0, errors: 0, responseTime: 0 },
                canary: { requests: 0, errors: 0, responseTime: 0 }
            },
            thresholds: {
                errorRateThreshold: config.errorRateThreshold || 0.05,
                responseTimeThreshold: config.responseTimeThreshold || 2000
            }
        });
        
        this.log('info', `Canary deployment created for ${service}`, config);
    }
    
    updateCanaryPercentage(service, percentage) {
        const canary = this.canaryDeployments.get(service);
        
        if (canary) {
            canary.percentage = Math.min(100, Math.max(0, percentage));
            this.log('info', `Canary percentage updated to ${percentage}% for ${service}`);
            
            this.emit('canary:percentage:updated', {
                service,
                percentage: canary.percentage
            });
        }
    }
    
    promoteCanary(service) {
        const canary = this.canaryDeployments.get(service);
        
        if (canary) {
            this.log('info', `Promoting canary to stable for ${service}`);
            
            // Update service registry
            if (this.serviceRegistry.promoteService) {
                this.serviceRegistry.promoteService(canary.canaryService, canary.stableService);
            }
            
            this.emit('canary:promoted', {
                service,
                canaryService: canary.canaryService,
                metrics: canary.metrics
            });
            
            // Remove canary deployment
            this.canaryDeployments.delete(service);
        }
    }
    
    rollbackCanary(service, reason = 'manual') {
        const canary = this.canaryDeployments.get(service);
        
        if (canary) {
            this.log('info', `Rolling back canary for ${service}`, { reason });
            
            // Disable canary
            canary.enabled = false;
            canary.percentage = 0;
            
            this.emit('canary:rolledback', {
                service,
                reason,
                metrics: canary.metrics
            });
            
            // Remove after grace period
            setTimeout(() => {
                this.canaryDeployments.delete(service);
            }, 60000);
        }
    }

    /**
     * A/B testing management
     */
    
    createABTest(config) {
        const testId = config.id || crypto.randomBytes(16).toString('hex');
        
        this.abTests.set(config.service, {
            id: testId,
            name: config.name || `AB-Test-${testId}`,
            enabled: true,
            service: config.service,
            variants: config.variants,
            distribution: config.distribution || { A: 50, B: 50 },
            cookieName: config.cookieName || 'ab-variant',
            headerName: config.headerName || 'x-ab-variant',
            duration: config.duration || 7 * 24 * 60 * 60 * 1000, // 7 days
            startTime: Date.now(),
            sessionStickiness: config.sessionStickiness !== false,
            statistical: config.statistical !== false,
            automaticWinner: config.automaticWinner || false,
            metrics: {},
            targetMetric: config.targetMetric || 'conversion_rate',
            minimumSampleSize: config.minimumSampleSize || 1000
        });
        
        // Initialize metrics for each variant
        for (const variant in config.variants) {
            this.abTestResults.set(`${testId}-${variant}`, {
                participants: 0,
                conversions: 0,
                errors: 0,
                responseTime: 0,
                customMetrics: new Map()
            });
        }
        
        this.log('info', `A/B test created: ${config.name}`, { testId, variants: Object.keys(config.variants) });
        
        return testId;
    }
    
    assignABTestVariant(abTest, req) {
        // Use consistent assignment based on user ID or IP
        const identifier = req.user?.id || req.ip;
        const hash = this.hashString(`${abTest.id}-${identifier}`);
        
        let cumulative = 0;
        const random = (hash % 100) + 1;
        
        for (const [variant, percentage] of Object.entries(abTest.distribution)) {
            cumulative += percentage;
            if (random <= cumulative) {
                return variant;
            }
        }
        
        return 'A'; // Default variant
    }
    
    recordABTestParticipation(testId, variant, req) {
        const key = `${testId}-${variant}`;
        const results = this.abTestResults.get(key);
        
        if (results) {
            results.participants++;
            
            // Track additional context
            if (req.user) {
                results.userIds = results.userIds || new Set();
                results.userIds.add(req.user.id);
            }
        }
    }
    
    recordABTestConversion(testId, variant, value = 1) {
        const key = `${testId}-${variant}`;
        const results = this.abTestResults.get(key);
        
        if (results) {
            results.conversions += value;
        }
    }
    
    getABTestResults(testId) {
        const results = {};
        
        for (const [key, data] of this.abTestResults) {
            if (key.startsWith(testId)) {
                const variant = key.substring(testId.length + 1);
                results[variant] = {
                    ...data,
                    conversionRate: data.participants > 0 ? 
                        (data.conversions / data.participants) * 100 : 0,
                    uniqueUsers: data.userIds ? data.userIds.size : 0
                };
            }
        }
        
        return results;
    }

    /**
     * Blue-green deployment management
     */
    
    createBlueGreenDeployment(service, config) {
        this.blueGreenDeployments.set(service, {
            enabled: true,
            blueService: config.blueService || service,
            greenService: config.greenService || `${service}-green`,
            switchPercentage: config.switchPercentage || 0,
            config: {
                healthCheckRequired: config.healthCheckRequired !== false,
                rollbackCapability: config.rollbackCapability !== false,
                switchThreshold: config.switchThreshold || 100
            },
            metrics: {
                blue: { requests: 0, errors: 0, responseTime: 0 },
                green: { requests: 0, errors: 0, responseTime: 0 }
            },
            startTime: Date.now()
        });
        
        this.log('info', `Blue-green deployment created for ${service}`, config);
    }
    
    switchToGreen(service, percentage = 100) {
        const deployment = this.blueGreenDeployments.get(service);
        
        if (deployment) {
            deployment.switchPercentage = Math.min(100, Math.max(0, percentage));
            
            this.log('info', `Switched ${percentage}% traffic to green for ${service}`);
            
            this.emit('blue-green:switched', {
                service,
                percentage,
                environment: 'green'
            });
        }
    }
    
    rollbackToBlue(service) {
        const deployment = this.blueGreenDeployments.get(service);
        
        if (deployment) {
            deployment.switchPercentage = 0;
            
            this.log('info', `Rolled back to blue environment for ${service}`);
            
            this.emit('blue-green:rolledback', {
                service,
                environment: 'blue'
            });
        }
    }

    /**
     * Helper methods
     */
    
    registerPolicy(name, policy) {
        policy.name = name;
        this.policies.set(name, policy);
    }
    
    getApplicablePolicies(req, context) {
        const applicable = [];
        
        for (const [name, policy] of this.policies) {
            if (this.isPolicyApplicable(policy, req, context)) {
                applicable.push(policy);
            }
        }
        
        return applicable;
    }
    
    isPolicyApplicable(policy, req, context) {
        // Check if policy should apply to this request
        // Could add more complex logic here
        return policy.enabled;
    }
    
    getHealthyInstances(instances) {
        return instances.filter(instance => {
            const health = this.serviceHealth.get(instance.id);
            return !health || health.healthy !== false;
        });
    }
    
    getInstanceConnections(instanceId) {
        const metrics = this.serviceMetrics.get(instanceId);
        return metrics?.connections || 0;
    }
    
    getAverageResponseTime(instanceId) {
        const metrics = this.serviceMetrics.get(instanceId);
        return metrics?.avgResponseTime || 100;
    }
    
    getErrorRate(instanceId) {
        const metrics = this.serviceMetrics.get(instanceId);
        
        if (!metrics || metrics.requests === 0) {
            return 0;
        }
        
        return metrics.errors / metrics.requests;
    }
    
    getInstanceHealth(instanceId) {
        const health = this.serviceHealth.get(instanceId);
        return health?.score || 1;
    }
    
    getCpuUsage(instanceId) {
        const metrics = this.serviceMetrics.get(instanceId);
        return metrics?.cpuUsage || 0;
    }
    
    getMemoryUsage(instanceId) {
        const metrics = this.serviceMetrics.get(instanceId);
        return metrics?.memoryUsage || 0;
    }
    
    getInstanceLoadMetrics(instanceId) {
        return {
            connections: this.getInstanceConnections(instanceId),
            responseTime: this.getAverageResponseTime(instanceId),
            errorRate: this.getErrorRate(instanceId),
            health: this.getInstanceHealth(instanceId),
            cpuUsage: this.getCpuUsage(instanceId),
            memoryUsage: this.getMemoryUsage(instanceId)
        };
    }
    
    extractVersion(req) {
        return req.headers['x-api-version'] || 
               req.query.version || 
               this.extractVersionFromPath(req.path) || 
               'v1';
    }
    
    extractVersionFromPath(path) {
        const match = path.match(/\/v(\d+)\//);
        return match ? `v${match[1]}` : null;
    }
    
    getClientRegion(req) {
        // Check CloudFlare header
        if (req.headers['cf-ipcountry']) {
            return this.countryToRegion(req.headers['cf-ipcountry']);
        }
        
        // Check custom header
        if (req.headers['x-client-region']) {
            return req.headers['x-client-region'];
        }
        
        // Check AWS CloudFront header
        if (req.headers['cloudfront-viewer-country']) {
            return this.countryToRegion(req.headers['cloudfront-viewer-country']);
        }
        
        // Default region
        return this.config.geoRouting?.defaultRegion || 'us-east-1';
    }
    
    getComplianceRegion(req, originalRegion) {
        // GDPR compliance - EU data must stay in EU
        const euCountries = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'PL'];
        const country = req.headers['cf-ipcountry'];
        
        if (euCountries.includes(country) && !originalRegion.startsWith('eu-')) {
            return 'eu-west-1';
        }
        
        return originalRegion;
    }
    
    countryToRegion(country) {
        const regionMap = {
            'US': 'us-east-1',
            'CA': 'us-east-1',
            'GB': 'eu-west-1',
            'DE': 'eu-central-1',
            'FR': 'eu-west-1',
            'IT': 'eu-south-1',
            'JP': 'ap-northeast-1',
            'SG': 'ap-southeast-1',
            'AU': 'ap-southeast-2',
            'BR': 'sa-east-1',
            'IN': 'ap-south-1'
        };
        
        return regionMap[country] || 'us-east-1';
    }
    
    getCountryFromRegion(region) {
        const countryMap = {
            'us-east-1': 'US',
            'us-west-1': 'US',
            'eu-west-1': 'GB',
            'eu-central-1': 'DE',
            'ap-northeast-1': 'JP',
            'ap-southeast-1': 'SG'
        };
        
        return countryMap[region] || 'US';
    }
    
    findNearestService(service, region) {
        // Find the nearest service instance for the region
        const regionalService = `${service}-${region}`;
        
        if (this.serviceRegistry.hasService && this.serviceRegistry.hasService(regionalService)) {
            return regionalService;
        }
        
        // Check fallback regions
        const fallbackRegion = this.getFallbackRegion(region);
        if (fallbackRegion) {
            const fallbackService = `${service}-${fallbackRegion}`;
            if (this.serviceRegistry.hasService && this.serviceRegistry.hasService(fallbackService)) {
                return fallbackService;
            }
        }
        
        return null;
    }
    
    getFallbackRegion(region) {
        const fallbackMap = {
            'us-east-1': 'us-west-2',
            'us-west-1': 'us-east-1',
            'us-west-2': 'us-east-1',
            'eu-west-1': 'eu-central-1',
            'eu-central-1': 'eu-west-1',
            'eu-south-1': 'eu-west-1',
            'ap-southeast-1': 'ap-northeast-1',
            'ap-northeast-1': 'ap-southeast-1',
            'ap-southeast-2': 'ap-southeast-1',
            'ap-south-1': 'ap-southeast-1',
            'sa-east-1': 'us-east-1'
        };
        
        return fallbackMap[region];
    }
    
    hasUserRoutingRule(userId) {
        // Check if user has specific routing rules
        return this.config.userRouting?.rules?.has(userId) || false;
    }
    
    getUserRoutingRule(userId) {
        // Get user-specific routing rule
        return this.config.userRouting?.rules?.get(userId) || null;
    }
    
    getUserTier(userId) {
        // Get user tier (premium, standard, etc.)
        return this.config.userTiers?.get(userId) || 'standard';
    }
    
    hasTenantRoutingRule(tenantId) {
        // Check if tenant has specific routing rules
        return this.config.tenantRouting?.rules?.has(tenantId) || false;
    }
    
    getTenantRoutingRule(tenantId) {
        // Get tenant-specific routing rule
        return this.config.tenantRouting?.rules?.get(tenantId) || null;
    }
    
    inferPriority(req) {
        // Infer request priority based on various factors
        if (req.user?.role === 'admin') return 'high';
        if (req.path.includes('/critical')) return 'critical';
        if (req.path.includes('/priority')) return 'high';
        if (req.headers['x-urgent']) return 'high';
        
        return 'normal';
    }
    
    selectHighPriorityService(service, priority) {
        // Select a high-priority service instance
        const priorityMap = {
            'critical': `${service}-critical`,
            'high': `${service}-priority`,
            'normal': service,
            'low': `${service}-batch`
        };
        
        return priorityMap[priority] || service;
    }
    
    matchBodyRule(body) {
        // Match request body against routing rules
        if (body.type === 'bulk') {
            return { service: 'bulk-processing-service', pattern: 'bulk-type' };
        }
        
        if (body.priority && body.priority === 'urgent') {
            return { service: 'urgent-processing-service', pattern: 'urgent-priority' };
        }
        
        return null;
    }
    
    convertToTimezone(date, timezone) {
        // Simple timezone conversion (in production, use a proper library)
        if (timezone === 'UTC') return date;
        
        const offset = this.getTimezoneOffset(timezone);
        return new Date(date.getTime() + offset * 60 * 60 * 1000);
    }
    
    getTimezoneOffset(timezone) {
        // Simplified timezone offsets (use proper library in production)
        const offsets = {
            'UTC': 0,
            'EST': -5,
            'PST': -8,
            'CET': 1,
            'JST': 9
        };
        
        return offsets[timezone] || 0;
    }
    
    hasFeatureFlagForRequest(req) {
        const path = req.path;
        const user = req.user;
        
        for (const [name, flag] of this.featureFlags) {
            if (flag.paths && flag.paths.some(p => path.startsWith(p))) {
                return true;
            }
            
            if (flag.users && user && flag.users.includes(user.id)) {
                return true;
            }
        }
        
        return false;
    }
    
    getFeatureFlagForRequest(req) {
        const path = req.path;
        const user = req.user;
        
        for (const [name, flag] of this.featureFlags) {
            if (!flag.enabled) continue;
            
            if (flag.paths && flag.paths.some(p => path.startsWith(p))) {
                return flag;
            }
            
            if (flag.users && user && flag.users.includes(user.id)) {
                return flag;
            }
        }
        
        return null;
    }
    
    getUserGroups(userId) {
        // Get user groups for feature flag targeting
        return this.config.userGroups?.get(userId) || [];
    }
    
    getEnvironmentHealth(service) {
        // Get health status of an environment
        return this.serviceHealth.get(service) || { healthy: true, score: 1 };
    }
    
    hashString(str) {
        return crypto.createHash('sha256').update(str).digest().readUInt32BE(0);
    }
    
    getRoutingCacheKey(req, context) {
        const parts = [
            context.service,
            req.method,
            req.path,
            req.headers['x-api-version'],
            req.user?.id,
            req.tenant?.id,
            req.ip
        ].filter(Boolean);
        
        return crypto.createHash('sha256')
            .update(parts.join(':'))
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Initialization methods
     */
    
    async initializeHashRing() {
        // Initialize consistent hash ring
        this.hashRing.clear();
        
        if (this.serviceRegistry && this.serviceRegistry.getAllServices) {
            const services = await this.serviceRegistry.getAllServices();
            
            for (const service of services) {
                if (service.instances) {
                    for (const instance of service.instances) {
                        // Create virtual nodes for better distribution
                        for (let i = 0; i < this.virtualNodes; i++) {
                            const virtualKey = `${instance.id}-${i}`;
                            const hash = this.hashString(virtualKey);
                            this.hashRing.set(hash, instance);
                        }
                    }
                }
            }
        }
        
        // Sort hash ring
        const sortedRing = new Map([...this.hashRing.entries()].sort((a, b) => a[0] - b[0]));
        this.hashRing = sortedRing;
        
        this.log('info', `Hash ring initialized with ${this.hashRing.size} virtual nodes`);
    }
    
    async initializeHealthMonitoring() {
        if (!this.failoverConfig.enabled) return;
        
        this.backgroundTasks.set('health-monitoring', setInterval(() => {
            this.checkServiceHealth();
        }, this.failoverConfig.healthCheckInterval));
        
        this.log('info', 'Health monitoring initialized');
    }
    
    async initializePerformanceMonitoring() {
        this.backgroundTasks.set('performance-monitoring', setInterval(() => {
            this.calculatePerformanceMetrics();
        }, 10000)); // Every 10 seconds
        
        this.log('info', 'Performance monitoring initialized');
    }
    
    async startBackgroundTasks() {
        // Cache cleanup
        this.backgroundTasks.set('cache-cleanup', setInterval(() => {
            this.cleanupRoutingCache();
        }, 60000)); // Every minute
        
        // Canary monitoring
        this.backgroundTasks.set('canary-monitoring', setInterval(() => {
            this.monitorCanaryDeployments();
        }, 30000)); // Every 30 seconds
        
        // A/B test monitoring
        this.backgroundTasks.set('ab-test-monitoring', setInterval(() => {
            this.monitorABTests();
        }, 60000)); // Every minute
        
        this.log('info', 'Background tasks started');
    }

    /**
     * Monitoring and maintenance methods
     */
    
    async checkServiceHealth() {
        // Check health of all service instances
        for (const [serviceName, instances] of this.serviceInstances) {
            for (const instance of instances) {
                try {
                    const health = await this.pingInstance(instance);
                    
                    this.serviceHealth.set(instance.id, {
                        healthy: health.success,
                        lastCheck: Date.now(),
                        responseTime: health.responseTime,
                        score: health.success ? 1 : 0,
                        consecutiveFailures: health.success ? 0 : 
                            (this.serviceHealth.get(instance.id)?.consecutiveFailures || 0) + 1
                    });
                    
                    // Update circuit breaker
                    this.updateCircuitBreaker(instance.id, health.success);
                    
                } catch (error) {
                    this.serviceHealth.set(instance.id, {
                        healthy: false,
                        lastCheck: Date.now(),
                        error: error.message,
                        score: 0,
                        consecutiveFailures: (this.serviceHealth.get(instance.id)?.consecutiveFailures || 0) + 1
                    });
                    
                    this.updateCircuitBreaker(instance.id, false);
                }
            }
        }
    }
    
    async pingInstance(instance) {
        // Ping service instance
        // This would make actual health check request in production
        const responseTime = Math.random() * 200; // Simulate response time
        const success = Math.random() > 0.1; // 90% success rate
        
        return {
            success,
            responseTime
        };
    }
    
    updateCircuitBreaker(instanceId, success) {
        let breaker = this.circuitBreakers.get(instanceId);
        
        if (!breaker) {
            breaker = {
                state: 'CLOSED',
                failures: 0,
                lastFailure: null,
                nextAttempt: null
            };
            this.circuitBreakers.set(instanceId, breaker);
        }
        
        if (success) {
            if (breaker.state === 'HALF_OPEN') {
                breaker.state = 'CLOSED';
                breaker.failures = 0;
            }
        } else {
            breaker.failures++;
            breaker.lastFailure = Date.now();
            
            if (breaker.failures >= this.failoverConfig.circuitBreakerThreshold) {
                breaker.state = 'OPEN';
                breaker.nextAttempt = Date.now() + this.failoverConfig.retryDelay;
            }
        }
        
        // Check if we should try half-open
        if (breaker.state === 'OPEN' && Date.now() > breaker.nextAttempt) {
            breaker.state = 'HALF_OPEN';
        }
    }
    
    calculatePerformanceMetrics() {
        // Calculate average response time
        let totalResponseTime = 0;
        let totalRequests = 0;
        let totalErrors = 0;
        
        for (const [instanceId, metrics] of this.serviceMetrics) {
            totalResponseTime += metrics.avgResponseTime * metrics.requests;
            totalRequests += metrics.requests;
            totalErrors += metrics.errors;
        }
        
        this.performanceMetrics.averageResponseTime = 
            totalRequests > 0 ? totalResponseTime / totalRequests : 0;
        
        this.performanceMetrics.errorRate = 
            totalRequests > 0 ? totalErrors / totalRequests : 0;
        
        // Calculate throughput (simplified)
        this.performanceMetrics.throughputPerSecond = totalRequests / 60; // Last minute
        
        // Reset counters
        for (const metrics of this.serviceMetrics.values()) {
            metrics.requests = 0;
            metrics.errors = 0;
        }
    }
    
    cleanupRoutingCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, entry] of this.routingCache) {
            if (now > entry.expiry) {
                this.routingCache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            this.log('debug', `Cleaned up ${cleaned} expired routing cache entries`);
        }
    }
    
    monitorCanaryDeployments() {
        for (const [service, canary] of this.canaryDeployments) {
            if (!canary.enabled || !canary.rollbackOnError) continue;
            
            const canaryMetrics = canary.metrics.canary;
            const stableMetrics = canary.metrics.stable;
            
            // Check error rate
            const canaryErrorRate = canaryMetrics.requests > 0 ? 
                canaryMetrics.errors / canaryMetrics.requests : 0;
            const stableErrorRate = stableMetrics.requests > 0 ? 
                stableMetrics.errors / stableMetrics.requests : 0;
            
            if (canaryErrorRate > canary.thresholds.errorRateThreshold ||
                (stableErrorRate > 0 && canaryErrorRate > stableErrorRate * 2)) {
                this.rollbackCanary(service, 'high-error-rate');
            }
            
            // Check response time
            if (canaryMetrics.responseTime > canary.thresholds.responseTimeThreshold ||
                (stableMetrics.responseTime > 0 && 
                 canaryMetrics.responseTime > stableMetrics.responseTime * 2)) {
                this.rollbackCanary(service, 'high-response-time');
            }
        }
    }
    
    monitorABTests() {
        for (const [service, abTest] of this.abTests) {
            if (!abTest.enabled || !abTest.automaticWinner) continue;
            
            const results = this.getABTestResults(abTest.id);
            const variants = Object.keys(results);
            
            if (variants.length < 2) continue;
            
            // Check if we have enough samples
            const totalParticipants = variants.reduce((sum, v) => 
                sum + results[v].participants, 0
            );
            
            if (totalParticipants < abTest.minimumSampleSize) continue;
            
            // Simple winner selection based on conversion rate
            const sortedVariants = variants.sort((a, b) => 
                results[b].conversionRate - results[a].conversionRate
            );
            
            const winner = sortedVariants[0];
            const winnerRate = results[winner].conversionRate;
            const loserRate = results[sortedVariants[1]].conversionRate;
            
            // Check if difference is significant (simplified)
            if (winnerRate > loserRate * 1.1 && totalParticipants > abTest.minimumSampleSize * 2) {
                this.declareABTestWinner(abTest.id, winner);
            }
        }
    }
    
    declareABTestWinner(testId, winner) {
        const service = this.findServiceByTestId(testId);
        const abTest = this.abTests.get(service);
        
        if (abTest) {
            this.log('info', `A/B test winner declared: ${winner}`, {
                testId,
                service,
                winner
            });
            
            this.emit('ab-test:winner', {
                testId,
                service,
                winner,
                results: this.getABTestResults(testId)
            });
            
            // Optionally update routing to always use winner
            if (abTest.automaticPromotion) {
                this.promoteABTestWinner(testId, winner);
            }
        }
    }
    
    findServiceByTestId(testId) {
        for (const [service, abTest] of this.abTests) {
            if (abTest.id === testId) {
                return service;
            }
        }
        return null;
    }
    
    promoteABTestWinner(testId, winner) {
        const service = this.findServiceByTestId(testId);
        const abTest = this.abTests.get(service);
        
        if (abTest && abTest.variants[winner]) {
            // Update service registry to promote winner
            const winnerService = abTest.variants[winner].service;
            
            this.log('info', `Promoting A/B test winner ${winner} to production`, {
                testId,
                service,
                winnerService
            });
            
            // Remove A/B test
            this.abTests.delete(service);
            
            this.emit('ab-test:promoted', {
                testId,
                service,
                winner,
                winnerService
            });
        }
    }

    /**
     * Event handlers
     */
    
    onServiceRegistered(service) {
        this.log('info', `Service registered: ${service.name}`);
        
        // Add to service instances
        if (!this.serviceInstances.has(service.name)) {
            this.serviceInstances.set(service.name, []);
        }
        
        if (service.instances) {
            this.serviceInstances.get(service.name).push(...service.instances);
        }
        
        // Update hash ring
        this.updateHashRing();
    }
    
    onServiceDeregistered(service) {
        this.log('info', `Service deregistered: ${service.name}`);
        
        // Remove from service instances
        this.serviceInstances.delete(service.name);
        
        // Update hash ring
        this.updateHashRing();
    }
    
    onServiceHealthChanged(service, health) {
        this.log('debug', `Service health changed: ${service.name}`, health);
        
        // Update health tracking
        if (service.instances) {
            for (const instance of service.instances) {
                this.serviceHealth.set(instance.id, health);
            }
        }
    }
    
    updateHashRing() {
        // Rebuild hash ring when services change
        this.initializeHashRing().catch(error => {
            this.log('error', 'Failed to update hash ring', error);
        });
    }
    
    updatePolicyMetrics(policyName) {
        this.evaluationMetrics.policyMatches[policyName] = 
            (this.evaluationMetrics.policyMatches[policyName] || 0) + 1;
    }
    
    updateRoutingMetrics(event) {
        // Update routing-specific metrics
        if (event.metadata && event.metadata.strategy) {
            this.evaluationMetrics.strategyUsage[event.metadata.strategy] = 
                (this.evaluationMetrics.strategyUsage[event.metadata.strategy] || 0) + 1;
        }
    }

    /**
     * Gets routing metrics
     * @returns {Object} Routing metrics
     */
    getMetrics() {
        return {
            ...this.evaluationMetrics,
            performance: this.performanceMetrics,
            policies: {
                total: this.policies.size,
                enabled: Array.from(this.policies.values()).filter(p => p.enabled).length
            },
            canaryDeployments: this.canaryDeployments.size,
            abTests: this.abTests.size,
            blueGreenDeployments: this.blueGreenDeployments.size,
            featureFlags: this.featureFlags.size,
            routingCacheSize: this.routingCache.size,
            circuitBreakers: {
                total: this.circuitBreakers.size,
                open: Array.from(this.circuitBreakers.values()).filter(cb => cb.state === 'OPEN').length,
                halfOpen: Array.from(this.circuitBreakers.values()).filter(cb => cb.state === 'HALF_OPEN').length
            },
            serviceInstances: this.serviceInstances.size,
            hashRingSize: this.hashRing.size
        };
    }

    /**
     * Performs cleanup operations
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            this.log('info', 'Cleaning up routing policy engine');
            
            // Clear background tasks
            for (const [name, task] of this.backgroundTasks) {
                clearInterval(task);
                this.log('debug', `Stopped background task: ${name}`);
            }
            this.backgroundTasks.clear();
            
            // Clear caches
            this.routingCache.clear();
            this.serviceHealth.clear();
            this.serviceMetrics.clear();
            this.serviceInstances.clear();
            this.circuitBreakers.clear();
            this.hashRing.clear();
            
            // Clear deployments
            this.canaryDeployments.clear();
            this.abTests.clear();
            this.abTestResults.clear();
            this.blueGreenDeployments.clear();
            this.featureFlags.clear();
            
            // Reset metrics
            this.evaluationMetrics = {
                totalEvaluations: 0,
                successfulRoutes: 0,
                failedRoutes: 0,
                cacheHits: 0,
                cacheMisses: 0,
                policyMatches: {},
                strategyUsage: {}
            };
            
            this.isInitialized = false;
            this.log('info', 'Routing policy engine cleanup completed');
            
        } catch (error) {
            this.log('error', 'Error during routing policy engine cleanup', error);
            throw error;
        }
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger && typeof this.logger[level] === 'function') {
            this.logger[level](message, data);
        } else {
            console[level] || console.log(message, data);
        }
    }
}

module.exports = { RoutingPolicyEngine };