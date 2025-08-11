'use strict';

/**
 * @fileoverview Request Routing Middleware - Intelligent request routing and load balancing
 * @module servers/gateway/middleware/request-routing
 * @requires events
 * @requires crypto
 * @requires url
 * @requires querystring
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { URL } = require('url');
const querystring = require('querystring');

/**
 * RequestRoutingMiddleware class provides intelligent request routing, load balancing,
 * and service discovery capabilities for the API Gateway. It implements multiple routing
 * algorithms including round-robin, least connections, weighted routing, consistent hashing,
 * and geographic routing. The middleware supports dynamic service discovery, health-aware
 * routing, sticky sessions, request transformation, and advanced routing rules based on
 * headers, query parameters, and request body content.
 * 
 * @class RequestRoutingMiddleware
 * @extends EventEmitter
 */
class RequestRoutingMiddleware extends EventEmitter {
    /**
     * Creates an instance of RequestRoutingMiddleware
     * @constructor
     * @param {Object} routingPolicy - Routing policy engine
     * @param {ServiceRegistry} serviceRegistry - Service registry for discovery
     * @param {CircuitBreakerManager} circuitBreakerManager - Circuit breaker manager
     * @param {Logger} logger - Logger instance
     */
    constructor(routingPolicy, serviceRegistry, circuitBreakerManager, logger) {
        super();
        this.routingPolicy = routingPolicy;
        this.serviceRegistry = serviceRegistry;
        this.circuitBreakerManager = circuitBreakerManager;
        this.logger = logger;
        this.isInitialized = false;
        
        // Routing algorithms
        this.routingAlgorithms = {
            'round-robin': this.roundRobinRouting.bind(this),
            'least-connections': this.leastConnectionsRouting.bind(this),
            'weighted': this.weightedRouting.bind(this),
            'random': this.randomRouting.bind(this),
            'ip-hash': this.ipHashRouting.bind(this),
            'consistent-hash': this.consistentHashRouting.bind(this),
            'geographic': this.geographicRouting.bind(this),
            'latency-based': this.latencyBasedRouting.bind(this),
            'resource-based': this.resourceBasedRouting.bind(this),
            'custom': this.customRouting.bind(this)
        };
        
        // Default routing configuration
        this.defaultConfig = {
            algorithm: 'round-robin',
            retryAttempts: 3,
            retryDelay: 1000,
            timeout: 30000,
            healthCheck: true,
            stickySession: false,
            sessionCookieName: 'gateway-session',
            sessionTTL: 3600000,
            transformRequest: true,
            transformResponse: false,
            compression: true,
            caching: true,
            logging: true,
            metrics: true
        };
        
        // Service instance tracking
        this.serviceInstances = new Map();
        this.instanceConnections = new Map();
        this.instanceLatencies = new Map();
        this.instanceResources = new Map();
        
        // Round-robin counters
        this.roundRobinCounters = new Map();
        
        // Consistent hash ring
        this.hashRing = new Map();
        this.virtualNodes = 150;
        
        // Sticky session storage
        this.stickySessionStore = new Map();
        this.sessionCleanupInterval = null;
        
        // Request transformation rules
        this.transformationRules = new Map();
        this.headerTransformations = new Map();
        this.bodyTransformations = new Map();
        
        // Routing rules and patterns
        this.routingRules = [];
        this.routePatterns = new Map();
        this.conditionalRoutes = new Map();
        
        // Geographic routing configuration
        this.geographicRegions = new Map();
        this.regionPreferences = new Map();
        
        // Load balancing weights
        this.serviceWeights = new Map();
        this.dynamicWeights = new Map();
        
        // Request context enrichment
        this.contextEnrichers = new Map();
        
        // Route caching
        this.routeCache = new Map();
        this.routeCacheTTL = 60000; // 1 minute
        
        // Statistics
        this.statistics = {
            totalRequests: 0,
            routedRequests: 0,
            failedRoutes: 0,
            retries: 0,
            stickySessionHits: 0,
            cacheHits: 0,
            cacheMisses: 0,
            routingDecisions: {},
            algorithmUsage: {},
            serviceDistribution: {},
            averageLatency: 0,
            transformations: 0
        };
        
        // Latency tracking
        this.latencyWindow = 60000; // 1 minute
        this.latencyHistory = new Map();
        
        // Connection tracking
        this.activeConnections = new Map();
        
        // Monitoring interval
        this.monitoringInterval = null;
    }

