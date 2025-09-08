'use strict';

/**
 * @fileoverview Enterprise client service with comprehensive lifecycle management, analytics, and multi-tenant support
 * @module servers/customer-services/modules/core-business/clients/services/client-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-contact-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-document-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-note-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const asyncHandler = require('../../../../../../shared/lib/utils/async-handler');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const ClientModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/clients/client-model');
const ClientContactModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/clients/client-contact-model');
const ClientDocumentModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/clients/client-document-model');
const ClientNoteModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/clients/client-note-model');
const ExcelJS = require('exceljs');
const csv = require('csv-parse/sync');
const path = require('path');
const crypto = require('crypto');

/**
 * Enterprise client service for comprehensive client lifecycle management
 * @class ClientService
 * @description Manages all client-related operations with multi-tenant support, caching, and audit trails
 */
class ClientService {
    /**
     * @private
     * @type {CacheService}
     */
    #cacheService;

    /**
     * @private
     * @type {EmailService}
     */
    #emailService;

    /**
     * @private
     * @type {NotificationService}
     */
    #notificationService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 3600; // 1 hour

    /**
     * @private
     * @type {number}
     */
    #maxBulkOperationSize = 1000;

    /**
     * @private
     * @type {Map}
     */
    #pendingTransactions = new Map();

