'use strict';

/**
 * @fileoverview Standard API response formatter for consistent JSON responses
 * @module shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const { HTTP_STATUS } = require('./constants/status-codes');
const DateHelper = require('./helpers/date-helper');

/**
 * @class ResponseFormatter
 * @description Formats API responses in a consistent structure
 */
class ResponseFormatter {
  /**
   * @private
   * @static
   * @readonly
   */
  static #API_VERSION = process.env.API_VERSION || 'v1';

  /**
   * @private
   * @static
   * Singleton instance
   */
  static #instance = null;

  /**
   * Private constructor to prevent direct instantiation
   * @private
   */
  constructor() {
    if (ResponseFormatter.#instance) {
      return ResponseFormatter.#instance;
    }
    
    // Initialize instance properties
    this.apiVersion = ResponseFormatter.#API_VERSION;
    this.defaultOptions = {
      includeTimestamp: true,
      includeVersion: true,
      includeStack: process.env.NODE_ENV === 'development'
    };

    ResponseFormatter.#instance = this;
  }

  /**
   * Get singleton instance
   * @static
   * @returns {ResponseFormatter} ResponseFormatter instance
   */
  static getInstance() {
    if (!ResponseFormatter.#instance) {
      ResponseFormatter.#instance = new ResponseFormatter();
    }
    return ResponseFormatter.#instance;
  }

  /**
   * Creates success response
   * @param {*} data - Response data
   * @param {string} [message='Request successful'] - Success message
   * @param {number} [statusCode=200] - HTTP status code
   * @param {Object} [options={}] - Additional options
   * @returns {Object} Formatted success response
   */
  formatSuccess(data, message = 'Request successful', statusCode = HTTP_STATUS.OK, options = {}) {
    const {
      meta = {},
      links = {},
      included = null
    } = options;

    const response = {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
      version: this.apiVersion
    };

    // Add metadata if provided
    if (Object.keys(meta).length > 0) {
      response.meta = meta;
    }

    // Add links for HATEOAS
    if (Object.keys(links).length > 0) {
      response.links = links;
    }

    // Add included resources (JSON:API style)
    if (included) {
      response.included = included;
    }

    return response;
  }

  /**
   * Creates error response
   * @param {Error|Object} error - Error object
   * @param {string} [message] - Custom error message
   * @param {number} [statusCode] - HTTP status code
   * @param {Object} [options={}] - Additional options
   * @returns {Object} Formatted error response
   */
  formatError(error, message, statusCode, options = {}) {
    const {
      errorCode = error.errorCode || 'INTERNAL_ERROR',
      details = error.details || {},
      stack = this.defaultOptions.includeStack ? error.stack : undefined
    } = options;

    const finalStatusCode = statusCode || error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const finalMessage = message || error.message || 'An error occurred';

    const response = {
      success: false,
      statusCode: finalStatusCode,
      error: {
        code: errorCode,
        message: finalMessage,
        details: details,
        timestamp: new Date().toISOString()
      },
      version: this.apiVersion
    };

    // Add stack trace in development
    if (stack) {
      response.error.stack = stack;
    }

    // Add validation errors if present
    if (error.errors) {
      response.error.validationErrors = error.errors;
    }

    return response;
  }

  /**
   * Creates paginated response
   * @param {Array} items - Data items
   * @param {Object} pagination - Pagination info
   * @param {string} [message='Data retrieved successfully'] - Success message
   * @param {Object} [options={}] - Additional options
   * @returns {Object} Formatted paginated response
   */
  formatPaginatedSuccess(items, pagination, message = 'Data retrieved successfully', options = {}) {
    const {
      page = 1,
      limit = 20,
      total = 0,
      totalPages = Math.ceil(total / limit)
    } = pagination;

    const meta = {
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
        totalPages: Number(totalPages),
        hasMore: page < totalPages,
        hasPrevious: page > 1
      }
    };

    // Generate pagination links
    const baseUrl = options.baseUrl || '';
    const links = {};

    if (baseUrl) {
      links.self = `${baseUrl}?page=${page}&limit=${limit}`;
      links.first = `${baseUrl}?page=1&limit=${limit}`;
      links.last = `${baseUrl}?page=${totalPages}&limit=${limit}`;

      if (page < totalPages) {
        links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
      }

      if (page > 1) {
        links.previous = `${baseUrl}?page=${page - 1}&limit=${limit}`;
      }
    }

