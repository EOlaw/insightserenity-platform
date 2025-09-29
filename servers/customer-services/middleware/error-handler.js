/**
 * @fileoverview Error Handler Middleware
 * @module servers/customer-services/middleware/error-handler
 */

/**
 * Error handler middleware factory
 * @param {Object} options - Error handler options
 * @returns {Function} Express error middleware
 */
function createErrorHandler(options = {}) {
    const {
        logger = console,
        includeStack = process.env.NODE_ENV !== 'production',
        defaultMessage = 'An error occurred'
    } = options;

    return (err, req, res, next) => {
        // Log error
        logger.error('Error occurred', {
            error: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method,
            ip: req.ip,
            tenantId: req.tenantId
        });

        // Determine status code
        const status = err.status || err.statusCode || 500;

        // Build error response
        const response = {
            success: false,
            error: {
                code: err.code || 'INTERNAL_ERROR',
                message: status === 500 && process.env.NODE_ENV === 'production'
                    ? defaultMessage
                    : err.message,
                timestamp: new Date().toISOString()
            }
        };

        // Add additional error details in development
        if (includeStack && err.stack) {
            response.error.stack = err.stack.split('\n');
        }

        if (err.details) {
            response.error.details = err.details;
        }

        // Add request ID if available
        if (req.id) {
            response.error.requestId = req.id;
        }

        // Send response
        res.status(status).json(response);
    };
}

module.exports = createErrorHandler;
