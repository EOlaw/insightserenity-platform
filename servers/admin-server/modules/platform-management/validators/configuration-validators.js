'use strict';

/**
 * @fileoverview Configuration management validators for admin operations
 * @module servers/admin-server/modules/platform-management/validators/configuration-validators
 * @requires module:express-validator
 * @requires module:shared/lib/utils/validators/common-validators
 */

const { body, param, query, validationResult } = require('express-validator');
const {
  isValidObjectId,
  isValidEmail,
  isValidUrl,
  isValidJson,
  sanitizeInput
} = require('../../../../../shared/lib/utils/validators/common-validators');

/**
 * Validate global settings update
 * @type {Array<ValidationChain>}
 */
const validateGlobalSettings = [
  body('category')
    .notEmpty().withMessage('Settings category is required')
    .isIn(['general', 'security', 'performance', 'integration', 'appearance', 'notification'])
    .withMessage('Invalid settings category'),
  body('settings')
    .notEmpty().withMessage('Settings object is required')
    .isObject().withMessage('Settings must be an object')
    .custom((settings, { req }) => {
      // Validate based on category
      switch (req.body.category) {
        case 'general':
          return validateGeneralSettings(settings);
        case 'security':
          return validateSecuritySettings(settings);
        case 'performance':
          return validatePerformanceSettings(settings);
        case 'integration':
          return validateIntegrationSettings(settings);
        case 'appearance':
          return validateAppearanceSettings(settings);
        case 'notification':
          return validateNotificationSettings(settings);
        default:
          return true;
      }
    }).withMessage('Invalid settings for the specified category'),
  body('effectiveDate')
    .optional()
    .isISO8601().withMessage('Invalid effective date format')
    .toDate()
    .custom(value => new Date(value) >= new Date())
    .withMessage('Effective date must be in the future'),
  body('requireRestart')
    .optional()
    .isBoolean().withMessage('Require restart must be boolean'),
];

/**
 * Validate feature flag configuration
 * @type {Array<ValidationChain>}
 */
const validateFeatureFlag = [
  body('name')
    .notEmpty().withMessage('Feature flag name is required')
    .matches(/^[A-Z][A-Z0-9_]*$/).withMessage('Feature flag name must be uppercase with underscores')
    .isLength({ min: 3, max: 50 }).withMessage('Feature flag name must be between 3 and 50 characters'),
  body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10, max: 500 }).withMessage('Description must be between 10 and 500 characters')
    .customSanitizer(sanitizeInput),
  body('enabled')
    .notEmpty().withMessage('Enabled status is required')
    .isBoolean().withMessage('Enabled must be boolean'),
  body('rolloutPercentage')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Rollout percentage must be between 0 and 100'),
  body('targetGroups')
    .optional()
    .isArray().withMessage('Target groups must be an array')
    .custom((groups) => {
      return groups.every(group => 
        group.type && ['organization', 'user', 'plan', 'region'].includes(group.type) &&
        group.ids && Array.isArray(group.ids)
      );
    }).withMessage('Invalid target group configuration'),
  body('conditions')
    .optional()
    .isArray().withMessage('Conditions must be an array')
    .custom((conditions) => {
      return conditions.every(condition =>
        condition.field && condition.operator && condition.value
      );
    }).withMessage('Invalid condition configuration'),
  body('schedule')
    .optional()
    .isObject().withMessage('Schedule must be an object'),
  body('schedule.startDate')
    .optional()
    .isISO8601().withMessage('Invalid start date format')
    .toDate(),
  body('schedule.endDate')
    .optional()
    .isISO8601().withMessage('Invalid end date format')
    .toDate()
    .custom((endDate, { req }) => {
      if (req.body.schedule?.startDate && endDate) {
        return new Date(endDate) > new Date(req.body.schedule.startDate);
      }
      return true;
    }).withMessage('End date must be after start date'),
];

/**
 * Validate API configuration
 * @type {Array<ValidationChain>}
 */
