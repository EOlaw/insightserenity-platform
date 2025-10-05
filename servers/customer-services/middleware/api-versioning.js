/**
 * @fileoverview API Versioning Middleware
 * @module servers/customer-services/middleware/api-versioning
 */

/**
 * API versioning middleware factory
 * @param {Object} options - Versioning options
 * @returns {Function} Express middleware
 */
function createApiVersioning(options = {}) {
    const {
        headerName = 'x-api-version',
        queryParam = 'apiVersion',
        defaultVersion = 'v1',
        supportedVersions = ['v1', 'v2'],
        strict = false
    } = options;

    return (req, res, next) => {
        // Extract version from various sources
        const version =
            req.headers[headerName.toLowerCase()] ||
            req.query[queryParam] ||
            extractVersionFromUrl(req.path) ||
            defaultVersion;

        // Validate version
        if (!supportedVersions.includes(version)) {
            if (strict) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'UNSUPPORTED_VERSION',
                        message: `API version ${version} is not supported`,
                        supportedVersions
                    }
                });
            }
            // Fall back to default version if not strict
            req.apiVersion = defaultVersion;
        } else {
            req.apiVersion = version;
        }

        // Add version to response headers
        res.setHeader('X-API-Version', req.apiVersion);

        // Modify request path if version is in URL
        if (req.path.includes(`/${req.apiVersion}/`)) {
            req.baseUrl = `/${req.apiVersion}`;
        }

        next();
    };
}

/**
 * Extract version from URL path
 * @private
 */
function extractVersionFromUrl(path) {
    const versionPattern = /\/(v\d+)\//;
    const match = path.match(versionPattern);
    return match ? match[1] : null;
}

module.exports = createApiVersioning;
