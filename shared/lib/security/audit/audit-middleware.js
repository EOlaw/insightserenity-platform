'use strict';

/**
 * @fileoverview Comprehensive audit middleware for security event tracking and compliance
 * @module shared/lib/security/audit/middleware/audit-middleware
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/config
 * @requires module:crypto
 */

const AuditService = require('./audit-service');
const AuditLogModel = require('../../database/models/security/audit-log-model');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../encryption/encryption-service');
const config = require('../../../config');
const crypto = require('crypto');

/**
 * @class AuditMiddleware
 * @description Enterprise-grade audit middleware for comprehensive security event tracking
 */
class AuditMiddleware {
  /**
   * @private
   * @static
   * @type {Object}
   */
  static defaultConfig = {
    enabled: process.env.AUDIT_MIDDLEWARE_ENABLED !== 'false',
    logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    includeRequestBody: process.env.AUDIT_INCLUDE_REQUEST_BODY !== 'false',
    includeResponseBody: process.env.AUDIT_INCLUDE_RESPONSE_BODY === 'true',
    maxBodySize: parseInt(process.env.AUDIT_MAX_BODY_SIZE || '10240', 10), // 10KB
    batchSize: parseInt(process.env.AUDIT_BATCH_SIZE || '100', 10),
    flushInterval: parseInt(process.env.AUDIT_FLUSH_INTERVAL || '5000', 10), // 5 seconds
    encryptSensitiveData: process.env.AUDIT_ENCRYPT_SENSITIVE !== 'false',
    retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '2555', 10), // 7 years
    sensitiveFields: [
      'password',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'cookie',
      'creditCard',
      'ssn',
      'bankAccount',
      'privateKey',
      'accessToken',
      'refreshToken'
    ],
    skipRoutes: [
      '/health',
      '/ping',
      '/favicon.ico',
      '/robots.txt',
      '/metrics'
    ],
    highRiskOperations: [
      'DELETE',
      'admin',
      'user-delete',
      'permission-change',
      'role-change',
      'system-config'
    ]
  };

  /**
   * @private
   * @static
   * @type {Map<string, Array>}
   */
  static #auditQueue = new Map();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #metrics = {
    totalRequests: 0,
    auditedRequests: 0,
    failedAudits: 0,
    lastFlush: Date.now()
  };

  /**
   * Creates audit middleware with configuration options
   * @param {Object} options - Configuration options
   * @returns {Function} Express middleware function
   */
  static middleware(options = {}) {
    const config = { ...AuditMiddleware.defaultConfig, ...options };

    return async (req, res, next) => {
      try {
        // Increment total requests
        AuditMiddleware.#metrics.totalRequests++;

        // Check if audit is enabled and not a skipped route
        if (!config.enabled || AuditMiddleware.#shouldSkipRequest(req, config)) {
          return next();
        }

        // Generate audit ID for tracking
        const auditId = AuditMiddleware.#generateAuditId();
        req.auditId = auditId;

        // Capture request start time
        const startTime = Date.now();

        // Store original end method to capture response
        const originalEnd = res.end;
        let responseBody = null;

        // Override response end to capture response data
        res.end = function(chunk, encoding) {
          if (config.includeResponseBody && chunk) {
            try {
              responseBody = chunk.toString();
              if (responseBody.length > config.maxBodySize) {
                responseBody = responseBody.substring(0, config.maxBodySize) + '... [TRUNCATED]';
              }
            } catch (error) {
              logger.warn('Failed to capture response body for audit', { error: error.message });
            }
          }

          // Call original end method
          originalEnd.call(this, chunk, encoding);

          // Perform async audit logging (don't block response)
          setImmediate(() => {
            AuditMiddleware.#logAuditEvent({
              auditId,
              req,
              res,
              responseBody,
              startTime,
              config
            });
          });
        };

        // Increment audited requests
        AuditMiddleware.#metrics.auditedRequests++;
        next();

      } catch (error) {
        logger.error('Audit middleware error', {
          error: error.message,
          stack: error.stack,
          path: req.path
        });
        AuditMiddleware.#metrics.failedAudits++;
        next(); // Continue even if audit fails
      }
    };
  }

  /**
   * @private
   * Check if request should be skipped
   */
  static #shouldSkipRequest(req, config) {
    // Skip static files
    if (/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(req.path)) {
      return true;
    }

    // Skip configured routes
    if (config.skipRoutes.some(route => req.path.startsWith(route))) {
      return true;
    }

    // Skip OPTIONS requests
    if (req.method === 'OPTIONS') {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Log audit event
   */
  static async #logAuditEvent({ auditId, req, res, responseBody, startTime, config }) {
    try {
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Determine event severity
      const severity = AuditMiddleware.#determineSeverity(req, res, config);
      
      // Determine event type
      const eventType = AuditMiddleware.#determineEventType(req, res);

      // Prepare audit data
      const auditData = {
        id: auditId,
        timestamp: new Date(),
        eventType,
        category: 'http_request',
        severity,
        success: res.statusCode < 400,
        actor: {
          id: req.user?.id || null,
          username: req.user?.username || null,
          role: req.user?.role || null,
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent')
        },
        target: {
          type: 'endpoint',
          id: req.path,
          resource: req.originalUrl
        },
        action: {
          type: req.method.toLowerCase(),
          description: `${req.method} ${req.path}`,
          parameters: req.params || {},
          query: req.query || {}
        },
        request: {
          method: req.method,
          url: req.originalUrl,
          path: req.path,
          headers: AuditMiddleware.#sanitizeHeaders(req.headers, config),
          body: config.includeRequestBody ? 
                AuditMiddleware.#sanitizeRequestBody(req.body, config) : null
        },
        response: {
          statusCode: res.statusCode,
          headers: AuditMiddleware.#sanitizeHeaders(res.getHeaders(), config),
          body: config.includeResponseBody ? 
                AuditMiddleware.#sanitizeResponseBody(responseBody, config) : null
        },
        metadata: {
          duration,
          requestSize: req.get('content-length') || 0,
          responseSize: res.get('content-length') || 0,
          server: req.isAdmin ? 'admin' : 'customer-services',
          tenantId: req.tenantId || null,
          organizationId: req.organizationId || null,
          sessionId: req.sessionID || null
        },
        compliance: {
          retention: config.retentionDays,
          encrypted: config.encryptSensitiveData,
          signature: null // Will be added if signing is enabled
        }
      };

      // Add audit context if available
      if (req.auditContext) {
        auditData.context = req.auditContext;
      }

      // Add to batch queue for efficient processing
      AuditMiddleware.#addToBatch(auditData, config);

      // Log to application logger based on severity
      const logMethod = severity === 'critical' ? 'error' : 
                       severity === 'high' ? 'warn' : 'info';
      
      logger[logMethod]('Audit event logged', {
        auditId,
        eventType,
        severity,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        user: req.user?.username || 'anonymous'
      });

    } catch (error) {
      logger.error('Failed to log audit event', {
        error: error.message,
        auditId,
        path: req.path
      });
      AuditMiddleware.#metrics.failedAudits++;
    }
  }

  /**
   * @private
   * Determine event severity
   */
  static #determineSeverity(req, res, config) {
    // Critical: Authentication failures, system errors, admin operations
    if (res.statusCode === 401 || res.statusCode === 403) {
      return 'critical';
    }
    
    if (res.statusCode >= 500) {
      return 'critical';
    }

    if (req.isAdmin || req.path.includes('/admin')) {
      return 'high';
    }

    // High: DELETE operations, user management, permission changes
    if (config.highRiskOperations.some(op => 
      req.method === op || req.path.includes(op) || req.body?.action === op
    )) {
      return 'high';
    }

    // Medium: Write operations, user actions
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return 'medium';
    }

    // Low: Read operations
    return 'low';
  }

  /**
   * @private
   * Determine event type
   */
  static #determineEventType(req, res) {
    // Authentication events
    if (req.path.includes('/auth/login')) {
      return res.statusCode === 200 ? 'auth.login.success' : 'auth.login.failure';
    }
    if (req.path.includes('/auth/logout')) {
      return 'auth.logout';
    }

    // Admin events
    if (req.isAdmin || req.path.includes('/admin')) {
      return `admin.${req.method.toLowerCase()}`;
    }

    // Data operations
    switch (req.method) {
      case 'GET':
        return 'data.access';
      case 'POST':
        return 'data.create';
      case 'PUT':
      case 'PATCH':
        return 'data.update';
      case 'DELETE':
        return 'data.delete';
      default:
        return 'http.request';
    }
  }

  /**
   * @private
   * Sanitize headers
   */
  static #sanitizeHeaders(headers, config) {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    config.sensitiveFields.forEach(field => {
      const lowerField = field.toLowerCase();
      Object.keys(sanitized).forEach(key => {
        if (key.toLowerCase().includes(lowerField)) {
          sanitized[key] = '[REDACTED]';
        }
      });
    });
    
    return sanitized;
  }

  /**
   * @private
   * Sanitize request body
   */
  static #sanitizeRequestBody(body, config) {
    if (!body) return null;
    
    try {
      const sanitized = JSON.parse(JSON.stringify(body));
      AuditMiddleware.#sanitizeObject(sanitized, config.sensitiveFields);
      
      // Limit size
      const bodyString = JSON.stringify(sanitized);
      if (bodyString.length > config.maxBodySize) {
        return bodyString.substring(0, config.maxBodySize) + '... [TRUNCATED]';
      }
      
      return sanitized;
    } catch (error) {
      return '[UNPARSEABLE]';
    }
  }

  /**
   * @private
   * Sanitize response body
   */
  static #sanitizeResponseBody(body, config) {
    if (!body) return null;
    
    try {
      const parsed = JSON.parse(body);
      AuditMiddleware.#sanitizeObject(parsed, config.sensitiveFields);
      return parsed;
    } catch (error) {
      // Return truncated string if not JSON
      if (body.length > config.maxBodySize) {
        return body.substring(0, config.maxBodySize) + '... [TRUNCATED]';
      }
      return body;
    }
  }

  /**
   * @private
   * Recursively sanitize object
   */
  static #sanitizeObject(obj, sensitiveFields) {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        AuditMiddleware.#sanitizeObject(obj[key], sensitiveFields);
      }
    });
  }

  /**
   * @private
   * Add audit data to batch queue
   */
  static #addToBatch(auditData, config) {
    const batchKey = AuditMiddleware.#getCurrentBatchKey(config);
    
    if (!AuditMiddleware.#auditQueue.has(batchKey)) {
      AuditMiddleware.#auditQueue.set(batchKey, []);
    }
    
    AuditMiddleware.#auditQueue.get(batchKey).push(auditData);
    
    // Check if batch is ready for processing
    if (AuditMiddleware.#auditQueue.get(batchKey).length >= config.batchSize) {
      AuditMiddleware.#processBatch(batchKey, config);
    }
  }

  /**
   * @private
   * Get current batch key
   */
  static #getCurrentBatchKey(config) {
    return `batch_${Math.floor(Date.now() / config.flushInterval)}`;
  }

  /**
   * @private
   * Process audit batch
   */
  static async #processBatch(batchKey, config) {
    const batch = AuditMiddleware.#auditQueue.get(batchKey);
    if (!batch || batch.length === 0) return;
    
    try {
      // Save to audit service
      await AuditService.logBatch(batch);
      
      // Remove processed batch
      AuditMiddleware.#auditQueue.delete(batchKey);
      
      logger.debug('Audit batch processed', {
        batchKey,
        batchSize: batch.length
      });
      
    } catch (error) {
      logger.error('Failed to process audit batch', {
        error: error.message,
        batchKey,
        batchSize: batch.length
      });
    }
  }

  /**
   * @private
   * Generate audit ID
   */
  static #generateAuditId() {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Flush all pending audit batches
   * @static
   * @returns {Promise<void>}
   */
  static async flush() {
    const batches = Array.from(AuditMiddleware.#auditQueue.keys());
    
    for (const batchKey of batches) {
      await AuditMiddleware.#processBatch(batchKey, AuditMiddleware.defaultConfig);
    }
    
    AuditMiddleware.#metrics.lastFlush = Date.now();
    logger.info('All audit batches flushed', { batchCount: batches.length });
  }

  /**
   * Get audit metrics
   * @static
   * @returns {Object} Current metrics
   */
  static getMetrics() {
    return {
      ...AuditMiddleware.#metrics,
      queuedBatches: AuditMiddleware.#auditQueue.size,
      queuedEvents: Array.from(AuditMiddleware.#auditQueue.values())
        .reduce((total, batch) => total + batch.length, 0)
    };
  }

  /**
   * Configure audit middleware
   * @static
   * @param {Object} updates - Configuration updates
   */
  static configure(updates) {
    Object.assign(AuditMiddleware.defaultConfig, updates);
    logger.info('Audit middleware configuration updated', updates);
  }
}

// Auto-flush batches periodically
setInterval(() => {
  AuditMiddleware.flush().catch(error => {
    logger.error('Auto-flush failed', { error: error.message });
  });
}, AuditMiddleware.defaultConfig.flushInterval);

// Export middleware function and utilities
module.exports = {
  auditMiddleware: AuditMiddleware.middleware,
  AuditMiddleware,
  flush: AuditMiddleware.flush,
  getMetrics: AuditMiddleware.getMetrics,
  configure: AuditMiddleware.configure
};