/**
 * @fileoverview Correlation ID Middleware
 * @module servers/gateway/middleware/correlation-id
 */

const crypto = require('crypto');

/**
 * Correlation ID Middleware
 */
module.exports = (options = {}) => {
    const headerName = options.headerName || 'x-correlation-id';
    const generator = options.generator || (() => `corr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);

    return (req, res, next) => {
        // Check if correlation ID already exists
        let correlationId = req.headers[headerName];

        // Generate new ID if not present
        if (!correlationId) {
            correlationId = generator();
        }

        // Attach to request
        req.correlationId = correlationId;

        // Add to response headers
        res.setHeader('X-Correlation-ID', correlationId);

        // Add to request headers for downstream services
        req.headers[headerName] = correlationId;

        next();
    };
};
