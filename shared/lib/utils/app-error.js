'use strict';

/**
 * @fileoverview Custom error classes for application-specific error handling
 * @module shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/constants/status-codes
 */

const { ERROR_CODES, VALIDATION_ERRORS, BUSINESS_ERRORS } = require('./constants/error-codes');
const { HTTP_STATUS } = require('./constants/status-codes');

/**
 * @class AppError
 * @extends Error
 * @description Base error class for application-specific errors with enhanced context
 */
class AppError extends Error {
  /**
   * Creates an instance of AppError
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} errorCode - Application error code
   * @param {Object} [details={}] - Additional error details
   * @param {boolean} [isOperational=true] - Whether error is operational
   */
  constructor(message, statusCode, errorCode, details = {}, isOperational = true) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Add request context if available
    this.context = {};
  }

  /**
   * Sets request context
   * @param {Object} context - Request context
   * @returns {AppError} Current instance for chaining
   */
  setContext(context) {
    this.context = {
      requestId: context.requestId,
      userId: context.userId,
      tenantId: context.tenantId,
      path: context.path,
      method: context.method,
      ip: context.ip,
      userAgent: context.userAgent
    };
    return this;
  }

  /**
   * Converts error to JSON representation
   * @returns {Object} JSON representation of error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      details: this.details,
      timestamp: this.timestamp,
      context: this.context,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }

  /**
   * Creates error response for API
   * @returns {Object} API error response
   */
  toResponse() {
    return {
      success: false,
      error: {
        code: this.errorCode,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * @class ValidationError
 * @extends AppError
 * @description Error class for validation failures
 */
class ValidationError extends AppError {
  /**
   * Creates a validation error
   * @param {string} message - Error message
   * @param {Object} [errors={}] - Field-specific errors
   * @param {string} [errorCode=VALIDATION_ERRORS.INVALID_INPUT] - Error code
   */
  constructor(message, errors = {}, errorCode = VALIDATION_ERRORS.INVALID_INPUT) {
    super(message, HTTP_STATUS.BAD_REQUEST, errorCode, { errors });
    this.name = 'ValidationError';
    this.errors = errors;
  }

  /**
   * Adds field error
   * @param {string} field - Field name
   * @param {string} message - Error message
   * @returns {ValidationError} Current instance for chaining
   */
  addFieldError(field, message) {
    if (!this.errors) this.errors = {};
    this.errors[field] = message;
    this.details.errors = this.errors;
    return this;
  }

  /**
   * Creates from validator result
   * @static
   * @param {Object} validationResult - Validation result object
   * @returns {ValidationError} Validation error instance
   */
  static fromValidatorResult(validationResult) {
    const errors = {};
    
    if (validationResult.errors) {
      Object.entries(validationResult.errors).forEach(([field, message]) => {
        errors[field] = message;
      });
    }
    
    const message = validationResult.message || 'Validation failed';
    return new ValidationError(message, errors);
  }
}

/**
 * @class AuthenticationError
 * @extends AppError
 * @description Error class for authentication failures
 */
class AuthenticationError extends AppError {
  /**
   * Creates an authentication error
   * @param {string} [message='Authentication failed'] - Error message
   * @param {string} [errorCode=ERROR_CODES.AUTHENTICATION_FAILED] - Error code
   * @param {Object} [details={}] - Additional details
   */
  constructor(
    message = 'Authentication failed',
    errorCode = ERROR_CODES.AUTHENTICATION_FAILED,
    details = {}
  ) {
    super(message, HTTP_STATUS.UNAUTHORIZED, errorCode, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * @class AuthorizationError
 * @extends AppError
 * @description Error class for authorization failures
 */
class AuthorizationError extends AppError {
  /**
   * Creates an authorization error
   * @param {string} [message='Access denied'] - Error message
   * @param {string} [errorCode=ERROR_CODES.ACCESS_DENIED] - Error code
   * @param {Object} [details={}] - Additional details
   */
  constructor(
    message = 'Access denied',
    errorCode = ERROR_CODES.ACCESS_DENIED,
    details = {}
  ) {
    super(message, HTTP_STATUS.FORBIDDEN, errorCode, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * @class NotFoundError
 * @extends AppError
 * @description Error class for resource not found
 */
class NotFoundError extends AppError {
  /**
   * Creates a not found error
   * @param {string} resource - Resource type
   * @param {string|number} [identifier] - Resource identifier
   * @param {string} [errorCode=ERROR_CODES.RESOURCE_NOT_FOUND] - Error code
   */
  constructor(resource, identifier, errorCode = ERROR_CODES.RESOURCE_NOT_FOUND) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    super(message, HTTP_STATUS.NOT_FOUND, errorCode, { resource, identifier });
    this.name = 'NotFoundError';
  }
}

/**
 * @class ConflictError
 * @extends AppError
 * @description Error class for resource conflicts
 */
class ConflictError extends AppError {
  /**
   * Creates a conflict error
   * @param {string} message - Error message
   * @param {Object} [conflictDetails={}] - Conflict details
   * @param {string} [errorCode=ERROR_CODES.RESOURCE_CONFLICT] - Error code
   */
  constructor(message, conflictDetails = {}, errorCode = ERROR_CODES.RESOURCE_CONFLICT) {
    super(message, HTTP_STATUS.CONFLICT, errorCode, conflictDetails);
    this.name = 'ConflictError';
  }
}

/**
 * @class BusinessLogicError
 * @extends AppError
 * @description Error class for business logic violations
 */
class BusinessLogicError extends AppError {
  /**
   * Creates a business logic error
   * @param {string} message - Error message
   * @param {string} [errorCode=BUSINESS_ERRORS.BUSINESS_RULE_VIOLATION] - Error code
   * @param {Object} [details={}] - Additional details
   */
  constructor(
    message,
    errorCode = BUSINESS_ERRORS.BUSINESS_RULE_VIOLATION,
    details = {}
  ) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, errorCode, details);
    this.name = 'BusinessLogicError';
  }
}

/**
 * @class RateLimitError
 * @extends AppError
 * @description Error class for rate limit exceeded
 */
class RateLimitError extends AppError {
  /**
   * Creates a rate limit error
   * @param {string} [message='Rate limit exceeded'] - Error message
   * @param {Object} [limits={}] - Rate limit details
   * @param {string} [errorCode=ERROR_CODES.RATE_LIMIT_EXCEEDED] - Error code
   */
  constructor(
    message = 'Rate limit exceeded',
    limits = {},
    errorCode = ERROR_CODES.RATE_LIMIT_EXCEEDED
  ) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, errorCode, limits);
    this.name = 'RateLimitError';
    this.retryAfter = limits.retryAfter;
  }
}

/**
 * @class DatabaseError
 * @extends AppError
 * @description Error class for database operations
 */
class DatabaseError extends AppError {
  /**
   * Creates a database error
   * @param {string} message - Error message
   * @param {Error} [originalError] - Original database error
   * @param {string} [errorCode=ERROR_CODES.DATABASE_ERROR] - Error code
   */
  constructor(message, originalError, errorCode = ERROR_CODES.DATABASE_ERROR) {
    const details = originalError ? {
      originalMessage: originalError.message,
      code: originalError.code,
      constraint: originalError.constraint
    } : {};
    
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode, details, false);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * @class ExternalServiceError
 * @extends AppError
 * @description Error class for external service failures
 */
class ExternalServiceError extends AppError {
  /**
   * Creates an external service error
   * @param {string} service - Service name
   * @param {string} message - Error message
   * @param {Object} [details={}] - Error details
   * @param {string} [errorCode=ERROR_CODES.EXTERNAL_SERVICE_ERROR] - Error code
   */
  constructor(service, message, details = {}, errorCode = ERROR_CODES.EXTERNAL_SERVICE_ERROR) {
    super(
      `External service error (${service}): ${message}`,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      errorCode,
      { service, ...details }
    );
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

/**
 * @class FileOperationError
 * @extends AppError
 * @description Error class for file operation failures
 */
class FileOperationError extends AppError {
  /**
   * Creates a file operation error
   * @param {string} operation - Operation type
   * @param {string} filename - File name
   * @param {string} message - Error message
   * @param {string} [errorCode=ERROR_CODES.FILE_OPERATION_FAILED] - Error code
   */
  constructor(operation, filename, message, errorCode = ERROR_CODES.FILE_OPERATION_FAILED) {
    super(
      `File ${operation} failed for '${filename}': ${message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      errorCode,
      { operation, filename }
    );
    this.name = 'FileOperationError';
  }
}

/**
 * Error factory utility
 * @class ErrorFactory
 */
class ErrorFactory {
  /**
   * Creates error from code
   * @static
   * @param {string} errorCode - Error code
   * @param {Object} [context={}] - Error context
   * @returns {AppError} Application error instance
   */
  static fromCode(errorCode, context = {}) {
    const errorMap = {
      [ERROR_CODES.AUTHENTICATION_FAILED]: () => new AuthenticationError(context.message),
      [ERROR_CODES.ACCESS_DENIED]: () => new AuthorizationError(context.message),
      [ERROR_CODES.RESOURCE_NOT_FOUND]: () => new NotFoundError(context.resource, context.identifier),
      [ERROR_CODES.VALIDATION_ERROR]: () => new ValidationError(context.message, context.errors),
      [ERROR_CODES.RESOURCE_CONFLICT]: () => new ConflictError(context.message, context.details),
      [ERROR_CODES.RATE_LIMIT_EXCEEDED]: () => new RateLimitError(context.message, context.limits),
      [ERROR_CODES.DATABASE_ERROR]: () => new DatabaseError(context.message, context.originalError),
      [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: () => new ExternalServiceError(
        context.service,
        context.message,
        context.details
      )
    };
    
    const errorCreator = errorMap[errorCode];
    
    if (errorCreator) {
      return errorCreator();
    }
    
    return new AppError(
      context.message || 'An error occurred',
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      errorCode,
      context.details
    );
  }

  /**
   * Wraps error with context
   * @static
   * @param {Error} error - Original error
   * @param {string} message - Wrapper message
   * @param {Object} [context={}] - Additional context
   * @returns {AppError} Wrapped error
   */
  static wrap(error, message, context = {}) {
    if (error instanceof AppError) {
      error.message = `${message}: ${error.message}`;
      if (context) {
        Object.assign(error.details, context);
      }
      return error;
    }
    
    return new AppError(
      `${message}: ${error.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      {
        originalError: error.message,
        originalStack: error.stack,
        ...context
      },
      false
    );
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessLogicError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  FileOperationError,
  ErrorFactory
};