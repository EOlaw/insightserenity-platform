'use strict';

/**
 * @fileoverview Response formatting utilities for consistent API responses
 * @module shared/lib/utils/response-formatter
 */

const StatusCodes = require('./constants/status-codes');

/**
 * @class ResponseFormatter
 * @description Standardizes API response formats across the platform
 */
class ResponseFormatter {
  /**
   * Format successful response
   * @static
   * @param {any} data - Response data
   * @param {string} [message='Success'] - Success message
   * @param {Object} [meta={}] - Additional metadata
   * @returns {Object} Formatted response
   */
  static success(data, message = 'Success', meta = {}) {
    const response = {
      success: true,
      message,
      data: data || null,
      timestamp: new Date().toISOString()
    };

    // Add metadata if provided
    if (Object.keys(meta).length > 0) {
      response.meta = meta;
    }

    // Add request ID if available
    if (global.requestId) {
      response.requestId = global.requestId;
    }

    return response;
  }

  /**
   * Format error response
   * @static
   * @param {string} message - Error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [errorCode='INTERNAL_ERROR'] - Error code
   * @param {Object} [details={}] - Error details
   * @returns {Object} Formatted error response
   */
  static error(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', details = {}) {
    const response = {
      success: false,
      error: {
        message,
        code: errorCode,
        statusCode,
        timestamp: new Date().toISOString()
      }
    };

    // Add error details if provided
    if (Object.keys(details).length > 0) {
      response.error.details = details;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development' && details.stack) {
      response.error.stack = details.stack;
    }

    // Add request ID if available
    if (global.requestId) {
      response.requestId = global.requestId;
    }

    return response;
  }

