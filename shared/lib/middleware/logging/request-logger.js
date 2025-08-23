'use strict';

/**
 * @fileoverview Request logger middleware for comprehensive HTTP request logging
 * @module shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/config
 * @requires module:morgan
 * @requires module:on-finished
 * @requires module:on-headers
 */

const logger = require('../../utils/logger');
const CacheService = require('../../services/cache-service');
// const stringHelper = require('../../utils/helpers/string-helper');
// const config = require('../helmet-config');
const morgan = require('morgan');
const onFinished = require('on-finished');
const onHeaders = require('on-headers');

/**
 * @class RequestLogger
 * @description Advanced request logger with multiple output formats, filtering,
 * sampling, and integration with external logging services
 */
class RequestLogger {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #activeRequests;

  /**
   * @private
   * @type {Map<string, number>}
   */
  #requestMetrics;

  /**
   * @private
   * @type {Set<string>}
   */
  #slowRequests;

  /**
   * @private
   * @type {Object}
   */
  #morganInstance;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enabled: process.env.REQUEST_LOGGER_ENABLED !== 'false',
    format: process.env.REQUEST_LOGGER_FORMAT || 'combined',
    level: process.env.REQUEST_LOGGER_LEVEL || 'info',
    includeBody: process.env.REQUEST_LOGGER_INCLUDE_BODY === 'true',
    includeHeaders: process.env.REQUEST_LOGGER_INCLUDE_HEADERS === 'true',
    includeQuery: process.env.REQUEST_LOGGER_INCLUDE_QUERY !== 'false',
    includeCookies: process.env.REQUEST_LOGGER_INCLUDE_COOKIES === 'true',
    includeUserAgent: process.env.REQUEST_LOGGER_INCLUDE_USER_AGENT !== 'false',
    includeResponseTime: process.env.REQUEST_LOGGER_INCLUDE_RESPONSE_TIME !== 'false',
    includeMemoryUsage: process.env.REQUEST_LOGGER_INCLUDE_MEMORY === 'true',
    slowRequestThreshold: parseInt(process.env.REQUEST_LOGGER_SLOW_THRESHOLD || '1000', 10), // 1 second
    samplingRate: parseFloat(process.env.REQUEST_LOGGER_SAMPLING_RATE || '1.0'), // 100%
    maxBodySize: parseInt(process.env.REQUEST_LOGGER_MAX_BODY_SIZE || '10240', 10), // 10KB
    skipPaths: [
      '/health',
      '/metrics',
      '/favicon.ico',
      '/.well-known'
    ],
    skipExtensions: [
      '.js',
      '.css',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.ico',
      '.woff',
      '.woff2'
    ],
    sensitiveHeaders: [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'x-csrf-token'
    ],
    sensitiveFields: [
      'password',
      'token',
      'secret',
      'apiKey',
      'creditCard',
      'ssn',
      'bankAccount'
    ],
    outputTargets: {
      console: process.env.REQUEST_LOGGER_CONSOLE !== 'false',
      file: process.env.REQUEST_LOGGER_FILE === 'true',
      external: process.env.REQUEST_LOGGER_EXTERNAL === 'true'
    },
    externalServices: {
      datadog: {
        enabled: process.env.DATADOG_ENABLED === 'true',
        apiKey: process.env.DATADOG_API_KEY,
        service: process.env.DATADOG_SERVICE_NAME || 'insightserenity-api'
      },
      elk: {
        enabled: process.env.ELK_ENABLED === 'true',
        host: process.env.ELK_HOST,
        port: process.env.ELK_PORT
      },
      splunk: {
        enabled: process.env.SPLUNK_ENABLED === 'true',
        token: process.env.SPLUNK_TOKEN,
        url: process.env.SPLUNK_URL
      }
    },
    customTokens: {
      correlationId: 'correlation-id',
      userId: 'user-id',
      organizationId: 'organization-id',
      tenantId: 'tenant-id',
      sessionId: 'session-id'
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #LOG_FORMATS = {
    tiny: ':method :url :status :res[content-length] - :response-time ms',
    short: ':remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms',
    dev: ':method :url :status :response-time ms - :res[content-length]',
    common: ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]',
    combined: ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
    json: JSON.stringify({
      timestamp: ':date[iso]',
      method: ':method',
      url: ':url',
      status: ':status',
      responseTime: ':response-time',
      contentLength: ':res[content-length]',
      remoteAddr: ':remote-addr',
      userAgent: ':user-agent',
      referrer: ':referrer'
    })
  };

  /**
   * Creates RequestLogger instance
   * @param {Object} [options] - Configuration options
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#activeRequests = new Map();
    this.#requestMetrics = new Map();
    this.#slowRequests = new Set();

    // Initialize Morgan
    this.#initializeMorgan();

    // Start metrics collection
    this.#startMetricsCollection();

    logger.info('RequestLogger initialized', {
      enabled: this.#config.enabled,
      format: this.#config.format,
      samplingRate: this.#config.samplingRate
    });
  }

  /**
   * Express middleware for request logging
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   * @returns {void}
   */
  log = (req, res, next) => {
    if (!this.#config.enabled) {
      return next();
    }

    // Check if should skip
    if (this.#shouldSkipRequest(req)) {
      return next();
    }

    // Check sampling
    if (!this.#shouldSample()) {
      return next();
    }

    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    const requestId = req.correlationId || this.#generateRequestId();

    // Store request start data
    const requestData = {
      id: requestId,
      startTime,
      startMemory,
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      ip: this.#getClientIp(req),
      userAgent: req.get('user-agent'),
      referer: req.get('referer'),
      userId: req.user?.id || req.user?._id,
      organizationId: req.user?.organizationId,
      tenantId: req.tenant?.id || req.tenant?._id,
      sessionId: req.session?.id
    };

    // Track active request
    this.#activeRequests.set(requestId, requestData);

    // Capture request details
    this.#captureRequestDetails(req, requestData);

    // Use Morgan for basic logging
    if (this.#morganInstance) {
      this.#morganInstance(req, res, () => {});
    }

    // Capture response headers timing
    onHeaders(res, () => {
      requestData.headersSentAt = Date.now();
      requestData.headersDuration = requestData.headersSentAt - startTime;
    });

    // Log when request finishes
    onFinished(res, (err, res) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const endMemory = this.#config.includeMemoryUsage ? process.memoryUsage() : null;

      // Update request data
      requestData.endTime = endTime;
      requestData.duration = duration;
      requestData.status = res.statusCode;
      requestData.contentLength = res.get('content-length');
      requestData.error = err;

      if (endMemory) {
        requestData.memoryDelta = {
          rss: endMemory.rss - startMemory.rss,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external
        };
      }

      // Log the request
      this.#logRequest(requestData, req, res);

      // Track metrics
      this.#trackRequestMetrics(requestData);

      // Check for slow requests
      if (duration > this.#config.slowRequestThreshold) {
        this.#handleSlowRequest(requestData);
      }

      // Clean up
      this.#activeRequests.delete(requestId);
    });

    next();
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...RequestLogger.#DEFAULT_CONFIG };

    Object.keys(RequestLogger.#DEFAULT_CONFIG).forEach(key => {
      if (typeof RequestLogger.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(RequestLogger.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...RequestLogger.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    // Parse skip paths from environment
    if (process.env.REQUEST_LOGGER_SKIP_PATHS) {
      merged.skipPaths = process.env.REQUEST_LOGGER_SKIP_PATHS.split(',').map(p => p.trim());
    }

    return merged;
  }

  /**
   * @private
   * Initializes Morgan instance
   */
  #initializeMorgan() {
    if (!this.#config.outputTargets.console) {
      return;
    }

    // Define custom tokens
    Object.entries(this.#config.customTokens).forEach(([name, header]) => {
      morgan.token(name, (req) => req[name] || req.get(header) || '-');
    });

    // Additional custom tokens
    morgan.token('user-id', (req) => req.user?.id || req.user?._id || '-');
    morgan.token('organization-id', (req) => req.user?.organizationId || '-');
    morgan.token('tenant-id', (req) => req.tenant?.id || req.tenant?._id || '-');
    morgan.token('session-id', (req) => req.session?.id || '-');
    morgan.token('response-time-ms', (req, res) => {
      const startTime = req._startTime || Date.now();
      return Date.now() - startTime;
    });

    // Get format
    const format = RequestLogger.#LOG_FORMATS[this.#config.format] || this.#config.format;

    // Create Morgan instance with custom stream
    this.#morganInstance = morgan(format, {
      stream: {
        write: (message) => {
          logger[this.#config.level](message.trim());
        }
      },
      skip: (req) => this.#shouldSkipRequest(req)
    });
  }

  /**
   * @private
   * Starts metrics collection
   */
  #startMetricsCollection() {
    // Clean up metrics periodically
    setInterval(() => {
      this.#cleanupMetrics();
    }, 300000); // 5 minutes
  }

  /**
   * @private
   * Checks if request should be skipped
   */
  #shouldSkipRequest(req) {
    const path = req.path || req.url;

    // Skip configured paths
    if (this.#config.skipPaths.some(skip => path.startsWith(skip))) {
      return true;
    }

    // Skip static file extensions
    if (this.#config.skipExtensions.some(ext => path.endsWith(ext))) {
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
   * Checks if request should be sampled
   */
  #shouldSample() {
    return Math.random() < this.#config.samplingRate;
  }

  /**
   * @private
   * Gets client IP address
   */
  #getClientIp(req) {
    return req.ip || 
           req.get('x-forwarded-for')?.split(',')[0] || 
           req.get('x-real-ip') ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  /**
   * @private
   * Captures request details
   */
  #captureRequestDetails(req, requestData) {
    // Capture query parameters
    if (this.#config.includeQuery && Object.keys(req.query).length > 0) {
      requestData.query = this.#sanitizeObject(req.query);
    }

    // Capture headers
    if (this.#config.includeHeaders) {
      requestData.headers = this.#sanitizeHeaders(req.headers);
    }

    // Capture body
    if (this.#config.includeBody && req.body) {
      const bodyString = JSON.stringify(req.body);
      if (bodyString.length <= this.#config.maxBodySize) {
        requestData.body = this.#sanitizeObject(req.body);
      } else {
        requestData.body = '[Body too large]';
      }
    }

    // Capture cookies
    if (this.#config.includeCookies && req.cookies) {
      requestData.cookies = Object.keys(req.cookies);
    }
  }

  /**
   * @private
   * Sanitizes headers
   */
  #sanitizeHeaders(headers) {
    const sanitized = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      if (this.#config.sensitiveHeaders.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 200) {
        sanitized[key] = value.substring(0, 200) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * @private
   * Sanitizes object removing sensitive data
   */
  #sanitizeObject(obj, depth = 0) {
    if (depth > 5) return '[Max depth exceeded]';
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.#isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.#sanitizeObject(value, depth + 1);
      } else if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * @private
   * Checks if field is sensitive
   */
  #isSensitiveField(field) {
    const lowerField = field.toLowerCase();
    return this.#config.sensitiveFields.some(sensitive => 
      lowerField.includes(sensitive.toLowerCase())
    );
  }

  /**
   * @private
   * Logs the request
   */
  #logRequest(requestData, req, res) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      correlationId: requestData.id,
      method: requestData.method,
      path: requestData.path,
      url: requestData.url,
      status: requestData.status,
      duration: requestData.duration,
      ip: requestData.ip,
      userId: requestData.userId,
      organizationId: requestData.organizationId,
      tenantId: requestData.tenantId,
      sessionId: requestData.sessionId
    };

    // Add optional fields
    if (this.#config.includeUserAgent) {
      logEntry.userAgent = requestData.userAgent;
    }

    if (this.#config.includeResponseTime) {
      logEntry.responseTime = {
        total: requestData.duration,
        headers: requestData.headersDuration
      };
    }

    if (requestData.query) {
      logEntry.query = requestData.query;
    }

    if (requestData.headers) {
      logEntry.headers = requestData.headers;
    }

    if (requestData.body) {
      logEntry.body = requestData.body;
    }

    if (requestData.memoryDelta) {
      logEntry.memory = requestData.memoryDelta;
    }

    if (requestData.error) {
      logEntry.error = {
        message: requestData.error.message,
        code: requestData.error.code
      };
    }

    // Log based on status
    const level = this.#getLogLevel(requestData.status);
    logger[level]('HTTP Request', logEntry);

    // Send to external services
    if (this.#config.outputTargets.external) {
      this.#sendToExternalServices(logEntry);
    }
  }

  /**
   * @private
   * Gets log level based on status
   */
  #getLogLevel(status) {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    if (status >= 300) return 'info';
    return this.#config.level;
  }

  /**
   * @private
   * Tracks request metrics
   */
  #trackRequestMetrics(requestData) {
    const key = `${requestData.method}:${requestData.path}`;
    
    if (!this.#requestMetrics.has(key)) {
      this.#requestMetrics.set(key, {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        statuses: {}
      });
    }

    const metrics = this.#requestMetrics.get(key);
    metrics.count++;
    metrics.totalDuration += requestData.duration;
    metrics.minDuration = Math.min(metrics.minDuration, requestData.duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, requestData.duration);
    metrics.avgDuration = metrics.totalDuration / metrics.count;
    
    // Track status codes
    metrics.statuses[requestData.status] = (metrics.statuses[requestData.status] || 0) + 1;
  }

  /**
   * @private
   * Handles slow request
   */
  #handleSlowRequest(requestData) {
    const key = `${requestData.method}:${requestData.path}`;
    this.#slowRequests.add(key);

    logger.warn('Slow request detected', {
      correlationId: requestData.id,
      method: requestData.method,
      path: requestData.path,
      duration: requestData.duration,
      threshold: this.#config.slowRequestThreshold,
      userId: requestData.userId
    });

    // Cache slow request data for analysis
    const cacheKey = `slow_request:${requestData.id}`;
    this.#cacheService.set(cacheKey, requestData, 3600).catch(err => {
      logger.error('Failed to cache slow request', { error: err.message });
    });
  }

  /**
   * @private
   * Sends log to external services
   */
  async #sendToExternalServices(logEntry) {
    const promises = [];

    // Datadog
    if (this.#config.externalServices.datadog.enabled) {
      promises.push(this.#sendToDatadog(logEntry));
    }

    // ELK
    if (this.#config.externalServices.elk.enabled) {
      promises.push(this.#sendToElk(logEntry));
    }

    // Splunk
    if (this.#config.externalServices.splunk.enabled) {
      promises.push(this.#sendToSplunk(logEntry));
    }

    // Execute all sends asynchronously
    Promise.all(promises).catch(error => {
      logger.error('Failed to send logs to external services', {
        error: error.message
      });
    });
  }

  /**
   * @private
   * Sends log to Datadog
   */
  async #sendToDatadog(logEntry) {
    // Implementation would use Datadog API
    // This is a placeholder
    logger.debug('Would send to Datadog', { service: this.#config.externalServices.datadog.service });
  }

  /**
   * @private
   * Sends log to ELK
   */
  async #sendToElk(logEntry) {
    // Implementation would use Elasticsearch client
    // This is a placeholder
    logger.debug('Would send to ELK', { host: this.#config.externalServices.elk.host });
  }

  /**
   * @private
   * Sends log to Splunk
   */
  async #sendToSplunk(logEntry) {
    // Implementation would use Splunk HTTP Event Collector
    // This is a placeholder
    logger.debug('Would send to Splunk', { url: this.#config.externalServices.splunk.url });
  }

  /**
   * @private
   * Cleans up old metrics
   */
  #cleanupMetrics() {
    // Keep only recent metrics
    const maxMetrics = 1000;
    
    if (this.#requestMetrics.size > maxMetrics) {
      const entries = Array.from(this.#requestMetrics.entries());
      const toKeep = entries
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, maxMetrics / 2);
      
      this.#requestMetrics.clear();
      toKeep.forEach(([key, value]) => this.#requestMetrics.set(key, value));
    }

    // Clear slow requests periodically
    if (this.#slowRequests.size > 100) {
      this.#slowRequests.clear();
    }
  }

  /**
   * @private
   * Generates request ID
   */
  #generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets current active requests
   * @returns {Array} Active requests
   */
  getActiveRequests() {
    return Array.from(this.#activeRequests.values()).map(req => ({
      id: req.id,
      method: req.method,
      path: req.path,
      duration: Date.now() - req.startTime,
      userId: req.userId
    }));
  }

  /**
   * Gets request metrics
   * @returns {Object} Request metrics
   */
  getMetrics() {
    const metrics = {
      activeRequests: this.#activeRequests.size,
      totalRequests: 0,
      endpoints: {},
      slowEndpoints: Array.from(this.#slowRequests),
      topEndpoints: []
    };

    for (const [endpoint, data] of this.#requestMetrics.entries()) {
      metrics.totalRequests += data.count;
      metrics.endpoints[endpoint] = {
        count: data.count,
        avgDuration: Math.round(data.avgDuration),
        minDuration: data.minDuration,
        maxDuration: data.maxDuration,
        statuses: data.statuses
      };
    }

    // Get top 10 endpoints
    metrics.topEndpoints = Array.from(this.#requestMetrics.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([endpoint, data]) => ({
        endpoint,
        count: data.count,
        avgDuration: Math.round(data.avgDuration)
      }));

    return metrics;
  }

  /**
   * Clears metrics
   */
  clearMetrics() {
    this.#requestMetrics.clear();
    this.#slowRequests.clear();
    logger.info('Request metrics cleared');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates RequestLogger instance
 * @param {Object} [options] - Configuration options
 * @returns {RequestLogger} RequestLogger instance
 */
const getRequestLogger = (options) => {
  if (!instance) {
    instance = new RequestLogger(options);
  }
  return instance;
};

module.exports = {
  RequestLogger,
  getRequestLogger,
  // Export convenience middleware
  log: (req, res, next) => getRequestLogger().log(req, res, next)
};