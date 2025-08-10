/**
 * Circuit Breaker Middleware
 * Implements circuit breaker pattern for fault tolerance
 */

const CircuitBreaker = require('opossum');

/**
 * Circuit Breaker Middleware Class
 */
class CircuitBreakerMiddleware {
    constructor(config, metricsCollector) {
        this.config = config;
        this.metricsCollector = metricsCollector;
        this.breakers = new Map();
        this.globalBreaker = null;
    }

    /**
     * Initialize circuit breaker middleware
     */
    async initialize() {
        if (!this.config.enabled) {
            return;
        }

        // Create global circuit breaker
        this.globalBreaker = this.createBreaker('global', {
            timeout: this.config.timeout,
            errorThresholdPercentage: this.config.errorThresholdPercentage,
            resetTimeout: this.config.resetTimeout,
            rollingCountTimeout: this.config.rollingCountTimeout,
            rollingCountBuckets: this.config.rollingCountBuckets,
            volumeThreshold: this.config.volumeThreshold,
            halfOpen: this.config.halfOpenRequests
        });
    }

    /**
     * Get middleware function
     */
    getMiddleware() {
        return (req, res, next) => {
            if (!this.config.enabled) {
                return next();
            }

            // Store original next for circuit breaker
            req.circuitBreakerNext = next;
            
            // Add circuit breaker context to request
            req.circuitBreaker = {
                getBreaker: this.getBreaker.bind(this),
                createBreaker: this.createBreaker.bind(this),
                executeWithBreaker: this.executeWithBreaker.bind(this),
                getStatus: this.getStatus.bind(this),
                isOpen: this.isOpen.bind(this),
                forceOpen: this.forceOpen.bind(this),
                forceClose: this.forceClose.bind(this),
                reset: this.reset.bind(this)
            };

            next();
        };
    }

    /**
     * Create a circuit breaker
     */
    createBreaker(name, options = {}) {
        const breakerOptions = {
            timeout: options.timeout || this.config.timeout || 30000,
            errorThresholdPercentage: options.errorThresholdPercentage || this.config.errorThresholdPercentage || 50,
            resetTimeout: options.resetTimeout || this.config.resetTimeout || 30000,
            rollingCountTimeout: options.rollingCountTimeout || this.config.rollingCountTimeout || 10000,
            rollingCountBuckets: options.rollingCountBuckets || this.config.rollingCountBuckets || 10,
            volumeThreshold: options.volumeThreshold || this.config.volumeThreshold || 20,
            halfOpen: options.halfOpen || this.config.halfOpenRequests || 3,
            name: name,
            errorFilter: options.errorFilter || this.defaultErrorFilter.bind(this),
            fallback: options.fallback
        };

        // Create the circuit breaker
        const breaker = new CircuitBreaker(
            options.action || this.defaultAction.bind(this),
            breakerOptions
        );

        // Setup event handlers
        this.setupBreakerEvents(breaker, name);

        // Store the breaker
        this.breakers.set(name, breaker);

        return breaker;
    }

    /**
     * Get or create a circuit breaker
     */
    getBreaker(name) {
        if (!this.breakers.has(name)) {
            return this.createBreaker(name);
        }
        return this.breakers.get(name);
    }

    /**
     * Execute function with circuit breaker
     */
    async executeWithBreaker(name, fn, options = {}) {
        const breaker = this.getBreaker(name);
        
        try {
            // Check if breaker is open before executing
            if (breaker.opened) {
                const error = new Error(`Circuit breaker '${name}' is open`);
                error.code = 'CIRCUIT_BREAKER_OPEN';
                throw error;
            }

            // Execute with circuit breaker
            const result = await breaker.fire(fn);
            return result;
        } catch (error) {
            // Handle fallback if provided
            if (options.fallback) {
                return await options.fallback(error);
            }
            throw error;
        }
    }

    /**
     * Default action for circuit breaker
     */
    async defaultAction(fn) {
        if (typeof fn === 'function') {
            return await fn();
        }
        return fn;
    }

    /**
     * Default error filter
     */
    defaultErrorFilter(error) {
        // Don't trip circuit on client errors (4xx)
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
            return false;
        }
        
        // Don't trip on specific error codes
        const ignoredCodes = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'];
        if (error.code && ignoredCodes.includes(error.code)) {
            return false;
        }

