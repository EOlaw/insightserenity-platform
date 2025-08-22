'use strict';

/**
 * @fileoverview User Management Services Index - Central export for all user management services
 * @module servers/admin-server/modules/user-management/services
 */

const express = require('express');
const logger = require('../../../../../shared/lib/utils/logger');

// Import individual services (adjust imports based on your actual service files)
let AdminUserService, UserProfileService, UserPermissionsService, UserSessionService;

try {
    AdminUserService = require('./admin-user-service');
} catch (error) {
    logger.warn('AdminUserService not found, using placeholder', { error: error.message });
    AdminUserService = { router: express.Router() };
}

try {
    UserProfileService = require('./user-profile-service');
} catch (error) {
    logger.warn('UserProfileService not found, using placeholder', { error: error.message });
    UserProfileService = { router: express.Router() };
}

try {
    UserPermissionsService = require('./user-permissions-service');
} catch (error) {
    logger.warn('UserPermissionsService not found, using placeholder', { error: error.message });
    UserPermissionsService = { router: express.Router() };
}

try {
    UserSessionService = require('./user-session-service');
} catch (error) {
    logger.warn('UserSessionService not found, using placeholder', { error: error.message });
    UserSessionService = { router: express.Router() };
}

/**
 * User Management Service Router
 */
class UserManagementServiceRouter {
    constructor() {
        this.router = express.Router();
        this.services = {
            adminUser: AdminUserService,
            userProfile: UserProfileService,
            userPermissions: UserPermissionsService,
            userSession: UserSessionService
        };
        
        this.setupRoutes();
        this.setupHealthChecks();
    }

    setupRoutes() {
        this.router.use('/admin-users', this.createServiceMiddleware('adminUser'), AdminUserService.router || AdminUserService);
        this.router.use('/profiles', this.createServiceMiddleware('userProfile'), UserProfileService.router || UserProfileService);
        this.router.use('/permissions', this.createServiceMiddleware('userPermissions'), UserPermissionsService.router || UserPermissionsService);
        this.router.use('/sessions', this.createServiceMiddleware('userSession'), UserSessionService.router || UserSessionService);

        logger.info('User management service routes configured', {
            services: Object.keys(this.services)
        });
    }

    createServiceMiddleware(serviceName) {
        return (req, res, next) => {
            req.serviceName = serviceName;
            req.serviceModule = 'user-management';
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
                        module: 'user-management',
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

const userManagementRouter = new UserManagementServiceRouter();

module.exports = userManagementRouter.getRouter();
module.exports.UserManagementServiceRouter = UserManagementServiceRouter;
module.exports.services = userManagementRouter.getServices();
module.exports.router = userManagementRouter.getRouter();

module.exports.AdminUserService = AdminUserService;
module.exports.UserProfileService = UserProfileService;
module.exports.UserPermissionsService = UserPermissionsService;
module.exports.UserSessionService = UserSessionService;

logger.info('User Management Services module initialized', {
    services: Object.keys(userManagementRouter.getServices())
});