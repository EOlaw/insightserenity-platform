'use strict';

/**
 * @fileoverview HTTP status codes and response utilities with platform-specific constants
 * @module shared/lib/utils/constants/status-codes
 */

/**
 * Standard HTTP status codes
 * @namespace HTTP_STATUS
 */
const HTTP_STATUS = Object.freeze({
  // 1xx Informational
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLY_HINTS: 103,

  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MULTI_STATUS: 207,
  ALREADY_REPORTED: 208,
  IM_USED: 226,

  // 3xx Redirection
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  USE_PROXY: 305,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,

  // 4xx Client Error
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  IM_A_TEAPOT: 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,

  // 5xx Server Error
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511
});

/**
 * Status code categories
 * @namespace STATUS_CATEGORIES
 */
const STATUS_CATEGORIES = Object.freeze({
  INFORMATIONAL: 'informational',
  SUCCESS: 'success',
  REDIRECTION: 'redirection',
  CLIENT_ERROR: 'client_error',
  SERVER_ERROR: 'server_error'
});

/**
 * Platform operational modes
 * @namespace PLATFORM_MODES
 */
const PLATFORM_MODES = Object.freeze({
  NORMAL: 'normal',
  MAINTENANCE: 'maintenance',
  READ_ONLY: 'read_only',
  EMERGENCY: 'emergency',
  DEGRADED: 'degraded',
  SETUP: 'setup',
  MIGRATION: 'migration',
  SCALING: 'scaling'
});

/**
 * Platform status states
 * @namespace PLATFORM_STATUS
 */
const PLATFORM_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  INITIALIZING: 'initializing',
  UPGRADING: 'upgrading',
  MIGRATING: 'migrating',
  SUSPENDED: 'suspended',
  ERROR: 'error',
  UNKNOWN: 'unknown'
});

/**
 * System health status levels
 * @namespace HEALTH_STATUS
 */
const HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  DOWN: 'down',
  UNKNOWN: 'unknown'
});

/**
 * Standard status messages
 * @namespace STATUS_MESSAGES
 */
