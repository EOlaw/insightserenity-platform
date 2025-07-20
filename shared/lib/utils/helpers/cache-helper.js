'use strict';

/**
 * @fileoverview Cache management and optimization utilities
 * @module shared/lib/utils/helpers/cache-helper
 */

const crypto = require('crypto');

/**
 * @class CacheHelper
 * @description Comprehensive cache utilities for the platform
 */
class CacheHelper {
  /**
   * Cache store (in-memory for demonstration)
   * @static
   * @private
   */
  static #cache = new Map();

  /**
   * Default TTL in milliseconds (1 hour)
   * @static
   * @private
   */
  static #DEFAULT_TTL = 60 * 60 * 1000;

  /**
   * Generate cache key
   * @static
   * @param {string} prefix - Key prefix
   * @param {...*} params - Parameters to include in key
   * @returns {string} Cache key
   */
  static generateKey(prefix, ...params) {
    const parts = [prefix];
    
    params.forEach(param => {
      if (param === null || param === undefined) {
        parts.push('null');
      } else if (typeof param === 'object') {
        // Sort object keys for consistent hashing
        const sorted = JSON.stringify(param, Object.keys(param).sort());
        parts.push(crypto.createHash('md5').update(sorted).digest('hex').substring(0, 8));
      } else {
        parts.push(String(param));
      }
    });
    
    return parts.join(':');
  }

  /**
   * Generate cache key from request
   * @static
   * @param {Object} req - Request object
   * @param {Object} [options={}] - Options
   * @param {string[]} [options.includeHeaders=[]] - Headers to include
   * @param {string[]} [options.excludeParams=[]] - Query params to exclude
   * @returns {string} Cache key
   */
  static generateRequestKey(req, options = {}) {
    const { includeHeaders = [], excludeParams = [] } = options;
    
    const parts = [
      req.method,
      req.baseUrl || '',
      req.path
    ];
    
    // Add query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      const queryKeys = Object.keys(req.query)
        .filter(key => !excludeParams.includes(key))
        .sort();
      
      const queryParts = queryKeys.map(key => `${key}=${req.query[key]}`);
      if (queryParts.length > 0) {
        parts.push(queryParts.join('&'));
      }
    }
    
    // Add specific headers
    includeHeaders.forEach(header => {
      const value = req.headers[header.toLowerCase()];
      if (value) {
        parts.push(`${header}:${value}`);
      }
    });
    