        return true;
    }

    /**
     * Setup circuit breaker event handlers
     */
    setupBreakerEvents(breaker, name) {
        // Circuit opened
        breaker.on('open', () => {
            console.warn(`Circuit breaker opened: ${name}`);
            this.metricsCollector?.incrementCounter('circuit_breaker_open_total', { name });
            this.metricsCollector?.registerGauge('circuit_breaker_state', 1, { name, state: 'open' });
        });

        // Circuit closed
        breaker.on('close', () => {
            console.info(`Circuit breaker closed: ${name}`);
            this.metricsCollector?.incrementCounter('circuit_breaker_close_total', { name });
            this.metricsCollector?.registerGauge('circuit_breaker_state', 0, { name, state: 'closed' });
        });

        // Circuit half-open
        breaker.on('halfOpen', () => {
            console.info(`Circuit breaker half-open: ${name}`);
            this.metricsCollector?.registerGauge('circuit_breaker_state', 0.5, { name, state: 'half-open' });
        });

        // Request successful
        breaker.on('success', (elapsed) => {
            this.metricsCollector?.incrementCounter('circuit_breaker_success_total', { name });
            this.metricsCollector?.observeHistogram('circuit_breaker_duration_ms', elapsed, { name, result: 'success' });
        });

        // Request failed
        breaker.on('failure', (elapsed, error) => {
            this.metricsCollector?.incrementCounter('circuit_breaker_failure_total', { 
                name, 
                error_type: error.name || 'unknown' 
            });
            this.metricsCollector?.observeHistogram('circuit_breaker_duration_ms', elapsed, { name, result: 'failure' });
        });

        // Request timeout
        breaker.on('timeout', (elapsed) => {
            console.warn(`Circuit breaker timeout: ${name} (${elapsed}ms)`);
            this.metricsCollector?.incrementCounter('circuit_breaker_timeout_total', { name });
            this.metricsCollector?.observeHistogram('circuit_breaker_duration_ms', elapsed, { name, result: 'timeout' });
        });

        // Request rejected (circuit open)
        breaker.on('reject', () => {
            this.metricsCollector?.incrementCounter('circuit_breaker_reject_total', { name });
        });

        // Fallback executed
        breaker.on('fallback', (result) => {
            this.metricsCollector?.incrementCounter('circuit_breaker_fallback_total', { name });
        });

        // Health check failed
        breaker.on('healthCheckFailed', (elapsed) => {
            console.warn(`Circuit breaker health check failed: ${name}`);
            this.metricsCollector?.incrementCounter('circuit_breaker_health_check_failed_total', { name });
        });

        // Semaphore locked (max concurrent requests)
        breaker.on('semaphoreLocked', () => {
            this.metricsCollector?.incrementCounter('circuit_breaker_semaphore_locked_total', { name });
        });
    }

    /**
     * Get circuit breaker status
     */
    getStatus(name) {
        const breaker = this.breakers.get(name) || this.globalBreaker;
        if (!breaker) {
            return null;
        }

        const stats = breaker.stats;
        return {
            name: name,
            state: breaker.opened ? 'open' : (breaker.pendingClose ? 'half-open' : 'closed'),
            enabled: breaker.enabled,
            requests: {
                total: stats.fires,
                successful: stats.successes,
                failed: stats.failures,
                timeout: stats.timeouts,
                rejected: stats.rejects,
                fallback: stats.fallbacks,
                semaphoreRejected: stats.semaphoreRejections,
                percentiles: stats.percentiles
            },
            errorPercentage: stats.errorPercentage,
            latency: {
                mean: stats.latencyMean,
                total: stats.latencyTotal
            },
            healthCounts: breaker.healthCounts,
            metrics: breaker.metrics
        };
    }

    /**
     * Get all circuit breaker statuses
     */
    getAllStatuses() {
        const statuses = {};
        
        for (const [name, breaker] of this.breakers) {
            statuses[name] = this.getStatus(name);
        }
        
        if (this.globalBreaker) {
            statuses.global = this.getStatus('global');
        }
        
        return statuses;
    }

    /**
     * Check if circuit breaker is open
     */
    isOpen(name) {
        const breaker = this.breakers.get(name) || this.globalBreaker;
        return breaker ? breaker.opened : false;
    }

    /**
     * Force open a circuit breaker
     */
    forceOpen(name) {
        const breaker = this.breakers.get(name) || this.globalBreaker;
        if (breaker) {
            breaker.open();
            return true;
        }
        return false;
    }

    /**
     * Force close a circuit breaker
     */
    forceClose(name) {
        const breaker = this.breakers.get(name) || this.globalBreaker;
        if (breaker) {
            breaker.close();
            return true;
        }
        return false;
    }

    /**
     * Reset a circuit breaker
     */
    reset(name) {
        const breaker = this.breakers.get(name) || this.globalBreaker;
        if (breaker) {
            breaker.clearCache();
            return true;
        }
        return false;
    }

    /**
     * Disable a circuit breaker
     */
    disable(name) {
        const breaker = this.breakers.get(name) || this.globalBreaker;
        if (breaker) {
            breaker.disable();
            return true;
        }
        return false;
    }

    /**
     * Enable a circuit breaker
     */
    enable(name) {
        const breaker = this.breakers.get(name) || this.globalBreaker;
        if (breaker) {
            breaker.enable();
            return true;
        }
        return false;
    }

    /**
     * Warmup a circuit breaker
     */
    async warmup(name) {
        const breaker = this.breakers.get(name);
        if (breaker && breaker.warmUp) {
            await breaker.warmUp();
            return true;
        }
        return false;
    }

    /**
     * Health check for circuit breakers
     */
    async healthCheck() {
        const results = {};
        
        for (const [name, breaker] of this.breakers) {
            results[name] = {
                healthy: !breaker.opened,
                state: breaker.opened ? 'open' : 'closed',
                stats: breaker.stats
            };
        }
        
        return {
            healthy: Object.values(results).every(r => r.healthy),
            breakers: results
        };
    }

    /**
     * Export metrics
     */
    exportMetrics() {
        const metrics = [];
        
        for (const [name, breaker] of this.breakers) {
            const stats = breaker.stats;
            metrics.push({
                name: name,
                state: breaker.opened ? 'open' : 'closed',
                requests: stats.fires,
                successes: stats.successes,
                failures: stats.failures,
                timeouts: stats.timeouts,
                rejects: stats.rejects,
                errorPercentage: stats.errorPercentage,
                latencyMean: stats.latencyMean
            });
        }
        
        return metrics;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Shutdown all circuit breakers
        for (const [name, breaker] of this.breakers) {
            if (breaker.shutdown) {
                await breaker.shutdown();
            }
        }
        
        if (this.globalBreaker && this.globalBreaker.shutdown) {
            await this.globalBreaker.shutdown();
        }
        
        this.breakers.clear();
        this.globalBreaker = null;
    }
}

module.exports = { CircuitBreakerMiddleware };