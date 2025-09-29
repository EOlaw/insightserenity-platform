'use strict';

/**
 * @fileoverview Error codes constants for the platform
 * @module shared/lib/utils/constants/error-codes
 */

/**
 * Error codes organized by category
 * @const {Object}
 */
const ErrorCodes = Object.freeze({
  // Authentication Errors (1000-1099)
  AUTH_FAILED: 'AUTH_1000',
  INVALID_CREDENTIALS: 'AUTH_1001',
  TOKEN_EXPIRED: 'AUTH_1002',
  TOKEN_INVALID: 'AUTH_1003',
  UNAUTHORIZED: 'AUTH_1004',
  SESSION_EXPIRED: 'AUTH_1005',
  SESSION_INVALID: 'AUTH_1006',
  MFA_REQUIRED: 'AUTH_1007',
  MFA_FAILED: 'AUTH_1008',
  ACCOUNT_LOCKED: 'AUTH_1009',
  ACCOUNT_SUSPENDED: 'AUTH_1010',
  EMAIL_NOT_VERIFIED: 'AUTH_1011',
  PASSWORD_RESET_REQUIRED: 'AUTH_1012',
  PASSWORD_WEAK: 'AUTH_1013',
  PASSWORD_REUSED: 'AUTH_1014',

  // Authorization Errors (1100-1199)
  FORBIDDEN: 'AUTHZ_1100',
  INSUFFICIENT_PERMISSIONS: 'AUTHZ_1101',
  ROLE_NOT_ALLOWED: 'AUTHZ_1102',
  RESOURCE_ACCESS_DENIED: 'AUTHZ_1103',
  IP_NOT_WHITELISTED: 'AUTHZ_1104',
  TENANT_ACCESS_DENIED: 'AUTHZ_1105',
  ORGANIZATION_ACCESS_DENIED: 'AUTHZ_1106',

  // Validation Errors (2000-2099)
  VALIDATION_ERROR: 'VAL_2000',
  INVALID_INPUT: 'VAL_2001',
  MISSING_REQUIRED_FIELD: 'VAL_2002',
  INVALID_FORMAT: 'VAL_2003',
  VALUE_OUT_OF_RANGE: 'VAL_2004',
  DUPLICATE_VALUE: 'VAL_2005',
  INVALID_REFERENCE: 'VAL_2006',
  INVALID_STATE_TRANSITION: 'VAL_2007',
  INVALID_DATE_RANGE: 'VAL_2008',

  // Resource Errors (3000-3099)
  RESOURCE_NOT_FOUND: 'RES_3000',
  RESOURCE_ALREADY_EXISTS: 'RES_3001',
  RESOURCE_CONFLICT: 'RES_3002',
  RESOURCE_LOCKED: 'RES_3003',
  RESOURCE_DELETED: 'RES_3004',
  RESOURCE_EXPIRED: 'RES_3005',
  RESOURCE_LIMIT_EXCEEDED: 'RES_3006',
  RESOURCE_UNAVAILABLE: 'RES_3007',

  // Database Errors (4000-4099)
  DATABASE_ERROR: 'DB_4000',
  CONNECTION_ERROR: 'DB_4001',
  QUERY_ERROR: 'DB_4002',
  TRANSACTION_ERROR: 'DB_4003',
  CONSTRAINT_VIOLATION: 'DB_4004',
  DUPLICATE_KEY: 'DB_4005',
  DEADLOCK_DETECTED: 'DB_4006',
  TIMEOUT: 'DB_4007',

  // Business Logic Errors (5000-5099)
  BUSINESS_RULE_VIOLATION: 'BIZ_5000',
  INVALID_OPERATION: 'BIZ_5001',
  QUOTA_EXCEEDED: 'BIZ_5002',
  RATE_LIMIT_EXCEEDED: 'BIZ_5003',
  SUBSCRIPTION_REQUIRED: 'BIZ_5004',
  PAYMENT_REQUIRED: 'BIZ_5005',
  BILLING_ERROR: 'BIZ_5006',
  CONTRACT_VIOLATION: 'BIZ_5007',
  SLA_VIOLATION: 'BIZ_5008',

  // External Service Errors (6000-6099)
  EXTERNAL_SERVICE_ERROR: 'EXT_6000',
  API_ERROR: 'EXT_6001',
  THIRD_PARTY_ERROR: 'EXT_6002',
  INTEGRATION_ERROR: 'EXT_6003',
  WEBHOOK_ERROR: 'EXT_6004',
  PAYMENT_GATEWAY_ERROR: 'EXT_6005',
  EMAIL_SERVICE_ERROR: 'EXT_6006',
  SMS_SERVICE_ERROR: 'EXT_6007',

  // File Operation Errors (7000-7099)
  FILE_ERROR: 'FILE_7000',
  FILE_NOT_FOUND: 'FILE_7001',
  FILE_TOO_LARGE: 'FILE_7002',
  INVALID_FILE_TYPE: 'FILE_7003',
  FILE_UPLOAD_FAILED: 'FILE_7004',
  FILE_DOWNLOAD_FAILED: 'FILE_7005',
  FILE_PROCESSING_FAILED: 'FILE_7006',

  // Security Errors (8000-8099)
  SECURITY_ERROR: 'SEC_8000',
  CSRF_TOKEN_INVALID: 'SEC_8001',
  XSS_DETECTED: 'SEC_8002',
  SQL_INJECTION_DETECTED: 'SEC_8003',
  SUSPICIOUS_ACTIVITY: 'SEC_8004',
  ENCRYPTION_ERROR: 'SEC_8005',
  DECRYPTION_ERROR: 'SEC_8006',
  SIGNATURE_VERIFICATION_FAILED: 'SEC_8007',

  // System Errors (9000-9099)
  INTERNAL_ERROR: 'SYS_9000',
  SERVICE_UNAVAILABLE: 'SYS_9001',
  TIMEOUT: 'SYS_9002',
  NOT_IMPLEMENTED: 'SYS_9003',
  MAINTENANCE_MODE: 'SYS_9004',
  MEMORY_ERROR: 'SYS_9005',
  CONFIGURATION_ERROR: 'SYS_9006',
  INITIALIZATION_ERROR: 'SYS_9007'
});

