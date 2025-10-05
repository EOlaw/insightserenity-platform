/**
 * @fileoverview Request Logger Middleware
 * @module servers/customer-services/middleware/request-logger
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Request logger middleware factory
 * @param {Object} options - Logger options
 * @returns {Function} Express middleware
 */
function createRequestLogger(options = {}) {
    const {
        logger = console,
        includeBody = false,
        includeSensitive = false,
        skipPaths = ['/health', '/metrics']
    } = options;

    return (req, res, next) => {
        // Skip logging for certain paths
        if (skipPaths.includes(req.path)) {
            return next();
        }

        // Generate request ID
        req.id = req.headers['x-request-id'] || uuidv4();
        res.setHeader('X-Request-ID', req.id);

        // Capture start time
        const startTime = Date.now();

        // Log request
        const requestLog = {
            id: req.id,
            method: req.method,
            path: req.path,
            query: req.query,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            tenantId: req.tenantId,
            userId: req.user?.id
        };

        if (includeBody && req.body) {
            requestLog.body = includeSensitive
                ? req.body
                : sanitizeBody(req.body);
        }

        logger.info('Request received', requestLog);

        // Capture response
        const originalSend = res.send;
        res.send = function(data) {
            res.send = originalSend;

            // Log response
            const duration = Date.now() - startTime;
            const responseLog = {
                id: req.id,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                contentLength: res.get('content-length')
            };

            if (res.statusCode >= 400) {
                logger.error('Request failed', responseLog);
            } else {
                logger.info('Request completed', responseLog);
            }

            return res.send(data);
        };

        next();
    };
}

/**
 * Sanitize sensitive data from body
 * @private
 */
function sanitizeBody(body) {
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
    const sanitized = { ...body };

    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '***REDACTED***';
        }
    });

    return sanitized;
}

module.exports = createRequestLogger;
