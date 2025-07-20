'use strict';

/**
 * @fileoverview Application error codes for consistent error handling
 * @module shared/lib/utils/constants/error-codes
 */

/**
 * Error code categories and their specific codes
 * @namespace ERROR_CODES
 */
const ERROR_CODES = Object.freeze({
  // Authentication Errors (1000-1099)
  AUTH: Object.freeze({
    INVALID_CREDENTIALS: 'AUTH_1001',
    TOKEN_EXPIRED: 'AUTH_1002',
    TOKEN_INVALID: 'AUTH_1003',
    UNAUTHORIZED: 'AUTH_1004',
    SESSION_EXPIRED: 'AUTH_1005',
    INSUFFICIENT_PERMISSIONS: 'AUTH_1006',
    ACCOUNT_LOCKED: 'AUTH_1007',
    ACCOUNT_SUSPENDED: 'AUTH_1008',
    TWO_FACTOR_REQUIRED: 'AUTH_1009',
    TWO_FACTOR_INVALID: 'AUTH_1010',
    API_KEY_INVALID: 'AUTH_1011',
    API_KEY_EXPIRED: 'AUTH_1012',
    PASSKEY_INVALID: 'AUTH_1013',
    OAUTH_ERROR: 'AUTH_1014',
    REFRESH_TOKEN_INVALID: 'AUTH_1015'
  }),

  // Validation Errors (2000-2099)
  VALIDATION: Object.freeze({
    REQUIRED_FIELD: 'VAL_2001',
    INVALID_FORMAT: 'VAL_2002',
    INVALID_EMAIL: 'VAL_2003',
    INVALID_PHONE: 'VAL_2004',
    INVALID_URL: 'VAL_2005',
    INVALID_DATE: 'VAL_2006',
    INVALID_RANGE: 'VAL_2007',
    INVALID_LENGTH: 'VAL_2008',
    INVALID_TYPE: 'VAL_2009',
    DUPLICATE_VALUE: 'VAL_2010',
    INVALID_ENUM_VALUE: 'VAL_2011',
    INVALID_JSON: 'VAL_2012',
    INVALID_REGEX: 'VAL_2013',
    INVALID_FILE_TYPE: 'VAL_2014',
    FILE_TOO_LARGE: 'VAL_2015'
  }),

  // Database Errors (3000-3099)
  DATABASE: Object.freeze({
    CONNECTION_ERROR: 'DB_3001',
    QUERY_ERROR: 'DB_3002',
    TRANSACTION_ERROR: 'DB_3003',
    DUPLICATE_ENTRY: 'DB_3004',
    RECORD_NOT_FOUND: 'DB_3005',
    CONSTRAINT_VIOLATION: 'DB_3006',
    TIMEOUT: 'DB_3007',
    MIGRATION_ERROR: 'DB_3008',
    SEEDING_ERROR: 'DB_3009',
    INDEX_ERROR: 'DB_3010',
    REPLICATION_ERROR: 'DB_3011',
    BACKUP_ERROR: 'DB_3012'
  }),

  // Business Logic Errors (4000-4099)
  BUSINESS: Object.freeze({
    // Organization errors
    ORGANIZATION_NOT_FOUND: 'BIZ_4001',
    ORGANIZATION_LIMIT_REACHED: 'BIZ_4002',
    ORGANIZATION_SUSPENDED: 'BIZ_4003',
    ORGANIZATION_EXPIRED: 'BIZ_4004',
    
    // Tenant errors
    TENANT_NOT_FOUND: 'BIZ_4010',
    TENANT_LIMIT_REACHED: 'BIZ_4011',
    TENANT_INACTIVE: 'BIZ_4012',
    TENANT_ISOLATION_ERROR: 'BIZ_4013',
    
    // User errors
    USER_NOT_FOUND: 'BIZ_4020',
    USER_ALREADY_EXISTS: 'BIZ_4021',
    USER_INACTIVE: 'BIZ_4022',
    USER_LIMIT_REACHED: 'BIZ_4023',
    
    // Subscription errors
    SUBSCRIPTION_EXPIRED: 'BIZ_4030',
    SUBSCRIPTION_LIMIT_REACHED: 'BIZ_4031',
    SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED: 'BIZ_4032',
    PAYMENT_REQUIRED: 'BIZ_4033',
    
    // Project errors
    PROJECT_NOT_FOUND: 'BIZ_4040',
    PROJECT_ACCESS_DENIED: 'BIZ_4041',
    PROJECT_ARCHIVED: 'BIZ_4042',
    
    // Job errors
    JOB_NOT_FOUND: 'BIZ_4050',
    JOB_EXPIRED: 'BIZ_4051',
    JOB_CLOSED: 'BIZ_4052',
    
    // Application errors
    APPLICATION_NOT_FOUND: 'BIZ_4060',
    APPLICATION_ALREADY_EXISTS: 'BIZ_4061',
    APPLICATION_CLOSED: 'BIZ_4062'
  }),

  // External Service Errors (5000-5099)
  EXTERNAL: Object.freeze({
    API_ERROR: 'EXT_5001',
    API_TIMEOUT: 'EXT_5002',
    API_RATE_LIMIT: 'EXT_5003',
    PAYMENT_GATEWAY_ERROR: 'EXT_5004',
    EMAIL_SERVICE_ERROR: 'EXT_5005',
    SMS_SERVICE_ERROR: 'EXT_5006',
    STORAGE_SERVICE_ERROR: 'EXT_5007',
    OAUTH_PROVIDER_ERROR: 'EXT_5008',
    WEBHOOK_ERROR: 'EXT_5009',
    THIRD_PARTY_ERROR: 'EXT_5010'
  }),

  // System Errors (6000-6099)
  SYSTEM: Object.freeze({
    INTERNAL_ERROR: 'SYS_6001',
    CONFIGURATION_ERROR: 'SYS_6002',
    INITIALIZATION_ERROR: 'SYS_6003',
    SHUTDOWN_ERROR: 'SYS_6004',
    MEMORY_ERROR: 'SYS_6005',
    DISK_ERROR: 'SYS_6006',
    NETWORK_ERROR: 'SYS_6007',
    PERMISSION_DENIED: 'SYS_6008',
    RESOURCE_EXHAUSTED: 'SYS_6009',
    SERVICE_UNAVAILABLE: 'SYS_6010',
    MAINTENANCE_MODE: 'SYS_6011'
  }),

  // Security Errors (7000-7099)
  SECURITY: Object.freeze({
    ACCESS_DENIED: 'SEC_7001',
    CSRF_TOKEN_INVALID: 'SEC_7002',
    SUSPICIOUS_ACTIVITY: 'SEC_7003',
    IP_BLOCKED: 'SEC_7004',
    RATE_LIMIT_EXCEEDED: 'SEC_7005',
    ENCRYPTION_ERROR: 'SEC_7006',
    DECRYPTION_ERROR: 'SEC_7007',
    CERTIFICATE_ERROR: 'SEC_7008',
    SECURITY_VIOLATION: 'SEC_7009',
    BRUTE_FORCE_DETECTED: 'SEC_7010'
  })
});

