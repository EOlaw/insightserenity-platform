'use strict';

/**
 * @fileoverview Error logger middleware for comprehensive error tracking and reporting
 * @module shared/lib/middleware/logging/error-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/config
 * @requires module:stack-trace
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const NotificationService = require('../../services/notification-service');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');
const config = require('..\helmet-config');
const stackTrace = require('stack-trace');

/**
 * @class ErrorLogger
 * @description Advanced error logger with stack trace analysis, error grouping,
 * trend detection, and integration with error tracking services
 */
class ErrorLogger {
  /**
   * @private
   * @type {NotificationService}
   */
  #notificationService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #errorGroups;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #errorFrequency;

  /**
   * @private
   * @type {Set<string>}
   */
  #criticalErrors;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #errorTrends;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enabled: process.env.ERROR_LOGGER_ENABLED !== 'false',
    level: process.env.ERROR_LOGGER_LEVEL || 'error',
    includeStackTrace: process.env.ERROR_LOGGER_INCLUDE_STACK !== 'false',
    includeSystemInfo: process.env.ERROR_LOGGER_INCLUDE_SYSTEM === 'true',
    includeRequestContext: process.env.ERROR_LOGGER_INCLUDE_REQUEST !== 'false',
    includeUserContext: process.env.ERROR_LOGGER_INCLUDE_USER !== 'false',
    includeEnvironmentVariables: process.env.ERROR_LOGGER_INCLUDE_ENV === 'true',
    maxStackFrames: parseInt(process.env.ERROR_LOGGER_MAX_STACK_FRAMES || '10', 10),
    groupingEnabled: process.env.ERROR_LOGGER_GROUPING !== 'false',
    groupingWindow: parseInt(process.env.ERROR_LOGGER_GROUPING_WINDOW || '300000', 10), // 5 minutes
    alertingEnabled: process.env.ERROR_LOGGER_ALERTING === 'true',
    alertThreshold: parseInt(process.env.ERROR_LOGGER_ALERT_THRESHOLD || '10', 10),
    criticalPatterns: [
      /out of memory/i,
      /maximum call stack/i,
      /ECONNREFUSED.*database/i,
      /FATAL/i,
      /PANIC/i
    ],
    sensitivePatterns: [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /authorization/i
    ],
    excludePatterns: [
      /ResizeObserver loop limit exceeded/i,
      /Non-Error promise rejection captured/i
    ],
    errorCategories: {
      database: /mongo|sql|database|collection/i,
      network: /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i,
      validation: /validation|validator|schema/i,
      authentication: /auth|unauthorized|forbidden/i,
      filesystem: /ENOENT|EACCES|EMFILE|ENOSPC/i,
      memory: /heap|memory|allocation|gc/i
    },
    externalServices: {
      sentry: {
        enabled: process.env.SENTRY_ENABLED === 'true',
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV
      },
      rollbar: {
        enabled: process.env.ROLLBAR_ENABLED === 'true',
        accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
        environment: process.env.NODE_ENV
      },
      bugsnag: {
        enabled: process.env.BUGSNAG_ENABLED === 'true',
        apiKey: process.env.BUGSNAG_API_KEY
      }
    },
    notifications: {
      slack: {
        enabled: process.env.ERROR_SLACK_ENABLED === 'true',
        webhookUrl: process.env.ERROR_SLACK_WEBHOOK_URL,
        channel: process.env.ERROR_SLACK_CHANNEL || '#errors'
      },
      email: {
        enabled: process.env.ERROR_EMAIL_ENABLED === 'true',
        recipients: process.env.ERROR_EMAIL_RECIPIENTS?.split(',') || ['errors@insightserenity.com']
      }
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #ERROR_SEVERITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
  };

