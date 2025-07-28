'use strict';

/**
 * @fileoverview Main error handler middleware for centralized error processing
 * @module shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/config
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const { STATUS_CODES } = require('../../utils/constants/status-codes');
const AuditService = require('../../security/audit/audit-service');
const NotificationService = require('../../services/notification-service');
const config = require('../../config');

/**
 * @class ErrorHandler
 * @description Enterprise-grade error handler with comprehensive error processing,
 * logging, auditing, and notification capabilities
 */
class ErrorHandler {
  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {NotificationService}
   */
  #notificationService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #errorMetrics;

  /**
   * @private
   * @type {Set<string>}
   */
  #criticalErrors;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    stackTraceLimit: parseInt(process.env.ERROR_STACK_TRACE_LIMIT || '10', 10),
    enableStackTrace: process.env.ERROR_ENABLE_STACK_TRACE !== 'false',
    enableAudit: process.env.ERROR_ENABLE_AUDIT !== 'false',
    enableNotifications: process.env.ERROR_ENABLE_NOTIFICATIONS === 'true',
    notificationThreshold: parseInt(process.env.ERROR_NOTIFICATION_THRESHOLD || '10', 10),
    notificationWindow: parseInt(process.env.ERROR_NOTIFICATION_WINDOW || '3600000', 10), // 1 hour
    errorCategories: {
      authentication: [401, 403],
      validation: [400, 422],
      notFound: [404],
      conflict: [409],
      rateLimit: [429],
      server: [500, 502, 503, 504],
      database: ['MongoError', 'ValidationError', 'CastError']
    },
    sensitiveFields: [
      'password',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'cookie',
      'creditCard',
      'ssn',
      'twoFactorSecret'
    ],
    criticalErrorCodes: [
      ERROR_CODES.DATABASE_ERROR,
      ERROR_CODES.SYSTEM_ERROR,
      ERROR_CODES.SECURITY_ERROR,
      ERROR_CODES.DATA_CORRUPTION
    ],
    responseDefaults: {
      success: false,
      timestamp: true,
      correlationId: true,
      path: true,
      method: true
    },
    clientErrorMessages: {
      400: 'The request could not be understood by the server',
      401: 'Authentication is required to access this resource',
      403: 'You do not have permission to access this resource',
      404: 'The requested resource could not be found',
      409: 'The request conflicts with the current state',
      422: 'The request was well-formed but contains invalid data',
      429: 'Too many requests, please try again later',
      500: 'An internal server error occurred',
      502: 'The server received an invalid response from an upstream server',
      503: 'The service is temporarily unavailable',
      504: 'The server did not receive a timely response from an upstream server'
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #ERROR_TYPES = {
    OPERATIONAL: 'operational',
    PROGRAMMING: 'programming',
    SYSTEM: 'system',
    EXTERNAL: 'external'
  };

  /**
   * Creates ErrorHandler instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {NotificationService} [notificationService] - Notification service instance
   */
  constructor(options = {}, auditService, notificationService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#notificationService = notificationService || new NotificationService();
    this.#errorMetrics = new Map();
    this.#criticalErrors = new Set();

    // Set stack trace limit
    Error.stackTraceLimit = this.#config.stackTraceLimit;

    logger.info('ErrorHandler initialized', {
      isDevelopment: this.#config.isDevelopment,
      enableStackTrace: this.#config.enableStackTrace,
      enableAudit: this.#config.enableAudit,
      enableNotifications: this.#config.enableNotifications
    });
  }

