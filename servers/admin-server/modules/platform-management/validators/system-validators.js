'use strict';

/**
 * @fileoverview System management validators for admin operations
 * @module servers/admin-server/modules/platform-management/validators/system-validators
 * @requires module:express-validator
 * @requires module:shared/lib/utils/validators/common-validators
 */

const { body, param, query, validationResult } = require('express-validator');
const {
  isValidObjectId,
  isValidIpAddress,
  isValidPort,
  isValidCron,
  sanitizeInput
} = require('../../../../../shared/lib/utils/validators/common-validators');

/**
 * Validate system resource allocation
 * @type {Array<ValidationChain>}
 */
const validateResourceAllocation = [
  body('resourceType')
    .notEmpty().withMessage('Resource type is required')
    .isIn(['cpu', 'memory', 'storage', 'bandwidth'])
    .withMessage('Invalid resource type'),
  body('allocation')
    .notEmpty().withMessage('Allocation is required')
    .isObject().withMessage('Allocation must be an object'),
  body('allocation.minimum')
    .notEmpty().withMessage('Minimum allocation is required')
    .isInt({ min: 0 }).withMessage('Minimum must be a positive integer'),
  body('allocation.maximum')
    .notEmpty().withMessage('Maximum allocation is required')
    .isInt({ min: 1 }).withMessage('Maximum must be greater than 0')
    .custom((max, { req }) => max >= req.body.allocation?.minimum)
    .withMessage('Maximum must be greater than or equal to minimum'),
  body('allocation.unit')
    .notEmpty().withMessage('Unit is required')
    .isIn(['bytes', 'KB', 'MB', 'GB', 'TB', 'percentage', 'cores'])
    .withMessage('Invalid unit'),
  body('autoScaling')
    .optional()
    .isObject().withMessage('Auto scaling must be an object'),
  body('autoScaling.enabled')
    .optional()
    .isBoolean().withMessage('Auto scaling enabled must be boolean'),
  body('autoScaling.threshold')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Threshold must be between 0 and 100'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'critical'])
    .withMessage('Invalid priority level'),
];

/**
 * Validate system performance monitoring
 * @type {Array<ValidationChain>}
 */
const validatePerformanceMonitoring = [
  query('metrics')
    .optional()
    .isString()
    .customSanitizer(value => value.split(',').map(m => m.trim()))
    .custom((metrics) => {
      const validMetrics = ['cpu', 'memory', 'disk', 'network', 'latency', 'throughput', 'errors'];
      return metrics.every(metric => validMetrics.includes(metric));
    }).withMessage('Invalid metrics specified'),
  query('interval')
    .optional()
    .isIn(['1m', '5m', '15m', '30m', '1h', '6h', '12h', '24h'])
    .withMessage('Invalid interval'),
  query('aggregation')
    .optional()
    .isIn(['avg', 'min', 'max', 'sum', 'count'])
    .withMessage('Invalid aggregation method'),
  query('startTime')
    .optional()
    .isISO8601().withMessage('Invalid start time format')
    .toDate(),
  query('endTime')
    .optional()
    .isISO8601().withMessage('Invalid end time format')
    .toDate()
    .custom((endTime, { req }) => {
      if (req.query.startTime && endTime) {
        return new Date(endTime) > new Date(req.query.startTime);
      }
      return true;
    }).withMessage('End time must be after start time'),
];

/**
 * Validate system process management
 * @type {Array<ValidationChain>}
 */
const validateProcessManagement = [
  body('processName')
    .notEmpty().withMessage('Process name is required')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid process name format')
    .isLength({ min: 1, max: 50 }).withMessage('Process name must be between 1 and 50 characters'),
  body('action')
    .notEmpty().withMessage('Action is required')
    .isIn(['start', 'stop', 'restart', 'reload', 'status', 'kill'])
    .withMessage('Invalid action'),
  body('signal')
    .optional()
    .isIn(['SIGTERM', 'SIGKILL', 'SIGHUP', 'SIGUSR1', 'SIGUSR2'])
    .withMessage('Invalid signal'),
  body('timeout')
    .optional()
    .isInt({ min: 0, max: 300 }).withMessage('Timeout must be between 0 and 300 seconds'),
  body('force')
    .optional()
    .isBoolean().withMessage('Force must be boolean'),
];

/**
 * Validate system log configuration
 * @type {Array<ValidationChain>}
 */
const validateLogConfiguration = [
  body('logLevel')
    .notEmpty().withMessage('Log level is required')
    .isIn(['debug', 'info', 'warn', 'error', 'fatal'])
    .withMessage('Invalid log level'),
  body('loggers')
    .optional()
    .isArray().withMessage('Loggers must be an array')
    .custom((loggers) => {
      return loggers.every(logger => 
        logger.name && 
        ['console', 'file', 'syslog', 'database', 'external'].includes(logger.type)
      );
    }).withMessage('Invalid logger configuration'),
  body('retention')
    .optional()
    .isObject().withMessage('Retention must be an object'),
  body('retention.days')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Retention days must be between 1 and 365'),
  body('retention.maxSize')
    .optional()
    .matches(/^\d+[KMG]B$/).withMessage('Invalid max size format (e.g., 100MB, 1GB)'),
  body('rotation')
    .optional()
    .isObject().withMessage('Rotation must be an object'),
  body('rotation.enabled')
    .optional()
    .isBoolean().withMessage('Rotation enabled must be boolean'),
  body('rotation.schedule')
    .optional()
    .custom(isValidCron).withMessage('Invalid cron expression'),
  body('filters')
    .optional()
    .isArray().withMessage('Filters must be an array'),
];

