/**
 * @fileoverview Circuit Breaker Implementation
 * @module servers/gateway/utils/circuit-breaker
 * @description Production-ready circuit breaker pattern for fault tolerance
 */

const EventEmitter = require('events');

/**
 * Circuit Breaker States
 */
const CircuitState = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit Breaker Class
 * @class CircuitBreaker
 * @extends EventEmitter
 */
class CircuitBreaker extends EventEmitter {
    /**
     * Creates an instance of CircuitBreaker
     * @param {Object} options - Circuit breaker options
     */
    constructor(options = {}) {
        super();

        // Configuration
        this.name = options.name || 'circuit-breaker';
        this.timeout = options.timeout || 10000; // Request timeout
        this.threshold = options.threshold || 5; // Failure threshold
        this.resetTimeout = options.resetTimeout || 30000; // Time before trying half-open
        this.rollingWindow = options.rollingWindow || 10000; // Time window for metrics
        this.volumeThreshold = options.volumeThreshold || 10; // Min requests before opening
        this.errorThresholdPercentage = options.errorThresholdPercentage || 50;
        this.fallbackFunction = options.fallback || null;
        this.healthCheckFunction = options.healthCheck || null;

        // State
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.requests = [];
        this.lastFailureTime = null;
        this.nextAttempt = null;
        this.halfOpenRequests = 0;

        // Metrics
        this.metrics = {
            totalRequests: 0,
            totalSuccesses: 0,
            totalFailures: 0,
            totalTimeouts: 0,
            totalCircuitOpens: 0,
            lastStateChange: Date.now(),
            requestTimes: [],
            errorRates: []
        };

        // Buckets for rolling window
        this.buckets = [];
        this.currentBucket = this._createBucket();

        // Start bucket rotation
        this._startBucketRotation();
    }

    /**
     * Execute function with circuit breaker protection
     * @param {Function} fn - Function to execute
     * @param {...any} args - Function arguments
     * @returns {Promise<any>} Function result
     */
    async execute(fn, ...args) {
        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            if (this._shouldAttemptReset()) {
                this._toHalfOpen();
            } else {
                return this._handleOpen();
            }
        }

        // Track request
        const startTime = Date.now();
        this.metrics.totalRequests++;
        this.currentBucket.requests++;

