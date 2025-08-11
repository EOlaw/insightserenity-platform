'use strict';

/**
 * @fileoverview Load Balancer - Advanced load balancing algorithms for API Gateway
 * @module servers/gateway/utils/load-balancer
 * @requires events
 * @requires crypto
 * @requires dns
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const dns = require('dns').promises;

/**
 * LoadBalancer class implements comprehensive load balancing strategies for the API Gateway.
 * It provides multiple algorithms, health checking, adaptive routing, session affinity,
 * and dynamic weight adjustment based on real-time metrics.
 */
class LoadBalancer extends EventEmitter {
    /**
     * Creates an instance of LoadBalancer
     * @constructor
     * @param {Object} config - Load balancer configuration
     * @param {Object} logger - Logger instance
     */
    constructor(config = {}, logger = console) {
        super();
        this.config = this.mergeConfig(config);
        this.logger = logger;
        
        // Instance pools
        this.instancePools = new Map();
        this.instanceMetrics = new Map();
        this.instanceHealth = new Map();
        
        // Load balancing algorithms
        this.algorithms = new Map();
        this.initializeAlgorithms();
        
        // Session affinity
        this.sessionAffinity = new Map();
        this.affinityTimeout = config.affinityTimeout || 3600000; // 1 hour
        
        // Consistent hashing
        this.hashRing = new Map();
        this.virtualNodes = config.virtualNodes || 150;
        
        // Weight management
        this.instanceWeights = new Map();
        this.dynamicWeighting = config.dynamicWeighting !== false;
        
        // Health checking
        this.healthChecks = new Map();
        this.healthCheckInterval = config.healthCheckInterval || 30000;
        this.healthCheckTimeout = config.healthCheckTimeout || 5000;
        
        // Circuit breaker integration
        this.circuitBreakers = new Map();
        this.circuitBreakerConfig = {
            threshold: config.circuitBreaker?.threshold || 5,
            timeout: config.circuitBreaker?.timeout || 60000,
            resetTimeout: config.circuitBreaker?.resetTimeout || 30000
        };
        
        // Adaptive routing
        this.adaptiveRouting = {
            enabled: config.adaptiveRouting?.enabled !== false,
            learningRate: config.adaptiveRouting?.learningRate || 0.1,
            explorationRate: config.adaptiveRouting?.explorationRate || 0.1
        };
        
        // Performance tracking
        this.performanceHistory = new Map();
        this.performanceWindow = config.performanceWindow || 60000; // 1 minute
        
        // Statistics
        this.statistics = {
            totalRequests: 0,
            algorithmUsage: {},
            instanceDistribution: {},
            failovers: 0,
            healthCheckFailures: 0,
            affinityHits: 0,
            affinityMisses: 0
        };
        
        // Connection tracking
        this.activeConnections = new Map();
        this.connectionLimits = new Map();
        
        // Geographic routing
        this.geoRouting = {
            enabled: config.geoRouting?.enabled || false,
            regions: new Map()
        };
        
        // Service discovery
        this.serviceDiscovery = {
            enabled: config.serviceDiscovery?.enabled || false,
            provider: config.serviceDiscovery?.provider || 'consul',
            refreshInterval: config.serviceDiscovery?.refreshInterval || 30000
        };
        
        // Least pending requests tracking
        this.pendingRequests = new Map();
        
        // Response time tracking
        this.responseTimeBuffer = new Map();
        this.responseTimeWindowSize = 100;
        
        // Start background tasks
        this.startBackgroundTasks();
    }

    /**
     * Merges configuration with defaults
     * @private
     * @param {Object} config - User configuration
     * @returns {Object} Merged configuration
     */
    mergeConfig(config) {
        return {
            algorithm: config.algorithm || 'round-robin',
            fallbackAlgorithm: config.fallbackAlgorithm || 'random',
            
            healthCheck: {
                enabled: config.healthCheck?.enabled !== false,
                path: config.healthCheck?.path || '/health',
                interval: config.healthCheck?.interval || 30000,
                timeout: config.healthCheck?.timeout || 5000,
                unhealthyThreshold: config.healthCheck?.unhealthyThreshold || 3,
                healthyThreshold: config.healthCheck?.healthyThreshold || 2
            },
            
            sessionAffinity: {
                enabled: config.sessionAffinity?.enabled || false,
                cookieName: config.sessionAffinity?.cookieName || 'SERVERID',
                headerName: config.sessionAffinity?.headerName || 'x-session-id',
                timeout: config.sessionAffinity?.timeout || 3600000
            },
            
            weights: {
                default: config.weights?.default || 1,
                dynamic: config.weights?.dynamic !== false,
                factors: {
                    responseTime: config.weights?.factors?.responseTime || 0.4,
                    errorRate: config.weights?.factors?.errorRate || 0.3,
                    activeConnections: config.weights?.factors?.activeConnections || 0.3
                }
            },
            
            limits: {
                maxConnections: config.limits?.maxConnections || 1000,
                maxRequestsPerSecond: config.limits?.maxRequestsPerSecond || 100,
                maxPendingRequests: config.limits?.maxPendingRequests || 100
            },
            
            retryPolicy: {
                enabled: config.retryPolicy?.enabled !== false,
                maxRetries: config.retryPolicy?.maxRetries || 3,
                retryOn: config.retryPolicy?.retryOn || ['5xx', 'connect-failure', 'reset']
            },
            
            ...config
        };
    }