    /**
     * Initializes the request routing middleware
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('info', 'Request routing middleware already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing Request Routing Middleware');
            
            // Initialize service instances
            await this.initializeServiceInstances();
            
            // Setup consistent hash ring
            this.setupHashRing();
            
            // Load routing rules
            await this.loadRoutingRules();
            
            // Setup transformation rules
            this.setupTransformationRules();
            
            // Initialize geographic regions
            this.initializeGeographicRegions();
            
            // Start session cleanup
            this.startSessionCleanup();
            
            // Start monitoring
            this.startMonitoring();
            
            // Register service discovery listeners
            this.registerServiceListeners();
            
            this.isInitialized = true;
            this.emit('routing:initialized');
            
            this.log('info', 'Request Routing Middleware initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Request Routing Middleware', error);
            throw error;
        }
    }

    /**
     * Routes a request to the appropriate service
     * @async
     * @param {Object} req - Request object
     * @param {Object} options - Routing options
     * @returns {Promise<Object>} Routing decision
     */
    async route(req, options = {}) {
        const startTime = Date.now();
        this.statistics.totalRequests++;
        
        try {
            // Check route cache
            const cacheKey = this.getRouteCacheKey(req);
            const cachedRoute = this.routeCache.get(cacheKey);
            
            if (cachedRoute && Date.now() < cachedRoute.expiry) {
                this.statistics.cacheHits++;
                return cachedRoute.route;
            }
            
            this.statistics.cacheMisses++;
            
            // Apply routing policy
            const policyDecision = await this.applyRoutingPolicy(req);
            if (policyDecision.override) {
                return this.createRoutingDecision(policyDecision.target, req);
            }
            
            // Determine target service
            const targetService = this.determineTargetService(req, options);
            if (!targetService) {
                throw new Error('No target service found for request');
            }
            
            // Check sticky session
            if (this.defaultConfig.stickySession || options.stickySession) {
                const stickyInstance = this.getStickySessionInstance(req, targetService);
                if (stickyInstance) {
                    this.statistics.stickySessionHits++;
                    return this.createRoutingDecision(stickyInstance, req);
                }
            }
            
            // Get available instances
            const instances = await this.getHealthyInstances(targetService);
            if (instances.length === 0) {
                throw new Error(`No healthy instances available for service: ${targetService}`);
            }
            
            // Select routing algorithm
            const algorithm = options.algorithm || this.getServiceAlgorithm(targetService) || this.defaultConfig.algorithm;
            const routingFunction = this.routingAlgorithms[algorithm];
            
            if (!routingFunction) {
                throw new Error(`Unknown routing algorithm: ${algorithm}`);
            }
            
            // Select instance
            const selectedInstance = await routingFunction(req, instances, targetService, options);
            
            if (!selectedInstance) {
                throw new Error('Failed to select service instance');
            }
            
            // Create sticky session if enabled
            if (this.defaultConfig.stickySession || options.stickySession) {
                this.createStickySession(req, targetService, selectedInstance);
            }
            
            // Transform request if needed
            if (this.defaultConfig.transformRequest || options.transformRequest) {
                await this.transformRequest(req, targetService, selectedInstance);
            }
            
            // Create routing decision
            const routingDecision = this.createRoutingDecision(selectedInstance, req);
            
            // Cache routing decision
            this.cacheRoutingDecision(cacheKey, routingDecision);
            
            // Update statistics
            this.updateStatistics(targetService, algorithm, Date.now() - startTime);
            
            this.statistics.routedRequests++;
            this.emit('request:routed', { service: targetService, instance: selectedInstance.id });
            
            return routingDecision;
            
        } catch (error) {
            this.statistics.failedRoutes++;
            this.log('error', 'Routing failed', error);
            throw error;
        }
    }

