'use strict';

/**
 * @fileoverview Compression middleware configuration with content-aware settings
 * @module shared/lib/middleware/compression-config
 * @requires module:compression
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/compression-rule-model
 * @requires module:shared/lib/config
 */

const compression = require('compression');
const logger = require('../utils/logger');
const CacheService = require('../services/cache-service');
const CompressionRuleModel = require('../database/models/compression-rule-model');
const config = require('./helmet-config');

/**
 * @class CompressionConfig
 * @description Advanced compression configuration with dynamic rules and content-aware optimization
 */
class CompressionConfig {
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
  #compressionRules;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #performanceMetrics;

  /**
   * @private
   * @type {Map<string, Function>}
   */
  #middlewareCache;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    // Global compression settings
    enabled: process.env.COMPRESSION_ENABLED !== 'false',
    threshold: parseInt(process.env.COMPRESSION_THRESHOLD || '1024', 10), // 1KB
    level: parseInt(process.env.COMPRESSION_LEVEL || '6', 10), // zlib compression level (0-9)
    memLevel: parseInt(process.env.COMPRESSION_MEM_LEVEL || '8', 10), // zlib memory level (1-9)
    windowBits: parseInt(process.env.COMPRESSION_WINDOW_BITS || '15', 10), // zlib window bits
    strategy: parseInt(process.env.COMPRESSION_STRATEGY || '0', 10), // zlib strategy
    chunkSize: parseInt(process.env.COMPRESSION_CHUNK_SIZE || '16384', 10), // 16KB

    // Content type specific settings
    contentTypes: {
      text: {
        enabled: true,
        level: 6,
        threshold: 1024,
        patterns: [
          /text\/.*/,
          /application\/json/,
          /application\/xml/,
          /application\/javascript/,
          /application\/x-javascript/,
          /application\/ecmascript/,
          /application\/xhtml\+xml/,
          /application\/rss\+xml/,
          /application\/atom\+xml/,
          /application\/ld\+json/
        ]
      },
      images: {
        enabled: false, // Images are usually already compressed
        level: 3,
        threshold: 10240,
        patterns: [/image\/.*/]
      },
      fonts: {
        enabled: true,
        level: 6,
        threshold: 2048,
        patterns: [
          /font\/.*/,
          /application\/vnd\.ms-fontobject/,
          /application\/x-font-ttf/,
          /application\/x-font-opentype/,
          /application\/font-woff/,
          /application\/font-woff2/
        ]
      },
      media: {
        enabled: false, // Audio/video usually already compressed
        level: 3,
        threshold: 102400,
        patterns: [/audio\/.*/, /video\/.*/]
      },
      documents: {
        enabled: true,
        level: 7,
        threshold: 2048,
        patterns: [
          /application\/pdf/,
          /application\/msword/,
          /application\/vnd\.openxmlformats/,
          /application\/vnd\.ms-excel/,
          /application\/vnd\.ms-powerpoint/
        ]
      }
    },

    // Brotli compression settings (if available)
    brotli: {
      enabled: process.env.BROTLI_ENABLED === 'true',
      quality: parseInt(process.env.BROTLI_QUALITY || '4', 10), // 0-11
      lgwin: parseInt(process.env.BROTLI_LGWIN || '22', 10), // window size
      mode: parseInt(process.env.BROTLI_MODE || '0', 10) // 0: generic, 1: text, 2: font
    },

    // Dynamic compression rules
    dynamicRules: {
      enabled: process.env.COMPRESSION_DYNAMIC_RULES === 'true',
      cacheRules: true,
      cacheTTL: 3600 // 1 hour
    },

    // Path-based exclusions
    excludePaths: process.env.COMPRESSION_EXCLUDE_PATHS ?
      process.env.COMPRESSION_EXCLUDE_PATHS.split(',').map(p => p.trim()) :
      ['/api/streaming', '/ws', '/sse'],

    // Size-based exclusions
    excludeSizes: {
      minSize: parseInt(process.env.COMPRESSION_MIN_SIZE || '0', 10),
      maxSize: parseInt(process.env.COMPRESSION_MAX_SIZE || '5242880', 10) // 5MB
    },

    // Performance settings
    performance: {
      cpuThreshold: parseFloat(process.env.COMPRESSION_CPU_THRESHOLD || '0.8'), // 80%
      adaptiveCompression: process.env.COMPRESSION_ADAPTIVE === 'true',
      monitoringInterval: 60000, // 1 minute
      metricsEnabled: process.env.COMPRESSION_METRICS_ENABLED !== 'false'
    },

