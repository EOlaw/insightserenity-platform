/**
 * @fileoverview Response Cache Implementation
 * @module servers/gateway/utils/response-cache
 */

const crypto = require('crypto');
const { getLogger } = require('../../../shared/lib/utils/logger');

/**
 * Response Cache Class
 * @class ResponseCache
 */
class ResponseCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.ttl = options.ttl || 300000; // Default 5 minutes
        this.maxSize = options.maxSize || 100; // Max cache entries
        this.logger = getLogger({ serviceName: 'response-cache' });

        // Statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, options.cleanupInterval || 60000); // Clean every minute
    }

    /**
     * Generate cache key
     */
    generateKey(req) {
        const parts = [
            req.method,
            req.originalUrl || req.url,
            JSON.stringify(req.query || {}),
            req.headers['x-tenant-id'] || '',
            req.headers['authorization'] ? 'auth' : 'noauth'
        ];

        return crypto
            .createHash('md5')
            .update(parts.join(':'))
            .digest('hex');
    }

    /**
     * Get cached response
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        entry.hits++;
        entry.lastAccess = Date.now();

        return entry.data;
    }

    /**
     * Set cached response
     */
    set(key, data, ttl = null) {
        // Check cache size limit
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }

        const entry = {
            data,
            created: Date.now(),
            expiry: Date.now() + (ttl || this.ttl),
            hits: 0,
            lastAccess: Date.now()
        };

        this.cache.set(key, entry);
        this.stats.sets++;

        return true;
    }

    /**
     * Delete cached entry
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.stats.deletes++;
        }
        return deleted;
    }

    /**
     * Clear all cache
     */
    async clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.stats.deletes += size;

        this.logger.info('Cache cleared', { entries: size });
        return true;
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiry) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.stats.evictions += cleaned;
            this.logger.debug('Cache cleanup', { cleaned });
        }
    }

    /**
     * Evict oldest entry
     */
    evictOldest() {
        let oldestKey = null;
        let oldestTime = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccess < oldestTime) {
                oldestTime = entry.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    /**
     * Check if should cache response
     */
    shouldCache(req, res) {
        // Only cache GET requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return false;
        }

        // Only cache successful responses
        if (res.statusCode < 200 || res.statusCode >= 300) {
            return false;
        }

        // Check cache control headers
        const cacheControl = res.getHeader('cache-control');
        if (cacheControl) {
            if (cacheControl.includes('no-cache') ||
                cacheControl.includes('no-store') ||
                cacheControl.includes('private')) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get TTL from response headers
     */
    getTTLFromHeaders(res) {
        const cacheControl = res.getHeader('cache-control');

        if (cacheControl) {
            const maxAge = cacheControl.match(/max-age=(\d+)/);
            if (maxAge) {
                return parseInt(maxAge[1]) * 1000; // Convert to milliseconds
            }
        }

        const expires = res.getHeader('expires');
        if (expires) {
            const expiryTime = new Date(expires).getTime();
            const ttl = expiryTime - Date.now();
            if (ttl > 0) {
                return ttl;
            }
        }

        return this.ttl;
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
            key,
            created: new Date(entry.created).toISOString(),
            expiry: new Date(entry.expiry).toISOString(),
            hits: entry.hits,
            size: JSON.stringify(entry.data).length
        }));

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ttl: this.ttl,
            stats: this.stats,
            hitRate: this.stats.hits + this.stats.misses > 0
                ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
                : '0%',
            entries: entries.slice(0, 10) // Top 10 entries
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
    }

    /**
     * Stop cleanup interval
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

module.exports = { ResponseCache };
