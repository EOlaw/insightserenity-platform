'use strict';

/**
 * @fileoverview Database error handler middleware for MongoDB and database-specific errors
 * @module shared/lib/middleware/error-handlers/database-error-handler
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/config
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const AuditService = require('../../security/audit/audit-service');
const NotificationService = require('../../services/notification-service');
const ConnectionManager = require('../../database/connection-manager');
const config = require('../helmet-config');

/**
 * @class DatabaseErrorHandler
 * @description Specialized handler for database errors with connection recovery,
 * transaction rollback, and database-specific error translation
 */
class DatabaseErrorHandler {
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
   * @type {ConnectionManager}
   */
  #connectionManager;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #errorPatterns;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #connectionErrors;

  /**
   * @private
   * @type {Set<string>}
   */
  #failingDatabases;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enableAudit: process.env.DB_ERROR_ENABLE_AUDIT !== 'false',
    enableNotifications: process.env.DB_ERROR_ENABLE_NOTIFICATIONS === 'true',
    enableAutoRecovery: process.env.DB_ERROR_ENABLE_AUTO_RECOVERY !== 'false',
    enableTransactionRollback: process.env.DB_ERROR_ENABLE_TRANSACTION_ROLLBACK !== 'false',
    maxRetries: parseInt(process.env.DB_ERROR_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.DB_ERROR_RETRY_DELAY || '1000', 10), // 1 second
    connectionErrorThreshold: parseInt(process.env.DB_ERROR_CONNECTION_THRESHOLD || '5', 10),
    notificationThreshold: parseInt(process.env.DB_ERROR_NOTIFICATION_THRESHOLD || '10', 10),
    errorWindow: parseInt(process.env.DB_ERROR_WINDOW || '300000', 10), // 5 minutes
    mongoErrorCodes: {
      11000: {
        message: 'Duplicate key error',
        code: ERROR_CODES.DUPLICATE_ENTRY,
        statusCode: 409
      },
      11001: {
        message: 'Duplicate key error on update',
        code: ERROR_CODES.DUPLICATE_ENTRY,
        statusCode: 409
      },
      50: {
        message: 'Exceeded time limit',
        code: ERROR_CODES.TIMEOUT,
        statusCode: 504
      },
      13: {
        message: 'Unauthorized database operation',
        code: ERROR_CODES.UNAUTHORIZED,
        statusCode: 401
      },
      18: {
        message: 'Authentication failed',
        code: ERROR_CODES.AUTHENTICATION_ERROR,
        statusCode: 401
      },
      121: {
        message: 'Document validation failed',
        code: ERROR_CODES.VALIDATION_ERROR,
        statusCode: 400
      },
      16755: {
        message: 'Transaction aborted',
        code: ERROR_CODES.TRANSACTION_ERROR,
        statusCode: 409
      }
    },
    connectionErrors: [
      'MongoNetworkError',
      'MongoNetworkTimeoutError',
      'MongoServerSelectionError',
      'MongoTimeoutError',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH'
    ],
    criticalErrors: [
      'MongoServerError',
      'MongoSystemError',
      'MongoDriverError'
    ],
    transientErrors: [
      'MongoNetworkError',
      'MongoNotPrimaryError',
      'MongoNodeIsRecoveringError'
    ],
    errorMessages: {
      connection: 'Database connection error. Please try again later.',
      timeout: 'The database operation timed out. Please try again.',
      validation: 'The provided data does not meet database requirements.',
      duplicate: 'A record with this information already exists.',
      transaction: 'The database transaction could not be completed.',
      authorization: 'You do not have permission to perform this database operation.',
      general: 'A database error occurred. Please try again later.'
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #ERROR_CATEGORIES = {
    CONNECTION: 'connection',
    VALIDATION: 'validation',
    CONSTRAINT: 'constraint',
    TRANSACTION: 'transaction',
    TIMEOUT: 'timeout',
    AUTHORIZATION: 'authorization',
    SYSTEM: 'system'
  };

  /**
   * Creates DatabaseErrorHandler instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {NotificationService} [notificationService] - Notification service instance
   * @param {ConnectionManager} [connectionManager] - Connection manager instance
   */
  constructor(options = {}, auditService, notificationService, connectionManager) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#notificationService = notificationService || new NotificationService();
    this.#connectionManager = connectionManager || new ConnectionManager();
    this.#errorPatterns = new Map();
    this.#connectionErrors = new Map();
    this.#failingDatabases = new Set();