  /**
   * Express error handler middleware
   * @param {Error} err - Error object
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   * @returns {void}
   */
  handleError = async (err, req, res, next) => {
    // Skip if response already sent
    if (res.headersSent) {
      return next(err);
    }

    const startTime = Date.now();
    const correlationId = req.correlationId || this.#generateCorrelationId();
    
    try {
      // Normalize error
      const error = this.#normalizeError(err);
      
      // Enhance error with context
      const enhancedError = this.#enhanceError(error, req, correlationId);

      // Categorize error
      const errorCategory = this.#categorizeError(enhancedError);

      // Log error
      await this.#logError(enhancedError, errorCategory, req);

      // Track metrics
      this.#trackErrorMetrics(enhancedError, errorCategory);

      // Check critical errors
      if (this.#isCriticalError(enhancedError)) {
        await this.#handleCriticalError(enhancedError, req);
      }

      // Audit error if enabled
      if (this.#config.enableAudit && this.#shouldAuditError(enhancedError)) {
        await this.#auditError(enhancedError, req);
      }

      // Send notification if threshold exceeded
      await this.#checkNotificationThreshold(errorCategory);

      // Build error response
      const errorResponse = this.#buildErrorResponse(enhancedError, req);

      // Set security headers
      this.#setSecurityHeaders(res);

      // Send response
      res.status(enhancedError.statusCode || 500).json(errorResponse);

      // Log response time
      const duration = Date.now() - startTime;
      logger.debug('Error response sent', {
        correlationId,
        statusCode: enhancedError.statusCode,
        duration
      });

    } catch (handlerError) {
      // Fallback error handling
      logger.error('Error handler failed', {
        originalError: err.message,
        handlerError: handlerError.message,
        correlationId
      });

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

  /**
   * Wraps async route handlers to catch errors
   * @param {Function} fn - Async function to wrap
   * @returns {Function} Wrapped function
   */
  catchAsync = (fn) => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...ErrorHandler.#DEFAULT_CONFIG };

    Object.keys(ErrorHandler.#DEFAULT_CONFIG).forEach(key => {
      if (typeof ErrorHandler.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(ErrorHandler.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...ErrorHandler.#DEFAULT_CONFIG[key],
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
   * Normalizes various error types to AppError
   */
  #normalizeError(err) {
    // Already an AppError
    if (err instanceof AppError) {
      return err;
    }

    // MongoDB errors
    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
      return this.#handleMongoError(err);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
      return this.#handleValidationError(err);
    }

    // Mongoose cast error
    if (err.name === 'CastError') {
      return this.#handleCastError(err);
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
      return new AppError(
        'Invalid token',
        401,
        ERROR_CODES.INVALID_TOKEN,
        { originalError: err.message }
      );
    }

    if (err.name === 'TokenExpiredError') {
      return new AppError(
        'Token expired',
        401,
        ERROR_CODES.TOKEN_EXPIRED,
        { originalError: err.message }
      );
    }

    // Default to generic error
    return new AppError(
      err.message || 'An unexpected error occurred',
      err.statusCode || err.status || 500,
      err.code || ERROR_CODES.SYSTEM_ERROR,
      {
        originalError: err.message,
        errorName: err.name,
        errorStack: err.stack
      }
    );
  }

  /**
   * @private
   * Handles MongoDB specific errors
   */
  #handleMongoError(err) {
    // Duplicate key error
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0];
      return new AppError(
        `${field} already exists`,
        409,
        ERROR_CODES.DUPLICATE_ENTRY,
        { field, value: err.keyValue[field] }
      );
    }

    return new AppError(
      'Database operation failed',
      500,
      ERROR_CODES.DATABASE_ERROR,
      { originalError: err.message }
    );
  }

  /**
   * @private
   * Handles Mongoose validation errors
   */
  #handleValidationError(err) {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));

