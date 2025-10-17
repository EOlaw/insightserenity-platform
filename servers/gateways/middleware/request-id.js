/**
 * @fileoverview Request ID Middleware
 * @module servers/gateway/middleware/request-id
 */

const crypto = require('crypto');

/**
 * Request ID Middleware
 */
module.exports = (options = {}) => {
    const headerName = options.headerName || 'x-request-id';
    const generator = options.generator || (() => `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);

    return (req, res, next) => {
        // Check if request ID already exists
        let requestId = req.headers[headerName];

        // Generate new ID if not present
        if (!requestId) {
            requestId = generator();
        }

        // Attach to request
        req.id = requestId;
        req.requestId = requestId;

        // Add to response headers
        res.setHeader('X-Request-ID', requestId);

        // Add to request headers for downstream services
        req.headers[headerName] = requestId;

        next();
    };
};
