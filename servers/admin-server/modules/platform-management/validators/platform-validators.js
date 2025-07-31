'use strict';

/**
 * @fileoverview Platform management validators for admin operations
 * @module servers/admin-server/modules/platform-management/validators/platform-validators
 * @requires module:express-validator
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/status-codes
 */

const { body, param, query, validationResult } = require('express-validator');
const { 
  isValidObjectId, 
  isValidUrl, 
  isValidEmail,
  isValidDateRange,
  sanitizeInput 
} = require('../../../../../shared/lib/utils/validators/common-validators');
const { PLATFORM_STATUS, PLATFORM_MODES } = require('../../../../../shared/lib/utils/constants/status-codes');

/**
 * Validate platform initialization request
 * @type {Array<ValidationChain>}
 */
const validatePlatformInit = [
  body('name')
    .trim()
    .notEmpty().withMessage('Platform name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Platform name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_.]+$/).withMessage('Platform name contains invalid characters')
    .customSanitizer(sanitizeInput),
  body('domain')
    .trim()
    .notEmpty().withMessage('Domain is required')
    .isURL({ require_protocol: false }).withMessage('Invalid domain format')
    .custom(isValidUrl).withMessage('Invalid URL format'),
  body('adminEmail')
    .trim()
    .notEmpty().withMessage('Admin email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .custom(isValidEmail).withMessage('Invalid email address'),
  body('licenseKey')
    .trim()
    .notEmpty().withMessage('License key is required')
    .matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    .withMessage('Invalid license key format'),
  body('timezone')
    .optional()
    .isIn(['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'])
    .withMessage('Invalid timezone'),
  body('defaultLanguage')
    .optional()
    .isIn(['en', 'es', 'fr', 'de', 'zh', 'ja'])
    .withMessage('Invalid language code'),
  body('features')
    .optional()
    .isObject().withMessage('Features must be an object')
    .custom((features) => {
      const allowedFeatures = ['multiTenant', 'whiteLabel', 'advancedAnalytics', 'apiAccess', 'customIntegrations'];
      return Object.keys(features).every(key => allowedFeatures.includes(key));
    }).withMessage('Invalid feature configuration'),
];

/**
 * Validate platform statistics query
 * @type {Array<ValidationChain>}
 */
const validatePlatformStats = [
  query('startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date format')
    .toDate(),
  query('endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format')
    .toDate()
    .custom((endDate, { req }) => {
      if (req.query.startDate && endDate) {
        return isValidDateRange(req.query.startDate, endDate);
      }
      return true;
    }).withMessage('End date must be after start date'),
  query('metrics')
    .optional()
    .isString()
    .customSanitizer(value => value.split(',').map(m => m.trim()))
    .custom((metrics) => {
      const validMetrics = ['users', 'organizations', 'storage', 'api_calls', 'revenue', 'performance'];
      return metrics.every(metric => validMetrics.includes(metric));
    }).withMessage('Invalid metrics specified'),
  query('aggregation')
    .optional()
    .isIn(['hour', 'day', 'week', 'month', 'year'])
    .withMessage('Invalid aggregation period'),
];

/**
 * Validate platform mode change
 * @type {Array<ValidationChain>}
 */
const validatePlatformMode = [
  body('mode')
    .notEmpty().withMessage('Platform mode is required')
    .isIn(Object.values(PLATFORM_MODES)).withMessage('Invalid platform mode'),
  body('reason')
    .notEmpty().withMessage('Reason for mode change is required')
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters')
    .customSanitizer(sanitizeInput),
  body('scheduledEndTime')
    .optional()
    .isISO8601().withMessage('Invalid scheduled end time format')
    .toDate()
    .custom((value) => {
      if (value && new Date(value) <= new Date()) {
        return false;
      }
      return true;
    }).withMessage('Scheduled end time must be in the future'),
  body('notifyUsers')
    .optional()
    .isBoolean().withMessage('notifyUsers must be a boolean'),
  body('maintenanceMessage')
    .optional()
    .isLength({ max: 1000 }).withMessage('Maintenance message too long')
    .customSanitizer(sanitizeInput),
];

/**
 * Validate platform backup request
 * @type {Array<ValidationChain>}
 */
const validatePlatformBackup = [
  body('backupType')
    .notEmpty().withMessage('Backup type is required')
    .isIn(['full', 'incremental', 'differential', 'selective'])
    .withMessage('Invalid backup type'),
  body('components')
    .isArray({ min: 1 }).withMessage('At least one component must be selected')
    .custom((components) => {
      const validComponents = ['database', 'files', 'configurations', 'logs', 'analytics'];
      return components.every(comp => validComponents.includes(comp));
    }).withMessage('Invalid component selection'),
  body('encryption')
    .optional()
    .isObject().withMessage('Encryption settings must be an object'),
  body('encryption.enabled')
    .optional()
    .isBoolean().withMessage('Encryption enabled must be boolean'),
  body('encryption.algorithm')
    .optional()
    .isIn(['AES-256', 'AES-128', 'RSA-2048'])
    .withMessage('Invalid encryption algorithm'),
  body('compression')
    .optional()
    .isBoolean().withMessage('Compression must be boolean'),
  body('storageLocation')
    .optional()
    .isIn(['local', 's3', 'azure', 'gcp'])
    .withMessage('Invalid storage location'),
  body('retentionDays')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Retention days must be between 1 and 365'),
];

/**
 * Validate platform restore request
 * @type {Array<ValidationChain>}
 */
const validatePlatformRestore = [
  body('backupId')
    .notEmpty().withMessage('Backup ID is required')
    .custom(isValidObjectId).withMessage('Invalid backup ID format'),
  body('restorePoint')
    .optional()
    .isISO8601().withMessage('Invalid restore point format')
    .toDate(),
  body('components')
    .isArray({ min: 1 }).withMessage('At least one component must be selected')
    .custom((components) => {
      const validComponents = ['database', 'files', 'configurations', 'logs', 'analytics'];
      return components.every(comp => validComponents.includes(comp));
    }).withMessage('Invalid component selection'),
  body('validateIntegrity')
    .optional()
    .isBoolean().withMessage('Validate integrity must be boolean'),
  body('testRestore')
    .optional()
    .isBoolean().withMessage('Test restore must be boolean'),
  body('overwriteExisting')
    .optional()
    .isBoolean().withMessage('Overwrite existing must be boolean'),
];

/**
 * Validate platform health check configuration
 * @type {Array<ValidationChain>}
 */
const validateHealthCheckConfig = [
  body('checks')
    .isArray({ min: 1 }).withMessage('At least one check must be configured')
    .custom((checks) => {
      const validChecks = ['database', 'cache', 'storage', 'api', 'services', 'integrations'];
      return checks.every(check => validChecks.includes(check));
    }).withMessage('Invalid health check selection'),
  body('interval')
    .notEmpty().withMessage('Check interval is required')
    .isInt({ min: 30, max: 3600 }).withMessage('Interval must be between 30 and 3600 seconds'),
  body('timeout')
    .optional()
    .isInt({ min: 5, max: 300 }).withMessage('Timeout must be between 5 and 300 seconds'),
  body('thresholds')
    .optional()
    .isObject().withMessage('Thresholds must be an object'),
  body('thresholds.cpu')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('CPU threshold must be between 0 and 100'),
  body('thresholds.memory')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Memory threshold must be between 0 and 100'),
  body('thresholds.disk')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Disk threshold must be between 0 and 100'),
  body('alerting')
    .optional()
    .isObject().withMessage('Alerting must be an object'),
  body('alerting.enabled')
    .optional()
    .isBoolean().withMessage('Alerting enabled must be boolean'),
  body('alerting.channels')
    .optional()
    .isArray().withMessage('Alert channels must be an array')
    .custom((channels) => {
      const validChannels = ['email', 'sms', 'slack', 'webhook', 'pagerduty'];
      return channels.every(channel => validChannels.includes(channel));
    }).withMessage('Invalid alert channel'),
];

/**
 * Validate platform license update
 * @type {Array<ValidationChain>}
 */
const validateLicenseUpdate = [
  body('licenseKey')
    .notEmpty().withMessage('License key is required')
    .matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    .withMessage('Invalid license key format'),
  body('activationEmail')
    .notEmpty().withMessage('Activation email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('acceptTerms')
    .notEmpty().withMessage('Terms acceptance is required')
    .isBoolean().withMessage('Terms acceptance must be boolean')
    .custom(value => value === true).withMessage('Terms must be accepted'),
];

/**
 * Middleware to handle validation errors
 * @param {Object} req Express request object
 * @param {Object} res Express response object
 * @param {Function} next Express next middleware
 * @returns {void|Object}
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

module.exports = {
  validatePlatformInit,
  validatePlatformStats,
  validatePlatformMode,
  validatePlatformBackup,
  validatePlatformRestore,
  validateHealthCheckConfig,
  validateLicenseUpdate,
  handleValidationErrors
};