    return new AppError(
      'Validation failed',
      400,
      ERROR_CODES.VALIDATION_ERROR,
      { errors }
    );
  }

  /**
   * @private
   * Handles Mongoose cast errors
   */
  #handleCastError(err) {
    return new AppError(
      `Invalid ${err.path}: ${err.value}`,
      400,
      ERROR_CODES.INVALID_INPUT,
      { field: err.path, value: err.value }
    );
  }

  /**
   * @private
   * Enhances error with request context
   */
  #enhanceError(error, req, correlationId) {
    error.correlationId = correlationId;
    error.timestamp = new Date().toISOString();
    error.path = req.path;
    error.method = req.method;
    error.ip = req.ip || req.connection.remoteAddress;
    error.userAgent = req.get('user-agent');
    
    if (req.user) {
      error.userId = req.user._id || req.user.id;
      error.organizationId = req.user.organizationId;
    }

    if (req.tenant) {
      error.tenantId = req.tenant._id || req.tenant.id;
    }

    return error;
  }

  /**
   * @private
   * Categorizes error type
   */
  #categorizeError(error) {
    const statusCode = error.statusCode || 500;
    
    // Check by status code
    for (const [category, codes] of Object.entries(this.#config.errorCategories)) {
      if (Array.isArray(codes) && codes.includes(statusCode)) {
        return category;
      }
    }

    // Check by error name
    for (const [category, names] of Object.entries(this.#config.errorCategories)) {
      if (Array.isArray(names) && names.includes(error.name)) {
        return category;
      }
    }

    // Default categorization
    if (statusCode >= 400 && statusCode < 500) {
      return 'client';
    } else if (statusCode >= 500) {
      return 'server';
    }

    return 'unknown';
  }

  /**
   * @private
   * Logs error with appropriate level
   */
  async #logError(error, category, req) {
    const logData = {
      correlationId: error.correlationId,
      errorCode: error.code,
      errorMessage: error.message,
      statusCode: error.statusCode,
      category,
      path: error.path,
      method: error.method,
      ip: error.ip,
      userId: error.userId,
      organizationId: error.organizationId,
      tenantId: error.tenantId
    };

    // Add stack trace in development
    if (this.#config.isDevelopment && error.stack) {
      logData.stack = error.stack;
    }

    // Remove sensitive data
    const sanitizedData = this.#sanitizeLogData(logData, req);

    // Log based on severity
    if (error.statusCode >= 500 || this.#isCriticalError(error)) {
      logger.error('Server error occurred', sanitizedData);
    } else if (error.statusCode >= 400) {
      logger.warn('Client error occurred', sanitizedData);
    } else {
      logger.info('Error occurred', sanitizedData);
    }
  }

  /**
   * @private
   * Sanitizes sensitive data from logs
   */
  #sanitizeLogData(data, req) {
    const sanitized = { ...data };

    // Sanitize request body
    if (req.body) {
      sanitized.requestBody = this.#sanitizeObject(req.body);
    }

    // Sanitize headers
    if (req.headers) {
      sanitized.headers = this.#sanitizeObject(req.headers);
    }

    return sanitized;
  }

  /**
   * @private
   * Recursively sanitizes sensitive fields from object
   */
  #sanitizeObject(obj, depth = 0) {
    if (depth > 5) return '[Max depth exceeded]';
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (this.#config.sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.#sanitizeObject(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * @private
   * Tracks error metrics
   */
  #trackErrorMetrics(error, category) {
    const key = `${category}:${error.statusCode}:${error.code}`;
    const current = this.#errorMetrics.get(key) || { count: 0, lastOccurred: null };
    
    current.count++;
    current.lastOccurred = new Date();
    
    this.#errorMetrics.set(key, current);

    // Clean old metrics periodically
    if (this.#errorMetrics.size > 1000) {
      this.#cleanOldMetrics();
    }
  }

  /**
   * @private
   * Cleans old error metrics
   */
  #cleanOldMetrics() {
    const cutoff = Date.now() - 86400000; // 24 hours
    
    for (const [key, value] of this.#errorMetrics.entries()) {
      if (value.lastOccurred && value.lastOccurred.getTime() < cutoff) {
        this.#errorMetrics.delete(key);
      }
    }
  }

  /**
   * @private
   * Checks if error is critical
   */
  #isCriticalError(error) {
    return this.#config.criticalErrorCodes.includes(error.code) ||
           error.statusCode >= 500;
  }

  /**
   * @private
   * Handles critical errors with special processing
   */
  async #handleCriticalError(error, req) {
    const criticalKey = `${error.code}:${error.message}`;
    this.#criticalErrors.add(criticalKey);

    logger.error('CRITICAL ERROR DETECTED', {
      correlationId: error.correlationId,
      errorCode: error.code,
      errorMessage: error.message,
      userId: error.userId,
      path: error.path,
      criticalErrorCount: this.#criticalErrors.size
    });

    // Send immediate notification for critical errors
    if (this.#config.enableNotifications) {
      await this.#sendCriticalErrorNotification(error, req);
    }
  }

  /**
   * @private
   * Determines if error should be audited
   */
  #shouldAuditError(error) {
    // Always audit authentication and authorization errors
    if ([401, 403].includes(error.statusCode)) {
      return true;
    }

    // Audit server errors
    if (error.statusCode >= 500) {
      return true;
    }

    // Audit specific error codes
    const auditableCodes = [
      ERROR_CODES.SECURITY_ERROR,
      ERROR_CODES.DATA_CORRUPTION,
      ERROR_CODES.UNAUTHORIZED_ACCESS,
      ERROR_CODES.FORBIDDEN
    ];

    return auditableCodes.includes(error.code);
  }

  /**
   * @private
   * Audits error event
   */
  async #auditError(error, req) {
    try {
      await this.#auditService.logEvent({
        event: 'error.occurred',
        severity: error.statusCode >= 500 ? 'critical' : 'warning',
        userId: error.userId,
        organizationId: error.organizationId,
        ipAddress: error.ip,
        userAgent: error.userAgent,
        correlationId: error.correlationId,
        metadata: {
          errorCode: error.code,
          errorMessage: error.message,
          statusCode: error.statusCode,
          path: error.path,
          method: error.method
        }
      });
    } catch (auditError) {
      logger.error('Failed to audit error', {
        originalError: error.message,
        auditError: auditError.message
      });
    }
  }

  /**
   * @private
   * Checks and sends notifications if threshold exceeded
   */
  async #checkNotificationThreshold(category) {
    if (!this.#config.enableNotifications) return;

    const recentErrors = Array.from(this.#errorMetrics.entries())
      .filter(([key]) => key.startsWith(category))
      .reduce((sum, [, value]) => sum + value.count, 0);

    if (recentErrors >= this.#config.notificationThreshold) {
      await this.#sendThresholdNotification(category, recentErrors);
    }
  }

  /**
   * @private
   * Sends critical error notification
   */
  async #sendCriticalErrorNotification(error, req) {
    try {
      await this.#notificationService.sendNotification({
        type: 'critical_error',
        priority: 'high',
        recipients: ['ops-team@insightserenity.com'],
        subject: `Critical Error: ${error.code}`,
        data: {
          errorCode: error.code,
          errorMessage: error.message,
          path: error.path,
          userId: error.userId,
          correlationId: error.correlationId,
          timestamp: error.timestamp
        }
      });
    } catch (notificationError) {
      logger.error('Failed to send critical error notification', {
        originalError: error.message,
        notificationError: notificationError.message
      });
    }
  }

  /**
   * @private
   * Sends threshold exceeded notification
   */
  async #sendThresholdNotification(category, count) {
    try {
      await this.#notificationService.sendNotification({
        type: 'error_threshold',
        priority: 'medium',
        recipients: ['dev-team@insightserenity.com'],
        subject: `Error Threshold Exceeded: ${category}`,
        data: {
          category,
          errorCount: count,
          threshold: this.#config.notificationThreshold,
          window: this.#config.notificationWindow
        }
      });
    } catch (notificationError) {
      logger.error('Failed to send threshold notification', {
        category,
        notificationError: notificationError.message
      });
    }
  }

  /**
   * @private
   * Builds error response object
   */
  #buildErrorResponse(error, req) {
    const response = {
      success: false,
      error: {
        message: this.#getClientMessage(error),
        code: error.code || ERROR_CODES.UNKNOWN_ERROR
      }
    };

    // Add default fields
    if (this.#config.responseDefaults.timestamp) {
      response.timestamp = error.timestamp;
    }

    if (this.#config.responseDefaults.correlationId) {
      response.correlationId = error.correlationId;
    }

    if (this.#config.responseDefaults.path) {
      response.path = error.path;
    }

    if (this.#config.responseDefaults.method) {
      response.method = error.method;
    }

    // Add validation errors
    if (error.data && error.data.errors) {
      response.error.errors = error.data.errors;
    }

    // Add stack trace in development
    if (this.#config.isDevelopment && this.#config.enableStackTrace && error.stack) {
      response.error.stack = error.stack.split('\n');
    }

    // Add additional data in development
    if (this.#config.isDevelopment && error.data) {
      response.error.data = this.#sanitizeObject(error.data);
    }

    return response;
  }

  /**
   * @private
   * Gets client-friendly error message
   */
  #getClientMessage(error) {
    // Use custom message if available and safe
    if (error.isOperational && error.message) {
      return error.message;
    }

    // Use default message for status code
    const defaultMessage = this.#config.clientErrorMessages[error.statusCode];
    if (defaultMessage) {
      return defaultMessage;
    }

    // Generic message for production
    if (this.#config.isProduction) {
      return error.statusCode >= 500 
        ? 'An internal server error occurred'
        : 'The request could not be processed';
    }

    // Return original message in development
    return error.message;
  }

  /**
   * @private
   * Sets security headers on error response
   */
  #setSecurityHeaders(res) {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets error metrics
   * @returns {Object} Error metrics
   */
  getMetrics() {
    const metrics = {
      totalErrors: 0,
      criticalErrors: this.#criticalErrors.size,
      byCategory: {},
      byStatusCode: {},
      byErrorCode: {}
    };

    for (const [key, value] of this.#errorMetrics.entries()) {
      const [category, statusCode, errorCode] = key.split(':');
      
      metrics.totalErrors += value.count;
      
      metrics.byCategory[category] = (metrics.byCategory[category] || 0) + value.count;
      metrics.byStatusCode[statusCode] = (metrics.byStatusCode[statusCode] || 0) + value.count;
      metrics.byErrorCode[errorCode] = (metrics.byErrorCode[errorCode] || 0) + value.count;
    }

    return metrics;
  }

  /**
   * Resets error metrics
   */
  resetMetrics() {
    this.#errorMetrics.clear();
    this.#criticalErrors.clear();
    logger.info('Error metrics reset');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates ErrorHandler instance
 * @param {Object} [options] - Configuration options
 * @returns {ErrorHandler} ErrorHandler instance
 */
const getErrorHandler = (options) => {
  if (!instance) {
    instance = new ErrorHandler(options);
  }
  return instance;
};

module.exports = {
  ErrorHandler,
  getErrorHandler,
  // Export convenience middleware
  handleError: (err, req, res, next) => getErrorHandler().handleError(err, req, res, next),
  catchAsync: (fn) => getErrorHandler().catchAsync(fn)
};