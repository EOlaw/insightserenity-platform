/**
 * @fileoverview Metrics Middleware
 * @module servers/gateway/middleware/metrics
 */

/**
 * Metrics Middleware
 */
module.exports = (metricsCollector) => {
    return (req, res, next) => {
        // Record request start time
        req.startTime = Date.now();

        // Store original end method
        const originalEnd = res.end;

        // Override end method to collect metrics
        res.end = function(...args) {
            // Calculate response time
            const responseTime = Date.now() - req.startTime;

            // Record metrics
            metricsCollector.recordRequest(req, res, responseTime);

            // Add response time header
            res.setHeader('X-Response-Time', `${responseTime}ms`);

            // Call original end method
            originalEnd.apply(res, args);
        };

        next();
    };
};
