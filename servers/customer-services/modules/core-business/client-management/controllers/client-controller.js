/**
 * @fileoverview Client Management Controller
 * @module servers/customer-services/modules/core-business/client-management/controllers/client-controller
 * @description HTTP request handlers for client operations
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
    /**
     * Create a new client
     * @route POST /api/v1/clients
     */
    async createClient(req, res, next) {
        try {
            logger.info('Create client request received', {
                companyName: req.body.companyName,
                userId: req.user?.id
            });

            const clientData = {
                ...req.body,
                tenantId: req.user?.tenantId || req.body.tenantId,
                organizationId: req.user?.organizationId || req.body.organizationId
            };

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: req.user?.id,
                source: req.body.source || 'web'
            };

            const client = await ClientService.createClient(clientData, options);

            logger.info('Client created successfully', {
                clientId: client.clientCode,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: 'Client created successfully',
                data: {
                    client
                }
            });

        } catch (error) {
            logger.error('Create client failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get client by ID
     * @route GET /api/v1/clients/:id
     */
    async getClientById(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                populate: req.query.populate === 'true'
            };

            logger.info('Get client by ID request', { clientId: id, userId: req.user?.id });

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
                clientId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get client by code
     * @route GET /api/v1/clients/code/:code
     */
    async getClientByCode(req, res, next) {
        try {
            const { code } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                populate: req.query.populate === 'true'
            };

            logger.info('Get client by code request', { clientCode: code, userId: req.user?.id });

            const client = await ClientService.getClientByCode(code, options);

            res.status(200).json({
                success: true,
                data: {
                    client
                }
            });

        } catch (error) {
            logger.error('Get client by code failed', {
                error: error.message,
                clientCode: req.params.code
            });
            next(error);
        }
    }

    /**
     * Update client
     * @route PUT /api/v1/clients/:id
     * @route PATCH /api/v1/clients/:id
     */
    async updateClient(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
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
                clientId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Delete client
     * @route DELETE /api/v1/clients/:id
     */
    async deleteClient(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                softDelete: req.query.soft !== 'false',
                forceDelete: req.query.force === 'true'
            };

            logger.info('Delete client request', {
                clientId: id,
                softDelete: options.softDelete,
                userId: req.user?.id
            });

            const result = await ClientService.deleteClient(id, options);

            logger.info('Client deleted successfully', {
                clientId: id,
                deletionType: result.deletionType,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Client deleted successfully',
                data: result
            });

        } catch (error) {
            logger.error('Delete client failed', {
                error: error.message,
                clientId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Search clients
     * @route GET /api/v1/clients/search
     * @route POST /api/v1/clients/search
     */
    async searchClients(req, res, next) {
        try {
            const filters = req.method === 'POST' ? req.body.filters || {} : {
                status: req.query.status,
                tier: req.query.tier,
                accountManager: req.query.accountManager,
                industry: req.query.industry,
                search: req.query.q || req.query.search,
                revenueMin: req.query.revenueMin ? parseFloat(req.query.revenueMin) : undefined,
                revenueMax: req.query.revenueMax ? parseFloat(req.query.revenueMax) : undefined
            };

            const options = {
                tenantId: req.user?.tenantId,
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 20,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            logger.info('Search clients request', {
                filters,
                page: options.page,
                userId: req.user?.id
            });

            const result = await ClientService.searchClients(filters, options);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Search clients failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get client statistics
     * @route GET /api/v1/clients/statistics
     */
    async getStatistics(req, res, next) {
        try {
            const filters = {
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            const options = {
                tenantId: req.user?.tenantId
            };

            logger.info('Get client statistics request', {
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
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Bulk create clients
     * @route POST /api/v1/clients/bulk
     */
    async bulkCreateClients(req, res, next) {
        try {
            const { clients } = req.body;

            if (!Array.isArray(clients) || clients.length === 0) {
                throw AppError.validation('Invalid bulk client data');
            }

            logger.info('Bulk create clients request', {
                count: clients.length,
                userId: req.user?.id
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: req.user?.id,
                source: 'bulk_import'
            };

            const results = {
                success: [],
                failed: []
            };

            for (const clientData of clients) {
                try {
                    const client = await ClientService.createClient(clientData, options);
                    results.success.push({
                        clientCode: client.clientCode,
                        companyName: client.companyName
                    });
                } catch (error) {
                    results.failed.push({
                        companyName: clientData.companyName,
                        error: error.message
                    });
                }
            }

            logger.info('Bulk create clients completed', {
                successCount: results.success.length,
                failedCount: results.failed.length,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: `Bulk client creation completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
                data: results
            });

        } catch (error) {
            logger.error('Bulk create clients failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Export clients
     * @route GET /api/v1/clients/export
     */
    async exportClients(req, res, next) {
        try {
            const filters = {
                status: req.query.status,
                tier: req.query.tier,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            const options = {
                tenantId: req.user?.tenantId,
                format: req.query.format || 'json'
            };

            logger.info('Export clients request', {
                filters,
                format: options.format,
                userId: req.user?.id
            });

            const result = await ClientService.searchClients(filters, {
                tenantId: options.tenantId,
                limit: 10000 // Large limit for export
            });

            if (options.format === 'csv') {
                // Set CSV headers
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=clients-export.csv');
                
                // Simple CSV conversion
                const csv = this._convertToCSV(result.clients);
                res.status(200).send(csv);
            } else {
                // JSON export
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', 'attachment; filename=clients-export.json');
                res.status(200).json({
                    success: true,
                    exportDate: new Date().toISOString(),
                    data: result
                });
            }

        } catch (error) {
            logger.error('Export clients failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get client dashboard data
     * @route GET /api/v1/clients/:id/dashboard
     */
    async getClientDashboard(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId
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
                clientId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Convert clients array to CSV
     * @private
     */
    _convertToCSV(clients) {
        if (!clients || clients.length === 0) return '';

        const headers = ['Client Code', 'Company Name', 'Status', 'Tier', 'Email', 'Phone', 'Revenue', 'Created Date'];
        const rows = clients.map(client => [
            client.clientCode || '',
            client.companyName || '',
            client.relationship?.status || '',
            client.relationship?.tier || '',
            client.contact?.primaryEmail || '',
            client.contact?.primaryPhone || '',
            client.analytics?.lifetime?.totalRevenue || 0,
            client.createdAt ? new Date(client.createdAt).toISOString() : ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(field => `"${field}"`).join(','))
        ].join('\n');

        return csvContent;
    }
}

module.exports = new ClientController();