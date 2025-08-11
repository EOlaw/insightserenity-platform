'use strict';

/**
 * @fileoverview Circuit Breaker Manager Service - Fault tolerance and resilience implementation
 * @module servers/gateway/services/circuit-breaker-manager
 * @requires opossum
 * @requires events
 * @requires perf_hooks
 */

const { EventEmitter } = require('events');
const CircuitBreaker = require('opossum');
const { performance } = require('perf_hooks');

/**
 * CircuitBreakerManager class provides comprehensive circuit breaker pattern implementation
 * for fault tolerance and resilience in microservices communication. It manages multiple
 * circuit breakers for different services, monitors their health, implements fallback
 * strategies, and provides detailed metrics for system reliability. The manager supports
 * various failure detection strategies, automatic recovery, and adaptive thresholds.
 * 
 * @class CircuitBreakerManager
 * @extends EventEmitter
 */
class CircuitBreakerManager extends EventEmitter {
    /**
     * Creates an instance of CircuitBreakerManager
     * @constructor
     * @param {Object} config - Circuit breaker configuration
     * @param {ServiceRegistry} serviceRegistry - Service registry for service discovery
     * @param {Logger} logger - Logger instance
     */
    constructor(config, serviceRegistry, logger) {
        super();
        this.config = config || {};
        this.serviceRegistry = serviceRegistry;
        this.logger = logger;
        this.isInitialized = false;
        
        // Circuit breakers storage
        this.breakers = new Map();
        this.breakerConfigs = new Map();
        this.breakerMetrics = new Map();
        
        // Default configuration
        this.defaultConfig = {
            timeout: config.timeout || 10000,
            errorThresholdPercentage: config.errorThreshold || 50,
            resetTimeout: config.resetTimeout || 30000,
            rollingCountTimeout: config.rollingWindow || 10000,
            rollingCountBuckets: config.rollingBuckets || 10,
            volumeThreshold: config.volumeThreshold || 10,
            fallback: config.fallback || null,
            name: config.name || 'default',
            group: config.group || 'default',
            enabled: config.enabled !== false,
            capacity: config.capacity || 10,
            errorFilter: config.errorFilter || null,
            ...config
        };
        
        // Breaker states
        this.states = {
            CLOSED: 'closed',
            OPEN: 'open',
            HALF_OPEN: 'half-open'
        };
        
        // Health status tracking
        this.healthStatus = new Map();
        this.stateHistory = new Map();
        this.maxHistorySize = 100;
        
        // Fallback strategies
        this.fallbackStrategies = new Map();
        this.registerDefaultFallbacks();
        
        // Monitoring configuration
        this.monitoring = {
            enabled: config.monitoring?.enabled !== false,
            interval: config.monitoring?.interval || 30000,
            metricsCollector: config.monitoring?.metricsCollector
        };
        
        // Adaptive thresholds
        this.adaptiveThresholds = {
            enabled: config.adaptiveThresholds?.enabled || false,
            minErrorThreshold: config.adaptiveThresholds?.minErrorThreshold || 30,
            maxErrorThreshold: config.adaptiveThresholds?.maxErrorThreshold || 70,
            adjustmentFactor: config.adaptiveThresholds?.adjustmentFactor || 0.1
        };
        
        // Bulkhead configuration for isolation
        this.bulkhead = {
            enabled: config.bulkhead?.enabled || false,
            maxConcurrent: config.bulkhead?.maxConcurrent || 10,
            maxQueue: config.bulkhead?.maxQueue || 100
        };
        
        // Retry configuration
        this.retryConfig = {
            enabled: config.retry?.enabled !== false,
            maxAttempts: config.retry?.maxAttempts || 3,
            delay: config.retry?.delay || 1000,
            maxDelay: config.retry?.maxDelay || 10000,
            factor: config.retry?.factor || 2,
            jitter: config.retry?.jitter || true
        };
        
        // Service groups for coordinated circuit breaking
        this.serviceGroups = new Map();
        
        // Recovery strategies
        this.recoveryStrategies = {
            exponential: this.exponentialRecovery.bind(this),
            linear: this.linearRecovery.bind(this),
            immediate: this.immediateRecovery.bind(this),
            gradual: this.gradualRecovery.bind(this)
        };
        
        // Monitoring intervals
        this.monitoringInterval = null;
        this.healthCheckInterval = null;
        
        // Statistics
        this.statistics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            circuitOpens: 0,
            fallbackExecutions: 0,
            shortCircuits: 0,
            averageResponseTime: 0,
            percentiles: {
                p50: 0,
                p90: 0,
                p95: 0,
                p99: 0
            }
        };
        
