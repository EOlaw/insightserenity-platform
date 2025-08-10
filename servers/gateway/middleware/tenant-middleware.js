/**
 * Tenant Middleware
 * Handles multi-tenant detection and context
 */

/**
 * Tenant Middleware Class
 */
class TenantMiddleware {
    constructor(config, serviceRegistry) {
        this.config = config;
        this.serviceRegistry = serviceRegistry;
        this.tenantCache = new Map();
        this.tenantValidationCache = new Map();
    }

    /**
     * Initialize tenant middleware
     */
    async initialize() {
        if (!this.config.enabled) {
            console.info('Multi-tenancy is disabled');
            return;
        }

        console.info('Tenant middleware initialized');
    }

    /**
     * Get middleware function
     */
    getMiddleware() {
        return async (req, res, next) => {
            if (!this.config.enabled) {
                req.tenant = {
                    id: this.config.defaultTenant || 'default',
                    domain: req.hostname,
                    isDefault: true
                };
                return next();
            }

            try {
                // Extract tenant identifier
                const tenantId = await this.extractTenantId(req);
                
                if (!tenantId) {
                    req.tenant = {
                        id: this.config.defaultTenant || 'default',
                        domain: req.hostname,
                        isDefault: true
                    };
                    return next();
                }

                // Validate tenant if configured
                if (this.config.validation?.enabled) {
                    const isValid = await this.validateTenant(tenantId);
                    if (!isValid) {
                        return res.status(400).json({
                            error: 'Invalid Tenant',
                            message: 'The specified tenant is not valid',
                            requestId: req.id
                        });
                    }
                }

                // Get tenant details
                const tenantDetails = await this.getTenantDetails(tenantId);
                
                // Set tenant context
                req.tenant = {
                    id: tenantId,
                    ...tenantDetails,
                    isDefault: false
                };

                // Add tenant headers for downstream services
                req.headers['x-tenant-id'] = req.tenant.id;
                req.headers['x-tenant-domain'] = req.tenant.domain || req.hostname;
                
                if (req.tenant.organizationId) {
                    req.headers['x-organization-id'] = req.tenant.organizationId;
                }

                next();
            } catch (error) {
                console.error('Tenant middleware error:', error);
                return res.status(500).json({
                    error: 'Tenant Detection Error',
                    message: 'Failed to process tenant information',
                    requestId: req.id
                });
            }
        };
    }

    /**
     * Extract tenant ID from request
     */
    async extractTenantId(req) {
        const strategy = this.config.strategy || 'subdomain';
        
        switch (strategy) {
            case 'subdomain':
                return this.extractFromSubdomain(req);
            case 'header':
                return this.extractFromHeader(req);
            case 'path':
                return this.extractFromPath(req);
            case 'custom':
                return this.extractCustom(req);
            default:
                return null;
        }
    }

    /**
     * Extract tenant from subdomain
     */
    extractFromSubdomain(req) {
        const hostname = req.hostname;
        
        // Skip if localhost or IP address
        if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            return null;
        }

        // Extract subdomain
        const parts = hostname.split('.');
        if (parts.length >= 3) {
            const subdomain = parts[0];
            
            // Skip common subdomains that are not tenants
            const skipSubdomains = ['www', 'api', 'admin', 'app'];
            if (skipSubdomains.includes(subdomain)) {
                return null;
            }
            
            return subdomain;
        }