const STATUS_MESSAGES = Object.freeze({
  // 1xx Informational
  [HTTP_STATUS.CONTINUE]: 'Continue',
  [HTTP_STATUS.SWITCHING_PROTOCOLS]: 'Switching Protocols',
  [HTTP_STATUS.PROCESSING]: 'Processing',
  [HTTP_STATUS.EARLY_HINTS]: 'Early Hints',

  // 2xx Success
  [HTTP_STATUS.OK]: 'OK',
  [HTTP_STATUS.CREATED]: 'Created',
  [HTTP_STATUS.ACCEPTED]: 'Accepted',
  [HTTP_STATUS.NON_AUTHORITATIVE_INFORMATION]: 'Non-Authoritative Information',
  [HTTP_STATUS.NO_CONTENT]: 'No Content',
  [HTTP_STATUS.RESET_CONTENT]: 'Reset Content',
  [HTTP_STATUS.PARTIAL_CONTENT]: 'Partial Content',
  [HTTP_STATUS.MULTI_STATUS]: 'Multi-Status',
  [HTTP_STATUS.ALREADY_REPORTED]: 'Already Reported',
  [HTTP_STATUS.IM_USED]: 'IM Used',

  // 3xx Redirection
  [HTTP_STATUS.MULTIPLE_CHOICES]: 'Multiple Choices',
  [HTTP_STATUS.MOVED_PERMANENTLY]: 'Moved Permanently',
  [HTTP_STATUS.FOUND]: 'Found',
  [HTTP_STATUS.SEE_OTHER]: 'See Other',
  [HTTP_STATUS.NOT_MODIFIED]: 'Not Modified',
  [HTTP_STATUS.USE_PROXY]: 'Use Proxy',
  [HTTP_STATUS.TEMPORARY_REDIRECT]: 'Temporary Redirect',
  [HTTP_STATUS.PERMANENT_REDIRECT]: 'Permanent Redirect',

  // 4xx Client Error
  [HTTP_STATUS.BAD_REQUEST]: 'Bad Request',
  [HTTP_STATUS.UNAUTHORIZED]: 'Unauthorized',
  [HTTP_STATUS.PAYMENT_REQUIRED]: 'Payment Required',
  [HTTP_STATUS.FORBIDDEN]: 'Forbidden',
  [HTTP_STATUS.NOT_FOUND]: 'Not Found',
  [HTTP_STATUS.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [HTTP_STATUS.NOT_ACCEPTABLE]: 'Not Acceptable',
  [HTTP_STATUS.PROXY_AUTHENTICATION_REQUIRED]: 'Proxy Authentication Required',
  [HTTP_STATUS.REQUEST_TIMEOUT]: 'Request Timeout',
  [HTTP_STATUS.CONFLICT]: 'Conflict',
  [HTTP_STATUS.GONE]: 'Gone',
  [HTTP_STATUS.LENGTH_REQUIRED]: 'Length Required',
  [HTTP_STATUS.PRECONDITION_FAILED]: 'Precondition Failed',
  [HTTP_STATUS.PAYLOAD_TOO_LARGE]: 'Payload Too Large',
  [HTTP_STATUS.URI_TOO_LONG]: 'URI Too Long',
  [HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported Media Type',
  [HTTP_STATUS.RANGE_NOT_SATISFIABLE]: 'Range Not Satisfiable',
  [HTTP_STATUS.EXPECTATION_FAILED]: 'Expectation Failed',
  [HTTP_STATUS.IM_A_TEAPOT]: "I'm a teapot",
  [HTTP_STATUS.MISDIRECTED_REQUEST]: 'Misdirected Request',
  [HTTP_STATUS.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HTTP_STATUS.LOCKED]: 'Locked',
  [HTTP_STATUS.FAILED_DEPENDENCY]: 'Failed Dependency',
  [HTTP_STATUS.TOO_EARLY]: 'Too Early',
  [HTTP_STATUS.UPGRADE_REQUIRED]: 'Upgrade Required',
  [HTTP_STATUS.PRECONDITION_REQUIRED]: 'Precondition Required',
  [HTTP_STATUS.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HTTP_STATUS.REQUEST_HEADER_FIELDS_TOO_LARGE]: 'Request Header Fields Too Large',
  [HTTP_STATUS.UNAVAILABLE_FOR_LEGAL_REASONS]: 'Unavailable For Legal Reasons',

  // 5xx Server Error
  [HTTP_STATUS.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HTTP_STATUS.NOT_IMPLEMENTED]: 'Not Implemented',
  [HTTP_STATUS.BAD_GATEWAY]: 'Bad Gateway',
  [HTTP_STATUS.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HTTP_STATUS.GATEWAY_TIMEOUT]: 'Gateway Timeout',
  [HTTP_STATUS.HTTP_VERSION_NOT_SUPPORTED]: 'HTTP Version Not Supported',
  [HTTP_STATUS.VARIANT_ALSO_NEGOTIATES]: 'Variant Also Negotiates',
  [HTTP_STATUS.INSUFFICIENT_STORAGE]: 'Insufficient Storage',
  [HTTP_STATUS.LOOP_DETECTED]: 'Loop Detected',
  [HTTP_STATUS.NOT_EXTENDED]: 'Not Extended',
  [HTTP_STATUS.NETWORK_AUTHENTICATION_REQUIRED]: 'Network Authentication Required'
});

/**
 * Response status types
 * @namespace RESPONSE_STATUS
 */
const RESPONSE_STATUS = Object.freeze({
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
});

/**
 * API response status codes
 * @namespace API_STATUS
 */
const API_STATUS = Object.freeze({
  // Success codes
  SUCCESS: 'API_SUCCESS',
  CREATED: 'API_CREATED',
  UPDATED: 'API_UPDATED',
  DELETED: 'API_DELETED',
  ACCEPTED: 'API_ACCEPTED',
  
  // Error codes
  ERROR: 'API_ERROR',
  VALIDATION_ERROR: 'API_VALIDATION_ERROR',
  AUTH_ERROR: 'API_AUTH_ERROR',
  NOT_FOUND: 'API_NOT_FOUND',
  CONFLICT: 'API_CONFLICT',
  
  // Processing codes
  PROCESSING: 'API_PROCESSING',
  PENDING: 'API_PENDING',
  QUEUED: 'API_QUEUED',
  
  // Rate limiting
  RATE_LIMITED: 'API_RATE_LIMITED',
  QUOTA_EXCEEDED: 'API_QUOTA_EXCEEDED'
});

/**
 * Platform mode descriptions
 * @namespace PLATFORM_MODE_DESCRIPTIONS
 */
const PLATFORM_MODE_DESCRIPTIONS = Object.freeze({
  [PLATFORM_MODES.NORMAL]: 'Normal operation with all features available',
  [PLATFORM_MODES.MAINTENANCE]: 'Maintenance mode - limited access for updates',
  [PLATFORM_MODES.READ_ONLY]: 'Read-only mode - no data modifications allowed',
  [PLATFORM_MODES.EMERGENCY]: 'Emergency mode - critical operations only',
  [PLATFORM_MODES.DEGRADED]: 'Degraded performance - some features may be limited',
  [PLATFORM_MODES.SETUP]: 'Initial setup mode - platform configuration in progress',
  [PLATFORM_MODES.MIGRATION]: 'Data migration in progress',
  [PLATFORM_MODES.SCALING]: 'Scaling operations in progress'
});

/**
 * Get status category from code
 * @param {number} statusCode - HTTP status code
 * @returns {string} Status category
 */
const getStatusCategory = (statusCode) => {
  if (statusCode >= 100 && statusCode < 200) {
    return STATUS_CATEGORIES.INFORMATIONAL;
  } else if (statusCode >= 200 && statusCode < 300) {
    return STATUS_CATEGORIES.SUCCESS;
  } else if (statusCode >= 300 && statusCode < 400) {
    return STATUS_CATEGORIES.REDIRECTION;
  } else if (statusCode >= 400 && statusCode < 500) {
    return STATUS_CATEGORIES.CLIENT_ERROR;
  } else if (statusCode >= 500 && statusCode < 600) {
    return STATUS_CATEGORIES.SERVER_ERROR;
  }
  return 'unknown';
};

/**
 * Check if status code is successful
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if successful
 */
const isSuccessStatus = (statusCode) => {
  return statusCode >= 200 && statusCode < 300;
};

/**
 * Check if status code is an error
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if error
 */
const isErrorStatus = (statusCode) => {
  return statusCode >= 400 && statusCode < 600;
};

/**
 * Check if status code is client error
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if client error
 */
const isClientError = (statusCode) => {
  return statusCode >= 400 && statusCode < 500;
};

/**
 * Check if status code is server error
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if server error
 */
const isServerError = (statusCode) => {
  return statusCode >= 500 && statusCode < 600;
};

/**
 * Get status message
 * @param {number} statusCode - HTTP status code
 * @returns {string} Status message
 */
const getStatusMessage = (statusCode) => {
  return STATUS_MESSAGES[statusCode] || 'Unknown Status';
};

/**
 * Get platform mode description
 * @param {string} mode - Platform mode
 * @returns {string} Mode description
 */
const getPlatformModeDescription = (mode) => {
  return PLATFORM_MODE_DESCRIPTIONS[mode] || 'Unknown platform mode';
};

/**
 * Check if platform mode allows write operations
 * @param {string} mode - Platform mode
 * @returns {boolean} True if write operations are allowed
 */
const allowsWriteOperations = (mode) => {
  const readOnlyModes = [
    PLATFORM_MODES.READ_ONLY,
    PLATFORM_MODES.MAINTENANCE,
    PLATFORM_MODES.MIGRATION
  ];
  return !readOnlyModes.includes(mode);
};

/**
 * Check if platform mode allows user access
 * @param {string} mode - Platform mode
 * @returns {boolean} True if user access is allowed
 */
const allowsUserAccess = (mode) => {
  const restrictedModes = [
    PLATFORM_MODES.MAINTENANCE,
    PLATFORM_MODES.EMERGENCY,
    PLATFORM_MODES.SETUP,
    PLATFORM_MODES.MIGRATION
  ];
  return !restrictedModes.includes(mode);
};

/**
 * Create standard API response format
 * @param {string} status - Response status
 * @param {*} data - Response data
 * @param {string} [message] - Optional message
 * @param {Object} [meta] - Optional metadata
 * @returns {Object} Formatted response
 */
const createApiResponse = (status, data = null, message = null, meta = null) => {
  const response = {
    status,
    timestamp: new Date().toISOString()
  };

  if (message) {
    response.message = message;
  }

  if (data !== null) {
    response.data = data;
  }

  if (meta !== null) {
    response.meta = meta;
  }

  return response;
};

/**
 * Create success response
 * @param {*} data - Response data
 * @param {string} [message] - Success message
 * @param {Object} [meta] - Optional metadata
 * @returns {Object} Success response
 */
const successResponse = (data, message = 'Success', meta = null) => {
  return createApiResponse(RESPONSE_STATUS.SUCCESS, data, message, meta);
};

/**
 * Create error response
 * @param {string} message - Error message
 * @param {string} [code] - Error code
 * @param {*} [details] - Error details
 * @returns {Object} Error response
 */
const errorResponse = (message, code = null, details = null) => {
  const error = { message };
  
  if (code) {
    error.code = code;
  }
  
  if (details) {
    error.details = details;
  }

  return createApiResponse(RESPONSE_STATUS.ERROR, null, message, { error });
};

// Export all constants and utilities
module.exports = Object.freeze({
  HTTP_STATUS,
  STATUS_CATEGORIES,
  STATUS_MESSAGES,
  RESPONSE_STATUS,
  API_STATUS,
  PLATFORM_MODES,
  PLATFORM_STATUS,
  HEALTH_STATUS,
  PLATFORM_MODE_DESCRIPTIONS,
  
  // Utility functions
  getStatusCategory,
  isSuccessStatus,
  isErrorStatus,
  isClientError,
  isServerError,
  getStatusMessage,
  getPlatformModeDescription,
  allowsWriteOperations,
  allowsUserAccess,
  createApiResponse,
  successResponse,
  errorResponse
});