/**
 * Error messages mapping
 * @const {Object}
 */
const ErrorMessages = Object.freeze({
  // Authentication
  AUTH_1000: 'Authentication failed',
  AUTH_1001: 'Invalid credentials provided',
  AUTH_1002: 'Token has expired',
  AUTH_1003: 'Invalid token',
  AUTH_1004: 'Unauthorized access',
  AUTH_1005: 'Session has expired',
  AUTH_1006: 'Invalid session',
  AUTH_1007: 'Multi-factor authentication required',
  AUTH_1008: 'Multi-factor authentication failed',
  AUTH_1009: 'Account is locked',
  AUTH_1010: 'Account is suspended',
  AUTH_1011: 'Email verification required',
  AUTH_1012: 'Password reset required',
  AUTH_1013: 'Password is too weak',
  AUTH_1014: 'Password has been used recently',

  // Authorization
  AUTHZ_1100: 'Access forbidden',
  AUTHZ_1101: 'Insufficient permissions',
  AUTHZ_1102: 'Role not allowed for this operation',
  AUTHZ_1103: 'Resource access denied',
  AUTHZ_1104: 'IP address not whitelisted',
  AUTHZ_1105: 'Tenant access denied',
  AUTHZ_1106: 'Organization access denied',

  // Validation
  VAL_2000: 'Validation error',
  VAL_2001: 'Invalid input provided',
  VAL_2002: 'Missing required field',
  VAL_2003: 'Invalid format',
  VAL_2004: 'Value out of acceptable range',
  VAL_2005: 'Duplicate value not allowed',
  VAL_2006: 'Invalid reference',
  VAL_2007: 'Invalid state transition',
  VAL_2008: 'Invalid date range',

  // Resource
  RES_3000: 'Resource not found',
  RES_3001: 'Resource already exists',
  RES_3002: 'Resource conflict',
  RES_3003: 'Resource is locked',
  RES_3004: 'Resource has been deleted',
  RES_3005: 'Resource has expired',
  RES_3006: 'Resource limit exceeded',
  RES_3007: 'Resource temporarily unavailable',

  // Database
  DB_4000: 'Database error occurred',
  DB_4001: 'Database connection error',
  DB_4002: 'Database query error',
  DB_4003: 'Database transaction error',
  DB_4004: 'Database constraint violation',
  DB_4005: 'Duplicate key error',
  DB_4006: 'Database deadlock detected',
  DB_4007: 'Database operation timeout',

  // Business Logic
  BIZ_5000: 'Business rule violation',
  BIZ_5001: 'Invalid operation',
  BIZ_5002: 'Quota exceeded',
  BIZ_5003: 'Rate limit exceeded',
  BIZ_5004: 'Subscription required',
  BIZ_5005: 'Payment required',
  BIZ_5006: 'Billing error',
  BIZ_5007: 'Contract violation',
  BIZ_5008: 'SLA violation',

  // External Service
  EXT_6000: 'External service error',
  EXT_6001: 'API error',
  EXT_6002: 'Third-party service error',
  EXT_6003: 'Integration error',
  EXT_6004: 'Webhook error',
  EXT_6005: 'Payment gateway error',
  EXT_6006: 'Email service error',
  EXT_6007: 'SMS service error',

  // File Operations
  FILE_7000: 'File operation error',
  FILE_7001: 'File not found',
  FILE_7002: 'File too large',
  FILE_7003: 'Invalid file type',
  FILE_7004: 'File upload failed',
  FILE_7005: 'File download failed',
  FILE_7006: 'File processing failed',

  // Security
  SEC_8000: 'Security error',
  SEC_8001: 'Invalid CSRF token',
  SEC_8002: 'XSS attack detected',
  SEC_8003: 'SQL injection detected',
  SEC_8004: 'Suspicious activity detected',
  SEC_8005: 'Encryption error',
  SEC_8006: 'Decryption error',
  SEC_8007: 'Signature verification failed',

  // System
  SYS_9000: 'Internal server error',
  SYS_9001: 'Service unavailable',
  SYS_9002: 'Operation timeout',
  SYS_9003: 'Feature not implemented',
  SYS_9004: 'System under maintenance',
  SYS_9005: 'Memory error',
  SYS_9006: 'Configuration error',
  SYS_9007: 'Initialization error'
});

