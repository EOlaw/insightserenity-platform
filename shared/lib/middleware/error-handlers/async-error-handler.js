'use strict';

/**
 * @fileoverview Async error handler middleware for handling promise rejections and async route errors
 * @module shared/lib/middleware/error-handlers/async-error-handler
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/config
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const AuditService = require('../../security/audit/audit-service');
const CacheService = require('../../services/cache-service');
const config = require('../helmet-config');

/**
 * @class AsyncErrorHandler
 * @description Comprehensive async error handler with promise rejection tracking,
 * async middleware wrapping, and global error boundaries
 */
class AsyncErrorHandler {
  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #pendingPromises;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #rejectionMetrics;

  /**
   * @private
   * @type {Set<Function>}
   */
  #wrappedHandlers;

  /**
   * @private
   * @type {boolean}
   */
  #isInitialized;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enableGlobalHandlers: process.env.ASYNC_ERROR_ENABLE_GLOBAL !== 'false',
    enablePromiseTracking: process.env.ASYNC_ERROR_ENABLE_PROMISE_TRACKING === 'true',
    enableAudit: process.env.ASYNC_ERROR_ENABLE_AUDIT === 'true',
    enableStackTraceCapture: process.env.ASYNC_ERROR_ENABLE_STACK_TRACE !== 'false',
    maxPendingPromises: parseInt(process.env.ASYNC_ERROR_MAX_PENDING || '1000', 10),
    promiseTimeout: parseInt(process.env.ASYNC_ERROR_PROMISE_TIMEOUT || '30000', 10), // 30 seconds
    cleanupInterval: parseInt(process.env.ASYNC_ERROR_CLEANUP_INTERVAL || '60000', 10), // 1 minute
    exitOnUnhandledRejection: process.env.ASYNC_ERROR_EXIT_ON_UNHANDLED === 'true',
    gracefulShutdownTimeout: parseInt(process.env.ASYNC_ERROR_SHUTDOWN_TIMEOUT || '10000', 10), // 10 seconds
    errorPatterns: {
      timeout: /timeout|timed out|ETIMEDOUT/i,
      network: /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH/i,
      cancelled: /cancelled|aborted|ECANCELED/i,
      memory: /out of memory|heap|ENOMEM/i
    },
    asyncContextTimeout: parseInt(process.env.ASYNC_ERROR_CONTEXT_TIMEOUT || '5000', 10),
    enableAsyncLocalStorage: process.env.ASYNC_ERROR_ENABLE_ALS !== 'false',
    wrapperOptions: {
      captureContext: true,
      includeTimings: true,
      maxStackDepth: 10
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #REJECTION_REASONS = {
    UNHANDLED: 'unhandled',
    TIMEOUT: 'timeout',
    CANCELLED: 'cancelled',
    NETWORK: 'network',
    MEMORY: 'memory',
    UNKNOWN: 'unknown'
  };

  /**
   * Creates AsyncErrorHandler instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, auditService, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#cacheService = cacheService || new CacheService();
    this.#pendingPromises = new Map();
    this.#rejectionMetrics = new Map();
    this.#wrappedHandlers = new WeakSet();
    this.#isInitialized = false;

    // Initialize async context if available
    this.#initializeAsyncContext();

    logger.info('AsyncErrorHandler initialized', {
      enableGlobalHandlers: this.#config.enableGlobalHandlers,
      enablePromiseTracking: this.#config.enablePromiseTracking,
      maxPendingPromises: this.#config.maxPendingPromises
    });
  }

  /**
   * Initializes global error handlers
   * @returns {void}
   */
  initialize() {
    if (this.#isInitialized) {
      logger.warn('AsyncErrorHandler already initialized');
      return;
    }

    if (this.#config.enableGlobalHandlers) {
      this.#setupGlobalHandlers();
    }

    if (this.#config.enablePromiseTracking) {
      this.#startPromiseTracking();
    }

    this.#isInitialized = true;
    logger.info('AsyncErrorHandler fully initialized');
  }

