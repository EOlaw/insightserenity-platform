'use strict';

/**
 * @fileoverview Central middleware export aggregator for the InsightSerenity platform
 * @module shared/lib/middleware
 * @description Exports all middleware functions grouped by purpose for simplified registration
 */

// Security Middleware
const { HelmetConfig, getHelmetConfig } = require('./security/helmet-config');
const { SecurityHeaders, getSecurityHeaders } = require('./security/security-headers');
const { CSRFProtection, getCSRFProtection } = require('./security/csrf-protection');
const { XSSProtection, getXSSProtection } = require('./security/xss-protection');
const { SQLInjectionProtection, getSQLInjectionProtection } = require('./security/sql-injection-protection');
const { RequestSanitizer, getRequestSanitizer } = require('./security/request-sanitizer');
const { InputValidation, getInputValidation } = require('./security/input-validation');

// CORS Middleware
const { CorsConfig, getCorsConfig } = require('./cors-config');
const { CorsMiddleware, getCorsMiddleware } = require('./cors-middleware');

// Validation Middleware
const { RequestValidator, getRequestValidator } = require('./validation/request-validator');
const { SchemaValidator, getSchemaValidator } = require('./validation/schema-validator');
const { ParamValidator, getParamValidator } = require('./validation/param-validator');
const { FileValidator, getFileValidator } = require('./validation/file-validator');

// Error Handlers
const { ErrorHandler, getErrorHandler } = require('./error-handlers/error-handler');
const { NotFoundHandler, getNotFoundHandler } = require('./error-handlers/not-found-handler');
const { ValidationErrorHandler, getValidationErrorHandler } = require('./error-handlers/validation-error-handler');
const { DatabaseErrorHandler, getDatabaseErrorHandler } = require('./error-handlers/database-error-handler');
const { AsyncErrorHandler, getAsyncErrorHandler } = require('./error-handlers/async-error-handler');

// Logging Middleware
const { RequestLogger, getRequestLogger } = require('./logging/request-logger');
const { ErrorLogger, getErrorLogger } = require('./logging/error-logger');
const { AuditLogger, getAuditLogger } = require('./logging/audit-logger');
const { PerformanceLogger, getPerformanceLogger } = require('./logging/performance-logger');

// Compression Middleware
const compressionConfig = require('./compression-config');

/**
 * Security middleware collection
 * @namespace security
 */
const security = {
  // Helmet configuration for security headers
  helmet: () => getHelmetConfig().getMiddleware(),
  
  // Custom security headers
  headers: (options) => getSecurityHeaders().middleware(options),
  
  // CSRF protection
  csrf: (options) => getCSRFProtection().middleware(options),
  
  // XSS protection
  xss: (options) => getXSSProtection().middleware(options),
  
  // SQL injection protection
  sqlInjection: (options) => getSQLInjectionProtection().middleware(options),
  
  // Request sanitization
  sanitizer: (options) => getRequestSanitizer().middleware(options),
  
  // Input validation
  inputValidation: (options) => getInputValidation().middleware(options),
  
  // All security middleware combined
  all: (options = {}) => {
    return [
      security.helmet(),
      security.headers(options.headers),
      security.xss(options.xss),
      security.sqlInjection(options.sqlInjection),
      security.sanitizer(options.sanitizer),
      security.inputValidation(options.inputValidation)
    ];
  }
};

/**
 * CORS middleware collection
 * @namespace cors
 */
const cors = {
  // CORS configuration
  config: async (context) => getCorsConfig().getCorsOptions(context),
  
  // CORS middleware
  middleware: (options) => getCorsMiddleware().middleware(options),
  
  // CORS with dynamic origin validation
  dynamic: () => getCorsMiddleware().dynamicCors(),
  
  // Origin validation
  validateOrigin: (origin, context) => getCorsConfig().isOriginAllowed(origin, context),
  
  // Origin management
  addOrigin: (origin, options) => getCorsConfig().addOrigin(origin, options),
  removeOrigin: (origin, options) => getCorsConfig().removeOrigin(origin, options),
  listOrigins: (filter) => getCorsConfig().listOrigins(filter),
  reloadOrigins: () => getCorsConfig().reloadOrigins()
};

