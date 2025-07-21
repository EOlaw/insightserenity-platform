'use strict';

/**
 * @fileoverview Central export point for all utility modules
 * @module shared/lib/utils
 */

// Core utilities
const Logger = require('./logger');
const AppError = require('./app-error');
const AsyncHandler = require('./async-handler');
const ResponseFormatter = require('./response-formatter');

// Constants
const ErrorCodes = require('./constants/error-codes');
const StatusCodes = require('./constants/status-codes');
const Permissions = require('./constants/permissions');
const Roles = require('./constants/roles');

// Helpers
const DateHelper = require('./helpers/date-helper');
const StringHelper = require('./helpers/string-helper');
const CryptoHelper = require('./helpers/crypto-helper');
const FileHelper = require('./helpers/file-helper');
const EmailHelper = require('./helpers/email-helper');
const CacheHelper = require('./helpers/cache-helper');
const PaginationHelper = require('./helpers/pagination-helper');
const SlugHelper = require('./helpers/slug-helper');

// Validators
const CommonValidators = require('./validators/common-validators');
const AuthValidators = require('./validators/auth-validators');
const UserValidators = require('./validators/user-validators');
const OrganizationValidators = require('./validators/organization-validators');
const CustomValidators = require('./validators/custom-validators');

// Formatters
const DateFormatter = require('./formatters/date-formatter');
const CurrencyFormatter = require('./formatters/currency-formatter');
const NumberFormatter = require('./formatters/number-formatter');
const TextFormatter = require('./formatters/text-formatter');

/**
 * @namespace Utils
 * @description Aggregated utility exports for shared library
 */
module.exports = {
  // Core utilities
  Logger,
  ...AppError,
  ...AsyncHandler,
  ...ResponseFormatter,

  // Constants
  ErrorCodes,
  StatusCodes,
  Permissions,
  Roles,
  
  // All constants in one object
  constants: {
    ...ErrorCodes,
    ...StatusCodes,
    ...Permissions,
    ...Roles
  },

  // Helpers
  DateHelper,
  StringHelper,
  CryptoHelper,
  FileHelper,
  EmailHelper,
  CacheHelper,
  PaginationHelper,
  SlugHelper,
  
  // All helpers in one object
  helpers: {
    DateHelper,
    StringHelper,
    CryptoHelper,
    FileHelper,
    EmailHelper,
    CacheHelper,
    PaginationHelper,
    SlugHelper
  },

  // Validators
  CommonValidators,
  AuthValidators,
  UserValidators,
  OrganizationValidators,
  CustomValidators,
  
  // All validators in one object
  validators: {
    CommonValidators,
    AuthValidators,
    UserValidators,
    OrganizationValidators,
    CustomValidators
  },

  // Formatters
  DateFormatter,
  CurrencyFormatter,
  NumberFormatter,
  TextFormatter,
  
  // All formatters in one object
  formatters: {
    DateFormatter,
    CurrencyFormatter,
    NumberFormatter,
    TextFormatter
  },

  // Convenience exports for commonly used functions
  // Logger shortcuts
  logInfo: Logger.info.bind(Logger),
  logError: Logger.error.bind(Logger),
  logWarn: Logger.warn.bind(Logger),
  logDebug: Logger.debug.bind(Logger),
  
  // Response shortcuts
  successResponse: ResponseFormatter.success.bind(ResponseFormatter),
  errorResponse: ResponseFormatter.error.bind(ResponseFormatter),
  paginatedResponse: ResponseFormatter.paginated.bind(ResponseFormatter),
  
  // Async handler shortcuts
  asyncHandler: AsyncHandler.wrap.bind(AsyncHandler),
  withRetry: AsyncHandler.withRetry.bind(AsyncHandler),
  withTimeout: AsyncHandler.withTimeout.bind(AsyncHandler),
  
  // Common validation shortcuts
  isEmail: CommonValidators.isEmail.bind(CommonValidators),
  isPhone: CommonValidators.isPhone.bind(CommonValidators),
  isURL: CommonValidators.isURL.bind(CommonValidators),
  
  // Error factory
  createError: AppError.ErrorFactory.fromCode.bind(AppError.ErrorFactory),
  wrapError: AppError.ErrorFactory.wrap.bind(AppError.ErrorFactory),
  
  // Utility factory methods
  createLogger: (context) => Logger.child(context),
  createValidator: CustomValidators.createValidator.bind(CustomValidators),
  
  // Version info
  version: '1.0.0'
};