/**
 * @class ErrorCodeHelper
 * @description Helper methods for error codes
 */
class ErrorCodeHelper {
  /**
   * Get error message by code
   * @static
   * @param {string} code - Error code
   * @returns {string} Error message
   */
  static getMessage(code) {
    return ErrorMessages[code] || 'Unknown error';
  }

  /**
   * Check if error is retryable
   * @static
   * @param {string} code - Error code
   * @returns {boolean} True if retryable
   */
  static isRetryable(code) {
    const retryableCodes = [
      'DB_4001', // Connection error
      'DB_4006', // Deadlock
      'DB_4007', // Timeout
      'SYS_9001', // Service unavailable
      'SYS_9002', // Timeout
      'EXT_6000', // External service error
      'BIZ_5003'  // Rate limit (after delay)
    ];

    return retryableCodes.includes(code);
  }

  /**
   * Get HTTP status code for error
   * @static
   * @param {string} code - Error code
   * @returns {number} HTTP status code
   */
  static getHttpStatus(code) {
    const statusMap = {
      // 400 Bad Request
      VAL_2000: 400, VAL_2001: 400, VAL_2002: 400, VAL_2003: 400,
      VAL_2004: 400, VAL_2005: 400, VAL_2006: 400, VAL_2007: 400,
      VAL_2008: 400, BIZ_5000: 400, BIZ_5001: 400,

      // 401 Unauthorized
      AUTH_1000: 401, AUTH_1001: 401, AUTH_1002: 401, AUTH_1003: 401,
      AUTH_1004: 401, AUTH_1005: 401, AUTH_1006: 401,

      // 403 Forbidden
      AUTHZ_1100: 403, AUTHZ_1101: 403, AUTHZ_1102: 403, AUTHZ_1103: 403,
      AUTHZ_1104: 403, AUTHZ_1105: 403, AUTHZ_1106: 403,
      AUTH_1009: 403, AUTH_1010: 403, AUTH_1011: 403,

      // 404 Not Found
      RES_3000: 404, FILE_7001: 404,

      // 409 Conflict
      RES_3001: 409, RES_3002: 409, DB_4005: 409,

      // 413 Payload Too Large
      FILE_7002: 413,

      // 422 Unprocessable Entity
      FILE_7003: 422,

      // 423 Locked
      RES_3003: 423,

      // 429 Too Many Requests
      BIZ_5003: 429,

      // 402 Payment Required
      BIZ_5004: 402, BIZ_5005: 402,

      // 503 Service Unavailable
      SYS_9001: 503, SYS_9004: 503, RES_3007: 503,

      // 504 Gateway Timeout
      SYS_9002: 504, DB_4007: 504,

      // 501 Not Implemented
      SYS_9003: 501,

      // 500 Internal Server Error (default)
      SYS_9000: 500
    };

    return statusMap[code] || 500;
  }

  /**
   * Get error category
   * @static
   * @param {string} code - Error code
   * @returns {string} Error category
   */
  static getCategory(code) {
    const prefix = code.split('_')[0];
    const categories = {
      AUTH: 'Authentication',
      AUTHZ: 'Authorization',
      VAL: 'Validation',
      RES: 'Resource',
      DB: 'Database',
      BIZ: 'Business Logic',
      EXT: 'External Service',
      FILE: 'File Operation',
      SEC: 'Security',
      SYS: 'System'
    };

    return categories[prefix] || 'Unknown';
  }

  /**
   * Create error object
   * @static
   * @param {string} code - Error code
   * @param {Object} [details={}] - Additional details
   * @returns {Object} Error object
   */
  static createError(code, details = {}) {
    return {
      code,
      message: this.getMessage(code),
      category: this.getCategory(code),
      httpStatus: this.getHttpStatus(code),
      retryable: this.isRetryable(code),
      timestamp: new Date().toISOString(),
      ...details
    };
  }
}

// Export both the constants and helper
module.exports = ErrorCodes;
module.exports.ErrorMessages = ErrorMessages;
module.exports.ErrorCodeHelper = ErrorCodeHelper;
