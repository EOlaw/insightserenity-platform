'use strict';

/**
 * @fileoverview Maintenance management validators for admin operations
 * @module servers/admin-server/modules/platform-management/validators/maintenance-validators
 * @requires module:express-validator
 * @requires module:shared/lib/utils/validators/common-validators
 */

const { body, param, query, validationResult } = require('express-validator');
const {
  isValidObjectId,
  isValidCron,
  isValidSemver,
  sanitizeInput
} = require('../../../../../shared/lib/utils/validators/common-validators');

/**
 * Validate maintenance window creation/update
 * @type {Array<ValidationChain>}
 */
const validateMaintenanceWindow = [
  body('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters')
    .customSanitizer(sanitizeInput),
  body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters')
    .customSanitizer(sanitizeInput),
  body('type')
    .notEmpty().withMessage('Maintenance type is required')
    .isIn(['scheduled', 'emergency', 'routine', 'upgrade'])
    .withMessage('Invalid maintenance type'),
  body('startTime')
    .notEmpty().withMessage('Start time is required')
    .isISO8601().withMessage('Invalid start time format')
    .toDate()
    .custom((value, { req }) => {
      if (req.body.type !== 'emergency' && new Date(value) <= new Date()) {
        return false;
      }
      return true;
    }).withMessage('Start time must be in the future for non-emergency maintenance'),
  body('endTime')
    .notEmpty().withMessage('End time is required')
    .isISO8601().withMessage('Invalid end time format')
    .toDate()
    .custom((endTime, { req }) => {
      if (req.body.startTime && new Date(endTime) <= new Date(req.body.startTime)) {
        return false;
      }
      return true;
    }).withMessage('End time must be after start time'),
  body('affectedServices')
    .notEmpty().withMessage('Affected services are required')
    .isArray({ min: 1 }).withMessage('At least one service must be specified')
    .custom((services) => {
      const validServices = ['api', 'web', 'database', 'cache', 'storage', 'messaging', 'analytics', 'all'];
      return services.every(service => validServices.includes(service));
    }).withMessage('Invalid service specified'),
  body('impact')
    .notEmpty().withMessage('Impact level is required')
    .isIn(['none', 'minimal', 'partial', 'major', 'complete'])
    .withMessage('Invalid impact level'),
  body('notificationSettings')
    .optional()
    .isObject().withMessage('Notification settings must be an object'),
  body('notificationSettings.advanceNotice')
    .optional()
    .isArray().withMessage('Advance notice must be an array')
    .custom((notices) => {
      return notices.every(notice => 
        notice.time && notice.unit && 
        ['minutes', 'hours', 'days'].includes(notice.unit) &&
        notice.time > 0
      );
    }).withMessage('Invalid advance notice configuration'),
  body('notificationSettings.channels')
    .optional()
    .isArray().withMessage('Channels must be an array')
    .custom((channels) => {
      const validChannels = ['email', 'sms', 'inApp', 'webhook'];
      return channels.every(channel => validChannels.includes(channel));
    }).withMessage('Invalid notification channel'),
  body('requireApproval')
    .optional()
    .isBoolean().withMessage('Require approval must be boolean'),
];

/**
 * Validate deployment request
 * @type {Array<ValidationChain>}
 */