/**
 * Validate system security scan
 * @type {Array<ValidationChain>}
 */
const validateSecurityScan = [
  body('scanType')
    .notEmpty().withMessage('Scan type is required')
    .isIn(['vulnerability', 'malware', 'compliance', 'configuration', 'full'])
    .withMessage('Invalid scan type'),
  body('targets')
    .isArray({ min: 1 }).withMessage('At least one target must be specified')
    .custom((targets) => {
      return targets.every(target => 
        target.type && ['server', 'database', 'application', 'network'].includes(target.type)
      );
    }).withMessage('Invalid target configuration'),
  body('schedule')
    .optional()
    .isObject().withMessage('Schedule must be an object'),
  body('schedule.frequency')
    .optional()
    .isIn(['once', 'daily', 'weekly', 'monthly'])
    .withMessage('Invalid frequency'),
  body('schedule.cron')
    .optional()
    .custom(isValidCron).withMessage('Invalid cron expression'),
  body('depth')
    .optional()
    .isIn(['quick', 'standard', 'deep', 'comprehensive'])
    .withMessage('Invalid scan depth'),
  body('notifications')
    .optional()
    .isObject().withMessage('Notifications must be an object'),
  body('notifications.onComplete')
    .optional()
    .isBoolean().withMessage('onComplete must be boolean'),
  body('notifications.onCritical')
    .optional()
    .isBoolean().withMessage('onCritical must be boolean'),
];

/**
 * Validate system network configuration
 * @type {Array<ValidationChain>}
 */
const validateNetworkConfig = [
  body('interface')
    .notEmpty().withMessage('Network interface is required')
    .matches(/^[a-zA-Z0-9]+$/).withMessage('Invalid interface name'),
  body('ipAddress')
    .optional()
    .custom(isValidIpAddress).withMessage('Invalid IP address format'),
  body('subnet')
    .optional()
    .matches(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/)
    .withMessage('Invalid subnet format (e.g., 192.168.1.0/24)'),
  body('gateway')
    .optional()
    .custom(isValidIpAddress).withMessage('Invalid gateway IP address'),
  body('dns')
    .optional()
    .isArray().withMessage('DNS must be an array')
    .custom((dns) => dns.every(ip => isValidIpAddress(ip)))
    .withMessage('Invalid DNS server IP addresses'),
  body('ports')
    .optional()
    .isArray().withMessage('Ports must be an array')
    .custom((ports) => {
      return ports.every(port => 
        port.number && isValidPort(port.number) &&
        ['tcp', 'udp'].includes(port.protocol)
      );
    }).withMessage('Invalid port configuration'),
  body('firewall')
    .optional()
    .isObject().withMessage('Firewall must be an object'),
  body('firewall.enabled')
    .optional()
    .isBoolean().withMessage('Firewall enabled must be boolean'),
  body('firewall.rules')
    .optional()
    .isArray().withMessage('Firewall rules must be an array'),
];

/**
 * Validate system cache management
 * @type {Array<ValidationChain>}
 */
const validateCacheManagement = [
  body('cacheType')
    .notEmpty().withMessage('Cache type is required')
    .isIn(['redis', 'memcached', 'application', 'cdn'])
    .withMessage('Invalid cache type'),
  body('action')
    .notEmpty().withMessage('Action is required')
    .isIn(['flush', 'clear', 'warm', 'invalidate', 'optimize'])
    .withMessage('Invalid action'),
  body('pattern')
    .optional()
    .isString().withMessage('Pattern must be a string')
    .isLength({ max: 200 }).withMessage('Pattern too long'),
  body('ttl')
    .optional()
    .isInt({ min: 0, max: 86400 }).withMessage('TTL must be between 0 and 86400 seconds'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high'])
    .withMessage('Invalid priority'),
];

/**
 * Validate system queue configuration
 * @type {Array<ValidationChain>}
 */
const validateQueueConfig = [
  body('queueName')
    .notEmpty().withMessage('Queue name is required')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid queue name format')
    .isLength({ min: 1, max: 50 }).withMessage('Queue name must be between 1 and 50 characters'),
  body('type')
    .notEmpty().withMessage('Queue type is required')
    .isIn(['rabbitmq', 'redis', 'sqs', 'kafka'])
    .withMessage('Invalid queue type'),
  body('configuration')
    .notEmpty().withMessage('Configuration is required')
    .isObject().withMessage('Configuration must be an object'),
  body('configuration.maxSize')
    .optional()
    .isInt({ min: 1, max: 1000000 }).withMessage('Max size must be between 1 and 1,000,000'),
  body('configuration.maxRetries')
    .optional()
    .isInt({ min: 0, max: 10 }).withMessage('Max retries must be between 0 and 10'),
  body('configuration.timeout')
    .optional()
    .isInt({ min: 1, max: 3600 }).withMessage('Timeout must be between 1 and 3600 seconds'),
  body('configuration.deadLetterQueue')
    .optional()
    .isBoolean().withMessage('Dead letter queue must be boolean'),
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
  validateResourceAllocation,
  validatePerformanceMonitoring,
  validateProcessManagement,
  validateLogConfiguration,
  validateSecurityScan,
  validateNetworkConfig,
  validateCacheManagement,
  validateQueueConfig,
  handleValidationErrors
};