    /**
     * Initializes load balancing algorithms
     * @private
     */
    initializeAlgorithms() {
        // Round Robin
        this.algorithms.set('round-robin', {
            name: 'Round Robin',
            select: this.roundRobinSelect.bind(this),
            init: this.roundRobinInit.bind(this),
            state: new Map()
        });

        // Weighted Round Robin
        this.algorithms.set('weighted-round-robin', {
            name: 'Weighted Round Robin',
            select: this.weightedRoundRobinSelect.bind(this),
            init: this.weightedRoundRobinInit.bind(this),
            state: new Map()
        });

        // Least Connections
        this.algorithms.set('least-connections', {
            name: 'Least Connections',
            select: this.leastConnectionsSelect.bind(this),
            init: this.leastConnectionsInit.bind(this),
            state: new Map()
        });

        // Weighted Least Connections
        this.algorithms.set('weighted-least-connections', {
            name: 'Weighted Least Connections',
            select: this.weightedLeastConnectionsSelect.bind(this),
            init: this.weightedLeastConnectionsInit.bind(this),
            state: new Map()
        });

        // Least Response Time
        this.algorithms.set('least-response-time', {
            name: 'Least Response Time',
            select: this.leastResponseTimeSelect.bind(this),
            init: this.leastResponseTimeInit.bind(this),
            state: new Map()
        });

        // Random
        this.algorithms.set('random', {
            name: 'Random',
            select: this.randomSelect.bind(this),
            init: this.randomInit.bind(this),
            state: new Map()
        });

        // Weighted Random
        this.algorithms.set('weighted-random', {
            name: 'Weighted Random',
            select: this.weightedRandomSelect.bind(this),
            init: this.weightedRandomInit.bind(this),
            state: new Map()
        });

        // IP Hash
        this.algorithms.set('ip-hash', {
            name: 'IP Hash',
            select: this.ipHashSelect.bind(this),
            init: this.ipHashInit.bind(this),
            state: new Map()
        });

        // Consistent Hash
        this.algorithms.set('consistent-hash', {
            name: 'Consistent Hash',
            select: this.consistentHashSelect.bind(this),
            init: this.consistentHashInit.bind(this),
            state: new Map()
        });

        // Least Pending Requests
        this.algorithms.set('least-pending', {
            name: 'Least Pending Requests',
            select: this.leastPendingSelect.bind(this),
            init: this.leastPendingInit.bind(this),
            state: new Map()
        });

        // Resource Based
        this.algorithms.set('resource-based', {
            name: 'Resource Based',
            select: this.resourceBasedSelect.bind(this),
            init: this.resourceBasedInit.bind(this),
            state: new Map()
        });

        // Adaptive
        this.algorithms.set('adaptive', {
            name: 'Adaptive',
            select: this.adaptiveSelect.bind(this),
            init: this.adaptiveInit.bind(this),
            state: new Map()
        });

        // Power of Two Choices
        this.algorithms.set('power-of-two', {
            name: 'Power of Two Choices',
            select: this.powerOfTwoSelect.bind(this),
            init: this.powerOfTwoInit.bind(this),
            state: new Map()
        });

        // Maglev Consistent Hashing
        this.algorithms.set('maglev', {
            name: 'Maglev',
            select: this.maglevSelect.bind(this),
            init: this.maglevInit.bind(this),
            state: new Map()
        });
    }

    /**
     * Main load balancing method
     * @param {string} service - Service name
     * @param {Object} context - Request context
     * @returns {Object|null} Selected instance
     */
    async balance(service, context = {}) {
        this.statistics.totalRequests++;
        
        // Get instance pool
        const pool = this.instancePools.get(service);
        
        if (!pool || pool.length === 0) {
            this.logger.error(`No instances available for service: ${service}`);
            return null;
        }
        
        // Check session affinity
        if (this.config.sessionAffinity.enabled) {
            const affinityInstance = this.checkSessionAffinity(context, pool);
            
            if (affinityInstance) {
                this.statistics.affinityHits++;
                return affinityInstance;
            }
            
            this.statistics.affinityMisses++;
        }
        
        // Filter healthy instances
        const healthyInstances = await this.getHealthyInstances(pool);
        
        if (healthyInstances.length === 0) {
            this.logger.warn(`No healthy instances for service: ${service}`);
            
            // Try failover
            return this.attemptFailover(service, context);
        }
        
        // Select algorithm
        const algorithmName = context.algorithm || this.config.algorithm;
        const algorithm = this.algorithms.get(algorithmName);
        
        if (!algorithm) {
            this.logger.error(`Unknown algorithm: ${algorithmName}`);
            return null;
        }
        
        // Update statistics
        this.statistics.algorithmUsage[algorithmName] = 
            (this.statistics.algorithmUsage[algorithmName] || 0) + 1;
        
        // Select instance
        const instance = await algorithm.select(service, healthyInstances, context);
        
        if (instance) {
            // Update tracking
            this.trackSelection(service, instance, algorithmName);
            
            // Set session affinity if enabled
            if (this.config.sessionAffinity.enabled) {
                this.setSessionAffinity(context, instance);
            }
            
            return instance;
        }
        
        // Fallback
        return this.fallbackSelection(service, healthyInstances, context);
    }