        // Response time tracking
        this.responseTimes = [];
        this.maxResponseTimeSamples = 1000;
    }

    /**
     * Initializes the circuit breaker manager
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('info', 'Circuit Breaker Manager already initialized');
            return;
        }

        try {
            this.log('info', 'Initializing Circuit Breaker Manager');
            
            // Initialize circuit breakers for registered services
            await this.initializeServiceBreakers();
            
            // Setup monitoring
            if (this.monitoring.enabled) {
                this.startMonitoring();
            }
            
            // Setup health checks
            this.startHealthChecks();
            
            // Register service discovery listeners
            this.registerServiceListeners();
            
            this.isInitialized = true;
            this.emit('circuit-breaker:initialized');
            
            this.log('info', 'Circuit Breaker Manager initialized successfully');
        } catch (error) {
            this.log('error', 'Failed to initialize Circuit Breaker Manager', error);
            throw error;
        }
    }

    /**
     * Initializes circuit breakers for services
     * @private
     * @async
     */
    async initializeServiceBreakers() {
        if (!this.serviceRegistry) {
            return;
        }
        
        const services = this.serviceRegistry.getAllServices();
        
        for (const service of services) {
            const config = {
                ...this.defaultConfig,
                ...service.circuitBreaker,
                name: service.name
            };
            
            this.createBreaker(service.name, config);
        }
    }

    /**
     * Creates a circuit breaker for a service
     * @param {string} serviceName - Service name
     * @param {Object} config - Breaker configuration
     * @returns {CircuitBreaker} Created circuit breaker
     */
    createBreaker(serviceName, config = {}) {
        if (this.breakers.has(serviceName)) {
            this.log('warn', `Circuit breaker already exists for service: ${serviceName}`);
            return this.breakers.get(serviceName);
        }
        
        const breakerConfig = {
            ...this.defaultConfig,
            ...config,
            name: serviceName
        };
        
        // Create the circuit breaker
        const breaker = new CircuitBreaker(this.createBreakerFunction(serviceName), breakerConfig);
        
        // Setup event handlers
        this.setupBreakerEventHandlers(breaker, serviceName);
        
        // Store breaker and config
        this.breakers.set(serviceName, breaker);
        this.breakerConfigs.set(serviceName, breakerConfig);
        
        // Initialize metrics
        this.breakerMetrics.set(serviceName, {
            requests: 0,
            successes: 0,
            failures: 0,
            timeouts: 0,
            fallbacks: 0,
            opens: 0,
            closes: 0,
            halfOpens: 0,
            averageResponseTime: 0,
            lastFailure: null,
            lastSuccess: null,
            state: breaker.status.state,
            healthScore: 100
        });
        
        // Initialize state history
        this.stateHistory.set(serviceName, []);
        
        // Add to service group if specified
        if (breakerConfig.group) {
            this.addToServiceGroup(serviceName, breakerConfig.group);
        }
        
        this.log('info', `Circuit breaker created for service: ${serviceName}`);
        this.emit('breaker:created', { service: serviceName, config: breakerConfig });
        
        return breaker;
    }

    /**
     * Creates breaker function wrapper
     * @private
     * @param {string} serviceName - Service name
     * @returns {Function} Breaker function
     */
    createBreakerFunction(serviceName) {
        return async (requestFunction, ...args) => {
            const startTime = performance.now();
            
            try {
                // Execute the actual request
                const result = await requestFunction(...args);
                
                // Record success metrics
                this.recordSuccess(serviceName, performance.now() - startTime);
                
                return result;
            } catch (error) {
                // Record failure metrics
                this.recordFailure(serviceName, error, performance.now() - startTime);
                
                throw error;
            }
        };
    }

    /**
     * Sets up event handlers for a circuit breaker
     * @private
     * @param {CircuitBreaker} breaker - Circuit breaker instance
     * @param {string} serviceName - Service name
     */
    setupBreakerEventHandlers(breaker, serviceName) {
        // Circuit opened
        breaker.on('open', () => {
            this.handleCircuitOpen(serviceName);
        });
        
        // Circuit closed
        breaker.on('close', () => {
            this.handleCircuitClose(serviceName);
        });
        
        // Circuit half-open
        breaker.on('halfOpen', () => {
            this.handleCircuitHalfOpen(serviceName);
        });
        
        // Request success
        breaker.on('success', (result, latency) => {
            this.handleRequestSuccess(serviceName, latency);
        });
        
        // Request failure
        breaker.on('failure', (error, latency) => {
            this.handleRequestFailure(serviceName, error, latency);
        });
        
        // Request timeout
        breaker.on('timeout', (error, latency) => {
            this.handleRequestTimeout(serviceName, error, latency);
        });
        
        // Fallback executed
        breaker.on('fallback', (result, error) => {
            this.handleFallback(serviceName, result, error);
        });
        
        // Circuit reject (short circuit)
        breaker.on('reject', () => {
            this.handleShortCircuit(serviceName);
        });
        
        // Health check
        breaker.on('healthCheckFailed', (error) => {
            this.handleHealthCheckFailure(serviceName, error);
        });
        
        // Semaphore rejected (bulkhead)
        breaker.on('semaphore-rejected', () => {
            this.handleBulkheadRejection(serviceName);
        });
    }

    /**
     * Gets a circuit breaker for a service
     * @param {string} serviceName - Service name
     * @returns {CircuitBreaker|null} Circuit breaker or null
     */
    getBreaker(serviceName) {
        return this.breakers.get(serviceName) || null;
    }

    /**
     * Executes a request through circuit breaker
     * @async
     * @param {string} serviceName - Service name
     * @param {Function} requestFunction - Function to execute
     * @param {Object} options - Execution options
     * @returns {Promise<*>} Request result
     */
    async execute(serviceName, requestFunction, options = {}) {
        let breaker = this.breakers.get(serviceName);
        
        if (!breaker) {
            // Create breaker on demand
            breaker = this.createBreaker(serviceName, options.config);
        }
        
        // Check if breaker is enabled
        if (!breaker.enabled) {
            return await requestFunction();
        }
        
        // Apply retry logic if enabled
        if (this.retryConfig.enabled && options.retry !== false) {
            return await this.executeWithRetry(breaker, requestFunction, options);
        }
        
        // Execute through circuit breaker
        return await breaker.fire(requestFunction);
    }

    /**
     * Executes request with retry logic
     * @private
     * @async
     * @param {CircuitBreaker} breaker - Circuit breaker
     * @param {Function} requestFunction - Function to execute
     * @param {Object} options - Execution options
     * @returns {Promise<*>} Request result
     */
    async executeWithRetry(breaker, requestFunction, options) {
        const maxAttempts = options.maxAttempts || this.retryConfig.maxAttempts;
        let lastError;
        let delay = this.retryConfig.delay;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await breaker.fire(requestFunction);
            } catch (error) {
                lastError = error;
                
                // Don't retry if circuit is open
                if (breaker.opened) {
                    throw error;
                }
                
                // Don't retry on last attempt
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                // Calculate retry delay
                if (this.retryConfig.jitter) {
                    delay = delay + Math.random() * 1000;
                }
                
                this.log('debug', `Retry attempt ${attempt} for ${breaker.name} after ${delay}ms`);
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Exponential backoff
                delay = Math.min(delay * this.retryConfig.factor, this.retryConfig.maxDelay);
            }
        }
        
        throw lastError;
    }

    /**
     * Handles circuit open event
     * @private
     * @param {string} serviceName - Service name
     */
    handleCircuitOpen(serviceName) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            metrics.opens++;
            metrics.state = this.states.OPEN;
        }
        
        // Update state history
        this.addStateChange(serviceName, this.states.OPEN);
        
        // Update health status
        this.updateHealthStatus(serviceName, 'unhealthy');
        
        this.statistics.circuitOpens++;
        
        this.log('warn', `Circuit opened for service: ${serviceName}`);
        this.emit('circuit:opened', { service: serviceName, timestamp: Date.now() });
        
        // Check for cascading failures
        this.checkCascadingFailures(serviceName);
        
        // Apply adaptive thresholds
        if (this.adaptiveThresholds.enabled) {
            this.adjustThresholds(serviceName, 'open');
        }
    }

    /**
     * Handles circuit close event
     * @private
     * @param {string} serviceName - Service name
     */
    handleCircuitClose(serviceName) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            metrics.closes++;
            metrics.state = this.states.CLOSED;
        }
        
        // Update state history
        this.addStateChange(serviceName, this.states.CLOSED);
        
        // Update health status
        this.updateHealthStatus(serviceName, 'healthy');
        
        this.log('info', `Circuit closed for service: ${serviceName}`);
        this.emit('circuit:closed', { service: serviceName, timestamp: Date.now() });
        
        // Apply adaptive thresholds
        if (this.adaptiveThresholds.enabled) {
            this.adjustThresholds(serviceName, 'close');
        }
    }

    /**
     * Handles circuit half-open event
     * @private
     * @param {string} serviceName - Service name
     */
    handleCircuitHalfOpen(serviceName) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            metrics.halfOpens++;
            metrics.state = this.states.HALF_OPEN;
        }
        
        // Update state history
        this.addStateChange(serviceName, this.states.HALF_OPEN);
        
        // Update health status
        this.updateHealthStatus(serviceName, 'recovering');
        
        this.log('info', `Circuit half-open for service: ${serviceName}`);
        this.emit('circuit:half-open', { service: serviceName, timestamp: Date.now() });
    }

    /**
     * Handles request success
     * @private
     * @param {string} serviceName - Service name
     * @param {number} latency - Request latency
     */
    handleRequestSuccess(serviceName, latency) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            metrics.requests++;
            metrics.successes++;
            metrics.lastSuccess = Date.now();
            this.updateAverageResponseTime(metrics, latency);
        }
        
        this.statistics.totalRequests++;
        this.statistics.successfulRequests++;
        
        // Record response time
        this.recordResponseTime(latency);
        
        // Update health score
        this.updateHealthScore(serviceName, true);
    }

    /**
     * Handles request failure
     * @private
     * @param {string} serviceName - Service name
     * @param {Error} error - Request error
     * @param {number} latency - Request latency
     */
    handleRequestFailure(serviceName, error, latency) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            metrics.requests++;
            metrics.failures++;
            metrics.lastFailure = Date.now();
        }
        
        this.statistics.totalRequests++;
        this.statistics.failedRequests++;
        
        // Update health score
        this.updateHealthScore(serviceName, false);
        
        this.log('error', `Request failed for service ${serviceName}:`, error);
        this.emit('request:failed', { service: serviceName, error, latency });
    }

    /**
     * Handles request timeout
     * @private
     * @param {string} serviceName - Service name
     * @param {Error} error - Timeout error
     * @param {number} latency - Request latency
     */
    handleRequestTimeout(serviceName, error, latency) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            metrics.timeouts++;
        }
        
        this.statistics.timeouts++;
        
        this.log('warn', `Request timeout for service ${serviceName}`);
        this.emit('request:timeout', { service: serviceName, error, latency });
    }

    /**
     * Handles fallback execution
     * @private
     * @param {string} serviceName - Service name
     * @param {*} result - Fallback result
     * @param {Error} error - Original error
     */
    handleFallback(serviceName, result, error) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            metrics.fallbacks++;
        }
        
        this.statistics.fallbackExecutions++;
        
        this.log('info', `Fallback executed for service ${serviceName}`);
        this.emit('fallback:executed', { service: serviceName, result, error });
    }

    /**
     * Handles short circuit
     * @private
     * @param {string} serviceName - Service name
     */
    handleShortCircuit(serviceName) {
        this.statistics.shortCircuits++;
        
        this.log('debug', `Request short-circuited for service ${serviceName}`);
        this.emit('request:short-circuited', { service: serviceName });
    }

    /**
     * Handles health check failure
     * @private
     * @param {string} serviceName - Service name
     * @param {Error} error - Health check error
     */
    handleHealthCheckFailure(serviceName, error) {
        this.log('error', `Health check failed for service ${serviceName}:`, error);
        this.emit('health-check:failed', { service: serviceName, error });
        
        // Update health status
        this.updateHealthStatus(serviceName, 'unhealthy');
    }

    /**
     * Handles bulkhead rejection
     * @private
     * @param {string} serviceName - Service name
     */
    handleBulkheadRejection(serviceName) {
        this.log('warn', `Bulkhead rejection for service ${serviceName}`);
        this.emit('bulkhead:rejected', { service: serviceName });
    }

    /**
     * Records successful request
     * @private
     * @param {string} serviceName - Service name
     * @param {number} responseTime - Response time in ms
     */
    recordSuccess(serviceName, responseTime) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (metrics) {
            this.updateAverageResponseTime(metrics, responseTime);
        }
        
        this.recordResponseTime(responseTime);
    }

    /**
     * Records failed request
     * @private
     * @param {string} serviceName - Service name
     * @param {Error} error - Request error
     * @param {number} responseTime - Response time in ms
     */
    recordFailure(serviceName, error, responseTime) {
        // Error recording handled by event handlers
    }

    /**
     * Updates average response time
     * @private
     * @param {Object} metrics - Service metrics
     * @param {number} responseTime - Response time in ms
     */
    updateAverageResponseTime(metrics, responseTime) {
        const currentAvg = metrics.averageResponseTime;
        const totalRequests = metrics.requests;
        
        metrics.averageResponseTime = 
            (currentAvg * (totalRequests - 1) + responseTime) / totalRequests;
    }

    /**
     * Records response time for percentile calculation
     * @private
     * @param {number} responseTime - Response time in ms
     */
    recordResponseTime(responseTime) {
        this.responseTimes.push(responseTime);
        
        // Trim array if too large
        if (this.responseTimes.length > this.maxResponseTimeSamples) {
            this.responseTimes.shift();
        }
        
        // Update statistics
        this.updateResponseTimeStatistics();
    }

    /**
     * Updates response time statistics
     * @private
     */
    updateResponseTimeStatistics() {
        if (this.responseTimes.length === 0) return;
        
        const sorted = [...this.responseTimes].sort((a, b) => a - b);
        const len = sorted.length;
        
        this.statistics.percentiles.p50 = sorted[Math.floor(len * 0.5)];
        this.statistics.percentiles.p90 = sorted[Math.floor(len * 0.9)];
        this.statistics.percentiles.p95 = sorted[Math.floor(len * 0.95)];
        this.statistics.percentiles.p99 = sorted[Math.floor(len * 0.99)];
        
        const sum = sorted.reduce((a, b) => a + b, 0);
        this.statistics.averageResponseTime = sum / len;
    }

    /**
     * Updates health status
     * @private
     * @param {string} serviceName - Service name
     * @param {string} status - Health status
     */
    updateHealthStatus(serviceName, status) {
        this.healthStatus.set(serviceName, {
            status,
            timestamp: Date.now()
        });
        
        this.emit('health:updated', { service: serviceName, status });
    }

    /**
     * Updates health score
     * @private
     * @param {string} serviceName - Service name
     * @param {boolean} success - Request success status
     */
    updateHealthScore(serviceName, success) {
        const metrics = this.breakerMetrics.get(serviceName);
        if (!metrics) return;
        
        // Simple health score calculation
        const factor = success ? 0.1 : -0.2;
        metrics.healthScore = Math.max(0, Math.min(100, metrics.healthScore + factor));
    }

    /**
     * Adds state change to history
     * @private
     * @param {string} serviceName - Service name
     * @param {string} state - New state
     */
    addStateChange(serviceName, state) {
        const history = this.stateHistory.get(serviceName) || [];
        
        history.push({
            state,
            timestamp: Date.now()
        });
        
        // Trim history
        if (history.length > this.maxHistorySize) {
            history.shift();
        }
        
        this.stateHistory.set(serviceName, history);
    }

    /**
     * Checks for cascading failures
     * @private
     * @param {string} serviceName - Service name
     */
    checkCascadingFailures(serviceName) {
        const config = this.breakerConfigs.get(serviceName);
        if (!config || !config.group) return;
        
        const group = this.serviceGroups.get(config.group);
        if (!group) return;
        
        // Check if multiple services in the group are failing
        const failingServices = Array.from(group).filter(service => {
            const breaker = this.breakers.get(service);
            return breaker && breaker.opened;
        });
        
        if (failingServices.length > 1) {
            this.log('error', `Cascading failure detected in group ${config.group}`);
            this.emit('cascading:failure', { 
                group: config.group, 
                services: failingServices 
            });
        }
    }

    /**
     * Adjusts thresholds adaptively
     * @private
     * @param {string} serviceName - Service name
     * @param {string} event - Event type (open/close)
     */
    adjustThresholds(serviceName, event) {
        const breaker = this.breakers.get(serviceName);
        const config = this.breakerConfigs.get(serviceName);
        
        if (!breaker || !config) return;
        
        const currentThreshold = config.errorThresholdPercentage;
        let newThreshold = currentThreshold;
        
        if (event === 'open') {
            // Decrease threshold (more sensitive)
            newThreshold = Math.max(
                this.adaptiveThresholds.minErrorThreshold,
                currentThreshold * (1 - this.adaptiveThresholds.adjustmentFactor)
            );
        } else if (event === 'close') {
            // Increase threshold (less sensitive)
            newThreshold = Math.min(
                this.adaptiveThresholds.maxErrorThreshold,
                currentThreshold * (1 + this.adaptiveThresholds.adjustmentFactor)
            );
        }
        
        if (newThreshold !== currentThreshold) {
            config.errorThresholdPercentage = newThreshold;
            breaker.options.errorThresholdPercentage = newThreshold;
            
            this.log('info', 
                `Adjusted error threshold for ${serviceName}: ${currentThreshold}% -> ${newThreshold}%`
            );
        }
    }

    /**
     * Adds service to group
     * @private
     * @param {string} serviceName - Service name
     * @param {string} groupName - Group name
     */
    addToServiceGroup(serviceName, groupName) {
        if (!this.serviceGroups.has(groupName)) {
            this.serviceGroups.set(groupName, new Set());
        }
        
        this.serviceGroups.get(groupName).add(serviceName);
    }

    /**
     * Registers default fallback strategies
     * @private
     */
    registerDefaultFallbacks() {
        // Cache fallback
        this.fallbackStrategies.set('cache', async (error, args) => {
            // Return cached response if available
            return { cached: true, data: null, error: error.message };
        });
        
        // Default response fallback
        this.fallbackStrategies.set('default', async (error, args) => {
            return { fallback: true, error: error.message };
        });
        
        // Queue fallback
        this.fallbackStrategies.set('queue', async (error, args) => {
            // Queue request for later processing
            return { queued: true, error: error.message };
        });
        
        // Redirect fallback
        this.fallbackStrategies.set('redirect', async (error, args) => {
            // Redirect to backup service
            return { redirect: true, url: '/backup', error: error.message };
        });
    }

    /**
     * Registers a custom fallback strategy
     * @param {string} name - Strategy name
     * @param {Function} strategy - Strategy function
     */
    registerFallbackStrategy(name, strategy) {
        this.fallbackStrategies.set(name, strategy);
        this.log('info', `Registered fallback strategy: ${name}`);
    }

    /**
     * Gets fallback strategy
     * @param {string} name - Strategy name
     * @returns {Function|null} Fallback strategy
     */
    getFallbackStrategy(name) {
        return this.fallbackStrategies.get(name) || null;
    }

    /**
     * Exponential recovery strategy
     * @private
     * @param {string} serviceName - Service name
     * @returns {number} Recovery timeout
     */
    exponentialRecovery(serviceName) {
        const metrics = this.breakerMetrics.get(serviceName);
        const failures = metrics ? metrics.failures : 1;
        
        return Math.min(60000, 1000 * Math.pow(2, failures));
    }

    /**
     * Linear recovery strategy
     * @private
     * @param {string} serviceName - Service name
     * @returns {number} Recovery timeout
     */
    linearRecovery(serviceName) {
        const metrics = this.breakerMetrics.get(serviceName);
        const failures = metrics ? metrics.failures : 1;
        
        return Math.min(60000, 5000 * failures);
    }

    /**
     * Immediate recovery strategy
     * @private
     * @param {string} serviceName - Service name
     * @returns {number} Recovery timeout
     */
    immediateRecovery(serviceName) {
        return 1000;
    }

    /**
     * Gradual recovery strategy
     * @private
     * @param {string} serviceName - Service name
     * @returns {number} Recovery timeout
     */
    gradualRecovery(serviceName) {
        const metrics = this.breakerMetrics.get(serviceName);
        const healthScore = metrics ? metrics.healthScore : 50;
        
        // Recovery time inversely proportional to health score
        return Math.max(1000, Math.min(60000, (100 - healthScore) * 600));
    }

    /**
     * Starts monitoring
     * @private
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
            this.emit('metrics:collected', this.getMetrics());
        }, this.monitoring.interval);
        
        this.log('info', 'Circuit breaker monitoring started');
    }

    /**
     * Starts health checks
     * @private
     */
    startHealthChecks() {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthChecks();
        }, 30000); // Every 30 seconds
        
        this.log('info', 'Health checks started');
    }

    /**
     * Performs health checks
     * @private
     * @async
     */
    async performHealthChecks() {
        for (const [serviceName, breaker] of this.breakers) {
            if (breaker.healthCheck) {
                try {
                    await breaker.healthCheck();
                } catch (error) {
                    this.handleHealthCheckFailure(serviceName, error);
                }
            }
        }
    }

    /**
     * Collects metrics
     * @private
     */
    collectMetrics() {
        for (const [serviceName, breaker] of this.breakers) {
            const stats = breaker.stats;
            const metrics = this.breakerMetrics.get(serviceName);
            
            if (metrics && stats) {
                // Update metrics from breaker stats
                metrics.requests = stats.fires || metrics.requests;
                metrics.successes = stats.successes || metrics.successes;
                metrics.failures = stats.failures || metrics.failures;
                metrics.timeouts = stats.timeouts || metrics.timeouts;
                metrics.fallbacks = stats.fallbacks || metrics.fallbacks;
            }
        }
    }

    /**
     * Registers service listeners
     * @private
     */
    registerServiceListeners() {
        if (!this.serviceRegistry) return;
        
        // Listen for new services
        this.serviceRegistry.on('service:registered', (service) => {
            if (!this.breakers.has(service.name)) {
                const config = {
                    ...this.defaultConfig,
                    ...service.circuitBreaker
                };
                this.createBreaker(service.name, config);
            }
        });
        
        // Listen for removed services
        this.serviceRegistry.on('service:deregistered', (service) => {
            this.removeBreaker(service.name);
        });
    }

    /**
     * Removes a circuit breaker
     * @param {string} serviceName - Service name
     */
    removeBreaker(serviceName) {
        const breaker = this.breakers.get(serviceName);
        
        if (breaker) {
            breaker.shutdown();
            this.breakers.delete(serviceName);
            this.breakerConfigs.delete(serviceName);
            this.breakerMetrics.delete(serviceName);
            this.stateHistory.delete(serviceName);
            this.healthStatus.delete(serviceName);
            
            this.log('info', `Circuit breaker removed for service: ${serviceName}`);
            this.emit('breaker:removed', { service: serviceName });
        }
    }

    /**
     * Gets circuit breaker status
     * @param {string} serviceName - Service name
     * @returns {Object|null} Breaker status
     */
    getStatus(serviceName) {
        const breaker = this.breakers.get(serviceName);
        const metrics = this.breakerMetrics.get(serviceName);
        const health = this.healthStatus.get(serviceName);
        
        if (!breaker) return null;
        
        return {
            state: breaker.status.state,
            enabled: breaker.enabled,
            metrics: metrics || {},
            health: health || { status: 'unknown' },
            stats: breaker.stats || {}
        };
    }

    /**
     * Gets all circuit breaker statuses
     * @returns {Object} All breaker statuses
     */
    getAllStatuses() {
        const statuses = {};
        
        for (const serviceName of this.breakers.keys()) {
            statuses[serviceName] = this.getStatus(serviceName);
        }
        
        return statuses;
    }

    /**
     * Gets metrics
     * @returns {Object} Circuit breaker metrics
     */
    getMetrics() {
        return {
            statistics: { ...this.statistics },
            services: Object.fromEntries(this.breakerMetrics),
            health: Object.fromEntries(this.healthStatus)
        };
    }

    /**
     * Resets a circuit breaker
     * @param {string} serviceName - Service name
     */
    resetBreaker(serviceName) {
        const breaker = this.breakers.get(serviceName);
        
        if (breaker) {
            breaker.close();
            
            // Reset metrics
            const metrics = this.breakerMetrics.get(serviceName);
            if (metrics) {
                metrics.failures = 0;
                metrics.timeouts = 0;
                metrics.healthScore = 100;
            }
            
            this.log('info', `Circuit breaker reset for service: ${serviceName}`);
            this.emit('breaker:reset', { service: serviceName });
        }
    }

    /**
     * Enables a circuit breaker
     * @param {string} serviceName - Service name
     */
    enableBreaker(serviceName) {
        const breaker = this.breakers.get(serviceName);
        
        if (breaker) {
            breaker.enable();
            this.log('info', `Circuit breaker enabled for service: ${serviceName}`);
        }
    }

    /**
     * Disables a circuit breaker
     * @param {string} serviceName - Service name
     */
    disableBreaker(serviceName) {
        const breaker = this.breakers.get(serviceName);
        
        if (breaker) {
            breaker.disable();
            this.log('info', `Circuit breaker disabled for service: ${serviceName}`);
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
        if (this.logger) {
            this.logger[level](message, data);
        } else {
            console[level](message, data);
        }
    }

    /**
     * Shuts down the circuit breaker manager
     * @async
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.log('info', 'Shutting down Circuit Breaker Manager');
        
        // Clear intervals
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        // Shutdown all breakers
        for (const [serviceName, breaker] of this.breakers) {
            await breaker.shutdown();
        }
        
        // Clear collections
        this.breakers.clear();
        this.breakerConfigs.clear();
        this.breakerMetrics.clear();
        this.healthStatus.clear();
        this.stateHistory.clear();
        
        this.isInitialized = false;
        this.emit('circuit-breaker:shutdown');
        
        this.log('info', 'Circuit Breaker Manager shut down');
    }
}

module.exports = { CircuitBreakerManager };