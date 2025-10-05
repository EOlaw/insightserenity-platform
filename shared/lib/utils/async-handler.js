'use strict';

/**
 * @fileoverview Comprehensive async error handling utilities for Express routes
 * @module shared/lib/utils/async-handler
 */

const AppError = require('./app-error');
const logger = require('./logger');
const { performance } = require('perf_hooks');
const EventEmitter = require('events');

/**
 * @class AsyncHandler
 * @extends EventEmitter
 * @description Comprehensive async operations handler with advanced features
 */
class AsyncHandler extends EventEmitter {
  /**
   * Constructor
   * @param {Object} [config={}] - Configuration options
   */
  constructor(config = {}) {
    super();

    this.config = {
      defaultTimeout: config.defaultTimeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      exponentialBackoff: config.exponentialBackoff !== false,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
      enableMetrics: config.enableMetrics !== false,
      enableLogging: config.enableLogging !== false,
      enableCaching: config.enableCaching || false,
      cacheTimeout: config.cacheTimeout || 300000,
      batchSize: config.batchSize || 10,
      concurrencyLimit: config.concurrencyLimit || 10,
      ...config
    };

    // Metrics tracking
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      retries: 0,
      averageResponseTime: 0,
      circuitBreakerTrips: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // Circuit breaker state
    this.circuitBreakers = new Map();

    // Request cache
    this.cache = new Map();

    // Queue management
    this.queues = new Map();

    // Rate limiting
    this.rateLimiters = new Map();

    // Initialize monitoring
    this._initializeMonitoring();
  }

  /**
   * Initialize monitoring
   * @private
   */
  _initializeMonitoring() {
    if (this.config.enableMetrics) {
      setInterval(() => {
        this.emit('metrics', this.getMetrics());
      }, 60000); // Emit metrics every minute
    }
  }