  /**
   * Wraps async route handler to catch errors
   * @param {Function} handler - Async route handler
   * @param {Object} [options] - Wrapper options
   * @returns {Function} Wrapped handler
   */
  wrap = (handler, options = {}) => {
    // Check if already wrapped
    if (this.#wrappedHandlers.has(handler)) {
      return handler;
    }

    const wrapperConfig = { ...this.#config.wrapperOptions, ...options };
    const handlerName = handler.name || 'anonymous';

    const wrapped = async (req, res, next) => {
      const startTime = Date.now();
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const context = {
        handlerName,
        correlationId,
        path: req.path,
        method: req.method,
        startTime
      };

      try {
        // Track promise if enabled
        const promiseId = this.#trackPromise(context);

        // Execute handler
        const result = await handler(req, res, next);

        // Untrack promise
        this.#untrackPromise(promiseId);

        // Record timing if enabled
        if (wrapperConfig.includeTimings) {
          const duration = Date.now() - startTime;
          this.#recordHandlerTiming(handlerName, duration);
        }

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;

        // Enhance error with async context
        const enhancedError = this.#enhanceAsyncError(error, context, wrapperConfig);

        // Log async error
        await this.#logAsyncError(enhancedError, req);

        // Track rejection
        this.#trackRejection(enhancedError);

        // Audit if enabled
        if (this.#config.enableAudit) {
          await this.#auditAsyncError(enhancedError, req);
        }

        // Pass to error handler
        next(enhancedError);
      }
    };

    // Mark as wrapped
    this.#wrappedHandlers.add(wrapped);
    
    // Preserve function name and properties
    Object.defineProperty(wrapped, 'name', { value: `wrapped_${handlerName}` });
    wrapped._original = handler;
    wrapped._isWrapped = true;

    return wrapped;
  };

  /**
   * Wraps all methods of a controller/service
   * @param {Object} target - Target object
   * @param {Object} [options] - Wrapper options
   * @returns {Object} Target with wrapped methods
   */
  wrapAll = (target, options = {}) => {
    const wrapped = {};

    for (const key of Object.keys(target)) {
      const value = target[key];

      if (typeof value === 'function') {
        // Check if it's an async function or returns a promise
        if (value.constructor.name === 'AsyncFunction' || 
            this.#returnsPromise(value)) {
          wrapped[key] = this.wrap(value, {
            ...options,
            handlerName: `${target.constructor?.name || 'Object'}.${key}`
          });
        } else {
          wrapped[key] = value;
        }
      } else {
        wrapped[key] = value;
      }
    }

    return wrapped;
  };

  /**
   * Express error boundary middleware
   * @param {Object} [options] - Boundary options
   * @returns {Function} Error boundary middleware
   */
  errorBoundary = (options = {}) => {
    return async (err, req, res, next) => {
      // Skip if response already sent
      if (res.headersSent) {
        return next(err);
      }

      const correlationId = req.correlationId || err.correlationId || this.#generateCorrelationId();

      try {
        // Check if it's an async error
        if (this.#isAsyncError(err)) {
          const enhancedError = this.#enhanceAsyncError(err, {
            correlationId,
            path: req.path,
            method: req.method,
            boundary: true
          });

          await this.#handleAsyncError(enhancedError, req, res);
        } else {
          // Pass to next error handler
          next(err);
        }

      } catch (boundaryError) {
        logger.error('Error boundary failed', {
          originalError: err.message,
          boundaryError: boundaryError.message,
          correlationId
        });

        // Fallback response
        res.status(500).json({
          success: false,
          error: {
            message: 'An unexpected error occurred',
            code: ERROR_CODES.SYSTEM_ERROR,
            correlationId
          }
        });
      }
    };
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...AsyncErrorHandler.#DEFAULT_CONFIG };