    /**
     * Algorithm implementations
     */
    
    // Round Robin
    roundRobinInit(service) {
        this.algorithms.get('round-robin').state.set(service, { counter: 0 });
    }
    
    roundRobinSelect(service, instances, context) {
        const state = this.algorithms.get('round-robin').state.get(service);
        
        if (!state) {
            this.roundRobinInit(service);
            return this.roundRobinSelect(service, instances, context);
        }
        
        const instance = instances[state.counter % instances.length];
        state.counter++;
        
        return instance;
    }
    
    // Weighted Round Robin
    weightedRoundRobinInit(service) {
        this.algorithms.get('weighted-round-robin').state.set(service, {
            counter: 0,
            currentWeight: 0,
            effectiveWeights: new Map()
        });
    }
    
    weightedRoundRobinSelect(service, instances, context) {
        const state = this.algorithms.get('weighted-round-robin').state.get(service);
        
        if (!state) {
            this.weightedRoundRobinInit(service);
            return this.weightedRoundRobinSelect(service, instances, context);
        }
        
        let totalWeight = 0;
        let maxWeight = -1;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const weight = this.getInstanceWeight(instance);
            totalWeight += weight;
            
            // Update effective weight
            let effectiveWeight = state.effectiveWeights.get(instance.id) || weight;
            effectiveWeight += weight;
            state.effectiveWeights.set(instance.id, effectiveWeight);
            
            if (effectiveWeight > maxWeight) {
                maxWeight = effectiveWeight;
                selectedInstance = instance;
            }
        }
        
        if (selectedInstance) {
            const currentEffective = state.effectiveWeights.get(selectedInstance.id);
            state.effectiveWeights.set(selectedInstance.id, currentEffective - totalWeight);
        }
        