const validateApiConfig = [
  body('apiName')
    .notEmpty().withMessage('API name is required')
    .matches(/^[a-z][a-z0-9-]*$/).withMessage('API name must be lowercase with hyphens')
    .isLength({ min: 3, max: 50 }).withMessage('API name must be between 3 and 50 characters'),
  body('version')
    .notEmpty().withMessage('API version is required')
    .matches(/^v\d+(\.\d+)?$/).withMessage('Invalid version format (e.g., v1, v2.0)'),
  body('baseUrl')
    .notEmpty().withMessage('Base URL is required')
    .custom(isValidUrl).withMessage('Invalid URL format'),
  body('authentication')
    .notEmpty().withMessage('Authentication configuration is required')
    .isObject().withMessage('Authentication must be an object'),
  body('authentication.type')
    .notEmpty().withMessage('Authentication type is required')
    .isIn(['apiKey', 'oauth2', 'jwt', 'basic', 'custom'])
    .withMessage('Invalid authentication type'),
  body('authentication.config')
    .notEmpty().withMessage('Authentication config is required')
    .isObject().withMessage('Authentication config must be an object'),
  body('rateLimits')
    .optional()
    .isObject().withMessage('Rate limits must be an object'),
  body('rateLimits.requests')
    .optional()
    .isInt({ min: 1, max: 10000 }).withMessage('Requests must be between 1 and 10,000'),
  body('rateLimits.window')
    .optional()
    .isIn(['second', 'minute', 'hour', 'day'])
    .withMessage('Invalid rate limit window'),
  body('cors')
    .optional()
    .isObject().withMessage('CORS must be an object'),
  body('cors.enabled')
    .optional()
    .isBoolean().withMessage('CORS enabled must be boolean'),
  body('cors.origins')
    .optional()
    .isArray().withMessage('CORS origins must be an array')
    .custom((origins) => origins.every(origin => isValidUrl(origin)))
    .withMessage('Invalid CORS origin URLs'),
];

/**
 * Validate environment variables
 * @type {Array<ValidationChain>}
 */
const validateEnvironmentVars = [
  body('environment')
    .notEmpty().withMessage('Environment is required')
    .isIn(['development', 'staging', 'production'])
    .withMessage('Invalid environment'),
  body('variables')
    .notEmpty().withMessage('Variables are required')
    .isArray({ min: 1 }).withMessage('At least one variable must be provided')
    .custom((variables) => {
      return variables.every(variable =>
        variable.name && 
        /^[A-Z][A-Z0-9_]*$/.test(variable.name) &&
        variable.value !== undefined &&
        ['string', 'number', 'boolean', 'json'].includes(variable.type)
      );
    }).withMessage('Invalid variable configuration'),
  body('encrypted')
    .optional()
    .isBoolean().withMessage('Encrypted must be boolean'),
  body('restartRequired')
    .optional()
    .isBoolean().withMessage('Restart required must be boolean'),
];

/**
 * Validate database configuration
 * @type {Array<ValidationChain>}
 */
const validateDatabaseConfig = [
  body('connectionName')
    .notEmpty().withMessage('Connection name is required')
    .matches(/^[a-z][a-z0-9_]*$/).withMessage('Connection name must be lowercase with underscores')
    .isLength({ min: 3, max: 50 }).withMessage('Connection name must be between 3 and 50 characters'),
  body('type')
    .notEmpty().withMessage('Database type is required')
    .isIn(['mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch'])
    .withMessage('Invalid database type'),
  body('host')
    .notEmpty().withMessage('Host is required')
    .isString().withMessage('Host must be a string'),
  body('port')
    .notEmpty().withMessage('Port is required')
    .isPort().withMessage('Invalid port number'),
  body('database')
    .notEmpty().withMessage('Database name is required')
    .matches(/^[a-zA-Z][a-zA-Z0-9_]*$/).withMessage('Invalid database name format'),
  body('username')
    .optional()
    .isString().withMessage('Username must be a string'),
  body('password')
    .optional()
    .isString().withMessage('Password must be a string'),
  body('ssl')
    .optional()
    .isObject().withMessage('SSL configuration must be an object'),
  body('ssl.enabled')
    .optional()
    .isBoolean().withMessage('SSL enabled must be boolean'),
  body('poolSize')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Pool size must be between 1 and 100'),
  body('timeout')
    .optional()
    .isInt({ min: 1000, max: 60000 }).withMessage('Timeout must be between 1000 and 60000 ms'),
];

/**
 * Validate email configuration
 * @type {Array<ValidationChain>}
 */
const validateEmailConfig = [
  body('provider')
    .notEmpty().withMessage('Email provider is required')
    .isIn(['smtp', 'sendgrid', 'mailgun', 'ses', 'postmark'])
    .withMessage('Invalid email provider'),
  body('configuration')
    .notEmpty().withMessage('Configuration is required')
    .isObject().withMessage('Configuration must be an object')
    .custom((config, { req }) => {
      switch (req.body.provider) {
        case 'smtp':
          return config.host && config.port && config.secure !== undefined;
        case 'sendgrid':
        case 'mailgun':
        case 'postmark':
          return config.apiKey && config.apiKey.length > 0;
        case 'ses':
          return config.accessKeyId && config.secretAccessKey && config.region;
        default:
          return false;
      }
    }).withMessage('Invalid configuration for selected provider'),
  body('defaultFrom')
    .notEmpty().withMessage('Default from address is required')
    .custom(isValidEmail).withMessage('Invalid email address'),
  body('templates')
    .optional()
    .isObject().withMessage('Templates must be an object'),
  body('trackingEnabled')
    .optional()
    .isBoolean().withMessage('Tracking enabled must be boolean'),
];

