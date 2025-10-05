'use strict';

/**
 * @fileoverview Main export file for Platform Utility Library
 * @module shared/lib/utils
 * @description Central export point for all utility modules
 */

// Core utilities
const AppError = require('./app-error');
const Logger = require('./logger');
const AsyncHandler = require('./async-handler');
const ResponseFormatter = require('./response-formatter');

// Validators
const CommonValidators = require('./validators/common-validators');
const AuthValidators = require('./validators/auth-validators');
const UserValidators = require('./validators/user-validators');
const OrganizationValidators = require('./validators/organization-validators');
const CustomValidators = require('./validators/custom-validators');

// Helpers
const CryptoHelper = require('./helpers/crypto-helper');
const StringHelper = require('./helpers/string-helper');
const DateHelper = require('./helpers/date-helper');
const EmailHelper = require('./helpers/email-helper');
const CacheHelper = require('./helpers/cache-helper');
const FileHelper = require('./helpers/file-helper');
const PaginationHelper = require('./helpers/pagination-helper');
const SlugHelper = require('./helpers/slug-helper');
const SanitizationHelper = require('./helpers/sanitization-helper');
const ValidationHelper = require('./helpers/validation-helper');
const EncryptionHelper = require('./helpers/encryption-helper');

// Formatters
const DateFormatter = require('./formatters/date-formatter');
const CurrencyFormatter = require('./formatters/currency-formatter');
const NumberFormatter = require('./formatters/number-formatter');
const TextFormatter = require('./formatters/text-formatter');

// Constants
const ErrorCodes = require('./constants/error-codes');
const StatusCodes = require('./constants/status-codes');
const Permissions = require('./constants/permissions');
const Roles = require('./constants/roles');
const ComplianceFrameworks = require('./constants/compliance-frameworks');
const AlertTypes = require('./constants/alert-types');
const IncidentTypes = require('./constants/incident-types');

/**
 * Main exports
 */