  /**
   * Creates ErrorLogger instance
   * @param {Object} [options] - Configuration options
   * @param {NotificationService} [notificationService] - Notification service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(options = {}, notificationService, cacheService, auditService) {
    this.#config = this.#mergeConfig(options);
    this.#notificationService = notificationService || new NotificationService();
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#errorGroups = new Map();
    this.#errorFrequency = new Map();
    this.#criticalErrors = new Set();
    this.#errorTrends = new Map();

    // Initialize external services
    this.#initializeExternalServices();

    // Start trend analysis
    this.#startTrendAnalysis();

    logger.info('ErrorLogger initialized', {
      enabled: this.#config.enabled,
      groupingEnabled: this.#config.groupingEnabled,
      alertingEnabled: this.#config.alertingEnabled
    });
  }

  /**
   * Logs an error with full context
   * @param {Error} error - Error to log
   * @param {Object} [context] - Additional context
   * @param {Object} [req] - Express request object
   * @returns {Promise<void>}
   */
  logError = async (error, context = {}, req = null) => {
    if (!this.#config.enabled) return;

    try {
      // Check if should exclude
      if (this.#shouldExcludeError(error)) {
        return;
      }

      // Create error record
      const errorRecord = await this.#createErrorRecord(error, context, req);

      // Categorize error
      errorRecord.category = this.#categorizeError(error);
      errorRecord.severity = this.#determineErrorSeverity(error, errorRecord);

      // Group similar errors
      if (this.#config.groupingEnabled) {
        errorRecord.groupId = await this.#groupError(errorRecord);
      }

      // Log the error
      this.#logErrorRecord(errorRecord);

      // Track error metrics
      this.#trackErrorMetrics(errorRecord);

      // Send to external services
      await this.#sendToExternalServices(errorRecord);

      // Check for critical errors
      if (errorRecord.severity === ErrorLogger.#ERROR_SEVERITY.CRITICAL) {
        await this.#handleCriticalError(errorRecord);
      }

      // Check alerting thresholds
      if (this.#config.alertingEnabled) {
        await this.#checkAlertingThresholds(errorRecord);
      }

      // Audit significant errors
      if (errorRecord.severity !== ErrorLogger.#ERROR_SEVERITY.LOW) {
        await this.#auditError(errorRecord);
      }

    } catch (loggerError) {
      // Fallback logging
      console.error('ErrorLogger failed:', loggerError);
      console.error('Original error:', error);
    }
  };

  /**
   * Express error logging middleware
   * @param {Error} err - Error object
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  middleware = async (err, req, res, next) => {
    if (!this.#config.enabled) {
      return next(err);
    }

    const context = {
      middleware: true,
      responseStatus: res.statusCode
    };

    await this.logError(err, context, req);
    next(err);
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...ErrorLogger.#DEFAULT_CONFIG };

    Object.keys(ErrorLogger.#DEFAULT_CONFIG).forEach(key => {
      if (typeof ErrorLogger.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(ErrorLogger.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...ErrorLogger.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Initializes external error tracking services
   */
  #initializeExternalServices() {
    // Initialize Sentry
    if (this.#config.externalServices.sentry.enabled) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.init({
          dsn: this.#config.externalServices.sentry.dsn,
          environment: this.#config.externalServices.sentry.environment
        });
        this.sentry = Sentry;
        logger.info('Sentry error tracking initialized');
      } catch (error) {
        logger.error('Failed to initialize Sentry', { error: error.message });
      }
    }

    // Initialize Rollbar
    if (this.#config.externalServices.rollbar.enabled) {
      try {
        const Rollbar = require('rollbar');
        this.rollbar = new Rollbar({
          accessToken: this.#config.externalServices.rollbar.accessToken,
          environment: this.#config.externalServices.rollbar.environment
        });
        logger.info('Rollbar error tracking initialized');
      } catch (error) {
        logger.error('Failed to initialize Rollbar', { error: error.message });
      }
    }

    // Initialize Bugsnag
    if (this.#config.externalServices.bugsnag.enabled) {
      try {
        const Bugsnag = require('@bugsnag/node');
        Bugsnag.start({ apiKey: this.#config.externalServices.bugsnag.apiKey });
        this.bugsnag = Bugsnag;
        logger.info('Bugsnag error tracking initialized');
      } catch (error) {
        logger.error('Failed to initialize Bugsnag', { error: error.message });
      }
    }
  }

  /**
   * @private
   * Starts trend analysis
   */
  #startTrendAnalysis() {
    // Analyze trends periodically
    setInterval(() => {
      this.#analyzeTrends();
    }, 300000); // 5 minutes

    // Clean up old data
    setInterval(() => {
      this.#cleanupOldData();
    }, 3600000); // 1 hour
  }

  /**
   * @private
   * Checks if error should be excluded
   */
  #shouldExcludeError(error) {
    const message = error.message || '';
    return this.#config.excludePatterns.some(pattern => pattern.test(message));
  }

  /**
   * @private
   * Creates comprehensive error record
   */
  async #createErrorRecord(error, context, req) {
    const record = {
      id: this.#generateErrorId(),
      timestamp: new Date().toISOString(),
      name: error.name || 'Error',
      message: this.#sanitizeErrorMessage(error.message),
      code: error.code,
      statusCode: error.statusCode || error.status || 500,
      correlationId: context.correlationId || req?.correlationId
    };

    // Add error details
    if (error instanceof AppError) {
      record.isOperational = error.isOperational;
      record.errorCode = error.errorCode;
      record.data = this.#sanitizeErrorData(error.data);
    }

    // Add stack trace
    if (this.#config.includeStackTrace && error.stack) {
      record.stack = this.#parseStackTrace(error);
    }

    // Add request context
    if (this.#config.includeRequestContext && req) {
      record.request = this.#extractRequestContext(req);
    }

    // Add user context
    if (this.#config.includeUserContext && req?.user) {
      record.user = this.#extractUserContext(req.user);
    }

    // Add system info
    if (this.#config.includeSystemInfo) {
      record.system = this.#extractSystemInfo();
    }

    // Add custom context
    record.context = { ...context };

    return record;
  }

  /**
   * @private
   * Sanitizes error message
   */
  #sanitizeErrorMessage(message) {
    if (!message) return 'Unknown error';

    let sanitized = message;

    // Remove sensitive patterns
    this.#config.sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  /**
   * @private
   * Sanitizes error data
   */
  #sanitizeErrorData(data) {
    if (!data) return null;

    const sanitized = JSON.parse(JSON.stringify(data));

    const sanitizeValue = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;

      for (const key in obj) {
        if (this.#config.sensitivePatterns.some(pattern => pattern.test(key))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          obj[key] = sanitizeValue(obj[key]);
        }
      }

      return obj;
    };

    return sanitizeValue(sanitized);
  }

  /**
   * @private
   * Parses stack trace
   */
  #parseStackTrace(error) {
    try {
      const trace = stackTrace.parse(error);
      return trace.slice(0, this.#config.maxStackFrames).map(frame => ({
        file: frame.getFileName(),
        method: frame.getFunctionName() || 'anonymous',
        line: frame.getLineNumber(),
        column: frame.getColumnNumber()
      }));
    } catch {
      // Fallback to raw stack
      return error.stack.split('\n').slice(0, this.#config.maxStackFrames);
    }
  }

  /**
   * @private
   * Extracts request context
   */
  #extractRequestContext(req) {
    return {
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      query: req.query,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
      referer: req.get('referer'),
      headers: this.#sanitizeHeaders(req.headers)
    };
  }

  /**
   * @private
   * Sanitizes headers
   */
  #sanitizeHeaders(headers) {
    const sanitized = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * @private
   * Extracts user context
   */
  #extractUserContext(user) {
    return {
      id: user._id || user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.roles,
      tenantId: user.tenantId
    };
  }

  /**
   * @private
   * Extracts system information
   */
  #extractSystemInfo() {
    const memory = process.memoryUsage();
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
      },
      env: this.#config.includeEnvironmentVariables ? {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        HOST: process.env.HOST
      } : undefined
    };
  }

  /**
   * @private
   * Categorizes error
   */
  #categorizeError(error) {
    const message = error.message || '';
    const name = error.name || '';
    const combined = `${name} ${message}`;

    for (const [category, pattern] of Object.entries(this.#config.errorCategories)) {
      if (pattern.test(combined)) {
        return category;
      }
    }

    return 'uncategorized';
  }

  /**
   * @private
   * Determines error severity
   */
  #determineErrorSeverity(error, record) {
    // Critical patterns
    if (this.#config.criticalPatterns.some(pattern => pattern.test(error.message))) {
      return ErrorLogger.#ERROR_SEVERITY.CRITICAL;
    }

    // Status code based
    if (record.statusCode >= 500) {
      return ErrorLogger.#ERROR_SEVERITY.HIGH;
    }

    if (record.statusCode >= 400) {
      return ErrorLogger.#ERROR_SEVERITY.MEDIUM;
    }

    // Category based
    if (['database', 'memory'].includes(record.category)) {
      return ErrorLogger.#ERROR_SEVERITY.HIGH;
    }

    return ErrorLogger.#ERROR_SEVERITY.LOW;
  }

  /**
   * @private
   * Groups similar errors
   */
  async #groupError(record) {
    const fingerprint = this.#generateErrorFingerprint(record);
    const now = Date.now();

    if (!this.#errorGroups.has(fingerprint)) {
      this.#errorGroups.set(fingerprint, {
        fingerprint,
        firstSeen: now,
        lastSeen: now,
        count: 0,
        sample: record
      });
    }

    const group = this.#errorGroups.get(fingerprint);
    group.count++;
    group.lastSeen = now;

    // Cache group data
    await this.#cacheService.set(
      `error_group:${fingerprint}`,
      group,
      this.#config.groupingWindow / 1000
    );

    return fingerprint;
  }

  /**
   * @private
   * Generates error fingerprint
   */
  #generateErrorFingerprint(record) {
    const parts = [
      record.name,
      record.category,
      record.statusCode
    ];

    // Add stack trace location if available
    if (record.stack && record.stack[0]) {
      parts.push(record.stack[0].file);
      parts.push(record.stack[0].method);
    }

    return parts.join(':');
  }

  /**
   * @private
   * Logs error record
   */
  #logErrorRecord(record) {
    const logData = {
      errorId: record.id,
      correlationId: record.correlationId,
      name: record.name,
      message: record.message,
      category: record.category,
      severity: record.severity,
      statusCode: record.statusCode
    };

    if (record.groupId) {
      logData.groupId = record.groupId;
    }

    if (record.stack) {
      logData.stack = record.stack;
    }

    if (record.request) {
      logData.request = record.request;
    }

    if (record.user) {
      logData.user = record.user;
    }

    if (record.system) {
      logData.system = record.system;
    }

    const level = this.#getLogLevel(record.severity);
    logger[level]('Application Error', logData);
  }

  /**
   * @private
   * Gets log level for severity
   */
  #getLogLevel(severity) {
    switch (severity) {
      case ErrorLogger.#ERROR_SEVERITY.CRITICAL:
      case ErrorLogger.#ERROR_SEVERITY.HIGH:
        return 'error';
      case ErrorLogger.#ERROR_SEVERITY.MEDIUM:
        return 'warn';
      default:
        return this.#config.level;
    }
  }

  /**
   * @private
   * Tracks error metrics
   */
  #trackErrorMetrics(record) {
    const key = `${record.category}:${record.severity}`;
    const count = (this.#errorFrequency.get(key) || 0) + 1;
    this.#errorFrequency.set(key, count);

    // Track trends
    const trendKey = `${record.category}:${new Date().getHours()}`;
    if (!this.#errorTrends.has(trendKey)) {
      this.#errorTrends.set(trendKey, { count: 0, errors: [] });
    }
    
    const trend = this.#errorTrends.get(trendKey);
    trend.count++;
    trend.errors.push({
      id: record.id,
      severity: record.severity,
      timestamp: record.timestamp
    });
  }

  /**
   * @private
   * Sends error to external services
   */
  async #sendToExternalServices(record) {
    const promises = [];

    // Sentry
    if (this.sentry) {
      promises.push(this.#sendToSentry(record));
    }

    // Rollbar
    if (this.rollbar) {
      promises.push(this.#sendToRollbar(record));
    }

    // Bugsnag
    if (this.bugsnag) {
      promises.push(this.#sendToBugsnag(record));
    }

    await Promise.all(promises).catch(error => {
      logger.error('Failed to send to external error services', {
        error: error.message
      });
    });
  }

  /**
   * @private
   * Sends error to Sentry
   */
  async #sendToSentry(record) {
    this.sentry.captureException(new Error(record.message), {
      tags: {
        category: record.category,
        severity: record.severity
      },
      extra: record
    });
  }

  /**
   * @private
   * Sends error to Rollbar
   */
  async #sendToRollbar(record) {
    this.rollbar.error(record.message, record);
  }

  /**
   * @private
   * Sends error to Bugsnag
   */
  async #sendToBugsnag(record) {
    this.bugsnag.notify(new Error(record.message), (event) => {
      event.severity = record.severity;
      event.addMetadata('error', record);
    });
  }

  /**
   * @private
   * Handles critical errors
   */
  async #handleCriticalError(record) {
    this.#criticalErrors.add(record.id);

    logger.error('CRITICAL ERROR DETECTED', {
      errorId: record.id,
      message: record.message,
      category: record.category
    });

    // Send immediate notifications
    const notifications = [];

    if (this.#config.notifications.slack.enabled) {
      notifications.push(this.#sendSlackNotification(record, 'critical'));
    }

    if (this.#config.notifications.email.enabled) {
      notifications.push(this.#sendEmailNotification(record, 'critical'));
    }

    await Promise.all(notifications);
  }

  /**
   * @private
   * Checks alerting thresholds
   */
  async #checkAlertingThresholds(record) {
    const group = this.#errorGroups.get(record.groupId);
    
    if (group && group.count >= this.#config.alertThreshold) {
      logger.warn('Error threshold exceeded', {
        groupId: record.groupId,
        count: group.count,
        threshold: this.#config.alertThreshold
      });

      await this.#sendThresholdAlert(group, record);
    }
  }

  /**
   * @private
   * Sends threshold alert
   */
  async #sendThresholdAlert(group, record) {
    const message = `Error threshold exceeded: ${group.sample.message}`;
    
    if (this.#config.notifications.slack.enabled) {
      await this.#sendSlackNotification({
        ...record,
        message,
        groupCount: group.count
      }, 'threshold');
    }
  }

  /**
   * @private
   * Sends Slack notification
   */
  async #sendSlackNotification(record, type) {
    try {
      await this.#notificationService.sendNotification({
        type: 'slack',
        channel: this.#config.notifications.slack.channel,
        message: this.#formatSlackMessage(record, type)
      });
    } catch (error) {
      logger.error('Failed to send Slack notification', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Formats Slack message
   */
  #formatSlackMessage(record, type) {
    const emoji = type === 'critical' ? '🚨' : '⚠️';
    const title = type === 'critical' ? 'Critical Error' : 'Error Threshold Alert';

    return {
      text: `${emoji} ${title}`,
      attachments: [{
        color: type === 'critical' ? 'danger' : 'warning',
        fields: [
          {
            title: 'Error',
            value: record.message,
            short: false
          },
          {
            title: 'Category',
            value: record.category,
            short: true
          },
          {
            title: 'Severity',
            value: record.severity,
            short: true
          },
          {
            title: 'Count',
            value: record.groupCount || 1,
            short: true
          },
          {
            title: 'Error ID',
            value: record.id,
            short: true
          }
        ],
        footer: 'InsightSerenity Error Logger',
        ts: Math.floor(Date.now() / 1000)
      }]
    };
  }

  /**
   * @private
   * Sends email notification
   */
  async #sendEmailNotification(record, type) {
    try {
      await this.#notificationService.sendNotification({
        type: 'email',
        recipients: this.#config.notifications.email.recipients,
        subject: `[${type.toUpperCase()}] Error: ${record.message}`,
        body: this.#formatEmailBody(record, type)
      });
    } catch (error) {
      logger.error('Failed to send email notification', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Formats email body
   */
  #formatEmailBody(record, type) {
    return `
      <h2>${type === 'critical' ? 'Critical Error Alert' : 'Error Threshold Alert'}</h2>
      <p><strong>Error:</strong> ${record.message}</p>
      <p><strong>Category:</strong> ${record.category}</p>
      <p><strong>Severity:</strong> ${record.severity}</p>
      <p><strong>Error ID:</strong> ${record.id}</p>
      <p><strong>Timestamp:</strong> ${record.timestamp}</p>
      ${record.stack ? `<pre>${JSON.stringify(record.stack, null, 2)}</pre>` : ''}
    `;
  }

  /**
   * @private
   * Audits error
   */
  async #auditError(record) {
    try {
      await this.#auditService.logEvent({
        event: 'error.logged',
        severity: record.severity,
        correlationId: record.correlationId,
        metadata: {
          errorId: record.id,
          category: record.category,
          statusCode: record.statusCode,
          userId: record.user?.id,
          path: record.request?.path
        }
      });
    } catch (auditError) {
      logger.error('Failed to audit error', {
        error: auditError.message,
        errorId: record.id
      });
    }
  }

  /**
   * @private
   * Analyzes error trends
   */
  #analyzeTrends() {
    const trends = {
      byCategory: {},
      bySeverity: {},
      byHour: {}
    };

    for (const [key, data] of this.#errorTrends.entries()) {
      const [category, hour] = key.split(':');
      
      if (!trends.byCategory[category]) {
        trends.byCategory[category] = 0;
      }
      trends.byCategory[category] += data.count;

      if (!trends.byHour[hour]) {
        trends.byHour[hour] = 0;
      }
      trends.byHour[hour] += data.count;

      data.errors.forEach(error => {
        if (!trends.bySeverity[error.severity]) {
          trends.bySeverity[error.severity] = 0;
        }
        trends.bySeverity[error.severity]++;
      });
    }

    logger.info('Error trends analysis', trends);
  }

  /**
   * @private
   * Cleans up old data
   */
  #cleanupOldData() {
    const cutoff = Date.now() - 86400000; // 24 hours

    // Clean error groups
    for (const [fingerprint, group] of this.#errorGroups.entries()) {
      if (group.lastSeen < cutoff) {
        this.#errorGroups.delete(fingerprint);
      }
    }

    // Clean trends
    this.#errorTrends.clear();

    // Keep only recent critical errors
    if (this.#criticalErrors.size > 100) {
      this.#criticalErrors.clear();
    }

    logger.debug('Error logger cleanup completed');
  }

  /**
   * @private
   * Generates error ID
   */
  #generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets error statistics
   * @returns {Object} Error statistics
   */
  getStatistics() {
    const stats = {
      totalErrors: 0,
      criticalErrors: this.#criticalErrors.size,
      errorGroups: this.#errorGroups.size,
      byCategory: {},
      bySeverity: {},
      topErrors: []
    };

    // Calculate totals
    for (const [key, count] of this.#errorFrequency.entries()) {
      const [category, severity] = key.split(':');
      
      stats.totalErrors += count;
      
      stats.byCategory[category] = (stats.byCategory[category] || 0) + count;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + count;
    }

    // Get top error groups
    stats.topErrors = Array.from(this.#errorGroups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(group => ({
        fingerprint: group.fingerprint,
        count: group.count,
        firstSeen: new Date(group.firstSeen).toISOString(),
        lastSeen: new Date(group.lastSeen).toISOString(),
        sample: group.sample.message
      }));

    return stats;
  }

  /**
   * Clears metrics
   */
  clearMetrics() {
    this.#errorGroups.clear();
    this.#errorFrequency.clear();
    this.#criticalErrors.clear();
    this.#errorTrends.clear();
    logger.info('Error metrics cleared');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates ErrorLogger instance
 * @param {Object} [options] - Configuration options
 * @returns {ErrorLogger} ErrorLogger instance
 */
const getErrorLogger = (options) => {
  if (!instance) {
    instance = new ErrorLogger(options);
  }
  return instance;
};

module.exports = {
  ErrorLogger,
  getErrorLogger,
  // Export convenience methods
  logError: (error, context, req) => getErrorLogger().logError(error, context, req),
  middleware: (err, req, res, next) => getErrorLogger().middleware(err, req, res, next)
};