  /**
   * Wrap async route handlers to catch errors
   * @param {Function} fn - Async function to wrap
   * @param {Object} [options={}] - Wrapping options
   * @returns {Function} Wrapped function
   */
  wrap(fn, options = {}) {
    const config = { ...this.config, ...options };
    const handlerName = fn.name || 'anonymous';

    return async (req, res, next) => {
      const startTime = performance.now();
      const requestId = this._generateRequestId();

      // Attach request ID to request object
      req.requestId = requestId;

      // Track metrics
      this.metrics.totalRequests++;

      try {
        // Add timeout wrapper
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            this.metrics.timeouts++;
            reject(new AppError('Request timeout', 408, 'TIMEOUT'));
          }, config.timeout || config.defaultTimeout);
        });

        // Execute function with timeout
        const result = await Promise.race([
          Promise.resolve(fn(req, res, next)),
          timeoutPromise
        ]);

        // Track success metrics
        this.metrics.successfulRequests++;
        this._updateResponseTime(performance.now() - startTime);

        // Emit success event
        this.emit('success', {
          requestId,
          handler: handlerName,
          duration: performance.now() - startTime
        });

        return result;
      } catch (error) {
        // Track error metrics
        this.metrics.failedRequests++;
        this._updateResponseTime(performance.now() - startTime);

        // Log error if enabled
        if (config.enableLogging) {
          logger.error(`${handlerName} error:`, {
            requestId,
            error: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method,
            ip: req.ip,
            userId: req.user?.id,
            duration: performance.now() - startTime
          });
        }

        // Emit error event
        this.emit('error', {
          requestId,
          handler: handlerName,
          error,
          duration: performance.now() - startTime
        });

        next(error);
      }
    };
  }

  /**
   * Wrap with logging enhancement
   * @param {Function} fn - Async function to wrap
   * @param {string} [context='AsyncHandler'] - Context for logging
   * @returns {Function} Wrapped function
   */
  wrapWithLogging(fn, context = 'AsyncHandler') {
    return this.wrap(fn, {
      enableLogging: true,
      context,
      logLevel: 'info'
    });
  }

  /**
   * Execute async function with timeout
   * @param {Function} fn - Async function to execute
   * @param {number} [timeout] - Timeout in milliseconds
   * @param {string} [timeoutMessage='Operation timed out'] - Timeout error message
   * @returns {Promise} Function result or timeout error
   */
  async withTimeout(fn, timeout = null, timeoutMessage = 'Operation timed out') {
    const actualTimeout = timeout || this.config.defaultTimeout;

    return Promise.race([
      fn(),
      new Promise((_, reject) => {
        setTimeout(() => {
          this.metrics.timeouts++;
          reject(new AppError(timeoutMessage, 408, 'TIMEOUT'));
        }, actualTimeout);
      })
    ]);
  }

  /**
   * Execute async function with retry logic
   * @param {Function} fn - Async function to execute
   * @param {Object} [options={}] - Retry options
   * @returns {Promise} Function result
   */
  async withRetry(fn, options = {}) {
    const {
      maxRetries = this.config.maxRetries,
      retryDelay = this.config.retryDelay,
      exponentialBackoff = this.config.exponentialBackoff,
      onRetry = null,
      retryCondition = null,
      abortSignal = null
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check abort signal
        if (abortSignal?.aborted) {
          throw new AppError('Operation aborted', 499, 'ABORTED');
        }

        const result = await fn();

        // Emit retry success event
        if (attempt > 1) {
          this.emit('retrySuccess', {
            attempt,
            totalAttempts: maxRetries
          });
        }

        return result;
      } catch (error) {
        lastError = error;
        this.metrics.retries++;

        // Check if should retry
        if (retryCondition && !retryCondition(error, attempt)) {
          throw error;
        }

        if (attempt === maxRetries) {
          this.emit('retryFailed', {
            attempts: maxRetries,
            error: lastError
          });
          throw error;
        }

        // Calculate delay
        const delay = exponentialBackoff
          ? retryDelay * Math.pow(2, attempt - 1)
          : retryDelay;

        // Call retry callback if provided
        if (onRetry) {
          onRetry(error, attempt, delay);
        }

        // Emit retry event
        this.emit('retry', {
          attempt,
          maxRetries,
          delay,
          error: error.message
        });

        // Wait before retry
        await this._delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute multiple async operations in parallel with error handling
   * @param {Array<Function>} operations - Array of async functions
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<Array>} Array of results
   */
  async parallel(operations, options = {}) {
    const {
      stopOnError = false,
      concurrency = this.config.concurrencyLimit,
      timeout = this.config.defaultTimeout
    } = options;

    if (stopOnError) {
      return Promise.all(operations.map(op =>
        this.withTimeout(op, timeout)
      ));
    }

    if (concurrency === Infinity) {
      const results = await Promise.allSettled(operations.map(op =>
        this.withTimeout(op, timeout)
      ));

      return results.map(result => {
        if (result.status === 'fulfilled') {
          return { success: true, value: result.value };
        }
        return { success: false, error: result.reason };
      });
    }

    // Limited concurrency
    return this._parallelWithLimit(operations, concurrency, timeout);
  }

  /**
   * Execute parallel operations with concurrency limit
   * @private
   * @param {Array<Function>} operations - Operations to execute
   * @param {number} limit - Concurrency limit
   * @param {number} timeout - Operation timeout
   * @returns {Promise<Array>} Results array
   */
  async _parallelWithLimit(operations, limit, timeout) {
    const results = [];
    const executing = [];

    for (const [index, operation] of operations.entries()) {
      const promise = this.withTimeout(operation, timeout)
        .then(value => ({ index, success: true, value }))
        .catch(error => ({ index, success: false, error }));

      results[index] = promise;

      if (operations.length >= limit) {
        executing.push(promise);

        if (executing.length >= limit) {
          const completed = await Promise.race(executing);
          executing.splice(executing.indexOf(completed), 1);
        }
      }
    }

    return Promise.all(results);
  }

  /**
   * Execute async operations in sequence
   * @param {Array<Function>} operations - Array of async functions
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<Array>} Array of results
   */
  async series(operations, options = {}) {
    const {
      stopOnError = true,
      delay = 0,
      accumulator = null
    } = options;

    const results = [];
    let accumulatedValue = accumulator;

    for (const [index, operation] of operations.entries()) {
      try {
        const result = accumulatedValue !== null
          ? await operation(accumulatedValue, index)
          : await operation();

        results.push({ success: true, value: result });

        if (accumulatedValue !== null) {
          accumulatedValue = result;
        }

        if (delay > 0 && index < operations.length - 1) {
          await this._delay(delay);
        }
      } catch (error) {
        results.push({ success: false, error });

        if (stopOnError) {
          throw error;
        }
      }
    }

    return results;
  }

  /**
   * Create circuit breaker for function
   * @param {Function} fn - Async function to protect
   * @param {Object} [options={}] - Circuit breaker options
   * @returns {Function} Protected function
   */
  createCircuitBreaker(fn, options = {}) {
    const {
      threshold = this.config.circuitBreakerThreshold,
      timeout = this.config.circuitBreakerTimeout,
      fallback = null,
      name = fn.name || 'anonymous'
    } = options;

    // Initialize circuit breaker state
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, {
        failures: 0,
        nextAttempt: Date.now(),
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        lastFailure: null,
        successCount: 0,
        totalCalls: 0
      });
    }

    return async (...args) => {
      const breaker = this.circuitBreakers.get(name);
      breaker.totalCalls++;

      // Check circuit state
      if (breaker.state === 'OPEN') {
        if (Date.now() < breaker.nextAttempt) {
          this.emit('circuitOpen', { name, state: breaker });

          if (fallback) {
            return fallback(...args);
          }
          throw new AppError('Circuit breaker is OPEN', 503, 'CIRCUIT_OPEN');
        }

        // Try half-open
        breaker.state = 'HALF_OPEN';
        this.emit('circuitHalfOpen', { name });
      }

      try {
        const result = await fn(...args);

        // Reset on success
        if (breaker.state === 'HALF_OPEN') {
          breaker.state = 'CLOSED';
          breaker.failures = 0;
          breaker.successCount = 0;
          this.emit('circuitClosed', { name });
        }

        breaker.successCount++;
        return result;
      } catch (error) {
        breaker.failures++;
        breaker.lastFailure = {
          error: error.message,
          timestamp: new Date().toISOString()
        };

        if (breaker.failures >= threshold) {
          breaker.state = 'OPEN';
          breaker.nextAttempt = Date.now() + timeout;
          this.metrics.circuitBreakerTrips++;

          logger.warn(`Circuit breaker opened for ${name}`, {
            failures: breaker.failures,
            threshold,
            resetTime: new Date(breaker.nextAttempt).toISOString()
          });

          this.emit('circuitOpened', {
            name,
            failures: breaker.failures,
            resetTime: breaker.nextAttempt
          });
        }

        throw error;
      }
    };
  }

  /**
   * Batch async operations
   * @param {Array} items - Items to process
   * @param {Function} processor - Async processor function
   * @param {number} [batchSize] - Batch size
   * @returns {Promise<Array>} Processed results
   */
  async batch(items, processor, batchSize = null) {
    const size = batchSize || this.config.batchSize;
    const results = [];
    const batches = [];

    // Create batches
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }

    // Process batches
    for (const [index, batch] of batches.entries()) {
      this.emit('batchStart', {
        batchIndex: index,
        batchSize: batch.length,
        totalBatches: batches.length
      });

      const batchResults = await Promise.all(
        batch.map(item => processor(item))
      );

      results.push(...batchResults);

      this.emit('batchComplete', {
        batchIndex: index,
        processedCount: batchResults.length
      });
    }

    return results;
  }

  /**
   * Debounce async function
   * @param {Function} fn - Function to debounce
   * @param {number} [delay=300] - Debounce delay in ms
   * @returns {Function} Debounced function
   */
  debounce(fn, delay = 300) {
    let timeoutId;
    let pending;

    const debounced = function(...args) {
      clearTimeout(timeoutId);

      if (!pending) {
        pending = new Promise((resolve, reject) => {
          timeoutId = setTimeout(async () => {
            try {
              const result = await fn.apply(this, args);
              resolve(result);
            } catch (error) {
              reject(error);
            } finally {
              pending = null;
            }
          }, delay);
        });
      }

      return pending;
    };

    // Add cancel method
    debounced.cancel = () => {
      clearTimeout(timeoutId);
      pending = null;
    };

    // Add flush method
    debounced.flush = async () => {
      if (pending) {
        clearTimeout(timeoutId);
        return fn();
      }
    };

    return debounced;
  }

  /**
   * Throttle async function
   * @param {Function} fn - Function to throttle
   * @param {number} [limit=1000] - Throttle limit in ms
   * @returns {Function} Throttled function
   */
  throttle(fn, limit = 1000) {
    let inThrottle;
    let lastResult;
    let lastArgs;
    let lastThis;

    const throttled = async function(...args) {
      lastArgs = args;
      lastThis = this;

      if (!inThrottle) {
        inThrottle = true;

        try {
          lastResult = await fn.apply(this, args);
        } finally {
          setTimeout(() => {
            inThrottle = false;

            // Execute pending call
            if (lastArgs) {
              throttled.apply(lastThis, lastArgs);
              lastArgs = null;
              lastThis = null;
            }
          }, limit);
        }
      }

      return lastResult;
    };

    // Add reset method
    throttled.reset = () => {
      inThrottle = false;
      lastArgs = null;
      lastThis = null;
      lastResult = null;
    };

    return throttled;
  }

  /**
   * Memoize async function
   * @param {Function} fn - Function to memoize
   * @param {Object} [options={}] - Memoization options
   * @returns {Function} Memoized function
   */
  memoize(fn, options = {}) {
    const {
      keyResolver = (...args) => JSON.stringify(args),
      ttl = this.config.cacheTimeout,
      maxSize = 100
    } = options;

    const cache = new Map();

    const memoized = async function(...args) {
      const key = keyResolver(...args);

      // Check cache
      if (cache.has(key)) {
        const cached = cache.get(key);

        // Check TTL
        if (!ttl || Date.now() - cached.timestamp < ttl) {
          this.metrics && this.metrics.cacheHits++;
          return cached.value;
        }

        // Remove expired entry
        cache.delete(key);
      }

      this.metrics && this.metrics.cacheMisses++;

      // Execute function
      const result = await fn.apply(this, args);

      // Store in cache
      cache.set(key, {
        value: result,
        timestamp: Date.now()
      });

      // Enforce max size
      if (cache.size > maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }

      return result;
    }.bind(this);

    // Add cache management methods
    memoized.clear = () => cache.clear();
    memoized.delete = (key) => cache.delete(key);
    memoized.has = (key) => cache.has(key);
    memoized.size = () => cache.size;

    return memoized;
  }

  /**
   * Create async queue
   * @param {number} [concurrency=1] - Max concurrent operations
   * @returns {Object} Queue object
   */
  createQueue(concurrency = 1) {
    const queue = [];
    let running = 0;
    let paused = false;

    const process = async () => {
      if (paused || running >= concurrency || queue.length === 0) {
        return;
      }

      running++;
      const { fn, resolve, reject, priority } = queue.shift();

      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        running--;
        process();
      }
    };

    const queueObj = {
      add(fn, priority = 0) {
        return new Promise((resolve, reject) => {
          const item = { fn, resolve, reject, priority };

          // Insert based on priority
          const insertIndex = queue.findIndex(i => i.priority < priority);
          if (insertIndex === -1) {
            queue.push(item);
          } else {
            queue.splice(insertIndex, 0, item);
          }

          process();
        });
      },

      size() {
        return queue.length;
      },

      running() {
        return running;
      },

      clear() {
        queue.length = 0;
      },

      pause() {
        paused = true;
      },

      resume() {
        paused = false;
        process();
      },

      isPaused() {
        return paused;
      }
    };

    return queueObj;
  }

  /**
   * Create rate limiter
   * @param {Object} [options={}] - Rate limiter options
   * @returns {Function} Rate limited function
   */
  createRateLimiter(options = {}) {
    const {
      maxRequests = 10,
      windowMs = 60000,
      keyGenerator = () => 'global'
    } = options;

    return (fn) => {
      return async (...args) => {
        const key = keyGenerator(...args);

        if (!this.rateLimiters.has(key)) {
          this.rateLimiters.set(key, {
            requests: [],
            blocked: false
          });
        }

        const limiter = this.rateLimiters.get(key);
        const now = Date.now();

        // Clean old requests
        limiter.requests = limiter.requests.filter(
          time => now - time < windowMs
        );

        // Check limit
        if (limiter.requests.length >= maxRequests) {
          const oldestRequest = limiter.requests[0];
          const resetTime = oldestRequest + windowMs;
          const waitTime = resetTime - now;

          throw new AppError(
            `Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds`,
            429,
            'RATE_LIMIT_EXCEEDED',
            { resetTime, waitTime }
          );
        }

        // Add request
        limiter.requests.push(now);

        // Execute function
        return fn(...args);
      };
    };
  }

  /**
   * Create async middleware wrapper
   * @param {Function} middleware - Async middleware function
   * @returns {Function} Wrapped middleware
   */
  middleware(middleware) {
    return async (req, res, next) => {
      try {
        await middleware(req, res, next);
      } catch (error) {
        if (!res.headersSent) {
          next(error);
        } else {
          logger.error('Error after headers sent:', {
            error: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method
          });
        }
      }
    };
  }

  /**
   * Handle async validation
   * @param {Function} validator - Async validator function
   * @returns {Function} Express middleware
   */
  validate(validator) {
    return async (req, res, next) => {
      try {
        await validator(req);
        next();
      } catch (error) {
        next(new AppError(
          error.message || 'Validation failed',
          400,
          'VALIDATION_ERROR',
          error.details
        ));
      }
    };
  }

  /**
   * Create async pipe
   * @param {...Function} fns - Functions to pipe
   * @returns {Function} Piped function
   */
  pipe(...fns) {
    return async (initialValue) => {
      let result = initialValue;

      for (const fn of fns) {
        result = await fn(result);
      }

      return result;
    };
  }

  /**
   * Create async compose
   * @param {...Function} fns - Functions to compose
   * @returns {Function} Composed function
   */
  compose(...fns) {
    return this.pipe(...fns.reverse());
  }

  /**
   * Execute with fallback
   * @param {Function} primary - Primary function
   * @param {Function} fallback - Fallback function
   * @returns {Promise} Result from primary or fallback
   */
  async withFallback(primary, fallback) {
    try {
      return await primary();
    } catch (primaryError) {
      logger.warn('Primary function failed, using fallback', {
        error: primaryError.message
      });

      try {
        return await fallback(primaryError);
      } catch (fallbackError) {
        throw new AppError(
          'Both primary and fallback failed',
          500,
          'FALLBACK_FAILED',
          { primaryError, fallbackError }
        );
      }
    }
  }

  /**
   * Execute with cache
   * @param {string} key - Cache key
   * @param {Function} fn - Function to execute if cache miss
   * @param {Object} [options={}] - Cache options
   * @returns {Promise} Cached or fresh result
   */
  async withCache(key, fn, options = {}) {
    const { ttl = this.config.cacheTimeout } = options;

    // Check cache
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);

      if (Date.now() - cached.timestamp < ttl) {
        this.metrics.cacheHits++;
        return cached.value;
      }

      this.cache.delete(key);
    }

    this.metrics.cacheMisses++;

    // Execute function
    const result = await fn();

    // Store in cache
    this.cache.set(key, {
      value: result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * Execute with transaction wrapper
   * @param {Function} fn - Function to execute in transaction
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise} Transaction result
   */
  async withTransaction(fn, options = {}) {
    const {
      isolationLevel = 'READ_COMMITTED',
      retries = 3,
      onRollback = null
    } = options;

    let transaction;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Start transaction (mock implementation)
        transaction = {
          id: this._generateRequestId(),
          startTime: Date.now(),
          isolationLevel
        };

        this.emit('transactionStart', transaction);

        // Execute function
        const result = await fn(transaction);

        // Commit transaction
        this.emit('transactionCommit', {
          ...transaction,
          duration: Date.now() - transaction.startTime
        });

        return result;
      } catch (error) {
        // Rollback transaction
        this.emit('transactionRollback', {
          ...transaction,
          error: error.message,
          attempt
        });

        if (onRollback) {
          await onRollback(error, attempt);
        }

        if (attempt === retries) {
          throw error;
        }

        // Wait before retry
        await this._delay(1000 * attempt);
      }
    }
  }

  /**
   * Create async iterator wrapper
   * @param {AsyncIterable} iterable - Async iterable
   * @param {Function} processor - Processor function
   * @returns {AsyncGenerator} Processed items
   */
  async *processAsyncIterator(iterable, processor) {
    for await (const item of iterable) {
      try {
        const processed = await processor(item);
        yield processed;
      } catch (error) {
        logger.error('Error processing item:', {
          error: error.message,
          item
        });

        // Optionally yield error
        yield { error: error.message, item };
      }
    }
  }

  /**
   * Execute with progress tracking
   * @param {Array} items - Items to process
   * @param {Function} processor - Processor function
   * @param {Function} [onProgress] - Progress callback
   * @returns {Promise<Array>} Processed results
   */
  async withProgress(items, processor, onProgress = null) {
    const total = items.length;
    const results = [];
    let processed = 0;

    for (const [index, item] of items.entries()) {
      const result = await processor(item, index);
      results.push(result);
      processed++;

      const progress = {
        current: processed,
        total,
        percentage: Math.round((processed / total) * 100),
        item,
        result
      };

      if (onProgress) {
        onProgress(progress);
      }

      this.emit('progress', progress);
    }

    return results;
  }

  /**
   * Create mutex for async operations
   * @param {string} [name='default'] - Mutex name
   * @returns {Object} Mutex object
   */
  createMutex(name = 'default') {
    let locked = false;
    const waiting = [];

    return {
      async acquire() {
        if (locked) {
          await new Promise(resolve => waiting.push(resolve));
        }
        locked = true;
      },

      release() {
        locked = false;
        const next = waiting.shift();
        if (next) {
          next();
        }
      },

      async withLock(fn) {
        await this.acquire();
        try {
          return await fn();
        } finally {
          this.release();
        }
      },

      isLocked() {
        return locked;
      },

      queueLength() {
        return waiting.length;
      }
    };
  }

  /**
   * Create semaphore for async operations
   * @param {number} [permits=1] - Number of permits
   * @returns {Object} Semaphore object
   */
  createSemaphore(permits = 1) {
    let available = permits;
    const waiting = [];

    return {
      async acquire(count = 1) {
        if (available >= count) {
          available -= count;
        } else {
          await new Promise(resolve => waiting.push({ resolve, count }));
        }
      },

      release(count = 1) {
        available += count;

        while (waiting.length > 0 && available >= waiting[0].count) {
          const { resolve, count: requestedCount } = waiting.shift();
          available -= requestedCount;
          resolve();
        }
      },

      async withPermits(count, fn) {
        await this.acquire(count);
        try {
          return await fn();
        } finally {
          this.release(count);
        }
      },

      availablePermits() {
        return available;
      },

      queueLength() {
        return waiting.length;
      }
    };
  }

  /**
   * Get metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(
        ([name, state]) => ({ name, ...state })
      ),
      cacheSize: this.cache.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      retries: 0,
      averageResponseTime: 0,
      circuitBreakerTrips: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Update response time metric
   * @private
   * @param {number} responseTime - Response time in ms
   */
  _updateResponseTime(responseTime) {
    const current = this.metrics.averageResponseTime;
    const count = this.metrics.totalRequests;

    this.metrics.averageResponseTime =
      (current * (count - 1) + responseTime) / count;
  }

  /**
   * Generate request ID
   * @private
   * @returns {string} Request ID
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay helper
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Delay promise
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create singleton instance
   * @static
   * @param {Object} [config={}] - Configuration
   * @returns {AsyncHandler} Singleton instance
   */
  static getInstance(config = {}) {
    if (!AsyncHandler.instance) {
      AsyncHandler.instance = new AsyncHandler(config);
    }
    return AsyncHandler.instance;
  }
}

// Export the class and convenience methods
module.exports = AsyncHandler;
module.exports.wrap = (fn, options) => AsyncHandler.getInstance().wrap(fn, options);
module.exports.withTimeout = (fn, timeout) => AsyncHandler.getInstance().withTimeout(fn, timeout);
module.exports.withRetry = (fn, options) => AsyncHandler.getInstance().withRetry(fn, options);
module.exports.parallel = (operations, options) => AsyncHandler.getInstance().parallel(operations, options);
module.exports.series = (operations, options) => AsyncHandler.getInstance().series(operations, options);
module.exports.middleware = (fn) => AsyncHandler.getInstance().middleware(fn);