module.exports = {
  // Core utilities
  AppError: AppError.AppError,
  ErrorHandler: AppError.ErrorHandler,
  ErrorAggregator: AppError.ErrorAggregator,
  ErrorCode: AppError.ErrorCode,
  ErrorCategory: AppError.ErrorCategory,
  ErrorSeverity: AppError.ErrorSeverity,

  Logger: Logger.Logger,
  getLogger: Logger.getLogger,
  createLogger: Logger.createLogger,

  AsyncHandler,
  ResponseFormatter,

  // Validators namespace
  validators: {
    common: CommonValidators,
    auth: AuthValidators,
    user: UserValidators,
    organization: OrganizationValidators,
    custom: CustomValidators
  },

  // Individual validator exports for convenience
  CommonValidators,
  AuthValidators,
  UserValidators,
  OrganizationValidators,
  CustomValidators,

  // Helpers namespace
  helpers: {
    crypto: CryptoHelper,
    string: StringHelper,
    date: DateHelper,
    email: EmailHelper,
    cache: CacheHelper,
    file: FileHelper,
    pagination: PaginationHelper,
    slug: SlugHelper,
    sanitization: SanitizationHelper,
    validation: ValidationHelper,
    encryption: EncryptionHelper
  },

  // Individual helper exports for convenience
  CryptoHelper,
  StringHelper,
  DateHelper,
  EmailHelper,
  CacheHelper,
  FileHelper,
  PaginationHelper,
  SlugHelper,
  SanitizationHelper,
  ValidationHelper,
  EncryptionHelper,

  // Formatters namespace
  formatters: {
    date: DateFormatter,
    currency: CurrencyFormatter,
    number: NumberFormatter,
    text: TextFormatter
  },

  // Individual formatter exports for convenience
  DateFormatter,
  CurrencyFormatter,
  NumberFormatter,
  TextFormatter,

  // Constants namespace
  constants: {
    errorCodes: ErrorCodes,
    statusCodes: StatusCodes,
    permissions: Permissions,
    roles: Roles,
    complianceFrameworks: ComplianceFrameworks,
    alertTypes: AlertTypes,
    incidentTypes: IncidentTypes
  },

  // Individual constants exports for convenience
  ErrorCodes,
  StatusCodes,
  Permissions,
  Roles,
  ComplianceFrameworks,
  AlertTypes,
  IncidentTypes,

  // Version information
  version: '1.0.0',

  // Utility initialization function
  initialize: function(config = {}) {
    // Initialize logger if config provided
    if (config.logger) {
      Logger.configure(config.logger);
    }

    // Initialize cache if config provided
    if (config.cache) {
      CacheHelper.initialize(config.cache);
    }

    // Initialize async handler if config provided
    if (config.asyncHandler) {
      AsyncHandler.configure(config.asyncHandler);
    }

    // Set global error handler if enabled
    if (config.globalErrorHandler) {
      const errorHandler = new AppError.ErrorHandler(config.errorHandler || {});
      errorHandler.handleUncaughtException();
      errorHandler.handleUnhandledRejection();
    }

    return {
      logger: Logger.getInstance(),
      cache: CacheHelper,
      asyncHandler: AsyncHandler.getInstance()
    };
  },

  // Quick access factory methods
  createError: (message, options) => new AppError.AppError(message, options),
  createLogger: (options) => new Logger.Logger(options),
  createAsyncHandler: (config) => new AsyncHandler(config),

  // Commonly used error factories
  errors: {
    unauthorized: AppError.AppError.unauthorized,
    forbidden: AppError.AppError.forbidden,
    notFound: AppError.AppError.notFound,
    validation: AppError.AppError.validation,
    conflict: AppError.AppError.conflict,
    rateLimit: AppError.AppError.rateLimit,
    database: AppError.AppError.database,
    external: AppError.AppError.external,
    timeout: AppError.AppError.timeout,
    internal: AppError.AppError.internal,
    businessLogic: AppError.AppError.businessLogic
  },

  // Response helpers
  responses: {
    success: ResponseFormatter.success,
    error: ResponseFormatter.error,
    paginated: ResponseFormatter.paginated,
    created: ResponseFormatter.created,
    updated: ResponseFormatter.updated,
    deleted: ResponseFormatter.deleted,
    noContent: ResponseFormatter.noContent,
    notFound: ResponseFormatter.notFound,
    unauthorized: ResponseFormatter.unauthorized,
    forbidden: ResponseFormatter.forbidden,
    conflict: ResponseFormatter.conflict,
    tooManyRequests: ResponseFormatter.tooManyRequests,
    serviceUnavailable: ResponseFormatter.serviceUnavailable
  },

  // Middleware exports
  middleware: {
    errorHandler: (options) => new AppError.ErrorHandler(options).middleware(),
    asyncWrapper: (fn) => AsyncHandler.getInstance().wrap(fn),
    requestLogger: (options) => Logger.getInstance().middleware(options),
    validation: (validations) => [
      ...validations,
      CommonValidators.checkValidation()
    ]
  },

  // Utility functions
  utils: {
    // Type checking
    isEmail: (email) => EmailHelper.isValid(email),
    isURL: (url) => StringHelper.isURL(url),
    isUUID: (uuid) => StringHelper.isUUID(uuid),
    isJSON: (json) => StringHelper.isJSON(json),

    // Quick formatting
    formatDate: (date, format) => DateFormatter.format(date, format),
    formatCurrency: (amount, currency) => CurrencyFormatter.format(amount, currency),
    formatNumber: (number) => NumberFormatter.format(number),

    // Quick operations
    hash: (data) => CryptoHelper.hash(data),
    encrypt: (data, key) => CryptoHelper.encrypt(data, key),
    decrypt: (data, key) => CryptoHelper.decrypt(data, key),
    slugify: (text) => SlugHelper.generate(text),
    sanitize: (data) => SanitizationHelper.sanitize(data)
  }
};

// Export types for TypeScript compatibility (JSDoc)
/**
 * @typedef {import('./app-error').AppError} AppError
 * @typedef {import('./app-error').ErrorHandler} ErrorHandler
 * @typedef {import('./app-error').ErrorAggregator} ErrorAggregator
 * @typedef {import('./logger').Logger} Logger
 * @typedef {import('./async-handler')} AsyncHandler
 * @typedef {import('./response-formatter')} ResponseFormatter
 */

// Make certain classes available as properties
module.exports.AppError.AppError = AppError.AppError;
module.exports.Logger.Logger = Logger.Logger;