/**
 * Validate webhook configuration
 * @type {Array<ValidationChain>}
 */
const validateWebhookConfig = [
  body('name')
    .notEmpty().withMessage('Webhook name is required')
    .matches(/^[a-z][a-z0-9-]*$/).withMessage('Webhook name must be lowercase with hyphens')
    .isLength({ min: 3, max: 50 }).withMessage('Webhook name must be between 3 and 50 characters'),
  body('url')
    .notEmpty().withMessage('Webhook URL is required')
    .custom(isValidUrl).withMessage('Invalid URL format'),
  body('events')
    .notEmpty().withMessage('Events are required')
    .isArray({ min: 1 }).withMessage('At least one event must be specified')
    .custom((events) => {
      const validEvents = [
        'user.created', 'user.updated', 'user.deleted',
        'organization.created', 'organization.updated', 'organization.deleted',
        'subscription.created', 'subscription.updated', 'subscription.cancelled',
        'payment.succeeded', 'payment.failed',
        'security.alert', 'system.error'
      ];
      return events.every(event => validEvents.includes(event));
    }).withMessage('Invalid event types'),
  body('headers')
    .optional()
    .isObject().withMessage('Headers must be an object'),
  body('retryPolicy')
    .optional()
    .isObject().withMessage('Retry policy must be an object'),
  body('retryPolicy.maxRetries')
    .optional()
    .isInt({ min: 0, max: 10 }).withMessage('Max retries must be between 0 and 10'),
  body('retryPolicy.backoffMultiplier')
    .optional()
    .isFloat({ min: 1, max: 5 }).withMessage('Backoff multiplier must be between 1 and 5'),
  body('secret')
    .optional()
    .isString().withMessage('Secret must be a string')
    .isLength({ min: 32 }).withMessage('Secret must be at least 32 characters'),
  body('enabled')
    .notEmpty().withMessage('Enabled status is required')
    .isBoolean().withMessage('Enabled must be boolean'),
];

/**
 * Helper function to validate general settings
 * @param {Object} settings Settings object to validate
 * @returns {boolean} Validation result
 */
function validateGeneralSettings(settings) {
  const allowedFields = ['siteName', 'siteUrl', 'timezone', 'language', 'dateFormat', 'timeFormat'];
  return Object.keys(settings).every(key => allowedFields.includes(key));
}

/**
 * Helper function to validate security settings
 * @param {Object} settings Settings object to validate
 * @returns {boolean} Validation result
 */
function validateSecuritySettings(settings) {
  const allowedFields = ['passwordPolicy', 'sessionTimeout', 'twoFactorAuth', 'ipWhitelist', 'encryptionAlgorithm'];
  return Object.keys(settings).every(key => allowedFields.includes(key));
}

/**
 * Helper function to validate performance settings
 * @param {Object} settings Settings object to validate
 * @returns {boolean} Validation result
 */
function validatePerformanceSettings(settings) {
  const allowedFields = ['cacheEnabled', 'compressionEnabled', 'minifyAssets', 'lazyLoading', 'cdnEnabled'];
  return Object.keys(settings).every(key => allowedFields.includes(key));
}

/**
 * Helper function to validate integration settings
 * @param {Object} settings Settings object to validate
 * @returns {boolean} Validation result
 */
function validateIntegrationSettings(settings) {
  const allowedFields = ['apiEnabled', 'webhooksEnabled', 'oauthProviders', 'externalServices'];
  return Object.keys(settings).every(key => allowedFields.includes(key));
}

/**
 * Helper function to validate appearance settings
 * @param {Object} settings Settings object to validate
 * @returns {boolean} Validation result
 */
function validateAppearanceSettings(settings) {
  const allowedFields = ['theme', 'primaryColor', 'logo', 'favicon', 'customCss'];
  return Object.keys(settings).every(key => allowedFields.includes(key));
}

/**
 * Helper function to validate notification settings
 * @param {Object} settings Settings object to validate
 * @returns {boolean} Validation result
 */
function validateNotificationSettings(settings) {
  const allowedFields = ['emailEnabled', 'smsEnabled', 'pushEnabled', 'inAppEnabled', 'notificationChannels'];
  return Object.keys(settings).every(key => allowedFields.includes(key));
}

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
  validateGlobalSettings,
  validateFeatureFlag,
  validateApiConfig,
  validateEnvironmentVars,
  validateDatabaseConfig,
  validateEmailConfig,
  validateWebhookConfig,
  handleValidationErrors
};