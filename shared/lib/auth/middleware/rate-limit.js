'use strict';

/**
 * @fileoverview Rate limiting middleware for API protection
 * @module shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/rate-limit-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:crypto
 */

const crypto = require('crypto');
const CacheService = require('../../services/cache-service');
const RateLimitModel = require('../../database/models/security/rate-limit-model');
const UserModel = require('../../database/models/users/user-model');
const AuditService = require('../../security/audit/audit-service');
const NotificationService = require('../../services/notification-service');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class RateLimitMiddleware
 * @description Advanced rate limiting with multiple strategies and protection mechanisms
 */
class RateLimitMiddleware {
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
   * @type {NotificationService}
   */
  #notificationService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map}
   */
  #rateLimitMetrics;

  /**
   * @private
   * @type {Map}
   */
  #customLimiters;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    global: {
      windowMs: 900000, // 15 minutes
      max: 100, // requests per window
      message: 'Too many requests, please try again later',
      statusCode: 429,
      headers: true,
      draft_polli_ratelimit_headers: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    strategies: {
      ip: {
        enabled: true,
        windowMs: 900000,
        max: 100,
        keyGenerator: (req) => req.ip || req.connection.remoteAddress
      },
      user: {
        enabled: true,
        windowMs: 900000,
        max: 1000,
        keyGenerator: (req) => req.auth?.user?._id || null
      },
      apiKey: {
        enabled: true,
        windowMs: 3600000, // 1 hour
        max: 10000,
        keyGenerator: (req) => req.auth?.apiKey?.id || null
      },
      endpoint: {
        enabled: true,
        windowMs: 60000, // 1 minute
        max: 30,
        keyGenerator: (req) => `${req.method}:${req.route?.path || req.path}`
      },
      tenant: {
        enabled: true,
        windowMs: 3600000,
        max: 50000,
        keyGenerator: (req) => req.auth?.user?.organizationId || req.tenantId || null
      }
    },
    advanced: {
      distributed: true,
      slidingWindow: true,
      dynamicLimits: true,
      adaptiveLimits: true,
      burstProtection: true,
      costBasedLimiting: true
    },
    protection: {
      enableBlacklist: true,
      enableWhitelist: true,
      autoBlacklistThreshold: 10, // violations before blacklist
      blacklistDuration: 86400000, // 24 hours
      detectPatterns: true,
      blockSuspiciousPatterns: true
    },
    monitoring: {
      trackViolations: true,
      alertOnViolations: true,
      alertThreshold: 5,
      metricsInterval: 60000 // 1 minute
    },
    customRules: [],
    store: 'memory' // 'memory', 'redis', 'mongodb'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #STRATEGIES = {
    IP: 'ip',
    USER: 'user',
    API_KEY: 'apiKey',
    ENDPOINT: 'endpoint',
    TENANT: 'tenant',
    COMBINED: 'combined',
    CUSTOM: 'custom'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #ALGORITHMS = {
    FIXED_WINDOW: 'fixed_window',
    SLIDING_WINDOW: 'sliding_window',
    TOKEN_BUCKET: 'token_bucket',
    LEAKY_BUCKET: 'leaky_bucket',
    ADAPTIVE: 'adaptive'
  };

  /**
   * Creates rate limit middleware instance
   * @param {Object} [config] - Middleware configuration
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   * @param {NotificationService} [notificationService] - Notification service instance
   */
  constructor(
    config = {},
    cacheService,
    auditService,
    notificationService
  ) {
    this.#config = this.#mergeConfig(config);
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#notificationService = notificationService || new NotificationService();
    this.#rateLimitMetrics = new Map();
    this.#customLimiters = new Map();

    // Initialize metrics collection
    if (this.#config.monitoring.trackViolations) {
      this.#startMetricsCollection();
    }

    logger.info('RateLimitMiddleware initialized', {
      strategies: Object.entries(this.#config.strategies)
        .filter(([_, config]) => config.enabled)
        .map(([name]) => name),
      distributed: this.#config.advanced.distributed,
      slidingWindow: this.#config.advanced.slidingWindow
    });
  }

  /**
   * Creates rate limiter with default configuration
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  createLimiter(options = {}) {
    const config = { ...this.#config.global, ...options };
    
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Check whitelist
        if (await this.#isWhitelisted(req)) {
          return next();
        }

        // Check blacklist
        if (await this.#isBlacklisted(req)) {
          throw new AppError(
            'Access denied',
            403,
            ERROR_CODES.BLACKLISTED,
            { correlationId }
          );
        }

        // Get rate limit key
        const key = this.#generateKey(req, config);
        if (!key) {
          return next(); // Skip if no key can be generated
        }

        // Check rate limit
        const result = await this.#checkRateLimit(key, config, req);

        // Set headers
        if (config.headers) {
          this.#setRateLimitHeaders(res, result, config);
        }

        if (result.exceeded) {
          // Handle rate limit exceeded
          await this.#handleRateLimitExceeded(req, key, result, correlationId);
          
          throw new AppError(
            config.message,
            config.statusCode,
            ERROR_CODES.RATE_LIMIT_ERROR,
            {
              correlationId,
              retryAfter: result.resetTime,
              limit: config.max,
              current: result.current
            }
          );
        }

        // Track successful request
        this.#trackRequest(key, 'allowed', Date.now() - startTime);

        next();

      } catch (error) {
        const duration = Date.now() - startTime;
        
        this.#trackRequest('error', 'error', duration);

        logger.error('Rate limit check failed', {
          correlationId,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Rate limit error',
          500,
          ERROR_CODES.RATE_LIMIT_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Creates IP-based rate limiter
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  limitByIP(options = {}) {
    const config = { 
      ...this.#config.strategies.ip, 
      ...options,
      strategy: RateLimitMiddleware.#STRATEGIES.IP
    };

    return this.createLimiter(config);
  }

  /**
   * Creates user-based rate limiter
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  limitByUser(options = {}) {
    const config = { 
      ...this.#config.strategies.user, 
      ...options,
      strategy: RateLimitMiddleware.#STRATEGIES.USER,
      skipIfNotAuthenticated: true
    };

    return this.createLimiter(config);
  }

  /**
   * Creates API key-based rate limiter
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  limitByAPIKey(options = {}) {
    const config = { 
      ...this.#config.strategies.apiKey, 
      ...options,
      strategy: RateLimitMiddleware.#STRATEGIES.API_KEY,
      skipIfNotAuthenticated: true
    };

    return this.createLimiter(config);
  }

  /**
   * Creates endpoint-based rate limiter
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  limitByEndpoint(options = {}) {
    const config = { 
      ...this.#config.strategies.endpoint, 
      ...options,
      strategy: RateLimitMiddleware.#STRATEGIES.ENDPOINT
    };

    return this.createLimiter(config);
  }

  /**
   * Creates tenant-based rate limiter
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  limitByTenant(options = {}) {
    const config = { 
      ...this.#config.strategies.tenant, 
      ...options,
      strategy: RateLimitMiddleware.#STRATEGIES.TENANT
    };

    return this.createLimiter(config);
  }

  /**
   * Creates combined rate limiter with multiple strategies
   * @param {Array<string>} strategies - Strategies to combine
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  combinedLimit(strategies, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const results = [];

      try {
        // Check each strategy
        for (const strategy of strategies) {
          const config = this.#getStrategyConfig(strategy, options);
          const key = this.#generateKey(req, { ...config, strategy });
          
          if (key) {
            const result = await this.#checkRateLimit(key, config, req);
            results.push({ strategy, result, config });
            
            if (result.exceeded) {
              // Set headers for the exceeded strategy
              if (config.headers) {
                this.#setRateLimitHeaders(res, result, config);
              }
              
              await this.#handleRateLimitExceeded(req, key, result, correlationId);
              
              throw new AppError(
                `Rate limit exceeded for ${strategy}`,
                429,
                ERROR_CODES.RATE_LIMIT_ERROR,
                {
                  correlationId,
                  strategy,
                  retryAfter: result.resetTime,
                  limit: config.max,
                  current: result.current
                }
              );
            }
          }
        }

        // Set combined headers
        if (options.headers) {
          this.#setCombinedHeaders(res, results);
        }

        next();

      } catch (error) {
        logger.error('Combined rate limit check failed', {
          correlationId,
          error: error.message,
          strategies
        });

        next(error instanceof AppError ? error : new AppError(
          'Rate limit error',
          500,
          ERROR_CODES.RATE_LIMIT_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Creates custom rate limiter with dynamic rules
   * @param {string} name - Limiter name
   * @param {Function|Object} rule - Custom rule function or configuration
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  customLimit(name, rule, options = {}) {
    // Store custom limiter
    this.#customLimiters.set(name, { rule, options });

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        let config;
        let key;

        // Evaluate custom rule
        if (typeof rule === 'function') {
          const ruleResult = await rule(req);
          if (!ruleResult) {
            return next(); // Skip if rule returns falsy
          }
          
          config = {
            ...this.#config.global,
            ...options,
            ...(typeof ruleResult === 'object' ? ruleResult : {})
          };
          
          key = config.key || this.#generateCustomKey(req, name);
        } else {
          config = { ...this.#config.global, ...rule, ...options };
          key = this.#generateCustomKey(req, name);
        }

        // Check rate limit
        const result = await this.#checkRateLimit(key, config, req);

        if (config.headers) {
          this.#setRateLimitHeaders(res, result, config);
        }

        if (result.exceeded) {
          await this.#handleRateLimitExceeded(req, key, result, correlationId);
          
          throw new AppError(
            config.message || `Rate limit exceeded for ${name}`,
            config.statusCode || 429,
            ERROR_CODES.RATE_LIMIT_ERROR,
            {
              correlationId,
              limiter: name,
              retryAfter: result.resetTime
            }
          );
        }

        next();

      } catch (error) {
        logger.error('Custom rate limit check failed', {
          correlationId,
          limiter: name,
          error: error.message
        });

        next(error instanceof AppError ? error : new AppError(
          'Rate limit error',
          500,
          ERROR_CODES.RATE_LIMIT_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Cost-based rate limiting for expensive operations
   * @param {Function} costCalculator - Function to calculate request cost
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  costBasedLimit(costCalculator, options = {}) {
    const config = {
      windowMs: 3600000, // 1 hour
      maxCost: 1000, // total cost budget
      ...options
    };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Calculate request cost
        const cost = await costCalculator(req);
        if (!cost || cost <= 0) {
          return next(); // Skip if no cost
        }

        const key = this.#generateKey(req, { 
          ...config, 
          strategy: 'cost-based' 
        });

        // Check cost budget
        const result = await this.#checkCostLimit(key, cost, config, req);

        if (config.headers) {
          res.setHeader('X-RateLimit-Cost', cost);
          res.setHeader('X-RateLimit-Budget', config.maxCost);
          res.setHeader('X-RateLimit-Budget-Remaining', Math.max(0, config.maxCost - result.totalCost));
        }

        if (result.exceeded) {
          await this.#handleRateLimitExceeded(req, key, result, correlationId);
          
          throw new AppError(
            'Cost budget exceeded',
            429,
            ERROR_CODES.COST_LIMIT_ERROR,
            {
              correlationId,
              cost,
              budget: config.maxCost,
              used: result.totalCost
            }
          );
        }

        next();

      } catch (error) {
        logger.error('Cost-based rate limit check failed', {
          correlationId,
          error: error.message
        });

        next(error instanceof AppError ? error : new AppError(
          'Rate limit error',
          500,
          ERROR_CODES.RATE_LIMIT_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Adaptive rate limiting that adjusts based on system load
   * @param {Object} [options] - Rate limit options
   * @returns {Function} Express middleware function
   */
  adaptiveLimit(options = {}) {
    const baseConfig = {
      windowMs: 60000, // 1 minute
      baseMax: 100,
      minMax: 10,
      maxMax: 1000,
      ...options
    };

    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();

      try {
        // Get current system metrics
        const systemLoad = await this.#getSystemLoad();
        
        // Calculate adaptive limit
        const adaptiveMax = this.#calculateAdaptiveLimit(
          baseConfig.baseMax,
          systemLoad,
          baseConfig.minMax,
          baseConfig.maxMax
        );

        const config = {
          ...baseConfig,
          max: adaptiveMax,
          strategy: 'adaptive'
        };

        const key = this.#generateKey(req, config);
        const result = await this.#checkRateLimit(key, config, req);

        if (config.headers) {
          this.#setRateLimitHeaders(res, result, config);
          res.setHeader('X-RateLimit-Adaptive', 'true');
          res.setHeader('X-RateLimit-Load', systemLoad.toFixed(2));
        }

        if (result.exceeded) {
          await this.#handleRateLimitExceeded(req, key, result, correlationId);
          
          throw new AppError(
            'Rate limit exceeded (adaptive)',
            429,
            ERROR_CODES.RATE_LIMIT_ERROR,
            {
              correlationId,
              adaptiveLimit: adaptiveMax,
              systemLoad
            }
          );
        }

        next();

      } catch (error) {
        logger.error('Adaptive rate limit check failed', {
          correlationId,
          error: error.message
        });

        next(error instanceof AppError ? error : new AppError(
          'Rate limit error',
          500,
          ERROR_CODES.RATE_LIMIT_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * @private
   * Merges configuration
   */
  #mergeConfig(config) {
    const merged = { ...RateLimitMiddleware.#DEFAULT_CONFIG };

    // Deep merge strategies
    if (config.strategies) {
      Object.keys(config.strategies).forEach(strategy => {
        merged.strategies[strategy] = {
          ...merged.strategies[strategy],
          ...config.strategies[strategy]
        };
      });
    }

    // Merge other top-level configs
    Object.keys(config).forEach(key => {
      if (key !== 'strategies') {
        if (typeof config[key] === 'object' && !Array.isArray(config[key])) {
          merged[key] = { ...merged[key], ...config[key] };
        } else {
          merged[key] = config[key];
        }
      }
    });

    return merged;
  }

  /**
   * @private
   * Generates rate limit key
   */
  #generateKey(req, config) {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    const strategy = config.strategy || 'default';
    
    switch (strategy) {
      case RateLimitMiddleware.#STRATEGIES.IP:
        return `rate_limit:ip:${req.ip || req.connection.remoteAddress}`;
        
      case RateLimitMiddleware.#STRATEGIES.USER:
        if (!req.auth?.user?._id && config.skipIfNotAuthenticated) {
          return null;
        }
        return req.auth?.user?._id ? `rate_limit:user:${req.auth.user._id}` : null;
        
      case RateLimitMiddleware.#STRATEGIES.API_KEY:
        if (!req.auth?.apiKey?.id && config.skipIfNotAuthenticated) {
          return null;
        }
        return req.auth?.apiKey?.id ? `rate_limit:apikey:${req.auth.apiKey.id}` : null;
        
      case RateLimitMiddleware.#STRATEGIES.ENDPOINT:
        return `rate_limit:endpoint:${req.method}:${req.route?.path || req.path}`;
        
      case RateLimitMiddleware.#STRATEGIES.TENANT:
        const tenantId = req.auth?.user?.organizationId || req.tenantId;
        return tenantId ? `rate_limit:tenant:${tenantId}` : null;
        
      default:
        return `rate_limit:default:${req.ip || req.connection.remoteAddress}`;
    }
  }

  /**
   * @private
   * Generates custom key
   */
  #generateCustomKey(req, name) {
    const identifier = req.auth?.user?._id || req.ip || 'anonymous';
    return `rate_limit:custom:${name}:${identifier}`;
  }

  /**
   * @private
   * Checks rate limit
   */
  async #checkRateLimit(key, config, req) {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let result;

    if (this.#config.advanced.slidingWindow) {
      result = await this.#checkSlidingWindow(key, config, now, windowStart);
    } else {
      result = await this.#checkFixedWindow(key, config, now);
    }

    // Apply burst protection
    if (this.#config.advanced.burstProtection && result.requests) {
      const burstDetected = this.#detectBurst(result.requests, config);
      if (burstDetected) {
        result.exceeded = true;
        result.burst = true;
      }
    }

    return result;
  }

  /**
   * @private
   * Checks fixed window rate limit
   */
  async #checkFixedWindow(key, config, now) {
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;
    
    // Get current count
    let current = await this.#cacheService.get(windowKey) || 0;

    // Check if limit exceeded
    if (current >= config.max) {
      return {
        exceeded: true,
        current: current,
        limit: config.max,
        resetTime: Math.ceil(now / config.windowMs) * config.windowMs,
        remaining: 0
      };
    }

    // Increment counter
    current = await this.#cacheService.increment(windowKey, 1, Math.ceil(config.windowMs / 1000));

    return {
      exceeded: false,
      current: current,
      limit: config.max,
      resetTime: Math.ceil(now / config.windowMs) * config.windowMs,
      remaining: Math.max(0, config.max - current)
    };
  }

  /**
   * @private
   * Checks sliding window rate limit
   */
  async #checkSlidingWindow(key, config, now, windowStart) {
    const requests = await this.#getRequestHistory(key, windowStart, now);
    
    // Clean old requests
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= config.max) {
      return {
        exceeded: true,
        current: validRequests.length,
        limit: config.max,
        resetTime: validRequests[0] + config.windowMs,
        remaining: 0,
        requests: validRequests
      };
    }

    // Add new request
    validRequests.push(now);
    await this.#saveRequestHistory(key, validRequests, config.windowMs);

    return {
      exceeded: false,
      current: validRequests.length,
      limit: config.max,
      resetTime: now + config.windowMs,
      remaining: Math.max(0, config.max - validRequests.length),
      requests: validRequests
    };
  }

  /**
   * @private
   * Checks cost-based limit
   */
  async #checkCostLimit(key, cost, config, req) {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Get cost history
    const costHistory = await this.#getCostHistory(key, windowStart, now);
    const totalCost = costHistory.reduce((sum, item) => sum + item.cost, 0) + cost;

    if (totalCost > config.maxCost) {
      return {
        exceeded: true,
        totalCost: totalCost,
        requestCost: cost,
        budget: config.maxCost,
        resetTime: costHistory[0]?.timestamp + config.windowMs || now + config.windowMs
      };
    }

    // Add new cost
    costHistory.push({ timestamp: now, cost });
    await this.#saveCostHistory(key, costHistory, config.windowMs);

    return {
      exceeded: false,
      totalCost: totalCost,
      requestCost: cost,
      budget: config.maxCost,
      remaining: config.maxCost - totalCost
    };
  }

  /**
   * @private
   * Gets request history
   */
  async #getRequestHistory(key, windowStart, now) {
    const historyKey = `${key}:history`;
    const history = await this.#cacheService.get(historyKey) || [];
    return history.filter(timestamp => timestamp > windowStart && timestamp <= now);
  }

  /**
   * @private
   * Saves request history
   */
  async #saveRequestHistory(key, requests, windowMs) {
    const historyKey = `${key}:history`;
    await this.#cacheService.set(historyKey, requests, Math.ceil(windowMs / 1000));
  }

  /**
   * @private
   * Gets cost history
   */
  async #getCostHistory(key, windowStart, now) {
    const historyKey = `${key}:cost_history`;
    const history = await this.#cacheService.get(historyKey) || [];
    return history.filter(item => item.timestamp > windowStart && item.timestamp <= now);
  }

  /**
   * @private
   * Saves cost history
   */
  async #saveCostHistory(key, history, windowMs) {
    const historyKey = `${key}:cost_history`;
    await this.#cacheService.set(historyKey, history, Math.ceil(windowMs / 1000));
  }

  /**
   * @private
   * Detects burst patterns
   */
  #detectBurst(requests, config) {
    if (requests.length < 3) return false;

    const sorted = [...requests].sort((a, b) => a - b);
    const intervals = [];
    
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i] - sorted[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const minInterval = Math.min(...intervals);

    // Detect burst if minimum interval is significantly smaller than average
    return minInterval < avgInterval * 0.1 && minInterval < 1000; // Less than 1 second
  }

  /**
   * @private
   * Calculates adaptive limit
   */
  #calculateAdaptiveLimit(baseMax, load, minMax, maxMax) {
    // Reduce limit as load increases
    const scaleFactor = Math.max(0, 1 - load);
    const adaptiveMax = Math.round(baseMax * scaleFactor);
    
    return Math.max(minMax, Math.min(maxMax, adaptiveMax));
  }

  /**
   * @private
   * Gets system load
   */
  async #getSystemLoad() {
    // This would integrate with actual system metrics
    // For now, return a mock value
    const mockLoad = Math.random() * 0.8; // 0-80% load
    return mockLoad;
  }

  /**
   * @private
   * Checks if request is whitelisted
   */
  async #isWhitelisted(req) {
    if (!this.#config.protection.enableWhitelist) return false;

    const whitelist = await this.#getWhitelist();
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.auth?.user?._id;

    return whitelist.ips?.includes(ip) || 
           whitelist.users?.includes(userId?.toString());
  }

  /**
   * @private
   * Checks if request is blacklisted
   */
  async #isBlacklisted(req) {
    if (!this.#config.protection.enableBlacklist) return false;

    const blacklist = await this.#getBlacklist();
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.auth?.user?._id;

    return blacklist.ips?.includes(ip) || 
           blacklist.users?.includes(userId?.toString());
  }

  /**
   * @private
   * Gets whitelist
   */
  async #getWhitelist() {
    const cached = await this.#cacheService.get('rate_limit:whitelist');
    if (cached) return cached;

    // Load from database
    const whitelist = {
      ips: [],
      users: []
    };

    await this.#cacheService.set('rate_limit:whitelist', whitelist, 300);
    return whitelist;
  }

  /**
   * @private
   * Gets blacklist
   */
  async #getBlacklist() {
    const cached = await this.#cacheService.get('rate_limit:blacklist');
    if (cached) return cached;

    // Load from database
    const blacklist = {
      ips: [],
      users: []
    };

    await this.#cacheService.set('rate_limit:blacklist', blacklist, 300);
    return blacklist;
  }

  /**
   * @private
   * Gets strategy configuration
   */
  #getStrategyConfig(strategy, options) {
    const strategyConfig = this.#config.strategies[strategy];
    if (!strategyConfig) {
      throw new AppError(
        `Unknown rate limit strategy: ${strategy}`,
        500,
        ERROR_CODES.INVALID_CONFIGURATION
      );
    }

    return { ...strategyConfig, ...options };
  }

  /**
   * @private
   * Sets rate limit headers
   */
  #setRateLimitHeaders(res, result, config) {
    if (config.draft_polli_ratelimit_headers) {
      res.setHeader('RateLimit-Limit', config.max);
      res.setHeader('RateLimit-Remaining', result.remaining);
      res.setHeader('RateLimit-Reset', new Date(result.resetTime).toISOString());
      res.setHeader('RateLimit-Policy', `${config.max};w=${config.windowMs / 1000}`);
    } else {
      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
    }

    if (result.exceeded) {
      res.setHeader('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
    }
  }

  /**
   * @private
   * Sets combined headers
   */
  #setCombinedHeaders(res, results) {
    const limits = results.map(r => r.config.max);
    const remaining = results.map(r => r.result.remaining);
    const resets = results.map(r => r.result.resetTime);

    res.setHeader('X-RateLimit-Limit', limits.join(','));
    res.setHeader('X-RateLimit-Remaining', remaining.join(','));
    res.setHeader('X-RateLimit-Reset', Math.max(...resets));
  }

  /**
   * @private
   * Handles rate limit exceeded
   */
  async #handleRateLimitExceeded(req, key, result, correlationId) {
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.auth?.user?._id;

    // Track violation
    if (this.#config.monitoring.trackViolations) {
      await this.#trackViolation(key, ip, userId);
    }

    // Check auto-blacklist
    if (this.#config.protection.autoBlacklistThreshold) {
      const violations = await this.#getViolationCount(key);
      if (violations >= this.#config.protection.autoBlacklistThreshold) {
        await this.#autoBlacklist(key, ip, userId);
      }
    }

    // Audit rate limit violation
    await this.#auditRateLimitViolation(req, key, result, correlationId);

    // Send alerts if needed
    if (this.#config.monitoring.alertOnViolations) {
      await this.#checkAndSendAlerts(key, userId);
    }
  }

  /**
   * @private
   * Tracks violation
   */
  async #trackViolation(key, ip, userId) {
    const violationKey = `rate_limit:violations:${key}`;
    const count = await this.#cacheService.increment(violationKey, 1, 3600);
    
    // Store violation details
    await RateLimitModel.create({
      key,
      ip,
      userId,
      timestamp: new Date(),
      count
    }).catch(err => logger.error('Failed to store rate limit violation', { error: err.message }));
  }

  /**
   * @private
   * Gets violation count
   */
  async #getViolationCount(key) {
    const violationKey = `rate_limit:violations:${key}`;
    return await this.#cacheService.get(violationKey) || 0;
  }

  /**
   * @private
   * Auto-blacklists violator
   */
  async #autoBlacklist(key, ip, userId) {
    const blacklist = await this.#getBlacklist();
    
    if (ip) blacklist.ips.push(ip);
    if (userId) blacklist.users.push(userId.toString());
    
    await this.#cacheService.set('rate_limit:blacklist', blacklist, 300);
    
    logger.warn('Auto-blacklisted due to rate limit violations', {
      key,
      ip,
      userId
    });
  }

  /**
   * @private
   * Audits rate limit violation
   */
  async #auditRateLimitViolation(req, key, result, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'rate_limit.exceeded',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          key,
          limit: result.limit || result.budget,
          current: result.current || result.totalCost,
          method: req.method,
          path: req.path,
          burst: result.burst
        }
      });
    } catch (error) {
      logger.error('Failed to audit rate limit violation', { error: error.message });
    }
  }

  /**
   * @private
   * Checks and sends alerts
   */
  async #checkAndSendAlerts(key, userId) {
    const alertKey = `rate_limit:alerts:${key}`;
    const alertCount = await this.#cacheService.increment(alertKey, 1, 3600);
    
    if (alertCount === this.#config.monitoring.alertThreshold) {
      await this.#notificationService.sendNotification({
        type: 'rate_limit_alert',
        severity: 'warning',
        title: 'Rate Limit Violations Detected',
        message: `Multiple rate limit violations detected for ${key}`,
        metadata: {
          key,
          userId,
          violations: alertCount
        }
      }).catch(err => logger.error('Failed to send rate limit alert', { error: err.message }));
    }
  }

  /**
   * @private
   * Tracks request metrics
   */
  #trackRequest(key, status, duration) {
    const metricKey = `${key}:${status}`;
    const current = this.#rateLimitMetrics.get(metricKey) || { count: 0, totalDuration: 0 };
    
    this.#rateLimitMetrics.set(metricKey, {
      count: current.count + 1,
      totalDuration: current.totalDuration + duration,
      avgDuration: (current.totalDuration + duration) / (current.count + 1)
    });
  }

  /**
   * @private
   * Starts metrics collection
   */
  #startMetricsCollection() {
    setInterval(() => {
      this.#reportMetrics();
    }, this.#config.monitoring.metricsInterval);
  }

  /**
   * @private
   * Reports metrics
   */
  #reportMetrics() {
    const metrics = this.getMetrics();
    logger.info('Rate limit metrics', { metrics });
    
    // Reset metrics after reporting
    this.#rateLimitMetrics.clear();
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `ratelimit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets rate limit metrics
   * @returns {Object} Rate limit metrics
   */
  getMetrics() {
    const metrics = {};
    this.#rateLimitMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }

  /**
   * Resets rate limit for a key
   * @param {string} key - Rate limit key
   * @returns {Promise<void>}
   */
  async resetLimit(key) {
    await this.#cacheService.delete(key);
    await this.#cacheService.delete(`${key}:history`);
    await this.#cacheService.delete(`${key}:cost_history`);
    await this.#cacheService.delete(`rate_limit:violations:${key}`);
    
    logger.info('Rate limit reset', { key });
  }

  /**
   * Adds to whitelist
   * @param {string} type - Type ('ip' or 'user')
   * @param {string} value - Value to whitelist
   * @returns {Promise<void>}
   */
  async addToWhitelist(type, value) {
    const whitelist = await this.#getWhitelist();
    
    if (type === 'ip' && !whitelist.ips.includes(value)) {
      whitelist.ips.push(value);
    } else if (type === 'user' && !whitelist.users.includes(value)) {
      whitelist.users.push(value);
    }
    
    await this.#cacheService.set('rate_limit:whitelist', whitelist, 300);
    logger.info('Added to rate limit whitelist', { type, value });
  }

  /**
   * Adds to blacklist
   * @param {string} type - Type ('ip' or 'user')
   * @param {string} value - Value to blacklist
   * @param {number} [duration] - Blacklist duration in ms
   * @returns {Promise<void>}
   */
  async addToBlacklist(type, value, duration = this.#config.protection.blacklistDuration) {
    const blacklist = await this.#getBlacklist();
    
    if (type === 'ip' && !blacklist.ips.includes(value)) {
      blacklist.ips.push(value);
    } else if (type === 'user' && !blacklist.users.includes(value)) {
      blacklist.users.push(value);
    }
    
    await this.#cacheService.set('rate_limit:blacklist', blacklist, Math.ceil(duration / 1000));
    logger.info('Added to rate limit blacklist', { type, value, duration });
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates rate limit middleware instance
 * @param {Object} [config] - Middleware configuration
 * @returns {RateLimitMiddleware} Middleware instance
 */
const getRateLimitMiddleware = (config) => {
  if (!instance) {
    instance = new RateLimitMiddleware(config);
  }
  return instance;
};

module.exports = {
  RateLimitMiddleware,
  getRateLimitMiddleware,
  // Export convenience methods
  createLimiter: (options) => getRateLimitMiddleware().createLimiter(options),
  limitByIP: (options) => getRateLimitMiddleware().limitByIP(options),
  limitByUser: (options) => getRateLimitMiddleware().limitByUser(options),
  limitByAPIKey: (options) => getRateLimitMiddleware().limitByAPIKey(options),
  limitByEndpoint: (options) => getRateLimitMiddleware().limitByEndpoint(options),
  limitByTenant: (options) => getRateLimitMiddleware().limitByTenant(options),
  combinedLimit: (strategies, options) => getRateLimitMiddleware().combinedLimit(strategies, options),
  customLimit: (name, rule, options) => getRateLimitMiddleware().customLimit(name, rule, options),
  costBasedLimit: (costCalculator, options) => getRateLimitMiddleware().costBasedLimit(costCalculator, options),
  adaptiveLimit: (options) => getRateLimitMiddleware().adaptiveLimit(options)
};