  /**
   * Format paginated response
   * @static
   * @param {Array} data - Data array
   * @param {Object} pagination - Pagination details
   * @param {number} pagination.page - Current page
   * @param {number} pagination.limit - Items per page
   * @param {number} pagination.total - Total items
   * @param {string} [message='Success'] - Success message
   * @returns {Object} Formatted paginated response
   */
  static paginated(data, pagination, message = 'Success') {
    const { page = 1, limit = 10, total = 0 } = pagination;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      success: true,
      message,
      data: data || [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
        totalPages,
        hasNext,
        hasPrev,
        nextPage: hasNext ? page + 1 : null,
        prevPage: hasPrev ? page - 1 : null
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format validation error response
   * @static
   * @param {Array|Object} errors - Validation errors
   * @param {string} [message='Validation failed'] - Error message
   * @returns {Object} Formatted validation error response
   */
  static validationError(errors, message = 'Validation failed') {
    const formattedErrors = Array.isArray(errors) ? errors : [errors];

    return {
      success: false,
      error: {
        message,
        code: 'VALIDATION_ERROR',
        statusCode: StatusCodes.BAD_REQUEST,
        fields: formattedErrors.map(err => ({
          field: err.field || err.path || 'unknown',
          message: err.message || err.msg || 'Invalid value',
          value: err.value !== undefined ? err.value : null,
          location: err.location || 'body'
        })),
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Format created resource response
   * @static
   * @param {any} data - Created resource data
   * @param {string} [message='Resource created successfully'] - Success message
   * @param {string} [location] - Resource location/URI
   * @returns {Object} Formatted response
   */
  static created(data, message = 'Resource created successfully', location = null) {
    const response = this.success(data, message);
    response.statusCode = StatusCodes.CREATED;

    if (location) {
      response.location = location;
    }

    return response;
  }

  /**
   * Format updated resource response
   * @static
   * @param {any} data - Updated resource data
   * @param {string} [message='Resource updated successfully'] - Success message
   * @returns {Object} Formatted response
   */
  static updated(data, message = 'Resource updated successfully') {
    const response = this.success(data, message);
    response.statusCode = StatusCodes.OK;
    return response;
  }

  /**
   * Format deleted resource response
   * @static
   * @param {string} [message='Resource deleted successfully'] - Success message
   * @param {Object} [data=null] - Optional deletion details
   * @returns {Object} Formatted response
   */
  static deleted(message = 'Resource deleted successfully', data = null) {
    return this.success(data, message);
  }

  /**
   * Format no content response
   * @static
   * @returns {Object} Formatted response
   */
  static noContent() {
    return {
      success: true,
      statusCode: StatusCodes.NO_CONTENT,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format not found response
   * @static
   * @param {string} [resource='Resource'] - Resource name
   * @param {string} [identifier] - Resource identifier
   * @returns {Object} Formatted response
   */
  static notFound(resource = 'Resource', identifier = null) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    return this.error(message, StatusCodes.NOT_FOUND, 'RESOURCE_NOT_FOUND');
  }

  /**
   * Format unauthorized response
   * @static
   * @param {string} [message='Unauthorized access'] - Error message
   * @param {string} [errorCode='UNAUTHORIZED'] - Error code
   * @returns {Object} Formatted response
   */
  static unauthorized(message = 'Unauthorized access', errorCode = 'UNAUTHORIZED') {
    return this.error(message, StatusCodes.UNAUTHORIZED, errorCode);
  }

  /**
   * Format forbidden response
   * @static
   * @param {string} [message='Access forbidden'] - Error message
   * @param {string} [errorCode='FORBIDDEN'] - Error code
   * @returns {Object} Formatted response
   */
  static forbidden(message = 'Access forbidden', errorCode = 'FORBIDDEN') {
    return this.error(message, StatusCodes.FORBIDDEN, errorCode);
  }

  /**
   * Format conflict response
   * @static
   * @param {string} message - Conflict message
   * @param {string} [errorCode='CONFLICT'] - Error code
   * @param {Object} [details={}] - Conflict details
   * @returns {Object} Formatted response
   */
  static conflict(message, errorCode = 'CONFLICT', details = {}) {
    return this.error(message, StatusCodes.CONFLICT, errorCode, details);
  }

  /**
   * Format rate limit response
   * @static
   * @param {number} [retryAfter] - Seconds until retry
   * @param {string} [message='Too many requests'] - Error message
   * @returns {Object} Formatted response
   */
  static tooManyRequests(retryAfter = null, message = 'Too many requests') {
    const response = this.error(message, StatusCodes.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');

    if (retryAfter) {
      response.error.retryAfter = retryAfter;
    }

    return response;
  }

  /**
   * Format service unavailable response
   * @static
   * @param {string} [message='Service temporarily unavailable'] - Error message
   * @param {number} [retryAfter] - Seconds until retry
   * @returns {Object} Formatted response
   */
  static serviceUnavailable(message = 'Service temporarily unavailable', retryAfter = null) {
    const response = this.error(message, StatusCodes.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');

    if (retryAfter) {
      response.error.retryAfter = retryAfter;
    }

    return response;
  }

  /**
   * Format batch operation response
   * @static
   * @param {Array} results - Array of operation results
   * @param {string} [message='Batch operation completed'] - Success message
   * @returns {Object} Formatted response
   */
  static batch(results, message = 'Batch operation completed') {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      success: failed === 0,
      message,
      summary: {
        total: results.length,
        successful,
        failed
      },
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format file upload response
   * @static
   * @param {Object} fileInfo - File information
   * @param {string} [message='File uploaded successfully'] - Success message
   * @returns {Object} Formatted response
   */
  static fileUploaded(fileInfo, message = 'File uploaded successfully') {
    return this.success({
      filename: fileInfo.filename,
      originalName: fileInfo.originalname,
      mimetype: fileInfo.mimetype,
      size: fileInfo.size,
      path: fileInfo.path,
      url: fileInfo.url
    }, message);
  }

  /**
   * Format authentication response
   * @static
   * @param {Object} authData - Authentication data
   * @param {string} authData.token - Access token
   * @param {Object} authData.user - User data
   * @param {string} [authData.refreshToken] - Refresh token
   * @param {number} [authData.expiresIn] - Token expiry time
   * @param {string} [message='Authentication successful'] - Success message
   * @returns {Object} Formatted response
   */
  static authenticated(authData, message = 'Authentication successful') {
    return this.success({
      token: authData.token,
      refreshToken: authData.refreshToken,
      expiresIn: authData.expiresIn || 3600,
      tokenType: 'Bearer',
      user: authData.user
    }, message);
  }

  /**
   * Format logout response
   * @static
   * @param {string} [message='Logout successful'] - Success message
   * @returns {Object} Formatted response
   */
  static loggedOut(message = 'Logout successful') {
    return this.success(null, message);
  }

  /**
   * Format health check response
   * @static
   * @param {Object} health - Health status
   * @param {string} [message='Service is healthy'] - Success message
   * @returns {Object} Formatted response
   */
  static healthCheck(health, message = 'Service is healthy') {
    return {
      success: health.healthy !== false,
      message,
      status: health.healthy ? 'healthy' : 'unhealthy',
      version: health.version || process.env.APP_VERSION || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: health.checks || {},
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Format async operation response
   * @static
   * @param {string} operationId - Operation identifier
   * @param {string} [status='pending'] - Operation status
   * @param {string} [message='Operation initiated'] - Success message
   * @returns {Object} Formatted response
   */
  static asyncOperation(operationId, status = 'pending', message = 'Operation initiated') {
    return this.success({
      operationId,
      status,
      statusUrl: `/operations/${operationId}/status`,
      estimatedCompletion: null
    }, message);
  }

  /**
   * Format webhook response
   * @static
   * @param {boolean} received - Whether webhook was received
   * @param {string} [message='Webhook received'] - Success message
   * @returns {Object} Formatted response
   */
  static webhook(received = true, message = 'Webhook received') {
    return {
      success: received,
      message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Send formatted response
   * @static
   * @param {Object} res - Express response object
   * @param {Object} response - Formatted response
   * @param {number} [statusCode] - HTTP status code
   */
  static send(res, response, statusCode = null) {
    const code = statusCode || response.statusCode ||
                 (response.success ? StatusCodes.OK : StatusCodes.INTERNAL_SERVER_ERROR);

    // Set standard headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Request-Id', response.requestId || global.requestId || '');
    res.setHeader('X-Response-Time', Date.now() - (res.locals.startTime || Date.now()) + 'ms');

    // Send response
    res.status(code).json(response);
  }
}

module.exports = ResponseFormatter;