/**
 * Error messages mapping
 * @namespace ERROR_MESSAGES
 */
const ERROR_MESSAGES = Object.freeze({
  // Authentication messages
  [ERROR_CODES.AUTH.INVALID_CREDENTIALS]: 'Invalid username or password',
  [ERROR_CODES.AUTH.TOKEN_EXPIRED]: 'Authentication token has expired',
  [ERROR_CODES.AUTH.TOKEN_INVALID]: 'Invalid authentication token',
  [ERROR_CODES.AUTH.UNAUTHORIZED]: 'Unauthorized access',
  [ERROR_CODES.AUTH.SESSION_EXPIRED]: 'Your session has expired',
  [ERROR_CODES.AUTH.INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions for this action',
  [ERROR_CODES.AUTH.ACCOUNT_LOCKED]: 'Account is locked due to multiple failed login attempts',
  [ERROR_CODES.AUTH.ACCOUNT_SUSPENDED]: 'Account has been suspended',
  [ERROR_CODES.AUTH.TWO_FACTOR_REQUIRED]: 'Two-factor authentication is required',
  [ERROR_CODES.AUTH.TWO_FACTOR_INVALID]: 'Invalid two-factor authentication code',
  [ERROR_CODES.AUTH.API_KEY_INVALID]: 'Invalid API key',
  [ERROR_CODES.AUTH.API_KEY_EXPIRED]: 'API key has expired',
  [ERROR_CODES.AUTH.PASSKEY_INVALID]: 'Invalid passkey authentication',
  [ERROR_CODES.AUTH.OAUTH_ERROR]: 'OAuth authentication failed',
  [ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID]: 'Invalid refresh token',

  // Validation messages
  [ERROR_CODES.VALIDATION.REQUIRED_FIELD]: 'Required field is missing',
  [ERROR_CODES.VALIDATION.INVALID_FORMAT]: 'Invalid format',
  [ERROR_CODES.VALIDATION.INVALID_EMAIL]: 'Invalid email address',
  [ERROR_CODES.VALIDATION.INVALID_PHONE]: 'Invalid phone number',
  [ERROR_CODES.VALIDATION.INVALID_URL]: 'Invalid URL format',
  [ERROR_CODES.VALIDATION.INVALID_DATE]: 'Invalid date format',
  [ERROR_CODES.VALIDATION.INVALID_RANGE]: 'Value is outside the valid range',
  [ERROR_CODES.VALIDATION.INVALID_LENGTH]: 'Invalid length',
  [ERROR_CODES.VALIDATION.INVALID_TYPE]: 'Invalid data type',
  [ERROR_CODES.VALIDATION.DUPLICATE_VALUE]: 'Duplicate value not allowed',
  [ERROR_CODES.VALIDATION.INVALID_ENUM_VALUE]: 'Invalid enum value',
  [ERROR_CODES.VALIDATION.INVALID_JSON]: 'Invalid JSON format',
  [ERROR_CODES.VALIDATION.INVALID_REGEX]: 'Value does not match required pattern',
  [ERROR_CODES.VALIDATION.INVALID_FILE_TYPE]: 'Invalid file type',
  [ERROR_CODES.VALIDATION.FILE_TOO_LARGE]: 'File size exceeds maximum limit',

  // Database messages
  [ERROR_CODES.DATABASE.CONNECTION_ERROR]: 'Database connection error',
  [ERROR_CODES.DATABASE.QUERY_ERROR]: 'Database query error',
  [ERROR_CODES.DATABASE.TRANSACTION_ERROR]: 'Database transaction failed',
  [ERROR_CODES.DATABASE.DUPLICATE_ENTRY]: 'Duplicate entry exists',
  [ERROR_CODES.DATABASE.RECORD_NOT_FOUND]: 'Record not found',
  [ERROR_CODES.DATABASE.CONSTRAINT_VIOLATION]: 'Database constraint violation',
  [ERROR_CODES.DATABASE.TIMEOUT]: 'Database operation timeout',
  [ERROR_CODES.DATABASE.MIGRATION_ERROR]: 'Database migration failed',
  [ERROR_CODES.DATABASE.SEEDING_ERROR]: 'Database seeding failed',
  [ERROR_CODES.DATABASE.INDEX_ERROR]: 'Database index error',
  [ERROR_CODES.DATABASE.REPLICATION_ERROR]: 'Database replication error',
  [ERROR_CODES.DATABASE.BACKUP_ERROR]: 'Database backup failed',

  // Business logic messages
  [ERROR_CODES.BUSINESS.ORGANIZATION_NOT_FOUND]: 'Organization not found',
  [ERROR_CODES.BUSINESS.ORGANIZATION_LIMIT_REACHED]: 'Organization limit reached',
  [ERROR_CODES.BUSINESS.ORGANIZATION_SUSPENDED]: 'Organization is suspended',
  [ERROR_CODES.BUSINESS.ORGANIZATION_EXPIRED]: 'Organization subscription has expired',
  [ERROR_CODES.BUSINESS.TENANT_NOT_FOUND]: 'Tenant not found',
  [ERROR_CODES.BUSINESS.TENANT_LIMIT_REACHED]: 'Tenant limit reached',
  [ERROR_CODES.BUSINESS.TENANT_INACTIVE]: 'Tenant is inactive',
  [ERROR_CODES.BUSINESS.TENANT_ISOLATION_ERROR]: 'Tenant isolation error',
  [ERROR_CODES.BUSINESS.USER_NOT_FOUND]: 'User not found',
  [ERROR_CODES.BUSINESS.USER_ALREADY_EXISTS]: 'User already exists',
  [ERROR_CODES.BUSINESS.USER_INACTIVE]: 'User is inactive',
  [ERROR_CODES.BUSINESS.USER_LIMIT_REACHED]: 'User limit reached',
  [ERROR_CODES.BUSINESS.SUBSCRIPTION_EXPIRED]: 'Subscription has expired',
  [ERROR_CODES.BUSINESS.SUBSCRIPTION_LIMIT_REACHED]: 'Subscription limit reached',
  [ERROR_CODES.BUSINESS.SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED]: 'Subscription downgrade not allowed',
  [ERROR_CODES.BUSINESS.PAYMENT_REQUIRED]: 'Payment required',
  [ERROR_CODES.BUSINESS.PROJECT_NOT_FOUND]: 'Project not found',
  [ERROR_CODES.BUSINESS.PROJECT_ACCESS_DENIED]: 'Project access denied',
  [ERROR_CODES.BUSINESS.PROJECT_ARCHIVED]: 'Project is archived',
  [ERROR_CODES.BUSINESS.JOB_NOT_FOUND]: 'Job not found',
  [ERROR_CODES.BUSINESS.JOB_EXPIRED]: 'Job posting has expired',
  [ERROR_CODES.BUSINESS.JOB_CLOSED]: 'Job is closed',
  [ERROR_CODES.BUSINESS.APPLICATION_NOT_FOUND]: 'Application not found',
  [ERROR_CODES.BUSINESS.APPLICATION_ALREADY_EXISTS]: 'Application already exists',
  [ERROR_CODES.BUSINESS.APPLICATION_CLOSED]: 'Application is closed',

  // External service messages
  [ERROR_CODES.EXTERNAL.API_ERROR]: 'External API error',
  [ERROR_CODES.EXTERNAL.API_TIMEOUT]: 'External API timeout',
  [ERROR_CODES.EXTERNAL.API_RATE_LIMIT]: 'External API rate limit exceeded',
  [ERROR_CODES.EXTERNAL.PAYMENT_GATEWAY_ERROR]: 'Payment gateway error',
  [ERROR_CODES.EXTERNAL.EMAIL_SERVICE_ERROR]: 'Email service error',
  [ERROR_CODES.EXTERNAL.SMS_SERVICE_ERROR]: 'SMS service error',
  [ERROR_CODES.EXTERNAL.STORAGE_SERVICE_ERROR]: 'Storage service error',
  [ERROR_CODES.EXTERNAL.OAUTH_PROVIDER_ERROR]: 'OAuth provider error',
  [ERROR_CODES.EXTERNAL.WEBHOOK_ERROR]: 'Webhook delivery failed',
  [ERROR_CODES.EXTERNAL.THIRD_PARTY_ERROR]: 'Third party service error',

  // System messages
  [ERROR_CODES.SYSTEM.INTERNAL_ERROR]: 'Internal server error',
  [ERROR_CODES.SYSTEM.CONFIGURATION_ERROR]: 'System configuration error',
  [ERROR_CODES.SYSTEM.INITIALIZATION_ERROR]: 'System initialization failed',
  [ERROR_CODES.SYSTEM.SHUTDOWN_ERROR]: 'System shutdown error',
  [ERROR_CODES.SYSTEM.MEMORY_ERROR]: 'Memory allocation error',
  [ERROR_CODES.SYSTEM.DISK_ERROR]: 'Disk operation error',
  [ERROR_CODES.SYSTEM.NETWORK_ERROR]: 'Network error',
  [ERROR_CODES.SYSTEM.PERMISSION_DENIED]: 'System permission denied',
  [ERROR_CODES.SYSTEM.RESOURCE_EXHAUSTED]: 'System resources exhausted',
  [ERROR_CODES.SYSTEM.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
  [ERROR_CODES.SYSTEM.MAINTENANCE_MODE]: 'System is under maintenance',

  // Security messages
  [ERROR_CODES.SECURITY.ACCESS_DENIED]: 'Access denied',
  [ERROR_CODES.SECURITY.CSRF_TOKEN_INVALID]: 'Invalid CSRF token',
  [ERROR_CODES.SECURITY.SUSPICIOUS_ACTIVITY]: 'Suspicious activity detected',
  [ERROR_CODES.SECURITY.IP_BLOCKED]: 'IP address is blocked',
  [ERROR_CODES.SECURITY.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
  [ERROR_CODES.SECURITY.ENCRYPTION_ERROR]: 'Encryption error',
  [ERROR_CODES.SECURITY.DECRYPTION_ERROR]: 'Decryption error',
  [ERROR_CODES.SECURITY.CERTIFICATE_ERROR]: 'Certificate validation error',
  [ERROR_CODES.SECURITY.SECURITY_VIOLATION]: 'Security violation detected',
  [ERROR_CODES.SECURITY.BRUTE_FORCE_DETECTED]: 'Brute force attack detected'
});

/**
 * Get error message by code
 * @param {string} errorCode - The error code
 * @param {string} [customMessage] - Optional custom message
 * @returns {string} The error message
 */
const getErrorMessage = (errorCode, customMessage) => {
  return customMessage || ERROR_MESSAGES[errorCode] || 'An error occurred';
};

/**
 * Check if error code exists
 * @param {string} errorCode - The error code to check
 * @returns {boolean} True if error code exists
 */
const isValidErrorCode = (errorCode) => {
  return Object.values(ERROR_CODES).some(category => 
    Object.values(category).includes(errorCode)
  );
};

// Export error codes and utilities
module.exports = Object.freeze({
  ERROR_CODES,
  ERROR_MESSAGES,
  getErrorMessage,
  isValidErrorCode
});