        return selectedInstance;
    }
    
    // Least Connections
    leastConnectionsInit(service) {
        // No initialization needed
    }
    
    leastConnectionsSelect(service, instances, context) {
        let minConnections = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const connections = this.getActiveConnections(instance);
            
            if (connections < minConnections) {
                minConnections = connections;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }
    
    // Weighted Least Connections
    weightedLeastConnectionsInit(service) {
        // No initialization needed
    }
    
    weightedLeastConnectionsSelect(service, instances, context) {
        let minRatio = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const connections = this.getActiveConnections(instance);
            const weight = this.getInstanceWeight(instance);
            const ratio = connections / weight;
            
            if (ratio < minRatio) {
                minRatio = ratio;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }
    
    // Least Response Time
    leastResponseTimeInit(service) {
        // No initialization needed
    }
    
    leastResponseTimeSelect(service, instances, context) {
        let minResponseTime = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const responseTime = this.getAverageResponseTime(instance);
            
            if (responseTime < minResponseTime) {
                minResponseTime = responseTime;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }
    
    // Random
    randomInit(service) {
        // No initialization needed
    }
    
    randomSelect(service, instances, context) {
        const index = Math.floor(Math.random() * instances.length);
        return instances[index];
    }
    
    // Weighted Random
    weightedRandomInit(service) {
        // No initialization needed
    }
    
    weightedRandomSelect(service, instances, context) {
        const totalWeight = instances.reduce((sum, instance) => 
            sum + this.getInstanceWeight(instance), 0
        );
        
        let random = Math.random() * totalWeight;
        
        for (const instance of instances) {
            random -= this.getInstanceWeight(instance);
            
            if (random <= 0) {
                return instance;
            }
        }
        
        return instances[instances.length - 1];
    }
    
    // IP Hash
    ipHashInit(service) {
        // No initialization needed
    }
    
    ipHashSelect(service, instances, context) {
        const ip = context.clientIp || '127.0.0.1';
        const hash = this.hashString(ip);
        const index = hash % instances.length;
        
        return instances[index];
    }
    
    // Consistent Hash
    consistentHashInit(service) {
        this.buildHashRing(service);
    }
    
    consistentHashSelect(service, instances, context) {
        const key = context.sessionId || context.clientIp || this.generateRandomKey();
        const hash = this.hashString(key);
        
        const ring = this.hashRing.get(service);
        
        if (!ring || ring.size === 0) {
            this.consistentHashInit(service);
            return this.consistentHashSelect(service, instances, context);
        }
        
        // Find the next node in the ring
        let selectedInstance = null;
        
        for (const [nodeHash, instance] of ring) {
            if (nodeHash >= hash) {
                // Check if instance is in healthy list
                if (instances.find(i => i.id === instance.id)) {
                    selectedInstance = instance;
                    break;
                }
            }
        }
        
        // Wrap around if needed
        if (!selectedInstance) {
            for (const [nodeHash, instance] of ring) {
                if (instances.find(i => i.id === instance.id)) {
                    selectedInstance = instance;
                    break;
                }
            }
        }
        
        return selectedInstance;
    }
    
    // Least Pending Requests
    leastPendingInit(service) {
        // No initialization needed
    }
    
    leastPendingSelect(service, instances, context) {
        let minPending = Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const pending = this.getPendingRequests(instance);
            
            if (pending < minPending) {
                minPending = pending;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }
    
    // Resource Based
    resourceBasedInit(service) {
        // No initialization needed
    }
    
    resourceBasedSelect(service, instances, context) {
        let bestScore = -Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const score = this.calculateResourceScore(instance);
            
            if (score > bestScore) {
                bestScore = score;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance;
    }
    
    // Adaptive
    adaptiveInit(service) {
        this.algorithms.get('adaptive').state.set(service, {
            rewards: new Map(),
            selections: new Map()
        });
    }
    
    adaptiveSelect(service, instances, context) {
        if (!this.adaptiveRouting.enabled) {
            return this.leastConnectionsSelect(service, instances, context);
        }
        
        const state = this.algorithms.get('adaptive').state.get(service);
        
        if (!state) {
            this.adaptiveInit(service);
            return this.adaptiveSelect(service, instances, context);
        }
        
        // Epsilon-greedy strategy
        if (Math.random() < this.adaptiveRouting.explorationRate) {
            // Explore: random selection
            return instances[Math.floor(Math.random() * instances.length)];
        }
        
        // Exploit: select best performing
        let bestReward = -Infinity;
        let selectedInstance = null;
        
        for (const instance of instances) {
            const reward = state.rewards.get(instance.id) || 0;
            
            if (reward > bestReward) {
                bestReward = reward;
                selectedInstance = instance;
            }
        }
        
        return selectedInstance || instances[0];
    }
    
    // Power of Two Choices
    powerOfTwoInit(service) {
        // No initialization needed
    }
    
    powerOfTwoSelect(service, instances, context) {
        if (instances.length <= 2) {
            return this.leastConnectionsSelect(service, instances, context);
        }
        
        // Select two random instances
        const index1 = Math.floor(Math.random() * instances.length);
        let index2 = Math.floor(Math.random() * instances.length);
        
        while (index2 === index1) {
            index2 = Math.floor(Math.random() * instances.length);
        }
        
        const instance1 = instances[index1];
        const instance2 = instances[index2];
        
        // Choose the one with fewer connections
        const conn1 = this.getActiveConnections(instance1);
        const conn2 = this.getActiveConnections(instance2);
        
        return conn1 <= conn2 ? instance1 : instance2;
    }
    
    // Maglev Consistent Hashing
    maglevInit(service) {
        this.buildMaglevTable(service);
    }
    
    maglevSelect(service, instances, context) {
        const table = this.algorithms.get('maglev').state.get(service);
        
        if (!table) {
            this.maglevInit(service);
            return this.maglevSelect(service, instances, context);
        }
        
        const key = context.sessionId || context.clientIp || this.generateRandomKey();
        const hash = this.hashString(key);
        const index = hash % table.length;
        
        const instanceId = table[index];
        const instance = instances.find(i => i.id === instanceId);
        
        if (!instance) {
            // Rebuild table if instance not found
            this.maglevInit(service);
            return this.maglevSelect(service, instances, context);
        }
        
        return instance;
    }

    /**
     * Health checking
     */
    
    async getHealthyInstances(instances) {
        const healthy = [];
        
        for (const instance of instances) {
            if (await this.isHealthy(instance)) {
                healthy.push(instance);
            }
        }
        
        return healthy;
    }
    
    async isHealthy(instance) {
        const health = this.instanceHealth.get(instance.id);
        
        if (!health) {
            // Assume healthy if no health data
            return true;
        }
        
        // Check circuit breaker
        const breaker = this.circuitBreakers.get(instance.id);
        if (breaker && breaker.state === 'open') {
            return false;
        }
        
        return health.status === 'healthy';
    }
    
    async performHealthCheck(instance) {
        const startTime = Date.now();
        
        try {
            // Simulate health check (in production, make actual HTTP request)
            const response = await this.makeHealthCheckRequest(instance);
            
            const responseTime = Date.now() - startTime;
            
            this.updateInstanceHealth(instance, {
                status: response.status === 200 ? 'healthy' : 'unhealthy',
                responseTime,
                lastCheck: Date.now(),
                consecutiveFailures: 0
            });
            
            return true;
            
        } catch (error) {
            this.logger.error(`Health check failed for instance ${instance.id}:`, error);
            
            const currentHealth = this.instanceHealth.get(instance.id) || {};
            const failures = (currentHealth.consecutiveFailures || 0) + 1;
            
            this.updateInstanceHealth(instance, {
                status: failures >= this.config.healthCheck.unhealthyThreshold ? 'unhealthy' : 'degraded',
                lastCheck: Date.now(),
                consecutiveFailures: failures,
                lastError: error.message
            });
            
            this.statistics.healthCheckFailures++;
            
            return false;
        }
    }
    
    async makeHealthCheckRequest(instance) {
        // Simulate health check request
        // In production, use actual HTTP client
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() > 0.1) {
                    resolve({ status: 200 });
                } else {
                    reject(new Error('Health check failed'));
                }
            }, Math.random() * 100);
        });
    }
    
    updateInstanceHealth(instance, health) {
        this.instanceHealth.set(instance.id, health);
        
        this.emit('health:update', {
            instanceId: instance.id,
            health
        });
        
        // Update circuit breaker
        if (health.status === 'unhealthy') {
            this.tripCircuitBreaker(instance);
        } else if (health.status === 'healthy') {
            this.resetCircuitBreaker(instance);
        }
    }

    /**
     * Session affinity
     */
    
    checkSessionAffinity(context, pool) {
        const sessionId = this.extractSessionId(context);
        
        if (!sessionId) {
            return null;
        }
        
        const affinity = this.sessionAffinity.get(sessionId);
        
        if (!affinity) {
            return null;
        }
        
        // Check if affinity expired
        if (Date.now() - affinity.timestamp > this.config.sessionAffinity.timeout) {
            this.sessionAffinity.delete(sessionId);
            return null;
        }
        
        // Check if instance still in pool and healthy
        const instance = pool.find(i => i.id === affinity.instanceId);
        
        if (instance && this.isHealthy(instance)) {
            // Update timestamp
            affinity.timestamp = Date.now();
            return instance;
        }
        
        // Instance not available, clear affinity
        this.sessionAffinity.delete(sessionId);
        return null;
    }
    
    setSessionAffinity(context, instance) {
        const sessionId = this.extractSessionId(context) || this.generateSessionId();
        
        this.sessionAffinity.set(sessionId, {
            instanceId: instance.id,
            timestamp: Date.now()
        });
        
        // Set cookie if needed
        if (context.res && !context.cookies?.[this.config.sessionAffinity.cookieName]) {
            context.res.cookie(
                this.config.sessionAffinity.cookieName,
                sessionId,
                { maxAge: this.config.sessionAffinity.timeout }
            );
        }
    }
    
    extractSessionId(context) {
        // Check cookie
        if (context.cookies?.[this.config.sessionAffinity.cookieName]) {
            return context.cookies[this.config.sessionAffinity.cookieName];
        }
        
        // Check header
        if (context.headers?.[this.config.sessionAffinity.headerName]) {
            return context.headers[this.config.sessionAffinity.headerName];
        }
        
        // Check explicit session ID
        if (context.sessionId) {
            return context.sessionId;
        }
        
        return null;
    }
    
    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Weight management
     */
    
    getInstanceWeight(instance) {
        if (!this.dynamicWeighting) {
            return this.instanceWeights.get(instance.id) || this.config.weights.default;
        }
        
        // Calculate dynamic weight based on metrics
        const metrics = this.instanceMetrics.get(instance.id);
        
        if (!metrics) {
            return this.config.weights.default;
        }
        
        const factors = this.config.weights.factors;
        
        // Response time factor (lower is better)
        const responseTimeFactor = metrics.avgResponseTime ? 
            1000 / metrics.avgResponseTime : 1;
        
        // Error rate factor (lower is better)
        const errorRateFactor = 1 - (metrics.errorRate || 0);
        
        // Connection factor (lower is better)
        const connectionFactor = metrics.activeConnections ? 
            100 / metrics.activeConnections : 1;
        
        // Calculate weighted score
        const weight = 
            responseTimeFactor * factors.responseTime +
            errorRateFactor * factors.errorRate +
            connectionFactor * factors.activeConnections;
        
        return Math.max(0.1, Math.min(10, weight));
    }
    
    updateInstanceWeight(instance, weight) {
        this.instanceWeights.set(instance.id, weight);
        
        // Rebuild consistent hash ring if needed
        if (this.algorithms.get('consistent-hash')) {
            this.buildHashRing(instance.service);
        }
    }

    /**
     * Circuit breaker
     */
    
    tripCircuitBreaker(instance) {
        let breaker = this.circuitBreakers.get(instance.id);
        
        if (!breaker) {
            breaker = {
                state: 'closed',
                failures: 0,
                lastFailure: null,
                nextRetry: null
            };
            this.circuitBreakers.set(instance.id, breaker);
        }
        
        breaker.failures++;
        breaker.lastFailure = Date.now();
        
        if (breaker.failures >= this.circuitBreakerConfig.threshold) {
            breaker.state = 'open';
            breaker.nextRetry = Date.now() + this.circuitBreakerConfig.timeout;
            
            this.logger.warn(`Circuit breaker opened for instance ${instance.id}`);
            
            this.emit('circuit:open', { instanceId: instance.id });
        }
    }
    
    resetCircuitBreaker(instance) {
        const breaker = this.circuitBreakers.get(instance.id);
        
        if (breaker) {
            breaker.state = 'closed';
            breaker.failures = 0;
            breaker.lastFailure = null;
            breaker.nextRetry = null;
            
            this.emit('circuit:closed', { instanceId: instance.id });
        }
    }
    
    checkCircuitBreaker(instance) {
        const breaker = this.circuitBreakers.get(instance.id);
        
        if (!breaker) {
            return 'closed';
        }
        
        if (breaker.state === 'open' && Date.now() >= breaker.nextRetry) {
            breaker.state = 'half-open';
            
            this.emit('circuit:half-open', { instanceId: instance.id });
        }
        
        return breaker.state;
    }

    /**
     * Helper methods
     */
    
    buildHashRing(service) {
        const ring = new Map();
        const instances = this.instancePools.get(service) || [];
        
        for (const instance of instances) {
            const weight = this.getInstanceWeight(instance);
            const nodes = Math.floor(this.virtualNodes * weight);
            
            for (let i = 0; i < nodes; i++) {
                const key = `${instance.id}:${i}`;
                const hash = this.hashString(key);
                ring.set(hash, instance);
            }
        }
        
        // Sort ring by hash
        const sorted = new Map([...ring.entries()].sort((a, b) => a[0] - b[0]));
        
        this.hashRing.set(service, sorted);
    }
    
    buildMaglevTable(service) {
        const instances = this.instancePools.get(service) || [];
        const tableSize = 65537; // Prime number
        const table = new Array(tableSize).fill(null);
        
        // Create permutation for each instance
        const permutations = new Map();
        
        for (const instance of instances) {
            const perm = this.generatePermutation(instance.id, tableSize);
            permutations.set(instance.id, perm);
        }
        
        // Fill table
        const next = new Map();
        instances.forEach(i => next.set(i.id, 0));
        
        for (let i = 0; i < tableSize; i++) {
            for (const instance of instances) {
                let c = next.get(instance.id);
                
                while (table[permutations.get(instance.id)[c % tableSize]] !== null) {
                    c++;
                }
                
                table[permutations.get(instance.id)[c % tableSize]] = instance.id;
                next.set(instance.id, c + 1);
                
                if (table.filter(x => x === null).length === 0) {
                    break;
                }
            }
        }
        
        this.algorithms.get('maglev').state.set(service, table);
    }
    
    generatePermutation(seed, size) {
        const perm = [];
        const offset = this.hashString(seed + ':offset') % size;
        const skip = (this.hashString(seed + ':skip') % (size - 1)) + 1;
        
        for (let i = 0; i < size; i++) {
            perm.push((offset + i * skip) % size);
        }
        
        return perm;
    }
    
    hashString(str) {
        return crypto.createHash('md5').update(str).digest().readUInt32BE(0);
    }
    
    generateRandomKey() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    getActiveConnections(instance) {
        const connections = this.activeConnections.get(instance.id);
        return connections || 0;
    }
    
    getPendingRequests(instance) {
        const pending = this.pendingRequests.get(instance.id);
        return pending || 0;
    }
    
    getAverageResponseTime(instance) {
        const buffer = this.responseTimeBuffer.get(instance.id);
        
        if (!buffer || buffer.length === 0) {
            return 100; // Default
        }
        
        const sum = buffer.reduce((a, b) => a + b, 0);
        return sum / buffer.length;
    }
    
    calculateResourceScore(instance) {
        const metrics = this.instanceMetrics.get(instance.id);
        
        if (!metrics) {
            return 0;
        }
        
        // Calculate composite score based on resources
        const cpuScore = (100 - (metrics.cpuUsage || 0)) / 100;
        const memoryScore = (100 - (metrics.memoryUsage || 0)) / 100;
        const diskScore = (100 - (metrics.diskUsage || 0)) / 100;
        const networkScore = (100 - (metrics.networkUsage || 0)) / 100;
        
        return (cpuScore + memoryScore + diskScore + networkScore) / 4;
    }
    
    trackSelection(service, instance, algorithm) {
        // Update instance distribution
        this.statistics.instanceDistribution[instance.id] = 
            (this.statistics.instanceDistribution[instance.id] || 0) + 1;
        
        // Track active connections
        const current = this.activeConnections.get(instance.id) || 0;
        this.activeConnections.set(instance.id, current + 1);
        
        // Track pending requests
        const pending = this.pendingRequests.get(instance.id) || 0;
        this.pendingRequests.set(instance.id, pending + 1);
        
        this.emit('instance:selected', {
            service,
            instanceId: instance.id,
            algorithm
        });
    }
    
    async attemptFailover(service, context) {
        this.statistics.failovers++;
        
        // Try to find instances from other regions/zones
        if (this.geoRouting.enabled) {
            const alternateRegions = this.findAlternateRegions(service);
            
            for (const region of alternateRegions) {
                const instances = this.instancePools.get(`${service}-${region}`);
                
                if (instances && instances.length > 0) {
                    const healthy = await this.getHealthyInstances(instances);
                    
                    if (healthy.length > 0) {
                        this.logger.info(`Failing over to region: ${region}`);
                        return healthy[0];
                    }
                }
            }
        }
        
        // Try fallback algorithm
        const fallbackAlgorithm = this.algorithms.get(this.config.fallbackAlgorithm);
        
        if (fallbackAlgorithm) {
            const allInstances = this.instancePools.get(service) || [];
            
            if (allInstances.length > 0) {
                return fallbackAlgorithm.select(service, allInstances, context);
            }
        }
        
        return null;
    }
    
    fallbackSelection(service, instances, context) {
        this.logger.warn(`Fallback selection for service: ${service}`);
        
        // Use fallback algorithm
        const fallbackAlgorithm = this.algorithms.get(this.config.fallbackAlgorithm);
        
        if (fallbackAlgorithm) {
            return fallbackAlgorithm.select(service, instances, context);
        }
        
        // Last resort: random selection
        return instances[Math.floor(Math.random() * instances.length)];
    }
    
    findAlternateRegions(service) {
        const regions = [];
        
        for (const [key, value] of this.geoRouting.regions) {
            if (key !== service && value.includes(service)) {
                regions.push(key);
            }
        }
        
        return regions;
    }
    
    updateAdaptiveRewards(instance, reward) {
        if (!this.adaptiveRouting.enabled) return;
        
        const state = this.algorithms.get('adaptive').state;
        
        for (const [service, data] of state) {
            const currentReward = data.rewards.get(instance.id) || 0;
            const newReward = currentReward + 
                this.adaptiveRouting.learningRate * (reward - currentReward);
            
            data.rewards.set(instance.id, newReward);
        }
    }

    /**
     * Service discovery
     */
    
    async discoverServices() {
        if (!this.serviceDiscovery.enabled) return;
        
        try {
            const services = await this.queryServiceRegistry();
            
            for (const service of services) {
                const instances = await this.getServiceInstances(service);
                this.updateInstancePool(service, instances);
            }
            
            this.emit('discovery:complete', { services: services.length });
            
        } catch (error) {
            this.logger.error('Service discovery failed:', error);
        }
    }
    
    async queryServiceRegistry() {
        // Simulate service registry query
        // In production, integrate with Consul, Eureka, etc.
        return ['api-service', 'auth-service', 'data-service'];
    }
    
    async getServiceInstances(service) {
        // Simulate getting instances
        // In production, query actual service registry
        return [
            { id: `${service}-1`, host: 'localhost', port: 3001, healthy: true },
            { id: `${service}-2`, host: 'localhost', port: 3002, healthy: true },
            { id: `${service}-3`, host: 'localhost', port: 3003, healthy: true }
        ];
    }
    
    updateInstancePool(service, instances) {
        this.instancePools.set(service, instances);
        
        // Initialize algorithms for new service
        for (const [name, algorithm] of this.algorithms) {
            if (algorithm.init) {
                algorithm.init(service);
            }
        }
        
        // Rebuild hash ring if using consistent hashing
        if (this.algorithms.has('consistent-hash')) {
            this.buildHashRing(service);
        }
        
        // Build Maglev table if using Maglev
        if (this.algorithms.has('maglev')) {
            this.buildMaglevTable(service);
        }
    }

    /**
     * Background tasks
     */
    
    startBackgroundTasks() {
        // Health checking
        if (this.config.healthCheck.enabled) {
            this.healthCheckTimer = setInterval(() => {
                this.performHealthChecks();
            }, this.config.healthCheck.interval);
        }
        
        // Service discovery
        if (this.serviceDiscovery.enabled) {
            this.discoveryTimer = setInterval(() => {
                this.discoverServices();
            }, this.serviceDiscovery.refreshInterval);
            
            // Initial discovery
            this.discoverServices();
        }
        
        // Session affinity cleanup
        this.affinityCleanupTimer = setInterval(() => {
            this.cleanupExpiredAffinities();
        }, 60000); // Every minute
        
        // Metrics aggregation
        this.metricsTimer = setInterval(() => {
            this.aggregateMetrics();
        }, 10000); // Every 10 seconds
    }
    
    async performHealthChecks() {
        for (const [service, instances] of this.instancePools) {
            for (const instance of instances) {
                await this.performHealthCheck(instance);
            }
        }
    }
    
    cleanupExpiredAffinities() {
        const now = Date.now();
        const expired = [];
        
        for (const [sessionId, affinity] of this.sessionAffinity) {
            if (now - affinity.timestamp > this.config.sessionAffinity.timeout) {
                expired.push(sessionId);
            }
        }
        
        for (const sessionId of expired) {
            this.sessionAffinity.delete(sessionId);
        }
        
        if (expired.length > 0) {
            this.logger.debug(`Cleaned up ${expired.length} expired session affinities`);
        }
    }
    
    aggregateMetrics() {
        // Calculate throughput
        const throughput = this.statistics.totalRequests / (Date.now() / 1000);
        
        // Calculate distribution percentages
        const totalDistribution = Object.values(this.statistics.instanceDistribution)
            .reduce((a, b) => a + b, 0);
        
        const distributionPercentages = {};
        
        for (const [instanceId, count] of Object.entries(this.statistics.instanceDistribution)) {
            distributionPercentages[instanceId] = 
                totalDistribution > 0 ? (count / totalDistribution) * 100 : 0;
        }
        
        this.emit('metrics:aggregated', {
            throughput,
            distributionPercentages,
            statistics: this.statistics
        });
    }

    /**
     * Public methods for managing instances
     */
    
    addInstance(service, instance) {
        const pool = this.instancePools.get(service) || [];
        pool.push(instance);
        this.instancePools.set(service, pool);
        
        // Update algorithms
        this.updateInstancePool(service, pool);
        
        this.logger.info(`Added instance ${instance.id} to service ${service}`);
    }
    
    removeInstance(service, instanceId) {
        const pool = this.instancePools.get(service);
        
        if (!pool) return;
        
        const filtered = pool.filter(i => i.id !== instanceId);
        this.instancePools.set(service, filtered);
        
        // Update algorithms
        this.updateInstancePool(service, filtered);
        
        // Clear related data
        this.instanceHealth.delete(instanceId);
        this.instanceMetrics.delete(instanceId);
        this.activeConnections.delete(instanceId);
        this.pendingRequests.delete(instanceId);
        this.responseTimeBuffer.delete(instanceId);
        
        this.logger.info(`Removed instance ${instanceId} from service ${service}`);
    }
    
    releaseConnection(instanceId) {
        const current = this.activeConnections.get(instanceId) || 0;
        
        if (current > 0) {
            this.activeConnections.set(instanceId, current - 1);
        }
        
        const pending = this.pendingRequests.get(instanceId) || 0;
        
        if (pending > 0) {
            this.pendingRequests.set(instanceId, pending - 1);
        }
    }
    
    recordResponseTime(instanceId, responseTime) {
        let buffer = this.responseTimeBuffer.get(instanceId);
        
        if (!buffer) {
            buffer = [];
            this.responseTimeBuffer.set(instanceId, buffer);
        }
        
        buffer.push(responseTime);
        
        if (buffer.length > this.responseTimeWindowSize) {
            buffer.shift();
        }
    }
    
    updateInstanceMetrics(instanceId, metrics) {
        const current = this.instanceMetrics.get(instanceId) || {};
        
        this.instanceMetrics.set(instanceId, {
            ...current,
            ...metrics,
            lastUpdate: Date.now()
        });
    }

    /**
     * Gets load balancer statistics
     * @returns {Object} Load balancer statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            algorithms: Array.from(this.algorithms.keys()),
            services: Array.from(this.instancePools.keys()),
            totalInstances: Array.from(this.instancePools.values())
                .reduce((sum, pool) => sum + pool.length, 0),
            healthyInstances: Array.from(this.instanceHealth.values())
                .filter(h => h.status === 'healthy').length,
            sessionAffinities: this.sessionAffinity.size,
            circuitBreakers: {
                open: Array.from(this.circuitBreakers.values())
                    .filter(b => b.state === 'open').length,
                halfOpen: Array.from(this.circuitBreakers.values())
                    .filter(b => b.state === 'half-open').length
            }
        };
    }

    /**
     * Cleanup method
     */
    cleanup() {
        // Clear timers
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
        }
        
        if (this.affinityCleanupTimer) {
            clearInterval(this.affinityCleanupTimer);
        }
        
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
        }
        
        // Clear data
        this.instancePools.clear();
        this.sessionAffinity.clear();
        this.activeConnections.clear();
        
        this.logger.info('LoadBalancer cleaned up');
    }
}

module.exports = LoadBalancer;