    /**
     * Initializes service instances from registry
     * @private
     * @async
     */
    async initializeServiceInstances() {
        const services = this.serviceRegistry.getAllServices();
        
        for (const service of services) {
            const instances = await this.discoverServiceInstances(service);
            this.serviceInstances.set(service.name, instances);
            
            // Initialize tracking for each instance
            instances.forEach(instance => {
                this.instanceConnections.set(instance.id, 0);
                this.instanceLatencies.set(instance.id, []);
                this.instanceResources.set(instance.id, { cpu: 0, memory: 0 });
            });
        }
        
        this.log('info', `Initialized ${this.serviceInstances.size} services with instances`);
    }

    /**
     * Discovers service instances
     * @private
     * @async
     * @param {Object} service - Service configuration
     * @returns {Promise<Array>} Service instances
     */
    async discoverServiceInstances(service) {
        // In production, this would integrate with service discovery systems
        // For now, return mock instances based on service configuration
        const instances = [];
        
        if (service.instances) {
            // Multiple instances configured
            service.instances.forEach((instance, index) => {
                instances.push({
                    id: `${service.name}-${index}`,
                    name: service.name,
                    url: instance.url || service.url,
                    host: instance.host || new URL(service.url).hostname,
                    port: instance.port || new URL(service.url).port,
                    weight: instance.weight || 1,
                    zone: instance.zone || 'default',
                    region: instance.region || 'us-east-1',
                    healthy: true,
                    metadata: instance.metadata || {}
                });
            });
        } else {
            // Single instance
            instances.push({
                id: `${service.name}-0`,
                name: service.name,
                url: service.url,
                host: new URL(service.url).hostname,
                port: new URL(service.url).port || 80,
                weight: 1,
                zone: 'default',
                region: 'us-east-1',
                healthy: true,
                metadata: {}
            });
        }
        
        return instances;
    }

    /**
     * Sets up consistent hash ring
     * @private
     */
    setupHashRing() {
        this.hashRing.clear();
        
        for (const [serviceName, instances] of this.serviceInstances) {
            instances.forEach(instance => {
                // Add virtual nodes for better distribution
                for (let i = 0; i < this.virtualNodes; i++) {
                    const virtualKey = `${instance.id}:${i}`;
                    const hash = this.hashKey(virtualKey);
                    this.hashRing.set(hash, instance);
                }
            });
        }
        
        // Sort hash ring keys
        this.sortedHashKeys = Array.from(this.hashRing.keys()).sort();
        
        this.log('info', `Consistent hash ring created with ${this.hashRing.size} nodes`);
    }

    /**
     * Loads routing rules from configuration
     * @private
     * @async
     */
    async loadRoutingRules() {
        // Load routing rules from configuration or database
        this.routingRules = [
            {
                name: 'api-version-routing',
                priority: 100,
                condition: (req) => req.headers['x-api-version'] === 'v2',
                target: 'service-v2',
                transform: true
            },
            {
                name: 'beta-users',
                priority: 90,
                condition: (req) => req.headers['x-beta-user'] === 'true',
                target: 'service-beta',
                algorithm: 'random'
            },
            {
                name: 'admin-routing',
                priority: 80,
                condition: (req) => req.path.startsWith('/admin'),
                target: 'admin-service',
                algorithm: 'least-connections'
            }
        ];
        
        // Sort rules by priority
        this.routingRules.sort((a, b) => b.priority - a.priority);
        
        this.log('info', `Loaded ${this.routingRules.length} routing rules`);
    }

    /**
     * Sets up transformation rules
     * @private
     */
    setupTransformationRules() {
        // Header transformations
        this.headerTransformations.set('default', {
            add: {
                'X-Gateway-Version': '1.0.0',
                'X-Forwarded-For': (req) => req.ip,
                'X-Real-IP': (req) => req.ip,
                'X-Request-ID': (req) => req.id || crypto.randomBytes(16).toString('hex')
            },
            remove: ['X-Internal-Secret', 'X-Debug-Mode'],
            modify: {
                'User-Agent': (value, req) => `${value} Gateway/1.0`
            }
        });
        
        // Body transformations
        this.bodyTransformations.set('default', {
            wrap: false,
            unwrap: false,
            transform: null
        });
        
        // Path transformations
        this.transformationRules.set('path-rewrite', {
            rules: [
                { from: /^\/api\/v1\/(.*)/, to: '/$1' },
                { from: /^\/legacy\/(.*)/, to: '/v1/$1' }
            ]
        });
        
        this.log('info', 'Transformation rules configured');
    }

