'use strict';

/**
 * @fileoverview Enterprise-grade external API request service with circuit breakers and retries
 * @module shared/lib/services/external-api-service
 * @requires module:axios
 * @requires module:axios-retry
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/config
 */

const axios = require('axios');
const axiosRetry = require('axios-retry');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const CacheService = require('./cache-service');
const AuditLogModel = require('../database/models/audit-log-model');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const crypto = require('crypto');

/**
 * @class ExternalAPIService
 * @description Comprehensive service for making external API requests with enterprise features
 */
class ExternalAPIService {
  /**
   * @private
   * @static
   * @type {Map<string, axios.AxiosInstance>}
   */
  static #clients = new Map();

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #circuitBreakers = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #rateLimiters = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #requestStats = new Map();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #defaultConfig = {
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    circuitBreaker: {
      threshold: 5,
      timeout: 60000,
      resetTimeout: 120000
    },
    rateLimit: {
      maxRequests: 100,
      perWindow: 60000
    },
    cache: {
      enabled: true,
      ttl: 300,
      methods: ['GET']
    }
  };

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * Initialize external API service
   * @static
   * @returns {Promise<void>}
   */
  static async initialize() {
    if (this.#initialized) {
      return;
    }

    try {
      this.#cacheService = new CacheService({ namespace: 'external-api' });
      
      // Create default client
      this.#createClient('default', {});

      // Start stats collection
      this.#startStatsCollection();

      this.#initialized = true;
      logger.info('ExternalAPIService initialized');
    } catch (error) {
      logger.error('Failed to initialize ExternalAPIService', { error: error.message });
      throw new AppError(
        'External API service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Make HTTP request
   * @static
   * @param {Object} options - Request options
   * @param {string} options.url - Request URL
   * @param {string} [options.method='GET'] - HTTP method
   * @param {Object} [options.headers] - Request headers
   * @param {Object} [options.params] - Query parameters
   * @param {Object} [options.data] - Request body
   * @param {Object} [options.auth] - Authentication
   * @param {number} [options.timeout] - Request timeout
   * @param {boolean} [options.cache] - Enable caching
   * @param {number} [options.cacheTTL] - Cache TTL
   * @param {string} [options.clientId='default'] - Client ID
   * @param {Object} [options.retry] - Retry configuration
   * @param {Object} [options.circuitBreaker] - Circuit breaker config
   * @param {string} [options.userId] - User making request
   * @param {string} [options.organizationId] - Organization context
   * @returns {Promise<Object>} Response data
   */
  static async request(options) {
    await this.initialize();

    const requestId = this.#generateRequestId();
    const startTime = Date.now();

    try {
      // Prepare request config
      const config = this.#prepareRequestConfig(options);
      
      // Check circuit breaker
      await this.#checkCircuitBreaker(config.baseURL || config.url);

      // Check rate limit
      await this.#checkRateLimit(config.baseURL || config.url);

      // Check cache for GET requests
      if (config.method === 'GET' && options.cache !== false) {
        const cached = await this.#getCachedResponse(config);
        if (cached) {
          this.#updateStats(config.url, 0, true, 'cache');
          return cached;
        }
      }

      // Get or create client
      const client = this.#getClient(options.clientId || 'default');

      // Make request
      logger.debug('Making external API request', {
        requestId,
        url: config.url,
        method: config.method
      });

      const response = await client.request(config);

      // Process response
      const processedResponse = this.#processResponse(response);

      // Cache response if applicable
      if (config.method === 'GET' && options.cache !== false) {
        await this.#cacheResponse(config, processedResponse);
      }

      // Update stats
      this.#updateStats(config.url, Date.now() - startTime, true, 'api');

      // Reset circuit breaker on success
      this.#resetCircuitBreaker(config.baseURL || config.url);

      // Audit log for sensitive operations
      if (options.audit) {
        await this.#auditLog({
          action: 'external_api.request',
          requestId,
          userId: options.userId,
          organizationId: options.organizationId,
          metadata: {
            url: config.url,
            method: config.method,
            statusCode: response.status,
            duration: Date.now() - startTime
          }
        });
      }

      return processedResponse;

    } catch (error) {
      this.#updateStats(options.url, Date.now() - startTime, false, 'error');
      
      // Record circuit breaker failure
      this.#recordCircuitBreakerFailure(options.url);

      // Handle specific error types
      if (error.response) {
        // Server responded with error
        throw new AppError(
          `External API error: ${error.response.statusText}`,
          error.response.status,
          ERROR_CODES.EXTERNAL_API_ERROR,
          {
            requestId,
            url: options.url,
            status: error.response.status,
            data: error.response.data
          }
        );
      } else if (error.request) {
        // Request made but no response
        throw new AppError(
          'External API request failed: No response',
          503,
          ERROR_CODES.EXTERNAL_API_TIMEOUT,
          {
            requestId,
            url: options.url
          }
        );
      } else {
        // Request setup error
        throw new AppError(
          'External API request configuration error',
          500,
          ERROR_CODES.REQUEST_CONFIGURATION_ERROR,
          {
            requestId,
            message: error.message
          }
        );
      }
    }
  }

  /**
   * Make GET request
   * @static
   * @param {string} url - Request URL
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  static async get(url, options = {}) {
    return this.request({ ...options, url, method: 'GET' });
  }

  /**
   * Make POST request
   * @static
   * @param {string} url - Request URL
   * @param {Object} [data] - Request body
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  static async post(url, data, options = {}) {
    return this.request({ ...options, url, method: 'POST', data });
  }

  /**
   * Make PUT request
   * @static
   * @param {string} url - Request URL
   * @param {Object} [data] - Request body
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  static async put(url, data, options = {}) {
    return this.request({ ...options, url, method: 'PUT', data });
  }

  /**
   * Make PATCH request
   * @static
   * @param {string} url - Request URL
   * @param {Object} [data] - Request body
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  static async patch(url, data, options = {}) {
    return this.request({ ...options, url, method: 'PATCH', data });
  }

  /**
   * Make DELETE request
   * @static
   * @param {string} url - Request URL
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  static async delete(url, options = {}) {
    return this.request({ ...options, url, method: 'DELETE' });
  }

  /**
   * Create custom API client
   * @static
   * @param {string} clientId - Client identifier
   * @param {Object} config - Client configuration
   * @param {string} [config.baseURL] - Base URL
   * @param {Object} [config.headers] - Default headers
   * @param {number} [config.timeout] - Timeout
   * @param {Object} [config.auth] - Default auth
   * @param {Object} [config.retry] - Retry config
   * @param {Object} [config.interceptors] - Request/response interceptors
   * @returns {string} Client ID
   */
  static createClient(clientId, config) {
    if (this.#clients.has(clientId)) {
      throw new AppError(
        'Client already exists',
        400,
        ERROR_CODES.DUPLICATE_CLIENT
      );
    }

    this.#createClient(clientId, config);
    logger.info('Custom API client created', { clientId });
    
    return clientId;
  }

  /**
   * Configure rate limiting for domain
   * @static
   * @param {string} domain - Domain or URL pattern
   * @param {Object} limits - Rate limit configuration
   * @param {number} limits.maxRequests - Max requests
   * @param {number} limits.perWindow - Time window in ms
   */
  static configureRateLimit(domain, limits) {
    const key = this.#getDomainKey(domain);
    
    this.#rateLimiters.set(key, {
      maxRequests: limits.maxRequests,
      perWindow: limits.perWindow,
      requests: [],
      blocked: false
    });

    logger.info('Rate limit configured', { domain, limits });
  }

  /**
   * Configure circuit breaker for domain
   * @static
   * @param {string} domain - Domain or URL pattern
   * @param {Object} config - Circuit breaker configuration
   * @param {number} config.threshold - Failure threshold
   * @param {number} config.timeout - Open timeout
   * @param {number} config.resetTimeout - Reset timeout
   */
  static configureCircuitBreaker(domain, config) {
    const key = this.#getDomainKey(domain);
    
    this.#circuitBreakers.set(key, {
      state: 'closed',
      failures: 0,
      lastFailure: null,
      nextAttempt: null,
      config
    });

    logger.info('Circuit breaker configured', { domain, config });
  }

  /**
   * Get request statistics
   * @static
   * @param {string} [domain] - Filter by domain
   * @returns {Object} Request statistics
   */
  static getStats(domain) {
    if (domain) {
      const key = this.#getDomainKey(domain);
      return this.#requestStats.get(key) || null;
    }

    const stats = {};
    this.#requestStats.forEach((value, key) => {
      stats[key] = value;
    });

    return stats;
  }

  /**
   * Clear cache for domain
   * @static
   * @param {string} [domain] - Domain to clear cache for
   * @returns {Promise<number>} Number of cleared entries
   */
  static async clearCache(domain) {
    if (domain) {
      const pattern = `external-api:${this.#getDomainKey(domain)}:*`;
      return await this.#cacheService.deletePattern(pattern);
    }

    return await this.#cacheService.deletePattern('external-api:*');
  }

  /**
   * Batch requests with concurrency control
   * @static
   * @param {Array<Object>} requests - Array of request options
   * @param {Object} [options] - Batch options
   * @param {number} [options.concurrency=5] - Max concurrent requests
   * @param {boolean} [options.stopOnError=false] - Stop on first error
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Array>} Results array
   */
  static async batch(requests, options = {}) {
    const {
      concurrency = 5,
      stopOnError = false,
      onProgress
    } = options;

    const results = [];
    const errors = [];
    let completed = 0;

    // Process in chunks
    for (let i = 0; i < requests.length; i += concurrency) {
      const chunk = requests.slice(i, i + concurrency);
      
      try {
        const chunkResults = await Promise.allSettled(
          chunk.map(req => this.request(req))
        );

        chunkResults.forEach((result, index) => {
          completed++;
          
          if (result.status === 'fulfilled') {
            results[i + index] = {
              success: true,
              data: result.value
            };
          } else {
            const error = {
              success: false,
              error: result.reason.message,
              request: chunk[index]
            };
            results[i + index] = error;
            errors.push(error);

            if (stopOnError) {
              throw new AppError(
                'Batch request stopped due to error',
                500,
                ERROR_CODES.BATCH_REQUEST_FAILED,
                { errors }
              );
            }
          }

          if (onProgress) {
            onProgress({
              completed,
              total: requests.length,
              percent: (completed / requests.length) * 100
            });
          }
        });

      } catch (error) {
        if (stopOnError) {
          throw error;
        }
      }
    }

    return {
      results,
      summary: {
        total: requests.length,
        successful: results.filter(r => r.success).length,
        failed: errors.length,
        errors
      }
    };
  }

  /**
   * Create request stream
   * @static
   * @param {Object} options - Stream options
   * @param {string} options.url - Stream URL
   * @param {Object} [options.headers] - Headers
   * @param {Function} options.onData - Data handler
   * @param {Function} [options.onError] - Error handler
   * @param {Function} [options.onEnd] - End handler
   * @returns {Function} Stop function
   */
  static createStream(options) {
    const { url, headers, onData, onError, onEnd } = options;
    
    const client = this.#getClient('default');
    const source = axios.CancelToken.source();

    const stream = client({
      method: 'GET',
      url,
      headers: {
        ...headers,
        'Accept': 'text/event-stream'
      },
      responseType: 'stream',
      cancelToken: source.token
    });

    stream.then(response => {
      response.data.on('data', chunk => {
        try {
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          lines.forEach(line => {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data !== '[DONE]') {
                try {
                  onData(JSON.parse(data));
                } catch (e) {
                  onData(data);
                }
              }
            }
          });
        } catch (error) {
          if (onError) onError(error);
        }
      });

      response.data.on('end', () => {
        if (onEnd) onEnd();
      });

      response.data.on('error', error => {
        if (onError) onError(error);
      });
    }).catch(error => {
      if (onError) onError(error);
    });

    // Return stop function
    return () => {
      source.cancel('Stream stopped by user');
    };
  }

  /**
   * @private
   * Create axios client
   */
  static #createClient(clientId, config) {
    const clientConfig = {
      timeout: this.#defaultConfig.timeout,
      ...config
    };

    const client = axios.create(clientConfig);

    // Configure retry
    axiosRetry(client, {
      retries: config.retry?.maxRetries || this.#defaultConfig.maxRetries,
      retryDelay: (retryCount) => {
        const delay = config.retry?.retryDelay || this.#defaultConfig.retryDelay;
        return delay * Math.pow(2, retryCount - 1);
      },
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               (error.response && error.response.status >= 500);
      }
    });

    // Request interceptor
    client.interceptors.request.use(
      (requestConfig) => {
        // Add request ID
        requestConfig.headers['X-Request-ID'] = this.#generateRequestId();
        
        // Add timing
        requestConfig.metadata = { startTime: Date.now() };
        
        // Custom interceptor
        if (config.interceptors?.request) {
          return config.interceptors.request(requestConfig);
        }
        
        return requestConfig;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        // Calculate duration
        const duration = Date.now() - response.config.metadata.startTime;
        response.duration = duration;
        
        // Log slow requests
        if (duration > 5000) {
          logger.warn('Slow external API request', {
            url: response.config.url,
            duration,
            status: response.status
          });
        }
        
        // Custom interceptor
        if (config.interceptors?.response) {
          return config.interceptors.response(response);
        }
        
        return response;
      },
      (error) => {
        if (error.config && error.config.metadata) {
          const duration = Date.now() - error.config.metadata.startTime;
          logger.error('External API request failed', {
            url: error.config.url,
            duration,
            status: error.response?.status,
            message: error.message
          });
        }
        
        return Promise.reject(error);
      }
    );

    this.#clients.set(clientId, client);
    return client;
  }

  /**
   * @private
   * Get client by ID
   */
  static #getClient(clientId) {
    const client = this.#clients.get(clientId);
    if (!client) {
      throw new AppError(
        'API client not found',
        404,
        ERROR_CODES.CLIENT_NOT_FOUND
      );
    }
    return client;
  }

  /**
   * @private
   * Prepare request configuration
   */
  static #prepareRequestConfig(options) {
    const config = {
      url: options.url,
      method: (options.method || 'GET').toUpperCase(),
      headers: {
        'User-Agent': 'InsightSerenity/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: options.timeout || this.#defaultConfig.timeout
    };

    // Add authentication
    if (options.auth) {
      if (options.auth.bearer) {
        config.headers['Authorization'] = `Bearer ${options.auth.bearer}`;
      } else if (options.auth.basic) {
        config.auth = options.auth.basic;
      } else if (options.auth.apiKey) {
        const { header, value } = options.auth.apiKey;
        config.headers[header || 'X-API-Key'] = value;
      }
    }

    // Add params
    if (options.params) {
      config.params = options.params;
    }

    // Add data
    if (options.data) {
      config.data = options.data;
    }

    // Add custom config
    if (options.axios) {
      Object.assign(config, options.axios);
    }

    return config;
  }

  /**
   * @private
   * Process response
   */
  static #processResponse(response) {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      duration: response.duration,
      cached: false
    };
  }

  /**
   * @private
   * Get cached response
   */
  static async #getCachedResponse(config) {
    if (config.method !== 'GET') return null;

    const cacheKey = this.#generateCacheKey(config);
    const cached = await this.#cacheService.get(cacheKey);

    if (cached) {
      logger.debug('Cache hit for external API request', {
        url: config.url,
        cacheKey
      });
      
      return {
        ...cached,
        cached: true
      };
    }

    return null;
  }

  /**
   * @private
   * Cache response
   */
  static async #cacheResponse(config, response) {
    if (config.method !== 'GET' || response.status !== 200) return;

    const cacheKey = this.#generateCacheKey(config);
    const ttl = config.cacheTTL || this.#defaultConfig.cache.ttl;

    await this.#cacheService.set(cacheKey, response, ttl);

    logger.debug('Cached external API response', {
      url: config.url,
      cacheKey,
      ttl
    });
  }

  /**
   * @private
   * Check circuit breaker
   */
  static async #checkCircuitBreaker(url) {
    const key = this.#getDomainKey(url);
    const breaker = this.#circuitBreakers.get(key);

    if (!breaker) return;

    if (breaker.state === 'open') {
      if (Date.now() < breaker.nextAttempt) {
        throw new AppError(
          'Circuit breaker is open',
          503,
          ERROR_CODES.CIRCUIT_BREAKER_OPEN,
          {
            domain: key,
            nextAttempt: new Date(breaker.nextAttempt)
          }
        );
      }
      // Try half-open
      breaker.state = 'half-open';
    }
  }

  /**
   * @private
   * Record circuit breaker failure
   */
  static #recordCircuitBreakerFailure(url) {
    const key = this.#getDomainKey(url);
    const breaker = this.#circuitBreakers.get(key);

    if (!breaker) {
      // Create default circuit breaker
      this.#circuitBreakers.set(key, {
        state: 'closed',
        failures: 1,
        lastFailure: Date.now(),
        nextAttempt: null,
        config: this.#defaultConfig.circuitBreaker
      });
      return;
    }

    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.failures >= breaker.config.threshold) {
      breaker.state = 'open';
      breaker.nextAttempt = Date.now() + breaker.config.timeout;
      
      logger.warn('Circuit breaker opened', {
        domain: key,
        failures: breaker.failures
      });
    }
  }

  /**
   * @private
   * Reset circuit breaker
   */
  static #resetCircuitBreaker(url) {
    const key = this.#getDomainKey(url);
    const breaker = this.#circuitBreakers.get(key);

    if (breaker && breaker.state !== 'closed') {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.lastFailure = null;
      breaker.nextAttempt = null;
      
      logger.info('Circuit breaker reset', { domain: key });
    }
  }

  /**
   * @private
   * Check rate limit
   */
  static async #checkRateLimit(url) {
    const key = this.#getDomainKey(url);
    const limiter = this.#rateLimiters.get(key);

    if (!limiter) return;

    const now = Date.now();
    const windowStart = now - limiter.perWindow;

    // Remove old requests
    limiter.requests = limiter.requests.filter(time => time > windowStart);

    if (limiter.requests.length >= limiter.maxRequests) {
      const oldestRequest = Math.min(...limiter.requests);
      const resetTime = oldestRequest + limiter.perWindow;
      
      throw new AppError(
        'Rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        {
          domain: key,
          limit: limiter.maxRequests,
          reset: new Date(resetTime)
        }
      );
    }

    limiter.requests.push(now);
  }

  /**
   * @private
   * Update request statistics
   */
  static #updateStats(url, duration, success, source) {
    const key = this.#getDomainKey(url);
    
    if (!this.#requestStats.has(key)) {
      this.#requestStats.set(key, {
        total: 0,
        successful: 0,
        failed: 0,
        cached: 0,
        totalDuration: 0,
        avgDuration: 0,
        lastRequest: null
      });
    }

    const stats = this.#requestStats.get(key);
    stats.total++;
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.total;
    stats.lastRequest = new Date();

    if (success) {
      stats.successful++;
      if (source === 'cache') {
        stats.cached++;
      }
    } else {
      stats.failed++;
    }
  }

  /**
   * @private
   * Get domain key from URL
   */
  static #getDomainKey(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * @private
   * Generate cache key
   */
  static #generateCacheKey(config) {
    const keyParts = [
      config.method,
      config.url,
      JSON.stringify(config.params || {}),
      JSON.stringify(config.headers || {})
    ];

    return `external-api:${crypto
      .createHash('sha256')
      .update(keyParts.join(':'))
      .digest('hex')
      .substring(0, 32)}`;
  }

  /**
   * @private
   * Generate request ID
   */
  static #generateRequestId() {
    return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Start statistics collection
   */
  static #startStatsCollection() {
    setInterval(() => {
      const stats = this.getStats();
      logger.debug('External API statistics', { stats });
    }, 60000); // Every minute
  }

  /**
   * @private
   * Audit log
   */
  static async #auditLog(data) {
    try {
      await AuditLogModel.create({
        action: data.action,
        resource: 'external_api',
        resourceId: data.requestId,
        userId: data.userId,
        organizationId: data.organizationId,
        metadata: data.metadata,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to create audit log', { error: error.message });
    }
  }
}

module.exports = ExternalAPIService;