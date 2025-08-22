'use strict';

/**
 * @fileoverview Organization Management Services Index
 * @module servers/admin-server/modules/organization-management/services
 */

const express = require('express');
const logger = require('../../../../../shared/lib/utils/logger');

// Import organization services with error handling
let OrganizationService, TenantService, SubscriptionService, BillingService;

try {
    OrganizationService = require('./organization-service');
} catch (error) {
    logger.warn('OrganizationService not found, using placeholder', { error: error.message });
    OrganizationService = { router: express.Router() };
}

try {
    TenantService = require('./tenant-service');
} catch (error) {
    logger.warn('TenantService not found, using placeholder', { error: error.message });
    TenantService = { router: express.Router() };
}

try {
    SubscriptionService = require('./subscription-service');
} catch (error) {
    logger.warn('SubscriptionService not found, using placeholder', { error: error.message });
    SubscriptionService = { router: express.Router() };
}

try {
    BillingService = require('./billing-service');
} catch (error) {
    logger.warn('BillingService not found, using placeholder', { error: error.message });
    BillingService = { router: express.Router() };
}

class OrganizationManagementServiceRouter {
    constructor() {
        this.router = express.Router();
        this.services = {
            organization: OrganizationService,
            tenant: TenantService,
            subscription: SubscriptionService,
            billing: BillingService
        };
        
        this.setupRoutes();
        this.setupHealthChecks();
    }

    setupRoutes() {
        this.router.use('/organizations', this.createServiceMiddleware('organization'), OrganizationService.router || OrganizationService);
        this.router.use('/tenants', this.createServiceMiddleware('tenant'), TenantService.router || TenantService);
        this.router.use('/subscriptions', this.createServiceMiddleware('subscription'), SubscriptionService.router || SubscriptionService);
        this.router.use('/billing', this.createServiceMiddleware('billing'), BillingService.router || BillingService);

        logger.info('Organization management service routes configured', {
            services: Object.keys(this.services)
        });
    }

    createServiceMiddleware(serviceName) {
        return (req, res, next) => {
            req.serviceName = serviceName;
            req.serviceModule = 'organization-management';
            next();
        };
    }

    setupHealthChecks() {
        this.router.get('/health', async (req, res) => {
            try {
                const serviceHealth = {};
                
                for (const [name, service] of Object.entries(this.services)) {
                    try {
                        if (service.healthCheck && typeof service.healthCheck === 'function') {
                            serviceHealth[name] = await service.healthCheck();
                        } else {
                            serviceHealth[name] = { status: 'available', initialized: true };
                        }
                    } catch (error) {
                        serviceHealth[name] = { status: 'error', error: error.message };
                    }
                }

                const overallStatus = Object.values(serviceHealth).every(s => s.status === 'available' || s.status === 'healthy') 
                    ? 'healthy' : 'degraded';

                res.json({
                    success: true,
                    data: {
                        module: 'organization-management',
                        status: overallStatus,
                        services: serviceHealth,
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
    }

    getRouter() {
        return this.router;
    }

    getServices() {
        return this.services;
    }
}

const organizationManagementRouter = new OrganizationManagementServiceRouter();

module.exports = organizationManagementRouter.getRouter();
module.exports.OrganizationManagementServiceRouter = OrganizationManagementServiceRouter;
module.exports.services = organizationManagementRouter.getServices();
module.exports.router = organizationManagementRouter.getRouter();

module.exports.OrganizationService = OrganizationService;
module.exports.TenantService = TenantService;
module.exports.SubscriptionService = SubscriptionService;
module.exports.BillingService = BillingService;

logger.info('Organization Management Services module initialized', {
    services: Object.keys(organizationManagementRouter.getServices())
});