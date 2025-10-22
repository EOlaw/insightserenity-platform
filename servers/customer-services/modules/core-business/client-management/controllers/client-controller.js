/**
 * @fileoverview Client Self-Service Controller
 * @module servers/customer-services/modules/core-business/client-management/controllers/client-controller
 * @description HTTP request handlers for client self-service operations
 * @note Clients can only access and modify their own data
 */

const ClientService = require('../services/client-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-controller'
});

/**
 * Client Controller
 * @class ClientController
 */
class ClientController {
    constructor() {
        // Bind all methods to ensure 'this' context is preserved when used as route handlers
        this.getClientById = this.getClientById.bind(this);
        this.getClientByCode = this.getClientByCode.bind(this);
        this.updateClient = this.updateClient.bind(this);
        this.getStatistics = this.getStatistics.bind(this);
        this.getClientDashboard = this.getClientDashboard.bind(this);
    }

    /**
     * Verify that the authenticated user owns the requested client resource
     * @private
     */
    _verifyClientOwnership(req, requestedClientId) {
        const authenticatedClientId = req.user?.clientId || req.user?.client?.id || req.user?.client?._id;
        
        if (!authenticatedClientId) {
            logger.error('Client ID not found in authenticated user', {
                userId: req.user?.id,
                userObject: JSON.stringify(req.user)
            });
            throw AppError.unauthorized('Client information not found in your session');
        }

        // Convert both to strings for comparison to handle ObjectId vs String
        const authClientIdStr = String(authenticatedClientId);
        const requestedClientIdStr = String(requestedClientId);

        if (authClientIdStr !== requestedClientIdStr) {
            logger.warn('Unauthorized access attempt', {
                authenticatedClientId: authClientIdStr,
                requestedClientId: requestedClientIdStr,
                userId: req.user?.id
            });
            throw AppError.forbidden('You can only access your own client data');
        }

        return true;
    }

    /**
     * Get authenticated client's own ID
     * @private
     */
    _getAuthenticatedClientId(req) {
        const clientId = req.user?.clientId || req.user?.client?.id || req.user?.client?._id;
        
        if (!clientId) {
            logger.error('Client ID not found in authenticated user', {
                userId: req.user?.id,
                userObject: JSON.stringify(req.user)
            });
            throw AppError.unauthorized('Client information not found in your session');
        }

        return String(clientId);
    }

    /**
     * Get client by ID
     * @route GET /api/v1/clients/:id
     * @note Client can only retrieve their own record
     */
    async getClientById(req, res, next) {
        try {
            const { id } = req.params;
            
            // Verify client can only access their own data
            this._verifyClientOwnership(req, id);

            const options = {
                tenantId: req.user?.tenantId,
                populate: req.query.populate === 'true',
                skipTenantCheck: true // Self-service operation - ownership already verified
            };

            logger.info('Get client by ID request', { 
                clientId: id, 
                userId: req.user?.id 
            });

            const client = await ClientService.getClientById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    client
                }
            });

        } catch (error) {
            logger.error('Get client by ID failed', {
                error: error.message,
                clientId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get client by code
     * @route GET /api/v1/clients/code/:code
     * @note Client can only retrieve their own record
     */
    async getClientByCode(req, res, next) {
        try {
            const { code } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                populate: req.query.populate === 'true',
                skipTenantCheck: true // Self-service operation - will verify ownership after retrieval
            };

            logger.info('Get client by code request', { 
                clientCode: code, 
                userId: req.user?.id 
            });

            const client = await ClientService.getClientByCode(code, options);

            // Verify the retrieved client belongs to the authenticated user
            if (client) {
                const clientId = client.id || client._id;
                this._verifyClientOwnership(req, clientId);
            }

            res.status(200).json({
                success: true,
                data: {
                    client
                }
            });

        } catch (error) {
            logger.error('Get client by code failed', {
                error: error.message,
                clientCode: req.params.code,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Update client
     * @route PUT /api/v1/clients/:id
     * @route PATCH /api/v1/clients/:id
     * @note Client can only update their own record
     */
    async updateClient(req, res, next) {
        try {
            const { id } = req.params;
            
            // Verify client can only update their own data
            this._verifyClientOwnership(req, id);

            const updateData = { ...req.body };

            // Remove fields that clients shouldn't be able to modify
            const restrictedFields = [
                'tenantId', 
                'organizationId', 
                'clientCode', 
                'createdAt', 
                'createdBy',
                'isDeleted',
                'deletedAt',
                'deletedBy',
                'relationship.status',
                'relationship.tier',
                'analytics',
                'billing.outstandingBalance',
                'billing.totalRevenue'
            ];
            
            restrictedFields.forEach(field => {
                const fieldParts = field.split('.');
                if (fieldParts.length === 1) {
                    delete updateData[field];
                } else if (fieldParts.length === 2 && updateData[fieldParts[0]]) {
                    delete updateData[fieldParts[0]][fieldParts[1]];
                }
            });

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                skipTenantCheck: true // Self-service operation - ownership already verified
            };

            logger.info('Update client request', {
                clientId: id,
                updateFields: Object.keys(updateData),
                userId: req.user?.id
            });

            const client = await ClientService.updateClient(id, updateData, options);

            logger.info('Client updated successfully', {
                clientId: id,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Client updated successfully',
                data: {
                    client
                }
            });

        } catch (error) {
            logger.error('Update client failed', {
                error: error.message,
                clientId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get client statistics
     * @route GET /api/v1/clients/statistics
     * @note Returns statistics for the authenticated client only
     */
    async getStatistics(req, res, next) {
        try {
            // Get authenticated client's ID
            const clientId = this._getAuthenticatedClientId(req);

            const filters = {
                clientId: clientId, // Force filter to authenticated client only
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            const options = {
                tenantId: req.user?.tenantId,
                skipTenantCheck: true // Self-service operation - accessing own statistics
            };

            logger.info('Get client statistics request', {
                clientId,
                filters,
                userId: req.user?.id
            });

            const statistics = await ClientService.getClientStatistics(filters, options);

            res.status(200).json({
                success: true,
                data: {
                    statistics
                }
            });

        } catch (error) {
            logger.error('Get client statistics failed', {
                error: error.message,
                userId: req.user?.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get client dashboard data
     * @route GET /api/v1/clients/:id/dashboard
     * @note Returns dashboard data for the authenticated client only
     */
    async getClientDashboard(req, res, next) {
        try {
            const { id } = req.params;
            
            // Verify client can only access their own dashboard
            this._verifyClientOwnership(req, id);

            const options = {
                tenantId: req.user?.tenantId,
                skipTenantCheck: true // Self-service operation - ownership already verified
            };

            logger.info('Get client dashboard request', {
                clientId: id,
                userId: req.user?.id
            });

            const [client, statistics] = await Promise.all([
                ClientService.getClientById(id, options),
                ClientService.getClientStatistics({ clientId: id }, options)
            ]);

            res.status(200).json({
                success: true,
                data: {
                    client,
                    statistics
                }
            });

        } catch (error) {
            logger.error('Get client dashboard failed', {
                error: error.message,
                clientId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }
}

module.exports = new ClientController();