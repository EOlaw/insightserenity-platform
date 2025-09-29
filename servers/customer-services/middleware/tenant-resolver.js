/**
 * @fileoverview Tenant Resolver Middleware
 * @module servers/customer-services/middleware/tenant-resolver
 */

/**
 * Tenant resolver middleware factory
 * @param {Object} options - Tenant resolver options
 * @returns {Function} Express middleware
 */
function createTenantResolver(options = {}) {
    const {
        headerName = 'x-tenant-id',
        queryParam = 'tenantId',
        defaultTenant = 'default',
        required = false,
        validateTenant = null
    } = options;

    return async (req, res, next) => {
        try {
            // Extract tenant ID from various sources
            const tenantId =
                req.headers[headerName.toLowerCase()] ||
                req.query[queryParam] ||
                req.params.tenantId ||
                (req.user && req.user.tenantId) ||
                (req.session && req.session.tenantId) ||
                defaultTenant;

            // Validate tenant if validator provided
            if (validateTenant && typeof validateTenant === 'function') {
                const isValid = await validateTenant(tenantId);
                if (!isValid) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            code: 'INVALID_TENANT',
                            message: `Invalid tenant ID: ${tenantId}`
                        }
                    });
                }
            }

            // Check if tenant is required
            if (required && (!tenantId || tenantId === defaultTenant)) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'TENANT_REQUIRED',
                        message: 'Tenant ID is required'
                    }
                });
            }

            // Attach tenant ID to request
            req.tenantId = tenantId;
            req.tenant = { id: tenantId };

            // Add tenant to response headers
            res.setHeader('X-Tenant-ID', tenantId);

            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = createTenantResolver;