const validateDeployment = [
  body('applicationName')
    .notEmpty().withMessage('Application name is required')
    .matches(/^[a-z][a-z0-9-]*$/).withMessage('Application name must be lowercase with hyphens')
    .isLength({ min: 3, max: 50 }).withMessage('Application name must be between 3 and 50 characters'),
  body('version')
    .notEmpty().withMessage('Version is required')
    .custom(isValidSemver).withMessage('Invalid semantic version format'),
  body('environment')
    .notEmpty().withMessage('Environment is required')
    .isIn(['development', 'staging', 'production'])
    .withMessage('Invalid environment'),
  body('deploymentStrategy')
    .notEmpty().withMessage('Deployment strategy is required')
    .isIn(['rolling', 'blueGreen', 'canary', 'recreate'])
    .withMessage('Invalid deployment strategy'),
  body('rollbackEnabled')
    .optional()
    .isBoolean().withMessage('Rollback enabled must be boolean'),
  body('healthCheckConfig')
    .optional()
    .isObject().withMessage('Health check config must be an object'),
  body('healthCheckConfig.endpoint')
    .optional()
    .matches(/^\/[a-zA-Z0-9\/-]*$/).withMessage('Invalid health check endpoint'),
  body('healthCheckConfig.interval')
    .optional()
    .isInt({ min: 5, max: 300 }).withMessage('Health check interval must be between 5 and 300 seconds'),
  body('healthCheckConfig.timeout')
    .optional()
    .isInt({ min: 1, max: 60 }).withMessage('Health check timeout must be between 1 and 60 seconds'),
  body('healthCheckConfig.retries')
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage('Health check retries must be between 1 and 10'),
  body('canaryConfig')
    .optional()
    .isObject().withMessage('Canary config must be an object')
    .custom((config, { req }) => {
      if (req.body.deploymentStrategy === 'canary' && !config) {
        return false;
      }
      if (config && (!config.percentage || config.percentage < 1 || config.percentage > 50)) {
        return false;
      }
      return true;
    }).withMessage('Invalid canary configuration'),
  body('preDeploymentChecks')
    .optional()
    .isArray().withMessage('Pre-deployment checks must be an array'),
  body('postDeploymentChecks')
    .optional()
    .isArray().withMessage('Post-deployment checks must be an array'),
];

/**
 * Validate migration request
 * @type {Array<ValidationChain>}
 */
const validateMigration = [
  body('migrationType')
    .notEmpty().withMessage('Migration type is required')
    .isIn(['database', 'data', 'schema', 'configuration'])
    .withMessage('Invalid migration type'),
  body('source')
    .notEmpty().withMessage('Source is required')
    .isObject().withMessage('Source must be an object'),
  body('source.version')
    .notEmpty().withMessage('Source version is required')
    .custom(isValidSemver).withMessage('Invalid source version format'),
  body('target')
    .notEmpty().withMessage('Target is required')
    .isObject().withMessage('Target must be an object'),
  body('target.version')
    .notEmpty().withMessage('Target version is required')
    .custom(isValidSemver).withMessage('Invalid target version format')
    .custom((targetVersion, { req }) => {
      if (req.body.source?.version) {
        // Simple check - in real implementation would use semver comparison
        return targetVersion > req.body.source.version;
      }
      return true;
    }).withMessage('Target version must be newer than source version'),
  body('backupRequired')
    .optional()
    .isBoolean().withMessage('Backup required must be boolean'),
  body('validationSteps')
    .optional()
    .isArray().withMessage('Validation steps must be an array')
    .custom((steps) => {
      return steps.every(step => 
        step.name && step.type && 
        ['preCheck', 'postCheck', 'validation'].includes(step.type)
      );
    }).withMessage('Invalid validation step configuration'),
  body('rollbackPlan')
    .notEmpty().withMessage('Rollback plan is required')
    .isObject().withMessage('Rollback plan must be an object'),
  body('rollbackPlan.automatic')
    .optional()
    .isBoolean().withMessage('Automatic rollback must be boolean'),
  body('rollbackPlan.conditions')
    .optional()
    .isArray().withMessage('Rollback conditions must be an array'),
  body('estimatedDuration')
    .optional()
    .isInt({ min: 1, max: 1440 }).withMessage('Estimated duration must be between 1 and 1440 minutes'),
];

/**
 * Validate system update request
 * @type {Array<ValidationChain>}
 */
