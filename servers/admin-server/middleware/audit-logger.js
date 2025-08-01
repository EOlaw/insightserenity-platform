'use strict';

/**
 * @fileoverview Comprehensive audit logging middleware for admin operations
 * @module servers/admin-server/middleware/audit-logger
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/notification-service
 * @requires module:servers/admin-server/config
 */

const AuditLogModel = require('../../../shared/lib/database/models/security/audit-log-model');
const logger = require('../../../shared/lib/utils/logger');
const NotificationService = require('../../../shared/lib/services/notification-service');
const config = require('../../../shared/config');
const crypto = require('crypto');

/**
 * @class AuditLoggerMiddleware
 * @description Comprehensive audit logging for admin actions with alerting
 */
class AuditLoggerMiddleware {
  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    enabled: config.audit?.enabled !== false,
    logLevel: config.audit?.logLevel || 'all', // all, write, sensitive
    includeRequestBody: config.audit?.includeRequestBody !== false,
    includeResponseBody: config.audit?.includeResponseBody !== false,
    maxBodySize: config.audit?.maxBodySize || 10240, // 10KB
    sensitiveFields: config.audit?.sensitiveFields || [
      'password',
      'token',
      'secret',
      'apiKey',
      'creditCard',
      'ssn',
      'bankAccount'
    ],
    alertOnSensitive: config.audit?.alertOnSensitive !== false,
    retentionDays: config.audit?.retentionDays || 365
  };

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #sensitiveOperations = new Set([
    'DELETE',
    'security.update',
    'permission.grant',
    'permission.revoke',
    'user.delete',
    'organization.delete',
    'billing.update',
    'configuration.update'
  ]);

  /**
   * @private
   * @static
   * @type {Map<string, string>}
   */
  static #actionMap = new Map([
    ['GET', 'read'],
    ['POST', 'create'],
    ['PUT', 'update'],
    ['PATCH', 'modify'],
    ['DELETE', 'delete']
  ]);

  /**
   * Main audit logging middleware
   * @static
   * @returns {Function} Express middleware
   */
  static middleware() {
    return async (req, res, next) => {
      if (!this.#config.enabled) {
        return next();
      }

      const auditContext = {
        id: this.#generateAuditId(),
        startTime: Date.now(),
        request: this.#captureRequestData(req)
      };

      // Store audit context
      req.auditContext = auditContext;

      // Capture response
      const originalSend = res.send;
      const originalJson = res.json;

      res.send = function(data) {
        res.locals.body = data;
        return originalSend.call(this, data);
      };

      res.json = function(data) {
        res.locals.body = data;
        return originalJson.call(this, data);
      };

      // Process response after completion
      res.on('finish', async () => {
        try {
          await AuditLoggerMiddleware.#processAuditLog(req, res, auditContext);
        } catch (error) {
          logger.error('Audit logging failed', {
            error: error.message,
            auditId: auditContext.id
          });
        }
      });

      next();
    };
  }

  /**
   * Middleware for logging sensitive operations
   * @static
   * @param {string} operation - Operation identifier
   * @returns {Function} Express middleware
   */
  static logOperation(operation) {
    return async (req, res, next) => {
      req.auditOperation = operation;
      req.auditSensitive = this.#sensitiveOperations.has(operation);
      
      if (req.auditSensitive) {
        logger.warn('Sensitive operation initiated', {
          operation,
          adminId: req.admin?._id,
          ip: req.ip
        });
      }

      next();
    };
  }

  /**
   * Log custom audit event
   * @static
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Created audit log
   */
  static async logEvent(eventData) {
    try {
      const {
        action,
        resource,
        resourceId,
        userId,
        organizationId,
        metadata = {},
        severity = 'info'
      } = eventData;

      const auditLog = await AuditLogModel.create({
        action,
        resource,
        resourceId,
        userId,
        organizationId,
        severity,
        metadata: {
          ...metadata,
          timestamp: new Date(),
          source: 'manual'
        }
      });

      // Alert on critical events
      if (severity === 'critical' || this.#sensitiveOperations.has(action)) {
        await this.#alertOnSensitiveAction(auditLog);
      }

      return auditLog;
    } catch (error) {
      logger.error('Failed to create audit log', {
        error: error.message,
        eventData
      });
      throw error;
    }
  }

  /**
   * @private
   * Process and store audit log
   */
  static async #processAuditLog(req, res, auditContext) {
    const endTime = Date.now();
    const duration = endTime - auditContext.startTime;

    // Determine if we should log this request
    if (!this.#shouldLog(req, res)) {
      return;
    }

    const auditData = {
      id: auditContext.id,
      timestamp: new Date(auditContext.startTime),
      duration,
      
      // User context
      userId: req.admin?._id,
      userName: req.admin?.name,
      userRole: req.admin?.role,
      organizationId: req.admin?.organizationId,
      
      // Request details
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      ip: this.#getClientIp(req),
      userAgent: req.get('user-agent'),
      
      // Action details
      action: this.#determineAction(req),
      resource: this.#extractResource(req),
      resourceId: this.#extractResourceId(req),
      operation: req.auditOperation,
      
      // Request/Response data
      request: auditContext.request,
      response: this.#captureResponseData(res),
      
      // Status
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      error: res.statusCode >= 400 ? this.#extractError(res) : null,
      
      // Metadata
      metadata: {
        headers: this.#sanitizeHeaders(req.headers),
        query: req.query,
        sessionId: req.session?.id,
        correlationId: req.correlationId,
        sensitive: req.auditSensitive || false
      }
    };

    // Create audit log
    await AuditLogModel.create(auditData);

    // Log to system logger
    const logLevel = this.#getLogLevel(auditData);
    logger[logLevel]('Admin action logged', {
      auditId: auditData.id,
      action: auditData.action,
      user: auditData.userId,
      resource: auditData.resource,
      status: auditData.statusCode,
      duration
    });

    // Alert on sensitive operations
    if (auditData.metadata.sensitive || auditData.error) {
      await this.#alertOnSensitiveAction(auditData);
    }
  }

  /**
   * @private
   * Capture request data
   */
  static #captureRequestData(req) {
    const data = {
      method: req.method,
      path: req.path,
      params: req.params
    };

    if (this.#config.includeRequestBody && req.body) {
      data.body = this.#sanitizeData(req.body);
    }

    return data;
  }

  /**
   * @private
   * Capture response data
   */
  static #captureResponseData(res) {
    const data = {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage
    };

    if (this.#config.includeResponseBody && res.locals.body) {
      const body = typeof res.locals.body === 'string' 
        ? this.#tryParseJSON(res.locals.body) 
        : res.locals.body;

      if (JSON.stringify(body).length <= this.#config.maxBodySize) {
        data.body = this.#sanitizeData(body);
      } else {
        data.body = { truncated: true, size: JSON.stringify(body).length };
      }
    }

    return data;
  }

  /**
   * @private
   * Determine if request should be logged
   */
  static #shouldLog(req, res) {
    // Skip health checks and metrics
    if (req.path === '/health' || req.path === '/metrics') {
      return false;
    }

    // Log based on level configuration
    switch (this.#config.logLevel) {
      case 'all':
        return true;
      case 'write':
        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      case 'sensitive':
        return req.auditSensitive === true;
      default:
        return true;
    }
  }

  /**
   * @private
   * Determine action from request
   */
  static #determineAction(req) {
    if (req.auditOperation) {
      return req.auditOperation;
    }

    const method = this.#actionMap.get(req.method) || req.method.toLowerCase();
    const resource = this.#extractResource(req);
    
    return `${resource}.${method}`;
  }

  /**
   * @private
   * Extract resource from request path
   */
  static #extractResource(req) {
    const pathParts = req.path.split('/').filter(Boolean);
    
    // Skip version prefix if present
    if (pathParts[0] && pathParts[0].startsWith('v')) {
      pathParts.shift();
    }

    // Return first meaningful part
    return pathParts[0] || 'unknown';
  }

  /**
   * @private
   * Extract resource ID from request
   */
  static #extractResourceId(req) {
    // Check params
    const idParams = ['id', '_id', 'resourceId', 'userId', 'organizationId'];
    for (const param of idParams) {
      if (req.params[param]) {
        return req.params[param];
      }
    }

    // Check body for creation
    if (req.method === 'POST' && req.body?._id) {
      return req.body._id;
    }

    return null;
  }

  /**
   * @private
   * Sanitize sensitive data
   */
  static #sanitizeData(data, depth = 0) {
    if (depth > 5) return '[DEPTH_LIMIT]';
    
    if (Array.isArray(data)) {
      return data.map(item => this.#sanitizeData(item, depth + 1));
    }

    if (data && typeof data === 'object') {
      const sanitized = {};
      
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        
        // Check if field is sensitive
        const isSensitive = this.#config.sensitiveFields.some(field => 
          lowerKey.includes(field.toLowerCase())
        );

        if (isSensitive) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.#sanitizeData(value, depth + 1);
        }
      }

      return sanitized;
    }

    return data;
  }

  /**
   * @private
   * Sanitize headers
   */
  static #sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-admin-token'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * @private
   * Get client IP address
   */
  static #getClientIp(req) {
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.connection?.remoteAddress ||
           'unknown';
  }

  /**
   * @private
   * Extract error information
   */
  static #extractError(res) {
    if (res.locals.body?.error) {
      return {
        message: res.locals.body.error.message,
        code: res.locals.body.error.code,
        details: res.locals.body.error.details
      };
    }

    return {
      message: res.statusMessage || 'Unknown error',
      code: res.statusCode
    };
  }

  /**
   * @private
   * Determine log level based on audit data
   */
  static #getLogLevel(auditData) {
    if (auditData.error || auditData.statusCode >= 500) {
      return 'error';
    }
    if (auditData.statusCode >= 400) {
      return 'warn';
    }
    if (auditData.metadata.sensitive) {
      return 'warn';
    }
    return 'info';
  }

  /**
   * @private
   * Alert on sensitive actions
   */
  static async #alertOnSensitiveAction(auditData) {
    if (!this.#config.alertOnSensitive) return;

    try {
      const alertData = {
        type: 'admin.sensitive_action',
        severity: 'high',
        title: `Sensitive Admin Action: ${auditData.action}`,
        description: `User ${auditData.userName || auditData.userId} performed sensitive action`,
        data: {
          action: auditData.action,
          resource: auditData.resource,
          resourceId: auditData.resourceId,
          user: {
            id: auditData.userId,
            name: auditData.userName,
            role: auditData.userRole
          },
          ip: auditData.ip,
          timestamp: auditData.timestamp,
          success: auditData.success
        }
      };

      // Send notification to security team
      await NotificationService.sendToSecurityTeam(alertData);

      // Log security event
      logger.security('Sensitive admin action alert', alertData);

    } catch (error) {
      logger.error('Failed to send security alert', {
        error: error.message,
        auditId: auditData.id
      });
    }
  }

  /**
   * @private
   * Generate unique audit ID
   */
  static #generateAuditId() {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Try to parse JSON string
   */
  static #tryParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }

  /**
   * Get audit configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return { ...this.#config };
  }

  /**
   * Update audit configuration
   * @static
   * @param {Object} updates - Configuration updates
   */
  static updateConfig(updates) {
    Object.assign(this.#config, updates);
    logger.info('Audit configuration updated', updates);
  }
}

// Export middleware and utility functions
module.exports = {
  middleware: AuditLoggerMiddleware.middleware.bind(AuditLoggerMiddleware),
  logOperation: AuditLoggerMiddleware.logOperation.bind(AuditLoggerMiddleware),
  logEvent: AuditLoggerMiddleware.logEvent.bind(AuditLoggerMiddleware),
  getConfig: AuditLoggerMiddleware.getConfig.bind(AuditLoggerMiddleware),
  updateConfig: AuditLoggerMiddleware.updateConfig.bind(AuditLoggerMiddleware)
};