/**
 * Validation middleware collection
 * @namespace validation
 */
const validation = {
  // Request validation
  request: (schema, options) => getRequestValidator().validate(schema, options),
  
  // Schema validation
  schema: (schema, options) => getSchemaValidator().validate(schema, options),
  
  // Parameter validation
  params: (schema) => getParamValidator().validateParams(schema),
  query: (schema) => getParamValidator().validateQuery(schema),
  
  // File validation
  file: (options) => getFileValidator().validate(options),
  files: (options) => getFileValidator().validateMultiple(options),
  
  // Custom validators
  custom: (validatorFn) => getRequestValidator().custom(validatorFn),
  
  // Validation error handler
  errorHandler: () => getValidationErrorHandler().handle
};

/**
 * Error handling middleware collection
 * @namespace errorHandlers
 */
const errorHandlers = {
  // Main error handler
  main: () => getErrorHandler().handleError,
  
  // 404 Not Found handler
  notFound: () => getNotFoundHandler().handle,
  
  // Validation error handler
  validation: () => getValidationErrorHandler().handle,
  
  // Database error handler
  database: () => getDatabaseErrorHandler().handle,
  
  // Async error wrapper
  asyncWrapper: (fn) => getAsyncErrorHandler().wrap(fn),
  wrapAll: (target, options) => getAsyncErrorHandler().wrapAll(target, options),
  
  // Error boundary
  boundary: (options) => getAsyncErrorHandler().errorBoundary(options),
  
  // Initialize async error handling
  initializeAsync: () => getAsyncErrorHandler().initialize(),
  
  // All error handlers in order
  all: () => {
    return [
      errorHandlers.validation(),
      errorHandlers.database(),
      errorHandlers.main()
    ];
  }
};

/**
 * Logging middleware collection
 * @namespace logging
 */
const logging = {
  // Request logging
  request: (options) => getRequestLogger().log,
  
  // Error logging
  error: () => getErrorLogger().middleware,
  
  // Audit logging
  audit: (options) => getAuditLogger().middleware(options),
  
  // Performance logging
  performance: (options) => getPerformanceLogger().middleware(options),
  
  // Log methods
  logError: (error, context, req) => getErrorLogger().logError(error, context, req),
  logAudit: (event, req) => getAuditLogger().logEvent(event, req),
  trackOperation: (name, type) => getPerformanceLogger().trackOperation(name, type),
  recordMetric: (name, value, tags, type) => getPerformanceLogger().recordMetric(name, value, tags, type),
  
  // Metrics and reports
  getRequestMetrics: () => getRequestLogger().getMetrics(),
  getErrorStatistics: () => getErrorLogger().getStatistics(),
  getAuditStatistics: () => getAuditLogger().getStatistics(),
  getPerformanceMetrics: (filter) => getPerformanceLogger().getMetrics(filter),
  
  // All logging middleware
  all: (options = {}) => {
    return [
      logging.request(options.request),
      logging.performance(options.performance)
    ];
  }
};

/**
 * Compression middleware
 * @namespace compression
 */
const compression = compressionConfig;

/**
 * Utility functions
 * @namespace utils
 */
const utils = {
  // Async error wrapper
  catchAsync: (fn) => errorHandlers.asyncWrapper(fn),
  
  // CSRF token generator
  generateCSRFToken: () => getCSRFProtection().generateToken(),
  
  // Validation helpers
  validateRequest: validation.request,
  validateSchema: validation.schema,
  
  // Security helpers
  sanitizeInput: (input, options) => getRequestSanitizer().sanitizeInput(input, options),
  
  // Performance helpers
  startTimer: () => {
    const start = process.hrtime.bigint();
    return {
      end: () => Number(process.hrtime.bigint() - start) / 1e6 // Convert to ms
    };
  }
};

