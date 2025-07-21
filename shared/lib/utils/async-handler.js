'use strict';

/**
 * @fileoverview Async function wrapper for clean exception handling in Express routes
 * @module shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/logger
 */

const { AppError } = require('./app-error');
const Logger = require('./logger');

/**
 * @class AsyncHandler
 * @description Utility class for handling async operations with proper error catching
 */
class AsyncHandler {
  /**
   * Wraps async route handler to catch errors
   * @static
   * @param {Function} fn - Async function to wrap
   * @returns {Function} Express middleware function
   */
  static wrap(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Wraps async function with error handling and logging
   * @static
   * @param {Function} fn - Async function to wrap
   * @param {Object} [options={}] - Handler options
   * @returns {Function} Wrapped function
   */
  static wrapWithLogging(fn, options = {}) {
    const {
      name = fn.name || 'anonymous',
      logArgs = false,
      logResult = false,
      transformError = null
    } = options;

    return async (...args) => {
      const startTime = Date.now();
      const context = {
        function: name,
        timestamp: new Date().toISOString()
      };

      if (logArgs) {
        context.arguments = args.map((arg, index) => {
          if (typeof arg === 'object' && arg !== null) {
            return { [`arg${index}`]: Object.keys(arg) };
          }
          return { [`arg${index}`]: typeof arg };
        });
      }

      try {
        Logger.debug(`Function ${name} started`, context);
        
        const result = await fn(...args);
        
        const duration = Date.now() - startTime;
        Logger.debug(`Function ${name} completed`, {
          ...context,
          duration: `${duration}ms`,
          success: true,
          hasResult: result !== undefined
        });

        if (logResult && result !== undefined) {
          Logger.debug(`Function ${name} result`, {
            ...context,
            resultType: typeof result,
            resultKeys: typeof result === 'object' && result !== null 
              ? Object.keys(result) 
              : undefined
          });
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        Logger.error(`Function ${name} failed`, error, {
          ...context,
          duration: `${duration}ms`,
          success: false
        });

        // Transform error if transformer provided
        if (transformError && typeof transformError === 'function') {
          throw transformError(error);
        }

        throw error;
      }
    };
  }

  /**
   * Executes async function with retry logic
   * @static
   * @param {Function} fn - Async function to execute
   * @param {Object} [options={}] - Retry options
   * @returns {Promise<*>} Function result
   */
  static async withRetry(fn, options = {}) {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoff = 2,
      shouldRetry = (error) => !(error instanceof AppError && error.isOperational),
      onRetry = null
    } = options;

    let lastError;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts || !shouldRetry(error)) {
          throw error;
        }

        if (onRetry && typeof onRetry === 'function') {
          await onRetry(error, attempt, currentDelay);
        }

        Logger.warn(`Retry attempt ${attempt}/${maxAttempts} after ${currentDelay}ms`, {
          error: error.message,
          functionName: fn.name || 'anonymous'
        });

        await this.#delay(currentDelay);
        currentDelay *= backoff;
      }
    }

    throw lastError;
  }

  /**
   * Executes async function with timeout
   * @static
   * @param {Function} fn - Async function to execute
   * @param {number} timeout - Timeout in milliseconds
   * @param {string} [timeoutMessage] - Custom timeout message
   * @returns {Promise<*>} Function result
   */
  static async withTimeout(fn, timeout, timeoutMessage) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const message = timeoutMessage || `Operation timed out after ${timeout}ms`;
        reject(new AppError(message, 408, 'TIMEOUT_ERROR'));
      }, timeout);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Executes multiple async functions in parallel with error handling
   * @static
   * @param {Array<Function>} functions - Array of async functions
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<Array>} Results array
   */
  static async parallel(functions, options = {}) {
    const {
      stopOnError = false,
      concurrency = Infinity
    } = options;

    if (!Array.isArray(functions) || functions.length === 0) {
      return [];
    }

    if (stopOnError) {
      return Promise.all(functions.map(fn => fn()));
    }

    if (concurrency === Infinity) {
      const results = await Promise.allSettled(functions.map(fn => fn()));
      return this.#processSettledResults(results);
    }

    // Limited concurrency
    const results = [];
    const executing = [];

    for (const [index, fn] of functions.entries()) {
      const promise = fn().then(
        result => ({ status: 'fulfilled', value: result, index }),
        error => ({ status: 'rejected', reason: error, index })
      );

      results[index] = promise;

      if (functions.length >= concurrency) {
        executing.push(promise);

        if (executing.length >= concurrency) {
          await Promise.race(executing);
          executing.splice(executing.findIndex(p => p === promise), 1);
        }
      }
    }

    const settled = await Promise.all(results);
    return this.#processSettledResults(settled);
  }

  /**
   * Executes async functions in sequence
   * @static
   * @param {Array<Function>} functions - Array of async functions
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<Array>} Results array
   */
  static async sequence(functions, options = {}) {
    const {
      stopOnError = true,
      passResult = false
    } = options;

    const results = [];
    let previousResult;

    for (const [index, fn] of functions.entries()) {
      try {
        const args = passResult && index > 0 ? [previousResult] : [];
        const result = await fn(...args);
        results.push({ success: true, value: result });
        previousResult = result;
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
   * Creates circuit breaker for function
   * @static
   * @param {Function} fn - Function to protect
   * @param {Object} [options={}] - Circuit breaker options
   * @returns {Function} Protected function
   */
  static circuitBreaker(fn, options = {}) {
    const {
      threshold = 5,
      timeout = 60000,
      resetTimeout = 30000
    } = options;

    let failures = 0;
    let lastFailureTime = null;
    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN

    return async (...args) => {
      // Check if circuit should be reset
      if (state === 'OPEN' && Date.now() - lastFailureTime > resetTimeout) {
        state = 'HALF_OPEN';
        failures = 0;
      }

      // Reject if circuit is open
      if (state === 'OPEN') {
        throw new AppError(
          'Circuit breaker is OPEN',
          503,
          'CIRCUIT_BREAKER_OPEN',
          { 
            failures,
            lastFailureTime,
            willResetAt: new Date(lastFailureTime + resetTimeout).toISOString()
          }
        );
      }

      try {
        const result = await this.withTimeout(
          () => fn(...args),
          timeout,
          'Circuit breaker timeout'
        );

        // Success - reset failures
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
        }
        failures = 0;
        
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();

        if (failures >= threshold) {
          state = 'OPEN';
          Logger.warn('Circuit breaker opened', {
            function: fn.name || 'anonymous',
            failures,
            threshold
          });
        }

        throw error;
      }
    };
  }

  /**
   * Debounces async function
   * @static
   * @param {Function} fn - Async function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  static debounce(fn, delay) {
    let timeoutId;
    let pending;

    const debounced = (...args) => {
      clearTimeout(timeoutId);

      if (!pending) {
        pending = new Promise((resolve, reject) => {
          timeoutId = setTimeout(async () => {
            try {
              const result = await fn(...args);
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

    debounced.cancel = () => {
      clearTimeout(timeoutId);
      pending = null;
    };

    return debounced;
  }

  /**
   * Throttles async function
   * @static
   * @param {Function} fn - Async function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  static throttle(fn, limit) {
    let inThrottle;
    let lastResult;

    return async (...args) => {
      if (!inThrottle) {
        inThrottle = true;
        
        try {
          lastResult = await fn(...args);
        } finally {
          setTimeout(() => {
            inThrottle = false;
          }, limit);
        }
      }

      return lastResult;
    };
  }

  /**
   * Creates memoized version of async function
   * @static
   * @param {Function} fn - Async function to memoize
   * @param {Object} [options={}] - Memoization options
   * @returns {Function} Memoized function
   */
  static memoize(fn, options = {}) {
    const {
      maxSize = 100,
      ttl = 0, // 0 means no expiry
      keyGenerator = (...args) => JSON.stringify(args)
    } = options;

    const cache = new Map();

    return async (...args) => {
      const key = keyGenerator(...args);
      
      if (cache.has(key)) {
        const cached = cache.get(key);
        
        if (ttl === 0 || Date.now() - cached.timestamp < ttl) {
          Logger.debug('Memoized function cache hit', {
            function: fn.name || 'anonymous',
            key
          });
          return cached.value;
        }
        
        cache.delete(key);
      }

      const result = await fn(...args);
      
      // Implement LRU if cache is full
      if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }

      cache.set(key, {
        value: result,
        timestamp: Date.now()
      });

      return result;
    };
  }

  /**
   * Delay execution
   * @private
   * @static
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  static #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process settled results
   * @private
   * @static
   * @param {Array} results - Settled promises results
   * @returns {Array} Processed results
   */
  static #processSettledResults(results) {
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { success: true, value: result.value, index };
      }
      return { success: false, error: result.reason, index };
    });
  }
}

// Export convenience functions
const asyncHandler = AsyncHandler.wrap;
const withRetry = AsyncHandler.withRetry.bind(AsyncHandler);
const withTimeout = AsyncHandler.withTimeout.bind(AsyncHandler);
const parallel = AsyncHandler.parallel.bind(AsyncHandler);
const sequence = AsyncHandler.sequence.bind(AsyncHandler);
const circuitBreaker = AsyncHandler.circuitBreaker.bind(AsyncHandler);

module.exports = {
  AsyncHandler,
  asyncHandler,
  withRetry,
  withTimeout,
  parallel,
  sequence,
  circuitBreaker
};