    return this.formatSuccess(items, message, HTTP_STATUS.OK, {
      ...options,
      meta: { ...meta, ...options.meta },
      links: { ...links, ...options.links }
    });
  }

  /**
   * Creates success response (static method for backward compatibility)
   * @static
   * @param {*} data - Response data
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted success response
   */
  static success(data, options = {}) {
    const {
      message = 'Request successful',
      statusCode = HTTP_STATUS.OK,
      meta = {},
      links = {},
      included = null
    } = options;

    const response = {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
      version: this.#API_VERSION
    };

    // Add metadata if provided
    if (Object.keys(meta).length > 0) {
      response.meta = meta;
    }

    // Add links for HATEOAS
    if (Object.keys(links).length > 0) {
      response.links = links;
    }

    // Add included resources (JSON:API style)
    if (included) {
      response.included = included;
    }

    return response;
  }

  /**
   * Creates error response (static method for backward compatibility)
   * @static
   * @param {Error|Object} error - Error object
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted error response
   */
  static error(error, options = {}) {
    const {
      statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
      errorCode = error.errorCode || 'INTERNAL_ERROR',
      details = error.details || {},
      stack = process.env.NODE_ENV === 'development' ? error.stack : undefined
    } = options;

    const response = {
      success: false,
      statusCode,
      error: {
        code: errorCode,
        message: error.message || 'An error occurred',
        details: details,
        timestamp: new Date().toISOString()
      },
      version: this.#API_VERSION
    };

    // Add stack trace in development
    if (stack) {
      response.error.stack = stack;
    }

    // Add validation errors if present
    if (error.errors) {
      response.error.validationErrors = error.errors;
    }

    return response;
  }

  /**
   * Creates paginated response (static method for backward compatibility)
   * @static
   * @param {Array} items - Data items
   * @param {Object} pagination - Pagination info
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted paginated response
   */
  static paginated(items, pagination, options = {}) {
    const {
      page = 1,
      limit = 20,
      total = 0,
      totalPages = Math.ceil(total / limit)
    } = pagination;

    const meta = {
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
        totalPages: Number(totalPages),
        hasMore: page < totalPages,
        hasPrevious: page > 1
      }
    };

    // Generate pagination links
    const baseUrl = options.baseUrl || '';
    const links = {};

    if (baseUrl) {
      links.self = `${baseUrl}?page=${page}&limit=${limit}`;
      links.first = `${baseUrl}?page=1&limit=${limit}`;
      links.last = `${baseUrl}?page=${totalPages}&limit=${limit}`;

      if (page < totalPages) {
        links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
      }

      if (page > 1) {
        links.previous = `${baseUrl}?page=${page - 1}&limit=${limit}`;
      }
    }

    return this.success(items, {
      ...options,
      meta: { ...meta, ...options.meta },
      links: { ...links, ...options.links }
    });
  }

  /**
   * Creates collection response
   * @static
   * @param {Array} items - Collection items
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted collection response
   */
  static collection(items, options = {}) {
    const count = Array.isArray(items) ? items.length : 0;
    
    const meta = {
      count,
      ...options.meta
    };

    return this.success(items, {
      ...options,
      meta
    });
  }

  /**
   * Creates single resource response
   * @static
   * @param {Object} resource - Resource object
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted resource response
   */
  static resource(resource, options = {}) {
    const response = this.success(resource, options);

    // Add resource metadata
    if (resource && typeof resource === 'object') {
      const resourceMeta = {};

      if (resource.id || resource._id) {
        resourceMeta.id = resource.id || resource._id;
      }

      if (resource.createdAt) {
        resourceMeta.created = DateHelper.format(resource.createdAt);
      }

      if (resource.updatedAt) {
        resourceMeta.updated = DateHelper.format(resource.updatedAt);
      }

      if (Object.keys(resourceMeta).length > 0) {
        response.meta = {
          ...resourceMeta,
          ...response.meta
        };
      }
    }

    return response;
  }

  /**
   * Creates created response (201)
   * @static
   * @param {Object} resource - Created resource
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted created response
   */
  static created(resource, options = {}) {
    return this.success(resource, {
      ...options,
      message: options.message || 'Resource created successfully',
      statusCode: HTTP_STATUS.CREATED
    });
  }

  /**
   * Creates updated response
   * @static
   * @param {Object} resource - Updated resource
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted updated response
   */
  static updated(resource, options = {}) {
    return this.success(resource, {
      ...options,
      message: options.message || 'Resource updated successfully',
      statusCode: HTTP_STATUS.OK
    });
  }

  /**
   * Creates deleted response
   * @static
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted deleted response
   */
  static deleted(options = {}) {
    return this.success(null, {
      ...options,
      message: options.message || 'Resource deleted successfully',
      statusCode: HTTP_STATUS.OK
    });
  }

  /**
   * Creates no content response (204)
   * @static
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted no content response
   */
  static noContent(options = {}) {
    return {
      success: true,
      statusCode: HTTP_STATUS.NO_CONTENT,
      message: options.message || 'No content',
      timestamp: new Date().toISOString(),
      version: this.#API_VERSION
    };
  }

  /**
   * Creates accepted response (202)
   * @static
   * @param {Object} [data={}] - Response data
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted accepted response
   */
  static accepted(data = {}, options = {}) {
    return this.success(data, {
      ...options,
      message: options.message || 'Request accepted for processing',
      statusCode: HTTP_STATUS.ACCEPTED
    });
  }

  /**
   * Creates batch response
   * @static
   * @param {Array} results - Batch operation results
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted batch response
   */
  static batch(results, options = {}) {
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const total = results.length;

    const meta = {
      batch: {
        total,
        succeeded,
        failed,
        successRate: total > 0 ? (succeeded / total * 100).toFixed(2) + '%' : '0%'
      }
    };

    const response = this.success(results, {
      ...options,
      message: `Batch operation completed: ${succeeded} succeeded, ${failed} failed`,
      meta: { ...meta, ...options.meta }
    });

    // Set appropriate status code
    if (failed === 0) {
      response.statusCode = HTTP_STATUS.OK;
    } else if (succeeded === 0) {
      response.statusCode = HTTP_STATUS.BAD_REQUEST;
    } else {
      response.statusCode = HTTP_STATUS.MULTI_STATUS;
    }

    return response;
  }

  /**
   * Creates file upload response
   * @static
   * @param {Object} fileInfo - File information
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted file response
   */
  static fileUploaded(fileInfo, options = {}) {
    const meta = {
      file: {
        originalName: fileInfo.originalname,
        filename: fileInfo.filename,
        size: fileInfo.size,
        mimeType: fileInfo.mimetype,
        encoding: fileInfo.encoding
      }
    };

    return this.created(fileInfo, {
      ...options,
      message: options.message || 'File uploaded successfully',
      meta: { ...meta, ...options.meta }
    });
  }

  /**
   * Creates validation error response
   * @static
   * @param {Object} errors - Validation errors
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted validation error response
   */
  static validationError(errors, options = {}) {
    return this.error(
      {
        message: options.message || 'Validation failed',
        errors: errors
      },
      {
        ...options,
        statusCode: HTTP_STATUS.BAD_REQUEST,
        errorCode: 'VALIDATION_ERROR'
      }
    );
  }

  /**
   * Creates unauthorized response
   * @static
   * @param {string} [message='Unauthorized'] - Error message
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted unauthorized response
   */
  static unauthorized(message = 'Unauthorized', options = {}) {
    return this.error(
      { message },
      {
        ...options,
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        errorCode: 'UNAUTHORIZED'
      }
    );
  }

  /**
   * Creates forbidden response
   * @static
   * @param {string} [message='Forbidden'] - Error message
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted forbidden response
   */
  static forbidden(message = 'Forbidden', options = {}) {
    return this.error(
      { message },
      {
        ...options,
        statusCode: HTTP_STATUS.FORBIDDEN,
        errorCode: 'FORBIDDEN'
      }
    );
  }

  /**
   * Creates not found response
   * @static
   * @param {string} [resource='Resource'] - Resource name
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted not found response
   */
  static notFound(resource = 'Resource', options = {}) {
    return this.error(
      { message: `${resource} not found` },
      {
        ...options,
        statusCode: HTTP_STATUS.NOT_FOUND,
        errorCode: 'NOT_FOUND'
      }
    );
  }

  /**
   * Creates rate limit response
   * @static
   * @param {Object} [limits={}] - Rate limit information
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted rate limit response
   */
  static rateLimitExceeded(limits = {}, options = {}) {
    const response = this.error(
      { message: 'Rate limit exceeded' },
      {
        ...options,
        statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        details: limits
      }
    );

    if (limits.retryAfter) {
      response.retryAfter = limits.retryAfter;
    }

    return response;
  }

  /**
   * Creates maintenance response
   * @static
   * @param {Object} [info={}] - Maintenance information
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted maintenance response
   */
  static maintenance(info = {}, options = {}) {
    return this.error(
      { message: 'Service temporarily unavailable for maintenance' },
      {
        ...options,
        statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        errorCode: 'MAINTENANCE_MODE',
        details: info
      }
    );
  }

  /**
   * Formats response with custom structure
   * @static
   * @param {Object} structure - Custom response structure
   * @returns {Object} Formatted custom response
   */
  static custom(structure) {
    return {
      ...structure,
      timestamp: structure.timestamp || new Date().toISOString(),
      version: structure.version || this.#API_VERSION
    };
  }

  /**
   * Wraps data in API response format
   * @static
   * @param {Object} data - Data to wrap
   * @param {Object} [context={}] - Additional context
   * @returns {Object} Wrapped response
   */
  static wrap(data, context = {}) {
    if (data && typeof data === 'object' && 'success' in data) {
      // Already formatted
      return data;
    }

    return this.success(data, context);
  }

  /**
   * Creates response from Express result
   * @static
   * @param {Object} res - Express response object
   * @param {Object} data - Response data
   * @param {Object} [options={}] - Response options
   */
  static send(res, data, options = {}) {
    const response = this.wrap(data, options);
    const statusCode = response.statusCode || HTTP_STATUS.OK;
    
    res.status(statusCode).json(response);
  }

  /**
   * Instance method aliases for compatibility
   */
  
  /**
   * Creates collection response (instance method)
   * @param {Array} items - Collection items
   * @param {string} [message='Collection retrieved successfully'] - Success message
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted collection response
   */
  formatCollection(items, message = 'Collection retrieved successfully', options = {}) {
    const count = Array.isArray(items) ? items.length : 0;
    
    const meta = {
      count,
      ...options.meta
    };

    return this.formatSuccess(items, message, HTTP_STATUS.OK, {
      ...options,
      meta
    });
  }

  /**
   * Creates resource response (instance method)
   * @param {Object} resource - Resource object
   * @param {string} [message='Resource retrieved successfully'] - Success message
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted resource response
   */
  formatResource(resource, message = 'Resource retrieved successfully', options = {}) {
    const response = this.formatSuccess(resource, message, HTTP_STATUS.OK, options);

    // Add resource metadata
    if (resource && typeof resource === 'object') {
      const resourceMeta = {};

      if (resource.id || resource._id) {
        resourceMeta.id = resource.id || resource._id;
      }

      if (resource.createdAt) {
        resourceMeta.created = DateHelper.format(resource.createdAt);
      }

      if (resource.updatedAt) {
        resourceMeta.updated = DateHelper.format(resource.updatedAt);
      }

      if (Object.keys(resourceMeta).length > 0) {
        response.meta = {
          ...resourceMeta,
          ...response.meta
        };
      }
    }

    return response;
  }

  /**
   * Creates created response (instance method)
   * @param {Object} resource - Created resource
   * @param {string} [message='Resource created successfully'] - Success message
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted created response
   */
  formatCreated(resource, message = 'Resource created successfully', options = {}) {
    return this.formatSuccess(resource, message, HTTP_STATUS.CREATED, options);
  }

  /**
   * Creates updated response (instance method)
   * @param {Object} resource - Updated resource
   * @param {string} [message='Resource updated successfully'] - Success message
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted updated response
   */
  formatUpdated(resource, message = 'Resource updated successfully', options = {}) {
    return this.formatSuccess(resource, message, HTTP_STATUS.OK, options);
  }

  /**
   * Creates deleted response (instance method)
   * @param {string} [message='Resource deleted successfully'] - Success message
   * @param {Object} [options={}] - Response options
   * @returns {Object} Formatted deleted response
   */
  formatDeleted(message = 'Resource deleted successfully', options = {}) {
    return this.formatSuccess(null, message, HTTP_STATUS.OK, options);
  }

  /**
   * Set custom options for the instance
   * @param {Object} options - Custom options
   */
  setOptions(options) {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Get current options
   * @returns {Object} Current options
   */
  getOptions() {
    return { ...this.defaultOptions };
  }
}

// Export convenience methods (maintain backward compatibility)
const success = ResponseFormatter.success.bind(ResponseFormatter);
const error = ResponseFormatter.error.bind(ResponseFormatter);
const paginated = ResponseFormatter.paginated.bind(ResponseFormatter);
const created = ResponseFormatter.created.bind(ResponseFormatter);
const updated = ResponseFormatter.updated.bind(ResponseFormatter);
const deleted = ResponseFormatter.deleted.bind(ResponseFormatter);

module.exports = {
  ResponseFormatter,
  success,
  error,
  paginated,
  created,
  updated,
  deleted
};