    Object.keys(AsyncErrorHandler.#DEFAULT_CONFIG).forEach(key => {
      if (typeof AsyncErrorHandler.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(AsyncErrorHandler.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...AsyncErrorHandler.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Initializes async context storage
   */
  #initializeAsyncContext() {
    if (this.#config.enableAsyncLocalStorage) {
      try {
        const { AsyncLocalStorage } = require('async_hooks');
        this.asyncLocalStorage = new AsyncLocalStorage();
        logger.debug('AsyncLocalStorage initialized');
      } catch (error) {
        logger.warn('AsyncLocalStorage not available', { error: error.message });
      }
    }
  }

  /**
   * @private
   * Sets up global error handlers
   */
  #setupGlobalHandlers() {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack
      });

      this.#trackRejection({
        type: AsyncErrorHandler.#REJECTION_REASONS.UNHANDLED,
        reason,
        promise
      });

      if (this.#config.exitOnUnhandledRejection) {
        this.#gracefulShutdown('unhandledRejection');
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });

      // Always exit on uncaught exceptions
      this.#gracefulShutdown('uncaughtException');
    });

    // Handle warnings
    process.on('warning', (warning) => {
      logger.warn('Node.js Warning', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      });
    });

    // Handle multiple listeners warning
    process.on('multipleResolves', (type, promise, reason) => {
      logger.warn('Multiple Promise Resolution', {
        type,
        reason: reason?.message || reason
      });
    });

    logger.info('Global error handlers registered');
  }

  /**
   * @private
   * Starts promise tracking cleanup
   */
  #startPromiseTracking() {
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.#cleanupPendingPromises();
    }, this.#config.cleanupInterval);

    // Ensure cleanup on exit
    process.on('beforeExit', () => {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
    });

    logger.debug('Promise tracking started');
  }

  /**
   * @private
   * Tracks a promise
   */
  #trackPromise(context) {
    if (!this.#config.enablePromiseTracking) return null;

    const promiseId = this.#generatePromiseId();
    const promiseInfo = {
      id: promiseId,
      context,
      startTime: Date.now(),
      stack: this.#config.enableStackTraceCapture ? new Error().stack : null
    };

    this.#pendingPromises.set(promiseId, promiseInfo);

    // Check promise limit
    if (this.#pendingPromises.size > this.#config.maxPendingPromises) {
      logger.warn('Pending promise limit exceeded', {
        count: this.#pendingPromises.size,
        limit: this.#config.maxPendingPromises
      });
    }

    return promiseId;
  }

  /**
   * @private
   * Untracks a promise
   */
  #untrackPromise(promiseId) {
    if (!promiseId) return;
    this.#pendingPromises.delete(promiseId);
  }

  /**
   * @private
   * Cleans up pending promises
   */
  #cleanupPendingPromises() {
    const now = Date.now();
    const timeout = this.#config.promiseTimeout;
    const timedOut = [];

    for (const [id, info] of this.#pendingPromises.entries()) {
      if (now - info.startTime > timeout) {
        timedOut.push(info);
        this.#pendingPromises.delete(id);
      }
    }

    if (timedOut.length > 0) {
      logger.warn('Promises timed out', {
        count: timedOut.length,
        contexts: timedOut.map(p => p.context)
      });

      // Track timeout rejections
      timedOut.forEach(promise => {
        this.#trackRejection({
          type: AsyncErrorHandler.#REJECTION_REASONS.TIMEOUT,
          promise
        });
      });
    }
  }

  /**
   * @private
   * Checks if function returns a promise
   */
  #returnsPromise(fn) {
    try {
      // Create a test call with mock parameters
      const result = fn(
        {}, // req
        { json: () => {}, status: () => ({ json: () => {} }) }, // res
        () => {} // next
      );
      
      return result && typeof result.then === 'function';
    } catch {
      return false;
    }
  }

  /**
   * @private
   * Checks if error is async-related
   */
  #isAsyncError(error) {
    // Check error properties
    if (error._isAsyncError || error.isAsync) {
      return true;
    }

    // Check error patterns
    for (const [type, pattern] of Object.entries(this.#config.errorPatterns)) {
      if (pattern.test(error.message)) {
        return true;
      }
    }

    // Check if from promise
    if (error.stack && error.stack.includes('async')) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Enhances async error with context
   */
  #enhanceAsyncError(error, context, options = {}) {
    const enhanced = error instanceof AppError ? error : new AppError(
      error.message || 'Async operation failed',
      error.statusCode || 500,
      error.code || ERROR_CODES.ASYNC_ERROR,
      error.data
    );

    enhanced._isAsyncError = true;
    enhanced.asyncContext = {
      ...context,
      duration: context.startTime ? Date.now() - context.startTime : null,
      timestamp: new Date().toISOString()
    };

    // Detect error type
    enhanced.asyncErrorType = this.#detectErrorType(error);

    // Capture stack trace if enabled
    if (options.captureContext && this.#config.enableStackTraceCapture) {
      enhanced.asyncStack = this.#captureAsyncStack(error);
    }

    // Add async local storage context if available
    if (this.asyncLocalStorage) {
      const alsContext = this.asyncLocalStorage.getStore();
      if (alsContext) {
        enhanced.asyncContext.als = alsContext;
      }
    }

    return enhanced;
  }

  /**
   * @private
   * Detects async error type
   */
  #detectErrorType(error) {
    const message = error.message || '';

    for (const [type, pattern] of Object.entries(this.#config.errorPatterns)) {
      if (pattern.test(message)) {
        return type;
      }
    }

    if (error.code) {
      switch (error.code) {
        case 'ETIMEDOUT':
        case 'ESOCKETTIMEDOUT':
          return 'timeout';
        case 'ECONNREFUSED':
        case 'ENOTFOUND':
          return 'network';
        case 'ECANCELED':
          return 'cancelled';
        case 'ENOMEM':
          return 'memory';
        default:
          return 'unknown';
      }
    }

    return 'unknown';
  }

  /**
   * @private
   * Captures async stack trace
   */
  #captureAsyncStack(error) {
    const stack = error.stack || '';
    const lines = stack.split('\n');
    const asyncFrames = [];
    let depth = 0;

    for (const line of lines) {
      if (depth >= this.#config.wrapperOptions.maxStackDepth) break;

      if (line.includes('async') || line.includes('Promise') || line.includes('await')) {
        asyncFrames.push(line.trim());
        depth++;
      }
    }

    return asyncFrames;
  }

  /**
   * @private
   * Logs async error
   */
  async #logAsyncError(error, req) {
    const logData = {
      correlationId: error.correlationId || error.asyncContext?.correlationId,
      asyncErrorType: error.asyncErrorType,
      handlerName: error.asyncContext?.handlerName,
      duration: error.asyncContext?.duration,
      path: req.path,
      method: req.method,
      userId: req.user?.id || req.user?._id,
      organizationId: req.user?.organizationId
    };

    if (error.asyncStack) {
      logData.asyncStack = error.asyncStack;
    }

    logger.error('Async error occurred', logData);
  }

  /**
   * @private
   * Tracks rejection metrics
   */
  #trackRejection(rejection) {
    const type = rejection.type || this.#detectErrorType(rejection);
    const key = `rejection:${type}`;
    
    const current = this.#rejectionMetrics.get(key) || 0;
    this.#rejectionMetrics.set(key, current + 1);

    // Log high rejection rates
    if (current > 0 && current % 10 === 0) {
      logger.warn('High rejection rate detected', {
        type,
        count: current
      });
    }
  }

  /**
   * @private
   * Records handler timing
   */
  #recordHandlerTiming(handlerName, duration) {
    const key = `timing:${handlerName}`;
    
    this.#cacheService.get(key).then(existing => {
      const timings = existing || { count: 0, total: 0, min: Infinity, max: 0 };
      
      timings.count++;
      timings.total += duration;
      timings.min = Math.min(timings.min, duration);
      timings.max = Math.max(timings.max, duration);
      timings.avg = timings.total / timings.count;

      return this.#cacheService.set(key, timings, 3600); // 1 hour
    }).catch(error => {
      logger.error('Failed to record handler timing', { error: error.message });
    });
  }

  /**
   * @private
   * Audits async error
   */
  async #auditAsyncError(error, req) {
    try {
      await this.#auditService.logEvent({
        event: 'async.error',
        severity: 'error',
        userId: req.user?.id || req.user?._id,
        organizationId: req.user?.organizationId,
        correlationId: error.correlationId || error.asyncContext?.correlationId,
        metadata: {
          asyncErrorType: error.asyncErrorType,
          handlerName: error.asyncContext?.handlerName,
          duration: error.asyncContext?.duration,
          path: req.path,
          method: req.method
        }
      });
    } catch (auditError) {
      logger.error('Failed to audit async error', {
        error: auditError.message
      });
    }
  }

  /**
   * @private
   * Handles async error response
   */
  async #handleAsyncError(error, req, res) {
    const response = {
      success: false,
      error: {
        message: this.#getAsyncErrorMessage(error),
        code: error.code || ERROR_CODES.ASYNC_ERROR,
        correlationId: error.correlationId || error.asyncContext?.correlationId
      },
      timestamp: new Date().toISOString()
    };

    // Add retry info for transient errors
    if (['timeout', 'network'].includes(error.asyncErrorType)) {
      response.error.retryable = true;
      response.error.suggestion = 'This appears to be a temporary issue. Please try again.';
    }

    res.status(error.statusCode || 500).json(response);
  }

  /**
   * @private
   * Gets async error message
   */
  #getAsyncErrorMessage(error) {
    const typeMessages = {
      timeout: 'The operation timed out. Please try again.',
      network: 'A network error occurred. Please check your connection.',
      cancelled: 'The operation was cancelled.',
      memory: 'The system is experiencing high load. Please try again later.',
      unknown: 'An unexpected error occurred in an async operation.'
    };

    return typeMessages[error.asyncErrorType] || error.message || typeMessages.unknown;
  }

  /**
   * @private
   * Graceful shutdown handler
   */
  #gracefulShutdown(reason) {
    logger.error(`Initiating graceful shutdown due to ${reason}`);

    const shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, this.#config.gracefulShutdownTimeout);

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Log pending promises
    if (this.#pendingPromises.size > 0) {
      logger.warn('Pending promises at shutdown', {
        count: this.#pendingPromises.size,
        contexts: Array.from(this.#pendingPromises.values()).map(p => p.context)
      });
    }

    // Clear timeout if process exits cleanly
    shutdownTimeout.unref();

    process.exit(1);
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `async_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generates promise ID
   */
  #generatePromiseId() {
    return `promise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets async error metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    const metrics = {
      pendingPromises: this.#pendingPromises.size,
      rejections: {},
      totalRejections: 0
    };

    for (const [key, count] of this.#rejectionMetrics.entries()) {
      const type = key.split(':')[1];
      metrics.rejections[type] = count;
      metrics.totalRejections += count;
    }

    return metrics;
  }

  /**
   * Resets metrics
   */
  resetMetrics() {
    this.#rejectionMetrics.clear();
    logger.info('Async error metrics reset');
  }

  /**
   * Gets handler timings
   * @returns {Promise<Object>} Handler timings
   */
  async getHandlerTimings() {
    const timings = {};
    
    // This would need to scan cache for timing keys
    // For now, return empty object
    return timings;
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates AsyncErrorHandler instance
 * @param {Object} [options] - Configuration options
 * @returns {AsyncErrorHandler} AsyncErrorHandler instance
 */
const getAsyncErrorHandler = (options) => {
  if (!instance) {
    instance = new AsyncErrorHandler(options);
  }
  return instance;
};

module.exports = {
  AsyncErrorHandler,
  getAsyncErrorHandler,
  // Export convenience methods
  wrap: (handler, options) => getAsyncErrorHandler().wrap(handler, options),
  wrapAll: (target, options) => getAsyncErrorHandler().wrapAll(target, options),
  errorBoundary: (options) => getAsyncErrorHandler().errorBoundary(options),
  initialize: () => getAsyncErrorHandler().initialize()
};