    /**
     * Initializes geographic regions
     * @private
     */
    initializeGeographicRegions() {
        // Define geographic regions and their service mappings
        this.geographicRegions.set('us-east', {
            zones: ['us-east-1', 'us-east-2'],
            primary: 'us-east-1',
            fallback: 'us-west-1'
        });
        
        this.geographicRegions.set('us-west', {
            zones: ['us-west-1', 'us-west-2'],
            primary: 'us-west-1',
            fallback: 'us-east-1'
        });
        
        this.geographicRegions.set('eu', {
            zones: ['eu-west-1', 'eu-central-1'],
            primary: 'eu-west-1',
            fallback: 'us-east-1'
        });
        
        this.geographicRegions.set('asia', {
            zones: ['ap-southeast-1', 'ap-northeast-1'],
            primary: 'ap-southeast-1',
            fallback: 'us-west-1'
        });
        
        this.log('info', 'Geographic regions initialized');
    }

    /**
     * Applies routing policy
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Policy decision
     */
    async applyRoutingPolicy(req) {
        if (!this.routingPolicy) {
            return { override: false };
        }
        
        try {
            const decision = await this.routingPolicy.evaluate(req);
            
            if (decision.action === 'route') {
                return {
                    override: true,
                    target: decision.target,
                    algorithm: decision.algorithm
                };
            } else if (decision.action === 'reject') {
                throw new Error(`Request rejected by routing policy: ${decision.reason}`);
            }
            
            return { override: false };
        } catch (error) {
            this.log('error', 'Routing policy evaluation failed', error);
            return { override: false };
        }
    }

    /**
     * Determines target service for request
     * @private
     * @param {Object} req - Request object
     * @param {Object} options - Routing options
     * @returns {string} Target service name
     */
    determineTargetService(req, options) {
        // Check explicit target
        if (options.targetService) {
            return options.targetService;
        }
        
        // Check routing rules
        for (const rule of this.routingRules) {
            if (rule.condition(req)) {
                this.log('debug', `Routing rule matched: ${rule.name}`);
                return rule.target;
            }
        }
        
        // Check path-based routing
        const pathService = this.getServiceByPath(req.path);
        if (pathService) {
            return pathService;
        }
        
        // Check header-based routing
        const headerService = req.headers['x-target-service'];
        if (headerService && this.serviceInstances.has(headerService)) {
            return headerService;
        }
        
        // Default service selection based on path prefix
        for (const [serviceName, instances] of this.serviceInstances) {
            const service = this.serviceRegistry.getService(serviceName);
            if (service && service.path && req.path.startsWith(service.path)) {
                return serviceName;
            }
        }
        
        return null;
    }

    /**
     * Gets service by path pattern
     * @private
     * @param {string} path - Request path
     * @returns {string|null} Service name
     */
    getServiceByPath(path) {
        for (const [pattern, serviceName] of this.routePatterns) {
            if (pattern.test(path)) {
                return serviceName;
            }
        }
        return null;
    }

    /**
     * Gets healthy instances for a service
     * @private
     * @async
     * @param {string} serviceName - Service name
     * @returns {Promise<Array>} Healthy instances
     */
    async getHealthyInstances(serviceName) {
        const instances = this.serviceInstances.get(serviceName) || [];
        const healthyInstances = [];
        
        for (const instance of instances) {
            // Check circuit breaker state
            if (this.circuitBreakerManager) {
                const breaker = this.circuitBreakerManager.getBreaker(instance.id);
                if (breaker && breaker.opened) {
                    continue;
                }
            }
            
            // Check instance health
            if (instance.healthy !== false) {
                healthyInstances.push(instance);
            }
        }
        
        return healthyInstances;
    }

    /**
     * Gets service-specific routing algorithm
     * @private
     * @param {string} serviceName - Service name
     * @returns {string|null} Algorithm name
     */
    getServiceAlgorithm(serviceName) {
        const service = this.serviceRegistry.getService(serviceName);
        return service?.routingAlgorithm || null;
    }