    return this.generateKey('req', ...parts);
  }

  /**
   * Set cache value
   * @static
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {Object} [options={}] - Options
   * @param {number} [options.ttl] - Time to live in milliseconds
   * @param {string[]} [options.tags=[]] - Cache tags
   * @returns {void}
   */
  static set(key, value, options = {}) {
    const { ttl = this.#DEFAULT_TTL, tags = [] } = options;
    
    const entry = {
      value,
      createdAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : null,
      tags: new Set(tags),
      hits: 0
    };
    
    this.#cache.set(key, entry);
    
    // Update tag index
    tags.forEach(tag => {
      const tagKey = `tag:${tag}`;
      const taggedKeys = this.#cache.get(tagKey) || new Set();
      taggedKeys.add(key);
      this.#cache.set(tagKey, taggedKeys);
    });
  }

  /**
   * Get cache value
   * @static
   * @param {string} key - Cache key
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.refresh=false] - Reset expiration on hit
   * @returns {*} Cached value or undefined
   */
  static get(key, options = {}) {
    const { refresh = false } = options;
    const entry = this.#cache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }
    
    // Update hit count
    entry.hits++;
    
    // Refresh expiration if requested
    if (refresh && entry.expiresAt) {
      const ttl = entry.expiresAt - entry.createdAt;
      entry.expiresAt = Date.now() + ttl;
    }
    
    return entry.value;
  }

  /**
   * Check if key exists
   * @static
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  static has(key) {
    const entry = this.#cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete cache entry
   * @static
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  static delete(key) {
    const entry = this.#cache.get(key);
    
    if (entry) {
      // Remove from tag indexes
      entry.tags.forEach(tag => {
        const tagKey = `tag:${tag}`;
        const taggedKeys = this.#cache.get(tagKey);
        if (taggedKeys) {
          taggedKeys.delete(key);
          if (taggedKeys.size === 0) {
            this.#cache.delete(tagKey);
          }
        }
      });
    }
    
    return this.#cache.delete(key);
  }

  /**
   * Delete by tag
   * @static
   * @param {string} tag - Cache tag
   * @returns {number} Number of entries deleted
   */
  static deleteByTag(tag) {
    const tagKey = `tag:${tag}`;
    const taggedKeys = this.#cache.get(tagKey) || new Set();
    let count = 0;
    
    taggedKeys.forEach(key => {
      if (this.delete(key)) {
        count++;
      }
    });
    
    return count;
  }

  /**
   * Delete by pattern
   * @static
   * @param {string|RegExp} pattern - Key pattern
   * @returns {number} Number of entries deleted
   */
  static deleteByPattern(pattern) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    const keysToDelete = [];
    
    for (const key of this.#cache.keys()) {
      if (!key.startsWith('tag:') && regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    let count = 0;
    keysToDelete.forEach(key => {
      if (this.delete(key)) {
        count++;
      }
    });
    
    return count;
  }

  /**
   * Clear all cache entries
   * @static
   * @returns {void}
   */
  static clear() {
    this.#cache.clear();
  }

  /**
   * Get cache statistics
   * @static
   * @returns {Object} Cache statistics
   */
  static getStats() {
    let totalEntries = 0;
    let totalSize = 0;
    let expiredCount = 0;
    const now = Date.now();
    
    const tagCount = new Map();
    const hitDistribution = {
      0: 0,
      '1-10': 0,
      '11-50': 0,
      '51-100': 0,
      '100+': 0
    };
    
    for (const [key, entry] of this.#cache.entries()) {
      if (key.startsWith('tag:')) continue;
      
      totalEntries++;
      
      // Estimate size (rough approximation)
      totalSize += JSON.stringify(entry.value).length;
      
      // Check expiration
      if (entry.expiresAt && now > entry.expiresAt) {
        expiredCount++;
      }
      
      // Count tags
      entry.tags.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
      
      // Hit distribution
      if (entry.hits === 0) {
        hitDistribution[0]++;
      } else if (entry.hits <= 10) {
        hitDistribution['1-10']++;
      } else if (entry.hits <= 50) {
        hitDistribution['11-50']++;
      } else if (entry.hits <= 100) {
        hitDistribution['51-100']++;
      } else {
        hitDistribution['100+']++;
      }
    }
    
    return {
      totalEntries,
      totalSize,
      expiredCount,
      averageSize: totalEntries > 0 ? Math.round(totalSize / totalEntries) : 0,
      tagCount: Object.fromEntries(tagCount),
      hitDistribution
    };
  }

  /**
   * Get or set cache value
   * @static
   * @async
   * @param {string} key - Cache key
   * @param {Function} factory - Factory function to generate value
   * @param {Object} [options={}] - Cache options
   * @returns {Promise<*>} Cached or generated value
   */
  static async getOrSet(key, factory, options = {}) {
    const cached = this.get(key);
    
    if (cached !== undefined) {
      return cached;
    }
    
    const value = await factory();
    this.set(key, value, options);
    
    return value;
  }

  /**
   * Wrap function with caching
   * @static
   * @param {Function} fn - Function to wrap
   * @param {Object} [options={}] - Options
   * @param {string} [options.prefix] - Cache key prefix
   * @param {number} [options.ttl] - Time to live
   * @param {Function} [options.keyGenerator] - Custom key generator
   * @returns {Function} Wrapped function
   */
  static wrap(fn, options = {}) {
    const {
      prefix = fn.name || 'wrapped',
      ttl = this.#DEFAULT_TTL,
      keyGenerator = (...args) => this.generateKey(prefix, ...args)
    } = options;
    
    return async function (...args) {
      const key = keyGenerator(...args);
      
      return CacheHelper.getOrSet(key, () => fn.apply(this, args), { ttl });
    };
  }

  /**
   * Create cache middleware for Express
   * @static
   * @param {Object} [options={}] - Options
   * @param {number} [options.ttl] - Time to live
   * @param {Function} [options.keyGenerator] - Custom key generator
   * @param {Function} [options.condition] - Condition function
   * @param {string[]} [options.tags] - Cache tags
   * @returns {Function} Express middleware
   */
  static middleware(options = {}) {
    const {
      ttl = this.#DEFAULT_TTL,
      keyGenerator = (req) => this.generateRequestKey(req),
      condition = () => true,
      tags = []
    } = options;
    
    return (req, res, next) => {
      // Check if caching should be applied
      if (!condition(req, res)) {
        return next();
      }
      
      const key = keyGenerator(req);
      const cached = this.get(key);
      
      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }
      
      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache response
      res.json = function (body) {
        res.set('X-Cache', 'MISS');
        
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          CacheHelper.set(key, body, { ttl, tags: [...tags, `status:${res.statusCode}`] });
        }
        
        // Call original json method
        return originalJson.call(this, body);
      };
      
      next();
    };
  }

  /**
   * Clean expired entries
   * @static
   * @returns {number} Number of entries cleaned
   */
  static cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, entry] of this.#cache.entries()) {
      if (key.startsWith('tag:')) continue;
      
      if (entry.expiresAt && now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }
    
    let count = 0;
    keysToDelete.forEach(key => {
      if (this.delete(key)) {
        count++;
      }
    });
    
    return count;
  }

  /**
   * Schedule periodic cleanup
   * @static
   * @param {number} [interval=300000] - Cleanup interval in ms (default: 5 minutes)
   * @returns {Object} Cleanup handle with stop method
   */
  static scheduleCleanup(interval = 300000) {
    const intervalId = setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) {
        console.log(`Cache cleanup: removed ${cleaned} expired entries`);
      }
    }, interval);
    
    return {
      stop: () => clearInterval(intervalId)
    };
  }

  /**
   * Export cache for persistence
   * @static
   * @returns {Object} Exportable cache data
   */
  static export() {
    const data = {};
    const now = Date.now();
    
    for (const [key, entry] of this.#cache.entries()) {
      if (key.startsWith('tag:')) continue;
      
      // Skip expired entries
      if (entry.expiresAt && now > entry.expiresAt) continue;
      
      data[key] = {
        value: entry.value,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        tags: Array.from(entry.tags),
        hits: entry.hits
      };
    }
    
    return data;
  }

  /**
   * Import cache from exported data
   * @static
   * @param {Object} data - Exported cache data
   * @returns {number} Number of entries imported
   */
  static import(data) {
    let count = 0;
    
    Object.entries(data).forEach(([key, entry]) => {
      // Skip already expired entries
      if (entry.expiresAt && Date.now() > entry.expiresAt) return;
      
      this.#cache.set(key, {
        value: entry.value,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        tags: new Set(entry.tags || []),
        hits: entry.hits || 0
      });
      
      // Rebuild tag index
      (entry.tags || []).forEach(tag => {
        const tagKey = `tag:${tag}`;
        const taggedKeys = this.#cache.get(tagKey) || new Set();
        taggedKeys.add(key);
        this.#cache.set(tagKey, taggedKeys);
      });
      
      count++;
    });
    
    return count;
  }
}

module.exports = CacheHelper;