/**
 * Middleware initialization function
 * @param {Object} app - Express application instance
 * @param {Object} options - Configuration options
 */
const initialize = (app, options = {}) => {
  // Initialize async error handling
  if (options.asyncErrors !== false) {
    errorHandlers.initializeAsync();
  }

  // Apply compression
  if (options.compression !== false) {
    app.use(compression(options.compression));
  }

  // Apply security middleware
  if (options.security !== false) {
    security.all(options.security).forEach(middleware => app.use(middleware));
  }

  // Apply CORS
  if (options.cors !== false) {
    app.use(cors.middleware(options.cors));
  }

  // Apply logging
  if (options.logging !== false) {
    logging.all(options.logging).forEach(middleware => app.use(middleware));
  }

  // Apply CSRF protection (after session middleware)
  if (options.csrf !== false) {
    app.use(security.csrf(options.csrf));
  }

  return app;
};

/**
 * Middleware groups for common use cases
 * @namespace groups
 */
const groups = {
  // API middleware group
  api: (options = {}) => {
    return [
      compression(options.compression),
      ...security.all(options.security),
      cors.middleware(options.cors),
      ...logging.all(options.logging)
    ];
  },

  // Admin middleware group (stricter security)
  admin: (options = {}) => {
    return [
      compression(options.compression),
      ...security.all({ 
        ...options.security,
        xss: { ...options.security?.xss, strict: true },
        inputValidation: { ...options.security?.inputValidation, strict: true }
      }),
      cors.middleware({ ...options.cors, credentials: true }),
      logging.audit(options.audit),
      ...logging.all(options.logging)
    ];
  },

  // Public middleware group (relaxed security)
  public: (options = {}) => {
    return [
      compression(options.compression),
      security.helmet(),
      security.headers(options.headers),
      cors.middleware(options.cors),
      logging.request(options.request)
    ];
  }
};

/**
 * Export all middleware collections
 */
module.exports = {
  // Individual middleware collections
  security,
  cors,
  validation,
  errorHandlers,
  logging,
  compression,
  
  // Utility functions
  utils,
  
  // Initialization
  initialize,
  
  // Middleware groups
  groups,
  
  // Direct class exports for advanced usage
  classes: {
    // Security
    HelmetConfig,
    SecurityHeaders,
    CSRFProtection,
    XSSProtection,
    SQLInjectionProtection,
    RequestSanitizer,
    InputValidation,
    
    // CORS
    CorsConfig,
    CorsMiddleware,
    
    // Validation
    RequestValidator,
    SchemaValidator,
    ParamValidator,
    FileValidator,
    
    // Error Handlers
    ErrorHandler,
    NotFoundHandler,
    ValidationErrorHandler,
    DatabaseErrorHandler,
    AsyncErrorHandler,
    
    // Logging
    RequestLogger,
    ErrorLogger,
    AuditLogger,
    PerformanceLogger
  },
  
  // Singleton getters for direct access
  instances: {
    helmet: getHelmetConfig,
    securityHeaders: getSecurityHeaders,
    csrf: getCSRFProtection,
    xss: getXSSProtection,
    sqlInjection: getSQLInjectionProtection,
    sanitizer: getRequestSanitizer,
    inputValidation: getInputValidation,
    corsConfig: getCorsConfig,
    corsMiddleware: getCorsMiddleware,
    requestValidator: getRequestValidator,
    schemaValidator: getSchemaValidator,
    paramValidator: getParamValidator,
    fileValidator: getFileValidator,
    errorHandler: getErrorHandler,
    notFoundHandler: getNotFoundHandler,
    validationErrorHandler: getValidationErrorHandler,
    databaseErrorHandler: getDatabaseErrorHandler,
    asyncErrorHandler: getAsyncErrorHandler,
    requestLogger: getRequestLogger,
    errorLogger: getErrorLogger,
    auditLogger: getAuditLogger,
    performanceLogger: getPerformanceLogger
  }
};