    /**
     * Round-robin routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @param {string} serviceName - Service name
     * @returns {Promise<Object>} Selected instance
     */
    async roundRobinRouting(req, instances, serviceName) {
        const counter = this.roundRobinCounters.get(serviceName) || 0;
        const selectedIndex = counter % instances.length;
        const selectedInstance = instances[selectedIndex];
        
        this.roundRobinCounters.set(serviceName, counter + 1);
        
        return selectedInstance;
    }

    /**
     * Least connections routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async leastConnectionsRouting(req, instances) {
        let minConnections = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const connections = this.instanceConnections.get(instance.id) || 0;
            if (connections < minConnections) {
                minConnections = connections;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }

    /**
     * Weighted routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async weightedRouting(req, instances) {
        const totalWeight = instances.reduce((sum, instance) => sum + (instance.weight || 1), 0);
        let random = Math.random() * totalWeight;
        
        for (const instance of instances) {
            random -= (instance.weight || 1);
            if (random <= 0) {
                return instance;
            }
        }
        
        return instances[0];
    }

    /**
     * Random routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async randomRouting(req, instances) {
        const randomIndex = Math.floor(Math.random() * instances.length);
        return instances[randomIndex];
    }

    /**
     * IP hash routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async ipHashRouting(req, instances) {
        const hash = this.hashKey(req.ip);
        const index = hash % instances.length;
        return instances[index];
    }

    /**
     * Consistent hash routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async consistentHashRouting(req, instances) {
        const requestKey = req.headers['x-session-id'] || req.ip;
        const hash = this.hashKey(requestKey);
        
        // Find the next node in the hash ring
        let selectedInstance = null;
        for (const nodeHash of this.sortedHashKeys) {
            if (nodeHash >= hash) {
                selectedInstance = this.hashRing.get(nodeHash);
                break;
            }
        }
        
        // Wrap around to the first node if needed
        if (!selectedInstance) {
            selectedInstance = this.hashRing.get(this.sortedHashKeys[0]);
        }
        
        // Ensure selected instance is in the available instances
        if (!instances.find(i => i.id === selectedInstance.id)) {
            return this.randomRouting(req, instances);
        }
        
        return selectedInstance;
    }

    /**
     * Geographic routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async geographicRouting(req, instances) {
        const clientRegion = this.getClientRegion(req);
        
        // Filter instances by region
        const regionalInstances = instances.filter(instance => 
            instance.region === clientRegion
        );
        
        if (regionalInstances.length > 0) {
            return this.roundRobinRouting(req, regionalInstances);
        }
        
        // Fallback to nearest region
        const nearestRegion = this.getNearestRegion(clientRegion);
        const nearestInstances = instances.filter(instance =>
            instance.region === nearestRegion
        );
        
        if (nearestInstances.length > 0) {
            return this.roundRobinRouting(req, nearestInstances);
        }
        
        // Fallback to any instance
        return this.roundRobinRouting(req, instances);
    }

    /**
     * Latency-based routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async latencyBasedRouting(req, instances) {
        let minLatency = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const latencies = this.instanceLatencies.get(instance.id) || [];
            if (latencies.length === 0) {
                // No latency data, treat as best option initially
                return instance;
            }
            
            const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            if (avgLatency < minLatency) {
                minLatency = avgLatency;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance || instances[0];
    }

    /**
     * Resource-based routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @returns {Promise<Object>} Selected instance
     */
    async resourceBasedRouting(req, instances) {
        let bestScore = -Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const resources = this.instanceResources.get(instance.id);
            if (!resources) continue;
            
            // Calculate resource score (lower CPU and memory usage is better)
            const score = (100 - resources.cpu) + (100 - resources.memory);
            
            if (score > bestScore) {
                bestScore = score;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance || instances[0];
    }

    /**
     * Custom routing algorithm
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {Array} instances - Available instances
     * @param {string} serviceName - Service name
     * @param {Object} options - Routing options
     * @returns {Promise<Object>} Selected instance
     */
    async customRouting(req, instances, serviceName, options) {
        if (options.customRoutingFunction) {
            return await options.customRoutingFunction(req, instances, serviceName);
        }
        
        // Default to round-robin
        return this.roundRobinRouting(req, instances, serviceName);
    }

    /**
     * Gets sticky session instance
     * @private
     * @param {Object} req - Request object
     * @param {string} serviceName - Service name
     * @returns {Object|null} Sticky instance
     */
    getStickySessionInstance(req, serviceName) {
        const sessionId = this.getSessionId(req);
        if (!sessionId) return null;
        
        const sessionKey = `${serviceName}:${sessionId}`;
        const session = this.stickySessionStore.get(sessionKey);
        
        if (session && Date.now() < session.expiry) {
            // Verify instance is still healthy
            const instances = this.serviceInstances.get(serviceName) || [];
            const instance = instances.find(i => i.id === session.instanceId);
            
            if (instance && instance.healthy !== false) {
                return instance;
            }
        }
        
        // Clean up expired session
        if (session) {
            this.stickySessionStore.delete(sessionKey);
        }
        
        return null;
    }

    /**
     * Creates sticky session
     * @private
     * @param {Object} req - Request object
     * @param {string} serviceName - Service name
     * @param {Object} instance - Selected instance
     */
    createStickySession(req, serviceName, instance) {
        const sessionId = this.getSessionId(req) || this.generateSessionId();
        const sessionKey = `${serviceName}:${sessionId}`;
        
        this.stickySessionStore.set(sessionKey, {
            instanceId: instance.id,
            createdAt: Date.now(),
            expiry: Date.now() + this.defaultConfig.sessionTTL
        });
        
        // Set session cookie if needed
        if (!this.getSessionId(req)) {
            req.sessionId = sessionId;
        }
    }

    /**
     * Gets session ID from request
     * @private
     * @param {Object} req - Request object
     * @returns {string|null} Session ID
     */
    getSessionId(req) {
        // Check cookie
        if (req.cookies && req.cookies[this.defaultConfig.sessionCookieName]) {
            return req.cookies[this.defaultConfig.sessionCookieName];
        }
        
        // Check header
        if (req.headers['x-session-id']) {
            return req.headers['x-session-id'];
        }
        
        return null;
    }

    /**
     * Generates session ID
     * @private
     * @returns {string} Session ID
     */
    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Transforms request before routing
     * @private
     * @async
     * @param {Object} req - Request object
     * @param {string} serviceName - Service name
     * @param {Object} instance - Target instance
     */
    async transformRequest(req, serviceName, instance) {
        this.statistics.transformations++;
        
        // Apply header transformations
        const headerTransform = this.headerTransformations.get(serviceName) || 
                               this.headerTransformations.get('default');
        
        if (headerTransform) {
            // Add headers
            if (headerTransform.add) {
                for (const [key, value] of Object.entries(headerTransform.add)) {
                    req.headers[key.toLowerCase()] = typeof value === 'function' ? value(req) : value;
                }
            }
            
            // Remove headers
            if (headerTransform.remove) {
                headerTransform.remove.forEach(header => {
                    delete req.headers[header.toLowerCase()];
                });
            }
            
            // Modify headers
            if (headerTransform.modify) {
                for (const [key, modifier] of Object.entries(headerTransform.modify)) {
                    const currentValue = req.headers[key.toLowerCase()];
                    if (currentValue) {
                        req.headers[key.toLowerCase()] = modifier(currentValue, req);
                    }
                }
            }
        }
        
        // Apply path transformations
        const pathTransform = this.transformationRules.get('path-rewrite');
        if (pathTransform) {
            for (const rule of pathTransform.rules) {
                if (rule.from.test(req.path)) {
                    req.originalPath = req.path;
                    req.path = req.path.replace(rule.from, rule.to);
                    req.url = req.path + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
                    break;
                }
            }
        }
        
        // Add routing metadata
        req.headers['x-routed-by'] = 'api-gateway';
        req.headers['x-target-service'] = serviceName;
        req.headers['x-target-instance'] = instance.id;
        req.headers['x-forwarded-host'] = req.headers.host;
        req.headers['x-forwarded-proto'] = req.protocol;
    }

    /**
     * Creates routing decision
     * @private
     * @param {Object} instance - Selected instance
     * @param {Object} req - Request object
     * @returns {Object} Routing decision
     */
    createRoutingDecision(instance, req) {
        return {
            instance: {
                id: instance.id,
                url: instance.url,
                host: instance.host,
                port: instance.port
            },
            service: instance.name,
            algorithm: this.lastUsedAlgorithm,
            timestamp: Date.now(),
            transformations: req.transformations || [],
            metadata: {
                region: instance.region,
                zone: instance.zone,
                weight: instance.weight
            }
        };
    }

    /**
     * Gets route cache key
     * @private
     * @param {Object} req - Request object
     * @returns {string} Cache key
     */
    getRouteCacheKey(req) {
        const parts = [
            req.method,
            req.path,
            req.headers['x-api-version'] || 'v1',
            req.headers['x-tenant-id'] || 'default'
        ];
        
        return crypto.createHash('sha256')
            .update(parts.join(':'))
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Caches routing decision
     * @private
     * @param {string} key - Cache key
     * @param {Object} decision - Routing decision
     */
    cacheRoutingDecision(key, decision) {
        this.routeCache.set(key, {
            route: decision,
            expiry: Date.now() + this.routeCacheTTL
        });
        
        // Limit cache size
        if (this.routeCache.size > 1000) {
            const firstKey = this.routeCache.keys().next().value;
            this.routeCache.delete(firstKey);
        }
    }

    /**
     * Updates routing statistics
     * @private
     * @param {string} serviceName - Service name
     * @param {string} algorithm - Algorithm used
     * @param {number} latency - Routing latency
     */
    updateStatistics(serviceName, algorithm, latency) {
        // Update algorithm usage
        this.statistics.algorithmUsage[algorithm] = 
            (this.statistics.algorithmUsage[algorithm] || 0) + 1;
        
        // Update service distribution
        this.statistics.serviceDistribution[serviceName] = 
            (this.statistics.serviceDistribution[serviceName] || 0) + 1;
        
        // Update average latency
        const totalRequests = this.statistics.routedRequests + 1;
        this.statistics.averageLatency = 
            (this.statistics.averageLatency * this.statistics.routedRequests + latency) / totalRequests;
        
        // Store algorithm for decision
        this.lastUsedAlgorithm = algorithm;
    }

    /**
     * Updates instance connection count
     * @param {string} instanceId - Instance ID
     * @param {number} delta - Change in connections
     */
    updateConnectionCount(instanceId, delta) {
        const current = this.instanceConnections.get(instanceId) || 0;
        this.instanceConnections.set(instanceId, Math.max(0, current + delta));
    }

    /**
     * Records instance latency
     * @param {string} instanceId - Instance ID
     * @param {number} latency - Request latency
     */
    recordInstanceLatency(instanceId, latency) {
        const latencies = this.instanceLatencies.get(instanceId) || [];
        latencies.push(latency);
        
        // Keep only recent latencies
        const cutoff = Date.now() - this.latencyWindow;
        const recentLatencies = latencies.filter((l, i) => {
            const timestamp = Date.now() - (latencies.length - i) * 1000;
            return timestamp > cutoff;
        });
        
        this.instanceLatencies.set(instanceId, recentLatencies);
    }

    /**
     * Updates instance resources
     * @param {string} instanceId - Instance ID
     * @param {Object} resources - Resource usage
     */
    updateInstanceResources(instanceId, resources) {
        this.instanceResources.set(instanceId, {
            cpu: resources.cpu || 0,
            memory: resources.memory || 0,
            timestamp: Date.now()
        });
    }

    /**
     * Hashes a key
     * @private
     * @param {string} key - Key to hash
     * @returns {number} Hash value
     */
    hashKey(key) {
        const hash = crypto.createHash('sha1').update(key).digest();
        return hash.readUInt32BE(0);
    }

    /**
     * Gets client region from request
     * @private
     * @param {Object} req - Request object
     * @returns {string} Client region
     */
    getClientRegion(req) {
        // Check CloudFlare header
        if (req.headers['cf-ipcountry']) {
            return this.countryToRegion(req.headers['cf-ipcountry']);
        }
        
        // Check custom header
        if (req.headers['x-client-region']) {
            return req.headers['x-client-region'];
        }
        
        // Default region
        return 'us-east-1';
    }

    /**
     * Maps country to region
     * @private
     * @param {string} country - Country code
     * @returns {string} Region
     */
    countryToRegion(country) {
        const regionMap = {
            'US': 'us-east-1',
            'CA': 'us-east-1',
            'GB': 'eu-west-1',
            'DE': 'eu-central-1',
            'FR': 'eu-west-1',
            'JP': 'ap-northeast-1',
            'SG': 'ap-southeast-1',
            'AU': 'ap-southeast-2'
        };
        
        return regionMap[country] || 'us-east-1';
    }

    /**
     * Gets nearest region
     * @private
     * @param {string} region - Current region
     * @returns {string} Nearest region
     */
    getNearestRegion(region) {
        const nearestMap = {
            'us-east-1': 'us-west-1',
            'us-west-1': 'us-east-1',
            'eu-west-1': 'eu-central-1',
            'eu-central-1': 'eu-west-1',
            'ap-southeast-1': 'ap-northeast-1',
            'ap-northeast-1': 'ap-southeast-1'
        };
        
        return nearestMap[region] || 'us-east-1';
    }

    /**
     * Starts session cleanup
     * @private
     */
    startSessionCleanup() {
        this.sessionCleanupInterval = setInterval(() => {
            const now = Date.now();
            
            for (const [key, session] of this.stickySessionStore) {
                if (session.expiry < now) {
                    this.stickySessionStore.delete(key);
                }
            }
            
            // Clean route cache
            for (const [key, cached] of this.routeCache) {
                if (cached.expiry < now) {
                    this.routeCache.delete(key);
                }
            }
        }, 60000); // Every minute
        
        this.log('info', 'Session cleanup started');
    }

    /**
     * Starts monitoring
     * @private
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.emit('routing:statistics', this.getStatistics());
        }, 30000); // Every 30 seconds
        
        this.log('info', 'Routing monitoring started');
    }

    /**
     * Registers service discovery listeners
     * @private
     */
    registerServiceListeners() {
        if (!this.serviceRegistry) return;
        
        this.serviceRegistry.on('service:registered', async (service) => {
            const instances = await this.discoverServiceInstances(service);
            this.serviceInstances.set(service.name, instances);
            this.setupHashRing();
        });
        
        this.serviceRegistry.on('service:deregistered', (service) => {
            this.serviceInstances.delete(service.name);
            this.setupHashRing();
        });
        
        this.serviceRegistry.on('service:healthy', (service) => {
            const instances = this.serviceInstances.get(service.name);
            if (instances) {
                instances.forEach(instance => {
                    if (instance.name === service.name) {
                        instance.healthy = true;
                    }
                });
            }
        });
        
        this.serviceRegistry.on('service:unhealthy', (service) => {
            const instances = this.serviceInstances.get(service.name);
            if (instances) {
                instances.forEach(instance => {
                    if (instance.name === service.name) {
                        instance.healthy = false;
                    }
                });
            }
        });
    }

    /**
     * Gets routing statistics
     * @returns {Object} Routing statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            activeServices: this.serviceInstances.size,
            totalInstances: Array.from(this.serviceInstances.values())
                .reduce((sum, instances) => sum + instances.length, 0),
            healthyInstances: Array.from(this.serviceInstances.values())
                .reduce((sum, instances) => sum + instances.filter(i => i.healthy).length, 0),
            stickySessions: this.stickySessionStore.size,
            routeCacheSize: this.routeCache.size,
            activeConnections: Object.fromEntries(this.instanceConnections)
        };
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
        this.log('info', 'Cleaning up Request Routing Middleware');
        
        // Clear intervals
        if (this.sessionCleanupInterval) {
            clearInterval(this.sessionCleanupInterval);
        }
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        // Clear maps
        this.serviceInstances.clear();
        this.instanceConnections.clear();
        this.instanceLatencies.clear();
        this.instanceResources.clear();
        this.roundRobinCounters.clear();
        this.hashRing.clear();
        this.stickySessionStore.clear();
        this.transformationRules.clear();
        this.headerTransformations.clear();
        this.bodyTransformations.clear();
        this.routePatterns.clear();
        this.conditionalRoutes.clear();
        this.geographicRegions.clear();
        this.serviceWeights.clear();
        this.routeCache.clear();
        
        this.isInitialized = false;
        this.emit('routing:cleanup');
    }
}

module.exports = { RequestRoutingMiddleware };