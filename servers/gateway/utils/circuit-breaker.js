'use strict';

/**
 * @fileoverview Circuit Breaker - Advanced circuit breaker pattern implementation for API Gateway
 * @module servers/gateway/utils/circuit-breaker
 * @requires events
 * @requires os
 */

const { EventEmitter } = require('events');
const os = require('os');

/**
 * CircuitBreaker class implements the circuit breaker pattern with advanced features
 * including half-open state, adaptive thresholds, bulkhead isolation, timeout management,
 * and comprehensive metrics tracking.
 */
class CircuitBreaker extends EventEmitter {
    /**
     * Creates an instance of CircuitBreaker
     * @constructor
     * @param {string} name - Circuit breaker name
     * @param {Object} config - Circuit breaker configuration
     * @param {Object} logger - Logger instance
     */
    constructor(name, config = {}, logger = console) {
        super();
        this.name = name;
        this.config = this.mergeConfig(config);
        this.logger = logger;
        
        // Circuit breaker states
        this.states = {
            CLOSED: 'closed',
            OPEN: 'open',
            HALF_OPEN: 'half-open'
        };
        
        // Current state
        this.state = this.states.CLOSED;
        this.stateChangedAt = Date.now();
        
        // Failure tracking
        this.failures = 0;
        this.consecutiveFailures = 0;
        this.lastFailureTime = null;
        this.failureReasons = new Map();
        
        // Success tracking
        this.successes = 0;
        this.consecutiveSuccesses = 0;
        this.lastSuccessTime = null;
        
        // Request tracking
        this.requestCount = 0;
        this.pendingRequests = 0;
        this.rejectedRequests = 0;
        
        // Half-open state management
        this.halfOpenTests = 0;
        this.halfOpenSuccesses = 0;
        this.halfOpenFailures = 0;
        
        // Timeout management
        this.timeouts = 0;
        this.averageResponseTime = 0;
        this.responseTimeBuffer = [];
        this.responseTimeBufferSize = 100;
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            timeoutRequests: 0,
            rejectedRequests: 0,
            stateChanges: 0,
            openTime: 0,
            closedTime: 0,
            halfOpenTime: 0,
            lastStateChange: null,
            errorRate: 0,
            successRate: 0,
            averageResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0
        };
        
        // Sliding window for error rate calculation
        this.slidingWindow = [];
        this.windowSize = config.windowSize || 100;
        this.windowDuration = config.windowDuration || 60000; // 1 minute
        
        // Bulkhead isolation
        this.bulkhead = {
            enabled: config.bulkhead?.enabled || false,
            maxConcurrent: config.bulkhead?.maxConcurrent || 10,
            maxQueued: config.bulkhead?.maxQueued || 10,
            currentConcurrent: 0,
            queue: []
        };
        
        // Adaptive thresholds
        this.adaptive = {
            enabled: config.adaptive?.enabled || false,
            learningRate: config.adaptive?.learningRate || 0.1,
            baseThreshold: config.failureThreshold || 5,
            currentThreshold: config.failureThreshold || 5,
            minThreshold: config.adaptive?.minThreshold || 3,
            maxThreshold: config.adaptive?.maxThreshold || 10
        };
        
        // Fallback function
        this.fallbackFn = config.fallback || null;
        
        // Health check function
        this.healthCheckFn = config.healthCheck || null;
        this.healthCheckInterval = config.healthCheckInterval || 30000;
        this.healthCheckTimer = null;
        
        // State timers
        this.resetTimer = null;
        this.halfOpenTimer = null;
        
        // Event history
        this.eventHistory = [];
        this.maxEventHistory = config.maxEventHistory || 100;
        
        // Initialize state machine
        this.initializeStateMachine();
        
