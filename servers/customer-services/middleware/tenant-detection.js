/**
 * @file Tenant Detection Middleware
 * @description Multi-tenant detection middleware for customer services
 *              Identifies tenant from various sources and sets tenant context
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 */

'use strict';

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const Database = require('../../../shared/lib/database');
const CacheService = require('../../../shared/lib/services/cache-service');

/**
 * Tenant Detection Middleware
 * Detects tenant context from multiple sources including:
 * - Custom domain (subdomain.platform.com)
 * - X-Tenant-ID header
 * - Host header analysis
 * - JWT token tenant claim
 * - Organization context
 * - Query parameters (for development/testing)
 */
class TenantDetectionMiddleware {
    constructor(options = {}) {
        this.config = {
            enableDomainDetection: options.enableDomainDetection !== false,
            enableHeaderDetection: options.enableHeaderDetection !== false,
            enableTokenDetection: options.enableTokenDetection !== false,
            enableQueryDetection: options.enableQueryDetection === true && process.env.NODE_ENV === 'development',
            defaultTenant: options.defaultTenant || 'default',
            cacheEnabled: options.cacheEnabled !== false,
            cacheTTL: options.cacheTTL || 300, // 5 minutes
            allowedDomains: options.allowedDomains || [],
            strictMode: options.strictMode === true,
            developmentTenants: options.developmentTenants || ['dev', 'test', 'demo'],
            customDomainMapping: options.customDomainMapping || new Map()
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.tenantCache = new Map();
        this.domainCache = new Map();

        console.log('🏢 DEBUG: TenantDetectionMiddleware initialized');
        logger.info('Tenant detection middleware initialized', {
            domainDetection: this.config.enableDomainDetection,
            headerDetection: this.config.enableHeaderDetection,
            tokenDetection: this.config.enableTokenDetection,
            queryDetection: this.config.enableQueryDetection,
            strictMode: this.config.strictMode
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    detect = async (req, res, next) => {
        try {
            const startTime = Date.now();
            req.tenantDetection = {
                startTime,
                attempts: [],
                source: null,
                tenantId: null,
                tenant: null,
                organizationId: null,
                customDomain: null,
                isValid: false
            };

            console.log(`🔍 DEBUG: Starting tenant detection for ${req.method} ${req.path}`);

            // Try different detection methods in order of priority
            const detectionMethods = [
                { method: 'detectFromCustomDomain', priority: 1 },
                { method: 'detectFromHeaders', priority: 2 },
                { method: 'detectFromToken', priority: 3 },
                { method: 'detectFromOrganization', priority: 4 }
            ];

            // Add query detection for development
            if (this.config.enableQueryDetection) {
                detectionMethods.push({ method: 'detectFromQuery', priority: 5 });
            }

            // Sort by priority
            detectionMethods.sort((a, b) => a.priority - b.priority);

            for (const { method } of detectionMethods) {
                try {
                    const result = await this[method](req);
                    if (result && result.tenantId) {
                        console.log(`✅ DEBUG: Tenant detected via ${method}: ${result.tenantId}`);
                        req.tenantDetection = { ...req.tenantDetection, ...result };
                        req.tenantDetection.source = method;
                        break;
                    }
                } catch (error) {
                    console.log(`⚠️  DEBUG: ${method} failed:`, error.message);
                    req.tenantDetection.attempts.push({
                        method,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Validate and load tenant data
            if (req.tenantDetection.tenantId) {
                await this.validateAndLoadTenant(req);
            } else {
                // Use default tenant if no tenant detected
                console.log(`🏢 DEBUG: No tenant detected, using default: ${this.config.defaultTenant}`);
                req.tenantDetection.tenantId = this.config.defaultTenant;
                req.tenantDetection.source = 'default';
                await this.validateAndLoadTenant(req);
            }

            // Set tenant context on request
            req.tenantId = req.tenantDetection.tenantId;
            req.tenant = req.tenantDetection.tenant;
            req.organizationId = req.tenantDetection.organizationId;

            // Set response headers
            res.setHeader('X-Tenant-ID', req.tenantDetection.tenantId);
            if (req.tenantDetection.organizationId) {
                res.setHeader('X-Organization-ID', req.tenantDetection.organizationId);
            }
            res.setHeader('X-Tenant-Source', req.tenantDetection.source);

            const duration = Date.now() - startTime;
            console.log(`✅ DEBUG: Tenant detection completed in ${duration}ms: ${req.tenantDetection.tenantId}`);

            logger.debug('Tenant detection completed', {
                tenantId: req.tenantDetection.tenantId,
                source: req.tenantDetection.source,
                organizationId: req.tenantDetection.organizationId,
                duration,
                path: req.path,
                method: req.method,
                isValid: req.tenantDetection.isValid
            });

            next();
        } catch (error) {
            console.error('❌ DEBUG: Tenant detection failed:', error.message);
            logger.error('Tenant detection middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method,
                headers: req.headers,
                requestId: req.requestId
            });

            if (this.config.strictMode) {
                return next(new AppError('Tenant detection failed', 400, 'TENANT_DETECTION_ERROR'));
            }

            // Fallback to default tenant in non-strict mode
            req.tenantId = this.config.defaultTenant;
            req.tenant = null;
            req.organizationId = null;
            req.tenantDetection = {
                tenantId: this.config.defaultTenant,
                source: 'fallback',
                isValid: false,
                error: error.message
            };

            res.setHeader('X-Tenant-ID', this.config.defaultTenant);
            res.setHeader('X-Tenant-Source', 'fallback');
            next();
        }
    };

    /**
     * Detect tenant from custom domain (subdomain or custom domain)
     * @param {Object} req - Express request object
     * @returns {Object|null} Detection result
     */
    async detectFromCustomDomain(req) {
        if (!this.config.enableDomainDetection) {
            return null;
        }

        const host = req.get('host') || req.hostname || '';
        console.log(`🌐 DEBUG: Detecting tenant from domain: ${host}`);

        // Check cache first
        if (this.domainCache.has(host)) {
            console.log(`📦 DEBUG: Using cached domain result for ${host}`);
            return this.domainCache.get(host);
        }

        let tenantId = null;
        let customDomain = null;

        try {
            // Check for custom domain mapping
            if (this.config.customDomainMapping.has(host)) {
                const mapping = this.config.customDomainMapping.get(host);
                tenantId = mapping.tenantId;
                customDomain = host;
                console.log(`🎯 DEBUG: Found custom domain mapping: ${host} -> ${tenantId}`);
            }
            
            // Check for subdomain pattern (tenant.platform.com)
            else if (host.includes('.')) {
                const parts = host.split('.');
                if (parts.length >= 2) {
                    const subdomain = parts[0];
                    
                    // Skip www and other common prefixes
                    if (!['www', 'api', 'admin', 'app'].includes(subdomain.toLowerCase())) {
                        tenantId = subdomain.toLowerCase();
                        console.log(`🏷️  DEBUG: Extracted tenant from subdomain: ${tenantId}`);
                    }
                }
            }

            if (tenantId) {
                // Validate tenant exists
                const isValid = await this.validateTenantExists(tenantId);
                if (isValid) {
                    const result = {
                        tenantId,
                        customDomain,
                        isValid: true
                    };

                    // Cache the result
                    this.domainCache.set(host, result);
                    setTimeout(() => this.domainCache.delete(host), this.config.cacheTTL * 1000);

                    return result;
                } else {
                    console.log(`⚠️  DEBUG: Invalid tenant from domain: ${tenantId}`);
                }
            }

        } catch (error) {
            console.error(`❌ DEBUG: Domain detection error for ${host}:`, error.message);
            throw error;
        }

        return null;
    }

    /**
     * Detect tenant from request headers
     * @param {Object} req - Express request object
     * @returns {Object|null} Detection result
     */
    async detectFromHeaders(req) {
        if (!this.config.enableHeaderDetection) {
            return null;
        }

        console.log('📋 DEBUG: Detecting tenant from headers');

        // Check various header formats
        const headerSources = [
            'x-tenant-id',
            'x-tenant',
            'tenant-id',
            'tenant',
            'x-organization-id',
            'organization-id'
        ];

        for (const headerName of headerSources) {
            const headerValue = req.get(headerName);
            if (headerValue && typeof headerValue === 'string') {
                const tenantId = headerValue.trim().toLowerCase();
                console.log(`📋 DEBUG: Found tenant in header ${headerName}: ${tenantId}`);

                // Validate tenant
                const isValid = await this.validateTenantExists(tenantId);
                if (isValid) {
                    return {
                        tenantId,
                        isValid: true,
                        headerSource: headerName
                    };
                } else {
                    console.log(`⚠️  DEBUG: Invalid tenant from header ${headerName}: ${tenantId}`);
                }
            }
        }

        return null;
    }

    /**
     * Detect tenant from JWT token
     * @param {Object} req - Express request object
     * @returns {Object|null} Detection result
     */
    async detectFromToken(req) {
        if (!this.config.enableTokenDetection) {
            return null;
        }

        console.log('🔑 DEBUG: Detecting tenant from token');

        try {
            // Get token from various sources
            let token = null;
            const authHeader = req.get('authorization');
            
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            } else if (req.cookies && req.cookies.jwt) {
                token = req.cookies.jwt;
            } else if (req.get('x-api-key')) {
                token = req.get('x-api-key');
            }

            if (!token) {
                console.log('🔑 DEBUG: No token found for tenant detection');
                return null;
            }

            // Decode token (don't verify yet, just extract claims)
            const jwt = require('jsonwebtoken');
            const decoded = jwt.decode(token);

            if (!decoded) {
                console.log('🔑 DEBUG: Unable to decode token');
                return null;
            }

            // Look for tenant information in token claims
            const tenantSources = [
                decoded.tenantId,
                decoded.tenant,
                decoded.tid,
                decoded.organizationId,
                decoded.org,
                decoded.sub ? decoded.sub.split(':')[0] : null // tenant:user format
            ];

            for (const tenantId of tenantSources) {
                if (tenantId && typeof tenantId === 'string') {
                    console.log(`🔑 DEBUG: Found tenant in token: ${tenantId}`);
                    
                    const isValid = await this.validateTenantExists(tenantId);
                    if (isValid) {
                        return {
                            tenantId: tenantId.toLowerCase(),
                            organizationId: decoded.organizationId || decoded.org,
                            isValid: true,
                            tokenClaims: decoded
                        };
                    }
                }
            }

        } catch (error) {
            console.error('❌ DEBUG: Token detection error:', error.message);
            // Don't throw, just return null to try other methods
        }

        return null;
    }

    /**
     * Detect tenant from organization context
     * @param {Object} req - Express request object
     * @returns {Object|null} Detection result
     */
    async detectFromOrganization(req) {
        console.log('🏛️  DEBUG: Detecting tenant from organization context');

        try {
            // If user is authenticated and has organization
            if (req.user && req.user.organizationId) {
                console.log(`🏛️  DEBUG: Using tenant from user organization: ${req.user.organizationId}`);
                
                const tenantId = req.user.organizationId.toString();
                const isValid = await this.validateTenantExists(tenantId);
                
                if (isValid) {
                    return {
                        tenantId,
                        organizationId: req.user.organizationId,
                        isValid: true,
                        userId: req.user.id
                    };
                }
            }

        } catch (error) {
            console.error('❌ DEBUG: Organization detection error:', error.message);
        }

        return null;
    }

    /**
     * Detect tenant from query parameters (development only)
     * @param {Object} req - Express request object
     * @returns {Object|null} Detection result
     */
    async detectFromQuery(req) {
        if (!this.config.enableQueryDetection || process.env.NODE_ENV === 'production') {
            return null;
        }

        console.log('🔍 DEBUG: Detecting tenant from query parameters (development)');

        const queryTenant = req.query.tenant || req.query.tenantId;
        if (queryTenant) {
            const tenantId = queryTenant.toLowerCase();
            console.log(`🔍 DEBUG: Found tenant in query: ${tenantId}`);

            // Allow development tenants without validation
            if (this.config.developmentTenants.includes(tenantId)) {
                return {
                    tenantId,
                    isValid: true,
                    isDevelopment: true
                };
            }

            // Validate other tenants
            const isValid = await this.validateTenantExists(tenantId);
            if (isValid) {
                return {
                    tenantId,
                    isValid: true
                };
            }
        }

        return null;
    }

    /**
     * Validate tenant exists and load tenant data
     * @param {Object} req - Express request object
     */
    async validateAndLoadTenant(req) {
        const { tenantId } = req.tenantDetection;
        console.log(`🔍 DEBUG: Validating and loading tenant: ${tenantId}`);

        try {
            // Check cache first
            const cacheKey = `tenant:${tenantId}`;
            let tenantData = null;

            if (this.cache) {
                tenantData = await this.cache.get(cacheKey);
                if (tenantData) {
                    console.log(`📦 DEBUG: Using cached tenant data for ${tenantId}`);
                    req.tenantDetection.tenant = tenantData;
                    req.tenantDetection.isValid = true;
                    req.tenantDetection.organizationId = tenantData.organizationId;
                    return;
                }
            }

            // Load tenant from database
            if (tenantId !== this.config.defaultTenant && !req.tenantDetection.isDevelopment) {
                const Organization = await Database.getModel('Organization');
                const organization = await Organization.findById(tenantId)
                    .select('name slug type status subscription contact settings')
                    .lean();

                if (organization) {
                    tenantData = {
                        id: organization._id.toString(),
                        name: organization.name,
                        slug: organization.slug,
                        type: organization.type,
                        status: organization.status,
                        subscription: organization.subscription,
                        contact: organization.contact,
                        settings: organization.settings,
                        loadedAt: new Date().toISOString()
                    };

                    console.log(`✅ DEBUG: Loaded tenant data for ${tenantId}: ${organization.name}`);

                    // Cache tenant data
                    if (this.cache) {
                        await this.cache.set(cacheKey, tenantData, this.config.cacheTTL);
                    }

                    req.tenantDetection.tenant = tenantData;
                    req.tenantDetection.isValid = true;
                    req.tenantDetection.organizationId = organization._id.toString();
                } else {
                    console.log(`⚠️  DEBUG: Tenant not found in database: ${tenantId}`);
                    req.tenantDetection.isValid = false;
                    req.tenantDetection.error = 'Tenant not found';
                }
            } else {
                // Default or development tenant
                tenantData = {
                    id: tenantId,
                    name: tenantId === this.config.defaultTenant ? 'Default Tenant' : `Development Tenant (${tenantId})`,
                    slug: tenantId,
                    type: 'system',
                    status: { state: 'active' },
                    subscription: { status: 'active', tier: 'free' },
                    isDevelopment: req.tenantDetection.isDevelopment,
                    loadedAt: new Date().toISOString()
                };

                req.tenantDetection.tenant = tenantData;
                req.tenantDetection.isValid = true;
                console.log(`✅ DEBUG: Using system tenant: ${tenantId}`);
            }

        } catch (error) {
            console.error(`❌ DEBUG: Tenant validation error for ${tenantId}:`, error.message);
            logger.error('Tenant validation failed', {
                tenantId,
                error: error.message,
                stack: error.stack
            });

            req.tenantDetection.isValid = false;
            req.tenantDetection.error = error.message;

            if (this.config.strictMode) {
                throw new AppError(`Invalid tenant: ${tenantId}`, 400, 'INVALID_TENANT');
            }
        }
    }

    /**
     * Validate that a tenant exists
     * @param {string} tenantId - Tenant ID to validate
     * @returns {boolean} Whether tenant exists
     */
    async validateTenantExists(tenantId) {
        if (!tenantId) return false;

        // Always allow default tenant
        if (tenantId === this.config.defaultTenant) {
            return true;
        }

        // Allow development tenants
        if (this.config.developmentTenants.includes(tenantId) && process.env.NODE_ENV !== 'production') {
            return true;
        }

        // Check cache
        if (this.tenantCache.has(tenantId)) {
            return this.tenantCache.get(tenantId);
        }

        try {
            const Organization = await Database.getModel('Organization');
            const exists = await Organization.exists({ $or: [{ _id: tenantId }, { slug: tenantId }] });
            
            // Cache result
            this.tenantCache.set(tenantId, !!exists);
            setTimeout(() => this.tenantCache.delete(tenantId), this.config.cacheTTL * 1000);

            return !!exists;
        } catch (error) {
            console.error(`❌ DEBUG: Error validating tenant existence for ${tenantId}:`, error.message);
            return false;
        }
    }

    /**
     * Get tenant detection statistics
     * @returns {Object} Detection statistics
     */
    getStatistics() {
        return {
            cacheSize: this.tenantCache.size,
            domainCacheSize: this.domainCache.size,
            config: {
                domainDetection: this.config.enableDomainDetection,
                headerDetection: this.config.enableHeaderDetection,
                tokenDetection: this.config.enableTokenDetection,
                queryDetection: this.config.enableQueryDetection,
                strictMode: this.config.strictMode
            }
        };
    }

    /**
     * Clear all caches
     */
    clearCaches() {
        console.log('🧹 DEBUG: Clearing tenant detection caches');
        this.tenantCache.clear();
        this.domainCache.clear();
        logger.info('Tenant detection caches cleared');
    }

    /**
     * Add custom domain mapping
     * @param {string} domain - Custom domain
     * @param {string} tenantId - Tenant ID
     */
    addCustomDomainMapping(domain, tenantId) {
        console.log(`🌐 DEBUG: Adding custom domain mapping: ${domain} -> ${tenantId}`);
        this.config.customDomainMapping.set(domain, { tenantId });
        this.domainCache.delete(domain); // Clear cache for this domain
        logger.info('Custom domain mapping added', { domain, tenantId });
    }

    /**
     * Remove custom domain mapping
     * @param {string} domain - Custom domain to remove
     */
    removeCustomDomainMapping(domain) {
        console.log(`🗑️  DEBUG: Removing custom domain mapping: ${domain}`);
        this.config.customDomainMapping.delete(domain);
        this.domainCache.delete(domain);
        logger.info('Custom domain mapping removed', { domain });
    }
}

// Create singleton instance
const tenantDetectionMiddleware = new TenantDetectionMiddleware({
    enableDomainDetection: process.env.TENANT_DOMAIN_DETECTION !== 'false',
    enableHeaderDetection: process.env.TENANT_HEADER_DETECTION !== 'false',
    enableTokenDetection: process.env.TENANT_TOKEN_DETECTION !== 'false',
    enableQueryDetection: process.env.TENANT_QUERY_DETECTION === 'true',
    strictMode: process.env.TENANT_STRICT_MODE === 'true',
    cacheTTL: parseInt(process.env.TENANT_CACHE_TTL, 10) || 300,
    defaultTenant: process.env.DEFAULT_TENANT || 'default'
});

module.exports = tenantDetectionMiddleware.detect;