    // Initialize error patterns
    this.#initializeErrorPatterns();

    // Start error monitoring
    this.#startErrorMonitoring();

    logger.info('DatabaseErrorHandler initialized', {
      enableAudit: this.#config.enableAudit,
      enableAutoRecovery: this.#config.enableAutoRecovery,
      maxRetries: this.#config.maxRetries
    });
  }

  /**
   * Handles database-specific errors
   * @param {Error} error - Database error
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  handle = async (error, req, res, next) => {
    // Only handle database errors
    if (!this.#isDatabaseError(error)) {
      return next(error);
    }

    const correlationId = req.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      // Categorize error
      const category = this.#categorizeError(error);

      // Enhance error with context
      const enhancedError = this.#enhanceError(error, category, req, correlationId);

      // Log database error
      await this.#logDatabaseError(enhancedError, req);

      // Track error metrics
      this.#trackErrorMetrics(enhancedError);

      // Handle connection errors specially
      if (category === DatabaseErrorHandler.#ERROR_CATEGORIES.CONNECTION) {
        await this.#handleConnectionError(enhancedError, req);
      }

      // Handle transaction errors
      if (category === DatabaseErrorHandler.#ERROR_CATEGORIES.TRANSACTION) {
        await this.#handleTransactionError(enhancedError, req);
      }

      // Audit if enabled
      if (this.#config.enableAudit) {
        await this.#auditDatabaseError(enhancedError, req);
      }

      // Check notification threshold
      await this.#checkNotificationThreshold(enhancedError);

      // Build error response
      const errorResponse = this.#buildErrorResponse(enhancedError);

      // Send response
      res.status(enhancedError.statusCode).json(errorResponse);

      const duration = Date.now() - startTime;
      logger.debug('Database error response sent', {
        correlationId,
        category,
        duration
      });

    } catch (handlerError) {
      logger.error('Database error handler failed', {
        originalError: error.message,
        handlerError: handlerError.message,
        correlationId
      });

      // Fallback response
      res.status(500).json({
        success: false,
        error: {
          message: 'A database error occurred',
          code: ERROR_CODES.DATABASE_ERROR,
          correlationId
        }
      });
    }
  };

  /**
   * Wraps database operations with error handling and retry logic
   * @param {Function} operation - Database operation to execute
   * @param {Object} [options] - Operation options
   * @returns {Promise<*>} Operation result
   */
  wrapDatabaseOperation = async (operation, options = {}) => {
    const {
      maxRetries = this.#config.maxRetries,
      retryDelay = this.#config.retryDelay,
      transaction = null,
      context = {}
    } = options;

    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const result = await operation(transaction);
        
        // Reset error count on success
        if (context.database) {
          this.#resetDatabaseErrors(context.database);
        }

        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // Check if error is retryable
        if (!this.#isRetryableError(error) || attempt > maxRetries) {
          throw error;
        }

        logger.warn('Retrying database operation', {
          attempt,
          maxRetries,
          error: error.message,
          delay: retryDelay
        });

        // Wait before retry
        await this.#delay(retryDelay * attempt);
      }
    }

    throw lastError;
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...DatabaseErrorHandler.#DEFAULT_CONFIG };

    Object.keys(DatabaseErrorHandler.#DEFAULT_CONFIG).forEach(key => {
      if (typeof DatabaseErrorHandler.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(DatabaseErrorHandler.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...DatabaseErrorHandler.#DEFAULT_CONFIG[key],
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
   * Initializes error pattern recognition
   */
  #initializeErrorPatterns() {
    // MongoDB error patterns
    this.#errorPatterns.set(/duplicate key error/i, {
      category: DatabaseErrorHandler.#ERROR_CATEGORIES.CONSTRAINT,
      code: ERROR_CODES.DUPLICATE_ENTRY,
      statusCode: 409
    });

    this.#errorPatterns.set(/validation failed/i, {
      category: DatabaseErrorHandler.#ERROR_CATEGORIES.VALIDATION,
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400
    });

    this.#errorPatterns.set(/exceeded time limit|timeout/i, {
      category: DatabaseErrorHandler.#ERROR_CATEGORIES.TIMEOUT,
      code: ERROR_CODES.TIMEOUT,
      statusCode: 504
    });

    this.#errorPatterns.set(/unauthorized|authentication/i, {
      category: DatabaseErrorHandler.#ERROR_CATEGORIES.AUTHORIZATION,
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401
    });

    this.#errorPatterns.set(/transaction|WriteConflict/i, {
      category: DatabaseErrorHandler.#ERROR_CATEGORIES.TRANSACTION,
      code: ERROR_CODES.TRANSACTION_ERROR,
      statusCode: 409
    });

    this.#errorPatterns.set(/connection|network|ECONNREFUSED/i, {
      category: DatabaseErrorHandler.#ERROR_CATEGORIES.CONNECTION,
      code: ERROR_CODES.CONNECTION_ERROR,
      statusCode: 503
    });
  }

  /**
   * @private
   * Starts error monitoring
   */
  #startErrorMonitoring() {
    // Clean up old connection errors periodically
    setInterval(() => {
      this.#cleanOldConnectionErrors();
    }, this.#config.errorWindow);
  }

  /**
   * @private
   * Checks if error is a database error
   */
  #isDatabaseError(error) {
    // Check error name
    if (error.name && (
      error.name.startsWith('Mongo') ||
      error.name === 'ValidationError' ||
      error.name === 'CastError' ||
      error.name === 'StrictModeError'
    )) {
      return true;
    }

    // Check error code
    if (error.code && (
      typeof error.code === 'number' && error.code > 0 ||
      error.code === ERROR_CODES.DATABASE_ERROR
    )) {
      return true;
    }

    // Check error message patterns
    for (const [pattern] of this.#errorPatterns) {
      if (pattern.test(error.message)) {
        return true;
      }
    }

    return false;
  }

  /**
   * @private
   * Categorizes database error
   */
  #categorizeError(error) {
    // Check MongoDB error code
    if (error.code && this.#config.mongoErrorCodes[error.code]) {
      const errorConfig = this.#config.mongoErrorCodes[error.code];
      return this.#getCategoryFromCode(errorConfig.code);
    }

    // Check error name
    if (this.#config.connectionErrors.includes(error.name)) {
      return DatabaseErrorHandler.#ERROR_CATEGORIES.CONNECTION;
    }

    // Check error patterns
    for (const [pattern, config] of this.#errorPatterns) {
      if (pattern.test(error.message)) {
        return config.category;
      }
    }

    // Default to system error
    return DatabaseErrorHandler.#ERROR_CATEGORIES.SYSTEM;
  }

  /**
   * @private
   * Gets category from error code
   */
  #getCategoryFromCode(errorCode) {
    switch (errorCode) {
      case ERROR_CODES.DUPLICATE_ENTRY:
        return DatabaseErrorHandler.#ERROR_CATEGORIES.CONSTRAINT;
      case ERROR_CODES.VALIDATION_ERROR:
        return DatabaseErrorHandler.#ERROR_CATEGORIES.VALIDATION;
      case ERROR_CODES.TIMEOUT:
        return DatabaseErrorHandler.#ERROR_CATEGORIES.TIMEOUT;
      case ERROR_CODES.UNAUTHORIZED:
      case ERROR_CODES.AUTHENTICATION_ERROR:
        return DatabaseErrorHandler.#ERROR_CATEGORIES.AUTHORIZATION;
      case ERROR_CODES.TRANSACTION_ERROR:
        return DatabaseErrorHandler.#ERROR_CATEGORIES.TRANSACTION;
      case ERROR_CODES.CONNECTION_ERROR:
        return DatabaseErrorHandler.#ERROR_CATEGORIES.CONNECTION;
      default:
        return DatabaseErrorHandler.#ERROR_CATEGORIES.SYSTEM;
    }
  }

  /**
   * @private
   * Enhances error with database context
   */
  #enhanceError(error, category, req, correlationId) {
    const enhanced = {
      name: error.name,
      message: error.message,
      code: error.code,
      category,
      correlationId,
      timestamp: new Date().toISOString(),
      isOperational: this.#isOperationalError(error),
      isRetryable: this.#isRetryableError(error)
    };

    // Get appropriate error config
    if (error.code && this.#config.mongoErrorCodes[error.code]) {
      const errorConfig = this.#config.mongoErrorCodes[error.code];
      enhanced.message = errorConfig.message;
      enhanced.errorCode = errorConfig.code;
      enhanced.statusCode = errorConfig.statusCode;
    } else {
      enhanced.errorCode = ERROR_CODES.DATABASE_ERROR;
      enhanced.statusCode = 500;
    }

    // Add database context
    if (error.db) {
      enhanced.database = error.db;
    }

    if (error.collection) {
      enhanced.collection = error.collection;
    }

    if (error.operation) {
      enhanced.operation = error.operation;
    }

    // Add field information for validation errors
    if (category === DatabaseErrorHandler.#ERROR_CATEGORIES.VALIDATION && error.errors) {
      enhanced.validationErrors = this.#extractValidationErrors(error.errors);
    }

    // Add duplicate key information
    if (category === DatabaseErrorHandler.#ERROR_CATEGORIES.CONSTRAINT && error.keyValue) {
      enhanced.duplicateFields = Object.keys(error.keyValue);
      enhanced.duplicateValues = this.#sanitizeDuplicateValues(error.keyValue);
    }

    return enhanced;
  }

  /**
   * @private
   * Checks if error is operational (expected)
   */
  #isOperationalError(error) {
    return error.isOperational || 
           this.#config.transientErrors.includes(error.name) ||
           error.code === 11000; // Duplicate key
  }

  /**
   * @private
   * Checks if error is retryable
   */
  #isRetryableError(error) {
    return this.#config.transientErrors.includes(error.name) ||
           error.name === 'MongoNetworkError' ||
           error.message.includes('topology was destroyed') ||
           error.message.includes('connection') ||
           error.code === 'ECONNREFUSED';
  }

  /**
   * @private
   * Extracts validation errors
   */
  #extractValidationErrors(errors) {
    const extracted = [];

    for (const [field, error] of Object.entries(errors)) {
      extracted.push({
        field,
        message: error.message,
        kind: error.kind,
        value: this.#sanitizeValue(error.value)
      });
    }

    return extracted;
  }

  /**
   * @private
   * Sanitizes duplicate key values
   */
  #sanitizeDuplicateValues(keyValue) {
    const sanitized = {};

    for (const [key, value] of Object.entries(keyValue)) {
      // Don't expose sensitive field values
      if (this.#isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 50) {
        sanitized[key] = value.substring(0, 50) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * @private
   * Checks if field is sensitive
   */
  #isSensitiveField(field) {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credit/i,
      /ssn/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(field));
  }

  /**
   * @private
   * Sanitizes field value
   */
  #sanitizeValue(value) {
    if (value === undefined || value === null) {
      return value;
    }

    if (typeof value === 'string' && value.length > 100) {
      return value.substring(0, 100) + '...';
    }

    return value;
  }

  /**
   * @private
   * Logs database error
   */
  async #logDatabaseError(error, req) {
    const logData = {
      correlationId: error.correlationId,
      category: error.category,
      errorCode: error.errorCode,
      errorName: error.name,
      database: error.database,
      collection: error.collection,
      operation: error.operation,
      isRetryable: error.isRetryable,
      userId: req.user?.id || req.user?._id,
      organizationId: req.user?.organizationId,
      tenantId: req.tenant?.id || req.tenant?._id
    };

    // Add validation details
    if (error.validationErrors) {
      logData.validationFields = error.validationErrors.map(e => e.field);
    }

    // Add duplicate key details
    if (error.duplicateFields) {
      logData.duplicateFields = error.duplicateFields;
    }

    const logLevel = error.isOperational ? 'warn' : 'error';
    logger[logLevel]('Database error occurred', logData);
  }

  /**
   * @private
   * Tracks error metrics
   */
  #trackErrorMetrics(error) {
    const key = `${error.category}:${error.errorCode}`;
    const now = Date.now();

    if (!this.#connectionErrors.has(key)) {
      this.#connectionErrors.set(key, []);
    }

    const errors = this.#connectionErrors.get(key);
    errors.push({
      timestamp: now,
      database: error.database,
      collection: error.collection
    });

    // Track failing databases
    if (error.category === DatabaseErrorHandler.#ERROR_CATEGORIES.CONNECTION && error.database) {
      this.#failingDatabases.add(error.database);
    }
  }

  /**
   * @private
   * Handles connection errors
   */
  async #handleConnectionError(error, req) {
    logger.error('Database connection error detected', {
      correlationId: error.correlationId,
      database: error.database,
      failingDatabases: Array.from(this.#failingDatabases)
    });

    // Check if auto-recovery is enabled
    if (this.#config.enableAutoRecovery) {
      try {
        await this.#attemptConnectionRecovery(error.database);
      } catch (recoveryError) {
        logger.error('Connection recovery failed', {
          database: error.database,
          error: recoveryError.message
        });
      }
    }

    // Check connection error threshold
    const connectionErrorCount = this.#getRecentErrorCount(
      DatabaseErrorHandler.#ERROR_CATEGORIES.CONNECTION
    );

    if (connectionErrorCount >= this.#config.connectionErrorThreshold) {
      await this.#sendConnectionAlert(error, connectionErrorCount);
    }
  }

  /**
   * @private
   * Attempts connection recovery
   */
  async #attemptConnectionRecovery(database) {
    logger.info('Attempting database connection recovery', { database });

    try {
      // Attempt to reconnect
      await this.#connectionManager.reconnect(database);
      
      // Remove from failing databases
      this.#failingDatabases.delete(database);
      
      logger.info('Database connection recovered', { database });

    } catch (error) {
      logger.error('Database connection recovery failed', {
        database,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * @private
   * Handles transaction errors
   */
  async #handleTransactionError(error, req) {
    logger.warn('Database transaction error', {
      correlationId: error.correlationId,
      operation: error.operation
    });

    // Rollback transaction if enabled and available
    if (this.#config.enableTransactionRollback && req.transaction) {
      try {
        await req.transaction.abort();
        logger.info('Transaction rolled back', {
          correlationId: error.correlationId
        });
      } catch (rollbackError) {
        logger.error('Transaction rollback failed', {
          correlationId: error.correlationId,
          error: rollbackError.message
        });
      }
    }
  }

  /**
   * @private
   * Audits database error
   */
  async #auditDatabaseError(error, req) {
    try {
      const severity = error.isOperational ? 'warning' : 'error';

      await this.#auditService.logEvent({
        event: `database.${error.category}_error`,
        severity,
        userId: req.user?.id || req.user?._id,
        organizationId: req.user?.organizationId,
        tenantId: req.tenant?.id || req.tenant?._id,
        correlationId: error.correlationId,
        metadata: {
          errorCode: error.errorCode,
          errorName: error.name,
          database: error.database,
          collection: error.collection,
          operation: error.operation,
          isRetryable: error.isRetryable
        }
      });
    } catch (auditError) {
      logger.error('Failed to audit database error', {
        error: auditError.message,
        correlationId: error.correlationId
      });
    }
  }

  /**
   * @private
   * Checks notification threshold
   */
  async #checkNotificationThreshold(error) {
    if (!this.#config.enableNotifications) return;

    const errorCount = this.#getRecentErrorCount(error.category);

    if (errorCount >= this.#config.notificationThreshold) {
      await this.#sendErrorNotification(error, errorCount);
    }
  }

  /**
   * @private
   * Gets recent error count
   */
  #getRecentErrorCount(category) {
    const cutoff = Date.now() - this.#config.errorWindow;
    let count = 0;

    for (const [key, errors] of this.#connectionErrors.entries()) {
      if (key.startsWith(category)) {
        count += errors.filter(e => e.timestamp > cutoff).length;
      }
    }

    return count;
  }

  /**
   * @private
   * Sends connection alert
   */
  async #sendConnectionAlert(error, errorCount) {
    try {
      await this.#notificationService.sendNotification({
        type: 'database_connection_alert',
        priority: 'critical',
        recipients: ['ops-team@insightserenity.com', 'db-admin@insightserenity.com'],
        subject: `Critical: Database Connection Failures - ${error.database || 'Primary'}`,
        data: {
          database: error.database,
          errorCount,
          threshold: this.#config.connectionErrorThreshold,
          failingDatabases: Array.from(this.#failingDatabases),
          correlationId: error.correlationId
        }
      });
    } catch (notificationError) {
      logger.error('Failed to send connection alert', {
        error: notificationError.message
      });
    }
  }

  /**
   * @private
   * Sends error notification
   */
  async #sendErrorNotification(error, errorCount) {
    try {
      await this.#notificationService.sendNotification({
        type: 'database_error_threshold',
        priority: 'high',
        recipients: ['dev-team@insightserenity.com'],
        subject: `Database Error Threshold Exceeded: ${error.category}`,
        data: {
          category: error.category,
          errorCode: error.errorCode,
          errorCount,
          threshold: this.#config.notificationThreshold,
          database: error.database,
          collection: error.collection
        }
      });
    } catch (notificationError) {
      logger.error('Failed to send error notification', {
        error: notificationError.message
      });
    }
  }

  /**
   * @private
   * Builds error response
   */
  #buildErrorResponse(error) {
    const response = {
      success: false,
      error: {
        message: this.#getClientMessage(error),
        code: error.errorCode,
        correlationId: error.correlationId
      },
      timestamp: error.timestamp
    };

    // Add validation errors if present
    if (error.validationErrors && error.validationErrors.length > 0) {
      response.errors = error.validationErrors.map(e => ({
        field: e.field,
        message: e.message
      }));
    }

    // Add duplicate field info if present
    if (error.duplicateFields && error.duplicateFields.length > 0) {
      response.error.duplicateFields = error.duplicateFields;
    }

    // Add retry suggestion for transient errors
    if (error.isRetryable) {
      response.error.retryable = true;
      response.error.suggestion = 'This error is temporary. Please try again.';
    }

    return response;
  }

  /**
   * @private
   * Gets client-friendly message
   */
  #getClientMessage(error) {
    // Use specific message for category
    const categoryMessage = this.#config.errorMessages[error.category];
    if (categoryMessage) {
      return categoryMessage;
    }

    // Use MongoDB error code message
    if (error.code && this.#config.mongoErrorCodes[error.code]) {
      return this.#config.mongoErrorCodes[error.code].message;
    }

    // Default message
    return this.#config.errorMessages.general;
  }

  /**
   * @private
   * Cleans old connection errors
   */
  #cleanOldConnectionErrors() {
    const cutoff = Date.now() - this.#config.errorWindow;

    for (const [key, errors] of this.#connectionErrors.entries()) {
      const recentErrors = errors.filter(e => e.timestamp > cutoff);
      
      if (recentErrors.length === 0) {
        this.#connectionErrors.delete(key);
      } else {
        this.#connectionErrors.set(key, recentErrors);
      }
    }

    // Reset failing databases if no recent errors
    if (this.#getRecentErrorCount(DatabaseErrorHandler.#ERROR_CATEGORIES.CONNECTION) === 0) {
      this.#failingDatabases.clear();
    }
  }

  /**
   * @private
   * Resets database errors
   */
  #resetDatabaseErrors(database) {
    this.#failingDatabases.delete(database);
    
    // Clear connection errors for this database
    for (const [key, errors] of this.#connectionErrors.entries()) {
      if (key.includes('connection')) {
        const filtered = errors.filter(e => e.database !== database);
        if (filtered.length === 0) {
          this.#connectionErrors.delete(key);
        } else {
          this.#connectionErrors.set(key, filtered);
        }
      }
    }
  }

  /**
   * @private
   * Delays execution
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets database error metrics
   * @returns {Object} Error metrics
   */
  getMetrics() {
    const metrics = {
      total: 0,
      byCategory: {},
      failingDatabases: Array.from(this.#failingDatabases),
      recentErrors: []
    };

    const cutoff = Date.now() - this.#config.errorWindow;

    for (const [key, errors] of this.#connectionErrors.entries()) {
      const [category] = key.split(':');
      const recentErrors = errors.filter(e => e.timestamp > cutoff);
      
      metrics.total += recentErrors.length;
      metrics.byCategory[category] = (metrics.byCategory[category] || 0) + recentErrors.length;
      
      if (recentErrors.length > 0) {
        metrics.recentErrors.push({
          key,
          count: recentErrors.length,
          lastError: new Date(recentErrors[recentErrors.length - 1].timestamp)
        });
      }
    }

    return metrics;
  }

  /**
   * Resets metrics
   */
  resetMetrics() {
    this.#connectionErrors.clear();
    this.#failingDatabases.clear();
    logger.info('Database error metrics reset');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates DatabaseErrorHandler instance
 * @param {Object} [options] - Configuration options
 * @returns {DatabaseErrorHandler} DatabaseErrorHandler instance
 */
const getDatabaseErrorHandler = (options) => {
  if (!instance) {
    instance = new DatabaseErrorHandler(options);
  }
  return instance;
};

module.exports = {
  DatabaseErrorHandler,
  getDatabaseErrorHandler,
  // Export convenience methods
  handle: (error, req, res, next) => getDatabaseErrorHandler().handle(error, req, res, next),
  wrapDatabaseOperation: (operation, options) => getDatabaseErrorHandler().wrapDatabaseOperation(operation, options)
};