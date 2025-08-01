'use strict';

/**
 * @fileoverview 404 Not Found error handler middleware
 * @module shared/lib/middleware/error-handlers/not-found-handler
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/config
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const AuditService = require('../../security/audit/audit-service');
const CacheService = require('../../services/cache-service');
const config = require('../helmet-config');

/**
 * @class NotFoundHandler
 * @description Handles 404 errors with intelligent suggestions, route analysis,
 * and multi-tenant awareness
 */
class NotFoundHandler {
  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

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
   * @type {Map<string, number>}
   */
  #notFoundMetrics;

  /**
   * @private
   * @type {Map<string, string[]>}
   */
  #routeSuggestions;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    enableAudit: process.env.NOT_FOUND_ENABLE_AUDIT === 'true',
    enableSuggestions: process.env.NOT_FOUND_ENABLE_SUGGESTIONS !== 'false',
    enableMetrics: process.env.NOT_FOUND_ENABLE_METRICS !== 'false',
    enableCache: process.env.NOT_FOUND_ENABLE_CACHE !== 'false',
    cacheTimeout: parseInt(process.env.NOT_FOUND_CACHE_TIMEOUT || '3600', 10), // 1 hour
    maxSuggestions: parseInt(process.env.NOT_FOUND_MAX_SUGGESTIONS || '5', 10),
    suggestionThreshold: parseFloat(process.env.NOT_FOUND_SUGGESTION_THRESHOLD || '0.6'),
    commonRoutes: {
      admin: [
        '/admin/dashboard',
        '/admin/users',
        '/admin/organizations',
        '/admin/settings',
        '/admin/reports'
      ],
      api: [
        '/api/auth/login',
        '/api/auth/logout',
        '/api/users',
        '/api/organizations',
        '/api/health'
      ],
      customer: [
        '/clients',
        '/projects',
        '/consultants',
        '/engagements',
        '/analytics'
      ]
    },
    excludePatterns: [
      /^\/\.well-known/,
      /\.(jpg|jpeg|png|gif|ico|css|js|map)$/i,
      /^\/favicon\.ico$/,
      /^\/robots\.txt$/,
      /^\/sitemap\.xml$/
    ],
    suspiciousPatterns: [
      /\.(php|asp|aspx|jsp|cgi)$/i,
      /\/(wp-admin|phpmyadmin|admin\.php)/i,
      /\/(shell|cmd|eval|exec)/i,
      /\.\.\//,
      /<script/i
    ],
    messages: {
      default: 'The requested resource could not be found',
      api: 'The API endpoint does not exist',
      admin: 'The admin page does not exist',
      tenant: 'The resource does not exist in this organization',
      suspicious: 'Invalid request'
    }
  };

  /**
   * Creates NotFoundHandler instance
   * @param {Object} [options] - Configuration options
   * @param {AuditService} [auditService] - Audit service instance
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, auditService, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#auditService = auditService || new AuditService();
    this.#cacheService = cacheService || new CacheService();
    this.#notFoundMetrics = new Map();
    this.#routeSuggestions = new Map();

    // Initialize route suggestions
    this.#initializeRouteSuggestions();

    logger.info('NotFoundHandler initialized', {
      enableAudit: this.#config.enableAudit,
      enableSuggestions: this.#config.enableSuggestions,
      enableMetrics: this.#config.enableMetrics
    });
  }

  /**
   * Express middleware for handling 404 errors
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  handle = async (req, res, next) => {
    const correlationId = req.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      // Check if should be excluded
      if (this.#shouldExclude(req.path)) {
        return next();
      }

      // Detect suspicious requests
      const isSuspicious = this.#detectSuspiciousRequest(req);

      // Log 404 event
      await this.#log404Event(req, correlationId, isSuspicious);

      // Track metrics
      if (this.#config.enableMetrics) {
        this.#trackMetrics(req, isSuspicious);
      }

      // Audit if enabled
      if (this.#config.enableAudit || isSuspicious) {
        await this.#audit404Event(req, correlationId, isSuspicious);
      }

      // Build error response
      const error = await this.#build404Error(req, correlationId, isSuspicious);

      // Send response
      res.status(404).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
          correlationId,
          ...(error.suggestions && { suggestions: error.suggestions })
        },
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
      });

      const duration = Date.now() - startTime;
      logger.debug('404 response sent', {
        correlationId,
        path: req.path,
        duration
      });

    } catch (error) {
      logger.error('NotFoundHandler error', {
        error: error.message,
        correlationId
      });

      // Fallback to default 404
      res.status(404).json({
        success: false,
        error: {
          message: 'The requested resource could not be found',
          code: ERROR_CODES.NOT_FOUND,
          correlationId
        }
      });
    }
  };

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...NotFoundHandler.#DEFAULT_CONFIG };

    Object.keys(NotFoundHandler.#DEFAULT_CONFIG).forEach(key => {
      if (typeof NotFoundHandler.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(NotFoundHandler.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...NotFoundHandler.#DEFAULT_CONFIG[key],
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
   * Initializes route suggestions map
   */
  #initializeRouteSuggestions() {
    // Flatten all routes for easier searching
    const allRoutes = [];
    
    Object.values(this.#config.commonRoutes).forEach(routes => {
      allRoutes.push(...routes);
    });

    // Create a map for quick lookup
    allRoutes.forEach(route => {
      const segments = route.split('/').filter(s => s);
      segments.forEach((segment, index) => {
        const key = segments.slice(0, index + 1).join('/');
        if (!this.#routeSuggestions.has(key)) {
          this.#routeSuggestions.set(key, []);
        }
        this.#routeSuggestions.get(key).push(route);
      });
    });
  }

  /**
   * @private
   * Checks if path should be excluded from 404 handling
   */
  #shouldExclude(path) {
    return this.#config.excludePatterns.some(pattern => pattern.test(path));
  }

  /**
   * @private
   * Detects suspicious request patterns
   */
  #detectSuspiciousRequest(req) {
    // Check path patterns
    if (this.#config.suspiciousPatterns.some(pattern => pattern.test(req.path))) {
      return true;
    }

    // Check query parameters
    const queryString = JSON.stringify(req.query);
    if (this.#config.suspiciousPatterns.some(pattern => pattern.test(queryString))) {
      return true;
    }

    // Check headers
    const suspiciousHeaders = ['x-forwarded-host', 'x-original-url', 'x-rewrite-url'];
    if (suspiciousHeaders.some(header => req.headers[header])) {
      return true;
    }

    // Check for SQL injection patterns
    const sqlPatterns = /(\bselect\b|\bunion\b|\bdrop\b|\binsert\b|\bupdate\b|\bdelete\b)/i;
    if (sqlPatterns.test(req.path) || sqlPatterns.test(queryString)) {
      return true;
    }

    return false;
  }

  /**
   * @private
   * Logs 404 event
   */
  async #log404Event(req, correlationId, isSuspicious) {
    const logData = {
      correlationId,
      path: req.path,
      method: req.method,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      referer: req.get('referer'),
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      userId: req.user?.id || req.user?._id,
      organizationId: req.user?.organizationId,
      tenantId: req.tenant?.id || req.tenant?._id,
      isSuspicious
    };

    if (isSuspicious) {
      logger.warn('Suspicious 404 request detected', logData);
    } else {
      logger.info('404 Not Found', logData);
    }
  }

  /**
   * @private
   * Tracks 404 metrics
   */
  #trackMetrics(req, isSuspicious) {
    const key = isSuspicious ? 'suspicious' : req.path;
    const current = this.#notFoundMetrics.get(key) || 0;
    this.#notFoundMetrics.set(key, current + 1);

    // Clean old metrics periodically
    if (this.#notFoundMetrics.size > 1000) {
      this.#cleanOldMetrics();
    }
  }

  /**
   * @private
   * Cleans old metrics
   */
  #cleanOldMetrics() {
    // Keep top 500 most frequent 404s
    const sorted = Array.from(this.#notFoundMetrics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 500);
    
    this.#notFoundMetrics.clear();
    sorted.forEach(([key, value]) => this.#notFoundMetrics.set(key, value));
  }

  /**
   * @private
   * Audits 404 event
   */
  async #audit404Event(req, correlationId, isSuspicious) {
    try {
      await this.#auditService.logEvent({
        event: isSuspicious ? 'security.suspicious_404' : 'http.404_not_found',
        severity: isSuspicious ? 'warning' : 'info',
        userId: req.user?.id || req.user?._id,
        organizationId: req.user?.organizationId,
        tenantId: req.tenant?.id || req.tenant?._id,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        correlationId,
        metadata: {
          path: req.path,
          method: req.method,
          query: req.query,
          referer: req.get('referer'),
          isSuspicious
        }
      });
    } catch (error) {
      logger.error('Failed to audit 404 event', {
        error: error.message,
        correlationId
      });
    }
  }

  /**
   * @private
   * Builds 404 error with suggestions
   */
  async #build404Error(req, correlationId, isSuspicious) {
    // Return generic message for suspicious requests
    if (isSuspicious) {
      return {
        message: this.#config.messages.suspicious,
        code: ERROR_CODES.FORBIDDEN
      };
    }

    // Determine context
    const context = this.#determineContext(req);
    const message = this.#config.messages[context] || this.#config.messages.default;

    const error = {
      message,
      code: ERROR_CODES.NOT_FOUND
    };

    // Add suggestions if enabled
    if (this.#config.enableSuggestions) {
      const suggestions = await this.#generateSuggestions(req, context);
      if (suggestions.length > 0) {
        error.suggestions = suggestions;
      }
    }

    return error;
  }

  /**
   * @private
   * Determines request context
   */
  #determineContext(req) {
    const path = req.path.toLowerCase();

    if (path.startsWith('/api/')) {
      return 'api';
    }

    if (path.startsWith('/admin/')) {
      return 'admin';
    }

    if (req.tenant) {
      return 'tenant';
    }

    return 'default';
  }

  /**
   * @private
   * Generates route suggestions
   */
  async #generateSuggestions(req, context) {
    try {
      // Check cache first
      if (this.#config.enableCache) {
        const cacheKey = `404_suggestions:${req.path}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const suggestions = [];
      const requestPath = req.path.toLowerCase();
      const segments = requestPath.split('/').filter(s => s);

      // Get relevant routes based on context
      const relevantRoutes = this.#getRelevantRoutes(context, req);

      // Calculate similarity scores
      const scores = relevantRoutes.map(route => ({
        route,
        score: this.#calculateSimilarity(requestPath, route)
      }));

      // Filter and sort by score
      const topSuggestions = scores
        .filter(s => s.score >= this.#config.suggestionThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, this.#config.maxSuggestions)
        .map(s => s.route);

      // Cache suggestions
      if (this.#config.enableCache && topSuggestions.length > 0) {
        await this.#cacheService.set(
          `404_suggestions:${req.path}`,
          topSuggestions,
          this.#config.cacheTimeout
        );
      }

      return topSuggestions;

    } catch (error) {
      logger.error('Failed to generate suggestions', {
        error: error.message,
        path: req.path
      });
      return [];
    }
  }

  /**
   * @private
   * Gets relevant routes based on context
   */
  #getRelevantRoutes(context, req) {
    let routes = [];

    // Add context-specific routes
    if (this.#config.commonRoutes[context]) {
      routes.push(...this.#config.commonRoutes[context]);
    }

    // Add tenant-specific routes if applicable
    if (req.tenant && context === 'tenant') {
      // Could fetch from database or configuration
      routes.push(
        `/organizations/${req.tenant.slug}/dashboard`,
        `/organizations/${req.tenant.slug}/settings`,
        `/organizations/${req.tenant.slug}/users`
      );
    }

    // Add user-specific routes if authenticated
    if (req.user) {
      routes.push(
        '/profile',
        '/settings',
        '/dashboard'
      );
    }

    return [...new Set(routes)]; // Remove duplicates
  }

  /**
   * @private
   * Calculates similarity between two paths
   */
  #calculateSimilarity(path1, path2) {
    // Normalize paths
    const norm1 = path1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm2 = path2.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Levenshtein distance
    const distance = this.#levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    
    if (maxLength === 0) return 1;

    // Convert distance to similarity score
    const similarity = 1 - (distance / maxLength);

    // Boost score if paths share segments
    const segments1 = path1.split('/').filter(s => s);
    const segments2 = path2.split('/').filter(s => s);
    const sharedSegments = segments1.filter(s => segments2.includes(s)).length;
    const segmentBoost = sharedSegments * 0.1;

    return Math.min(1, similarity + segmentBoost);
  }

  /**
   * @private
   * Calculates Levenshtein distance between two strings
   */
  #levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `404_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets 404 metrics
   * @returns {Object} 404 metrics
   */
  getMetrics() {
    const metrics = {
      total: 0,
      suspicious: 0,
      byPath: {},
      topPaths: []
    };

    for (const [path, count] of this.#notFoundMetrics.entries()) {
      metrics.total += count;
      
      if (path === 'suspicious') {
        metrics.suspicious = count;
      } else {
        metrics.byPath[path] = count;
      }
    }

    // Get top 10 404 paths
    metrics.topPaths = Object.entries(metrics.byPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    return metrics;
  }

  /**
   * Adds custom route for suggestions
   * @param {string} route - Route to add
   * @param {string} [category] - Route category
   */
  addRoute(route, category = 'api') {
    if (!this.#config.commonRoutes[category]) {
      this.#config.commonRoutes[category] = [];
    }
    
    if (!this.#config.commonRoutes[category].includes(route)) {
      this.#config.commonRoutes[category].push(route);
      this.#initializeRouteSuggestions(); // Reinitialize suggestions
    }
  }

  /**
   * Clears metrics
   */
  clearMetrics() {
    this.#notFoundMetrics.clear();
    logger.info('404 metrics cleared');
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates NotFoundHandler instance
 * @param {Object} [options] - Configuration options
 * @returns {NotFoundHandler} NotFoundHandler instance
 */
const getNotFoundHandler = (options) => {
  if (!instance) {
    instance = new NotFoundHandler(options);
  }
  return instance;
};

module.exports = {
  NotFoundHandler,
  getNotFoundHandler,
  // Export convenience middleware
  handle: (req, res, next) => getNotFoundHandler().handle(req, res, next)
};