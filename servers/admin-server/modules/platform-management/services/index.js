'use strict';

/**
 * @fileoverview Platform Management Services Index - Central export for all platform management services
 * @module servers/admin-server/modules/platform-management/services
 * @description This module serves as the central entry point for all platform management services,
 *              providing a unified interface for service access and dependency injection.
 */

const express = require('express');
const logger = require('../../../../../shared/lib/utils/logger');

// Import individual services
const ConfigurationService = require('./configuration-service');
const PlatformService = require('./platform-service');
const SystemService = require('./system-service');
const MaintenanceService = require('./maintenance-service');

/**
 * Platform Management Service Router
 * Provides REST API endpoints for platform management functionality
 */
class PlatformManagementServiceRouter {
    constructor() {
        this.router = express.Router();
        this.services = {
            configuration: ConfigurationService,
            platform: PlatformService,
            system: SystemService,
            maintenance: MaintenanceService
        };
        
        this.setupRoutes();
        this.setupHealthChecks();
    }

    /**
     * Setup service routes
     */
    setupRoutes() {
        // Configuration service routes
        this.router.use('/configurations', this.createServiceMiddleware('configuration'), ConfigurationService.router || ConfigurationService);
        
        // Platform service routes  
        this.router.use('/platform', this.createServiceMiddleware('platform'), PlatformService.router || PlatformService);
        
        // System service routes
        this.router.use('/system', this.createServiceMiddleware('system'), SystemService.router || SystemService);
        
        // Maintenance service routes
        this.router.use('/maintenance', this.createServiceMiddleware('maintenance'), MaintenanceService.router || MaintenanceService);

        logger.info('Platform management service routes configured', {
            services: Object.keys(this.services),
            routesConfigured: true
        });
    }

    /**
     * Create middleware for individual services
     */
    createServiceMiddleware(serviceName) {
        return (req, res, next) => {
            req.serviceName = serviceName;
            req.serviceModule = 'platform-management';
            next();
        };
    }

    /**
     * Setup health check endpoints
     */
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
                        module: 'platform-management',
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

    /**
     * Get the configured router
     */
    getRouter() {
        return this.router;
    }

    /**
     * Get service registry information
     */
    getServices() {
        return this.services;
    }
}

// Create router instance
const platformManagementRouter = new PlatformManagementServiceRouter();

// Export the router (this is what the admin app expects)
module.exports = platformManagementRouter.getRouter();

// Export additional interfaces for flexibility
module.exports.PlatformManagementServiceRouter = PlatformManagementServiceRouter;
module.exports.services = platformManagementRouter.getServices();
module.exports.router = platformManagementRouter.getRouter();

// Export individual services for direct access
module.exports.ConfigurationService = ConfigurationService;
module.exports.PlatformService = PlatformService;
module.exports.SystemService = SystemService;
module.exports.MaintenanceService = MaintenanceService;

logger.info('Platform Management Services module initialized', {
    services: Object.keys(platformManagementRouter.getServices()),
    exportsConfigured: true
});