        try {
            // Set timeout for the request
            const result = await this._executeWithTimeout(fn, args);

            // Handle success
            this._onSuccess(startTime);
            return result;

        } catch (error) {
            // Handle failure
            this._onFailure(error, startTime);
            throw error;
        }
    }

    /**
     * Execute function with timeout
     * @private
     */
    async _executeWithTimeout(fn, args) {
        return new Promise(async (resolve, reject) => {
            let timeoutId;

            // Set timeout
            timeoutId = setTimeout(() => {
                this.metrics.totalTimeouts++;
                this.currentBucket.timeouts++;
                reject(new Error(`Circuit breaker timeout after ${this.timeout}ms`));
            }, this.timeout);

            try {
                const result = await fn(...args);
                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    /**
     * Handle successful request
     * @private
     */
    _onSuccess(startTime) {
        const duration = Date.now() - startTime;

        // Update metrics
        this.metrics.totalSuccesses++;
        this.metrics.requestTimes.push(duration);
        this.currentBucket.successes++;

        // Keep only last 100 request times
        if (this.metrics.requestTimes.length > 100) {
            this.metrics.requestTimes = this.metrics.requestTimes.slice(-100);
        }

        // Handle state-specific logic
        if (this.state === CircuitState.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.volumeThreshold) {
                this._toClose();
            }
        } else if (this.state === CircuitState.CLOSED) {
            this.failures = 0;
        }

        this.emit('success', { duration, state: this.state });
    }

    /**
     * Handle failed request
     * @private
     */
    _onFailure(error, startTime) {
        const duration = Date.now() - startTime;

        // Update metrics
        this.metrics.totalFailures++;
        this.currentBucket.failures++;
        this.lastFailureTime = Date.now();

        // Handle state-specific logic
        if (this.state === CircuitState.HALF_OPEN) {
            this._toOpen();
        } else if (this.state === CircuitState.CLOSED) {
            this.failures++;

            // Check if should open circuit
            if (this._shouldOpen()) {
                this._toOpen();
            }
        }

        this.emit('failure', {
            error: error.message,
            duration,
            state: this.state
        });

        // Try fallback if available
        if (this.fallbackFunction) {
            return this.fallbackFunction(error);
        }
    }

    /**
     * Check if circuit should open
     * @private
     */
    _shouldOpen() {
        // Get metrics from rolling window
        const windowMetrics = this._getWindowMetrics();

        // Need minimum volume
        if (windowMetrics.total < this.volumeThreshold) {
            return false;
        }

        // Check error rate
        const errorRate = (windowMetrics.failures / windowMetrics.total) * 100;

        // Check threshold
        if (this.failures >= this.threshold || errorRate >= this.errorThresholdPercentage) {
            return true;
        }

        return false;
    }

    /**
     * Check if should attempt reset
     * @private
     */
    _shouldAttemptReset() {
        return Date.now() >= this.nextAttempt;
    }

    /**
     * Handle open circuit
     * @private
     */
    _handleOpen() {
        const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
        error.code = 'CIRCUIT_OPEN';
        error.circuitBreaker = this.name;

        // Try fallback if available
        if (this.fallbackFunction) {
            return this.fallbackFunction(error);
        }

        throw error;
    }

    /**
     * Transition to OPEN state
     * @private
     */
    _toOpen() {
        if (this.state === CircuitState.OPEN) return;

        this.state = CircuitState.OPEN;
        this.metrics.totalCircuitOpens++;
        this.metrics.lastStateChange = Date.now();
        this.nextAttempt = Date.now() + this.resetTimeout;

        this.emit('open', {
            failures: this.failures,
            lastFailureTime: this.lastFailureTime
        });

        // Schedule health check if available
        if (this.healthCheckFunction) {
            this._scheduleHealthCheck();
        }
    }

    /**
     * Transition to HALF_OPEN state
     * @private
     */
    _toHalfOpen() {
        this.state = CircuitState.HALF_OPEN;
        this.metrics.lastStateChange = Date.now();
        this.successes = 0;
        this.failures = 0;
        this.halfOpenRequests = 0;

        this.emit('half-open', {
            lastFailureTime: this.lastFailureTime
        });
    }

    /**
     * Transition to CLOSED state
     * @private
     */
    _toClose() {
        this.state = CircuitState.CLOSED;
        this.metrics.lastStateChange = Date.now();
        this.failures = 0;
        this.successes = 0;
        this.nextAttempt = null;

        this.emit('close', {
            recoveryTime: Date.now() - this.lastFailureTime
        });
    }

    /**
     * Schedule health check
     * @private
     */
    _scheduleHealthCheck() {
        setTimeout(async () => {
            if (this.state !== CircuitState.OPEN) return;

            try {
                await this.healthCheckFunction();
                this._toHalfOpen();
            } catch (error) {
                // Health check failed, remain open
                this.nextAttempt = Date.now() + this.resetTimeout;
                this._scheduleHealthCheck();
            }
        }, this.resetTimeout);
    }

    /**
     * Create new metrics bucket
     * @private
     */
    _createBucket() {
        return {
            timestamp: Date.now(),
            requests: 0,
            successes: 0,
            failures: 0,
            timeouts: 0
        };
    }

    /**
     * Start bucket rotation for rolling window
     * @private
     */
    _startBucketRotation() {
        setInterval(() => {
            // Add current bucket to history
            this.buckets.push(this.currentBucket);

            // Remove old buckets outside window
            const cutoff = Date.now() - this.rollingWindow;
            this.buckets = this.buckets.filter(b => b.timestamp > cutoff);

            // Create new bucket
            this.currentBucket = this._createBucket();

            // Calculate error rate
            const windowMetrics = this._getWindowMetrics();
            if (windowMetrics.total > 0) {
                const errorRate = (windowMetrics.failures / windowMetrics.total) * 100;
                this.metrics.errorRates.push({
                    timestamp: Date.now(),
                    rate: errorRate
                });

                // Keep only last 100 error rates
                if (this.metrics.errorRates.length > 100) {
                    this.metrics.errorRates = this.metrics.errorRates.slice(-100);
                }
            }
        }, 1000); // Rotate every second
    }

    /**
     * Get metrics from rolling window
     * @private
     */
    _getWindowMetrics() {
        const allBuckets = [...this.buckets, this.currentBucket];

        return allBuckets.reduce((acc, bucket) => {
            acc.total += bucket.requests;
            acc.successes += bucket.successes;
            acc.failures += bucket.failures;
            acc.timeouts += bucket.timeouts;
            return acc;
        }, { total: 0, successes: 0, failures: 0, timeouts: 0 });
    }

    /**
     * Force open the circuit
     */
    forceOpen() {
        this._toOpen();
    }

    /**
     * Force close the circuit
     */
    forceClose() {
        this._toClose();
    }

    /**
     * Reset the circuit breaker
     */
    reset() {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.requests = [];
        this.lastFailureTime = null;
        this.nextAttempt = null;
        this.buckets = [];
        this.currentBucket = this._createBucket();

        this.emit('reset');
    }

    /**
     * Get current status
     */
    getStatus() {
        const windowMetrics = this._getWindowMetrics();

        return {
            name: this.name,
            state: this.state,
            metrics: {
                ...this.metrics,
                window: windowMetrics,
                errorRate: windowMetrics.total > 0 ?
                    (windowMetrics.failures / windowMetrics.total) * 100 : 0,
                averageResponseTime: this.metrics.requestTimes.length > 0 ?
                    this.metrics.requestTimes.reduce((a, b) => a + b, 0) / this.metrics.requestTimes.length : 0
            },
            config: {
                timeout: this.timeout,
                threshold: this.threshold,
                resetTimeout: this.resetTimeout,
                errorThresholdPercentage: this.errorThresholdPercentage
            }
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        if (this.healthCheckFunction) {
            return await this.healthCheckFunction();
        }
        return this.state === CircuitState.CLOSED;
    }
}

/**
 * Circuit Breaker Factory
 */
class CircuitBreakerFactory {
    constructor() {
        this.breakers = new Map();
    }

    /**
     * Get or create circuit breaker
     */
    getBreaker(name, options = {}) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker({
                name,
                ...options
            }));
        }
        return this.breakers.get(name);
    }

    /**
     * Get all breakers
     */
    getAllBreakers() {
        return Array.from(this.breakers.values());
    }

    /**
     * Get all statuses
     */
    getAllStatuses() {
        return Array.from(this.breakers.values()).map(breaker => breaker.getStatus());
    }

    /**
     * Reset all breakers
     */
    resetAll() {
        this.breakers.forEach(breaker => breaker.reset());
    }

    /**
     * Remove breaker
     */
    removeBreaker(name) {
        return this.breakers.delete(name);
    }
}

module.exports = {
    CircuitBreaker,
    CircuitBreakerFactory,
    CircuitState
};
