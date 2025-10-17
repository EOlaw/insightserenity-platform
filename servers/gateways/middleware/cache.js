/**
 * @fileoverview Cache Middleware
 * @module servers/gateway/middleware/cache
 */

/**
 * Cache Middleware
 */
module.exports = (responseCache, options = {}) => {
    return (req, res, next) => {
        // Skip caching for non-GET requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
        }

        // Generate cache key
        const cacheKey = responseCache.generateKey(req);

        // Try to get cached response
        const cachedData = responseCache.get(cacheKey);

        if (cachedData) {
            // Add cache headers
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Key', cacheKey);

            // Send cached response
            return res.status(cachedData.statusCode || 200)
                     .set(cachedData.headers || {})
                     .send(cachedData.body);
        }

        // Cache MISS - continue with request
        res.setHeader('X-Cache', 'MISS');

        // Store original send method
        const originalSend = res.send;
        const originalJson = res.json;

        // Override send method to cache response
        res.send = function(body) {
            res.send = originalSend;

            // Check if should cache
            if (responseCache.shouldCache(req, res)) {
                const ttl = options.ttl || responseCache.getTTLFromHeaders(res);

                const cacheData = {
                    statusCode: res.statusCode,
                    headers: res.getHeaders(),
                    body: body
                };

                responseCache.set(cacheKey, cacheData, ttl);
            }

            return originalSend.call(this, body);
        };

        // Override json method to cache response
        res.json = function(obj) {
            res.json = originalJson;

            // Check if should cache
            if (responseCache.shouldCache(req, res)) {
                const ttl = options.ttl || responseCache.getTTLFromHeaders(res);

                const cacheData = {
                    statusCode: res.statusCode,
                    headers: res.getHeaders(),
                    body: JSON.stringify(obj)
                };

                responseCache.set(cacheKey, cacheData, ttl);
            }

            return originalJson.call(this, obj);
        };

        next();
    };
};
