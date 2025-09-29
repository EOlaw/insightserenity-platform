'use strict';

/**
 * @fileoverview HTTP status codes constants
 * @module shared/lib/utils/constants/status-codes
 */

/**
 * HTTP Status Codes
 * @const {Object}
 */
const StatusCodes = Object.freeze({
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

  // 4xx Client Errors
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

  // 5xx Server Errors
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
 * Status text messages
 * @const {Object}
 */
const StatusTexts = Object.freeze({
  // 1xx
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',

  // 2xx
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',

  // 3xx
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',

  // 4xx
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',

  // 5xx
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required'
});

/**
 * @class StatusCodeHelper
 * @description Helper methods for HTTP status codes
 */
class StatusCodeHelper {
  /**
   * Get status text by code
   * @static
   * @param {number} code - Status code
   * @returns {string} Status text
   */
  static getStatusText(code) {
    return StatusTexts[code] || 'Unknown Status';
  }

  /**
   * Check if status is informational (1xx)
   * @static
   * @param {number} code - Status code
   * @returns {boolean} True if informational
   */
  static isInformational(code) {
    return code >= 100 && code < 200;
  }

  /**
   * Check if status is success (2xx)
   * @static
   * @param {number} code - Status code
   * @returns {boolean} True if success
   */
  static isSuccess(code) {
    return code >= 200 && code < 300;
  }

  /**
   * Check if status is redirection (3xx)
   * @static
   * @param {number} code - Status code
   * @returns {boolean} True if redirection
   */
  static isRedirection(code) {
    return code >= 300 && code < 400;
  }

  /**
   * Check if status is client error (4xx)
   * @static
   * @param {number} code - Status code
   * @returns {boolean} True if client error
   */
  static isClientError(code) {
    return code >= 400 && code < 500;
  }

  /**
   * Check if status is server error (5xx)
   * @static
   * @param {number} code - Status code
   * @returns {boolean} True if server error
   */
  static isServerError(code) {
    return code >= 500 && code < 600;
  }

  /**
   * Check if status is error (4xx or 5xx)
   * @static
   * @param {number} code - Status code
   * @returns {boolean} True if error
   */
  static isError(code) {
    return this.isClientError(code) || this.isServerError(code);
  }

  /**
   * Check if status is retryable
   * @static
   * @param {number} code - Status code
   * @returns {boolean} True if retryable
   */
  static isRetryable(code) {
    const retryableCodes = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ];

    return retryableCodes.includes(code);
  }

  /**
   * Get status category
   * @static
   * @param {number} code - Status code
   * @returns {string} Status category
   */
  static getCategory(code) {
    if (this.isInformational(code)) return 'Informational';
    if (this.isSuccess(code)) return 'Success';
    if (this.isRedirection(code)) return 'Redirection';
    if (this.isClientError(code)) return 'Client Error';
    if (this.isServerError(code)) return 'Server Error';
    return 'Unknown';
  }

  /**
   * Create status response object
   * @static
   * @param {number} code - Status code
   * @param {Object} [data={}] - Additional data
   * @returns {Object} Status response
   */
  static createResponse(code, data = {}) {
    return {
      statusCode: code,
      statusText: this.getStatusText(code),
      category: this.getCategory(code),
      success: this.isSuccess(code),
      error: this.isError(code),
      timestamp: new Date().toISOString(),
      ...data
    };
  }

  /**
   * Get appropriate status code for operation
   * @static
   * @param {string} operation - Operation type
   * @param {boolean} success - Operation success
   * @returns {number} Status code
   */
  static getOperationStatus(operation, success = true) {
    const operationMap = {
      // Success cases
      create: { success: 201, failure: 400 },
      read: { success: 200, failure: 404 },
      update: { success: 200, failure: 400 },
      delete: { success: 204, failure: 404 },
      list: { success: 200, failure: 400 },
      search: { success: 200, failure: 400 },
      upload: { success: 201, failure: 400 },
      download: { success: 200, failure: 404 },
      login: { success: 200, failure: 401 },
      logout: { success: 204, failure: 400 },
      validate: { success: 200, failure: 422 },
      process: { success: 202, failure: 400 }
    };

    const ops = operationMap[operation] || { success: 200, failure: 400 };
    return success ? ops.success : ops.failure;
  }
}

// Export both constants and helper
module.exports = StatusCodes;
module.exports.StatusTexts = StatusTexts;
module.exports.StatusCodeHelper = StatusCodeHelper;