    // Multi-tenant settings
    multiTenant: {
      enabled: process.env.COMPRESSION_MULTI_TENANT === 'true',
      inheritGlobalRules: true,
      allowOverrides: true
    },

    // Cache settings
    cache: {
      enabled: process.env.COMPRESSION_CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.COMPRESSION_CACHE_TTL || '3600', 10),
      maxSize: 100
    },

    // Custom filter function
    filter: null
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #COMPRESSION_ALGORITHMS = {
    GZIP: 'gzip',
    DEFLATE: 'deflate',
    BROTLI: 'br',
    IDENTITY: 'identity' // No compression
  };

  /**
   * Creates CompressionConfig instance
   * @param {Object} [options] - Configuration options
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#compressionRules = new Map();
    this.#performanceMetrics = new Map();
    this.#middlewareCache = new Map();

    // Initialize compression rules
    this.#initializeRules();

    // Start performance monitoring if enabled
    if (this.#config.performance.adaptiveCompression) {
      this.#startPerformanceMonitoring();
    }

    logger.info('CompressionConfig initialized', {
      enabled: this.#config.enabled,
      threshold: this.#config.threshold,
      level: this.#config.level,
      brotliEnabled: this.#config.brotli.enabled,
      adaptiveEnabled: this.#config.performance.adaptiveCompression
    });
  }

  /**
   * Gets compression configuration
   * @param {Object} [context] - Request context
   * @returns {Promise<Object>} Compression configuration
   */
  async getCompressionConfig(context = {}) {
    try {
      // Build base configuration
      let compressionConfig = {
        threshold: this.#config.threshold,
        level: this.#config.level,
        memLevel: this.#config.memLevel,
        windowBits: this.#config.windowBits,
        strategy: this.#config.strategy,
        chunkSize: this.#config.chunkSize,
        filter: this.#createFilterFunction(context)
      };

      // Apply dynamic rules if enabled
      if (this.#config.dynamicRules.enabled) {
        compressionConfig = await this.#applyDynamicRules(compressionConfig, context);
      }

      // Apply tenant-specific configuration
      if (this.#config.multiTenant.enabled && context.tenantId) {
        compressionConfig = await this.#applyTenantConfig(compressionConfig, context.tenantId);
      }

      // Adjust for current performance if adaptive compression is enabled
      if (this.#config.performance.adaptiveCompression) {
        compressionConfig = this.#adjustForPerformance(compressionConfig);
      }

      return compressionConfig;

    } catch (error) {
      logger.error('Failed to get compression configuration', {
        error: error.message,
        context
      });

      // Return safe defaults
      return {
        threshold: 1024,
        level: 6,
        filter: this.#createFilterFunction(context)
      };
    }
  }

  /**
   * Creates compression middleware
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  middleware(options = {}) {
    return async (req, res, next) => {
      try {
        // Check if compression is enabled
        if (!this.#config.enabled) {
          return next();
        }

        // Check path exclusions
        if (this.#isPathExcluded(req.path)) {
          return next();
        }

        // Extract context
        const context = {
          tenantId: req.tenantId || req.headers['x-tenant-id'],
          userId: req.auth?.user?._id,
          path: req.path,
          method: req.method,
          contentType: req.headers['accept']
        };

        // Get or create compression middleware
        const middlewareKey = this.#getMiddlewareKey(context, options);
        let compressionMiddleware = this.#middlewareCache.get(middlewareKey);

        if (!compressionMiddleware || !this.#config.cache.enabled) {
          const compressionConfig = await this.getCompressionConfig(context);
          const finalConfig = { ...compressionConfig, ...options };
          compressionMiddleware = compression(finalConfig);

          // Cache middleware
          if (this.#config.cache.enabled) {
            this.#cacheMiddleware(middlewareKey, compressionMiddleware);
          }
        }

        // Track compression metrics
        if (this.#config.performance.metricsEnabled) {
          this.#trackCompressionMetrics(req, res);
        }

        // Apply compression middleware
        compressionMiddleware(req, res, next);

      } catch (error) {
        logger.error('Compression middleware error', {
          error: error.message,
          path: req.path
        });

        // Continue without compression on error
        next();
      }
    };
  }

  /**
   * Creates compression middleware for specific content types
   * @param {string|Array<string>} contentTypes - Content types to compress
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  forContentTypes(contentTypes, options = {}) {
    const types = Array.isArray(contentTypes) ? contentTypes : [contentTypes];

    return this.middleware({
      ...options,
      filter: (req, res) => {
        const contentType = res.getHeader('Content-Type');
        if (!contentType) return false;

        return types.some(type => {
          if (type instanceof RegExp) {
            return type.test(contentType);
          }
          return contentType.includes(type);
        });
      }
    });
  }

  /**
   * Creates compression middleware for specific routes
   * @param {Array<string|RegExp>} routes - Route patterns
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  forRoutes(routes, options = {}) {
    return (req, res, next) => {
      const matches = routes.some(route => {
        if (route instanceof RegExp) {
          return route.test(req.path);
        }
        return req.path.startsWith(route);
      });

      if (matches) {
        return this.middleware(options)(req, res, next);
      }

      next();
    };
  }

  /**
   * Adds compression rule
   * @param {string} name - Rule name
   * @param {Object} rule - Rule configuration
   * @param {Object} [options] - Rule options
   * @returns {Promise<void>}
   */
  async addRule(name, rule, options = {}) {
    try {
      // Validate rule
      this.#validateRule(rule);

      // Store rule
      this.#compressionRules.set(name, {
        ...rule,
        priority: rule.priority || 0,
        enabled: rule.enabled !== false,
        tenantId: options.tenantId
      });

      // Persist if dynamic rules are enabled
      if (this.#config.dynamicRules.enabled && options.persist) {
        await CompressionRuleModel.create({
          name,
          rule,
          tenantId: options.tenantId,
          isActive: true
        });
      }

      // Clear middleware cache
      this.#clearMiddlewareCache();

      logger.info('Compression rule added', {
        name,
        tenantId: options.tenantId
      });

    } catch (error) {
      logger.error('Failed to add compression rule', {
        name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Removes compression rule
   * @param {string} name - Rule name
   * @param {Object} [options] - Removal options
   * @returns {Promise<void>}
   */
  async removeRule(name, options = {}) {
    try {
      // Remove from memory
      this.#compressionRules.delete(name);

      // Remove from database
      if (this.#config.dynamicRules.enabled) {
        await CompressionRuleModel.deleteOne({
          name,
          tenantId: options.tenantId
        });
      }

      // Clear middleware cache
      this.#clearMiddlewareCache();

      logger.info('Compression rule removed', { name });

    } catch (error) {
      logger.error('Failed to remove compression rule', {
        name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lists compression rules
   * @param {Object} [filter] - Filter options
   * @returns {Promise<Array>} List of rules
   */
  async listRules(filter = {}) {
    const rules = [];

    // Add in-memory rules
    this.#compressionRules.forEach((rule, name) => {
      if (!filter.tenantId || rule.tenantId === filter.tenantId) {
        rules.push({
          name,
          ...rule,
          source: 'memory'
        });
      }
    });

    // Add database rules if enabled
    if (this.#config.dynamicRules.enabled && !filter.memoryOnly) {
      const dbRules = await CompressionRuleModel.find({
        isActive: true,
        ...(filter.tenantId && { tenantId: filter.tenantId })
      });

      dbRules.forEach(record => {
        rules.push({
          name: record.name,
          ...record.rule,
          tenantId: record.tenantId,
          source: 'database'
        });
      });
    }

    // Sort by priority
    rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return rules;
  }

  /**
   * @private
   * Merges configuration
   */
  #mergeConfig(options) {
    const merged = { ...CompressionConfig.#DEFAULT_CONFIG };

    Object.keys(CompressionConfig.#DEFAULT_CONFIG).forEach(key => {
      if (typeof CompressionConfig.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(CompressionConfig.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...CompressionConfig.#DEFAULT_CONFIG[key],
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
   * Initializes default compression rules
   */
  #initializeRules() {
    // Initialize content type rules
    Object.entries(this.#config.contentTypes).forEach(([category, config]) => {
      this.#compressionRules.set(`contentType:${category}`, {
        type: 'contentType',
        patterns: config.patterns,
        level: config.level,
        threshold: config.threshold,
        enabled: config.enabled,
        priority: 100
      });
    });

    // Initialize size-based rules
    this.#compressionRules.set('size:limits', {
      type: 'size',
      minSize: this.#config.excludeSizes.minSize,
      maxSize: this.#config.excludeSizes.maxSize,
      priority: 200
    });
  }

  /**
   * @private
   * Creates filter function for compression
   */
  #createFilterFunction(context) {
    return (req, res) => {
      // Check if response should be compressed
      const contentType = res.getHeader('Content-Type');
      const contentLength = res.getHeader('Content-Length');

      // Check custom filter first
      if (this.#config.filter) {
        const customResult = this.#config.filter(req, res);
        if (customResult === false) return false;
      }

      // Check content length
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size < this.#config.threshold) return false;
        if (size > this.#config.excludeSizes.maxSize) return false;
      }

      // Check content type rules
      if (contentType) {
        for (const [name, rule] of this.#compressionRules) {
          if (rule.type === 'contentType' && rule.enabled) {
            const matches = rule.patterns.some(pattern => {
              if (pattern instanceof RegExp) {
                return pattern.test(contentType);
              }
              return contentType.includes(pattern);
            });

            if (matches) {
              return true;
            }
          }
        }
      }

      // Default to compressing text-based content
      return compression.filter(req, res);
    };
  }

  /**
   * @private
   * Applies dynamic rules to configuration
   */
  async #applyDynamicRules(baseConfig, context) {
    try {
      const rules = await this.listRules({ tenantId: context.tenantId });

      for (const rule of rules) {
        if (!rule.enabled) continue;

        // Apply rule based on type
        switch (rule.type) {
          case 'path':
            if (context.path && rule.pattern) {
              const pattern = new RegExp(rule.pattern);
              if (pattern.test(context.path)) {
                baseConfig = { ...baseConfig, ...rule.config };
              }
            }
            break;

          case 'contentType':
            if (context.contentType && rule.patterns) {
              const matches = rule.patterns.some(pattern => {
                if (pattern instanceof RegExp) {
                  return pattern.test(context.contentType);
                }
                return context.contentType.includes(pattern);
              });

              if (matches) {
                baseConfig = { ...baseConfig, level: rule.level, threshold: rule.threshold };
              }
            }
            break;

          case 'user':
            if (context.userId && rule.userIds?.includes(context.userId)) {
              baseConfig = { ...baseConfig, ...rule.config };
            }
            break;
        }
      }

      return baseConfig;

    } catch (error) {
      logger.error('Failed to apply dynamic rules', {
        error: error.message
      });

      return baseConfig;
    }
  }

  /**
   * @private
   * Applies tenant-specific configuration
   */
  async #applyTenantConfig(baseConfig, tenantId) {
    try {
      const cacheKey = `compression:tenant:${tenantId}`;
      
      // Check cache
      if (this.#config.cache.enabled) {
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return { ...baseConfig, ...cached };
        }
      }

      // Get tenant configuration
      const tenantRules = await CompressionRuleModel.find({
        tenantId,
        type: 'tenant',
        isActive: true
      });

      if (tenantRules.length > 0) {
        const tenantConfig = tenantRules[0].rule;
        const merged = { ...baseConfig, ...tenantConfig };

        // Cache result
        if (this.#config.cache.enabled) {
          await this.#cacheService.set(cacheKey, tenantConfig, this.#config.cache.ttl);
        }

        return merged;
      }

      return baseConfig;

    } catch (error) {
      logger.error('Failed to apply tenant configuration', {
        tenantId,
        error: error.message
      });

      return baseConfig;
    }
  }

  /**
   * @private
   * Adjusts configuration based on performance
   */
  #adjustForPerformance(config) {
    const cpuUsage = this.#getCurrentCPUUsage();

    if (cpuUsage > this.#config.performance.cpuThreshold) {
      // Reduce compression level under high load
      return {
        ...config,
        level: Math.max(1, config.level - 3),
        threshold: config.threshold * 2
      };
    }

    return config;
  }

  /**
   * @private
   * Starts performance monitoring
   */
  #startPerformanceMonitoring() {
    setInterval(() => {
      const metrics = {
        cpuUsage: this.#getCurrentCPUUsage(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date()
      };

      this.#performanceMetrics.set('current', metrics);

      // Log if CPU usage is high
      if (metrics.cpuUsage > this.#config.performance.cpuThreshold) {
        logger.warn('High CPU usage detected', {
          cpuUsage: metrics.cpuUsage,
          threshold: this.#config.performance.cpuThreshold
        });
      }

    }, this.#config.performance.monitoringInterval);
  }

  /**
   * @private
   * Gets current CPU usage
   */
  #getCurrentCPUUsage() {
    const cpus = require('os').cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return 1 - totalIdle / totalTick;
  }

  /**
   * @private
   * Tracks compression metrics
   */
  #trackCompressionMetrics(req, res) {
    const originalWrite = res.write;
    const originalEnd = res.end;
    let uncompressedSize = 0;
    let compressedSize = 0;

    res.write = function(chunk, encoding) {
      if (chunk) {
        uncompressedSize += Buffer.byteLength(chunk, encoding);
      }
      return originalWrite.apply(this, arguments);
    };

    res.end = function(chunk, encoding) {
      if (chunk) {
        uncompressedSize += Buffer.byteLength(chunk, encoding);
      }

      res.on('finish', () => {
        const contentEncoding = res.getHeader('Content-Encoding');
        const contentLength = res.getHeader('Content-Length');

        if (contentEncoding && contentEncoding !== 'identity') {
          compressedSize = parseInt(contentLength, 10) || 0;

          const ratio = uncompressedSize > 0 ? 
            (1 - compressedSize / uncompressedSize) * 100 : 0;

          logger.debug('Compression metrics', {
            path: req.path,
            encoding: contentEncoding,
            uncompressedSize,
            compressedSize,
            ratio: ratio.toFixed(2) + '%'
          });
        }
      });

      return originalEnd.apply(this, arguments);
    };
  }

  /**
   * @private
   * Checks if path is excluded
   */
  #isPathExcluded(path) {
    return this.#config.excludePaths.some(excludePath => {
      if (excludePath instanceof RegExp) {
        return excludePath.test(path);
      }
      return path.startsWith(excludePath);
    });
  }

  /**
   * @private
   * Validates compression rule
   */
  #validateRule(rule) {
    if (!rule.type) {
      throw new Error('Rule type is required');
    }

    const validTypes = ['contentType', 'path', 'size', 'user', 'tenant'];
    if (!validTypes.includes(rule.type)) {
      throw new Error(`Invalid rule type: ${rule.type}`);
    }

    if (rule.level !== undefined) {
      if (rule.level < 0 || rule.level > 9) {
        throw new Error('Compression level must be between 0 and 9');
      }
    }

    if (rule.threshold !== undefined && rule.threshold < 0) {
      throw new Error('Threshold must be non-negative');
    }
  }

  /**
   * @private
   * Gets middleware cache key
   */
  #getMiddlewareKey(context, options) {
    const parts = [
      context.tenantId || 'global',
      context.path || 'default',
      JSON.stringify(options)
    ];
    return parts.join(':');
  }

  /**
   * @private
   * Caches middleware instance
   */
  #cacheMiddleware(key, middleware) {
    this.#middlewareCache.set(key, middleware);

    // Limit cache size
    if (this.#middlewareCache.size > this.#config.cache.maxSize) {
      const firstKey = this.#middlewareCache.keys().next().value;
      this.#middlewareCache.delete(firstKey);
    }
  }

  /**
   * @private
   * Clears middleware cache
   */
  #clearMiddlewareCache() {
    this.#middlewareCache.clear();
    logger.debug('Compression middleware cache cleared');
  }

  /**
   * Gets compression metrics
   * @returns {Object} Compression metrics
   */
  getMetrics() {
    return {
      rulesCount: this.#compressionRules.size,
      cacheSize: this.#middlewareCache.size,
      performance: this.#performanceMetrics.get('current'),
      configuration: {
        enabled: this.#config.enabled,
        threshold: this.#config.threshold,
        level: this.#config.level,
        adaptiveEnabled: this.#config.performance.adaptiveCompression
      }
    };
  }

  /**
   * Gets configuration summary
   * @returns {Object} Configuration summary
   */
  getConfigSummary() {
    return {
      enabled: this.#config.enabled,
      threshold: this.#config.threshold,
      level: this.#config.level,
      brotli: this.#config.brotli.enabled,
      adaptive: this.#config.performance.adaptiveCompression,
      multiTenant: this.#config.multiTenant.enabled,
      contentTypes: Object.keys(this.#config.contentTypes).filter(
        type => this.#config.contentTypes[type].enabled
      ),
      excludedPaths: this.#config.excludePaths.length
    };
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates CompressionConfig instance
 * @param {Object} [options] - Configuration options
 * @returns {CompressionConfig} CompressionConfig instance
 */
const getCompressionConfig = (options) => {
  if (!instance) {
    instance = new CompressionConfig(options);
  }
  return instance;
};

module.exports = {
  CompressionConfig,
  getCompressionConfig,
  // Export convenience methods
  compression: (options) => getCompressionConfig().middleware(options),
  compressionForContentTypes: (types, options) => getCompressionConfig().forContentTypes(types, options),
  compressionForRoutes: (routes, options) => getCompressionConfig().forRoutes(routes, options),
  addCompressionRule: (name, rule, options) => getCompressionConfig().addRule(name, rule, options),
  removeCompressionRule: (name, options) => getCompressionConfig().removeRule(name, options),
  listCompressionRules: (filter) => getCompressionConfig().listRules(filter)
};