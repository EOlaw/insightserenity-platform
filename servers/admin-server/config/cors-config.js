/**
 * @fileoverview CORS Configuration for Admin Server
 * @module servers/admin-server/config/cors-config
 * @description Comprehensive CORS configuration with environment-based settings
 *              for cross-origin resource sharing, security, and request handling
 * @version 1.0.0
 * @author InsightSerenity Team
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');

const logger = getLogger({ serviceName: 'cors-config' });

/**
 * Parse comma-separated string into array
 * @param {string} value - Comma-separated string
 * @param {Array} defaultValue - Default value if empty
 * @returns {Array} Parsed array
 */
function parseArrayFromEnv(value, defaultValue = []) {
  if (!value || value.trim() === '') {
    return defaultValue;
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Parse boolean from environment variable
 * @param {string} value - String value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean
 */
function parseBooleanFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Parse integer from environment variable
 * @param {string} value - String value
 * @param {number} defaultValue - Default value
 * @returns {number} Parsed integer
 */
function parseIntFromEnv(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Check if origin matches pattern (supports wildcards)
 * @param {string} origin - Origin to check
 * @param {string} pattern - Pattern to match against
 * @returns {boolean} Whether origin matches pattern
 */
function matchesOriginPattern(origin, pattern) {
  if (!origin || !pattern) {
    return false;
  }

  // Convert pattern to regex (support * wildcard)
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(origin);
}

/**
 * Get CORS configuration from environment variables
 * @returns {Object} CORS configuration object
 */
function getCorsConfig() {
  const environment = process.env.NODE_ENV || 'development';

  // Parse environment variables
  const enabled = parseBooleanFromEnv(process.env.ENABLE_CORS, true);
  const origins = parseArrayFromEnv(process.env.CORS_ORIGINS, ['http://localhost:3000']);
  const methods = parseArrayFromEnv(process.env.CORS_METHODS, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
  const allowedHeaders = parseArrayFromEnv(
    process.env.CORS_ALLOWED_HEADERS,
    [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Tenant-ID',
      'X-API-Key',
      'Accept',
      'Origin',
      'X-Requested-With'
    ]
  );
  const exposedHeaders = parseArrayFromEnv(
    process.env.CORS_EXPOSED_HEADERS,
    [
      'X-Request-ID',
      'X-Total-Count',
      'X-Page',
      'X-Page-Size',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ]
  );
  const credentials = parseBooleanFromEnv(process.env.CORS_CREDENTIALS, true);
  const maxAge = parseIntFromEnv(process.env.CORS_MAX_AGE, 86400);
  const preflightContinue = parseBooleanFromEnv(process.env.CORS_PREFLIGHT_CONTINUE, false);
  const optionsSuccessStatus = parseIntFromEnv(process.env.CORS_OPTIONS_SUCCESS_STATUS, 204);
  const originPatterns = parseArrayFromEnv(process.env.CORS_ALLOW_ORIGIN_PATTERNS, []);
  const blockUnknownOrigins = parseBooleanFromEnv(process.env.CORS_BLOCK_UNKNOWN_ORIGINS, false);

  // Development mode settings
  const isDevelopment = environment === 'development';
  const allowAllOrigins = origins.includes('*');

  /**
   * Origin validation function
   * @param {string} origin - Request origin
   * @param {Function} callback - Callback function
   */
  const originValidator = (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) {
      logger.debug('CORS: No origin header, allowing request');
      return callback(null, true);
    }

    // Allow all origins if wildcard is specified
    if (allowAllOrigins) {
      logger.debug('CORS: Wildcard origin allowed', { origin });
      return callback(null, true);
    }

    // In development, be more permissive
    if (isDevelopment) {
      logger.debug('CORS: Development mode, allowing origin', { origin });
      return callback(null, true);
    }

    // Check if origin is in allowed list (exact match)
    if (origins.includes(origin)) {
      logger.debug('CORS: Origin allowed (exact match)', { origin });
      return callback(null, true);
    }

    // Check if origin matches any pattern
    if (originPatterns.length > 0) {
      const matchesPattern = originPatterns.some(pattern => matchesOriginPattern(origin, pattern));
      if (matchesPattern) {
        logger.debug('CORS: Origin allowed (pattern match)', { origin });
        return callback(null, true);
      }
    }

    // Origin not allowed
    if (blockUnknownOrigins) {
      logger.warn('CORS: Request blocked - origin not allowed', {
        origin,
        allowedOrigins: origins,
        environment
      });

      const error = new AppError(
        'Not allowed by CORS policy',
        403,
        'CORS_ORIGIN_NOT_ALLOWED'
      );
      return callback(error);
    }

    // Permissive mode - allow but log
    logger.warn('CORS: Unknown origin allowed (permissive mode)', { origin });
    return callback(null, true);
  };

  // Build CORS options
  const corsOptions = {
    origin: originValidator,
    methods,
    allowedHeaders,
    exposedHeaders,
    credentials,
    maxAge,
    preflightContinue,
    optionsSuccessStatus
  };

  // Log configuration in development
  if (isDevelopment) {
    logger.info('CORS configuration loaded', {
      enabled,
      originsCount: origins.length,
      allowAllOrigins,
      credentials,
      maxAge,
      methodsCount: methods.length,
      allowedHeadersCount: allowedHeaders.length,
      exposedHeadersCount: exposedHeaders.length,
      blockUnknownOrigins
    });
  }

  return {
    enabled,
    options: corsOptions,
    metadata: {
      origins,
      methods,
      allowedHeaders,
      exposedHeaders,
      credentials,
      maxAge,
      preflightContinue,
      optionsSuccessStatus,
      originPatterns,
      blockUnknownOrigins,
      environment,
      isDevelopment,
      allowAllOrigins
    }
  };
}

/**
 * Get CORS middleware options
 * @returns {Object} CORS middleware options
 */
function getCorsOptions() {
  const config = getCorsConfig();
  return config.options;
}

/**
 * Check if CORS is enabled
 * @returns {boolean} Whether CORS is enabled
 */
function isCorsEnabled() {
  return parseBooleanFromEnv(process.env.ENABLE_CORS, true);
}

/**
 * Get CORS metadata
 * @returns {Object} CORS configuration metadata
 */
function getCorsMetadata() {
  const config = getCorsConfig();
  return config.metadata;
}

/**
 * Validate CORS configuration
 * @throws {Error} If configuration is invalid
 */
function validateCorsConfig() {
  const config = getCorsConfig();
  const { metadata } = config;

  // Validate required fields
  if (!metadata.origins || metadata.origins.length === 0) {
    throw new Error('CORS_ORIGINS must be specified');
  }

  if (!metadata.methods || metadata.methods.length === 0) {
    throw new Error('CORS_METHODS must be specified');
  }

  // Validate maxAge
  if (metadata.maxAge < 0) {
    throw new Error('CORS_MAX_AGE must be a positive number');
  }

  // Validate optionsSuccessStatus
  if (metadata.optionsSuccessStatus < 200 || metadata.optionsSuccessStatus > 299) {
    throw new Error('CORS_OPTIONS_SUCCESS_STATUS must be a valid 2xx status code');
  }

  // Security warnings
  if (metadata.allowAllOrigins && !metadata.isDevelopment) {
    logger.warn('CORS: Wildcard origin (*) detected in production environment - security risk!', {
      environment: metadata.environment
    });
  }

  if (!metadata.blockUnknownOrigins && !metadata.isDevelopment) {
    logger.warn('CORS: Unknown origins are allowed in production - consider enabling CORS_BLOCK_UNKNOWN_ORIGINS', {
      environment: metadata.environment
    });
  }

  if (metadata.credentials && metadata.allowAllOrigins) {
    logger.error('CORS: Cannot use credentials with wildcard origin - this is a security violation');
    throw new Error('Cannot enable credentials when allowing all origins (*)');
  }

  logger.info('CORS configuration validated successfully', {
    environment: metadata.environment,
    originsCount: metadata.origins.length,
    blockUnknownOrigins: metadata.blockUnknownOrigins
  });
}

// Export configuration
module.exports = {
  getCorsConfig,
  getCorsOptions,
  isCorsEnabled,
  getCorsMetadata,
  validateCorsConfig
};
