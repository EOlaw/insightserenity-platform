/**
 * @fileoverview Client Management Service
 * @module servers/customer-services/modules/core-business/client-management/services/client-service
 * @description Comprehensive service for managing client operations including CRUD, relationships, and analytics
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-service'
});
const validator = require('validator');
const crypto = require('crypto');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Client Status Constants
 */
const CLIENT_STATUS = {
    PROSPECT: 'prospect',
    LEAD: 'lead',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    CHURNED: 'churned',
    BLACKLISTED: 'blacklisted'
};

/**
 * Client Tier Constants
 */
const CLIENT_TIER = {
    STRATEGIC: 'strategic',
    ENTERPRISE: 'enterprise',
    MID_MARKET: 'mid_market',
    SMALL_BUSINESS: 'small_business',
    STARTUP: 'startup'
};

/**
 * Client Management Service
 * @class ClientService
 */
class ClientService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            autoGenerateClientCode: process.env.AUTO_GENERATE_CLIENT_CODE !== 'false',
            enableHealthScoreCalculation: process.env.ENABLE_HEALTH_SCORE !== 'false',
            requireApprovalForTierChange: process.env.REQUIRE_TIER_APPROVAL === 'true',
            maxSubsidiaries: parseInt(process.env.MAX_SUBSIDIARIES, 10) || 50,
            defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD'
        };
    }

    /**
     * Get database service instance
     * @private
     * @returns {Object} Database service
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database;
        }
        return this._dbService;
    }

    // ============= CLIENT CREATION & REGISTRATION =============

    /**
     * Create a new client
     * @param {Object} clientData - Client information
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created client
     */
    async createClient(clientData, options = {}) {
        try {
            logger.info('Starting client creation', {
                companyName: clientData.companyName,
                tenantId: options.tenantId
            });

            // Validate client data
            await this._validateClientData(clientData);

            // Check for duplicate clients
            await this._checkDuplicateClient(clientData);

            // Generate client code if not provided
            if (!clientData.clientCode && this.config.autoGenerateClientCode) {
                clientData.clientCode = await this._generateClientCode(clientData);
            }

            // Set default values
            clientData.tenantId = options.tenantId || this.config.companyTenantId;
            clientData.organizationId = options.organizationId || clientData.organizationId;
            
            // Initialize relationship data
            if (!clientData.relationship) {
                clientData.relationship = {};
            }
            clientData.relationship.status = clientData.relationship.status || CLIENT_STATUS.PROSPECT;
            clientData.relationship.tier = clientData.relationship.tier || CLIENT_TIER.SMALL_BUSINESS;
            clientData.relationship.acquisitionDate = new Date();

            // Initialize analytics
            clientData.analytics = {
                lifetime: {
                    totalRevenue: 0,
                    totalProjects: 0,
                    totalEngagements: 0
                },
                engagement: {
                    lastActivityDate: new Date(),
                    totalInteractions: 0
                }
            };

            const dbService = this._getDatabaseService();
            const Client = await dbService.getModel('Client', 'customer');

            // Create client
            const newClient = new Client(clientData);
            await newClient.save();

            logger.info('Client created successfully', {
                clientId: newClient._id,
                clientCode: newClient.clientCode,
                companyName: newClient.companyName
            });

            // Post-creation activities
            await this._handlePostClientCreation(newClient, options);

            return this._sanitizeClientOutput(newClient);

        } catch (error) {
            logger.error('Client creation failed', {
                error: error.message,
                stack: error.stack,
                companyName: clientData?.companyName
            });
            throw error;
        }
    }

    /**
     * Get client by ID
     * @param {string} clientId - Client ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Client data
     */
    async getClientById(clientId, options = {}) {
        try {
            logger.info('Fetching client by ID', { clientId });

            const dbService = this._getDatabaseService();
            const Client = await dbService.getModel('Client', 'customer');

            let query = Client.findById(clientId);

            // Apply population if requested
            if (options.populate) {
                const populateFields = [
                    'relationship.accountManager',
                    'relationship.salesRep',
                    'relationship.customerSuccessManager',
                    'parentClientId',
                    'subsidiaries.clientId'
                ];
                query = query.populate(populateFields.join(' '));
            }

            const client = await query.exec();

            if (!client) {
                throw AppError.notFound('Client not found', {
                    context: { clientId }
                });
            }

            // Check tenant access
            if (options.tenantId && client.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this client');
            }

            return this._sanitizeClientOutput(client);

        } catch (error) {
            logger.error('Failed to fetch client', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Get client by client code
     * @param {string} clientCode - Client code
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Client data
     */
    async getClientByCode(clientCode, options = {}) {
        try {
            logger.info('Fetching client by code', { clientCode });

            const dbService = this._getDatabaseService();
            const Client = await dbService.getModel('Client', 'customer');

            const query = {
                clientCode: clientCode.toUpperCase(),
                tenantId: options.tenantId || this.config.companyTenantId
            };

            let clientQuery = Client.findOne(query);

            if (options.populate) {
                clientQuery = clientQuery.populate('relationship.accountManager relationship.salesRep');
            }

            const client = await clientQuery.exec();

            if (!client) {
                throw AppError.notFound('Client not found', {
                    context: { clientCode }
                });
            }

            return this._sanitizeClientOutput(client);

        } catch (error) {
            logger.error('Failed to fetch client by code', {
                error: error.message,
                clientCode
            });
            throw error;
        }
    }

    /**
     * Update client information
     * @param {string} clientId - Client ID
     * @param {Object} updateData - Data to update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated client
     */
    async updateClient(clientId, updateData, options = {}) {
        try {
            logger.info('Updating client', {
                clientId,
                updateFields: Object.keys(updateData)
            });

            // Validate update data
            await this._validateClientUpdateData(updateData);

            // Get existing client
            const client = await this.getClientById(clientId, { tenantId: options.tenantId });

            const dbService = this._getDatabaseService();
            const Client = await dbService.getModel('Client', 'customer');

            // Check for tier change approval requirement
            if (updateData.relationship?.tier && 
                updateData.relationship.tier !== client.relationship.tier &&
                this.config.requireApprovalForTierChange) {
                await this._requestTierChangeApproval(clientId, updateData.relationship.tier, options);
            }

            // Prepare update
            const update = {
                ...updateData,
                'metadata.updatedBy': options.userId,
                'metadata.lastModified': new Date()
            };

            // Perform update
            const updatedClient = await Client.findByIdAndUpdate(
                clientId,
                { $set: update },
                { new: true, runValidators: true }
            );

            if (!updatedClient) {
                throw AppError.notFound('Client not found for update');
            }

            logger.info('Client updated successfully', {
                clientId,
                clientCode: updatedClient.clientCode
            });

            // Track update event
            await this._trackClientEvent(updatedClient, 'client_updated', {
                updatedFields: Object.keys(updateData),
                userId: options.userId
            });

            return this._sanitizeClientOutput(updatedClient);

        } catch (error) {
            logger.error('Client update failed', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Delete/deactivate client
     * @param {string} clientId - Client ID
     * @param {Object} options - Deletion options
     * @returns {Promise<Object>} Deletion result
     */
    async deleteClient(clientId, options = {}) {
        try {
            logger.info('Deleting client', { clientId, softDelete: options.softDelete });

            const client = await this.getClientById(clientId, { tenantId: options.tenantId });

            const dbService = this._getDatabaseService();
            const Client = await dbService.getModel('Client', 'customer');

            let result;

            if (options.softDelete !== false) {
                // Soft delete - mark as inactive
                result = await Client.findByIdAndUpdate(
                    clientId,
                    {
                        $set: {
                            'relationship.status': CLIENT_STATUS.INACTIVE,
                            'metadata.deletedAt': new Date(),
                            'metadata.deletedBy': options.userId,
                            'metadata.isDeleted': true
                        }
                    },
                    { new: true }
                );
            } else {
                // Hard delete - only if authorized
                if (!options.forceDelete) {
                    throw AppError.forbidden('Hard delete requires force flag');
                }
                result = await Client.findByIdAndDelete(clientId);
            }

            logger.info('Client deleted successfully', {
                clientId,
                softDelete: options.softDelete !== false
            });

            // Track deletion event
            await this._trackClientEvent(client, 'client_deleted', {
                softDelete: options.softDelete !== false,
                userId: options.userId
            });

            return {
                success: true,
                clientId,
                deletionType: options.softDelete !== false ? 'soft' : 'hard'
            };

        } catch (error) {
            logger.error('Client deletion failed', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Search clients with filters
     * @param {Object} filters - Search filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Search results
     */
    async searchClients(filters = {}, options = {}) {
        try {
            logger.info('Searching clients', { filters });

            const dbService = this._getDatabaseService();
            const Client = await dbService.getModel('Client', 'customer');

            // Build query
            const query = {
                tenantId: options.tenantId || this.config.companyTenantId,
                'metadata.isDeleted': { $ne: true }
            };

            // Apply filters
            if (filters.status) {
                query['relationship.status'] = filters.status;
            }

            if (filters.tier) {
                query['relationship.tier'] = filters.tier;
            }

            if (filters.accountManager) {
                query['relationship.accountManager'] = filters.accountManager;
            }

            if (filters.industry) {
                query['industry.primary.sector'] = filters.industry;
            }

            if (filters.search) {
                query.$or = [
                    { companyName: { $regex: filters.search, $options: 'i' } },
                    { clientCode: { $regex: filters.search, $options: 'i' } },
                    { 'contact.primaryEmail': { $regex: filters.search, $options: 'i' } }
                ];
            }

            if (filters.revenueMin || filters.revenueMax) {
                query['analytics.lifetime.totalRevenue'] = {};
                if (filters.revenueMin) query['analytics.lifetime.totalRevenue'].$gte = filters.revenueMin;
                if (filters.revenueMax) query['analytics.lifetime.totalRevenue'].$lte = filters.revenueMax;
            }

            // Pagination
            const page = parseInt(options.page, 10) || 1;
            const limit = parseInt(options.limit, 10) || 20;
            const skip = (page - 1) * limit;

            // Sorting
            const sortField = options.sortBy || 'createdAt';
            const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
            const sort = { [sortField]: sortOrder };

            // Execute query
            const [clients, total] = await Promise.all([
                Client.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .populate('relationship.accountManager', 'firstName lastName email')
                    .lean()
                    .exec(),
                Client.countDocuments(query)
            ]);

            logger.info('Client search completed', {
                total,
                returned: clients.length,
                page
            });

            return {
                clients: clients.map(c => this._sanitizeClientOutput(c)),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };

        } catch (error) {
            logger.error('Client search failed', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    /**
     * Get client statistics
     * @param {Object} filters - Optional filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Client statistics
     */
    async getClientStatistics(filters = {}, options = {}) {
        try {
            logger.info('Fetching client statistics');

            const dbService = this._getDatabaseService();
            const Client = await dbService.getModel('Client', 'customer');

            const query = {
                tenantId: options.tenantId || this.config.companyTenantId,
                'metadata.isDeleted': { $ne: true }
            };

            // Apply optional filters
            if (filters.dateFrom) {
                query.createdAt = { $gte: new Date(filters.dateFrom) };
            }
            if (filters.dateTo) {
                query.createdAt = query.createdAt || {};
                query.createdAt.$lte = new Date(filters.dateTo);
            }

            const stats = await Client.aggregate([
                { $match: query },
                {
                    $facet: {
                        overview: [
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: 1 },
                                    active: {
                                        $sum: { $cond: [{ $eq: ['$relationship.status', 'active'] }, 1, 0] }
                                    },
                                    prospects: {
                                        $sum: { $cond: [{ $eq: ['$relationship.status', 'prospect'] }, 1, 0] }
                                    },
                                    churned: {
                                        $sum: { $cond: [{ $eq: ['$relationship.status', 'churned'] }, 1, 0] }
                                    },
                                    totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' },
                                    avgRevenue: { $avg: '$analytics.lifetime.totalRevenue' }
                                }
                            }
                        ],
                        byTier: [
                            {
                                $group: {
                                    _id: '$relationship.tier',
                                    count: { $sum: 1 },
                                    revenue: { $sum: '$analytics.lifetime.totalRevenue' }
                                }
                            }
                        ],
                        byStatus: [
                            {
                                $group: {
                                    _id: '$relationship.status',
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        topClients: [
                            { $sort: { 'analytics.lifetime.totalRevenue': -1 } },
                            { $limit: 10 },
                            {
                                $project: {
                                    clientCode: 1,
                                    companyName: 1,
                                    revenue: '$analytics.lifetime.totalRevenue',
                                    tier: '$relationship.tier'
                                }
                            }
                        ]
                    }
                }
            ]);

            const result = stats[0];

            return {
                overview: result.overview[0] || {
                    total: 0,
                    active: 0,
                    prospects: 0,
                    churned: 0,
                    totalRevenue: 0,
                    avgRevenue: 0
                },
                distribution: {
                    byTier: result.byTier,
                    byStatus: result.byStatus
                },
                insights: {
                    topClients: result.topClients
                }
            };

        } catch (error) {
            logger.error('Failed to fetch client statistics', {
                error: error.message
            });
            throw error;
        }
    }

    // ============= VALIDATION METHODS =============

    /**
     * Validate client data
     * @private
     */
    async _validateClientData(clientData) {
        const errors = [];

        // Required fields
        if (!clientData.companyName || clientData.companyName.trim().length === 0) {
            errors.push({ field: 'companyName', message: 'Company name is required' });
        }

        if (clientData.companyName && clientData.companyName.length > 200) {
            errors.push({ field: 'companyName', message: 'Company name too long' });
        }

        // Email validation
        if (clientData.contact?.primaryEmail) {
            if (!validator.isEmail(clientData.contact.primaryEmail)) {
                errors.push({ field: 'contact.primaryEmail', message: 'Invalid email address' });
            }
        }

        // Phone validation
        if (clientData.contact?.primaryPhone) {
            if (!validator.isMobilePhone(clientData.contact.primaryPhone, 'any', { strictMode: false })) {
                errors.push({ field: 'contact.primaryPhone', message: 'Invalid phone number' });
            }
        }

        // Website validation
        if (clientData.contact?.website) {
            if (!validator.isURL(clientData.contact.website)) {
                errors.push({ field: 'contact.website', message: 'Invalid website URL' });
            }
        }

        // Business registration number validation
        if (clientData.businessDetails?.registrationNumber) {
            if (clientData.businessDetails.registrationNumber.length > 50) {
                errors.push({ field: 'businessDetails.registrationNumber', message: 'Registration number too long' });
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Client validation failed', { errors });
        }
    }

    /**
     * Validate client update data
     * @private
     */
    async _validateClientUpdateData(updateData) {
        const errors = [];

        // Cannot update immutable fields
        const immutableFields = ['clientCode', 'tenantId', 'createdAt'];
        for (const field of immutableFields) {
            if (updateData[field] !== undefined) {
                errors.push({ field, message: `${field} cannot be updated` });
            }
        }

        // Validate email if provided
        if (updateData.contact?.primaryEmail) {
            if (!validator.isEmail(updateData.contact.primaryEmail)) {
                errors.push({ field: 'contact.primaryEmail', message: 'Invalid email address' });
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Client update validation failed', { errors });
        }
    }

    /**
     * Check for duplicate client
     * @private
     */
    async _checkDuplicateClient(clientData) {
        const dbService = this._getDatabaseService();
        const Client = await dbService.getModel('Client', 'customer');

        const duplicateQuery = {
            tenantId: clientData.tenantId,
            $or: []
        };

        if (clientData.companyName) {
            duplicateQuery.$or.push({ companyName: { $regex: `^${clientData.companyName}$`, $options: 'i' } });
        }

        if (clientData.businessDetails?.registrationNumber) {
            duplicateQuery.$or.push({
                'businessDetails.registrationNumber': clientData.businessDetails.registrationNumber
            });
        }

        if (duplicateQuery.$or.length > 0) {
            const existing = await Client.findOne(duplicateQuery);
            if (existing) {
                throw AppError.conflict('Client already exists', {
                    context: {
                        existingClientCode: existing.clientCode,
                        companyName: existing.companyName
                    }
                });
            }
        }
    }

    // ============= HELPER METHODS =============

    /**
     * Generate unique client code
     * @private
     */
    async _generateClientCode(clientData) {
        const prefix = 'CLT';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        
        const code = `${prefix}-${timestamp}-${random}`;

        // Verify uniqueness
        const dbService = this._getDatabaseService();
        const Client = await dbService.getModel('Client', 'customer');
        const existing = await Client.findOne({ clientCode: code });

        if (existing) {
            // Retry with new random component
            return this._generateClientCode(clientData);
        }

        return code;
    }

    /**
     * Handle post-client creation activities
     * @private
     */
    async _handlePostClientCreation(client, options) {
        try {
            // Send welcome notification
            await this._sendClientWelcomeNotification(client);

            // Track creation event
            await this._trackClientEvent(client, 'client_created', {
                userId: options.userId,
                source: options.source || 'direct'
            });

            // Initialize health score calculation
            if (this.config.enableHealthScoreCalculation) {
                await this._calculateHealthScore(client._id);
            }

        } catch (error) {
            logger.error('Post-client creation activities failed (non-blocking)', {
                error: error.message,
                clientId: client._id
            });
        }
    }

    /**
     * Send client welcome notification
     * @private
     */
    async _sendClientWelcomeNotification(client) {
        try {
            if (typeof this.notificationService.sendNotification === 'function') {
                await this.notificationService.sendNotification({
                    type: 'client_welcome',
                    recipient: client.contact?.primaryEmail,
                    data: {
                        companyName: client.companyName,
                        clientCode: client.clientCode
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send welcome notification', { error: error.message });
        }
    }

    /**
     * Track client event
     * @private
     */
    async _trackClientEvent(client, eventType, data) {
        try {
            if (typeof this.analyticsService.trackEvent === 'function') {
                await this.analyticsService.trackEvent({
                    type: eventType,
                    clientId: client._id || client.id,
                    clientCode: client.clientCode,
                    data: data
                });
            }
        } catch (error) {
            logger.error('Failed to track client event', { error: error.message });
        }
    }

    /**
     * Calculate client health score
     * @private
     */
    async _calculateHealthScore(clientId) {
        try {
            // Placeholder for health score calculation logic
            logger.info('Health score calculation triggered', { clientId });
        } catch (error) {
            logger.error('Health score calculation failed', { error: error.message });
        }
    }

    /**
     * Request tier change approval
     * @private
     */
    async _requestTierChangeApproval(clientId, newTier, options) {
        logger.info('Tier change approval requested', {
            clientId,
            newTier,
            requestedBy: options.userId
        });
        // Placeholder for approval workflow
    }

    /**
     * Sanitize client output
     * @private
     */
    _sanitizeClientOutput(client) {
        if (!client) return null;

        const clientObject = client.toObject ? client.toObject() : client;

        // Remove sensitive fields
        delete clientObject.__v;
        delete clientObject.metadata?.deletedAt;
        delete clientObject.metadata?.deletedBy;

        return clientObject;
    }
}

module.exports = new ClientService();