        // Start monitoring
        this.startMonitoring();
    }

    /**
     * Merges configuration with defaults
     * @private
     * @param {Object} config - User configuration
     * @returns {Object} Merged configuration
     */
    mergeConfig(config) {
        return {
            failureThreshold: config.failureThreshold || 5,
            successThreshold: config.successThreshold || 2,
            timeout: config.timeout || 10000,
            resetTimeout: config.resetTimeout || 60000,
            halfOpenMaxAttempts: config.halfOpenMaxAttempts || 3,
            
            errorThresholdPercentage: config.errorThresholdPercentage || 50,
            volumeThreshold: config.volumeThreshold || 20,
            
            monitoringInterval: config.monitoringInterval || 5000,
            metricsInterval: config.metricsInterval || 10000,
            
            enableDetailedMetrics: config.enableDetailedMetrics !== false,
            enableEventHistory: config.enableEventHistory !== false,
            
            retryPolicy: {
                enabled: config.retryPolicy?.enabled || false,
                maxRetries: config.retryPolicy?.maxRetries || 3,
                retryDelay: config.retryPolicy?.retryDelay || 1000,
                exponentialBackoff: config.retryPolicy?.exponentialBackoff !== false
            },
            
            ...config
        };
    }

    /**
     * Initializes the state machine
     * @private
     */
    initializeStateMachine() {
        this.stateTransitions = {
            [this.states.CLOSED]: {
                success: this.handleClosedSuccess.bind(this),
                failure: this.handleClosedFailure.bind(this),
                timeout: this.handleClosedTimeout.bind(this)
            },
            [this.states.OPEN]: {
                success: this.handleOpenSuccess.bind(this),
                failure: this.handleOpenFailure.bind(this),
                timeout: this.handleOpenTimeout.bind(this),
                timer: this.handleOpenTimer.bind(this)
            },
            [this.states.HALF_OPEN]: {
                success: this.handleHalfOpenSuccess.bind(this),
                failure: this.handleHalfOpenFailure.bind(this),
                timeout: this.handleHalfOpenTimeout.bind(this)
            }
        };
    }

    /**
     * Main execute method - wraps function calls with circuit breaker
     * @param {Function} fn - Function to execute
     * @param {...*} args - Function arguments
     * @returns {Promise<*>} Function result or fallback
     */
    async execute(fn, ...args) {
        // Check if circuit is open
        if (this.state === this.states.OPEN) {
            return this.handleOpenCircuit();
        }
        
        // Check bulkhead limits
        if (!this.checkBulkhead()) {
            return this.handleBulkheadRejection();
        }
        
        // Track request
        this.trackRequest();
        
        try {
            // Execute with timeout
            const result = await this.executeWithTimeout(fn, ...args);
            
            // Handle success
            await this.handleSuccess(result);
            
            return result;
            
        } catch (error) {
            // Handle failure
            await this.handleFailure(error);
            
            // Retry if configured
            if (this.config.retryPolicy.enabled && this.shouldRetry(error)) {
                return this.retryExecution(fn, args, error);
            }
            
            // Use fallback if available
            if (this.fallbackFn) {
                return this.executeFallback(error, ...args);
            }
            
            throw error;
            
        } finally {
            // Release bulkhead
            this.releaseBulkhead();
        }
    }

    /**
     * Executes function with timeout
     * @private
     * @param {Function} fn - Function to execute
     * @param {...*} args - Function arguments
     * @returns {Promise<*>} Function result
     */
    executeWithTimeout(fn, ...args) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            // Setup timeout
            const timeoutId = setTimeout(() => {
                this.handleTimeout();
                reject(new CircuitBreakerError('Timeout', 'TIMEOUT', this.config.timeout));
            }, this.config.timeout);
            
            // Execute function
            Promise.resolve(fn(...args))
                .then(result => {
                    clearTimeout(timeoutId);
                    
                    // Record response time
                    const responseTime = Date.now() - startTime;
                    this.recordResponseTime(responseTime);
                    
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    
                    // Record response time even for errors
                    const responseTime = Date.now() - startTime;
                    this.recordResponseTime(responseTime);
                    
                    reject(error);
                });
        });
    }

    /**
     * State transition handlers - CLOSED state
     */
    
    handleClosedSuccess() {
        this.successes++;
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
        this.lastSuccessTime = Date.now();
        
        // Update sliding window
        this.updateSlidingWindow(true);
    }
    
    handleClosedFailure(error) {
        this.failures++;
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        this.lastFailureTime = Date.now();
        
        // Track failure reason
        this.trackFailureReason(error);
        
        // Update sliding window
        this.updateSlidingWindow(false);
        
        // Check if should trip
        if (this.shouldTrip()) {
            this.trip();
        }
    }
    
    handleClosedTimeout() {
        this.timeouts++;
        this.handleClosedFailure(new Error('Timeout'));
    }

    /**
     * State transition handlers - OPEN state
     */
    
    handleOpenSuccess() {
        // Success during open state (shouldn't happen normally)
        this.logger.warn(`Success recorded in OPEN state for circuit ${this.name}`);
    }
    
    handleOpenFailure() {
        // Failure during open state (expected)
        this.rejectedRequests++;
    }
    
    handleOpenTimeout() {
        // Timeout during open state
        this.rejectedRequests++;
    }
    
    handleOpenTimer() {
        // Reset timeout expired, transition to half-open
        this.transitionTo(this.states.HALF_OPEN);
    }

    /**
     * State transition handlers - HALF_OPEN state
     */
    
    handleHalfOpenSuccess() {
        this.halfOpenSuccesses++;
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
        
        // Check if should close
        if (this.halfOpenSuccesses >= this.config.successThreshold) {
            this.close();
        }
    }
    
    handleHalfOpenFailure(error) {
        this.halfOpenFailures++;
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        
        // Track failure reason
        this.trackFailureReason(error);
        
        // Re-open circuit
        this.trip();
    }
    
    handleHalfOpenTimeout() {
        this.timeouts++;
        this.handleHalfOpenFailure(new Error('Timeout'));
    }

    /**
     * State management
     */
    
    trip() {
        if (this.state === this.states.OPEN) {
            return;
        }
        
        const previousState = this.state;
        this.transitionTo(this.states.OPEN);
        
        this.logger.warn(`Circuit ${this.name} tripped (${previousState} -> OPEN)`);
        
        // Set reset timer
        this.setResetTimer();
        
        // Emit event
        this.emit('open', {
            circuit: this.name,
            failures: this.consecutiveFailures,
            lastError: this.getLastError()
        });
        
        // Adaptive threshold adjustment
        if (this.adaptive.enabled) {
            this.adjustThreshold(true);
        }
    }
    
    close() {
        if (this.state === this.states.CLOSED) {
            return;
        }
        
        const previousState = this.state;
        this.transitionTo(this.states.CLOSED);
        
        this.logger.info(`Circuit ${this.name} closed (${previousState} -> CLOSED)`);
        
        // Reset counters
        this.resetCounters();
        
        // Clear timers
        this.clearTimers();
        
        // Emit event
        this.emit('close', {
            circuit: this.name,
            successes: this.consecutiveSuccesses
        });
        
        // Adaptive threshold adjustment
        if (this.adaptive.enabled) {
            this.adjustThreshold(false);
        }
    }
    
    halfOpen() {
        if (this.state === this.states.HALF_OPEN) {
            return;
        }
        
        const previousState = this.state;
        this.transitionTo(this.states.HALF_OPEN);
        
        this.logger.info(`Circuit ${this.name} half-open (${previousState} -> HALF_OPEN)`);
        
        // Reset half-open counters
        this.halfOpenTests = 0;
        this.halfOpenSuccesses = 0;
        this.halfOpenFailures = 0;
        
        // Emit event
        this.emit('half-open', {
            circuit: this.name
        });
    }
    
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        this.stateChangedAt = Date.now();
        
        // Update metrics
        this.updateStateMetrics(oldState, newState);
        
        // Record event
        this.recordEvent('state_change', {
            from: oldState,
            to: newState
        });
        
        this.metrics.stateChanges++;
        this.metrics.lastStateChange = Date.now();
    }

    /**
     * Circuit breaker logic
     */
    
    shouldTrip() {
        // Check failure threshold
        if (this.consecutiveFailures >= this.getCurrentThreshold()) {
            return true;
        }
        
        // Check error rate threshold
        if (this.getErrorRate() >= this.config.errorThresholdPercentage) {
            // Ensure minimum volume
            if (this.getRecentRequestCount() >= this.config.volumeThreshold) {
                return true;
            }
        }
        
        return false;
    }
    
    getCurrentThreshold() {
        if (this.adaptive.enabled) {
            return Math.round(this.adaptive.currentThreshold);
        }
        
        return this.config.failureThreshold;
    }
    
    adjustThreshold(wasTripped) {
        if (!this.adaptive.enabled) return;
        
        const adjustment = wasTripped ? 
            -this.adaptive.learningRate : 
            this.adaptive.learningRate;
        
        this.adaptive.currentThreshold = Math.max(
            this.adaptive.minThreshold,
            Math.min(
                this.adaptive.maxThreshold,
                this.adaptive.currentThreshold + adjustment
            )
        );
        
        this.logger.debug(`Adjusted threshold for ${this.name}: ${this.adaptive.currentThreshold}`);
    }
    
    shouldRetry(error) {
        if (!this.config.retryPolicy.enabled) {
            return false;
        }
        
        // Don't retry if circuit is open
        if (this.state === this.states.OPEN) {
            return false;
        }
        
        // Check if error is retryable
        if (error.code === 'TIMEOUT' || 
            error.code === 'ECONNREFUSED' ||
            error.code === 'ECONNRESET') {
            return true;
        }
        
        return false;
    }
    
    async retryExecution(fn, args, originalError) {
        const maxRetries = this.config.retryPolicy.maxRetries;
        let lastError = originalError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // Calculate delay
            const delay = this.calculateRetryDelay(attempt);
            
            this.logger.debug(`Retrying ${this.name}, attempt ${attempt} after ${delay}ms`);
            
            // Wait before retry
            await this.delay(delay);
            
            try {
                // Check if circuit is still not open
                if (this.state === this.states.OPEN) {
                    throw new CircuitBreakerError('Circuit open', 'CIRCUIT_OPEN');
                }
                
                // Retry execution
                const result = await this.executeWithTimeout(fn, ...args);
                
                // Success
                await this.handleSuccess(result);
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // Don't count retries as additional failures
                if (attempt === maxRetries) {
                    await this.handleFailure(error);
                }
            }
        }
        
        throw lastError;
    }
    
    calculateRetryDelay(attempt) {
        const baseDelay = this.config.retryPolicy.retryDelay;
        
        if (this.config.retryPolicy.exponentialBackoff) {
            return Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
        }
        
        return baseDelay;
    }

    /**
     * Request handling
     */
    
    async handleSuccess(result) {
        this.metrics.totalRequests++;
        this.metrics.successfulRequests++;
        
        const handler = this.stateTransitions[this.state].success;
        
        if (handler) {
            handler(result);
        }
        
        this.updateMetrics();
        
        this.emit('success', {
            circuit: this.name,
            state: this.state
        });
    }
    
    async handleFailure(error) {
        this.metrics.totalRequests++;
        this.metrics.failedRequests++;
        
        const handler = this.stateTransitions[this.state].failure;
        
        if (handler) {
            handler(error);
        }
        
        this.updateMetrics();
        
        this.emit('failure', {
            circuit: this.name,
            state: this.state,
            error: error.message
        });
    }
    
    handleTimeout() {
        this.metrics.timeoutRequests++;
        
        const handler = this.stateTransitions[this.state].timeout;
        
        if (handler) {
            handler();
        }
        
        this.emit('timeout', {
            circuit: this.name,
            state: this.state
        });
    }
    
    handleOpenCircuit() {
        // Check if should attempt reset
        if (this.shouldAttemptReset()) {
            this.halfOpen();
            return null; // Allow request to proceed
        }
        
        this.metrics.rejectedRequests++;
        this.rejectedRequests++;
        
        // Execute fallback if available
        if (this.fallbackFn) {
            return this.executeFallback(new CircuitBreakerError('Circuit open', 'CIRCUIT_OPEN'));
        }
        
        throw new CircuitBreakerError(
            `Circuit ${this.name} is open`,
            'CIRCUIT_OPEN'
        );
    }
    
    shouldAttemptReset() {
        if (this.state !== this.states.OPEN) {
            return false;
        }
        
        const timeSinceOpen = Date.now() - this.stateChangedAt;
        
        return timeSinceOpen >= this.config.resetTimeout;
    }
    
    async executeFallback(error, ...args) {
        try {
            this.logger.debug(`Executing fallback for ${this.name}`);
            
            const result = await this.fallbackFn(error, ...args);
            
            this.emit('fallback', {
                circuit: this.name,
                error: error.message
            });
            
            return result;
            
        } catch (fallbackError) {
            this.logger.error(`Fallback failed for ${this.name}:`, fallbackError);
            throw error; // Throw original error
        }
    }

    /**
     * Bulkhead pattern
     */
    
    checkBulkhead() {
        if (!this.bulkhead.enabled) {
            return true;
        }
        
        // Check concurrent limit
        if (this.bulkhead.currentConcurrent >= this.bulkhead.maxConcurrent) {
            // Check queue limit
            if (this.bulkhead.queue.length >= this.bulkhead.maxQueued) {
                return false;
            }
            
            // Queue request
            return new Promise((resolve) => {
                this.bulkhead.queue.push(resolve);
            });
        }
        
        this.bulkhead.currentConcurrent++;
        return true;
    }
    
    releaseBulkhead() {
        if (!this.bulkhead.enabled) {
            return;
        }
        
        this.bulkhead.currentConcurrent--;
        
        // Process queued requests
        if (this.bulkhead.queue.length > 0) {
            const next = this.bulkhead.queue.shift();
            this.bulkhead.currentConcurrent++;
            next(true);
        }
    }
    
    handleBulkheadRejection() {
        this.metrics.rejectedRequests++;
        
        this.emit('bulkhead-rejection', {
            circuit: this.name,
            concurrent: this.bulkhead.currentConcurrent,
            queued: this.bulkhead.queue.length
        });
        
        if (this.fallbackFn) {
            return this.executeFallback(
                new CircuitBreakerError('Bulkhead limit exceeded', 'BULKHEAD_REJECTION')
            );
        }
        
        throw new CircuitBreakerError(
            `Bulkhead limit exceeded for ${this.name}`,
            'BULKHEAD_REJECTION'
        );
    }

    /**
     * Metrics and monitoring
     */
    
    updateSlidingWindow(success) {
        const now = Date.now();
        
        // Add new entry
        this.slidingWindow.push({
            timestamp: now,
            success
        });
        
        // Remove old entries
        const cutoff = now - this.windowDuration;
        this.slidingWindow = this.slidingWindow.filter(entry => entry.timestamp > cutoff);
        
        // Keep window size limit
        if (this.slidingWindow.length > this.windowSize) {
            this.slidingWindow = this.slidingWindow.slice(-this.windowSize);
        }
    }
    
    getErrorRate() {
        if (this.slidingWindow.length === 0) {
            return 0;
        }
        
        const failures = this.slidingWindow.filter(entry => !entry.success).length;
        
        return (failures / this.slidingWindow.length) * 100;
    }
    
    getRecentRequestCount() {
        const now = Date.now();
        const cutoff = now - this.windowDuration;
        
        return this.slidingWindow.filter(entry => entry.timestamp > cutoff).length;
    }
    
    recordResponseTime(responseTime) {
        this.responseTimeBuffer.push(responseTime);
        
        if (this.responseTimeBuffer.length > this.responseTimeBufferSize) {
            this.responseTimeBuffer.shift();
        }
        
        // Update average
        this.updateResponseTimeMetrics();
    }
    
    updateResponseTimeMetrics() {
        if (this.responseTimeBuffer.length === 0) {
            return;
        }
        
        const sorted = [...this.responseTimeBuffer].sort((a, b) => a - b);
        const len = sorted.length;
        
        this.metrics.averageResponseTime = 
            sorted.reduce((a, b) => a + b, 0) / len;
        
        this.metrics.p95ResponseTime = 
            sorted[Math.floor(len * 0.95)] || 0;
        
        this.metrics.p99ResponseTime = 
            sorted[Math.floor(len * 0.99)] || 0;
    }
    
    updateMetrics() {
        // Calculate rates
        if (this.metrics.totalRequests > 0) {
            this.metrics.successRate = 
                (this.metrics.successfulRequests / this.metrics.totalRequests) * 100;
            
            this.metrics.errorRate = 
                (this.metrics.failedRequests / this.metrics.totalRequests) * 100;
        }
    }
    
    updateStateMetrics(oldState, newState) {
        const now = Date.now();
        const duration = now - this.stateChangedAt;
        
        // Update time spent in previous state
        switch (oldState) {
            case this.states.OPEN:
                this.metrics.openTime += duration;
                break;
            case this.states.CLOSED:
                this.metrics.closedTime += duration;
                break;
            case this.states.HALF_OPEN:
                this.metrics.halfOpenTime += duration;
                break;
        }
    }
    
    trackRequest() {
        this.requestCount++;
        this.pendingRequests++;
        
        if (this.bulkhead.enabled) {
            this.emit('request', {
                circuit: this.name,
                concurrent: this.bulkhead.currentConcurrent,
                queued: this.bulkhead.queue.length
            });
        }
    }
    
    trackFailureReason(error) {
        const reason = error.code || error.message || 'Unknown';
        const count = this.failureReasons.get(reason) || 0;
        
        this.failureReasons.set(reason, count + 1);
    }
    
    recordEvent(type, data) {
        if (!this.config.enableEventHistory) {
            return;
        }
        
        const event = {
            timestamp: Date.now(),
            type,
            data,
            state: this.state
        };
        
        this.eventHistory.push(event);
        
        // Limit history size
        if (this.eventHistory.length > this.maxEventHistory) {
            this.eventHistory.shift();
        }
    }

    /**
     * Timer management
     */
    
    setResetTimer() {
        this.clearTimers();
        
        this.resetTimer = setTimeout(() => {
            this.handleOpenTimer();
        }, this.config.resetTimeout);
    }
    
    clearTimers() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        
        if (this.halfOpenTimer) {
            clearTimeout(this.halfOpenTimer);
            this.halfOpenTimer = null;
        }
    }
    
    resetCounters() {
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.halfOpenTests = 0;
        this.halfOpenSuccesses = 0;
        this.halfOpenFailures = 0;
    }

    /**
     * Health checking
     */
    
    startHealthCheck() {
        if (!this.healthCheckFn || this.healthCheckTimer) {
            return;
        }
        
        this.healthCheckTimer = setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthCheckInterval);
        
        // Initial health check
        this.performHealthCheck();
    }
    
    async performHealthCheck() {
        if (this.state !== this.states.OPEN) {
            return;
        }
        
        try {
            await this.healthCheckFn();
            
            this.logger.debug(`Health check passed for ${this.name}`);
            
            // Transition to half-open
            this.halfOpen();
            
        } catch (error) {
            this.logger.debug(`Health check failed for ${this.name}:`, error.message);
        }
    }
    
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * Monitoring
     */
    
    startMonitoring() {
        // Metrics aggregation
        this.metricsTimer = setInterval(() => {
            this.aggregateMetrics();
        }, this.config.metricsInterval);
        
        // State monitoring
        this.monitoringTimer = setInterval(() => {
            this.monitorState();
        }, this.config.monitoringInterval);
        
        // Start health checks if configured
        if (this.healthCheckFn) {
            this.startHealthCheck();
        }
    }
    
    monitorState() {
        // Check if should auto-reset
        if (this.state === this.states.OPEN && this.shouldAttemptReset()) {
            this.halfOpen();
        }
        
        // Emit status
        this.emit('status', this.getStatus());
    }
    
    aggregateMetrics() {
        const metrics = this.getMetrics();
        
        this.emit('metrics', metrics);
        
        // Log if in open state for too long
        if (this.state === this.states.OPEN) {
            const openDuration = Date.now() - this.stateChangedAt;
            
            if (openDuration > this.config.resetTimeout * 2) {
                this.logger.warn(`Circuit ${this.name} has been open for ${openDuration}ms`);
            }
        }
    }

    /**
     * Helper methods
     */
    
    getLastError() {
        if (this.failureReasons.size === 0) {
            return null;
        }
        
        // Get most common error
        let maxCount = 0;
        let mostCommon = null;
        
        for (const [reason, count] of this.failureReasons) {
            if (count > maxCount) {
                maxCount = count;
                mostCommon = reason;
            }
        }
        
        return mostCommon;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    handleOpenTimer() {
        if (this.state === this.states.OPEN) {
            this.halfOpen();
        }
    }

    /**
     * Public API
     */
    
    /**
     * Gets current circuit breaker status
     * @returns {Object} Circuit breaker status
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            stateChangedAt: this.stateChangedAt,
            failures: this.consecutiveFailures,
            successes: this.consecutiveSuccesses,
            errorRate: this.getErrorRate(),
            threshold: this.getCurrentThreshold(),
            pendingRequests: this.pendingRequests,
            metrics: this.getMetrics()
        };
    }
    
    /**
     * Gets circuit breaker metrics
     * @returns {Object} Circuit breaker metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            state: this.state,
            uptime: Date.now() - (this.metrics.lastStateChange || Date.now()),
            errorRate: this.getErrorRate(),
            successRate: 100 - this.getErrorRate(),
            bulkhead: this.bulkhead.enabled ? {
                concurrent: this.bulkhead.currentConcurrent,
                queued: this.bulkhead.queue.length,
                maxConcurrent: this.bulkhead.maxConcurrent,
                maxQueued: this.bulkhead.maxQueued
            } : null
        };
    }
    
    /**
     * Gets event history
     * @returns {Array} Event history
     */
    getEventHistory() {
        return [...this.eventHistory];
    }
    
    /**
     * Gets failure reasons
     * @returns {Map} Failure reasons with counts
     */
    getFailureReasons() {
        return new Map(this.failureReasons);
    }
    
    /**
     * Checks if circuit is open
     * @returns {boolean} True if open
     */
    isOpen() {
        return this.state === this.states.OPEN;
    }
    
    /**
     * Checks if circuit is closed
     * @returns {boolean} True if closed
     */
    isClosed() {
        return this.state === this.states.CLOSED;
    }
    
    /**
     * Checks if circuit is half-open
     * @returns {boolean} True if half-open
     */
    isHalfOpen() {
        return this.state === this.states.HALF_OPEN;
    }
    
    /**
     * Manually opens the circuit
     */
    open() {
        this.trip();
    }
    
    /**
     * Manually closes the circuit
     */
    reset() {
        this.close();
    }
    
    /**
     * Updates configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config) {
        this.config = this.mergeConfig({ ...this.config, ...config });
        
        // Update adaptive settings
        if (config.adaptive) {
            this.adaptive = {
                ...this.adaptive,
                ...config.adaptive
            };
        }
        
        // Update bulkhead settings
        if (config.bulkhead) {
            this.bulkhead = {
                ...this.bulkhead,
                ...config.bulkhead
            };
        }
        
        this.logger.info(`Configuration updated for circuit ${this.name}`);
    }
    
    /**
     * Cleanup method
     */
    cleanup() {
        // Clear all timers
        this.clearTimers();
        
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
        }
        
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
        }
        
        this.stopHealthCheck();
        
        // Clear event listeners
        this.removeAllListeners();
        
        this.logger.info(`Circuit breaker ${this.name} cleaned up`);
    }
}

