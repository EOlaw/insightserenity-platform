/**
 * @fileoverview Not Found Handler Middleware
 * @module servers/customer-services/middleware/not-found-handler
 */

/**
 * Not found handler middleware factory
 * @param {Object} options - Handler options
 * @returns {Function} Express middleware
 */
function createNotFoundHandler(options = {}) {
    const {
        message = 'Resource not found',
        includeUrl = true
    } = options;

    return (req, res, next) => {
        const response = {
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: includeUrl
                    ? `${message}: ${req.method} ${req.originalUrl}`
                    : message,
                timestamp: new Date().toISOString()
            }
        };

        // Add request ID if available
        if (req.id) {
            response.error.requestId = req.id;
        }

        res.status(404).json(response);
    };
}

module.exports = createNotFoundHandler;