    /**
     * @private
     * @type {Object}
     */
    #tierLimits = {
        strategic: { creditLimit: 1000000, projects: 100, users: 500 },
        enterprise: { creditLimit: 500000, projects: 50, users: 200 },
        mid_market: { creditLimit: 200000, projects: 20, users: 100 },
        small_business: { creditLimit: 50000, projects: 10, users: 50 },
        startup: { creditLimit: 10000, projects: 5, users: 20 }
    };

    /**
     * Creates an instance of ClientService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     * @param {CacheService} dependencies.cacheService - Cache service instance
     * @param {EmailService} dependencies.emailService - Email service instance
     * @param {NotificationService} dependencies.notificationService - Notification service instance
     * @param {AuditService} dependencies.auditService - Audit service instance
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing ClientService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService
        });
    }

    // ==================== CRUD Operations ====================

    /**
     * Create a new client with comprehensive validation and enrichment
     * @param {Object} clientData - Client data to create
     * @param {string} userId - ID of user creating the client
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created client object
     * @throws {ValidationError} If validation fails
     * @throws {ConflictError} If client already exists
     */
    async createClient(clientData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Validate required fields
            await this.#validateClientData(clientData);

            // Check for duplicates
            await this.#checkDuplicateClient(clientData);

            // Enrich client data
            const enrichedData = await this.#enrichClientData(clientData, userId);

            // Generate client code if not provided
            if (!enrichedData.clientCode) {
                enrichedData.clientCode = await ClientModel.generateClientCode(
                    enrichedData.companyName,
                    enrichedData.tenantId
                );
            }

            // Set initial relationship status
            enrichedData.relationship = {
                ...enrichedData.relationship,
                status: 'prospect',
                accountManager: userId,
                acquisitionDate: new Date(),
                acquisitionSource: options.source || 'direct_sales'
            };

            // Set initial lifecycle
            enrichedData.lifecycle = {
                stage: 'prospect',
                stageHistory: [{
                    stage: 'prospect',
                    enteredAt: new Date(),
                    trigger: 'client_creation'
                }],
                importantDates: {
                    firstContactDate: new Date()
                }
            };

            // Create client
            const client = await ClientModel.create([enrichedData], { session });

            // Create default contact if provided
            if (clientData.primaryContact) {
                await this.#createPrimaryContact(client[0]._id, clientData.primaryContact, userId, session);
            }

            // Send notifications
            await this.#sendClientCreationNotifications(client[0], userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CLIENT_CREATED',
                entityType: 'client',
                entityId: client[0]._id,
                userId,
                details: {
                    clientCode: client[0].clientCode,
                    companyName: client[0].companyName
                }
            });

            // Clear relevant caches
            await this.#clearClientCaches(enrichedData.tenantId);

            logger.info('Client created successfully', {
                clientId: client[0]._id,
                clientCode: client[0].clientCode,
                createdBy: userId
            });

            return client[0];
        } catch (error) {
            logger.error('Error creating client', {
                error: error.message,
                clientData: clientData.companyName,
                userId
            });
            throw error;
        }
    }

    /**
     * Get client by ID with optional data population
     * @param {string} clientId - Client ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Client object
     * @throws {NotFoundError} If client not found
     */
    async getClientById(clientId, options = {}) {
        const {
            populate = [],
            includeDeleted = false,
            includeArchived = false,
            checkPermissions = true,
            userId,
            tenantId
        } = options;

        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey('client', clientId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Build query
            const query = { _id: clientId };
            if (!includeDeleted) query.isDeleted = false;
            if (!includeArchived) query['archiveStatus.isArchived'] = { $ne: true };
            if (tenantId) query.tenantId = tenantId;

            // Execute query
            let clientQuery = ClientModel.findOne(query);

            // Apply population
            if (populate.includes('contacts')) {
                clientQuery = clientQuery.populate('contacts.primary');
            }
            if (populate.includes('accountManager')) {
                clientQuery = clientQuery.populate('relationship.accountManager', 'profile.firstName profile.lastName email');
            }
            if (populate.includes('projects')) {
                clientQuery = clientQuery.populate('projects.projectId');
            }

            const client = await clientQuery.exec();

            if (!client) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions && userId) {
                await this.#checkClientAccess(client, userId, 'read');
            }

            // Calculate additional metrics
            const enrichedClient = await this.#enrichClientWithMetrics(client.toObject());

            // Cache result
            await this.#cacheService.set(cacheKey, enrichedClient, this.#defaultCacheTTL);

            return enrichedClient;
        } catch (error) {
            logger.error('Error fetching client', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Update client with validation and change tracking
     * @param {string} clientId - Client ID to update
     * @param {Object} updateData - Data to update
     * @param {string} userId - User performing update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated client
     * @throws {ValidationError} If validation fails
     * @throws {NotFoundError} If client not found
     */
    async updateClient(clientId, updateData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Get existing client
            const existingClient = await this.getClientById(clientId, {
                checkPermissions: true,
                userId,
                tenantId: options.tenantId
            });

            if (!existingClient) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkClientAccess(existingClient, userId, 'write');

            // Validate update data
            await this.#validateUpdateData(updateData, existingClient);

            // Track changes for audit
            const changes = await this.#trackChanges(existingClient, updateData);

            // Apply business rules
            const processedData = await this.#applyBusinessRules(updateData, existingClient);

            // Update client
            const updatedClient = await ClientModel.findByIdAndUpdate(
                clientId,
                {
                    $set: processedData,
                    $push: {
                        auditLog: {
                            action: 'updated',
                            field: Object.keys(changes).join(', '),
                            oldValue: changes,
                            newValue: processedData,
                            changedBy: userId,
                            changedAt: new Date()
                        }
                    }
                },
                {
                    new: true,
                    runValidators: true,
                    session
                }
            );

            // Handle relationship changes
            if (updateData.relationship?.status) {
                await this.#handleRelationshipStatusChange(updatedClient, existingClient, userId);
            }

            // Update health score if needed
            if (this.#shouldRecalculateHealthScore(updateData)) {
                await updatedClient.updateHealthScore();
            }

            // Send notifications for significant changes
            await this.#sendUpdateNotifications(updatedClient, changes, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CLIENT_UPDATED',
                entityType: 'client',
                entityId: clientId,
                userId,
                details: {
                    changes,
                    fieldsUpdated: Object.keys(changes)
                }
            });

            // Clear caches
            await this.#clearClientCaches(updatedClient.tenantId, clientId);

            logger.info('Client updated successfully', {
                clientId,
                updatedBy: userId,
                fieldsUpdated: Object.keys(changes)
            });

            return updatedClient;
        } catch (error) {
            logger.error('Error updating client', {
                error: error.message,
                clientId,
                userId
            });
            throw error;
        }
    }

    /**
     * Delete client (soft delete by default)
     * @param {string} clientId - Client ID to delete
     * @param {string} userId - User performing deletion
     * @param {Object} options - Deletion options
     * @returns {Promise<boolean>} Success status
     * @throws {NotFoundError} If client not found
     * @throws {ForbiddenError} If deletion not allowed
     */
    async deleteClient(clientId, userId, options = {}) {
        const { hardDelete = false, reason, session = null } = options;

        try {
            const client = await this.getClientById(clientId, {
                includeDeleted: hardDelete,
                checkPermissions: true,
                userId
            });

            if (!client) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Check for active projects/contracts
            await this.#checkDeletionConstraints(client);

            // Check permissions
            await this.#checkClientAccess(client, userId, 'delete');

            if (hardDelete) {
                // Perform hard delete with cascade
                await this.#performHardDelete(clientId, session);
            } else {
                // Soft delete
                await ClientModel.findByIdAndUpdate(
                    clientId,
                    {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: userId,
                        'relationship.status': 'churned'
                    },
                    { session }
                );
            }

            // Archive related data
            await this.#archiveClientData(clientId, userId, session);

            // Send notifications
            await this.#sendDeletionNotifications(client, userId, reason);

            // Log audit trail
            await this.#auditService.log({
                action: hardDelete ? 'CLIENT_HARD_DELETED' : 'CLIENT_SOFT_DELETED',
                entityType: 'client',
                entityId: clientId,
                userId,
                details: {
                    clientCode: client.clientCode,
                    companyName: client.companyName,
                    reason
                }
            });

            // Clear all caches
            await this.#clearClientCaches(client.tenantId, clientId);

            logger.info('Client deleted successfully', {
                clientId,
                deletedBy: userId,
                hardDelete,
                reason
            });

            return true;
        } catch (error) {
            logger.error('Error deleting client', {
                error: error.message,
                clientId,
                userId
            });
            throw error;
        }
    }

    // ==================== Search & Filtering ====================

    /**
     * Search clients with advanced filtering and pagination
     * @param {Object} searchCriteria - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results with pagination
     */
    async searchClients(searchCriteria, options = {}) {
        const {
            page = 1,
            limit = 20,
            sort = { createdAt: -1 },
            populate = [],
            includeArchived = false,
            tenantId,
            userId
        } = options;

        try {
            // Build search query
            const query = await this.#buildSearchQuery(searchCriteria, {
                includeArchived,
                tenantId
            });

            // Execute search with pagination
            const skip = (page - 1) * limit;

            let searchQuery = ClientModel.find(query)
                .skip(skip)
                .limit(limit)
                .sort(sort);

            // Apply population
            if (populate.includes('accountManager')) {
                searchQuery = searchQuery.populate('relationship.accountManager', 'profile.firstName profile.lastName email');
            }

            const [clients, total] = await Promise.all([
                searchQuery.exec(),
                ClientModel.countDocuments(query)
            ]);

            // Enrich with additional data
            const enrichedClients = await Promise.all(
                clients.map(client => this.#enrichClientWithMetrics(client.toObject()))
            );

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                clients: enrichedClients,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                },
                filters: searchCriteria
            };
        } catch (error) {
            logger.error('Error searching clients', {
                error: error.message,
                searchCriteria
            });
            throw error;
        }
    }

    /**
     * Get clients by various filters with caching
     * @param {Object} filters - Filter criteria
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Filtered clients
     */
    async getClientsByFilter(filters, options = {}) {
        const {
            limit = 100,
            sort = { 'analytics.lifetime.totalRevenue': -1 },
            tenantId
        } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('clients-filter', filters, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Build filter query
            const query = {
                isDeleted: false,
                'archiveStatus.isArchived': { $ne: true }
            };

            if (tenantId) query.tenantId = tenantId;
            if (filters.status) query['relationship.status'] = filters.status;
            if (filters.tier) query['relationship.tier'] = filters.tier;
            if (filters.accountManager) query['relationship.accountManager'] = filters.accountManager;
            if (filters.industry) query['industry.primary.sector'] = filters.industry;
            if (filters.country) query['addresses.headquarters.country'] = filters.country;
            if (filters.minRevenue) {
                query['analytics.lifetime.totalRevenue'] = { $gte: filters.minRevenue };
            }
            if (filters.churnRisk) {
                query['relationship.churnRisk.level'] = filters.churnRisk;
            }

            const clients = await ClientModel.find(query)
                .limit(limit)
                .sort(sort)
                .select('-auditLog -searchTokens');

            // Cache results
            await this.#cacheService.set(cacheKey, clients, this.#defaultCacheTTL);

            return clients;
        } catch (error) {
            logger.error('Error filtering clients', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    // ==================== Bulk Operations ====================

    /**
     * Bulk create clients with validation and rollback support
     * @param {Array} clientsData - Array of client data
     * @param {string} userId - User performing bulk creation
     * @param {Object} options - Bulk operation options
     * @returns {Promise<Object>} Bulk operation results
     */
    async bulkCreateClients(clientsData, userId, options = {}) {
        const { validateAll = true, stopOnError = false, tenantId } = options;
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const results = {
                successful: [],
                failed: [],
                total: clientsData.length
            };

            // Validate bulk size
            if (clientsData.length > this.#maxBulkOperationSize) {
                throw new ValidationError(
                    `Bulk operation size exceeds maximum of ${this.#maxBulkOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Validate all if required
            if (validateAll) {
                for (const [index, clientData] of clientsData.entries()) {
                    try {
                        await this.#validateClientData(clientData);
                    } catch (error) {
                        results.failed.push({
                            index,
                            data: clientData,
                            error: error.message
                        });
                        if (stopOnError) {
                            throw error;
                        }
                    }
                }
            }

            // Process each client
            for (const [index, clientData] of clientsData.entries()) {
                try {
                    const enrichedData = await this.#enrichClientData(clientData, userId);
                    enrichedData.tenantId = tenantId;

                    if (!enrichedData.clientCode) {
                        enrichedData.clientCode = await ClientModel.generateClientCode(
                            enrichedData.companyName,
                            tenantId
                        );
                    }

                    const client = await ClientModel.create([enrichedData], { session });
                    results.successful.push({
                        index,
                        clientId: client[0]._id,
                        clientCode: client[0].clientCode
                    });
                } catch (error) {
                    results.failed.push({
                        index,
                        data: clientData,
                        error: error.message
                    });
                    if (stopOnError) {
                        throw error;
                    }
                }
            }

            await session.commitTransaction();

            // Send bulk notifications
            if (results.successful.length > 0) {
                await this.#sendBulkCreationNotifications(results.successful, userId);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'BULK_CLIENTS_CREATED',
                entityType: 'client',
                userId,
                details: {
                    total: results.total,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            });

            // Clear caches
            await this.#clearClientCaches(tenantId);

            logger.info('Bulk client creation completed', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk client creation', {
                error: error.message,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Bulk update clients
     * @param {Array} updates - Array of update objects
     * @param {string} userId - User performing updates
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Bulk update results
     */
    async bulkUpdateClients(updates, userId, options = {}) {
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const results = {
                successful: [],
                failed: [],
                total: updates.length
            };

            for (const update of updates) {
                try {
                    const { clientId, data } = update;

                    const updatedClient = await this.updateClient(
                        clientId,
                        data,
                        userId,
                        { ...options, session }
                    );

                    results.successful.push({
                        clientId: updatedClient._id,
                        clientCode: updatedClient.clientCode
                    });
                } catch (error) {
                    results.failed.push({
                        clientId: update.clientId,
                        error: error.message
                    });
                }
            }

            await session.commitTransaction();

            // Clear caches
            await this.#clearClientCaches(options.tenantId);

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk client update', {
                error: error.message,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    // ==================== Analytics & Statistics ====================

    /**
     * Get comprehensive client statistics
     * @param {Object} filters - Statistics filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Client statistics
     */
    async getClientStatistics(filters = {}, options = {}) {
        const { tenantId, dateRange = {} } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('client-stats', filters, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            const stats = await ClientModel.getClientStatistics(tenantId, dateRange);

            // Add additional analytics
            stats.performance = await this.#calculatePerformanceMetrics(tenantId, dateRange);
            stats.predictions = await this.#generatePredictions(tenantId);
            stats.recommendations = await this.#generateRecommendations(stats);

            // Cache results
            await this.#cacheService.set(cacheKey, stats, 1800); // 30 minutes

            return stats;
        } catch (error) {
            logger.error('Error generating client statistics', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    /**
     * Calculate client health scores
     * @param {string} clientId - Client ID or null for all clients
     * @param {Object} options - Calculation options
     * @returns {Promise<Object>} Health score results
     */
    async calculateHealthScores(clientId = null, options = {}) {
        const { tenantId, recalculate = false } = options;

        try {
            const query = {
                isDeleted: false,
                'relationship.status': 'active'
            };

            if (tenantId) query.tenantId = tenantId;
            if (clientId) query._id = clientId;

            const clients = await ClientModel.find(query);
            const results = [];

            for (const client of clients) {
                if (recalculate || !client.relationship.healthScore?.lastCalculated ||
                    client.relationship.healthScore.lastCalculated < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
                    const healthScore = await client.updateHealthScore();
                    results.push({
                        clientId: client._id,
                        clientCode: client.clientCode,
                        companyName: client.companyName,
                        healthScore: healthScore.score,
                        trend: healthScore.trend,
                        churnRisk: client.relationship.churnRisk.level
                    });
                }
            }

            return {
                calculated: results.length,
                results,
                timestamp: new Date()
            };
        } catch (error) {
            logger.error('Error calculating health scores', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    // ==================== Export & Import ====================

    /**
     * Export clients to various formats
     * @param {Object} filters - Export filters
     * @param {string} format - Export format (csv, json, excel)
     * @param {Object} options - Export options
     * @returns {Promise<Buffer>} Exported data buffer
     */
    async exportClients(filters = {}, format = 'csv', options = {}) {
        const { fields = [], tenantId } = options;

        try {
            // Get clients to export
            const clients = await this.getClientsByFilter(filters, {
                limit: 10000,
                tenantId
            });

            // Select fields to export
            const exportData = clients.map(client => {
                if (fields.length > 0) {
                    return this.#selectFields(client, fields);
                }
                return this.#getExportableFields(client);
            });

            // Generate export based on format
            let exportBuffer;
            switch (format.toLowerCase()) {
                case 'csv':
                    exportBuffer = await this.#generateCSVExport(exportData);
                    break;
                case 'excel':
                    exportBuffer = await this.#generateExcelExport(exportData);
                    break;
                case 'json':
                    exportBuffer = Buffer.from(JSON.stringify(exportData, null, 2));
                    break;
                default:
                    throw new ValidationError(`Unsupported export format: ${format}`, 'INVALID_FORMAT');
            }

            // Log export
            await this.#auditService.log({
                action: 'CLIENTS_EXPORTED',
                entityType: 'client',
                userId: options.userId,
                details: {
                    format,
                    count: exportData.length,
                    filters
                }
            });

            return exportBuffer;
        } catch (error) {
            logger.error('Error exporting clients', {
                error: error.message,
                format,
                filters
            });
            throw error;
        }
    }

    /**
     * Import clients from file
     * @param {Buffer} fileBuffer - File buffer
     * @param {string} format - File format
     * @param {string} userId - User performing import
     * @param {Object} options - Import options
     * @returns {Promise<Object>} Import results
     */
    async importClients(fileBuffer, format, userId, options = {}) {
        const { validateAll = true, tenantId, mapping = {} } = options;

        try {
            // Parse file based on format
            let parsedData;
            switch (format.toLowerCase()) {
                case 'csv':
                    parsedData = await this.#parseCSVImport(fileBuffer);
                    break;
                case 'excel':
                    parsedData = await this.#parseExcelImport(fileBuffer);
                    break;
                case 'json':
                    parsedData = JSON.parse(fileBuffer.toString());
                    break;
                default:
                    throw new ValidationError(`Unsupported import format: ${format}`, 'INVALID_FORMAT');
            }

            // Apply field mapping if provided
            if (Object.keys(mapping).length > 0) {
                parsedData = parsedData.map(row => this.#applyFieldMapping(row, mapping));
            }

            // Perform bulk import
            const results = await this.bulkCreateClients(parsedData, userId, {
                validateAll,
                tenantId,
                stopOnError: false
            });

            // Log import
            await this.#auditService.log({
                action: 'CLIENTS_IMPORTED',
                entityType: 'client',
                userId,
                details: {
                    format,
                    total: results.total,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            });

            return results;
        } catch (error) {
            logger.error('Error importing clients', {
                error: error.message,
                format,
                userId
            });
            throw error;
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Validate client data
     * @private
     */
    async #validateClientData(clientData) {
        const errors = [];

        if (!clientData.companyName) {
            errors.push('Company name is required');
        }

        if (!clientData.addresses?.headquarters?.country) {
            errors.push('Headquarters country is required');
        }

        if (clientData.contacts?.primary?.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(clientData.contacts.primary.email)) {
                errors.push('Invalid primary contact email');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check for duplicate clients
     * @private
     */
    async #checkDuplicateClient(clientData) {
        const duplicateQuery = {
            $or: [
                { companyName: clientData.companyName },
                { legalName: clientData.legalName }
            ],
            isDeleted: false
        };

        if (clientData.businessDetails?.registrationNumber) {
            duplicateQuery.$or.push({
                'businessDetails.registrationNumber': clientData.businessDetails.registrationNumber
            });
        }

        const duplicate = await ClientModel.findOne(duplicateQuery);
        if (duplicate) {
            throw new ConflictError(
                `Client already exists with name or registration number`,
                'CLIENT_DUPLICATE'
            );
        }
    }

    /**
     * Enrich client data with additional information
     * @private
     */
    async #enrichClientData(clientData, userId) {
        const enriched = { ...clientData };

        // Set metadata
        enriched.metadata = {
            ...enriched.metadata,
            source: 'manual',
            importedBy: userId,
            importedAt: new Date()
        };

        // Set default billing preferences
        if (!enriched.billing) {
            enriched.billing = {
                currency: 'USD',
                paymentTerms: 'net30',
                taxExempt: false
            };
        }

        // Set default analytics
        enriched.analytics = {
            lifetime: {
                totalRevenue: 0,
                totalProjects: 0,
                totalEngagements: 0,
                totalInvoices: 0,
                totalPayments: 0
            },
            current: {
                activeProjects: 0
            }
        };

        return enriched;
    }

    /**
     * Generate cache key
     * @private
     */
    #generateCacheKey(type, identifier, options = {}) {
        const optionsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(options))
            .digest('hex');
        return `client:${type}:${identifier}:${optionsHash}`;
    }

    /**
     * Clear client caches
     * @private
     */
    async #clearClientCaches(tenantId, clientId = null) {
        const patterns = [`client:*:${tenantId}:*`];
        if (clientId) {
            patterns.push(`client:*:${clientId}:*`);
        }

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * Check client access permissions
     * @private
     */
    async #checkClientAccess(client, userId, action) {
        // Implement permission checking logic
        // This would integrate with your permission system
        return true;
    }

    /**
     * Track changes for audit
     * @private
     */
    async #trackChanges(original, updates) {
        const changes = {};

        for (const key of Object.keys(updates)) {
            if (JSON.stringify(original[key]) !== JSON.stringify(updates[key])) {
                changes[key] = {
                    old: original[key],
                    new: updates[key]
                };
            }
        }

        return changes;
    }

    /**
     * Send client creation notifications
     * @private
     */
    async #sendClientCreationNotifications(client, userId) {
        // Send to account manager
        if (client.relationship.accountManager) {
            await this.#notificationService.send({
                type: 'client_created',
                recipient: client.relationship.accountManager,
                data: {
                    clientCode: client.clientCode,
                    companyName: client.companyName,
                    createdBy: userId
                }
            });
        }

        // Send welcome email if primary contact exists
        if (client.contacts?.primary?.email) {
            await this.#emailService.sendTemplate('client-welcome', {
                to: client.contacts.primary.email,
                data: {
                    companyName: client.companyName,
                    contactName: client.contacts.primary.name
                }
            });
        }
    }

    /**
     * Build search query from criteria
     * @private
     */
    async #buildSearchQuery(criteria, options) {
        const query = {
            isDeleted: false
        };

        if (options.tenantId) query.tenantId = options.tenantId;
        if (!options.includeArchived) query['archiveStatus.isArchived'] = { $ne: true };

        // Text search
        if (criteria.search) {
            query.$or = [
                { companyName: new RegExp(criteria.search, 'i') },
                { legalName: new RegExp(criteria.search, 'i') },
                { clientCode: new RegExp(criteria.search, 'i') },
                { 'contacts.primary.name': new RegExp(criteria.search, 'i') }
            ];
        }

        // Apply filters
        if (criteria.status) query['relationship.status'] = criteria.status;
        if (criteria.tier) query['relationship.tier'] = criteria.tier;
        if (criteria.industry) query['industry.primary.sector'] = criteria.industry;
        if (criteria.country) query['addresses.headquarters.country'] = criteria.country;

        // Date range filters
        if (criteria.createdAfter) {
            query.createdAt = { $gte: new Date(criteria.createdAfter) };
        }
        if (criteria.createdBefore) {
            query.createdAt = { ...query.createdAt, $lte: new Date(criteria.createdBefore) };
        }

        return query;
    }

    /**
     * Generate CSV export
     * @private
     */
    async #generateCSVExport(data) {
        const fields = Object.keys(data[0] || {});
        const csv = [
            fields.join(','),
            ...data.map(row =>
                fields.map(field => {
                    const value = row[field];
                    return typeof value === 'string' && value.includes(',')
                        ? `"${value}"`
                        : value;
                }).join(',')
            )
        ].join('\n');

        return Buffer.from(csv);
    }

    /**
     * Generate Excel export
     * @private
     */
    async #generateExcelExport(data) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Clients');

        // Add headers
        if (data.length > 0) {
            worksheet.columns = Object.keys(data[0]).map(key => ({
                header: key.replace(/([A-Z])/g, ' $1').trim(),
                key,
                width: 15
            }));

            // Add data
            worksheet.addRows(data);

            // Style header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
        }

        return await workbook.xlsx.writeBuffer();
    }

    /**
     * Create primary contact for client
     * @private
     */
    async #createPrimaryContact(clientId, contactData, userId, session) {
        const contact = {
            ...contactData,
            clientId,
            tenantId: contactData.tenantId,
            organizationId: contactData.organizationId,
            roleInfluence: {
                isPrimaryContact: true,
                isDecisionMaker: true
            },
            relationship: {
                status: 'active',
                relationshipOwner: userId
            }
        };

        return await ClientContactModel.create([contact], { session });
    }

    /**
     * Enrich client data with calculated metrics and aggregated information
     * @private
     * @param {Object} client - Client object to enrich
     * @returns {Promise<Object>} Enriched client object
     */
    async #enrichClientWithMetrics(client) {
        try {
            const enriched = { ...client };

            // Calculate revenue growth rate
            if (enriched.analytics?.lifetime?.totalRevenue > 0) {
                enriched.analytics.growthRate = await this.#calculateRevenueGrowthRate(client._id);
            }

            // Calculate engagement score
            enriched.analytics.engagementScore = await this.#calculateEngagementScore(client._id);

            // Add project completion rate
            enriched.analytics.projectCompletionRate = await this.#calculateProjectCompletionRate(client._id);

            // Calculate average project value
            if (enriched.analytics?.lifetime?.totalProjects > 0) {
                enriched.analytics.averageProjectValue =
                    enriched.analytics.lifetime.totalRevenue / enriched.analytics.lifetime.totalProjects;
            }

            return enriched;
        } catch (error) {
            logger.error('Error enriching client with metrics', {
                error: error.message,
                clientId: client._id
            });
            return client;
        }
    }

    /**
     * Validate update data against business rules
     * @private
     * @param {Object} updateData - Data to validate
     * @param {Object} existingClient - Current client data
     * @returns {Promise<boolean>} Validation result
     */
    async #validateUpdateData(updateData, existingClient) {
        const errors = [];

        // Validate tier changes
        if (updateData.relationship?.tier &&
            updateData.relationship.tier !== existingClient.relationship?.tier) {
            const tierLimits = this.#tierLimits[updateData.relationship.tier];
            if (!tierLimits) {
                errors.push(`Invalid client tier: ${updateData.relationship.tier}`);
            }
        }

        // Validate status transitions
        if (updateData.relationship?.status) {
            const validTransitions = this.#getValidStatusTransitions(existingClient.relationship?.status);
            if (!validTransitions.includes(updateData.relationship.status)) {
                errors.push(`Invalid status transition from ${existingClient.relationship?.status} to ${updateData.relationship.status}`);
            }
        }

        // Validate email format if provided
        if (updateData.contacts?.primary?.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(updateData.contacts.primary.email)) {
                errors.push('Invalid primary contact email format');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'UPDATE_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Apply business rules to update data
     * @private
     * @param {Object} updateData - Data to process
     * @param {Object} existingClient - Current client data
     * @returns {Promise<Object>} Processed data
     */
    async #applyBusinessRules(updateData, existingClient) {
        const processedData = { ...updateData };

        // Auto-update last modified timestamp
        processedData.lastModified = {
            date: new Date(),
            by: updateData.lastModified?.by || existingClient.lastModified?.by
        };

        // Handle tier change implications
        if (processedData.relationship?.tier &&
            processedData.relationship.tier !== existingClient.relationship?.tier) {
            const newLimits = this.#tierLimits[processedData.relationship.tier];
            processedData.relationship.tierLimits = newLimits;
            processedData.relationship.tierChangedAt = new Date();
        }

        // Update lifecycle stage if status changes
        if (processedData.relationship?.status &&
            processedData.relationship.status !== existingClient.relationship?.status) {
            processedData.lifecycle = {
                ...existingClient.lifecycle,
                stage: this.#mapStatusToLifecycleStage(processedData.relationship.status),
                stageHistory: [
                    ...(existingClient.lifecycle?.stageHistory || []),
                    {
                        stage: this.#mapStatusToLifecycleStage(processedData.relationship.status),
                        enteredAt: new Date(),
                        trigger: 'status_change'
                    }
                ]
            };
        }

        return processedData;
    }

    /**
     * Handle relationship status changes
     * @private
     * @param {Object} updatedClient - Updated client object
     * @param {Object} existingClient - Original client object
     * @param {string} userId - User performing the change
     */
    async #handleRelationshipStatusChange(updatedClient, existingClient, userId) {
        const oldStatus = existingClient.relationship?.status;
        const newStatus = updatedClient.relationship?.status;

        if (oldStatus === newStatus) return;

        // Handle status-specific logic
        switch (newStatus) {
            case 'active':
                updatedClient.relationship.activatedAt = new Date();
                updatedClient.lifecycle.importantDates.activationDate = new Date();
                break;

            case 'inactive':
                updatedClient.relationship.inactivatedAt = new Date();
                break;

            case 'churned':
                updatedClient.relationship.churnedAt = new Date();
                updatedClient.lifecycle.importantDates.churnDate = new Date();
                // Trigger churn analysis
                await this.#triggerChurnAnalysis(updatedClient._id, userId);
                break;
        }

        // Send status change notifications
        await this.#sendStatusChangeNotifications(updatedClient, oldStatus, newStatus, userId);
    }

    /**
     * Check if health score should be recalculated
     * @private
     * @param {Object} updateData - Update data
     * @returns {boolean} Whether to recalculate
     */
    #shouldRecalculateHealthScore(updateData) {
        const triggerFields = [
            'relationship.status',
            'relationship.tier',
            'analytics',
            'billing.paymentHistory',
            'projects',
            'support.tickets'
        ];

        return triggerFields.some(field => {
            const keys = field.split('.');
            let current = updateData;
            for (const key of keys) {
                if (current[key] !== undefined) return true;
                current = current[key];
            }
            return false;
        });
    }

    /**
     * Send update notifications
     * @private
     * @param {Object} client - Updated client
     * @param {Object} changes - Changes made
     * @param {string} userId - User who made changes
     */
    async #sendUpdateNotifications(client, changes, userId) {
        const significantFields = [
            'relationship.status',
            'relationship.tier',
            'relationship.accountManager',
            'contacts.primary'
        ];

        const significantChanges = Object.keys(changes).filter(field =>
            significantFields.includes(field)
        );

        if (significantChanges.length === 0) return;

        // Notify account manager
        if (client.relationship?.accountManager) {
            await this.#notificationService.send({
                type: 'client_updated',
                recipient: client.relationship.accountManager,
                data: {
                    clientCode: client.clientCode,
                    companyName: client.companyName,
                    changes: significantChanges,
                    updatedBy: userId
                }
            });
        }

        // Send email for tier changes
        if (changes['relationship.tier']) {
            await this.#sendTierChangeEmail(client, changes['relationship.tier'], userId);
        }
    }

    /**
     * Check deletion constraints
     * @private
     * @param {Object} client - Client to check
     */
    async #checkDeletionConstraints(client) {
        const constraints = [];

        // Check for active projects
        const activeProjects = await mongoose.model('Project').countDocuments({
            clientId: client._id,
            status: { $in: ['active', 'in_progress', 'planning'] }
        });

        if (activeProjects > 0) {
            constraints.push(`Client has ${activeProjects} active projects`);
        }

        // Check for pending invoices
        const pendingInvoices = await mongoose.model('Invoice').countDocuments({
            clientId: client._id,
            status: { $in: ['pending', 'sent', 'partial'] }
        });

        if (pendingInvoices > 0) {
            constraints.push(`Client has ${pendingInvoices} pending invoices`);
        }

        // Check for active contracts
        const activeContracts = await mongoose.model('Contract').countDocuments({
            clientId: client._id,
            status: 'active',
            endDate: { $gt: new Date() }
        });

        if (activeContracts > 0) {
            constraints.push(`Client has ${activeContracts} active contracts`);
        }

        if (constraints.length > 0) {
            throw new ForbiddenError(
                `Cannot delete client: ${constraints.join(', ')}`,
                'DELETION_CONSTRAINTS_VIOLATION'
            );
        }
    }

    /**
     * Perform hard delete with cascade
     * @private
     * @param {string} clientId - Client ID to delete
     * @param {Object} session - MongoDB session
     */
    async #performHardDelete(clientId, session) {
        // Delete related documents in order
        const deleteOperations = [
            () => ClientNoteModel.deleteMany({ clientId }, { session }),
            () => ClientDocumentModel.deleteMany({ clientId }, { session }),
            () => ClientContactModel.deleteMany({ clientId }, { session }),
            () => ClientModel.findByIdAndDelete(clientId, { session })
        ];

        for (const operation of deleteOperations) {
            await operation();
        }
    }

    /**
     * Archive client data
     * @private
     * @param {string} clientId - Client ID
     * @param {string} userId - User performing archive
     * @param {Object} session - MongoDB session
     */
    async #archiveClientData(clientId, userId, session) {
        const archiveData = {
            archivedAt: new Date(),
            archivedBy: userId,
            reason: 'client_deletion'
        };

        // Archive related documents
        await Promise.all([
            ClientNoteModel.updateMany(
                { clientId },
                { $set: { archiveStatus: archiveData } },
                { session }
            ),
            ClientDocumentModel.updateMany(
                { clientId },
                { $set: { archiveStatus: archiveData } },
                { session }
            ),
            ClientContactModel.updateMany(
                { clientId },
                { $set: { archiveStatus: archiveData } },
                { session }
            )
        ]);
    }

    /**
     * Send deletion notifications
     * @private
     * @param {Object} client - Deleted client
     * @param {string} userId - User who deleted
     * @param {string} reason - Deletion reason
     */
    async #sendDeletionNotifications(client, userId, reason) {
        // Notify account manager
        if (client.relationship?.accountManager) {
            await this.#notificationService.send({
                type: 'client_deleted',
                recipient: client.relationship.accountManager,
                data: {
                    clientCode: client.clientCode,
                    companyName: client.companyName,
                    deletedBy: userId,
                    reason
                }
            });
        }

        // Notify admin team
        await this.#notificationService.send({
            type: 'client_deleted_admin',
            recipient: 'admin_team',
            data: {
                clientCode: client.clientCode,
                companyName: client.companyName,
                deletedBy: userId,
                reason,
                totalRevenue: client.analytics?.lifetime?.totalRevenue || 0
            }
        });
    }

    /**
     * Send bulk creation notifications
     * @private
     * @param {Array} successful - Successfully created clients
     * @param {string} userId - User who performed bulk operation
     */
    async #sendBulkCreationNotifications(successful, userId) {
        if (successful.length === 0) return;

        await this.#notificationService.send({
            type: 'bulk_clients_created',
            recipient: userId,
            data: {
                count: successful.length,
                clients: successful.slice(0, 5), // Send first 5 as preview
                totalCount: successful.length
            }
        });

        // Notify admin if bulk operation is large
        if (successful.length > 50) {
            await this.#notificationService.send({
                type: 'large_bulk_operation',
                recipient: 'admin_team',
                data: {
                    operation: 'client_creation',
                    count: successful.length,
                    performedBy: userId
                }
            });
        }
    }

    /**
     * Calculate performance metrics
     * @private
     * @param {string} tenantId - Tenant ID
     * @param {Object} dateRange - Date range for calculations
     * @returns {Promise<Object>} Performance metrics
     */
    async #calculatePerformanceMetrics(tenantId, dateRange) {
        const { startDate, endDate } = dateRange;
        const query = { tenantId, isDeleted: false };

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const clients = await ClientModel.find(query);

        return {
            averageRevenue: clients.reduce((sum, c) => sum + (c.analytics?.lifetime?.totalRevenue || 0), 0) / clients.length || 0,
            averageHealthScore: clients.reduce((sum, c) => sum + (c.relationship?.healthScore?.score || 0), 0) / clients.length || 0,
            churnRate: clients.filter(c => c.relationship?.status === 'churned').length / clients.length || 0,
            conversionRate: clients.filter(c => c.relationship?.status === 'active').length / clients.length || 0,
            averageProjectsPerClient: clients.reduce((sum, c) => sum + (c.analytics?.lifetime?.totalProjects || 0), 0) / clients.length || 0
        };
    }

    /**
     * Generate predictions
     * @private
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object>} Predictions
     */
    async #generatePredictions(tenantId) {
        // Simple prediction algorithms - in practice, this would use ML models
        const recentClients = await ClientModel.find({
            tenantId,
            isDeleted: false,
            createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
        });

        const churnRiskClients = await ClientModel.find({
            tenantId,
            'relationship.churnRisk.level': { $in: ['high', 'critical'] },
            isDeleted: false
        });

        return {
            projectedChurn: {
                next30Days: churnRiskClients.filter(c => c.relationship.churnRisk.level === 'critical').length,
                next90Days: churnRiskClients.length,
                confidence: 0.75
            },
            growthForecast: {
                newClientsNext30Days: Math.round(recentClients.length / 3),
                revenueGrowthRate: 0.15,
                confidence: 0.68
            }
        };
    }

    /**
     * Generate recommendations
     * @private
     * @param {Object} stats - Current statistics
     * @returns {Array} Recommendations
     */
    async #generateRecommendations(stats) {
        const recommendations = [];

        if (stats.churnRate > 0.1) {
            recommendations.push({
                type: 'churn_reduction',
                priority: 'high',
                title: 'High Churn Rate Detected',
                description: 'Your churn rate is above 10%. Consider implementing retention strategies.',
                action: 'Review churn risk clients and implement retention campaigns'
            });
        }

        if (stats.averageHealthScore < 70) {
            recommendations.push({
                type: 'health_improvement',
                priority: 'medium',
                title: 'Low Average Health Score',
                description: 'Client health scores are below optimal levels.',
                action: 'Focus on improving client satisfaction and engagement'
            });
        }

        if (stats.conversionRate < 0.3) {
            recommendations.push({
                type: 'conversion_optimization',
                priority: 'medium',
                title: 'Low Conversion Rate',
                description: 'Many prospects are not converting to active clients.',
                action: 'Review and optimize your sales funnel process'
            });
        }

        return recommendations;
    }

    /**
     * Select specific fields from object
     * @private
     * @param {Object} obj - Source object
     * @param {Array} fields - Fields to select
     * @returns {Object} Object with selected fields
     */
    #selectFields(obj, fields) {
        const result = {};
        for (const field of fields) {
            if (field.includes('.')) {
                const keys = field.split('.');
                let value = obj;
                for (const key of keys) {
                    value = value?.[key];
                    if (value === undefined) break;
                }
                result[field.replace(/\./g, '_')] = value;
            } else {
                result[field] = obj[field];
            }
        }
        return result;
    }

    /**
     * Parse CSV import data
     * @private
     * @param {Buffer} fileBuffer - CSV file buffer
     * @returns {Promise<Array>} Parsed data
     */
    async #parseCSVImport(fileBuffer) {
        const csvData = fileBuffer.toString('utf8');
        const records = csv.parse(csvData, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        return records.map(record => {
            // Clean up field names and values
            const cleaned = {};
            for (const [key, value] of Object.entries(record)) {
                const cleanKey = key.trim().replace(/\s+/g, '_').toLowerCase();
                cleaned[cleanKey] = value?.trim();
            }
            return cleaned;
        });
    }

    /**
     * Parse Excel import data
     * @private
     * @param {Buffer} fileBuffer - Excel file buffer
     * @returns {Promise<Array>} Parsed data
     */
    async #parseExcelImport(fileBuffer) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer);

        const worksheet = workbook.getWorksheet(1);
        const data = [];
        const headers = [];

        worksheet.eachRow((row, rowIndex) => {
            if (rowIndex === 1) {
                // Header row
                row.eachCell((cell) => {
                    headers.push(cell.value?.toString().trim().replace(/\s+/g, '_').toLowerCase());
                });
            } else {
                // Data row
                const rowData = {};
                row.eachCell((cell, colIndex) => {
                    const header = headers[colIndex - 1];
                    if (header) {
                        rowData[header] = cell.value?.toString().trim();
                    }
                });
                data.push(rowData);
            }
        });

        return data;
    }

    /**
     * Apply field mapping to imported data
     * @private
     * @param {Object} row - Data row
     * @param {Object} mapping - Field mapping
     * @returns {Object} Mapped row
     */
    #applyFieldMapping(row, mapping) {
        const mapped = {};

        for (const [sourceField, targetField] of Object.entries(mapping)) {
            if (row[sourceField] !== undefined) {
                // Handle nested field mapping
                if (targetField.includes('.')) {
                    const keys = targetField.split('.');
                    let current = mapped;
                    for (let i = 0; i < keys.length - 1; i++) {
                        if (!current[keys[i]]) current[keys[i]] = {};
                        current = current[keys[i]];
                    }
                    current[keys[keys.length - 1]] = row[sourceField];
                } else {
                    mapped[targetField] = row[sourceField];
                }
            }
        }

        // Copy unmapped fields
        for (const [key, value] of Object.entries(row)) {
            if (!mapping[key] && !mapped[key]) {
                mapped[key] = value;
            }
        }

        return mapped;
    }

    // ==================== Additional Helper Methods ====================

    /**
     * Calculate revenue growth rate
     * @private
     */
    async #calculateRevenueGrowthRate(clientId) {
        // Implementation would calculate growth rate based on historical data
        return 0.15; // Placeholder
    }

    /**
     * Calculate engagement score
     * @private
     */
    async #calculateEngagementScore(clientId) {
        // Implementation would calculate engagement based on interactions
        return 75; // Placeholder
    }

    /**
     * Calculate project completion rate
     * @private
     */
    async #calculateProjectCompletionRate(clientId) {
        // Implementation would calculate completion rate
        return 0.85; // Placeholder
    }

    /**
     * Get valid status transitions
     * @private
     */
    #getValidStatusTransitions(currentStatus) {
        const transitions = {
            prospect: ['active', 'inactive', 'churned'],
            active: ['inactive', 'churned'],
            inactive: ['active', 'churned'],
            churned: ['prospect'] // Allow reactivation
        };

        return transitions[currentStatus] || [];
    }

    /**
     * Map status to lifecycle stage
     * @private
     */
    #mapStatusToLifecycleStage(status) {
        const mapping = {
            prospect: 'prospect',
            active: 'customer',
            inactive: 'at_risk',
            churned: 'churned'
        };

        return mapping[status] || 'unknown';
    }

    /**
     * Trigger churn analysis
     * @private
     */
    async #triggerChurnAnalysis(clientId, userId) {
        // Implementation would trigger ML analysis of churn factors
        logger.info('Churn analysis triggered', { clientId, userId });
    }

    /**
     * Send status change notifications
     * @private
     */
    async #sendStatusChangeNotifications(client, oldStatus, newStatus, userId) {
        await this.#notificationService.send({
            type: 'client_status_changed',
            recipient: client.relationship?.accountManager,
            data: {
                clientCode: client.clientCode,
                companyName: client.companyName,
                oldStatus,
                newStatus,
                changedBy: userId
            }
        });
    }

    /**
     * Send tier change email
     * @private
     */
    async #sendTierChangeEmail(client, tierChange, userId) {
        if (client.contacts?.primary?.email) {
            await this.#emailService.sendTemplate('client-tier-change', {
                to: client.contacts.primary.email,
                data: {
                    companyName: client.companyName,
                    oldTier: tierChange.old,
                    newTier: tierChange.new,
                    benefits: this.#tierLimits[tierChange.new]
                }
            });
        }
    }

    /**
     * Get exportable fields
     * @private
     */
    #getExportableFields(client) {
        return {
            clientCode: client.clientCode,
            companyName: client.companyName,
            legalName: client.legalName,
            status: client.relationship?.status,
            tier: client.relationship?.tier,
            industry: client.industry?.primary?.sector,
            country: client.addresses?.headquarters?.country,
            city: client.addresses?.headquarters?.city,
            primaryContact: client.contacts?.primary?.name,
            primaryEmail: client.contacts?.primary?.email,
            primaryPhone: client.contacts?.primary?.phone,
            accountManager: client.relationship?.accountManager,
            totalRevenue: client.analytics?.lifetime?.totalRevenue,
            activeProjects: client.analytics?.current?.activeProjects,
            healthScore: client.relationship?.healthScore?.score,
            churnRisk: client.relationship?.churnRisk?.level,
            createdAt: client.createdAt
        };
    }
}

module.exports = ClientService;