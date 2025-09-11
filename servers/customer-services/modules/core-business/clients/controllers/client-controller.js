'use strict';

/**
 * @fileoverview Main client controller for comprehensive client lifecycle management
 * @module servers/customer-services/modules/core-business/clients/controllers/client-controller
 */

const ClientService = require('../services/client-service');
const ClientAnalyticsService = require('../services/client-analytics-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const { ResponseFormatter } = require('../../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const PaginationHelper = require('../../../../../../shared/lib/utils/helpers/pagination-helper');
const { STATUS_CODES } = require('../../../../../../shared/lib/utils/constants/status-codes');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');

/**
 * Controller class for client management operations
 * @class ClientController
 */
class ClientController {
    /**
     * Private fields
     */
    #clientService;
    #analyticsService;
    #responseFormatter;
    #validationConfig;
    #securityConfig;
    #cacheConfig;
    #bulkConfig;
    #exportConfig;
    #searchConfig;
    #paginationConfig;
    #rateLimitConfig;
    #auditConfig;

    /**
     * Constructor
     */
    constructor() {
        this.#clientService = new ClientService();
        this.#analyticsService = new ClientAnalyticsService();
        this.#responseFormatter = new ResponseFormatter();
        this.#initializeConfigurations();

        // Bind all methods to preserve context
        this.createClient = this.createClient.bind(this);
        this.getClientById = this.getClientById.bind(this);
        this.updateClient = this.updateClient.bind(this);
        this.deleteClient = this.deleteClient.bind(this);
        this.searchClients = this.searchClients.bind(this);
        this.getClientsByFilter = this.getClientsByFilter.bind(this);
        this.bulkCreateClients = this.bulkCreateClients.bind(this);
        this.bulkUpdateClients = this.bulkUpdateClients.bind(this);
        this.bulkDeleteClients = this.bulkDeleteClients.bind(this);
        this.exportClients = this.exportClients.bind(this);
        this.importClients = this.importClients.bind(this);
        this.getClientStatistics = this.getClientStatistics.bind(this);
        this.calculateHealthScores = this.calculateHealthScores.bind(this);
        this.archiveClient = this.archiveClient.bind(this);
        this.unarchiveClient = this.unarchiveClient.bind(this);
        this.mergeClients = this.mergeClients.bind(this);
        this.duplicateClient = this.duplicateClient.bind(this);
        this.transferClientOwnership = this.transferClientOwnership.bind(this);
        this.updateClientTier = this.updateClientTier.bind(this);
        this.updateClientStatus = this.updateClientStatus.bind(this);
        this.getClientTimeline = this.getClientTimeline.bind(this);
        this.getClientRelationships = this.getClientRelationships.bind(this);
        this.getClientMetrics = this.getClientMetrics.bind(this);
        this.validateClientData = this.validateClientData.bind(this);
        this.getClientSummary = this.getClientSummary.bind(this);
        this.getClientDashboard = this.getClientDashboard.bind(this);
        this.syncClientData = this.syncClientData.bind(this);
        this.auditClient = this.auditClient.bind(this);
        this.generateClientReport = this.generateClientReport.bind(this);

        logger.info('ClientController initialized');
    }

    /**
     * Create a new client
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    static async createClient(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Creating new client - Controller');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Extract tenant context
            const tenantId = req.tenant?.id || req.body.tenantId;
            const userId = req.user?.id || req.user?.adminId;

            if (!tenantId) {
                throw new ValidationError('Tenant context is required', 'TENANT_REQUIRED');
            }

            // Sanitize and prepare client data
            const clientData = {
                ...req.body,
                tenantId,
                organizationId: req.organization?.id,
                metadata: {
                    source: req.body.source || 'manual',
                    importedBy: userId,
                    importedAt: new Date(),
                    ...req.body.metadata
                }
            };

            // Validate business rules
            await this.#validateBusinessRules(clientData, 'create');

            // Check permissions
            // await this.#checkPermission(req, 'clients.create');

            // Create client with options
            const options = {
                source: req.body.source || 'manual',
                skipNotifications: req.body.skipNotifications === true,
                validateDuplicates: req.body.validateDuplicates !== false
            };

            const client = await this.#clientService.createClient(clientData, userId, options);

            // Log audit trail
            await this.#logControllerAction('CLIENT_CREATED', {
                clientId: client._id,
                clientCode: client.clientCode,
                userId,
                tenantId
            });

            // Update client metrics if requested
            if (req.body.updateMetrics) {
                await this.#analyticsService.updateClientMetrics(client._id);
            }

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendClientNotification('created', client, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatClientResponse(client),
                'Client created successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Get client by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientById(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;
            const tenantId = req.tenant?.id;

            logger.info(`Fetching client: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Parse options from query
            const options = {
                populate: req.query.populate ? req.query.populate.split(',') : [],
                includeDeleted: req.query.includeDeleted === 'true',
                includeArchived: req.query.includeArchived === 'true',
                checkPermissions: req.query.checkPermissions !== 'false',
                userId,
                tenantId
            };

            // Check permissions
            await this.#checkPermission(req, 'clients.read');

            // Get client
            const client = await this.#clientService.getClientById(clientId, options);

            if (!client) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Check client-level permissions
            await this.#checkClientAccess(client, req.user, 'read');

            // Add analytics data if requested
            let analyticsData = null;
            if (req.query.includeAnalytics === 'true') {
                analyticsData = await this.#analyticsService.getClientAnalytics(clientId, {
                    dateRange: this.#parseDateRange(req.query),
                    metrics: req.query.metrics ? req.query.metrics.split(',') : ['all']
                });
            }

            // Log access
            await this.#logControllerAction('CLIENT_ACCESSED', {
                clientId,
                userId,
                options
            });

            // Format response
            const responseData = {
                ...this.#formatClientResponse(client),
                ...(analyticsData && { analytics: analyticsData })
            };

            const response = this.#responseFormatter.formatSuccess(
                responseData,
                'Client retrieved successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.clientTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update client
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object  
     * @param {Function} next - Express next middleware
     */
    async updateClient(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating client: ${clientId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.update');

            // Prepare update data
            const updateData = {
                ...req.body,
                metadata: {
                    ...req.body.metadata,
                    lastModifiedBy: userId,
                    lastModifiedAt: new Date()
                }
            };

            // Validate business rules
            await this.#validateBusinessRules(updateData, 'update');

            // Update options
            const options = {
                tenantId: req.tenant?.id,
                validateDuplicates: req.body.validateDuplicates !== false,
                skipNotifications: req.body.skipNotifications === true,
                reason: req.body.reason
            };

            // Update client
            const updatedClient = await this.#clientService.updateClient(
                clientId,
                updateData,
                userId,
                options
            );

            // Check client access post-update
            await this.#checkClientAccess(updatedClient, req.user, 'update');

            // Log audit trail
            await this.#logControllerAction('CLIENT_UPDATED', {
                clientId,
                userId,
                updatedFields: Object.keys(updateData)
            });

            // Update health score if significant changes
            if (this.#shouldRecalculateHealth(updateData)) {
                await this.#analyticsService.calculateHealthScores(clientId, { recalculate: true });
            }

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendClientNotification('updated', updatedClient, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatClientResponse(updatedClient),
                'Client updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Delete client
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async deleteClient(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Deleting client: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.delete');

            // Parse deletion options
            const options = {
                hardDelete: req.body.hardDelete === true,
                reason: req.body.reason,
                skipNotifications: req.body.skipNotifications === true,
                force: req.body.force === true
            };

            // Additional validation for hard delete
            if (options.hardDelete) {
                await this.#checkPermission(req, 'clients.hardDelete');
                if (!options.reason) {
                    throw new ValidationError('Reason is required for hard delete', 'REASON_REQUIRED');
                }
            }

            // Delete client
            const result = await this.#clientService.deleteClient(clientId, userId, options);

            // Log audit trail
            await this.#logControllerAction('CLIENT_DELETED', {
                clientId,
                userId,
                hardDelete: options.hardDelete,
                reason: options.reason
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendClientNotification('deleted', { _id: clientId }, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                { deleted: true, hardDelete: options.hardDelete },
                `Client ${options.hardDelete ? 'permanently deleted' : 'deleted'} successfully`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Search clients with advanced filtering
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async searchClients(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Searching clients');

            // Check permissions
            // await this.#checkPermission(req, 'clients.read');

            // Parse search criteria
            const searchCriteria = this.#parseSearchCriteria(req.query);

            // Parse options
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: Math.min(parseInt(req.query.limit) || 20, this.#paginationConfig.maxLimit),
                sort: this.#parseSortOptions(req.query.sort),
                populate: req.query.populate ? req.query.populate.split(',') : [],
                includeArchived: req.query.includeArchived === 'true',
                tenantId: req.tenant?.id,
                userId: req.user?.id || req.user?.adminId
            };

            // Apply tenant filtering
            if (options.tenantId) {
                searchCriteria.tenantId = options.tenantId;
            }

            // Execute search
            const searchResults = await this.#clientService.searchClients(searchCriteria, options);

            // Filter results based on permissions
            const filteredClients = await this.#filterClientsByPermissions(
                searchResults.clients,
                req.user
            );

            // Add analytics summary if requested
            let analyticsSummary = null;
            if (req.query.includeAnalytics === 'true') {
                analyticsSummary = await this.#analyticsService.getAggregatedAnalytics(
                    searchCriteria,
                    { tenantId: options.tenantId }
                );
            }

            // Log search
            await this.#logControllerAction('CLIENTS_SEARCHED', {
                criteria: searchCriteria,
                resultCount: filteredClients.length,
                userId: options.userId
            });

            // Format response with pagination
            const response = this.#responseFormatter.formatPaginatedSuccess(
                filteredClients.map(client => this.#formatClientResponse(client)),
                {
                    ...searchResults.pagination,
                    total: filteredClients.length
                },
                'Clients retrieved successfully',
                {
                    searchCriteria,
                    ...(analyticsSummary && { analytics: analyticsSummary })
                }
            );

            // Set cache headers for search results
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.searchTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Get clients by filter
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientsByFilter(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Filtering clients');

            // Check permissions
            await this.#checkPermission(req, 'clients.read');

            // Parse filters
            const filters = this.#parseFilterCriteria(req.query);

            // Parse options
            const options = {
                limit: Math.min(parseInt(req.query.limit) || 100, this.#paginationConfig.maxLimit),
                sort: this.#parseSortOptions(req.query.sort),
                tenantId: req.tenant?.id,
                includeMetrics: req.query.includeMetrics === 'true'
            };

            // Get filtered clients
            const clients = await this.#clientService.getClientsByFilter(filters, options);

            // Filter by permissions
            const authorizedClients = await this.#filterClientsByPermissions(clients, req.user);

            // Add metrics if requested
            if (options.includeMetrics) {
                for (const client of authorizedClients) {
                    client.metrics = await this.#analyticsService.getClientMetrics(client._id);
                }
            }

            // Log filter operation
            await this.#logControllerAction('CLIENTS_FILTERED', {
                filters,
                resultCount: authorizedClients.length,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                authorizedClients.map(client => this.#formatClientResponse(client)),
                'Filtered clients retrieved successfully',
                STATUS_CODES.OK,
                { filters, total: authorizedClients.length }
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Bulk create clients
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkCreateClients(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Bulk creating clients');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.bulkCreate');

            const { clients: clientsData } = req.body;
            const userId = req.user?.id || req.user?.adminId;
            const tenantId = req.tenant?.id;

            // Validate bulk size
            if (!Array.isArray(clientsData)) {
                throw new ValidationError('Clients data must be an array', 'INVALID_BULK_DATA');
            }

            if (clientsData.length > this.#bulkConfig.maxOperationSize) {
                throw new ValidationError(
                    `Bulk operation exceeds maximum size of ${this.#bulkConfig.maxOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Prepare options
            const options = {
                validateAll: req.body.validateAll !== false,
                stopOnError: req.body.stopOnError === true,
                tenantId,
                skipNotifications: req.body.skipNotifications === true
            };

            // Add tenant context to each client
            const enrichedClientsData = clientsData.map(clientData => ({
                ...clientData,
                tenantId,
                organizationId: req.organization?.id
            }));

            // Execute bulk creation
            const results = await this.#clientService.bulkCreateClients(
                enrichedClientsData,
                userId,
                options
            );

            // Log bulk operation
            await this.#logControllerAction('BULK_CLIENTS_CREATED', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            // Send notifications for successful creations
            if (!options.skipNotifications && results.successful.length > 0) {
                await this.#sendBulkNotification('created', results.successful, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Bulk operation completed: ${results.successful.length} created, ${results.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Export clients
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async exportClients(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Exporting clients');

            // Check permissions
            await this.#checkPermission(req, 'clients.export');

            // Parse export parameters
            const filters = this.#parseFilterCriteria(req.query);
            const format = req.query.format || 'csv';
            const fields = req.query.fields ? req.query.fields.split(',') : [];

            // Validate format
            if (!this.#exportConfig.supportedFormats.includes(format.toLowerCase())) {
                throw new ValidationError(
                    `Unsupported export format. Supported formats: ${this.#exportConfig.supportedFormats.join(', ')}`,
                    'INVALID_FORMAT'
                );
            }

            // Prepare export options
            const options = {
                fields,
                tenantId: req.tenant?.id,
                userId: req.user?.id || req.user?.adminId,
                includeArchived: req.query.includeArchived === 'true',
                maxRecords: this.#exportConfig.maxRecords
            };

            // Export data
            const exportBuffer = await this.#clientService.exportClients(filters, format, options);

            // Log export
            await this.#logControllerAction('CLIENTS_EXPORTED', {
                format,
                filters,
                userId: options.userId
            });

            // Set response headers
            const fileName = `clients_export_${Date.now()}.${format}`;
            const contentType = this.#getContentType(format);

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Length', exportBuffer.length);

            res.status(STATUS_CODES.OK).send(exportBuffer);
        })(req, res, next);
    }

    /**
     * Import clients
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async importClients(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Importing clients');

            // Check permissions
            await this.#checkPermission(req, 'clients.import');

            if (!req.file) {
                throw new ValidationError('Import file is required', 'FILE_REQUIRED');
            }

            const userId = req.user?.id || req.user?.adminId;
            const format = req.body.format || this.#detectFileFormat(req.file.originalname);

            // Validate file format
            if (!this.#exportConfig.supportedFormats.includes(format.toLowerCase())) {
                throw new ValidationError('Unsupported file format', 'INVALID_FILE_FORMAT');
            }

            // Validate file size
            if (req.file.size > this.#exportConfig.maxFileSize) {
                throw new ValidationError(
                    'File size exceeds maximum allowed size',
                    'FILE_TOO_LARGE'
                );
            }

            // Prepare import options
            const options = {
                validateAll: req.body.validateAll !== false,
                tenantId: req.tenant?.id,
                mapping: req.body.mapping ? JSON.parse(req.body.mapping) : {},
                skipDuplicates: req.body.skipDuplicates === true,
                updateExisting: req.body.updateExisting === true
            };

            // Import clients
            const results = await this.#clientService.importClients(
                req.file.buffer,
                format,
                userId,
                options
            );

            // Log import
            await this.#logControllerAction('CLIENTS_IMPORTED', {
                format,
                fileName: req.file.originalname,
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Import completed: ${results.successful.length} imported, ${results.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Get client statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientStatistics(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Fetching client statistics');

            // Check permissions
            await this.#checkPermission(req, 'clients.analytics');

            // Parse filters and options
            const filters = this.#parseFilterCriteria(req.query);
            const options = {
                tenantId: req.tenant?.id,
                dateRange: this.#parseDateRange(req.query),
                includeAnalytics: req.query.includeAnalytics !== 'false',
                includePredictions: req.query.includePredictions === 'true'
            };

            // Get statistics
            const statistics = await this.#clientService.getClientStatistics(filters, options);

            // Log statistics access
            await this.#logControllerAction('CLIENT_STATISTICS_ACCESSED', {
                filters,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                statistics,
                'Client statistics retrieved successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.statisticsTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Calculate health scores
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async calculateHealthScores(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            logger.info(`Calculating health scores${clientId ? ` for client: ${clientId}` : ''}`);

            // Check permissions
            await this.#checkPermission(req, 'clients.analytics');

            // Validate client ID if provided
            if (clientId && !CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Parse options
            const options = {
                tenantId: req.tenant?.id,
                recalculate: req.body.recalculate === true,
                batchSize: parseInt(req.body.batchSize) || 50
            };

            // Calculate health scores
            const results = await this.#clientService.calculateHealthScores(clientId, options);

            // Log calculation
            await this.#logControllerAction('HEALTH_SCORES_CALCULATED', {
                clientId,
                calculated: results.calculated,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Health scores calculated for ${results.calculated} clients`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Transfer client ownership
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async transferClientOwnership(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { newOwnerId, reason } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Transferring ownership for client: ${clientId}`);

            // Validate inputs
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            if (!CommonValidator.isValidObjectId(newOwnerId)) {
                throw new ValidationError('Invalid new owner ID format', 'INVALID_OWNER_ID');
            }

            if (!reason) {
                throw new ValidationError('Reason for transfer is required', 'REASON_REQUIRED');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.transferOwnership');

            // Transfer ownership
            const result = await this.#clientService.updateClient(
                clientId,
                {
                    'relationship.accountManager': newOwnerId,
                    'relationship.ownershipHistory': {
                        $push: {
                            previousOwner: req.user?.id,
                            newOwner: newOwnerId,
                            transferDate: new Date(),
                            reason,
                            transferredBy: userId
                        }
                    }
                },
                userId
            );

            // Log ownership transfer
            await this.#logControllerAction('CLIENT_OWNERSHIP_TRANSFERRED', {
                clientId,
                fromUserId: req.user?.id,
                toUserId: newOwnerId,
                reason,
                transferredBy: userId
            });

            // Send notifications
            await this.#sendOwnershipTransferNotifications(result, req.user?.id, newOwnerId, reason);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                { transferred: true, newOwner: newOwnerId },
                'Client ownership transferred successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Private helper methods
     */

    #initializeConfigurations() {
        this.#validationConfig = {
            requiredFields: ['companyName', 'addresses.headquarters.country'],
            maxNameLength: 255,
            maxDescriptionLength: 2000,
            allowedStatuses: ['prospect', 'active', 'inactive', 'churned'],
            allowedTiers: ['startup', 'small_business', 'mid_market', 'enterprise', 'strategic']
        };

        this.#securityConfig = {
            requireMFA: false,
            auditSensitiveFields: ['billing', 'financials', 'contracts'],
            encryptFields: ['taxId', 'bankingDetails']
        };

        this.#cacheConfig = {
            clientTTL: 3600, // 1 hour
            searchTTL: 1800, // 30 minutes
            statisticsTTL: 900 // 15 minutes
        };

        this.#bulkConfig = {
            maxOperationSize: 1000,
            batchSize: 100,
            maxConcurrency: 5
        };

        this.#exportConfig = {
            supportedFormats: ['csv', 'excel', 'json'],
            maxRecords: 50000,
            maxFileSize: 100 * 1024 * 1024 // 100MB
        };

        this.#searchConfig = {
            maxResults: 1000,
            defaultFields: ['companyName', 'legalName', 'clientCode'],
            searchableFields: ['companyName', 'legalName', 'clientCode', 'industry', 'contacts']
        };

        this.#paginationConfig = {
            defaultLimit: 20,
            maxLimit: 200,
            defaultSort: { createdAt: -1 }
        };

        this.#rateLimitConfig = {
            create: { windowMs: 900000, max: 50 }, // 50 creates per 15 minutes
            search: { windowMs: 60000, max: 100 }, // 100 searches per minute
            export: { windowMs: 3600000, max: 10 } // 10 exports per hour
        };

        this.#auditConfig = {
            enabled: true,
            sensitiveActions: ['create', 'update', 'delete', 'export', 'transfer'],
            retentionDays: 2555
        };
    }

    /**
     * Validates business rules for client data
     * @private
     * @param {Object} clientData - Client data to validate
     * @param {string} operation - Operation type ('create' or 'update')
     * @returns {Promise<boolean>}
     */
    async #validateBusinessRules(clientData, operation) {
        const errors = [];

        // Validate required fields
        for (const field of this.#validationConfig.requiredFields) {
            if (!this.#getNestedValue(clientData, field)) {
                errors.push(`${field} is required`);
            }
        }

        // Validate field lengths
        if (clientData.companyName?.length > this.#validationConfig.maxNameLength) {
            errors.push(`Company name exceeds maximum length of ${this.#validationConfig.maxNameLength}`);
        }

        if (clientData.description?.length > this.#validationConfig.maxDescriptionLength) {
            errors.push(`Description exceeds maximum length of ${this.#validationConfig.maxDescriptionLength}`);
        }

        // Validate enum values
        if (clientData.relationship?.status &&
            !this.#validationConfig.allowedStatuses.includes(clientData.relationship.status)) {
            errors.push(`Invalid status. Allowed values: ${this.#validationConfig.allowedStatuses.join(', ')}`);
        }

        if (clientData.relationship?.tier &&
            !this.#validationConfig.allowedTiers.includes(clientData.relationship.tier)) {
            errors.push(`Invalid tier. Allowed values: ${this.#validationConfig.allowedTiers.join(', ')}`);
        }

        // Validate email formats in contacts
        if (clientData.contacts && Array.isArray(clientData.contacts)) {
            clientData.contacts.forEach((contact, index) => {
                if (contact.email && !validator.isEmail(contact.email)) {
                    errors.push(`Invalid email format for contact ${index + 1}: ${contact.email}`);
                }
            });
        }

        // Validate tax ID format if provided
        if (clientData.taxId && !this.#validateTaxId(clientData.taxId, clientData.addresses?.headquarters?.country)) {
            errors.push('Invalid tax ID format for the specified country');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'BUSINESS_RULE_VALIDATION');
        }

        return true;
    }

    /**
     * Checks if user has required permission
     * @private
     * @param {Object} req - Express request object
     * @param {string} permission - Permission to check
     * @returns {Promise<boolean>}
     */
    async #checkPermission(req, permission) {
        const user = req.user;

        if (!user) {
            throw new ForbiddenError('Authentication required', 'AUTH_REQUIRED');
        }

        // Super admin has all permissions
        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return true;
        }

        // Check role-based permissions
        const hasRolePermission = user.role === 'admin' ||
            user.permissions?.includes(permission) ||
            user.roles?.some(role => role.permissions?.includes(permission));

        // Check tenant-level permissions
        const hasTenantPermission = user.tenantPermissions?.includes(permission) ||
            user.organizationPermissions?.includes(permission);

        if (!hasRolePermission && !hasTenantPermission) {
            throw new ForbiddenError(`Insufficient permissions: ${permission}`, 'PERMISSION_DENIED');
        }

        return true;
    }

    /**
     * Checks if user has access to specific client
     * @private
     * @param {Object} client - Client object
     * @param {Object} user - User object
     * @param {string} action - Action being performed
     * @returns {Promise<boolean>}
     */
    async #checkClientAccess(client, user, action) {
        // Super admin has access to all clients
        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return true;
        }

        // Check tenant access
        if (client.tenantId?.toString() !== user.tenantId?.toString() &&
            client.organizationId?.toString() !== user.organizationId?.toString()) {
            throw new ForbiddenError('Access denied: Client belongs to different organization', 'CLIENT_ACCESS_DENIED');
        }

        // Check if user is account manager
        const isAccountManager = client.relationship?.accountManager?.toString() === user.id?.toString();

        // Check team access
        const isTeamMember = client.relationship?.team?.some(member =>
            member.userId?.toString() === user.id?.toString()
        );

        // Admin users have access to all clients in their tenant
        if (user.role === 'admin') {
            return true;
        }

        // Check action-specific permissions
        switch (action) {
            case 'read':
                return isAccountManager || isTeamMember || user.permissions?.includes('clients.read_all');
            case 'update':
                return isAccountManager || user.permissions?.includes('clients.update_all');
            case 'delete':
                return isAccountManager || user.permissions?.includes('clients.delete_all');
            default:
                return isAccountManager;
        }
    }

    /**
     * Parses search criteria from query parameters
     * @private
     * @param {Object} query - Query parameters
     * @returns {Object} Search criteria object
     */
    #parseSearchCriteria(query) {
        const criteria = {};

        // Text search
        if (query.search) {
            criteria.$or = [
                { companyName: { $regex: query.search, $options: 'i' } },
                { legalName: { $regex: query.search, $options: 'i' } },
                { clientCode: { $regex: query.search, $options: 'i' } },
                { 'contacts.firstName': { $regex: query.search, $options: 'i' } },
                { 'contacts.lastName': { $regex: query.search, $options: 'i' } },
                { 'contacts.email': { $regex: query.search, $options: 'i' } }
            ];
        }

        // Status filter
        if (query.status) {
            criteria['relationship.status'] = Array.isArray(query.status) ?
                { $in: query.status } : query.status;
        }

        // Tier filter
        if (query.tier) {
            criteria['relationship.tier'] = Array.isArray(query.tier) ?
                { $in: query.tier } : query.tier;
        }

        // Industry filter
        if (query.industry) {
            criteria.industry = Array.isArray(query.industry) ?
                { $in: query.industry } : query.industry;
        }

        // Country filter
        if (query.country) {
            criteria['addresses.headquarters.country'] = query.country;
        }

        // Account manager filter
        if (query.accountManager) {
            criteria['relationship.accountManager'] = query.accountManager;
        }

        // Date filters
        if (query.createdAfter || query.createdBefore) {
            criteria.createdAt = {};
            if (query.createdAfter) criteria.createdAt.$gte = new Date(query.createdAfter);
            if (query.createdBefore) criteria.createdAt.$lte = new Date(query.createdBefore);
        }

        // Tags filter
        if (query.tags) {
            const tags = Array.isArray(query.tags) ? query.tags : query.tags.split(',');
            criteria.tags = { $in: tags };
        }

        // Revenue range filter
        if (query.minRevenue || query.maxRevenue) {
            criteria['billing.annualRevenue'] = {};
            if (query.minRevenue) criteria['billing.annualRevenue'].$gte = parseFloat(query.minRevenue);
            if (query.maxRevenue) criteria['billing.annualRevenue'].$lte = parseFloat(query.maxRevenue);
        }

        // Health score filter
        if (query.healthScore) {
            criteria['analytics.healthScore'] = parseInt(query.healthScore);
        }

        // Churn risk filter
        if (query.churnRisk) {
            criteria['analytics.churnRisk'] = query.churnRisk;
        }

        return criteria;
    }

    /**
     * Parses filter criteria from query parameters
     * @private
     * @param {Object} query - Query parameters
     * @returns {Object} Filter criteria object
     */
    #parseFilterCriteria(query) {
        const filters = {};

        if (query.status) filters['relationship.status'] = query.status;
        if (query.tier) filters['relationship.tier'] = query.tier;
        if (query.accountManager) filters['relationship.accountManager'] = query.accountManager;
        if (query.industry) filters.industry = query.industry;
        if (query.country) filters['addresses.headquarters.country'] = query.country;

        if (query.minRevenue) filters['billing.annualRevenue'] = { ...filters['billing.annualRevenue'], $gte: parseFloat(query.minRevenue) };
        if (query.maxRevenue) filters['billing.annualRevenue'] = { ...filters['billing.annualRevenue'], $lte: parseFloat(query.maxRevenue) };

        if (query.churnRisk) filters['analytics.churnRisk'] = query.churnRisk;
        if (query.healthScore) {
            const score = parseInt(query.healthScore);
            if (query.healthScoreOperator === 'gte') {
                filters['analytics.healthScore'] = { $gte: score };
            } else if (query.healthScoreOperator === 'lte') {
                filters['analytics.healthScore'] = { $lte: score };
            } else {
                filters['analytics.healthScore'] = score;
            }
        }

        if (query.isArchived !== undefined) {
            filters['lifecycle.isArchived'] = query.isArchived === 'true';
        }

        return filters;
    }

    /**
     * Parses sort options from query parameter
     * @private
     * @param {string} sortParam - Sort parameter string
     * @returns {Object} Sort object
     */
    #parseSortOptions(sortParam) {
        if (!sortParam) return this.#paginationConfig.defaultSort;

        const sortFields = {};
        const fields = sortParam.split(',');

        for (const field of fields) {
            if (field.startsWith('-')) {
                sortFields[field.substring(1)] = -1;
            } else {
                sortFields[field] = 1;
            }
        }

        return sortFields;
    }

    /**
     * Parses date range from query parameters
     * @private
     * @param {Object} query - Query parameters
     * @returns {Object} Date range object
     */
    #parseDateRange(query) {
        const defaultStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
        const defaultEnd = new Date();

        return {
            start: query.dateFrom ? new Date(query.dateFrom) : defaultStart,
            end: query.dateTo ? new Date(query.dateTo) : defaultEnd
        };
    }

    /**
     * Filters clients based on user permissions
     * @private
     * @param {Array} clients - Array of client objects
     * @param {Object} user - User object
     * @returns {Promise<Array>} Filtered clients array
     */
    async #filterClientsByPermissions(clients, user) {
        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return clients;
        }

        return clients.filter(client => {
            // Check tenant access
            const hasTenantAccess = client.tenantId?.toString() === user.tenantId?.toString() ||
                client.organizationId?.toString() === user.organizationId?.toString();

            if (!hasTenantAccess) return false;

            // Admin users see all clients in their tenant
            if (user.role === 'admin') return true;

            // Check if user is account manager or team member
            const isAccountManager = client.relationship?.accountManager?.toString() === user.id?.toString();
            const isTeamMember = client.relationship?.team?.some(member =>
                member.userId?.toString() === user.id?.toString()
            );

            // Check read-all permission
            const hasReadAllPermission = user.permissions?.includes('clients.read_all');

            return isAccountManager || isTeamMember || hasReadAllPermission;
        });
    }

    /**
     * Formats client response for API output
     * @private
     * @param {Object} client - Client object
     * @returns {Object} Formatted client response
     */
    #formatClientResponse(client) {
        if (!client) return null;

        return {
            id: client._id,
            clientCode: client.clientCode,
            companyName: client.companyName,
            legalName: client.legalName,
            description: client.description,
            industry: client.industry,
            website: client.website,
            taxId: client.taxId,

            // Address information
            addresses: client.addresses,

            // Contact information
            contacts: client.contacts?.map(contact => ({
                id: contact._id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone,
                position: contact.position,
                isPrimary: contact.isPrimary,
                isActive: contact.isActive
            })),

            // Relationship data
            relationship: {
                status: client.relationship?.status,
                tier: client.relationship?.tier,
                accountManager: client.relationship?.accountManager,
                team: client.relationship?.team,
                startDate: client.relationship?.startDate,
                renewalDate: client.relationship?.renewalDate
            },

            // Billing information
            billing: client.billing ? {
                currency: client.billing.currency,
                paymentTerms: client.billing.paymentTerms,
                annualRevenue: client.billing.annualRevenue,
                paymentMethod: client.billing.paymentMethod,
                billingAddress: client.billing.billingAddress
            } : null,

            // Lifecycle information
            lifecycle: {
                stage: client.lifecycle?.stage,
                isArchived: client.lifecycle?.isArchived,
                archivedAt: client.lifecycle?.archivedAt
            },

            // Analytics data
            analytics: client.analytics ? {
                healthScore: client.analytics.healthScore,
                churnRisk: client.analytics.churnRisk,
                engagementScore: client.analytics.engagementScore,
                lastActivity: client.analytics.lastActivity
            } : null,

            // Tags and metadata
            tags: client.tags,
            metadata: client.metadata,

            // Timestamps
            createdAt: client.createdAt,
            updatedAt: client.updatedAt,
            createdBy: client.createdBy,
            lastModifiedBy: client.lastModifiedBy
        };
    }

    /**
     * Gets content type for file format
     * @private
     * @param {string} format - File format
     * @returns {string} Content type
     */
    #getContentType(format) {
        const contentTypes = {
            csv: 'text/csv',
            excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            json: 'application/json',
            pdf: 'application/pdf',
            xml: 'application/xml'
        };
        return contentTypes[format.toLowerCase()] || 'application/octet-stream';
    }

    /**
     * Detects file format from filename
     * @private
     * @param {string} filename - File name
     * @returns {string} Detected format
     */
    #detectFileFormat(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const formatMap = {
            csv: 'csv',
            xlsx: 'excel',
            xls: 'excel',
            json: 'json',
            xml: 'xml'
        };
        return formatMap[ext] || 'csv';
    }

    /**
     * Gets nested value from object using dot notation
     * @private
     * @param {Object} obj - Object to traverse
     * @param {string} path - Dot notation path
     * @returns {*} Value at path or undefined
     */
    #getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, key) => {
            return current && typeof current === 'object' ? current[key] : undefined;
        }, obj);
    }

    /**
     * Determines if health score should be recalculated
     * @private
     * @param {Object} updateData - Data being updated
     * @returns {boolean} Whether to recalculate health
     */
    #shouldRecalculateHealth(updateData) {
        const healthImpactingFields = [
            'relationship.status',
            'relationship.tier',
            'billing.paymentPerformance',
            'billing.annualRevenue',
            'analytics',
            'lifecycle.stage',
            'contacts'
        ];

        return healthImpactingFields.some(field => {
            if (updateData.hasOwnProperty(field)) return true;
            return this.#getNestedValue(updateData, field) !== undefined;
        });
    }

    /**
     * Logs controller actions for audit trail
     * @private
     * @param {string} action - Action being performed
     * @param {Object} data - Action data
     * @returns {Promise<void>}
     */
    async #logControllerAction(action, data) {
        try {
            const logEntry = {
                category: 'CLIENT_CONTROLLER',
                action,
                timestamp: new Date(),
                data: {
                    ...data,
                    ip: data.req?.ip,
                    userAgent: data.req?.get?.('user-agent')
                }
            };

            // Log to application logger
            logger.audit(logEntry);

            // Log to audit service if enabled
            if (this.#auditConfig.enabled && this.#auditConfig.sensitiveActions.includes(action.toLowerCase())) {
                // Audit service logging implementation would go here
                // await this.#auditService.logEvent(logEntry);
            }
        } catch (error) {
            logger.error('Error logging controller action:', { action, error: error.message });
        }
    }

    /**
     * Sends client notification
     * @private
     * @param {string} eventType - Type of event
     * @param {Object} client - Client object
     * @param {Object} user - User object
     * @returns {Promise<void>}
     */
    async #sendClientNotification(eventType, client, user) {
        try {
            const notificationData = {
                eventType,
                clientId: client._id,
                clientName: client.companyName,
                triggeredBy: user?.id,
                timestamp: new Date()
            };

            // Implementation would depend on your notification system
            logger.debug(`Sending ${eventType} notification for client ${client._id}`, notificationData);
        } catch (error) {
            logger.error('Error sending client notification:', {
                eventType,
                clientId: client._id,
                error: error.message
            });
        }
    }

    /**
     * Sends bulk notification
     * @private
     * @param {string} eventType - Type of event
     * @param {Array} results - Array of successful results
     * @param {Object} user - User object
     * @returns {Promise<void>}
     */
    async #sendBulkNotification(eventType, results, user) {
        try {
            const notificationData = {
                eventType: `bulk_${eventType}`,
                count: results.length,
                triggeredBy: user?.id,
                timestamp: new Date(),
                clientIds: results.map(result => result._id)
            };

            logger.debug(`Sending bulk ${eventType} notification for ${results.length} clients`, notificationData);
        } catch (error) {
            logger.error('Error sending bulk notification:', {
                eventType,
                count: results.length,
                error: error.message
            });
        }
    }

    /**
     * Sends ownership transfer notifications
     * @private
     * @param {Object} client - Client object
     * @param {string} fromUserId - Previous owner ID
     * @param {string} toUserId - New owner ID
     * @param {string} reason - Transfer reason
     * @returns {Promise<void>}
     */
    async #sendOwnershipTransferNotifications(client, fromUserId, toUserId, reason) {
        try {
            const notificationData = {
                eventType: 'ownership_transferred',
                clientId: client._id,
                clientName: client.companyName,
                fromUserId,
                toUserId,
                reason,
                timestamp: new Date()
            };

            logger.debug(`Sending ownership transfer notifications for client ${client._id}`, notificationData);
        } catch (error) {
            logger.error('Error sending ownership transfer notifications:', {
                clientId: client._id,
                error: error.message
            });
        }
    }

    /**
     * Validates tax ID format based on country
     * @private
     * @param {string} taxId - Tax ID to validate
     * @param {string} country - Country code
     * @returns {boolean} Whether tax ID is valid
     */
    #validateTaxId(taxId, country) {
        if (!taxId || !country) return false;

        // Basic validation patterns by country
        const patterns = {
            US: /^\d{2}-\d{7}$/, // EIN format
            GB: /^GB\d{9}$/, // UK VAT format
            DE: /^DE\d{9}$/, // German VAT format
            FR: /^FR[A-Z0-9]{2}\d{9}$/, // French VAT format
            CA: /^\d{9}RT\d{4}$/ // Canadian GST format
        };

        const pattern = patterns[country.toUpperCase()];
        return pattern ? pattern.test(taxId) : true; // Allow unknown formats
    }

    /**
     * Bulk update clients
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkUpdateClients(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { updates } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info('Bulk updating clients');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.bulkUpdate');

            if (!Array.isArray(updates)) {
                throw new ValidationError('Updates must be an array', 'INVALID_BULK_DATA');
            }

            if (updates.length > this.#bulkConfig.maxOperationSize) {
                throw new ValidationError(
                    `Bulk operation exceeds maximum size of ${this.#bulkConfig.maxOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Execute bulk update
            const results = await this.#clientService.bulkUpdateClients(updates, userId, {
                tenantId: req.tenant?.id,
                skipNotifications: req.body.skipNotifications === true
            });

            // Log audit trail
            await this.#logControllerAction('BULK_CLIENTS_UPDATED', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Bulk update completed: ${results.successful.length} updated, ${results.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Bulk delete clients
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkDeleteClients(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientIds, hardDelete = false, reason } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info('Bulk deleting clients');

            // Check permissions
            await this.#checkPermission(req, hardDelete ? 'clients.hardDelete' : 'clients.delete');

            if (!Array.isArray(clientIds)) {
                throw new ValidationError('Client IDs must be an array', 'INVALID_BULK_DATA');
            }

            if (hardDelete && !reason) {
                throw new ValidationError('Reason is required for hard delete', 'REASON_REQUIRED');
            }

            // Execute bulk delete
            const results = await this.#clientService.bulkDeleteClients(clientIds, userId, {
                hardDelete,
                reason,
                tenantId: req.tenant?.id
            });

            // Log audit trail
            await this.#logControllerAction('BULK_CLIENTS_DELETED', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                hardDelete,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Bulk deletion completed: ${results.successful.length} deleted, ${results.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Archive client
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async archiveClient(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { reason } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Archiving client: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.archive');

            // Archive client
            const result = await this.#clientService.archiveClient(clientId, userId, {
                reason,
                tenantId: req.tenant?.id
            });

            // Log audit trail
            await this.#logControllerAction('CLIENT_ARCHIVED', {
                clientId,
                reason,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Client archived successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Unarchive client
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async unarchiveClient(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { reason } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Unarchiving client: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.archive');

            // Unarchive client
            const result = await this.#clientService.unarchiveClient(clientId, userId, {
                reason,
                tenantId: req.tenant?.id
            });

            // Log audit trail
            await this.#logControllerAction('CLIENT_UNARCHIVED', {
                clientId,
                reason,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Client unarchived successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Merge clients
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async mergeClients(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { primaryClientId, secondaryClientIds, mergeStrategy = 'preserve_primary' } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info('Merging clients');

            // Validate inputs
            if (!CommonValidator.isValidObjectId(primaryClientId)) {
                throw new ValidationError('Invalid primary client ID format', 'INVALID_CLIENT_ID');
            }

            if (!Array.isArray(secondaryClientIds) || secondaryClientIds.length === 0) {
                throw new ValidationError('Secondary client IDs must be a non-empty array', 'INVALID_SECONDARY_CLIENTS');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.merge');

            // Execute merge
            const result = await this.#clientService.mergeClients(
                primaryClientId,
                secondaryClientIds,
                userId,
                {
                    mergeStrategy,
                    tenantId: req.tenant?.id
                }
            );

            // Log audit trail
            await this.#logControllerAction('CLIENTS_MERGED', {
                primaryClientId,
                secondaryClientIds,
                mergeStrategy,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                `Successfully merged ${secondaryClientIds.length} clients into primary client`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Duplicate client
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async duplicateClient(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { newCompanyName, includeContacts = true, includeDocuments = false } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Duplicating client: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            if (!newCompanyName) {
                throw new ValidationError('New company name is required for duplication', 'COMPANY_NAME_REQUIRED');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.create');

            // Duplicate client
            const duplicatedClient = await this.#clientService.duplicateClient(clientId, userId, {
                newCompanyName,
                includeContacts,
                includeDocuments,
                tenantId: req.tenant?.id
            });

            // Log audit trail
            await this.#logControllerAction('CLIENT_DUPLICATED', {
                originalClientId: clientId,
                newClientId: duplicatedClient._id,
                newCompanyName,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatClientResponse(duplicatedClient),
                'Client duplicated successfully'
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Update client tier
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateClientTier(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { tier, reason } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating client tier: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            if (!this.#validationConfig.allowedTiers.includes(tier)) {
                throw new ValidationError(
                    `Invalid tier. Valid options: ${this.#validationConfig.allowedTiers.join(', ')}`,
                    'INVALID_TIER'
                );
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.updateTier');

            // Update tier through general update method
            const updatedClient = await this.#clientService.updateClient(
                clientId,
                {
                    'relationship.tier': tier,
                    'relationship.tierChangedAt': new Date(),
                    'relationship.tierChangeReason': reason
                },
                userId,
                { tenantId: req.tenant?.id }
            );

            // Log audit trail
            await this.#logControllerAction('CLIENT_TIER_UPDATED', {
                clientId,
                newTier: tier,
                reason,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatClientResponse(updatedClient),
                'Client tier updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update client status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateClientStatus(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { status, reason } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating client status: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            if (!this.#validationConfig.allowedStatuses.includes(status)) {
                throw new ValidationError(
                    `Invalid status. Valid options: ${this.#validationConfig.allowedStatuses.join(', ')}`,
                    'INVALID_STATUS'
                );
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.updateStatus');

            // Update status through general update method
            const updatedClient = await this.#clientService.updateClient(
                clientId,
                {
                    'relationship.status': status,
                    'relationship.statusChangedAt': new Date(),
                    'relationship.statusChangeReason': reason
                },
                userId,
                { tenantId: req.tenant?.id }
            );

            // Log audit trail
            await this.#logControllerAction('CLIENT_STATUS_UPDATED', {
                clientId,
                newStatus: status,
                reason,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatClientResponse(updatedClient),
                'Client status updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Get client timeline
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientTimeline(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Fetching client timeline: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.read');

            // Parse options
            const options = {
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0,
                includeSystem: req.query.includeSystem === 'true',
                eventTypes: req.query.eventTypes ? req.query.eventTypes.split(',') : null,
                tenantId: req.tenant?.id
            };

            // Get timeline
            const timeline = await this.#clientService.getClientTimeline(clientId, options);

            // Log access
            await this.#logControllerAction('CLIENT_TIMELINE_ACCESSED', {
                clientId,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                timeline,
                'Client timeline retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Get client relationships
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientRelationships(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Fetching client relationships: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.read');

            // Get relationships
            const relationships = await this.#clientService.getClientRelationships(clientId, {
                tenantId: req.tenant?.id,
                includeContacts: req.query.includeContacts !== 'false',
                includeProjects: req.query.includeProjects === 'true',
                includeHistory: req.query.includeHistory === 'true'
            });

            // Log access
            await this.#logControllerAction('CLIENT_RELATIONSHIPS_ACCESSED', {
                clientId,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                relationships,
                'Client relationships retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Get client metrics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientMetrics(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Fetching client metrics: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.analytics');

            // Parse date range
            const dateRange = this.#parseDateRange(req.query);

            // Get metrics
            const metrics = await this.#clientService.getClientMetrics(clientId, {
                dateRange,
                includeFinancial: req.query.includeFinancial === 'true',
                includeEngagement: req.query.includeEngagement === 'true',
                includePerformance: req.query.includePerformance === 'true',
                tenantId: req.tenant?.id
            });

            // Log access
            await this.#logControllerAction('CLIENT_METRICS_ACCESSED', {
                clientId,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                metrics,
                'Client metrics retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Validate client data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async validateClientData(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Validating client data: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.read');

            // Validate data
            const validationResult = await this.#clientService.validateClientData(clientId, {
                checkDuplicates: req.query.checkDuplicates === 'true',
                checkIntegrity: req.query.checkIntegrity === 'true',
                checkCompliance: req.query.checkCompliance === 'true',
                tenantId: req.tenant?.id
            });

            // Log validation
            await this.#logControllerAction('CLIENT_DATA_VALIDATED', {
                clientId,
                validationPassed: validationResult.isValid,
                issuesFound: validationResult.issues.length,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                validationResult,
                'Client data validation completed'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Get client summary
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientSummary(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Fetching client summary: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.read');

            // Get summary
            const summary = await this.#clientService.getClientSummary(clientId, {
                tenantId: req.tenant?.id,
                includeRecentActivity: req.query.includeRecentActivity !== 'false',
                includeKPIs: req.query.includeKPIs !== 'false',
                includeAlerts: req.query.includeAlerts === 'true'
            });

            // Log access
            await this.#logControllerAction('CLIENT_SUMMARY_ACCESSED', {
                clientId,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                summary,
                'Client summary retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Get client dashboard
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getClientDashboard(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Fetching client dashboard: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.read');

            // Get dashboard data
            const dashboardData = await this.#clientService.getClientDashboard(clientId, {
                tenantId: req.tenant?.id,
                dateRange: this.#parseDateRange(req.query),
                widgets: req.query.widgets ? req.query.widgets.split(',') : null
            });

            // Log access
            await this.#logControllerAction('CLIENT_DASHBOARD_ACCESSED', {
                clientId,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                dashboardData,
                'Client dashboard data retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Sync client data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async syncClientData(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { syncSources = ['all'] } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Syncing client data: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.sync');

            // Sync data
            const syncResult = await this.#clientService.syncClientData(clientId, userId, {
                syncSources,
                forceSync: req.body.forceSync === true,
                tenantId: req.tenant?.id
            });

            // Log sync
            await this.#logControllerAction('CLIENT_DATA_SYNCED', {
                clientId,
                syncSources,
                fieldsUpdated: syncResult.fieldsUpdated,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                syncResult,
                'Client data synchronized successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Audit client
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async auditClient(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Auditing client: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.audit');

            // Parse options
            const options = {
                startDate: req.query.startDate ? new Date(req.query.startDate) : null,
                endDate: req.query.endDate ? new Date(req.query.endDate) : null,
                auditTypes: req.query.auditTypes ? req.query.auditTypes.split(',') : null,
                includeSystemEvents: req.query.includeSystemEvents === 'true',
                tenantId: req.tenant?.id
            };

            // Get audit trail
            const auditTrail = await this.#clientService.getClientAuditTrail(clientId, options);

            // Log audit access
            await this.#logControllerAction('CLIENT_AUDIT_ACCESSED', {
                clientId,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                auditTrail,
                'Client audit trail retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Generate client report
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async generateClientReport(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { clientId } = req.params;
            const { reportType, format = 'pdf', includeCharts = true } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Generating client report: ${clientId}`);

            // Validate client ID
            if (!CommonValidator.isValidObjectId(clientId)) {
                throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'clients.reports');

            // Validate report type
            const validReportTypes = ['comprehensive', 'financial', 'performance', 'engagement', 'compliance'];
            if (!validReportTypes.includes(reportType)) {
                throw new ValidationError(
                    `Invalid report type. Valid options: ${validReportTypes.join(', ')}`,
                    'INVALID_REPORT_TYPE'
                );
            }

            // Generate report
            const reportData = await this.#clientService.generateClientReport(clientId, reportType, {
                format,
                includeCharts,
                dateRange: this.#parseDateRange(req.query),
                tenantId: req.tenant?.id,
                userId
            });

            // Log report generation
            await this.#logControllerAction('CLIENT_REPORT_GENERATED', {
                clientId,
                reportType,
                format,
                userId
            });

            // Set appropriate response headers based on format
            if (format === 'pdf') {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="client-${clientId}-${reportType}-report.pdf"`);
                res.status(STATUS_CODES.OK).send(reportData);
            } else {
                // JSON response
                const response = this.#responseFormatter.formatSuccess(
                    reportData,
                    'Client report generated successfully'
                );
                res.status(STATUS_CODES.OK).json(response);
            }
        })(req, res, next);
    }
}

// Export controller as singleton instance
module.exports = new ClientController();