/**
 * @fileoverview Logging Middleware
 * @module servers/gateway/middleware/logging
 */

/**
 * Logging Middleware
 */
module.exports = (logger) => {
    return (req, res, next) => {
        // Record start time
        req.startTime = Date.now();

        // Log incoming request
        logger.info('Incoming request', {
            method: req.method,
            path: req.path,
            query: req.query,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            requestId: req.id,
            correlationId: req.correlationId
        });

        // Store original end method
        const originalEnd = res.end;

        // Override end method to log response
        res.end = function(...args) {
            const responseTime = Date.now() - req.startTime;

            // Log response
            const level = res.statusCode >= 400 ? 'error' : 'info';
            logger[level]('Request completed', {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                responseTime: `${responseTime}ms`,
                requestId: req.id,
                correlationId: req.correlationId
            });

            // Call original end method
            originalEnd.apply(res, args);
        };

        next();
    };
};