const validateSystemUpdate = [
  body('updateType')
    .notEmpty().withMessage('Update type is required')
    .isIn(['security', 'feature', 'bugfix', 'performance', 'dependency'])
    .withMessage('Invalid update type'),
  body('packages')
    .notEmpty().withMessage('Packages are required')
    .isArray({ min: 1 }).withMessage('At least one package must be specified')
    .custom((packages) => {
      return packages.every(pkg => 
        pkg.name && pkg.currentVersion && pkg.targetVersion &&
        isValidSemver(pkg.currentVersion) && isValidSemver(pkg.targetVersion)
      );
    }).withMessage('Invalid package configuration'),
  body('priority')
    .notEmpty().withMessage('Priority is required')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority'),
  body('requireRestart')
    .optional()
    .isBoolean().withMessage('Require restart must be boolean'),
  body('compatibility')
    .optional()
    .isObject().withMessage('Compatibility must be an object'),
  body('compatibility.breakingChanges')
    .optional()
    .isBoolean().withMessage('Breaking changes must be boolean'),
  body('compatibility.minimumVersion')
    .optional()
    .custom(isValidSemver).withMessage('Invalid minimum version format'),
  body('testingRequired')
    .optional()
    .isBoolean().withMessage('Testing required must be boolean'),
  body('schedule')
    .optional()
    .isObject().withMessage('Schedule must be an object'),
  body('schedule.type')
    .optional()
    .isIn(['immediate', 'scheduled', 'maintenance_window'])
    .withMessage('Invalid schedule type'),
  body('schedule.time')
    .optional()
    .isISO8601().withMessage('Invalid schedule time format')
    .toDate(),
];

/**
 * Validate health check request
 * @type {Array<ValidationChain>}
 */
const validateHealthCheck = [
  body('checkType')
    .notEmpty().withMessage('Check type is required')
    .isIn(['quick', 'standard', 'comprehensive', 'custom'])
    .withMessage('Invalid check type'),
  body('components')
    .optional()
    .isArray().withMessage('Components must be an array')
    .custom((components) => {
      const validComponents = [
        'api', 'database', 'cache', 'storage', 'messaging', 
        'authentication', 'monitoring', 'networking', 'integrations'
      ];
      return components.every(comp => validComponents.includes(comp));
    }).withMessage('Invalid component specified'),
  body('depth')
    .optional()
    .isIn(['surface', 'moderate', 'deep'])
    .withMessage('Invalid check depth'),
  body('timeout')
    .optional()
    .isInt({ min: 5, max: 300 }).withMessage('Timeout must be between 5 and 300 seconds'),
  body('includeMetrics')
    .optional()
    .isBoolean().withMessage('Include metrics must be boolean'),
  body('includeLogs')
    .optional()
    .isBoolean().withMessage('Include logs must be boolean'),
  body('customChecks')
    .optional()
    .isArray().withMessage('Custom checks must be an array')
    .custom((checks) => {
      return checks.every(check => 
        check.name && check.endpoint && check.expectedStatus
      );
    }).withMessage('Invalid custom check configuration'),
];

/**
 * Validate backup scheduling
 * @type {Array<ValidationChain>}
 */
const validateBackupSchedule = [
  body('scheduleName')
    .notEmpty().withMessage('Schedule name is required')
    .matches(/^[a-z][a-z0-9-]*$/).withMessage('Schedule name must be lowercase with hyphens')
    .isLength({ min: 3, max: 50 }).withMessage('Schedule name must be between 3 and 50 characters'),
  body('frequency')
    .notEmpty().withMessage('Frequency is required')
    .isIn(['hourly', 'daily', 'weekly', 'monthly', 'custom'])
    .withMessage('Invalid frequency'),
  body('cronExpression')
    .optional()
    .custom((value, { req }) => {
      if (req.body.frequency === 'custom' && !value) {
        return false;
      }
      if (value && !isValidCron(value)) {
        return false;
      }
      return true;
    }).withMessage('Invalid or missing cron expression for custom frequency'),
  body('backupType')
    .notEmpty().withMessage('Backup type is required')
    .isIn(['full', 'incremental', 'differential'])
    .withMessage('Invalid backup type'),
  body('retention')
    .notEmpty().withMessage('Retention policy is required')
    .isObject().withMessage('Retention must be an object'),
  body('retention.count')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Retention count must be between 1 and 100'),
  body('retention.days')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Retention days must be between 1 and 365'),
  body('enabled')
    .notEmpty().withMessage('Enabled status is required')
    .isBoolean().withMessage('Enabled must be boolean'),
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
  validateMaintenanceWindow,
  validateDeployment,
  validateMigration,
  validateSystemUpdate,
  validateHealthCheck,
  validateBackupSchedule,
  handleValidationErrors
};