/**
 * CircuitBreakerError class for circuit breaker specific errors
 */
class CircuitBreakerError extends Error {
    constructor(message, code, timeout) {
        super(message);
        this.name = 'CircuitBreakerError';
        this.code = code;
        this.timeout = timeout;
    }
}

/**
 * CircuitBreakerFactory for managing multiple circuit breakers
 */
class CircuitBreakerFactory {
    constructor(defaultConfig = {}, logger = console) {
        this.defaultConfig = defaultConfig;
        this.logger = logger;
        this.breakers = new Map();
    }
    
    /**
     * Gets or creates a circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {Object} config - Circuit breaker configuration
     * @returns {CircuitBreaker} Circuit breaker instance
     */
    get(name, config = {}) {
        if (!this.breakers.has(name)) {
            const breaker = new CircuitBreaker(
                name,
                { ...this.defaultConfig, ...config },
                this.logger
            );
            
            this.breakers.set(name, breaker);
        }
        
        return this.breakers.get(name);
    }
    
    /**
     * Creates a new circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {Object} config - Circuit breaker configuration
     * @returns {CircuitBreaker} Circuit breaker instance
     */
    create(name, config = {}) {
        if (this.breakers.has(name)) {
            throw new Error(`Circuit breaker ${name} already exists`);
        }
        
        return this.get(name, config);
    }
    
    /**
     * Removes a circuit breaker
     * @param {string} name - Circuit breaker name
     */
    remove(name) {
        const breaker = this.breakers.get(name);
        
        if (breaker) {
            breaker.cleanup();
            this.breakers.delete(name);
        }
    }
    
    /**
     * Gets all circuit breakers
     * @returns {Map} All circuit breakers
     */
    getAll() {
        return new Map(this.breakers);
    }
    
    /**
     * Gets status of all circuit breakers
     * @returns {Array} Status of all circuit breakers
     */
    getAllStatus() {
        const status = [];
        
        for (const [name, breaker] of this.breakers) {
            status.push(breaker.getStatus());
        }
        
        return status;
    }
    
    /**
     * Cleanup all circuit breakers
     */
    cleanup() {
        for (const [name, breaker] of this.breakers) {
            breaker.cleanup();
        }
        
        this.breakers.clear();
    }
}

module.exports = {
    CircuitBreaker,
    CircuitBreakerError,
    CircuitBreakerFactory
};