        return null;
    }

    /**
     * Extract tenant from header
     */
    extractFromHeader(req) {
        const headerName = this.config.headerName || 'X-Tenant-ID';
        return req.headers[headerName.toLowerCase()] || null;
    }

    /**
     * Extract tenant from path
     */
    extractFromPath(req) {
        // Example: /tenant/{tenantId}/api/...
        const pathMatch = req.path.match(/^\/tenant\/([^\/]+)/);
        if (pathMatch) {
            // Rewrite path to remove tenant prefix
            req.url = req.url.replace(`/tenant/${pathMatch[1]}`, '');
            req.path = req.path.replace(`/tenant/${pathMatch[1]}`, '');
            return pathMatch[1];
        }
        return null;
    }

    /**
     * Extract using custom function
     */
    extractCustom(req) {
        if (typeof this.config.customExtractor === 'function') {
            return this.config.customExtractor(req);
        }
        return null;
    }

    /**
     * Validate tenant
     */
    async validateTenant(tenantId) {
        // Check cache first
        if (this.config.validation?.cache) {
            const cached = this.tenantValidationCache.get(tenantId);
            if (cached && cached.expires > Date.now()) {
                return cached.valid;
            }
        }

        try {
            // Call validation service or check database
            const isValid = await this.performTenantValidation(tenantId);
            
            // Cache validation result
            if (this.config.validation?.cache) {
                const cacheTtl = this.config.validation.cacheTtl || 300;
                this.tenantValidationCache.set(tenantId, {
                    valid: isValid,
                    expires: Date.now() + (cacheTtl * 1000)
                });
            }

            return isValid;
        } catch (error) {
            console.error('Tenant validation error:', error);
            // Fail open or closed based on configuration
            return this.config.validation?.failOpen !== false;
        }
    }

    /**
     * Perform actual tenant validation
     */
    async performTenantValidation(tenantId) {
        // This would typically call a service or check a database
        // For now, we'll implement a simple validation
        
        // Check if tenant exists in allowed list
        if (this.config.allowedTenants) {
            return this.config.allowedTenants.includes(tenantId);
        }

        // Check if tenant exists in blocked list
        if (this.config.blockedTenants) {
            return !this.config.blockedTenants.includes(tenantId);
        }

        // Default to valid
        return true;
    }

    /**
     * Get tenant details
     */
    async getTenantDetails(tenantId) {
        // Check cache first
        const cached = this.tenantCache.get(tenantId);
        if (cached && cached.expires > Date.now()) {
            return cached.details;
        }

        try {
            // Fetch tenant details from service or database
            const details = await this.fetchTenantDetails(tenantId);
            
            // Cache tenant details
            const cacheTtl = this.config.validation?.cacheTtl || 300;
            this.tenantCache.set(tenantId, {
                details: details,
                expires: Date.now() + (cacheTtl * 1000)
            });

            return details;
        } catch (error) {
            console.error('Error fetching tenant details:', error);
            return {
                domain: null,
                organizationId: null,
                settings: {}
            };
        }
    }

    /**
     * Fetch tenant details from service
     */
    async fetchTenantDetails(tenantId) {
        // This would typically call a service or query a database
        // For now, return mock details
        return {
            domain: `${tenantId}.insightserenity.com`,
            organizationId: `org_${tenantId}`,
            plan: 'enterprise',
            features: {
                maxUsers: 1000,
                maxProjects: 100,
                advancedAnalytics: true,
                customBranding: true
            },
            settings: {
                timezone: 'UTC',
                locale: 'en-US',
                dateFormat: 'MM/DD/YYYY'
            },
            limits: {
                apiRateLimit: 10000,
                storageQuota: 100 * 1024 * 1024 * 1024, // 100GB
                monthlyApiCalls: 1000000
            },
            status: 'active',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date()
        };
    }

    /**
     * Clear tenant cache
     */
    clearCache(tenantId = null) {
        if (tenantId) {
            this.tenantCache.delete(tenantId);
            this.tenantValidationCache.delete(tenantId);
        } else {
            this.tenantCache.clear();
            this.tenantValidationCache.clear();
        }
    }

    /**
     * Get tenant isolation headers
     */
    getTenantIsolationHeaders(tenant) {
        return {
            'X-Tenant-ID': tenant.id,
            'X-Tenant-Domain': tenant.domain,
            'X-Tenant-Plan': tenant.plan || 'default',
            'X-Tenant-Status': tenant.status || 'active',
            'X-Organization-ID': tenant.organizationId || ''
        };
    }

    /**
     * Check if request is for tenant admin
     */
    isTenantAdmin(req) {
        if (!req.user || !req.tenant) {
            return false;
        }

        return req.user.roles?.includes(`tenant_admin:${req.tenant.id}`) ||
               req.user.roles?.includes('super_admin');
    }

    /**
     * Check if user belongs to tenant
     */
    userBelongsToTenant(req) {
        if (!req.user || !req.tenant) {
            return false;
        }

        return req.user.tenantId === req.tenant.id ||
               req.user.tenants?.includes(req.tenant.id) ||
               req.user.roles?.includes('super_admin');
    }

    /**
     * Get tenant-specific configuration
     */
    getTenantConfig(tenantId) {
        // This could return tenant-specific configuration overrides
        const tenantConfigs = this.config.tenantConfigs || {};
        return tenantConfigs[tenantId] || {};
    }

    /**
     * Apply tenant-specific rate limits
     */
    getTenantRateLimits(tenant) {
        const defaultLimits = {
            requestsPerMinute: 100,
            requestsPerHour: 5000,
            requestsPerDay: 100000
        };

        if (tenant.limits) {
            return {
                ...defaultLimits,
                ...tenant.limits
            };
        }

        // Apply plan-based limits
        const planLimits = {
            free: {
                requestsPerMinute: 20,
                requestsPerHour: 1000,
                requestsPerDay: 10000
            },
            basic: {
                requestsPerMinute: 60,
                requestsPerHour: 3000,
                requestsPerDay: 50000
            },
            pro: {
                requestsPerMinute: 200,
                requestsPerHour: 10000,
                requestsPerDay: 200000
            },
            enterprise: {
                requestsPerMinute: 1000,
                requestsPerHour: 50000,
                requestsPerDay: 1000000
            }
        };

        return planLimits[tenant.plan] || defaultLimits;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.tenantCache.clear();
        this.tenantValidationCache.clear();
    }
}

module.exports = { TenantMiddleware };